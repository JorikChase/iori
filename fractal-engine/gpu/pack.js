// Packs a formula into the buffers the WGSL interpreter reads. Structure changes rewrite a buffer;
// they never recompile a shader.
//
// ops buffer: one record of 16 floats per op — [code, p0 … p14]. Rotations and plane normals are
// resolved here so the shader does no trigonometry it can avoid.
// head (uniform): iters, schedule length, flags, bail, slot starts and lengths, the schedule word.

import { normalize, pullSafe } from '../core/formula.js';
import { slotIndex } from '../core/notation.js';
import { hasPower } from '../core/cpu.js';
import { rotationXYZ, normalize as nrm } from '../core/vec.js';

export const OPCODE = {
  'translate': 0, '+c': 1, 'scale': 2, 'rotate': 3, 'fold.plane': 4, 'fold.box': 5, 'fold.sphere': 6,
  'abs': 7, 'sort': 8, 'bulb': 9, 'power': 10, 'invert': 11, 'twist': 12,
  'spherical': 13, 'swirl': 14, 'sin': 15, 'horseshoe': 16, 'polar': 17,
};

export const MAX_OPS = 64;
export const MAX_SCHEDULE = 64;
export const REC = 16;
export const FLAG_POWER = 1, FLAG_UNSAFE = 2;

// head layout (u32/f32 words; 4 + 4 + 4 + 64 = 76 words → 304 bytes, rounded to 320)
export const HEAD_BYTES = 320;

function record(o) {
  const r = new Float32Array(REC);
  r[0] = OPCODE[o.op];
  const P = o.p;
  switch (o.op) {
    case 'translate': r.set([P.x, P.y, P.z], 1); break;
    case 'scale': r[1] = P.s; break;
    case 'rotate': r.set(rotationXYZ(P.x, P.y, P.z), 1); break;
    case 'fold.plane': r.set([...nrm([P.nx, P.ny, P.nz]), P.d], 1); break;
    case 'fold.box': r[1] = P.l; break;
    case 'fold.sphere': r.set([P.rmin, P.rfix], 1); break;
    case 'bulb': case 'power': r[1] = P.n; break;
    case 'twist': r[1] = (P.a * Math.PI) / 180; break;
    default: break;
  }
  return r;
}

export function pack(formula) {
  const f = normalize(formula);
  const ops = new Float32Array(MAX_OPS * REC);
  const starts = [0, 0, 0, 0], lens = [0, 0, 0, 0];
  let n = 0;
  f.slots.forEach((s, si) => {
    starts[si] = n;
    lens[si] = s.length;
    for (const o of s) {
      if (n >= MAX_OPS) throw new Error('too many ops for the GPU interpreter');
      ops.set(record(o), n * REC);
      n++;
    }
  });
  const sched = [...f.schedule].map(slotIndex);
  if (sched.length > MAX_SCHEDULE) throw new Error('schedule too long');

  const head = new ArrayBuffer(HEAD_BYTES);
  const u = new Uint32Array(head), fl = new Float32Array(head);
  u[0] = f.iters;
  u[1] = sched.length;
  u[2] = (hasPower(f) ? FLAG_POWER : 0) | (pullSafe(f) ? 0 : FLAG_UNSAFE);
  fl[3] = f.bail;
  for (let i = 0; i < 4; i++) { u[4 + i] = starts[i]; u[8 + i] = lens[i]; }
  sched.forEach((s, i) => { u[12 + i] = s; });
  return { ops, head, opCount: n, formula: f };
}
