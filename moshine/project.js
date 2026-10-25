// project.js — the project model (spec §4): factories, the effect registry, validation, versioned migrations,
// canonical `.mosh` JSON, and persistence (OPFS project store with autosave, .mosh files on disk).
//
// All time is integer frames at the sequence timebase (a rational {num, den}); no floating-point time in the
// model. Media clips' sourceIn is counted in sequence frames too, the evaluator maps it to source time.
// A Mosh Loop instance's params are the config.js config (minus its seed, which is the instance's own); any leaf
// may be an AnimatableValue, which params.js resolves per frame. Pure module except the store and file helpers.
import { SCHEMA, OPS, FX, defaults as loopDefaults, normalize as loopNormalize, fxDefaults } from './config.js';
import { MASK_MODES, MASK_TRANSFORM } from './masks.js';

export const SCHEMA_ID = 'moshine.project.v1';
export const FORMAT = 1;                     // bump with an entry in MIGRATIONS; the schema string changes only on a break

// ------------------------------------------------------------------------------------------------ effect registry
/** Every effect type: label, schema version, stateful (keeps state across frames), group (has in-loop children),
 *  defaults(). Params specs use config.js's shape: [min, max, step, default] | [options, default] | [bool]. */
const strip = (o, k) => { const c = { ...o }; delete c[k]; return c; };
export const EFFECTS = {
  moshLoop: { label: 'Mosh Loop', version: 1, stateful: true, group: true, defaults: () => strip(loopDefaults(), 'seed') },
  ...Object.fromEntries(Object.entries(FX).map(([k, f]) => [k, { label: f.label, version: 1, stateful: !!f.stateful, params: f.params, defaults: () => strip(fxDefaults(k), 'fx') }])),
};

/** Transform & Blend, intrinsic on media clips (§11.1). x, y in sequence widths/heights from the centre. */
export const TRANSFORM = {
  x: [-2, 2, 0.001, 0], y: [-2, 2, 0.001, 0], scale: [0.01, 8, 0.01, 1], rotation: [-360, 360, 0.1, 0], opacity: [0, 1, 0.01, 1],
  blend: [['normal', 'add', 'multiply', 'screen', 'difference'], 'normal'], fit: [['fit', 'fill', 'stretch', 'none'], 'fit'],
};
const defaultOf = (d) => (d.length === 4 ? d[3] : d.length === 2 ? d[1] : d[0]);
export const transformDefaults = () => Object.fromEntries(Object.entries(TRANSFORM).map(([k, d]) => [k, defaultOf(d)]));

// ------------------------------------------------------------------------------------------------ ids and time
/** Random id, 10 hex chars after the prefix. Uniqueness inside a project is checked by validate(). */
export function newId(prefix = '') {
  const b = crypto.getRandomValues(new Uint8Array(5));
  return prefix + [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const RATES = [[24000, 1001], [30000, 1001], [60000, 1001], [120000, 1001]];
/** A measured frame rate as a rational: NTSC rates snap to n/1001, near-integers to n/1, else millis/1000. */
export function toRational(fps) {
  for (const [num, den] of RATES) if (Math.abs(fps - num / den) < 0.002) return { num, den };
  if (Math.abs(fps - Math.round(fps)) < 0.002) return { num: Math.round(fps), den: 1 };
  return { num: Math.round(fps * 1000), den: 1000 };
}
export const fpsOf = (tb) => tb.num / tb.den;
export const frameToSeconds = (f, tb) => (f * tb.den) / tb.num;
export const secondsToFrame = (s, tb) => Math.round((s * tb.num) / tb.den);
/** End of a sequence: its stored duration or the last clip out, whichever is later. */
export const sequenceEnd = (seq) => Math.max(seq.durationFrames, ...seq.channels.flatMap((c) => c.clips.map((k) => k.range.out)));

// ------------------------------------------------------------------------------------------------ factories
export const CHANNEL_CLIP = { video: 'media', effect: 'effect', audio: 'audio' };

export function createEffect(type, { params = {}, seed = 1, enabled = true, id = newId('e') } = {}) {
  const T = EFFECTS[type]; if (!T) throw new Error(`unknown effect type ${type}`);
  const p = type === 'moshLoop' ? strip(loopNormalize({ ...params }), 'seed') : { ...T.defaults(), ...params };
  return { id, type, version: T.version, enabled, seed, params: p };
}

export function createChannel(kind, name, { id = newId('ch') } = {}) {
  if (!CHANNEL_CLIP[kind]) throw new Error(`unknown channel kind ${kind}`);
  return { id, name, kind, locked: false, bypassed: false, solo: false, clips: [], stack: [] };
}

export function createMediaClip(mediaId, range, { sourceIn = 0, hold = false, id = newId('c'), stack = [], transform = transformDefaults() } = {}) {
  return { id, kind: 'media', range: { ...range }, mediaId, sourceIn, hold, transform, stack };
}
export function createEffectClip(range, { stack = [createEffect('moshLoop')], reset = 'atIn', warmup = 0, id = newId('c') } = {}) {
  return { id, kind: 'effect', range: { ...range }, stack, reset, warmup };
}
export function createAudioClip(mediaId, range, { sourceIn = 0, gain = 1, id = newId('c') } = {}) {
  return { id, kind: 'audio', range: { ...range }, mediaId, sourceIn, gain: { value: gain } };
}
export function createMarker(frame, { color = 'yellow', note = '', hit = false, id = newId('m') } = {}) {
  return { id, frame, color, note, hit };     // hit: a mosh hit (H), a trigger source (step 4)
}

export function createSequence({ name = 'Sequence 1', timebase = { num: 30, den: 1 }, width = 1920, height = 1080, id = newId('s') } = {}) {
  return { id, name, timebase: { ...timebase }, width, height, durationFrames: 0,
    channels: [createChannel('video', 'V1'), createChannel('effect', 'FX1'), createChannel('audio', 'A1')], markers: [] };
}

export function createProject({ name = 'Untitled', seed = 1, now = new Date().toISOString(), ...seqOpts } = {}) {
  const seq = createSequence(seqOpts);
  return { schema: SCHEMA_ID, format: FORMAT, id: newId('p'), name, created: now, modified: now, seed, media: [], sequences: [seq], activeSequence: seq.id, ui: {} };
}

/** A MediaRef from a media-library entry (media.js openLibrary; info from openVideo().info()). */
export function mediaFromLibrary(entry, { id = newId('m') } = {}) {
  const i = entry.info || {};
  if (i.kind === 'image') return { id, name: entry.name, hash: entry.id, kind: 'image', width: i.w | 0, height: i.h | 0, hasAudio: false, storage: 'opfs' };   // a still: every frame is the picture
  return { id, name: entry.name, hash: entry.id, kind: 'video', width: i.w | 0, height: i.h | 0,
    ...(i.rate ? { fps: { num: i.rate.num, den: i.rate.den } } : i.fps ? { fps: toRational(i.fps) } : {}), ...(i.frames ? { durationFrames: i.frames } : {}), hasAudio: !!i.audio, storage: 'opfs' };
}

/** A one-clip project from a Mosh Loop config (a Mosh ID or a preset): media clip on V1, the loop on FX1 over the
 *  same range. The timeline export of this project must equal the M4 single-clip export (harness, step 7). */
export function fromConfig(cfg, { media, frames = media?.durationFrames || 1, name = media?.name || 'Untitled', ...seqOpts } = {}) {
  const tb = seqOpts.timebase || media?.fps || { num: 30, den: 1 };
  const p = createProject({ name, width: media?.width || 1920, height: media?.height || 1080, ...seqOpts, timebase: tb });
  const seq = p.sequences[0], range = { in: 0, out: frames };
  if (media) { p.media.push(media); seq.channels[0].clips.push(createMediaClip(media.id, range)); }
  const { seed = 1, ...params } = loopNormalize(cfg);
  seq.channels[1].clips.push(createEffectClip(range, { stack: [createEffect('moshLoop', { params, seed })] }));
  seq.durationFrames = frames;
  return p;
}

// ------------------------------------------------------------------------------------------------ validation
const INTERP = ['hold', 'linear', 'easeIn', 'easeOut', 'easeInOut', 'bezier'];
const MOD_TYPES = ['lfo', 'noise', 'randomHold', 'audio', 'macro', 'expr', 'trigger'];
const MOD_MODES = ['add', 'multiply', 'replace'];
const isInt = (x) => Number.isInteger(x);
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isAnim = (v) => isObj(v) && ('value' in v || 'keys' in v);

/**
 * Check a project against the model. Returns a list of { path, msg } (empty when valid). Rules: unique ids;
 * integer frames; ranges in < out; clips sorted and not overlapping in a channel; clip kind matches the channel;
 * references (media, input channels, active sequence) resolve; keyframes sorted with unique frames; effect params
 * typed by their schema (ranges are UI hints and are not enforced).
 */
export function validate(p) {
  const errs = [], E = (path, msg) => errs.push({ path, msg }), ids = new Map();
  const uid = (id, path) => { if (typeof id !== 'string' || !id) E(path, 'missing id'); else if (ids.has(id)) E(path, `duplicate id ${id} (also ${ids.get(id)})`); else ids.set(id, path); };
  const range = (r, path) => { if (!isObj(r) || !isInt(r.in) || !isInt(r.out) || r.in < 0 || r.out <= r.in) E(path, `bad range ${JSON.stringify(r)}`); };

  if (!isObj(p)) return [{ path: '', msg: 'not an object' }];
  if (p.schema !== SCHEMA_ID) E('schema', `expected ${SCHEMA_ID}`);
  if (p.format !== FORMAT) E('format', `expected ${FORMAT}`);
  uid(p.id, 'id');
  if (!isInt(p.seed)) E('seed', 'not an integer');
  for (const k of ['name', 'created', 'modified']) if (typeof p[k] !== 'string') E(k, 'not a string');
  if (!Array.isArray(p.media) || !Array.isArray(p.sequences)) { E('', 'media and sequences must be arrays'); return errs; }

  const media = new Map();
  p.media.forEach((m, i) => {
    const at = `media[${i}]`; uid(m.id, at); media.set(m.id, m);
    if (typeof m.hash !== 'string' || !m.hash) E(at, 'missing hash');
    if (!['video', 'image', 'audio'].includes(m.kind)) E(at, `bad kind ${m.kind}`);
    if (!['opfs', 'handle', 'url'].includes(m.storage)) E(at, `bad storage ${m.storage}`);
    if (m.fps && !(isInt(m.fps.num) && isInt(m.fps.den) && m.fps.num > 0 && m.fps.den > 0)) E(at + '.fps', 'bad rational');
    if (m.durationFrames != null && !(isInt(m.durationFrames) && m.durationFrames > 0)) E(at + '.durationFrames', 'not a positive integer');
  });
  if (p.presets !== undefined) {
    if (!Array.isArray(p.presets)) E('presets', 'not an array');
    else p.presets.forEach((x, i) => {
      const at = `presets[${i}]`; uid(x.id, at);
      if (typeof x.name !== 'string' || !x.name) E(at + '.name', 'missing');
      if (!Array.isArray(x.stack)) E(at + '.stack', 'not an array');
      else x.stack.forEach((e, j) => effect(e, `${at}.stack[${j}]`, { media, chIds: new Set(), seqIds: new Set() }));
    });
  }
  const seqIds = new Set(p.sequences.map((s) => s.id));
  if (!seqIds.has(p.activeSequence)) E('activeSequence', `no sequence ${p.activeSequence}`);

  p.sequences.forEach((s, si) => {
    const at = `sequences[${si}]`;
    if (!isObj(s) || !Array.isArray(s.channels) || !s.channels.every((c) => isObj(c) && Array.isArray(c.clips))) { E(at, 'channels and clips must be arrays'); return; }
    uid(s.id, at);
    const tb = s.timebase; if (!isObj(tb) || !isInt(tb.num) || !isInt(tb.den) || tb.num <= 0 || tb.den <= 0) E(at + '.timebase', 'bad rational');
    if (!isInt(s.width) || !isInt(s.height) || s.width <= 0 || s.height <= 0) E(at, 'bad size');
    if (!isInt(s.durationFrames) || s.durationFrames < 0) E(at + '.durationFrames', 'not a non-negative integer');
    if (s.exportRange) range(s.exportRange, at + '.exportRange');
    (s.markers || []).forEach((m, i) => {
      const mat = `${at}.markers[${i}]`; uid(m.id, mat);
      if (!isInt(m.frame) || m.frame < 0) E(mat, 'bad frame');
      if (typeof m.hit !== 'boolean') E(mat + '.hit', 'not a boolean');
      if (m.hold != null && !(isInt(m.hold) && m.hold > 0)) E(mat + '.hold', 'not a positive integer');
    });
    const chIds = new Set(s.channels.map((c) => c.id)), ref = { media, chIds, seqIds };
    s.channels.forEach((c, ci) => {
      const cat = `${at}.channels[${ci}]`; uid(c.id, cat);
      if (!CHANNEL_CLIP[c.kind]) { E(cat, `bad kind ${c.kind}`); return; }
      for (const f of ['locked', 'bypassed', 'solo']) if (typeof c[f] !== 'boolean') E(`${cat}.${f}`, 'not a boolean');
      (c.stack || []).forEach((e, i) => effect(e, `${cat}.stack[${i}]`, ref));
      let prevOut = -1;
      c.clips.forEach((k, ki) => {
        const kat = `${cat}.clips[${ki}]`; uid(k.id, kat); range(k.range, kat + '.range');
        if (k.kind !== CHANNEL_CLIP[c.kind]) E(kat, `${k.kind} clip on a ${c.kind} channel`);
        if (k.range && k.range.in < prevOut) E(kat, 'overlaps or is out of order'); prevOut = k.range?.out ?? prevOut;
        if (k.kind === 'media' || k.kind === 'audio') {
          if (!media.has(k.mediaId)) E(kat, `no media ${k.mediaId}`);
          if (!isInt(k.sourceIn) || k.sourceIn < 0) E(kat + '.sourceIn', 'not a non-negative integer');
        }
        if (k.kind === 'media') { params(k.transform, TRANSFORM, kat + '.transform'); if (typeof k.hold !== 'boolean') E(kat + '.hold', 'not a boolean'); }
        if (k.kind === 'audio') {
          anim(k.gain, 'number', kat + '.gain');
          if (k.stretch !== undefined) {                                   // M7: { at, len, span } clip-local frames, sorted, not overlapping
            if (!Array.isArray(k.stretch)) E(kat + '.stretch', 'not an array');
            else { let end = 0; k.stretch.forEach((x, j) => { if (!(isInt(x.at) && isInt(x.len) && isInt(x.span) && x.at >= end && x.len > 0 && x.span > 0)) E(`${kat}.stretch[${j}]`, 'segments need integer at >= the previous end, len > 0, span > 0'); end = x.at + x.span + x.len; }); }
          }
        }
        if (k.kind === 'effect') {
          if (k.masks !== undefined) mask(k.masks, kat + '.masks');
          if (!['atIn', 'continue'].includes(k.reset)) E(kat + '.reset', `bad reset ${k.reset}`);
          if (!isInt(k.warmup) || k.warmup < 0) E(kat + '.warmup', 'not a non-negative integer');
        }
        if (k.kind !== 'audio') (k.stack || []).forEach((e, i) => effect(e, `${kat}.stack[${i}]`, ref));
      });
    });
  });
  return errs;

  function mask(list, at) {
    if (!Array.isArray(list)) { E(at, 'not an array'); return; }
    list.forEach((m, i) => {
      const mat = `${at}[${i}]`; uid(m.id, mat);
      if (!MASK_MODES.includes(m.mode)) E(mat + '.mode', `bad mode ${m.mode}`);
      if (typeof m.invert !== 'boolean' || typeof m.enabled !== 'boolean') E(mat, 'invert and enabled must be booleans');
      if (!(typeof m.feather === 'number' && m.feather >= 0)) E(mat + '.feather', 'not a non-negative number');
      for (const [k, d] of Object.entries(MASK_TRANSFORM)) anim(m[k], 'number', `${mat}.${k}`);
      if (!Array.isArray(m.shapes)) { E(mat + '.shapes', 'not an array'); return; }
      m.shapes.forEach((sh, j) => {
        const sat = `${mat}.shapes[${j}]`, nums = (keys) => keys.every((k) => Number.isFinite(sh[k]));
        if (sh.type === 'stroke') { if (!(Array.isArray(sh.pts) && sh.pts.length >= 2 && sh.pts.length % 2 === 0 && sh.pts.every(Number.isFinite) && sh.r > 0)) E(sat, 'a stroke needs pts [x, y, ...] and r > 0'); }
        else if (sh.type === 'ellipse') { if (!(nums(['cx', 'cy', 'rx', 'ry']) && sh.rx > 0 && sh.ry > 0)) E(sat, 'bad ellipse'); }
        else if (sh.type === 'rect') { if (!(nums(['x', 'y', 'w', 'h']) && sh.w > 0 && sh.h > 0)) E(sat, 'bad rect'); }
        else E(sat, `bad shape ${sh.type}`);
      });
    });
  }
  function effect(e, at, ref) {
    uid(e.id, at);
    const T = EFFECTS[e.type]; if (!T) { E(at, `unknown effect type ${e.type}`); return; }
    if (e.version !== T.version) E(at + '.version', `expected ${T.version} after migration`);
    if (typeof e.enabled !== 'boolean') E(at + '.enabled', 'not a boolean');
    if (!isInt(e.seed)) E(at + '.seed', 'not an integer');
    if (!isObj(e.params)) { E(at + '.params', 'not an object'); return; }
    if (e.type === 'moshLoop') loop(e.params, at + '.params'); else params(e.params, T.params, at + '.params');
    for (const [k, r] of Object.entries(e.inputs || {})) {
      const ok = r.channel ? ref.chIds.has(r.channel) : r.media ? ref.media.has(r.media) : r.sequence ? ref.seqIds.has(r.sequence) : false;
      if (!ok) E(`${at}.inputs.${k}`, `unresolved ${JSON.stringify(r)}`);
    }
    (e.children || []).forEach((c, i) => effect(c, `${at}.children[${i}]`, ref));
  }
  function loop(cfg, at) {
    if (!isInt(cfg.block) || cfg.block < 4) E(at + '.block', 'bad block size');
    for (const [k, s] of Object.entries(SCHEMA)) { if (!isObj(cfg[k])) E(`${at}.${k}`, 'missing stage'); else params(cfg[k], s.params, `${at}.${k}`, k === 'bloom' ? ['hits'] : []); }
    if (!Array.isArray(cfg.bloom?.hits) || !cfg.bloom.hits.every(isInt)) E(at + '.bloom.hits', 'not an integer list');
    (cfg.ops || []).forEach((o, i) => (OPS[o.op] ? params(o, OPS[o.op].params, `${at}.ops[${i}]`, o.op === 'paint' ? ['op', 'strokes'] : ['op']) : E(`${at}.ops[${i}]`, `unknown op ${o.op}`)));
    (cfg.ops || []).forEach((o, i) => { if (o.op === 'paint' && !(Array.isArray(o.strokes ?? []) && (o.strokes ?? []).every((s) => Array.isArray(s.pts) && s.pts.length >= 2 && s.pts.length % 2 === 0 && s.pts.every(Number.isFinite) && s.r > 0 && Number.isFinite(s.s ?? 0)))) E(`${at}.ops[${i}].strokes`, 'strokes need pts [u, v, ...], r > 0 and a push s'); });
    for (const list of ['inLoop', 'post']) (cfg[list] || []).forEach((o, i) => (FX[o.fx] ? params(o, FX[o.fx].params, `${at}.${list}[${i}]`, ['fx']) : E(`${at}.${list}[${i}]`, `unknown effect ${o.fx}`)));
  }
  function params(obj, spec, at, extra = []) {
    if (!isObj(obj)) { E(at, 'not an object'); return; }
    for (const k of Object.keys(obj)) if (!spec[k] && !extra.includes(k)) E(`${at}.${k}`, 'unknown parameter');
    for (const [k, d] of Object.entries(spec)) {
      if (!(k in obj)) { E(`${at}.${k}`, 'missing'); continue; }
      anim(obj[k], d.length === 4 ? 'number' : d.length === 1 ? 'boolean' : d[0], `${at}.${k}`);
    }
  }
  function leaf(v, kind, at) {
    const ok = kind === 'number' ? typeof v === 'number' && Number.isFinite(v) : kind === 'boolean' ? typeof v === 'boolean' : kind.includes(v);
    if (!ok) E(at, `bad value ${JSON.stringify(v)}${Array.isArray(kind) ? ` (one of ${kind.join(', ')})` : ` (${kind})`}`);
  }
  function anim(v, kind, at) {
    if (!isAnim(v)) return leaf(v, kind, at);
    if ('value' in v) leaf(v.value, kind, at + '.value');
    if (v.keys) {
      if (!Array.isArray(v.keys) || !v.keys.length) E(at + '.keys', 'empty');
      else v.keys.forEach((k, i) => {
        if (!isInt(k.frame) || (i && k.frame <= v.keys[i - 1].frame)) E(`${at}.keys[${i}]`, 'frames must be integers, increasing');
        if (!INTERP.includes(k.interp)) E(`${at}.keys[${i}].interp`, `bad interp ${k.interp}`);
        leaf(k.value, kind, `${at}.keys[${i}].value`);
      });
    }
    (v.mods || []).forEach((m, i) => {
      if (!MOD_TYPES.includes(m.type) || !MOD_MODES.includes(m.mode) || typeof m.depth !== 'number' || !Number.isFinite(m.depth)) E(`${at}.mods[${i}]`, 'bad modulator');
      if (m.clamp && !(Array.isArray(m.clamp) && m.clamp.length === 2 && m.clamp.every(Number.isFinite) && m.clamp[0] <= m.clamp[1])) E(`${at}.mods[${i}].clamp`, 'not [lo, hi]');
      if (!isObj(m.params || {}) || !Object.values(m.params || {}).every((x) => typeof x === 'string' || Number.isFinite(x) || (Array.isArray(x) && x.every(Number.isFinite)))) E(`${at}.mods[${i}].params`, 'values must be numbers, strings or number lists');
      if (kind !== 'number') E(`${at}.mods[${i}]`, 'modulators need a numeric parameter');
    });
  }
}

export class ProjectError extends Error {
  constructor(msg, errors = []) { super(errors.length ? `${msg}: ${errors.slice(0, 5).map((e) => `${e.path} ${e.msg}`).join('; ')}${errors.length > 5 ? ` (+${errors.length - 5})` : ''}` : msg); this.errors = errors; }
}
export function assertValid(p) { const e = validate(p); if (e.length) throw new ProjectError('invalid project', e); return p; }

// ------------------------------------------------------------------------------------------------ migrations
/**
 * MIGRATIONS[n] upgrades a project document from format n to n + 1 (in place or by returning a new one).
 * EFFECT_MIGRATIONS[type][n] upgrades one effect instance's params from version n to n + 1. Both are explicit,
 * ordered, and run before normalize(); a document from a newer MOSHINE is refused rather than guessed at.
 */
export const MIGRATIONS = {};
export const EFFECT_MIGRATIONS = {};

export function migrate(doc, { migrations = MIGRATIONS, effectMigrations = EFFECT_MIGRATIONS, format = FORMAT, effects = EFFECTS } = {}) {
  if (!isObj(doc) || typeof doc.schema !== 'string' || !doc.schema.startsWith('moshine.project.')) throw new ProjectError('not a MOSHINE project');
  if (doc.schema !== SCHEMA_ID) throw new ProjectError(`unsupported schema ${doc.schema}`);
  let d = doc, f = d.format ?? 1;
  if (!isInt(f) || f > format) throw new ProjectError(`made by a newer MOSHINE (format ${f}, this one reads ${format})`);
  for (; f < format; f++) {
    if (!migrations[f]) throw new ProjectError(`no migration from format ${f}`);
    d = migrations[f](d) || d; d.format = f + 1;
  }
  d.format = format;
  const up = (e) => {
    const T = effects[e.type], m = effectMigrations[e.type] || {};
    if (T) {
      let v = e.version ?? 1;
      if (v > T.version) throw new ProjectError(`effect ${e.type} v${v} is newer than this MOSHINE (v${T.version})`);
      for (; v < T.version; v++) { if (!m[v]) throw new ProjectError(`no migration for ${e.type} from v${v}`); e.params = m[v](e.params) || e.params; }
      e.version = T.version;
    }
    (e.children || []).forEach(up);
  };
  forEachEffect(d, up);
  return d;
}

/** Visit every effect instance in a project (clip stacks, channel stacks, preset stacks; not their children). */
export function forEachEffect(p, fn) {
  for (const x of Array.isArray(p.presets) ? p.presets : []) (Array.isArray(x?.stack) ? x.stack : []).forEach(fn);
  const arr = (x) => (Array.isArray(x) ? x : []);
  for (const s of arr(p.sequences)) for (const c of arr(s?.channels)) {
    arr(c?.stack).forEach(fn);
    for (const k of arr(c?.clips)) arr(k?.stack).forEach(fn);
  }
}

// ------------------------------------------------------------------------------------------------ normalize
/** Fill optional fields and missing params from the defaults (a file written by an older build of the same
 *  format still loads). Never changes a value that is present. Returns the same object. */
export function normalize(p) {
  p.ui ??= {};
  for (const s of Array.isArray(p.sequences) ? p.sequences : []) {
    if (!isObj(s)) continue;
    s.markers ??= [];
    for (const c of Array.isArray(s.channels) ? s.channels : []) {
      for (const f of ['locked', 'bypassed', 'solo']) c[f] ??= false;
      c.stack ??= [];
      for (const k of Array.isArray(c.clips) ? c.clips : []) {
        if (k.kind === 'media') { k.hold ??= false; k.stack ??= []; k.transform = { ...transformDefaults(), ...(k.transform || {}) }; }
        if (k.kind === 'effect') { k.stack ??= []; k.reset ??= 'atIn'; k.warmup ??= 0; }
        if (k.kind === 'audio') k.gain ??= { value: 1 };
      }
    }
    if (Array.isArray(s.markers)) for (const m of s.markers) { m.color ??= 'yellow'; m.note ??= ''; m.hit ??= false; }
  }
  const fill = (e) => {
    e.enabled ??= true; e.seed ??= 1;
    const T = EFFECTS[e.type];
    if (T) e.params = e.type === 'moshLoop' ? strip(loopNormalize(e.params || {}), 'seed') : { ...T.defaults(), ...(e.params || {}) };
    (e.children || []).forEach(fill);
  };
  forEachEffect(p, fill);
  return p;
}

// ------------------------------------------------------------------------------------------------ .mosh text
/** Canonical JSON: object keys sorted, arrays in order, one-space indent. Equal projects give equal bytes, so
 *  diffs stay small and undo tests can compare text. */
export function stringify(p, indent = 1) {
  const sort = (v) => (Array.isArray(v) ? v.map(sort) : isObj(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v);
  return JSON.stringify(sort(p), null, indent);
}

/** Parse .mosh text (or an already parsed object): migrate, normalize, validate. Throws ProjectError. */
export function load(src, opts) {
  let doc; try { doc = typeof src === 'string' ? JSON.parse(src) : structuredClone(src); } catch (e) { throw new ProjectError(`not JSON: ${e.message}`); }
  return assertValid(normalize(migrate(doc, opts)));
}

/** Project -> .mosh text with `modified` stamped in the text (the project object is not touched, so saving never
 *  shows up as a change). now: null keeps the stored time. */
export function save(p, { now = new Date().toISOString() } = {}) {
  assertValid(p);
  return stringify(now ? { ...p, modified: now } : p);
}

// ------------------------------------------------------------------------------------------------ Mosh ID
// A project in the URL hash (D15): the canonical JSON without UI state, deflated, base64url, prefixed with 'P1.'. It
// carries media by content hash, not bytes: the receiver needs the same files in its library (or the demo fixture).
// Same ID, same pixels (D12).
const b64u = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
export async function toMoshID(p) {
  assertValid(p);
  return 'P1.' + b64u(await pipe(new TextEncoder().encode(stringify({ ...p, ui: {} }, 0)), new CompressionStream('deflate-raw')));
}
export async function fromMoshID(id) {
  if (!/^P1\./.test(id)) throw new ProjectError('not a project Mosh ID');
  let text; try { text = new TextDecoder().decode(await pipe(unb64u(id.slice(3)), new DecompressionStream('deflate-raw'))); } catch (e) { throw new ProjectError('damaged Mosh ID'); }
  return load(text);
}

// ------------------------------------------------------------------------------------------------ persistence
/** OPFS project store ('moshine-projects/<id>.mosh' + index.json of { id, name, modified }), like the media
 *  library. createWritable commits on close, so a crash mid-write leaves the previous file intact. */
export async function openProjectStore(dirName = 'moshine-projects') {
  const root = await navigator.storage.getDirectory(), dir = await root.getDirectoryHandle(dirName, { create: true });
  const readText = async (name) => (await (await dir.getFileHandle(name)).getFile()).text();
  const writeText = async (name, text) => { const w = await (await dir.getFileHandle(name, { create: true })).createWritable(); await w.write(text); await w.close(); };
  let index; try { index = JSON.parse(await readText('index.json')); } catch (e) { index = []; }
  const writeIndex = () => writeText('index.json', JSON.stringify(index, null, 1));
  return {
    /** Newest first. */
    list: () => [...index].sort((a, b) => (a.modified < b.modified ? 1 : -1)),
    async load(id) { return load(await readText(`${id}.mosh`)); },
    async saveText(p, text, modified = new Date().toISOString()) {
      await writeText(`${p.id}.mosh`, text);
      const e = { id: p.id, name: p.name, modified }, i = index.findIndex((x) => x.id === p.id);
      if (i < 0) index.push(e); else index[i] = e;
      await writeIndex();
    },
    async save(p) { const now = new Date().toISOString(); await this.saveText(p, save(p, { now }), now); },
    async remove(id) { await dir.removeEntry(`${id}.mosh`).catch(() => {}); index = index.filter((x) => x.id !== id); await writeIndex(); },
  };
}

/**
 * Debounced autosave. touch(project) after every change; the save runs `delay` ms after the last touch, with the
 * text taken at that moment. Saves never overlap: a touch during a save queues one more. flush() saves now.
 * write(project, text) does the I/O (store.saveText). timers are injectable for tests.
 */
export function createAutosave(write, { delay = 1500, timers = globalThis, onError = (e) => console.warn('moshine: autosave failed', e) } = {}) {
  let timer = null, latest = null, running = null, again = false, saves = 0;
  const run = async () => {
    timer = null;
    if (running) { again = true; return; }
    if (!latest) return;
    const p = latest; latest = null;
    running = Promise.resolve().then(() => write(p, save(p))).then(() => { saves++; }, onError);
    await running; running = null;
    if (again) { again = false; await run(); }
  };
  return {
    touch(p) { latest = p; if (timer) timers.clearTimeout(timer); timer = timers.setTimeout(run, delay); },
    async flush() { if (timer) { timers.clearTimeout(timer); timer = null; } while (running) await running; await run(); },
    cancel() { if (timer) timers.clearTimeout(timer); timer = null; latest = null; },
    get pending() { return !!(timer || running || latest); },
    get saves() { return saves; },
  };
}

/** Save .mosh to disk: the save picker where it exists, else a download. */
export async function saveFile(p, name = `${(p.name || 'untitled').replace(/[^\w .-]+/g, '_')}.mosh`) {
  const text = save(p);
  if (window.showSaveFilePicker) {
    let fh; try { fh = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'MOSHINE project', accept: { 'application/json': ['.mosh'] } }] }); } catch (e) { if (e.name === 'AbortError') return null; throw e; }
    const w = await fh.createWritable(); await w.write(text); await w.close(); return fh.name;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return name;
}
/** Read a .mosh File. */
export const readFile = async (file) => load(await file.text());
