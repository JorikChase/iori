// Fixtures: determinism, the golden hashes, and that the ground-truth fields really are ground truth.
//   node --test moshine/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIXTURES, fixture, goldenHashes } from '../fixtures.js';
import { fnv1a } from '../util.js';
import { warp } from '../engine-ref.js';

const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url)));

test('fixtures are deterministic: two instances give the same bits', () => {
  for (const name of Object.keys(FIXTURES)) {
    const a = fixture(name), b = fixture(name), t = Math.min(5, a.count - 1);
    assert.equal(fnv1a(a.frame(t)), fnv1a(b.frame(t)), name);
    assert.equal(fnv1a(a.field(t)), fnv1a(b.field(t)), name);
  }
});

test('fixtures match the golden hashes', () => {
  assert.deepEqual(goldenHashes(), golden);
});

test('a different seed gives a different picture', () => {
  assert.notEqual(fnv1a(fixture('pan', { seed: 1 }).frame(3)), fnv1a(fixture('pan', { seed: 2 }).frame(3)));
});

test('values stay in [0, 1] with opaque alpha', () => {
  for (const name of Object.keys(FIXTURES)) {
    const f = fixture(name), px = f.frame(f.cut ?? 1);
    for (let i = 0; i < px.length; i += 4) {
      assert.ok(px[i] >= 0 && px[i] <= 1 && px[i + 1] >= 0 && px[i + 1] <= 1 && px[i + 2] >= 0 && px[i + 2] <= 1, `${name} px ${i / 4}`);
      assert.equal(px[i + 3], 1);
    }
  }
});

// The convention test: warping frame t-1 by the true field must reproduce frame t wherever the field is exact.
for (const [name, t] of [['pan', 7], ['square', 9], ['cut', 47], ['demo', 12], ['demo', 50]]) {
  test(`ground truth: warp(${name}[${t - 1}], field[${t}]) == ${name}[${t}] on the exact mask`, () => {
    const f = fixture(name), mask = f.exactMask(t);
    const got = warp(f.frame(t - 1), f.field(t), f), want = f.frame(t);
    let n = 0, bad = 0;
    for (let p = 0; p < mask.length; p++) if (mask[p]) { n++; for (let k = 0; k < 4; k++) if (got[p * 4 + k] !== want[p * 4 + k]) { bad++; break; } }
    assert.ok(n > mask.length * 0.5, `exact mask covers ${n} of ${mask.length} px`);
    assert.equal(bad, 0, `${bad} of ${n} masked pixels differ`);
  });
}

test('the cut frame has a zero field and no exact pixels (an I-frame)', () => {
  const f = fixture('cut');
  assert.ok(f.field(f.cut).every((v) => v === 0));
  assert.equal(f.exactMask(f.cut).reduce((a, b) => a + b, 0), 0);
});
