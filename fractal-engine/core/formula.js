// Formula JSON: the portable, content-addressed form of a scene's structure.
//
// {
//   v: 1,
//   seed: 0,               integer; the push engine's random stream
//   iters: 12,             iterations of the schedule
//   schedule: 'A',         word of slot letters, repeated to fill iters ('AAB' → A A B A A B …)
//   bail: 4,               escape radius for pull; orbits beyond it have left
//   c: [x, y, z, w],       optional. Fixed constant for +c (a Julia set). Absent: pull uses c = the
//                          point itself (a Mandelbrot-type set); push, which has no single point,
//                          uses the point the camera looks at, so it shows the Julia set of where you are
//   slice: { w, tilt: [xw, yw, zw] }   optional. Where the 3-D world sits in the orbit's 4-D space:
//                          x₄ = T·(x, y, z, w), T the rotation by the tilt (degrees) in the xw, yw, zw
//                          planes. Absent: w = 0, no tilt — a 3-D formula sees exactly the 3-D world
//   shade: { nodes, out }  optional. The colour as a dataflow (core/shade.js)
//   drive: { nodes, bind } optional. Parameters driven by the orbit, the world, time, each other
//                          (core/drive.js); bindings name ops by their graph path ids (core/graph.js)
//   sub: [{ id, n, uses, expose }, …]   optional. Runs of ops used in several places (core/sub.js): a link
//                          over the plain slots, which every engine reads as they are
//   slots: [[{ op: 'fold.box', p: { l: 1 } }, …], …]   up to eight op lists, A–H
// }
//
// A chimera's sub-stacks are slots too, kept after the scheduled ones: each mix op owns as many slots
// as it has species (its hidden parameter s), consecutive, in the order the mixes appear (slot by slot,
// op by op), at the end of the list. The schedule names only the first slots. So the JSON needs no
// references — mixKids reads them.
//
// normalize fills defaults; validate returns every problem it finds; canonical/hash make the id.

import { getOp, fillParams, isMix } from './ops.js';
import { normShade, validateShade } from './shade.js';
import { normDrive, validateDrive, emptyDrive } from './drive.js';
import { normSub, syncSub, validateSub } from './sub.js';
import { parse, format, slotIndex } from './notation.js';

export const MAX_ITERS = 4096;
export const MAX_OPS = 64;
export const MAX_SLOTS = 8;

export function normalize(f) {
  const g = {
    v: 1,
    seed: f.seed | 0,
    iters: f.iters === undefined ? 12 : f.iters,
    schedule: f.schedule || 'A',
    bail: f.bail === undefined ? 4 : f.bail,
    ...(Array.isArray(f.c) ? { c: [0, 1, 2, 3].map((i) => Number(f.c[i] || 0)) } : {}),
    ...(f.slice && (f.slice.w || (f.slice.tilt || []).some(Boolean)) ? { slice: { w: Number(f.slice.w || 0), tilt: [0, 1, 2].map((i) => Number((f.slice.tilt || [])[i] || 0)) } } : {}),
    ...(f.shade ? { shade: normShade(f.shade) } : {}),
    ...(!emptyDrive(f.drive) ? { drive: normDrive(f.drive) } : {}),
    ...(normSub(f.sub) ? { sub: normSub(f.sub) } : {}),
    slots: (f.slots || []).map((s) => s.map((o) => {
      const def = getOp(o.op);
      return { op: def ? def.name : o.op, p: def ? fillParams(def, o.p || {}) : { ...(o.p || {}) } };
    })),
  };
  // every mix op is handed its two sub-stacks (not enumerable: JSON and the hash never see them)
  for (const m of mixKids(g).mixes) if (m.kids.every((k) => k >= 0 && k < g.slots.length)) Object.defineProperty(g.slots[m.si][m.j], 'kids', { value: m.kids.map((k) => g.slots[k]) });
  syncSub(g);
  return g;
}

// the mix ops in order of appearance, each with the slot indices of its species; top = how many slots
// the schedule may name
export function mixKids(f) {
  const mixes = [];
  f.slots.forEach((sl, si) => sl.forEach((o, j) => { if (isMix(o.op)) mixes.push({ si, j, k: Math.round((o.p && o.p.s) || 2) }); }));
  const top = f.slots.length - mixes.reduce((n, m) => n + m.k, 0);
  let next = top;
  return { top, mixes: mixes.map((m) => ({ ...m, kids: Array.from({ length: m.k }, () => next++) })) };
}

export function validate(f) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!f || typeof f !== 'object') return { ok: false, errors: ['not an object'] };
  if (f.v !== undefined && f.v !== 1) err(`unsupported version ${f.v}`);
  if (!Number.isInteger(f.seed)) err('seed must be an integer');
  if (!Number.isInteger(f.iters) || f.iters < 1 || f.iters > MAX_ITERS) err(`iters must be 1..${MAX_ITERS}`);
  if (!(typeof f.bail === 'number' && f.bail > 0 && Number.isFinite(f.bail))) err('bail must be a positive number');
  if (f.c !== undefined && !(Array.isArray(f.c) && (f.c.length === 3 || f.c.length === 4) && f.c.every(Number.isFinite))) err('c must be three or four finite numbers');
  if (f.shade !== undefined) errors.push(...validateShade(f.shade, f.drive || null));
  if (f.drive !== undefined && Array.isArray(f.slots)) errors.push(...validateDrive(f.drive, f));
  if (f.sub !== undefined && Array.isArray(f.slots)) errors.push(...validateSub(f));
  if (f.slice !== undefined && !(f.slice && Number.isFinite(f.slice.w || 0) && Array.isArray(f.slice.tilt || [0, 0, 0]) && (f.slice.tilt || [0, 0, 0]).length === 3 && (f.slice.tilt || [0, 0, 0]).every(Number.isFinite))) err('slice must be { w, tilt: [xw, yw, zw] }');
  if (!Array.isArray(f.slots) || f.slots.length < 1 || f.slots.length > MAX_SLOTS) err(`slots must hold 1..${MAX_SLOTS} op lists`);
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
          if (q.discrete && !Number.isInteger(v)) err(`${def.name}.${q.k} must be a whole number`);
          if (q.min !== undefined && v < q.min) err(`${def.name}.${q.k} below ${q.min}`);
          if (q.max !== undefined && v > q.max) err(`${def.name}.${q.k} above ${q.max}`);
        }
        for (const k of Object.keys(o.p || {})) if (!def.params.some((q) => q.k === k)) err(`${def.name} has no parameter ${k}`);
      });
    });
    if (count > MAX_OPS) err(`more than ${MAX_OPS} ops`);
    const { top, mixes } = mixKids(f);
    if (top < 1) err('every mix needs a slot of its own per species, after the scheduled ones');
    else for (const m of mixes) if (m.si >= top) err('a mix cannot sit inside another mix');
    if (typeof f.schedule !== 'string' || !/^[A-H]+$/.test(f.schedule)) err('schedule must be a word of A–H');
    else for (const ch of f.schedule) if (slotIndex(ch) >= Math.max(top, 0)) err(`schedule names slot ${ch} which does not exist`);
  }
  return { ok: errors.length === 0, errors };
}

// A formula can run on the pull engine only if every op keeps the distance estimate honest.
export function pullSafe(f) {
  return f.slots.every((s) => s.every((o) => { const d = getOp(o.op); return d && d.wRule !== 'none'; }));
}

// the op a formula's estimate reads at the end of the orbit (core/ops.js), null for r/dr and escape time
export function seedOf(f) {
  for (const s of f.slots) for (const o of s) { const d = getOp(o.op); if (d && d.seed) return o; }
  return null;
}
// A seed in a chimera's species speaks only where that species leads the orbit (a tissue's other cells
// keep r/dr: a slab read at a Mandelbox's last point draws sheets through it). The leading species ÷
// (k − 1), the reading the orbit ends with; −1 for a seed outside any chimera
export function seedSpecies(f) {
  const sd = seedOf(f);
  if (!sd) return -1;
  for (const m of mixKids(f).mixes) for (const [i, slot] of m.kids.entries()) if (f.slots[slot] && f.slots[slot].includes(sd)) return i / Math.max(m.k - 1, 1);
  return -1;
}
// where push's walks start
export const spawnRadius = (f) => (seedOf(f) ? 3 : 1);

export function canonical(f) {
  const g = normalize(f);
  return JSON.stringify({
    v: g.v, seed: g.seed, iters: g.iters, schedule: g.schedule, bail: g.bail, ...(g.c ? { c: g.c } : {}), ...(g.slice ? { slice: g.slice } : {}), ...(g.shade ? { shade: g.shade } : {}), ...(g.drive ? { drive: g.drive } : {}), ...(g.sub ? { sub: g.sub } : {}),
    slots: g.slots.map((s) => s.map((o) => ({ op: o.op, p: Object.fromEntries(getOp(o.op).params.map((q) => [q.k, o.p[q.k]])) }))),
  });
}

// cyrb53: a 53-bit string hash, printed as 14 hex digits — a formula's id is that of its canonical JSON
export const hash = (f) => hashString(canonical(f));
export function hashString(str) {
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
