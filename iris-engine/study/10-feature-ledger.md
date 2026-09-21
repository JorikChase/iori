# 10 — Feature ledger: everything the engine can do, and where a hand reaches it

Status: **living document, opened 2026-09-21 at engine 0.9.4-edge (v91-edge).** One session works on the iris
engine from here (iori, 2026-09-21), the default shell flips to Windows 3.11 (`ui31.js`), and `ui.js` (Win98) is
frozen as a one-version fallback. iori will not audit parity by hand — "I will only notice something missing if it
looks bad when testing" — so **this table and the reachability test (§9) are the safety net.** A feature that is
not in this ledger does not exist as far as the UI is concerned; a control that is in the page and not in
`tools/ui-contract/controls.json` fails the contract.

Rules:

1. Every row has a **home** in the 3.11 shell (a window, a menu path, a key, a gesture) or an explicit verdict
   `console` (deliberately API-only) or `drop`.
2. A new engine feature lands with its ledger row and its `controls.json` entry in the same commit.
3. Status words: **ok** · **LOST** (was reachable once, is not now) · **CONSOLE** (engine has it, no hand can reach
   it, and it should) · **WRONG** (reachable, behaves against a decision) · **changed** (deliberately different from
   Win98) · **todo** (planned, never built) · **drop**.

Audit method for this first pass: code reading of `index.html`, `fit.js`, `design.js`, `tissue.js`, `ui.js`,
`ui31.js`, `overlay.js`, `gaze.js` at git ab680bf. The reachability test of §9 replaces reading with measuring.

## 1. Scene — what the pointer does on the eye

| Feature | Mechanism | Win98 | 3.11 | Status / action |
|---|---|---|---|---|
| Eye looks toward the cursor | `window` pointermove → `target.mouseX/Y` | ok | ok, scene only (gaze.js TRACK/HOLD/RETURN/REST) | ok |
| Press constricts the pupil | `isPointerDown` | ok | ok, scene only | ok |
| Wheel = camera distance 20–400 | `target.zoomPhoto` | ok | ok, scene only | ok |
| Pinch zoom on touch (free camera) | — | — | — | **todo**: only the overlay and DESIGN handle two pointers; the free camera has no pinch |
| Controls never move the eye | gaze.js guards | ok (gaze.js loads there too) | ok | ok |
| Accumulation progress bar | `#accum-bar` | ok | ok (moved to body) | ok |
| Closer zoom + more tilt when close, orbit about the point under the cursor | spec §31 T2 | — | — | **todo** (engine: T2b) |

## 2. Camera / light / post — window **Camera**

| Control | id | Win98 | 3.11 | Status |
|---|---|---|---|---|
| PUPIL, ELEV, LIGHT, SRC SIZE, AMBIENT, LID, EV, F-STOP, FOCUS, KELVIN, GRAIN, BLOOM | `param-*` | ok | ok | ok |
| Source shape SUN / SOFT / RING / TWIN | `.src-btn` | ok | ok | ok |
| GRID | `debug-btn` | ok | ok + View menu | ok |
| REFRACT | `refr-btn` | ok | ok + View menu | ok |
| CORNEA REFL | `spec-btn` | ok (fixed 2026-09-21) | ok: Camera window + View ▸ Corneal reflection (fixed 2026-09-21) | was **LOST** in both shells for a day: added 2026-09-20 into `#ui-panel`, which both hide. `reach()` found it on its first run |
| HIPPUS | `anim2-btn` | ok | ok + View menu | ok |
| FILMIC | `tone-btn` | ok | ok + View menu | ok |
| REF pose | `ref-btn` | ok | ok + View menu | ok |
| CAM FREE / FIXED | `cam-btn` | top bar | View ▸ Camera follows the pointer | changed |
| Quality draft…capture | `quality-sel` | top bar | View ▸ Quality | changed |
| Debug views 2–4, 7–15 (alignment mask 13, coordinate map 14, height 15 …) | `state.debug = n` | console | console | **CONSOLE** → **P4**: View ▸ Debug view ▸ (named list) |

## 3. Material · Relief · Flow — the knobs

| Control | id | Win98 | 3.11 | Status |
|---|---|---|---|---|
| PIGMENT, STROMA, PHEO, YELLOW, MIE, RING | `param-*` | ok | ok | ok |
| CRYPT, FURROW, RELIEF, COLLAR | `param-*` | ok | ok | ok — but **dead under the layer model** until G2/G3 (k0-knob-liveness.md); the window must say so while `IrisTissue.on` → **P6** |
| WARP, SEED, NEW SEED | `param-warp`, `param-seed`, `seed-btn` | ok | ok (+ Eye ▸ New seed) | ok; `seed` dead under the layer model until G3 |
| FIELD, LIC / CURVES | `fieldw-btn`, `strand-btn` | ok | ok | ok |
| ATLAS, MAPS | `atlas-btn`, `maps-btn` | ok | ok + View menu | ok |
| FIT·COL / FIT·REL / FIT·FLOW blends | `param-blcol/blrel/blflow` | Fit window | Fit window ▸ Fitted ↔ procedural | ok |
| **Knob origin** — a slider's tick, blue fill and double-click sit at the *fit*, not at the page default (iori, §32 K1) | scrubber `def` | **WRONG** | **WRONG** | `def` is captured once at build time → **P2**: scrubbers re-read their origin on `loadFittedPreset`, `importID`, end of a fit, `IrisTissue.setOrigin` |

## 4. Eye — presets, IDs, capture

| Feature | Mechanism | Win98 | 3.11 | Status |
|---|---|---|---|---|
| Fitted presets 09 / 25 / 26 / 35 | `E.loadFittedPreset` | Presets ▾ | Eye ▸ Presets | ok |
| Ten procedural presets | `loadEyePreset(k)` | console only | Eye ▸ Procedural | ok (gained) |
| Fitted cases ranked from cases.json | fetch | Fitted ▾ with `h` (hcorr) | Eye ▸ Fitted with MATCH, M2 and `h` (fixed 2026-09-21) | ok |
| Save ID (file + clipboard + URL hash) | `idout-btn` → `exportID` | ok | File ▸ Save ID | ok |
| Open ID file | `idin-btn` | ok | File ▸ Open ID… | ok |
| ID / seed / preset from the URL hash | `#id=`, `#seed=&preset=` | ok | ok (engine) | ok |
| Capture 4K (tiled) | `shot-btn` | ok | File ▸ Capture 4K | ok |
| Link to META IRIS | header link | ok | File ▸ META IRIS | ok |
| Site menu | `#site-menu` burger | burger bottom-left | the frame's control-menu box | changed (iori, 2026-09-19) |
| Group window of eye thumbnails | study/09 §11 | — | — | open idea, not planned |

## 5. Fit — window **Fit** and the overlay

| Feature | id / API | Win98 | 3.11 | Status |
|---|---|---|---|---|
| Photo…, reference select, Close photo | `fit-load`, `fit-ref`, `fit-close` | ok | ok + Fit menu | ok |
| ★ Fit HQ, Solve pose, Fit global, Detect, Refine relief, Stop | `fit-hq`, `fit-solve`, `fit-global`, `fit-detect`, `fit-refine`, `fit-stop` | ok | ok | ok |
| Auto align, Save align, Align ↓ | `fit-auto`, `fit-save`, `fit-alignout` | ok | ok | ok |
| Bench ISO, Bench all, Bulk…, Study, Cases ↓ | `fit-benchiso`, `fit-bench`, `fit-files`, `fit-study`, `fit-cases` | ok | ok | ok |
| DIAG | `fit-diag` | **LOST** (dressFit drops it) | ok | ok in the default shell after the flip |
| Score line, log | `fit-score`, `fit-log` | ok | ok | ok |
| PHOTO / RENDER / DIFF / SPLIT | `fit-view` on the 2-D canvas | ok | drives the overlay on the iris (SPLIT = wipe) | changed (study/09 §7.5) |
| POLAR, HEIGHT strip views | `fit-view` modes 4, 5 on `fitcv` | ok | ok, canvas inside the Fit window | ok; GL strips = U4, todo |
| Overlay photo / render / diff / wipe / onion / blink, zoom + pan, reset | overlay.js | — | ok | ok (gained) |
| Marker drag (pupil, limbus, catchlight) | `fitcv` pointer / overlay handles | ok on the canvas | handles on the iris, re-solve on release | changed |
| Marker resize by **wheel** over a ring | `fitcv` wheel | ok | only while POLAR/HEIGHT shows the canvas; on the iris the wheel zooms | changed — radius handles replace it; study/09 §6 "pinch on a ring" never built → **todo**, low |
| The scored render shown while a fit runs | overlay `#w31-ov-render` | panel canvas | ok | ok |
| Casebook (grid, stats, open a case) | `fit-casebook` → `#casebook`, `cb-*` | ok, old chrome | ok, **old chrome** | **P5**: 3.11 frame for the casebook |
| Hourglass / busy state during fits | — | — | — | **P5** todo |
| Audits and oracles (`scaleAudit`, `traceBands`, `bandOracle`, `oracleBench`, `guideCeilingBench`, `reliefTransferBench`, `dumpForGuideTrace`, `bakePresets` …) | `E.fit.*` | console | console | **console** by verdict: research instruments, not features |
| Knob liveness harness | `tools/knob_probe.js` | console | console | **console** by verdict |

## 6. Design — window **Design** (legacy model, D0–D2)

| Feature | id / key | Win98 | 3.11 | Status |
|---|---|---|---|---|
| DESIGN on/off (fixed frontal camera) | `design-toggle`, `D` | ok | ok | ok |
| Tools paint / add / sub / smooth / smear / dent / bump / streak / color / pick | `.tool-btn`, keys `b a x s m n u k c i`, Alt = pick | ok | ok (Paintbrush toolbox) | ok |
| LAYER (16 fields), SIZE, WEIGHT, HARD, VALUE, REPEAT, FLOW, COLOUR + reachable swatch | `design-*` | ok | ok | ok |
| Undo (40 levels), Clear | `design-undo` / Ctrl-Z, `design-clear` | ok | ok | ok |
| Zoom (wheel), pan (Space-drag), reset (Esc), size `[` `]` | window listeners | ok | ok | ok |
| Brush cursor, HUD readout | `#brush-cursor`, `#design-hud` | ok | ok | ok |
| **Which of these still change the picture when `IrisTissue.on`** | — | ? | ? | **UNMEASURED** → **P6**: a brush-liveness run in the manner of `knob_probe.js`; the toolbox then switches tool sets with the model |
| Photo overlay + clone source (D3), alignment controls (D4), object handles (D5) | spec §20 | — | — | todo, superseded in part by the overlay and by G |

## 7. The tissue layer model — **no UI at all today**

Everything below is console-only and is the engine's main line since 2026-09-20. Home: a new **Tissue** window
(`tissue-ui.js`) and, for the brushes, the Design toolbox. **Only ref 26 has a layer-model export**
(`study/proof-layers/tissue-26-whole.json`, 4.6 MB, gitignored, ≈ 11 min to regenerate, ≈ 14 s to load): the window
says so in words, and its Load control names the eye it loads — no pretence that it works on any iris before T7.

| Feature | API | Status | Home |
|---|---|---|---|
| Load + calibrate + bake + origin + de-light, with progress | `IrisTissue.proof(url, opts)` | CONSOLE | Tissue ▸ Load layer model (ref 26) — staged progress in the status bar |
| Model on / off | `IrisTissue.on` | CONSOLE | Tissue ▸ checkbox; View ▸ Layer model |
| Dials with their ablation defaults: `k1`, `deckZ` 1, `delight` 1, `wallZ` 2.5×, `sheetZ` 0.5, `srelAmt` 0.5, `margin`, `marginKeep` 3, `marginRound` 0.25, `margFade` 0.04 | properties; several need a full `load` + `calibrate` per change (handoff §4) | CONSOLE | Tissue ▸ Dials; the ones that reach the coordinate system re-load on release, not on drag, and say so |
| Probe camera (clay / elevation / albedo / height, contours) | `IrisTissue.probe(opts)` → ImageData | CONSOLE | Tissue ▸ Inspect: probe view, placed by clicking the iris; height, yaw, pitch scrubbers |
| Elevation under the cursor, tubes under the point | `elevationAt`, `tubesAt` | CONSOLE | Tissue ▸ Inspect readout + status bar |
| Section cut (sees tubes under tubes) | `section(p0, p1, n)` | CONSOLE | Tissue ▸ Inspect: drag a line on the iris → drawn section |
| Height field / contours | `heightField({rect})` | CONSOLE | Inspect ▸ contours toggle (later) |
| Windowed re-bake at the view's τ | `bakeWindow`, `viewRect`, `refocus`, `clearWindow` | CONSOLE | automatic on zoom settle; no control (content-limited today, §32) |
| Strand brush | `IrisTissue.brush.strands(path, opts)` | CONSOLE | Design toolbox, tissue tool set (G0 → UI) |
| Journal: apply / undo / commit, provenance | `T.apply`, `T.undo`, `T.commit`, `T.ops` | CONSOLE | Design ▸ Undo / Ctrl-Z routed to `T.undo` when the tissue tool set is active; journal list later |
| Guide brush | — | not built (G1) | Design toolbox |
| Journal to JSON and back | — | not built (G4) | File ▸ Save ID carries `genome.tissue`; until then **painted work dies on reload** — stated in the HUD |
| Crypt / furrow / spot brushes | — | not built (G2) | Design toolbox; revives `furrow` |
| Generator from the knobs | — | not built (G3) | revives `seed`, `crypt`, `furrow`, `collr` under the model |

## 8. Shell

| Feature | Win98 | 3.11 | Status |
|---|---|---|---|
| Windows: drag, front, remembered layout | ok (`irisW98`) | ok (`irisW31`), snap, tile, cascade, bounds | ok |
| Roll-up (`_`) | ok | minimise to the shortcut row | changed |
| Phone layout | broken (569 px bar in 375 px) | bottom sheet + icon strip | ok (gained) |
| Status: quality · fps · atlas | ok | ok, + flash messages | ok |
| Control Panel: font, touch sizing, snap, gaze times, shell switch | — | ok | ok (gained) |
| About box | — | ok | ok |
| Keyboard: Alt-menus, F6 next window, arrows on a focused scrubber, Esc closes menus | — | — | **P5** todo |
| Self-hosted Urbanist (today: Google Fonts on every page view) | — | — | **P5** todo — needs iori's OK to download the woff2 |
| Real-device pass (phone, tablet) | — | — | **P5** todo |
| Placeholders `fit-blank1`, `fit-blank2` | left in the hidden panel (design.js removes them only in its own tab layout) | removed by ui31.js (2026-09-21) | **drop** from index.html at the flip |
| Tab layout of the bare page (`layoutTabs`, `irisTab`) | dead under a shell | dead under a shell | keep: it is the no-shell fallback |

## 9. The reachability test (contract, step 2 of this ledger)

`tools/ui-contract/controls.json` is this ledger's machine twin: `{ id: home }` for every interactive element,
`home` ∈ `window:<key>` · `menu:<path>` · `lazy` (created on demand: `casebook`, `cb-*`, `brush-cursor`) ·
`internal` (hidden on purpose: the range inputs under the scrubbers, `fitcv` while the overlay shows the photo).
`__uiContract.reach()`:

1. opens every shell window, then for every `window:` id requires a non-empty client rect inside that window;
2. for every `menu:` id walks the menu path and requires the item;
3. **the inverse**: every `button, select, input, a[href]` in the document that carries an id or sits in
   `#ui-panel` must appear in `controls.json` — an unledgered control fails. This is the check that would have
   caught `spec-btn` on the day it was added.

`compare()` = `[]` and `reach()` = `[]` are both required before the default flips, and after every UI change.
The fit baseline (`baseline.json`, git 9f6320e, MATCH2 68.0 at 20 iterations) predates K1, the aperture and the
cornea default: **re-baseline at v91 under the Win98 shell first**, then compare 3.11 against it.

### 9.1 First measured run (2026-09-21)

- `reach()` on the 3.11 shell, first run: `spec-btn` not visible in its window; `fit-blank1`, `fit-blank2` left inside
  the hidden `#ui-panel`. After P1 and the placeholder removal: **`[]` at 1280 × 800 and at 375 × 812 (phone sheet).**
  The menus reach 22 control ids (`__irisUI.menuIds()`; items built with `click(id)` carry the id, others name it
  in `ctl`).
- `compare()` against the 2026-09-19 baseline: 130 differences, all engine-side (coverage 0.899 → 0.962 from K1's
  aperture, MATCH2 68.0 → 69.1, ridges 5 → 3 …) — the baseline was stale, not the shell. **New baseline recorded
  under the Win98 shell at v91-edge** (ref 26, NORMAL, 20 iterations, nothing saved by the fit): MATCH2 69.1,
  MATCH 68.0, SSIM 0.738, height r 0.774.
- The same run under `?ui=31`: **one difference — `fit-diag` is no longer missing** (the Win98 shell drops it; a gain).
  Identical fit through the panel, bench row, render hash, fingerprint and ID. At the flip the baseline is
  re-recorded under 3.11 so that `compare()` = `[]` exactly.

## 10. Parity work before the flip, in order

| # | Item | Size |
|---|---|---|
| **P0** | `controls.json` + `reach()` — **done 2026-09-21**: first run found `spec-btn`, `fit-blank1/2`; after the fixes `reach()` = `[]` at 1280 × 800 and on a 375 × 812 phone. Re-baseline of `compare()` at v91 — see §9.1 | small |
| **P1** | CORNEA REFL into the Camera window and the View menu — **done 2026-09-21** (also one word in the frozen `ui.js`) | trivial |
| **P2** | Scrubber origin follows the fit (tick, fill, double-click) | small |
| **P3** | hcorr + MATCH2 in Eye ▸ Fitted — **done 2026-09-21** | trivial |
| **P4** | View ▸ Debug view ▸ named list | small |
| **P5** | U5: keyboard, hourglass, casebook frame, self-hosted font (after iori's OK), device pass | medium |
| **P6** | Brush + knob liveness under the layer model, and the windows saying what is dead | small, measured |
| **FLIP** | default = 3.11, `?ui=98` remains one version, drop `fit-blank*`; acceptance = `compare()` [] · `reach()` [] · isolated bench 61.6 / 68.3 / 70.5 / 66.4 | — |

Then: **Tissue window** (§7, rows 1–6) → **G1** guide brush → **G4** journal serialisation → **G2** crypt /
furrow / spot → **G3** generator → T6. Each G tool lands in the Design toolbox, with its ledger row, in the commit
that builds it.
