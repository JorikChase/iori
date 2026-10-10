// config.js — the Mosh Loop group: defaults, the parameter schema (ranges, labels, the lab builds its
// controls from it) and the style presets. Stage order inside the loop is fixed (spec §5.4):
//   estimate -> field ops (ordered, user list) -> bloom hold -> warp -> residual / intra / refresh -> reset
// Values are display-referred (gamma-encoded) like a codec's Y'CbCr: decision D27.

export const OPS = {
  pan: { label: 'Pan', params: { x: [-64, 64, 0.5, 0], y: [-64, 64, 0.5, 0] } },
  multiply: { label: 'Multiply', params: { gx: [-4, 4, 0.05, 1], gy: [-4, 4, 0.05, 1] } },
  noise: { label: 'Noise', params: { amp: [0, 32, 0.25, 2], cell: [1, 16, 1, 1], hold: [1, 60, 1, 1], mismatch: [0, 0.5, 0.01, 0] } },
  smooth: { label: 'Smooth', params: { radius: [0, 4, 1, 1] } },
  gain: { label: 'Spatial gain', params: { shape: [['rampX', 'rampY', 'invX', 'invY', 'sinX', 'sinY', 'radial', 'mirrorL', 'mirrorR', 'mirrorT', 'mirrorB', 'checker'], 'sinX'], amount: [0, 1, 0.01, 1], freq: [0.25, 16, 0.25, 2], phase: [0, 1, 0.01, 0] } },
  synthetic: { label: 'Synthetic', params: { kind: [['zoom', 'rotate', 'shearX', 'shearY', 'swirl'], 'zoom'], strength: [-0.2, 0.2, 0.001, 0.02], blend: [0, 1, 0.01, 1], mode: [['mix', 'add'], 'add'], cx: [0, 1, 0.01, 0.5], cy: [0, 1, 0.01, 0.5] } },
  lost: { label: 'Lost sectors', params: { density: [0, 1, 0.01, 0.15], layers: [1, 4, 1, 2], life: [1, 120, 1, 12], scale: [1, 16, 1, 3], aspect: [0.25, 4, 0.05, 2] } },
  skip: { label: 'Skip', params: { eps: [0, 4, 0.05, 0.5], mad: [0, 0.2, 0.002, 0.02] } },
  amplify: { label: 'Selective amplify', params: { pct: [0, 1, 0.01, 0.1], gain: [-4, 6, 0.05, 3], which: [['fastest', 'slowest'], 'fastest'] } },
  map: { label: 'Mosh map', params: { amount: [0, 1, 0.01, 1], invert: [false], from: [['source2', 'source'], 'source2'], contrast: [0.25, 4, 0.05, 1] } },
  paint: { label: 'Painted vectors', params: { amount: [-4, 4, 0.05, 1], mode: [['add', 'replace'], 'add'] } },   // + strokes (vectors.js, R2)
};
export const OP_CODE = { pan: 0, multiply: 1, noise: 2, smooth: 3, gain: 4, synthetic: 5, lost: 6, skip: 7, amplify: 8, map: 9, paint: 10 };

/** Image effects (spec §6.1): run inside the loop (cfg.inLoop: the result feeds back and accumulates) or after it
 *  (cfg.post: the history is untouched). stateful = keeps its own previous output. */
export const FX = {
  dct: { label: 'DCT quantise', params: { quality: [1, 100, 1, 35], chroma: [0.5, 4, 0.1, 1.5], cutoff: [1, 64, 1, 64], dcOnly: [false] } },
  chroma: { label: 'Chroma subsample', params: { scheme: [['4:2:0', '4:2:2', '4:1:1', '8x8', '16x16'], '4:2:0'], dx: [-16, 16, 0.5, 0], dy: [-16, 16, 0.5, 0] } },
  deblock: { label: 'Deblock', params: { strength: [0, 1, 0.01, 0.7], grid: [[4, 8, 16], 8], alpha: [0, 0.5, 0.005, 0.12], beta: [0, 0.2, 0.005, 0.04] } },
  posterise: { label: 'Posterise', params: { levels: [2, 64, 1, 12], motion: [0, 1, 0.01, 0] } },
  stripes: { label: 'DCT stripes', params: { amount: [0, 1, 0.01, 0.12], contrast: [0, 1, 0.01, 0.25], hold: [1, 60, 1, 4], freq: [1, 8, 1, 4] } },
  echo: { label: 'Echo / trails', stateful: true, params: { decay: [0, 0.99, 0.01, 0.8], mode: [['mix', 'max', 'add'], 'mix'], warp: [false] } },
  displace: { label: 'Displace by motion', params: { gain: [-8, 8, 0.05, 2] } },
  blockdrag: { label: 'Block drag', params: { prob: [0, 1, 0.01, 0.05], offset: [0, 128, 1, 32], hold: [1, 60, 1, 6], mode: [['drag', 'shuffle'], 'drag'] } },
  slice: { label: 'Slice tear', params: { prob: [0, 1, 0.01, 0.2], height: [1, 64, 1, 8], shift: [0, 256, 1, 40], hold: [1, 60, 1, 3], field: [-4, 4, 1, 0] } },
  rgbsplit: { label: 'RGB split', params: { dx: [-32, 32, 0.5, 4], dy: [-32, 32, 0.5, 0], motion: [-4, 4, 0.05, 0] } },
  colour: { label: 'Colour', params: { black: [0, 1, 0.005, 0], white: [0, 1, 0.005, 1], gamma: [0.2, 5, 0.01, 1], sat: [0, 3, 0.01, 1], hue: [-180, 180, 1, 0], invert: [0, 1, 0.01, 0], threshold: [0, 1, 0.005, 0] } },
  freeze: { label: 'Block freeze', stateful: true, params: { density: [0, 1, 0.01, 0.15], layers: [1, 4, 1, 2], life: [1, 120, 1, 12], scale: [1, 16, 1, 3], aspect: [0.25, 4, 0.05, 2] } },
};
export const FX_CODE = Object.fromEntries(Object.keys(FX).map((k, i) => [k, i]));

/** Stage parameters: [min, max, step, default] for numbers, [options, default] for selects, [bool] for toggles. */
export const SCHEMA = {
  estimate: { label: 'Field: estimate', params: {
    method: [['block', 'flow'], 'block'], source: [['self', 'source2', 'none'], 'self'], against: [['source', 'output'], 'source'],
    search: [4, 64, 1, 16], lambda: [0, 0.02, 0.0005, 0.002], pel: [[1, 2, 4], 2],
    cutMad: [0.01, 0.5, 0.005, 0.05], cutFrac: [0.1, 1, 0.05, 0.5], zeroOnCut: [true] } },   // zeroOnCut: a detected cut is a dropped I-frame (no motion, residual, intra)
  bloom: { label: 'Hold ▸ Bloom', params: { repeat: [0, 120, 1, 0], every: [0, 240, 1, 0], phase: [0, 240, 1, 0], accel: [0.5, 1.5, 0.01, 1], residual: [false], markers: [true], onset: [0, 1, 0.05, 0] } },   // markers: mosh hit markers on the timeline trigger this loop
  warp: { label: 'Warp', params: { sampling: [['nearest', 'bilinear'], 'nearest'], pel: [[0, 1, 2, 4], 2], edge: [['clamp', 'repeat', 'mirror'], 'clamp'], interp: [['block', 'smooth'], 'block'] } },
  residual: { label: 'Residual paint-in', params: { gain: [0, 1, 0.01, 0], steps: [1, 64, 1, 16], mode: [['detail', 'full', 'codec'], 'detail'], dead: [0, 0.25, 0.005, 0.02] } },
  intra: { label: 'Intra refresh', params: { mad: [0, 0.5, 0.005, 0.2], rate: [0, 1, 0.01, 0] } },
  reset: { label: 'Reset', params: { gop: [0, 600, 1, 0], gopKeep: [0, 1, 0.01, 1], honourCut: [0, 1, 0.01, 0], blocks: [0, 0.2, 0.001, 0], sweepBand: [0, 64, 1, 0], sweepSpeed: [0, 16, 0.25, 2], source: [['self', 'source2'], 'self'] } },
};

const defaultsOf = (params) => Object.fromEntries(Object.entries(params).map(([k, d]) => [k, d.length === 4 ? d[3] : d.length === 2 ? d[1] : d[0]]));
export const opDefaults = (op) => ({ op, ...defaultsOf(OPS[op].params) });
export const fxDefaults = (fx) => ({ fx, ...defaultsOf(FX[fx].params) });

export function defaults() {
  const c = { block: 16, seed: 1, ops: [], inLoop: [], post: [] };
  for (const [k, s] of Object.entries(SCHEMA)) c[k] = defaultsOf(s.params);
  c.bloom.hits = [];
  return c;
}

/** Fill missing fields from the defaults (older Mosh IDs keep working). */
export function normalize(cfg = {}) {
  const d = defaults(), c = { ...d, ...cfg };
  for (const k of Object.keys(SCHEMA)) c[k] = { ...d[k], ...(cfg[k] || {}) };
  c.bloom.hits = [...(c.bloom.hits || [])];
  c.ops = (cfg.ops || []).filter((o) => OPS[o.op]).map((o) => ({ ...opDefaults(o.op), ...o }));
  for (const k of ['inLoop', 'post']) c[k] = (cfg[k] || []).filter((o) => FX[o.fx]).map((o) => ({ ...fxDefaults(o.fx), ...o }));
  return c;
}

const P = (over) => normalize(over);
/** A value of 1 that an audio feature pushes up by `depth` (an audio modulator, M7). */
const AUD = (feature, depth) => ({ value: 1, mods: [{ type: 'audio', mode: 'add', depth, params: { feature, smooth: 2 }, seed: 1 }] });
/** Style presets (spec §6.4). Legacy presets are re-expressed as stacks in M3. */
export const PRESETS = {
  // Tuned on the fidelity bench against real MPEG-4 ASP moshes (ref/fidelity-m2.json, study/fidelity.md): half-pel
  // bilinear like the codec's interpolation, and the codec residual (B's P-frame residuals painted onto A).
  'Xvid classic': P({ warp: { sampling: 'bilinear' }, residual: { gain: 1, steps: 32, mode: 'codec', dead: 0.03 } }),
  'Pure smear': P({}),
  'Xvid + residual': P({ residual: { gain: 0.35, steps: 16, mode: 'detail' }, intra: { mad: 0.25, rate: 0.15 } }),
  'Codec residual + intra': P({ residual: { gain: 1, steps: 32, mode: 'codec', dead: 0.03 }, intra: { mad: 0.12, rate: 1 } }),
  // Tuned on the fidelity bench against real x264 moshes (ref/fidelity-m3-h264.json): quarter-pel is the H.264 term;
  // our in-loop deblock and DCT made the fit worse, so the softer look lives on as a creative preset below.
  'H.264 soft': P({ estimate: { pel: 4 }, warp: { sampling: 'bilinear', pel: 4 }, residual: { gain: 1, steps: 32, mode: 'codec', dead: 0.03 } }),
  'Soft deblocked': P({ block: 8, estimate: { pel: 4 }, warp: { sampling: 'bilinear', pel: 4 }, residual: { gain: 1, steps: 32, mode: 'codec', dead: 0.02 },
    inLoop: [{ fx: 'deblock', strength: 0.8, grid: 4, alpha: 0.1, beta: 0.04 }, { fx: 'dct', quality: 70, chroma: 1.5, cutoff: 64 }] }),
  'Fluid': P({ block: 8, estimate: { method: 'flow' }, warp: { sampling: 'bilinear', pel: 0, interp: 'smooth' }, ops: [{ op: 'smooth', radius: 1 }] }),
  'Bloom pulse': P({ bloom: { repeat: 24, every: 48, phase: 12, accel: 1.04 } }),
  'Packet loss': P({ ops: [opDefaults('lost')], reset: { gop: 0, blocks: 0.004 } }),
  'Slam zoom': P({ ops: [{ ...opDefaults('synthetic'), kind: 'zoom', strength: 0.03, mode: 'add', blend: 1 }] }),
  'Sink and rise': P({ ops: [{ ...opDefaults('multiply'), gx: 0, gy: 1.6 }, { ...opDefaults('noise'), amp: 1.5, cell: 2, hold: 4 }] }),
  'Liquid sin': P({ warp: { sampling: 'bilinear' }, ops: [{ ...opDefaults('gain'), shape: 'sinX', freq: 3, amount: 1 }, opDefaults('smooth'), { ...opDefaults('multiply'), gx: 1.6, gy: 1.6 }] }),
  'Healing GOP': P({ reset: { gop: 0, blocks: 0.01, sweepBand: 6, sweepSpeed: 1.5 }, residual: { gain: 0.25, steps: 12, mode: 'detail' } }),
  // M7, audio-reactive (they need media with sound; silent media leaves them as their base look)
  'Bass pump': P({ warp: { sampling: 'bilinear' }, residual: { gain: 1, steps: 32, mode: 'codec', dead: 0.03 }, ops: [{ op: 'multiply', gx: AUD('bass', 2.5), gy: AUD('bass', 2.5) }] }),
  'Onset bloom': P({ warp: { sampling: 'bilinear' }, residual: { gain: 1, steps: 32, mode: 'codec', dead: 0.03 }, bloom: { repeat: 12, onset: 0.5, accel: 1.02 } }),
  'Beat heal': P({ residual: { gain: 0.35, steps: 16, mode: 'detail' }, reset: { blocks: { value: 0, mods: [{ type: 'trigger', mode: 'replace', depth: 0.6, params: { source: 'onsets', threshold: 0.5, hold: 1, decay: 6, n: 30, phase: 0 }, seed: 1 }] } } }),
};

// ---- The twelve legacy DATAMOSHINE presets re-expressed as stacks (spec §6.5 mapping: destruction rate ->
// 1 - honourCut / gopKeep, max interval -> gop, bloom count / duplication interval -> bloom repeat / every,
// motion multiplier -> multiply, vector noise % -> noise amp (100 % = 8 px), smoothing -> smooth, compression Q
// (0-51) -> in-loop DCT quality 100 - 1.8 Q). B-frame reordering is a v2 frame-order op and is not mapped yet.
const XC = PRESETS['Xvid classic'], legacy = (o) => normalize({ ...JSON.parse(JSON.stringify(XC)), ...o, warp: { ...XC.warp, ...(o.warp || {}) }, residual: { ...XC.residual, ...(o.residual || {}) } });
const noise = (pct, extra = {}) => ({ op: 'noise', amp: (pct / 100) * 8, cell: 1, hold: 1, mismatch: 0, ...extra });
const dctQ = (q) => ({ fx: 'dct', quality: Math.round(100 - 1.8 * q), chroma: 1.5, cutoff: 64 });
export const LEGACY = {
  '01 Classic Melt': legacy({}),
  '02 Bloom & Bleed': legacy({ reset: { honourCut: 1 }, bloom: { repeat: 25, every: 50, phase: 10 }, ops: [{ op: 'multiply', gx: 1.5, gy: 1.5 }, noise(5), { op: 'smooth', radius: 1 }] }),
  '03 Stutter Step': legacy({ reset: { honourCut: 0.5, gop: 30, gopKeep: 0.5 }, bloom: { repeat: 5, every: 10 } }),
  '04 Phantom Trail': legacy({ reset: { honourCut: 1 }, bloom: { repeat: 30, every: 60, phase: 15 }, ops: [{ op: 'multiply', gx: 0.8, gy: 0.8 }, { op: 'smooth', radius: 1 }], post: [{ fx: 'echo', decay: 0.85, mode: 'mix', warp: true }] }),
  '05 Pixel Storm': legacy({ reset: { honourCut: 0.2 }, ops: [{ op: 'multiply', gx: 2, gy: 2 }, noise(60)], inLoop: [dctQ(40)] }),
  '06 Motion Hijack': legacy({ estimate: { source: 'source2' } }),
  '07 Static Flow': legacy({ reset: { source: 'source2' }, bloom: { repeat: 10, every: 20 }, ops: [{ op: 'multiply', gx: 0.5, gy: 0.5 }, { op: 'smooth', radius: 1 }] }),
  '08 Time Slicer': legacy({ reset: { honourCut: 0.1, gop: 10, gopKeep: 0.1 }, ops: [noise(10)], post: [{ fx: 'slice', prob: 0.3, height: 6, shift: 48, hold: 2, field: 0 }] }),
  '09 Acid Wash': legacy({ reset: { honourCut: 0.4 }, ops: [{ op: 'multiply', gx: 4, gy: 4 }, noise(80)], inLoop: [dctQ(10)], post: [{ fx: 'colour', sat: 1.8, hue: 25 }] }),
  '10 Water Ripple': legacy({ reset: { honourCut: 0.8 }, bloom: { repeat: 40, every: 80, phase: 20 }, warp: { interp: 'smooth' }, ops: [{ op: 'multiply', gx: 0.3, gy: 0.3 }, { op: 'gain', shape: 'sinX', amount: 0.6, freq: 4, phase: 0 }, { op: 'smooth', radius: 2 }] }),
  '11 Broken Signal': legacy({ reset: { honourCut: 0.6, gop: 15, gopKeep: 0.6 }, bloom: { repeat: 2, every: 40 }, ops: [noise(20), { op: 'lost', density: 0.15, layers: 2, life: 12, scale: 3, aspect: 2 }], inLoop: [dctQ(51)], post: [{ fx: 'slice', prob: 0.25, height: 4, shift: 32, hold: 3, field: 0 }, { fx: 'rgbsplit', dx: 3, dy: 0, motion: 0 }] }),
  '12 Echo Proj.': legacy({ reset: { source: 'source2', gop: 30 } }),
};

// ---- Mosh ID: the config in the URL hash (base64url JSON). Deterministic: same ID, same pixels.
export const toMoshID = (cfg) => btoa(unescape(encodeURIComponent(JSON.stringify(cfg)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function fromMoshID(s) {
  try { return normalize(JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))))); } catch (e) { return null; }
}
