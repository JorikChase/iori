// util.js — small pure helpers shared by the page, the harness and node tests. No DOM, no GPU.

/** FNV-1a 32-bit over the bytes of any typed array (or ArrayBuffer). Deterministic across engines. */
export function fnv1a(data) {
  const b = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Integer hash of up to three ints to [0, 1) in steps of 2^-24. Pure integer math, and the result is exact
 *  in float32, so JS and WGSL (HASH_WGSL in gpu.js) agree bit for bit, including threshold comparisons. */
export function hash3(x, y, z = 0) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 8) / 16777216;
}

// ---- IEEE half floats (rgba16float upload and readback). Round to nearest even, like the GPU.
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
/** float32 -> float16 bits */
export function toHalf(v) {
  f32[0] = v; const x = u32[0];
  const sign = (x >>> 16) & 0x8000, exp = (x >>> 23) & 0xff, man = x & 0x7fffff;
  if (exp === 0xff) return sign | 0x7c00 | (man ? 0x200 : 0);            // inf / nan
  let e = exp - 127 + 15;
  if (e >= 0x1f) return sign | 0x7c00;                                   // overflow -> inf
  if (e <= 0) {                                                          // subnormal or zero
    if (e < -10) return sign;
    const m = man | 0x800000, shift = 14 - e;
    let r = m >>> shift; const rem = m & ((1 << shift) - 1), half = 1 << (shift - 1);
    if (rem > half || (rem === half && (r & 1))) r++;
    return sign | r;
  }
  let r = (e << 10) | (man >>> 13); const rem = man & 0x1fff;
  if (rem > 0x1000 || (rem === 0x1000 && (r & 1))) r++;                 // may carry into the exponent: correct
  return sign | r;
}
/** float16 bits -> float32 */
export function fromHalf(h) {
  const s = h & 0x8000 ? -1 : 1, e = (h >>> 10) & 0x1f, m = h & 0x3ff;
  if (e === 0) return s * m * 2 ** -24;
  if (e === 0x1f) return m ? NaN : s * Infinity;
  return s * (1 + m / 1024) * 2 ** (e - 15);
}
export function toHalfArray(src) { const out = new Uint16Array(src.length); for (let i = 0; i < src.length; i++) out[i] = toHalf(src[i]); return out; }
export function fromHalfArray(src) { const out = new Float32Array(src.length); for (let i = 0; i < src.length; i++) out[i] = fromHalf(src[i]); return out; }

/** Largest absolute difference between two equal-length arrays (Infinity if lengths differ). */
export function maxAbsDiff(a, b, mask) {
  if (a.length !== b.length) return Infinity;
  let m = 0;
  for (let i = 0; i < a.length; i++) { if (mask && !mask[i >> 2]) continue; const d = Math.abs(a[i] - b[i]); if (d > m || d !== d) m = d !== d ? Infinity : d; }
  return m;
}
