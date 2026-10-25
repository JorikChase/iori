// Import frame rate: probeTiming (media.js) on real files through Mediabunny in node, and the library -> MediaRef path.
// Until 2026-10-22 openVideo read stats.averageFrameRate, which Mediabunny 1.61 does not have, so every import was 30 fps.
// The files come from tools/make-media.sh (tests/media/ is gitignored); the rows skip when they are missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { probeTiming, mb } from '../media.js';
import { toRational, mediaFromLibrary } from '../project.js';

const MEDIA = new URL('./media/', import.meta.url);
// [file, rate, frames] as ffprobe reports them (nb_frames); rate-*.mp4 are made like Blender's renders: PNG-like source,
// -movflags +faststart, AAC alongside
const FILES = [
  ['rate-24.mp4', { num: 24, den: 1 }, 48], ['rate-23.976.mp4', { num: 24000, den: 1001 }, 47],
  ['rate-25.mp4', { num: 25, den: 1 }, 50], ['rate-29.97.mp4', { num: 30000, den: 1001 }, 59],
  ['rate-50.mp4', { num: 50, den: 1 }, 100], ['rate-60.mp4', { num: 60, den: 1 }, 120],
  ['kyticki2s.mp4', { num: 25, den: 1 }, 50],                     // the FAMU repro: 960x540 25 fps from Blender 5.3
];

async function track(file) {
  const M = await mb(), input = new M.Input({ formats: M.ALL_FORMATS, source: new M.BufferSource(readFileSync(new URL(file, MEDIA))) });
  return input.getPrimaryVideoTrack();
}

for (const [file, rate, frames] of FILES) {
  const have = existsSync(new URL(file, MEDIA));
  test(`probeTiming: ${file} imports at ${rate.num}/${rate.den} with ${frames} frames`, { skip: !have && 'run sh moshine/tools/make-media.sh' }, async () => {
    const t = await probeTiming(await track(file));
    assert.deepEqual(t.rate, rate); assert.equal(t.fps, rate.num / rate.den); assert.equal(t.frames, frames);
  });
}

test('probeTiming reads Mediabunny\'s packet rate, and falls back to 30/1 only without one', async () => {
  const stub = (stats) => ({ computeDuration: async () => 2, getFirstTimestamp: async () => 0, computePacketStats: async () => stats });
  assert.deepEqual((await probeTiming(stub({ packetCount: 50, averagePacketRate: 25, averageBitrate: 1 }))).rate, { num: 25, den: 1 });
  assert.deepEqual((await probeTiming(stub({ packetCount: 0, averagePacketRate: 0, averageBitrate: 0 }))).rate, { num: 30, den: 1 });
});

test('toRational snaps measured rates', () => {
  for (const [x, r] of [[25, [25, 1]], [24.000000000001, [24, 1]], [23.976, [24000, 1001]], [24000 / 1001, [24000, 1001]], [29.97, [30000, 1001]],
    [50, [50, 1]], [59.94, [60000, 1001]], [60, [60, 1]], [12.5, [12500, 1000]]]) assert.deepEqual(toRational(x), { num: r[0], den: r[1] }, String(x));
});

test('mediaFromLibrary takes the exact rate from the probe, and still snaps older info without one', () => {
  const entry = (info) => ({ id: 'abc', name: 'x.mp4', info: { w: 960, h: 540, frames: 50, audio: 'mp4a', ...info } });
  assert.deepEqual(mediaFromLibrary(entry({ fps: 23.976, rate: { num: 24000, den: 1001 } })).fps, { num: 24000, den: 1001 });
  assert.deepEqual(mediaFromLibrary(entry({ fps: 25 })).fps, { num: 25, den: 1 });
});
