# Stream power carves; Earth's statistics judge it

Research report for iori's procedural landscape work, compiled 2026-10-13 from five sets of research notes: terrain formation; rivers, lakes, coasts and straits; geology and materials; ecosystems, mortality and deadwood; and large regions, climate, LOD and look. It builds on the fractal paper research brief of 2026-10-11. Section 5 of that brief covers the Synthetic Silviculture model, which is already reimplemented in `papers/fractals/silviculture-*.js`. This report refers to it and does not repeat it. Every claim carries a source link. Derivations made by the researchers, rather than quoted from a paper, are labelled. Everything that could not be verified from a primary source is collected in the flag table at the end.

**BLUF.** The most Earth-like fully procedural landscape that can be built in a browser, with the fewest artistic liberties, comes from a pipeline staged by timescale. Each stage runs one published physical law with published constants in real units.

The relief comes first. It forms under tectonic uplift against the stream-power law, **dh/dt = U − K·A^m·S^n with n = 1 and m/n = 0.4–0.5**, plus hillslope diffusion (k_h ≈ 0.01–0.04 m²/yr) and a debris/talus threshold near 35–37°. This is solved implicitly on a WebGPU grid of about 1024² at 30–50 m. The nearest published GPU result forms **"a 300,000 year-old mountain" on a 2048² grid in under 10 s** with river and lake formation ([Jain et al. 2024](https://people.cs.uct.ac.za/~jgain/wp-content/papercite-data/pdf/jain2024.pdf)).

Rivers, lakes and coasts are then read off the eroded surface: Priority-Flood for lakes, D8 drainage, a Strahler graph, hydraulic geometry, and a kinematic meander-migration law whose every constant is published ([Paris et al. 2023](https://hal.univ-lorraine.fr/hal-04227965v1)). Rock, scree, soil, sand and snow are assigned by comparing slope against repose angles and by a strata-hardness function. That same function sets erodibility, so cliffs form where hard beds are.

Vegetation runs on Cordonnier-style per-cell layers at 10 m and 1-year steps ([Galin 2024 slides on Cordonnier et al. 2017](https://perso.liris.cnrs.fr/eric.galin/M2/Landscapes/3-erosion-simulation.pdf)). In that model vegetation raises the angle of repose and dead matter becomes humus. Background mortality is **about 1 %/yr** ([SORTIE parameters](https://bg.copernicus.org/preprints/bg-2019-210/bg-2019-210-supplement.pdf)). Logs decay exponentially, with a Q10 of 2.53 ([Mackensen et al. 2003](https://publish.csiro.au/BT/BT02014)), and stay on the ground for decades to centuries. Uprooting leaves pit-and-mound relief that persists for **more than 1000 years** ([Schaetzl & Follmer 1990](https://pubs.usgs.gov/publication/70016198)).

The surprise is on the validation side. None of the graphics papers measures the statistics that define real drainage. Those statistics are tight: **Hack h = 0.57–0.60, area-exceedance τ = 1.43 ± 0.02, Horton R_B = 3–5** ([Dodds & Rothman 1999](https://arxiv.org/pdf/cond-mat/9808244)), concavity θ ≈ 0.45 ([Mudd et al. 2018](https://esurf.copernicus.org/articles/6/505/2018/esurf-6-505-2018.pdf)), and coastline dimension 1.02–1.25 ([Mandelbrot 1967](https://gis.humboldt.edu/olm/courses/gsp_510/Articles/Mandelbrot1967.pdf)). An automated harness that scores the build against these numbers is therefore both cheap and new.

Four things stay open. No browser timing of stream-power erosion exists, so it has to be benchmarked. The common discharge formula 0.42·A^0.69 has a unit problem. Glaciation costs about 300 ms per step at 1024² on a workstation GPU. And the residual liberties are concentrated in four places: the uplift pattern, hydraulic-erosion constants, sub-grid amplification, and coastal processes.

---

## 1. Terrain formation: uplift against stream power sets the relief, hillslopes set the valleys

### One equation and one ratio make the mountains

The large-scale physically based generator in graphics is the uplift–stream-power model of Cordonnier et al. 2016, **dh/dt = u(p) − k·A(p)^m·s(p)^n**. Here u is the tectonic uplift rate, A is the drainage area (the area of every point with a strictly rising path ending at p), s is the slope, and k lumps lithology, vegetation and climate. The authors follow most geomorphology in taking **n = 1 and m = 0.5 (m/n ≈ 0.5)**. They state that the law holds at 10^5–10^7 yr and over tens to hundreds of km, where it "captures the way a complex relief emerges from a supposedly flat part of the continental crust" ([Cordonnier et al. 2016](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf)).

Their published scene uses these values ([Cordonnier et al. 2016](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf)):

| Parameter | Value |
|---|---|
| Domain | 50 × 50 km² |
| Maximum uplift U | **5.0×10⁻⁴ m/yr**, "the average uplift among earth mountains" |
| k | **5.61×10⁻⁷ yr⁻¹** (yr⁻¹ because m = 0.5), chosen so peaks reach about 2 000 m |
| Time step δt | **2.5×10⁵ yr** |

Relief depends only on the ratio, h_max = 2.244·u/k. The paper writes "km". The researchers checked the arithmetic: u/k ≈ 891, which gives 2 000 only if read in metres, so the paper's unit is an internal inconsistency (flagged).

At steady state the law gives **S = (U/K)^(1/n)·A^(−m/n)**, so Flint's slope–area law is built in with concavity θ = m/n ([Cordonnier et al. 2016](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf)). The parameters therefore have a measured target. Mudd et al. use a reference concavity **θ_ref = 0.45** and find best fits near it in example basins, though θ varies with lithology (basalt ≈ 0.7) ([Mudd, Clubb, Gailleton & Hurst 2018](https://esurf.copernicus.org/articles/6/505/2018/esurf-6-505-2018.pdf)). The defaults across the graphics papers all sit in this band: m = 0.5/n = 1 (2016), m = 0.4/n = 1 (the 2023–24 Inria papers), m = 0.8/n = 2 in Schott's released shader. The caution is that the stream-power coefficients "remain poorly constrained" even though the law reproduces profile concavity and knickpoint propagation ([ESurf discussion](https://esurf.copernicus.org/preprints/1/891/2013/esurfd-1-891-2013.pdf)).

The 2016 solver works on a graph, not a grid. Points are Poisson-disc sampled and joined by a constrained Delaunay triangulation, which the authors chose because it gives "more plausible directions for local streams". Each node's receiver is its lowest neighbour. Drainage A_k = a_k + Σ A_children is accumulated in O(N) by a reverse breadth-first traversal.

Local minima become lakes. Lakes are linked by "passes", the lowest adjacent node pair between two basins, and a priority queue grows trees of lakes outward from the border outlets in O(N + M log M). Without that step the network keeps local-minimum discontinuities indefinitely. Elevations then update implicitly from root to leaves:

h_i(t+δt) = [h_i(t) + δt·u_i + (k·A_i^m/‖p_i − p_j‖)·δt·h_j(t+δt)] / [1 + (k·A_i^m/‖p_i − p_j‖)·δt]

Here j is the receiver, already updated. Mountains appear within about 50 iterations and convergence takes about 200. Because the scheme is implicit, the iteration count does not grow with resolution ([Cordonnier et al. 2016](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf)).

Single-threaded C++ timings on a 3 GHz i7 were 0.031 s per step and 6.4 s to converge at 10 000 nodes, 0.401 s and 78 s at 90 000, and 1.273 s and 252 s at 160 000 ([Cordonnier et al. 2016](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf)). A sequential port of the graph method to JavaScript or WASM at about 10^5 nodes would therefore take tens of seconds (researchers' inference).

Three details matter for the build:

- **Stream power alone makes spikes.** In low-drainage areas it "produces unrealistic sharp and high peaks". The fix is to cap slopes at 30°, but a uniform 30° gives "very regular geometric valleys". The paper modulates the cap with 3-D Perlin noise between 6° and 54°, which is an artistic choice.
- **The uplift gradient matters more than the uplift shape.** Smooth gradients give straight parallel valleys; stepped uplift gives random valleys with jumps.
- **The final DEM is not purely physical.** It is either Gaussian splats of node heights or Génevaux's procedural ridge and valley primitives, which adds non-physical detail.

The paper is frank about validation: "Our validations are based only on our observations." It offers a side-by-side with the San Gabriel Mountains and a geologist co-author's visual check ([Cordonnier et al. 2016](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf)).

### Three GPU routes trade iteration count against porting effort

Braun & Willett's O(n) implicit scheme (FastScape) is the reference solver. Landlab's documentation says it "is nominally implicit and reaches a correct steady-state solution regardless of timestep length, but transient results are not fully timestep-independent" ([Braun & Willett 2013 via Landlab](https://landlab.readthedocs.io/en/latest/generated/api/landlab.components.stream_power.fastscape_stream_power.html)). Its details (stack ordering from base level, Newton–Raphson for n ≠ 1, parallelism across catchments) come from memory and were not re-read: Elsevier and HAL both blocked the fetch. Three GPU descendants matter for a browser.

**FastFlow** (Jain, Kerbl, Gain, Finley & Cordonnier 2024) does flow routing in O(log n) iterations by pointer jumping on the receiver tree, α[c] ← α[c]·α[recipient(c)] over log₂|T| rounds. It routes depressions in O(log² n), for a total of O(log n + log² L) with L depressions. On an RTX A6000:

- flow routing is 5× faster than Barnes 2019 or Schott 2023;
- depression routing is 34–52× faster than optimised parallel CPU code at 1024²;
- a pass takes under 55 ms up to 4096²;
- the headline run is the 2048² × 200-iteration mountain in under 10 s, with sediment deposition and lakes;
- implicit and semi-implicit deposition match visually at Δx = 16 m, Δt = 2000 yr, 100 iterations.

The code is PyTorch/TensorFlow with custom CUDA, routing uses a single flow direction only, and multiple flow directions are left as future work ([Jain et al. 2024](https://people.cs.uct.ac.za/~jgain/wp-content/papercite-data/pdf/jain2024.pdf)). Pointer jumping is gather-style, so it maps to WGSL compute. Depression routing (a minimum spanning tree over basins) is the hard part to port, and whether the CUDA kernels need atomics was not checked.

**Schott et al. 2023** model "in the uplift domain" and use "a fast yet accurate approximation of drainage area and flow routing" so that users can paint uplift interactively, warp it for folds and faults, and even invert a DEM back to an uplift map ([Semantic Scholar abstract](https://api.semanticscholar.org/graph/v1/paper/DOI:10.1145/3592787)). Their MIT-licensed shader (`spe_shader.glsl`) is a single gather-only ping-pong pass on 8×8 workgroups, so it ports to WebGPU directly and plausibly to WebGL2 fragment shaders. Per cell, each iteration does four things:

1. **Drainage.** It accumulates `stream = cellDiag + Σ₈ stream(q)·w(q→p)`, with multiple-flow-direction weights w = s^p / Σ s^p and p = 1. Drainage therefore spreads one ring of cells per iteration.
2. **Erosion.** It computes `k·noise·stream^0.8·slope^2.0` against the D8 receiver, giving m/n = 0.4.
3. **Hillslope and debris terms.** It optionally adds −k_h·∇²h and −k_d·slope.
4. **Update.** It sets h ← max(h − dt·(...), h_receiver) + dt·uplift. The clamp stands in for lake handling.

The shader defaults are uplift 0.03, k 0.0005, k_d 10, k_h 200 and dt 50, in unstated, apparently normalised units ([StreamPowerErosion](https://github.com/H-Schott/StreamPowerErosion)). FastFlow's authors criticise the approach on three counts. It propagates discharge "by a few cells on each time step" and so "requires a stable river network". That rules out time-dependent tectonics or deposition. It also needs many explicit steps, about as many as the longest river is long in cells (∼√n), and it fails on terrain with depressions or noisy uplift ([Jain et al. 2024](https://people.cs.uct.ac.za/~jgain/wp-content/papercite-data/pdf/jain2024.pdf)).

**Tzathas et al. 2024** use analytical solutions of the stream-power law, extended to 2-D with "a multigrid accelerated iterative process" plus landslides and hillslope terms. Time becomes "a slider that controls the aging of the input terrain" ([abstract](https://api.semanticscholar.org/graph/v1/paper/DOI:10.1111/cgf.15033)). The full text was not retrieved, so its runtimes are unknown.

### Hillslope diffusion and debris flow decide what a valley looks like

Stream power without hillslope transport has a known pathology. "When hillslope diffusion… is neglected, the choice m/n = 0.5 yields a curiously unrealistic result: the predicted landscape is invariant to horizontal stretching", so a 10 km² steady state can be stretched to match a 1000 km² one ([Kwang & Parker 2017](https://esurf.copernicus.org/articles/5/807/2017/esurf-5-807-2017.pdf)). Real landscapes have a scale. Fourier spectra of high-resolution California topography show "spectral power declines sharply above a frequency that corresponds roughly to hillslope length", along with a quasi-periodic ridge-and-valley wavelength "unlikely to occur in a random surface" ([Perron, Kirchner & Dietrich 2008](https://api.openalex.org/works/doi:10.1029/2007JF000866)). That spacing comes from competition between advective (fluvial) and diffusive (hillslope) transport ([Perron, Kirchner & Dietrich 2009](https://api.openalex.org/works/doi:10.1038/nature08174)). A 2024 discussion disputes the 2009 regression as grid-dependent and puts Gabilan Mesa's characteristic length at **62 m** by slope–area analysis ([EGUsphere 2024-2847 AC1](https://egusphere.copernicus.org/preprints/2024/egusphere-2024-2847/egusphere-2024-2847-AC1-supplement.pdf)). Adding k_h∇²h is therefore what makes valley spacing a matter of physics rather than of grid size.

Measured diffusivities are lower than the graphics defaults:

| Setting | Linear diffusivity | Source |
|---|---|---|
| Cinder cones, Golan Heights | 1–6 m²/ka (0.001–0.006 m²/yr) | [EGU2017-11969](https://meetingorganizer.copernicus.org/EGU2017/EGU2017-11969.pdf?pdf) |
| Humid temperate soil creep (course note) | ≈ 1.7×10⁻² m²/yr | [MIT OCW 12.163](https://ocw.mit.edu/courses/12-163-surface-processes-and-landscape-evolution-fall-2004/f5af48b6712c3dedbefbebbe699cd803_week7_8_1.pdf) |
| Inria graphics papers | k_h = 0.01–0.05 m²/yr | [Jain et al. 2024 (debris flow)](https://www.cs.purdue.edu/homes/bbenes/papers/Arymaan24ToG.pdf); [Cordonnier et al. 2023](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier23ToG.pdf) |

How diffusivity varies with climate is contested. The Golan study finds it falling with precipitation, or humped with a peak at 400–600 mm, while a 2025 reply attributes "D increases with MAP" to Perron 2017 ([egusphere-2025-1585 AC3](https://egusphere.copernicus.org/preprints/2025/egusphere-2025-1585/egusphere-2025-1585-AC3-supplement.pdf)).

Thermal erosion moves material wherever slope exceeds the talus angle: **∂h/∂t = −k(s − tan θ) if s > tan θ**. Material goes to the lower 8-neighbours in proportion to s_kⁿ / Σ s_iⁿ, from n = 1 (diffusive) to n → ∞ (steepest descent) ([Galin course slides](https://perso.liris.cnrs.fr/eric.galin/M2/Landscapes/3-erosion-simulation.pdf)). Graphics uses 30° ([Cordonnier et al. 2016](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf); [Šťava et al. 2008](https://www.cs.purdue.edu/homes/bbenes/papers/Stava-2008-Interactive_Terrain_Modeling_Using_Hydraulic_Erosion.pdf)) or 37° ([Cordonnier et al. 2023](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier23ToG.pdf)). Its known defect is that it "yields unrealistically uniform slopes". Steep low-drainage terrain on Earth is instead shaped by debris flow, which leaves scars and fans.

Jain, Benes & Cordonnier 2024 put debris flow into the same explicit GPU loop as fluvial erosion. Their fluvial law, taken from Yuan et al. 2019, adds deposition: **F = −k_f·Q_w^m·‖∇z‖^n + k_d·Q_s/Q_w**. Q_w is upstream precipitation (equal to drainage area when p = 1) and Q_s is upstream sediment flux. They also use hillslope diffusion H = k_h∇²z and a thermal term E_th = k_th(‖∇z‖ − tan θ_c)₊, with z = bedrock + sediment + debris ([Jain, Benes & Cordonnier 2024](https://www.cs.purdue.edu/homes/bbenes/papers/Arymaan24ToG.pdf)).

| Parameter | Value |
|---|---|
| U | 0.0012 m/yr |
| k_f | 0.0007 m^(1−2m)/yr |
| m, n | 0.4, 1 |
| k_d | 0.01 |
| k_h | 0.04 m²/yr |
| k_df | 0.001 |
| α, β | 0.08, 1 |
| k_τ | 0.3 |
| α_τ, β_τ | 0.25, 1 |
| k_th | 0.005 m/yr |
| θ_c | 37° |

On a 1024² grid at Δx = 8 m, Δt = 10–300 yr is stable, and 1 600 iterations took **32 s (0.02 s/iteration)** in PyTorch on an RTX A6000. Lakes are handled as w = max(z, z_outflow), with sediment deposited below water level ([Jain, Benes & Cordonnier 2024](https://www.cs.purdue.edu/homes/bbenes/papers/Arymaan24ToG.pdf)).

### Water and ice: hydraulic erosion is a detail pass, glaciation is out of budget

Shallow-water "virtual pipe" erosion (Mei, Decaudin & Hu 2007) is a fully local five-step stencil:

1. rain, d₁ = d + Δt·r·K_r;
2. pipe flux, f_L ← max(0, f_L + Δt·A·g·Δh_L/l), scaled by K = min(1, d·l_x·l_y/(Σf·Δt)) so no cell outputs more water than it holds;
3. erosion or deposition against capacity C = K_c·sin(α)·|v|;
4. semi-Lagrangian sediment advection;
5. evaporation, d ← d(1 − K_e·Δt).

Jakó & Tóth restate it with Mei-derived defaults ([Jakó & Tóth 2011](https://www.old.cescg.org/CESCG-2011/papers/TUBudapest-Jako-Balazs.pdf)): Δt 0.02, K_r 0.012, K_e 0.015, A 20, K_c 1, K_s 0.5, K_d 1. That source is a student conference paper, and it prints "max" where the intent is a ≤ 1 scaling. It ran at **3.84 ms per iteration at 512² and 15.5 ms at 1024²** on a 2008 Radeon HD4870. Šťava et al. couple slow-flow dissolution with fast-flow force-based erosion, add bank collapse at 30° and up to four material layers, and reach "at least 20 fps… for scenes with grid resolution of 2048 × 1024 and four layers" on a GeForce 8800 GTX ([Šťava et al. 2008](https://www.cs.purdue.edu/homes/bbenes/papers/Stava-2008-Interactive_Terrain_Modeling_Using_Hydraulic_Erosion.pdf)).

Two limits apply. The hydraulic constants are dimensionless game units with no geophysical calibration, and the model works on rain-event timescales, so it carves gullies but cannot build ranges. Droplet erosion is worse for a seeded build. WGSL has no float atomics, so WebGPU ports store heights as fixed-point i32 with atomicAdd ([Cinevva blog](https://app.cinevva.com/blog/2026-05-13-open-world-browser-part-27-island-and-terrain)), and the resulting race-order dependence is non-deterministic.

Glacial erosion produces the landforms stream power cannot: U-shaped and hanging valleys, cirques, arêtes, horns, fjords, and over-deepened and perched lakes. Cordonnier et al. 2023 solve ice mass conservation ∂h/∂t = M − ∇·(ū h), with mass balance tied to the equilibrium-line altitude (ELA). Velocities come from a CNN trained on a higher-order Stokes energy, with Glen viscosity p = 4/3 and B = 2.9×10⁵ Pa·yr^(1/3). They reject the shallow-ice approximation because it "carves deep narrow defiles". Erosion has two terms:

- **abrasion**, ∂z/∂t = −k_e‖u_s‖^l with l = 2.02 and k_e = 1.3×10⁻⁷ to 1.1×10⁻⁶ m^(1−l)·yr^(l−1);
- **quarrying**, ∂z/∂t = −k_q‖u_s‖·Q with k_q = 3.2×10⁻⁵ to 2.6×10⁻⁴.

These run alongside fluvial (m = 0.4), hillslope (k_h = 1–5×10⁻² m²/yr) and debris (θ_c = 37°) terms. The cost is **300 ms per step at 1024²** (87% of it ice flow), plus 1.7 s of CPU drainage every 20 steps on an RTX A5000-class GPU. A 16 × 16 km terrain at 32 m takes under 5 minutes. Validation was qualitative, plus the shift of the hypsometric maximum toward the ELA ("glacial buzzsaw") predicted by Egholm et al. 2009 ([Cordonnier et al. 2023](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier23ToG.pdf)).

**What this means for the build.** Replace the current environment terrain with uplift and stream power in physical units. Today `silviculture-envsim.js` uses a fractional-Brownian diamond-square heightfield of 128² cells over 200 m with 50 m of relief, and multiplies climate elevation by 50 so that zonation can appear at all. A stream-power region of 30–50 km with about 2 000 m of relief removes that factor-of-50 liberty, because lapse-rate zonation then happens at true scale.

Use n = 1 and m = 0.45, which matches θ_ref. Choose U/K from the target relief, then add k_h ≈ 0.01–0.04 m²/yr hillslope diffusion and the Jain 2024 debris/thermal term at θ_c ≈ 35–37°. A FastFlow-style implicit solver on 1024² at 30–50 m with 100–300 iterations is the target. The Schott single-pass shader is the quick first port: thousands of iterations, which still add up to seconds at 1024² if each costs 1–5 ms (the researchers' estimate).

Run Mei hydraulic erosion only as a short detail pass. Skip glaciation, or label any hypsometric "buzzsaw" proxy (flattening near a chosen ELA) as a liberty.

---

## 2. Rivers, lakes, coasts and straits: drainage laws are tight enough to test against

### Priority-Flood turns any heightfield into one that drains

The standard front end has four steps: fill or breach depressions, route flow, accumulate area, threshold into channels. Priority-Flood floods the DEM inward from its edges with a min-heap. Each unvisited neighbour of a popped cell is raised to at least that cell's elevation, so every cell drains, in **O(n) for integer and O(n log n) for floating-point data**. The "improved" variant puts cells being filled inside a depression on a plain FIFO queue and ran up to 37% faster. An ε variant raises each filled cell slightly above its parent so flats get a gradient. The same queue gives watershed labels for free ([Barnes, Lehman & Mulla 2014](https://ar5iv.arxiv.org/html/1511.04463)). Landlab's `LakeMapperBarnes` uses this to "temporarily fill depressions and reroute flow across them", which treats each depression as a lake with a spill point ([Landlab](https://landlab.readthedocs.io/en/latest/reference/components/lake_fill.html)). Peytavie et al. 2019 fill; Paris et al. 2023 breach "to remove unwanted pits" ([Peytavie et al. 2019](https://www.cs.purdue.edu/homes/bbenes/papers/Peytavie19CGF.pdf); [Paris et al. 2023](https://hal.univ-lorraine.fr/hal-04227965v1)).

For routing, D8 yields a tree, which is what a vector river graph needs. Peytavie uses Freeman's multiple-flow-direction method for drainage area ([Peytavie et al. 2019](https://www.cs.purdue.edu/homes/bbenes/papers/Peytavie19CGF.pdf)). Tarboton's D-infinity sits between the two ([Tarboton 1997](https://digitalcommons.usu.edu/cee_facpub/2507)); its facet mechanics and Freeman's exponent are flagged as unverified. Channels are cells above an area threshold. Nodes go where more than one channel contributes, and cubic splines join them. A leaf has Strahler order 1, two order-k branches meeting give k + 1, and otherwise the maximum is kept ([Génevaux et al. 2013](https://www.cs.purdue.edu/homes/bbenes/papers/Genevaux13ToG.pdf)). At 1024², the whole fill → D8 → accumulate → Strahler chain should run in well under a second in a Web Worker (researchers' estimate, unmeasured).

### Two exponents describe every real river network

Dodds & Rothman's unified table gives the real-network ranges listed below ([Dodds & Rothman 1999](https://arxiv.org/pdf/cond-mat/9808244)):

| Statistic | Real networks | Scheidegger random model |
|---|---|---|
| Horton bifurcation ratio R_n | **3.0–5.0** | 5.20 |
| Area ratio R_a | **3.0–6.0** | 5.20 |
| Length ratio R_ℓ | **1.5–3.0** | 3.00 |
| Tokunaga T1 | **1.0–1.5** | 1.30 |
| Main-stream fractal dimension d | **1.1 ± 0.01** | 1 |
| Basin fractal dimension D | **1.8 ± 0.1** | 3/2 |
| Hack exponent h | **0.57–0.60**; very large basins tend back toward ½ | 2/3 |
| Area distribution τ, with P(A > a) ∼ a^−(τ−1) | **1.43 ± 0.02** | — |
| Length distribution γ | **1.8 ± 0.1** | — |

Under uniform drainage density only two of these exponents are independent. They are tied by h = ln R_ℓ / ln R_n, τ = 2 − h, γ = 1/h = D/d, and h = d/D, which replaces Mandelbrot's h = d/2 ([Dodds & Rothman 1999](https://arxiv.org/pdf/cond-mat/9808244)). Two measurement rules follow from the same paper:

- **Measure Horton ratios on middle orders.** For a synthetic network built with R_n = R_a = 4, fits over orders 1–3 gave R_n = 2.92 and R_a = 5.29, while fits over orders 4–8 converged to about 4.0.
- **Count networks as space-filling.** Their fractal dimension D = log R_B / log R_L is "usually found to be approximately 1.9" ([Tarboton](https://hydrology.usu.edu/dtarb/egs01fractalabs.html)), and they are "practically space filling with fractal dimension near 2" ([Tarboton, Bras & Rodríguez-Iturbe 1988](https://api.openalex.org/works/doi:10.1029/WR024i008p01317)).

An IAHS compilation gives R_B 3.3–4.7 and R_L 1.6–2.4, with one basin at R_B = 4.14, R_L = 2.15, D = 1.93 ([Cudennec et al.](https://iahs.info/uploads/dms/13454.51-422--430-S7-47-Cudennec-et-al.pdf)).

Optimal channel networks (OCNs) show why Horton ratios are a weak test. OCNs are loopless spanning trees that minimise total energy dissipation, and their local minima are stationary solutions of the landscape-evolution equation. Greedy search, which accepts a random link change only if dissipation falls, reaches local minima whose area-exceedance exponent is **0.43** (mean over 128 OCNs; 0.44 for the Tanaro basin). Those local minima match nature. Annealing to the ground state gives mean-field exponents that do not, so real networks are "feasible optimality". Eden growth and random-walk networks match Horton ratios but fail stricter statistics ([Rinaldo et al. 2014](https://pmc.ncbi.nlm.nih.gov/articles/PMC3932906)). The discriminating tests are therefore the exponents h and τ, the consistency relation between them, and the spectrum. Horton ratios alone are not enough.

### Four graphics templates, none validated against those exponents

**Génevaux et al. 2013** grow the river graph first, inland from a sketched island contour, using a stochastic grammar. A stream of order n continues with probability P_c, makes a symmetric Strahler junction (two order-(n−1) branches) with P_s, or an asymmetric one with P_a. With (P_c, P_s, P_a) = (0.2, 0.7, 0.1) about 82% of streams are Strahler-1. Spacing constraints are:

- distance to the coast > η = 1500 m;
- edge separation > σ·f(s), with σ = 1500 m;
- a Lipschitz slope bound;
- edge length 2000 m.

Crest heights are max(a_z, b_z, c_z) + λ·d with λ ∈ [0, 0.25]. Rivers are typed by the Rosgen scheme, mouths with flow above a threshold become deltas, and the graph takes 0.1–5.3 s for terrains of 970–3386 km². Validation was visual only ([Génevaux et al. 2013](https://www.cs.purdue.edu/homes/bbenes/papers/Genevaux13ToG.pdf)).

**Peytavie et al. 2019** start instead from any heightfield at 1–30 m per pixel. They run Priority-Flood, MFD drainage, a threshold, a spline graph, discharge φ, a per-edge stream power P = A^(1/2)·S, the Strahler order and a Rosgen type. Low-slope, moderate-flow edges meander; steep ones are straight with drops; cross-sections are scaled to area = φ/‖u‖. Water is an analytic "blend-flow tree" giving elevation, velocity and "effervescence" (foam) as functions of position and time. It runs at more than 70 fps at 1080p with tens of thousands of primitives ([Peytavie et al. 2019](https://www.cs.purdue.edu/homes/bbenes/papers/Peytavie19CGF.pdf)).

**Fischer, Boeckers & Zachmann 2022** grow artificial drainage basins from coastal outlets, spawn lakes along rivers sized by river strength, and make deltas by re-growing a local basin with several coastal outlets. A 2048² grid takes under 25 s ([Fischer et al. 2022](https://cgvr.cs.uni-bremen.de/papers/cgi22/CGI22.pdf)).

**Paris et al. 2023** add physical meander migration (next subsection).

The two flow-first templates fit different starting points. Peytavie's front end is grid algorithms and its water maps onto a shader, so it fits a build that starts from an eroded heightfield. Génevaux fits a sketched island. Paris 2023 validates meander wavelength and sinuosity, but none of the four validates Hack, τ or Horton.

### Channel size follows discharge, and meander wavelength follows width

All four papers convert drainage area to mean discharge with **φ = 0.42·A^0.69** (Dunne & Leopold 1978), a "not preserved" volume that already includes evaporation and infiltration ([Génevaux et al. 2013](https://www.cs.purdue.edu/homes/bbenes/papers/Genevaux13ToG.pdf)). The researchers checked the units. With A in m² as printed, 1 km² gives about 5 800 m³/s, which is absurd. With A in km², 1 km² gives 0.42 m³/s and 1 000 km² gives about 49 m³/s, both plausible humid-climate means. So **the coefficient assumes km²**. This is a derivation, flagged until Dunne & Leopold is checked.

Downstream hydraulic geometry gives width, depth and velocity as power laws of discharge ([Leopold & Maddock 1953](https://pubs.usgs.gov/publication/pp252)). The widely used exponents (w ∝ Q^0.5, d ∝ Q^0.4, u ∝ Q^0.1) are from memory. The width exponent 0.5 is corroborated by Paris's w ∝ A^0.5, and Paris uses **w = 18.8·d^1.41** from Konsoer et al. 2013 ([Paris et al. 2023](https://hal.univ-lorraine.fr/hal-04227965v1)). Manning's equation, u = (1/n)·R^(2/3)·S^(1/2) with n ≈ 0.025–0.05, closes the depth given Q, w and S. It is standard, but flagged as unverified in this session.

Meander geometry has two references. Wavelength is λ = a·w^b with **6.28 ≤ a ≤ 12.34 and 1 ≤ b ≤ 1.13**, with real λ falling within −40% to +65% of the estimate ([Paris et al. 2023](https://hal.univ-lorraine.fr/hal-04227965v1)). The USGS states it as **7 to 12 channel widths** ([Leopold & Wolman, PP 282-B](https://pubs.usgs.gov/pp/0282b/report.pdf)). The often-quoted "10–14 w" was not found in a primary source. A river is meandering when sinuosity exceeds 1.5.

Paris et al. implement the Howard–Knutson / Sylvester kinematic law, in which centreline points move along their normal: p_k(t+δt) = p_k + n_k·μ·δt. The constants are:

| Quantity | Value |
|---|---|
| Time step δt | **106 days** (up to 1 yr is stable) |
| Local rate | μ₀ = w·k·φ, with **k = 0.164 m/day** and φ the curvature |
| Global rate | μ = ω·μ₀ + σ^(−2/3)·γ·(exponentially weighted upstream integral of μ₀) |
| ω, γ | **−1, 2.5** |
| Decay α | **2f/d**, with friction **f = 0.011** |
| Resampling | δp = 50 m, which must be ≤ w |
| Avulsion | probability 0.05, 45° initial angle, slope threshold 0.05 |
| Crevasse | probability 0.05 where curvature > 0.1 |
| Migration damping | slopes above s₀ = 0.15 damp migration |

Cutoffs form oxbow lakes. With w = 50–200 m the model yields σ = 1.9–3.8 and λ = 710–2160 m, and it stays interactive up to about 5 000 points. It has no levees or vertical aggradation ([Paris et al. 2023](https://hal.univ-lorraine.fr/hal-04227965v1); [meanderpy](https://csdms.colorado.edu/wiki/Model:Meanderpy); [Howard & Knutson 1984](https://csdms.colorado.edu/wiki/Model:Meanderpy)). Because μ₀ scales with w, λ/w stays constant across river sizes, which is exactly the Leopold–Wolman invariant (researchers' inference).

### Lakes are filled depressions; deltas are still rules

Lakes come free from Priority-Flood. A depression's filled level is its spill elevation, and filled minus original is the lake depth ([Barnes et al. 2014](https://ar5iv.arxiv.org/html/1511.04463); [Landlab](https://landlab.readthedocs.io/en/latest/reference/components/lake_fill.html)). Endorheic lakes need a water balance that decides whether a depression fills to its spill point. The usual citation for that, Barnes et al.'s Fill-Spill-Merge, is flagged. In graphics, deltas are rules: Génevaux's flow threshold at the mouth, Fischer's local basin regrowth, and an L-system skeleton plus cGAN ([ResearchGate](https://www.researchgate.net/publication/357609433_A_Modular_Generative_Approach_for_Realistic_River_Deltas_When_L-Systems_and_cGANs_Meet)). The Galloway delta classes and the backwater avulsion length L_b ≈ h/S would be the physical rules to add, but both are unverified. No graphics paper simulates delta morphodynamics, estuaries or tidal channels.

### Coastlines and straits fall out of sea level and a merge tree

In a procedural terrain the coastline is the sea-level contour, so its roughness is inherited from the heightfield. Mandelbrot's targets, from Richardson's ruler data with L(G) ∝ G^(1−D), are ([Mandelbrot 1967](https://gis.humboldt.edu/olm/courses/gsp_510/Articles/Mandelbrot1967.pdf)):

| Boundary | D | Note |
|---|---|---|
| West coast of Britain | **1.25** | "one of the most irregular in the world" |
| German land frontier | 1.15 | |
| Spain–Portugal frontier | 1.14 | |
| Australian coast | 1.13 | |
| South African coast | **1.02** | one of the smoothest |

The level-set relation D = 2 − H for an fBm surface, and the Korčák island-area law, are unverified.

No peer-reviewed graphics paper models wave-energy coastal erosion or generates straits. The practice is heuristics: concave shores become beaches and convex shores cliffs ([World Machine forum](https://forum.world-machine.com/t/procedural-beach-placement-concavity-vs-convexity-masking/6848)). The closest research is Pytel's self-organised coastal erosion thesis ([Pytel 2015](https://uwspace.uwaterloo.ca/handle/10012/9085)).

The researchers propose a deterministic method for straits. Compute the merge tree of land components as sea level varies (a persistence computation). A strait is a low-persistence saddle just below sea level; lowering or raising that saddle opens or closes it. The same tree gives island counts against sea level.

### Flowing water renders from a flow map

The Portal 2 technique remains the cheap standard. A flow-map texture holds one 2-D vector per point. Two normal-map layers, half a phase apart, are cross-faded so each reset is hidden, and a noise texture offsets the phase per pixel to remove pulsing. Normal strength scales down with flow speed. The cost over two scrolling normal maps is **+2 texture fetches and +21 ALU instructions** ([Vlachos 2010](https://www.advances.realtimerendering.com/s2010/Vlachos-Waterflow(SIGGRAPH%202010%20Advanced%20RealTime%20Rendering%20Course).pdf)). Peytavie's "effervescence" is the physically keyed foam signal ([Peytavie et al. 2019](https://www.cs.purdue.edu/homes/bbenes/papers/Peytavie19CGF.pdf)). The Mei pipe model gives real depth and velocity where dynamics matter, such as filling a basin or a dam break ([Mei et al. 2007](https://hgpu.org/?p=2256)).

**What this means for the build.** Read the hydrology off the eroded surface, in this order:

1. ε-Priority-Flood, D8 receivers, area accumulation and Strahler order, in a worker.
2. Lakes as flat planes at the spill height of each watershed label.
3. A spline river graph. Size each reach with φ = 0.42·A^0.69 (A in km², pending verification), w = 18.8·d^1.41 with w ∝ A^0.5, and Manning velocity, then carve Rosgen-type cross-sections.
4. Paris/Sylvester migration on low-slope reaches, so that meanders, oxbows and avulsions emerge rather than being drawn.
5. Sea level as a quantile of the height distribution, with straits and islands decided on the land-component merge tree.
6. Deltas seeded at high-φ, low-slope mouths. Label this as a rule.

Render rivers with a baked flow map and the two-phase shader, with foam at confluences (where Strahler order changes), at steep reaches and where divergence is high. Measure h, τ, the consistency τ = 2 − h, Horton ratios on orders 4 and up, λ/w, sinuosity and the coastline box-counting dimension on every generated region. That measurement step is what the graphics literature has not done.

---

## 3. Geology and materials: one strata function, a handful of repose angles

### Material stacks turn per-layer constants into cliffs and benches

The representation that makes geology cheap is a 2-D grid of per-cell material stacks. It costs k·n² memory for k layers instead of n³ voxels. Beneš & Forsbach's version stores up to 10 layers per cell, each with density, water, gas and deposit-ability, and turns eroded hard material into movable "dust" ([Beneš & Forsbach 2001](https://www.cs.purdue.edu/homes/bbenes/papers/Benes01SCCG.pdf)). Arches uses air, water, sand, bedrock and rocks. Overhangs are air between bedrock layers, and a cave scene equivalent to 6 billion voxels fits in under 21 MB. Stabilisation moves the excess above the repose slope, Δh̃ = max(0, Δh − s·tan α), with **sand at 30–35° and rocks at 40–45°** ([Peytavie et al. 2009, Arches](https://perso.liris.cnrs.fr/egalin/Articles/2009-arches.pdf)).

Cordonnier et al. 2018 tie the strata to the uplift:

- **Crust and folds.** Users move tectonic plates. A viscous crust simulation (1024², about 10 ms on GPU) gives uplift, and folds of n = 2–10 layers, 0.1–5 km thick with fold wavelengths of 0.5–20 km, refine it.
- **Sub-layers.** Each layer is split into 1–10 sub-layers "of varying resistance against erosion".
- **Erosion.** Stream power with k = 2.5×10⁻⁷ to 8×10⁻⁷ yr⁻¹ and mean uplift 5.0×10⁻⁴ m/yr, plus a landslide term λ(s − tan θ) with λ = 10² m/yr.
- **Per-layer constants.** **Weak layers get high k and θ = 30°; hard layers low k and θ = 50°.** That pairing is what produces stepped cliffs with folded strata.
- **Surface rock lookup.** The surface rock type is looked up from the pre-deformation elevation of each point, which shows "the fold as texture on a cliff wall".
- **Cost.** 100 × 100 km with 10 000 vertices runs at about 10 ms per iteration, and the final 10⁶-vertex pass takes 4 s per step × 100 steps.

([Cordonnier et al. 2018](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier18TVCG.pdf).)

Terrain Amplification with Implicit 3D Features adds caves, arches, stratified cliffs and hoodoo fields as Poisson-placed implicit primitives ([Paris et al. 2019](https://hal.archives-ouvertes.fr/hal-02273097)). The researchers draw out the unifying inference: mesas, cuestas and hoodoos are the same mechanism at different dips and scales, a hard caprock with high θ and low k over a soft layer. A browser can approximate Cordonnier's lookup with a 1-D strata function, hardness(z + fold(x, y)). It modulates k and θ during erosion and doubles as a 1-D cliff-colour texture.

### Repose angles are the shared thresholds

| Material | Angle | Source |
|---|---|---|
| Natural talus, Earth (King George Island) | 28.0–33.4° | [Miscellanea Geographica 2025](https://reference-global.com/article/10.2478/mgrsd-2025-0032) |
| Natural talus | approaches ≈ 35°; below repose until the wall is buried | [Francou & Manté](https://horizon.documentation.ird.fr/exl-doc/pleins_textes/divers19-08/010048761.pdf) |
| Sand (graphics) | 30–35° | [Arches](https://perso.liris.cnrs.fr/egalin/Articles/2009-arches.pdf) |
| Sand (Desertscapes code) | tan = 0.60 (≈ 33°) | [Desertscapes code](https://github.com/aparis69/Desertscapes-Simulation) |
| Rock piles (graphics) | 40–45° | [Arches](https://perso.liris.cnrs.fr/egalin/Articles/2009-arches.pdf) |
| Weak / hard strata | 30° / 50° | [Cordonnier et al. 2018](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier18TVCG.pdf) |
| Dry sand / wet sand / gravel / soil / snow (engineering, method-dependent) | 34° / 45° / 45° / 30–45° / 38° | [Wikipedia: Angle of repose](https://en.wikipedia.org/wiki/Angle_of_repose) (secondary) |

### Each rock type has one structural signature

Each rock type is set by its jointing.

- **Basalt** forms columns of a few cm to about 3 m in diameter and up to 30 m tall. They have **3–8 sides, most often 6**: regular colonnade below, irregular entablature above ([Wikipedia, citing Oregon State](https://en.wikipedia.org/wiki/Columnar_jointing)). Column width follows a Péclet scaling, Pe = L·v/D ≈ 0.3 ± 0.2 with D_T ≈ 6.5×10⁻⁷ m²/s, so width is inversely proportional to the speed of the cooling front ([Goehring, Mahadevan & Morris 2009](https://pmc.ncbi.nlm.nih.gov/articles/PMC2615021/)).
- **Limestone pavement** splits into clints and grikes. In the Burren grikes reach about 80 cm wide and 2 m deep, and most clints are 1–5 m² ([Burren Geopark](https://www.burrengeopark.ie/wp-content/uploads/2013/04/Geology-Sheet-11-Limestone-Pavement.pdf)). At Farleton Knott the mean clint is 2.75 × 1.05 m with grikes about 1.2 m deep ([Scottish Geology Trust 815](https://geoguide.scottishgeologytrust.org/page/815)). At Asby Scar most grikes are 100–200 mm wide ([geoguide 834](https://geoguide.scottishgeologytrust.org/page/834.pdf)).
- **Granite** develops sheeting joints parallel to the surface. Their spacing grows from cm near the surface to metres at depth, down to about 100 m, which rounds landforms into domes ([GW-Project](https://books.gw-project.org/structural-geology-applied-to-fractured-aquifer-characterization/?p=1690)).

The cheap constructions are researcher inferences, since no graphics paper on columnar jointing was found:

| Rock | Construction |
|---|---|
| Basalt | 2-D Worley cells at 0.3–1 m, extruded, with F2 − F1 edge darkening and stria bands |
| Limestone | Worley cells at 1–3 m on slopes under about 10°, with the F2 − F1 < w band (w ≈ 0.1–0.8 m) dropped 1–2 m |
| Granite | diffusion-smoothed domes plus depth-following sheet bands |
| Sandstone | the strata function plus tilted cross-bed bands |
| Schist | anisotropic noise along a foliation direction |

Boulders and scree use the Arches recipe. Poisson-placed Voronoi cells are eroded more where they are far from their contact points, giving rounded rocks that "nicely pack together" with no physics ([Arches](https://perso.liris.cnrs.fr/egalin/Articles/2009-arches.pdf)). An aperiodic corner-cube tiling then removes repetition ([Peytavie et al. 2009, rock piles](https://perso.liris.cnrs.fr/egalin/Articles/2009-aperiodic.pdf)). Tiles of 50–70 rocks took 19–44 s to precompute once, and instancing 2 000–6 000 rocks took 0.4–0.9 s.

### Soil depth and wetness come from curvature and drainage

Soil production declines exponentially with soil depth h: **P = P₀·e^(−k·h)**. Heimsath et al. call this the "first empirical soil production function", measured from cosmogenic nuclides ([Heimsath et al. 1997](https://ideas.repec.org/a/nat/nature/v388y1997i6640d10.1038_41056.html)). Typical values are P₀ = 0.08–2.0 mm/yr in northern California and 0.05–0.14 mm/yr in SE Australia, with k ≈ 2–4 m⁻¹ ([Wikipedia summary](https://en.wikipedia.org/wiki/Soil_production_function), flagged as secondary). Rapidly eroding ranges exceed these values ([Heimsath et al. 2005](https://geodynamicsprogram.whoi.edu/wp-content/uploads/sites/14/2018/10/Heimsath_et_al_05_79065.pdf)). Near a critical slope the flux becomes nonlinear, q_s = K·S/(1 − (S/S_c)²) ([Roering, Kirchner & Dietrich 1999, via Landlab](https://landlab.readthedocs.io/en/latest/reference/components/taylor_nonlinear_hillslope_flux.html)). Wetness is the topographic wetness index **TWI = ln(a/tan β)**, with a the specific catchment area (area per unit contour width). It is undefined on flats and better computed with the downslope gradient ([TauDEM](https://hydrology.usu.edu/taudem/taudem5/help53/TopographicWetnessIndex.html); [Ali et al. 2013](https://water.usask.ca/hillslope/documents/pdfs/2013/13-16%20Ali%20et%20al%202013%20A%20comparison%20of%20wetness....pdf)).

The researchers derive a closed-form steady-state soil depth. Balance production against linear-diffusion erosion E = −D∇²z:

**h = (1/k)·ln(P₀ / max(ε, −D·∇²z))** on convex ground

On concave ground h accumulates to a cap, and where slope exceeds about 35–40° h = 0. With k = 2–4 m⁻¹ this gives roughly 0–1.5 m of soil, from one Laplacian and one log per texel.

### Sand and snow need rules, not simulations, for a static view

Desertscapes is a two-layer cellular model of bedrock and sand ([Paris et al. 2019](https://perso.liris.cnrs.fr/aparis/public_html/projects/paris2019_Deserts.html)). Its MIT reference code moves sand as follows:

- slabs of **0.1 m** hop downwind, up to 3 bounces;
- deposition probability is 0.6 on sand and 0.4 on bedrock, raised by vegetation, and 1.0 in wind shadow;
- the wind-shadow angle is 5–15°;
- sand avalanches at **tan = 0.60**;
- bedrock is stabilised at tan = 2.5 when abrasion is on.

Neither the code nor the project page mentions ripples ([code](https://github.com/aparis69/Desertscapes-Simulation)). Snow is simulated by Cordonnier et al. 2018 as heightfield layers of different snow types, driven by sun, temperature and wind and moved by avalanches, in real time over 10 × 10 km ([Cordonnier et al. 2018, snow](https://diglib.eg.org:443/handle/10.1111/cgf.13379)). Its ancestors are Fearing's upward-shot accumulation particles followed by a stability pass ([Fearing 2000](https://www.cs.ubc.ca/labs/imager/th/2000/Fearing2000/)) and Hsu & Wong's inclination × stickiness × exposure shading function ([Hsu & Wong 1995](https://webarchive.lib.cuhk.edu.hk/20210324161456mp_/http://www.cse.cuhk.edu.hk/~ttwong/papers/dust/dust.html)). For a static scene the snow signature reduces to a mask: altitude above the snowline × a slope gate near 38° × exposure.

### Seven materials from five derived maps

Five maps are derived from the heightfield: slope, curvature (for soil depth), flow accumulation and TWI, altitude, and lithology L = strata(z_orig + fold). From them, classify in priority order:

1. snow;
2. cliff/bedrock (slope above tan 40–45° or zero soil, typed by L);
3. scree (tan 30° to tan 38°, directly below cliff cells);
4. sand (below tan 33°, with sediment or an arid flag);
5. wet soil/meadow (high TWI);
6. soil/grass (h above about 0.3 m);
7. thin soil or rock pavement otherwise.

Boulders are a separate instanced layer. Rendering uses height-based splatting, in which each texture's height map decides the transition so edges come out crisp and drawn-looking, at one extra sample per layer ([Wikipedia: Texture splatting](https://en.wikipedia.org/wiki/Texture_splatting)). Triplanar mapping roughly triples the work ([Envato Tuts+](https://code.tutsplus.com/use-tri-planar-texture-mapping-for-better-terrain--gamedev-13821a)), so restrict it to steep faces. The researchers estimate about 4–6 fetches per pixel with a two-material control texture, and about 12–18 on triplanar cliffs. These shader costs are unbenchmarked.

**What this means for the build.** Make one strata-hardness function the backbone of the geology. It sets per-layer k and θ in the erosion stage (weak: high k, 30°; hard: low k, 50°), so cliffs and benches form where they should. It types cliff rock and colours cliff bands. Assign materials from slope against the repose table, from steady-state soil depth, and from TWI and altitude. Give each material its signature at the cheapest level: Worley cells for basalt and limestone, 1-D bands for strata, Arches-style instanced rocks below cliffs in the 30–38° band, wind-aligned asymmetric ridges with a 33° lee for sand, and a slope × altitude × exposure mask for snow. Gate vegetation on soil depth and TWI, so bare rock reads on crests for a physical reason.

---

## 4. Ecosystems, mortality and deadwood: the forest floor is part of the terrain

### Cordonnier's five layers are the coupling template

Cordonnier et al. 2017 couple plants and terrain on a regular multi-material grid ([Galin 2024 lecture slides](https://perso.liris.cnrs.fr/eric.galin/M2/Landscapes/3-erosion-simulation.pdf); [Cordonnier et al. 2017](https://cs.purdue.edu/homes/bbenes/papers/Cordonnier17ToG.pdf)):

| Aspect | Cordonnier et al. 2017 |
|---|---|
| Layers | bedrock B, granular G, a vegetation density V per type (grass, shrubs, trees), dead vegetation D, water W |
| Grid | about 10 m cells over 10 km terrains; the superscripts were lost in extraction, so this is the researchers' reading |
| Time | 1-year steps over 100–1000 years |
| Driver | stochastic events with trigger conditions that cascade |

The couplings are:

- **Erosion.** Vegetation lowers hydraulic detachment and raises deposition, and trees limit erosion intensity in the validation.
- **Lightning.** It fragments rock (B → G, boulders), kills plants (V → D) and starts fire.
- **Fire.** It spreads according to humidity, and some species germinate only after fire.
- **Rockfall.** It removes trees but lets shrubs and grass establish.
- **Decay.** Dead vegetation decomposes into humus, and groves form on that fertile ground.

A sister paper says vegetation density raises the angle-of-repose threshold by holding sand ([Desertscape Simulation](https://www.researchgate.net/publication/335488341_Desertscape_Simulation)). The method was validated by side-by-side comparison with real terrains ([IP Paris record](https://researchportal.ip-paris.fr/en/publications/authoring-landscapes-by-combining-ecosystem-and-terrain-erosion-s/)). Its parameter tables could not be read (PDF too large).

The timescale matters. This model runs over centuries at 1-year steps, while stream power runs over 10^5–10^7 yr. Vegetation coupling therefore reshapes surface detail but cannot feed back on mountain-scale relief within the budget. The researchers suggest the coupling term tan θ_eff = tan θ_bare + Σ α_type·V_type.

### DeadWood: the presence of snags and logs is what viewers notice

DeadWood couples an individual-based ecosystem simulation, with explicit fire, windstorm, disease, death and decay, to a realisation step that balances unique trees against instancing, with up to 8 models per species. It cites snags at about **10% of basal area** in unmanaged forests and logs at about **2.5×** that ([Peytavie, Gain, Guérin, Argudo & Galin 2024](https://dl.acm.org/doi/10.1145/3641816)). In a two-alternative forced-choice study with **n = 116**, snags or logs significantly improved believability. More model variants and an emphasis on disturbance gave no measurable gain ([UCT eprint](https://pubs.cs.uct.ac.za/id/eprint/1689/)).

The MIT C++/Qt code steps **monthly**. Its inputs are a heightfield, a biome database, 12 monthly temperature, clear-sky and rainfall values, dense and isolated allometries, and an optional event file of (year, month, type, parameters). The demo scene is 2 × 2 km at 2 m ([GitHub oargudo/deadwood](https://github.com/oargudo/deadwood)). Its decay and fall parameters live in `disturbance_events.cpp` and were not read.

Two other papers extend the same line. Ecoclimates adds vegetation–soil–atmosphere feedback at micro- and meso-scale, reproducing edge effects and the Foehn effect ([Pałubicki et al. 2022](https://history.siggraph.org/?p=117929)). Fire in Paradise simulates combustion of 3-D branch models coupled to an atmospheric fluid with pyrocumulus clouds ([Hädrich et al. 2021](https://research.google/pubs/fire-in-paradise-mesoscale-simulation-of-wildfires/)). Both are heavy.

### Trees die at about one percent a year, plus suppression and events

SORTIE's standard annual adult stochastic mortality is **0.010** ([SORTIE parameters, Biogeosciences supplement](https://bg.copernicus.org/preprints/bg-2019-210/bg-2019-210-supplement.pdf)). The 4C model ties intrinsic mortality to species maximum age ([PIK 4C](https://www.pik-potsdam.de/~lasch/Dokumente/species_par.doc)). Keane et al. note that mortality in gap models rests on general relationships because causal data are sparse ([Keane et al. 2001](https://archive.jornada.nmsu.edu/node/51013)). The JABOWA constants, intrinsic m = 4.605/AGEMAX (1% survive to maximum age) and suppression mortality 0.368/yr, are from recall.

From these the researchers derive p_bg = 1 − 0.01^(1/A_max) ≈ 4.6/A_max per year, which is 1.5%/yr at A_max = 300 yr and 0.9%/yr at 500 yr.

Snags fall on a lag-then-rise curve. After two Idaho wildfires, predicted snag half-lives were **7–8 yr (ponderosa pine, salvage-logged) to 9–10 yr (unlogged)** and **12–16 yr for Douglas-fir**. Half-life rises with size, about 11, 17 and 23 yr for Douglas-fir snags under 23 cm, 23–41 cm and over 41 cm. Beetle-killed ponderosa pine was 85% standing at 5 years, fell fast between 5 and 15, then had a long tail ([NR Fire Science review](https://nrfirescience.org/node/8142)). In 6 851 fire-killed trees, firs and Douglas-fir over 45 cm had fall rates below 50% over 30 years ([USU Fire Effects](https://digitalcommons.usu.edu/nafecology/sessions/fire_effects/3)).

### Deadwood decays exponentially and stays for decades to centuries

Decay follows **M(t) = M₀·e^(−kt)**:

| Material | k or residence | Source |
|---|---|---|
| Angiosperm vs gymnosperm boles | k > 0.05 /yr vs < 0.05 /yr | Harmon et al. 1986 via [Black Rock Forest](https://www.blackrockforest.org/wp-content/uploads/2021/03/res_pub_burdette_c_cwd_12.10.07.pdf) (second-hand) |
| Quercus boles | 0.03 /yr (half-time 25 yr) | same |
| Pseudotsuga boles | 0.005 /yr (half-time 150 yr), fragments to 400 yr | same; [Forest Encyclopedia](https://old.forestencyclopedia.net/c/c1368/?showNav=n) |
| Logs vs snags (Swiss NFI) | logs ≈ **1.7×** faster | [Hararuk & Didion 2020](https://link.springer.com/article/10.1186/s40663-020-00248-x) |
| Snag carbon half-life | 22 yr (warmest plots) to 118 yr (coldest) | same |
| Fagus, 90% loss | 27–54 yr | same |
| Softwood, 90% loss | 58–191 yr wet sites, 78–286 yr dry | same |
| Temperature sensitivity | MAT explains 34% of variance, **Q10 = 2.53** | [Mackensen, Bauhus & Webber 2003](https://publish.csiro.au/BT/BT02014) |
| Pinus densiflora by decay class I–IV | 0.044 / 0.069 / 0.105 / 0.195 /yr | [J. Ecol. Environ. 34(1)](https://accesson.kr/jecoenv/assets/pdf/6788/journal-34-1-115.pdf) |
| Larix gmelinii after fire | 0.019 /yr (41 yr to 50%, 176 yr to 95%) | [J. For. Res. 2020](https://link.springer.com/doi/10.1007/s11676-020-01270-z) |

Decay classes are not standardised across studies, so class-specific k values do not transfer ([Zell et al. 2009 record](https://ideas.repec.org/a/eee/ecomod/v220y2009i7p904-912.html)). The 5-class log system of Maser and Sollins runs from bark intact and elevated to powdery, flattened and root-invaded. It is from recall and flagged.

From these numbers the researchers derive a temperature-scaled rate:

**k(T) = k_ref·2.53^((T − T_ref)/10)**

with k_ref ≈ 0.03 (hardwood) or 0.01 (conifer) at T_ref ≈ 8 °C, and k_snag = k_log/1.7. They map remaining mass fraction to the five visual classes with class = 1 + ⌊4·(1 − M/M₀)^0.7⌋, and below 10–20% mass they delete the log and add its mass to the cell's humus. That last step mirrors Cordonnier's D → humus flux.

### Uprooting leaves relief that outlasts the forest

Radiocarbon-dated treethrow mounds in Michigan and Wisconsin often persist **more than 1000 years**, 2–5× longer than earlier estimates. Sandy porous soils, a litter mat, gravel armour, a large initial size and soil freezing all help them persist ([Schaetzl & Follmer 1990](https://pubs.usgs.gov/publication/70016198)). Root-plate size sets pit and mound dimensions. On near-flat ground the soil returns to the pit and no feature forms ([Sass et al. 2018](https://harvardforest1.fas.harvard.edu/publications/pdfs/Sass_CanJForRes_2018.pdf), attribution unconfirmed). Pits and mounds create long-lived microsites ([Harvard Forest](https://harvardforest.fas.harvard.edu/notes/pits-and-mounds-diminished-elements-in-a-second-growth-landscape/)). This is where the forest writes into the heightfield. The researchers suggest stamping a pit of 0.3–0.5 × root-plate radius and a mound beyond it, then letting both diffuse over centuries. Those numbers are illustrative.

### Disturbance as cheap stochastic events

The browser-scale pattern is Cordonnier's event cascade, not physical fire. The researchers propose a cheap kit:

- **Background gaps** from single-tree mortality.
- **Windthrow events** with a direction. The kill probability is a logistic of height/DBH, exposure, edge proximity and soil depth. Survivors on new edges carry raised risk the next years. Part of the kill uproots (pit-and-mound) and the rest snaps into a snag stub plus a log.
- **Fire** as a cellular automaton on the vegetation grid. Fuel is V + D + logs, gated by moisture and biased upslope and downwind. Fire makes snags rather than logs and consumes part of the existing deadwood.
- **Succession.** Released saplings and light-demanding pioneers follow, with serotinous species germinating only in burnt cells.

Fire return intervals, gap rates (Runkle 1982) and windthrow coefficients (Mitchell 2013) are from recall and need primary sources before use.

### More growth forms from one architecture-aware grammar

Hallé & Oldeman's architectural models describe tree growth by trunk formation, branching and flowering position: 23 in the 1978 book, and "22 architectural models so far recognized" in Hallé's 2010 count ([Oxford tropical forests](https://www.tropicalforests.ox.ac.uk/?p=543)). AMAP turned them into stochastic bud-fate simulators ([HAL INRAE](https://hal.inrae.fr/hal-02701876/document)). Synthetic Silviculture's nine module prototypes already sit on that morphospace (earlier brief, §5). The researchers' growth-form catalogue gives the order of extension. Their mapping to Hallé–Oldeman names is flagged as theirs.

| Growth form | Where | Model | Signature |
|---|---|---|---|
| Excurrent conifer (Massart/Rauh-like) | boreal, montane | self-organising tree, high apical control λ, whorled tiers | snow-break and windthrow risk; slow-decaying logs |
| Open pine (Rauh) | dry montane, sandy, fire-prone | same, lower λ late, flat crown | thick bark, serotiny flag |
| Decurrent broadleaf (Troll/Rauh) | temperate, deep soil | low λ, sympodial | fast-decaying logs |
| Palm (Corner) | tropical, riparian | unbranched trunk + frond crown | cheapest tree |
| Candelabra/succulent (Leeuwenberg) | arid | recursive equal fork | thick segments, no leaves |
| Shrubs | understory, treeline, rockfall zones | multi-stem, short internodes | colonise rockfall (Cordonnier) |
| Grasses/sedges | open, steppe, alpine | instanced blades, density field | fire fuel, hold slopes |
| Herbs, ferns | gaps, moist shade, logs | L-systems | first colonists, moist old-forest cue |
| Mosses/lichens | rock, logs of class ≥ 3, north aspects | texture coverage = moisture × age × aspect | no geometry |
| Riparian (reeds, willow, alder) | flow-accumulation channels, lake edges | instanced blades; decurrent trees | driven by W layer |
| Seedlings on logs | logs of class 3–5, wet conifer forest | small instances on the log | nurse-log effect |

### Rendering tens of thousands of plants

A three.js demo draws **200 000 trees on a 3072 × 3072 terrain**. It uses instanced meshes with BVH frustum culling, a simplified LOD at 15–100 units, and octahedral impostors beyond 100 ([three.js forum](https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735)). A 2026 browser write-up reports two pitfalls: octahedral tiles snapping at fold boundaries, and three.js culling the whole forest for a unit-quad instance without an explicit bounding sphere ([Cinevva part 19](https://app.cinevva.com/blog/2026-05-04-open-world-browser-part-19-imposters)). A vendor benchmark puts 1 600 instances of a 140k-triangle tree at **111 ms as meshes against 5.78 ms as impostors** ([Pixyz docs](https://docs.unity3d.com/Packages/com.unity.pixyz.plugin4unity@2.0/manual/create-impostors.html)). No peer-reviewed browser forest benchmark exists.

**What this means for the build.** The current `silviculture-envsim.js` already has the Makowski ecosystem loop at plant scale: shared shadow, Gaussian seeding, senescence after p_max, starvation. What it lacks is the dead half of the cycle and any coupling back into the ground. Four additions supply it:

1. **A per-year death hazard on each plant**, combining three terms:
   - background p ≈ 4.6/A_max, where Table 4's p_max is the natural A_max (the researchers' link);
   - about 0.37/yr while vigour stays below the suppression threshold (recall);
   - event kills.
2. **Deadwood objects.** Snags fall with a size-dependent half-life of about 8–25 yr. Logs keep their mesh, lose mass at k(T) with Q10 = 2.53, and step through five decay classes: bark loss, sag, sinking into the heightfield, moss, then seedlings on classes 3–5. Below 10–20% mass a log dissolves into humus.
3. **Pit-and-mound stamps** from windthrow.
4. **Cordonnier-style cell layers** at about 10 m (bedrock, granular, humus, V per form, D). Vegetation raises the repose angle and lowers detachment, and humus raises fertility.

Add growth forms in this order: a second conifer architecture, shrubs, grass and herb density fields, moss and lichen as textures, then palms, succulents and riparian forms gated by a Whittaker lookup. Since DeadWood found that presence beats variety, put snags and logs ahead of more species variants.

---

## 5. Large regions, climate, LOD and look: physics at 30–200 m, procedure below

### No single method spans 100 km at 1 m, so generate coarse and amplify

The Eurographics review states the scale problem plainly. Glacial landforms are 50–100 km in extent while localised hydraulic erosion needs 1–2 m precision, and "very few current techniques can accommodate this range… (50,000 − 100,000 samples per dimension)". Erosion that takes under a second on 1 km² at 1 m "typically take[s] more than three hours" on 100 × 100 km² at the same precision. GPUs "do not change the overall complexity". For large terrains it recommends "Kolmogorov compression": store the generator plus parameters ([Galin et al. 2019](https://www.cs.purdue.edu/homes/bbenes/papers/Galin19CGF.pdf)). Its table places the families as follows; row alignment came from an imperfect extraction and is flagged.

| Method | Extent | Precision | Speed |
|---|---|---|---|
| Uplift + stream power (Cordonnier 2016) | 10–100 km | 10–100 m | seconds |
| Hydrology construction trees (Génevaux 2013/2015) | 100–1000 km | 1–10 m | seconds |
| Noise (Derzapf 2011) | > 10 000 km | < 1 m | real time |
| Sparse modelling (Guérin 2016) | 4–4000 km | 1–1000 m | seconds |

The same review finds that, under common rendering, "erosion- and example-based methods appear significantly more realistic than procedural approaches". It names a canyon with surrounding plains as the "stress test" papers avoid ([Galin et al. 2019](https://www.cs.purdue.edu/homes/bbenes/papers/Galin19CGF.pdf)).

Amplification is the bridge to fine scales. Guérin et al. amplify by **4–8× per step**, from 1 km to 4 m per pixel (×256), using paired low- and high-resolution DEM atoms ([Guérin et al. 2016 via Galin](https://www.cs.purdue.edu/homes/bbenes/papers/Galin19CGF.pdf)). Argudo et al. sample a peak-and-saddle graph from orometric distributions at about one sample per 2.5 km² and build a dual river network. They add noise whose amplitude is held "lower than the prominence threshold ε to guarantee that the orometry… is preserved", then apply constrained hydraulic erosion. A 90 × 90 km terrain at 30 m takes 60–190 s on a GTX 970, and against an Alps SRTM crop a GAN baseline produced 7× too many peaks ([Argudo et al. 2019](https://people.cs.uct.ac.za/~jgain/wp-content/papercite-data/pdf/argudo2019.pdf)). The general rule follows: amplify only after the channel network is fixed, with amplitude below the coarse cell's relief tolerance and attenuated near channels.

### Erosion is non-local, so unbounded worlds need a hierarchy

Drainage at a point depends on the whole upstream catchment, so tiled erosion seams. World Machine's moderators say there is "no way to get pixel-perfect results" building tiles independently. Seams with 1024² tiles at 25% blend came from a blend area "smaller than the area of influence of the erosion". Their workaround is to build the heavy terrain once, then slice it for fine passes ([WM forum](https://forum.world-machine.com/t/better-erosion-support-in-big-maps/4082); [tiling issue](https://forum.world-machine.com/t/tiling-issue/2896?page=2)).

Hierarchical schemes keep a coarse global context that is deterministic in (seed, x, y). Minecraft 1.18+ chooses biomes as the nearest hypercube in a space of seeded temperature, humidity, continentalness, erosion and weirdness noises, and the same noises shape terrain, so biome and relief correlate by construction rather than by physics ([Fabric docs](https://maven.fabricmc.net/docs/yarn-1.18.2+build.1/net/minecraft/world/biome/source/util/MultiNoiseUtil.NoiseHypercube.html)). InfiniteDiffusion stacks diffusion models from planetary context to local detail for seed-consistent, constant-time random access. It lists "hierarchical global indices for biome maps and rivers" as an open problem ([Goslin, arXiv 2512.08309](https://arxiv.org/pdf/2512.08309), preprint).

The researchers' architecture has three levels:

| Level | Resolution and extent | Contents |
|---|---|---|
| L0, continental | 1–5 km/cell, evaluable anywhere | seeded noise for uplift, base level and climate drivers |
| L1, region | blocks of 512²–1024² at 100–200 m/cell (50–100 km) | eroded once, with L0-fixed boundary elevations and outlets, or a halo of at least 25–50% |
| L2, local | tile-local | amplification |

Determinism needs three things: integer hashing, no dependence on floating-point summation order in drainage accumulation, and fixed iteration counts. The repository's own moshine M8 commit ("integer kernels, deterministic JS math") is the local precedent.

### Climate from terrain and one wind vector

At 50–100 km, two cheap physical fields drive biomes. Temperature falls with elevation; the 6.5 K/km lapse rate is standard but not sourced here, and the existing code uses γ = −0.0065 °C/m. Precipitation comes from the Smith–Barstad linear orographic model, which includes airflow dynamics, condensed-water advection and downslope evaporation. Its vertically integrated steady equations are solved with Fourier transforms, which gives windward maxima and lee rain shadows. The key parameter is the cloud delay time τ, and the authors flag linear dynamics, near-saturation and constant cloud time scales as strong assumptions ([Smith & Barstad 2004](https://ams.confex.com/ams/10Meso/techprogram/paper_62756.htm); [AMS PDF](https://ams.confex.com/ams/pdfpapers/62756.pdf)). The model has been used to downscale GCM precipitation over western Norway ([HESS 2010](https://hess.copernicus.org/articles/14/2329/2010/)), and a Python package exists ([PyPI](https://pypi.org/project/orographic_precipitation/0.1rc0/)). Its default parameters were not verified. A 512² FFT plus a pointwise transfer function is a few ms in WebGPU (researchers' estimate). Biomes then follow from a Whittaker lookup on mean annual temperature and precipitation (boundaries from recall; a digitised set such as `plotbiomes` should be sourced).

### Geometry clipmaps fit a GPU-generated world

Clipmaps nest viewer-centred regular grids and refill them incrementally ([Losasso & Hoppe 2004](https://hhoppe.com/proj/geomclipmap/)). The GPU Gems 2 reference implementation uses:

- grid size n = 2^k − 1 = 255 with L = 11 levels;
- 12 ring blocks of 64 × 64 per level, plus fix-up strips and an L-shaped trim;
- transition width n/10, with triangles about 5 px wide at 1024 × 768.

That comes to **6L + 5 = 71 draws, or 3L + 2 = 35 with instancing**, at **130 fps on a 2005 GeForce 6800 GT**. Upsampling costs 1 ms per level, and normal maps 0.6 ms ([Asirvatham & Hoppe 2005](https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-2-terrain-rendering-using-gpu-based-geometry)). CDLOD is the alternative: a quadtree of one grid mesh with per-vertex morphing and no stitching, suited to tiled height data ([Strugar 2009](https://github.com/fstrugar/CDLOD)).

The web lacks tessellation, geometry and mesh shaders, so LOD comes from prebuilt grids or compute ([Babylon forum](https://forum.babylonjs.com/t/advanced-terrain-with-lod/49385)). CesiumJS uses a screen-space-error quadtree over 16-bit quantized-mesh tiles ([Cesium docs](https://cesium.com/learn/cesiumjs/ref-doc/QuantizedMeshTerrainData.html)). A 2026 three.js WebGPU open world uses clipmap rings far out, chunks in the middle and Transvoxel near the camera. It makes seams watertight by 2:1 edge morphing, h = ½(h_left + h_right) on odd boundary vertices, and warns to "test under motion" ([Cinevva part 12](https://app.cinevva.com/blog/2026-02-25-open-world-browser-part-12-lessons)).

The researchers' coverage arithmetic for a 1 m finest cell: n = 255 with L = 11 spans about 261 km across the outer ring, with about 0.5–0.6 M vertices and about 2.9 MB of r32float height textures, refilled toroidally from L1 plus amplification.

### A drawing-like look is cartography in a shader

Swiss manual relief shading does three things plain hillshade does not. It removes unnecessary detail, adjusts the light direction locally, and varies brightness to emphasise large landforms. A U-Net trained on it was rated high quality by 18 experts ([Jenny et al. 2021](https://arxiv.org/pdf/2010.01256)). Terrain Sculptor generalises the DEM before shading ([Leonowicz, Jenny & Hurni 2010](https://doi.org/10.14714/cp67.114)). The researchers' real-time recipe uses only per-fragment work:

- hillshade from normals at the coarser clipmap level, which gives generalisation for free, since each level is a low-pass of the one below;
- a north-west key light plus an ambient sky term;
- a hypsometric tint indexed by biome;
- contours via fract(h/Δ) with fwidth, with every fifth line an index contour;
- sky-coloured aerial perspective.

### Realism at region scale is measurable

Galin lists four ways of judging realism: renderings, user studies, expert review and physical-consistency checks. It warns that perceptual and quantitative judgements can disagree ([Galin et al. 2019](https://www.cs.purdue.edu/homes/bbenes/papers/Galin19CGF.pdf)). Orometric histograms of prominence, dominance, isolation and saddle orientation, fed to a random forest or compared by Earth Mover's Distance against SRTM, discriminate real ranges ([Argudo et al. 2019](https://people.cs.uct.ac.za/~jgain/wp-content/papercite-data/pdf/argudo2019.pdf)). Globally, about **29% of Earth's surface lies above sea level**, and 85% lies in two bands, +2000 to −500 m and −3000 to −6000 m ([SERC](https://serc.carleton.edu/13751)). The hypsometric curve has modes near **+100 m and −4700 m** ([Britannica](https://www.britannica.com/print/article/280163)). Global land slope distributions, mean land elevation and biome area fractions were not found in primary sources. In any case, a single 100 km region should be compared with an SRTM region of the same relief class, not with global fractions.

**What this means for the build.** For "tens of km", erode one L1 region once (1024² at 30–50 m, or 512² at 100 m) and cache it. That sidesteps cross-tile erosion entirely. Layer unboundedness on later with L0-fixed outlets and halos. Derive temperature, Smith–Barstad precipitation and Whittaker biomes at L1. Amplify per tile below the coarse relief tolerance, masked at channels. Render with clipmaps (n = 255, 10–11 levels) and get the drawn look from cartographic shading.

---

## 6. Recommended pipeline and validation

### Twelve stages ordered by timescale

The organising principle comes straight from the sources: each process is valid only on its own timescale. Tectonics and stream power cover 10^5–10^7 yr with steps of up to 2.5×10⁵ yr. Glaciers step at 10–100 yr. The ecosystem runs at 1-year or monthly steps. Meander migration steps at 106 days, and hydraulic erosion works on rain events. The pipeline therefore runs slow processes first and fast ones on top. "Measured" costs are from the cited papers on desktop or workstation GPUs; "estimate" marks the researchers' unbenchmarked browser projections.

| # | Stage | Grid / resolution | Law and constants | Cost |
|---|---|---|---|---|
| 1 | Seed and continental context (L0) | 1–5 km/cell, any (x, y) | integer-hashed fields for uplift pattern, base level, sea-level temperature, prevailing wind | ms (estimate) |
| 2 | Uplift and strata | L1 grid | U = 0.5–1.2 mm/yr, stepped or graded ([Cordonnier 2016](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf); [Jain 2024](https://www.cs.purdue.edu/homes/bbenes/papers/Arymaan24ToG.pdf)); strata hardness(z₀ + fold), 2–10 layers 0.1–5 km thick, 1–10 sub-layers ([Cordonnier 2018](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier18TVCG.pdf)) | ms (estimate) |
| 3 | Landscape evolution | **1024² at 30–50 m** (30–50 km) for one region; 512² at 100–200 m per L1 block | implicit stream power, n = 1, m = 0.45, U/K set by target relief (h_max = 2.244·U/K at m = 0.5); hillslope k_h = 0.01–0.04 m²/yr; debris/thermal θ_c = 35–37°; per-layer k and θ (weak 30°, hard 50°); 100–300 iterations | measured: 2048² × 200 iterations < 10 s on RTX A6000 ([FastFlow](https://people.cs.uct.ac.za/~jgain/wp-content/papercite-data/pdf/jain2024.pdf)); 1024² 0.02 s/iteration ([debris flow](https://www.cs.purdue.edu/homes/bbenes/papers/Arymaan24ToG.pdf)). Estimate: 5–30 s on a laptop GPU |
| 4 | Hydrology | same grid | ε-Priority-Flood, D8, area accumulation, Strahler; lakes at spill height ([Barnes 2014](https://ar5iv.arxiv.org/html/1511.04463)) | O(n log n); < 1 s in a worker at 1024² (estimate) |
| 5 | Sea level, coast, straits | same grid | sea level as a height quantile; land-component merge tree to open or close saddles | < 100 ms (estimate) |
| 6 | Rivers | vector graph, δp = 50 m | φ = 0.42·A^0.69 (A in km², pending check); w ∝ A^0.5, w = 18.8·d^1.41; Manning; migration δt = 106 d, k = 0.164 m/d, ω = −1, γ = 2.5, f = 0.011; cutoffs → oxbows; avulsion 0.05 ([Paris 2023](https://hal.univ-lorraine.fr/hal-04227965v1)); deltas at high-φ, low-slope mouths (rule) | interactive to about 5 000 points (measured) |
| 7 | Climate and biome | L1 grid | T = T_sea − 6.5 K/km·z; Smith–Barstad FFT precipitation ([Smith & Barstad 2004](https://ams.confex.com/ams/pdfpapers/62756.pdf)); Whittaker (T, P) lookup | few ms WebGPU / tens of ms JS at 512² (estimate) |
| 8 | Soil, wetness, materials | baked per texel at L1, refined per L2 tile | h = (1/k)·ln(P₀/(−D∇²z)), k = 2–4 m⁻¹, P₀ 0.05–2 mm/yr; TWI = ln(a/tan β); repose table; strata lookup; snow mask | one pass of per-texel ALU (estimate) |
| 9 | Ecosystem and deadwood | Cordonnier layers at 10 m in a focus window of about 10 km (1024²); Silviculture plants near the camera | 1-yr steps over 100–1000 yr; mortality 4.6/A_max + 0.37/yr suppressed + events; snag half-life 8–25 yr; log decay k(T), Q10 = 2.53; humus feedback; vegetation-raised repose; pit-and-mound | Silviculture stepping costs as in the earlier brief §5; grid layers cheap (estimate) |
| 10 | Detail amplification (L2) | 4–8× per level, 3–4 levels to about 1 m | amplitude below coarse relief tolerance, masked at channels ([Argudo 2019](https://people.cs.uct.ac.za/~jgain/wp-content/papercite-data/pdf/argudo2019.pdf)); optional short Mei pass | measured: 3.84 ms/iteration at 512² on a 2008 GPU ([Jakó 2011](https://www.old.cescg.org/CESCG-2011/papers/TUBudapest-Jako-Balazs.pdf)) |
| 11 | Render | clipmap n = 255, 10–11 levels | flow-map water (+2 fetches, +21 ALU); height-blend materials; instanced plants with impostors beyond about 100 m; cartographic shading | about 0.5 M vertices, 11–35 draws, about 3 MB heights (estimate from [GPU Gems 2](https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-2-terrain-rendering-using-gpu-based-geometry)) |
| 12 | Validate | L1 grid plus an SRTM/Copernicus 30 m tile of the same setting | table below | seconds (estimate) |

Memory per cached region is about 4–16 MB for several float fields at 512²–1024² (estimate). The glacial stage of Cordonnier 2023 (300 ms/step at 1024² on an RTX A5000) is left out of the "seconds" budget.

### Where artistic liberty remains

| Liberty | Why it remains | How to constrain it |
|---|---|---|
| Uplift pattern U(x) | No cheap plate model in the browser; Cordonnier 2018 needs a crust simulation | Physical units (0.5–1.2 mm/yr); prefer stepped or graded fields, since the gradient sets valley direction |
| U/K ratio | K is "poorly constrained" in geomorphology | Choose from target relief; check θ and the spectrum rollover |
| Thermal talus noise (6–54°) | Cordonnier 2016 used it to avoid regular valleys | Replace with debris flow (Jain 2024) and per-layer θ from strata |
| Hydraulic constants (K_c, K_s, K_d, K_e, A) | Dimensionless, uncalibrated | Keep the pass short, as detail only |
| Amplification noise | Fine scales cannot be simulated over 100 km | Amplitude below relief tolerance, masked at channels |
| Coast shaping, deltas | No graphics coastal process model; deltas are rules | Measure coastline D against 1.02–1.25 |
| Ecosystem event probabilities, species constants | Cordonnier 2017 and DeadWood tables unread; fire and gap rates from recall | Source LANDFIRE, Runkle and Mitchell numbers before tuning |
| Look (palette, contours) | Style is a choice | Cartographic conventions (Imhof, Swiss shading) |

### Validation table

| Statistic | Earth value | Source |
|---|---|---|
| Drainage consistency | every cell drains to an outlet or a lake with a spill point | [Galin et al. 2019](https://www.cs.purdue.edu/homes/bbenes/papers/Galin19CGF.pdf); [Barnes et al. 2014](https://ar5iv.arxiv.org/html/1511.04463) |
| Channel concavity θ (S = k_s·A^−θ) | reference 0.45; basalt ≈ 0.7 (built in at steady state, so it checks implementation, not realism) | [Mudd et al. 2018](https://esurf.copernicus.org/articles/6/505/2018/esurf-6-505-2018.pdf) |
| Hack exponent h (L ∝ A^h) | 0.57–0.60; toward 0.5 for very large basins | [Dodds & Rothman 1999](https://arxiv.org/pdf/cond-mat/9808244) |
| Area distribution τ | 1.43 ± 0.02 (exceedance exponent ≈ 0.43; OCN ensemble 0.43, Tanaro 0.44) | [Dodds & Rothman 1999](https://arxiv.org/pdf/cond-mat/9808244); [Rinaldo et al. 2014](https://pmc.ncbi.nlm.nih.gov/articles/PMC3932906) |
| Consistency relation | τ = 2 − h | [Dodds & Rothman 1999](https://arxiv.org/pdf/cond-mat/9808244) |
| Horton bifurcation R_B, on orders ≥ 4 | 3.0–5.0 (compilation 3.3–4.7) | [Dodds & Rothman 1999](https://arxiv.org/pdf/cond-mat/9808244); [Cudennec et al.](https://iahs.info/uploads/dms/13454.51-422--430-S7-47-Cudennec-et-al.pdf) |
| Horton length R_L | 1.5–3.0 (compilation 1.6–2.4) | same |
| Horton area R_A | 3.0–6.0 | [Dodds & Rothman 1999](https://arxiv.org/pdf/cond-mat/9808244) |
| Tokunaga T1 | 1.0–1.5 | same |
| Network fractal dimension log R_B/log R_L | ≈ 1.9 (near 2, space-filling) | [Tarboton](https://hydrology.usu.edu/dtarb/egs01fractalabs.html); [Tarboton et al. 1988](https://api.openalex.org/works/doi:10.1029/WR024i008p01317) |
| Main-stream fractal dimension d | 1.1 ± 0.01 | [Dodds & Rothman 1999](https://arxiv.org/pdf/cond-mat/9808244) |
| Basin fractal dimension D | 1.8 ± 0.1 | same |
| Radially averaged power spectrum | sharp decline above the hillslope-length frequency; ridge–valley wavelength peak (pure fBm has neither) | [Perron et al. 2008](https://api.openalex.org/works/doi:10.1029/2007JF000866); [Perron et al. 2009](https://api.openalex.org/works/doi:10.1038/nature08174) |
| Characteristic hillslope length (one site) | 62 m, Gabilan Mesa (contested method) | [EGUsphere 2024-2847 AC1](https://egusphere.copernicus.org/preprints/2024/egusphere-2024-2847/egusphere-2024-2847-AC1-supplement.pdf) |
| Orometry | prominence, isolation, dominance, saddle histograms; EMD against SRTM of the same range class | [Argudo et al. 2019](https://people.cs.uct.ac.za/~jgain/wp-content/papercite-data/pdf/argudo2019.pdf) |
| Hypsometry (global) | 29% of surface above sea level; modes near +100 m and −4700 m; regional: compare with SRTM of the same relief class | [SERC](https://serc.carleton.edu/13751); [Britannica](https://www.britannica.com/print/article/280163) |
| Glacial hypsometry (if glaciated) | hypsometric maximum shifted toward the ELA | [Cordonnier et al. 2023](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier23ToG.pdf) |
| Meander wavelength / width | 7–12 (a = 6.28–12.34 with b = 1–1.13; −40% to +65% scatter) | [Leopold & Wolman PP 282-B](https://pubs.usgs.gov/pp/0282b/report.pdf); [Paris et al. 2023](https://hal.univ-lorraine.fr/hal-04227965v1) |
| Sinuosity of meandering reaches | > 1.5 | [Paris et al. 2023](https://hal.univ-lorraine.fr/hal-04227965v1) |
| Width–depth | w = 18.8·d^1.41; w ∝ A^0.5 | [Paris et al. 2023](https://hal.univ-lorraine.fr/hal-04227965v1) |
| Coastline dimension | 1.02 (South Africa) to 1.25 (west Britain) | [Mandelbrot 1967](https://gis.humboldt.edu/olm/courses/gsp_510/Articles/Mandelbrot1967.pdf) |
| Talus slope angle | 28.0–33.4° measured; approaches about 35°; no histogram spike at a single angle | [Miscellanea Geographica 2025](https://reference-global.com/article/10.2478/mgrsd-2025-0032); [Francou & Manté](https://horizon.documentation.ird.fr/exl-doc/pleins_textes/divers19-08/010048761.pdf) |
| Basalt columns | 3–8 sides, mostly 6; few cm to about 3 m wide | [Wikipedia, citing Oregon State](https://en.wikipedia.org/wiki/Columnar_jointing) |
| Limestone pavement | clints mostly 1–5 m²; grikes ≤ 80 cm wide, ≤ 2 m deep | [Burren Geopark](https://www.burrengeopark.ie/wp-content/uploads/2013/04/Geology-Sheet-11-Limestone-Pavement.pdf) |
| Soil production | P₀ 0.05–2.0 mm/yr; e-folding depth about 0.25–0.5 m | [Wikipedia summary of Heimsath](https://en.wikipedia.org/wiki/Soil_production_function) (secondary) |
| Adult background mortality | about 1 %/yr | [SORTIE parameters](https://bg.copernicus.org/preprints/bg-2019-210/bg-2019-210-supplement.pdf) |
| Snags / logs in unmanaged forest | snags about 10% of basal area; logs about 2.5× that | [DeadWood](https://dl.acm.org/doi/10.1145/3641816) |
| Snag half-life | pine 7–10 yr, Douglas-fir 12–16 yr (post-fire); DF 11/17/23 yr by size | [NR Fire Science](https://nrfirescience.org/node/8142) |
| Log decay constant | oak 0.03/yr; Douglas-fir 0.005/yr (second-hand); logs 1.7× faster than snags | [Black Rock Forest](https://www.blackrockforest.org/wp-content/uploads/2021/03/res_pub_burdette_c_cwd_12.10.07.pdf); [Hararuk & Didion 2020](https://link.springer.com/article/10.1186/s40663-020-00248-x) |
| Decay temperature sensitivity | Q10 = 2.53 | [Mackensen et al. 2003](https://publish.csiro.au/BT/BT02014) |
| Pit-and-mound persistence | > 1000 yr in favourable soils | [Schaetzl & Follmer 1990](https://pubs.usgs.gov/publication/70016198) |
| Stand self-thinning, biomass | 3/2 self-thinning; logistic biomass (as in the earlier brief §5) | [Makowski et al. 2019](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf) |

The harness itself is cheap. Compute D8 drainage on the output and on a real SRTM/Copernicus 30 m tile of the same tectonic setting. Then compare θ, h, τ, Horton ratios on middle orders, P(A ≥ a), the radially averaged spectrum, the hypsometric curve, the slope histogram at matched resolution, orometric histograms and the coastline dimension. No paper was found that quantitatively compares a graphics stream-power terrain's Hack, Horton or spectrum statistics with a real DEM, so this comparison would be a genuine contribution.

### Benchmarks the literature does not provide

Four numbers have to be measured in the build itself. None of them exists in the sources:

1. The browser cost of stream-power erosion at 512²–2048² on WebGPU, implicit against explicit.
2. The browser cost of Priority-Flood and accumulation at 1024² in a worker.
3. WebGL2 against WebGPU clipmap frame time with height-blend materials.
4. Instanced-forest frame time with impostors, deadwood instances included.

---

## Conclusion

The question of how few liberties a browser landscape can take has a sharper answer than expected. Relief, drainage, lakes, meanders, material placement, soil, mortality and decay all have published laws with constants in real units, and each runs at a cost a browser can carry once it is staged by timescale. The liberties concentrate in four places: the uplift pattern, the uncalibrated hydraulic-erosion constants, sub-grid amplification, and the coast. That list is short enough to state on the page. The same staging explains why coupling is one-directional at the scale of mountains. Vegetation and deadwood reshape slopes, soil and microrelief over centuries, but cannot touch relief built over 10^5–10^7 years inside a seconds budget. The forest floor, with its pits, mounds, logs and humus, is where the living layer writes into the terrain.

The second shift is about evidence. The graphics line from Génevaux to FastFlow has validated almost entirely by eye, while hydrology has spent decades fixing the numbers that separate real networks from random ones: two independent exponents, h ≈ 0.57–0.60 and τ ≈ 1.43, tied by τ = 2 − h, with Horton ratios as a weak, middle-order check. A browser build that runs a published law at every stage and then reports those numbers against an SRTM tile would make a quantitative realism claim no current paper makes. That is the natural next paper in the series.

---

## Flags: unverified or derived

| Item | Status | What is missing or in doubt |
|---|---|---|
| Braun & Willett 2013 internals (stack order, Newton–Raphson for n ≠ 1, catchment parallelism) | from memory | Elsevier and HAL blocked; only Landlab's summary read |
| Schott et al. 2023 resolutions, runtimes, parameter units | not read | HAL bot wall; shader defaults from released code, units unstated |
| Tzathas et al. 2024 runtimes and GPU use | not read | abstract only |
| Schott et al. 2024 multi-scale erosion amplification | not read | listing only |
| Cordonnier 2016 h_max = 2.244·u/k "km" | researchers' arithmetic | consistent only in metres; internal unit inconsistency |
| FastFlow kernels' use of atomics or scatter | not verified | affects WGSL port |
| Mei 2007 original constants and equations | not read | IEEE paywall; Jakó 2011 (student paper) restatement used; Jakó's "max" read as min |
| Browser timings for stream power, Priority-Flood, hydraulic passes, clipmaps, forests | researchers' estimates | no measured browser source exists |
| Geotechnical angle-of-repose range (30–40°) | secondary | engineering table on Wikipedia only |
| Perron 2008 spectral slopes and rollover wavelengths | not retrieved | AGU and Berkeley PDFs blocked |
| Strahler hypsometric integral classes (> 0.6 youthful, 0.35–0.6 mature, < 0.35 old) | from memory | Strahler 1952 not read |
| Kirchner 1993 "statistical inevitability of Horton's laws" | not fetched | Rinaldo 2014 used for the same point |
| Rodríguez-Iturbe & Rinaldo 1997 *Fractal River Basins* | not accessed | |
| Hack 0.57 from DTIC report; Hack values in Wikipedia | secondary | Dodds & Rothman used instead |
| Guérin et al. 2017 cGAN terrain; 2024 diffusion terrain | not fetched | context only |
| Tarboton D∞ facet mechanics; Freeman MFD exponent p ≈ 1.1 | unverified | primary equations not read |
| MFD on hillslopes / D8 in channels as a named method | unverified | common practice |
| OCN functional E = Σ Q^γ ΔZ with γ ≈ 0.5 | unverified | equations were images |
| Rinaldo et al. 1992 original OCN citation | unverified | |
| Tokunaga T1 fitted for named basins | not found | only the 1.0–1.5 range |
| Horton values for Beaver Creek (R_B ≈ 4.6, R_L ≈ 2.3) | secondary | ResearchGate preprint citing Yang & Paik 2017 |
| Leopold & Maddock exponents (b ≈ 0.5, f ≈ 0.4, m ≈ 0.1 downstream; 0.26/0.40/0.34 at-a-station) | from memory | PP 252 tables not read |
| φ = 0.42·A^0.69 assumes A in km² | researchers' derivation | Dunne & Leopold 1978 not accessed |
| Manning's equation and n ranges | standard, unverified here | |
| Meander "10–14 w" | not found | use 7–12 w |
| Howard & Knutson year (1984 vs 1985) | discrepancy | |
| Galloway 1975 delta classes; avulsion length L_b ≈ h/S; Fill-Spill-Merge citation | unverified | |
| Coastline D = 2 − H for fBm level sets; Korčák island law | unverified | Mandelbrot 1982, Voss 1988 not read |
| Wave refraction, longshore drift and cliff-retreat rules (Sunamura 1992) | unverified | no graphics coastal model found |
| Strait detection by land-component merge tree | researchers' proposal | no source |
| Teoh 2008 RiverLand; Derzapf 2011 planet rivers | not retrieved | |
| Delta L-system + cGAN paper date | unconfirmed | |
| Terrain Amplification 2019 primitive parameters (hoodoos, stratified cliffs) | not read | PDF > 10 MB |
| Voronoi jitter 0.5–0.7 gives mostly 5–7 sided cells | researchers' estimate | |
| Procedural columnar-jointing paper; Giant's Causeway and Devils Postpile column sizes | not found | |
| Tor and corestone formation; downslope size sorting on talus | unsourced | |
| Soil production P₀ and k values | secondary | Wikipedia summary; 1997 paper's own fit not retrieved |
| Steady-state soil depth h = (1/k)·ln(P₀/(−D∇²z)) | researchers' derivation | |
| Fernandes & Dietrich 1997 D values; Roering S_c ≈ 1.25 | unverified | |
| Hillslope diffusivity vs precipitation | conflicting | Golan study vs Perron 2017 as cited in a 2025 reply |
| Snow paper internals; Fearing equations; aeolian ripple wavelength | not read | |
| Shader fetch counts; biplanar mapping saving | researchers' estimates | Quilez article not fetched |
| Cordonnier 2017 parameter tables; 10 m cell reading | not read / inferred | PDF too large; superscripts lost in slides |
| DeadWood decay stages, fall rules, mortality probabilities | not read | in `disturbance_events.cpp`; paper about 125 MB |
| Ecoclimates grid, time step, death rule | not verified | |
| Windy Trees (Pirk et al. 2014) | recall | DOI 10.1145/2661229.2661252 not re-fetched |
| Synthetic Silviculture DOI | recall | content verified via PDF in the earlier brief |
| 2023–2026 deadwood papers by Pałubicki/Pirk/Michels | none found | check DBLP |
| JABOWA m = 4.605/AGEMAX and suppression 0.368/yr | recall | primary text not found |
| Pacala et al. 1996 SORTIE monograph | recall | |
| Harmon et al. 1986 k values | second-hand | PDF too large |
| Maser/Sollins five-class log decay system | recall | |
| Nurse logs: 6–11% of ground, > 90% of seedlings (Harmon & Franklin 1989) | recall | numbers need checking |
| Windthrow fall direction ±30° downwind | recall | |
| Sass et al. 2018 attribution of the Rockies pit-mound study | unconfirmed | |
| Fire return intervals; gap formation 0.5–2%/yr (Runkle 1982); windthrow logistics (Mitchell 2013) | recall | |
| p_bg = 1 − 0.01^(1/A_max); k(T) with T_ref 8 °C; decay-class mapping; 10–20% humus threshold; pit depth 0.3–0.5 × root-plate radius; p_max as A_max | researchers' derivations / illustrative | |
| Hallé–Oldeman names in the growth-form table | researchers' mapping | check Hallé et al. 1978 |
| DOIs for Pałubicki 2009, Runions 2007, Deussen 1998, Boulanger 2009, de Reffye 1988 | recall | |
| Whittaker, Holdridge and Köppen boundaries | recall | source a digitised set (e.g. `plotbiomes`) |
| Lapse rate 6.5 K/km | standard, uncited here | |
| Smith–Barstad transfer function and defaults (τ ≈ 1000 s, H_w, N_m) | unverified | PyPI page did not render |
| Galin 2019 Table 3/4 rows | imperfect extraction | check against PDF |
| Losasso & Hoppe 2004 DOI (10.1145/1015706.1015799) | unverified | |
| Engine seam conventions (skirts, border overlap) | blog/commercial | |
| Minecraft has no drainage simulation | prior knowledge | |
| Gaea tiled builds | not found | |
| Mean land elevation (≈ 840 m), global land slope distribution, biome area fractions | not found | |
| Browser vegetation LOD numbers; Pixyz benchmark | forum/vendor only | |
| InfiniteDiffusion | preprint | not peer reviewed |
| Cinevva blog, World Machine forum, FlightGear, practitioner heuristics | low authority | practice only |

---

## References

**Section 1 (terrain formation).** Cordonnier, Braun, Cani, Benes, Galin, Peytavie & Guérin, "Large Scale Terrain Generation from Tectonic Uplift and Fluvial Erosion", CGF 35(2):165–175, 2016, DOI [10.1111/cgf.12820](https://doi.org/10.1111/cgf.12820), [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf). Braun & Willett, "A very efficient O(n), implicit and parallel method to solve the stream power equation governing fluvial incision and landscape evolution", Geomorphology 180–181:170–179, 2013, DOI [10.1016/j.geomorph.2012.10.008](https://doi.org/10.1016/j.geomorph.2012.10.008), [Landlab](https://landlab.readthedocs.io/en/latest/generated/api/landlab.components.stream_power.fastscape_stream_power.html). Schott, Paris, Fournier, Guérin & Galin, "Large-scale Terrain Authoring through Interactive Erosion Simulation", ACM TOG 42(5), 2023, DOI [10.1145/3592787](https://doi.org/10.1145/3592787), [code](https://github.com/H-Schott/StreamPowerErosion). Jain, Kerbl, Gain, Finley & Cordonnier, "FastFlow: GPU Acceleration of Flow and Depression Routing for Landscape Simulation", CGF (Pacific Graphics), 2024, DOI [10.1111/cgf.15243](https://doi.org/10.1111/cgf.15243), [PDF](https://people.cs.uct.ac.za/~jgain/wp-content/papercite-data/pdf/jain2024.pdf). Tzathas, Gailleton, Steer & Cordonnier, "Physically-based analytical erosion for fast terrain generation", CGF 43(2), 2024, DOI [10.1111/cgf.15033](https://doi.org/10.1111/cgf.15033). Schott et al., "Terrain amplification using multi scale erosion", 2024, [Adobe Research](https://research.adobe.com/publication/terrain-amplification-using-multi-scale-erosion). Jain, Benes & Cordonnier, "Efficient Debris-flow Simulation for Steep Terrain Erosion", ACM TOG 43(4) 58, 2024, DOI [10.1145/3658213](https://doi.org/10.1145/3658213), [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Arymaan24ToG.pdf). Musgrave, Kolb & Mace, "The synthesis and rendering of eroded fractal terrains", SIGGRAPH 1989, DOI [10.1145/74334.74337](https://doi.org/10.1145/74334.74337). Mei, Decaudin & Hu, "Fast Hydraulic Erosion Simulation and Visualization on GPU", Pacific Graphics 2007, pp. 47–56, DOI [10.1109/PG.2007.15](https://doi.org/10.1109/PG.2007.15), [hgpu](https://hgpu.org/?p=2256). Jakó & Tóth, "Fast Hydraulic and Thermal Erosion on GPU", CESCG 2011, [PDF](https://www.old.cescg.org/CESCG-2011/papers/TUBudapest-Jako-Balazs.pdf). Šťava, Beneš, Brisbin & Křivánek, "Interactive Terrain Modeling Using Hydraulic Erosion", SCA 2008, [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Stava-2008-Interactive_Terrain_Modeling_Using_Hydraulic_Erosion.pdf). Galin, Heightfield library docs, [GPU particle erosion](https://perso.liris.cnrs.fr/eric.galin/Doc/Heightfield/class_g_p_u_hydraulic_erosion_particle.html); Galin, "Erosion simulation", M2 course slides, 2024, [PDF](https://perso.liris.cnrs.fr/eric.galin/M2/Landscapes/3-erosion-simulation.pdf). Browser demos: [multigrid Eulerian erosion](https://sapereaude1490.itch.io/multigrid-eulerian-erosion), [IoTone/burisu](https://github.com/IoTone/burisu), [10Kaiser10/hydraulic-erosion](https://github.com/10Kaiser10/hydraulic-erosion), [Cinevva part 27](https://app.cinevva.com/blog/2026-05-13-open-world-browser-part-27-island-and-terrain). Cordonnier, Jouvet, Peytavie, Braun, Cani, Benes, Galin, Guérin & Gain, "Forming Terrains by Glacial Erosion", ACM TOG 42(4) 61, 2023, DOI [10.1145/3592422](https://doi.org/10.1145/3592422), [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier23ToG.pdf). Mudd, Clubb, Gailleton & Hurst, "How concave are river channels?", ESurf 6:505–523, 2018, DOI [10.5194/esurf-6-505-2018](https://doi.org/10.5194/esurf-6-505-2018). Kwang & Parker, ESurf 5:807, 2017, DOI [10.5194/esurf-5-807-2017](https://doi.org/10.5194/esurf-5-807-2017). Perron, Kirchner & Dietrich, JGR Earth Surface 113 F04003, 2008, DOI [10.1029/2007JF000866](https://doi.org/10.1029/2007JF000866). Perron, Kirchner & Dietrich, Nature 460:502, 2009, DOI [10.1038/nature08174](https://doi.org/10.1038/nature08174). EGUsphere 2024-2847 author comment, [PDF](https://egusphere.copernicus.org/preprints/2024/egusphere-2024-2847/egusphere-2024-2847-AC1-supplement.pdf). Rigon et al., "On Hack's Law", WRR 32(11):3367, 1996, DOI [10.1029/96WR02397](https://doi.org/10.1029/96WR02397). ESurf discussion on stream-power coefficients, [esurfd-1-891-2013](https://esurf.copernicus.org/preprints/1/891/2013/esurfd-1-891-2013.pdf). EGU2011-10614, [PDF](https://meetingorganizer.copernicus.org/EGU2011/EGU2011-10614.pdf). Hillslope diffusivity: [EGU2017-11969](https://meetingorganizer.copernicus.org/EGU2017/EGU2017-11969.pdf?pdf), [MIT OCW 12.163](https://ocw.mit.edu/courses/12-163-surface-processes-and-landscape-evolution-fall-2004/f5af48b6712c3dedbefbebbe699cd803_week7_8_1.pdf), [egusphere-2025-1585 AC3](https://egusphere.copernicus.org/preprints/2025/egusphere-2025-1585/egusphere-2025-1585-AC3-supplement.pdf).

**Section 2 (rivers, lakes, coasts, straits).** Barnes, Lehman & Mulla, "Priority-flood: An optimal depression-filling and watershed-labeling algorithm for digital elevation models", Computers & Geosciences 62:117–127, 2014, DOI [10.1016/j.cageo.2013.04.024](https://doi.org/10.1016/j.cageo.2013.04.024), [arXiv 1511.04463](https://ar5iv.arxiv.org/html/1511.04463). Landlab [LakeMapperBarnes](https://landlab.readthedocs.io/en/latest/reference/components/lake_fill.html). Tarboton, "A new method for the determination of flow directions and upslope areas in grid digital elevation models", WRR 33(2):309–319, 1997, DOI [10.1029/96WR03137](https://doi.org/10.1029/96WR03137). Dodds & Rothman, "Unified view of scaling laws for river networks", Phys. Rev. E 59(5):4865–4877, 1999, DOI [10.1103/PhysRevE.59.4865](https://doi.org/10.1103/PhysRevE.59.4865), [arXiv cond-mat/9808244](https://arxiv.org/pdf/cond-mat/9808244). Rinaldo, Rigon, Banavar, Maritan & Rodríguez-Iturbe, "Evolution and selection of river networks", PNAS 111(7):2417–2424, 2014, DOI [10.1073/pnas.1322700111](https://doi.org/10.1073/pnas.1322700111). Tarboton, Bras & Rodríguez-Iturbe, WRR 24(8):1317, 1988, DOI [10.1029/WR024i008p01317](https://doi.org/10.1029/WR024i008p01317); Tarboton, [Fractal River Networks](https://hydrology.usu.edu/dtarb/egs01fractalabs.html). Cudennec et al., IAHS, [PDF](https://iahs.info/uploads/dms/13454.51-422--430-S7-47-Cudennec-et-al.pdf). Génevaux, Galin, Guérin, Peytavie & Beneš, "Terrain generation using procedural models based on hydrology", ACM TOG 32(4) 143, 2013, DOI [10.1145/2461912.2461996](https://doi.org/10.1145/2461912.2461996), [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Genevaux13ToG.pdf). Peytavie, Dupont, Guérin, Cortial, Beneš, Gain & Galin, "Procedural Riverscapes", CGF 38(7):35–46, 2019, DOI [10.1111/cgf.13814](https://doi.org/10.1111/cgf.13814), [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Peytavie19CGF.pdf). Paris, Guérin, Collon & Galin, "Authoring and simulating meandering rivers", ACM TOG 42(6), 2023, DOI [10.1145/3618350](https://doi.org/10.1145/3618350), [HAL](https://hal.univ-lorraine.fr/hal-04227965v1). Fischer, Boeckers & Zachmann, "Procedural Generation of Landscapes with Water Bodies Using Artificial Drainage Basins", CGI 2022, [PDF](https://cgvr.cs.uni-bremen.de/papers/cgi22/CGI22.pdf). Pytel, "Erosion, Self-Organization, and Procedural Modeling", PhD thesis, Waterloo, 2015, [UWSpace](https://uwspace.uwaterloo.ca/handle/10012/9085). River deltas L-system + cGAN, [ResearchGate](https://www.researchgate.net/publication/357609433_A_Modular_Generative_Approach_for_Realistic_River_Deltas_When_L-Systems_and_cGANs_Meet). Leopold & Maddock, "The hydraulic geometry of stream channels", USGS PP 252, 1953, DOI [10.3133/pp252](https://doi.org/10.3133/pp252). Leopold & Wolman, USGS PP 282-B, [PDF](https://pubs.usgs.gov/pp/0282b/report.pdf). Ikeda, Parker & Sawai, "Bend theory of river meanders. Part 1", J. Fluid Mech. 112:363–377, 1981, DOI [10.1017/S0022112081000451](https://doi.org/10.1017/S0022112081000451). Howard & Knutson, "Sufficient conditions for river meandering", WRR 20(11):1659–1667, 1984, DOI [10.1029/WR020i011p01659](https://doi.org/10.1029/WR020i011p01659); [meanderpy](https://csdms.colorado.edu/wiki/Model:Meanderpy). Mandelbrot, "How long is the coast of Britain?", Science 156(3775):636–638, 1967, DOI [10.1126/science.156.3775.636](https://doi.org/10.1126/science.156.3775.636), [PDF](https://gis.humboldt.edu/olm/courses/gsp_510/Articles/Mandelbrot1967.pdf). [World Machine forum, beach placement](https://forum.world-machine.com/t/procedural-beach-placement-concavity-vs-convexity-masking/6848); [FlightGear commit](https://git.nayala.duckdns.org/fly/fgdata/commit/fc8342887adf03c78388e65fbea9d1cf98db28c8). Vlachos, "Water Flow in Portal 2", SIGGRAPH 2010 course, [slides](https://www.advances.realtimerendering.com/s2010/Vlachos-Waterflow(SIGGRAPH%202010%20Advanced%20RealTime%20Rendering%20Course).pdf). Grimes, "Making and Using Non-Standard Textures", GDC 2011, [PDF](https://www.hlportal.de/files/GDC2011_BronwenGrimes_NonstandardTextures.pdf). [Horton laws in Tokunaga networks (ResearchGate)](https://www.researchgate.net/publication/307648084_Horton_laws_for_hydraulic-geometric_variables_and_their_scaling_exponents_in_self-similar_Tokunaga_river_networks).

**Section 3 (geology and materials).** Beneš & Forsbach, "Layered Data Representation for Visual Simulation of Terrain Erosion", SCCG 2001, pp. 80–86, [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Benes01SCCG.pdf). Peytavie, Galin, Grosjean & Merillou, "Arches: a Framework for Modeling Complex Terrains", CGF 28(2):457–467, 2009, DOI [10.1111/j.1467-8659.2009.01385.x](https://doi.org/10.1111/j.1467-8659.2009.01385.x), [PDF](https://perso.liris.cnrs.fr/egalin/Articles/2009-arches.pdf). Peytavie, Galin, Grosjean & Merillou, "Procedural Generation of Rock Piles using Aperiodic Tiling", CGF 28(7):1801–1809, 2009, DOI [10.1111/j.1467-8659.2009.01557.x](https://doi.org/10.1111/j.1467-8659.2009.01557.x), [PDF](https://perso.liris.cnrs.fr/egalin/Articles/2009-aperiodic.pdf). Cordonnier, Cani, Benes, Braun & Galin, "Sculpting Mountains: Interactive Terrain Modeling Based on Subsurface Geology", IEEE TVCG 24(5):1756–1769, 2018, [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier18TVCG.pdf), [HAL](https://hal.archives-ouvertes.fr/hal-01517343). Paris, Galin, Peytavie, Guérin & Gain, "Terrain Amplification with Implicit 3D Features", ACM TOG 38(5) 147, 2019, DOI [10.1145/3342765](https://doi.org/10.1145/3342765), [HAL](https://hal.archives-ouvertes.fr/hal-02273097). Galin et al., "A Review of Digital Terrain Modeling", CGF 38(2):553–577, 2019, DOI [10.1111/cgf.13657](https://doi.org/10.1111/cgf.13657); [DEM repository](https://perso.liris.cnrs.fr/eguerin/demrepo/). Talus: [Francou & Manté](https://horizon.documentation.ird.fr/exl-doc/pleins_textes/divers19-08/010048761.pdf); [Miscellanea Geographica 2025](https://reference-global.com/article/10.2478/mgrsd-2025-0032); [Wikipedia: Angle of repose](https://en.wikipedia.org/wiki/Angle_of_repose); [Pearson NEA exemplar](https://qualifications.pearson.com/content/dam/pdf/A%20Level/Geography/2016/teaching-and-learning-materials/NEA-Exemplar-4-Investigation-into-scree-characteristics-candidate-write-up.pdf). Basalt: Goehring, Mahadevan & Morris, PNAS 2009, [PMC2615021](https://pmc.ncbi.nlm.nih.gov/articles/PMC2615021/); Goehring & Morris, JGR 2008, [abstract](https://www.physics.utoronto.ca/nonlinear/abstracts/GM_JGR08abstract.html); [Wikipedia: Columnar jointing](https://en.wikipedia.org/wiki/Columnar_jointing). Limestone: [Burren Geopark sheet 11](https://www.burrengeopark.ie/wp-content/uploads/2013/04/Geology-Sheet-11-Limestone-Pavement.pdf); Scottish Geology Trust geoguides [815](https://geoguide.scottishgeologytrust.org/page/815), [834](https://geoguide.scottishgeologytrust.org/page/834.pdf), [869](https://geoguide.scottishgeologytrust.org/page/869.pdf); [Wikipedia: Limestone pavement](https://en.wikipedia.org/wiki/Limestone_pavement). Granite sheeting: [Thai BEST review](https://ph01.tci-thaijo.org/index.php/bestjournal/article/download/246503/167567/871906); [GW-Project](https://books.gw-project.org/structural-geology-applied-to-fractured-aquifer-characterization/?p=1690); [J. Glaciology](https://www.cambridge.org/core/services/aop-cambridge-core/content/view/FFBADADB84C1279E64A52C62CCAB6868/S002214300002462Xa.pdf/exfoliation-joints-and-ice-action.pdf); [JpGU 2007](https://www2.jpgu.org/meeting/2007/program/pdf/Y162/Y162-P007_e.pdf). Soil: Heimsath, Dietrich, Nishiizumi & Finkel, "The soil production function and landscape equilibrium", Nature 388:358–361, 1997, DOI [10.1038/41056](https://doi.org/10.1038/41056); [Wikipedia: Soil production function](https://en.wikipedia.org/wiki/Soil_production_function); [Heimsath et al. 2005](https://geodynamicsprogram.whoi.edu/wp-content/uploads/sites/14/2018/10/Heimsath_et_al_05_79065.pdf); [SERC humped SPF](https://serc.carleton.edu/42696). Roering, Kirchner & Dietrich, WRR 1999, DOI [10.1029/1998WR900090](https://doi.org/10.1029/1998WR900090); [Landlab TaylorNonLinearDiffuser](https://landlab.readthedocs.io/en/latest/reference/components/taylor_nonlinear_hillslope_flux.html). Beven & Kirkby, Hydrol. Sci. Bull. 24(1):43–69, 1979; [TauDEM TWI](https://hydrology.usu.edu/taudem/taudem5/help53/TopographicWetnessIndex.html); [SAGA TWI](https://saga-gis.sourceforge.io/saga_tool_doc/9.4.1/ta_hydrology_20.html); [Ali et al. 2013](https://water.usask.ca/hillslope/documents/pdfs/2013/13-16%20Ali%20et%20al%202013%20A%20comparison%20of%20wetness....pdf). Paris, Peytavie, Guérin, Argudo & Galin, "Desertscape Simulation", CGF 38(7), 2019, DOI [10.1111/cgf.13815](https://doi.org/10.1111/cgf.13815), [project](https://perso.liris.cnrs.fr/aparis/public_html/projects/paris2019_Deserts.html), [code](https://github.com/aparis69/Desertscapes-Simulation). Cordonnier, Ecormier, Galin, Gain, Benes & Cani, "Interactive Generation of Time-evolving, Snow-Covered Landscapes with Avalanches", CGF 37(2):497–509, 2018, DOI [10.1111/cgf.13379](https://doi.org/10.1111/cgf.13379). Fearing, "Computer Modelling of Fallen Snow", SIGGRAPH 2000, [thesis page](https://www.cs.ubc.ca/labs/imager/th/2000/Fearing2000/). Hsu & Wong, "Simulating Dust Accumulation", IEEE CG&A 15(1):18–22, 1995, [archive](https://webarchive.lib.cuhk.edu.hk/20210324161456mp_/http://www.cse.cuhk.edu.hk/~ttwong/papers/dust/dust.html). Shading: [Wikipedia: Texture splatting](https://en.wikipedia.org/wiki/Texture_splatting); [jMonkeyEngine forum](https://hub.jmonkeyengine.org/t/improved-terrain-splatting-and-parallax-mapping/27844); [Envato Tuts+ triplanar](https://code.tutsplus.com/use-tri-planar-texture-mapping-for-better-terrain--gamedev-13821a); [makegamessa](https://makegamessa.com/discussion/comment/48221/).

**Section 4 (ecosystems, mortality, deadwood).** Cordonnier, Galin, Gain, Benes, Guérin, Peytavie & Cani, "Authoring Landscapes by Combining Ecosystem and Terrain Erosion Simulation", ACM TOG 36(4) 134, 2017, DOI [10.1145/3072959.3073667](https://doi.org/10.1145/3072959.3073667), [PDF](https://cs.purdue.edu/homes/bbenes/papers/Cordonnier17ToG.pdf), [IP Paris record](https://researchportal.ip-paris.fr/en/publications/authoring-landscapes-by-combining-ecosystem-and-terrain-erosion-s/). Peytavie, Gain, Guérin, Argudo & Galin, "DeadWood: Including Disturbance and Decay in the Depiction of Digital Nature", ACM TOG 43(2) 21, 2024, DOI [10.1145/3641816](https://doi.org/10.1145/3641816), [UCT eprint](https://pubs.cs.uct.ac.za/id/eprint/1689/), [code](https://github.com/oargudo/deadwood). Pałubicki, Makowski, Gajda, Hädrich, Michels & Pirk, "Ecoclimates: Climate-Response Modeling of Vegetation", ACM TOG 41(4) 155, 2022, DOI [10.1145/3528223.3530146](https://doi.org/10.1145/3528223.3530146), [SIGGRAPH history](https://history.siggraph.org/?p=117929). Hädrich, Banuti, Pałubicki, Pirk & Michels, "Fire in Paradise: Mesoscale Simulation of Wildfires", ACM TOG 40(4) 163, 2021, DOI [10.1145/3450626.3459954](https://doi.org/10.1145/3450626.3459954), [Google Research](https://research.google/pubs/fire-in-paradise-mesoscale-simulation-of-wildfires/). Pirk, Niese, Hädrich, Benes & Deussen, "Windy Trees", ACM TOG 33(6) 204, 2014, DOI 10.1145/2661229.2661252 (recall). Makowski, Hädrich, Scheffczyk, Michels, Pirk & Pałubicki, "Synthetic Silviculture: Multi-scale Modeling of Plant Ecosystems", ACM TOG 38(4) 131, 2019, DOI 10.1145/3306346.3323039, [PDF](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf). Mortality: [SORTIE parameters, bg-2019-210 supplement](https://bg.copernicus.org/preprints/bg-2019-210/bg-2019-210-supplement.pdf); [Kubo review](https://catalog.lib.kyushu-u.ac.jp/opac_download_md/25084/kubo.pdf); [PIK 4C species parameters](https://www.pik-potsdam.de/~lasch/Dokumente/species_par.doc); Keane et al., "Tree mortality in gap models", Climatic Change 51, 2001, [record](https://archive.jornada.nmsu.edu/node/51013). Snags: [NR Fire Science review (Russell et al. 2006)](https://nrfirescience.org/node/8142); [USU Fire Effects session](https://digitalcommons.usu.edu/nafecology/sessions/fire_effects/3). Decay: Harmon et al., "Ecology of coarse woody debris in temperate ecosystems", Adv. Ecol. Res. 15:133–302, 1986, [record](https://andrewsforest.oregonstate.edu/node/13120), via [Black Rock Forest](https://www.blackrockforest.org/wp-content/uploads/2021/03/res_pub_burdette_c_cwd_12.10.07.pdf) and [Forest Encyclopedia](https://old.forestencyclopedia.net/c/c1368/?showNav=n); Hararuk & Didion, Forest Ecosystems 7:36, 2020, DOI [10.1186/s40663-020-00248-x](https://doi.org/10.1186/s40663-020-00248-x); Mackensen, Bauhus & Webber, Aust. J. Botany 51:27–37, 2003, DOI [10.1071/BT02014](https://doi.org/10.1071/BT02014); Zell, Kändler & Hanewinkel, Ecol. Modelling 220:904–912, 2009, DOI [10.1016/j.ecolmodel.2009.01.020](https://doi.org/10.1016/j.ecolmodel.2009.01.020); [J. Ecol. Environ. 34(1):115](https://accesson.kr/jecoenv/assets/pdf/6788/journal-34-1-115.pdf); Larix gmelinii, J. For. Res. 2020, DOI [10.1007/s11676-020-01270-z](https://doi.org/10.1007/s11676-020-01270-z); [Janisch et al. 2005](https://andrewsforest.oregonstate.edu/sites/default/files/lter/pubs/pdf/pub4305.pdf). Pit-and-mound: Schaetzl & Follmer, Geomorphology 3:113–123, 1990, [USGS record](https://pubs.usgs.gov/publication/70016198); [Sass et al. 2018](https://harvardforest1.fas.harvard.edu/publications/pdfs/Sass_CanJForRes_2018.pdf); [Harvard Forest notes](https://harvardforest.fas.harvard.edu/notes/pits-and-mounds-diminished-elements-in-a-second-growth-landscape/). Architecture: Hallé, Oldeman & Tomlinson, *Tropical Trees and Forests*, Springer 1978, via [Oxford](https://www.tropicalforests.ox.ac.uk/?p=543) and [WashU tribute](https://profiles.wustl.edu/en/publications/francis-hall%C3%A9-19382025-founder-of-the-study-of-tree-architecture/); AMAP, [HAL INRAE](https://hal.inrae.fr/hal-02701876/document), [IRD](https://horizon.documentation.ird.fr/exl-doc/pleins_textes/pleins_textes_6/colloques2/40855.pdf). Rendering: [three.js octahedral impostors](https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735); [Cinevva part 19](https://app.cinevva.com/blog/2026-05-04-open-world-browser-part-19-imposters); [Pixyz impostor docs](https://docs.unity3d.com/Packages/com.unity.pixyz.plugin4unity@2.0/manual/create-impostors.html); [three.js forum, trees](https://discourse.threejs.org/t/trees/14559/2); [TU Wien report](https://www.cg.tuwien.ac.at/research/publications/2006/G_P_06_RFS/G_P_06_RFS-Report.pdf).

**Section 5 (large regions, climate, LOD, look).** Galin, Guérin, Peytavie, Cordonnier, Cani, Benes & Gain, "A Review of Digital Terrain Modeling", CGF 38(2):553–577, 2019, DOI [10.1111/cgf.13657](https://doi.org/10.1111/cgf.13657), [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Galin19CGF.pdf). Guérin, Digne, Galin & Peytavie, "Sparse representation of terrains for procedural modeling", CGF 35(2):177–187, 2016, DOI [10.1111/cgf.12821](https://doi.org/10.1111/cgf.12821). Argudo et al., "Orometry-based terrain analysis and synthesis", ACM TOG 38(6) 199, 2019, DOI [10.1145/3355089.3356535](https://doi.org/10.1145/3355089.3356535), [PDF](https://people.cs.uct.ac.za/~jgain/wp-content/papercite-data/pdf/argudo2019.pdf). Argudo et al., "Coherent multi-layer landscape synthesis", Visual Computer 33(6–8):1005–1015, 2017, DOI [10.1007/s00371-017-1393-6](https://doi.org/10.1007/s00371-017-1393-6). Argudo, Guérin, Schott & Galin, "Terrain descriptors for landscape synthesis, analysis and simulation", CGF 44(2), 2025, DOI [10.1111/cgf.70080](https://doi.org/10.1111/cgf.70080) (not read). [WitchySim](https://witchymonster.itch.io/witchysim). World Machine forum: [big maps](https://forum.world-machine.com/t/better-erosion-support-in-big-maps/4082), [seams](https://forum.world-machine.com/t/too-obvious-seams-in-tiled-output/3710), [tiling](https://forum.world-machine.com/t/tiling-issue/2896?page=2). Lim, Tan & Bhojan, "Visually Improved Erosion Algorithm for the Procedural Generation of Tile-based Terrain", GRAPP 2022, DOI [10.5220/0010799700003124](https://doi.org/10.5220/0010799700003124). Goslin, "InfiniteDiffusion", [arXiv 2512.08309](https://arxiv.org/abs/2512.08309). Minecraft: [Fabric MultiNoiseUtil docs](https://maven.fabricmc.net/docs/yarn-1.18.2+build.1/net/minecraft/world/biome/source/util/MultiNoiseUtil.NoiseHypercube.html), [Snowcapped](https://github.com/jacobsjo/snowcapped), [dawnosaur](https://dawnosaur.substack.com/p/how-minecraft-generates-worlds-you), [MC-239790](https://bugs.mojang.com/browse/MC-239790). [PulseGeek terrain stitching](https://pulsegeek.com/articles/terrain-stitching-and-chunking-seamless-streaming/). Losasso & Hoppe, "Geometry clipmaps", ACM TOG 23(3), 2004, [project](https://hhoppe.com/proj/geomclipmap/), [PDF](https://www.hhoppe.com/geomclipmap.pdf). Asirvatham & Hoppe, "Terrain Rendering Using GPU-Based Geometry Clipmaps", GPU Gems 2 ch. 2, 2005, [NVIDIA](https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-2-terrain-rendering-using-gpu-based-geometry). Strugar, "Continuous Distance-Dependent Level of Detail for Rendering Heightmaps", JGGGT, 2009, DOI [10.1080/2151237X.2009.10129287](https://doi.org/10.1080/2151237X.2009.10129287), [code](https://github.com/fstrugar/CDLOD). Ulrich, "Rendering massive terrains using chunked level of detail control", SIGGRAPH 2002 course notes, [Crossref](https://api.crossref.org/works/10.1145%2F2077378.2077415). Cesium: [QuantizedMeshTerrainData](https://cesium.com/learn/cesiumjs/ref-doc/QuantizedMeshTerrainData.html), [forum](https://community.cesium.com/t/maximum-terrain-tiles-level-of-detail/1948), [cesium-martini](https://github.com/mlim15/cesium-martini). [Babylon forum, terrain LOD](https://forum.babylonjs.com/t/advanced-terrain-with-lod/49385); [lod-terrain npm](https://www.npmjs.com/package/lod-terrain); [Cinevva part 12](https://app.cinevva.com/blog/2026-02-25-open-world-browser-part-12-lessons); [Olluo clipmap demo](https://github.com/Olluo/geometry-clipmaps-demo). Smith & Barstad, "A Linear Theory of Orographic Precipitation", J. Atmos. Sci. 61(12):1377–1391, 2004, DOI [10.1175/1520-0469(2004)061<1377:ALTOOP>2.0.CO;2](https://doi.org/10.1175/1520-0469(2004)061%3C1377:ALTOOP%3E2.0.CO;2), [AMS abstract](https://ams.confex.com/ams/10Meso/techprogram/paper_62756.htm), [AMS PDF](https://ams.confex.com/ams/pdfpapers/62756.pdf); [HESS 14:2329, 2010](https://hess.copernicus.org/articles/14/2329/2010/); [orographic_precipitation](https://pypi.org/project/orographic_precipitation/0.1rc0/). Jenny, Heitzler, Singh, Farmakis-Serebryakova, Liu & Hurni, "Cartographic Relief Shading with Neural Networks", IEEE TVCG 27(2):1225–1235, 2021, DOI [10.1109/TVCG.2020.3030456](https://doi.org/10.1109/TVCG.2020.3030456), [arXiv 2010.01256](https://arxiv.org/pdf/2010.01256). Jenny, "An Interactive Approach to Analytical Relief Shading", Cartographica 38(1–2):67–75, 2001, DOI [10.3138/F722-0825-3142-HW05](https://doi.org/10.3138/F722-0825-3142-HW05). Leonowicz, Jenny & Hurni, "Terrain Sculptor", Cartographic Perspectives 67:51–60, 2010, DOI [10.14714/cp67.114](https://doi.org/10.14714/cp67.114). [Monash 2022 generalised relief](https://research.monash.edu/en/publications/neural-networks-for-generalized-relief-shading-contour-lines-and-/). Realism: [Wikipedia: Hack's law](https://en.wikipedia.org/wiki/Hack%27s_law); [J. Hohai Univ. 2025](https://jour.hhu.edu.cn/szybh/article/abstract/20250203); [Tarboton 1996 J. Hydrol.](https://hydrology.usu.edu/dtarb/TarbotonFractalRiverNetworksJH96.pdf); [SERC hypsometry](https://serc.carleton.edu/13751); [Britannica](https://www.britannica.com/print/article/280163); [arXiv physics/9705033](https://arxiv.org/pdf/physics/9705033).

**Local precedents (this repository).** `papers/fractals/silviculture-envsim.js` and `silviculture-env.js` (current terrain, climate and plant-scale ecosystem); the moshine M8 commit 0dd7db3 (integer kernels, deterministic JS math); the fractal paper research brief, `papers/study/reports/Fractal paper research brief.md` §5 (Synthetic Silviculture).
