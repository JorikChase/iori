// M5 step 1: the project model — factories, validation, migrations, canonical .mosh text, autosave.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createProject, createEffect, createMediaClip, createEffectClip, createAudioClip, createMarker, fromConfig, mediaFromLibrary,
  validate, load, save, stringify, migrate, normalize, toRational, secondsToFrame, frameToSeconds, sequenceEnd,
  createAutosave, EFFECTS, SCHEMA_ID, FORMAT, ProjectError, toMoshID, fromMoshID,
} from '../project.js';
import { PRESETS, LEGACY, normalize as loopNormalize } from '../config.js';
import { resolveAll } from '../params.js';

const entry = { id: 'abcdef0123456789', name: 'cut.mp4', info: { codec: 'avc1', w: 1280, h: 720, duration: 10, fps: 29.97, frames: 300, audio: 'mp4a 48000 Hz ×2' } };
function sample() {
  const m = mediaFromLibrary(entry), p = fromConfig(PRESETS['Xvid classic'], { media: m });
  const seq = p.sequences[0];
  seq.channels[0].clips.push(createMediaClip(m.id, { in: 300, out: 420 }, { sourceIn: 30 }));
  seq.channels[2].clips.push(createAudioClip(m.id, { in: 0, out: 300 }));
  seq.channels[1].clips[0].stack[0].params.bloom.repeat = { keys: [{ frame: 0, value: 0, interp: 'hold' }, { frame: 60, value: 24, interp: 'linear' }] };
  seq.markers.push(createMarker(90, { hit: true }));
  return p;
}
const paths = (errs) => errs.map((e) => e.path + ' ' + e.msg).join('\n');

test('a new project and a one-clip project from a preset are valid', () => {
  const p = createProject();
  assert.equal(p.schema, SCHEMA_ID); assert.equal(p.format, FORMAT);
  assert.deepEqual(p.sequences[0].channels.map((c) => `${c.name}:${c.kind}`), ['V1:video', 'FX1:effect', 'A1:audio']);
  assert.deepEqual(validate(p), []);
  const q = sample(); assert.deepEqual(validate(q), [], paths(validate(q)));
  assert.deepEqual(q.media[0].fps, { num: 30000, den: 1001 }); assert.equal(q.media[0].hasAudio, true);
  assert.equal(sequenceEnd(q.sequences[0]), 420);
});

test('every style and legacy preset becomes a valid Mosh Loop instance that resolves back to the preset', () => {
  for (const [name, cfg] of Object.entries({ ...PRESETS, ...LEGACY })) {
    const p = fromConfig(cfg, { frames: 48 }), e = p.sequences[0].channels[1].clips[0].stack[0];
    assert.deepEqual(validate(p), [], `${name}\n${paths(validate(p))}`);
    assert.deepEqual({ ...resolveAll(e.params, 10), seed: e.seed }, resolveAll(loopNormalize(cfg), 10), name);   // reactive presets carry modulators
  }
});

test('every registered effect type has defaults that validate', () => {
  const p = createProject(), k = createMediaClip('x', { in: 0, out: 10 });
  p.media.push({ ...mediaFromLibrary(entry), id: 'x' });
  k.stack = Object.keys(EFFECTS).map((t) => createEffect(t));
  p.sequences[0].channels[0].clips.push(k);
  assert.deepEqual(validate(p), [], paths(validate(p)));
});

test('validation catches structural errors with a path', () => {
  const cases = [
    ['duplicate id', (p) => { p.sequences[0].channels[0].clips[1].id = p.sequences[0].channels[0].clips[0].id; }, /duplicate id/],
    ['float frame', (p) => { p.sequences[0].channels[0].clips[1].range.out = 420.5; }, /bad range/],
    ['empty range', (p) => { const r = p.sequences[0].channels[0].clips[1].range; r.out = r.in; }, /bad range/],
    ['overlap', (p) => { p.sequences[0].channels[0].clips[1].range.in = 299; }, /overlaps/],
    ['out of order', (p) => { p.sequences[0].channels[0].clips.reverse(); }, /overlaps or is out of order/],
    ['wrong channel', (p) => { p.sequences[0].channels[1].clips.push(createMediaClip(p.media[0].id, { in: 500, out: 510 })); }, /media clip on a effect channel/],
    ['dangling media', (p) => { p.sequences[0].channels[0].clips[0].mediaId = 'nope'; }, /no media nope/],
    ['dangling input', (p) => { p.sequences[0].channels[1].clips[0].stack[0].inputs = { source2: { channel: 'nope' } }; }, /unresolved/],
    ['active sequence', (p) => { p.activeSequence = 'nope'; }, /no sequence/],
    ['unknown effect', (p) => { p.sequences[0].channels[1].clips[0].stack[0].type = 'nope'; }, /unknown effect type/],
    ['bad select', (p) => { p.sequences[0].channels[1].clips[0].stack[0].params.warp.sampling = 'cubic'; }, /bad value "cubic" \(one of nearest, bilinear\)/],
    ['bad number', (p) => { p.sequences[0].channels[1].clips[0].stack[0].params.estimate.search = NaN; }, /bad value/],
    ['unknown param', (p) => { p.sequences[0].channels[1].clips[0].stack[0].params.warp.wobble = 1; }, /unknown parameter/],
    ['unknown op', (p) => { p.sequences[0].channels[1].clips[0].stack[0].params.ops.push({ op: 'nope' }); }, /unknown op/],
    ['keys out of order', (p) => { p.sequences[0].channels[1].clips[0].stack[0].params.bloom.repeat.keys.reverse(); }, /increasing/],
    ['bad interp', (p) => { p.sequences[0].channels[1].clips[0].stack[0].params.bloom.repeat.keys[0].interp = 'bounce'; }, /bad interp/],
    ['modulator on a select', (p) => { p.sequences[0].channels[1].clips[0].stack[0].params.warp.sampling = { value: 'nearest', mods: [{ type: 'lfo', mode: 'add', depth: 1, params: {} }] }; }, /numeric parameter/],
    ['bad transform', (p) => { p.sequences[0].channels[0].clips[0].transform.blend = 'overlay'; }, /transform\.blend/],
    ['bad reset', (p) => { p.sequences[0].channels[1].clips[0].reset = 'never'; }, /bad reset/],
    ['bad timebase', (p) => { p.sequences[0].timebase = { num: 29.97, den: 1 }; }, /timebase/],
    ['bad marker', (p) => { p.sequences[0].markers[0].frame = -1; }, /bad frame/],
  ];
  for (const [name, mutate, re] of cases) {
    const p = sample(); mutate(p);
    const errs = validate(p); assert.ok(errs.some((e) => re.test(e.path + ' ' + e.msg)), `${name}: ${paths(errs) || 'no errors'}`);
  }
});

test('.mosh round trip: canonical text, stable bytes, save does not touch the project', () => {
  const p = sample(), before = stringify(p);
  const text = save(p, { now: '2026-10-09T12:00:00.000Z' });
  assert.equal(stringify(p), before, 'save must not mutate');
  const q = load(text);
  assert.equal(q.modified, '2026-10-09T12:00:00.000Z');
  assert.equal(save(q, { now: null }), text, 'load then save is byte-identical');
  // key order in the input does not matter
  const rev = (v) => (Array.isArray(v) ? v.map(rev) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).reverse().map((k) => [k, rev(v[k])])) : v);
  assert.equal(save(load(JSON.stringify(rev(JSON.parse(text)))), { now: null }), text);
  assert.throws(() => load({ ...JSON.parse(text), sequences: [{ id: 's' }] }), (e) => e instanceof ProjectError && /channels and clips must be arrays/.test(e.message));
});

test('load fills missing optional fields and params from the defaults, and keeps present values', () => {
  const p = sample(), doc = JSON.parse(save(p, { now: null }));
  const fx = doc.sequences[0].channels[1].clips[0], loop = fx.stack[0];
  delete doc.ui; delete fx.warmup; delete loop.enabled; delete loop.params.intra; delete loop.params.estimate.search;
  delete doc.sequences[0].channels[0].clips[0].transform.opacity;
  const q = load(doc);
  assert.equal(q.sequences[0].channels[1].clips[0].warmup, 0);
  assert.equal(q.sequences[0].channels[1].clips[0].stack[0].enabled, true);
  assert.deepEqual(q.sequences[0].channels[1].clips[0].stack[0].params.intra, loopNormalize({}).intra);
  assert.equal(q.sequences[0].channels[1].clips[0].stack[0].params.estimate.search, 16);
  assert.equal(q.sequences[0].channels[0].clips[0].transform.opacity, 1);
  assert.deepEqual(q.sequences[0].channels[1].clips[0].stack[0].params.bloom.repeat, p.sequences[0].channels[1].clips[0].stack[0].params.bloom.repeat, 'animatable kept');
  assert.equal(q.sequences[0].channels[1].clips[0].stack[0].params.residual.mode, 'codec', 'preset value kept');
});

test('load refuses non-projects, newer formats and invalid documents', () => {
  assert.throws(() => load('{nope'), /not JSON/);
  assert.throws(() => load({ schema: 'something.else' }), /not a MOSHINE project/);
  const doc = JSON.parse(save(sample(), { now: null }));
  assert.throws(() => load({ ...doc, format: FORMAT + 1 }), /newer MOSHINE/);
  doc.sequences[0].channels[0].clips[0].mediaId = 'gone';
  assert.throws(() => load(doc), (e) => e instanceof ProjectError && e.errors.length === 1 && /no media gone/.test(e.message));
});

test('migrations run in order, per format and per effect version', () => {
  const doc = JSON.parse(save(sample(), { now: null }));
  doc.format = 1; doc.sequences[0].channels[1].clips[0].stack[0].version = 1;
  const seen = [];
  const migrations = { 1: (d) => { seen.push('f1'); d.renamed = d.name; return d; }, 2: (d) => { seen.push('f2'); delete d.renamed; d.name += ' (v3)'; } };
  const effects = { ...EFFECTS, moshLoop: { ...EFFECTS.moshLoop, version: 3 } };
  const effectMigrations = { moshLoop: { 1: (p) => { seen.push('e1'); p.block = 8; return p; }, 2: (p) => { seen.push('e2'); p.block *= 2; } } };
  const out = migrate(doc, { migrations, effectMigrations, effects, format: 3 });
  assert.deepEqual(seen, ['f1', 'f2', 'e1', 'e2']);
  assert.equal(out.format, 3); assert.equal(out.name, 'cut.mp4 (v3)'); assert.equal(out.sequences[0].channels[1].clips[0].stack[0].params.block, 16);
  assert.throws(() => migrate({ ...doc, format: 1 }, { migrations: {}, format: 2 }), /no migration from format 1/);
  const d2 = JSON.parse(save(sample(), { now: null })); d2.sequences[0].channels[1].clips[0].stack[0].version = 9;
  assert.throws(() => migrate(d2), /newer than this MOSHINE/);
  assert.equal(normalize(migrate(JSON.parse(save(sample(), { now: null })))).format, FORMAT, 'current format is a no-op');
});

test('rational time: NTSC snaps, integers stay integers, frames and seconds agree', () => {
  assert.deepEqual(toRational(29.97002997), { num: 30000, den: 1001 });
  assert.deepEqual(toRational(23.976), { num: 24000, den: 1001 });
  assert.deepEqual(toRational(25.0004), { num: 25, den: 1 });
  assert.deepEqual(toRational(12.5), { num: 12500, den: 1000 });
  const tb = { num: 30000, den: 1001 };
  for (const f of [0, 1, 299, 107892]) assert.equal(secondsToFrame(frameToSeconds(f, tb), tb), f);
});

test('autosave debounces, never overlaps saves, and saves the latest state', async () => {
  let now = 0; const q = [];
  const timers = { setTimeout: (fn, ms) => { const t = { fn, at: now + ms }; q.push(t); return t; }, clearTimeout: (t) => { const i = q.indexOf(t); if (i >= 0) q.splice(i, 1); } };
  const advance = async (ms) => { now += ms; for (const t of q.filter((t) => t.at <= now)) { q.splice(q.indexOf(t), 1); await t.fn(); } };
  const written = []; let inFlight = 0, maxInFlight = 0, release;
  const write = async (p, text) => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); await new Promise((r) => (release = r)); written.push(JSON.parse(text).name); inFlight--; };
  const a = createAutosave(write, { delay: 100, timers });
  const p = sample();
  p.name = 'one'; a.touch(p); await advance(50); p.name = 'two'; a.touch(p); await advance(60);
  assert.equal(inFlight, 0, 'debounced: nothing yet'); assert.equal(a.pending, true);
  const first = advance(50); await new Promise((r) => setImmediate(r));
  assert.equal(inFlight, 1);
  p.name = 'three'; a.touch(p); const second = advance(100);    // fires while the first save is still writing
  const tick = () => new Promise((r) => setImmediate(r));
  release(); await tick(); assert.equal(inFlight, 1, 'the queued save starts after the first ends');
  release(); await first; await second;
  assert.deepEqual(written, ['two', 'three']); assert.equal(maxInFlight, 1); assert.equal(a.saves, 2); assert.equal(a.pending, false);
  p.name = 'four'; a.touch(p); const f = a.flush(); await new Promise((r) => setImmediate(r)); release(); await f;
  assert.deepEqual(written, ['two', 'three', 'four']); assert.equal(q.length, 0);
});

test('project Mosh ID: compact, round-trips to the same bytes, refuses damage', async () => {
  const p = sample(), id = await toMoshID(p), q = await fromMoshID(id);
  assert.match(id, /^P1\.[A-Za-z0-9_-]+$/); assert.ok(id.length < stringify(p).length / 3, `${id.length} chars`);
  assert.equal(stringify(q), stringify({ ...p, ui: {} }));
  await assert.rejects(fromMoshID('P1.' + id.slice(3, 40)), /damaged|not JSON|invalid/);
  await assert.rejects(fromMoshID('xyz'), /not a project Mosh ID/);
});
