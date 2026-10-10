// M3: optical flow, the effect library (fx-ref.js), new field ops, smooth interpolation, GOP keep, effect chains.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../fixtures.js';
import { luma, pyramid, flowCells, fieldEPE, fieldOp, warp, createLoopRef } from '../engine-ref.js';
import { fxApply, fxChain, DCT_T, ZIGZAG, roundEven } from '../fx-ref.js';
import { normalize, fxDefaults, opDefaults, FX, PRESETS } from '../config.js';
import { compare } from '../metrics.js';
import { fnv1a } from '../util.js';

const f = fixture('square'), img = f.frame(9), ctx = { w: f.w, h: f.h, block: 16, t: 7, seed: 3, field: null };
const maxd = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
const P = (fx, t, block = 8) => pyramid(luma(fx.frame(t), fx.w, fx.h), fx.w, fx.h, 3);

// ---- optical flow
test('flow recovers an exact sub-pixel pan (1.5, -0.5): a 2x box-downsampled integer pan', () => {
  const big = fixture('pan', { w: 640, h: 352, pan: [3, -1] }), half = (t) => {
    const s = big.frame(t), o = new Float32Array(320 * 176 * 4);
    for (let y = 0; y < 176; y++) for (let x = 0; x < 320; x++) for (let k = 0; k < 4; k++) o[(y * 320 + x) * 4 + k] = (s[(2 * y * 640 + 2 * x) * 4 + k] + s[(2 * y * 640 + 2 * x + 1) * 4 + k] + s[((2 * y + 1) * 640 + 2 * x) * 4 + k] + s[((2 * y + 1) * 640 + 2 * x + 1) * 4 + k]) / 4;
    return o;
  };
  const Q = (t) => pyramid(luma(half(t), 320, 176), 320, 176, 3), r = flowCells(Q(5), Q(4), { block: 16, cutMad: 0.05 }).field, errs = [];
  for (let by = 1; by < 10; by++) for (let bx = 1; bx < 19; bx++) { const i = (by * 20 + bx) * 4; errs.push(Math.hypot(r[i] - 1.5, r[i + 1] + 0.5)); }
  errs.sort((a, b) => a - b); assert.ok(errs[errs.length >> 1] <= 0.1, `median EPE ${errs[errs.length >> 1].toFixed(3)}, p90 ${errs[Math.floor(errs.length * 0.9)].toFixed(3)}`);
});
for (const [name, t, o, tol] of [['pan', 7, undefined, 0.05], ['square', 9, undefined, 0.25]]) {
  test(`flow recovers ${name}${o ? ' ' + o.pan : ''} (median EPE <= ${tol} px on exact cells)`, () => {
    const fx = fixture(name, o), r = flowCells(P(fx, t), P(fx, t - 1), { block: 16, cutMad: 0.05 });
    const e = fieldEPE(r.field, fx.field(t), fx.exactMask(t), fx);
    assert.ok(e.blocks > 30 && e.median <= tol, JSON.stringify(e));
  });
}
test('flow sees the scene cut like the matcher', () => {
  const fx = fixture('cut'); assert.ok(flowCells(P(fx, fx.cut), P(fx, fx.cut - 1), { block: 16, cutMad: 0.05 }).cut > fx.bw * fx.bh * 0.5);
});

// ---- effects: identities and directions
test('DCT tables: orthonormal, zigzag is a permutation, half-even rounding', () => {
  for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) { let s = 0; for (let x = 0; x < 8; x++) s += DCT_T[u * 8 + x] * DCT_T[v * 8 + x]; assert.ok(Math.abs(s - (u === v ? 1 : 0)) < 1e-6); }
  assert.deepEqual([...ZIGZAG].sort((a, b) => a - b), [...Array(64).keys()]); assert.equal(ZIGZAG[1], 1); assert.equal(ZIGZAG[8], 2);
  assert.deepEqual([0.5, 1.5, 2.5, -0.5, -1.5, 2.4].map(roundEven), [0, 2, 2, -0, -2, 2].map((v) => v + 0));
});
test('DCT: quality 100 is near lossless, quality 5 is blocky, DC-only flattens 8x8 blocks', () => {
  const hi = compare(fxApply({ ...fxDefaults('dct'), quality: 100 }, img, ctx).out, img, f.w, f.h), lo = compare(fxApply({ ...fxDefaults('dct'), quality: 5 }, img, ctx).out, img, f.w, f.h);
  assert.ok(hi.psnr > 38 && lo.psnr < hi.psnr - 8, JSON.stringify({ hi, lo }));
  const dc = fxApply({ ...fxDefaults('dct'), quality: 100, dcOnly: true }, img, ctx).out;
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(dc[(10 * f.w + 10) * 4 + k] - dc[(13 * f.w + 14) * 4 + k]) < 0.01, 'flat within a block');
});
test('chroma 4:2:0 keeps luma and blurs colour', () => {
  const o = fxApply(fxDefaults('chroma'), img, ctx).out, Y = (a, i) => 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
  let dy = 0; for (let i = 0; i < img.length; i += 4) dy = Math.max(dy, Math.abs(Y(o, i) - Y(img, i)));
  assert.ok(dy < 0.02, `luma kept (max diff ${dy})`); assert.ok(maxd(o, img) > 0.02, 'colour changed');
});
test('deblock smooths a hard block edge, leaves flat areas alone', () => {
  const w = 32, h = 8, a = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = x < 16 ? 0.4 : 0.48; a.set([v, v, v, 1], (y * w + x) * 4); }
  const o = fxApply({ ...fxDefaults('deblock'), grid: 16, strength: 1 }, a, { ...ctx, w, h }).out, i15 = (4 * w + 15) * 4, i16 = (4 * w + 16) * 4;
  assert.ok(o[i16] - o[i15] < a[i16] - a[i15] - 0.01, `edge step ${(a[i16] - a[i15]).toFixed(3)} -> ${(o[i16] - o[i15]).toFixed(3)}`);
  assert.equal(o[(4 * w + 5) * 4], a[(4 * w + 5) * 4]);
});
test('posterise to n levels, colour at defaults is the identity, invert 1 inverts', () => {
  const o = fxApply({ ...fxDefaults('posterise'), levels: 4 }, img, ctx).out, vals = new Set(); for (let i = 0; i < o.length; i += 4) vals.add(Math.round(o[i] * 3 * 1000));
  assert.ok([...vals].every((v) => v % 1000 === 0) && vals.size <= 4);
  assert.ok(maxd(fxApply(fxDefaults('colour'), img, ctx).out, img) < 2e-3);
  const inv = fxApply({ ...fxDefaults('colour'), invert: 1 }, img, ctx).out; assert.ok(Math.abs(inv[100] - (1 - img[100])) < 2e-3);
});
test('zero-strength glitches are identities', () => {
  for (const o of [{ ...fxDefaults('blockdrag'), prob: 0 }, { ...fxDefaults('slice'), prob: 0 }, { ...fxDefaults('rgbsplit'), dx: 0, dy: 0 }, { ...fxDefaults('stripes'), amount: 0 }, { ...fxDefaults('displace'), gain: 0 }])
    assert.equal(fnv1a(fxApply(o, img, ctx).out), fnv1a(img), o.fx);
});
test('echo decays toward the input; freeze holds frozen blocks from the previous output', () => {
  const st = []; fxChain([fxDefaults('echo')], img, ctx, st); const o = fxChain([{ ...fxDefaults('echo'), decay: 0.5 }], f.frame(20), ctx, st);
  const i = 4000; assert.ok(Math.abs(o[i] - (0.5 * f.frame(20)[i] + 0.5 * img[i])) < 1e-6);
  const fs = [], fz = { ...fxDefaults('freeze'), density: 1 }; fxChain([fz], img, ctx, fs); assert.equal(fnv1a(fxChain([fz], f.frame(30), ctx, fs)), fnv1a(img));
});
test('slice shifts whole rows, wrapping', () => {
  const o = fxApply({ ...fxDefaults('slice'), prob: 1, height: 4, shift: 50 }, img, ctx).out;
  let moved = 0; for (let y = 0; y < f.h; y++) if (o[y * f.w * 4] !== img[y * f.w * 4]) moved++; assert.ok(moved > f.h * 0.5);
});
test('every FX type runs at defaults and returns finite pixels', () => {
  const fld = new Float32Array(f.bw * f.bh * 4).map((_, i) => (i % 4 < 2 ? (i % 7) - 3 : 0));
  for (const k of Object.keys(FX)) { const o = fxApply(fxDefaults(k), img, { ...ctx, field: fld }, img).out; assert.ok(o.every(Number.isFinite), k); }
});

// ---- field ops
const nb = f.bw * f.bh, fld = new Float32Array(nb * 4); for (let i = 0; i < nb; i++) { fld[i * 4] = (i % 9) - 4; fld[i * 4 + 1] = ((i * 5) % 7) - 3; }
test('selective amplify scales exactly pct of the blocks, the fastest ones', () => {
  const o = fieldOp(fld, { ...opDefaults('amplify'), pct: 0.25, gain: 2 }, { ...ctx }), changed = [];
  for (let i = 0; i < nb; i++) if (o[i * 4] !== fld[i * 4] || o[i * 4 + 1] !== fld[i * 4 + 1]) changed.push(Math.hypot(fld[i * 4], fld[i * 4 + 1]));
  const allMag = [...Array(nb).keys()].map((i) => Math.hypot(fld[i * 4], fld[i * 4 + 1])).sort((a, b) => b - a);
  assert.ok(changed.length <= Math.ceil(nb * 0.25) && Math.min(...changed) >= allMag[Math.ceil(nb * 0.25)] - 1e-9, `${changed.length} of ${nb}`);
});
test('mosh map: black map stops motion, white map keeps it', () => {
  const black = new Float32Array(img.length).fill(0), white = new Float32Array(img.length).fill(1);
  const o0 = fieldOp(fld, opDefaults('map'), { ...ctx, map: black }), o1 = fieldOp(fld, opDefaults('map'), { ...ctx, map: white });
  for (let i = 0; i < nb; i++) { assert.ok(o0[i * 4] === 0 && o0[i * 4 + 1] === 0); assert.equal(o1[i * 4], fld[i * 4]); }
});
test('smooth interpolation of a constant field equals block warping', () => {
  const c = new Float32Array(nb * 4); for (let i = 0; i < nb; i++) { c[i * 4] = 3; c[i * 4 + 1] = -2; }
  assert.equal(fnv1a(warp(img, c, { ...ctx, interp: 'smooth' })), fnv1a(warp(img, c, ctx)));
});

// ---- the loop
test('gopKeep 0 never resets, gopKeep 1 always does', () => {
  const run = (k) => { const fx = fixture('cut'), L = createLoopRef(fx, normalize({ reset: { gop: 10, gopKeep: k }, residual: { gain: 0 } })); L.begin(0); let r; for (let t = 0; t <= 60; t++) r = L.step(t, { src: fx.frame(t) }); return { r, fx }; };
  const { r: keep, fx } = run(1), { r: none } = run(0), B = fx.frame(60);
  assert.ok(compare(keep.out, B, fx.w, fx.h).ssim > 0.99, 'reset at 60 shows the source'); assert.ok(compare(none.out, B, fx.w, fx.h).ssim < 0.9, 'never reset stays moshed');
});
test('in-loop effects accumulate, post effects do not touch the history', () => {
  const fx = fixture('cut'), mk = (k) => normalize({ ...PRESETS['Pure smear'], [k]: [{ ...fxDefaults('posterise'), levels: 3 }] });
  const run = (cfg) => { const L = createLoopRef(fx, cfg); L.begin(0); let r; for (let t = 0; t <= 50; t++) r = L.step(t, { src: fx.frame(t) }); return r; };
  const plain = run(normalize(PRESETS['Pure smear'])), post = run(mk('post')), inl = run(mk('inLoop'));
  assert.equal(fnv1a(post.out), fnv1a(plain.out), 'post leaves the history alone'); assert.notEqual(fnv1a(post.display), fnv1a(post.out), 'post changes the display');
  assert.notEqual(fnv1a(inl.out), fnv1a(plain.out), 'in-loop changes the history');
});

test('codec residual keeps the ORIGINAL vectors’ residual: edited vectors glitch, unedited ones track the source (ffglitch semantics)', () => {
  const fx = fixture('pan'), run = (ops) => { const L = createLoopRef(fx, normalize({ ...PRESETS['Xvid classic'], ops })); L.begin(0); let r; for (let t = 0; t <= 20; t++) r = L.step(t, { src: fx.frame(t) }); return r; };
  const clean = compare(run([]).out, fx.frame(20), fx.w, fx.h).ssim, edited = compare(run([{ op: 'multiply', gx: 3, gy: 3 }]).out, fx.frame(20), fx.w, fx.h).ssim;
  assert.ok(clean > 0.95 && edited < clean - 0.2, `unedited ${clean.toFixed(3)}, edited ${edited.toFixed(3)}`);
});
