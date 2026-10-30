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
//
// Sites are the families (presets.js) and the formulas you dropped there (user sites, any formula — a
// chimera too, as one opaque species). Every site can move; layoutOf/createSurface carry the layout
// (moved presets, user sites) through storage. wallBands draws the walls as the soft band they are.

import { PRESETS } from './presets.js';
import { parse, format } from './notation.js';
import { normalize, validate } from './formula.js';
import { getOp } from './ops.js';
import { BLEND_KEYS } from './fields.js';
import { tree } from './graph.js';

export const WALL = 0.035;
export const MAX_SITES = 29;   // the 16 families and 13 of yours
const MAX_SPECIES = 4;
const MIN_W = 1e-3;
const MIN_R = 0.02;

const clone = (x) => JSON.parse(JSON.stringify(x));
const clampSq = (v) => Math.max(-1, Math.min(1, v));

// which sites blend by parameters: the same ops in the same slots and schedule, the same drivers and
// shading (those are compared whole), a fixed c and a slice on both or neither
export const structureOf = (f) => [
  f.slots.map((s) => s.map((o) => o.op).join(' ')).join(' | '), f.schedule,
  f.c ? 'c' : '', f.slice ? 'slice' : '', f.drive ? JSON.stringify(f.drive) : '', f.shade ? JSON.stringify(f.shade) : '', f.sub ? JSON.stringify(f.sub) : '',
].join('/');

// a chimera site is hard: a mix cannot sit inside another mix, so it never joins a wall's blend — its
// walls are cuts at the bisector. One whose whole chain is a constant-weight blend is the exception:
// its species join the neighbours' blend directly (exact), so its walls stay soft.
const isBlend = (nodes) => nodes.length === 1 && nodes[0].op === 'mix.blend';
const site = (p, user) => {
  const f = normalize(typeof p.f === 'object' && p.f ? p.f : parse(p.text));
  const nodes = asChain(f).nodes;
  return { ...p, f, text: format(f), key: structureOf(f), at: [...p.at], user, hard: nodes.some((n) => n.species) && !isBlend(nodes) };
};

// a cell's radius: half the distance to its nearest neighbour (the breeding axes span it)
function relayout(S) {
  S.sites.forEach((s) => {
    const others = S.sites.filter((t) => t !== s).map((t) => Math.hypot(t.at[0] - s.at[0], t.at[1] - s.at[1]));
    s.R = Math.max(MIN_R, 0.5 * (others.length ? Math.min(...others) : 2));
  });
  return S;
}

// layout: { moved: { presetId: [x, y] }, sites: [{ id, text, view, axes, at, thumb }] } (layoutOf's form)
export function createSurface(presets = PRESETS, wall = WALL, layout = null) {
  const moved = (layout && layout.moved) || {};
  const sites = presets.map((p) => site({ ...p, home: [...p.at], at: moved[p.id] || p.at }, false));
  for (const u of (layout && layout.sites) || []) {
    if (sites.length >= MAX_SITES) break;
    try { sites.push(site(u, true)); } catch { /* a stored site that no longer parses is dropped */ }
  }
  return relayout({ sites, wall });
}

// the layout to store: preset positions that differ from home, every user site whole
export function layoutOf(S) {
  const moved = {};
  for (const s of S.sites) if (!s.user && (s.at[0] !== s.home[0] || s.at[1] !== s.home[1])) moved[s.id] = [...s.at];
  return {
    moved,
    sites: S.sites.filter((s) => s.user).map((s) => ({ id: s.id, text: s.text, view: s.view, axes: s.axes, at: [...s.at], ...(s.thumb ? { thumb: s.thumb } : {}) })),
  };
}

export const isDefault = (S) => !S.sites.some((s) => !s.user && (s.at[0] !== s.home[0] || s.at[1] !== s.home[1]));

// drop a formula as a new site at x; null when the surface is full. axes: [[flat op index, key, span]]
export function addSite(S, { f, view, axes = [], at, thumb = null, id = null }) {
  if (S.sites.length >= MAX_SITES) return null;
  const s = site({ id: id || 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), f, view, axes, at: [clampSq(at[0]), clampSq(at[1])], thumb }, true);
  S.sites.push(s);
  relayout(S);
  return s;
}

export function moveSite(S, j, at) {
  S.sites[j].at = [clampSq(at[0]), clampSq(at[1])];
  relayout(S);
}

// only user sites leave; a preset dragged off goes home instead
export function removeSite(S, j) {
  const s = S.sites[j];
  if (!s) return false;
  if (s.user) S.sites.splice(j, 1);
  else s.at = [...s.home];
  relayout(S);
  return s.user;
}

// the presets home; your sites stay where they are
export function resetLayout(S) {
  for (const s of S.sites) if (!s.user) s.at = [...s.home];
  relayout(S);
}

// a dropped formula's breeding axes: its two most sensed parameters (a sensing pass's params, each
// { oi, op, key, value, pxPerUnit }), each spanning about 240 px of change across the cell
export function axesFromSensed(f, params) {
  const g = normalize(f), ops = g.slots.flat();
  const own = (p) => Math.max(Math.abs(p.value), p.op === 'rotate' || p.op === 'twist' ? 10 : 0.1);
  return (params || [])
    .filter((p) => p.oi !== undefined && p.pxPerUnit > 0 && ops[p.oi] && ops[p.oi].op === p.op)
    .filter((p) => { const q = getOp(p.op).params.find((r) => r.k === p.key); return q && !q.hidden && !q.discrete; })
    .sort((a, b) => b.pxPerUnit * own(b) - a.pxPerUnit * own(a))
    .slice(0, 2)
    .map((p) => [p.oi, p.key, +(240 / p.pxPerUnit).toPrecision(3)]);
}

// soft cell weights at x, the smallest dropped and the rest renormalised: [{ j, w }]
// (a hard site is the whole of its cell and none of anyone else's)
export function weightsAt(S, x) {
  const d = S.sites.map((s) => Math.hypot(x[0] - s.at[0], x[1] - s.at[1]));
  const near = d.indexOf(Math.min(...d));
  if (S.sites[near].hard) return [{ j: near, w: 1 }];
  const dmin = d[near];
  let ws = d.map((v, j) => ({ j, w: S.sites[j].hard ? 0 : Math.exp(-(v - dmin) / S.wall) })).filter((e) => e.w > MIN_W);
  ws.sort((a, b) => b.w - a.w);
  ws = ws.slice(0, MAX_SPECIES);
  const sum = ws.reduce((a, e) => a + e.w, 0);
  return ws.map((e) => ({ j: e.j, w: e.w / sum }));
}

// site j's formula bred at x: each axis moves its parameter by span/2 · (x − site)·axis / R, clamped
// to the cell and to the parameter's range (axes name ops by their index in the flattened slots)
export function bredAt(S, j, x) {
  const s = S.sites[j];
  const f = clone(s.f), ops = f.slots.flat();
  (s.axes || []).forEach(([oi, key, span], a) => {
    const o = ops[oi], q = o && getOp(o.op).params.find((p) => p.k === key);
    if (!q) return;
    const t = Math.max(-1, Math.min(1, (x[a] - s.at[a]) / s.R));
    let v = o.p[key] + (span / 2) * t;
    if (q.min !== undefined) v = Math.max(q.min, v);
    if (q.max !== undefined) v = Math.min(q.max, v);
    o.p[key] = +v.toPrecision(6);
  });
  return normalize(f);
}

const lerp = (list, get) => list.reduce((a, e) => a + e.w * get(e.f), 0);

// the formulas of one structure, blended by their weights: parameters, c and slice, iterations, bail
function blendSame(list) {
  const f = clone(list[0].f);
  const flats = list.map((e) => e.f.slots.flat());
  f.slots.flat().forEach((o, i) => {
    for (const k of Object.keys(o.p)) {
      const q = getOp(o.op).params.find((p) => p.k === k);
      const v = list.reduce((a, e, n) => a + e.w * flats[n][i].p[k], 0);
      o.p[k] = q && q.discrete ? Math.round(v) : +v.toPrecision(6);
    }
  });
  if (f.c) f.c = f.c.map((_, i) => +lerp(list, (g) => g.c[i]).toPrecision(6));
  if (f.slice) f.slice = { w: +lerp(list, (g) => g.slice.w).toPrecision(6), tilt: f.slice.tilt.map((_, i) => +lerp(list, (g) => g.slice.tilt[i]).toPrecision(6)) };
  f.iters = Math.round(lerp(list, (g) => g.iters));
  f.bail = +Math.exp(lerp(list, (g) => Math.log(g.bail))).toPrecision(4);
  return normalize(f);
}

// a formula as one chain of graph nodes, to sit as a species of another chimera: its schedule unrolled
// into one iteration (iterations divided by the word's length), a fixed c written as a translate.
// Drivers, shading and the slice stay with the formula at its own site; across a wall they are dropped.
export function asChain(formula) {
  const f = normalize(formula), t = tree(f);
  const word = t.chains.length === 1 ? 'A' : f.schedule;
  const nodes = clone([...word].flatMap((ch) => t.chains[ch.charCodeAt(0) - 65].nodes));
  if (f.c) {
    const c = (ns) => ns.forEach((n) => {
      if (n.op === '+c') { n.op = 'translate'; n.p = { x: f.c[0], y: f.c[1], z: f.c[2], w: f.c[3] }; }
      if (n.species) n.species.forEach((sp) => c(sp.nodes));
    });
    c(nodes);
  }
  return { nodes, iters: Math.max(1, Math.ceil(f.iters / word.length)), bail: f.bail };
}

// a tree of node chains as slots, nested chimeras too (graph.js's flatten takes one level): every
// mix's species appended in the order mixKids reads them — slot by slot, op by op
function flattenDeep(top, rest) {
  const slots = [top];
  for (let i = 0; i < slots.length; i++) {
    slots[i] = slots[i].map((n) => {
      if (n.species) slots.push(...n.species.map((sp) => sp.nodes));
      return { op: n.op, p: { ...n.p, ...(n.species ? { s: n.species.length } : {}) } };
    });
  }
  return normalize({ ...rest, slots });
}

// species (each { w, f }) as the species of one mix op: { op, p } its head, the species' own chains
// under it. Too many slots or ops for one formula: the weakest species go first.
function chimera(op, p, species) {
  let list = species.flatMap((e) => {
    const c = asChain(e.f);
    if (!isBlend(c.nodes)) return [{ w: e.w, ...c }];
    // a constant-weight chimera: its species are species here, at its weight times theirs
    const n = c.nodes[0], a = n.species.map((_, i) => Math.max(n.p[BLEND_KEYS[i]], 0)), sum = a.reduce((x, y) => x + y, 0);
    return n.species.map((sp, i) => ({ w: e.w * (sum > 0 ? a[i] / sum : 1 / a.length), nodes: sp.nodes, iters: c.iters, bail: c.bail }));
  });
  for (;;) {
    const W = list.reduce((a, e) => a + e.w, 0) || 1;
    const head = { ...p(list.map((e) => e.w / W)), s: list.length };
    const f = flattenDeep([{ op, p: head, species: list.map((e) => ({ nodes: e.nodes })) }], {
      v: 1, seed: 0, schedule: 'A',
      iters: Math.round(list.reduce((a, e) => a + (e.w / W) * e.iters, 0)),
      bail: +Math.exp(list.reduce((a, e) => a + (e.w / W) * Math.log(e.bail), 0)).toPrecision(4),
    });
    if (validate(f).ok) return f;
    if (list.length <= 2) return normalize(species[0].f);
    const weakest = list.reduce((m, e, i) => (e.w < list[m].w ? i : m), 0);
    list = list.filter((_, i) => i !== weakest);
  }
}

// species as one formula: the one whole, or a chimera of constant weights
function compose(species) {
  if (species.length === 1) return species[0].f;
  return chimera('mix.blend', (ws) => Object.fromEntries(BLEND_KEYS.map((key, i) => [key, i < ws.length ? +ws[i].toPrecision(4) : 1])), species);
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
    return { w: W, f: list.length === 1 ? list[0].f : blendSame(list.map((e) => ({ ...e, w: e.w / W }))), sites: list.map((e) => e.j) };
  }).sort((a, b) => b.w - a.w);
}

// the formula at x, the camera distance that frames it, and which sites it draws on
export function formulaAt(S, x) {
  const ws = weightsAt(S, x);
  const view = Math.exp(ws.reduce((a, e) => a + e.w * Math.log(S.sites[e.j].view), 0));
  const species = speciesAt(S, x);
  // the sites that stand inside their family: W of the weight is theirs, pos their Σ wⱼ·posⱼ, the angles
  // their weighted mean (the caller blends them with the frame it would take)
  const eyes = ws.filter((e) => S.sites[e.j].eye), W = eyes.reduce((a, e) => a + e.w, 0);
  const sum = (get) => eyes.reduce((a, e) => a + e.w * get(S.sites[e.j].eye), 0);
  const eye = W > 0 ? { W, pos: [0, 1, 2].map((i) => sum((q) => q.pos[i])), yaw: sum((q) => q.yaw) / W, pitch: sum((q) => q.pitch) / W } : null;
  return { f: normalize(compose(species)), view, eye, species: species.map((e) => ({ w: e.w, sites: e.sites })) };
}

// the leading species alone at x (no chimera): what a stroke laid in space samples
// (a chimera there lays its own first species — its heaviest, for constant weights — in place of its
// mix: a mix cannot sit inside the stroke's)
export function leadAt(S, x) {
  const f = speciesAt(S, x)[0].f, c = asChain(f);
  if (!c.nodes.some((n) => n.species)) return f;
  const nodes = c.nodes.flatMap((n) => {
    if (!n.species) return [n];
    const a = n.op === 'mix.blend' ? n.species.map((_, i) => n.p[BLEND_KEYS[i]]) : [1];
    return n.species[a.indexOf(Math.max(...a))].nodes;
  });
  return flattenDeep(nodes, { v: 1, seed: 0, schedule: 'A', iters: c.iters, bail: c.bail });
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
  const head = () => ({ w: 0.5, g: +g.toPrecision(4), nx: +(n[0] / nl).toFixed(4), ny: +(n[1] / nl).toFixed(4), nz: +(n[2] / nl).toFixed(4), nw: 0, at: 1 });
  return { view, f: normalize(chimera('mix.axis', head, samples.map((f) => ({ w: 1, f })))) };
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

// The walls as the soft band they are: contours of the leading weight max πⱼ (1 deep inside a cell,
// ½ on a wall between two, ⅓ where three meet; 1 everywhere in a hard site's cell) at the given levels, by marching squares on an n × n
// grid over the square. [{ level, segs: [[x0, y0, x1, y1], …] }] in surface coordinates.
export const BAND_LEVELS = [0.6, 0.8, 0.95];
export function wallBands(S, n = 160, levels = BAND_LEVELS) {
  const N = n + 1, h = 2 / n, P = new Float64Array(N * N);
  const xs = S.sites.map((s) => s.at[0]), ys = S.sites.map((s) => s.at[1]), hard = S.sites.map((s) => s.hard);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const x = -1 + c * h, y = -1 + r * h;
    let dmin = Infinity, near = 0;
    const d = xs.map((sx, j) => { const v = Math.hypot(x - sx, y - ys[j]); if (v < dmin) { dmin = v; near = j; } return v; });
    if (hard[near]) { P[r * N + c] = 1; continue; }
    let sum = 0;
    d.forEach((v, j) => { if (!hard[j]) sum += Math.exp(-(v - dmin) / S.wall); });
    P[r * N + c] = 1 / sum;
  }
  return levels.map((L) => {
    const segs = [];
    const cross = (a, b, pa, pb) => { const t = (L - a) / (b - a); return [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t]; };
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const v = [P[r * N + c], P[r * N + c + 1], P[(r + 1) * N + c + 1], P[(r + 1) * N + c]];
      const x0 = -1 + c * h, y0 = -1 + r * h;
      const q = [[x0, y0], [x0 + h, y0], [x0 + h, y0 + h], [x0, y0 + h]];
      const pts = [];
      for (let e = 0; e < 4; e++) {
        const a = v[e], b = v[(e + 1) % 4];
        if ((a < L) !== (b < L)) pts.push(cross(a, b, q[e], q[(e + 1) % 4]));
      }
      if (pts.length === 2) segs.push([...pts[0], ...pts[1]]);
      else if (pts.length === 4) {
        // a saddle: the centre says which corners join
        const inside = (v[0] + v[1] + v[2] + v[3]) / 4 >= L, hi0 = v[0] >= L;
        if (inside === hi0) segs.push([...pts[0], ...pts[1]], [...pts[2], ...pts[3]]);
        else segs.push([...pts[3], ...pts[0]], [...pts[1], ...pts[2]]);
      }
    }
    return { level: L, segs };
  });
}

// The hard walls: the edges of hard sites' cells inside the square, [[x0, y0, x1, y1], …]
export function hardWalls(S) {
  const out = [], border = (p, q) => [0, 1].some((i) => Math.abs(p[i]) > 1 - 1e-9 && Math.abs(q[i]) > 1 - 1e-9 && Math.sign(p[i]) === Math.sign(q[i]));
  cells(S).forEach((poly, j) => {
    if (!S.sites[j].hard) return;
    poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]; if (!border(p, q)) out.push([...p, ...q]); });
  });
  return out;
}
