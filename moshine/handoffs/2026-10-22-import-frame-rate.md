# Handoff — imports keep their frame rate (25 fps was read as 30)

2026-10-22 · repo `data_moshine/` · app folder `moshine/` · a bug fix on top of
[2026-10-14-m8-exact-any-size.md](2026-10-14-m8-exact-any-size.md) (its state, invariants and gotchas still hold).

## The bug

Every imported video was 30 fps, whatever its real rate. `openVideo` (media.js) read
`computePacketStats(120).averageFrameRate || 30`, but Mediabunny 1.61.3 returns `{ packetCount, averagePacketRate,
averageBitrate }`: no `averageFrameRate`, so the fallback always won (`frameRateIsConstant` did not exist either).
A 25 fps, 50-frame clip became `fps 30/1, durationFrames 60`; the first clip set the sequence timebase to 30, and the
export had 60 frames at 30 fps with repeated frames. Hit markers counted in frames landed at the wrong times, while the
passed-through audio stayed right. The test media were all 30 fps, so nothing caught it. Found on the FAMU film pipeline
(Blender 5.3 renders at 25 fps).

## The fix

- `media.js` `probeTiming(track)` (new, no decoding, runs in node): Mediabunny's `averagePacketRate` (packet count over
  the presentation span of the first 120 packets) snapped by `toRational` (25/1, 24000/1001, 30000/1001, 60000/1001, ...),
  `fps = num / den` exactly, `frames = round((duration - start) * fps)`. 30/1 only when there is no packet rate.
  `openVideo` uses it and exposes `rate`; `info()` gains `rate`.
- `project.js` `mediaFromLibrary` takes `info.rate` when present (older info still snaps `info.fps`).
- `ui.js`: library entries imported before the fix (info without `rate`) are probed again at start-up, in the
  background; a stored audio-feature table whose rate differs from the entry's is analysed again. Saved **projects**
  keep the 30/1 media refs and timebase they were made with: re-add such clips (or start a new project) to get the
  real rate.
- `tools/bench.mjs --page index.html` now waits for `window.__app` as well as `window.__moshine`: `--expr` drivers
  (e.g. aiblender's `tools/moshine_pass.js`) could run before `__app` existed.

## Tests

- `tests/m8-rate.test.mjs` (10): real files through Mediabunny in node at 24, 23.976, 25, 29.97, 50 and 60 fps, plus the
  FAMU repro `kyticki2s.mp4` (25/1, 50 frames); a stub for the packet-rate field and the 30/1 fallback; `toRational`;
  `mediaFromLibrary`. The file rows skip when `tests/media/` lacks them: `sh moshine/tools/make-media.sh` now also makes
  `rate-*.mp4` (2 s, 64x36, H.264 + AAC, faststart; ~22 KB each).
- 153 node tests pass. Headless app, aiblender's `moshine_pass.js` on `kyticki2s.mp4`: `media 960x540 fps 25/1 frames
  50`, export 50 frames, ffprobe `r_frame_rate=25/1 nb_frames=50 duration=2.000`, AAC passed through.
- Bench (Chrome headless, Metal): 32 T0 + 11 T1 pass, `ref/bench-fps-probe.json`. The driver runs unmodified now.

## Open

- A variable-frame-rate source still gets one average rate; frames are indexed by `round((ts - start) * fps)`.
- For the film: the 30 fps render workaround can go; render at 25 again.
