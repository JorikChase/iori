# 11 — The plan: every eye a layer model (agreed with iori, 2026-09-21)

Follows `handoffs/2026-09-21-ui-tissue-start-eye.md` §5 and `study/10-feature-ledger.md` §11. One session, the same
gates as before: isolated integrity bench **67.1 / 66.8 / 69.4 / 66.8** since engine 0.9.5-yellow (v92, §3.3; it was
61.6 / 68.3 / 70.5 / 66.4 up to 0.9.4) with the layer model off, contract `compare()` =
`[]`, `reach()` = `[]`, tests open the page with `?start=off`. Every new control gets a ledger row and a
`controls.json` home in the same commit that adds it.

## 0. iori's decisions (2026-09-21)

| # | decision |
|---|---|
| D1 | **S3 is next** — ship the two measurements with the eye. It ends with a **side-by-side** (measured eye · shipped eye · difference) **and the time saved**, step by step. |
| D2 | The Tissue window's **Load button always measures**. Only the quiet load on arrival uses the shipped measurements. (So the button is also the reference the shipped file is checked against, and the exporter hangs off it.) |
| D3 | Painted work lives in the **browser plus an export file**. **Cmd / Ctrl + S saves**, and the saved file is a real save / load state of the whole page — not only the journal. |
| D4 | **Everything must be able to have the layer model** — every photograph, and every procedural eye (seed, preset, ID). The legacy model stays only as the bench's baseline until that is true. |
| D5 | **Variation soon** — T7 (eyes 09, 25, 35 through the layer model) moves up, directly after S3. |
| D6 | **Layer fitting on the site** is wanted (a visitor's photograph → a layer model in the browser). Feasibility in §6. |

Not answered, so the recommendation stands until iori says otherwise: the stored quality is respected for the display
and never used for measuring (the shipped measurements are taken at NORMAL).

## 1. The order

| step | what | why here |
|---|---|---|
| **S3** | ship `calibrate()` + `measureDelight()` with the eye; no photo, no 5 MB case file on arrival | 60 % of the iPad's 11.9 s |
| **T7 → S5** | `layer_proof.py` without ref-26 constants → 09, 25, 35 → a different eye per visit | D5: variation soon; needs S3's per-eye file layout |
| **SAVE** | the session file, Cmd + S / Cmd + O, autosave | D3; before the brushes, so painted work is never lost from its first day |
| **G1** | guide brush | unchanged |
| **G4** | the op journal joins the session file | small once SAVE exists |
| **G2** | crypt / furrow / spot brushes; furrows as primitives | the sheet stops borrowing legacy relief → the case file shrinks to a few KB |
| **G3** | the generator: knobs → seeded ops → a layer-model eye with no photograph | D4 for procedural eyes; unlimited variation |
| **S4** | compact primitives (T5), after G2 has settled the schema | quantising a moving format means doing it twice |
| **T8** | the layer fitter in the browser | D6; needs T7's parametric fitter |
| **T6** | the fitter grows the eye through the op journal | unchanged, last |
| S2 | the growing eye on arrival | only if S3's numbers are not "instant"; after S3 it is six 0.1 s bakes, so cheap to try |

## 2. S3 — ship the measurements

What a load does today (read from `tissue-ui.js` `X.load`, `fit.js` `renderCaseThumb`, `tissue.js` `proof`):
`ref/cases.json` 5.1 MB for one case → the photo 1.5 MB, fetched twice → case import + align + first fit render →
primitives 1.6 MB → `load` → **`calibrate()`**: 2 bakes, 2 fit renders, a 7-channel CPU blur over the fit frame →
`bake` → `setOrigin` → **`measureDelight()`**: 4 bakes, 36 fit renders (2 greys × 9 tiles × relief on / off), a
readback and a coordinate map per tile.

| # | piece | detail |
|---|---|---|
| S3.0 | `fit.js` first-load GL 1281 | look at it first — S3 rewrites the same first-load path |
| S3.1 | per-eye case file `data/case-26.json` | case 26 alone is **564 KB gzipped**, not "small": the sheet's relief is still the legacy atlas (`sheetZ` 0.5), which comes from the case's genome + `fieldsEnc`. It shrinks to a few KB after G2. `ref/cases.json` stays for the casebook and the fitter only |
| S3.2 | a frame without the photo | `renderCaseThumb` needs `loadImage` only for `fit.W / fit.H` and `fit.photo`. A sibling `frameFromCase(c)` sets the frame from stored dimensions, skips the thumbnail diff. Guard every reader of `fit.photo` that can run while it is null |
| S3.3 | the light, shipped | `T.irr` is smooth to 0.2 mm and read only on the CPU (`irrAt` in `toAlbedo`), in the JSON's own pixel frame → a coarse grid (start at 96 × 96 × 6, float16 ≈ 100 KB) that does not depend on the device's quality |
| S3.4 | the shading, shipped | the de-light grid is ≈ 1675 × 240 cells of 15 µm, one channel near 0.8–1.2 → 16-bit, a few hundred KB. **First measurement: the real `srelStats.grid` and its gzipped size** |
| S3.5 | validity key | both depend on the dials (`deckZ`, `sheetZ`, `margFade`, `marginKeep` …), the case's light and pose, and the shaders → the file carries engine version + dial hash; a mismatch falls back to measuring |
| S3.6 | exporter | after a measured load (the button, D2): `IrisTissue.exportMeasurements()` → `data/tissue-26.cal.bin` + a JSON header. Console / Help menu, ledgered |
| S3.7 | `proof({ shipped })` | the arrival path: load → shipped light → bake → origin → shipped shading → on. The button never passes `shipped` |

**Gate.** Shipped load against measured load, NORMAL, `?start=off`: MATCH2 within 0.05 of 84.6, cellDab unchanged,
no pixel further than 2 / 255, isolated bench unchanged (everything stays in `tissue.js`, nothing enters `fs-photo`).
**Deliverable (D1):** one image — measured · shipped · difference × 16 — and a table of the load's steps before and
after on the dev machine; iori reads Help ▸ Load timing on the iPad and the phone for the device rows.
Expected: iPad 11.9 s → ≈ 3–4 s at CAPTURE (2.2 s of that is the 2064 × 2580 canvas's first frames); dev 4.1 s → ≈ 1 s.

### 2.1 S3 built (2026-09-21) — what was found and what shipped

- **S3.0 — the "fit.js first-load GL 1281" was not fit.js.** The fullscreen-quad setup in `index.html` asked every
  program for a `position` attribute, and the four atlas passes (bundle, strand, splat, splat4) have none: −1 went
  into `enableVertexAttribArray` — 4 × 2 warnings on every load. Guarded; the console is clean.
- **A measured load was not reproducible, and the published 84.6 was an artefact.** `importID`, `loadSeedIntoSliders`
  and `loadEyePreset` wrote `state.ringR` but not `target.ringR`; ringR is a SMOOTH_KEY, so the render loop eased every
  imported eye's ring radius back to the default 0.4 — on screen for every seed / preset / ID, and *during* a staged
  load (the stages yield to the loop), which measured whatever point of the drift it reached. The same bug class as the
  fitter's ringR setter (previous handoff §4), through another door. Fixed in all three; the measured load of eye 26 is
  now deterministic — **MATCH2 84.243** (MATCH 90.18, Δab 2.16, strandCorr 0.369), staged or direct, pixel-identical
  load to load. The drifted ring (towards 0.4) scored 84.6: a lead for the ring radius, not changed here.
- **The light cannot be coarsened.** At the pupil margin the measured light falls from ≈ 1 to ≈ 0 within a pixel or
  two, and toAlbedo divides by it: any interpolation (step 2: max 8 / 255; step 4: max 20 / 255) moves the ruff. It
  ships at the fit's own 640 × 462, looked up nearest-pixel exactly as `calibrate`'s `irrAt`, with the mask per pixel.
  The shading grid (1588 × 239 cells of 15 µm) ships whole.
- **Precision, measured** (shipped vs measured, NORMAL; every variant max 1 / 255, none > 2):

  | light bits · shading bits | gzipped | MATCH2 | mean \|Δ\| |
  |---|---|---|---|
  | 16 · 16 | 1187 KB | 84.243 | 0.0002 |
  | 12 · 12 | 782 KB | 84.242 | 0.0024 |
  | **10 · 11 (shipped)** | **629 KB** | **84.249** | **0.0057** |
  | 9 · 9 | 483 KB | 84.256 | 0.0091 |
  | 8 · 10 | 504 KB | 84.224 | 0.0150 |

  11 bits is what the RGBA16F texture keeps of the shading near 1.0 anyway; the light's g and b planes are stored as
  differences from r (the light is near-white).
- **The arrival path** (`data/case-26.json` → `frameFromCase` → `proof({ shipped })`) renders identically to the
  shipped load in the photo's frame (max 1 / 255, same mean) — the photoless frame is exact. cellDab 2.65 = 2.65
  (p90 5.34, ΔL 3.36 both). Side-by-side: `study/proof-layers/s3-side-by-side.png` (measured · shipped · |Δ| × 16).
- **Fallback verified**: with a non-default dial the arrival refuses the file on its key and measures in the photoless
  frame (3.8 s on the dev machine), no error.
- **Gates**: isolated bench 61.6 / 68.3 / 70.5 / 66.4 (unchanged, after the ringR fix); contract `compare()` = `[]`
  after taking the API block into the baseline (the only difference: `E.fit.frameFromCase` added); `reach()` = `[]`.

**Time saved** — the start eye's load, step by step (dev machine, NORMAL; "first frames" left out, it is the canvas and
a hidden pane throttles it):

| step | before (measured) | after (shipped) |
|---|---|---|
| case file | `ref/cases.json` 42 ms | `data/case-26.json` 37 ms |
| photo + import + first fit render | 350 ms | frame + import + first fit render, no photo: 64 ms |
| primitives + mapping | 180 ms | 116 ms |
| measuring the light | 835 ms | — (installing the shipped file: 31 ms) |
| bake + origin | 144 ms | 159 ms |
| measuring the shading | 2823 ms | — |
| **total** | **4.37 s** | **0.41 s** |
| over the wire (gzip) | case file 2.26 MB + photo 1.48 MB (twice on a cold cache) + primitives 1.55 MB = **5.3–6.8 MB** | case 0.57 MB + measurements 0.64 MB + primitives 1.55 MB = **2.8 MB** |

The iPad measured 11.9 s before (7.1 s of it the two measurements, 1.5 s the photo + import at CAPTURE); its after
number comes from Help ▸ Load timing once this is deployed (the record now says `path: arrival (shipped)`).

## 3. T7 → S5 — the other eyes, then a different eye per visit

`tools/layer_proof.py` (704 lines, OpenCV + numpy + the S0 tracer in `strand_stats.py`). What is tied to ref 26:

| tied to 26 | becomes |
|---|---|
| the photo path, `PUP`, `LIMB`, `PPM_FIT`, `'fit': [1280, 925]` | read from the case's `align` in `ref/cases.json` (`--ref NN`); px / mm from the limbus radius, as `tissue.js` already does (`limbus.rx / 5.85`) |
| the camera grade (chroma, hue) | already fitted per photo (line 516) — nothing to do |
| hole detection thresholds ("dark AND grey, relative to the sheet around it"; the brown-spot rule) | **the real risk.** Tuned on a green eye with open crypts. 09 (blue-green) has little border layer — most of it may read as one hole, or none. Expect per-eye review, and possibly a "no sheet" regime where the deck is the whole iris |
| `tissue_like`, `pupil_margin` band (30–110 cycles / rev), minimum sizes | in µm already; verify per eye on the review sheet |
| `tissue-ui.js` `CASE` / `SRC`, the stats line's "67 beads", `start-eye.js`, `state.preset = 'fit-26'`, the timing filter | a table of eyes; `start-eye.js` becomes one ≈ 5 KB stand-in per eye |

Steps: **T7.0** parametrise, and prove ref 26 still exports the byte-identical JSON. **T7.1** run 25 and 35 (green /
grey-green, closest to 26), review sheet per eye (primitives over the photo, holes, margin), MATCH2 / cellDab per eye.
**T7.2** 09, the hard one. **T7.3** the Tissue window loads any of the four; the casebook marks which eyes have a
layer model. **S5** the arrival eye is one of the accepted eyes, chosen per visit (the choice kept for the session so
a reload does not swap the eye under the visitor); each ships its own case file, primitives and measurements, so a
visit still downloads one eye. An eye joins the rotation only when iori has looked at it.

### 3.1 T7 so far (2026-09-22)

**T7.0 — parametrised.** `layer_proof.py --ref NN` reads the eye and its geometry from `ref/cases.json` (`align`,
normalised to the 1280 px fit image); rounded as the old constants were, ref 26's PUP, LIMB and px/mm come out
bit-identical. **Proven**: the original script (HEAD) and the parametrised one export byte-identical JSON today. Both
differ from the published `data/tissue-26.json` in 47 ruff-bead values, each by exactly one step of the export's
5-decimal rounding (1e-5 mm, 10 nm): values on a rounding edge that an earlier run put on the other side.

**The ring rule** (`layer_proof.py`, hole candidates): a candidate spanning more than 180° about the pupil is not a
crypt (first 90°, which also took ref 09's 135° crypt complex — a real opening; raised). Ref 35 has a soft, dark, grey periphery, and the hole test ("dark and grey relative to the sheet within
0.35 mm") has nothing brighter to compare it with out there: one outline ran round the whole ciliary band, 41.7 % of
the iris, filled with deck fibres. With the rule it stays sheet — holes 39.5 % → 2.9 %. At 180° the rule leaves ref 26
**byte-identical** and ref 25 unchanged (it does not fire on either).

Whole iris at NORMAL, in the engine (measured load, `tools/t7/eyes.js`; review sheets `study/proof-layers/t7-review-NN.png`):

| eye | legacy fit MATCH2 · cellΔab | layer model MATCH2 · cellΔab · grad | fitter: holes · CPU · peak memory |
|---|---|---|---|
| 26 | 73.97 · 14.16 | **84.24** · 2.65 · 0.750 | 14.0 % · ≈ 11 min · — |
| 25 | 71.90 · 12.80 | **87.76** · 2.64 · 0.792 | 8.9 % · 578 s · 4.07 GB |
| 35 | 70.27 · 13.58 | **81.39** · 2.67 · 0.654 (76.41 before the ring rule) | 2.9 % · 289 s · 2.92 GB |
| 09 | 68.49 · 14.69 | **79.67** · 3.83 · 0.700 (80.70 with its crypt complex wrongly removed at 90°) | 21.4 % · — · — |

Two defects I called by eye were wrong, and measuring showed it — worth remembering for every review sheet:
ref 35 "looks squashed" (the photograph's tissue really is 348 × 307 fit px, the case's ellipse is right), and "the
pupil is too big" on 25 / 35 (the dark-disc radius of render vs photo: 26 89.5 / 89.7 px, 25 71.2 / 68.5, 35 76.6 /
81.3 — the review sheet's black photo background against the renders' white fools the eye). **Measure before
calling a defect.**

**Two open defects, both measured.** (1) Ref 09's blue: the photograph's pupillary zone is clear sky-blue, the layer
model's grey-green — the fitter's camera grade is the weakest of the four (ΔE 3.80 with a +30° hue rotation, against
1.0–1.7 elsewhere): the engine's spectral LUT does not reach that blue, so the colours land on the nearest grey-green.
A gap in the material model (the structural blue — stroma scatter), not a threshold; a study of its own before 09
joins the rotation. (2) Ref 09's pupil is 5.4 fit px (≈ 80 µm) too wide — its traced margin (2.14–2.30 mm) lies
wholly outside the fitted circle (2.10), and the aperture follows the trace. Ref 26 matches, so the tracer's
threshold cannot simply move; a per-eye check against the dark disc is the first step.

Still to do before an eye joins the rotation: iori's look at each review sheet (25 and 35 are the candidates; 09 waits
for its blue), then T7.3 (the Tissue window loads any accepted eye; per-eye case + measurement
files as in S3) and S5.

### 3.2 T7.3 + S5 built (2026-09-22) — three eyes on arrival

iori looked at the review sheets: **25 and 35 look good**. Both are published with their own case and measurement files
(25: arrival 0.24 s vs 2.87 s measured, max 1 / 255, 607 KB; 35: 0.19 s vs 2.20 s, max 1 / 255, 482 KB), the Tissue
window picks among 25 · 26 · 35, and each visit meets one of them (ledger §7). 09 joins when its blue is fixed (§3.3).

### 3.3 Ref 09's blue (iori, 2026-09-22: "fix 09's blue") — the diagnosis

Measured on the photograph's own iris pixels (`tools/t7/blue.py`, `tools/t7/yellow_edge.py`):

- **The blue is out of the LUT's gamut.** Ref 09's blue is cyan-blue — median L\* 64, a\* −13, b\* −8, 9 % of the iris.
  The spectral LUT's bluest colours are *violet*-blue: b\* down to −25 but a\* ≈ +7. Its blue is Rayleigh scattering
  weighted to 400 nm with nothing removing the violet end. (The same side of the hue circle as the legacy presets'
  lavender cast.) Under the fitter's grade (×1.6, +30°) the blue sits at ΔE 10.8 while the rest of the iris fits at 1.7.
- **Not the camera.** A 3 × 3 colour matrix fits both (ΔE 0.8 / 0.8) only by tinting grey cyan (rows summing to
  0.54 / 1.37 / 1.66 — the camera would be doing the tissue's work). Held white-preserving and near the identity, a
  matrix recovers almost nothing (blue 9.6 at off-identity 1.3; 4.2 only at an implausible 3.3).
- **Not scattering or melanin.** A flatter scattering exponent makes it worse (rayExp 4 → 16.2, 3 → 19.1); finer low
  melanin steps change nothing (10.5).
- **The yellow pigment's absorption edge.** The LUT absorbs yellow pigment below a logistic edge at 500 nm. Moving the
  edge toward violet removes the violet and keeps the blue — cyan. On all four eyes, the grade re-chosen as the fitter
  chooses it:

  | edge | 09 ΔE all (blue) | 25 | 26 | 35 | grades chosen |
  |---|---|---|---|---|---|
  | 500 (today) | 1.71 (10.54) | 0.74 | 0.53 | 0.95 | 09 ×1.8 +30°, 26 +10°, 35 +20° |
  | 480 | 1.42 (7.24) | 0.56 | 0.46 | 0.79 | |
  | 470 | 1.36 (**4.90**) | 0.51 | 0.40 | 0.77 | 09 ×1.6 +20°, others ≈ identity |
  | 460 | 1.29 (8.05) | 0.44 | 0.35 | 0.66 | |
  | 450 | **0.94** (8.19) | **0.37** | **0.31** | **0.56** | all ×1.0, 0–10° |

  Every eye fits better as the edge moves toward violet, and the camera grade it needs shrinks to nearly none — the
  hue rotations the fitter has been choosing were compensating for the edge. Ref 09's blue is best at 470; at 450 the
  grade rule (smallest gain within 10 % of the best) serves the majority and the blue goes back to 8.

**Where the edge lives.** The fitter's LUT is a port of the engine's `buildSpectralLut`. The layer model renders from
its exported colours (the engine turns them into albedo), not from the LUT — so changing the *fitter's* edge fixes the
layer-model eyes without touching the engine or the integrity bench. Changing the *engine's* edge is a model version of
its own: it would move the bench (the procedural and legacy eyes) — iori's call. `layer_proof.py --yellow-edge NM`
(default 500: a default run stays byte-identical to the published eyes).

**Decided (iori, 2026-09-22): change the engine's edge too** — "the bench can move if it means general improvement ready
for the future; we will build the whole database only when the engine is in production". So nothing published is
re-fitted now: the cases, the legacy presets and the layer-model eyes stay as they are until that rebuild.

**Engine 0.9.5-yellow (v92-yellow).** `YELLOW_EDGE_NM = 450` in `index.html`'s `buildSpectralLut`, mirrored as
`layer_proof.py`'s default. Isolated bench, every eye fitted from scratch (MATCH2):

| eye | 500 nm (0.9.4) | 470 nm | **450 nm (0.9.5)** | Δab 500 → 450 | cellΔab 500 → 450 |
|---|---|---|---|---|---|
| 09 | 61.6 | 66.5 | **67.1** | 14.5 → 7.2 | 15.3 → 10.1 |
| 25 | 68.3 | 66.7 | 66.8 | 7.5 → 8.3 | 12.2 → 12.0 |
| 26 | 70.5 | 68.2 | 69.4 | 11.6 → 13.5 | 14.0 → 15.2 |
| 35 | 66.4 | 67.8 | 66.8 | 11.3 → 11.3 | 12.8 → 12.9 |
| mean | 66.70 | 67.30 | **67.53** | | |

A net gain and a large one for the blue eye, not a clean one: the green-amber eyes 25 and 26 lose about a point in the
*legacy* fitter, and the milder 470 nm does not buy it back (26 is worse there). The likelier cause is the legacy
fitter's own camera chain (kelvin, saturation) having been tuned against the old LUT — for the production rebuild.

What 0.9.5 does and does not move:
- **Layer-model eyes: unchanged** (26 84.25, 25 87.76, 35 81.40) — they render from their exported colours.
- **Legacy presets: stale until the rebuild** — their materials were fitted against the old LUT (26's preset 73.97 →
  65.76, cellΔab 14 → 26). Eye ▸ Presets shows them so; the rebuild re-fits them.
- **The start eyes' instant stand-in** (procedural, from the same case genomes) shifts colour for the second or two
  before the layer model takes over.
- **Shipped measurements**: keyed on the engine version, so re-exported under 0.9.5 for 25 / 26 / 35.

**Ref 09 under 0.9.5**, fitted with the 450 nm edge and the balanced grade (×1.6, −10°; clean cellΔab 2.37): in the
engine MATCH2 80.32, cellΔab 3.03 (from 3.83), and the blue's error over the texture floor 3.0 (from 7.3 at 500 nm) —
the pupillary zone and the right side render light blue-grey instead of grey-green. Review sheet
`study/proof-layers/t7-review-09.png`. **Joined the rotation (iori, 2026-09-22)**: `data/tissue-09.json` (the 0.9.5 fit),
`case-09.json`, `tissue-09.cal.bin` (arrival 0.27 s vs 3.72 s measured, max 1 / 255, 598 KB). All four reference eyes
now greet visitors.

### 3.4 Step 1 of the rebuild (iori, 2026-09-22: "do step 1 now, then G1")

The full production rebuild waits for G2 (furrows as primitives: the layer eyes stop borrowing legacy relief from the
cases) and S4 (the compact format). Step 1 removes only what 0.9.5 left visibly stale:

- **The Load button reads the pinned case.** Both paths now read `data/case-NN.json` — the case the eye's layer model was
  measured and shipped on; `ref/cases.json` belongs to the legacy fits. (Verified: with the freshly baked case the same
  measured load gives 84.898, up to 83 / 255 off — the drift the pinning prevents.)
- **Legacy cases and presets re-fitted under 0.9.5** (`F.bakePresets()`, CAPTURE, fitHQ → `ref/cases.json`,
  `ref/presets.json`): 09 65.2 → **71.2**, 35 69.7 → **72.5**, 25 65.2 → 63.9, 26 68.2 → 66.7 (each against the old preset
  in its own era; against the stale presets under 0.9.5 — 63.7–66.0 at NORMAL — every eye is better). The start eyes'
  stand-ins regenerated from them.
- **Why 25 and 26 lose ~1 point in the legacy fitter.** Not the gamut: the engine's own LUT reaches both *better* at
  450 nm (`tools/t7/engine_gamut.py`: 25 ΔE 2.66 → 1.16, 26 3.46 → 0.84, hue error 3.6° → 0.7°). The fitted eye comes out
  too green and not yellow enough, worst in the gaps between fibres (26, band 0.22: gap a\* −18 against the photo's −2;
  bands 0.33–0.44: ridge b\* 16 against 31–33), with the camera saturation gain at 1.6 amplifying it. The legacy
  fitter has no hue rotation, and its gap materials use constants tuned against the old LUT (`gapStromaMul` 0.35,
  `gapMelMul` 1.2). Re-tuning it belongs to the production rebuild.

**Open, measured, not solved: the measured load is path-dependent.** In a fresh page, eye 26's measured layer model is
84.245 if the page's first layer load is a direct `renderCaseThumb` + `T.proof`, and 84.627 if it is the Tissue window's
`X.load` — and whichever comes first holds for every later load in that page (max 14 / 255 between the two). Only the
de-light measurement differs (its tile coordinate maps cover 992 421 vs 992 601 pixels); the light (`T.irr`), the
region, the margin and the origin are identical. Ruled out: the case contents (old and pinned give the same), smoothed
state drift, load timing (a 6 s wait changes nothing), yielding between stages (a staged direct load first gives
84.245), `E.state` at the instant `measureDelight` starts (identical), stray texture bindings (every sampler of the photo
pass is rebound per draw), the margin uniforms (set every draw), the deck-height cache, the window's live map.
Consequence: the Load button can give a picture up to 14 / 255 off the shipped one. Visitors never measure (the arrival
is deterministic), so it is a dev-side determinism bug. Next step: bisect `X.load` line by line in a fresh page.

## 4. SAVE — Cmd + S, a real save / load state (D3)

Read as: Cmd / Ctrl + S no longer opens the browser's useless "save page as"; it downloads a session file, and
opening that file puts the page back exactly. (If iori meant a self-contained HTML that reopens in that state, that is
a different build — say so.)

| piece | detail |
|---|---|
| file | `name.iris.json`, `{ format: 'iris-session', v: 1, engine: '0.9.x' }` + the eye (the existing ID: genome, fields, view) + which layer-model eye and its dials + the knob offsets from the fit + camera / light / post + quality + cornea toggle + the op journal (`T.ops`, from G4) + the primitives' hash the journal was painted on |
| not in it | the primitives themselves and the photographs (referenced by name + hash); window positions (a preference, stays in localStorage) |
| keys | Cmd / Ctrl + S save · Cmd / Ctrl + O open · drop a file on the eye · File menu: Save, Open, Revert. `preventDefault` only when the shell has focus |
| autosave | the same object to localStorage when the hand stops; on arrival a saved session wins over the start eye (as `#id=` links do today) |
| load order | eye → layer model (shipped measurements if the dials are the defaults, else measured) → knob offsets → journal replay → `commit()` → camera |
| journal on other primitives | hash mismatch → the file still opens, the journal is offered but not applied silently |
| tests | save → reload → load → pixel-identical frame at NORMAL; a contract row; `reach()` rows for the menu items |

Built before G1 with an empty journal; G4 then only adds the journal's serialisation and replay.

**SAVE built (2026-09-22)**, ahead of T7's engine side while the fitter ran: `session.js` + `E.makeID()` (the ID
without exportID's download / clipboard / URL). As built it differs from the table in two places: a layer-model
session stores the eye's case + dials, not an ID (≈ 0.4 KB; the eye IS the case), and File ▸ Revert became
File ▸ New (the start eye) — a visitor whose session is kept must always be able to get back to eye 26. Verified in
ledger §8. Still to do: the journal (G4); pixel-identical frame after a restore at NORMAL is implied by the identical
state, not yet shown as pixels.

## 5. G1 → G4 → G2 → G3 (previous handoff §5, with D4 added)

- **G1 guide brush** — deck strokes on the sheet are invisible by design; the guide brush paints the `guides` class.
  The Tissue window gets a Paint page (brush, width, colour from the nearest fibre, undo). Liveness marks as P6.
- **G4** — journal into the session file (§4).
- **G2 crypt / furrow / spot** — furrows as primitives: the `furrow` knob lives again, the sheet stops borrowing the
  legacy height field, the per-eye case file drops its genome (S3.1 → a few KB). Re-export the shipped measurements.
- **G3 the generator** — the knobs produce seeded ops. This is D4 for every procedural eye: a seed, a preset or an ID
  becomes a layer-model eye with provenance `seeded`. When it holds, the legacy presets can leave the Eye menu and the
  legacy model remains only as the integrity bench's subject.

## 6. T8 — the layer fitter on the site (D6): possible, and how

`layer_proof.py` is classical image processing — Gaussian blurs, morphology, thresholds, contours, distance
transforms, skeleton tracing, a LUT inversion. Nothing in it needs a server or a GPU farm.

| route | what | cost | verdict |
|---|---|---|---|
| **Pyodide in a Worker** | the same Python file, run by CPython-in-WASM with its numpy and opencv-python builds | ≈ 30 MB, fetched only when a visitor drops a photo, cached after; pure-Python loops (`zhang_suen`, `order_path`, `weave_heights`) several × slower than native | **first** — one fitter for the offline tool and the site, so T7's work is not done twice |
| OpenCV.js + a JS port | the blurs / morphology from OpenCV's own WASM, the rest rewritten | ≈ 8 MB, two fitters to keep in step | only if Pyodide is too heavy |
| WebGL + JS by hand | blurs, morphology, distance transform on the GPU the engine already has; tracing in JS | the most work, no dependency, the fastest | the end state, hot paths first, if the numbers ask for it |
| Rust / C++ → WASM | a rewrite | — | no |

Steps: **T8.0** measure the native fitter on ref 26 — seconds and peak memory (a whole-iris crop is ≈ 2000² px;
a float32 Lab image of it is 48 MB and the script holds dozens of temporaries — fine on a desktop, the open question
on an iPad, where Safari ends a tab near 1 GB). **T8.1** Pyodide spike in a Worker on the desktop: same JSON out?
how long? **T8.2** the pipeline on the page: drop a photo → align (the fitter's `autoAlign` / `alignIsolated`
already exist) → legacy fit for the case (the sheet relief, until G2) → layer fit in the Worker with staged progress
→ measure (the button's path) → Tissue window. **T8.3** photographs that are not cut-outs: the aperture step assumes
a black background, so lids, lashes and highlights need a mask first (`isIsolated`, `renderMask`, `rimFromPhoto` are
the starting points). The photograph never leaves the visitor's device — worth saying on the page.

## 7. Housekeeping, folded into the steps above

The Win98 shell (`ui.js`) is removed at the next sealed version. The pinch fix and the phone's load timing still need
iori's hands. `tubesAt` heights are from the floor up — document it in the Tissue window's Point read-out when G1
touches that page.
