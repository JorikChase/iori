// M4 pure logic: governor, limits, content-ID plan, export plan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGovernor, SCALES, fitSize, importLimits, contentIdPlan, exportPlan } from '../governor.js';
import { TIER_LIMITS } from '../platform.js';

test('governor steps down after a window of slow frames, up after a long calm, never past the ends', () => {
  const g = createGovernor({ budgetMs: 33, window: 10, upAfter: 20 });
  for (let i = 0; i < 9; i++) assert.equal(g.feed(50), false);
  assert.equal(g.feed(50), true); assert.equal(g.scale(), 0.75);
  for (let i = 0; i < 100; i++) g.feed(60); assert.equal(g.scale(), SCALES[SCALES.length - 1], 'bottom');
  for (let i = 0; i < 9; i++) g.feed(5); let ups = 0; for (let i = 0; i < 400; i++) if (g.feed(5)) ups++;
  assert.equal(g.scale(), 1); assert.equal(ups, SCALES.length - 1);
});
test('governor holds when frames are within budget, and a pin overrides it', () => {
  const g = createGovernor({ budgetMs: 33, window: 10 }); for (let i = 0; i < 200; i++) g.feed(30); assert.equal(g.scale(), 1);
  g.pin(2); for (let i = 0; i < 50; i++) g.feed(500); assert.equal(g.scale(), 0.5); g.pin(null); assert.equal(g.index, 0);
});
test('fitSize keeps aspect, even sizes, never upscales', () => {
  assert.deepEqual(fitSize(3840, 2160, 1920, 1080), [1920, 1080]); assert.deepEqual(fitSize(1080, 1920, 1280, 720), [406, 720]);
  assert.deepEqual(fitSize(640, 360, 1920, 1080), [640, 360]); assert.deepEqual(fitSize(1001, 501, 500, 500), [500, 250]);
});
test('import limits: tier caps, warnings for long or heavy clips', () => {
  const clip = { w: 3840, h: 2160, seconds: 1200, fps: 30 };
  const t0 = importLimits(clip, 0, TIER_LIMITS[0], { decodeFps: 12 }), t3 = importLimits(clip, 3, TIER_LIMITS[3]);
  assert.deepEqual(t0.export, [1280, 720]); assert.equal(t0.maxSeconds, 120); assert.ok(t0.warnings.length >= 3, t0.warnings.join(' | '));
  assert.deepEqual(t3.export, [3840, 2160]); assert.equal(t3.maxSeconds, Infinity); assert.equal(t3.warnings.length, 0);
});
test('content-ID plan samples small files whole, large files at three places', () => {
  assert.deepEqual(contentIdPlan(1000), [[0, 1000]]);
  const p = contentIdPlan(10 << 20); assert.equal(p.length, 3); assert.deepEqual(p[0], [0, 1 << 20]); assert.deepEqual(p[2], [(10 << 20) - (1 << 20), 10 << 20]);
});
test('export plan clamps the range and counts frames', () => {
  assert.deepEqual(exportPlan({ duration: 600, fps: 30 }), { start: 0, end: 600, frames: 18000 });
  assert.deepEqual(exportPlan({ duration: 10, fps: 25 }, { start: 2, end: 99 }), { start: 2, end: 10, frames: 200 });
});
