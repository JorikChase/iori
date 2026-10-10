// stretch.js — time-stretch without pitch change (spec §9, D6), WSOLA in plain JS: deterministic and offline, used for
// the audio under Bloom Insert (playback and the export mix). Overlap-add of Hann-windowed frames whose read position is
// nudged within ±tolerance to best continue the previous frame (cross-correlation on the mono mix; every channel uses the
// same positions). A different stretcher (signalsmith-stretch, spec §9) can replace it behind the same function.

/**
 * Stretch channels (Float32Array[], equal length n) to exactly `outLen` samples. Returns Float32Array[].
 * frame: analysis window in samples (default ~21 ms at 48 kHz); tol: search radius in samples.
 */
export function wsola(channels, outLen, { frame = 1024, tol = 256 } = {}) {
  const n = channels[0]?.length || 0, C = channels.length, out = channels.map(() => new Float32Array(outLen));
  if (!n || !outLen) return out;
  if (outLen === n) { channels.forEach((c, i) => out[i].set(c)); return out; }
  const N = Math.min(frame, 2 ** Math.floor(Math.log2(Math.max(16, n)))), Hs = N >> 1, ratio = outLen / n, Ha = Hs / ratio, T = Math.min(tol, N >> 2);
  const win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const mono = new Float64Array(n); for (const c of channels) for (let i = 0; i < n; i++) mono[i] += c[i] / C;
  const acc = channels.map(() => new Float64Array(outLen + N)), norm = new Float64Array(outLen + N);
  const at = (i) => (i >= 0 && i < n ? mono[i] : 0);
  let prev = 0;                                                         // read position of the previous frame
  for (let k = 0, o = 0; o < outLen; k++, o += Hs) {
    const nominal = Math.round(k * Ha);
    let best = nominal;
    if (k > 0) {                                                        // the frame that best continues the previous one
      const nat = prev + Hs; let bc = -Infinity;
      for (let d = -T; d <= T; d++) {
        const p = nominal + d; let s = 0;
        for (let i = 0; i < Hs; i += 2) s += at(p + i) * at(nat + i);
        if (s > bc) { bc = s; best = p; }
      }
    }
    prev = best;
    for (let i = 0; i < N; i++) {
      const src = best + i, w = win[i], dst = o + i; if (dst >= outLen + N) break;
      norm[dst] += w;
      if (src >= 0 && src < n) for (let c = 0; c < C; c++) acc[c][dst] += channels[c][src] * w;
    }
  }
  for (let c = 0; c < C; c++) for (let i = 0; i < outLen; i++) out[c][i] = norm[i] > 1e-6 ? acc[c][i] / norm[i] : 0;
  return out;
}
