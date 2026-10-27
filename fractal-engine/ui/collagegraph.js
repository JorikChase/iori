// A collage's graph drawn (DESIGN.md "Collage (K)", K3): its pieces side by side, each its own formula
// network in its own repeat zone (ui/graph.js), and below each neighbouring pair the join that folds
// them — the joins fold left to right, so join j takes the fold so far on its left and piece j + 1 on
// its right. A join's glyph is the join itself: the zero contour of the kernel applied to two half
// planes meeting at a right angle (union, intersection or subtraction, the fillet, the stairs, the
// bevel; a morph's tilted line), drawn by marching squares. Under it, the seam width as a dimension
// line: as long as the seam is wide on screen at the view's focus (the caller says how many pixels a
// unit is there), with a morph's weight on a fixed line and stairs' steps as ticks. Below the last join,
// the collage's output: its colour, where its own shading opens. The collage's drivers sit in a row
// above the pieces.
//
// layoutCollage(c) → units; placeCollage(L, u, right, cy) → pixels; drawCollage(PC, o) → SVG; hit tests.

import { tree } from '../core/graph.js';
import { joinEval } from '../core/collage.js';
import { layout, place, drawGraph } from './graph.js';
import { glyphPath } from './glyphs.js';

const f1 = (x) => (Math.round(x * 10) / 10).toString();
const GAP = 1.4;        // units between pieces' zones
const JOIN_DY = 1.7;    // units from the tallest piece's bottom to the joins' row

export function layoutCollage(c) {
  let x = 0;
  const pieces = c.pieces.map((q, i) => {
    const L = layout(tree(q.f));
    const at = { i, L, x0: x, cx: x + L.w / 2 };
    x += L.w + GAP;
    return at;
  });
  const w = x - GAP, h = Math.max(...pieces.map((p) => p.L.h));
  const yJ = h + JOIN_DY;
  const joins = c.joins.map((j, k) => ({ k, j, x: (pieces[k].cx + pieces[k + 1].cx) / 2, y: yJ }));
  const last = joins.length ? joins[joins.length - 1] : { x: pieces[0].cx, y: h + 0.6 };
  return { pieces, joins, w, h, out: { x: last.x, y: last.y + 1.5 } };
}

// u px a unit; the layout's right edge at `right`, centred vertically on cy (the drivers' row above)
export function placeCollage(L, u, right, cy) {
  const H = L.out.y + 0.6;
  const ox = right - L.w * u, oy = cy - (H * u) / 2;
  const at = (x, y) => [ox + x * u, oy + y * u];
  const pieces = L.pieces.map((p) => {
    const P = place(p.L, u, ox + (p.x0 + p.L.w) * u, oy + (p.L.h * u) / 2);
    const [ix, iy] = at(p.cx, p.L.h);
    return { ...p, P, zone: P.zone, outAt: [ix, iy + 0.45 * u] };
  });
  const g = Math.max(14, Math.min(30, u * 0.62));
  const joins = L.joins.map((q) => { const [x, y] = at(q.x, q.y); return { ...q, x, y }; });
  const [outX, outY] = at(L.out.x, L.out.y);
  const zone = [Math.min(...pieces.map((p) => p.zone[0])), Math.min(...pieces.map((p) => p.zone[1])), Math.max(...pieces.map((p) => p.zone[2])), outY + g];
  return { u, g, ox, oy, pieces, joins, out: { x: outX, y: outY }, zone, top: [zone[0], zone[1] - 2.4 * u, zone[2], zone[1] - 0.3 * u] };
}

// ---------- the join's glyph: its own contour ----------------------------------------------------------

const N = 22;
const CASES = [[], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 0], [1, 2]], [[0, 2]], [[3, 2]], [[2, 3]], [[2, 0]], [[0, 1], [2, 3]], [[2, 1]], [[1, 3]], [[1, 0]], [[0, 3]], []];

// the zero set of the join of a = x and b = y on [−1, 1]² (y up), as a path centred on (cx, cy)
export function joinGlyph(j, cx, cy, size) {
  const r = j.k === 'hard' ? 0 : 0.55, jj = { ...j, r, n: Math.min(j.n || 4, 6) };
  const d = (x, y) => joinEval(jj, x, y)[0];
  const v = [];
  for (let iy = 0; iy <= N; iy++) for (let ix = 0; ix <= N; ix++) v.push(d(-1 + (2 * ix) / N, -1 + (2 * iy) / N));
  const V = (ix, iy) => v[iy * (N + 1) + ix];
  const P = (x, y) => [cx + (x * size) / 2, cy - (y * size) / 2];
  let s = '';
  for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) {
    const c = [V(ix, iy), V(ix + 1, iy), V(ix + 1, iy + 1), V(ix, iy + 1)];
    const k = (c[0] < 0 ? 1 : 0) | (c[1] < 0 ? 2 : 0) | (c[2] < 0 ? 4 : 0) | (c[3] < 0 ? 8 : 0);
    const x0 = -1 + (2 * ix) / N, y0 = -1 + (2 * iy) / N, h = 2 / N;
    // the crossing on each cell edge: 0 bottom, 1 right, 2 top, 3 left
    const edge = (e) => {
      const [a, b, pa, pb] = [[c[0], c[1], [x0, y0], [x0 + h, y0]], [c[1], c[2], [x0 + h, y0], [x0 + h, y0 + h]], [c[3], c[2], [x0, y0 + h], [x0 + h, y0 + h]], [c[0], c[3], [x0, y0], [x0, y0 + h]]][e];
      const t = a / (a - b);
      return P(pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t);
    };
    for (const [e1, e2] of CASES[k]) { const p = edge(e1), q = edge(e2); s += `M${f1(p[0])} ${f1(p[1])}L${f1(q[0])} ${f1(q[1])}`; }
  }
  return s;
}

// ---------- drawing ------------------------------------------------------------------------------------

// the seam line under join q: { x1, x2, y, ticks } — r on screen (pxPerUnit at the focus), a morph's w
export function seamLine(PC, q, pxPerUnit) {
  const y = q.y + PC.g * 0.95;
  if (q.j.op === 'morph') return { x1: q.x - 30, x2: q.x + 30, y, tick: q.x - 30 + 60 * q.j.w, w: true };
  if (q.j.k === 'hard') return { x1: q.x, x2: q.x, y, hard: true };
  const len = Math.max(6, Math.min(140, q.j.r * pxPerUnit));
  const out = { x1: q.x - len / 2, x2: q.x + len / 2, y, len };
  if (q.j.k === 'stairs') out.steps = q.j.n;
  return out;
}

// o: { selected: { kind: 'piece', i } | { kind: 'join', k } | { kind: 'out' } | null, hover (same shape),
//      full (unfolded), pxPerUnit (at the focus), held: 'J<k>' (the seam line being dragged, with its
//      value), value, lines: [{ x1, x2, y, glyph, gx, held, v, tick, band }] (the selection's numbers),
//      repGlyph: glyph id per piece with a repetition (drawn at its zone's top right corner) }
export function drawCollage(PC, o = {}) {
  const s = [];
  const sel = o.selected || {};
  for (const p of PC.pieces) {
    s.push(drawGraph(p.P, { full: false }));
    if (sel.kind === 'piece' && sel.i === p.i) {
      const [x0, y0, x1, y1] = p.zone;
      s.push(`<path class="psel" d="M${f1(x0 - 5)} ${f1(y0 + 9)}V${f1(y0 - 5)}H${f1(x0 + 9)}M${f1(x1 - 9)} ${f1(y0 - 5)}H${f1(x1 + 5)}V${f1(y0 + 9)}M${f1(x1 + 5)} ${f1(y1 - 9)}V${f1(y1 + 5)}H${f1(x1 - 9)}M${f1(x0 + 9)} ${f1(y1 + 5)}H${f1(x0 - 5)}V${f1(y1 - 9)}"/>`);
    }
    if (o.repGlyph && o.repGlyph[p.i]) s.push(`<g class="nd rp">${glyphPath(o.repGlyph[p.i], p.zone[2] - 2, p.zone[1] - 12, 14)}</g>`);
  }
  // the fold: each piece's output down to its join, the fold so far along the row
  const link = (x1, y1, x2, y2) => `M${f1(x1)} ${f1(y1)}C${f1(x1)} ${f1((y1 + y2) / 2)} ${f1(x2)} ${f1((y1 + y2) / 2)} ${f1(x2)} ${f1(y2)}`;
  const g = PC.g;
  PC.joins.forEach((q, k) => {
    const left = k === 0 ? PC.pieces[0].outAt : [PC.joins[k - 1].x + g * 0.6, PC.joins[k - 1].y];
    const right = PC.pieces[k + 1].outAt;
    s.push(`<path class="cl" d="${k === 0 ? link(left[0], left[1], q.x - g * 0.35, q.y - g * 0.6) : `M${f1(left[0])} ${f1(left[1])}H${f1(q.x - g * 0.6)}`}${link(right[0], right[1], q.x + g * 0.35, q.y - g * 0.6)}"/>`);
    const on = sel.kind === 'join' && sel.k === k, hv = o.hover && o.hover.kind === 'join' && o.hover.k === k;
    s.push(`<g class="nd jn${on ? ' sel' : ''}${hv ? ' hv' : ''}"><path d="${joinGlyph(q.j, q.x, q.y, g)}"/></g>`);
    if (on) s.push(`<rect class="att" x="${f1(q.x - g * 0.65)}" y="${f1(q.y - g * 0.65)}" width="${f1(g * 1.3)}" height="${f1(g * 1.3)}"/>`);
    if (!o.full && !on) return;
    const L = seamLine(PC, q, o.pxPerUnit || 100), held = o.held === `J${k}`;
    if (L.hard) return;
    s.push(`<g class="pm sm${held ? ' held' : ''}"><path d="M${f1(L.x1)} ${f1(L.y)}H${f1(L.x2)}M${f1(L.x1)} ${f1(L.y - 3)}v6M${f1(L.x2)} ${f1(L.y - 3)}v6"/>`);
    if (L.w) s.push(`<path d="M${f1(L.tick)} ${f1(L.y - 5)}v10"/>`);
    if (L.steps) for (let i = 1; i < L.steps; i++) s.push(`<path d="M${f1(L.x1 + ((L.x2 - L.x1) * i) / L.steps)} ${f1(L.y - 2)}v4"/>`);
    if (o.bands && o.bands[`J${k}`]) { const B = o.bands[`J${k}`]; s.push(`<path class="bd${B.sel ? ' sel' : ''}" d="M${f1(B.x0)} ${f1(L.y)}H${f1(B.x1)}"/>`); }
    if (held) s.push(`<text x="${f1(q.x)}" y="${f1(L.y + 15)}">${o.value}</text>`);
    s.push('</g>');
  });
  // the output: the collage's colour (its own shading opens here)
  const last = PC.joins.length ? PC.joins[PC.joins.length - 1] : null, from = last ? [last.x, last.y + g * 0.6] : PC.pieces[0].outAt;
  s.push(`<path class="cl" d="M${f1(from[0])} ${f1(from[1] + (last ? 12 : 0))}V${f1(PC.out.y - g * 0.5)}"/>`);
  const outOn = sel.kind === 'out';
  s.push(`<g class="nd${outOn ? ' sel' : ''}${o.shaded ? ' fd' : ''}">${glyphPath('out.color', PC.out.x, PC.out.y, g * 0.9)}</g>`);
  for (const h of o.lines || []) {
    s.push(`<g class="pm${h.held ? ' held' : ''}"><path d="M${f1(h.x1)} ${f1(h.y)}H${f1(h.x2)}M${f1(h.x1)} ${f1(h.y - 3)}v6M${f1(h.x2)} ${f1(h.y - 3)}v6"/>`);
    if (h.band) {
      const B = h.band;
      s.push(`<path class="bd${B.sel ? ' sel' : ''}" d="M${f1(B.x0)} ${f1(h.y)}H${f1(B.x1)}M${f1(B.x0)} ${f1(h.y - 5)}v10M${f1(B.x1)} ${f1(h.y - 5)}v10"/>`);
    }
    if (h.held) s.push(`<text x="${f1((h.x1 + h.x2) / 2)}" y="${f1(h.y - 6)}">${h.v}</text>`);
    else if (h.tick != null && !h.band) s.push(`<path d="M${f1(h.tick)} ${f1(h.y - 4)}v8"/>`);
    s.push('</g>');
    if (h.glyph) s.push(`<g class="nd tg">${glyphPath(h.glyph, h.gx, h.y, 14)}</g>`);
  }
  return `<g class="gr cg${o.full ? ' full' : ''}">${s.join('')}</g>`;
}

// ---------- hit tests ------------------------------------------------------------------------------

const inside = (r, x, y, m = 0) => x >= r[0] - m && x <= r[2] + m && y >= r[1] - m && y <= r[3] + m;
export const pieceAt = (PC, x, y) => { const p = PC.pieces.find((q) => inside(q.zone, x, y, 6)); return p ? p.i : -1; };
export function joinAt(PC, x, y) {
  let best = -1, bd = PC.g * 0.75;
  PC.joins.forEach((q, k) => { const d = Math.hypot(x - q.x, y - q.y); if (d < bd) { bd = d; best = k; } });
  return best;
}
export function seamAt(PC, x, y, pxPerUnit) {
  return PC.joins.findIndex((q) => { const L = seamLine(PC, q, pxPerUnit); return !L.hard && Math.abs(y - L.y) < 7 && x >= Math.min(L.x1, q.x - 10) - 6 && x <= Math.max(L.x2, q.x + 10) + 6; });
}
export const outAt = (PC, x, y) => Math.hypot(x - PC.out.x, y - PC.out.y) < PC.g * 0.7;
