# K0 — the knob liveness table (spec §32), 2026-09-20

Harness `tools/knob_probe.js` (loaded on demand; **touches no engine file**, so the integrity bench cannot move).
Each slider is driven **the way a hand drives it** — set the DOM value, dispatch `input`, so every side-effect listener
runs (`atlas.dirty`, `regenerateCrypts`, `loadSeedIntoSliders`) — by **20 % of its own range**, then the render loop's
easing is skipped (target → state) and the picture is measured against the origin.

Two render paths, because one alone lies:

- **fit** — one frame with `u_ref = 1`: what `fit.js` `renderFit` and every bench see. The shader gates jitter, depth of
  field, chromatic aberration, bloom and grain behind `hq = u_ref < 0.5`, so in this path those knobs are flat 0
  however far they move.
- **accum** — 32 frames of the interactive path (`u_ref = 0`), the same ping-pong as `render()`: what the window shows.

Metric: mean |ΔY| in sRGB code values (0–255) inside the engine's own iris mask (limbus 0.92, pupil 1.08, clipped
speculars out; 90 490 px). Case **26-green-crypts-isolated**, NORMAL, fitted pose, MATCH2 73.9674 before and after the
sweep — **the sweep restores the fitted eye exactly** (the genome is part of the snapshot: the seed slider *replaces*
the genome object and the crypt slider mutates `genome.crypts` in place).

`legacy` = `IrisTissue.on === false` · `tissue` = the whole iris of ref 26 through `IrisTissue.proof`.
Verdict: dead < 0.1 ≤ weak < 0.5 ≤ live, on the larger of the two paths; **KILLED** = live in the legacy model, dead
under the layer model.

| knob | state key | family | origin → | legacy fit | legacy accum | tissue fit | tissue accum | ratio | verdict |
|---|---|---|---|---:|---:|---:|---:|---:|---|
| seed | `seed` | procedural | 42 → 241.8 | 34.525 | 33.613 | 0.009 | 0.010 | 0.00 | KILLED |
| pupil | `pupil` | geometry | 4.05 → 5.25 | 39.391 | 38.002 | 32.581 | 31.887 | 0.83 | live |
| elev | `lightElev` | light | 1.4 → 1.14 | 8.466 | 7.714 | 3.890 | 3.890 | 0.46 | weakened |
| light | `lightAngle` | light | 1.57 → 2.826 | 4.260 | 3.813 | 0.445 | 0.442 | 0.10 | weakened |
| srcsize | `srcSize` | light | 0.12 → 0.206 | 0.000 | 0.000 | 0.000 | 0.000 | 0.00 | dead in both |
| ambient | `ambient` | light | 0.26 → 0.46 | 3.119 | 3.119 | 4.724 | 4.735 | 1.52 | live |
| lid | `lid` | light | 8 → 6.8 | 0.603 | 0.600 | 0.645 | 0.643 | 1.07 | live |
| ev | `ev` | camera | -0.9 → 0.3 | 54.353 | 54.795 | 55.623 | 55.783 | 1.02 | live |
| fstop | `fstop` | camera | 11 → 16.84 | 0.000 | 0.740 | 0.000 | 0.332 | 0.45 | weakened |
| focus | `focus` | camera | 0 → 1.2 | 0.000 | 10.348 | 0.000 | 6.925 | 0.67 | live |
| kelvin | `kelvin` | camera | 5600 → 6640 | 0.000 | 0.000 | 0.000 | 0.000 | 0.00 | dead in both |
| grain | `grain` | camera | 0.02 → 0.044 | 0.000 | 1.158 | 0.000 | 1.150 | 0.99 | live |
| bloom | `bloom` | camera | 0.35 → 0.55 | 0.000 | 0.000 | 0.000 | 0.000 | 0.00 | dead in both |
| pigment | `pigment` | procedural | 0 → 1 | 45.119 | 45.188 | 0.005 | 0.005 | 0.00 | KILLED |
| stroma | `stroma` | procedural | 0.24 → 0.31 | 3.829 | 3.851 | 0.001 | 0.001 | 0.00 | KILLED |
| pheo | `pheo` | procedural | 0 → 0.2 | 0.158 | 0.158 | 0.000 | 0.000 | 0.00 | KILLED |
| yellow | `yellow` | procedural | 1.07 → 1.57 | 2.732 | 2.743 | 0.000 | 0.000 | 0.00 | KILLED |
| mie | `mie` | procedural | 0 → 0.2 | 0.000 | 0.000 | 0.000 | 0.000 | 0.00 | dead in both |
| ring | `ring` | procedural | 0 → 0.5 | 13.617 | 13.674 | 0.003 | 0.003 | 0.00 | KILLED |
| warp | `warp` | procedural | 0.022 → 0.038 | 0.000 | 0.000 | 0.000 | 0.000 | 0.00 | dead in both |
| collr | `collr` | procedural | 0.18 → 0.27 | 0.538 | 0.474 | 0.001 | 0.001 | 0.00 | KILLED |
| crypt | `crypt` | procedural | 0.26 → 0.46 | 11.498 | 11.369 | 0.002 | 0.002 | 0.00 | KILLED |
| furrow | `furrow` | procedural | 0.66 → 0.96 | 0.137 | 0.115 | 0.000 | 0.000 | 0.00 | KILLED |
| relief | `relief` | procedural | 1 → 1.4 | 6.402 | 6.314 | 0.002 | 0.002 | 0.00 | KILLED |
| blcol | `blColour` | procedural | 1 → 0.8 | 5.213 | 5.208 | 0.000 | 0.000 | 0.00 | KILLED |
| blrel | `blRelief` | procedural | 1 → 0.8 | 9.624 | 9.521 | 0.002 | 0.002 | 0.00 | KILLED |
| blflow | `blFlow` | procedural | 1 → 0.8 | 0.622 | 0.449 | 0.000 | 0.000 | 0.00 | KILLED |

## What the table says

**13 knobs KILLED by the layer model** — every one that reaches a pixel through the baked atlas: seed, pigment,
stroma, pheo, yellow, ring, collr, crypt, furrow, relief, blcol, blrel, blflow. Their residue (0.000–0.010) is the
thin unmasked rim outside the tissue region, not the tissue. This is iori's report, measured.

**2 weakened.** `light` 0.10 and `elev` 0.46: the layer model's albedo is flat, so moving the key only re-lights the
−10 µm hole floors — the *only* relief it owns. `fstop` 0.45 and `focus` 0.67 fall for the same reason (less structure
to defocus).

**3 still live and correct**: `pupil` 0.83 (geometry, outside the tissue), `ev` 1.02 and `grain` 0.99 (post pass,
after the model). `ambient` 1.52 and `lid` 1.07 rise — the tissue albedo is brighter and flatter than the legacy one,
so ambient carries more of the picture.

**5 were already dead in the legacy model** — nothing to do with the layer model, and worth their own fix (K1b):

| knob | why, most likely |
|---|---|
| `srcSize` | isolated cases render with `specular: 0`; the source's angular size only widens the specular and its penumbra |
| `kelvin` | the per-photo camera grade (`fit.sat`, the fitted white balance) absorbs the key colour |
| `bloom` | 0 even *unmasked* (whole-frame ΔY 0.000), so it is not the iris mask hiding it — the post pass's bloom term is not reaching the image |
| `mie` | the fitted per-cell material overrides the Mie axis everywhere inside the iris |
| `warp` | the fitted flow pack (`f0.g`, `f0.b` = warpU / warpV) replaces the procedural warp field |

**Gate from here on:** a version may not lower a knob's number. K1 must bring all 13 KILLED rows back to ≥ 0.5 of
their legacy value, and should raise `light` / `elev` as the relief of Z1 lands.

Reproduce:

```js
const K = await import('./tools/knob_probe.js');
const cases = await fetch('ref/cases.json').then(r => r.json()), file = Object.keys(cases).find(k => k.startsWith('26'));
await __irisEngine.fit.renderCaseThumb(file, cases[file], document.createElement('canvas'));
const res = await K.run({});          // ≈ 8 s, both models; K.markdown(res) is the table above
```

---

# K1 — the knobs offset the fit (same harness, same case, NORMAL)

`tissue.js` only; `index.html`, `fit.js` and the shader sources are untouched. **Ablation switch `IrisTissue.k1`**
(true by default; false = the v0.8 behaviour). At the origin the two are **bit-identical — 0 of 295 680 pixels differ**,
so the fitted eye is exactly the picture it was (MATCH2 79.653, MATCH 84.784, cellDab 4.47 at NORMAL, both ways).

| knob | legacy | v0.8 tissue | **K1 tissue** | K1 ratio | verdict |
|---|---:|---:|---:|---:|---|
| seed | 34.525 | 0.010 | **39.942** | 1.16 | live |
| pigment | 45.188 | 0.005 | **60.637** | 1.34 | live |
| stroma | 3.851 | 0.001 | **4.891** | 1.27 | live |
| pheo | 0.158 | 0.000 | **0.220** | 1.39 | live |
| yellow | 2.743 | 0.000 | **4.372** | 1.59 | live |
| ring | 13.674 | 0.003 | **20.083** | 1.47 | live |
| blcol | 5.213 | 0.000 | **6.223** | 1.19 | live |
| collr | 0.538 | 0.001 | 0.158 | 0.29 | weakened |
| blrel | 9.624 | 0.002 | 2.583 | 0.27 | weakened |
| relief | 6.402 | 0.002 | 0.068 | 0.01 | wired, nothing to scale — see below |
| blflow | 0.622 | 0.000 | 0.047 | 0.08 | structural, → G |
| crypt | 11.498 | 0.002 | 0.028 | 0.00 | structural, → G + Z1 |
| furrow | 0.137 | 0.000 | 0.000 | 0.00 | structural, → G |

Unchanged rows (pupil, ambient, lid, ev, fstop, focus, grain and the five dead-in-both) stay as the K0 table has them.

## How it works

`uploadFields` in `index.html` already treats every colour gene as a **gain or offset on `genome.fitted`** — that is
why the knobs are live on a fitted eye in the legacy model. K1 gives the layer model the same origin:

1. `IrisTissue.setOrigin()` packs the fitted atlas's material into two textures — (melanin, stroma, pheo, yellow) and
   (gap melanin, gap stroma, thickness, furrow), full atlas resolution, mipped like the atlas itself.
2. The photo variant evaluates the texel's material **now** and **at the origin** through the same spectral LUT and
   scales the layer model's measured albedo by their ratio. Same input ⇒ ratio 1 ⇒ nothing moves.
3. Relief is divided by the origin's `relief × blRelief` instead of the live one, so both scale the tissue's height.

Two things were needed to make the origin exact, and both are worth remembering:

- **`setOrigin` can be reached from inside `drawPhotoFrame`**, between its `useProgram` and its draw. It must save and
  restore the program, the framebuffer and the viewport, or that frame is drawn with the snapshot pass's state — this
  corrupted the irradiance calibration and cost 25 cellDab before it was found.
- **The ratio needs the same small offset on both sides** (`(n + 2e-3) / (o + 2e-3)`). At the limbal rim the LUT
  clamps to black; a bare ratio reads 0/ε = 0 there and paints the rim black. 1 674 pixels, up to 129 code values.

## Why four knobs are still flat

- **`relief` is wired and proportional** — driving it 1 → 1.4 / 2 / 5 moves the picture 0.096 / 0.219 / 0.772, and
  re-baking the holes from 10 µm to 100 µm moves it 0.992. There is simply **almost no relief in the model**: the whole
  height field is `−depth × (1 − cover)`, 10 µm hole floors and flat everywhere else. This is the Z1 gap, measured.
- **`crypt`** reaches 0.2 at full swing (0.26 → 1.0) against the legacy model's 9.4: the tint carries a crypt's
  *material* but not its floor shadow, its depth or its occlusion, and the layer model's holes are the measured ones.
- **`furrow`** has nothing to act on — the layer model contains no furrow primitive at all.
- **`blflow`** turns a flow field; the deck is explicit fibre curves, which a flow knob cannot rotate.

All four need primitives that respond, not more shading: **crypt, furrow and blflow belong to G**, relief to **Z1**.
