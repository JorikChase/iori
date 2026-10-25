// CPU reference backend. Slow, exact, dependency-free: the thing the GPU interpreter and the JIT are
// diffed against. Everything here is a reading of one object, the orbit:
//   { points, drs, branches, n, escaped, r }
//
//   iterate   pull: forward orbit of a point (p0, c) through the schedule
//   de        distance estimate at p from the orbit's running derivative
//   jacobian  3×3 Jacobian of one forward iteration at p (analytic per op, numeric where not)
//   lyapunov  mean log stretch of a tangent vector along the orbit
//   push      chaos game: inverse orbit with random branches; each sample carries its Jacobian
//   stepInverse  one inverse iteration (exposed for tests)

import { getOp } from './ops.js';
import { normalize, pullSafe } from './formula.js';
import { slotIndex } from './notation.js';
import { makeRng, recordingRng, replayRng } from './rng.js';
import { I3, len, matMul, matVec, mul, specNorm, sub } from './vec.js';

const FD_H = 1e-6;

// the slot used at iteration i
export function slotAt(f, i) {
  return f.slots[slotIndex(f.schedule[i % f.schedule.length])];
}

function applyOp(s, o) {
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

export function iterate(formula, p0, c = [0, 0, 0], opts = {}) {
  const f = normalize(formula);
  const iters = opts.iters || f.iters;
  const bail2 = f.bail * f.bail;
  const s = { p: [...p0], c: [...c], dr: 1 };
  const points = [[...s.p]], drs = [1], branches = [];
  let escaped = false, n = 0;
  for (let i = 0; i < iters; i++) {
    branches.push(stepForward(s, slotAt(f, i)));
    n = i + 1;
    points.push([...s.p]);
    drs.push(s.dr);
    const r2 = s.p[0] * s.p[0] + s.p[1] * s.p[1] + s.p[2] * s.p[2];
    if (!Number.isFinite(r2) || r2 > bail2) { escaped = true; break; }
  }
  return { points, drs, branches, n, escaped, r: len(s.p), dr: s.dr };
}

// Distance estimate. Formulas with a power (bulb / power) use the escape-time estimate
// 0.5·r·log r / dr; folding formulas use r / |dr|, which is what the Mandelbox literature does.
// Both are lower bounds only where the formula is pullSafe.
export function de(formula, p, c = p, opts = {}) {
  const f = normalize(formula);
  const o = iterate(f, p, c, opts);
  const hasPower = f.slots.some((s) => s.some((q) => q.op === 'bulb' || q.op === 'power'));
  if (!(o.dr > 0) || o.r === 0) return 0;
  if (hasPower) return o.escaped ? (0.5 * Math.log(o.r) * o.r) / o.dr : 0;
  return o.escaped ? o.r / Math.abs(o.dr) : 0;
}

// Jacobian of one op at p: analytic when the op provides one, central differences otherwise
export function opJacobian(o, p, c, numeric = false) {
  const def = getOp(o.op);
  if (def.jac && !numeric) return def.jac(p, o.p);
  const J = new Array(9);
  for (let j = 0; j < 3; j++) {
    const a = { p: [...p], c, dr: 1 }, b = { p: [...p], c, dr: 1 };
    a.p[j] += FD_H; b.p[j] -= FD_H;
    def.fwd(a, o.p); def.fwd(b, o.p);
    for (let i = 0; i < 3; i++) J[i * 3 + j] = (a.p[i] - b.p[i]) / (2 * FD_H);
  }
  return J;
}

// Jacobian of a whole slot (one iteration) at p — chain rule along the ops
export function jacobian(formula, p, c = [0, 0, 0], iter = 0) {
  const f = normalize(formula);
  const s = { p: [...p], c: [...c], dr: 1 };
  let J = I3();
  for (const o of slotAt(f, iter)) {
    J = matMul(opJacobian(o, s.p, s.c), J);
    applyOp(s, o);
  }
  return J;
}

// Mean log stretch of a tangent vector along n forward iterations (largest Lyapunov exponent).
// Positive: nearby orbits separate (chaos); negative: they converge (an attractor).
export function lyapunov(formula, p0, c = [0, 0, 0], n = 64) {
  const f = normalize(formula);
  const s = { p: [...p0], c: [...c], dr: 1 };
  let v = [0.6, 0.48, 0.64], sum = 0, k = 0;
  for (let i = 0; i < n; i++) {
    for (const o of slotAt(f, i)) {
      v = matVec(opJacobian(o, s.p, s.c), v);
      applyOp(s, o);
    }
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
      if (def.inv) {
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
export function push(formula, count, opts = {}) {
  const f = normalize(formula);
  const rng = opts.rng || makeRng(f.seed);
  const c = opts.c || [0, 0, 0];
  const burn = opts.burn === undefined ? 24 : opts.burn;
  const samples = [];
  let s = { p: rng.ball(), c: [...c], dr: 1 }, i = 0, stuck = 0;
  while (samples.length < count && stuck < 1000) {
    const slot = slotAt(f, f.iters - 1 - (i % f.iters));
    const rec = recordingRng(rng);
    const before = [...s.p];
    const q = stepInverse(s, slot, rec);
    if (!q || !q.every(Number.isFinite)) { s = { p: rng.ball(), c: [...c], dr: 1 }; stuck++; i = 0; continue; }
    stuck = 0;
    i++;
    if (i <= burn) continue;
    let J = null, k = 1;
    if (opts.jacobians !== false) {
      J = new Array(9);
      for (let j = 0; j < 3; j++) {
        const a = { p: [...before], c, dr: 1 }, b = { p: [...before], c, dr: 1 };
        a.p[j] += FD_H; b.p[j] -= FD_H;
        const qa = stepInverse(a, slot, replayRng(rec.log)), qb = stepInverse(b, slot, replayRng(rec.log));
        for (let r = 0; r < 3; r++) J[r * 3 + j] = qa && qb ? (qa[r] - qb[r]) / (2 * FD_H) : 0;
      }
      k = specNorm(J);
    }
    samples.push({ p: [...s.p], J, k });
  }
  return samples;
}

export { pullSafe, makeRng };
