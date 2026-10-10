// fixtures.js — procedural test footage with ground-truth motion. Pure functions of (name, options):
// no binaries in the repo, identical bits in node and in every browser (integer hashing, + - * / only).
//
// Image format: Float32Array RGBA, row-major, values in [0, 1] (display-referred for now; the linear
// working space arrives with media import in M1).
//
// Motion convention (used by the whole engine): the field at block b of frame t is the BACKWARD vector,
//   frame_t(p) = frame_{t-1}(p - mv)        i.e. a gather: out(p) = prev(p - mv).
// A pan that moves content right by 2 px per frame has mv = (+2, 0).
import { hash3, fnv1a } from './util.js';

const smooth = (t) => t * t * (3 - 2 * t);

/** Value noise on an integer lattice of `cell` px, two octaves plus a fine grain. Defined on integer pixels. */
function noiseTex(x, y, seed, cell = 16) {
  let v = 0, amp = 0.62, c = cell;
  for (let o = 0; o < 2; o++, c >>= 1, amp *= 0.5) {
    const gx = Math.floor(x / c), gy = Math.floor(y / c), fx = smooth((x - gx * c) / c), fy = smooth((y - gy * c) / c);
    const a = hash3(gx, gy, seed + o), b = hash3(gx + 1, gy, seed + o), d = hash3(gx, gy + 1, seed + o), e = hash3(gx + 1, gy + 1, seed + o);
    v += amp * ((a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy);
  }
  return v + 0.14 * hash3(x, y, seed + 7);
}

/** Write one pixel. Colour comes from a scalar through a small palette so textures stay recognisable. */
function put(out, i, v, hue) {
  const k = Math.min(1, Math.max(0, v));
  out[i] = Math.min(1, k * (0.55 + 0.45 * hue[0]));
  out[i + 1] = Math.min(1, k * (0.55 + 0.45 * hue[1]));
  out[i + 2] = Math.min(1, k * (0.55 + 0.45 * hue[2]));
  out[i + 3] = 1;
}

const BG = [0.35, 0.55, 1.0], SQ = [1.0, 0.45, 0.2], A = [1.0, 0.9, 0.3];

/** Colour bars with saturated edges and two discs: the 'scene A' look and the chroma-edge fixture. */
function barsPixel(out, i, x, y, w, h) {
  const bars = [[1, 1, 1], [1, 1, 0], [0, 1, 1], [0, 1, 0], [1, 0, 1], [1, 0, 0], [0, 0, 1], [0.1, 0.1, 0.1]];
  const c = bars[Math.min(7, Math.floor((x * 8) / w))];
  const cx1 = w * 0.3, cy1 = h * 0.62, r1 = h * 0.18, cx2 = w * 0.72, cy2 = h * 0.35, r2 = h * 0.12;
  const in1 = (x - cx1) ** 2 + (y - cy1) ** 2 < r1 * r1, in2 = (x - cx2) ** 2 + (y - cy2) ** 2 < r2 * r2;
  const g = 0.12 * hash3(x >> 2, y >> 2, 99);
  out[i] = in1 ? 0.05 : in2 ? 0.95 : 0.15 + 0.75 * c[0] + g;
  out[i + 1] = in1 ? 0.05 : in2 ? 0.1 : 0.15 + 0.75 * c[1] + g;
  out[i + 2] = in1 ? 0.05 : in2 ? 0.6 : 0.15 + 0.75 * c[2] + g;
  for (let k = 0; k < 3; k++) out[i + k] = Math.min(1, out[i + k]);
  out[i + 3] = 1;
}

/** Fixture registry. Every fixture: { name, w, h, count, block, cut, frame(t), field(t), layer(t,x,y) }. */
export const FIXTURES = {
  /** Textured noise panning by an integer vector: the field is exact everywhere except the entering strip. */
  pan: ({ w = 320, h = 180, count = 60, block = 16, seed = 1, pan = [2, 1] } = {}) => make({
    name: 'pan', w, h, count, block, cut: null,
    pixel(out, i, x, y, t) { put(out, i, noiseTex(x - pan[0] * t, y - pan[1] * t, seed), BG); },
    mv() { return pan; }, layer() { return 0; },
  }),
  /** Static textured background with a textured square moving rigidly: two motion layers, occlusion at its edges. */
  square: ({ w = 320, h = 180, count = 60, block = 16, seed = 2, v = [3, -1], size = 64, at = [40, 70] } = {}) => make({
    name: 'square', w, h, count, block, cut: null,
    inside(x, y, t) { const sx = at[0] + v[0] * t, sy = at[1] + v[1] * t; return x >= sx && x < sx + size && y >= sy && y < sy + size; },
    pixel(out, i, x, y, t) { if (this.inside(x, y, t)) put(out, i, noiseTex(x - v[0] * t, y - v[1] * t, seed + 50, 8), SQ); else put(out, i, noiseTex(x, y, seed), BG); },
    mv(x, y, t) { return this.inside(x, y, t) ? v : [0, 0]; }, layer(t, x, y) { return this.inside(x, y, t) ? 1 : 0; },
  }),
  /** Scene cut: colour bars (scene A) until `cut`, then a panning background with a moving square (scene B).
   *  The classic I-frame drop keeps A's last frame and drives it with B's motion. Field is zero at the cut frame. */
  cut: ({ w = 320, h = 180, count = 120, block = 16, seed = 3, cut = 40, pan = [2, 0], v = [-3, 1], size = 72, at = [200, 40] } = {}) => make({
    name: 'cut', w, h, count, block, cut,
    inside(x, y, t) { const k = t - cut, sx = at[0] + v[0] * k, sy = at[1] + v[1] * k; return x >= sx && x < sx + size && y >= sy && y < sy + size; },
    pixel(out, i, x, y, t) {
      if (t < cut) return barsPixel(out, i, x, y, this.w, this.h);
      const k = t - cut;
      if (this.inside(x, y, t)) put(out, i, noiseTex(x - v[0] * k, y - v[1] * k, seed + 50, 8), SQ);
      else put(out, i, noiseTex(x - pan[0] * k, y - pan[1] * k, seed), A);
    },
    mv(x, y, t) { return t <= cut ? [0, 0] : this.inside(x, y, t) ? v : pan; }, layer(t, x, y) { return t < cut ? 2 : this.inside(x, y, t) ? 1 : 0; },
  }),
  /** Static colour bars: chroma-subsampling, DCT and deblocking fixtures. Field is zero. */
  bars: ({ w = 320, h = 180, count = 8, block = 16 } = {}) => make({
    name: 'bars', w, h, count, block, cut: null,
    pixel(out, i, x, y) { barsPixel(out, i, x, y, this.w, this.h); }, mv() { return [0, 0]; }, layer() { return 0; },
  }),
};

function make(spec) {
  const f = Object.assign({}, spec);
  f.bw = Math.ceil(f.w / f.block); f.bh = Math.ceil(f.h / f.block);
  /** Frame t as Float32Array RGBA. */
  f.frame = (t) => { const out = new Float32Array(f.w * f.h * 4); for (let y = 0, i = 0; y < f.h; y++) for (let x = 0; x < f.w; x++, i += 4) f.pixel(out, i, x, y, t); return out; };
  /** Block field of frame t: Float32Array [mvx, mvy] per block, sampled at the block centre (backward convention). */
  f.field = (t) => {
    const out = new Float32Array(f.bw * f.bh * 2);
    for (let by = 0; by < f.bh; by++) for (let bx = 0; bx < f.bw; bx++) {
      const cx = Math.min(f.w - 1, bx * f.block + (f.block >> 1)), cy = Math.min(f.h - 1, by * f.block + (f.block >> 1));
      const mv = f.mv(cx, cy, t), o = (by * f.bw + bx) * 2; out[o] = mv[0]; out[o + 1] = mv[1];
    }
    return out;
  };
  /** Per-pixel mask (Uint8Array, 1 = exact) of where warping frame t-1 by the block field reproduces frame t:
   *  the whole block shares one motion layer at t, its source pixel lies inside the image and on the same layer at t-1. */
  f.exactMask = (t) => {
    const m = new Uint8Array(f.w * f.h);
    if (t <= 0 || (f.cut !== null && t === f.cut)) return m;
    for (let by = 0; by < f.bh; by++) for (let bx = 0; bx < f.bw; bx++) {
      const x0 = bx * f.block, y0 = by * f.block, x1 = Math.min(f.w, x0 + f.block), y1 = Math.min(f.h, y0 + f.block);
      const cx = Math.min(f.w - 1, x0 + (f.block >> 1)), cy = Math.min(f.h - 1, y0 + (f.block >> 1));
      const L = f.layer(t, cx, cy), mv = f.mv(cx, cy, t);
      let pure = true;
      for (let y = y0; y < y1 && pure; y++) for (let x = x0; x < x1; x++) if (f.layer(t, x, y) !== L) { pure = false; break; }
      if (!pure) continue;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const sx = x - mv[0], sy = y - mv[1];
        if (sx >= 0 && sy >= 0 && sx < f.w && sy < f.h && f.layer(t - 1, sx, sy) === L) m[y * f.w + x] = 1;
      }
    }
    return m;
  };
  return f;
}

export const fixture = (name, opts) => { const g = FIXTURES[name]; if (!g) throw new Error('no fixture ' + name); return g(opts); };

/** Golden hashes of every fixture at a few frames. Checked by node tests and by the in-page harness. */
export function goldenHashes() {
  const out = {};
  for (const name of Object.keys(FIXTURES)) {
    const f = fixture(name), ts = [...new Set([0, 1, f.cut ?? 2, f.count - 1].filter((t) => t >= 0 && t < f.count))];
    out[name] = Object.fromEntries(ts.map((t) => [t, { frame: fnv1a(f.frame(t)), field: fnv1a(f.field(t)) }]));
  }
  return out;
}
