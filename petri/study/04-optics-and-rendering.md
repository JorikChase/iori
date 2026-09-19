# 04 — Optics and rendering

Scope: what the dish looks like, how each illumination mode forms an image, and how to render it from the presentation channels on WebGPU. Rung names follow chapter 03: R1 body 22 µm 2.5-D, G vein graph, R2 bricks 5.5 × 5.5 × 22 µm, R3 lens grid 0.5–1 µm, M micro agents. **[unverified]** = not confirmed against a source here; **[target]** = design value to be measured.

## 1. The physical object

### 1.1 Dish

| Item | Value | Note |
|---|---|---|
| Nominal sizes | 90 × 15 mm (EU), 100 × 15 mm (US); 90 × 16 and 90 × 20 also sold | catalogue values |
| Growth area, 90 mm | 58 cm² → inner Ø ≈ 86 mm | Nunc listing |
| Sterilin "90 mm" height | 15.9 mm | Thermo listing |
| Material, disposable | injection-moulded crystal polystyrene, n ≈ 1.59, F0 = 5.2 % | wall ≈ 0.8–1 mm **[unverified]** |
| Material, reusable | borosilicate (n ≈ 1.47, F0 = 3.6 %) or soda-lime (n ≈ 1.52, F0 = 4.3 %), wall ≈ 1.5–2 mm **[unverified]** | ground or fire-polished rim |
| Lid | loose, ≈ 3–4 mm larger Ø, skirt ≈ 7–8 mm **[unverified]**; vented lids rest on 3 small ribs **[unverified count]** | ribs leave an air gap |
| Stacking ring | raised annulus on lid top and base underside, 0.5–1.5 mm high and wide | patent range |
| Moulding marks | central gate vestige on the base, faint concentric mould-polish rings, moulded lot/cavity text near the rim **[unverified]** | only visible in dark-field / grazing light |

F0 = ((n − 1)/(n + 1))². Polystyrene scratches easily; scratches, dust fibres (10–30 µm wide, mm long) and fingerprints dominate an empty dish under dark-field.

### 1.2 Agar

- Fill: 20 mL / 58 cm² = **3.4 mm**; 25 mL = 4.3 mm; 15 mL = 2.6 mm. Use 3.5 mm as default, 2.5–4.5 mm as the range.
- Refractive index: 0.5 % agarose 1.334–1.3355; agar gel ≈ 1.3348–1.340 at 589 nm; 2 % ≈ 1.343 (water 1.333). Use **n = 1.337** for 1.5 % agar, F0 = 2.1 %.
- Haze: water agar is slightly turbid with a grey-straw tint; nutrient agars are amber. Model as μs ≈ 0.05–0.2 mm⁻¹, λ⁻⁴–λ⁻², absorption rising below 450 nm **[unverified magnitudes]**: 16–50 % single-scatter probability over 3.5 mm, which is why agar glows when edge-lit.
- Meniscus: capillary length of water √(γ/ρg) = 2.7 mm. Rise at the wall h = √(2(1 − sin θc)) · 2.7 mm: ≈ 3 mm on clean glass (θc ≈ 20°), 0.2–1.5 mm on polystyrene **[unverified]**, decaying as exp(−r/2.7 mm). It is a ring-shaped negative lens: a bright or dark band 2–5 mm wide at the wall in every transmitted-light photograph. Old plates shrink away from the wall (air gap, total-internal-reflection line).
- Surface: optically smooth, wet; pour ripples and bubbles (0.2–2 mm) near the wall; oat flakes (Physarum food) are opaque, strongly scattering props 3–8 mm across.
- Condensation on the lid: breath-figure droplets, 0.05–2 mm Ø, each a lenslet. Offer "lid on" only for the macro beauty view.
- Writing: marker on the *underside of the base*: mirrored from above, ≈ 4.5 mm below the agar surface, so out of focus above 1×. Near-opaque absorber with a bronze sheen in reflection.

### 1.3 How plates are photographed

| Rig | Geometry | Reveals | Hides / artefacts |
|---|---|---|---|
| Black background + low-angle ring/side light (dark-field macro) | light at 5–30° elevation, or upward through the agar at an angle that misses the lens; matte black below | everything that scatters, white on black: thin films, vein edges, slime trails, dust, scratches | pigment colour desaturated; every dish defect glows |
| Diffuse tent / light box from above, black or white card | LED strip behind fabric diffuser (one published rig: 6000 K, 26 cm cube) | true surface colour, colony relief as soft shading, no glare | low contrast for thin transparent growth |
| Transmitted light box (brightfield macro) | uniform diffuser below, camera above | absorption: pigment density, thickness map, the network as a dark-yellow graph on white | meniscus band, condensation, dust on both surfaces; thin colourless film invisible |
| Flatbed scanner time-lapse (ScanLag-type arrays) | plates on the glass, scan every 10–20 min; 1200 dpi = **21.2 µm/px**, i.e. exactly the R1 grid | perfectly repeatable geometry and exposure, quasi-orthographic | line-scan look, reflections of the lamp bar in the meniscus, no oblique relief |

Domed colonies and veins act as small lenses: grazing light keeps their glints out of the camera, a high lamp produces glare and halo. Consequence: three macro lighting presets (dark-field ring, diffuse top, transmitted box) plus an orthographic, flat-lit "scanner" REF preset, the natural harness ground truth since 1 px = 1 R1 cell.

## 2. Image formation per illumination mode

Common inputs per pixel column (microscope objectives are object-side telecentric, so primary rays are parallel to z and the "ray march" is a column walk): thickness t(x,y,z-range), density ρ, material m, age a, activity/flow **u**, particle set M. Derived per-slice quantities:

- absorbance A_b = Σ_m ε_m,b · c_m · Δz for spectral band b (§6);
- optical path length OPL = Σ (n_m − n_medium) · Δz. Cytosol n = 1.36–1.39 against water 1.333 gives **Δn = 0.02–0.04** (up to 0.05); Nikon's worked example: 5 µm cell, Δn 0.025 → OPD 0.125 µm ≈ λ/4;
- scatter coefficient μs from ρ, particle density and |∇n|.

### 2.1 Transmitted brightfield

I_b(x) = L_b · Π_z [ exp(−A_b(z)) ⊛ PSF_b(z − z_f) ](x). Absorption commutes, so no sorting is needed; blur each slice's transmittance by its defocus kernel (§3.2) then multiply.

Pigment: the yellow plasmodial pigments (physarochrome A and related polyenes; four to eight components by chromatography) absorb in the near-UV/violet–blue. Reported extract maxima ≈ **385 nm (alkaline) and ≈ 415 nm (acid)**, HPLC monitored at 382 nm, so the visible colour comes from the long-wavelength flank of the band reaching to ≈ 500 nm. Note the photo-avoidance action spectrum (peaks ≈ 370 and 460 nm, flavin-like) is *not* the pigment spectrum, and a white mutant keeps its photoresponses. Model: Gaussian band centred 400 ± 15 nm, FWHM ≈ 90 nm **[unverified shape]**, plus a UV edge; peak μa ≈ 40 mm⁻¹ **[target, tune to photographs]**, giving T(415 nm) ≈ 0.69 for a 10 µm sheet and 0.025 for a 100 µm vein (0.84 and 0.18 at 450 nm). Add non-pigment scattering loss μs ≈ 10–30 mm⁻¹ **[unverified]** so thick veins go brown-grey rather than pure saturated yellow. Hue shift with thickness (pale lemon → yellow → orange-brown) comes free from spectral Beer–Lambert and is wrong in 3-channel RGB (§6).

### 2.2 Dark-field / oblique

Only scattered light enters the objective. I_b = L_b · Σ_z T_in · T_out · [ k_e · |∇_xy OPL|² + k_p · ρ_particles · σ_p,b + k_h · μs,agar,b ] ⊛ PSF(z − z_f), with σ_p,b ∝ λ^−k (k ≈ 1–2 for 0.3–1 µm granules, 4 for agar haze). Vein edges, slime sheath, granules, dust and scratches light up; flat interiors are black. For one-sided oblique light replace |∇OPL|² by max(0, ∇OPL · **l**)², giving raking-light relief.

### 2.3 Phase contrast

The phase ring attenuates the undiffracted (surround) wave to amplitude a (ring transmittance 10–30 % → a ≈ 0.3–0.55) and shifts it ±90°. The ring has finite width, so the specimen wave's lowest spatial frequencies also pass through it and count as surround. Cheap formulation on the in-focus φ = 2π · OPL / λ_b:

1. φ_lo = G_σ ⊛ φ (Gaussian, or the larger Airy of Yin et al.'s "obscured Airy" kernel), σ ≈ 4–12 µm at the specimen, scaled ∝ 1/NA;
2. field = a · e^{∓iπ/2} · e^{iφ_lo} + (e^{iφ} − e^{iφ_lo});
3. I = |field|² / a² · L_b. Weak-phase limit, positive contrast: I/L ≈ (1 − φ_hi/a)², φ_hi = φ − φ_lo.

This is one separable blur on an R16F OPL target (two passes, or a mip lookup) and produces both artefacts for free: **halo** (φ_hi < 0 just outside an edge → bright rim) and **shade-off** (φ_hi → 0 in the middle of wide uniform areas, which fade to background). The complex form in step 2 also reproduces contrast reversal when OPL > λ/2: a 100 µm vein (OPL ≈ 3 µm ≈ 5.5 λ) is a halo-dominated mess, as in life. Phase contrast suits the thin advancing sheet, hyphae, spores and bacteria; veins want brightfield, DIC or dark-field. The annulus fixes the illumination aperture, so the aperture ring is disabled in this mode.

### 2.4 DIC

I_b = L_b · sin²( ½ [ (2π/λ_b) · (OPL(**x** + ½s·**d**) − OPL(**x** − ½s·**d**)) + β ] ), shear s ≈ 0.5 × lateral resolution (0.15–1.5 µm across the turret), shear azimuth **d** at 45°, bias β = π/10 … π/2 (UI: a "bias" trim; β = 0 gives dark-field-like DIC). Two texture taps. DIC runs at full condenser aperture, so it sections optically: weight the OPL integral by a window of ≈ ±1 DOF around z_f instead of summing the whole column. The relief is a gradient, not height: do not reuse the macro normal map. With large OPL the per-band sin² yields real DIC's interference colours for free.

### 2.5 Epi-fluorescence

E_b = Φ · em_b · Σ_z c_label(z) · X(z) ⊛ PSF(z − z_f), where c_label is any sim channel mapped to a fluorophore (chapter 06: FL sub-wheel) and X is excitation irradiance (uniform in widefield). No sectioning: the whole slab contributes as defocused haze, which *is* the widefield look. Black background, additive accumulation, photon-starved: apply Poisson noise at 10–500 e⁻ peak. Bloom 3–5 %, halation on. Optional gag: bleaching dc/dt = −k · X · c, half-life 10–60 s, in an R3-sized u8 texture, recovering when the shutter closes (deliberately non-physical).

### 2.6 Reflected macro lighting

- Wet surface: GGX, n = 1.337 (F0 = 2.1 %), roughness 0.04–0.12 for agar and fresh slime, 0.3–0.5 for dried sheath (driven by age). Apply Toksvig-style roughness widening from normal variance inside the pixel footprint, otherwise highlights sparkle during zoom.
- Agar body: mean free path ≈ 5–20 mm, so the gel is a light guide. Cheap: irradiance blurred in screen space at 2–5 mm × exp(−σ_t · path), plus wall-light injection for the dark-field preset.
- Plasmodium: thickness translucency (back-light term · exp(−A_b · t)), so thin fans glow yellow and thick veins are dense; diffuse albedo from the same pigment spectrum.
- Shadows: relief is 0.05–0.5 mm, so shadows only exist under grazing light (10° elevation: a 0.3 mm vein throws 1.7 mm). One heightfield cone-march toward the light on the R1 height mip chain, 8–16 steps.

## 3. Objectives and what they imply

### 3.1 Table

λ = 550 nm; lateral resolution r = 0.61 λ/NA; total depth of field d = λ·n/NA² + n·e/(M·NA) with detector element e = 6.5 µm; field = FN/M for FN 22 (FN 18 in brackets); the inscribed 16:9 frame is 0.87 × field wide. Working distances are typical, vendor-dependent **[unverified]**; verified anchors: Olympus ACH 10×/0.25 = 6.1 mm, Plan Apo 100×/1.40 oil = 0.10 mm, Nikon Plan Apo λ 4×/0.20 = 20 mm, 20×/0.75 = 1.0 mm, 40×/0.95 = 0.21 mm.

| Rung | NA | r (µm) | DOF (µm) | Field Ø (mm) | µm/px at 1920 | WD (mm) |
|---|---|---|---|---|---|---|
| 0.25× macro, f/8, 36 mm sensor | 0.0125 (eff.) | 27 | ≈ 9600 | 144 × 96 frame | 50 | 300–500 |
| 1× macro, f/8 (eff. f/16) | 0.031 | 10.7 | ≈ 960 | 36 × 24 frame | 18.8 | 100–150 |
| 4× | 0.10 | 3.4 | 71 (55 + 16) | 5.5 (4.5) | 2.5 | 17–30 |
| 10× | 0.25 | 1.34 | 11.4 (8.8 + 2.6) | 2.2 (1.8) | 1.0 | 6–10 |
| 20× | 0.40 | 0.84 | 4.2 | 1.1 (0.9) | 0.5 | 1–4 |
| 40× | 0.65 | 0.52 | 1.55 (1.30 + 0.25) | 0.55 (0.45) | 0.25 | 0.5–0.65 |
| 100× oil (n = 1.515) | 1.25 | 0.27 | 0.61 (0.53 + 0.08) | 0.22 (0.18) | 0.10 | 0.13–0.23 |

Macro DOF = 2·N·c·(1 + m)/m², c = 0.03 mm. MicroscopyU's table gives 55.5 / 8.5 / 5.8 / 1.0 / 0.19 µm for 4×/0.10, 10×/0.25, 20×/0.40, 40×/0.65, 100×/0.95, consistent with the above.

Readings for the engine:

- The whole-dish view resolves 27 µm at 50 µm/px: R1 suffices and the slab is entirely in focus. No DOF, no march.
- At 100× one R3 voxel (0.5–1 µm) spans 5–10 px while the optical resolution is 2.7 px. The ≈ 2–4× gap between the finest rung and the diffraction limit is filled by M agents and procedural detail (§5.6), then softened by the PSF, a physically justified low-pass.
- At 40× the DOF (1.5 µm) is 1/30–1/300 of a vein's thickness. **Focus is a real axis of interaction**: racking focus walks through the sheath, the ectoplasm wall, the streaming lumen and down to the agar.

### 3.2 Defocus through the slab

Geometric blur diameter in object space: c(Δz) = 2 · |Δz| · tan(asin(NA / n_s)), n_s ≈ 1.34. 4×: 0.15·Δz; 10×: 0.38·Δz; 40×: 1.11·Δz; 100×/1.25: ≈ 5·Δz. A granule 10 µm off focus at 40× is an 11 µm disk = 44 px. Final kernel radius = √(r_airy² + (c/2)²). A dry objective focusing into gel moves its focal plane ≈ 1.34 × the stage travel; the focus read-out should show specimen micrometres. Data consequence: R2's 22 µm z-voxels cannot serve a 1.5 µm DOF, so R3's 16 z-levels (8–16 µm) must be a window that tracks z_f; content outside it is ≥ 8 µm defocused (≥ 9 µm blur at 40×), where R2 and analytic G tubes are adequate.

Renderer form (focal-stack compositing): image = ⊗_z [slice_z ⊛ K(c(z − z_f))] where ⊗ is multiply for transmittance and add for OPL, emission and scatter. Slices are spaced ≤ DOF/2 within ± 3 DOF and geometrically coarser outside; each slice is fetched from the mip whose texel ≈ c, so a blurred slice costs one trilinear tap (or 4–8 taps on a ring for shaped bokeh).

### 3.3 Lens character (all parameters, all REF-off except where noted)

| Trait | Model | Numbers |
|---|---|---|
| Condenser aperture ("aperture ring") | S = NA_cond/NA_obj ∈ [0.2, 1]; resolution 1.22 λ/(NA_obj(1 + S)); kernel coherence 1 − S; illumination ∝ S² (auto-exposure compensates) | optimum S ≈ 0.7–0.8; S → 0.3 raises contrast and apparent DOF, adds diffraction rings round dust; **REF fixes S = 0.75** |
| Out-of-focus granules | kernel = mix(soft disk, edge-bright disk + 1–2 Fresnel rings, 1 − S); in phase contrast, sign of φ_hi contribution flips with sign of Δz (dark in focus, bright just above, Becke-line-like) **[cheat]** | ring contrast 10–30 % |
| Köhler vs critical | Köhler: uniform field, field stop sharp when condenser focused. Critical (gag): LED die / filament pattern multiplied into L at low contrast | 3–8 % |
| Field curvature | z_f(r) = z_f0 + κ r²; plan objectives κ ≈ 0; achromat edge defocus ≈ 2–4 DOF **[unverified]** | slider "plan ↔ vintage" |
| Vignetting | cos⁴-like × illumination fall-off | 10–25 % corners; flat-fielded in REF |
| Lateral CA | per-band magnification | ± 0.05–0.15 % at field edge = 0.5–1.5 px |
| Axial CA | per-band z_f offset | achromat blue/red ≈ 1–2 DOF apart **[unverified]**; apochromat ≈ 0 |

## 4. Camera and film pipeline

Order: spectral radiance → sensor RGB (or XYZ) → exposure → noise → halation/bloom → white balance → tone map → grain → display encode.

- **Sensor noise.** Electrons S = exposure · QE; σ² = S + σ_r² + D·t. Typical CMOS: read noise 1–3 e⁻, full well ≈ 10 ke⁻ for a 3.45 µm pixel, so peak SNR ≈ 100:1 (40 dB) **[typical, unverified]**. Gaussian above 20 e⁻, true Poisson below (fluorescence needs it). Apply before white balance so blue is the noisy channel under tungsten, as in life.
- **Time-lapse flicker.** Per-frame gain g = 1 + AR(1) noise, σ ≈ 0.5–2 %, correlation 0.6; colour-temperature drift ± 50 K; optional focus drift as agar dries **[unverified rate]**. Off under `prefers-reduced-motion` (chapter 06).
- **Halation.** Highlights above a threshold, blurred at ≈ 50–150 µm on a 36 mm frame = 3–8 px at 1920, tint (1.0, 0.35, 0.1), 2–5 % mix. Strongest in dark-field and fluorescence.
- **Bloom / veiling glare.** Energy-conserving 5–6 level downsample chain, 2–4 % mix (the long tail of the lens PSF).
- **Grain.** Luminance-dependent (peak in mid-tones), 1–2 px at 1080p, blue layer coarsest, re-seeded per frame, ≤ 2–3 % luminance.
- **Anamorphic** (macro beauty only, default off; meaningless on a compound microscope): 2:1 oval bokeh, horizontal specular streaks, mild barrel distortion.
- **Tone mapping.** The hero colour is saturated yellow on white or black. ACES-style curves skew bright saturated colours; AgX (Blender's default since 4.0) takes them to white without the skew. Use an AgX-like transform for beauty; in brightfield hold paper white at ≈ 85–90 % display with a gentle shoulder. Output `rgba16float` canvas, `display-p3`, optionally `toneMapping: "extended"` (Chrome 129–131+, Safari 18+) so dark-field glints and fluorescence exceed SDR white.

| | REF capture | Beauty |
|---|---|---|
| Sample sequences | indexed by frame counter and dish seed; accumulation restarted per capture | free-running, temporal reuse |
| Noise, grain, flicker, halation, bloom, CA, curvature, vignetting, anamorphic, bleaching | off (vignetting flat-fielded) | on, per preset |
| Condenser S, exposure, white point | fixed (0.75, locked, D65) | user / auto |
| Output | linear scene-referred float, no tone curve, plus sidecar: objective, NA, z_f, µm/px, mode, bands, seed | display-referred |
| Guarantee | bit-repeatable on the same GPU/driver only; across machines compare with tolerance (max ΔE < 0.5 or PSNR > 50 dB) | none |

## 5. Real-time techniques for a thin slab on WebGPU

### 5.1 Choose the integrator by view

| View | Integrator | Why |
|---|---|---|
| Macro, camera near-vertical (dish subtends ≤ ± 8° at 350 mm) | none: shade R1 as a height field with per-column optical depth ρ·t; analytic vein tubes from G drawn as ribbons on top | slab is sub-pixel deep |
| Macro, tilted beauty camera | true slab march (§5.2) | parallax, rim, meniscus |
| 4×–100× | telecentric column walk = focal stack (§3.2) over R2/R3 z-levels + splatted M | rays ∥ z, no DDA required |
| Light/shadow rays (oblique, dark-field) | short hierarchical march | 8–16 steps |

### 5.2 Slab march

Entry = max-mip of R1 height (conservative), exit = agar bottom (z = −3.5 mm). Hierarchical DDA over three levels: R1 min/max-height mip pyramid (skips air; clear agar is integrated analytically in one step), the brick indirection table (176 µm footprint, per-column z-range + brick ids), then voxels. Because R2 voxels are 4× taller than wide, step in index space, not world space. Typical counts: 0 (macro top view), 16–32 (tilted macro), 8–16 z-slices at 4×–10×, 16–48 at 40×–100×. Jitter the start offset with spatio-temporal blue noise; accumulate with an exponential moving average (α = 0.1–0.2) while the camera is still, reset on focus, turret or pan changes. WebGPU notes: `rgba16float` blends and filters everywhere; `r32float` filtering and float32 blending are optional features; default `maxTextureDimension3D` is 2048 and `maxStorageBuffersPerShaderStage` 8, so bricks live in one atlas plus one indirection buffer; timestamp queries drive the quality governor.

Streaming is fast (shuttle flow ≈ 1 mm/s **[unverified]**): at 40× that is ≈ 4000 px/s, 60+ px per frame. Flowing particles therefore must not be temporally accumulated; they go in their own layer with analytic motion blur (splats stretched along **u** · shutter).

### 5.3 Deep-zoom re-rasterisation and transparency

Veins (G) are drawn as camera-facing ribbons with an analytic circular-segment thickness profile t(s) = 2√(R² − s²), which feeds absorbance and OPL exactly at any zoom. M agents are instanced quads with radius max(r_particle, c(Δz)/2) and opacity ∝ 1/area; splats larger than 32–64 px are diverted to half- and quarter-resolution haze targets.

Ordering is mostly avoidable: transmittance multiplies, OPL and fluorescence add, so brightfield, phase, DIC and FL need only additive float targets (optical depth per band, OPL, emission). Order matters only for reflected/dark-field with opaque occluders:

| Option | WebGPU feasibility | Verdict |
|---|---|---|
| Additive optical-depth / emission targets | trivial, 1–2 MRTs | **default** for BF/PH/DIC/FL |
| Weighted blended OIT (McGuire–Bavoil) | 2 targets (rgba16f accumulation + r8/r16f revealage), standard blending | default for DF and tilted macro; depth weights tuned to the 0–3 mm slab |
| Moment-based OIT (4 power moments, additive log-transmittance) | needs 2 geometry passes and float precision; rgba32f blending is an optional feature, rgba16f needs the quantisation-biased variant | `ultra`/`capture` option |
| Per-pixel linked lists (A-buffer) | possible: fragment-stage storage writes + WGSL atomics (sample implementations exist) | not recommended: unbounded memory, overflow artefacts are non-deterministic, poor fit for tile-based Apple GPUs |

### 5.4 Surface shading helpers

- Normals: Sobel on the height of the rung matching the footprint, blended across rungs with the §5.6 weights; micro-normal from procedural detail below R3.
- AO: horizon-based on the R1 height pyramid (4–8 directions × 4–6 steps) for macro; inside the slab, 3–5 cones through the density mip chain, 4–6 samples each.
- SSS: thickness-driven wrap + translucency and the mm-scale irradiance blur of §2.6.
- Ring-light reflection: evaluate the instrument's ring as an analytic annular area light: 1-D LUT over (angle between reflection vector and optical axis, roughness), modulated by cos(N·azimuth) for N discrete LEDs at low roughness. Veins then show the characteristic twin highlight lines, droplets show tiny rings of dots.
- Dish rim: rotationally symmetric, so bake a 1-D radial LUT (refraction offset, Fresnel, internal-reflection highlight, caustic annulus on the ground), caustic rotated by light azimuth. No ray-traced glass.

### 5.5 Dish defect layers

Two 2-D layers (base underside, lid) of seeded scratches, dust, marker strokes and droplets, each with its own Δz: blurred blobs at 10×, crisp at 1×.

### 5.6 LOD without popping

Drive everything by pixel footprint p (µm/px). Rung k with voxel v_k fades out and rung k+1 fades in as p goes from v_k down to v_k/3 (smoothstep in log p):

| Transition | p from → to (µm/px) | Field width at 1920 px |
|---|---|---|
| R1 22 µm → R2 5.5 µm | 22 → 7 | 42 → 13 mm |
| R2 → R3 1 µm | 5.5 → 1.8 | 10.5 → 3.5 mm (around 4×) |
| R3 → M + procedural | 1 → 0.33 | 1.9 → 0.63 mm (10× → 40×) |

Requirements: (1) restriction consistency: the mean of fine voxels equals the coarse value (chapter 03's "declared statistics"), or cross-fades change brightness; (2) where a brick or the lens grid is not yet resident, synthesise fine = coarse + zero-mean band-limited residual, amplitude from a per-material variance LUT, hashed on (dish seed, rung, integer world cell), cross-fading to real data over 0.25–0.5 s; (3) below R3, grain is a Poisson point process per world cell (mean = ρ · cell volume · number density), advected by the flow channel in two phase-staggered layers so it streams; (4) each octave fades out when its wavelength drops below 2–4 px. Same seed, same place, same grain.

## 6. Colour: spectral, small basis

Recommendation: **render in N spectral bands, not RGB.** Beer–Lambert exponentiates per wavelength, so thickness-dependent hue (the look of Physarum) is wrong in RGB; illuminants, DIC colours, CA and λ-dependent scattering become per-band parameters.

- Basis: equal-width bands over 400–700 nm. 8 bands (37.5 nm) for interactive tiers, 12 (25 nm) ultra, 16 (18.75 nm) capture, 3–4 for draft (RGB fitted to the 8-band result at t = 20 µm). Bands pack into 2–4 `rgba16float` targets. Put the first band edge at 400 nm: the pigment peak (385–415 nm) sits on the boundary, so the first two bands carry nearly all the absorption and deserve pre-integrated ε_b (band-averaged transmittance tables in t, not band-averaged ε, to avoid the same exponent error within a wide band).
- To display: X,Y,Z = Σ_b I_b · (x̄,ȳ,z̄)_b with CIE 1931 2° functions pre-integrated per band; Bradford adaptation to D65; matrix to Display-P3 or sRGB.
- Illuminants: tungsten-halogen 3200 K Planckian: power at 450 nm is 0.29 × that at 650 nm (3.4:1 red:blue), hence the amber unbalanced look; with a daylight-blue filter ≈ 5500 K. White LED: narrow blue pump ≈ 450 nm (FWHM ≈ 20–25 nm), dip ≈ 480 nm, broad phosphor hump 540–620 nm **[typical, unverified]**. The pump sits on the pigment's absorption flank, so LED light should render the yellow more saturated than filtered halogen (inference, check against photographs). Chapter 06's "theme = lamp" maps onto the illuminant spectrum.
- Agar tint: absorbance rising toward 400 nm, ≈ 0.02–0.05 per mm at 450 nm **[unverified]**; visible only through the full 3.5 mm or when edge-lit.
- Pigment shifts: the extract maximum moves 385 → 415 nm from alkali to acid (deeper orange when acidified); composition changes with culture age (eight HPLC components) and with light exposure. Model: band centre λ0 = 385 + 30 · acidity nm plus an age-driven broadening/browning term; old or sclerotising plasmodium goes orange-brown and matte. In-vivo values **[unverified]**.

## 7. Debug and scientific views

All views share the instrument camera, a scale bar and a cursor probe (all channels, rung, brick id), and work in REF.

| View | Encoding |
|---|---|
| Channel false colour | any channel; perceptually uniform maps (viridis/cividis), range sliders, histogram |
| XZ / YZ cross-section | vertical slice through the cursor with focus plane and DOF band; essential for a slab |
| Flow | LIC (16–32 steps over advected white noise, phase-animated) modulated by speed, plus arrow glyphs on a 32 px lattice |
| Oscillator phase | cyclic colour wheel: hue = phase, value = amplitude; legend wheel in the corner |
| Conductivity / tube radius | log10 scale over ≥ 6 decades (D ∝ r⁴), decade ticks |
| Graph overlay | G nodes/edges, width ∝ radius, colour ∝ flux or age, stable ids on hover |
| Brick occupancy | wireframe cells coloured by rung, residency age, byte cost; pending requests hatched |
| LOD weights | per-pixel rung blend weights as RGB; procedural-vs-simulated mask |
| Cost | march-step heat map, splat overdraw heat map, timestamp-query HUD per pass |
| Optics | OPL map, per-band transmittance, CoC map, PSF inset for the current objective/S |
| Hygiene | NaN/Inf in magenta, negative density in cyan, A/B wipe and ×10 difference against a stored REF frame |

## 8. What the renderer must do

1. One seeded dish object: base, wall, rim, meniscus, agar, defect layers, optional lid.
2. Six image-formation modes from the same column quantities (A_b, OPL, μs, emission).
3. 4×–100× as telecentric focal-stack compositing: real z_f, per-slice mip-blur, condenser S on the aperture ring.
4. 8 spectral bands by default, through CIE XYZ; the illuminant is a spectrum.
5. G veins as analytic ribbons, M agents as CoC-sized splats into additive targets; WBOIT only where order matters; streaming particles in a non-accumulated motion-blurred layer.
6. Footprint-driven rung cross-fades on restriction-consistent data; seeded, flow-advected, band-limited detail below R3.
7. A strict REF path and a separate beauty path (§4).
8. The §7 views, and a timestamp-driven governor that drops tier before dropping frames.

Budgets, Apple M3 Pro class, 1440p canvas; chapter 03 leaves 5–6 ms for rendering at `normal` alongside a ≈ 10 ms sim step. All times are **[target]** until measured.

| Tier | Internal scale | Slab march / z-slices | Accumulation (frames) | Spectral bands | DOF taps per slice | Light/AO steps | Max splats | Render target (ms) |
|---|---|---|---|---|---|---|---|---|
| draft | 0.5 | 8 | 1 (none) | 3 (fitted RGB) | 1 (mip) | 4 / off | 0.1 M | ≤ 3 |
| normal | 0.67 | 16 | 4–8 EMA | 8 | 1 (mip) | 8 / 4×4 | 0.5 M | 5–6 |
| fine | 1.0 | 32 | 8–16 EMA | 8 | 4 (ring) | 12 / 6×4 | 1 M | 10–12 (sim at half rate or 30 fps) |
| ultra | 1.0 | 48 | 16–32 | 12 | 8 (ring) | 16 / 8×6, MBOIT | 2 M | ≤ 33 (30 fps, sim throttled) |
| capture | 1.0–2.0 (supersampled) | 64–128 | 64–256, fixed sequence, restarted per frame | 16 | 16 | 32 / 8×8 | 4 M+ | 200–2000 per frame, offline |

Open uncertainties: in-vivo pigment spectrum and μa; agar μs and tint; polystyrene dish details; measured cost of the focal-stack compositor and of 8-band targets on Apple tile-based GPUs (8 bands at 1440p in f16 ≈ 59 MB per full-screen write).

## Sources

- Nunc 90 × 15 mm dish, 58 cm²: https://www.sigmaaldrich.com/US/en/product/sigma/z717223
- Sterilin 90 mm dish, 15.9 mm: https://www.thermofisher.com/order/catalog/product/101R20
- Stacking-ring dimensions (patent): https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11286450
- Agar/agarose refractive index: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC2912608/ ; https://www.researchgate.net/publication/51676939_Measurement_of_the_complex_refractive_index_of_tissue-mimicking_phantoms_and_biotissue_by_extended_differential_total_reflection_method
- Inexpensive plate-imaging apparatus (6000 K LED tent): https://pmc.ncbi.nlm.nih.gov/articles/PMC8278329/
- DishCam dark-field plate imager: https://www.biorxiv.org/content/10.64898/2026.07.14.738485v1.full.pdf
- Ring-light / low-angle plate lighting (patent): https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/9470624
- ScanLag scanner time-lapse: https://www.nature.com/articles/nmeth.1485 ; https://www.jove.com/v/51456/scanlag-high-throughput-quantification-of-colony-growth-and-lag-time
- Physarochrome A: https://www.sciencedirect.com/science/article/abs/pii/S0040403900963500
- Plasmodial pigments vs culture age (HPLC at 382 nm): https://cdnsciencepub.com/doi/pdf/10.1139/m87-037
- Pigmentation vs irradiation: https://www.pjoes.com/Plasmodial-Pigmentation-of-the-Acellular-Slime-Mould-Physarum-Polycephalum-in-Relation,87208,0,2.html
- Pigment maxima 385/415 nm (search-snippet level; full text not read): https://www.microbiologyresearch.org/content/journal/micro/10.1099/00221287-25-1-47 ; https://www.pnas.org/doi/pdf/10.1073/pnas.73.11.3896
- White mutant, blue-light receptor: https://www.pnas.org/content/78/2/1009
- Photo-avoidance action spectra: https://pubmed.ncbi.nlm.nih.gov/8931386/
- Depth of field formula and table: https://www.microscopyu.com/microscopy-basics/depth-of-field-and-depth-of-focus
- Objective NA / working distance table: https://evidentscientific.com/en/microscope-resource/knowledge-hub/anatomy/specifications
- Nikon Plan Apo λ working distances: https://www.spachoptics.com/products/nikon-cfi-plan-apo-lambda-d-4x-objective ; https://microscopecentral.com/products/nikon-plan-apo-lambda-20x-microscope-objective ; https://www.spachoptics.com/Nikon-CFI-Plan-Apo-Lambda-D-40x-Objective-p/nikon-mrd70470.htm
- Phase contrast, OPD example: https://www.microscopyu.com/techniques/phase-contrast/introduction-to-phase-contrast-microscopy
- Halo and shade-off: https://www.microscopyu.com/tutorials/shade-off-and-halo-phase-contrast-artifacts
- Phase-contrast imaging model (obscured Airy): https://www.sciencedirect.com/science/article/abs/pii/S1361841512000035
- DIC vs phase contrast: https://evidentscientific.com/en/microscope-resource/knowledge-hub/techniques/dic/dicphasecomparison
- Weighted blended OIT: http://jcgt.org/published/0002/02/09 ; http://casual-effects.blogspot.com/2014/03/weighted-blended-order-independent.html
- Moment-based OIT: https://momentsingraphics.de/I3D2018.html
- Per-pixel linked lists (Vulkan sample; WebGPU ports): https://docs.vulkan.org/samples/latest/samples/api/oit_linked_lists/README.html ; https://github.com/samdauwe/webgpu-native-examples
- WebGPU limits: https://webgpufundamentals.org/webgpu/lessons/webgpu-limits-and-features.html
- WebGPU HDR canvas: https://developer.chrome.com/blog/new-in-webgpu-129 ; https://github.com/ccameron-chromium/webgpu-hdr/blob/main/EXPLAINER.md
- AgX in Blender 4.0: https://developer.blender.org/docs/release_notes/4.0/color_management/
