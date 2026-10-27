// The drivers drawn (DESIGN.md "Formula v2 — drivers"): a lane inside the formula's repeat zone, right of
// its chains, for what runs every iteration — the orbit readings and the maths and remaps that read them —
// and a row on the zone's top edge, outside it, for what is read once an orbit: the start, the fields,
// the clock, another parameter. Nodes are glyphs; inputs are dots on a node's top edge, the output a dot
// on its bottom; links between drivers are hairline curves, and every binding is a hairline from its
// driver to the op it drives (to the band on its dimension line while that op is selected).
//
// layoutDrive(drive, L) → units beside the formula's layout L (ui/graph.js); placeDrive(D, P) → pixels
// in the placed graph P; drawDrive(V, o) → SVG; hit tests.

import { glyphPath } from './glyphs.js';
import { ORBIT } from '../core/drive.js';
import { placeOf, driverPorts } from '../core/drive-edit.js';

const f1 = (x) => (Math.round(x * 10) / 10).toString();
const COL = 1.1;      // units between lane columns and rows, and between top-row nodes
const GAP = 0.5;      // units between the chains and the lane

export const driverGlyph = (m) => (m.type === 'math' ? `math.${m.p.op}` : `drv.${m.type}`);
export const typeGlyph = (t) => (t === 'math' ? 'math.add' : `drv.${t}`);

// units: lane nodes in columns by depth (a reading 0, a math node one past the deepest lane node it
// reads), top nodes in a row above the zone; w, h: the formula's layout grown to hold the lane
export function layoutDrive(drive, L) {
  const nodes = (drive && drive.nodes) || [];
  const depth = new Map();
  for (const m of nodes) {
    if (placeOf(m.type) !== 'lane') continue;
    depth.set(m.id, ORBIT.includes(m.type) ? 0 : 1 + Math.max(-1, ...Object.values(m.in).map((r) => (depth.has(r) ? depth.get(r) : -1))));
  }
  const cols = [];
  const lane = [], top = [];
  const x0 = L.w + GAP;
  for (const m of nodes) {
    if (placeOf(m.type) === 'lane') {
      const c = depth.get(m.id), k = (cols[c] = (cols[c] || 0) + 1) - 1;
      lane.push({ id: m.id, n: m, type: m.type, x: x0 + c * COL + COL / 2, y: 0.7 + k * COL, glyph: driverGlyph(m), place: 'lane' });
    } else top.push({ id: m.id, n: m, type: m.type, x: 0.3 + top.length * COL, y: -1.6, glyph: driverGlyph(m), place: 'top' });
  }
  const laneCols = Math.max(1, cols.length), rows = Math.max(0, ...cols.map((r) => r || 0));
  return { lane, top, laneX0: x0 - GAP / 2, w: x0 + laneCols * COL, h: Math.max(L.h, 0.3 + rows * COL), formulaW: L.w };
}

// pixels, in the placement of the formula's graph (P.ox, P.oy: its origin; P.u: a unit)
export function placeDrive(D, P) {
  const { u, ox, oy } = P;
  const g = Math.max(10, Math.min(22, u * 0.42));
  const at = (q) => ({ ...q, x: ox + q.x * u, y: oy + q.y * u, hw: g / 2, hh: g / 2 });
  const items = [...D.lane.map(at), ...D.top.map(at)];
  const byId = new Map(items.map((q) => [q.id, q]));
  const inPort = (q, k, of) => [q.x + (of > 1 ? (k - (of - 1) / 2) * 9 : 0), q.y - q.hh - 3];
  const outPort = (q) => [q.x, q.y + q.hh + 3];
  const links = [];
  for (const q of items) driverPorts(q.type).forEach((port, k, all) => {
    const src = q.n.in[port];
    if (src == null || !byId.has(src)) return;
    const [x1, y1] = outPort(byId.get(src)), [x2, y2] = inPort(q, k, all.length);
    links.push({ from: src, to: q.id, port, x1, y1, x2, y2 });
  });
  const [zx0, zy0, , zy1] = P.zone;
  const lane = [ox + D.laneX0 * u, zy0, P.zone[2], zy1];
  const top = [zx0, zy0 - 2.2 * u, P.zone[2], zy0];
  return { u, g, items, links, byId, inPort, outPort, lane, top };
}

// o: { hover, selected, link (held), drag: { x1, y1, x2, y2 }, binds: [{ to, from, x2, y2, on }] (the
//      bindings' far ends, from the app), params: the selected driver's handles, notch }
export function drawDrive(V, o = {}) {
  const s = [];
  // the lane: a hairline down the zone, left of it (a collage's drivers have none: V.lane null)
  if (V.lane) s.push(`<path class="lnr" d="M${f1(V.lane[0])} ${f1(V.lane[1] + 6)}V${f1(V.lane[3] - 6)}"/>`);
  for (const l of V.links) {
    const my = (l.y1 + l.y2) / 2;
    s.push(`<path class="ln${o.link && o.link.to === l.to && o.link.port === l.port ? ' on' : ''}" d="M${f1(l.x1)} ${f1(l.y1)}C${f1(l.x1)} ${f1(my)} ${f1(l.x2)} ${f1(my)} ${f1(l.x2)} ${f1(l.y2)}"/>`);
  }
  for (const b of o.binds || []) {
    const q = V.byId.get(b.from);
    if (!q) continue;
    const [x1, y1] = V.outPort(q);
    s.push(`<path class="bl${b.on ? ' on' : ''}" d="M${f1(x1)} ${f1(y1)}C${f1(x1)} ${f1(y1 + 40)} ${f1(b.x2 + 50)} ${f1(b.y2)} ${f1(b.x2)} ${f1(b.y2)}"/>`);
  }
  for (const q of V.items) {
    const cls = ['nd', 'dv', o.hover === q.id ? 'hv' : '', o.selected === q.id ? 'sel' : ''].join(' ');
    s.push(`<g class="${cls}">${glyphPath(q.glyph, q.x, q.y, V.g)}</g>`);
    if (o.selected === q.id) s.push(`<rect class="att" x="${f1(q.x - q.hw - 4)}" y="${f1(q.y - q.hh - 4)}" width="${f1(q.hw * 2 + 8)}" height="${f1(q.hh * 2 + 8)}"/>`);
    driverPorts(q.type).forEach((port, k, all) => { const [px, py] = V.inPort(q, k, all.length); s.push(`<circle class="pt" cx="${f1(px)}" cy="${f1(py)}" r="1.6"/>`); });
    const [px, py] = V.outPort(q);
    s.push(`<circle class="pt out" cx="${f1(px)}" cy="${f1(py)}" r="1.8"/>`);
  }
  if (o.drag) s.push(`<path class="ln on" d="M${f1(o.drag.x1)} ${f1(o.drag.y1)}L${f1(o.drag.x2)} ${f1(o.drag.y2)}"/>`);
  if (o.params && o.params.length) {
    const sel = V.byId.get(o.selected);
    if (sel) s.push(`<path class="tie" d="M${f1(sel.x)} ${f1(sel.y + sel.hh + 6)}L${f1(o.params[0].x2)} ${f1(o.params[0].y - 8)}"/>`);
    for (const h of o.params) {
      s.push(`<g class="pm${h.held ? ' held' : ''}">`);
      if (h.line) {
        s.push(`<path d="M${f1(h.x1)} ${f1(h.y)}H${f1(h.x2)}M${f1(h.x1)} ${f1(h.y - 3)}v6M${f1(h.x2)} ${f1(h.y - 3)}v6"/>`);
        if (h.held) s.push(`<text x="${f1((h.x1 + h.x2) / 2)}" y="${f1(h.y - 6)}">${h.v}</text>`);
        else if (h.tick != null) s.push(`<path d="M${f1(h.tick)} ${f1(h.y - 4)}v8"/>`);
      }
      if (h.glyph) s.push(`<g class="nd tg${h.off ? ' off' : ''}">${glyphPath(h.glyph, h.gx, h.y, 14)}</g>`);
      s.push('</g>');
    }
  }
  return `<g class="gr dvg full">${s.join('')}</g>`;
}

// ---------- hit tests ------------------------------------------------------------------------------
export function driveNodeAt(V, x, y) {
  let best = null, bd = 13;
  for (const q of V.items) { const d = Math.hypot(x - q.x, y - q.y); if (d < bd) { bd = d; best = q; } }
  return best;
}
export function driveOutPortAt(V, x, y) {
  for (const q of V.items) { const [px, py] = V.outPort(q); if (Math.hypot(x - px, y - py) < 7) return q; }
  return null;
}
export function driveInPortAt(V, x, y) {
  let best = null, bd = 8;
  for (const q of V.items) driverPorts(q.type).forEach((port, k, all) => { const [px, py] = V.inPort(q, k, all.length), d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; best = { node: q.id, port }; } });
  return best;
}
// a link between drivers ({ to, port }) or a binding's hairline ({ bind: to }) under the point
export function driveLinkAt(V, x, y, binds = []) {
  let best = null, bd = 6;
  const curve = (x1, y1, c1x, c1y, c2x, c2y, x2, y2, hit) => {
    for (let i = 0; i <= 20; i++) {
      const t = i / 20, u = 1 - t;
      const px = u * u * u * x1 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x2;
      const py = u * u * u * y1 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y2;
      const d = Math.hypot(px - x, py - y);
      if (d < bd) { bd = d; best = hit; }
    }
  };
  for (const l of V.links) { const my = (l.y1 + l.y2) / 2; curve(l.x1, l.y1, l.x1, my, l.x2, my, l.x2, l.y2, { to: l.to, port: l.port }); }
  for (const b of binds) {
    const q = V.byId.get(b.from);
    if (!q) continue;
    const [x1, y1] = V.outPort(q);
    curve(x1, y1, x1, y1 + 40, b.x2 + 50, b.y2, b.x2, b.y2, { bind: b.to });
  }
  return best;
}
const inside = (r, x, y) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3];
export const inLane = (V, x, y) => !!V.lane && inside(V.lane, x, y);
export const inTop = (V, x, y) => inside(V.top, x, y);
