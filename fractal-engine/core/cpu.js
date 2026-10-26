// CPU reference backend. Slow, exact, dependency-free: the thing the GPU interpreter and the JIT are
// diffed against. Everything here is a reading of one object, the orbit:
//   { points, drs, branches, n, escaped, r }
// The orbit lives in 4-D. Every function takes either a world point [x, y, z], which it embeds through
// the formula's slice, or an orbit point [x, y, z, w] as it is; a constant c of three numbers has w = 0.
//
//   iterate   pull: forward orbit of a point (p0, c) through the schedule
//   de        distance estimate at p from the orbit's running derivative
//   jacobian  4×4 Jacobian of one forward iteration at p (analytic per op, numeric where not)
//   lyapunov  mean log stretch of a tangent vector along the orbit
//   push      chaos game: inverse orbit with random branches; each sample carries its Jacobian
//   stepInverse  one inverse iteration (exposed for tests)

import { getOp, isMix } from './ops.js';
import { weights, orbitWeights } from './fields.js';
import { normalize, pullSafe, mixKids } from './formula.js';
import { slotIndex } from './notation.js';
import { makeRng, recordingRng, replayRng } from './rng.js';
import { I4, len, add, sub, matMul, matVec, mul, specNorm, embed, sliceMatrix, normalize as nrm } from './vec.js';

// a world point through the slice, or an orbit point as it is; constants are padded with w = 0
export const lift = (f, x) => (x.length === 4 ? [...x] : embed(f.slice || {}, x));
const pad4 = (c) => (c.length === 4 ? [...c] : [c[0], c[1], c[2], 0]);
const ball4 = (rng) => {
  for (;;) {
    const q = [rng.float() * 2 - 1, rng.float() * 2 - 1, rng.float() * 2 - 1, rng.float() * 2 - 1];
    if (q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3] <= 1) return q;
  }
};

const FD_H = 1e-6;

// the slot used at iteration i
export function slotAt(f, i) {
  return f.slots[slotIndex(f.schedule[i % f.schedule.length])];
}

// ---------- the chimera (ops.js mix.*): k sub-stacks on the same point, blended -------------------
// The orbit's running context, which the fields read: p0 the start (the world frame), trap the least
// |p|² so far (the start included), i the iteration under way of n. A state without one (a single
// step, as tests and the inverse check take it) is its own start.
const ctxOf = (s) => s.ctx || { p0: s.p, trap: dot4(s.p, s.p), i: 0, n: 1 };
const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
export const startCtx = (f, p) => ({ p0: [...p], trap: dot4(p, p), i: 0, n: f.iters });
function endIteration(s) { if (s.ctx) s.ctx.trap = Math.min(s.ctx.trap, dot4(s.p, s.p)); }

// the species run, their weights, the blend. asOrbit: a world-frame field read at the point itself
// (the inverse, which has no start point, solves for a point that is its own start)
function mixEval(o, p, c, dr, ctx, asOrbit = false) {
  const k = o.kids.length;
  const runs = o.kids.map((kid) => { const a = { p: [...p], c, dr }; stepForward(a, kid); return a; });
  const world = o.p.at && !asOrbit;
  // (asOrbit reads a world field at the point itself, as it is, the way the GPU's inverse does)
  const W = o.p.at ? weights(o.op, o.p, k, world ? ctx.p0 : p, { ...ctx, dr }) : orbitWeights(o.op, o.p, k, p, { ...ctx, dr });
  const out = [0, 0, 0, 0];
  runs.forEach((r, i) => { for (let a = 0; a < 4; a++) out[a] += W.w[i] * r.p[a]; });
  // dr: the species' own, weighted (see ops.js mix: the field's own stretch is not in it)
  return { p: out, dr: runs.reduce((a, r, i) => a + W.w[i] * r.dr, 0), runs, W, world };
}

function mixFwd(s, o) {
  const m = mixEval(o, s.p, s.c, s.dr, ctxOf(s));
  s.p = m.p; s.dr = m.dr;
  // the branch records the species that leads
  return 1 + m.W.w.indexOf(Math.max(...m.W.w));
}

function stackJacobian(ops, p, c) {
  const s = { p: [...p], c, dr: 1 };
  let J = I4();
  for (const o of ops) { J = matMul(opJacobian(o, s.p, c), J); applyOp(s, o); }
  return { J, p: s.p };
}

// Σ ωᵢJᵢ + Σ Fᵢ∇ωᵢᵀ at fixed context (the self-fields' readings and a world field's start held still)
function mixJacobian(o, p, c, ctx, asOrbit = false) {
  const m = mixEval(o, p, c, ctx.dr ?? 1, ctx, asOrbit);
  const J = new Array(16).fill(0);
  o.kids.forEach((kid, i) => {
    const sj = stackJacobian(kid, p, c);
    for (let r = 0; r < 16; r++) J[r] += m.W.w[i] * sj.J[r] + (m.world ? 0 : sj.p[r >> 2] * m.W.G[i][r & 3]);
  });
  return J;
}

// solve the 4×4 system A x = y by elimination with partial pivoting; null when singular
function solve4(A, y) {
  const M = [0, 1, 2, 3].map((i) => [...A.slice(i * 4, i * 4 + 4), y[i]]);
  for (let k = 0; k < 4; k++) {
    let piv = k;
    for (let i = k + 1; i < 4; i++) if (Math.abs(M[i][k]) > Math.abs(M[piv][k])) piv = i;
    if (!(Math.abs(M[piv][k]) > 1e-12)) return null;
    [M[k], M[piv]] = [M[piv], M[k]];
    for (let i = 0; i < 4; i++) if (i !== k) {
      const f = M[i][k] / M[k][k];
      for (let j = k; j < 5; j++) M[i][j] -= f * M[k][j];
    }
  }
  return M.map((r, i) => r[4] / r[i]);
}

// A preimage of the blend: invert one species for a first guess, then Newton on the blend itself. Up
// to MIX_GUESSES guesses, cycling through the species from a random one and redrawing their branches;
// a point none of them reaches is a dead end, which the chaos game backs out of. A world-frame field is
// read at the preimage itself; the self-fields at the context given (the walk knows its iteration).
export const MIX_NEWTON = 8, MIX_GUESSES = 4;
function mixInv(q, o, rng, s0) {
  const k = o.kids.length, first = rng.pick(k), ctx = ctxOf(s0);
  const tol = 1e-9 * (1 + len(q));
  for (let g = 0; g < MIX_GUESSES; g++) {
    const s = { p: [...q], c: s0.c, dr: 1 };
    let x = stepInverse(s, o.kids[(first + g) % k], rng, 1);
    if (!x) continue;
    let best = Infinity, stall = 0;
    for (let i = 0; i <= MIX_NEWTON; i++) {
      const F = sub(mixEval(o, x, s0.c, 1, ctx, true).p, q), e = len(F);
      if (e <= tol) return x;
      // a guess outside Newton's basin shows soon: two steps without the residual shrinking (one is
      // allowed — crossing a fold's edge can cost a step)
      if (e < 0.9 * best) { best = e; stall = 0; } else stall++;
      if (i === MIX_NEWTON || stall >= 2 || !Number.isFinite(e)) break;
      const dx = solve4(mixJacobian(o, x, s0.c, ctx, true), F);
      if (!dx) break;
      x = sub(x, dx);
    }
  }
  return null;
}

function applyOp(s, o) {
  if (isMix(o.op)) return mixFwd(s, o);
  const def = getOp(o.op);
  const r = def.fwd(s, o.p);
  if (def.wRule === 'mul') s.dr *= r.k;
  else if (def.wRule === 'plus') s.dr += 1;
  return r.branch;
}

// one forward iteration through a slot; returns the branch ids taken
export function stepForward(s, slot) {
  return slot.map((o) => applyOp(s, o));
}

export function iterate(formula, p0, c = [0, 0, 0, 0], opts = {}) {
  const f = normalize(formula);
  const iters = opts.iters || f.iters;
  const bail2 = f.bail * f.bail;
  const s = { p: lift(f, p0), c: pad4(c), dr: 1 };
  s.ctx = startCtx(f, s.p);
  const points = [[...s.p]], drs = [1], branches = [];
  let escaped = false, n = 0;
  for (let i = 0; i < iters; i++) {
    s.ctx.i = i;
    branches.push(stepForward(s, slotAt(f, i)));
    endIteration(s);
    n = i + 1;
    points.push([...s.p]);
    drs.push(s.dr);
    const r2 = s.p[0] * s.p[0] + s.p[1] * s.p[1] + s.p[2] * s.p[2] + s.p[3] * s.p[3];
    if (!Number.isFinite(r2) || r2 > bail2) { escaped = true; break; }
  }
  return { points, drs, branches, n, escaped, r: len(s.p), dr: s.dr };
}

// Distance estimate. Formulas with a power (bulb / power) use the escape-time estimate
// 0.5·r·log r / dr, and 0 for orbits that stay (inside). Folding formulas use r / |dr| whether or not
// the orbit escaped, which is what the Mandelbox / KIFS literature does: with few iterations most
// points near the surface never reach the bail radius. Both are lower bounds only where the formula
// is pullSafe. The GPU interpreter (gpu/wgsl.js) computes exactly this.
// A chimera is a power formula only if every species is: one whose species are an IFS and a bulb
// would read the IFS's bounded orbits as inside (escape-time gives 0 there) and lose its surfaces;
// r / dr serves both kinds.
const POWERS = new Set(['bulb', 'bulb4', 'power', 'quat']);
const slotPower = (f, slot) => slot.some((q) => POWERS.has(q.op) || (isMix(q.op) && q.kids && q.kids.every((k) => slotPower(f, k))));
export const hasPower = (f) => {
  const g = f.slots.some((s) => s.some((q) => isMix(q.op))) && !f.slots.some((s) => s.some((q) => q.kids)) ? normalize(f) : f;
  const { top } = mixKids(g);
  return g.slots.slice(0, Math.max(top, 1)).some((s) => slotPower(g, s));
};

export function de(formula, p, c, opts = {}) {
  const f = normalize(formula);
  const p4 = lift(f, p);
  const o = iterate(f, p4, c ? pad4(c) : f.c || p4, opts);
  if (!(o.dr > 0) || o.r === 0) return 0;
  if (hasPower(f)) return o.escaped && o.r > 1 ? (0.5 * Math.log(o.r) * o.r) / o.dr : 0;
  return o.r / Math.abs(o.dr);
}

// Jacobian of one op at p: analytic when the op provides one, central differences otherwise
// ctx: the orbit's running context, which a chimera's field reads (held still: see mixJacobian)
export function opJacobian(o, p, c, numeric = false, ctx = null) {
  if (isMix(o.op) && !numeric) return mixJacobian(o, p, c, ctx || { p0: p, trap: dot4(p, p), i: 0, n: 1 });
  const def = getOp(o.op);
  if (def.jac && !numeric) return def.jac(p, o.p);
  const J = new Array(16);
  for (let j = 0; j < 4; j++) {
    const a = { p: [...p], c, dr: 1, ctx }, b = { p: [...p], c, dr: 1, ctx };
    if (!ctx) { a.ctx = { p0: p, trap: dot4(p, p), i: 0, n: 1 }; b.ctx = a.ctx; }
    a.p[j] += FD_H; b.p[j] -= FD_H;
    applyOp(a, o); applyOp(b, o);
    for (let i = 0; i < 4; i++) J[i * 4 + j] = (a.p[i] - b.p[i]) / (2 * FD_H);
  }
  return J;
}

// Jacobian of a whole slot (one iteration) at p — chain rule along the ops
export function jacobian(formula, p, c = [0, 0, 0, 0], iter = 0) {
  const f = normalize(formula);
  const s = { p: lift(f, p), c: pad4(c), dr: 1 };
  s.ctx = { ...startCtx(f, s.p), i: iter };
  let J = I4();
  for (const o of slotAt(f, iter)) {
    J = matMul(opJacobian(o, s.p, s.c, false, { ...s.ctx, dr: s.dr }), J);
    applyOp(s, o);
  }
  return J;
}

// Mean log stretch of a tangent vector along n forward iterations (largest Lyapunov exponent).
// Positive: nearby orbits separate (chaos); negative: they converge (an attractor).
// The tangent starts along the world direction (0.6, 0.48, 0.64) carried into 4-D by the slice.
const worldTangent = (f) => {
  const T = sliceMatrix(f.slice || {}), d = nrm([0.6, 0.48, 0.64]);
  return [0, 1, 2, 3].map((i) => T[i * 4] * d[0] + T[i * 4 + 1] * d[1] + T[i * 4 + 2] * d[2]);
};

export function lyapunov(formula, p0, c = [0, 0, 0, 0], n = 64) {
  const f = normalize(formula);
  const s = { p: lift(f, p0), c: pad4(c), dr: 1 };
  s.ctx = startCtx(f, s.p);
  let v = worldTangent(f), sum = 0, k = 0;
  for (let i = 0; i < n; i++) {
    s.ctx.i = i;
    for (const o of slotAt(f, i)) {
      v = matVec(opJacobian(o, s.p, s.c, false, { ...s.ctx, dr: s.dr }), v);
      applyOp(s, o);
    }
    endIteration(s);
    const l = len(v);
    if (!(l > 0) || !Number.isFinite(l)) break;
    sum += Math.log(l); k++;
    v = mul(v, 1 / l);
    if (len(s.p) > f.bail * 1e6) break;
  }
  return k ? sum / k : 0;
}

// One inverse iteration of a slot: ops in reverse order, each inverted on a random branch, or applied
// forward when it has no inverse (flame variations). Returns null when p has no preimage.
// A branch chosen upstream can land on a side that a later fold never produces; the step then has no
// preimage along that chain and is redrawn, up to `tries` times.
export function stepInverse(s, slot, rng, tries = 8) {
  const start = [...s.p];
  for (let attempt = 0; attempt < tries; attempt++) {
    s.p = [...start];
    let ok = true;
    for (let i = slot.length - 1; i >= 0 && ok; i--) {
      const o = slot[i], def = getOp(o.op);
      if (isMix(o.op)) {
        const q = mixInv(s.p, o, rng, s);
        if (q) s.p = q; else ok = false;
      } else if (def.inv) {
        const q = def.inv(s.p, o.p, rng, s);
        if (q) s.p = q; else ok = false;
      } else {
        def.fwd(s, o.p);
      }
    }
    if (ok) return s.p;
  }
  s.p = start;
  return null;
}

// Chaos game. Yields samples { p, J, k } where J is the Jacobian of the inverse step that produced
// the sample (its singular directions are the splat's axes) and k the step's operator norm.
//
// The walk goes down the tree of preimages with one random attempt per step, and backs up out of
// dead ends through a short history instead of retrying or respawning. A fold's preimage often lies
// on a side the next fold never produces; retrying in place picks uniformly among a point's live
// preimages, which lets thin branches swallow the walk (a Sierpiński tetrahedron collapsed onto one
// edge, a Menger formula produced no samples at all). Backing up weights each branch by whether it
// can be continued, recursively. Measured 2026-10-26 (24³ voxel entropy of 30k samples): tetrahedron
// 4.6 → 10.2 bits at ~2 steps per sample, Menger 0 samples → 11.8 bits.
export const HISTORY = 16;

export function push(formula, count, opts = {}) {
  const f = normalize(formula);
  const rng = opts.rng || makeRng(f.seed);
  const c = pad4(opts.c || f.c || [0, 0, 0, 0]);
  const burn = opts.burn === undefined ? 24 : opts.burn;
  const samples = [];
  let stack = [{ p: ball4(rng), i: 0 }], respawns = 0;
  // a formula whose preimages always escape after a step or two never empties the stack: cap the walk
  let steps = 0;
  const maxSteps = 1000 * (count + burn + 10);
  while (samples.length < count && respawns < 1000 && steps++ < maxSteps) {
    const top = stack[stack.length - 1];
    const iter = f.iters - 1 - (top.i % f.iters);
    const slot = slotAt(f, iter);
    const rec = recordingRng(rng);
    // the walk knows which iteration it inverts; the trap it reads is the point's own
    const ctx = { p0: top.p, trap: dot4(top.p, top.p), i: iter, n: f.iters };
    const s = { p: [...top.p], c: [...c], dr: 1, ctx };
    const q = stepInverse(s, slot, rec, 1);
    if (!q || !q.every(Number.isFinite) || Math.hypot(...q) > f.bail) {
      stack.pop();
      if (!stack.length) { stack = [{ p: ball4(rng), i: 0 }]; respawns++; }
      continue;
    }
    stack.push({ p: [...q], i: top.i + 1 });
    if (stack.length > HISTORY) stack.shift();
    if (top.i + 1 <= burn) continue;
    let J = null, k = 1;
    if (opts.jacobians !== false) {
      J = new Array(16);
      for (let j = 0; j < 4; j++) {
        const a = { p: [...top.p], c, dr: 1, ctx }, b = { p: [...top.p], c, dr: 1, ctx };
        a.p[j] += FD_H; b.p[j] -= FD_H;
        const qa = stepInverse(a, slot, replayRng(rec.log), 1), qb = stepInverse(b, slot, replayRng(rec.log), 1);
        for (let r = 0; r < 4; r++) J[r * 4 + j] = qa && qb ? (qa[r] - qb[r]) / (2 * FD_H) : 0;
      }
      k = specNorm(J);
    }
    samples.push({ p: [...q], J, k });
  }
  return samples;
}

// ---------- references for the GPU's dual numbers ------------------------------------------------
// Central differences in float64: slow and exact enough to check the shader's derivatives against.

const FD = 1e-6;

// gradient of the distance estimate at the world point p (c follows p unless the formula fixes it)
export function deGrad(formula, p) {
  const f = normalize(formula);
  return [0, 1, 2].map((i) => {
    const a = [...p], b = [...p];
    a[i] += FD; b[i] -= FD;
    return (de(f, a) - de(f, b)) / (2 * FD);
  });
}

// derivative of the distance estimate at p with respect to one parameter of op number oi (counted
// across slots in order)
export function deParam(formula, p, oi, key) {
  const f = normalize(formula);
  const at = (delta) => {
    const g = JSON.parse(JSON.stringify(f));
    let n = 0;
    for (const s of g.slots) for (const o of s) { if (n === oi) o.p[key] += delta; n++; }
    return de(g, p);
  };
  const v = Math.abs(f.slots.flat()[oi].p[key]);
  const h = FD * Math.max(1, v);
  return (at(h) - at(-h)) / (2 * h);
}

// Lyapunov exponent with the GPU's semantics: the formula's iterations, stopping at escape, mean log
// stretch per iteration of a tangent at fixed c (c = the point unless the formula fixes it)
export function lyapunovOrbit(formula, p0) {
  const f = normalize(formula);
  const p4 = lift(f, p0);
  const c = f.c || [...p4];
  const s = { p: p4, c, dr: 1 };
  s.ctx = startCtx(f, s.p);
  let v = worldTangent(f), sum = 0, n = 0;
  for (let i = 0; i < f.iters; i++) {
    s.ctx.i = i;
    for (const o of slotAt(f, i)) {
      v = matVec(opJacobian(o, s.p, s.c, false, { ...s.ctx, dr: s.dr }), v);
      applyOp(s, o);
    }
    endIteration(s);
    n++;
    const l = len(v);
    if (l > 0 && l < 1e30) { sum += Math.log(l); v = mul(v, 1 / l); }
    if (!(len(s.p) <= f.bail)) break;
  }
  return sum / Math.max(n, 1);
}

export { pullSafe, makeRng };
