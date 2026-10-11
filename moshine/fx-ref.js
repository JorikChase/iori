// fx-ref.js — CPU reference of the image effects (config.js FX). Twins of nodes/fx.js. Float32Array RGBA in and
// out; ctx = { w, h, block, t, seed, field (vec4 per block, may be null) }; stateful effects (echo, freeze) take
// and return their previous output. M8 (2026-10-11): the colour effects work in q15 integers with the parameters and
// tables of fixed.js fxQ, so GPU and CPU agree bit for bit in every browser; every effect's output is rounded to half
// floats, as the GPU stores it between passes.
import { hash3, toHalfArray, fromHalfArray } from './util.js';
import { lostAt } from './engine-ref.js';
import { fxQ, DCT_T13, q15, fdiv, rdiv, vq, isqrt, y601q, h12 } from './fixed.js';

const fr = Math.fround, clamp01 = (v) => Math.min(1, Math.max(0, v));
const blocksOf = (w, h, b) => [Math.ceil(w / b), Math.ceil(h / b)];
export const FX_SCHEMES = { '4:2:0': [2, 2], '4:2:2': [2, 1], '4:1:1': [4, 1], '8x8': [8, 8], '16x16': [16, 16] };

// ---- JPEG tables shared with the WGSL
export const JPEG_Y = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
export const JPEG_C = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99];
export const ZIGZAG = (() => { const z = new Array(64); let i = 0; for (let s = 0; s < 15; s++) { const cells = []; for (let y = 0; y < 8; y++) { const x = s - y; if (x >= 0 && x < 8) cells.push([x, y]); } if (s % 2 === 0) cells.reverse(); for (const [x, y] of cells) z[y * 8 + x] = i++; } return z; })();
export const jpegScale = (q) => { q = Math.max(1, Math.min(100, Math.round(q))); return q < 50 ? Math.floor(5000 / q) : 200 - 2 * q; };
export const roundEven = (x) => { const f = Math.floor(x), d = x - f; return d < 0.5 ? f : d > 0.5 ? f + 1 : f % 2 === 0 ? f : f + 1; };

const at = (img, w, h, x, y) => (Math.min(Math.max(y, 0), h - 1) * w + Math.min(Math.max(x, 0), w - 1)) * 4;
const Y601 = (img, i) => fr(fr(fr(0.299 * img[i]) + fr(0.587 * img[i + 1])) + fr(0.114 * img[i + 2]));
function bilinear(img, w, h, sx, sy, out, o) {
  const x0 = Math.floor(sx), y0 = Math.floor(sy), ax = fr(sx - x0), ay = fr(sy - y0);
  const a = at(img, w, h, x0, y0), b = at(img, w, h, x0 + 1, y0), c = at(img, w, h, x0, y0 + 1), d = at(img, w, h, x0 + 1, y0 + 1);
  for (let k = 0; k < 4; k++) out[o + k] = fr(fr(fr(fr(img[a + k] * fr(1 - ax)) + fr(img[b + k] * ax)) * fr(1 - ay)) + fr(fr(fr(img[c + k] * fr(1 - ax)) + fr(img[d + k] * ax)) * ay));
}
/** Twin of bilQ: sample at (x, y) - d / 4096 with integer floor and fraction and 1/64 weights (exact products). */
function bilinearQ(img, w, h, x, y, dx, dy, out, o) {
  const ux = x * 4096 - dx, uy = y * 4096 - dy, x0 = ux >> 12, y0 = uy >> 12, fx = (ux & 4095) >> 6, fy = (uy & 4095) >> 6, gx = 64 - fx, gy = 64 - fy;
  const w00 = fr((gx * gy) / 4096), w10 = fr((fx * gy) / 4096), w01 = fr((gx * fy) / 4096), w11 = fr((fx * fy) / 4096);
  const a = at(img, w, h, x0, y0), b = at(img, w, h, x0 + 1, y0), c = at(img, w, h, x0, y0 + 1), d = at(img, w, h, x0 + 1, y0 + 1);
  for (let k = 0; k < 4; k++) out[o + k] = fr(fr(fr(img[a + k] * w00) + fr(img[b + k] * w10)) + fr(fr(img[c + k] * w01) + fr(img[d + k] * w11)));
}
/** Twin of dispQ: motion x gain in 1/4096 px, both quantized to 1/64 first. */
const dispQ = (m, g) => Math.floor(fr(fr(m * 64) + 0.5)) * Math.floor(fr(fr(g * 64) + 0.5));
const mvAt = (ctx, x, y) => {
  if (!ctx.field) return [0, 0];
  const [bw, bh] = blocksOf(ctx.w, ctx.h, ctx.block), bi = Math.min(Math.floor(y / ctx.block), bh - 1) * bw + Math.min(Math.floor(x / ctx.block), bw - 1);
  return [ctx.field[bi * 4], ctx.field[bi * 4 + 1]];
};

const h16 = (a) => fromHalfArray(toHalfArray(a));
/** How the GPU stores an effect's output: half floats (the loop, the clip FX) or float32 (ctx.store === 'f32', tests). */
const keepOf = (ctx) => (ctx.store === 'f32' ? (a) => a : h16);
const ycc = (Y, cbi, cri) => { const cb = Math.max(-18000, Math.min(18000, cbi)), cr = Math.max(-18000, Math.min(18000, cri)), c = (v) => Math.max(0, Math.min(32768, v));
  return [c(Y + fdiv(91881 * cr + 32768, 65536)), c(Y - fdiv(22554 * cb + 46802 * cr + 32768, 65536)), c(Y + fdiv(116130 * cb + 32768, 65536))]; };
const cbq = (r, g, b) => fdiv(-11058 * r - 21710 * g + 32768 * b + 32768, 65536), crq = (r, g, b) => fdiv(32768 * r - 27439 * g - 5329 * b + 32768, 65536);
const Q = (v) => fr(v / 32768);
const px15 = (img, i) => [q15(img[i]), q15(img[i + 1]), q15(img[i + 2])];
/** Apply one effect. Returns { out, state } (state = this effect's previous output for the next frame). */
export function fxApply(o, img, ctx, state = null) {
  const { w, h } = ctx, out = new Float32Array(img.length), t = ctx.t | 0, seed = ctx.seed | 0;
  switch (o.fx) {
    case 'dct': {
      const { passes: [a], table: QT } = fxQ(o, ctx.block, { Y: JPEG_Y, C: JPEG_C }), cut = a[2], dc = a[3] === 1, T = DCT_T13;
      const r13 = (v) => rdiv(v, 8192);
      for (let by = 0; by < Math.ceil(h / 8); by++) for (let bx = 0; bx < Math.ceil(w / 8); bx++) {
        const f = [new Array(64), new Array(64), new Array(64)];
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const [r, g, b] = px15(img, at(img, w, h, bx * 8 + x, by * 8 + y)), k = y * 8 + x;
          f[0][k] = rdiv(y601q(r, g, b) * 4080, 32768) - 2048; f[1][k] = rdiv(cbq(r, g, b) * 4080, 32768); f[2][k] = rdiv(crq(r, g, b) * 4080, 32768);
        }
        const rec = [new Array(64), new Array(64), new Array(64)];
        for (let ch = 0; ch < 3; ch++) {
          const F = new Array(64);
          for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
            let acc = 0;
            for (let y = 0; y < 8; y++) { let row = 0; for (let x = 0; x < 8; x++) row += T[u * 8 + x] * f[ch][y * 8 + x]; acc += T[v * 8 + y] * r13(row); }
            const k = v * 8 + u, q = QT[(ch === 0 ? 0 : 64) + k], co = r13(acc);
            F[k] = (dc ? k !== 0 : ZIGZAG[k] >= cut) ? 0 : rdiv(co, q) * q;
          }
          for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
            let acc = 0;
            for (let v = 0; v < 8; v++) { let row = 0; for (let u = 0; u < 8; u++) row += T[u * 8 + x] * F[v * 8 + u]; acc += T[v * 8 + y] * r13(row); }
            rec[ch][y * 8 + x] = r13(acc);
          }
        }
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const px = bx * 8 + x, py = by * 8 + y; if (px >= w || py >= h) continue;
          const k = y * 8 + x, d = (py * w + px) * 4, c = ycc(rdiv((rec[0][k] + 2048) * 32768, 4080), rdiv(rec[1][k] * 32768, 4080), rdiv(rec[2][k] * 32768, 4080));
          out[d] = Q(c[0]); out[d + 1] = Q(c[1]); out[d + 2] = Q(c[2]); out[d + 3] = img[d + 3];
        }
      }
      return { out, state };
    }
    case 'chroma': {
      const { passes: [a] } = fxQ(o, ctx.block), cw = a[0], ch = a[1];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = (y * w + x) * 4, ox = Math.floor(fr(x - a[2])), oy = Math.floor(fr(y - a[3])), cx = fdiv(ox, cw) * cw, cy = fdiv(oy, ch) * ch;
        let cb = 0, cr = 0;
        for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) { const [r, g, b] = px15(img, at(img, w, h, cx + i, cy + j)); cb += cbq(r, g, b); cr += crq(r, g, b); }
        const [r, g, b] = px15(img, d), c = ycc(y601q(r, g, b), rdiv(cb, cw * ch), rdiv(cr, cw * ch));
        out[d] = Q(c[0]); out[d + 1] = Q(c[1]); out[d + 2] = Q(c[2]); out[d + 3] = img[d + 3];
      }
      return { out, state };
    }
    case 'deblock': {
      const { passes } = fxQ(o, ctx.block);
      const pass = (src, a) => {
        const res = new Float32Array(src), dir = a[4], g = a[1], n = dir === 0 ? w : h, st = a[0], al = a[2], be = a[3];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const ax = dir === 0 ? x : y, m = ax % g; let p0, sgn;
          if (m === 0 && ax > 0 && ax + 1 < n) { p0 = ax - 1; sgn = 1; } else if (m === g - 1 && ax + 2 < n && ax > 0) { p0 = ax; sgn = -1; } else continue;
          const idx = (k) => (dir === 0 ? (y * w + k) * 4 : (k * w + x) * 4), P1 = px15(src, idx(p0 - 1)), P0 = px15(src, idx(p0)), Q0 = px15(src, idx(p0 + 1)), Q1 = px15(src, idx(p0 + 2));
          const L = (c) => y601q(c[0], c[1], c[2]);
          if (!(Math.abs(L(P0) - L(Q0)) < al && Math.abs(L(P1) - L(P0)) < be && Math.abs(L(Q1) - L(Q0)) < be)) continue;
          const d = idx(ax), c0 = px15(src, d);
          for (let k = 0; k < 3; k++) {
            const dl = Math.max(-al, Math.min(al, rdiv((Q0[k] - P0[k]) * 4 + (P1[k] - Q1[k]), 8))), delta = fdiv(dl * st + 2048, 4096);
            res[d + k] = Q(Math.max(0, Math.min(32768, c0[k] - delta * sgn)));
          }
        }
        return keepOf(ctx)(res);                                        // the GPU stores each pass in its format
      };
      return { out: pass(pass(img, passes[0]), passes[1]), state };
    }
    case 'posterise': {
      const { passes: [a] } = fxQ(o, ctx.block);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = (y * w + x) * 4; let L = a[0];
        if (a[1] > 0) { const [mvx, mvy] = mvAt(ctx, x, y), mx = Math.max(-16383, Math.min(16383, vq(mvx))), my = Math.max(-16383, Math.min(16383, vq(mvy)));
          const f = Math.min(4096, isqrt(mx * mx + my * my) * 8); L = Math.max(2, fdiv(L * (4096 - rdiv(a[1] * f, 4096)), 4096)); }
        const k = L - 1;
        for (let c = 0; c < 3; c++) { const n = fdiv(q15(img[d + c]) * k + 16384, 32768); out[d + c] = Q(rdiv(n * 32768, k)); }
        out[d + 3] = img[d + 3];
      }
      return { out, state };
    }
    case 'stripes': {
      const { passes: [a], table: T } = fxQ(o, ctx.block), B = ctx.block, [bw] = blocksOf(w, h, B), th = Math.floor(t / a[2]);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = (y * w + x) * 4, bx = Math.min(Math.floor(x / B), bw - 1), by = Math.floor(y / B), bi = by * bw + bx;
        for (let c = 0; c < 4; c++) out[d + c] = img[d + c];
        if (!(hash3(bi, th, seed * 4 + 3) < a[0])) continue;
        const u = Math.floor(fr(hash3(bi, th, seed * 4 + 1) * a[3])), v = Math.floor(fr(hash3(bi, th, seed * 4 + 2) * a[3]));
        const amp = fdiv((2 * h12(bi, th, seed * 8 + 5) + 1 - 4096) * a[1], 4096), lx = x - bx * B, ly = y - by * B;
        const dl = fdiv(amp * fdiv(T[lx * 8 + u] * T[ly * 8 + v], 32768), 4096);
        for (let c = 0; c < 3; c++) out[d + c] = Q(Math.max(0, Math.min(32768, q15(img[d + c]) + dl)));
      }
      return { out, state };
    }
    case 'echo': {
      const { passes: [a] } = fxQ(o, ctx.block), dq = a[0], mode = a[1];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = (y * w + x) * 4;
        if (!state) { for (let c = 0; c < 4; c++) out[d + c] = img[d + c]; continue; }
        let s = d;
        if (a[2] === 1) { const [mx, my] = mvAt(ctx, x, y); s = at(state, w, h, fdiv(x * 64 - vq(mx) + 32, 64), fdiv(y * 64 - vq(my) + 32, 64)); }
        for (let c = 0; c < 3; c++) {
          const cv = q15(img[d + c]), pr = q15(state[s + c]), pd = fdiv(pr * dq + 2048, 4096);
          out[d + c] = Q(mode === 1 ? Math.max(cv, pd) : mode === 2 ? Math.min(cv + pd, 32768) : fdiv(cv * (4096 - dq) + pr * dq + 2048, 4096));
        }
        out[d + 3] = img[d + 3];
      }
      return { out, state: out };
    }
    case 'displace': {
      const g = fr(o.gain);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [mx, my] = mvAt(ctx, x, y); bilinearQ(img, w, h, x, y, dispQ(mx, g), dispQ(my, g), out, (y * w + x) * 4); }
      return { out, state };
    }
    case 'blockdrag': {
      const B = ctx.block, [bw, bh] = blocksOf(w, h, B), th = Math.floor(t / Math.max(1, o.hold | 0)), nb = bw * bh;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = (y * w + x) * 4, bx = Math.min(Math.floor(x / B), bw - 1), by = Math.floor(y / B), bi = by * bw + bx; let s = d;
        if (hash3(bi, th, seed * 4 + 3) < fr(o.prob)) {
          if (o.mode === 'shuffle') { const j = Math.min(nb - 1, Math.floor(fr(hash3(bi, th, seed * 4 + 1) * nb))); s = at(img, w, h, (j % bw) * B + (x - bx * B), Math.floor(j / bw) * B + (y - by * B)); }
          else s = at(img, w, h, x + Math.floor(fr(fr(fr(hash3(bi, th, seed * 4) * 2) - 1) * fr(o.offset))), y + Math.floor(fr(fr(fr(hash3(bi, th, seed * 4 + 1) * 2) - 1) * fr(o.offset))));
        }
        for (let c = 0; c < 4; c++) out[d + c] = img[s + c];
      }
      return { out, state };
    }
    case 'slice': {
      const H = Math.max(1, o.height | 0), th = Math.floor(t / Math.max(1, o.hold | 0)), fld = Math.round(o.field);
      for (let y = 0; y < h; y++) {
        const band = Math.floor(y / H); let sh = 0;
        if (hash3(band, th, seed * 4 + 3) < fr(o.prob)) sh = Math.floor(fr(fr(fr(hash3(band, th, seed * 4) * 2) - 1) * fr(o.shift)));
        if (y % 2 === 1) sh += fld;
        for (let x = 0; x < w; x++) { const d = (y * w + x) * 4, s = (y * w + ((((x - sh) % w) + w) % w)) * 4; for (let c = 0; c < 4; c++) out[d + c] = img[s + c]; }
      }
      return { out, state };
    }
    case 'rgbsplit': {
      const { passes: [a] } = fxQ(o, ctx.block);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = (y * w + x) * 4, [mx, my] = mvAt(ctx, x, y), cl = (v) => Math.max(-16383, Math.min(16383, v));
        const vx = a[0] + fdiv(cl(vq(mx)) * a[2] + 32, 64), vy = a[1] + fdiv(cl(vq(my)) * a[2] + 32, 64);
        out[d] = img[at(img, w, h, fdiv(x * 64 - vx + 32, 64), fdiv(y * 64 - vy + 32, 64))];
        out[d + 1] = img[d + 1];
        out[d + 2] = img[at(img, w, h, fdiv(x * 64 + vx + 32, 64), fdiv(y * 64 + vy + 32, 64)) + 2];
        out[d + 3] = img[d + 3];
      }
      return { out, state };
    }
    case 'colour': {
      const { passes: [a], table: L } = fxQ(o, ctx.block), m = a.slice(0, 9), off = a[9], thr = a[10];
      const lut = (x) => { const i = x >> 3, f = x & 7; return i >= 4096 ? L[4096] : (L[i] * (8 - f) + L[i + 1] * f + 4) >> 3; };
      for (let i = 0; i < w * h; i++) {
        const d = i * 4, t = [lut(q15(img[d])), lut(q15(img[d + 1])), lut(q15(img[d + 2]))];
        let c = [0, 1, 2].map((r) => fdiv(m[r * 3] * t[0] + m[r * 3 + 1] * t[1] + m[r * 3 + 2] * t[2] + 1024, 2048) + off);
        if (thr >= 0) { const oc = c.map((v) => Math.max(-32768, Math.min(65536, v))), on = 1225 * oc[0] + 2404 * oc[1] + 467 * oc[2] > thr * 4096; c = [0, 0, 0].map(() => (on ? 32768 : 0)); }
        for (let k = 0; k < 3; k++) out[d + k] = Q(Math.max(0, Math.min(32768, c[k]))); out[d + 3] = img[d + 3];
      }
      return { out, state };
    }
    case 'freeze': {
      const B = ctx.block, [bw] = blocksOf(w, h, B);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = (y * w + x) * 4, src = state && lostAt(Math.min(Math.floor(x / B), bw - 1), Math.floor(y / B), t, o, seed) ? state : img;
        for (let c = 0; c < 4; c++) out[d + c] = src[d + c];
      }
      return { out, state: out };
    }
  }
  return { out: new Float32Array(img), state };
}

/** Run a chain. states: array (per entry) of previous outputs, updated in place. */
export function fxChain(list, img, ctx, states) {
  let cur = img;
  const keep = keepOf(ctx);
  list.forEach((o, i) => { if (o.on === false) return; const r = fxApply(o, cur, ctx, states[i] || null); cur = keep(r.out); if (r.state) states[i] = r.state === r.out ? cur : keep(r.state); });
  return cur;
}
