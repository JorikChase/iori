// The sensing pass for a collage. gpu/sense.js runs it on the GPU: rays, the hits, every piece's dual
// orbit there; collageDual and readCollageSense below carry what the orbits report through the placements,
// the folds and the joins. senseCollage is the same measure on the CPU — the fallback while the GPU's shader
// compiles, and the reference its parity rows check. On the CPU: rays
// from the view are sphere-traced through the collage's estimate; at every hit the estimate's gradient
// and its derivative in every parameter (central differences) say how many pixels the surface moves per
// unit of it — speed = |∂D/∂θ| / |∇D| / (t · pixel angle), the same measure gpu/sense.js takes from its
// duals. The parameters are the collage's own continuous numbers (placements, repetitions, joins:
// core/collage-edit.js collageParams), every piece's op parameters and the collage's own drivers'
// parameters (band ends, node numbers upstream of a binding: driveParams, as { drive }); a piece's drivers
// are not measured here (the GPU's pass measures them). λ at a hit is the leading piece's Lyapunov exponent at the point it reaches (core/cpu.js).
// The result has gpu/sense.js's shape, so breeding, the grab and the drift read it alike:
//   { params: [{ ref | piece, oi, op, key, value, pxPerUnit }], driveParams: [], step: 1,
//     rays: [{ uv, hit, t, x, grad, lambda, speeds, lead }], lyap, hits, points, pixelAngle }
// The step factor of a driven collage is the GPU's to measure (gpu/render.js collageStep at `points`).

import { prepare, collageAt, toPiece, repFold, repDual, collageTarget, foldJoins, drivenWith } from './collage.js';
import { collageParams } from './collage-edit.js';
import { getOp } from './ops.js';
import { setDriveParam, getDriveParam, driveParams as drvParams, evalDrive } from './drive.js';
import { lyapunov, lift } from './cpu.js';
import { rotationXYZ, matVec, transpose } from './vec.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

// every parameter a collage's sensing measures: the collage's numbers, then each piece's op parameters
export function collageMetricParams(c) {
  const g = prepare(c), out = collageParams(g).map((p) => ({ ref: p.ref, value: p.value }));
  g.pieces.forEach((pc, i) => pc.f.slots.flat().forEach((o, oi) => {
    for (const q of getOp(o.op).params) if (!q.hidden && !q.discrete && Number.isFinite(o.p[q.k])) out.push({ piece: i, oi, op: o.op, key: q.k, value: o.p[q.k] });
  }));
  return out;
}

// a writable copy of a prepared collage and a setter for one parameter of it (no validation: the
// hot path of the differences)
export function setter(g, p) {
  if (p.ref) { const t = collageTarget(g, p.ref); return (v) => { t.obj[t.key] = v; }; }
  if (p.drive) { const d = p.piece == null ? g.drive : g.pieces[p.piece].f.drive; return (v) => setDriveParam(d, p.drive, v); }
  const o = g.pieces[p.piece].f.slots.flat()[p.oi];
  return (v) => { o.p[p.key] = v; };
}

// v: { pos, right, up, fwd, tanHalfFov, aspect, maxDist }; H: the view's height in CSS pixels;
// uvs: pairs in [-1, 1]; opts: { params (default true), lyap (default true), time, maxSteps }
export function senseCollage(collage, v, H, uvs, opts = {}) {
  const g = prepare(collage), time = opts.time || 0;
  const D = (x) => collageAt(g, x, { time }).d;
  const pixelAngle = (2 * v.tanHalfFov) / H, maxSteps = opts.maxSteps || 160;
  const rays = [];
  for (let i = 0; i < uvs.length; i += 2) {
    const uv = [uvs[i], uvs[i + 1]];
    const d = [0, 1, 2].map((k) => v.fwd[k] + v.right[k] * uv[0] * v.tanHalfFov * v.aspect - v.up[k] * uv[1] * v.tanHalfFov);
    const l = Math.hypot(...d), dir = d.map((q) => q / l);
    let t = 0, hit = false;
    for (let s = 0; s < maxSteps; s++) {
      const e = D([0, 1, 2].map((k) => v.pos[k] + dir[k] * t));
      if (e < Math.max(t * pixelAngle * 0.5, 1e-6)) { hit = true; break; }
      t += e * 0.9;
      if (t > v.maxDist) break;
    }
    rays.push({ uv, hit, t, x: [0, 1, 2].map((k) => v.pos[k] + dir[k] * t), grad: 0, lambda: 0, speeds: [], lead: -1 });
  }
  const hits = rays.filter((r) => r.hit);
  for (const r of hits) {
    const h = Math.max(1e-6, r.t * pixelAngle * 0.25);
    const gr = [0, 1, 2].map((k) => { const a = [...r.x], b = [...r.x]; a[k] += h; b[k] -= h; return (D(a) - D(b)) / (2 * h); });
    r.grad = Math.hypot(...gr);
    const at = collageAt(g, r.x, { time });
    r.lead = at.lead;
    if (opts.lyap !== false) {
      const pc = g.pieces[at.lead], q = repFold(pc.rep, toPiece(pc.place, r.x));
      try { const L = lyapunov(pc.f, lift(pc.f, q), pc.f.c || lift(pc.f, q), 32); r.lambda = Number.isFinite(L) ? L : (L && L.lambda) || 0; } catch { r.lambda = 0; }
    }
  }
  const params = opts.params === false ? [] : collageMetricParams(g);
  const driveParams = opts.params === false ? [] : collageDriveParams(g).map((p) => ({ drive: p.drive, value: p.value }));
  const all = [...params, ...driveParams];
  if (all.length && hits.length) {
    const w = clone(g);
    Object.defineProperty(w, '__norm', { value: true });
    const Dw = (x) => collageAt(w, x, { time }).d;
    all.forEach((p, j) => {
      const set = setter(w, p), h = 1e-4 * Math.max(1, Math.abs(p.value));
      for (const r of hits) {
        set(p.value + h); const a = Dw(r.x);
        set(p.value - h); const b = Dw(r.x);
        set(p.value);
        const s = Math.abs((a - b) / (2 * h)) / Math.max(r.grad, 1e-9) / (r.t * pixelAngle);
        r.speeds[j] = Number.isFinite(s) ? s : 0;
      }
    });
    all.forEach((p, j) => { let s = 0; for (const r of hits) s += r.speeds[j] * r.speeds[j]; p.pxPerUnit = Math.sqrt(s / hits.length); });
  } else for (const p of all) p.pxPerUnit = 0;
  const lam = hits.map((r) => r.lambda).sort((a, b) => a - b);
  const q = (f) => lam[Math.min(lam.length - 1, Math.floor(lam.length * f))] ?? 0;
  return {
    params, driveParams, step: 1, rays, lyap: { median: q(0.5), p10: q(0.1), p90: q(0.9) }, hits: hits.length,
    points: hits.map((r) => ({ t: r.t, x: r.x, grad: r.grad })), pixelAngle,
  };
}

// ---------- the collage's own drivers ------------------------------------------------------------------
// A collage's drive reads no orbit: fields, the start point, the clock, param nodes, maths and remaps of
// them, at the world point. So its parameters reach the estimate through the numbers they bind alone:
//   ∂D/∂θ = Σ_b ∂D/∂(b's number) · ∂v_b/∂θ,
// ∂D/∂(number) from collageDual's partials (a bound number's included), ∂v_b/∂θ from the drive in float64 at
// the hit: a band's ends exactly (∂v/∂lo = 1 − r, ∂v/∂hi = r, r the source's register), a node's number by a
// central difference of evalDrive (no orbit: cheap). A binding clamped at its number's range moves nothing.

// the bindings the GPU runs (a target, a source): core/collage.js drivenWith's order
export const liveBinds = (g) => (g.drive ? g.drive.bind.filter((b) => collageTarget(g, b.to) && g.drive.nodes.some((m) => m.id === b.from)) : []);

// the collage's own driver parameters that reach a binding: [{ drive: a core/drive.js ref, value }]
export function collageDriveParams(g) {
  const live = liveBinds(g);
  if (!live.length) return [];
  const up = new Set(), byId = new Map(g.drive.nodes.map((m) => [m.id, m]));
  const visit = (id) => {
    if (up.has(id) || !byId.has(id)) return;
    up.add(id);
    for (const s of Object.values(byId.get(id).in || {})) if (s != null) visit(s);
  };
  live.forEach((b) => visit(b.from));
  const to = new Set(live.map((b) => b.to));
  return drvParams(g.drive).filter((p) => {
    const [kind, id] = p.ref.split('/');
    return kind === 'bind' ? to.has(id) : up.has(id);
  }).map((p) => ({ drive: p.ref, value: p.value }));
}

// ∂v_b/∂θ at world point x: list (collageDriveParams) × the live bindings → [θ][b]
export function collageDriveJac(g, x, list, time = 0) {
  const live = liveBinds(g), env = { start: [x[0], x[1], x[2], 0], time, own: (ref) => { const t = collageTarget(g, ref); return t ? t.obj[t.key] : 0; } };
  const at = (d) => { const all = evalDrive(d, env); return { reg: all.reg, v: live.map((b) => all.values[d.bind.findIndex((q) => q.to === b.to)]) }; };
  const base = at(g.drive);
  const free = live.map((b, k) => { const q = collageTarget(g, b.to).spec, v = base.v[k]; return v >= (q.min ?? -Infinity) && v <= (q.max ?? Infinity); });
  return list.map((p) => {
    const [kind, id, key] = p.drive.split('/');
    if (kind === 'bind') return live.map((b, k) => {
      if (b.to !== id || !free[k]) return 0;
      const r = Number(base.reg.get(b.from)) || 0;
      return key === 'lo' ? 1 - r : r;
    });
    const v0 = getDriveParam(g.drive, p.drive), h = 1e-5 * Math.max(1, Math.abs(v0)), d = clone(g.drive);
    setDriveParam(d, p.drive, v0 + h); const hi = getDriveParam(d, p.drive), A = at(d);
    setDriveParam(d, p.drive, v0 - h); const lo = getDriveParam(d, p.drive), B = at(d);
    return live.map((_, k) => (free[k] && hi > lo ? (A.v[k] - B.v[k]) / (hi - lo) : 0));
  });
}

// ---------- through the joins ---------------------------------------------------------------------------
// One piece's dual orbit reports, at the point q its folds reach: DE and ∇DE (in its own frame). With
// d = s·DE(q) − g and q = fold(Rᵀ(x − t) / s), the chain rule gives everything else:
//   ∂d/∂x = R·Jᵀ·∇DE (the scale cancels), J the fold's Jacobian; ∂d/∂t = −∂d/∂x;
//   ∂d/∂s = DE − Jᵀ∇DE·v; ∂d/∂g = −1; ∂d/∂angle = Jᵀ∇DE · ∂Rᵀ/∂angle · (x − t);
//   ∂d/∂(a repetition's number) = s · ∇DE · ∂q/∂(it);
// and the joins' partials take each d to D (core/collage.js foldJoins). A driven number moves with x: D's
// gradient gains Σ ∂D/∂θ · ∇θ, θ a binding's value. A piece's op or driver parameter is a dual column of
// the piece's own: ∂D/∂θ = a · s · ∂DE/∂θ.

const TURN = { rx: 0, ry: 1, rz: 2 };
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ∂Rᵀ/∂angle (per degree) for the three angles, by central differences in float64: rotationXYZ stays the one
// definition. An undriven piece's are kept (place objects are stable through a pass).
const turnCache = new WeakMap();
function turns(P) {
  let t = turnCache.get(P);
  if (!t) {
    const h = 1e-3, a = [P.rx, P.ry, P.rz];
    t = [0, 1, 2].map((k) => {
      const hi = [...a], lo = [...a];
      hi[k] += h; lo[k] -= h;
      const A = transpose(rotationXYZ(...hi)), B = transpose(rotationXYZ(...lo));
      return A.map((v, i) => (v - B[i]) / (2 * h));
    });
    turnCache.set(P, t);
  }
  return t;
}

// the collage's own numbers the chain rule speaks for (core/collage-edit.js collageParams), and which of
// them a binding overrides: those have no value of their own, they are not measured
export function collageNumbers(g) {
  const bound = new Set(g.drive ? g.drive.bind.filter((b) => collageTarget(g, b.to)).map((b) => b.to) : []);
  return collageParams(g).map((p) => {
    const m = /^([PJ])(\d+)\.(\w+)$/.exec(p.ref);
    return { ref: p.ref, value: p.value, join: m[1] === 'J', i: +m[2], key: m[3], bound: bound.has(p.ref) };
  });
}

// g: prepared; x: the hit; recs: per piece { de, grad }; dv: null, or the drive's { values, grads } at x, one
// per binding the GPU runs; held: per piece the gradient with its own drivers held (or null where it has none)
// → { d, grad, gradHeld, a, w, lead, seam, partial: ∂D/∂ every collageNumbers entry }
export function collageDual(g, x, recs, numbers, dv = null, held = null) {
  const c = dv ? drivenWith(g, dv.values) : g;
  const ps = c.pieces.map((pc, i) => {
    const P = pc.place, R = rotationXYZ(P.rx, P.ry, P.rz), dx = [x[0] - P.tx, x[1] - P.ty, x[2] - P.tz];
    const v = matVec(transpose(R), dx).map((q) => q / P.s), fold = repDual(pc.rep, v), up = fold.up(recs[i].grad);
    return { P, R, dx, v, fold, up, dist: P.s * recs[i].de - P.g };
  });
  const J = foldJoins(c, ps.map((p) => p.dist), true);
  const grad = [0, 0, 0], gradHeld = [0, 0, 0];
  ps.forEach((p, i) => {
    const w = matVec(p.R, p.up), h = held && held[i] ? matVec(p.R, p.fold.up(held[i])) : w;
    for (let k = 0; k < 3; k++) { grad[k] += J.a[i] * w[k]; gradHeld[k] += J.a[i] * h[k]; }
    p.world = w;
  });
  const partial = new Float64Array(numbers.length);
  numbers.forEach((q, n) => {
    if (q.join) { partial[n] = J.shape[q.i]; return; }
    const p = ps[q.i], a = J.a[q.i], k = q.key;
    let d;
    if (k === 'tx' || k === 'ty' || k === 'tz') d = -p.world['xyz'.indexOf(k[1])];
    else if (k in TURN) d = dot3(p.up, matVec(turns(p.P)[TURN[k]], p.dx));
    else if (k === 's') d = recs[q.i].de - dot3(p.up, p.v);
    else if (k === 'g') d = -1;
    else d = p.P.s * p.fold.along(k, recs[q.i].grad);
    partial[n] = a * d;
  });
  // a driven number carries the point's motion into the estimate
  if (dv) {
    const at = new Map(numbers.map((q, n) => [q.ref, n]));
    let k = 0;
    for (const b of g.drive.bind) {
      if (!collageTarget(g, b.to) || !g.drive.nodes.some((m) => m.id === b.from)) continue;
      const n = at.get(b.to), gv = dv.grads[k++];
      if (n !== undefined) for (let e = 0; e < 3; e++) grad[e] += partial[n] * gv[e];
    }
  }
  return { d: J.d, grad, gradHeld, a: J.a, s: ps.map((p) => p.P.s), w: J.w, lead: J.lead, seam: J.seam, partial };
}

// The GPU pass's output, in vec4 (gpu/sense.js COLLAGE_SENSE). Per ray, CS_RAY vec4: [t, hit, 0, 0]; two per
// piece (eight slots): [∇DE, DE] [λ, 0, 0, 0]; the drive's bindings: their sixteen values, then their
// sixteen gradients, x, y, z. Then one vec4 per ray and row: [∇DE, ∂DE/∂θ] of the row's piece.
export const CS_RAY = 33, CS_PIECE = 1, CS_VALUES = 17, CS_DVALUES = 21;

// rows (gpu/pack.js collageSenseRows): { piece, oi, op, key, value } | { piece, drive, value } | { piece, frozen }
// opts: { params, time (the clock the GPU ran at: the collage's own drive is evaluated here) }
// → gpu/sense.js's shape (params, driveParams, step, rays, lyap, hits, points, pixelAngle). rays also carry
// n (the exact normal) and lead; speeds run over params, then driveParams (the pieces' rows, then the collage's own, { drive } with no piece), as a formula's.
export function readCollageSense(collage, v, H, uvs, o, rows = [], opts = {}) {
  const g = prepare(collage), N = g.pieces.length, n = uvs.length / 2, pixelAngle = (2 * v.tanHalfFov) / H;
  const numbers = collageNumbers(g), own = opts.params === false ? [] : numbers.flatMap((q, k) => (q.bound ? [] : [k]));
  const ops = rows.filter((r) => r.oi !== undefined && !r.frozen), drv = rows.filter((r) => r.drive), frozen = rows.flatMap((r, j) => (r.frozen ? [[r.piece, j]] : []));
  const rowsAt = CS_RAY * n, rowIndex = new Map(rows.map((r, j) => [r, j]));
  const live = liveBinds(g), nb = live.length;
  // the collage's own drivers: their numbers' partials through the bindings (above)
  const cdrv = opts.params === false ? [] : collageDriveParams(g), refAt = new Map(numbers.map((q, k) => [q.ref, k]));
  const bindAt = live.map((b) => refAt.get(b.to));
  const rays = [], Ls = [];
  for (let i = 0; i < n; i++) {
    const uv = [uvs[i * 2], uvs[i * 2 + 1]], at = i * CS_RAY * 4, t = o[at], hit = o[at + 1] > 0.5;
    const d = [0, 1, 2].map((k) => v.fwd[k] + v.right[k] * uv[0] * v.tanHalfFov * v.aspect - v.up[k] * uv[1] * v.tanHalfFov);
    const l = Math.hypot(...d), x = [0, 1, 2].map((k) => v.pos[k] + (d[k] / l) * t);
    const ray = { uv, hit, t, x, grad: 0, n: null, lambda: 0, speeds: [], lead: -1 };
    rays.push(ray);
    if (!hit) continue;
    const recs = [], lams = [];
    for (let p = 0; p < N; p++) {
      const b = at + (CS_PIECE + 2 * p) * 4;
      recs.push({ grad: [o[b], o[b + 1], o[b + 2]], de: o[b + 3] });
      lams.push(o[b + 4]);
    }
    const dv = nb ? {
      values: Array.from({ length: nb }, (_, b) => o[at + CS_VALUES * 4 + b]),
      grads: Array.from({ length: nb }, (_, b) => [0, 1, 2].map((e) => o[at + (CS_DVALUES + 4 * e) * 4 + b])),
    } : null;
    let held = null;
    if (frozen.length) {
      held = new Array(N).fill(null);
      for (const [p, j] of frozen) { const k = (rowsAt + j * n + i) * 4; held[p] = [o[k], o[k + 1], o[k + 2]]; }
    }
    const D = collageDual(g, x, recs, numbers, dv, held), gl = Math.hypot(...D.grad);
    ray.grad = gl;
    ray.n = gl > 0 ? D.grad.map((q) => q / gl) : null;
    ray.lead = D.lead;
    // λ as the march takes it: blended by the shares
    ray.lambda = lams.reduce((a, q, p) => a + (D.w[p] > 1e-3 ? D.w[p] * q : 0), 0);
    // no gradient, no surface to move (inside an escape-time piece, where the estimate is flat)
    const speed = (dD) => { const s = gl > 1e-9 ? dD / gl / (t * pixelAngle) : 0; return Number.isFinite(s) ? s : 0; };
    if (opts.params !== false) {
      for (const k of own) ray.speeds.push(speed(D.partial[k]));
      for (const r of [...ops, ...drv]) ray.speeds.push(speed(D.a[r.piece] * D.s[r.piece] * o[(rowsAt + rowIndex.get(r) * n + i) * 4 + 3]));
      if (cdrv.length) {
        const J = collageDriveJac(g, x, cdrv, opts.time || 0);
        for (const row of J) { let s = 0; row.forEach((q, k) => { if (q && bindAt[k] !== undefined) s += D.partial[bindAt[k]] * q; }); ray.speeds.push(speed(s)); }
      }
    }
    // the step factor L, as gpu/sense.js takes it: the estimate's gradient, over the same with every drive held
    if (nb || frozen.length) { const h = Math.hypot(...D.gradHeld); if (gl > 0 && h > 0) Ls.push(Math.max(1, gl / h)); }
  }
  const hits = rays.filter((r) => r.hit);
  const rms = (j) => { let s = 0; for (const r of hits) s += r.speeds[j] * r.speeds[j]; return Math.sqrt(s / Math.max(hits.length, 1)); };
  const params = [], driveParams = [];
  if (opts.params !== false) {
    own.forEach((k) => params.push({ ref: numbers[k].ref, value: numbers[k].value }));
    ops.forEach((r) => params.push({ piece: r.piece, oi: r.oi, op: r.op, key: r.key, value: r.value }));
    drv.forEach((r) => driveParams.push({ piece: r.piece, drive: r.drive, value: r.value }));
    cdrv.forEach((p) => driveParams.push({ drive: p.drive, value: p.value }));
    params.forEach((p, j) => { p.pxPerUnit = rms(j); });
    driveParams.forEach((p, j) => { p.pxPerUnit = rms(params.length + j); });
  }
  Ls.sort((a, b) => a - b);
  const step = Math.min(16, Ls.length ? Ls[Math.floor(Ls.length * 0.9)] : 1);
  const lam = hits.map((r) => r.lambda).sort((a, b) => a - b);
  const q = (f) => lam[Math.min(lam.length - 1, Math.floor(lam.length * f))] ?? 0;
  return {
    params, driveParams, step, rays, lyap: { median: q(0.5), p10: q(0.1), p90: q(0.9) }, hits: hits.length,
    points: hits.map((r) => ({ t: r.t, x: r.x, grad: r.grad })), pixelAngle,
  };
}
