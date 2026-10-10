// timeline.js — the command bus (spec §11.1): every edit to a project is a named command, recorded as primitive
// operations (set a key, insert into an array, remove from an array) so undo replays them backwards and redo
// forwards. Commands never mutate the project any other way, so undo restores it byte for byte (stringify).
// Also: selection, snapping, copy/paste. Pure module, no DOM.
//
// Time: clip ranges, markers and command arguments are sequence frames. Keyframes on a clip's parameters (its
// transform, gain and stack) are clip-relative (frame 0 = the clip's in-point), so moving a clip carries its
// animation; trimming the in-point or splitting shifts them so they stay where they were in sequence time.
// Channel-stack keyframes are sequence frames. bloom.hits inside a Mosh Loop are clip-relative like keyframes.
import { CHANNEL_CLIP, EFFECTS, createEffect, createChannel, createMediaClip, createEffectClip, createMarker, newId, validate, ProjectError } from './project.js';
import { PRESETS, opDefaults } from './config.js';
import { createMask } from './masks.js';
import { audioCut, insideStretch } from './audio.js';
import { resolve } from './params.js';

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const isAnim = (v) => isObj(v) && ('value' in v || 'keys' in v);
const clone = (v) => (v === undefined ? v : structuredClone(v));
const fail = (msg) => { throw new ProjectError(msg); };

// ------------------------------------------------------------------------------------------------ primitive ops
function createTx() {
  const ops = [];
  return {
    ops,
    set(o, k, v) {
      ops.push({ t: 's', o, k, had: Object.prototype.hasOwnProperty.call(o, k), b: o[k], a: v });
      if (v === undefined) delete o[k]; else o[k] = v;
    },
    insert(a, i, v) { ops.push({ t: 'i', a, i, v }); a.splice(i, 0, v); },
    remove(a, i) { const v = a[i]; ops.push({ t: 'r', a, i, v }); a.splice(i, 1); return v; },
  };
}
function revert(ops) {
  for (let j = ops.length - 1; j >= 0; j--) {
    const op = ops[j];
    if (op.t === 's') { if (op.had) op.o[op.k] = op.b; else delete op.o[op.k]; }
    else if (op.t === 'i') op.a.splice(op.i, 1);
    else op.a.splice(op.i, 0, op.v);
  }
}
function replay(ops) {
  for (const op of ops) {
    if (op.t === 's') { if (op.a === undefined) delete op.o[op.k]; else op.o[op.k] = op.a; }
    else if (op.t === 'i') op.a.splice(op.i, 0, op.v);
    else op.a.splice(op.i, 1);
  }
}
/** Writes straight through, for objects not yet in the project (a clone about to be inserted). */
const direct = { set(o, k, v) { if (v === undefined) delete o[k]; else o[k] = v; }, insert(a, i, v) { a.splice(i, 0, v); }, remove(a, i) { return a.splice(i, 1)[0]; } };

// ------------------------------------------------------------------------------------------------ lookup
/** Index every addressable object by id: project, media, sequences, channels, clips, effects, markers. */
export function indexProject(p) {
  const m = new Map();
  m.set(p.id, { kind: 'project', obj: p });
  for (const x of p.media) m.set(x.id, { kind: 'media', obj: x, list: p.media });
  for (const x of p.presets || []) m.set(x.id, { kind: 'preset', obj: x, list: p.presets });
  for (const seq of p.sequences) {
    m.set(seq.id, { kind: 'sequence', obj: seq, list: p.sequences });
    for (const mk of seq.markers) m.set(mk.id, { kind: 'marker', obj: mk, list: seq.markers, seq });
    for (const ch of seq.channels) {
      m.set(ch.id, { kind: 'channel', obj: ch, list: seq.channels, seq });
      const fx = (list, clip) => { for (const e of list || []) { m.set(e.id, { kind: 'effect', obj: e, list, seq, ch, clip }); fx(e.children, clip); } };
      fx(ch.stack, null);
      for (const k of ch.clips) { m.set(k.id, { kind: 'clip', obj: k, list: ch.clips, seq, ch }); fx(k.stack, k); for (const q of k.masks || []) m.set(q.id, { kind: 'mask', obj: q, list: k.masks, seq, ch, clip: k }); }
    }
  }
  return m;
}

// ------------------------------------------------------------------------------------------------ clip helpers
const len = (k) => k.range.out - k.range.in;
const hasSource = (k) => k.kind === 'media' || k.kind === 'audio';

/** Visit every animatable with keys and every Mosh Loop bloom.hits list inside a clip (its transform, gain and
 *  stack): fn(container, key, value). */
function eachTimed(k, fn) {
  const visit = (o, key) => {
    const v = o[key];
    if (isAnim(v)) { if (v.keys) fn(o, key, v); }
    else if (key === 'hits' && Array.isArray(v)) fn(o, key, v);
    else if (Array.isArray(v)) v.forEach((_, i) => visit(v, i));
    else if (isObj(v)) for (const kk of Object.keys(v)) visit(v, kk);
  };
  for (const key of ['transform', 'gain', 'stack', 'masks']) if (key in k) visit(k, key);
}
/** Shift a clip's clip-relative times by d frames (fresh objects, so undo keeps the old ones). */
function shiftTimes(tx, k, d) {
  if (d) eachTimed(k, (o, key, v) => tx.set(o, key, Array.isArray(v) ? v.map((h) => h + d) : { ...v, keys: v.keys.map((x) => ({ ...x, frame: x.frame + d })) }));
}
/** Deep copy with fresh ids for the clip and every effect in it. */
function cloneClip(k) {
  const c = clone(k); c.id = newId('c');
  const re = (list) => { for (const e of list || []) { e.id = newId('e'); re(e.children); } };
  re(c.stack); for (const q of c.masks || []) q.id = newId('mk'); return c;
}
/** The part of clip k from frame `at` on, as a new clip (not inserted). */
function rightPart(k, at) {
  const r = cloneClip(k), d = at - k.range.in;
  r.range = { in: at, out: k.range.out };
  if (k.stretch?.length) {                                             // M7: time-stretched audio (audio.js)
    if (insideStretch(k, d)) fail('cannot cut inside a time-stretched span of audio (cut before or after it)');
    const c = audioCut(k, d); r.sourceIn = c.sourceIn; r.stretch = c.stretch; if (!r.stretch.length) delete r.stretch;
  } else if (hasSource(r) && !r.hold) r.sourceIn += d;
  shiftTimes(direct, r, -d);
  return r;
}
/** End a clip at sequence frame f, dropping stretch segments that would start at or after it. */
function cutOut(tx, k, f) {
  tx.set(k.range, 'out', f);
  if (k.stretch?.length) { const keep = k.stretch.filter((s) => s.at < f - k.range.in); tx.set(k, 'stretch', keep.length ? keep : undefined); }
}
/** Move a clip's in-point (non-ripple): source offset and clip-relative times follow so content stays put. */
function setIn(tx, k, at) {
  const d = at - k.range.in; if (!d) return;
  if (k.stretch?.length && d > 0) {                                    // M7: stretch segments move with the in-point
    if (insideStretch(k, d)) fail('cannot trim inside a time-stretched span of audio');
    const c = audioCut(k, d); tx.set(k.range, 'in', at); tx.set(k, 'sourceIn', c.sourceIn); tx.set(k, 'stretch', c.stretch.length ? c.stretch : undefined); shiftTimes(tx, k, -d); return;
  }
  if (k.stretch?.length) tx.set(k, 'stretch', k.stretch.map((s) => ({ ...s, at: s.at - d })));
  tx.set(k.range, 'in', at);
  if (hasSource(k) && !k.hold) tx.set(k, 'sourceIn', k.sourceIn + d);
  shiftTimes(tx, k, -d);
}
function insertSorted(tx, ch, k) {
  let i = ch.clips.findIndex((c) => c.range.in >= k.range.in); if (i < 0) i = ch.clips.length;
  tx.insert(ch.clips, i, k);
}
/** Overwrite: clear [from, to) on a channel, trimming, splitting or removing what is there. */
function clearRange(tx, ch, from, to) {
  for (let i = ch.clips.length - 1; i >= 0; i--) {
    const k = ch.clips[i], { in: a, out: b } = k.range;
    if (b <= from || a >= to) continue;
    if (a >= from && b <= to) tx.remove(ch.clips, i);
    else if (a < from && b > to) { const r = rightPart(k, to); cutOut(tx, k, from); tx.insert(ch.clips, i + 1, r); }
    else if (a < from) cutOut(tx, k, from);
    else setIn(tx, k, to);
  }
}
/** Keep durationFrames equal to the last clip's out-point. */
function fitDuration(tx, seq) {
  const end = Math.max(0, ...seq.channels.flatMap((c) => c.clips.map((k) => k.range.out)));
  if (end !== seq.durationFrames) tx.set(seq, 'durationFrames', end);
}
/** How many sequence frames a media item lasts (Infinity when unknown or a still). */
function sourceLength(p, k, seq) {
  if (!hasSource(k) || k.hold) return Infinity;
  const m = p.media.find((x) => x.id === k.mediaId);
  if (!m || !m.durationFrames || !m.fps || m.kind === 'image') return Infinity;
  return Math.floor((m.durationFrames * seq.timebase.num * m.fps.den) / (seq.timebase.den * m.fps.num));
}
const editable = (ch) => { if (ch.locked) fail(`channel ${ch.name} is locked`); return ch; };

// ------------------------------------------------------------------------------------------------ path helpers
/** Parent object and key for a path inside an object, e.g. ['params', 'warp', 'sampling']. */
function at(obj, path) {
  if (!path.length) fail('empty path');
  let o = obj; for (const k of path.slice(0, -1)) { o = o?.[k]; if (o === undefined) fail(`no ${path.join('.')}`); }
  return [o, path[path.length - 1]];
}
const FROZEN = new Set(['id', 'kind', 'range', 'clips', 'stack', 'channels', 'children', 'sequences', 'media', 'markers', 'schema', 'format', 'type', 'version', 'durationFrames']);

// ------------------------------------------------------------------------------------------------ commands
/**
 * Commands: name -> { label, run(ctx, args) }. ctx = { p, tx, seq, ix (id index), get(id, kind?) }.
 * A command throws ProjectError to refuse; everything it did so far is rolled back.
 */
export const COMMANDS = {
  // ---- clips
  addClip: { label: 'Add clip', run(c, { channelId, clip }) {
    const ch = editable(c.get(channelId, 'channel').obj), k = clone(clip);
    if (k.kind !== CHANNEL_CLIP[ch.kind]) fail(`${k.kind} clip on a ${ch.kind} channel`);
    if (!Number.isInteger(k.range.in) || k.range.in < 0 || !(k.range.out > k.range.in)) fail('bad range');
    clearRange(c.tx, ch, k.range.in, k.range.out); insertSorted(c.tx, ch, k); fitDuration(c.tx, c.seq);
    return k.id;
  } },
  moveClips: { label: 'Move', run(c, { ids, delta = 0, channelDelta = 0 }) {
    if (!delta && !channelDelta) return;
    const items = ids.map((id) => c.get(id, 'clip'));
    const chans = c.seq.channels;
    for (const it of items) {
      editable(it.ch);
      const dst = chans[chans.indexOf(it.ch) + channelDelta];
      if (!dst) fail('no channel there'); editable(dst);
      if (CHANNEL_CLIP[dst.kind] !== it.obj.kind) fail(`${it.obj.kind} clip on a ${dst.kind} channel`);
      if (it.obj.range.in + delta < 0) fail('before the sequence start');
      it.dst = dst;
    }
    for (const it of items) c.tx.remove(it.ch.clips, it.ch.clips.indexOf(it.obj));
    for (const it of items) {
      const k = it.obj; if (delta) { c.tx.set(k.range, 'in', k.range.in + delta); c.tx.set(k.range, 'out', k.range.out + delta); }
      clearRange(c.tx, it.dst, k.range.in, k.range.out); insertSorted(c.tx, it.dst, k);
    }
    fitDuration(c.tx, c.seq);
  } },
  /** Non-ripple trim of one edge to a sequence frame; clamped to neighbours, the source length and 1 frame.
   *  Returns the frame actually used. */
  trimClip: { label: 'Trim', run(c, { id, edge, frame }) {
    const { obj: k, ch } = c.get(id, 'clip'); editable(ch);
    const i = ch.clips.indexOf(k), prev = ch.clips[i - 1], next = ch.clips[i + 1];
    const srcEnd = k.range.in - (hasSource(k) && !k.hold ? k.sourceIn : 0) + sourceLength(c.p, k, c.seq);
    let f = Math.round(frame);
    if (edge === 'in') {
      const lo = Math.max(prev ? prev.range.out : 0, hasSource(k) && !k.hold ? k.range.in - k.sourceIn : 0);
      f = Math.min(Math.max(f, lo), k.range.out - 1); setIn(c.tx, k, f);
    } else if (edge === 'out') {
      f = Math.max(Math.min(f, next ? next.range.in : Infinity, srcEnd), k.range.in + 1); c.tx.set(k.range, 'out', f);
    } else fail(`bad edge ${edge}`);
    fitDuration(c.tx, c.seq);
    return f;
  } },
  /** Split at a sequence frame: the given clips, or every clip under the frame on unlocked channels. Returns the
   *  new right-hand clip ids. A split is a reset point for an effect clip (spec §7). */
  splitClips: { label: 'Split', run(c, { frame, ids }) {
    const out = [];
    for (const ch of c.seq.channels) {
      if (ch.locked) continue;
      for (let i = ch.clips.length - 1; i >= 0; i--) {
        const k = ch.clips[i];
        if (!(k.range.in < frame && frame < k.range.out) || (ids && !ids.includes(k.id))) continue;
        const r = rightPart(k, frame); cutOut(c.tx, k, frame); c.tx.insert(ch.clips, i + 1, r); out.push(r.id);
      }
    }
    return out;
  } },
  deleteClips: { label: 'Delete', run(c, { ids }) {
    for (const id of ids) { const { obj, ch } = c.get(id, 'clip'); editable(ch); c.tx.remove(ch.clips, ch.clips.indexOf(obj)); }
    fitDuration(c.tx, c.seq);
  } },
  /** Paste copies (from copyClips) so the earliest starts at `frame`; on their own channels or all on channelId. */
  pasteClips: { label: 'Paste', run(c, { items, frame, channelId }) {
    if (!items.length) return [];
    const t0 = Math.min(...items.map((x) => x.clip.range.in)), ids = [];
    for (const { clip, channelId: own } of items) {
      const ch = editable(c.get(channelId || own, 'channel').obj), k = cloneClip(clip);
      if (CHANNEL_CLIP[ch.kind] !== k.kind) fail(`${k.kind} clip on a ${ch.kind} channel`);
      k.range = { in: frame + clip.range.in - t0, out: frame + clip.range.out - t0 };
      clearRange(c.tx, ch, k.range.in, k.range.out); insertSorted(c.tx, ch, k); ids.push(k.id);
    }
    fitDuration(c.tx, c.seq);
    return ids;
  } },
  /**
   * Bloom Insert (D18): split the media clip at `frame` and insert a held segment of `length` frames there (the
   * source frame at `frame`, frozen), rippling everything at or after `frame` later on every channel. Effect clips
   * spanning the frame grow by `length` (their times after the frame shift with it), other clips spanning it are
   * split and their right part moves. A mosh hit marker with `hold: length` marks the bloom. Time-stretched audio
   * fills the gap in M7.
   */
  bloomInsert: { label: 'Bloom Insert', run(c, { clipId, frame, length }) {
    const { obj: k, ch } = c.get(clipId, 'clip'); editable(ch);
    if (k.kind !== 'media') fail('Bloom Insert needs a media clip');
    if (!(k.range.in <= frame && frame < k.range.out)) fail('frame is outside the clip');
    if (!(Number.isInteger(length) && length > 0)) fail('bad length');
    for (const x of c.seq.channels) {
      if (x.locked && x.clips.some((y) => y.range.out > frame)) fail(`channel ${x.name} is locked`);
      for (let i = x.clips.length - 1; i >= 0; i--) {
        const y = x.clips[i];
        if (y.range.in >= frame) { c.tx.set(y.range, 'in', y.range.in + length); c.tx.set(y.range, 'out', y.range.out + length); }
        else if (y.range.out > frame) {
          if (y.kind === 'effect') {
            const rel = frame - y.range.in;
            c.tx.set(y.range, 'out', y.range.out + length);
            eachTimed(y, (o, key, v) => c.tx.set(o, key, Array.isArray(v) ? v.map((h) => (h >= rel ? h + length : h))
              : { ...v, keys: v.keys.map((q) => (q.frame >= rel ? { ...q, frame: q.frame + length } : q)) }));
          } else if (y.kind === 'audio') {                                // M7: the sound slows to fill the hold, back in sync after
            const at = frame - y.range.in; if (insideStretch(y, at)) fail('the audio is already stretched there');
            c.tx.set(y, 'stretch', [...(y.stretch || []), { at, len: length, span: Math.min(length, y.range.out - frame) }].sort((a, b) => a.at - b.at));
            c.tx.set(y.range, 'out', y.range.out + length);
          } else {
            const r = rightPart(y, frame); r.range = { in: frame + length, out: y.range.out + length };
            c.tx.set(y.range, 'out', frame); c.tx.insert(x.clips, i + 1, r);
          }
        }
      }
    }
    const hold = createMediaClip(k.mediaId, { in: frame, out: frame + length }, { sourceIn: k.hold ? k.sourceIn : k.sourceIn + frame - k.range.in, hold: true, transform: clone(k.transform) });
    insertSorted(c.tx, ch, hold);
    for (const m of c.seq.markers) if (m.frame >= frame) c.tx.set(m, 'frame', m.frame + length);
    addMarkerSorted(c.tx, c.seq, createMarker(frame, { hit: true, color: 'red', note: 'Bloom Insert' }), { hold: length });
    if (c.seq.exportRange && c.seq.exportRange.out > frame) c.tx.set(c.seq, 'exportRange', { in: c.seq.exportRange.in + (c.seq.exportRange.in > frame ? length : 0), out: c.seq.exportRange.out + length });
    fitDuration(c.tx, c.seq);
    return hold.id;
  } },

  /**
   * Mosh Cut (D18): at a join between two media clips on a video channel, an effect clip from `pre` frames before
   * the join (A's last frame becomes the loop's I-frame) to `length` frames into B, running a Mosh Loop (default
   * Xvid classic). B's cut is a dropped I-frame, so B's motion moves A's picture: no reset. It goes on the first
   * effect channel above that is free over the range, or a new one right above. Returns the clip id.
   */
  moshCut: { label: 'Mosh Cut', run(c, { channelId, frame, length, pre = 1, preset = 'Xvid classic' }) {
    const ch = editable(c.get(channelId, 'channel').obj), chans = c.seq.channels, ci = chans.indexOf(ch);
    if (ch.kind !== 'video') fail('Mosh Cut needs a join on a video channel');
    const A = ch.clips.find((k) => k.range.out === frame), B = ch.clips.find((k) => k.range.in === frame);
    if (!A || !B) fail(`no join at frame ${frame}`);
    const fps = c.seq.timebase.num / c.seq.timebase.den;
    const range = { in: Math.max(A.range.in, frame - Math.max(1, pre | 0)), out: Math.min(B.range.out, frame + (length > 0 ? length | 0 : Math.round(2 * fps))) };
    let dst = chans.slice(ci + 1).find((x) => x.kind === 'effect' && !x.locked && !x.clips.some((k) => k.range.in < range.out && k.range.out > range.in));
    if (!dst) {
      const n = chans.filter((x) => x.kind === 'effect').length + 1;
      dst = createChannel('effect', 'FX' + n); c.tx.insert(chans, ci + 1, dst);
    }
    if (!PRESETS[preset]) fail(`no preset ${preset}`);
    const clip = createEffectClip(range, { stack: [createEffect('moshLoop', { params: PRESETS[preset], seed: nextSeed(c.p) })] });
    clip.label = 'Mosh Cut'; clip.role = 'moshCut';
    insertSorted(c.tx, dst, clip); fitDuration(c.tx, c.seq);
    return clip.id;
  } },

  /** Add a media reference (a library entry, mediaFromLibrary). One with the same content hash is reused. Returns its id. */
  addMedia: { label: 'Add media', run(c, { media }) {
    const have = c.p.media.find((m) => m.hash === media.hash); if (have) return have.id;
    if (!media.id || c.ix.has(media.id)) fail('media needs a fresh id');
    c.tx.insert(c.p.media, c.p.media.length, clone(media)); return media.id;
  } },

  // ---- channels
  addChannel: { label: 'Add channel', run(c, { kind, name, index }) {
    if (!CHANNEL_CLIP[kind]) fail(`bad kind ${kind}`);
    const prefix = { video: 'V', effect: 'FX', audio: 'A' }[kind], n = c.seq.channels.filter((x) => x.kind === kind).length + 1;
    const ch = createChannel(kind, name || prefix + n);
    c.tx.insert(c.seq.channels, index ?? c.seq.channels.length, ch); return ch.id;
  } },
  deleteChannel: { label: 'Delete channel', run(c, { id }) {
    const { obj: ch } = c.get(id, 'channel'); editable(ch);
    for (const [, v] of c.ix) if (v.kind === 'effect' && Object.values(v.obj.inputs || {}).some((r) => r.channel === id)) fail(`channel ${ch.name} is an input of another effect`);
    c.tx.remove(c.seq.channels, c.seq.channels.indexOf(ch)); fitDuration(c.tx, c.seq);
  } },
  moveChannel: { label: 'Reorder channels', run(c, { id, index }) {
    const { obj: ch } = c.get(id, 'channel'), list = c.seq.channels;
    if (!(index >= 0 && index < list.length)) fail('bad index');
    c.tx.remove(list, list.indexOf(ch)); c.tx.insert(list, index, ch);
  } },

  // ---- effects (owner: a clip, a channel, or a group effect's children)
  addEffect: { label: 'Add effect', run(c, { ownerId, type, params, seed, index }) {
    const o = c.get(ownerId);
    if (o.kind === 'effect' && !EFFECTS[o.obj.type]?.group) fail(`${o.obj.type} cannot hold effects`);
    if (o.kind === 'effect' && !o.obj.children) c.tx.set(o.obj, 'children', []);
    const list = o.kind === 'effect' ? o.obj.children : o.kind === 'clip' || o.kind === 'channel' ? o.obj.stack : null;
    if (!list) fail('this cannot hold effects');
    editable(o.kind === 'channel' ? o.obj : o.ch);
    const e = createEffect(type, { params, seed: seed ?? nextSeed(c.p) });
    c.tx.insert(list, index ?? list.length, e); return e.id;
  } },
  removeEffect: { label: 'Remove effect', run(c, { id }) {
    const { list, ch, obj } = c.get(id, 'effect'); editable(ch); c.tx.remove(list, list.indexOf(obj));
  } },
  moveEffect: { label: 'Reorder effects', run(c, { id, index, ownerId }) {
    const src = c.get(id, 'effect'); editable(src.ch);
    let list = src.list;
    if (ownerId) { const o = c.get(ownerId); list = o.kind === 'effect' ? o.obj.children : o.obj.stack; if (!list) fail('this cannot hold effects'); }
    c.tx.remove(src.list, src.list.indexOf(src.obj));
    if (!(index >= 0 && index <= list.length)) fail('bad index');
    c.tx.insert(list, index, src.obj);
  } },

  /** Paste copies of effects into a clip's or channel's stack (fresh ids; `replace` removes the current stack first).
   *  Returns the new ids. */
  pasteStack: { label: 'Paste stack', run(c, { ownerId, effects, replace = false, index }) {
    const o = c.get(ownerId), list = o.kind === 'clip' || o.kind === 'channel' ? o.obj.stack : null;
    if (!list) fail('this cannot hold effects');
    editable(o.kind === 'channel' ? o.obj : o.ch);
    if (replace) for (let i = list.length - 1; i >= 0; i--) c.tx.remove(list, i);
    const ids = [], re = (e) => { const x = clone(e); x.id = newId('e'); x.children = x.children?.map(re); if (!x.children) delete x.children; ids.push(x.id); return x; };
    let at = replace ? 0 : index ?? list.length;
    for (const e of effects) { if (!EFFECTS[e.type]) fail(`unknown effect type ${e.type}`); c.tx.insert(list, at++, re(e)); }
    return ids;
  } },
  /** Save a stack as a project preset (spec §4 Project.presets). Inputs are dropped: they name channels of this
   *  sequence. Returns the preset id. */
  savePreset: { label: 'Save preset', run(c, { name, stack }) {
    if (!name || typeof name !== 'string') fail('a preset needs a name');
    if (!c.p.presets) c.tx.set(c.p, 'presets', []);
    const strip = (e) => { const x = clone(e); delete x.inputs; if (x.children) x.children = x.children.map(strip); return x; };
    const p = { id: newId('pr'), name, stack: stack.map(strip) };
    p.stack.forEach((e) => { e.id = newId('e'); });
    c.tx.insert(c.p.presets, c.p.presets.length, p); return p.id;
  } },
  deletePreset: { label: 'Delete preset', run(c, { id }) {
    const i = (c.p.presets || []).findIndex((x) => x.id === id); if (i < 0) fail(`no preset ${id}`);
    c.tx.remove(c.p.presets, i);
  } },

  // ---- values and keyframes (`at` is a sequence frame; keys on clip-owned values are stored clip-relative)
  /** Set any editable property by id and path. On an animated value with keys this sets the key at `at`. */
  setValue: { label: 'Change', run(c, { id, path, value, at }) {
    const o = c.get(id); if (FROZEN.has(path[0]) && o.kind !== 'effect') fail(`${path[0]} is not set directly`);
    if (o.kind === 'effect' && path[0] !== 'params' && path[0] !== 'enabled' && path[0] !== 'seed' && path[0] !== 'inputs') fail(`${path[0]} is not set directly`);
    lockCheck(o);
    const [parent, key] = at_(o.obj, path), cur = parent[key];
    if (isAnim(cur) && cur.keys) { if (at === undefined) fail('animated: give a frame'); return setKey(c, o, parent, key, local(o, at), { value: clone(value) }); }
    if (isAnim(cur) && !isAnim(value)) c.tx.set(parent, key, { ...cur, value: clone(value) });
    else c.tx.set(parent, key, clone(value));
  } },
  /** Stopwatch on: the current value becomes a single key at `at`. */
  animate: { label: 'Animate', run(c, { id, path, at, interp = 'linear' }) {
    const o = c.get(id); lockCheck(o); const [parent, key] = at_(o.obj, path), cur = parent[key];
    if (isAnim(cur) && cur.keys) return;
    const v = isAnim(cur) ? cur.value : cur, mods = isAnim(cur) ? cur.mods : undefined;
    c.tx.set(parent, key, { keys: [{ frame: local(o, at), value: clone(v), interp }], ...(mods ? { mods } : {}) });
  } },
  /** Stopwatch off: the value at `at` becomes the static value. */
  unanimate: { label: 'Remove animation', run(c, { id, path, at }) {
    const o = c.get(id); lockCheck(o); const [parent, key] = at_(o.obj, path), cur = parent[key];
    if (!(isAnim(cur) && cur.keys)) return;
    const v = resolve({ keys: cur.keys }, local(o, at));
    c.tx.set(parent, key, cur.mods ? { value: v, mods: cur.mods } : v);
  } },
  setKey: { label: 'Keyframe', run(c, { id, path, at, value, interp }) {
    const o = c.get(id); lockCheck(o); const [parent, key] = at_(o.obj, path);
    if (!(isAnim(parent[key]) && parent[key].keys)) fail('not animated');
    setKey(c, o, parent, key, local(o, at), { value: clone(value), interp });
  } },
  moveKey: { label: 'Move keyframe', run(c, { id, path, from, to }) {
    const o = c.get(id); lockCheck(o); const [parent, key] = at_(o.obj, path), cur = parent[key];
    const f = local(o, from), t = local(o, to), keys = cur?.keys || [], i = keys.findIndex((x) => x.frame === f);
    if (i < 0) fail(`no key at ${from}`); if (f === t) return;
    if (keys.some((x) => x.frame === t)) fail(`a key already sits at ${to}`);
    const next = keys.filter((_, j) => j !== i).concat({ ...keys[i], frame: t }).sort((a, b) => a.frame - b.frame);
    c.tx.set(parent, key, { ...cur, keys: next });
  } },
  /** Delete a key; deleting the last one leaves its value static. */
  deleteKey: { label: 'Delete keyframe', run(c, { id, path, at }) {
    const o = c.get(id); lockCheck(o); const [parent, key] = at_(o.obj, path), cur = parent[key];
    const f = local(o, at), keys = cur?.keys || [], i = keys.findIndex((x) => x.frame === f);
    if (i < 0) fail(`no key at ${at}`);
    if (keys.length === 1) c.tx.set(parent, key, cur.mods ? { value: keys[0].value, mods: cur.mods } : keys[0].value);
    else c.tx.set(parent, key, { ...cur, keys: keys.filter((_, j) => j !== i) });
  } },

  /** Add a modulator to a numeric parameter (a plain value becomes { value, mods }). Returns its index. */
  addModulator: { label: 'Add modulator', run(c, { id, path, mod, index }) {
    const o = c.get(id); lockCheck(o); const [parent, key] = at_(o.obj, path), cur = parent[key];
    const base = isAnim(cur) ? cur : { value: cur };
    if (typeof (base.keys ? base.keys[0].value : base.value) !== 'number') fail('modulators need a numeric parameter');
    const mods = [...(base.mods || [])], i = index ?? mods.length; mods.splice(i, 0, clone(mod));
    c.tx.set(parent, key, { ...base, mods }); return i;
  } },
  /** Remove modulator `index`; a value left with no keys and no modulators becomes plain again. */
  removeModulator: { label: 'Remove modulator', run(c, { id, path, index }) {
    const o = c.get(id); lockCheck(o); const [parent, key] = at_(o.obj, path), cur = parent[key];
    if (!(isAnim(cur) && cur.mods && cur.mods[index])) fail(`no modulator ${index}`);
    const mods = cur.mods.filter((_, j) => j !== index), next = { ...cur };
    if (mods.length) next.mods = mods; else delete next.mods;
    c.tx.set(parent, key, !next.keys && !next.mods ? next.value : next);
  } },

  /** R2: one painted vector stroke into a Mosh Loop's 'paint' field op (created, in `mode`, if it has none). */
  addVectorStroke: { label: 'Vector stroke', run(c, { effectId, stroke, mode = 'add' }) {
    const { obj: e, ch } = c.get(effectId, 'effect'); editable(ch);
    if (e.type !== 'moshLoop') fail('vectors are painted into a Mosh Loop');
    if (!stroke || !Array.isArray(stroke.pts) || stroke.pts.length < 4 || !(stroke.r > 0)) fail('a vector stroke needs a drag (two points or more) and r > 0');
    const ops = e.params.ops, i = ops.findIndex((o) => o.op === 'paint');
    const next = i < 0 ? [...ops, { ...opDefaults('paint'), mode, strokes: [clone(stroke)] }] : ops.map((o, j) => (j === i ? { ...o, strokes: [...(o.strokes || []), clone(stroke)] } : o));
    c.tx.set(e.params, 'ops', next);
  } },

  // ---- masks (R3): include / lock masks on effect clips; shapes in sequence space (see masks.js)
  addMask: { label: 'Add mask', run(c, { clipId, mode = 'include', feather }) {
    const { obj: k, ch } = c.get(clipId, 'clip'); editable(ch);
    if (k.kind !== 'effect') fail('masks go on effect clips (the moshes)');
    if (!k.masks) c.tx.set(k, 'masks', []);
    const m = createMask(mode, { id: newId('mk'), ...(feather !== undefined ? { feather } : {}) }); c.tx.insert(k.masks, k.masks.length, m); return m.id;
  } },
  /** One brush stroke (or an ellipse / rect shape) into a mask, creating an include or lock mask on the clip when maskId
   *  is not given. Returns the mask id. */
  addMaskStroke: { label: 'Mask stroke', run(c, { clipId, maskId, mode = 'include', stroke }) {
    if (!stroke || ((stroke.type || 'stroke') === 'stroke' && (!Array.isArray(stroke.pts) || !(stroke.r > 0)))) fail('bad stroke');   // or an ellipse / rect shape
    let m = maskId ? c.get(maskId, 'mask') : null;
    if (!m) {
      const { obj: k } = c.get(clipId, 'clip'); let mk = (k.masks || []).find((x) => x.mode === mode && x.enabled);
      if (!mk) { const id = COMMANDS.addMask.run(c, { clipId, mode }); mk = k.masks.find((x) => x.id === id); }
      m = { obj: mk, ch: c.get(clipId, 'clip').ch };
    }
    editable(m.ch);
    const sh = { type: stroke.type || 'stroke', ...clone(stroke) };
    c.tx.insert(m.obj.shapes, m.obj.shapes.length, sh); return m.obj.id;
  } },
  removeMask: { label: 'Remove mask', run(c, { id }) { const { obj, list, ch } = c.get(id, 'mask'); editable(ch); c.tx.remove(list, list.indexOf(obj)); } },

  // ---- markers
  addMarker: { label: 'Add marker', run(c, { frame, color, note, hit, hold }) {
    if (!(Number.isInteger(frame) && frame >= 0)) fail('bad frame');
    const m = createMarker(frame, { color, note, hit }); addMarkerSorted(c.tx, c.seq, m, hold ? { hold } : {}); return m.id;
  } },
  moveMarker: { label: 'Move marker', run(c, { id, frame }) {
    if (!(Number.isInteger(frame) && frame >= 0)) fail('bad frame');
    const { obj: m } = c.get(id, 'marker'), list = c.seq.markers;
    c.tx.remove(list, list.indexOf(m)); c.tx.set(m, 'frame', frame); addMarkerSorted(c.tx, c.seq, m);
  } },
  deleteMarker: { label: 'Delete marker', run(c, { id }) { const { obj: m } = c.get(id, 'marker'); c.tx.remove(c.seq.markers, c.seq.markers.indexOf(m)); } },
  setExportRange: { label: 'Export range', run(c, { range }) {
    if (range && !(Number.isInteger(range.in) && Number.isInteger(range.out) && range.in >= 0 && range.out > range.in)) fail('bad range');
    c.tx.set(c.seq, 'exportRange', range ? { in: range.in, out: range.out } : undefined);
  } },
};

function addMarkerSorted(tx, seq, m, extra = {}) {
  Object.assign(m, extra);
  let i = seq.markers.findIndex((x) => x.frame > m.frame); if (i < 0) i = seq.markers.length;
  tx.insert(seq.markers, i, m);
}
function setKey(c, o, parent, key, f, { value, interp }) {
  const cur = parent[key], keys = cur.keys, i = keys.findIndex((x) => x.frame === f);
  const k = { frame: f, value: value === undefined ? (i >= 0 ? keys[i].value : resolve({ keys }, f)) : value, interp: interp || (i >= 0 ? keys[i].interp : 'linear') };
  const next = i >= 0 ? keys.map((x, j) => (j === i ? k : x)) : [...keys, k].sort((a, b) => a.frame - b.frame);
  c.tx.set(parent, key, { ...cur, keys: next });
}
/** Sequence frame -> the frame keys are stored in for this object (clip-relative when it belongs to a clip). */
const local = (o, at) => {
  if (!Number.isInteger(at)) fail('frame must be an integer');
  const clip = o.kind === 'clip' ? o.obj : o.clip; return clip ? at - clip.range.in : at;
};
const at_ = (obj, path) => at(obj, Array.isArray(path) ? path : [path]);
const lockCheck = (o) => { if (o.kind === 'channel') return; if (o.ch) editable(o.ch); };
const nextSeed = (p) => { let s = 1; for (const [, v] of indexProject(p)) if (v.kind === 'effect') s = Math.max(s, v.obj.seed + 1); return s; };

// ------------------------------------------------------------------------------------------------ the bus
/**
 * createTimeline(project, { check, onChange }): exec(name, args, { merge }) runs a command as one undo step and
 * returns its result. merge: a key; consecutive commands with the same key fold into one step (a slider drag).
 * transaction(label, fn) folds several exec calls into one step. check: validate after every command and refuse
 * (roll back) one that leaves the project invalid; on by default (it is linear in the project size).
 */
export function createTimeline(project, { check = true, onChange = () => {} } = {}) {
  const undoStack = [], redoStack = [];
  let group = null, lastMerge = null;
  const sel = new Set();
  const seqOf = (id) => project.sequences.find((s) => s.id === (id || project.activeSequence)) || fail('no sequence');

  function exec(name, args = {}, { merge = null } = {}) {
    const cmd = COMMANDS[name]; if (!cmd) fail(`unknown command ${name}`);
    const tx = createTx(), ix = indexProject(project);
    const get = (id, kind) => { const v = ix.get(id); if (!v || (kind && v.kind !== kind)) fail(`no ${kind || 'object'} ${id}`); return v; };
    let result;
    try {
      result = cmd.run({ p: project, tx, seq: seqOf(args.sequenceId), ix, get }, args);
      if (check) { const errs = validate(project); if (errs.length) throw new ProjectError(`${name} left the project invalid`, errs); }
    } catch (e) { revert(tx.ops); throw e; }
    if (!tx.ops.length) return result;
    if (group) group.ops.push(...tx.ops);
    else {
      const top = undoStack[undoStack.length - 1];
      if (merge && top && lastMerge === merge) top.ops.push(...tx.ops);
      else undoStack.push({ label: cmd.label, ops: tx.ops });
      lastMerge = merge; redoStack.length = 0; changed(name);
    }
    return result;
  }
  function transaction(label, fn) {
    if (group) return fn();
    group = { label, ops: [] };
    try { const r = fn(); const g = group; group = null; if (g.ops.length) { undoStack.push(g); redoStack.length = 0; lastMerge = null; changed('transaction'); } return r; }
    catch (e) { const g = group; group = null; revert(g.ops); throw e; }
  }
  function changed(what) {
    const ix = indexProject(project); for (const id of [...sel]) if (!ix.has(id)) sel.delete(id);
    onChange(what);
  }
  const ends = (seq) => seq.channels.flatMap((ch, ci) => ch.clips.map((k) => ({ k, ci })));

  return {
    project, exec, transaction, COMMANDS,
    undo() { const e = undoStack.pop(); if (!e) return false; revert(e.ops); redoStack.push(e); lastMerge = null; changed('undo'); return true; },
    redo() { const e = redoStack.pop(); if (!e) return false; replay(e.ops); undoStack.push(e); lastMerge = null; changed('redo'); return true; },
    get canUndo() { return undoStack.length > 0; }, get canRedo() { return redoStack.length > 0; },
    get undoLabel() { return undoStack[undoStack.length - 1]?.label || null; }, get redoLabel() { return redoStack[redoStack.length - 1]?.label || null; },
    get depth() { return undoStack.length; },
    /** End a merge run (call on pointer up), so the next slider drag is its own step. */
    seal() { lastMerge = null; },

    // ---- selection (not part of undo; ids that disappear are dropped)
    selection: sel,
    select(id, mode = 'replace') {
      if (mode === 'replace') { sel.clear(); if (id) sel.add(id); }
      else if (mode === 'add') sel.add(id);
      else if (mode === 'toggle') { if (sel.has(id)) sel.delete(id); else sel.add(id); }
      onChange('selection');
    },
    /** Shift-click: every clip intersecting the span from the anchor clip to this one, on the channels between. */
    selectRange(anchorId, id, mode = 'replace') {
      const seq = seqOf(), all = ends(seq), a = all.find((x) => x.k.id === anchorId), b = all.find((x) => x.k.id === id);
      if (!a || !b) return this.select(id, mode);
      const lo = Math.min(a.k.range.in, b.k.range.in), hi = Math.max(a.k.range.out, b.k.range.out);
      return this.marquee({ channels: [Math.min(a.ci, b.ci), Math.max(a.ci, b.ci)], in: lo, out: hi }, mode);
    },
    /** Marquee: clips intersecting [in, out) on channel indices channels[0]..channels[1]. */
    marquee({ channels: [c0, c1], in: lo, out: hi }, mode = 'replace') {
      if (mode === 'replace') sel.clear();
      for (const { k, ci } of ends(seqOf())) if (ci >= c0 && ci <= c1 && k.range.in < hi && k.range.out > lo) sel.add(k.id);
      onChange('selection');
    },
    selectedClips() { const ix = indexProject(project); return [...sel].filter((id) => ix.get(id)?.kind === 'clip'); },

    // ---- clipboard
    /** Copies of clips with their channel, for pasteClips. */
    copyClips(ids) { const ix = indexProject(project); return ids.map((id) => ix.get(id)).filter((v) => v?.kind === 'clip').map((v) => ({ channelId: v.ch.id, clip: clone(v.obj) })); },
    /** Cmd+D: paste copies of the clips right after the last of them, on their own channels. */
    duplicate(ids) { const items = this.copyClips(ids); if (!items.length) return []; return exec('pasteClips', { items, frame: Math.max(...items.map((x) => x.clip.range.out)) }); },

    // ---- snapping
    snapPoints: (opts) => snapPoints(seqOf(), opts),
  };
}

// ------------------------------------------------------------------------------------------------ snapping
/** Sorted unique frames to snap to: clip edges, markers, the playhead, keyframes (in sequence time), the export
 *  range. exclude: clip ids being dragged (their own edges and keys do not attract them). */
export function snapPoints(seq, { playhead, exclude = [] } = {}) {
  const pts = new Set([0]); const ex = new Set(exclude);
  for (const ch of seq.channels) for (const k of ch.clips) {
    if (ex.has(k.id)) continue;
    pts.add(k.range.in); pts.add(k.range.out);
    eachTimed(k, (o, key, v) => { if (!Array.isArray(v)) for (const q of v.keys) { const f = k.range.in + q.frame; if (f >= k.range.in && f <= k.range.out) pts.add(f); } });
  }
  for (const m of seq.markers) pts.add(m.frame);
  if (Number.isInteger(playhead)) pts.add(playhead);
  if (seq.exportRange) { pts.add(seq.exportRange.in); pts.add(seq.exportRange.out); }
  return [...pts].sort((a, b) => a - b);
}
/** Nearest point within `tol` frames of `frame`, else the frame itself. Returns { frame, snapped }. */
export function snap(frame, points, tol) {
  let best = null;
  for (const p of points) { const d = Math.abs(p - frame); if (d <= tol && (best === null || d < Math.abs(best - frame))) best = p; }
  return best === null ? { frame, snapped: false } : { frame: best, snapped: true };
}
/** Snap a move: the delta that brings either edge of any moved clip onto a point, if within tol. */
export function snapDelta(ranges, delta, points, tol) {
  let best = null;
  for (const r of ranges) for (const e of [r.in + delta, r.out + delta]) {
    const s = snap(e, points, tol); if (s.snapped && (best === null || Math.abs(s.frame - e) < Math.abs(best))) best = s.frame - e;
  }
  return best === null ? { delta, snapped: false } : { delta: delta + best, snapped: true };
}
