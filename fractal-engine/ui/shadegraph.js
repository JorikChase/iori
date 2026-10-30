// The shading network drawn (DESIGN.md "Shading"): its own hairline frame beside the formula's repeat
// zone, the formula's readings flowing out of that zone into it along a bus at the frame's top. Nodes
// top to bottom by depth: the readings first, the ramps, maths and mixes below them, the outputs (the
// surface colour, the glow) at the bottom. Inputs are ports on a node's top edge, the output on its
// bottom; links are hairlines. A ramp is drawn as its own gradient — the one place the UI shows colour,
// because it is the colour. A selected ramp opens its editor: a wide bar with its stops as ticks, the
// toggles for interpolation, colour space, mapping mode, log and invert, and the mapping's scale and
// offset as dimension lines. A held stop shows the hue ring.
//
// Drivers → colour: the drivers' values run in on a second bus under the readings' (dashed, as the
// drivers' bindings are), each link from a driver's output down to the input it feeds; a bound line
// carries its band as an op's does (ui/graph.js); a bound stop its band on the ramp's own axis, above
// the bar; the editor's third line is the hue turn; the glow output, selected, shows its gain.
//
// layoutShade(shade) → units; placeShade(L, u, right, top) → pixels; drawShade(P, o) → SVG; hit tests.

import { glyphPath } from './glyphs.js';
import { READINGS, kindOf, rampAt } from '../core/shade.js';
import { rampColourAt, portsOf, inputKind } from '../core/shade-edit.js';

const f1 = (x) => (Math.round(x * 10) / 10).toString();
const NODE_W = 1.25;   // units between nodes in a row
const RAMP_W = 1.0;    // a ramp's bar, in units

// linear RGB → the screen's sRGB, for drawing a ramp's colours
export const toSRGB = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const css = (c) => `rgb(${c.slice(0, 3).map((x) => Math.round(255 * Math.min(1, Math.max(0, toSRGB(x))))).join(',')})`;

export const glyphOf = (n) => (READINGS.includes(n.type) ? n.type : n.type === 'math' ? `math.${n.p.op}` : n.type === 'mixc' ? `mixc.${n.p.mode}` : n.type === 'kali' ? 'kali' : null);

export function layoutShade(shade) {
  if (!shade) return { empty: true, items: [], links: [], outs: [], w: 2, h: 2 };
  const depth = new Map();
  for (const n of shade.nodes) depth.set(n.id, READINGS.includes(n.type) ? 0 : 1 + Math.max(0, ...Object.values(n.in).map((r) => depth.get(r) ?? 0)));
  const rows = [];
  shade.nodes.forEach((n) => { const d = depth.get(n.id); (rows[d] = rows[d] || []).push(n); });
  // rows may have holes: a network fed only by drivers (their bus, not a reading) has nothing at depth 0,
  // and map keeps a hole as undefined, which made the width — and the whole graph's scale — NaN
  const widest = Math.max(2, ...Array.from(rows, (r) => (r ? r.length : 0)));
  const w = widest * NODE_W;
  const items = [];
  rows.forEach((row, d) => (row || []).forEach((n, i) => {
    const x = (w - row.length * NODE_W) / 2 + (i + 0.5) * NODE_W;
    items.push({ id: n.id, n, type: n.type, kind: kindOf(n.type), x, y: 0.9 + d, ramp: n.type === 'ramp', glyph: glyphOf(n) });
  }));
  const yOut = 0.9 + rows.length;
  const outs = [{ port: 'color', x: w / 2 - 0.35, y: yOut }, { port: 'glow', x: w / 2 + 0.35, y: yOut }];
  const at = new Map(items.map((q) => [q.id, q]));
  const links = [];
  for (const q of items) {
    const ports = portsOf(q.type);
    ports.forEach((port, k) => {
      const src = q.n.in[port];
      if (src != null && at.has(src)) links.push({ from: src, to: q.id, port, k, of: ports.length });
    });
  }
  if (shade.out.color && at.has(shade.out.color)) links.push({ from: shade.out.color, to: 'out', port: 'color' });
  if (shade.out.glow && at.has(shade.out.glow)) links.push({ from: shade.out.glow, to: 'out', port: 'glow' });
  return { items, links, outs, w, h: yOut + 0.4 };
}

// pixels: the frame's right edge at `right`, its top at `top`, a unit `u` px
export function placeShade(L, u, right, top, shade) {
  const ox = right - L.w * u, oy = top;
  const P = (x, y) => [ox + x * u, oy + y * u];
  const g = Math.max(10, Math.min(24, u * 0.42));
  const items = L.items.map((q) => { const [x, y] = P(q.x, q.y); return { ...q, x, y, hw: q.ramp ? (RAMP_W * u) / 2 : g / 2, hh: q.ramp ? Math.max(4, u * 0.12) : g / 2 }; });
  const outs = L.outs.map((o) => { const [x, y] = P(o.x, o.y); return { ...o, x, y }; });
  const byId = new Map(items.map((q) => [q.id, q]));
  // an input port on the top edge, spread when a node has several; the output on the bottom edge
  const inPort = (q, k, of) => [q.x + (of > 1 ? (k - (of - 1) / 2) * Math.min(q.hw * 1.4, 14) : 0), q.y - q.hh - 3];
  const outPort = (q) => [q.x, q.y + q.hh + 3];
  const links = L.links.map((l) => {
    const a = byId.get(l.from);
    const b = l.to === 'out' ? outs.find((o) => o.port === l.port) : byId.get(l.to);
    const [x1, y1] = outPort(a), [x2, y2] = l.to === 'out' ? [b.x, b.y - 6] : inPort(b, l.k, l.of);
    return { ...l, x1, y1, x2, y2 };
  });
  const [fx0, fy0] = P(-0.3, 0.2), [fx1, fy1] = P(L.w + 0.3, L.h);
  return { ...L, u, g, items, outs, links, frame: [fx0, fy0, fx1, fy1], inPort, outPort, byId };
}

// the stops' colours sampled along a ramp (interpolation and space included), as an SVG gradient
// (the hue turn included: the bar shows the colours the ramp gives)
const IDENTITY = { scale: 1, offset: 0, mode: 'clamp', log: false, invert: false };
function gradient(id, p, n = 24) {
  const stops = Array.from({ length: n + 1 }, (_, i) => { const t = i / n, c = p.map && p.map.hue ? rampAt({ ...p, map: { ...IDENTITY, hue: p.map.hue } }, t) : rampColourAt(p, t); return `<stop offset="${(t * 100).toFixed(1)}%" stop-color="${css(c)}"/>`; });
  return `<linearGradient id="${id}">${stops.join('')}</linearGradient>`;
}

// o: { hover, selected, link (the link under a held press), drag: { x1, y1, x2, y2 }, bus: [x, y] (where
//      the formula's zone hands its readings over), start (no shade: a plus to begin), params: handles,
//      editor (the selected ramp's), ring (the hue ring), compact }
export function drawShade(P, o = {}) {
  const s = [], defs = [];
  const [x0, y0, x1, y1] = P.frame;
  s.push(`<path class="zn" d="M${f1(x0)} ${f1(y0)}H${f1(x1)}V${f1(y1)}H${f1(x0)}Z"/>`);
  // the bus: the formula's readings, out of its repeat zone and along the frame's top
  if (o.bus) s.push(`<path class="bus" d="M${f1(o.bus[0])} ${f1(o.bus[1])}H${f1(x1)}M${f1(x1)} ${f1(y0 + 4)}H${f1(x0 + 6)}"/>`);
  // the drivers' bus under it, and each driver's link down to the input it feeds
  if (o.drvBus) s.push(`<path class="bl" d="M${f1(o.drvBus[0])} ${f1(o.drvBus[1])}H${f1(x0 + 6)}"/>`);
  for (const l of o.drvLinks || []) s.push(`<path class="bl${l.on ? ' on' : ''}" d="${l.d}"/>`);
  if (P.empty) {
    // no shading yet: the two outputs and a plus that starts it
    for (const out of P.outs) s.push(`<g class="nd">${glyphPath(`out.${out.port}`, out.x, out.y, 14)}</g>`);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 - 8;
    s.push(`<path class="ps start" d="M${f1(cx - 7)} ${f1(cy)}h14M${f1(cx)} ${f1(cy - 7)}v14"/>`);
    return `<g class="gr sh${o.compact ? '' : ' full'}">${s.join('')}</g>`;
  }
  for (const l of P.links) {
    const my = (l.y1 + l.y2) / 2;
    s.push(`<path class="ln${o.link === l ? ' on' : ''}" d="M${f1(l.x1)} ${f1(l.y1)}C${f1(l.x1)} ${f1(my)} ${f1(l.x2)} ${f1(my)} ${f1(l.x2)} ${f1(l.y2)}"/>`);
  }
  // readings tap the bus
  for (const q of P.items.filter((r) => READINGS.includes(r.type))) s.push(`<path class="tap" d="M${f1(q.x)} ${f1(y0 + 4)}V${f1(q.y - q.hh - 2)}"/>`);
  P.items.forEach((q, i) => {
    const cls = ['nd', o.hover === q.id ? 'hv' : '', o.selected === q.id ? 'sel' : ''].join(' ');
    if (q.ramp) {
      const gid = `shg${i}`;
      defs.push(gradient(gid, q.n.p));
      s.push(`<rect class="rb" x="${f1(q.x - q.hw)}" y="${f1(q.y - q.hh)}" width="${f1(q.hw * 2)}" height="${f1(q.hh * 2)}" style="fill:url(#${gid})"/>`);
      s.push(`<rect class="${cls} rf" x="${f1(q.x - q.hw)}" y="${f1(q.y - q.hh)}" width="${f1(q.hw * 2)}" height="${f1(q.hh * 2)}"/>`);
    } else s.push(`<g class="${cls}">${glyphPath(q.glyph, q.x, q.y, P.g)}</g>`);
    if (o.selected === q.id) s.push(`<rect class="att" x="${f1(q.x - q.hw - 4)}" y="${f1(q.y - q.hh - 4)}" width="${f1(q.hw * 2 + 8)}" height="${f1(q.hh * 2 + 8)}"/>`);
    if (!o.compact) {
      portsOf(q.type).forEach((port, k, all) => { const [px, py] = P.inPort(q, k, all.length); s.push(`<circle class="pt ${inputKind(q.type, port)}" cx="${f1(px)}" cy="${f1(py)}" r="1.6"/>`); });
      const [ox, oy] = P.outPort(q);
      s.push(`<circle class="pt out ${q.kind}" cx="${f1(ox)}" cy="${f1(oy)}" r="1.8"/>`);
    }
  });
  for (const out of P.outs) s.push(`<g class="nd op">${glyphPath(`out.${out.port}`, out.x, out.y, o.compact ? 10 : 14)}</g>`);
  if (o.drag) s.push(`<path class="ln on" d="M${f1(o.drag.x1)} ${f1(o.drag.y1)}L${f1(o.drag.x2)} ${f1(o.drag.y2)}"/>`);
  for (const h of o.params || []) s.push(lineSvg(h, h.held, h.v));
  if (o.editor) s.push(drawEditor(o.editor, defs));
  if (o.ring) s.push(drawHueRing(o.ring));
  return `<g class="gr sh${o.compact ? '' : ' full'}"><defs>${defs.join('')}</defs>${s.join('')}</g>`;
}

// ---------- the ramp editor -----------------------------------------------------------------------
export const EDIT_W = 260, EDIT_H = 18;
const TOGGLES = ['interp', 'space', 'mode', 'log', 'invert'];

// where the editor of the ramp q sits: below the shading frame (so it never covers the nodes), under the
// node as far as the screen allows
export function editorLayout(q, W, H, frame = null) {
  const x = Math.max(16, Math.min(W - EDIT_W - 16, q.x - EDIT_W / 2));
  const y = Math.min(H - 120, Math.max(q.y + q.hh + 26, frame ? frame[3] + 30 : 0));
  const p = q.n.p;
  const stops = p.stops.map((st, i) => ({ i, t: st.t, c: st.c, x: x + st.t * EDIT_W, y: y + EDIT_H + 7 }));
  const toggles = TOGGLES.map((key, k) => ({
    // a row under the scale and offset lines, inside the editor's own width
    key, x: x + 12 + k * 30, y: y + EDIT_H + 54,
    glyph: key === 'interp' ? `interp.${p.interp}` : key === 'space' ? `space.${p.space}` : key === 'mode' ? `mode.${p.map.mode}` : key,
    on: key === 'log' ? p.map.log : key === 'invert' ? p.map.invert : true,
  }));
  // scale, offset and the hue turn, three lines in a row
  const lw = (EDIT_W - 20) / 3;
  const handles = [['map.scale', p.map.scale], ['map.offset', p.map.offset], ['map.hue', p.map.hue || 0]].map(([key, v], k) => ({ key, x1: x + k * (lw + 10), x2: x + k * (lw + 10) + lw, y: y + EDIT_H + 30, v }));
  return { id: q.id, p, x, y, w: EDIT_W, h: EDIT_H, stops, toggles, handles };
}

function drawEditor(E, defs) {
  const s = [];
  defs.push(gradient('shedit', E.p, 64));
  s.push(`<rect class="rb" x="${f1(E.x)}" y="${f1(E.y)}" width="${E.w}" height="${E.h}" style="fill:url(#shedit)"/><rect class="rf" x="${f1(E.x)}" y="${f1(E.y)}" width="${E.w}" height="${E.h}"/>`);
  for (const st of E.stops) {
    const sel = E.selStop === st.i;
    s.push(`<path class="tk${sel ? ' sel' : ''}" d="M${f1(st.x)} ${f1(E.y + E.h)}l-5 9h10z"/>`);
    s.push(`<rect class="sw" x="${f1(st.x - 4)}" y="${f1(E.y + E.h + 11)}" width="8" height="8" style="fill:${css(st.c)}"/>`);
  }
  for (const t of E.toggles) s.push(`<g class="nd tg${t.on ? '' : ' off'}">${glyphPath(t.glyph, t.x, t.y, 16)}</g>`);
  for (const h of E.handles) s.push(lineSvg(h, E.held === h.key || h.held, h.text ?? Number(h.v.toPrecision(4))));
  // a bound stop: its band on the bar's own axis, above it
  for (const B of E.stopBands || []) {
    const y = E.y - 6;
    if (B.live != null) s.push(`<path class="lt" d="M${f1(B.live)} ${f1(y - 5)}v10"/>`);
    s.push(`<path class="bd${B.sel ? ' sel' : ''}" d="M${f1(B.x0)} ${f1(y)}H${f1(B.x1)}M${f1(B.x0)} ${f1(y - 4)}v8M${f1(B.x1)} ${f1(y - 4)}v8"/>`);
  }
  return `<g class="ed">${s.join('')}</g>`;
}

// A dimension line: its end ticks, the value while held, a toggle glyph to its left; a bound one its band
// (lo to hi, the ends to drag, a tick at the value the centre's orbit gives it) — as ui/graph.js draws
// an op's
function lineSvg(h, held, text) {
  const s = [`<g class="pm${held ? ' held' : ''}"><path d="M${f1(h.x1)} ${f1(h.y)}H${f1(h.x2)}M${f1(h.x1)} ${f1(h.y - 3)}v6M${f1(h.x2)} ${f1(h.y - 3)}v6"/>`];
  if (h.band) {
    const B = h.band;
    s.push(`<path class="bd${B.sel ? ' sel' : ''}" d="M${f1(B.x0)} ${f1(h.y)}H${f1(B.x1)}M${f1(B.x0)} ${f1(h.y - 5)}v10M${f1(B.x1)} ${f1(h.y - 5)}v10"/>`);
    if (B.tick != null) s.push(`<path class="lt" d="M${f1(B.tick)} ${f1(h.y - 7)}v14"/>`);
    if (held) s.push(`<text x="${f1((h.x1 + h.x2) / 2)}" y="${f1(h.y - 9)}">${text}</text>`);
  } else if (held) s.push(`<text x="${f1((h.x1 + h.x2) / 2)}" y="${f1(h.y - 6)}">${text}</text>`);
  if (h.glyph) s.push(`<g class="nd tg">${glyphPath(h.glyph, h.x1 - 14, h.y, 14)}</g>`);
  s.push('</g>');
  return s.join('');
}

// ---------- the hue ring: angle is hue, distance from the stop is saturation, scroll lightness -----
export const RING_R = 70;
function drawHueRing(r) {
  const s = [`<circle class="hr" cx="${f1(r.x)}" cy="${f1(r.y)}" r="${RING_R}"/>`];
  // the hues as short coloured ticks on the ring (the colour is the thing being chosen)
  for (let k = 0; k < 36; k++) {
    const a = (k / 36) * Math.PI * 2, c = hsvToCss(k / 36, 1, 1);
    s.push(`<path class="ht" style="stroke:${c}" d="M${f1(r.x + Math.cos(a) * (RING_R - 4))} ${f1(r.y + Math.sin(a) * (RING_R - 4))}L${f1(r.x + Math.cos(a) * (RING_R + 4))} ${f1(r.y + Math.sin(a) * (RING_R + 4))}"/>`);
  }
  // saturation rings and the pointer's place
  s.push(`<circle class="hs" cx="${f1(r.x)}" cy="${f1(r.y)}" r="${RING_R / 2}"/>`);
  const a = r.h * Math.PI * 2, d = r.s * RING_R;
  s.push(`<path class="hp" d="M${f1(r.x)} ${f1(r.y)}L${f1(r.x + Math.cos(a) * d)} ${f1(r.y + Math.sin(a) * d)}"/>`);
  s.push(`<circle class="hc" cx="${f1(r.x + Math.cos(a) * d)}" cy="${f1(r.y + Math.sin(a) * d)}" r="9" style="fill:${r.css}"/>`);
  // lightness and alpha as two short scales below
  s.push(`<path class="hl" d="M${f1(r.x - 40)} ${f1(r.y + RING_R + 18)}h80M${f1(r.x - 40 + 80 * r.v)} ${f1(r.y + RING_R + 14)}v8"/>`);
  s.push(`<path class="hl" d="M${f1(r.x - 40)} ${f1(r.y + RING_R + 30)}h80M${f1(r.x - 40 + 80 * r.a)} ${f1(r.y + RING_R + 26)}v8"/>`);
  return `<g class="hring">${s.join('')}</g>`;
}
function hsvToCss(h, sat, v) {
  const hh = (h - Math.floor(h)) * 6, i = Math.floor(hh), f = hh - i, p = v * (1 - sat), q = v * (1 - sat * f), t = v * (1 - sat * (1 - f));
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
  return `rgb(${[r, g, b].map((x) => Math.round(255 * x)).join(',')})`;
}
export { hsvToCss };

// ---------- hit tests ------------------------------------------------------------------------------
export function shadeNodeAt(P, x, y) {
  let best = null, bd = 14;
  for (const q of P.items) {
    const dx = Math.max(0, Math.abs(x - q.x) - q.hw), dy = Math.max(0, Math.abs(y - q.y) - q.hh), d = Math.hypot(dx, dy);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}
// an input port (of a node, or the outputs): { node, port }
export function shadeInPortAt(P, x, y) {
  let best = null, bd = 9;
  for (const q of P.items) portsOf(q.type).forEach((port, k, all) => { const [px, py] = P.inPort(q, k, all.length), d = Math.hypot(x - px, y - py); if (d < bd) { bd = d; best = { node: q.id, port }; } });
  for (const o of P.outs) { const d = Math.hypot(x - o.x, y - o.y); if (d < Math.max(bd, 12)) { bd = d; best = { node: 'out', port: o.port }; } }
  return best;
}
export function shadeOutPortAt(P, x, y) {
  for (const q of P.items) { const [px, py] = P.outPort(q); if (Math.hypot(x - px, y - py) < 8) return q; }
  return null;
}
export function shadeLinkAt(P, x, y) {
  let best = null, bd = 7;
  for (const l of P.links) {
    // the curve, sampled
    const my = (l.y1 + l.y2) / 2;
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, u = 1 - t;
      const px = u * u * u * l.x1 + 3 * u * u * t * l.x1 + 3 * u * t * t * l.x2 + t * t * t * l.x2;
      const py = u * u * u * l.y1 + 3 * u * u * t * my + 3 * u * t * t * my + t * t * t * l.y2;
      const d = Math.hypot(px - x, py - y);
      if (d < bd) { bd = d; best = l; }
    }
  }
  return best;
}
export const inFrame = (P, x, y) => x >= P.frame[0] - 10 && x <= P.frame[2] + 10 && y >= P.frame[1] - 10 && y <= P.frame[3] + 10;
