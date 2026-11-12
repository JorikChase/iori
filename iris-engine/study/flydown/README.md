# Fly-down D0: experiments on eye close-ups (2026-11-11)

Phase D0 of `study/17-surface-detail.md`, the first item on iori's priority list. Everything here runs offline in
numpy and cv2 on the CPU. No engine file was changed. The only engine use was reading captures through the capture
rig, to get the "today" row.

## Files

| file | what |
|---|---|
| `rig.py` | The eye (native photo, seed, steering fields from the eye file) and the four algorithms, all evaluated pointwise at any zoom |
| `sheet.py` | Comparison sheets: rows are photo, today, A, B, C, D; columns are ×1, ×2, ×4, ×8, ×16 → `sheets/` |
| `measure.py` | The held-out-octave test (§2.7) → `measure/*.json` |
| `grow.py` | Growth sequences: GIF plus a 6-frame strip → `growth/` |
| `align_today.py` | Maps fit px to engine canvas px for the today captures |
| `today/NN-spot/x{1..16}.jpg` | Today's engine at the same crops (Tissue model, quality fine, windowed re-bake τ ≈ 1.4 µm), JPEG q92 |

Spots (native px):
- eye 26 crypt lip (1185, 1965)
- eye 26 flat sheet (1965, 705)
- eye 09 crypt field (2610, 1680)
- eye 35 wavy strands (1920, 600)

Rerun:

```
/usr/bin/python3 sheet.py 26 crypt-lip 1185 1965
```

It takes about 10 s per sheet.

## What the algorithms are

- **View composition.** view = base × exp(Σ octaves). The base is the photo with its finest band removed. The octaves
  sit at λ = 2 native px (9.3 µm on eye 26) and halve down to the **1 µm floor** (decision 4). Below the floor the
  view is soft magnification.
- **Fade.** Each octave fades from zero at 2 view px per period to full at 4. At ×1 the view is exactly the photo
  (decision 2: the photo's own finest band is replaced only once the synthesised one is resolved).
- **A (erosion).** A Johansen-style filter with phasor gullies.
  - The gully direction is the strand tangent, taken from the structure tensor of all traced curves (fibres, veins,
    guides, sfib, svein), with a radial fallback. On crypt walls it is the relief-proxy gradient instead. The relief
    proxy is built from the outlines, the wall width and the pit depth.
  - Each octave is re-steered by the slope of the octave above it.
  - Octave 0's phases are demodulated from the photo's residual.
- **B (mosaic).** Anisotropic Worley cells on a fixed lattice, stretched 1.6× along the strand. Octave 0's per-cell
  melanin is the photo's residual at the cell's feature point.
- **C (by-example).** Local self-example magnification in the style of Freedman & Fattal 2011. Each ×2 step copies
  the high band of the best-matching patch within ±4 px one scale up, with a class penalty.
- **D (cascade).** A where the anatomy has a direction or a slope (crypt, wall, coherent strands); B elsewhere.

## Measurements: the held-out octave (`measure/`)

**Method.** The photo is halved. The octave that the halving removes, exactly full − bicubic(halved), is the target.
- A and B **predict** the target from the halved eye through the hash lineage.
- A′ and B′ are seeded from the target itself. This is the shipping case: a seed field in the eye file (decision 1).
- C is what one self-example step adds over plain bicubic.
- N is isotropic noise, standing in for statistics like `ablTex`.

Each measurement uses a 400 × 400 native-px window, split into sheet and crypt regions.

| eye / spot | region | corr A · A′ · B · B′ · C · N | energy A′ · B′ · C (target 1) | directional share real · A′ · B′ · C | orientation error, median ° A′ · B′ · C |
|---|---|---|---|---|---|
| 26 crypt lip | sheet | .00 · .06 · .01 · **.20** · .04 · .00 | .95 · .92 · .67 | .14 · .47 · .18 · .15 | 42 · 31 · 22 |
| 26 crypt lip | crypt | .00 · .04 · .00 · **.21** · .04 · −.01 | .89 · .98 · .62 | .15 · .48 · .21 · .17 | 50 · 43 · 9 |
| 26 sheet | sheet | .00 · **.21** · .00 · **.22** · .03 · .00 | | .14 · .32 · .15 · .15 | 33 · 18 · 13 |
| 09 crypts | sheet | .00 · .06 · −.01 · **.22** · .02 · .00 | | .19 · .34 · .16 · .16 | 42 · 37 · 15 |
| 09 crypts | crypt | .00 · .07 · −.01 · **.26** · .01 · .00 | | .19 · .34 · .19 · .17 | 52 · 31 · 12 |
| 35 strands | sheet | .00 · .14 · .00 · **.20** · .08 · .00 | .92 · 1.08 · .49 | .20 · .32 · .20 · .17 | 21 · 6 · 7 |

Full numbers, including the A, B and N energies, are in `measure/*.json`. The table's energies are from the final
calibration.

**What this says.**
1. **Nothing predicts the hidden octave pixel for pixel.** A, B, C and N all have |corr| ≤ 0.08. The finest band is
   mostly grain: its directional share is only 0.13–0.20, in crypts as well as on the sheet. The correlation lost
   below the photograph cannot be invented. Only a seed taken from the photo brings it back.
2. **The seed works best as per-cell melanin (B′, 0.20–0.26 on every spot).** As stripe phases (A′) it gives only
   0.04–0.21. This favours the mosaic as the carrier of the noise seed. That is the brief's "consuming the noise",
   measured.
3. **The erosion filter is too directional at 9 µm.** Its directional share is 0.32–0.48 against a real 0.14–0.20,
   and its orientation disagrees with the real octave by 30–50° on eyes 26 and 09. Eye 35 is the exception at 7–21°,
   because its strands are traced densely. The curve-tensor tangent is right at 40 µm and wrong at 9 µm. Directional
   gullies belong at the coarser end and on crypt walls, not in the first sub-photo octave.
4. **By-example (C) matches directionality and orientation best** (directional share 0.15–0.17, orientation error
   7–22°). It adds only 0.5–0.67 of the octave's energy and no correlation. It is the most "photographic" look, and
   also the softest.
5. **Calibration.** The per-octave level follows the photo's measured spectral slope. The finest bands are flat or
   rising, which is grain; the slope is read from the coarsest pair, 0.73–0.85 per octave. The level is scaled per eye
   by the held-out octave's rms. After calibration, A′ and B′ energies are 0.9–1.1.

**What the pictures say** (the sheets, all four spots):
- Today's engine goes smooth from ×4. At **×16 it breaks into violet or grey blocks on every eye**: the windowed
  re-bake at a 93 × 105-texel window. That is an engine bug worth its own look; it is not part of this stretch.
- A reads as fur or straw on flat sheet.
- B reads as crisp polygons at ×8–×16. The cell walls are too graphic.
- C stays photographic but soft.
- D (A in crypts, B on the sheet) is the most anatomical of the four.

## Tentative direction (for iori to confirm on the sheets)

The proposal is a cascade with a changed split:
- **Mosaic (B, seeded per cell) for the first sub-photo octave everywhere.** It carries the seed and has the right
  isotropy.
- **Erosion gullies (A) only where the anatomy is coherent at that scale**: crypt walls, and dense traced fibres as
  on eye 35. They are weighted by measured coherence rather than by class.
- **By-example (C) kept as the texture "colour".** One option is to blend it in for the photographic softness. The
  other is to keep it as the fallback for decision 7.

Cell walls need softening.

## Growth (`growth/`)

- **Arrival time.** It is the anisotropic distance from the centre: along the tangent ×1, across ×3.5, plus a crypt
  crossing cost. The metric is frozen per pixel, so this is not a geodesic yet.
- **Sheet jitter.** On the sheet the jitter is per 12 µm cell, so the sheet prints in cells.
- **Octave order.** Octave k is born STAGGER after octave k−1, so the coarse octave always arrives before the fine.
- **Fade-in.** Each octave fades in over 18 % of the growth time.

## Performance

None of the brief's GPU numbers (pages per frame, cache size, time to sharp) can be measured offline. They belong to
the prototype (D3). The CPU reference costs are:

| step | eye 26, M3 Pro |
|---|---|
| A, 256² view | 0.20 s |
| B, 256² view | 0.10 s |
| C, all ×2 steps for one spot | ≈ 0.5 s |
| one sheet (30 tiles of 320²) | ≈ 10 s |
| eye load and steering fields | ≈ 4 s |

## Zoom viewer (`viewer/`, 2026-11-11)

`viewer/index.html`, served locally at `/iris-engine/study/flydown/viewer/`, is an interactive zoom from ×1 to ×32 on the four spots.

- **Tiles.** They are precomputed by `viewer/build.py`: 512² views at every half-octave, one stack per algorithm, 15 MB in all. The
  page draws the level at or below the current zoom, scaled up by at most √2, with the next level faded in over it.
- **Algorithms.** You can switch between the photo, today, A, B, C, D and **P**, the proposal above, now in `rig.alg_proposal`:
  - P is a seeded mosaic with soft walls (wall width 0.22, weight 0.45) everywhere.
  - P adds erosion only where the measured coherence is above about 0.45, or on the relief slope, at weight 0.8.
- **Controls.** L/R split with a draggable seam, the wheel and pinch to zoom, "fly down" from ×1 to ×32 in 9 s, and space to hold the photo.
- **Today's tiles** are cut from the ×1–×16 sheet captures, so below ×1.6 they sit on black.
- **Rebuild:** `/usr/bin/python3 viewer/build.py` takes about 4 min on the CPU. `--today` re-cuts only today's tiles.
