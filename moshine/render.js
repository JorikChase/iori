// render.js — the GPU backend of the sequence evaluator (sequence.js) and the media readers that feed it.
// Media frames arrive as VideoSamples (decoded through media.js, ingested and resampled to the clip's base size)
// or as Float32Array frames (fixtures, uploaded at their own size). Every channel owns its layer and composite
// images, every effect instance its outputs, so nothing a later channel reads (source picker inputs) is
// overwritten within a frame. Each operation is its own submit (one parameter set per node per submit).
import { createImage, upload, F16 } from './gpu.js';
import { createMoshLoop } from './engine.js';
import { createFxChain } from './nodes/fx.js';
import { createPlace, createBlend, createMaskMix } from './nodes/composite.js';
import { createIngest } from './media.js';
import { createEvaluator } from './sequence.js';
import { gpuSerializer } from './cache.js';

/**
 * Frame reader over an opened video (media.openVideo): frame(i) -> VideoSample (owned by the reader, valid until
 * the next call). Sequential reads step the decoder; a jump back or far ahead re-seeks. Past the end the last frame
 * holds. Sequential reading visits samples exactly as the M4 export does. beforeSeek (set by the GPU backend) runs
 * before a re-seek closes the decoder.
 */
export function videoReader(video, { jump = 90 } = {}) {
  let it = null, cur = null, idx = -1, done = false, lock = Promise.resolve();
  const index = (s) => Math.round((s.timestamp - video.start) * video.fps);
  return {
    w: video.w, h: video.h, kind: 'video',
    /** Awaited before a re-seek closes the decoder: the GPU backend waits for submitted work here (see gpuBackend). */
    beforeSeek: null,
    /** Serialized: a prefetch and the replay's first frame may ask at the same time. */
    frame(i) { const p = lock.then(() => this.read(i)); lock = p.catch(() => {}); return p; },
    async read(i) {
      if (cur && i === idx) return cur;
      if (!it || i < idx || i > idx + jump) {
        if (it) await this.beforeSeek?.();                             // queued GPU work may still read the current frame
        await it?.return?.(); cur?.close(); cur = null; idx = -1; done = false;
        it = video.samples(video.start + i / video.fps)[Symbol.asyncIterator]();
      }
      while (!done && idx < i) {
        const r = await it.next(); if (r.done) { done = true; break; }
        cur?.close(); cur = r.value; idx = index(cur);
      }
      return cur;
    },
    async close() { await it?.return?.(); cur?.close(); cur = null; },
  };
}

/**
 * The GPU backend. sources(media) -> reader: { w, h, frame(i) } returning a VideoSample (ingested) or a
 * Float32Array (uploaded when it is at the clip's base size, else resampled through the ingest).
 */
export function gpuBackend(gpu, { w, h, sources }) {
  const ingest = createIngest(gpu), place = createPlace(gpu), blend = createBlend(gpu), maskmix = createMaskMix(gpu), maskSrc = new Map(), imgs = new Map(), clipSrc = new Map(), readers = new Map();
  const img = (key, iw = w, ih = h) => {
    let x = imgs.get(key);
    if (!x || x.width !== iw || x.height !== ih) { x?.destroy(); x = createImage(gpu, iw, ih, F16, key); imgs.set(key, x); }
    return x;
  };
  const submit = (fn) => { const enc = gpu.device.createCommandEncoder(); fn(enc); gpu.device.queue.submit([enc.finish()]); };
  let black = null;
  const opening = new Map();
  /** The frame reader for a media item, opened once (concurrent callers share the opening). */
  const reader = (m) => {
    if (readers.has(m.id)) return Promise.resolve(readers.get(m.id));
    if (!opening.has(m.id)) opening.set(m.id, (async () => {
      const r = await sources(m); readers.set(m.id, r);
      // A re-seek closes the decoder and its frames. Commands that read the current frame through a zero-copy external
      // texture may still be queued (a replay queues many frames without waiting), and they would sample freed
      // memory: nondeterministic pixels. Wait for the queue first; it costs one sync per jump, not per frame.
      if ('beforeSeek' in r) r.beforeSeek = () => gpu.device.queue.onSubmittedWorkDone();
      return r;
    })());
    return opening.get(m.id);
  };
  return {
    w, h, serializer: gpuSerializer(gpu),
    black() {
      if (!black) { black = createImage(gpu, w, h, F16, 'black'); const z = new Float32Array(w * h * 4); for (let i = 3; i < z.length; i += 4) z[i] = 1; upload(gpu, black, z); }
      return black;
    },
    /** Decode media frame i ahead (a seek's decoder restart overlaps the checkpoint restore). */
    async prefetch(m, i) { await (await reader(m)).frame(i); },
    async source(clip, m, i, bw, bh) {
      const r = await reader(m);
      const tex = img('src ' + clip.id, bw, bh), last = clipSrc.get(clip.id);
      if (last && last.i === i && last.tex === tex) return tex;
      const f = await r.frame(i);
      if (f instanceof Float32Array) {
        if (r.w === bw && r.h === bh) upload(gpu, tex, f);
        else {                                                         // another size (a governed preview): resample through the ingest
          const c = new OffscreenCanvas(r.w, r.h), d = new ImageData(r.w, r.h); for (let k = 0; k < f.length; k++) d.data[k] = Math.round(Math.min(1, Math.max(0, f[k])) * 255);
          c.getContext('2d').putImageData(d, 0, 0); const vf = new VideoFrame(c, { timestamp: 0 }); ingest.ingest(vf, tex); vf.close();
        }
      }
      else if (f) { const vf = f.toVideoFrame(); ingest.ingest(vf, tex); vf.close(); }
      clipSrc.set(clip.id, { i, tex });
      return tex;
    },
    place(src, P, key) { const dst = img('layer ' + key); submit((e) => place.encode(e, src, dst, P)); return dst; },
    /** A mask raster (uploaded when its key changes) resampled to the working size. */
    mask(key, r, P) {
      let m = maskSrc.get(key);
      if (!m || m.key !== r.key) { const tex = img('mask src ' + key, r.mw, r.mh); upload(gpu, tex, r.data); maskSrc.set(key, (m = { key: r.key, tex, placed: null })); }
      const dst = img('mask ' + key);
      if (m.placed !== dst) { submit((e) => place.encode(e, m.tex, dst, P)); m.placed = dst; }   // unchanged raster: already placed
      return dst;
    },
    maskmix(clean, moshed, mask, key) { const dst = img('mmix ' + key); submit((e) => maskmix.encode(e, clean, moshed, mask, dst)); return dst; },
    blend(comp, layer, opacity, mode, key) { const dst = img('comp ' + key); submit((e) => blend.encode(e, comp, layer, dst, opacity, mode)); return dst; },
    loop: (cfg) => createMoshLoop(gpu, { w, h }, cfg),
    fx(block) {
      const chain = createFxChain(gpu, { w, h, block }, F16, 'clip fx'), out = createImage(gpu, w, h, F16, 'clip fx out');
      return {
        reset: () => chain.reset(),
        snapshot() { let snap; submit((e) => { snap = chain.snapshot(e); }); const tex = snap.tex; return { ...snap, bytes: tex.reduce((n, x) => n + (x ? x.width * x.height * 8 : 0), 0), destroy: () => tex.forEach((x) => x?.destroy()) }; },
        restore(snap) { submit((e) => chain.restore(e, snap)); },
        apply(src, list, ctx) { submit((e) => chain.encode(e, src, out, list, ctx)); return out; },
        destroy() { chain.destroy(); out.destroy(); },
      };
    },
    async destroy() {
      for (const x of imgs.values()) x.destroy(); black?.destroy(); ingest.destroy(); place.destroy(); blend.destroy(); maskmix.destroy();
      for (const r of readers.values()) await r.close?.();
    },
  };
}

/**
 * A sequence renderer on the GPU: render(t) -> { image: GPUTexture (w x h, rgba16float), from }. Size defaults to the
 * sequence size; the preview passes a governed size. K and budget configure the checkpoint store (M6). sources(media)
 * opens a reader for a MediaRef (the app opens
 * the OPFS file with media.openVideo and wraps it in videoReader).
 */
export function createSequenceRenderer(gpu, project, { w, h, sources, sequenceId, K, budget, cpuBudget, disk, diskBudget, features, checkpoints, scaleParams } = {}) {
  const seq = project.sequences.find((s) => s.id === (sequenceId || project.activeSequence));
  return createEvaluator(project, gpuBackend(gpu, { w: w || seq.width, h: h || seq.height, sources }), { sequenceId, ...(features ? { features } : {}), ...(checkpoints === false ? { checkpoints: false } : {}), ...(scaleParams === false ? { scaleParams: false } : {}), ...(K ? { K } : {}), ...(budget ? { budget } : {}), ...(cpuBudget ? { cpuBudget } : {}), ...(disk ? { disk } : {}), ...(diskBudget ? { diskBudget } : {}) });
}
