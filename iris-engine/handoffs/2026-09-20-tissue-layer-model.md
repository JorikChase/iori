# Handoff — the tissue layer model (2026-09-20, engine 0.8-tissue, version v85-tissue-p2)

For a new worker taking over the iris engine's main line. Read this, then `study/00-summary-and-spec.md` **§28, §30,
§30.1, §30.2, §31** (the audit, the model, the engine port, the whole iris, the task list), then `HANDOFF.md` for the
older tracks and the gotcha list. Everything below was built and measured on 2026-09-19/20.

## 1. Where the project stands, in one paragraph

The legacy engine (LIC strands + splat openings + per-cell materials, fitted by `fit.js`) reached MATCH2 ≈ 67 on the
four isolated macros and could not get further: colour error had grown to Δab ≈ 12–14 (crypt floors came out violet —
the photos contain no blue), strands were unplaced and *deleted* inside openings, and the ID had no parameter for "this
fibre, here". A new **tissue layer model** replaces that picture: **cornea · border-layer SHEET with holes and rim
pigment · DECK of explicit fibre curves with veins between them · dark ground**, every visible thing owned by exactly
one layer, every colour through the spectral LUT. Proven offline on a window (P0), ported into the engine as a
separately compiled variant (P1), then run on the whole of ref 26 (P2): **MATCH2 67.5 → 78.4, MATCH 72.1 → 87.2,
profile Δab 11.7 → 2.0, cell Δab 14.4 → 2.75, strandCorr 0.25 → 0.55.** The primitives are still *extracted offline
from the photo* by a Python script; making the engine find them itself, visibly, is the main task ahead (T6).

## 2. What exists

| piece | file | notes |
|---|---|---|
| extraction + offline mock | `tools/layer_proof.py` | `/usr/bin/python3` (needs cv2 + scipy). No args: the 3 mm proof window of ref 26 (≈ 2 min) → `study/proof-layers/proof-26*.jpg/json`. `--whole`: the whole iris (≈ 11 min, run in the background and poll the log). `--export`: also writes `tissue-26.json` / `tissue-26-whole.json` for the engine (whole = 4.6 MB, gitignored, regenerable). Ref-26 constants (`PUP`, `LIMB`, `PPM_FIT`) are hard-coded — generalising them is part of T7. |
| engine variant | `tissue.js` (`window.IrisTissue`) | GPU nearest-curve rasterisation (quads round segments, `gl_FragDepth` = distance → Voronoi of curves with interpolated payload), winding fill for inside/outside, compose pass → region albedo + relief, `fs-photo` variant built by **string replacement on the untouched shader source** (anchors are checked: a changed anchor throws), photo colour → albedo by inverting the post pass and measuring the light `X = k·A + s` with two flat-grey renders. **Off unless `IrisTissue.on`.** |
| engine hooks | `index.html` | two JS lines in `drawPhotoFrame` (program choice; `IrisTissue.bind(prog)` before the draw) + `<script src="tissue.js">`. No shader text changed. |
| colour metrics | `fit.js` `diagnostics()` | `cellDab`, `cellDabP90`, `cellDL`, `bandDab[6]` (fixed 128 × 32 tissue grid) in every bench row, `versions/snapshot.py`, `versions/compare.py`. **Gate: a version may not worsen mean cellDab.** |
| aperture | `index.html` `u_limb`, `state.limb`, ID `view.limb`; `fit.js` `solvePose`, `fit.aperture` | the iris cutout is a per-eye pose parameter; isolated photos set it from their own outline (v84). |
| evidence | `study/audit-28-colour/`, `study/proof-layers/` | pair / crop / polar images, `gamut.py`, P0–P2 images and metrics. |

## 3. Run it

```bash
python3 iris-engine/serve.py 8769          # or the launch config "iris-engine-b"; open http://localhost:8769/iris-engine/
/usr/bin/python3 iris-engine/tools/layer_proof.py --whole --export     # once, ≈ 11 min → study/proof-layers/tissue-26-whole.json
```
In the page console (CAPTURE quality; restore NORMAL afterwards, it persists in localStorage):
```js
const E = __irisEngine, F = E.fit, T = IrisTissue;
E.setQuality('capture');
const cases = await fetch('ref/cases.json').then(r => r.json()), file = Object.keys(cases).find(k => k.startsWith('26'));
await F.renderCaseThumb(file, cases[file], document.createElement('canvas'));   // loads the photo, restores the fitted pose
await T.proof('study/proof-layers/tissue-26-whole.json');                        // load → calibrate light → bake → on   (≈ 9 s)
F.renderFit(); F.score(); F.diagnostics();                                       // MATCH2 ≈ 78.4, cellDab ≈ 2.75
T.on = false;                                                                    // back to the legacy model
```
Getting images out of a hidden Browser pane: start a tiny POST-to-file server in the session scratchpad and have the
page `fetch(..., { method: 'POST', body: blob })`; wait on the files in bash (never poll page state with setTimeout
loops). Useful debug view: read back `T.albedo` / `T.fill` and upload as PNG — the baked tissue in polar form.

**Integrity rule:** with `IrisTissue.on === false` nothing may change. After touching `index.html`, `fit.js` or the
shaders run `F.benchIsolated({ iters: 120, save: false })` at NORMAL: it must give 61.6 / 68.3 / 70.5 / 66.4 (= v84,
66.70) with identical `cellDab`. Benches that *save* write to `ref/` and `versions/` — another session may share this
working tree (UI shell: `ui31.js`, `overlay.js`, `gaze.js`, `ui.css`; strand building: `strands.js`,
`tools/guide_*.py`); commit only your own files, hash `fit.js` / `index.html` before a bench and before a snapshot.

## 4. What was learned (do not rediscover)

- **The photos contain no blue.** Blue-grey in these eyes is the fibre deck seen through holes in a yellow sheet
  (b\* > 0 everywhere). A two-layer "thin stuff over black" shortcut turns every opening violet.
- **Holes are separated from shadows by chroma, not darkness**: hole = dark *and* grey relative to the local sheet
  (b\* < max(14, 0.42 · local envelope)); dark and saturated = pigment on the sheet, not a pit; rim strength relative to
  the sheet 0.14 mm further out. Fixed global thresholds fail on the amber side of an iris.
- **The deck is broad fibres packed side by side; the thin dark gaps — the veins — are the detail** (first attempt had
  it inverted: bright ribbons on a dark floor). Fibres are *found* on local contrast (per-crypt thresholds) and their
  payload is *read* from true luminance; they run on to the wall under the shadow (geometry inferred, payload measured).
- **Flat strands lose; payload wins**: brightness every 20 µm along each curve, colour at the body scale (σ 12–16 µm;
  finer is chroma noise); samples in deep shadow (L\* < 12–28) have no hue — give them the typical colour.
- **Tracing fine curves on the flat sheet fits sensor grain** (it flattered B3 to 0.62). Keep only long (≥ 0.12 mm),
  straight, radial curves; the rest is camera grain and belongs to the camera.
- **The camera grade is a flat valley** (gain trades with pigment): take the mildest grade within 10 % of the best.
- **Primitives must hold albedo, not photo colour.** The engine owns light and camera: invert the post pass (γ 2.2,
  ACES / aces(1), sat, EV) and measure the light through the renderer with *two* greys — the additive term is real.
  Relative payloads convert as albedo(base × ratio) / albedo(base); a ratio cannot be copied through a tone curve.
- **`lit += 0.05 · pow(N·h, 24)` is a constant ≈ 0.06 under a coaxial flash**: the engine cannot render darker than it
  and subtracting it per channel turns darks orange. In the tissue region it is multiplied by (1 − mask).
- **Relief under a coaxial ring flash is symmetric**: a 30 µm floor draws a dark ring round every hole; 10 µm reads
  right. One-sided wall shading in the photos cannot come from this light — it stays in the payloads.
- **Inside / outside needs a winding fill**, not the nearest segment's side (fails beyond the pass radius); unwrap u
  before computing an outline's orientation; islands are wound the other way.
- **Region texels square in tissue mm** (the atlas' are ≈ 8 × 4 µm out there; isotropic mips on them blur across the
  fibres). Softness of the v0.8 render is *not* the mip level (tested) — it is dropped sheet detail, by design.
- Measurement habits that paid: a shadow-lifted zoom exposed the inverted deck; a polar read-back of the baked albedo
  separated "engine bug" from "extraction quality" in one look; when a number improves suspiciously, ask what it fits.
- From `HANDOFF.md`, still binding: any code added to `fs-bake` shifts the bench (separately compiled variants only);
  shader-variant markers / anchors alone on their line; `resetForFreshFit()` deletes unknown `state` keys; never yield
  with `setTimeout` in long loops; MATCH / MATCH2 are not comparable across quality modes.

## 5. Tasks (spec §31 has the full text and acceptance tests)

| # | task | first step |
|---|---|---|
| **T1** | **Pupil margin built like the natural one**: margin curve r_m(θ) instead of a circle; ruff as ≈ 70 beads with relief; deck fibres terminate individually over the ruff; sheet ends earlier; driven by dilation | in `layer_proof.py` stop masking at 1.07 r_p — trace the pupillary zone to the ruff, fit the margin curve from the photo's pupil edge; in `tissue.js` add a bead set + margin-aware mask; retire `RUFF_W` / `u_ruffScallop` inside the tissue region |
| **T2** | **Much closer zoom, more rotation when close**: windowed re-bake at view τ; continuous zoom (camera → view crop) to 1–2 µm / px; tilt limit grows to ≈ 70° below 2 mm framing; orbit about the surface point under the cursor | `IrisTissue.bake` with `rect` = visible window on accumulation reset; then the clamps (`index.html` wheel 40–400, `design.js` s ≥ 0.125, `overlay.js` 3 px / photo px — the last belongs to the UI session) |
| **T3** | **Probe camera just above the surface** (inside the chamber, no corneal refraction inbound, wide field, grazing looks, own light); needs fibre / wall / bead relief in the aux channel and grazing-safe march | a `probe` branch in the camera block of `fs-photo` via the tissue variant's string replacement (camera code is at the "CAMERA: 100 mm lens" comment) |
| T4 | picture debts: floors +6.4 L\*, B2 0.71 < 0.79 (sheet brightness cells, multi-scale guides), amber-side fragmentation, aperture feather, grade into post | start with the tone-by-bin table in §30.2's open list |
| T5 | budget / ID v3: thin rims (41 k samples), palette, quantise, `genome.tissue` + provenance; ≤ 150 KB | |
| **T6** | **the journaled closed-loop fitter — the growing eye**: extraction as in-page ops rendered as they land, checkpoints, resume bit-identical, closed loop through the renderer, mildest-grade prior | port `layer_proof.py` stage by stage; each stage one op type |
| T7 | eyes 09, 25, 35 through the pipeline; sealed BENCH ISO with `tissueModel`; whole-eye photos only after | generalise `PUP` / `LIMB` / `PPM_FIT` (they come from `fit.dumpForGuideTrace`) |
| T8 | tools: vector handles, transplant / retarget / style fills, strand brushes = fitter ops, consent toggle, library | |
| T9 | enhancement (statistical, then learned proposer of curves) and mammals (§29) | |

**Done since (2026-09-20): K0 + K1.** `study/k0-knob-liveness.md` holds the knob-liveness table and the method;
spec §32.1 is the log. K0 measured the report (13 knobs killed by the layer model, 5 more already dead in the legacy
model, and the fit render is blind to the stochastic knobs — `u_ref = 1` gates DOF / bloom / grain, so the harness
also measures 32 accumulated frames). K1 (`tissue.js` only, ablation `IrisTissue.k1`) scales the measured albedo by
the ratio of the texel's material now to its material at the origin through the spectral LUT: **bit-identical at the
origin (0 of 295 680 px)**, 7 of the 13 live again, 4 flat because the model has no primitive for them (crypt,
furrow, blflow → G) and no relief to scale (relief → Z1: the whole height field is 10 µm hole floors).
Harness: `const K = await import('./tools/knob_probe.js'); await K.run({})` — 8 s, both models.

**Next stretch (spec §32, agreed 2026-09-20, supersedes the order below):** K0 knob-liveness test → K1 knobs as offsets from the
fit → K2 material payloads → Z1 height on every primitive, depth-peeled layer stack → Z2 inspection API (panel = UI
session) → T2a → Z3 layered march → T3 probe (**the depth test**) → T1 → T2b → G (paint / edit strands, one op
vocabulary with the fitter) → T6. Why: the tissue variant *replaces* colour and relief, so every procedural knob is dead
under it, and the height field is one number (holes −10 µm).

Order agreed with iori: T1–T3 are the new asks; T6 is the centre of the timeline; T7 gates any non-isolated photo.
iori's standing rules: diagnosis first, phased plans with real scoping questions, one change per version with an
ablation when it has two parts, seal every bench in `versions/`, write each checkpoint into the spec, **correct colour
is a big step — never trade it for structure**, fits may take tens of minutes if every pass is visible and resumable,
eyes are iori's and friends' (consent toggle on import; no legal discussion until it is buildable).

## 6. Version and backup

- Engine string `0.8-tissue`; sealed as `versions/v85-tissue-p2/` (sources incl. `tissue.js`, `strands.js`; the bench
  row is ref 26 through `IrisTissue.proof`, CAPTURE — *not* a fitted bench: the primitives come from the offline
  extraction). Legacy line: `v84-k1-aperture` (NORMAL 66.70) / `v84c` (CAPTURE 66.92); presets are still v83c.
- Git tag `iris-engine-v0.8-tissue`; full-folder archive (with the gitignored reference photos and the regenerable
  whole-iris JSON) beside the repo: `~/Desktop/code/iris-engine-backup-2026-09-20-v0.8-tissue.tar.gz`.
