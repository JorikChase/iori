# 02 — Colour science of the human iris

*Part of the iris-engine study. This chapter explains where iris colour comes from, what has actually been measured, and reduces it to a two-layer shading model with a parameter set the engine can drive.*

---

## 1. Why irises have colour

The iris is a stack of five tissues. Only two of them matter for colour, and one of them matters for being black.

| Layer (front → back) | What it is | Role in colour |
|---|---|---|
| **Anterior border layer (ABL)** | A dense, ~10–20 µm sheet of melanocytes and fibroblasts lying flat on the stromal surface, with dendrites oriented parallel to the surface. Terminates at the pupillary ruff. | Primary absorber. Melanocytes in the ABL are "the first to influence iris colour when observed from outside". Thick and heavily pigmented in brown eyes; sparse and nearly pigment-free in blue eyes. |
| **Stroma** | Loose connective tissue: collagen fibrils, fibroblasts, some melanocytes, vessels. Bulk of the iris (~0.3–0.6 mm at the collarette). | Scatterer. Collagen fibrils smaller than visible wavelengths produce Rayleigh/Tyndall scattering: short wavelengths are returned preferentially. Also carries some melanin. |
| Sphincter / dilator muscle | Smooth muscle | None optically (buried in stroma) |
| **Posterior pigment epithelium (IPE)** | Two layers of cuboidal cells packed with large eumelanin melanosomes | Always near-black. Its pigmentation "does not vary between different iris colours" — it is equally dense in blue and brown eyes, and only fails in albinism, where the red fundus reflex shows through. |

The consequence is that **every iris is a dark backing plus a scattering layer plus a variable absorbing film**. Iris colour is not the colour of a pigment; it is the balance between (a) how much melanin sits in the ABL and stroma and (b) how much wavelength-selective scattering the stroma produces before light reaches the black IPE.

### 1.1 Melanin: eumelanin versus pheomelanin

Two chemical families of melanin coexist in the same melanosomes:

- **Eumelanin** — brown-black. Broadband absorber whose extinction rises monotonically toward the UV (≈ λ⁻³·³ in the widely used Jacques skin model). High-density eumelanin reads as neutral dark brown / black.
- **Pheomelanin** — yellow-red. Steeper spectral slope (≈ λ⁻⁴·⁷⁵ in the same model), absorbing blue much more strongly than red, so at moderate density it tints transmitted and back-scattered light toward yellow/amber.

What has been measured in irides:

- Prota et al. (1998), chemical degradation of donor irides: the IPE contains "essentially eumelanin"; the stroma + ABL contain both. **Green irides are pheomelanic-type**, blue–green mixed irides are mostly eumelanic, and green–brown and brown irides carry a mixed pigment. **Blue irides "invariably exhibited very low pigment content."**
- Wielgus & Sarna (2005), electron spin resonance on human irides: total melanin is "40 % higher in the brown group" than all other groups; melanin is "mostly eumelanin, and pheomelanin content was of the order of a few percent" by mass. (Pheomelanin is a few percent by mass yet visually dominant in light irides because there is so little eumelanin to hide it.)
- Wakamatsu et al. (2008), HPLC on cultured uveal melanocytes from 61 donor eyes: eumelanin and the eumelanin/pheomelanin ratio are significantly higher in dark brown and brown than in hazel, green, yellow-brown, blue (P < 0.0001). Pheomelanin content is roughly constant across colours; **eumelanin increases progressively with darkness.**
- Electron microscopy (Imesch et al. 1996) confirms melanocyte *number* is roughly constant (~66 % of stromal cells regardless of colour); what varies is melanosome number, size and melanin content per cell.

So the two intrinsic axes are **total melanin density in the ABL/stroma** (dominant) and **pheomelanin fraction** (secondary tint), with pheomelanin fraction highest in the green/hazel/amber middle of the range and lowest at both extremes (blue = almost nothing of either; dark brown = eumelanin-dominated).

### 1.2 Scattering in the stroma

With little melanin in front of it, the stroma behaves like a thin turbid slab over a black backing. Collagen fibrils and their spacing are sub-wavelength, so scattering is approximately Rayleigh (∝ λ⁻⁴): blue is returned ~2× more than green and ~3× more than red. Longer wavelengths penetrate and are absorbed by the IPE. This is the same physics as the sky and as the Tyndall blue of dilute milk. Grey irises are generally attributed to a stroma with more, or coarser, collagen — scattering that is less wavelength-selective (Mie-like), returning a paler, neutral light instead of blue.

### 1.3 The colour categories as points on two axes

Treat the visual categories as regions of a plane: **melanin density (ABL + stroma)** on the x-axis, **stroma scattering strength / wavelength selectivity** on the y-axis, with pheomelanin fraction as a tint modifier.

| Category | Melanin (ABL+stroma) | Stroma scattering | Pheomelanin fraction | What you see |
|---|---|---|---|---|
| Ice / pale blue | ~0 | strong, selective | — | Saturated Rayleigh blue over black |
| Blue | very low | moderate, selective | low | Blue, slightly darker |
| Grey | very low | strong, **neutral** (coarse fibres) | low | Desaturated pale slate |
| Blue-green | low | selective | high | Blue scatter + yellow pheomelanin tint = teal |
| Green | low–moderate | selective | high | Yellow filter over blue scatter → green |
| Hazel | moderate | reduced | medium–high | Brown core, green/gold periphery |
| Amber | moderate | weak | very high | Uniform gold / copper, no brown ring |
| Light brown | moderate–high | weak | medium | Warm brown, stroma texture visible |
| Brown | high | negligible | low | Eumelanin brown, low texture contrast |
| Dark brown | very high | negligible | very low | Near black; texture only in NIR / hard light |

---

## 2. Measured iris colour

### 2.1 Classification scales

There is still "no generally accepted iris colour classification scale" (Grigore & Avram 2015 review). The two useful modern schemes:

- **Mackey et al. (2011)** — nine categories built from the *distribution* of brown as much as its amount: (1) light blue, (2) darker blue, (3) blue with brown peripupillary ring, (4) green, (5) green with brown iris ring, (6) peripheral green / central brown, (7) brown with some peripheral green, (8) brown, (9) dark brown. Observers disagree "generally only by an adjacent category." This scale is worth copying as the engine's preset list: it encodes the radial gradient explicitly.
- **Franssen, Coppens & van den Berg (2008)** — a 24-photograph ordinal pigmentation ladder (1 = least, 24 = most pigmented), built for straylight studies; inter-observer variation 1.46 steps on 0–25.

Population base rates matter for defaults. In the Rotterdam Study (Dutch, n = 5,951; Liu et al. 2010): **blue 69.6 %, intermediate 7.4 %, brown 23.0 %.** In an Australian twin cohort (Sanfilippo et al. 2015) irides were lighter in southern (Tasmania/Victoria) than northern (Queensland) participants. Worldwide, brown dominates.

### 2.2 Quantitative colour statistics

Published colorimetry is thinner than one would like; most large studies quantified hue/saturation or CIELAB *for genetics*, and reported associations rather than category means. What exists:

**Liu et al. 2010 (Rotterdam Study, HSB from full-eye photographs)** — hue (H, degrees) and saturation (S, 0–1) of the iris region:

| Category | Hue mean ± SD (°) | Saturation mean ± SD |
|---|---|---|
| Blue | 34.9 ± 7.6 | 0.40 ± 0.13 |
| Intermediate | 32.2 ± 7.3 | 0.44 ± 0.14 |
| Brown | 32.3 ± 6.9 | 0.48 ± 0.15 |

Note the hue values sit in the orange sector (≈ 30°) even for blue eyes: full-iris averages under flash are dominated by the warm collarette, ruff and limbus, plus the flash colour. The lesson for the engine is that **mean pixel colour is not a good target; the radial structure is.** Their authors explicitly note the method cannot capture the "inner brown ring surrounding the pupil."

**Edwards et al. 2016 (CIELAB from high-resolution photographs, European / East Asian / South Asian)** — showed that CIELAB quantification exposes variation the categorical labels hide, and that HERC2 rs12913832 (the blue/brown SNP) also predicts **central heterochromia** in Europeans. The paper does not publish per-category Lab means in its abstract.

Given that, the table below is the engine's **working targets**: category centroids derived from the two-layer model in §4 (D65, diffuse illumination, ciliary zone, no specular), cross-checked against the qualitative literature. They are estimates, not measurements, and are stated here so the whole team tunes against one number set.

| Category | sRGB (ciliary zone) | Lab L* | a* | b* | Notes |
|---|---|---|---|---|---|
| Ice blue | 128, 140, 165 | 58 | +1 | −15 | b* should be pushed to −20…−25 with the saturation gain in §4.4 |
| Blue | 115, 124, 145 | 52 | +1 | −12 | |
| Grey | 133, 131, 131 | 55 | +1 | 0 | Neutral by construction |
| Blue-green | 113, 117, 121 | 49 | −1 | −3 | Hue lives on the a*/b* boundary; needs the gain |
| Green | 112, 110, 95 | 46 | −2 | +9 | Real greens reach a* −4…−6 |
| Hazel | 95, 84, 60 | 36 | +1 | +16 | Strong radial split (see §2.3) |
| Amber | 100, 87, 61 | 38 | +1 | +17 | Lightest of the brown family, most chromatic |
| Light brown | 87, 73, 52 | 32 | +2 | +15 | |
| Brown | 86, 70, 48 | 31 | +4 | +16 | |
| Dark brown | 81, 62, 44 | 28 | +5 | +14 | Approaches the IPE colour |

### 2.3 The radial gradient

Anatomically the iris has three concentric zones, and colour differs across them in almost every eye:

| Zone | Extent | Colour behaviour |
|---|---|---|
| **Pupillary ruff** | ~0.1 mm dark frill at the pupil edge | The anterior termination of the IPE: pure eumelanin, near-black with a warm cast, crenellated. Same colour in every eye. |
| **Pupillary zone** | pupil edge → collarette (~1.5 mm) | The iris is thinner here and the ABL denser; "typically darker than the surrounding, lighter-coloured ciliary zone." In light eyes this is where the brown of central heterochromia sits. |
| **Collarette** | ridge ~1.5 mm from pupil, thickest point (~0.6 mm) | Often a distinct tan/brown ring; the "tan collaret" of the Romanian skin-cancer phenotype study. Crypts open along it. |
| **Ciliary zone** | collarette → root | Thickest stroma → strongest scatter; where blue/green/grey are most saturated. Contraction furrows and Wölfflin nodules live here. |
| **Limbus / limbal ring** | outermost 0.3–0.8 mm | Dark annulus: the iris periphery is pigment-dense and the limbal cornea is less transparent, so light is lost. Darkest in youth, fades with age and with corneal arcus. |

Model output for a blue eye (§4) reproduces the ordering: pupillary zone (thinner stroma, d ≈ 0.6) sRGB ≈ 99,105,124 (L* 45); ciliary zone 115,124,145 (L* 52); limbus with heavy ABL melanin and thin stroma 77,61,44 (L* 27).

---

## 3. Heterochromia, spots and nodules

### 3.1 Heterochromia

| Form | Description | Frequency |
|---|---|---|
| **Central** | Brown/gold ring around the pupil in an otherwise blue, grey or green iris; ring outer radius typically at or just past the collarette (≈ 1.5–2.5 mm from pupil edge, i.e. inner 30–45 % of iris radius), often with spiky radial extensions along the stroma. | Common in light-eyed Europeans; no rigorous population figure. Mackey categories 3, 5 and 6 are all forms of it. Associated with HERC2 rs12913832 (Edwards 2016). Treat as a **default** for hazel and a frequent option for blue/green. |
| **Sectoral (partial)** | A wedge of the iris (often 1 to 3 clock-hours) a different colour, edges following radial fibre direction, not a clean line. | Rare; grouped with complete in population studies. |
| **Complete** | Two different-coloured eyes. | 0.063 % (7 of 11,111 yearbook portraits, Bicci et al. 2022; matches Stelzer's 1960s Vienna figure). An older study gave 0.256 % (F 0.37 %, M 0.16 %). |

### 3.2 Pigment spots (freckles) and nevi

From the Spanish cohorts of Grigore-Dumitru et al. 2025 (n = 1,303 general population and 1,014 genetic cohort):

| Lesion | Definition | Prevalence | Colour / size | Where |
|---|---|---|---|---|
| **Iris freckle** | Flat pigment spot < 2 mm, does not distort stroma | 46 % (general) to 66 % (older cohort); of the general cohort 23 % had 1–3, 14 % had 4–10, 10 % > 10 | Dark brown, sharp-edged, sometimes coalescing | Lower half strongly favoured: 40 % lower-temporal, 38 % lower-nasal, 11 % each upper quadrant |
| **Iris nevus** | Larger, raised, may distort crypts | 4.8 % (general) to 13.7 % | Brown to dark brown, 2–4 mm, sometimes with a paler halo | Same lower bias: 41 % lower-temporal, 35 % lower-nasal |

Both rise with age and are more frequent in **green** eyes (lowest in brown, where they are hidden), in females, and with a pigmented collarette. A broader literature range is freckles in 40–70 % of adults and nevi in 4–6 %. Freckle counts also track cutaneous freckling and sun exposure — an engine "age / sun-damage" slider should raise the freckle count.

### 3.3 Wölfflin nodules and Brushfield spots

Wölfflin nodules are "white or yellowish" mounds of condensed collagen "disposed in a circular pattern in the ciliary portion of the iris" — a ring of pale dots near the periphery. Prevalence in controls: 43 % of blue irides vs 3 % of brown under white light (13 % of brown under NIR, i.e. they are there but hidden by melanin). Broader estimates: 10–25 % of the population, 10–20 nodules per eye. Brushfield spots (Down syndrome) are the same tissue, larger and more central.

---

## 4. A shader-ready two-layer model

### 4.1 Structure

```
light ──► [ABL: absorbing melanin film, transmission T]
              ──► [stroma: scattering (Rayleigh + neutral) + melanin absorption, thickness d]
                        ──► [IPE: near-black backing, reflectance R_ipe]
```

Reflected radiance per channel c ∈ {R, G, B}:

```
R_total,c = (1 − T_c) · ρ_mel,c          +   T_c² · R_stroma,c
            └── ABL granules' own back-scatter    └── light that crossed the ABL twice
```

### 4.2 Constants (RGB approximation)

Use the sRGB primaries' dominant wavelengths λ_R = 611 nm, λ_G = 549 nm, λ_B = 464 nm, normalised at 550 nm.

| Term | Formula | R | G | B |
|---|---|---|---|---|
| Eumelanin absorption weight `a_eu` | (λ/550)⁻³·³³ | 0.70 | 1.01 | 1.76 |
| Pheomelanin absorption weight `a_ph` | (λ/550)⁻⁴·⁷⁵ | 0.61 | 1.01 | 2.24 |
| Rayleigh scatter weight `ray` | (550/λ)⁴ | 0.66 | 1.01 | 1.97 |
| IPE reflectance `R_ipe` | constant | 0.045 | 0.030 | 0.020 |
| Eumelanin granule albedo `ρ_eu` | constant | 0.065 | 0.038 | 0.022 |
| Pheomelanin granule albedo `ρ_ph` | constant | 0.26 | 0.15 | 0.055 |

### 4.3 Equations

Inputs per texel: `Ma` (ABL melanin density), `Ms` (stromal melanin density), `Ds` (stroma scattering density), `mie` (0–1, fraction of neutral vs Rayleigh scatter), `pheo` (0–1 pheomelanin fraction), `d` (stroma thickness, 1 at ciliary zone).

```glsl
vec3 mel   = mix(a_eu, a_ph, pheo);                 // spectral shape of the melanin mix
vec3 sig_s = Ds * mix(ray, vec3(1.0), mie);         // scattering coefficient
vec3 sig_a = Ms * mel + 1e-4;                       // stromal absorption

// Kubelka–Munk slab over a backing of reflectance R_ipe
vec3 a    = 1.0 + sig_a / sig_s;
vec3 b    = sqrt(max(a*a - 1.0, 1e-6));
vec3 x    = b * sig_s * d;
vec3 coth = cosh(x) / sinh(x);                      // clamp x to ~30 first
vec3 R_stroma = (1.0 - R_ipe * (a - b*coth)) / (a - R_ipe + b*coth);

// anterior border layer
vec3 T     = exp(-Ma * mel);
vec3 rho   = mix(rho_eu, rho_ph, pheo);
vec3 albedo = (1.0 - T) * rho + T*T * R_stroma;     // linear RGB diffuse albedo
```

This is cheap (a few `exp`/`sinh` per texel, or bake to a texture at load). It reproduces: the Rayleigh limit (blue over black when `Ma, Ms → 0`), grey (`mie → 1`), green (Rayleigh blue seen through a pheomelanic yellow film), and the monotonic darkening through the browns because the granule albedo falls as the pigment becomes eumelanic.

### 4.4 Parameter → category table

Model output at D65, ciliary zone, `d = 1`:

| Category | Ma | Ms | Ds | mie | pheo | sRGB out | Lab |
|---|---|---|---|---|---|---|---|
| Ice blue | 0.00 | 0.00 | 0.32 | 0.15 | 0.10 | 128,140,165 | 58, +1, −15 |
| Blue | 0.02 | 0.02 | 0.24 | 0.15 | 0.10 | 115,124,145 | 52, +1, −12 |
| Grey | 0.03 | 0.03 | 0.30 | 0.85 | 0.10 | 133,131,131 | 55, +1, 0 |
| Blue-green | 0.10 | 0.10 | 0.26 | 0.10 | 0.70 | 113,117,121 | 49, −1, −3 |
| Green | 0.22 | 0.22 | 0.30 | 0.10 | 0.85 | 112,110,95 | 46, −2, +9 |
| Hazel | 0.50 | 0.40 | 0.20 | 0.25 | 0.60 | 95,84,60 | 36, +1, +16 |
| Amber | 0.80 | 0.50 | 0.12 | 0.30 | 0.95 | 100,87,61 | 38, +1, +17 |
| Light brown | 1.20 | 0.90 | 0.12 | 0.30 | 0.45 | 87,73,52 | 32, +2, +15 |
| Brown | 2.50 | 2.00 | 0.10 | 0.30 | 0.25 | 86,70,48 | 31, +4, +16 |
| Dark brown | 5.00 | 4.00 | 0.08 | 0.30 | 0.10 | 81,62,44 | 28, +5, +14 |

**Known limitation and the fix.** A three-band RGB Rayleigh term under-saturates: real blue irides reach b* −20 to −25 and greens a* −5, while the table stops at −15 and −2. Two options, in order of preference: (1) evaluate the model at 6–8 wavelengths and integrate against the CIE matching functions offline into a LUT indexed by (Ma, Ds, pheo); (2) expose a `rayleighExponent` (default 4, artist range 4–6) — raising it to ~5.5 puts the blue centroid at b* ≈ −22 with no other change. Ship option 2 first, replace with option 1 when the LUT pipeline exists.

### 4.5 Ruff and limbal ring

- **Pupillary ruff:** not part of the two-layer model — it is IPE tissue viewed directly. Render as a 0.05–0.12 mm crenellated band with albedo ≈ `R_ipe × 1.5` (sRGB ≈ 45,35,28), identical for all eye colours, slightly warmer in brown eyes because the ABL wraps over it.
- **Limbal ring:** drive with the same model by raising `Ma` to ≥ 3 and dropping `Ds` to ≤ 0.05 across the outer 8–15 % of iris radius (plus a corneal-limbus opacity term in the cornea shader, which is where the softness of its edge comes from). Output ≈ sRGB 77,61,44. Width and darkness fall with age.

---

## 5. How lighting changes perceived colour

Iris colour is unusually illumination-dependent because the two components — scattered blue and absorbed/transmitted warm — respond to different parts of the light field.

**Blue eyes go grey in flat light.** Rayleigh blue is a *directional* effect: it needs a bright, fairly collimated source entering the stroma so that the back-scattered short wavelengths dominate what returns. Under a broad overcast sky the whole iris is lit uniformly, the specular sheet on the cornea grows into a large low-contrast reflection of the sky, and the pupil dilates, shrinking the ciliary zone. The scattered blue is diluted by neutral surface reflection and the eye reads slate grey. In the model, the cool 7500 K illuminant barely changes chroma (13 → 15); it is the *added corneal reflection*, not the illuminant, that greys the eye. The engine must therefore render the corneal specular sheet with the real environment, not a point highlight, for this to happen naturally.

**Brown eyes go amber in backlight / low sun.** Eumelanin and pheomelanin transmit long wavelengths preferentially (`a_eu` R:B = 0.70:1.76; `a_ph` = 0.61:2.24). When light enters at grazing angles through the sclera and limbus or through the thin pupillary zone and is scattered back out after a long in-tissue path, the surviving light is strongly red-shifted. Low sun adds a warm illuminant on top: in the model, moving the illuminant from D65 to 3000 K shifts brown from Lab (31, +4, +16) to (27, +8, +23) — chroma 16 → 24, a visible move toward amber. Green eyes make the biggest jump (chroma 9 → 21, hue swinging to gold) because their pheomelanic film is exactly the filter that a warm source favours. Blue eyes under the same warm light lose their blue entirely (b* −12 → +7): Rayleigh scatter cannot return blue that was never there.

**Practical consequences for the engine:**
1. Colour must be computed *after* lighting, from the spectral-shape parameters, never from a baked RGB albedo.
2. The stroma needs a translucency / subsurface term so that light entering off-axis can exit forward-scattered and red-shifted; a single-hemisphere BRDF cannot produce the backlit amber glow.
3. The pupil-size-dependent zone remap (pupil 2–8 mm) changes the ciliary/pupillary area ratio and therefore the average colour; wire pupil dilation into the radial coordinate before sampling the parameter maps.

---

## 6. Implications for the engine

### 6.1 Parameter set

| Parameter | Type | Range | Meaning |
|---|---|---|---|
| `melaninABL` (Ma) | radial map × texture | 0–6 | Absorbing film density. Carries central-heterochromia ring, freckles, nevi, limbal ring. |
| `melaninStroma` (Ms) | radial map | 0–5 | Melanin inside the scattering layer. Usually ≈ 0.7 × Ma. |
| `pheomelaninRatio` | scalar (+ optional map) | 0–1 | Spectral shape of the melanin. Peaks in green/amber. |
| `stromaDensity` (Ds) | radial map × fibre texture | 0.05–0.35 | Scattering strength; fibre/crypt texture modulates it. Crypts → Ds ≈ 0 (see the IPE). |
| `stromaThickness` (d) | radial map | 0.4–1.2 | 0.6 at pupillary zone, 1.0 ciliary, tapering at the root. Contraction furrows are dips. |
| `mieFraction` | scalar | 0–1 | Neutral vs Rayleigh scatter. The grey control. |
| `rayleighExponent` | scalar | 4–6 | Saturation compensation for the RGB approximation (§4.4). |
| `ruffColor` | RGB | fixed default | Pupillary ruff albedo, sRGB ≈ 45,35,28. |
| `limbalDarkness` | scalar | 0–1 | Scales Ma up / Ds down over the outer 8–15 % of radius; also drives limbus opacity in the cornea. |
| `centralRing` | {radius 0.3–0.45, strength, softness, pheo} | | Central heterochromia; adds to Ma with radial spikes. |
| `freckleCount`, `nevusCount` | int | 0–20, 0–2 | Placed with a lower-hemisphere bias (~78 % below the horizontal). |
| `wolfflinCount` | int | 0–20 | Pale collagen nodules in a ciliary ring; visible only when Ma < 0.3. |

### 6.2 Defaults per eye colour

| Preset | Ma (ciliary) | Ms | pheo | Ds | mie | central ring | limbal | freckles | Wölfflin |
|---|---|---|---|---|---|---|---|---|---|
| Ice blue | 0.00 | 0.00 | 0.10 | 0.32 | 0.15 | off | 0.8 | 0–1 | 6 |
| Blue | 0.02 | 0.02 | 0.10 | 0.24 | 0.15 | 30 % chance, r 0.35, Ma +0.5 | 0.8 | 1 | 4 |
| Grey | 0.03 | 0.03 | 0.10 | 0.30 | 0.85 | 20 % | 0.7 | 1 | 4 |
| Blue-green | 0.10 | 0.10 | 0.70 | 0.26 | 0.10 | 50 %, r 0.35 | 0.7 | 2 | 2 |
| Green | 0.22 | 0.22 | 0.85 | 0.30 | 0.10 | 60 %, r 0.40, pheo 0.8 | 0.7 | 3 (highest) | 1 |
| Hazel | 0.50 | 0.40 | 0.60 | 0.20 | 0.25 | **on**, r 0.45, Ma +1.5 | 0.6 | 3 | 0 |
| Amber | 0.80 | 0.50 | 0.95 | 0.12 | 0.30 | off (uniform) | 0.5 | 1 | 0 |
| Light brown | 1.20 | 0.90 | 0.45 | 0.12 | 0.30 | off | 0.5 | 1 (hidden) | 0 |
| Brown | 2.50 | 2.00 | 0.25 | 0.10 | 0.30 | off | 0.6 | 1 (hidden) | 0 |
| Dark brown | 5.00 | 4.00 | 0.10 | 0.08 | 0.30 | off | 0.7 | 0 | 0 |

Radial multipliers applied to every preset: `Ma × 1.4` and `d × 0.6` in the pupillary zone; `Ma × 1.2` on the collarette ridge; `d × 1.0` ciliary; limbal band per `limbalDarkness`. Age slider: +freckles, −limbalDarkness, +Ma in the pupillary zone (the iris darkens slightly with age in light eyes).

### 6.3 What the next chapters need from this one

- Chapter 03 (structure / texture) should generate `stromaDensity` and `stromaThickness` maps — crypts, furrows, fibre bundles — as *physical* density fields, not colour, so that the same texture reads correctly under every preset.
- Chapter 04 (cornea / lighting) owns the corneal specular sheet and limbus opacity, both of which this chapter has shown are load-bearing for perceived colour.
- The RGB→spectral LUT (option 1 in §4.4) is the single highest-value follow-up for colour fidelity.

---

## Sources

- [Wielgus AR, Sarna T. Melanin in human irides of different color and age of donors. Pigment Cell Res 2005 (PubMed)](https://pubmed.ncbi.nlm.nih.gov/16280011/)
- [Prota G et al. Characterization of melanins in human irides and cultured uveal melanocytes from eyes of different colors. Exp Eye Res 1998 (PubMed)](https://pubmed.ncbi.nlm.nih.gov/9778410/)
- [Wakamatsu K et al. Characterization of melanin in human iridal and choroidal melanocytes from eyes with various colored irides. Pigment Cell Melanoma Res 2008](https://pubmed.ncbi.nlm.nih.gov/18353148/)
- [Imesch PD et al. Melanocytes and iris color: electron microscopic findings. Arch Ophthalmol 1996 (PDF)](https://rgangnon.org/publication/imesch-1996/imesch-1996.pdf)
- [Sturm RA, Larsson M. Genetics of human iris colour and patterns. Pigment Cell Melanoma Res 2009](https://onlinelibrary.wiley.com/doi/full/10.1111/j.1755-148x.2009.00606.x)
- [Liu F et al. Digital quantification of human eye color highlights genetic association of three new loci. PLoS Genet 2010 (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC2865509/)
- [Edwards M et al. Iris pigmentation as a quantitative trait: variation in populations of European, East Asian and South Asian ancestry. Pigment Cell Melanoma Res 2016](https://onlinelibrary.wiley.com/doi/10.1111/pcmr.12435)
- [Mackey DA et al. Classification of iris colour: review and refinement of a classification schema. Clin Exp Ophthalmol 2011](https://www.researchgate.net/publication/230207622_Classification_of_iris_colour_Review_and_refinement_of_a_classification_schema)
- [Franssen L, Coppens JE, van den Berg TJTP. Grading of iris color with an extended photographic reference set. J Optom 2008](https://www.journalofoptometry.org/en-grading-iris-color-with-an-articulo-resumen-S1888429608700608)
- [Grigore M, Avram A. Iris colour classification scales — then and now. Rom J Ophthalmol 2015 (PubMed)](https://pubmed.ncbi.nlm.nih.gov/27373112/)
- [Sanfilippo PG et al. Don't it make your brown eyes blue? A comparison of iris colour across latitude in Australian twins. Clin Exp Optom 2015](https://pubmed.ncbi.nlm.nih.gov/25251541/)
- [Iris pigmented lesions: unraveling the genetic basis of iris freckles and nevi (Spanish cohorts, 2025, PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12020957/)
- [Estimating the prevalence of heterochromia iridum from high-resolution digital yearbook portraits (2022, PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC9237578/)
- [Iris heterochromia: variations in form, age changes, sex dimorphism (1979, PubMed)](https://pubmed.ncbi.nlm.nih.gov/485098/)
- [Brushfield spots and Wölfflin nodules unveiled in dark irides using near-infrared light. Sci Rep 2018 (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC6303377/)
- [Edwards M et al. Analysis of iris surface features in populations of diverse ancestry. R Soc Open Sci 2016](https://royalsocietypublishing.org/doi/abs/10.1098/rsos.150424)
- [Anatomy of iris: topography and layers (Insight Ophthalmology)](https://theinsightophthalmology.com/eye-anatomy-and-physiology/iris-anatomy/)
- [Iris pigment epithelium (Wikipedia)](https://en.wikipedia.org/wiki/Iris_pigment_epithelium)
- [Limbal ring (Wikipedia)](https://en.wikipedia.org/wiki/Limbal_ring)
- [Estimation of molar absorptivities and pigment sizes for eumelanin and pheomelanin (J Chem Phys 2009)](https://pubs.aip.org/aip/jcp/article/131/18/181106/315200/Estimation-of-molar-absorptivities-and-pigment)
- [Your blue eyes aren't really blue (American Academy of Ophthalmology)](https://www.aao.org/eye-health/tips-prevention/your-blue-eyes-arent-really-blue)
- [Heterochromia — StatPearls (NCBI Bookshelf)](https://www.ncbi.nlm.nih.gov/books/NBK574499/)
