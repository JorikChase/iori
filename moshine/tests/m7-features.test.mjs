// M7 step 1: audio features — per-frame loudness, bands and onsets, streaming and deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFeatureExtractor, featureAt, encodeFeatures, decodeFeatures, FEATURES } from '../features.js';

const sr = 48000, fps = { num: 30, den: 1 };
/** 2 s: silence, then a 60 Hz tone (0.5 s–1 s), silence, then a 5 kHz tone from 1.5 s. */
function signal() {
  const x = new Float32Array(sr * 2);
  for (let i = 0; i < x.length; i++) { const t = i / sr; if (t >= 0.5 && t < 1) x[i] = 0.8 * Math.sin(2 * Math.PI * 60 * t); if (t >= 1.5) x[i] = 0.5 * Math.sin(2 * Math.PI * 5000 * t); }
  return x;
}
function run(x, chunk) { const e = createFeatureExtractor({ sampleRate: sr, fps }); for (let i = 0; i < x.length; i += chunk) e.push(x.subarray(i, i + chunk)); return e.finish(); }

test('one row per video frame; bands separate a bass tone from a high one; silence is zero', () => {
  const t = run(signal(), 4096);
  assert.equal(t.frames, 60); assert.deepEqual(t.features, FEATURES);
  const f = (name, k) => featureAt(t, name, k);
  assert.equal(f('rms', 5), 0, 'silence');
  assert.ok(f('bass', 22) > 0.5 && f('high', 22) < 0.05, `bass tone: bass ${f('bass', 22)}, high ${f('high', 22)}`);
  assert.ok(f('high', 55) > 0.5 && f('bass', 55) < 0.05, `high tone: high ${f('high', 55)}, bass ${f('bass', 55)}`);
  assert.ok(FEATURES.every((n) => { for (let k = 0; k < 60; k++) { const v = f(n, k); if (!(v >= 0 && v <= 1)) return false; } return true; }), 'normalised to 0..1');
});

test('onsets mark where the sound starts, not where it holds', () => {
  const t = run(signal(), 1000), on = Array.from({ length: 60 }, (_, k) => featureAt(t, 'onset', k));
  const peak = (a, b) => { let m = a; for (let k = a; k < b; k++) if (on[k] > on[m]) m = k; return m; };
  assert.ok(Math.abs(peak(10, 25) - 15) <= 1, `bass onset near frame 15: ${peak(10, 25)}`);
  assert.ok(Math.abs(peak(40, 60) - 45) <= 1, `high onset near frame 45: ${peak(40, 60)}`);
  assert.ok(on[22] < on[15] / 4, 'a held tone is no onset');
});

test('chunking does not matter; storage round-trips; out of range clamps', () => {
  const a = run(signal(), 4096), b = run(signal(), 333);
  assert.deepEqual(a.data, b.data);
  const back = decodeFeatures(encodeFeatures(a)); assert.deepEqual(back.data, a.data); assert.equal(back.frames, 60); assert.deepEqual(back.fps, fps);
  assert.equal(featureAt(a, 'rms', 999), featureAt(a, 'rms', 59)); assert.equal(featureAt(null, 'rms', 3), 0); assert.equal(featureAt(a, 'nope', 3), 0);
});
