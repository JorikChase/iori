/*
 * landscape-worker.js — runs generateTerrain off the main thread. Message in: { opts }. Messages out:
 * { type: 'progress', f, stage } and finally { type: 'done', terrain } (typed arrays transferred, the
 * methods sample()/crop() re-attached on the main thread by attachMethods) or { type: 'error', error }.
 * The same worker file serves crops: { type: 'hold', terrain } once, then { type: 'crop', id, x0, y0, w_m, cells }
 * → { type: 'crop', id, crop } with crop.lightBake (makeCropWorker in landscape-terrain.js).
 * The worker also bakes the region's light (t.lightBake) so buildGround does not block the main thread.
 */
import { generateTerrain, bakeLight, attachMethods, SUN_DIR3 } from './landscape-terrain.js';

let held = null; // a region kept for crops ({ type: 'hold', terrain }, then { type: 'crop', id, x0, y0, w_m, cells })

self.onmessage = (ev) => {
  const d = ev.data || {};
  if (d.type === 'hold') {
    held = attachMethods(d.terrain); held._bufs = new Set();
    const mark = (v) => { if (ArrayBuffer.isView(v)) held._bufs.add(v.buffer); else if (v && typeof v === 'object') for (const x of Object.values(v)) if (ArrayBuffer.isView(x)) held._bufs.add(x.buffer); };
    for (const v of Object.values(held)) mark(v);
    return;
  }
  if (d.type === 'crop') {
    try {
      const c = held.crop(d.x0, d.y0, d.w_m, d.cells);
      c.lightBake = bakeLight(c, SUN_DIR3, held.sample);
      const { sample, crop, parentSample, ...plain } = c;
      const seen = new Set(), transfer = [];
      const add = (v) => { if (ArrayBuffer.isView(v) && !seen.has(v.buffer) && !held._bufs.has(v.buffer)) { seen.add(v.buffer); transfer.push(v.buffer); } };
      for (const v of Object.values(plain)) add(v);
      self.postMessage({ type: 'crop', id: d.id, crop: plain }, transfer);
    } catch (e) { self.postMessage({ type: 'error', id: d.id, error: String((e && e.stack) || e) }); }
    return;
  }
  try {
    let last = 0;
    const t = generateTerrain(ev.data.opts || {}, (f, stage) => {
      const now = performance.now();
      if (now - last > 60 || f >= 1) { last = now; self.postMessage({ type: 'progress', f, stage }); }
    });
    // bake the region's light here (it is the slow part of building the ground): at the mesh resolution the
    // ground will use (grids above 600² are drawn decimated by 2)
    {
      const n = t.n, st = n > 600 ? 2 : 1, m = Math.floor((n - 1) / st) + 1;
      let src = t;
      if (st > 1) { const Hm = new Float32Array(m * m); for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) Hm[j * m + i] = t.height[(j * st) * n + i * st]; src = { n: m, cell_m: t.cell_m * st, height: Hm }; }
      t.lightBake = bakeLight(src);
    }
    const { sample, crop, ...plain } = t;
    const seen = new Set(), transfer = [];
    const add = (v) => { if (ArrayBuffer.isView(v) && !seen.has(v.buffer)) { seen.add(v.buffer); transfer.push(v.buffer); } };
    for (const v of Object.values(plain)) add(v);
    for (const r of plain.rivers) { add(r.pts); add(r.width); add(r.depth); }
    self.postMessage({ type: 'done', terrain: plain }, transfer);
  } catch (e) {
    self.postMessage({ type: 'error', error: String((e && e.stack) || e) });
  }
};
