// M5 step 2: the command bus — every command is undone and redone byte for byte; editing semantics; fuzz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimeline, COMMANDS, indexProject, snapPoints, snap, snapDelta } from '../timeline.js';
import { createProject, createMediaClip, createEffectClip, createAudioClip, createEffect, stringify, validate } from '../project.js';
import { resolve } from '../params.js';

const MEDIA = { id: 'med', name: 'cut.mp4', hash: 'h', kind: 'video', width: 640, height: 360, fps: { num: 30, den: 1 }, durationFrames: 600, hasAudio: true, storage: 'opfs' };
/** V1: [0,100) [100,200) · FX1: [50,150) animated · A1: [0,200). Keyframes on the FX clip and on V1's first clip. */
function sample() {
  const p = createProject({ timebase: { num: 30, den: 1 } }), seq = p.sequences[0], [v, fx, a] = seq.channels;
  p.media.push(MEDIA);
  v.clips.push(createMediaClip('med', { in: 0, out: 100 }), createMediaClip('med', { in: 100, out: 200 }, { sourceIn: 100 }));
  v.clips[0].transform.opacity = { keys: [{ frame: 10, value: 0, interp: 'linear' }, { frame: 60, value: 1, interp: 'easeIn' }] };
  const e = createEffectClip({ in: 50, out: 150 });
  e.stack[0].params.bloom.repeat = { keys: [{ frame: 0, value: 0, interp: 'linear' }, { frame: 80, value: 40, interp: 'linear' }] };
  e.stack[0].params.bloom.hits = [5, 70];
  fx.clips.push(e);
  a.clips.push(createAudioClip('med', { in: 0, out: 200 }));
  seq.durationFrames = 200;
  assert.deepEqual(validate(p), []);
  return p;
}
const ids = (p) => p.sequences[0].channels.map((c) => c.clips.map((k) => `${k.range.in}-${k.range.out}`).join(' '));
const S = (p) => stringify(p);

/** Run one command and check: valid after, undo restores the exact bytes, redo restores the after bytes. */
function roundTrip(name, args, setup = sample) {
  const p = setup(), tl = createTimeline(p), a = typeof args === 'function' ? args(p) : args, before = S(p);
  const r = tl.exec(name, a), after = S(p);
  assert.deepEqual(validate(p), [], name);
  if (after !== before) {
    assert.ok(tl.undo()); assert.equal(S(p), before, `${name}: undo`);
    assert.ok(tl.redo()); assert.equal(S(p), after, `${name}: redo`);
  }
  return { p, tl, r };
}

test('every command undoes and redoes byte for byte', () => {
  const v0 = (p) => p.sequences[0].channels[0], fxc = (p) => p.sequences[0].channels[1].clips[0];
  const cases = {
    addClip: (p) => ({ channelId: v0(p).id, clip: createMediaClip('med', { in: 50, out: 150 }, { sourceIn: 7 }) }),
    moveClips: (p) => ({ ids: [v0(p).clips[0].id], delta: 30 }),
    trimClip: (p) => ({ id: v0(p).clips[1].id, edge: 'in', frame: 130 }),
    splitClips: { frame: 75 },
    deleteClips: (p) => ({ ids: [v0(p).clips[0].id, fxc(p).id] }),
    pasteClips: (p) => ({ items: [{ channelId: p.sequences[0].channels[1].id, clip: structuredClone(fxc(p)) }], frame: 170 }),
    bloomInsert: (p) => ({ clipId: v0(p).clips[0].id, frame: 80, length: 24 }),
    moshCut: (p) => ({ channelId: v0(p).id, frame: 100 }),
    addMedia: { media: { id: 'm2', name: 'b.mp4', hash: 'hb', kind: 'video', width: 64, height: 64, storage: 'opfs' } },
    addChannel: { kind: 'effect' },
    deleteChannel: (p) => ({ id: p.sequences[0].channels[2].id }),
    moveChannel: (p) => ({ id: p.sequences[0].channels[0].id, index: 2 }),
    addEffect: (p) => ({ ownerId: v0(p).clips[0].id, type: 'rgbsplit' }),
    removeEffect: (p) => ({ id: fxc(p).stack[0].id }),
    moveEffect: (p) => ({ id: fxc(p).stack[0].id, ownerId: v0(p).clips[1].id, index: 0 }),
    setValue: (p) => ({ id: fxc(p).stack[0].id, path: ['params', 'warp', 'sampling'], value: 'bilinear' }),
    animate: (p) => ({ id: fxc(p).stack[0].id, path: ['params', 'residual', 'gain'], at: 60 }),
    unanimate: (p) => ({ id: fxc(p).stack[0].id, path: ['params', 'bloom', 'repeat'], at: 90 }),
    setKey: (p) => ({ id: fxc(p).stack[0].id, path: ['params', 'bloom', 'repeat'], at: 100, value: 12 }),
    moveKey: (p) => ({ id: fxc(p).stack[0].id, path: ['params', 'bloom', 'repeat'], from: 130, to: 140 }),
    deleteKey: (p) => ({ id: v0(p).clips[0].id, path: ['transform', 'opacity'], at: 10 }),
    addModulator: (p) => ({ id: fxc(p).stack[0].id, path: ['params', 'residual', 'gain'], mod: { type: 'lfo', mode: 'add', depth: 0.2, params: { shape: 'sine', rate: 1, phase: 0 }, seed: 1 } }),
    removeModulator: (p) => { fxc(p).stack[0].params.intra.rate = { value: 0.1, mods: [{ type: 'noise', mode: 'add', depth: 0.1, params: { freq: 1, octaves: 1 }, seed: 1 }] }; return { id: fxc(p).stack[0].id, path: ['params', 'intra', 'rate'], index: 0 }; },
    pasteStack: (p) => ({ ownerId: v0(p).clips[1].id, effects: structuredClone(fxc(p).stack), replace: true }),
    savePreset: (p) => ({ name: 'my loop', stack: structuredClone(fxc(p).stack) }),
    deletePreset: (p) => { p.presets = [{ id: 'pr1', name: 'x', stack: [] }]; return { id: 'pr1' }; },
    addVectorStroke: (p) => ({ effectId: fxc(p).stack[0].id, stroke: { pts: [0.2, 0.5, 0.6, 0.5], r: 0.1, s: 0.01 } }),
    addMask: (p) => ({ clipId: fxc(p).id, mode: 'lock' }),
    addMaskStroke: (p) => ({ clipId: fxc(p).id, mode: 'include', stroke: { pts: [0.2, 0.3, 0.5, 0.6], r: 0.05 } }),
    removeMask: (p) => { fxc(p).masks = [{ id: 'mk1', mode: 'include', enabled: true, invert: false, feather: 0.02, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, shapes: [] }]; return { id: 'mk1' }; },
    addMarker: { frame: 42, hit: true },
    moveMarker: (p) => { p.sequences[0].markers.push({ id: 'mk', frame: 5, color: 'yellow', note: '', hit: false }); return { id: 'mk', frame: 99 }; },
    deleteMarker: (p) => { p.sequences[0].markers.push({ id: 'mk', frame: 5, color: 'yellow', note: '', hit: false }); return { id: 'mk' }; },
    setExportRange: { range: { in: 10, out: 90 } },
  };
  assert.deepEqual(Object.keys(cases).sort(), Object.keys(COMMANDS).sort(), 'a case per command');
  for (const [name, args] of Object.entries(cases)) roundTrip(name, args);
});

test('overwrite: a dropped clip trims, splits or removes what it covers', () => {
  const { p } = roundTrip('addClip', (p) => ({ channelId: p.sequences[0].channels[0].id, clip: createMediaClip('med', { in: 20, out: 40 }) }));
  assert.equal(ids(p)[0], '0-20 20-40 40-100 100-200');
  const right = p.sequences[0].channels[0].clips[2];
  assert.equal(right.sourceIn, 40, 'right part keeps showing the same source frames');
  const { p: q } = roundTrip('addClip', (p) => ({ channelId: p.sequences[0].channels[0].id, clip: createMediaClip('med', { in: 90, out: 250 }) }));
  assert.equal(ids(q)[0], '0-90 90-250'); assert.equal(q.sequences[0].durationFrames, 250);
});

test('keyframes stay put in sequence time through split, trim and overwrite; moves carry them', () => {
  const val = (k, path, abs) => resolve(path.reduce((o, x) => o[x], k), abs - k.range.in);
  const p = sample(), tl = createTimeline(p), v = p.sequences[0].channels[0], fx = p.sequences[0].channels[1];
  const opBefore = Array.from({ length: 100 }, (_, f) => val(v.clips[0], ['transform', 'opacity'], f));
  const bloomBefore = Array.from({ length: 100 }, (_, i) => val(fx.clips[0], ['stack', 0, 'params', 'bloom', 'repeat'], 50 + i));
  tl.exec('splitClips', { frame: 30 }); tl.exec('trimClip', { id: v.clips[1].id, edge: 'in', frame: 35 }); tl.exec('splitClips', { frame: 90 });
  const at = (ch, f) => ch.clips.find((k) => k.range.in <= f && f < k.range.out);
  for (let f = 0; f < 100; f++) { const k = at(v, f); if (k) assert.equal(val(k, ['transform', 'opacity'], f), opBefore[f], `opacity at ${f}`); }
  for (let f = 50; f < 150; f++) assert.equal(val(at(fx, f), ['stack', 0, 'params', 'bloom', 'repeat'], f), bloomBefore[f - 50], `bloom at ${f}`);
  const second = at(fx, 120); assert.deepEqual(second.stack[0].params.bloom.hits, [5 - 40, 70 - 40], 'hits are clip-relative');
  assert.notEqual(second.stack[0].id, at(fx, 60).stack[0].id, 'split gives fresh effect ids'); assert.equal(second.stack[0].seed, at(fx, 60).stack[0].seed, 'same seed');
  tl.exec('moveClips', { ids: [second.id], delta: 200 });
  assert.equal(val(second, ['stack', 0, 'params', 'bloom', 'repeat'], 320), bloomBefore[70]);
  assert.equal(at(v, 37).range.in, 35); assert.equal(at(v, 37).sourceIn, 35, 'trimmed in-point advanced the source');
});

test('trim clamps to neighbours, the source start and end, and one frame', () => {
  const p = sample(), tl = createTimeline(p), [a, b] = p.sequences[0].channels[0].clips;
  assert.equal(tl.exec('trimClip', { id: b.id, edge: 'in', frame: 10 }), 100, 'cannot cross the previous clip');
  assert.equal(tl.exec('trimClip', { id: a.id, edge: 'out', frame: 500 }), 100, 'cannot cross the next clip');
  assert.equal(tl.exec('trimClip', { id: b.id, edge: 'out', frame: 9999 }), 600, 'source has 600 frames, sourceIn 100 at frame 100');
  assert.equal(tl.exec('trimClip', { id: a.id, edge: 'out', frame: -5 }), 1, 'at least one frame');
  tl.exec('moveClips', { ids: [a.id], delta: 50 });
  assert.equal(tl.exec('trimClip', { id: a.id, edge: 'in', frame: 0 }), 50, 'cannot reveal frames before source start');
});

test('Bloom Insert: a held segment, ripple on every channel, effect clips grow, a hit marker', () => {
  const { p, r } = roundTrip('bloomInsert', (p) => ({ clipId: p.sequences[0].channels[0].clips[0].id, frame: 80, length: 24 }));
  assert.deepEqual(ids(p), ['0-80 80-104 104-124 124-224', '50-174', '0-224'], 'the audio clip stretches over the hold (M7) instead of leaving a gap');
  assert.deepEqual(p.sequences[0].channels[2].clips[0].stretch, [{ at: 80, len: 24, span: 24 }]);
  const hold = p.sequences[0].channels[0].clips[1];
  assert.equal(hold.id, r); assert.equal(hold.hold, true); assert.equal(hold.sourceIn, 80);
  assert.equal(p.sequences[0].channels[0].clips[2].sourceIn, 80, 'the clip continues where it was held');
  const fx = p.sequences[0].channels[1].clips[0].stack[0].params.bloom;
  assert.deepEqual(fx.hits, [5, 94], 'hits after the insert move with it'); assert.deepEqual(fx.repeat.keys.map((k) => k.frame), [0, 104]);
  assert.deepEqual(p.sequences[0].markers.map((m) => [m.frame, m.hit, m.hold]), [[80, true, 24]]);
  assert.equal(p.sequences[0].durationFrames, 224);
});

test('stacks copy with fresh ids and keep their values; presets drop inputs and survive save and load', () => {
  const p = sample(), tl = createTimeline(p), [v] = p.sequences[0].channels, src = p.sequences[0].channels[1].clips[0].stack;
  src[0].inputs = { source2: { channel: v.id } };
  const ids = tl.exec('pasteStack', { ownerId: v.clips[1].id, effects: structuredClone(src) });
  assert.equal(ids.length, 1); assert.notEqual(ids[0], src[0].id); assert.deepEqual(v.clips[1].stack[0].params, src[0].params);
  const pid = tl.exec('savePreset', { name: 'mine', stack: src });
  assert.equal(p.presets[0].id, pid); assert.equal(p.presets[0].stack[0].inputs, undefined); assert.notEqual(p.presets[0].stack[0].id, src[0].id);
  assert.deepEqual(validate(p), []);
  p.presets[0].stack[0].params.warp.sampling = 'cubic'; assert.ok(validate(p).some((e) => /presets\[0\]/.test(e.path)), 'preset stacks are validated');
  assert.throws(() => tl.exec('savePreset', { name: '', stack: [] }), /needs a name/);
});

test('Mosh Cut: an effect clip across the join, one frame of A, on a free effect channel above', () => {
  const { p, r } = roundTrip('moshCut', (p) => ({ channelId: p.sequences[0].channels[0].id, frame: 100 }));
  const seq = p.sequences[0], ch = seq.channels[1];
  assert.equal(ch.kind, 'effect'); assert.equal(ch.name, 'FX2', 'FX1 is busy over the range, so a new channel goes right above V1');
  const k = ch.clips[0]; assert.equal(k.id, r); assert.deepEqual(k.range, { in: 99, out: 160 }); assert.equal(k.role, 'moshCut');
  assert.equal(k.stack[0].type, 'moshLoop'); assert.equal(k.stack[0].params.residual.mode, 'codec', 'Xvid classic');
  const q = sample(), tl = createTimeline(q), v = q.sequences[0].channels[0];
  q.sequences[0].channels[1].clips.length = 0;
  tl.exec('moshCut', { channelId: v.id, frame: 100, length: 30, pre: 3 });
  assert.deepEqual(q.sequences[0].channels[1].clips[0].range, { in: 97, out: 130 }, 'the empty FX1 is used');
  assert.throws(() => tl.exec('moshCut', { channelId: v.id, frame: 50 }), /no join at frame 50/);
});

test('refused commands change nothing: locks, wrong channel kind, invalid values, bad keys', () => {
  const p = sample(), tl = createTimeline(p), before = S(p), [v, fx] = p.sequences[0].channels;
  tl.exec('setValue', { id: v.id, path: ['locked'], value: true }); const locked = S(p);
  for (const [name, args, re] of [
    ['moveClips', { ids: [v.clips[0].id], delta: 5 }, /locked/],
    ['splitClips', { frame: 50, ids: [v.clips[0].id] }, null],
    ['moveClips', { ids: [fx.clips[0].id], channelDelta: -1 }, /locked|on a video channel/],
    ['moveClips', { ids: [fx.clips[0].id], channelDelta: 1 }, /effect clip on a audio channel/],
    ['moveClips', { ids: [fx.clips[0].id], delta: -60 }, /before the sequence start/],
    ['setValue', { id: fx.clips[0].stack[0].id, path: ['params', 'warp', 'sampling'], value: 'cubic' }, /left the project invalid/],
    ['setValue', { id: fx.clips[0].id, path: ['range'], value: { in: 0, out: 1 } }, /not set directly/],
    ['setValue', { id: fx.clips[0].stack[0].id, path: ['params', 'bloom', 'repeat'], value: 3 }, /give a frame/],
    ['moveKey', { id: fx.clips[0].stack[0].id, path: ['params', 'bloom', 'repeat'], from: 50, to: 130 }, /already sits/],
    ['deleteKey', { id: fx.clips[0].stack[0].id, path: ['params', 'bloom', 'repeat'], at: 51 }, /no key/],
    ['addEffect', { ownerId: fx.clips[0].stack[0].id, type: 'echo' }, null],
    ['addEffect', { ownerId: p.sequences[0].channels[2].clips[0].id, type: 'echo' }, /cannot hold effects/],
    ['bloomInsert', { clipId: fx.clips[0].id, frame: 60, length: 5 }, /needs a media clip/],
  ]) {
    if (re) assert.throws(() => tl.exec(name, args), re, name); else try { tl.exec(name, args); } catch (e) { /* allowed */ }
    if (name !== 'addEffect' || re) assert.equal(S(p), locked, `${name} left a trace`);
    else { tl.undo(); assert.equal(S(p), locked); }
  }
  assert.equal(tl.exec('splitClips', { frame: 50 }).length, 1, 'locked V1 is skipped, FX1 starts at 50, A1 splits');
  tl.undo(); tl.undo(); assert.equal(S(p), before);
});

test('slider drags merge into one step; transactions group; seal ends a merge', () => {
  const p = sample(), tl = createTimeline(p), e = p.sequences[0].channels[1].clips[0].stack[0], before = S(p);
  for (const g of [0.1, 0.2, 0.3, 0.4]) tl.exec('setValue', { id: e.id, path: ['params', 'residual', 'gain'], value: g }, { merge: 'gain' });
  assert.equal(tl.depth, 1); assert.equal(e.params.residual.gain, 0.4);
  tl.seal(); tl.exec('setValue', { id: e.id, path: ['params', 'residual', 'gain'], value: 0.9 }, { merge: 'gain' }); assert.equal(tl.depth, 2);
  tl.undo(); tl.undo(); assert.equal(S(p), before);
  const ch = p.sequences[0].channels[0];
  tl.transaction('Split and delete', () => { const [r] = tl.exec('splitClips', { frame: 40, ids: [ch.clips[0].id] }); tl.exec('deleteClips', { ids: [r] }); });
  assert.equal(tl.depth, 1); assert.equal(tl.undoLabel, 'Split and delete'); assert.equal(ids(p)[0], '0-40 100-200');
  tl.undo(); assert.equal(S(p), before);
  assert.throws(() => tl.transaction('half', () => { tl.exec('splitClips', { frame: 40 }); tl.exec('deleteClips', { ids: ['nope'] }); }), /no clip nope/);
  assert.equal(S(p), before, 'a failed transaction rolls back entirely'); assert.equal(tl.depth, 0);
});

test('selection: replace, toggle, range, marquee; deleted clips leave it', () => {
  const p = sample(), tl = createTimeline(p), [v, fx, a] = p.sequences[0].channels;
  tl.select(v.clips[0].id); tl.select(fx.clips[0].id, 'toggle'); assert.equal(tl.selection.size, 2);
  tl.select(fx.clips[0].id, 'toggle'); assert.deepEqual([...tl.selection], [v.clips[0].id]);
  tl.selectRange(v.clips[0].id, fx.clips[0].id); assert.deepEqual(new Set(tl.selection), new Set([v.clips[0].id, v.clips[1].id, fx.clips[0].id]));
  tl.marquee({ channels: [1, 2], in: 160, out: 170 }); assert.deepEqual([...tl.selection], [a.clips[0].id]);
  tl.select(v.clips[0].id, 'add'); tl.exec('deleteClips', { ids: [v.clips[0].id] }); assert.deepEqual([...tl.selection], [a.clips[0].id]);
  const dup = tl.duplicate([fx.clips[0].id]); assert.equal(ids(p)[1], '50-150 150-250'); assert.notEqual(dup[0], fx.clips[0].id);
});

test('snapping: edges, markers, playhead, keyframes; excluded clips do not attract themselves', () => {
  const p = sample(), seq = p.sequences[0]; seq.markers.push({ id: 'mk', frame: 77, color: 'red', note: '', hit: true });
  const pts = snapPoints(seq, { playhead: 123 });
  for (const f of [0, 50, 100, 150, 200, 77, 123, 10, 60, 130]) assert.ok(pts.includes(f), `has ${f}`);
  assert.deepEqual(snap(74, pts, 4), { frame: 77, snapped: true }); assert.deepEqual(snap(88, pts, 4), { frame: 88, snapped: false });
  const fx = seq.channels[1].clips[0], ex = snapPoints(seq, { exclude: [fx.id] });
  assert.ok(!ex.includes(130) && !ex.includes(150) && ex.includes(100));
  assert.deepEqual(snapDelta([fx.range], 48, ex, 5), { delta: 50, snapped: true }, 'in-point 98 snaps to the clip edge at 100');
});

test('fuzz: 400 random commands undo back to the original bytes and redo to the final bytes', () => {
  let seed = 12345; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32), pick = (a) => a[Math.floor(rnd() * a.length)], int = (n) => Math.floor(rnd() * n);
  const p = sample(), tl = createTimeline(p), snaps = [S(p)];
  let ok = 0, refused = 0;
  for (let i = 0; i < 400; i++) {
    const seq = p.sequences[0], clips = seq.channels.flatMap((c) => c.clips), ix = indexProject(p);
    const effects = [...ix.values()].filter((v) => v.kind === 'effect').map((v) => v.obj), k = pick(clips), e = pick(effects), end = Math.max(1, seq.durationFrames);
    const anim = effects.find((x) => x.params.bloom?.repeat?.keys);
    const gen = [
      () => ['addClip', { channelId: seq.channels[0].id, clip: createMediaClip('med', { in: int(end), out: 0 }, { sourceIn: int(50) }) }],
      () => ['moveClips', { ids: [k?.id], delta: int(60) - 30, channelDelta: int(3) - 1 }],
      () => ['trimClip', { id: k?.id, edge: pick(['in', 'out']), frame: int(end + 50) }],
      () => ['splitClips', { frame: int(end) }],
      () => ['deleteClips', { ids: [k?.id] }],
      () => ['pasteClips', { items: tl.copyClips([k?.id]), frame: int(end) }],
      () => ['bloomInsert', { clipId: k?.id, frame: k ? k.range.in + int(len(k)) : 0, length: 1 + int(20) }],
      () => ['addEffect', { ownerId: k?.id, type: pick(['echo', 'rgbsplit', 'moshLoop', 'dct']) }],
      () => ['removeEffect', { id: e?.id }],
      () => ['setValue', { id: e?.id, path: ['enabled'], value: rnd() < 0.5 }],
      () => ['setKey', { id: anim?.id, path: ['params', 'bloom', 'repeat'], at: int(end), value: int(60) }],
      () => ['deleteKey', { id: anim?.id, path: ['params', 'bloom', 'repeat'], at: int(end) }],
      () => ['addMarker', { frame: int(end), hit: rnd() < 0.5 }],
      () => ['moveChannel', { id: pick(seq.channels).id, index: int(seq.channels.length) }],
      () => ['setValue', { id: pick(seq.channels).id, path: ['locked'], value: rnd() < 0.15 }],
    ];
    const [name, args] = pick(gen)();
    if (name === 'addClip') args.clip.range.out = args.clip.range.in + 1 + int(80);
    const depth = tl.depth, before = S(p);
    try { tl.exec(name, args); ok++; } catch (err) { refused++; assert.equal(S(p), before, `${name} refused but changed the project: ${err.message}`); }
    if (tl.depth > depth) snaps.push(S(p)); else assert.equal(S(p), snaps[snaps.length - 1], `${name} changed bytes without an undo step`);
  }
  assert.ok(ok > 200, `${ok} applied, ${refused} refused`);
  const final = S(p);
  for (let j = snaps.length - 1; j > 0; j--) { assert.equal(S(p), snaps[j]); assert.ok(tl.undo()); }
  assert.equal(S(p), snaps[0], 'undo all'); assert.equal(tl.canUndo, false);
  while (tl.redo()); assert.equal(S(p), final, 'redo all');
});
const len = (k) => k.range.out - k.range.in;
