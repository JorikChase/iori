// vectors.js — painted motion vectors (owner request R2). A Mosh Loop field op { op: 'paint', amount, mode, strokes }:
// each stroke is a brush drag { pts: [u, v, ...], r, s } in sequence space (u across the width, v down the height; the
// radius r and the push s are fractions of the height, s per frame). Inside the brush the motion follows the drag's
// direction. 'add' pushes the estimated field, 'replace' overrides it where the brush covers at least half a block.
// paintField() turns the strokes into one vec4 per block for the loop's own size, [dx, dy, replace?, 0] in pixels per
// frame with `amount` already applied, so a painted mosh looks the same at any resolution. One JS function feeds both
// the GPU node and the CPU reference: they read the same float32 values and the GPU only adds or selects (D28).
import { dhypot } from './dmath.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Per-block painted field for a loop of w x h with blocks of `block` px: Float32Array(bw * bh * 4). */
export function paintField(op, { w, h, block }) {
  // inputs rounded to float32 first: the CPU reference sees the config through f32All, the GPU node does not
  const f = Math.fround, bw = Math.ceil(w / block), bh = Math.ceil(h / block), out = new Float32Array(bw * bh * 4), A = w / h, amount = f(op.amount ?? 1);
  const strokes = (op.strokes || []).filter((s) => s.pts && s.pts.length >= 4 && s.r > 0).map((s) => ({ pts: s.pts.map(f), r: f(s.r), s: f(s.s ?? 0.01) }));
  if (!strokes.length || !amount) return out;
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const px = (Math.min(w, (bx + 0.5) * block) / h), py = Math.min(h, (by + 0.5) * block) / h;   // block centre in height units
    let sx = 0, sy = 0, best = 0, bxv = 0, byv = 0;
    for (const s of strokes) {
      const p = s.pts; let d = Infinity, tx = 0, ty = 0;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i] * A, ay = p[i + 1], vx = p[i + 2] * A - ax, vy = p[i + 3] - ay, l2 = vx * vx + vy * vy; if (!(l2 > 0)) continue;
        const u = clamp01(((px - ax) * vx + (py - ay) * vy) / l2), e = dhypot(px - (ax + u * vx), py - (ay + u * vy));
        if (e < d) { d = e; const l = Math.sqrt(l2); tx = vx / l; ty = vy / l; }
      }
      const cov = clamp01((s.r - d) / (0.5 * s.r) + 0.5);                // a soft edge half a radius wide
      if (!(cov > 0)) continue;
      const push = (s.s ?? 0.01) * h;                                    // fraction of the height per frame -> pixels per frame
      sx += tx * push * cov; sy += ty * push * cov;
      if (cov > best) { best = cov; bxv = tx * push; byv = ty * push; }
    }
    const o = (by * bw + bx) * 4;
    // the warp reads mv as frame_t(p) = frame_{t-1}(p - mv): content moves along +mv, i.e. along the drag
    if (op.mode === 'replace') { out[o] = Math.fround(bxv * amount); out[o + 1] = Math.fround(byv * amount); out[o + 2] = best >= 0.5 ? 1 : 0; }
    else { out[o] = Math.fround(sx * amount); out[o + 1] = Math.fround(sy * amount); }
  }
  return out;
}

/** Cache key of a paint op for a geometry (the node uploads only when it changes). */
export const paintKey = (op, geo) => JSON.stringify([geo.w, geo.h, geo.block, op.amount, op.mode, op.strokes]);
