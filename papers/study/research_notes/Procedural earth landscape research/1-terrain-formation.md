# Terrain formation by physical processes (uplift, fluvial / hydraulic / thermal / glacial erosion) for a browser build

Scope: exact models, parameters, landforms, cost, validation; which combination gives the most Earth-like large region in a browser in seconds. Ecosystems are covered by another researcher; learned terrain is context only.

Research date 2026-10-13. Primary PDFs read in full text where marked "(read)". HAL (hal.science) was blocked by a bot wall for every request, so Schott et al. 2023 and Braun & Willett 2013 were not read in full (see Gaps).

---

## Q1. Stream power law + tectonic uplift (Cordonnier et al. 2016; Braun & Willett 2013; GPU successors)

### Takeaway
Uplift + stream power, dh/dt = U − K A^m S^n with n = 1 and m ≈ 0.4–0.5, solved implicitly along the drainage tree (Braun & Willett 2013), is the standard large-scale "physically-based" generator. It converges in roughly 100–300 large time steps. The GPU descendants fit a browser budget: FastFlow (2024) does 2048² × 200 implicit iterations in under 10 s; Schott 2023 is a single-pass explicit compute shader. The 2016 paper's own validation is visual only.

### Cited Findings

**Cordonnier, Braun, Cani, Benes, Galin, Peytavie, Guérin 2016 (read).** "Large Scale Terrain Generation from Tectonic Uplift and Fluvial Erosion", Computer Graphics Forum 35(2), Eurographics 2016, DOI 10.1111/cgf.12820 — [PDF (Purdue)](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf); [EG DL](https://diglib.eg.org/handle/10.1111/cgf12820)
- Governing equation (their Eq. 1): dh(p)/dt = u(p) − k A(p)^m s(p)^n, where s = ∇h is the slope and A(p) is the drainage area. A(p) is the area of all points with a path of strictly increasing height that ends at p. k lumps lithology, vegetation and climate — [Cordonnier16](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf)
- Exponents: "m/n ≈ 0.5 [WT99]… As in most geomorphological studies, we use n = 1 and m = 0.5." The equation is valid at 10^5–10^7 yr and over tens to hundreds of km. At those scales it "captures the way a complex relief emerges from a supposedly flat part of the continental crust" — [Cordonnier16](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf)
- Drainage graph:
  - Points are Poisson-disc sampled over the domain and joined by a (constrained) Delaunay triangulation. The authors chose this over a regular grid because it gives "more plausible directions for local streams".
  - Each node gets area a_k = its Voronoi cell area, height 0 initially, uplift u_k = U(p_k).
  - Border nodes are river mouths at sea level.
  - Each node's receiver is its lowest neighbour. Stream trees are oriented from leaves to roots, and roots are lakes or outflows.
  - Drainage: A_k = a_k + Σ_children A_l. It is computed in O(N) by a BFS order, then reverse traversal (leaves → root) — [Cordonnier16](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf)
- Lakes:
  - Every node draining to an internal root gets that lake's id. A lake graph G_L connects lakes through "passes": the lowest pair of adjacent nodes between two lakes, with pass height = max(h_i, h_j).
  - Trees of lakes are grown from the border outlets by adding candidate arcs in increasing pass-height order (a priority queue). Each chosen arc reroutes the lake bottom to the pass node.
  - Cost is O(N + M log M) for M lakes, versus O(N√N) for the optional lake step in Braun & Willett 2013.
  - Without lake connection, the network still has many local-minimum discontinuities even after many iterations — [Cordonnier16](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf)
- Implicit solver (their Eq. 2, n = 1, slope taken to the receiver j):
  h_i(t+δt) = [h_i(t) + δt·u_i + (k A_i^m / ‖p_i − p_j‖)·δt·h_j(t+δt)] / [1 + (k A_i^m / ‖p_i − p_j‖)·δt]
  Nodes are processed root → leaves so that h_j(t+δt) is already known. O(N) — [Cordonnier16](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf)
- Thermal correction: in low-drainage areas stream power alone "produces unrealistic sharp and high peaks". The fix: if the update would give slopes above 30°, the elevation change is reduced so slopes stay within range.
  - A uniform 30° talus gives "very regular geometric valleys".
  - Modulating the maximum slope with 3-D Perlin noise between 6° and 54° gives more natural variety.
  - A height-dependent maximum slope gives crest cliffs — [Cordonnier16](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf)
- Parameters:
  - Domain 50 × 50 km².
  - Maximum uplift U = 5.0×10⁻⁴ m/yr, described as "the average uplift among earth mountains".
  - k = 5.61×10⁻⁷ yr⁻¹ (with m = 0.5 the units of k are yr⁻¹), chosen so mountains reach about 2 000 m.
  - Time step δt = 2.5×10⁵ yr.
  - Only the ratio u/k matters for relief: "h_max = 2.244 u/k" (text says km; with the stated values u/k ≈ 891, which gives ≈ 2 000 only if read in metres — an internal unit inconsistency) — [Cordonnier16](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf)
- Convergence: mountains are formed by about 50 iterations; geometry stops changing after 100–300; convergence is reached after about 200 steps. Because the solver is implicit, iteration count does not depend on terrain resolution — [Cordonnier16](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf)
- Runtime (C++, single-threaded i7 at 3 GHz, "not fully optimized"):

  | Samples | Per step | Convergence |
  |---|---|---|
  | 10 000 | 0.031 s | 6.4 s |
  | 40 000 | 0.177 s | 35.4 s |
  | 90 000 | 0.401 s | 78 s |
  | 160 000 | 1.273 s | 252 s |

  — [Cordonnier16](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf)
- Output: a coarse graph. The final DEM is either Gaussian-kernel splatting of node heights or the procedural ridge/valley/river primitives of Génevaux et al. 2015. That last step adds non-physical detail ("artistic liberty") — [Cordonnier16](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf)
- Uplift-map effects: the uplift gradient matters more than the uplift shape.
  - A smooth gradient gives straight valleys along the gradient direction.
  - Piecewise-constant steps give more random valleys with jumps.
  - Lower uplift gives smaller valleys.
  - Stream power with no uplift can "hydrologically fix" a fractal terrain, but it converges to flat, so it needs small δt and few iterations — [Cordonnier16](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf)
- Validation (in the authors' words): "Our validations are based only on our observations." There is a side-by-side visual comparison with the San Gabriel Mountains (USGS DEM) and a partial visual check by a co-author geologist. No quantitative statistics were reported — [Cordonnier16](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf)

**Braun & Willett 2013.** "A very efficient O(n), implicit and parallel method to solve the stream power equation governing fluvial incision and landscape evolution", Geomorphology 180–181:170–179, DOI 10.1016/j.geomorph.2012.10.008 — [Landlab citation](https://landlab.readthedocs.io/en/latest/generated/api/landlab.components.stream_power.fastscape_stream_power.html); [EGU2013 abstract](https://meetingorganizer.copernicus.org/EGU2013/EGU2013-6718.pdf)
- Usually called "FastScape". Landlab's FastscapeEroder implements it. The scheme "is nominally implicit and reaches a correct steady-state solution regardless of timestep length, but transient results are not fully timestep-independent" (discussed in the paper's Appendix B) — [Landlab docs (search summary)](https://landlab.readthedocs.io/en/latest/generated/api/landlab.components.stream_power.fastscape_stream_power.html)

**Schott, Paris, Fournier, Guérin, Galin 2023.** "Large-scale Terrain Authoring through Interactive Erosion Simulation", ACM TOG 42, DOI 10.1145/3592787. Preprint at hal-04049125; code (MIT) at [github.com/H-Schott/StreamPowerErosion](https://github.com/H-Schott/StreamPowerErosion).
- Abstract: authors model "in the uplift domain" and run stream power erosion with "a fast yet accurate approximation of drainage area and flow routing" to make it interactive. Tools include copy-paste, warping for folds and faults, and point/curve elevation constraints. It also supports inverse modelling (reconstructing uplift from a DEM) and hydrologically consistent blending of patches — [Semantic Scholar abstract](https://api.semanticscholar.org/graph/v1/paper/DOI:10.1145/3592787); [SIGGRAPH history](https://history.siggraph.org/learning/large-scale-terrain-authoring-through-interactive-erosion-simulation-by-schott-paris-fournier-guerin-and-galin)
- Released compute shader (data/shaders/spe_shader.glsl, GLSL 450, 8×8 workgroups, read). The whole step is one gather-only, ping-pong pass, so it ports directly to WebGPU and plausibly to WebGL2 fragment shaders. Per cell:
  1. Drainage proxy: `stream = cellDiag + Σ_8 neighbours stream(q)·w(q→p)`. The weight is w = s^p_flow / Σ(downhill s^p_flow), i.e. multiple-flow-direction weighting with p_flow = 1. Drainage therefore propagates only one ring per iteration.
  2. Erosion relative to the D8 steepest receiver: `spe = k·noise·stream^p_sa·slope^p_sl`.
  3. Optional extra terms: hillslope `−k_h·∇²h` and debris `−k_d·slope`.
  4. Update: `h ← max(h − dt·(...)·noiseFactor, h_receiver) + dt·uplift·U(x)`. The clamp prevents pits and stands in for lake handling. Border cells are fixed at h = 0.
  - Shader defaults: uplift = 0.03, k = 0.0005, k_d = 10, k_h = 200, p_sa (m) = 0.8, p_sl (n) = 2.0 (so m/n = 0.4), dt = 50.
  - Units are not stated; grid units appear normalised — [spe_shader.glsl](https://github.com/H-Schott/StreamPowerErosion)
- Critique by Jain et al. 2024 (FastFlow): Schott's "approximate variant… propagates discharge by a few cells on each time step… requires a stable river network and thus precludes outside terrain forces such as time-dependent tectonics or sediment deposition". It also uses explicit stepping, which "requires many timesteps". It fails when eroding an existing terrain that has depressions, and when noise is added to uplift — [FastFlow PDF](https://people.cs.uct.ac.za/~jgain/wp-content/papercite-data/pdf/jain2024.pdf)

**Jain, Kerbl, Gain, Finley, Cordonnier 2024 (read).** "FastFlow: GPU Acceleration of Flow and Depression Routing for Landscape Simulation", Pacific Graphics 2024 / CGF, DOI 10.1111/cgf.15243 — [PDF](https://people.cs.uct.ac.za/~jgain/wp-content/papercite-data/pdf/jain2024.pdf)
- Algorithms: GPU flow routing (discharge) in O(log n) iterations, using tree pointer-jumping (α[c] ← α[c]·α[recipient(c)] over log₂|T| rounds). Depression routing (routing water out of local minima) converges in O(log² n). The overall bound is O(log n + log² L) for L depressions — [FastFlow](https://people.cs.uct.ac.za/~jgain/wp-content/papercite-data/pdf/jain2024.pdf)
- Performance (Nvidia RTX A6000):
  - Flow routing 5× faster than earlier GPU methods (Barnes 2019; Schott 2023).
  - Depression routing 34–52× faster than an optimised parallel CPU method at 1024².
  - Under 55 ms on terrains up to 4096².
  - "A 300,000 year-old mountain, generated on a 2048 × 2048 grid in under 10 seconds, incorporating fluvial erosion, sediment deposition, and river and lake formation" (200 iterations).
  - Implicit and semi-implicit deposition match visually (100 iterations, Δt = 2000 yr, Δx = 16 m, 2048²) — [FastFlow](https://people.cs.uct.ac.za/~jgain/wp-content/papercite-data/pdf/jain2024.pdf)
- Implementation is PyTorch/TensorFlow with custom CUDA, and the code is public. Single flow direction (SFD) only; multiple flow directions are left as future work — [FastFlow](https://people.cs.uct.ac.za/~jgain/wp-content/papercite-data/pdf/jain2024.pdf)

**Tzathas, Gailleton, Steer, Cordonnier 2024.** "Physically-based analytical erosion for fast terrain generation", CGF 43(2), Eurographics 2024, DOI 10.1111/cgf.15033 — [abstract via Semantic Scholar](https://api.semanticscholar.org/graph/v1/paper/DOI:10.1111/cgf.15033); [EG DL](https://diglib.eg.org/handle/10.1111/cgf15033)
- Uses analytical solutions of the stream power law, so time becomes "a slider that controls the aging of the input terrain". 1-D solutions are extended to 2-D heightmaps with "a multigrid accelerated iterative process", plus landslides and hillslope processes. Full text not retrieved: runtimes and GPU use are unverified.

**Schott et al. 2024 follow-up (amplification).** "Terrain amplification using multi scale erosion" is listed by [Adobe Research](https://research.adobe.com/publication/terrain-amplification-using-multi-scale-erosion). Not read.

**Cordonnier, Galin, Gain, Benes, Guérin, Peytavie, Cani 2017 (read, summary only).** "Authoring Landscapes by Combining Ecosystem and Terrain Erosion Simulation", ACM TOG 36(4) (SIGGRAPH 2017), DOI 10.1145/3072959.3073667 — [PDF (Purdue)](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier17ToG.pdf)
- Representation: a layered terrain (bedrock, sand, humus) plus vegetation layers (grass, shrubs, trees), with two-way feedback between erosion and vegetation.
- Processes: rain, gravity, temperature, wind, fire, lightning and landslides are all modelled as stochastic, bounded-volume "events" rather than lockstep PDEs. The authors say lockstep PDEs are unstable when combined with chaotic events.
- Time step Δt = 1 yr; the simulation runs over "a few centuries". Validation is "side-by-side comparison with real terrains" (visual).
- This is a different timescale from uplift (10⁵–10⁷ yr). It is a post-pass for surface detail, not for forming relief — [Cordonnier17](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier17ToG.pdf)

**Process laws used in the 2024 debris-flow paper (read).** Jain, Benes, Cordonnier, "Efficient Debris-flow Simulation for Steep Terrain Erosion", ACM TOG 43(4) Art. 58, DOI 10.1145/3658213 — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Arymaan24ToG.pdf)
- Fluvial erosion and deposition (from Yuan et al. 2019): F = −k_f Q_w^m ‖∇z‖^n + k_d Q_s/Q_w.
  - Q_w = ∬_A p dx² is the upstream integral of precipitation (with p = 1 it equals the drainage area).
  - Q_s = −∬_A F dx² is the upstream sediment flux.
  - m = 0.4, n = 1.
- Hillslope: H = k_h ∇²z, explicit 4-neighbour Laplacian.
- Thermal: E_th = k_th(‖∇z‖ − tan θ_c)₊.
- Layers: bedrock b, sediment s and debris d, with z = b + s + d.
- Parameter table:

  | Parameter | Value |
  |---|---|
  | U | 0.0012 m/yr |
  | k_f | 0.0007 m^(1−2m)/yr |
  | k_d | 0.01 |
  | k_h | 0.04 m²/yr |
  | k_df | 0.001 |
  | α, β | 0.08, 1 |
  | k_τ | 0.3 |
  | α_τ, β_τ | 0.25, 1 |
  | k_th | 0.005 m/yr |
  | θ_c | 37° |

- Runs: 1024² at Δx = 8 m, with Δt = 10–300 yr stable. 1 600 iterations took 32 s (0.02 s/iteration) in PyTorch on an RTX A6000. Code at gitlab.inria.fr/landscapes/debrisflow.
- Lakes: water surface w(i) = max(z(i), z(outflow)), and sediment is deposited below the water level.
- Landforms: debris-flow scars on steep slopes and debris fans, instead of the "unrealistically uniform slopes" that thermal erosion gives — [Jain24 debris](https://www.cs.purdue.edu/homes/bbenes/papers/Arymaan24ToG.pdf)

### Inferences
- For a browser, the 2016 graph method (Poisson + Delaunay + priority-queue lakes + root→leaf sweep) is inherently sequential. A JS/WASM CPU port at about 10⁵ nodes would land in tens of seconds, judging from the 2016 timings. The GPU grid variants (FastFlow-style implicit with pointer jumping, or Schott-style explicit single-pass) are the realistic route to "seconds".
- Schott's shader is the simplest thing to port to WGSL: one pass, gather-only, no atomics. Its drainage propagates one cell per iteration, though, so it needs about as many iterations as the longest river is long, in cells (thousands at 1024²–2048²). That matches FastFlow's remark that such methods "usually require as many iterations as the length of the longest river (∼√n)".
- FastFlow's pointer-jumping accumulation is also gather-style, since each cell reads its recipient's values, so it should map to WGSL compute. Depression routing (MST over basins) is the hardest part to port. Whether the CUDA kernels rely on atomics or scatter writes was not verified.
- Defaults vary across papers (m = 0.5 / n = 1 in 2016; m = 0.4 / n = 1 in 2023–24 Inria papers; m = 0.8 / n = 2 in Schott's shader). m/n stays in 0.4–0.5, which matches the measured concavity θ ≈ 0.45 (Q5).

### Gaps
- Braun & Willett 2013 full text not read (Elsevier; HAL blocked). These details are from memory, not verified here: D8 receivers, donor arrays, a "stack" ordering built by recursion from base level, Newton–Raphson for n ≠ 1, and parallelism across independent catchments.
- Schott 2023 full text (HAL) blocked: its reported resolutions, runtimes and parameter units are unverified. The shader defaults above come from the released code, not the paper.
- Tzathas 2024 full text not retrieved: runtime and resolution unknown.

---

## Q2. Hydraulic erosion (Musgrave 1989; Mei 2007; Šťava 2008; particle/droplet; WebGPU feasibility)

### Takeaway
Shallow-water "virtual pipe" erosion (Mei et al. 2007) is a fully local five-step stencil. It runs about 4 ms/iteration at 512² and 15 ms at 1024² on a 2008 GPU, so it is easily WebGPU- and WebGL2-feasible at 512²–2048². It works on timescales of rain events, not geology: it carves gullies and deposits sediment on an existing relief but cannot build mountain ranges. Use it as a detail or post-pass after stream power.

### Cited Findings
- **Musgrave, Kolb, Mace 1989.** "The synthesis and rendering of eroded fractal terrains", SIGGRAPH '89 / Computer Graphics 23(3), DOI 10.1145/74334.74337. It introduced "noise synthesis" with locally varying fractal dimension, and "a simple physical erosion model… which simulates hydraulic and thermal erosion processes to create global stream/valley networks and talus slopes" — [OpenAlex abstract](https://api.openalex.org/works/doi:10.1145/74334.74337)
- **Mei, Decaudin, Hu 2007.** "Fast Hydraulic Erosion Simulation and Visualization on GPU", Pacific Graphics 2007, pp. 47–56, DOI 10.1109/PG.2007.15 — [Semantic Scholar](https://api.semanticscholar.org/graph/v1/paper/DOI:10.1109/PG.2007.15); [hgpu](https://hgpu.org/?p=2256). The equations below are as restated by Jakó & Tóth 2011, "Fast Hydraulic and Thermal Erosion on GPU", CESCG 2011 (non-peer-reviewed), which explicitly builds on Mei 2007 — [PDF (read)](https://www.old.cescg.org/CESCG-2011/papers/TUBudapest-Jako-Balazs.pdf)
  - State per cell: terrain b, water d, suspended sediment s, outflow flux f = (f_L, f_R, f_T, f_B), velocity v.
  - 1. Water increment: d₁ = d_t + Δt·r_t·K_r (rain).
  - 2. Pipe flux: f^L_{t+Δt} = max(0, f^L_t + Δt·A·g·Δh^L/l), with Δh^L = b + d₁ − b(x−1) − d₁(x−1).
    - Scale by K = min(1, d₁·l_x·l_y / (Σf·Δt)) so a cell cannot output more water than it holds. (Jakó prints "max"; the intent is clearly a ≤ 1 scaling.)
    - Volume update: ΔV = Δt(Σf_in − Σf_out), and d₂ = d₁ + ΔV/(l_x l_y).
    - Velocity from the mean flux through the cell: ΔW_x = ½(f_R(x−1) − f_L(x) + f_R(x) − f_L(x+1)).
  - 3. Transport capacity: C = K_c · sin(α) · |v|, where α is the local tilt. Jakó adds a depth limiter l_max(d) and uses −N·V instead of sin α.
    - If C > s: b ← b − Δt·R·K_s(C − s) and s ← s + Δt·R·K_s(C − s) (dissolve).
    - Otherwise: b ← b + Δt·K_d(s − C) and s ← s − Δt·K_d(s − C) (deposit).
  - 4. Sediment advection (semi-Lagrangian): s_{t+Δt}(x, y) = s₁(x − u·Δt, y − v·Δt).
  - 5. Evaporation: d_{t+Δt} = d₃(1 − K_e·Δt). This is needed in the model "because the scene would fill up with water".
  - Jakó's default constants (Mei-derived; ranges in brackets):

    | Constant | Default | Range |
    |---|---|---|
    | Δt | 0.02 | 0–0.05 |
    | K_r | 0.012 | 0–0.05 |
    | K_e | 0.015 | 0–0.05 |
    | A (pipe cross-section) | 20 | 0.1–60 |
    | g | 9.81 | |
    | K_c | 1 | 0.1–3 |
    | K_s | 0.5 | 0.1–2 |
    | K_d | 1 | 0.1–3 |
    | K_h (softening) | 5 | 0–10 |
    | K_dmax | 10 | 0–40 |
    | K_a (talus tangent coefficient) | 0.8 | 0–1 |
    | K_i (talus bias) | 0.1 | 0–1 |

    — [Jakó 2011](https://www.old.cescg.org/CESCG-2011/papers/TUBudapest-Jako-Balazs.pdf)
  - Performance, ms per iteration (CPU vs GPU, ATI Radeon HD4870 as GPU2):

    | Grid | CPU | GPU |
    |---|---|---|
    | 256² | 102 | 1.01 |
    | 512² | 413 | 3.84 |
    | 1024² | 1647 | 15.5 |

    — [Jakó 2011](https://www.old.cescg.org/CESCG-2011/papers/TUBudapest-Jako-Balazs.pdf)
- **Šťava, Beneš, Brisbin, Křivánek 2008 (read).** "Interactive Terrain Modeling Using Hydraulic Erosion", Eurographics/ACM SIGGRAPH Symposium on Computer Animation 2008 — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Stava-2008-Interactive_Terrain_Modeling_Using_Hydraulic_Erosion.pdf)
  - Couples two water-erosion modes: dissolution erosion dominates where flow is slow, and force-based (Mei-type capacity) erosion where flow is fast.
  - Adds slippage, so undercut riverbanks collapse, with talus angle 30°.
  - Up to 4 material layers, each with its own per-layer capacity and dissolving constants.
  - "At least 20 fps… for scenes with grid resolution of 2048 × 1024 and four layers of material" on a GeForce 8800 GTX. Large terrains are handled by tiling.
  - Landforms shown: rivers, meanders, meander breaks, drying lakes.
- **Particle/droplet erosion.** Galin's Heightfield library has a GPU particle hydraulic erosion class, and its docs note a race condition when threads write elevation concurrently — [Heightfield docs](https://perso.liris.cnrs.fr/eric.galin/Doc/Heightfield/class_g_p_u_hydraulic_erosion_particle.html)
  - WebGPU ports of the droplet method store heights as fixed-point i32 and use atomicAdd/atomicSub, because WGSL has no float atomics. This raises determinism questions — [Cinevva blog](https://app.cinevva.com/blog/2026-05-13-open-world-browser-part-27-island-and-terrain); [r/webgpu thread](https://redlib.ssps.io/r/webgpu/comments/1k6vdwb/hydraulic_erosion_with_atomics)
  - A Unity compute-shader droplet implementation simulates 10⁶ drops in about 10 s — [10Kaiser10/hydraulic-erosion](https://github.com/10Kaiser10/hydraulic-erosion)
- **Existing browser demos:**
  - An Eulerian, multigrid-inspired WebGPU hydraulic erosion with no atomics and FD8 multi-flow routing — [itch.io](https://sapereaude1490.itch.io/multigrid-eulerian-erosion). An earlier version adds wetness-dependent repose angle — [itch.io](https://sapereaude1490.itch.io/eulerian-erosion)
  - A WebGPU terrain editor with thermal and simplified hydraulic kernels — [IoTone/burisu](https://github.com/IoTone/burisu)
  - None of the browser demos found implement stream power — [search summary](https://sapereaude1490.itch.io/multigrid-eulerian-erosion)
- Galin's lecture taxonomy: hydraulic erosion is either Eulerian (shallow water) or Lagrangian (SPH or particles) — [Galin 2024 course slides](https://perso.liris.cnrs.fr/eric.galin/M2/Landscapes/3-erosion-simulation.pdf)

### Inferences
- In WebGPU compute, Mei/Jakó is 4–5 gather passes over 2–3 rgba32float textures. In WebGL2 it is the same with fragment-shader ping-pong (needs EXT_color_buffer_float). 1024² at a few ms/iteration on a modern laptop GPU is realistic, given 15 ms on a 2008 HD4870, but that is an estimate, not a measurement.
- Hydraulic constants (K_c, K_s, K_d, K_e, A, l) are dimensionless "game" units with no geophysical calibration. This is the main "artistic liberty" in hydraulic erosion. Stream power, by contrast, has m/n and K, U in real units.
- Droplet erosion needs float atomics, which WGSL lacks; fixed-point workarounds introduce non-determinism. Grid-based Mei is preferable for reproducible, seedable output.

### Gaps
- Mei 2007's original constant values and their units were not retrieved (IEEE paywall); only Jakó's Mei-derived defaults are reported.
- No primary source was fetched for Beneš's particle/droplet erosion papers (e.g., Beneš & Forsbach 2002; Beneš 2007), nor for the widely used Beyer 2015 droplet thesis.
- No quantitative realism validation of hydraulic erosion against DEM statistics was found in any of these papers.

---

## Q3. Thermal erosion / talus, and glacial erosion

### Takeaway
Thermal erosion is a slope-threshold diffusion: material moves wherever slope exceeds tan θ_c, with θ_c ≈ 30–37° in CG papers. It is a necessary complement to stream power in low-drainage areas. Debris flow (2024) or a noise-modulated θ_c avoids the artificial uniform-slope look. Glacial erosion (Cordonnier 2023) produces U-valleys, cirques, horns and fjords, but it needs a CNN ice-flow model at about 300 ms/step at 1024². It is out of scope for "seconds in a browser" unless approximated.

### Cited Findings
- **Thermal model:** ∂h/∂t = −k(s(p) − tan θ) if s(p) > tan θ, else 0 (Kelley et al. 1988; Musgrave 1989). Material moves to lower 8-neighbours with fraction ε_k = ε·s_kⁿ / Σ s_iⁿ, where n = 1 is diffusive and n → ∞ is steepest descent. It generalises to material stacks (Peytavie 2009) — [Galin course](https://perso.liris.cnrs.fr/eric.galin/M2/Landscapes/3-erosion-simulation.pdf)
- **Talus values used in CG:**
  - 30° "the usual talus angle for thermal erosion [MKM89]" — [Cordonnier16](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf)
  - 30° — [Šťava 2008](https://www.cs.purdue.edu/homes/bbenes/papers/Stava-2008-Interactive_Terrain_Modeling_Using_Hydraulic_Erosion.pdf)
  - θ_c = 37° — [Jain24 debris](https://www.cs.purdue.edu/homes/bbenes/papers/Arymaan24ToG.pdf); [Cordonnier23 Table 1](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier23ToG.pdf)
  - Jakó's virtual-pipe thermal variant: the talus tangent depends on hardness, tan α > R·K_a + K_i (K_a = 0.8, K_i = 0.1), and moved volume is ΔS = a·Δt·K_t·R·H/2 — [Jakó 2011](https://www.old.cescg.org/CESCG-2011/papers/TUBudapest-Jako-Balazs.pdf)
- **Why plain thermal erosion looks wrong:** it "yields unrealistically uniform slopes". In nature, low-drainage steep areas are dominated by debris flow, with constant-slope profiles (Stock & Dietrich 2006). The debris-flow law produces scars and fans — [Jain24 debris](https://www.cs.purdue.edu/homes/bbenes/papers/Arymaan24ToG.pdf)
- **Cordonnier, Jouvet, Peytavie, Braun, Cani, Benes, Galin, Guérin, Gain 2023 (read).** "Forming Terrains by Glacial Erosion", ACM TOG 42(4) Art. 61 (SIGGRAPH 2023), DOI 10.1145/3592422 — [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier23ToG.pdf)
  - Ice: mass conservation ∂h/∂t = M − ∇·(ū h), with mass balance M driven by the equilibrium-line altitude (ELA). Velocities are predicted by a CNN trained on a higher-order Stokes energy (Glen's-law viscosity μ = B|D(v)|^(p−2), p = 4/3, B = 2.9×10⁵ Pa·yr^(1/3)), then refined with one gradient-descent step.
    - The shallow ice approximation (SIA) is rejected. It lacks viscous stresses, so it "carves deep narrow defiles" and V-shaped valleys instead of U-shaped ones.
    - Multi-scale advection allows glacial time steps of dt = 10–100 yr (≈10% mass error at 100 yr).
  - Abrasion (Herman et al. 2015): ∂z/∂t = −k_e‖u_s‖^l, with l = 2.02 and k_e = 1.3×10⁻⁷ to 1.1×10⁻⁶ m^(1−l)·yr^(l−1).
  - Quarrying (Egholm et al. 2012): ∂z/∂t = −k_q‖u_s‖·Q, with Q = ½[erf(−u_s·∇z / (0.4‖u_s‖)) + 1] and k_q = 3.2×10⁻⁵ to 2.6×10⁻⁴.
  - Combined with fluvial erosion (m = 0.4, n = 1), hillslope k_h = 1–5×10⁻² m²/yr, and debris/thermal θ_c = 37°.
  - Landforms: U-shaped and hanging valleys, cirques, arêtes, horns, passes, fjords, over-deepened lakes and perched lakes. Abrasion carves the valley cores and quarrying flattens high altitudes.
  - Cost:
    - Under 5 minutes for a 16 × 16 km² terrain with 32 m cells.
    - At 1024², one step takes 300 ms (ice flow 87%), plus 1.7 s CPU drainage every 20 steps.
    - Hardware: RTX A5000-class GPU (24 GB).
    - Example scenario: 64 × 64 km², 100 kyr glaciation plus 20 kyr retreat.
  - Validation: qualitative comparison with the Sivalik Hills (fluvial) and Vignemal, Pyrenees (glacial). The paper reports the shift of the hypsometric maximum toward the ELA predicted by Egholm et al. 2009 (the "glacial buzzsaw") in the synthetic glacial case — [Cordonnier23](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier23ToG.pdf)

### Inferences
- A browser build should treat glaciation as optional. A cheap proxy is a hypsometric "buzzsaw": cap relief near a chosen ELA, flatten above it, and widen valleys there. That proxy is a liberty, not physics. Porting the CNN ice solver is a separate large project.
- Debris-flow erosion (Jain 2024) is a better physically grounded replacement for thermal erosion. It runs in the same explicit GPU loop as fluvial erosion (0.02 s/iteration at 1024²) and adds no exotic data structures beyond depression routing.

### Gaps
- No geomorphology-side source was fetched for the angle-of-repose range of dry granular material (commonly about 30–40°). The CG papers' 30°/37° choices are cited above, but a geotechnical source was not verified.

---

## Q4. Validation statistics for terrain realism, and whether stream-power terrain reproduces them

### Takeaway
The quantitative checks with good geomorphology backing are:
- Flint's slope–area law S = k_s A^(−θ), θ ≈ 0.45 reference.
- Hack's law L ∝ A^h, h ≈ 0.57–0.6.
- Horton ratios R_B ≈ 3.3–4.7 and R_L ≈ 1.6–2.4, with network fractal dimension ≈ 2.
- Power spectra with a sharp rollover at hillslope length and a ridge–valley wavelength peak.
- Hypsometry.
Steady-state stream power reproduces Flint's law by construction (θ = m/n). None of the CG terrain papers report Hack, Horton, spectra or hypsometry for fluvial terrain. Stream power without hillslope diffusion has no characteristic length scale when m/n = 0.5.

### Cited Findings
- **Flint's law / concavity:** S = k_s A^(−θ). θ is the concavity index and k_s the steepness index. Many studies use a reference θ_ref = 0.45; Mudd et al. use A₀ = 1 m², θ = 0.45 for normalised χ analysis, and show best-fit θ ≈ 0.45 in example basins. θ varies with lithology (basalt ≈ 0.7) — [Mudd, Clubb, Gailleton, Hurst 2018, "How concave are river channels?", ESurf 6:505–523, DOI 10.5194/esurf-6-505-2018](https://esurf.copernicus.org/articles/6/505/2018/esurf-6-505-2018.pdf)
- **Stream power steady state:** setting dh/dt = 0 gives s ∼ A^(−m/n), so Flint's θ = m/n is built in. With A ∝ (d − x)², river profiles are h ∼ log(d) − log(d − x) when m/n = ½ — [Cordonnier16](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf)
- **Known pathology:** "when hillslope diffusion… is neglected, the choice m/n = 0.5 yields a curiously unrealistic result: the predicted landscape is invariant to horizontal stretching". A 10 km² steady state can be stretched to match a 1000 km² one — [Kwang & Parker 2017, ESurf 5:807, DOI 10.5194/esurf-5-807-2017](https://esurf.copernicus.org/articles/5/807/2017/esurf-5-807-2017.pdf)
- **Characteristic scales:** 2-D Fourier spectra of high-resolution topography from two California landscapes show "spectral power declines sharply above a frequency that corresponds roughly to hillslope length". The spectra also contain quasi-periodic ridge-and-valley structure with a robustly measurable wavelength, which is "unlikely to occur in a random surface" — [Perron, Kirchner, Dietrich 2008, JGR Earth Surface 113, F04003, DOI 10.1029/2007JF000866 (OpenAlex abstract)](https://api.openalex.org/works/doi:10.1029/2007JF000866)
  - Evenly spaced ridges and valleys follow from competition between advective (fluvial) and diffusive (hillslope) transport — [Perron, Kirchner, Dietrich 2009, Nature 460:502, DOI 10.1038/nature08174](https://api.openalex.org/works/doi:10.1038/nature08174)
  - A 2024 discussion disputes the 2009 regression method: it is grid-resolution dependent, and Gabilan Mesa's characteristic length is 62 m by slope–area analysis — [EGUsphere 2024-2847 AC1](https://egusphere.copernicus.org/preprints/2024/egusphere-2024-2847/egusphere-2024-2847-AC1-supplement.pdf)
- **Hack's law:** Rigon et al. 1996 relate Hack's exponent to basin elongation and fractal characters. They link the self-affine basin boundaries to the power-law decay of the probability of total contributing area, and recommend a whole-basin scaling framework — [Rigon et al. 1996, "On Hack's Law", WRR 32(11):3367, DOI 10.1029/96WR02397](https://api.openalex.org/works/doi:10.1029/96WR02397)
  - An empirical exponent of about 0.57, "rather than .5 as predicted… by the random model", comes from a related report by the same group — [DTIC report](https://apps.dtic.mil/sti/pdfs/ADA256484.pdf) (secondary; the exact report was not opened)
  - Hack 1957 gave about 0.6 — [NPG 2016 (secondary)](https://npg.copernicus.org/articles/23/91/2016/npg-23-91-2016.pdf)
  - h varies between networks and with scale inside a network (southern-Africa basin study) — [search summary, orbilu](https://orbilu.uni.lu/handle/10993/52048)
- **Horton ratios and network dimension:**
  - Literature ranges R_B 3.3–4.7 and R_L 1.6–2.4, with D = log R_B / log R_L ≈ 1.7–2.5. One example basin had R_B = 4.14, R_L = 2.15, D = 1.93 — [Cudennec et al., IAHS (citing Tarboton et al. 1988)](https://iahs.info/uploads/dms/13454.51-422--430-S7-47-Cudennec-et-al.pdf)
  - River networks are "practically space filling with fractal dimension near 2" — [Tarboton, Bras, Rodríguez-Iturbe 1988, WRR 24(8):1317, DOI 10.1029/WR024i008p01317](https://api.openalex.org/works/doi:10.1029/WR024i008p01317)
  - Horton's area ratio is greater than the bifurcation ratio in real basins, contradicting models that equate them — [orbilu study (abstract)](https://orbilu.uni.lu/handle/10993/52048)
  - The broader caution is that Horton ratios are weak discriminators, since random networks also obey them — [Kirchner 1993 is the usual citation; not fetched — see Gaps]
- **Glacial hypsometry:** the synthetic glacial terrain shows the hypsometric maximum shifted toward the ELA, as predicted by Egholm et al. 2009 — [Cordonnier23](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier23ToG.pdf)
- **CG papers do not report these statistics.** The 2016 paper admits its validation is observational. The 2017 and 2023 papers use side-by-side visual comparison. The CG survey on terrain modelling is Galin, Guérin, Peytavie, Cordonnier, Cani, Benes, Gain 2019, "A Review of Digital Terrain Modeling", CGF 38(2), DOI 10.1111/cgf.13657 — [Cordonnier16](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf); [Cordonnier17](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier17ToG.pdf); [Semantic Scholar record](https://api.semanticscholar.org/graph/v1/paper/DOI:10.1111/cgf.13657)
- **Experimental and model network tests:** a divide-and-capture model coupling Hack's law with stream power needed h = 1 for first-order channels, while higher orders showed 0.5 < h < 1 — [EGU2011-10614](https://meetingorganizer.copernicus.org/EGU2011/EGU2011-10614.pdf)
- **Parameter uncertainty:** "the three main coefficients… in the Stream Power Law remain poorly constrained", although the law reproduces profile concavity and knickpoint propagation — [search summary, ESurf preprints](https://esurf.copernicus.org/preprints/1/891/2013/esurfd-1-891-2013.pdf)

### Inferences
- A stream-power + diffusion terrain should be checked against at least these:
  1. Slope–area / χ: θ ≈ 0.45 in channels, with a break to hillslope (diffusive) behaviour at small A.
  2. Hack: h ≈ 0.55–0.6.
  3. Horton: R_B ≈ 3.3–4.7, R_L ≈ 1.6–2.4.
  4. Power spectrum: a ridge–valley wavelength peak and a steep rollover at hillslope scale. Pure fBm noise has neither.
  5. Hypsometric curve/integral against a real DEM of the same tectonic setting.
  6. Slope histogram: no artificial pile-up at the talus angle.
- Adding hillslope diffusion (k_h ∇²h, k_h ≈ 10⁻²–4×10⁻² m²/yr in the Inria papers) is what makes valley spacing set by physics rather than by grid size. It is also what breaks the m/n = 0.5 scale invariance (Kwang & Parker).
- A cheap automated harness can compute D8 drainage on the output plus a real SRTM/Copernicus DEM tile, then compare Flint θ, Hack h, Horton R_B/R_L, P(A ≥ a), the radially averaged spectrum, the hypsometric integral and the slope histogram.

### Gaps
- Exact spectral slope numbers from Perron 2008 (e.g., the power-law exponent at large wavelengths and the rollover wavelengths for Gabilan Mesa / Tennessee Valley) were not retrieved; the AGU and Berkeley PDFs were blocked.
- Hypsometric integral reference values were not verified from a primary source. From memory, Strahler 1952 (GSA Bull. 63:1117) gives HI > 0.6 for "youthful", 0.35–0.6 for "mature" and < 0.35 for "old" — unverified here.
- The exponent of the exceedance probability of drainage area, P(A ≥ a) ∝ a^(−β) with β ≈ 0.43–0.45 (Rodríguez-Iturbe & Rinaldo 1997), is from memory. Rigon 1996's abstract confirms the power-law decay but not the number.
- "Fractal River Basins" (Rodríguez-Iturbe & Rinaldo 1997, Cambridge UP) was not accessed.
- Kirchner 1993 (Geology, "Statistical inevitability of Horton's laws") was not fetched.
- No paper was found that quantitatively compares a CG stream-power terrain's Hack/Horton/spectrum statistics with a real DEM. This appears to be a genuine gap in the literature.

---

## Q5. Learned terrain (context only)

### Takeaway
Example-based and learned methods (cGAN, diffusion) synthesise plausible DEM patches but encode no process. The owner wants procedural. The only relevant reuse is "amplification": adding sub-cell detail after physics, which is itself a liberty.

### Cited Findings
- FastFlow and the Inria line explicitly frame physically-based simulation as the route to geological consistency. Tzathas 2024 frames procedural methods as suffering from "a lack of geological consistency" — [Tzathas 2024 abstract](https://api.semanticscholar.org/graph/v1/paper/DOI:10.1111/cgf.15033)
- Schott et al.'s "Terrain amplification using multi scale erosion" (2024) amplifies with erosion rather than a network — [Adobe Research listing](https://research.adobe.com/publication/terrain-amplification-using-multi-scale-erosion)

### Inferences
- If detail below the stream-power grid (about 30 m) is needed, a short Mei/debris-flow pass at a finer grid is the "physical" amplifier. A noise or GAN amplifier would reintroduce artistic liberty.

### Gaps
- Guérin et al. 2017, "Interactive example-based terrain authoring with conditional generative adversarial networks" (ACM TOG 36(6), SIGGRAPH Asia 2017), was not fetched; its DOI and details are unverified here. 2024 diffusion-terrain papers were not surveyed (out of scope per brief).

---

## What this means for the build

1. **Uplift.** Generate a tectonic uplift map U(x) in physical units, 0.5–1.2 mm/yr in the cited papers, with piecewise or stepped structure. The source can be a plate, collision or fold model or the user.
2. **Stream power.** Run U + stream power (m = 0.4–0.45, n = 1, K ≈ 10⁻⁶–10⁻⁴ in matching units). Add hillslope diffusion (k_h ≈ 0.01–0.04 m²/yr) and a debris/thermal threshold (θ_c ≈ 35–37°). Use a WebGPU compute grid of 1024² (up to 2048²) at Δx ≈ 30–50 m, which covers a 30–100 km region.
   - Best option: FastFlow-style O(log n) pointer-jumping flow accumulation with an implicit Braun–Willett update and depression routing, about 100–300 iterations. Expect roughly 5–30 s on a laptop GPU (extrapolated from under 10 s on an RTX A6000 at 2048²).
   - Simpler fallback: Schott's single-pass explicit shader. It needs thousands of iterations, but at about 1–5 ms each that is still seconds at 1024².
3. **Optional detail pass.** Run a short Mei-style shallow-water hydraulic pass plus thermal settling for sediment, gullies and lakes. Its constants are dimensionless and uncalibrated, so keep it brief.
4. **Skip glaciation for now.** Cordonnier 2023 needs a CNN ice solver at about 300 ms/step, so glaciation stays out of the "seconds" budget.
5. **Validate against real DEMs** of the same setting (SRTM/Copernicus 30 m). Compare:
   - Slope–area concavity θ ≈ 0.45.
   - Hack's exponent h ≈ 0.57–0.6.
   - Horton ratios R_B ≈ 3.3–4.7 and R_L ≈ 1.6–2.4.
   - The radially averaged power spectrum: a ridge–valley wavelength peak and a rollover at hillslope length.
   - The hypsometric curve/integral.
   - A slope histogram with no spike at the talus angle.
