// The graph drawn: one layout of the formula's tree (core/graph.js) at two scales — folded, it is the
// strip at the right edge of the structure layer; unfolded, the same drawing grown leftward over the
// dimmed field, where it is edited. So the strip always is the network: chains top to bottom, a
// chimera forking into its species and joining at its field's glyph, the repeat zone around the body
// with its iteration count and schedule, the loop drawn back up its right side.
//
// layout(tree) → { items, edges, w, h } in units (one per row and column); place() scales and anchors
// it in pixels; drawGraph() returns the SVG; nodeAt / edgeAt hit-test the placed layout.

import { glyphPath } from './glyphs.js';
import { getOp } from '../core/ops.js';

const f1 = (x) => (Math.round(x * 10) / 10).toString();

// rows: an in-dot, each op, an out-dot; a chimera takes 1 (fork) + its longest species + 1 (field) rows
export function layout(t) {
  const items = [], edges = [];
  let oi = 0;
  const ois = new Map();
  // flat op indices, the order the formula keeps them in: scheduled chains, then each chimera's species
  for (const ch of t.chains) for (const n of ch.nodes) ois.set(n.id, oi++);
  for (const ch of t.chains) for (const n of ch.nodes) if (n.species) for (const sp of n.species) for (const m of sp.nodes) ois.set(m.id, oi++);
  let x0 = 0;
  for (const ch of t.chains) {
    const width = Math.max(1, ...ch.nodes.map((n) => (n.species ? n.species.length : 1)));
    const cx = x0 + width / 2;
    let y = 0;
    items.push({ kind: 'in', id: `${ch.id}:in`, x: cx, y });
    const chainEdge = (i, ya, yb, x = cx) => edges.push({ chain: ch.id, index: i, x1: x, y1: ya, x2: x, y2: yb });
    ch.nodes.forEach((n, i) => {
      const yTop = y;
      if (!n.species) {
        y += 1;
        chainEdge(i, yTop, y);
        items.push({ kind: 'op', id: n.id, n, oi: ois.get(n.id), x: cx, y, glyph: getOp(n.op).glyph, chain: ch.id, index: i });
        return;
      }
      // the fork, the species side by side, the field where they join
      const k = n.species.length, rows = Math.max(...n.species.map((sp) => sp.nodes.length));
      y += 1;
      chainEdge(i, yTop, y);
      items.push({ kind: 'fork', id: `${n.id}:fork`, x: cx, y });
      const yFork = y;
      n.species.forEach((sp, s) => {
        const sx = cx + (s - (k - 1) / 2);
        let sy = yFork;
        items.push({ kind: 'branch', x1: cx, y1: yFork, x2: sx, y2: yFork + 0.5 });
        sp.nodes.forEach((m, j) => {
          const ya = j === 0 ? yFork + 0.5 : sy;
          sy = yFork + 0.5 + (j + 0.5) * ((rows) / sp.nodes.length);
          edges.push({ chain: sp.id, index: j, x1: sx, y1: ya, x2: sx, y2: sy });
          items.push({ kind: 'op', id: m.id, n: m, oi: ois.get(m.id), x: sx, y: sy, glyph: getOp(m.op).glyph, chain: sp.id, index: j, species: true });
        });
        edges.push({ chain: sp.id, index: sp.nodes.length, x1: sx, y1: sy, x2: sx, y2: yFork + rows + 1 });
        items.push({ kind: 'branch', x1: sx, y1: sy, x2: cx, y2: yFork + rows + 1 });
      });
      y = yFork + rows + 1;
      items.push({ kind: 'op', id: n.id, n, oi: ois.get(n.id), x: cx, y, glyph: getOp(n.op).glyph, chain: ch.id, index: i, field: true });
    });
    chainEdge(ch.nodes.length, y, y + 1);
    y += 1;
    items.push({ kind: 'out', id: `${ch.id}:out`, x: cx, y });
    x0 += width + 0.6;
  }
  const h = Math.max(...items.filter((q) => q.y !== undefined).map((q) => q.y), 1);
  return { items, edges, w: x0 - 0.6, h, iters: t.iters, schedule: t.schedule, letters: t.chains.map((c) => c.id) };
}

// pixels: a unit is `u` px; the layout's right edge at `right`, centred vertically on `cy`
export function place(L, u, right, cy) {
  const ox = right - L.w * u, oy = cy - (L.h * u) / 2;
  const P = (x, y) => [ox + x * u, oy + y * u];
  const items = L.items.map((q) => {
    if (q.kind === 'branch') { const [x1, y1] = P(q.x1, q.y1), [x2, y2] = P(q.x2, q.y2); return { ...q, x1, y1, x2, y2 }; }
    const [x, y] = P(q.x, q.y);
    return { ...q, x, y };
  });
  const edges = L.edges.map((e) => { const [x1, y1] = P(e.x1, e.y1), [x2, y2] = P(e.x2, e.y2); return { ...e, x1, y1, x2, y2 }; });
  const [zx0, zy0] = P(-0.45, -0.45), [zx1, zy1] = P(L.w + 0.45, L.h + 0.45);
  return { ...L, u, items, edges, zone: [zx0, zy0, zx1, zy1] };
}

// the same placed graph between two placements (unfolding), t in [0, 1]
export function between(a, b, t) {
  const e = t * t * (3 - 2 * t), m = (p, q) => p + (q - p) * e;
  const items = a.items.map((q, i) => {
    const r = b.items[i];
    return q.kind === 'branch' ? { ...q, x1: m(q.x1, r.x1), y1: m(q.y1, r.y1), x2: m(q.x2, r.x2), y2: m(q.y2, r.y2) } : { ...q, x: m(q.x, r.x), y: m(q.y, r.y) };
  });
  const edges = a.edges.map((q, i) => { const r = b.edges[i]; return { ...q, x1: m(q.x1, r.x1), y1: m(q.y1, r.y1), x2: m(q.x2, r.x2), y2: m(q.y2, r.y2) }; });
  return { ...b, u: m(a.u, b.u), items, edges, zone: a.zone.map((v, i) => m(v, b.zone[i])) };
}

// o: { attention (op index), hover (node id), selected (node id), edge (the edge under a held press or
//      the pointer), plus (the hovered edge: a plus beside it),
//      full (unfolded: bigger glyphs, the edges as targets), params: [{ x1, x2, y, v, key, held }] }
export function drawGraph(P, o = {}) {
  const s = [];
  const g = Math.max(10, Math.min(26, P.u * 0.5));
  for (const e of P.edges) s.push(`<path class="ed${o.edge === e ? ' on' : ''}" d="M${f1(e.x1)} ${f1(e.y1 + g * 0.6)}L${f1(e.x2)} ${f1(e.y2 - g * 0.6)}"/>`);
  // the edge under the pointer: a plus beside it, where a hold inserts (the ring of ops)
  if (o.plus) {
    const e = o.plus, mx = (e.x1 + e.x2) / 2 + 14, my = (e.y1 + e.y2) / 2;
    s.push(`<path class="ps" d="M${f1(mx - 4)} ${f1(my)}h8M${f1(mx)} ${f1(my - 4)}v8"/>`);
  }
  for (const q of P.items) {
    if (q.kind === 'branch') s.push(`<path class="br" d="M${f1(q.x1)} ${f1(q.y1)}L${f1(q.x2)} ${f1(q.y2)}"/>`);
    else if (q.kind === 'in' || q.kind === 'out') s.push(`<circle class="io" cx="${f1(q.x)}" cy="${f1(q.y)}" r="${q.kind === 'in' ? 2 : 1.2}"/>`);
    else if (q.kind === 'fork') s.push(`<circle class="fk" cx="${f1(q.x)}" cy="${f1(q.y)}" r="1.5"/>`);
    else {
      const cls = ['nd', q.field ? 'fd' : '', o.hover === q.id ? 'hv' : '', o.selected === q.id ? 'sel' : ''].join(' ');
      s.push(`<g class="${cls}">${glyphPath(q.glyph, q.x, q.y, g)}</g>`);
      if (o.attention === q.oi || o.selected === q.id) s.push(`<rect class="att" x="${f1(q.x - g * 0.65)}" y="${f1(q.y - g * 0.65)}" width="${f1(g * 1.3)}" height="${f1(g * 1.3)}"/>`);
    }
  }
  // the repeat zone: the body, its loop back up the right side, the count and the schedule below
  const [x0, y0, x1, y1] = P.zone;
  s.push(`<path class="zn" d="M${f1(x0)} ${f1(y0)}H${f1(x1)}V${f1(y1)}H${f1(x0)}Z"/>`);
  s.push(`<path class="lp" d="M${f1(x1)} ${f1(y1 - 6)}h8V${f1(y0 + 6)}h-8M${f1(x1 + 3)} ${f1(y0 + 9)}l-3 -3 3 -3"/>`);
  if (!o.full) {
    const sched = P.schedule && P.schedule !== 'A' ? ` ${P.schedule}` : '';
    s.push(`<text class="it" x="${f1((x0 + x1) / 2)}" y="${f1(y1 + 16)}">×${P.iters}${sched}</text>`);
  } else {
    // unfolded: the count, each schedule letter on its own (click one, then a letter key or Delete),
    // a plus that lengthens the word, and a plus beside the last chain that adds a chain
    const L = scheduleLayout(P);
    s.push(`<text class="it" x="${f1(L.count.x)}" y="${f1(L.count.y)}">×${P.iters}</text>`);
    L.letters.forEach((q) => {
      s.push(`<text class="it${o.schedSel === q.i ? ' on' : ''}" x="${f1(q.x)}" y="${f1(q.y)}">${q.ch}</text>`);
      if (o.schedSel === q.i) s.push(`<path class="sl" d="M${f1(q.x - 4)} ${f1(q.y + 4)}h8"/>`);
    });
    s.push(`<path class="ps" d="M${f1(L.plus.x - 4)} ${f1(L.plus.y - 4)}h8M${f1(L.plus.x)} ${f1(L.plus.y - 8)}v8"/>`);
    s.push(`<path class="ps" d="M${f1(L.chainPlus.x - 5)} ${f1(L.chainPlus.y)}h10M${f1(L.chainPlus.x)} ${f1(L.chainPlus.y - 5)}v10"/>`);
  }
  if (o.full && P.letters.length > 1) {
    // the scheduled chains' letters above them
    P.items.filter((q) => q.kind === 'in').forEach((q, i) => s.push(`<text class="lt" x="${f1(q.x)}" y="${f1(q.y - 10)}">${P.letters[i]}</text>`));
  }
  for (const h of o.params || []) {
    s.push(`<g class="pm${h.held ? ' held' : ''}"><path d="M${f1(h.x1)} ${f1(h.y)}H${f1(h.x2)}M${f1(h.x1)} ${f1(h.y - 3)}v6M${f1(h.x2)} ${f1(h.y - 3)}v6"/>`);
    // no words: the value appears while the handle is held; otherwise a tick where a bounded value sits
    if (h.held) s.push(`<text x="${f1((h.x1 + h.x2) / 2)}" y="${f1(h.y - 6)}">${h.v}</text>`);
    else if (h.q && h.q.min !== undefined && h.q.max !== undefined && h.q.max > h.q.min) {
      const tx = h.x1 + ((h.value - h.q.min) / (h.q.max - h.q.min)) * (h.x2 - h.x1);
      s.push(`<path d="M${f1(tx)} ${f1(h.y - 4)}v8"/>`);
    }
    s.push('</g>');
  }
  if (o.thumb) {
    const { x, y, href } = o.thumb, tw = 132, th = 88;
    s.push(`<image href="${href}" x="${f1(x - tw - 18)}" y="${f1(y - th / 2)}" width="${tw}" height="${th}" preserveAspectRatio="xMidYMid slice"/><rect class="tb" x="${f1(x - tw - 18)}" y="${f1(y - th / 2)}" width="${tw}" height="${th}"/>`);
  }
  return `<g class="gr${o.full ? ' full' : ''}">${s.join('')}</g>`;
}

export function nodeAt(P, x, y) {
  let best = null, bd = Math.max(12, P.u * 0.45);
  for (const q of P.items) {
    if (q.kind !== 'op') continue;
    const d = Math.hypot(q.x - x, q.y - y);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

// the insertion edge nearest the point (within reach): { chain, index }
export function edgeAt(P, x, y) {
  let best = null, bd = 10;
  for (const e of P.edges) {
    const dx = e.x2 - e.x1, dy = e.y2 - e.y1, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - e.x1) * dx + (y - e.y1) * dy) / l2));
    const d = Math.hypot(e.x1 + dx * t - x, e.y1 + dy * t - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// where the unfolded graph's count, schedule letters and pluses sit (drawing and hit-testing share it)
export function scheduleLayout(P) {
  const [x0, , x1, y1] = P.zone, cx = (x0 + x1) / 2, y = y1 + 18;
  const word = P.schedule || 'A', step = 11;
  const wordW = word.length * step, total = 34 + wordW + 16;
  const left = cx - total / 2;
  const ins = P.items.filter((q) => q.kind === 'in');
  const lastIn = ins[ins.length - 1];
  return {
    count: { x: left + 14, y },
    letters: [...word].map((ch, i) => ({ ch, i, x: left + 34 + i * step + step / 2, y })),
    plus: { x: left + 34 + wordW + 9, y },
    chainPlus: { x: lastIn.x + Math.max(20, P.u * 0.55), y: lastIn.y },
  };
}
