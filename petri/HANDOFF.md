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

## P2 — Tero adaptation on the vein graph (live)

The route the P1b gate pointed at: on a continuum sheet the competition between paths never starts, on
a graph it works by construction. Pieces:

| File | What |
|---|---|
| `graph.js` | mask → exact distance transform → Guo–Hall skeleton → node/edge graph with widths (mm); junction clumps are one node, each degree-2 run is consumed once; `close()` bridges one-cell gaps; `extractValues()` is the engine path (histogram threshold, OR-downsampled by 2 at normal); `networkStats` + `t2Gates` are the scorecard |
| `tero.js` | Kirchhoff solve by Jacobi-preconditioned CG with the mean projected out per component; adaptation `dD/dt = f(\|Q\|) − rD`, sigmoid f with a random terminal pair per iteration (Tero 2010) or the power law; rasterise to / sample from the conductivity field |
| `graphworker.js` | one update off the main thread: adaptive slot's density → graph → terminals → adaptation → field |
| `tests/*.test.mjs` | `node petri/tests/tero.test.mjs` and `graph.test.mjs` — known answers, no GPU |

**How it runs.** An organism row with a ninth field (the adaptation genome) makes its slot adaptive —
`Physarum polycephalum — adaptive network` is the first. Every `every` steps (300) the stepping
**stops at that exact step**, the worker updates, the result is uploaded, and stepping resumes. Waiting
at a fixed step on a deterministic input is what keeps replay bit-exact with an asynchronous worker.
The field (gn = n/4) is read in three places: agents add `betaD · D` to what they sense (they prefer
veins that transport, not merely ones that exist); the trail persists longer where D is high (idle
veins fade); and View ▸ Debug: conductivity shows it. The field is also the memory between updates:
a re-extracted edge starts from the field sampled along it, so no edge ids have to be tracked.

**Terminals** — where current enters and leaves a component — come from the op log: every food flake
placed (nutrient op above the poured level) and every inoculation point. The first version detected
food by the nutrient under a node; agents graze a flake below any threshold within a few hundred
steps, terminals dropped to 0–1, no current flowed and every vein decayed. With two or more terminals
a component runs Tero 2010's random pairs; with one it pumps toward its own tips (the front sink);
with none it carries no current and fades — which is what dissolves stray fragments.

**Measured** (normal, six food flakes at 22 mm, 6000 steps, same seed):

| | forager (coupling A) | adaptive (P2) |
|---|---|---|
| largest component, share of all graph nodes | 27 % (415) | **58 % (836)** |
| components at the last updates | — | 109 → 91, falling |
| T2 gates on the largest component | 4/4 | 4/4 |

The extraction threshold for the engine is 1 % of p99 with a closing radius of 1 (components 259 →
153, largest share 16 % → 46 % on the same trail). T2 keeps its fixed 5 % protocol so past scores stay
comparable. An update costs 90–560 ms and grows with the network — about 10 % overhead at 60 steps/s;
warm-starting the CG from the previous pressure is the obvious next saving.

Known answers (`tests/tero.test.mjs`): μ = 1 with one fixed pair converges to the shortest route and
the longer one decays to 1e-4 (Bonifaci, Mehlhorn & Varma); Kirchhoff splits current exactly; a
fragment with no terminal decays; sigmoid with random pairs keeps a cycle — on a ring-with-hub the
ring survives and the spokes are pruned. My first version of that test asserted every edge must
survive, which is wrong: keeping a loop is the claim, not keeping everything.

### P2, second round (2026-09-22): Tero's 36-source benchmark

`fixture.js` implements Tero 2010's metrics in food-source mode exactly as study/05 §3.2/§4.2 define
them (TL/MST, MD/MST, FT via Tarjan bridges that isolate a food source), with known answers in
`tests/fixture.test.mjs` (the MST scores 1/1/0; a ring 1.333/0.8/1; a food-free spur does not count
against FT). `fixture36()` is a fixed synthetic layout at Tero's source count — his Tokyo geometry was
never re-digitised, so the comparison is by regime, not point for point. The harness test
`teroFixture` runs its own draft engine for 36 000 steps (~Tero's 26 h at this engine's front speed).

Getting there took seven fixes, each found by measuring, each now a test:

| symptom on the fixture | cause | fix |
|---|---|---|
| coverage jumped 5 → 1 → 2 → 3 | tubes existed only while agents painted them | a conducting vein holds a trail floor (`TUBE`) |
| veins became bands mm wide | raster width = measured width, fed back through the floor | raster at a constant radius (`RASTER_RAD`) |
| flakes stopped attracting within minutes | grazing 0.02/agent-step ate a flake in ~100 steps | `GRAZE` 1e-5: flakes last the run, as Tero's oat flakes did |
| network collapsed onto a few paths | dt·iters = 6 relaxation times per update: D remembered only the last few random pairs | genome dt 0.05 × 48 (tero test #5) |
| food beside a vein never became a terminal | attachment to the nearest *node* only | `attachPoints` splits the vein at the nearest point (#6) |
| peripheral tubes starved as coverage grew | one random pair per iteration gives each source a 2/T share | a third of the terminals active per iteration, in random pairs (#8) — pairing ALL of them instead built Steiner trees and lost the loops (#4) |
| weak living tubes blinked out of the graph | floor proportional to D sat at the extraction threshold | floor = smoothstep of D: existence and diameter are separate |

Also: dead-end branches without a terminal carry exactly zero current and are peeled before the solve
(exact — test #7); the update fell from 1–5 s to ~0.1–1 s.

**Result, sealed run `v4-fixture` (draft, seed 2010, the configuration in the repo):** the organism
joins **34 of 36 food sources (94 %) by step 9 000**, with **TL/MST 1.90 and FT 0.975** — inside Tero's
Physarum range for length and at the Tokyo-rail level for fault tolerance — and then loses coverage
(9 at 36 000). The test fails, and says why:
- **MD/MST is 0.55 at the peak, far below Tero's Physarum 0.85 ± 0.04.** At that moment this is a
  richly meshed, almost Delaunay-like network (104 tubes): more direct than the real organism, which
  keeps ≈ 30 % of the possible links. The band was written before any run and was not widened.
- **the network is built but not maintained** to the end of the run — the late decline is open.

For the record, the earlier run with `RETRACT` 0.05 peaked at 31/36 with TL/MST 1.55, MD/MST 0.72,
FT 0.79 — retraction trades coverage for a leaner network; neither setting reaches Tero's MD.

**Peristalsis on the graph (`peristalsis.js`, tests/peristalsis.test.mjs)** answered the P1b gate's
question 2 for the minimal pump: frequency raised at food makes waves run outward from it (correct), and
outward waves pump the carried biomass **away** from food (1.7 nodes of 24; control without food: 0).
Softening the cortex at food does not reverse it. So the pump is NOT wired as the adaptation driver;
Tero's pairs stay. Details and the trap on the way (an edge-order transport bias that looked like
physics) in proto/FINDINGS.md §4.

**A trade-off the harness exposed, left visible on purpose.** `adaptationConsolidates` (largest
connected share of the whole trail graph, six flakes of amount 3) passed at v3 with ratio 2.13 and
fails now (≈1.2). Bisected: the cause is the grazing calibration, not any adaptation change — with the
old fast grazing it passes at 1.67 on today's code. With food that persists the organism reaches out to
all six sources at once, and a whole-trail largest-component measure reads that foraging as
fragmentation. I kept the calibrated grazing (it is what makes the fixture work and what the
experiment used) rather than tuning the test back to green. The fixture's coverage is the better
consolidation measure; replacing or retiring this row is a decision for iori.

Open in P2: maintenance of the full network to the end of the run; MD/MST too low; one adaptive slot per
dish; the pump's direction (needs wall mechanics or pressure feedback on phase); `RETRACT` is off (two
A/Bs showed no benefit).

### P2, third round (2026-09-22): the network is maintained — food flakes are solid

`diag/fixture-trace.js` traced the fixture every 1 500 steps (coverage, terminals, components, live
veins, agents on tubes, food left). The decline of the network was neither of my suspects: the mean
nutrient at the flake centres fell from 12 to 4.4 by step 1 500 — before most flakes were reached — so
the "flakes" were **diffusing into the agar**, not being eaten. The attractant is only emitted above
nutrient 1, and the flake level crossed 1 at step 10 500, exactly where coverage peaked and began to
fall. A real oat flake is a solid that keeps releasing food: the new tool `flake` (stamp kind 7) writes
a per-cell source buffer that pins the local level, and the Food button places one. Dissolved nutrient
still diffuses (the conservation and diffusion tests keep using it).

It fixed both open problems at once. With solid flakes the organism holds 29–33 of 36 food sources to
the end, collapses into **one connected component**, and MD/MST sits at **0.79–0.89 — Tero's Physarum
value** (the too-meshed networks were a product of dissolved food spreading into big attractive
patches). A single 36 000-step run ends at 33/36, TL/MST 1.53, MD/MST 0.72, FT 0.91: MD sampled at
one instant moves 0.72–0.95 within one run, while Tero's 0.85 ± 0.04 is a spread across 21 organisms.
So the test was changed — before running it — to Tero's own protocol: three organisms (seeds) on the
same layout, each must end with ≥ 80 % coverage, and the MEAN of each metric must sit in the unchanged
bands. All food scenarios in the harness now use solid flakes.

**Replicated result, sealed `v5-flakes`** (3 organisms, same layout, 36 000 steps):

| | seed 2010 | seed 2011 | seed 2012 | mean ± SD | Tero Physarum (n = 21) |
|---|---|---|---|---|---|
| food reached | 33 (92 %) | 26 (72 %) | 30 (83 %) | — | 36 |
| TL/MST | 1.53 | 1.54 | 1.55 | **1.54 ± 0.01** | 1.75 ± 0.30 ✓ |
| MD/MST | 0.72 | 0.86 | 0.62 | **0.73 ± 0.12** | 0.85 ± 0.04 ✗ |
| FT | 0.91 | 0.94 | 0.94 | **0.93 ± 0.02** | 0.86 ± 0.04 (rail 0.96) |

Length and fault tolerance are in Tero's regime and remarkably consistent across organisms; mean path
distance averages low with a wide spread, and one organism reached only 72 % of the food. The test
fails on exactly those two claims, under the rule fixed before the runs.

Solid flakes also moved the other rows: the plain forager (`physarumNetwork`, no adaptation) now misses
TL/MST (1.43) and meshedness (0.022); `adaptationConsolidates` reaches ratio 1.86 but misses a gate.
Step cost 2.37 → 2.74 ms isolated (the bench's 3.24 was inflated by a second tab): the cell pass now
reads an eighth storage buffer, filling the guaranteed binding limit — recover it by folding the flake
level into an existing buffer when a channel frees up.

The elastic-tube pump (proto/FINDINGS.md §4b) does not move biomass toward food either: stiffness has
nothing to redistribute while the body's mean pressure is zero. Next candidate: fluid uptake at food
that pressurises the body. Tero's pairs stay the driver.

**Shell: the 3DIE logo is the site menu** (iori, 2026-09-22), as in the iris engine's shell: the
caption's control box shows the favicon as a 16-colour dithered bitmap and opens the site links read
from the generated `#site-menu` markup; the floating burger is hidden in petri (`ui.css`).

### P2, fourth round (2026-09-22): the flicker was the extractor — sealed `v6-foodspur`

Per-seed traces (`diag/fixture-trace.js`, now with `seed`) showed no stall: coverage swung 25–33 of 36
and MD/MST 0.72–0.93 **between consecutive samples** of one run, so each run's final number was mostly
noise. First suspect, adaptation memory (48 × dt 0.05 = 2.4 relaxation times per update): dt 0.01 was
tried with the acceptance rule written first (spread must halve) — it did not (coverage SD 1.6–2.5 →
1.3–2.1), so it was rejected and dt stays 0.05.

The frame-level look found it. On seed 2011 at step 36 000, most unreached flakes had plasmodium
density ~1 ON the flake, in the mask, on veins 0.8–1.8 mm wide — yet no graph edge within 4–7 mm.
`buildGraph` prunes a dead end shorter than 3× its width as thinning noise; with veins this wide that
is any branch under ~4.5 mm, and **a feeding branch to a flake is exactly such a dead end**. Pruned, the
flake gets no terminal, no flux, and its tube fades; when the branch grows past the limit it comes
back — the flicker. Fix: `buildGraph({keepTips, tipReach})` keeps a spur whose tip lies on a food
source; the worker passes the flakes (`tests/graph-food-spur.test.mjs`).

Pre-registered fixture test, bands unchanged — **passes**:

| | seed 2010 | seed 2011 | seed 2012 | mean ± SD | v5 | Tero Physarum |
|---|---|---|---|---|---|---|
| food reached | 86 % | 83 % | 86 % | min 83 % | min 72 % | 100 % |
| TL/MST | 1.65 | 1.62 | 1.74 | **1.67 ± 0.07** | 1.54 ± 0.01 | 1.75 ± 0.30 |
| MD/MST | 0.79 | 0.78 | 0.77 | **0.78 ± 0.01** | 0.73 ± 0.12 | 0.85 ± 0.04 |
| FT | 0.90 | 0.96 | 0.91 | **0.92 ± 0.03** | 0.93 ± 0.02 | 0.86 ± 0.04 |

Honest reading: MD is inside the band but still below Tero's mean. The layout is not his: on our
synthetic 36-source layout the Delaunay graph reaches MD/MST 0.41 at TL/MST 3.32
(`fixture.js delaunayEdges/referenceMetrics`), so paths are cheaper to shorten here than around Tokyo
and a lower MD at the same TL is expected. Two measurement notes left as they are, because the scorer
was fixed before the data: the scorer serves a flake from a node within 2.0 mm while the engine
attaches at flake radius + 1.5 = 2.7 mm (flakes 16 and 35 sat at 2.1–2.3 mm on the traced frame), and
~2 flakes per frame lie on a live tube that is a separate component.

**Pump question closed** (proto/FINDINGS.md §4c): with fluid uptake at food and a tracer for the
resident sol, the drunk fluid pushes resident sol AWAY from food (+2.65 nodes) while the volume centre
moves toward it only because new fluid enters there; contraction adds nothing. Migration toward food is
growth at food, which the engine already has. No pump is wired in; peristalsis stays a P4 look item.

### Fifth round (2026-09-22): the cell pass, and two T2 rows settled — sealed `v7-cellpass`

**Step cost 2.52 → 1.85 ms, bit-identical** (replay hash unchanged, fixture numbers identical). New
`E.profile(k)` / `T4.kernelCost` times each pass separately: agent 0.04, divide 0.01, **cell 2.77 ms** —
the cell pass is 98 % of a step, so the "8th storage binding" was never the cost (the flake read is
~5 % of the pass's traffic; left as is). Three changes tried, each kept only if ≥ 5 % faster with the
same hash:

| change | cell pass | kept |
|---|---|---|
| deposits: atomicLoad, clear only non-zero (was atomicExchange ×2 on every cell) | 2.77 → 2.09 | yes |
| no writes outside the dish (21 % of the grid; both buffers stay zero there) | 2.09 → 1.73 | yes |
| substrate stencil from an 18×18 workgroup tile | 1.73 → 1.88–1.97 | **no** — the cache already serves it |

**T2 is now 2/2.** `adaptationConsolidates` retired (iori agreed): moved to `RETIRED` in harness.js,
still runnable; the fixture's per-organism coverage scores the same claim directly. `physarumNetwork`
now measures with the engine's own extraction (1 % of p99 + closing), which the T2 header always
promised; its private 5 %/no-closing extraction cut the forager's trail into ~100 pieces. Decided on
that principle before reading the numbers: 3/4 gates (degree-3 0.97, width σ 0.40, α 0.068 ✓), and
**TL/MST 1.44 still misses the 1.45 floor** — the forager's largest network is a little too tree-like.

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
- **What is and is not resolution-invariant, measured.** Aggregates are now perfect absorbers and
  growth reads the GRADIENT (`n · rs()`) rather than the concentration, because with an absorbing
  boundary the nutrient in the neighbouring cell carries a factor of the cell size. That made the
  **fill fraction invariant (relative difference 0.356 → 0.024)** and made the two dimension
  estimates agree internally (mass-radius 2.08 → 1.71 against box 1.76). The **box dimension is still
  tier-dependent (draft 1.579 / normal 1.740)** and the test fails on it. The mechanism is understood
  and is not a bug to patch: a DLA branch is one cell wide by construction, so its *physical* width
  is the cell size, and the two tiers grow genuinely different objects. It converges only where the
  branch width is resolved, which a single-cell-wide branch never is. Left failing.
- **Eden roughness now passes** (β 0.433 at draft, r² 0.85) after two measurement fixes: the front's
  angular binning was fixed at 256 bins, so it averaged 2.9 cells of arc at draft and 5.8 at normal
  and returned a property of the grid — bins now hold a constant two-cell arc; and the sampling
  chunk must be equal in steps across tiers. The test builds its own draft engine so it always
  measures the calibrated configuration, and reports normal (β 0.157) as a diagnostic. The residual
  tier gap is an open item.
- Time is "steps"; the status bar prints one step as one second. Relative speeds are ordered sensibly (Physarum > molds > bacteria) but not calibrated to mm/h.
- No timestamp-query timing yet (wall clock around `onSubmittedWorkDone`), no `versions/` archive yet.

## Lessons from this build

- **Any write to a slot another thread reads in the same dispatch is a replay bug**, even when the index is unique. Division had the parent write the child while the child's own thread read that slot; fix = a separate pass in which only flagged parents act.
- **Lattice bias**: a 9-point stencil with diagonal weight ½ gives square, diagonal-loving dendrites; the isotropic weights are 1 : ¼, divided by 1.5. Degenerate-diffusion fronts (biofilm h²) still go octagonal without quenched roughness on the faces.
- **Critical nucleus**: a single-cell stimulus never starts a Barkley wave or a Gray-Scott pattern. Pacemakers and wrinkle nuclei are block-coherent (`blockRnd`), round and soft. Conversely a *solid* Gray-Scott inoculum starves itself in the spot regimes, and single seeded cells are sub-critical in the maze regimes → the inoculum is a scatter of 6 × 6 blobs at 20 % (checked for all six presets in a CPU replica first).
- The named Gray-Scott presets (mitosis, coral…) are Karl Sims', defined for the 0.2 / 0.05 kernel with Du 1.0, Dv 0.5 — not Pearson's 0.2097 / 0.105.
- A release threshold on a continuous kernel silently kills slow (low-nutrient, hard-agar) fronts; it is 2 × 10⁻⁴ now.
- WGSL lives in JS template literals: **no backticks in WGSL comments**, and `meta`, `target`, `ref`… are reserved words.
- **A metric can be resolution-dependent even when the physics is not.** Two of the three "physics"
  failures chased this round were measurement bugs: the front's fixed angular bin count, and box
  counting up to a fixed fraction of the grid rather than of the cluster. Check the measurement
  before changing the model.
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

1. **P2 remainder** — T2 2/2 (v7). Open: forager TL/MST 1.44 (gate floor 1.45); MD/MST 0.78 below
   Tero's mean (layout, see fourth round); CG warm start. Performance: cell pass 1.77 ms at 2048² is
   the whole step — next levers are the neighbour-ownership scan for bare cells and fp16 substrate.
2. P1 remainder, still open: **substrate substepping** so `fine` is trustworthy, and **physical
   absorption** so fill and front speed become tier-invariant too (both top items); brick pool +
   allocator; agent spatial sort (measured 4–7x, only matters above ~1M agents, and it needs a stable
   per-agent id because the power-of-two division scheme is position-based); packed 12-byte contract.
3. T2 — morphometrics against SMGR once the data is approved (`ref/DATA-PLAN.md`).

Fixed 2026-09-20 from iori's report that "inject new organisms stops adding them": each Physarum
founder permanently owns 64 agent slots, and at 1.5 founders per cell a 2 mm needle stab claimed 8192
blocks — so the **ninth inoculation of a dish silently did nothing**. Founder density is now 0.15 per
cell (same saturated population, since each founder still divides to 64), the engine reports why an
op was refused, and the status bar shows it. Verified: 20 stabs all take, agents 1 742 → 438 248,
48 376 of 65 536 blocks still free. Reclaiming blocks from erased agents is still not implemented, so
the pool is finite — roughly 75 stabs at 2 mm.

Pending from iori: phone probe run (`/petri/probe/webgpu-probe.html?quick=1`), the 2 MB Dryad set by hand (`ref/DATA-PLAN.md`), a look at the shell and the organisms.
