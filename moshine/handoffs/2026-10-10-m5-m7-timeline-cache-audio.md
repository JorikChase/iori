# Handoff — M5, M6, owner requests R1–R4 and M7 steps 1–4 done; M7 step 5 (export mix) next

2026-10-10 · repo `data_moshine/` (local git, no remote) · head `cb0056a` · app folder `moshine/`
Previous handoff: [2026-10-09-m0-m4-engine-to-timeline.md](2026-10-09-m0-m4-engine-to-timeline.md) (engine, fidelity, effects, media pipeline).

## In one paragraph

MOSHINE is now an editor, not only an engine. A project of sequences is edited through an invertible command bus with
unlimited undo. A canvas timeline holds channels, clips, keyframes, markers and mosh hits, and a stack inspector edits
effects, keyframes and modulators. Sequences render through one evaluator with a CPU and a GPU backend that agree bit
for bit, including Transform & Blend, masks and painted vectors. Seeks resume from lossless checkpoints that spill from
the GPU to memory and OPFS: a 5-minute 1080p mosh scrubs in 54 ms median, 97 ms worst, on this Mac. Timeline export
streams MP4 or WebM. Owner requests R1–R4 shipped: no black gutters, a Looks strip with live thumbnails, Essentials,
include and lock masks, painted motion vectors. M7 audio is four steps in: features at import, audio modulators and
reactive presets, Bloom Insert's time-stretched audio (WSOLA), and playback. Missing: the export mix (step 5, which also
closes M7), Safari and Firefox QA (M8), the move to iori.me (M9), R5 (the owner's icon).

## Read in this order

1. This file.
2. [`../HANDOFF.md`](../HANDOFF.md): the file map per milestone with every design note (sections M5, M6, Owner requests,
   M7). It is long; read the section for what you touch.
3. [`../study/SPEC.md`](../study/SPEC.md): §4 data model, §7 cache, §9 audio, §11 timeline, §13 milestones (M5 and M6
   marked done) and §13.1 owner requests R1–R5.
4. The previous handoff for the engine's invariants (all still hold).

## Resume in five minutes

```bash
cd /Users/iori/Desktop/code/data_moshine
node --test 'moshine/tests/*.test.mjs'                   # 138 tests, ~40 s, no GPU
node moshine/tools/bench.mjs --tag check --quiet         # 30 T0 + 8 T1 rows in headless Chrome, ~70 s
node moshine/tools/fidelity.mjs --tag check              # fidelity budgets (rm ref/fidelity-check.json after)
node moshine/tools/bench.mjs --only slowScrub5min        # the M6 exit test, ~1 min (needs make-media.sh --long)
python3 moshine/serve.py 8772                            # the app: http://localhost:8772/moshine/  (?demo = the demo project)
```

`tests/media/` is gitignored (972 MB); rebuild it with `sh moshine/tools/build-mvtool.sh && sh moshine/tools/make-media.sh`
(add `--long` for the 10-minute clip).

## Where things stand

| Milestone | State | Evidence |
|---|---|---|
| M0–M4 | done | previous handoff |
| M5 timeline v1 | done, plus the small §11.1 items | `ref/bench-m5-items.json`; T1 `timelineExportM4`, `timelineEditedVideo` |
| M6 cache and scrubbing | done (tier 3 measured; tier 2 not verified) | `ref/bench-m6-scrub.json`: median 54 ms, worst 97 ms |
| R1 no black gutters · R4 Looks, Essentials | done (first pass) | `study/ux/editor-r4.png` |
| R3 masks | done (tracking, in-loop refresh, on-canvas handles open) | `tests/r3-masks.test.mjs`, T0 `editorMasks` |
| R2 painted vectors | done | `tests/r2-vectors.test.mjs`, T0 `editorVectors` |
| M7 audio | steps 1–4 of 5 | `ref/bench-m7-step4.json`; T1 `soundMix` |
| R5 icon | waits for the owner's `moshine/icon.svg` | — |
| M8 compatibility, M9 ship | not started | — |

## Invariants: add these to the previous handoff's list

- **Contraction-proof GPU arithmetic.** Metal fuses multiply-adds; any kernel that mixes with arbitrary fractions drifts
  from its CPU twin. The fix pattern: integer fixed-point geometry (positions in 1/1024 or 1/4096 px), weights quantized
  to 1/64 or 1/4096, operands rounded to half before multiplying, so every float product is exact. Used by place, blend
  (screen rounds 1 − C and 1 − L to half), maskmix, displace. The remaining M3 effects (echo's mix, rgbsplit's motion
  term, …) still drift on fractional inputs: `sequenceParity`'s `fxMix` case is "close" (a flagged follow-up task).
- **The evaluator is the only renderer.** One `createEvaluator` with `cpuBackend` or `gpuBackend`; backends implement
  source, place, blend, mask, maskmix, loop, fx, serializer, prefetch. Clip-owned values are clip-relative (frame 0 =
  in-point); a Mosh Loop gets `begin(0)` at its in-point, so a one-clip timeline is exactly the M4 loop.
- **Checkpoints are valid only while their dependency signature matches** (`depSig`: the effect's config with hits and
  audio before g, its clip without its own masks, the live channels below, media, frame rate, `audioKey`). Nothing else
  invalidates them; `invalidate()` only resets step positions. Anything new that affects an effect's input must enter
  `depSig` or a checkpoint will be reused wrongly.
- **Render under the lock.** The editor's preview, the idle background fill and any test that calls
  `app.renderer.render()` must hold `app.play.busy`; two renders on one evaluator corrupt its state.
- **Before a decoder re-seek, wait for the GPU queue** (`videoReader.beforeSeek`): closing frames that queued commands
  still read through zero-copy external textures gave nondeterministic pixels.
- **Audio is mixed from audio clips only** (a video's own sound plays through its linked A1 clip). `mixBlock` must stay
  block-invariant (one block = many blocks): positions are integer products with one division, `decode` returns the
  media sample index of its first sample, stretched pieces are stretched whole and sliced.
- **Features are content-addressed** (by media hash) and enter signatures through `clock.audioKey`; a table arriving later
  must change signatures, never silently alter cached frames.

## Gotchas that cost time this round

- **Headless Chrome keeps AudioContexts suspended** (no user gesture). Check playback in the browser pane with a trusted
  click (`computer` left_click by ref), not in `bench.mjs`.
- **The bench sizes the window after load**: check the phone layout in the browser pane at the mobile preset.
- **`setPointerCapture` throws for synthetic pointer events**: wrap it, or tests that dispatch PointerEvents abort.
- **Rows are rebuilt on every timeline draw**: compare channels, not row objects, across a drag.
- **Object spread drops non-enumerable properties**: the clock's `audio` function must be enumerable (JSON skips it
  anyway); `modulate()` spreads the clock.
- **Global state leaks between evaluators**: evaluators pass `project` and `features` explicitly (`LC` / `CK` in
  sequence.js); the module-level registry is only the editor's default.
- **A cosmetic slider can hide a parity bug**: compare composites directly (`sequenceParity` `composite` case), not only
  through a Mosh Loop that may sample around the bad pixel.
- **The dev server dies after 2 hours** and the desktop launcher cannot start it (macOS privacy): start `serve.py` from a
  shell and attach with the `moshine-attach` launch config.

## Open threads, roughly by value

1. **M7 step 5: the export mix and the exit rows** (plan below).
2. **FX library contraction fixes** (echo, rgbsplit motion, the other M3 kernels; displace is done) and rounding stateful
   FX state to half in `createLoopRef` (a task was flagged in the session; its prompt still lists displace).
3. **Deploy to iori.me (M9 checklist below)**, if the owner wants the current state public.
4. **Masks:** tracking, the optional in-loop refresh under locks, on-canvas handles.
5. **Scrub margin on tier 2:** a preview proxy (short-GOP transcode at import) and the matcher in shared memory.
6. **R4 polish:** Looks grouping and card size (owner to judge), more brushes for R2 (swirl, pinch).

## Things only the owner can judge

- Do the Looks cards need grouping ("Classic", "Glitch", "Fluid") or bigger thumbnails?
- signalsmith-stretch vs the JS WSOLA (vendoring signalsmith needs the owner's OK).
- Whether locked areas should keep the history clean (in-loop refresh) or let mosh build up underneath.
- Whether to deploy before M7 closes (the export drops audio except for one untouched clip until step 5).

## M7 step 5 plan: the export mix and the exit

1. `exportSequence`: when `audio` is on and the range has audio clips, mix with `mixBlock` in blocks of about a second
   (the same cache across blocks), encode with an `AudioSampleSource` (AAC in MP4, Opus in WebM) through Mediabunny,
   interleaved with video like the pass-through. Keep pass-through for the untouched single-clip case (it is exact and
   cheap) or drop it if the mix equals it within the codec.
2. A rhythmic test clip in `make-media.sh` (`beat.mp4`: testsrc plus a click every 0.5 s) for the exit rows.
3. T1 exit rows: an audio-reactive preset (Onset bloom or Beat heal) changes frames at the clicks and nowhere else;
   a Bloom Insert export decodes to a file whose audio duration equals its video duration and whose clicks after the
   hold land on the shifted frames (cross-correlate a click against the expected sample position).
4. Then mark M7 done in spec §13 and HANDOFF.md.

## Deployed (2026-10-10, 19:35)

**Live at https://iori.me/moshine/** (listed in the `tools` category; the lab at `/moshine/lab.html` is hidden and
disallowed in robots; `3die.fr/moshine/*` redirects). iori repo commit `b222691` (a copy of data_moshine `0bf0fd3`
without test media and `tools/bin/`), pushed to `main`, `server_setup.sh` run on iori-vps (Caddy validated and
restarted). No COOP/COEP on the server: the app runs non-isolated, verified live (demo renders, 28 looks, checkpoints
fill, no console errors). The site menu sits bottom-right (`menu_pos: br`).
**To redeploy:** `rsync -a --delete --exclude 'tests/media/' --exclude 'tools/bin/' --exclude '.DS_Store'
--exclude '__pycache__/' data_moshine/moshine/ iori/moshine/`, then in iori: `python3 site.py all && python3 site.py
check`, commit only `moshine/` and the generated files (the iori tree is shared: other tracks may have uncommitted work
in it), push, `ssh iori-vps 'bash /root/iori/server_setup.sh'`.

## Deploying to iori.me (M9 checklist, updated)

The iori repo (`~/Desktop/code/iori`, GitHub `JorikChase/iori`) deploys by pushing `main` and running
`bash /root/iori/server_setup.sh` on `iori-vps` (see its `AGENTS.md`; scp the script to /tmp first if it changed).

- Copy `moshine/` to `iori/moshine/` without `tests/media/` (972 MB, gitignored) and `tools/bin/`.
- Register `moshine/index.html` in `pages.meta.json` by hand (folder apps are not scanned), and `moshine/lab.html` (as
  `"hidden": true` unless the lab should be public). Run `python3 site.py all && python3 site.py check`.
- **Cross-origin isolation:** the VPS Caddyfile (written by `server_setup.sh`) sets no COOP or COEP for any path. MOSHINE
  works without them today (nothing uses SharedArrayBuffer until the ffmpeg.wasm bake in M9); `serve.py` sends them
  locally. Add a `/moshine/*` header block only when the bake lands, and then check the site menu and the analytics tag
  under COEP.
- Wire the caption's control box to the site menu as petri does; R5's icon goes there and in the favicon.
- Check `crossOriginIsolated`-dependent paths (`performance.measureUserAgentSpecificMemory` in the export row) degrade.
