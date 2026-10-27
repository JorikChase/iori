// Collage edits (DESIGN.md "Collage (K)"): the graph's view of a collage — pieces side by side, each its
// own formula tree (core/graph.js), a join node below each neighbouring pair — and every edit as a pure
// function collage → collage, validated. Ids: 'P<i>' piece i, 'J<j>' the join between pieces j and j + 1.
// The collage's drive follows its pieces and joins: an edit that moves, adds or removes one renames the
// bindings and param nodes that name it, and drops the ones whose target is gone (a param node whose
// target is gone becomes the constant it last read, as core/drive.js remapDrive does for ops).

import { normCollage, validateCollage, collageTarget, normJoin, JOIN, PLACE, REP, JOIN_OPS, KERNELS } from './collage.js';
import { tree, ports } from './graph.js';
import { normalize } from './formula.js';
import { normDrive, splitTarget, emptyDrive, MAX_BINDS } from './drive.js';

const clone = (x) => JSON.parse(JSON.stringify(x));
const clampTo = (v, q) => Math.min(q.max ?? Infinity, Math.max(q.min ?? -Infinity, v));

// pieces side by side, joins between them
export function collageTree(collage) {
  const c = normCollage(collage);
  return {
    pieces: c.pieces.map((q, i) => ({ id: `P${i}`, tree: tree(q.f), place: { ...q.place }, rep: q.rep && { ...q.rep } })),
    joins: c.joins.map((j, i) => ({ id: `J${i}`, ...j, a: i === 0 ? 'P0' : `J${i - 1}`, b: `P${i + 1}` })),
  };
}

// the typed ports of a join node (the formula-v2 hook, as graph.js ports for an op)
export function joinPorts(j) {
  const nums = j.op === 'morph' ? ['w'] : j.k === 'hard' ? [] : j.k === 'stairs' ? ['r', 'n'] : ['r'];
  return [
    { name: 'a', type: 'distance', dir: 'in' }, { name: 'b', type: 'distance', dir: 'in' }, { name: 'd', type: 'distance', dir: 'out' },
    ...nums.map((k) => ({ name: k, type: JOIN[k].discrete ? 'int' : 'number', dir: 'in' })),
  ];
}
export { ports };

// ---------- the drive follows ------------------------------------------------------------------------

// rename: old 'P<i>' / 'J<j>' → the new id, or null when it is gone
function remap(c, was, rename) {
  if (!c.drive) return c;
  const d = normDrive(c.drive);
  const move = (to) => {
    const { path, key } = splitTarget(to), id = rename(path);
    return id ? `${id}.${key}` : null;
  };
  const bind = [];
  for (const b of d.bind) {
    const to = move(b.to);
    if (to && bind.length < MAX_BINDS && !bind.some((x) => x.to === to)) bind.push({ ...b, to });
  }
  const nodes = d.nodes.map((m) => {
    if (m.type !== 'param') return m;
    const of = move(m.p.of);
    if (of) return { ...m, p: { ...m.p, of } };
    return { id: m.id, in: {}, p: { c: was(m.p.of), op: 'add' }, type: 'math' };
  });
  return { ...c, drive: { nodes, bind } };
}

const ownValue = (c) => (to) => { const t = collageTarget(c, to); return t ? t.obj[t.key] : 0; };

function checked(c) {
  const g = normCollage(emptyDrive(c.drive) ? { ...c, drive: undefined } : c);
  const v = validateCollage(g);
  if (!v.ok) throw new Error(v.errors.join('; '));
  return g;
}

// ---------- pieces ------------------------------------------------------------------------------------

// a formula as a new piece at index `at` (the end by default), joined to the pieces before it by `join`
// (a smooth union unless given); inserted first, the join goes between it and the old first piece
export function addPiece(collage, formula, at = null, join = {}, place = {}) {
  const c = normCollage(collage), N = c.pieces.length, i = at == null ? N : Math.max(0, Math.min(N, at));
  const pieces = [...c.pieces], joins = [...c.joins];
  pieces.splice(i, 0, { f: normalize(formula), place, rep: null });
  joins.splice(Math.max(i - 1, 0), 0, normJoin(join));
  const ji = Math.max(i - 1, 0);
  return checked(remap({ ...c, pieces, joins }, ownValue(c), (path) => {
    const k = +path.slice(1);
    if (path[0] === 'P') return `P${k >= i ? k + 1 : k}`;
    return `J${k >= ji ? k + 1 : k}`;
  }));
}

// piece i removed with the join that tied it in (the one before it; for the first piece, the one after)
export function removePiece(collage, i) {
  const c = normCollage(collage);
  if (c.pieces.length <= 1) throw new Error('a collage keeps one piece');
  if (!c.pieces[i]) throw new Error(`no piece P${i}`);
  const ji = Math.max(i - 1, 0);
  const pieces = c.pieces.filter((_, k) => k !== i), joins = c.joins.filter((_, k) => k !== ji);
  return checked(remap({ ...c, pieces, joins }, ownValue(c), (path) => {
    const k = +path.slice(1);
    if (path[0] === 'P') return k === i ? null : `P${k > i ? k - 1 : k}`;
    return k === ji ? null : `J${k > ji ? k - 1 : k}`;
  }));
}

// piece i moved to position `to`; the joins stay where they are (between positions)
export function movePiece(collage, i, to) {
  const c = normCollage(collage), N = c.pieces.length;
  if (!c.pieces[i]) throw new Error(`no piece P${i}`);
  to = Math.max(0, Math.min(N - 1, to));
  const order = c.pieces.map((_, k) => k);
  order.splice(to, 0, ...order.splice(i, 1));
  const at = new Map(order.map((k, pos) => [k, pos]));
  return checked(remap({ ...c, pieces: order.map((k) => c.pieces[k]) }, ownValue(c), (path) => (path[0] === 'P' ? `P${at.get(+path.slice(1))}` : path)));
}

// any formula edit (a core/graph.js function f → f′) applied to piece i
export function editPiece(collage, i, edit) {
  const c = normCollage(collage);
  if (!c.pieces[i]) throw new Error(`no piece P${i}`);
  const pieces = c.pieces.map((q, k) => (k === i ? { ...q, f: normalize(edit(q.f)) } : q));
  return checked({ ...c, pieces });
}

// a piece's placement number, clamped
export function setPlace(collage, i, key, value) {
  const c = clone(normCollage(collage)), q = PLACE[key];
  if (!c.pieces[i]) throw new Error(`no piece P${i}`);
  if (!q) throw new Error(`no placement ${key}`);
  c.pieces[i].place[key] = clampTo(value, q);
  return checked(c);
}

// a piece's repetition: a kind ('grid', 'mirror', 'polar') with its numbers, or null for none.
// Bindings to numbers the new kind does not have are dropped
export function setRep(collage, i, kind, params = {}) {
  const c = clone(normCollage(collage));
  if (!c.pieces[i]) throw new Error(`no piece P${i}`);
  if (kind != null && !REP[kind]) throw new Error(`no repetition ${kind}`);
  c.pieces[i].rep = kind == null ? null : { kind, ...params };
  return checked(dropDead(normCollage(c), ownValue(normCollage(collage))));
}

export function setRepParam(collage, i, key, value) {
  const c = clone(normCollage(collage)), r = c.pieces[i] && c.pieces[i].rep, q = r && REP[r.kind][key];
  if (!q) throw new Error(`P${i} has no repetition number ${key}`);
  r[key] = q.discrete ? Math.round(clampTo(value, q)) : clampTo(value, q);
  return checked(c);
}

// ---------- joins -------------------------------------------------------------------------------------

// a join's op and kernel (either may be left out)
export function setJoin(collage, j, { op, k } = {}) {
  const c = clone(normCollage(collage));
  if (!c.joins[j]) throw new Error(`no join J${j}`);
  if (op != null && !JOIN_OPS.includes(op)) throw new Error(`no join op ${op}`);
  if (k != null && !KERNELS.includes(k)) throw new Error(`no kernel ${k}`);
  c.joins[j] = normJoin({ ...c.joins[j], ...(op != null ? { op } : {}), ...(k != null ? { k } : {}) });
  return checked(c);
}

export function setJoinParam(collage, j, key, value) {
  const c = clone(normCollage(collage)), q = JOIN[key];
  if (!c.joins[j]) throw new Error(`no join J${j}`);
  if (!q) throw new Error(`no join number ${key}`);
  c.joins[j] = normJoin({ ...c.joins[j], [key]: q.discrete ? Math.round(clampTo(value, q)) : clampTo(value, q) });
  return checked(c);
}

// ---------- the collage's drive --------------------------------------------------------------------

// bindings whose number the collage no longer has go; param nodes reading one become the constant it
// last read (was: the values before the edit)
function dropDead(c, was) {
  if (!c.drive) return c;
  return {
    ...c,
    drive: {
      nodes: c.drive.nodes.map((m) => (m.type === 'param' && !collageTarget(c, m.p.of) ? { id: m.id, in: {}, p: { c: was(m.p.of), op: 'add' }, type: 'math' } : m)),
      bind: c.drive.bind.filter((b) => collageTarget(c, b.to)),
    },
  };
}

// bind a collage number ('J0.r', 'P1.tx' …) to a driver node over the band [lo, hi]
export function bindCollage(collage, to, from, lo = 0, hi = 1) {
  const c = normCollage(collage), d = normDrive(c.drive || {});
  if (!collageTarget(c, to)) throw new Error(`${to} cannot be driven`);
  if (!d.nodes.some((m) => m.id === from)) throw new Error(`no driver ${from}`);
  d.bind = [...d.bind.filter((b) => b.to !== to), { to, from, lo, hi }];
  return checked({ ...c, drive: d });
}

export function unbindCollage(collage, to) {
  const c = normCollage(collage);
  if (!c.drive) return c;
  return checked({ ...c, drive: { ...c.drive, bind: c.drive.bind.filter((b) => b.to !== to) } });
}

// a driver node added (after the others) or replaced in place
export function setCollageDriver(collage, node) {
  const c = normCollage(collage), d = normDrive(c.drive || {});
  const i = d.nodes.findIndex((m) => m.id === node.id);
  if (i >= 0) d.nodes[i] = node; else d.nodes.push(node);
  return checked({ ...c, drive: d });
}

// a driver node out: its bindings go, what read it is left unconnected — and a node that cannot be
// (a remap with nothing to read) goes with it, as core/drive-edit.js removeDriverNode does
const REQUIRED = { remap: ['a'] };
export function removeCollageDriver(collage, id) {
  const c = normCollage(collage);
  if (!c.drive) return c;
  const gone = new Set([id]);
  for (let changed = true; changed;) {
    changed = false;
    for (const m of c.drive.nodes) {
      if (gone.has(m.id)) continue;
      if ((REQUIRED[m.type] || []).some((port) => gone.has(m.in[port]))) { gone.add(m.id); changed = true; }
    }
  }
  const nodes = c.drive.nodes.filter((m) => !gone.has(m.id)).map((m) => ({ ...m, in: Object.fromEntries(Object.entries(m.in || {}).filter(([, r]) => !gone.has(r))) }));
  return checked({ ...c, drive: { nodes, bind: c.drive.bind.filter((b) => !gone.has(b.from)) } });
}

// a link from driver `from` into input `port` of driver `to`
export function connectCollageDriver(collage, from, to, port) {
  const c = normCollage(collage), d = normDrive(c.drive || {});
  const m = d.nodes.find((q) => q.id === to);
  if (!m || !d.nodes.some((q) => q.id === from) || from === to) throw new Error(`no link ${from} → ${to}.${port}`);
  return setCollageDriver(c, { ...m, in: { ...m.in, [port]: from } });
}

// ---------- parameters for breeding, the lens and the grab -----------------------------------------

// every continuous collage number: [{ ref: 'P0.tx' | 'J1.r' …, value, min, max }] — the joins' numbers
// only where their kind reads them. The pieces' own parameters are their formulas' (K3 prefixes them).
export function collageParams(collage) {
  const c = normCollage(collage), out = [];
  c.pieces.forEach((q, i) => {
    for (const [k, s] of Object.entries(PLACE)) out.push({ ref: `P${i}.${k}`, value: q.place[k], min: s.min, max: s.max });
    if (q.rep) for (const [k, s] of Object.entries(REP[q.rep.kind])) if (!s.discrete) out.push({ ref: `P${i}.${k}`, value: q.rep[k], min: s.min, max: s.max });
  });
  c.joins.forEach((j, i) => {
    const keys = j.op === 'morph' ? ['w'] : j.k === 'hard' ? [] : ['r'];
    for (const k of keys) out.push({ ref: `J${i}.${k}`, value: j[k], min: JOIN[k].min, max: JOIN[k].max });
  });
  return out;
}

export function getCollageParam(collage, ref) {
  const t = collageTarget(normCollage(collage), ref);
  return t ? t.obj[t.key] : undefined;
}

export function setCollageParam(collage, ref, value) {
  const { path, key } = splitTarget(ref), i = +path.slice(1);
  if (path[0] === 'J') return setJoinParam(collage, i, key, value);
  return PLACE[key] ? setPlace(collage, i, key, value) : setRepParam(collage, i, key, value);
}
