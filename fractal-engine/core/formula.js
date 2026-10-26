// Formula JSON: the portable, content-addressed form of a scene's structure.
//
// {
//   v: 1,
//   seed: 0,               integer; the push engine's random stream
//   iters: 12,             iterations of the schedule
//   schedule: 'A',         word of slot letters, repeated to fill iters ('AAB' → A A B A A B …)
//   bail: 4,               escape radius for pull; orbits beyond it have left
//   c: [x, y, z],          optional. Fixed constant for +c (a Julia set). Absent: pull uses c = the
//                          point itself (a Mandelbrot-type set); push, which has no single point,
//                          uses the point the camera looks at, so it shows the Julia set of where you are
//   slots: [[{ op: 'fold.box', p: { l: 1 } }, …], …]   up to four op lists, A–D
// }
//
// normalize fills defaults; validate returns every problem it finds; canonical/hash make the id.

import { getOp, fillParams } from './ops.js';
import { parse, format, slotIndex } from './notation.js';

export const MAX_ITERS = 4096;
export const MAX_OPS = 64;

export function normalize(f) {
  const g = {
    v: 1,
    seed: f.seed | 0,
    iters: f.iters === undefined ? 12 : f.iters,
    schedule: f.schedule || 'A',
    bail: f.bail === undefined ? 4 : f.bail,
    ...(Array.isArray(f.c) ? { c: f.c.map(Number) } : {}),
    slots: (f.slots || []).map((s) => s.map((o) => {
      const def = getOp(o.op);
      return { op: def ? def.name : o.op, p: def ? fillParams(def, o.p || {}) : { ...(o.p || {}) } };
    })),
  };
  return g;
}

export function validate(f) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!f || typeof f !== 'object') return { ok: false, errors: ['not an object'] };
  if (f.v !== undefined && f.v !== 1) err(`unsupported version ${f.v}`);
  if (!Number.isInteger(f.seed)) err('seed must be an integer');
  if (!Number.isInteger(f.iters) || f.iters < 1 || f.iters > MAX_ITERS) err(`iters must be 1..${MAX_ITERS}`);
  if (!(typeof f.bail === 'number' && f.bail > 0 && Number.isFinite(f.bail))) err('bail must be a positive number');
  if (f.c !== undefined && !(Array.isArray(f.c) && f.c.length === 3 && f.c.every(Number.isFinite))) err('c must be three finite numbers');
  if (!Array.isArray(f.slots) || f.slots.length < 1 || f.slots.length > 4) err('slots must hold 1..4 op lists');
  else {
    let count = 0;
    f.slots.forEach((s, si) => {
      if (!Array.isArray(s) || s.length === 0) { err(`slot ${si} is empty`); return; }
      s.forEach((o, oi) => {
        count++;
        const def = getOp(o && o.op);
        if (!def) { err(`slot ${si} op ${oi}: unknown op "${o && o.op}"`); return; }
        for (const q of def.params) {
          const v = o.p ? o.p[q.k] : undefined;
          if (typeof v !== 'number' || !Number.isFinite(v)) { err(`${def.name}.${q.k} must be a finite number`); continue; }
          if (q.min !== undefined && v < q.min) err(`${def.name}.${q.k} below ${q.min}`);
          if (q.max !== undefined && v > q.max) err(`${def.name}.${q.k} above ${q.max}`);
        }
        for (const k of Object.keys(o.p || {})) if (!def.params.some((q) => q.k === k)) err(`${def.name} has no parameter ${k}`);
      });
    });
    if (count > MAX_OPS) err(`more than ${MAX_OPS} ops`);
    if (typeof f.schedule !== 'string' || !/^[A-D]+$/.test(f.schedule)) err('schedule must be a word of A–D');
    else for (const ch of f.schedule) if (slotIndex(ch) >= f.slots.length) err(`schedule names slot ${ch} which does not exist`);
  }
  return { ok: errors.length === 0, errors };
}

// A formula can run on the pull engine only if every op keeps the distance estimate honest.
export function pullSafe(f) {
  return f.slots.every((s) => s.every((o) => { const d = getOp(o.op); return d && d.wRule !== 'none'; }));
}

export function canonical(f) {
  const g = normalize(f);
  return JSON.stringify({
    v: g.v, seed: g.seed, iters: g.iters, schedule: g.schedule, bail: g.bail, ...(g.c ? { c: g.c } : {}),
    slots: g.slots.map((s) => s.map((o) => ({ op: o.op, p: Object.fromEntries(getOp(o.op).params.map((q) => [q.k, o.p[q.k]])) }))),
  });
}

// cyrb53: a 53-bit string hash, printed as 14 hex digits
export function hash(f) {
  const str = canonical(f);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return n.toString(16).padStart(14, '0');
}

// The URL carries the notation, which is shorter than the JSON
export const toURLHash = (f) => '#' + encodeURIComponent(format(normalize(f)));
export const fromURLHash = (h) => parse(decodeURIComponent(h.replace(/^#/, '')));

export { parse, format };
