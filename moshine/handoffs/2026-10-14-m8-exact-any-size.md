# Handoff — M8 in four browsers, exact everywhere (D45), any size (D46)

2026-10-14 · repo `data_moshine/` (local git, no remote) · head `9ef87d7` · app folder `moshine/`
Live at https://iori.me/moshine/ (iori `32851a8`). Previous handoff:
[2026-10-10b-decisions-m7-perf-density.md](2026-10-10b-decisions-m7-perf-density.md) — its invariants and gotchas
still hold; read its "Invariants added" and "Gotchas" sections too.

## In one paragraph

M8's browser work is done on macOS: Chrome, Safari 26.6.2, Zen (Firefox's engine, Gecko 157) and Playwright WebKit
run the whole harness with no console errors, and exports are in sync in each. Every path that feeds a mosh is now
integer arithmetic with deterministic JavaScript math, so the four browsers render **the same bits** for the same
input frames (D45). A mosh keeps its look at any working size, so the preview shows what the export will be, and the
exporter renders any size up to the GPU's limit with a codec picker (D46). Left in M8: an iPhone, and a Safari rerun of
the last round.

## Read in this order

1. This file.
2. [`study/m8.md`](../study/m8.md): how to run each browser, results, every fix, the cross-engine table.
3. `study/SPEC.md` §0 D45, D46 (and D40–D44 from the previous round).
4. The previous handoff for invariants and gotchas.

## Resume in five minutes

```bash
cd /Users/iori/Desktop/code/data_moshine
node --test 'moshine/tests/*.test.mjs'                        # 143 tests
node moshine/tools/bench.mjs --tag check --quiet              # Chrome: 32 T0 + 11 T1
node moshine/tools/xbench.mjs --browser webkit --tag check    # Playwright WebKit (Safari's engine)
node moshine/tools/xbench.mjs --browser zen --headed --tag check
node moshine/tools/xbench.mjs --browser safari --tag check    # needs Safari's automation free (see Gotchas)
node moshine/tools/fidelity.mjs --tag check                   # budgets (rm ref/fidelity-check.json after)
sh moshine/tools/make-media.sh && sh moshine/tools/make-media.sh --uhd   # test clips incl. beat.mp4, uhd4k, uhd8k
```

## Where things stand

| Item | State | Evidence |
|---|---|---|
| M7 audio | done | previous handoff; T1 `exportMix` (MP4/AAC, WebM/Opus, pass-through at 0 ms) |
| M8 Chrome, Safari, Zen, WebKit | done on macOS | `ref/xbench-*-d46.json`, `ref/bench-d46-chrome.json`, `ref/xbench-safari-m8-exact.json` |
| M8 iPhone (governor caps, touch, memory) | open | needs the device |
| D45 exact across browsers | done | T0 `crossHashes`: 41 cases, GPU = CPU in each browser, same hash `e6186712` in Chrome, WebKit, Zen |
| D46 any size | done | T1 `previewMatchesExport`; T4 `slowExportSizes`; Export window |
| Safari on the D46 round | not run | automation blocked (Gotchas); Safari passed the D45 round |

## What changed since the previous handoff

- **Browser runner** `tools/xbench.mjs`: Safari via safaridriver (WebDriver classic), Zen/Firefox via WebDriver BiDi
  (launched with `open -n`, a fresh profile, `--headed`; it kills only its own pid), WebKit/Chromium via the Playwright
  copy in iori's audio tests. One script call per row; a free port; console errors and failed requests recorded.
- **Browser fixes**: exact integer luma (gpu.js `LUMA_WGSL` = engine-ref `lumaPx`); WebKit's AAC encoder returns an
  ES_Descriptor as the description (`export.js cleanAudioConfig` unwraps it); Opus is never shifted (its OpusHead
  pre-skip already covers the delay; only AAC gets the measured `encoderDelay` shift); Firefox refuses a VideoFrame as a
  copy source (`media.js` draws through a canvas).
- **D45, exact everywhere** (`fixed.js` integers + WGSL twins, `dmath.js` deterministic sin/cos/exp/log/pow): field
  ops (1/64 px; gain shapes, synthetic fields, painted vectors as per-block tables made in JS), all twelve effects
  (q15 colour; stripes' cosines, the colour LUT and matrix, the DCT basis as integers; neutral colour settings are an
  exact identity), the code stage (no `/9`, no `/steps`), the warp (1/64 px, 1/64 bilinear weights, the smooth field in
  integers), the optical flow (integer Lucas–Kanade), the matcher (full power-of-two blocks with clamped pixels, an
  exact reciprocal, λ in 1/2^20). `Math.sin` & co. are gone from everything that feeds a render (masks, placement,
  vectors, the LFO, the audio biquads, the bloom's acceleration). The CPU effect chain rounds to the GPU's storage
  format (`ctx.store`).
- **D46, any size** (`scale.js`): `cfg.scale` = working height / sequence height, applied after keyframes and
  modulators resolve (both loop twins, and clip effects in the evaluator); block size snaps to a power of two (4–32),
  search and every pixel setting scale. Export window: sequence, half, 720p–4320p at the sequence aspect (upscaling),
  custom W × H with an aspect lock, up to `maxTextureDimension2D` (gpu.js now requests the adapter's limits); codec
  picker (auto: H.264 to 1080p, HEVC/AV1 above). Exports render without checkpoints.
- **Measured exports** (Chrome, this Mac): 4K 30 fps with HEVC/AV1 or H.264 medium (GPU-bound, ~27 ms per frame),
  9.5 fps with H.264 high (the encoder); 8K ~6 fps (HEVC). Encoders: Chrome H.264 to 4096 wide, HEVC/AV1/VP9 to 8K;
  Zen H.264/AV1/VP9/VP8 to 8K, no HEVC; Safari not measured.
- Fidelity budgets unchanged through all of it (clip mosh SSIM 0.7261).

## Invariants added

- **No float multiply-add, division, sqrt, pow or trig in a kernel that feeds the mosh.** Integers that cannot
  overflow 32 bits, or float products that are exact (half × a weight of ≤ 13 bits). Divide only by exact powers of
  two (pass the reciprocal from JS).
- **No `Math.sin`/`cos`/`pow`/`exp`/`log`/`hypot` in JS that feeds a render**: use `dmath.js`. `Math.sqrt`,
  `Math.floor`, `Math.round` are fine.
- **Any new pixel-unit parameter must be added to `scale.js`**, or the preview and the export will differ.
- **`crossHashes` is the guard**: any new op, effect or estimator mode gets a case there, and the four browsers must
  print the same `all` hash.
- Matcher blocks must stay powers of two (scaledBlock snaps; 32 is the workgroup-memory ceiling).

## Gotchas

- `FIXED_WGSL` defines `h12`, which calls `hash3`: a shader including it must include `HASH_WGSL`, or the pipeline is
  invalid and the next readback hangs forever (looks like a hung bench).
- **Safari allows one automation session.** Interrupting a Safari run leaves its automation window (striped orange
  address bar) open, and new sessions then hang. Close that window (or quit Safari) before `--browser safari`.
- **Other sessions use the GPU** (poster captures, other tracks' benches): timings run 10× slow and long rows look
  hung. Check `ps` before blaming the code.
- Headless Gecko has `navigator.gpu` but no adapter: Zen needs `--headed` (opens in the background).
- Coarse pyramid levels hold quarter steps of 1/32768: integer code truncates them (`i32()`), the CPU twin must too.
- **Deploying when the iori tree has other tracks' uncommitted registry edits**: if `moshine/index.html` and
  `lab.html` are unchanged, rsync with `--exclude '/index.html' --exclude '/lab.html'`, skip `site.py`, commit only
  `moshine/`, and check `git log origin/main..main` before pushing so only your commit goes out.
- `bench.mjs --expr` needs `return await (...)` in front of an IIFE.

## Open threads, by value

1. **Safari rerun** of the D46 round (flow, warp, matcher changed) once its automation window is closed.
2. **iPhone**: governor caps, touch, memory — the last part of M8's exit.
3. **Masks**: tracking and on-canvas handles.
4. **R5** app icon when `moshine/icon.svg` arrives (favicon, caption box, site menu).
5. **M9b**: the authentic in-browser bake (ffmpeg.wasm, LGPL; then COOP/COEP on `/moshine/*`), the v2 effect library,
   docs.
6. Small: AAC tail padding (~27 ms after the video), the tablet letterbox (the stack floats there), decode ladders
   3–5 and the WebGL2 backend for browsers without WebGPU (spec M8 scope, not started).

## Decisions only the owner can make

- Whether to start M9b (the bake) before the iPhone check.
- Nothing else is pending.

## Deploy

Steps as in the 2026-10-10 handoff ("Deployed"), with the iori-tree caveat above. Last deploy: iori `32851a8`
(2026-10-14), live check: no console errors, the Export window shows the new sizes and codec picker.
