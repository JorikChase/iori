# Handoff — the layered stroma, the front layer's texture, brightness and close-ups (2026-09-27/28)

For whoever takes the iris engine next. Read this, then **`study/11-plan-every-eye-a-layer-model.md` §5.2.5, §5.4 and §5.5**
— every decision iori made in this stretch and every measurement behind it are written there, including the claims that
turned out wrong and how they were corrected. The previous handoff, `2026-09-27-strands-roots-bridges.md`, is the state this
stretch started from; its task list is carried forward and updated in §6 below.

## 1. Where the project stands, in one paragraph

iori's viewport is now sharp and photographic up close. The four layer-model eyes carry a **measured micro-texture of the
anterior border layer** (ABL), evaluated per pixel in the photo shader and calibrated so the sheet's fine contrast matches
each photograph at 3× and 6× zoom; their **brightness matches their photographs** (a measured de-bias of the albedo, shipped
inside the measurements); the crypts' **rim is a thin line** (8 µm, was a 42 µm amber band); the lateral **chromatic
aberration is gone** (measured on the photos: none); the **white mask follows each eye's own data edge**, so no strip of the
old atlas shows when the pupil contracts or the eye turns; and **one Camera toggle, SOFTNESS**, holds everything that blurs
(depth of field, the soft limbus, the mask's feather), off by default. Whole-eye scores rose on every eye (review path,
MATCH2: 26 84.29 → 90.08, 09 83.10 → 87.68, 25 87.13 → 90.85, 35 83.09 → 88.39). In parallel, the **layered stroma** exists
behind `T.layered` (off): no walls, strands at depths over a base, the ABL as a shell, traced strands in the probe — L0 of a
plan whose L1 (the fitter's depth pass) is next. **Deployed: everything up to `cd94185`. Local only: `b8193d2` (the mask) and
`81dfa2d` (SOFTNESS) and this handoff** — iori asks before a deploy.

## 2. What exists that did not

| piece | where | what it is |
|---|---|---|
| braid (B1) | `tissue.js` `braidOf`, parent params `braid*`, `T.braid` | a floating strand as 2–8 children twisting round it, splaying where it lands; expanded at bake time, never stored. Floating pass: highest surface wins, a MIN-blended bottom pass |
| layered stroma (L0) | `T.layered`, `T.ablMm`, `T.underMm`, `T.lipMm`, `T.restMm`, `T.drape`, `T.dipMm` | base (floor + draped resting strands) + ABL shell in the slab + undercut; every run of a strand that leaves the base floats — no mesas, no vertical walls |
| traced strands in the probe | `segmentGrid()`, probe `segCell` / `capT` | floating strands as capsules in a per-cell list, exact ray × capsule hits for view and shadow rays |
| depth pass (JS) | `T.layerDepths()`, `T.layerDepthsOnLoad` | a deck strand's depth from brightness, thickness and weave, lifted as an arc between anchors |
| sheet dump | `layer_proof.py --dump-sheet FILE --dump-exit` | the sheet tracer's inputs, one fitter run (≈ 5 min) |
| sheet tracer | `tools/sheet_trace.py` | flow field + along-flow smoothing + a NULL tracer (flow turned 90°) setting the threshold — found the sheet's fine contrast is speckle, not strands |
| ABL texture | `tools/abl_texture.py` → `study/proof-layers/sheet/abltex-NN.json`; `tools/abl_publish.py NN` appends `ablTex` to `data/tissue-NN.json` | the photo's isotropic band energies (5–75 µm) and brightness exponent; the shader's noise ported bit for bit; `octVar` per octave |
| per-pixel texture | photo shader `ablTexture()`; `T.ablTex` (from the eye file), `T.ablTexOverride` (studies), `T.ablDebug` | Cartesian tissue plane r(cos θ, sin θ); three high-passed octaves (6 · 12 · 24 µm); viewport keeps full strength, exact path fades by 0.5–1 cell; lognormal on the faded variance; off in grey calibration renders (`T.greyBake`) |
| de-bias | `T.debias()` (2 passes, `T.debiasPasses`), in `T.proof` after `measureDelight` | photo / render luminance at calibrate()'s 0.2 mm scale inside the fitter's own iris mask, folded into k; ships in the cal.bin; `dialKey` records it; throws below 1000 pixels |
| rim width | `T.rimK = 0.2` (engine side; the fitter keeps its width to MEASURE rim strength) | 42 → 8 µm; in `dialKey` |
| white mask | `T.edgeMask`, `T.dataV1`, `T.edgeInV`, `T.edgeWV` / `T.edgeWVSharp` | white from just inside the data's own outer edge, in tissue v |
| SOFTNESS | `dof-btn` (Camera window), View ▸ Photo softness, `state.dof` | depth of field (the F-STOP slider), the limbus's blend (4.5 % of the radius, else 0.6 %), the mask's feather; off by default |
| aberration | post `u_caFrame`, `u_view` | with the layer model: the frame's formula, amount 0 (measured). The legacy model keeps its own (the contract's legacy fits see it) |
| crispness tools | `tools/crisp/crisp.js` (`measure`, `regions`, `eye`, `sheet`), `abl_calibrate.js`, `edges.js` (kept, biased — see §5), `mm_study.js` | band contrast of render vs the ORIGINAL photo at K×, by region (crypt / sheet), five sites per eye; viewport or exact path |
| fresh-page helpers | `tools/tone/tone.js` (`bins`), `tools/tone/fresh.js` (`review`, `publish`) | brightness by the photo's own brightness bins; publish = measured load → export → arrival gate |
| light elevation | default 82° (`lightElev` 1.4312), slider to 90° | iori |

## 3. Run it, test it, publish it, deploy it

**Dev server** as before (`preview_start` is denied Desktop access): `nohup /usr/bin/python3 iris-engine/serve.py 8771 &`, then
`http://localhost:8771/iris-engine/?start=off`. A hidden Browser pane throttles timers and defers the first
`image.decode()` after a load — a crispness measurement right after a review often times out once; repeat the call. Keep every
`javascript_tool` call under 45 s: review, then measure, in separate calls.

**Measure every eye on a FRESH page.** The measured load is path-dependent (eye 09 loaded twice in a row: 85.65 then 85.45;
eye 25 after eye 09 failed the arrival gate by 80 / 255 and passes on a fresh page). The review path
(`__t7.review(r, {url: 'data/tissue-NN.json'})`) reproduces published numbers; the Load button's path does not after
another eye.

**Publishing an eye** (primitives, texture and measurements together):
1. texture spec: `python3 tools/abl_publish.py NN` (replaces the file's `ablTex`, one line of diff);
2. fresh page → `await import('/iris-engine/tools/tone/fresh.js'); await __fresh.publish('NN')` — the Load button's load (measured,
   de-biased), `exportMeasurements({lightBits:10, shadeBits:11})` → `/save/data/tissue-NN.cal.bin`, then the arrival, and the
   gate `maxDiff ≤ 1`;
3. contract on a fresh page: `__uiContract.start({iters:20})`, then `compare()` and `reach()` both `[]`.

**Calibrating a texture** (a new eye, or a change to the noise): the sheet dump → `abl_texture.py` → on a fresh page
`__ablCal.review(r, amp)` → `__ablCal.measure(r, 6)` → `__ablCal.measure(r, 3)` (viewport path, 16 frames), each octave
corrected against the band it dominates (6 µm ↔ 6× finest, 12 µm ↔ 3× finest, 24 µm ↔ 6× coarse), in quadrature over the
render without texture. Aim within 8 % at both zooms.

**Deploy** (iori asks): push `main`, then
`ssh iori-vps 'cd /root/iori && git -c http.version=HTTP/1.1 fetch -q origin && git show origin/main:server_setup.sh > /tmp/server_setup.sh && bash /tmp/server_setup.sh'`;
verify the served files' hashes against local and load `https://iori.me/iris-engine/?eye=26` (the log must say "shipped
measurements installed").

## 4. Numbers

Review path, fresh pages (MATCH2 · strandCorr · cellΔab):

| eye | 2026-09-27 (baked texture off, before the de-bias) | now | viewport sheet at 6× / 3× (% of the photo) |
|---|---|---|---|
| 26 | 84.29 · 0.366 · 2.50 | **90.08 · 0.414 · 2.00** | 96·99·99 / 102·105·101 |
| 09 | 83.10 · 0.420 · 2.88 | **87.68 · 0.483 · 2.78** | 106·106·103 / 106·102·101 |
| 25 | 87.13 · 0.285 · 2.48 | **90.85 · 0.385 · 2.55** | 97·100·100 / 107·108·104 |
| 35 | 83.09 · 0.282 · 2.35 | **88.39 · 0.390 · 2.16** | 99·103·101 / 101·102·97 |

| | value |
|---|---|
| brightness vs photo, eye 26 (mean · darkest bin) | +14.6 % · +41 % → +0.6 % · +9 % |
| iori's crop, eye 26 at 6×, viewport band contrast | photo 3.6 · 5.9 · 7.8 · this morning 2.4 · 4.0 · 5.5 · now 3.3 · 5.4 · 7.2 |
| the photos' lateral aberration | ≤ 0.1 native px (0.4 µm) on all four |
| sheet speckle, directional share by band (eye 26) | 5–9 µm 0.01 · 7–19 µm 0.10 · 14–37 µm 0.43 (crypts 0.11 · 0.40 · 0.67) |
| speckle strength ∝ brightness^e | 26 0.81 · 35 0.81 · 25 0.19 · 09 0.05 |
| per-pixel texture cost | whole eye ≈ 0.04 ms / frame (1280 × 924); zoomed ≈ 0.3 ms / Mpx |
| layered mode, eye 26 (L0, not shipped) | 84.51 · 0.384 · 2.31, hcorr 0.744; steep runs over 70 µm: 26 → 0 |

## 5. What this stretch learned, and what it cost to learn

- **Check the premise in the code before designing a test.** "The fitter traces a 1280 px copy" was wrong — it crops the
  native photo; 1280 is only the export's frame. A 2560 px test would have been a step DOWN. One read of `layer_proof.py`
  would have saved a round with iori.
- **Ask what a band IS before tracing it.** The sheet's missing crispness had no direction at all (0.01): speckle, not strands.
  A null tracer (the flow turned 90°) is a cheap, honest threshold; the directional-energy share settles it outright.
- **Calibrate on the path the viewer sees.** A texture tuned on the exact path's point samples came out at 60 % in the
  viewport, whose accumulation averages each pixel like a camera does. And the scoring path should fade what a pixel cannot
  resolve — a statistical texture only ever costs correlation there.
- **A coordinate that is not a metric shears.** `u × circumference(v)` moved the first axis by u · 8π · Δv on a radial step:
  radial streaks, invisible in the numbers, obvious in a texture-only debug view. Look at the texture alone.
- **Comments swallow code.** Three statements sat after a `//` on a multi-statement line: `u_ablExp`/`u_ablGain` (mine),
  `u_rK` since 7e82199 (mine — the layered mode's highest-wins and bottom pass ran with a tube radius of 0), and
  `gl.activeTexture(0)` at the end of `T.bind` since 1410a78. Put comments on their own line; grep for `//.*gl\.` after edits.
- **Silent fallbacks lie.** The de-bias found no pixels on the Load button's path (no `fit.mask` there) and corrected nothing
  while the new key said it had. It now throws.
- **Measure before calling a look a bug, and before calling a fix a fix**: the region split, the fresh-page rule and the
  hash checks each overturned something I had already told iori (eye 25 "too dark", a colour gain on 25, the 1280 claim).
- **What a mask ends on matters**: the region padding (0.3 mm) sits between the data's edge and the old atlas; the white
  must key off the data, not the region.

## 6. Open, named honestly — the task list

| # | task | state / first step |
|---|---|---|
| **L1** | the fitter's depth pass: every strand a depth (weave · brightness · position against a hole's edge); the bundle-scale ridge ladder; bridge candidates by iori's criteria (thickest single strands, the brightest lines beside the darkest pixels), DRAWN for iori before anything lifts; arcs in the fitter and the parents (`sag` → an upward arc) | next in the layered order (study/11 §5.4); the sheet part is done (§5.5: speckle, handled by the texture) |
| L2 | the renderer: a segment grid for every strand, traced in the photo shader at close range (auto switch where a screen pixel is finer than a slab texel), a K-layer stack far | after L1 |
| L3 | republish the four eyes on the layered model | after L2 |
| K2 | materials instead of RGB (melanin, stroma, pigment per sample) | agreed after the bridges/layers; also the fix for generated strands' pale colour |
| B2–B4 | traced tubes in the probe, in the photo shader, fibril grain | folded into L2 for the tubes; B4 after K2 |
| crypt depth | the fitter writes `depth: 0.01` mm — floors ≈ 110 µm; iori kept it ("use the heights we already use") | revisit if the layered look needs room (150 µm tested: more strands float, strandCorr −0.02) |
| path-dependent measured load | up to 1 MATCH2 between loads of the same eye; not the texture-unit bug (fixed, no effect) | find what `__irisTissueUI.load()` carries between eyes (study/11 §3.4) |
| compose's sheared grain | the compose's fixed grain and the per-texel term (`u_fibNoise`) still use u × circumference(v) | only when an eye has no `ablTex` / when fibNoise > 0; port to the Cartesian plane if either is used |
| the pupil | in eye 26's whole-eye view the render's pupil looked larger than the photo's | seen once, not measured |
| eyes 09 / 25 speckle | exponents 0.05 / 0.19 (noise-like); the texture follows the measurement | iori judges; option: clamp the brightness modulation tighter |
| tracer coverage (deck) | the darker half of large crypts; the bundle-scale ladder | part of L1 |
| small gaps | the `set` op on an actualized child is lost on regen; width profile along a strand | an hour |
| deploy | `b8193d2` (mask) and `81dfa2d` (SOFTNESS) and this handoff are local | iori asks |

## 7. Where to pick it up

| # | next | first step |
|---|---|---|
| L1 | the fitter's depth pass and the bridge detection sheet | `layer_proof.py --dump-roots` for eye 26 (inputs in 25 s), then a detection sheet of iori's bridge criteria over the four eyes' crypts — drawn, nothing lifted |
| deploy | if iori asks | §3 |

## 8. Commits of the stretch

`ed5a0f1` B1 braid · `d0d778f` L0 layered stroma · `7e82199` no walls, 82° · `90f0c55` depth of field off, the crispness
measure · `def6098` the 1280 claim corrected · `723371d` the sheet tracer · `294618b` / `ce25442` / `e8820ba` the ABL texture
(baked) on four eyes · `ac58768` the de-bias · `18459ec` why close-ups are soft · `7b968e0` the texture per pixel ·
`cd94185` viewport calibration, isotropic plane, rim 8 µm, aberration 0 (deployed) · `b8193d2` the white mask · `81dfa2d`
SOFTNESS · this handoff.
