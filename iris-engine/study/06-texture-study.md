# 06 — Texture study of the reference set (measured 2026-09-12)

Measured by the STUDY tool in the fit panel (`fit.js: textureStats`) on all 38 benchable reference photos, unwrapped to polar space at 1024 × 128 with the bench's automatic alignment. Zones in tissue coordinate v (0 pupil edge, 1 limbus). Ridges = local maxima along the angular direction above the row mean, gaps = local minima below it. These numbers are the targets the fibre generator must hit; they replace tuning by eye.

## Fibre scale and contrast

| zone | contrast (std/mean), median and q1–q3 | fibre spacing, resolved photos | ridge L* | gap L* | ridge/gap | dark fraction |
|---|---|---|---|---|---|---|
| pupillary 0.05–0.35 | 0.31 (0.22–0.44) | 0.035 mm | 46 | 24 | 1.73 | 0.08 |
| ciliary 0.35–0.80 | 0.36 (0.23–0.46) | 0.054 mm | 49 | 24 | 1.88 | 0.12 |
| peripheral 0.80–0.95 | 0.37 (0.28–0.47) | 0.069 mm | 54 | 26 | 1.91 | 0.14 |

"Resolved photos" are the 15–18 macros where the dominant angular frequency is above 64 cycles per turn; whole-eye phone photos do not resolve strands and peak at low frequencies. Reading:

- **Strand spacing is 35–70 µm**, i.e. roughly 500 strands around the circumference in the ciliary zone (2π · 4 mm / 0.054 mm ≈ 470), finer near the pupil (radial furrows and Schwalbe folds) and coarser near the root. The current atlas has ~330 bundles plus a 96 / 210-cell field: too coarse by 2–4×.
- **Ridge/gap luminance ratio is ≈ 1.9 in L***, which is ≈ 3.5–4× in linear light (L* 49 → 0.18, L* 24 → 0.04). The current generator's stroma modulation gives ≈ 2× in linear. The gaps are *dark*: L* 24 is near the pigment-epithelium floor, so the gaps must expose the dark ground, not a lighter stroma.
- **Local contrast (std/mean) 0.31–0.37 in every zone**; the renders measure about 0.15. This is the single number that separates "felt" from "fibre".
- **12–14 % of the ciliary and peripheral area is dark** (below 0.6 of the row mean): crypts, gaps between bundles, contraction furrows.

## Colour of ridges versus gaps (ciliary zone, median Lab)

| category | n | ridge L*, a*, b* | gap L*, a*, b* | note |
|---|---|---|---|---|
| blue | 4 | 48, −2, −10 | 21, 1, −8 | ridges are neutral-blue, gaps dark blue |
| dark blue | 2 | 46, 5, −12 | 21, 5, −8 | |
| grey-blue | 3 | 54, −1, −1 | 21, 0, −2 | neutral ridges, dark neutral gaps |
| green | 6 | 53, −10, 31 | 26, −3, 23 | yellow-green ridges, warm dark gaps |
| hazel | 4 | 45, 8, 22 | 24, 8, 14 | |
| amber | 4 | 58, 10, 35 | 27, 11, 22 | |
| brown | 4 | 47, 22, 21 | 28, 21, 22 | ridge and gap share the hue; only L* differs |
| dark brown | 3 | 54, 10, 12 | 24, 17, 13 | |
| central heterochromia | 4 | 43, −3, 6 | 28, 2, 2 | |

Two conclusions for the material model:

1. **The chroma sits on the ridges, the gaps are dark and low-chroma.** In blue eyes the ridge is a *neutral* light blue (a* −2, b* −10) and the gap is dark with the same weak blue: the "blue" of a blue eye is mostly the *contrast* of pale strands over a dark ground, not a saturated pigment. In green and amber eyes the ridges carry b* +31…+35 while the gaps stay at b* +22: pheomelanin lives on the strands. The engine must therefore shade **two materials**, strand and gap, with their own melanin and scattering, rather than one blended albedo per texel.
2. **Brown eyes differ from light eyes by L* only** (ridge 47 / gap 28, same a*b*): a dense melanin film over everything, texture from relief and shadow. That is Texturing.xyz's "dense top layer" rule measured.

## What the renders measure against this

The bench renders (v34) sit at contrast ≈ 0.15, ridge/gap ≈ 1.3 in L*, strand spacing ≈ 0.12–0.25 mm. The generator changes that follow directly:

- strand field at 30–70 µm spacing (≈ 500 around), organised by the bundle objects as slow modulators, ridged profile, slight waviness (the measured angular spectra are broad, not a single line);
- two-material shading: strand (white-scattering, carries pheomelanin) and gap (dark ground, weak Rayleigh);
- contact shadow in the gaps and an anisotropic sheen along the strands to reach std/mean ≈ 0.35;
- crypt and gap coverage of 12–14 % in the ciliary zone.

Raw data: `iris-engine/ref/texture-study.json` (per photo, per zone). Re-run with STUDY after any alignment change.
