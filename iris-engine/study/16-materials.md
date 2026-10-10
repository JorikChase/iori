# 16. Materials — phase 2 of study/14: diagnosis, plan, gates (2026-10-11)

iori: "materials are a large part of good rendering so it should take priority"; "shouldn't they have subsurface?".
K2 = every sample a MATERIAL instead of a colour; K2b = lateral subsurface. This file is the diagnosis of the colour chain
as it is, what was measured today, the plan, and the questions only iori can answer.

## 1. The colour chain as it is

1. **The fitter already thinks in materials.** `tools/layer_proof.py` sends every colour through a port of the engine's
   spectral LUT — a two-flux model: melanin absorption (Ma 0–6, eumelanin/pheomelanin mix `pheo`), a scattering stroma
   (Ds 0–0.5, Rayleigh-to-Mie mix `mie` 0–1), a yellow film (0–2.5), over the black epithelium — and finds the nearest
   graded LUT colour for each sample (class-owned for deck, ground, rim; one per 0.1 mm cell on the sheet; per point along
   fibres and guides). Then it **exports the result as linear RGB**: `rgb` on fibres, guides and beads, `cells.sheet` /
   `cells.ground`, `rimRGB` — each is graded(LUT[material] × a luminance), rounded to 4 decimals. The material indices are
   discarded at export.
2. **The engine renders colours, not materials.** `tissue.js` turns each `rgb` into albedo by inverting the post chain and
   dividing out the measured light (`toAlbedo`: X = k·A + s, calibrate's k and s), bakes the albedo into the region texture
   and the photo shader lights it. Its own spectral LUT (48 × 32 × 8 × 8: Ma, Ds, pheo, yellow; **mie fixed at 0.08**,
   rayExp 5) is used only by the legacy procedural bake and by the K1 knob tint: the knobs move the legacy material fields
   and the layer model is tinted by LUT(now) / LUT(origin).
3. **The grade.** A per-photo camera grade (chroma gain, hue rotation — 26: 1.4 / 0°, 09: 1.6 / 0°, 25: 1.2 / −10°,
   35: 1.0 / −10°) is folded into the exported colours; it belongs in post (an open item since P1).
4. **Subsurface is vertical only.** The two-flux LUT is light going down through melanin and stroma and back at the same
   pixel. Nothing travels sideways: a crypt wall is lit only by what falls on it, never by light entering the sheet beside it.
5. **The legacy atlas stays in the chain** (study/14 1b finding): the layer model's colour, pupil, ruff and limbus still read
   the procedural bake's material fields. Materials in the eye file are the step that lets the shader stop reading them.

## 2. Measured today — the materials are recoverable without a refit (K2.0)

`tools/materials/recover.py NN` ungrades every shipped colour with the eye's grade, divides out its luminance and matches
the chromaticity against the fitter's LUT (24 × 16 × 5 × 8 × 7, mie included) in Lab at one luminance; the scale is the
luminance ratio. Results → `study/materials/recover-NN.json` (material index + scale per sample).

| eye | grade chroma / hue° | samples | distinct materials | sheet cells ΔE med / p95 | guide points ΔE med / p95 | worst class p95 | mie levels used |
|---|---|---|---|---|---|---|---|
| 26 | 1.4 / 0 | 50,279 | 4,199 | 0.000 / 0.236 | 0.000 / 0.236 | 0.38 (fibres.rgb) | 7 |
| 09 | 1.6 / 0 | 53,601 | 1,850 | 0.000 / 0.233 | 0.000 / 0.357 | 5.29 (beads.rgb) | 7 |
| 25 | 1.2 / -10 | 53,706 | 5,870 | 0.000 / 4.701 | 0.000 / 0.239 | 17.83 (beads.rgb) | 7 |
| 35 | 1.0 / -10 | 37,517 | 4,101 | 0.000 / 0.292 | 0.000 / 0.288 | 0.29 (fibres.rgb) | 7 |

**Reading.** Median ΔE 0.000 in every class on every eye: the shipped colours ARE LUT materials times a brightness. The
p95 ≈ 0.2–0.4 is the 4-decimal rounding. The exceptions are real: the beads' colours were never LUT materials (the fitter
exports a measured Lab for them — 09 median 1.5, 25 p95 18), eye 25's sheet has 2 347 cells at the mie axis's end (p95 4.7:
its sheet colour sits at the gamut's edge, the known eye-25 colour debt), and a few near-black ground cells carry noise
chromaticity (max 12–55, irrelevant at their luminance). **All seven mie levels are in use on every eye** — the engine's
fixed-mie LUT cannot reproduce the fitted materials; the engine needs the mie axis.

## 3. What K2 changes

- **Representation.** Per sample: a material (Ma, Ds, pheo, yellow, mie — five u8 indices into a fixed LUT grid) and a
  luminance scale (f16); per eye the grade stays in `frame`. `rgb` is derivable: rgb = grade(LUT[m] × scale). Decision 5
  of study/15 said keep rgb until materials are filled; K2.1 fills them, so the writer drops rgb when it writes materials.
- **The engine's LUT grows the mie axis** (K2.2): 48 × 32 × 8 × 8 × 7 = 688 k RGBA16F texels ≈ 5.5 MB, or the fitter's
  own 24 × 16 × 5 × 8 × 7 = 108 k (0.9 MB) — the fitted materials live on that grid exactly, so the coarse one is lossless
  for shipped eyes and the fine one only matters for knobs between grid points. Build time scales with the entries.
- **The bake reads materials** (K2.2): the compose pass evaluates LUT[m] × scale, applies the grade, then `toAlbedo` as
  today — **bit-identical to the current render by construction** (the same numbers the fitter exported, before rounding).
  A separately compiled bake variant; the rgb path stays one version as the fallback.
- **The knobs become material offsets** (K2.3): PIGMENT, STROMA, PHEO, YELLOW, MIE add to every sample's indices before the
  LUT, instead of the LUT-ratio tint read from the legacy fields. Origin = the fitted material; the slider's notch stays at
  the fit (K1 holds). This is the step after which the layer model stops reading the legacy material fields.
- **Generated strands inherit materials** (K2.3): a child's material is its parent's (or the nearest measured sample's)
  — the fix for the pale generated strands, which today carry a default rgb.
- **The ground gets its own material per cell** (K2.1): today one chromaticity × a luminance map; the recovered indices show
  36–96 distinct materials per eye already.

## 4. K2b — lateral subsurface

Light entering the sheet beside a crypt exits inside the wall and the floor; thin strands are translucent at their edges;
light irides look lit from within. Model: before the albedo is applied, the irradiance E arriving at the surface is spread
in tissue space with a kernel whose radius grows with the stroma density Ds (more scattering, longer paths) and with depth
below the ABL (deck fibres receive more spread light than the sheet); col = albedo × (E ⊗ K(Ds, depth)) instead of
albedo × E. Implemented in the bake as a separable blur of the measured light grid (calibrate's k) per level, mixed by a
strength knob with origin 0. **Gate:** crypt-wall and floor brightness profiles against the photographs by region
(`tools/crisp` samples five sites per eye), cellΔab not worse, MATCH2 not worse; iori judges the glow in the overlay.

## 5. Steps and gates

| # | step | gate |
|---|---|---|
| K2.0 | recover the materials from the shipped colours (done above) | median ΔE 0 per class; the exceptions named |
| K2.1 | materials into the eye file: `mat` (5 × u8) + `lum` (f16) columns on every colour-bearing table, cells and rim; the beads fitted to the nearest material (they were Lab); `materials.channels` filled; rgb dropped by the writer | pack --check equal; rgb regenerated from mat × lum × grade equals the old rgb within 1 / 10 000 |
| K2.2 | the engine LUT with the mie axis; the bake variant from materials; grade applied in the bake (then moved to post) | the four eyes bit-identical to today's render (MATCH2, strandCorr, cellΔab to three decimals); contract `[]` |
| K2.3 | knobs as material offsets; generated strands inherit; the legacy material fields no longer read by the layered path | knob at origin = identical picture; a generated strand's colour within ΔE 2 of its parent's; the atlas-black test changes only the pupil, ruff and limbus |
| K2b | lateral subsurface | §4 |
| prune | the procedural bake off the layered load path (study/14 1b's deferred gate) | the layered eye renders with the atlas never baked; cold-load timeline |

## 6. Questions for iori

1. **Which LUT grid does the engine carry?** The fitter's coarse grid (0.9 MB, lossless for every shipped eye, knobs step
   in coarse increments) or the engine's fine grid with mie added (5.5 MB on the GPU, smooth knobs). Proposal: the coarse
   grid now, the fine one when the knobs are the editor's.
2. **The grade** stays per eye in `frame` and is applied in the bake first (bit-identical), then moved to post in K2.3 so
   the albedo texture is pure reflectance. Agreed?
3. **The beads' colours** are measured Lab, not materials. Fit them to the nearest material now (ΔE 1.5 on 09, 18 at the
   worst bead of 25) or keep an rgb exception for the ruff? Proposal: nearest material, the ruff is pigment epithelium and
   should be a material anyway.
4. **K2b's scope**: subsurface everywhere with one strength knob, or only where the geometry has depth (crypt walls and
   floors, the deck)? Proposal: everywhere, depth-weighted, one knob with origin 0 — the photographs then say how much.
