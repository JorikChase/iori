// M7 step 4: the mixer — timing, gain, mute and solo, stretch under Bloom Insert, and seamless blocks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mixBlock, audibleClips } from '../mix.js';
import { fromConfig, mediaFromLibrary, createAudioClip } from '../project.js';
import { createTimeline } from '../timeline.js';

const SR = 48000, FPS = 30;
/** A fake decoder: the media's sound is sample index i -> sin(2 pi 300 i / msr) (mono, msr 48000 or 44100). */
const decoder = (msr = 48000, calls = []) => async (m, t0, t1) => {
  const first = Math.max(0, Math.floor(t0 * msr)), n = Math.ceil(t1 * msr) - first + 2; calls.push([t0, t1]);
  return { sampleRate: msr, first, channels: [Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 300 * (first + i)) / msr))] };
};
function project() {
  const m = mediaFromLibrary({ id: 'h', name: 'a.mp4', info: { w: 64, h: 48, duration: 20, fps: FPS, frames: 600, audio: 'aac' } });
  const p = fromConfig({}, { media: m, frames: 120, width: 64, height: 48, timebase: { num: FPS, den: 1 } });
  p.sequences[0].channels[2].clips.push(createAudioClip(m.id, { in: 30, out: 90 }, { sourceIn: 15 }));
  return { p, seq: p.sequences[0], tl: createTimeline(p) };
}
const mix = (p, seq, s0, s1, o = {}) => mixBlock({ project: p, seq, s0, s1, sr: SR, nch: 2, decode: decoder(o.msr), cache: o.cache });

test('a clip plays its source from sourceIn at its in-point, silent elsewhere, on both channels', async () => {
  const { p, seq } = project(), [L, R] = await mix(p, seq, 0, 120 * 1600);
  assert.equal(L[29 * 1600], 0, 'before the clip'); assert.equal(L[90 * 1600 + 10], 0, 'after it');
  const i = 40 * 1600 + 123, src = 25 * 1600 + 123;                     // sequence frame 40 hears source frame 25 (sourceIn 15)
  assert.ok(Math.abs(L[i] - Math.sin((2 * Math.PI * 300 * src) / 48000)) < 1e-6); assert.equal(L[i], R[i], 'mono to both channels');
});

test('gain, mute and solo', async () => {
  const { p, seq, tl } = project(), a = seq.channels[2].clips[0], i = 50 * 1600 + 7;
  const base = (await mix(p, seq, 0, 120 * 1600))[0][i];
  tl.exec('setValue', { id: a.id, path: ['gain'], value: { value: 0.5 } }); assert.ok(Math.abs((await mix(p, seq, 0, 120 * 1600))[0][i] - base / 2) < 1e-6);
  tl.exec('setValue', { id: seq.channels[2].id, path: ['bypassed'], value: true }); assert.equal(audibleClips(seq).length, 0);
  tl.exec('setValue', { id: seq.channels[2].id, path: ['bypassed'], value: false }); const a2 = tl.exec('addChannel', { kind: 'audio' }); tl.exec('setValue', { id: a2, path: ['solo'], value: true });
  assert.equal((await mix(p, seq, 0, 120 * 1600))[0][i], 0, 'another channel soloed');
});

test('blocks join without seams: one block equals many, with and without stretch, at equal and different rates', async () => {
  const { p, seq, tl } = project();
  tl.exec('bloomInsert', { clipId: seq.channels[0].clips[0].id, frame: 50, length: 12 });
  for (const msr of [48000, 44100]) {
    const one = await mixBlock({ project: p, seq, s0: 0, s1: 130 * 1600, sr: SR, nch: 1, decode: decoder(msr) });
    const cache = new Map(), parts = []; for (let s = 0; s < 130 * 1600; s += 24000) parts.push((await mixBlock({ project: p, seq, s0: s, s1: Math.min(130 * 1600, s + 24000), sr: SR, nch: 1, decode: decoder(msr), cache }))[0]);
    const joined = new Float32Array(130 * 1600); let o = 0; for (const x of parts) { joined.set(x, o); o += x.length; }
    let max = 0; for (let i = 0; i < joined.length; i++) max = Math.max(max, Math.abs(joined[i] - one[0][i]));
    assert.ok(msr === 48000 ? max === 0 : max < 1e-5, `${msr} Hz: max difference ${max}`);
  }
});

test('Bloom Insert: the audio stretches over the hold and is back in sync after it', async () => {
  const { p, seq, tl } = project(), L = 12;
  tl.exec('bloomInsert', { clipId: seq.channels[0].clips[0].id, frame: 50, length: L });
  const a = seq.channels[2].clips[0]; assert.deepEqual(a.range, { in: 30, out: 90 + L });
  const [out] = await mixBlock({ project: p, seq, s0: 0, s1: 140 * 1600, sr: SR, nch: 1, decode: decoder() });
  const i = (50 + 2 * L + 5) * 1600 + 3, src = (15 + 20 + L + 5) * 1600 + 3;  // after the stretched span: unit rate again, shifted by L
  assert.ok(Math.abs(out[i] - Math.sin((2 * Math.PI * 300 * src) / 48000)) < 1e-6, 'in sync after the stretch');
  let e = 0; for (let k = 51 * 1600; k < 70 * 1600; k++) e += out[k] * out[k]; assert.ok(e / (19 * 1600) > 0.3, 'the stretched span is not silent');
});
