// M7 step 3: the audio time map under Bloom Insert, and the WSOLA stretcher.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioSourceAt, audioPieces, audioCut, insideStretch } from '../audio.js';
import { wsola } from '../stretch.js';
import { fromConfig, mediaFromLibrary, createAudioClip, validate } from '../project.js';
import { createTimeline } from '../timeline.js';

const clip = (o = {}) => ({ kind: 'audio', sourceIn: 10, range: { in: 100, out: 200 }, stretch: [{ at: 20, len: 10, span: 10 }], ...o });

test('the time map: before, inside (half speed) and after a stretch segment', () => {
  const k = clip();
  assert.equal(audioSourceAt(k, 5), 15); assert.equal(audioSourceAt(k, 20), 30);
  assert.equal(audioSourceAt(k, 30), 35, 'half way through the stretched span: half the source'); assert.equal(audioSourceAt(k, 40), 40, 'back in sync, 10 frames later');
  assert.equal(audioSourceAt(k, 60), 60);
  const p = audioPieces(k); assert.deepEqual(p.map((x) => [x.from, x.to]), [[0, 20], [20, 40], [40, 100]]);
  assert.ok(Math.abs(p[1].src1 - 40) < 1e-6 && p[1].src0 === 30, 'the stretched piece covers 10 source frames over 20');
  assert.equal(insideStretch(k, 25), true); assert.equal(insideStretch(k, 40), false);
  assert.deepEqual(audioCut(k, 50), { sourceIn: 50, stretch: [] }, 'after the segment: folded into sourceIn');
  assert.deepEqual(audioCut(k, 10), { sourceIn: 20, stretch: [{ at: 10, len: 10, span: 10 }] }, 'before it: the segment moves');
});

test('Bloom Insert stretches the linked audio; cuts outside the span keep the map, inside are refused', () => {
  const m = mediaFromLibrary({ id: 'h', name: 'a.mp4', info: { w: 64, h: 48, duration: 10, fps: 30, frames: 300, audio: 'aac' } });
  const p = fromConfig({}, { media: m, frames: 120, width: 64, height: 48, timebase: { num: 30, den: 1 } }), seq = p.sequences[0], tl = createTimeline(p);
  seq.channels[2].clips.push(createAudioClip(m.id, { in: 0, out: 120 }));
  tl.exec('bloomInsert', { clipId: seq.channels[0].clips[0].id, frame: 40, length: 20 });
  const a = seq.channels[2].clips[0]; assert.deepEqual(a.range, { in: 0, out: 140 }); assert.deepEqual(a.stretch, [{ at: 40, len: 20, span: 20 }]);
  assert.deepEqual(validate(p), []);
  const pic = (f) => { const k = seq.channels[0].clips.find((x) => x.range.in <= f && f < x.range.out); return k.hold ? k.sourceIn : k.sourceIn + f - k.range.in; };
  assert.equal(audioSourceAt(a, 80), pic(80), 'after the stretch, sound and picture show the same source frame');
  assert.throws(() => tl.exec('splitClips', { frame: 50, ids: [a.id] }), /inside a time-stretched span/);
  tl.exec('splitClips', { frame: 100, ids: [a.id] }); const r = seq.channels[2].clips[1];
  assert.equal(r.sourceIn, 80); assert.equal(r.stretch, undefined); assert.deepEqual(seq.channels[2].clips[0].stretch, [{ at: 40, len: 20, span: 20 }]);
  tl.undo(); tl.exec('splitClips', { frame: 30, ids: [a.id] }); const r2 = seq.channels[2].clips[1];
  assert.equal(seq.channels[2].clips[0].stretch, undefined, 'the left part ends before the span'); assert.deepEqual(r2.stretch, [{ at: 10, len: 20, span: 20 }]);
  assert.equal(audioSourceAt(r2, 50), 60, 'the right part keeps the same map (sequence frame 80 hears source 60, as before the split)');
  assert.deepEqual(validate(p), []);
});

const sine = (f, n, sr = 48000, amp = 0.5) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / sr));
const crossings = (x) => { let c = 0; for (let i = 1; i < x.length; i++) if ((x[i - 1] < 0) !== (x[i] < 0)) c++; return c; };
const rms = (x) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / x.length);

test('WSOLA: exact length, the same pitch, the same loudness, deterministic', () => {
  const x = sine(440, 24000), [y] = wsola([x], 48000), [y2] = wsola([x], 48000);
  assert.equal(y.length, 48000); assert.deepEqual(y, y2);
  const body = (a) => a.subarray(2048, a.length - 2048), rate = (a) => crossings(body(a)) / body(a).length;
  assert.ok(Math.abs(rate(y) / rate(x) - 1) < 0.02, `pitch kept: ${rate(y) / rate(x)}`);
  assert.ok(Math.abs(rms(body(y)) / rms(body(x)) - 1) < 0.1, `loudness kept: ${rms(body(y)) / rms(body(x))}`);
  const [z] = wsola([x], 12000); assert.equal(z.length, 12000); assert.ok(Math.abs(rate(z) / rate(x) - 1) < 0.03, 'compressing keeps pitch too');
  const st = wsola([x, sine(660, 24000)], 30000); assert.equal(st.length, 2); assert.ok(Math.abs(rate(st[1]) / rate(sine(660, 24000)) - 1) < 0.03, 'stereo: each channel keeps its pitch');
  assert.deepEqual(wsola([x], 24000)[0], x, 'ratio 1 is a copy');
});
