// masks.js — where a mosh applies (owner request R3). An effect clip carries `masks`: include masks (mosh only here) and
// lock masks (never mosh here), each a union of shapes — brush strokes (round-capped polylines), ellipses, rectangles —
// with a feather, an invert switch, and an opacity and transform (x, y, scale, rotation) that can be keyframed.
// Coverage = (union of include masks, or 1 when there are none) x (1 - union of lock masks); the mosh's output is
// mixed with the clean picture below by it. Shapes live in sequence space: u = 0..1 across the width, v = 0..1 down
// the height; distances (radius, feather) are fractions of the height, so a mask looks the same at any resolution.
// The raster is plain JS (deterministic; both backends upload these very bytes, so GPU and CPU agree bit for bit).
import { resolveAll } from './params.js';

export const MASK_TRANSFORM = { x: [-1, 1, 0.001, 0], y: [-1, 1, 0.001, 0], scale: [0.05, 4, 0.01, 1], rotation: [-180, 180, 0.5, 0], opacity: [0, 1, 0.01, 1] };
export const MASK_MODES = ['include', 'lock'];

/** A new, empty mask. */
export function createMask(mode = 'include', { id, feather = 0.02, invert = false } = {}) {
  return { id, mode, enabled: true, invert, feather, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, shapes: [] };
}
/** The raster size for a working image: the long side at most `max` px, the working aspect kept. */
export function maskSize(W, H, max = 512) { const k = Math.min(1, max / Math.max(W, H)); return [Math.max(8, Math.round(W * k)), Math.max(8, Math.round(H * k))]; }

/** Masks resolved at clip-local frame t (animated opacity and transform become numbers). */
export function resolveMasks(masks, t, clock) { return (masks || []).filter((m) => m.enabled !== false).map((m) => resolveAll(m, t, clock)); }

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Coverage of one shape at point (px, py) (in height units, x scaled by aspect) with edge ramp `fe`. */
function shapeCov(s, px, py, A, fe) {
  let d;                                                   // signed distance in height units: < 0 inside
  if (s.type === 'stroke') {
    const p = s.pts, r = s.r; d = Infinity;
    if (p.length === 2) d = Math.hypot(px - p[0] * A, py - p[1]) - r;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const ax = p[i] * A, ay = p[i + 1], bx = p[i + 2] * A, by = p[i + 3], vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
      const u = l2 > 0 ? clamp01(((px - ax) * vx + (py - ay) * vy) / l2) : 0;
      const e = Math.hypot(px - (ax + u * vx), py - (ay + u * vy)) - r; if (e < d) d = e;
    }
  } else if (s.type === 'ellipse') {
    const dx = (px - s.cx * A) / (s.rx * A), dy = (py - s.cy) / s.ry, k = Math.hypot(dx, dy);
    d = (k - 1) * Math.min(s.rx * A, s.ry);
  } else if (s.type === 'rect') {
    const cx = (s.x + s.w / 2) * A, cy = s.y + s.h / 2, qx = Math.abs(px - cx) - (s.w * A) / 2, qy = Math.abs(py - cy) - s.h / 2;
    d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
  } else return 0;
  return fe > 0 ? clamp01(0.5 - d / fe) : d <= 0 ? 1 : 0;
}

/**
 * Rasterize resolved masks for a working image of aspect A = W / H at mw x mh: a Float32Array RGBA with the coverage in
 * every channel (so the place kernel can resample it like an image). Returns null when there are no active masks.
 */
export function rasterMasks(masks, mw, mh, A) {
  if (!masks || !masks.length) return null;
  const inc = masks.filter((m) => m.mode === 'include'), lock = masks.filter((m) => m.mode === 'lock'), out = new Float32Array(mw * mh * 4);
  const cov = (m, x, y) => {
    // inverse of the mask transform about the frame centre (A / 2, 1 / 2): translate, rotate, scale
    const th = (-m.rotation * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th), sc = Math.max(1e-3, m.scale);
    const dx = x - A / 2 - m.x * A, dy = y - 0.5 - m.y, px = (dx * c - dy * s) / sc + A / 2, py = (dx * s + dy * c) / sc + 0.5, fe = Math.max(0, m.feather) / sc;
    let v = 0; for (const sh of m.shapes) { const q = shapeCov(sh, px, py, A, fe); if (q > v) v = q; if (v >= 1) break; }
    return (m.invert ? 1 - v : v) * clamp01(m.opacity);
  };
  for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
    const x = ((i + 0.5) / mw) * A, y = (j + 0.5) / mh;
    let a = inc.length ? 0 : 1; for (const m of inc) { const q = cov(m, x, y); if (q > a) a = q; }
    let l = 0; if (a > 0) for (const m of lock) { const q = cov(m, x, y); if (q > l) l = q; }
    const v = Math.round(a * (1 - l) * 1024) / 1024, o = (j * mw + i) * 4;   // 1/1024 steps: exact in half floats
    out[o] = out[o + 1] = out[o + 2] = out[o + 3] = v;
  }
  return out;
}

/** Stable key of resolved masks for raster caching. */
export const maskKey = (resolved, mw, mh, A) => JSON.stringify([mw, mh, A, resolved]);
