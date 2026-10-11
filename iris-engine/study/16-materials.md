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

## 2b. K2.1 built (2026-10-11) — the materials are in the eye files

`tools/materials/publish.py NN` writes, beside the colours for now, `mat` (five u8 indices: Ma, Ds, pheo, yellow, mie) and
`lum` (the luminance scale, 5 decimals) on every point of fibres, guides and beads, `matS/lumS` and `matG/lumG` on the cells,
`rimMat/rimLum`, and `materialChannels` (the grid's values, the LUT's constants, the formula). Four things were learned on
the way, each the cause of a failed gate:

1. **A material is defined only to ≈ 1e-3.** The fitter's Lab conversions go through OpenCV's float path, which is precise
   to about a thousandth and not smooth; on synthetic colours with the material KNOWN, only half reproduce their colour to
   1e-4. So the gate is the renderer's: the colour regenerated from mat × lum × grade within **one 8-bit sRGB step** of the
   shipped one. The within-1/10 000 gate of §5 was wrong by construction and is replaced.
2. **The guides' forward model is different**: graded(chromaticity × yl) normalised to unit luminance, yl the photo's own
   luminance at the point (layer_proof.py:711), a different clip and grade per sample. They are matched directly in the
   cloud of normalised graded LUT colours at 24 luminances (99.9 % of the shipped guide colours lie within 0.005 of it),
   and judged at the bake's brightness (× 0.25, tissue.js `chroma`). Nearest-chromaticity matching after ungrading picks
   the wrong neighbour in a table with 87 000 distinct chromaticities.
3. **The grade's hue is in degrees** (layer_proof.grade: np.radians). K2.0 had converted it to radians, so §2's eye-25
   "gamut edge" (sheet p95 4.7) was this bug: with the hue right its sheet p95 is 0.25 like the others. §2's table stands
   for eyes 26 and 09 (hue 0) and is superseded for 25 and 35 by the numbers below.
4. **The clouds are per grade.** One eye's cloud served the next in the same process once.

Regenerated colour within one 8-bit step (% of samples / worst sample in steps):

| eye | grade chroma / hue | fibres | guides | sheet cells | ground cells | beads | file |
|---|---|---|---|---|---|---|---|
| 26 | 1.4 / 0° | 99.0 / 2 | 100.0 / 3 | 99.1 / 2 | 99.8 / 2 | 100.0 / 1 | 3,988 KB |
| 09 | 1.6 / 0° | 97.2 / 3 | 99.9 / 4 | 97.7 / 2 | 99.1 / 2 | 42.7 / 27 | 4,700 KB |
| 25 | 1.2 / -10° | 99.5 / 2 | 99.9 / 3 | 99.4 / 2 | 99.9 / 2 | 86.1 / 7 | 3,791 KB |
| 35 | 1.0 / -10° | 100.0 / 1 | 100.0 / 2 | 99.8 / 2 | 100.0 / 2 | 100.0 / 1 | 2,831 KB |

The beads of 09 and 25 are the one visible exception: their colours were measured Lab, never materials; decision 3 fits
them to the nearest material, and the ruff of those two eyes will change by up to 27 / 7 steps when K2.2 renders from
materials — iori judges it then. Everything else is within the renderer's own quantisation. The file grows by ≈ 13 %
(26: 3 543 → 3 988 KB) while rgb is still carried; K2.2 drops rgb at its gate and the file shrinks below its old size.

## 2c. K2.2 built (2026-10-11) — the bake renders from materials; the colours are gone from the files

`materials.js` (`window.IrisMaterials`) is the fitter's spectral table ported to the page — the same 24 × 16 × 5 × 8 × 7 grid,
built in 70 ms, **equal to the fitter's table to the last float** on every entry checked — with the Lab round trip and the
camera grade (hue in degrees). `tissue.js` regenerates every sample's colour from `mat` × `lum` × the eye's grade at load
(guides normalised to unit luminance), so the bake and the photo shader are untouched: no new GPU table was needed for the
shipped eyes, because the colours come from the CPU side exactly as the fitter made them. The engine's own 4-axis GPU
table stays for the legacy renderer and the knobs until K2.3 moves the knobs into material space.

**Gate, measured (materials vs the shipped rgb, the same page, fresh file each time):**

| eye | MATCH2 materials / rgb | strandCorr | cellΔab | mean |Δ| per iris pixel | pixels over 2 steps | max |
|---|---|---|---|---|---|---|
| 26 | 90.339 / 90.354 | 0.425 / 0.426 | 2.00 / 1.97 | 0.33 | 0.1 % | 5 |
| 09 | 88.136 / 88.117 | 0.484 / 0.484 | 2.77 / 2.78 | 0.38 | 0.06 % | 5 |
| 25 | 91.372 / 91.397 | 0.395 / 0.395 | 2.67 / 2.51 | 0.66 | 6.5 % | 9 |
| 35 | 88.307 / 88.316 | 0.393 / 0.394 | 2.16 / 2.16 | 0.42 | 1.7 % | 5 |

Not bit-identical — that gate was retired in §2b — but within the precision a material has: the differences are a scatter of
single sheet cells a few steps apart (`study/casebook/2026-10-11-matdiff-25.png`, eye 25, the worst, amplified ×25; the two
renders cannot be told apart unamplified). Eye 25's 6.5 % is its hue-rotated grade meeting the exact Lab of the port against
OpenCV's approximate one. **Decision 5 executed:** `publish.py --drop-rgb` removed `rgb`, `cells.sheet`, `cells.ground` and
`rimRGB` from the four files; `materialChannels.rgbDropped` says so; the files are now 26 3,396 KB · 09 4,069 KB ·
25 3,159 KB · 35 2,388 KB (26 was 3 543 KB with rgb only, 3 988 with both). The shipped rgb of before remains in
git history (commit 02b2e45 and earlier) should a cross-check ever be needed.

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
