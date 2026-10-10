// sequence.js — the sequence evaluator (spec §4 rules, §7 until M6): render frame N of a sequence. Channels
// composite bottom-up. A media clip's frame is placed by Transform & Blend into a sequence-sized layer, runs its
// clip stack, and is blended onto the composite. An effect clip runs its stack on the composite below it
// (adjustment-clip semantics), one Mosh Loop per effect instance, state reset at the clip's in-point (D18) or
// `warmup` frames before it. Until the checkpoint cache (M6), landing on a frame whose stateful effects are not
// one step behind replays from the earliest in-point involved; playback steps once per frame.
//
// One evaluator, two backends with the same interface: the CPU reference here (Float32Array images, node tests and
// the harness) and the GPU in render.js. Clip-owned values (transform, clip stack params, bloom.hits) are
// clip-relative, so every clip effect runs on clip-local time t - in; a Mosh Loop sees exactly the frames and
// times it would see as a single clip (M4 semantics). Channel stacks run on sequence time and hold stateless
// effects only for now (stateful ones reset at each clip in-point).
import { resolveAll, f32All } from './params.js';
import { EFFECTS } from './project.js';
import { createLoopRef, maskmixRef } from './engine-ref.js';
import { fxChain } from './fx-ref.js';
import { toHalfArray, fromHalfArray, toHalf, fromHalf } from './util.js';
import { cpuSerializer, encodeFile, decodeFile } from './cache.js';
import { resolveMasks, rasterMasks, rasterLock, maskSize, maskKey, createCoverageCache } from './masks.js';
import { featureAt } from './features.js';
import { audioSourceAt } from './audio.js';

const fr = Math.fround;
export const BLEND = { normal: 0, add: 1, multiply: 2, screen: 3, difference: 4 };

// ------------------------------------------------------------------------------------------------ placement
/** Size a source of sw x sh takes in a W x H working image before scale (fit modes). k = working / sequence width. */
export function baseSize(fit, sw, sh, W, H, k = 1) {
  if (fit === 'stretch') return [W, H];
  if (fit === 'none') return [Math.max(1, Math.round(sw * k)), Math.max(1, Math.round(sh * k))];
  const f = (fit === 'fill' ? Math.max : Math.min)(W / sw, H / sh);
  return [Math.max(1, Math.round(sw * f)), Math.max(1, Math.round(sh * f))];
}
/**
 * Inverse-mapping coefficients for a resolved transform, in integer fixed point (1/1024 px):
 *   u = A p + C  with p the integer pixel, u = q - 1/2 the bilinear coordinate in the base-size source.
 * Integer geometry and 1/64 bilinear weights make every product exact in float32, so GPU compilers that fuse
 * multiply-adds (Metal does) give the same bits as the CPU. Identity: u = 1024 p, a pure copy.
 */
export const FIX = 1024;
export function placement(tr, { sw, sh, W, H, k = 1 }) {
  const [bw, bh] = baseSize(tr.fit, sw, sh, W, H, k), th = (tr.rotation * Math.PI) / 180, sc = Math.max(0.01, tr.scale);
  const c = Math.abs(tr.rotation % 90) === 0 ? Math.round(Math.cos(th)) / sc : Math.cos(th) / sc, s = Math.abs(tr.rotation % 90) === 0 ? Math.round(Math.sin(th)) / sc : Math.sin(th) / sc;
  const cx = W / 2 + tr.x * W, cy = H / 2 + tr.y * H, R = (v) => Math.round(v * FIX) | 0;
  return { W, H, bw, bh,
    ax: R(c), bx: R(s), cx: R(c * (0.5 - cx) + s * (0.5 - cy) + bw / 2 - 0.5),
    ay: R(-s), by: R(c), cy: R(c * (0.5 - cy) - s * (0.5 - cx) + bh / 2 - 0.5) };
}
/** CPU twin of the place kernel (nodes/composite.js): integer geometry, 1/64 bilinear weights, clamped taps,
 *  transparent outside the source. */
export function placeRef(src, P) {
  const { W, H, bw, bh } = P, out = new Float32Array(W * H * 4), lo = -(FIX >> 1), hx = bw * FIX - (FIX >> 1), hy = bh * FIX - (FIX >> 1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ux = (Math.imul(P.ax, x) + Math.imul(P.bx, y) + P.cx) | 0, uy = (Math.imul(P.ay, x) + Math.imul(P.by, y) + P.cy) | 0;
    if (!(ux >= lo && uy >= lo && ux < hx && uy < hy)) continue;
    const x0i = ux >> 10, y0i = uy >> 10, fx = (ux & 1023) >> 4, fy = (uy & 1023) >> 4, gx = 64 - fx, gy = 64 - fy;
    const x0 = Math.min(Math.max(x0i, 0), bw - 1), x1 = Math.min(Math.max(x0i + 1, 0), bw - 1), y0 = Math.min(Math.max(y0i, 0), bh - 1), y1 = Math.min(Math.max(y0i + 1, 0), bh - 1);
    const w00 = fr((gx * gy) / 4096), w10 = fr((fx * gy) / 4096), w01 = fr((gx * fy) / 4096), w11 = fr((fx * fy) / 4096);
    const a = (y0 * bw + x0) * 4, b = (y0 * bw + x1) * 4, c = (y1 * bw + x0) * 4, d = (y1 * bw + x1) * 4, o = (y * W + x) * 4;
    for (let k = 0; k < 4; k++) out[o + k] = fr(fr(fr(src[a + k] * w00) + fr(src[b + k] * w10)) + fr(fr(src[c + k] * w01) + fr(src[d + k] * w11)));
  }
  return out;
}
const half = (v) => fromHalf(toHalf(v));
// screen rounds 1 - C and 1 - L to half first: their product is then exact in float32, so a fused multiply-add on the GPU
// gives the same bits (unrounded, 1 - C can need 13 bits and the product would round)
const MODES = [(C, L) => L, (C, L) => fr(C + L), (C, L) => fr(C * L), (C, L) => fr(1 - fr(half(fr(1 - C)) * half(fr(1 - L)))), (C, L) => Math.abs(fr(C - L))];
/** Opacity as an integer of 1/4096 (what the blend kernel receives). */
export const opacity12 = (o) => Math.min(4096, Math.max(0, Math.round(o * 4096)));
/** CPU twin of the blend kernel: coverage a = alpha x opacity in 1/4096 steps (integers), the mode result rounded to
 *  half, then C (1 - a) + B a with exact products; opaque result. */
export function blendRef(comp, layer, opacity, mode) {
  const out = new Float32Array(comp.length), m = BLEND[mode] ?? 0, op = opacity12(opacity);
  for (let i = 0; i < comp.length; i += 4) {
    const a = (Math.imul(Math.floor(layer[i + 3] * 4096 + 0.5), op) + 2048) >> 12, af = a / 4096, gf = (4096 - a) / 4096;
    for (let k = 0; k < 3; k++) {
      const C = comp[i + k];
      if (a <= 0) { out[i + k] = C; continue; }
      const B = half(MODES[m](C, layer[i + k]));
      out[i + k] = a >= 4096 ? B : fr(fr(C * gf) + fr(B * af));
    }
    out[i + 3] = 1;
  }
  return out;
}

export { maskmixRef };

// ------------------------------------------------------------------------------------------------ planning
/**
 * The config a Mosh Loop instance runs with: its params, its seed, and the sequence's mosh hit markers inside the
 * clip's evaluated range turned into clip-local triggers ({ at, len }: len = a marker's `hold`, e.g. Bloom Insert,
 * else the loop's bloom.repeat), unless bloom.markers is off.
 */
export function loopConfig(e, clip, seq, project = clockProject, features = audioFeatures.get) {
  const cfg = { ...e.params, seed: e.seed, clock: clockOf(seq, clip, e.seed, project, features) };
  if (clip && e.params.bloom?.markers !== false) {
    const from = clip.range.in - (clip.warmup | 0), hits = seq.markers.filter((m) => m.hit && m.frame > from && m.frame < clip.range.out).map((m) => ({ at: m.frame - clip.range.in, len: m.hold | 0 }));
    if (hits.length) cfg.bloom = { ...cfg.bloom, hits: [...(cfg.bloom.hits || []), ...hits] };
  }
  const thr = typeof e.params.bloom?.onset === 'number' ? e.params.bloom.onset : 0;      // M7: audio onsets trigger the bloom
  if (clip && thr > 0 && cfg.clock.audio) { const oh = onsetHits(clip, cfg.clock, thr); if (oh.length) cfg.bloom = { ...cfg.bloom, hits: [...(cfg.bloom.hits || []), ...oh] }; }
  return cfg;
}
/** Where audio features come from: (media hash) -> table (features.js). The editor sets it; evaluators may override. */
export const audioFeatures = { get: null };
/** The clip whose sound is heard at sequence frame f: the topmost unmuted audio clip, else the topmost video clip with
 *  sound. { clip, media } or null. */
export function audibleAt(seq, project, f) {
  const media = (id) => project?.media.find((m) => m.id === id), at = (c) => c.clips.find((k) => k.range.in <= f && f < k.range.out);
  const aud = seq.channels.filter((c) => c.kind === 'audio' && !c.bypassed), solo = aud.some((c) => c.solo);
  for (const c of [...aud].reverse()) { if (solo && !c.solo) continue; const k = at(c); if (k) return { clip: k, media: media(k.mediaId) }; }
  for (const c of [...seq.channels].reverse()) { if (c.kind !== 'video' || c.bypassed) continue; const k = at(c), m = k && media(k.mediaId); if (m?.hasAudio) return { clip: k, media: m }; }
  return null;
}
/**
 * The modulator clock for values owned by a clip (clip-local time) or, with no clip, by the sequence: frame rate, the
 * owner's seed, the mosh hit frames, and (M7) audio(name, t), the audio feature heard at that frame, plus audioKey,
 * the feature tables in play (it is part of the config signature, so checkpoints made before a table arrived are not
 * reused after). project and features are optional (no audio without them).
 */
export function clockOf(seq, clip, seed = 0, project = clockProject, features = audioFeatures.get) {
  const off = clip ? clip.range.in : 0, lo = clip ? clip.range.in - (clip.warmup | 0) : -Infinity, hi = clip ? clip.range.out : Infinity;
  const c = { fps: seq.timebase.num / seq.timebase.den, seed: seed | 0, hits: seq.markers.filter((m) => m.hit && m.frame >= lo && m.frame < hi).map((m) => m.frame - off) };
  if (project && features) {
    const used = new Set(seq.channels.filter((ch) => ch.kind === 'audio' || ch.kind === 'video').flatMap((ch) => ch.clips.filter((k) => k.range.in < hi && k.range.out > lo).map((k) => k.mediaId)));
    c.audioKey = project.media.filter((m) => used.has(m.id) && features(m.hash)).map((m) => m.hash).sort().join(',');
    if (c.audioKey) c.audio = (name, t) => {                              // a function: JSON (signatures) skips it
      const f = t + off, a = audibleAt(seq, project, f); if (!a || !a.media) return 0;
      return featureAt(features(a.media.hash), name, soundIndex(a.clip, f - a.clip.range.in, a.media, seq.timebase));
    };
  }
  return c;
}
/** The project clockOf reads audio from when a caller does not pass one (set by createEvaluator / the editor). */
let clockProject = null;
export const setClockProject = (p) => { clockProject = p; };
const onsetCache = new Map();
/** Onset peaks of the audio heard during a clip, as clip-local bloom triggers (bloom.onset is the threshold). */
function onsetHits(clip, clock, thr) {
  const key = JSON.stringify([clock.audioKey, clip.range, clip.warmup | 0, thr]); if (onsetCache.has(key)) return onsetCache.get(key);
  const out = [], v = (t) => clock.audio('onset', t);
  for (let t = -(clip.warmup | 0) + 1, end = clip.range.out - clip.range.in; t < end; t++) { const x = v(t); if (x >= thr && x >= v(t - 1) && x > v(t + 1)) out.push({ at: t, len: 0 }); }
  if (onsetCache.size > 200) onsetCache.clear(); onsetCache.set(key, out); return out;
}
const sigOf = (cfg) => JSON.stringify(cfg);
const isStateful = (e) => e.type === 'moshLoop' || !!EFFECTS[e.type]?.stateful;
/** Frames a clip is evaluated on: effect clips start `warmup` frames early (output unused there). */
const activeFrom = (k) => k.range.in - (k.kind === 'effect' ? k.warmup | 0 : 0);
/** Channels that render: not audio, not bypassed, and only soloed ones when any is soloed. */
export function liveChannels(seq) {
  const vis = seq.channels.filter((c) => c.kind !== 'audio' && !c.bypassed), solo = vis.some((c) => c.solo);
  return solo ? vis.filter((c) => c.solo) : vis;
}
/** What renders at frame t: [{ ch, clip, warm }] bottom-up. warm: an effect clip in its pre-roll. */
export function layersAt(seq, t) {
  const out = [];
  for (const ch of liveChannels(seq)) {
    const k = ch.clips.find((x) => activeFrom(x) <= t && t < x.range.out);
    if (k) out.push({ ch, clip: k, warm: t < k.range.in });
  }
  return out;
}
/** Media frame index heard from a clip at clip-local frame `local`: through the stretch map for audio clips (M7). */
export function soundIndex(clip, local, media, tb) {
  if (clip.kind !== 'audio') return mediaIndex(clip, local, media, tb);
  const s = audioSourceAt(clip, local), mf = media.fps || tb;
  return Math.max(0, Math.floor((s * mf.num * tb.den) / (mf.den * tb.num)));
}
/** Media frame index shown by a clip at clip-local frame `local` (sourceIn counts sequence frames). */
export function mediaIndex(clip, local, media, tb) {
  const s = clip.hold ? clip.sourceIn : clip.sourceIn + local, mf = media.fps || tb;
  const i = Math.floor((s * mf.num * tb.den) / (mf.den * tb.num));
  return Math.max(0, media.durationFrames ? Math.min(i, media.durationFrames - 1) : i);
}

// ------------------------------------------------------------------------------------------------ the evaluator
/**
 * createEvaluator(project, backend): render(t) -> { image, from } where `from` is the first frame rendered (t on
 * playback, an in-point after a seek). invalidate() after any edit (M6 narrows this). The backend owns images.
 * backend: { w, h, black(), source(clip, media, index, bw, bh), place(src, P, key), blend(comp, layer, opacity,
 *   mode, key), loop(cfg), fx(block), destroy() } — loops: begin(t0), step(t, { src, src2 }) -> { display, field },
 *   setConfig(cfg); fx: reset(), apply(img, list, { t, seed, field }).
 */
/** 64-bit string hash (two 32-bit FNV-1a variants), for dependency signatures. */
function strHash(str) {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); a = Math.imul(a ^ c, 0x01000193); b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 15); }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
const bytesOf = (x, seen = new Set()) => {
  if (!x || typeof x !== 'object' || seen.has(x)) return 0; seen.add(x);
  if (ArrayBuffer.isView(x)) return x.byteLength;
  let n = 0; for (const v of Array.isArray(x) ? x : Object.values(x)) n += bytesOf(v, seen); return n;
};

/**
 * createEvaluator(project, backend, opts). Checkpoint store options (M6): K (grid), budget (bytes on the GPU tier),
 * cpuBudget (bytes kept in memory after a readback), disk (a disk tier from cache.js) and diskBudget, adaptK (double K,
 * up to 256, when the last tier has to evict). Spilled checkpoints are lossless (D22).
 */
export function createEvaluator(project, backend, { features, sequenceId, K = 16, budget = 512 * 2 ** 20, cpuBudget = 0, disk = null, diskBudget = Infinity, adaptK = true } = {}) {
  const inst = new Map(), warned = new Set(), ser = backend.serializer || cpuSerializer;
  // audio features: this evaluator's own source, else the editor's registry (read at call time)
  const feat = (h) => (features ? features(h) : audioFeatures.get?.(h));
  const LC = (e, clip, seq) => loopConfig(e, clip, seq, project, feat), CK = (seq, clip, seed) => clockOf(seq, clip, seed, project, feat);
  // ---- the checkpoint store (M6): ckpt.get(g) = { g, insts: Map(key -> { snap, at, dep, block }), tier, bytes, packed, file }
  // where g is a sequence frame on the grid of K and every saved state is the one after stepping frame g - 1, i.e.
  // ready to render g. Tiers: 'gpu' (live snapshots), 'cpu' (packed bytes), 'disk' (one file). A janitor demotes the
  // entry farthest from the last frame asked for while a tier is over budget; a restore promotes an entry back.
  const ckpt = new Map(); let focus = 0, deposits = 0, restores = 0, spills = 0, loads = 0, kRaises = 0, janitor = Promise.resolve();
  const fileTag = Math.random().toString(36).slice(2, 8);           // several evaluators may share one disk tier
  const seqOf = () => project.sequences.find((s) => s.id === (sequenceId || project.activeSequence));
  const media = (id) => project.media.find((m) => m.id === id);
  const warn = (k, msg) => { if (!warned.has(k)) { warned.add(k); console.warn('moshine: ' + msg); } };
  const keyOf = (e, clip, onChannel) => (onChannel ? `${e.id}@${clip.id}` : e.id);

  /** First frame to render so every stateful effect active in [from, t] is stepped without a gap. */
  function replayStart(seq, t, cold = false) {
    let from = t;
    for (let moved = true; moved;) {
      moved = false;
      for (const ch of liveChannels(seq)) for (const k of ch.clips) {
        const b = activeFrom(k); if (b > t || k.range.out <= from || b >= from) continue;
        const effs = [...(k.stack || []).map((e) => [e, false]), ...(ch.stack || []).map((e) => [e, true])].filter(([e]) => e.enabled && isStateful(e));
        for (const [e, onCh] of effs) {
          const I = inst.get(keyOf(e, k, onCh)), want = onCh ? from - 1 : from - k.range.in - 1;
          if (cold || !I || I.at !== want || (e.type === 'moshLoop' && !onCh && I.sig !== sigOf(LC(e, k, seq)))) { from = b; moved = true; break; }
        }
      }
    }
    return from;
  }

  async function runStack(list, img, { t, clip, ch, onChannel, outs, seq }) {
    let cur = img, field = null, block = 16;
    for (const e of list || []) {
      if (!e.enabled || !EFFECTS[e.type]) continue;
      const key = keyOf(e, clip, onChannel);
      if (e.type === 'moshLoop') {
        if (onChannel) { warn(key, `a Mosh Loop on a channel stack is not evaluated yet (put it on a clip)`); continue; }
        const cfg = LC(e, clip, seq), sig = sigOf(cfg);
        let I = inst.get(key);
        if (!I) inst.set(key, (I = { obj: backend.loop(cfg), at: null, sig }));
        else if (I.sig !== sig) { I.obj.setConfig(cfg); I.sig = sig; I.at = null; }
        if (I.at !== t - 1) I.obj.begin(t);
        const src2 = e.inputs?.source2?.channel ? outs.get(e.inputs.source2.channel) || null : null;
        const r = I.obj.step(t, { src: cur, src2, lock: lockOf(seq, clip, t) }); I.at = t; I.meta = { ch, clip, e, onCh: false, f: t + clip.range.in };
        cur = r.display; field = r.field; block = e.params.block;
      } else {
        let I = inst.get(key);
        if (!I || I.block !== block) { I?.obj.destroy?.(); inst.set(key, (I = { obj: backend.fx(block), at: null, block })); }
        if (EFFECTS[e.type].stateful && I.at !== t - 1) I.obj.reset();
        cur = I.obj.apply(cur, [{ fx: e.type, ...resolveAll(e.params, t, CK(seq, onChannel ? null : clip, e.seed)) }], { t, seed: e.seed, field }); I.at = t;
        if (EFFECTS[e.type].stateful) I.meta = { ch, clip, e, onCh: onChannel, f: onChannel ? t : t + clip.range.in };
      }
    }
    return cur;
  }

  /** Masks (R3): the mosh's output mixed with the clean composite below by the clip's mask coverage at clip time t. */
  const rasters = new Map(), covCache = createCoverageCache(128), shapeSigs = new WeakMap();
  // a mask's shapes signature, computed once per edit (every edit calls invalidate(), which bumps the revision)
  const shapeSig = (m) => { let x = shapeSigs.get(m); if (!x || x.rev !== revision) shapeSigs.set(m, (x = { rev: revision, sig: strHash(JSON.stringify([m.mode, m.invert, m.shapes])) })); return x.sig; };
  const masksAt = (seq, clip, t) => resolveMasks(clip.masks, t, CK(seq, clip), shapeSig);
  const maskP = (mw, mh) => placement({ x: 0, y: 0, scale: 1, rotation: 0, fit: 'stretch' }, { sw: mw, sh: mh, W: backend.w, H: backend.h });
  /** The lock masks' keep coverage for a clip's Mosh Loops at clip time t (in-loop refresh), or null. */
  function lockOf(seq, clip, t) {
    if (clip.kind !== 'effect' || !clip.masks?.some((m) => m.mode === 'lock' && m.enabled !== false)) return null;
    const res = masksAt(seq, clip, t).filter((m) => m.mode === 'lock'); if (!res.length) return null;
    const [mw, mh] = maskSize(backend.w, backend.h), A = backend.w / backend.h, key = 'lock' + maskKey(res, mw, mh, A), id = clip.id + ':lock';
    let r = rasters.get(id); if (!r || r.key !== key) { r = { key, data: rasterLock(res, mw, mh, A, covCache), mw, mh }; rasters.set(id, r); }
    return backend.mask(id, r, maskP(mw, mh));
  }
  function applyMasks(seq, clip, ch, t, clean, moshed) {
    const res = masksAt(seq, clip, t); if (!res.length) return moshed;
    const [mw, mh] = maskSize(backend.w, backend.h), A = backend.w / backend.h, key = maskKey(res, mw, mh, A);
    let r = rasters.get(clip.id); if (!r || r.key !== key) { r = { key, data: rasterMasks(res, mw, mh, A, covCache), mw, mh }; rasters.set(clip.id, r); }
    return backend.maskmix(clean, moshed, backend.mask(clip.id, r, maskP(mw, mh)), ch.id);
  }
  async function frame(seq, f) {
    let comp = backend.black(); const outs = new Map();
    const k = backend.w / seq.width;
    for (const { ch, clip, warm } of layersAt(seq, f)) {
      const local = f - clip.range.in;
      if (clip.kind === 'media') {
        const m = media(clip.mediaId); if (!m) { warn(clip.id, `clip ${clip.id} has no media`); continue; }
        const tr = resolveAll(clip.transform, local, CK(seq, clip)), P = placement(tr, { sw: m.width, sh: m.height, W: backend.w, H: backend.h, k });
        const src = await backend.source(clip, m, mediaIndex(clip, local, m, seq.timebase), P.bw, P.bh);
        let layer = backend.place(src, P, ch.id);
        layer = await runStack(clip.stack, layer, { t: local, clip, ch, onChannel: false, outs, seq });
        layer = await runStack(ch.stack, layer, { t: f, clip, ch, onChannel: true, outs, seq });
        outs.set(ch.id, layer);
        comp = backend.blend(comp, layer, tr.opacity, tr.blend, ch.id);
      } else if (clip.kind === 'effect') {
        let img = await runStack(clip.stack, comp, { t: local, clip, ch, onChannel: false, outs, seq });
        if (!warm) img = await runStack(ch.stack, img, { t: f, clip, ch, onChannel: true, outs, seq });
        if (!warm && clip.masks?.length) img = applyMasks(seq, clip, ch, local, comp, img);
        if (!warm) comp = img;
        outs.set(ch.id, comp);
      }
    }
    return comp;
  }

  /**
   * What the state of an effect at sequence frame g depends on: its config (with only the hits before g), its clip,
   * the sequence's frame rate, and everything below it that it has seen since its start b — the live channels below
   * with their stacks and the clips overlapping [b, g), and the media those use. Equal signature, equal state.
   */
  function depSig(seq, ch, clip, e, onCh, g) {
    const ci = seq.channels.indexOf(ch), b = activeFrom(clip), live = new Set(liveChannels(seq));
    const below = seq.channels.slice(0, ci).filter((c) => live.has(c)).map((c) => ({ id: c.id, stack: c.stack, clips: c.clips.filter((k) => k.range.in < g && k.range.out > b) }));
    const media = new Set(below.flatMap((c) => c.clips.map((k) => k.mediaId)).filter(Boolean));
    const cfg = e.type === 'moshLoop' && !onCh ? LC(e, clip, seq) : { params: e.params, seed: e.seed, audio: CK(seq, onCh ? null : clip, e.seed).audioKey };
    if (cfg.bloom) cfg.bloom = { ...cfg.bloom, hits: cfg.bloom.hits.filter((h) => (typeof h === 'number' ? h : h.at) + clip.range.in < g) };
    if (cfg.clock) cfg.clock = { ...cfg.clock, hits: cfg.clock.hits.filter((h) => h + clip.range.in < g) };
    return strHash(JSON.stringify([seq.timebase, e.id, onCh, cfg, { ...clip, masks: (clip.masks || []).filter((m) => m.mode === 'lock') }, onCh ? ch.stack : 0, below, project.media.filter((m) => media.has(m.id))]));   // include masks mix after the state; locks refresh inside it
  }
  /** Stateful effects that must be carried across frame g to render up to t: active somewhere in [g, t], started before g. */
  function needed(seq, g, t) {
    const out = [];
    for (const ch of liveChannels(seq)) for (const k of ch.clips) {
      const b = activeFrom(k); if (b >= g || b > t || k.range.out <= g) continue;
      for (const e of k.stack || []) if (e.enabled && isStateful(e)) out.push({ key: keyOf(e, k, false), ch, clip: k, e, onCh: false });
      for (const e of ch.stack || []) if (e.enabled && isStateful(e) && e.type !== 'moshLoop') out.push({ key: keyOf(e, k, true), ch, clip: k, e, onCh: true });
    }
    return out;
  }
  // coverage (the ruler) memoises each saved state's signature check per edit revision; render() always checks fresh
  let revision = 0; const okMemo = new WeakMap();
  function validMemo(seq, c, t) {
    return needed(seq, c.g, t).every((n) => {
      const x = c.insts.get(n.key); if (!x) return false;
      const m = okMemo.get(x); if (m && m.rev === revision) return m.ok;
      const ok = x.dep === depSig(seq, n.ch, n.clip, n.e, n.onCh, c.g); okMemo.set(x, { rev: revision, ok }); return ok;
    });
  }
  /** Frames a seek to t would render with the cache as it is (no rendering, no state used): the cold replay start or
   *  the latest valid checkpoint after it. 1 = only t itself. */
  function seekCost(seq, t) {
    const from = replayStart(seq, t, true); if (from >= t) return { cost: 1, from };
    const gs = [...ckpt.keys()].filter((g) => g > from && g <= t).sort((a, b) => b - a);
    for (const g of gs) if (validMemo(seq, ckpt.get(g), t)) return { cost: t - g + 1, from: g, g };
    return { cost: t - from + 1, from };
  }
  function valid(seq, c, t) { return needed(seq, c.g, t).every((n) => { const x = c.insts.get(n.key); return x && x.dep === depSig(seq, n.ch, n.clip, n.e, n.onCh, c.g); }); }
  /** The latest valid checkpoint in (from, t], or null. */
  function best(seq, from, t) {
    const gs = [...ckpt.keys()].filter((g) => g > from && g <= t).sort((a, b) => b - a);
    for (const g of gs) if (valid(seq, ckpt.get(g), t)) return ckpt.get(g);
    return null;
  }
  /** Start decoding the source frames frame f needs (the decoder seeks from a keyframe), in parallel with a restore. */
  function prefetch(seq, f) {
    if (!backend.prefetch) return null;
    return Promise.all(layersAt(seq, f).filter((l) => l.clip.kind === 'media').map((l) => { const m = media(l.clip.mediaId); return m && backend.prefetch(m, mediaIndex(l.clip, f - l.clip.range.in, m, seq.timebase)); }));
  }
  /** Bring a spilled checkpoint back to live snapshots (and the GPU tier). */
  async function promote(c) {
    if (c.busy) await c.busy;
    if (c.tier === 'gpu') return;
    if (c.tier === 'disk') { const { meta, chunks } = decodeFile(await disk.read(c.file)); let o = 0; c.packed = new Map(meta.map((m) => { const p = { tree: m.tree, kinds: m.kinds, chunks: chunks.slice(o, o + m.n) }; o += m.n; return [m.key, p]; })); await disk.remove(c.file); c.file = null; }
    for (const [key, p] of c.packed) c.insts.get(key).snap = ser.deserialize(p);
    c.packed = null; c.tier = 'gpu'; c.bytes = sizeOf(c); loads++;
  }
  const sizeOf = (c) => { let n = 0; for (const x of c.insts.values()) n += x.snap ? x.snap.bytes ?? bytesOf(x.snap) : 0; return n; };
  async function restoreFrom(seq, c, t) {
    await promote(c);
    for (const n of needed(seq, c.g, t)) {
      const x = c.insts.get(n.key); let I = inst.get(n.key);
      if (n.e.type === 'moshLoop') {
        const cfg = LC(n.e, n.clip, seq);
        if (!I) inst.set(n.key, (I = { obj: backend.loop(cfg), at: null, sig: sigOf(cfg) }));
        else if (I.sig !== sigOf(cfg)) { I.obj.setConfig(cfg); I.sig = sigOf(cfg); }
      } else if (!I || I.block !== x.block) { I?.obj.destroy?.(); inst.set(n.key, (I = { obj: backend.fx(x.block), at: null, block: x.block })); }
      I.obj.restore(x.snap); I.at = x.at;
    }
    restores++;
  }
  /** After rendering frame f: on the grid, save every stateful effect that stepped at f (unless a valid checkpoint is there). */
  function deposit(seq, f) {
    const g = f + 1; if (g % K) return;
    const have = ckpt.get(g); if (have && valid(seq, have, g)) return;
    const insts = new Map(); let bytes = 0;
    for (const [key, I] of inst) {
      if (!I.meta || I.meta.f !== f || I.at === null) continue;
      const snap = I.obj.snapshot?.(); if (!snap) continue;
      const m = I.meta, n = snap.bytes ?? bytesOf(snap); bytes += n;
      insts.set(key, { snap, at: I.at, block: I.block ?? m.e.params.block, dep: depSig(seq, m.ch, m.clip, m.e, m.onCh, g) });
    }
    if (!insts.size) return;
    if (have) drop(g);
    ckpt.set(g, { g, insts, bytes, tier: 'gpu', packed: null, file: null, busy: null }); deposits++;
    janitor = janitor.then(tidy).catch((e) => console.warn('moshine: checkpoint spill failed', e));
  }
  const total = (tier) => { let n = 0; for (const c of ckpt.values()) if (c.tier === tier) n += c.bytes; return n; };
  const farthest = (tier) => { let far = null; for (const c of ckpt.values()) if (c.tier === tier && !c.busy && (!far || Math.abs(c.g - focus) > Math.abs(far.g - focus))) far = c; return far; };
  /** Keep every tier within budget: GPU -> memory -> disk -> gone (the farthest from the playhead first). */
  async function tidy() {
    for (;;) {
      let c;
      if (total('gpu') > budget && (c = farthest('gpu')) && ckpt.size > 1) {
        if (!(cpuBudget > 0 || disk)) { lastTierDrop(c); continue; }
        c.busy = (async () => {
          const packed = new Map(); for (const [key, x] of c.insts) packed.set(key, await ser.serialize(x.snap));
          for (const x of c.insts.values()) { x.snap.destroy?.(); x.snap = null; }
          c.packed = packed; c.tier = 'cpu'; c.bytes = [...packed.values()].reduce((n, p) => n + p.chunks.reduce((m, q) => m + q.byteLength, 0), 0); spills++;
        })();
        await c.busy; c.busy = null; if (c.dead) dropNow(c); continue;
      }
      if (total('cpu') > cpuBudget && (c = farthest('cpu'))) {
        if (!disk) { lastTierDrop(c); continue; }
        c.busy = (async () => {
          const meta = [], chunks = []; for (const [key, p] of c.packed) { meta.push({ key, tree: p.tree, kinds: p.kinds, n: p.chunks.length }); chunks.push(...p.chunks); }
          const bytes = encodeFile(meta, chunks); c.file = `${fileTag}-${c.g}.ckpt`; await disk.write(c.file, bytes);
          c.packed = null; c.tier = 'disk'; c.bytes = bytes.byteLength;
        })();
        await c.busy; c.busy = null; if (c.dead) dropNow(c); continue;
      }
      if (disk && total('disk') > diskBudget && (c = farthest('disk'))) { lastTierDrop(c); continue; }
      return;
    }
  }
  function lastTierDrop(c) { dropNow(c); if (adaptK && K < 256) { K *= 2; kRaises++; } }
  function drop(g) { const c = ckpt.get(g); if (!c) return; ckpt.delete(g); if (c.busy) c.dead = true; else dropNow(c); }
  function dropNow(c) { ckpt.delete(c.g); for (const x of c.insts.values()) { x.snap?.destroy?.(); x.snap = null; } if (c.file) disk?.remove(c.file); c.file = null; c.packed = null; }

  return {
    /** Render frame t: step once on playback; otherwise resume from the latest valid checkpoint (or replay from an
     *  in-point). onFrame(f) is called for every frame rendered; stop() is polled before each frame (background fill).
     *  Returns { image, from, checkpoint } ({ image: null, stopped } when stopped). */
    async render(t, { onFrame, stop } = {}) {
      const seq = seqOf(); focus = t;
      let from = replayStart(seq, t), used = null;
      if (from < t) { const c = best(seq, from, t); if (c) { try { await Promise.all([restoreFrom(seq, c, t), prefetch(seq, c.g)]); from = c.g; used = c.g; } catch (e) { console.warn('moshine: checkpoint restore failed', e); drop(c.g); for (const I of inst.values()) I.at = null; from = replayStart(seq, t); } } }
      let image = null;
      for (let f = from; f <= t; f++) {
        if (stop?.()) return { image: null, from, checkpoint: used, stopped: f };      // a background fill gives way
        image = await frame(seq, f); onFrame?.(f, image); deposit(seq, f);
      }
      return { image, from, checkpoint: used };
    },
    /** The checkpoint store: frames held, bytes, counters. */
    cache() {
      const tiers = { gpu: [], cpu: [], disk: [] }; for (const c of ckpt.values()) tiers[c.tier].push(c.g);
      for (const k of Object.keys(tiers)) tiers[k].sort((a, b) => a - b);
      return { K, budget, cpuBudget, diskBudget, frames: [...ckpt.keys()].sort((a, b) => a - b), tiers, bytes: total('gpu'), cpuBytes: total('cpu'), diskBytes: total('disk'), deposits, restores, spills, loads, kRaises };
    },
    /** Wait for the janitor (tests, shutdown). */
    settle: () => janitor,
    setK(k) { K = Math.max(1, k | 0); },
    async clearCache() { await janitor; for (const g of [...ckpt.keys()]) drop(g); },
    replayStart: (t) => replayStart(seqOf(), t),
    /** What a seek to t would cost now: { cost (frames rendered), from, g? }. */
    seekCost: (t) => seekCost(seqOf(), t),
    /**
     * The render-status bar (spec §7): spans over [from, to) — 'green' (a seek renders at most K frames: near an in-point
     * or a valid checkpoint), 'red' (a longer sequential replay), 'yellow' (stateless: always live), none where nothing
     * renders — and the checkpoint ticks { g, tier, ok }. Frames are sampled when the range is long (step).
     */
    coverage({ from = 0, to, maxSamples = 20000 } = {}) {
      const seq = seqOf(), end = to ?? Math.max(0, ...seq.channels.flatMap((c) => c.clips.map((k) => k.range.out)));
      const step = Math.max(1, Math.ceil((end - from) / maxSamples)), spans = [];
      const statefulAt = (f) => liveChannels(seq).some((ch) => ch.clips.some((k) => activeFrom(k) <= f && f < k.range.out && [...(k.stack || []), ...(ch.stack || [])].some((e) => e.enabled && isStateful(e))));
      const anyAt = (f) => liveChannels(seq).some((ch) => ch.clips.some((k) => activeFrom(k) <= f && f < k.range.out));
      for (let f = from; f < end; f += step) {
        const kind = !anyAt(f) ? null : !statefulAt(f) ? 'yellow' : seekCost(seq, f).cost <= K ? 'green' : 'red';
        const last = spans[spans.length - 1];
        if (last && last.kind === kind && last.b === f) last.b = Math.min(end, f + step); else if (kind) spans.push({ a: f, b: Math.min(end, f + step), kind });
      }
      const ticks = [...ckpt.values()].map((c) => ({ g: c.g, tier: c.tier, ok: validMemo(seq, c, c.g) })).sort((x, y) => x.g - y.g);
      return { spans, ticks, K, revision };
    },
    /** Forget every effect's state (call after any edit; the next render replays as needed). */
    invalidate() { revision++; for (const I of inst.values()) I.at = null; },
    get instances() { return inst; },
    async destroy() { await janitor; for (const g of [...ckpt.keys()]) drop(g); for (const I of inst.values()) I.obj.destroy?.(); inst.clear(); return backend.destroy?.(); },
  };
}

// ------------------------------------------------------------------------------------------------ CPU backend
const h16 = (a) => fromHalfArray(toHalfArray(a));            // every GPU store is a half float
/**
 * The CPU reference backend. sources: { [mediaId]: { w, h, frame(i) -> Float32Array } } at their base size (the CPU
 * reference does not resample; the GPU ingest's hardware filter has no exact twin).
 */
export function cpuBackend({ w, h, sources }) {
  return {
    w, h,
    black() { const a = new Float32Array(w * h * 4); for (let i = 3; i < a.length; i += 4) a[i] = 1; return a; },
    async source(clip, m, i, bw, bh) {
      const s = sources[m.id]; if (!s) throw new Error(`no source for media ${m.id}`);
      if (s.w !== bw || s.h !== bh) throw new Error(`CPU reference needs media ${m.id} at ${bw}×${bh}, has ${s.w}×${s.h}`);
      return h16(s.frame(i));
    },
    place: (src, P) => h16(placeRef(src, P)),
    mask: (key, r, P) => h16(placeRef(h16(r.data), P)),
    maskmix: (clean, moshed, mask) => h16(maskmixRef(clean, moshed, mask)),
    blend: (comp, layer, opacity, mode) => h16(blendRef(comp, layer, opacity, mode)),
    loop: (cfg) => createLoopRef({ w, h }, cfg),
    fx(block) {
      const states = [];
      return {
        reset() { states.length = 0; },
        snapshot: () => ({ states: [...states] }),
        restore(snap) { states.length = 0; states.push(...snap.states); },
        apply(img, list, ctx) {
          const out = h16(fxChain(f32All(list), img, { w, h, block, ...ctx }, states));
          for (let i = 0; i < states.length; i++) if (states[i]) states[i] = h16(states[i]);   // the GPU keeps its state as a half-float texture
          return out;
        },
      };
    },
  };
}
