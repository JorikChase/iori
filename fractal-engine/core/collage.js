// Collage: finished distance estimates of whole formulas joined by smooth minima — designed seams, the
// third way to mix beside breeding and the chimera (DESIGN.md "Collage (K)").
//
//   collage = { v: 1,
//     pieces: [{ f: formula, place: { tx, ty, tz, rx, ry, rz, s, g }, rep: null | { kind, … } }, …]   1..8
//     joins:  [{ op, k, r, n, w }, …]   one fewer than the pieces, folded left to right
//     shade?: { nodes, out }            the collage's own colour (wins over the pieces')
//     drive?: { nodes, bind }           world/start/time/param/math/remap nodes binding 'J<j>.<key>' and
//                                       'P<i>.<key>' (placement, repetition) }
//
// A world point x reaches piece i as rep(R⁻¹(x − t) / s): the repetition acts in the piece's own frame,
// so an array moves, turns and scales with its piece. dᵢ = s·DEᵢ(that point), DEᵢ the formula's own
// estimate through its own slice (core/cpu.js de), less its growth g. D₀ = d₀, D_j = join_j(D_{j−1}, d_j).
// A fractal's estimate is unsigned — 0 (escape time) or small and positive (r/dr) inside, never negative —
// so a piece has no inside to carve with until it is grown: a subtraction's or intersection's cutter
// needs g > 0 (its surface then sits g out from the fractal's).
//
// Every kernel returns the value and its partials in its two inputs; the partials give the gradient
// (chain rule), the pieces' shares for colour and push, and the Lipschitz bound.

import { normalize, validate, canonical, hashString, pullSafe } from './formula.js';
import { parse, format, fmtNum } from './notation.js';
import { de, push } from './cpu.js';
import { normShade, validateShade, evalShade } from './shade.js';
import { normDrive, validateDrive, evalDrive, emptyDrive, splitTarget, ORBIT } from './drive.js';
import { rotationXYZ, matVec, transpose, matMul, project, sliceMatrix } from './vec.js';

export const MAX_PIECES = 8;
export const JOIN_OPS = ['union', 'inter', 'sub', 'morph'];
export const KERNELS = ['quad', 'cubic', 'exp', 'circ', 'stairs', 'chamfer', 'hard'];
export const REP_KINDS = ['grid', 'mirror', 'polar'];

const n = (d, min, max) => ({ d, min, max });
const dn = (d, min, max) => ({ d, min, max, discrete: true });
export const PLACE = { tx: n(0), ty: n(0), tz: n(0), rx: n(0), ry: n(0), rz: n(0), s: n(1, 1e-3, 1e3), g: n(0, 0, 16) };
export const REP = {
  grid: { cx: n(0, 0, 64), cy: n(0, 0, 64), cz: n(0, 0, 64), nx: dn(1, 0, 16), ny: dn(1, 0, 16), nz: dn(1, 0, 16) },
  mirror: { mx: dn(1, 0, 1), my: dn(0, 0, 1), mz: dn(0, 0, 1), ox: n(0), oy: n(0), oz: n(0) },
  polar: { n: dn(6, 1, 64), r: n(1, 0, 64), axis: dn(1, 0, 2) },
};
export const JOIN = { r: n(0.2, 0, 16), n: dn(4, 1, 16), w: n(0.5, 0, 1) };

const num = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const clampTo = (v, q) => Math.min(q.max ?? Infinity, Math.max(q.min ?? -Infinity, v));
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const fill = (spec, p = {}) => Object.fromEntries(Object.entries(spec).map(([k, q]) => [k, num(p[k], q.d)]));

export const isCollage = (x) => !!(x && typeof x === 'object' && Array.isArray(x.pieces));

// ---------- IR -------------------------------------------------------------------------------------

// a join keeps only the numbers its kind reads (the rest at their defaults), so one look has one id:
// r for every kernel but hard, n for stairs, w for a morph (whose kernel is quad, unused)
export function normJoin(j) {
  const op = JOIN_OPS.includes(j.op) ? j.op : 'union', k = op === 'morph' || !KERNELS.includes(j.k) ? 'quad' : j.k;
  const g = { op, k, ...fill(JOIN, j) };
  if (op === 'morph' || k === 'hard') g.r = JOIN.r.d;
  if (k !== 'stairs' || op === 'morph') g.n = JOIN.n.d;
  if (op !== 'morph') g.w = JOIN.w.d;
  return g;
}

export function normCollage(c) {
  const pieces = (c.pieces || []).map((q) => ({
    f: normalize(q.f),
    place: fill(PLACE, q.place),
    rep: q.rep && REP[q.rep.kind] ? { kind: q.rep.kind, ...fill(REP[q.rep.kind], q.rep) } : null,
  }));
  const joins = (c.joins || []).map(normJoin);
  // a missing join is a smooth union
  while (joins.length < pieces.length - 1) joins.push(normJoin({}));
  return {
    v: 1, pieces, joins: joins.slice(0, Math.max(pieces.length - 1, 0)),
    ...(c.shade ? { shade: normShade(c.shade) } : {}),
    ...(!emptyDrive(c.drive) ? { drive: normDrive(c.drive) } : {}),
  };
}

// the parameter a collage target names: { spec, obj, key } (null when there is none or it is discrete)
export function collageTarget(c, to) {
  const { path, key } = splitTarget(String(to));
  const m = /^([PJ])(\d+)$/.exec(path);
  if (!m) return null;
  const i = +m[2];
  if (m[1] === 'J') {
    const j = c.joins[i], q = JOIN[key];
    return j && q && !q.discrete ? { spec: q, obj: j, key } : null;
  }
  const pc = c.pieces[i];
  if (!pc) return null;
  if (PLACE[key]) return { spec: PLACE[key], obj: pc.place, key };
  const q = pc.rep && REP[pc.rep.kind][key];
  return q && !q.discrete ? { spec: q, obj: pc.rep, key } : null;
}

export function validateCollage(c) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!isCollage(c)) return { ok: false, errors: ['not a collage'] };
  if (c.v !== undefined && c.v !== 1) err(`unsupported version ${c.v}`);
  if (c.pieces.length < 1 || c.pieces.length > MAX_PIECES) err(`a collage holds 1..${MAX_PIECES} pieces`);
  // numbers left out take their defaults; the ones given must be in range
  const nums = (spec, o, at) => {
    for (const [k, s] of Object.entries(spec)) {
      const v = o[k];
      if (v === undefined) continue;
      if (typeof v !== 'number' || !Number.isFinite(v)) { err(`${at}.${k} must be a finite number`); continue; }
      if (s.discrete && !Number.isInteger(v)) err(`${at}.${k} must be a whole number`);
      if (s.min !== undefined && v < s.min) err(`${at}.${k} below ${s.min}`);
      if (s.max !== undefined && v > s.max) err(`${at}.${k} above ${s.max}`);
    }
  };
  let formulas = true;
  c.pieces.forEach((q, i) => {
    const f = q && q.f;
    if (!f || typeof f !== 'object') { err(`P${i}: needs a formula`); formulas = false; return; }
    if (isCollage(f)) { err(`P${i}: a collage cannot sit inside a collage`); formulas = false; return; }
    for (const e of validate(f).errors) err(`P${i}: ${e}`);
    if (q.place != null && typeof q.place !== 'object') err(`P${i}: the placement is { tx ty tz rx ry rz s }`);
    else nums(PLACE, q.place || {}, `P${i}`);
    if (q.rep != null) {
      if (!REP[q.rep.kind]) err(`P${i}: repetition is one of ${REP_KINDS.join(', ')}`);
      else nums(REP[q.rep.kind], q.rep, `P${i}`);
    }
  });
  if (!Array.isArray(c.joins) || c.joins.length !== Math.max(c.pieces.length - 1, 0)) err('one join between every two pieces');
  else c.joins.forEach((j, i) => {
    if (!JOIN_OPS.includes(j.op)) err(`J${i}: op is one of ${JOIN_OPS.join(', ')}`);
    if (j.k !== undefined && !KERNELS.includes(j.k)) err(`J${i}: kernel is one of ${KERNELS.join(', ')}`);
    nums(JOIN, j, `J${i}`);
  });
  if (c.shade !== undefined) errors.push(...validateShade(c.shade));
  if (c.drive !== undefined) {
    const d = c.drive, more = validateDrive(d, null);
    errors.push(...more);
    if (!more.length && formulas && Array.isArray(c.joins)) {
      const g = normCollage(c);
      for (const m of d.nodes || []) {
        if (ORBIT.includes(m.type)) err(`drive: ${m.id}: a collage has no orbit of its own (${m.type})`);
        if (m.type === 'param' && !collageTarget(g, m.p && m.p.of)) err(`drive: ${m.id}: no parameter ${m.p && m.p.of}`);
      }
      for (const b of d.bind || []) if (!collageTarget(g, b.to)) err(`drive: ${b.to} is not a collage parameter that can be driven`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function canonicalCollage(c) {
  const g = normCollage(c);
  return JSON.stringify({
    v: 1,
    pieces: g.pieces.map((q) => ({ f: JSON.parse(canonical(q.f)), place: q.place, ...(q.rep ? { rep: q.rep } : {}) })),
    joins: g.joins,
    ...(g.shade ? { shade: g.shade } : {}), ...(g.drive ? { drive: g.drive } : {}),
  });
}
export const hashCollage = (c) => hashString(canonicalCollage(c));
export const collagePullSafe = (c) => normCollage(c).pieces.every((q) => pullSafe(q.f));

// ---------- kernels --------------------------------------------------------------------------------

// GLSL's mod: x − y·floor(x / y)
const gmod = (x, y) => x - y * Math.floor(x / y);
const CIRC = 1 / (1 - Math.SQRT1_2);

// a smooth minimum of a and b: [d, ∂d/∂a, ∂d/∂b]
export function smin(k, a, b, r, steps = 4) {
  const lo = a <= b ? [a, 1, 0] : [b, 0, 1];
  if (k === 'hard' || !(r > 0)) return lo;
  const m = lo[0], x = Math.abs(a - b), aLow = a <= b;
  // the kernels below written for the smaller input: share g of it, 1 − g of the other
  const toward = (d, g) => (aLow ? [d, g, 1 - g] : [d, 1 - g, g]);
  switch (k) {
    case 'quad': {
      const h = clamp01(0.5 + (0.5 * (b - a)) / r);
      return [b + (a - b) * h - r * h * (1 - h), h, 1 - h];
    }
    case 'cubic': {
      const h = Math.max(r - x, 0) / r;
      return toward(m - (h * h * h * r) / 6, 1 - (h * h) / 2);
    }
    case 'exp': {
      const e = Math.exp(-x / r);
      return toward(m - r * Math.log1p(e), 1 / (1 + e));
    }
    case 'circ': {
      const R = r * CIRC, h = Math.max(R - x, 0) / R, s = Math.sqrt(1 + 2 * h - h * h);
      return toward(m - R * 0.5 * (1 + h - s), 1 - 0.5 * (1 - (1 - h) / s));
    }
    case 'stairs': {
      const st = r / Math.max(steps, 1), u = b - r, z = gmod(u - a + st, 2 * st) - st;
      const v = 0.5 * (u + a + Math.abs(z));
      if (v >= m) return lo;
      const sg = z >= 0 ? 1 : -1;
      return [v, 0.5 * (1 - sg), 0.5 * (1 + sg)];
    }
    case 'chamfer': {
      const v = (a - r + b) * Math.SQRT1_2;
      return v < m ? [v, Math.SQRT1_2, Math.SQRT1_2] : lo;
    }
    default: return lo;
  }
}

// one join: [d, ∂d/∂a, ∂d/∂b, seam]
export function joinEval(j, a, b) {
  if (j.op === 'morph') {
    const w = clamp01(j.w);
    return [(1 - w) * a + w * b, 1 - w, w, 4 * w * (1 - w)];
  }
  const seamOf = (x) => (j.k === 'hard' || !(j.r > 0) ? 0 : clamp01(1 - Math.abs(x) / j.r));
  if (j.op === 'inter') {
    const [d, ga, gb] = smin(j.k, -a, -b, j.r, j.n);
    return [-d, ga, gb, seamOf(a - b)];
  }
  if (j.op === 'sub') {
    const [d, ga, gb] = smin(j.k, -a, b, j.r, j.n);
    return [-d, ga, -gb, seamOf(a + b)];
  }
  const [d, ga, gb] = smin(j.k, a, b, j.r, j.n);
  return [d, ga, gb, seamOf(a - b)];
}

// ---------- placement and repetition ---------------------------------------------------------------

// the plane of a polar repetition: the two axes other than its own, in a right-handed order
const POLAR_PLANE = [[1, 2], [2, 0], [0, 1]];

// the world point in the piece's own frame, before the repetition
export function toPiece(place, x) {
  const R = rotationXYZ(place.rx, place.ry, place.rz);
  const v = matVec(transpose(R), [x[0] - place.tx, x[1] - place.ty, x[2] - place.tz]);
  return v.map((q) => q / place.s);
}
// and back
export function fromPiece(place, v) {
  const R = rotationXYZ(place.rx, place.ry, place.rz), w = matVec(R, v.map((q) => q * place.s));
  return [w[0] + place.tx, w[1] + place.ty, w[2] + place.tz];
}

// the domain fold: a point of the piece's frame → its point in the one copy that is drawn
export function repFold(rep, v) {
  if (!rep) return [...v];
  const q = [...v];
  if (rep.kind === 'grid') {
    ['x', 'y', 'z'].forEach((a, i) => {
      const c = rep['c' + a], m = rep['n' + a];
      if (c > 0) q[i] -= c * Math.min(m, Math.max(-m, Math.round(q[i] / c)));
    });
  } else if (rep.kind === 'mirror') {
    ['x', 'y', 'z'].forEach((a, i) => { if (rep['m' + a]) q[i] = Math.abs(q[i]) - rep['o' + a]; });
  } else if (rep.kind === 'polar') {
    const [u, w] = POLAR_PLANE[rep.axis], sec = (2 * Math.PI) / rep.n;
    const th = gmod(Math.atan2(q[w], q[u]) + sec / 2, sec) - sec / 2, rho = Math.hypot(q[u], q[w]);
    q[u] = rho * Math.cos(th) - rep.r;
    q[w] = rho * Math.sin(th);
  }
  return q;
}

// every copy's linear map and offset: the drawn copy's point q is at L·q + o in the piece's frame
export function repCopies(rep) {
  const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (!rep) return [{ L: I, o: [0, 0, 0] }];
  if (rep.kind === 'grid') {
    const range = (a) => (rep['c' + a] > 0 ? Array.from({ length: 2 * rep['n' + a] + 1 }, (_, i) => i - rep['n' + a]) : [0]);
    const out = [];
    for (const i of range('x')) for (const j of range('y')) for (const k of range('z')) out.push({ L: I, o: [i * rep.cx, j * rep.cy, k * rep.cz] });
    return out;
  }
  if (rep.kind === 'mirror') {
    let out = [{ s: [1, 1, 1] }];
    ['x', 'y', 'z'].forEach((a, i) => {
      if (rep['m' + a]) out = out.flatMap((c) => [c, { s: c.s.map((v, k) => (k === i ? -v : v)) }]);
    });
    const off = [rep.ox * rep.mx, rep.oy * rep.my, rep.oz * rep.mz];
    // p_a = σ_a·(q_a + o_a)
    return out.map(({ s }) => ({ L: [s[0], 0, 0, 0, s[1], 0, 0, 0, s[2]], o: s.map((v, k) => v * off[k]) }));
  }
  // polar: rotate (q + r·u) by k sectors about the axis
  const [u, w] = POLAR_PLANE[rep.axis], sec = (2 * Math.PI) / rep.n;
  return Array.from({ length: rep.n }, (_, k) => {
    const c = Math.cos(k * sec), s = Math.sin(k * sec), L = [...I];
    L[u * 3 + u] = c; L[u * 3 + w] = -s; L[w * 3 + u] = s; L[w * 3 + w] = c;
    const o = [0, 0, 0];
    o[u] = c * rep.r; o[w] = s * rep.r;
    return { L, o };
  });
}

// ---------- the drive -------------------------------------------------------------------------------

// the collage with its driven values written in at world point x (the collage itself when undriven)
export function drivenAt(c, x, time = 0) {
  if (!c.drive || !c.drive.bind.length) return c;
  const own = (to) => { const t = collageTarget(c, to); return t ? t.obj[t.key] : 0; };
  const { values } = evalDrive(c.drive, { start: [x[0], x[1], x[2], 0], time, own });
  const g = {
    ...c,
    pieces: c.pieces.map((q) => ({ ...q, place: { ...q.place }, rep: q.rep && { ...q.rep } })),
    joins: c.joins.map((j) => ({ ...j })),
  };
  c.drive.bind.forEach((b, i) => {
    const t = collageTarget(g, b.to);
    if (t) t.obj[t.key] = clampTo(values[i], t.spec);
  });
  return g;
}

// ---------- the estimate ----------------------------------------------------------------------------

// piece i's own estimate at world point x (its placement and repetition applied)
export function pieceDE(piece, x, opts = {}) {
  const q = repFold(piece.rep, toPiece(piece.place, x));
  return piece.place.s * de(piece.f, q, undefined, opts) - piece.place.g;
}

// Everything the collage knows at world point x: d (the estimate), dists (each piece's own), w (each
// piece's share, summing to 1), piece (Σ wᵢ·i/(n − 1)), seam (0..1), lead (the piece with the largest share).
// opts.time: the clock, for the collage's drive and the pieces' own.
export function collageAt(collage, x, opts = {}) {
  const c0 = collage.__norm ? collage : normCollage(collage);
  const c = drivenAt(c0, x, opts.time || 0);
  const dists = c.pieces.map((q) => pieceDE(q, x, opts));
  let D = dists[0], seam = 0;
  const w = [1];
  c.joins.forEach((j, i) => {
    const [d, ga, gb, s] = joinEval(j, D, dists[i + 1]);
    const A = Math.abs(ga), B = Math.abs(gb), share = A + B > 0 ? A / (A + B) : 0.5;
    for (let k = 0; k < w.length; k++) w[k] *= share;
    w.push(1 - share);
    D = d;
    seam = Math.max(seam, s);
  });
  const N = w.length;
  const piece = N > 1 ? w.reduce((a, v, i) => a + (v * i) / (N - 1), 0) : 0;
  const lead = w.indexOf(Math.max(...w));
  return { d: D, dists, w, piece, seam, lead };
}

export const collageDE = (c, x, opts = {}) => collageAt(c, x, opts).d;

// a normalised collage marked so collageAt does not normalise it again (the hot path of tests and push)
export function prepare(c) {
  const g = normCollage(c);
  Object.defineProperty(g, '__norm', { value: true });
  return g;
}

// the gradient by central differences (the reference the GPU's duals will be checked against)
export function collageGrad(c, x, opts = {}, h = 1e-5) {
  const g = c.__norm ? c : prepare(c);
  return [0, 1, 2].map((i) => {
    const a = [...x], b = [...x];
    a[i] += h; b[i] -= h;
    return (collageDE(g, a, opts) - collageDE(g, b, opts)) / (2 * h);
  });
}

// ---------- colour ----------------------------------------------------------------------------------

// The colour at a hit: readings[i] are piece i's own readings there (col, trap, … as core/shade.js
// takes them). The collage's shade wins, read with the share-weighted readings plus piece and seam
// (shade.js gains those two readings in K2); otherwise each piece's colour (its shade, or null for the
// engine's default — the caller's colour then) blended by the shares.
export function collageColour(collage, at, readings, fallback = () => [1, 1, 1, 1]) {
  const c = collage.__norm ? collage : normCollage(collage);
  if (c.shade) {
    const mixed = { piece: at.piece, seam: at.seam };
    for (const k of new Set(readings.flatMap((r) => Object.keys(r || {})))) mixed[k] = readings.reduce((a, r, i) => a + at.w[i] * ((r && r[k]) || 0), 0);
    return evalShade(c.shade, mixed).color;
  }
  const out = [0, 0, 0, 0];
  c.pieces.forEach((q, i) => {
    if (!(at.w[i] > 0)) return;
    const col = q.f.shade ? evalShade(q.f.shade, readings[i] || {}).color : fallback(i);
    for (let k = 0; k < 4; k++) out[k] += at.w[i] * (col[k] ?? 1);
  });
  return out;
}

// ---------- push ------------------------------------------------------------------------------------

// The chaos game for a collage: each piece walks its own attractor (core/cpu.js push), every sample goes
// back through the piece's slice into its frame, to one copy of its repetition (round robin, so every
// copy is sampled alike) and through its placement into the world, and is kept by its share of the
// collage there. Samples { p (world), off (distance off the piece's slice), M (3×4: world from the
// orbit's linear map — the splat's axes are M·J), J, k, piece, a (the share) }; shares below `keep` dropped.
export function collagePush(collage, count, opts = {}) {
  const c = prepare(collage), keep = opts.keep ?? 1e-3, N = c.pieces.length;
  const out = [];
  c.pieces.forEach((pc, i) => {
    const per = Math.ceil(count / N);
    const raw = push(pc.f, per, { ...opts, rng: undefined });
    const copies = repCopies(pc.rep);
    const R = rotationXYZ(pc.place.rx, pc.place.ry, pc.place.rz);
    const T = transpose(sliceMatrix(pc.f.slice || {}));
    // world from orbit, linear: s·R·L·(the slice's first three rows of Tᵀ)
    const E = [0, 1, 2].map((r) => T.slice(r * 4, r * 4 + 4));
    raw.forEach((smp, si) => {
      const { x: q, off } = project(pc.f.slice || {}, smp.p);
      const cp = copies[si % copies.length];
      const v = matVec(cp.L, q).map((a, k) => a + cp.o[k]);
      // a copy whose point does not fold back to the drawn one lies in another copy's cell: not this copy's
      const back = repFold(pc.rep, v);
      if (Math.hypot(back[0] - q[0], back[1] - q[1], back[2] - q[2]) > 1e-6 * Math.max(1, Math.hypot(...q))) return;
      const p = fromPiece(pc.place, v);
      const at = collageAt(c, p, opts);
      const a = at.w[i];
      if (!(a >= keep)) return;
      const RL = matMul(R, cp.L).map((x) => x * pc.place.s);
      const M = [0, 1, 2].map((r) => [0, 1, 2, 3].map((k) => RL[r * 3] * E[0][k] + RL[r * 3 + 1] * E[1][k] + RL[r * 3 + 2] * E[2][k]));
      out.push({ p, off, M, J: smp.J, k: smp.k * pc.place.s, piece: i, a });
    });
  });
  return out;
}

// ---------- notation --------------------------------------------------------------------------------
//
//   { bulb 8 · +c ×10 } at .7 0 0 ∪ .3 { fold.box 1 · … ×12 bail=100 } at -.7 0 0 size .1  shade=… drive=…
//
// Pieces in braces (the formula notation inside); after a piece its placement words — at tx ty tz,
// turn rx ry rz, size s, grow g, grid cx cy cz nx ny nz, mirror <axes> <an offset per axis>, polar n r [x|y|z];
// between pieces the join — ∪ ∩ ∖ ~ (or union inter sub morph, \ for ∖), the kernel word unless quad,
// then r and, for stairs, n; a morph takes w. shade= and drive= after the last brace are the collage's.

const OP_WORDS = { '∪': 'union', union: 'union', '∩': 'inter', inter: 'inter', '∖': 'sub', '\\': 'sub', sub: 'sub', '~': 'morph', morph: 'morph' };
const OP_SYMBOL = { union: '∪', inter: '∩', sub: '∖', morph: '~' };
const AXES = 'xyz';
const isNum = (t) => /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t);
const b64url = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0)));

export const isCollageText = (text) => /^\s*\{/.test(text);

export function parseCollage(text) {
  // split into the pieces' texts and the words between them
  const pieces = [], between = [];
  let depth = 0, buf = '', outer = '';
  for (const ch of text) {
    if (ch === '{') {
      if (depth) throw new Error('a collage cannot sit inside a collage');
      depth = 1; between.push(outer); outer = ''; buf = '';
    } else if (ch === '}') {
      if (!depth) throw new Error('} without {');
      depth = 0; pieces.push(buf);
    } else if (depth) buf += ch;
    else outer += ch;
  }
  if (depth) throw new Error('unclosed {');
  between.push(outer);
  if (between[0].trim()) throw new Error('a collage starts with {');
  if (!pieces.length) throw new Error('a collage needs a piece');

  const c = { v: 1, pieces: pieces.map((t) => ({ f: parse(t), place: {}, rep: null })), joins: [] };
  for (let i = 1; i < between.length; i++) {
    const toks = between[i].replace(/[∪∩∖~]/g, (s) => ` ${s} `).trim().split(/\s+/).filter(Boolean);
    const pc = c.pieces[i - 1], last = i === between.length - 1;
    let k = 0;
    const nums = (max) => { const v = []; while (k < toks.length && v.length < max && isNum(toks[k])) v.push(parseFloat(toks[k++])); return v; };
    let joined = false;
    while (k < toks.length) {
      const t = toks[k++];
      let m;
      if (t === 'at') { const [x = 0, y = 0, z = 0] = nums(3); Object.assign(pc.place, { tx: x, ty: y, tz: z }); continue; }
      if (t === 'turn') { const [x = 0, y = 0, z = 0] = nums(3); Object.assign(pc.place, { rx: x, ry: y, rz: z }); continue; }
      if (t === 'size' || t === 'grow') { const [s] = nums(1); if (s === undefined) throw new Error(`${t} needs a number`); pc.place[t === 'size' ? 's' : 'g'] = s; continue; }
      if (t === 'grid') { const v = nums(6); pc.rep = { kind: 'grid', ...Object.fromEntries(['cx', 'cy', 'cz', 'nx', 'ny', 'nz'].map((key, j) => [key, v[j]]).filter(([, x]) => x !== undefined)) }; continue; }
      if (t === 'mirror') {
        const axes = toks[k++] || '';
        if (!/^[xyz]+$/.test(axes)) throw new Error('mirror needs its axes: x, xz, xyz …');
        const v = nums(axes.length), rep = { kind: 'mirror', mx: 0, my: 0, mz: 0 };
        [...axes].forEach((a, j) => { rep['m' + a] = 1; if (v[j] !== undefined) rep['o' + a] = v[j]; });
        pc.rep = rep;
        continue;
      }
      if (t === 'polar') {
        const v = nums(2), rep = { kind: 'polar' };
        if (v[0] !== undefined) rep.n = v[0];
        if (v[1] !== undefined) rep.r = v[1];
        if (k < toks.length && /^[xyz]$/.test(toks[k])) rep.axis = AXES.indexOf(toks[k++]);
        pc.rep = rep;
        continue;
      }
      if (OP_WORDS[t]) {
        if (last) throw new Error(`${t} needs a piece after it`);
        if (joined) throw new Error('one join between two pieces');
        const j = { op: OP_WORDS[t], k: 'quad' };
        if (k < toks.length && KERNELS.includes(toks[k])) j.k = toks[k++];
        const v = nums(2);
        if (j.op === 'morph') { if (v[0] !== undefined) j.w = v[0]; } else {
          if (v[0] !== undefined) j.r = v[0];
          if (v[1] !== undefined) j.n = v[1];
        }
        c.joins.push(j);
        joined = true;
        continue;
      }
      if (last && (m = t.match(/^shade=([A-Za-z0-9_-]+)$/))) { c.shade = JSON.parse(unb64url(m[1])); continue; }
      if (last && (m = t.match(/^drive=([A-Za-z0-9_-]+)$/))) { c.drive = JSON.parse(unb64url(m[1])); continue; }
      throw new Error(`unexpected "${t}" in a collage`);
    }
    if (!last && !joined) throw new Error('two pieces need a join between them (∪ ∩ ∖ ~)');
  }
  return c;
}

const trailing = (vals, defs) => { let m = vals.length; while (m > 0 && vals[m - 1] === defs[m - 1]) m--; return vals.slice(0, m); };

function formatPlace(pc) {
  const P = pc.place, out = [];
  if (P.tx || P.ty || P.tz) out.push(['at', ...trailing([P.tx, P.ty, P.tz], [0, 0, 0]).map(fmtNum)].join(' '));
  if (P.rx || P.ry || P.rz) out.push(['turn', ...trailing([P.rx, P.ry, P.rz], [0, 0, 0]).map(fmtNum)].join(' '));
  if (P.s !== 1) out.push(`size ${fmtNum(P.s)}`);
  if (P.g) out.push(`grow ${fmtNum(P.g)}`);
  const r = pc.rep;
  if (r && r.kind === 'grid') {
    const keys = ['cx', 'cy', 'cz', 'nx', 'ny', 'nz'];
    out.push(['grid', ...trailing(keys.map((k) => r[k]), keys.map((k) => REP.grid[k].d)).map(fmtNum)].join(' '));
  } else if (r && r.kind === 'mirror') {
    const axes = [...AXES].filter((a) => r['m' + a]);
    if (axes.length) out.push(['mirror', axes.join(''), ...trailing(axes.map((a) => r['o' + a]), axes.map(() => 0)).map(fmtNum)].join(' '));
  } else if (r && r.kind === 'polar') {
    out.push(['polar', fmtNum(r.n), fmtNum(r.r), ...(r.axis !== 1 ? [AXES[r.axis]] : [])].join(' '));
  }
  return out.join(' ');
}

function formatJoin(j) {
  const out = [OP_SYMBOL[j.op]];
  if (j.op === 'morph') { out.push(fmtNum(j.w)); return out.join(' '); }
  if (j.k !== 'quad') out.push(j.k);
  if (j.k !== 'hard') out.push(fmtNum(j.r));
  if (j.k === 'stairs' && j.n !== JOIN.n.d) out.push(fmtNum(j.n));
  return out.join(' ');
}

export function formatCollage(collage) {
  const c = normCollage(collage);
  const parts = [];
  c.pieces.forEach((pc, i) => {
    const place = formatPlace(pc);
    parts.push(`{ ${format(pc.f)} }${place ? ' ' + place : ''}`);
    if (i < c.joins.length) parts.push(formatJoin(c.joins[i]));
  });
  if (c.shade) parts.push(`shade=${b64url(JSON.stringify(c.shade))}`);
  if (c.drive) parts.push(`drive=${b64url(JSON.stringify(c.drive))}`);
  return parts.join(' ');
}

// the URL carries a formula or a collage; a collage's text starts with {
export const collageToURLHash = (c) => '#' + encodeURIComponent(formatCollage(c));
export const parseAny = (text) => (isCollageText(text) ? parseCollage(text) : parse(text));
export const formatAny = (x) => (isCollage(x) ? formatCollage(x) : format(normalize(x)));
export const fromURLHashAny = (h) => parseAny(decodeURIComponent(h.replace(/^#/, '')));

// two formulas joined: the simplest collage
export const collageOf = (a, b, join = {}, placeA = {}, placeB = {}) => normCollage({ pieces: [{ f: a, place: placeA }, { f: b, place: placeB }], joins: [join] });
