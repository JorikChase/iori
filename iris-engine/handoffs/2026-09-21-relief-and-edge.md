# Handoff — relief, the probe, and the inner edge (2026-09-21, engine 0.9.4-edge, version v91-edge)

For whoever takes the iris engine's main line next. Read this, then `study/00-summary-and-spec.md` **§32** (the whole
stretch, K0 → G0, with every measurement), then the previous handoff `2026-09-20-tissue-layer-model.md` for the layer
model itself and `HANDOFF.md` for the older tracks. Everything below was built and measured on 2026-09-20/21.

## 1. Where the project stands, in one paragraph

The tissue layer model of v0.8 was a photograph in the right shape: correct colour, no procedural life, and no depth.
This stretch gave it all three. **The knobs work again** — they offset the fit through the spectral LUT instead of
being replaced by it. **The deck has anatomical height** — a tube radius measured from the trace, a weave inferred
from the crossings — and the sheet has its relief back. **A probe camera** walks the tissue and reads the landscape.
**The inner edge is read from the photograph** rather than painted: a traced margin the aperture follows, and a ruff
of 67 beads. And **G has begun**: an op vocabulary with a journal and exact undo, which the brushes, the generator
and T6's fitter will all speak. Whole iris of ref 26 at NORMAL went **MATCH2 82.92 → 84.98, MATCH 89.72 → 90.29,
cellDab 2.83 → 2.64, hcorr 0.574 → 0.709**, and the isolated integrity bench never moved: 61.6 / 68.3 / 70.5 / 66.4.

## 2. What exists that did not

| piece | where | what it is |
|---|---|---|
| knob liveness harness | `tools/knob_probe.js` | drives all 27 sliders the way a hand does and measures the picture; touches no engine file. `K.run({})` ≈ 8 s |
| knobs as offsets (K1) | `tissue.js` `setOrigin`, the tint in the photo variant | the albedo scaled by the LUT ratio of the texel's material now to its material at the fit. Bit-identical at the origin |
| the weave (Z1) | `tools/layer_proof.py` `weave_heights`, `crossings` | per-sample tube radius (measured) and centre height (inferred from crossing order), with a confidence |
| height in the render | `tissue.js` compose | a hole's surface is floor + the dome of the nearest tube; the sheet keeps the legacy relief (`sheetZ`) |
| inspection (Z2) | `elevationAt`, `section`, `tubesAt`, `heightField` | the API the UI session's panel is built on; `section` reads the primitives, so it sees tubes *under* tubes |
| windowed re-bake (T2a) | `bakeWindow`, `viewRect`, `refocus` | the same primitives re-baked over the visible part at a finer τ, as a detail layer over the base |
| de-light by measurement (Z3b) | `measureDelight` | renders the region flat-grey with the relief on and off and divides the albedo by the ratio |
| the probe (T3) | `IrisTissue.probe(opts)` | its own ray-marcher over the height field; clay / elevation / albedo / height modes; 4 ms at 470 × 320 |
| the margin and ruff (T1) | `layer_proof.py` `pupil_margin`; `tissue.js` `T.marg` | a traced margin the aperture follows, and 67 ruff beads exported as short tubes |
| ops and brushes (G0) | `T.apply`, `T.undo`, `T.commit`, `T.brush.strands` | one vocabulary for the brush, the generator and the fitter, journalled in `T.ops` |

## 3. Run it

```bash
python3 iris-engine/serve.py 8768          # or the launch config "iris-engine"; open http://localhost:8768/iris-engine/
/usr/bin/python3 iris-engine/tools/layer_proof.py --whole --export     # ≈ 11 min → study/proof-layers/tissue-26-whole.json
```
In the page console (NORMAL is fine now; CAPTURE is no longer needed to see the model):
```js
const E = __irisEngine, F = E.fit, T = IrisTissue;
E.state.hippus = false;                                    // a breathing pupil moves every measurement
const cases = await fetch('ref/cases.json').then(r => r.json()), file = Object.keys(cases).find(k => k.startsWith('26'));
await F.renderCaseThumb(file, cases[file], document.createElement('canvas'));   // the photo and its fitted pose
await T.proof('study/proof-layers/tissue-26-whole.json');  // load → calibrate → bake → origin → de-light → on (≈ 14 s)
F.renderFit(); F.score(); F.diagnostics();                 // MATCH2 ≈ 84.98 · cellDab ≈ 2.64
T.probe({ at: [204, 120], heightUm: 150, yaw: 20, pitch: -14, mode: 'clay', contourUm: 25 });   // → ImageData
T.on = false;                                              // back to the legacy model
```

**Integrity rule, unchanged:** with `IrisTissue.on === false` nothing may move. After touching `index.html`, `fit.js`
or a shader, run `F.benchIsolated({ iters: 120, save: false })` at NORMAL: it must give **61.6 / 68.3 / 70.5 / 66.4**
(mean 66.70 = v84). Getting images out of the hidden Browser pane: POST a data URL to `/save/<name>.json` and decode
it in the repo. **The pane being hidden throttles rAF**, so a bench that takes 3 minutes visible takes 12 hidden.

## 4. What this stretch learned, and what it cost to learn

These are the things that would otherwise be paid for twice.

- **Anything added to a shared shader shifts the bench, even when it computes nothing.** The margin correction in
  `fs-photo` — every coefficient zero, the arithmetic an exact identity — moved the isolated bench to
  62.2 / 68.4 / 70.4 / 66.4. Recompiling perturbs a 120-iteration Nelder-Mead fit by a few ULPs and the fit amplifies
  it. Separately compiled variants only. It came back exactly once the correction moved into `tissue.js`.
- **Never bake from inside `bind()`.** `setOrigin` was called lazily there, in the middle of `drawPhotoFrame`, and its
  `bakeAtlas` trampled GL state the caller could not save. It corrupted the *first render after every load* — which is
  the render `calibrate()` measures the light from — and quietly depressed every whole-eye number for a day
  (79.65 against 82.92 for the same configuration baked twice).
- **A dial that reaches the coordinate system or the calibration cannot be swept by re-rendering.** `marginKeep`,
  `marginRound`, `margFade`, `deckZ`, `sheetZ` all do. Swept the lazy way they gave a *false ordering twice* — the
  harmonic taper looked 0.8 better when it is 0.44 worse; the fade looked worth +0.75 MATCH2 when it costs 0.6. A full
  `load` (and `calibrate`) per point, always.
- **The margin is the coordinate system, not a decoration on it.** Mapping primitives in the old `v` and drawing them
  in the corrected one slid the texture outward: MATCH2 76.69. `T.load` runs twice, `keepMargin` guards the second.
- **Textbook de-lighting is wrong here.** Dividing the albedo by the analytic dome cosine cost 6.2 MATCH2 and haloed
  every tube: the renderer's real response to relief is far weaker than the cosine, because a coaxial key hardly cares
  about tilt. Measure the response instead — and take only its *fine* part, since `calibrate()` already removed the
  smooth part (leaving it in cost 7.5 MATCH2).
- **One window does not decide anything.** A single 1 mm crypt said relief *hurt*; the whole eye says it helps by
  2.4 MATCH2. The eye decides.
- **When iori says "it used to look like X", check for a regression before explaining why X was never there.** The
  flat sheet was real: 75.6 % of the layer model's height texels were exactly 0.000 µm where the legacy atlas has
  none at zero.
- A weave has **cycles**, so no single-valued height field satisfies every crossing; 86 % is what the data allows.
  And a deep baked surface is **not** a hole — the sheet dips to −700 µm. Ask `elevationAt(x, y).layers > 0`.

## 5. Where to pick it up

| # | next | first step |
|---|---|---|
| **G1** | **the guide brush** — deck fibres painted on the sheet are invisible by design; sheet strokes need their own brush | mirror `brush.strands` onto the `guides` set, whose payload is a brightness ratio, not an albedo |
| **G2** | **crypt, furrow and spot brushes** — and with furrows as primitives the `furrow` knob lives again, and the sheet stops borrowing its relief from the legacy field | a furrow is a closed low ridge in `v`; the outline machinery already rasterises closed curves |
| **G3** | **the generator** — the same brushes run from the knobs over a whole eye; this is what finally makes `seed`, `crypt`, `furrow` and `collr` live in the layer model | drive G1/G2 from `genome.globals` on a blank region |
| **G4** | **serialise the journal** — `T.ops` to JSON and back, so T6's fitter can replay what a hand did and a hand can edit what the fitter did | the ops are already plain data; only `add` holds a whole curve |
| T4 | the picture debts of §30.2, now the biggest known gap | the tone-by-bin table |
| T5 | budget / ID v3, with `genome.tissue` and provenance per element | thin the rim payload |
| **T6** | the journaled closed-loop fitter — the centre of the timeline | port `layer_proof.py` stage by stage, each stage one op type; G0's vocabulary is already the target |
| T7 | eyes 09, 25, 35 through the pipeline; only then whole-eye photos | generalise `PUP` / `LIMB` / `PPM_FIT` |

**Still open, named honestly.** `strandCorr` is 0.387 against the flat model's 0.516 and nothing has recovered it; the
de-light explains part and not the rest. The sheet's relief is still borrowed from the legacy fit, which is a
stand-in until G2. The pupil margin is traced for ref 26 only, hard-coded like `PUP` and `LIMB` (T7). And the zoom is
**content-limited, not resolution-limited**: a 1.2 µm windowed re-bake is the same picture as the 5.7 µm base,
because nothing in the model is finer than about 10 µm.

## 6. Versions

`v86-k1-offsets` (knobs) → `v87-z1z3-relief` (the deck's height) → `v88-sheet-relief` (the probe, the cornea default,
the sheet's relief) → `v89-delight` (de-light by measurement) → `v90-margin` (the margin and the ruff) →
**`v91-edge`** (round and fading, plus G0), engine **0.9.4-edge**. Each carries its own bench; the isolated bench is
identical in all of them because the legacy model was never touched. `IrisTissue` dials, all with ablations:
`on`, `k1`, `deckZ` 1, `delight` 1, `wallZ` 2.5×, `sheetZ` 0.5, `srelAmt` 0.5, `margin`, `marginKeep` 3,
`marginRound` 0.25, `margFade` 0.04.
