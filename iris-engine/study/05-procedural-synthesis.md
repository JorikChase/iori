# 05 — Procedural synthesis of iris texture

How people make synthetic irises, what makes them read as real, and a concrete WebGL2 bake pipeline that derives every map from one seed.

## 1. What the literature and the ocularists already know

### 1.1 Biometric iris synthesis

Biometrics has synthesised irises since ~2004 because real databases are small and privacy-bound:

- **Cui et al. 2004** — PCA coefficients sampled into coarse irises, then super-resolution. Plausible statistics, no explicit structure.
- **Zuo & Schmid 2007** (the paper the brief names) — the first *structural* model. Iris fibres are generated as continuous curves in **3D cylindrical coordinates**, projected to 2D, then shaped by pupil and iris circles; a **collarette** deformation, a **semi-transparent top layer with an irregular edge**, **iris-root blur**, and eyelids/lashes are added. **40 random parameters** drive it — fibre size and cluster degree, pupil size, top-layer thickness and transparency, collarette location and amplitude, root-blur range. "Top layer over fibres" is the anterior border layer over the stroma, and the most useful takeaway.
- **Shah & Ross 2006** — a Markov-random-field background texture (grown from a 30×30 patch) with features *agglomerated* on top. Their feature recipes are directly reusable: **radial furrows** are straight radial lines whose sample points are randomly perturbed and re-interpolated with periodic cubic splines, then textured with **line integral convolution** (kernel L = 25 px over Gaussian noise); the **collarette** is a circle 20–30 px outside the pupil, sampled, perturbed, spline-interpolated into a zigzag, and radial furrows are kept only *inside* it; **concentric furrows** are circle-arcs 10–20 px inside the iris radius in the ciliary zone, darkened; **crypts** are 1–10 circles of radius 2–6 px seeded on the collarette periphery, perturbed into blobs, filled with a random *darker* value and blended with a smoothing filter.
- **Wei, Tan & Sun 2008** — patch-based sampling of a prototype in polar space, then deformed intra-class variants; it established the **unwrapped polar rectangle** as the natural synthesis domain.
- **GAN / diffusion era (2022–2025)** — StyleGAN2/3, CIT-GAN, iWarpGAN and diffusion-StyleGAN hybrids make near-infrared irises for recognition and PAD training; a 2024 study compared **Cartesian vs polar** generation, and EyePreserve (2023) learns identity-preserving *dilation* warps. What matters for a renderer is their evaluation finding: irises are judged real when **crypt, furrow and collarette statistics** match, not pixel statistics.

### 1.2 The ocularist's recipe (the proven look)

Lefohn, Budge, Shirley, Caruso & Reinhard 2003 translated prosthetic-eye painting into a rendering toolkit and is the best written record of what ocularists do:

1. **Base layer** — opaque, painted on a **black iris button**; carries the dominant colours (lots of white for blue/grey eyes, darker for brown).
2. Then **30 to 70 semi-transparent layers with clear coat between them**, each carrying one or two components:
   - **Stroma** — covers nearly the whole iris: well-defined dots, smeared dots, or **radial smears**.
   - **Collarette** — confined to the **inner half**: radial spokes or dots.
   - **Sphincter** — a coloured ring close to the pupil.
   - **Limbus** — painted fuzzy and darker than the rest, on the iris even though anatomically it is not.
   - **Pupil** — a black dot built up over multiple layers.
3. Fewer than **10 base paints**, **pairwise mixed** (Lefohn interpolates in HSL) to give each layer a single colour.
4. Ocularists classify eyes as **smeared** (brown, low detail), **dit-dot**, and **detail** (light eyes); the same components are painted in every eye, only their sharpness changes.
5. Depth comes from *alternating* high-frequency fairly-opaque layers with transparent cloudy ones; Lefohn composites each as `R = (1-α)·T + α·C·L` on stacked cones separated by clear "varnish".

Clinical fabrication papers give the same stack — pupil, stroma, collarette, limbus in burnt umber / yellow ochre, radial strokes centre-to-periphery, then a **clear acrylic cap** that magnifies the iris. The **veins** laid as red silk threads belong to the *sclera*, not the iris.

So the proven order is: black backing → opaque base colour → many alternating sharp/cloudy stroma layers with radial smears → collarette spokes in the inner half → sphincter ring → fuzzy limbus → clear cap. Every good shader below is a compression of this stack.

## 2. Artist and shader recipes

**Shadertoy.** Inigo Quilez's *Eye* (`lsfGRr`) is the archetype: polar coordinates, `fbm(vec2(20·a, 6·r))` for white radial streaks, `fbm(vec2(15·a, 10·r))` thresholded for dark insertions, a two-colour fbm base, a `smoothstep(.6,.8,r)` vignette as limbal ring, a `smoothstep(.2,.25,r)` pulsing pupil. The trick is anisotropic frequency — angle sampled 2–3× denser than radius. *Realistic Eye* (`XsfGWj`, Blitz Games R&D after Jimenez's SIGGRAPH 2012 talk) adds a raymarched refracting cornea, caustic and scleral subsurface over the same stretched fbm. aferriss's *iris* (`ltBBzV`) is a concentric-ring test worth stealing for furrows.

**Substance Designer.** Adobe's tutorial (Martin Schmitter) and the community *Procedural Eye Generator* use a **radial-lines node** (two seeds, one rotated, blended at different heights → fibre height), **Tile Sampler + Shape Mapper** for radial spots, a **Warp** deforming a ring into the collarette, a multiplied radial pattern for the ciliary "big waves", a blurred-shape **subtract** at the rim for limbal depth, and four colours (main, pupil border, midlines, border) with contrast / height-blend sliders. Outputs: albedo, height/normal, iris mask.

**Blender.** Every convincing setup is one of two things: polar UVs with Noise scaled anisotropically along radius, or a radial gradient into **Voronoi F1 / distance-to-edge** scaled hard in one axis.

**MetaHuman.** Photographic, not procedural, but the *structure* is the reference: a **circular (radial) iris UV**, `MI_Eye*_Baked` with **base colour + normal for sclera and iris separately**, iris **parallax** under a refracting cornea, and pupil scale as a material parameter re-mapping the radial coordinate.

**Texturing.xyz UHD Iris** (scans) separates **a top layer** (anterior border layer) from **bottom fibres** (stroma) with density sliders per layer and per inner/outer zone, six ID masks, and secondary/tertiary/micro displacement in RGB. Their colour rule: *brown irises have a very dense top layer; blue irises almost none, only bottom fibres.*

**Common ingredients** (what every recipe exposes): polar remap with pupil radius; base colour pair (inner/outer); fibre frequency, stretch and contrast; a collarette radius + amplitude; crypt density; furrow count; limbal ring width/darkness; pupil-edge softness; height/normal for parallax; a top-layer density that *is* eye colour.

## 3. Generating the structures

All generation happens in the unwrapped polar rectangle **u = θ/2π ∈ [0,1)**, **v = (r − r_p)/(r_i − r_p) ∈ [0,1]** at 4096×1024 (angle × radius). The renderer samples it with a polar lookup; the seam is at u = 0.

### 3.1 The trabecular network

Candidates and verdicts for a one-second WebGL2 bake at 4096×1024 (4.2 M texels):

| Approach | Branch/merge | Gaps | Cost per texel | Verdict |
|---|---|---|---|---|
| Stretched Worley edges (F2−F1) in polar + domain warp | yes (cell junctions) | yes (cell interiors) | 9 cells × 2–3 octaves | **recommended** |
| Directional/anisotropic fbm (iq style) | weak | no | cheap | base "cloudy" layer only |
| Gabor noise (Lagae 2009) | no | no | 30–60 kernels | beautiful fibre spectrum, no topology |
| Reaction–diffusion | yes | yes | hundreds of passes | too slow, hard to steer |
| L-system fibres rasterised | yes | yes | CPU + line raster | good but not a fragment-shader bake |
| SDF of random polylines | yes | yes | N segments per texel | fine for ≤64 hero fibres |

Stretched Worley wins because cell *edges* branch at vertices, merge, and leave lens-shaped voids — the trabecular look — at ~30 hashes per texel per octave. Three octaves plus a domain warp is under 200 hashes per texel; an integrated GPU bakes that in tens of milliseconds.

```glsl
// periodic-in-u Worley edge distance, stretched along v
// N = number of cells around; the hash wraps in u so the seam is invisible
float worleyEdge(vec2 p, float N, float stretch, float seed) {
  p.x *= N; p.y *= N / stretch;        // stretch>1 elongates cells radially
  vec2 ip = floor(p), fp = fract(p);
  float f1 = 8.0, f2 = 8.0;
  for (int j=-1;j<=1;j++) for (int i=-1;i<=1;i++) {
    vec2 g = vec2(i,j);
    vec2 cell = ip + g; cell.x = mod(cell.x, N);        // wrap angle
    vec2 o = hash2(cell + seed);
    float d = length(g + o - fp);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return f2 - f1;                       // 0 on edges, large in cell centres
}

float trabeculae(vec2 uv, float seed) {
  vec2 w = uv + 0.03 * vec2(pfbm(uv*vec2(6.,3.), seed), pfbm(uv*vec2(6.,3.), seed+7.)); // domain warp
  float a = 1.0 - smoothstep(0.0, 0.08, worleyEdge(w, 96.,  6.0, seed));       // coarse spokes
  float b = 1.0 - smoothstep(0.0, 0.12, worleyEdge(w + 0.011, 210., 3.5, seed+1.)); // medium mesh
  float c = pfbm(uv * vec2(400., 40.), seed+2.);                                // fine directional grain
  return clamp(max(a, 0.7*b) * (0.6 + 0.4*c), 0., 1.);
}
```

`pfbm` is fbm whose x-input is sampled on a circle (`vec2(cos 2πu, sin 2πu)·R` fed to a 3D noise, or a lattice noise with `mod(ix, N)`), so it is periodic in angle without a seam.

### 3.2 The named features

- **Collarette** — a zigzag ridge at `v_c(u) = 0.28 + 0.06·pnoise(u·11) + 0.02·pnoise(u·37)` (Shah & Ross: 20–30 px outside a pupil of ~100 px; ocularists: inner half). Height ridge `exp(-((v - v_c)/0.015)²)`; inside it the **pupillary zone** gets a different base colour (usually warmer / darker), finer, denser fibres, and the radial furrows.
- **Radial furrows near the pupil** — dense thin radial lines, `1 - smoothstep(0.0, 0.4, abs(pnoise(u·180 + 0.5·pnoise(u·9), v·2)))`, masked to `v < v_c`, added as shallow grooves. Shah & Ross's LIC along perturbed radial splines is the same thing done with a 1D blur along the fibre direction.
- **Fuchs crypts** — lens-shaped holes where the anterior border layer is missing and the dark posterior epithelium shows through. Seed them with a *separate* Worley field elongated radially (`stretch ≈ 2.5`), keep cells whose hash < density, and weight the density by a band **just outside the collarette**: `density(v) = ρ · exp(-((v - (v_c+0.08))/0.12)²)`. Use the cell's F1 to make the hole: `crypt = smoothstep(0.55, 0.25, F1_norm)` — soft edge on the inside, sharper rim. Crypts *lower height*, *lower stroma density* and *raise melanin* (they read dark). Large crypts reach into the ciliary zone.
- **Contraction furrows** — concentric arcs in the outer third: `v ∈ [0.62, 0.95]`, 2–5 rings at radii `v_k = 0.65 + 0.08k + 0.01·pnoise(u·5)`, angular windows `smoothstep` of a low-frequency `pnoise(u·3 + k)` so each ring exists over 40–200° and fades out. Grooves in height (deepest at dilation, see §4), slightly darker albedo.
- **Pigment spots (naevi)** — warm blotches: `spot = smoothstep(0.62, 0.78, pfbm(uv·vec2(14,7)))`, raise melanin and push hue toward orange-brown, 1–4 per eye, ciliary zone.
- **Wolfflin nodules** — small white-to-orange dots at the periphery (`v > 0.86`), sparse; Worley F1 with `hash < 0.15`, radius 4–8 texels, bright, *above* the stroma (they are collagen bundles on the surface). More common in light irises.
- **Limbal ring** — not a feature of the iris but painted as one: darken and desaturate `smoothstep(0.85, 1.0, v)` and let the sclera fade over it; the actual limbus is the cornea-sclera transition handled in the eye shader.

### 3.3 Seams, periodicity and the "combed" look

- **Seam:** every function of `u` must be periodic. Either wrap integer lattice coordinates `mod N` (Worley, lattice noise) or embed the angle on a circle and use 3D noise. Never use plain 2D noise on `u`.
- **Visible periodicity:** do not give all layers the same cell count; use counts like 96 / 210 / 470 (not multiples), rotate each octave's warp by a different angular offset, and let the domain warp be angle-dependent.
- **Combed / parallel-stripe look:** this is what plain radially-stretched noise produces. Cures, in order of effect: (1) let fibres come from Worley *edges* so they meet at junctions, (2) multiply two fibre fields whose stretch differs (6 vs 3.5), so long fibres are interrupted, (3) domain-warp with a low-frequency field so fibres wander, (4) the ocularist's cloudy layer — a soft low-frequency opacity (`pfbm(uv·vec2(5,2))`) over the fibres, (5) never draw fibres perfectly radial: add `u += 0.004·pnoise(v·6)` shear.

## 4. One seed → all maps ("iris genome")

A 32-bit seed hashes into ~40 parameters (Zuo & Schmid's count), grouped: **colour** (top-layer melanin density m_top, stroma density s, base hue pair, lipofuscin amount), **structure** (cell counts, stretch, warp amplitude, collarette radius/amplitude, crypt density, furrow count/depth, spot count, nodule density), **geometry** (pupil offset ≤ 20% of iris radius, reference pupil ratio). Eye colour is not a colour parameter: **brown = high m_top, blue = m_top ≈ 0 with visible stroma, hazel = spatially varying m_top**, so the ocularist's "smeared vs detail" classes fall out of one slider.

The bake writes four RGBA targets at 4096×1024 (angle × radius):

| Target | R | G | B | A |
|---|---|---|---|---|
| T0 | height (parallax) | stroma density | top-layer melanin | crypt mask |
| T1 | albedo top layer | | | pupillary-zone mask |
| T2 | albedo stroma | | | Wolfflin / spot mask |
| T3 | normal xy (from T0.r) | AO (from height) | furrow mask |

Height is the sum: base −crypts −furrows +collarette ridge +fibres +nodules. Melanin = `m_top·(1 − crypt) + spots`. Stroma density = `s·fibres·(1 − 0.8·crypt)`. The shader then does the Lefohn composite in two layers: a translucent top layer coloured by melanin over a scattering stroma whose colour comes from density (Rayleigh-blue when thin, greyer when dense) over a black posterior epithelium.

### 4.1 Dilation re-maps the radius

Pamplona, Oliveira & Baranoski (2009) tracked 50 points per iris across drug-induced dilation from 3.7 mm to 8.8 mm and found that the ratio **ρ = |p − c| / |E − c|** — distance from the pupil edge over local annulus width — stays approximately constant for every point. That is Daugman's rubber sheet, and it means the *bake* can be pupil-independent: bake at a reference ratio, and at runtime map `v = (r − r_p)/(r_i − r_p)` with the live `r_p`. Biomechanics (Clark et al., Tomeo-Reyes et al. 2015) shows the real displacement is mildly non-linear — the iris is an orthotropic thin shell, the limbus stays fixed and the pupil edge moves — so add a small bias:

```glsl
// rp = live pupil radius / iris radius, rp0 = bake reference (0.33 undilated, ~0.64 dilated)
float v = clamp((r - rp) / (1.0 - rp), 0., 1.);
float k = 1.0 + 0.35 * (rp - rp0);      // >1 when dilated: pupillary zone packs, ciliary stretches less
v = pow(v, k);
```

Typical human ratio range is 0.2–0.8 (Hollingsworth et al.'s data: 0.21–0.70; undilated mean 0.33, dilated 0.64).

What must change *besides* the remap, because tissue folds rather than stretches: on **dilation** the annulus narrows, so **contraction furrows deepen** (scale furrow depth by `smoothstep(0.35, 0.65, rp)`), the **collarette ridge sharpens**, and the **radial furrows compress** into higher-contrast lines; on **constriction** the annulus widens, fibres straighten, furrows flatten, and **crypts elongate radially and open** (scale the crypt mask's radial extent by `(1 − rp)/(1 − rp0)`). Because these are all masks in T0/T3, they are runtime multipliers, not rebakes.

### 4.2 Animating sphincter and dilator

Drive `rp` with a first-order response to target diameter: Pamplona's PLR model is a delay-differential equation with latency **τ ≈ 253 − 14 ln L + 70R − 29R ln L ms** (L = luminance, R = light frequency term), constriction faster than dilation (≈ 0.3 s vs 1–2 s), and add **hippus** — random noise at 0.05–0.3 Hz, amplitude ~2–4% of ratio. Shade the sphincter ring (`v < 0.12`) slightly brighter and smoother during constriction, and the dilator's radial pull as a faint increase in fibre contrast in the ciliary zone during dilation. Keep the pupil centre offset from the iris centre when remapping; Pamplona notes it is essential to realism.

## 5. Recommended synthesis pipeline

Bake once per seed (or per parameter edit) into a 4096×1024 polar atlas; then sample at runtime.

**Pass 0 — genome.** CPU: hash seed → parameter UBO (~40 floats).
**Pass 1 — fields.** Fragment shader over the polar rectangle: `warp = pfbm(uv·(6,3))`; `fibre = trabeculae(uv)`; `cloud = pfbm(uv·(5,2))`; `v_c(u)` collarette curve; write `fibre, cloud, v_c, warp` to an RGBA16F.
**Pass 2 — features.** Crypt Worley (radially stretched, density band outside collarette), furrow arcs, radial furrows (masked to pupillary zone), spots, nodules → masks target.
**Pass 3 — height & density.** Combine into T0 (height, stroma density, melanin, crypt) with the sum in §4.
**Pass 4 — albedo.** Two colour layers: stroma colour from density (thin → cool/blue-grey, dense → warm grey), top-layer colour from melanin × warm base hue pair mixed in HSL between inner and outer zone; write T1/T2.
**Pass 5 — derivatives.** Normal from height (Sobel in polar, correct the angular step by 1/r), AO by a short-range height difference, 2–3 mip levels.
**Runtime.** Polar lookup with live pupil ratio and §4.1 remap; furrow/crypt multipliers from `rp`; Lefohn two-layer composite; then the cornea parallax/refraction from the other chapters.

**Parameter list** (exposed, all seed-derived, all overridable): `seed`, `melaninTop`, `stromaDensity`, `hueInner`, `hueOuter`, `lipofuscin`, `cellsCoarse/Med/Fine`, `stretchCoarse/Med`, `warpAmp`, `collaretteR`, `collaretteAmp`, `cryptDensity`, `cryptSize`, `furrowCount`, `furrowDepth`, `radialFurrowDensity`, `spotCount`, `noduleDensity`, `limbalWidth`, `limbalDark`, `pupilOffset`, `pupilRatioRef`, `pupilSoftness`.

**Pitfalls.**
1. Non-periodic noise in `u` → a hard seam at 12 o'clock.
2. Same cell count on every octave → a visible N-fold symmetry.
3. Fibres from stretched noise only → the "combed" look; use Worley edges plus interruption.
4. Baking with the pupil in the texture → dilation smears the pupil edge; keep `v` pupil-relative.
5. Sobel normals in polar space without the `1/r` angular correction → normals too strong near the pupil.
6. Eye colour as an albedo tint → looks painted; colour must come from melanin over a scattering stroma.
7. Crypts as plain dark blobs → floating; they must also cut height and stroma density.
8. Uniform detail across the iris → brown eyes need the smeared/cloudy top layer, blue eyes need bare fibres (Texturing.xyz's density rule).
9. Contraction furrows that never change with pupil size → the biggest dynamic tell.
10. Forgetting the pupil offset and non-circular pupil → suspiciously perfect.

## Sources

- [Zuo & Schmid 2007, On Generation and Analysis of Synthetic Iris Images (Semantic Scholar)](https://www.semanticscholar.org/paper/On-Generation-and-Analysis-of-Synthetic-Iris-Images-Zuo-Schmid/e2e666ba6d1dbefb7894f85743175cbc096dbb3f) · [CITeR model-based synthetic iris summary (40 parameters)](https://citer.clarkson.edu/research-resources/biometric-dataset-collections-2/synthetic-iris-model-based/)
- [Shah & Ross 2006, Generating Synthetic Irises by Feature Agglomeration (PDF)](https://www.cse.msu.edu/~rossarun/pubs/ShahIrisSynthesis_ICIP2006.pdf)
- [Cui et al. 2004, An iris image synthesis method based on PCA and super-resolution (IEEE)](https://ieeexplore.ieee.org/abstract/document/1333804/)
- [Wei, Tan & Sun 2008, Synthesis of large realistic iris databases using patch-based sampling (IEEE)](https://ieeexplore.ieee.org/iel5/4740202/4760915/04761674.pdf)
- [Synthesizing Iris Images using GANs: Survey and Comparative Analysis (arXiv 2404.17105)](https://arxiv.org/abs/2404.17105) · [Synthetic Iris Images: Cartesian vs Polar Representation (Sensors 2024)](https://www.mdpi.com/1424-8220/24/7/2269) · [EyePreserve: Identity-Preserving Iris Synthesis](https://arxiv.org/html/2312.12028) · [Synthetic Iris Databases and Identity Leakage (arXiv 2506.02626)](https://arxiv.org/pdf/2506.02626) · [Diffusion StyleGAN for Iris PAD (arXiv 2510.14314)](https://arxiv.org/pdf/2510.14314)
- [Lefohn, Budge, Shirley, Caruso & Reinhard 2003, An Ocularist's Approach to Human Iris Synthesis (eScholarship PDF)](https://escholarship.org/content/qt8d88d3qc/qt8d88d3qc.pdf)
- [Custom ocular prosthesis fabrication technique (J Oral Res Rev)](https://www.ovid.com/jnls/jorr/fulltext/10.4103/2249-4987.192231~a-novel-technique-of-custom-ocular-prosthesis-fabrication) · [Magnification of iris through clear acrylic resin in ocular prosthesis (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8952227/) · [What makes a prosthetic eye look realistic (Eye Concern)](https://www.eyeconcern.com/blog/most-realistic-prosthetic-eye/)
- [Inigo Quilez, Eye (Shadertoy lsfGRr)](https://www.shadertoy.com/view/lsfGRr) · [annotated port of iq's eye shader (gist)](https://gist.github.com/SakuraRinDev/48e2d33bdec07f7cd863d6c3b5727c6a) · [Realistic Eye (Shadertoy XsfGWj)](https://www.shadertoy.com/view/XsfGWj) · [aferriss, iris (Shadertoy ltBBzV)](https://www.shadertoy.com/view/ltBBzV)
- [Adobe / 80.lv, Procedural Iris in Substance 3D Designer](https://80.lv/articles/learn-how-to-make-a-procedural-iris-with-substance-3d-designer) · [80.lv, Breakdown: Procedural Eye Generator in Substance Designer](https://80.lv/articles/breakdown-procedural-eye-generator-in-substance-designer) · [Procedural Eye Generator (FlippedNormals)](https://flippednormals.com/product/procedural-eye-generator-4938)
- [Blender wikibook, Procedural Eyeball in Cycles](https://en.wikibooks.org/wiki/Blender_3D:_Noob_to_Pro/Advanced_Tutorials/Procedural_Eyeball_in_Cycles) · [Blender Artists, node-based procedural eye material](https://blenderartists.org/t/node-based-procedural-eye-material/417944)
- [MetaHuman Materials and Textures (Epic docs)](https://dev.epicgames.com/documentation/metahuman/metahuman-materials-and-textures) · [Custom MetaHuman iris texture (Epic forums)](https://forums.unrealengine.com/t/custom-metahuman-iris-texture/1256439)
- [Texturing.xyz, Discover UHD Iris](https://texturing.xyz/pages/discover-uhd-iris) · [Alfred Roettinger, Realtime Eye (Texturing.xyz)](https://texturing.xyz/pages/alfred-roettinger-realtime-eye)
- [Jimenez, Separable SSS & Photorealistic Eyes Rendering (SIGGRAPH 2012)](http://s2012.siggraph.org/attendees/sessions/separable-subsurface-scattering-photorealistic-eyes-rendering.html)
- [Lagae et al. 2009, Procedural Noise using Sparse Gabor Convolution (PDF)](https://www-sop.inria.fr/reves/Basilic/2009/LLDD09/LLDD09PNSGC_paper.pdf) · [State of the Art in Procedural Noise Functions](https://www-sop.inria.fr/reves/Basilic/2010/LLCDDELPZ10/LLCDDELPZ10STARPNF.pdf)
- [Edwards et al. 2016, Analysis of iris surface features in populations of diverse ancestry (R. Soc. Open Sci.)](https://royalsocietypublishing.org/rsos/article/3/1/150424/36428/Analysis-of-iris-surface-features-in-populations) · [On the development and morphology of iris crypts](https://www.researchgate.net/publication/229822557_On_the_development_and_morphology_of_iris_crypts) · [Brushfield spots and Wölfflin nodules in dark irides (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6303377/)
- [Pamplona, Oliveira & Baranoski 2009, Photorealistic Models for Pupil Light Reflex and Iridal Pattern Deformation (PDF)](https://www.inf.ufrgs.br/~oliveira/pubs_files/PLR/PLR_paper.pdf)
- [Wyatt 2000, A 'minimum-wear-and-tear' meshwork for the iris (Vision Research)](https://www.sciencedirect.com/science/article/pii/S0042698900000687)
- [Tomeo-Reyes, Ross, Clark & Chandran 2015, A Biomechanical Approach to Iris Normalization (PDF)](https://www.cse.msu.edu/~rossarun/pubs/TomeoReyesIrisNormalization_ICB2015.pdf)
- [Hollingsworth, Bowyer & Flynn 2009, Pupil dilation degrades iris biometric performance](https://www.sciencedirect.com/science/article/abs/pii/S1077314208001173) · [Effect of pupil dilation on iris recognition (PMC, ratios 0.33 / 0.64)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10155559/)
