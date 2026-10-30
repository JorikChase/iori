// Subgraphs of the two dataflows: a part of the shading or driver network used in several places
// (DESIGN.md "Subgraphs"). The same link as core/sub.js over the same kind of plain nodes — every program
// packs and runs them as they are:
//
//   net.sub = [{ id: 'a', uses: [['ramp0', 'math1'], ['ramp2', 'math3']], expose: ['1.c', '0.map.scale'] }]
//
// A use lists its nodes, in the network's order, member by member. The first use speaks for the rest:
// every other use takes its parameters (but the exposed ones) and its links between members. Links in from
// outside belong to each use. A use's last node is its output. Only the first use is edited, so a frame
// opened on any use opens on that one.

import { clone } from './clone.js';

const memberOf = (s, id) => { for (const [u, ids] of s.uses.entries()) { const m = ids.indexOf(id); if (m >= 0) return { u, m }; } return null; };
const getPath = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setPath = (o, path, v) => { const a = path.split('.'), k = a.pop(); a.reduce((q, j) => q[j], o)[k] = v; };
const relOf = (e) => { const i = e.indexOf('.'); return { m: +e.slice(0, i), key: e.slice(i + 1) }; };

// the canonical list: a node gone from the network takes its member's place in every use (the copies it
// leaves are plain nodes); no members left, no key
export function normNet(list, nodes) {
  if (!Array.isArray(list) || !list.length) return undefined;
  const at = new Map(nodes.map((n, i) => [String(n.id), i]));
  const subs = list.flatMap((s) => {
    const uses = (s.uses || []).map((ids) => ids.map(String));
    const n = uses.length ? Math.max(...uses.map((ids) => ids.length)) : 0;
    const keep = Array.from({ length: n }, (_, m) => m).filter((m) => uses.every((ids) => at.has(ids[m])));
    const live = uses.map((ids) => keep.map((m) => ids[m])).filter((ids) => ids.length);
    if (!live.length) return [];
    const expose = (s.expose || []).map(String).flatMap((e) => { const { m, key } = relOf(e), j = keep.indexOf(m); return j < 0 ? [] : [`${j}.${key}`]; });
    return [{ id: String(s.id), uses: live, expose }];
  });
  return subs.length ? subs : undefined;
}

// nodes in an order where every input comes first (stable)
function topo(net) {
  const done = new Set(), left = [...net.nodes], out = [];
  const known = new Set(net.nodes.map((n) => n.id));
  while (left.length) {
    const i = left.findIndex((n) => Object.values(n.in).every((r) => !known.has(r) || done.has(r)));
    if (i < 0) return;
    done.add(left[i].id);
    out.push(left.splice(i, 1)[0]);
  }
  net.nodes = out;
}

export function syncNet(net) {
  if (!net.sub) return;
  const byId = new Map(net.nodes.map((n) => [n.id, n]));
  let rewired = false;
  for (const s of net.sub) {
    const first = s.uses[0].map((id) => byId.get(id));
    const own = s.expose.map(relOf);
    for (const ids of s.uses.slice(1)) {
      const peer = ids.map((id) => byId.get(id));
      first.forEach((o, m) => {
        const q = peer[m];
        if (!q || !o || q.type !== o.type) return;
        const kept = own.filter((e) => e.m === m).map((e) => [e.key, getPath(q.p, e.key)]);
        q.p = clone(o.p);
        for (const [key, v] of kept) if (v !== undefined) setPath(q.p, key, v);
        // links between members follow; a link in from outside stays this use's
        for (const port of new Set([...Object.keys(o.in), ...Object.keys(q.in)])) {
          const a = s.uses[0].indexOf(o.in[port]), b = ids.indexOf(q.in[port]);
          if (a >= 0 && q.in[port] !== ids[a]) { q.in[port] = ids[a]; rewired = true; }
          else if (a < 0 && b >= 0) { delete q.in[port]; rewired = true; }
        }
      });
    }
  }
  if (rewired) topo(net);
}

export function validateNet(net, label) {
  const errors = [], err = (m) => errors.push(`${label}: ${m}`);
  if (!Array.isArray(net.sub)) return [`${label}: sub needs a list`];
  const byId = new Map(net.nodes.map((n) => [n.id, n])), held = new Set(), ids = new Set();
  for (const s of net.sub) {
    if (!/^[a-z]$/.test(s.id || '') || ids.has(s.id)) { err(`"${s.id}" needs a letter of its own`); continue; }
    ids.add(s.id);
    for (const use of s.uses) {
      if (use.length !== s.uses[0].length) err(`${s.id}: uses differ in length`);
      use.forEach((id, m) => {
        const o = byId.get(id);
        if (!o) { err(`${s.id}: no node ${id}`); return; }
        if (held.has(id)) err(`${s.id}: ${id} is in two uses`);
        held.add(id);
        if (byId.get(s.uses[0][m]) && o.type !== byId.get(s.uses[0][m]).type) err(`${s.id}: ${id} differs from the first use`);
      });
    }
    for (const e of s.expose) { const { m, key } = relOf(e), o = byId.get(s.uses[0][m]); if (!o || typeof getPath(o.p, key) !== 'number') err(`${s.id}: no number ${e}`); }
  }
  return errors;
}

// ---------- edits, on the network; the callers normalise --------------------------------------------
const letter = (net) => [...'abcdefghijklmnopqrstuvwxyz'].find((c) => !(net.sub || []).some((s) => s.id === c));

export function wrapNet(net, ids) {
  const g = clone(net), want = new Set(ids), run = g.nodes.filter((n) => want.has(n.id)).map((n) => n.id);
  if (!run.length) throw new Error('no such nodes');
  if ((g.sub || []).some((s) => s.uses.some((u) => u.some((id) => want.has(id))))) throw new Error('a subgraph cannot sit inside a subgraph');
  const id = letter(g);
  if (!id) throw new Error('no letter left');
  g.sub = [...(g.sub || []), { id, uses: [run], expose: [] }];
  return g;
}

// another use: a copy of the first, its links from outside the same, its output free. newId: type → an id
export function placeNet(net, subId, newId) {
  const g = clone(net), s = (g.sub || []).find((q) => q.id === subId);
  if (!s) throw new Error(`no subgraph ${subId}`);
  const map = new Map(), first = s.uses[0].map((id) => g.nodes.find((n) => n.id === id));
  const copies = first.map((n) => { const c = clone(n); c.id = newId(g, n.type); map.set(n.id, c.id); g.nodes.push(c); return c; });
  for (const c of copies) for (const [port, r] of Object.entries(c.in)) if (map.has(r)) c.in[port] = map.get(r);
  s.uses.push(first.map((n) => map.get(n.id)));
  return g;
}

export function detachNet(net, id) {
  const g = clone(net);
  g.sub = (g.sub || []).flatMap((s) => { const at = memberOf(s, id); if (!at) return [s]; const uses = s.uses.filter((_, u) => u !== at.u); return uses.length ? [{ ...s, uses }] : []; });
  return g;
}

export function exposeNet(net, id, key, on = true) {
  const g = clone(net), s = (g.sub || []).find((q) => memberOf(q, id));
  if (!s) throw new Error(`${id} is not in a subgraph`);
  const e = `${memberOf(s, id).m}.${key}`;
  s.expose = on ? [...new Set([...s.expose, e])] : s.expose.filter((x) => x !== e);
  return g;
}

// a new node of the network becomes a member, every other use getting a copy
export function addMemberNet(net, subId, id, newId) {
  const g = clone(net), s = g.sub.find((q) => q.id === subId), n = g.nodes.find((q) => q.id === id);
  s.uses.forEach((use, u) => {
    if (!u) { use.push(id); return; }
    const c = clone(n);
    c.id = newId(g, n.type); c.in = {};
    g.nodes.push(c);
    use.push(c.id);
  });
  return g;
}

// ---------- reading ---------------------------------------------------------------------------------
export const useOfNet = (net, id) => { for (const s of (net && net.sub) || []) { const at = memberOf(s, id); if (at) return { sub: s, ...at, first: s.uses[0][at.m], ids: s.uses[at.u] }; } return null; };

// the same member in every use, the given one's first use included: what a removal takes
export const peersOfNet = (net, id) => { const u = useOfNet(net, id); return u ? u.sub.uses.map((ids) => ids[u.m]) : [id]; };

// a use's own numbers: [{ id, key, value }]
export function exposedNet(net, id) {
  const u = useOfNet(net, id);
  if (!u) return [];
  return u.sub.expose.map((e) => { const { m, key } = relOf(e), nid = u.ids[m], o = net.nodes.find((n) => n.id === nid); return { id: nid, key, value: getPath(o.p, key), type: o.type }; });
}

// How a network draws: every use but the one open (the first use of `open`, a subgraph's letter) is one
// node, its output, carrying the rest. { hidden: Set, rep: id → the node that stands for it, uses: output id
// → { sub, u, n, members }, open: the open use's ids }
export function foldNet(net, open = null) {
  const hidden = new Set(), rep = new Map(), uses = new Map();
  let ids = null;
  for (const s of (net && net.sub) || []) s.uses.forEach((use, u) => {
    if (s.id === open && u === 0) { ids = use; return; }
    const out = use[use.length - 1];
    use.forEach((id) => { if (id !== out) hidden.add(id); rep.set(id, out); });
    uses.set(out, { sub: s.id, u, n: use.length, members: use });
  });
  return { hidden, rep, uses, open: ids };
}
