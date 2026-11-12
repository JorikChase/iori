# 17 — Fly down to the surface: detail below the photograph, a sparse progressive texture, a giant render, growth order

Research and design brief, written 2026-11-11 for a discussion with iori **before anything is built**. Nothing in the
engine was changed. The only things run were reads of the code and eye files, a literature search, and one pure-numpy
toy on synthetic data (0.2 s, §2.6). "UNVERIFIED" marks every claim not confirmed from a primary source. Code
citations: `shaders.js` keeps each shader as one JSON line (fs-bake line 6, fs-post 15, fs-photo 17), so
"fs-photo:356" means line 356 of that shader's source after splitting the string on newlines.

---

## Summary (one page)

**What exists.**
- The photographs resolve the iris at about **4.5–4.7 µm per pixel**. Eye 35 is about 5.6; only eye 26's 4.66 is
  stated in study/11, and the others are derived from each file's alignment.
- The tissue model's region bake has square texels of about **5.7–6 µm** (`tissue.js:645-649`). The legacy atlas
  texels are 4–18 µm.
- The finest content anywhere is the ABL speckle's **6 µm** octave, evaluated per pixel (`tissue.js:304-339`).
- study/00 §32.6 measured that **the model has no content below about 10 µm**: a 0.8 µm re-bake looks the same as the
  5.7 µm base.
- The wheel stops the camera at 20 mm, about **2.8 µm per screen pixel** on a 2× display (`engine.js:909` with the
  analytic footprint at fs-photo:359). The view crop reaches about 0.8 µm per pixel (`design.js:106`).
- Below roughly 6 µm per pixel, the picture is bilinear magnification of smooth fields.

**What the detail pass can be steered by.**
- Explicit strand curves in vector form, which give exact tangents at any scale: 896 deck fibres, 1552 sheet guides and
  620 streaks on eye 26.
- Crypt outlines (512 points each), the margin, the collarette harmonics and the beads.
- The relief, as height, crypt mask and slab top/bottom/coverage on the 6 µm region textures.
- Flow direction, coherence, phase and spacing on the 512 × 128 polar grid. That grid is about 25–74 µm by 31 µm per
  cell, and today it is only in the legacy section.
- Materials on 0.1 mm cells.
- The per-level orientation, amplitude and confidence fields planned in the v3 file are **unfilled** in all four eyes.

**Recommended detail algorithm (primary): an anatomy-steered procedural cascade.** It is pointwise, deterministic and
band-limited, with one octave per level. Each anatomical class gets its own operator:
- **Strands, deck fibres and bridges:** an erosion filter in the style of Johansen (2026), whose gully direction is the
  fitted strand tangent rather than the height gradient. This is phasor-like stripes that branch from octave to
  octave.
- **Crypt walls, collarette flanks and furrows:** the same filter steered by the fitted relief's gradient. This is real
  erosion behaviour, where the slope exists.
- **The sheet below about 9 µm:** a cellular (Worley) mosaic, because the measured sheet speckle at 3–9 µm has no
  direction (directional share 0.01). That mosaic is the ABL's fibroblasts and melanocytes.

The photo's residual noise is the seed. Offline, each seed cell's phases and weights are fitted to the photograph's
finest-band residual, so the first synthesised octave lines up with the photo's own grain and then refines downward.
Below the photo, the seeds descend by a hash lineage.

**Fallback:** by-example multiresolution synthesis in the manner of Lefebvre & Hoppe (2005, 2006), with exemplars cut
from the eye's own native photograph per class, steered by the flow (anisometric synthesis). It can be extended below
the photograph with an exemplar graph (Han et al. 2008).

**Recommended texture structure:** a software virtual texture in **polar tissue coordinates**, as a quadtree of
128 × 128 pages (120 payload texels plus a 4-texel gutter).
- The page table is a **clipmap of small page tables** centred on the raycast point, one per level.
- The physical cache is a 2-D atlas, filled by GPU passes, so there are no uploads.
- Pages are requested analytically from a coarse grid of CPU rays, not from GPU feedback.
- Detail is evaluated in Cartesian tissue millimetres with two-word integer lattices, so the polar seam and the pupil
  side cannot show and float precision does not limit depth.
- Persistence is OPFS, with pages compressed and keyed by eye, fit hash and algorithm version.

**Growth order:** pages are generated in order of an **anisotropic arrival time** from the raycast point, where the
metric makes travel along the strand field cheap and travel across it dear. Each texel (or each sheet cell, as a
whole) carries a birth time and fades in over about 150 ms. Detail runs out along the strands first, crosses between
them later, and reaches crypt floors last. It costs a few percent over plain centre-out order.

**The numbers that matter** (all estimates until phase D0/D3 measures them):

| | phone | laptop |
|---|---|---|
| pages generated per frame (2 ms of GPU) | ≈ 8, about 130 k texels | ≈ 32, about 0.5 M texels |
| page cache | **16 MB** (256 pages) | **64 MB** (1024 pages) |
| time to a sharp view after a fast fly-down, before growth pacing | **≈ 0.5 s** | **≈ 0.2 s** |
| far view (≥ 10 µm per pixel) | **bit-identical to today** by construction | same |

**Decisions that are iori's** (§6.4):
1. Whether per-point seeds derived from the photograph may ship in the eye file. This would be the first
   photo-derived per-point data shipped.
2. The scale below which today's picture may change; 6× zoom is where it first would.
3. Whether synthesised detail may carry height at walking scale.
4. What lies below the anatomy (about 10 nm and finer): self-similar continuation, or a floor.
5. The giant render's projection, and whether unvisited areas are generated for it.
6. Whether growth replays on every visit or is remembered.
7. The phone floor.

---

## 1. What exists

### 1.1 Geometry and coordinates

- **Polar parametrisation.** `atlasUV(ang, v) = (ang/2π + 0.5, v)` (fs-photo:288). The angle is taken around the
  decentred pupil, so the seam (u = 0 ≡ 1) lies at ±π.
- **The v axis.** `v = (r − rp)/annulus` (fs-photo:146-153). v = 0 is the pupil margin and v = 1 is the root circle
  at 6.0 mm (fs-photo:48). The limbus is an ellipse at v ≈ 0.93–0.96. Dilation remaps v by
  `pow(vlin, 1 + 0.35 (rp − rp0))` (fs-photo:284-287).
- **Tissue millimetres.** Both the bake and the tissue model use `rMM(v) = 2 + 4v` (fs-bake:38; tissue.js CURVE_VS:46).
  The annulus is 4 mm deep. The circumference runs from 12.6 mm at the pupil to 37.7 mm at the root, so polar texels
  are 3× wider at the root than at the margin. The pupil is a hole, not a pole: **there is no singularity**, only a
  3:1 anisotropy.
- **The seam.** Textures use hardware REPEAT on u. The bake's noises are periodic by construction (`pnoise` mod N; the
  circle embedding of `strandNoise`, fs-bake:122-131). Windows can straddle the seam (`tissue.js:2018-2035`).
- **ABL texture plane.** The per-pixel ABL texture runs on the Cartesian tissue plane r(cos θ, sin θ), which has no
  seam and no shear. This was learnt the hard way: the u × circumference(v) form drew radial streaks (study/11 §5.5,
  "a shear, mine").

### 1.2 Storage and sampling

| store | resolution | content | where |
|---|---|---|---|
| legacy atlas, 4 × RGBA16F MRT, mipmapped | draft 1024 × 256 · normal 2048 × 512 · fine/ultra/capture 4096 × 1024 | height, stroma, melanin, crypt · collarette, furrow, spot, nodule · pheo, yellow, gap melanin, gap stroma · occlusion, stroma thickness, cover | `engine.js:242-276`, fs-photo:188-191 |
| tissue region textures, RGBA16F, mips | square texels τ: 3 µm requested, about 5.7–6 µm for a full circle (6144 × 646 on eye 26); windowed re-bake at τ ≥ 1.2 µm (`T.bakeWindow`, `T.refocus`) | albedo (linear RGB, mask) · aux (height, coverZ, mask) · slab (top, bottom, coverage) | `tissue.js:28-34, 82, 182, 645-650, 1973-2046` |
| field grids | c 128 × 32 · f 256 × 64 · **p 512 × 128, fixed in mm at every quality** | flowDir, phaseC/S, place, placeSpacing, coherence, strandBright (p); melanin, yellow, pheo, stroma, gaps, height ±0.1 mm (f, as 256 × 64 u8 in the file) | `engine.js:45-56`; eye file `legacy` |
| eye file curves | vector | deck fibres 896 / 1616 / 994 / 198 (eyes 26 / 09 / 25 / 35): xy, w, r, z, zc, mat, lum · veins 1657 · sheet guides 1552 · sfib 620, svein 635 · bridges graph (85 bridges on 26) | study/15 §3; `eyefile.js:38-56` |
| structures | vector | margin (720 points), beads (67) with material and z, crypt outlines (84 × 512 points, rim, island), collarette {r, height, width, harm[]}, furrows | eye file `structures` |
| materials | 9242 cells of about 0.1 mm | mat 5 × u8 + lum for sheet and ground | eye file `materials/cells` |
| ABL texture spec | per eye | amp of 4 octaves (6/12/24/48 µm), exponent, gain, octVar | eye file `albedo.ablTex` |

- **Level of detail is analytic**, not from `fwidth()`, because jitter and lens samples would inflate the screen
  derivatives (fs-photo:356-362):
  `mmPerPx = (24·view.w/res.y)/100·(zoom + 3.5)/1.1`, `lod = clamp(log2(mmPerPx / min(texU, texV)), 0, 6)`.
  The tissue variant reads its regions at `lod + T.lodBias`, where `T.lodBias = log2((4/AH)/τ)`
  (`tissue.js:303, 650`).
- **This is important for the design.** The renderer already knows, per pixel and without derivatives, how many
  millimetres a pixel covers. The same quantity can choose a virtual-texture level and fade octaves, and it can do
  both on the CPU for request planning.

### 1.3 What the photograph resolves

- **Native resolutions.** Eyes 09, 25 and 26 are 3840 × 2773/2774; eye 35 is 3840 × 2560.
- **Microns per pixel.** Eye 26 is traced at its native resolution, 4.66 µm per pixel (study/11 §5.5, lines 918 and
  1283). Estimated from each file's alignment (limbus radius against limbus mm): 09 ≈ 4.7, 25 ≈ 4.6, 35 ≈ 5.6 µm per
  pixel. These are derived values, not stated anywhere.
- **Not shipped.** The photograph is **not read at render time**. It is used by the fitter, the scores and the
  overlay; the arrival path loads none (`tissue-ui.js:17-19, 47`). iori's founding rule is that no photo textures are
  stored or shipped (HANDOFF "What this is"). Anything the detail pass takes from the photograph must therefore be
  distilled offline into the eye file. This is decision 1.
- **What the finest band contains** (study/11 §5.5):

  | band | sheet directional share | crypt floor directional share |
  |---|---|---|
  | 3–9 µm | 0.01 | 0.11 |
  | 7–19 µm | 0.10 | 0.40 |
  | 14–37 µm | 0.43 | 0.67 |

  The strength of the sheet speckle scales as brightness^0.79 on eyes 26 and 35. That lies between shot noise (0.5)
  and a texture of constant relative contrast (1.0). Eyes 09 and 25 measure 0.05 and 0.19, which looks noise-like.
- **So the finest band is a mixture** of sensor grain and the ABL's own granularity, and one photograph cannot split
  the two. On the sheet it has no direction at all; in crypts it has some. This sets what "adhering to the anatomy"
  must mean below 9 µm (§2.5).

### 1.4 Where the close-up breaks down, approaching the surface

| scale (µm per screen px) | what happens | cause |
|---|---|---|
| 28 (the scored scale) to 9.4 (3×) | photographic; the sheet's band contrast is 100–108 % of the photo's | the ABL texture calibrated on the viewport (handoff 2026-09-28 §4) |
| 4.7 (6×) | viewport 3.3 · 5.4 · 7.2 against the photo's 3.6 · 5.9 · 7.8; the finest band is roughly right, edges slightly soft | colour chain widths: fibre colour σ 12 µm, compose ±14 µm, hole wall ±37 µm, rim 8 µm, sheet colour on 0.1 mm cells (study/11 §5.5) |
| 2.8 (wheel limit, `engine.js:909`) | the 6 µm octave becomes smooth blobs; strands are smooth domes about 60 µm across | lod clamps at 0, so 6 µm texels are magnified bilinearly; no content below 10 µm (study/00 §32.6) |
| 0.8 (view-crop limit, `design.js:106`) | "the same mush at more texels" | as above; a 0.8 µm window is a shade *softer* (Laplacian 0.699 vs 0.710) |
| a walk on the surface (µm altitude) | not reachable | orbit pitch ±0.375 rad (fs-photo:602-603), so no grazing view. The probe (`T.probe`, `tissue.js:1538-1609`) is a separate camera at 150 µm altitude by default, and the layered probe came out black once (capture-rig memory). The depth march resolution is about 3 µm (parallax) and about 0.3 µm (`hitIris` bisection). The normals use a ±1-texel difference and an ε of 0.01 mm |

- Float precision is not the first limit today. The ray tracer works in millimetres with highp floats, and float32's
  ulp near 6 mm is about 0.5 nm. **Content runs out three orders of magnitude before precision does.**
- **Tiled capture today.** `captureTiled(target)` (`engine.js:995-1024`) renders K × K tiles through `state.view` crops,
  48 accumulated frames each, then `readPixels` into a 2-D canvas of W·K × H·K, downloaded as a PNG. The canvas is
  `innerSize × min(DPR, 2)` with RGBA32F accumulation. The capture rig intercepts the download and POSTs it to
  `serve.py /save/shots`. Hi-res polar strips come from quarter `bakeWindow`s at τ 2.3 µm (about 15 000 × 1 600).
  Today's giant output is therefore bounded by the 2-D canvas (§5.4).

### 1.5 Per-texel steering quantities available, and at what resolution

| quantity | source | native resolution | quality for steering |
|---|---|---|---|
| strand tangent (exact) | deck fibres, sheet guides, sfib, bridges as polylines | vector; exact at any scale | best; needs a nearest-curve query (the region bake already rasterises nearest curves) |
| flow direction and coherence | legacy `flowDir`, `coherence` | 512 × 128 (≈ 25–74 × 31 µm) | smooth, everywhere; coherence doubles as a confidence |
| carrier phase and spacing | `phaseC/S`, `placeSpacing`, `place` | 512 × 128 | phase is cell-relative (HANDOFF gotcha) |
| layer / class | region masks; crypt outlines; terrain classes (ruff, pupillary, collarette, plateau, flank); slab coverage | about 6 µm (regions); vector (outlines) | good. terrain.js labels are a CPU raster in the fit frame and are not used at render time |
| depth / height | aux height, slab top and bottom, crypt depth (0.01 mm in the file, floors about 110 µm), z / zc per curve | 6 µm; per curve | good |
| slope / gradient | derivative of aux height | 6 µm | good on crypt walls and the collarette; zero on flats |
| material | mat 5 × u8 + lum per sample and per cell | 0.1 mm cells; per curve sample every 20 µm | coarse; hue should stay owned by materials |
| fine-band statistics | `ablTex` (4 octaves, exponent, octVar) | per eye | statistics only |
| per-level fields (orientation, spacing, phase, amplitude, confidence) | study/15 `levels[].fields` | planned 512 × 128 | **unfilled** (`filled: false`) on all four eyes |

**Conclusion for part 1.**
- **Direction:** exact from the curves and smooth from the 512 × 128 flow.
- **Class and depth:** at 6 µm.
- **Slope:** at 6 µm.
- **Point-wise grain:** none survives into the eye file. The only fine-scale information is statistical, and the
  photograph's own grain is not shipped.

---

## 2. Detail algorithms

### 2.1 Requirements, restated as tests

1. **Pointwise and deterministic.** Recomputing a tile gives the same bits. Neighbouring tiles agree. Each level only
   adds a band and never contradicts the coarser levels.
2. **Seedable.** The photograph's finest-band residual can set the first synthesised octave.
3. **Steerable.** It takes the fitted orientation, class and depth as constraints.
4. **Cheap enough** per texel on a phone in WebGL2.
5. **Scale behaviour.** It behaves sensibly over five or more orders of magnitude of zoom. 10 µm per pixel down to
   0.1 nm per pixel is 5 orders.
6. **Far view unchanged.** It leaves the far view exactly as it is: the detail is zero where the pixel footprint is
   coarser than its band, and it has zero mean at its parent's scale, so fading it in does not shift the tone.

### 2.2 Candidates

**Erosion by simulation.**
- **Sources.**
  - Musgrave, Kolb & Mace 1989, [SIGGRAPH](https://history.siggraph.org/?p=119354).
  - Mei, Decaudin & Hu 2007, [GPU virtual pipes](https://core.ac.uk/download/52631892.pdf).
  - Šťava et al. 2008, [interactive hydraulic erosion](https://www.cs.purdue.edu/homes/bbenes/papers/Stava08SCA.pdf).
  - Génevaux et al. 2013, [hydrology-based terrain](https://www.cs.purdue.edu/homes/bbenes/papers/Genevaux13ToG.pdf).
  - Cordonnier et al. 2016, [uplift and stream power](https://hal.archives-ouvertes.fr/hal-01262376).
  - Schott et al. 2023, [interactive stream-power erosion](https://h-schott.github.io/p/uplift).
  - Guérin et al. 2022, [gradient terrain authoring](https://diglib.eg.org/handle/10.1111/cgf14460).
- **Character.** These are iterative and nonlocal: water and sediment travel arbitrarily far. Šťava tiles a terrain,
  but its tiles are not independent of order.
- **Fails test 1.** A finer page would need to rerun a simulation that depends on everything upstream, and a revisit
  is only identical if the whole history replays.
- **Analogy.** It suits geology at kilometre scale. The iris has no water and no sediment; only its *look*
  (dendritic rills, flat floors, sharp crests) is what iori asks for.
- **Verdict:** use the look, not the simulation.

**Erosion as a filter** (pointwise "erosion noise").
- **Sources.**
  - iq's derivative noise, [morenoise](https://iquilezles.org/articles/morenoise) and
    [fbm](https://iquilezles.org/articles/fbm). Feeding the accumulated gradient back as a 1/(1+|∇|²) damping gives
    flat floors and rough slopes.
  - Clay John's "Eroded Terrain Noise" (Shadertoy MtGcWh, 2018).
  - Felix Westin's 2023 refinement (UNVERIFIED primary; known only through Johansen's post).
  - **Rune Skovbo Johansen 2026, [Fast and Gorgeous Erosion Filter](https://blog.runevision.com/2026/03/fast-and-gorgeous-erosion-filter.html)**
    (MPL-2.0, Shadertoys [wXcfWn](https://www.shadertoy.com/view/wXcfWn), [33cXW8](https://www.shadertoy.com/view/33cXW8)).
- **How Johansen's filter works.**
  - It runs over any height function that also supplies its gradient. Each point is evaluated in isolation.
  - Gullies are extruded sines aligned to the gradient. Each octave re-steers to the slope left by the previous one,
    which is why the gullies branch.
  - Cells are a Worley-like grid with a random pivot per cell, blended with the neighbours. The neighbourhood is
    about 3 × 3 (UNVERIFIED).
  - The "fade" variant keeps a constant stripe width and fades toward a target, instead of bulging valley floors.
- **Passes tests 1, 3, 4 and 5.** It is evaluated per octave, so it continues down indefinitely.
- **Its one problem for the iris:** on flat ground the gradient is zero, so nothing happens. The iris sheet is
  nearly flat, and its anatomy points along strands, not downhill.
- **The fix.** Replace the gradient by the anatomy's direction where the anatomy has one. That generalisation is the
  core of the recommendation (§2.5).

**Gabor noise and phasor noise.**
- **Sources.**
  - Lagae et al. 2009, [sparse Gabor convolution](https://dblp.org/rec/journals/tog/LagaeLDD09).
  - The 2010 [survey](https://diglib.eg.org/handle/10.2312/CGF.v29i8pp2579-2600).
  - Galerne et al. 2012, [Gabor noise by example](https://hal-univ-tlse3.archives-ouvertes.fr/INRIA/hal-00695670).
  - **Tricard et al. 2019, [procedural phasor noise](https://hal.archives-ouvertes.fr/hal-02118508/)**
    ([code](https://github.com/mfx-inria/phasornoise)).
- **Character.** Pointwise sparse convolution with per-cell hashed impulses, and per-point orientation and frequency.
  Phasor noise takes the *phase* of the Gabor sum and passes it through a profile. The result is high-contrast
  stripes with constant contrast, which is exactly a field of fibres.
- **Analytically band-limited**, so it passes test 6 by construction.
- **Cost.** 9 cells × K impulses per octave, about 27 kernel evaluations at K = 3, roughly 600–800 flops. This is an
  estimate.
- **Gabor noise by example** fits the kernel parameters to a Gaussian exemplar. That is the formal route for "the
  photo's noise seeds it".
- **The engine already uses a carrier.** `strandCarrier` in fs-bake:153-182 is a Gabor-style carrier per placement
  cell. Study/13 decision 2 says *the strands are a distorted Gabor at several heights on the polar*. Phasor noise
  is the natural sub-photo continuation of the engine's own strand model.

**Line integral convolution** ([Cabral & Leedom 1993](https://history.siggraph.org/?p=118741);
[FastLIC, Stalling & Hege 1995](https://opus4.kobv.de/opus4-zib/files/165/SC-94-37.pdf)).
- It convolves noise along streamlines. The legacy bake uses it (fs-bake:134-151).
- Per tile it needs a halo of the streamline length L. It is deterministic, but its cost grows with L and it does
  not refine across scales: a finer level's LIC is a different picture, not a refinement.
- **Verdict:** use it for visualising the field, not as the detail operator.

**Flow noise, curl noise, wavelet noise.**
- **Flow noise** ([Perlin & Neyret 2001](https://evasion.inrialpes.fr/Publications/2001/PN01)) rotates gradients and
  pseudo-advects small scales by large ones. The pseudo-advection is the useful idea: the fine octave is displaced by
  the coarse octave's flow, so fine structure *follows* coarse structure.
- **Curl noise** ([Bridson et al. 2007](https://www.dneg.com/wp-content/uploads/2022/11/2007.pdf)) is a pointwise,
  divergence-free field. It is a good *turbulence* source for warping the domain (study/13 §4's "turbulence"), not a
  texture.
- **Wavelet noise** ([Cook & DeRose 2005](https://graphics.pixar.com/library/WaveletNoise/paper.pdf)) is almost
  perfectly band-limited. It is the best isotropic octave if exact band-limiting matters more than cost (it uses a
  precomputed tile).
- All three are pointwise. None is anatomy-aware by itself.

**Cellular (Worley) noise** ([Worley 1996](https://cedric.cnam.fr/~cubaud/PROCEDURAL/worley.pdf)).
- Hashed feature points per cell, pointwise, with 9 cells per evaluation.
- An anisotropic metric (cells stretched along the flow) is a one-line change, though no primary source describes it
  (UNVERIFIED as published work).
- It is the right primitive for a **cell mosaic**: the ABL's fibroblasts and melanocyte clusters, 10–20 µm
  (study/01). The measured fact that the sheet's 3–9 µm band is 99 % isotropic says this is what the sheet should
  become below the photo, not stripes.

**Reaction-diffusion** ([Turk 1991](https://faculty.cc.gatech.edu/~turk/my_papers/reaction_diffusion.pdf);
[Witkin & Kass 1991](https://www.ri.cmu.edu/publications/reaction-diffusion-textures);
[Sanderson et al. 2006](https://www.sci.utah.edu/~allen/materials/Sanderson_JGT_2006.pdf);
biology: [Kondo & Miura 2010](https://doi.org/10.1126/science.1179047)).
- Anisotropic diffusion along an orientation field makes beautiful oriented labyrinths, and it is the accepted model
  of pigment patterning.
- It is a global iterative solve. Per tile it needs halos that grow with the iteration count, and it converges to
  different patterns from different histories.
- **Fails test 1** unless it is run to convergence on a halo and accepted as only approximately consistent.
- **Verdict:** it is a candidate for the *growth animation's look* (§4), not for the stored detail.

**Texture synthesis by example.**
- **Sources.**
  - **Lefebvre & Hoppe 2005, [parallel controllable synthesis](https://hhoppe.com/proj/paratexsyn/)**: infinite,
    deterministic, aperiodic, any window on the GPU. It is built from coordinate upsampling, jitter and correction
    per level, with a small halo of the coarser level. It also supports "synthesis magnification".
  - **Lefebvre & Hoppe 2006, [appearance-space synthesis](https://hhoppe.com/proj/apptexsyn/)**: adds *anisometric*
    synthesis steered by a Jacobian or orientation field.
  - Heitz & Neyret 2018, [histogram-preserving blending](https://hal.archives-ouvertes.fr/LJK/hal-01824773v1):
    3 fetches per pixel, stochastic textures only.
  - Kopf et al. 2007, [solid textures](https://johanneskopf.de/publications/solid): global optimisation.
  - Zhou et al. 2018, [adversarial expansion](https://arxiv.org/abs/1805.04487): one network per exemplar.
  - Henzler et al. 2020, [neural 3-D texture space](https://geometry.cs.ucl.ac.uk/projects/2020/neuraltexture):
    pointwise MLP over noise octaves.
  - Han, Risser, Ramamoorthi & Grinspun 2008, "Multiscale texture synthesis", ACM TOG 27(3). Exemplar *graphs* at
    different scales allow infinite zoom with consistent content across scales. Cited from memory; URL not checked
    in this pass (UNVERIFIED).
- **Lefebvre–Hoppe passes tests 1, 3 and 4.**
- **Its problem is the exemplar.** Below 4.66 µm there is none: the photo stops there, and the super-macro sectors in
  `ref-staging/` (1–2 µm per pixel) are quarantined, untrusted, and not this eye. Below the photograph it can only
  re-use the photograph's own patches at a smaller scale (self-similarity by assumption, Han 2008's graph).
- **And it ships photo pixels as exemplars.** Decision 1, more strongly than the primary.

**Super-resolution and generative zoom.**
- **Sources.**
  - [Real-ESRGAN](https://arxiv.org/abs/2107.10833).
  - [SR3](https://arxiv.org/abs/2104.07636).
  - [StableSR](https://iceclear.github.io/projects/stablesr). Naive tiling compounds seams; overlapping patches must
    be aggregated at every denoising step.
  - [Any-resolution GAN](https://github.com/chail/anyres-gan).
  - [Infinite Texture](https://arxiv.org/abs/2405.08210). Weak on strongly directional textures.
  - **[Generative Powers of Ten](https://powers-of-10.github.io)** (CVPR 2024). Samples a whole zoom stack jointly, so
    scales stay consistent, and can zoom into a real photograph.
  - [ControlNet](https://arxiv.org/abs/2302.05543). An orientation map would be a new condition to train.
- **Character.** Deterministic only with fixed seeds. Per tile only with step-wise aggregation. Consistent across
  levels only when levels are sampled jointly (Powers of Ten), which is the opposite of on-demand page generation.
  Seconds per tile on a server GPU; not a phone shader.
- **Verdict:** an *offline* oracle. It could produce exemplars or a reference image to judge the procedural cascade
  against. It cannot be the runtime.

**Growth models.**
- **Sources.** Space colonisation ([Runions et al. 2005](https://www.algorithmicbotany.org/papers/venation.sig2005.html),
  [2007](https://algorithmicbotany.org/papers/colonization.egwnp2007.html)); differential growth
  ([inconvergent](https://inconvergent.net/generative); algorithm details UNVERIFIED); Physarum transport
  ([Jones 2010](https://uwe-repository.worktribe.com/output/980579), the Petri engine's model).
- **Character.** Global and sequential: a branch depends on every attractor it competed for. They cannot generate a
  page independently.
- **What they are good for.** Generating *explicit structures once per eye* (a vessel tree for S−1, as study/13
  proposes) that are then stored as curves and steer the pointwise pass. They are also good for the growth *order*
  (§4).

### 2.3 What the anatomy says the synthesised scales should resemble

Primary-source numbers are thin. Treat each as provisional.
- **Whole iris and crypts.**
  - The iris is about 330–405 µm thick on OCT ([Sidhartha et al. 2014](https://www.sciencedirect.com/science/article/abs/pii/S016164201301107X);
    abstract only).
  - Crypts are ABL defects of about 0.015–0.300 mm² ([IOVS model inputs](https://iovs.arvojournals.org/article.aspx?articleid=2803016);
    Tan–Girard in study/08).
  - Surface "pores" are 10–50 µm (UNVERIFIED primary).
- **The ABL.** Fibroblasts and melanocytes in a dense sheet. It is thicker and more pigmented in brown eyes and absent
  in crypts (secondary source); thickness 20–70 µm per study/13 (via study/08).
- **Colour.** Colour comes from melanin per melanocyte, not melanocyte count
  ([Imesch, Wallow & Albert 1997](https://pubmed.ncbi.nlm.nih.gov/9154287/)). So below the photo, pigment granularity
  is a *per-cell* quantity: a cell mosaic whose cells differ in melanin, which fits the Worley choice.
- **Collagen.**
  - The iris stroma is a loose meshwork of short collagen fibrils with fibroblasts, melanocytes and clump cells
    ([Ultrastructure of the iris, Microsc Res Tech 1996](https://scite.ai/reports/ultrastructure-of-the-iris-Wdr2jQ);
    author UNVERIFIED).
  - Fibrils of about 13 nm, with some circular arrangements, are reported in an older EM study
    ([Springer](https://link.springer.com/article/10.1007/BF02226904); abstract only).
  - For comparison, corneal fibrils are about 25 nm and scleral fibrils 25–230 nm
    ([PubMed 2071337](https://pubmed.ncbi.nlm.nih.gov/2071337/)).
- **Vessels.** Radial, from root to margin, each in a thick sheath of stromal collagen that resists kinking. Vessel
  diameters in µm were not found (UNVERIFIED).
- **Pigment detail.** Melanosomes about 0.5–1 µm (UNVERIFIED, memory). Eagle 1988
  ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC1298824)) has the ultrastructure but no numbers were extracted.

**The scale ladder this gives**, with the class that owns each band:

| scale | sheet (S0) | crypt floor / deck (S−1) | strands, bridges |
|---|---|---|---|
| 40–10 µm (in the photo) | streaks and speckle (`ablTex`) | fibres, veins | fitted curves |
| 10–2 µm | **cells**: 5–20 µm fibroblast and melanocyte bodies, a mosaic with per-cell melanin | fibre bundles splitting along the flow | bundles splitting along the tangent |
| 2–0.3 µm | cell processes, the pigment granules inside cells | fibres (≈ 1 µm) | fibres |
| 0.3 µm–10 nm | collagen meshwork between cells, short fibrils | fibrils, banded | fibrils |
| < 10 nm | no anatomy; molecular | — | — |

So the anatomy offers about 2.7 orders below the photograph (4.66 µm to about 10 nm). Five orders below the normal view
(about 10 µm per pixel to 0.1 nm per pixel) goes about 2 orders past anything real. What happens there is decision 4.

### 2.4 Comparison

| | tile-deterministic, refines | seeds from photo noise | steered by fields and classes | cost per texel per octave (estimate) | over 5+ orders | far view kept |
|---|---|---|---|---|---|---|
| hydraulic / thermal simulation | ✗ (global, history) | as initial noise | gradient only | high, iterative | ✗ | ✗ |
| **erosion filter** (Johansen-style) | ✓ | ✓ (cell pivots and phases) | ✓ (any direction field in place of the gradient) | ~600–900 flops, 3 × 3 cells | ✓, octave by octave | ✓ if band-limited |
| Gabor / **phasor** | ✓ | ✓ (Gabor by example; per-cell phase fit) | ✓ per point | ~600–800 flops | ✓ | ✓ analytically |
| LIC | halo L; does not refine | ✓ (the noise) | ✓ | ~L samples | ✗ | ✓ |
| flow / curl / wavelet | ✓ | ✓ | flow: advection only | 100–300 | ✓ | ✓ (wavelet best) |
| **Worley** (anisotropic) | ✓ | ✓ (feature points) | ✓ (metric along the flow) | ~150 | ✓ | needs a mean correction |
| reaction-diffusion | ✗ (halo, iterations) | ✓ (initial state) | ✓ (anisotropic diffusion) | high | ✗ | ✗ |
| Lefebvre–Hoppe by example | ✓ (small halo per level) | ✓ (exemplar is the photo) | ✓ (anisometric, 2006) | ~4–8 fetches + correction, 2–4 passes | ✓ only by self-similar re-use | ✓ (coarse levels are the photo) |
| neural / diffusion SR | only with aggregation; joint stack needed | ✓ | needs training | 10⁶×, offline | Powers of Ten only | ✗ unless constrained |
| growth (colonisation, differential, Physarum) | ✗ | ✓ | ✓ | global | ✗ | — |

### 2.5 Recommendation

**Primary: the anatomy-steered cascade.**
- **One recursion.** One octave per level, pointwise, with one hash lineage. The operator depends on the class at the
  point:
  - **Directional classes** (deck fibres, sheet guides and streaks, bridges, the radial ruff): an erosion filter
    whose gully direction is the **fitted tangent**. It uses the nearest-curve tangent where a curve is within reach
    and the 512 × 128 flow elsewhere, weighted by coherence. From the second octave down, the direction is re-steered
    by the octave above, exactly as Johansen's octaves re-steer to the slope. This is "anatomy shapes, noise seeds"
    in its literal form: bundles split into fibres along their own direction, and fibres into fibrils. With the
    profile set to a sine, this is phasor noise. The filter's own innovations (fade toward a target, stacked masks
    across octaves) give the branching and the flat floors between fibres.
  - **Slopes** (crypt walls and lips, collarette flanks, furrows): the same filter steered by the **fitted relief's
    gradient**. Here erosion is the right metaphor: fibres hang over the lip and run down the wall. The two
    steerings blend by |∇h| against the coherence.
  - **The sheet below about 9 µm:** an **anisotropic Worley cell mosaic**, about 10–20 µm cells, mildly stretched
    along the flow (and along the 45° crimp of study/13, if wanted). Each cell carries a melanin offset and a soft
    dome. Inside cells, finer octaves are isotropic grain (pigment granules); between cells, a fine fibrous meshwork
    (phasor noise at random local orientations).
  - **Crypt floors:** the same directional filter at the deck's depth, with the measured directional share (0.40 at
    7–19 µm) as the mixing target between phasor and isotropic grain.
- **Albedo or height.** Each octave writes a band-limited *luminance* (log-multiplier) and, if decision 3 allows,
  height. Hue stays with the material.
- **The seed (consuming the noise).** Offline, per eye, the fitter's dump has the native photograph and today's render
  at the same scale. Their residual in the 4.66–9 µm band is decomposed onto the first synthesised octave's own
  basis: per seed cell (about 12 µm), the impulse phases and weights, or the Worley feature point and its melanin,
  that best explain the residual, by a small least-squares fit per cell.
  - The part of the residual that the anatomy-shaped basis can explain is kept as the seed.
  - The orthogonal remainder, the true sensor grain, is dropped. This is the sense in which the noise is consumed
    and stops reading as noise.
  - Below that octave, every child cell's seed is `hash(parent seed, child index, level)`.
  - The raw residual never enters height. The 28 Sept rule stands: only the *anatomy-shaped projection* can, and only
    if decision 3 allows.
- **Why per-point seeds and not statistics.** `ablTex` is statistics and cost strandCorr 0.04–0.12 (study/11 §5.5,
  "the price of statistics instead of pixels"). Seeds fitted to the residual put the synthesised grain *where the
  photograph's grain is*, which should recover that correlation at 6× and finer. This is a testable claim (§2.7).
- **Far-view guarantees.**
  1. Each octave's amplitude is multiplied by a footprint fade that is **exactly zero** when the pixel footprint
     exceeds 1.5× its band, as `ablTexture` does today (full to 0.75 of its cell, gone at 1.5). At every scale
     coarser than the first synthesised octave's fade-out, the picture is bit-identical to today.
  2. Each octave is mean-corrected at its parent's scale, so fading it in does not move the tone. The toy (§2.6)
     shows this is necessary: an un-corrected octave keeps 47 % of its rms in the 4 × 4 parent means.
  3. The lognormal is normalised by the faded variance, as `ablTexture` already does.

**Fallback: by-example multiresolution synthesis** (Lefebvre & Hoppe 2005 / 2006).
- Exemplars are patches of the eye's own native photograph per class (sheet, crypt floor, lip, collarette). Synthesis
  is anisometric, steered by the flow, and runs per level with a small halo. Below 4.66 µm it uses Han et al. 2008's
  exemplar graph (the photograph magnified as its own finer exemplar).
- **Choose it if** the procedural cascade reads as synthetic in iori's eye at 6–20×, where the photograph's own texture
  is the reference.
- **Costs:** photo patches would ship (decision 1, stronger form), and below the photograph it is self-similarity by
  assumption, as the cascade is.

### 2.6 The toy (pure numpy, synthetic, run 2026-11-11, 0.2 s)

One octave of flow-aligned phasor noise on a 256 × 256 polar crop: 16-texel cells, 3 impulses per cell, a 6-texel
period, a slowly warped radial orientation field, u periodic through the hash. Script in the session scratchpad, not
kept.

| check | result |
|---|---|
| 16 tiles of 64 × 64 against one pass | max \|diff\| **0.0** (bit-identical) |
| seam (u wraps through the hash) | mean jump across the seam 0.102 against 0.086 between interior neighbours: continuous |
| rms of the parent-block mean over the rms of the detail | 2 × 2: 0.85 · 4 × 4: **0.47** · 8 × 8: 0.15 |
| exact block-mean subtraction | residual 0.0000, keeps 88 % of the energy, steps at block edges |
| smooth (bilinear) block-mean subtraction | residual 0.27, keeps 92 % |
| orientation of the result against the field | median error **4.6°**, coherence 0.86 |

What it says:
- Pointwise phasor noise is tile-exact and seam-free for free.
- It follows the field to within a few degrees.
- It is **not** zero-mean one level up. Mean correction is required.
- Neither correction is free: exact correction makes block steps, smooth correction leaves a quarter of the mean.
- **The proposed rule:** fade each octave to exactly zero before its parent-scale mean could show (the footprint
  fade), and smooth-correct inside the fade band. Phase D0 should measure whether the remaining tone shift during the
  fade-in is below one 8-bit step.

### 2.7 The experiment that tells primary from fallback (offline numpy; described, not run)

- **Data.** Eye 26's sheet dump (`layer_proof.py --dump-sheet`, about 5 min, CPU). Take a 1024 × 1024 crop of the
  native photograph at 4.66 µm in tissue polar coordinates, holding sheet, one crypt with its lip, and a stretch of
  collarette. Take today's render of the same crop from the existing exact path, using the capture rig's `bakeWindow`
  dump, or the fitter's own render in the dump.
- **Held-out octave.** Downsample the photo ×2 (9.3 µm). Build the steering fields from what ships (curves, flow,
  classes, relief), not from the held-out data. Synthesise the 4.66 µm octave with:
  - **A:** the cascade, seeds fitted on the photo's 9.3–18.6 µm residual only, then *predicted* one octave down by
    the lineage;
  - **A′:** A, with seeds fitted on the held-out octave itself. This is the ceiling of "noise as seed" and the
    shipping case;
  - **B:** Lefebvre–Hoppe with exemplars from a *different* region of the same photograph;
  - **C:** today: `ablTex`-style value noise.
- **Measures, per region (sheet / crypt / lip):**
  - band energy against the real octave (target 1.0 ± 0.1);
  - directional share (target: the real octave's, about 0.01 sheet and 0.4 crypt);
  - orientation error against the real octave's structure tensor;
  - pixel correlation with the real octave. A′ should be well above A, B and C; this is the strandCorr question;
  - a statistic of shape, the kurtosis and skew of the band (the photo's speckle is skewed to glints, 0.24×–2.3×).
- **Consistency checks.** The tile test (4 tiles against whole, max diff 0) and the refinement test (box-downsample of
  the added octave, rms against detail rms).
- **Recursion.** Run each method two more octaves down (2.3, 1.2 µm). Check that the spectral slope continues the
  photograph's 37 → 5 µm slope, and that structures stay anchored: the cross-correlation of each level's ridges with
  the parent's.
- **Output.** One comparison sheet for iori: photo, A, A′, B and C at 6× and 12×, plus the table.
- **Decision rule.** Choose A if its band, directional share and orientation are within 15 % of B and A′ beats C on
  correlation. Choose B if A visibly reads as synthetic to iori. Runtime: minutes, CPU only.

---

## 3. The sparse progressive texture

### 3.1 Options compared

- **Virtual texturing with a page table and a physical cache.**
  - **Sources.** [Barrett 2008](https://silverspaceship.com/src/svt);
    [van Waveren, id Tech 5](https://www.quaddicted.com/webarchive/mrelusive.com_20170131/publications/presentations/2009_siggraph/05-JP_id_Tech_5_Challenges.pdf)
    and his [Software Virtual Textures](https://www.quaddicted.com/webarchive/mrelusive.com_20170131/publications/papers/Software-Virtual-Textures.pdf);
    [Hollemeersch et al. 2010](https://www.gameenginegems.com/gemsdb/book.php?id=20);
    [Mayer 2010](https://www.cg.tuwien.ac.at/research/publications/2010/MAYER-2010-MTX/MAYER-2010-MTX-doc.pdf).
  - **Fits** arbitrary, irregular regions of interest, which is what a fly-down along one track produces.
  - **The problem.** A classic indirection texture covers the whole virtual extent at the finest level. At 20+ levels
    (2⁴⁰ texels around the circumference) that is impossible.
  - **Browser support.** WebGPU has **no sparse textures** ([gpuweb #455](https://github.com/gpuweb/gpuweb/issues/455)),
    and neither does WebGL2, so it must be done in software.
- **Clipmaps** ([Tanner et al. 1998](https://www.graphicon.ru/oldgr/library/siggraph/98/papers/tanner/tanner.pdf);
  [Losasso & Hoppe 2004](https://hhoppe.com/proj/geomclipmap/)).
  - A fixed-size toroidal window per level, centred on the viewer. Memory is constant and depth is unlimited.
  - **Fits** a single focus (the raycast point) perfectly.
  - **Does not fit** a grazing walk view, where the far field needs coarser levels over a long strip: the clipmap's
    square windows waste most of their area.
  - **Does not fit** revisiting several distant spots.
- **Sparse quadtree** (Cesium-style tiles, Google Earth). Nodes are refined where requested. It is a page table that
  stores only existing nodes, but shader lookup needs either a descent (several dependent fetches) or a hash.
- **Polar or Cartesian parametrisation.**
  - **Cartesian** (a quadtree over the 12 × 12 mm square) has no seam and isotropic texels, but wastes the pupil and
    the corners (about 30 % of the square) and loses the natural "along the strand / across" axes.
  - **Polar** has a seam (handled by wrap), a 3:1 texel anisotropy from margin to root, and no pole, because the
    pupil is a hole. It matches every existing store (atlas, regions, grids, curves in uv).
- **Requests: GPU feedback or raycast.**
  - **Feedback** renders page ids to a small target and reads it back (Barrett). WebGL2 readback is synchronous
    unless done with PBO and fence; WebGPU's `mapAsync` is asynchronous. It costs one extra pass, with frames of
    latency.
  - **Raycast** casts a coarse grid of rays on the CPU against the iris surface. The geometry is a known analytic
    bow, and the level comes from the same analytic footprint formula the shader uses (fs-photo:359). It is exact for
    a heightfield seen from above. It errs only where floating strands occlude (the layered model), and it gives the
    growth origin for free (the centre ray).

### 3.2 Design

- **Addressing.**
  - Polar pages: u periodic and v over the data's extent (`T.dataV1`, 0.82–0.89).
  - **Two radial bands**, r 2–3.5 mm and 3.5–6 mm, with the outer band having twice the angular page count. Texel
    anisotropy is then ≤ 1.75:1 everywhere.
  - Level ℓ has a radial texel of 8 µm · 2^−ℓ. ℓ = 0 is about the region bake; ℓ = 3 is 1 µm; ℓ = 13 is 1 nm.
  - A page is 128 × 128 physical texels: 120 payload texels plus a 4-texel gutter on each side, so bilinear filtering,
    the ±1 normal differences and the cell neighbourhoods never cross a page.
  - **The seam:** page index u wraps modulo the level's page count.
  - **The band junction** (a T-junction in the page grid) and the seam cannot show, because **content is a pointwise
    function of tissue position**, evaluated in Cartesian tissue mm as `ablTexture` already is. Pages only *cache*
    that function. Neighbouring pages agree because they evaluate the same function on overlapping gutters.
- **Precision for the content.** Lattices are two-word integers: `ivec2 hi, lo` per axis, page origin exact on the CPU
  in float64 or BigInt, the fragment offset local and small. This is the relative-to-centre idea of
  [Cesium RTC](https://github.com/liwcv/glTF/blob/master/extensions/1.0/Vendor/CESIUM_RTC/README.md), applied to the
  noise lattice as well as to positions.
- **The page table.**
  - A **clipmap of page tables**: per level, a 32 × 32 indirection grid (RG16UI: atlas slot plus a "resident" flag),
    centred on the focus and moved toroidally. For coarse levels it covers everything; the deepest grids cover only
    the neighbourhood.
  - The shader picks ℓ from the analytic footprint, reads that level's grid, and falls back level by level if the
    page is not resident: at most about 3 dependent fetches, usually 1.
  - Levels are only allocated while visited. Revisiting a spot far from the focus re-centres that level's grid, and
    persisted pages reload (§3.4).
  - This is the hybrid of virtual texture and clipmap, close to Far Cry 4's adaptive virtual texture (Chen 2015,
    UNVERIFIED, not fetched).
- **The physical cache.** One RGBA8 atlas:
  - **R:** Δ luminance (log, signed);
  - **G:** Δ height (signed, if decision 3);
  - **B:** the local direction (angle) handed to the next level's re-steering;
  - **A:** birth time (§4).
  - A second RGBA8 is optional, for a per-texel class id and a cell id when the mosaic needs them.
  - Phone: 2048² = 256 pages = **16 MB** per atlas. Laptop: 4096² = 1024 pages = **64 MB**. WebGPU can use a texture
    array instead (default 256 layers, up to 2048 on request:
    [limits](https://developer.mozilla.org/en-US/docs/Web/API/GPUSupportedLimits),
    [Chrome 126](https://developer.chrome.com/blog/new-in-webgpu-126)).
- **Deriving a finer page.** A child page is one draw into its atlas slot.
  - Read the parent page bilinearly over the child's quadrant plus gutter. The parent is always resident: requests
    are made top-down.
  - Read the steering fields: curves via the region bake's nearest-curve data, flow grid, class, relief.
  - Compute this level's octave from the seed lineage, then mean-correct.
  - Write parent + octave, plus the direction for the next level, plus the birth time.
  - **There are no CPU uploads at all**, except reloads from persistence.
  - Determinism needs care: the same shader and inputs give the same bits on one GPU. Across GPUs, transcendental
    results can differ in the last bit, so a persisted page might differ by one 8-bit step from a recomputed one on
    another device. Persisted pages should be treated as a cache keyed by device class, or the generator written with
    integer hashing and polynomial approximations instead of `sin`/`exp` (the toy's hash is integer).
- **Eviction.** LRU over pages not in the current view and not ancestors of resident pages. Ancestors are pinned
  because children need them for regeneration. The budget is the atlas; persistence keeps evicted pages.

### 3.3 The camera: from orbit to a walk, without a mode switch

- **Today's camera.** A ray tracer with a 24 mm sensor behind a 100 mm lens, the camera at `−u_zoom` from the corneal
  apex, pivoting about z = 13 mm, zoom clamped to 20–400 mm.
- **The ray tracer has no near plane**, which is a gift: no depth-buffer precision problems at any altitude.
- **Proposal: one camera state** = (focus point on the tissue in two-word polar, log altitude above the surface,
  heading, pitch), with the following blends:
  - **Zoom:** wheel and pinch move log altitude. From the photo's 110 mm the camera passes the cornea; inside the
    chamber there is no refraction. The switch at the cornea is study/13 §6's "invisible switch", made by blending the
    refraction weight over the last fraction of a millimetre.
  - **Pitch:** a function of altitude. Frontal above about 1 mm, then easing toward the tangent plane down to about
    50 µm, so the view slowly becomes a horizon. Below that, WASD moves the focus along the surface at a speed
    proportional to altitude.
  - **Field of view:** opens from the lens's 13.7° toward about 60–75° (the probe's) over the same range.
- **Every blend is a smooth function of altitude.** That is what makes it modeless.
- **Ray march.** The step must scale with altitude (today a fixed 0.3 mm with bisection to 0.3 µm). At µm altitude,
  march the height pages themselves: parallax or relief mapping within the page, with the coarse slab as an outer
  bound.
- **Precision.** Positions are camera-relative: the ray origin is 0 and the surface point is expressed relative to the
  focus. This lets the camera go below float32's 0.5 nm ulp near 6 mm.
- **The light.** The front box light on the camera (study/13 decision 5) flies with it, so walk views are lit.

### 3.4 Persistence

- **Storage.** OPFS, one file per eye per (fit hash, algorithm version), holding packed pages with a small index.
  Pages are compressed with `CompressionStream('deflate-raw')`; noise compresses poorly, so plan on about 50–70 % of
  raw. Writes go through a worker's `createSyncAccessHandle`.
- **Budget.** Say 200 MB per eye, LRU across eyes. Quotas are per origin, evicted LRU unless persistent, and on iOS
  WebKit's quota applies to every browser ([MDN](https://developer.mozilla.org/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria);
  figures UNVERIFIED).
- **What it is for.** Generation is deterministic, so persistence is *only* an accelerator, plus the growth record
  (§4) and the giant render's source. Losing it loses nothing but time.
- **Invalidation.** A re-fit changes the fit hash, which invalidates everything. A change to the detail algorithm
  bumps the version.

### 3.5 What limits depth, and how to pass each limit

| limit | where it bites | how to pass it |
|---|---|---|
| float32 position (ulp ≈ 0.5 nm at 6 mm) | jittering hits and normals below ~10 nm per pixel | camera-relative rays; the focus in two-word |
| float32 noise lattice | hashing `floor(x/cell)` from mm fails once cells < ~1 nm | two-word integer lattice per level from the page origin |
| hash period and seed exhaustion | photo seeds cover only the first 1–2 octaves | the lineage `hash(parent seed, child, level)` is unbounded; the level in the hash prevents repeats between levels |
| the page table | a global indirection at depth 20 is 2⁴⁰ texels | a clipmap of page tables: constant size per level, levels allocated while visited |
| memory | the atlas fills during a long walk | LRU with persistence; only the view plus its ancestors are pinned (≈ 1.33× the visible pages) |
| anatomy | ends near 10 nm | decision 4: continue the last level's statistics self-similarly (a fractal continuation), or a floor |
| integer levels | 32-bit level × lattice combinations | two-word hashing; levels > 64 are unreachable in practice (8 µm · 2⁻⁶⁴) |

---

## 4. Growth-ordered rendering

### 4.1 What exists

- **Blender Cycles "Hilbert spiral"** ([commit 6995b4d, Stockner 2016](https://developer.blender.org/rB6995b4d8d96a14ea574f85658b73504fa0d8070a)).
  A rotated Hilbert curve spirals out from the centre; continuous, cache-friendly. The manual notes that order barely
  changes speed ([2.81 manual](https://docs.blender.org/manual/en/2.81/render/cycles/render_settings/performance.html)).
  It is the look iori remembers. It is geometric: tiles appear as squares.
- **Foveated rendering** ([Guenter et al. 2012](https://www.microsoft.com/en-us/research/publication/foveated-3d-graphics)).
  Resolution falls with eccentricity. The useful idea here is that the *order* of refinement follows the gaze.
- **Blue-noise progressive orders.**
  [Progressive multi-jittered sequences](https://graphics.pixar.com/library/ProgressiveMultiJitteredSampling) (every
  prefix well spread); [Ulichney's void-and-cluster ranks](https://staging--surmblog.netlify.app/things/ditherpunk/bluenoise-1993.pdf)
  (each rank prefix is an even fill); [Mitchell 1991](https://my.eng.utah.edu/~cs6965/papers/p157-mitchell.pdf).
  Rendering in rank order makes detail *sprinkle in* evenly instead of sweeping.
- **Mediated Matter.**
  - **[Vespers](https://www.media.mit.edu/projects/vespers/overview/)** (2016–18): three series of five death masks
    printed on a Stratasys Objet500 Connex3. In Series III ([project](https://www.media.mit.edu/projects/vespers-iii/overview/);
    [Dezeen](https://www.dezeen.com/2018/04/26/neri-oxman-vespers-death-masks-pigment-producing-microorganisms/)),
    engineered microorganisms in printed channels produce pigments emulating Series I's colours. Which organism is
    UNVERIFIED.
  - **[Totems](https://www.oxman.com/projects/totems)** (2018–19,
    [Biodiversity / melanin](https://www.media.mit.edu/projects/biodiversity/overview/)): a 3-D printed transparent
    block with channels of liquid melanin from feathers, cuttlefish ink, tyrosinase synthesis and engineered E. coli.
  - **[Silk Pavilion](https://www-prod.media.mit.edu/projects/silk-pavilion/overview/)** (2013): a CNC-laid scaffold
    finished by 6,500 silkworms, with growth following the scaffold.
  - **[Fiberbots](https://www.media.mit.edu/projects/fiberbots/overview/)**: wound fibre tubes. Aguahoja: printed
    biocomposites (materials UNVERIFIED).
  - What these share, as relevant to iori's image: **a printed scaffold whose channels decide where pigment or
    material goes, and a process (voxel deposition, microbial growth, worms spinning) that fills it at its own pace,
    following the scaffold.**
  - In the iris engine, the scaffold is the fitted anatomy and the process is detail generation.
- **Biology.** Pigment patterns are reaction-diffusion ([Kondo & Miura 2010](https://doi.org/10.1126/science.1179047)).
  The iris stroma and ABL derive from neural crest, whose melanocytes migrate into place (secondary source; primary
  UNVERIFIED).

### 4.2 Proposal: growth along the anatomy

**Order of pages.**
- A Dijkstra or fast-marching front over the *page graph* of the requested set, started from the raycast point.
- The edge cost is an **anisotropic metric**: distance along the local strand direction × 1, across it × 3–4. The
  direction is the same field that steers the detail.
- Class boundaries add a cost: crossing into a crypt or over a lip is slow, so crypt floors fill last, as if the
  growth had to climb down.
- The result is each page's arrival time T_page. Pages are generated in order of T_page, as many per frame as the
  budget allows (§5).

**Order inside a page.**
- Each texel gets a birth time `T(x) = T_entry + d_M(x)/speed + jitter(x)`:
  - d_M is the anisotropic distance from the page's earliest-arriving edge point, computed analytically with the
    metric frozen at the page centre: about 10 flops;
  - the jitter is a blue-noise rank (void-and-cluster) scaled to a small fraction of the page's growth time, so the
    front is ragged like deposition, not a clean line.
- **On the sheet, the birth time is per Worley cell, not per texel**: each cell is born whole at its centre's arrival
  time. The mosaic then *prints* cell by cell (the Oxman voxel image). Within a fibre, texels along the fibre are
  nearly simultaneous and the fibre is born *outward along its length*.
- Optional, later: a sharper eikonal (fast sweeping, 2–4 passes per page) where curvature matters. The analytic version
  should be judged first.

**Display.**
- A texel shows `amplitude × smoothstep(T(x), T(x) + 150 ms, t_now)`.
- The coarse picture is always there, and each texel's detail fades in from zero. Detail *grows over* the image;
  nothing pops, nothing is replaced.
- The front can carry a faint, short-lived brightening of about 2 %, like wet ink. That is iori's choice; off by
  default.

**Partially grown pages.**
- The generator writes the whole page at once (generation is cheap). Growth lives entirely in the birth-time channel,
  so "partially grown" just means `t_now < T(x)` for some texels.
- A page evicted mid-growth keeps its birth times when persisted. Whether growth resumes, replays or is complete on
  the next visit is decision 6.
- If the user flies away and back within the cache's life, growth continues where it was.
- A child page's birth times are offset so that no child texel is born before its parent texel. Detail never appears
  finer before it appears coarser.

**How it should look, in plain words.**
- You stop over a spot. Within a fraction of a second, sharpness spreads out from under the pointer. It runs first
  along the strands, as if each fibre were being drawn outward from that point along its length. It seeps sideways
  into the spaces between fibres more slowly, and reaches down into the crypts last.
- On the smooth sheet the surface fills in cell by cell, a mosaic of tiny cells each appearing whole, unevenly, like a
  print being deposited.
- Fly further down and the same happens again inside the cells, finer, starting from where you are looking.
- Nothing ever appears as a square.

**Cost compared with plain centre-out tile order.**
- **Throughput:** the same, because generation is the same work in a different order.
- **Extra:** Dijkstra over a few hundred to a thousand pages (< 0.1 ms on the CPU per re-plan), about 10–20 flops and
  one byte per texel for the birth time, and one smoothstep per displayed sample.
- **Latency:** the growth speed is a design choice. A pure "as fast as generated" setting makes it identical to
  centre-out. A paced setting deliberately spends about 0.5–1 s on the visible bloom, *after* the pages are already
  computed.

---

## 5. Optimisation and performance plan

### 5.1 Budgets per frame

All numbers are estimates to be measured in D0/D3. Assumptions: a mid-range phone GPU delivers about 300 GFLOPS
effective (peak 0.5–1 TFLOPS, UNVERIFIED per device); a laptop iGPU or Apple M-class about 1.5–3 TFLOPS effective.

| | phone | laptop |
|---|---|---|
| GPU time for generation per frame | 2 ms of 16.7 | 3 ms |
| cost per texel per level (one octave + fields + parent fetch) | ~1 kflop | same |
| texels generated per frame | ≈ 130 k (8 pages) | ≈ 0.5 M (32 pages) |
| page uploads per frame (persistence reloads only) | ≤ 4 × 64 KB | ≤ 16 |
| atlas memory | 16 MB (+16 MB with the optional second RGBA8) | 64 MB (+64) |
| detail shading in the photo shader | one indirection fetch + 1–3 atlas fetches + growth smoothstep per sample, ≈ the cost of today's `ablTexture` (0.3 ms per Mpx zoomed) | same |
| CPU per frame | raycast grid 16 × 9 (phone), 32 × 18 (laptop) against the bow; re-plan Dijkstra on change | < 0.5 ms |

- **Pages visible at once.** Phone at one texel per CSS pixel: a 390 × 844 CSS viewport needs about 4 × 8 = 32 pages
  at the finest level, plus about 1.33× for ancestors. Laptop 1440 × 900 CSS: 12 × 8 = 96, plus ancestors.
- **Time to a sharp view after a fast fly-down.**
  - Without persisted pages, the end view needs its visible pages and their ancestors.
  - Phone at one texel per *device* pixel (2160 × 1080, 18 × 9 = 162 pages + ancestors ≈ 216): 216 / 8 = 27 frames,
    **≈ 0.45 s**. At one texel per CSS pixel, about 0.1 s.
  - Laptop at 2880 × 1800 device px: 24 × 15 = 360 + ancestors ≈ 480 → 15 frames, **≈ 0.25 s**.
  - Intermediate levels passed during the fly-down need not complete: only their ancestors on the final view's chain.
  - **Recommendation:** texels per *CSS* pixel on phones. The viewport's accumulation already gives sub-pixel
    sharpness.
- **Time to rebuild today's views.** Unchanged: at ≥ 10 µm per pixel there is no detail to generate.

### 5.2 Where compute, workers and WebAssembly earn their place

- **Generation: GPU fragment passes** into atlas slots (WebGL2), or **compute** (WebGPU). Compute earns its place if
  the anisotropic eikonal or per-cell Worley birth times are wanted (shared memory per page), and for batching many
  small pages in one dispatch. A fragment pass into one atlas viewport per page is enough for WebGL2.
- **Workers:** OPFS reads and writes and compression; the giant render's encoder (§5.4); the per-eye seed fit if it
  ever runs in the browser (T8, the fitter on the site).
- **WebAssembly:** only for the giant render's PNG/TIFF writer and, possibly, the seed fit (a least-squares fit per
  cell over millions of cells). The runtime path needs none.
- **Per eye, shipped:** the seed field, the fit's curves, classes and relief, all already shipped except the seed.
- **Generated on demand:** everything below the photograph.
- **Seed field size** (estimate): about 12 µm cells over the annulus (≈ 100 mm² visible ≈ 0.7 M cells) × 2–3 bytes
  ≈ 1.5–2 MB raw, perhaps 1 MB compressed. That is about the size of today's whole legacy section.

### 5.3 What stays precomputed

- Nothing new is precomputed at load. The first two levels below the region bake (ℓ 0–1) could be generated for the
  whole eye at load: 6144 × 646 × 4 ≈ 16 M texels, about 16 GFLOP, so 0.1 s on a laptop and about 0.5 s on a phone.
  That would make the first zoom-in instant. This is optional and should be measured.

### 5.4 The giant render

- **Browser limits.**
  - Canvas area: Chrome about 268 Mpx (16384²); iOS about 16.7 Mpx (4096²)
    ([MDN mirror](https://docs.w3cub.com/html/reference/elements/canvas); [canvas-size](https://github.com/jhildenbiddle/canvas-size);
    device-dependent, partially verified).
  - Formats: JPEG max 65 535 px per side; WebP 16 383 per side; PNG 2³¹−1 per side; classic TIFF 4 GB (BigTIFF for
    more). Format limits UNVERIFIED from the specs.
  - Today's `captureTiled` assembles into one 2-D canvas (`engine.js:995-1024`), so it inherits the canvas limit.
- **Design: never assemble in a canvas.**
  - Render tiles of ≤ 4096² (iOS-safe) through the same page generator at the target level.
  - `readPixels` each tile.
  - Stream rows into a **PNG writer in a worker**: PNG is zlib over filtered rows, so `CompressionStream('deflate')`
    plus a CRC is enough. Write to OPFS through a sync access handle. This has no canvas or memory limit, only the
    format's.
  - Beyond about 2 Gpx, or for viewing, write a **Deep Zoom pyramid** (DZI: `name_files/<level>/<col>_<row>.png`,
    [OpenSeadragon](https://openseadragon.github.io/examples/tilesource-dzi)) into a zip, or a BigTIFF. Offline
    alternative: libvips `dzsave` ([docs](https://www.libvips.org/API/8.18/making-image-pyramids.html)).
- **Sizes.** The whole iris disc (12 mm):
  - 1 µm per pixel: 12 k² = 144 Mpx, one PNG of roughly 300–500 MB. Feasible.
  - 0.25 µm: 48 k² = 2.3 Gpx. DZI or BigTIFF only. Generation is about 2.3 TFLOP of detail plus shading, a minute or
    two on a laptop GPU, with encoding comparable.
  - 10 nm over the whole disc: 1.4 Ppx. Impossible. So the export at the finest reached level must be a **region**:
    the visited area or a user-drawn rectangle.
- **Which projection.** Decision 5:
  - **the unwrapped polar map** (the texture itself; seam and band layout; useful for printing as a strip);
  - **a frontal orthographic flat-lit "scan"** (the iris as a specimen; the polar pages resampled; light fixed);
  - **the current view at N×** (`captureTiled` grown into the streaming writer; view-dependent light and refraction).
- **Accumulation.** The current view at N× needs 48 accumulated frames per tile for its lens and jitter. The scan and
  the polar map can use 4–8, because detail is pre-filtered in the pages.

---

## 6. Phased plan

Each phase is behind a flag that defaults off. "Off" must be byte-identical: the HANDOFF trap that *any code added to
fs-bake shifts its float arithmetic* means the detail must live in a **separately compiled variant**, built by string
replacement as tissue.js builds its fs-photo variant, never as a branch in existing shaders.

### 6.1 Phases

| phase | delivers | verified by |
|---|---|---|
| **D0 — the offline experiment** | §2.7 on eye 26: primary against fallback, held-out octave, the comparison sheet; the per-cell seed fit prototyped in numpy; the toy's mean-correction rule measured on real data | the tables in §2.7; a sheet for iori. No engine change |
| **D1 — pointwise detail in the shader, no cache** | the cascade's first 2–3 octaves below 6 µm, evaluated per pixel in a photo-shader variant (as `ablTexture`), on statistics seeds first; sheet mosaic + directional filter + slope steering | **far-view identity**: detail on vs off at the default pose and the scored pose, maxDiff 0 (the fade is exactly zero there); `__t7.review` MATCH2 / strandCorr / cellΔab unchanged at the scored scale; `tools/crisp/crisp.js` band contrast at 6× and 12× by region against the photo; arrival gate (`tools/tone/fresh.js publish`, maxDiff ≤ 1/255) on all four eyes; `__uiContract.compare()` and `reach()` both `[]` |
| **D2 — seeds from the photograph** (if decision 1 allows) | the seed field in the eye file (a new section via `tools/eyefile/replace.py`), fitted offline from the sheet dump; the shader reads it | strandCorr at 6× against D1 (the claim: recovers the 0.04–0.12 lost to statistics); crisp.js; `k23_probe.js` origin byte-equality (the knobs still move materials, not the detail) |
| **D3 — the page cache** | the virtual texture of §3.2 in WebGL2: raycast requests, clipmap of page tables, atlas, LRU; the shader reads pages instead of evaluating pointwise | **page = pointwise**: a page against D1's pointwise evaluation at the same points, max diff ≤ 1 step; tile-boundary test (gutters equal); refinement test (box-downsampled level ℓ+1 minus ℓ ≈ 0 in tone); frame-time probe on a phone-class device |
| **D4 — the one camera** | log-altitude zoom past 20 mm, pitch and field of view as functions of altitude, camera-relative rays, altitude-scaled march, WASD below about 50 µm; the probe folded in | capture rig region crops (`state.view` getter + `captureTiled`, POST `/save/shots`) at 1×, 6×, 30×, 300×; `b1/zoom.js` crops; contract `[]` (the zoom control's ledger row in `study/10-feature-ledger.md` and `controls.json`) |
| **D5 — growth** | arrival-time page order, per-texel and per-cell birth times, fade-in, partial pages | a frame sequence from the capture rig with `u_time` stepped (the hidden pane throttles rAF: drive time explicitly, MessageChannel loop as in the Flame Strains rig); "no texel born before its parent" asserted on the atlas |
| **D6 — persistence** | OPFS store keyed by eye, fit hash and algorithm version | reload equality (persisted page = regenerated, on one device); eviction under a forced small quota |
| **D7 — the giant render** | streaming PNG writer + DZI pyramid in a worker; the projection iori picks | a 1 µm whole-disc PNG and a 0.1 µm region DZI written from the rig; checksums of overlapping tiles |
| D8 (optional) — WebGPU compute | batched page generation, eikonal growth | same tests, timings compared |

### 6.2 Risks

- **Statistics cost correlation.** `ablTex` showed that a random texture loses strandCorr. Mitigations: the exact-zero
  fade at the scored scale, and per-point seeds (D2).
- **Lognormal tone shift.** Mean correction plus faded-variance normalisation; measured in D0 and D1.
- **Path-dependent measured load** (study/11 §3.4). Every measurement on a fresh page, through the review path.
- **Comments swallowing code** and silent fallbacks (handoff 2026-09-28 §5). Grep `//.*gl\.` after edits; the
  generator throws if its inputs are missing.
- **Cross-device determinism of persisted pages.** Use integer hashing and avoid transcendental functions in the
  generator, or key the cache by device class.
- **Phone memory and thermal.** 16 MB atlas, generation capped per frame, paced growth.
- **The layered model** (`T.layered`, L1/L2 open): floating strands occlude, so raycast requests miss pages behind
  them. Add a feedback pass only if it shows.
- **Ownership.** Other sessions own the Iris code, and K2/1b work is in progress in `tissue.js` and `shaders.js`. Every
  phase from D1 on edits the photo shader's variant chain and must be scheduled with the renderer track.

### 6.3 What must stay untouched to keep the fit intact

- The fitter (`fit.js`, `tools/layer_proof.py`) and its scores: MATCH2 is taken at 640 px, where the detail is zero.
- The eye files' existing sections and the measurements (`cal.bin` inside `measurements`); D2 *adds* a section.
- The region bake and its textures, the legacy atlas and the grids.
- `ablTex`'s octaves at 6–48 µm. The cascade starts below them and blends in only past their fade.
- The arrival gate's renders.
- The calibration's grey renders: detail off while `T.greyBake`, as for `ablTexture`.

### 6.4 Questions for iori

1. **Seeds from the photograph.** May the eye file carry a per-cell seed field (about 1–2 MB per eye) distilled from
   the photograph's finest-band residual? It is not the photo's pixels, but it is per-point information derived from
   them: the first such data shipped. The alternative is statistics only, as `ablTex`, at the known strandCorr cost.
2. **Where "identical from afar" ends.** Bit-identical at ≥ 10 µm per pixel (up to about 3×) is free. At 6×, today's
   picture already shows the 6 µm octave. Should the cascade's first octave replace that octave there (better
   anatomy, different pixels), or start only below 6 µm?
3. **Height.** May synthesised, anatomy-shaped detail carry *height* below about 5 µm? At walking scale a surface
   without relief looks painted. The 28 Sept rule (raw noise never into displacement) is kept either way.
4. **Below the anatomy.** Below about 10 nm there is nothing real. Continue self-similarly (the same pattern finer,
   forever), or stop at a floor (the last level magnified, or a deliberate end such as fibrils resolving into a
   lattice)?
5. **The giant render.** Polar strip, frontal specimen scan, or the current view at N×? And should unvisited areas be
   generated at the export resolution (deterministic, so possible), or only the visited region exported?
6. **Growth.** Replay on every visit, resume, or remember as grown? Paced (a visible bloom of about 0.5–1 s) or as
   fast as generated? The wet-ink brightening at the front: yes or no?
7. **Primary or fallback** after seeing D0's sheet: procedural cascade, or by-example from the eye's own photograph?
8. **The phone floor.** Is a mid-range phone a target for the walk (16 MB, 8 pages per frame), or only for the normal
   zoom range?
9. **Order against the open renderer work** (L1 depth pass, 1b remainder, the layered model): does this stretch wait
   for L2 (traced strands at close range), or go first on the sheet and crypt floors?

---

## Sources

The links are given inline in the sections where they are used.

**Verified against a primary or official record:** every link given inline above, except those named below.

**Unverified:**
- Westin 2023 (known only through Johansen's post).
- Johansen's 3 × 3 neighbourhood.
- Anisotropic Worley as published work.
- Han et al. 2008's URL.
- Mittring 2008.
- Chen 2015 (Far Cry 4 adaptive virtual texture).
- The ABL thickness in µm.
- Vessel diameters.
- Melanosome size.
- The microorganism in Vespers III.
- The Aguahoja materials.
- The browser storage quota figures.
- The image-format size limits.
- The WebGL2 minimum limits.
- Phone GPU throughput.
- Every performance number in §5, which is an estimate until D0/D3.

**Code read (read only):** `shaders.js` (fs-photo, fs-bake), `engine.js`, `tissue.js`, `eyefile.js`, `design.js`,
`overlay.js`, `serve.py`, `tools/` (ui-contract, tone, crisp, t7, k23_probe), and the eye files `data/{09,25,26,35}.iris`
(heads and section counts). Documents read: HANDOFF.md, the 2026-09-28 handoff, study/00 §32.6, study/11 §5.5, study/13,
study/15.
