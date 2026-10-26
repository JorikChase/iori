// The Metasurface drawn: the families' Voronoi cells as hairlines over the dimmed field, each site its
// family's thumbnail (its glyph until the thumbnail is in), each cell's breeding axes as ticks through
// the site, the crosshair where the formula is, hairline spokes to the sites it draws on (brighter the
// more it does), and a stroke while one is drawn. Everything in screen pixels; the caller maps.

import { glyphPath } from './glyphs.js';

const f2 = (v) => v.toFixed(1);
const R = 26;

export function drawSurface(svg, d) {
  const s = ['<g class="ms"><defs>'];
  d.sites.forEach((t, i) => s.push(`<clipPath id="ms${i}"><circle cx="${f2(t.x)}" cy="${f2(t.y)}" r="${R}"/></clipPath>`));
  s.push('</defs>');
  s.push(`<rect class="veil" x="0" y="0" width="${d.w}" height="${d.h}"/>`);
  for (const c of d.cells) s.push(`<path class="cell" d="M${c.map((p) => `${f2(p[0])} ${f2(p[1])}`).join('L')}Z"/>`);
  for (const sp of d.spokes) s.push(`<path class="spoke" style="opacity:${(0.15 + 0.85 * sp.w).toFixed(2)}" d="M${f2(d.cross[0])} ${f2(d.cross[1])}L${f2(sp.x)} ${f2(sp.y)}"/>`);
  d.sites.forEach((t, i) => {
    // the axes the cell breeds along: a tick each way, as long as the cell's radius reaches
    t.axes.forEach((len, a) => {
      const dx = a === 0 ? len : 0, dy = a === 1 ? len : 0;
      s.push(`<path class="axis" d="M${f2(t.x - dx)} ${f2(t.y - dy)}L${f2(t.x - (a === 0 ? R : 0))} ${f2(t.y - (a === 1 ? R : 0))}M${f2(t.x + (a === 0 ? R : 0))} ${f2(t.y + (a === 1 ? R : 0))}L${f2(t.x + dx)} ${f2(t.y + dy)}"/>`);
    });
    if (t.thumb) s.push(`<image href="${t.thumb}" x="${f2(t.x - R * 1.5)}" y="${f2(t.y - R)}" width="${R * 3}" height="${R * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#ms${i})"/>`);
    else s.push(`<g class="gl">${glyphPath(t.glyph, t.x, t.y, 18)}</g>`);
    s.push(`<circle class="site${t.active ? ' on' : ''}" cx="${f2(t.x)}" cy="${f2(t.y)}" r="${R}"/>`);
  });
  if (d.stroke && d.stroke.length > 1) s.push(`<path class="stroke${d.strokeKind === 'field' ? ' field' : ''}" d="M${d.stroke.map((p) => `${f2(p[0])} ${f2(p[1])}`).join('L')}"/>`);
  const [x, y] = d.cross;
  s.push(`<g class="cross"><path d="M${f2(x - 14)} ${f2(y)}H${f2(x - 4)}M${f2(x + 4)} ${f2(y)}H${f2(x + 14)}M${f2(x)} ${f2(y - 14)}V${f2(y - 4)}M${f2(x)} ${f2(y + 4)}V${f2(y + 14)}"/><circle cx="${f2(x)}" cy="${f2(y)}" r="1.5" class="dot"/></g>`);
  s.push('</g>');
  svg.innerHTML = s.join('');
  svg.classList.add('on');
}
