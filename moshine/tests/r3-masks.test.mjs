// R3: include and lock masks — the raster, the commands, and the evaluator's mix with the clean picture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rasterMasks, createMask, resolveMasks, maskSize } from '../masks.js';
import { createEvaluator, cpuBackend } from '../sequence.js';
import { createLoopRef } from '../engine-ref.js';
import { dsincos, dhypot } from '../dmath.js';
import { fromConfig, validate } from '../project.js';
import { createTimeline } from '../timeline.js';
import { PRESETS } from '../config.js';
import { fixture } from '../fixtures.js';
import { fnv1a, toHalfArray, fromHalfArray } from '../util.js';

const at = (r, mw, x, y) => r[(y * mw + x) * 4];
const M = (mode, shapes, o = {}) => ({ ...createMask(mode, { id: 'm' + Math.random(), feather: 0 }), shapes, ...o });

test('raster: strokes, ellipses and rects; lock removes; invert, feather, transform, opacity', () => {
  const mw = 64, mh = 32, A = 2;
  assert.equal(rasterMasks([], mw, mh, A), null);
  const stroke = M('include', [{ type: 'stroke', pts: [0.1, 0.5, 0.9, 0.5], r: 0.1 }]);
  let r = rasterMasks([stroke], mw, mh, A);
  assert.equal(at(r, mw, 32, 16), 1); assert.equal(at(r, mw, 32, 1), 0, 'outside the stroke');
  r = rasterMasks([stroke, M('lock', [{ type: 'rect', x: 0.5, y: 0, w: 0.5, h: 1 }])], mw, mh, A);
  assert.equal(at(r, mw, 20, 16), 1); assert.equal(at(r, mw, 50, 16), 0, 'locked half');
  r = rasterMasks([M('lock', [{ type: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.1, ry: 0.2 }])], mw, mh, A);
  assert.equal(at(r, mw, 32, 16), 0, 'a lock alone: everywhere but the ellipse'); assert.equal(at(r, mw, 2, 2), 1);
  r = rasterMasks([{ ...stroke, invert: true }], mw, mh, A); assert.equal(at(r, mw, 32, 16), 0); assert.equal(at(r, mw, 32, 1), 1);
  const soft = rasterMasks([{ ...stroke, feather: 0.2 }], mw, mh, A), col = Array.from({ length: mh }, (_, y) => at(soft, mw, 32, y));
  assert.ok(col.some((v) => v > 0 && v < 1), 'feathered edge'); for (let y = 1; y <= 16; y++) assert.ok(col[y] >= col[y - 1], 'ramps up toward the stroke');
  r = rasterMasks([{ ...stroke, y: -0.3 }], mw, mh, A); assert.equal(at(r, mw, 32, 16), 0); assert.equal(at(r, mw, 32, 6), 1, 'moved up');
  r = rasterMasks([{ ...stroke, opacity: 0.5 }], mw, mh, A); assert.equal(at(r, mw, 32, 16), 0.5);
  assert.deepEqual(rasterMasks([stroke], mw, mh, A), rasterMasks([structuredClone(stroke)], mw, mh, A), 'deterministic');
  assert.deepEqual(maskSize(1920, 1080), [512, 288]); assert.deepEqual(maskSize(320, 180), [320, 180]);
});

const W = 96, H = 64, F = fixture('pan', { w: W, h: H, count: 60, block: 16 }), h16 = (a) => fromHalfArray(toHalfArray(a));
const ref = { id: 'pan', name: 'pan', hash: 'pan', kind: 'video', width: W, height: H, fps: { num: 30, den: 1 }, durationFrames: 60, hasAudio: false, storage: 'opfs' };
const sources = { pan: { w: W, h: H, frame: (i) => F.frame(i) } };
const project = () => fromConfig(PRESETS['Xvid classic'], { media: ref, frames: 40, width: W, height: H, timebase: { num: 30, den: 1 } });
const evalOf = (p, o) => createEvaluator(p, cpuBackend({ w: W, h: H, sources }), { K: 8, ...o });
const play = async (p, n, o) => { const ev = evalOf(p, o), out = []; for (let t = 0; t < n; t++) out.push((await ev.render(t)).image); return { ev, out }; };
const half = (img, left) => { const o = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x < W / 2) === left) o.push(...img.slice((y * W + x) * 4, (y * W + x) * 4 + 4)); return fnv1a(new Float32Array(o)); };

test('an include mask over the left half: the mosh there, the clean source elsewhere, exactly', async () => {
  const p = project(), tl = createTimeline(p), k = p.sequences[0].channels[1].clips[0];
  const { out: full } = await play(p, 20);
  const id = tl.exec('addMask', { clipId: k.id, mode: 'include', feather: 0 });
  tl.exec('addMaskStroke', { maskId: id, stroke: { type: 'rect', x: 0, y: 0, w: 0.5, h: 1 } });
  assert.deepEqual(validate(p), []);
  const { out } = await play(p, 20);
  for (const t of [5, 19]) {
    assert.equal(half(out[t], true), half(full[t], true), `left half moshed at ${t}`);
    assert.equal(half(out[t], false), half(h16(F.frame(t)), false), `right half clean at ${t}`);
  }
});

test('a lock over everything gives the clean picture; include strokes keep checkpoints, lock strokes void them; a keyframed mask moves', async () => {
  const p = project(), tl = createTimeline(p), k = p.sequences[0].channels[1].clips[0];
  const { ev } = await play(p, 40);
  const inc = tl.exec('addMask', { clipId: k.id, mode: 'include', feather: 0 });
  tl.exec('addMaskStroke', { maskId: inc, stroke: { type: 'rect', x: 0, y: 0, w: 1, h: 1 } }); ev.invalidate();
  let r = await ev.render(33); assert.ok(33 - r.from < 8, `an include mask mixes after the state: resumes from a checkpoint (from ${r.from})`);
  tl.exec('removeMask', { id: inc });
  tl.exec('addMaskStroke', { clipId: k.id, mode: 'lock', stroke: { pts: [0.5, 0.5], r: 5 } }); ev.invalidate();
  r = await ev.render(33); assert.ok(33 - r.from >= 8, `a lock refreshes inside the loop: its state is new (from ${r.from})`);
  assert.equal(fnv1a(new Float32Array(r.image)), fnv1a(new Float32Array(h16(F.frame(33)))), 'fully locked = clean');
  const m = k.masks[0]; tl.exec('setValue', { id: m.id, path: ['opacity'], value: 0 });
  tl.exec('animate', { id: m.id, path: ['x'], at: 0 }); tl.exec('setValue', { id: m.id, path: ['x'], value: 0.5, at: 30 });
  const res = (t) => resolveMasks(k.masks, t)[0].x;
  assert.equal(res(0), 0); assert.equal(res(30), 0.5); assert.ok(res(15) > 0 && res(15) < 0.5, 'clip-relative keys interpolate');
});

test('a lock does nothing: the loop history under it is the source, every frame', () => {
  const cfg = { ...PRESETS['Xvid classic'], seed: 3 }, L = createLoopRef({ w: W, h: H }, cfg), keep = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) keep.fill(x < W / 2 ? 0 : 1, (y * W + x) * 4, (y * W + x) * 4 + 4);   // left half locked
  const free = createLoopRef({ w: W, h: H }, cfg); L.begin(0); free.begin(0);
  let moshedRight = false;
  for (let t = 0; t < 30; t++) {
    const src = h16(F.frame(t)), o = L.step(t, { src, lock: keep }).out, f = free.step(t, { src }).out;
    assert.equal(half(o, true), half(src, true), `left half is the source at ${t}`);
    if (half(o, false) !== half(src, false)) moshedRight = true;
    if (t > 0) assert.notEqual(half(f, true), half(src, true), `without the lock the left half moshes at ${t}`);
  }
  assert.ok(moshedRight, 'the free half still moshes');
});

// The pre-D42 raster (every pixel against every shape), kept as the reference the fast raster must equal bit for bit.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
function shapeCov(s, px, py, A, fe) {
  let d;                                                   // signed distance in height units: < 0 inside
  if (s.type === 'stroke') {
    const p = s.pts, r = s.r; d = Infinity;
    if (p.length === 2) d = dhypot(px - p[0] * A, py - p[1]) - r;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i] * A, ay = p[i + 1], bx = p[i + 2] * A, by = p[i + 3], vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
      const u = l2 > 0 ? clamp01(((px - ax) * vx + (py - ay) * vy) / l2) : 0;
      const e = dhypot(px - (ax + u * vx), py - (ay + u * vy)) - r; if (e < d) d = e;
    }
  } else if (s.type === 'ellipse') {
    const dx = (px - s.cx * A) / (s.rx * A), dy = (py - s.cy) / s.ry, k = dhypot(dx, dy);
    d = (k - 1) * Math.min(s.rx * A, s.ry);
  } else if (s.type === 'rect') {
    const cx = (s.x + s.w / 2) * A, cy = s.y + s.h / 2, qx = Math.abs(px - cx) - (s.w * A) / 2, qy = Math.abs(py - cy) - s.h / 2;
    d = dhypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
  } else return 0;
  return fe > 0 ? clamp01(0.5 - d / fe) : d <= 0 ? 1 : 0;
}
function rasterMasksRef(masks, mw, mh, A) {
  if (!masks || !masks.length) return null;
  const inc = masks.filter((m) => m.mode === 'include'), lock = masks.filter((m) => m.mode === 'lock'), out = new Float32Array(mw * mh * 4);
  const cov = (m, x, y) => {
    // inverse of the mask transform about the frame centre (A / 2, 1 / 2): translate, rotate, scale
    const th = (-m.rotation * Math.PI) / 180, [s, c] = dsincos(th), sc = Math.max(1e-3, m.scale);
    const dx = x - A / 2 - m.x * A, dy = y - 0.5 - m.y, px = (dx * c - dy * s) / sc + A / 2, py = (dx * s + dy * c) / sc + 0.5, fe = Math.max(0, m.feather) / sc;
    let v = 0; for (const sh of m.shapes) { const q = shapeCov(sh, px, py, A, fe); if (q > v) v = q; if (v >= 1) break; }
    return (m.invert ? 1 - v : v) * clamp01(m.opacity);
  };
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
    const x = ((i + 0.5) / mw) * A, y = (j + 0.5) / mh;
    let a = inc.length ? 0 : 1; for (const m of inc) { const q = cov(m, x, y); if (q > a) a = q; }
    let l = 0; if (a > 0) for (const m of lock) { const q = cov(m, x, y); if (q > l) l = q; }
    const v = Math.round(a * (1 - l) * 1024) / 1024, o = (j * mw + i) * 4;   // 1/1024 steps: exact in half floats
    out[o] = out[o + 1] = out[o + 2] = out[o + 3] = v;
  }
  return out;
}

test('the fast raster (shapes over their reach) equals the reference raster bit for bit', () => {
  let seed = 11; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const shapeOf = () => {
    const t = rnd();
    if (t < 0.4) { const pts = []; const n = 1 + Math.floor(rnd() * 30); for (let i = 0; i < n; i++) pts.push(rnd(), rnd()); return { type: 'stroke', pts, r: 0.01 + rnd() * 0.1 }; }
    if (t < 0.7) return { type: 'ellipse', cx: rnd(), cy: rnd(), rx: 0.02 + rnd() * 0.3, ry: 0.02 + rnd() * 0.3 };
    return { type: 'rect', x: rnd() - 0.2, y: rnd() - 0.2, w: rnd() * 0.6, h: rnd() * 0.6 };
  };
  for (let trial = 0; trial < 40; trial++) {
    const masks = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => ({ ...createMask(rnd() < 0.6 ? 'include' : 'lock', { feather: rnd() < 0.2 ? 0 : rnd() * 0.1, invert: rnd() < 0.2 }),
      x: (rnd() - 0.5) * 0.4, y: (rnd() - 0.5) * 0.4, scale: 0.5 + rnd() * 1.5, rotation: (rnd() - 0.5) * 360, opacity: rnd() < 0.3 ? rnd() : 1,
      shapes: Array.from({ length: 1 + Math.floor(rnd() * 3) }, shapeOf) }));
    const [mw, mh, A] = trial % 2 ? [96, 54, 16 / 9] : [64, 80, 0.8];
    assert.deepEqual(rasterMasks(masks, mw, mh, A), rasterMasksRef(masks, mw, mh, A), `trial ${trial}`);
  }
});
