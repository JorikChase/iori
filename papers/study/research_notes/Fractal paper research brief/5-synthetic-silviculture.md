# Synthetic Silviculture (Makowski et al. 2019) — what a browser reimplementation needs

Primary sources read in full for these notes:
- Makowski, Hädrich, Scheffczyk, Michels, Pirk, Pałubicki. "Synthetic Silviculture: Multi-scale Modeling of Plant Ecosystems." ACM TOG 38(4), Art. 131, July 2019. DOI [10.1145/3306346.3323039](https://doi.org/10.1145/3306346.3323039). Author preprint PDF: https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf. Project page: https://storage.googleapis.com/pirk.io/projects/synthetic_silviculture/index.html. Supplementary PDF (a one-page glossary only, no extra formulas): https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-SilvicultureSup.pdf. Video: https://www.youtube.com/watch?v=j6QIggjLBhY (listed on https://wp.faculty.wmi.amu.edu.pl/).
- Pałubicki, Horel, Longay, Runions, Lane, Měch, Prusinkiewicz. "Self-organizing tree models for image synthesis." ACM TOG 28(3), Art. 58, 2009. DOI 10.1145/1531326.1531364. PDF: https://www.algorithmicbotany.org/papers/selforg.sig2009.small.pdf (project page https://www.algorithmicbotany.org/papers/selforg.sig2009.html).
- Borchert & Honda. "Control of Development in the Bifurcating Branch System of Tabebuia rosea: A Computer Simulation." Botanical Gazette 145(2):184–195, 1984. DOI [10.1086/337445](https://www.journals.uchicago.edu/doi/10.1086/337445). PDF copy: https://wp.faculty.wmi.amu.edu.pl/BorchertHonda1984.pdf.

**Important framing correction for the report writer.** The Synthetic Silviculture paper does *not* simulate individual buds, metamers or internodes. Its unit of self-organisation is the *branch module* (a small pre-designed branching graph, "architectural unit"); buds, bud fate, the voxel shadow pyramid with parameters a and b, the formula Q = max(0, C − s + a), the metamer count n = ⌊v⌋, the tropism weighted sum and the light/size shedding ratio all come from Pałubicki et al. 2009, which Synthetic Silviculture cites and partially re-uses *at module scale*. Both papers are described below so the reimplementation can pick either level.

---

## KQ1 — Individual plant model: exact formulas and typical parameter values

### Takeaway
At bud scale (Pałubicki 2009) the loop is: voxel shadow propagation → light Q per bud → extended Borchert–Honda two-pass vigor split with apical-control weight λ → n = ⌊v⌋ metamers of length v/n per bud → direction = default + ξ·(light direction) + η·(tropism) → pipe-model widths → shed branches whose light/size ratio is below a threshold. At module scale (Makowski 2019) the same skeleton is kept but light is Q(u) = exp(−Σ sphere-intersection volumes) × a coarse shadow grid, vigor drives a smoothstep growth rate, and modules are instantiated from a 9-prototype library and oriented by a 4-candidate gradient descent on collisions + tropism. All per-species constants the paper publishes are in Tables 3 and 4 and are transcribed below.

### Cited Findings

**A. Shadow propagation (Pałubicki 2009, §4.1; re-used in Makowski 2019 §6.2)**
- Space is a voxel grid; each voxel (i,j,k) stores a shadow value s, initially 0. A bud in voxel (I,J,K) casts a pyramidal penumbra downward into voxels (i,j,k) = (I ± p, J − q, K ± p), q = 0..q_max, p = 0..q; each affected voxel gets Δs = a·b^(−q), with a > 0 and b > 1 user-defined. Light exposure of a bud in voxel (i,j,k): Q = max(C − s + a, 0), where C is a constant for full exposure; the "+a" term means a bud does not shade itself — [Pałubicki 2009 PDF, §4.1](https://www.algorithmicbotany.org/papers/selforg.sig2009.small.pdf)
- Optimal growth direction V is either the negative gradient of the shadow value, or the direction to the lowest-shadow voxel among neighbours within the bud's perception volume — [Pałubicki 2009, §4.1](https://www.algorithmicbotany.org/papers/selforg.sig2009.small.pdf)
- Typical grid: 200 × 200 × 200, cell edge ≈ one internode length; shadow depth q_max typically 4 to 8 layers — [Pałubicki 2009, §6](https://www.algorithmicbotany.org/papers/selforg.sig2009.small.pdf)
- The shadow-propagation method itself is attributed to Pałubicki 2007, *Fuzzy Plant Modeling with OpenGL* (VDM Verlag), with Bornhofen & Lattaud 2008 as a parallel — [Pałubicki 2009, §4.1 and refs](https://www.algorithmicbotany.org/papers/selforg.sig2009.small.pdf)
- Alternative environment model in the same paper: space colonization with buds as the only growth points; typical values perception angle θ ≈ 90°, occupancy radius ρ = 2 internode lengths, perception distance r = 4–6 internode lengths; Q = 1 if any marker is associated with the bud else 0; V = normalised sum of normalised vectors to associated markers — [Pałubicki 2009, §4.1](https://www.algorithmicbotany.org/papers/selforg.sig2009.small.pdf)
- Space colonization is "about three times slower" than shadow propagation for trees of similar size, and its binary Q makes Takenaka-style shedding unusable (branches would be shed as soon as they stop growing) — [Pałubicki 2009, §4.4 and §6](https://www.algorithmicbotany.org/papers/selforg.sig2009.small.pdf)

**B. Bud fate / apical control — extended Borchert–Honda (Pałubicki 2009 §4.2)**
- Pass 1 (basipetal): light Q of buds flows to the base and cumulative values are stored in internodes (Q = Q_m + Q_l at each branching point). Base value sets the total resource for pass 2: v_base = α·Q_base, α a proportionality coefficient — [Pałubicki 2009, §4.2](https://www.algorithmicbotany.org/papers/selforg.sig2009.small.pdf)
- Pass 2 (acropetal) split at each branching point between main axis (m) and lateral (l): v_m = v·λQ_m / (λQ_m + (1−λ)Q_l), v_l = v·(1−λ)Q_l / (λQ_m + (1−λ)Q_l); λ ∈ [0,1]; λ > 0.5 biases to the main axis (excurrent, trunked), λ = 0.5 unbiased, λ < 0.5 biases to laterals (decurrent, bushy) — [Pałubicki 2009, §4.2](https://www.algorithmicbotany.org/papers/selforg.sig2009.small.pdf)
- Internode production: a bud receiving v produces n = ⌊v⌋ metamers, each of length l = v/n — [Pałubicki 2009, §4.2](https://www.algorithmicbotany.org/papers/selforg.sig2009.small.pdf)
- Figure 7 of the paper shows the progression for λ = 0.46, 0.48, 0.50, 0.52, 0.54, all with α = 2 — [Pałubicki 2009, Fig. 7 caption](https://www.algorithmicbotany.org/papers/selforg.sig2009.small.pdf)
- Alternative "priority model": per axis, sort supported branches by average light per bud, put the terminal bud first regardless of light, allocate v_i = v·Q_i w_i / Σ Q_j w_j with a piecewise-linear weight function; example parameters w_max = 1, w_min = 0.006, κ = 0.5 or 0.35 — [Pałubicki 2009, §4.2, Fig. 9](https://www.algorithmicbotany.org/papers/selforg.sig2009.small.pdf)
- Apical control can be removed over time (main stem vs laterals) to go from excurrent young trees to decurrent old ones — [Pałubicki 2009, Figs. 10–11](https://www.algorithmicbotany.org/papers/selforg.sig2009.small.pdf)
- Original Borchert & Honda 1984 rule the above extends: flux at branch point i splits as F_2i = F_i·R_f to the main daughter and F_2i+1 = F_i·(1−R_f) to the lateral (R_f > 0.5 for main branches; their asymmetric runs used R_f = 0.8 for laterals vs 1 for leaders, and R_f 0.7→0.63 variations); a terminal with F > F_min keeps branching, a terminal with F < F_min survives N_s increments at constant flux then dies and its flux becomes 0; total flux into the tree rises with order N by a factor that is slowed with R_red < 1 — [Borchert & Honda 1984, eqs. (1)–(6)](https://wp.faculty.wmi.amu.edu.pl/BorchertHonda1984.pdf)

**C. Growth direction / tropism**
- Pałubicki 2009: new shoots start in the bud direction (terminal buds along their internode; laterals set by phyllotaxis and branching angle). Metamer orientation = weighted sum of three vectors: default orientation, optimal growth direction V (weight ξ), and a tropism vector (weight η). Upward tropism vs downward tropism, and large η with large ξ, give gnarled decurrent forms — [Pałubicki 2009, §4.3, Fig. 12](https://www.algorithmicbotany.org/papers/selforg.sig2009.small.pdf)
- Makowski 2019 (module scale) tropism is a positional offset added to node positions as a function of the branch segment's age a_b: τ_offset(a_b) = g1 · g_dir · g2 / (a_b + g1), where g_dir is the normalised gravity direction, g1 controls how fast the effect decays with age, g2 the overall strength; negative g2 = gravitropism, positive g2 = phototropism — [Makowski 2019, Eq. 10, §5.3.1](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Makowski 2019 orients each *new module* by minimising f_distribution(u) = ω1·f_collisions(u) + ω2·f_tropism(u), with f_tropism(u_α) = cos(α_tropism) − cos(u_α) (α a tropism angle), starting from the parent's orientation and testing the Euler-angle perturbation set P = {[α,0,0],[−α,0,0],[0,0,α],[0,0,−α]} with a small angle α; usually no more than 3 steps converge — [Makowski 2019, Eqs. 3–4, 12–13, Appendix A.1, §8](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)

**D. Light and vigor at module scale (Makowski 2019 §5.2.1)**
- Each module u gets a spherical bounding volume B_u; f_collisions(u) = Σ_w V_intersect(B_u, B_w) over intersecting neighbours; light exposure Q(u) = exp(−f_collisions(u)) — [Makowski 2019, Eq. 1](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Basipetal pass sums Q(u) = Q(u_m) + Q(u_l) to Q_total at the root; acropetal pass: v̄(u_m) = v̄(u) · λQ(u_m) / (λQ(u_m) + (1−λ)Q(u_l)), v̄(u_l) = v̄(u) − v̄(u_m); λ > 0.5 excurrent, λ ≤ 0.5 decurrent. The root is never allocated more than v̄_rootmax — [Makowski 2019, Eq. 2](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Global shadowing: uniform grid of cells; whenever a module is associated with a cell, light availability Q_G of that cell and *all cells underneath* are updated (shadow cone extended to the bottom-most cells, ≈ 2 m); effective exposure Q_eff = lerp(s_tol, 1, Q·Q_G) replaces Q when global shadowing is on, s_tol = shade tolerance ∈ [0,1] — [Makowski 2019, §6.2](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)

**E. Growth increment, internode/segment geometry, shedding (Makowski 2019 §5.3)**
- Growth rate of module u: Υ(u) = S((v̄(u) − v̄_min)/(v̄_max − v̄_min)) · g_p, with smoothstep S(x) = 3x² − 2x³, g_p = plant growth rate; v̄(u) clamped to v̄_max — [Makowski 2019, Eq. 5](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Physiological age: da_u/dt = Υ(u), starting at 0, forward-Euler, until a_mature; growth after that is only by attaching new modules at terminal nodes — [Makowski 2019, Eq. 6](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- For a mature module, each terminal node n_i gets q(n_i) = Q(u)/#n (number of terminal nodes); the BH model is run again at module scale to give v per terminal; a new module is attached at each terminal with v > v̄_min — [Makowski 2019, §5.3](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Branch segment age a_b = max(0, a_u − a_n) (a_n = age of the segment's base node); diameter d_b = sqrt(Σ_{c∈C_b} d_c²) if it has children, else φ (pipe model with n = 2); length ℓ_b = min(ℓ_max, β·a_b) — [Makowski 2019, Eqs. 7–9](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Pałubicki 2009 pipe model: d^n = d1^n + d2^n with n usually 2–3; widths are never decreased when branches are shed — [Pałubicki 2009, §4.5](https://www.algorithmicbotany.org/papers/selforg.sig2009.small.pdf)
- Shedding (Makowski): a module is shed when v̄ < v̄_min. Senescence: plant age p_t counts up; when p_t ≥ p_max, v̄_rootmax is linearly interpolated to zero with a constant step until all modules are shed — [Makowski 2019, §5.2.1](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Shedding (Pałubicki 2009, after Takenaka 1994 / Měch & Prusinkiewicz 1996): total light gathered by a branch divided by its size in internodes; below a threshold the branch is shed — key to forming tall boles — [Pałubicki 2009, §4.4](https://www.algorithmicbotany.org/papers/selforg.sig2009.small.pdf)

**F. Module selection (the "species template" mechanism, Makowski §5.2.2)**
- 9 module prototypes (skeletal graphs after Hallé et al. 1978) are placed in a 2-D morphospace spanned by apical control λ and determinacy D; regions are a Voronoi partition of the prototype positions (chosen arbitrarily). A new module is picked at (λ, D') with D' = v̄(u_parent)·D/v̄_max, so vigorous parents spawn more deterministic prototypes. High D → monopodial, low D → sympodial — [Makowski 2019, §5, §5.2.2](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Flowering age F_age (user) is scaled per plant: F_eff = F_age · v̄_rootmax / v̄_root; on maturity λ and D switch to λ_mature, D_mature (Baobab example: high → small values) — [Makowski 2019, §6.3](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)

**G. Published per-species parameter values (Makowski 2019, Table 4; 16 species shown in Fig. 21)**
Columns: p_max (max age, yr) | v̄_rootmax | g_p | λ/λ_mature | D/D_mature | F_age | α (tropism angle) | ω2 | g1 | φ | β — [Makowski 2019, Table 4](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- a: 20 | 42 | 0.19 | 0.62/- | 0.25/- | 0 | 0.52 | 0.63 | −0.38 | 0.57 | 0.47
- b: 200 | 78 | 0.30 | 0.84/- | 1.0/- | 0 | 0.52 | 0.63 | −1.2 | 1.00 | 0.79
- c: 80 | 11 | 0.80 | 1.0/- | 1.0/- | 0 | 0.9 | 0.5 | 1.0 | 5.00 | 1.95
- d: 16 | 1.7 | 0.23 | 0.44/- | 0.31/- | 0 | 1.0 | 1.0 | 1.0 | 5.00 | 3.00
- e: 430 | 600 | 0.15 | 1.0/0.5 | 1.0/0.33 | 58 | 0.52 | 0.63 | 0.56 | 3.00 | 1.23
- f: 550 | 450 | 0.20 | 0.76/- | 0.82/- | 0 | 0.17 | 0.5 | 0.47 | 1.20 | 1.90
- g: 550 | 700 | 0.20 | 0.9/0.5 | 0.93/0.74 | 55 | 0.17 | 0.5 | 0.47 | 1.38 | 0.94
- h: 500 | 570 | 0.24 | 1.0/0.5 | 1.0/0.5 | 55 | 0.5 | 0.27 | −0.66 | 1.38 | 1.29
- i: 950 | 900 | 0.12 | 0.87/0.34 | 0.93/0.55 | 57 | 0.66 | 0.14 | 0.2 | 1.41 | 1.29
- j: 950 | 600 | 0.14 | 1.0/0.5 | 1.0/0.51 | 57 | 0.45 | 0.63 | −0.9 | 0.82 | 0.93
- k: 950 | 600 | 0.14 | 1.0/0.5 | 1.0/0.51 | 57 | −0.2 | 0.63 | −0.9 | 0.82 | 0.93
- l: 1000 | 815 | 0.19 | 0.92/0.7 | 0.59/0.56 | 80 | −0.19 | 0.72 | −0.21 | 5.00 | 1.54
- m: 130 | 400 | 0.21 | 0.88/0.43 | 0.9/0.7 | 66 | 0.85 | 0.55 | 0.9 | 1.42 | 1.11
- n: 52 | 200 | 0.55 | 0.96/0.43 | 0.48/0.7 | 0 | −0.27 | 0.43 | 0.73 | 1.50 | 2.50
- o: 300 | 600 | 0.20 | 0.8/- | 0.86/- | 0 | −0.19 | 0.81 | 1.0 | 1.00 | 1.60
- p: 450 | 450 | 0.15 | 1.0/0.5 | 0.66/0.33 | 135 | 0.52 | 0.32 | 0.42 | 1.50 | 1.06
- The paper says the plant description uses "12 physiological and 2 morphological parameters", that the structural parameters are "based on Palubicki et al. [2009]", and that values were found from literature (Barthélémy & Caraglio 2007; Pałubicki 2009) — [Makowski 2019, §6.1, A.3](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf). The species names behind rows a–p are only given as pictures in Fig. 21 (not in the text).

### Inferences
- A practical bud-scale implementation: with a = 1, b = 2, q_max = 6, C = 1 (so Q ∈ [0,1] for an unshaded bud) you reproduce the 2009 behaviour; λ in 0.46–0.54 spans bush→trunk, so λ should be exposed as the single most important slider. (Values of C, a, b are not given numerically in either paper; these are plausible defaults, see Gaps.)
- The two papers share the BH split formula exactly; the only module-scale changes are (i) Q is a continuous exp(−overlap) instead of a voxel read, (ii) resource becomes a growth *rate* via smoothstep instead of a metamer count, (iii) geometry grows by interpolating ages rather than appending internodes.
- Table 4's g1 column has both signs while the text says the sign of g2 chooses gravi- vs phototropism; the table reports no g2 column and ω1 is absent, so the table almost certainly lists g1 as the signed strength. Treat "g1 < 0 = droop, g1 > 0 = lift" when reading the table.

### Gaps
- Numeric values of the shadow parameters a, b, C, cell size and q_max used in Synthetic Silviculture's global grid are not stated; only 2009's "q_max 4–8, 200³ grid, cell ≈ internode" are given.
- v̄_min, v̄_max, a_mature, ℓ_max, ω1, the Euler step α of the orientation search, and the simulation time step Δt are not reported numerically anywhere in the paper.
- The 9 prototype graphs are shown only as pictures (Fig. 4a, 17) and their morphospace coordinates are "chosen arbitrarily"; no node lists are published.
- Which species each Table 4 row corresponds to is only readable from Fig. 21's thumbnails; I could not verify names.

---

## KQ2 — Ecosystem loop: competition, seeding, death, climate/terrain, biome selection

### Takeaway
The ecosystem loop is light competition through overlapping module bounding spheres plus a coarse column-shadow grid, seeding from mature plants in a Gaussian disc around the parent at a per-species frequency, death by a per-species maximum age (senescence ramps root vigor to zero) or by vigor starvation, and climate acting only through a 2-D Gaussian "adaptation" that scales each plant's root vigor cap and seeding frequency. Temperature falls linearly with elevation; precipitation is constant; a binary soil map blocks cells; there is no explicit slope factor in the paper.

### Cited Findings
- Environmental/plasticity parameter ranges (Table 1): Temperature −10…33 °C; Precipitation 10…4300 mm; Seeding frequency 1…10 seeds per seeding period (1/year); Seeding radius 0.01…100 m; Shade tolerance 0…1; Temperature adaptation T_A −10…33 °C; Precipitation adaptation P_A 10…4300 mm — [Makowski 2019, Table 1](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- "Low-dimensional parameter space (2 environmental, 5 plasticity parameters)" — [Makowski 2019, §9](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Competition: local = bounding-sphere intersections (Eq. 1) and the orientation optimisation that steers new modules away from collisions; long-distance = shadow propagation at module scale into all cells beneath, Q_eff = lerp(s_tol, 1, Q·Q_G). "Over-dispersion emerges naturally as plant models compete … for space"; adjusting shade tolerance moves from tightly packed to distributed patterns; seeding radius low → clustered, high → homogeneous — [Makowski 2019, §6.2, §6.3](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Seeding: once a plant reaches flowering age (F_eff = F_age·v̄_rootmax/v̄_root), new plants are generated periodically (seeding frequency) in a circular area (seeding radius) around it, positions drawn from a Gaussian — [Makowski 2019, §6.3, Fig. 6](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Initialisation: user sets T, P, number of initial plants and the time step; plants are instantiated at random terrain locations from the library; users can remove individual plants at any time (used to trigger gap dynamics) — [Makowski 2019, Appendix A.2](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Death: when p_t ≥ p_max, v̄_rootmax is linearly reduced to zero so every module eventually drops below v̄_min and is shed ("gradual plant senescence"); "During the simulation, plants die and decay, which opens space"; uniformly aged stands die together = cohort senescence producing gaps and labyrinths — [Makowski 2019, §5.2.1, §6.2, §7.1, Fig. 7e–f, Fig. 19e](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Climate: T and P constant over the simulation; P constant over the terrain; T(h) = T(0) + γ·h with γ < 0 (lapse rate from Salzmann et al. 2015). Per-species adaptation o = N_T(T)·N_P(P) / (N_T(T_A)·N_P(P_A)) with normal distributions centred on T_A, P_A; o linearly scales v̄_rootmax and seeding frequency. Well adapted species express full values; poorly adapted "might not grow at all or at a very slow rate" — [Makowski 2019, §6.4, Eq. 11](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Terrain: height map rendered as a mesh; binary soil map (0 open, 1 blocked) to exclude water, mountains, streets; terrain for Fig. 19 made with L3DT — [Makowski 2019, §6.1, §7](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Biomes: nine (desert, tundra, savanna, grassland, shrubland, boreal forest, temperate seasonal forest, temperate rainforest, tropical seasonal forest, tropical rainforest) placed on a Whittaker temperature–precipitation diagram; species are selected "based on their sensitivity to temperature and precipitation", with T_A/P_A values chosen by hand after Bassuk et al. 2009 — [Makowski 2019, §4.2, §6.1, Fig. 2](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Succession example (Fig. 3): three types — fast shrub with low s_tol, conifer with medium s_tol, slow conifer with high s_tol; over 500 simulated years the shade-tolerant conifer becomes the climax species — [Makowski 2019, §6.2](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Published plasticity values (Table 3): Fig 7a–d: seeding frequency 3.0, seeding radius 1.0 or 9.0, s_tol 0.9 or 0.1, T_A 28.0, P_A 4100. Fig 19 (I shrub): 5.0, 8.0, 0.15, T_A 8.0, P_A 672; (II conifer): 2.0, 3.0, 0.45, 12.0, 672; (III deciduous): 1.0, 3.0, 0.6, 16.0, 672 — [Makowski 2019, Table 3](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Validation of the loop: 1,000 pine trees' total biomass follows a logistic curve with L = 3000, k = 0.0625, x0 = 120; density vs trunk diameter (plants > 5 cm) follows the 3/2 self-thinning power law; height–diameter and leaf-mass–diameter allometries agree with Eloy et al. 2017; module overlap stays < 5 % with orientation optimisation — [Makowski 2019, §8, Figs. 14–16](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Gap dynamics demo (Fig. 10): after removing plants, fast palms fill the gap, then the climax deciduous species takes over, 150 years — [Makowski 2019, Fig. 10](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)

### Inferences
- A loop in pseudo-code faithful to the paper: `for each year: (1) rebuild shadow grid from module positions; (2) per plant: Q per module (sphere overlap × grid), BH passes, growth rates, age modules, attach/shed modules, orient new modules; (3) per plant: if age ≥ p_max ramp v̄_rootmax → 0; if no modules left remove plant; (4) per mature plant: with probability ∝ o·seedingFrequency place N seeds at Gaussian(σ = seedingRadius) around it, rejecting blocked soil cells; (5) T(h) and o are static per cell and can be precomputed.`
- Because adaptation only scales v̄_rootmax and seeding frequency, "who seeds where" is: anyone mature seeds locally; "who dies when" is: age ≥ p_max (always) or starvation (shade: Q_eff → s_tol, so a shade-intolerant plant under a canopy has all modules starve below v̄_min).
- Slope is *not* a factor in the paper (only elevation → temperature). The open-source broflora port explicitly lists "slope-gated seeding" as an extension "beyond the paper" (see KQ5).

### Gaps
- The variances of N_T and N_P, the seeding "period", and how the Gaussian seeding radius maps to σ are not stated.
- No rule for a minimum establishment distance or seedling mortality beyond vigor starvation; a plant "dies" only when all modules are shed.
- Soil beyond the binary map (fertility, water) is explicitly future work ("a more detailed representation of soil").

---

## KQ3 — Multi-scale representation and LOD

### Takeaway
The "multi-scale" of the title is module scale / plant scale / ecosystem scale, not a detailed-vs-coarse plant switch: every plant is always a full set of modules; scale is achieved because a module's *topology* comes from one of 9 prototypes shared by the whole ecosystem and rendered by GPU instancing, with per-instance transforms and node parameters. There is no LOD switch or impostor described.

### Cited Findings
- "First, we define branch modules as a set of connected branches (module scale). Second, a plant is represented as a collection of branch modules (plant scale) and finally, an ecosystem is composed of a number of plants (ecosystem scale)" — [Makowski 2019, §3](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- "Unlike previous approaches, where branch patches are used to represent the full surface geometry of branch parts, our modules only represent the topology"; "the use of branch modules allows for GPU instancing … while keeping a very light memory and performance footprint" — [Makowski 2019, §1, §3](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Deterministic development at module scale (interpolate positions, diameters, lengths from initial to final), self-organising at plant scale (add/remove modules by vigor) — [Makowski 2019, §5](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Each module node stores position, physiological age, branch length, thickening factor φ; a module is a connected acyclic graph with one root node and terminal connector nodes — [Makowski 2019, §5.1](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Complexity trade-off (Fig. 17): the same tree at ~200 K polygons built from 99 complex modules, 294, or 1204 simple modules; "Balancing the number of modules and the complexity of prototypes thereby is a means to address accuracy and efficiency … can be seen as a compression scheme" — [Makowski 2019, §8](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Rendering: C++/DirectX, instancing, vertex/geometry/fragment shaders build generalised-cylinder branch geometry from node attributes; foliage as textured quads, no grass in the interactive tool; offline renders in Houdini; export is only skeletal graphs of modules plus transforms, connectivity, diameter, plant type — [Makowski 2019, §7, A.2](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- The authors list combining with "other level of detail techniques" as future work — [Makowski 2019, §9](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Pałubicki 2009 trees are modelled at bud/metamer level with 1,000–700,000 metamers per tree — [Pałubicki 2009, §6](https://www.algorithmicbotany.org/papers/selforg.sig2009.small.pdf)

### Inferences
- For WebGL the same trick applies directly: one instanced geometry per prototype (a handful of cylinders), one instance per module with a transform + per-node age/diameter in an instance buffer; a tree of 50–300 modules then costs 50–300 instances, and 10³ trees is a few hundred thousand instances, well within `drawArraysInstanced` budgets.
- "Coarse plant" in the prompt's sense would have to be added (e.g. billboard when far); the paper gives no rule for it.

### Gaps
- No LOD/impostor scheme, no culling strategy and no memory figures per module are given.

---

## KQ4 — Simulation step, timing, sizes achieved

### Takeaway
One simulation step corresponds to roughly a year of growth (scenes list AGE in years and seeding frequency in 1/year); small scenes of 100–1,400 plants step in 4–87 ms and render in 3–19 ms on a 2017 laptop-class GPU; the headline 468,199-plant scene (2.27 M modules, 26.8 M nodes, 1,400 years) steps in 18.8 s and renders in 3.6 s.

### Cited Findings
- Hardware: Intel Core i5 4 × 2.5 GHz, 8 GB RAM, NVIDIA GTX 1050 4 GB; C++ and DirectX — [Makowski 2019, §7](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Table 2 (P plants, PT types, M modules in K, MP prototypes, B branches K, N nodes K, TS step ms, TR render ms, AGE years): Fig 1a 218 / 3 / 4.6 / 8 / 57 / 62 / 7 / 4 / 164 yr; Fig 1c 611 / 3 / 34.4 / 4 / 392 / 436 / 14 / 19 / 382 yr; Fig 1d 1,248 / 6 / 18.9 / 7 / 216 / 114 / 45 / 12 / 452 yr; Fig 11e 640 / 5 / 37.5 / 8 / 412 / 450 / 87 / 18 / 432 yr; Fig 11j 1,404 / 3 / 9.2 / 4 / 103 / 112 / 20 / 7 / 272 yr; Fig 19g 468,199 / 3 / 2,271 / 15 / 23,283 / 26,776 / 18,796 ms / 3,620 ms / 1,400 yr (offline render N/A) — [Makowski 2019, Table 2](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- "we can model and render plant populations with up to 500K plants" and "interactive design of plant ecosystems of up to 500K plants" — [Makowski 2019, abstract, §7.1](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf); the Google Research listing instead says "up to 90K plants" — [Google Research page](https://research.google/pubs/synthetic-silviculture-multi-scale-modeling-of-plant-ecosystems/) (the paper's own number is 500K; the 468,199 of Table 2 is the largest measured scene).
- "Each biome was simulated for a period of several hundred years"; successions shown over 500 years; gap dynamics 150 years; Baobab 200 and 450 years — [Makowski 2019, Figs. 6, 10, 11, §6.2](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- The user sets "the time step for the simulation" explicitly; physiological age is "not in units of time"; Eq. 6 is integrated with forward Euler — [Makowski 2019, A.2, §5.3](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- 16 species used for most results; 9 prototypes — [Makowski 2019, §8.1, §5.1](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Pałubicki 2009 reference costs: 700,000 internodes in 106 steps = 82 s; 642,000 in 90 steps = 60 s; 225,000 in 68 steps = 21 s on a 2.4 GHz Pentium 4; the BH model is ~300 lines of L+C plus ~200 lines of C++ for shadow propagation — [Pałubicki 2009, Table 1, §6](https://www.algorithmicbotany.org/papers/selforg.sig2009.small.pdf)
- A GPU (OpenCL) version of the whole self-organising pipeline exists: Kohek & Strnad, "Interactive synthesis of self-organizing tree models on the GPU" (catalogue record only; full text not retrieved) — [COBISS record](https://plus.cobiss.net/cobiss/si/en/bib/18066454)

### Inferences
- Per-plant cost in the paper is roughly 30–70 µs per step for the small scenes (e.g. 45 ms / 1,248 plants), dominated by O(N²)-ish sphere overlap tests among neighbouring modules; a browser version at tens of trees has orders of magnitude of headroom, so a per-frame step at bud scale with a 64³ grid is realistic.
- Steps are annual-ish, so animating "growth" in a demo means interpolating module ages between steps (the paper's deterministic module development does exactly this).

### Gaps
- The numeric Δt per step and whether a step is exactly one year are not stated; only AGE in years and "1/year" seeding units imply it.
- No breakdown of step time between light, vigor, orientation and seeding is reported.

---

## KQ5 — Open-source reimplementations, related code and related work

### Takeaway
No official code was released for either paper (the project page lists only PDF, supplement and video; the SIGGRAPH 2019 replicability tracker lists the paper with no code). Several independent reimplementations exist: a documented C++20 port of the whole Synthetic Silviculture loop (broflora), a Rust port, two student projects, and for Pałubicki 2009 a C++ port plus a copy of the original L+C/LPFG model. Space colonization has many JS ports and is the right fallback.

### Cited Findings
**Synthetic Silviculture ports**
- wlejon/broflora — C++20, MIT; implements the three tiers, "extended Borchert-Honda pass with basipetal and acropetal sweeps", pipe-model thickening with tropism, "spatial light and shadow grids updated each step", prototype-Voronoi module spawning, climate-driven seeding and senescence; 71 commits, built-in prototypes `straightModule`, `forkModule`, `whorlModule`; adds terrain coupling (root tilt to surface normal, slope-gated seeding) "beyond the paper"; exposed to JavaScript as `bro.flora` in the author's engine — [GitHub broflora](https://github.com/wlejon/broflora)
- broflora's section-by-section map (docs/auto-flora-strategy.md) states its approximations: shadow stamp is `1 − exp(−k·r²)` per module "instead of a beam integration"; O(N²) sphere overlap; vigor split generalised to N children ("mainline gets λ·Q_main, laterals share (1−λ)·Q_lat weighted by their own subtree light"); orientation by coordinate descent (8 iterations, halving step) on (θ, ψ); seeding when `p_t > F_age · v̂_rootmax / v̄_root`, probability σ·min(1,dt) per tick; module shedding cascades to descendants; first flowering switches to mature (λ, D) — [broflora docs/auto-flora-strategy.md](https://raw.githubusercontent.com/wlejon/broflora/main/docs/auto-flora-strategy.md)
- hindlet/synthetic_silviculture — Rust (bevy_ecs, vulkano, egui, voronator), 91 commits, 5 stars, README is one line; no docs on which parts are done — [GitHub](https://github.com/hindlet/synthetic_silviculture); [Cargo.toml](https://raw.githubusercontent.com/hindlet/synthetic_silviculture/main/Cargo.toml)
- ndevlin/EcosystemCreatorRepo — Visual Studio/C++ student project "based on Synthetic Silviculture Paper", 86 commits, no license, README is images only — [GitHub](https://github.com/ndevlin/EcosystemCreatorRepo)
- anthonymansur/CIS565-Final-Project — wildfire simulation (CUDA, UPenn CIS 565) whose trees are "a collection of branch modules" after this paper — [GitHub](https://github.com/anthonymansur/CIS565-Final-Project)
- Phylliida/WorldSeed — uses the temperature/precipitation biome idea for vegetation generation — [GitHub](https://github.com/Phylliida/WorldSeed)
- The GraphicsReplicability tracker lists "Synthetic Silviculture" among SIGGRAPH 2019 papers with "Video" only and no code note — [replicability.graphics issue #75](https://github.com/GraphicsReplicability/replicability.graphics/issues/75)
- The project page offers paper, supplementary (glossary) and video; "Not present on the page: code, data" — [project page](https://storage.googleapis.com/pirk.io/projects/synthetic_silviculture/index.html); Pałubicki's publications page links no code for either tree paper (it does link code for other projects, e.g. MaSC, GreenScapes, DCGrid) — [wp.faculty.wmi.amu.edu.pl](https://wp.faculty.wmi.amu.edu.pl/)

**Pałubicki 2009 ports**
- inuritdino/SOT — "the actual LPFG-SOT code (C++ and L+C)" of Pałubicki et al. 2009, runnable in L-studio/VLab, modified for the BayesForest toolbox; contains `lsystem.l`, `env.hpp`, `parameters.inc`, `default_parameters.inc` and sot-dist zips v1.0.0–1.2.8; no license shown — [GitHub](https://github.com/inuritdino/SOT) (whether it is the authors' own release is not stated on the page; the file set matches the paper's description of L+C + C++ environment code)
- bernardosulzbach/self-organizing-tree-models — C++ with OpenGL (glad, shaders), BSD-2-Clause, 19 stars, 7 forks, report and presentation folders; README says it implements "the main ideas" of the 2009 paper — [GitHub](https://github.com/bernardosulzbach/self-organizing-tree-models)
- A Unity/C# course exercise from Pałubicki's own university (AMU, repo "MWS", branch cw5) implements an `addShadow` method that "first increases the shadow value at a given position, then loops downward, lowering the shadow strength at each level while widening the area it affects", feeding an L-system — [git.wmi.amu.edu.pl MWS cw5](https://git.wmi.amu.edu.pl/s439476/MWS/compare/master...cw5)
- tommaso-r/awesome-trees-generation — curated list of open-source tree generation projects — [GitHub](https://github.com/tommaso-r/awesome-trees-generation)

**Space colonization (Runions et al. 2007) in JavaScript**
- npm `space-colonization` — JS implementation; you pass bud positions and attractors, it returns a per-frame grow function; options for step size, split chance, angles; marked unstable, geometry-agnostic — [npm](https://npmjs.com/package/space-colonization)
- jasonwebb/2d-space-colonization-experiments — JS, 2-D, 222 stars — [GitHub](https://github.com/jasonwebb/2d-space-colonization-experiments)
- Blender add-on "Space Colonization Tree Generator" based on Runions et al. 2007 — [extensions.blender.org](https://extensions.blender.org/add-ons/space-colonization-tree-generator/)
- Runions, Lane, Prusinkiewicz 2007, "Modeling trees with a space colonization algorithm", Eurographics Workshop on Natural Phenomena, 63–70 — cited in [Pałubicki 2009 refs](https://www.algorithmicbotany.org/papers/selforg.sig2009.small.pdf)

**Related / earlier work (citations verified)**
- Pirk, Stava, Kratt, Said, Neubert, Měch, Benes, Deussen 2012, "Plastic trees: interactive self-adapting botanical tree models", ACM TOG 31(4) Art. 50, DOI 10.1145/2185520.2185546 — [Purdue page](https://cs.purdue.edu/cgvlab/www/publications/Pirk12ToG), [PDF](https://cs.purdue.edu/homes/bbenes/papers/Pirk12ToG.pdf)
- Stava, Pirk, Kratt, Chen, Měch, Deussen, Benes 2014, "Inverse Procedural Modelling of Trees", Computer Graphics Forum 33(6):118–131, DOI 10.1111/cgf.12282 — [EG diglib](https://diglib.eg.org/items/4c6abd53-959e-4336-af65-3eb719b9c1c3), [PDF](https://cs.purdue.edu/homes/bbenes/papers/Stava14CGF.pdf). Makowski 2019 §8 uses Stava's 25-parameter model to generate trees, decomposes them into 10 modules and regrows them (Fig. 18) — [Makowski 2019](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Hädrich, Benes, Deussen, Pirk 2017, "Interactive Modeling and Authoring of Climbing Plants", CGF 36(2):49–61; Pirk et al. 2014 "Windy Trees" TOG 33(6); Pirk et al. 2017 "Interactive Wood Combustion" TOG 36(6); Měch & Prusinkiewicz 1996 "Visual models of plants interacting with their environment" (SIGGRAPH 96, 397–410) — all from [Makowski 2019 reference list](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Earlier ecosystem simulation the paper positions itself against: Deussen et al. 1998 (plants as 2-D disks), Lane & Prusinkiewicz 2002, Beneš et al. 2009 — [Makowski 2019 §2, §8](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)
- Follow-ups from the same group on Pałubicki's page: "Interactive Invigoration" and "Ecoclimates" project pages — [wp.faculty.wmi.amu.edu.pl](https://wp.faculty.wmi.amu.edu.pl/)

### Inferences
- broflora's strategy doc is the most useful secondary artefact: it is effectively a line-by-line implementation checklist for the 2019 paper and honestly flags every place the paper under-specifies (shadow stamp, N-way split, seeding probability, orientation search).
- For a browser demo the cleanest path is: bud-scale Pałubicki 2009 (shadow grid + BH split + tropism + pipe widths) for individual trees, then the 2019 ecosystem layer (seeding, senescence, s_tol, adaptation) on top; the module library is the part with the least published detail and can be replaced by bud-level growth without losing the ecosystem behaviour.

### Gaps
- I could not open the source trees of hindlet, ndevlin or SOT to confirm what is implemented or extract parameter files (`parameters.inc`); only READMEs/file lists were read.
- Kohek & Strnad GPU paper: full text and any code not retrieved.
- No JS/WebGL port of shadow propagation or of Synthetic Silviculture was found in these searches.

---

## What this means for the paper

A browser demo deserves the name "synthetic silviculture" only if it contains the ecosystem loop, not just a nice tree: many individual plants whose branches compete for light through a shared shadow field (a voxel/column grid with the a·b^(−q) pyramid or the paper's lerp(s_tol, 1, Q·Q_G) column shadow), Borchert–Honda vigor allocation with an apical-control λ per species, shedding of starved branches, per-species maximum age with senescence, and seeding in a Gaussian radius so that succession, gap dynamics and self-thinning emerge. What can be simplified without betraying the model: replace the 9-prototype module morphospace and its orientation optimisation with Pałubicki-2009 bud-level growth (the ecosystem layer never depends on modules), use a 2-D or small 3-D grid (64³ or a 2-D column map), drop terrain/soil to flat ground or a single elevation→temperature gradient, keep one or two species differing in λ, s_tol, p_max and seeding radius, and render with instancing; the climate Gaussian, flowering switch and LOD are optional decoration.
