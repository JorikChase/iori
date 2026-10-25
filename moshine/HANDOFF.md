# MOSHINE — handoff

**Latest session handoff: [handoffs/2026-10-14-m8-exact-any-size.md](handoffs/2026-10-14-m8-exact-any-size.md)**, plus the fix [handoffs/2026-10-22-import-frame-rate.md](handoffs/2026-10-22-import-frame-rate.md) (imports keep their frame rate) and [handoffs/2026-10-25-export-hang.md](handoffs/2026-10-25-export-hang.md) (the long-export "hang" was the headless rig; `bench.mjs --out`) and [study/TUTORIAL-PLAN.md](study/TUTORIAL-PLAN.md) (PNG-sequence export for editing, the help tour: `frames.js`, `help.js`) (previous: [2026-10-10b-decisions-m7-perf-density.md](handoffs/2026-10-10b-decisions-m7-perf-density.md), [2026-10-10-m5-m7-timeline-cache-audio.md](handoffs/2026-10-10-m5-m7-timeline-cache-audio.md), [2026-10-09-m0-m4-engine-to-timeline.md](handoffs/2026-10-09-m0-m4-engine-to-timeline.md)) — state, invariants, gotchas, open threads. This file is the per-milestone file map.

Start here. Design and decisions: `study/SPEC.md` (§0 decision log, §13 milestones, §15 open items). Lab: http://localhost:8772/moshine/lab.html
Effect set: `study/CATALOG-REVIEW.md`. Agreed UI: `study/ux/wireframe.html`. Evidence: `study/research/`.

## Run

```bash
python3 moshine/serve.py 8772        # http://localhost:8772/moshine/  (serves the parent folder, like petri)
```

`serve.py` sends the same headers as iori.me: **no COOP/COEP** (D44), so the page is not cross-origin isolated here
either. `serve.py 8772 --coi` (and `bench.mjs --coi`) add them for work on the ffmpeg.wasm bake (M9b). Everything
must be same-origin: fonts are self-hosted, vendor code goes in `vendor/`.

In the Claude desktop app the launcher cannot read ~/Desktop (macOS privacy), so start `serve.py` from a
shell and use the `moshine-attach` launch config.

## Test

```bash
node --test 'moshine/tests/*.test.mjs'                 # fixtures, golden hashes, CPU reference (no GPU)
node moshine/tools/bench.mjs --tag <tag>               # T0 + T4 in headless Chrome -> ref/bench-<tag>.json
node moshine/tools/bench.mjs --only warpParity
node moshine/tools/golden.mjs --write                  # only when a fixture changes on purpose
sh moshine/tools/build-mvtool.sh && sh moshine/tools/make-media.sh   # once: reference decoder + test clip
node moshine/tools/fidelity.mjs --tag <tag>            # fidelity bench vs real MPEG-4 (fails on a budget)
node moshine/tools/fidelity.mjs --codec h264 --tag <tag>   # ... vs real x264
node moshine/tools/gallery.mjs                         # preset gallery -> tests/media/gallery/index.html
sh moshine/tools/make-media.sh --long && node moshine/tools/bench.mjs --tag x --only slowExportLong   # M4 exit criterion (~10+ min)
```

In the page: Lab ▸ Run tests, or `?harness` and `await __moshineHarness.runAll({ tag: 'x' })`.

## What exists (M1, 2026-10-09)

The Mosh Loop runs on the GPU and on the CPU, bit-identical frame for frame, and the lab drives it.

| File | What |
|---|---|
| `config.js` | The Mosh Loop config: stage schema (ranges, defaults; the lab builds its controls from it), field-op catalogue, style presets, Mosh ID (base64url JSON in the URL hash). |
| `params.js` | `resolveAll(cfg, t)` (keyframes now, modulators in M5), `f32All`, `holdAt` (bloom trigger windows: every n, phase, hits; pure function of t). |
| `engine-ref.js` | CPU reference of every stage: luma pyramid, hierarchical block matching, field ops, warp (nearest / bilinear, pel, scale, zero-on-cut), code stage (residual, intra, block refresh, sweep, hard reset), `createLoopRef` (stores half floats like the GPU), `fieldEPE`. |
| `nodes/pyramid.js` `match.js` `fieldops.js` `warp.js` `code.js` | The WGSL twins, one module per node. |
| `engine.js` | `createMoshLoop(gpu, {w, h}, cfg)`: `begin(t0)`, `step(t, {src, src2})`, `readLast()`. One submit per frame. State = history, previous pyramids, previous estimate, frozen field. |
| `shell.js`, `panels.js` | Shared Program Manager shell (menus, windows, dock, fitted stage + overlay canvas, schema-driven controls) and the Device / Tests windows. |
| `lab.html`, `lab.js` | The algorithm lab: fixtures, image sequences, video (Mediabunny) as source and source 2; live stack editor; views output / source / source 2 / split / CPU diff; overlays (field arrows, grid, SAD, lost/skip/intra flags, truth errors); metrics (cut count, mv stats, EPE vs truth, frame ms); compare with CPU; PNG frame and sequence export; save bench; Mosh ID in the URL. |
| `vendor/` | Mediabunny 1.61.3 (MPL-2.0), unmodified. |
| `tools/make-media.sh` | Generates `tests/media/cut.mp4` (gitignored) for the T1 real-footage row. |

**Conventions that matter**
- Motion field: backward vector, `frame_t(p) = frame_{t-1}(p - mv)`; vec4 per block `[mvx, mvy, mad, flags]`, flags 1 skip, 4 lost.
- Values are display-referred (gamma-encoded) like a codec's Y\'CbCr (D27). Luma weights BT.709.
- Every half-float store rounds to nearest-even in the shader first (`HALF_WGSL`): Apple Metal truncates on that conversion, which drifts feedback loops darker (D28).
- Randomness: `hash3` returns 24-bit fractions, exact in float32, identical in JS and WGSL. Seeds per loop.
- Estimator: λ fades on coarse levels (`2^-level`), sub-pel is data-only, cut threshold 0.05 mean luma error on ≥ 50 % of blocks. These were tuned against fixture truth in node (see `tests/m1-ref.test.mjs`).
- One parameter set per node per submit (uniforms are queue writes).

**Bench m1** (Apple M-series, Chrome headless): 15 T0 rows and the T1 real-footage row pass. Every stage matches the CPU
exactly or within 7e-6; the whole loop is 100 % bit-identical over 120 frames for four presets and on decoded H.264 footage.
Estimator: 826 of 829 truth blocks exact. Cost at 1080p: full Mosh Loop ≈ 14 ms (≈ 70 fps), dominated by the matcher's sub-pel search.

## M2 — the fidelity bench (2026-10-09)

Read `study/fidelity.md`. The simulation is scored against real MPEG-4 ASP moshes made by native libavcodec
(`tools/mvtool.c`, D30) on the same pixels, next to two baselines (frozen, clean).

| File | What |
|---|---|
| `tools/mvtool.c`, `tools/build-mvtool.sh` | Reference decoder: exported vectors, I-frame drop, P-frame duplication. Binary in `tools/bin/` (gitignored). |
| `tools/fidelity.mjs`, `tools/fidelity-budgets.json` | The bench: inputs, real decodes, our loop (CPU, bit-identical to GPU), SSIM/PSNR/vector metrics, contact sheets, lab sets, `--sweep`, budget check (non-zero exit on failure). |
| `metrics.js` | SSIM-8, PSNR, luma601, to8 (node and browser). |
| Lab ▸ Fidelity | Load a set: source = the simulation's input, source 2 = the real decode; view A/B; live SSIM against the real frame with the baselines. |

Engine changes it drove: residual mode `codec` with a dead zone and bloom re-application (D31), the dropped-I-frame
rule at unhonoured cuts (D32), "Xvid classic" retuned (bilinear half-pel + codec residual), "Pure smear" keeps the M1 look.

Results: SSIM against the real mosh 0.91 (fixture) and 0.73 (clip) in the first 10 frames, beating both baselines on
every frame. Harness: 15 T0 rows and T1 `fidelitySets` + `videoCut` pass.

Cost note: T4 wall-clock numbers depend on other GPU users (Jump Desktop streaming was active during M2 and the M1
commit measured 94–124 ms too). Use a quiet machine or move T4 to timestamp queries.

## M3 — the effect library (2026-10-09)

| File | What |
|---|---|
| `fx-ref.js`, `nodes/fx.js` | Twelve image effects (DCT quantise, chroma subsample, deblock, posterise, DCT stripes, echo, displace, block drag, slice tear, RGB split, colour, block freeze) and the chain runner. Each runs in `cfg.inLoop` (feeds back) or `cfg.post` (display only); echo and freeze keep state. |
| `nodes/flow.js` + `flowCells` | Pyramidal Lucas–Kanade per cell: `estimate.method = 'flow'`. With `warp.interp = 'smooth'` (per-pixel field) it is the "Fluid" style. |
| field ops | `amplify` (fastest/slowest p % by rank), `map` (mosh map from source 2's luma). |
| `config.js` | `FX`, `fxDefaults`, `LEGACY` (the twelve DATAMOSHINE presets mapped per spec §6.5), styles incl. H.264 soft (bench-tuned), Fluid, Soft deblocked. `reset.gopKeep`. |
| `tools/gallery.mjs` | Renders every preset on the clip → `tests/media/gallery/index.html` (strips at -5 … +45 frames around the cut). |
| `study/coverage.md`, `tests/coverage.test.mjs` | Every reference-tool operation → node/param; the test resolves every v1/partial name against `config.js`. |
| `tools/fidelity.mjs --codec h264` | The bench against real x264 moshes; budgets in `fidelity-budgets.json` (`h264`). |
| `tools/bench.mjs --page lab.html --expr … --shot x.png` | Headless screenshots of any page (no dev server needed). |

Semantics fixed on the way: the codec residual uses the ORIGINAL estimate and the motion source's stream (D33);
"H.264 soft" retuned from the x264 bench (D34). The harness has 23 rows (GPU vs CPU for every effect, flow, effect
loops); every effect is bit-identical on Metal. 57 node tests.

## M4 — the media pipeline (2026-10-09)

| File | What |
|---|---|
| `media.js` | OPFS media library (`openLibrary`: import with progress, list, file, remove, usage, persist), content ID, `openVideo` (Mediabunny probe: size, duration, fps, frames, audio; `samples()`, `sampleAt()`), `createIngest` (decode ladder: zero-copy `importExternalTexture` or `copyExternalImageToTexture`, GPU bilinear resample to any working size, clamped to [0, 1]). |
| `export.js` | `exportVideo`: sequential render from the range start, WebCodecs encode via Mediabunny `VideoSampleSource` (frames come from an OffscreenCanvas the display is presented to), MP4/WebM into a `StreamTarget` over a positional writable, audio packets passed through and interleaved, progress, cancel. `openTarget` (save picker or OPFS), `encodableCodecs`. |
| `player.js` | Preview playback: decode → ingest → Mosh Loop → present, governed resolution, seek re-keys (D37). |
| `governor.js` | Pure logic with node tests: governor, `fitSize`, `importLimits`, content-ID plan, codec and audio tables, `exportPlan`. |
| `platform.js` `measure()` | Probe v1 (D39). |
| `ui.js` | The app: Media window (import, drop a file anywhere, open, delete, storage, persist), import gate with this device's limits, governed preview, Export window, presets, Device and Tests windows; the fixture demo when nothing is open. |
| `tools/make-media.sh --long` | 10-minute 1080p test clip for the exit criterion (`--only slowExportLong`). |

Harness: T1 `ingestLadder` (the two rungs agree to 0.07 % mean difference), `exportRoundTrip` (6 s through Xvid classic to
MP4: H.264 + AAC passthrough, size, frames and duration match, luma PSNR 42.5 dB, SSIM 0.99 against what was rendered),
T4 `slowExportLong` (opt-in), the exit criterion: the 10-minute 1080p clip exported in full (18,000 of 18,000 frames)
through Xvid classic in 5.1 min (58.9 fps, about twice real time, 966 MB H.264 + AAC); browser memory 6 → 14 MiB before
and after, JS heap sawing between 8 and 69 MiB with no upward trend (`ref/bench-m4-long.json`). `node moshine/tools/bench.mjs --page index.html --expr "…" --shot x.png` drives the app headless
(`window.__app` has `importFile`, `openEntry`, `runExport`, `setPreset`). Each headless run has a fresh profile, so OPFS starts empty.

Not yet: the CPU-copy and WASM decode rungs and Safari/Firefox QA (M8), proxies (v2), workers for decode/encode
(everything runs on the main thread; the UI stays responsive because every stage awaits), audio mixing and time-stretch (M7).

## M5 — timeline v1 (2026-10-10)

Plan and order: the M5 section of the latest handoff. Steps 1 (project model), 2 (command bus), 3 (evaluator), 4 (mosh objects), 5 (modulators), 6 (the editor UI) and 7 (timeline export and the exit rows) are done. What is left of §11.1 is listed at the end of this section.

| File | What |
|---|---|
| `project.js` | The §4 model: factories (`createProject`, `fromConfig` for a one-clip project from a preset or Mosh ID, `mediaFromLibrary`), the effect registry `EFFECTS` (`moshLoop` + the 12 FX types) and intrinsic `TRANSFORM`, `validate` (paths + messages), `migrate` (`MIGRATIONS[n]` per format, `EFFECT_MIGRATIONS[type][n]` per effect version; newer files are refused), `normalize`, canonical `stringify` / `save` / `load`, OPFS `openProjectStore`, `createAutosave`, `.mosh` `saveFile` / `readFile`. |
| `tests/m5-project.test.mjs` | Every preset round-trips through a Mosh Loop instance; 21 validation cases; byte-stable save/load; migrations; rational time; autosave never overlaps. |

Model choices worth knowing:
- A Mosh Loop instance's `params` is the `config.js` config minus `seed` (the instance carries it); any leaf may be animatable, resolved by `params.js`. Ranges are UI hints, not validated.
- `sourceIn` is counted in sequence frames. Clips in a channel are kept sorted and non-overlapping (validation enforces it, so commands must too).
- Markers carry `hit: true` for mosh hits. Media clips carry `transform` (Transform & Blend). MediaRef has `hasAudio`.
- `save()` stamps `modified` into the text only and never mutates the project, so saving is not an edit. `stringify` sorts keys: equal projects give equal bytes, which the undo tests in step 2 rely on.
- Migrations live in `project.js`, not `project/migrations/` as spec §4 says: there are none yet, and a folder can come with the first real one.

| File | What |
|---|---|
| `timeline.js` | `createTimeline(project)`: `exec(name, args, { merge })`, `transaction`, `undo` / `redo` (unlimited), `seal`; 23 `COMMANDS` (add, move, trim, split, delete, paste clips; Bloom Insert; channels; effects; `setValue`; animate, unanimate, set, move, delete key; markers; export range); selection (replace, toggle, range, marquee); copy and duplicate; `snapPoints`, `snap`, `snapDelta`. |
| `tests/m5-timeline.test.mjs` | Every command undone and redone byte for byte; overwrite, trim clamps, split and keyframe placement; Bloom Insert layout; refusals change nothing; merges and transactions; a 400-command fuzz (also passed 30 other seeds). |

How the bus works and what it assumes:
- Commands only touch the project through three recorded operations (set a key, insert, remove). Undo replays them backwards, redo forwards, a refused command is rolled back. Every command is validated after it runs (`check`, on by default) and refused if it leaves the project invalid.
- **Keyframes on clip-owned values are clip-relative** (frame 0 = in-point), and so are a Mosh Loop's `bloom.hits`. Moving a clip carries its animation; trimming the in-point and splitting shift keys so values stay identical at every sequence frame (tested). Channel-stack keys are sequence frames. The evaluator (step 3) resolves clip params at `t - clip.range.in`.
- Editing is non-ripple overwrite: a dropped, moved or pasted clip trims, splits or removes what it covers. Locked channels refuse edits (split skips them). `durationFrames` follows the last clip out-point.
- **Bloom Insert** = split the media clip, insert a `hold: true` clip of `length` frames at the frame, ripple everything later on every channel, grow effect clips spanning the frame (their later keys and hits shift with it), add a red hit marker with `hold: length`. Step 4 wires that marker to the loop's bloom; audio stretch fills the audio gap in M7.
- Slider drags: pass `{ merge: key }` on every exec and `seal()` on pointer up, so the drag is one undo step.

| File | What |
|---|---|
| `sequence.js` | The evaluator, shared by both backends: `layersAt`, `replayStart`, `createEvaluator(project, backend)` with `render(t)` -> `{ image, from }`, `invalidate()`. Transform & Blend math: `baseSize`, `placement`, `placeRef`, `blendRef`, `mediaIndex`. `cpuBackend` (Float32Array images, node tests and harness). |
| `nodes/composite.js` | GPU `createPlace` and `createBlend`, twins of `placeRef` / `blendRef`. |
| `render.js` | `gpuBackend`, `createSequenceRenderer(gpu, project, { w, h, sources })`, `videoReader(video)` (sequential decode, re-seeks on jumps). |
| `tests/m5-sequence.test.mjs` | One-clip = bare loop (3 presets), seek = playback, split resets, edits replay, moves carry the mosh, warmup, compositing, bypass, solo, clip stacks, media index. |
| harness T0 `compositeParity`, `sequenceParity`, `sequenceSeek`; T1 `sequenceVideo` | Place and blend exact on Metal; GPU sequence = CPU sequence bit for bit (one clip, and two layers with transform, screen blend, rgbsplit, displace, echo, Xvid classic); seek = playback; real video 48 of 48 frames = the M4 path. `ref/bench-m5-step3.json`. |

How evaluation works:
- Every clip effect runs on **clip-local time** (`t - in`): a Mosh Loop gets `begin(0)` at the in-point (or `begin(-warmup)`), so a one-clip timeline is exactly the M4 loop, and keyframes and hits line up with step 2's clip-relative storage.
- **Replay until M6:** `render(t)` steps once when every stateful effect active at t is one frame behind; otherwise it replays from the earliest in-point involved. Effects notice their own param edits; call `invalidate()` after any edit, because an edit below an effect clip changes its input.
- **Contraction-proof compositing.** Metal fuses multiply-adds, which broke bit parity for scaled or rotated placement and partial-opacity blends. Placement geometry is integer fixed point (1/1024 px) with 1/64 bilinear weights; blend coverage is alpha x opacity in 1/4096 integer steps, and the mode result is rounded to half before mixing. Every float product is then exact (half-float pixel x a weight of 12 bits or fewer), so fused or not gives the same bits. Identity is still an exact copy. Use this pattern for any new mixing kernel.
- The CPU fx backend rounds stateful effect state to half after each call, as the GPU texture does; that made `echo` exact. `createLoopRef` has the same gap (a follow-up task was flagged).
- Not yet: Mosh Loops on a channel stack (warned and skipped), `reset: 'continue'` (behaves as `atIn`), `inputs.media` (only `inputs.source2.channel`, and only from a channel below). The CPU reference does not resample media (fixtures must be at base size).

Mosh objects (step 4):
- **Mosh hits** are markers with `hit: true`. Every Mosh Loop turns the hit markers inside its clip into clip-local bloom triggers (`sequence.js` `loopConfig`), unless its new `bloom.markers` param is off. A marker's `hold` sets that trigger's own hold length, else the loop's `bloom.repeat` applies. Moving a hit changes the loop's config signature, so the next render replays.
- **`holdAt` (params.js)** now takes hits as frame numbers or `{ at, len }`, and fires hits that carry their own length even when `repeat` is 0. The engine call sites (`engine.js`, `engine-ref.js`) always pass the bloom. Existing configs behave identically: bench `ref/bench-m5-step4.json` and fidelity budgets pass with unchanged scores.
- **Bloom Insert** (step 2's command) now renders end to end: the held source plus its marker's `hold` freeze the field over the held frames (tested against a bare loop on the same frames).
- **Mosh Cut** = timeline command `moshCut({ channelId, frame, length?, pre = 1, preset = 'Xvid classic' })`. At a join between two media clips it adds an effect clip (`label: 'Mosh Cut'`, `role: 'moshCut'`) from `pre` frames before the join to `length` frames into B (default 2 s, clamped to B), on the first free effect channel above or a new one. A's last frame is the loop's I-frame and B's cut is a dropped I-frame (D32), so the cut frame shows A's last frame exactly and B's motion moves it after.
- Triggers still to come with the modulators (step 5): every-n as a modulator (bloom `every` / `phase` already exist), manual, and onsets (M7).

Modulators (step 5):
- **`params.js`**: `MODULATORS` lfo (sine, triangle, saw, sawDown, square; rate Hz, phase), noise (freq Hz, octaves; value noise on `hash3`), randomHold (rate Hz), trigger (source every / hits / manual, hold and decay in frames). `modulate` applies mods in order: add `v + d·y`, multiply `v·(1 + d·y)`, replace `d·y`, then the modulator's clamp. Unknown types (audio before M7, macro, expr) pass through. `resolve(v, t, clock)` / `resolveAll(cfg, t, clock)` apply keyframes then mods; `curve(v, from, to, clock)` gives `{ base, value }` per frame for the ghost curve; `modulatorDefaults(type)`.
- **The clock** `{ fps, seed, hits }`: rates are in Hz, so resolution needs the frame rate. `sequence.js` `clockOf(seq, clip, seed)` builds it per clip in clip time (hits = the clip's hit markers). The Mosh Loop gets it as `cfg.clock`, and both engines call `resolveAll(cfg, t, cfg.clock)`; transforms and clip FX get it directly. With no clock: 30 fps, no hits (the lab, Mosh IDs). Modulators are pure functions of `(t, clock)`, so replay, seek, GPU and CPU agree.
- A trigger modulator on any numeric param drives it from hits, every n or manual frames, e.g. `reset.blocks` in replace mode = a hit-driven refresh (tested: a full refresh on the hit frame). Bloom's own triggers stay `bloom.every` / `phase` / hits (step 4).
- **Commands**: `addModulator({ id, path, mod, index })`, `removeModulator({ id, path, index })`. Edit a modulator with `setValue` on `[..., 'mods', i, 'depth']` etc.
- **Parity finding**: modulators make effect params arbitrary fractions, which exposed drift in the M3 FX kernels (echo's mix, rgbsplit at fractional shifts: Metal fuses multiply-adds). `sequenceParity` is exact for one clip and for layers with every modulator kind; its `fxMix` case (echo plus a modulated rgbsplit) is close, at most 0.00024 apart, until the FX library gets the contraction-proof pattern (a follow-up task was flagged).

The editor (step 6):

| File | What |
|---|---|
| `ui.js` | Rewritten around a project. Start-up reopens the last project from the OPFS store (autosave), else a demo project on the 'cut' fixture (`?demo` forces it, `?bench` too). Media window: ADD puts a library clip at the playhead on the selected video channel (`addMedia` + `addClip`, one undo step); the first clip of an empty project sets the sequence size and frame rate. Preview: `createSequenceRenderer` at the tier's preview cap x the governor's scale; `pump()` renders the wanted frame and drops intermediate scrub frames; the overlay shows replays. Menus: File (new, open / save .mosh, rename, recent, demo, import), Edit, Effects (mosh the selection, presets), View (preview scale, zoom), Export, Lab, Help. Keyboard map in Help. `window.__app` for the bench. |
| `tlview.js` | The canvas timeline: DOM heads (L / B or M / S) and one canvas for the ruler and lanes. Ruler: time codes, a red / yellow status bar (stateful / stateless; M6 adds green and checkpoint ticks), markers, hits with hold bars, export range, playhead. Lanes: clips by kind, reset bar, warm-up, Mosh Cut outline, selection, drag ghosts. A keyframe lane under the shown parameter: diamonds plus base and modulated (ghost) curves. Interactions: move (snapping, across channels), trim, blade, marquee, ruler scrub, marker and key drags, double-click to add a key, wheel scroll, Cmd/pinch zoom at the cursor, one-finger pan on touch. Pure geometry (`layoutRows`, `hitTest`, `rulerStep`, `timecode`) is node-tested. |
| `inspector.js` | The Stack pane: clip properties (Transform & Blend and hold; reset policy and warm-up), the stack (enable, reorder, remove, add, preset), and the selected effect's parameters (all Mosh Loop stages, field ops, in-loop and post lists, FX params, seed). Each row: stopwatch, name (click = show in the keyframe lane), control, value, ∿ modulator slots (+LFO, +NOISE, +RAND, +TRIG with mode, depth and params). Rebuilds only when the structure changes; values update in place so a slider being dragged survives. |
| `ui.css` | Desk grid (preview and stack over the timeline), tablet (< 1100 px: the stack floats), phone (< 640 px: preview on top, timeline and stack as bottom sheets), touch sizes. |
| `timeline.js` `addMedia` | New command: add a MediaRef, reusing one with the same content hash. |
| harness T0 `editorSmoke` | Real pointer drags on the canvas: trim, move along and across channels, marquee, scrub; 4 undo steps; undo-all restores the project byte for byte. `ref/bench-m5-step6.json`. |

Gotchas from step 6: rows are rebuilt on every draw, so compare channels, not row objects, across a drag (that bug made a move refuse with "no channel there"). Declare `play` before `window.__moshine`, because the bench reads it during the module's start-up awaits. The bench sizes the window after load, so check the phone layout in the browser pane at the mobile preset.

Timeline export and the exit rows (step 7):
- **`export.js`**: one shared `createEncoder` (Mediabunny output streamed to the target, a canvas-fed video source, interleaved audio pass-through) under both `exportVideo` (M4, unchanged behaviour: `exportRoundTrip` still passes) and the new **`exportSequence`**. It uses a fresh sequence renderer, never the preview's (D37), renders the range sequentially from its first frame (a range starting inside an effect clip replays from that clip's in-point), and encodes each frame as it is made. `passThroughAudio(project, range)`: audio is passed through only when exactly one untouched media clip at the sequence rate covers the range; otherwise it is dropped with a reason (the mix is M7).
- **Export window** (`ui.js`): container, size (sequence / half / 720p, capped by the tier), quality, range (auto, whole, I–O), audio, with progress, cancel and a DOWNLOAD link for OPFS targets. The preview pauses while exporting.
- **T1 `timelineExportM4`**: on `cut.mp4`, a one-clip timeline export equals the M4 export frame for frame (48 of 48 hashes before encoding, at an aspect-matched 320×180); both files decode to 48 frames with AAC passed through.
- **T1 `timelineEditedVideo`**: split with a real cut, Mosh Cut, a hit, Bloom Insert. Seeks on fresh renderers at 20, 45, 63 and 80 equal playback; the export equals the preview on all 98 frames; the file decodes to 98 frames. `ref/bench-m5-step7.json`: 23 T0 and 7 T1 rows pass.
- **Determinism bug found by that row, fixed**: a replay queues many frames without waiting for the GPU. When the media reader re-seeks (a jump in source frames, e.g. at a split), closing the decoder freed frames that queued commands still read through zero-copy external textures, so pixels varied between runs. `videoReader` now awaits `beforeSeek` before closing the decoder, and `gpuBackend` sets it to `queue.onSubmittedWorkDone()`: one sync per jump. Anything else that closes decoders or VideoFrames while a replay is queued must do the same.

**§11.1 items closed after step 7** (T0 `editorItems`, `ref/bench-m5-items.json`):
- Keyframes: under an animated parameter, ◂ / ▸ jump to the previous / next key and a select sets the interpolation of the key at or before the playhead (hold, linear, ease in / out / in-out). `[` and `]` jump keys of the parameter shown in the keyframe lane.
- Stacks: COPY, PASTE (Shift replaces), SAVE PRESET… and ★ × in the stack pane. New commands `pasteStack` (fresh ids), `savePreset` (drops `inputs`), `deletePreset`. Presets live in `project.presets` (spec §4), are validated, migrated and listed first in the preset select; applying one adds its stack.
- Effects browser (Effects ▸ Effects browser…, ⌘E): every effect type, searchable; ADD puts it on the selected clip, CLIP makes an effect clip over the selection (`A.effectClip`, which now also backs "mosh the selection").
- Mosh ID for projects: `toMoshID` / `fromMoshID` in project.js ('P1.' + base64url of the deflated canonical JSON without UI state; about 1.3 kB for the demo). File ▸ Copy Mosh ID link / Open a Mosh ID…; a `#P1.…` hash opens it at start-up and names media missing from this browser's library (media is matched by content hash). The lab's config Mosh ID is unchanged.
- Trigger modulators: a frames field for the manual source.

Still open: J reverse steps back by replaying, slow until M6's checkpoints; pinch zoom needs a check on a real touch device.

## M6 — cache and scrubbing (2026-10-10)

Exit criterion (spec §13): scrub anywhere in a 5-minute moshed sequence in under 100 ms on tier 2, so at most about a dozen replayed frames per seek. Steps:
1. **Snapshot and restore** of the Mosh Loop and FX state — done.
2. **An in-memory checkpoint store** — done.
3. **Spill to memory and OPFS** — done.
4. **Ruler coverage, ticks, background fill** — done.
5. **The exit test** — done (results below). Originally planned as: an in-memory checkpoint store in the evaluator: every stateful instance checkpoints on a shared grid of sequence frames (every K), so a seek resumes from the nearest consistent cut. VRAM budget, invalidation (whole store, then from the edited frame on).
3. Spill to CPU memory, then OPFS (lossless, D22); the governor raises K under pressure.
4. Ruler: green for cached, checkpoint ticks; background fill when idle.
5. Harness rows: seek with checkpoints = playback; exit timing on a 5-minute sequence.

Step 1:
- `engine.js` `snapshot()` / `restore(snap)`: GPU copies of what the next step reads — history, previous source, bloom's frozen source, frozen field and estimate, the previous luma pyramids (source2's only once written: `S.ever2`; a restore zeroes them otherwise), the previous estimate — plus the loop counters and the FX chains' stateful outputs (`nodes/fx.js` `snapshot(enc)` / `restore(enc, snap)`). A snapshot is a list of `parts` (`{ name, kind: 'tex' | 'buf', obj }`) for step 3 to move off the GPU, `bytes`, and `destroy()`.
- `engine-ref.js`: the CPU twin (state fields are replaced, never mutated, so references suffice).
- Tests: `tests/m6-checkpoint.test.mjs` (CPU) and T0 `checkpointParity` (GPU), covering a restore after a 6-frame detour and a restore into a new loop, for Xvid classic, Bloom pulse, Fluid (flow), Packet loss, Soft deblocked (in-loop fx), Phantom Trail (post echo), Motion Hijack (source2), Healing GOP, and a hit inside a hold: bit-exact. `ref/bench-m6-step1.json`; fidelity unchanged.
- **Size: 10.5 MiB per checkpoint at 540p** (history 4.1, previous source 4.1, pyramids 2.7). A 5-minute sequence at K = 12 needs about 750 of them (about 8 GB), so step 3's spill is not optional; VRAM holds the hot ones near the playhead.

Step 2 (the store, in `sequence.js`, shared by both backends):
- **Grid**: after rendering frame f, when f + 1 is a multiple of K (default 16), every stateful instance that stepped at f is snapshotted: the checkpoint at g = f + 1, a consistent cut through stacked effects. `render(t)` resumes from the latest valid checkpoint after the cache-free replay start (`replayStart`), restoring every effect active across g that started before it (creating instances a fresh evaluator lacks), and replays fewer than K frames. It returns `{ image, from, checkpoint }`; `cache()` gives `{ K, budget, frames, bytes, deposits, restores }`; `clearCache()`.
- **Invalidation needs no app help**: each saved state carries `depSig`, a hash of its config (with only the hits before g), its clip, the frame rate, every live channel below it (stacks and the clips overlapping [its start, g)) and their media. A checkpoint is used only when every needed state's signature still matches, so edits after g or above an effect keep it. `invalidate()` now only resets step positions. Conservative: a keyframe anywhere on the effect's own clip voids that clip's checkpoints (refine later if it hurts).
- **Budget**: whole checkpoints are evicted farthest from the last frame asked for. The editor uses K = 16 and half the tier's `gpuBudget`; the overlay shows "replayed n frames from checkpoint g" and the cache size.
- Standalone clip-stack FX (echo, freeze) snapshot too (`fx().snapshot()` / `restore()` in both backends).
- Tests: `tests/m6-store.test.mjs` (seeks within K of playback; an edit at 40 keeps checkpoints up to 40; a hit at 65 keeps 64; a small budget keeps the near ones). T0 `checkpointStore` (GPU: seeks replay 2–8 frames, the CPU evaluator agrees on all 40 frames). T1 `timelineEditedVideo` now also checks cached seeks on real video. `ref/bench-m6-step2.json`.

Step 3 (spill, `cache.js` + the store in `sequence.js`):
- **Tiers per checkpoint**: `gpu` (live snapshots) → `cpu` (packed bytes after a lossless readback) → `disk` (one file) → evicted. A janitor (a promise chain after each deposit, never awaited by rendering) demotes the entry farthest from the last frame asked for while a tier is over budget. A restore promotes a cold entry back to the GPU first (`loads`). Options: `budget` (GPU), `cpuBudget`, `disk`, `diskBudget`, `adaptK` (K doubles, up to 256, when the last tier evicts: fewer checkpoints, never lossy, D22). `settle()` waits for the janitor; `cache()` reports `tiers`, per-tier bytes, `spills`, `loads`, `kRaises`; `setK()`.
- **`cache.js`**: `pack` / `unpack` (a snapshot is any tree of plain data with binary leaves; getters and functions are dropped and re-added on deserialize), `encodeFile` / `decodeFile` (meta JSON plus length-prefixed chunks), `cpuSerializer`, `gpuSerializer(gpu)` (one submit copies every texture and buffer into mappable buffers, rows unpadded; deserialize recreates them with `writeTexture` / `writeBuffer`), `openDiskCache(session)` (OPFS `moshine-cache/<session>/`, removing other sessions' folders: caches never outlive a session), `memoryDiskCache()` for node. Each backend exposes `serializer`. File names carry a per-evaluator tag, because renderers rebuilt on a preview resize share the disk tier.
- **Editor**: memory up to a quarter of `navigator.deviceMemory` (1 GiB at most); disk up to 30 % of free quota (8 GiB at most); the overlay shows "cache g gpu · m mem · d disk (K)".
- Tests: `tests/m6-store.test.mjs` (+3: seeks restored from memory and from disk are exact and replay fewer than K frames; a capped disk raises K; pack / file / serializer round trips). T0 `checkpointSpill` (GPU + real OPFS: entries on all three tiers, seeks from each exact, files removed on destroy). `ref/bench-m6-step3.json`: 27 T0 and 7 T1 rows pass.
- Not yet: writes go through `createWritable` on the main thread. Spec §3.2 puts cache I/O in a worker with `createSyncAccessHandle`; move it there if step 5's timing needs it.

Step 4 (the cache made visible, and filled when idle):
- **`seekCost(t)`** (evaluator): frames a seek would render with the cache as it is, without rendering (a cold replay start, then the latest valid checkpoint). **`coverage()`**: `spans` over the sequence — green (a seek renders at most K frames), red (a longer sequential replay), yellow (stateless, always live), none where nothing renders — plus `ticks` `{ g, tier, ok }`. Signature checks are memoised per edit revision (bumped by `invalidate()`); `render()` always checks fresh. Long sequences are sampled (20,000 samples at most).
- **Ruler** (`tlview.js`, `coverage` option): the bar draws the spans; ticks under it show checkpoints by tier (black GPU, grey memory, blue disk, hollow void). Without a renderer it falls back to the stateful red / stateless yellow view.
- **Background fill** (`ui.js` `fillStep`): after 500 ms without input, playback or export, it renders toward the first red frame — the export range first, then ahead of the playhead, then behind — inside the span the budgets can hold. A step renders at most 4 K frames and stops at once on any input (`render(t, { stop })`). It shares the preview's render lock. Coverage is recomputed at most about 3 times a second.
- Tests: `tests/m6-store.test.mjs` (+1: in-point and checkpoint green, red elsewhere; `seekCost` predicts the `from` a real render uses; an edit at 40 voids the ticks after it). T0 `editorFill` (an edit turns the ruler red; the fill turns it green again; a seek during a fill shows the cache-free pixels). `ref/bench-m6-step4.json`: 28 T0 and 7 T1 rows pass.

Step 5 (the exit test, `ref/bench-m6-scrub.json`):
- **T1 `slowScrub5min`** (slow, opt-in: `node moshine/tools/bench.mjs --only slowScrub5min`, about 1 min): 5 minutes (9,000 frames) of `long1080.mp4` under Xvid classic, previewed at 960×540 with the editor's budgets (GPU 384 MiB, memory 1 GiB, OPFS 8 GiB). Filling the cache by playing through once takes 33 s (275 fps). Then 30 random seeks, each checked against the playback pixels.
- **Result on this Mac (tier 3), K = 8: median 54 ms, p90 75 ms, worst 97 ms; 30 of 30 seeks exact.** 1,125 checkpoints (48 GPU, 128 memory, 949 disk, about 7.5 GB). With K = 16: median 69 ms, worst 122 ms. The editor now uses K = 8.
- Changes that got it there: checkpoints dropped to **7.9 MiB at 540p**, because the luma pyramid is rebuilt from the stored previous source on restore when that source was the plain input (`S.prevIsSrc`; source2 hijacks still store it; still bit-exact). The decoder's seek to the checkpoint frame runs in parallel with the checkpoint restore (`backend.prefetch`; `videoReader.frame` is now serialized).
- **What a seek costs now**: decoding from the previous keyframe to the checkpoint (32 ms median, 48 ms worst: this clip has a keyframe every 120 frames at 1080p), then at most 7 mosh frames at about 3.2 ms each, plus the restore. **Tier 2 is not verified** (no tier 2 device here). Two levers if it misses there: (1) a preview proxy (a short-GOP, preview-size transcode made at import, used by both playback and scrubbing so they stay identical; export keeps the original), which removes most of the decode term; (2) the matcher in workgroup shared memory (open thread 2), which cuts the per-frame mosh cost.

## M7 — audio (2026-10-10)

Exit criterion (spec §13): an audio-reactive preset works; stretched audio exports in sync. Steps:
1. **Audio features at import** — done.
2. **Audio modulators** — done. Planned as: audio modulators (feature, smoothing) on the clock, and audio-reactive presets.
3. **The stretch model and the JS stretcher** — done. Planned as: the stretch model: Bloom Insert gives the linked audio clip a stretch segment (the audio around the hold slows to fill it, back in sync after); a WSOLA stretcher in JS (deterministic; signalsmith-stretch from the spec needs the owner's OK to vendor and can replace it behind the same interface).
4. **Playback** — done. Planned as: WebAudio, scheduled from the sequence clock (video drives; audio re-syncs on drift).
5. **The export mix and the exit rows** — done (below).

Step 1:
- **`features.js`**: a streaming extractor (`createFeatureExtractor({ sampleRate, fps })`, `push(mono)`, `finish()`): one row per video frame — rms, bass (< 150 Hz), mid (150 Hz – 2 kHz), high (> 2 kHz), onset (the rise of band energy over the previous 4 frames) — each normalised to 0..1 by its 99th percentile. RBJ biquads whose state carries across chunks (results do not depend on chunking), plain double arithmetic (deterministic). `featureAt(table, name, i)`, `encodeFeatures` / `decodeFeatures`.
- **`media.js`**: `analyseAudio(video, fps)` streams `AudioSampleSink` samples, mixes them to mono and runs the extractor (6 s of AAC in about 40 ms). The library stores tables as `<id>.features` next to the media (`setFeatures`, `features`; removed with the media).
- **Editor**: a video with sound also gets its **linked audio clip on A1** (same range; one undo step with the video). `ensureFeatures(hash)` loads or analyses in the background — on import, when added, and for every media item of an opened project — into `featureTables`, keyed by content hash (the same file always gives the same table; the project does not need to reference it).
- Tests: `tests/m7-features.test.mjs` (a bass tone lands in bass not high and vice versa; silence is 0; onsets at the starts, not on held tones; chunk-independent; storage round trip). `ref/bench-m7-step1.json`.

Step 2 (audio modulators):
- **`params.js`**: modulator `audio` (feature rms / bass / mid / high / onset, `smooth` = mean over the last n frames; unipolar 0..1); the trigger modulator's new source `onsets` (onset peaks at or above `threshold`). Both read `clock.audio(name, t)`; without it they are silent.
- **The clock** (`sequence.js` `clockOf(seq, clip, seed, project, features)`): `audio(name, t)` is the feature heard at the clip-local frame — the topmost unmuted audio clip, else the topmost video clip with sound (`audibleAt`), mapped through sourceIn and the stretch map (`soundIndex`). `audioKey` lists the feature tables in play; it is part of every config signature (loops, and stateful clip effects' `depSig`), so checkpoints made before a table arrived are never reused after. Evaluators take `features` and pass project and features explicitly (`LC` / `CK`); the editor's registry `audioFeatures.get` and `setClockProject` are only the defaults.
- **`bloom.onset`** (threshold, 0 = off): onset peaks inside the clip become bloom triggers (`onsetHits`, cached).
- **Presets** (Looks strip): **Bass pump** (bass pushes a Multiply field op), **Onset bloom** (onsets trigger 12-frame blooms), **Beat heal** (onsets refresh blocks through a trigger modulator on `reset.blocks`). On silent media they show their base look. The stack pane's ∿ panel has + AUDIO.
- Tests: `tests/m7-modulators.test.mjs` (the modulator and smoothing; onset triggers at peaks; the clock through sourceIn; audioKey; a reactive preset changes frames only where the bass is, deterministically; onsets become bloom hits only with a table).

Step 3 (the stretch model and the stretcher):
- **`audio.js`**: an audio clip's `stretch: [{ at, len, span }]` (clip-local frames): source frames [at, at + span) play over span + len frames. `audioSourceAt(clip, local)` (fractional source position), `audioPieces` (constant-rate pieces for playback and export), `audioCut` (the part after a cut, segments folded into sourceIn), `insideStretch`.
- **Bloom Insert** now gives an audio clip that spans the insert point a segment `{ at, len, span: len }` and extends it by len, instead of splitting it and leaving a gap: the sound slows to half speed over the hold and the frames after it, and is back in sync with the picture after (tested). Splits and trims before or after a span carry the segments; a cut inside a span is refused (it would need a fractional sourceIn). Validation checks the segments.
- **`stretch.js`** `wsola(channels, outLen)`: WSOLA in plain JS (1024-sample Hann frames, half-frame hop, ±256-sample cross-correlation search on the mono mix, the same positions for every channel). Exact output length, pitch and loudness kept (tested on sines, both directions, stereo), deterministic, ratio 1 is a copy. Replaceable by signalsmith-stretch behind the same function if the owner OKs vendoring it.
- `ref/bench-m7-step3.json`: 30 T0 and 7 T1 rows; 134 node tests; fidelity budgets pass.

Step 4 (playback):
- **`mix.js` `mixBlock({ project, seq, s0, s1, sr, nch, decode, cache })`**: mixes every clip on the audible audio channels (unmuted; solo respected) into absolute samples [s0, s1) of the sequence clock: gains, linear resampling, mono and stereo mapping, and stretch pieces (`audioPieces`; WSOLA over the whole piece, cached, then sliced). Source positions are one division of integer products, and `decode` returns the media sample index of its first sample (`first`), so mixing a range in one block equals mixing it in any number of blocks (exact at 48 kHz, within 1e-5 at 44.1 kHz; tested). A video clip's own sound is not played: its linked A1 clip is (no doubled audio). The export mix (step 5) uses the same function.
- **`media.js` `createAudioDecoder(video)`**: `decode(t0, t1)` → `{ sampleRate, first, channels }` from `AudioSampleSink`, placed by sample timestamps.
- **`audioplay.js` `createAudioPlayer`**: half-second blocks queued back to back at exact AudioContext times, a second ahead; `start(frame)` starts the sound at the frame the picture will have reached after the 80 ms lead; `expectedFrame()`; `prime()` creates and resumes the context inside the user gesture (Safari needs that; Play, space, K and L call it).
- **Editor**: SOUND toggle in the transport; the sound plays while the picture plays forward; an edit restarts it with the new mix; drift over 3 frames re-syncs it to the shown frame (the picture drives: a mosh may render slower than real time). Scrubbing and reverse are silent. Measured in the browser pane with a trusted click: the context runs and the sound stays 0.2–0.4 frames from the picture (at most 1).
- Headless Chrome keeps AudioContexts suspended (no user gesture), so the player clock is checked in the browser pane; T1 `soundMix` checks the mixer against the decoder on real AAC (difference 0). Tests: `tests/m7-mix.test.mjs`. `ref/bench-m7-step4.json`.

Step 5 (the export mix, M7 done):
- **`export.js` `audioPlan(project, range)`**: the export hears what playback hears, the audible audio clips (a video clip's own sound is never heard; its linked audio clip is). One untouched clip (unit gain, no keys or modulators, no stretch, covering the range, media at the sequence rate) passes its packets through, exact and cheap; anything else is mixed; no audible clip means no audio, with a reason. The Export window says which and with what codec.
- **The mix**: `mixBlock` (the playback mixer) in one-second blocks with one stretch cache, clamped to ±1, 48 kHz stereo, encoded by our own WebCodecs `AudioEncoder` (AAC in MP4, Opus in WebM, `mixCodec` picks what this browser can encode) into a Mediabunny `EncodedAudioPacketSource`, never more than a block ahead of the video.
- **Encoder delay**: WebCodecs labels the first packet 0 although it begins with the encoder's priming (2112 samples for Apple's AAC), so an unshifted file plays 44 ms late. `encoderDelay(codec, sr, nch)` measures it once per browser (a burst encoded and decoded) and the packets are shifted back by it; Mediabunny then writes the edit list that hides the priming. Measured: clicks land at 0 ms error.
- **`mix.js`**: gain is resolved per sequence frame inside a block (a keyframed gain no longer steps per block).
- **Test media**: `make-media.sh` writes `beat.mp4` (6 s testsrc2 320×180, a 10 ms 2 kHz click every 0.5 s from 0.2 s = frames 6, 21, 36, …).
- Rows: T1 `audioReactive`, `exportMix`; `timelineExportM4` now has its linked audio clip and checks pass-through; `timelineEditedVideo` exports a mixed, stretched clip. Node: `tests/m5-export.test.mjs` covers `audioPlan`. `ref/bench-m7.json`: 30 T0 and 10 T1 rows pass; 140 node tests.
- Pass-through is in sync too (`exportMix` also exports beat.mp4 untouched: clicks at 0 ms error). Not checked: Opus delay on other browsers (M8), and the 27 ms AAC tail padding (the edit list could trim it).

## Owner requests (2026-10-10)

Recorded in spec §13.1 (R1–R5). Agreed order: R1 and R4 first, then R3 masks, then R2 vector painting; R5 when the owner's `moshine/icon.svg` lands.

**R1 — done.** No black between the docked panes: the desk is the panes' grey and each pane keeps only its inner window frame (`#ms-desk.ed` in ui.css).

**R4 — first pass done** (the mask and vector parts arrive with R3 and R2, on the same preview):
- **Empty project → drop zone** in the preview (`#ms-empty`): IMPORT VIDEO… and TRY THE DEMO. Importing puts the clip on the timeline, selected and previewing.
- **Looks strip** under the transport (`#ms-looks`, `thumbs.js`): every style and legacy preset as a card with a live thumbnail of the clip — 24 frames ending at the playhead, run through each preset at thumbnail size on the GPU, debounced and redrawn on selection, media or paused-playhead changes, never while playing or exporting. One click applies a look to `lookTarget()`: the selected mosh clip; else the mosh above the selected media clip; else the topmost mosh at the playhead; with none, it creates one over the clip. Mosh clips are labelled with their look (shown on the timeline); the current look is highlighted. One undo step.
- **Essentials** for the Mosh Loop in the stack pane: detail returns (residual gain), healing (block refresh), bloom length and every, keep cuts, smear look (sampling), motion gain (the first Multiply field op, with a + MOTION GAIN button), block size. ALL PARAMETERS shows every stage, field op, in-loop and post effect and the clip's reset and warm-up. Editing an animated parameter, or turning its stopwatch on, shows it in the keyframe lane.
- Verified headless: import, look, keyframe, curve (screenshot `study/ux/editor-r4.png`); phone layout in the browser pane. `ref/bench-r1r4.json`: 28 T0 and 7 T1 rows pass; 118 node tests.

**R3 — masks, done** (`masks.js`; screenshot `study/ux/editor-r3.png`):
- **Model**: an effect clip's `masks`: `{ id, mode: 'include' | 'lock', enabled, invert, feather, x, y, scale, rotation, opacity, shapes }`. Shapes are brush strokes `{ type: 'stroke', pts: [u, v, ...], r }`, ellipses and rects, in sequence space (u across the width, v down the height; radius and feather are fractions of the height). x, y, scale, rotation and opacity are animatable (keyframes, modulators), clip-relative like every clip value; trims and splits shift them. Validated in `project.js`; indexed in `timeline.js` (kind `mask`), so `setValue`, keyframes and locks work on them. Commands: `addMask`, `addMaskStroke` (a stroke or a shape, creating the mask if needed; one undo step), `removeMask`.
- **Meaning**: coverage = (union of include masks, or 1 with none) × (1 − union of lock masks); the mosh's output is mixed with the clean composite below by it (`applyMasks` in the evaluator). Masks do not touch loop state, so `depSig` leaves the clip's own masks out: painting never voids its checkpoints (tested). Effects above still see them.
- **Bit-exact GPU and CPU**: the mask is rasterized in JS (`rasterMasks`, at most 512 px on the long side, coverage in 1/1024 steps, cached by key, so static masks are rasterized once) and both backends upload those bytes. The contraction-proof place kernel resamples it; the new `maskmix` kernel (`nodes/composite.js`, twin `maskmixRef`) mixes with exact products like `blend`.
- **Editor**: MASK and LOCK brushes in the transport (G, Shift+G; Esc ends), size slider, SHOW (dims what the mosh does not reach, from the same raster) and CLEAR, painting on the preview over `lookTarget()`'s mosh with a live stroke. The stack pane has a **Masks** group per mosh: enabled, invert, feather, x, y, scale, rotation, opacity (each with stopwatch and ∿), delete, and + ELLIPSE / + RECT for MASK or LOCK.
- **Bug found and fixed on the way**: the **screen** blend was not contraction-proof (1 − C can need 13 bits, so (1 − C)(1 − L) rounded and Metal fused it). Both twins now round 1 − C and 1 − L to half first. `sequenceParity` gained a `composite` case (the effect channel bypassed, 40 frames), so composite drift can no longer hide behind a loop.
- **Test-harness rule**: rows that call `app.renderer.render()` directly must hold `app.play.busy`, because the idle background fill renders on the same renderer (`editorMasks` failed in the full run until it did; `editorFill` now does too).
- Tests: `tests/r3-masks.test.mjs` (raster shapes, union, lock, invert, feather, transform, opacity; left-half include = full mosh there and clean source elsewhere, exactly; a full lock = clean; strokes keep checkpoints; keyframed x). T0 `editorMasks` (a lock stroke painted with pointer events; a locked pixel equals the clean render; undo restores). `sequenceParity` has masks in its fixture. `ref/bench-r3.json`: 29 T0 and 7 T1 rows pass; 121 node tests.
- **Locks are inert (D40, 2026-10-10):** both loop twins take `lock` (the lock masks' keep coverage, `masks.js rasterLock`, placed by `backend.mask(clip.id + ':lock')`) and mix the history back to their input under it after the code stage and the in-loop FX, so nothing builds up under a lock. Lock masks are in `depSig`. Stateful clip FX (echo, freeze) still keep state under a lock; their output is masked.
- Not yet (from spec §13.1): mask tracking (follow motion automatically) and on-canvas handles to move or scale shapes (use x, y, scale and rotation in the stack for now).

**R2 — painted motion vectors, done** (`vectors.js`; screenshot `study/ux/editor-r2.png`):
- **Model**: a Mosh Loop field op `{ op: 'paint', amount, mode: 'add' | 'replace', strokes }` (config.js `OPS.paint`, `OP_CODE` 10), ordered with the other field ops. A stroke is a drag `{ pts: [u, v, ...], r, s }` in sequence space; r (brush radius) and s (push per frame) are fractions of the height, so painted motion is resolution-independent (paint at 540p, export at 1080p: the same motion). `amount` is animatable (keyframes, modulators). Inside the brush the motion follows the drag's direction (soft edge half a radius wide); 'add' pushes the estimate, 'replace' overrides it where coverage is at least 0.5 (with `estimate: none` that is fully authored motion).
- **Bit-exact (D28)**: `paintField(op, { w, h, block })` rasterizes one vec4 per block with the amount applied and its inputs rounded to float32 first (the CPU sees the config through `f32All`, the GPU does not). The GPU field-op kernel only adds (`v + d`) or selects; the painted field is a storage buffer (binding 4) uploaded when `paintKey` changes. The CPU twin calls the same function.
- **`displace` made contraction-proof**: painted fields are arbitrary fractions, which made `displace` (M3) drift. It now uses integer displacement (vector and gain quantized to 1/64, multiplied as integers, in 1/4096 px) and 1/64 bilinear weights (`bilQ` / `bilinearQ`), the composite pattern. The rest of the FX library (echo's mix, rgbsplit's motion term, …) is still the flagged follow-up task, and `fxMix` in `sequenceParity` is still "close" for those.
- **Editor**: VECTOR brush (V) in the transport, a push slider and add / replace; drag on the preview to paint into `lookTarget()`'s Mosh Loop (`addVectorStroke`, one undo step; one paint op per loop). SHOW or the active brush draws the painted field as arrows (4 frames of motion), computed by `paintField` at overlay size. Essentials shows "painted push" (amount, keyframeable), "painted mode" and CLEAR VECTORS when a loop has strokes.
- Tests: `tests/r2-vectors.test.mjs` (direction, resolution scaling, amount and reversal, replace blocks; in a loop with no estimate the picture moves only inside the brush; the command and validation). The `sequenceParity` and `checkpointStore` fixtures paint a stroke with a keyframed amount (exact on the GPU). T0 `editorVectors` (pointer-painted stroke, render changes, undo restores the pixels and bytes). `ref/bench-r2.json`: 30 T0 and 7 T1 rows; 124 node tests; fidelity budgets pass.
- Ideas not built: swirl, pinch and noise brushes; per-stroke keyframes (strokes appearing over time); erasing single strokes (CLEAR removes all; undo removes the last).

## Next

The current order lives in the latest session handoff. Done on 2026-10-10 (evening): locks inert (D40), M7 closed,
the candidate-parallel matcher (1080p loop 13.7 → 5.4 ms), WSOLA in a worker, the fast mask raster, the dense desk
(D41). Next: M8 Safari and Firefox on the live site (D43), more speed (cache I/O worker, probe caps), the FX
contraction fixes, mask tracking and handles, R5 when the icon arrives, M9b (bake, v2 library, docs).

## Deploying to iori.me

Live since 2026-10-10 (M9, D43). The redeploy steps and the shared-tree rule are in the latest session handoff
("Deployed"). Do not edit `iori/moshine/` directly: it is an rsync copy of this folder. COOP/COEP stay off until the
bake (D44).
