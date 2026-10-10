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
 * at 0 and kept interleaved with the video. Returns { add(canvas, ts, dur), finish(), cancel(), codec, audio }.
 */
async function createEncoder({ w, h, fps, container = 'mp4', codec, quality, target, audio = null }) {
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
  const feed = async (until) => {                        // keep audio interleaved with video, never far ahead
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
    codec, audio: asrc ? audio.codec : null,
    async add(canvas, ts, dur) {
      const vf = new VideoFrame(canvas, { timestamp: Math.round(ts * 1e6), duration: Math.round(dur * 1e6) }), out = new M.VideoSample(vf);
      await feed(ts + dur); await vsrc.add(out); out.close(); vf.close();
    },
    async finish() { await feed(Infinity); vsrc.close(); asrc?.close(); await output.finalize(); },
    async cancel() { await output.cancel().catch(() => {}); try { await target.writable.abort?.(); } catch (e) {} },
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
 * Audio that can be passed through unchanged for a sequence range (until the M7 mix): exactly one media clip on the
 * live video channels overlaps the range, it is not a hold, its media has audio at the sequence frame rate, and it
 * covers the whole range. Returns { mediaId, start, end } in source seconds, or { reason } when audio is dropped.
 */
export function passThroughAudio(project, range, sequenceId) {
  const seq = project.sequences.find((s) => s.id === (sequenceId || project.activeSequence)), tb = seq.timebase;
  const ks = seq.channels.filter((c) => c.kind === 'video' && !c.bypassed).flatMap((c) => c.clips).filter((k) => k.range.in < range.out && k.range.out > range.in);
  if (ks.length !== 1) return { reason: ks.length ? 'several clips in the range: the audio mix arrives in M7' : 'no media in the range' };
  const k = ks[0], m = project.media.find((x) => x.id === k.mediaId);
  if (!m?.hasAudio) return { reason: 'the media has no audio' };
  if (k.hold) return { reason: 'a held clip: time-stretched audio arrives in M7' };
  if (k.range.in > range.in || k.range.out < range.out) return { reason: 'the clip does not cover the range: the audio mix arrives in M7' };
  if (!m.fps || m.fps.num * tb.den !== tb.num * m.fps.den) return { reason: 'the media runs at another frame rate than the sequence' };
  const s = (f) => (f * tb.den) / tb.num, first = k.sourceIn + (range.in - k.range.in);
  return { mediaId: m.id, start: s(first), end: s(first + range.out - range.in) };
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
  let audio = null, audioNote = o.audio ? null : 'audio off';
  if (o.audio) {
    const a = passThroughAudio(project, range, o.sequenceId);
    if (a.reason) audioNote = a.reason;
    else {
      const v = await o.openMedia(project.media.find((m) => m.id === a.mediaId));
      if (v?.audio) { audio = { track: v.audio.track, codec: v.audio.codec, start: v.start + a.start, end: v.start + a.end }; if (!AUDIO_OK[o.container || 'mp4'].includes(v.audio.codec)) audioNote = `${v.audio.codec} does not fit ${(o.container || 'mp4').toUpperCase()}`; }
      else audioNote = 'the media has no audio track';
    }
  }
  const enc = await createEncoder({ w, h, fps, container: o.container, codec: o.codec, quality: o.quality, target: o.target, audio });
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
  finally { await renderer.destroy(); }
  return { frames: t, seconds: (performance.now() - t0) / 1000, codec: enc.codec, audio: enc.audio, audioNote: enc.audio ? null : audioNote, file: o.target.file };
}
