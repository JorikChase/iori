# Handoff — M0 to M4 done, M5 (timeline v1) next

2026-10-09 · repo `data_moshine/` (local git, no remote) · head `9b832ab` · app folder `moshine/`

## In one paragraph

MOSHINE is a browser datamosh editor in clean HTML and plain ES modules, with no build step, for iori.me. The
engine simulates a codec on WebGPU. It estimates motion by block matching or optical flow, edits the field, holds
it for bloom, warps the previous output, and adds the residual a real P-frame would carry. It is scored against
real MPEG-4 and x264 moshes made with native libavcodec. The GPU engine and its CPU reference are bit-identical.
The app can import a video into browser storage, preview it through any of 26 presets with a resolution governor,
and export streamed MP4 or WebM with the audio passed through. A 10-minute 1080p export ran at 59 fps with flat
memory. What does not exist yet: the timeline (M5), the checkpoint cache (M6), audio mixing (M7), Safari and Firefox
QA (M8), and the move into the iori repo (M9).

## Read in this order

1. This file.
2. [`../HANDOFF.md`](../HANDOFF.md): file map per milestone, run and test commands.
3. [`../study/SPEC.md`](../study/SPEC.md): §0 decision log D1–D39, §4 data model, §11 timeline, §13 milestones.
4. [`../study/fidelity.md`](../study/fidelity.md): what the bench measured and why the presets look the way they do.
5. [`../study/coverage.md`](../study/coverage.md) and [`../study/CATALOG-REVIEW.md`](../study/CATALOG-REVIEW.md): the effect set.

## Resume in five minutes

```bash
cd /Users/iori/Desktop/code/data_moshine
node --test 'moshine/tests/*.test.mjs'                   # 63 tests, ~30 s, no GPU
node moshine/tools/bench.mjs --tag check --quiet         # 25 GPU rows in headless Chrome, ~2 min
node moshine/tools/fidelity.mjs --tag check              # MPEG-4 fidelity budgets, ~30 s
python3 moshine/serve.py 8772                            # the app: http://localhost:8772/moshine/  lab: …/lab.html
```

If `tests/media/` is missing (it is gitignored), rebuild it once:

```bash
sh moshine/tools/build-mvtool.sh && sh moshine/tools/make-media.sh
node moshine/tools/fidelity.mjs --tag check
```

The fidelity run also writes the lab's Fidelity sets and the gallery's source. The 10-minute clip for the M4 exit test
needs `make-media.sh --long`, which takes about 5 minutes and 400 MB.

## Where things stand

| Milestone | State | Evidence |
|---|---|---|
| M0 scaffold | done | `ref/bench-m0.json` |
| M1 engine core and lab | done | GPU and CPU loops bit-identical over 120 frames on six presets |
| M2 fidelity bench | done | `ref/fidelity-m2.json`, budgets pass |
| M3 effect library | done | 12 effects, flow, 26 presets, coverage matrix, x264 bench |
| M4 media pipeline | done | `ref/bench-m4-long.json`: 18,000 of 18,000 frames, 58.9 fps |
| **M5 timeline v1** | **next** | — |

Key numbers on this Mac (Apple M-series, Chrome headless):

| Measure | Value |
|---|---|
| SSIM vs real MPEG-4 mosh, frames 0–10 (fixture / clip) | 0.91 / 0.73, every frame beats both baselines |
| SSIM vs real x264 mosh, frames 0–10 (fixture / clip) | 0.80 / 0.54 |
| Estimator against true motion | 826 of 829 blocks exact |
| Full Mosh Loop at 1080p | ~12–14 ms (110 ms while Jump Desktop streams; see gotchas) |
| 10-min 1080p export | 5.1 min, memory flat |
| Coverage matrix | 84 v1 + 10 partial of 124 reference operations |

## Invariants: do not break these

- **Motion convention.** The field is the backward vector: `frame_t(p) = frame_{t-1}(p - mv)`. Fields are vec4 per
  block: `[mvx, mvy, mad, flags]`. Flags: 1 skip, 4 lost.
- **GPU equals CPU (D28).** Every node in `nodes/` has a twin in `engine-ref.js` or `fx-ref.js`, written in the same
  operation order with `Math.fround`. Half-float stores round to nearest-even in the shader (`HALF_WGSL`), because
  Metal truncates. Treat any parity drift as a bug, not noise.
- **Determinism.** Randomness is `hash3` (24-bit, exact in float32, same in JS and WGSL), seeded per loop. No wall
  clock in the engine. A Mosh ID replays to the same pixels.
- **One parameter set per node per submit.** Uniforms are queue writes, so a node encoded twice in one submission
  gets the last values. Separate submits per step, or separate node instances.
- **Codec residual semantics (D31, D33).** The residual is motion-compensated with the original estimate, before
  field ops, and taken from the motion source's own stream. That is what makes edited vectors visible.
- **A detected, unhonoured cut is a dropped I-frame (D32):** no motion, no residual, no intra.
- **Export never uses the preview path or a cache.** It renders sequentially from the range start (D37).
- **Engine and preset changes get re-scored** with `tools/fidelity.mjs`, which exits non-zero on a budget failure.
  Raise budgets when things improve, in `tools/fidelity-budgets.json`.
- **House rules.** No frameworks, no build step. Everything is same-origin because the page is cross-origin
  isolated. The Program Manager shell idiom lives in `shell.js` and `ui.css`.

## Gotchas that cost time

- **The desktop app cannot launch the dev server.** Its launcher has no access to `~/Desktop` (macOS privacy). Start
  `serve.py` from a shell and use the `moshine-attach` launch config.
- **Background servers stop after 2 hours.** For screenshots, use the headless runner instead. It starts its own
  server:

  ```bash
  node moshine/tools/bench.mjs --page "lab.html#src=cut" --expr "await __lab.seek(50)" --shot /tmp/x.png --size 1400x900
  ```

- **Headless runs start with an empty OPFS.** Each run uses a fresh profile, so import inside the same `--expr`
  (`__app.importFile(file, { auto: true })`).
- **Do not run two `bench.mjs` at once.** They share port 8782.
- **Bench output is printed at the end**, so piping it through `tail` can cut the summary off. Use `--tag` with
  `--only` to save the report to `ref/`.
- **Wall-clock cost depends on other GPU users.** With Jump Desktop streaming, the 1080p loop went from 14 to 110 ms,
  and the M1 code measured the same. Trust T0 and T1 rows; treat T4 numbers as indicative until they use timestamp
  queries.
- **`node --test` on Node 26 needs a glob:** `'moshine/tests/*.test.mjs'`, not a directory.
- **Assertion messages on big arrays.** `assert.deepEqual` on 230,000-element arrays makes node's diff printer run out
  of memory (exit 137). Compare hashes (`fnv1a`) instead.
- **Fixtures translate exactly only at integer pans.** Their grain is keyed to integer pixels. For sub-pixel truth,
  box-downsample an integer pan at double resolution (see the flow and half-pel tests).

## Open threads, roughly by value

1. **M5 timeline**, below.
2. **Matcher performance.** The sub-pel search dominates the loop. Move it into workgroup shared memory, one
   workgroup per block with a cached reference window. Target ≤ 4 ms at 1080p.
3. **Fidelity** (study/fidelity.md): an encoder-style intra decision (recall 0 on 255 real intra blocks today),
   bloom compounding on real footage (weakest number, 0.52), x264's own deblocking for "H.264 soft", EPZS-style
   predictors, more footage and qscales.
4. **T4 on timestamp queries**, so cost numbers survive a busy machine.
5. **v2 catalogue rows** in coverage.md: field mirror, swap and sort; temporal average; gravity; random damage;
   frame-order ops; pixel sort; the analog family.

## Things only the owner can judge

- **Legacy presets.** Open `tests/media/gallery/index.html` after `node moshine/tools/gallery.mjs`. Broken Signal,
  Echo Projection, Water Ripple and Phantom Trail read as their names. Pixel Storm needed its refresh removed.
  B-frame reordering has no equivalent until the v2 frame-order ops.
- **Assumed, not confirmed** (spec §15): the Mosh Loop as a group effect with in-loop children, and the four workflow
  template semantics in spec §6.6.

## M5 plan: timeline v1

The spec describes the features in §11.1 and the data model in §4. Suggested order, each step testable before the next:

1. **`project.js`**: the §4 model (Project, Sequence, Channel, Clip, EffectInstance, AnimatableValue), validation,
   versioned migrations, `.mosh` save and load, OPFS autosave. A Mosh Loop effect instance's parameters are the
   existing `config.js` config, with animatable values where `params.js` already resolves keyframes.
2. **`timeline.js`**: a pure command bus with invertible commands (add, move, trim, split, delete clip; set
   parameter; add, move, delete keyframe; markers; Bloom Insert), undo and redo, selection and snapping. Node tests:
   every command followed by its inverse restores the project byte for byte.
3. **The evaluator**: render frame N of a sequence. Channels composite bottom-up. Media clips decode through
   `media.js` and are placed by Transform & Blend into a sequence-sized image. Effect clips process the composite
   below them, one Mosh Loop per clip, with state reset at the clip's in-point (D18). Until M6, a seek replays from
   the clip in-point. Splitting a clip creates a reset point, which keeps replays short.
4. **Mosh objects.** Mosh hits are markers that feed `bloom.hits`. Mosh Cut is an effect clip spanning a join.
   Bloom Insert is a timeline command that adds a held segment; the time-stretched audio comes in M7.
5. **Modulators** in `params.js`: LFO, noise and random hold as pure functions of frame and seed, plus trigger
   modulators (every n, hits, manual). Audio modulators come in M7. Draw the modulated value as a ghost curve.
6. **The UI.** A canvas timeline (lanes, clips, keyframe diamonds, playhead, render-status bar), DOM headers, and an
   inspector reusing `shell.control` and the lab's `listBox`. Layouts for desktop, tablet and phone (D19). The
   wireframe at `study/ux/wireframe.html` is the agreed look.
7. **Harness rows.** Frame N of a sequence must be identical via sequential play and via a seek, and the timeline
   export must match the M4 single-clip export when the sequence holds one clip.

The main risk is random-access decode cost and replay length on long effect clips. If scrubbing feels bad, pull the
simplest part of M6 forward: in-memory checkpoints every K frames, which needs no OPFS spill.

## At the move into iori/ (M9)

Copy `moshine/` to `iori/moshine/`. Register `moshine/index.html` in `pages.meta.json` by hand, since folder apps are
not auto-scanned. Run `python3 site.py all && python3 site.py check`. Add a Caddy `handle /moshine/*` block with
COOP and COEP. Check that the analytics tag from the SEO block works under COEP, or skip it on this path. Wire the
caption's control box to the site menu as petri does, and add the launch config. Leave `tests/media/` and
`tools/bin/` behind.
