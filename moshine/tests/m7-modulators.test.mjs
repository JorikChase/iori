// M7 step 2: audio modulators and onset triggers, the clock's audio, and reactive presets in the evaluator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODULATORS } from '../params.js';
import { clockOf, audibleAt, loopConfig, createEvaluator, cpuBackend, setClockProject } from '../sequence.js';
import { fromConfig, mediaFromLibrary, createAudioClip } from '../project.js';
import { createTimeline } from '../timeline.js';
import { PRESETS } from '../config.js';
import { FEATURES } from '../features.js';
import { fixture } from '../fixtures.js';
import { fnv1a } from '../util.js';

/** A feature table: bass and rms high in frames 10–19, onset peaks at 10 and 30. */
function table(frames = 60) {
  const data = new Float32Array(frames * FEATURES.length), set = (k, n, v) => { data[k * FEATURES.length + FEATURES.indexOf(n)] = v; };
  for (let k = 10; k < 20; k++) { set(k, 'bass', 1); set(k, 'rms', 0.8); }
  set(10, 'onset', 0.9); set(11, 'onset', 0.4); set(30, 'onset', 0.7);
  return { fps: { num: 30, den: 1 }, frames, features: FEATURES, data };
}
const fake = (tab) => ({ audio: (n, t) => { const i = Math.max(0, Math.min(tab.frames - 1, t)); return tab.data[i * FEATURES.length + FEATURES.indexOf(n)]; } });

test('the audio modulator reads a feature, smoothed over the last frames; silent without audio', () => {
  const c = fake(table()), A = (p, t) => MODULATORS.audio.at(p, t, c);
  assert.equal(A({ feature: 'bass', smooth: 0 }, 12), 1); assert.equal(A({ feature: 'bass', smooth: 0 }, 25), 0);
  assert.equal(A({ feature: 'bass', smooth: 3 }, 10), 0.25, 'one of four frames'); assert.equal(A({ feature: 'rms', smooth: 0 }, 15), Math.fround(0.8));
  assert.equal(MODULATORS.audio.at({ feature: 'bass' }, 12, {}), 0);
});

test('onsets fire the trigger modulator at their peaks', () => {
  const c = fake(table()), T = (t, p = {}) => MODULATORS.trigger.at({ source: 'onsets', threshold: 0.5, hold: 2, decay: 0, ...p }, t, c);
  assert.deepEqual([9, 10, 11, 12, 29, 30, 31, 32].map((t) => T(t)), [0, 1, 1, 0, 0, 1, 1, 0]);
  assert.equal(T(30, { threshold: 0.8 }), 0, 'below the threshold');
});

const W = 64, H = 48, F = fixture('pan', { w: W, h: H, count: 60, block: 16 });
function project(cfg) {
  const m = mediaFromLibrary({ id: 'hashA', name: 'a.mp4', info: { w: W, h: H, duration: 2, fps: 30, frames: 60, audio: 'aac 48000 Hz ×1' } });
  const p = fromConfig(cfg, { media: m, frames: 40, width: W, height: H, timebase: { num: 30, den: 1 } });
  p.sequences[0].channels[2].clips.push(createAudioClip(m.id, { in: 0, out: 40 }));
  return p;
}
const evalOf = (p, tables) => createEvaluator(p, cpuBackend({ w: W, h: H, sources: { [p.media[0].id]: { w: W, h: H, frame: (i) => F.frame(i) } } }), { K: 8, features: (h) => tables[h] });

test('the clock hears the audio clip through sourceIn; its key names the tables in play', () => {
  const p = project(PRESETS['Bass pump']), seq = p.sequences[0], k = seq.channels[1].clips[0], tab = table();
  setClockProject(p);
  const c = clockOf(seq, k, 1, p, (h) => (h === 'hashA' ? tab : null));
  assert.equal(c.audioKey, 'hashA'); assert.equal(c.audio('bass', 12), 1); assert.equal(audibleAt(seq, p, 5).clip.kind, 'audio');
  seq.channels[2].clips[0].sourceIn = 5; assert.equal(c.audio('bass', 7), 1, 'the audio clip starts 5 frames into the media');
  assert.equal(clockOf(seq, k, 1, p, () => null).audioKey, '', 'no tables, no key'); assert.equal(JSON.stringify(c).includes('audio('), false);
});

test('a reactive preset reacts only where the audio does, deterministically; onsets become bloom hits', async () => {
  const run = async (cfg, tables) => { const p = project(cfg), ev = evalOf(p, tables), out = []; for (let t = 0; t < 30; t++) out.push(fnv1a(new Float32Array((await ev.render(t)).image))); return out; };
  const silent = await run(PRESETS['Bass pump'], {}), loud = await run(PRESETS['Bass pump'], { hashA: table() }), again = await run(PRESETS['Bass pump'], { hashA: table() });
  assert.deepEqual(loud, again, 'deterministic');
  assert.deepEqual(loud.slice(0, 10), silent.slice(0, 10), 'no bass yet: the same');
  assert.notDeepEqual(loud.slice(10, 20), silent.slice(10, 20), 'the bass pushes the motion');
  const p = project(PRESETS['Onset bloom']), k = p.sequences[0].channels[1].clips[0], e = k.stack[0];
  assert.equal(loopConfig(e, k, p.sequences[0], p, () => null).bloom.hits.length, 0, 'no table yet');
  const cfg2 = loopConfig(e, k, p.sequences[0], p, (h) => (h === 'hashA' ? table() : null));
  assert.deepEqual(cfg2.bloom.hits.map((x) => x.at), [10, 30], 'onset peaks above 0.5');
});
