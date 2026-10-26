// Packs a formula into the buffers the WGSL interpreter reads. Structure changes rewrite a buffer;
// they never recompile a shader.
//
// ops buffer: one record of 20 floats (five vec4) per op — [code, p0 … p18]. Rotations (3-D and 4-D,
// one row-major 4×4) and plane normals are resolved here so the shader does no trigonometry it can avoid.
// head (uniform): iters, schedule length, flags, bail, slot starts and lengths, the schedule word, the
// Julia constant, and the slice (a 4×4, column-major for WGSL, and the offset along w).

import { normalize, pullSafe, mixKids } from '../core/formula.js';
import { getOp } from '../core/ops.js';
import { slotIndex } from '../core/notation.js';
import { hasPower } from '../core/cpu.js';
import { rotationXYZ, rotation4, lift4, sliceMatrix, normalize as nrm } from '../core/vec.js';

export const OPCODE = {
  'translate': 0, '+c': 1, 'scale': 2, 'rotate': 3, 'fold.plane': 4, 'fold.box': 5, 'fold.sphere': 6,
  'abs': 7, 'sort': 8, 'bulb': 9, 'power': 10, 'invert': 11, 'twist': 12,
  'spherical': 13, 'swirl': 14, 'sin': 15, 'horseshoe': 16, 'polar': 17,
  'rotate4': 3, 'sort4': 19, 'bulb4': 20, 'quat': 21, 'mix': 22,
};

export const MAX_OPS = 64;
export const MAX_SCHEDULE = 64;
export const REC = 20;
export const FLAG_POWER = 1, FLAG_UNSAFE = 2, FLAG_JULIA = 4;

// head layout (u32/f32 words): 4 + 4 + 4 + 64 schedule words, c (vec4f) at word 76, the slice
// (mat4x4f) at word 80, its w offset at word 96 → 400 bytes
export const HEAD_BYTES = 400;

// kids: a mix's two sub-stack slots (pack reads them from the formula; a parameter tangent needs none)
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
    case 'bulb': case 'bulb4': case 'power': r[1] = P.n; break;
    case 'twist': r[1] = (P.a * Math.PI) / 180; break;
    case 'mix': r.set([P.w, P.k, P.r, ...nrm([P.nx, P.ny, P.nz, P.nw]), kids[0], kids[1]], 1); break;
    default: break;
  }
  return r;
}

export function pack(formula) {
  const f = normalize(formula);
  const ops = new Float32Array(MAX_OPS * REC);
  const starts = [0, 0, 0, 0], lens = [0, 0, 0, 0];
  let n = 0;
  const kidsOf = new Map(mixKids(f).mixes.map((m) => [`${m.si}.${m.j}`, m.kids]));
  f.slots.forEach((s, si) => {
    starts[si] = n;
    lens[si] = s.length;
    for (const [j, o] of s.entries()) {
      if (n >= MAX_OPS) throw new Error('too many ops for the GPU interpreter');
      ops.set(record(o, undefined, kidsOf.get(`${si}.${j}`)), n * REC);
      n++;
    }
  });
  const sched = [...f.schedule].map(slotIndex);
  if (sched.length > MAX_SCHEDULE) throw new Error('schedule too long');

  const head = new ArrayBuffer(HEAD_BYTES);
  const u = new Uint32Array(head), fl = new Float32Array(head);
  u[0] = f.iters;
  u[1] = sched.length;
  u[2] = (hasPower(f) ? FLAG_POWER : 0) | (pullSafe(f) ? 0 : FLAG_UNSAFE) | (f.c ? FLAG_JULIA : 0);
  if (f.c) fl.set(f.c, 76);
  // the slice, column by column, and its w offset
  const T = sliceMatrix(f.slice || {});
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) fl[80 + j * 4 + i] = T[i * 4 + j];
  fl[96] = (f.slice && f.slice.w) || 0;
  fl[3] = f.bail;
  for (let i = 0; i < 4; i++) { u[4 + i] = starts[i]; u[8 + i] = lens[i]; }
  sched.forEach((s, i) => { u[12 + i] = s; });
  return { ops, head, opCount: n, formula: f };
}

// Parameter tangents for the dual-number pass: for every parameter of every op, the derivative of
// its packed record with respect to that parameter, by central differences in float64 on the CPU.
// The shader then differentiates only through the record, so rotations (Euler angles → matrix) and
// plane normals (normalised) need no derivative code on the GPU.
export const MAX_PARAMS = 64;
export const TAN_FLOATS = 24; // [opIndex, 0, 0, 0] + 20 record derivatives (six vec4)

export function paramTangents(formula) {
  const f = normalize(formula);
  const list = [];
  let oi = 0;
  f.slots.forEach((slot, si) => slot.forEach((o, j) => {
    for (const q of getOp(o.op).params) {
      const v = o.p[q.k], h = 1e-5 * Math.max(1, Math.abs(v));
      const plus = record({ op: o.op, p: { ...o.p, [q.k]: v + h } }, new Float64Array(REC));
      const minus = record({ op: o.op, p: { ...o.p, [q.k]: v - h } }, new Float64Array(REC));
      const drec = new Float64Array(REC).map((_, i) => (plus[i] - minus[i]) / (2 * h));
      list.push({ oi, slot: si, index: j, op: o.op, key: q.k, value: v, drec });
    }
    oi++;
  }));
  if (list.length > MAX_PARAMS) list.length = MAX_PARAMS;
  const buf = new Float32Array(Math.max(1, list.length) * TAN_FLOATS);
  list.forEach((t, i) => { buf[i * TAN_FLOATS] = t.oi; buf.set(t.drec, i * TAN_FLOATS + 4); });
  return { list, buf };
}
