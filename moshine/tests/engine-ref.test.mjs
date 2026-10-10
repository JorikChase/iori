// CPU reference nodes and the half-float helpers.   node --test moshine/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { warp, edgeIndex, EDGE } from '../engine-ref.js';
import { toHalf, fromHalf } from '../util.js';

const img = (w, h, f) => { const a = new Float32Array(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; a[i] = f(x, y); a[i + 1] = 0; a[i + 2] = 0; a[i + 3] = 1; } return a; };
const field = (bw, bh, mx, my) => { const a = new Float32Array(bw * bh * 2); for (let i = 0; i < bw * bh; i++) { a[i * 2] = mx; a[i * 2 + 1] = my; } return a; };

test('zero field is the identity', () => {
  const a = img(37, 21, (x, y) => (x * 31 + y * 7) % 13 / 13);
  assert.deepEqual(warp(a, field(3, 2, 0, 0), { w: 37, h: 21, block: 16 }), a);
});

test('integer vector shifts content by mv (backward gather)', () => {
  const w = 16, h = 8, a = img(w, h, (x) => x / w), out = warp(a, field(1, 1, 3, 0), { w, h, block: 16 });
  for (let x = 3; x < w; x++) assert.equal(out[(2 * w + x) * 4], (x - 3) / w);
  for (let x = 0; x < 3; x++) assert.equal(out[(2 * w + x) * 4], 0, 'clamp repeats the edge column');
});

test('half-pel rounds up (floor(x + 0.5)), not to even', () => {
  const w = 8, h = 1, a = img(w, h, (x) => x), out = warp(a, field(1, 1, 0.5, 0), { w, h, block: 8 });
  assert.equal(out[4 * 4], 4, 'x=4, mv=0.5 -> source floor(4.0) = 4');
  const out2 = warp(a, field(1, 1, 1.5, 0), { w, h, block: 8 });
  assert.equal(out2[4 * 4], 3, 'x=4, mv=1.5 -> source floor(3.0) = 3');
});

test('edge modes', () => {
  assert.deepEqual([-1, 0, 4, 5].map((q) => edgeIndex(q, 5, EDGE.clamp)), [0, 0, 4, 4]);
  assert.deepEqual([-1, 5, 11].map((q) => edgeIndex(q, 5, EDGE.repeat)), [4, 0, 1]);
  assert.deepEqual([-1, -2, 5, 6, 10].map((q) => edgeIndex(q, 5, EDGE.mirror)), [0, 1, 4, 3, 0]);
});

test('the last partial block uses its own vector', () => {
  const w = 20, h = 4, a = img(w, h, (x) => x), f = new Float32Array([0, 0, 2, 0]);   // bw = 2: block 0 still, block 1 moves 2
  const out = warp(a, f, { w, h, block: 16 });
  assert.equal(out[(1 * w + 10) * 4], 10); assert.equal(out[(1 * w + 18) * 4], 16);
});

test('half floats: round trip and round-to-nearest-even', () => {
  for (const v of [0, 1, -1, 0.5, 1 / 3, 65504, 6.1e-5, 5.96e-8, 0.1]) assert.equal(fromHalf(toHalf(v)), Math.f16round ? Math.f16round(v) : fromHalf(toHalf(v)), String(v));
  assert.equal(toHalf(1 + 2 ** -11), toHalf(1), 'tie rounds to even (down)');
  assert.equal(toHalf(1 + 3 * 2 ** -11), toHalf(1 + 2 ** -9), 'tie rounds to even (up)');
  assert.equal(fromHalf(toHalf(1e6)), Infinity);
});
