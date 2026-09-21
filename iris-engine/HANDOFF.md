**UI (2026-09-21): the Windows 3.11 shell is the default** (`ui31.js`, `ui.css`, `overlay.js`, `gaze.js`; `?ui=98` = the frozen Win98 fallback, one version). Every feature, its home and its test: `study/10-feature-ledger.md`. Before and after any UI change: `__uiContract.reach()` and `compare()` must both be `[]` (tools/ui-contract). A new engine feature lands with its ledger row and its `controls.json` entry.

**Start here (2026-09-21, latest): `handoffs/2026-09-21-ui-tissue-start-eye.md`** — the 3.11 shell by default, the feature ledger and reachability test, the Tissue window, the published photos and layer model, the start eye and its load timing. Tests open the page with `?start=off`.

**Renderer line (2026-09-21): `handoffs/2026-09-21-relief-and-edge.md`** — relief, the probe, the inner edge and the start of G, with the traps each cost. The layer model itself is `handoffs/2026-09-20-tissue-layer-model.md`.

# Iris Engine — handoff (2026-09-20, engine 0.8-tissue, v85-tissue-p2 · legacy line v84 / v84c)

> **START HERE (2026-09-20): `handoffs/2026-09-20-tissue-layer-model.md`.** The main line is now the **tissue layer
> model** (spec §30–§31): sheet with holes + rim pigment over a deck of explicit fibre curves with veins, rendered by
> `tissue.js` as a separately compiled variant, fed by primitives that `tools/layer_proof.py` extracts from the photo.
> Whole iris of ref 26 in the engine: MATCH2 67.5 → 78.4, MATCH 72.1 → 87.2, colour Δab 11.7 → 2.0. The task list
> (T1 pupil margin built like the natural one · T2 much closer zoom and more rotation near the surface · T3 probe camera
> above the surface · T4 picture debts · T5 ID v3 budget · **T6 the journaled closed-loop fitter — the growing eye** ·
> T7 the other isolated eyes · T8 tools · T9 enhancement and mammals) is spec §31. Everything below this block is the
> legacy line (LIC strands, splat openings, `fit.js`), still the default renderer and still bit-identical (NORMAL bench
> = v84, 66.70); read it for the fitter, the benches, the archive and the gotchas.

**Two tracks are running in the same working tree** (different files, no conflicts so far — if one ever needs
`index.html`/`fit.js` at the same time as the other, give one its own git worktree):
1. **Relief/fitting** (R1 → …): the CAPTURE audit, openings fitted to the image. This file's §§ below.
2. **Strand building**: explicit strand geometry, from a literature survey and a "what's the ceiling" methodology.
   Read `handoffs/2026-09-19-strand-building.md` and `study/08-microstructure-and-strand-building.md` for it. Its
   headline result changes what the *next* round of relief/fitting work should prioritise (below).

Start here if you are a new Claude Code session taking this over. Read in this order:
`HANDOFF.md` (this) → `README.md` (run / panel) → `study/00-summary-and-spec.md` **§25–§27** (the current relief/
fitting work — the CAPTURE audit, Phase R, the band-swap oracle; §22–§24 the routed fitter and F2; §1–§21 the
history) → `study/08-microstructure-and-strand-building.md` (the strand-building work, §1–§7) →
`versions/README.md` (the archive) → `study/07-fields-and-editing.md`.
Project memory: `iris-engine-project.md` in the Claude memory dir.
Round reports: `handoffs/` — `2026-09-18-capture-audit.md` (v78 → v82, where R1 starts) and
`2026-09-19-strand-building.md` (oracle → S0 → S1 → S6-lite → the guide-ceiling test).

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

| | NORMAL (v83) | CAPTURE (v83c) |
|---|---|---|
| MATCH2 mean | 66.2 (v82 61.4) | **67.1** (v82c 53.9) — best at any quality |
| MATCH | 67.7 | 69.6 |
| B1 corr | 0.75–0.87 | 0.82–0.91 |
| strandCorr | 0.15–0.22 | 0.22–0.38 |
| height r | 0.61–0.81 | 0.63–0.73 |

v83 = **R1: openings fitted to the photo's image** (spec §26.3). It closed the CAPTURE coarse-band deficit.
Presets (`Presets ▾` menu) = the **v83c CAPTURE fits** in `ref/presets.json` (promoted 2026-09-19 under iori's rule:
CAPTURE leads, presets come from CAPTURE once it beats NORMAL). Bench both qualities every version.

**Defaults in fit.js** (declared explicitly, §22.4 lesson): `fit.strandGenes = true`, `fit.strandTerm = false`,
`fit.routed = true`, `fit.seededLoss = 'pixel'`, `fit.placement = true`, `fit.reliefLoop` off (v79, rejected),
`fit.e3HeightWeight` 60 (v80 ablation), `fit.openings` on (R1, v83).
`genome.globals.strandModel` (index.html) defaults to LIC (0): explicit-strand curves (study/08 S1/S6-lite) exist
behind it, are bit-identical-safe when off, and are neutral against LIC when on (not yet worth switching on).

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

## Next: two tracks, and what should change between them

> **2026-09-20 — read first: spec §28 (colour / aperture audit, Phase K) is now the priority of the relief/fitting
> track.** Colour error Δab rose 6.8 → 11.9 while MATCH2 rose (R1's opening floors are violet by prior; the photos
> contain no blue), the iris cutout is a fixed 5.85 × 5.40 ellipse against circular photo cutouts (16–19 % of the
> tissue strip is never compared, on all four eyes), and every dark spot is explained as a hole. Order: K0 colour
> metrics + gate → K1 aperture → K2 colour ownership → K3 causes of dark → K4 deeper deck (= the strand track's
> decks). Evidence `study/audit-28-colour/`.
> **Strand code work pauses while K1–K2 run** (they move the baseline every strand A/B is measured on, and both edit
> `index.html`). **Do not build S1b as written in item 7:** the offline controls in `tools/guide_ceiling_mocks.py`
> → `study/audit-s1b/ceiling-mocks.json` (not yet written up in study/08) show seeded noise inside the tube *loses*
> (B2 0.31–0.44 → 0.07–0.13), and that §7's "real pixels inside the footprint" ceiling is mostly coverage — the
> footprint is 36–47 % of the iris mask, not 10–15 %, and the same photo pixels kept in the *complement* of the
> ridges or in a footprint rotated by 180° score almost the same (B1 0.90 / 0.81–0.85, B3 0.65–0.70 / 0.56–0.64).
> The strand session owns writing that up as study/08 §8.

**The strand-building track's headline result (study/08 §7, guide-scale ceiling test) bears directly on where to
spend the next round of relief/fitting effort:** traced ridge *geometry* alone (real photo pixels kept only inside
a traced ridge's footprint, ≈ 10–15 % of the area, everything else flat) already matches or beats the current
LIC + F2 render on B1/B2 correlation and far exceeds it on B3. The gap is not placement, it is per-pixel brightness
fidelity inside a strand's footprint — which is also why the oracle (§27) finds amplitude worth ~0 and placement
worth +29…+38. Read both before picking the next relief/fitting item below; some of them (E5, F2b) are exactly the
"amplitude, not placement" kind of work the oracle says is not where the points are.

1. **Phase R follow-ups (§26.3), R1 is built.** (a) contrast overshoot (σ ratio 1.10, B1/B2 1.3–1.8×): openings are
   a switch and match contrast shape, the level is not pulled back; (b) colour Δab +3: `materialFromPhoto` now
   inverts cells darkened by openings — settle who owns colour inside an opening; (c) strandCorr −0.1: openings part
   and cover the strands. Then R2 ownership check and R4 height r recalibrated.
2. **E5 at CAPTURE** — pinned at its upper bounds before v83; re-check (hfRatio is now 0.59, the overshoot is gone).
   Note the oracle: E5's genes are amplitude, not placement — low expected value versus the items below.
3. **Multi-start sensitivity guard** (before F2b, iori) — a start change moved one eye by up to 4 MATCH2.
4. **F2b: per-cell crispness.**
5. **Population priors for E5/E6** from the super-macro sectors in `ref-staging/`.
6. **Detection phase** on SBVPI (E1 evidence) → masks for the staging images (no hand masks).
7. **Strand track, next up (study/08 §9): S1b** — per-texel brightness modulation inside the strand tube (reuse
   `strandNoise`/the LIC noise field), bench curves vs LIC alone; **then S3** — guides from `tools/guide_trace.py`
   as fitted objects through the (now-textured) strand pass, and re-run the §7 ceiling test with the real render.

Also open from before: F1 (specular-aware filtering), sub-strand decade (F3), ID v3, 09's hue (also shows up as a
weak LOW correlation in §7, independent of strands), whole-eye photos.

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

**Strand building (study/08)**
- **Any code added to `fs-bake`, even behind an inert uniform, shifts its compiled float arithmetic and moves the
  bench** (±0.3 MATCH2 on two eyes, observed). A new rendering path must be a **separately compiled shader
  variant** (see `bakeCurvesProgram`), not a branch inside the existing bake shader.
- A shader-variant marker (`//STRAND_DECL//` etc.) must be **alone on its own line** — a trailing comment on the
  same line turned into shader code once, the variant failed to link, and the bench silently scored a stale atlas
  (three eyes at 7–22 before it was caught).
- `resetForFreshFit()` deletes unknown `state` keys, so a bench-only override (which model, which grower genes)
  cannot live in `state` — it needs its own module-level variable (`E.strandModelOverride`, `E.growOverride`).
- When a measurement surprises you, build a control before writing the conclusion (§7: a naive reconstruction
  scored worse than the engine; a sanity control and a coverage-only control found the real cause before it went
  into the spec as "ridges don't help").

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
| `index.html` | engine: shaders (`fs-bake` with LIC strands, layers and `strandCarrier`; `fs-strand`/`vs-strand` the explicit-strand ribbon pass, §08 S1; `fs-photo`; post), `bakeCurvesProgram` (separately compiled curves variant), genome, presets, spectral LUT, fields (`FIELD_DEFS`, packs c0–c2, f0–f2), ID v2, UI, `CAM` toggle, `LIC/CURVES` toggle |
| `tissue.js` | **spec §30 P1 — the tissue LAYER model as a separately compiled variant** (`IrisTissue`): sheet with holes + rim pigment over a deck of explicit fibre curves with veins; GPU nearest-curve rasterisation into an atlas region, compose pass, fs-photo variant by string replacement, photo colour → albedo by inverting the post pass and measuring the light (k, s) through the renderer. Off unless `IrisTissue.on`; fed by `tools/layer_proof.py --export` → `study/proof-layers/tissue-26.json`. In the page: `await IrisTissue.proof('study/proof-layers/tissue-26.json')` after posing ref 26 (`fit.renderCaseThumb`) |
| `strands.js` | `IrisStrands.grow` — the deterministic streamline grower (S1), place-aware (S6-lite) |
| `fit.js` | alignment, pose, scores, diagnostics, estimators (height, flow, structures, splats, material, rim, **placement**), routed fitter, benches, casebook, `bakePresets`, reset/trace helpers, §27 band-swap oracle (`bandOracle`/`oracleBench`), §28 guide-ceiling tools (`bandCorrOf`, `dumpForGuideTrace`, `guideCeilingBench`) |
| `ui.js` | Windows 98 shell; `Presets ▾` = `ref/presets.json`, `Fitted ▾` = casebook |
| `design.js` | the designer (DESIGN mode, brushes, stamps) |
| `versions/` | archive: `snapshot.py`, `compare.py`, one folder per version (src + bench + cases + manifest) |
| `tools/` | `commons_survey.py`, `commons_isolated.py`, `iris_sharpness.py`, `strand_stats.py` (S0), `guide_trace.py` (§7) |
| `ref/`, `ref-staging/`, `study/` | data, quarantine, study chapters + spec; `study/08-microstructure-and-strand-building.md` is the strand track's log; `study/audit-27`, `study/s0-strands`, `study/audit-s1`, `study/audit-s6` are its probe data |

## How iori likes to work

Diagnosis first, then a phased plan with real scoping questions; then build. Be honest about what a metric says versus
what the picture shows, and about your own mistakes. One change per version, with an ablation when a change has two
parts; seal every bench in `versions/`; write each checkpoint into the spec. Commit on main when asked or at clear
checkpoints (iori pushes; the server is updated by iori). Keep research data out of the repo and the site.
