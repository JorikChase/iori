// A collage piece's placement in the field (DESIGN.md "Collage (K)", K3): its affine frame in hairlines
// — three axes from its origin along its turned frame, as long as the piece is (its natural radius ×
// its size, kept between 50 and 170 px on screen), a ring around the origin in the screen's plane, and
// a corner bracket between the first two axes. Drag an axis: the piece moves along it; the ring: it
// turns about the line of sight; the corner: it scales about its origin. While a drag runs, its number
// is a dimension line (the move from where it started, the angle's arc, the size along the corner).
// With the piece's repetition, its cells: a grid's boxes, a mirror's planes, polar spokes and sector
// walls — the original's frame and cell solid, the copies' ghosted.
//
// gizmoGeometry(C, place, R0) → screen geometry (null when the origin is behind the camera);
// gizmoHit(G, x, y) → the handle under the point; drawGizmo(svg, C, G, o) writes the overlay.

import { rotationXYZ } from '../core/vec.js';
import { fromPiece, repCopies } from '../core/collage.js';

const f1 = (x) => (Math.round(x * 10) / 10).toString();
const MIN_PX = 50, MAX_PX = 170;

export function gizmoGeometry(C, place, R0) {
  const O = [place.tx, place.ty, place.tz], o = C.project(O);
  if (!o) return null;
  const R = rotationXYZ(place.rx, place.ry, place.rz);
  const e = [0, 1, 2].map((k) => [R[k], R[3 + k], R[6 + k]]);
  let A = Math.max(place.s * R0, 1e-6);
  const tips = (a) => e.map((v) => C.project([O[0] + v[0] * a, O[1] + v[1] * a, O[2] + v[2] * a]));
  // the longest axis on screen within [MIN_PX, MAX_PX]: the frame keeps its shape, not its size
  for (let it = 0; it < 3; it++) {
    const L = Math.max(...tips(A).map((t) => (t ? Math.hypot(t[0] - o[0], t[1] - o[1]) : 0)));
    if (!(L > 0)) break;
    if (L > MAX_PX) A *= MAX_PX / L; else if (L < MIN_PX) A *= MIN_PX / L; else break;
  }
  const T = tips(A);
  const axes = T.map((t, k) => (t ? { k, tip: [t[0], t[1]], v: [(t[0] - o[0]) / A, (t[1] - o[1]) / A] } : null));
  const Lmax = Math.max(...axes.map((a) => (a ? Math.hypot(a.tip[0] - o[0], a.tip[1] - o[1]) : 0)), MIN_PX);
  const a0 = axes[0] || { tip: [o[0] + Lmax, o[1]] }, a1 = axes[1] || { tip: [o[0], o[1] - Lmax] };
  const corner = [o[0] + (a0.tip[0] - o[0]) * 0.7 + (a1.tip[0] - o[0]) * 0.7, o[1] + (a0.tip[1] - o[1]) * 0.7 + (a1.tip[1] - o[1]) * 0.7];
  return { O: [o[0], o[1]], axes, A, ring: Lmax * 0.55, corner, e };
}

const segDist = (x, y, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
  return Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y);
};

export function gizmoHit(G, x, y) {
  if (!G) return null;
  if (Math.hypot(x - G.corner[0], y - G.corner[1]) < 10) return { kind: 'corner' };
  let best = null, bd = 7;
  for (const a of G.axes) {
    if (!a) continue;
    const from = [G.O[0] + (a.tip[0] - G.O[0]) * 0.3, G.O[1] + (a.tip[1] - G.O[1]) * 0.3];
    const d = segDist(x, y, from, a.tip);
    if (d < bd) { bd = d; best = { kind: 'axis', k: a.k }; }
  }
  if (best) return best;
  if (Math.abs(Math.hypot(x - G.O[0], y - G.O[1]) - G.ring) < 6) return { kind: 'ring' };
  return null;
}

// world segments through the camera; a segment with an end behind it is left out
function segs(C, list) {
  let d = '';
  for (const [a, b] of list) {
    const p = C.project(a), q = C.project(b);
    if (p && q) d += `M${f1(p[0])} ${f1(p[1])}L${f1(q[0])} ${f1(q[1])}`;
  }
  return d;
}

const MAX_CELLS = 125;

// the repetition's cells in world segments: { solid, ghost }
export function repCells(place, rep, R0) {
  const solid = [], ghost = [];
  if (!rep) return { solid, ghost };
  const W = (p) => fromPiece(place, p);
  const frame = (L, o, a, out) => [0, 1, 2].forEach((k) => out.push([W(o), W([0, 1, 2].map((i) => o[i] + L[i * 3 + k] * a))]));
  const copies = repCopies(rep);
  const near = copies.map((c, i) => ({ c, i, d: Math.hypot(...c.o) })).sort((a, b) => a.d - b.d).slice(0, MAX_CELLS);
  if (rep.kind === 'grid') {
    const h = ['x', 'y', 'z'].map((a) => (rep['c' + a] > 0 ? rep['c' + a] / 2 : R0));
    const corners = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
    const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const { c } of near) {
      const out = c.o.every((v) => Math.abs(v) < 1e-12) ? solid : ghost;
      const P = corners.map((s) => W(s.map((v, k) => c.o[k] + v * h[k])));
      for (const [a, b] of E) out.push([P[a], P[b]]);
      if (out === ghost) frame(c.L, c.o, R0 * 0.3, ghost);
    }
  } else if (rep.kind === 'mirror') {
    ['x', 'y', 'z'].forEach((a, k) => {
      if (!rep['m' + a]) return;
      const u = (k + 1) % 3, w = (k + 2) % 3, s = R0 * 1.3;
      const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => { const p = [0, 0, 0]; p[u] = i * s; p[w] = j * s; return W(p); });
      for (let i = 0; i < 4; i++) solid.push([P[i], P[(i + 1) % 4]]);
    });
    for (const { c } of near) if (!c.L.every((v, i) => v === [1, 0, 0, 0, 1, 0, 0, 0, 1][i])) frame(c.L, c.o, R0 * 0.4, ghost);
  } else if (rep.kind === 'polar') {
    const ax = [0, 0, 0], reach = rep.r + R0;
    ax[rep.axis] = reach * 0.8;
    solid.push([W(ax.map((v) => -v)), W(ax)]);
    const sec = (2 * Math.PI) / rep.n, U = [[1, 2], [2, 0], [0, 1]][rep.axis];
    for (const { c, i } of near) {
      (i === 0 ? solid : ghost).push([W([0, 0, 0]), W(c.o)]);
      if (i) frame(c.L, c.o, R0 * 0.3, ghost);
      const th = (i + 0.5) * sec, p = [0, 0, 0];
      p[U[0]] = Math.cos(th) * reach; p[U[1]] = Math.sin(th) * reach;
      ghost.push([W([0, 0, 0]), W(p)]);
    }
  }
  return { solid, ghost };
}

// o: { place, rep, R0, drag: { kind, k, from: [x, y] (the origin where it started), value (text),
//      a0, a1 (the ring's angles) } }
export function drawGizmo(svg, C, G, o) {
  const s = ['<g class="gz">'];
  if (o.rep) {
    const cells = repCells(o.place, o.rep, o.R0);
    s.push(`<path class="rc gh" d="${segs(C, cells.ghost)}"/>`, `<path class="rc" d="${segs(C, cells.solid)}"/>`);
  }
  if (G) {
    const [ox, oy] = G.O, d = o.drag;
    for (const a of G.axes) {
      if (!a) continue;
      const on = d && d.kind === 'axis' && d.k === a.k;
      // the axis, and its number of bars at the tip: one, two, three (x, y, z)
      const dx = a.tip[0] - ox, dy = a.tip[1] - oy, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
      let bars = '';
      for (let b = 0; b <= a.k; b++) { const bx = a.tip[0] - (dx / l) * (4 + b * 4), by = a.tip[1] - (dy / l) * (4 + b * 4); bars += `M${f1(bx - nx * 4)} ${f1(by - ny * 4)}L${f1(bx + nx * 4)} ${f1(by + ny * 4)}`; }
      s.push(`<path class="fx${on ? ' on' : ''}" d="M${f1(ox)} ${f1(oy)}L${f1(a.tip[0])} ${f1(a.tip[1])}${bars}"/>`);
    }
    s.push(`<circle class="ri${d && d.kind === 'ring' ? ' on' : ''}" cx="${f1(ox)}" cy="${f1(oy)}" r="${f1(G.ring)}"/>`);
    const [cx, cy] = G.corner, ux = Math.sign(cx - ox) || 1, uy = Math.sign(cy - oy) || 1;
    s.push(`<path class="co${d && d.kind === 'corner' ? ' on' : ''}" d="M${f1(cx - ux * 9)} ${f1(cy)}H${f1(cx)}V${f1(cy - uy * 9)}"/>`);
    s.push(`<circle class="od" cx="${f1(ox)}" cy="${f1(oy)}" r="1.6"/>`);
    // the drag's number as a dimension line
    if (d && d.kind === 'axis' && d.from) {
      const [x0, y0] = d.from, dx = ox - x0, dy = oy - y0, l = Math.hypot(dx, dy);
      if (l > 1) {
        const nx = (-dy / l) * 16, ny = (dx / l) * 16;
        s.push(`<path class="dl" d="M${f1(x0)} ${f1(y0)}l${f1(nx * 1.2)} ${f1(ny * 1.2)}M${f1(ox)} ${f1(oy)}l${f1(nx * 1.2)} ${f1(ny * 1.2)}M${f1(x0 + nx)} ${f1(y0 + ny)}L${f1(ox + nx)} ${f1(oy + ny)}"/>`);
      }
      s.push(`<text x="${f1((x0 + ox) / 2 + (l > 1 ? (-dy / l) * 28 : 0))}" y="${f1((y0 + oy) / 2 + (l > 1 ? (dx / l) * 28 : -12) + 4)}">${d.value}</text>`);
    } else if (d && d.kind === 'ring') {
      const R = G.ring + 12, a0 = d.a0, a1 = d.a1, big = Math.abs(a1 - a0) > Math.PI ? 1 : 0, sweep = a1 > a0 ? 1 : 0;
      s.push(`<path class="dl" d="M${f1(ox + Math.cos(a0) * (R - 5))} ${f1(oy + Math.sin(a0) * (R - 5))}L${f1(ox + Math.cos(a0) * (R + 5))} ${f1(oy + Math.sin(a0) * (R + 5))}M${f1(ox + Math.cos(a0) * R)} ${f1(oy + Math.sin(a0) * R)}A${f1(R)} ${f1(R)} 0 ${big} ${sweep} ${f1(ox + Math.cos(a1) * R)} ${f1(oy + Math.sin(a1) * R)}M${f1(ox + Math.cos(a1) * (R - 5))} ${f1(oy + Math.sin(a1) * (R - 5))}L${f1(ox + Math.cos(a1) * (R + 5))} ${f1(oy + Math.sin(a1) * (R + 5))}"/>`);
      const am = (a0 + a1) / 2;
      s.push(`<text x="${f1(ox + Math.cos(am) * (R + 18))}" y="${f1(oy + Math.sin(am) * (R + 18) + 4)}">${d.value}</text>`);
    } else if (d && d.kind === 'corner') {
      const dx = cx - ox, dy = cy - oy, l = Math.hypot(dx, dy) || 1, nx = (dy / l) * 14, ny = (-dx / l) * 14;
      s.push(`<path class="dl" d="M${f1(ox + nx)} ${f1(oy + ny)}L${f1(cx + nx)} ${f1(cy + ny)}M${f1(ox + nx * 0.6)} ${f1(oy + ny * 0.6)}l${f1(nx * 0.8)} ${f1(ny * 0.8)}M${f1(cx + nx * 0.6)} ${f1(cy + ny * 0.6)}l${f1(nx * 0.8)} ${f1(ny * 0.8)}"/>`);
      s.push(`<text x="${f1((ox + cx) / 2 + nx * 2)}" y="${f1((oy + cy) / 2 + ny * 2 + 4)}">${d.value}</text>`);
    }
  }
  s.push('</g>');
  // under the hairlines a faint dark halo of the same lines, so the frame reads on a bright surface too
  const body = s.join('');
  svg.innerHTML = body.replace('<g class="gz">', '<g class="gz halo">').replace(/<text[^>]*>[^<]*<\/text>/g, '') + body;
  svg.classList.add('on');
}

// ---------- the drags' maths --------------------------------------------------------------------------

// R = Rz·Ry·Rx (core/vec.js rotationXYZ) back to its angles in degrees
export function eulerXYZ(R) {
  const d = 180 / Math.PI, sy = -R[6];
  if (Math.abs(sy) < 1 - 1e-9) return [Math.atan2(R[7], R[8]) * d, Math.asin(sy) * d, Math.atan2(R[3], R[0]) * d];
  return [Math.atan2(R[1] * sy, R[4]) * d, Math.sign(sy) * 90, 0];
}

// the rotation by angle a (radians) about the unit axis n (Rodrigues), row-major 3×3
export function axisAngle(n, a) {
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c, [x, y, z] = n;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}
