// fixed.js — integer arithmetic shared by the GPU kernels and their CPU twins (M8, 2026-10-11), so field ops and
// effects give the same bits in every browser. Float multiply-adds were fused or not depending on the shader compiler
// (Chrome, Safari and Firefox disagreed in the last bit), divisions and sin/cos/pow are approximate on GPUs, and
// Math.sin & co. differ between JavaScript engines. The rule now: kernels only add, subtract, multiply and shift
// integers that cannot overflow 32 bits, and anything transcendental is computed here in JavaScript with dmath.js
// (deterministic) and handed to the kernel as integers (uniforms or a per-block table).
//
// Units: motion vectors in 1/64 px (VU), colours in 1/32768 (q15), factors in 1/4096 (q12).
import { dsincos, dhypot, dpow } from './dmath.js';
import { hash3 } from './util.js';

export const VU = 64, Q15 = 32768, Q12 = 4096;
const fr = Math.fround;
/** floor(a / b) for b > 0 (integers). */
export const fdiv = (a, b) => Math.floor(a / b);
/** a / n rounded (half up), integers, n > 0. */
export const rdiv = (a, n) => Math.floor((a + (n >> 1)) / n);
/** A [0, 1] colour (any float) to q15. */
export const q15 = (x) => Math.floor((x < 0 ? 0 : x > 1 ? 1 : x) * Q15 + 0.5);
/** A float to the nearest multiple of 1/s, as an integer (s a power of two: x * s is exact). */
export const qs = (x, s) => Math.floor(x * s + 0.5);
/** A motion component in VU, clamped to +-2048 px (beyond that nothing is meaningful, and products stay in 32 bits). */
export const vq = (m) => Math.max(-131071, Math.min(131071, qs(fr(m), VU)));
/** Integer square root (floor). */
export function isqrt(x) { if (x <= 0) return 0; let s = Math.floor(Math.sqrt(x)); while (s * s > x) s--; while ((s + 1) * (s + 1) <= x) s++; return s; }
/** BT.601 luma of q15 channels, q15 (integer weights summing to 65536). Unsigned 32-bit on the GPU. */
export const y601q = (r, g, b) => Math.floor((19595 * r + 38470 * g + 7471 * b + 32768) / 65536);
/** hash3 as a 12-bit integer (its top bits: hash3 is k / 2^24). */
export const h12 = (a, b, c) => Math.floor(hash3(a, b, c) * 4096);

/** The WGSL twins (helpers used by fieldops.js and fx.js). */
export const FIXED_WGSL = /* wgsl */`
fn fdiv(a: i32, b: i32) -> i32 { let q = a / b; return select(q, q - 1, (a % b != 0) && (a < 0)); }
fn rdiv(a: i32, n: i32) -> i32 { return fdiv(a + (n >> 1u), n); }
fn q15(x: f32) -> i32 { return i32(floor(clamp(x, 0.0, 1.0) * 32768.0 + 0.5)); }
fn q15v(c: vec3f) -> vec3i { return vec3i(q15(c.r), q15(c.g), q15(c.b)); }
fn fromQ15(c: vec3i) -> vec3f { return vec3f(c) * (1.0 / 32768.0); }
fn vq(m: f32) -> i32 { return clamp(i32(floor(m * 64.0 + 0.5)), -131071, 131071); }
fn fromVU(m: vec2i) -> vec2f { return vec2f(m) * (1.0 / 64.0); }
fn isqrt(x: i32) -> i32 { if (x <= 0) { return 0; } var s = i32(sqrt(f32(x))); loop { if (s * s <= x) { break; } s = s - 1; } loop { if ((s + 1) * (s + 1) > x) { break; } s = s + 1; } return s; }
fn y601q(c: vec3i) -> i32 { return i32((19595u * u32(c.r) + 38470u * u32(c.g) + 7471u * u32(c.b) + 32768u) >> 16u); }
fn h12(a: u32, b: u32, c: u32) -> i32 { return i32(floor(hash3(a, b, c) * 4096.0)); }
`;

// ------------------------------------------------------------------------------------------------ field ops
const GAIN = ['rampX', 'rampY', 'invX', 'invY', 'sinX', 'sinY', 'radial', 'mirrorL', 'mirrorR', 'mirrorT', 'mirrorB', 'checker'];
const SYN = ['zoom', 'rotate', 'shearX', 'shearY', 'swirl'];
/**
 * A field op's integer parameters and, for the ops that need trig or square roots, its per-block table (vec4 per
 * block, small integers in floats): gain -> the factor in q12; synthetic -> the synthetic vector in VU; paint -> the
 * painted vector in VU and its coverage flag. Both twins take these very numbers. o: f32-rounded params.
 */
export function fieldOpQ(o, { w, h, block }, paint = null) {
  const bw = Math.ceil(w / block), bh = Math.ceil(h / block), a = [0, 0, 0, 0, 0, 0, 0, 0]; let table = null;
  switch (o.op) {
    case 'pan': a[0] = vq(o.x); a[1] = vq(o.y); break;
    case 'multiply': a[0] = qs(fr(o.gx), 1024); a[1] = qs(fr(o.gy), 1024); break;
    case 'noise': a[0] = Math.min(4096, qs(fr(o.amp), VU)); a[1] = Math.max(1, o.cell | 0); a[2] = Math.max(1, o.hold | 0); a[3] = fr(o.mismatch); break;
    case 'smooth': a[0] = Math.max(0, Math.min(4, o.radius | 0)); break;
    case 'gain': {
      const s = GAIN.indexOf(o.shape), f = fr(o.freq), ph = fr(o.phase), amt = qs(Math.min(1, Math.max(0, fr(o.amount))), Q12);
      table = new Float32Array(bw * bh * 4);
      for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
        const u = (bx + 0.5) / bw, v = (by + 0.5) / bh; let g = 1;
        if (s === 0) g = u; else if (s === 1) g = v; else if (s === 2) g = 1 - u; else if (s === 3) g = 1 - v;
        else if (s === 4) g = 0.5 + 0.5 * dsincos(2 * Math.PI * (f * u + ph))[0];
        else if (s === 5) g = 0.5 + 0.5 * dsincos(2 * Math.PI * (f * v + ph))[0];
        else if (s === 6) g = Math.max(0, 1 - 2 * dhypot(u - 0.5, v - 0.5));
        else if (s === 7) g = u < 0.5 ? 1 : 0; else if (s === 8) g = u >= 0.5 ? 1 : 0; else if (s === 9) g = v < 0.5 ? 1 : 0; else if (s === 10) g = v >= 0.5 ? 1 : 0;
        else if (s === 11) { const c = Math.max(1, Math.floor(f + 0.5)); g = (Math.floor(bx / c) + Math.floor(by / c)) & 1 ? 1 : 0; }
        table[(by * bw + bx) * 4] = (Q12 - amt) + rdiv(amt * qs(g, Q12), Q12);              // (1 - amount) + amount x g, q12
      }
      break;
    }
    case 'synthetic': {
      const kind = SYN.indexOf(o.kind), k = fr(o.strength), cx = fr(o.cx) * w, cy = fr(o.cy) * h;
      a[0] = qs(Math.min(1, Math.max(0, fr(o.blend))), Q12); a[1] = o.mode === 'add' ? 1 : 0;
      table = new Float32Array(bw * bh * 4);
      for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
        const dx = bx * block + block / 2 - cx, dy = by * block + block / 2 - cy; let sx = 0, sy = 0;
        if (kind === 0) { sx = dx * k; sy = dy * k; }
        else if (kind === 1 || kind === 4) {
          let ang = k;
          if (kind === 4) ang = k * 10 * Math.max(0, 1 - dhypot(dx, dy) / (0.5 * Math.min(w, h)));
          const [s, c] = dsincos(ang); sx = dx - (c * dx + s * dy); sy = dy - (c * dy - s * dx);
        } else if (kind === 2) sx = dy * k * 4;
        else if (kind === 3) sy = dx * k * 4;
        const i = (by * bw + bx) * 4; table[i] = vq(sx); table[i + 1] = vq(sy);
      }
      break;
    }
    case 'lost': a[0] = fr(o.density); a[1] = o.layers; a[2] = o.life; a[3] = o.scale; a[4] = o.aspect; break;   // hash compares: exact as floats
    case 'skip': a[0] = fr(o.eps); a[1] = fr(o.mad); break;
    case 'amplify': a[0] = fr(o.pct); a[1] = qs(fr(o.gain), 1024); a[2] = o.which === 'slowest' ? 1 : 0; break;
    case 'map': a[0] = qs(Math.min(1, Math.max(0, fr(o.amount))), Q12); a[1] = o.invert ? 1 : 0; a[3] = qs(fr(o.contrast), Q12); break;
    case 'paint': {
      a[0] = o.mode === 'replace' ? 1 : 0;
      const P = paint; table = new Float32Array(bw * bh * 4);
      for (let i = 0; i < bw * bh * 4; i += 4) { table[i] = vq(P[i]); table[i + 1] = vq(P[i + 1]); table[i + 2] = P[i + 2] >= 0.5 ? 1 : 0; }
      break;
    }
  }
  return { a, table };
}

// ------------------------------------------------------------------------------------------------ effects
/** cos(π (2l + 1) u / 2B) in q15 for l < B, u < 8 (DCT stripes' basis), B the block size. */
export function stripesTable(B) {
  const t = new Float32Array(Math.max(1, B) * 8);
  for (let l = 0; l < B; l++) for (let u = 0; u < 8; u++) t[l * 8 + u] = qs(dsincos((Math.PI * (2 * l + 1) * u) / (2 * B))[1], Q15);
  return t;
}
/** The 8 x 8 DCT basis in 1/8192 (T13[u * 8 + x]). */
export const DCT_T13 = (() => { const t = new Int32Array(64); for (let u = 0; u < 8; u++) for (let x = 0; x < 8; x++) t[u * 8 + x] = qs((u === 0 ? Math.SQRT1_2 : 1) * 0.5 * dsincos(((2 * x + 1) * u * Math.PI) / 16)[1], 8192); return t; })();
/**
 * The colour effect as integers: a per-channel transfer LUT (levels and gamma: 4097 entries over q15 >> 3, linear in
 * between) and the affine rest (saturation, hue in YIQ, invert) as a 3 x 3 matrix in 1/2048 plus an offset in q15;
 * threshold in q15. o: f32-rounded params.
 */
export function colourQ(o) {
  const black = fr(o.black), span = Math.max(1e-4, fr(o.white) - black), ig = 1 / fr(o.gamma), lut = new Float32Array(4097);
  for (let i = 0; i <= 4096; i++) { const x = Math.min(1, Math.max(0, (i / 4096 - black) / span)); lut[i] = qs(x > 0 ? dpow(x, ig) : 0, Q15); }
  const s = fr(o.sat), inv = fr(o.invert), [sa, ca] = dsincos((fr(o.hue) * Math.PI) / 180), W = [0.299, 0.587, 0.114];
  const A = [0, 1, 2].map((r) => [0, 1, 2].map((c) => (r === c ? s : 0) + (1 - s) * W[c]));                 // saturation
  const YI = [0.596, -0.274, -0.322], YQ = [0.211, -0.523, 0.312], BI = [0.956, -0.272, -1.106], BQ = [0.621, -0.647, 1.703];
  // hue: rotate I and Q, written as a change from identity (the YIQ constants do not invert exactly, so the plain round
  // trip shifted colours by up to 0.15 % even at hue 0)
  const K = [0, 1, 2].map((r) => [0, 1, 2].map((c) => (r === c ? 1 : 0) + BI[r] * (YI[c] * (ca - 1) - YQ[c] * sa) + BQ[r] * (YI[c] * sa + YQ[c] * (ca - 1))));
  const M = [0, 1, 2].map((r) => [0, 1, 2].map((c) => (1 - 2 * inv) * (K[r][0] * A[0][c] + K[r][1] * A[1][c] + K[r][2] * A[2][c])));
  return { lut, m: M.flat().map((v) => qs(v, 2048)), off: qs(inv, Q15), thr: fr(o.threshold) > 0 ? qs(fr(o.threshold), Q15) : -1 };
}

/** JPEG quantisers in 1/16 level for a quality scale S and chroma multiplier: [64 luma, 64 chroma]. */
export function dctQ(S, chroma, JPEG_Y, JPEG_C) {
  const t = new Float32Array(128), cm = fr(chroma);
  for (let k = 0; k < 64; k++) { t[k] = Math.max(1, Math.floor((JPEG_Y[k] * S + 50) / 100)) * 16; t[64 + k] = Math.max(1, Math.round(Math.max(1, Math.floor((JPEG_C[k] * S + 50) / 100)) * cm * 16)); }
  return t;
}
/**
 * An effect's integer parameters (one row of 16 per pass) and table, shared by nodes/fx.js and fx-ref.js. o: params
 * (rounded to f32 here); block: the loop's block size (stripes' table). Effects that only copy or move pixels by hashed
 * amounts (displace, blockdrag, slice, freeze) keep their float params: they were exact already.
 */
export function fxQ(o, block, JPEG = null) {
  const P = (...v) => { const r = new Array(16).fill(0); v.forEach((x, i) => { r[i] = x; }); return r; };
  switch (o.fx) {
    case 'dct': { const q = Math.max(1, Math.min(100, Math.round(o.quality))), S = q < 50 ? Math.floor(5000 / q) : 200 - 2 * q;
      return { passes: [P(S, 0, Math.round(o.cutoff), o.dcOnly ? 1 : 0)], table: dctQ(S, o.chroma, JPEG.Y, JPEG.C) }; }
    case 'chroma': { const [cw, ch] = { '4:2:0': [2, 2], '4:2:2': [2, 1], '4:1:1': [4, 1], '8x8': [8, 8], '16x16': [16, 16] }[o.scheme] || [2, 2]; return { passes: [P(cw, ch, fr(o.dx), fr(o.dy))] }; }
    case 'deblock': return { passes: [0, 1].map((dir) => P(qs(fr(o.strength), Q12), o.grid | 0, qs(fr(o.alpha), Q15), qs(fr(o.beta), Q15), dir)) };
    case 'posterise': return { passes: [P(Math.max(2, Math.floor(fr(o.levels))), qs(Math.min(1, Math.max(0, fr(o.motion))), Q12))] };
    case 'stripes': return { passes: [P(fr(o.amount), qs(fr(o.contrast), Q12), Math.max(1, o.hold | 0), Math.max(1, Math.min(8, o.freq | 0)))], table: stripesTable(block) };
    case 'echo': return { passes: [P(qs(Math.min(1, Math.max(0, fr(o.decay))), Q12), { mix: 0, max: 1, add: 2 }[o.mode] ?? 0, o.warp ? 1 : 0)] };
    case 'displace': return { passes: [P(fr(o.gain))] };
    case 'blockdrag': return { passes: [P(fr(o.prob), fr(o.offset), o.hold, o.mode === 'shuffle' ? 1 : 0)] };
    case 'slice': return { passes: [P(fr(o.prob), o.height, fr(o.shift), o.hold, Math.round(o.field))] };
    case 'rgbsplit': return { passes: [P(vq(o.dx), vq(o.dy), qs(fr(o.motion), VU))] };
    case 'colour': { const c = colourQ(o), m = c.m.map((v) => Math.max(-16000, Math.min(16000, v)));
      return { passes: [P(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], c.off, c.thr)], table: c.lut }; }
    case 'freeze': return { passes: [P(fr(o.density), o.layers, o.life, o.scale, o.aspect)] };
  }
  return { passes: [P()] };
}
