# Landscape figure — interface and ownership (2026-10-13)

The environment figure of paper 0 (fractals.html §2.7) becomes two levels, after the paper's multi-scale idea:

1. **Region** — a physically formed terrain, default 10 km × 10 km at 512² (≈20 m cells), configurable down to 4 km
   if 10 km does not perform. Uplift + stream-power erosion + hillslope diffusion + talus, Priority-Flood lakes,
   D8 drainage, rivers with hydraulic geometry, sea level (coasts, islands, straits), geology (strata hardness,
   lithology regions), materials, climate (lapse rate −6.5 °C/km, orographic precipitation), a coarse per-cell
   vegetation + deadwood + humus layer model (Cordonnier 2017 / DeadWood style), biomes.
2. **Focus plot** — a 200–300 m window the reader places anywhere on the region (click / drag a marker). Inside it,
   the individual-plant ecosystem (the current module model and plant-scale sim), seeded from the region's layers
   and the local terrain (resampled + amplified), with many plant types, mortality, snags, fallen logs as meshes
   that decay into humus, pit-and-mound, rocks and boulders, ground cover.

Research: `papers/study/2026-10-13-landscape-research.md` (pipeline + validation table in §6) and the first brief
`papers/study/2026-10-11-research-brief.md` §5 (Synthetic Silviculture).

## Ownership

| Who | Files (all in papers/fractals/ unless noted) |
|---|---|
| Ground agent | `landscape-terrain.js` (generation, pure JS, worker-safe), `landscape-worker.js`, `landscape-ground.js` (three.js: terrain mesh, material shader with two palettes, water, rocks/boulders, signature details), `landscape-stats.js`, optional `landscape-gpu.js` (WebGPU compute path), harness `tools/fractals/terrain-test.html` |
| Plant agent | `silviculture-*.js` (core, draw, specimens, envsim, env), new `silviculture-plants.js` / `silviculture-deadwood.js` / `silviculture-region.js` as needed, harness `tools/fractals/environment-test.html`, `specimens-test.html` |
| Main session | `fractals.html`, `paper.js`, `paper.css`, `pages.meta.json`, `BACKLOG.md`, commits |

Nobody else edits a file they do not own. Ask the main session for interface changes.

## The terrain interface (the ground agent provides, the plant agent consumes)

```js
// landscape-terrain.js — pure, deterministic, no DOM, runs in a Worker or on the main thread
export function generateTerrain(opts) // → Terrain   (synchronous; the worker wraps it)
export function generateTerrainAsync(opts, onProgress) // → Promise<Terrain>  (uses landscape-worker.js when available)

opts = {
  seed: 1,                 // integer
  size_m: 10000,           // region side in metres
  cells: 512,              // grid side
  seaLevel: null,          // metres, or null = no sea (inland region); a value makes coasts/islands/straits
  climate: { T0: 14, P0: 900, windDir: 0 },   // sea-level mean annual °C, base precipitation mm/yr, wind from (radians)
  roughness: 0.6,          // uplift-pattern / initial-surface Hurst exponent
  geology: { seed: 1 },    // lithology and strata draw
}

Terrain = {
  n, cell_m, size_m, seaLevel,
  height,      // Float32Array n*n, metres above datum (surface incl. soil)
  bedrock,     // Float32Array, metres
  soil,        // Float32Array, soil/regolith depth m
  slope,       // Float32Array, radians
  area,        // Float32Array, drainage area m²
  receiver,    // Int32Array, D8 receiver index or -1 (outlet / sea / lake bottom)
  discharge,   // Float32Array, m³/s (mean)
  water,       // Float32Array, water depth m (lakes, sea, river channel)
  waterKind,   // Uint8Array 0 none, 1 river, 2 lake, 3 sea
  wetness,     // Float32Array, topographic wetness index ln(a/tanβ)
  lithology,   // Uint8Array: 0 granite, 1 sandstone, 2 limestone, 3 basalt, 4 shale/schist (extend if needed, document)
  hardness,    // Float32Array 0..1 (erodibility inverse) at the surface
  material,    // Uint8Array: 0 bedrock/cliff, 1 scree, 2 soil, 3 wet meadow, 4 sand, 5 snow, 6 water, 7 boulder field
  T,           // Float32Array, mean annual °C
  P,           // Float32Array, mm/yr (orographic)
  rivers,      // [{ pts: Float32Array [x,y,z,...] metres, width: Float32Array, order }]  Strahler polylines
  lakes,       // [{ id, level, area_m2 }]
  stats,       // { hack_h, horton_Rb, horton_Rl, tau, concavity, hypsometric_integral, coastline_D, ... } + Earth targets
  sample(x, y) // bilinear → { h, soil, slope, T, P, wet, material, lithology, water, waterKind }
  crop(x0, y0, w_m, cells) // → a Terrain-like object for a focus window, amplified with sub-grid detail
}
```

Coordinates: x east, y north, metres from the region's south-west corner; three.js uses y up, so (x, height, −y)
or document the mapping in `landscape-ground.js`.

```js
// landscape-ground.js — three.js
export function buildGround(terrain, { palette: 'drawing' | 'natural', detail: 'region' | 'focus' }) // → { group, setPalette(p), dispose(), update(dt) }
```

The plant agent places plants on `terrain.sample()` and reads T, P, soil, wetness, material; deadwood and humus are
plant-side state (they may feed back into `soil` for germination only, not into the erosion run).

## Shared rules
- Deterministic from the seed; a reset replays exactly.
- Light ink-drawing look by default ('drawing'), natural colour as a toggle ('natural'); every material and plant
  carries both palettes.
- WebGPU for heavy compute where it pays, WebGL2 rendering everywhere; CPU worker as the fallback for generation.
- Budgets: region generation ≤ ~5 s on an M3 Pro; steady frame ≤ 16 ms; ecosystem step ≤ ~10 ms amortised.
- Every constant chosen where the literature is silent is listed in the file header with a one-line reason;
  every liberty is listed as a liberty.
- No `mcp__Claude_Browser__*` tools (shared pane). Headless Chrome over CDP (pattern: petri/tools/bench.mjs),
  screenshots in tools/fractals/shots/, Read them to judge.
- Do not commit.

## Status — ground

**Ready (2026-10-13): the interface works end to end.** Harness: `tools/fractals/terrain-test.html`
(`?seed=3&cells=512&sea=0.3&palette=natural&focus=x,y&fw=250&stack`; click the region to move the focus window;
`window.__terrain` exposes terrain, crop, both views, `generate(o)`, `setFocus(x, y)`, `setPalette(p)`, `bench(cells)`).
Headless driver: `node tools/fractals/terrain-shots.mjs --q "seed=1&sea=0.3" --shot region:a.png --expr "…"`.

**Generation (CPU worker, Chrome on the M3 Pro, 10 km):** 256² 1.0 s · **512² 3.7 s (default)** · 1024² 15.7 s.
The default stays 10 km at 512² (19.6 m cells). No WebGPU path was written: 512² is inside the ~5 s budget, and
the per-iteration Priority-Flood is serial (a GPU port needs a different lake router, e.g. FastFlow's).
`buildGround` region 0.5–0.7 s (includes a CPU horizon bake for shadows), crop + focus build ≈ 0.15 s.

**Interface notes for consumers** (documented fields unchanged; additions only):
- `receiver`: −1 at region outlets and sea cells; cells under a lake keep their receiver **through the lake to its
  spill point**; lakes are `waterKind === 2` / `lakeId > 0`.
- `seaLevel`: metres, or `opts.seaQuantile` (0–1, a height quantile) when `seaLevel` is null. The sea floods from the
  region edges after erosion (a drowned fluvial landscape: ria coasts, islands, straits).
- Added fields: `order` (Uint8 Strahler, 0 off-channel), `lakeId` (Int32, 1-based into `lakes`), `straits`
  ([{a, b, x, y, width_m, depth_m, area_a_m2, area_b_m2}]), `oxbows` ([{pts, width}] cut-off meander loops, still
  water), `uplift` (m/yr), `strataOffset` (strata coordinate ζ = bedrock − strataOffset), `strata` (hardness
  tables), `lake_level`, `northness`, `domains`, `openEdges`, `opts`, `timing`; rivers carry `depth` (bankfull, m)
  and `sinuosity`. Region rivers on low slopes are meandered polylines; the grid's `waterKind === 1` cells stay D8.
- `sample(x, y)` returns exactly the documented keys.
- `crop(x0, y0, w_m, cells = 256)`: **x0, y0 = the window's SW corner in region metres** (not its centre); the result
  has `x0`, `y0`, `isCrop: true`, `n = cells`, `cell_m = w_m/(cells−1)`, and every field in **crop-local
  coordinates** (0 … w_m from the window's SW corner); `sample(x, y)` takes local coordinates. Extras: `rocks`
  (Float32Array, 8 per rock: x, y, z, radius, kind, yaw, tilt, seed; kind 0 boulder, 1 scree block, 2 granite tor
  block, 3 basalt prism, 4 limestone slab), `oxbows`, `chDist` (distance to the nearest river centreline in
  half-widths), `parentSample` (region sampler, main thread only). Rivers are clipped, densified and carved into
  the crop (`pts` z = water surface); on rock the crop height carries strata terraces (monotonic, ≤ ±8 m).
  `crop.receiver` is all −1 (no routing at focus scale).
- `buildGround(terrain, { palette, detail, clippingPlanes, rocks })` → `{ group, setPalette(p), update(dt), dispose(),
  applyHeightDelta(arg), setClippingPlanes(planes), background(), uniforms }`. Mapping three (x, y, z) =
  (x, h, −y) from the SW corner of the terrain or crop; the group is not moved (`group.userData.origin` = [x0, y0]).
  Region grids above 600² are drawn decimated by 2 (material texture and water stay full resolution).
  - **Clipping**: every material (ground, water, rivers, rocks, rock outlines) is a ShaderMaterial with
    `clipping: true` and the clipping_planes chunks; pass `opts.clippingPlanes` or call `setClippingPlanes(planes)`.
    The renderer needs `localClippingEnabled = true`. Verified in the harness.
  - **Height edits** (focus, or an undecimated region): `applyHeightDelta(fn)` with fn(x, y) → metres to add
    (local coordinates), or `applyHeightDelta([{ x, y, r, dh }, …])` Gaussian bumps (dh at the centre, r the 1/e
    radius, touched to 2.5 r). Updates `terrain.height` (so `sample()` agrees), the mesh positions and the normals
    of the touched rows (partial GPU upload); the shader reads height from the mesh, so strata bands and contours
    follow. Measured on a 256² crop: 40 bumps 0.14 ms; the function form (visits every vertex) 2.3 ms.
  - `background()` gives the palette's clear colour (drawing white, natural pale sky).

**Realism check, 512², seeds 1–3** (inland / with sea at the 30 % height quantile; Earth range in brackets):
Hack h 0.54–0.58 [0.57–0.60] · τ 1.36–1.45 [1.43 ± 0.02] · τ − (2 − h) −0.08…−0.01 [0] · concavity θ 0.41–0.70
[≈ 0.45] · R_B 3.1–4.6 [3–5] · R_L 2.0–2.4 [1.5–3] · R_A 3.8–5.0 [3–6] · Tokunaga T1 0.85–1.49 [1–1.5] ·
coastline D 1.23–1.27 [1.02–1.25]. Low: hypsometric integral 0.18–0.31 [0.35–0.6, from memory] and network
dimension 1.4–1.9 [≈ 1.9] (only 4–5 Strahler orders fit in 10 km at A_c = 0.05 km²).

## Interface additions (main session, 2026-10-13, after integration)
- `ground.setClippingPlanes(planes, intersection)`: the environment cuts a hole for the focus plot (intersection mode).
- `ground.setCanopy(rgba, m, drawTint)`: cover-weighted canopy tint on the region ground, faded near the plot.
- `terrain.lightBake`, and `bakeLight` / `SUN_DIR3` exported from `landscape-terrain.js`: region lighting baked in the worker.
- Ownership after integration: the plant agent owns all landscape-*.js and silviculture-*.js files.
