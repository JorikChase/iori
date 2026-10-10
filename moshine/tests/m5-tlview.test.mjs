// M5 step 6: the timeline view's pure geometry (rows, frame <-> x, hit testing, ruler steps, time codes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutRows, frameToX, xToFrame, hitTest, rulerStep, timecode, rowAt } from '../tlview.js';
import { createProject, createMediaClip, createEffectClip } from '../project.js';

function seq() {
  const p = createProject(), s = p.sequences[0];
  s.channels[0].clips.push(createMediaClip('m', { in: 0, out: 100 }), createMediaClip('m', { in: 100, out: 160 }));
  s.channels[1].clips.push(createEffectClip({ in: 50, out: 150 }));
  return s;
}

test('rows run top-down from the last channel; a keyframe row follows the shown channel', () => {
  const s = seq(), r = layoutRows(s, null);
  assert.deepEqual(r.map((x) => x.ch.name), ['A1', 'FX1', 'V1']); assert.deepEqual(r.map((x) => x.y), [0, 44, 88]);
  const k = layoutRows(s, { channelId: s.channels[1].id }, { laneH: 50, kfH: 20 });
  assert.deepEqual(k.map((x) => x.kind + ':' + x.ch.name + '@' + x.y), ['channel:A1@0', 'channel:FX1@50', 'kf:FX1@100', 'channel:V1@120']);
  assert.equal(rowAt(k, 105).kind, 'kf'); assert.equal(rowAt(k, 500), null);
});

test('frame <-> x round trip; hit testing finds clips, edges, keys and empty lanes', () => {
  const s = seq(), v = { x0: -10, ppf: 2 }, rows = layoutRows(s, { channelId: s.channels[1].id });
  assert.equal(frameToX(0, v), 20); assert.equal(xToFrame(frameToX(37, v), v), 37);
  const V = rows.find((r) => r.ch.name === 'V1'), F = rows.find((r) => r.ch.name === 'FX1' && r.kind === 'channel'), K = rows.find((r) => r.kind === 'kf');
  const at = (f, row, o) => hitTest(rows, v, frameToX(f, v), row.y + 5, o);
  assert.equal(at(40, V).clip, s.channels[0].clips[0]); assert.equal(at(40, V).edge, null);
  assert.equal(at(1, V).edge, 'in'); assert.equal(at(99, V).edge, 'out', 'the out edge of the first clip wins at a join');
  assert.equal(at(120, F).clip, s.channels[1].clips[0]); assert.equal(at(20, F).type, 'lane');
  assert.deepEqual([at(70, K, { keys: [70] }).type, at(70, K, { keys: [70] }).frame, at(90, K, { keys: [70] }).type], ['key', 70, 'kf']);
  assert.equal(hitTest(rows, v, 10, 9999).type, 'none');
});

test('ruler steps keep labels apart; time codes', () => {
  assert.equal(rulerStep(10, 30), 10); assert.equal(rulerStep(1, 30), 150); assert.equal(rulerStep(0.05, 25), 1500);
  assert.equal(timecode(0, 30), '0:00'); assert.equal(timecode(95, 30, true), '0:03.05'); assert.equal(timecode(3600, 30), '2:00');
});
