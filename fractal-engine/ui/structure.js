// The structure layer (Tab): what the formula is made of, drawn in hairlines at the edges of the field.
//
//   ruler    left: one notch per iteration (one octave each), the bright notch is the depth reached at
//            the centre of the view, with its number — the Richardson ruler of paper 0
//   strip    right: the op stack as glyphs, slots separated by a gap, the attention op framed, the
//            iteration count and schedule below
//   lineage  bottom left: every formula as a dot, its parent as a hairline; the big dot is now. Hover a
//            dot for its thumbnail, click it to return there
//
// Nothing here has words. Coordinates are CSS pixels.

import { glyphPath } from './glyphs.js';
import { getOp } from '../core/ops.js';

const f1 = (x) => (Math.round(x * 10) / 10).toString();

// s: { W, H, formula (normalized), depth (iterations at the centre), attention (op index or null),
//      lineage (layout nodes), hover (node id or null), pins: [[x, y], …] (screen positions) }
export function drawStructure(svg, s) {
  const out = [];
  const { W, H, formula: f } = s;

  // ruler
  const top = 120, bottom = H - 140, n = f.iters;
  const shown = Math.min(n, 48);
  const step = (bottom - top) / Math.max(shown, 1);
  out.push(`<g class="ru"><path d="M60 ${top}V${bottom}"/>`);
  let ticks = '';
  for (let i = 0; i <= shown; i++) ticks += `M56 ${f1(top + i * step)}h8`;
  out.push(`<path d="${ticks}"/>`);
  const at = top + (Math.min(s.depth, n) / n) * shown * step;
  out.push(`<path class="now" d="M50 ${f1(at)}h20"/><text x="76" y="${f1(at + 4)}">${s.depth}</text></g>`);

  // the op stack
  const ops = [];
  f.slots.forEach((slot, si) => slot.forEach((o, j) => ops.push({ o, si, gap: j === 0 && si > 0 })));
  const pitch = 52;
  const total = ops.length * pitch + ops.filter((q) => q.gap).length * 24;
  let y = Math.max(80, (H - total) / 2);
  const x = W - 74;
  out.push('<g class="st">');
  ops.forEach((q, i) => {
    if (q.gap) { out.push(`<path class="sep" d="M${x - 10} ${f1(y + 4)}h20"/>`); y += 24; }
    out.push(glyphPath(getOp(q.o.op).glyph, x, y + 14, 26));
    if (s.attention === i) out.push(`<rect class="att" x="${x - 17}" y="${f1(y - 3)}" width="34" height="34"/>`);
    y += pitch;
  });
  const sched = f.schedule && f.schedule !== 'A' ? ` ${f.schedule}` : '';
  out.push(`<text x="${x}" y="${f1(y + 12)}">×${f.iters}${sched}</text></g>`);

  // the lineage
  const L = s.lineage;
  if (L.length) {
    const colW = 18, laneH = 14;
    const maxCol = Math.max(...L.map((q) => q.col));
    const firstCol = Math.max(0, maxCol - 16);
    const ox = 80, oy = H - 60;
    const P = new Map(L.map((q) => [q.id, [ox + (q.col - firstCol) * colW, oy - q.lane * laneH]]));
    out.push('<g class="lg">');
    for (const q of L) {
      if (q.parent == null || !P.has(q.parent) || q.col < firstCol) continue;
      const [x1, y1] = P.get(q.parent), [x2, y2] = P.get(q.id);
      out.push(`<path d="M${f1(x1)} ${f1(y1)}H${f1(x2 - 8)}L${f1(x2)} ${f1(y2)}"/>`);
    }
    for (const q of L) {
      if (q.col < firstCol) continue;
      const [px, py] = P.get(q.id);
      out.push(`<circle class="node${q.current ? ' cur' : ''}" data-id="${q.id}" cx="${f1(px)}" cy="${f1(py)}" r="${q.current ? 3 : 1.6}"/>`);
      out.push(`<circle class="hit" data-id="${q.id}" cx="${f1(px)}" cy="${f1(py)}" r="7"/>`);
    }
    const hv = s.hover != null && L.find((q) => String(q.id) === String(s.hover));
    if (hv && hv.thumb && P.has(hv.id)) {
      const [px, py] = P.get(hv.id);
      const tw = 120, th = 80, tx = Math.max(16, px - tw / 2), ty = py - th - 16;
      out.push(`<image href="${hv.thumb}" x="${f1(tx)}" y="${f1(ty)}" width="${tw}" height="${th}" preserveAspectRatio="xMidYMid slice"/>`);
      out.push(`<rect x="${f1(tx)}" y="${f1(ty)}" width="${tw}" height="${th}"/>`);
    }
    out.push('</g>');
  }

  // pins: where the composition is held still
  for (const [px, py] of s.pins || []) out.push(`<g class="pn"><circle cx="${f1(px)}" cy="${f1(py)}" r="6"/><circle class="pd" cx="${f1(px)}" cy="${f1(py)}" r="1.5"/></g>`);

  svg.innerHTML = out.join('');
}
