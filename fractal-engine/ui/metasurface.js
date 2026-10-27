// The Metasurface drawn: the walls as the soft band they are (hairline contours of the leading cell's
// weight, faint where the blend is even, brighter where a cell turns pure; a chimera's walls one hard line) over the dimmed field, each
// site its formula's thumbnail (its glyph until the thumbnail is in), each cell's breeding axes as ticks
// through the site, the crosshair where the formula is, hairline spokes to the sites it draws on
// (brighter the more it does), a stroke while one is drawn, the square's corner marks (bright when the
// families have moved: double-click one to send them home), the drop ring filling while a hold lays
// the formula down, and a site dragged off the square crossed out (yours) or tied to its home (a
// family's). Everything in screen pixels; the caller maps.

import { glyphPath } from './glyphs.js';

const f2 = (v) => v.toFixed(1);
export const SITE_R = 26;
const R = SITE_R;

export function drawSurface(svg, d) {
  const s = ['<g class="ms"><defs>'];
  d.sites.forEach((t, i) => s.push(`<clipPath id="ms${i}"><circle cx="${f2(t.x)}" cy="${f2(t.y)}" r="${R}"/></clipPath>`));
  s.push('</defs>');
  s.push(`<rect class="veil" x="0" y="0" width="${d.w}" height="${d.h}"/>`);
  for (const b of d.bands || []) s.push(`<path class="band" style="opacity:${b.opacity.toFixed(2)}" d="${b.d}"/>`);
  if (d.hard) s.push(`<path class="hard" d="${d.hard}"/>`);
  if (d.corners) {
    const { x0, y0, x1, y1 } = d.corners, k = 12;
    s.push(`<path class="corner${d.corners.on ? ' on' : ''}" d="M${f2(x0)} ${f2(y0 + k)}V${f2(y0)}H${f2(x0 + k)}M${f2(x1 - k)} ${f2(y0)}H${f2(x1)}V${f2(y0 + k)}M${f2(x1)} ${f2(y1 - k)}V${f2(y1)}H${f2(x1 - k)}M${f2(x0 + k)} ${f2(y1)}H${f2(x0)}V${f2(y1 - k)}"/>`);
  }
  for (const sp of d.spokes) s.push(`<path class="spoke" style="opacity:${(0.15 + 0.85 * sp.w).toFixed(2)}" d="M${f2(d.cross[0])} ${f2(d.cross[1])}L${f2(sp.x)} ${f2(sp.y)}"/>`);
  d.sites.forEach((t, i) => {
    // the axes the cell breeds along: a tick each way, as long as the cell's radius reaches
    t.axes.forEach((len, a) => {
      const dx = a === 0 ? len : 0, dy = a === 1 ? len : 0;
      s.push(`<path class="axis" d="M${f2(t.x - dx)} ${f2(t.y - dy)}L${f2(t.x - (a === 0 ? R : 0))} ${f2(t.y - (a === 1 ? R : 0))}M${f2(t.x + (a === 0 ? R : 0))} ${f2(t.y + (a === 1 ? R : 0))}L${f2(t.x + dx)} ${f2(t.y + dy)}"/>`);
    });
    if (t.thumb) s.push(`<image href="${t.thumb}" x="${f2(t.x - R * 1.5)}" y="${f2(t.y - R)}" width="${R * 3}" height="${R * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#ms${i})"${t.off ? ' opacity="0.35"' : ''}/>`);
    else s.push(`<g class="gl">${glyphPath(t.glyph, t.x, t.y, 18)}</g>`);
    s.push(`<circle class="site${t.active ? ' on' : ''}${t.held ? ' held' : ''}" cx="${f2(t.x)}" cy="${f2(t.y)}" r="${R}"/>`);
    if (t.off && t.home) s.push(`<path class="home" d="M${f2(t.x)} ${f2(t.y)}L${f2(t.home[0])} ${f2(t.home[1])}"/><circle class="home" cx="${f2(t.home[0])}" cy="${f2(t.home[1])}" r="3"/>`);
    else if (t.off) { const k = R * 0.7071; s.push(`<path class="gone" d="M${f2(t.x - k)} ${f2(t.y - k)}L${f2(t.x + k)} ${f2(t.y + k)}M${f2(t.x + k)} ${f2(t.y - k)}L${f2(t.x - k)} ${f2(t.y + k)}"/>`); }
  });
  if (d.stroke && d.stroke.length > 1) s.push(`<path class="stroke${d.strokeKind === 'field' ? ' field' : ''}" d="M${d.stroke.map((p) => `${f2(p[0])} ${f2(p[1])}`).join('L')}"/>`);
  if (d.ring) {
    // the drop: an arc filling clockwise from twelve o'clock around where the hold is
    const { x, y, u } = d.ring, a = Math.min(u, 0.9999) * 2 * Math.PI;
    s.push(`<circle class="ring" cx="${f2(x)}" cy="${f2(y)}" r="${R}"/>`);
    if (u > 0) s.push(`<path class="ring on" d="M${f2(x)} ${f2(y - R)}A${R} ${R} 0 ${a > Math.PI ? 1 : 0} 1 ${f2(x + R * Math.sin(a))} ${f2(y - R * Math.cos(a))}"/>`);
  }
  const [x, y] = d.cross;
  s.push(`<g class="cross"><path d="M${f2(x - 14)} ${f2(y)}H${f2(x - 4)}M${f2(x + 4)} ${f2(y)}H${f2(x + 14)}M${f2(x)} ${f2(y - 14)}V${f2(y - 4)}M${f2(x)} ${f2(y + 4)}V${f2(y + 14)}"/><circle cx="${f2(x)}" cy="${f2(y)}" r="1.5" class="dot"/></g>`);
  s.push('</g>');
  svg.innerHTML = s.join('');
  svg.classList.add('on');
}

// a band's contour segments (surface coordinates) as one path in screen pixels
export function bandPath(segs, toScreen) {
  const out = [];
  for (const g of segs) {
    const a = toScreen([g[0], g[1]]), b = toScreen([g[2], g[3]]);
    out.push(`M${f2(a[0])} ${f2(a[1])}L${f2(b[0])} ${f2(b[1])}`);
  }
  return out.join('');
}
