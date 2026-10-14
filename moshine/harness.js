// harness.js — in-page tests, petri idiom. T0 = correctness (bit-exact where the GPU is exact), T4 = cost.
// Runs against window.__moshine; depends only on GPU promises, never on timers or rAF (a hidden tab
// throttles both). Results go to the dev server: POST /save/<name>.json -> moshine/ref/.
//
//   const H = await import('/moshine/harness.js'); await H.runAll({ tag: 'dev' })
//   node moshine/tools/bench.mjs --tag m0
import { fixture, goldenHashes } from './fixtures.js';
import { warp as warpRef, EDGE } from './engine-ref.js';
import { createImage, upload, readback, F16, F32 } from './gpu.js';
import { createWarp } from './nodes/warp.js';
import { fnv1a, toHalfArray, fromHalfArray } from './util.js';
import { storageBuffer, readBuffer, readPlane } from './gpu.js';
import { createPyramid } from './nodes/pyramid.js';
import { createMatcher } from './nodes/match.js';
import { createFieldOps } from './nodes/fieldops.js';
import { createWarpNode } from './nodes/warp.js';
import { createCodeNode } from './nodes/code.js';
import { createMoshLoop } from './engine.js';
import { luma, pyramid, levelsFor, matchBlocks, fieldOp, warp as warpRef2, code as codeRef, createLoopRef, fieldEPE } from './engine-ref.js';
import { normalize, opDefaults, fxDefaults, PRESETS, LEGACY, FX } from './config.js';
import { createFxChain } from './nodes/fx.js';
import { createFlow } from './nodes/flow.js';
import { fxApply, fxChain } from './fx-ref.js';
import { flowCells } from './engine-ref.js';

const M = () => window.__moshine;
const firstDiff = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i; return -1; };

/** One warp on the GPU: returns the readback (Float32Array for F32, half bits for F16). */
async function gpuWarp(f, t, format, edge = EDGE.clamp, prev = f.frame(t - 1)) {
  const g = M().gpu, a = createImage(g, f.w, f.h, format), b = createImage(g, f.w, f.h, format);
  const node = createWarp(g, { w: f.w, h: f.h, block: f.block, format, edge });
  upload(g, a, prev); node.setField(f.field(t));
  const enc = g.device.createCommandEncoder(); node.encode(enc, a, b); g.device.queue.submit([enc.finish()]);
  const out = await readback(g, b); a.destroy(); b.destroy(); node.destroy(); return out;
}

/** The I-frame-drop loop on the 'cut' fixture: source until the cut, then warp history by the scene-B field. */
async function moshLoopGPU(f, format) {
  const g = M().gpu, img = [createImage(g, f.w, f.h, format), createImage(g, f.w, f.h, format)];
  const node = createWarp(g, { w: f.w, h: f.h, block: f.block, format }); let cur = 0;
  for (let t = 0; t < f.count; t++) {
    if (t < f.cut) { upload(g, img[cur], f.frame(t)); continue; }
    node.setField(f.field(t)); const enc = g.device.createCommandEncoder(); node.encode(enc, img[cur], img[1 - cur]); g.device.queue.submit([enc.finish()]); cur = 1 - cur;
  }
  const out = await readback(g, img[cur]); img.forEach((x) => x.destroy()); node.destroy(); return out;
}
function moshLoopCPU(f) {
  let h = null;
  for (let t = 0; t < f.count; t++) h = t < f.cut ? f.frame(t) : warpRef(h, f.field(t), f);
  return h;
}

export const T0 = {
  async device() {
    const g = M().gpu, i = g.info;
    return { pass: !!g.device, adapter: [i.vendor, i.architecture, i.description].filter(Boolean).join(' '), level: g.level, features: [...g.features], coi: self.crossOriginIsolated === true, tier: M().probe.tier };
  },
  // the page computes the same fixture bits as node (tests/golden.json was written by node)
  async goldenFixtures() {
    const want = await (await fetch(new URL('./tests/golden.json', import.meta.url))).json(), got = goldenHashes();
    const bad = []; for (const n of Object.keys(want)) for (const t of Object.keys(want[n])) if (JSON.stringify(want[n][t]) !== JSON.stringify(got[n]?.[t])) bad.push(`${n}@${t}`);
    return { pass: bad.length === 0, mismatches: bad };
  },
  // GPU warp == CPU reference, bit for bit, every edge mode, both formats
  async warpParity() {
    const f = fixture('square'), t = 9, rows = {};
    const field = f.field(t).map((v, i) => v * 7 + ((i % 3) - 1) * 23);                // big vectors so edges are exercised
    const ff = { ...f, field: () => field };
    for (const [ename, edge] of Object.entries(EDGE)) {
      const ref = warpRef(f.frame(t - 1), field, { ...f, edge });
      const g32 = await gpuWarp(ff, t, F32, edge), g16 = await gpuWarp(ff, t, F16, edge), r16 = toHalfArray(ref);
      rows[ename] = { f32: firstDiff(g32, ref), f16: firstDiff(g16, r16) };
    }
    return { pass: Object.values(rows).every((r) => r.f32 === -1 && r.f16 === -1), firstDiffIndex: rows };
  },
  // GPU warp of frame t-1 by the true field reproduces frame t on the exact mask (the motion convention, on the GPU)
  async warpTruth() {
    const rows = {};
    for (const [name, t] of [['pan', 7], ['square', 9], ['cut', 47]]) {
      const f = fixture(name), mask = f.exactMask(t), got = await gpuWarp(f, t, F32), want = f.frame(t); let n = 0, bad = 0;
      for (let p = 0; p < mask.length; p++) if (mask[p]) { n++; for (let k = 0; k < 4; k++) if (got[p * 4 + k] !== want[p * 4 + k]) { bad++; break; } }
      rows[name] = { masked: n, bad };
    }
    return { pass: Object.values(rows).every((r) => r.bad === 0 && r.masked > 0), rows };
  },
  // 80 recurrent warp steps: the GPU feedback loop equals the CPU loop bit for bit, and replays identically
  // M8: every field op and every effect (fractional params, in the loop and after it), a sine modulator and the bloom's
  // acceleration, each in a Mosh Loop on the 'pan' fixture (motion everywhere): GPU == CPU bit for bit, and a hash per case so the browsers
  // can be compared (they must all print the same hashes)
  async crossHashes() {
    const f = fixture('pan'), n = 24, g = M().gpu, base = PRESETS['Xvid classic'];
    const ops = [{ op: 'pan', x: 2.5, y: -1.25 }, { op: 'multiply', gx: -1.35, gy: 0.7 }, { ...opDefaults('noise'), amp: 3.25, cell: 2, hold: 3, mismatch: 0.17 }, { op: 'smooth', radius: 2 },
      ...['sinX', 'sinY', 'radial', 'checker', 'invY', 'rampX'].map((shape) => ({ ...opDefaults('gain'), shape, amount: 0.83, freq: 2.75, phase: 0.13 })),
      ...['zoom', 'rotate', 'swirl', 'shearX', 'shearY'].map((kind, k) => ({ ...opDefaults('synthetic'), kind, strength: 0.037, mode: k % 2 ? 'mix' : 'add', blend: 0.71, cx: 0.43, cy: 0.61 })),
      { ...opDefaults('lost'), density: 0.31, layers: 3, life: 7, scale: 2, aspect: 1.5 }, { op: 'skip', eps: 1.5, mad: 0.07 }, { ...opDefaults('amplify'), pct: 0.23, gain: 2.65 },
      { ...opDefaults('map'), amount: 0.77, contrast: 1.35, from: 'source' }];
    const fx = [{ ...fxDefaults('dct'), quality: 23, chroma: 1.7 }, { ...fxDefaults('chroma'), scheme: '4:1:1', dx: 1.5 }, { ...fxDefaults('deblock'), strength: 0.63, alpha: 0.215, beta: 0.095 },
      { ...fxDefaults('posterise'), levels: 9, motion: 0.45 }, { ...fxDefaults('stripes'), amount: 0.4, contrast: 0.37 }, { ...fxDefaults('echo'), decay: 0.73, warp: true }, { ...fxDefaults('echo'), decay: 0.61, mode: 'max' },
      { ...fxDefaults('displace'), gain: 1.35 }, { ...fxDefaults('blockdrag'), prob: 0.2 }, { ...fxDefaults('slice'), prob: 0.4 }, { ...fxDefaults('rgbsplit'), dx: 2.5, motion: 0.85 },
      { ...fxDefaults('colour'), hue: 37, sat: 1.43, gamma: 0.71, invert: 0.21, black: 0.07, white: 0.93 }, { ...fxDefaults('colour'), threshold: 0.43 }, { ...fxDefaults('freeze'), density: 0.35 }];
    const cases = [
      ...ops.map((o) => [`op ${o.op}${o.shape ? ':' + o.shape : o.kind ? ':' + o.kind : ''}`, { ...base, ops: [o] }]),
      ...fx.map((o, k) => [`fx ${o.fx}${k}${k % 2 ? ' post' : ''}`, k % 2 ? { ...base, post: [o] } : { ...base, inLoop: [o] }]),
      ['lfo sine on residual gain', { ...base, residual: { ...base.residual, gain: { value: 0.4, mods: [{ type: 'lfo', mode: 'add', depth: 0.3, params: { shape: 'sine', rate: 0.37, phase: 0.11 } }] } } }],
      ['bloom accel', { ...base, bloom: { ...base.bloom, repeat: 9, every: 13, accel: 1.07 } }],
      ['Fluid (integer optical flow)', PRESETS['Fluid']], ['H.264 soft (quarter pel)', PRESETS['H.264 soft']],
    ];
    // the residual modes, intra refresh, block refresh and sweep across the 'cut' fixture's scene cut (frame 40)
    const XR = PRESETS['Xvid + residual'], fc = fixture('cut'), nc = 52;
    cases.push(['cut: Xvid + residual (detail, intra)', XR, fc, nc], ['cut: full residual', { ...XR, residual: { ...XR.residual, mode: 'full', gain: 0.6, steps: 23 } }, fc, nc],
      ['cut: codec residual', { ...base, residual: { ...base.residual, gain: 0.83, steps: 27, dead: 0.017 } }, fc, nc],
      ['cut: noise + lost + smooth, bloom, refresh, sweep', { ...XR, ops: [opDefaults('lost'), { ...opDefaults('noise'), amp: 2, mismatch: 0.1 }, opDefaults('smooth')], bloom: { repeat: 12, every: 30, accel: 1.05 }, reset: { blocks: 0.003, sweepBand: 3 } }, fc, nc]);
    const rows = {};
    for (const [name, c0, fx0 = f, nx = n] of cases) {
      const f = fx0, n = nx, x = createImage(g, f.w, f.h, F16);
      const cfg = normalize(c0), G = createMoshLoop(g, f, cfg), C = createLoopRef(f, cfg); G.begin(0); C.begin(0); let r, c;
      for (let t = 0; t < n; t++) { upload(g, x, f.frame(t)); r = G.step(t, { src: x }); c = C.step(t, { src: fromHalfArray(toHalfArray(f.frame(t))) }); }
      const got = await readback(g, r.display), want = toHalfArray(c.display || c.out);
      rows[name] = { hash: fnv1a(got).toString(16), cpuEqual: fnv1a(got) === fnv1a(want) };
      console.log(`crossHashes ${Object.keys(rows).length}/${cases.length} ${name} ${rows[name].cpuEqual ? 'equal' : 'DIFFERS'}`);
      G.destroy(); x.destroy();
    }
    const bad = Object.entries(rows).filter(([, r]) => !r.cpuEqual).map(([k]) => k);
    return { pass: !bad.length, notEqual: bad, all: fnv1a(new TextEncoder().encode(JSON.stringify(Object.values(rows).map((r) => r.hash)))).toString(16), rows };
  },
  async moshReplay() {
    const f = fixture('cut'), a = await moshLoopGPU(f, F16), b = await moshLoopGPU(f, F16), ref = toHalfArray(moshLoopCPU(f));
    return { pass: fnv1a(a) === fnv1a(b) && firstDiff(a, ref) === -1, hash: fnv1a(a), steps: f.count - f.cut, replayEqual: fnv1a(a) === fnv1a(b), cpuEqual: firstDiff(a, ref) === -1 };
  },
};

// ------------------------------------------------------------------------------------------------ M1 helpers
const h16 = (a) => fromHalfArray(toHalfArray(a));                       // what the GPU sees after an f16 upload
const tex = (f, t, format = F16, data = f.frame(t)) => { const x = createImage(M().gpu, f.w, f.h, format); upload(M().gpu, x, data); return x; };
const submit = (fn) => { const g = M().gpu, enc = g.device.createCommandEncoder(); fn(enc); g.device.queue.submit([enc.finish()]); };
const frac = (n, d) => +(n / d).toFixed(5);
async function gpuPyr(f, t, levels = 3) { const g = M().gpu, x = tex(f, t), P = createPyramid(g, { w: f.w, h: f.h, levels }); submit((e) => P.encode(e, x)); x.destroy(); return P; }
const planes = async (P) => Promise.all(P.levels.map(async (pl) => ({ data: await readPlane(M().gpu, pl), w: pl.width, h: pl.height })));
const MATCH = { block: 16, search: 16, lambda: 0.002, pel: 2, cutMad: 0.05 };
async function gpuMatch(f, t, o = MATCH, temporal = null) {
  const block = o.block || 16, levels = levelsFor(block);
  const g = M().gpu, A = await gpuPyr(f, t, levels), B = await gpuPyr(f, t - 1, levels), m = createMatcher(g, { w: f.w, h: f.h, block, levels });
  const out = storageBuffer(g, m.nb * 16), cut = storageBuffer(g, 16), tb = temporal ? storageBuffer(g, m.nb * 16) : null;
  if (tb) g.device.queue.writeBuffer(tb, 0, temporal);
  submit((e) => { e.clearBuffer(cut); m.encode(e, A, B, out, cut, { ...o, temporal: tb }); }); tb && (await g.device.queue.onSubmittedWorkDone(), tb.destroy());
  const field = new Float32Array(await readBuffer(g, out, m.nb * 16)), n = new Uint32Array(await readBuffer(g, cut, 4))[0];
  const cp = await planes(A), rp = await planes(B); [A, B, m].forEach((x) => x.destroy()); out.destroy(); cut.destroy();
  return { field, cut: n, cp, rp };
}
const close = (a, b, tol) => { let bad = 0, max = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > max) max = d; if (d > tol) bad++; } return { bad, max }; };

Object.assign(T0, {
  // luma and every pyramid level: GPU == CPU on the same half-float input
  async pyramidParity() {
    const f = fixture('square'), P = await gpuPyr(f, 9), got = await planes(P), ref = pyramid(luma(h16(f.frame(9)), f.w, f.h), f.w, f.h, 3); P.destroy();
    const lv = got.map((g, l) => close(g.data, ref[l].data, 0)); return { pass: lv.every((r) => r.max <= 1e-6), levels: lv };
  },
  // the matcher: GPU vectors == CPU vectors from identical pyramids (only float-rounding near-ties may differ)
  // D42: the worker stretcher (playback and export) returns the very bytes of the inline wsola, and is not slower
  async stretchWorker() {
    const S = await import('./stretch.js'), sr = 48000, n = sr * 2; let seed = 7;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32) - 0.5;
    const make = () => { const c = [new Float32Array(n), new Float32Array(n)]; seed = 7; for (let i = 0; i < n; i++) { c[0][i] = Math.sin(i * 0.05) * 0.4 + rnd() * 0.2; c[1][i] = Math.sin(i * 0.031) * 0.3 + rnd() * 0.1; } return c; };
    let t = performance.now(); const a = S.wsola(make(), n * 2); const inline = performance.now() - t;
    const st = S.createStretcher(); t = performance.now(); const b = await st.stretch(make(), n * 2); const worker = performance.now() - t; st.close();
    const same = a.every((c, k) => c.length === b[k].length && c.every((v, i) => v === b[k][i]));
    return { pass: same, same, ms: { inline: +inline.toFixed(1), worker: +worker.toFixed(1) } };
  },
  async matchParity() {
    const rows = {};
    for (const [name, t] of [['pan', 7], ['square', 9], ['cut', 40], ['cut', 47]]) {
      const f = fixture(name), g = await gpuMatch(f, t), c = matchBlocks(g.cp, g.rp, MATCH); let same = 0;
      for (let i = 0; i < g.field.length / 4; i++) if (g.field[i * 4] === c.field[i * 4] && g.field[i * 4 + 1] === c.field[i * 4 + 1]) same++;
      rows[`${name}@${t}`] = { sameVectors: frac(same, g.field.length / 4), madMax: close(g.field.filter((_, i) => i % 4 === 2), c.field.filter((_, i) => i % 4 === 2), 1e-5).max, cut: [g.cut, c.cut] };
    }
    for (const [label, o, withT] of [['block 8 pel 4', { ...MATCH, block: 8, pel: 4 }], ['block 32 pel 4', { ...MATCH, block: 32, pel: 4, search: 24 }], ['temporal pel 4', { ...MATCH, pel: 4 }, true], ['block 4 pel 1', { ...MATCH, block: 4, pel: 1, search: 6 }]]) {
      const f = fixture('pan'), prev = withT ? (await gpuMatch(f, 6, o)).field : null, g = await gpuMatch(f, 7, o, prev), c = matchBlocks(g.cp, g.rp, { ...o, temporal: prev }); let same = 0;
      for (let i = 0; i < g.field.length / 4; i++) if (g.field[i * 4] === c.field[i * 4] && g.field[i * 4 + 1] === c.field[i * 4 + 1]) same++;
      rows[label] = { sameVectors: frac(same, g.field.length / 4), madMax: close(g.field.filter((_, i) => i % 4 === 2), c.field.filter((_, i) => i % 4 === 2), 1e-5).max, cut: [g.cut, c.cut] };
    }
    return { pass: Object.values(rows).every((r) => r.sameVectors >= 0.99 && Math.abs(r.cut[0] - r.cut[1]) <= 2), rows };
  },
  // the GPU estimator recovers the fixtures' true motion (exact blocks): median EPE 0, p90 <= 0.5 px
  async matchTruth() {
    const rows = {};
    for (const [name, t, o] of [['pan', 7], ['square', 9], ['cut', 47], ['pan', 5, { pan: [13, -7] }]]) {
      const f = fixture(name, o), g = await gpuMatch(f, t); rows[`${name}@${t}${o ? ' 13,-7' : ''}`] = fieldEPE(g.field, f.field(t), f.exactMask(t), f);
    }
    return { pass: Object.values(rows).every((r) => r.median === 0 && r.p90 <= 0.5 && r.blocks > 40), rows };
  },
  // each field op: GPU == CPU (flags exact, vectors within float noise of sin/sqrt/division)
  async fieldOpsParity() {
    const g = M().gpu, geo = { w: 320, h: 180, block: 16 }, nb = 20 * 12, rows = {};
    const base = new Float32Array(nb * 4); for (let i = 0; i < nb; i++) { base[i * 4] = ((i * 37) % 13) - 6 + 0.5 * (i % 2); base[i * 4 + 1] = ((i * 11) % 9) - 4; base[i * 4 + 2] = (i % 17) / 100; }
    const ops = [{ op: 'pan', x: 2.5, y: -1 }, { op: 'multiply', gx: -1.5, gy: 0 }, { ...opDefaults('noise'), amp: 3, cell: 2, hold: 3, mismatch: 0.2 }, { op: 'smooth', radius: 2 },
      ...['sinX', 'radial', 'checker', 'mirrorL', 'invY'].map((shape) => ({ ...opDefaults('gain'), shape, amount: 0.8, freq: 2.5, phase: 0.1 })),
      ...['zoom', 'rotate', 'swirl', 'shearX', 'shearY'].map((kind, k) => ({ ...opDefaults('synthetic'), kind, strength: 0.03, mode: k % 2 ? 'mix' : 'add', blend: 0.7, cx: 0.4, cy: 0.6 })),
      { ...opDefaults('lost'), density: 0.3, layers: 3, life: 7, scale: 2, aspect: 1.5 }, { op: 'skip', eps: 2, mad: 0.1 },
      { ...opDefaults('amplify'), pct: 0.2, gain: 3 }, { ...opDefaults('amplify'), pct: 0.3, gain: 0, which: 'slowest' }, { ...opDefaults('map'), amount: 0.8, contrast: 1.5 }, { ...opDefaults('map'), invert: true }];
    const inp = storageBuffer(g, nb * 16), bufs = [storageBuffer(g, nb * 16), storageBuffer(g, nb * 16)], F = createFieldOps(g, geo);
    const mapImg = fixture('square').frame(4), mapTex = tex({ w: 320, h: 180 }, 0, F16, mapImg), mapRef = h16(mapImg);
    g.device.queue.writeBuffer(inp, 0, base);
    for (const o of ops) {
      let outBuf; submit((e) => { outBuf = F.encode(e, inp, bufs, [o], { t: 13, seed: 5, src: mapTex }); });
      const got = new Float32Array(await readBuffer(g, outBuf, nb * 16)), want = fieldOp(base, o, { ...geo, t: 13, seed: 5, map: mapRef });
      let flags = 0; for (let i = 0; i < nb; i++) if (got[i * 4 + 3] !== want[i * 4 + 3]) flags++;
      rows[o.op + (o.shape || o.kind || o.which ? ':' + (o.shape || o.kind || o.which) : '') + (o.invert ? ':inv' : '')] = { maxDiff: close(got, want, 1e-3).max, flagMismatch: flags };
    }
    [inp, ...bufs, mapTex].forEach((b) => b.destroy()); F.destroy();
    return { pass: Object.values(rows).every((r) => r.maxDiff === 0 && r.flagMismatch === 0), rows };   // exact (M8)
  },
  // warp modes on f32 images: nearest + pel exact, bilinear within float noise, accel scale, zero-on-cut
  async warpModes() {
    const g = M().gpu, f = fixture('square'), nb = f.bw * f.bh, prev = f.frame(8), rows = {};
    const fld = new Float32Array(nb * 4); for (let i = 0; i < nb; i++) { fld[i * 4] = ((i * 7) % 11) / 4 - 1.3; fld[i * 4 + 1] = ((i * 5) % 9) / 2 - 2.1; }
    const fb = storageBuffer(g, nb * 16), cut = storageBuffer(g, 16), node = createWarpNode(g, { w: f.w, h: f.h, block: 16, format: F32 }), a = tex(f, 8, F32, prev), b = createImage(g, f.w, f.h, F32);
    g.device.queue.writeBuffer(fb, 0, fld); g.device.queue.writeBuffer(cut, 0, new Uint32Array([100, 0, 0, 0]));
    for (const [name, o, tol] of [['nearest pel2', { sampling: 'nearest', pel: 2 }, 0], ['nearest pel4 x1.3', { sampling: 'nearest', pel: 4, scale: 1.3 }, 0],
      ['bilinear pel2', { sampling: 'bilinear', pel: 2 }, 1e-5], ['bilinear free mirror', { sampling: 'bilinear', pel: 0, edge: 2 }, 1e-5], ['zero on cut', { zeroOnCut: true, cutThresh: 50 }, 0],
      ['smooth field, bilinear', { sampling: 'bilinear', pel: 0, interp: 'smooth' }, 1e-5], ['smooth field, nearest pel 2', { pel: 2, interp: 'smooth' }, 0]]) {
      submit((e) => node.encode(e, a, b, { field: fb, cut, ...o }));
      const got = await readback(g, b), want = warpRef2(prev, fld, { w: f.w, h: f.h, block: 16, edge: o.edge || 0, sampling: o.sampling || 'nearest', pel: o.pel || 0, scale: o.scale || 1, zero: !!o.zeroOnCut, interp: o.interp || 'block' });
      rows[name] = { ...close(got, want, tol), tol };
    }
    [fb, cut, a, b].forEach((x) => x.destroy()); node.destroy();
    return { pass: Object.values(rows).every((r) => r.max <= r.tol), rows };
  },
  // the code stage: GPU == CPU except residual quantisation steps landing exactly on a rounding boundary
  async codeParity() {
    const g = M().gpu, f = fixture('cut'), nb = f.bw * f.bh, src = f.frame(60), pred = f.frame(30), rows = {};
    const fld = new Float32Array(nb * 4); for (let i = 0; i < nb; i++) { fld[i * 4 + 2] = (i % 10) / 20; fld[i * 4 + 3] = i % 9 === 0 ? 4 : 0; }
    const fb = storageBuffer(g, nb * 16), cut = storageBuffer(g, 16), node = createCodeNode(g, { w: f.w, h: f.h, block: 16, format: F32 });
    const mcImg = f.frame(59), S = tex(f, 0, F32, src), P = tex(f, 0, F32, pred), MC = tex(f, 0, F32, mcImg), D = createImage(g, f.w, f.h, F32);
    g.device.queue.writeBuffer(fb, 0, fld);
    const base = { t: 61, seed: 3, hard: false, honourCut: 0, intraMad: 0.2, intraRate: 0.5, blocks: 0.05, sweepBand: 4, sweepSpeed: 2.5, resGain: 0.6, resSteps: 12, resMode: 'detail', allowCode: true };
    for (const [name, u, cutN] of [['detail', base, 0], ['full', { ...base, resMode: 'full' }, 0], ['codec', { ...base, resMode: 'codec', resDead: 0.04 }, 0], ['no code (hold)', { ...base, allowCode: false }, 0], ['hard', { ...base, hard: true }, 0], ['honoured cut', { ...base, honourCut: 1 }, 200], ['dropped I-frame', { ...base, resMode: 'codec', resDead: 0.02, dropCut: true }, 200]]) {
      g.device.queue.writeBuffer(cut, 0, new Uint32Array([cutN, 0, 0, 0]));
      submit((e) => node.encode(e, { src: S, resetSrc: S, pred: P, mc: MC, dst: D, field: fb, cut }, { ...u, cutThresh: 120 }));
      const got = await readback(g, D), want = codeRef(src, src, pred, fld, { w: f.w, h: f.h, block: 16 }, { ...u, cut: cutN > 120 }, mcImg);
      const r = close(got, want, 1e-5); rows[name] = { pixelsOff: frac(r.bad, got.length), max: +r.max.toFixed(4) };
    }
    [fb, cut, S, P, MC, D].forEach((x) => x.destroy()); node.destroy();
    return { pass: Object.values(rows).every((r) => r.pixelsOff <= 0.002 && r.max <= 0.6 / 12 + 1e-4), rows };
  },
  // the whole loop: GPU == CPU over 120 frames of the cut fixture (Xvid classic: nearest, half-pel, no residual)
  async loopParity() {
    const rows = {};
    for (const name of ['Xvid classic', 'Pure smear', 'Packet loss', 'Bloom pulse', 'Xvid + residual', 'Codec residual + intra']) {
      const f = fixture('cut'), cfg = PRESETS[name], G = createMoshLoop(M().gpu, f, cfg), C = createLoopRef(f, cfg), x = createImage(M().gpu, f.w, f.h, F16);
      G.begin(0); C.begin(0); const at = {};
      for (let t = 0; t < f.count; t++) {
        const fr16 = h16(f.frame(t)); upload(M().gpu, x, fr16); const r = G.step(t, { src: x }), c = C.step(t, { src: fr16 });
        if (t === 41 || t === 80 || t === f.count - 1) { const got = await readback(M().gpu, r.out), want = toHalfArray(c.out); let same = 0; for (let i = 0; i < got.length; i++) if (got[i] === want[i]) same++; at[t] = frac(same, got.length); }
      }
      x.destroy(); G.destroy(); rows[name] = at;
    }
    return { pass: Object.values(rows).every((r) => Object.values(r).every((v) => v >= 0.999)), rows };
  },
  // scene-cut detection fires on the cut frame and nowhere else
  async cutDetect() {
    const f = fixture('cut'), G = createMoshLoop(M().gpu, f, PRESETS['Xvid classic']), x = createImage(M().gpu, f.w, f.h, F16), hits = [];
    G.begin(0);
    for (let t = 0; t < f.count; t++) { upload(M().gpu, x, f.frame(t)); G.step(t, { src: x }); const r = await G.readLast(); if (r.cut > r.cutThresh) hits.push(t); }
    x.destroy(); G.destroy();
    return { pass: hits.length === 1 && hits[0] === f.cut, cutFrames: hits };
  },
  // bloom: hold frames reuse the trigger frame's field bit for bit, no estimate runs
  async bloomHold() {
    const f = fixture('pan'), G = createMoshLoop(M().gpu, f, normalize({ bloom: { repeat: 5, every: 10, accel: 1.1 } })), x = createImage(M().gpu, f.w, f.h, F16); let frozen = null, ok = true; const seen = [];
    G.begin(0);
    for (let t = 0; t <= 16; t++) {
      upload(M().gpu, x, f.frame(t)); G.step(t, { src: x }); const r = await G.readLast(); seen.push(r.hold);
      if (t === 10) frozen = fnv1a(r.field);
      if (t > 10 && t < 15) ok = ok && r.est === null && fnv1a(r.field) === frozen;
    }
    x.destroy(); G.destroy();
    return { pass: ok && seen.join() === [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0, 1, 2, 3, 4, -1, -1].join(), hold: seen.join(',') };
  },
  // a rich stack replays to identical bits, and restarting (seek = replay from the start) lands on the same bits
  async loopReplay() {
    const f = fixture('cut'), cfg = normalize({ ...PRESETS['Xvid + residual'], ops: [opDefaults('lost'), { ...opDefaults('noise'), amp: 2, mismatch: 0.1 }, opDefaults('smooth')], bloom: { repeat: 12, every: 30, accel: 1.05 }, reset: { blocks: 0.003, sweepBand: 3 } });
    const G = createMoshLoop(M().gpu, f, cfg), x = createImage(M().gpu, f.w, f.h, F16), run = async (to) => { G.begin(0); for (let t = 0; t <= to; t++) { upload(M().gpu, x, f.frame(t)); G.step(t, { src: x }); } return fnv1a(await readback(M().gpu, G.step(to + 1, { src: x }).out)); };
    const a = await run(90), b = await run(90); await run(50); const c = await run(90);
    x.destroy(); G.destroy();
    return { pass: a === b && b === c, hashes: [a, b, c] };
  },
});

// ------------------------------------------------------------------------------------------------ M3 rows
Object.assign(T0, {
  // every effect: GPU == CPU. Exact unless the effect uses cos/pow/division (then within float noise); DCT may
  // flip a quantisation step on a rounding tie, so it is judged by the share of pixels off.
  async fxParity() {
    const g = M().gpu, f = fixture('square'), w = f.w, h = f.h, nb = f.bw * f.bh, rows = {};
    const fld = new Float32Array(nb * 4); for (let i = 0; i < nb; i++) { fld[i * 4] = ((i * 7) % 11) - 5; fld[i * 4 + 1] = ((i * 3) % 7) - 3; }
    const fb = storageBuffer(g, nb * 16); g.device.queue.writeBuffer(fb, 0, fld);
    const A = f.frame(9), B = f.frame(14), a = tex(f, 0, F32, A), b = tex(f, 0, F32, B), D = createImage(g, w, h, F32);
    const cases = Object.keys(FX).map((k) => ({ ...fxDefaults(k) }));
    cases.push({ ...fxDefaults('dct'), quality: 8, cutoff: 10 }, { ...fxDefaults('dct'), dcOnly: true }, { ...fxDefaults('chroma'), scheme: '16x16', dx: 3.5, dy: -2 },
      { ...fxDefaults('posterise'), motion: 0.7 }, { ...fxDefaults('stripes'), amount: 0.6 }, { ...fxDefaults('echo'), mode: 'max', warp: true }, { ...fxDefaults('blockdrag'), prob: 0.4, mode: 'shuffle' },
      { ...fxDefaults('blockdrag'), prob: 0.4 }, { ...fxDefaults('slice'), prob: 0.6, field: 2 }, { ...fxDefaults('rgbsplit'), motion: 1.5 }, { ...fxDefaults('colour'), hue: 70, sat: 1.7, gamma: 0.6, invert: 0.3, black: 0.1, white: 0.9 },
      { ...fxDefaults('colour'), threshold: 0.45 }, { ...fxDefaults('freeze'), density: 0.5 });
    for (const o of cases) {
      const C = createFxChain(g, { w, h, block: 16 }, F32, 'parity'), states = [];
      submit((e) => C.encode(e, a, D, [o], { t: 11, seed: 4, field: fb }));                      // frame 1 (stateful: no state yet)
      fxChain([o], A, { w, h, block: 16, t: 11, seed: 4, field: fld, store: 'f32' }, states);
      submit((e) => C.encode(e, b, D, [o], { t: 12, seed: 4, field: fb }));                      // frame 2 (stateful: uses frame 1)
      const want = fxChain([o], B, { w, h, block: 16, t: 12, seed: 4, field: fld, store: 'f32' }, states), got = await readback(g, D), r = close(got, want, 0);
      rows[o.fx + (rows[o.fx] ? ' #' + Object.keys(rows).filter((k) => k.startsWith(o.fx)).length : '')] = { pixelsOff: frac(r.bad, got.length), max: +r.max.toFixed(5) };
      C.destroy();
    }
    [fb, a, b, D].forEach((x) => x.destroy());
    return { pass: Object.values(rows).every((r) => r.pixelsOff === 0), rows };            // M8: every effect exact
  },
  // optical flow: GPU == CPU from identical pyramids (iterative float: small drift allowed), and the truth
  async flowParityTruth() {
    const rows = {};
    for (const [name, t] of [['pan', 7], ['square', 9], ['cut', 47]]) {
      const f = fixture(name), g = M().gpu, A = await gpuPyr(f, t), Bp = await gpuPyr(f, t - 1), F = createFlow(g, { w: f.w, h: f.h, block: 16, levels: 3 });
      const out = storageBuffer(g, f.bw * f.bh * 16), cut = storageBuffer(g, 16);
      submit((e) => { e.clearBuffer(cut); F.encode(e, A, Bp, out, cut, { cutMad: 0.05 }); });
      const got = new Float32Array(await readBuffer(g, out, f.bw * f.bh * 16)), c = flowCells(await planes(A), await planes(Bp), { block: 16, cutMad: 0.05 });
      let md = 0; for (let i = 0; i < f.bw * f.bh; i++) md = Math.max(md, Math.hypot(got[i * 4] - c.field[i * 4], got[i * 4 + 1] - c.field[i * 4 + 1]));
      rows[`${name}@${t}`] = { maxGpuCpu: +md.toFixed(5), truth: fieldEPE(got, f.field(t), f.exactMask(t), f) };
      [A, Bp, F].forEach((x) => x.destroy()); out.destroy(); cut.destroy();
    }
    return { pass: Object.values(rows).every((r) => r.maxGpuCpu === 0 && r.truth.median <= 0.25), rows };   // integer flow: exact (D45)
  },
  // a stack with flow, in-loop and post effects (stateful too) replays to identical bits on the GPU
  async fxLoopReplay() {
    const f = fixture('cut'), cfg = normalize({ ...LEGACY['11 Broken Signal'], post: [...LEGACY['11 Broken Signal'].post, fxDefaults('echo'), fxDefaults('freeze')] });
    const out = {};
    for (const [name, c] of [['broken signal + echo + freeze', cfg], ['fluid', PRESETS['Fluid']], ['soft deblocked', PRESETS['Soft deblocked']]]) {
      const G = createMoshLoop(M().gpu, f, c), x = createImage(M().gpu, f.w, f.h, F16);
      const run = async (to) => { G.begin(0); let r; for (let t = 0; t <= to; t++) { upload(M().gpu, x, f.frame(t)); r = G.step(t, { src: x }); } return fnv1a(await readback(M().gpu, r.display)); };
      const a = await run(70), b = await run(70); x.destroy(); G.destroy(); out[name] = { same: a === b, hash: a };
    }
    return { pass: Object.values(out).every((r) => r.same), rows: out };
  },
  // whole loops with effects: GPU vs CPU display, 8 frames after the cut (recurrent float effects drift slowly, so this
  // is a closeness check, not bit-exactness)
  async fxLoopParity() {
    const f = fixture('cut'), rows = {};
    for (const [name, cfg] of [['Soft deblocked', PRESETS['Soft deblocked']], ['Fluid', PRESETS['Fluid']], ['04 Phantom Trail', LEGACY['04 Phantom Trail']], ['09 Acid Wash', LEGACY['09 Acid Wash']]]) {
      const G = createMoshLoop(M().gpu, f, cfg), C = createLoopRef(f, cfg), x = createImage(M().gpu, f.w, f.h, F16); G.begin(0); C.begin(0); let r, c;
      for (let t = 0; t <= f.cut + 8; t++) { const s = h16(f.frame(t)); upload(M().gpu, x, s); r = G.step(t, { src: x }); c = C.step(t, { src: s }); }
      const got = fromHalfArray(await readback(M().gpu, r.display)); let sum = 0; for (let i = 0; i < got.length; i++) sum += Math.abs(got[i] - c.display[i]);
      rows[name] = { meanAbsDiff: +(sum / got.length).toFixed(5) }; x.destroy(); G.destroy();
    }
    return { pass: Object.entries(rows).every(([k, r]) => r.meanAbsDiff === 0 || (k === 'Fluid' && r.meanAbsDiff <= 0.01)), rows };   // exact (M8); flow is float
  },
});

// ------------------------------------------------------------------------------------------------ M5: sequences
const seqMod = () => import('./sequence.js'), renderMod = () => import('./render.js'), projMod = () => import('./project.js'), compMod = () => import('./nodes/composite.js');
/** A small project on fixtures: pan on V1, square at 60 % on V2 (moved, scaled, rotated) with displace + echo, Xvid classic on FX1,
 *  a mosh hit marker holding the field for 4 frames, and modulators (lfo, noise, random hold, a hit trigger). */
export async function seqFixture({ layered = true, n = 16, clipFx = ['rgbsplit'], loopFx = ['displace', 'echo'], fxMod = true, transform = { opacity: 0.6, x: 0.1, scale: 0.8, rotation: 12, blend: 'screen' } } = {}) {
  const P = await projMod(), W = 96, Hh = 64;
  const pan = fixture('pan', { w: W, h: Hh, count: 48, block: 16 }), sq = fixture('square', { w: W, h: Hh, count: 48, block: 16, size: 24, at: [20, 20] });
  const ref = (id, f) => ({ id, name: id, hash: id, kind: 'video', width: W, height: Hh, fps: { num: 30, den: 1 }, durationFrames: f.count, hasAudio: false, storage: 'opfs' });
  const p = P.fromConfig(PRESETS['Xvid classic'], { media: ref('pan', pan), frames: n, width: W, height: Hh, timebase: { num: 30, den: 1 } });
  if (layered) {
    p.media.push(ref('square', sq));
    const seq = p.sequences[0], v2 = P.createChannel('video', 'V2'); seq.channels.splice(1, 0, v2);
    const k = P.createMediaClip('square', { in: 2, out: n }, { transform: { ...P.transformDefaults(), ...transform } });
    const FXP = { rgbsplit: { dx: 3 }, displace: { gain: 2 }, echo: { decay: 0.6 } };
    for (const t of clipFx) k.stack.push(P.createEffect(t, { params: FXP[t] || {} }));
    v2.clips.push(k);
    for (const t of loopFx) seq.channels[2].clips[0].stack.push(P.createEffect(t, { params: FXP[t] || {} }));
    seq.markers.push({ ...P.createMarker(7, { hit: true }), hold: 4 });                  // a mosh hit with its own hold length
    // modulators everywhere a value can be modulated: transform opacity, a clip effect, two loop params (one driven by hits)
    const PM = await import('./params.js'), M3 = await import('./masks.js'), loop = seq.channels[2].clips[0].stack[0];
    k.transform.opacity = { value: 0.6, mods: [{ ...PM.modulatorDefaults('lfo', { depth: 0.3, clamp: [0, 1] }), params: { shape: 'sine', rate: 3, phase: 0.1 } }] };
    if (fxMod && k.stack[0]) k.stack[0].params.dx = { value: 3, mods: [{ ...PM.modulatorDefaults('noise', { depth: 2, seed: 4 }), params: { freq: 4, octaves: 2 } }] };
    loop.params.residual.gain = { value: 0.8, mods: [{ ...PM.modulatorDefaults('randomHold', { depth: 0.2, clamp: [0, 1] }), params: { rate: 6 } }] };
    loop.params.reset.blocks = { value: 0, mods: [{ ...PM.modulatorDefaults('trigger', { mode: 'replace', depth: 0.3 }), params: { source: 'hits', hold: 1, decay: 2, n: 30, phase: 0 } }] };
    // painted vectors (R2): a swirl-ish drag added to the estimate, its amount keyframed
    loop.params.ops = [...loop.params.ops, { op: 'paint', mode: 'add', amount: { keys: [{ frame: 0, value: 0.5, interp: 'linear' }, { frame: 12, value: 2, interp: 'linear' }] }, strokes: [{ pts: [0.2, 0.7, 0.5, 0.4, 0.8, 0.6], r: 0.15, s: 0.02 }] }];
    // masks (R3): a feathered include stroke and a lock ellipse whose position is keyframed
    const fxClip = seq.channels[2].clips[0];
    fxClip.masks = [{ ...M3.createMask('include', { id: 'mk-inc', feather: 0.08 }), shapes: [{ type: 'stroke', pts: [0.1, 0.3, 0.6, 0.7, 0.9, 0.4], r: 0.18 }] },
      { ...M3.createMask('lock', { id: 'mk-lock', feather: 0.04 }), x: { keys: [{ frame: 0, value: -0.2, interp: 'linear' }, { frame: 15, value: 0.3, interp: 'linear' }] }, shapes: [{ type: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.12, ry: 0.2 }] }];
    P.assertValid(p);
  }
  const frames = { pan, square: sq };
  const cpuSources = Object.fromEntries(Object.entries(frames).map(([id, f]) => [id, { w: W, h: Hh, frame: (i) => f.frame(i) }]));
  const gpuSources = async (m) => ({ w: W, h: Hh, frame: async (i) => frames[m.id].frame(i) });
  return { p, W, H: Hh, n, cpuSources, gpuSources };
}
Object.assign(T0, {
  // Transform & Blend: identity is an exact copy; moved / scaled / rotated placement and every blend mode match the CPU twin
  async compositeParity() {
    const S = await seqMod(), C = await compMod(), P = await projMod(), g = M().gpu, f = fixture('square', { w: 96, h: 64, count: 4, size: 24, at: [20, 20] }), W = 96, H = 64;
    const src = tex(f, 1), comp = tex(f, 2, F16, h16(fixture('pan', { w: 96, h: 64, count: 4 }).frame(2))), dst = createImage(g, W, H, F16), dst2 = createImage(g, W, H, F16);
    const place = C.createPlace(g), blend = C.createBlend(g), rows = {};
    const T = { identity: {}, moved: { x: 0.13, y: -0.07 }, scaled: { scale: 0.73 }, rotated: { rotation: 17, scale: 1.2, x: 0.05 } };
    for (const [name, over] of Object.entries(T)) {
      const Pm = S.placement({ ...P.transformDefaults(), ...over }, { sw: W, sh: H, W, H });
      submit((e) => place.encode(e, src, dst, Pm));
      const got = await readback(g, dst), want = toHalfArray(S.placeRef(h16(f.frame(1)), Pm)); let bad = 0;
      for (let i = 0; i < got.length; i++) if (got[i] !== want[i]) bad++;
      rows['place ' + name] = { firstDiff: firstDiff(got, want), bad };
    }
    const layer = fromHalfArray(await readback(g, dst));                     // the rotated layer: partial alpha at its edges
    for (const mode of Object.keys(S.BLEND)) for (const op of [1, 0.45]) {
      submit((e) => blend.encode(e, comp, dst, dst2, op, mode));
      const got = await readback(g, dst2), want = toHalfArray(S.blendRef(fromHalfArray(await readback(g, comp)), layer, op, mode)); let bad = 0;
      for (let i = 0; i < got.length; i++) if (got[i] !== want[i]) bad++;
      rows[`blend ${mode} ${op}`] = { bad };
    }
    [src, comp, dst, dst2].forEach((x) => x.destroy()); place.destroy(); blend.destroy();
    return { pass: rows['place identity'].bad === 0 && Object.values(rows).every((r) => r.bad === 0), rows };
  },
  // the GPU sequence renderer equals the CPU evaluator bit for bit: one clip; and layers with transforms, a screen
  // blend, clip stacks (rgbsplit at an integer shift, displace), a hit marker and lfo / noise / random-hold / trigger
  // modulators. 'fxMix' adds echo and a noise-modulated rgbsplit shift (exact since the integer FX library, M8).
  async sequenceParity() {
    const S = await seqMod(), R = await renderMod(), rows = {};
    for (const [name, opts] of [['oneClip', { layered: false }], ['layered', { loopFx: ['displace'], fxMod: false }], ['composite', { loopFx: [], fxMod: false, n: 40, bypassLoop: true }], ['fxMix', {}]]) {
      const X = await seqFixture(opts); if (opts.bypassLoop) X.p.sequences[0].channels[2].bypassed = true;   // the composite alone, no loop to hide a pixel
      const cpu = S.createEvaluator(X.p, S.cpuBackend({ w: X.W, h: X.H, sources: X.cpuSources }));
      const gpu = R.createSequenceRenderer(M().gpu, X.p, { sources: X.gpuSources }); let bad = 0, firstBad = -1, max = 0;
      for (let t = 0; t < X.n; t++) {
        const a = await readback(M().gpu, (await gpu.render(t)).image), b = toHalfArray((await cpu.render(t)).image);
        const d = firstDiff(a, b); if (d >= 0) { bad++; if (firstBad < 0) firstBad = t; const ga = fromHalfArray(a), gb = fromHalfArray(b); for (let i = 0; i < ga.length; i++) max = Math.max(max, Math.abs(ga[i] - gb[i])); }
      }
      rows[name] = { frames: X.n, framesDiffering: bad, firstBad, maxAbsDiff: +max.toFixed(5) };
      await gpu.destroy();
    }
    return { pass: rows.oneClip.framesDiffering === 0 && rows.layered.framesDiffering === 0 && rows.composite.framesDiffering === 0 && rows.fxMix.framesDiffering === 0, rows };
  },
  // the editor (index.html only): real pointer drags on the timeline canvas trim, move along and across channels,
  // marquee-select and scrub, each as one undo step, and undo restores the project
  async editorSmoke() {
    const app = window.__app; if (!app || !app.view) return { skipped: 'not the editor page' };
    const P = await projMod(); app.useProject(app.demoProject()); await new Promise((r) => setTimeout(r, 200));
    const before = P.stringify(app.project), cv = document.querySelector('.tl-cv'), v = app.view.view, s = () => app.project.sequences[0], lh = app.view.laneH;
    let R = cv.getBoundingClientRect();                       // re-measured per drag: the pane follows its rows (D41)
    const X = (f) => R.left + (f - v.x0) * v.ppf, rowY = (i) => R.top + 30 + lh * i + lh / 2;
    const ev = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 9, bubbles: true, pointerType: 'mouse', button: 0 }));
    const settle = async () => { await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); R = cv.getBoundingClientRect(); };
    const drag = async (x0, y0, x1, y1) => { ev('pointerdown', x0, y0); for (let i = 1; i <= 5; i++) ev('pointermove', x0 + ((x1 - x0) * i) / 5, y0 + ((y1 - y0) * i) / 5); ev('pointerup', x1, y1); await new Promise((r) => setTimeout(r, 30)); };
    const ranges = (ci) => s().channels[ci].clips.map((k) => `${k.range.in}-${k.range.out}`).join(' '), rows = {};
    await drag(X(120) - 2, rowY(2), X(90), rowY(2)); rows.trim = ranges(0);
    await drag(X(60), rowY(1), X(80), rowY(1)); rows.move = ranges(1);
    app.tl.exec('addChannel', { kind: 'video', index: 1 }); await settle(); await drag(X(30), rowY(3), X(30), rowY(2)); rows.across = s().channels.map((c) => c.clips.length).join(',');
    await drag(X(-1) + 2, R.top + 32, X(100), rowY(3) + 10); rows.marquee = app.tl.selection.size;
    await drag(X(30), R.top + 5, X(45), R.top + 5); rows.scrub = app.play.want;
    const depth = app.tl.depth; while (app.tl.undo()); const restored = P.stringify(app.project) === before;
    return { pass: rows.trim === '0-90' && rows.move === '20-140' && rows.across === '0,1,1,0' && rows.marquee >= 2 && Math.abs(rows.scrub - 45) <= 1 && depth === 4 && restored, ...rows, undoSteps: depth, restored };
  },
  // the editor's smaller §11.1 items: key navigation and interpolation from the inspector, stack copy / paste / save
  // preset through its buttons, the Effects browser's ADD and CLIP, and the project Mosh ID round trip
  async editorItems() {
    const app = window.__app; if (!app || !app.view) return { skipped: 'not the editor page' };
    const P = await projMod(); app.useProject(app.demoProject()); await new Promise((r) => setTimeout(r, 100));
    const tl = app.tl, s = () => app.project.sequences[0], fx = s().channels[1].clips[0], loop = fx.stack[0], v1 = s().channels[0].clips[0], out = {}, prompt0 = window.prompt;
    tl.select(fx.id); app.inspector.refresh();
    tl.exec('animate', { id: loop.id, path: ['params', 'residual', 'gain'], at: 10 }); tl.exec('setValue', { id: loop.id, path: ['params', 'residual', 'gain'], value: 0.8, at: 50 });
    app.view.showParam({ id: loop.id, path: ['params', 'residual', 'gain'], spec: [0, 1, 0.01, 0], label: 'gain' });
    app.seek(30); app.A.key(1); out.next = app.play.want; app.A.key(-1); out.prev = app.play.want;
    app.inspector.refresh(); const sel = document.querySelector('.ins-keys select'); if (sel) { sel.value = 'easeInOut'; sel.dispatchEvent(new Event('change')); }
    out.interp = loop.params.residual.gain.keys[0].interp;
    const btn = (t) => [...document.querySelectorAll('.ins .ms-b')].find((b) => b.textContent === t);
    btn('COPY').click(); tl.select(v1.id); app.inspector.refresh(); btn('PASTE').click(); out.pasted = v1.stack.map((e) => e.type).join(',');
    window.prompt = () => 'harness preset'; tl.select(fx.id); app.inspector.refresh(); btn('SAVE PRESET…').click(); window.prompt = prompt0; out.presets = (app.project.presets || []).length;
    tl.select(v1.id); app.A.addEffect('rgbsplit'); out.added = v1.stack.length;
    tl.select(null); app.A.effectClip('posterise'); out.effectChannels = s().channels.filter((c) => c.kind === 'effect').length;
    const id = await P.toMoshID(app.project), back = await P.fromMoshID(id); out.moshIdChars = id.length;
    out.moshIdSame = P.stringify(back) === P.stringify({ ...app.project, ui: {} });
    return { pass: out.next === 50 && out.prev === 10 && out.interp === 'easeInOut' && out.pasted === 'moshLoop' && out.presets === 1 && out.added === 2 && out.effectChannels === 2 && out.moshIdSame, ...out };
  },
  // the cache in the editor: an edit turns the ruler red after the first K frames; the idle background fill turns it
  // green again; a seek during a fill gives way at once and shows the same pixels as a cache-free render
  async editorFill() {
    const app = window.__app; if (!app || !app.view) return { skipped: 'not the editor page' };
    app.useProject(app.demoProject()); const wait = (ms) => new Promise((r) => setTimeout(r, ms)), kinds = () => app.renderer.coverage().spans.map((x) => x.kind);
    const settle = async (ms) => { const t0 = performance.now(); while (performance.now() - t0 < ms && kinds().some((k) => k !== 'green')) await wait(100); };
    await settle(20000); const filled0 = kinds().every((k) => k === 'green');
    const loop = app.project.sequences[0].channels[1].clips[0].stack[0];
    app.tl.exec('setValue', { id: loop.id, path: ['params', 'residual', 'gain'], value: 0.5 }); const red = kinds().includes('red');
    await wait(650); app.seek(90); while (app.play.busy || app.play.shown !== 90) await wait(20);
    const R = await renderMod(), cv = document.getElementById('ms-view'), shown = await (async () => { while (app.play.busy) await wait(20); app.play.busy = true; try { return fnv1a(await readback(M().gpu, (await app.renderer.render(90)).image)); } finally { app.play.busy = false; } })();   // under the editor's render lock
    const fresh = R.createSequenceRenderer(M().gpu, app.project, { w: cv.width, h: cv.height, sources: async () => ({ w: 320, h: 180, frame: async (i) => fixture('cut').frame(Math.min(i, 119)) }) });
    const same = shown === fnv1a(await readback(M().gpu, (await fresh.render(90)).image)); await fresh.destroy();
    await settle(20000); const filled = kinds().every((k) => k === 'green');
    return { pass: filled0 && red && same && filled, filledAtStart: filled0, redAfterEdit: red, seekDuringFillSame: same, filledAgain: filled, cache: app.renderer.cache().frames };
  },
  // R3 in the editor: a lock stroke painted with pointer events on the preview is one undo step; a pixel under it shows
  // the clean picture (the render with the mosh's channel bypassed); undo restores the project byte for byte
  async editorMasks() {
    const app = window.__app; if (!app || !app.view) return { skipped: 'not the editor page' };
    const P = await projMod(), g = M().gpu, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    app.useProject(app.demoProject()); await wait(100); const before = P.stringify(app.project), fx = app.project.sequences[0].channels[1];
    app.tl.select(fx.clips[0].id); app.setTool('lock');
    const ov = document.getElementById('ms-overlay'), R = document.getElementById('ms-fit').getBoundingClientRect();
    const ev = (type, u, v) => ov.dispatchEvent(new PointerEvent(type, { clientX: R.left + u * R.width, clientY: R.top + v * R.height, pointerId: 5, bubbles: true }));
    ev('pointerdown', 0.3, 0.5); for (let i = 1; i <= 6; i++) ev('pointermove', 0.3 + i * 0.05, 0.5); ev('pointerup', 0.6, 0.5); app.setTool('lock');
    const shapes = (fx.clips[0].masks || []).reduce((n, m) => n + m.shapes.length, 0), undoLabel = app.tl.undoLabel;
    // render under the editor's lock: the idle background fill renders on the same renderer
    const px = async () => { while (app.play.busy) await wait(20); app.play.busy = true; let img; try { img = await readback(g, (await app.renderer.render(70)).image); } finally { app.play.busy = false; }
      const w = img.length / 4 / document.getElementById('ms-view').height | 0, i = (Math.round(0.5 * document.getElementById('ms-view').height) * w + Math.round(0.45 * w)) * 4; return [...img.slice(i, i + 3)].join(); };
    const locked = await px(); app.tl.exec('setValue', { id: fx.id, path: ['bypassed'], value: true }); app.renderer.invalidate(); const clean = await px(); app.tl.undo();
    app.tl.undo(); const restored = P.stringify(app.project) === before;
    return { pass: shapes === 1 && undoLabel === 'Mask stroke' && locked === clean && restored, shapes, undoLabel, lockedEqualsClean: locked === clean, restored };
  },
  // R2 in the editor: a vector stroke painted with pointer events is one undo step in the mosh's 'paint' op; the render
  // changes inside the brush; undo restores the pixels and the project byte for byte
  async editorVectors() {
    const app = window.__app; if (!app || !app.view) return { skipped: 'not the editor page' };
    const P = await projMod(), g = M().gpu, wait = (ms) => new Promise((r) => setTimeout(r, ms));
    app.useProject(app.demoProject()); await wait(100); const before = P.stringify(app.project), fx = app.project.sequences[0].channels[1].clips[0];
    const shot = async (t) => { while (app.play.busy) await wait(20); app.play.busy = true; try { return fnv1a(await readback(g, (await app.renderer.render(t)).image)); } finally { app.play.busy = false; } };
    const plain = await shot(90);
    app.tl.select(fx.id); app.setTool('vector');
    const ov = document.getElementById('ms-overlay'), R = document.getElementById('ms-fit').getBoundingClientRect();
    const ev = (type, u, v) => ov.dispatchEvent(new PointerEvent(type, { clientX: R.left + u * R.width, clientY: R.top + v * R.height, pointerId: 6, bubbles: true }));
    ev('pointerdown', 0.2, 0.5); for (let i = 1; i <= 8; i++) ev('pointermove', 0.2 + i * 0.07, 0.5 - i * 0.02); ev('pointerup', 0.76, 0.34); app.setTool('vector');
    const op = fx.stack[0].params.ops.find((o) => o.op === 'paint'), label = app.tl.undoLabel; app.renderer.invalidate();
    const painted = await shot(90); app.tl.undo(); app.renderer.invalidate(); const undone = await shot(90);
    return { pass: !!op && op.strokes.length === 1 && label === 'Vector stroke' && painted !== plain && undone === plain && P.stringify(app.project) === before,
      strokePoints: op ? op.strokes[0].pts.length / 2 : 0, label, changed: painted !== plain, undoRestoresPixels: undone === plain };
  },
  // seeking on the GPU replays from the in-point and lands on the playback pixels; a second seek after invalidate() too
  async sequenceSeek() {
    const R = await renderMod(), X = await seqFixture({ layered: true }), a = R.createSequenceRenderer(M().gpu, X.p, { sources: X.gpuSources });
    const play = []; for (let t = 0; t < X.n; t++) play.push(fnv1a(await readback(M().gpu, (await a.render(t)).image)));
    const b = R.createSequenceRenderer(M().gpu, X.p, { sources: X.gpuSources }), r = await b.render(11), s = fnv1a(await readback(M().gpu, r.image));
    b.invalidate(); const r2 = await b.render(5), s2 = fnv1a(await readback(M().gpu, r2.image));
    await a.destroy(); await b.destroy();
    return { pass: s === play[11] && r.from === 0 && s2 === play[5], from: r.from, seek11: s === play[11], seek5: s2 === play[5] };
  },
});

// ------------------------------------------------------------------------------------------------ M6: checkpoints
Object.assign(T0, {
  // GPU Mosh Loop checkpoints: restore after a detour, or into a brand-new loop, then step on = never having stopped,
  // bit for bit, for every kind of loop state (bloom, codec residual, flow, source2, in-loop and post effects)
  // the GPU checkpoint store: after playing a layered fixture sequence (two channels, clip echo, Xvid classic, a hit,
  // modulators), seeks resume less than K frames back and land on the playback pixels; a CPU evaluator agrees
  async checkpointStore() {
    const S = await seqMod(), R = await renderMod(), X = await seqFixture({ n: 40, loopFx: ['displace'], fxMod: false }), K = 8, g = M().gpu;
    const a = R.createSequenceRenderer(g, X.p, { sources: X.gpuSources, K }), play = [];
    for (let t = 0; t < X.n; t++) play.push(fnv1a(await readback(g, (await a.render(t)).image)));
    const seeks = {};
    for (const t of [33, 9, 26, 39, 17]) { const r = await a.render(t); seeks[t] = { same: fnv1a(await readback(g, r.image)) === play[t], replayed: t - r.from + 1, checkpoint: r.checkpoint }; }
    const cpu = S.createEvaluator(X.p, S.cpuBackend({ w: X.W, h: X.H, sources: X.cpuSources }), { K }); let cpuSame = 0;
    for (let t = 0; t < X.n; t++) if (fnv1a(toHalfArray((await cpu.render(t)).image)) === play[t]) cpuSame++;
    const c = a.cache(); await a.destroy();
    return { pass: Object.values(seeks).every((x) => x.same && x.replayed <= K) && cpuSame === X.n, seeks, cpuSame, cache: { frames: c.frames, MiB: +(c.bytes / 2 ** 20).toFixed(2), deposits: c.deposits, restores: c.restores } };
  },
  // spill on the GPU: a tiny VRAM budget pushes checkpoints through a lossless readback into memory and into OPFS
  // files; seeks restored from each tier land on the playback pixels; destroy() removes the files
  async checkpointSpill() {
    const R = await renderMod(), C = await import('./cache.js'), X = await seqFixture({ n: 48, loopFx: ['displace'], fxMod: false }), K = 8, g = M().gpu;
    const disk = await C.openDiskCache('harness-spill'), probe = R.createSequenceRenderer(g, X.p, { sources: X.gpuSources, K });
    await probe.render(K); const one = probe.cache().bytes; await probe.destroy();
    const a = R.createSequenceRenderer(g, X.p, { sources: X.gpuSources, K, budget: one * 1.5, cpuBudget: one * 2.5, disk }), play = [];
    for (let t = 0; t < X.n; t++) play.push(fnv1a(await readback(g, (await a.render(t)).image)));
    await a.settle(); const c = a.cache(), seeks = {};
    const picks = [['disk', c.tiers.disk[0]], ['cpu', c.tiers.cpu[0]], ['gpu', c.tiers.gpu[c.tiers.gpu.length - 1]]].filter(([, f]) => f !== undefined);
    for (const [tier, f0] of picks) { const t = Math.min(X.n - 1, f0 + 3), r = await a.render(t); seeks[tier] = { frame: t, same: fnv1a(await readback(g, r.image)) === play[t], from: r.from }; }
    await a.settle(); const after = a.cache(); await a.destroy();
    let left = 0; try { const root = await navigator.storage.getDirectory(), top = await root.getDirectoryHandle('moshine-cache'); for await (const [, hdl] of top.entries()) if (hdl.kind === 'directory') for await (const _ of hdl.entries()) left++; } catch (e) {}
    return { pass: picks.length === 3 && Object.values(seeks).every((x) => x.same && x.frame - x.from < K) && after.loads >= 2 && left === 0, checkpointMiB: +(one / 2 ** 20).toFixed(2), tiers: c.tiers, seeks, spills: after.spills, loads: after.loads, filesLeft: left };
  },
  async checkpointParity() {
    const g = M().gpu, F = fixture('cut', { w: 96, h: 64, count: 60, block: 16 }), F2 = fixture('pan', { w: 96, h: 64, count: 60, block: 16 });
    const CASES = { 'Xvid classic': PRESETS['Xvid classic'], 'Bloom pulse': PRESETS['Bloom pulse'], Fluid: PRESETS['Fluid'], 'Packet loss': PRESETS['Packet loss'], 'Soft deblocked': PRESETS['Soft deblocked'],
      'Phantom Trail': LEGACY['04 Phantom Trail'], 'Motion Hijack': LEGACY['06 Motion Hijack'], 'Healing GOP': PRESETS['Healing GOP'], 'bloom hit 20': { ...PRESETS['Xvid classic'], bloom: { ...PRESETS['Xvid classic'].bloom, repeat: 10, hits: [20] } } };
    const a = createImage(g, F.w, F.h, F16), b = createImage(g, F.w, F.h, F16);
    const feed = (t) => { upload(g, a, h16(F.frame(t))); upload(g, b, h16(F2.frame(t))); };
    async function run(cfg, n, { at = -1, detour = 0, fresh = false } = {}) {
      let L = createMoshLoop(g, F, cfg); L.begin(0); const out = []; let bytes = 0;
      for (let t = 0; t < n; t++) {
        feed(t); out.push(fnv1a(await readback(g, L.step(t, { src: a, src2: b }).display)));
        if (t === at) {
          const snap = L.snapshot(); bytes = snap.bytes;
          for (let k = 1; k <= detour; k++) { feed(t + k); L.step(t + k, { src: a, src2: b }); }
          if (fresh) { L.destroy(); L = createMoshLoop(g, F, cfg); L.begin(0); }
          L.restore(snap); snap.destroy();
        }
      }
      L.destroy(); return { out, bytes };
    }
    const rows = {};
    for (const [name, cfg] of Object.entries(CASES)) {
      const want = (await run(cfg, 36)).out, d = await run(cfg, 36, { at: 21, detour: 6 }), f = await run(cfg, 36, { at: 24, fresh: true });
      rows[name] = { detour: d.out.every((x, i) => x === want[i]), fresh: f.out.every((x, i) => x === want[i]), bytes: d.bytes };
    }
    a.destroy(); b.destroy();
    const L = createMoshLoop(g, { w: 960, h: 540 }, PRESETS['Xvid classic']), x = createImage(g, 960, 540, F16); L.begin(0); L.step(0, { src: x }); L.step(1, { src: x });
    const s540 = L.snapshot(), mb540 = +(s540.bytes / 2 ** 20).toFixed(2); s540.destroy(); L.destroy(); x.destroy();
    return { pass: Object.values(rows).every((r) => r.detour && r.fresh), checkpointMiB540p: mb540, rows };
  },
});

// ------------------------------------------------------------------------------------------------ T1: real media
// Runs only when local footage exists (sh moshine/tools/make-media.sh writes tests/media/cut.mp4).
// ---- M4 helpers
const media = () => import('./media.js'), exporter = () => import('./export.js');
async function clipBlob(name) { const r = await fetch(new URL(`./tests/media/${name}`, import.meta.url)); return r.ok ? r.blob() : null; }
async function heldCopy(g, tex) { const c = createImage(g, tex.width, tex.height, F16); submit((e) => e.copyTextureToTexture({ texture: tex }, { texture: c }, [tex.width, tex.height])); return c; }

export const T1 = {
  // the decode ladder: zero-copy (importExternalTexture) and copy (copyExternalImageToTexture) land on the same pixels
  // a one-clip timeline over real decoded video renders the M4 pixels (loop fed by the decoder in order), and a seek
  // on a fresh renderer lands on the same frame
  async sequenceVideo() {
    const blob = await clipBlob('cut.mp4'); if (!blob) return { skipped: 'no tests/media/cut.mp4 (run tools/make-media.sh)' };
    const { openVideo, createIngest } = await media(), R = await renderMod(), P = await projMod(), g = M().gpu, n = 48;
    const v = await openVideo(blob, 'cut.mp4'), m = P.mediaFromLibrary({ id: 'cut', name: 'cut.mp4', info: v.info() });
    const p = P.fromConfig(PRESETS['Xvid classic'], { media: m, frames: n });
    const sources = async () => R.videoReader(await openVideo(blob, 'cut.mp4'));
    const loop = createMoshLoop(g, { w: v.w, h: v.h }, PRESETS['Xvid classic']), ing = createIngest(g), x = createImage(g, v.w, v.h, F16), m4 = [];
    loop.begin(0); let t = 0;
    for await (const sm of v.samples()) { if (t >= n) { sm.close(); break; } const f = sm.toVideoFrame(); ing.ingest(f, x); f.close(); sm.close(); m4.push(fnv1a(await readback(g, loop.step(t, { src: x }).display))); t++; }
    const a = R.createSequenceRenderer(g, p, { sources }); let same = 0;
    for (let k = 0; k < n; k++) if (fnv1a(await readback(g, (await a.render(k)).image)) === m4[k]) same++;
    const b = R.createSequenceRenderer(g, p, { sources }), r = await b.render(40), seek = fnv1a(await readback(g, r.image)) === m4[40];
    await a.destroy(); await b.destroy(); loop.destroy(); ing.destroy(); x.destroy(); v.close();
    return { pass: same === n && seek, frames: n, sameAsM4: same, seek40: seek, size: `${v.w}×${v.h}`, fps: m.fps };
  },
  async ingestLadder() {
    const blob = await clipBlob('cut.mp4'); if (!blob) return { skipped: 'no tests/media/cut.mp4 (run tools/make-media.sh)' };
    const { openVideo, createIngest } = await media(), g = M().gpu, v = await openVideo(blob, 'cut.mp4'), rows = {};
    const ext = createIngest(g, { mode: 'external' }), cpy = createIngest(g, { mode: 'copy' }), A = createImage(g, 320, 180, F16), B = createImage(g, 320, 180, F16);
    for (const ts of [1, 4]) {
      const sample = await v.sampleAt(ts), f = sample.toVideoFrame(); ext.ingest(f, A); cpy.ingest(f, B); f.close(); sample.close();
      const a = fromHalfArray(await readback(g, A)), b = fromHalfArray(await readback(g, B)); let sum = 0, mx = 0;
      for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); sum += d; mx = Math.max(mx, d); }
      rows[`t=${ts}s`] = { meanAbsDiff: +(sum / a.length).toFixed(5), max: +mx.toFixed(4) };
    }
    [A, B].forEach((x) => x.destroy()); ext.destroy(); cpy.destroy(); v.close();
    return { pass: Object.values(rows).every((r) => r.meanAbsDiff < 0.01), probe: v.info(), externalMode: ext.mode, rows };
  },
  // export 6 s through Xvid classic to OPFS (MP4, H.264, AAC passed through), reopen it, check it and its pixels
  async exportRoundTrip() {
    const blob = await clipBlob('cut.mp4'); if (!blob) return { skipped: 'no tests/media/cut.mp4 (run tools/make-media.sh)' };
    const { openVideo, createIngest } = await media(), { exportVideo, openTarget } = await exporter(), g = M().gpu;
    const v = await openVideo(blob, 'cut.mp4'), w = 320, h = 176, target = await openTarget('harness-roundtrip.mp4', 'mp4', 'opfs');
    let held = null;
    const r = await exportVideo({ gpu: g, video: v, cfg: PRESETS['Xvid classic'], w, h, container: 'mp4', quality: 'very-high', audio: true, target,
      onFrame: (t, tex) => { if (t === 120) heldCopy(g, tex).then((c) => { held = c; }); } });
    await g.device.queue.onSubmittedWorkDone();
    const file = await r.file(), back = await openVideo(file, 'roundtrip.mp4'), ing = createIngest(g), X = createImage(g, w, h, F16);
    const sample = await back.sampleAt(back.start + 120 / back.fps + 0.001), f = sample.toVideoFrame(); ing.ingest(f, X); f.close(); sample.close();
    // luma PSNR: H.264 4:2:0 costs chroma at saturated edges by design, luma shows whether the path is right
    const { compare } = await import('./metrics.js'), m = compare(fromHalfArray(await readback(g, X)), fromHalfArray(await readback(g, held)), w, h), psnr = m.psnr;
    const out = { exported: { frames: r.frames, seconds: +r.seconds.toFixed(2), codec: r.codec, audio: r.audio }, size: file.size, back: back.info(), lumaPsnrFrame120: +psnr.toFixed(2), ssim: +m.ssim.toFixed(4) };
    [X, held].forEach((x) => x.destroy()); ing.destroy(); back.close(); v.close(); await target.remove();
    return { pass: back.codec === 'avc' && back.w === w && back.h === h && Math.abs(back.frames - 180) <= 1 && back.audio && back.audio.codec === 'aac' && psnr > 30, ...out };
  },
  // M5 exit rows. A one-clip timeline exports exactly the M4 frames (hashes before encoding, at a size with the
  // source's aspect so neither path letterboxes), and both files decode to the same length with the audio passed through.
  async timelineExportM4() {
    const blob = await clipBlob('cut.mp4'); if (!blob) return { skipped: 'no tests/media/cut.mp4 (run tools/make-media.sh)' };
    const { openVideo } = await media(), { exportVideo, exportSequence, openTarget } = await exporter(), P = await projMod(), R = await renderMod(), g = M().gpu, n = 48;
    const v = await openVideo(blob, 'cut.mp4'), w = 320, h = Math.round((320 * v.h) / v.w / 2) * 2, info = v.info();
    const grab = (list) => (t, tex) => { list.push(heldCopy(g, tex)); };
    const a = [], b = [], tA = await openTarget('harness-m4.mp4', 'mp4', 'opfs'), tB = await openTarget('harness-seq.mp4', 'mp4', 'opfs');
    const rA = await exportVideo({ gpu: g, video: v, cfg: PRESETS['Xvid classic'], w, h, container: 'mp4', quality: 'high', audio: true, range: { start: 0, end: n / v.fps }, target: tA, onFrame: grab(a) });
    // the sequence at the working size (scale 1): the same loop as the M4 path, pixel for pixel
    const p = P.fromConfig(PRESETS['Xvid classic'], { media: P.mediaFromLibrary({ id: 'cut', name: 'cut.mp4', info }), frames: 180, width: w, height: h });
    p.sequences[0].channels[2].clips.push(P.createAudioClip(p.media[0].id, { in: 0, out: 180 }));   // its sound on A1, as an import makes it
    const rB = await exportSequence({ gpu: g, project: p, w, h, range: { in: 0, out: n }, container: 'mp4', quality: 'high', audio: true, target: tB, onFrame: grab(b),
      sources: async () => R.videoReader(await openVideo(blob, 'cut.mp4')), openMedia: async () => openVideo(blob, 'cut.mp4') });
    let same = 0; for (let i = 0; i < n; i++) { const x = await a[i], y = await b[i]; if (fnv1a(await readback(g, x)) === fnv1a(await readback(g, y))) same++; x.destroy(); y.destroy(); }
    const fa = await openVideo(await rA.file(), 'a.mp4'), fb = await openVideo(await rB.file(), 'b.mp4');
    const out = { size: `${w}×${h}`, frames: [rA.frames, rB.frames], sameFrames: same, decoded: [fa.frames, fb.frames], audio: [fa.audio?.codec || null, fb.audio?.codec || null], codec: [rA.codec, rB.codec] };
    fa.close(); fb.close(); v.close(); await tA.remove(); await tB.remove();
    return { pass: same === n && rB.frames === n && Math.abs(fa.frames - fb.frames) <= 1 && Math.abs(fb.frames - n) <= 1 && out.audio[1] === out.audio[0] && !!out.audio[1] && rB.audioMode === 'pass', audioMode: rB.audioMode, ...out };
  },
  // an edited timeline on real video (split, Mosh Cut, a hit, Bloom Insert): seeks on fresh renderers land on the
  // playback frames, and the export renders the same frames as the preview path
  async timelineEditedVideo() {
    const blob = await clipBlob('cut.mp4'); if (!blob) return { skipped: 'no tests/media/cut.mp4 (run tools/make-media.sh)' };
    const { openVideo } = await media(), { exportSequence, openTarget } = await exporter(), P = await projMod(), R = await renderMod(), T = await import('./timeline.js'), g = M().gpu;
    const v = await openVideo(blob, 'cut.mp4'), w = 320, h = Math.round((320 * v.h) / v.w / 2) * 2, info = v.info(); v.close();
    const p = P.fromConfig(PRESETS['Xvid classic'], { media: P.mediaFromLibrary({ id: 'cut', name: 'cut.mp4', info }), frames: 90 }), tl = T.createTimeline(p), V = p.sequences[0].channels[0];
    p.sequences[0].channels[2].clips.push(P.createAudioClip(p.media[0].id, { in: 0, out: 90 }));          // its sound (Bloom Insert stretches it)
    tl.exec('splitClips', { frame: 30, ids: [V.clips[0].id] }); tl.exec('trimClip', { id: V.clips[1].id, edge: 'in', frame: 30 });
    tl.exec('moveClips', { ids: [V.clips[1].id], delta: 0 }); tl.exec('setValue', { id: V.clips[1].id, path: ['sourceIn'], value: 120 });   // a real cut at the join
    tl.exec('moshCut', { channelId: V.id, frame: 30, length: 40 }); tl.exec('addMarker', { frame: 52, hit: true });
    tl.exec('bloomInsert', { clipId: V.clips[1].id, frame: 60, length: 8 });
    const n = p.sequences[0].durationFrames, sources = async () => R.videoReader(await openVideo(blob, 'cut.mp4'));
    const a = R.createSequenceRenderer(g, p, { w, h, sources }), play = [];
    for (let t = 0; t < n; t++) play.push(fnv1a(await readback(g, (await a.render(t)).image)));
    const seeks = {}; for (const t of [20, 45, 63, 80]) { const b = R.createSequenceRenderer(g, p, { w, h, sources }); seeks[t] = fnv1a(await readback(g, (await b.render(t)).image)) === play[t]; await b.destroy(); }
    const cached = {}; for (const t of [85, 33, 64, 50]) { const r = await a.render(t); cached[t] = fnv1a(await readback(g, r.image)) === play[t] && t - r.from < 16; }
    const ex = [], target = await openTarget('harness-edited.mp4', 'mp4', 'opfs');
    const r = await exportSequence({ gpu: g, project: p, w, h, container: 'mp4', quality: 'high', audio: true, target, onFrame: (t, tex) => ex.push(heldCopy(g, tex)), sources, openMedia: async () => openVideo(blob, 'cut.mp4') });
    let same = 0; for (let t = 0; t < n; t++) { const x = await ex[t]; if (fnv1a(await readback(g, x)) === play[t]) same++; x.destroy(); }
    const back = await openVideo(await r.file(), 'edited.mp4'), decoded = back.frames; back.close(); await target.remove(); await a.destroy();
    const changed = new Set(play).size;
    return { pass: Object.values(seeks).every(Boolean) && Object.values(cached).every(Boolean) && same === n && Math.abs(decoded - n) <= 1 && changed > n / 2 && r.audioMode === 'mix' && !!r.audio, frames: n, seeks, cachedSeeks: cached, exportSameAsPreview: same, decoded, audio: r.audio, audioMode: r.audioMode, audioNote: r.audioNote, distinctFrames: changed,
      layout: p.sequences[0].channels.map((c) => `${c.name}: ${c.clips.map((k) => `${k.range.in}-${k.range.out}${k.hold ? ' hold' : ''}${k.role ? ' ' + k.role : ''}`).join(', ')}`) };
  },
  // resolution independence: the same mosh rendered at the sequence's size (640x360) and at half (320x180, as a governed
  // preview would), the full render shrunk to half and compared (SSIM): with the pixel parameters scaled (scale.js) the
  // half render must look like the export, clearly closer than with them unscaled
  async previewMatchesExport() {
    const blob = await clipBlob('cut.mp4'); if (!blob) return { skipped: 'no tests/media/cut.mp4 (run tools/make-media.sh)' };
    const { openVideo } = await media(), R = await renderMod(), P = await projMod(), { compare } = await import('./metrics.js'), g = M().gpu;
    const v = await openVideo(blob, 'cut.mp4'), info = v.info(); v.close();
    const cfg = { ...PRESETS['Xvid classic'], estimate: { ...PRESETS['Xvid classic'].estimate, search: 24 }, ops: [{ op: 'pan', x: 3, y: -1.5 }], post: [{ ...fxDefaults('rgbsplit'), dx: 6 }] };
    const p = P.fromConfig(cfg, { media: P.mediaFromLibrary({ id: 'cut', name: 'cut.mp4', info }), frames: 80 }), W = p.sequences[0].width, H = p.sequences[0].height;
    const sources = async () => R.videoReader(await openVideo(blob, 'cut.mp4')), frames = [30, 55, 75];
    const shot = async (w, h, scaleParams) => { const r = R.createSequenceRenderer(g, p, { w, h, sources, scaleParams }), out = [];
      for (let t = 0; t <= frames.at(-1); t++) { const im = (await r.render(t)).image; if (frames.includes(t)) out.push(fromHalfArray(await readback(g, im))); } await r.destroy(); return out; };
    const half = (a) => { const w = W / 2, h = H / 2, o = new Float32Array(w * h * 4);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 4; k++) o[(y * w + x) * 4 + k] = (a[((2 * y) * W + 2 * x) * 4 + k] + a[((2 * y) * W + 2 * x + 1) * 4 + k] + a[((2 * y + 1) * W + 2 * x) * 4 + k] + a[((2 * y + 1) * W + 2 * x + 1) * 4 + k]) / 4;
      return o; };
    const full = (await shot(W, H, true)).map(half), on = await shot(W / 2, H / 2, true), off = await shot(W / 2, H / 2, false);
    const ss = (list) => list.map((a, i) => +compare(a, full[i], W / 2, H / 2).ssim.toFixed(4));
    const sOn = ss(on), sOff = ss(off), mean = (l) => l.reduce((a, b) => a + b, 0) / l.length;
    return { pass: mean(sOn) > mean(sOff) + 0.02, frames, ssimScaled: sOn, ssimUnscaled: sOff };
  },
  // M7: the mixer on real AAC: a one-clip project's mix equals the decoded samples exactly (48 kHz mono to 48 kHz stereo)
  async soundMix() {
    const blob = await clipBlob('cut.mp4'); if (!blob) return { skipped: 'no tests/media/cut.mp4 (run tools/make-media.sh)' };
    const { openVideo, createAudioDecoder } = await media(), X = await import('./mix.js'), P = await projMod();
    const v = await openVideo(blob, 'cut.mp4'), dec = createAudioDecoder(v), m = P.mediaFromLibrary({ id: 'cut', name: 'cut.mp4', info: v.info() });
    const p = P.fromConfig({}, { media: m, frames: 150 }); p.sequences[0].channels[2].clips.push(P.createAudioClip(m.id, { in: 0, out: 150 }));
    const sr = 48000, [L, R] = await X.mixBlock({ project: p, seq: p.sequences[0], s0: sr, s1: 3 * sr, sr, nch: 2, decode: (_, t0, t1) => dec.decode(t0, t1) });
    const raw = await dec.decode(1, 3); let max = 0; for (let i = 0; i < L.length; i++) max = Math.max(max, Math.abs(L[i] - raw.channels[0][i + sr - raw.first]));
    v.close();
    return { pass: max === 0 && L.every((x, i) => x === R[i]) && L.some((x) => x !== 0), maxDiff: max, sampleRate: dec.sampleRate, samples: L.length };
  },
  // M7 exit 1: an audio-reactive preset works. On beat.mp4 (a click every 0.5 s from 0.2 s = frames 6, 21, 36, ...),
  // "Onset bloom" holds the field exactly from each click, and the reactive render equals the same project without
  // audio features until the first click and differs from it there
  async audioReactive() {
    const blob = await clipBlob('beat.mp4'); if (!blob) return { skipped: 'no tests/media/beat.mp4 (run tools/make-media.sh)' };
    const { openVideo, analyseAudio } = await media(), R = await renderMod(), P = await projMod(), S = await seqMod(), PM = await import('./params.js'), g = M().gpu, n = 60;
    const v = await openVideo(blob, 'beat.mp4'), info = v.info(), table = await analyseAudio(v, P.toRational(v.fps)); v.close();
    const p = P.fromConfig(PRESETS['Onset bloom'], { media: P.mediaFromLibrary({ id: 'beat', name: 'beat.mp4', info }), frames: n });
    p.sequences[0].channels[2].clips.push(P.createAudioClip(p.media[0].id, { in: 0, out: n }));
    const seq = p.sequences[0], fx = seq.channels[1].clips[0], e = fx.stack[0], feats = (h) => (h === 'beat' ? table : null);
    const cfg = S.loopConfig(e, fx, seq, p, feats), holdStarts = [];
    for (let t = 1; t < n; t++) if (PM.holdAt(t, cfg.bloom) === 0) holdStarts.push(t);
    const sources = async () => R.videoReader(await openVideo(blob, 'beat.mp4')), w = 160, h = 90;
    const A = R.createSequenceRenderer(g, p, { w, h, sources, features: feats }), B = R.createSequenceRenderer(g, p, { w, h, sources, features: () => null });
    let firstDiff = -1;
    for (let t = 0; t < 24 && firstDiff < 0; t++) if (fnv1a(await readback(g, (await A.render(t)).image)) !== fnv1a(await readback(g, (await B.render(t)).image))) firstDiff = t;
    await A.destroy(); await B.destroy();
    const clicks = [6, 21, 36, 51], near = clicks.every((c) => holdStarts.some((s) => Math.abs(s - c) <= 1)) && holdStarts.every((s) => clicks.some((c) => Math.abs(s - c) <= 1));
    const clock = S.clockOf(seq, fx, e.seed, p, feats), onset = Array.from({ length: 24 }, (_, t) => +clock.audio?.('onset', t)?.toFixed(3));
    return { pass: !!table && near && firstDiff >= 6 && firstDiff <= 8, holdStarts, clicks, firstDiff, bloom: { ...cfg.bloom, hits: cfg.bloom.hits?.length }, audioKey: clock.audioKey, onset };
  },
  // M7 exit 2: stretched audio exports in sync. beat.mp4 with a 15-frame Bloom Insert at frame 60 exports with the mix:
  // the audio lasts as long as the video, clicks before the insert stay put, and clicks after the stretched span
  // (source >= 2.5 s) land 0.5 s later, within 5 ms
  async exportMix() {
    const blob = await clipBlob('beat.mp4'); if (!blob) return { skipped: 'no tests/media/beat.mp4 (run tools/make-media.sh)' };
    const { openVideo, createAudioDecoder } = await media(), { exportSequence, openTarget } = await exporter(), R = await renderMod(), P = await projMod(), T = await import('./timeline.js'), g = M().gpu;
    const v = await openVideo(blob, 'beat.mp4'), info = v.info(); v.close();
    const p = P.fromConfig(PRESETS['Xvid classic'], { media: P.mediaFromLibrary({ id: 'beat', name: 'beat.mp4', info }), frames: 180 }), tl = T.createTimeline(p);
    p.sequences[0].channels[2].clips.push(P.createAudioClip(p.media[0].id, { in: 0, out: 180 }));
    tl.exec('bloomInsert', { clipId: p.sequences[0].channels[0].clips[0].id, frame: 60, length: 15 });
    const n = p.sequences[0].durationFrames, target = await openTarget('harness-mix.mp4', 'mp4', 'opfs'), t0 = performance.now();
    const r = await exportSequence({ gpu: g, project: p, w: 160, h: 90, container: 'mp4', quality: 'high', audio: true, target,
      sources: async () => R.videoReader(await openVideo(blob, 'beat.mp4')), openMedia: async () => openVideo(blob, 'beat.mp4') });
    const secs = (performance.now() - t0) / 1000, back = await openVideo(await r.file(), 'mix.mp4'), dec = createAudioDecoder(back);
    const videoDur = n / 30, aDur = back.audio ? await back.audio.track.computeDuration() : 0;   // the presented end (priming before 0 is hidden by the edit list)
    const d = dec ? await dec.decode(0, videoDur + 0.2) : null, x = d ? d.channels[0] : new Float32Array(0), sr = d?.sampleRate || 48000, starts = [];
    for (let i = 0, last = -1e9; i < x.length; i++) if (Math.abs(x[i]) > 0.1) { if (i - last > 0.1 * sr) starts.push(+((i + (d.first || 0)) / sr).toFixed(4)); last = i; }
    back.close(); await target.remove();
    // the pass-through path on the same clicks: one untouched clip, packets copied (the source's priming packet is skipped)
    const q = P.fromConfig(PRESETS['Xvid classic'], { media: P.mediaFromLibrary({ id: 'beat', name: 'beat.mp4', info }), frames: 90 });
    q.sequences[0].channels[2].clips.push(P.createAudioClip(q.media[0].id, { in: 0, out: 90 }));
    const tq = await openTarget('harness-pass.mp4', 'mp4', 'opfs'), rq = await exportSequence({ gpu: g, project: q, w: 160, h: 90, container: 'mp4', quality: 'high', audio: true, target: tq,
      sources: async () => R.videoReader(await openVideo(blob, 'beat.mp4')), openMedia: async () => openVideo(blob, 'beat.mp4') });
    const bq = await openVideo(await rq.file(), 'pass.mp4'), dq = createAudioDecoder(bq), xq = dq ? await dq.decode(0, 3) : null, pstarts = [];
    if (xq) for (let i = 0, last = -1e9, y = xq.channels[0]; i < y.length; i++) if (Math.abs(y[i]) > 0.1) { if (i - last > 0.1 * sr) pstarts.push(+((i + xq.first) / sr).toFixed(4)); last = i; }
    bq.close(); await tq.remove();
    // the same Bloom Insert mix as WebM + Opus (Opus has its own pre-skip; this browser may not encode it at all)
    let webm = null;
    if (await (await exporter()).mixCodec('webm')) {
      const tw = await openTarget('harness-mix.webm', 'webm', 'opfs'), rw = await exportSequence({ gpu: g, project: p, w: 160, h: 90, container: 'webm', quality: 'high', audio: true, target: tw,
        sources: async () => R.videoReader(await openVideo(blob, 'beat.mp4')), openMedia: async () => openVideo(blob, 'beat.mp4') });
      const bw = await openVideo(await rw.file(), 'mix.webm'), dw = bw.audio ? createAudioDecoder(bw) : null, xw = dw ? await dw.decode(0, videoDur) : null, ws = [];
      if (xw) for (let i = 0, last = -1e9, y = xw.channels[0]; i < y.length; i++) if (Math.abs(y[i]) > 0.1) { if (i - last > 0.1 * sr) ws.push(+((i + xw.first) / sr).toFixed(4)); last = i; }
      const want = [0.2, 0.7, 1.2, 1.7, 3.2, 3.7, 4.2, 4.7, 5.2, 5.7, 6.2], e = want.map((c) => Math.min(...ws.map((s) => Math.abs(s - c))));
      webm = { audio: rw.audio, clicks: ws, maxErr: Math.max(...e) }; bw.close(); await tw.remove();
    }
    const passErr = [0.2, 0.7, 1.2, 1.7, 2.2, 2.7].map((c) => Math.min(...pstarts.map((s) => Math.abs(s - c))));
    const before = [0.2, 0.7, 1.2, 1.7], after = [3.2, 3.7, 4.2, 4.7, 5.2, 5.7, 6.2];
    const err = (list) => list.map((c) => Math.min(...starts.map((s) => Math.abs(s - c)))), eb = err(before), ea = err(after);
    const lastAudio = starts.length ? Math.max(...starts) : 0;
    return { pass: r.audioMode === 'mix' && !!r.audio && Math.max(...eb, ...ea) <= 0.005 && Math.abs(aDur - videoDur) < 0.06 && lastAudio < videoDur && rq.audioMode === 'pass' && Math.max(...passErr) <= 0.005 && (!webm || webm.maxErr <= 0.005),
      webm, passThrough: { mode: rq.audioMode, clicks: pstarts, maxErr: Math.max(...passErr) },
      frames: n, audio: r.audio, audioMode: r.audioMode, videoDur, audioDur: +aDur.toFixed(4), clicks: starts, maxErrBefore: Math.max(...eb), maxErrAfter: Math.max(...ea), secs: +secs.toFixed(2) };
  },
  // the GPU reproduces the fidelity bench's CPU numbers on every set (node moshine/tools/fidelity.mjs writes them)
  async fidelitySets() {
    const base = new URL('./tests/media/fidelity/', import.meta.url), res = await fetch(new URL('index.json', base));
    if (!res.ok) return { skipped: 'no fidelity sets (node moshine/tools/fidelity.mjs)' };
    const { compare, to8 } = await import('./metrics.js'), g = M().gpu, rows = {};
    for (const set of (await res.json()).sets) {
      const raw = async (f) => new Uint8Array(await (await fetch(new URL(f, base))).arrayBuffer()), S = await raw(set.src), Rl = await raw(set.real), fb = set.w * set.h * 3;
      const rgba = (b, t) => { const o = new Float32Array(set.w * set.h * 4); for (let i = 0; i < set.w * set.h; i++) { o[i * 4] = b[t * fb + i * 3] / 255; o[i * 4 + 1] = b[t * fb + i * 3 + 1] / 255; o[i * 4 + 2] = b[t * fb + i * 3 + 2] / 255; o[i * 4 + 3] = 1; } return o; };
      const x = createImage(g, set.w, set.h, F16), G = createMoshLoop(g, { w: set.w, h: set.h }, set.cfg); G.begin(0); let maxDev = 0, n = 0;
      for (let tau = 0; tau < set.count; tau++) {
        upload(g, x, rgba(S, tau)); const r = G.step(tau, { src: x });
        if (set.curve[tau] && tau % 5 === 2) { const m = compare(to8(fromHalfArray(await readback(g, r.out))), rgba(Rl, tau), set.w, set.h); maxDev = Math.max(maxDev, Math.abs(m.ssim - set.curve[tau][0])); n++; }
      }
      x.destroy(); G.destroy(); rows[set.name] = { framesChecked: n, maxSsimDeviation: +maxDev.toFixed(6) };
    }
    return { pass: Object.values(rows).every((r) => r.maxSsimDeviation <= 1e-4), rows };
  },
  // decode with Mediabunny, run Xvid classic: the cut fires at frame 90 only, and GPU == CPU at frame 120
  async videoCut() {
    const res = await fetch(new URL('./tests/media/cut.mp4', import.meta.url));
    if (!res.ok) return { skipped: 'no tests/media/cut.mp4 (run tools/make-media.sh)' };
    const MB = await import('./vendor/mediabunny-1.61.3.min.mjs'), g = M().gpu, w = 320, hh = 180;
    const input = new MB.Input({ formats: MB.ALL_FORMATS, source: new MB.BlobSource(await res.blob()) }), track = await input.getPrimaryVideoTrack();
    const sink = new MB.CanvasSink(track, { width: w, height: hh, fit: 'fill' }), frames = [];
    for await (const wc of sink.canvases()) frames.push(await createImageBitmap(wc.canvas));
    const x = createImage(g, w, hh, F16), G = createMoshLoop(g, { w, h: hh }, PRESETS['Xvid classic']), C = createLoopRef({ w, h: hh }, PRESETS['Xvid classic']), cuts = [];
    const put = (k) => g.device.queue.copyExternalImageToTexture({ source: frames[k] }, { texture: x }, [w, hh]);
    G.begin(0); C.begin(0); let same = 0, n = 0;
    for (let k = 0; k <= 120; k++) {
      put(k); const r = G.step(k, { src: x }); const L = await G.readLast(); if (L.cut > L.cutThresh) cuts.push(k);
      const s = fromHalfArray(await readback(g, x)), c = C.step(k, { src: s });
      if (k === 120) { const got = await readback(g, r.out), want = toHalfArray(c.out); n = got.length; for (let i = 0; i < n; i++) if (got[i] === want[i]) same++; }
    }
    x.destroy(); G.destroy(); frames.forEach((f) => f.close());
    return { pass: cuts.length === 1 && cuts[0] === 90 && same === n, frames: frames.length, cutFrames: cuts, cpuIdentical: frac(same, n) };
  },
};

export const T4 = {
  // export at large sizes (opt-in: tools/make-media.sh --uhd writes uhd4k.mp4 and uhd8k.mp4): the sequence at the clip's
  // size through Xvid classic with its sound; the encoder this browser picks, speed, and the file decoded back
  async slowExportSizes() {
    const { openVideo } = await media(), { exportSequence, openTarget } = await exporter(), P = await projMod(), R = await renderMod(), g = M().gpu, out = {};
    for (const [name, n] of [['uhd4k.mp4', 30], ['uhd8k.mp4', 20]]) {
      const blob = await clipBlob(name); if (!blob) { out[name] = { skipped: 'missing (make-media.sh --uhd)' }; continue; }
      let prof = null;
      try {
        const v = await openVideo(blob, name), info = v.info(); v.close();
        const p = P.fromConfig(PRESETS['Xvid classic'], { media: P.mediaFromLibrary({ id: name, name, info }), frames: n });
        if (info.audio) p.sequences[0].channels[2].clips.push(P.createAudioClip(p.media[0].id, { in: 0, out: n }));
        const s = p.sequences[0], target = await openTarget('harness-' + name, 'mp4', 'opfs'), t0 = performance.now();
        const r = await exportSequence({ gpu: g, project: p, w: s.width, h: s.height, container: 'mp4', quality: 'high', audio: true, target,
          sources: async () => R.videoReader(await openVideo(blob, name)), openMedia: async () => openVideo(blob, name), profile: (prof = {}) });
        const secs = (performance.now() - t0) / 1000, file = await r.file(), back = await openVideo(file, 'back.mp4');
        out[name] = { msPerFrame: prof.ms, size: `${s.width}x${s.height}`, frames: r.frames, codec: r.codec, audio: r.audio, fps: +(r.frames / secs).toFixed(1), MiB: +(file.size / 2 ** 20).toFixed(1), decodedBack: back.frames, backSize: `${back.w}x${back.h}` };
        back.close(); await target.remove();
      } catch (e) { out[name] = { error: errText(e).slice(0, 400) }; }
    }
    return { pass: Object.values(out).every((x) => x.skipped || (x.frames && Math.abs(x.decodedBack - x.frames) <= 1)), ...out };
  },
  // the M6 exit criterion (slow, opt-in: node moshine/tools/bench.mjs --only slowScrub5min): 5 minutes of the 1080p
  // clip moshed by Xvid classic, previewed at 960x540 with the editor's budgets (tier 2 GPU half, 1 GiB memory, OPFS);
  // fill by playing through once, then 30 random seeks are timed and each one is checked against the playback pixels
  async slowScrub5min() {
    const blob = await clipBlob('long1080.mp4'); if (!blob) return { skipped: 'no tests/media/long1080.mp4 (run tools/make-media.sh --long)' };
    const { openVideo } = await media(), R = await renderMod(), P = await projMod(), C = await import('./cache.js'), g = M().gpu, N = 9000, w = 960, h = 540, K = window.__scrubK || 8;
    const v0 = await openVideo(blob, 'long1080.mp4'), info = v0.info(); v0.close();
    const p = P.fromConfig(PRESETS['Xvid classic'], { media: P.mediaFromLibrary({ id: 'long', name: 'long1080.mp4', info }), frames: N });
    const sources = async () => R.videoReader(await openVideo(blob, 'long1080.mp4')), disk = await C.openDiskCache('harness-scrub');
    let seed = 7; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32), targets = [...new Set(Array.from({ length: 30 }, () => Math.floor(rnd() * N)))];
    const r = R.createSequenceRenderer(g, p, { w, h, sources, K, budget: 384 * 2 ** 20, cpuBudget: 2 ** 30, disk, diskBudget: 8 * 2 ** 30 }), want = new Map();
    const t0 = performance.now();
    for (let t = 0; t < N; t++) { const x = await r.render(t); if (targets.includes(t)) want.set(t, fnv1a(await readback(g, x.image))); if (t % 1500 === 0) console.log('scrub fill', t, ((performance.now() - t0) / 1000).toFixed(1) + ' s'); }
    await g.device.queue.onSubmittedWorkDone(); const fillS = (performance.now() - t0) / 1000; await r.settle(); const c = r.cache();
    const order = [...targets].sort(() => rnd() - 0.5), seeks = [];
    for (const t of order) {
      const plan = r.seekCost(t), tiers = r.cache().tiers, tier = plan.g === undefined ? 'none' : Object.keys(tiers).find((k) => tiers[k].includes(plan.g));
      const a = performance.now(), x = await r.render(t); await g.device.queue.onSubmittedWorkDone(); const ms = performance.now() - a;
      seeks.push({ t, ms: +ms.toFixed(1), frames: t - x.from + 1, tier, same: fnv1a(await readback(g, x.image)) === want.get(t) });
    }
    const vr = await sources(), dec = [];                                 // decode-only random seeks, for the breakdown
    for (const t of targets.slice(0, 12)) { const a = performance.now(); await vr.frame(Math.round(t * info.fps / 30)); dec.push(performance.now() - a); }
    await vr.close(); await r.destroy();
    const q = (arr, k) => { const s2 = [...arr].sort((x, y) => x - y); return +s2[Math.min(s2.length - 1, Math.floor(k * s2.length))].toFixed(1); };
    const ms = seeks.map((x) => x.ms);
    const byTier = {}; for (const x of seeks) (byTier[x.tier] ||= []).push(x.ms); for (const k of Object.keys(byTier)) byTier[k] = { n: byTier[k].length, median: q(byTier[k], 0.5), max: Math.max(...byTier[k]) };
    return { pass: seeks.every((x) => x.same) && Math.max(...ms) < 100, note: 'exit target: every seek < 100 ms on tier 2', K, byTier, fillSeconds: +fillS.toFixed(1), fillFps: +(N / fillS).toFixed(1),
      cache: { gpu: c.tiers.gpu.length, mem: c.tiers.cpu.length, disk: c.tiers.disk.length, K: c.K, spills: c.spills }, seekMs: { median: q(ms, 0.5), p90: q(ms, 0.9), max: Math.max(...ms) },
      decodeSeekMs: { median: q(dec, 0.5), max: +Math.max(...dec).toFixed(1) }, allSame: seeks.every((x) => x.same), seeks };
  },
  // the M4 exit criterion (slow, opt-in: node moshine/tools/bench.mjs --only slowExportLong): a 10-minute 1080p clip
  // (sh moshine/tools/make-media.sh --long) exports through Xvid classic with flat JS heap
  async slowExportLong() {
    const blob = await clipBlob('long1080.mp4'); if (!blob) return { skipped: 'no tests/media/long1080.mp4 (run tools/make-media.sh --long)' };
    const { openVideo } = await media(), { exportVideo, openTarget } = await exporter(), g = M().gpu, v = await openVideo(blob, 'long1080.mp4');
    const target = await openTarget('harness-long.mp4', 'mp4', 'opfs'), heap = () => (performance.memory ? performance.memory.usedJSHeapSize / 2 ** 20 : null), samples = [];
    const h0 = heap(); let ua0 = null; try { ua0 = (await performance.measureUserAgentSpecificMemory?.())?.bytes / 2 ** 20; } catch (e) {}
    const r = await exportVideo({ gpu: g, video: v, cfg: PRESETS['Xvid classic'], w: 1920, h: 1080, container: 'mp4', quality: 'high', audio: true, target,
      onProgress: (p) => { if (samples.length === 0 || p.frame - samples[samples.length - 1].frame >= 600) { samples.push({ frame: p.frame, heapMiB: heap() && +heap().toFixed(1), fps: +p.fps.toFixed(1) }); console.log('long export', JSON.stringify(samples[samples.length - 1])); } } });
    let ua1 = null; try { ua1 = (await performance.measureUserAgentSpecificMemory?.())?.bytes / 2 ** 20; } catch (e) {}
    const file = await r.file(), size = file.size; await target.remove(); v.close();
    // flat memory = no upward trend: the JS heap saws with GC, so compare the median of the last five samples with the
    // first five, and the browser's own measurement before and after where it exists (cross-origin isolated Chrome)
    const heaps = samples.map((x) => x.heapMiB).filter((x) => x !== null), med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
    const growth = heaps.length >= 10 ? med(heaps.slice(-5)) - med(heaps.slice(0, 5)) : null, uaGrowth = ua0 !== null && ua1 !== null ? ua1 - ua0 : null;
    return { pass: r.frames >= v.frames - 2 && (growth === null || growth < 32) && (uaGrowth === null || uaGrowth < 64), heapTrendMiB: growth && +growth.toFixed(1), heapRangeMiB: heaps.length ? [Math.min(...heaps), Math.max(...heaps)] : null, frames: r.frames, expected: v.frames, minutes: +(r.seconds / 60).toFixed(1), fps: +(r.frames / r.seconds).toFixed(1),
      outputMiB: +(size / 2 ** 20).toFixed(1), heapStartMiB: h0 && +h0.toFixed(1), uaMemoryMiB: [ua0 && +ua0.toFixed(0), ua1 && +ua1.toFixed(0)], samples };
  },
  // ms per 1080p rgba16float warp, 200 ping-pong steps in one submission per 20
  async warpCost() {
    const g = M().gpu, w = 1920, h = 1080, block = 16, img = [createImage(g, w, h, F16), createImage(g, w, h, F16)];
    const node = createWarp(g, { w, h, block, format: F16 }), field = new Float32Array(node.bw * node.bh * 2);
    for (let i = 0; i < field.length; i++) field[i] = ((i * 2654435761) >>> 0) % 9 - 4; node.setField(field);
    const run = async (n) => { for (let k = 0; k < n; k += 20) { const enc = g.device.createCommandEncoder(); for (let j = 0; j < 20; j++) node.encode(enc, img[j & 1], img[1 - (j & 1)]); g.device.queue.submit([enc.finish()]); } await g.device.queue.onSubmittedWorkDone(); };
    await run(20); const t0 = performance.now(); await run(200); const ms = (performance.now() - t0) / 200;
    img.forEach((x) => x.destroy()); node.destroy();
    return { msPerFrame: +ms.toFixed(3), fps: Math.round(1000 / ms), size: `${w}x${h}`, format: F16 };
  },
  // the whole Mosh Loop at 1080p: Xvid classic, and a heavy stack (residual, intra, lost, noise, smooth, synthetic)
  // where a 1080p Mosh Loop frame goes: each stage alone, 60 times, on the loop's own resources (D42: measure first)
  async stageCost1080() {
    const g = M().gpu, f = fixture('pan', { w: 1920, h: 1080 }), frames = [tex(f, 0), tex(f, 1)], out = {}, cfg = normalize(PRESETS['Xvid classic']);
    const G = createMoshLoop(g, f, cfg); G.begin(0); for (let t = 0; t < 4; t++) G.step(t, { src: frames[t & 1] }); await g.device.queue.onSubmittedWorkDone();
    const R = G.resources, e = cfg.estimate;
    const time = async (name, fn) => {
      const run = () => { const enc = g.device.createCommandEncoder(); fn(enc); g.device.queue.submit([enc.finish()]); };
      for (let i = 0; i < 5; i++) run(); await g.device.queue.onSubmittedWorkDone();
      let best = Infinity;                                       // the minimum of 7 trials of 20: robust to other GPU users
      for (let k = 0; k < 7; k++) { const t0 = performance.now(); for (let i = 0; i < 20; i++) run(); await g.device.queue.onSubmittedWorkDone(); best = Math.min(best, (performance.now() - t0) / 20); }
      out[name] = +best.toFixed(3);
    };
    await time('pyramid', (enc) => R.pyr[0].encode(enc, frames[0]));
    await time('match', (enc) => R.match.encode(enc, R.pyr[0], R.pyr[1], R.est[0], R.cut, { search: e.search, lambda: e.lambda, pel: e.pel, cutMad: e.cutMad, temporal: R.est[1] }));
    await time('match pel 1', (enc) => R.match.encode(enc, R.pyr[0], R.pyr[1], R.est[0], R.cut, { search: e.search, lambda: e.lambda, pel: 1, cutMad: e.cutMad, temporal: R.est[1] }));
    await time('warp', (enc) => R.warp.encode(enc, R.hist[0], R.pred, { field: R.est[0], cut: R.cut, edge: 0, sampling: cfg.warp.sampling, pel: cfg.warp.pel, scale: 1, zeroOnCut: false, cutThresh: 1e9, interp: cfg.warp.interp }));
    let whole = Infinity;
    for (let k = 0, t = 4; k < 7; k++) { const t0 = performance.now(); for (let i = 0; i < 20; i++, t++) G.step(t, { src: frames[t & 1] }); await g.device.queue.onSubmittedWorkDone(); whole = Math.min(whole, (performance.now() - t0) / 20); }
    out.wholeLoop = +whole.toFixed(3);
    G.destroy(); frames.forEach((x) => x.destroy());
    return { size: '1920x1080', preset: 'Xvid classic', search: e.search, pel: e.pel, msPerFrame: out };
  },
  // the evaluator's own JS per frame (D42): a small sequence (GPU cost negligible) with heavy painted state — 20 vector
  // strokes and 20 mask strokes of 100 points each, a keyframed mask opacity — rendered forward; ms per frame
  async evalOverhead() {
    const P = await projMod(), R = await renderMod(), T = await import('./timeline.js'), g = M().gpu, w = 192, h = 108;
    const f = fixture('pan', { w, h, count: 200 }), mref = { id: 'pan', name: 'pan', hash: 'fixture:pan', kind: 'video', width: w, height: h, fps: { num: 30, den: 1 }, durationFrames: 200, hasAudio: false, storage: 'opfs' };
    const p = P.fromConfig(PRESETS['Xvid classic'], { media: mref, frames: 200, width: w, height: h, timebase: { num: 30, den: 1 } }), tl = T.createTimeline(p);
    const fx = p.sequences[0].channels[1].clips[0], e = fx.stack[0];
    const stroke = (k) => { const pts = []; for (let i = 0; i < 100; i++) pts.push(0.1 + 0.8 * i / 100, 0.5 + 0.3 * Math.sin(i / 9 + k)); return { pts, r: 0.03, s: 0.01 }; };
    const out = {};
    const run = async (label) => {
      const r = R.createSequenceRenderer(g, p, { w, h, sources: async () => ({ w, h, frame: (i) => f.frame(i) }) });
      for (let t = 0; t < 10; t++) await r.render(t); await g.device.queue.onSubmittedWorkDone();
      const t0 = performance.now(); for (let t = 10; t < 70; t++) await r.render(t); await g.device.queue.onSubmittedWorkDone();
      out[label] = +((performance.now() - t0) / 60).toFixed(2); await r.destroy();
    };
    await run('plain');
    for (let k = 0; k < 20; k++) tl.exec('addVectorStroke', { effectId: e.id, stroke: stroke(k) });
    await run('20 vector strokes');
    for (let k = 0; k < 20; k++) tl.exec('addMaskStroke', { clipId: fx.id, mode: k % 4 ? 'include' : 'lock', stroke: stroke(k + 0.5) });
    await run('+ 20 mask strokes');
    const m = fx.masks[0]; tl.exec('animate', { id: m.id, path: ['opacity'], at: 0 }); tl.exec('setValue', { id: m.id, path: ['opacity'], value: 0.2, at: 100 });
    await run('+ keyframed mask opacity');
    f.destroy?.();
    return { size: `${w}x${h}`, msPerFrame: out };
  },
  async loopCost1080() {
    const f = fixture('pan', { w: 1920, h: 1080 }), frames = [tex(f, 0), tex(f, 1)], out = {};
    const heavy = normalize({ ...PRESETS['Xvid + residual'], ops: [opDefaults('lost'), opDefaults('noise'), opDefaults('smooth'), opDefaults('synthetic')], reset: { blocks: 0.002, sweepBand: 4 } });
    for (const [name, cfg] of [['Xvid classic', PRESETS['Xvid classic']], ['heavy', heavy]]) {
      const G = createMoshLoop(M().gpu, f, cfg); G.begin(0);
      for (let t = 0; t < 10; t++) G.step(t, { src: frames[t & 1] }); await M().gpu.device.queue.onSubmittedWorkDone();
      const t0 = performance.now(); for (let t = 10; t < 70; t++) G.step(t, { src: frames[t & 1] }); await M().gpu.device.queue.onSubmittedWorkDone();
      const ms = (performance.now() - t0) / 60; out[name] = { msPerFrame: +ms.toFixed(2), fps: Math.round(1000 / ms) }; G.destroy();
    }
    frames.forEach((x) => x.destroy());
    return { size: '1920x1080', ...out };
  },
};

/** An error as text in every engine (Firefox stacks leave out the message). */
const errText = (e) => { const m = String(e), st = e && e.stack ? String(e.stack) : ''; return st.includes(m) ? st : m + (st ? '\n' + st : ''); };
export async function runAll({ tag = 'dev', save = true, tiers = ['T0', 'T1', 'T4'], slow = false } = {}) {
  const out = { tag, date: new Date().toISOString(), ua: navigator.userAgent, pass: true };
  for (const [tn, tier] of [['T0', T0], ['T1', T1], ['T4', T4]]) {
    if (!tiers.includes(tn)) continue; out[tn] = {};
    for (const [name, fn] of Object.entries(tier)) {
      if (name.startsWith('slow') && !slow) continue;
      const t = performance.now(); let r;
      try { r = await fn(); } catch (e) { r = { pass: false, error: errText(e) }; }
      r.secs = +((performance.now() - t) / 1000).toFixed(2); out[tn][name] = r;
      if (r.pass === false) out.pass = false;
      console.log(`[${tn}] ${name} ${r.pass === undefined ? JSON.stringify(r) : r.pass ? 'pass' : 'FAIL ' + JSON.stringify(r)}`);
    }
  }
  if (save) { try { const res = await fetch(`/save/bench-${tag}.json`, { method: 'POST', body: JSON.stringify(out, null, 1) }); out.saved = res.ok; } catch (e) { out.saved = false; } }
  return out;
}
