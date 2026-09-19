# 02 — Algorithms: agents, flux, and the hybrid

Scope: the simulation algorithms behind the first organism (*Physarum polycephalum*), written against the kernel vocabulary K3 (stencil), K5 (per-cell ODE), K8 (iterative solve), K9 (agent step), K10 (advect), and against the rungs of chapter 03 (R1 base 22 µm 2.5-D; R2 bricks 32×32×8; R3 lens ≤ 1 µm; G vein graph). The brief says "~5 µm" bricks; chapter 03 fixed them at 5.5 × 5.5 × 22 µm so that one brick is exactly 8 × 8 base cells. Tables below give both 5 and 5.5 where it matters.

Verification: literature statements were checked this session against the papers' text or abstracts unless tagged **[unverified]** (recalled, or source paywalled). Everything in §4–§9 that is not a citation is *design* and is ours; cost numbers marked (est.) are derived from the measured rates in chapter 03 §2.

---

## 1. The Jones agent model

### 1.1 Algorithm

Jones (2010, *Artificial Life* 16:127; companion IJUC paper, arXiv:1503.06579, from which the pseudo-code and table below are taken verbatim in substance). A population of point agents lives on a 2-D lattice that also stores a scalar *trail* T. Each agent has a continuous heading θ, occupies one pixel, and has three forward sensors F, FL, FR at distance SO, angles 0, ±SA, width SW.

```
per scheduler step, agents visited in random order:
  MOTOR:   p' = p + SS·(cos θ, sin θ)
           if cell(p') unoccupied:  p ← p';  T[p] += depT
           else:                    θ ← uniform random (no move, no deposit)
  SENSORY: sample F, FL, FR
           if F > FL and F > FR:     keep θ
           elif F < FL and F < FR:   θ ± RA at random
           elif FL < FR:             θ −= RA      (turn right)
           elif FR < FL:             θ += RA      (turn left)
then: T ← mean3x3(T) · (1 − damp)
```

The collision rule (one agent per pixel, random re-orientation on a blocked move) gives the "material" a volume and makes population density (%p) a morphology parameter. Agents with a sensor outside the arena are made to turn, otherwise they adhere to walls (an artefact Jones notes).

| Parameter | IJUC table value | Commonly quoted 2010 defaults **[unverified]** |
|---|---|---|
| %p population (% of pixels) | 5 | 3–15 |
| SA sensor angle | 15° (45° for stable nets) | 22.5° or 45° |
| RA rotation angle | 45° | 45° |
| SO sensor offset | 15 px | 9 px |
| SW sensor width | 1 px | 1 px |
| SS step | 1 px | 1 px |
| depT deposit | 5 | 5 |
| damp / decayT | 0.1 | 0.1 |
| pCD random turn prob. | – | 0 |

### 1.2 Regimes

Verified from the IJUC text: SA = 45°, RA = 45° gives networks that coarsen and settle into a stable minimising (Steiner-like, 120° junctions) state; dropping SA to 15° (at SO = 15 px this is the threshold) breaks stability into a perpetually *foraging/streaming* dynamic network with sprouting branches; too-strong damping does the same; very small SO destroys network formation. From the 2010 parameter map **[unverified in detail]**: RA > SA → continuous contraction of lacunae; RA < SA → spontaneous branching; large SA and RA → labyrinths, then spots/islands; high %p → sheets with vacancy islands. The abstract (verified) names the three families: reticulated, labyrinthine, spotted.

### 1.3 Pixel units → physical units

The model is dimensionless; the pixel is the only length and the step the only time. Mapping it onto our grids with h = cell size, Δt = sim step:

| Quantity | px value | h = 22 µm | h = 5.5 µm | h = 5 µm |
|---|---|---|---|---|
| SO = 9 | 9 px | 198 µm | 49.5 µm | 45 µm |
| SO = 15 | 15 px | 330 µm | 82.5 µm | 75 µm |
| SS = 1 | 1 px/step | 22 µm/step | 5.5 | 5 |
| SW = 1 | 1 px | 22 µm | 5.5 | 5 |
| trail diffusion length ℓ_T | 1.78 px | 39 µm | 9.8 µm | 8.9 µm |
| emergent vein width ≈ 2–4 px **[unverified, empirical]** | | 44–88 µm | 11–22 µm | 10–20 µm |
| emergent mesh spacing ≈ 3–6 × SO **[unverified, empirical]** | | 0.6–2 mm | 0.15–0.5 mm | 0.14–0.45 mm |

ℓ_T is derived, not quoted: a full 3×3 mean per step has variance 2/3 px² per axis, so D_T = h²/(3Δt); damp = 0.1 is a rate λ = −ln(0.9)/Δt = 0.105/Δt; ℓ_T = sqrt(D_T/λ) = 1.78 px. Hence the Jones default sits at **SO/ℓ_T ≈ 5** — the sensor reaches about five trail-diffusion lengths ahead.

Implication: with pixel defaults the 22 µm grid lands in the real organism's range (veins 50–500 µm, mesh 0.5–3 mm **[unverified ranges]**), while the brick grid produces a network four times too fine. Morphology is set by SO and ℓ_T in *pixels*.

### 1.4 Scale-invariance rules

Declare every parameter physically and convert per rung. The pattern is controlled by dimensionless groups; keep these fixed and the morphology is resolution-independent:

- Π1 = SO/ℓ_T (≈ 5), Π2 = SA, Π3 = RA, Π4 = SS/SO (≤ 0.1), Π5 = n_a·SO² (agents per sensing area; Jones: 0.05 × 81 ≈ 4), Π6 = deposit rate / (λ · T_ref).

Conversion rules:

1. SO_px = SO_µm / h; SS_px = v_a Δt / h. If SS_px > 1 and the collision rule is on, substep; with the soft cap (rule 5) SS_px up to vein half-width is safe.
2. Diffusion is a blend toward the 3×3 mean with weight w = 3 D_T Δt / h². w ≤ 1 is required; matching D_T = 161 µm²/s (the Jones value at 22 µm, 1 s) on 5 µm cells needs w ≈ 19, i.e. ~20 passes. **Therefore the chemotactic trail T lives on R1 only**, at every zoom; bricks refine biomass, conductivity and material, not the trail. Brick agents sample T bilinearly from R1. This removes the worst resolution dependence outright.
3. Decay factor per step = exp(−λΔt), never a bare constant.
4. Deposit is a concentration: ΔT = depRate · Δt · m_a / h² (per unit thickness in 3-D), so the field is independent of h.
5. Agent areal density n_a (agents/µm²) is the invariant, not %p. At fine h there is ≪ 1 agent per cell and Jones's exclusion rule becomes meaningless; replace it by a *density cap*: reject the move if ρ(target) ≥ ρ_max, evaluated on the previous step's counts (Jacobi-style, hence order-independent — §7).
6. Sensor width is physical: sample a field pre-filtered to SW_µm (use the R1 trail for SW ≈ 22 µm; a mip for larger).

---

## 2. Modern formulations

### 2.1 Jenson "36 Points" / Bleuje

Sage Jenson's write-up restates Jones as six sub-steps (sense, rotate, move, deposit, diffuse 3×3, multiplicative decay) on the GPU, dropping the collision rule. "36 Points" makes each parameter a function of the locally sensed trail x; Etienne Jacob (Bleuje) documents the form (verified on his explanation page):

```
sensorDistance = p1  + p2 ·x^p3        rotationAngle = p7  + p8 ·x^p9
sensorAngle    = p4  + p5 ·x^p6        moveDistance  = p10 + p11·x^p12
p13 = heading-independent sensor offset ("vertical")    p14 = heading-relative look-ahead offset
p15 = rescale of the sensed x
```

The 36 Points README describes a Point as 20 numbers; the five beyond p1–p15 are not documented on the pages we could read (**[unverified]**: likely deposit, decay and display terms). State-dependence is the key idea: in dense trail the agent senses short and turns tight (veins), in thin trail it senses far and runs straight (exploration) — one genome holds several Jones regimes.

Other verified details: agents `atomicAdd` a per-pixel **counter**; a second pass adds **√k · f** to the trail (k = count, f = deposit factor) — sublinear, so crowded pixels do not run away; trail is blurred 3×3 and multiplied by a decay (example 0.75); each particle carries a progress attribute and **respawns** at a random position periodically (a global mass-recycling term that prevents permanent trapping); **inertia**: v' = 0.98 v + (cos φ, sin φ), dt = 0.07 · moveDistance^1.4, p_inertia = p + dt·v', final p = mix(p_classic, p_inertia, a).

### 2.2 Monte Carlo Physarum Machine (Elek, Burchett, Prochaska, Forbes 2022)

MCPM is a probabilistic 3-D generalisation of Jones (verified from the abstract, the Polyphorm paper and the PolyPhy docs):

- The 3-sensor stencil is replaced by **two samples**: deposit d0 along the current heading and d1 along one *mutated* direction drawn inside a cone of half-angle `sense_angle` around the heading, at a sensing distance drawn from P_dist.
- The agent adopts the mutated direction with probability P_mut = d1^s / (d0^s + d1^s), s ≥ 0 the **sampling exponent** (search-snippet verified; exact normalisation **[unverified]**). s → ∞ recovers greedy Jones; s = 0 is a random walk; published fits use s ≈ 1.5–3.
- Two fields: the **deposit** field (agents + data emit into it; diffused by a small kernel and attenuated; this is what agents sense) and the **trace** field (time-averaged agent density; attenuated only, never diffused, never sensed; this is the output). Separating them keeps the output sharp.
- 3-D orientation needs no frame: the agent stores a unit heading vector; the mutated direction is a cone sample around it; the turn is a bounded rotation toward the chosen direction (`move_angle`, typically half of `sense_angle`: 10° vs 20°).

### 2.3 Recommended 3-D sensing for the brick slab

The brick slab is 8 voxels deep and z-coarse (8 × 22 µm = 176 µm, or 40 µm if isotropic 5 µm). A 22.5° cone at SO = 200 µm spans ± 83 µm vertically — the whole slab or more — so isotropic cone sampling spends its samples outside the body and has at best ± 1–3 voxels of vertical resolution to find. Recommendation — **planar Jones + stochastic vertical MCPM**:

1. Heading = in-plane angle θ (u16) plus a pitch ψ clamped to ± ψ_max (≈ 15°).
2. In-plane: deterministic 3-tap F/FL/FR at the agent's z, reading T from R1 plus brick-local terms (§4.5). Deterministic taps give crisp veins at far lower agent counts than two-sample MC.
3. Vertical: one MCPM pair — d0 at the forward sensor point, d1 at the same point displaced ± one z-voxel (sign from the agent RNG); accept pitch change with P_mut, s ≈ 2. Offsets are metric (µm), never voxel counts, so anisotropic voxels are handled once.
4. Substrate and free surface are reflecting for agents, with an adhesion bias −g_z that keeps mass on the agar.

Why: the z-structure of a plasmodium is layering (tube over sheet over slime), not a free 3-D network; 5 fetches instead of a cone; the only stochastic decision is a 1-bit integer-RNG draw (§7).

---

## 3. Flux models

### 3.1 Tero–Kobayashi–Nakagaki (2007), verified against the paper

Tubes are edges M_ij of length L_ij, radius a_ij, between nodes of pressure p_i. Poiseuille flow gives

  Q_ij = π a_ij⁴ (p_i − p_j) / (8 κ L_ij) = D_ij (p_i − p_j) / L_ij,  D_ij := π a_ij⁴ / 8κ.

Nodes have zero capacity (Kirchhoff): Σ_i Q_ij = 0, except Σ_i Q_i1 + I0 = 0 at the source and Σ_i Q_i2 − I0 = 0 at the sink. Total flux I0 is *fixed*, so edges compete for it. Adaptation:

  dD_ij/dt = f(|Q_ij|) − r D_ij,  f increasing, f(0) = 0.

Non-dimensionalised (t → t/r, Q → Q/I0): dD/dt = f(|Q|) − D with p from the network Poisson equation Σ_i (D_ij/L_ij)(p_i − p_j) = ±1, 0. Tero solves the linear system by ICCG and steps D semi-implicitly: (D^{n+1} − D^n)/δt = f(|Q^n|) − D^{n+1}.

Two families: **Type I** f = Q^μ; **Type II** (sigmoid) f = (1 + a) Q^μ / (1 + a Q^μ), μ > 1, from f = δ (Q/Q_h)^μ / (1 + (Q/Q_h)^μ), a = (I0/Q_h)^μ.

| Regime | Outcome (all cut dead ends first) |
|---|---|
| μ > 1 | one of each set of competing paths survives; *which* depends on initial D (bistable); faster selection and narrower shortest-path basin as μ grows |
| μ = 1 | shortest path always, independent of initial state; slow |
| 0 < μ < 1 | all parallel paths survive, shorter ones thicker; unique state |
| Type II, small a → large a | like μ > 1 → intermediate → all paths survive |

**Tero et al. 2010** (*Science* 327:439): many food sources; at each time step a random pair is chosen as source and sink, so every tube must carry flux for many pairings — the fluctuating load is what buys fault tolerance (loops). f = |Q|^γ/(1 + |Q|^γ) with γ ≈ 1.8 and I0 as the cost/robustness knob **[unverified: form and values recalled, Science full text not accessible]**.

### 3.2 Proofs and variants

- **Bonifaci, Mehlhorn, Varma 2012** (JTB 309:121; SODA'12): for μ = 1 the dynamics converge to the shortest s0–s1 path on *any* graph from any positive initial D. **Ito, Johansson, Nakagaki, Tero 2011** (arXiv:1101.5249): on digraphs the solver converges exponentially to the optimum of the linear transshipment problem. **Bonifaci 2016/17** (arXiv:1606.04225): global convergence fails for μ ≠ 1 or with saturation; proposes that the controlling variable is the *pressure gradient* rather than flux, which restores convergence for a wide class of response functions.
- **Akita et al. 2017**: *J. Phys. D* 50:024001 — plasmodia evacuating an arena through a narrow exit build a branching tree obeying Murray's law; *Dev. Growth Differ.* — a current-reinforcement model reproduces the vein trajectory. The relevant lesson: **distributed sources** (mass leaving every point of a sheet) plus one sink produce a hierarchical tree, which is exactly the geometry behind a growing front **[model details unverified; abstracts only]**.
- **Ma, Johansson, Tero, Nakagaki, Sumpter 2013** (J. R. Soc. Interface 10:20120864; equations verified via PMC). Particles are injected at the source at rate ν and removed at sinks; a particle at node i hops to neighbour j with probability ∝ D_ij / l_ij (eq. 2.1 gives the unweighted form (1/l_ij)/Σ_k(1/l_ik); the D-weighting is our reading **[unverified]**). With N_i the number of particles at node i, the mean net current is

   I_ij = (D_ij / l_ij)(N_i − N_j)

 — **particle count plays the role of pressure**. Reinforcement: D_ij(t+Δt) = D_ij + q|I_ij|Δt − λ D_ij Δt; its Δt → 0 limit dD/dt = q|I| − λD is the mean-field Physarum solver; the nonlinear variant dD/dt = q|I|^μ − λD with μ ≈ 1.1 gives shared trunks (Steiner-like, ant-trail-like networks on a hexagonal lattice). Simulated with Poisson particle numbers per edge (q = 0.01, λ = 1, Δt = 0.01, ν = 10). Reinforcing by *net current* rather than *density* (the pheromone/Jones rule) avoids self-reinforcing loops: a closed loop holds density but no net current. This is the bridge: Jones reinforces what is *occupied*, Tero what *transports*; CRRW is an agent model of the latter and doubles as a Monte Carlo pressure solver.
- **Hu & Cai 2013** (PRL 111:138701). Energy E = Σ (Q²/C + ν C^γ) L: pumping dissipation plus metabolic cost. Its gradient flow under the Kirchhoff constraint is *local* (verified as restated by Haskovec et al.): dC_ij/dt = ((p_j − p_i)²/L_ij² − M′(C_ij)) L_ij, M(C) = (ν/γ) C^γ. Fixed points obey Q² ∝ C^{γ+1}, i.e. a Tero exponent **μ_eq = 2/(γ+1)**: γ = 1/2 (cost ∝ tube volume, since C ∝ r⁴) gives μ = 4/3 and Murray's Q ∝ r³; γ = 1 ↔ μ = 1; γ > 1 ↔ μ < 1 (convex, unique, loopy). Fluctuating sinks produce hierarchical loops with a transition in the sink open-probability.

### 3.3 The continuum (grid-native) form

Hu–Cai's continuum version, analysed by Haskovec, Markowich, Perthame (2015) and extended by Haskovec, Markowich, Pilli (2021, tensor), verified from arXiv:2111.03889:

 Vector model: −∇·[(r I + m⊗m) ∇p] = S;  ∂m/∂t = D²Δm + c²(m·∇p)∇p − |m|^{2(γ−1)} m
 Tensor model: −∇·[(r I + C) ∇p] = S;  ∂C/∂t = D²ΔC + c² ∇p⊗∇p − |C|^{γ−2} C

Darcy flux q = −(rI + C)∇p. r(x) > 0 is an isotropic background permeability (it makes the elliptic problem solvable everywhere), D² a small diffusion, c² the activation gain, γ the metabolic exponent. Both are L² gradient flows of E = ∫ D²/2 |∇C|² + c² ∇p·P∇p + M(|C|); convex for γ ≥ 1, non-convex with many network-like steady states for γ < 1. On a *rectangular* grid the discrete Hu–Cai model converges to the tensor model with **diagonal C** — i.e. conductances stored on cell faces. Published numerics are 2-D finite differences, semi-implicit in time with ADI; the branch count depends on mesh and parameters. For us: this is the right skeleton (r = sponge permeability of undifferentiated plasm; C = vein), but it has no growth, no mass, no oscillation — which the agents and §5 supply.

---

## 4. The hybrid (design)

### 4.1 State

| Field | Rung | Type | Meaning |
|---|---|---|---|
| agents (x, y, z, θ, ψ, state, age) | continuous | i32 fixed + bits | mass quanta m_a; state ∈ {gel, sol} |
| n (counter) | R1, R2 | atomic u32 | agents per cell this step, per state |
| ρ | R1, R2 | fixed-point | biomass density = m_a · n / V_cell, lightly smoothed |
| T | R1 only | fixed-point | chemotactic trail (§1.4) |
| Dx, Dy (Dz) | cell faces | f32 | vein conductivity = diagonal tensor C |
| p | z-collapsed 2-D pyramid | f32 | pressure |
| z = (cos φ, sin φ) | R1 | f32 ×2 | oscillator (§5) |
| Q̄ | faces | f32 | rectified, period-averaged flux magnitude |

Face-stored diagonal conductance is chosen over a full 2×2/3×3 tensor: it *is* the Hu–Cai graph on the grid, yields a symmetric M-matrix (5/7-point stencil, every smoother converges), and its continuum limit is known. Its weakness is axis bias; isotropy is restored by the agents (they choose where mass is) and by seeding D from the agent heading tensor J = Σ m_a ĥ⊗ĥ (diagonal part only).

### 4.2 Equations

```
(1) permeability     P = r0·ρ/ρ0 · I + D                    (zero where ρ = 0: the domain mask)
(2) pump source      s = −∂h_rest/∂t = −h0(ρ)·a·ω·cos φ     (contracting cortex expels sol: s > 0)
(3) front sink       s_f = −ρ_new/Δt on newly occupied cells (advancing margin fills with sol)
(4) pressure         β ∂p/∂t − ∇·(P∇p) = s + s_f            (β = wall compliance; §6)
(5) flux             Q = −P∇p ;  Q̄ ← Q̄ + (Δt/τ_Q)(|Q| − Q̄)  (rectify: shuttle flow reverses, |Q| does not cancel)
(6) adaptation       ∂D/∂t = α·Q̄^μ / (1 + (Q̄/Q_h)^μ) − r_D·D + κ_D ΔD,   only where ρ > ρ_min
(7) sol transport    sol agents: x += (Q/(φ_s h))Δt + CRRW hop noise;  gel agents: Jones/36-pt crawl
(8) exchange         gel→sol at rate k_gs·max(0, −∂h_rest/∂t)/h0 ;  sol→gel at rate k_sg·(1 − ρ/ρ_max)
```

### 4.3 What the sources mean

Physarum has no source and sink nodes; it has a contractile cortex. With thickness h = h0(1 + a sin φ), a contracting column loses volume at −∂h/∂t and that volume must leave laterally: s = −∂h_rest/∂t. Integrated over a connected body and one period ∫s = 0 — peristalsis moves fluid back and forth (shuttle streaming, period ≈ 2 min, speeds to ≈ 1 mm/s; both figures from Tero 2007). Net transport comes from correlations: phase gradients (§5), the front sink (3), and food uptake creating mass (spawn agents at rate g·nutrient·ρ, deterministic ids). Tero's single pair and Tero-2010's random pairs are the coarse-grained shadow of this: a time-varying, zero-mean s gives exactly the fluctuating load that Hu–Cai and Tero 2010 need for loops, for free. Food sources are therefore *not* hard-wired sources; they act through frequency (§5) and growth.

Mass conservation: biomass is carried only by agents, so it is conserved to the integer. D carries no mass (it is structure); h is diagnostic, h = ρ-column/ρ_plasm · (1 + a sin φ).

### 4.4 Why fan + coarsening veins should emerge

At the margin D ≈ 0 and P ≈ r·ρ: isotropic porous flow into a distributed sink, so the margin advances as a sheet (the fan), its Jones-type texture supplied by gel agents with exploratory (long-SO, small-RA) genome at low x. Behind the margin all of that flux must converge rearward: |Q| rises with distance from the front, exceeds Q_h·(r_D/α)^{1/μ}, and with μ > 1 (μ_eq = 4/3 for volume cost) the uniform sheet is unstable to channeling — Akita's evacuation geometry run backwards. Parallel channels compete for a bounded flux; losers decay at r_D; survivors obey r ∝ D^{1/4} ∝ Q^{1/3}. The zero-mean oscillating part of s keeps cross-links alive (loops), its amplitude setting meshedness.

### 4.5 Feedback from flux to agents

- Sensing: x = T + β_D · log2(1 + D/D0) + β_Q · Q̄/Q_h. Agents prefer channels that *transport*, not merely ones that are *occupied* — the CRRW correction to Jones.
- Deposit: depRate · (1 + γ_Q Q̄/Q_h); idle veins stop being re-painted and starve.
- Genome modulation: the 36-Points forms p = a + b·x^c read the combined x.
- Advection: only sol agents drift with Q; gel agents build wall. This is endoplasm/ectoplasm, and it is what makes mass physically drain from pruned veins into winners.

### 4.6 Couplings ranked by risk

| # | Coupling | What it is | Risk | Verdict |
|---|---|---|---|---|
| A | One-way diagnostic | Agents alone make the morphology; D := k·T̄², pressure solved only to colour flow and drive R3 | low | P1 ship; veins do not coarsen by function |
| **B** | **Two-way, grid-native** (§4.2) | face-D Hu–Cai + compliant pressure + gel/sol agents | medium | **recommended P2** |
| C | Pure CRRW | no p field; sol walkers hop ∝ D, net face crossings = Q | medium-high | noise ∝ 1/√N; pressure information spreads diffusively at walker speed — too slow over 90 mm; keep as validator and as the local stochastic term in (7) |
| D | PDE-first | full tensor Haskovec system makes veins; agents only texture the front | high | stiff, mesh-dependent branch count, needs a tight elliptic solve each step, grid-aligned veins |

---

## 5. Oscillator layer

Literature. Takamatsu et al. built living coupled-oscillator systems from plasmodia in micro-fabricated wells and channels (PRL 87:078102); coupling strength is set by tube width. Matsumoto/Miyake-line experiments: local attractants (glucose, warmth, oat) start new phase waves at the stimulated site, and phase-gradient vectors point *away* from attractants, toward repellents (search-verified summary). **Kobayashi, Tero, Nakagaki 2006** (J. Math. Biol. 53:273) couple an oscillator field to sol flow through an elastic gel and reproduce anti-phase front/rear oscillation of a freely extending front; their stated conclusion is that **cell stiffness, not oscillator coupling alone, plays the primary role** (abstract verified; equations not accessible **[unverified]**). **Radszuweit, Alonso, Engel, Bär 2013** (PRL 110:138102): active poroelastic two-phase model (gel matrix + cytosol, calcium-regulated active stress) giving travelling, standing and rotating mechanochemical waves — the principled model, far too heavy for us. **Alim et al. 2013** (PNAS 110:13306): contractions form a peristaltic wave whose wavelength scales with organism size, maximising transport.

Minimal GPU set (complex order parameter — no phase unwrapping, plain K3 + K5):

```
∂z/∂t = i·ω(x)·z + K_φ·∇·(ρ∇z)/ρ + Γ(1 − |z|²)z + i·χ_p·(p − p̄)·z
ω(x)  = ω0·(1 + χ_A·A(x) − χ_R·R(x)),     ω0 = 2π/120 s
h     = h0(ρ)·(1 + a(x)·Im z),            a(x) = a0·(1 + χ_E·A(x))   (attractant softens the cortex)
s     = −∂h/∂t|active = −h0·a·φ̇·Re z,   φ̇ = Im(ż/z) ≈ ω      (= −h0·a·ω·cos φ)
```

Coupling only through biomass (ρ-weighted Laplacian) means separated bodies desynchronise and fused bodies entrain. K_φ sets the wavelength; to match Alim, K_φ ≈ L²·Δω. Food → higher ω → phase leads there → waves travel outward from food. Whether net mass then moves toward food depends on wall mechanics (Kobayashi 2006), so the engine exposes the sign through χ_E (a softer, more compliant cortex at food fills preferentially) and χ_p rather than hard-wiring "peristalsis pumps toward food" (§9, risk 2).

---

## 6. The pressure solve

Problem size: 4000 active bricks ≈ 33 M voxels, domain changing every step, coefficient contrast ≥ 10³, possibly many disconnected bodies. Measured rates (chapter 03): 3.4 ms per 7-point sweep over the full brick pool; 1.74 ms per 5-point variable-coefficient sweep on 4096².

**First reduction — collapse z.** The slab is ≤ 176 µm thick against millimetre horizontal scales; pressure is z-uniform to lubrication accuracy. Solve p in 2-D on column-summed face conductances; recover Q_z from continuity where R3 needs it. 33 M unknowns → 4.1 M; one sweep ≈ 0.5 ms (est.: 4.1 M × 0.104 ns × 1.25 brick overhead).

**(a) Jacobi / red-black GS / SOR, 2-level.** A smoother alone is hopeless: high-D veins are 1-D conductors in an insulator, the slowest mode decays as 1 − O(π²/N²) with N the vein length in cells (90 mm / 5.5 µm ≈ 16 000 → 10⁷–10⁸ sweeps cold). Geometric multigrid with naive averaging also fails at this contrast because a coarse cell cannot see a 2-cell vein. The fix is cheap with face conductances: coarse face conductance = **sum** of the fine face conductances crossing it (parallel), harmonic combination along (series); this keeps the M-matrix and keeps veins connected on coarse levels. Expected V(2,2) contraction 0.1–0.3 per cycle **[unverified estimate]**. Red-black GS is order-independent within a colour (deterministic) and smooths twice as fast as damped Jacobi.

**(b) Conjugate gradient in WGSL.** Two dot products per iteration = two full reductions (≈ 1.3 sweeps of bandwidth each, log-depth passes, fixed tree for determinism; scalars stay on GPU). Unpreconditioned iterations ~ √κ — thousands. MG-preconditioned CG (McAdams, Sifakis, Teran 2010 — multigrid as CG preconditioner on irregular voxel domains) is the robust version and the right *offline/cold-start* tool, but a V-cycle plus reductions per iteration is too much per frame.

**(c) Graph solve.** Tero's actual model on G: 10⁴–10⁵ unknowns, CPU sparse Cholesky/CG in ≈ 1 ms **[unverified estimate]**, exact. But the fan is not a graph, extraction is the hard part (chapter 03 §4.1), id instability pops, and async readback stalls or breaks lock-step replay. Use it where bricks have retired and as the harness auditor of (a/d).

**(d) No global solve.** β ∂p/∂t = ∇·(P∇p) + s is not a numerical trick: β is the compliance of the elastic tube wall, and pressure in a compliant tube genuinely propagates diffusively with diffusivity P/β. Explicit and purely local. But explicit stability needs Δt < β h²/(4 P_max), while body-scale coherence within one period (Alim) needs P/β ≳ L²/T ≈ (5×10⁴ µm)²/120 s ≈ 2×10⁷ µm²/s → Δt ≲ 4×10⁻⁷ s at 5.5 µm. Infeasible at the fine rung; feasible (Δt ≈ 0.02 s) at a 1.4 mm level. Particle-count pressure (CRRW, N_i ≡ p_i) has the same diffusive limit plus shot noise.

**Recommendation — (d) inside (a): a persistent, compliant, warm-started pyramid.** Discretise (4) backward-Euler:

  (β/Δt) p^{n+1} − ∇·(P∇p^{n+1}) = (β/Δt) p^n + s^{n+1}

The compliance term adds a positive diagonal: no ∫s = 0 compatibility condition, no null space per disconnected body (a pure-Neumann solve is singular on *every* island, and islands appear and merge constantly), better smoothing. Coarse levels carry the global mode that the local model cannot; fine levels are the local elastic relaxation. p persists across frames, and because s varies on a 120 s period and D on minutes, the solution moves ~Δt/T ≈ 10⁻³ per step — one cycle per step tracks it.

| Item | Setting | Cost per step (est.) |
|---|---|---|
| Levels | L0 5.5 µm (sparse, z-collapsed) → L1 11 µm → L2 = R1 22 µm (tiles masked by ρ) → … → 64² | |
| Steady state | one V(1,1), RBGS, ω = 1.0–1.15 | L0 2 × 0.5 + L1 0.25 + L2 2 × 1.74 × ~25 % active + coarser 0.3 + transfers 0.4 ≈ **2.8 ms** |
| Quality mode | V(2,2), or V(1,1) every step + V(2,2) on topology events | ≈ 5 ms |
| Event repair | bricks with residual > tol (fusion, rupture, tool stroke) get 4 extra local RBGS sweeps; rule is a deterministic function of the residual field | + 0.1–0.5 ms |
| Cold start / load | 20–40 V(2,2) cycles to 10⁻⁴ relative residual **[unverified estimate]**, amortised over ~1 s | one-off |
| Without z-collapse | same cycle on 33 M voxels | ≈ 8–9 ms — rejected |

The residual that one cycle leaves is reinterpreted, not hidden: it behaves like extra wall compliance at the unresolved wavelengths. The harness reports it (‖r‖/‖s‖ per step) and the graph solve (c) bounds its effect on Q in tests.

---

## 7. Determinism and numerical hygiene

What WGSL guarantees (spec §15.7, checked): floating-point evaluation permits **reassociation and fusion**, does not fix rounding of built-ins, and an `fma` may be unfused. There is no `precise` qualifier for compute. So **float results are not bit-exact across vendors, and nothing in the language can make them so.** Integer arithmetic (u32 wraps mod 2³²) and atomics are exact everywhere.

Policy:

1. **Tier 1 (promised): same device + driver + browser → bit-exact replay.** Requires: fixed Δt and a logged integer substep count per frame (never frame-time); fixed dispatch sizes and brick ids from a sorted prefix sum; no read-before-write races; fixed-shape reduction trees; no async readback feeding the sim except at logged step indices.
2. **Tier 2 (promised for algorithm A, best-effort for B): cross-device.** Make every *decision* integer:
   - agent position i32 fixed-point (2⁻¹⁶ R1 cells: 4096 × 65536 = 2²⁸); heading u16 into a fixed-point cos/sin LUT (no `sin`/`cos` built-ins);
   - deposit via `atomicAdd` on `array<atomic<u32>>` — integer addition is commutative and associative, so thread order is irrelevant; the drain pass applies isqrt-LUT(count) for the sublinear deposit;
   - trail T as u32 Q16.16: box filter by integer sum and a defined-rounding multiply-shift; decay `(T * k) >> 16`; sensor comparisons on integers → identical turns everywhere;
   - RNG: counter-based, stateless `pcg(hash(seed, agentId, step, stream))` (PCG output permutation or xxhash32); no per-agent RNG state, so sorting and respawn cannot perturb streams;
   - exclusion, if wanted exactly: `atomicMax` of key = (hash(id, step) & 0xFF) << 24 | id into a claim buffer, move iff the claim equals your key. The default is the soft density cap on last step's counts.
3. The float island (p, D, Q̄, z) is *quantised at the boundary* where it feeds agents (x in §4.5 → u16). Decisions can still flip at quantisation edges on another GPU; cross-device equality for coupling B is statistical and the harness tests it as such (chapter 03 §7 agrees).
4. f16 only in presentation channels (write-only from the sim). f32 for p, D, Q̄, z. Never accumulate mass in floats — mass is agent count.
5. Substepping: agents and fields at Δt; pressure may run every k-th step (k logged); oscillator exact-rotation update z ← z·e^{iωΔt} via LUT to avoid drift in |z|.

---

## 8. Multi-scale handoff to the lens rung (R3)

R3 is *derived*, never simulated ahead of its parent:

- **Wall SDF.** Vein conductance per cross-section D_v = Σ_faces D. Lumen radius r = (8κ D_v/π)^{1/4} = r0 (D_v/D0)^{1/4}. Centreline = ridge of the smoothly upsampled D field (or the G edge where one exists); SDF = distance to centreline − r; gel wall thickness w = w0 + c_w r **[unverified ratio]**; micro-relief from noise keyed by (dish seed, brick coords, local cell).
- **Velocity.** u(ϱ, t) = ū(t) · ((n+2)/n) · (1 − (ϱ/r)^n), ū = Q/(πr²). n = 2 is Poiseuille; endoplasm is shear-thinning and the measured profile is blunter — n ≈ 4–6 **[unverified]**. The prefactor makes ∫u dA = Q for every n. Q(t) is the brick's signed Q: shuttle reversal follows the oscillator with no extra state.
- **Micro-particles** (granules ≈ 1 µm, nuclei a few µm **[unverified sizes]**). No per-particle state. Each brick face keeps one fixed-point accumulator Ξ = ∫ū dt (signed displacement of the mean flow). Particle k of segment e has hashed lumen coordinates (s0, ϱ, ϑ) = H(dish seed, brick coords, e, k), and its position is the pure function s = (s0 + ((n+2)/n)(1 − (ϱ/r)^n) · Ξ) mod L_e. Particles reverse with the shuttle, shear apart by radius as in real footage, and a revisited place shows the same granules in the right displaced positions.
- **Consistency tests (harness, every R3 instantiation):** (i) |∫_lumen u dA − Q_brick| / |Q_brick| < 2 %; (ii) lumen + wall volume over the brick footprint = brick ρ-volume ± 5 %; (iii) footprint-mean R3 height = R1 height channel; (iv) instantiate, discard, re-instantiate → bit-identical on the same device.

---

## 9. Hybrid genome, and open risks

| Name | Meaning | Unit | Default | Range | Read by |
|---|---|---|---|---|---|
| m_a | biomass per agent | pg (arbitrary mass unit) | 1 | – | K9, drain |
| n_a | initial areal agent density | µm⁻² | 1.0e-4 (≈ 5 % of R1 cells) | 0.3–3e-4 | seed |
| v_a | gel agent crawl speed | µm/s | 22 | 5–60 | K9 |
| Δt | sim step | s | 1.0 | 0.25–2 | all |
| SO0, SO1, SOc | sensor offset a + b·x^c | µm, µm, – | 200, −120, 0.5 | 45–500 | K9 |
| SA0, SA1, SAc | sensor angle | deg | 35, −15, 1 | 10–90 | K9 |
| RA0, RA1, RAc | rotation per step | deg | 45, −25, 1 | 5–90 | K9 |
| MD0, MD1, MDc | move distance factor | – | 1, 0.5, 1 | 0.5–3 | K9 |
| SW | sensor width | µm | 22 | 22–88 | K9 (mip select) |
| ψ_max, s_z | max pitch; vertical sampling exponent | deg, – | 15, 2 | 0–30, 0–6 | K9 |
| D_T | trail diffusivity | µm²/s | 160 | 40–400 | K3 (R1) |
| λ_T | trail decay | s⁻¹ | 0.105 | 0.02–0.3 | K3 (R1) |
| dep, dep_exp | deposit rate; count exponent | conc·s⁻¹, – | 5, 0.5 | –, 0.5–1 | drain |
| ρ_max | density cap (soft exclusion) | pg/µm³ | 1 agent per 22 µm cell column | ×0.5–4 | K9 |
| t_resp | respawn period (0 = off) | s | 0 | 0–3600 | K9 |
| inertia a | mix toward inertial position | – | 0 | 0–0.5 | K9 |
| β_D, β_Q | sensing weight of D, of flux | – | 0.5, 1.0 | 0–4 | K9 |
| γ_Q | deposit gain by flux | – | 1.0 | 0–4 | K9 |
| k_gs, k_sg | gel→sol, sol→gel rates | s⁻¹ | 0.02, 0.05 | 0–0.5 | K9 |
| r0 | sponge permeability at ρ0 | µm⁴·Pa⁻¹·s⁻¹ (normalised 1) | 1 | fixed scale | K8 |
| α, μ, Q_h | adaptation gain, exponent, saturation flux | –, –, µm³/s | 1, 1.33, 10 × sheet flux | μ 0.8–2 | K5 |
| r_D | conductivity decay | s⁻¹ | 1/600 | 1/3600–1/60 | K5 |
| κ_D | conductivity diffusion | µm²/s | 5 | 0–50 | K3 |
| τ_Q | flux averaging time | s | 120 | 30–600 | K5 |
| D_max/r0 | contrast clamp | – | 10⁴ | 10²–10⁵ | K5, K8 |
| β | wall compliance | µm/Pa (normalised) | P̄·T/L² scale | ×0.1–10 | K8 |
| ω0 | base frequency | rad/s | 0.052 (T = 120 s) | T 60–180 s | K5 |
| χ_A, χ_R | frequency gain, attractant/repellent | – | 0.2, 0.2 | 0–0.5 | K5 |
| χ_E, χ_p | softening gain; pressure-phase coupling | – | 0.5, 0 | 0–2; −1–1 | K5 |
| K_φ | phase coupling | µm²/s | 10⁴ | 10³–10⁶ | K3 |
| a0 | thickness modulation amplitude | – | 0.1 | 0.02–0.25 | K5, present |
| g | growth yield on nutrient | agents·pg⁻¹ | 0.1 | 0–1 | K9 spawn |
| n_prof | lumen profile exponent | – | 4 | 2–8 | R3 |
| V-cycle (ν1, ν2, k) | smoothing counts; pressure every k steps | – | 1, 1, 1 | 1–2, 1–2, 1–4 | K8 |

Defaults for SO/SA/RA reproduce Jones's stable regime at x → 1 and an exploratory regime at x → 0; all flux-side defaults are engineering starting points, not measurements.

Open questions and risks, in order of concern:

1. **Does channeling emerge at the right scale?** The sheet→vein instability wavelength depends on r0, α, μ, κ_D and the front sink; nobody has published this coupling. Needs a 2-D CPU prototype before WGSL.
2. **Sign and magnitude of net transport toward food** from an oscillator + compliant pressure (§5). Kobayashi 2006's stiffness argument must be read in full; χ_E/χ_p may need replacing by a proper elastic law.
3. **Multigrid at 10³–10⁴ contrast on a dynamic sparse domain.** Summed-conductance coarsening is plausible, not proven here; fallback is D_max clamp 10³ and V(2,2). One-cycle-per-step lag may visibly soften shuttle reversal.
4. **Two competing reinforcement loops** (trail T and conductivity D) can fight or lock in. β_D, β_Q, γ_Q need a stability map; coupling A must remain a working fallback.
5. **Axis bias of face conductances** in young veins; if visible, move to the rank-one vector model m (heavier stencil, loses the M-matrix).
6. **Sol/gel bookkeeping**: with too few sol agents Q-advection is noisy; with too many, Jones morphology starves.
7. **Cross-device determinism of coupling B is statistical only**; shared seeds diverge across GPUs after the first float-dependent turn.
8. **Rung mismatch**: with T on R1 only, sub-22 µm structure is driven purely by ρ/D feedback; if fronts look blurry at 5.5 µm, add a short-range brick-local trail.
9. Literature constants still **[unverified]** (Tero 2010 γ, I0; MCPM normalisation; 36 Points parameters 16–20; lumen profile) must be read from the PDFs before the spec freezes.

---

## Sources

- Jones, J. (2010). Characteristics of pattern formation and evolution in approximations of Physarum transport networks. *Artificial Life* 16(2):127–153. https://pubmed.ncbi.nlm.nih.gov/20067403/
- Jones, J. (2010/2015). The emergence and dynamical evolution of complex transport networks from simple low-level behaviours. *Int. J. Unconventional Computing* 6:125–144. https://arxiv.org/abs/1503.06579
- Jenson, S. (2019). physarum. https://cargocollective.com/sagejenson/physarum
- Jacob, E. (Bleuje) (2023–24). Algorithms for making interesting organic simulations. https://bleuje.com/physarum-explanation/ ; code https://github.com/Bleuje/interactive-physarum
- Elek, O., Burchett, J. N., Prochaska, J. X., Forbes, A. G. (2022). Monte Carlo Physarum Machine. *Artificial Life* 28(1):22–57. https://arxiv.org/abs/2204.01256 ; Polyphorm (2020) https://arxiv.org/abs/2009.02441 ; PolyPhy https://github.com/PolyPhyHub/PolyPhy
- Tero, A., Kobayashi, R., Nakagaki, T. (2007). A mathematical model for adaptive transport network in path finding by true slime mold. *J. Theor. Biol.* 244:553–564. https://eprints.lib.hokudai.ac.jp/dspace/bitstream/2115/28041/1/JTB244-4.pdf
- Tero, A. et al. (2010). Rules for biologically inspired adaptive network design. *Science* 327:439–442. https://www.science.org/doi/10.1126/science.1177894
- Ito, K., Johansson, A., Nakagaki, T., Tero, A. (2011). Convergence properties for the Physarum solver. https://arxiv.org/abs/1101.5249
- Bonifaci, V., Mehlhorn, K., Varma, G. (2012). Physarum can compute shortest paths. *J. Theor. Biol.* 309:121–133. https://www.iasi.cnr.it/~vbonifaci/pub/physarum-jtb.pdf
- Bonifaci, V. (2016). A revised model of fluid transport optimization in Physarum polycephalum. *J. Math. Biol.* https://arxiv.org/abs/1606.04225
- Ma, Q., Johansson, A., Tero, A., Nakagaki, T., Sumpter, D. J. T. (2013). Current-reinforced random walks for constructing transport networks. *J. R. Soc. Interface* 10:20120864. https://pmc.ncbi.nlm.nih.gov/articles/PMC3565737/
- Akita, D., Kunita, I., Fricker, M. D., Kuroda, S., Sato, K., Nakagaki, T. (2017). Experimental models for Murray's law. *J. Phys. D* 50:024001. https://iopscience.iop.org/article/10.1088/1361-6463/50/2/024001 ; Akita et al. (2017). Current reinforcement model reproduces center-in-center vein trajectory. *Dev. Growth Differ.* https://onlinelibrary.wiley.com/doi/abs/10.1111/dgd.12384
- Hu, D., Cai, D. (2013). Adaptation and optimization of biological transport networks. *Phys. Rev. Lett.* 111:138701. https://link.aps.org/doi/10.1103/PhysRevLett.111.138701
- Haskovec, J., Markowich, P., Perthame, B. (2015). Mathematical analysis of a PDE system for biological network formation. *Comm. PDE* 40:918–956. https://www.researchgate.net/publication/262994983
- Haskovec, J., Markowich, P., Pilli, G. (2021). Tensor PDE model of biological network formation. https://arxiv.org/abs/2111.03889 ; Astuto, C. et al. (2022). Comparison of two aspects of a PDE model for biological network formation. https://arxiv.org/abs/2209.08292
- Kobayashi, R., Tero, A., Nakagaki, T. (2006). Mathematical model for rhythmic protoplasmic movement in the true slime mold. *J. Math. Biol.* 53:273–286. https://pubmed.ncbi.nlm.nih.gov/16770610/
- Takamatsu, A. et al. (2001). Spatiotemporal symmetry in rings of coupled biological oscillators of Physarum plasmodial slime mold. *Phys. Rev. Lett.* 87:078102. https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.87.078102
- Radszuweit, M., Alonso, S., Engel, H., Bär, M. (2013). Intracellular mechanochemical waves in an active poroelastic model. *Phys. Rev. Lett.* 110:138102. https://pubmed.ncbi.nlm.nih.gov/23581377/
- Alim, K., Amselem, G., Peaudecerf, F., Brenner, M. P., Pringle, A. (2013). Random network peristalsis in Physarum polycephalum organizes fluid flows across an individual. *PNAS* 110:13306–13311. https://www.pnas.org/doi/10.1073/pnas.1305049110
- McAdams, A., Sifakis, E., Teran, J. (2010). A parallel multigrid Poisson solver for fluids simulation on large grids. *SCA 2010*. https://www.math.ucdavis.edu/~jteran/papers/MST10.pdf
- W3C (2026). WebGPU Shading Language, §15.7 Floating point evaluation; §17.8 atomic built-ins. https://www.w3.org/TR/WGSL/
