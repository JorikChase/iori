// The one-line notation. Text, JSON, cards and the URL are four views of one formula.
//
//   fold.box 1 · fold.sphere .5 1 · scale 2 · +c ×12
//   abs · fold.plane 1 1 0 · scale 2 · + -1 -1 -1 | bulb 8 · +c ×20 AAB  seed=7 bail=8
//
//   op       name followed by positional numbers, or key=value
//   ·  ;  ⏎  separate ops           |  separates slots (A, B, C, D in order)
//   [A ‖ B] w k nx ny nz nw r   the chimera: two op lists blended inside the iteration (‖ or ||),
//            the weight's field after the bracket (see ops.js mix); its sub-stacks become slots after
//            the scheduled ones, in order of appearance
//   ×N or xN iterations, optionally followed by the schedule, a word of slot letters repeated
//   seed=N   bail=R   c=x,y,z[,w] (a fixed constant: the Julia set)
//   slice=w,xw,yw,zw (where the world sits in 4-D: the offset along w and the tilt into it, degrees)
//                                                                                  anywhere
//
// parse(text) → formula JSON (see formula.js); format(formula) → text. Both are exact inverses on
// normalised formulas.

import { getOp, fillParams } from './ops.js';

const SLOT_LETTERS = 'ABCD';

export function tokenize(text) {
  return text
    .replace(/[·;\n]/g, ' · ')
    .replace(/\|\||‖/g, ' ‖ ')
    .replace(/\|/g, ' | ')
    .replace(/\[/g, ' [ ')
    .replace(/\]/g, ' ] ')
    .replace(/×/g, ' ×')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

const isNumber = (t) => /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t);

export function parse(text) {
  const tokens = tokenize(text);
  const f = { v: 1, seed: 0, iters: 12, schedule: 'A', bail: 4, slots: [[]] };
  let slot = f.slots[0];
  let cur = null;
  let tail = false;
  let open = null;   // the chimera being read: { outer, kids: [[…], […]] }
  const kids = [];   // sub-stacks in order of appearance; slots after the scheduled ones at the end

  const closeOp = () => { cur = null; };

  for (const t of tokens) {
    if (t === '·') { closeOp(); continue; }
    if (t === '[') {
      if (open) throw new Error('a mix cannot sit inside another mix');
      closeOp(); open = { outer: slot, kids: [[]] }; slot = open.kids[0]; continue;
    }
    if (t === '‖') {
      if (!open || open.kids.length > 1) throw new Error('‖ belongs between the two halves of [ … ]');
      closeOp(); open.kids.push([]); slot = open.kids[1]; continue;
    }
    if (t === ']') {
      if (!open || open.kids.length !== 2) throw new Error('a mix needs [ A ‖ B ]');
      slot = open.outer;
      const def = getOp('mix');
      cur = { def, p: {}, n: 0 };
      slot.push({ op: 'mix', p: cur.p });
      kids.push(...open.kids);
      open = null;
      continue;
    }
    if (t === '|') { if (open) throw new Error('| inside [ … ]'); closeOp(); slot = []; f.slots.push(slot); continue; }
    let m;
    if ((m = t.match(/^(?:×|x)(\d+)$/))) { closeOp(); f.iters = parseInt(m[1], 10); tail = true; continue; }
    if ((m = t.match(/^seed=(-?\d+)$/))) { f.seed = parseInt(m[1], 10); continue; }
    if ((m = t.match(/^bail=([\d.e+-]+)$/i))) { f.bail = parseFloat(m[1]); continue; }
    if ((m = t.match(/^c=([-+\d.e]+),([-+\d.e]+),([-+\d.e]+)(?:,([-+\d.e]+))?$/i))) { f.c = [m[1], m[2], m[3], m[4] || '0'].map(parseFloat); continue; }
    if ((m = t.match(/^slice=([-+\d.e]+),([-+\d.e]+),([-+\d.e]+),([-+\d.e]+)$/i))) { f.slice = { w: parseFloat(m[1]), tilt: [m[2], m[3], m[4]].map(parseFloat) }; continue; }
    if (tail && /^[A-D]+$/.test(t)) { f.schedule = t; continue; }
    if (cur && isNumber(t)) {
      const q = cur.def.params[cur.n++];
      if (!q) throw new Error(`too many values for ${cur.def.name}`);
      cur.p[q.k] = parseFloat(t);
      continue;
    }
    if (cur && (m = t.match(/^([a-z]+)=([-+\d.e]+)$/i))) {
      if (!cur.def.params.some((q) => q.k === m[1])) throw new Error(`${cur.def.name} has no parameter ${m[1]}`);
      cur.p[m[1]] = parseFloat(m[2]);
      continue;
    }
    const def = getOp(t);
    if (!def) throw new Error(`unknown op "${t}"`);
    cur = { def, p: {}, n: 0 };
    slot.push({ op: def.name, p: cur.p });
  }
  if (open) throw new Error('unclosed [');
  f.slots.push(...kids);
  if (f.slots.some((s) => s.length === 0)) throw new Error('empty slot');
  for (const s of f.slots) for (const o of s) o.p = fillParams(getOp(o.op), o.p);
  return f;
}

export function fmtNum(x) {
  if (Number.isInteger(x)) return String(x);
  let s = Number(x.toPrecision(6)).toString();
  if (s.startsWith('0.')) s = s.slice(1);
  else if (s.startsWith('-0.')) s = '-' + s.slice(2);
  return s;
}

export function formatOp(o) {
  const def = getOp(o.op);
  const vals = def.params.map((q) => (o.p[q.k] === undefined ? q.d : o.p[q.k]));
  // trailing defaults are left out
  let n = vals.length;
  while (n > 0 && vals[n - 1] === def.params[n - 1].d) n--;
  return [def.name, ...vals.slice(0, n).map(fmtNum)].join(' ');
}

export function format(f) {
  // the chimeras' sub-stacks are written inside their brackets, not as slots
  let mixes = 0;
  for (const s of f.slots) for (const o of s) if (o.op === 'mix') mixes++;
  const top = f.slots.length - 2 * mixes;
  let next = top;
  const list = (s) => s.map((o) => {
    if (o.op !== 'mix') return formatOp(o);
    const a = f.slots[next++], b = f.slots[next++];
    return `[${list(a)} ‖ ${list(b)}]${formatOp(o).slice(3)}`;
  }).join(' · ');
  const slots = f.slots.slice(0, top).map(list).join(' | ');
  let tail = `×${f.iters}`;
  if (f.schedule && f.schedule !== 'A') tail += ` ${f.schedule}`;
  if (f.seed) tail += ` seed=${f.seed}`;
  if (f.bail !== undefined && f.bail !== 4) tail += ` bail=${fmtNum(f.bail)}`;
  if (f.c) tail += ` c=${(f.c[3] ? f.c : f.c.slice(0, 3)).map(fmtNum).join(',')}`;
  if (f.slice && (f.slice.w || f.slice.tilt.some(Boolean))) tail += ` slice=${[f.slice.w, ...f.slice.tilt].map(fmtNum).join(',')}`;
  return `${slots} ${tail}`;
}

export const slotIndex = (letter) => SLOT_LETTERS.indexOf(letter);
export const slotLetter = (i) => SLOT_LETTERS[i];
