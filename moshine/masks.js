// masks.js — where a mosh applies (owner request R3). An effect clip carries `masks`: include masks (mosh only here) and
// lock masks (never mosh here), each a union of shapes — brush strokes (round-capped polylines), ellipses, rectangles —
// with a feather, an invert switch, and an opacity and transform (x, y, scale, rotation) that can be keyframed.
// Coverage = (union of include masks, or 1 when there are none) x (1 - union of lock masks); the mosh's output is
// mixed with the clean picture below by it. Shapes live in sequence space: u = 0..1 across the width, v = 0..1 down
// the height; distances (radius, feather) are fractions of the height, so a mask looks the same at any resolution.
// The raster is plain JS (deterministic; both backends upload these very bytes, so GPU and CPU agree bit for bit).
import { resolve } from './params.js';

export const MASK_TRANSFORM = { x: [-1, 1, 0.001, 0], y: [-1, 1, 0.001, 0], scale: [0.05, 4, 0.01, 1], rotation: [-180, 180, 0.5, 0], opacity: [0, 1, 0.01, 1] };
export const MASK_MODES = ['include', 'lock'];

/** A new, empty mask. */
export function createMask(mode = 'include', { id, feather = 0.02, invert = false } = {}) {
  return { id, mode, enabled: true, invert, feather, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, shapes: [] };
}
/** The raster size for a working image: the long side at most `max` px, the working aspect kept. */
export function maskSize(W, H, max = 512) { const k = Math.min(1, max / Math.max(W, H)); return [Math.max(8, Math.round(W * k)), Math.max(8, Math.round(H * k))]; }

const SCALARS = ['x', 'y', 'scale', 'rotation', 'opacity', 'feather'];
/**
 * Masks resolved at clip-local frame t (animated opacity and transform become numbers). Only the scalars are resolved;
 * shapes are shared, not copied (they are plain numbers, and a painted mask can hold thousands of points). sigOf(mask),
 * when given, labels each result with a signature of its shapes so rasters and coverage can be reused across frames.
 */
export function resolveMasks(masks, t, clock, sigOf = null) {
  return (masks || []).filter((m) => m.enabled !== false).map((m) => {
    const o = { ...m }; for (const k of SCALARS) if (k in m) o[k] = resolve(m[k], t, clock);
    if (sigOf) o.sig = sigOf(m);
    return o;
  });
}
/** A bounded cache of per-mask coverage (before invert and opacity), keyed by shapes signature and geometry. */
export function createCoverageCache(max = 64) {
  const m = new Map();
  return { get: (k) => m.get(k), set(k, v) { m.set(k, v); if (m.size > max) m.delete(m.keys().next().value); }, clear: () => m.clear() };
}
const geomKey = (m, mw, mh, A) => (m.sig === undefined ? null : `${m.sig}|${m.x},${m.y},${m.scale},${m.rotation},${m.feather}|${mw}x${mh}|${A}`);

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
 * Each shape (each stroke segment) is evaluated only over the pixels its coverage can reach and max-combined; coverage
 * falls monotonically with distance, so this equals taking the nearest segment per pixel, bit for bit, at a fraction of
 * the cost (a 60-point stroke at 512 x 288: ~110 ms -> a few ms, D42).
 */
export function rasterMasks(masks, mw, mh, A, cache = null) {
  if (!masks || !masks.length) return null;
  const inc = masks.filter((m) => m.mode === 'include'), lock = masks.filter((m) => m.mode === 'lock'), out = new Float32Array(mw * mh * 4);
  const a = inc.length ? new Float64Array(mw * mh) : null, l = lock.length ? new Float64Array(mw * mh) : null;
  for (const m of inc) unionInto(a, m, mw, mh, A, cache);
  for (const m of lock) unionInto(l, m, mw, mh, A, cache);
  for (let k = 0; k < mw * mh; k++) {
    const av = a ? a[k] : 1, lv = l && av > 0 ? l[k] : 0;
    const v = Math.round(av * (1 - lv) * 1024) / 1024, o = k * 4;   // 1/1024 steps: exact in half floats
    out[o] = out[o + 1] = out[o + 2] = out[o + 3] = v;
  }
  return out;
}

/** dst[k] = max(dst[k], coverage of mask m at pixel k). The shapes' coverage comes from the cache when its key matches. */
function unionInto(dst, m, mw, mh, A, cache) {
  const key = cache && geomKey(m, mw, mh, A);
  let v = key ? cache.get(key) : null;
  if (!v) { v = coverage(m, mw, mh, A); if (key) cache.set(key, v); }
  const op = clamp01(m.opacity);
  for (let k = 0; k < mw * mh; k++) { const q = (m.invert ? 1 - v[k] : v[k]) * op; if (q > dst[k]) dst[k] = q; }
}
/** The union of a mask's shapes (0..1 per pixel, before invert and opacity). */
function coverage(m, mw, mh, A) {
  // inverse of the mask transform about the frame centre (A / 2, 1 / 2): translate, rotate, scale. The per-column and
  // per-row terms are the same expressions as per pixel (x - A / 2 - m.x * A), so the values are unchanged.
  const th = (-m.rotation * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th), sc = Math.max(1e-3, m.scale), fe = Math.max(0, m.feather) / sc;
  const v = new Float64Array(mw * mh), DX = new Float64Array(mw), DY = new Float64Array(mh), H = A / 2;
  for (let i = 0; i < mw; i++) DX[i] = ((i + 0.5) / mw) * A - A / 2 - m.x * A;
  for (let j = 0; j < mh; j++) DY[j] = (j + 0.5) / mh - 0.5 - m.y;
  // a shape-space box -> the pixel range that can see it (forward transform of its corners, one pixel of slack)
  const pixels = (x0, y0, x1, y1) => {
    let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
    for (const [px, py] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      const ex = (px - A / 2) * sc, ey = (py - 0.5) * sc, x = ex * c + ey * s + A / 2 + m.x * A, y = -ex * s + ey * c + 0.5 + m.y;
      X0 = Math.min(X0, x); X1 = Math.max(X1, x); Y0 = Math.min(Y0, y); Y1 = Math.max(Y1, y);
    }
    return [Math.max(0, Math.floor((X0 / A) * mw - 0.5) - 1), Math.max(0, Math.floor(Y0 * mh - 0.5) - 1), Math.min(mw - 1, Math.ceil((X1 / A) * mw - 0.5) + 1), Math.min(mh - 1, Math.ceil(Y1 * mh - 0.5) + 1)];
  };
  const reach = fe / 2 + 1e-9, hard = !(fe > 0);              // coverage is 0 at distance >= fe / 2 (feathered) or > 0 (hard)
  const put = (k, d) => { const q = hard ? (d <= 0 ? 1 : 0) : clamp01(0.5 - d / fe); if (q > v[k]) v[k] = q; };
  for (const sh of m.shapes) {
    if (sh.type === 'stroke') {
      const p = sh.pts, r = sh.r, R = r + reach;
      if (p.length === 2) {
        const ax = p[0] * A, ay = p[1], [i0, j0, i1, j1] = pixels(ax - R, ay - R, ax + R, ay + R);
        for (let j = j0; j <= j1; j++) { const dy = DY[j]; for (let i = i0; i <= i1; i++) { const dx = DX[i], px = (dx * c - dy * s) / sc + H, py = (dx * s + dy * c) / sc + 0.5; put(j * mw + i, Math.hypot(px - ax, py - ay) - r); } }
      }
      for (let n = 0; n + 3 < p.length; n += 2) {
        const ax = p[n] * A, ay = p[n + 1], bx = p[n + 2] * A, by = p[n + 3], vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
        const [i0, j0, i1, j1] = pixels(Math.min(ax, bx) - R, Math.min(ay, by) - R, Math.max(ax, bx) + R, Math.max(ay, by) + R);
        for (let j = j0; j <= j1; j++) {
          const dy = DY[j];
          for (let i = i0; i <= i1; i++) {
            const dx = DX[i], px = (dx * c - dy * s) / sc + H, py = (dx * s + dy * c) / sc + 0.5;
            const u = l2 > 0 ? clamp01(((px - ax) * vx + (py - ay) * vy) / l2) : 0;
            put(j * mw + i, Math.hypot(px - (ax + u * vx), py - (ay + u * vy)) - r);
          }
        }
      }
    } else if (sh.type === 'ellipse') {
      const rxA = sh.rx * A, mn = Math.min(rxA, sh.ry), k = 1 + reach / Math.max(1e-9, mn), ex = rxA * k, ey = sh.ry * k, cxA = sh.cx * A;
      const [i0, j0, i1, j1] = pixels(cxA - ex, sh.cy - ey, cxA + ex, sh.cy + ey);
      for (let j = j0; j <= j1; j++) { const dy = DY[j]; for (let i = i0; i <= i1; i++) {
        const dx = DX[i], px = (dx * c - dy * s) / sc + H, py = (dx * s + dy * c) / sc + 0.5;
        put(j * mw + i, (Math.hypot((px - cxA) / rxA, (py - sh.cy) / sh.ry) - 1) * mn);
      } }
    } else if (sh.type === 'rect') {
      const cx = (sh.x + sh.w / 2) * A, cy = sh.y + sh.h / 2, hw = (sh.w * A) / 2, hh = sh.h / 2;
      const [i0, j0, i1, j1] = pixels(sh.x * A - reach, sh.y - reach, (sh.x + sh.w) * A + reach, sh.y + sh.h + reach);
      for (let j = j0; j <= j1; j++) { const dy = DY[j]; for (let i = i0; i <= i1; i++) {
        const dx = DX[i], px = (dx * c - dy * s) / sc + H, py = (dx * s + dy * c) / sc + 0.5, qx = Math.abs(px - cx) - hw, qy = Math.abs(py - cy) - hh;
        put(j * mw + i, Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0));
      } }
    }
  }
  return v;
}

/**
 * The keep coverage of the lock masks alone (1 = free, 0 = locked), for the loop's in-loop refresh: a lock does nothing,
 * so no mosh builds up underneath it (owner decision 2026-10-10). Include masks do not enter it: outside an include the
 * history keeps building, which is what flows in at the include's edge. Null when no lock is active.
 */
export function rasterLock(masks, mw, mh, A, cache = null) {
  const lock = (masks || []).filter((m) => m.mode === 'lock');
  if (!lock.length) return null;
  const r = rasterMasks(lock, mw, mh, A, cache);
  for (let i = 0; i < r.length; i++) r[i] = Math.round(r[i] * 1024) / 1024;   // already 1/1024 steps: stays exact
  return r;
}

/** Stable key of resolved masks for raster caching: short when every mask carries a shapes signature. */
export const maskKey = (resolved, mw, mh, A) => (resolved.every((m) => m.sig !== undefined)
  ? `${mw}x${mh}|${A}|` + resolved.map((m) => `${m.mode},${m.invert ? 1 : 0},${m.sig},${m.x},${m.y},${m.scale},${m.rotation},${m.feather},${m.opacity}`).join(';')
  : JSON.stringify([mw, mh, A, resolved]));
