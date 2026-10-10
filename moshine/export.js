// export.js — streamed export (spec §8.3): one clip through a Mosh Loop (M4) or a whole sequence (M5). Renders
// sequentially from the first frame of the range (never the preview path or a cache), encodes with WebCodecs through
// Mediabunny, muxes MP4 or WebM straight into a writable file: the save picker's file on Chrome/Edge, otherwise an OPFS file that is then handed to the user. Memory stays
// flat: every decoded sample and every encoded frame is closed as soon as it is used, and the encoder's queue
// applies back-pressure through `await source.add()`.
import { createImage, createPresenter, F16 } from './gpu.js';
import { createMoshLoop } from './engine.js';
import { createIngest, mb } from './media.js';
import { CODECS, AUDIO_OK, exportPlan } from './governor.js';
import { createSequenceRenderer } from './render.js';
import { mixBlock, audibleClips } from './mix.js';
import { createStretcher } from './stretch.js';
import { createAudioDecoder } from './media.js';

export const QUALITIES = ['very-low', 'low', 'medium', 'high', 'very-high'];
const isSafari = () => /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

/** Codecs this browser can encode for a container at a size, in preference order. */
export async function encodableCodecs(container, w, h) {
  const M = await mb(), out = [];
  for (const c of CODECS[container]) { try { if (await M.canEncodeVideo(c, { width: w, height: h })) out.push(c); } catch (e) {} }
  return out;
}

/** Open a writable for the export: the save picker (when asked and available) or an OPFS file. */
export async function openTarget(name, container, where = 'auto') {
  if ((where === 'auto' || where === 'picker') && window.showSaveFilePicker) {
    try {
      const fh = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: container.toUpperCase(), accept: { [container === 'mp4' ? 'video/mp4' : 'video/webm']: ['.' + container] } }] });
      return { kind: 'picker', name: fh.name, writable: await fh.createWritable(), file: () => fh.getFile() };
    } catch (e) { if (e.name === 'AbortError') throw e; if (where === 'picker') throw e; }
  }
  const root = await navigator.storage.getDirectory(), dir = await root.getDirectoryHandle('moshine-exports', { create: true }), fh = await dir.getFileHandle(name, { create: true });
  return { kind: 'opfs', name, writable: await fh.createWritable(), file: () => fh.getFile(), remove: () => dir.removeEntry(name) };
}

/**
 * The shared encode path: a Mediabunny output streamed into the target, a video source fed from a canvas, and
 * optionally the source's audio packets passed through for [aStart, aEnd) seconds of the source, re-timed to start
 * at 0 and kept interleaved with the video, or (M7) a mix: `mix` = { codec, sampleRate, nch, total, block(s0, s1) ->
 * Float32Array[] } encoded in blocks a second at a time, never more than a block ahead of the video.
 * Returns { add(canvas, ts, dur), finish(), cancel(), codec, audio }.
 */
async function createEncoder({ w, h, fps, container = 'mp4', codec, quality, target, audio = null, mix = null }) {
  const M = await mb();
  codec = codec || (await encodableCodecs(container, w, h))[0];
  if (!codec) throw new Error(`this browser cannot encode ${container.toUpperCase()} at ${w}×${h}`);
  const output = new M.Output({ format: container === 'mp4' ? new M.Mp4OutputFormat({ fastStart: false }) : new M.WebMOutputFormat(), target: new M.StreamTarget(target.writable) });
  const vsrc = new M.VideoSampleSource({ codec, bitrate: M['QUALITY_' + (quality || 'high').toUpperCase().replace('-', '_')] || M.QUALITY_HIGH, keyFrameInterval: 2,
    latencyMode: isSafari() && codec === 'avc' ? 'realtime' : 'quality' });       // Safari 27.0 deadlocks H.264 in 'quality' (research §H.1)
  output.addVideoTrack(vsrc, { frameRate: fps });
  // audio: pass the source's packets through when the container takes the codec and timing is unchanged
  let asrc = null, apk = null, aFirst = true, aEnd = false, queued = null;
  if (audio && AUDIO_OK[container].includes(audio.codec)) {
    asrc = new M.EncodedAudioPacketSource(audio.codec); output.addAudioTrack(asrc);
    apk = new M.EncodedPacketSink(audio.track).packets()[Symbol.asyncIterator]();
  }
  // mix: our own WebCodecs encoder, its packets shifted back by the encoder delay so the muxer writes the edit list
  // that hides the priming samples (Mediabunny only writes one for a negative first timestamp; see encoderDelay)
  let done = 0, aenc = null, aerr = null, shift = 0, firstMix = true; const ready = [];
  if (!asrc && mix) {
    shift = (await encoderDelay(mix.codec, mix.sampleRate, mix.nch)) / mix.sampleRate;
    asrc = new M.EncodedAudioPacketSource(mix.codec); output.addAudioTrack(asrc);
    aenc = new AudioEncoder({ output: (chunk, meta) => ready.push([chunk, meta]), error: (e) => { aerr = e; } });
    aenc.configure({ codec: WC_AUDIO[mix.codec], sampleRate: mix.sampleRate, numberOfChannels: mix.nch, bitrate: mix.bitrate || 192000 });
  }
  const drain = async () => {
    if (aerr) throw aerr;
    while (ready.length) {
      const [chunk, meta] = ready.shift(), pk = M.EncodedPacket.fromEncodedChunk(chunk);
      await asrc.add(pk.clone({ timestamp: pk.timestamp - shift }), firstMix ? { decoderConfig: cleanAudioConfig(meta?.decoderConfig) } : undefined); firstMix = false;
    }
  };
  const feedMix = async (until) => {
    const { sampleRate: sr, nch, total } = mix, B = sr, stop = Math.min(total, Math.ceil(until * sr));
    while (done < stop) {
      const n = Math.min(B, total - done), ch = await mix.block(done, done + n), data = new Float32Array(n * nch);
      for (let c = 0; c < nch; c++) { const x = ch[c], o = c * n; for (let i = 0; i < n; i++) { const v = x[i]; data[o + i] = v > 1 ? 1 : v < -1 ? -1 : v; } }
      const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: nch, timestamp: Math.round((done / sr) * 1e6), data });
      aenc.encode(ad); ad.close(); done += n;
      await drain();
    }
  };
  const feed = async (until) => {                        // keep audio interleaved with video, never far ahead
    if (mix && asrc && !apk) return feedMix(until);
    while (asrc && !aEnd) {
      const pk = queued || (await apk.next()).value; queued = null;
      if (!pk) { aEnd = true; break; }
      if (pk.timestamp < audio.start) continue;
      if (pk.timestamp >= audio.end) { aEnd = true; break; }
      if (pk.timestamp - audio.start > until) { queued = pk; break; }
      await asrc.add(pk.clone({ timestamp: pk.timestamp - audio.start }), aFirst ? { decoderConfig: await audio.track.getDecoderConfig() } : undefined); aFirst = false;
    }
  };
  await output.start();
  return {
    codec, audio: asrc ? (apk ? audio.codec : mix.codec) : null,
    async add(canvas, ts, dur) {
      const vf = new VideoFrame(canvas, { timestamp: Math.round(ts * 1e6), duration: Math.round(dur * 1e6) }), out = new M.VideoSample(vf);
      await feed(ts + dur); await vsrc.add(out); out.close(); vf.close();
    },
    async finish() { await feed(Infinity); if (aenc) { await aenc.flush(); await drain(); aenc.close(); } vsrc.close(); asrc?.close(); await output.finalize(); },
    async cancel() { try { aenc?.close(); } catch (e) {} await output.cancel().catch(() => {}); try { await target.writable.abort?.(); } catch (e) {} },
  };
}
const progress = (o, t, frames, t0, state) => {
  const now = performance.now();
  if (now - state.last > 250 || t === frames) { state.last = now; const fps = t / ((now - t0) / 1000); o.onProgress?.({ frame: t, frames, fps, eta: (frames - t) / Math.max(fps, 1e-3) }); }
};

/**
 * Export a video through a Mosh Loop config (M4: one clip).
 * o: { gpu, video (media.openVideo), cfg, w, h, container 'mp4'|'webm', codec?, quality, audio (bool), range { start, end } (s),
 *      target (from openTarget), onProgress({ frame, frames, fps, eta }), onFrame(t, displayTexture)?, signal }
 * Returns { frames, seconds, codec, audio, file() }.
 */
export async function exportVideo(o) {
  const { gpu, video, w, h, signal } = o, t0 = performance.now();
  const plan = exportPlan({ duration: video.duration, fps: video.fps }, o.range);
  const enc = await createEncoder({ w, h, fps: video.fps, container: o.container, codec: o.codec, quality: o.quality, target: o.target,
    audio: o.audio && video.audio ? { track: video.audio.track, codec: video.audio.codec, start: plan.start, end: plan.end } : null });
  const loop = createMoshLoop(gpu, { w, h }, o.cfg), ingest = createIngest(gpu), src = createImage(gpu, w, h, F16, 'export source');
  const canvas = new OffscreenCanvas(w, h), present = createPresenter(gpu, canvas), st = { last: t0 };
  let t = 0;
  try {
    loop.begin(0);
    for await (const sample of video.samples(video.start + plan.start, video.start + plan.end)) {
      if (signal?.aborted) { sample.close(); throw new DOMException('export cancelled', 'AbortError'); }
      const frame = sample.toVideoFrame(), ts = sample.timestamp - video.start - plan.start, dur = sample.duration || 1 / video.fps;
      ingest.ingest(frame, src); frame.close(); sample.close();
      const r = loop.step(t, { src });
      present.draw(r.display); o.onFrame?.(t, r.display);
      await enc.add(canvas, ts, dur);
      t++; progress(o, t, plan.frames, t0, st);
    }
    await enc.finish();
  } catch (e) { await enc.cancel(); throw e; }
  finally { loop.destroy(); ingest.destroy(); src.destroy(); }
  return { frames: t, seconds: (performance.now() - t0) / 1000, codec: enc.codec, audio: enc.audio, file: o.target.file };
}

/**
 * What a sequence export does with sound for a range (M7). The sound is the audible audio clips' mix (mix.js, the same
 * one playback hears). One untouched audio clip — unit gain, no stretch, covering the range, its media at the sequence
 * frame rate — is passed through as packets (exact and cheap); anything else is mixed and encoded.
 * Returns { mode: 'pass', mediaId, start, end (source s) } | { mode: 'mix', clips } | { mode: null, reason }.
 */
export function audioPlan(project, range, sequenceId) {
  const seq = project.sequences.find((s) => s.id === (sequenceId || project.activeSequence)), tb = seq.timebase;
  const ks = audibleClips(seq).filter((k) => k.range.in < range.out && k.range.out > range.in && project.media.find((m) => m.id === k.mediaId)?.hasAudio);
  if (!ks.length) return { mode: null, reason: 'no audible audio clip in the range' };
  if (ks.length === 1) {
    const k = ks[0], m = project.media.find((x) => x.id === k.mediaId), g = k.gain ?? 1;
    const unit = typeof g === 'number' ? g === 1 : g.value === 1 && !(g.keys?.length) && !(g.mod?.length);
    const sameRate = m.fps && m.fps.num * tb.den === tb.num * m.fps.den;
    if (unit && !k.stretch?.length && k.range.in <= range.in && k.range.out >= range.out && sameRate) {
      const s = (f) => (f * tb.den) / tb.num, first = k.sourceIn + (range.in - k.range.in);
      return { mode: 'pass', mediaId: m.id, start: s(first), end: s(first + range.out - range.in) };
    }
  }
  return { mode: 'mix', clips: ks.length };
}
const WC_AUDIO = { aac: 'mp4a.40.2', opus: 'opus' };
/**
 * A decoder config as WebCodecs decoders and the MP4 writer expect it. WebKit's AAC encoder (Safari 26/27) hands out a
 * whole ES_Descriptor (an esds payload, 39 bytes) as the description instead of the AudioSpecificConfig inside it
 * (2 bytes); its own AudioDecoder then refuses it, and an MP4 would carry a descriptor inside a descriptor. Unwrap it.
 */
export function cleanAudioConfig(cfg) {
  const d = cfg?.description && new Uint8Array(cfg.description.buffer ? cfg.description.buffer.slice(cfg.description.byteOffset, cfg.description.byteOffset + cfg.description.byteLength) : cfg.description);
  if (!d || d[0] !== 0x03 || !/^mp4a/.test(cfg.codec)) return cfg;
  const len = (i) => { let n = 0, j = i; do { n = (n << 7) | (d[j] & 0x7f); } while (d[j++] & 0x80 && j < d.length); return [n, j]; };
  for (let i = 0; i < d.length - 2; i++) {                        // DecoderSpecificInfo: tag 0x05, then a 1-4 byte length
    if (d[i] !== 0x05) continue;
    const [n, j] = len(i + 1);
    if (n >= 2 && n <= 64 && j + n <= d.length) return { ...cfg, description: d.slice(j, j + n) };
  }
  return cfg;
}
const delays = new Map();
/**
 * This browser's audio encoder delay in samples, measured once per codec, rate and channel count: a 10 ms burst at
 * 0.25 s is encoded and decoded, and the delay is how much later it comes out (2112 samples for Apple's AAC). WebCodecs
 * labels the first packet 0 although it starts with that priming, so an unshifted file plays everything late.
 */
export function encoderDelay(codec, sr, nch) {
  const key = [codec, sr, nch].join(); if (delays.has(key)) return delays.get(key);
  const p = (async () => {
    const n = sr, at = Math.round(sr / 4), x = new Float32Array(n * nch), chunks = [];
    for (let c = 0; c < nch; c++) for (let i = 0; i < Math.round(sr / 100); i++) x[c * n + at + i] = 0.8 * Math.sin((2 * Math.PI * 2000 * i) / sr);
    let cfg = null, err = null;
    const enc = new AudioEncoder({ output: (ch, meta) => { chunks.push(ch); if (meta?.decoderConfig) cfg = meta.decoderConfig; }, error: (e) => { err = e; } });
    enc.configure({ codec: WC_AUDIO[codec], sampleRate: sr, numberOfChannels: nch, bitrate: 192000 });
    const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: nch, timestamp: 0, data: x });
    enc.encode(ad); ad.close(); await enc.flush(); enc.close(); if (err) throw err;
    let onset = -1;
    const dec = new AudioDecoder({ output: (d) => {
      const a = new Float32Array(d.numberOfFrames); d.copyTo(a, { planeIndex: 0, format: 'f32-planar' });
      const base = Math.round((d.timestamp / 1e6) * sr); if (onset < 0) { const i = a.findIndex((v) => Math.abs(v) > 0.4); if (i >= 0) onset = base + i; }
      d.close();
    }, error: (e) => { err = e; } });
    dec.configure(cleanAudioConfig(cfg)); for (const c of chunks) dec.decode(c); await dec.flush(); dec.close(); if (err) throw err;
    const ref = x.findIndex((v) => Math.abs(v) > 0.4);
    return onset < 0 ? 0 : Math.max(0, onset - ref);
  })();
  delays.set(key, p); p.catch(() => delays.delete(key));
  return p;
}
/** The audio codec a mixed export encodes for a container, or null when this browser has none. */
export async function mixCodec(container, sampleRate = 48000, nch = 2) {
  const M = await mb();
  for (const c of AUDIO_OK[container].filter((c) => c === 'aac' || c === 'opus')) {
    try { if (await M.canEncodeAudio(c, { numberOfChannels: nch, sampleRate, bitrate: 192000 })) return c; } catch (e) {}
  }
  return null;
}

/**
 * Export a sequence (M5): a fresh sequence renderer (never the preview's, D37) renders the range sequentially from its
 * first frame — a range that starts inside an effect clip replays from that clip's in-point, as in the preview — and
 * every frame is encoded as it is made, so memory stays flat.
 * o: { gpu, project, sequenceId?, w, h, sources (media -> reader), openMedia(media) -> video (for audio), container,
 *      codec?, quality, range { in, out } (frames; default the export range, else the whole sequence), audio (bool),
 *      target, onProgress, onFrame(t, image)?, signal }
 * Returns { frames, seconds, codec, audio, audioNote, file() }.
 */
export async function exportSequence(o) {
  const { gpu, project, w, h, signal } = o, t0 = performance.now();
  const seq = project.sequences.find((s) => s.id === (o.sequenceId || project.activeSequence)), tb = seq.timebase, fps = tb.num / tb.den;
  const end = Math.max(0, ...seq.channels.flatMap((c) => c.clips.map((k) => k.range.out)));
  const range = o.range || seq.exportRange || { in: 0, out: end }, frames = Math.max(0, range.out - range.in);
  if (!frames) throw new Error('nothing to export: the range is empty');
  let audio = null, mix = null, audioNote = o.audio ? null : 'audio off';
  const opened = [], decoders = new Map(), container = o.container || 'mp4'; let stretcher = null;
  const open = async (m) => { const v = await o.openMedia(m); if (v) opened.push(v); return v; };
  if (o.audio) {
    const a = audioPlan(project, range, o.sequenceId);
    if (!a.mode) audioNote = a.reason;
    if (a.mode === 'pass') {
      const v = await open(project.media.find((m) => m.id === a.mediaId));
      if (v?.audio && AUDIO_OK[container].includes(v.audio.codec)) audio = { track: v.audio.track, codec: v.audio.codec, start: v.start + a.start, end: v.start + a.end };
      else a.mode = 'mix';                                   // the codec does not fit the container: mix and encode instead
    }
    if (a.mode === 'mix') {
      const sr = 48000, nch = 2, codec = await mixCodec(container, sr, nch);
      if (!codec) audioNote = `this browser cannot encode audio for ${container.toUpperCase()}`;
      else {
        const decode = async (m, t0, t1) => {
          if (!decoders.has(m.id)) decoders.set(m.id, open(m).then((v) => (v ? createAudioDecoder(v) : null)));
          const d = await decoders.get(m.id); if (!d) return { sampleRate: sr, first: 0, channels: [new Float32Array(0)] };
          return d.decode(t0, t1);
        };
        const S = (f) => Math.round((f * sr * tb.den) / tb.num), base = S(range.in), cache = new Map();
        stretcher = createStretcher();                                   // stretches in a worker (D42)
        mix = { codec, sampleRate: sr, nch, total: S(range.out) - base, block: (s0, s1) => mixBlock({ project, seq, s0: base + s0, s1: base + s1, sr, nch, decode, cache, stretch: stretcher.stretch }) };
      }
    }
  }
  const enc = await createEncoder({ w, h, fps, container: o.container, codec: o.codec, quality: o.quality, target: o.target, audio, mix });
  const renderer = createSequenceRenderer(gpu, project, { w, h, sources: o.sources, sequenceId: o.sequenceId });
  const canvas = new OffscreenCanvas(w, h), present = createPresenter(gpu, canvas), st = { last: t0 };
  let t = 0;
  try {
    for (let f = range.in; f < range.out; f++) {
      if (signal?.aborted) throw new DOMException('export cancelled', 'AbortError');
      const r = await renderer.render(f);
      present.draw(r.image); o.onFrame?.(f, r.image);
      await enc.add(canvas, (f - range.in) / fps, 1 / fps);
      t++; progress(o, t, frames, t0, st);
    }
    await enc.finish();
  } catch (e) { await enc.cancel(); throw e; }
  finally { await renderer.destroy(); for (const v of opened) v.close?.(); stretcher?.close(); }
  return { frames: t, seconds: (performance.now() - t0) / 1000, codec: enc.codec, audio: enc.audio, audioMode: enc.audio ? (mix ? 'mix' : 'pass') : null, audioNote: enc.audio ? null : audioNote, file: o.target.file };
}
