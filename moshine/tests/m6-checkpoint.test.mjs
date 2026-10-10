// M6 step 1: Mosh Loop checkpoints on the CPU reference — restore, then step on, equals never having stopped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoopRef } from '../engine-ref.js';
import { PRESETS, LEGACY } from '../config.js';
import { fixture } from '../fixtures.js';
import { fnv1a, toHalfArray, fromHalfArray } from '../util.js';

const F = fixture('cut', { w: 96, h: 64, count: 60, block: 16 }), F2 = fixture('pan', { w: 96, h: 64, count: 60, block: 16 });
const h16 = (a) => fromHalfArray(toHalfArray(a)), H = (a) => fnv1a(new Float32Array(a));
const src = (t) => h16(F.frame(t)), src2 = (t) => h16(F2.frame(t));
const CASES = { 'Xvid classic': PRESETS['Xvid classic'], 'Bloom pulse': PRESETS['Bloom pulse'], 'Fluid (flow)': PRESETS['Fluid'], 'Packet loss': PRESETS['Packet loss'],
  'Soft deblocked (in-loop fx)': PRESETS['Soft deblocked'], 'Phantom Trail (post echo)': LEGACY['04 Phantom Trail'], 'Motion Hijack (source2)': LEGACY['06 Motion Hijack'], 'Healing GOP': PRESETS['Healing GOP'] };

function run(cfg, n, { at = -1, detour = 0, fresh = false } = {}) {
  let L = createLoopRef({ w: F.w, h: F.h }, cfg); L.begin(0); const out = []; let snap = null;
  for (let t = 0; t < n; t++) {
    out.push(H(L.step(t, { src: src(t), src2: src2(t) }).display));
    if (t === at) {
      snap = L.snapshot();
      for (let k = 1; k <= detour; k++) L.step(t + k, { src: src(t + k), src2: src2(t + k) });       // dirty every piece of state
      if (fresh) L = createLoopRef({ w: F.w, h: F.h }, cfg);
      L.restore(snap);
    }
  }
  return out;
}

test('restore then step equals an uninterrupted run, for every kind of loop state', () => {
  for (const [name, cfg] of Object.entries(CASES)) {
    const want = run(cfg, 40);
    assert.deepEqual(run(cfg, 40, { at: 25, detour: 7 }), want, `${name}: restore after a detour`);
    assert.deepEqual(run(cfg, 40, { at: 33, fresh: true }), want, `${name}: restore into a new loop`);
  }
});

test('checkpoints inside a bloom hold and right at a cut', () => {
  const cfg = { ...PRESETS['Xvid classic'], bloom: { ...PRESETS['Xvid classic'].bloom, repeat: 10, hits: [20] } }, want = run(cfg, 45);
  for (const at of [19, 20, 24, F.cut - 1, F.cut]) assert.deepEqual(run(cfg, 45, { at, detour: 5 }), want, `at ${at}`);
  assert.equal(createLoopRef({ w: F.w, h: F.h }, cfg).snapshot(), null, 'nothing to save before the first step');
});
