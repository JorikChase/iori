/* Sung-vowel synthesiser for detector tests: a glottal pulse train (Rosenberg-like) with jitter, shimmer, vibrato
   and breath noise, through three formant resonators. Female 'a' formants ~ 850/1220/2810 Hz, male ~ 730/1090/2440. */
function voice({ f0, sr = 48000, dur = 1, sex = 'f', jitter = 0.01, shimmer = 0.06, vib = 0.012, breath = 0.18, seed = 1, gain = 0.3 }) {
  let rnd = seed; const R = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
  const n = Math.floor(sr * dur), x = new Float32Array(n);
  let ph = 0, amp = 1, per = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, f = f0 * (1 + vib * Math.sin(2 * Math.PI * 5.5 * t)) * (1 + jitter * (R() - .5) * 2 * (per === 0 ? 1 : 0));
    ph += f / sr; if (ph >= 1) { ph -= 1; amp = 1 + shimmer * (R() - .5) * 2; per = 0; } else per++;
    const op = 0.6; const g = ph < op ? 0.5 * (1 - Math.cos(Math.PI * ph / op)) : Math.cos(Math.PI * (ph - op) / (2 * (1 - op)));  // glottal flow
    x[i] = amp * g;
  }
  // differentiate (lip radiation) + breath noise
  const y = new Float32Array(n); for (let i = 1; i < n; i++) y[i] = (x[i] - x[i - 1]) * 30 + breath * (R() - .5);
  const F = sex === 'f' ? [[850, 90], [1220, 110], [2810, 160]] : [[730, 70], [1090, 90], [2440, 130]];
  let out = new Float32Array(n);
  for (const [fc, bw] of F) {          // parallel two-pole resonators
    const r = Math.exp(-Math.PI * bw / sr), th = 2 * Math.PI * fc / sr, a1 = 2 * r * Math.cos(th), a2 = -r * r; let y1 = 0, y2 = 0;
    for (let i = 0; i < n; i++) { const v = y[i] + a1 * y1 + a2 * y2; y2 = y1; y1 = v; out[i] += v * (1 - r); }
  }
  let mx = 0; for (const v of out) mx = Math.max(mx, Math.abs(v)); for (let i = 0; i < n; i++) out[i] = out[i] / mx * gain;
  return out;
}
module.exports = voice;
