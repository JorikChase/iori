// player.js — plays a decoded video through the Mosh Loop for the preview (M4). The real-time governor (governor.js)
// picks the preview scale from measured frame times; a scale change rebuilds the loop at the new size and re-keys
// the mosh there. Seeking also re-keys: the frame you land on is the mosh's I-frame (the checkpoint cache in M6
// makes scrubbing land on the same pixels as playback). Export never uses this path.
import { createImage, F16 } from './gpu.js';
import { createMoshLoop } from './engine.js';
import { createIngest } from './media.js';
import { createGovernor, fitSize } from './governor.js';

export function createPlayer(gpu, video, { cfg, cap, onFrame = () => {} }) {
  const gov = createGovernor({ budgetMs: 1000 / Math.min(60, video.fps) }), ingest = createIngest(gpu);
  let size = null, loop = null, src = null, it = null, t = 0, k0 = 0, busy = false, last = null, config = cfg;
  const target = () => { const [w, h] = fitSize(video.w, video.h, ...cap); return fitSize(w, h, Math.round(w * gov.scale()), Math.round(h * gov.scale())); };
  function build() {
    const [w, h] = target(); if (size && size[0] === w && size[1] === h) return false;
    loop?.destroy(); src?.destroy(); size = [w, h]; loop = createMoshLoop(gpu, { w, h }, config); src = createImage(gpu, w, h, F16, 'player source'); return true;
  }
  async function restart(frame) {
    await it?.return?.(); t = Math.max(0, Math.min(video.frames - 1, frame)); k0 = t;
    it = video.samples(video.start + t / video.fps)[Symbol.asyncIterator](); loop.begin(t);
  }
  build();
  const api = {
    get t() { return t; }, get size() { return size; }, get governor() { return gov; }, get ingestMode() { return ingest.mode; }, get last() { return last; }, get keyFrame() { return k0; },
    get source() { return src; },
    setConfig(c) { config = c; loop.setConfig(c); },
    async seek(frame) { if (busy) await new Promise((r) => setTimeout(r, 0)); busy = true; try { await restart(frame); await api._one(); } finally { busy = false; } },
    /** Decode, ingest and mosh the next frame. Returns false at the end. */
    async next() { if (busy) return true; busy = true; try { return await api._one(); } finally { busy = false; } },
    async _one() {
      if (!it) await restart(0);
      const s0 = performance.now(), r = await it.next();
      if (r.done) return false;
      const sample = r.value, frame = sample.toVideoFrame();
      ingest.ingest(frame, src); frame.close(); sample.close();
      last = loop.step(t, { src }); onFrame(t, last, src);
      await gpu.device.queue.onSubmittedWorkDone();
      if (gov.feed(performance.now() - s0) && build()) await restart(t + 1); else t++;
      return true;
    },
    destroy() { it?.return?.(); loop?.destroy(); src?.destroy(); ingest.destroy(); },
  };
  return api;
}
