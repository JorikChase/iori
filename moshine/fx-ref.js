// fx-ref.js — CPU reference of the image effects (config.js FX). Twins of nodes/fx.js. Float32Array RGBA in and
// out; ctx = { w, h, block, t, seed, field (vec4 per block, may be null) }; stateful effects (echo, freeze) take
// and return their previous output. The WGSL mirrors the arithmetic order; effects with cos/pow/division are
// compared with a tolerance (D28 keeps bit-exactness for the integer and half-pel paths).
import { hash3 } from './util.js';
import { lostAt } from './engine-ref.js';

const fr = Math.fround, clamp01 = (v) => Math.min(1, Math.max(0, v));
const blocksOf = (w, h, b) => [Math.ceil(w / b), Math.ceil(h / b)];
export const FX_SCHEMES = { '4:2:0': [2, 2], '4:2:2': [2, 1], '4:1:1': [4, 1], '8x8': [8, 8], '16x16': [16, 16] };

// ---- DCT tables shared with the WGSL (written into the shader as literals, so both sides use identical f32 values)
export const DCT_T = new Float32Array(64);
for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) DCT_T[u * 8 + x] = fr((u === 0 ? Math.SQRT1_2 : 1) * 0.5 * Math.cos(((2 * x + 1) * u * Math.PI) / 16));
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

/** Apply one effect. Returns { out, state } (state = this effect's previous output for the next frame). */
export function fxApply(o, img, ctx, state = null) {
  const { w, h } = ctx, out = new Float32Array(img.length), t = ctx.t | 0, seed = ctx.seed | 0;
  switch (o.fx) {
    case 'dct': {
      const S = jpegScale(o.quality), cut = Math.round(o.cutoff), cm = fr(o.chroma);
      for (let by = 0; by < Math.ceil(h / 8); by++) for (let bx = 0; bx < Math.ceil(w / 8); bx++) {
        const f = [new Float32Array(64), new Float32Array(64), new Float32Array(64)];
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const i = at(img, w, h, bx * 8 + x, by * 8 + y), r = img[i], g = img[i + 1], b = img[i + 2];
          f[0][y * 8 + x] = fr(fr(fr(fr(fr(0.299 * r) + fr(0.587 * g)) + fr(0.114 * b)) * 255) - 128);
          f[1][y * 8 + x] = fr(fr(fr(fr(-0.168736 * r) + fr(-0.331264 * g)) + fr(0.5 * b)) * 255);
          f[2][y * 8 + x] = fr(fr(fr(fr(0.5 * r) + fr(-0.418688 * g)) + fr(-0.081312 * b)) * 255);
        }
        const rec = [new Float32Array(64), new Float32Array(64), new Float32Array(64)];
        for (let ch = 0; ch < 3; ch++) {
          const F = new Float32Array(64);
          for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) {
            let acc = fr(0);
            for (let y = 0; y < 8; y++) { let row = fr(0); for (let x = 0; x < 8; x++) row = fr(row + fr(DCT_T[u * 8 + x] * f[ch][y * 8 + x])); acc = fr(acc + fr(DCT_T[v * 8 + y] * row)); }
            const k = v * 8 + u, base = ch === 0 ? JPEG_Y[k] : JPEG_C[k], q = fr(Math.max(1, Math.floor((base * S + 50) / 100)) * (ch === 0 ? 1 : cm));
            F[k] = (o.dcOnly ? k !== 0 : ZIGZAG[k] >= cut) ? 0 : fr(roundEven(fr(acc / q)) * q);
          }
          for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
            let acc = fr(0);
            for (let v = 0; v < 8; v++) { let row = fr(0); for (let u = 0; u < 8; u++) row = fr(row + fr(DCT_T[u * 8 + x] * F[v * 8 + u])); acc = fr(acc + fr(DCT_T[v * 8 + y] * row)); }
            rec[ch][y * 8 + x] = acc;
          }
        }
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
          const px = bx * 8 + x, py = by * 8 + y; if (px >= w || py >= h) continue;
          const k = y * 8 + x, Y = fr(fr(rec[0][k] + 128) / 255), Cb = fr(rec[1][k] / 255), Cr = fr(rec[2][k] / 255), d = (py * w + px) * 4;
          out[d] = clamp01(fr(Y + fr(1.402 * Cr))); out[d + 1] = clamp01(fr(fr(Y - fr(0.344136 * Cb)) - fr(0.714136 * Cr))); out[d + 2] = clamp01(fr(Y + fr(1.772 * Cb))); out[d + 3] = img[d + 3];
        }
      }
      return { out, state };
    }
    case 'chroma': {
      const [cw, ch] = FX_SCHEMES[o.scheme] || [2, 2], n = cw * ch;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = (y * w + x) * 4, Y = Y601(img, d);
        const ox = Math.floor(fr(x - fr(o.dx))), oy = Math.floor(fr(y - fr(o.dy))), cx = Math.floor(ox / cw) * cw, cy = Math.floor(oy / ch) * ch;
        let cb = fr(0), cr = fr(0);
        for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
          const s = at(img, w, h, cx + i, cy + j), r = img[s], g = img[s + 1], b = img[s + 2];
          cb = fr(cb + fr(fr(fr(-0.168736 * r) + fr(-0.331264 * g)) + fr(0.5 * b))); cr = fr(cr + fr(fr(fr(0.5 * r) + fr(-0.418688 * g)) + fr(-0.081312 * b)));
        }
        cb = fr(cb / n); cr = fr(cr / n);
        out[d] = clamp01(fr(Y + fr(1.402 * cr))); out[d + 1] = clamp01(fr(fr(Y - fr(0.344136 * cb)) - fr(0.714136 * cr))); out[d + 2] = clamp01(fr(Y + fr(1.772 * cb))); out[d + 3] = img[d + 3];
      }
      return { out, state };
    }
    case 'deblock': {
      const pass = (src, dir) => {
        const res = new Float32Array(src), g = o.grid | 0, n = dir === 0 ? w : h, al = fr(o.alpha), be = fr(o.beta), st = fr(o.strength);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const a = dir === 0 ? x : y, m = a % g; let p0, sgn;
          if (m === 0 && a > 0 && a + 1 < n) { p0 = a - 1; sgn = 1; } else if (m === g - 1 && a + 2 < n && a > 0) { p0 = a; sgn = -1; } else continue;   // q0 moves by -delta, p0 by +delta
          const idx = (k) => (dir === 0 ? (y * w + k) * 4 : (k * w + x) * 4), P1 = idx(p0 - 1), P0 = idx(p0), Q0 = idx(p0 + 1), Q1 = idx(p0 + 2);
          const lp1 = Y601(src, P1), lp0 = Y601(src, P0), lq0 = Y601(src, Q0), lq1 = Y601(src, Q1);
          if (!(Math.abs(fr(lp0 - lq0)) < al && Math.abs(fr(lp1 - lp0)) < be && Math.abs(fr(lq1 - lq0)) < be)) continue;
          const d = idx(a);
          for (let k = 0; k < 3; k++) {
            const delta = fr(Math.min(al, Math.max(-al, fr(fr(fr(fr(src[Q0 + k] - src[P0 + k]) * 4) + fr(src[P1 + k] - src[Q1 + k])) / 8))) * st);
            res[d + k] = clamp01(fr(src[d + k] - fr(sgn * delta)));
          }
        }
        return res;
      };
      return { out: pass(pass(img, 0), 1), state };
    }
    case 'posterise': {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = (y * w + x) * 4; let L = fr(o.levels);
        if (o.motion > 0) { const [mx, my] = mvAt(ctx, x, y), m = fr(Math.sqrt(fr(fr(mx * mx) + fr(my * my)))); L = Math.max(2, Math.floor(fr(L * fr(1 - fr(fr(o.motion) * Math.min(1, fr(m / 8))))))); }
        const k = fr(L - 1);
        for (let c = 0; c < 3; c++) out[d + c] = fr(Math.floor(fr(fr(img[d + c] * k) + 0.5)) / k);
        out[d + 3] = img[d + 3];
      }
      return { out, state };
    }
    case 'stripes': {
      const B = ctx.block, [bw] = blocksOf(w, h, B), th = Math.floor(t / Math.max(1, o.hold | 0)), PI = fr(Math.PI);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = (y * w + x) * 4, bx = Math.min(Math.floor(x / B), bw - 1), by = Math.floor(y / B), bi = by * bw + bx;
        for (let c = 0; c < 4; c++) out[d + c] = img[d + c];
        if (!(hash3(bi, th, seed * 4 + 3) < fr(o.amount))) continue;
        const u = Math.floor(fr(hash3(bi, th, seed * 4 + 1) * o.freq)), v = Math.floor(fr(hash3(bi, th, seed * 4 + 2) * o.freq));
        const amp = fr(fr(o.contrast) * fr(fr(hash3(bi, th, seed * 8 + 5) - 0.5) * 2)), lx = x - bx * B, ly = y - by * B;
        const basis = fr(fr(Math.cos(fr(fr(PI * fr((2 * lx + 1) * u)) / (2 * B)))) * fr(Math.cos(fr(fr(PI * fr((2 * ly + 1) * v)) / (2 * B)))));
        for (let c = 0; c < 3; c++) out[d + c] = clamp01(fr(img[d + c] + fr(amp * basis)));
      }
      return { out, state };
    }
    case 'echo': {
      const dec = fr(o.decay);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = (y * w + x) * 4;
        if (!state) { for (let c = 0; c < 4; c++) out[d + c] = img[d + c]; continue; }
        let s = d;
        if (o.warp) { const [mx, my] = mvAt(ctx, x, y); s = at(state, w, h, Math.floor(fr(fr(x - mx) + 0.5)), Math.floor(fr(fr(y - my) + 0.5))); }
        for (let c = 0; c < 3; c++) {
          const a = img[d + c], p = state[s + c];
          out[d + c] = o.mode === 'max' ? Math.max(a, fr(p * dec)) : o.mode === 'add' ? clamp01(fr(a + fr(p * dec))) : fr(fr(a * fr(1 - dec)) + fr(p * dec));
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
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = (y * w + x) * 4, [mx, my] = mvAt(ctx, x, y), vx = fr(fr(o.dx) + fr(mx * fr(o.motion))), vy = fr(fr(o.dy) + fr(my * fr(o.motion)));
        out[d] = img[at(img, w, h, Math.floor(fr(fr(x - vx) + 0.5)), Math.floor(fr(fr(y - vy) + 0.5)))];
        out[d + 1] = img[d + 1];
        out[d + 2] = img[at(img, w, h, Math.floor(fr(fr(x + vx) + 0.5)), Math.floor(fr(fr(y + vy) + 0.5))) + 2];
        out[d + 3] = img[d + 3];
      }
      return { out, state };
    }
    case 'colour': {
      const span = fr(Math.max(1e-4, fr(fr(o.white) - fr(o.black)))), ig = fr(1 / fr(o.gamma)), a = fr(fr(fr(o.hue) * fr(Math.PI)) / 180), ca = fr(Math.cos(a)), sa = fr(Math.sin(a));
      for (let i = 0; i < w * h; i++) {
        const d = i * 4; let c = [0, 1, 2].map((k) => fr(Math.pow(clamp01(fr(fr(img[d + k] - fr(o.black)) / span)), ig)));
        const l = fr(fr(fr(0.299 * c[0]) + fr(0.587 * c[1])) + fr(0.114 * c[2]));
        c = c.map((v) => fr(l + fr(fr(v - l) * fr(o.sat))));
        const I = fr(fr(fr(0.596 * c[0]) - fr(0.274 * c[1])) - fr(0.322 * c[2])), Q = fr(fr(fr(0.211 * c[0]) - fr(0.523 * c[1])) + fr(0.312 * c[2]));
        const I2 = fr(fr(I * ca) - fr(Q * sa)), Q2 = fr(fr(I * sa) + fr(Q * ca));
        c = [fr(fr(l + fr(0.956 * I2)) + fr(0.621 * Q2)), fr(fr(l - fr(0.272 * I2)) - fr(0.647 * Q2)), fr(fr(l - fr(1.106 * I2)) + fr(1.703 * Q2))];
        c = c.map((v) => fr(v + fr(fr(1 - fr(2 * v)) * fr(o.invert))));
        if (o.threshold > 0) { const l2 = fr(fr(fr(0.299 * c[0]) + fr(0.587 * c[1])) + fr(0.114 * c[2])); c = [0, 0, 0].map(() => (l2 > fr(o.threshold) ? 1 : 0)); }
        for (let k = 0; k < 3; k++) out[d + k] = clamp01(c[k]); out[d + 3] = img[d + 3];
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
  list.forEach((o, i) => { if (o.on === false) return; const r = fxApply(o, cur, ctx, states[i] || null); cur = r.out; if (r.state) states[i] = r.state; });
  return cur;
}
