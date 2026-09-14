# Iris Engine — handoff (2026-09-12 night, engine 0.7-fields, Phases A + B + C done)

Start here if you are a new Claude Code session taking this over. Read in this order:
`HANDOFF.md` (this) → `README.md` (run / panel / test) → `study/00-summary-and-spec.md` (every decision and
phase log, §1–§18) → `study/07-fields-and-editing.md` (the field/editing design) → `study/06-texture-study.md`
(measured targets). Memory for this project lives in the Claude memory dir as `iris-engine-project.md`.

## What this is

A photoreal, fully procedural human iris in WebGL2 (`index.html`, one page, no build) with a fitter
(`fit.js`) that recreates real iris photographs as loadable **iris IDs**: globals + object lists +
control fields on coarse polar grids. iori's rules:

- The iris is **always procedural** (code + numbers). No photo-derived textures are stored or shipped.
  Control fields (128×32 material/presence, 256×64 strand flow) count as procedural.
- Photos are ground truth: the fitter fills fields from a photo, and every residual is an engine to-do.
- Every eye made or fitted is stored as an ID that reproduces it deterministically; the fixed-shape
  field stack is the future training data for a photo → fields model.
- The sclera is pure white and blends into the page; only the iris is visible. The eye looks toward
  the cursor; every UI value transitions exponentially.
- Work on the **isolated-on-black macros first** (refs 09, 25, 26, 35 — BENCH ISO) until they reach
  ≥ 80 % MATCH, then whole-eye photos.
- Editing by hand must be possible for everything the photo can fill (collarette spline, comb/warp/paint
  brushes on fields, points for objects). Not built yet (step 4).

## Run and test

UI = the Win98 shell (`ui.js`): top bar → six mode windows (CAMERA MATERIAL RELIEF FLOW FIT DESIGN), Presets ▾ / Fitted ▾ menus (Fitted lists every case in `ref/cases.json` ranked by MATCH). Quality select (top bar): DRAFT · NORMAL · FINE · ULTRA · CAPTURE (spec §19.9). Bench at NORMAL
for comparable numbers (MATCH is measured at a quarter of the fit image, so it is not comparable across modes).
FIT·09 / 25 / 26 / 35 load whole fitted irides from `ref/cases.json` into the interactive view. On a fitted iris the material sliders are modifiers on the fitted fields, FIT·COL / FIT·REL / FIT·FLOW blend each
layer toward the seeded default, and NEW SEED re-rolls only the procedural share.

```bash
python3 iris-engine/serve.py 8768      # launch config "iris-engine"; POST /save/<name>.json → ref/
```
Open http://localhost:8768/iris-engine/ → FIT window → FIT PHOTO → reference photo → **★ FIT HQ** (one button:
CAPTURE quality, alignment, whole chain, relief refinement; ≈ 80 s) or the single steps; POLAR / HEIGHT views; BENCH ISO. Console handle: `window.__irisEngine` (state, genome, fit.*). In the Browser
pane, take screenshots to judge; the polar A/B view (photo strip over render strip) is the fastest
way to see texture differences. `python3 site.py check` for the site registry (unrelated warnings
about voxel-flame pages pre-exist).

## Where it stands

BENCH ISO v58: **mean MATCH 67.5 %** (09: 59.3, 25: 67.4, 26: 74.1, 35: 69.4; height r 0.54–0.79). Full set v36: 37.4 %.
MATCH2 = ¼ SSIM₄ + ¼ SSIM₂ + ¼ gradient agreement + ¼ (1 − ΔE/40) (v62 baseline 58.8; the old MATCH is still reported); height r = Pearson of the photo's height proxy vs the
baked relief through the coordinate map. Phases A, B and C of spec §19 are done (§19.1–19.7): alignment by
construction (`alignLoop`, mask view 13, `u_pupilOff`), every unwrap through the engine's coordinate map
(view 14, `getMap`, `vmax` per angle), per-cell material, brightness field in shading, ridge list (collarette
in `coll` + `genome.ridges`), the relief as a **fitted 2-D Gaussian splat field** (`genome.splats`, `fitSplats`,
splat pass → `u_splats`; holes = field below 12 µm deepened 3× (`g_openDepth`, fixed), `rimSharp` = wall width from the photo via `rimFromPhoto`, floor darkens with depth;
`g_openWarp` bends bundles around openings), LUT yellow axis 8 steps, and `state.sat` (processing chroma gain,
fitted like EV).

The fit chain (`fitGlobal`): solvePose (+ alignLoop) → heightFromPhoto → flowFromPhoto → structuresFromHeight
(ridge list) → fitSplats (2000, ≈ 5 s) → materialFromPhoto (8 bands with EV + sat gain steps, then per cell) →
rimFromPhoto → Nelder–Mead over the non-material genes. Cases + IDs in `ref/cases.json` (1.5 MB); CASEBOOK
renders them live; the HEIGHT view is the relief A/B.

§19.9 added quality modes, slider modifiers, layer blend and procedural re-seed (BENCH ISO v60 at FINE = 62.7 %, not comparable with NORMAL).

Open (§19.7–19.9): darker floors need an occlusion term inside the hole; brushes on the polar canvas (Phase D, 07 §4) and ID blending / style generation are the next editing steps; 09's hue (a* −15 vs the model's −9 — needs a spectral axis or a per-band ab gain); the proxy
amplitude is a heuristic; splats need quantising in the ID export; rimSharp saturates at 1 (a rim material
term may be missing).

## The plan (decided 2026-09-12, second casebook review — spec §19)

Casebook findings behind it: ref 35 renders a larger, displaced pupil (black hump at v = 0 in POLAR);
`materialFromPhoto` fills the material fields **per radial band only**, so colour cannot vary around
the ring; the coarse LIC (±1.7 mm) dominates the small field amplitudes → radial strips; the isolated
photos have no catchlight but the render draws one and it is scored.

Decisions: alignment loop detects on a **flat ID mask debug view** (pupil / iris / outside), material
inverted **per cell** (128×32), **no specular when `fit.isolated`**, do **A then B with BENCH ISO after
each**, C waits for the numbers.

1. **Phase A — alignment by construction (DONE, BENCH ISO v52 = 49.9 %).** Boundary-point fits for limbus ellipse + pupil circle in the
   isolated aligner; flat mask view in `fs-photo`; loop render → detect → compare markers → correct
   `zoomPhoto`, `state.view`, pupil mm, 3–4×; casebook thumbnails run it. Accept: ≤ 1 px on 09/25/26/35,
   flat polar bottom edge. BENCH ISO v52.
2. **Phase B — fields on both axes (DONE, BENCH ISO v53 = 60.8 %).** Per-cell material inversion (band gain loop kept); brightness
   field multiplies albedo directly; 2-D height estimation with the radial trend kept; coarse LIC
   capped ≈ 0.5 mm with an along-strand envelope from the brightness field. Accept: 25 polar shows the
   dark mid band + bright pupillary zone, contrast ≈ 0.35. BENCH ISO v53.
3. **Phase C — the relief layer (DONE: C1 + C2 §19.4, C3 as the fitted 2-D Gaussian SPLAT field §19.5–19.7; BENCH ISO v58 = 67.5 %). Follow-ups done: rimSharp from the photo, warp around openings, LUT yellow ×8 + sat gain. Open: 09 hue, splat quantisation, rim material term.** Relief = ridge list + primitive list +
   the 128×32 residual field. C1 height harness (fine proxy through the map, HEIGHT polar A/B, height
   correlation in the bench rows) → C2 ridge list (successive DP paths, closed rings + open arcs, collarette
   = strongest; `coll` → `ridges`) → C3 primitives (dent, dot, streak, smear, wave; multi-scale DoG on the
   proxy, own sharpness, detection only) → C4 relief pass (quads into a relief texture like the bundles;
   retire the shader object loops). BENCH ISO after C2 and after C3/C4.
4. **Editing tools = the iris designer (spec §20; D0 + D1 + D2 DONE §20.1, `design.js`; Win98 shell + scrubbers DONE §20.2, `ui.js`; NEXT: D3 overlay + clone, D4 alignment controls, D5 object handles, fit panel restyle).** DESIGN mode with a fixed frontal camera on the main screen, tabs panel, field brushes (paint / add / smooth / smear on any coarse field, undo, radial repeat), stamp brushes as splats (relief, colour as a material tuple through the LUT, brightness), then the photo overlay + clone brush (D3), alignment controls (D4), object handles (D5).
5. **Phase E — state of the art (spec §21): E2 MATCH2 + E1 layered strands / thickness / occlusion DONE (§21.1, BENCH ISO v62: MATCH2 58.8 baseline, MATCH 67.5 flat, height r 0.82–0.88). Residual study says next: E3 contrast + floors (hemispheric AO at bake, floor to ABL, fitted gap shadow, a contrast target in the material loop), E4 the radial profile (thickness from brightness; 35's band 2 is −23 L*), then fitted strand layout. HDRI not yet; BR2049 analysis mode later.**
6. **Provenance + dataset export** (07 §5).
7. **Whole-eye photos**: lid chords, source shape/size/rotation as fit genes, dark-iris pupil detector,
   BENCH ALL, casebook as a site page.

## Gotchas learned (do not rediscover)

- GLSL macro parameters must not be named `x`/`y` (they rewrite `.x` in the body).
- Every photo ↔ render comparison must go through the engine's coordinate map (`getMap`, view 14): marker
  geometry (pupil edge → limbus) is not the tissue coordinate (margin → 6 mm root, dilation remap), and the
  mismatch showed as a 0.15 radial shift in the polar view.
- A field that multiplies the shading and a per-cell material are degenerate unless the field is normalised
  per material cell; otherwise the inversion loop runs to the LUT's edge.
- `limbalDark` reaches inward to 1 − limbalWidth; any material inversion through the renderer must run with it at 0.
- The conic fit's sign depends on whether the image origin is inside the ellipse; test −F/A > 0, not A > 0.
- Never bind the render target as the accumulation source (feedback loop → blank frame) — also true for any
  off-screen map render (`design.js` binds a 1×1 dummy as the read texture).
- The interactive smoothing loop must pause **before** lerping while `state.fitting`/`capturing`; every
  programmatic pose change sets `state` **and** `target`.
- Any calibration or inversion must first set a defined lighting state (EV 0, ROOM 0.35, LID 6, bloom 0);
  bench leftovers (ROOM 1.0) once skewed everything.
- The atlas mip level is analytic (pixel angle × distance / magnification); `fwidth()` breaks with
  per-pixel lens samples.
- The 3-band Rayleigh material cannot make green/amber; the spectral LUT with the yellow absorber can,
  and only with Mie ≈ 0.08 (`buildSpectralLut(5.0, 0.08)`).
- Splicing `index.html` with `str.index` must bound searches inside the intended `<script>`; the shaders
  share function names.
- The Browser pane throttles rAF when hidden; measure GPU cost with synchronous draws + readPixels. Its pointer also moves
  with every screenshot, so the eye turns and the accumulation resets: judge the interactive view with REF on, or by
  the fit panel's renders; "frames = 1" in the pane is not a bug.
- A GLSL variable used before its declaration fails the link silently at runtime: the eye vanishes, the UI stays; check
  `gl.getProgramParameter(LINK_STATUS)` and recompile the shader source in the console to read the error.
- A scrubber/knob drawn while its window is hidden has zero width: any loop that steps by pixels-per-unit must guard
  against it (it hung the page once).
- The interactive canvas must be sized at the device pixel ratio (`Q.dpr` cap); at 1× a retina display looks soft and
  the relief reads as flat.
- Wikimedia thumbnails rate-limit parallel downloads; fetch sequentially with a UA string.

## File map

| path | what |
|---|---|
| `index.html` | engine: shaders `fs-bake` (fields, objects, LIC strands, T0/T1/T2), `vs/fs-bundle`, `fs-photo` (eye, refraction, two-material shading, lighting, debug views), `fs-post`, `fs-blit`; genome, presets, spectral LUT + `invertLut`, fields (`FIELD_DEFS`), ID v2, UI |
| `fit.js` | alignment (isolated: moments; whole-eye: multi-threshold pupil, RANSAC limbus), `solvePose` + `projectPoint`, scoring (MATCH/SSIM/profiles/texture stats), `heightFromPhoto`, `flowFromPhoto`, `structuresFromHeight`, `materialFromPhoto`, `fitGlobal`, bench/cases/casebook/study, polar view |
| `ui.js` | the Windows 98 shell (§20.2): top bar with the six mode windows (floating, remembered), scrubber knobs, Presets / Fitted menus, icon toolbar |
| `design.js` | the designer: tabbed panel, DESIGN mode (fixed camera, crop zoom/pan, main-canvas coordinate map), field brushes, stamp brushes → splats / paint splats, picker, eyedropper, undo, shortcuts |
| `serve.py` | dev server with `/save/*.json` |
| `ref/` | 43 CC photos + `refs.json`, `align.json`, `cases.json`, `bench-*.json`, `texture-study.json` |
| `study/` | 00 spec, 01 anatomy, 02 colour, 03 rendering lit, 04 photography, 05 synthesis, 06 texture study, 07 fields & editing |

## How iori likes to work

Diagnosis first, then a phased plan with scoping questions; then proceed. Be honest about what a
metric says versus what the picture shows; write every checkpoint into the spec; keep the process
measurable (BENCH ISO after each engine change). Answer mid-turn messages in the running turn.
