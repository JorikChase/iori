# 03 — Rendering literature: what has been done, and what carries over to WebGL2

This chapter surveys the academic and production work on iris and eye rendering, extracts the concrete technique each contributes, and ends with a recommended pass architecture for a single-page WebGL2 engine that must degrade to a phone tier. Where a claim below rests on a source I could verify this session, the source is in the list at the end; a few implementation details (e.g. the exact contents of Jimenez's GDC slides) are stated from the published material as I remember it and flagged as such.

## 1. Academic work

### Lefohn et al. 2003 — "An Ocularist's Approach to Human Iris Synthesis"

The paper's actual title is the ocularist one (IEEE CG&A, Nov 2003, Lefohn, Budge, Shirley, Caruso, Reinhard); "An Ocular Model for Iris Rendering" is a common mis-citation. The insight is borrowed from prosthetic-eye makers: an ocularist does not paint an iris as one image, they build it as **30-70 semi-transparent painted layers** on a shallow cone. Lefohn's toolkit scans those layers, converts them to opacity maps, stacks them on **cone frustums** (so each layer sits at its own depth) and ray-traces the stack. Layer classes named in the paper: base/stroma layers, collarette, limbus, pupil and sphincter.

Concrete contribution for us: **the iris is a depth-ordered stack of sparse translucent layers over a dark or light base, not a flat texture**. Blue and green eyes are literally "dark base plus thin light-scattering stroma"; brown eyes are pigment-dense front layers. A procedural bake that composites a handful of layer types (base gradient, radial fibres, collarette ridge, crypts as holes in the fibre layer, sphincter ring, limbus vignette, pigment freckles) with per-layer depth reproduces most of the look, and the depth ordering is what later lets a heightfield be derived from the same layers.

### Lam & Baranoski 2006 — ILIT, "A Predictive Light Transport Model for the Human Iris"

Presented at Eurographics 2006 (Computer Graphics Forum 25(3)), ILIT is the first biophysically-based iris light-transport model: a Monte Carlo simulation of scattering and absorption through the anatomical layers (anterior border layer, stroma, iris pigment epithelium), parameterised by melanin concentration, layer thickness and the scattering properties of the stromal collagen. Kravchenko, Baranoski et al. (CAVW 2017) later ported the same model to CUDA to reach interactive rates.

Concrete contribution: **iris colour is emergent, not authored.** Low melanin in the ABL/stroma over the dark IPE gives blue by short-wavelength scattering; increasing melanin walks through grey, green, hazel, brown. For a procedural engine the practical form is a **melanin-and-thickness to reflectance lookup**: bake a small 2D LUT (melanin density x stroma thickness -> RGB albedo, plus a "translucency" scalar) once, fitted to ILIT-style curves or to reference photographs, and have the atlas store melanin/thickness rather than RGB. That gives physically coherent colour variation (a heterochromic ring is simply a melanin gradient) and lets a single "pigment" slider drive the whole population of eye colours.

### François, Gautron, Breton, Bouatouch 2009 — "Image-Based Modeling of the Human Eye"

IEEE TVCG 15(4). From a single photograph they recover the **thickness of the iris stroma layers** and encode it as a **subsurface texture map** (four layer thicknesses in the four channels of one RGBA texture). Rendering is real time and uses two precomputed tables: a **refraction function** (how the cornea displaces the visible iris as a function of view direction and position) and a **caustic function** (how the cornea focuses incident light onto the iris as a function of light direction). The paper explicitly reproduces the caustic visible on the iris in photographs.

Concrete contribution: the exact trio a WebGL2 shader can afford: **thickness map + refraction LUT + caustic LUT**. Everything expensive is a table lookup; only the layered-thickness shading is per-pixel arithmetic.

### Bérard, Bradley, Nitti, Beeler, Gross 2014 — "High-Quality Capture of Eyes"; Bérard et al. 2016 — "Lightweight Eye Capture Using a Parametric Model"

The 2014 SIGGRAPH Asia system reconstructs sclera, cornea and iris of real subjects with a multi-camera rig, uses **refraction constraints** through the cornea to estimate index of refraction and iris geometry, and captures the iris at a **sequence of pupil dilations** to fit a deformable iris model parameterised by pupil radius. The 2016 follow-up builds a parametric model from that database and fits it to a single face scan or even a single internet photo.

Concrete contributions: (a) **the iris has real relief**: crypts are recessed, the collarette is a ridge, fibre bundles stand proud — it is a heightfield, not just a colour; (b) **pupil dilation deforms the iris non-uniformly**: tissue near the pupil compresses more, crypts close up, the collarette moves — a naive radial UV scale is wrong; (c) individual variation in sclera shape and corneal curvature is large enough that "every eye is a sphere with a bump" is a visible simplification. For a procedural engine (b) is the actionable one: warp the polar atlas with a non-linear r(r0, pupil) curve rather than a uniform scale.

### Jimenez / Sousa (production-research crossover)

Jorge Jimenez's GDC 2013 talk "Next Generation Character Rendering" (Activision) covered subsurface scattering, eye shading, physically based shading, film-style tone mapping, bloom and grain in one pipeline, and became the reference for game digital humans. His separable SSS (CGF 2015) is the two-pass screen-space blur that most real-time sclera scattering still uses. Tiago Sousa's Crytek SIGGRAPH 2011 "Secrets of CryENGINE 3" is the other frequently cited early source for **parallax-offset iris under a corneal shell**. (The exact eye slide content of both talks is from memory of the decks; the talks and papers themselves are cited below.)

Concrete contribution: **screen-space separable SSS for the sclera**, and the message that the eye sells only in the context of correct tone mapping, bloom and eyelid contact.

### 2020+ neural and capture-driven eye work

- **EyeNeRF** (Li, Meka, Müller, Bühler, Hilliges, Beeler; SIGGRAPH 2022) is a hybrid: an **explicit parametric eyeball surface** handles corneal refraction and sharp specular reflection, while neural volumes model the periocular skin and interior. Notable because even a neural method keeps refraction and the catchlight explicit — the network cannot learn them well.
- **GazeGaussian** (2024) does gaze redirection with 3D Gaussian splatting, separate streams for face and eye region.
- **EyePreserve** (2023-25) uses an autoencoder to model **non-linear iris texture deformation with pupil dilation** while preserving identity, for biometrics; the 2024 GAN iris-synthesis survey covers the broader biometric texture-synthesis literature (Markov random fields with embedded crypts and furrows, StyleGAN2 irises).

Concrete contribution: none of these are runnable in a phone WebGL2 page, but they confirm two design decisions: keep refraction and specular analytic, and treat pupil deformation as a learned or at least non-linear warp.

## 2. Production real-time eye shaders

### Unreal Engine "Eye" shading model, Digital Humans (Mike, Siren) and MetaHuman

Epic's Digital Humans documentation (4.27, the Mike/Siren era) describes moving from a two-mesh setup (eyeball plus corneal shell) to a **single surface with refraction computed in the material**. The feature list is the de-facto checklist for a photoreal eye:

- **Iris refraction by parallax**: Depth Scale and IOR parameters; a "Mid Plane Displacement" map fixes the plane through the eye centre used to offset iris depth; the iris is treated as a cone/disc rather than following the sphere.
- **Iris normal map** fed through Clear Coat Bottom Normal (`r.IrisNormal=1`), so the iris is lit under a clear-coat cornea.
- **Limbus**: Limbus Dark Scale, Limbus Power, separate UV widths for colour and shading; documented as fading correctly when viewed edge-on.
- **Caustic**: Iris Concavity Power / Scale shape a light-dependent brightening of the iris that simulates corneal focusing.
- **Sclera SSS**: the Subsurface Profile shading model, plus Shadow Hardness / Shadow Radius that approximate the eyelid's scattered shadow across the eyeball.
- **Wetness / meniscus**: dedicated lacrimal-fluid meshes for the tear line under the lower lid, plus a caruncle blend mesh; MetaHumans keep an eyeball, a cornea shell for catchlights, a tear-line mesh with a very glossy material, and an occlusion mesh.
- **Eye occlusion / lid shadow**: a thin AO sheet mesh with its own material, or screen-space contact shadows for translucent materials; both exist to "seat" the eye in the socket.
- **Cornea specular**: separate Specularity Iris and Iris Roughness controls for the corneal dome over the iris; sclera roughness separate; a tangent map bends anisotropy at the cornea-sclera junction. MetaHuman guidance sets the cornea IOR around 1.336.

### Unity HDRP Eye shader

A preconfigured Shader Graph with an Eye master stack; sub-graphs named CirclePupilAnimation, CorneaRefraction, IrisLimbalRing, IrisOffset, IrisOutOfBoundColorClamp, ScleraLimbalRing and ScleraIrisBlend. It requires **separate sclera and iris maps** (each with no information from the other) because SSS, limbal ring and smoothness blend differently across the boundary. Pupil Aperture 0..1 with min/max, diffusion profiles for both sclera and iris, and an **Iris Clamp Color** for refracted rays that leave the iris disc — a detail our POM step must also handle.

### Film: Weta, Pixar, Disney

Weta's Gollum used a displacement trick to fake corneal refraction of the iris; by Alita the iris was a fibrous model of about 8.5 million polygons with simulated fibrovascular strands that stretch and break as the pupil moves; on Avatar 2 the iris model is aligned to the limbal ring and pupil from multiple cameras, accounting for corneal refraction. Pixar builds iris, retina and lens as separate objects under a glass layer and needs Manifold Next Event Estimation for the corneal caustic; they note the sclera cannot be a "white" value. The consistent film lesson: **fibres with depth, a real lens caustic, and a sclera that is a warm, veined, scattering material**.

### The refraction trick, with the formula

All the real-time shaders above do the same thing: shade the corneal surface, refract the view ray, and intersect a virtual iris surface behind it. Let

- `P` = shaded point on the cornea, `N` = cornea normal there,
- `V` = unit vector from `P` toward the camera,
- `E` = eye forward axis (pupil direction), `C` = eye centre,
- `eta = n_air / n_cornea` (1/1.376 for corneal tissue; 1/1.336 if you treat the aqueous as the medium the iris sits in),
- `d` = distance from the cornea apex plane to the iris plane (about 2.2 mm anterior-chamber depth for an eye of radius ~12 mm; UE's Depth Scale).

Then

```glsl
vec3 I  = -V;                                   // incident direction, air side
vec3 R  = refract(I, N, eta);                   // Snell: eta*I - (eta*dot(N,I) + sqrt(1 - eta*eta*(1 - dot(N,I)^2))) * N
// iris plane: points X with dot(X - Pi, E) = 0, Pi = apex - d*E
float t = dot(Pi - P, E) / dot(R, E);           // dot(R,E) < 0 for rays going in; guard with max(-dot(R,E), 1e-3)
vec3 X  = P + t * R;                            // hit on iris plane
vec2 uv = irisUV(X);                            // project X into the iris disc frame (tangent, bitangent of E), r = |X - axis| / irisRadius
```

Cheaper "parallax" variants skip the plane test and just offset UVs by the tangent-plane components of `R` scaled by `d / -dot(R,E)`; that is what the Depth Scale slider does. Because the real iris is a shallow cone/bowl, the plane can be replaced by a **heightfield march** starting at `X` along `R` (Section 3). Refraction also shifts where the pupil appears (it looks larger and nearer than it is), which is why pupil size must be evaluated in refracted UV space, not corneal UV space.

The **caustic** is the same optics run for light: refract the light direction `L` through the cornea, then light the iris heightfield with `L'` and multiply by a focusing gain that grows with the angle between `L` and `E` and with radius (light entering obliquely piles up on the far side of the iris). François et al. precompute this as a 2D function; UE parameterises it with the two Concavity controls.

## 3. Techniques that transfer to WebGL2

**Baking a polar iris atlas offscreen.** Parameterise the iris by `(theta, r)` with `r` running from pupil margin to limbus; wrap REPEAT in theta, CLAMP in r. Bake once per parameter change into an MRT framebuffer (`gl.drawBuffers`, 3-4 attachments):

- A0 **height** (R16F; or R8 on the phone tier) — collarette ridge, fibre bundles raised, crypts recessed, sphincter ring, radial furrows.
- A1 **albedo / melanin** (RGBA8: melanin density, stroma thickness, freckle pigment, blend to limbus) — resolved to RGB through the ILIT-style LUT at shade time, or pre-resolved to RGB on the phone tier.
- A2 **crypt mask + fibre direction** (RGBA8: crypt coverage, cos/sin of fibre angle, collarette mask) — the mask drives translucency and shadow; the direction drives anisotropic highlights and the furrow shading.
- A3 (laptop/render) **horizon / micro-AO** derived in a second pass from A0.

Generate mips after baking (RGBA8 always; RGBA16F is filterable and mip-able in WebGL2 with `EXT_color_buffer_float`).

**Parallax occlusion / relief mapping against the heightfield.** After refraction gives `R`, march the height atlas in polar space from the entry point: N linear steps (phone 0-4, laptop 16, render 48) followed by a few bisection steps. Sample the height along the ray in atlas texel units, scale by the physical relief (~0.2-0.4 mm peak-to-trough against 2.2 mm chamber depth — the relief parallax is small but it is exactly what separates a photo from a painting). Rays that exit the disc get Unity's out-of-bound clamp (sclera colour behind the limbus, pupil black inside).

**Horizon-based micro shadowing.** Classic horizon mapping: at bake, for each texel compute the maximum horizon angle in K azimuths (K = 8 packed into two RGBA8 textures; K = 4 on phone). At shade, look up the horizon in the direction of the refracted light `L'` and attenuate diffuse by a smoothstep of light elevation against it; crypts and the shadow side of the collarette then darken with light direction the way they do in macro photographs. A bent normal + AO pair is the phone fallback.

**Precomputed corneal caustic.** A 64x64 R16F LUT over (angle between `L` and `E`, iris radius) built once by tracing a grid of parallel rays through a corneal sphere (radius ~7.8 mm) into the iris plane and binning hits; store gain relative to the unrefracted density. Phone tier: 32x32 R8 with a fixed 4x gain scale. Apply as a multiplier on direct-light irradiance only, not on IBL.

**Image-based lighting with a small HDR.** The catchlight is the single most identity-carrying feature, so the environment must contain a genuine bright source. Store a 256x128 equirect (512x256 render tier) as RGBA16F where renderable, otherwise **RGBM in RGBA8** (phone) — `RGB9_E5` is uploadable in WebGL2 but not renderable, so keep it for static maps only. Prefilter into a roughness mip chain (split-sum) plus SH9 irradiance for the sclera and iris diffuse. Because cornea roughness is ~0.02-0.05, the prefiltered chain barely matters for the cornea; it matters for the sclera's broad wet gloss.

**Progressive accumulation.** Ping-pong two RGBA16F targets (RGBA32F on laptop/render; iOS cannot render to 32F and cannot filter it, and blending into float needs `EXT_float_blend`). Each frame: sub-pixel jitter, a stochastic light sample from the env (importance-sampled by luminance), a random POM step phase, a random SSS offset; blend `1/(n+1)` into the accumulator and reset on any change. 8-16 frames already remove POM banding; 256+ gives path-traced-looking soft shadows and area catchlights.

**Tiled high-resolution capture.** MAX_TEXTURE_SIZE is 4096 on most phones and 8192-16384 on desktop, and the canvas backing store is bounded similarly; render an 8k or 16k still as a grid of tiles by shifting the projection (off-centre frustum), accumulating each tile fully, `readPixels` into a typed array, and stitching in JS to a PNG/WebP. The accumulation buffers are re-used per tile.

**Filmic tone mapping.** Accumulate linear; then ACES-fitted (Narkowicz or Hill) or AgX, a small bloom on the catchlight, dither, sRGB encode. Blooming the catchlight and slightly rolling off the sclera is a large part of "looks like a photo".

**WebGL2 limits to design around.** No compute shaders (everything is fragment passes; transform feedback for any per-vertex work); float render targets only via `EXT_color_buffer_float` / `EXT_color_buffer_half_float`; iOS rejects 32F render and filtering (use 16F everywhere on the phone tier); MRT via `gl.drawBuffers` with `MAX_DRAW_BUFFERS` typically 8 but only 4 guaranteed, and mixing attachment formats can fail on some drivers; `MAX_TEXTURE_SIZE` 4096 on many mobiles; no bindless textures, so budget the sampler count (16 fragment samplers guaranteed); GLSL ES 3.00 gives `texelFetch`, `textureLod`, 3D textures, UBOs, integer ops, and mandatory `highp` in fragment shaders, which the refraction maths needs.

## 4. What the best current results look like, and what still gives them away

The strongest references today are MetaHuman close-ups under good HDRI lighting, Weta's Alita/Avatar 2 irises, the Bérard captures, and EyeNeRF re-renders of captured eyes. They share: a visibly three-dimensional iris (crypts you can look into, a collarette that catches light), a limbus that is a soft translucent gradient rather than a ring, a sclera that is warm, veined and slightly translucent, a correctly shaped catchlight with a bloom halo, a tear-line highlight along the lower lid, and eyelid contact shadow with scattered red at the lid edge.

What still gives CG eyes away:

- **Painted-flat iris**: no relief parallax when the head moves, no light-direction-dependent crypt shadows.
- **Uniform iris colour**: real irises have a darker outer stroma, a lighter or different-hue collarette zone, radial streaks, pigment freckles.
- **Too-regular fibres**: procedural periodicity (equal spacing, identical width) reads instantly; real fibre bundles branch, cross and vary 3x in width.
- **Perfect circle pupil with a hard edge**: real pupil margins are slightly irregular (the pupillary ruff) and the edge is softened by refraction.
- **Sclera too white, too smooth, no translucency**: it should be off-white, redder toward the canthi, with veins that scatter.
- **Wrong catchlight**: a single hard sharp dot; real ones are the shape of the light source, doubled faintly by the lens/second surface, bloomed.
- **No meniscus / tear-line highlight and no lid occlusion**: the "floating eyeball".
- **Refraction ignored on gaze change**: the iris appears to slide rather than rotate under a lens.
- **No caustic**: strongly side-lit irises should brighten on the far side.
- **Linear pupil dilation**: crypts do not close and the collarette does not move.
- **Stillness**: no micro-saccades, no slow dilation drift.

## 5. Recommended architecture for the web engine

```
                     ┌──────────────── on parameter change ────────────────┐
                     │  BAKE PASS (MRT, polar atlas)                       │
 params/seed ──────► │  A0 height  A1 melanin/thick  A2 crypt+fibre  A3 AO  │
                     │  + horizon pass (from A0)   + mips                   │
                     └──────────────────────────────────────────────────────┘
                     ┌──────────────── on load ────────────────────────────┐
                     │  LUTs: melanin->RGB (256x64), caustic (64x64),       │
                     │  env prefilter chain + SH9                           │
                     └──────────────────────────────────────────────────────┘
                                             │
   camera, light ──► SHADE PASS (one full-screen quad, analytic eyeball)   │
                     ray vs sclera/cornea spheres -> Fresnel + GGX cornea  │
                     -> refract -> POM on A0 -> iris shading (LUT, fibre   │
                     aniso, horizon shadow, caustic) | pupil | limbus      │
                     | sclera SSS | lid occlusion | meniscus               │
                     -> linear HDR RGBA16F                                  │
                                             │
                     ACCUMULATE (ping-pong, jittered, reset on change)      │
                                             │
                     TONEMAP (bloom, ACES/AgX, dither, sRGB) -> canvas     │
                     (RENDER tier: tiled off-centre projection -> stitch)   │
```

The eyeball is ray-traced analytically in the fragment shader (two spheres: sclera radius ~12 mm and cornea radius ~7.8 mm offset forward, joined with a smooth limbus blend), so no mesh, no tangent-space, and the refraction runs in world space exactly as in the formula above.

| Stage / resource | Phone | Laptop | Render (still) |
|---|---|---|---|
| Polar atlas (theta x r) | 1024x256, RGBA8 x3, R8 height | 2048x512, RGBA8 x3 + R16F height | 4096x1024, RGBA8 x3 + R16F height |
| Horizon maps | bent normal + AO (1 RGBA8) | 8 azimuths (2 RGBA8) | 16 azimuths (4 RGBA8) |
| Melanin LUT | pre-resolved RGB in A1 | 256x64 RGBA8 | 256x64 RGBA16F |
| Caustic LUT | 32x32 R8 | 64x64 R16F | 64x64 R16F |
| Env map | 128x64 RGBM RGBA8, 5 mips | 256x128 RGBA16F, 7 mips + SH9 | 512x256 RGBA16F, 8 mips + SH9 |
| POM | 1-step parallax offset | 16 linear + 4 bisect | 48 linear + 6 bisect |
| Sclera SSS | analytic wrap + red rim | separable screen-space blur (2 passes) | stochastic multi-sample in accumulate |
| Accumulation | RGBA16F, 8 frames, 1x DPR | RGBA32F, 64-256 frames, DPR | RGBA32F, 1024+ frames per tile |
| Output | canvas at device px, 60 fps target | canvas at DPR, converges in ~2 s | tiled 8k-16k PNG/WebP |
| Tonemap | ACES fitted, no bloom | ACES/AgX + small bloom | ACES/AgX + bloom + film grain |

Tier selection at startup: probe `EXT_color_buffer_float` (else half-float), `MAX_TEXTURE_SIZE`, `MAX_DRAW_BUFFERS`, and a 200 ms timing of the shade pass; phones fall to the first column, anything that renders 32F and is > 4096 gets the second, and the third is an explicit "render still" action rather than a live mode.

## Sources

- [Lefohn et al., An Ocularist's Approach to Human Iris Synthesis (IEEE CG&A 2003), ACM DL](https://dl.acm.org/doi/10.1109/MCG.2003.1242384) · [project page, Utah](https://www.sci.utah.edu/~lefohn/work/eye/) · [Semantic Scholar](https://www.semanticscholar.org/paper/An-Ocularist's-Approach-to-Human-Iris-Synthesis-Lefohn-Budge/243fba8cd2ba78b148112e6bb362808b1680e64a)
- [Lam & Baranoski, A Predictive Light Transport Model for the Human Iris (EG 2006 / CGF)](https://onlinelibrary.wiley.com/doi/10.1111/j.1467-8659.2006.00955.x) · [PDF, NPSG Waterloo](http://www.npsg.uwaterloo.ca/resources/docs/eg06.pdf)
- [Kravchenko et al., High-fidelity iridal light transport simulations at interactive rates (CAVW 2017)](https://onlinelibrary.wiley.com/doi/abs/10.1002/cav.1755) · [teaser page](https://www.npsg.uwaterloo.ca/people/boris/teaser.php)
- [François, Gautron, Breton, Bouatouch, Image-Based Modeling of the Human Eye (IEEE TVCG 2009)](https://dl.acm.org/doi/10.1109/TVCG.2009.24) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/19590107/) · [Semantic Scholar](https://www.semanticscholar.org/paper/Image-Based-Modeling-of-the-Human-Eye-Fran%C3%A7ois-Gautron/ef85995cd64f656ea2a1ebe3d6f1a1756c7f4ed0)
- [Bérard et al., High-Quality Capture of Eyes (SIGGRAPH Asia 2014), ACM DL](https://dl.acm.org/doi/10.1145/2661229.2661285) · [ETH CGL page](https://cgl.ethz.ch/publications/papers/paperPas14a.php) · [Disney Research PDF](https://la.disneyresearch.com/wp-content/uploads/High-Quality-Capture-of-Eyes-Pub-Paper.pdf)
- [Bérard et al., Lightweight Eye Capture Using a Parametric Model (SIGGRAPH 2016)](https://dl.acm.org/doi/10.1145/2897824.2925962) · [Disney Research page](https://la.disneyresearch.com/publication/parametereyes/)
- [Jimenez, Next Generation Character Rendering (GDC 2013) slides](https://www.iryoku.com/stare-into-the-future/) · [GDC Vault](https://gdcvault.com/play/1018270/Next-Generation-Character) · [Jimenez, Jarabo, Gutierrez, Separable Subsurface Scattering (CGF 2015)](https://onlinelibrary.wiley.com/doi/10.1111/cgf.12529)
- [Sousa et al., Secrets of CryENGINE 3 Graphics Technology (SIGGRAPH 2011)](https://www.slideshare.net/slideshow/secrets-of-cryengine-3-graphics-technology/8965077)
- [Li et al., EyeNeRF (SIGGRAPH 2022), arXiv](https://arxiv.org/abs/2206.08428) · [ACM DL](https://dl.acm.org/doi/10.1145/3528223.3530130)
- [GazeGaussian: High-Fidelity Gaze Redirection with 3D Gaussian Splatting (2024)](https://arxiv.org/abs/2411.12981)
- [EyePreserve: Identity-Preserving Iris Synthesis](https://arxiv.org/html/2312.12028) · [Synthesizing Iris Images using GANs: Survey (2024)](https://arxiv.org/html/2404.17105v2)
- [Unreal Engine 4.27 Digital Humans documentation (eye shading model, Mike/Siren)](https://dev.epicgames.com/documentation/en-us/unreal-engine/digital-humans?application_version=4.27) · [MetaHuman Eye Material Tools](https://dev.epicgames.com/documentation/metahuman/eye-material-controls) · [MetaHuman realism guide (cornea IOR, tear line, occlusion mesh)](https://yelzkizi.org/make-metahumans-look-realistic/)
- [Unity HDRP Eye Shader documentation (14.0)](https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@14.0/manual/eye-shader.html)
- [Epic: Siren at FMX 2018](https://www2.unrealengine.com/events/siren-at-fmx-2018-crossing-the-uncanny-valley-in-real-time?lang=pt-BR) · [fxguide: Epic's State of Unreal + Virtual Human, GDC 2018](https://www.fxguide.com/fxfeatured/epics-state-of-unreal-virtual-human-gdc-day-2-part-1/)
- [fxguide: Weta Digital's face pipeline on Alita (8.5M-polygon fibrous iris)](https://www.fxguide.com/fxfeatured/weta-digitals-remarkable-face-pipeline-alita-battle-angel/) · [fxguide: Joe Letteri on Avatar 2 facial pipeline](https://www.fxguide.com/fxfeatured/exclusive-joe-letteri-discusses-weta-fxs-new-facial-pipeline-on-avatar-2/) · [Eyes, Irises and VFX (Pixar Louise, Weta, Disney notes)](https://www.katexagoraris.com/misc-4/eyes,-irises,-and-vfx)
- [GameDev.net: Eye shader parallax refraction (iris plane 2.18 mm behind apex, 1/1.376)](https://www.gamedev.net/forums/topic/669948-eye-shader-parallax-refraction-help/) · [GameDev.net: Eye rendering parallax correction](https://www.gamedev.net/forums/topic/670999-eye-rendering-parallax-correction/)
- [Khronos WebGL EXT_color_buffer_float](https://registry.khronos.org/webgl/extensions/EXT_color_buffer_float/) · [MDN EXT_color_buffer_half_float](https://developer.mozilla.org/en-US/docs/Web/API/EXT_color_buffer_half_float) · [MDN EXT_float_blend](https://developer.mozilla.org/docs/Web/API/EXT_float_blend) · [Apple Developer Forums: iOS float render limits](https://developer.apple.com/forums/thread/727443)
- [webgl2fundamentals: cross-platform issues (MRT format combinations)](https://webgl2fundamentals.org/webgl/lessons/webgl-cross-platform-issues.html) · [Web3D Survey: MAX_TEXTURE_SIZE](https://web3dsurvey.com/webgl2/parameters/MAX_TEXTURE_SIZE) · [Khronos WebGL 2.0 specification](https://registry.khronos.org/webgl/specs/latest/2.0/)
