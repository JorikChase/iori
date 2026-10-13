# Procedural geology and terrain materials: rock, strata, cliffs, boulders, scree, soil, sand, snow

Scope: how terrain is split into material regions with a physical justification, and how each material's signature detail is built procedurally (geometry plus shading), for a browser renderer (WebGL2/WebGPU). Primary sources were read in full where marked "(read)"; others are abstract-level.

---

## 1. Layered terrain and rock: material stacks, stratigraphy, differential erosion

### Takeaway
The standard representation is a 2-D grid of per-cell *material stacks* (Beneš & Forsbach 2001; Arches 2009): each cell holds an ordered list of (material, thickness) layers, which costs about k·n² memory instead of n³ voxels and supports overhangs or caves. Differential erosion falls out when the erosion rate constant and the talus (repose) angle are set per layer: hard layers get a low erosion constant and a steep talus angle, soft layers a high constant and a shallow angle. Cliffs, benches and banded walls emerge, and the layer index at the eroded surface drives the strata texture.

### Cited Findings

**Beneš & Forsbach 2001, "Layered Data Representation for Visual Simulation of Terrain Erosion", SCCG 2001, pp. 80–86 (read)**
- Terrain is a 2-D array of elements, each a stack of horizontal layers of one material. The paper positions this between "inexpensive but inaccurate height fields" and memory-hungry voxels. The C struct is `struct { PropertiesT data[MAX_LEVEL]; float height; }` with MAX_LEVEL = 10 in their implementation. Per-layer properties include density, water, gas, deposit ability and saturation. Layers with zero density, or with gas or water, represent caves and holes — [Beneš & Forsbach 2001 PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Benes01SCCG.pdf)
- Cost is k·n² for k layers instead of n³ voxels — [same](https://www.cs.purdue.edu/homes/bbenes/papers/Benes01SCCG.pdf)
- Thermal weathering (after Musgrave et al. 1989) works on 8 neighbours. Let H = max(h − h_i). The volume moved is ΔS = a·H/2 (halved to avoid oscillation) and is shared among lower neighbours in proportion to their height difference. Material moves only where (h − h_j)/d > tan α (talus angle). Their figure uses α = 45° — [same](https://www.cs.purdue.edu/homes/bbenes/papers/Benes01SCCG.pdf)
- New behaviour: eroded hard material turns into easily movable "dust" (density changed), and erosion also runs on cave ceilings — [same](https://www.cs.purdue.edu/homes/bbenes/papers/Benes01SCCG.pdf)
- Costs on 2001 hardware: 400×400 grid × 5 layers, 1000 steps ≈ 20 min; 750×750 × 5 layers, 500 steps > 1 h. Rendering used POV-Ray heightfields — [same](https://www.cs.purdue.edu/homes/bbenes/papers/Benes01SCCG.pdf)

**Peytavie, Galin, Grosjean, Merillou 2009, "Arches: a Framework for Modeling Complex Terrains", Computer Graphics Forum 28(2):457–467, DOI [10.1111/j.1467-8659.2009.01385.x](https://doi.org/10.1111/j.1467-8659.2009.01385.x) (read)**
- A terrain is a 2-D grid of material stacks. The materials handled are **air, water, sand, bedrock, rocks**. Overhangs are an air layer between two bedrock layers — [Arches PDF](https://perso.liris.cnrs.fr/egalin/Articles/2009-arches.pdf)
- Memory: cave scene at an effective 1 000 × 750 × 8 000 (6 billion voxels) in < 21 MB; canyon 1 000 × 500 × 5 000 in 14 MB; cliff 2 000 × 500 × 4 000 in 26 MB. The cliff costs more because it has more layers — [same](https://perso.liris.cnrs.fr/egalin/Articles/2009-arches.pdf)
- The surface is an implicit convolution surface of the stack. The kernel is a cube of radius σ, and f(p) = 2·V_M/V_Ω − 1, where V_M is the volume of material inside the cube. So f = 1 inside, −1 outside, and 0 at half-fill. The integral reduces to summing box volumes, which makes it cheap — [same](https://perso.liris.cnrs.fr/egalin/Articles/2009-arches.pdf)
- Stabilisation: bedrock is always stable. Between two bedrock layers, same-kind layers are merged and sorted sand → rocks → air. Repose angles are **30–35° for sand and 40–45° for rocks**. The excess is Δh̃_i = max(0, Δh_i − s·tan α), and the moved height is Δz_i = a·Δh̃_i / ΣΔh̃_i (small constant a), iterated until stable — [same](https://perso.liris.cnrs.fr/egalin/Articles/2009-arches.pdf)
- Erosion tool: bedrock inside a region R is converted to sand plus rocks in volume ratio ρ ∈ [0,1], and stabilisation then transports the debris. This is a modelling operator, not a physical simulation — [same](https://perso.liris.cnrs.fr/egalin/Articles/2009-arches.pdf)
- Rendering: a single ground mesh for bedrock ∪ sand. Each vertex blends material textures by the ratio of *visible* surface of each material inside a cube around it. Meshes have 360k–820k triangles. Real-time HLSL shaders were written by Widescreen Games — [same](https://perso.liris.cnrs.fr/egalin/Articles/2009-arches.pdf)

**Cordonnier, Cani, Benes, Braun, Galin 2018, "Sculpting Mountains: Interactive Terrain Modeling Based on Subsurface Geology", IEEE TVCG 24(5):1756–1769 (read; HAL [hal-01517343](https://hal.archives-ouvertes.fr/hal-01517343))**
- What is modelled: the user moves tectonic plates. A 2-D viscous crust simulation (1024² grid, about 10 ms on GPU) gives a coarse uplift u₀ from crust thickening. Multi-scale folds of a layered crust refine this into an uplift map u. Fluvial erosion plus landsliding then produces the terrain. The original layer of every surface point is tracked "for rendering purposes" — [Cordonnier 2018 PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier18TVCG.pdf)
- Stratigraphy: n = 2–10 layers of thickness 0.1–5 km, viscosity about 10¹⁰ Pa·s, fold wavelength 0.5–20 km. Each layer is split into 1–10 sub-layers "of varying resistance against erosion", which represents the fractal nature of strata. Sub-layers differ only in erosion parameters — [same](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier18TVCG.pdf)
- Stream power law: ∂z/∂t = u(p) − k·A(p)^m·s(p)^n with n = 1, m = 0.5, and k in the range 2.5×10⁻⁷ to 8×10⁻⁷ (Table 2; the text quotes 5.5×10⁻⁷ y⁻¹). Mean uplift is 5.0×10⁻⁴ m/y. The solver is Braun & Willett's O(n) implicit scheme on a TIN — [same](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier18TVCG.pdf)
- Landslide (thermal) term: where slope s > tan θ, ∂z/∂t = λ·(s − tan θ) with λ = 10² m/y. **Weak layers use a high k and θ = 30°; hard layers use a low k and θ = 50°.** This per-layer pairing is what produces stepped cliffs with folded strata — [same](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier18TVCG.pdf)
- Surface rock type: from the pre-deformation elevation h₀(p) = (1 − γ)·h_k(p,t₀) + γ·h_{k−1}(p,t₀), they look up which (sub-)layer surfaces at p. The layer index both changes erosion and textures the cliff, which shows "the fold as texture on a cliff wall" — [same](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier18TVCG.pdf)
- Cost: 100×100 km with 10 000 vertices, about 10 ms per iteration, and 5 iterations for 5 My (interactive, > 30 Hz UI). The final pass uses 10⁶ vertices at 4 s per step × 100 steps. Final micro-detail was "noise weighted by a function of slope and elevation", rendered in Terragen 3 — [same](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier18TVCG.pdf)

**Paris, Galin, Peytavie, Guérin, Gain 2019, "Terrain Amplification with Implicit 3D Features", ACM TOG 38(5):147 (abstract-level)**
- Turns a 2-D heightfield into an implicit construction tree with 3-D landform primitives: caves, overhangs, cliffs, arches, karst, slot canyons, sea arches, **stratified cliffs, fields of hoodoos** and karst networks. Primitives are placed by Poisson sampling, grown by open shape grammars "guided by stratified erosion and invasion percolation", and polygonised only on query (memory-efficient) — [HAL hal-02273097](https://hal.archives-ouvertes.fr/hal-02273097); [project page](https://perso.liris.cnrs.fr/aparis/public_html/projects/paris2019_3D.html)

**Galin et al. 2019, "A Review of Digital Terrain Modeling", CGF 38(2):553–577, DOI [10.1111/cgf.13657](https://doi.org/10.1111/cgf.13657)**: the Eurographics STAR overview of the whole field, with a public DEM repository — [Purdue](https://cs.purdue.edu/cgvlab/www/publications/Galin19CGF); [DEM repo](https://perso.liris.cnrs.fr/eguerin/demrepo/)

### Inferences
- Cliffs, mesas, cuestas and hoodoos are the same mechanism at different dips and scales: a hard caprock with a high θ and low k over a soft layer with a low θ and high k. Horizontal strata give mesas and buttes. Dipping strata give cuestas, with the scarp on the soft-layer side and a dip slope on the hard bed. Small hard caps over soft columns give hoodoos. For a browser build, the cheap equivalent of Cordonnier's lookup is a 1-D "strata function" hardness(z_original), for example a noise-jittered sawtooth or a stack of bands, sampled at a warped elevation (z + fold(x,y)). Use it (a) to modulate the per-cell erosion constant and talus angle in any erosion pass, and (b) as a 1-D texture for cliff colour. This is a few ALU operations plus one 1-D fetch per fragment.
- The Arches per-material repose pair (sand 30–35°, rocks 40–45°) and Cordonnier's pair (weak 30°, hard 50°) are directly usable thresholds for a thermal-erosion pass and for slope-based classification.

### Gaps
- Arches per-scene timings for the stabilisation kernel were not reported in the text I extracted (only memory and rock-instancing timings).
- I did not read the full Terrain Amplification paper (PDF > 10 MB); hoodoo and stratified-cliff primitive parameters are therefore unverified.

---

## 2. Rock-type signatures and procedural construction (granite, sandstone, limestone, basalt, schist, boulders, scree, cliffs)

### Takeaway
Each rock type has one dominant structural signature set by its jointing: granite has curved sheeting joints and rounded joint-bounded blocks; sandstone has horizontal beds and cross-beds; limestone has orthogonal joints widened into grikes; basalt has polygonal (mostly hexagonal) columns; schist has planar foliation. Each maps onto a cheap procedural primitive: Worley/Voronoi cells for columns, clints and boulders, 1-D band functions for strata, and directional anisotropic noise for foliation. Boulder and scree fields are best done as instanced Voronoi-derived rock meshes tiled aperiodically and sitting at a 30–45° repose slope.

### Cited Findings

**Rock piles and boulders**
- Arches rock piles (read): Poisson-sphere-distribute centres with radius r in a cubic tile. Build periodic Voronoi cells. Pick random contact points c_ij on shared faces, define resistance ρ(p) = exp(−‖p − c_ij‖²/r²), then erode each cell uniformly weighted by 1 − resistance (spheroidal erosion, after Beardall et al. 2007). The rocks become rounded but keep their contact points, so they "nicely pack together" with no physics. Rocks deeper than 2× the max embedding-sphere radius below the surface are culled — [Arches PDF](https://perso.liris.cnrs.fr/egalin/Articles/2009-arches.pdf)
- Rock-pile costs: cave 1 941 rocks with 50 per tile (tile generation 30.2 s, instancing 0.6 s); canyon 6 113 rocks with 70 per tile (44.1 s / 0.9 s); cliff 2 931 rocks with 50 per tile (19.0 s / 0.4 s). Tiles are pre-computed once — [same](https://perso.liris.cnrs.fr/egalin/Articles/2009-arches.pdf)
- Peytavie, Galin, Grosjean, Merillou 2009, "Procedural Generation of Rock Piles using Aperiodic Tiling", CGF 28(7):1801–1809, DOI [10.1111/j.1467-8659.2009.01557.x](https://doi.org/10.1111/j.1467-8659.2009.01557.x). This is the follow-up: a modified corner-cube algorithm (like 3-D Wang tiles) gives aperiodic tiles, removing the repetition of the periodic tile. Rock shape in contact is controlled by Voronoi cells with a "parameterized anisotropic distance". It has been used for landscapes and stone walls with thousands of rocks — [EG diglib](https://diglib.eg.org/handle/10.2312/CGF.v28i7pp1801-1809); [PDF](https://perso.liris.cnrs.fr/egalin/Articles/2009-aperiodic.pdf)

**Scree / talus**
- Natural talus slopes approach about 35°. Francou & Manté argue the real slope is *less* than the repose angle, which is only reached once the rock wall is completely buried — [Francou & Manté (IRD)](https://horizon.documentation.ird.fr/exl-doc/pleins_textes/divers19-08/010048761.pdf)
- A comparative Earth/Mars talus study gives a natural repose angle on Earth of 28.0–33.4° (King George Island sites) — [Miscellanea Geographica 2025](https://reference-global.com/article/10.2478/mgrsd-2025-0032)
- Engineering repose table (approximate, method-dependent): dry sand 34°, wet sand 45°, crushed rock/gravel 45°, natural gravel with sand 25–30°, granite 35–40°, snow 38°, soil 30–45° — [Wikipedia: Angle of repose](https://en.wikipedia.org/wiki/Angle_of_repose)
- Ward (1945) found that the nature of the material is critical in setting the repose angle (cited via a Pearson A-level scree exemplar, a secondary source) — [Pearson NEA exemplar](https://qualifications.pearson.com/content/dam/pdf/A%20Level/Geography/2016/teaching-and-learning-materials/NEA-Exemplar-4-Investigation-into-scree-characteristics-candidate-write-up.pdf)

**Basalt columnar jointing**
- Column diameters range from a few cm to about 3 m, heights up to 30 m. Columns have 3–8 sides, most commonly 6. "Colonnade" means regular, straight, larger columns; "entablature" means irregular, thinner, less straight ones (Long & Wood 1986) — [Wikipedia: Columnar jointing](https://en.wikipedia.org/wiki/Columnar_jointing), citing [Oregon State volcano site](http://volcano.oregonstate.edu/columnar-jointing)
- Scaling: Pe = L·v/D ≈ 0.3 ± 0.2 for lava (0.15 ± 0.05 for drying starch), with basalt thermal diffusivity D_T ≈ 6.5×10⁻⁷ m²/s. Column width L is therefore inversely proportional to the cooling-front speed v — [Goehring, Mahadevan, Morris 2009 PNAS (PMC2615021)](https://pmc.ncbi.nlm.nih.gov/articles/PMC2615021/)
- In the Columbia River Basalt, column radius and stria height are proportional to each other and inversely proportional to the cooling rate — [Goehring & Morris 2008 JGR abstract](https://www.physics.utoronto.ca/nonlinear/abstracts/GM_JGR08abstract.html)
- Devils Tower is about 382 m high with mostly hexagonal columns, but 4-, 5- and 7-sided ones also occur. The Giant's Causeway has more than 40 000 columns — [Wikipedia: Columnar jointing](https://en.wikipedia.org/wiki/Columnar_jointing) (citing NPS)

**Limestone pavement (clints and grikes)**
- Burren: grikes up to about 80 cm wide and 2 m deep; most clints cover about 1–5 m² — [Burren Geopark sheet 11](https://www.burrengeopark.ie/wp-content/uploads/2013/04/Geology-Sheet-11-Limestone-Pavement.pdf)
- Farleton Knott (Cumbria): mean clint 2.75 × 1.05 m, mean grike depth about 1.2 m; the least-dissected clints average 3.15 × 2.32 m — [Scottish Geology Trust geoguide 815](https://geoguide.scottishgeologytrust.org/page/815)
- Asby Scar: most grikes are 100–200 mm wide and deep, with a subset 1–2 m wide and shallow — [geoguide 834](https://geoguide.scottishgeologytrust.org/page/834.pdf). Fell End Clouds: clints < 1 m × about 0.3 m with V-shaped grikes — [geoguide 869](https://geoguide.scottishgeologytrust.org/page/869.pdf)
- Mechanism: glacial scour exposes horizontally bedded limestone, and solution along joints then separates the surface into clints and grikes. Soil-covered pavements are more rounded — [Wikipedia: Limestone pavement](https://en.wikipedia.org/wiki/Limestone_pavement)

**Granite sheeting / exfoliation**
- Exfoliation (sheeting) joints run roughly parallel to the topographic surface. Spacing grows from a few cm near the surface to a few m at depth, with the deepest occurrences around 100 m. Deeper joints have larger radii of curvature, which rounds landforms (domes) — [Thai BEST journal review](https://ph01.tci-thaijo.org/index.php/bestjournal/article/download/246503/167567/871906); [GW-Project fractured-aquifer text](https://books.gw-project.org/structural-geology-applied-to-fractured-aquifer-characterization/?p=1690)
- Older textbook statement: sheeting spacing increases with depth and dies out "a few tens of feet" down — [J. Glaciology, exfoliation joints and ice action](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/FFBADADB84C1279E64A52C62CCAB6868/S002214300002462Xa.pdf/exfoliation-joints-and-ice-action.pdf)
- Contrary detail: a 750 m Okayama granite core shows zoned, mm-scale lamination sheeting rather than a monotonic increase (conference abstract) — [JpGU 2007](https://www2.jpgu.org/meeting/2007/program/pdf/Y162/Y162-P007_e.pdf)

### Inferences
- **Basalt:** 2-D Worley/Voronoi in the horizontal plane with cell spacing 0.3–1 m (colonnade) or roughly half that, jittered more (entablature), extruded vertically. On cliff faces, shade with an F2 − F1 edge darkening in xz projected along the column axis plus horizontal "stria" bands at a spacing proportional to the column width. Voronoi with jitter around 0.5–0.7 naturally gives mostly 5–7 sided cells, consistent with "3–8 sides, mostly 6" (this jitter range is my estimate, not from a source). One 3×3 Worley evaluation is about 9 hash+distance operations per sample.
- **Limestone:** 2-D Voronoi or offset-brick cells of about 1–3 m. Grikes are the F2 − F1 < w band (w ≈ 0.1–0.8 m) displaced down by 1–2 m, with clint tops flat plus mild rounding. Same cost as basalt, but applied only where slope < ~10° on a limestone layer.
- **Granite:** large-scale rounded domes come from heightfield smoothing (diffusion) of the granite region plus curved sheet bands that follow the surface (bands in signed depth below the surface, spacing growing with depth). Tors and boulders are instanced Arches-style eroded Voronoi rocks.
- **Sandstone / shale:** the strata function from section 1 (horizontal bands with alternating hardness) plus small-amplitude cross-bed lamination: a second band function in a tilted, warped frame, masked per bed.
- **Schist / slate:** anisotropic noise stretched along a foliation direction (constant per region) for both displacement and albedo.
- **Scree:** the cells below cliffs whose slope sits in the repose band (about 30–38°) and with high upslope contributing *rock* area get instanced rocks. Size should grade downslope (larger blocks run further), but that sorting rule is a standard geomorphology observation I did not source here.

### Gaps
- No primary source found for procedural columnar-jointing algorithms in graphics (Voronoi columns are common practice, but I found no paper to cite).
- No dedicated "procedural cliffs" paper verified beyond Terrain Amplification (stratified cliffs) and Cordonnier 2018 (strata texture on cliffs).
- Giant's Causeway and Devils Postpile column diameters were not found in a fetched primary source.
- Tor and corestone formation versus joint spacing: no source retrieved.
- Downslope size sorting on talus: not sourced.

---

## 3. Soil and regolith: production, hillslope diffusion, depth, wetness

### Takeaway
Soil thickness h follows dh/dt = P₀·e^(−k·h) − ∇·q_s, where q_s is diffusive (q = −D∇z, linear) or nonlinear near a critical slope. At steady state, soil is thick on convex-gentle and concave hollows and thin or absent on steep slopes and ridge crests. Wetness from the topographic wetness index ln(a/tan β) places wet soils, meadows and vegetation in hollows and valley floors. All of this can be computed once on the CPU or GPU and baked into a soil-depth and wetness texture.

### Cited Findings
- Heimsath, Dietrich, Nishiizumi, Finkel 1997, "The soil production function and landscape equilibrium", Nature 388:358–361, DOI [10.1038/41056](https://doi.org/10.1038/41056). In northern California, hillslope curvature (a proxy for soil production) varies inversely with soil depth, and cosmogenic ¹⁰Be/²⁶Al in bedrock under soils of different depths show soil production declining exponentially with depth. This is the "first empirical soil production function" — [RePEc abstract](https://ideas.repec.org/a/nat/nature/v388y1997i6640d10.1038_41056.html)
- Form: P = P₀·e^(−k·h). P₀ ranges 0.08–2.0 mm/yr in northern California and 0.05–0.14 mm/yr in SE Australia; k is about 2–4 m⁻¹ (an e-folding depth of about 0.25–0.5 m). This range is a Wikipedia summary, not from the 1997 paper directly — [Wikipedia: Soil production function](https://en.wikipedia.org/wiki/Soil_production_function)
- Production is not universal: in rapidly eroding steep terrain (San Gabriel Mountains), production and erosion rates exceed the P₀ of slowly eroding parts. A "humped" soil production function (lower production at zero soil) is also proposed — [Heimsath et al. 2005 PDF](https://geodynamicsprogram.whoi.edu/wp-content/uploads/sites/14/2018/10/Heimsath_et_al_05_79065.pdf); [SERC: humped SPF](https://serc.carleton.edu/42696)
- Nonlinear hillslope flux (Roering, Kirchner, Dietrich 1999, WRR, DOI 10.1029/1998WR900090): q_s = K·S/(1 − (S/S_c)²), which diverges as slope S → critical S_c. Landlab implements Taylor-series and depth-dependent variants — [Landlab TaylorNonLinearDiffuser](https://landlab.readthedocs.io/en/latest/reference/components/taylor_nonlinear_hillslope_flux.html)
- Linear diffusivity examples: cinder cones in the Golan Heights fit 1–6 m²/ka (0.001–0.006 m²/yr) — [EGU2017-11969](https://meetingorganizer.copernicus.org/EGU2017/EGU2017-11969.pdf?pdf). An MIT course note quotes about 1.7×10⁻² m²/yr for humid temperate soil creep — [MIT OCW 12.163](https://ocw.mit.edu/courses/12-163-surface-processes-and-landscape-evolution-fall-2004/f5af48b6712c3dedbefbebbe699cd803_week7_8_1.pdf). Perron 2017 (Annu. Rev. Earth Planet. Sci., "Climate and the pace of erosional landscape evolution") is the standard compilation, cited by [Landlab teaching notebook](https://landlab.readthedocs.io/en/latest/teaching/geomorphology_exercises/hillslope_notebooks/north_carolina_piedmont_hillslope_class_notebook.html) but not retrieved.
- Climate dependence conflicts: the Golan study finds K higher on drier south-facing slopes and decreasing with precipitation (or humped, peaking at 400–600 mm), while a 2025 EGUsphere response attributes "D increases with MAP" to Perron 2017 — [EGU2017](https://meetingorganizer.copernicus.org/EGU2017/EGU2017-11969.pdf?pdf); contradicted by [egusphere-2025-1585 AC3](https://egusphere.copernicus.org/preprints/2025/egusphere-2025-1585/egusphere-2025-1585-AC3-supplement.pdf)
- TWI = ln(a/tan β), where a is the specific catchment area (upslope area per unit contour length, in length units; D8 cell counts must be multiplied by cell area and divided by cell width) and β is the local slope. It comes from Beven & Kirkby 1979, Hydrol. Sci. Bull. 24(1):43–69 (TOPMODEL), and indicates depth to the water table / propensity to saturate. It is undefined on flats (slope 0), and the downslope gradient is a better β than the pixel-centred slope — [TauDEM TWI](https://hydrology.usu.edu/taudem/taudem5/help53/TopographicWetnessIndex.html); [SAGA TWI](https://saga-gis.sourceforge.io/saga_tool_doc/9.4.1/ta_hydrology_20.html); [Ali et al. 2013 ESPL](https://water.usask.ca/hillslope/documents/pdfs/2013/13-16%20Ali%20et%20al%202013%20A%20comparison%20of%20wetness....pdf)

### Inferences
- Cheap steady-state soil depth on a heightfield. Linear diffusion at steady state gives erosion E = −D·∇²z, and balancing E = P₀·e^(−k·h) gives **h = (1/k)·ln(P₀ / max(ε, D·(−∇²z)))** on convex ground. On concave or flat ground (∇²z ≥ 0), soil accumulates, so set h = h_max, or add TWI/flow-accumulation colluvium. Clamp h = 0 where slope > tan(≈35–40°) (the soil repose range is 30–45°). This is one Laplacian plus one log per texel and is computable in a fragment shader from the heightmap. With k ≈ 2–4 m⁻¹, soil depth spans about 0–1.5 m over realistic curvature ranges.
- Vegetation needs soil: gate vegetation density by soil depth (for example smoothstep(0.1, 0.5, h)) times a wetness factor from TWI. Bare rock then shows on ridges, crests and steep faces, which is the physically justified look.

### Gaps
- I could not retrieve the 1997 Nature paper's own P₀ and k fit values (Tennessee Valley); the numbers above are the Wikipedia summary.
- Fernandes & Dietrich 1997 and Roering 1999 calibrated D and S_c values were not verified; the S_c ≈ 1.25 figure seen only on a lecture slide is unverified.

---

## 4. Sand and snow

### Takeaway
Desertscapes (Paris et al. 2019) is a cellular two-layer model (bedrock + sand, with optional vegetation). Sand slabs hop downwind with probabilistic deposition, wind shadowing at 5–15° and avalanching at about 33°. It is cheap enough for GPU and the code is MIT-licensed. Snow (Cordonnier et al. 2018, after Fearing 2000) is a heightfield with snow layers, where accumulation depends on slope stability, wind exposure, sun and temperature and excess slides off. For a light renderer the snow signature reduces to a slope- and altitude-gated cover with a repose-like threshold of about 38°.

### Cited Findings
- Paris, Peytavie, Guérin, Argudo, Galin 2019, "Desertscape Simulation", CGF 38(7), DOI [10.1111/cgf.13815](https://doi.org/10.1111/cgf.13815). Wind-driven simulation producing barchan, longitudinal and anchored dunes plus bedrock abrasion. The ground wind is computed from a time-varying high-altitude wind field warped by relief. Interactive brushes and a timeline. Replicability stamp — [project page](https://perso.liris.cnrs.fr/aparis/public_html/projects/paris2019_Deserts.html); [EG diglib](https://diglib.eg.org:443/handle/10.1111/cgf13815)
- Reference code ([aparis69/Desertscapes-Simulation](https://github.com/aparis69/Desertscapes-Simulation), MIT; read `desert.h` and `desert-simulation.cpp`; the author notes it is recoded, not the exact paper code):
  - Fields: `bedrock`, `sediments` (sand), `vegetation` ∈ [0,1].
  - Constants: `tanThresholdAngleSediment = 0.60` (~33°, sand repose), wind-shadow angle 0.08–0.26 (~5–15°), `tanThresholdAngleBedrock = 2.5` (~68°, bedrock stabilisation when abrasion is on), `matterToMove = 0.1` m per slab, `MAX_BOUNCE = 3`.
  - Step: pick a random cell. If it is in wind shadow (with probability IsInShadow), only stabilise; otherwise lift 0.1 m and hop downwind by the local wind vector. Deposition probability per hop is 0.6 on sand and 0.4 on bare bedrock (raised by vegetation), 1.0 if shadowed. Reptation moves sand to the 2 steepest neighbours. Abrasion happens with probability 0.2 when sand < 0.5 m. Finally the repose angle is enforced at source and destination.
  - The author notes reptation made no visible difference.
- Ripples: the project page and code did not mention ripples. Ripple-scale detail is not part of Desertscapes as far as I could verify.
- Cordonnier, Ecormier, Galin, Gain, Benes, Cani 2018, "Interactive Generation of Time-evolving, Snow-Covered Landscapes with Avalanches", CGF 37(2):497–509, DOI [10.1111/cgf.13379](https://doi.org/10.1111/cgf.13379). Heightfield with separate layers for different snow types interacting as a semi-viscous fluid. Factors: sunlight, temperature, prevailing wind, skiing. Melt and drift affect stability and avalanche likelihood. The GPU updates a 10×10 km terrain with avalanches in real time and was compared with real snow-depth data — [EG diglib](https://diglib.eg.org:443/handle/10.1111/cgf13379); [HAL](https://hal.archives-ouvertes.fr/hal-01736971)
- Fearing 2000, "Computer Modelling of Fallen Snow", SIGGRAPH 2000 pp. 37–46. Accumulation is computed by shooting particles *upward* from surfaces toward the sky (each surface controls its own sampling density), which models flake flutter, dusting and wind-blown snow. A stability pass then moves snow off unstable areas as small simultaneous avalanches; the same pass applies to flour, sand and water — [SIGGRAPH history](https://history.siggraph.org/?p=118252); [UBC thesis page](https://www.cs.ubc.ca/labs/imager/th/2000/Fearing2000/)
- Hsu & Wong 1995, "Simulating Dust Accumulation", IEEE CG&A 15(1):18–22, is the simple shading-function ancestor: amount = f(inclination, stickiness), adjusted by exposure and scraping, perturbed by noise at render time — [CUHK archive](https://webarchive.lib.cuhk.edu.hk/20210324161456mp_/http://www.cse.cuhk.edu.hk/~ttwong/papers/dust/dust.html)
- Snow repose about 38° (engineering table) — [Wikipedia: Angle of repose](https://en.wikipedia.org/wiki/Angle_of_repose)

### Inferences
- For a static landscape, the shader-level snow rule is: cover = smoothstep(snowline − band, snowline + band, z + noise) × smoothstep(tan 40°, tan 30°, slope) × exposure, where exposure is the dot product of the normal with the up/upwind direction (Hsu–Wong / Fearing-style flutter). Optionally deepen snow in concave lee hollows. This costs a few ALU operations per fragment and needs no simulation.
- Sand is the same pattern: sand where the slope is below about 33° *and* flow-accumulated sediment is thick or the region is classified as desert or beach. The cheap dune signature is an anisotropic ridge-noise field oriented across the wind with an asymmetric profile (gentle stoss, steep 33° lee). Ripples are a high-frequency version of the same along the same axis (no source for ripple wavelength retrieved).

### Gaps
- Snow paper internals (layer types, stability angles, resolution, ms per step) were not read (PDF > 10 MB).
- Fearing's flutter and occlusion equations were not retrieved (ACM paywall; the thesis is not online).
- No primary source retrieved for aeolian ripple wavelength or height.

---

## 5. Material classification on a heightfield, texturing and blending, real-time cost

### Takeaway
Physically justified classification uses five derived maps, all computable from the heightfield: slope (vs repose angles), curvature (soil depth via the Laplacian), wetness/TWI (flow accumulation), altitude (snowline, treeline), and a lithology/strata lookup (rock type by original depth). Rendering then uses height-based splat blending (per-layer height maps decide the transition, giving crisp, drawn-looking edges) with triplanar projection only on steep faces. Triplanar roughly triples texture fetches, so it should be restricted to cliffs or replaced by procedural shading.

### Cited Findings
- Arches blends material textures per vertex by the fraction of visible surface of each material in a cube around the vertex — [Arches PDF](https://perso.liris.cnrs.fr/egalin/Articles/2009-arches.pdf)
- Cordonnier 2018 assigns rock type by the surface point's original crust elevation and adds final micro-displacement as noise weighted by slope and elevation — [Cordonnier18TVCG](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier18TVCG.pdf)
- Height-based blending: each texture carries a height map. The painted weight is treated as a height, the texture height is added, the highest wins, and a narrow clamped band blends near-equal heights. The cost is one extra height sample per layer — [Wikipedia: Texture splatting](https://en.wikipedia.org/wiki/Texture_splatting); [jMonkeyEngine forum](https://hub.jmonkeyengine.org/t/improved-terrain-splatting-and-parallax-mapping/27844)
- Triplanar mapping renders the surface from 3 projections and blends them, which repeats colour and lighting work, so cost is its main downside. Blending at about 45° with splatting is a known artefact source — [Envato Tuts+ triplanar](https://code.tutsplus.com/use-tri-planar-texture-mapping-for-better-terrain--gamedev-13821a)
- A practical Unity shader combined height blending with triplanar in a single pass by packing 8 splat textures into atlases to stay under sampler limits — [makegamessa](https://makegamessa.com/discussion/comment/48221/)

### Inferences
- **Classification recipe (per texel, baked once):**
  - slope s = |∇z|
  - curvature κ = ∇²z
  - flow accumulation A (D8 or MFD on the GPU in a few passes, or on the CPU once)
  - TWI = ln(A·cell/ tan β)
  - soil depth h from section 3
  - lithology L = strata(z_orig + fold(x,y))
  - Then, in priority order: **snow** (altitude above the snowline, s < tan 38°, exposure) → **cliff/bedrock** (s > tan 40–45°, or h ≈ 0; type from L) → **scree** (tan 30° < s < tan 38°, directly below cliff cells, i.e. high upslope rock fraction) → **sand** (s < tan 33°, high sediment or arid flag) → **wet soil / meadow** (high TWI) → **soil/grass** (h > ~0.3 m) → **thin soil / rock pavement** otherwise.
- **Cost (WebGL2/WebGPU estimate, not benchmarked):** for N splat layers, height-blend ≈ 2N fetches; triplanar ≈ 3× that per layer. A two-material-per-texel scheme (store the top-2 material IDs + blend weight in one RGBA8 control texture) holds this at about 4–6 fetches with plain projection and about 12–18 on triplanar cliffs. Procedural-only shading (Worley/value noise plus strata 1-D lookup) avoids texture memory entirely, costing about 10–40 ALU hash operations per noise octave instead, and suits a "light, drawing-like" style. A cheap stroke look comes from thresholded height-blend edges and ink lines at material boundaries (|∇materialID| ≠ 0) and at strata band edges.
- A biplanar variant (two dominant projections instead of three) cuts the triplanar cost by a third (Inigo Quilez's "biplanar mapping" article). I did not fetch it, so it is unverified here.

### Gaps
- No measured ms or fetch benchmarks for terrain shaders in WebGL2/WebGPU were found; the costs above are estimates.
- Ben Golus's triplanar normal-blending article and the Eurographics short paper on triplanar displacement (egs20201016) returned HTTP 403 and were not read.
- No source found for an established "drawing-like" (NPR) terrain material shading paper.

---

## What this means for the build

Have seven material regions:
- bedrock/cliff, with a lithology sub-type taken from a 1-D strata function
- scree/talus
- soil (thin and deep)
- wet soil/meadow
- sand
- snow
- instanced boulders as a separate geometric layer

Assign them physically from maps baked once from the heightfield: slope against repose angles (sand ~33°, soil and scree ~30–38°, rock cliffs above ~40–45°, snow sliding above ~38°), steady-state soil depth h = (1/k)·ln(P₀/(D·|∇²z|)) with k ≈ 2–4 m⁻¹, TWI = ln(a/tan β) for wetness, altitude for the snowline, and a strata hardness lookup. As in Cordonnier 2018, the strata lookup should also set per-layer erodibility and talus angle (weak: high k, 30°; hard: low k, 50°) in any erosion pass, so that cliffs and benches form where hard beds are. The highest realism per cost for each material comes from:
- **cliffs:** horizontal (or folded) strata bands from a 1-D lookup at warped elevation
- **basalt and limestone:** 2-D Worley cells (columns ~0.3–1 m; clints ~1–3 m with 0.1–0.8 m grikes)
- **boulders and scree:** a handful of pre-built eroded-Voronoi rock meshes instanced at the cliff foot within the repose band (the Arches recipe: thousands of rocks, instancing in < 1 s)
- **soil:** colour and vegetation gated by computed depth, so bare rock reads on ridges
- **sand:** wind-aligned asymmetric ridge noise with a 33° lee
- **snow:** a slope × altitude × exposure mask

Blend with height-based splatting and keep triplanar for steep faces only, since that is where most of the texture fetches go.
