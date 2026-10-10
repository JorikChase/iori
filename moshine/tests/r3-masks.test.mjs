// R3: include and lock masks — the raster, the commands, and the evaluator's mix with the clean picture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rasterMasks, createMask, resolveMasks, maskSize } from '../masks.js';
import { createEvaluator, cpuBackend } from '../sequence.js';
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

test('a lock over everything gives the clean picture; strokes do not void checkpoints; a keyframed mask moves', async () => {
  const p = project(), tl = createTimeline(p), k = p.sequences[0].channels[1].clips[0];
  const { ev } = await play(p, 40);
  tl.exec('addMaskStroke', { clipId: k.id, mode: 'lock', stroke: { pts: [0.5, 0.5], r: 5 } }); ev.invalidate();
  const r = await ev.render(33); assert.ok(33 - r.from < 8, `still resumes from a checkpoint (from ${r.from})`);
  assert.equal(fnv1a(new Float32Array(r.image)), fnv1a(new Float32Array(h16(F.frame(33)))), 'fully locked = clean');
  const m = k.masks[0]; tl.exec('setValue', { id: m.id, path: ['opacity'], value: 0 });
  tl.exec('animate', { id: m.id, path: ['x'], at: 0 }); tl.exec('setValue', { id: m.id, path: ['x'], value: 0.5, at: 30 });
  const res = (t) => resolveMasks(k.masks, t)[0].x;
  assert.equal(res(0), 0); assert.equal(res(30), 0.5); assert.ok(res(15) > 0 && res(15) < 0.5, 'clip-relative keys interpolate');
});
