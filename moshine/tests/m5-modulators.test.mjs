// M5 step 5: modulators (pure functions of frame and clock), their commands, and modulated loops in the evaluator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODULATORS, modulate, modulatorDefaults, resolve, resolveAll, curve, DEFAULT_CLOCK } from '../params.js';
import { fromConfig, validate } from '../project.js';
import { createTimeline } from '../timeline.js';
import { createEvaluator, cpuBackend, clockOf } from '../sequence.js';
import { createLoopRef } from '../engine-ref.js';
import { PRESETS } from '../config.js';
import { fixture } from '../fixtures.js';
import { fnv1a, toHalfArray, fromHalfArray } from '../util.js';

const C30 = { fps: 30, seed: 0, hits: [] };
const lfo = (shape, extra = {}) => ({ ...modulatorDefaults('lfo'), params: { shape, rate: 1, phase: 0 }, ...extra });

test('lfo shapes over one cycle at 1 Hz, 30 fps; phase shifts', () => {
  const at = (shape, t, phase = 0) => MODULATORS.lfo.at({ shape, rate: 1, phase }, t, C30);
  assert.ok(Math.abs(at('sine', 7.5) - 1) < 1e-12); assert.ok(Math.abs(at('sine', 22.5) + 1) < 1e-12);
  assert.deepEqual([0, 7.5, 15, 22.5].map((t) => at('triangle', t)), [0, 1, 0, -1]);
  assert.deepEqual([0, 15, 29].map((t) => +at('saw', t).toFixed(4)), [-1, 0, 0.9333]);
  assert.deepEqual([0, 14, 15, 29].map((t) => at('square', t)), [1, 1, -1, -1]);
  assert.equal(at('triangle', 0, 0.25), 1);
  assert.equal(MODULATORS.lfo.at({ shape: 'sine', rate: 2, phase: 0 }, 3.75, C30), MODULATORS.lfo.at({ shape: 'sine', rate: 1, phase: 0 }, 7.5, C30), 'rate scales time');
});

test('noise and random hold: deterministic, in range, seeded; noise is smooth, random hold steps at its rate', () => {
  const N = (t, s = 5, o = 2) => MODULATORS.noise.at({ freq: 2, octaves: o }, t, C30, s), R = (t, s = 5) => MODULATORS.randomHold.at({ rate: 3 }, t, C30, s);
  const n = Array.from({ length: 300 }, (_, t) => N(t)), r = Array.from({ length: 300 }, (_, t) => R(t));
  assert.deepEqual(n, Array.from({ length: 300 }, (_, t) => N(t)), 'pure');
  assert.ok(n.every((x) => x >= -1 && x <= 1) && r.every((x) => x >= -1 && x <= 1));
  assert.ok(Math.max(...n) - Math.min(...n) > 0.5, 'it moves');
  assert.ok(n.every((x, i) => i === 0 || Math.abs(x - n[i - 1]) < 0.25), 'smooth at 2 Hz');
  for (let t = 0; t < 300; t++) if (t % 10) assert.equal(r[t], r[t - 1], `held within a period (t=${t})`);
  assert.notDeepEqual(n, Array.from({ length: 300 }, (_, t) => N(t, 6)), 'seed matters');
});

test('trigger envelope: every n, hits from the clock, manual frames; hold then decay', () => {
  const T = (p, t, c = C30) => MODULATORS.trigger.at({ hold: 1, decay: 0, ...p }, t, c);
  assert.deepEqual([0, 4, 5, 6, 10].map((t) => T({ source: 'every', n: 5 }, t)), [1, 0, 1, 0, 1]);
  assert.deepEqual([2, 3, 4, 5, 6, 7].map((t) => T({ source: 'hits', hold: 2, decay: 3 }, t, { ...C30, hits: [3] })), [0, 1, 1, 0.75, 0.5, 0.25]);
  assert.deepEqual([9, 10, 11, 20].map((t) => T({ source: 'manual', frames: [10, 20] }, t)), [0, 1, 0, 1]);
  assert.equal(T({ source: 'hits' }, 5), 0, 'no hits, no trigger');
});

test('modes, depth, clamp, order; non-numeric and unknown types pass through; keys then mods', () => {
  const up = { ...modulatorDefaults('trigger', { depth: 2 }), params: { source: 'manual', frames: [4], hold: 1, decay: 0 } };
  assert.equal(modulate(1, [up], 4), 3); assert.equal(modulate(1, [{ ...up, mode: 'multiply' }], 4), 3); assert.equal(modulate(1, [{ ...up, mode: 'replace' }], 4), 2);
  assert.equal(modulate(1, [{ ...up, clamp: [0, 2.5] }], 4), 2.5); assert.equal(modulate(1, [up], 5), 1);
  assert.equal(modulate(1, [up, { ...up, mode: 'multiply', depth: 1 }], 4), 6, 'in order: (1 + 2) * 2');
  assert.equal(modulate(1, [{ type: 'audio', mode: 'add', depth: 1, params: {} }, { ...up, enabled: false }], 4), 1);
  const v = { keys: [{ frame: 0, value: 0, interp: 'linear' }, { frame: 10, value: 10, interp: 'linear' }], mods: [up] };
  assert.equal(resolve(v, 4), 6); assert.equal(resolve({ value: 'x', mods: [up] }, 4), 'x');
  assert.deepEqual(resolveAll({ a: { value: 1, mods: [lfo('square', { depth: 0.5 })] }, b: [2] }, 0), { a: 1.5, b: [2] });
  const cv = curve(v, 0, 8); assert.deepEqual([...cv.base], [0, 1, 2, 3, 4, 5, 6, 7]); assert.equal(cv.value[4], 6);
  assert.equal(DEFAULT_CLOCK.fps, 30);
});

test('modulator commands: add turns a value animatable, remove restores it; validation checks shape', () => {
  const p = fromConfig(PRESETS['Pure smear'], { frames: 30 }), tl = createTimeline(p), e = p.sequences[0].channels[1].clips[0].stack[0], before = JSON.stringify(e.params);
  tl.exec('addModulator', { id: e.id, path: ['params', 'residual', 'gain'], mod: lfo('sine', { depth: 0.3, clamp: [0, 1] }) });
  assert.deepEqual(Object.keys(e.params.residual.gain).sort(), ['mods', 'value']);
  tl.exec('setValue', { id: e.id, path: ['params', 'residual', 'gain', 'mods', 0, 'depth'], value: 0.5 });
  tl.exec('removeModulator', { id: e.id, path: ['params', 'residual', 'gain'], index: 0 });
  assert.equal(e.params.residual.gain, 0); assert.equal(JSON.stringify(e.params), before);
  assert.throws(() => tl.exec('addModulator', { id: e.id, path: ['params', 'warp', 'sampling'], mod: lfo('sine') }), /numeric/);
  assert.throws(() => tl.exec('addModulator', { id: e.id, path: ['params', 'residual', 'gain'], mod: { ...lfo('sine'), clamp: [1, 0] } }), /left the project invalid/);
  assert.deepEqual(validate(p), []);
});

const W = 96, H = 64, pan = fixture('pan', { w: W, h: H, count: 48, block: 16 }), h16 = (a) => fromHalfArray(toHalfArray(a)), H32 = (a) => fnv1a(new Float32Array(a));
const ref = { id: 'pan', name: 'pan', hash: 'pan', kind: 'video', width: W, height: H, fps: { num: 30, den: 1 }, durationFrames: 48, hasAudio: false, storage: 'opfs' };
test('a modulated Mosh Loop renders like a bare loop given the same clock; hits reach trigger modulators', async () => {
  const p = fromConfig(PRESETS['Xvid classic'], { media: ref, frames: 30, width: W, height: H, timebase: { num: 30, den: 1 } }), tl = createTimeline(p);
  const seq = p.sequences[0], k = seq.channels[1].clips[0], e = k.stack[0];
  tl.exec('addModulator', { id: e.id, path: ['params', 'residual', 'gain'], mod: lfo('triangle', { depth: 0.5, clamp: [0, 1], params: { shape: 'triangle', rate: 2, phase: 0 } }) });
  tl.exec('addModulator', { id: e.id, path: ['params', 'reset', 'blocks'], mod: { ...modulatorDefaults('trigger', { mode: 'replace' }), params: { source: 'hits', hold: 1, decay: 0, n: 30, phase: 0 } } });
  tl.exec('addMarker', { frame: 14, hit: true });
  const ev = createEvaluator(p, cpuBackend({ w: W, h: H, sources: { pan: { w: W, h: H, frame: (i) => pan.frame(i) } } })), got = [];
  for (let t = 0; t < 24; t++) got.push(H32((await ev.render(t)).image));
  const clock = clockOf(seq, k, e.seed); assert.deepEqual(clock.hits, [14]);
  const L = createLoopRef({ w: W, h: H }, { ...e.params, seed: e.seed, clock, bloom: { ...e.params.bloom, hits: [{ at: 14, len: 0 }] } }); L.begin(0); const want = [];
  for (let t = 0; t < 24; t++) want.push(H32(L.step(t, { src: h16(pan.frame(t)) }).display));
  assert.deepEqual(got, want);
  assert.equal(got[14], H32(h16(pan.frame(14))), 'the hit drove reset.blocks to 1: a full refresh on the hit frame');
});
