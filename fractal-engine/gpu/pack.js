// Packs a formula into the buffers the WGSL interpreter reads. Structure changes rewrite a buffer;
// they never recompile a shader.
//
// ops buffer: one record of 20 floats (five vec4) per op — [code, p0 … p18] — then the shading program. Rotations (3-D and 4-D,
// one row-major 4×4) and plane normals are resolved here so the shader does no trigonometry it can avoid.
// head (uniform): iters, schedule length, flags, bail, slot starts and lengths, the schedule word, the
// Julia constant, and the slice (a 4×4, column-major for WGSL, and the offset along w).

import { normalize, pullSafe, mixKids, seedOf, seedSpecies } from '../core/formula.js';
import { getOp, isMix } from '../core/ops.js';
import { FIELD_KIND, BLEND_KEYS } from '../core/fields.js';
import { packShade, SHADE_VEC4, MATH_OPS as D_MATH, shadeDrivers } from '../core/shade.js';
import { MAX_PIECES, KERNELS, JOIN_OPS, REP, normCollage, collageTarget } from '../core/collage.js';
import { opPaths, targetParam, perIteration, splitTarget, START, ORBIT, WAVES, TISSUE_OUT, driveParams, driveRuns, colourDrivers } from '../core/drive.js';
import { slotIndex } from '../core/notation.js';
import { hasPower } from '../core/cpu.js';
import { rotationXYZ, rotation4, lift4, sliceMatrix, normalize as nrm } from '../core/vec.js';

export const OPCODE = {
  'translate': 0, '+c': 1, 'scale': 2, 'rotate': 3, 'fold.plane': 4, 'fold.box': 5, 'fold.sphere': 6,
  'abs': 7, 'sort': 8, 'bulb': 9, 'power': 10, 'invert': 11, 'twist': 12,
  'spherical': 13, 'swirl': 14, 'sin': 15, 'horseshoe': 16, 'polar': 17,
  'rotate4': 3, 'sort4': 19, 'bulb4': 20, 'quat': 21,
  'fold.cell': 23, 'wrap': 24, 'kleinian': 25, 'fold.mandalay': 26,
  // a seed does nothing to the point (no case in opFwd): the estimate reads it (gpu/wgsl.js seedRead)
  'seed.slab': 27, 'seed.sphere': 28, 'seed.pillar': 29,
  // every chimera is one code; its field kind is in the record (core/fields.js FIELD_KIND)
  'mix': 22, 'mix.axis': 22, 'mix.sphere': 22, 'mix.noise': 22, 'mix.tissue': 22, 'mix.trap': 22, 'mix.depth': 22, 'mix.lyap': 22, 'mix.blend': 22,
};

export const MAX_OPS = 64;
export const MAX_SCHEDULE = 64;
export const REC = 20;
// the ops buffer: the op records, then the shading program (core/shade.js packShade), when there is one,
// then the drive program (packDrive below)
export const SHADE_AT = MAX_OPS * REC;
export const DRIVE_AT = SHADE_AT + SHADE_VEC4 * 4;
export const DRIVE_VEC4 = 2 + 32 * 3 + 16 * 10;
export const OPS_FLOATS = DRIVE_AT + DRIVE_VEC4 * 4;
export const FLAG_POWER = 1, FLAG_UNSAFE = 2, FLAG_JULIA = 4, FLAG_SHADE = 8, FLAG_DRIVE = 16, FLAG_SEED = 32;

// head layout (u32/f32 words): 4, eight slot starts, eight lengths, 64 schedule words, c (vec4f) at
// word 84, the slice (mat4x4f) at word 88, its w offset at word 104, the drivers' clock (seconds) at
// 105 and the raymarch's step factor 1 / L at 106 (both written per frame: setClock / setStep in
// gpu/render.js), the seed op's index at 107 → 432 bytes
export const HEAD_BYTES = 432;
export const CLOCK_WORD = 105, STEP_WORD = 106, SEED_WORD = 107;

// kids: a mix's sub-stack slots (pack reads them from the formula; a parameter tangent needs none)
//
// A chimera's record: [22, kind, at, first species slot], [species, w, g, 0], a vector (axis normal as
// given, sphere centre), [scalars]: sphere r; noise f, octaves, seed; tissue n, size, soft, seed; trap t;
// blend: its seven weights over both.
// Every continuous parameter enters it linearly, so the lens and the sensing pass can vary any of them.
function record(o, out = new Float32Array(REC), kids = [0, 0]) {
  const r = out;
  r[0] = OPCODE[o.op];
  const P = o.p;
  switch (o.op) {
    case 'translate': r.set([P.x, P.y, P.z, P.w], 1); break;
    case 'scale': r[1] = P.s; break;
    case 'rotate': r.set(lift4(rotationXYZ(P.x, P.y, P.z)), 1); break;
    case 'rotate4': r.set(rotation4([P.xy, P.xz, P.xw, P.yz, P.yw, P.zw]), 1); break;
    case 'fold.plane': r.set([...nrm([P.nx, P.ny, P.nz, P.nw]), P.d], 1); break;
    case 'fold.box': r[1] = P.l; break;
    case 'fold.sphere': r.set([P.rmin, P.rfix], 1); break;
    case 'fold.cell': case 'wrap': r.set([P.lx, P.ly, P.lz, P.lw], 1); break;
    case 'kleinian': r.set([P.a, P.b, P.bx, P.bz], 1); break;
    case 'fold.mandalay': r.set([P.fo, P.g], 1); break;
    case 'seed.slab': r.set([...nrm([P.nx, P.ny, P.nz, 0]).slice(0, 3), P.d, P.t, P.k], 1); break;
    case 'seed.sphere': case 'seed.pillar': r.set([P.r, P.k], 1); break;
    case 'bulb': case 'bulb4': case 'power': r[1] = P.n; break;
    case 'twist': r[1] = (P.a * Math.PI) / 180; break;
    default:
      if (isMix(o.op)) {
        r.set([FIELD_KIND[o.op], P.at || 0, kids[0], P.s, P.w ?? 0, P.g ?? 0, 0], 1);
        if (o.op === 'mix.axis') r.set([P.nx, P.ny, P.nz, P.nw], 8);
        if (o.op === 'mix.sphere') { r.set([P.cx, P.cy, P.cz, P.cw], 8); r[12] = P.r; }
        if (o.op === 'mix.noise') r.set([P.f, P.o, P.seed], 12);
        if (o.op === 'mix.tissue') r.set([P.n, P.size, P.soft, P.seed], 12);
        if (o.op === 'mix.trap') r[12] = P.t;
        if (o.op === 'mix.blend') r.set(BLEND_KEYS.map((k) => P[k]), 8);
      }
      break;
  }
  return r;
}

export function pack(formula) {
  const f = normalize(formula);
  const ops = new Float32Array(OPS_FLOATS);
  if (f.shade) ops.set(packShade(f.shade, f.drive), SHADE_AT);
  const starts = new Array(8).fill(0), lens = new Array(8).fill(0);
  let n = 0;
  const kidsOf = new Map(mixKids(f).mixes.map((m) => [`${m.si}.${m.j}`, m.kids]));
  // every op's index in the table and its sub-stack slots (the drive program names ops by index)
  const index = new Map(), kidsByOp = new Map();
  f.slots.forEach((s, si) => {
    starts[si] = n;
    lens[si] = s.length;
    for (const [j, o] of s.entries()) {
      if (n >= MAX_OPS) throw new Error('too many ops for the GPU interpreter');
      const kids = kidsOf.get(`${si}.${j}`);
      ops.set(record(o, undefined, kids), n * REC);
      index.set(o, n);
      if (kids) kidsByOp.set(o, kids);
      n++;
    }
  });
  const driven = drives(f) && packDrive(f, index, kidsByOp, ops);
  const sched = [...f.schedule].map(slotIndex);
  if (sched.length > MAX_SCHEDULE) throw new Error('schedule too long');

  const head = new ArrayBuffer(HEAD_BYTES);
  const u = new Uint32Array(head), fl = new Float32Array(head);
  u[0] = f.iters;
  u[1] = sched.length;
  const sd = seedOf(f);
  u[2] = (hasPower(f) ? FLAG_POWER : 0) | (pullSafe(f) ? 0 : FLAG_UNSAFE) | (f.c ? FLAG_JULIA : 0) | (f.shade ? FLAG_SHADE : 0) | (driven ? FLAG_DRIVE : 0) | (sd ? FLAG_SEED : 0);
  if (f.c) fl.set(f.c, 84);
  // the slice, column by column, and its w offset
  const T = sliceMatrix(f.slice || {});
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) fl[88 + j * 4 + i] = T[i * 4 + j];
  fl[104] = (f.slice && f.slice.w) || 0;
  fl[CLOCK_WORD] = 0;
  fl[STEP_WORD] = 1;
  // (and in the seed's record, third row, the species it speaks for: gpu/wgsl.js seedOn)
  if (sd) { fl[SEED_WORD] = index.get(sd); ops[index.get(sd) * REC + 8] = seedSpecies(f); }
  fl[3] = f.bail;
  for (let i = 0; i < 8; i++) { u[4 + i] = starts[i]; u[12 + i] = lens[i]; }
  sched.forEach((s, i) => { u[20 + i] = s; });
  return { ops, head, opCount: n, formula: f };
}

// ---------- the drive program (core/drive.js; gpu/wgsl.js DRIVE reads it) ---------------------------
// vec4 units after the shading program: a header [nodes, bindings, live (a binding reads the orbit),
// 0], the driven ops as a mask of four 16-bit words; three vec4 per node — [type, in a, in b
// (−1 unconnected), per-iteration], then its parameters in two vec4 (DRIVE_SLOTS) — then ten vec4 per
// binding: [op index, node, lo, hi], [the op's own value, min, max, mode], [raw slot, rebuilt op's slot
// (0–3), rebuilt binding's slot (0–7), 0], the record's
// derivative in the parameter (five vec4: exact, every rebuild-free parameter enters it linearly), and
// for the modes that rebuild the record on the GPU (1 rotate, 2 rotate4, 3 fold.plane — angles to a
// matrix, a normal normalised) the op's raw parameters in two vec4.
export const DRIVE_TYPE = Object.fromEntries([...ORBIT, ...START].map((t, i) => [t, i + 1]));
Object.assign(DRIVE_TYPE, { axis: 13, sphere: 14, noise: 15, tissue: 16, time: 17, param: 18, math: 19, remap: 20 });
// where each node parameter sits among its eight floats (the sensing pass nudges one by slot)
export const DRIVE_SLOTS = {
  axis: ['nx', 'ny', 'nz', 'nw', 'g'], sphere: ['cx', 'cy', 'cz', 'cw', 'r', 'g'], noise: ['f', 'g', 'o', 'seed'],
  tissue: ['n', 'size', 'soft', 'seed', 'out'], time: ['rate', 'phase', 'wave'], param: ['value'], math: ['op', 'c'],
  remap: ['lo', 'hi', 'clamp'],
};
const RAW = { rotate: ['x', 'y', 'z'], rotate4: ['xy', 'xz', 'xw', 'yz', 'yw', 'zw'], 'fold.plane': ['nx', 'ny', 'nz', 'nw', 'd'] };
const MODE = { rotate: 1, rotate4: 2, 'fold.plane': 3 };
// the GPU keeps rebuilt records for four ops and their derivatives for eight bindings (core/drive.js
// validateDrive refuses more)
export const MAX_REBUILT_OPS = 4, MAX_REBUILT_BINDS = 8;
const BIG = 1e30;

// drives: the drive program runs (something bound, or the shading reads a driver: core/drive.js
// driveRuns) — the drivers' shader variant; shapes: something bound — the distance estimate moves
// (sensing, the step factor, the grid)
export const drives = (f) => driveRuns(f);
export const shapes = (f) => !!(f.drive && f.drive.bind && f.drive.bind.length);

// the bindings the GPU runs, in order: those whose target exists (core/drive.js skips the others too)
export function driveBinds(f) {
  if (!drives(f)) return [];
  const paths = opPaths(f), at = new Map(f.drive.nodes.map((m, i) => [m.id, i]));
  return f.drive.bind.map((b) => ({ b, t: targetParam(paths, b.to), from: at.get(b.from) })).filter((x) => x.t && x.from !== undefined);
}

// a param node: its op's own value, then the op's index and the parameter's (so the dual numbers know
// it moves when that very parameter is the one sensed)
export function nodeFloats(m, own, paths, index) {
  const P = m.p;
  if (m.type === 'param') {
    const { path, key } = splitTarget(P.of), o = paths.get(path);
    return [own(P.of), o && index.has(o) ? index.get(o) : -1, o ? getOp(o.op).params.findIndex((q) => q.k === key) : -1];
  }
  if (m.type === 'time') return [P.rate, P.phase, WAVES.indexOf(P.wave)];
  if (m.type === 'math') return [D_MATH.indexOf(P.op), P.c];
  if (m.type === 'remap') return [P.lo, P.hi, P.clamp ? 1 : 0];
  if (m.type === 'tissue') return [P.n, P.size, P.soft, P.seed, TISSUE_OUT.indexOf(P.out)];
  return (DRIVE_SLOTS[m.type] || []).map((k) => P[k]);
}

function packDrive(f, index, kidsByOp, ops) {
  const d = f.drive, paths = opPaths(f), per = perIteration(d);
  const binds = driveBinds(f);
  if (!driveRuns(f)) return false;
  const own = (to) => { const { path, key } = splitTarget(to), o = paths.get(path); return o && Number.isFinite(o.p[key]) ? o.p[key] : 0; };
  const at = new Map(d.nodes.map((m, i) => [m.id, i]));
  const base = DRIVE_AT;
  const mask = [0, 0, 0, 0];
  // live: the per-iteration nodes refill every iteration — when a binding or the shading reads one
  const live = binds.some((x) => per.has(x.b.from)) || colourDrivers(f).some((id) => per.has(id));
  ops.set([d.nodes.length, binds.length, live ? 1 : 0, 0], base);
  d.nodes.forEach((m, i) => {
    const o = base + (2 + i * 3) * 4;
    const ins = ['a', 'b'].map((k) => (m.in[k] != null && at.has(m.in[k]) ? at.get(m.in[k]) : -1));
    ops.set([DRIVE_TYPE[m.type], ...ins, per.has(m.id) ? 1 : 0], o);
    ops.set(nodeFloats(m, own, paths, index).slice(0, 8), o + 4);
  });
  const nlOps = new Map();
  let nlBinds = 0;
  binds.forEach(({ b, t, from }, k) => {
    const oi = index.get(t.o);
    mask[oi >> 4] |= 1 << (oi & 15);
    const o = base + (2 + 32 * 3 + k * 10) * 4;
    const mode = MODE[t.o.op] || 0;
    ops.set([oi, from, b.lo, b.hi], o);
    ops.set([t.o.p[t.key], t.q.min ?? -BIG, t.q.max ?? BIG, mode], o + 4);
    if (mode) {
      if (!nlOps.has(t.o)) nlOps.set(t.o, nlOps.size);
      if (nlOps.size > MAX_REBUILT_OPS || nlBinds >= MAX_REBUILT_BINDS) throw new Error('too many driven rotations and plane folds for the GPU');
      ops.set([RAW[t.o.op].indexOf(t.key), nlOps.get(t.o), nlBinds++], o + 8);
      ops.set(RAW[t.o.op].map((k) => t.o.p[k] ?? 0), o + 32);
    } else {
      const v = t.o.p[t.key], h = 1e-5 * Math.max(1, Math.abs(v)), kids = kidsByOp.get(t.o);
      const plus = record({ op: t.o.op, p: { ...t.o.p, [t.key]: v + h } }, new Float64Array(REC), kids);
      const minus = record({ op: t.o.op, p: { ...t.o.p, [t.key]: v - h } }, new Float64Array(REC), kids);
      ops.set(plus.map((x, i) => (x - minus[i]) / (2 * h)), o + 12);
    }
  });
  ops.set(mask, base + 4);
  return true;
}

// Parameter tangents for the dual-number pass: for every parameter of every op, the derivative of
// its packed record with respect to that parameter, by central differences in float64 on the CPU.
// The shader then differentiates only through the record, so rotations (Euler angles → matrix) and
// plane normals (normalised) need no derivative code on the GPU.
export const MAX_PARAMS = 64;
// [opIndex, kind, index, slot] + 20 record derivatives (six vec4). kind 0 an op's parameter (slot: its
// place among the op's parameters); for the
// drivers (core/drive.js driveParams) 1 a band's lo, 2 its hi (index: the binding), 3 a node's
// parameter (index: the node, slot: DRIVE_SLOTS); 4 the frozen row — the gradient with every driver
// held, which the step factor compares the driven gradient with. Driver rows name no op: NO_OP.
export const TAN_FLOATS = 24;
export const NO_OP = 4294967040;

// opts.frozen: append the frozen row (only for a formula that drives)
export function paramTangents(formula, opts = {}) {
  const f = normalize(formula);
  const list = [];
  // a bound parameter's own value does nothing: it is not sensed
  const paths = opPaths(f), bound = new Set((f.drive && f.drive.bind || []).map((b) => b.to));
  const pathOf = new Map([...paths].map(([id, o]) => [o, id]));
  let oi = 0;
  f.slots.forEach((slot, si) => slot.forEach((o, j) => {
    // counts, seeds and frames are not sensed: they have no derivative
    for (const q of getOp(o.op).params.filter((x) => !x.discrete)) {
      if (bound.has(`${pathOf.get(o)}.${q.k}`)) continue;
      const v = o.p[q.k], h = 1e-5 * Math.max(1, Math.abs(v));
      const plus = record({ op: o.op, p: { ...o.p, [q.k]: v + h } }, new Float64Array(REC));
      const minus = record({ op: o.op, p: { ...o.p, [q.k]: v - h } }, new Float64Array(REC));
      const drec = new Float64Array(REC).map((_, i) => (plus[i] - minus[i]) / (2 * h));
      list.push({ oi, slot: si, index: j, op: o.op, key: q.k, value: v, drec, pi: getOp(o.op).params.indexOf(q) });
    }
    oi++;
  }));
  if (shapes(f)) {
    const binds = driveBinds(f), bi = new Map(binds.map((x, k) => [x.b.to, k]));
    const ni = new Map(f.drive.nodes.map((m, k) => [m.id, k]));
    for (const q of driveParams(f.drive)) {
      const [kind, id, key] = q.ref.split('/');
      if (kind === 'bind' && bi.has(id)) list.push({ drive: q.ref, kind: key === 'lo' ? 1 : 2, index: bi.get(id), slot: 0, value: q.value });
      if (kind === 'node') {
        const m = f.drive.nodes[ni.get(id)], slot = (DRIVE_SLOTS[m.type] || []).indexOf(key);
        if (slot >= 0) list.push({ drive: q.ref, kind: 3, index: ni.get(id), slot, value: q.value });
      }
    }
  }
  if (list.length > MAX_PARAMS) list.length = MAX_PARAMS;
  if (opts.frozen && shapes(f)) list.push({ frozen: true, kind: 4, index: 0, slot: 0 });
  const buf = new Float32Array(Math.max(1, list.length) * TAN_FLOATS);
  list.forEach((t, i) => {
    buf.set(t.drec ? [t.oi, 0, 0, t.pi] : [NO_OP, t.kind, t.index, t.slot], i * TAN_FLOATS);
    if (t.drec) buf.set(t.drec, i * TAN_FLOATS + 4);
  });
  return { list, buf };
}

// ---------- the collage (core/collage.js; gpu/wgsl.js COLLAGE reads it) -----------------------------
// A collage packs every piece as the formula it is — its head, and its ops region (op records, shading
// and drive programs, OPS_FLOATS each) behind the piece index — then a region of the collage's own
// (its shade and drive programs, at the same offsets: gpu/wgsl.js reads them through the same code with
// the region selected) and the collage program after the nine regions, in vec4 units from CL_AT / 4:
//   [pieces, has its own shade, bindings, drives] [the static step factor, chamfers, an unsafe piece, 0]
//   four vec4 per piece (eight slots): [tx ty tz s] [rx ry rz g] [repetition kind (0 none, 1 grid,
//     2 mirror, 3 polar), its first three numbers] [its last three, 0]
//   two vec4 per join (seven): [op (0 union, 1 inter, 2 sub, 3 morph), kernel (KERNELS order), r, n] [w]
//   two vec4 per binding (sixteen): [target (the flat index below), node, lo, hi] [min, max]
// A binding's target is a flat index into that program: piece i's numbers at 16·i + their place in its
// four vec4, join j's at 128 + 8·j + theirs — so the GPU overlays driven values on the vec4 it reads.
// Heads: one per piece, then the collage's own (its flags: FLAG_SHADE when it has a shade).

export const REGION4 = OPS_FLOATS / 4;
export const CL_AT = (MAX_PIECES + 1) * OPS_FLOATS;
export const CL_VEC4 = 2 + MAX_PIECES * 4 + (MAX_PIECES - 1) * 2 + 16 * 2;
export const COLLAGE_OPS_FLOATS = CL_AT + CL_VEC4 * 4;
export const COLLAGE_HEAD_BYTES = (MAX_PIECES + 1) * HEAD_BYTES;
export const CL_PIECE_FLOATS = 16, CL_JOIN_AT = 128, CL_JOIN_FLOATS = 8;
const PLACE_AT = { tx: 0, ty: 1, tz: 2, s: 3, rx: 4, ry: 5, rz: 6, g: 7 };
const REP_KIND = { grid: 1, mirror: 2, polar: 3 };
const JOIN_AT = { r: 2, n: 3, w: 4 };

// the flat program index a collage target names (null when it is not one: core/collage.js collageTarget)
export function collageSlot(c, to) {
  const t = collageTarget(c, to);
  if (!t) return null;
  const m = /^([PJ])(\d+)\./.exec(to), i = +m[2];
  if (m[1] === 'J') return CL_JOIN_AT + CL_JOIN_FLOATS * i + JOIN_AT[t.key];
  if (t.key in PLACE_AT) return CL_PIECE_FLOATS * i + PLACE_AT[t.key];
  return CL_PIECE_FLOATS * i + 9 + Object.keys(REP[c.pieces[i].rep.kind]).indexOf(t.key);
}

// The step factor the march multiplies by, before any measured one (gpu/render.js setStep): every
// union kernel keeps the estimate 1-Lipschitz but the chamfer (√2 on its bevel, compounding join by
// join), and a piece that is not pull-safe steps at 0.3 as it does alone.
export function collageStepFactor(c) {
  const g = normCollage(c);
  const chamfers = g.joins.filter((j) => j.op !== 'morph' && j.k === 'chamfer').length;
  const unsafe = g.pieces.some((q) => !pullSafe(q.f));
  return { step: Math.pow(Math.SQRT1_2, chamfers) * (unsafe ? 0.3 : 1), chamfers, unsafe };
}

// whether the collage needs the drivers' variant (a piece's own drive program runs), and whether its
// estimate moves with a drive (its own or a piece's): the measured step factor then applies
export const collageDrives = (c) => normCollage(c).pieces.some((q) => drives(q.f));
export const collageShapes = (c) => {
  const g = normCollage(c);
  return !!(g.drive && g.drive.bind.length) || g.pieces.some((q) => shapes(q.f));
};

// does the collage's own shade read its drivers (a 'd:' input or a binding)? Its march then runs in the
// drivers' variant, where the shading reads registers
export const collageShadeDrives = (collage) => {
  const c = normCollage(collage);
  return !!(c.shade && c.drive && [...shadeDrivers(c.shade)].some((id) => c.drive.nodes.some((m) => m.id === id)));
};

export function packCollage(collage) {
  const c = normCollage(collage);
  const N = c.pieces.length;
  if (N < 1 || N > MAX_PIECES) throw new Error(`a collage holds 1..${MAX_PIECES} pieces`);
  const ops = new Float32Array(COLLAGE_OPS_FLOATS);
  const head = new ArrayBuffer(COLLAGE_HEAD_BYTES);
  const pieces = c.pieces.map((q, i) => {
    const pk = pack(q.f);
    ops.set(pk.ops, i * OPS_FLOATS);
    new Uint8Array(head, i * HEAD_BYTES, HEAD_BYTES).set(new Uint8Array(pk.head));
    return pk;
  });
  // the collage's own head: its shade flag, the clock and step words
  const own = MAX_PIECES * OPS_FLOATS;
  const oh = new Uint32Array(head, MAX_PIECES * HEAD_BYTES, HEAD_BYTES / 4), of = new Float32Array(head, MAX_PIECES * HEAD_BYTES, HEAD_BYTES / 4);
  oh[0] = 1; oh[1] = 1; oh[2] = c.shade ? FLAG_SHADE : 0; of[3] = 1;
  of[88] = of[93] = of[98] = of[103] = 1;
  of[STEP_WORD] = 1;
  // the collage's shade reads the collage's own drivers (their registers in the drive program's order:
  // gpu/wgsl.js clShadeDrive fills them at the hit), never a piece's
  if (c.shade) ops.set(packShade(c.shade, c.drive || null), own + SHADE_AT);
  const shadeDrv = collageShadeDrives(c);
  // the drive program's nodes, as a formula's (gpu/wgsl.js drvNode reads them); its bindings below
  const d = c.drive;
  const binds = d ? d.bind.map((b) => ({ b, slot: collageSlot(c, b.to), t: collageTarget(c, b.to), from: d.nodes.findIndex((m) => m.id === b.from) })).filter((x) => x.slot != null && x.from >= 0) : [];
  if (binds.length > 16) throw new Error('too many collage bindings for the GPU');
  if (d) {
    const ownOf = (to) => { const t = collageTarget(c, to); return t ? t.obj[t.key] : 0; };
    const at = new Map(d.nodes.map((m, i) => [m.id, i]));
    ops.set([d.nodes.length, binds.length, 0, 0], own + DRIVE_AT);
    d.nodes.forEach((m, i) => {
      const o = own + DRIVE_AT + (2 + i * 3) * 4;
      ops.set([DRIVE_TYPE[m.type], ...['a', 'b'].map((k) => (m.in[k] != null && at.has(m.in[k]) ? at.get(m.in[k]) : -1)), 0], o);
      ops.set((m.type === 'param' ? [ownOf(m.p.of), -1, -1] : nodeFloats(m)).slice(0, 8), o + 4);
    });
  }
  const st = collageStepFactor(c);
  const P = CL_AT;
  ops.set([N, c.shade ? 1 : 0, binds.length, binds.length ? 1 : 0], P);
  ops.set([st.step, st.chamfers, st.unsafe ? 1 : 0, shadeDrv ? 1 : 0], P + 4);
  c.pieces.forEach((q, i) => {
    const o = P + (2 + i * 4) * 4, pl = q.place, r = q.rep;
    ops.set([pl.tx, pl.ty, pl.tz, pl.s, pl.rx, pl.ry, pl.rz, pl.g], o);
    if (r) {
      const v = Object.keys(REP[r.kind]).map((k) => r[k]);
      ops.set([REP_KIND[r.kind], v[0], v[1], v[2], v[3] ?? 0, v[4] ?? 0, v[5] ?? 0, 0], o + 8);
    }
  });
  c.joins.forEach((j, i) => {
    const o = P + (2 + MAX_PIECES * 4 + i * 2) * 4;
    ops.set([JOIN_OPS.indexOf(j.op), KERNELS.indexOf(j.k), j.r, j.n, j.w], o);
  });
  binds.forEach(({ b, slot, t, from }, k) => {
    const o = P + (2 + MAX_PIECES * 4 + (MAX_PIECES - 1) * 2 + k * 2) * 4;
    ops.set([slot, from, b.lo, b.hi, t.spec.min ?? -BIG, t.spec.max ?? BIG], o);
  });
  return { ops, head, collage: c, pieces, opCount: pieces.reduce((a, p) => a + p.opCount, 0), step: st.step,
    drives: c.pieces.some((q) => drives(q.f)) || shadeDrv, shapes: collageShapes(c) };
}
