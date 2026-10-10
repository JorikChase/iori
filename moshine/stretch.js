// stretch.js — time-stretch without pitch change (spec §9, D6), WSOLA in plain JS: deterministic and offline, used for
// the audio under Bloom Insert (playback and the export mix). Overlap-add of Hann-windowed frames whose read position is
// nudged within ±tolerance to best continue the previous frame (cross-correlation on the mono mix; every channel uses the
// same positions). Our own code by decision (D42); createStretcher runs it in a worker.

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
  // the mono mix with zeros on both sides, so the search reads it directly (no bounds checks); same sums, same order
  const PAD = Math.ceil(n / Hs + 2) * Hs + T + N, mono = new Float64Array(n + 2 * PAD);
  for (const c of channels) for (let i = 0; i < n; i++) mono[PAD + i] += c[i] / C;
  const acc = channels.map(() => new Float64Array(outLen + N)), norm = new Float64Array(outLen + N);
  let prev = 0;                                                         // read position of the previous frame
  for (let k = 0, o = 0; o < outLen; k++, o += Hs) {
    const nominal = Math.round(k * Ha);
    let best = nominal;
    if (k > 0) {                                                        // the frame that best continues the previous one
      const nat = prev + Hs; let bc = -Infinity;
      const q0 = Math.min(Math.max(nat + PAD, 0), mono.length - Hs);  // nat is always within the padding
      for (let d = -T; d <= T; d++) {
        const p = nominal + d; let s = 0;
        const p0 = p + PAD;
        if (p0 >= 0 && p0 + Hs <= mono.length) for (let i = 0; i < Hs; i += 2) s += mono[p0 + i] * mono[q0 + i];
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

/**
 * A stretcher for the browser: stretch(channels, outLen, opts) -> Promise<Float32Array[]>, made in a module worker so
 * playback and export never stall on a long hold (D42). Without Worker (node) it runs wsola inline. The input
 * channels are transferred (the caller must not reuse them).
 */
export function createStretcher() {
  if (typeof Worker === 'undefined') return { stretch: async (channels, outLen, opts) => wsola(channels, outLen, opts), close() {} };
  let w = null, next = 1; const waiting = new Map();
  const worker = () => {
    if (w) return w;
    w = new Worker(new URL('./stretch-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => { const p = waiting.get(e.data.id); if (!p) return; waiting.delete(e.data.id); e.data.error ? p.reject(new Error(e.data.error)) : p.resolve(e.data.out); };
    w.onerror = (e) => { for (const p of waiting.values()) p.reject(new Error('stretch worker: ' + (e.message || 'failed'))); waiting.clear(); w?.terminate(); w = null; };
    return w;
  };
  return {
    stretch(channels, outLen, opts) {
      const id = next++;
      return new Promise((resolve, reject) => { waiting.set(id, { resolve, reject }); worker().postMessage({ id, channels, outLen, opts }, channels.map((c) => c.buffer)); });
    },
    close() { w?.terminate(); w = null; for (const p of waiting.values()) p.reject(new Error('stretcher closed')); waiting.clear(); },
  };
}
