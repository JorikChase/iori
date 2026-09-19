# 03 — WebGPU, grids and budgets

What the platform gives us, what it costs, and what that does to the "micro-voxel grid smaller than a pixel, with width, height and depth" requirement. Every throughput number in §2 was measured on 2026-09-18 with `petri/probe/webgpu-probe.html` (Apple M3 Pro, Chrome 152, Metal 3, GPU timestamp queries). Re-run the probe on any new target before trusting a budget; `?quick=1` is the phone-sized run.

## 1. Platform facts

### 1.1 Limits

| Limit | WebGPU default (guaranteed) | M3 Pro / Chrome 152 (measured) |
|---|---|---|
| maxBufferSize | 256 MiB | 4 GiB − 4 |
| maxStorageBufferBindingSize | 128 MiB | 4 GiB − 4 |
| maxStorageBuffersPerShaderStage | 8 | 10 |
| maxStorageTexturesPerShaderStage | 4 | 8 |
| maxTextureDimension2D / 3D | 8192 / 2048 | 16384 / 2048 |
| maxComputeInvocationsPerWorkgroup | 256 | 1024 |
| maxComputeWorkgroupsPerDimension | 65535 | 65535 |
| maxBindGroups | 4 | 4 |

Features present on the dev machine that the engine wants: `timestamp-query` (harness T4), `shader-f16`, `subgroups` (fast reductions), `texture-formats-tier2` (read-write `rgba16float` storage textures), `float32-filterable`. None of them may be *required*; each gets a fallback (wall-clock timing, f32 maths with packed f16 storage via `pack2x16float`, tree reductions, storage buffers).

Allocation test: single buffers of 1, 2 and 3 GiB all allocate and clear without error on the dev machine. That says nothing about a phone. **Open: run the probe on iori's iPhone/iPad (Safari 26+) and record the limits in this table.** Until then the phone tier is designed against the *default* limits: no buffer over 256 MiB, no binding over 128 MiB.

### 1.2 Consequences for data layout

- **Storage buffers, not textures, hold simulation state.** Without tier 2, read-write storage textures are limited to `r32float/r32uint/r32sint`; atomics (`array<atomic<u32>>`, needed for order-independent agent deposit) exist only in buffers; buffers can be any size up to the limit and are trivially bricked. Textures are used only where hardware filtering pays: the substrate fields sampled by agents and the final presentation channels sampled by the renderer.
- **A pool is several buffers.** To respect a 128 MiB binding on the low tier, the brick pool is split into *pages* of ≤ 128 MiB bound as separate bindings or via dynamic offsets; brick id → (page, slot). On the desktop tier one page can be the whole pool.
- **Dispatch shape.** 65535 workgroups per dimension: agents use a 2-D dispatch (`i = gid.x + gid.y·stride`), bricks use `dispatch(4, 4, nBricks)` with `@workgroup_size(8,8,8)` for a 32×32×8 brick (z encodes brick index × 8 + local z).

## 2. Measured throughput (M3 Pro)

| Kernel | Size | GPU time | Rate |
|---|---|---|---|
| 7-point Jacobi, flat 1024×1024×32 f32 | 33.5 M voxels | 2.71 ms / iteration | 12.4 G voxel/s |
| 7-point Jacobi, 4096 bricks of 32×32×8, pool order shuffled, 6-neighbour table | 33.5 M voxels | 3.39 ms / iteration | 9.9 G voxel/s |
| 5-point variable-coefficient pressure Jacobi (harmonic face means), 4096² | 16.8 M cells | 1.74 ms / iteration | 9.7 G cell/s |
| 3×3 diffuse + decay + atomic deposit drain, 4096² | 16.8 M cells | ≈ 2.2 ms | 7.6 G cell/s |
| Agent step (3 senses, turn, move, `atomicAdd` deposit), agents scattered in memory | 4.2 M | 11.9 ms | 0.35 G agent/s |
| same | 16.8 M | 46.9 ms | 0.36 G agent/s |
| Agent step, agents stored in spatial order | 4.2 M | 2.8 ms | 1.5 G agent/s |
| same | 16.8 M | 6.6 ms | 2.5 G agent/s |

(Agent rows are net of the diffuse pass measured in the row above them.)

Three findings that shape the engine:

1. **Bricks are nearly free.** A shuffled brick pool with a precomputed neighbour table costs 25 % over a flat array. No hashing in the inner loop; the table is rebuilt only when bricks are allocated or freed.
2. **Agents are memory-bound, and order is worth 4–7×.** The sense step does three random reads per agent; when the agent buffer is in spatial order those reads hit cache. **The engine therefore re-sorts agents by cell (counting sort on a coarse Morton key, stable, keyed by (cell, agent id) so it stays deterministic) every N steps.** N and the sort cost are a P1 measurement; at 1 px/step agents drift slowly, so N ≈ 30–60 is expected to hold most of the gain.
3. **A converged global pressure solve per frame is not affordable at brick resolution.** 33.5 M voxels × 3.4 ms × the hundreds of plain Jacobi iterations a 10³:1 coefficient contrast needs is seconds per step. Pressure must be solved either on a coarser rung / on the vein graph, by multigrid with warm start, or by a local (artificial-compressibility) relaxation. Chapter 02 §6 compares them; this chapter only fixes the cost side: **one 2-D base-grid iteration ≈ 1.7 ms, one full-brick-pool iteration ≈ 3.4 ms.**

## 3. The scale arithmetic (why one grid cannot do it)

The dish is 90 mm inside diameter: area 6362 mm². Things we must resolve:

| Thing | Size | Voxel needed (≥ 2 across) |
|---|---|---|
| Whole-dish view on a 4K display (dish ≈ 2000 px) | 45 µm / px | 22 µm is ½ px — "smaller than a pixel" holds at 1× |
| Physarum main veins | 100 µm – 1 mm | 22 µm resolves them |
| Fine veins, channels in the fan sheet | 10–50 µm | ≈ 5 µm |
| Hyphae | 2–10 µm | explicit strands, not voxels |
| Nuclei, granules, bacteria | 0.5–5 µm | ≤ 0.5 µm, only under the lens |

Cost of covering the *whole dish* at each resolution, per byte of state per cell:

| Voxel | Grid | Cells (2-D) | × 8 z-layers |
|---|---|---|---|
| 88 µm | 1024² | 1.0 M → 1 MB/B | — |
| 22 µm | 4096² | 16.8 M → 17 MB/B | 134 MB/B |
| 5.5 µm | 16384² | 268 M → 268 MB/B | 2.1 GB/B |
| 1 µm | 90000² | 8.1 G | — |

A Physarum hybrid voxel needs roughly 24–32 bytes (biomass, conductivity, pressure f32, oscillator phase, age, material, atomic deposit counter, plus ping-pong copies of the diffusing ones). So even *sparse* 5.5 µm 3-D bricks are expensive: one 32×32×8 brick (footprint 176 µm, z-voxel 22 µm, 176 µm tall) is ≈ 256 KB; an organism covering 10 % of the dish is ≈ 20 000 bricks ≈ 5 GB. **The fine rung cannot hold the whole organism. It can only hold the part that is changing or being looked at.** This is the most important budget fact in the study, and it is what §4 is built around.

## 4. The ladder

| Rung | Voxel | Extent | Holds | Lifetime |
|---|---|---|---|---|
| **R0 substrate** | 88 µm (1024²), 2–4 z-layers into the agar | whole dish | nutrient, moisture, attractant, repellent, agar hardness, light, temperature | always; these fields are smooth (diffusion length over one 100 s contraction period ≈ 300 µm ≫ 88 µm), so they are *textures*, bilinearly sampled |
| **R1 body** | 22 µm (4096²), 2.5-D | whole dish | the presentation contract: biomass density, height, thickness, material, age, activity, flow (2-D vector), slime sheath; plus the 2-D agent trail | always |
| **G vein graph** | vector (nodes + edges with radius, length, conductivity, flux, phase) | the mature network | everything behind the front | always; tiny (10⁴–10⁵ edges ≈ a few MB) |
| **R2 bricks** | 5.5 × 5.5 × 22 µm, 32×32×8, stackable in z | the *active set*: growth fronts, fresh inoculations, tool strokes, the lens neighbourhood | full 3-D hybrid state | allocated on activity, **retired** to R1 + G when quiescent |
| **R3 lens grid** | 0.5–1 µm, ≈ 1024² × 16 | the field of view at 40×/100× | tube-wall SDF, lumen velocity, sheath micro-relief | exists only while zoomed in; instantiated deterministically from R2/G + dish seed |
| **M micro agents** | continuous | R3 only | granules, nuclei, vacuoles; later rod bacteria | same as R3 |

Rules:

- **Coarse drives fine, fine reports to coarse only through declared statistics** (biomass sum, mean height, net flux). A brick that retires writes its summary into R1 and its skeleton into G; nothing else survives.
- **The vein graph is a first-class representation, not an analysis by-product.** It is what makes "ultra fine at any zoom" affordable: a vein is vector data (a centreline + radius), so it rasterises crisply at every rung, the Tero flux/adaptation model runs on it natively (a sparse Laplacian with 10⁴ unknowns, not 3 × 10⁷), and the T2 harness metrics (degree, width, meshedness) read it directly. The same skeleton→graph code serves the engine and the harness.
- **Re-activation.** Placing a tool, a front arriving, or the lens dwelling re-allocates bricks and rebuilds their state from R1 + G + seed. Because instantiation is deterministic, a revisited place looks the same.
- **Determinism.** Allocation order is a sorted function of activity, not of GPU thread timing; brick ids are assigned by a prefix sum over the sorted request list.

### 4.1 Risk this design carries

Graph extraction on the GPU (thinning or distance-transform ridge → nodes/edges with stable ids across frames) is the new hard problem it introduces, replacing the sparse pressure solve it removes. Fallback: do extraction on a downsampled R1 trail in a worker every few sim-seconds (the network changes on a scale of minutes). P1 can ship without G (pure agents); G arrives with the flux hybrid in P2.

## 5. Byte budgets per tier

Bytes per cell: R0 8 channels × f16 × 2 (ping-pong) = 32 B; R1 16 B + trail ping-pong 8 B + atomic counter 4 B = 28 B; R2 28 B per voxel → 230 KB per brick; agents 16 B (x, y, z·heading packed, state); R3 12 B.

| Tier | R0 | R1 | Agents | R2 bricks | R3 + M | Render targets | Total |
|---|---|---|---|---|---|---|---|
| **phone** (default limits) | 512² ×2z = 17 MB | 2048² = 117 MB (2 pages) | 0.5 M = 8 MB | 256 = 59 MB | 512²×8 = 25 MB | 60 MB | ≈ 290 MB |
| **draft** | 1024² ×2z = 67 MB | 2048² = 117 MB | 1 M = 16 MB | 512 = 118 MB | 512²×8 = 25 MB | 100 MB | ≈ 440 MB |
| **normal** | 1024² ×4z = 134 MB | 4096² = 470 MB | 4 M = 64 MB | 1024 = 236 MB | 1024²×16 = 200 MB | 150 MB | ≈ 1.25 GB |
| **fine** | same | same | 8 M = 128 MB | 2048 = 472 MB | same | 200 MB | ≈ 1.6 GB |
| **capture** (offline frames) | same | 8192² = 1.9 GB | 16 M = 256 MB | 4096 = 944 MB | 2048²×16 | 400 MB | > 3.5 GB, desktop only |

`normal` at 1.25 GB is already at the edge of what a browser tab should take. Levers, in order of preference: (1) pack R1 presentation channels to 8 B (u8 material/age, f16 the rest, flow as 2 × i8); (2) keep R1 at 2048² and let the vein graph carry the sub-22 µm detail; (3) halve R3 depth. **Decision for the spec: `normal` must fit in 1 GB.** That is achievable with (1) alone (R1 → 300 MB).

## 6. Time budgets per tier (M3 Pro, from §2)

One simulation step at `normal`, agents sorted:

| Pass | Cost |
|---|---|
| Agent step, 4 M | 2.8 ms |
| Trail diffuse/decay 4096² | 2.2 ms |
| R0 substrate diffusion 1024² × 4z, 2 fields | 0.3 ms |
| R2 bricks, 1024 × 4 kernels (reaction, diffusion, phase, adaptation) | 4 × 0.85 = 3.4 ms |
| Graph flux solve (10⁴ edges, 20 CG iterations) | < 1 ms (est.) |
| Agent re-sort, amortised | ≈ 0.5 ms (est.) |
| **Sim subtotal** | **≈ 10 ms** |
| Render (slab march, 1440p, draft DOF) | 5–6 ms budget |

That is one sim step per displayed frame at 60 fps. Time-lapse speed therefore comes from *step size*, not step count: the fixed step is chosen per algorithm in sim-seconds (chapter 02), and "fast-forward" runs k steps per frame with rendering throttled — at 4 steps/frame the display drops to ≈ 20 fps unless agent count drops with it. The UI's transport control must show this honestly (a "sim rate" meter, not a promise).

## 7. WGSL practice (carried into the spec)

- Fixed timestep; all randomness from `pcg(seed, agentId, step)`; no `Math.random`, no frame-time dependence.
- Deposits through `atomic<u32>` counters drained by the field pass — integer addition is order-independent, so agent passes are deterministic on one device. Cross-device bit-equality is *not* promised (float contraction and `sin/cos` differ between vendors); the reproducibility test is forward-vs-reversed and run-vs-rerun on one device, and statistical equality across devices.
- One bind-group layout per kernel family, created once; per-step uniforms in a ring of small buffers (the probe creates them per step — do not copy that).
- Every kernel is wrapped by the harness timer: timestamp query when available, else `onSubmittedWorkDone` wall time.
- No `setTimeout`/`rAF` dependence in anything the harness drives (hidden-tab throttling); GPU promises are not throttled — the probe ran at full speed in a hidden pane.

## 8. Open questions

1. Phone limits and throughput (needs iori's device; the probe page is ready).
2. Sort period N and sort cost for agents (P1 measurement).
3. Whether R2 needs true 3-D for Physarum at all, or whether 2.5-D + graph tubes suffice until the bacterial/biofilm and agar-stab modules arrive (see 00 §uncertainties). The brick machinery is cheap to keep general; the *kernels* are where 3-D costs effort.
4. Brick z-anisotropy (5.5 × 5.5 × 22 µm proposed). A 1 mm vein is 45 z-voxels tall = 6 stacked bricks; alternatively veins above one brick height are represented only by the graph + analytic tube.
5. GPU skeleton/graph extraction with temporally stable ids.
