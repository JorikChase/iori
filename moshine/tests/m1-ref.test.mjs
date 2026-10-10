// M1 CPU reference: estimator accuracy against fixture truth, cut detection, bloom timing, field ops, the
// code stage and loop determinism.   node --test 'moshine/tests/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../fixtures.js';
import { luma, pyramid, levelsFor, matchBlocks, fieldOp, warp, code, createLoopRef, fieldEPE, lostAt, FLAG } from '../engine-ref.js';
import { resolve, resolveAll, holdAt } from '../params.js';
import { normalize, opDefaults, PRESETS, toMoshID, fromMoshID } from '../config.js';
import { fnv1a, toHalfArray, fromHalfArray } from '../util.js';

const pyr = (f, t, block = 16) => pyramid(luma(f.frame(t), f.w, f.h), f.w, f.h, levelsFor(block));
const est = (f, t, o = {}) => matchBlocks(pyr(f, t), pyr(f, t - 1), { block: 16, search: 16, lambda: 0.002, pel: 2, cutMad: 0.05, ...o });

// ---- estimator
for (const [name, t] of [['pan', 7], ['square', 9], ['cut', 47]]) {
  test(`estimator recovers the true field on ${name}[${t}] (median EPE 0, p90 <= 0.5 px)`, () => {
    const f = fixture(name), e = est(f, t), r = fieldEPE(e.field, f.field(t), f.exactMask(t), f);
    assert.ok(r.blocks > 40, `blocks ${r.blocks}`);
    assert.ok(r.median === 0 && r.p90 <= 0.5, JSON.stringify(r));
  });
}
test('estimator handles large motion through the pyramid (pan 13, -7)', () => {
  const f = fixture('pan', { pan: [13, -7] }), e = est(f, 5), r = fieldEPE(e.field, f.field(5), f.exactMask(5), f);
  assert.ok(r.median === 0 && r.p90 <= 0.5, JSON.stringify(r));
});
test('estimator finds half-pel motion with pel 2 (pan 1.5 px emulated by 2x downsampled pan 3)', () => {
  // a 3 px pan at 640x360, box-downsampled to 320x180, is a 1.5 px pan with exact half-pel interpolation
  const big = fixture('pan', { w: 640, h: 360, pan: [3, 0] }), half = (t) => {
    const s = big.frame(t), o = new Float32Array(320 * 180 * 4);
    for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) for (let k = 0; k < 4; k++) o[(y * 320 + x) * 4 + k] = (s[(2 * y * 640 + 2 * x) * 4 + k] + s[(2 * y * 640 + 2 * x + 1) * 4 + k] + s[((2 * y + 1) * 640 + 2 * x) * 4 + k] + s[((2 * y + 1) * 640 + 2 * x + 1) * 4 + k]) / 4;
    return o;
  };
  const P = (t) => pyramid(luma(half(t), 320, 180), 320, 180, 3);
  const e = matchBlocks(P(5), P(4), { block: 16, search: 16, lambda: 0.002, pel: 2, cutMad: 0.12 }).field;
  let hits = 0, n = 0;
  for (let by = 1; by < 10; by++) for (let bx = 1; bx < 19; bx++) { const i = (by * 20 + bx) * 4; n++; if (e[i] === 1.5 && e[i + 1] === 0) hits++; }
  assert.ok(hits / n > 0.9, `${hits}/${n} interior blocks at exactly (1.5, 0)`);
});
test('scene cut: nearly every block exceeds cutMad at the cut, almost none elsewhere', () => {
  const f = fixture('cut'), nb = f.bw * f.bh;
  assert.ok(est(f, f.cut).cut > nb * 0.8, 'at the cut');
  assert.ok(est(f, f.cut + 5).cut < nb * 0.1, 'after the cut');
  assert.ok(est(f, f.cut - 5).cut === 0, 'before the cut (static bars)');
});

// ---- params, bloom, Mosh ID
test('keyframes: hold, linear, ease, clamped ends', () => {
  const v = { keys: [{ frame: 10, value: 0, interp: 'linear' }, { frame: 20, value: 10, interp: 'hold' }, { frame: 30, value: 0 }] };
  assert.deepEqual([0, 10, 15, 20, 25, 40].map((t) => resolve(v, t)), [0, 0, 5, 10, 10, 0]);
  assert.equal(resolve({ value: 3 }, 99), 3); assert.equal(resolve(7, 1), 7);
  assert.deepEqual(resolveAll({ a: { keys: [{ frame: 0, value: 0 }, { frame: 4, value: 8 }] }, b: [1, { value: 2 }], c: 'x' }, 2), { a: 4, b: [1, 2], c: 'x' });
});
test('bloom hold window: every n, phase, hits, latest wins, the I-frame never triggers', () => {
  const b = { repeat: 3, every: 10, phase: 0, hits: [14] };
  assert.deepEqual([0, 1, 9, 10, 11, 12, 13, 14, 15, 16, 17, 20].map((t) => holdAt(t, b)), [-1, -1, -1, 0, 1, 2, -1, 0, 1, 2, -1, 0]);
  assert.equal(holdAt(5, { repeat: 0, every: 2 }), -1);
  // hits with their own length fire even with repeat 0; a later trigger wins; plain hits use repeat
  const c = { repeat: 0, every: 0, phase: 0, hits: [{ at: 4, len: 3 }, { at: 6, len: 2 }] };
  assert.deepEqual([3, 4, 5, 6, 7, 8].map((t) => holdAt(t, c)), [-1, 0, 1, 0, 1, -1]);
  assert.deepEqual([9, 10, 11, 12].map((t) => holdAt(t, { repeat: 2, hits: [10, { at: 11, len: 0 }] })), [-1, 0, 0, 1]);
  assert.equal(holdAt(3, { repeat: 0, hits: [3] }), -1, 'a plain hit with no repeat does nothing');
});
test('Mosh ID round trip', () => {
  for (const c of Object.values(PRESETS)) assert.deepEqual(fromMoshID(toMoshID(c)), normalize(c));
});

// ---- field ops
const geo = { w: 320, h: 180, block: 16, t: 5, seed: 1 }, nb = 20 * 12;
const rnd = () => { const f = new Float32Array(nb * 4); for (let i = 0; i < nb; i++) { f[i * 4] = (i % 7) - 3; f[i * 4 + 1] = (i % 5) - 2; f[i * 4 + 2] = (i % 11) / 50; } return f; };
test('pan and multiply are exact', () => {
  const a = rnd(), p = fieldOp(a, { op: 'pan', x: 2, y: -1 }, geo), m = fieldOp(a, { op: 'multiply', gx: 0, gy: 2 }, geo);
  for (let i = 0; i < nb; i++) { assert.equal(p[i * 4], a[i * 4] + 2); assert.equal(p[i * 4 + 1], a[i * 4 + 1] - 1); assert.ok(m[i * 4] === 0, 'gx 0 (±0)'); assert.equal(m[i * 4 + 1], a[i * 4 + 1] * 2); }
});
test('lost sectors: stateless, density-proportional, flagged, held still', () => {
  const o = { ...opDefaults('lost'), density: 0.3 }, a = rnd(), out = fieldOp(a, o, geo);
  let lost = 0; for (let i = 0; i < nb; i++) if (out[i * 4 + 3] & FLAG.lost) { lost++; assert.equal(out[i * 4], 0); assert.equal(out[i * 4 + 1], 0); }
  assert.ok(lost > nb * 0.15 && lost < nb * 0.75, `lost ${lost} of ${nb}`);
  assert.equal(lostAt(3, 4, 5, o, 1), lostAt(3, 4, 5, o, 1));
  let changes = 0; for (let t = 0; t < 120; t++) if (lostAt(3, 4, t, o, 1) !== lostAt(3, 4, t + 1, o, 1)) changes++;
  assert.ok(changes > 0 && changes <= 120 / o.life + 2, `a cell changes at most once per life (${changes})`);
});
test('smooth of a constant field is the field; skip zeroes small vectors', () => {
  const c = new Float32Array(nb * 4).map((_, i) => (i % 4 === 0 ? 2 : i % 4 === 1 ? -1 : 0));
  assert.deepEqual(fieldOp(c, { op: 'smooth', radius: 2 }, geo), c);
  const s = fieldOp(rnd(), { op: 'skip', eps: 1.5, mad: 1 }, geo);
  for (let i = 0; i < nb; i++) if (s[i * 4 + 3] & FLAG.skip) assert.ok(s[i * 4] === 0 && s[i * 4 + 1] === 0);
});
test('synthetic zoom points outward from the centre, rotate is tangential', () => {
  const z = fieldOp(new Float32Array(nb * 4), { ...opDefaults('synthetic'), kind: 'zoom', strength: 0.1 }, geo);
  assert.ok(z[0] < 0 && z[1] < 0, 'top-left block: vector toward top-left (content flows outward)');
  const r = fieldOp(new Float32Array(nb * 4), { ...opDefaults('synthetic'), kind: 'rotate', strength: 0.05 }, geo), i = (6 * 20 + 19) * 4;
  assert.ok(Math.abs(r[i + 1]) > Math.abs(r[i]), 'right edge, middle row: mostly vertical');
});

// ---- code stage
test('code: hard reset copies the reset source; lost blocks keep the prediction', () => {
  const f = fixture('cut'), src = f.frame(50), pred = f.frame(10), field = new Float32Array(f.bw * f.bh * 4);
  const u = { t: 50, seed: 1, hard: true, cut: false, honourCut: 0, intraMad: 1, intraRate: 0, blocks: 0, sweepBand: 0, sweepSpeed: 0, resGain: 0, resSteps: 16, resMode: 'detail', allowCode: true };
  assert.deepEqual(code(src, src, pred, field, f, u), src);
  field[3] = 4; const blocks = code(src, src, pred, field, f, { ...u, hard: false, blocks: 1 });
  assert.equal(blocks[0], pred[0], 'lost block 0 untouched'); assert.equal(blocks[(5 * f.w + 100) * 4], src[(5 * f.w + 100) * 4], 'other blocks refreshed');
});
test('code: full residual with fine steps moves prediction luma toward the source', () => {
  const f = fixture('cut'), src = f.frame(50), pred = f.frame(10), field = new Float32Array(f.bw * f.bh * 4);
  const out = code(src, src, pred, field, f, { t: 50, seed: 1, hard: false, cut: false, honourCut: 0, intraMad: 1, intraRate: 0, blocks: 0, sweepBand: 0, sweepSpeed: 0, resGain: 1, resSteps: 64, resMode: 'full', allowCode: true });
  const Ys = luma(src, f.w, f.h), Yp = luma(pred, f.w, f.h), Yo = luma(out, f.w, f.h); let before = 0, after = 0;
  for (let i = 0; i < Ys.length; i++) { before += Math.abs(Ys[i] - Yp[i]); after += Math.abs(Ys[i] - Yo[i]); }
  assert.ok(after < before * 0.5, `${after.toFixed(1)} < ${before.toFixed(1)} / 2`);
});

// ---- the loop
const run = (cfg, name = 'cut', upto) => { const f = fixture(name), L = createLoopRef(f, cfg); L.begin(0); let r; for (let t = 0; t <= (upto ?? f.count - 1); t++) r = L.step(t, { src: f.frame(t) }); return { r, f }; };
test('loop: Xvid classic keeps scene A after the cut (the mosh) and is deterministic', () => {
  const { r, f } = run(PRESETS['Xvid classic'], 'cut', 60), again = run(PRESETS['Xvid classic'], 'cut', 60).r;
  assert.equal(fnv1a(r.out), fnv1a(again.out));
  const A = f.frame(f.cut - 1), B = f.frame(60); let dA = 0, dB = 0;
  for (let i = 0; i < A.length; i += 4) { dA += Math.abs(r.out[i] - A[i]); dB += Math.abs(r.out[i] - B[i]); }
  assert.ok(dA < dB, `output closer to scene A (${dA.toFixed(0)}) than scene B (${dB.toFixed(0)})`);
});
test('loop: honouring every cut (honourCut 1) shows scene B instead', () => {
  const at = run(normalize({ reset: { honourCut: 1 } }), 'cut', 40), f = at.f;
  assert.equal(fnv1a(at.r.out), fnv1a(fromHalfArray(toHalfArray(f.frame(40)))), 'the cut frame is an exact I-frame (stored as half floats)');
  const { r } = run(normalize({ reset: { honourCut: 1 } }), 'cut', 41), B = f.frame(41); let s = 0, far = 0;
  for (let i = 0; i < B.length; i += 4) { const d = Math.abs(r.out[i] - B[i]); s += d; if (d > 0.05) far++; }
  assert.ok(s / (B.length / 4) < 0.01 && far < B.length / 4 * 0.05, `one tracked frame later: mean ${(s / (B.length / 4)).toFixed(4)}, ${far} px off (disocclusions)`);
});
test('loop: bloom holds the frozen field, scaled by accel^k', () => {
  const f = fixture('pan'), L = createLoopRef(f, normalize({ bloom: { repeat: 5, every: 10, accel: 1.1 } })); L.begin(0); let frozen;
  for (let t = 0; t <= 14; t++) { const r = L.step(t, { src: f.frame(t) }); if (t === 10) { assert.equal(r.hold, 0); frozen = r.field; } if (t > 10) { assert.equal(r.hold, t - 10); assert.equal(r.field, frozen); assert.equal(r.est, null); } }
});
