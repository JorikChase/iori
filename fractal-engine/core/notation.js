// The one-line notation. Text, JSON, cards and the URL are four views of one formula.
//
//   fold.box 1 · fold.sphere .5 1 · scale 2 · +c ×12
//   abs · fold.plane 1 1 0 · scale 2 · + -1 -1 -1 | bulb 8 · +c ×20 AAB  seed=7 bail=8
//
//   op       name followed by positional numbers, or key=value
//   ·  ;  ⏎  separate ops           |  separates slots (A, B, C … H in order)
//   [A ‖ B ‖ …] field …   the chimera: two to seven op lists blended inside the iteration (‖ or ||),
//            the field after the bracket — a bare number is the constant w, or a field word and its
//            values: axis, sphere, noise, tissue, trap, depth, lyap, blend (ops.js mix.*). The sub-stacks
//            become slots after the scheduled ones, in order of appearance
//   a( … )   a subgraph (core/sub.js): the first use holds its ops, a value written ^2 is one each use
//            keeps for itself; a later use holds only those values, a( 2.5 ), and copies the rest
//   ×N or xN iterations, optionally followed by the schedule, a word of slot letters repeated
//   seed=N   bail=R   c=x,y,z[,w] (a fixed constant: the Julia set)
//   shade=…  the shading graph (core/shade.js) as base64url of its canonical JSON
//   drive=…  the drivers (core/drive.js), the same way
//   slice=w,xw,yw,zw (where the world sits in 4-D: the offset along w and the tilt into it, degrees)
//                                                                                  anywhere
//
// parse(text) → formula JSON (see formula.js); format(formula) → text. Both are exact inverses on
// normalised formulas.

import { getOp, fillParams, isMix } from './ops.js';
import { normShade } from './shade.js';
import { normDrive } from './drive.js';

// the shading graph rides in the notation as base64url of its canonical JSON (DESIGN.md Shading)
const b64url = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

const SLOT_LETTERS = 'ABCDEFGH';
const FIELD_WORDS = new Set(['axis', 'sphere', 'noise', 'tissue', 'trap', 'depth', 'lyap', 'blend']);

export function tokenize(text) {
  return text
    .replace(/[·;\n]/g, ' · ')
    .replace(/\|\||‖/g, ' ‖ ')
    .replace(/\|/g, ' | ')
    .replace(/\[/g, ' [ ')
    .replace(/\]/g, ' ] ')
    .replace(/\(/g, ' ( ')
    .replace(/\)/g, ' ) ')
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
  let open = null;   // the chimera being read: { outer, kids: [[…], […], …] }
  let field = null;  // a chimera just closed: the next word may name its field
  const kids = [];   // sub-stacks in order of appearance; slots after the scheduled ones at the end
  const subs = new Map();  // the subgraphs by letter: { id, run, own: [[op, key], …], uses: [{ slot, at }] }
  const kidsOf = new Map();  // a chimera → its sub-stacks (which are not slots yet)
  const prefix = new Map();  // a sub-stack → the path its ops' ids start with
  let use = null;    // the subgraph being read: { s, slot, at, values: a later use's numbers | null }
  const closeOp = () => { cur = null; };
  const copyOp = (o, map) => {
    const c = { op: o.op, p: { ...o.p } };
    map.set(o, c);
    if (kidsOf.has(o)) {
      if (open) throw new Error('a mix cannot sit inside another mix');
      const kk = kidsOf.get(o).map((k) => k.map((q) => copyOp(q, map)));
      kidsOf.set(c, kk);
      kk.forEach((k, s) => prefix.set(k, { mix: c, s }));
      kids.push(...kk);
    }
    return c;
  };
  const endUse = () => {
    const { s, slot: at, index, values } = use;
    if (!s.run) {
      s.run = at.slice(index);
      if (!s.run.length) throw new Error(`subgraph ${s.id} is empty`);
    } else {
      if (values.length > s.own.length) throw new Error(`too many values for ${s.id}`);
      const map = new Map();
      s.run.forEach((o) => at.push(copyOp(o, map)));
      s.own.forEach(([o, key], i) => { if (values[i] !== undefined) map.get(o).p[key] = values[i]; });
    }
    s.uses.push({ slot: at, index });
    use = null; closeOp();
  };

  for (let ti = 0; ti < tokens.length; ti++) {
    const t = tokens[ti];
    if (t === '·') { closeOp(); continue; }
    if (t === ')') {
      if (!use) throw new Error(') without (');
      endUse();
      continue;
    }
    if (tokens[ti + 1] === '(' && /^[a-z]$/.test(t)) {
      if (use) throw new Error('a subgraph cannot sit inside a subgraph');
      closeOp();
      if (!subs.has(t)) subs.set(t, { id: t, run: null, own: [], uses: [] });
      const s = subs.get(t);
      use = { s, slot, index: slot.length, values: s.run ? [] : null };
      ti++;
      continue;
    }
    if (use && use.values) {
      if (!isNumber(t)) throw new Error(`a later use of ${use.s.id} holds only its values`);
      use.values.push(parseFloat(t));
      continue;
    }
    if (t === '[') {
      if (open) throw new Error('a mix cannot sit inside another mix');
      closeOp(); open = { outer: slot, kids: [[]] }; slot = open.kids[0]; continue;
    }
    if (t === '‖') {
      if (!open) throw new Error('‖ belongs between the species of [ … ]');
      if (open.kids.length >= 7) throw new Error('a mix holds at most seven species');
      closeOp(); open.kids.push([]); slot = open.kids[open.kids.length - 1]; continue;
    }
    if (t === ']') {
      if (!open || open.kids.length < 2) throw new Error('a mix needs [ A ‖ B ]');
      slot = open.outer;
      cur = { def: getOp('mix'), p: { s: open.kids.length }, n: 0 };
      field = { op: 'mix', p: cur.p };
      cur.o = field;
      slot.push(field);
      kidsOf.set(field, open.kids);
      open.kids.forEach((k, s) => prefix.set(k, { mix: field, s }));
      kids.push(...open.kids);
      open = null;
      continue;
    }
    if (field && FIELD_WORDS.has(t)) {
      field.op = 'mix.' + t;
      cur.def = getOp(field.op);
      field = null;
      continue;
    }
    field = null;
    if (t === '|') { if (open || use) throw new Error('| inside [ … ] or ( … )'); closeOp(); slot = []; f.slots.push(slot); continue; }
    let m;
    if ((m = t.match(/^(?:×|x)(\d+)$/))) { closeOp(); f.iters = parseInt(m[1], 10); tail = true; continue; }
    if ((m = t.match(/^seed=(-?\d+)$/))) { f.seed = parseInt(m[1], 10); continue; }
    if ((m = t.match(/^bail=([\d.e+-]+)$/i))) { f.bail = parseFloat(m[1]); continue; }
    if ((m = t.match(/^c=([-+\d.e]+),([-+\d.e]+),([-+\d.e]+)(?:,([-+\d.e]+))?$/i))) { f.c = [m[1], m[2], m[3], m[4] || '0'].map(parseFloat); continue; }
    if ((m = t.match(/^shade=([A-Za-z0-9_-]+)$/))) { f.shade = JSON.parse(unb64url(m[1])); continue; }
    if ((m = t.match(/^drive=([A-Za-z0-9_-]+)$/))) { f.drive = JSON.parse(unb64url(m[1])); continue; }
    if ((m = t.match(/^slice=([-+\d.e]+),([-+\d.e]+),([-+\d.e]+),([-+\d.e]+)$/i))) { f.slice = { w: parseFloat(m[1]), tilt: [m[2], m[3], m[4]].map(parseFloat) }; continue; }
    if (tail && /^[A-D]+$/.test(t)) { f.schedule = t; continue; }
    if (cur && t[0] === '^' && isNumber(t.slice(1))) {
      if (!use) throw new Error('^ marks a value inside a subgraph');
      const q = cur.def.params.filter((x) => !x.hidden)[cur.n++];
      if (!q) throw new Error(`too many values for ${cur.def.name}`);
      cur.p[q.k] = parseFloat(t.slice(1));
      use.s.own.push([cur.o, q.k]);
      continue;
    }
    if (cur && isNumber(t)) {
      const q = cur.def.params.filter((x) => !x.hidden)[cur.n++];
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
    cur = { def, p: {}, n: 0, o: { op: def.name, p: {} } };
    cur.p = cur.o.p;
    slot.push(cur.o);
  }
  if (open) throw new Error('unclosed [');
  if (use) throw new Error('unclosed (');
  const tops = f.slots.slice();
  f.slots.push(...kids);
  if (f.slots.some((s) => s.length === 0)) throw new Error('empty slot');
  for (const s of f.slots) for (const o of s) o.p = fillParams(getOp(o.op), o.p);
  if (subs.size) f.sub = [...subs.values()].map((s) => subOf(s, tops, prefix, kidsOf));
  return f;
}

// a parsed subgraph as formula.sub (core/sub.js): the ids of its uses, its exposed numbers relative to the run
function subOf(s, tops, prefix, kidsOf) {
  const place = (slot, i) => {
    const si = tops.indexOf(slot);
    if (si >= 0) return `${SLOT_LETTERS[si]}${i}`;
    const { mix, s: sp } = prefix.get(slot);
    return `${place(tops.find((t) => t.includes(mix)), tops.find((t) => t.includes(mix)).indexOf(mix))}.${sp}.${i}`;
  };
  const rel = (o) => {
    for (const [m, q] of s.run.entries()) {
      if (q === o) return String(m);
      for (const [sp, k] of (kidsOf.get(q) || []).entries()) if (k.includes(o)) return `${m}.${sp}.${k.indexOf(o)}`;
    }
    return null;
  };
  return { id: s.id, n: s.run.length, uses: s.uses.map((u) => place(u.slot, u.index)), expose: s.own.map(([o, key]) => `${rel(o)}.${key}`) };
}

export function fmtNum(x) {
  if (Number.isInteger(x)) return String(x);
  let s = Number(x.toPrecision(6)).toString();
  if (s.startsWith('0.')) s = s.slice(1);
  else if (s.startsWith('-0.')) s = '-' + s.slice(2);
  return s;
}

// own: the parameters a subgraph's uses keep for themselves, written ^2
export function formatOp(o, own = null) {
  const def = getOp(o.op);
  const shown = def.params.filter((q) => !q.hidden);
  const vals = shown.map((q) => (o.p[q.k] === undefined ? q.d : o.p[q.k]));
  // trailing defaults are left out
  let n = vals.length;
  while (n > 0 && vals[n - 1] === shown[n - 1].d && !(own && own.has(shown[n - 1].k))) n--;
  return [def.name, ...vals.slice(0, n).map((v, i) => (own && own.has(shown[i].k) ? '^' : '') + fmtNum(v))].join(' ');
}

export function format(f) {
  // the chimeras' sub-stacks are written inside their brackets, not as slots
  let kidSlots = 0;
  for (const s of f.slots) for (const o of s) if (isMix(o.op)) kidSlots += Math.round(o.p.s || 2);
  const top = f.slots.length - kidSlots;
  let next = top;
  // the first op of each use, by its path id
  const starts = new Map();
  for (const s of f.sub || []) s.uses.forEach((at, u) => starts.set(at, { s, u }));
  // own: the parameters to mark, for an op at this rel path of a first use
  const ownAt = (s, rel) => (s ? new Set(s.expose.filter((e) => e.slice(0, e.lastIndexOf('.')) === rel).map((e) => e.slice(e.lastIndexOf('.') + 1))) : null);
  const one = (o, id, s, rel) => {
    if (!isMix(o.op)) return formatOp(o, ownAt(s, rel));
    const kids = Array.from({ length: Math.round(o.p.s || 2) }, (_, sp) => list(f.slots[next++], `${id}.${sp}.`, s, s ? `${rel}.${sp}` : null));
    // 'mix.tissue 6 …' is written '] tissue 6 …'; the constant 'mix .3' as '] .3'
    const field = formatOp(o, ownAt(s, rel)).replace(/^mix\.?/, '');
    return `[${kids.join(' ‖ ')}]${field ? ' ' + field.trim() : ''}`;
  };
  // pre: what this chain's ids start with. Inside a run (s, rel) every op is a member or a member's own
  function list(ops, pre, s = null, rel = null) {
    const out = [];
    for (let j = 0; j < ops.length; j++) {
      const hit = !s && starts.get(`${pre}${j}`);
      if (s) { out.push(one(ops[j], `${pre}${j}`, s, `${rel}.${j}`)); continue; }
      if (!hit) { out.push(one(ops[j], `${pre}${j}`, null, null)); continue; }
      const run = ops.slice(j, j + hit.s.n);
      if (hit.u === 0) out.push(`${hit.s.id}( ${run.map((o, m) => one(o, `${pre}${j + m}`, hit.s, String(m))).join(' · ')} )`);
      else {
        // a later use writes its own numbers, and skips its chimeras' sub-stacks
        run.forEach((o) => { if (isMix(o.op)) next += Math.round(o.p.s || 2); });
        const vals = hit.s.expose.map((e) => {
          const a = e.split('.'), key = a.pop(), m = run[+a[0]];
          if (a.length === 1) return m.p[key];
          return laterKid(ops, j + +a[0], +a[1], +a[2], key);
        });
        out.push(`${hit.s.id}( ${vals.map(fmtNum).join(' ')}${vals.length ? ' ' : ''})`);
      }
      j += hit.s.n - 1;
    }
    return out.join(' · ');
  }
  // a number inside a later use's chimera: its species were skipped, so find them by counting
  function laterKid(ops, mj, sp, i, key) {
    const { mixes } = mixesOf(f);
    const m = mixes.find((q) => f.slots[q.si][q.j] === ops[mj]);
    return f.slots[m.kids[sp]][i].p[key];
  }
  const slots = f.slots.slice(0, top).map((s, si) => list(s, SLOT_LETTERS[si])).join(' | ');
  let tail = `×${f.iters}`;
  if (f.schedule && f.schedule !== 'A') tail += ` ${f.schedule}`;
  if (f.seed) tail += ` seed=${f.seed}`;
  if (f.bail !== undefined && f.bail !== 4) tail += ` bail=${fmtNum(f.bail)}`;
  if (f.c) tail += ` c=${(f.c[3] ? f.c : f.c.slice(0, 3)).map(fmtNum).join(',')}`;
  if (f.slice && (f.slice.w || f.slice.tilt.some(Boolean))) tail += ` slice=${[f.slice.w, ...f.slice.tilt].map(fmtNum).join(',')}`;
  if (f.shade) tail += ` shade=${b64url(JSON.stringify(normShade(f.shade)))}`;
  if (f.drive) tail += ` drive=${b64url(JSON.stringify(normDrive(f.drive)))}`;
  return `${slots} ${tail}`;
}

// the mixes with their sub-stacks' slots (formula.js mixKids, which this file may not import in time)
function mixesOf(f) {
  const mixes = [];
  f.slots.forEach((sl, si) => sl.forEach((o, j) => { if (isMix(o.op)) mixes.push({ si, j, k: Math.round(o.p.s || 2) }); }));
  let next = f.slots.length - mixes.reduce((n, m) => n + m.k, 0);
  return { mixes: mixes.map((m) => ({ ...m, kids: Array.from({ length: m.k }, () => next++) })) };
}

export const slotIndex = (letter) => SLOT_LETTERS.indexOf(letter);
export const slotLetter = (i) => SLOT_LETTERS[i];
