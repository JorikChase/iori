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

**G1 built (2026-09-22).** iori chose the Tissue window's Paint page and "a line while drawing, baked on release".
`T.brush.guides` works in tissue (u, v) — the live view at any camera — and takes each sample's json position from the
nearest measured primitive (the case's pose is not the live camera's; the light that position indexes is smooth to
0.2 mm). Proof: `study/proof-layers/g1-guides.png` (three guides at ×1.5 across eye 26's sheet; hidden over the crypts
by design). Next: G4, the journal into the session file — until then a re-load or a dial clears painted work.

**G4 built (2026-09-22).** The journal is data: `T.journal()` (ops without their undo records, numbers to 5 decimals,
keyed to `T.primKey`) and `T.replay()`; the session file carries it, a restore replays it after the eye loads (and switches
the window to the session's eye — a latent SAVE bug: a layer-model session only restored if the page had arrived on the
same eye), and a re-load of the same eye keeps painted work. `add` ops now keep a snapshot of the curve as added, so a
replay adds that state and re-applies later edits instead of adding their result. Ledger §7.

### 5.1 G1b — parent splines and strand tooling (agreed with iori, 2026-09-22)

Not in the first plan: G1 paints freehand polylines, strands had only the G0 console brush, and nothing could be
edited after it was laid — while §32 asked for details "procedurally paintable and strands editable". Decided:

- **Order: G4 → G1b → G2 → G3.** G4 first, so no edit is ever lost on reload.
- **Painted and measured primitives are editable.** Selecting a measured guide or fibre fits a spline to it on demand;
  its provenance becomes `edited` — the fitted eye itself is editable, not only what is painted on top.
- **Parent curves drive their instances (iori).** A strand bundle is not N independent curves: it is a *parent spline*
  plus parameters (count, spread, waviness, width, a seed per instance's offset), and its strands are generated from
  it — reshape the parent and every strand re-flows. The same parent system drives both layers: deck strands (seen
  through the crypts only — the UI says so) and sheet streaks (a sheet "guide" is a parent whose instance is a streak).
- **Actualize** (iori): select a parent and actualize it, and its instances become individual splines, editable point
  by point; they keep the parent link as a record, but the parent no longer drives them.
- **Three ways to make strands**: grow along a selected parent; the freehand strand brush (which creates a parent with
  its instances, so every bundle has a master); edit point by point after actualizing.

The journal holds it all as ops (add parent, set parent point, set parameter, actualize, move instance point …), so
undo and G4's session file cover every edit.

**Build order (proposed 2026-09-22; iori sees step 2's look before the rest of the UI):**

1. **The data, no UI.** `T.parents` — each `{ id, layer: 'deck' | 'sheet', spline: [[u, v] …] (centripetal Catmull-Rom
   through a few control points, in tissue uv like the brushes), params: { count, spreadMm, wavinessMm, widthMm,
   brightness, seed }, actualized: false, provenance }`. Its instances are generated into the existing sets (`fibres`
   for the deck, `guides` for the sheet), each carrying `parent: id` and its index, resampled every 20 µm, json positions
   from the nearest measured sample (as G1). Ops: `addParent`, `moveParentPoint`, `insertParentPoint`,
   `removeParentPoint`, `setParams`, `actualize`, `deleteParent`; each regenerates only that parent's instances and
   carries its undo. Measured primitives: selecting one fits a spline to its samples (≈ one control point per 0.3 mm) and
   makes it a parent with one instance; provenance `edited`. Tests: every op undoes pixel-identically; journal round
   trip as G4.
2. **Select on the Paint page** — tools `Guide · Strands · Select`. Click picks the nearest instance or parent within a
   few pixels (measured or painted); the selection is drawn over the live view (the parent's spline, its control points
   as handles, its instances highlighted). Drag a handle to move it (re-bake on release, like G1), double-click the
   curve to insert a point, Alt-click a handle to remove it; Delete removes the parent. The page shows the selection's
   params as sliders. **Mock this look for iori before wiring the rest.**
3. **Strands.** `Grow strands` on a selected parent (count, spread, waviness, width); the `Strands` tool is the freehand
   strand brush — a stroke makes a deck parent and its instances. `Actualize` detaches a parent's instances: each becomes
   its own parent (one instance, the same shape) that Select can edit point by point; they keep `from: parentId`. The
   page says that deck strands show only through the crypts.
4. **Gates as always**: ledger rows + `controls.json` for every control, `reach()` / `compare()` `[]`, the bench untouched
   (no engine shader change), a review image of a grown bundle and an actualized edit.

### 5.2 Floating strands and roots (agreed with iori, 2026-09-25/26)

iori's ask (2026-09-25): "engineer the strands to complement the iris by adding more floating strands which balance the
sometimes jaggedy (but acceptable) micro strand shards underneath." Read from the data before anything was proposed:

**Why the shards are jagged.** Eye 26's deck is 695 traced fragments — median run ≈ 0.13 mm (p90 0.29), tubes ≈ 80 µm,
z inferred at crossings (median 87 µm) — drawn as the dome of the nearest tube on ONE heightfield. So a fragment's end
is a vertical wall (T3's mesas), nothing passes over anything, and whatever the photo did not resolve at 28 µm/px was
dropped as grain. The shards are right where they are and carry the photo's own brightness (study/08 §7: traced
positions with real brightness beat any generated texture), so **the shards stay**. What is missing is the continuous
mesh they are fragments of.

**Decisions (iori, 2026-09-26).**

| # | decision |
|---|---|
| F1 | **Generated strands with placement pull, shards kept** — not longer traces. The grower (`strands.js`, S0 priors) grows continuous strands; its `place` pull snaps them onto the shards where they exist and follows the flow field between. |
| F2 | **Roots: trace every shard further along its vector** to find whether it is part of a larger root structure, *before* the grower runs — so the pull has roots to pull onto, not only fragments (§5.2.1). |
| F3 | **Crypts first** (the deck seen through the holes; the probe test exists), the sheet's broad bundles second (a T4 debt). |
| F4 | **Two or three render layers** — ground + one bridge slab now, the count a quality parameter, three at FINE and above (§5.2.3). The full depth-peeled stack (§32 Z) later, on the same code. |
| F5 | **No cap on the photo score.** MATCH2 is reported at every step, not gated; `strandCorr` and the fine band (B3) must rise; cellΔab ≤ 2.75 stays (colour is never traded for structure, §32); iori judges the review sheet. |
| F6 | Pupil-dilation waviness (strands slacken as the pupil opens) waits for G3. |

#### 5.2.1 Roots — a shard traced along its vector

In `tools/layer_proof.py` (the photo and its ridge maps are there; the site fitter ports it later with the rest):

- From each fragment end, the **end tangent** (last three samples, blended with the local flow) is marched forward in
  20 µm steps up to a gap of ≈ 3 spacings (0.3 mm). A candidate is another fragment whose end lies in the corridor:
  across-distance under one tube radius, turn under 30°, width ratio within 0.5–2, colour continuous (Δab of the
  payloads), and **ridge evidence along the corridor** (the tracer's own Hessian response sampled on the marched path,
  so a join is made only where the photo shows tissue between the two, at a lower level than the tracer's threshold).
- Scored, best wins above a threshold; chained transitively with a union-find (no cycles). A fragment joining a root
  at > 30° is recorded as a **branch**, not a link — the "larger root structure" iori named — with its own confidence.
- Exported as `roots: [{ fibres: [id …], links: [{ a, b, gapMm, turnDeg, conf }], branches: [...] }]`, provenance
  `inferred`; `fibres` unchanged (a root points at them, the shards are never rewritten). Same rule for `guides` on the
  sheet (F3, second).
- Review: an overlay of roots in colour over the photo with the joins marked, and the statistics — fragments per root,
  root length against S0's guide / child run distributions (§4 there), fraction of ends left free (S0: ≈ 20–25 % of
  real ends are free — more than that and the chaining is too timid, fewer and it is inventing).

**Built (2026-09-26) — `tools/roots.py`, called from `layer_proof.py` after the weave; eye 26, whole iris.** The fitter
is unchanged everywhere else: at the same yellow edge the committed fitter and this one export identical JSON in every key,
and this one adds `roots` (proven key by key; the export also differs from the 22 September file in its colour keys, which
is T7's per-hue grade objective and predates this). `--dump-roots FILE` writes everything the pass reads (fibres, radii, the
ridge map and thresholds, the signed distance, the photo) so the chaining can be iterated in seconds instead of a 6-min run.

| eye 26 | value |
|---|---|
| fibre ends | 1390 — **54 % at a crypt wall** (the fibre dives under the sheet: `extend_to_walls` stopped it there), 641 inside the holes |
| end pairs within 0.3 mm | 11 899, of which 11 045 fail the 30° turn (a lateral neighbour's end is 24 µm away, median — the lanes are packed) |
| links | **53** from 66 candidates · gap median 95 µm, p90 198 (11 are junction rejoins ≤ 30 µm) · turn median 12.7° · evidence median 1.0 |
| roots | **47**, holding 100 of 695 fibres (41 pairs, 6 triples) · length median 0.47 mm, p90 0.90, max 1.23 (fragments 0.18 / 0.40) |
| branches | 200 branches (> 30°) + 146 merges (a fibre running into a near-parallel neighbour's body: the weave's over / under) |
| free ends inside the holes | 189 = **29.5 %** of the visible ends (S0: 20–25 % of real ends are free) — slightly timid, nothing invented |

Readings. (1) The shards are mostly **wall-bounded runs**: more than half of all ends are where the fibre goes under the
sheet, which no photograph sees — a fact for the render (a wall end should dive, not stop) more than for the chaining.
(2) Of the ends the photo does show, two thirds run into another fibre's body — the tracer's `extend_to_walls` already
walks an end up to its neighbour — so the "larger root structure" here is mainly the branch / merge network, and true
collinear continuations are the 53 links. (3) The review crops show many strands visible in the crypts that the tracer
never found at all: that is coverage, the grower's job in §5.2.2, not chaining. Every end is exported classified
(`roots.ends`, per fibre `[kind at start, kind at end]` ∈ wall · link · branch · merge · free), which is what the grower
needs: a wall end anchors into the sheet, a free end is where a generated strand goes on.

Files: `study/proof-layers/roots-26-crops.jpg` (the four largest crypts, 1.8 mm each: roots in colour, singletons grey,
joins white, branches yellow, merges cyan, free ends red) and `roots-26-whole.jpg`. `data/tissue-26.json` carries the
`roots` key (injected: its fibre geometry is identical to the export's; the page reads explicit keys only, so the shipped
eye is untouched, +10 KB gzipped). Not run yet on 09 / 25 / 35 — after iori's look at 26.

**More strands (iori, 2026-09-26: "we should be able to fit more strands, no? the overlay looks pretty unpopulated").**
Two things were true at once. The roots overlay drew the deck fibres only — the sheet's 1 552 guides and 620 fine fibres
were not in it, and with every class drawn the eye is densely traced (crypt centreline density was already 13.8 mm/mm²
against S0's 8–12). But the crops did show strands in the crypts with no trace, and measuring why found two tracer faults,
both fixed (`--dump-roots` made each trial a 25 s offline run instead of a 6 min fit):

- **Blind wall extension.** `extend_to_walls` marched every end STRAIGHT for up to 70 px: **41 % of all traced deck length
  on eye 26 was such marching**, and it ran across neighbouring strands (the cross-hatch in every crypt). It now follows
  the local ridge direction where the ridge map still shows one, keeps the straight prior only inside the wall's shadow
  band (sd < 12 px), and stops after four steps of dead evidence in the open. Extension share 41 % → 30 %; the spurs are
  gone (`study/proof-layers/` crops, and the offline comparison in the log below).
- **Percentile thresholds.** Hysteresis kept ridge pixels above the 45th / 15th percentile of ridge strength per hole —
  the strongest 55 % by construction, whatever the crypt held. At 20 / 5 the tracer finds **29 % more deck fibres**, all
  visible strands; at 10 / 2 the sheet's grain starts to come in as short worms. 20 / 5 is the default now (deck fibres
  only; veins, guides and the sheet's fine curves keep 45 / 15).
- **Not fixed, named**: at any threshold the darker half of a large crypt keeps visible strands with no trace, and the
  strands' preferred ridge scale is the top of the ladder (38 % of strong ridge pixels choose σ 6.5 px, which the ladder
  does not offer — a bundle population, since the strand spacing measured across the flow is 65 µm). Also: a tube's
  drawn diameter (2 · 1.4 · w, 78 µm median) exceeds that spacing, so neighbouring tubes overlap in the render — a width
  calibration for the render step, not the tracer.

Eye 26, before → after, same page, same load path (`__t7.review`, measured load at NORMAL):

| | old tracer | ridge-following + 20 / 5 |
|---|---|---|
| deck fibres · payload samples | 695 · 7 993 | **896** · 7 824 (shorter: no blind extension) |
| engine MATCH2 · cellΔab · strandCorr · grad | 84.99 · 2.44 · 0.385 · 0.764 | **85.26** · 2.43 · **0.388** · **0.769** |
| fitter B2 / B3 correlation (its own render) | 0.811 / 0.414 | 0.813 / 0.414 |
| roots: links · roots · fibres in roots | 53 · 47 · 100 | 85 · 72 · 157 before the in-lane rule → **58 · 53 · 111** |
| ends at a wall · free among the rest | 54 % · 29.5 % | 47 % · **46 %** |

Both exports here are at the 450 nm edge; the shipped `data/tissue-26.json` is the 500 nm export and scores 84.24, so the
edge alone is worth +0.75 and the tracer +0.27 on top. The free-end fraction rose because extensions no longer walk into a
neighbour and get counted as a merge: those ends are where the ridge died in the open — the grower's continuation
points. **In-lane rule** (added after this rerun's crops showed joins stepping across lanes): a join's sideways offset
from each end's own line must stay under 30 µm, half the strand spacing measured across the flow — a 30° turn over a
0.2 mm gap would otherwise reach the next lane. It removed 27 of 85 links (13 of them more than a tube radius off).
The 46 % of visible ends left free is honest, not timid: they are ends where the ridge evidence died in the open. **Published (iori, 2026-09-26: "publish the new export and commit it")**: `data/tissue-26.json` is this export (896 fibres,
450 nm colours, the roots key), and its measurements were re-exported on the Load button's path — they are measured on
the deck's geometry, and the key that guards them checks only engine and dials, so a new deck with the old file would
have been silently stale. Measured load on the pinned case 85.02 (strandCorr 0.379); the arrival with the shipped file
renders within 1 / 255 of it (mean 0.006, no pixel over 2). The bench in `tools/s3/bench.js` frames its measured load
from `ref/cases.json`, which since rebuild step 1 is not the pinned case: its arrival comparison (max 82 / 255) is
frames, not measurements — use the button path (`__irisTissueUI.load()`) to export and to compare.

**The other three eyes (iori, 2026-09-26: "run the other three eyes and publish them").** Same fitter, same publishing
recipe (export → `data/tissue-NN.json`; measured load on the Load button's path → `exportMeasurements({ lightBits: 10,
shadeBits: 11 })` → `data/tissue-NN.cal.bin`; arrival checked against that measured render). Engine scores from
`__t7.review` in a fresh page per eye, previous export against the new one, same path:

| eye | deck fibres | roots · links | ends at a wall · free among the rest | MATCH2 prev → new | strandCorr prev → new | cellΔab prev → new | arrival vs measured |
|---|---|---|---|---|---|---|---|
| 09 | 1 344 → **1 616** | 73 · 78 | 56 % · 42 % | 81.31 → **81.56** | 0.416 → **0.426** | 3.00 → **2.87** | max 1 / 255, mean 0.005 |
| 25 | 859 → **994** | 63 · 69 | 52 % · 48 % | 87.57 → **87.82** | 0.354 → 0.354 | 2.69 → **2.47** | max 1 / 255, mean 0.007 |
| 35 | 168 → **198** | 6 · 6 | 69 % · 53 % | 83.21 → **83.97** | 0.369 → **0.374** | 2.64 → **2.34** | max 1 / 255, mean 0.004 |

For 25 and 35 the previous export was the 500 nm fit, so their colour gains are mostly the edge (their grades went from
×1.8 / ×1.6 to ×1.2 / ×1.0). Ref 35 has 2.9 % of its iris in holes, hence 198 fibres and six roots — its deck is
nearly all wall-bounded (69 %). Measured loads on the pinned cases: 09 81.40 · 25 88.34 · 35 82.32 (26: 85.02).
Fitter runs in parallel: 09 7.1 min / 1.5 GB, 25 8.1 min / 2.5 GB, 35 3.2 min / 1.5 GB peak. Review crops per eye:
`study/proof-layers/roots-NN-crops.jpg`. Not pushed, not deployed.

#### 5.2.2 The grower on a layer eye

- **Flow and spacing fields of a layer eye**: rasterised from the traced fibres, guides and roots (direction from the
  tangents, spacing from the neighbour distances), smoothed — not the legacy engine's `flowDir` / `spacing`.
- **Parents** (G1b step 1): every root becomes a parent spline (≈ one control point per 0.3 mm through its fragments'
  samples); its fragments are measured instances, and the grower fills the gaps and the neighbourhood with generated
  instances — pull = 1 on a fragment, the flow between. Params as §5.1 plus `floatMm` (height above the floor), `sagMm`
  (a catenary dip between anchors), `taperMm` (the ends thin and lower over their last samples, diving under instead
  of stopping at a wall). Over crossings the Z1 rule (the fibre whose brightness and width hold up is on top; a bump
  per crossing, never a single lift). Provenance `seeded`; only parents + genes ship (a few KB), instances regenerate.
- **Colour and brightness from the tissue**: each sample takes the albedo of the nearest measured sample (as the brushes
  do) and a **per-texel modulation along and across the tube** — the strand shader writes one brightness per strand
  today, and study/08 §7 showed a flat-brightness curve is no better than LIC. The one shader change the deck needs.

**Built (2026-09-26) — `IrisTissue.buildFields()` / `fieldAt(layer, u, v)` / `fieldsCheck()` / `fieldsImage(layer)` in `tissue.js`.**
Per cell of 0.1 mm over the region (≈ 240 × 37 on a whole iris): the structure tensor of the tangents (doubled angles,
weighted by segment length — a tangent and its reverse agree) and the median across-flow distance from a sample to the
nearest PARALLEL sample of another curve in another lane (a crossing fibre is not a neighbour, nor a same-lane fragment
split at a junction: |cos| ≥ 0.7, across ≥ 15 µm, beside rather than ahead). Flow from every curve of the layer, spacing
only from its bundle-scale curves (the sheet's fine fibres lie between the guides and would halve their spacing). Empty
cells relax from their neighbours (u wraps on a whole iris) with conf 0; a layer with no samples takes the prior. The
sampler is bilinear on the doubled-angle vectors and on log spacing. Built lazily, ≈ 0.2 s; not part of the arrival.

| eye | deck: samples · cells filled · flow agreement median / p90 · spacing median (p10–p90) | sheet: the same |
|---|---|---|
| 26 | 7 894 · 1 248 / 8 604 · 9.8° / 39.6° · 0.048 mm (0.024–0.076) | 30 492 · 5 512 · 6.3° / 24.4° · 0.071 mm (0.043–0.102) |
| 09 | 12 350 · 2 164 · 11.8° / 46.6° · 0.049 (0.024–0.075) | 31 273 · 5 435 · 6.0° / 22.6° · 0.072 (0.043–0.102) |
| 25 | 6 538 · 956 · 18.2° / 59.5° · 0.041 (0.022–0.076) | 32 297 · 6 111 · 8.3° / 29.2° · 0.073 (0.044–0.101) |
| 35 | 1 279 · 350 · 9.1° / 34.3° · 0.046 (0.019–0.076) | 27 087 · 5 571 · 5.0° / 18.2° · 0.078 (0.043–0.108) |

Readings. The deck's spacing (≈ 0.045 mm) sits under the 65 µm autocorrelation peak measured on eye 26's photo and well
under S0's child spacing (0.09–0.12 mm at ± 30 %): the tracer packs fragments in adjacent lanes tighter than the visible
strands — the grower's `sep` multiplier (1.6 by default) is where that is corrected, and the field is what the tracer saw.
The deck's p90 agreement (35–60°) is the weave: crossing fibres in one 0.1 mm cell average to one direction; eye 25's
crypts cross most. The sheet's guides at 0.07 mm are the tracer's guide scale (σ 19–42 µm), finer than S0's bundle
population (0.2 mm). Review: `study/proof-layers/fields-26-deck.png` / `-sheet.png` (a stroke per cell along the flow,
colour = spacing, dim = filled). Gates: `reach()` `[]`; the bench and the arrival untouched (nothing runs unless asked).

**Built (2026-09-26) — parents and their instances, `tissue.js`.** `T.parents`; ops `addParent · setParams · moveParentPoint ·
insertParentPoint · removeParentPoint · deleteParent · actualize`, each with its undo, in the journal like every other op;
`T.growParentFrom(u, v, lengthMm, layer, params)` grows a parent along the field of §5.2.2 (control points every 0.3 mm);
`T.parentsFromRoots()` turns every root of the loaded eye into a parent (spline through its chained fragments, the fragments
tagged as its measured instances) whose instances are the **bridges** across its joins — a cubic from fragment end to
fragment end along their tangents, width, height and colour interpolated. A laid parent's instances: `count` curves
along the spline, the first on it, the rest spread across `spreadMm`, each with its own gentle wave (S0's 5 % of 0.3 mm),
width from `widthMm` or the nearest measured fibre, colour from the nearest measured sample with a seeded ± 15 %
modulation along the tube, deck height `floatMm` less a sag of `sagMm` mid-span, and a taper over the last `taperMm`
(thinner, and diving to rest on the floor). Actualize freezes each instance into a parent of its own that shows the
instance's exact samples until one of its points is edited, then re-flows from its control points (every 60 µm).

Eye 26, measured on the arrival path (deterministic): roots → 53 parents, 58 bridges in 0.4 s (MATCH2 85.02 → 85.02,
−0.006); a bundle of 6 grown from a fibre's sample (261 samples, z 17–74 µm with the taper); **undo and redo
pixel-identical (max 0 / 255)**; **actualize pixel-identical**, an edit of one child's point moves 21 pixels by ≤ 4 / 255,
its undo identical; **journal round trip**: 55 ops, 14 KB, replayed onto a fresh arrival load → the same 60 parents and
1 027 fibres, the render within 1 / 255 (no pixel over 2). Images: `study/proof-layers/parents-26.png` (the engine at
zoom, before / after — soft, and the crypt floor is dark: the bridges barely read from above) and `parents-26-probe.png`
(the probe at the bundle: on ONE heightfield a floating strand is a wall with a trench beside it — exactly why §5.2.3's
bridge layer comes next). Not yet: the per-texel brightness term in the shader (next, measured on its own); the grower's
neighbourhood fill through `IrisStrands.grow` over the field (the laid bundle is G1b's `Grow strands`; the streamline fill
is G3's). Gates: `reach()` / `compare()` unaffected (no engine API, no DOM); the bench untouched.

**The per-texel term (2026-09-26) — `u_fibNoise` in the compose pass, `IrisTissue.fibNoise`, default 0.** Seeded value noise
in each tube's own frame (across = the gradient of the distance field, so the grain stretches along the tube: 60 × 14 µm),
inside the footprint only, fading over the last 40 % of the radius. At 0 the picture is exactly as before (85.022 / 0.379 /
2.47 on the measured load, the same to the last digit). **The whole-eye scores cannot see it at any amplitude** (0.08–0.35:
MATCH2 ± 0.002, strandCorr 0.379 throughout) — they are taken on the 640 px fit render at 28 µm per pixel, where a 14 µm
grain averages away; the instrument for this term is the zoomed view or a band correlation at the photograph's own
resolution (study/08 §7's `bandCorrOf` at CAPTURE — not wired to the engine's render yet). At zoom
(`study/proof-layers/fibnoise-26.png`, a 0.7 mm window, 0 against 0.25) the term is a faint mottle (mean 0.6 / 255): the
deck's look there is set by the tube geometry — 78 µm slabs wider than their 65 µm lanes, overlapping, the payload smooth —
so the visible levers at zoom are the tube width calibration (§5.2.1's note) and the bridge layer, not this term. It stays
in, off by default; iori chooses the amplitude on a review sheet when the render step makes the deck legible at zoom.

#### 5.2.3 Floating in the render — two or three layers

Without a second layer a floating strand is a taller lump on one heightfield and the probe shows a wall under it.
The compose pass writes, beside the ground, a **bridge slab** per layer: (top z, bottom z, coverage, albedo) of the
topmost strands there; the photo shader's view ray and shadow ray test the slabs before the ground, so a bridge shows
the floor beneath it and drops its own shadow. Layer count from the quality table (2 at NORMAL, 3 at FINE+); each
layer costs one slab test per march step. Bench untouched (the layer model is off in the bench).

**Built (2026-09-27) — the bridge layer, `tissue.js`.** A fibre whose bottom clears the floor by more than `T.slabClearMm`
(20 µm) FLOATS: the bake draws it in its own curve pass instead of the ground's, and the compose writes a **slab** beside the
ground — top and bottom height in the ground's units, coverage, and the slab's own albedo (two more outputs; `fill` and the
rim strength moved into the pack texture to stay at the sampler limit). The photo variant's view ray tests the slab before
the ground at every march step (crossing its top from above is the hit, so a slab thinner than a step is not skipped), then
bisects onto the slab's top, shades with the slab's albedo and the top's normal; the shadow ray marks any slab between the
point and the light. The probe does the same, so a fly-over shows the floor beneath a bridge and the bridge's shadow.
Generated instances float by their height; the weave's own lifted fibres only when `T.slabMeasured` is set (off until the
picture is judged). DRAFT has no slab (its floating strands fall back into the ground); one slab from NORMAL up — the count
is a quality parameter in name only so far (`T.slabs()`), the second slab is not built. The floor's depth (`deckThickness`)
now reads measured fibres only, so a high instance cannot push the floor down. The T2a window has no slab of its own yet.

Eye 26, measured on the Load button's path: with no floating strand the picture is **identical to before** (85.022 / 0.379 /
2.47, to the last digit — the pack refactor is inert). With the roots' bridges and a laid bundle of six (50 µm tubes, 240 µm
above the floor, 20 µm sag): 51 curves float; MATCH2 84.93 → 84.92 with the slab against the same curves in the ground,
strandCorr 0.378 → 0.375 — the photo has no bridge there, so no photo score can reward one. Frame time at NORMAL,
1151 × 1148: 9.1 ms with the slab, 9.8 ms without (noise; the legacy model 4.3 ms). Images: `study/proof-layers/slab-26-probe.png`
(the probe beside the bundle and from above, one heightfield against the bridge layer: a solid block becomes a span with
the cavity and the floor beneath it, and from above the tubes float with their shadows) and `slab-26-zoom.png` (the front
view through the photo shader: separate tubes crossing the crypt over their own shadows, where one heightfield gave a black
block). Honest: a bundle at 120 µm sat INSIDE the measured relief (the weave's lifts reach 278 µm here) and showed nothing,
which is what a 240 µm float was needed to prove; the first bundle, with its width from the nearest measured fibre, had a
61 µm radius at 60 µm height and never floated at all — the tube width calibration again. The bridges are not part of the
arrival yet: that is a publish decision (their measurements would be re-exported) once iori has judged the look.

**The tube width calibration (iori, 2026-09-27: "I agree with your order" — width first, then the separator rule, then K2).**
The tracer's `w` is twice the ridge scale σ; the tube radius was 1.4 w, so a tube's diameter was 5.6 σ where a Gaussian
ridge's full width at half maximum is 2.35 σ = 1.18 w: a 78 µm tube on eye 26's 65 µm lanes (S0: width ≈ half the spacing).
Swept in the page on eye 26 with the light and shading re-measured at each value (the button's path):

| radius / w | MATCH2 | strandCorr | cellΔab | deck thickness |
|---|---|---|---|---|
| 1.4 (was) | 85.30 | 0.381 | 2.50 | 278 µm |
| 0.9 | 85.18 | 0.394 | 2.55 | 179 |
| 0.7 | 84.85 | 0.398 | 2.58 | 139 |
| **0.6** | 84.60 | **0.399** | 2.59 | 119 |

`FIB_R_K = 0.6` in the fitter (the physically derived value: r = 0.6 w is the ridge's half width at half maximum), `RK_DEFAULT`
= 0.6 as the engine's fallback (every shipped eye carries its own `z.rK`). Re-fitted, eye 26's weave has 780 crossings
instead of 2 245 (thinner tubes touch less), lift mean 9 µm instead of 66, order right at 94 %; the fibres' geometry and the
roots are unchanged. Engine review, same page and path: **MATCH2 85.26 → 84.77, strandCorr 0.388 → 0.410, cellΔab 2.43 →
2.52**; published with re-exported measurements (measured load on the pinned case 84.07 / 0.408 / 2.58, arrival within
1 / 255). The look (`study/proof-layers/rk-26.png`): the crypt reads as separate strands over a floor instead of
interlocking blocks. Under gate F5 (no cap on the photo score, strandCorr up, cellΔab ≤ 2.75) it passes; iori's eye decides.

The other three eyes, re-fitted and republished the same way (engine review, previous export → new, same page and path;
measured load on the pinned case; arrival within 1 / 255 of it on every eye):

| eye | MATCH2 | strandCorr | cellΔab | crossings in the weave | measured load (pinned case) |
|---|---|---|---|---|---|
| 09 | 81.56 → **84.20** | 0.426 → **0.487** | 2.87 → 2.86 | 1 557 | 84.06 · 0.473 · 2.88 |
| 25 | 87.82 → **88.65** | 0.354 → **0.383** | 2.47 → 2.48 | 1 114 | 89.37 · 0.382 · 2.42 |
| 35 | 83.97 → 83.96 | 0.374 → **0.385** | 2.34 → 2.35 | 143 | 82.08 · 0.373 · 2.39 |
| 26 | 85.26 → 84.77 | 0.388 → **0.410** | 2.43 → 2.52 | 780 | 84.07 · 0.408 · 2.58 |

So the thinner tube is a gain on the photo score too on three of the four eyes — 09 by 2.6 points — and eye 26, the one the
sweep was tuned on, is the only one that pays. The weave decides its crossings at 92–94 % now (86 % before): tubes that
touch less leave fewer ambiguous crossings. Not pushed, not deployed.

#### 5.2.4 Build order and gates

1. **Roots** in the fitter, exported, reviewed (§5.2.1) — eye 26 first, then the other three.
2. **Flow and spacing fields** of a layer eye (JS).
3. **Parents with grown instances**, the float / sag / taper params, the per-texel brightness term.
4. **Bridge layers** (2, then 3 at FINE+), shadows.
5. **Measure**: whole iris at NORMAL with the generated deck on / off — MATCH2 (reported), cellΔab (≤ 2.75), strandCorr and
   B3 (must rise); the probe fly-over of a crypt with a bridge and its shadow (T3's own acceptance); a review sheet for
   iori. Contract `compare()` / `reach()` `[]`, the bench unchanged.
6. G1b steps 2–3 on top (Select, Grow strands = this grower on a selected parent, Actualize).
7. The sheet's bundles with the same grower (F3), then **G3** = the same grower over the whole iris, placement off.

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
