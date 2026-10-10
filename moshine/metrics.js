// metrics.js — image similarity for the fidelity bench (node) and the lab (browser). Pure functions on
// RGB(A) arrays with values in [0, 1]. Luma uses BT.601 weights here because the reference is an MPEG-4
// ASP decode, whose Y'CbCr is BT.601.
//
// SSIM-8: Wang et al. SSIM on luma, 8x8 windows with stride 4, uniform weights, C1 = 0.01^2, C2 = 0.03^2.
// PSNR: luma, peak 1.

/** Luma plane from an RGB (stride 3) or RGBA (stride 4) image. */
export function luma601(img, w, h, stride = img.length / (w * h)) {
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = 0.299 * img[i * stride] + 0.587 * img[i * stride + 1] + 0.114 * img[i * stride + 2];
  return out;
}
/** Quantise to 8 bits like a decoded frame (fair comparison of a float simulation with an 8-bit decode). */
export function to8(img) { const o = new Float32Array(img.length); for (let i = 0; i < img.length; i++) o[i] = Math.round(Math.min(1, Math.max(0, img[i])) * 255) / 255; return o; }
/** u8 RGB bytes -> Float32 RGB in [0, 1]. */
export function fromU8(bytes) { const o = new Float32Array(bytes.length); for (let i = 0; i < bytes.length; i++) o[i] = bytes[i] / 255; return o; }

export function psnr(a, b) {
  let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  const mse = s / a.length; return mse === 0 ? 99 : Math.min(99, 10 * Math.log10(1 / mse));
}
export function ssim(a, b, w, h, win = 8, stride = 4) {
  const C1 = 1e-4, C2 = 9e-4, n = win * win; let sum = 0, cnt = 0;
  for (let y = 0; y + win <= h; y += stride) for (let x = 0; x + win <= w; x += stride) {
    let ma = 0, mb = 0;
    for (let j = 0; j < win; j++) for (let i = 0; i < win; i++) { const k = (y + j) * w + x + i; ma += a[k]; mb += b[k]; }
    ma /= n; mb /= n; let va = 0, vb = 0, cv = 0;
    for (let j = 0; j < win; j++) for (let i = 0; i < win; i++) { const k = (y + j) * w + x + i, da = a[k] - ma, db = b[k] - mb; va += da * da; vb += db * db; cv += da * db; }
    va /= n - 1; vb /= n - 1; cv /= n - 1;
    sum += ((2 * ma * mb + C1) * (2 * cv + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2)); cnt++;
  }
  return cnt ? sum / cnt : 1;
}
/** Both metrics on two images (any stride), luma only. */
export function compare(a, b, w, h) { const A = luma601(a, w, h), B = luma601(b, w, h); return { ssim: ssim(A, B, w, h), psnr: psnr(A, B) }; }
