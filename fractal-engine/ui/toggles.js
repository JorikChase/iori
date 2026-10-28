// The overlay toggles (DESIGN.md "Overlay toggles"): the site's menu mark, restyled as a hairline on this
// page, unfolds a row of glyphs — one per overlay — that folds again after a choice or a few seconds.
// A glyph is dim while its overlay is off and bright while it is on. The row runs leftward from the mark
// along the top; where that does not fit (a phone held upright) it runs down the right side instead.
// Everything in screen pixels: the caller gives the mark's centre.

import { KEY_GLYPHS } from './glyphs.js';

const f1 = (v) => v.toFixed(1);

export const TOGGLE_GLYPHS = {
  // the network: a node forking into two
  graph: 'M12 3a2 2 0 1 0 .01 0M6 17a2 2 0 1 0 .01 0M18 17a2 2 0 1 0 .01 0M12 7v4L7.3 17.6M12 11l4.7 6.6',
  // the shading frame: the ramp's bar, read into the output's disc
  shade: 'M3 4h18v5H3zM7.5 4v5M12 4v5M16.5 4v5M12 9v4M12 14a3.5 3.5 0 1 0 .01 0',
  // the drivers' lane: a wave over the lane's floor
  drive: 'M2 10c3-7 6-7 10 0s7 7 10 0M2 19h20M7 16v3M17 16v3',
  surface: KEY_GLYPHS.surface,
  // a collage: two overlapping contours
  collage: 'M9 6a6 6 0 1 0 .01 0M15 6a6 6 0 1 0 .01 0',
  // the structure layer: the strip over the ruler
  structure: 'M4 4h16v7H4zM9.3 4v7M14.6 4v7M3 20h18M3 20v-4M7.5 20v-2M12 20v-4M16.5 20v-2M21 20v-4',
  lyap: KEY_GLYPHS.lyap,
  // the modes: pull (the field drawn in), push (pushed out), the loop (a circuit)
  'mode.pull': 'M2 12h13M11 8l4 4-4 4M20 4v16',
  'mode.push': 'M22 12H9M13 8l-4 4 4 4M4 4v16',
  'mode.loop': 'M12 4a8 8 0 1 0 .01 0M9 1l3 3-3 3',
};

// the row's order: the drawings first, then what changes the field
export const TOGGLES = ['graph', 'shade', 'drive', 'surface', 'collage', 'structure', 'lyap', 'mode'];

// where each glyph sits: S apart, leftward from the mark (cx, cy) if the row fits the width, else downward
export function toggleLayout(cx, cy, W, H, S) {
  const n = TOGGLES.length, across = cx - n * S - S / 2 >= 8;
  return TOGGLES.map((k, i) => ({ k, x: across ? cx - (i + 1) * S : cx, y: across ? cy : cy + (i + 1) * S }));
}

// items: [{ k, x, y, on, glyph }]; t: 0..1 of the unfold (each glyph slides out from the mark)
export function drawToggles(svg, { items, cx, cy, S, t = 1 }) {
  const g = Math.min(22, S * 0.5), e = 1 - Math.pow(1 - t, 3);
  const s = [];
  for (const q of items) {
    const x = cx + (q.x - cx) * e, y = cy + (q.y - cy) * e, k = g / 24;
    // a dark halo under the hairline (as the gizmo's) keeps a dim glyph legible over a bright field
    const d = `d="${TOGGLE_GLYPHS[q.glyph || q.k]}" transform="translate(${f1(x - g / 2)} ${f1(y - g / 2)}) scale(${k.toFixed(3)})" vector-effect="non-scaling-stroke"`;
    s.push(`<g class="tg${q.on ? ' on' : ''}" style="opacity:${f1(Math.min(1, t * 1.6))}"><path class="halo" ${d}/><path ${d}/>`
      + `<rect class="hit" data-toggle="${q.k}" role="button" aria-label="${q.k}" aria-pressed="${!!q.on}" x="${f1(x - S / 2)}" y="${f1(y - S / 2)}" width="${S}" height="${S}"/></g>`);
  }
  svg.innerHTML = s.join('');
}
