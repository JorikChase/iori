// Subgraphs: a run of ops used in several places, so that an edit to one reaches them all (DESIGN.md
// "Subgraphs"). The slots stay plain — every use's ops are real ops, so the CPU, the GPU interpreter, both
// JITs, sensing and push never hear of it. A subgraph is a link laid over those copies:
//
//   formula.sub = [{ id: 'a', n: 3, uses: ['A1', 'A5', 'B3.0.0'], expose: ['2.s', '0.1.0.w'] }, …]
//
//   id       a letter, the name in the notation
//   n        ops in the run
//   uses     the path id (core/graph.js) of each use's first op, in the order the text writes them
//   expose   the numbers each use keeps for itself, relative to the run: '<member>.<param>', or
//            '<member>.<species>.<op>.<param>' inside a chimera that is a member
//
// The first use speaks for the rest: normalize copies every other number from it. So a writer changes the
// first use (masterParam finds it), and format writes only that one's numbers.
//
// A use is a contiguous run of one chain, a scheduled chain or a species. Uses do not overlap and do not
// nest; a chimera inside a run needs a scheduled chain for every use, as any chimera does.

import { getOp, isMix } from './ops.js';
import { opPaths } from './drive.js';

// 'A3' → chain 'A', index 3; 'B2.1.0' → chain 'B2.1', index 0
export function useParts(at) {
  const m = /^([A-H])(\d+)(?:\.(\d+)\.(\d+))?$/.exec(at);
  if (!m) return null;
  return m[3] === undefined ? { chain: m[1], index: +m[2], key: [m[1].charCodeAt(0), +m[2], 0, 0] } : { chain: `${m[1]}${m[2]}.${m[3]}`, index: +m[4], key: [m[1].charCodeAt(0), +m[2], +m[3] + 1, +m[4]] };
}
export const memberId = (chain, k) => (chain.includes('.') ? `${chain}.${k}` : `${chain}${k}`);
const byPath = (a, b) => {
  const p = useParts(a), q = useParts(b);
  if (!p || !q) return a < b ? -1 : 1;
  for (let i = 0; i < 4; i++) if (p.key[i] !== q.key[i]) return p.key[i] - q.key[i];
  return 0;
};

// what a rel path names: its member, the species path inside it, the parameter
export function relParts(rel) {
  const a = String(rel).split('.'), key = a.pop();
  return { member: +a[0], inner: a.slice(1).join('.'), key, path: a.join('.') };
}
const relKey = (rel) => { const { member, inner } = relParts(rel); return [member, ...(inner ? inner.split('.').map(Number) : [1e9, 0])]; };

// every op of a use with its rel path: [[rel, op], …] (rel without the parameter)
function members(paths, sub, at) {
  if (!useParts(at)) return null;
  const { chain, index } = useParts(at), out = [];
  for (let k = 0; k < sub.n; k++) {
    const id = memberId(chain, index + k), o = paths.get(id);
    if (!o) return null;
    out.push([String(k), o]);
    if (isMix(o.op)) for (const [p, q] of paths) if (p.startsWith(`${id}.`)) out.push([`${k}${p.slice(id.length)}`, q]);
  }
  return out;
}

// the canonical form: uses in text order, exposed numbers in reading order (a chimera's species before its
// field, as the text has them), an empty list is no list
export function normSub(list) {
  if (!Array.isArray(list) || !list.length) return undefined;
  const subs = list.map((s) => ({ id: String(s.id), n: s.n | 0, uses: [...(s.uses || [])].map(String).sort(byPath), expose: [...(s.expose || [])].map(String) }));
  for (const s of subs) s.expose.sort((a, b) => { const p = relKey(a), q = relKey(b); for (let i = 0; i < 3; i++) if (p[i] !== q[i]) return p[i] - q[i]; return 0; });
  return subs.sort((a, b) => byPath(a.uses[0] ?? '', b.uses[0] ?? ''));
}

// The exposed numbers keep their place in a parameter list, so the sort above needs the op: done here,
// where the slots are known. And every use takes the first one's shared numbers
export function syncSub(f) {
  if (!f.sub) return;
  const paths = opPaths(f);
  for (const s of f.sub) {
    const first = s.uses.length ? members(paths, s, s.uses[0]) : null;
    if (!first) continue;
    const order = new Map();
    for (const [rel, o] of first) { const def = getOp(o.op); if (def) def.params.forEach((q, i) => order.set(`${rel}.${q.k}`, i)); }
    s.expose.sort((a, b) => { const p = relKey(a), q = relKey(b); for (let i = 0; i < 3; i++) if (p[i] !== q[i]) return p[i] - q[i]; return (order.get(a) ?? 0) - (order.get(b) ?? 0); });
    const own = new Set(s.expose);
    for (const at of s.uses.slice(1)) {
      const peer = members(paths, s, at);
      if (!peer || peer.length !== first.length) continue;
      first.forEach(([rel, o], i) => {
        const q = peer[i][1];
        if (peer[i][0] !== rel || q.op !== o.op) return;
        for (const k of Object.keys(o.p)) if (!own.has(`${rel}.${k}`)) q.p[k] = o.p[k];
      });
    }
  }
}

export function validateSub(f) {
  const errors = [];
  const err = (m) => errors.push('sub: ' + m);
  if (!Array.isArray(f.sub)) return ['sub: needs a list'];
  const paths = opPaths(f), held = new Map(), ids = new Set();
  for (const s of f.sub) {
    if (!/^[a-z]$/.test(s.id || '') || ids.has(s.id)) { err(`"${s.id}" needs a letter of its own`); continue; }
    ids.add(s.id);
    if (!(Number.isInteger(s.n) && s.n > 0)) { err(`${s.id}: n must be a count of ops`); continue; }
    if (!Array.isArray(s.uses) || !s.uses.length) { err(`${s.id}: needs a use`); continue; }
    let shape = null, first = null;
    for (const at of s.uses) {
      if (!useParts(at)) { err(`${s.id}: ${at} is not a place`); continue; }
      const run = members(paths, s, at);
      if (!run) { err(`${s.id}: no run of ${s.n} ops at ${at}`); continue; }
      const here = JSON.stringify(run.map(([rel, o]) => [rel, o.op]));
      if (shape !== null && here !== shape) err(`${s.id}: the use at ${at} differs from the first`);
      if (shape === null) { shape = here; first = run; }
      const { chain, index } = useParts(at);
      for (let k = 0; k < s.n; k++) {
        const id = memberId(chain, index + k);
        if (held.has(id)) err(`${s.id}: ${id} already belongs to ${held.get(id)}`);
        held.set(id, s.id);
      }
    }
    for (const rel of s.expose || []) {
      const { path, key } = relParts(rel), hit = first && first.find(([r]) => r === path);
      const q = hit && (getOp(hit[1].op) || { params: [] }).params.find((r) => r.k === key);
      if (first && (!q || q.hidden)) err(`${s.id}: no number ${rel}`);
    }
  }
  return errors;
}

// ---------- the links, for what writes by flat op index (the grab, the lens, breeding, herding) ---------

const flatIndex = (f) => { const m = new Map(); let i = 0; for (const s of f.slots) for (const o of s) m.set(o, i++); return m; };

// every shared number of a use after the first: 'oi.key' → the first use's { oi, key }
export function linkMap(f) {
  const links = new Map();
  if (!f.sub) return links;
  const paths = opPaths(f), oi = flatIndex(f);
  for (const s of f.sub) {
    const first = s.uses.length ? members(paths, s, s.uses[0]) : null;
    if (!first) continue;
    const own = new Set(s.expose);
    for (const at of s.uses.slice(1)) {
      const peer = members(paths, s, at);
      if (!peer || peer.length !== first.length) continue;
      first.forEach(([rel, o], i) => {
        for (const k of Object.keys(o.p)) if (!own.has(`${rel}.${k}`)) links.set(`${oi.get(peer[i][1])}.${k}`, { oi: oi.get(o), key: k });
      });
    }
  }
  return links;
}

// the op parameter a write must land on for it to last
export const masterParam = (f, oi, key) => (f.sub ? linkMap(f).get(`${oi}.${key}`) || { oi, key } : { oi, key });

// A sensed metric with each shared number once: the first use's entry carries the sum of what its copies
// move, an upper bound (their partials may cancel), so a step of D pixels never moves more than D
export function reduceMetric(f, metric) {
  if (!f.sub) return metric;
  const links = linkMap(f), out = new Map();
  for (const m of metric) {
    const to = m.drive ? null : links.get(`${m.oi}.${m.key}`);
    const k = m.drive ? `d:${m.drive}` : `${to ? to.oi : m.oi}.${m.key}`;
    const had = out.get(k);
    if (had) had.pxPerUnit += m.pxPerUnit;
    else out.set(k, to ? { ...m, oi: to.oi, pxPerUnit: m.pxPerUnit } : { ...m });
  }
  return [...out.values()];
}

// the use a graph id belongs to: { sub, use (index), at, member, rel (inside the run, no parameter) }
export function useOf(f, id) {
  if (!f.sub) return null;
  for (const s of f.sub) {
    for (const [u, at] of s.uses.entries()) {
      if (!useParts(at)) continue;
      const { chain, index } = useParts(at);
      for (let k = 0; k < s.n; k++) {
        const m = memberId(chain, index + k);
        if (id === m) return { sub: s, use: u, at, member: k, rel: String(k) };
        if (id.startsWith(`${m}.`)) return { sub: s, use: u, at, member: k, rel: `${k}${id.slice(m.length)}` };
      }
    }
  }
  return null;
}

// the same op in another use
export function peerId(sub, at, rel) {
  const { chain, index } = useParts(at), a = rel.split('.'), m = memberId(chain, index + +a[0]);
  return a.length > 1 ? `${m}.${a.slice(1).join('.')}` : m;
}
