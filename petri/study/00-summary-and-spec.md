# 00 — Study summary and engine specification

This file condenses chapters 01–06 into the decisions the petri engine is built on. Where chapters disagree, this file says which wins. Chapters:

- [01 Physarum biophysics](01-physarum-biophysics.md) — every number in µm, s, mm/h; what is visible at each magnification; stimuli; the "must reproduce" checklist
- [02 Algorithms: agents, flux, hybrid](02-algorithms-agents-and-flux.md) — Jones / 36 Points / MCPM, Tero and Hu–Cai, the two-way hybrid, oscillator, pressure solve, determinism, the lens handoff
- [03 WebGPU, grids and budgets](03-webgpu-grids-and-budgets.md) — measured throughput, the scale arithmetic, the ladder, byte and time budgets
- [04 Optics and rendering](04-optics-and-rendering.md) — the dish as an object, image formation per illumination mode, objectives, focal-stack renderer, spectral colour
- [05 Validation data and metrics](05-validation-data-and-metrics.md) — datasets with licences and sizes, target numbers, metric protocols, scorecard
- [06 Instrument UI](06-instrument-ui.md) — BR2049 design language, control inventory, placement UX, layouts, visual system

Probe: `petri/probe/webgpu-probe.html` (adapter limits, allocation, stencil / brick / pressure / agent throughput; `?quick=1` for phones, `?coherent=1` for sorted agents).

## 1. What we are building, and where it can be state of the art

A petri dish instrument: the user inoculates a 90 mm agar plate with millimetre precision, organisms grow by a **swappable algorithm**, and an optical instrument looks at them from the whole dish down to below 1 µm. Physarum polycephalum first, taken deep; bacterial colonies and mycelium follow to prove the swap.

Real-time state of the art today is 2-D Jones/36-Points agents and dense 3-D MCPM. Neither survey (2026-09-18) found anyone doing the following in real time, and these are the targets:

1. Agents **coupled to flux**: vein hierarchy, Murray scaling, pruning by function (02 §4).
2. **Peristaltic oscillation and shuttle streaming** driving that flux (01 §3, 02 §5).
3. The **fan front with a coarsening network behind it** as one emergent system (02 §4.4).
4. **Sparse bricks + vector veins in WebGPU** (03 §4).
5. **Plate and microscope optics** from simulated state: brightfield, dark-field, phase, DIC, fluorescence, real focus plane (04 §2–3).
6. **Quantified validation** against real networks (05) — almost no creative implementation reports a single morphometric.
7. A **cell-level view that is the same simulation**: granules and nuclei advected by the macro solve's own Q and phase (02 §8).

## 2. Fixed decisions

**Platform.** WebGPU only. Storage buffers hold state; textures only for filtered sampling and render targets. No required optional feature: `timestamp-query`, `shader-f16`, `subgroups`, tier-2 storage formats each have a fallback (03 §1).

**Units and frame.** The Dish ID and UI speak **millimetres**; the simulation speaks **micrometres and seconds**. Origin at the dish centre on the agar surface; +x right, +y up in the top view, +z out of the agar (agar is z < 0); polar (r, θ) with θ counter-clockwise from +x. Dish inner radius 45 mm, agar depth 3.5 mm default (04 §1).

**Time.** Fixed step Δt in sim-seconds, per algorithm (Physarum: 1 s). Display speed = steps per frame; the transport shows the achieved sim rate honestly (03 §6). Reference points: contraction period ≈ 100 s, front ≈ 10 mm/h, so a plasmodium crosses the dish in ≈ 4.5 h = 16 200 steps ≈ 4.5 min at 60 steps/s.

**Determinism.** All randomness is `pcg(dishSeed, agentId, step)`. Deposits go through `atomic<u32>` counters; rejection rules read the previous step's counts; reductions use a fixed tree; agent re-sort is stable on (cell, id); brick ids come from a prefix sum over a sorted request list. Promise: run == rerun and forward == reversed bench **on one device**; statistical equality across devices (02 §7).

**Physical parameters, converted per rung.** Every genome parameter is declared in µm, s, or as a dimensionless group (SO/ℓ_T, SA, RA, SS/SO, agents per sensing area, deposit/decay) and converted to cells per rung. **The chemotactic trail lives on R1 only**, sampled bilinearly by agents everywhere — this removes the worst resolution dependence (02 §1.4). Jones's exclusion rule is replaced by a density cap.

## 3. Representations (chapter 03 §4 wins, amended)

| Rung | Voxel | Holds | Lifetime |
|---|---|---|---|
| **R0 substrate** | 88 µm, 1024² × 2–4 z into agar | nutrient, moisture, attractant, repellent, hardness, light, temperature (smooth → textures) | always |
| **R1 body** | 22 µm, 4096², 2.5-D | the presentation contract (§4), chemotactic trail, oscillator z, agent counters | always |
| **G vein graph** | vector: nodes, edges (radius, length, D, Q̄, phase) | the mature network behind the front | always, a few MB |
| **R2 bricks** | 5.5 × 5.5 × 22 µm, 32×32×8, stackable | the *active set*: fronts, fresh inoculum, tool strokes, lens neighbourhood | allocated on activity, retired to R1 + G |
| **R3 lens grid** | 0.5–1 µm, ≈ 1024² × 16, **z-levels centred on the focus plane** (04) | tube-wall SDF, lumen velocity, sheath relief | while zoomed ≥ 40× |
| **M micro agents** | continuous | granules, nuclei, vacuoles; later rod bacteria | with R3 |

Why: a full-state brick is ≈ 230 KB; 10 % dish coverage at 5.5 µm would be ≈ 5 GB. The fine rung can only hold what is changing or being looked at. Veins are typically ≈ 100 µm across (01 §2), i.e. 4–5 R1 cells — R1 resolves main veins only, so fine veins are carried by G (vector, crisp at every zoom) and by R2 where active.

Reconciliation of 02 §6 with 03 §4: **pressure is solved on the grid** — z-collapsed, backward-Euler compliant-wall equation, one warm-started red-black V(1,1) per step on a persistent pyramid with summed-conductance coarsening (est. 2.8 ms) — over R1 plus the active R2 footprint. **G is not the primary solver.** G serves (a) retired regions, where the face conductances of R1 are rebuilt from it, (b) rendering of veins finer than R1, (c) T2 metrics, (d) the exact Tero solve that audits the multigrid residual in the harness. This removes temporally-stable GPU graph extraction from the critical path: G may be extracted in a worker every few sim-seconds.

Agents are re-sorted into spatial order every N steps (measured gain 4–7×; N is a P1 measurement).

`normal` tier must fit in **1 GB** (R1 contract packed to 12 B/cell).

## 4. The contract: presentation channels

Every algorithm, whatever its internals, writes these per R1 cell (and per R2 voxel where active). Renderer, UI telemetry and harness read nothing else.

| Channel | Type | Meaning |
|---|---|---|
| density | f16 | biomass, as equivalent thickness in µm |
| height | f16 | top surface above agar, µm (negative = grown into agar) |
| flow | 2 × i8 | in-plane flow direction × log magnitude (µm/s) |
| material | u8 | index into the module's material table (pigmented plasm, sheath, spore mass, hypha, colony interior, colony rim …) |
| age | u8 | log-scaled sim-hours since first occupied |
| activity | u8 | rate of change (growth, oscillation amplitude) |
| phase | u8 | oscillator phase or module-defined cyclic quantity |
| sheath | u8 | extracellular deposit left behind (slime trail, EPS) |
| species | u8 | which inoculum lineage owns the cell |
| reserved | u8 | |

12 B per cell. Optional extras a module may expose for debug views only: conductivity, pressure, Q̄, brick occupancy. The material table carries optical properties (spectral absorption, scattering, Δn, fluorescence) — algorithms never output colour.

## 5. Algorithm modules (the swap)

A module is a folder: `manifest.json` + WGSL kernels + optional CPU worker.

```json
{
  "id": "physarum.hybrid", "version": "0.1", "dt": 1.0,
  "state":   [{"name": "trail", "rung": "R1", "type": "f16", "buffers": 2}, {"name": "Dx", "rung": "R1+R2", "type": "f32"}],
  "agents":  [{"name": "plasm", "stride": 16, "max": 8000000}],
  "stack":   [["K9", "agent_step.wgsl"], ["K3", "trail_diffuse.wgsl"], ["K5", "oscillator.wgsl"],
              ["K8", "pressure_vcycle.wgsl"], ["K5", "adapt.wgsl"], ["P", "write_contract.wgsl"]],
  "genome":  [{"name": "SO", "unit": "um", "default": 198, "range": [40, 600], "expr": "a+b*x^c"}],
  "materials": "materials.json",
  "inoculum": ["sclerotium", "plasmodium_fragment"],
  "responds": ["nutrient", "attractant", "repellent", "light", "hardness"]
}
```

Kernels are the K1–K10 of `AUTOMATA_CATALOG.md`; the stack is declared, the engine just runs it. Swap levels: **L0** genome presets; **L1** parameter expressions of sensed values and painted parameter fields; **L2** replace one kernel in the stack (WGSL hot reload, contract re-validated); **L3** a whole module. Several modules can run in one dish (species channel), interacting only through R0 fields and the contract.

Module roadmap: `physarum.jones` (P1, coupling A) → `physarum.hybrid` (P2, coupling B) → `bacteria.rd` (Kawasaki/Mimura/lubricant, the five-region morphology diagram from two dish knobs) → `laplacian.eta` (Eden → DLA → needles) → `mycelium.tips` (tips + strands + anastomosis) → NCA slot.

## 6. Physarum module (02 §4–5)

**P1 — coupling A.** Agents alone make morphology (Jones/36-Points forms, MCPM stochastic sensing in bricks); D := k·T̄², pressure solved only to colour flow. Ships early, veins do not coarsen by function.

**P2 — coupling B.** Biomass carried only by integer agents in two states: **gel** agents crawl (Jones), **sol** agents are advected by Q — ectoplasm and endoplasm. Conductivity D on cell faces (Hu–Cai on the grid). Permeability P = r·ρ + D. Sources are **peristaltic**, s = −∂h/∂t from a complex oscillator field z with ω raised by attractants; plus a sink at the advancing front. Adaptation on the rectified period-averaged flux, μ ≈ 4/3. D and Q̄ feed back into sensing and deposit. There are no hard-wired food sources: food acts through frequency and growth.

**Gate before any WGSL for B:** a 2-D CPU prototype (numpy or a JS worker, 512²) must show sheet → channel instability at a plausible scale and net transport toward food with physically signed parameters. This is the largest scientific risk in the project (02 §9 risks 1–2).

## 7. Dish ID

```json
{
  "petri": 1, "seed": 2049001, "dish": {"radius_mm": 45, "agar_mm": 3.5, "agar_pct": 1.5, "nutrient": 0.0, "temp_c": 24},
  "modules": [{"id": "physarum.hybrid", "version": "0.1", "genome": {"SO": 198, "SA": 22.5}}],
  "ops": [
    {"t": 0,     "tool": "stab",    "at": [-12.5, 4.0], "depth_mm": 0.0, "module": 0, "inoculum": "sclerotium", "mass": 1.0},
    {"t": 0,     "tool": "flake",   "at": [20.0, -8.0], "kind": "oat", "r_mm": 1.5},
    {"t": 5400,  "tool": "streak",  "path": [[0,0],[5,2],[9,7]], "width_mm": 0.8, "kind": "NaCl", "conc_mM": 100},
    {"t": 9000,  "tool": "light",   "mask": "svg:…", "lux": 2000}
  ],
  "view": {"objective": 10, "at": [3.2, -1.1], "focus_um": 40, "illum": "phase", "aperture": 0.6}
}
```

Tools emit operations, never pixels. State at any time = deterministic replay of ops from the seed; scrubbing uses GPU checkpoints every k sim-minutes. IDs travel as JSON, URL hash, and "slides" in the archive.

Tool rack (06 §3–4): needle stab (with depth), loop streak (dilution along the stroke), pipette drop (µL → radius), stencil/SVG stamp, food flake, repellent, antibiotic disc, obstacle, agar scratch (diffusion tensor), light mask, cut (scalpel — fragments reseal, 01 §5). Placement: mm polar + cartesian readout, snapping, numeric entry, micrometer nudges, true-scale ghost footprint.

## 8. Renderer (04)

- Whole dish, top-down: shade R1 as a height field, no march. Tilted beauty camera: slab march with brick-directory empty-space skipping.
- 4×–100×: **telecentric focal stack** — walk each pixel column through z-slices around the focus plane, blur each by its defocus. Absorption multiplies, OPL and fluorescence add; weighted-blended OIT only for dark-field and tilted macro.
- **8 spectral bands** default (16 capture) → CIE XYZ → display. Pigment hue shift with thickness, lamp colour, DIC colours and chromatic aberration fall out of this.
- Illumination modes as shading models on the contract: brightfield (Beer–Lambert), dark-field (|∇| + particulates), phase (OPL minus its low-pass: halo and shade-off for free), DIC (directional OPL derivative + bias), fluorescence (per-species emission).
- Streaming particles in their own non-accumulated, motion-blurred layer.
- Two paths: **REF** (no camera artefacts, deterministic, what the harness captures) and **beauty** (grain, halation, AgX-like tone map).
- Below the finest simulated rung: band-limited procedural grain keyed by dish seed — structures exact, grain statistically identical.

## 9. Instrument UI (06)

Layout C "archive reader": full-bleed viewport; tool rack, genome bay and Dish ID archive are glass plates that slide in; lens carriage along the bottom; Concept A's degree bezel as a true-scale reticle; Concept B is the P1 debug UI. Principles: every readout comes from a mechanism; theme = lamp colour over near-monochrome ink; labels engraved, values displayed; chrome < 25 % of pixels; zoom is a ladder with staged mechanical transitions; the image may be cinematic, the numbers stay clinical. **Telemetry is the harness**: fractal D, front speed, meshedness, biomass, period, sim rate, brick occupancy, solver residual. `window.__petri` exposes everything the harness drives.

## 10. Harness (05)

| Tier | What | Gate? |
|---|---|---|
| T0 | kernel units: mass conservation, analytic decay/diffusion, allocator invariants, replay, forward == reversed | yes |
| T1 | known answers: diffusion Green's function, Fisher–KPP 2√(Dr), DLA D 1.71, Eden/KPZ exponents, η sweep, Tero μ=1 maze + ring test, Poiseuille in R3, oscillator phase-wave speed, five-region diagram | yes |
| T2 | morphometrics vs real data through one canonical preprocessing protocol (05 §4.1): degree-3 fraction, width log-normal, α, MST ratios + fault tolerance on the 36-city fixture, D, lacunarity, Murray exponent, front speed, period, coarsening | scored |
| T3 | statistical appearance, mm/px matched: sliced Wasserstein primary; spectrum + KID diagnostics; **no pixel-aligned losses** | scored |
| T4 | GPU timestamps per kernel, memory, per tier | yes |
| T5 | CMA-ES / MAP-Elites over genomes; several seeds per genome; held-out metrics; casebook review | — |

Mechanics copied from iris-engine: `petri/serve.py` (POST /save), `versions/snapshot.py` + `compare.py`, MessageChannel loop, results POSTed to disk, never timers. One scorecard table per version; the PETRI headline number (05 §8) is for trend lines only. The skeleton → graph code is shared by the engine (G) and T2.

## 11. Phases and gates

| Phase | Content | Exit |
|---|---|---|
| **P0** | this study | iori's decisions on §12 |
| **P1** | WebGPU core: R0/R1, agent buffers + sort, brick pool + allocator, kernel library, contract, `physarum.jones`, debug UI (layout B), REF mode, serve/versions, T0 + T4 | 4 M agents at 60 fps `normal`; replay bit-exact; T0 green |
| **P1b** (parallel) | CPU prototype of coupling B | sheet → veins at plausible scale; sign of transport settled |
| **P2** | `physarum.hybrid`: oscillator, compliant multigrid pressure, adaptation, gel/sol; worker graph extraction; T1; first T2 vs SMGR | fan + coarsening visible; T1 green; first scorecard |
| **P3** | dish + tool rack + Dish ID + checkpoints/scrub | an ID replays identically after reload |
| **P4** | optics: focal stack, spectral, illumination modes, R3 + micro agents, lens handoff consistency test | flux across R3 lumen == brick Q |
| **P5** | `bacteria.rd` + morphology-diagram sweep; rod agents under the lens | second module runs with no renderer/harness change |
| **P6** | T5 evolution; instrument shell (layout C), mechanics, sound; mycelium; multi-species | — |

## 12. Uncertainties and open decisions

**Decided by iori, 2026-09-19:** (3) "ultra fine" = vector veins + active-set bricks + lens grid, as specified in §3 — accepted. (4) Brick machinery is general 3-D from P1; Physarum kernels are 2.5-D with z-collapsed pressure; true-3-D kernels arrive with P5. (B) Data: plan only for now, the laptop has no storage; approved for later: SMGR selective pull and both Rosina & Grube sets; the 2 MB set now (manual — Dryad refuses scripted downloads); Marbach/Alim movies not approved. Staged plan in `../ref/DATA-PLAN.md`; the five no-download gates of 05 §3 carry T2 until then. (D) Order stays P1 → P1b + P2 → P3.

Technical (ranked by how much they can hurt):

1. **Does coupling B channel at the right scale, and does mass go toward food?** Unpublished; Kobayashi 2006 says wall stiffness, not phase alone, sets the sign. → P1b gate.
2. **Multigrid at 10³–10⁴ coefficient contrast** with one V-cycle per step — plausible, unproven; the residual is reported, and G audits it.
3. **"Ultra fine" is vector veins + active bricks + lens grid, not a uniformly fine voxel field.** Needs iori's explicit acceptance (03 §3).
4. **Is true 3-D needed for Physarum?** It is essentially a 2.5-D organism; 3-D earns its keep with agar stabs, biofilm, mycelium. Proposal: brick machinery general from P1, Physarum kernels 2.5-D + z-collapsed pressure, true-3-D kernels arrive with P5.
5. Trail feedback and conductivity feedback may fight each other (02 §9).
6. Phone limits unknown — probe page ready, needs iori's device.
7. Pigment spectrum, agar scattering, endoplasm viscosity (6 mPa·s – 10 Pa·s in the literature) are tuning targets, not facts (01, 04).
8. Several literature constants are tagged [unverified] in 01/02/05; read the PDFs before the P2 genome freezes.

Owner decisions:

- A. Folder/page name (`petri/` is a working name) and when to register it in `pages.meta.json`.
- B. **Data downloads to approve** (05 §1): SMGR selective pull ≈ 10 GB (CC BY 4.0: processed graphs 0.8 GB + processed images 9.4 GB + tools/docs); Rosina & Grube 2025 fractal/growth CSVs 2 MB (CC0); Rosina & Grube 2024 image series 10.4 GB (CC0); Marbach 2023 vein-radius movies 12 GB (CC BY-SA). All stay out of git (`petri/ref-data/`, gitignored).
- C. UI (06 §8): default theme (amber vs cold lab), wear level, bilingual labels, sound default, zoom rungs as magnifications or field widths, phone as a first-class placement device.
- D. Whether P3 (tools, Dish ID) should move ahead of P2 so the experience exists earlier; the contract makes either order safe.
