# Iris Engine — handoff (2026-09-18, engine 0.7-fields, v76 / v77)

Start here if you are a new Claude Code session taking this over. Read in this order:
`HANDOFF.md` (this) → `README.md` (run / panel) → `study/00-summary-and-spec.md` **§22–§24.2** (the current work;
§1–§21 are the history) → `versions/README.md` (the archive and what every metric tests) → `study/07-fields-and-editing.md`.
Project memory: `iris-engine-project.md` in the Claude memory dir.

## What this is

A photoreal, fully procedural human iris in WebGL2 (`index.html`, no build) with a fitter (`fit.js`) that recreates
iris photographs as loadable **iris IDs** (globals + object lists + control fields + splats). iori's rules:

- The iris is **always procedural** (code + numbers). No photo textures stored or shipped; control fields count as procedural.
- Photos are ground truth; every residual is an engine to-do. Every fitted eye is an ID that reproduces it exactly.
- Sclera pure white, only the iris visible; the eye turns toward the cursor (`CAM FREE`) or is locked (`CAM FIXED`).
- Goal of the current phase (§22): **ten times the strand and highlight detail**, with weights that can be edited,
  diffed and collected into a database — "more than reality".
- Work on the isolated-on-black macros (refs 09, 25, 26, 35 — BENCH ISO) first, then whole-eye photos.

## Run and test

```bash
python3 iris-engine/serve.py 8768        # launch config "iris-engine"; POST /save/<name>.json → ref/, /save/versions/<id>/<name>.json → versions/<id>/bench/
```
Open http://localhost:8768/iris-engine/ · console handle `window.__irisEngine` (`.fit` = fitter).
Bench: `__irisEngine.fit.benchIsolated({ iters: 120, ver: 'v78-…' })` (defaults are the current best configuration),
then `python3 iris-engine/versions/snapshot.py v78-… --note "…"` and `python3 iris-engine/versions/compare.py [--cases --metric X]`.

**Reproducibility test (run after anything touching loading, alignment or the start of a fit):** the same bench
forwards and with the eyes reversed must match on every metric —
`F.runBench([...F.ISOLATED], {save:false})` vs `F.runBench([...F.ISOLATED].reverse(), {save:false})`.
Fits are deterministic and order-independent since v76 (§24.2).

## Where it stands

| | NORMAL (v76) | CAPTURE (v77) |
|---|---|---|
| MATCH2 mean | **61.5** (best) | 54.7 |
| MATCH | 68.3 | 63.5 |
| strandCorr | 0.20–0.28 | 0.37–0.51 |
| height r | 0.83–0.87 | 0.84–0.96 |

Presets (`Presets ▾` menu) = the v76 fits in `ref/presets.json` (only `bakePresets` or a deliberate promotion writes
it; benches rewrite `ref/cases.json`, the casebook).

**Defaults in fit.js** (declared explicitly, §22.4 lesson): `fit.strandGenes = true`, `fit.strandTerm = false`,
`fit.routed = true`, `fit.seededLoss = 'pixel'`, `fit.placement = true`.

**Architecture now (details in the spec):**
- **Routed fitting (§23)** — mixture of experts over an image-space band pyramid (B1 0.3–1 mm, B2 0.09–0.3, B3 0.03–0.09;
  σ = λ/5.3), per-pixel gates `mask × resolvable × focus × trust`, coarse-to-fine blocks E0 tone → E3 relief → E4 bundles
  → E5 strands, evidence map (a block with too little evidence keeps its prior). Experts declare *fitted* vs *seeded*
  layout; `seededLoss` 'pixel' (fidelity) or 'stats' (look) — the perception–distortion trade-off (§23.1).
- **F2 strand placement (§24)** — a Gabor-style carrier in the bake: each flow cell a plane wave
  `cos(2π·x'/spacing + phase)` in its own local frame, four cells blended; `placementFromPhoto` demodulates the
  full-resolution photo (`fit.native`) in the same frames. Fields `placeSpacing`, `phaseC`, `phaseS`, `place`
  (pack `f2`, texture unit 14). The noise path is untouched.
- **Diagnostics (§22.2)** in every bench row: sigmaRatio, darkErr, bandDL, specAgree, hfRatio, strandCorr,
  bandCorr/bandRatio, evidence, coverage.

## Next, in order (iori agreed: router → F2 → population priors → detection)

1. **Coarse-band deficit at CAPTURE.** B1 holds only 0.51–0.66 of the photo's energy at CAPTURE (0.78–0.95 at NORMAL),
   while the strand band overshoots (hfRatio ≈ 1.8). It is why 'stats' mode still trails 'pixel' by ≈ 5 MATCH2, and
   why CAPTURE < NORMAL. Suspects: relief (splats / height proxy) and bundles estimated at a scale that does not carry to
   CAPTURE; carrier amplitude not normalised against coarse structure. Check B1/B2 ratios per stage with `fit.trace`.
2. **F2b: per-cell crispness** (the third part of F2, not built): a field narrowing the fine coverage transfer from the
   photo's stripe profile.
3. **Multi-start sensitivity guard** — the one uncertainty left now that runs are deterministic (a start change moved one
   eye by up to 4 MATCH2 before §24.2).
4. **Population priors for E5/E6** from the super-macro sectors in `ref-staging/` (the "more than reality" step: fit a
   coarse photo with E0–E4, draw fine detail from the prior).
5. **Detection phase** on SBVPI (E1 evidence): an index of the dataset + masks → ground-truth landmarks → a detection
   bench scoring the whole-eye aligner. Only when detection is right does it mask the staging images (iori: no hand masks).

Also open from before: F1 (specular-aware filtering, tangent + normal-variance channel), sub-strand decade (F3, per-pixel
with footprint fade — iori has not yet decided per-pixel vs baked), ID v3 (quantisation, pyramids, per-layer hashes),
09's hue, whole-eye photos.

## Data

- `ref/` — 43 Commons photos (gitignored, refetchable from `refs.json`), `presets.json`, `cases.json`, bench rows.
- `ref-staging/` — **quarantine**, read by nothing: 10 Unsplash candidates (4 full-iris + 1 sector + 3 super-macro
  sectors at ≈ 1–2 µm/px, verified by EXIF; the Badun isolated pair is `-UNVERIFIED`: no EXIF, no pupillary ruff, no
  grain — trust 0). Provenance in `staging.json`. JPEGs gitignored.
- **SBVPI** at `/Users/iori/Desktop/code/iris/SBVPI` — Ljubljana research dataset (research licence: keep it and
  anything derived out of the repo and the website). 1,856 whole-eye photos, 3250 px, masks for iris/pupil/sclera/lashes/
  canthus/vessels. Irises ≈ 970 px and focus-soft (strand detail 0.013 median vs 0.059+ on the macros) — useless for
  detail, ideal for detection ground truth. Measurements: `iris_sharpness.{json,csv}` next to it.
- Commons has no further isolated irises (5,014 files surveyed, `tools/commons_survey.py`, `tools/commons_isolated.py`).
- OpenCV: use `/usr/bin/python3` (has cv2); the Homebrew python does not.

## Gotchas (do not rediscover)

**Fitting / reproducibility**
- Photos: decode at native size and area-average in JS (`decodeNative`, `areaResize`). `canvas.drawImage` resampling
  depends on the canvas's history and made fits order-dependent.
- Every bench case calls `resetForFreshFit()` (state, targets, genome, caches). A fresh fit never starts from `'current'`
  (only the FIT GLOBAL button does, `fromCurrent: true`). Genes live in `state` *and* `genome.globals`; sync with
  `applySlidersToGenome()`.
- Never yield with `setTimeout` in long loops: hidden tabs throttle it to ~1/min after 5 min (a fit took 2 h, a CAPTURE
  bake 11 h). Use `yieldNow()` (MessageChannel). In the Browser pane, don't poll page state with setTimeout loops in
  `javascript_tool` either — have the page POST a result file and wait on it in bash.
- Pixel-wise losses always prefer *less* of a texture whose placement is not fitted (v65, v67, v68–70); a correlation-led
  band loss can be satisfied by suppressing the uncorrelated share. Any new gene: say whether its layout is fitted.
- A gene ending on its bound is a symptom (logged as `atBound` in routed blocks).
- MATCH / MATCH2 are not comparable across quality modes (measured at a fraction of the fit image).
- Phase conventions: `Σ L·e^{+iΦ}` returns −φ. Carrier coordinates must be local to a cell (a coordinate measured from
  u = 0 has a 25 mm lever arm).
- `getMap` reads `inside` from blue and v from green of debug view 14; debug views must return "no data" for rays that
  miss the cornea (the page is white, which read as iris).
- Statistics beyond `map.vmax` are neighbour fill (ref 35 is photographed only to v 0.74–0.88).
- `snapshot.py` archives `versions/<id>/bench/cases.json` (written by the bench with `ver`); `ref/cases.json` belongs to
  whichever bench ran last.

**Engine (from earlier phases, still true)**
- GLSL macro parameters must not be named `x`/`y`; a GLSL use-before-declare fails the link silently (the eye vanishes).
- Every photo ↔ render comparison goes through the engine's coordinate map (`getMap`, view 14).
- Never bind the render target as the accumulation source; any calibration first sets a defined lighting state.
- The atlas lod is analytic, not `fwidth()`. The canvas is sized at device pixel ratio (`Q.dpr`).
- The 3-band Rayleigh material cannot make green/amber; the spectral LUT with the yellow absorber can (Mie 0.08).
- Splicing `index.html` must bound searches inside the intended `<script>`; shaders share function names.
- The Browser pane throttles rAF when hidden and moves the pointer with every screenshot; judge with REF or fit renders.
- A scrubber drawn while its window is hidden has zero width — guard pixel-stepping loops.
- Wikimedia: fetch sequentially with a UA; use pre-rendered thumbnail sizes (330, 500 px), not 400.

## File map

| path | what |
|---|---|
| `index.html` | engine: shaders (`fs-bake` with LIC strands, layers and `strandCarrier`; `fs-photo`; post), genome, presets, spectral LUT, fields (`FIELD_DEFS`, packs c0–c2, f0–f2), ID v2, UI, `CAM` toggle |
| `fit.js` | alignment, pose, scores, diagnostics, estimators (height, flow, structures, splats, material, rim, **placement**), routed fitter, benches, casebook, `bakePresets`, reset/trace helpers |
| `ui.js` | Windows 98 shell; `Presets ▾` = `ref/presets.json`, `Fitted ▾` = casebook |
| `design.js` | the designer (DESIGN mode, brushes, stamps) |
| `versions/` | archive: `snapshot.py`, `compare.py`, one folder per version (src + bench + cases + manifest) |
| `tools/` | `commons_survey.py`, `commons_isolated.py`, `iris_sharpness.py` |
| `ref/`, `ref-staging/`, `study/` | data, quarantine, study chapters + spec |

## How iori likes to work

Diagnosis first, then a phased plan with real scoping questions; then build. Be honest about what a metric says versus
what the picture shows, and about your own mistakes. One change per version, with an ablation when a change has two
parts; seal every bench in `versions/`; write each checkpoint into the spec. Commit on main when asked or at clear
checkpoints (iori pushes; the server is updated by iori). Keep research data out of the repo and the site.
