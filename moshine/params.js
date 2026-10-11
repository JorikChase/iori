// params.js — parameter resolution, pure functions of (value, frame, clock). Every engine node reads its parameters
// through resolveAll(), so keyframes and modulators change nothing downstream.
//
// AnimatableValue: number | boolean | string | { value } | { keys: [{ frame, value, interp }] }, either object with
//   mods: [Modulator] applied in order to the numeric base value.
// interp: 'hold' | 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
// Modulator: { type, mode: 'add' | 'multiply' | 'replace', depth, clamp?: [lo, hi], params, seed?, enabled? }
// Clock: { fps, seed, hits } — the frame rate (rates are in Hz), the owning effect's seed, and the mosh hit frames in
//   the same time base as t. Modulators are pure functions of (t, clock): replay, scrubbing, GPU and CPU agree.
import { dsin } from './dmath.js';
import { hash3 } from './util.js';

const EASE = {
  hold: () => 0, linear: (u) => u,
  easeIn: (u) => u * u, easeOut: (u) => 1 - (1 - u) * (1 - u), easeInOut: (u) => u * u * (3 - 2 * u),
};

const isAnim = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && ('value' in v || 'keys' in v);
export const DEFAULT_CLOCK = Object.freeze({ fps: 30, seed: 0, hits: [] });

// ------------------------------------------------------------------------------------------------ modulators
const frac = (x) => x - Math.floor(x), bip = (u) => u * 2 - 1;
const SHAPES = {
  sine: (f) => dsin(2 * Math.PI * f),                                 // deterministic in every JS engine (M8)
  triangle: (f) => (f < 0.25 ? 4 * f : f < 0.75 ? 2 - 4 * f : 4 * f - 4),
  saw: (f) => 2 * f - 1, sawDown: (f) => 1 - 2 * f, square: (f) => (f < 0.5 ? 1 : -1),
};
const seedOf = (m, c) => (Math.imul((m.seed ?? 1) | 0, 7919) + ((c.seed | 0) * 31)) | 0;
const vnoise = (x, s, o) => { const i = Math.floor(x), u = x - i, a = hash3(i, s, 71 + o), b = hash3(i + 1, s, 71 + o); return a + (b - a) * u * u * (3 - 2 * u); };
/** Last trigger frame <= t for a trigger modulator (-Infinity if none). */
function lastTrigger(p, t, c) {
  let last = -Infinity;
  const src = p.source || 'every';
  if (src === 'every' && p.n > 0) { const ph = p.phase | 0; if (t >= ph) last = ph + Math.floor((t - ph) / p.n) * p.n; }
  if (src === 'onsets') {                                                // M7: onset peaks of the audio (within the envelope's reach)
    if (!c.audio) return last; const thr = p.threshold ?? 0.5, reach = Math.max(1, p.hold | 0 || 1) + (p.decay | 0) + 1, v = (x) => c.audio('onset', x);
    for (let e = 0; e <= reach; e++) { const x = v(t - e); if (x >= thr && x >= v(t - e - 1) && x > v(t - e + 1)) return t - e; }
    return last;
  }
  const list = src === 'hits' ? c.hits || [] : src === 'manual' ? p.frames || [] : [];
  for (const h of list) { const at = typeof h === 'number' ? h : h.at; if (at <= t && at > last) last = at; }
  return last;
}
/**
 * Modulator sources: value at frame t. lfo, noise, randomHold are bipolar [-1, 1]; trigger is an envelope in [0, 1]
 * (1 for `hold` frames from each trigger, then a linear `decay` over that many frames).
 */
export const MODULATORS = {
  lfo: { bipolar: true, params: { shape: [Object.keys(SHAPES), 'sine'], rate: [0.01, 30, 0.01, 1], phase: [0, 1, 0.01, 0] },
    at: (p, t, c) => (SHAPES[p.shape] || SHAPES.sine)(frac((p.phase || 0) + (t * (p.rate ?? 1)) / c.fps)) },
  noise: { bipolar: true, params: { freq: [0.01, 30, 0.01, 1], octaves: [1, 4, 1, 1] },
    at(p, t, c, s) {
      let v = 0, amp = 1, sum = 0; const x = (t * (p.freq ?? 1)) / c.fps;
      for (let o = 0; o < Math.max(1, Math.min(4, p.octaves | 0 || 1)); o++, amp *= 0.5) { v += amp * vnoise(x * 2 ** o, s, o); sum += amp; }
      return bip(v / sum);
    } },
  randomHold: { bipolar: true, params: { rate: [0.01, 30, 0.01, 4] },
    at: (p, t, c, s) => bip(hash3(Math.floor((t * (p.rate ?? 4)) / c.fps), s, 73)) },
  /** M7: an audio feature of the sound heard at the frame (clock.audio), averaged over the last `smooth` frames. 0..1. */
  audio: { bipolar: false, params: { feature: [['rms', 'bass', 'mid', 'high', 'onset'], 'bass'], smooth: [0, 30, 1, 2] },
    at(p, t, c) { if (!c.audio) return 0; const n = Math.max(0, p.smooth | 0); let s = 0; for (let k = 0; k <= n; k++) s += c.audio(p.feature || 'bass', t - k); return s / (n + 1); } },
  trigger: { bipolar: false, params: { source: [['every', 'hits', 'manual', 'onsets'], 'hits'], n: [1, 600, 1, 30], phase: [0, 600, 1, 0], hold: [1, 120, 1, 1], decay: [0, 240, 1, 0], threshold: [0, 1, 0.05, 0.5] },
    at(p, t, c) {
      const e = t - lastTrigger(p, t, c), hold = Math.max(1, p.hold | 0 || 1), dec = p.decay | 0;
      if (!(e >= 0)) return 0;
      if (e < hold) return 1;
      return dec > 0 ? Math.max(0, 1 - (e - hold + 1) / (dec + 1)) : 0;
    } },
};
/** Default modulator of a type (the UI clamps it to the parameter's range). */
export function modulatorDefaults(type, { mode = 'add', depth = 1, seed = 1, clamp } = {}) {
  const M = MODULATORS[type]; if (!M) throw new Error(`unknown modulator ${type}`);
  const params = Object.fromEntries(Object.entries(M.params).map(([k, d]) => [k, d.length === 4 ? d[3] : d.length === 2 ? d[1] : d[0]]));
  return { type, mode, depth, params, seed, ...(clamp ? { clamp: [...clamp] } : {}) };
}
/** Apply modulators to a numeric base value at frame t. Unknown types (audio before M7, macro, expr) pass through. */
export function modulate(base, mods, t, clock = DEFAULT_CLOCK) {
  let v = base; const c = { ...DEFAULT_CLOCK, ...clock };
  for (const m of mods) {
    const M = MODULATORS[m.type]; if (!M || m.enabled === false) continue;
    const y = M.at(m.params || {}, t, c, seedOf(m, c)), d = m.depth ?? 1;
    v = m.mode === 'multiply' ? v * (1 + d * y) : m.mode === 'replace' ? d * y : v + d * y;
    if (m.clamp) v = Math.min(Math.max(v, m.clamp[0]), m.clamp[1]);
  }
  return v;
}

// ------------------------------------------------------------------------------------------------ resolution
function base(v, t) {
  if (!v.keys || v.keys.length === 0) return v.value;
  const k = v.keys;
  if (t <= k[0].frame) return k[0].value;
  if (t >= k[k.length - 1].frame) return k[k.length - 1].value;
  let i = 0; while (k[i + 1].frame <= t) i++;
  const a = k[i], b = k[i + 1];
  if (typeof a.value !== 'number') return a.value;
  const u = (t - a.frame) / (b.frame - a.frame);
  return a.value + (b.value - a.value) * (EASE[a.interp || 'linear'] || EASE.linear)(u);
}

/** Value of one animatable at integer frame t (keyframes, then modulators). */
export function resolve(v, t, clock) {
  if (!isAnim(v)) return v;
  const b = base(v, t);
  return v.mods && v.mods.length && typeof b === 'number' ? modulate(b, v.mods, t, clock) : b;
}

/** Deep-resolve a config object at frame t: animatables become plain values, everything else is copied. */
export function resolveAll(cfg, t, clock) {
  if (isAnim(cfg)) return resolve(cfg, t, clock);
  if (Array.isArray(cfg)) return cfg.map((x) => resolveAll(x, t, clock));
  if (cfg !== null && typeof cfg === 'object') { const o = {}; for (const k of Object.keys(cfg)) o[k] = resolveAll(cfg[k], t, clock); return o; }
  return cfg;
}

/** Sample a parameter over [from, to) for drawing: { base, value } per frame (value includes the modulators; the
 *  difference is the ghost curve over the keyframe lane). */
export function curve(v, from, to, clock) {
  const n = Math.max(0, to - from), b = new Float64Array(n), val = new Float64Array(n);
  for (let i = 0; i < n; i++) { const t = from + i, x = isAnim(v) ? base(v, t) : v; b[i] = typeof x === 'number' ? x : NaN; const y = resolve(v, t, clock); val[i] = typeof y === 'number' ? y : NaN; }
  return { base: b, value: val };
}

/** Round every number in a resolved config to float32, so the CPU reference compares exactly like the GPU. */
export function f32All(cfg) {
  if (typeof cfg === 'number') return Math.fround(cfg);
  if (Array.isArray(cfg)) return cfg.map(f32All);
  if (cfg !== null && typeof cfg === 'object') { const o = {}; for (const k of Object.keys(cfg)) o[k] = f32All(cfg[k]); return o; }
  return cfg;
}

/**
 * Bloom hold index at frame t: -1 when not holding, else k = frames since the trigger (0 = the trigger frame,
 * where the field is frozen). Triggers: every `every` frames from `phase` (hold `repeat`), plus explicit `hits`:
 * a frame number (hold `repeat`) or { at, len } (hold `len`; mosh hit markers and Bloom Insert). The latest
 * trigger wins, so a hit inside a hold re-freezes. Pure function of t: replay and scrubbing agree.
 */
export function holdAt(t, bloom, t0 = 0) {
  if (!bloom) return -1;
  const rep = bloom.repeat > 0 ? bloom.repeat : 0;
  let last = -Infinity, len = rep;
  if (rep > 0 && bloom.every > 0) { const ph = t0 + (bloom.phase | 0); if (t >= ph) last = ph + Math.floor((t - ph) / bloom.every) * bloom.every; }
  for (const h of bloom.hits || []) {
    const at = typeof h === 'number' ? h : h.at, n = typeof h === 'number' ? rep : h.len > 0 ? h.len : rep;
    if (at <= t && at > last && at > t0) { last = at; len = n; }
  }
  const k = t - last;
  return last > t0 && k < len ? k : -1;
}
