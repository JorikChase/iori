// The drivers' clock in a link and in a state file (core/state.js): written, read back, and old ones (no clock)
// still loading. Run: node --test fractal-engine/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stateDoc, plyComments, readPlyState, normClock, clockPart, parseClock } from '../core/state.js';
import { normalize, parse } from '../core/formula.js';

const F = normalize(parse('bulb 8 · +c ×10 bail=2'));
const CAM = { pos: [0, 0, -3], yaw: 0, pitch: 0 };
const ply = (doc) => new TextEncoder().encode(['ply', 'format ascii 1.0', ...plyComments(doc), 'end_header', ''].join('\n')).buffer;

test('the link: &t=time,playing,rate round trips; malformed or absent is none', () => {
  const c = { t: 12.3456, playing: false, rate: 2 };
  assert.equal(clockPart(c), '&t=12.346,0,2');
  assert.deepEqual(parseClock(clockPart(c).slice(3)), { t: 12.346, playing: false, rate: 2 });
  assert.deepEqual(parseClock('4.5'), { t: 4.5, playing: true, rate: 1 });
  assert.equal(parseClock(undefined), null);
  assert.equal(parseClock('x,1,2'), null);
  assert.equal(parseClock('3,1,7').rate, 1);   // a speed the controls do not have: ×1
  assert.equal(normClock({ t: -2 }).t, 0);
});

test('the state: the clock written and read back; a file from before it loads without one', () => {
  const doc = stateDoc({ formula: F, cam: CAM, clock: { t: 7.25, playing: false, rate: 0.5 } });
  assert.deepEqual(doc.clock, { t: 7.25, playing: false, rate: 0.5 });
  const back = readPlyState(ply(doc));
  assert.deepEqual(back.clock, { t: 7.25, playing: false, rate: 0.5 });
  const old = stateDoc({ formula: F, cam: CAM });
  assert.equal('clock' in old, false);
  assert.equal(readPlyState(ply(old)).clock, null);
  // a broken clock is dropped, the rest stands
  const bad = { ...old, clock: { t: 'soon' } };
  assert.equal(readPlyState(ply(bad)).clock, null);
});
