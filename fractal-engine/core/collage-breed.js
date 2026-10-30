// Breeding collages (DESIGN.md "Collage (K)", K3): two collages with the same number of pieces breed
// piece by piece — a piece whose two formulas share a structure interpolates its parameters as a
// formula does (core/metasurface.js blendSame's rules: parameters, c, slice, iterations, bail), one
// whose structures differ is taken from one parent; placements and the joins' numbers interpolate; a
// kernel, an op or a repetition's kind that differs is taken from one parent (a below t = ½, b from
// there). Different counts, or a collage and a formula, do not breed (lerpCollage returns null).
//
// The metric (as core/breed.js's): entries name a collage number { ref: 'P0.tx' | 'J1.r' …, pxPerUnit }
// or a piece's op parameter { piece, oi, op, key, pxPerUnit }. mutateCollage steps D on-screen pixels in
// a random direction across the unpinned ones, so every neighbour is a known visual distance away.

import { masterParam } from './sub.js';
import { normCollage, isCollage, PLACE, REP, JOIN } from './collage.js';
import { getCollageParam, setCollageParam } from './collage-edit.js';
import { normalize } from './formula.js';
import { getOp } from './ops.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const structureOf = (f) => JSON.stringify([f.slots.map((sl) => sl.map((o) => o.op)), f.schedule, f.iters, f.c ? 1 : 0, !!f.drive, !!f.shade]);
const mix = (a, b, t) => a + (b - a) * t;
const round6 = (v) => +v.toPrecision(6);

// a collage's breeding structure: what must agree for two collages to walk between each other smoothly
export function collageStructure(c) {
  const g = normCollage(c);
  return JSON.stringify([g.pieces.map((q) => [structureOf(q.f), q.rep && q.rep.kind]), g.joins.map((j) => [j.op, j.k])]);
}

export const canBreed = (a, b) => isCollage(a) && isCollage(b) && normCollage(a).pieces.length === normCollage(b).pieces.length;

// two formulas of one structure at t; of different structures, the nearer parent
export function lerpFormula(a, b, t) {
  const fa = normalize(a), fb = normalize(b);
  if (structureOf(fa) !== structureOf(fb)) return clone(t < 0.5 ? fa : fb);
  const f = clone(fa), A = fa.slots.flat(), B = fb.slots.flat();
  f.slots.flat().forEach((o, i) => {
    for (const k of Object.keys(o.p)) {
      const q = getOp(o.op).params.find((p) => p.k === k), v = mix(A[i].p[k], B[i].p[k], t);
      o.p[k] = q && q.discrete ? Math.round(v) : round6(v);
    }
  });
  if (fa.c && fb.c) f.c = fa.c.map((v, i) => round6(mix(v, fb.c[i], t)));
  const sa = fa.slice || { w: 0, tilt: [0, 0, 0] }, sb = fb.slice || { w: 0, tilt: [0, 0, 0] };
  if (fa.slice || fb.slice) f.slice = { w: round6(mix(sa.w || 0, sb.w || 0, t)), tilt: [0, 1, 2].map((i) => round6(mix((sa.tilt || [])[i] || 0, (sb.tilt || [])[i] || 0, t))) };
  f.bail = +Math.exp(mix(Math.log(fa.bail), Math.log(fb.bail), t)).toPrecision(4);
  // the drivers' and the shading's structure is never bred: they come from the nearer parent
  if (t >= 0.5) { if (fb.drive) f.drive = clone(fb.drive); if (fb.shade) f.shade = clone(fb.shade); }
  return normalize(f);
}

// the collage between a (t = 0) and b (t = 1); null when they do not breed
export function lerpCollage(a, b, t) {
  if (!canBreed(a, b)) return null;
  const A = normCollage(a), B = normCollage(b), near = t < 0.5 ? A : B;
  const nums = (spec, x, y) => Object.fromEntries(Object.entries(spec).map(([k, q]) => [k, q.discrete ? Math.round(mix(x[k], y[k], t)) : round6(mix(x[k], y[k], t))]));
  return normCollage({
    v: 1,
    pieces: A.pieces.map((pa, i) => {
      const pb = B.pieces[i];
      const rep = pa.rep && pb.rep && pa.rep.kind === pb.rep.kind ? { kind: pa.rep.kind, ...nums(REP[pa.rep.kind], pa.rep, pb.rep) } : clone(near.pieces[i].rep);
      return { f: lerpFormula(pa.f, pb.f, t), place: nums(PLACE, pa.place, pb.place), rep };
    }),
    joins: A.joins.map((ja, j) => {
      const jb = B.joins[j];
      return ja.op === jb.op && ja.k === jb.k ? { op: ja.op, k: ja.k, ...nums(JOIN, ja, jb) } : clone(near.joins[j]);
    }),
    ...(near.shade ? { shade: clone(near.shade) } : {}),
    ...(near.drive ? { drive: clone(near.drive) } : {}),
  });
}

// ---------- the metric ------------------------------------------------------------------------------

export const metricId = (m) => (m.ref ? m.ref : `P${m.piece}:${m.oi}.${m.key}`);

export function metricValue(c, m) {
  if (m.ref) return getCollageParam(c, m.ref);
  const pc = normCollage(c).pieces[m.piece], o = pc && pc.f.slots.flat()[m.oi];
  return o ? o.p[m.key] : undefined;
}

// the collage with one metric entry set (clamped to its range)
export function withMetric(c, m, v) {
  if (m.ref) return setCollageParam(c, m.ref, v);
  const g = clone(normCollage(c)), f = g.pieces[m.piece].f, to = masterParam(f, m.oi, m.key), o = f.slots.flat()[to.oi];
  const q = getOp(o.op).params.find((p) => p.k === m.key);
  if (q && q.min !== undefined) v = Math.max(q.min, v);
  if (q && q.max !== undefined) v = Math.min(q.max, v);
  o.p[m.key] = v;
  return normCollage(g);
}

// metric: [{ ref | piece, oi, key, pxPerUnit }]; pins: Set of metricId; rnd: () => uniform [0, 1)
export function mutateCollage(collage, metric, pins, D, rnd) {
  let c = normCollage(collage);
  const free = metric.filter((m) => m.pxPerUnit > 0 && !pins.has(metricId(m)) && metricValue(c, m) !== undefined);
  if (!free.length) return c;
  const z = free.map(() => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); });
  const n = Math.hypot(...z) || 1;
  free.forEach((m, i) => { c = withMetric(c, m, round6(metricValue(c, m) + (D * z[i]) / n / m.pxPerUnit)); });
  return c;
}

// how far apart two collages of one count look, in pixels, by the metric (first order)
export function collageDistancePx(a, b, metric) {
  let s = 0;
  for (const m of metric) {
    const d = (metricValue(b, m) - metricValue(a, m)) * m.pxPerUnit;
    if (Number.isFinite(d)) s += d * d;
  }
  return Math.sqrt(s);
}
