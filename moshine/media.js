// media.js — the media pipeline's input side (spec §8.1, §8.2): the OPFS media library, opening and probing
// video with Mediabunny, and GPU ingest of decoded frames into the engine's rgba16float working textures.
//
// Decode ladder (per clip): WebCodecs via Mediabunny -> VideoFrame, then
//   'external'  importExternalTexture (zero copy) sampled by a compute resample to the working size
//   'copy'      copyExternalImageToTexture into an rgba8 staging texture at source size, then the same resample
// ('cpu' = VideoFrame.copyTo + writeTexture and WASM decode are the M8 compatibility rungs.)
import { pipeline, computePipeline, dispatch, uniformBuffer, HALF_WGSL, F16 } from './gpu.js';
import { contentIdPlan } from './governor.js';
import { createFeatureExtractor, encodeFeatures, decodeFeatures } from './features.js';
import { toRational } from './project.js';

export const mb = () => import('./vendor/mediabunny-1.61.3.min.mjs');

// ------------------------------------------------------------------------------------------------ OPFS library
/** Content ID: SHA-256 of the size and three 1 MiB samples (first, middle, last); 16 hex chars. */
export async function contentId(file) {
  const parts = [new TextEncoder().encode(String(file.size))];
  for (const [a, b] of contentIdPlan(file.size)) parts.push(new Uint8Array(await file.slice(a, b).arrayBuffer()));
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', all))].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The media library: imported files are copied once into OPFS ('moshine-media/<id>') so they survive reloads and
 * can be range-read without keeping the user's File alive. index.json holds { id, name, size, type, added, info }.
 */
export async function openLibrary() {
  const root = await navigator.storage.getDirectory(), dir = await root.getDirectoryHandle('moshine-media', { create: true });
  const readIndex = async () => { try { return JSON.parse(await (await (await dir.getFileHandle('index.json')).getFile()).text()); } catch (e) { return []; } };
  const writeIndex = async (idx) => { const w = await (await dir.getFileHandle('index.json', { create: true })).createWritable(); await w.write(JSON.stringify(idx, null, 1)); await w.close(); };
  let index = await readIndex();
  const canWrite = typeof FileSystemFileHandle !== 'undefined' && 'createWritable' in FileSystemFileHandle.prototype;
  return {
    list: () => [...index],
    canWrite,
    /** Copy a File in (streaming). onProgress(bytes, total). Returns the entry (existing one if already imported). */
    async import(file, onProgress = () => {}) {
      const id = await contentId(file), have = index.find((e) => e.id === id);
      if (have) return have;
      if (!canWrite) throw new Error('this browser cannot write files to OPFS (createWritable); the clip will be used for this session only');
      const fh = await dir.getFileHandle(id, { create: true }), w = await fh.createWritable(); let n = 0;
      await file.stream().pipeThrough(new TransformStream({ transform(chunk, ctl) { n += chunk.byteLength; onProgress(n, file.size); ctl.enqueue(chunk); } })).pipeTo(w);
      const entry = { id, name: file.name, size: file.size, type: file.type, added: new Date().toISOString(), info: null };
      index.push(entry); await writeIndex(index); return entry;
    },
    async file(entry) { return (await dir.getFileHandle(entry.id)).getFile(); },
    async setInfo(entry, info) { const e = index.find((x) => x.id === entry.id); if (e) { e.info = info; await writeIndex(index); } },
    /** Audio features (features.js), stored as '<id>.features' next to the media. */
    async setFeatures(entry, table) { const w = await (await dir.getFileHandle(entry.id + '.features', { create: true })).createWritable(); await w.write(encodeFeatures(table)); await w.close(); },
    async features(entry) { try { return decodeFeatures(new Uint8Array(await (await (await dir.getFileHandle(entry.id + '.features')).getFile()).arrayBuffer())); } catch (e) { return null; } },
    async remove(entry) { await dir.removeEntry(entry.id + '.features').catch(() => {}); await dir.removeEntry(entry.id).catch(() => {}); index = index.filter((e) => e.id !== entry.id); await writeIndex(index); },
    async usage() { const e = await navigator.storage.estimate(); return { used: e.usage || 0, quota: e.quota || 0, persisted: navigator.storage.persisted ? await navigator.storage.persisted() : false }; },
    persist: () => (navigator.storage.persist ? navigator.storage.persist() : Promise.resolve(false)),
  };
}

// ------------------------------------------------------------------------------------------------ open + probe
/**
 * Timing of a Mediabunny video track (no decoding, works in node): { duration, start, rate, fps, frames }. The rate is
 * Mediabunny's packet rate over the first 120 packets (count / presentation span), snapped to a rational by
 * toRational (25/1, 24000/1001, ...), and fps = rate.num / rate.den exactly. Mediabunny 1.61 reports it as
 * `averagePacketRate`; reading `averageFrameRate` (absent) made every import 30 fps until 2026-10-22.
 */
export async function probeTiming(track) {
  const [duration, stats, start] = await Promise.all([track.computeDuration(), track.computePacketStats(120), track.getFirstTimestamp()]);
  const measured = stats.averagePacketRate, rate = measured > 0 && Number.isFinite(measured) ? toRational(measured) : { num: 30, den: 1 };
  const fps = rate.num / rate.den;
  return { duration, start, rate, fps, frames: Math.max(1, Math.round((duration - start) * fps)) };
}

/** Open a video Blob/File: tracks, size, duration, frame rate, decodability, and decoding iterators. */
export async function openVideo(blob, name = blob.name || 'video') {
  const M = await mb(), input = new M.Input({ formats: M.ALL_FORMATS, source: new M.BlobSource(blob) });
  const track = await input.getPrimaryVideoTrack(); if (!track) throw new Error('no video track');
  const canDecode = await track.canDecode(); if (!canDecode) throw new Error(`this browser cannot decode ${track.codec || 'this codec'} (WASM decode arrives in M8)`);
  const { duration, start: first, rate, fps, frames } = await probeTiming(track), audioTrack = await input.getPrimaryAudioTrack();
  const sink = new M.VideoSampleSink(track);
  return {
    name, input, track, codec: track.codec, w: track.displayWidth, h: track.displayHeight, duration, start: first, fps, rate, frames,
    audio: audioTrack ? { track: audioTrack, codec: audioTrack.codec, sampleRate: audioTrack.sampleRate, channels: audioTrack.numberOfChannels } : null,
    /** Async iterator of VideoSample in presentation order from `from` seconds (callers must close() each sample). */
    samples: (from = first, to = Infinity) => sink.samples(from, to),
    sampleAt: (t) => sink.getSample(t),
    info() { return { codec: this.codec, w: this.w, h: this.h, duration: +duration.toFixed(3), fps: +fps.toFixed(3), rate: { ...rate }, frames: this.frames, audio: this.audio ? `${this.audio.codec} ${this.audio.sampleRate} Hz ×${this.audio.channels}` : null }; },
    close() { try { input.dispose?.(); } catch (e) {} },
  };
}

// ------------------------------------------------------------------------------------------------ audio analysis
/**
 * Decode a video's audio track (streaming, mono mixdown) into per-frame features (features.js) at the video's frame
 * rate `fps` ({ num, den }). onProgress(seconds done, total). Returns null when there is no audio track.
 */
export async function analyseAudio(video, fps, { onProgress = () => {}, signal } = {}) {
  if (!video.audio) return null;
  const M = await mb(), sink = new M.AudioSampleSink(video.audio.track), ex = createFeatureExtractor({ sampleRate: video.audio.sampleRate, fps });
  let tmp = null, last = 0;
  for await (const s of sink.samples(video.start)) {
    if (signal?.aborted) { s.close(); throw new DOMException('analysis cancelled', 'AbortError'); }
    const n = s.numberOfFrames, ch = s.numberOfChannels, mono = new Float32Array(n);
    if (!tmp || tmp.length < n) tmp = new Float32Array(n);
    for (let c = 0; c < ch; c++) { s.copyTo(tmp, { planeIndex: c, format: 'f32-planar' }); for (let i = 0; i < n; i++) mono[i] += tmp[i] / ch; }
    const t = s.timestamp + s.duration; s.close(); ex.push(mono);
    if (t - last > 2) { last = t; onProgress(t - video.start, video.duration); }
  }
  return ex.finish();
}

/**
 * Windows of a video's audio for the mixer (mix.js): decode(t0, t1) -> { sampleRate, first, channels } covering media
 * seconds [t0, t1) (0 = the first video frame), `first` being the media sample index of channels[x][0]. Samples are
 * placed by their timestamps; gaps stay silent.
 */
export function createAudioDecoder(video) {
  if (!video.audio) return null;
  const sr = video.audio.sampleRate, nch = Math.max(1, video.audio.channels), sinkP = mb().then((M) => new M.AudioSampleSink(video.audio.track));
  return {
    sampleRate: sr,
    async decode(t0, t1) {
      const sink = await sinkP, first = Math.max(0, Math.floor(t0 * sr)), n = Math.max(0, Math.ceil(t1 * sr) - first), out = Array.from({ length: nch }, () => new Float32Array(n));
      let tmp = null;
      for await (const s of sink.samples(video.start + first / sr, video.start + t1)) {
        const si = Math.round((s.timestamp - video.start) * sr), m = s.numberOfFrames, lo = Math.max(first, si), hi = Math.min(first + n, si + m);
        if (hi > lo) for (let c = 0; c < nch; c++) {
          if (!tmp || tmp.length < m) tmp = new Float32Array(m);
          s.copyTo(tmp, { planeIndex: Math.min(c, s.numberOfChannels - 1), format: 'f32-planar' });
          out[c].set(tmp.subarray(lo - si, hi - si), lo - first);
        }
        s.close();
      }
      return { sampleRate: sr, first, channels: out };
    },
  };
}

// ------------------------------------------------------------------------------------------------ ingest
const EXT_WGSL = /* wgsl */`
@group(0) @binding(0) var src: texture_external;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var dst: texture_storage_2d<rgba16float, write>;
${HALF_WGSL(F16)}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let d = textureDimensions(dst); if (id.x >= d.x || id.y >= d.y) { return; }
  let uv = (vec2f(id.xy) + vec2f(0.5)) / vec2f(d);
  textureStore(dst, vec2i(id.xy), Q(vec4f(clamp(textureSampleBaseClampToEdge(src, smp, uv).rgb, vec3f(0.0), vec3f(1.0)), 1.0)));   // YUV->RGB can leave [0, 1]
}`;
const TEX_WGSL = /* wgsl */`
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var dst: texture_storage_2d<rgba16float, write>;
${HALF_WGSL(F16)}
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let d = textureDimensions(dst); if (id.x >= d.x || id.y >= d.y) { return; }
  let uv = (vec2f(id.xy) + vec2f(0.5)) / vec2f(d);
  textureStore(dst, vec2i(id.xy), Q(vec4f(textureSampleLevel(src, smp, uv, 0.0).rgb, 1.0)));
}`;

/**
 * Ingest VideoFrames into rgba16float textures of any size (bilinear resample on the GPU). mode 'auto' tries the
 * zero-copy path first and falls back to the copy path for good on the first failure.
 */
export function createIngest(gpu, { mode = 'auto' } = {}) {
  const { device } = gpu, S = GPUShaderStage.COMPUTE;
  const smp = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  const PE = pipeline(gpu, 'ingest:ext', () => {
    const layout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: S, externalTexture: {} }, { binding: 1, visibility: S, sampler: { type: 'filtering' } }, { binding: 2, visibility: S, storageTexture: { access: 'write-only', format: F16 } }] });
    return { layout, pipe: device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }), compute: { module: device.createShaderModule({ code: EXT_WGSL }), entryPoint: 'main' } }) };
  });
  const PT = pipeline(gpu, 'ingest:tex', () => {
    const layout = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: S, texture: { sampleType: 'float' } }, { binding: 1, visibility: S, sampler: { type: 'filtering' } }, { binding: 2, visibility: S, storageTexture: { access: 'write-only', format: F16 } }] });
    return { layout, pipe: device.createComputePipeline({ layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }), compute: { module: device.createShaderModule({ code: TEX_WGSL }), entryPoint: 'main' } }) };
  });
  let staging = null, viaCanvas = false, cv = null, cx = null, used = mode === 'auto' ? (typeof device.importExternalTexture === 'function' ? 'external' : 'copy') : mode;
  const run = (P, entries, dst) => { const enc = device.createCommandEncoder(), pass = enc.beginComputePass(); pass.setPipeline(P.pipe); pass.setBindGroup(0, device.createBindGroup({ layout: P.layout, entries })); pass.dispatchWorkgroups(Math.ceil(dst.width / 8), Math.ceil(dst.height / 8)); pass.end(); device.queue.submit([enc.finish()]); };
  const viaCopy = (frame, dst) => {
    const w = frame.displayWidth, h = frame.displayHeight;
    if (!staging || staging.width !== w || staging.height !== h) { staging?.destroy(); staging = device.createTexture({ size: [w, h], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT }); }
    // Firefox (Gecko 157) refuses a VideoFrame as a copy source: draw it into a canvas first, and keep doing so
    if (!viaCanvas) { try { device.queue.copyExternalImageToTexture({ source: frame }, { texture: staging }, [w, h]); } catch (e) { viaCanvas = true; } }
    if (viaCanvas) {
      if (!cv || cv.width !== w || cv.height !== h) { cv = new OffscreenCanvas(w, h); cx = cv.getContext('2d'); }
      cx.drawImage(frame, 0, 0, w, h); device.queue.copyExternalImageToTexture({ source: cv }, { texture: staging }, [w, h]);
    }
    run(PT, [{ binding: 0, resource: staging.createView() }, { binding: 1, resource: smp }, { binding: 2, resource: dst.createView() }], dst);
  };
  return {
    get mode() { return used; },
    /** Resample a VideoFrame (or VideoSample's frame) into dst (rgba16float). The caller still owns the frame. */
    ingest(frame, dst) {
      if (used === 'external') {
        try { run(PE, [{ binding: 0, resource: device.importExternalTexture({ source: frame }) }, { binding: 1, resource: smp }, { binding: 2, resource: dst.createView() }], dst); return; }
        catch (e) { if (mode !== 'auto') throw e; console.warn('moshine: zero-copy ingest failed, using the copy path', e); used = 'copy'; }
      }
      viaCopy(frame, dst);
    },
    destroy() { staging?.destroy(); },
  };
}
