// metrics.js: identity, monotonicity, structure sensitivity.   node --test 'moshine/tests/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare, ssim, psnr, luma601, to8 } from '../metrics.js';
import { fixture } from '../fixtures.js';

const f = fixture('square'), a = f.frame(3), w = f.w, h = f.h;
test('identical images: SSIM 1, PSNR capped at 99', () => { const r = compare(a, a, w, h); assert.ok(Math.abs(r.ssim - 1) < 1e-9); assert.equal(r.psnr, 99); });
test('more noise scores lower on both metrics', () => {
  const noisy = (k) => a.map((v, i) => (i % 4 === 3 ? v : Math.min(1, Math.max(0, v + k * (((i * 2654435761) >>> 0) / 4294967296 - 0.5)))));
  const r1 = compare(a, noisy(0.05), w, h), r2 = compare(a, noisy(0.2), w, h);
  assert.ok(r1.ssim > r2.ssim && r1.psnr > r2.psnr, JSON.stringify([r1, r2]));
});
test('SSIM sees structure: a shifted copy scores lower than a brightness offset of similar MSE', () => {
  const Y = luma601(a, w, h), shifted = new Float32Array(Y.length), bright = Y.map((v) => v + 0.05);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) shifted[y * w + x] = Y[y * w + Math.max(0, x - 3)];
  assert.ok(ssim(Y, bright, w, h) > ssim(Y, shifted, w, h));
  assert.ok(psnr(Y, bright) < 30);
});
test('to8 quantises to 1/255 steps', () => { const q = to8(new Float32Array([0.5, 1.2, -1, 0.1234])); assert.deepEqual([...q].map((v) => Math.round(v * 255)), [128, 255, 0, 31]); });
