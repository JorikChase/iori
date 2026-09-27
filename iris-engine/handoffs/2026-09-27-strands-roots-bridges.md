# Handoff — strands: roots, fields, parents, the bridge layer, the width calibration (2026-09-27)

For whoever takes the iris engine next. Read this, then **`study/11-plan-every-eye-a-layer-model.md` §5.2** — the strands
plan agreed with iori on 2026-09-25/26 with every step's findings written into it (§5.2.1 roots, the tracer, the separator
rule · §5.2.2 fields, parents, the per-texel term · §5.2.3 the bridge layer, the width calibration). The previous handoff,
`2026-09-22-every-eye-a-layer-model.md`, is the state this stretch started from.

## 1. Where the project stands, in one paragraph

The four layer-model eyes (09, 25, 26, 35) are re-fitted with a **fixed tracer** (29 % more deck fibres, no blind
extension) and **thin, physically sized tubes** (radius 0.6 × the traced width, where it was 1.4 — neighbouring tubes no
longer overlap), each with its shipped measurements re-exported; iori found them "much more visually correct". Every
shard is followed along its vector into **roots**; the engine has the **flow and spacing fields** of a layer eye, **parents**
whose instances regenerate from a spline (roots become parents with generated bridges across their joins, bundles grow
along the field, actualize freezes them for point editing), and a **bridge layer**: strands that clear the floor float in
a slab that the view ray, the shadow ray and the probe test before the ground. iori's **separator rule** finds the strands
that pass over others (about one deck fibre in ten); lifting them costs the photo's strand correlation on three eyes, so
the lift is opt-in and nothing of it ships. Everything since `ab7d32f` is **local — not pushed, not deployed**.

## 2. What exists that did not

| piece | where | what it is |
|---|---|---|
| roots | `tools/roots.py` `find_roots` · export `roots` | every fragment end followed along its tangent; joins (turn ≤ 30°, in lane < 30 µm, ridge evidence), branches / merges, every end classified wall · link · branch · merge · free |
| the tracer, fixed | `tools/layer_proof.py` `extend_to_walls(…, ridge=)`, `centrelines(…, pct=)` | the wall extension follows the ridge and stops on dead evidence (41 % of traced length had been straight marching); deck hysteresis 20 / 5 instead of 45 / 15 |
| `--dump-roots FILE` | `layer_proof.py` | pickles every input of the roots pass (fibres, ridge map, thresholds, directions, photo) — iterate in 25 s instead of a 6-min fit |
| fields of a layer eye | `tissue.js` `IrisTissue.buildFields / fieldAt / fieldsCheck / fieldsImage` | flow (structure tensor, doubled angles) and across-flow spacing per 0.1 mm cell, deck from fibres, sheet from guides; lazy, ≈ 0.2 s |
| parents | `tissue.js` `T.parents`, ops `addParent · setParams · move/insert/removeParentPoint · deleteParent · actualize` | instances regenerate from a spline (spread, wave, width, float, sag, taper); `T.growParentFrom`, `T.parentsFromRoots` (bridges across joins); in the journal, undo pixel-identical |
| per-texel term | compose `u_fibNoise`, `IrisTissue.fibNoise` (default 0) | strand-aligned grain inside each tube; inert at 0 to the last digit |
| the bridge layer | compose `o_slab / o_slabAlb`; photo variant `g_slab`, `slabAt`; probe `SL / inSlab` | floating strands as a slab: top, bottom, coverage, albedo; tested before the ground by view, shadow and probe rays; `T.slabs()` (1 from NORMAL, 0 at DRAFT), `T.slabClearMm` 0.02, `T.slabMeasured` false |
| width calibration | `FIB_R_K = 0.6` (fitter), `RK_DEFAULT = 0.6` (engine fallback) | tube diameter ≈ the ridge's full width at half maximum; every eye carries its own `z.rK` |
| separator rule | `roots.py` `find_underpasses`, `find_bridges`; `layer_proof.py --bridges` | underpasses (cut strands continuing under a fibre) and chain-level bridges; the span lift only with `--bridges` |

## 3. Run it, test it, publish it, deploy it

**Dev server.** `preview_start` fails here with "Operation not permitted": macOS denies the app's spawned process access to
the Desktop folder. Run the same server from the shell and point the Browser pane at it; kill it afterwards.
```bash
nohup /usr/bin/python3 iris-engine/serve.py 8771 &
```
Tests open `http://localhost:8771/iris-engine/?start=off` (a kept session and the start eye stay out). Use a second pane
tab for tests when iori has the viewport open (`?eye=26`).

**Fitter.** `/usr/bin/python3` (the one with OpenCV). Four eyes run in parallel fine, ≈ 2.5 GB each, 3–8 min.
```bash
cd iris-engine/tools && /usr/bin/python3 layer_proof.py --ref 26 --whole --export --dump-roots /path/roots-26.pkl
```
The export lands in `study/proof-layers/tissue-NN-whole.json` (gitignored); the report `whole-NN.json` is tracked.

**Engine review of an export**, same page, same load path, each with its own measured light and shading:
```js
await import('/iris-engine/tools/t7/eyes.js'); await __t7.review('26', { url: 'study/proof-layers/tissue-26-whole.json' });
```
Keep each call under 45 s (the javascript tool's limit; eye 09 needs one call per review).

**Publishing an eye** — primitives and measurements together, always: the measurements depend on the deck's geometry and
their key checks only engine and dials, so an old file would be accepted and silently wrong.
1. `cp study/proof-layers/tissue-NN-whole.json data/tissue-NN.json`
2. In the page: `__irisTissueUI.eye = 'NN'; await __irisTissueUI.load()` (the button's path: the pinned case, measured), then
   `IrisTissue.exportMeasurements({ lightBits: 10, shadeBits: 11 })` → `POST /save/data/tissue-NN.cal.bin`.
3. `await __irisTissueUI.load({ arrival: true })` and compare its fit render with step 2's: max 1 / 255 is the gate.

**Do not use `tools/s3/bench.js` to compare the arrival**: it frames its measured load from `ref/cases.json`, which since
rebuild step 1 is not the pinned case — its 82 / 255 is frames, not measurements.

**Gates**: `__uiContract.reach()` and `compare()` both `[]`; the isolated bench is untouched by all of this (the layer model
is off there). **Deploy** (iori asks; the script from origin/main):
```bash
ssh iori-vps 'cd /root/iori && git -c http.version=HTTP/1.1 fetch -q origin && git show origin/main:server_setup.sh > /tmp/server_setup.sh && bash /tmp/server_setup.sh'
```

## 4. Numbers

Engine review, the published export before → after each change (MATCH2 · strandCorr):

| eye | tracer fixed (26 only) | width 1.4 → 0.6 | separator lift (not shipped) |
|---|---|---|---|
| 26 | 84.99 · 0.385 → 85.26 · 0.388 | 85.26 · 0.388 → **84.77 · 0.410** | 84.94 · 0.410 |
| 09 | — | 81.56 · 0.426 → **84.20 · 0.487** | 84.00 · 0.472 |
| 25 | — | 87.82 · 0.354 → **88.65 · 0.383** | 88.63 · 0.379 |
| 35 | — | 83.97 · 0.374 → **83.96 · 0.385** | 83.96 · 0.383 |

| | value |
|---|---|
| deck fibres after the tracer fix | 26: 896 · 09: 1 616 · 25: 994 · 35: 198 |
| roots (26) | 58 links, 53 roots, 111 fibres; 47 % of ends at a wall, 46 % of the rest free |
| bridges detected | 26: 85 · 09: 172 · 25: 129 · 35: 15 |
| weave after the calibration | crossings a third of before, 92–94 % decided (86 % before); deck thickness 278 → 99 µm on 26 |
| the bridge layer | no floating strand: picture identical to the last digit; frame time with the slab 9.1 ms vs 9.8 without (noise) |
| undo / redo / actualize / journal replay | pixel-identical · pixel-identical · within 1 / 255 |

## 5. What this stretch learned, and what it cost to learn

- **The overlay drew one class.** "The eye looks unpopulated" was the roots image drawing deck fibres only; with every class
  drawn the sheet is dense. But the crypt crops were right — and measuring why found two real tracer faults. Draw
  everything before calling a coverage problem, then measure the part that is really missing.
- **A threshold by percentile keeps a fixed fraction**, whatever the tissue holds (45 / 15 dropped the weaker half of every
  crypt by construction). Prefer rules that ask the image.
- **A blind prior can dominate the data**: 41 % of the traced deck was straight-line extension crossing other strands.
- **Width is a number that touches everything** — the probe, the slab, the weave, the de-light. 1.4 × w was a guess from
  v0.8; the right value came from the ridge's own profile, and three of the four eyes gained on the photo score too.
- **A floating bundle must clear the measured relief** to be seen at all (120 µm sat inside a 278 µm weave), and a width
  taken from a measured neighbour gave a 61 µm radius at 60 µm height that never floated. Test with explicit numbers first.
- **Separate what a change consists of before judging it.** The bridges' first slab cost 0.012 strandCorr; scoring the same
  lifted bridges in the ground showed the slab was the cause, the colour chain did nothing, and the rim was a false cliff
  in the normal. After the fix the lift alone is what costs — a fact about the photograph, not a bug.
- **The tracer splits every strand at every junction, the separating one too**: rules about "a continuous strand" must work
  on chains, not fragments.
- **Anchors that a later patch creates** (the variant's `need()` string patches) must be patched after it, or inside it.

## 6. Open, named honestly — the task list

| # | task | state / first step |
|---|---|---|
| **K2** | payloads as materials (melanin, stroma, pigment per sample), the renderer shades them — the real fix for generated strands' colour and the basis of a strand BRDF | agreed next (iori, 2026-09-27) |
| bridges | detected, lift opt-in, not shipped (gate F5: strandCorr falls on 09 / 25 / 35) | iori chooses: a stricter rule (on top of ≥ 3 chains: 33 bridges on 26 instead of 85), ship the 3-D truth anyway, or leave unlifted |
| bridges as strands | the bridge reads as a displaced tube, not strands (iori) | **decided 2026-09-27** (study/11 §5.2.5): the existing slab kept, no second slab; braid (2) + fibril relief (1) + ray-traced tubes (4) at close-up, switched automatically, tracing a quality parameter. **B1 (the braid) built** before K2; B2 traced tubes in the probe, B3 in the photo shader (switch where a screen pixel gets finer than a slab texel), B4 fibril grain — after K2 |
| **layered stroma** | iori 2026-09-27: bridges were placed in valleys (the separator rule sees only deck fibres); no walls — strands at depths over a base, the ABL a shell with the crypts as holes (study/11 §5.4) | **L0 built** (`T.layered`, `T.layerDepths`, traced strands in the probe; off by default). Next L1: the fitter's depth pass, the bundle-scale ladder, bridge candidates by iori's criteria drawn for iori, arcs; the crypt depth is a constant 0.01 mm in the fitter (≈ 110 µm floors) — to be decided |
| tracer coverage | detect a larger portion of the strands the photo shows (iori) — the darker half of a large crypt keeps visible strands no threshold picks up | first a coverage measure (hand-marked crypt crops, traced vs visible); then trace on a de-lit luminance, a smaller local-contrast window in shadow, and a second, bundle-scale ladder (38 % of strong ridge pixels choose σ 6.5 px, which the ladder does not offer) |
| **bokeh toggle** | depth of field on / off as a control (iori, 2026-09-27) | the engine's DOF is the `fstop` path in `fs-photo` (`hq && u_fstop < 64`); a View-menu toggle with its ledger row and `controls.json` home, the camera window's f-stop kept |
| G1b UI | Select · Grow strands · Actualize on the Tissue window's Paint page; iori sees the selection look before the rest is wired | the data and ops exist (§5.2.2) |
| small gaps | an edit to an actualized child's samples via the `set` op is lost on regen (must update `frozen`); a width profile along a strand and a per-strand width range | an hour |
| slab limits | one slab only (the second, for FINE+, is a parameter in name); the T2a zoom window has no slab of its own | after K2 |
| per-texel term | `u_fibNoise` stays 0 until a review sheet at zoom judges it | iori |
| deploy | everything since `ab7d32f` is local: fields, parents, the per-texel term, the bridge layer, the calibrated eyes, the separator rule, this handoff | iori asks |
| carried over | the path-dependent measured load (study/11 §3.4); iPad / phone load timings after S3 | unchanged |

## 7. Where to pick it up

| # | next | first step |
|---|---|---|
| K2 | materials instead of RGB | study/00 §32 K2: export the LUT material per sample from `layer_proof.py invert`, compose writes material channels, the variant runs `irisAlbedoLut` on them; regenerate the four eyes, re-export measurements |
| bridges | iori's choice above | if "stricter": `find_bridges(min_over=3)`, four runs with `--bridges`, review each |
| bokeh | the toggle | ledger row first, then the control |

## 8. Commits of the stretch

`c62c2c0` roots + the tracer + eye 26 · `ab7d32f` eyes 09 / 25 / 35 (pushed and deployed) · `3b9c744` fields ·
`0a48744` parents · `527ea64` the per-texel term · `8163f0c` the bridge layer · `5651b87` the width calibration, four eyes
republished · `faffa32` the separator rule · this handoff.
