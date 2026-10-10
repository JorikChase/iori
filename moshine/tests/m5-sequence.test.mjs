// M5 step 3: the sequence evaluator on the CPU reference backend.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEvaluator, cpuBackend, placement, placeRef, blendRef, baseSize, layersAt, mediaIndex } from '../sequence.js';
import { fromConfig, createProject, createMediaClip, createEffectClip, createEffect, transformDefaults } from '../project.js';
import { createTimeline } from '../timeline.js';
import { createLoopRef } from '../engine-ref.js';
import { PRESETS } from '../config.js';
import { fixture } from '../fixtures.js';
import { fnv1a, toHalfArray, fromHalfArray } from '../util.js';

const W = 96, H = 64, N = 24;
const h16 = (a) => fromHalfArray(toHalfArray(a));
const fx = { pan: fixture('pan', { w: W, h: H, count: 48, block: 16 }), square: fixture('square', { w: W, h: H, count: 48, block: 16, size: 24, at: [20, 20] }) };
const ref = (id, f) => ({ id, name: id, hash: id, kind: 'video', width: W, height: H, fps: { num: 30, den: 1 }, durationFrames: f.count, hasAudio: false, storage: 'opfs' });
const sources = { pan: { w: W, h: H, frame: (i) => fx.pan.frame(i) }, square: { w: W, h: H, frame: (i) => fx.square.frame(i) } };
const H32 = (a) => fnv1a(new Float32Array(a));

/** One media clip of `pan` under one effect clip with the given loop config, sequence = fixture size. */
function oneClip(cfg = PRESETS['Xvid classic'], frames = N) {
  return fromConfig(cfg, { media: ref('pan', fx.pan), frames, width: W, height: H, timebase: { num: 30, den: 1 } });
}
const evalOf = (p) => createEvaluator(p, cpuBackend({ w: W, h: H, sources }));
async function playAll(p, n = N) { const ev = evalOf(p), out = []; for (let t = 0; t < n; t++) out.push(H32((await ev.render(t)).image)); return out; }
function bareLoop(cfg, n = N, t0 = 0, src = (t) => fx.pan.frame(t)) {
  const L = createLoopRef({ w: W, h: H }, cfg); L.begin(t0); const out = [];
  for (let t = t0; t < n; t++) out.push(H32(L.step(t, { src: h16(src(t)) }).display));
  return out;
}

test('placement: identity copies exactly; fit modes size the source; offsets leave transparency', () => {
  const src = h16(fx.pan.frame(3)), id = placement(transformDefaults(), { sw: W, sh: H, W, H });
  assert.equal(H32(placeRef(src, id)), H32(src));
  assert.deepEqual(baseSize('fit', 1920, 1080, 96, 64), [96, 54]); assert.deepEqual(baseSize('fill', 1920, 1080, 96, 64), [114, 64]);
  assert.deepEqual(baseSize('none', 40, 30, 96, 64, 0.5), [20, 15]); assert.deepEqual(baseSize('stretch', 40, 30, 96, 64), [96, 64]);
  const moved = placeRef(src, placement({ ...transformDefaults(), x: 0.5 }, { sw: W, sh: H, W, H }));
  assert.equal(moved[3], 0, 'left half is transparent'); assert.equal(moved[((H >> 1) * W + W - 1) * 4 + 3], 1);
  assert.equal(moved[((H >> 1) * W + W / 2) * 4], src[((H >> 1) * W) * 4], 'shifted by exactly half a width');
  const half = placeRef(src, placement({ ...transformDefaults(), scale: 0.5 }, { sw: W, sh: H, W, H }));
  assert.equal(half[3], 0); assert.equal(half[((H >> 1) * W + (W >> 1)) * 4 + 3], 1);
});

test('blend: normal at opacity 1 is the layer, 0 is the composite, modes and partial alpha', () => {
  const a = h16(fx.pan.frame(0)), b = h16(fx.square.frame(0));
  assert.equal(H32(blendRef(a, b, 1, 'normal')), H32(b)); assert.equal(H32(blendRef(a, b, 0, 'normal')), H32(a));
  const half = blendRef(a, b, 0.5, 'normal'); assert.ok(Math.abs(half[0] - (a[0] + b[0]) / 2) < 1e-6);
  assert.ok(Math.abs(blendRef(a, b, 1, 'difference')[4] - Math.abs(a[4] - b[4])) < 1e-3, 'mode results are rounded to half');
  assert.ok(Math.abs(blendRef(a, b, 1, 'screen')[1] - (1 - (1 - a[1]) * (1 - b[1]))) < 1e-3);
});

test('a one-clip project renders exactly what a bare Mosh Loop renders (M4 semantics)', async () => {
  for (const name of ['Xvid classic', 'Bloom pulse', 'Packet loss']) {
    assert.deepEqual(await playAll(oneClip(PRESETS[name])), bareLoop(PRESETS[name]), name);
  }
});

test('seeking replays from the effect clip in-point and lands on the same pixels as playback', async () => {
  const p = oneClip(), seq = await playAll(p), ev = evalOf(p);
  assert.equal(ev.replayStart(17), 0);
  const r = await ev.render(17); assert.equal(r.from, 0); assert.equal(H32(r.image), seq[17]);
  assert.equal((await ev.render(18)).from, 18, 'then playback steps');
  assert.equal(H32((await ev.render(9)).image), seq[9], 'seek backwards');
  ev.invalidate(); const r2 = await ev.render(10); assert.equal(r2.from, 0); assert.equal(H32(r2.image), seq[10]);
});

test('a split is a reset point; an edit forces a replay; moving a clip carries its mosh', async () => {
  const p = oneClip(), tl = createTimeline(p), fxCh = p.sequences[0].channels[1];
  tl.exec('splitClips', { frame: 12, ids: [fxCh.clips[0].id] });
  const ev = evalOf(p), r = await ev.render(20);
  assert.equal(r.from, 12, 'only the right part replays');
  const want = bareLoop(PRESETS['Xvid classic'], 21, 0, (t) => fx.pan.frame(t + 12));
  assert.equal(H32(r.image), want[8], 'the loop restarted at the split on the same source frames');
  // an edit changes the signature: the next render replays even without invalidate()
  tl.exec('setValue', { id: fxCh.clips[1].stack[0].id, path: ['params', 'residual', 'gain'], value: 0.5 });
  assert.equal((await ev.render(21)).from, 12);
  // move the right effect clip and its media together: same pixels, later
  const v = p.sequences[0].channels[0]; tl.exec('splitClips', { frame: 12, ids: [v.clips[0].id] });
  const before = H32((await ev.render(20)).image);
  tl.exec('moveClips', { ids: [fxCh.clips[1].id, v.clips[1].id], delta: 10 }); ev.invalidate();
  assert.equal(H32((await ev.render(30)).image), before);
});

test('warmup pre-rolls the loop before the in-point without showing it', async () => {
  const p = oneClip(PRESETS['Xvid classic'], 30), fxCh = p.sequences[0].channels[1], tl = createTimeline(p);
  tl.exec('trimClip', { id: fxCh.clips[0].id, edge: 'in', frame: 10 }); tl.exec('setValue', { id: fxCh.clips[0].id, path: ['warmup'], value: 4 });
  const ev = evalOf(p);
  assert.equal(H32((await ev.render(8)).image), H32(h16(fx.pan.frame(8))), 'pre-roll frames show the composite');
  const r = await ev.render(16); assert.equal(r.from, 6);
  const L = createLoopRef({ w: W, h: H }, PRESETS['Xvid classic']); L.begin(-4); let d;
  for (let t = -4; t <= 6; t++) d = L.step(t, { src: h16(fx.pan.frame(t + 10)) }).display;
  assert.equal(H32(r.image), H32(d), 'the loop started 4 frames early in clip time');
});

test('compositing: channels bottom-up, opacity, bypass and solo', async () => {
  const p = oneClip(PRESETS['Pure smear'], 10), seq = p.sequences[0], [v, fxc] = seq.channels, tl = createTimeline(p);
  p.media.push(ref('square', fx.square));
  tl.exec('addChannel', { kind: 'video', index: 1 }); const v2 = seq.channels[1];
  tl.exec('addClip', { channelId: v2.id, clip: createMediaClip('square', { in: 0, out: 10 }, { transform: { ...transformDefaults(), opacity: 0.5 } }) });
  assert.deepEqual(layersAt(seq, 3).map((l) => l.ch.name), ['V1', 'V2', 'FX1']);
  const ev = evalOf(p), mix = blendRef(h16(fx.pan.frame(0)), h16(fx.square.frame(0)), 0.5, 'normal');
  assert.equal(H32((await ev.render(0)).image), H32(h16(mix)), 'I-frame of the loop = the 50 % composite');
  tl.exec('setValue', { id: fxc.id, path: ['bypassed'], value: true }); ev.invalidate();
  assert.equal(H32((await ev.render(4)).image), H32(h16(blendRef(h16(fx.pan.frame(4)), h16(fx.square.frame(4)), 0.5, 'normal'))), 'bypassed effect channel');
  tl.exec('setValue', { id: v2.id, path: ['solo'], value: true });
  assert.equal(H32((await ev.render(4)).image), H32(h16(blendRef(new Float32Array(W * H * 4).map((_, i) => (i % 4 === 3 ? 1 : 0)), h16(fx.square.frame(4)), 0.5, 'normal'))), 'solo V2 over black');
});

test('clip stacks: an effect after the loop sees its field; a stateful effect replays like playback', async () => {
  const p = oneClip(PRESETS['Xvid classic'], 20), e = p.sequences[0].channels[1].clips[0], tl = createTimeline(p);
  tl.exec('addEffect', { ownerId: e.id, type: 'displace', params: { gain: 3 } });
  tl.exec('addEffect', { ownerId: e.id, type: 'echo', params: { decay: 0.7 } });
  const play = await playAll(p, 16), ev = evalOf(p);
  assert.equal(H32((await ev.render(15)).image), play[15]);
  assert.notEqual(play[15], (await playAll(oneClip(PRESETS['Xvid classic'], 20), 16))[15], 'the effects did something');
});

test('media index maps sequence frames to media frames across rates, holds and the clip end', () => {
  const m = { fps: { num: 24000, den: 1001 }, durationFrames: 100 }, tb = { num: 30000, den: 1001 };
  assert.equal(mediaIndex({ sourceIn: 0, hold: false }, 30, m, tb), 24);
  assert.equal(mediaIndex({ sourceIn: 10, hold: true }, 30, m, tb), 8);
  assert.equal(mediaIndex({ sourceIn: 0, hold: false }, 9999, m, tb), 99);
  assert.equal(mediaIndex({ sourceIn: 5, hold: false }, 7, { fps: tb }, tb), 12);
});

test('mosh hit markers trigger the bloom (with their own hold), bloom.markers opts out, moving one replays', async () => {
  const cfg = PRESETS['Xvid classic'], p = oneClip(cfg, 30), tl = createTimeline(p), loop = p.sequences[0].channels[1].clips[0].stack[0];
  const plain = await playAll(p, 24);
  tl.exec('addMarker', { frame: 10, hit: true, hold: 6 }); tl.exec('addMarker', { frame: 18, hit: false });
  const hit = await playAll(p, 24), want = bareLoop({ ...cfg, bloom: { ...cfg.bloom, hits: [{ at: 10, len: 6 }] } }, 24);
  assert.deepEqual(hit, want, 'the marker became a clip-local trigger');
  assert.deepEqual(hit.slice(0, 10), plain.slice(0, 10)); assert.notEqual(hit[13], plain[13], 'the field was held');
  const ev = evalOf(p); await ev.render(20);
  tl.exec('moveMarker', { id: p.sequences[0].markers[0].id, frame: 12 });
  assert.equal((await ev.render(21)).from, 0, 'a moved hit changes the loop: replay');
  tl.exec('setValue', { id: loop.id, path: ['params', 'bloom', 'markers'], value: false });
  assert.deepEqual(await playAll(p, 24), plain, 'bloom.markers off ignores hits');
});

test('Bloom Insert renders a frozen source under a frozen field, then the clip continues', async () => {
  const cfg = PRESETS['Xvid classic'], p = oneClip(cfg, 30), tl = createTimeline(p), v = p.sequences[0].channels[0];
  tl.exec('bloomInsert', { clipId: v.clips[0].id, frame: 12, length: 6 });
  const src = (t) => fx.pan.frame(t < 12 ? t : t < 18 ? 12 : t - 6);
  assert.deepEqual(await playAll(p, 30), bareLoop({ ...cfg, bloom: { ...cfg.bloom, hits: [{ at: 12, len: 6 }] } }, 30, 0, src));
});

test('Mosh Cut: the cut shows A\'s last frame, then B\'s motion moves A\'s picture', async () => {
  const p = createProject({ width: W, height: H, timebase: { num: 30, den: 1 } }), seq = p.sequences[0], tl = createTimeline(p);
  p.media.push(ref('pan', fx.pan), ref('square', fx.square));
  tl.exec('addClip', { channelId: seq.channels[0].id, clip: createMediaClip('pan', { in: 0, out: 20 }) });
  tl.exec('addClip', { channelId: seq.channels[0].id, clip: createMediaClip('square', { in: 20, out: 40 }) });
  tl.exec('moshCut', { channelId: seq.channels[0].id, frame: 20 });
  const play = await playAll(p, 40), src = (t) => (t < 20 ? fx.pan.frame(t) : fx.square.frame(t - 20));
  assert.equal(play[20], H32(h16(fx.pan.frame(19))), 'the cut is a dropped I-frame: A\'s last frame, unmoved');
  const L = createLoopRef({ w: W, h: H }, PRESETS['Xvid classic']); L.begin(0); const want = [];
  for (let t = 19; t < 40; t++) want.push(H32(L.step(t - 19, { src: h16(src(t)) }).display));
  assert.deepEqual(play.slice(19), want, 'one loop from A\'s last frame through B');
  assert.notEqual(play[30], H32(h16(fx.square.frame(10))), 'B is moshed, not shown');
  assert.equal(play[18], H32(h16(fx.pan.frame(18))), 'before the cut: clean');
});
