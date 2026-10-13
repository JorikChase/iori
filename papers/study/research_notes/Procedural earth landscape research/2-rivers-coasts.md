# Rivers, river networks, lakes, deltas, coastlines and straits: procedural and physically based generation on a heightfield, aimed at the browser

Scope note: research done 2026-10-13. I read the full text (via pdftotext) of Génevaux et al. 2013, Peytavie et al. 2019, Paris et al. 2023, Barnes et al. 2014 (arXiv preprint), Dodds & Rothman 1999, Fischer et al. 2022, Mandelbrot 1967 and the Vlachos 2010 flow-map slides. The rest comes from abstracts and search records. Items marked **[unverified]** come from my background knowledge and were not checked against a primary text in this session. Treat them as leads, not citations.

---

## 1. Drainage: flow routing, depression filling, drainage area, Strahler order and the fractal laws of river networks (with numbers for real Earth)

### Takeaway
The standard pipeline has four steps: fill or breach depressions with Priority-Flood, route flow with D8, D-infinity or MFD, accumulate drainage area, then threshold the area to extract channels and Strahler-order them. Real networks obey a tight set of scaling laws, and these make a ready validation suite: R_B ≈ 3–5 (≈4–4.5 for large basins), R_L ≈ 1.5–3, R_A ≈ 3–6, Hack h ≈ 0.57–0.60, area-exceedance exponent ≈ 0.43 (τ ≈ 1.43), main-stream fractal dimension d ≈ 1.1, Tokunaga T1 ≈ 1.0–1.5. Only two of these exponents are independent.

### Cited Findings
**Depression filling: Priority-Flood**
- Barnes, Lehman & Mulla (2014), "Priority-flood: An optimal depression-filling and watershed-labeling algorithm for digital elevation models", *Computers & Geosciences* 62:117–127, DOI 10.1016/j.cageo.2013.04.024 — [Landlab docs citing it](https://landlab.readthedocs.io/en/latest/generated/api/landlab.components.sink_fill.sink_fill_barnes.html); preprint [arXiv 1511.04463](https://ar5iv.arxiv.org/html/1511.04463).
- How it works: flood the DEM inward from its edges. A priority queue (min-heap on elevation) picks the next cell, and each unvisited neighbour is raised to at least the popped cell's elevation. The result has no depressions or digital dams, so every cell drains. It is O(n) for integer data and O(n log₂ n) for floating-point data — [arXiv 1511.04463](https://ar5iv.arxiv.org/html/1511.04463).
- "Improved Priority-Flood" (their Algorithm 2) puts cells that are being filled inside a depression on a plain FIFO queue instead of the heap. It ran up to 37% faster than the original in their tests, and counties with more depressions were faster still — [arXiv 1511.04463](https://ar5iv.arxiv.org/html/1511.04463).
- An ε variant raises each filled cell by a tiny ε above its parent so that flats get a gradient and flow directions are defined. Watershed labelling or flow directions need a total order (ε ≠ 0 or tie-breaking), whereas plain filling does not — [arXiv 1511.04463](https://ar5iv.arxiv.org/html/1511.04463).
- The same queue gives **watershed labels** for free: each seed carries a label that floods outward. This is what Landlab's `LakeMapperBarnes` uses to "temporarily fill depressions and reroute flow across them", i.e. lakes as filled depressions with a spill point — [Landlab LakeMapperBarnes](https://landlab.readthedocs.io/en/latest/reference/components/lake_fill.html).
- Both graphics pipelines use it: Peytavie et al. 2019 apply [BLM14] "which leaves the surface slightly proud with an available flow channel" before computing drainage area, and Paris et al. 2023 use Barnes' **breaching** instead of filling ("to remove unwanted pits") — [Peytavie 2019 PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Peytavie19CGF.pdf); [Paris 2023 HAL](https://hal.univ-lorraine.fr/hal-04227965v1).

**Flow routing**
- D-infinity: Tarboton, D. G. (1997), "A new method for the determination of flow directions and upslope areas in grid digital elevation models", *Water Resour. Res.* 33(2):309–319, DOI 10.1029/96WR03137 — [USU Digital Commons](https://digitalcommons.usu.edu/cee_facpub/2507).
  **[unverified mechanics]** The method splits the 3×3 neighbourhood into 8 triangular facets, takes the steepest downslope direction as a continuous angle on the steepest facet, and divides flow between the two cells bounding that angle in proportion to angular proximity. This sits between single-direction D8 (O'Callaghan & Mark 1984) and full multiple-flow-direction MFD (Quinn et al. 1991; Freeman 1991, where the flow fraction to neighbour i is ∝ (tan β_i)^p, with p ≈ 1.1 in Freeman).
- Peytavie et al. 2019 compute drainage area with Freeman 1991 (MFD) — [Peytavie 2019 PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Peytavie19CGF.pdf).
- Choosing a router: D8 gives single-thread channels and a tree, which suits extracting a vector river graph. MFD and D∞ give realistic dispersed hillslope areas but blurred channels. A common hybrid **[unverified as a named method]** is MFD on hillslopes and D8 above the channel threshold.

**Channel extraction and ordering**
- The discrete river network is the set of cells with drainage area above a user threshold. It becomes a graph by putting nodes at cells with more than one contributor and smoothing between nodes with piecewise cubic splines. Edges get the Horton–Strahler number — [Peytavie 2019 PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Peytavie19CGF.pdf).
- Strahler rule as used in Génevaux 2013: a leaf has s = 1. Where two branches of equal order k meet, the result is s = k + 1. Otherwise the result takes the max — [Génevaux 2013 PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Genevaux13ToG.pdf).

**Horton, Hack and Tokunaga: numbers for Earth (Dodds & Rothman 1999, Table II, "Real networks" column)**
Source: Dodds, P. S. & Rothman, D. H. (1999), "Unified view of scaling laws for river networks", *Phys. Rev. E* 59(5):4865–4877, DOI 10.1103/PhysRevE.59.4865 — [arXiv cond-mat/9808244](https://arxiv.org/pdf/cond-mat/9808244).
- Horton bifurcation (stream-number) ratio **R_n = 3.0–5.0**. Area ratio **R_a = 3.0–6.0**. Length ratio **R_ℓ = 1.5–3.0**. Tokunaga **T1 = 1.0–1.5**. For comparison, Scheidegger's random directed model gives R_n = R_a = 5.20, R_ℓ = 3.00, T1 = 1.30 — [Dodds & Rothman](https://arxiv.org/pdf/cond-mat/9808244).
- Main-stream fractal dimension **d = 1.1 ± 0.01** (Scheidegger: 1). Basin fractal dimension **D = 1.8 ± 0.1** (Scheidegger: 3/2) — same source.
- Hack exponent **h = 0.57–0.60** (Scheidegger: 2/3). Measured over a big span of basin sizes as 0.57 < h < 0.60; very large basins tend back toward h = 1/2 — same source.
- Area-exceedance / distribution exponent **τ = 1.43 ± 0.02**, so P(a) ∼ a^−τ, equivalently P(A > a) ∼ a^−0.43. Length distribution **γ = 1.8 ± 0.1**. Hurst / elongation **H = 0.75–0.80**. Langbein φ = 1.05 ± 0.01. β = 1.56 — same source.
- **Scaling relations** (only two exponents are independent under uniform drainage density): h = ln R_ℓ / ln R_n; τ = 2 − h; γ = 1/h = D/d = 1/(2 − τ); h = d/D, which replaces Mandelbrot's h = d/2. Tokunaga's law and Horton's laws are equivalent for uniform drainage density — same source.
- Measurement caveat: fitting Horton ratios to low orders is biased. Fits over ω = 1–3 gave R_n = 2.92, R_a = 5.29, but over ω = 4–8 both converged to ≈ 4.0 for a synthetic R_n = R_a = 4 network. So **measure Horton ratios on middle orders, not orders 1–2** — same source, Table III.
- Secondary corroboration: observed R_B is in [3, 5] and is typically ≈ 4.5 for large basins (Beaver Creek R_B ≈ 4.6, R_L ≈ 2.3), per a ResearchGate preprint citing Yang & Paik 2017 — [ResearchGate: Horton laws in Tokunaga networks](https://www.researchgate.net/publication/307648084_Horton_laws_for_hydraulic-geometric_variables_and_their_scaling_exponents_in_self-similar_Tokunaga_river_networks). Treat as secondary.

**Optimal channel networks (OCNs)**
- Rinaldo, Rigon, Banavar, Maritan, Rodríguez-Iturbe (2014), "Evolution and selection of river networks: Statics, dynamics, and complexity", *PNAS* 111(7):2417–2424, DOI 10.1073/pnas.1322700111 — [PMC3932906](https://pmc.ncbi.nlm.nih.gov/articles/PMC3932906).
  - OCNs are spanning loopless trees that minimise total energy dissipation. Every local minimum of the OCN functional is a stationary solution of the landscape evolution equation (erosion on channelled sites + diffusive hillslope term + uplift), and every spanning tree is exactly a local minimum under the stated constraints — [PMC3932906](https://pmc.ncbi.nlm.nih.gov/articles/PMC3932906).
  - Exceedance exponent of area: β = 0.44 for the Tanaro basin (Fig. 1) and 0.43 as the ensemble mean over 128 single-outlet OCNs (Fig. 2). Periodic boundaries "slightly steepen" it — [PMC3932906](https://pmc.ncbi.nlm.nih.gov/articles/PMC3932906).
  - Computation: **greedy search** (random single-link disconnect and reorient, accepted only if total dissipation falls) gives local minima, and these match real networks. **Metropolis annealing** with slow cooling reaches the ground state, which has mean-field exponents that do *not* match nature. Real networks are "feasible optimality": dynamically accessible, suboptimal local minima — [PMC3932906](https://pmc.ncbi.nlm.nih.gov/articles/PMC3932906).
  - Eden growth and random-walk / topologically random networks match topological measures (Horton ratios) but fail stricter statistical tests. **Horton ratios alone are therefore a weak test** — [PMC3932906](https://pmc.ncbi.nlm.nih.gov/articles/PMC3932906).
  - **[unverified, the equations were images in the fetched text]** OCN functional E = Σ_i Q_i^γ ΔZ_i ≈ Σ_i A_i^γ with γ ≈ 0.5, from the local slope–area relation S ∝ A^(γ−1) ≈ A^−0.5.
- Book: Rodríguez-Iturbe, I. & Rinaldo, A. (1997), *Fractal River Basins: Chance and Self-Organization*, Cambridge University Press — cited as the OCN theory source in [PMC3932906](https://pmc.ncbi.nlm.nih.gov/articles/PMC3932906).
- Original OCN paper: **[unverified citation]** Rinaldo, Rodríguez-Iturbe, Rigon, Bras, Ijjász-Vásquez, Marani (1992), "Minimum energy and fractal structures of drainage networks", *Water Resour. Res.* 28(9):2183–2195, DOI 10.1029/92WR00801.

### Inferences
- For a browser terrain, the cheapest physically grounded network is: heightfield → Priority-Flood (ε variant, or breaching) → D8 receivers → accumulate drainage area by sorting cells by filled elevation (or by topological order of the receiver tree), all O(n log n) → threshold → Strahler. A 1024² grid is ~10⁶ cells, which a Web Worker in JS or WASM handles in well under a second **[estimate, not measured]**.
- If the terrain comes from noise rather than erosion, the extracted network will drain but will usually fail the Hack and τ tests, because noise has no channel–hillslope coupling. Two remedies follow: run a stream-power erosion pass (Fastscape-type, another track's topic), or generate the network first (Génevaux) or by greedy OCN optimisation and carve the terrain around it.
- An OCN greedy search on a 256² lattice is a feasible precompute for an "ideal" network that matches τ ≈ 0.43 and h ≈ 0.57. Annealing to the ground state is not wanted: it gives non-Earth exponents.

### Gaps
- I did not retrieve Tarboton's facet equations or Freeman's exponent p from primary text.
- Exact OCN functional and γ from Rinaldo 1992 / 2014 were not readable (equations rendered as images).
- I found no source with fitted Tokunaga T1 and R_T values for named real basins beyond Dodds & Rothman's range of 1.0–1.5.

---

## 2. Graphics papers: procedural hydrology-based terrain and rivers (2008–2023)

### Takeaway
The LIRIS/Purdue line is the reference. Génevaux 2013 generates the river graph first and builds terrain around it. Peytavie 2019 extracts rivers from an existing heightfield and builds riverbeds and an analytic animated water surface. Paris 2023 adds physically based meander migration with cutoffs and avulsions. Fischer 2022 is a simpler grid variant that adds lakes and deltas. All four use φ = 0.42·A^0.69 for discharge, Rosgen types for channel form, and Strahler numbers for hierarchy.

### Cited Findings
**Génevaux, Galin, Guérin, Peytavie, Beneš (2013)**, "Terrain generation using procedural models based on hydrology", *ACM TOG* 32(4), Art. 143 (SIGGRAPH 2013), DOI 10.1145/2461912.2461996 — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Genevaux13ToG.pdf); [HAL](https://hal.archives-ouvertes.fr/hal-01339224)
- Pipeline: the user draws the island contour Γ, plus optionally a river-slope map and a terrain-slope map. River mouths are seeded on Γ. The drainage network grows inland as a geometric graph, Voronoi cells around the nodes give watersheds and crests, rivers are labelled by Rosgen type, and the terrain is a tree of procedural primitives combined by blending and carving operators — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Genevaux13ToG.pdf).
- Growth grammar (their Table 1): α(1) → τ(1)β^p(1), p ∈ [1,5] ("filling"). α(n) → τ(n)β(n) with prob. P_c (continuation), → τ(n)β(n−1)β(n−1) with P_s (symmetric Strahler junction), → τ(n)β(n)β(m), m < n, with P_a (asymmetric junction). P_c + P_s + P_a = 1 — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Genevaux13ToG.pdf).
- Candidate selection: find the lowest candidate elevation z, keep candidates within [z, z + ζ], then take the highest priority and then the lowest elevation. With ζ = 0 basins are similar in size. With ζ = 20 you get one large network plus several small ones — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Genevaux13ToG.pdf).
- Validity constraints: distance to contour d(p, Γ) > η = 1500 m. Edge-to-edge distance d(E, E_i) > σ·f(s), with σ = 1500 m and f growing with Strahler number so big rivers stay apart. Lipschitz slope bound |p_z − p_iz| < κ(p)·d(p, p_i) prevents cliffs. Edge length e = 2000 m (η = σ = ¾e) — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Genevaux13ToG.pdf).
- Parameter effect: (P_c, P_s, P_a) = (0.2, 0.7, 0.1) gives curved watersheds, few main stems and >75% (82% in their histogram) Strahler-1 streams. (0.2, 0.1, 0.7) gives watersheds of comparable size with long main rivers — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Genevaux13ToG.pdf).
- **Discharge law**: mean flow φ [m³/s] = **0.42·A^0.69**, A in m². This is from Dunne & Leopold 1978 and is "not preserved" volume because it includes evaporation and infiltration. A is the sum of upstream Voronoi cell areas — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Genevaux13ToG.pdf).
- Crest elevation q_z = max(a_z, b_z, c_z) + λ(q)·d, with λ ∈ [0, 0.25] the terrain-slope map value, which guarantees that water flows down from ridges — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Genevaux13ToG.pdf).
- Rosgen labelling: by slope and proximity to the coast. Nodes close to the coast (geodesic threshold) become braided types D/DA. **River mouths with flow above a fixed value are marked as deltas** — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Genevaux13ToG.pdf).
- Performance (i7 3 GHz, C++): graph 0.1–5.3 s, cells 0.1–1.1 s, tree 1.8–4.9 s, 1024² mesh evaluation 0.7–1.2 s. Example terrains of 970–3386 km² with 399–2106 km of network and 19k–76k primitives. Storage ≈ 1.5 kB/km². Limitation: only terrains once subject to hydraulic erosion — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Genevaux13ToG.pdf).
- Validation was visual only: comparisons with an erosion simulation (Šťava 2008), fractal noise and a real dataset, plus recreating a real island from a sketch in under 5 min. There was no Hack or τ measurement — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Genevaux13ToG.pdf).

**Peytavie, Dupont, Guérin, Cortial, Beneš, Gain, Galin (2019)**, "Procedural Riverscapes", *CGF* 38(7):35–46 (Pacific Graphics 2019), DOI 10.1111/cgf.13814 — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Peytavie19CGF.pdf); [EG DL](https://diglib.eg.org/handle/10.1111/cgf13814)
- Input: an existing bare-earth heightfield at 1–30 m/pixel. Steps: Priority-Flood → drainage area (Freeman MFD) → threshold → spline graph → node slope s and flow φ = 0.42·A^0.69 → per-edge **stream power P = A^(1/2)·S**, averaged over the edge cells → Strahler number → Rosgen type per edge — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Peytavie19CGF.pdf).
- Trajectory refinement: edges are made meandering when slope is low and flow moderate (Rosgen C, E, G) and straight when steep (A, A+). The longitudinal profile gets drops and basins keyed to type. Cross-section templates are normalised to unit wetted area and scaled by **a = φ/‖u‖**, so cross-section area = discharge/velocity — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Peytavie19CGF.pdf).
- Type-specific geometry: A = steep, falls and basins. C = strong curvature, asymmetric cross-section at bends and symmetric where curvature is low. D = multiple braided channels, with the channel count set from flow and width and each channel's width and depth partitioned from the total. Examples: a 6% slope gives A+ with drops and cascades; a 0.1% slope gives a calm reach — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Peytavie19CGF.pdf).
- Water surface: a **blend-flow tree** of disc-supported primitives. Each node returns elevation f(p,t), surface velocity u(p,t), "effervescence" s(p,t) (white water vs clear, used for foam shading) and weight α(p). A uniform-flow primitive is f(p,t) = e + a·δh(ω⁻¹(p,t)) with ω⁻¹(p,t) = p − t·u, i.e. advected noise. Whirlpools use the rotational warp ω⁻¹ = R(−ψ(p))·p with ψ = σ‖p − c‖/R + βt. The merge operator is a weight-normalised blend; the replace operator is f = (1 − α_A)f_A + α_B f_B — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Peytavie19CGF.pdf).
- Real-time implementation: a grid acceleration with one flow primitive per cell (so at most 4 overlap at any point) and tessellation-shader rendering. They report >70 fps at 1920×1080 with tens of thousands of primitives, 20–80 fps for 698k primitives with ray-cast reflection and refraction plus grass, and 48–195 fps without those. Memory runs from 22 kB (50 m river) to 2.7 MB (≈4 km) — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Peytavie19CGF.pdf).
- Limitations: the surface is a height function, so there are no breaking waves, waterfalls or splashes. Blending primitives with opposing velocities can create artefacts — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Peytavie19CGF.pdf).

**Paris, Guérin, Collon, Galin (2023)**, "Authoring and simulating meandering rivers", *ACM TOG* 42(6) (SIGGRAPH Asia 2023), DOI 10.1145/3618350 — [HAL](https://hal.univ-lorraine.fr/hal-04227965v1); [Adobe Research](https://research.adobe.com/publication/authoring-and-simulating-meandering-rivers). Details are in §3 below.

**Fischer, Boeckers, Zachmann (2022)**, "Procedural Generation of Landscapes with Water Bodies Using Artificial Drainage Basins", CGI 2022 (Univ. Bremen) — [PDF](https://cgvr.cs.uni-bremen.de/papers/cgi22/CGI22.pdf)
- Inverse pipeline: coastline/landmass → regions → **outlets** placed around coasts and mountain regions → artificial drainage basins grown from outlets by random fringe expansion → flow map → rivers traced from sources → lakes → terrain "grown" upward from water bodies, with height steadily increasing away from outlets — [PDF](https://cgvr.cs.uni-bremen.de/papers/cgi22/CGI22.pdf).
- Lakes: each river cell has a chance to spawn a lake whose size scales with river "strength". Borders are noise-perturbed, with at most one lake per river source and user caps per region. Deltas: a second, local basin iteration that uses a river cell as the source and several coastline cells as outlets, which become the distributaries — [PDF](https://cgvr.cs.uni-bremen.de/papers/cgi22/CGI22.pdf).
- Performance: a 2048² grid runs in under 25 s, and smaller grids in a few seconds. Validation was visual similarity to real coastlines. Future work names oxbow lakes and wetlands — [PDF](https://cgvr.cs.uni-bremen.de/papers/cgi22/CGI22.pdf).

**Other**
- River deltas from a stochastic L-system skeleton plus cGAN DEM synthesis: "A Modular Generative Approach for Realistic River Deltas: When L-Systems and cGANs Meet" (~2021, date unconfirmed) — [ResearchGate](https://www.researchgate.net/publication/357609433_A_Modular_Generative_Approach_for_Realistic_River_Deltas_When_L-Systems_and_cGANs_Meet).
- Pytel (2015), PhD thesis, "Erosion, Self-Organization, and Procedural Modeling", Univ. Waterloo. It treats coastlines, dunes and channel-network terrains with self-organised erosion that yields fractal-looking detail without explicit fractal synthesis — [UWSpace](https://uwspace.uwaterloo.ca/handle/10012/9085).
- Cordonnier, Braun, Cani, Beneš, Galin, Peytavie, Guérin (2016), "Large scale terrain generation from tectonic uplift and fluvial erosion", *CGF* 35(2):165–175 (stream-power erosion; cited by Peytavie 2019 for stream power) — [Peytavie 2019 references](https://www.cs.purdue.edu/homes/bbenes/papers/Peytavie19CGF.pdf).
- **[unverified]** Teoh, S. T. (2008), "RiverLand: an efficient procedural modeling system for creating realistic-looking terrains", ISVC 2008, LNCS. I did not retrieve it in this session.

### Inferences
- For a browser build that starts from a noise or eroded heightfield, Peytavie 2019 is the right template: its whole front end is grid algorithms, and its water is an analytic function of (p, t) that maps directly onto a fragment or vertex shader.
- Génevaux 2013 is the right template if you want guaranteed drainage on a sketched island. Its outputs (Strahler histograms) can be tuned via P_s/P_a toward R_B ≈ 4.
- None of these graphics papers validates network-scale statistics (Hack, τ, Horton). Paris 2023 validates only meander wavelength and sinuosity. Measuring those laws would be a genuine contribution.

### Gaps
- I did not retrieve Teoh 2008 (RiverLand), Derzapf 2011 (planet-scale rivers), or 2024–2026 work on braided rivers, estuaries or tidal channels in graphics. A search for 2022–2024 coastal or estuary graphics papers found nothing beyond Fischer 2022 and the delta cGAN paper.

---

## 3. Channel hydraulic geometry (width, depth, velocity vs discharge), Manning, meander wavelength, sinuosity and migration models

### Takeaway
Use downstream hydraulic geometry w ∝ Q^0.5, d ∝ Q^0.4, u ∝ Q^0.1 (or, as Paris 2023 does, w ∝ A^0.5 with w = 18.8·d^1.41). Use meander wavelength λ ≈ 6.3–12.3·w (Leopold & Wolman 1960 range; 7–12 w in USGS PP 282-B) and sinuosity > 1.5 for "meandering". For dynamics, the Howard–Knutson / Sylvester kinematic migration law is published with every constant and is already proven in graphics at interactive rates.

### Cited Findings
**Hydraulic geometry**
- Leopold, L. B. & Maddock, T. (1953), "The hydraulic geometry of stream channels and some physiographic implications", USGS Professional Paper 252, DOI 10.3133/pp252. It found that width, depth, velocity and suspended load vary with discharge as simple power functions, both at a station and downstream (for discharge of equal frequency), and that the functions differ only in their coefficients and exponents — [USGS pubs](https://pubs.usgs.gov/publication/pp252).
- **[unverified against PP252 text]** Exponents w = aQ^b, d = cQ^f, u = kQ^m with b + f + m = 1 and ac·k = 1. Downstream averages: b ≈ 0.5, f ≈ 0.4, m ≈ 0.1. At-a-station averages: b ≈ 0.26, f ≈ 0.40, m ≈ 0.34. The b ≈ 0.5 downstream value is corroborated by Paris 2023's w ∝ a^0.5 (from Dunne & Leopold 1978) — [Paris 2023 HAL](https://hal.univ-lorraine.fr/hal-04227965v1).
- Width–depth relation used in graphics: **w = 18.8·d^1.41** (Konsoer et al. 2013), with w ∝ a^0.5 — [Paris 2023 HAL](https://hal.univ-lorraine.fr/hal-04227965v1).
- Discharge from area: **φ = 0.42·A^0.69** (m³/s, A in m², Dunne & Leopold 1978) — [Génevaux 2013](https://www.cs.purdue.edu/homes/bbenes/papers/Genevaux13ToG.pdf); [Peytavie 2019](https://www.cs.purdue.edu/homes/bbenes/papers/Peytavie19CGF.pdf). **Units flag (my arithmetic):** with A in m² as printed, A = 1 km² = 10⁶ m² gives φ = 0.42·10^(6×0.69) = 0.42·10^4.14 ≈ 5 800 m³/s, which is far too large for real rivers. With A in km², the same formula gives φ ≈ 0.42 m³/s at 1 km² and ≈ 49 m³/s at 1000 km², which are plausible mean flows for a humid climate. The coefficient almost certainly assumes A in km² (or mi²). Verify against Dunne & Leopold (1978) before use.
- Manning's equation **[unverified in session, standard]**: u = (1/n)·R^(2/3)·S^(1/2) (SI), with hydraulic radius R ≈ d for wide channels and n ≈ 0.025–0.035 for natural channels and 0.03–0.05+ for cobbly mountain streams. Combined with continuity Q = w·d·u, this lets you solve depth from Q, w and slope S.

**Meander geometry**
- Wavelength–width: λ = a·w^b with **6.28 ≤ a ≤ 12.34 and 1 ≤ b ≤ 1.13** (Leopold & Wolman 1960; Yalin 1972). Williams 1986 error bands put real λ within −40% to +65% of the estimate. For w = 50 m that is λ ∈ [314, 990] m, for w = 100 m [628, 2150] m, and for w = 200 m [1256, 4674] m — [Paris 2023 HAL](https://hal.univ-lorraine.fr/hal-04227965v1).
- USGS PP 282-B (Leopold & Wolman): the meander wavelength, or twice the distance between successive riffles, is **7 to 12 times the channel width** — [USGS PP 282-B](https://pubs.usgs.gov/pp/0282b/report.pdf) (via search snippet). The often-quoted "10–14 w" in the brief was **not** found in a primary source. Use 7–12 w (PP 282-B) or a = 6.3–12.3 (Paris 2023 compilation).
- Sinuosity σ = channel length / straight-line distance. A river is "meandering" when σ > 1.5. Paris 2023 obtained σ = 1.9–3.8 and λ = 710–2160 m for w = 50–200 m — [Paris 2023 HAL](https://hal.univ-lorraine.fr/hal-04227965v1).

**Meander migration models**
- Ikeda, Parker & Sawai (1981), "Bend theory of river meanders. Part 1. Linear development", *J. Fluid Mech.* 112:363–377, DOI 10.1017/S0022112081000451. A linear theory of centreline migration as a function of curvature, whose secondary-flow terms were corrected by Johannesson & Parker 1989 (only one coefficient needed redefining) — [CSDMS reference](https://csdms.colorado.edu/wiki/Reference:Reference-014753); [JFM](https://resolve.cambridge.org/core/journals/journal-of-fluid-mechanics/article/bend-theory-of-river-meanders-part-1-linear-development/EAE7F1CD6803CC4F4F61148CB4FE96B3).
- Howard & Knutson (1984), "Sufficient conditions for river meandering: a simulation approach", *Water Resour. Res.* 20(11):1659–1667, DOI 10.1029/WR020i011p01659 (DOI from meanderpy docs; some references date it 1985). A kinematic model in which migration rate is a weighted sum of upstream curvatures, with no velocity — [CSDMS meanderpy](https://csdms.colorado.edu/wiki/Model:Meanderpy).
- **Graphics implementation (Paris et al. 2023, following Sylvester et al. 2019 / meanderpy):**
  - Centreline points move along the normal: **p_k(t+δt) = p_k(t) + n_k(t)·μ(p_k)·δt**, with δt = **106 days** (up to 1 year is stable).
  - Curvature φ = (x′y″ − y′x″)/(x′² + y′²)^(3/2), by central differences.
  - Local rate **μ₀ = w·k·φ**, with **k = 0.164 m/day**.
  - Global rate **μ(u) = ω·μ₀(u) + σ^(−2/3)·γ·∫₀^∞ μ₀(u−ζ)·e^(−αζ) dζ / ∫₀^∞ e^(−αζ) dζ**, with **ω = −1, γ = 2.5** (Howard 1984) and **α = 2f/d** with friction **f = 0.011**. Deeper rivers feel upstream curvature further away. The upstream term produces the downstream lag between maximum curvature and maximum migration.
  - Resample to spacing **δp = 50 m** (must satisfy δp ≤ w) through a cubic spline each step. Endpoints are anchored so junctions stay fixed.
  - Events: cutoffs form **oxbow lakes**. Avulsion probability 0.05 per event, with initial angle 45° and slope threshold 0.05. Crevasse probability 0.05 when curvature > 0.1. Terrain slope above **s₀ = 0.15** damps migration so steep reaches stay straight.
  - Interactive in real time for networks up to ≈5 000 sampling points. Limitation: it inherits the IPS-family upstream-skewed bend asymmetry and has no vertical aggradation or levees.
  — all from [Paris 2023 HAL](https://hal.univ-lorraine.fr/hal-04227965v1).

### Inferences
- The Paris/Sylvester migration step is a 1-D convolution along a polyline, O(N) per step with an exponential kernel (computable as a running sum). It ports easily to JS: a few thousand points × hundreds of steps runs in milliseconds.
- Carve channels from the vector centreline into the heightfield using w(Q) and d(Q) (a Rosgen C cross-section, asymmetric at bends). Oxbows left by cutoffs become lake polygons; set their water level to the local floodplain level.
- Because k scales μ₀ by w, λ/w stays constant across rivers of different size, which is exactly the Leopold–Wolman invariant. This makes λ/w the meander-validation metric.

### Gaps
- I could not read PP252's exponent tables, so the b/f/m values are from memory.
- Manning n ranges are from memory.
- The 0.42·A^0.69 units problem needs checking against Dunne & Leopold (1978), *Water in Environmental Planning*; I could not access it.

---

## 4. Lakes and deltas

### Takeaway
Lakes come free from Priority-Flood: a depression's filled level is its spill elevation, and the filled-minus-original depth is the lake depth. Endorheic or evaporative lakes need a water balance that decides whether a depression fills to its spill point. Deltas in graphics are either rule-based (a mouth with flow above a threshold, then distributaries via local basin regrowth or an L-system) or learned. I found no graphics paper simulating delta morphodynamics.

### Cited Findings
- Priority-Flood identifies each depression and its fill level (spill point) and labels watersheds. Landlab's LakeMapperBarnes fills depressions temporarily and reroutes flow across them, i.e. it treats them as lakes with an outlet — [Landlab LakeMapperBarnes](https://landlab.readthedocs.io/en/latest/reference/components/lake_fill.html); [Barnes 2014 arXiv](https://ar5iv.arxiv.org/html/1511.04463).
- Génevaux 2013: Rosgen D/DA (braided) near coasts, and mouths with flow above a fixed value are labelled deltas — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Genevaux13ToG.pdf).
- Fischer 2022: stochastic lakes along rivers, sized by river strength, and deltas by local basin regrowth with several coastal outlets — [PDF](https://cgvr.cs.uni-bremen.de/papers/cgi22/CGI22.pdf).
- Paris 2023: oxbow lakes from meander cutoffs; avulsions and crevasses as delta and floodplain precursors. Artists asked for braided rivers and deltas as future work — [HAL](https://hal.univ-lorraine.fr/hal-04227965v1).
- Delta L-system + cGAN approach — [ResearchGate](https://www.researchgate.net/publication/357609433_A_Modular_Generative_Approach_for_Realistic_River_Deltas_When_L-Systems_and_cGANs_Meet).
- **[unverified]** Background geomorphology useful as rules:
  - Galloway (1975) ternary delta classification: river-dominated (birdfoot, e.g. Mississippi), wave-dominated (cuspate, e.g. São Francisco), tide-dominated (funnel or estuarine, e.g. Ganges–Brahmaputra).
  - Avulsion length scale in deltas ≈ backwater length L_b ≈ h/S (Jerolmack & Swenson 2007; Chatanantavet et al. 2012).
  - Barnes, Ehlschlaeger, Callaghan & Wood's later "Fill-Spill-Merge" (Barnes et al. 2020/2021, ESurf) routes a finite water volume into a depression hierarchy, which gives partially filled lakes.

### Inferences
- For lakes in a browser: run Priority-Flood once, mark cells where filled > original + ε as lake, and set each lake's level to its spill height. For arid regions, scale the lake level by a precipitation/evaporation ratio (Fill-Spill-Merge-style). For rendering, the lake surface is a flat plane per watershed label at the spill elevation.
- For deltas: at a river mouth where φ exceeds a threshold and the coastal slope is low, branch distributaries with a random walk or local Priority-Flood biased seaward. Spacing should scale with backwater length (h/S) **[unverified scaling]**. Deposit a fan of land slightly above sea level.

### Gaps
- I did not verify Galloway 1975, the backwater-length avulsion scaling, or the Fill-Spill-Merge citation in this session.
- I found no graphics work on estuaries or tidal channel networks.

---

## 5. Sea level, coastlines, straits and islands

### Takeaway
In procedural terrain, the coastline is simply the sea-level isocontour of the heightfield. Its fractal dimension is inherited from the heightfield's spectrum: for fBm with Hurst exponent H, the isoline dimension is ≈ 2 − H **[unverified]**. Islands, peninsulas and straits fall out of choosing the sea level relative to the height distribution. Mandelbrot's measured targets are D = 1.25 (west coast of Britain), 1.15 (German land frontier), 1.14 (Spain–Portugal), 1.13 (Australia) and 1.02 (South Africa). Coastal processes in graphics exist mainly as heuristics (concave → beach, convex → cliff) plus Pytel's self-organisation thesis. I found no graphics paper on wave-energy coastal erosion or explicit strait generation.

### Cited Findings
- Mandelbrot, B. (1967), "How long is the coast of Britain? Statistical self-similarity and fractional dimension", *Science* 156(3775):636–638, DOI 10.1126/science.156.3775.636. Quoting Richardson's data: **D = 1.25 for the west coast of Britain** ("one of the most irregular in the world"), D = 1.15 for the German land frontier (~1899), D = 1.14 for Spain–Portugal, D = 1.13 for the Australian coast, and D = 1.02 for South Africa (one of the smoothest). Measured length L(G) ∝ G^(1−D) for ruler length G — [Mandelbrot 1967 PDF](https://gis.humboldt.edu/olm/courses/gsp_510/Articles/Mandelbrot1967.pdf).
- Fischer 2022 starts from authored coastlines, places outlets along coasts, and reproduced the coast shape of a real region (a section of Severo-Evensky) visually — [PDF](https://cgvr.cs.uni-bremen.de/papers/cgi22/CGI22.pdf).
- Génevaux 2013 starts from a user island contour Γ and uses the distance to Γ (η = 1500 m) and coast proximity to drive braided and delta labels. Crest slope λ can be weighted by distance to the coast to produce smooth valleys or sharp cliffs — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Genevaux13ToG.pdf).
- Pytel 2015 thesis: coastlines as procedural objects whose erosion features come from self-organised erosion that decides where erosion occurs and how it propagates, giving fractal-looking detail without explicit fractal synthesis — [UWSpace](https://uwspace.uwaterloo.ca/handle/10012/9085).
- Practitioner heuristics (non-academic): concave shoreline → beach, convex → cliff (World Machine forum). FlightGear WS30 places sea cliffs from mesh slope, plus beaches blending into translucent shallow water and breaking waves — [World Machine forum](https://forum.world-machine.com/t/procedural-beach-placement-concavity-vs-convexity-masking/6848); [FlightGear commit](https://git.nayala.duckdns.org/fly/fgdata/commit/fc8342887adf03c78388e65fbea9d1cf98db28c8). Low-authority sources, cited for practice only.
- **[unverified]** Theory: for a fractional-Brownian surface with Hurst exponent H (spectral slope β = 2H + 2 for the 2-D power spectrum), level-set contours have dimension D = 2 − H (Mandelbrot 1982 *The Fractal Geometry of Nature*; Voss 1988). D = 1.25 then needs H ≈ 0.75, and D = 1.13 needs H ≈ 0.87.
- **[unverified]** Real coastal processes as rules. Wave refraction concentrates energy on headlands (convex), causing cliff retreat, and disperses it in bays (concave), causing beach deposition. This drives headland–bay smoothing over time, lowering D. Longshore drift builds spits downdrift of headlands and bay mouths. Cliff retreat ∝ wave power / rock resistance. Sunamura (1992) *Geomorphology of Rocky Coasts* is the standard text, not verified here.

### Inferences
- Choose sea level as a quantile of the height histogram (e.g. 30–70% land). Straits appear where two landmasses' saddle (the col between them) lies just below sea level. You can **find straits deterministically** by running Priority-Flood/watershed on the *negated* sea-floor or on land components: compute the lowest saddle between connected land components (a merge-tree / persistence computation). A strait is a sea-level crossing of a low-persistence saddle. To create one, lower the saddle region below sea level; to close one, raise it. The same merge tree gives island counts versus sea level, which is an island-size distribution to validate (Korčák law, island-area exceedance ∝ A^−(D/2) **[unverified]**).
- Measure the coastline D by box counting or a Richardson ruler on the sea-level contour, and target 1.1–1.25. Heightfield spectral slope controls it; then apply a coastal-smoothing pass (erode convex, deposit concave) to move D down toward 1.1 where you want "mature" coasts.
- Peninsulas and islands: islands are land components not connected to the largest one. Peninsulas are land regions whose width-to-length ratio is small; a distance transform from the coast shows them.

### Gaps
- I found no peer-reviewed graphics paper on procedural straits or on sea-level-driven island generation.
- I found no graphics paper with a wave-energy coastal erosion model (wave refraction, longshore transport, spits).
- The 2 − H level-set result and the Korčák island-size law were not verified in this session.

---

## 6. Rendering flowing water in real time in a browser

### Takeaway
Two families work in WebGL2/WebGPU. (a) Kinematic: a flow map (a 2-D velocity texture from the D8/MFD field or the Peytavie primitives) drives two half-phase-offset scrolling normal maps with noise to hide pulsing. It costs about two extra texture fetches and ~21 ALU per pixel in Portal 2. (b) Dynamic: the GPU virtual-pipe shallow-water model (Mei, Decaudin & Hu 2007) in fragment or compute shaders gives real water depth and velocity for lakes, floods and shorelines. Foam is driven by velocity divergence, curl or "effervescence" near obstacles and confluences.

### Cited Findings
- Vlachos, A. (2010), "Water Flow in Portal 2", SIGGRAPH 2010 Advances in Real-Time Rendering course — [slides PDF](https://www.advances.realtimerendering.com/s2010/Vlachos-Waterflow(SIGGRAPH%202010%20Advanced%20RealTime%20Rendering%20Course).pdf):
  - The flow map is a texture giving a unique 2-D flow vector per point, authored in Houdini.
  - Distortion only looks good for a small amount (roughly the first ⅓ of UV space), so the animation is a short cycle.
  - **Two layers offset by half a phase** are cross-faded so each layer's reset is hidden.
  - **A noise texture offsets the phase per pixel** to remove the "pulsing" artefact.
  - Normal strength in tangent space is scaled down by flow speed (‖flow vector‖).
  - Debris uses an offset distortion range.
  - Cost compared with two scrolling normal maps: **+2 texture fetches (flow and noise), +21 ALU instructions**.
- Grimes, B. (2011), GDC "Making and Using Non-Standard Textures": the Portal 2 water extends the Left 4 Dead 2 shader, and the flow map warps UVs — [PDF](https://www.hlportal.de/files/GDC2011_BronwenGrimes_NonstandardTextures.pdf).
- Peytavie 2019 analytic water: elevation, velocity and effervescence as functions of (p, t). Effervescence drives white-water shading and foam near obstacles and after cascades, and floating leaves are advected by the velocity field. The GPU version uses a grid of primitives and a tessellation shader and reaches 70+ fps at 1080p — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Peytavie19CGF.pdf).
- Mei, X., Decaudin, P., Hu, B.-G. (2007), "Fast Hydraulic Erosion Simulation and Visualization on GPU", Pacific Graphics 2007, pp. 47–56, IEEE.
  - The shallow-water "virtual pipes" model (from O'Brien & Hyams 1995) stores terrain height, water height, suspended sediment, 4 outflow fluxes and velocity per cell.
  - Each step has 5 stages: water increment (rain or sources) → flow simulation → erosion/deposition → sediment transport → evaporation.
  - It runs entirely on the GPU.
  — [hgpu summary](https://hgpu.org/?p=2256); [slides](https://slidetodoc.com/fast-hydraulic-erosion-simulation-and-visualization-on-gpu/).
- **[unverified equations]** Pipe model per cell, outflow flux to neighbour L: f_L ← max(0, f_L + Δt·A·g·Δh_L/l), with Δh_L = (b + d) − (b_L + d_L). Scale the fluxes by K = min(1, d·l_x·l_y / (Σf·Δt)) to keep water non-negative. Δd = Δt·(Σf_in − Σf_out)/(l_x l_y). Velocity is derived from the average flux through the cell.
- Browser examples: LanLou123's "Webgl-Erosion" is cited as a WebGL implementation of the Mei pipe model. I found no WebGPU-specific published implementation — [getbutterfly three.js notes](https://getbutterfly.com/procedural-eroded-terrain-in-three-js-theory-techniques-field-notes/) (secondary).

### Inferences
- Rivers: bake a flow-map texture from the river graph. The direction is the spline tangent (or D8/MFD receiver direction), and the speed is u ∝ Q^0.1 downstream (nearly constant) modulated by local slope via Manning u ∝ S^(1/2)·d^(2/3). Render with the two-phase Vlachos shader. Add foam where |∇·u| or |∇×u| is high, at confluences (where the Strahler order changes), at steep reaches (Rosgen A/A+), and behind obstacles.
- Lakes and sea: flat planes at the spill level or sea level. For shoreline effects, use depth = water level − terrain height, sampled in the shader, to drive the shallow-water colour ramp, the foam line where depth < ε, and wave fade-out. Sea waves can be Gerstner/FFT waves with amplitude damped by depth.
- Use the pipe shallow-water simulation (WebGPU compute, or WebGL2 ping-pong float textures) only where dynamics matter: flooding a depression into a lake, a dam break, or a "rain then drain" demo. For 512² cells at a few substeps per frame this should be easily real-time on WebGPU **[estimate]**.

### Gaps
- I found no peer-reviewed WebGPU river or flow-map paper.
- I did not retrieve the exact Mei 2007 equations or performance numbers from the primary paper.
- I did not cover FFT ocean (Tessendorf 2001) in this session.

---

## What this means for the build

The build order follows from the papers. Generate or erode the heightfield, then run ε-Priority-Flood (lakes come out as filled depressions with spill levels), D8 receivers and drainage-area accumulation in a worker. Threshold the area into a Strahler-ordered spline graph, size every reach with discharge from area (verify the 0.42·A^0.69 units first), w ∝ Q^0.5, d ∝ Q^0.4 (or w = 18.8·d^1.41) and Manning velocity. Then carve Rosgen-style cross-sections into the heightfield. Low-slope reaches should be run through the Paris/Sylvester migration law (k = 0.164 m/d, ω = −1, γ = 2.5, f = 0.011, δt = 106 d) so meanders, oxbow lakes and avulsions emerge instead of being drawn. Sea level is a height quantile. Straits and islands should be decided on the land-component merge tree (lower or raise specific saddles), and deltas seeded at high-φ, low-slope mouths. For water, bake the river graph's velocity into a flow map for a two-phase Vlachos shader with foam from divergence, confluences and steep reaches, and use flat spill-level planes with depth-based shore effects for lakes and sea, reserving GPU virtual-pipe shallow water for dynamic flooding. To show it obeys the real laws, measure and display:
- Horton R_n, R_ℓ, R_a on middle orders (target 3–5, 1.5–3, 3–6)
- Hack h (0.57–0.60) and the area-exceedance exponent (≈0.43, τ ≈ 1.43), plus the consistency relation τ = 2 − h
- meander λ/w (≈6–12) and sinuosity (> 1.5 on meandering reaches)
- coastline box-counting dimension against Mandelbrot's 1.02–1.25 range
