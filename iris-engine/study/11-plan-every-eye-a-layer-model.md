# 11 — The plan: every eye a layer model (agreed with iori, 2026-09-21)

Follows `handoffs/2026-09-21-ui-tissue-start-eye.md` §5 and `study/10-feature-ledger.md` §11. One session, the same
gates as before: isolated integrity bench **61.6 / 68.3 / 70.5 / 66.4** with the layer model off, contract `compare()` =
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
