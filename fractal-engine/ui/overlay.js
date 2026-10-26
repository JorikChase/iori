// The grab overlay: the mathematics of the formula drawn as a technical drawing of itself, in white
// hairlines over the field. Nothing here is decoration — every stroke is an object of the formula:
//
//   handle     the attention op's own geometry in world space, as it acts on the first iteration
//              (a fold plane is that plane, a box fold that box, a sphere fold its two spheres …)
//   reticle    a gimbal of the world axes at the held point; its ticks are the Lyapunov exponent
//              sampled on a ring around the cursor — dense and bright where orbits separate
//   orbit      the held point's real orbit, dots fading, branch changes in the field's second colour.
//              Iterates fly off-screen within a step or two, so the orbit is drawn compressed into the
//              reticle: each iterate keeps its true screen direction from the held point, its distance
//              goes through R·tanh(d / 1.5R) — the first iterates sit where they are, far ones gather
//              at the ring
//   dimension  the attention parameter's value on a dimension line, the only number on screen
//
// Coordinates are CSS pixels. project() needs the camera of the frame the overlay belongs to.

import { glyphPath } from './glyphs.js';
import { getOp } from '../core/ops.js';
import { fmtNum } from '../core/notation.js';
import { rotationXYZ, normalize as nrm } from '../core/vec.js';

const RETICLE = 96;
const BRANCH = '#1fb3a0';

export function makeCamera(cam, basis, tanHalfFov, W, H) {
  const k = H / (2 * tanHalfFov);
  const project = (x) => {
    const d = [x[0] - cam.pos[0], x[1] - cam.pos[1], x[2] - cam.pos[2]];
    const z = d[0] * basis.fwd[0] + d[1] * basis.fwd[1] + d[2] * basis.fwd[2];
    if (z < 1e-5) return null;
    const u = d[0] * basis.right[0] + d[1] * basis.right[1] + d[2] * basis.right[2];
    const v = d[0] * basis.up[0] + d[1] * basis.up[1] + d[2] * basis.up[2];
    return [W / 2 + (k * u) / z, H / 2 - (k * v) / z, z];
  };
  return { project, k, W, H };
}

const f2 = (x) => (Math.round(x * 10) / 10).toString();
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// a polyline through world points, broken where it passes behind the camera
function worldPath(C, pts, closed = false) {
  let d = '', pen = false;
  const all = closed ? [...pts, pts[0]] : pts;
  for (const x of all) {
    const s = C.project(x);
    if (!s) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${f2(s[0])} ${f2(s[1])}`;
    pen = true;
  }
  return d;
}

function circleWorld(C, centre, a, b, r, n = 48) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push(add(add(centre, a, Math.cos(t) * r), b, Math.sin(t) * r));
  }
  return worldPath(C, pts, true);
}

// ---------- handles -------------------------------------------------------------------------------

function handle(C, op, p, hit, size, screen) {
  const P = p;
  const out = [];
  const path = (d, extra = '') => d && d.includes('L') && out.push(`<path d="${d}" ${extra}/>`);
  switch (op) {
    case 'fold.plane': {
      const n = nrm([P.nx, P.ny, P.nz]);
      const off = n[0] * hit[0] + n[1] * hit[1] + n[2] * hit[2] - P.d;
      const o = add(hit, n, -off);
      const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const u = nrm(cross(n, a)), w = cross(n, u);
      const q = [add(add(o, u, size), w, size), add(add(o, u, -size), w, size), add(add(o, u, -size), w, -size), add(add(o, u, size), w, -size)];
      path(worldPath(C, q, true));
      path(worldPath(C, [o, add(o, n, size * 0.6)]));
      break;
    }
    case 'fold.box': {
      const l = P.l, v = [];
      for (let i = 0; i < 8; i++) v.push([(i & 1 ? 1 : -1) * l, (i & 2 ? 1 : -1) * l, (i & 4 ? 1 : -1) * l]);
      for (const [i, j] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) path(worldPath(C, [v[i], v[j]]));
      break;
    }
    case 'fold.sphere': {
      // the two radii as great circles facing the camera, about the origin
      const s0 = C.project([0, 0, 0]);
      if (s0) {
        for (const r of [P.rmin, P.rfix]) out.push(`<circle cx="${f2(s0[0])}" cy="${f2(s0[1])}" r="${f2((r * C.k) / s0[2])}"${r === P.rmin ? ' stroke-dasharray="2 4"' : ''}/>`);
      }
      break;
    }
    case 'scale': {
      // what one unit becomes: nested squares about the held point, outer : inner = |s| : 1
      const R = 34, r = R / Math.max(Math.abs(P.s), 1e-3);
      out.push(`<rect x="${f2(screen[0] - R)}" y="${f2(screen[1] - R)}" width="${f2(2 * R)}" height="${f2(2 * R)}"/>`);
      out.push(`<rect x="${f2(screen[0] - r)}" y="${f2(screen[1] - r)}" width="${f2(2 * r)}" height="${f2(2 * r)}"/>`);
      break;
    }
    case 'rotate': {
      const R = rotationXYZ(P.x, P.y, P.z);
      for (let i = 0; i < 3; i++) {
        const e = [0, 0, 0]; e[i] = 1;
        const re = [R[i], R[3 + i], R[6 + i]];
        path(worldPath(C, [hit, add(hit, e, size)]), 'stroke-dasharray="2 4"');
        path(worldPath(C, [hit, add(hit, re, size)]));
      }
      break;
    }
    case 'translate': {
      path(worldPath(C, [hit, add(hit, [P.x, P.y, P.z])]));
      break;
    }
    case 'bulb': case 'power': {
      const n = Math.max(1, Math.round(P.n));
      path(circleWorld(C, [0, 0, 0], [1, 0, 0], [0, 1, 0], 1));
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        path(worldPath(C, [[Math.cos(t), Math.sin(t), 0], [1.12 * Math.cos(t), 1.12 * Math.sin(t), 0]]));
      }
      break;
    }
    case 'twist': {
      const pts = [];
      for (let i = 0; i <= 64; i++) {
        const z = -1 + (2 * i) / 64, t = (P.a * Math.PI / 180) * z;
        pts.push([Math.cos(t) * 0.8, Math.sin(t) * 0.8, z]);
      }
      path(worldPath(C, pts));
      break;
    }
    default:
      out.push(glyphPath(getOp(op).glyph, screen[0], screen[1] - RETICLE - 44, 28));
  }
  return out.join('');
}

// ---------- the drawing ---------------------------------------------------------------------------

// g: { screen:[x,y], hit:[x,y,z], t, attention:{ op, key, value, glyph }, params (of that op),
//      ring:[{ angle, lambda|null }], lyap:{median,p10,p90}, orbit:{ points, branches } }
export function drawGrab(svg, C, g) {
  const [sx, sy] = g.screen;
  const s = [];
  // the handle, sized to read at the held depth
  const size = g.t * 0.35;
  s.push(`<g class="hd">${handle(C, g.attention.op, g.params, g.hit, size, g.screen)}</g>`);

  // reticle: the outer ring, then the world's axis circles through the held point
  s.push(`<g class="rt"><circle cx="${f2(sx)}" cy="${f2(sy)}" r="${RETICLE}"/>`);
  const Rw = RETICLE / C.k * C.project(g.hit)[2];
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let i = 0; i < 3; i++) s.push(`<path class="ax" d="${circleWorld(C, g.hit, axes[i], axes[(i + 1) % 3], Rw, 64)}"/>`);
  s.push(`<path d="M${sx} ${sy - RETICLE}v6M${sx} ${sy + RETICLE - 6}v6M${sx - RETICLE} ${sy}h6M${sx + RETICLE - 6} ${sy}h6"/>`);
  s.push(`<circle cx="${f2(sx)}" cy="${f2(sy)}" r="1.5" class="dot"/></g>`);

  // Lyapunov ticks: outward from the ring, length and brightness by λ about the view's median
  const half = Math.max((g.lyap.p90 - g.lyap.p10) / 2, 0.05);
  const ticks = [];
  for (const r of g.ring) {
    if (r.lambda == null) continue;
    const x = Math.max(-1, Math.min(1, (r.lambda - g.lyap.median) / half));
    const len = 4 + 10 * Math.max(x, 0);
    const op = 0.3 + 0.7 * ((x + 1) / 2);
    const c = Math.cos(r.angle), sn = Math.sin(r.angle);
    const a = RETICLE + 3, b = a + len;
    ticks.push(`<path d="M${f2(sx + c * a)} ${f2(sy + sn * a)}L${f2(sx + c * b)} ${f2(sy + sn * b)}" opacity="${op.toFixed(2)}"/>`);
  }
  s.push(`<g class="tk">${ticks.join('')}</g>`);

  // the orbit, compressed into the reticle
  const pts = g.orbit.points.map((x) => {
    const q = C.project(x);
    if (!q) return null;
    const dx = q[0] - sx, dy = q[1] - sy, d = Math.hypot(dx, dy);
    if (d < 1e-6) return [sx, sy];
    const r = RETICLE * Math.tanh(d / (1.5 * RETICLE));
    return [sx + (dx * r) / d, sy + (dy * r) / d];
  });
  let line = '', pen = false;
  pts.forEach((q) => { if (!q) { pen = false; return; } line += `${pen ? 'L' : 'M'}${f2(q[0])} ${f2(q[1])}`; pen = true; });
  s.push(`<g class="ob"><path d="${line}"/>`);
  pts.forEach((q, i) => {
    if (!q || q[0] < -50 || q[1] < -50 || q[0] > C.W + 50 || q[1] > C.H + 50) return;
    const fade = Math.max(0.15, 0.95 - i * 0.08);
    const br = i > 0 && g.orbit.branches[i - 1] && g.orbit.branches[i - 1].some((b) => b !== 0);
    s.push(`<circle cx="${f2(q[0])}" cy="${f2(q[1])}" r="${br ? 2.2 : Math.max(0.9, 1.7 - i * 0.1).toFixed(2)}" style="fill:${br ? BRANCH : '#fff'}" opacity="${br ? 1 : fade.toFixed(2)}"/>`);
  });
  s.push('</g>');

  // dimension line with the attention parameter, the op's glyph at its left
  const y = sy - RETICLE - 18, w = 120;
  s.push(`<g class="dm"><path d="M${sx - w / 2} ${y}h${w}M${sx - w / 2} ${y - 5}v10M${sx + w / 2} ${y - 5}v10"/>`);
  s.push(glyphPath(g.attention.glyph, sx - w / 2 - 20, y, 16));
  s.push(`<text x="${sx}" y="${y - 7}">${fmtNum(+g.attention.value.toPrecision(4))}</text></g>`);

  svg.innerHTML = s.join('');
  svg.classList.add('on');
}

export function clearGrab(svg) {
  svg.classList.remove('on');
}

// ---------- the atlas lens ------------------------------------------------------------------------
// l: { W, H, at:[x,y] (crosshair), glyphs:[g1, g2?], values:[v1, v2?], inset:[cx, cy, r] } in CSS px
export function drawLens(svg, l) {
  const s = [];
  const cx = l.W / 2, cy = l.H / 2;
  s.push(`<g class="ln"><path class="axis" d="M24 ${cy}H${l.W - 24}${l.glyphs[1] ? `M${cx} 24V${l.H - 24}` : ''}"/>`);
  s.push(`<circle cx="${f2(l.inset[0])}" cy="${f2(l.inset[1])}" r="${f2(l.inset[2])}"/>`);
  s.push(glyphPath(l.glyphs[0], l.W - 40, cy - 18, 16));
  if (l.glyphs[1]) s.push(glyphPath(l.glyphs[1], cx + 18, 40, 16));
  // the crosshair: where the formula is now
  const [x, y] = l.at;
  s.push(`<path d="M${f2(x)} ${f2(y)}h24M${f2(x)} ${f2(y)}v24"/><circle cx="${f2(x)}" cy="${f2(y)}" r="2" class="dot"/>`);
  s.push(`<text x="${f2(x + 30)}" y="${f2(y - 8)}" class="l">${l.values.map((v) => fmtNum(+v.toPrecision(4))).join('  ')}</text></g>`);
  svg.innerHTML = s.join('');
  svg.classList.add('on');
}

// ---------- the loop's knobs ----------------------------------------------------------------------
// k: { at:[x,y], knobs:[{ value, min, max }, { value, min, max }] } — two hairline knobs at the cursor,
// horizontal drag turns the first, vertical the second; the pointer's angle is the value in its range
export function drawKnobs(svg, k) {
  const [x, y] = k.at;
  const s = ['<g class="kb">'];
  k.knobs.forEach((q, i) => {
    const cx = x + (i ? 44 : -44), cy = y - 70, r = 22;
    const t = (q.value - q.min) / (q.max - q.min);
    const a = (-225 + 270 * Math.max(0, Math.min(1, t))) * Math.PI / 180;
    s.push(`<circle cx="${cx}" cy="${cy}" r="${r}"/>`);
    let ticks = '';
    for (let j = 0; j <= 10; j++) {
      const b = (-225 + 27 * j) * Math.PI / 180;
      ticks += `M${f2(cx + Math.cos(b) * (r + 4))} ${f2(cy + Math.sin(b) * (r + 4))}L${f2(cx + Math.cos(b) * (r + (j % 5 ? 7 : 10)))} ${f2(cy + Math.sin(b) * (r + (j % 5 ? 7 : 10)))}`;
    }
    s.push(`<path class="tk" d="${ticks}"/>`);
    s.push(`<path d="M${cx} ${cy}L${f2(cx + Math.cos(a) * (r - 4))} ${f2(cy + Math.sin(a) * (r - 4))}"/>`);
    s.push(`<text x="${cx}" y="${cy + r + 22}">${fmtNum(+q.value.toPrecision(3))}</text>`);
  });
  s.push(`<path d="M${x - 6} ${y}h12M${x} ${y - 6}v12"/></g>`);
  svg.innerHTML = s.join('');
  svg.classList.add('on');
}

// ---------- the breed ring --------------------------------------------------------------------------
// r: { at:[x,y], items:[{ angle, len, thumb|null, local }], sel (index or -1) } — neighbours around the
// cursor in the order of their feature direction; spoke length is their visual distance
export function drawRing(svg, r) {
  const [x, y] = r.at;
  const R = 38;
  const s = ['<g class="rg"><defs>'];
  r.items.forEach((it, i) => {
    const cx = x + Math.cos(it.angle) * it.len, cy = y + Math.sin(it.angle) * it.len;
    it.cx = cx; it.cy = cy;
    s.push(`<clipPath id="rc${i}"><circle cx="${f2(cx)}" cy="${f2(cy)}" r="${R}"/></clipPath>`);
  });
  s.push('</defs>');
  s.push(`<circle cx="${f2(x)}" cy="${f2(y)}" r="40"/><circle cx="${f2(x)}" cy="${f2(y)}" r="1.5" class="dot"/>`);
  r.items.forEach((it, i) => {
    const c = Math.cos(it.angle), sn = Math.sin(it.angle);
    s.push(`<path class="sp" d="M${f2(x + c * 40)} ${f2(y + sn * 40)}L${f2(it.cx - c * R)} ${f2(it.cy - sn * R)}"/>`);
    if (it.thumb) s.push(`<image href="${it.thumb}" x="${f2(it.cx - R * 1.5)}" y="${f2(it.cy - R)}" width="${R * 3}" height="${R * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#rc${i})"/>`);
    s.push(`<circle class="${i === r.sel ? 'sel' : ''}${it.local ? '' : ' far'}" cx="${f2(it.cx)}" cy="${f2(it.cy)}" r="${R}"/>`);
  });
  s.push('</g>');
  svg.innerHTML = s.join('');
  svg.classList.add('on');
}
