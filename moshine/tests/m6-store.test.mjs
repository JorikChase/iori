// M6 step 2: the evaluator's checkpoint store — seeks resume from the nearest valid checkpoint and land on the same
// pixels as a full replay; edits invalidate exactly the checkpoints they can affect; a budget evicts far ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEvaluator, cpuBackend } from '../sequence.js';
import { createProject, createMediaClip, createEffectClip, createEffect, transformDefaults } from '../project.js';
import { createTimeline } from '../timeline.js';
import { PRESETS } from '../config.js';
import { fixture } from '../fixtures.js';
import { fnv1a } from '../util.js';
import { memoryDiskCache, pack, unpack, encodeFile, decodeFile, cpuSerializer } from '../cache.js';

const W = 64, H = 48, N = 80, K = 8;
const fx = { pan: fixture('pan', { w: W, h: H, count: 200, block: 16 }), square: fixture('square', { w: W, h: H, count: 200, block: 16, size: 20, at: [10, 10] }) };
const ref = (id) => ({ id, name: id, hash: id, kind: 'video', width: W, height: H, fps: { num: 30, den: 1 }, durationFrames: 200, hasAudio: false, storage: 'opfs' });
const sources = Object.fromEntries(Object.keys(fx).map((id) => [id, { w: W, h: H, frame: (i) => fx[id].frame(i) }]));
const H32 = (a) => fnv1a(new Float32Array(a));

/** V1: pan [0,40) + pan from 120 [40,80); V2: square at 70 % with an echo; FX1: Xvid classic [0,80); FX2: a Mosh Cut at 40. */
function project() {
  const p = createProject({ width: W, height: H, timebase: { num: 30, den: 1 } }), s = p.sequences[0], tl = createTimeline(p);
  p.media.push(ref('pan'), ref('square'));
  tl.exec('addClip', { channelId: s.channels[0].id, clip: createMediaClip('pan', { in: 0, out: 40 }) });
  tl.exec('addClip', { channelId: s.channels[0].id, clip: createMediaClip('pan', { in: 40, out: 80 }, { sourceIn: 120 }) });
  const v2 = tl.exec('addChannel', { kind: 'video', index: 1 });
  const sq = createMediaClip('square', { in: 0, out: 80 }, { transform: { ...transformDefaults(), opacity: 0.7 } }); sq.stack.push(createEffect('echo', { params: { decay: 0.6 } }));
  tl.exec('addClip', { channelId: v2, clip: sq });
  const params = { ...PRESETS['Xvid classic'] }; delete params.seed;
  tl.exec('addClip', { channelId: s.channels[2].id, clip: createEffectClip({ in: 0, out: 80 }, { stack: [createEffect('moshLoop', { params })] }) });
  tl.exec('moshCut', { channelId: s.channels[0].id, frame: 40, length: 30 });
  return { p, tl };
}
const evalOf = (p, o = {}) => createEvaluator(p, cpuBackend({ w: W, h: H, sources }), { K, ...o });
const truth = async (p, t) => H32((await evalOf(p, { K: 1e9 }).render(t)).image);       // no checkpoints: replay from in-points

test('seeks resume from a checkpoint less than K frames back and land on the full-replay pixels', async () => {
  const { p } = project(), ev = evalOf(p), play = [];
  for (let t = 0; t < N; t++) play.push(H32((await ev.render(t)).image));
  const c = ev.cache(); assert.ok(c.frames.length >= 8 && c.frames.every((g) => g % K === 0), JSON.stringify(c.frames));
  for (const t of [70, 13, 55, 31, 79, 8, 47]) {
    const r = await ev.render(t);
    assert.equal(H32(r.image), play[t], `frame ${t}`); assert.ok(t - r.from < K, `frame ${t} replayed from ${r.from}`);
  }
  assert.equal(play[66], await truth(p, 66), 'playback = a cache-free replay');
});

test('an edit invalidates only the checkpoints it can affect', async () => {
  const { p, tl } = project(), ev = evalOf(p);
  for (let t = 0; t < N; t++) await ev.render(t);
  const V1 = p.sequences[0].channels[0];
  tl.exec('setValue', { id: V1.clips[1].id, path: ['sourceIn'], value: 150 });     // the media below FX1 changes from frame 40 on
  ev.invalidate();
  let r = await ev.render(30); assert.ok(30 - r.from < K, `before the edit: from ${r.from}`); assert.equal(H32(r.image), await truth(p, 30));
  r = await ev.render(60); assert.equal(r.from, 40, 'after the edit: back to the last unaffected checkpoint (and the Mosh Cut in-point)'); assert.equal(H32(r.image), await truth(p, 60));
  for (let t = 61; t < N; t++) await ev.render(t);
  tl.exec('addMarker', { frame: 65, hit: true }); ev.invalidate();
  r = await ev.render(72); assert.equal(r.from, 64, 'a hit at 65 leaves the checkpoint at 64 valid'); assert.equal(H32(r.image), await truth(p, 72));
  tl.exec('setValue', { id: p.sequences[0].channels[3].clips[0].stack[0].id, path: ['params', 'residual', 'gain'], value: 0.4 }); ev.invalidate();
  r = await ev.render(75); assert.equal(H32(r.image), await truth(p, 75), 'an effect edit above: its own checkpoints are void');
});

test('a small budget evicts the checkpoints farthest from the playhead; results stay exact', async () => {
  const { p } = project(), ev = evalOf(p, { budget: 3 * 2 * W * H * 16 * 4, adaptK: false });
  for (let t = 0; t < N; t++) await ev.render(t);
  await ev.settle();
  const c = ev.cache(); assert.ok(c.frames.length < 6, `${c.frames.length} kept`); assert.ok(c.frames.includes(72), 'the ones near the playhead stay');
  for (const t of [75, 20]) assert.equal(H32((await ev.render(t)).image), await truth(p, t), `frame ${t}`);
});

test('spill: GPU -> memory -> disk, and seeks restored from every tier land on the full-replay pixels', async () => {
  const { p } = project(), disk = memoryDiskCache(), one = 2 * W * H * 16 * 4;
  const ev = evalOf(p, { budget: 2 * one, cpuBudget: 3 * one, disk, adaptK: false });
  for (let t = 0; t < N; t++) await ev.render(t);
  await ev.settle();
  const c = ev.cache();
  assert.ok(c.tiers.gpu.length >= 1 && c.tiers.cpu.length >= 1 && c.tiers.disk.length >= 1, JSON.stringify(c.tiers));
  assert.equal(disk.files, c.tiers.disk.length); assert.ok(c.spills >= c.tiers.cpu.length + c.tiers.disk.length);
  for (const t of [c.tiers.disk[0] + 3, c.tiers.cpu[0] + 2, 77]) {
    const r = await ev.render(t); assert.equal(H32(r.image), await truth(p, t), `frame ${t}`); assert.ok(t - r.from < K, `frame ${t} from ${r.from}`);
  }
  await ev.settle(); assert.ok(ev.cache().loads >= 2, 'cold checkpoints were loaded back');
  await ev.destroy(); assert.equal(disk.files, 0, 'destroy removes the files');
});

test('the last tier evicting raises K (fewer, sparser checkpoints, never lossy)', async () => {
  const { p } = project(), disk = memoryDiskCache(), one = 2 * W * H * 16 * 4;
  const ev = evalOf(p, { budget: one, cpuBudget: one, disk, diskBudget: 2 * one });
  for (let t = 0; t < N; t++) await ev.render(t);
  await ev.settle(); const c = ev.cache();
  assert.ok(c.kRaises >= 1 && c.K > K, `K ${c.K}`); assert.equal(H32((await ev.render(70)).image), await truth(p, 70));
});

test('pack, file format and the CPU serializer round-trip', async () => {
  const snap = { a: 1, b: [new Float32Array([1, 2]), null, { c: new Uint16Array([3]) }], get bytes() { return 9; }, destroy() {} };
  const { tree, leaves } = pack(snap); assert.equal(leaves.length, 2); assert.deepEqual(Object.keys(tree), ['a', 'b']);
  assert.deepEqual(unpack(tree, leaves).b[2].c, new Uint16Array([3]));
  const f = decodeFile(encodeFile({ x: 1 }, [new Uint8Array([1, 2, 3]), new Uint8Array(0)])); assert.deepEqual(f.meta, { x: 1 }); assert.deepEqual([...f.chunks[0]], [1, 2, 3]);
  const back = cpuSerializer.deserialize(await cpuSerializer.serialize(snap)); assert.deepEqual(back.b[0], new Float32Array([1, 2])); assert.notEqual(back.b[0], snap.b[0]);
});

test('coverage: green near in-points and checkpoints, red where a seek replays more than K; seekCost predicts render', async () => {
  const { p, tl } = project(), ev = evalOf(p, { adaptK: false });
  const kinds = (c, f) => c.spans.find((s) => s.a <= f && f < s.b)?.kind;
  let c = ev.coverage();
  assert.equal(kinds(c, 3), 'green', 'within K of the first in-point'); assert.equal(kinds(c, 30), 'red'); assert.equal(kinds(c, 41), 'red', 'the Mosh Cut starts at 39, but FX1 below it has run since 0'); assert.equal(kinds(c, 60), 'red');
  for (let t = 0; t < N; t++) await ev.render(t);
  c = ev.coverage(); assert.ok(c.spans.every((s) => s.kind === 'green'), JSON.stringify(c.spans)); assert.equal(c.ticks.length, ev.cache().frames.length);
  ev.invalidate();
  for (const t of [70, 12, 44, 79]) { const want = ev.seekCost(t), r = await ev.render(t); assert.equal(r.from, want.from, `frame ${t}`); assert.equal(t - r.from + 1, want.cost); ev.invalidate(); }
  tl.exec('setValue', { id: p.sequences[0].channels[0].clips[1].id, path: ['sourceIn'], value: 150 }); ev.invalidate();
  c = ev.coverage();
  assert.equal(kinds(c, 30), 'green', 'before the edit: still cached'); assert.equal(kinds(c, 45), 'green', 'within K of the last valid checkpoint (40)'); assert.equal(kinds(c, 60), 'red', 'after it: void');
  assert.ok(c.ticks.some((t) => t.g === 56 && !t.ok) && c.ticks.some((t) => t.g === 32 && t.ok), 'ticks know which checkpoints are void');
});
