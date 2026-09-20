# Petri — handoff

Start here. Design and decisions: `study/00-summary-and-spec.md` (§12 = uncertainties and iori's decisions). This file is the state of the code.

## Run

```bash
python3 petri/serve.py 8770        # or launch config "petri"; then http://localhost:8770/petri/
```

`?q=draft|normal|fine` picks the grid (1024² / 2048² / 4096²; 94 / 47 / 23 µm cells). Canonical https://iori.me/petri/ (registered in `pages.meta.json`, site menu bottom-right). WebGPU only.

Harness (T0 + T4), from the page console — no rAF or timers inside, so it runs at full speed in a hidden tab:

```js
const H = await import('/petri/harness.js'); await H.runAll({ tag: 'p1-normal' })   // -> petri/ref/bench-<tag>.json
```

A long call blocks `javascript_tool` for at most 45 s: start it un-awaited, store the result on `window`, poll with a MessageChannel loop.

## What exists (P1b + P1 remainder, 2026-09-20)

| File | What |
|---|---|
| `kernels.js` | The ten growth kernels as WGSL + `KPARAMS` (slider tables) + cell pass, agent pass, agent divide pass, stamp pass, agent erase pass. Header comment documents every kernel's state channels and parameters. |
| `catalog.js` | **93 organisms as data rows** on those kernels, in 12 categories (slime molds, bacteria, swarmers, lichens and minerals, molds, social amoebae, reaction-diffusion, life-like, generations, cyclic, yeasts and sectors, biofilms). Same idiom as flame-strains' `CATALOG`; the life-like and generations rows are the same rulestrings. |
| `engine.js` | Device, buffers, eight organism slots, stamps, operations, Dish ID export/import, stepping, readback, hash, stats. |
| `render.js` | Top-down image: oblique / brightfield / dark-field / phase + six debug channel views, dish wall, reticle, true-scale tool ghost. Reads only `present()` and the substrate. |
| `ui.js`, `ui.css` | The iris-engine Program Manager idiom, reduced: caption, menu bar with the status at its right (sim time, step, cursor x y r θ in mm, field width), four tool windows (Inoculate, Organism, Dish, View) that minimise to the shortcut row, scale bar. |
| `harness.js` | T0: replay, export round trip, nutrient conservation, bare agar, containment + NaN, catalog smoke (every organism). T4: ms per step. |
| `metrics.js` | Morphometrics with FIXED protocols (study/05 §4): box-counting and mass-radius dimension, front radius and interface width, gliding-box lacunarity, radial density profile and ringiness, the five-region morphotype classifier. One module for the harness now and T2 later. |
| `versions/snapshot.py`, `compare.py` | Seal source + bench as an immutable version; scorecard table with arrows and `--diff`. |
| `proto/coupling_b.py`, `proto/FINDINGS.md` | The P1b gate (below). CPU only, `/usr/bin/python3`. |
| `probe/webgpu-probe.html` | Adapter limits and throughput probe (study/03). |

Model in one paragraph: a cell is `vec4f` — rgb state (meaning per kernel), a = slot id. The substrate is a second `vec4f` field: nutrient, attractant, toxin, sheath. One compute pass per step reads A and writes B for both; a kernel sees only neighbours of its own slot; bare agar is claimed by whoever deposits there (agents) or by the strongest neighbour. Kernel 1 (Physarum) adds an agent buffer: sense / turn / move / `atomicAdd` deposit, feeding, and division in a separate pass into a power-of-two range each founder owns. Everything that touches the dish is an **operation** `{t, tool, at|path, r, …}`; tools are stamps; the Dish ID is `{seed, dish, ops}` and replays to the same bits.

**Sealed scorecard — `v1-p1`** (M3 Pro, Chrome 152, normal = 2048²; `python3 petri/versions/compare.py`):

| tier | result |
|---|---|
| T0 | **6/6** — replay and export round trip bit-exact, nutrient conserved to 9 × 10⁻⁹, bare agar bare, nothing outside the wall, all 93 organisms alive |
| T1 | **6/7** — diffusion (isotropy 4 × 10⁻⁹), Fisher speed ratios, DLA D **1.771** (target 1.71 ± 0.10), η sweep monotonic, all five morphology-diagram regions, resolution invariance ΔD **0.005**. Fails: `edenRoughness` (below) |
| T4 | **3.20 ms/step** wall, **2.97 ms** GPU by timestamp query, 86 787 agents |

The one failure is honest and left in place: `edenRoughness` gives β 0.073 at normal where it gives
0.334 at draft. The curvature coupling that makes the front KPZ counts *lattice* neighbours, so it is
inherently tier-dependent; it needs a curvature measured over a fixed physical radius. Widening the
band until it passed would defeat the point of the scorecard.

## P1b — the coupling-B gate came back NEGATIVE

Full write-up in `proto/FINDINGS.md`. Short version: the **continuum** form of coupling B does not
channel. A uniform sheet with face conductivity adapting to its own rectified flux, under three
different drivers, with a converged solve and with the conductivity-smoothing term off, reaches a
contrast of only 10-26 and stays a smooth mottle — no veins, under any driver. The reason is
structural: in a 2-D sheet every path is in parallel, so one face's conductivity never changes the
pressure drop across it enough to start the competition that makes Tero's networks select paths.

**So do not build the continuum hybrid for P2.** Two options, (b) preferred:
 (a) re-run the gate with discrete gel/sol walkers (what study/02 §4.2 actually specifies) and port only if it channels;
 (b) run the Tero adaptation on the extracted **vein graph** G, which study/00 §3 already keeps as a
     first-class representation and where the competition works by construction — and which reuses the
     skeleton→graph code T2 needs anyway.

Three solver results that stand on their own for P2 (study/02 §6 was optimistic):
- At the physical compliance the system is near-pure-Neumann. Its slowest mode is the constant, which
  is physically meaningless (only ∇p drives flux). **Project the mean out of the RHS** — without it the
  solve looks divergent at 0.996/cycle, with it the same code reaches 0.88.
- The coarsest level must be *solved*, and coarse face conductance is the **sum** of the fine faces
  (parallel), as the study said; the arithmetic mean makes the coarse operator exactly 2x too weak.
- A bare V-cycle is unsmoothed aggregation and plateaus at ~0.88/cycle, so one cycle per step does not
  track the solution. As a **CG preconditioner** it converges without tuning. Budget MG-preconditioned
  CG, not V(1,1).

## Deviations from the spec, deliberate for P1a

- One resolution for everything (no R0/R1 split, no bricks, no vein graph, no lens grid). State is f32, not the packed 12-byte contract; `present()` in `kernels.js` is the contract for now.
- Physarum is coupling A only (pure agents). Agent parameters are in cells per step, not yet the dimensionless groups of study/02 §1.4. Agents are not sorted (57 k agents do not need it; the 4–7× gain matters from ~1 M).
- Front speeds of the discrete kernels are resolution-independent (`rs()`), and substrate diffusion is
  now **physical** (mm² per step) rather than fixed in lattice units — `E.dn` carries the per-tier
  conversion. That was a real bug: DLA's box dimension moved 1.77 (draft) → 1.87 (normal) on the same
  organism; it is now 1.744 → 1.722. `fine` exceeds the explicit-stability cap and is clamped, so it
  needs substrate substepping (its own pass) before its morphology can be trusted.
- The continuous kernels (COLONY, BIOFILM, GRAYSCOTT, EXCITABLE) are still calibrated at normal and
  their pattern scale follows the grid.
- **What is and is not resolution-invariant, measured.** The box dimension now agrees across tiers
  (draft 1.744 / normal 1.722). Fill fraction and front speed do NOT: the absorbing boundary layer
  around a growing cluster is ~0.023 mm, i.e. 0.25 cells at draft and 0.5 at normal, so it is
  unresolved at every tier the engine has, and the nutrient a front cell samples depends on the cell
  size. Making absorption physical means a much weaker rate and a different regime — an open item.
  `resolutionInvariance` asserts only the box dimension and reports the other two as diagnostics.
- Time is "steps"; the status bar prints one step as one second. Relative speeds are ordered sensibly (Physarum > molds > bacteria) but not calibrated to mm/h.
- No timestamp-query timing yet (wall clock around `onSubmittedWorkDone`), no `versions/` archive yet.

## Lessons from this build

- **Any write to a slot another thread reads in the same dispatch is a replay bug**, even when the index is unique. Division had the parent write the child while the child's own thread read that slot; fix = a separate pass in which only flagged parents act.
- **Lattice bias**: a 9-point stencil with diagonal weight ½ gives square, diagonal-loving dendrites; the isotropic weights are 1 : ¼, divided by 1.5. Degenerate-diffusion fronts (biofilm h²) still go octagonal without quenched roughness on the faces.
- **Critical nucleus**: a single-cell stimulus never starts a Barkley wave or a Gray-Scott pattern. Pacemakers and wrinkle nuclei are block-coherent (`blockRnd`), round and soft. Conversely a *solid* Gray-Scott inoculum starves itself in the spot regimes, and single seeded cells are sub-critical in the maze regimes → the inoculum is a scatter of 6 × 6 blobs at 20 % (checked for all six presets in a CPU replica first).
- The named Gray-Scott presets (mitosis, coral…) are Karl Sims', defined for the 0.2 / 0.05 kernel with Du 1.0, Dv 0.5 — not Pearson's 0.2097 / 0.105.
- A release threshold on a continuous kernel silently kills slow (low-nutrient, hard-agar) fronts; it is 2 × 10⁻⁴ now.
- WGSL lives in JS template literals: **no backticks in WGSL comments**, and `meta`, `target`, `ref`… are reserved words.
- **Morphology tests must fix the extent, not the step count.** Comparing at a fixed number of steps
  compares different-sized colonies; every T1 morphology row grows to a target radius in mm. The Eden
  test additionally has to sample *while growing* — once the cluster meets the wall its width saturates
  and the exponent fit collapses to zero.
- **A parameter can decide which physics you are in, not just how it looks.** Eden's curvature coupling
  is what makes the front KPZ: with it off, growth is uncorrelated and β is 0.52 (random deposition);
  sweeping it gives 0 → 0.518, 0.5 → 0.259, 1.5 → 0.355, 3 → 0.334. Same for the aggregate's stick
  rate: 0.3 → D 1.93 (Eden), 0.02 → 1.72 (DLA). Both are now calibrated, with the sweep recorded.
- Rings are a **density** band, invisible on a binary mask. The ring test reads the radial density
  profile, and the swarm cycle has to modulate growth as well as motility or the colony stays smooth.

## Known rough edges (by organism)

- Molds still read as a fine lattice when zoomed in (tips move on 8 directions); at dish scale they read as a fuzzy colony with a white rim. Sub-cell tip positions or the strand graph (P6) fix this properly.
- Conway Life and most life-like rules burn down to sparse ash, as they do everywhere; they are "organisms" only in the generations / Day & Night / Coral-type rules that spread.
- Wrinkles nucleate fastest where a biofilm is pressed against a neighbour (the laplacian is one-sided there). It looks plausible; it is not mechanics.
- Only the rows looked at during this session are tuned by eye: P. polycephalum forager, E. coli, the five B. subtilis morphotypes, P. dendritiformis, Penicillium, DLA, map lichen, Dictyostelium spirals, the six Gray-Scott rows, colicin RPS, drift sectors, B. subtilis and V. cholerae biofilms. The rest are parameter guesses that pass the smoke test.

## Next (spec §11)

1. **P2, on the revised plan** — the vein graph G route (see the gate above), not the continuum hybrid.
   Start with skeleton→graph extraction in a worker, since T2 needs the same code.
2. P1 remainder, still open: **substrate substepping** so `fine` is trustworthy, and **physical
   absorption** so fill and front speed become tier-invariant too (both top items); brick pool +
   allocator; agent spatial sort (measured 4–7x, only matters above ~1M agents, and it needs a stable
   per-agent id because the power-of-two division scheme is position-based); packed 12-byte contract.
3. T2 — morphometrics against SMGR once the data is approved (`ref/DATA-PLAN.md`).

Pending from iori: phone probe run (`/petri/probe/webgpu-probe.html?quick=1`), the 2 MB Dryad set by hand (`ref/DATA-PLAN.md`), a look at the shell and the organisms.
