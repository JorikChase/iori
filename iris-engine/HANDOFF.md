# Iris Engine — handoff (2026-09-18 evening, engine 0.7-fields, v82 / v82c)

Start here if you are a new Claude Code session taking this over. Read in this order:
`HANDOFF.md` (this) → `README.md` (run / panel) → `study/00-summary-and-spec.md` **§25–§26** (the current work: the CAPTURE audit and Phase R;
§22–§24 the routed fitter and F2; §1–§21 the history) → `versions/README.md` (the archive and what every metric tests) → `study/07-fields-and-editing.md`.
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

| | NORMAL (v82) | CAPTURE (v82c) |
|---|---|---|
| MATCH2 mean | **61.4** (v76 61.5, same within noise) | 53.9 |
| MATCH | 67.7 | 61.8 |
| strandCorr | 0.25–0.32 | 0.35–0.51 |
| height r | 0.83–0.87 | 0.74–0.83 |

Presets (`Presets ▾` menu) = the v76 NORMAL fits in `ref/presets.json`. iori decided CAPTURE *leads* from now on:
bench both qualities every version, promote presets from CAPTURE once it beats NORMAL.

**Defaults in fit.js** (declared explicitly, §22.4 lesson): `fit.strandGenes = true`, `fit.strandTerm = false`,
`fit.routed = true`, `fit.seededLoss = 'pixel'`, `fit.placement = true`, `fit.reliefLoop` off (v79, rejected),
`fit.e3HeightWeight` 60 (v80 ablation).

**Architecture now (details in the spec):**
- **Routed fitting (§23)** — mixture of experts over an image-space band pyramid (B1 0.3–1 mm, B2 0.09–0.3, B3 0.03–0.09;
  σ = λ/5.3), per-pixel gates `mask × resolvable × focus × trust`, coarse-to-fine blocks E0 tone → E3 relief → E4 bundles
  → E5 strands, evidence map. `seededLoss` 'pixel' (fidelity) or 'stats' (look) (§23.1).
- **F2 strand placement (§24, §25.7)** — a Gabor-style carrier in the bake; `placementFromPhoto` demodulates the
  full-resolution photo. The placement fields (`place`, `placeSpacing`, `phaseC`, `phaseS`, pack `f2`) live on their
  own grid **`p` = 512 × 128, fixed at every quality** (phases are cell-relative; a quality-dependent grid scrambled
  them); the carrier's frame angle is read bilinearly from the flow grid at the cell centre, and the fitter matches it.
- **Diagnostics (§22.2)** in every bench row, plus two audit tools (§25): `fit.scaleAudit()` (every estimator at
  NORMAL vs CAPTURE on one photo, plus the renderer on one genome) and `fit.trace = fit.traceBands = true` (B1–B3
  ratio/corr and height r after every fit stage and routed expert). `fit.reliefTransferBench()` (§26.1) probes the
  engine's relief → image transfer.

**What the audit established (§25–26, read before touching relief):**
- The CAPTURE coarse-band deficit comes from the **splat stage**: splats are fitted to the height proxy through a
  linear model, and the engine forms the image differently. Fitting the proxy through the renderer (v79) raised
  height r to 0.95 and *lost 13 MATCH2* — **height r is a heuristic, a good regulariser for E3 (v80) and a bad target
  for the splat field**.
- Under the ring flash **bumps are invisible** (≤ 1 % image change at +0.04 mm) and **openings are a switch**
  (nothing above −12 µm, ≈ 0.4–0.6× darker below −30 µm).
- The strand overshoot at CAPTURE (hfRatio ≈ 1.6) is E5 pinning `strandFine` and `strandSharp` at their upper bounds.

## Next, in order (agreed with iori 2026-09-18)

1. **Phase R — relief from the image (§26).** R1: openings (negative splats) fitted to the photo's polar luminance,
   band-limited to compact structure (≤ ≈ 1 mm), through the probed transfer curve with a **soft surrogate + Adam**
   (the curve smoothed in s, sharpened over the iterations); I_base = render without the fitted openings; one
   verification render. **Ownership split by shape**: openings own compact dark blobs, per-cell material owns smooth
   variation and is re-inverted afterwards. **Bumps (positive splats) still come from the height proxy** (v78 target).
   Then R2 ownership check, R4 height r recalibrated. The opening-darkness quality leak was measured at only 0.02–0.06
   (third strand layer) and iori decided not to fix it separately — R1 probes per quality.
2. **E5 at CAPTURE** — both genes on their upper bounds on every eye; energy added out of phase.
3. **Multi-start sensitivity guard** (before F2b, iori) — a start change moved one eye by up to 4 MATCH2.
4. **F2b: per-cell crispness.**
5. **Population priors for E5/E6** from the super-macro sectors in `ref-staging/`.
6. **Detection phase** on SBVPI (E1 evidence) → masks for the staging images (no hand masks).

Also open from before: F1 (specular-aware filtering), sub-strand decade (F3), ID v3, 09's hue, whole-eye photos.

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
- **Any estimator radius must be in mm, not texels.** Proxies, grids and atlases double at FINE and above; a texel
  radius halves in mm (v78: `heightFromPhoto`). `fit.scaleAudit()` finds these. Compare qualities on *one* genome —
  comparing two fits confounds the renderer with the fit (the §26.1 correction).
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
