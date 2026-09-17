# 00 — Study summary and engine specification

This file condenses chapters 01–05 into the decisions the Iris Engine is built on. Where a chapter disagrees with the current `iris-engine/index.html` (the meta-iris fork), the chapter wins. Chapters:

- [01 Anatomy and optics](01-anatomy-and-optics.md) — geometry in millimetres, refraction, zones, layers, dilation, pathology list
- [02 Colour science](02-colour-science.md) — melanin + scattering model, per-category parameters, lighting dependence
- [03 Rendering literature](03-rendering-literature.md) — what academia and production engines do, WebGL2 architecture and limits
- [04 Photography and references](04-photography-and-references.md) — how macros are shot, what the camera adds, the reference set
- [05 Procedural synthesis](05-procedural-synthesis.md) — trabecular network, named features, genome, dilation remap, bake pipeline

## 1. What was wrong with meta-iris (the fork's starting point)

| Symptom in the fork | Cause | Chapter that fixes it |
|---|---|---|
| Fibres look combed | parallel ridged noise, no junctions | 05 §3.1, §3.3 |
| One texture everywhere | no pupillary / collarette / ciliary zones | 01 §3, 05 §3.2 |
| Colour is a tint | RGB constants mixed by one slider | 02 §4 |
| Pupil is a hard black disc | no ruff, no refraction softening | 01 §3, 03 §2 |
| Iris sits in a bowl | chamber ~0.8 iris radii deep, single-sphere cornea | 01 §1, §7 |
| Phong dot highlight | no environment, no source shape | 04 §A, 03 §3 |
| Detail is expensive and blurry | noise evaluated per raymarch step | 03 §5, 05 §5 |

## 2. Fixed decisions

**Units and frame.** Millimetres. Origin at the corneal apex, +z into the eye, +x nasal for a right eye, +y up. Everything below is in that frame.

**Geometry (01 §7).**
- Cornea front: ellipsoid, apical radius 7.8, Q = −0.26; back surface R 6.5 at z 0.54. Limbus at r 5.85 horizontal / 5.4 vertical.
- Iris root ring r 6.0 at z 4.2; pupil margin at z 3.5 (0.7 mm anterior of the root); truncated cone plus a 0.2 mm convex bulge peaking at 60 % of the annulus.
- Pupil 4.0 mm default (2–8), centre +0.25 nasal / +0.15 superior, ellipticity 0.98.
- Ruff bead 0.08 mm, ~70 scallops. Collarette at pupil radius + 1.5 mm, 20–40 lobes, 0.1 mm high.
- Sclera: pure white, no shading, no highlight, no limbus darkening on the sclera side. It must be indistinguishable from the page background. The limbal ring is drawn on the *iris* side only (01 §3: ~55 % of it is optical, so it comes from Fresnel and grazing refraction in the cornea shader plus a peripheral pigment gradient).

**Optics (01 §2).** Tear film n 1.336 is the only refracting surface needed for the iris; refract both view rays and light rays through it. Unit tests: pupil magnification 1.13 at 3.6 mm depth, root magnification 1.06, entrance pupil at z 3.05, far/near brightness ratio 1.3–2 under a single key light. Fresnel at the tear film (R0 2 %) supplies all highlights.

**Colour (02 §4, §6).** No RGB albedo anywhere. Per texel the atlas stores melanin density (ABL), stromal melanin, stroma scattering density, stroma thickness, pheomelanin ratio; the shader resolves them through the two-layer Kubelka–Munk model, or through a baked 256×64 LUT on the laptop tier. The ten presets of 02 §4.4 are the casebook's starting genomes. `rayleighExponent` defaults to 4 with an artist range to 6 until a spectral LUT exists.

**Texture (05 §5).** One 32-bit seed → ~40 genome parameters → a 4096×1024 polar atlas baked in five fragment passes (fields, features, height+density, albedo layers, derivatives) into four RGBA targets. Trabeculae come from periodic, radially stretched Worley edges with domain warp, never from stretched noise alone. Crypts cut height *and* stroma density *and* remove the melanin film (holes in the anterior border layer, 01 §3; chapter 05's "raise melanin" is superseded). The bake is pupil-independent; dilation is a runtime remap `v = pow((r − rp)/(1 − rp), 1 + 0.35(rp − rp0))` plus furrow/crypt multipliers.

**Shading (03 §3, §5).** One full-screen fragment shader traces the analytic eye, refracts, does parallax-occlusion mapping against the height atlas (phone 1 step, laptop 16 + 4 bisect, render 48 + 6), horizon-based micro shadowing from baked horizon maps, a 64×64 corneal caustic LUT on direct light only, image-based lighting from a small prefiltered HDR with a real bright source, progressive jittered accumulation, filmic tone mapping with a small bloom on the catchlight.

**Camera (04 §A).** 100 mm-equivalent perspective at 15–25 cm; DOF sized for f/11–f/16 at 1:1–1:2 with the focal plane on the iris; catchlight = mirrored source shape on the 7.8 mm sphere; upper-lid shadow band darkening the top third of the iris even though no lid is drawn; shadow noise, mild lateral chromatic aberration at the limbus, no vignette; pupil floor lifted to 2–5 % by corneal flare.

**Modes.** The page keeps the meta-iris realtime engine reachable through a mode button; it is the fallback when WebGL2 float render targets are missing and the "alien" style layer for the casebook's last chapter. Both modes render white sclera on white.

## 3. Quality tiers (03 §5)

| | Phone | Laptop | Render still |
|---|---|---|---|
| Atlas | 1024×256 | 2048×512 | 4096×1024 |
| POM | 1 step | 16 + 4 | 48 + 6 |
| Accumulation | 16F, 8 frames | 32F, 64–256 frames | 32F, 1024+ per tile |
| Output | device px, 60 fps | DPR, ~2 s converge | tiled 8k–16k PNG |

Tier chosen at start by probing `EXT_color_buffer_float`, `MAX_TEXTURE_SIZE`, `MAX_DRAW_BUFFERS` and a 200 ms timing of the shade pass.

## 4. How the casebook is scored (04 §B, 02 §2)

Each case pairs one reference photo from `iris-engine/ref/` with one genome. Comparison is not a pixel diff. Three measurements are taken in the compare view after aligning pupil centre, pupil radius and limbus radius:

1. **Radial luminance profile** (mean L* per radius bin, 64 bins) — checks zone brightness ordering: pupillary zone darker, collarette lighter, ciliary most saturated, limbal fall-off.
2. **Radial chroma profile** (mean a*, b* per bin) — checks the central heterochromia ring and the blue → warm transition.
3. **Angular structure spectrum** (power in the angular direction at the ciliary zone) — checks fibre density and the absence of N-fold periodicity.

A case is "matched" when all three profiles sit inside the tolerance band that the two photos of the same category define between themselves.

## 5. Build order

1. **Geometry + optics**: new analytic eye in mm, two-surface cornea, refraction tests, white sclera. Keep the meta-iris texture temporarily so the geometry can be judged alone.
2. **Bake**: polar atlas with genome UBO, five passes, atlas viewer in the UI.
3. **Material**: two-layer colour model, presets, ruff, limbal ring.
4. **Light**: HDR environment with source shape, caustic LUT, horizon shadows, lid band.
5. **Camera + capture**: DOF, tone map, accumulation everywhere, tiled capture.
6. **Casebook + compare**: reference overlay, the three profiles, share URLs.
7. **Tiers + mode button**: phone fallback, meta-iris mode, `site.py all`.

Reference images: `iris-engine/ref/` with `ATTRIBUTION.md` and `refs.json`, both generated by `iris-engine/study/select_refs.py` from the Commons survey in `refs-human.json`.

## 6. Phase 1 log (2026-09-12)

Built in `iris-engine/index.html` as the `fs-photo` program; the original engine is kept verbatim as `fs-meta` behind the META button.

- Analytic eye in mm: conicoid cornea (R 7.8, Q −0.26) intersected exactly, posterior corneal sphere (R 6.5 at z 0.54), aqueous 1.336, iris as a surface of revolution about the decentred pupil (root z 4.2, margin z 3.5, 0.2 mm bow at v 0.6), elliptical limbus 5.85 × 5.40, pigment ruff, white sclera with no shading.
- View rays refract air → cornea → aqueous; light rays refract at the tear surface above the shaded point and are tested against the limbus for the scleral overhang shadow.
- Camera: 100 mm lens, 24 mm sensor, pivot 13 mm behind the apex, wheel = distance 40–400 mm.
- Legacy meta-iris texture remapped onto tissue coordinates (v from margin to root, angle about the pupil centre) with its relief converted to a bump normal.

Measurements (head-on, pupil 4.0 mm, limbus 11.7 mm):

| Test | Expected (01 §7) | Measured |
|---|---|---|
| Apparent pupil / limbus, refraction on | 0.386 | 0.383 |
| Apparent pupil / limbus, refraction off | 0.342 | 0.340 |
| Far-side / near-side iris brightness, key light at 34° elevation | 1.3–2 (estimate) | 0.86 |

The far/near figure is inverted relative to the chapter's estimate. The limbus shadow does appear (debug view 2) but only on the outer ~1 mm of the near side at this elevation; the cone tilt of the iris makes the near side face the light and its Lambertian term dominates. The chapter marked that number as derived, not measured, so the geometry stands and the estimate is withdrawn until a reference photo with a known light angle is measured in Phase 6.

Open from Phase 1: rendering at CSS pixels (not device pixels) as before; `u_isMobile` unused by the photo shader; the meta-only DILAT slider is hidden in photo mode and PUPIL (mm) replaces it.

## 7. Phase 2 log (2026-09-12)

Baked polar atlas, as `fs-bake` in `iris-engine/index.html`, drawn once per genome change into two RGBA16F targets (2048×512, or 1024×256 when `MAX_TEXTURE_SIZE` ≤ 4096), mipmapped, sampled by the photo shader with an explicit lod computed from the screen footprint in mm (polar derivatives are unusable at the seam).

- **Genome**: seed → ~30 parameters via a mulberry32 PRNG with the prevalences of 01 §3 (9 % no crypts, 58 % spots, 37 % Wölfflin). Six of them are exposed as sliders (PIGM, STROMA, WARP, COLLAR, CRYPT, FURROW) and override the seed. NEW SEED re-rolls.
- **T0** = height (mm) | stroma density | melanin | crypt mask. **T1** = collarette | furrow | spot | nodule. ATLAS button shows the five strips; MAPS button cycles debug views of the sampled height and material.
- **Trabeculae**: two periodic Worley fields whose cells are `stretch` times taller than wide in millimetres, so their edges run radially, plus a fine 400×40 directional grain and the ocularist's cloudy layer. The first attempt used the chapter's `N / stretch` cell ratio literally, which in atlas space made cells *wider* than tall and produced a leather pattern; corrected to `M = 0.16 N / stretch` (see the comment in `worley()`).
- **Crypts** have their own field: every kept lattice cell paints a soft radially elongated lens around its feature point, so shapes are not clipped by the Voronoi polygon. Density-banded outside the collarette, with a weaker peripheral ring.
- **Furrows** are 2–5 concentric arcs windowed by a 5-cell noise so they cover 40–200°; radial furrows are masked to the pupillary zone; nodules sit on a regular 100-cell ring outside v = 0.86.
- **Runtime**: dilation remap `v = pow(v, 1 + 0.35 (rp − 0.33))`, furrow and crypt multipliers from the pupil ratio, one-step parallax against the baked height, normals from height differences scaled to mm with the remap's derivative.
- **Colour**: the chapter-02 two-layer model is already in the shader (`irisAlbedo`) driven by the baked melanin and stroma maps with per-seed pheomelanin and Mie fractions, and output is now sRGB-encoded. Presets, the ruff colour, the limbal ring and the spectral LUT remain Phase 3.

What still gives it away, for Phase 3–4: crypt walls read as rims because there is no shadowing yet (horizon maps are Phase 4); the collarette is a smooth ridge rather than a zigzag; the fine grain dominates the coarse bundles; the near/far lighting asymmetry is still the Phase 1 cone diffuse.

## 8. Phase 3 log (2026-09-12)

Material and presets, plus a scope change: the page no longer embeds the meta-iris engine. iori's call: the two pages link to each other instead, so the panel carries only the photometric controls. `fs-meta`, the mode switch, the A1–F6 presets and the hue/saturation/focus style sliders are gone; the header has a META IRIS → link.

- **Presets** (`EYE_PRESETS` in the page): the ten chapter-02 categories with Ma, Ds, mie, pheo, central-ring strength and radius, limbal darkness, spot count and nodule density. They set the sliders and override the seed's colour genes; the seed keeps driving structure.
- **Calibration**: the Kubelka–Munk slab is evaluated at the chapter's optical thickness (a ×4 factor I had added made blue and grey ~L* 75 instead of 52). With that removed and `rayleighExponent` 4 the model reproduces the chapter table: blue 115,124,145 → rendered ciliary mean 124,130,151 under the key light; grey and green within 2 steps; brown exact. Genome default `rayExp` 4.5.
- **Central heterochromia**: computed at runtime, not baked — a melanin ring inside `ringR` whose edge is pushed outward along the fibre bundles (bright stroma = a bundle), soft ±0.07 in v, pheomelanic (0.8) inside. Slider RING; presets: blue 0.25 @ 0.28, green 0.5 @ 0.34, hazel 1.2 @ 0.42.
- **Pheomelanin and Mie** are sliders (PHEO, MIE) and per-preset; grey is Mie 0.85.
- **Ruff**: ~70 scallops (plus a 23-lobe modulation) whose amplitude rises with dilation; albedo 1.5 × R_ipe.
- **Limbus**: the peripheral cornea goes milky over the last 10 % of the limbus radius before the white takes over; the dark ring itself is baked peripheral pigment plus the grazing-angle Fresnel loss.
- **Lighting gain** normalised so a fully lit ciliary zone shows the calibrated albedo (was ×1.3 + 0.25 wrap).
- **Spots** resized to 0.3–0.8 mm on a 40-cell lattice.

Observed against the chapter targets: light categories are right; amber and green are under-saturated exactly as 02 §4.4 predicts for a 3-band Rayleigh (the spectral LUT stays on the list). Dark brown renders lighter than its target because the wrap term and the environment sheet add light; Phase 5's exposure will settle that.

## 9. Plan revision: matching real photographs procedurally (rewritten 2026-09-12)

Requirement from iori, in its final form: the engine must reproduce any high-quality iris photograph, but **the iris is always built procedurally from code and numbers**. No photo-derived texture is stored or shipped. Photos are ground truth that *advances the procedural rules and the renderer*; for a specific eye the engine *fits* its procedural description to the photo, and the deliverable is that description: a compact, loadable **iris ID** that regenerates the same unique iris at any pupil size, light and camera, forever.

(An earlier draft of this section proposed unwrapping the photo into the atlas with a residual map. Withdrawn: that yields an image, not code, and teaches the engine nothing.)

### 9.1 Hierarchical genome

The current genome is ~30 global numbers plus seeded noise. To match a specific eye every visible structure becomes an explicit parametric object generated by the shader:

| Object | Parameters | Generated by |
|---|---|---|
| Collarette | Fourier series, ~40 harmonics of radius vs angle; height, width | ridge in the bake |
| Crypt (each) | centre (θ, v), size, aspect, orientation, depth, rim softness | lens field in the bake |
| Contraction furrow (each) | start/end angle, radius curve (3 coefficients), width, depth | groove in the bake |
| Fibre bundle (each) | short spline (3–5 control points in θ, v), width, brightness, height | rasterised as a distance field in the bake |
| Radial furrow field | density, phase seed, shear | seeded noise (identity-irrelevant) |
| Spot / nevus / nodule (each) | centre, size, shape noise seed, melanin, height | as today |
| Heterochromia ring | radius Fourier series, strength, pheo | runtime |
| Zone colours | melanin, stroma, pheo, thickness per zone (pupillary, collarette, ciliary, limbal) | material |
| Fine grain | amplitude, frequency, seed | seeded noise, statistically fitted only |

An ID is a few hundred to a few thousand numbers: JSON for the casebook, a base64 string for URLs. Loading one rebuilds the atlas from code in tens of milliseconds.

### 9.2 Fitting pipeline (Phase 6)

1. **Alignment** — pupil centre/radius, limbus ellipse, catchlight(s) → camera, eye rotation, pupil mm (via 01 §2 magnification), key direction. Editable.
2. **Global fit** — zone colours and global genes against the radial luminance/chroma profiles and the angular spectrum (§4), rendered through the real engine at the solved pose.
3. **Structure detection** — unwrap the photo through the engine's forward path (texel → iris point → cornea → pixel); detect collarette (ridge tracking), crypts (dark lens blobs), furrows (concentric edges), bundles (ridge filters along v), spots; instantiate each as an object with initial parameters.
4. **Object refinement** — gradient-free optimisation (CMA-ES / coordinate descent) of each object's parameters, and then all jointly, against the photo inside the iris mask, with the renderer as the forward model. Several photos of the same eye, or a flash/no-flash pair, constrain height.
5. **Residual audit** — the difference image is kept for analysis only. Systematic residuals across many eyes are the engine's to-do list (missing generator, wrong colour term, wrong lighting term). This is how the photos improve the rules.
6. **Export** — the ID. The casebook stores IDs and links to the photo; a case page reloads the ID and shows render vs photo with the scores.

### 9.3 Scores and the honest limit

Every nameable structure can be matched exactly. The stochastic fine grain between bundles cannot be pixel-exact from a compact description without storing pixels, which the requirement forbids. Targets: PSNR ≥ 35 dB inside the iris mask at quarter resolution (grain averaged out) and full-resolution PSNR reported alongside; structural checks: crypt count/positions, collarette curve error < 0.05 mm, furrow endpoints, zone colours within 2 ΔE. If exact grain is ever required, a stored grain layer is the only route and would be a separate explicit decision.

### 9.4 Consequences for the phases

- **Phase 5** unchanged: fitting needs a deterministic camera (reference-pose mode: no jitter, DOF or grain; explicit exposure and white balance).
- **Phase 5b — genome refactor**: the bake gains explicit object lists (uploaded as textures or UBOs) for collarette, crypts, furrows, bundles, spots; the seed becomes the *default initialiser* of those lists, so today's behaviour is unchanged.
- **Phase 6 — fitter** as in 9.2, in-page (WebGL renders, JS optimiser) with a worker for the search.
- **Phase 7** as before, plus ID import/export in the URL.

## 10. Phase 4 log (2026-09-12)

Lighting, built so that every term is a separable factor the capture pipeline (§9) can predict per texel.

- **Studio environment** (`envRadiance`): a key source of selectable shape — disc (sun / bare flash), landscape softbox, ring flash centred on the lens, twin flash ±0.5 rad about the key — with angular size, plus a white room whose brightness is the ROOM slider. Radiometry: the key gives irradiance 1 on a facing surface; source radiance = 1 / solid angle, so the catchlight clips at any size and the display maps radiance × π. The corneal reflection is `F · π · env(reflect(view))`, which yields the source's shape on the tear film and a faint room sheet, both darkened by the lid for steep upward directions.
- **Corneal caustic without a LUT**: for each iris point the key is refracted at its true entry point (three refract-intersect iterations; a single refraction with the normal above the point breaks on the far side) and the entry footprint of a 0.05 mm iris patch is measured from two extra entries. Irradiance = entry cosine × footprint ratio / internal cos × (1 − Fresnel at entry) × limbus shadow. Under a 20° key this makes the near side limbus-shadowed and the far side dark because its cornea is nearly parallel to the rays — checked factor by factor with debug views 8, 10, 11, 12.
- **Parallax march** replaces the one-step offset: 10 linear + 4 bisection steps between +0.16 and −0.32 mm of relief along the refracted view ray.
- **Self-shadowing**: a 7-step march from the shaded point toward the refracted key over the height field with a 6 µm bias; crypt walls shadow their floors, fibres (±20 µm) do not at these angles, as expected.
- **Upper lid**: LID slider (mm above centre) drives a 65 % shadow band across the top of the iris and the sky mask of the environment.
- Ambient = 0.5 × room × crypt occlusion × lid; the far/near asymmetry of Phase 1 is now the sum of the cone diffuse, the entry footprint and the limbus shadow, and changes sign with the light elevation.

Deferred: horizon maps (the march does their job on the laptop tier; phones will need the baked version), the tear meniscus (no lid drawn), and colour temperature of the key (Phase 5 with white balance).

## 11. Phase 5 log (2026-09-12)

Camera and post-processing; the photo shader now writes linear radiance × π with a coverage alpha, and a post pass makes the picture.

- **Thin-lens depth of field**: 100 mm lens, aperture from F-STOP (f/2.8–32), one lens sample per pixel per frame, focus on the *apparent* iris plane (apex + 3.05 mm, the entrance pupil of 01 §2) plus a FOCUS offset. At f/2.8 the limbus and the catchlight defocus while the pupil edge stays sharp; gradient energy across the centre row falls monotonically with aperture (3.62 → 3.08 from f/64 to f/2.8).
- **Accumulation everywhere**: sub-pixel jitter + lens sampling accumulate to 256 frames whenever nothing moves, then rendering idles. The meta-iris marquee, PAUSE and L-RES are gone. Hippus is off by default so stills converge.
- **Post pass** (`fs-post`): lateral chromatic aberration growing with the square of the image radius, a 32-tap bloom on anything above white (which also lifts the pupil floor the way corneal flare does), exposure EV, ACES filmic normalised so 1.0 stays 1.0, sRGB, sensor grain weighted toward the shadows. FILMIC toggles to a linear clamp.
- **White stays white**: the iris is composited over pure white with the coverage alpha, so exposure and tone never touch the sclera or the page.
- **Key colour temperature**: KELVIN (2800–8000) tints the key via a blackbody fit balanced to a 5600 K camera.
- **Reference mode** (REF): no jitter, no lens sampling, no bloom, no CA, no grain, camera frozen; single deterministic frame for the fitter.
- **Tiled capture** (CAP 4K): K×K tiles through `u_view`, 48 accumulated frames each, stitched to a PNG ≥ 4096 px on the long side.

Bug found on the way: computing the atlas mip level from screen-space derivatives of the hit point collapses once the lens sample differs per pixel; the level is now analytic from pixel angle × distance / corneal magnification, which also sharpened the f/11 frame.

Deferred to Phase 7: rendering at device pixels; the room's colour temperature; and a bloom that scales with the source's own size.

## 12. Phase 5b log (2026-09-12): the genome becomes explicit

Everything that carries identity is now an explicit object the bake rasterises from a list; the seed is only the default generator of those lists. This is the representation the fitter (§9.2) edits and the iris ID stores.

- **Object texture** (RGBA32F 256×5, `texelFetch`): row 0 header + collarette Fourier coefficients (40 harmonics of radius vs angle), row 1 crypts (centre, size mm, radial aspect, tilt, depth, softness; up to 128), row 2 contraction furrows (start/end turn, quadratic radius along the arc, width, depth; up to 64), row 3 spots (centre, size, melanin, shape seed; 64), row 4 nodules (128).
- **Bundle pass**: fibre bundles are polylines in atlas space (5–8 points, width in mm, brightness, height) rasterised as ribbons by a small vertex/fragment program into a MAX-blended RGBA16F texture, three copies for the seam. ~330 bundles per default eye (root→collarette coarse, collarette→pupil fine, 20 % branching). The seeded Worley field remains as a background at weight 0.55 (FIELD button toggles it) so the fitter can drive it to zero once bundles carry the identity.
- **Genome JSON** = `{ seed, globals, coll, crypts, furrows, spots, nodules, bundles }`; the **iris ID** = genome + view (pupil, light, source, camera). ID ↓ downloads the JSON, copies it, and puts it in the URL when under 8 KB (otherwise `#seed=…&preset=…`); ID ↑ loads a file; the page loads an ID or a seed from the URL hash on start. Loading an ID reproduces the same iris in one bake.
- The CRYPT slider now regenerates the crypt *list* from the seed at the requested density; presets re-roll spot and nodule lists from the seed with their counts.
- Default ID size ≈ 50 KB (bundles dominate); rounding is 3 decimals. A compact bundle encoding is on the list for Phase 7.

## 13. Phase 6 log (2026-09-12): the fitter, first increment

`iris-engine/fit.js` + the FIT PHOTO panel. The engine exposes `drawPhotoFrame` / `drawPost` with explicit rotation, view offset and pupil, so the fitter renders off-screen at the photo's resolution in reference mode.

- **Alignment**: photo from a file or the reference set; draggable pupil circle, limbus ellipse and catchlight; wheel to resize. **Pose solve** (analytic): camera distance from the limbus size on the 24 mm sensor, view offset so the eye centre lands on the limbus centre, tilt magnitude from the limbus ellipse ratio (corrected for the natural 5.85 : 5.40) with direction from the pupil offset minus its resting 0.25 / 0.15 mm, pupil in mm through the 1.13× corneal magnification, key direction by mirroring the catchlight on the 7.8 mm corneal sphere.
- **Views**: photo / render / diff / split; **scores**: PSNR inside the iris mask, mean |ΔL*| and mean Δab over 24 radial bins.
- **Global fit**: Nelder–Mead with bounds over 13 genes (melanin, stroma, pheo, mie, ring strength/radius, limbal darkness, pupillary-zone melanin, collarette radius, fibre contrast, EV, room, lid) against the radial L*a*b* profiles plus a weak pixel term; every evaluation is a bake + render + readback.
- **Structure detection**: polar unwrap in the photo's geometry; crypts as connected dark blobs of a difference-of-Gaussians (radial extent → size, aspect from the blob shape, strength → depth); collarette as the brightest ridge per angle in v 0.15–0.6, smoothed and projected onto 40 harmonics. Writes straight into the genome's object lists.
- **Object refinement**: per crypt, Nelder–Mead over centre, size, aspect, tilt and depth against PSNR in the mask, through the real renderer.

First run on `ref/26-green-crypts-isolated.jpg` (3840×2774, fitted at 640×462):

| Stage | PSNR | mean ΔL* | mean Δab | cost |
|---|---|---|---|---|
| pose only, green preset | 12.2 dB | 10.9 | 19.4 | — |
| global fit | 14.5 dB | 4.7 | 14.6 | 178 renders, 2.8 s |
| detect structures | 14.5 dB | 5.2 | 14.9 | 24 crypts, collarette v 0.37 |
| refine objects | 14.9 dB | 5.2 | 15.3 | 2349 renders, 20.5 s |

The luminance profile fits; the chroma does not, which is the 02 §4.4 limit of a 3-band Rayleigh term on a saturated, retouched photo — the spectral LUT moves up the list. The collarette's zigzag transfers from the photo visibly. A feedback-loop bug (the fit pass bound its own target as the accumulation source) blanked the first render and is fixed.

Next increments for the fitter: bundle detection (ridge filters along v → polyline objects), furrow detection (concentric edges), a joint refinement pass, multi-photo constraints for height, and an unwrap through the engine's forward path instead of the photo-geometry approximation.

## 14. The development process: benchmark against the reference set (added 2026-09-12)

iori's target: recreate most of the reference photographs at ≥ 80 % match, and have a process that measures every engine change against the whole set. The pieces, all in the FIT panel:

1. **Alignment once per photo.** AUTO ALIGN finds the pupil (largest dark component not touching the border, roundness- and fill-checked), the limbus (strongest radial luminance edge per direction; horizontal samples set the radius because the lids cut the iris top and bottom; the vertical radius follows 5.40 : 5.85 unless the vertical samples agree) and the catchlight (brightest blob in the inner 70 %). Markers are corrected by hand where needed and stored with SAVE ALIGN (browser storage) and ALIGN ↓ (`ref/align.json`, committed with the repo so everyone benches the same alignment).
2. **Scoring that means something.** Speculars (clipped pixels) are excluded from the mask and the profiles. **MATCH %** = ½·SSIM (luminance, quarter resolution, inside the iris mask) + ½·(1 − mean ΔE*ab of the 24-bin radial profiles / 40). 80 % therefore needs both the structure and the colour right; PSNR, ΔL* and Δab are reported alongside.
3. **Robust fitting.** Every global fit first evaluates the ten presets and the current genes at the solved pose and starts from the best one (the earlier failure on iori's photo came from starting at the previous photo's genes and walking into the dark-brown corner).
4. **BENCH ALL.** Loads each reference with its stored alignment, solves the pose, fits (60 iterations), detects structures, scores, and writes a CSV row per photo plus the mean and the count ≥ 80 %. Results also accumulate in browser storage with a tag, so runs can be compared over versions. Pathology photos (coloboma, Kayser-Fleischer, arcus) and the composite are excluded until the casebook has generators for them.
5. **Iterate on the residuals.** After each bench, the worst photos and the systematic residuals (which zone, which structure, which lighting term) become the next engine change; the bench decides whether it helped.

Test cadence: a 4-photo smoke bench after every engine change (≈ 30 s), the full set before a phase closes.

**Baseline (v32, 4-photo smoke bench, 60 iterations, no refinement, ≈1.5 s per photo):**

| photo | MATCH before | MATCH after | SSIM | PSNR | ΔL* | Δab |
|---|---|---|---|---|---|---|
| 05 blue eye | 18 | 35.8 | 0.00 | 9.1 | 11.0 | 2.5 |
| 36 hazel whole eye | 15 | 49.4 | 0.12 | 15.4 | 1.9 | 4.9 |
| 26 green crypts isolated | 23 | 31.9 | 0.10 | 15.3 | 6.6 | 16.7 |
| 20 dark blue eye | 24 | 50.1 | 0.12 | 13.0 | 4.0 | 2.2 |
| **mean** | | **41.8** | | | | |

Reading: the colour half is nearly earned on the blue eyes (Δab ≈ 2) and fails on the saturated green (the 3-band Rayleigh limit); the structure half is near zero everywhere, because fibre bundles are still seeded rather than detected, the crypt detector fills its 24-object cap with false blobs on eyes that have none, and on whole-eye photos the lids intrude into the mask. Those three are the next engine changes, in that order of expected gain: lid occlusion in the mask (auto + manual chords), crypt significance and priors, then bundle detection from ridge orientation. The spectral LUT follows for chroma.

**Full bench (v34, 38 photos, automatic alignment, 60 iterations, no refinement):** mean MATCH 32.7 %, median 38.4, best 53.6 (07 blue amber ring), 16 photos ≥ 40, none ≥ 60. Worst six (0.5–7 %) are alignment failures on the isolated-on-black macros and one phone photo, not fitting failures. Files: `ref/bench-v34.json`, `ref/cases.json` (alignment + view + ID + scores + texture stats per photo, 4.5 MB), `ref/texture-study.json`; the CASEBOOK button renders all cases live from `cases.json`.

## 15. Texture study → generator targets (2026-09-12)

See [06-texture-study.md](06-texture-study.md). Targets for the fibre rewrite: strand spacing 35–70 µm (≈ 500 around in the ciliary zone), ridge/gap L* 49/24 (≈ 3.5–4× linear), local contrast std/mean 0.31–0.37 in every zone, 12–14 % dark coverage in the ciliary and peripheral zones, chroma on the strands and dark low-chroma gaps (two materials). The renders currently measure contrast ≈ 0.15 and ridge/gap ≈ 1.3. The polar A/B view (POLAR in the fit panel) is the harness for judging each generator change against the unwrapped photo.

**Bench v36 (same 38 photos, after fixing the smoothing regression and the pupil detector):** mean MATCH 37.4 % (v34: 32.7), median ≈ 38, best 58.9 (15 central heterochromia) and 57.9 (37 hazel brown macro), 0 ≥ 60. The v34 collapse on the isolated macros was the interactive smoothing loop running during fits and dragging the camera distance back toward its interactive target; the loop now pauses before smoothing whenever the fitter or a capture owns the engine, and every programmatic pose change sets value and target together. Remaining alignment failure: 22 (dark-brown baby eye, dilated), 2.1 %. Colour half: Δab ≤ 6 on 13 photos (blue, grey-blue, hazel, central heterochromia); structure half: SSIM 0.0–0.39, median 0.15. Files: `ref/bench-v36.json`, `ref/cases.json`.

## 16. Strategy: isolated irides first; spectral colour with a yellow absorber (2026-09-12)

iori's direction: the isolated-on-black macros (09, 25, 26, 35) are the right training ground — no lids, sclera or perspective, so alignment is exact and every remaining error is the engine's. **Recreate those to ≥ 80 % first, then take on whole-eye photos.** BENCH ISO in the fit panel runs exactly that set (120 iterations).

**Alignment.** `isIsolated()` (dark border) → `alignIsolated()`: background = dark pixels connected to the border; the iris silhouette's second moments give the ellipse (centre, rx, ry, angle) exactly; the pupil is the dark hole's moments; the key goes on the axis (ring-flash macros have no catchlight). Whole-eye photos: pupil = roundest dark blob over five thresholds; limbus = RANSAC circle on radial edge samples (lids and lashes are outliers), then the anatomical 5.40 : 5.85 vertical ratio.

**Colour.** The three-band model cannot reach the measured strand colours (06: amber ridge b* 35, green ridge a* −10), so the optimiser settled on brown for every green/amber eye. Evaluating chapter 02's model spectrally (16 wavelengths, CIE 1931, D65) with the chapter's constants gets to b* 24 at most; the measured strand colours need a **yellow absorber on the strands** (lipofuscin / pheomelanic, already foreseen in 05 §4 as "lipofuscin"): `T_y(λ) = exp(−yellow · sigmoid((500 − λ)/14))`. With it, strands with Ds 0.4, Ma 0.1, yellow ≈ 0.8 give L* 51, a* −4, b* ~30 (green), and Ma 0.5, yellow ≈ 1 gives amber b* ~35; blue stays blue. The engine now samples a **3-D LUT** (48 × 32 × 32 RGBA16F: √(Ma/6), Ds·thickness, pheo × yellow slices) built in JS at load from the spectral model; the analytic 3-band path remains as a fallback. YELLOW is a gene, a slider and a fit parameter; presets updated (green 0.9, amber 1.2, hazel 0.7).

Next on this set, in order: fibre layer rewrite (06 targets) → two-material shading (strand / gap) → fibrous collarette → BENCH ISO after each.

**BENCH ISO v38 (4 isolated macros, exact alignment, 120 iterations):** mean MATCH 40.9 % (v37 before the objective change: 32.6). 25 green-amber 45.2 (Δab 9.2, was 15.2), 26 green crypts 47.9 (Δab 7.1, was 20.6), 09 blue-green 42.4, 35 grey-green 28.1 (ΔL* 14.5: its dark periphery is still not reproduced). The fit for 25 now lands at pigment 0, pheo 1.0, yellow 1.4, stroma 0.18, limbal width 0.23, milk 0.53 — a green-amber material — where v37 had pushed pigment to 5 (brown) to darken the periphery. Changes that made the difference: the spectral LUT with the yellow absorber, limbal width and milk as fit genes, and a robust profile error with equal L* / chroma weight. Structure (SSIM 0.07–0.18) remains the fibre layer: next.

## 17. Design: control fields, strand flow, editing, ID v2 (2026-09-12)

See [07-fields-and-editing.md](07-fields-and-editing.md). Summary of what was agreed with iori and what it changes:

- The ID becomes **globals + objects + control fields** (128 × 32 material/presence fields, 256 × 64 flow fields: strand direction, warp, spacing, phase, coherence, brightness). Fields are generator parameters on a coarse grid, not textures; the fine strands are generated by **line integral convolution** along the flow field, and shaded as **two materials** (strand vs gap).
- The photo fills every field (structure tensor → direction and coherence, local spectrum → spacing, Gabor → phase, per-cell ridge/gap Lab → materials through an inverse LUT, DP contour → collarette spline); a person edits every field (comb brush, warp brush, paint, eyedropper, points), first on the polar canvas, then on the eye.
- ID v2 stores the fields base64-encoded with ranges, the objects, the view and a provenance block (photo hash, alignment, fit history, scores). It is deterministic (pure functions of seed + numbers) and has a fixed-shape field stack, which makes every fitted eye a training pair for a future photo → fields model.
- Implementation order: field infrastructure → LIC strand generator + two-material shading → photo → fields → editing tools → provenance / dataset export. Each step is scored with BENCH ISO.

**§17 progress — step 1 done (field infrastructure, engine 0.7-fields):** 18 control fields (11 on the 128×32 grid, 7 flow fields on 256×64) with fixed ranges in `FIELD_DEFS`, packed four per RGBA8 texture and decoded in the bake through injected range constants; non-custom fields follow their global gene, custom fields override per cell. The bake writes a third target (pheo | yellow | gap melanin | gap stroma) so the photo shader reads per-texel material. ID v2 = `{v:2, engine, genome, fields (custom only, u8 base64 with ranges), provenance, view}`; a two-field custom ID is 65 KB and round-trips exactly. Verified with a hand-written melanin/yellow sector rendering as sectoral heterochromia. Flow fields are stored but not yet consumed (step 2). Gotcha: a GLSL macro parameter must not be named x or y — it rewrites member accesses in the body.

**§17 progress — step 2 (LIC strands + two-material shading), state at v46:** strands are generated by line integral convolution along the flow field at three scales (bundles ≈ 0.5 mm carrying 55 % of the contrast, medium ≈ 0.16 mm, fine ≈ 0.055 mm), organised by the bundle objects; the baked ridge coverage mixes a strand material and a gap material at shading, with contact shadow in the gaps and an anisotropic sheen along the flow. The seeded Worley field is off by default. The score line now reports the render's ciliary contrast and ridge/gap against the photo's (06 targets). Result: the render reads as fibre for the first time; contrast 0.15 → ≈ 0.20 (target 0.38), ridge/gap 1.3 → 1.4 (target 2.2). BENCH ISO: 33–35 % (v38: 40.9) — the metric fell because the fit has not caught up with the new material model.

Diagnosed, to fix next:
1. **Material inversion loop** (`materialFromPhoto`: per-zone ridge/gap Lab → inverse spectral LUT → radial fields, iterated through the renderer) is stuck: the photo's strand colour (L* 54, b* 36) lies at the LUT gamut edge, and strand shading adds a luminance gain and a whitening (sheen, ambient, ACES) that material alone cannot cancel. Fix: invert against the *render's* ridge measurement with a per-zone luminance gain solved first (EV-like), clamp targets to the LUT gamut, and take the sheen out of the ridge statistic.
2. **Ridge profile never reaches zero**: the render's local minima are still ~40 % strand, so gaps stay at L* 45–50 against the photo's 24. Fix: a sharper ridge transfer (gap floor at 0 for ~15 % of the area) and the gap contact shadow scaled by the local ridge slope.
3. A lighting state must be defined before any inversion (found: bench leftovers at ambient 1.0 skewed a calibration) — done for the loop; presets and EV/ambient/lid are now reset first.

**Design amendment from iori (2026-09-12):** the collarette is one contour of the iris *relief*; the raised pupillary frill, bundles as ridges, crypts as pits and furrows as grooves form one height field. Step 3 therefore starts with a **height field from the photo** (albedo divided out; under a frontal ring flash low-frequency luminance follows surface orientation; shape-from-shading along the radial direction gives ±0.1 mm relief into the `height` control field), and the collarette contour, crypt pits and ridge bands are derived from that field so they share one topology. The DP contour trace and the crypt detector become consumers of the height field rather than independent detectors.

**v47 checkpoint (material loop fixed, ridge floor, height field):** the inversion loop now solves a luminance gain through EV first and clamps targets to the LUT gamut; on ref 25 the rendered ciliary strand L* equals the photo's (54), gaps 29 vs 24, contrast 0.32 vs 0.38, ridge/gap 1.85 vs 2.22 — the 06 texture targets are within reach. Residuals: hue a* +6 rendered vs −4 photographed (the material's greenest point is yellow-orange: a gamut limit under test), and SSIM 0.07–0.14 because the bands are in the wrong places — the flow fields were still flat. `heightFromPhoto` writes ±0.08 mm relief from the shading into the `height` field; `flowFromPhoto` (next run) writes strand brightness, direction and coherence from band-scale luminance and the structure tensor.

**v49 checkpoint — photo → fields, first working chain:** `fitGlobal` now runs height field → flow fields (strand brightness with half the radial trend, direction and coherence from the structure tensor) → per-zone material inversion iterated through the renderer (EV gain first, LUT gamut clamp) → Nelder–Mead over the non-material genes. The spectral LUT is built with Mie 0.08, which brings green strand hues into gamut (Lab 56, −10, 38 reachable). On ref 25 the render's bundles now sit at the photo's angles (polar view), strand luminance matches, texture contrast 0.28–0.34 vs 0.38, ridge/gap 1.7–1.9 vs 2.2. BENCH ISO v49: mean 37.1 (09: 42.5, 25: 40.0, 26: 42.2, 35: 23.7). Still short of the v38 pre-strand 40.9 on the metric while far ahead of it visually: SSIM stays 0.10–0.14 because the radial brightness layout and the residual hue (a* +8 rendered vs −4) still differ, and the crypt detector's ovals are not the photo's dark streaks. Next, in order: derive the collarette contour and crypt pits from the height field (iori's amendment), radial zone brightness from the photo, hue residual (yellow absorber cut-off as a gene), then the editing tools.

**v50 — structures from the height field, 8-band material:** the collarette is now the minimal-cost closed ridge path (dynamic programming over the angle, cost from height curvature, luminance ridge and the pupillary→ciliary transition) stored as 36 spline points and projected onto the 40 harmonics the bake consumes; crypts are connected pits of the height field deeper than 25 µm outside the collarette (3 on ref 25 instead of 10–24 false ovals). The material inversion runs over 8 radial bands: on ref 25 the mid-band strand renders at Lab 55, −3, 37 vs the photo's 55, −4, 38 — the hue residual is gone (LUT with Mie 0.08). Texture: contrast 0.35 vs 0.38, ridge/gap 1.92 vs 2.22. BENCH ISO v50: mean 38.8 (09: 45.0, 25: 41.5, 26: 43.8, 35: 24.7). SSIM 0.09–0.18 remains the gap: the render's pupillary zone comes out darker than the photo's amber band (the optimiser's ring and pupillary-melanin genes repaint it — now excluded when the material is photo-derived), and 35's dark periphery is still not reproduced.

**v51 — pose offset under tilt (the "does not track" cases):** whenever the solver assigned an eye rotation from the limbus ellipse ratio, the camera orbit about the centre of rotation (13 mm behind the apex) shifted the iris on screen, and the view offset placed the pupil as if the eye were frontal — a 16° tilt displaced ref 35 by ≈ 3.6 mm. Fix: `projectPoint` projects the pupil world point (0.25, 0.15, 3.5 mm) through the same orbit and lens the shader uses, and the view offset is solved from that projection; a limbus within 6 % of round is treated as frontal (moments and lids cannot resolve smaller tilts). BENCH ISO v51: **mean 43.5** (09: 46.1, 25: 42.4, 26: 41.9, 35: 43.4) — above the pre-strand 40.9 with strands, photo-derived materials, flow fields and height-field structures all active. Remaining on 35: a residual pupil-centre offset from the moments-based pupil estimate (dark crypts bias it); the next alignment refinement is a pupil circle fit on the dark-region boundary.

## 18. Alignment by construction; fields on both axes (2026-09-12, from iori's review of ref 35)

**Alignment.** Ref 35 still compares misaligned: the render's pupil is larger than the marker and its limbus misses the ellipse. Cause: the isolated aligner derives the limbus ellipse and the pupil from silhouette *moments*, which the pupil hole and the dark crypts bias, so pixels-per-mm, pupil mm, zoom and offset inherit the error. Decision: (a) fit the limbus ellipse and the pupil circle to their *boundary points*; (b) **close the alignment loop through the renderer** — detect pupil and limbus on the render with the same detector, compare with the photo markers, correct zoom, view offset and pupil mm, iterate — so every comparison is aligned by construction, independent of the pose model's approximations. Applies to the fit panel and to the casebook thumbnails.

**Both axes.** The height field and the colour distribution must be organised in the angular *and* the radial direction. Today the coarse LIC layer integrates ±1.7 mm along the (radial) flow and drags per-cell brightness, colour and height into radial strips; real irides show concentric organisation as strongly (collarette, furrows, the ragged amber-ring boundary, crypt rings, bundles that start and stop). Decisions: colour and height fields act on the shading directly, never through the strand integration; cap the LIC integration near a bundle segment (≈ 0.5 mm) with along-strand modulation; keep the radial trend in every estimator; derive furrows from the height field's concentric ridges; estimate the height field in 2-D (shape-from-shading), not by per-row trend removal.

Handoff for a new session: `iris-engine/HANDOFF.md` (state, priorities, gotchas, file map).

**Multiple ridges (iori, same review).** Only one collarette ring exists in the engine, while natural irides show several concentric "hillsides": the ruff lip, the collarette, contraction-furrow ridges, crypt-ring rims. Decision: replace the single collarette object with a **ridge list** — closed splines with per-ridge height / width / frill and per-point weights, extracted from the height field as successive DP ridge paths (suppress-and-repeat, strength threshold), the collarette tagged as the strongest; the bake sums the profiles, bundles terminate at the collarette; all ridges editable as points.

## 19. Second casebook review and the decided plan (2026-09-12, engine 0.7-fields, BENCH ISO v51)

**What the casebook showed.** (a) Ref 35: the render's pupil is larger than the marker and displaced; in the polar view the render strip has a black hump at v = 0, so every score for 35 is measured misaligned. Besides the moments bias, `solvePose` converts the pupil marker to mm through a fixed paraxial magnification (1.13) while the engine's two-surface cornea magnifies differently at 50–58 mm apex distance. (b) `materialFromPhoto` fills the six material fields **per radial band only** (8 bands, constant around the ring); the 128×32 grid is unused angularly, so the amber-ring boundary (25), sectoral patches (09) and crypt clusters (26) are unrepresentable by construction. (c) The coarse LIC integrates ±1.7 mm along a nearly radial flow while the photo brightness field only scales ridge coverage 0.6–1.0 and the height field is ±0.08 mm: the strand pattern dominates the fields → radial strips, no rings. (d) The isolated photos carry no catchlight but the RING source draws one; the mask excludes clipped pixels in the photo only, so the render's specular is scored as error. (e) Quarter-res SSIM resolves ≈ 0.08 mm/px (bundle and crypt scale); the fields resolve 0.06 mm radially / ≈ 0.1 mm angularly, so the metric is reachable once alignment is exact and the fields reach the shading. MATCH 80 needs ≈ SSIM 0.7 at ΔE 4; alignment alone will not get there.

**Decisions (iori).**
1. The alignment loop detects on a **flat ID mask view**: a debug view of the photo shader that renders pupil / iris / outside as three constant values through the same refraction; the same boundary detector reads photo and render.
2. Material colour is inverted **per cell** on the 128×32 grid (07 §3 as designed); the band-level EV gain loop stays for exposure. Fields remain the procedural representation.
3. **No specular on isolated fits**: when `fit.isolated`, the corneal reflection is off (bench, fit panel, casebook); whole-eye fits keep it.
4. Scope: **Phase A then Phase B, BENCH ISO after each**; C waits for the new numbers.

**Phase A — alignment by construction.** Isolated aligner: limbus ellipse and pupil circle fitted to boundary points (least squares / RANSAC on the background↔iris and pupil↔iris edges), not to areas. Flat mask debug view. Loop: render mask → detect → compare with the photo markers → correct `zoomPhoto`, `state.view`, pupil mm → iterate 3–4×. Casebook thumbnails run the loop before rendering; bench rows record the residual. Acceptance: render pupil and limbus within 1 px of the markers on 09/25/26/35; flat polar bottom edge; BENCH ISO v52.

**Phase B — fields on both axes.** Per-cell material inversion (strand and gap Lab per 128×32 cell, gain loop per band). Brightness field multiplies the albedo directly, not only the ridge coverage. Height field estimated in 2-D (shape-from-shading), radial trend kept. Coarse LIC capped ≈ 0.5 mm with an along-strand envelope from the brightness field so bundles begin and end. Acceptance: the 25 polar render shows the dark mid band and the bright pupillary zone; ciliary contrast ≈ 0.35; BENCH ISO v53.

**Phase C — terraces** (after B's numbers): pupillary-zone brightness through the fields instead of the gap floor; ridge list from successive DP paths on the height field; furrows from its concentric ridges. Phases D–F unchanged (editing, provenance/dataset, whole-eye).

### 19.1 Phase A log (2026-09-12): alignment by construction — BENCH ISO v52 mean 49.9 % (v51: 43.5)

Built: (1) `alignIsolated` now classifies the photo (background = dark pixels connected to the border, dark hole = the rest under 10 % luminance) and fits the limbus **ellipse** and the pupil **circle** to boundary points (outermost non-background pixel per ray; first non-dark pixel outward from the dark-hole centroid), algebraic least squares with residual trimming (`fitEllipse`, `fitCircle`, `edgePoints`, `boundariesFromClasses`). Isolated photos re-align on every load; stored alignments serve whole-eye photos only. (2) Photo-shader debug view 13 = **alignment mask** (pupil 0, iris 0.5, outside 1, through the same refraction), read back as floats (`renderMask`). (3) `alignLoop`: detect on the mask with the same fits → correct camera distance (limbus radius ∝ 1/(distance + 2.5)), view offset, pupil mm and the new **pupil decentration** pose parameter `u_pupilOff` (mm; anatomical rest 0.25/0.15 as the start; stored in the ID view and the cases) → iterate to 0.5 px. Runs inside `solvePose` and before every casebook thumbnail; bench rows carry `alignPx`. (4) `u_specular` = 0 whenever `fit.isolated` (no catchlight on the retouched macros).

Result: residual ≤ 0.12 px on 09/25/26 and 0.47 px on 35 after 2 iterations; the 35 polar strip has a flat pupil edge. 35: 43.4 → **64.1 %** (SSIM 0.20 → 0.47, ΔL* 10 → 4.5). 25: 42.4 → 45.4, 26: 41.9 → 45.4, 09: 46.1 → 44.7 (colour, Δab 10, unchanged by alignment). Found on the way: `solvePose`'s fixed 1.13 pupil magnification and its view-offset projection were both off for decentred pupils (35 needed 0.17 / −0.19 mm of decentration); the loop absorbs both. The ellipse fit's conic sign depends on whether the image origin is inside the ellipse (fixed). Next: Phase B (fields on both axes), starting from these aligned cases.

### 19.2 Phase B log (2026-09-12): fields on both axes — BENCH ISO v53 mean 60.8 % (v52: 49.9, v51: 43.5)

| ref | v51 | v52 | v53 | SSIM | ΔL* | Δab |
|---|---|---|---|---|---|---|
| 09 blue-green | 46.1 | 44.7 | **51.7** | 0.32 | 2.9 | 10.8 |
| 25 green amber ring | 42.4 | 45.4 | **61.8** | 0.40 | 2.5 | 5.7 |
| 26 green crypts | 41.9 | 45.4 | **62.7** | 0.43 | 2.2 | 6.5 |
| 35 grey-green | 43.4 | 64.1 | **66.9** | 0.53 | 5.6 | 4.4 |

Built: (1) **per-cell material inversion** (`cellStats` + the per-cell stage of `materialFromPhoto`): ridge / gap Lab per 128×32 cell against a ≈ 0.4 mm local mean, targets seeded from the band loop, three passes of invert → render → measure → bounded move (±8 per pass), inversion cached by Lab rounded to 1 unit (a few hundred unique inversions per photo), inverted fields smoothed 3×3 because the LUT inversion is nearest-entry. Rows v < 0.05 (ruff) and > 0.95 copy the nearest fitted row. The loop runs with `limbalDark` = 0: the gene reaches inward to 1 − limbalWidth and made the loop push the periphery to the LUT's pale edge. (2) **Brightness field in shading**: the photo shader binds the flow pack `u_f1` and multiplies the albedo by `strandBright` (0.4–1.6); the field is normalised to mean 1 per material cell in `flowFromPhoto`, so the material carries the level and the field the sub-cell structure — without the normalisation the two were degenerate and the material loop overshot. (3) **2-D height**: `heightFromPhoto` band-passes the unwrapped luminance in mm (≈ 0.1 mm local mean over an isotropic ≈ 1 mm neighbourhood) instead of removing a per-row trend, so concentric features become relief. (4) **LIC cap**: `lic()` takes a step scale; coarse ±0.5 mm, medium ±0.3 mm, fine ±0.27 mm; a seeded along-strand segment envelope (`seg`) makes bundles begin and end; the coverage no longer scales with the brightness field.

**The coordinate map (found from iori's question "why is the render polar shifted?").** The photo unwrap ran in marker geometry (v = 0 at the pupil edge, 1 at the visible limbus) while the fields live in the engine's tissue coordinate (0 at the pupil margin, 1 at the hidden 6 mm root, through the dilation remap and the corneal magnification), so a feature written at photo v = 0.5 rendered ≈ 0.15 further out. Fix, exact by construction: photo-shader debug view 14 renders the **field (u, tissue v) of every pixel** through the same refraction (`getMap`, cached per pose); `unwrapRGB` / `unwrap` splat the pixels through it (bilinear, u wraps) and fill unsampled cells from neighbours (`.valid` marks them; the polar view shows them grey — beyond the 5.85 × 5.40 limbus the 6 mm root is hidden, so the visible v_max is wavy around the ring). Every estimator, the polar A/B and the field fills now share the engine's coordinates. 25 went from 45 to 62 on this alone. The same map is the cursor → field projection the editing tools need.

**Not met / open.** Ciliary contrast: render ≈ 0.23–0.26 vs photo 0.30–0.33 (measured in tissue coordinates now; the earlier 0.38 was marker geometry) — the gap floor / two-material mix and the NM's fibreContrast leave ~25 % on the table. 09: Δab 10.8 unchanged — blue stroma next to amber pigment in one iris; check whether the LUT (Mie 0.08) reaches the photo's blue at that L*, else the LUT needs the Mie axis. 35: ΔL* 5.6 (the brightest case, EV/ambient). Next: Phase C (terraces: pupillary-zone brightness via the fields, ridge list, furrows from the height field) after a casebook review of these three.

### 19.3 Phase C plan (decided 2026-09-12 from iori's review of v53): the relief layer

**Review.** Dents (crypts) land in mostly the right places with often the right sharpness, but they are detected on the 128×32 field (anything under ≈ 0.3 mm merges or vanishes), only ellipses are known, 14 are kept, one softness serves all. The collarette DP fit is promising, but it is the only ridge; the photo shows several concentric "mountain ranges" (ruff lip, collarette frill, furrow ridges, crypt-ring rims) that together should make the height map. Furrows come from the seed, never the photo. iori: relief must be placeable everywhere along the photo's height map, in many shapes — dents, dots, streaks, smears, waves — from the image or from the paint.

**Decisions (iori).** Relief = ridge list + primitive list + the 128×32 residual field (a later FLATTEN can fold the residual into objects). Judged by a HEIGHT A/B harness first. Ridge list before primitives. Objects placed from detection only for now (per-object pixel refinement returns once the vocabulary is settled).

**C1 — height harness.** Fine height proxy from the photo through the coordinate map at 1024×128 (0.025 × 0.035 mm), band-passed at several scales in mm. HEIGHT polar view: photo proxy over the engine's baked height (atlas T0.r through the map). Bench rows gain a height correlation (proxy vs baked height, quarter-res, iris mask).

**C2 — ridge list.** Successive DP paths on the proxy: find the strongest ridge, suppress it (Gaussian in v along the path), search again; keep ridges above a strength threshold; closed rings and open arcs (furrows). Each ridge: spline points (24–48, u/v), height, width, asymmetry (inner vs outer slope), frill amplitude, per-point weight. The collarette is the tagged strongest; bundles terminate at it. `coll` becomes `ridges[0]`; furrow arcs from the seed become fitted open ridges with negative height (troughs). Editable as point sets.

**C3 — primitives.** Vocabulary: **dent** (elliptic pit: centre, radii, angle, depth, edge sharpness), **dot** (small pit or bump), **streak** (capsule trough or ridge along the local flow: centre, length, width, depth), **smear** (soft signed Gaussian patch), **wave** (open ridge/trough spline, short). Extracted by multi-scale blob detection (DoG at 0.05–0.6 mm) on the proxy; classified by scale, aspect, orientation against `flowDir`, and edge steepness; each carries its own sharpness. Pigment behaviour per primitive: a dent is a hole in the ABL (dark floor), a dot may be pigment (spot) or relief, a smear is relief only.

**C4 — relief pass.** Like the bundle ribbon pass: every ridge segment and primitive is drawn as a quad into a relief texture (height, ABL-hole, floor-shadow channels); the bake sums ridges + primitives + residual field. No per-texel object loops, thousands of objects, and painted stamps/strokes later use the same path. The crypt/furrow/spot/nodule shader loops retire once the pass covers them.

**Acceptance.** C1: HEIGHT A/B renders and the correlation is in the bench rows. C2: 26 and 25 show the terraces in the HEIGHT A/B; collarette unchanged or better. C3: dents/dots/streaks visible in place on 26 at the photo's sharpness; MATCH and height correlation both up. BENCH ISO after C2 and after C3/C4.

### 19.4 Phase C1 + C2 log (2026-09-12): height harness and ridge list — BENCH ISO v54 mean 62.0 % (v53: 60.8)

| ref | v53 | v54 | SSIM | height r | ridges | ΔL* | Δab |
|---|---|---|---|---|---|---|---|
| 09-blue-green | 51.7 | **54.4** | 0.381 | 0.643 | 4 | 3.1 | 10.9 |
| 25-green-amber-ring | 61.8 | **61.4** | 0.409 | 0.514 | 5 | 2.5 | 6.3 |
| 26-green-crypts | 62.7 | **62.5** | 0.438 | 0.503 | 6 | 2.8 | 6.5 |
| 35-grey-green | 66.9 | **69.8** | 0.563 | 0.394 | 2 | 4.5 | 4.2 |

**C1 — harness.** `heightProxy`: photo luminance through the coordinate map at 1024×128, band-passed at three scales (≈ 0.15 / 0.4 / 1 mm neighbourhoods), brighter than the neighbourhood = raised, ≈ mm (0.08 mm per unit). `renderHeight`: photo-shader view 15 returns the baked relief (mm) per pixel, unwrapped through the same map. **HEIGHT** view (6th mode): proxy over relief at ±0.1 mm. `heightCorrelation` (Pearson over sampled cells, v < 0.93) is in `score()`, the bench rows (`hcorr`) and the casebook diagnosis.

**C2 — ridge list.** `ridgesFromProxy`: strength map = the proxy on a 512×64 grid smoothed ≈ 0.3 mm along u (ridges are concentric; radial fibres and single crypts must not pull the path), scaled to unit range for the DP; `dpClosedPath` (two turns for closure, ±2 rows per column, quadratic smoothness λ 1.5); suppress-and-repeat (Gaussian 1.5× the width) for up to 6 ridges, then up to 3 troughs on the negated map; search window v 0.06–0.85 (above is the limbal band and, at the vertical angles, the fill beyond the visible iris). Each ridge: 36 spline points, per-point weight (local / mean strength, so a partial ring fades out), height = 2 × crest mean (mm, signed), width = median half-max half-width → Gaussian 1/e width, asym 0. The **collarette** = the strongest ridge with mean v in 0.12–0.6, written into `coll` (Fourier + points + height + width) so bundles, sliders and the mask keep working; the others go to `genome.ridges`. Upload: object-texture rows 5–20, 128 (v, weight) samples per ridge (closed Catmull-Rom) + header; the bake sums the profiles (`ridgeH`) and the old `collHeight × collMask` height term is gone. `subtractRidges` removes the profiles from the residual height field so each range is carried once.

Found (26): collarette v 0.15 (18 µm), crypt-ring trough v 0.44 (−16 µm), range v 0.65 / 0.75 (27 / 38 µm), limbal trough v 0.83. 35 (flat iris): one ridge + the limbal trough. First attempts failed twice, both visible in the dump: paths perfectly flat (λ in different units from the mm strength) and paths wandering v 0.05–0.84 (λ too small, fibres pulling) — hence the normalisation, the u-smoothing and the stiffer DP.

**Reading.** Height r is 0.50–0.57 before and after the ridge list: C2 moves relief from the field into editable objects without changing the sum, as intended. The HEIGHT A/B on 26 shows what C3 must do: the photo's crypts are leaf/diamond shapes with sharp rims, with many small dark streaks between bundles; the render has 14 smooth ovals. Ridge heights (15–40 µm) are small next to the seeded collarette (60–140 µm) — the proxy amplitude is a heuristic; the HEIGHT A/B will calibrate it once C3 places the dents.

### 19.5 Phase C3 amended (2026-09-12, iori's review of the HEIGHT A/B): relief as a fitted 2-D Gaussian splat field

**Review.** In the HEIGHT A/B the render's crypts are black ovals while the photo's are leaf-shaped openings with sharp rims and streaks between bundles; "the structure detection is fundamentally flawed where we need continuous values we get dots". The polar strips also showed dotted photo cells on a whole-eye photo (the unsampled-cell display: on a small iris most cells are filled from neighbours) and smeared edges (the render's 4.5 % edge fade to page white, background pixels inside the marker ellipse, rows beyond the visible limbus copied).

**Decisions (iori).** (1) Relief = ridge list + a **2-D Gaussian splat field** fitted by gradient descent to the height proxy (GaussianImage-style) + the 128×32 residual; the 512×128 hole grid decided earlier is dropped. One anisotropic signed Gaussian is a dent, a dot, a streak or a smear by its covariance and sign; every splat is an editable object. (2) **Sharp rims from an SDF nonlinearity + the lattice**: the splat sum is a signed field, height = depth × smoothstep(field) with a sharpness gene, and the strand generator parts the bundles around the same field (coverage → 0 inside, warp divergence at the rim). (3) Fit budget selectable, default ≈ 2000 splats (≈ 5 s per photo). (4) Whole-eye alignment stays in Phase F.

**Edges (fix now).** Unsampled = beyond the visible limbus at that angle (max tissue v per u column from the map), not "no pixel landed here"; fit renders have no edge fade (`u_edgeFade` 0); the map's iris test stops at 99 % of the limbus so a ragged silhouette lets no background in; statistics ignore cells beyond v_max(u).

**Pipeline.** proxy (1024×128) → initialise splats at scale-space extrema (DoG over 4 scales, sign from the response, orientation and anisotropy from the structure tensor) → Adam on (u, v, σa, σb, θ, amplitude) against the proxy for a fixed budget → splat pass (instanced quads into a relief texture, additive) → bake: field = Σ splats; height += ridges + sharpen(field) + residual; strand coverage and warp read the same field. Acceptance: height r on 26 ≥ 0.8 (it is fitted, so it must), rims visible in the HEIGHT A/B, MATCH not lower; BENCH ISO v55.

### 19.6 Phase C3 log (2026-09-12): the relief splat field — BENCH ISO v56 mean 63.5 % (v55 63.0, v54 62.0)

| ref | v54 | v55 | v56 | SSIM | height r v54 → v56 | splats | rimSharp (NM) | Δab |
|---|---|---|---|---|---|---|---|---|
| 09-blue-green | 54.4 | 53.8 | **55.5** | 0.399 | 0.643 → 0.645 | 1426 | 0.07 | 10.8 |
| 25-green-amber-ring | 61.4 | 63.6 | **63.3** | 0.424 | 0.514 → 0.786 | 2000 | 0.01 | 5.3 |
| 26-green-crypts | 62.5 | 63.5 | **64.7** | 0.475 | 0.503 → 0.768 | 2000 | 0.05 | 6.2 |
| 35-grey-green | 69.8 | 70.9 | **70.3** | 0.574 | 0.394 → 0.54 | 1731 | 0.11 | 4 |

**Built.** (1) **Splat pass** (`vs/fs-splat`, `buildSplatGeometry`, `drawSplats`): `genome.splats` = [{u, v, σa, σb (mm), θ (rad from radial), a (mm, signed)}], each drawn as a ±3σ quad in atlas uv (three u-shifted copies for wrap), additive RGBA16F `u_splats` (r = the field). (2) **Bake**: `kRim = mix(0.02, 0.004, g_rimSharp)`; `openMask = smoothstep(kRim, 2.5 kRim, −field)` removes the strand coverage (the lattice parts) and joins `crypt` (hole in the ABL, dark floor, floor shadow); height += max(field, 0) − kRim·smoothstep(0, kRim, −field) − 0.08·(max(0, −field − kRim)/0.08)^γ with γ = mix(1, 0.45, rimSharp) (steep walls, flat floors). `rimSharp` is a global gene (default 0.6) in the NM list. (3) **Fit** (`fitSplats`): target = proxy − coarse model (residual field + ridge list, `coarseModelOnGrid`) on the sampled cells; init at DoG extrema over four scales (σ 1.5–12 texels, non-max 3×3, |response| ≥ 4 µm, isotropic σ in mm from the local texel size, amplitude 1.5× the response), then 120 Adam steps on all six parameters with analytic gradients (footprint ±2.5σ), per-parameter step sizes, clamps (σ 0.02–0.8 mm, |a| ≤ 0.2 mm). 2000 splats in ≈ 5 s; rms residual on 26 ≈ 1.6 µm. `fit.splatBudget` selects the count. `g.crypts` is cleared on a photo fit: the field carries the openings. (4) **Edges**: `u_edgeFade` 0 in fit renders; the map's iris test stops at 99 % of the limbus; unsampled = beyond `map.vmax(u)` (visible limbus per angle) in both strips and in every statistic — the dotted whole-eye polar and the smeared edges are gone.

**Reading.** Height r: 0.50 → 0.85 on 26 standalone, 0.69–0.79 after the global fit (the NM moves fibreContrast / relief / rimSharp for the colour score). The HEIGHT A/B on 26 shows the leaf-shaped openings with rims and the fibre texture where there were 14 ovals; the beauty split shows dark rimmed openings in place (MATCH 26: 62.5 → 66.8, SSIM 0.45 → 0.51). Honest limits: (a) the NM drives **rimSharp to ≈ 0 on all four cases** (0.01–0.11) — MATCH (SSIM + ΔE on the profiles, plus PSNR) does not reward sharp rims, so the sharpness gene needs its own term (edge energy in the openings, or the height r at the fine scale) or must stay out of the NM; (b) the proxy amplitude (0.08 mm per unit brightness) is still a heuristic, so absolute depths are unknown — the correlation is scale-free, the beauty render is not; (c) ciliary contrast render 0.24 vs photo 0.36, unchanged; (d) 09's Δab 10.8 unchanged (LUT gamut, blue next to amber); (e) `cases.json` is 1.5 MB with ≈ 2000 splats per case — fine for the repo, but the ID export should quantise splats (u16) when provenance/dataset export lands; (f) strands part around openings by coverage only — no warp divergence yet, so bundles do not visibly bend around a crypt.

**Next** (C4 is no longer needed): rim-sharpness term in the fit objective; splat quantisation in the ID; warp divergence around openings; then the casebook review of 09 (colour) and 35 (tone).

### 19.7 Log (2026-09-12): rim sharpness from the photo, warp around openings, 09's colour — BENCH ISO v58 mean 67.5 % (v56 63.5)

| ref | v56 | v57 | v58 | SSIM | height r | rimSharp | sat | Δab v56 → v58 | ΔL* |
|---|---|---|---|---|---|---|---|---|---|
| 09-blue-green | 55.5 | 55.5 | **59.3** | 0.451 | 0.719 | 1 | 1.48 | 10.8 → 9 | 4.2 |
| 25-green-amber-ring | 63.3 | 65.4 | **67.4** | 0.457 | 0.806 | 1 | 2.2 | 5.3 → 3.2 | 2.7 |
| 26-green-crypts | 64.7 | 69.4 | **74.1** | 0.612 | 0.846 | 1 | 1.97 | 6.2 → 4 | 2.8 |
| 35-grey-green | 70.3 | 54.1 | **69.4** | 0.586 | 0.726 | 1 | 1.46 | 4 → 4 | 6.3 |

**Rim sharpness from the photo** (`rimStat`, `rimFromPhoto`): the rim band = proxy cells at −0.03 … −0.008 mm (just outside an opening); the statistic is the mean luminance gradient there over the mean luminance; the photo sets the target and `rimSharp` is corrected through the renderer in 4 renders (halving steps), then held out of the NM (`MATERIAL_KEYS`). It lands at 1.0 on every case: the photo's rims are steeper than the renderer reaches even at maximum, so the range was widened (γ 0.35, rim band down to 2 µm). **v57 regression, then fixed:** with the band at 2 µm every shallow ripple of the splat field on the smooth iris 35 counted as an opening (coverage removed, floor darkened → blotchy, 70 → 54). Decoupled in v58: what is a hole is fixed (`kOpen` = 12 µm), `rimSharp` only sets the transition width (12 → 2 µm). 35 back to 69; 26 → 74 (SSIM 0.61), ciliary contrast render 0.34 vs photo 0.36.

**Warp divergence around openings** (`g_openWarp`, 0.3 mm per unit gradient): the strand sampling position is displaced toward the opening's centre by the field gradient (4 taps ≈ 0.1 mm apart on `u_splats`), so the pattern just outside is the pattern from further in and bundles bend around the hole instead of running through it. Visible in the 26 split as bundles hugging the crypt rims; not separately scored.

**09's colour.** Probe: the LUT's greenest reachable colour at L 60–70 is a* ≈ −9 with b* ≥ 31, while 09's ridges are (72, −15, 20) — cooler and less yellow than anything in the model, and the yellow axis had 4 steps so the inversion could not even pick the intermediate yellow. Two changes: **LUT_YL 4 → 8** (sampler slices 32 → 64, inversion cached so the cost is invisible) and a **saturation gain** `state.sat` as a camera-side processing parameter (the isolated macros are retouched): the material loop sets it from the ratio of photo to render mean chroma over the mid bands (ridges + gaps), applied in the post pass about the luminance, stored in the ID view and the cases, never in the NM. Effect: 25 Δab 5.3 → 3.2, 26 6.2 → 4.0 (sat 2.0–2.2, 25 at the 2.2 clamp — a large gain, which says the physical gamut is well inside these processed photos), 09 10.8 → 9.0 (sat 1.5), 35 unchanged (sat 1.5): 09's remaining error is **hue**, a* −15 against the model's −9 — the two-layer melanin/Rayleigh/yellow model has no way to remove red from the scattered light. Options for later: a spectral "stroma tint" axis, or accept that processed greens sit outside the physical gamut and let `sat` become a per-band (a, b) gain.

**Open after this:** 09 hue; the proxy amplitude heuristic; splat quantisation in the ID; `rimSharp` saturating at 1 suggests the rim model still lacks contrast (the photo's rim is also a colour edge: bright collagen against the dark floor — a rim material term).

### 19.8 Log (2026-09-12): valleys, not fills — BENCH ISO v59 mean 67.5 % (v58 67.5)

| ref | v58 | v59 | SSIM | height r v58 → v59 | Δab | ΔL* |
|---|---|---|---|---|---|---|
| 09-blue-green | 59.3 | **59.1** | 0.437 | 0.719 → 0.817 | 9.4 | 2.7 |
| 25-green-amber-ring | 67.4 | **70.6** | 0.491 | 0.806 → 0.809 | 2.3 | 1.9 |
| 26-green-crypts | 74.1 | **73** | 0.585 | 0.846 → 0.858 | 4.2 | 2.2 |
| 35-grey-green | 69.4 | **67.1** | 0.545 | 0.726 → 0.814 | 3.9 | 6.6 |

**iori's review of the v58 render (26):** "the blacks in the dents seem clipped or the height level scale is too small … the valleys are very unnatural". Diagnosis: the openings were flat fills with a hard outline — the field is capped near 0.08 mm and the power law flattened the floor, so the shading had no slopes to work with, and the darkness came from a near-binary mask that stripped the ABL and the fibres to one uniform floor colour.

**Changed in the bake.** (1) Openings are deepened by a fixed physical gain `g_openDepth` = 3 (a −0.08 mm field is a 0.24 mm hole); no floor flattening, so walls come from the field's own gradient and the parallax / normal / self-shadow shading draws them. It was briefly an NM gene and the optimiser picked 1.1 — the score prefers flat fills — so it is fixed, not fitted. (2) `rimSharp` sets the **wall width** (field span 60 → 15 µm over which the tissue opens), no longer a switch. (3) The floor keeps 15 % of the fibre coverage. (4) ABL and stroma thin **with depth** (`openHole` = mask × depth/60 µm; mel and stroma × 0.25 at full depth): shallow dips stay lit, deep crypts go dark; `T0.a` carries 0.6 × openHole for the photo shader's floor shadow. Result on 26: the openings read as shaded valleys with bright rims and dark olive floors instead of cut-outs; height r 0.85–0.93; MATCH 72–73 (v58 74: the score liked the fills); 25 → 71.

**Reading.** The metric is flat while the picture improved: MATCH's SSIM at quarter resolution and the profile ΔE reward dark uniform blobs as much as shaded holes. The HEIGHT harness (r 0.85) is the honest measure of the relief now; a shading-aware term (or a full-resolution structure term) would be needed for MATCH to see it. Still open: the photo's floors are darker than ours (an occlusion term inside the hole would help — the self-shadow march is 7 steps along the light only), 09's hue, splat quantisation, the proxy amplitude.

### 19.9 Log (2026-09-12): quality modes, sliders as modifiers, layer blend and procedural re-seed

**iori's review:** everything finer and more detailed even at longer render times, a 5-mode quality toggle, the engine usable on an aligned iris (procedural creation and modification), and "the sliders don't work". Decisions: field grids grow per mode and IDs resample on import; ceiling atlas 4096×1024 / fit 1280 px / 8000 splats; a global slider is a **modifier on the fitted field**; first editing capability = **per-layer FITTED↔PROCEDURAL blend + re-seed**.

**The slider bug, diagnosed.** On a fitted iris PIGM / STROMA / YELLOW moved the state but not the render (pixel-sum diff 0), RELIEF / EV / CRYPT / FURROW did: the fitted per-cell fields are `custom` and the bake ignores the global genes they mirror; CRYPT / FURROW only moved the seeded objects a photo fit empties. Fix (`uploadFields`): for a custom field the gene acts relative to the value recorded at fit time (`genome.fitted`: melanin, stroma, pheo, yellow, crypt, furrowDepth) — gain for melanin / stroma / yellow, offset for pheo and for near-zero fits (green eyes have melanin ≈ 0, a gain has nothing to scale). CRYPT on a fitted iris = opening depth gain relative to the fit; FURROW scales the fitted troughs.

**Layer blend + re-seed.** Three sliders FIT·COL / FIT·REL / FIT·FLOW (`genome.blend`, 1 = fitted): each custom field blends toward its seeded default at upload; the splat amplitudes and the extra ridges scale with the relief share while the seeded crypt / furrow objects fade with 1 − share. NEW SEED (and the SEED slider) on a fitted iris call `reseedProcedural`: a fresh genome from the seed keeps the fitted fields, splats, ridges, collarette, materials, blend and fit references, so only the procedural share (seeded objects, bundles, noise seeds) re-rolls.

**Quality modes** (`QUALITY`, header select, `localStorage` 'irisQuality'): DRAFT / NORMAL / FINE / ULTRA / CAPTURE set atlas (1024×256 … 4096×1024), field grids (128×32 / 256×64 … 256×64 / 512×128), fit image (480 … 1280 px), proxy (512×64 … 2048×256), splats (800 … 8000), LIC steps (8 … 32, at a constant integration length), parallax and self-shadow steps (6/4 … 24/16, same reach), accumulation frames (64 … 768). `setQuality` re-allocates the atlas, bundle and splat textures and resamples the live fields; `decodeFields` resamples IDs from their stored grid. Found while testing FINE: the height estimator and the ridge extractor assumed 8×4 texels per cell and a proxy of exactly 2× the working grid — with the larger grids they read past the array (height r collapsed to 0.06); both now derive the block sizes from the grids.

| ref | v59 NORMAL | v60 FINE | height r | splats | Δab | secs |
|---|---|---|---|---|---|---|
| 09-blue-green | 59.1 | 54.1 | 0.817 → 0.901 | 775 | 10.5 | 31.7 |
| 25-green-amber-ring | 70.6 | 65.5 | 0.809 → 0.938 | 1572 | 2.8 | 37.4 |
| 26-green-crypts | 73 | 67.2 | 0.858 → 0.946 | 1771 | 4.5 | 41.1 |
| 35-grey-green | 67.1 | 63.9 | 0.814 → 0.815 | 801 | 3.6 | 31.5 |

FINE fits 26 in 36 s (NORMAL 15 s); height r rises to 0.90–0.95 at FINE. Only 775–1771 of the 4000-splat budget were used: the DoG initialiser's fixed 4 µm threshold yields fewer extrema on the finer proxy, so the budget should drive the threshold (or densify from the residual) — open. **MATCH is not comparable across modes**: it is measured at a quarter of the fit image, so FINE is judged at 240 px where the strand-scale detail is still unmatched, and it reads 4–5 points lower for the same eye; the FINE render itself is visibly sharper (crypt walls, fibre relief at 4096×1024). Per-mode baselines from now on; the bench rows carry `quality`. `ref/cases.json` currently holds the FINE cases (256×64 fields, 4000 splats); the casebook resamples them in any mode.

### 19.10 Log (2026-09-12): "it stopped being volumetric" — fitted presets, pixel ratio, depth under procedural edits

**Diagnosis.** The fitted data was intact (26 at CAPTURE: `openDepth` 3, `rimSharp` 1, blends 1, 1771 splats, 4 ridges, all ten fields custom). Two display causes: (1) the interactive canvas backing store was the CSS size, so on a retina display (DPR 2) the main view rendered at half resolution and was upscaled — soft fibres and soft crypt walls, while the fit-panel and REF renders (drawn at their own resolution) stayed crisp; (2) in the Browser pane the pointer moves with every screenshot, the eye follows it, each move resets the accumulation, so the pane only ever shows a single jittered depth-of-field sample (frames = 1). In a normal browser the frames accumulate. Fix for (1): `resize()` sizes the canvas at `min(devicePixelRatio, Q.dpr)` (DRAFT 1, NORMAL 1.5, FINE/ULTRA/CAPTURE 2 — 3 made CAPTURE crawl at 1868×1726), the mouse target is scaled the same way, `setQuality` re-sizes.

**Fitted presets.** FIT·09 / FIT·25 / FIT·26 / FIT·35 buttons under the colour presets load whole fitted irides from `ref/cases.json` into the interactive view (`loadFittedPreset`: importID + the fitted view, free orbit, camera at ≥ 60 mm).

**Procedurality with depth, verified on FIT·26 at CAPTURE / FINE (REF frames):** CRYPT 0.26 → 0.7 through the real slider path sets `openDepth` 3 → 8 and back; FIT·REL 0.3 shallows the openings toward the seeded relief; NEW SEED 313 re-rolls the bundles (373 new) while the 1771 splats, the ten fitted fields and the openings stay. FINE interactive runs at ≈ 48 fps on this laptop at DPR 2. `ref/cases.json` holds the FINE-fitted cases; the presets resample to any mode.

## 20. Phase D plan: the iris designer (decided 2026-09-12)

**iori's brief.** Paint editing right on the main screen with a fixed centred camera; all basic paint tools with correct smearing and colour mixing; real-time painting of weights into any part of the shading pipeline, the depth and the colours; a compact, tidy, streamlined UI; alignment data controls; a seamless, native-feeling customisation and inpainting workflow that can edit every property of the main panel.

**Decisions.** (1) Fine painted detail = **stamps as splats** (a dab is a Gaussian with size, elongation along the drag or the local flow, and a signed amplitude: relief, colour delta as a material tuple, brightness delta) + **field brushes** for broad edits on the coarse fields; same ID format as the fit. (2) The colour brush carries a **material tuple** (melanin, stroma, pheo, yellow); picker in Lab and eyedropper through the LUT inversion; mixing = pigment mixing in the KM shading model. (3) Panel → **tabs**: VIEW / LIGHT / MATERIAL / RELIEF / FLOW / FIT / DESIGN. (4) First stretch = **D0 + D1 + D2**.

**D0 — DESIGN mode.** Toggle in the panel: frontal fixed camera, no gaze follow, no hippus, DOF off; wheel = camera distance, space-drag = pan through `u_view`; a coordinate map rendered at the main-canvas resolution (cached per camera) gives cursor → (u, tissue v) exactly; brush cursor in mm; HUD with the target layer and the value under the cursor. While a stroke is down: bake at DRAFT steps + single REF frame (real time even at FINE); full bake and accumulation on release. Tabs for the panel; presets and fitted presets in a strip; shortcuts B / E / S / M / I, [ ] size, Ctrl-Z, space, pen pressure = weight.

**D1 — field brushes.** Modes: paint toward a value, add / subtract, smooth, smear (sample under the previous dab, blend at the current). Layers: every coarse field (materials, gap materials, height, brightness, flowDir as a comb, warp, spacing, coherence, the presence fields crypt / furrow / collarette) and the layer blend weights. Footprint = a disc in mm → an ellipse in cells through rMM(v). Undo = field diffs. Radial repeat (n-fold around the ring) as an option.

**D2 — stamp brushes.** Dabs → `genome.splats` entries tagged `paint` (relief: dent / bump / streak) and a second splat list for colour deltas (rasterised into a material-delta texture added at bake) and brightness. Along-flow elongation option. Material picker (Lab → LUT) and eyedropper (render or photo → LUT). Smear on stamps = move and blend splats under the brush. Select / move / delete splats.

**D3 — reference overlay + clone brush.** The registered photo through the engine's coordinates as a semi-transparent layer (opacity, solo); a clone brush runs the local fit inside the footprint (per-cell material inversion + splats) to pull a region from the photo.

**D4 — alignment controls.** Numeric pose fields (distance, pupil mm and decentration, tilt, view offset), draggable pupil / limbus / catchlight markers on the main canvas, rerun of the alignment loop, residual readout.

**D5 — object handles.** Ridge points, spots, nodules, bundles; radial repeat; mirror to the other eye; blending two fitted IDs.

**Acceptance for the first stretch.** A fitted preset can be loaded, DESIGN entered, a dent, a streak and a colour patch painted at FINE with the render following each dab at ≥ 15 fps, undone, and exported as an ID that reproduces the edit; the panel fits one screen at 1080 px height.

### 20.1 Log (2026-09-12): designer D0–D2 built

**Files.** `design.js` (new, loaded after `fit.js`): the tabbed panel, DESIGN mode, the main-canvas coordinate map, brushes, stamps, picker, eyedropper, undo, shortcuts. `index.html`: a 4-channel paint splat pass (`vs/fs-splat4`, `genome.paintSplats` → `u_paint`, added to the material fields in the bake as Δmelanin / Δstroma / Δyellow / Δpheo so a dab mixes like pigment in the KM model), `state.design` (frontal fixed camera `rot [0,0]`, DOF off via `u_fstop` 64, no hippus, no gaze follow, wheel and drag left to the designer), `state.painting` (single REF frame while a stroke is down), `atlas.draftBake` (LIC ≤ 6 steps during strokes), tab CSS, `srgbToLinear` export.

**D0.** Tabs VIEW / LIGHT / MATER / RELIEF / FLOW / FIT / DESIGN built by moving the existing rows (`layoutTabs`, ids → tab map; the fit panel keeps its own overlay); the two blank buttons are gone; the last tab is remembered. DESIGN ON: camera at 70 mm, view crop zoom with the wheel about the cursor (to 8×), space-drag pan, Escape resets; a brush cursor in mm (`mmPerPx` = the shader's mip formula); HUD with the layer value under the cursor. The coordinate map is rendered at half canvas resolution with view 14 and cached per camera — **the read texture must not be the target** (a 1×1 dummy is bound; binding the map texture itself gave a blank map, the feedback-loop gotcha again).

**D1.** Field brushes on every coarse field (materials, gap materials, height, brightness, flowDir, warp, spacing, coherence, presence weights): PAINT toward VALUE, ADD / SUB, SMOOTH (3×3 of a stroke snapshot), SMEAR (the field under the previous dab, offset by the stroke vector, blended at the current). Footprint = disc in mm through rMM(v); falloff by HARD; pen pressure = weight; dab spacing 0.2 × size; radial REPEAT 1–12. Undo = field snapshots / list lengths (40 deep, Ctrl-Z). A field becomes custom on first touch.

**D2.** Stamps: DENT / BUMP (relief splats tagged `paint`, σ = size/3, amplitude ∓0.04 / +0.03 mm × weight, openings deepen 3× in the bake), STREAK (σ across / along = ½ / 2×, oriented by the drag or, with FLOW on, by the local strand direction), COLOR (paint splats carrying the delta from the cell's current material toward the brush material × weight), PICK / Alt-click (render pixel → Lab → nearest LUT material, swatch shows the reachable colour), the colour input converts through the same inversion and reports ΔE to the picked colour. CLEAR removes every painted stamp.

**Tests (FIT·26, NORMAL).** Synthetic pointer strokes over the iris: dent + streak → 4 relief splats, colour → 4 paint splats, brightness paint → the field custom; two undos removed the paint stamps and restored the field. A 3 mm dent at (u 0.25, v 0.55) darkened the canvas at that spot from 93 to 59; a 2 mm orange dab shows as a pigment mix. Shortcuts: D toggles DESIGN, B/A/X/S/M/N/U/K/C/I tools, [ ] size, Ctrl-Z, space pan, Escape.

**Open.** Stamp smear (move / blend splats under the brush) and select / delete of splats; brightness stamps; the picker's ΔE readout shows how far a chosen colour is from the physical gamut (greens > 10). D3 (photo overlay + clone brush), D4 (alignment controls), D5 (object handles) next.

### 20.2 Log (2026-09-12): the Windows 98 shell, scrubber knobs, and the CAPTURE casebook

**Casebook at maximum quality (BENCH ISO v61, CAPTURE: fit 1280 px, atlas 4096×1024, 8000-splat budget, ≈ 50 s per photo).**

| ref | NORMAL v59 | FINE v60 | CAPTURE v61 | SSIM | height r | splats used | Δab |
|---|---|---|---|---|---|---|---|
| 26 green crypts | 73.0 | 67.2 | 67.6 | 0.50 | 0.82 | 2310 | 5.2 |
| 35 grey-green | 67.1 | 63.9 | 66.2 | 0.49 | 0.57 | 1180 | 3.4 |
| 25 green amber ring | 70.6 | 65.5 | 62.6 | 0.41 | 0.80 | 2112 | 4.9 |
| 09 blue-green | 59.1 | 54.1 | 54.4 | 0.42 | 0.56 | 1161 | 12.5 |

MATCH is not comparable across modes (quarter-of-fit-image scale); within CAPTURE the ranking is 26 > 35 > 25 > 09. **Default fitted presets: 26, 35 and 25**; 09 stays available but is the gamut case (Δab 12.5, hue outside the model). The splat initialiser again used only ≈ 25 % of the 8000 budget (fixed DoG threshold — open, §19.9). `ref/cases.json` now holds the CAPTURE cases (2.7 MB, fetched only when the Fitted menu opens or a preset loads); the **Fitted ▾ menu lists every case ranked by MATCH with its height r and tag**, so the best candidates are always visible.

**The shell (`ui.js`, decided: Windows 98 skin, floating remembered windows, six modes CAMERA / MATERIAL / RELIEF / FLOW / FIT / DESIGN, streamlined tools with icons).** A top bar (`#w98-top`): the six mode toggles as 16-px glyph buttons, Presets ▾ and Fitted ▾ menus, quality select, ID ↓ / ↑, CAP 4K, a status field (mode · fps · atlas). Each mode is a `.w98` window: gradient title bar with icon, roll-up and close, drag by the title, position / open / rolled state in `localStorage` 'irisW98'; the old panel is hidden and its elements are **moved** into the windows so every binding survives. **Scrubber knobs** (`makeScrubber`, Apple Photos style): the range input is hidden behind a white ruler with ticks that scroll under a fixed centre marker; drag horizontally (one ruler width = the whole range), wheel for fine steps, double-click resets to the load value, the span from the default to the value is tinted. The DESIGN window carries the tool icons (paint / add / sub / smooth / smear / dent / bump / streak / colour / pick), undo and clear glyphs, the layer select and the scrubbers. Found: a scrubber drawn while its window is hidden has a zero-width ruler → the tick loop never ended and the page hung; guarded (no width → no ticks, loop capped). The pass-restore loops now skip programs without a `position` attribute (console warnings gone).

**Open.** The fit panel overlay keeps the old dark styling; the CAMERA window is tall (twelve knobs) — a second column or collapsible sub-panels à la Blender would shorten it; icons are placeholder glyphs; the splat budget shortfall at high quality.

### 20.3 Log (2026-09-12): FIT HQ, the fit panel in the shell, REFINE RELIEF

**FIT HQ** (`fitHQ`, the ★ button): switches to CAPTURE, runs `solvePose` (with the alignment loop), the whole `fitGlobal` chain at 160 NM iterations, then a **warm-start relief refinement** (`fitSplats(…, warm = true)`: the existing non-painted splats continue for 120 Adam steps instead of a fresh DoG init; hand-painted stamps are kept aside and re-appended). 26: 81 s, MATCH 66 %, height r 0.80, ΔL* 1.9. The result stays loaded at CAPTURE.

**REFINE RELIEF** replaces REFINE OBJECTS: photo fits carry the openings in the splat field, so the per-crypt Nelder–Mead had nothing to act on ("no crypts to refine (run DETECT)" even after DETECT — the bug iori saw). It now runs the warm splat refinement; the old per-crypt path remains for seeded crypt objects.

**Fit panel in the shell** (`dressFit`): 98 chrome with a draggable title, the score in the title bar, four labelled rows — FIT (★ FIT HQ, SOLVE POSE, FIT GLOBAL, DETECT, REFINE RELIEF, STOP), SOURCE (PHOTO…, reference select, view cycle, BULK…), ALIGN (AUTO, SAVE, ALIGN ↓), TEST (BENCH ISO, BENCH ALL, STUDY, CASES ↓, CASEBOOK) — the log in an inset box. First version lost the buttons (rows removed before the buttons were moved); fixed by detaching them first.

## 21. Phase E plan: towards a state-of-the-art iris (decided 2026-09-12)

**The discussion (iori: "hyperrealistic, a Blade Runner 2049 tool").** Nine gaps were laid out: (1) volume — layered strands with real inter-strand occlusion and a stroma-thickness field instead of one shaded height field; (2) occlusion in the openings (baked hemispheric AO + the directional march); (3) optics — tear-film thin-film sheen, corneal roughness, limbal dispersion and palisades, sclera SSS and vessels for whole-eye views, a real macro lens model, HDRI lighting; (4) colour physics for the cool greens (measured-albedo LUT axis or a stroma tint); (5) dynamics — light-driven pupil, saccades, blink, physical dilation folding; (6) a score that sees shading and relief; (7) fidelity to any photo — whole-eye alignment (Phase F), residual-driven splat init, quantisation, clone brush; (8) generation from fitted statistics, ID blending, photo→ID model; (9) an ANALYSIS mode in the BR2049 manner (fly-in, overlays, Daugman-style iris code + serial, monochrome scan).

**Decisions (iori).** First: **E1 layered strands + occlusion**; **E2 score** = MATCH gains a multi-scale structure term, a gradient-domain term and the height correlation in the objective (the old MATCH stays reported). **Not yet:** HDRI. **Later:** the BR2049 analysis layer.

**E1 — layered strands + occlusion.**
- Bake: two (FINE and above: three) strand layers from the LIC at different phases / seeds, each with its own coverage and a depth offset (≈ 30–60 µm apart); coverage of a lower layer is visible only where upper layers are open (product of the complements); the height becomes the depth of the first hit; a **stroma-thickness field** (T-channel; thin in openings, thick under bundles) drives the translucency and the tint in the shading (KM slab thickness × field).
- Shading: inter-strand occlusion from the layer stack (a lower-layer strand under an upper one is shadowed by the upper's coverage in the light direction — one tap along the projected light vector per layer), and **baked AO** in the openings: a hemispheric march on the height field at bake time (8 directions × 4 steps), stored in a free atlas channel, multiplied into the ambient and lid terms.
- Acceptance: the 26 crypts read as holes with lit rims and dark floors without the openMask darkening trick (turn the ABL/stroma thinning down and let occlusion do it); height r unchanged or better; BENCH ISO at NORMAL not lower than v59 on the new score's old-MATCH column.

**E2 — the score.** MATCH2 = ¼ SSIM (quarter) + ¼ SSIM (half, structure at the strand-bundle scale) + ¼ gradient-domain agreement (Sobel of L* on the mask, normalised correlation) + ¼ (1 − ΔE/40); the NM objective adds λ·(1 − height r). Report both MATCH and MATCH2 in the bench rows and the casebook; decide phases on MATCH2 from then on.

**Order.** E2 first (it is small and it changes what E1 is judged by), then E1 at NORMAL with the HEIGHT harness, bench, then FINE.

### 21.1 Log (2026-09-13): E2 + E1 built — BENCH ISO v62, and a residual study of the matching pixels

**E2 built.** `ssimAt(a, b, mask, f)` generalises the quarter-res SSIM; `gradAgree` = normalised correlation of the half-res luminance gradient vectors inside the mask; **MATCH2** = ¼ SSIM₄ + ¼ SSIM₂ + ¼ grad + ¼ (1 − ΔE/40); the NM objective adds 60·(1 − grad) + 60·(1 − height r). Both scores in the bench rows, the CSV and the casebook.

**E1 built.** Fourth atlas target `T3` = occlusion | stroma thickness | top-layer coverage. The bake runs 1 / 2 / 3 strand layers by quality (`u_layers`), each its own LIC set (seed + phase offset); a lower layer shows only where the layers above are open (product of the complements), sits 40 µm deeper, and gets 35 % less light per layer; the floor lies under the deepest layer; an analytic AO term darkens the floors of openings; `thickL` = 0.55 + 0.45 × coverage, thinned in openings. Shading: `thick` × (0.5 + 0.6 × thickness), ambient × occlusion, key × (0.55 + 0.45 × occlusion), the gap contact shadow relaxed 0.55 → 0.8, the ABL/stroma thinning in openings relaxed 0.25 → 0.45. Found: the photo shader failed to link (an `occ` used before its declaration) — the eye vanished while the UI stayed; fixed by declaring it at the atlas fetch.

| ref | MATCH v59 | MATCH v62 | **MATCH2** | SSIM₄ / SSIM₂ / grad | height r | Δab |
|---|---|---|---|---|---|---|
| 09 | 59.1 | 58.9 | **51.3** | 0.52 / 0.42 / 0.45 | 0.82 | 12.7 |
| 25 | 70.6 | 65.2 | **55.8** | 0.46 / 0.44 / 0.48 | 0.83 | 5.1 |
| 26 | 73.0 | 73.8 | **66.0** | 0.64 / 0.57 / 0.60 | 0.88 | 5.7 |
| 35 | 67.1 | 71.9 | **61.9** | 0.61 / 0.52 / 0.52 | 0.84 | 3.7 |

Mean MATCH 67.5 → 67.5 (flat), mean MATCH2 58.8 (new baseline). Height r up on every case (0.82–0.88).

**Residual study (per photo, luminance, iris mask through the coordinate map, six radial bands).**

| ref | σ photo / render | pixel corr | photo-dark pixels (L < 60): render brighter by | worst band (mean ΔL) |
|---|---|---|---|---|
| 09 | 29.5 / 20.4 | 0.59 | +40 … +62 (1 % of pixels) | +7.6 pupillary |
| 25 | 32.5 / 28.6 | 0.70 | +22 … +28 (13–33 %) | +8.8 band 2 |
| 26 | 31.9 / 23.3 | 0.69 | +13 … +24 (9–28 %) | −8.6 outer band |
| 35 | 43.3 / 28.6 | 0.76 | +18 … +39 (≤ 12 %) | **−22.8 band 2, −10.9 band 3, +10.6 band 4** |

**What the pixels say, in order of the error they carry.**
1. **Global contrast deficit.** The render's luminance spread is 66–88 % of the photo's on every case (35 the worst at 66 %). E1 relaxed the contact shadow and the floor thinning, and the two-material mix plus the LIC blur flatten the strands; the fitted per-cell ridge / gap targets are right in Lab but the render never reaches the gap darkness. This is the largest single term: SSIM at both scales is contrast-limited before it is layout-limited.
2. **Floors still too bright.** Where the photo is dark (crypt floors, deep gaps), the render is 13–28 L* brighter on the crypt-rich cases and 40–60 on the two smooth irides (few pixels, large error). Occlusion helped the look but not enough: the analytic AO caps at 60 % and the ABL thinning is now milder. A real hemispheric AO march at bake time and a floor that goes to the ABL (no stroma) would close most of it.
3. **The radial profile on 35.** Band 2 (v 0.17–0.33) is 23 L* too dark, band 4 11 too bright: the bright pupillary zone and the darker mid-ring are inverted in tone. The per-cell material loop should have caught it, so a term after it moves it (the thickness field = 0.5 + 0.6 × coverage darkens low-coverage zones, and the limbal / pupZone stroma terms). Check the band-gain loop's convergence on 35 and let the thickness field come from the photo (brightness) rather than from coverage.
4. **Layout** (SSIM₂ 0.42–0.57, grad 0.45–0.60): the second-largest term; the direction is right (height r 0.82–0.88) but bundle-scale edges disagree — the LIC strands are seeded, not fitted; only their brightness, direction and coherence are.
5. **09's hue** (Δab 12.7) is unchanged and is the colour model, not the fit.

**Recommended next (Phase E, continued):** E3 contrast + floors — hemispheric AO at bake, floor to ABL, contact shadow back to 0.55 as a *fitted* gene (gapShadow), and a **contrast target** in the material loop (the render's σ over the photo's, corrected through the strand gain and the gap floor, like EV and sat); then re-bench on MATCH2. E4 the radial profile: thickness from the brightness field, and a check of the band-gain loop on 35. Layout (fitted strand phase / spacing per cell) after that.

## 22. Phase F plan: ten times the strand and highlight detail, as diffable weights (decided 2026-09-13)

**iori's direction.** Make the iris strands and highlights about **ten times more detailed** while keeping
full procedurality, with weight maps that can be modified, diffed and collected into a database of iris
IDs. Back the engine up per version and archive the statistics so several versions can be compared and it
is visible *which feature fitted best*.

### 22.0 What "ten times" means, measured

Three different ceilings are involved and only one of them is a resolution problem.

| axis | at v62 | the ceiling |
|---|---|---|
| atlas texel | 12.3 µm angular (r = 4 mm) / 7.8 µm radial at NORMAL; 6.1 / 3.9 at FINE+ | **not** the limit: a 55 µm strand is already 4–9 texels wide |
| finest generated scale | `spacing` = 55 µm (`lic(uv, spacing, …)`) — nothing below one strand exists | this is where the decade lives: 15 µm and 5 µm scales |
| screen | a whole-iris frame is ≈ 14 µm/px, so a 50 µm strand is ~3.5 px | ten times finer is *invisible* in the wide view; there it can only be statistics (contrast, sheen anisotropy), with real geometry under crop / CAPTURE / fly-in |

Memory forbids the naive fix: at 4096 × 1024 the four RGBA16F targets are already ≈ 134 MB, so 8192 × 2048
× 5 targets (≈ 670 MB) is out. The finest one or two scales must therefore be evaluated **per pixel in the
photo shader at the marched hit point**, with an analytic amplitude fade at the pixel footprint — which is
also the correct filtering answer, because it makes sub-strand detail vanish exactly when it would alias
instead of mip-blurring into grey.

**Seven causes of the detail cap at v62** (each read off the code):

1. **Three scales only, the finest is one strand** — weights 0.55 / 0.28 / 0.17 on 0.5 mm / 0.16 mm /
   0.055 mm. No sub-strand band: no fibril grouping, no ABL speckle, no melanocyte granularity.
2. **`spacing` and `phase` are never fitted.** A fitted case carries ten custom fields (the six material
   fields, height, flowDir, coherence, strandBright); `spacing` stays at the global 0.055 everywhere and
   `phase` at 0, while 06 measured 35 µm pupillary → 54 ciliary → 69 peripheral. Strand *placement* is
   seeded noise. 07 §3 specifies the estimators (windowed spectrum → spacing, Gabor → phase); never built.
3. **The coverage transfer is a global constant** (`smoothstep(0.30, 0.74, …)`), so crispness cannot vary
   per place — the same defect the residual study calls the global contrast deficit.
4. **Strands have no identity.** Thresholded value noise gives Gaussian blobs, not ribbons that start,
   branch, cross, taper and carry pigment along their length. Octaves cannot fix that; instances can —
   exactly the C3 lesson, where the relief jumped once it became 1 689 *fitted* Gaussians.
5. **The atlas is mipped and the normal is read at that lod**, so height averages into the mips and slopes
   cancel: adding finer relief today makes the wide view *flatter*.
6. **The sheen tangent comes from the coarse flow field** (`u_f0` at 256 × 64 — one linearly interpolated
   direction per ≈ 2 strands) while the strands it should follow were displaced by `warpMM`, bent around
   openings by `g_openWarp` and re-phased per layer. The highlight is combed by a different field than the
   fibres.
7. **Highlights are three global constants**: the corneal mirror, a fixed `0.05·pow(NdotH, 24)` lobe and
   `0.12·ridge·pow(sinTH, 48)`. No roughness or wetness field, no anisotropic microfacet lobe, no tear-film
   breakup, and no specular-aware filtering — so ten times finer strands would give *less* highlight detail.

### 22.1 The decided phase order

| phase | content | acceptance |
|---|---|---|
| **F0** | contrast and floors, with the strand-contrast genes the new diagnostics measure: `strandMed`, `strandFine`, `strandSharp`, `gapShadow` fitted, and a strand-energy term in the objective | `sigmaRatio` and `hfRatio` up, MATCH2 not lower |
| **F1** | filtering and the tangent, *before* any new detail: a fourth bake target (strand tangent + normal variance + wetness), an anisotropic GGX lobe from it, specular-aware lod | highlight detail no longer collapses at lod 2–3; `grad` up |
| **F2** | `spacing` and `phase` from the photo (07 §3) plus a per-cell crispness field | `spacingRatio` → 1, SSIM₂ up |
| **F3** | the sub-strand decade: a 15 µm fibril band and a 5 µm ABL speckle, evaluated per pixel with a footprint fade | `hfRatio` → 1 at CAPTURE, no aliasing at NORMAL |
| **F4** | strand instances ("strand gaussians"): residual-driven anisotropic ribbons carrying coverage, brightness, tangent and pigment | SSIM₂ and `specAgree` up; layout becomes fitted |
| **F5** | ID v3: quantisation, field pyramids, instance ids, per-layer content hashes, diff and dataset export | a full ID ≤ 300 KB at ten times the degrees of freedom; a diff is a sparse delta |
| **F6** | the highlight stack proper: tear-film thickness and breakup, ABL gloss, wetness field, HDRI | — |

**Why F5 comes late.** A fitted case is 394 KB today (genome 287 KB — unquantised floats, bundle points at
17 significant digits, 1 689 raw splats — plus 105 KB of fields), and carries ≈ 96 000 controllable numbers
(7 × 128 × 32 + 3 × 256 × 64 field values, 1 689 × 6 splats, 394 × 19 bundles). Ten times the degrees of
freedom is ≈ 1 M numbers, which at v2's encoding is ≈ 4 MB per eye and a diff that rewrites the file. The
fix is quantisation (the genome alone drops to ≈ 40 KB), fields as **pyramids** (base + residual levels, so
a fit writes coarse levels and a brush writes a sparse fine patch), instance lists with **stable ids**, and
a **content hash per layer** (colour / relief / flow / strands) so the database can say which layer changed.
Designing that before F2–F4 would shape the format around the wrong payload.

### 22.2 Log (2026-09-13): the version archive, the diagnostics, and a bug in the coordinate map

**The archive (`iris-engine/versions/`).** One directory per version holding the source that produced the
numbers (`src/`, sha256 per file), the bench rows (`bench/`), the fitted IDs (`cases.json.gz`) and a
`manifest.json` with the note, the feature flags and a per-case summary. `snapshot.py <id>` seals a version,
`compare.py` prints the mean table with arrows against the previous version, `--cases` the per-case table
and `--diff A B` every metric side by side. `benchIsolated({ ver: 'v65-…' })` posts the rows straight into
the version's folder through a new `POST /save/versions/<id>/<name>.json` route in `serve.py`.
`versions/README.md` documents which metric tests which feature.

**The diagnostics (`fit.js: diagnostics()`, DIAG button, in every bench row).** Everything through the
coordinate map, once per bench case (≈ 150 ms), never inside the optimiser:

- `sigmaRatio` — σ(L\*) render / photo: the contrast deficit, the largest residual term of §21.1.
- `darkErr` — how much brighter the render is over the photo's darkest 15 % (a percentile, not an absolute
  L\*, so a dark brown iris and a blue one compare): the floors.
- `bandDL` — mean ΔL\* in six radial bands: the radial profile, automated.
- `specAgree` — intersection of the normalised angular power spectra per zone, 0..1: structure at every
  scale at once.
- **`hfRatio`** — the share of angular power in the **strand band (30–90 µm)**, render over photo. A plain
  argmax of the spectrum is useless (natural spectra fall as 1/f², so the peak always lands at the lowest
  frequency — which is why 06 could only resolve spacing on the sharpest macros), so the spacing estimate
  whitens the spectrum against its own ±½-octave geometric mean first. The band is clamped to 2.5 px per
  cycle of the *photograph*, and `resolvedMm` reports what that was.
- `hfLap` — the same quantity as a tangential Laplacian at ± half a strand spacing, 3–8 ms, computed from
  offsets cached on the coordinate map. This one is cheap enough for the objective.

**What the baseline measured (v63-base, the v62 engine with the diagnostics, F0 off):** mean MATCH 65.4,
MATCH2 56.8; `sigmaRatio` 0.45–0.80; floors +22 … +51 L\*; and **`hfRatio` 0.14–0.41 overall but 0.027–0.10
in the ciliary zone** — a 10–37× strand-detail deficit exactly where 06 measured the strands. iori's "ten
times more detailed" is, measured, a factor of about ten in strand-band energy.

**The bug the first baseline exposed.** Every band-6 number came out +15 … +47 L\*. It was not the engine:
`renderPass` returned `vec4(BG_COL, 0.0)` — pure white — for any ray that misses the cornea, *before* the
mask / map / height views get their early-out. `getMap` reads `inside` from the blue channel and v from the
green, so **every background pixel came back as iris tissue at v ≈ 1.0**: on ref 35, 102 454 of 171 662
"inside" pixels were the page. Every polar unwrap splatted the background into the outermost rows and then
filled inward from it, which reaches `materialFromPhoto`, `flowFromPhoto`, `cellStats` and `textureStats`.
Fixed by returning "no data" for the debug views; `inside` then measures 69 208 pixels against an annulus
area of 70 706. Benched separately as **v64-mapfix** so the archive records what the fix alone was worth.

**Second correction from the same investigation.** `map.vmax` (the largest tissue v sampled at each angle)
shows ref 35 is only photographed out to v 0.74–0.88 — its peripheral zone does not exist in the photograph.
The diagnostics now clip to the photographed extent per angle, mark a zone `UNPHOTOGRAPHED` when fewer than
four whole rows survive, and report `coverage` and `vmaxMin` in every row. Statistics that included that
region were comparing the render's real tissue against neighbour fill.

**F0 built (inert by default).** `strandMed` / `strandFine` (weights of the 0.16 mm and 0.055 mm scales
against the 0.5 mm bundles), `strandSharp` (narrows the coverage transfer of each scale, most at the fine
one) and `gapShadow` (the contact shadow, hard-coded 0.8 since E1) are genome globals, bake/shading uniforms
and fit genes; their defaults reproduce v62 exactly. The objective gains `60 × (1 − min/max)` on the
strand-energy ratio, because SSIM and the gradient term are blind below ≈ 0.16 mm and nothing else would
reward the strand band. `fit.strandGenes` / `fit.strandTerm` (or `benchIsolated({ f0: false })`) turn both
off, so a baseline and an F0 run differ only in those switches.

### 22.3 Log (2026-09-13): F0 benched — the strand-energy term is phase-blind

**v64-mapfix (the coordinate-map fix alone, F0 off).** Mean MATCH 65.0, MATCH2 57.3 — flat against v63-base
(65.3 / 56.8) — while every diagnostic improved: floors **+30.2 → +11.3 L\***, `sigmaRatio` 0.625 → 0.723,
`specAgree` 0.638 → 0.683, and the phantom +15 … +47 L\* outer-band error gone. The first thing the archive
proved is that a real correctness fix can leave MATCH2 untouched; without the diagnostics it would have
looked like wasted work.

**v65-f0 (strand genes fitted + strand-energy term, weight 60).** Negative, and instructive:

| | v64-mapfix | v65-f0 |
|---|---|---|
| `hfRatio` (strand-band energy) | 0.160 | **0.665** |
| `sigmaRatio` | 0.723 | 0.858 |
| `specAgree` | 0.683 | 0.745 |
| `ssim2` | 0.482 | **0.369** |
| `grad` | 0.510 | **0.332** |
| MATCH2 | 57.3 | **46.9** |

The strand energy arrived — ciliary `hfRatio` 0.05 → 0.16…0.77, pupillary ≈ 1.0 — and the structure terms
collapsed, worst on 09 (MATCH 58.9 → 30.5). The genes have real authority (strand energy 4.05 → 10.9 at the
extreme, against the photo's 19.4), so the fault is the *objective*: **an energy ratio is phase-blind.** It
asks how much power sits in the 30–90 µm band, not whether it sits where the photograph's strands are, so
the optimiser bought it with high-frequency noise and paid for it in SSIM₂ and gradient agreement.

**The measurement that settles it.** `strandCorr` — normalised cross-correlation of the two tangential
band-pass responses, i.e. `gradAgree` moved from half resolution down to the strand scale — reads **0.004**
between photo and render on ref 26 (self-correlation 1.000). The render's strands have essentially *no*
spatial agreement with the photograph's. Noise cannot raise this number; only fitted spacing and phase can.

**Corrective.** The objective term becomes `hfW × (1 − max(0, strandCorr)) + 0.25 × hfW × deficit`, where
`deficit` is the energy shortfall only (never a penalty for excess). While `strandCorr ≈ 0` the correlation
half is a near-constant offset — which is the *correct* behaviour: it refuses to pay for noise, and the
weak deficit nudge is all that remains until F2 gives the fitter something to align. `strandCorr` becomes
the headline acceptance number for F2 and F4, and `benchIsolated({ f0, f0term, f0weight })` ablates the
genes against the term.

**Consequence for the plan: F2 moves ahead of the F0 amplitude gain.** Raising strand contrast before the
layout is fitted is measurably worse than leaving it alone. F0's floors-and-contrast half stands (it came
with the map fix); its strand-amplitude half waits for fitted spacing and phase.

### 22.4 Log (2026-09-16): the F0 ablation — the genes were right, the term was wrong

v65 fitted the four strand-contrast genes *and* added the strand-energy term, and lost 10 MATCH2 points.
**v66-genes-only** repeats it with the genes fitted and the term off (`benchIsolated({ f0: true, f0term:
false })`), which separates the two halves:

| | v64-mapfix | v65-f0 (genes + term) | **v66 (genes only)** |
|---|---|---|---|
| MATCH | 65.0 | 58.8 | **69.3** |
| MATCH2 | 57.3 | 46.9 | **59.2** |
| SSIM₄ / SSIM₂ | 0.543 / 0.482 | 0.467 / 0.368 | **0.593 / 0.493** |
| grad | 0.510 | 0.332 | 0.491 |
| hfRatio | 0.160 | 0.665 | 0.221 |
| spacingRatio | 0.941 | 0.988 | **1.010** |
| darkErr | +11.3 | +10.6 | +14.6 |

The genes alone are the **best version so far on every headline number**, ahead of v62-e1e2 (67.5 / 58.8)
which had the old, contaminated coordinate map. Per case, MATCH: 09 58.9 → 60.8, 25 65.2 → 66.6,
26 74.0 → 75.2, 35 61.9 → **74.5**. The strand-band energy rises honestly to 0.221 (not the 0.665 the
term extracted by putting noise in the band), and `spacingRatio` lands at 1.010.

So `strandMed`, `strandFine`, `strandSharp` and `gapShadow` are now **on by default** and the
strand-energy term is **off** (`fit.strandGenes = true`, `fit.strandTerm = false`), which is also what a
plain `benchIsolated()` now reproduces. The term stays in the code, correlation-led, for F2 to switch on
once there is a layout to align to.

**The number F2 has to move.** Fitted `strandCorr` — the normalised cross-correlation of the tangential
band-pass responses — is **0.064–0.106** across the four macros. Structure at strand scale is essentially
uncorrelated with the photograph even in the best version; every point of MATCH2 so far comes from colour,
relief and bundle-scale layout. That is the acceptance number for fitted spacing and phase.

**Process note.** A stale default nearly cost a day: `fit.strandGenes` / `fit.strandTerm` were left
undefined, so interactive FIT GLOBAL and FIT HQ silently ran the v65 configuration. Any switch that
changes what the fitter optimises must have an explicit default set where it is declared.

## 23. Phase G plan: routed fitting — a mixture of experts over bands, zones and samples (decided 2026-09-17)

**Why.** Three failures this month were one failure: parameters that cannot explain part of an image absorb
its error anyway. v65 bought strand-band energy with noise; v67 (CAPTURE presets) flattened contrast to escape
a strand-misplacement penalty it had no way to fix; the handoff's degeneracy gotcha (a shading field against a
per-cell material) is the same thing inside the material loop. In mixture-of-experts terms: no router, so every
expert is trained on every token. Routing makes the fit *trustworthy*; it does not make the generator more
*expressive* — strand placement still needs F2.

**The mapping.** Experts = the parameter blocks the engine already has, each owning one frequency band and one
kind of structure. Tokens = pixels of a sample. Router = an analytic gate per pixel × expert (no learned network
until a photo → fields model exists). Each expert's loss is computed only on its own band of a Laplacian pyramid,
normalised by the local low-pass so a tone change does not read as band energy. The forward pass (bake + shade)
is unchanged. Load balancing = an evidence map per expert: an expert without evidence keeps its prior.

| expert | owns | band / signal | genes (NM) |
|---|---|---|---|
| E0 tone | exposure, light, limbal tone, gap floor | profiles (L\*, a\*, b\*) + pixel term | ev, ambient, lid, limbalDark, limbalWidth, limbalMilk, gapShadow |
| E1 geometry | pupil, limbus, pose, dilation | edges, masks | solvePose / alignLoop (unchanged) |
| E2 material | per-cell strand / gap material | ≥ 0.3 mm, chroma | materialFromPhoto (unchanged) |
| E3 relief | splats, ridges, strand-layer relief | B1 0.3–1 mm + height r | collr, fibreContrast |
| E4 bundles | flow, bundle contrast, 0.16 mm scale | B2 0.09–0.3 mm + gradient agreement | strandGain, strandMed |
| E5 strands | fine scale, transfer sharpness | B3 0.03–0.09 mm | strandFine, strandSharp (F2: spacing, phase) |
| E6 sub-strand | fibril grouping, ABL speckle | 5–30 µm | F3 |
| E7 optics | specular, roughness, wetness | specular pixels | F1 / F6 |

**The gate.** `g_e(p) = mask(p) · zone_e(v) · resolvable_e · focus_e(p) · trust(sample)`.
`resolvable` is the share of the band (in log wavelength) that lies above 2.5 px per cycle at the sample's
µm/px — at NORMAL (≈ 27 µm/px) B3 is only partly open and E6 is closed, which is why v65's strand-energy term
at NORMAL measured mostly unresolvable structure. `focus` is the local band energy over the next coarser band's
in the photograph, relative to the image's own 90th percentile. `trust` is 1 for verified samples and **0 for
unverified ones** (iori, 2026-09-17).

**Schedule.** Coarse to fine — E0 → E3 → E4 → E5 — each block a small Nelder–Mead run on its gated loss, then
frozen. Coarse experts define the frame the finer ones live in, which is also the standard cure for local
minima in image fitting. A block whose evidence is below 0.15 is skipped and its genes stay at the prior. No
joint polish in the first version: it would reintroduce the compensation routing exists to stop.

**Two modes.** *Identity fit* — one eye; experts combine partial samples of the same eye (a whole-eye photo for
E0–E4, a macro sector for E5); never mix people. *Population prior* — the database; each expert learns a
distribution from every sample whose gate is open for it, so partial samples of different people are fine.
Together they deliver the "ten times" of §22: fit a 12 µm/px photograph with E0–E4 and draw E5–E6 from the prior
the super-macros taught — a render more detailed than its photograph, still procedural, every weight diffable.

**Guard metrics per expert.** E0 `sigmaRatio`, ΔL\*; E2 Δab; E3 height r, `bandCorr[B1]`; E4 SSIM₂, grad,
`bandCorr[B2]`; E5 `strandCorr`, `hfRatio`, `bandCorr[B3]`; E6 needs its own.

**Data.** Verified partial samples live in `ref-staging/` (quarantine, §22). Masks for them come from the
detection phase, not by hand (iori): detection is validated against SBVPI's hand-drawn masks, and only once it
is correct does it mask the staging images. So the router is built and benched on the four ISO macros first,
whose masks are the fitted alignment.

**Order (iori: as proposed).** (1) band pyramid, gates, routed objective, evidence map — bench against
v66-genes-only, which it must hold while the guard metrics stop sliding; (2) F2 inside E5; (3) population
priors for E5/E6; (4) detection phase on SBVPI (E1 evidence) → automatic masks → the staging samples enter.

**Risks.** The router is analytic, not learned. Bands are not independent (nonlinear shading and the
two-material mix leak energy across them); mean normalisation reduces the leak, it does not remove it. Sectors
need their own registration (pupil circle from a visible arc, scale from a pupil-radius prior). E6 evidence will
come from three super-macros by one photographer on one camera until there is more.

### 23.1 Log (2026-09-17): the router, four versions, and the perception–distortion wall

| version | what changed | MATCH2 | MATCH | SSIM₂ | grad | note |
|---|---|---|---|---|---|---|
| v66 | joint NM, strand genes | 59.2 | **69.3** | 0.493 | 0.491 | previous best |
| v68 | router v1: correlation-led band losses | 57.7 | 68.1 | 0.478 | 0.470 | `gapShadow`, `fibreContrast`, `strandGain` pinned to bounds on every eye |
| v69 | router v2: two-sided band anchors, E0 contrast term | **59.7** | 67.8 | **0.504** | **0.530** | same genes still pinned; losses flat |
| v70 | router v3: seeded texture matched by statistics | 49.2 | 63.6 | 0.367 | 0.327 | statistics right (band ratios ≈ 1, σ 0.85), pixels wrong |
| v71 | v69 through the `seededLoss` switch | **59.7** | 67.8 | **0.504** | **0.530** | bit-for-bit identical to v69 |

**What the router showed.** (1) A correlation-led band loss has a trivial way out: a render band is fitted
structure plus seeded texture, and suppressing the uncorrelated seeded share raises the correlation — so the
seeded-amplitude genes pinned to their "flatten" bounds (v68). (2) A two-sided amplitude anchor did not free them
(v69): any pixel-wise term prefers less of a texture that sits in the wrong places. (3) Matching seeded texture by
statistics (Portilla–Simoncelli in spirit) gets contrast and band energy right and loses 10 MATCH2 points (v70).
This is the **perception–distortion trade-off** (Blau & Michaeli 2018): with placement unfitted, the
distortion-optimal render is flatter than reality and the realistic one scores worse. v65, v67, v68/69 and v70 all
hit the same wall; only F2 removes it. Both treatments stay available: `fit.seededLoss = 'pixel'` (fidelity,
default) or `'stats'` (look).

**Experts now declare their layout.** *Fitted* (placement comes from the photo) → pixel losses. *Seeded*
(placement is procedural) → statistical losses, or pixel losses when fidelity is the purpose. F2 moves the strands
from seeded to fitted, which is what should let the stats-level detail and the pixel scores agree.

**Determinism.** v71 reproduces v69 exactly, so run-to-run noise is zero and every version delta in the archive is
real. The ~2-point v62 → v63-base gap was a real change, not noise. The noise that matters is sensitivity to the
start; multi-start measures it (next guard to build).

**Hidden-tab throttling, found and fixed.** `nelderMead` yielded with `setTimeout(0)` once per iteration. In a
hidden tab Chrome clamps timers, and after five minutes hidden its intensive throttling runs chained timers about
once a minute — a 120-iteration fit took ~2 h. That was the eleven-hour CAPTURE bake. `fit.js` now yields through a
`MessageChannel` (`yieldNow`), as the Flame Strains rig does; the CAP 4K tile loop too. A routed fit takes 15–45 s
per eye in a hidden pane.

**Default.** Routed, pixel mode (v71). Next: F2 inside E5 (fitted spacing and phase), then a multi-start
sensitivity guard.

## 24. F2: strand placement from the photograph (built 2026-09-17)

**What was missing.** The fitter filled `flowDir`, `coherence` and `strandBright`; `spacing` stayed at one global
0.055 mm and `phase` at 0, so strands ran the right way but sat where the seed put them (`strandCorr` 0.06–0.11).
That is the root of the perception–distortion wall of §23.1.

**Why the noise scales cannot be placed.** Shifting value noise re-rolls the pattern instead of moving it, and a
lattice whose scale varies per texel slides and decorrelates. So the noise path is left exactly as it was (every
unplaced iris renders bit for bit as before — verified on the four presets) and F2 adds a separate, addressable
strand basis.

**The carrier (bake, `strandCarrier`).** Gabor-noise style: every flow cell carries its own plane wave
`cos(2π·x'/spacing + phase)`, with `x' = Δa·cos θ − Δv·sin θ` measured *from that cell's centre* across that cell's
flow angle θ, and the four nearest cells' waves are blended bilinearly; a weak breakup noise lets strands swell and
end. It replaces part of the top layer's fine scale: `licF = mix(licF, carrier, place)`. New flow-grid fields:
`placeSpacing`, `phaseC`, `phaseS` (phase stored as cos/sin — a wrapped angle interpolates through π and draws
seams; the ranges put the defaults exactly on u8 steps), `place` (carrier weight), in a new pack `f2` on texture
unit 14. The old `phase` field is gone; the old `spacing` field still drives the noise scales.

**The estimator (fit.js, `placementFromPhoto`).** Works on the full-resolution photograph (4.8 µm/px on the ISO
macros — the fit image is far too coarse), unwrapped into a 4096 × 512 tissue grid through the coordinate map
upsampled with circular interpolation of u. A high-pass at ≈ 110 µm normalised by the local mean keeps the strands
and drops zones and tone. Spacing per 4 × 4-cell block by a matched filter over eleven candidates (28–92 µm), each
candidate's response divided by its mean over all blocks (removes the spectral tilt), then a 3 × 3 median. Phase
and placement weight per flow cell by demodulating the cell ± one cell in *that cell's own frame* with the
u8-quantised θ and spacing the bake will see. `place` = stripe coherence (|Σ L·e^{iΦ}| / Σ|L|) mapped 0.12…0.42 →
0…1, times the block's peak prominence. `clearPlacement()` resets the fields when F2 is off. Switch:
`fit.placement` (bench option `f2`).

**Two bugs found on the way, both mine.** (1) The first carrier measured x' from u = 0: a lever arm of up to 25 mm
turns the 0.008 rad step of a u8 flow angle into four strand periods, so stripes were scrambled even in the atlas
(atlas-vs-formula correlation 0.065). Per-cell frames fixed it (0.42; the rest is the breakup noise and the
coverage transfer). (2) `demod` summed L·e^{+iΦ}, which returns −φ: the fitted phase correlated 0.014 with the
photo and its conjugate 0.452. After the sign fix the prediction matches the photograph at 0.473.

**First measurement (ref 26, CAPTURE, before the material fit).**

| | placement off | placement fitted | phase flipped by π |
|---|---|---|---|
| strandCorr | 0.028 | **0.247** | −0.211 |
| fine band B3 corr | 0.015 | **0.119** | −0.091 |
| bundle band B2 corr | 0.065 | **0.198** | −0.073 |
| SSIM₂ | 0.112 | **0.222** | 0.050 |
| gradient agreement | 0.051 | **0.223** | 0.000 |

Spacing median 46 µm (06 measured 35–70), 69 % of cells placed, estimator 1.6 s. The π-flip turning every
correlation negative is the proof that the rendered strands are registered to the photograph's.

**Presets decoupled from benches.** Presets now load from `ref/presets.json`, which only `bakePresets` (or a
deliberate promotion) writes; `ref/cases.json` stays the casebook that every bench rewrites.

### 24.1 Log (2026-09-17): F2 benched — the wall breaks at CAPTURE; an order leak found and closed

| version | quality | configuration | MATCH2 | MATCH | SSIM₂ | grad | strandCorr |
|---|---|---|---|---|---|---|---|
| v71 | NORMAL | routed pixel, no F2 | 59.7 | 67.8 | 0.504 | 0.530 | 0.06–0.11 |
| v72 | NORMAL | routed pixel + F2 | **60.0** | 67.9 | **0.509** | **0.536** | **0.18–0.25** |
| v73 | CAPTURE | routed pixel, no F2 | 44.6 | 61.5 | 0.334 | 0.220 | 0.10 |
| v74 | CAPTURE | routed pixel + F2 | **54.7** | **65.3** | **0.451** | **0.431** | **0.40** |
| v75 | CAPTURE | routed stats + F2 | 49.3 | 61.6 | 0.389 | 0.350 | 0.29 |

- **NORMAL:** no regression, every structure metric up on every eye, although the strands are barely resolvable
  at 27 µm/px.
- **CAPTURE:** placement lifts MATCH2 by ten points. Before F2, higher resolution made fits worse (v67); with it,
  resolution starts to pay.
- **The wall** (§23.1): the statistics-mode penalty halves (−10.5 at NORMAL without F2 → −5.5 at CAPTURE with it)
  but does not vanish. In stats mode the seeded genes now pin at the *high* bounds, because the coarse band B1 holds
  only 0.53–0.72 of the photo's energy at CAPTURE — a 0.3–1 mm deficit no seeded-texture gene can fill (relief and
  bundle territory). Pixel mode overshoots the strand band instead (`hfRatio` ≈ 1.8): the carrier is strong relative
  to the coarse structure. Both point at the same next item: coarse-band energy at CAPTURE.
- **F2 is the default** (`fit.placement = true`).

**Order leak.** A rerun of v74 after a different preceding bench moved one eye by 4 MATCH2 (25: 53.9 → 58.0).
`bestPresetStart` evaluated `'current'` — the genome left by the previous fit — as a start candidate, and genes the
presets never set (`strandMed`, `gapShadow`, `ambient`, …) carried over anyway. Every fresh fit now starts from a
canonical genome (seed 42) and canonical gene values (`FIT_START`); `'current'` is a candidate only for the FIT
GLOBAL button (`fitGlobal(iters, { fromCurrent: true })`). The rerun gap is also the first measurement of start
sensitivity: up to ±4 MATCH2 on a single eye, so single-eye deltas below that are not evidence until multi-start
exists.

**Archive fix.** `snapshot.py` used to copy whatever `ref/cases.json` held when it ran, which after a sequence of
benches belongs to the last one. Benches with `ver` now write their own fits to `versions/<ver>/bench/cases.json`,
the snapshot archives those, and the manifest records `casesSource`. v73 and v75 were sealed without cases; v72
was rerun (identical) to archive its fits; v74's fits come from the rerun (the leak made them differ).
