// M5 step 7: which sequence ranges can pass the source audio through unchanged (until the M7 mix).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passThroughAudio } from '../export.js';
import { fromConfig, mediaFromLibrary, createMediaClip } from '../project.js';
import { createTimeline } from '../timeline.js';
import { PRESETS } from '../config.js';

const entry = { id: 'cut', name: 'cut.mp4', info: { w: 640, h: 360, duration: 6, fps: 30, frames: 180, audio: 'aac 48000 Hz ×2' } };
const proj = () => fromConfig(PRESETS['Xvid classic'], { media: mediaFromLibrary(entry), frames: 180 });

test('one untouched clip covering the range passes its audio through, re-timed to the range', () => {
  const p = proj();
  assert.deepEqual(passThroughAudio(p, { in: 0, out: 180 }), { mediaId: p.media[0].id, start: 0, end: 6 });
  assert.deepEqual(passThroughAudio(p, { in: 30, out: 90 }), { mediaId: p.media[0].id, start: 1, end: 3 });
  const tl = createTimeline(p), k = p.sequences[0].channels[0].clips[0];
  tl.exec('moveClips', { ids: [k.id], delta: 15 }); tl.exec('trimClip', { id: k.id, edge: 'in', frame: 20 });
  assert.deepEqual(passThroughAudio(p, { in: 20, out: 80 }), { mediaId: p.media[0].id, start: 5 / 30, end: 65 / 30 }, 'sourceIn and the clip offset carry into source time');
});

test('anything else drops the audio with a reason', () => {
  const p = proj(), tl = createTimeline(p), V = p.sequences[0].channels[0];
  assert.match(passThroughAudio(p, { in: 170, out: 200 }).reason, /does not cover/);
  tl.exec('splitClips', { frame: 90, ids: [V.clips[0].id] });
  assert.match(passThroughAudio(p, { in: 0, out: 180 }).reason, /several clips/);
  assert.ok(passThroughAudio(p, { in: 0, out: 90 }).mediaId, 'one side of the split is fine');
  tl.exec('bloomInsert', { clipId: V.clips[1].id, frame: 100, length: 10 });
  assert.match(passThroughAudio(p, { in: 100, out: 110 }).reason, /held clip/);
  const q = proj(); q.media[0].hasAudio = false; assert.match(passThroughAudio(q, { in: 0, out: 30 }).reason, /no audio/);
  const r = proj(); r.media[0].fps = { num: 25, den: 1 }; assert.match(passThroughAudio(r, { in: 0, out: 30 }).reason, /another frame rate/);
  const e = proj(); e.sequences[0].channels[0].clips.length = 0; assert.match(passThroughAudio(e, { in: 0, out: 30 }).reason, /no media/);
});
