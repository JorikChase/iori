// The formula as a graph: the second way to write it, beside the notation. Today's formulas are
// trees — scheduled chains of ops, a chimera forking a chain into species that join at its field —
// so the graph is that tree, with the hooks a general graph (formula v2) will need: every node a
// stable id, every port typed.
//
//   tree(f)      { chains: [{ id: 'A', nodes }], iters, schedule, … }, a mix node holding
//                species: [{ id: 'A2.0', nodes }, …] — the slots after the scheduled ones, put back
//                where they belong
//   flatten(t)   the formula again (exact: flatten(tree(f)) equals f)
//   ports(n)     typed ports: point in, point out, a number per parameter (an int for discrete ones),
//                and on a chimera a point out and in per species and its field's weight
//
// Ids are paths: 'B3' is op 3 of scheduled chain B; 'B3.1' species 1 of the chimera B3; 'B3.1.0' its
// first op. Edits take ids, return a new normalised formula, and throw when the result is not valid.

import { normalize, mixKids, validate } from './formula.js';
import { getOp, fillParams, isMix } from './ops.js';
import { slotLetter } from './notation.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const opNode = (o, id) => ({ id, op: o.op, p: { ...o.p } });

export function tree(formula) {
  const f = normalize(formula);
  const { top, mixes } = mixKids(f);
  const kidsAt = new Map(mixes.map((m) => [`${m.si}.${m.j}`, m.kids]));
  const chains = f.slots.slice(0, top).map((slot, si) => {
    const id = slotLetter(si);
    return {
      id,
      nodes: slot.map((o, j) => {
        const n = opNode(o, `${id}${j}`);
        const kids = kidsAt.get(`${si}.${j}`);
        if (kids) n.species = kids.map((k, s) => ({ id: `${n.id}.${s}`, nodes: f.slots[k].map((q, i) => opNode(q, `${n.id}.${s}.${i}`)) }));
        return n;
      }),
    };
  });
  return { v: f.v, seed: f.seed, iters: f.iters, schedule: f.schedule, bail: f.bail, ...(f.c ? { c: f.c } : {}), ...(f.slice ? { slice: f.slice } : {}), ...(f.shade ? { shade: f.shade } : {}), chains };
}

export function flatten(t) {
  const kids = [];
  const strip = (n) => ({ op: n.op, p: { ...n.p } });
  const slots = t.chains.map((ch) => ch.nodes.map((n) => {
    const o = strip(n);
    if (n.species) { o.p.s = n.species.length; kids.push(...n.species.map((sp) => sp.nodes.map(strip))); }
    return o;
  }));
  const f = { v: t.v, seed: t.seed, iters: t.iters, schedule: t.schedule, bail: t.bail, ...(t.c ? { c: t.c } : {}), ...(t.slice ? { slice: t.slice } : {}), ...(t.shade ? { shade: t.shade } : {}), slots: [...slots, ...kids] };
  return normalize(f);
}

// ---------- typed ports (the formula-v2 hook) --------------------------------------------------------
export function ports(n) {
  const def = getOp(n.op);
  const params = def.params.filter((q) => !q.hidden).map((q) => ({ name: q.k, type: q.discrete ? 'int' : 'number', dir: 'in' }));
  const out = [{ name: 'p', type: 'point', dir: 'in' }, { name: 'p', type: 'point', dir: 'out' }, ...params];
  if (n.species) {
    n.species.forEach((sp, s) => out.push({ name: `out${s}`, type: 'point', dir: 'out' }, { name: `in${s}`, type: 'point', dir: 'in' }));
    out.push({ name: 'weight', type: 'field', dir: 'in' });
  }
  return out;
}

// every node, depth first, with where it sits
export function walk(t, fn) {
  for (const ch of t.chains) ch.nodes.forEach((n, i) => {
    fn(n, ch, i);
    if (n.species) for (const sp of n.species) sp.nodes.forEach((m, j) => fn(m, sp, j, n));
  });
}

// the chain (scheduled, or a species) with this id, and the node with this id
function chainById(t, id) {
  let found = null;
  for (const ch of t.chains) {
    if (ch.id === id) return ch;
    for (const n of ch.nodes) if (n.species) for (const sp of n.species) if (sp.id === id) found = sp;
  }
  return found;
}
function nodeById(t, id) {
  let found = null;
  walk(t, (n, ch, i, parent) => { if (n.id === id) found = { n, ch, i, parent }; });
  return found;
}

const finish = (t) => {
  const f = flatten(t);
  const v = validate(f);
  if (!v.ok) throw new Error(v.errors.join('; '));
  return f;
};
const fresh = (name) => { const def = getOp(name); return { id: '', op: def.name, p: fillParams(def, {}) }; };

// ---------- edits ----------------------------------------------------------------------------------

// a new op of this name at this position of a chain
export function insert(formula, chainId, index, name) {
  const t = tree(formula), ch = chainById(t, chainId);
  if (!ch) throw new Error(`no chain ${chainId}`);
  if (isMix(name)) throw new Error('a chimera is made with fork');
  ch.nodes.splice(Math.max(0, Math.min(index, ch.nodes.length)), 0, fresh(name));
  return finish(t);
}

// remove a node. The last op of a species takes its species with it; a chimera left with one species
// dissolves into it; the last op of a scheduled chain takes the chain with it while others remain.
export function remove(formula, id) {
  const t = tree(formula), at = nodeById(t, id);
  if (!at) throw new Error(`no node ${id}`);
  if (at.n.species) return unwrap(formula, id, 0);
  if (at.ch.nodes.length > 1) { at.ch.nodes.splice(at.i, 1); return finish(t); }
  if (!at.parent && t.chains.length > 1) return removeChain(formula, at.ch.id);
  if (!at.parent) throw new Error('a scheduled chain cannot be emptied');
  const mix = at.parent, s = mix.species.indexOf(at.ch);
  if (mix.species.length > 2) { mix.species.splice(s, 1); return finish(t); }
  return unwrap(formula, mix.id, 1 - s);
}

// move a node to another place in its own kind of chain (scheduled chains among themselves, species
// among species: a chimera cannot sit inside a chimera)
export function move(formula, id, chainId, index) {
  const t = tree(formula), at = nodeById(t, id), to = chainById(t, chainId);
  if (!at || !to) throw new Error('no such node or chain');
  if (at.n.species && !t.chains.includes(to)) throw new Error('a chimera cannot sit inside a chimera');
  if (at.ch.nodes.length === 1) throw new Error('that would empty its chain');
  at.ch.nodes.splice(at.i, 1);
  const i = at.ch === to && index > at.i ? index - 1 : index;
  to.nodes.splice(Math.max(0, Math.min(i, to.nodes.length)), 0, at.n);
  return finish(t);
}

export function setParam(formula, id, key, value) {
  const t = tree(formula), at = nodeById(t, id);
  if (!at) throw new Error(`no node ${id}`);
  const q = getOp(at.n.op).params.find((r) => r.k === key);
  if (!q || q.hidden) throw new Error(`${at.n.op} has no parameter ${key}`);
  let v = q.discrete ? Math.round(value) : value;
  if (q.min !== undefined) v = Math.max(q.min, v);
  if (q.max !== undefined) v = Math.min(q.max, v);
  at.n.p[key] = q.discrete ? v : +v.toPrecision(6);
  return finish(t);
}

// fork at a position of a scheduled chain: the op there becomes the first species and a copy of it the
// second, blended half and half — nothing changes until a species does
export function fork(formula, chainId, index) {
  const t = tree(formula), ch = chainById(t, chainId);
  if (!ch || !t.chains.includes(ch)) throw new Error('a chimera forks a scheduled chain');
  const i = Math.max(0, Math.min(index, ch.nodes.length - 1));
  const target = ch.nodes[i];
  const species = target && !target.species ? [[target], [clone(target)]] : [[fresh('translate')], [fresh('translate')]];
  const mix = { ...fresh('mix'), species: species.map((nodes) => ({ id: '', nodes })) };
  if (target && !target.species) ch.nodes.splice(i, 1, mix); else ch.nodes.splice(i, 0, mix);
  return finish(t);
}

// another species: a copy of the last
export function addSpecies(formula, mixId) {
  const t = tree(formula), at = nodeById(t, mixId);
  if (!at || !at.n.species) throw new Error(`${mixId} is not a chimera`);
  if (at.n.species.length >= 7) throw new Error('a chimera holds at most seven species');
  at.n.species.push(clone(at.n.species.at(-1)));
  return finish(t);
}

// another field kind for a chimera; parameters both kinds have are kept
export function setField(formula, mixId, name) {
  const t = tree(formula), at = nodeById(t, mixId);
  if (!at || !at.n.species) throw new Error(`${mixId} is not a chimera`);
  const def = getOp(name);
  if (!def || !isMix(def.name)) throw new Error(`${name} is not a field`);
  at.n.op = def.name;
  at.n.p = fillParams(def, Object.fromEntries(Object.entries(at.n.p).filter(([k]) => def.params.some((q) => q.k === k))));
  return finish(t);
}

// a chimera replaced by one of its species, inline
export function unwrap(formula, mixId, keep = 0) {
  const t = tree(formula), at = nodeById(t, mixId);
  if (!at || !at.n.species) throw new Error(`${mixId} is not a chimera`);
  at.ch.nodes.splice(at.i, 1, ...at.n.species[keep].nodes);
  return finish(t);
}

export function setIters(formula, n) {
  const t = tree(formula);
  t.iters = Math.max(1, Math.min(4096, Math.round(n)));
  return finish(t);
}

// the formula without one node, for its thumbnail: what that node contributes. A chimera without its
// field is its first species; an op that is all its chain has is left in (nothing to compare)
export function bypass(formula, id) {
  const t = tree(formula), at = nodeById(t, id);
  if (!at) return null;
  try {
    if (at.n.species) return unwrap(formula, id, 0);
    if (at.ch.nodes.length > 1) { at.ch.nodes.splice(at.i, 1); return finish(t); }
    return at.parent ? remove(formula, id) : null;
  } catch { return null; }
}

// ---------- chains and the schedule ---------------------------------------------------------------
const LETTERS = 'ABCDEFGH';
const slotsUsed = (t) => t.chains.reduce((n, ch) => n + 1 + ch.nodes.reduce((m, q) => m + (q.species ? q.species.length : 0), 0), 0);

// another scheduled chain: a copy of the last, its letter appended to the schedule — so the orbit is
// the same until the copy changes (A then a copy of A is A twice)
export function addChain(formula) {
  const t = tree(formula);
  if (slotsUsed(t) + 1 + t.chains.at(-1).nodes.reduce((m, q) => m + (q.species ? q.species.length : 0), 0) > 8) throw new Error('no room for another chain (eight slots)');
  t.chains.push(clone(t.chains.at(-1)));
  t.schedule += LETTERS[t.chains.length - 1];
  return finish(t);
}

// a scheduled chain removed: its letter leaves the schedule, the letters after it move down
export function removeChain(formula, chainId) {
  const t = tree(formula), k = t.chains.findIndex((c) => c.id === chainId);
  if (k < 0) throw new Error(`no chain ${chainId}`);
  if (t.chains.length < 2) throw new Error('the last chain stays');
  t.chains.splice(k, 1);
  const word = [...t.schedule].filter((ch) => LETTERS.indexOf(ch) !== k).map((ch) => (LETTERS.indexOf(ch) > k ? LETTERS[LETTERS.indexOf(ch) - 1] : ch)).join('');
  t.schedule = word || 'A';
  return finish(t);
}

// the schedule word: letters of existing chains, 1–64 of them
export function setSchedule(formula, word) {
  const t = tree(formula);
  const w = String(word).toUpperCase();
  if (!/^[A-H]{1,64}$/.test(w)) throw new Error('a schedule is a word of chain letters');
  for (const ch of w) if (LETTERS.indexOf(ch) >= t.chains.length) throw new Error(`no chain ${ch}`);
  t.schedule = w;
  return finish(t);
}
