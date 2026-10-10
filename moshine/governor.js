// governor.js — pure decision logic for M4 (no DOM, no GPU), unit-tested in node:
//   * the real-time governor (spec §10.6): steps preview resolution down when frames miss their budget and back up
//     when there is headroom
//   * import limits per tier and measured throughput (spec §10.2, D2)
//   * the content-ID sampling plan for imported files
//   * export planning (frame range, size, codec choice order)

export const SCALES = [1, 0.75, 0.5, 0.375, 0.25];

/** A governor. feed(ms) after every rendered frame; scale() is the preview scale to use. */
export function createGovernor({ budgetMs = 1000 / 30, down = 1.15, up = 0.55, window = 20, upAfter = 60, start = 0, pinned = null } = {}) {
  let idx = start, hist = [], calm = 0;
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
  return {
    get index() { return pinned ?? idx; }, scale() { return SCALES[pinned ?? idx]; },
    pin(i) { pinned = i === null ? null : Math.max(0, Math.min(SCALES.length - 1, i)); },
    setBudget(ms) { budgetMs = ms; },
    /** Returns true when the scale changed. */
    feed(ms) {
      if (pinned !== null) return false;
      hist.push(ms); if (hist.length > window) hist.shift();
      if (hist.length < window) return false;
      const m = median(hist);
      if (m > budgetMs * down && idx < SCALES.length - 1) { idx++; hist = []; calm = 0; return true; }
      calm = m < budgetMs * up ? calm + 1 : 0;
      if (calm >= upAfter && idx > 0) { idx--; hist = []; calm = 0; return true; }
      return false;
    },
  };
}

/** Fit (w, h) inside a box, keeping aspect, even dimensions, never upscaling. */
export function fitSize(w, h, maxW, maxH) {
  const k = Math.min(1, maxW / w, maxH / h);
  return [Math.max(16, Math.round((w * k) / 2) * 2), Math.max(16, Math.round((h * k) / 2) * 2)];
}

/**
 * Import limits for a clip on this device. tierLimits: one row of platform.TIER_LIMITS. measured: optional
 * { loop1080Ms, decodeFps } from the probe. Returns { preview: [w, h], export: [w, h], maxSeconds, warnings }.
 */
export function importLimits({ w, h, seconds, fps = 30 }, tier, tierLimits, measured = {}) {
  const warnings = [], preview = fitSize(w, h, ...tierLimits.preview), exp = fitSize(w, h, ...tierLimits.export);
  const maxSeconds = tier <= 0 ? 120 : tier === 1 ? 600 : Infinity;
  if (seconds > maxSeconds) warnings.push(`Longer than this device's ${Math.round(maxSeconds / 60)} min limit: trim it, or import anyway with a slow preview.`);
  if (exp[0] < w || exp[1] < h) warnings.push(`Exports here are capped at ${exp[0]}×${exp[1]}.`);
  if (measured.decodeFps && measured.decodeFps < fps * 1.2 && w * h > 1280 * 720) warnings.push(`Decoding ${w}×${h} runs at about ${Math.round(measured.decodeFps)} fps here; preview will drop resolution.`);
  if (measured.loop1080Ms && measured.loop1080Ms > 1000 / fps) warnings.push(`The Mosh Loop takes ~${Math.round(measured.loop1080Ms)} ms per 1080p frame here; the governor will lower preview resolution.`);
  return { preview, export: exp, maxSeconds, warnings };
}

/** Byte ranges sampled for a content ID: size plus the first, middle and last chunk (fast on multi-GB files). */
export function contentIdPlan(size, chunk = 1 << 20) {
  if (size <= 3 * chunk) return [[0, size]];
  const mid = Math.floor(size / 2 - chunk / 2);
  return [[0, chunk], [mid, mid + chunk], [size - chunk, size]];
}

/** Codec preference per container; the first one the browser can encode wins. */
export const CODECS = { mp4: ['avc', 'hevc', 'av1'], webm: ['vp9', 'av1', 'vp8'] };
export const AUDIO_OK = { mp4: ['aac', 'opus', 'mp3', 'flac'], webm: ['opus', 'vorbis'] };

/** Frames to render for an export range in seconds (inclusive start, exclusive end). */
export function exportPlan({ duration, fps }, { start = 0, end = duration } = {}) {
  start = Math.max(0, Math.min(start, duration)); end = Math.max(start, Math.min(end, duration));
  return { start, end, frames: Math.max(0, Math.round((end - start) * fps)) };
}
