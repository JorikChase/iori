// M7 step 5: what a sequence export does with sound — the audible audio clips' mix, or packets passed through for one
// untouched clip (exact and cheap), or nothing with a reason.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioPlan } from '../export.js';
import { fromConfig, mediaFromLibrary, createAudioClip } from '../project.js';
import { createTimeline } from '../timeline.js';
import { PRESETS } from '../config.js';

const entry = { id: 'cut', name: 'cut.mp4', info: { w: 640, h: 360, duration: 6, fps: 30, frames: 180, audio: 'aac 48000 Hz ×2' } };
/** A one-clip project with its linked audio clip on A1, as an import in the editor makes it. */
const proj = () => { const p = fromConfig(PRESETS['Xvid classic'], { media: mediaFromLibrary(entry), frames: 180 }); p.sequences[0].channels[2].clips.push(createAudioClip(p.media[0].id, { in: 0, out: 180 })); return p; };
const A = (p) => p.sequences[0].channels[2];

test('one untouched audio clip covering the range passes through, re-timed to the range', () => {
  const p = proj(), id = p.media[0].id;
  assert.deepEqual(audioPlan(p, { in: 0, out: 180 }), { mode: 'pass', mediaId: id, start: 0, end: 6 });
  assert.deepEqual(audioPlan(p, { in: 30, out: 90 }), { mode: 'pass', mediaId: id, start: 1, end: 3 });
  const tl = createTimeline(p), k = A(p).clips[0];
  tl.exec('moveClips', { ids: [k.id], delta: 15 }); tl.exec('trimClip', { id: k.id, edge: 'in', frame: 20 });
  assert.deepEqual(audioPlan(p, { in: 20, out: 80 }), { mode: 'pass', mediaId: id, start: 5 / 30, end: 65 / 30 }, 'sourceIn and the clip offset carry into source time');
});

test('anything else is mixed: partial cover, several clips, gain, keyframed gain, a stretch, another frame rate', () => {
  let p = proj(); assert.deepEqual(audioPlan(p, { in: 170, out: 200 }), { mode: 'mix', clips: 1 }, 'the clip ends inside the range');
  p = proj(); let tl = createTimeline(p);
  tl.exec('splitClips', { frame: 90, ids: [A(p).clips[0].id] });
  assert.deepEqual(audioPlan(p, { in: 0, out: 180 }), { mode: 'mix', clips: 2 });
  assert.equal(audioPlan(p, { in: 0, out: 90 }).mode, 'pass', 'one side of the split is untouched');
  p = proj(); A(p).clips[0].gain = { value: 0.5 }; assert.equal(audioPlan(p, { in: 0, out: 30 }).mode, 'mix', 'gain');
  p = proj(); A(p).clips[0].gain = { value: 1, keys: [{ t: 0, v: 1 }, { t: 30, v: 0 }] }; assert.equal(audioPlan(p, { in: 0, out: 30 }).mode, 'mix', 'keyframed gain');
  p = proj(); tl = createTimeline(p); tl.exec('bloomInsert', { clipId: p.sequences[0].channels[0].clips[0].id, frame: 100, length: 10 });
  assert.ok(A(p).clips[0].stretch?.length, 'Bloom Insert stretched the sound'); assert.equal(audioPlan(p, { in: 0, out: 190 }).mode, 'mix', 'a stretch');
  p = proj(); p.media[0].fps = { num: 25, den: 1 }; assert.equal(audioPlan(p, { in: 0, out: 30 }).mode, 'mix', 'another frame rate');
});

test('no sound: no audio clip, media without audio, a muted channel', () => {
  let p = proj(); A(p).clips.length = 0; assert.match(audioPlan(p, { in: 0, out: 30 }).reason, /no audible audio clip/);
  p = proj(); p.media[0].hasAudio = false; assert.equal(audioPlan(p, { in: 0, out: 30 }).mode, null);
  p = proj(); A(p).bypassed = true; assert.equal(audioPlan(p, { in: 0, out: 30 }).mode, null, 'muted');
  p = proj(); assert.equal(audioPlan(p, { in: 0, out: 30 }).mode, 'pass', 'a video clip alone is not heard: its linked audio clip is');
});
