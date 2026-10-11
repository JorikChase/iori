// features.js — audio features for modulators (spec §9, D24): one row per video frame of a media item, computed once
// at import from its decoded audio, stored with the media and read by audio modulators. Deterministic and offline:
// plain double arithmetic over the PCM, streaming (bounded memory for long media).
//
// Columns (each normalised to 0..1 by its 99th percentile over the whole item, so a modulator needs no tuning):
//   rms    overall loudness
//   bass   energy below ~150 Hz      mid  ~150 Hz – 2 kHz      high  above ~2 kHz
//   onset  how sharply the loudness rose against the recent past (spectral-free flux on the band energies), 0..1
import { dsincos } from './dmath.js';

export const FEATURES = ['rms', 'bass', 'mid', 'high', 'onset'];
const NF = FEATURES.length;

/** A 2nd-order section (RBJ cookbook), direct form I, state kept across chunks. */
function biquad(type, f0, sr, q = Math.SQRT1_2) {
  const w = (2 * Math.PI * f0) / sr, [sn, c] = dsincos(w), a = sn / (2 * q);   // deterministic (M8)
  let b0, b1, b2; const a0 = 1 + a, a1 = -2 * c, a2 = 1 - a;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; } else { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
  const B0 = b0 / a0, B1 = b1 / a0, B2 = b2 / a0, A1 = a1 / a0, A2 = a2 / a0; let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => { const y = B0 * x + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}

/**
 * A streaming extractor: push(mono Float32Array) any number of times, then finish() -> { fps, frames, data } with data a
 * Float32Array of frames x FEATURES (row-major). fps is the media's rate { num, den }; frame k covers
 * [k den / num, (k + 1) den / num) seconds of the audio.
 */
export function createFeatureExtractor({ sampleRate: sr, fps }) {
  const lpB = biquad('lp', 150, sr), hpM = biquad('hp', 150, sr), lpM = biquad('lp', 2000, sr), hpH = biquad('hp', 2000, sr);
  const rows = []; let n = 0, k = 0, acc = [0, 0, 0, 0], cnt = 0;
  const frameEnd = (j) => Math.round(((j + 1) * fps.den * sr) / fps.num);     // the sample where frame j ends
  let end = frameEnd(0);
  const close = () => { rows.push(acc.map((s) => Math.sqrt(s / Math.max(1, cnt)))); acc = [0, 0, 0, 0]; cnt = 0; k++; end = frameEnd(k); };
  return {
    push(x) {
      for (let i = 0; i < x.length; i++) {
        const v = x[i], b = lpB(v), m = lpM(hpM(v)), hh = hpH(v);
        acc[0] += v * v; acc[1] += b * b; acc[2] += m * m; acc[3] += hh * hh; cnt++; n++;
        if (n >= end) close();
      }
    },
    finish() {
      if (cnt > 0) close();
      const frames = rows.length, data = new Float32Array(frames * NF);
      // onset: the rise of the summed band energy over the mean of the previous 4 frames (positive part only)
      const e = rows.map((r) => r[1] + r[2] + r[3]), flux = e.map((v, j) => { let m = 0, c = 0; for (let q = Math.max(0, j - 4); q < j; q++) { m += e[q]; c++; } return Math.max(0, v - (c ? m / c : v)); });
      const cols = [0, 1, 2, 3].map((c) => rows.map((r) => r[c])).concat([flux]);
      cols.forEach((col, c) => {
        const s = [...col].sort((a, b) => a - b), ref = s[Math.min(s.length - 1, Math.floor(s.length * 0.99))] || 0;
        col.forEach((v, j) => { data[j * NF + c] = ref > 0 ? Math.min(1, v / ref) : 0; });
      });
      return { fps: { ...fps }, frames, features: FEATURES, data };
    },
  };
}

/** Feature `name` of a table at media frame i (clamped; 0 outside the media or when there is no table). */
export function featureAt(table, name, i) {
  if (!table || !table.frames) return 0;
  const c = FEATURES.indexOf(name); if (c < 0) return 0;
  return table.data[Math.max(0, Math.min(table.frames - 1, i | 0)) * NF + c];
}

/** Bytes for storage: a small JSON header and the float table. */
export function encodeFeatures(t) {
  const head = new TextEncoder().encode(JSON.stringify({ v: 1, fps: t.fps, frames: t.frames, features: t.features })), out = new Uint8Array(4 + head.length + t.data.byteLength);
  new DataView(out.buffer).setUint32(0, head.length, true); out.set(head, 4); out.set(new Uint8Array(t.data.buffer, t.data.byteOffset, t.data.byteLength), 4 + head.length); return out;
}
export function decodeFeatures(bytes) {
  const n = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true), head = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + n)));
  return { ...head, data: new Float32Array(bytes.slice(4 + n).buffer) };
}
