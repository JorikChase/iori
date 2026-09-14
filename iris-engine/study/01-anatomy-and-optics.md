# 01 — Anatomy and optics of the human iris, as seen by a macro camera

Scope: everything a front-view, macro-lens renderer needs to know about the anterior segment. Numbers are adult, emmetropic means unless stated; ranges are roughly ±2 SD from the cited population studies. All lengths in millimetres, all depths measured from the corneal apex (anterior tear-film surface) along the optical axis unless noted.

---

## 1. Globe and anterior-segment geometry

The eye is not a sphere with a flat iris behind a window. It is a ~24 mm globe with a steeper, smaller-radius corneal cap grafted on the front, and behind that cap sits a shallow fluid-filled dish (the anterior chamber) whose floor is the iris, itself a thin, slightly forward-bowed truncated cone resting on the front of the lens.

| Structure | Value | Notes |
|---|---|---|
| Axial length | 23.5–24.5 | Globe is slightly oblate; equatorial diameter ~24 |
| Scleral radius of curvature | 11.5–12.0 | Sphere centre ~11.5 mm behind the apex; the corneal cap protrudes ~2.5 mm ahead of it at the limbus |
| Corneal anterior radius (apex) | 7.7–7.8 | Gullstrand 7.7; prolate ellipsoid, Q ≈ −0.26 (flattens toward limbus) |
| Corneal posterior radius | 6.5–6.8 | Gullstrand 6.8; back/front ratio ≈ 0.82–0.84 |
| Central corneal thickness | 0.52–0.55 | Aguirre model 0.55; thickens to ~0.65–0.70 at the limbus |
| Corneal diameter, horizontal (white-to-white) | 11.7 ± 0.4 (11.0–12.6) | Males ~0.3 larger than females |
| Corneal diameter, vertical | 10.6–11.0 | Cornea is a horizontal ellipse from the front; sclera overlaps top and bottom more |
| Corneal sagitta at the limbus | ~2.6–2.7 | For R = 7.8, half-chord 5.9: R − √(R²−h²) |
| Anterior chamber depth (endothelium to lens) | 3.0–3.25 (2.7–3.75) | Shallower with age and hyperopia |
| Anterior chamber depth from apex | ~3.5–3.8 | Add CCT; Aguirre uses iris face at 3.9 under cycloplegia |
| Lens anterior pole, from apex | ~3.6 | Gullstrand relaxed eye; lens thickness 3.6–4.0, anterior radius ~10 |
| Iris diameter (true, root to root) | ~12.0 | Model iris radius 5.57 after removing corneal magnification |
| Iris annulus width, undilated | ~4.0 | 12 mm iris, 4 mm pupil |
| Iris thickness at root | 0.50–0.55 | Thinnest point; this is where iridodialysis tears |
| Iris thickness at collarette | 0.60–0.70 | Thickest point, ~1.5 mm from the pupil margin |
| Iris thickness at pupil margin | 0.15–0.30 | Aguirre uses 0.15 at the aperture; margin is a tapered lip |
| Pupil diameter, physiological range | 2–8 | Indoor photographic conditions 3–5 |
| Dark-adapted pupil, age 20–29 | 7.3 (5.7–8.8) | Falls to 6.2 at 40–49, 5.2 at 70–79, 4.9 at 80+ |
| Pupil centre offset vs limbus centre | 0.1–0.3 nasal, 0.1–0.2 superior | Wilson 2000: 0.27 ± 0.09 nasal, 0.20 ± 0.15 superior in the dark |

**Iris profile.** In OCT cross-section the healthy iris is convex toward the cornea in 85 % of emmetropes, 96 % of hyperopes and 67 % of myopes; 26 % of myopes show a concave (backward-bowed) profile, and this is the population where the pupil margin appears to sink. The iris root inserts into the ciliary body at the scleral spur, which lies about 4.0–4.5 mm behind the corneal apex and about 0.5 mm behind the posterior limbal corneal surface. The pupil margin rests on the lens anterior pole at ~3.6 mm. Net result: **the pupil margin sits roughly 0.5–1.0 mm anterior of the iris root**, and the surface between them is not a straight cone but has an additional mid-peripheral bow of ~0.1–0.3 mm (chord-to-surface) in normal eyes. For a renderer, a truncated cone with apex-angle such that the surface rises 0.7 mm over a 4 mm annulus (≈10°), plus a small convex bulge peaking around 60 % of the annulus, is a faithful default. The iris root itself is hidden: the opaque sclera and limbal cornea overhang the angle recess, so the last ~0.3–0.5 mm of iris is never seen from the front.

**Lens.** Immediately behind the pupil the lens anterior surface (radius ~10, index ~1.42 equivalent) is a transparent, slightly yellowing (with age) dome. It is invisible in a healthy young eye except as a very faint secondary reflection (Purkinje III), but it is what the pupil margin physically rests on and what a nuclear cataract turns brown.

---

## 2. Refractive indices and what the cornea does to the picture

| Medium | n (visible) | Thickness on axis |
|---|---|---|
| Air | 1.000 | — |
| Tear film | 1.336–1.337 | 3–7 µm; optically the outermost surface, source of all specular highlights |
| Cornea | 1.376 | 0.52–0.55 |
| Aqueous humour | 1.336 | ~3.0–3.2 |
| Lens | 1.386 (cortex) → 1.406 (nucleus); 1.42 equivalent | 3.6–4.0 |
| Vitreous | 1.336 | ~16.5 |

The cornea–air interface carries almost all of the eye's refractive power (+48.8 D anterior, −5.9 D posterior, ~43 D net) because the corneal–aqueous index step is tiny (1.376 vs 1.336). For the iris it behaves as a single spherical surface with R ≈ 7.8 in front of an object in a medium of n = 1.336.

**Magnification and apparent depth.** Tracing a paraxial ray from the pupil plane (3.6 mm deep) out through that surface: object vergence −1.336/3.6 = −371 D, surface power +43 D, image vergence −328 D → the virtual image (the entrance pupil) lies **3.05 mm** behind the apex, and the lateral magnification is 371/328 = **1.13×**. So a 4.0 mm pupil looks like a 4.5 mm pupil, and the whole pupillary zone appears ~0.5 mm closer to the cornea than it is. Clinical pupillometry confirms the direction and shows it grows with pupil size (apparent 3.68 vs true 2.50 mm in one cataract cohort, mean ratio 1.47 including perspective effects). Magnification falls off toward the periphery because the peripheral cornea is flatter and the iris root is closer to the surface: a true iris radius of ~5.6 mm presents as a visible iris of ~11.8–12.0 mm diameter (≈1.06×). Practical consequences:

- The visible iris is radially *compressed* toward the limbus: features near the pupil are stretched 13 %, features near the root ~6 %. Bake this into the UV mapping rather than scaling the whole disc.
- Off-axis, the entrance pupil is an ellipse whose minor/major ratio follows a "decentred, flattened cosine" of viewing angle (Aguirre: peak ratio 0.98 at −5.3°, i.e. the pupil already looks slightly elliptical head-on because the visual axis is 5.8° nasal / 2.5° superior of the optical axis).
- Under water (or through a saline goggle) the magnification and the limbal ring both largely disappear — see §3.

**Corneal light on the iris ("caustics").** The cornea is a 43 D lens 3.6 mm in front of a diffuse screen. A collimated beam is converged only slightly by the time it reaches the iris (footprint scale 1 − 3.6/23 ≈ 0.85; irradiance gain ≈ 1.3×), so there is no sharp focal caustic on the iris under ordinary lighting. What macro photographs actually show is:

1. **A shifted, brightened footprint.** Light from an off-axis source is refracted toward the axis, so the iris is brightest on the side *opposite* the specular highlight and darkest on the side nearest it; the near-side iris lies in the shadow of the opaque limbus/sclera through which no light can enter. Brightness ratio far/near side is typically 1.3–2 for a single key light.
2. **A soft bright arc** under the highlight-opposite pupil margin when the source is small and close (a ring flash or a window): the cornea images a 300 mm source at ~34 mm, so on the iris the beam is still 89 % of its entry width — a broad soft crescent, not a line.
3. **Fresnel losses** at the tear-film surface: ~2 % at normal incidence rising steeply past 60°, which darkens the periphery under grazing light and is the main reason the limbus looks dark from most angles.
4. **A secondary shadow** of the pupillary ruff onto the lens/pupil (invisible, the pupil is black) and of the collarette ridge onto the pupillary zone (visible, tens of µm wide, only under hard raking light).

A renderer should refract the camera ray *and* the light ray at the tear-film surface and let the 1.336 aqueous do the rest; that alone reproduces items 1–3.

---

## 3. Zones and landmarks, from the front

Radii below are given as a fraction of the visible iris radius (0 = pupil centre, 1 = limbus) for a 4 mm pupil in a 12 mm iris; they slide with pupil size (§5).

| Landmark | Radial position | Size / count | Visual character |
|---|---|---|---|
| **Pupillary ruff (pigment frill)** | r = 0.33 (pupil edge), inward-facing lip | 0.05–0.10 wide; scalloped by ~70 radial contraction folds (Schwalbe) | Very dark brown/black bead of posterior pigment epithelium curling onto the front surface. Its scallops make the pupil edge look serrated at macro scale, never a clean circle |
| **Pupillary zone** | r = 0.33–0.58 | ~1.5 wide | Smoother, denser, often darker (brown eyes) or lighter (blue eyes: the sphincter shows through as a lighter ring); fine radial striations (Schwalbe folds) running margin→collarette |
| **Collarette (iris frill)** | r ≈ 0.55–0.60 (1.5 mm from pupil margin) | Raised 0.05–0.15 above adjacent stroma; zigzag with 20–40 irregular scallops around the circle | The vestigial attachment line of the fetal pupillary membrane; the thickest point of the iris. Often the most visible single feature; frequently a different hue (orange-brown in green/hazel eyes) |
| **Ciliary zone** | r = 0.58–1.0 | ~2.5–3 wide | Radially fibrous (trabeculae), lower density, carries crypts, furrows, spots, nodules |
| **Crypts of Fuchs** | Two rings: "central" crypts flanking the collarette (r ≈ 0.5–0.65), "peripheral" crypts near the root (r ≈ 0.85–0.95) | Diamond/oval, 0.2–1.5 across, 3–12 per eye when present; "large" crypts span >50 % of the ciliary zone | Holes in the anterior border layer showing the darker deep stroma; edges are sharp, floor is dark and matte. Europeans: 9 % have none, 31 % have at least one large crypt, 22 % have ≥3 large crypts in ≥3 quadrants. East Asians: 20 % none, 10 % many. Most frequent in the upper-temporal quadrant |
| **Contraction furrows** | r ≈ 0.70–0.95 (outer ciliary zone) | 2–5 concentric arcs, each usually <180°; total length 43 mm (light) → 58 mm (dark) per eye | Shallow circumferential creases that read as thin dark lines with a lighter rim; present in essentially all eyes, but >180° in 82 % of Europeans vs 47 % of East Asians; more prominent in the lower quadrants (70–95 %) |
| **Radial furrows / trabeculae** | Whole ciliary zone | Spacing 0.1–0.3 | The stromal collagen bundles running root→collarette, with darker interstices; blur into "fibrous" texture at <0.1 mm |
| **Wölfflin nodules** | r ≈ 0.8–1.0 (outer fifth) | 0.1–0.3, regularly spaced, 10–30 around the circumference | Whitish-yellow stromal knots with soft edges. ~37 % of Europeans (25 % >180°), 0 % East Asians, 1 % South Asians; almost only light irides. Not pathological |
| **Brushfield spots** | r ≈ 0.6–0.75 (junction of middle and outer thirds) | 0.1–1.0, mottled, coalescing | Denser, brighter, more irregular than Wölfflin; ~90 % of Down syndrome, rare otherwise |
| **Pigment spots / freckles / naevi** | Anywhere, favour lower-temporal | Freckle 0.2–1 flat; naevus 1–3, slightly raised, may distort adjacent crypts | Dark brown patches of melanocytes on the anterior border layer. Europeans 58 % have ≥1 (19 % have >2); East Asians 22 %, South Asians 17 % |
| **Limbus / limbal ring** | r = 1.0, width ~0.5–1.0 (limbal transition zone 1–1.5) | — | Dark annulus where iris meets sclera. About 55 % of its contrast is *optical* (it largely vanishes under water): grazing-angle refraction and Fresnel loss through the steep, thick, more scattering peripheral cornea, plus the scleral overhang hiding the iris root. The rest is peripheral iris pigment. Fades with age; erased by arcus, oedema, neovascularisation |
| **Iris vessels** | Radial, in the stroma | — | **Normally invisible.** The anterior border layer covers them; they become visible only in albinism, iris atrophy, rubeosis or as the greater arterial circle in very thin blue irides |

Two things a renderer gets wrong by default: the collarette is *not* a smooth ring (it is the single most irregular contour in the iris), and the crypts are *not* dark paint — they are holes with depth, whose floors go into shadow under raking light and whose rims catch it.

---

## 4. Layers, front to back

| Layer | Thickness | Composition | What it contributes to the image |
|---|---|---|---|
| **Anterior border layer (ABL)** | 20–70 µm; effectively absent inside crypts; thicker and denser in brown eyes | Condensed stroma: fibroblasts, melanocytes, discontinuous collagen | The visible colour. Heavy melanin → brown; sparse melanin → stroma scattering dominates → blue/grey (Tyndall-type short-wavelength scatter against the dark epithelium); intermediate → green/hazel. Carries freckles and naevi. Velvety, slightly specular under hard light |
| **Stroma** | 300–500 µm (bulk of the 0.5–0.7 mm iris) | Loose collagen trabeculae (radial), fibroblasts, melanocytes, vessels, nerves, aqueous-filled spaces | Radial fibrous texture, translucency, depth. Volume scattering here is what makes light irides look "lit from within". Iris volume drops ~1.2 mm³ on dilation as aqueous is squeezed out through the crypts |
| **Sphincter pupillae** | ~100 µm thick, 0.75–1.0 mm wide ring | Smooth muscle, circular, in the posterior stroma of the pupillary zone | Not directly visible, but the pupillary zone is denser and often a different tone because of it; in blue eyes a lighter inner ring |
| **Dilator pupillae** | 4–12 µm | Radial myoepithelium, the anterior of the two epithelial layers | Invisible; drives §5 |
| **Posterior pigment epithelium** | 36–55 µm | Two cell layers (dilator/anterior epithelium + posterior epithelium), densely melanotic | Opaque black backdrop that makes every iris, whatever its colour, a reflective surface rather than a window; curls over the margin to form the pupillary ruff. Its absence (albinism) turns the iris pink-red and transilluminant |

Total iris thickness: ~0.5 mm at root, 0.6–0.7 at collarette, tapering to ~0.15–0.3 at the margin.

---

## 5. What changes with pupil size

The pupil is a hole in an elastic annulus of fixed outer radius, so as it opens from 2 to 8 mm the annulus width falls from 5 to 2 mm and the tissue does not scale uniformly:

- **Ciliary zone compresses circumferentially and buckles.** The dilator pulls tissue toward the root; the outer ciliary zone folds into the contraction furrows (furrow length +37 % from light to dark) and the furrows deepen and become continuous. Crypts *widen* (they are the vents through which stromal aqueous leaves; iris volume −1.2 mm³).
- **Pupillary zone thickens and shortens.** The sphincter relaxes and bunches; the Schwalbe radial folds deepen; the ruff scallops separate and become individually visible; the pupil outline becomes slightly polygonal and less centred (it drifts nasal/superior as it constricts, temporal/inferior as it dilates, by ~0.1–0.3 mm).
- **Collarette moves outward** roughly in proportion to pupil radius (it is anchored in the tissue, ~1.5 mm from the margin in mid-dilation) so its fractional radius is not constant; in a fully dilated eye it can lie at r ≈ 0.7.
- **Constriction reverses all of this**: the pupillary zone stretches radially and looks smoother and lighter, the furrows flatten into faint lines, crypts narrow to slits, the ruff becomes a fine even bead.
- **Thickness** increases everywhere on dilation (same tissue, less width), which slightly raises the whole iris toward the cornea and steepens the truncated cone.

For a renderer: parameterise the texture in *tissue* coordinates (distance from root, 0 → 4 mm) and remap with a non-linear function of pupil radius, rather than in screen-space polar coordinates; drive furrow depth, crypt width and ruff scallop amplitude from the same dilation scalar.

---

## 6. Visible variations and pathologies for a casebook

| Condition | One-line look |
|---|---|
| Arcus senilis | Grey-white opaque ring in the peripheral cornea, 1–1.5 mm wide, with a clear 0.3–1 mm lucid interval inside the limbus; erases the limbal ring; near-universal past 80 |
| Kayser–Fleischer ring | Golden-brown to green copper ring in Descemet's membrane at the limbus, 1–3 mm wide, densest superiorly; Wilson disease |
| Coloboma (iris) | Keyhole/teardrop pupil, defect pointing infero-nasally, edges with an intact ruff |
| Lisch nodules | 0.5–2 mm dome-shaped tan-brown hamartomas scattered over the surface; >90 % of adults with NF1 |
| Aniridia | Only a thin stump of iris root visible; the whole "pupil" is the limbus |
| Heterochromia iridum (complete) | The two eyes differ in colour (congenital, Horner's, Fuchs' heterochromic iridocyclitis) |
| Heterochromia iridis (sectoral / central) | A pie-wedge of a different colour; or a coloured ring around the pupil (central heterochromia, very common, an ABL density gradient) |
| Iris atrophy (essential / ICE, post-herpetic, PDS) | Moth-eaten stroma with visible sphincter and epithelium, transillumination defects, corectopia |
| Iris naevus / melanoma | Naevus: flat to slightly raised brown patch 1–3 mm; melanoma: larger, vascular, distorts the pupil, ectropion uveae |
| Ectropion uveae | Pupil margin everted so a broad black rim of posterior epithelium shows on the front surface |
| Pseudoexfoliation | Dandruff-like grey flakes on the pupil margin and lens; pigment loss at the ruff giving a moth-eaten edge |
| Rubeosis iridis | Fine red vessels visible on the surface, most at the pupil margin and angle |
| Albinism / ocular albinism | Pink, translucent iris; red reflex through it; vessels visible |
| Pigment dispersion | Krukenberg spindle (vertical brown streak on the corneal endothelium), mid-peripheral radial transillumination slits |
| Persistent pupillary membrane | Fine strands from the collarette bridging the pupil |
| Iridodialysis / traumatic mydriasis | D-shaped pupil with a black crescent at the root; or a fixed large irregular pupil with sphincter tears |
| Corectopia / polycoria | Displaced pupil; more than one true pupil |
| Cataract behind the pupil | Nuclear: pupil goes brown-amber; cortical: white spokes; mature: white pupil |
| Hyphaema / hypopyon | Blood or pus level in the anterior chamber, horizontal meniscus over the lower iris |

---

## 7. Implications for the engine

Concrete defaults, with ranges to expose as sliders. Millimetres; origin at the corneal apex, +z into the eye.

**Geometry**
- Globe: sphere R = 12.0, centre z = 12.0 − 0.5 (so the corneal cap protrudes ~2.5 mm ahead of where the scleral sphere would be at the limbus). Sclera visible from the front out to at least r = 8 mm.
- Cornea front: ellipsoid, apical R = 7.8 (7.5–8.2), Q = −0.26; back: R = 6.5 (6.3–6.8), apex at z = 0.54 (0.50–0.60), edge thickness 0.68. Limbus at r = 5.85 horizontal (5.5–6.3), 5.4 vertical.
- Iris root ring: r = 6.0, z = 4.2 (4.0–4.5). Pupil margin ring: r = pupil/2, z = 3.5 (3.3–3.9), i.e. 0.7 mm anterior of the root. Surface between: truncated cone plus a convex bulge of 0.2 (0.0–0.3, negative for the myopic concave case) peaking at 60 % of the annulus.
- Iris thickness field: 0.5 at root → 0.65 at collarette → 0.2 at margin. Use it for parallax at crypts and for the ruff bead.
- Pupil: diameter 4.0 (2.0–8.0); centre offset (+0.25 nasal, +0.15 superior) in the limbus frame (0–0.4 each); slight ellipticity ratio 0.98 head-on. Ruff bead 0.08 wide, 70 scallops (55–85), scallop amplitude 0.02–0.05 mm rising with dilation.
- Collarette: mean radius = pupil radius + 1.5 (1.2–1.8), 20–40 zigzag lobes, amplitude 0.2–0.4 radial, height 0.1 (0.05–0.15).
- Lens: anterior sphere R = 10, pole at z = 3.6; only needed for cataract cases and Purkinje III.

**Optics**
- n: air 1.000, tear/aqueous 1.336, cornea 1.376, lens 1.42. A single surface at the tear film with n = 1.336 behind it is sufficient for the iris; add the 1.376 corneal shell only if rendering arcus/oedema volumetrically.
- Refract both the view ray and every light ray. Expected outcomes to unit-test: pupil magnification 1.13 at 3.6 mm depth, entrance pupil at z = 3.05, iris root magnification ~1.06, far-side/near-side iris brightness ratio 1.3–2 under a single key light, limbal ring contrast dropping by about half when n_outside is set to 1.336.
- Fresnel at the tear film with n = 1.336 (R₀ ≈ 2 %); highlights come from this surface, not from the iris.

**Texture / features (tissue coordinates, 0 = root, 4 = margin at 4 mm pupil)**
- Crypts: count 0–12, size 0.2–1.5, two radial bands (0.9–1.4 from root; 2.0–2.8 from root, flanking the collarette), depth = full ABL + 100–300 µm of stroma, prevalence-weighted by ancestry (none: 9 % EU / 20 % EA; many: 22 % EU / 10 % EA).
- Contraction furrows: 2–5 arcs in the outer 0.3–1.2 from root, each 60–300° long, width 0.05–0.1, depth 20–60 µm, depth × (1 + 1.5·dilation); lower quadrants first.
- Radial trabeculae: 150–250 around the circumference, spacing 0.1–0.3, contrast highest in light irides.
- Wölfflin nodules: 0 for dark irides; for light irides 37 % chance, 10–30 nodules 0.1–0.3 at 0.0–0.8 from root, cream-yellow.
- Pigment spots: 0–6, 0.2–2.0, lower-temporal bias, prevalence 58 % EU / 22 % EA.
- Limbal ring: 0.5–1.0 wide, opacity 0.3–0.8 scaled down with age, of which half should emerge from the refraction/Fresnel path and half from a peripheral pigment gradient.
- Vessels: off by default; a hidden radial vessel layer under the ABL that only shows in atrophy/albinism cases.
- Layer stack for shading: ABL (20–70 µm, melanin-driven albedo), stroma (300–500 µm, forward-scattering, short-wavelength Rayleigh-ish component for blue eyes), opaque black epithelium (40–55 µm) as the terminator.

**Dilation**
- One scalar d ∈ [0,1] (pupil 2 → 8 mm). Annulus width 5 → 2; furrow depth and crypt width increase with d; ruff scallop separation increases with d; pupillary-zone radial folds deepen with d; overall thickness rises ~20 % with d; pupil centre drifts ~0.2 mm temporal-inferior with d.

---

## Key numbers (summary)

1. Cornea: front R 7.8 (Q −0.26), back R 6.5–6.8, thickness 0.54 centre / 0.68 edge, diameter 11.7 × 10.6.
2. Anterior chamber: iris face at z ≈ 3.5–3.9 from the apex, lens pole at 3.6, iris root at ~4.2.
3. Iris: true diameter ~12, annulus 4 wide at a 4 mm pupil; thickness 0.5 root / 0.65 collarette / 0.2 margin.
4. Profile: convex in 85 % of emmetropes; pupil margin 0.5–1.0 mm anterior of the root, extra mid-bow 0.1–0.3.
5. Pupil: 2–8 mm, dark-adapted 7.3 at age 25 → 4.9 at 80; centre 0.1–0.3 nasal and 0.1–0.2 superior of the limbus centre.
6. Indices: air 1.000, tear/aqueous 1.336, cornea 1.376, lens 1.42; cornea ≈ 43 D.
7. Corneal magnification: 1.13× at the pupil, ~1.06× at the root; entrance pupil appears at 3.05 mm, ~0.5 mm shallower than reality.
8. Collarette 1.5 mm from the pupil margin, zigzag, 0.1 mm high; ruff 0.05–0.1 mm wide with ~70 scallops.
9. Crypts 0.2–1.5 mm in two rings (collarette, root), absent in 9 % of Europeans / 20 % of East Asians; furrows in the outer ciliary zone, 43 → 58 mm total length light → dark; Wölfflin nodules 0.1–0.3 mm in 37 % of light-eyed Europeans, 0 % East Asians.
10. Limbal ring 0.5–1 mm wide, ~55 % optical (Fresnel + grazing refraction + scleral overhang), the rest pigment; iris vessels normally invisible.

---

## Sources

- [Iridociliary measurements using the Anterion swept-source OCT (IJO)](https://www.ovid.com/jnls/ijo/fulltext/10.4103/ijo.ijo_1779_22~iridociliary-measurements-using-the-anterion-swept-source) — iris thickness by region
- [Anatomy of Uvea (eophtha)](https://www.eophtha.com/posts/anatomy-of-uvea) — collarette at 1.5 mm, thickness at root/collarette, ~70 Schwalbe folds
- [Iris — ScienceDirect topic overview](https://www.sciencedirect.com/topics/medicine-and-dentistry/iris) — ruff, layers, crypt function
- [Wilson et al., Pupil position relative to the limbus (contact-lens study)](https://pubmed.ncbi.nlm.nih.gov/9375579/) and [Posture-related pupil centre shift, 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10133467/) — nasal/superior decentration
- [Aguirre, A model of the entrance pupil of the human eye, Sci Rep 2019](https://www.nature.com/articles/s41598-019-45827-3) / [bioRxiv full text](https://www.biorxiv.org/content/10.1101/325548v1.full) — corneal thickness 0.55, iris at 3.9, iris radius 5.57, visible iris 11.8, margin thickness 0.15, ellipse fit constants
- [Apparent vs 3D pupillary diameter in cataract patients, Sci Rep 2026](https://www.nature.com/articles/s41598-026-35975-8) — 3.68 vs 2.50 mm, magnification grows with pupil size
- [Gullstrand schematic eye (Vojnikovic & Tamajo)](https://hrcak.srce.hr/file/151301) and [anterior–posterior corneal radius ratio, Sci Rep 2023](https://www.nature.com/articles/s41598-023-41062-z) — 7.7 / 6.8 mm, indices 1.376 / 1.336
- [White-to-white and anterior chamber parameters, Saudi adults (Pentacam)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11970417/) and [WTW normal values, Orbscan II](https://pubmed.ncbi.nlm.nih.gov/15778595/) — 11.7 ± 0.4 mm, ACD 3.0–3.25
- [Schuster et al., Curvature of iris profile in SD-OCT, Acta Ophthalmol 2017](https://pubmed.ncbi.nlm.nih.gov/27488961/) — convex 85 % emmetropes, 96 % hyperopes, 67 % myopes; concave 26 % myopes
- [Dynamic analysis of iris configuration with AS-OCT (IOVS)](https://iovs.arvojournals.org/article.aspx?articleid=2126639) — iris bowing definition
- [Edwards et al., Analysis of iris surface features in populations of diverse ancestry, R Soc Open Sci 2016](https://pmc.ncbi.nlm.nih.gov/articles/PMC4736923/) — crypt / furrow / spot / nodule grade distributions and quadrant positions
- [Larsson & Pedersen, Genetic correlations among texture characteristics in the human iris](https://pubmed.ncbi.nlm.nih.gov/15534585/) — feature definitions
- [Automated detection of iris furrows and their influence on dynamic iris volume change](https://pmc.ncbi.nlm.nih.gov/articles/PMC5738384/) — furrow length 43 → 58 mm, volume −1.19 mm³ on dilation
- [Brushfield spots and Wölfflin nodules unveiled in dark irides using near-infrared light, Sci Rep 2018](https://www.nature.com/articles/s41598-018-36348-6) and [Healio case report](https://www.healio.com/news/optometry/20240207/an-anomalous-iris-finding-a-case-of-wlfflin-nodules) — sizes, positions, Down-syndrome prevalence
- [Shyu & Wyatt, Appearance of the human eye: optical contributions to the limbal ring, Optom Vis Sci 2009](https://pubmed.ncbi.nlm.nih.gov/19648842/) — ~55 % reduction under water
- [Peshek et al., Limbal ring and facial attractiveness, Evol Psychol 2011](https://journals.sagepub.com/doi/10.1177/147470491100900201) — ring fades with age
- [Dark-adapted pupil diameter as a function of age (NeurOptics)](https://pubmed.ncbi.nlm.nih.gov/20506961/) — 7.33 mm at 20–29 to 4.85 mm at 80+
- [Iris sphincter muscle — StatPearls](https://www.ncbi.nlm.nih.gov/books/NBK532252/) and [Iris pigment epithelium — Wikipedia](https://en.wikipedia.org/wiki/Iris_pigment_epithelium) — sphincter ~1 mm × 0.1 mm, dilator and epithelium thickness
- [Quantification of iris atrophy by SS-OCT in Posner–Schlossman syndrome](https://pmc.ncbi.nlm.nih.gov/articles/PMC9655842/) — ABL / stroma / epithelium as OCT bands
- [Lam & Baranoski, A predictive light transport model for the human iris, CGF 2006](https://onlinelibrary.wiley.com/doi/10.1111/j.1467-8659.2006.00955.x) and [Anatomically accurate modeling and rendering of the human eye (caustic function)](https://www.researchgate.net/publication/29647155_Anatomically_accurate_modeling_and_rendering_of_the_human_eye) — layer model, corneal refraction/caustic treatment
- [Relationship between crystalline lens thickness and shape (lens position, indices)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6644274/) — lens 3.1 mm behind the endothelium, thickness 4.0, index 1.42
