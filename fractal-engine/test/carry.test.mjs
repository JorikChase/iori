// What outlives a document when another replaces it (core/carry.js, app.js setDoc / setCollage):
// the sensed metric only for the same structure, a morph or a walk only while it is the one writing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { carry } from '../core/carry.js';
import { parse, normalize } from '../core/index.js';
import { mutate } from '../core/breed.js';

const BOX = 'fold.box 1 · fold.sphere .5 1 · scale 2.5 · +c ×12 bail=100';
const BULB = 'bulb 8 · +c ×10 bail=2';
// app.js docStructure for a formula
const structureOf = (t) => { const g = normalize(parse(t)); return JSON.stringify([g.slots.map((sl) => sl.map((o) => o.op)), g.schedule, g.iters, g.c || null]); };
// a metric as the sensing pass gives it for the box: its last op's parameter at index 2 (scale), the
// sphere fold's at 1
const boxSensed = () => ({ structure: structureOf(BOX), params: [{ oi: 1, key: 'rmin', pxPerUnit: 300 }, { oi: 2, key: 's', pxPerUnit: 120 }], lyap: { median: 0.5 } });

test('the metric is dropped for a document of another structure (the growArchive page error)', () => {
  const sensed = boxSensed();
  // the old metric read in the new document: the places it names are not there (the error the archive hit
  // right after a document switch — `ops[m.oi]` of an op the bulb does not have)
  assert.throws(() => mutate(normalize(parse(BULB)), sensed.params, new Set(), 50, Math.random), TypeError);
  const k = carry({ sensed, trans: null }, structureOf(BULB));
  assert.equal(k.sensed, null);
});

test('the metric is kept for the same structure (an edit, a morph frame, herding)', () => {
  const sensed = boxSensed();
  const k = carry({ sensed, trans: null }, structureOf('fold.box 1.2 · fold.sphere .4 1 · scale 2.7 · +c ×12 bail=100'));
  assert.equal(k.sensed, sensed);
  // and breeding with it works there
  const f = mutate(normalize(parse(BOX)), k.sensed.params, new Set(), 50, () => 0.3);
  assert.notEqual(f.slots[0][2].p.s, 2.5);
});

test('a metric measured for no known document is not carried', () => {
  assert.equal(carry({ sensed: { params: [] }, trans: null }, structureOf(BOX)).sensed, null);
  assert.equal(carry({ sensed: null, trans: null }, structureOf(BOX)).sensed, null);
});

test('a document set while a morph or walk runs wins (the morph overwrite)', () => {
  for (const kind of ['morph', 'walk']) {
    const trans = { kind, t0: 0, dur: 350 };
    assert.equal(carry({ sensed: null, trans }, 'x', false).trans, null, `${kind}: someone else's document stops it`);
    assert.equal(carry({ sensed: null, trans }, 'x', true).trans, trans, `${kind}: its own frames keep it`);
  }
});

test('a flow carries on through a document change (it only changes the mode)', () => {
  const trans = { kind: 'flow', t0: 0, dur: 380, then: 'push' };
  assert.equal(carry({ sensed: null, trans }, 'x', false).trans, trans);
});
