// mix.js — the sequence's sound (spec §9): every clip on the audible audio channels (unmuted; solo respected) mixed into
// a block of samples on the sequence clock, with gains, resampling, mono/stereo mapping and the stretch segments of Bloom
// Insert (audio.js; WSOLA from stretch.js). One function for playback (audioplay.js, half-second blocks) and the export
// mix: deterministic, and mixing a range in one block equals mixing it in pieces (stretched pieces are stretched whole,
// once, and sliced), so blocks join without seams. A video clip's own sound is not played: its linked audio clip is.
import { audioPieces } from './audio.js';
import { wsola } from './stretch.js';
import { resolve } from './params.js';

/** The audio clips heard in a sequence: unmuted audio channels (only soloed ones when any is soloed). */
export function audibleClips(seq) {
  const ch = seq.channels.filter((c) => c.kind === 'audio' && !c.bypassed), solo = ch.some((c) => c.solo);
  return (solo ? ch.filter((c) => c.solo) : ch).flatMap((c) => c.clips);
}

/** Linear resample of channels from rate a to rate b, `n` output samples starting at source sample `start` (fractional). */
function resample(src, a, b, start, n) {
  const k = a / b;
  return src.map((x) => { const y = new Float32Array(n); for (let i = 0; i < n; i++) { const p = start + i * k, j = Math.floor(p), f = p - j, v0 = x[j] ?? 0, v1 = x[j + 1] ?? v0; y[i] = v0 + (v1 - v0) * f; } return y; });
}
/** Map channel arrays to `nch` output channels (mono duplicates, more than nch averages down to mono first). */
function fitChannels(src, nch) {
  if (src.length === nch) return src;
  if (src.length === 1) return Array.from({ length: nch }, () => src[0]);
  const m = new Float32Array(src[0].length); for (const c of src) for (let i = 0; i < m.length; i++) m[i] += c[i] / src.length;
  return nch === 1 ? [m] : Array.from({ length: nch }, (_, i) => src[i] || m);
}

/**
 * Mix sequence samples [s0, s1) at rate sr (sample 0 = sequence frame 0) into nch channels.
 * decode(media, t0, t1) -> Promise<{ sampleRate, first, channels: Float32Array[] }> covers at least media seconds [t0, t1)
 * (0 = the media's first video frame); `first` is the media sample index of channels[x][0], so positions stay exact. cache: a Map kept across calls for stretched pieces (playback and export pass one).
 */
export async function mixBlock({ project, seq, s0, s1, sr, nch = 2, decode, cache = new Map() }) {
  const n = Math.max(0, s1 - s0), out = Array.from({ length: nch }, () => new Float32Array(n)), fps = seq.timebase.num / seq.timebase.den;
  const S = (frames) => Math.round((frames * sr) / fps);                 // sequence frames -> absolute output samples
  for (const k of audibleClips(seq)) {
    const a0 = S(k.range.in), a1 = S(k.range.out); if (a1 <= s0 || a0 >= s1) continue;
    const media = project.media.find((m) => m.id === k.mediaId); if (!media?.hasAudio) continue;
    for (const p of audioPieces(k)) {
      const P0 = S(k.range.in + p.from), P1 = S(k.range.in + p.to), a = Math.max(s0, P0), b = Math.min(s1, P1); if (b <= a) continue;
      const srcFrames = p.src1 - p.src0, outFrames = p.to - p.from, stretched = Math.abs(srcFrames - outFrames) > 1e-6;
      let chans;
      if (!stretched) {                                                 // unit rate: decode just this slice
        const t0 = (p.src0 + ((a - P0) * fps) / sr) / fps, d = await decode(media, Math.max(0, t0 - 0.01), t0 + (b - a) / sr + 0.01), msr = d.sampleRate;
        // the source sample under output sample a, as one division of integer products (exact when the rates divide evenly)
        const pos = (p.src0 * msr * seq.timebase.den) / seq.timebase.num + ((a - P0) * msr) / sr;
        chans = resample(d.channels, msr, sr, pos - d.first, b - a);
      } else {                                                          // stretched: the whole piece once, then slice
        const key = JSON.stringify([k.id, k.mediaId, k.sourceIn, k.stretch, p.from, p.to, sr]);
        let whole = cache.get(key);
        if (!whole) {
          const t0 = p.src0 / fps, t1 = (p.src0 + srcFrames) / fps, d = await decode(media, t0, t1), m = Math.max(1, Math.round((t1 - t0) * sr));
          whole = wsola(resample(d.channels, d.sampleRate, sr, (p.src0 * d.sampleRate * seq.timebase.den) / seq.timebase.num - d.first, m), P1 - P0); cache.set(key, whole);
          if (cache.size > 64) cache.delete(cache.keys().next().value);
        }
        chans = whole.map((c) => c.subarray(a - P0, b - P0));
      }
      chans = fitChannels(chans, nch);
      const g = resolve(k.gain ?? 1, Math.floor(((a * fps) / sr) - k.range.in));
      for (let c = 0; c < nch; c++) { const o = out[c], x = chans[c]; for (let i = 0; i < b - a; i++) o[a - s0 + i] += x[i] * g; }
    }
  }
  return out;
}
