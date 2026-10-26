// The Metasurface: the families laid out as Voronoi cells on a square, a place for every formula
// between them. A point x in [−1, 1]² (y up) is a formula:
//
//   inside a cell   the cell's family, bred: its axes (presets.js) sweep with x − site, horizontally
//                   and vertically, ± span/2 across the cell's radius
//   across a wall   the neighbours blended by soft weights over the distances to the sites — by
//                   parameters where they share a structure (breeding is exact there), as a chimera
//                   with constant weights (mix.blend) where they do not
//
// The weights: πⱼ ∝ exp(−(dⱼ − d_min) / wall), so a cell is pure until ~3·wall from its wall. The view
// (camera distance) blends geometrically. A stroke on the surface is either played in time (a walk:
// formulaAt along it) or laid in space (strokeField: species sampled along it, ordered on a world
// axis by a world-frame ramp).

import { PRESETS } from './presets.js';
import { parse } from './notation.js';
import { normalize } from './formula.js';
import { getOp } from './ops.js';
import { BLEND_KEYS } from './fields.js';

export const WALL = 0.035;
const MAX_SPECIES = 4;
const MIN_W = 1e-3;

const structureOf = (f) => f.slots[0].map((o) => o.op).join(' ');

export function createSurface(presets = PRESETS, wall = WALL) {
  const sites = presets.map((p) => {
    const f = normalize(parse(p.text));
    return { ...p, f, key: structureOf(f) };
  });
  // a cell's radius: half the distance to its nearest neighbour (the breeding axes span it)
  sites.forEach((s) => {
    s.R = 0.5 * Math.min(...sites.filter((t) => t !== s).map((t) => Math.hypot(t.at[0] - s.at[0], t.at[1] - s.at[1])));
  });
  return { sites, wall };
}

// soft cell weights at x, the smallest dropped and the rest renormalised: [{ j, w }]
export function weightsAt(S, x) {
  const d = S.sites.map((s) => Math.hypot(x[0] - s.at[0], x[1] - s.at[1]));
  const dmin = Math.min(...d);
  let ws = d.map((v, j) => ({ j, w: Math.exp(-(v - dmin) / S.wall) })).filter((e) => e.w > MIN_W);
  ws.sort((a, b) => b.w - a.w);
  ws = ws.slice(0, MAX_SPECIES);
  const sum = ws.reduce((a, e) => a + e.w, 0);
  return ws.map((e) => ({ j: e.j, w: e.w / sum }));
}

// site j's formula bred at x: each axis moves its parameter by span/2 · (x − site)·axis / R, clamped
// to the cell and to the parameter's range
export function bredAt(S, j, x) {
  const s = S.sites[j];
  const f = JSON.parse(JSON.stringify(s.f));
  s.axes.forEach(([oi, key, span], a) => {
    const t = Math.max(-1, Math.min(1, (x[a] - s.at[a]) / s.R));
    const o = f.slots[0][oi], q = getOp(o.op).params.find((p) => p.k === key);
    let v = o.p[key] + (span / 2) * t;
    if (q.min !== undefined) v = Math.max(q.min, v);
    if (q.max !== undefined) v = Math.min(q.max, v);
    o.p[key] = +v.toPrecision(6);
  });
  return f;
}

// the formulas of one structure, blended by their weights: parameters, iterations, bail
function blendSame(list) {
  const f = JSON.parse(JSON.stringify(list[0].f));
  f.slots[0].forEach((o, i) => {
    for (const k of Object.keys(o.p)) {
      const q = getOp(o.op).params.find((p) => p.k === k);
      const v = list.reduce((a, e) => a + e.w * e.f.slots[0][i].p[k], 0);
      o.p[k] = q && q.discrete ? Math.round(v) : +v.toPrecision(6);
    }
  });
  f.iters = Math.round(list.reduce((a, e) => a + e.w * e.f.iters, 0));
  f.bail = +Math.exp(list.reduce((a, e) => a + e.w * Math.log(e.f.bail), 0)).toPrecision(4);
  return f;
}

// species (each { w, f } with a single slot) as one formula: the one, or a chimera of constant weights
function compose(species) {
  if (species.length === 1) return species[0].f;
  const k = species.length;
  const p = { s: k };
  BLEND_KEYS.forEach((key, i) => { p[key] = i < k ? +species[i].w.toPrecision(4) : 1; });
  return {
    v: 1, seed: 0, schedule: 'A',
    iters: Math.round(species.reduce((a, e) => a + e.w * e.f.iters, 0)),
    bail: +Math.exp(species.reduce((a, e) => a + e.w * Math.log(e.f.bail), 0)).toPrecision(4),
    slots: [[{ op: 'mix.blend', p }], ...species.map((e) => e.f.slots[0])],
  };
}

// the species at x: one per structure among the weighted cells, each bred and blended within itself
function speciesAt(S, x) {
  const groups = new Map();
  for (const { j, w } of weightsAt(S, x)) {
    const key = S.sites[j].key;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ w, f: bredAt(S, j, x), j });
  }
  return [...groups.values()].map((list) => {
    const W = list.reduce((a, e) => a + e.w, 0);
    return { w: W, f: blendSame(list.map((e) => ({ ...e, w: e.w / W }))), sites: list.map((e) => e.j) };
  }).sort((a, b) => b.w - a.w);
}

// the formula at x, the camera distance that frames it, and which sites it draws on
export function formulaAt(S, x) {
  const ws = weightsAt(S, x);
  const view = Math.exp(ws.reduce((a, e) => a + e.w * Math.log(S.sites[e.j].view), 0));
  const species = speciesAt(S, x);
  return { f: normalize(compose(species)), view, species: species.map((e) => ({ w: e.w, sites: e.sites })) };
}

// the leading species alone at x (no chimera): what a stroke laid in space samples
export function leadAt(S, x) {
  return speciesAt(S, x)[0].f;
}

// A stroke laid in space: k species sampled evenly along it (2–7, about one per quarter of the
// surface's width travelled), ordered along the world direction n (the stroke's own direction on
// screen, carried into the world) by a world-frame ramp that spans `span` world units.
export function strokeField(S, pts, n, span) {
  let len = 0;
  const acc = [0];
  for (let i = 1; i < pts.length; i++) { len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); acc.push(len); }
  const k = Math.max(2, Math.min(7, Math.round(len / 0.25) + 1));
  const at = (u) => {
    const t = u * len;
    let i = 1;
    while (i < pts.length - 1 && acc[i] < t) i++;
    const a = pts[i - 1], b = pts[i], seg = acc[i] - acc[i - 1] || 1, r = Math.min(1, Math.max(0, (t - acc[i - 1]) / seg));
    return [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r];
  };
  const samples = Array.from({ length: k }, (_, i) => leadAt(S, at(k === 1 ? 0 : i / (k - 1))));
  const nl = Math.hypot(...n) || 1;
  const g = 6 / Math.max(span, 1e-6);
  const view = Math.exp(Array.from({ length: k }, (_, i) => Math.log(formulaAt(S, at(i / (k - 1))).view)).reduce((a, b) => a + b, 0) / k);
  return {
    view,
    f: normalize({
      v: 1, seed: 0, schedule: 'A',
      iters: Math.round(samples.reduce((a, f) => a + f.iters, 0) / k),
      bail: +Math.exp(samples.reduce((a, f) => a + Math.log(f.bail), 0) / k).toPrecision(4),
      slots: [[{ op: 'mix.axis', p: { w: 0.5, g: +g.toPrecision(4), nx: +(n[0] / nl).toFixed(4), ny: +(n[1] / nl).toFixed(4), nz: +(n[2] / nl).toFixed(4), nw: 0, at: 1, s: k } }], ...samples.map((f) => f.slots[0])],
    }),
  };
}

// The cells as polygons for drawing: the square clipped by every bisector (exact Voronoi)
export function cells(S) {
  const clip = (poly, a, b) => {
    // keep the side of the bisector of sites a, b nearer to a
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], n = [b[0] - a[0], b[1] - a[1]];
    const side = (p) => (p[0] - m[0]) * n[0] + (p[1] - m[1]) * n[1];
    const out = [];
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length], sp = side(p), sq = side(q);
      if (sp <= 0) out.push(p);
      if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    });
    return out;
  };
  return S.sites.map((s) => S.sites.reduce((poly, t) => (t === s ? poly : clip(poly, s.at, t.at)), [[-1, -1], [1, -1], [1, 1], [-1, 1]]));
}
