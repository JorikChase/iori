// dmath.js — deterministic transcendental functions (M8, 2026-10-11). Math.sin, Math.cos, Math.exp, Math.pow,
// Math.hypot … are "implementation-approximated" in ECMAScript: V8, JavaScriptCore and SpiderMonkey may differ in the
// last bit, and anything that feeds a render (a table, a uniform, a mask raster) then differs between browsers.
// These use only + - * /, Math.floor / Math.round and Math.sqrt (IEEE correctly rounded everywhere), so every engine
// returns the same double. Accuracy is about 1 ulp (fdlibm's polynomials), far below what any render can see.

const P1 = 1.5707963267341256, P2 = 6.077100506303966e-11, P3 = 2.0222662487959506e-21;   // π/2 in three parts (P1: 33 bits)
const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04,
  S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05,
  C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
const ksin = (r) => { const z = r * r; return r + r * z * (S1 + z * (S2 + z * (S3 + z * (S4 + z * (S5 + z * S6))))); };
const kcos = (r) => { const z = r * r; return 1 - 0.5 * z + z * z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6))))); };
/** [sin x, cos x] (|x| up to about 1e6). */
export function dsincos(x) {
  if (!Number.isFinite(x)) return [NaN, NaN];
  const n = Math.round(x * 0.6366197723675814), r = ((x - n * P1) - n * P2) - n * P3, s = ksin(r), c = kcos(r);
  switch (((n % 4) + 4) % 4) { case 0: return [s, c]; case 1: return [c, -s]; case 2: return [-s, -c]; default: return [-c, s]; }
}
export const dsin = (x) => dsincos(x)[0];
export const dcos = (x) => dsincos(x)[1];

const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, LN2 = 0.6931471805599453;
const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);   // little-endian: U32[1] holds sign, exponent, top mantissa
/** 2^k exactly (normal range). */
function pow2(k) { if (k > 1023) return Infinity; if (k < -1022) return pow2(k + 60) * pow2(-60); U32[0] = 0; U32[1] = (k + 1023) << 20; return F64[0]; }
/** e^x. */
export function dexp(x) {
  if (Number.isNaN(x)) return NaN; if (x > 709.7) return Infinity; if (x < -745) return 0;
  const k = Math.round(x / LN2), r = (x - k * LN2_HI) - k * LN2_LO;
  let s = 1, t = 1; for (let i = 1; i <= 18; i++) { t = (t * r) / i; s += t; }        // |r| <= 0.347: 18 terms are past 1e-20
  return s * pow2(k);
}
/** ln x (x > 0). */
export function dlog(x) {
  if (!(x > 0)) return x === 0 ? -Infinity : NaN; if (x === Infinity) return Infinity;
  F64[0] = x; let e = ((U32[1] >>> 20) & 0x7ff) - 1023;
  if (e === -1023) { F64[0] = x * pow2(60); e = ((U32[1] >>> 20) & 0x7ff) - 1023 - 60; }   // subnormal
  U32[1] = (U32[1] & 0x800fffff) | (1023 << 20); let m = F64[0];                         // m in [1, 2)
  if (m > 1.4142135623730951) { m /= 2; e++; }
  const s = (m - 1) / (m + 1), z = s * s; let sum = 0, p = s;
  for (let i = 1; i <= 23; i += 2) { sum += p / i; p *= z; }
  return e * LN2_HI + (2 * sum + e * LN2_LO);
}
/** x^y for x >= 0 (what the colour effect needs); integer y uses repeated multiplication. */
export function dpow(x, y) {
  if (y === 0) return 1; if (x === 0) return y > 0 ? 0 : Infinity; if (x < 0) return NaN;
  if (Number.isInteger(y) && Math.abs(y) <= 64) return dpowi(x, y);
  return dexp(y * dlog(x));
}
/** x^k for an integer k by repeated multiplication (deterministic; no pow). */
export function dpowi(x, k) { let p = 1; const n = Math.abs(k); for (let i = 0; i < n; i++) p *= x; return k < 0 ? 1 / p : p; }
/** sqrt(x² + y²) (Math.hypot's algorithm is the engine's own). */
export const dhypot = (x, y) => Math.sqrt(x * x + y * y);
