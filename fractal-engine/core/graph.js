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
// The drivers (core/drive.js) name parameters by these ids; every edit carries them along — a moved op
// keeps its bindings, a copied one gets copies, a removed one takes its own away.
//
// A subgraph (core/sub.js) is a run of these nodes in several places. An edit inside any use reaches them
// all: finish() takes the use that changed as the new run and rebuilds the others from it, keeping what
// each holds for itself.

import { normalize, mixKids, validate } from './formula.js';
import { getOp, fillParams, isMix } from './ops.js';
import { slotLetter } from './notation.js';
import { remapDrive, normDrive, splitTarget, targetParam, opPaths, emptyDrive } from './drive.js';
import { dropDriverRefs } from './shade.js';
import { useParts, memberId, useOf, peerId, relParts } from './sub.js';

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
  const t = { v: f.v, seed: f.seed, iters: f.iters, schedule: f.schedule, bail: f.bail, ...(f.c ? { c: f.c } : {}), ...(f.slice ? { slice: f.slice } : {}), ...(f.shade ? { shade: f.shade } : {}), ...(f.drive ? { drive: f.drive } : {}), ...(f.sub ? { sub: clone(f.sub) } : {}), chains };
  if (t.sub) tagUses(t);
  // the parameters as they were, for a param driver whose op an edit removes
  if (f.drive) Object.defineProperty(t, 'was', { value: opPaths(f) });
  return t;
}

export function flatten(t) {
  const kids = [];
  const strip = (n) => ({ op: n.op, p: { ...n.p } });
  const slots = t.chains.map((ch) => ch.nodes.map((n) => {
    const o = strip(n);
    if (n.species) { o.p.s = n.species.length; kids.push(...n.species.map((sp) => sp.nodes.map(strip))); }
    return o;
  }));
  const f = { v: t.v, seed: t.seed, iters: t.iters, schedule: t.schedule, bail: t.bail, ...(t.c ? { c: t.c } : {}), ...(t.slice ? { slice: t.slice } : {}), ...(t.shade ? { shade: t.shade } : {}), ...(t.drive ? { drive: t.drive } : {}), ...(t.sub ? { sub: t.sub } : {}), slots: [...slots, ...kids] };
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

// the ids the nodes had when the tree was made (fresh ones have none) → their ids now
function idMap(t, f) {
  const old = [], now = [], ids = new Map();
  walk(t, (n) => old.push(n.id));
  walk(tree({ ...f, drive: undefined }), (n) => now.push(n.id));
  old.forEach((id, i) => { if (id) ids.set(id, [...(ids.get(id) || []), now[i]]); });
  return ids;
}

// ---------- subgraphs: the uses through an edit ---------------------------------------------------------
// which node is which member of which use: survives splices, not copies (a copy is a plain op)
const tags = new WeakMap();
const shape = (nodes) => JSON.stringify(nodes.map((n) => [n.op, (n.species || []).map((sp) => shape(sp.nodes))]));

function tagUses(t) {
  const sigs = new Map();
  for (const s of t.sub) s.uses.forEach((at, u) => {
    const { chain, index } = useParts(at), ch = chainById(t, chain);
    if (!ch) return;
    const run = ch.nodes.slice(index, index + s.n);
    run.forEach((n, m) => tags.set(n, { id: s.id, u, m }));
    if (u === 0) sigs.set(s.id, shape(run));
  });
  Object.defineProperty(t, 'sigs', { value: sigs });
}

// a replacement takes the place of the member it replaces (a chimera over an op, a species over a chimera)
function retag(from, to) {
  const g = tags.get(from);
  if (!g) return;
  tags.delete(from);
  to.forEach((n, i) => tags.set(n, i ? { ...g, m: -1 } : g));
}

// where each use is now: from its first surviving member to its last, in the chain most of them are in
function runsOf(t, s) {
  const seen = new Map();
  walk(t, (n, ch, i) => {
    const g = tags.get(n);
    if (!g || g.id !== s.id) return;
    if (!seen.has(g.u)) seen.set(g.u, new Map());
    const at = seen.get(g.u);
    if (!at.has(ch)) at.set(ch, []);
    at.get(ch).push(i);
  });
  return [...seen].sort((a, b) => a[0] - b[0]).map(([u, at]) => {
    const [ch, idx] = [...at].sort((a, b) => b[1].length - a[1].length)[0];
    const start = Math.min(...idx);
    return { u, ch, start, nodes: ch.nodes.slice(start, Math.max(...idx) + 1) };
  });
}

// a copy of the run for another use: ids of the nodes it replaces (so bindings stay with their use),
// each exposed number that use's own
function rebuilt(src, old, s) {
  const was = new Map(old.nodes.map((n) => [tags.get(n) ? tags.get(n).m : -2, n]));
  return src.nodes.map((n) => {
    const g = tags.get(n), o = g ? was.get(g.m) : null, c = clone(n);
    c.id = o ? o.id : '';
    const copy = (a, b, rel) => {
      for (const e of s.expose) { const r = relParts(e); if (r.path === rel && b && r.key in b.p && a.op === b.op) a.p[r.key] = b.p[r.key]; }
    };
    if (o) copy(c, o, String(g.m));
    (c.species || []).forEach((sp, k) => sp.nodes.forEach((m, j) => {
      const q = o && o.species && o.species[k] && o.species[k].nodes[j];
      m.id = q ? q.id : '';
      if (o) copy(m, q, `${g.m}.${k}.${j}`);
    }));
    if (!o && c.species) c.species.forEach((sp) => { sp.id = ''; });
    return c;
  });
}

// every subgraph after an edit: the use that changed is the new run, the others follow. What was exposed
// follows its member. The ids of the uses come out of walking the finished formula.
function relink(t) {
  const out = [];
  for (const s of t.sub) {
    let runs = runsOf(t, s);
    if (!runs.length) continue;
    const src = runs.find((r) => shape(r.nodes) !== t.sigs.get(s.id));
    if (src) {
      const members = new Map();
      src.nodes.forEach((n, i) => { const g = tags.get(n); if (g && g.m >= 0) members.set(g.m, i); });
      for (const r of runs) {
        if (r === src) continue;
        const now = rebuilt(src, r, s);
        r.ch.nodes.splice(r.start, r.nodes.length, ...now);
        r.nodes = now;
      }
      s.expose = s.expose.flatMap((e) => { const a = e.split('.'), m = members.get(+a[0]); return m === undefined ? [] : [[m, ...a.slice(1)].join('.')]; });
      s.n = src.nodes.length;
      runs = runs.map((r) => ({ ...r, start: r.ch.nodes.indexOf(r.nodes[0]) }));
    }
    out.push({ s, firsts: runs.map((r) => r.nodes[0]) });
  }
  return out;
}

const finish = (t) => {
  const kept = t.sub ? relink(t) : null;
  let f = flatten({ ...t, sub: undefined });
  if (kept) {
    const at = new Map();
    const nodes = [], now = [];
    walk(t, (n) => nodes.push(n));
    walk(tree({ ...f, drive: undefined }), (n) => now.push(n.id));
    nodes.forEach((n, i) => at.set(n, now[i]));
    f = normalize({ ...f, sub: kept.map(({ s, firsts }) => ({ ...s, uses: firsts.map((n) => at.get(n)) })) });
  }
  if (t.drive) {
    const was = (to) => { const { path, key } = splitTarget(to), o = t.was && t.was.get(path); return o ? o.p[key] : 0; };
    f = normalize({ ...f, drive: remapDrive(t.drive, idMap(t, f), f, was) });
  }
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
  // a shared number is every use's
  const u = useOf(t, id);
  if (u && !u.sub.expose.includes(`${u.rel}.${key}`)) for (const other of u.sub.uses) { const m = nodeById(t, peerId(u.sub, other, u.rel)); if (m) m.n.p[key] = at.n.p[key]; }
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
  if (target && !target.species) { retag(target, [mix]); ch.nodes.splice(i, 1, mix); } else ch.nodes.splice(i, 0, mix);
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
  retag(at.n, at.n.species[keep].nodes);
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

// ---------- subgraphs (core/sub.js) ---------------------------------------------------------------
const nextLetter = (t) => [...'abcdefghijklmnopqrstuvwxyz'].find((c) => !(t.sub || []).some((s) => s.id === c));

// a run of a chain (from..to, inclusive) becomes a subgraph with one use. Nothing else changes
export function wrap(formula, chainId, from, to) {
  const t = tree(formula), ch = chainById(t, chainId);
  if (!ch) throw new Error(`no chain ${chainId}`);
  if (from < 0 || to >= ch.nodes.length || from > to) throw new Error('no such run');
  const run = ch.nodes.slice(from, to + 1);
  if (run.some((n) => tags.has(n))) throw new Error('a subgraph cannot sit inside a subgraph');
  const id = nextLetter(t);
  if (!id) throw new Error('no letter left');
  if (!t.sub) { t.sub = []; Object.defineProperty(t, 'sigs', { value: new Map() }); }
  t.sigs.set(id, shape(run));
  run.forEach((n, m) => tags.set(n, { id, u: 0, m }));
  t.sub.push({ id, n: run.length, uses: [run[0].id], expose: [] });
  return finish(t);
}

const subById = (t, id) => { const s = (t.sub || []).find((q) => q.id === id); if (!s) throw new Error(`no subgraph ${id}`); return s; };

// another use of a subgraph at this place of a chain: a copy of the first use, its drivers copied too
export function place(formula, subId, chainId, index) {
  const t = tree(formula), s = subById(t, subId), ch = chainById(t, chainId);
  if (!ch) throw new Error(`no chain ${chainId}`);
  const inside = runsOf(t, s).length && t.sub.some((q) => runsOf(t, q).some((r) => r.ch === ch && index > r.start && index < r.start + r.nodes.length));
  if (inside) throw new Error('a subgraph cannot sit inside a subgraph');
  const [first] = runsOf(t, s), u = Math.max(...s.uses.keys()) + 1;
  const run = first.nodes.map((n) => clone(n));
  if (run.some((n) => n.species) && !t.chains.includes(ch)) throw new Error('a chimera cannot sit inside a chimera');
  run.forEach((n, m) => tags.set(n, { id: s.id, u, m }));
  ch.nodes.splice(Math.max(0, Math.min(index, ch.nodes.length)), 0, ...run);
  return finish(t);
}

// one use goes back to plain ops; the others stay linked (the last one takes the subgraph with it)
export function detach(formula, at) {
  const t = tree(formula), u = useOf(t, at);
  if (!u) throw new Error(`${at} is not in a subgraph`);
  walk(t, (n) => { const g = tags.get(n); if (g && g.id === u.sub.id && g.u === u.use) tags.delete(n); });
  return finish(t);
}

// a whole use removed, its chain closing over it
export function removeUse(formula, at) {
  const t = tree(formula), u = useOf(t, at);
  if (!u) throw new Error(`${at} is not in a subgraph`);
  const [r] = runsOf(t, u.sub).filter((q) => q.u === u.use);
  if (r.nodes.length === r.ch.nodes.length) {
    if (t.chains.includes(r.ch)) { if (t.chains.length < 2) throw new Error('a scheduled chain cannot be emptied'); return removeChain(formula, r.ch.id); }
    return remove(detach(formula, at), r.nodes[0].id);
  }
  r.ch.nodes.splice(r.start, r.nodes.length);
  return finish(t);
}

// a whole use moved to another place
export function moveUse(formula, at, chainId, index) {
  const t = tree(formula), u = useOf(t, at), to = chainById(t, chainId);
  if (!u || !to) throw new Error('no such use or chain');
  const [r] = runsOf(t, u.sub).filter((q) => q.u === u.use);
  if (r.nodes.length === r.ch.nodes.length) throw new Error('that would empty its chain');
  if (r.ch === to && index > r.start && index < r.start + r.nodes.length) throw new Error('that is inside itself');
  if (r.nodes.some((n) => n.species) && !t.chains.includes(to)) throw new Error('a chimera cannot sit inside a chimera');
  r.ch.nodes.splice(r.start, r.nodes.length);
  const i = r.ch === to && index > r.start ? index - r.nodes.length : index;
  to.nodes.splice(Math.max(0, Math.min(i, to.nodes.length)), 0, ...r.nodes);
  return finish(t);
}

// a new op inside a run: at any member index 0..n, also its two ends, which the chain's own edges cannot say
export function insertIn(formula, subId, index, name) {
  const t = tree(formula), s = subById(t, subId);
  if (isMix(name)) throw new Error('a chimera is made with fork');
  const [r] = runsOf(t, s), n = fresh(name), k = Math.max(0, Math.min(index, r.nodes.length));
  tags.set(n, { id: s.id, u: r.u, m: -1 });
  r.ch.nodes.splice(r.start + k, 0, n);
  return finish(t);
}

// a number of each use's own, or shared again (every use takes the first's)
export function expose(formula, id, key) {
  const f = normalize(formula), u = useOf(f, id);
  if (!u) throw new Error(`${id} is not in a subgraph`);
  const o = opPaths(f).get(id), q = o && getOp(o.op).params.find((r) => r.k === key);
  if (!q || q.hidden) throw new Error(`${o && o.op} has no parameter ${key}`);
  const rel = `${u.rel}.${key}`;
  if (u.sub.expose.includes(rel)) return f;
  return checked({ ...f, sub: f.sub.map((s) => (s.id === u.sub.id ? { ...s, expose: [...s.expose, rel] } : s)) });
}
export function unexpose(formula, id, key) {
  const f = normalize(formula), u = useOf(f, id);
  if (!u) throw new Error(`${id} is not in a subgraph`);
  return checked({ ...f, sub: f.sub.map((s) => (s.id === u.sub.id ? { ...s, expose: s.expose.filter((e) => e !== `${u.rel}.${key}`) } : s)) });
}

// a use's own numbers: [{ id (the op), key, rel, op }], for its dimension lines
export function exposedOf(formula, at) {
  const f = normalize(formula), u = useOf(f, at);
  if (!u) return [];
  const paths = opPaths(f);
  return u.sub.expose.map((e) => {
    const r = relParts(e), id = peerId(u.sub, u.at, r.path);
    return { id, key: r.key, rel: e, op: paths.get(id).op, value: paths.get(id).p[r.key] };
  });
}

// ---------- drivers -------------------------------------------------------------------------------

// drive a parameter ('<id>.<param>') from a driver node, over the band [lo, hi]; binding a bound
// parameter replaces its binding
export function bind(formula, to, from, lo = 0, hi = 1) {
  const f = normalize(formula), d = normDrive(f.drive || {});
  if (!targetParam(opPaths(f), to)) throw new Error(`${to} cannot be driven`);
  if (!d.nodes.some((m) => m.id === from)) throw new Error(`no driver ${from}`);
  d.bind = [...d.bind.filter((b) => b.to !== to), { to, from, lo, hi }];
  return checked({ ...f, drive: d });
}

export function unbind(formula, to) {
  const f = normalize(formula);
  if (!f.drive) return f;
  return checked({ ...f, drive: { ...f.drive, bind: f.drive.bind.filter((b) => b.to !== to) } });
}

// a binding's band
export function setBand(formula, to, lo, hi) {
  const f = normalize(formula);
  const b = f.drive && f.drive.bind.find((x) => x.to === to);
  if (!b) throw new Error(`${to} is not bound`);
  return checked({ ...f, drive: { ...f.drive, bind: f.drive.bind.map((x) => (x === b ? { ...x, lo, hi } : x)) } });
}

// a driver node added (after the others) or replaced in place
export function setDriver(formula, node) {
  const f = normalize(formula), d = normDrive(f.drive || {});
  const i = d.nodes.findIndex((m) => m.id === node.id);
  if (i >= 0) d.nodes[i] = node; else d.nodes.push(node);
  return checked({ ...f, drive: d });
}

// a driver node removed with the bindings it feeds; nodes reading it lose that input, and so does the
// shading (core/shade.js dropDriverRefs)
export function removeDriver(formula, id) {
  const f = normalize(formula), d = normDrive(f.drive || {});
  d.nodes = d.nodes.filter((m) => m.id !== id).map((m) => ({ ...m, in: Object.fromEntries(Object.entries(m.in).filter(([, r]) => r !== id)) }));
  d.bind = d.bind.filter((b) => b.from !== id);
  return checked({ ...f, drive: d, ...(f.shade ? { shade: dropDriverRefs(f.shade, id) } : {}) });
}

function checked(f) {
  const g = normalize(emptyDrive(f.drive) ? { ...f, drive: undefined } : f);
  const v = validate(g);
  if (!v.ok) throw new Error(v.errors.join('; '));
  return g;
}
