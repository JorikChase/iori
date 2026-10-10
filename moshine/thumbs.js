// thumbs.js — live thumbnails for the Looks strip (owner request R4): a few frames of the selected clip, ingested once
// at thumbnail size, run through every preset's Mosh Loop on the GPU; each card's canvas shows the last frame. Not part
// of the deterministic render path: a quick visual pick, nothing more.
import { createImage, createPresenter, F16 } from './gpu.js';
import { createMoshLoop } from './engine.js';
import { createIngest } from './media.js';

export function createThumbs(gpu) {
  const ingest = createIngest(gpu), loops = new Map(), presenters = new Map();
  let frames = [], size = null;
  const loopFor = (cfg) => {
    const key = `${size[0]}x${size[1]}/${cfg.block}`;
    let L = loops.get(key); if (!L) { L = createMoshLoop(gpu, { w: size[0], h: size[1] }, cfg); loops.set(key, L); } else L.setConfig(cfg);
    return L;
  };
  return {
    get ready() { return frames.length > 0; },
    /**
     * Load source frames: reader (render.js videoReader or a fixture source) at media indices `indices` (ascending),
     * at a thumbnail width of `w` keeping the media's aspect. Returns false if `stale()` turned true meanwhile.
     */
    async load(reader, indices, { mw, mh, w = 128, stale = () => false }) {
      const h = Math.max(16, Math.round((w * mh) / mw / 2) * 2);
      if (!size || size[0] !== w || size[1] !== h) { frames.forEach((x) => x.destroy()); frames = []; for (const L of loops.values()) L.destroy(); loops.clear(); size = [w, h]; }
      while (frames.length < indices.length) frames.push(createImage(gpu, w, h, F16, 'thumb src'));
      while (frames.length > indices.length) frames.pop().destroy();
      for (let k = 0; k < indices.length; k++) {
        const f = await reader.frame(indices[k]); if (stale()) return false;
        if (f instanceof Float32Array) {
          const c = new OffscreenCanvas(reader.w, reader.h), d = new ImageData(reader.w, reader.h);
          for (let i = 0; i < f.length; i++) d.data[i] = Math.round(Math.min(1, Math.max(0, f[i])) * 255);
          c.getContext('2d').putImageData(d, 0, 0); const vf = new VideoFrame(c, { timestamp: 0 }); ingest.ingest(vf, frames[k]); vf.close();
        } else if (f) { const vf = f.toVideoFrame(); ingest.ingest(vf, frames[k]); vf.close(); }
      }
      return true;
    },
    /** Run one preset over the loaded frames and show the result in `canvas`. */
    draw(cfg, canvas) {
      if (!frames.length) return;
      const L = loopFor(cfg); L.begin(0); let out = null;
      frames.forEach((src, t) => { out = L.step(t, { src }).display; });
      let P = presenters.get(canvas); if (!P) { P = createPresenter(gpu, canvas); presenters.set(canvas, P); }
      P.draw(out);
    },
    destroy() { frames.forEach((x) => x.destroy()); for (const L of loops.values()) L.destroy(); ingest.destroy(); },
  };
}
