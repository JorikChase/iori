// R2: painted motion vectors — the per-block field, the Mosh Loop field op, and the command.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paintField } from '../vectors.js';
import { createLoopRef } from '../engine-ref.js';
import { normalize, opDefaults } from '../config.js';
import { fromConfig, validate } from '../project.js';
import { createTimeline } from '../timeline.js';
import { fixture } from '../fixtures.js';
import { toHalfArray, fromHalfArray } from '../util.js';

const stroke = { pts: [0.1, 0.5, 0.9, 0.5], r: 0.1, s: 0.02 };
const at = (P, bw, bx, by) => [...P.slice((by * bw + bx) * 4, (by * bw + bx) * 4 + 3)];

test('the painted field follows the drag, scales with resolution and amount, and marks replace blocks', () => {
  const op = { ...opDefaults('paint'), strokes: [stroke] }, P = paintField(op, { w: 320, h: 160, block: 16 }), bw = 20;
  const [dx, dy] = at(P, bw, 10, 5); assert.ok(Math.abs(dx - 0.02 * 160) < 1e-4 && dy === 0, `inside: ${dx}, ${dy}`);
  assert.deepEqual(at(P, bw, 10, 0), [0, 0, 0], 'outside the brush');
  const P2 = paintField(op, { w: 640, h: 320, block: 32 }); assert.ok(Math.abs(at(P2, bw, 10, 5)[0] - 2 * dx) < 1e-3, 'twice the resolution, twice the pixels');
  assert.ok(Math.abs(at(paintField({ ...op, amount: -1.5 }, { w: 320, h: 160, block: 16 }), bw, 10, 5)[0] + 1.5 * dx) < 1e-3, 'amount scales (and reverses)');
  const back = paintField({ ...op, strokes: [{ ...stroke, pts: [0.9, 0.5, 0.1, 0.5] }] }, { w: 320, h: 160, block: 16 }); assert.ok(at(back, bw, 10, 5)[0] < 0, 'drag the other way');
  const R = paintField({ ...op, mode: 'replace' }, { w: 320, h: 160, block: 16 }); assert.equal(at(R, bw, 10, 5)[2], 1); assert.equal(at(R, bw, 10, 0)[2], 0);
  assert.ok(paintField({ ...op, strokes: [] }, { w: 320, h: 160, block: 16 }).every((v) => v === 0));
});

test('in a loop with no estimated motion, painted vectors move the picture only inside the brush', () => {
  const F = fixture('pan', { w: 128, h: 64, count: 20, block: 16 }), h16 = (a) => fromHalfArray(toHalfArray(a)), src = h16(F.frame(0));
  const cfg = normalize({ estimate: { source: 'none' }, ops: [{ ...opDefaults('paint'), strokes: [{ pts: [0.1, 0.25, 0.9, 0.25], r: 0.12, s: 0.03 }] }] });
  const L = createLoopRef({ w: 128, h: 64 }, cfg); L.begin(0); let out; for (let t = 0; t < 8; t++) out = L.step(t, { src }).display;
  const row = (y) => Array.from({ length: 128 }, (_, x) => out[(y * 128 + x) * 4]).join(), srow = (y) => Array.from({ length: 128 }, (_, x) => src[(y * 128 + x) * 4]).join();
  assert.notEqual(row(16), srow(16), 'the brushed band moved'); assert.equal(row(56), srow(56), 'far from the brush: untouched');
});

test('the command adds strokes to one paint op per loop; validation checks strokes', () => {
  const p = fromConfig({}, { frames: 30 }), tl = createTimeline(p), e = p.sequences[0].channels[1].clips[0].stack[0];
  tl.exec('addVectorStroke', { effectId: e.id, stroke, mode: 'replace' }); tl.exec('addVectorStroke', { effectId: e.id, stroke });
  assert.equal(e.params.ops.length, 1); assert.equal(e.params.ops[0].mode, 'replace'); assert.equal(e.params.ops[0].strokes.length, 2);
  assert.deepEqual(validate(p), []);
  assert.throws(() => tl.exec('addVectorStroke', { effectId: e.id, stroke: { pts: [0.5, 0.5], r: 0.1 } }), /drag/);
  tl.exec('setValue', { id: e.id, path: ['params', 'ops', 0, 'amount'], value: 2 }); assert.equal(e.params.ops[0].amount, 2);
  tl.undo(); tl.undo(); tl.undo(); assert.equal(e.params.ops.length, 0);
});
