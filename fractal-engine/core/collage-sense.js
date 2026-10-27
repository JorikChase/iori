// The sensing pass for a collage, on the CPU (K3's minimum: gpu/sense.js knows formulas only). Rays
// from the view are sphere-traced through the collage's estimate; at every hit the estimate's gradient
// and its derivative in every parameter (central differences) say how many pixels the surface moves per
// unit of it — speed = |∂D/∂θ| / |∇D| / (t · pixel angle), the same measure gpu/sense.js takes from its
// duals. The parameters are the collage's own continuous numbers (placements, repetitions, joins:
// core/collage-edit.js collageParams) and every piece's op parameters; a piece's drivers are not
// measured. λ at a hit is the leading piece's Lyapunov exponent at the point it reaches (core/cpu.js).
// The result has gpu/sense.js's shape, so breeding, the grab and the drift read it alike:
//   { params: [{ ref | piece, oi, op, key, value, pxPerUnit }], driveParams: [], step: 1,
//     rays: [{ uv, hit, t, x, grad, lambda, speeds, lead }], lyap, hits, points, pixelAngle }
// The step factor of a driven collage is the GPU's to measure (gpu/render.js collageStep at `points`).

import { prepare, collageAt, toPiece, repFold, collageTarget } from './collage.js';
import { collageParams } from './collage-edit.js';
import { getOp } from './ops.js';
import { lyapunov, lift } from './cpu.js';

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
function setter(g, p) {
  if (p.ref) { const t = collageTarget(g, p.ref); return (v) => { t.obj[t.key] = v; }; }
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
  if (params.length && hits.length) {
    const w = clone(g);
    Object.defineProperty(w, '__norm', { value: true });
    const Dw = (x) => collageAt(w, x, { time }).d;
    params.forEach((p, j) => {
      const set = setter(w, p), h = 1e-4 * Math.max(1, Math.abs(p.value));
      for (const r of hits) {
        set(p.value + h); const a = Dw(r.x);
        set(p.value - h); const b = Dw(r.x);
        set(p.value);
        const s = Math.abs((a - b) / (2 * h)) / Math.max(r.grad, 1e-9) / (r.t * pixelAngle);
        r.speeds[j] = Number.isFinite(s) ? s : 0;
      }
    });
    for (const p of params) p.pxPerUnit = 0;
    params.forEach((p, j) => { let s = 0; for (const r of hits) s += r.speeds[j] * r.speeds[j]; p.pxPerUnit = Math.sqrt(s / hits.length); });
  }
  const lam = hits.map((r) => r.lambda).sort((a, b) => a - b);
  const q = (f) => lam[Math.min(lam.length - 1, Math.floor(lam.length * f))] ?? 0;
  return {
    params, driveParams: [], step: 1, rays, lyap: { median: q(0.5), p10: q(0.1), p90: q(0.9) }, hits: hits.length,
    points: hits.map((r) => ({ t: r.t, x: r.x, grad: r.grad })), pixelAngle,
  };
}
