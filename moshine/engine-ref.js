// engine-ref.js — CPU reference of every Mosh Loop stage. The oracle for GPU parity tests, the tool for
// tuning in node, and the tier-0 path. Images are Float32Array RGBA; luma planes are Float32Array; fields
// are Float32Array of vec4 per block: [mvx, mvy, mad, flags] (flags: 1 skip, 4 lost).
//
// Float discipline: every arithmetic step that the WGSL performs in f32 is rounded with fr() here, in the
// same order, so integer-motion paths are bit-exact and the rest differ only where the GPU fuses ops.
import { paintField } from './vectors.js';
import { hash3, toHalfArray, fromHalfArray } from './util.js';
import { OP_CODE } from './config.js';

const fr = Math.fround;
export const EDGE = { clamp: 0, repeat: 1, mirror: 2 };
export const FLAG = { skip: 1, lost: 4 };
export const LUMA = [fr(0.2126), fr(0.7152), fr(0.0722)];       // nominal BT.709 weights (the kernels use lumaPx)
const q15 = (x) => Math.floor((x < 0 ? 0 : x > 1 ? 1 : x) * 32768 + 0.5);
/** Exact integer luma, twin of gpu.js LUMA_WGSL lumaOf: a multiple of 1/32768 in [0, 1]. */
export const lumaPx = (r, g, b) => ((13933 * q15(r) + 46871 * q15(g) + 4732 * q15(b) + 32768) >>> 16) / 32768;
const GAIN_SHAPES = ['rampX', 'rampY', 'invX', 'invY', 'sinX', 'sinY', 'radial', 'mirrorL', 'mirrorR', 'mirrorT', 'mirrorB', 'checker'];
const SYN_KINDS = ['zoom', 'rotate', 'shearX', 'shearY', 'swirl'];

/** Map an out-of-range integer coordinate into [0, n). Same rules as edgeIndex() in WGSL. */
export function edgeIndex(q, n, mode) {
  if (mode === EDGE.repeat) return ((q % n) + n) % n;
  if (mode === EDGE.mirror) { const p = 2 * n; const r = ((q % p) + p) % p; return r < n ? r : p - 1 - r; }
  return q < 0 ? 0 : q >= n ? n - 1 : q;
}
const blocksOf = (w, h, block) => [Math.ceil(w / block), Math.ceil(h / block)];

// ------------------------------------------------------------------------------------------------ luma pyramid
/** Y' = 0.2126 R' + 0.7152 G' + 0.0722 B' (BT.709 weights on gamma-encoded values, like a codec). */
export function luma(img, w, h) {
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = lumaPx(img[i * 4], img[i * 4 + 1], img[i * 4 + 2]);
  return out;
}
/** 2x2 box downsample, dims ceil(w/2) x ceil(h/2), clamped taps. */
export function downsample(src, w, h) {
  const W = Math.ceil(w / 2), H = Math.ceil(h / 2), out = new Float32Array(W * H);
  const at = (x, y) => src[Math.min(y, h - 1) * w + Math.min(x, w - 1)];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    out[y * W + x] = fr(fr(fr(fr(at(2 * x, 2 * y) + at(2 * x + 1, 2 * y)) + at(2 * x, 2 * y + 1)) + at(2 * x + 1, 2 * y + 1)) * 0.25);
  return { data: out, w: W, h: H };
}
export const levelsFor = (block) => (block >= 16 ? 3 : block >= 8 ? 2 : 1);
/** Pyramid of a luma plane: [{data, w, h}] from full resolution down. */
export function pyramid(lum, w, h, levels) {
  const p = [{ data: lum, w, h }];
  for (let l = 1; l < levels; l++) { const q = p[l - 1]; p.push(downsample(q.data, q.w, q.h)); }
  return p;
}

// ------------------------------------------------------------------------------------------------ block matching
const med3 = (a, b, c) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));

/** Mean absolute luma difference of block b at one pyramid level for candidate vector v (backward: cur(p) vs ref(p - v)). */
function madAt(cur, ref, bx, by, bs, vx, vy) {
  const W = cur.w, H = cur.h, x0 = bx * bs, y0 = by * bs, x1 = Math.min(x0 + bs, W), y1 = Math.min(y0 + bs, H);
  const tap = (x, y) => ref.data[Math.min(Math.max(y, 0), H - 1) * W + Math.min(Math.max(x, 0), W - 1)];
  let acc = fr(0);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const sx = fr(x - vx), sy = fr(y - vy), fx0 = Math.floor(sx), fy0 = Math.floor(sy), ax = fr(sx - fx0), ay = fr(sy - fy0);
    let r;
    if (ax === 0 && ay === 0) r = tap(fx0, fy0);
    else {
      const a = tap(fx0, fy0), b = tap(fx0 + 1, fy0), c = tap(fx0, fy0 + 1), d = tap(fx0 + 1, fy0 + 1);
      r = fr(fr(fr(fr(a * fr(1 - ax)) + fr(b * ax)) * fr(1 - ay)) + fr(fr(fr(c * fr(1 - ax)) + fr(d * ax)) * ay));
    }
    acc = fr(acc + Math.abs(fr(cur.data[y * W + x] - r)));
  }
  return fr(acc / ((x1 - x0) * (y1 - y0)));
}

/**
 * Hierarchical block matching (spec §5.3). Coarsest level: full search ±ceil(search / 2^(L-1)) around zero.
 * Finer levels: ±2 (then ±1 at full res) around twice the coarser vector, plus the zero vector, the median
 * predictor (centre, left, top) and, at full res, the previous frame's vector.
 * Integer cost = mad + lambda * 2^-level * L1(v - predictor) in level pixels: the coherence penalty fades on
 * coarse levels (mvtools plevel=2), otherwise it drags the coarse search to zero before the true motion is seen.
 * Sub-pel (8 half-pel neighbours, then 8 quarter-pel) is decided by mad alone.
 * @returns Float32Array vec4 per block [mvx, mvy, mad, 0] and the number of blocks with mad > cutMad.
 */
export function matchBlocks(curP, refP, { block, search, lambda, pel, cutMad, temporal = null }) {
  const L = curP.length, [bw, bh] = blocksOf(curP[0].w, curP[0].h, block);
  let coarse = null, out = null, cut = 0;
  const lam = fr(lambda);
  for (let l = L - 1; l >= 0; l--) {
    const cur = curP[l], ref = refP[l], bs = block >> l, unit = fr(2 ** -l), final = l === 0;
    const radius = coarse ? (final ? 1 : 2) : Math.ceil(search / 2 ** (L - 1));
    const res = new Float32Array(bw * bh * 4);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      const bi = by * bw + bx;
      let cx = 0, cy = 0, px = 0, py = 0;
      if (coarse) {
        cx = fr(2 * coarse[bi * 4]); cy = fr(2 * coarse[bi * 4 + 1]);
        const li = by * bw + (bx === 0 ? bx : bx - 1), ti = (by === 0 ? by : by - 1) * bw + bx;
        px = med3(cx, fr(2 * coarse[li * 4]), fr(2 * coarse[ti * 4])); py = med3(cy, fr(2 * coarse[li * 4 + 1]), fr(2 * coarse[ti * 4 + 1]));
      }
      const cost = (vx, vy) => { const m = madAt(cur, ref, bx, by, bs, vx, vy); return [fr(m + fr(fr(lam * unit) * fr(Math.abs(fr(vx - px)) + Math.abs(fr(vy - py))))), m]; };
      let best = cost(cx, cy), bvx = cx, bvy = cy;
      const tryV = (vx, vy) => { const c = cost(vx, vy); if (c[0] < best[0]) { best = c; bvx = vx; bvy = vy; } };
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) if (dx || dy) tryV(fr(cx + dx), fr(cy + dy));
      tryV(0, 0);
      if (coarse) tryV(px, py);
      if (final && temporal) tryV(Math.floor(fr(temporal[bi * 4] + 0.5)), Math.floor(fr(temporal[bi * 4 + 1] + 0.5)));
      if (final && pel >= 2) {
        let bm = best[1];
        for (const s of pel >= 4 ? [0.5, 0.25] : [0.5]) {
          const ox = bvx, oy = bvy;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) {
            const vx = fr(ox + dx * s), vy = fr(oy + dy * s), m = madAt(cur, ref, bx, by, bs, vx, vy);
            if (m < bm) { bm = m; bvx = vx; bvy = vy; }
          }
        }
        best = [best[0], bm];
      }
      res[bi * 4] = bvx; res[bi * 4 + 1] = bvy; res[bi * 4 + 2] = best[1];
      if (final && best[1] > fr(cutMad)) cut++;
    }
    coarse = res; out = res;
  }
  return { field: out, cut };
}

// ------------------------------------------------------------------------------------------------ optical flow
/**
 * Dense-ish optical flow: pyramidal Lucas–Kanade per cell (cell = block size, typically 4 or 8), 4 Gauss–Newton
 * iterations per level over the cell plus a 2-pixel margin, Tikhonov-regularised normal equations, steps clamped
 * to 2 px. Same backward convention: cur(p) = ref(p - d). Output vec4 per cell [dx, dy, mad, 0] and the cut count.
 */
export function flowCells(curP, refP, { block, cutMad }) {
  const L = curP.length, [bw, bh] = blocksOf(curP[0].w, curP[0].h, block);
  let coarse = null, cut = 0;
  for (let l = L - 1; l >= 0; l--) {
    const cur = curP[l], ref = refP[l], W = cur.w, H = cur.h, bs = Math.max(1, block >> l), res = new Float32Array(bw * bh * 4), M = 2;
    const tap = (x, y) => ref.data[Math.min(Math.max(y, 0), H - 1) * W + Math.min(Math.max(x, 0), W - 1)];
    const bil = (sx, sy) => { const x0 = Math.floor(sx), y0 = Math.floor(sy), ax = fr(sx - x0), ay = fr(sy - y0); return fr(fr(fr(fr(tap(x0, y0) * fr(1 - ax)) + fr(tap(x0 + 1, y0) * ax)) * fr(1 - ay)) + fr(fr(fr(tap(x0, y0 + 1) * fr(1 - ax)) + fr(tap(x0 + 1, y0 + 1) * ax)) * ay)); };
    const J = (x, y) => cur.data[Math.min(Math.max(y, 0), H - 1) * W + Math.min(Math.max(x, 0), W - 1)];
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      const bi = by * bw + bx, x0 = bx * bs, y0 = by * bs, x1 = Math.min(x0 + bs, W), y1 = Math.min(y0 + bs, H);
      let dx = coarse ? fr(2 * coarse[bi * 4]) : 0, dy = coarse ? fr(2 * coarse[bi * 4 + 1]) : 0;
      if (x0 < W && y0 < H) for (let it = 0; it < 4; it++) {
        let gxx = fr(0), gxy = fr(0), gyy = fr(0), ex = fr(0), ey = fr(0), n = 0;
        for (let y = y0 - M; y < y1 + M; y++) for (let x = x0 - M; x < x1 + M; x++) {
          const sx = fr(x - dx), sy = fr(y - dy), I = bil(sx, sy), Ix = fr(fr(bil(fr(sx + 1), sy) - bil(fr(sx - 1), sy)) * 0.5), Iy = fr(fr(bil(sx, fr(sy + 1)) - bil(sx, fr(sy - 1))) * 0.5), e = fr(J(x, y) - I);
          gxx = fr(gxx + fr(Ix * Ix)); gxy = fr(gxy + fr(Ix * Iy)); gyy = fr(gyy + fr(Iy * Iy)); ex = fr(ex + fr(Ix * e)); ey = fr(ey + fr(Iy * e)); n++;
        }
        const reg = fr(fr(1e-4) * n), a = fr(gxx + reg), c = fr(gyy + reg), det = fr(fr(a * c) - fr(gxy * gxy));
        const sx = Math.min(2, Math.max(-2, fr(-fr(fr(fr(c * ex) - fr(gxy * ey)) / det)))), sy = Math.min(2, Math.max(-2, fr(-fr(fr(fr(a * ey) - fr(gxy * ex)) / det))));
        dx = fr(dx + sx); dy = fr(dy + sy);
      }
      res[bi * 4] = dx; res[bi * 4 + 1] = dy;
      if (l === 0) {
        let acc = fr(0); for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) acc = fr(acc + Math.abs(fr(J(x, y) - bil(fr(x - dx), fr(y - dy)))));
        res[bi * 4 + 2] = fr(acc / ((x1 - x0) * (y1 - y0))); if (res[bi * 4 + 2] > fr(cutMad)) cut++;
      }
    }
    coarse = res;
  }
  return { field: coarse, cut };
}

// ------------------------------------------------------------------------------------------------ field ops
/** One field operation (OPS in config.js) at frame t. Input field is not modified. */
export function fieldOp(field, o, ctx) {
  const { w, h, block, t, seed } = ctx;
  if (o.op === 'paint') {                                              // R2: painted vectors (vectors.js), add or select only
    const P = paintField(o, { w, h, block }), out = new Float32Array(field), rep = o.mode === 'replace';
    for (let i = 0; i < out.length; i += 4) { if (rep) { if (P[i + 2] >= 0.5) { out[i] = P[i]; out[i + 1] = P[i + 1]; } } else { out[i] = fr(field[i] + P[i]); out[i + 1] = fr(field[i + 1] + P[i + 1]); } }
    return out;
  }
  const [bw, bh] = blocksOf(w, h, block), out = new Float32Array(field), code = OP_CODE[o.op];
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const i = (by * bw + bx) * 4;
    let mx = field[i], my = field[i + 1], fl = field[i + 3];
    const u = fr(fr(bx + 0.5) / bw), v = fr(fr(by + 0.5) / bh);
    if (code === 0) { mx = fr(mx + fr(o.x)); my = fr(my + fr(o.y)); }
    else if (code === 1) { mx = fr(mx * fr(o.gx)); my = fr(my * fr(o.gy)); }
    else if (code === 2) {
      const cell = Math.max(1, o.cell | 0), hold = Math.max(1, o.hold | 0), th = Math.floor(t / hold), cxi = Math.floor(bx / cell), cyi = Math.floor(by / cell);
      if (hash3(bx * 7919 + by, t, seed * 4 + 3) < fr(o.mismatch)) { const j = (Math.min(by + 1, bh - 1) * bw + Math.min(bx + 1, bw - 1)) * 4; mx = field[j]; my = field[j + 1]; }
      const amp = fr(o.amp);
      mx = fr(mx + fr(fr(fr(hash3(cxi * 7919 + cyi, th, seed * 4) - 0.5) * 2) * amp));
      my = fr(my + fr(fr(fr(hash3(cxi * 7919 + cyi, th, seed * 4 + 1) - 0.5) * 2) * amp));
    } else if (code === 3) {
      const r = o.radius | 0; let sx = fr(0), sy = fr(0), n = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const j = (Math.min(Math.max(by + dy, 0), bh - 1) * bw + Math.min(Math.max(bx + dx, 0), bw - 1)) * 4; sx = fr(sx + field[j]); sy = fr(sy + field[j + 1]); n++;
      }
      mx = fr(sx / n); my = fr(sy / n);
    } else if (code === 4) {
      const s = GAIN_SHAPES.indexOf(o.shape), f = fr(o.freq), ph = fr(o.phase), TAU = fr(6.283185307179586);
      let g = 1;
      if (s === 0) g = u; else if (s === 1) g = v; else if (s === 2) g = fr(1 - u); else if (s === 3) g = fr(1 - v);
      else if (s === 4) g = fr(0.5 + fr(0.5 * fr(Math.sin(fr(TAU * fr(fr(f * u) + ph))))));
      else if (s === 5) g = fr(0.5 + fr(0.5 * fr(Math.sin(fr(TAU * fr(fr(f * v) + ph))))));
      else if (s === 6) { const dx = fr(u - 0.5), dy = fr(v - 0.5); g = fr(Math.max(0, fr(1 - fr(2 * fr(Math.sqrt(fr(fr(dx * dx) + fr(dy * dy)))))))); }
      else if (s === 7) g = u < 0.5 ? 1 : 0; else if (s === 8) g = u >= 0.5 ? 1 : 0; else if (s === 9) g = v < 0.5 ? 1 : 0; else if (s === 10) g = v >= 0.5 ? 1 : 0;
      else if (s === 11) { const c = Math.max(1, Math.floor(fr(o.freq) + 0.5)); g = ((Math.floor(bx / c) + Math.floor(by / c)) & 1) ? 1 : 0; }
      const k = fr(fr(1 - fr(o.amount)) + fr(fr(o.amount) * g));
      mx = fr(mx * k); my = fr(my * k);
    } else if (code === 5) {
      const kind = SYN_KINDS.indexOf(o.kind), k = fr(o.strength);
      const px = fr(fr(bx * block) + fr(block * 0.5)), py = fr(fr(by * block) + fr(block * 0.5)), cx = fr(fr(o.cx) * w), cy = fr(fr(o.cy) * h);
      const dx = fr(px - cx), dy = fr(py - cy); let sx = 0, sy = 0;
      if (kind === 0) { sx = fr(dx * k); sy = fr(dy * k); }
      else if (kind === 1 || kind === 4) {
        let a = k;
        if (kind === 4) { const dm = fr(fr(0.5) * fr(Math.min(w, h))), d = fr(Math.sqrt(fr(fr(dx * dx) + fr(dy * dy)))); a = fr(fr(k * 10) * fr(Math.max(0, fr(1 - fr(d / dm))))); }
        const c = fr(Math.cos(a)), s = fr(Math.sin(a));
        sx = fr(dx - fr(fr(c * dx) + fr(s * dy))); sy = fr(dy - fr(fr(c * dy) - fr(s * dx)));
      } else if (kind === 2) sx = fr(fr(dy * k) * 4);
      else if (kind === 3) sy = fr(fr(dx * k) * 4);
      const b = fr(o.blend);
      if (o.mode === 'add') { mx = fr(mx + fr(sx * b)); my = fr(my + fr(sy * b)); }
      else { mx = fr(mx + fr(fr(sx - mx) * b)); my = fr(my + fr(fr(sy - my) * b)); }
    } else if (code === 6) {
      if (lostAt(bx, by, t, o, seed)) { mx = 0; my = 0; fl = fl | FLAG.lost; }
    } else if (code === 7) {
      if (Math.max(Math.abs(mx), Math.abs(my)) < fr(o.eps) && field[i + 2] < fr(o.mad)) { mx = 0; my = 0; fl = fl | FLAG.skip; }
    } else if (code === 8) {
      // selective amplify: rank by |mv|^2 (ties by index), exact on both sides
      const nb = bw * bh, bi = by * bw + bx, mb = fr(fr(field[i] * field[i]) + fr(field[i + 1] * field[i + 1])), fastest = o.which !== 'slowest'; let rank = 0;
      for (let j = 0; j < nb; j++) { const mj = fr(fr(field[j * 4] * field[j * 4]) + fr(field[j * 4 + 1] * field[j * 4 + 1])); if ((fastest ? mj > mb : mj < mb) || (mj === mb && j < bi)) rank++; }
      if (rank < fr(fr(o.pct) * nb)) { mx = fr(mx * fr(o.gain)); my = fr(my * fr(o.gain)); }
    } else if (code === 9) {
      // mosh map: scale by the mean luma of the map image over the block
      const mp = ctx.map; if (mp) {
        let s = fr(0), n = 0;
        for (let y = by * block; y < Math.min(h, by * block + block); y++) for (let x = bx * block; x < Math.min(w, bx * block + block); x++) { const k = (y * w + x) * 4; s = fr(s + lumaPx(mp[k], mp[k + 1], mp[k + 2])); n++; }
        let m = Math.min(1, Math.max(0, fr(fr(fr(fr(s / n) - 0.5) * fr(o.contrast)) + 0.5))); if (o.invert) m = fr(1 - m);
        const g = fr(fr(1 - fr(o.amount)) + fr(fr(o.amount) * m)); mx = fr(mx * g); my = fr(my * g);
      }
    }
    out[i] = mx; out[i + 1] = my; out[i + 3] = fl;
  }
  return out;
}

/** Lost-sector test for one block: stateless rectangles on 1–4 hashed grids, each cell re-rolled every `life` frames. */
export function lostAt(bx, by, t, o, seed) {
  const life = Math.max(1, o.life | 0), ch = Math.max(1, o.scale | 0), cw = Math.max(1, Math.floor(fr(fr(o.scale) * fr(o.aspect))));
  for (let l = 0; l < Math.min(4, Math.max(1, o.layers | 0)); l++) {
    const ox = Math.floor(fr(hash3(l, 1, seed * 4 + 2) * cw)), oy = Math.floor(fr(hash3(l, 2, seed * 4 + 2) * ch));
    const cx = Math.floor((bx + ox) / cw), cy = Math.floor((by + oy) / ch), cell = cx * 7919 + cy;
    const shift = Math.floor(fr(hash3(cell, l, seed * 4 + 2) * life)), epoch = Math.floor((t + shift) / life);
    if (hash3(cell, epoch * 4 + l, seed * 4 + 2) < fr(o.density)) return true;
  }
  return false;
}

// ------------------------------------------------------------------------------------------------ warp
/**
 * Backward block warp: out(p) = prev(p - mv(block(p))), mv = quantise(field * scale, pel), zero when `zero`.
 * nearest: source floor(p - mv + 0.5) (not round(): WGSL rounds half to even). bilinear: 4 taps, edge rule per tap.
 * The field may be vec2 per block (M0) or vec4 per block.
 */
export function warp(prev, field, { w, h, block, edge = EDGE.clamp, sampling = 'nearest', pel = 0, scale = 1, zero = false, interp = 'block' }) {
  const [bw, bh] = blocksOf(w, h, block), stride = field.length === bw * bh * 2 ? 2 : 4, out = new Float32Array(w * h * 4), sc = fr(scale);
  const q = (m) => (pel > 0 ? fr(Math.floor(fr(fr(m * pel) + 0.5)) / pel) : m);
  for (let y = 0; y < h; y++) {
    const by = Math.min(Math.floor(y / block), bh - 1);
    for (let x = 0; x < w; x++) {
      const bx = Math.min(Math.floor(x / block), bw - 1), o = (by * bw + bx) * stride, d = (y * w + x) * 4;
      let fx = field[o], fy = field[o + 1];
      if (interp === 'smooth') {     // bilinear between block centres: a per-pixel field (the fluid look)
        const gx = fr(fr(fr(x + 0.5) / block) - 0.5), gy = fr(fr(fr(y + 0.5) / block) - 0.5), x0 = Math.floor(gx), y0 = Math.floor(gy), ax = fr(gx - x0), ay = fr(gy - y0);
        const X0 = Math.min(Math.max(x0, 0), bw - 1), X1 = Math.min(Math.max(x0 + 1, 0), bw - 1), Y0 = Math.min(Math.max(y0, 0), bh - 1), Y1 = Math.min(Math.max(y0 + 1, 0), bh - 1);
        const v = (bxx, byy, k) => field[(byy * bw + bxx) * stride + k];
        fx = fr(fr(fr(fr(v(X0, Y0, 0) * fr(1 - ax)) + fr(v(X1, Y0, 0) * ax)) * fr(1 - ay)) + fr(fr(fr(v(X0, Y1, 0) * fr(1 - ax)) + fr(v(X1, Y1, 0) * ax)) * ay));
        fy = fr(fr(fr(fr(v(X0, Y0, 1) * fr(1 - ax)) + fr(v(X1, Y0, 1) * ax)) * fr(1 - ay)) + fr(fr(fr(v(X0, Y1, 1) * fr(1 - ax)) + fr(v(X1, Y1, 1) * ax)) * ay));
      }
      const mx = zero ? 0 : q(fr(fx * sc)), my = zero ? 0 : q(fr(fy * sc));
      if (sampling === 'bilinear') {
        const sx = fr(x - mx), sy = fr(y - my), x0 = Math.floor(sx), y0 = Math.floor(sy), ax = fr(sx - x0), ay = fr(sy - y0);
        const ix = [edgeIndex(x0, w, edge), edgeIndex(x0 + 1, w, edge)], iy = [edgeIndex(y0, h, edge), edgeIndex(y0 + 1, h, edge)];
        for (let k = 0; k < 4; k++) {
          const a = prev[(iy[0] * w + ix[0]) * 4 + k], b = prev[(iy[0] * w + ix[1]) * 4 + k], c = prev[(iy[1] * w + ix[0]) * 4 + k], e = prev[(iy[1] * w + ix[1]) * 4 + k];
          out[d + k] = fr(fr(fr(fr(a * fr(1 - ax)) + fr(b * ax)) * fr(1 - ay)) + fr(fr(fr(c * fr(1 - ax)) + fr(e * ax)) * ay));
        }
      } else {
        const sx = edgeIndex(Math.floor(fr(fr(x - mx) + 0.5)), w, edge), sy = edgeIndex(Math.floor(fr(fr(y - my) + 0.5)), h, edge), s = (sy * w + sx) * 4;
        out[d] = prev[s]; out[d + 1] = prev[s + 1]; out[d + 2] = prev[s + 2]; out[d + 3] = prev[s + 3];
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ code stage
/**
 * Residual paint-in, intra refresh, random block refresh, sweep, hard reset (spec §5.4 steps 5 and 7).
 * u: { t, seed, hard, cut, dropCut, honourCut, intraMad, intraRate, blocks, sweepBand, sweepSpeed, resGain, resSteps, resMode, resDead, allowCode }
 * A detected cut that is not honoured is a dropped I-frame (dropCut): it carries no residual and no intra blocks.
 * resMode 'codec' is what decoding a P-frame does: pred + quantise(res - mc), mc = the previous frame of the motion
 * source warped by the ORIGINAL estimate (the residual the encoder computed for its own vectors; edited vectors do
 * not get a new residual, which is what makes ffglitch-style edits visible), with a dead zone.
 */
export function code(src, resetSrc, pred, field, { w, h, block }, u, mc = null, res = src) {
  const [bw] = blocksOf(w, h, block), out = new Float32Array(pred), Y = (img, x, y) => {
    const i = (Math.min(Math.max(y, 0), h - 1) * w + Math.min(Math.max(x, 0), w - 1)) * 4;
    return lumaPx(img[i], img[i + 1], img[i + 2]);
  };
  const box = (img, x, y) => { let s = fr(0); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s = fr(s + Y(img, x + dx, y + dy)); return fr(s / 9); };
  const hardAll = u.hard || (u.cut && hash3(u.t, 3, u.seed * 4 + 1) < fr(u.honourCut));
  const y0 = u.sweepBand > 0 ? Math.floor(fr(u.t * fr(u.sweepSpeed))) % h : -1, allow = u.allowCode && !(u.cut && u.dropCut);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y * w + x) * 4, bx = Math.min(Math.floor(x / block), bw - 1), by = Math.floor(y / block), bi = by * bw + bx;
    const lost = (field[bi * 4 + 3] & FLAG.lost) !== 0, copy = (s) => { out[p] = s[p]; out[p + 1] = s[p + 1]; out[p + 2] = s[p + 2]; out[p + 3] = s[p + 3]; };
    if (hardAll) { copy(resetSrc); continue; }
    if (lost) continue;
    if (allow && u.resGain > 0 && u.resMode === 'codec') {
      const dead = fr(u.resDead), st = fr(u.resSteps), gain = fr(u.resGain);
      for (let k = 0; k < 3; k++) {
        const r = fr(res[p + k] - mc[p + k]), rq = Math.abs(r) < dead ? 0 : fr(Math.floor(fr(fr(r * st) + 0.5)) / st);
        out[p + k] = Math.min(1, Math.max(0, fr(pred[p + k] + fr(gain * rq))));
      }
    } else if (allow && u.resGain > 0) {
      let r;
      if (u.resMode === 'full') r = fr(Y(src, x, y) - Y(pred, x, y));
      else { const hs = fr(Y(src, x, y) - box(src, x, y)), hp = fr(Y(pred, x, y) - box(pred, x, y)); r = Math.abs(hs) > Math.abs(hp) ? fr(hs - hp) : 0; }
      const rq = fr(Math.floor(fr(fr(r * fr(u.resSteps)) + 0.5)) / fr(u.resSteps)), g = fr(fr(u.resGain) * rq);
      for (let k = 0; k < 3; k++) out[p + k] = Math.min(1, Math.max(0, fr(pred[p + k] + g)));
    }
    if (allow && field[bi * 4 + 2] > fr(u.intraMad) && hash3(bi, u.t, u.seed * 4 + 1) < fr(u.intraRate)) { copy(src); continue; }
    if (hash3(bi, u.t, u.seed * 4 + 2) < fr(u.blocks)) { copy(resetSrc); continue; }
    if (y0 >= 0 && ((y - y0 + h) % h) < u.sweepBand) copy(resetSrc);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the loop
import { resolveAll, f32All, holdAt } from './params.js';
import { normalize } from './config.js';
import { fxChain } from './fx-ref.js';

/** The Mosh Loop on the CPU. Same semantics as createMoshLoop() in engine.js. `store: 'f16'` (default) rounds
 *  the prediction and the history to half floats like the GPU's rgba16float textures; 'f32' keeps full floats. */
/** CPU twin of the maskmix kernel: clean x (1 - a) + moshed x a with a = the mask coverage in 1/4096 steps (exact
 *  products, as in blendRef); opaque result. Used by the masks (R3) and by the loop's lock refresh. */
export function maskmixRef(clean, moshed, mask) {
  const out = new Float32Array(clean.length);
  for (let i = 0; i < clean.length; i += 4) {
    const a = Math.min(4096, Math.max(0, Math.floor(mask[i + 3] * 4096 + 0.5))), af = a / 4096, gf = (4096 - a) / 4096;
    for (let k = 0; k < 3; k++) out[i + k] = a <= 0 ? clean[i + k] : a >= 4096 ? moshed[i + k] : fr(fr(clean[i + k] * gf) + fr(moshed[i + k] * af));
    out[i + 3] = 1;
  }
  return out;
}

export function createLoopRef({ w, h }, cfg0, { store = 'f16' } = {}) {
  let cfg = normalize(cfg0), S = null;
  const keep = store === 'f16' ? (a) => fromHalfArray(toHalfArray(a)) : (a) => a;
  const L = () => levelsFor(cfg.block);
  return {
    setConfig(c) { cfg = normalize(c); },
    begin(t0 = 0) { S = { t0, history: null, prevP: null, prevP2: null, prevEst: null, frozen: null, frozenEst: null, prevSrc: null, prevFrozen: null, inStates: [], postStates: [] }; },
    /** A checkpoint (M6). Every state field is replaced, never mutated, on a step, so references are enough; the effect
     *  state lists are copied. */
    snapshot() { return S && S.history ? { block: cfg.block, state: { ...S, inStates: [...S.inStates], postStates: [...S.postStates] } } : null; },
    restore(snap) { const st = snap.state; S = { ...st, inStates: [...st.inStates], postStates: [...st.postStates] }; },
    /** inputs: { src: Float32Array, src2?: Float32Array, lock?: Float32Array } -> { out, field, est, hold, cut }. lock is the
     *  keep coverage of the clip's lock masks (1 = free, 0 = locked): locked pixels of the history are refreshed from
     *  src every frame, so nothing builds up under a lock (owner decision 2026-10-10: a lock does nothing). */
    step(t, { src, src2, lock = null }) {
      const c = f32All(resolveAll(cfg, t, cfg.clock)), block = c.block, seed = cfg.seed | 0, geo = { w, h, block };
      const resetSrc = c.reset.source === 'source2' && src2 ? src2 : src;
      const resSrc = c.estimate.source === 'source2' && src2 ? src2 : src;     // the codec residual belongs to the motion source's stream
      const curP = pyramid(luma(src, w, h), w, h, L()), curP2 = src2 ? pyramid(luma(src2, w, h), w, h, L()) : null;
      const post = (img, fld) => (c.post.length ? keep(fxChain(c.post, img, { ...geo, t, seed, field: fld }, S.postStates)) : img);
      const locked = (img) => (lock ? keep(maskmixRef(src, img, lock)) : img);
      if (t === S.t0 || !S.history) { S.history = locked(keep(new Float32Array(resetSrc))); S.prevP = curP; S.prevP2 = curP2; S.prevSrc = keep(new Float32Array(resSrc)); return { out: S.history, display: post(S.history, null), field: null, est: null, hold: -1, cut: 0 }; }
      const k = holdAt(t, { ...c.bloom, hits: cfg.bloom.hits }, S.t0);
      let field, est = null, cut = 0;
      if (k > 0 && S.frozen) field = S.frozen;
      else {
        const e = c.estimate;
        if (e.source === 'none') est = new Float32Array(Math.ceil(w / block) * Math.ceil(h / block) * 4);
        else {
          const cur = e.source === 'source2' && curP2 ? curP2 : curP;
          const ref = e.against === 'output' ? pyramid(luma(S.history, w, h), w, h, L()) : (e.source === 'source2' && S.prevP2 ? S.prevP2 : S.prevP);
          ({ field: est, cut } = e.method === 'flow' ? flowCells(cur, ref, { block, cutMad: e.cutMad })
            : matchBlocks(cur, ref, { block, search: e.search, lambda: e.lambda, pel: e.pel, cutMad: e.cutMad, temporal: S.prevEst }));
        }
        S.prevEst = est; field = est;
        const map = src2 || src;
        for (const o of c.ops) if (o.on !== false) field = fieldOp(field, o, { ...geo, t, seed, map: o.op === 'map' ? (o.from === 'source' ? src : map) : null });
        if (k === 0) { S.frozen = field; S.frozenEst = est; S.prevFrozen = S.prevSrc; }
      }
      const nb = Math.ceil(w / block) * Math.ceil(h / block), isCut = cut > Math.floor(c.estimate.cutFrac * nb);
      const scale = k > 0 ? fr(c.bloom.accel ** k) : 1;
      const wo = { ...geo, edge: EDGE[c.warp.edge], sampling: c.warp.sampling, pel: c.warp.pel, scale, zero: isCut && c.estimate.zeroOnCut, interp: c.warp.interp };
      const pred = keep(warp(S.history, field, wo));
      // codec residual: the previous source under the same motion (during a hold: the trigger frame's previous source)
      const mcField = k > 0 && S.frozenEst ? S.frozenEst : est;
      const mc = c.residual.mode === 'codec' && c.residual.gain > 0 && mcField ? keep(warp(k > 0 && S.prevFrozen ? S.prevFrozen : S.prevSrc, mcField, { ...wo, scale: 1, interp: 'block' })) : null;
      const gop = c.reset.gop | 0;
      S.history = keep(code(src, resetSrc, pred, field, geo, {
        t, seed, hard: gop > 0 && (t - S.t0) % gop === 0 && hash3(t, 5, seed * 4 + 1) < fr(c.reset.gopKeep), cut: isCut, dropCut: !!c.estimate.zeroOnCut, honourCut: c.reset.honourCut,
        intraMad: c.intra.mad, intraRate: c.intra.rate, blocks: c.reset.blocks, sweepBand: c.reset.sweepBand | 0, sweepSpeed: c.reset.sweepSpeed,
        resGain: c.residual.gain, resSteps: c.residual.steps, resMode: c.residual.mode, resDead: c.residual.dead, allowCode: k <= 0 || !!c.bloom.residual,
      }, mc, resSrc));
      if (c.inLoop.length) S.history = keep(fxChain(c.inLoop, S.history, { ...geo, t, seed, field }, S.inStates));   // accumulates: feeds back
      S.history = locked(S.history);
      S.prevP = curP; S.prevP2 = curP2; S.prevSrc = keep(new Float32Array(resSrc));
      return { out: S.history, display: post(S.history, field), field, est, hold: k, cut };
    },
  };
}

/** End-point error of an estimated field against a fixture's truth on fully exact blocks. */
export function fieldEPE(est, truth, mask, { w, h, block }) {
  const [bw, bh] = blocksOf(w, h, block), errs = [];
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let all = true;
    for (let y = by * block; y < Math.min(h, by * block + block) && all; y++) for (let x = bx * block; x < Math.min(w, bx * block + block); x++) if (!mask[y * w + x]) { all = false; break; }
    if (!all) continue;
    const i = by * bw + bx; errs.push(Math.hypot(est[i * 4] - truth[i * 2], est[i * 4 + 1] - truth[i * 2 + 1]));
  }
  errs.sort((a, b) => a - b);
  const q = (p) => (errs.length ? errs[Math.min(errs.length - 1, Math.floor(p * errs.length))] : NaN);
  return { blocks: errs.length, median: q(0.5), p90: q(0.9), max: errs.length ? errs[errs.length - 1] : NaN, exact: errs.filter((e) => e === 0).length };
}
