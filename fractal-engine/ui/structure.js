// The structure layer (Tab): what the formula is made of, drawn in hairlines at the edges of the field.
//
//   ruler    left: one notch per iteration (one octave each), the bright notch is the depth reached at
//            the centre of the view, with its number — the Richardson ruler of paper 0
//   strip    right: the formula's graph drawn small (a collage's: its pieces side by side and their joins) — chains, species forks, fields, the repeat zone
//            with the iteration count and schedule; the attention op framed; click to unfold it
//   lineage  bottom left: every formula as a dot, its parent as a hairline; the big dot is now. Hover a
//            dot for its thumbnail, click it to return there
//
// Nothing here has words. Coordinates are CSS pixels.

import { EXPORT_GLYPHS, KEY_GLYPHS } from './glyphs.js';
import { tree } from '../core/graph.js';
import { layout, place, drawGraph } from './graph.js';
import { layoutShade, placeShade, drawShade } from './shadegraph.js';
import { drivenOps } from '../core/drive-edit.js';

// the strip's placement: one unit per row up to 52 px, fitting the height and a 170 px column
// (the shading network beside it, small: one strip, two parts)
export function stripPlacement(f, W, H) {
  const L = layout(tree(f)), S = layoutShade(f.shade);
  const u = Math.min(52, (H - 260) / (Math.max(L.h, S.h) + 1), 230 / (L.w + 0.9 + SHADE_GAP + S.w + 0.6));
  const P = place(L, u, W - 50, H / 2 - 10);
  P.sh = placeShade(S, u, P.zone[0] - SHADE_GAP * u, P.zone[1], f.shade);
  return P;
}
export const SHADE_GAP = 1.2;

const f1 = (x) => (Math.round(x * 10) / 10).toString();

// s: { W, H, formula (normalized), depth (iterations at the centre), attention (op index or null),
//      unfolded (the graph is open: leave the strip to it),
//      lineage (layout nodes), hover (node id or null), pins: [[x, y], …] (screen positions),
//      progress (0..1 while an export runs, else null), step (the drivers' step factor L, or null),
//      strip (a collage's strip, drawn by the caller with its hit rectangle, in place of the formula's),
//      keys ([{ k, on }]: on touch, the row of what has only a key — L, R, M, Space) }
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

  // the op stack: the formula's graph drawn small (ui/graph.js), the same network the unfolded graph
  // edits — chains, species forks, fields, the repeat zone. Click it to unfold it (the app does).
  if (!s.unfolded && s.strip) out.push(s.strip);
  else if (!s.unfolded) {
    const P = stripPlacement(f, W, H);
    out.push(drawGraph(P, { attention: s.attention, driven: drivenOps(f) }));
    // a driven formula: the step factor L as a hairline under the count — a tick from 1 (left) to 16
    if (f.drive && s.step != null) {
      const cx = (P.zone[0] + P.zone[2]) / 2, y = P.zone[3] + 30, at = (Math.log(Math.max(1, s.step)) / Math.log(16)) * 48;
      out.push(`<path class="sf" d="M${f1(cx - 24)} ${f1(y)}h48M${f1(cx - 24 + at)} ${f1(y - 4)}v8"/>`);
    }
    out.push(drawShade(P.sh, { compact: true, bus: [P.zone[0], P.zone[1] + 4] }));
    const [zx0, zy0, zx1, zy1] = P.zone, sx0 = P.sh.frame[0], sy1 = Math.max(zy1, P.sh.frame[3]);
    out.push(`<rect class="hit" data-graph="1" x="${f1(sx0 - 8)}" y="${f1(zy0 - 8)}" width="${f1(zx1 - sx0 + 24)}" height="${f1(sy1 - zy0 + 30)}"/>`);
  }

  // the lineage; on a narrow screen it has the bottom to itself, the exports and keys rise above it
  const narrow = W < 600;
  const L = s.lineage;
  if (L.length) {
    const colW = 18, laneH = 14;
    const maxCol = Math.max(...L.map((q) => q.col));
    const firstCol = Math.max(0, maxCol - (narrow ? Math.floor((W - 104) / colW) : 16));
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

  // exports, bottom right: still, video, splats, mesh — click one; a hairline at the bottom fills as it runs
  out.push('<g class="ex">');
  const ey = narrow ? H - 110 : H - 52;
  ['still', 'video', 'splats', 'mesh'].forEach((k, i) => {
    const ex = W - 190 + i * 44;
    out.push(`<path d="${EXPORT_GLYPHS[k]}" transform="translate(${ex - 12} ${ey - 12})"/>`);
    out.push(`<rect class="hit" data-export="${k}" x="${ex - 18}" y="${ey - 18}" width="36" height="36"/>`);
  });
  out.push('</g>');
  if (s.keys) {
    out.push('<g class="ky">');
    s.keys.forEach(({ k, on }, i) => {
      const kx = W - 190 + i * 44, ky = ey - 44;
      out.push(`<path class="${on ? 'on' : ''}" d="${KEY_GLYPHS[k]}" transform="translate(${kx - 12} ${ky - 12})"/>`);
      out.push(`<rect class="hit" data-key="${k}" x="${kx - 18}" y="${ky - 18}" width="36" height="36"/>`);
    });
    out.push('</g>');
  }
  if (s.progress != null) out.push(`<path class="pg" d="M0 ${H - 1}H${f1(W * s.progress)}"/>`);

  // pins: where the composition is held still
  for (const [px, py] of s.pins || []) out.push(`<g class="pn"><circle cx="${f1(px)}" cy="${f1(py)}" r="6"/><circle class="pd" cx="${f1(px)}" cy="${f1(py)}" r="1.5"/></g>`);

  svg.innerHTML = out.join('');
}
