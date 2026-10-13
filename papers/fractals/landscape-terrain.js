/*
 * landscape-terrain.js — a physically formed region: uplift against stream power, hillslope diffusion, talus,
 * strata, lakes, rivers, sea, soil, materials and climate. Pure, deterministic, no DOM; runs in a Worker
 * (landscape-worker.js) or on the main thread. Interface: papers/fractals/LANDSCAPE.md. Research:
 * papers/study/2026-10-13-landscape-research.md (§ numbers below refer to it).
 *
 * ---------------------------------------------------------------------------------------------------------
 * PIPELINE (report §6, stages 1–8 and 10)
 *  1. Context. Seeded fields over the region: the paper's casebook machine (mulberry32, Box–Muller,
 *     diamond-square fractional Brownian surface, Hurst H = opts.roughness) for the uplift pattern and the
 *     initial surface; a regional tilt that decides which region edges are open (rivers leave there, at base
 *     levels from a smooth L0 field) and which are drainage divides (closed).
 *  2. Geology. Lithology domains = Voronoi cells of jittered points, boundaries warped by noise; each domain
 *     has one rock type, a fold (amplitude, wavelength, direction), a dip, and a block-uplift multiplier
 *     (stepped uplift, Cordonnier 2016: "stepped uplift gives random valleys"); a few domains subside
 *     (grabens). A 1-D strata function per rock type, hardness(ζ), with ζ = surface − accumulated uplift +
 *     fold (the rock that was at depth is exposed as the land rises: Cordonnier 2018's lookup of the surface
 *     rock from its pre-deformation elevation).
 *  3. Landscape evolution, coarse to fine (n/4 → n/2 → n): each iteration
 *       ε-Priority-Flood (Barnes, Lehman & Mulla 2014) → filled surface w (lake levels),
 *       D8 steepest-descent receivers on w, Braun–Willett stack (BFS from the outlets), drainage area,
 *       implicit stream power n = 1, m = 0.45:  h_i ← (h_i + U·dt + F·b_r)/(1 + F),  F = K_i·A_i^m·dt/d_ir,
 *       where b_r is the receiver's new height, or its lake level when the receiver is under a lake;
 *       lake cells do not erode, they trap sediment arriving from upstream (deltas prograde into lakes);
 *       hillslope diffusion ∂h/∂t = D∇²h (explicit sub-steps);
 *       a talus threshold in stack order: h_i ≤ b_r + tan θ_i · d_ir with θ_i from the strata hardness
 *       (weak beds 30°, hard beds 50°, Cordonnier 2018), K_i from the same hardness, so cliffs, benches and
 *       mesas form where hard beds are.
 *  4. A Quaternary fault movement: each geology block moves by a seeded offset (±F_Q), smoothed over the
 *     contact; a short relaxation follows. Valleys whose downstream block rose are dammed: tectonic lakes,
 *     partly filled by deltas. (This and the grabens are the only lake sources; there is no glaciation.)
 *  5. Hydrology on the final surface: ε-Priority-Flood lakes (level = spill height), D8 (Rho8), drainage over
 *     flats by Barnes, Lehman & Mulla 2014 (toward lower and away from higher terrain), area, sea by
 *     flooding from the region edges below opts.seaLevel (a drowned fluvial landscape: ria coasts),
 *     straits = narrowest sea crossings between two land masses (nearest-land Voronoi of the sea).
 *  6. Rivers: Strahler order on channel cells, polylines per stream segment, Chaikin-smoothed, then on
 *     low-slope reaches a kinematic meander migration (Howard & Knutson 1984; Paris et al. 2023 constants)
 *     with cutoffs that leave oxbows; bankfull
 *     discharge Q_bf = 0.42·A_km²^0.69 (Dunne & Leopold, A in km² — see the flag in the report), channel
 *     from Manning + Konsoer w = 18.8·d^1.41 (Paris 2023); mean discharge from runoff = P − ET (Turc).
 *  7. Climate: T = T0 − 6.5 °C/km·z; P from the Smith & Barstad 2004 linear orographic model (FFT).
 *  8. Soil, wetness, materials: steady-state soil h_s = (1/k)·ln(P0/(−D∇²z)) on convex ground (report
 *     §3, researchers' derivation), TWI = ln(a/tanβ), materials in priority: water, snow, cliff, scree,
 *     boulder field, sand, wet meadow, soil/bedrock.
 * 10. crop(): a focus window resampled (bicubic, clamped to the local min/max so interpolation adds no
 *     extremum) and amplified with fBm whose slope is held below 80 % of the coarse slope (so no new peak
 *     or pit can form), attenuated to zero in and near channels; on rock, a monotonic strata-terrace remap
 *     from the same hardness function (hard beds → risers, weak beds → benches); channels carved with their
 *     real width and depth (Argudo 2019 rule: amplify after the network is fixed, below the relief tolerance).
 *
 * COORDINATES: x east, y north, metres from the region's SW corner. Grid vertex (i, j) sits at
 * (i·cell_m, j·cell_m), index j·n + i, cell_m = size_m/(n − 1). Heights in metres above datum = sea level of
 * the climate model (the base level of the open edges is 60–220 m above it).
 *
 * CONSTANTS (chosen where noted; the rest are the published values the report lists)
 *  m = 0.45, n = 1                     Mudd 2018 θ_ref; report §1.
 *  U_MAX = 0.8 mm/yr                   report: 0.5–1.2 mm/yr (Cordonnier 2016 5e-4; Jain 2024 1.2e-3); the
 *                                      regional factor runs from 0.12 (foreland, ~0.1 mm/yr: soil-mantled hills)
 *                                      to 1 (core: threshold slopes), times fBm 0.3–1 and the block multiplier.
 *  K0 = 1.2e-5 m^0.1/yr                chosen: sets the 10 km region's relief to ~1–1.6 km (U/K is the
 *                                      liberty the report names; K is "poorly constrained").
 *  K weak/hard ratio 3.2               Cordonnier 2018 k = 2.5e-7 … 8e-7 /yr.
 *  θ weak 30°, hard 50°                Cordonnier 2018.
 *  D = 0.02 m²/yr                      report: 0.01–0.04 (MIT OCW 1.7e-2; Inria 0.01–0.05).
 *  A_DIFF = 2e4 m²                     chosen: cells draining more than this are channels; they lose material by
 *                                      diffusion but do not gain it (the river exports colluvium). Without
 *                                      this the diffusive infill of V-shaped channel cells grows as 2S/dx and
 *                                      relief grows with resolution.
 *  schedule (n/4,n/2,n) × (140,60,30) iterations, dt 3e4/1.5e4/8e3 yr: chosen; ~5.3 Myr total, enough for
 *                                      the network to reach steady state (response time ~1–2 Myr at K0).
 *  ε = 1e-6 m                          Priority-Flood+ε increment.
 *  F_Q = 35 m                          chosen: Quaternary block offsets (Basin-and-Range slip 0.1–1 mm/yr
 *                                      × 1e5 yr gives 10–100 m); relaxation 2 × 800 yr.
 *  graben probability 0.12/domain, uplift multiplier 0.12 (other blocks 0.75–1.25): chosen; low-uplift
 *                                      intermontane basins rather than sinking ones.
 *  open edges: those facing the seeded regional tilt (|cos| > 0.35); one outlet gap per ~3.5 km of open
 *                                      edge, the rest no-flux; in the final analysis every edge cell may drain
 *                                      (the region continues beyond it). Geology warp 11 % of the side.
 *  Rho8 receivers (Fairfield & Leymarie 1991) during erosion and analysis: removes D8's parallel lines.
 *  trap efficiency 0.6                 chosen: share of arriving sediment a lake cell keeps (fines bypass).
 *  base level of open edges 60–220 m   chosen (L0 field).
 *  A_c = 0.05 km²                      channel initiation area for network statistics (chosen).
 *  A_river = 0.25 km²                  drawn rivers (chosen).
 *  Manning n = 0.035                   standard natural channel (flagged as unverified in the report).
 *  Smith–Barstad: U = 10 m/s, N_m = 0.005 s⁻¹, H_w = 2500 m, C_w = 0.004 kg/m³, τ_c = τ_f = 1000 s
 *                                      (from recall of the orographic_precipitation package defaults and
 *                                      SB04; flagged in the report); event background rate 2 mm/h (chosen:
 *                                      converts the event model to an annual ratio P/P0).
 *  Turc ET: L = 300 + 25T + 0.05T³; ET = P/√(0.9 + (P/L)²)   (recall; standard).
 *  Meanders: Paris 2023 ω = −1, γ = 2.5, α = 2f/d, f = 0.011; chosen: spacing 0.5 w, 240 steps, step 0.08
 *             spacing per unit rate, active below slope 0.002 fading to 0.008, confined to ≤ max(1.5 m, 2d)
 *             above the water, cutoff at 0.9 w (loop kept as an oxbow).
 *  Soil: P0 = 0.8 mm/yr × rock factor (report range 0.05–2; rapidly eroding ranges sit high), k = 2 m⁻¹, cap 1.6 m, thinning from 32° to bare at 45°: report §3.
 *  Snow: mean annual T, aspect-adjusted by −2 °C on north faces, below −2 °C and slope < 38°: chosen
 *                                      (the report's altitude × slope × exposure mask).
 *  Materials: cliff ≥ 42° or soil < 5 cm; scree runout 140 m below cliffs on slopes ≥ 20°; boulder
 *             runout 100 m further on gentler ground; sand within 2 cells of standing water on < 8°,
 *             river bars at A ≥ 5 km² and S < 0.01; wet meadow at TWI ≥ 11 and < 6°: chosen thresholds
 *             inside the report's repose table.
 *  crop(): fBm octaves from the region cell down to 2 crop cells (≤ 6), first-octave amplitude 6 % of the
 *             region cell, per-octave slope ≤ 0.8/octaves × coarse slope; zero within 1–3 half-widths of a
 *             channel; strata terraces w = 0.15 + 1.7·[hard bed], ±40 m running mean removed, masked to rock
 *             (scree 0.45, granite 0.25) on slopes above ~0.25–0.6; material read at a noise-jittered region
 *             cell (23 m and 7 m noise); terrace displacement capped at ±8 m; cliffs at local slope ≥ 44°; beaches 5.5 ± 3 m from standing water
 *             on slopes < 0.18; rocks on a 2 m hash lattice (densities in placeRocks).
 *
 * LIBERTIES (everything not forced by a published law)
 *  - The uplift pattern (regional tilt × fBm × geology blocks) is a choice; units are physical.
 *  - K0 (hence relief) is chosen; the weak/hard K ratio and repose angles are published.
 *  - Erosion uses drainage area, not precipitation-weighted discharge (as Cordonnier 2016); climate is
 *    computed on the result and does not feed back into the relief.
 *  - Detachment-limited stream power: sediment is only deposited in lakes.
 *  - The Quaternary fault offsets that make tectonic lakes, and the grabens, are chosen events.
 *  - Sea level is applied after erosion (a transgression drowning the valleys); there is no wave, longshore
 *    or cliff-retreat process (none exists in the graphics literature, report §2).
 *  - No glaciation; meander migration acts on the river polylines only (the grid's channel cells stay D8);
 *    no deltas beyond lake infill.
 *  - Lithology domains are Voronoi cells; strata sequences are seeded bed thicknesses per rock type.
 *  - Material thresholds, the snow rule and the soil rock factors are chosen within published ranges.
 *  - crop(): the amplification noise is a liberty bounded by the coarse slope; the strata terraces are a
 *    remap (not an erosion run) driven by the strata function; rocks are placed by hash.
 *  - Initial conditions: a 120 m fBm surface on a 30 m tilt; the outlet positions are seeded.
 * ---------------------------------------------------------------------------------------------------------
 */
import { computeStats } from './landscape-stats.js';

export const LITHOLOGY = ['granite', 'sandstone', 'limestone', 'basalt', 'shale/schist'];
export const MATERIALS = ['bedrock', 'scree', 'soil', 'wet meadow', 'sand', 'snow', 'water', 'boulder field'];
export const WATER_KINDS = ['none', 'river', 'lake', 'sea'];

// ------------------------------------------------------------------------------------------------ constants
export const C = {
  M: 0.45, U_MAX: 0.8e-3, K0: 1.2e-5, K_RATIO: 3.2, THETA_WEAK: 30, THETA_HARD: 50, D_HILL: 0.02,
  LEVELS: [[4, 140, 3e4], [2, 60, 1.5e4], [1, 30, 8e3]], EPS: 1e-6,
  F_Q: 35, RELAX: [2, 800], GRABEN_P: 0.12, GRABEN_MUL: 0.12, TRAP: 0.6,
  BASE_LO: 60, BASE_HI: 220, A_DIFF: 2e4, A_C: 5e4, A_RIVER: 2.5e5, MANNING: 0.035,
  SB: { U: 10, NM: 0.005, HW: 2500, CW: 0.004, TC: 1000, TF: 1000, P_EVENT: 2 },
  LAPSE: -6.5e-3, SOIL_P0: 8e-4, SOIL_K: 2, SOIL_CAP: 1.6, SNOW_T: -2, SNOW_SLOPE: 38,
  CLIFF_DEG: 42, SCREE_RUN: 140, BOULDER_RUN: 100, TWI_WET: 11,
  ZMIN: -12000, ZMAX: 6000,
};
const DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1];
const SQ2 = Math.SQRT2;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ------------------------------------------------------------------------------------------------ randomness
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gaussFrom(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
/** The paper's section 2.3 machine (papers/fractals/paper.js): diamond-square fBm, (size+1)² samples. */
export function diamondSquare(size, H, seed) {
  const r = mulberry32(seed), n = size + 1, z = new Float32Array(n * n);
  const at = (x, y) => z[((y + n) % n) * n + ((x + n) % n)];
  let step = size, scale = 1;
  while (step > 1) {
    const half = step / 2;
    for (let y = half; y < n; y += step) for (let x = half; x < n; x += step)
      z[y * n + x] = (at(x - half, y - half) + at(x + half, y - half) + at(x - half, y + half) + at(x + half, y + half)) / 4 + gaussFrom(r) * scale;
    for (let y = 0; y < n; y += half) for (let x = (y / half) % 2 === 0 ? half : 0; x < n; x += step)
      z[y * n + x] = (at(x - half, y) + at(x + half, y) + at(x, y - half) + at(x, y + half)) / 4 + gaussFrom(r) * scale * 0.7071;
    scale *= Math.pow(0.5, H);
    step = half;
  }
  return { z, n };
}
function normalise01(z) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < z.length; i++) { const v = z[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
  const s = 1 / (hi - lo || 1);
  for (let i = 0; i < z.length; i++) z[i] = (z[i] - lo) * s;
  return z;
}
/** bilinear sample of an (m × m) grid at unit coordinates u, v ∈ [0, 1] */
function gridAt(z, m, u, v) {
  const fx = Math.min(m - 1.000001, Math.max(0, u * (m - 1))), fy = Math.min(m - 1.000001, Math.max(0, v * (m - 1)));
  const x = fx | 0, y = fy | 0, tx = fx - x, ty = fy - y, i = y * m + x;
  return (z[i] * (1 - tx) + z[i + 1] * tx) * (1 - ty) + (z[i + m] * (1 - tx) + z[i + m + 1] * tx) * ty;
}
export function hash32(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9E3779B1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
/** 2-D gradient noise, about [−1, 1] */
export function noise2(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const g = (i, j, dx, dy) => { const a = (hash32(i, j, s) & 1023) * (Math.PI * 2 / 1024); return Math.cos(a) * dx + Math.sin(a) * dy; };
  const u = fade(fx), v = fade(fy);
  const a = g(ix, iy, fx, fy), b = g(ix + 1, iy, fx - 1, fy), c = g(ix, iy + 1, fx, fy - 1), d = g(ix + 1, iy + 1, fx - 1, fy - 1);
  return 1.41 * ((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v);
}

// ------------------------------------------------------------------------------------------------ options
function normOpts(o = {}) {
  const c = o.climate || {};
  return {
    seed: (o.seed ?? 1) | 0,
    size_m: o.size_m ?? 10000,
    cells: o.cells ?? 512,
    seaLevel: o.seaLevel ?? null,
    seaQuantile: o.seaQuantile ?? null,   // addition: when seaLevel is null, a height quantile of the land
    climate: { T0: c.T0 ?? 14, P0: c.P0 ?? 900, windDir: c.windDir ?? 0 },
    roughness: o.roughness ?? 0.6,
    geology: { seed: ((o.geology && o.geology.seed) ?? (o.seed ?? 1)) | 0 },
    levels: o.levels || null,             // addition: override the coarse-to-fine schedule (benchmarks)
  };
}

// ------------------------------------------------------------------------------------------------ geology
/** Strata tables: hardness(ζ) per rock type, ζ from C.ZMIN to C.ZMAX at 1 m. */
function makeStrata(gseed) {
  const len = C.ZMAX - C.ZMIN + 1, tables = [];
  for (let L = 0; L < 5; L++) {
    const r = mulberry32(hash32(gseed, L, 0x5a7a));
    const t = new Float32Array(len);
    let z = 0;
    const put = (thick, H) => { const e = Math.min(len, z + Math.max(1, Math.round(thick))); for (; z < e; z++) t[z] = H; };
    while (z < len) {
      if (L === 0) put(len, 0);                                                  // granite: massive, filled below
      else if (L === 1) { put(8 + 32 * r(), 0.8 + 0.08 * r()); put(10 + 50 * r(), 0.2 + 0.08 * r()); if (r() < 0.3) put(2 + 4 * r(), 0.75); }
      else if (L === 2) { put(15 + 55 * r(), 0.74 + 0.08 * r()); put(2 + 6 * r(), 0.32 + 0.06 * r()); }
      else if (L === 3) { put(6 + 19 * r(), 0.88 + 0.06 * r()); put(1 + 3 * r(), 0.28 + 0.06 * r()); }
      else { put(30 + 120 * r(), 0.3 + 0.06 * r()); if (r() < 0.35) put(3 + 9 * r(), 0.72); }
    }
    if (L === 0) for (let i = 0; i < len; i++) t[i] = 0.86 + 0.05 * noise2(i / 180, 0.5, gseed);
    if (L === 4) for (let i = 0; i < len; i++) if (t[i] < 0.5) t[i] += 0.05 * noise2(i / 60, 1.5, gseed);
    // soften contacts over ~1 m so the lookup has no exact step
    for (let i = 1; i < len - 1; i++) t[i] = 0.25 * t[i - 1] + 0.5 * t[i] + 0.25 * t[i + 1];
    tables.push(t);
  }
  return { zmin: C.ZMIN, step: 1, len, tables };
}

function makeContext(o) {
  const S = o.size_m, seed = o.seed, gs = o.geology.seed, rnd = mulberry32(hash32(seed, 17, 0xc0ffee));
  // uplift fBm (casebook machine), initial-surface fBm, L0 base-level field, warp fields
  const up = diamondSquare(256, o.roughness, hash32(seed, 1, 11)); normalise01(up.z);
  const ini = diamondSquare(256, o.roughness, hash32(seed, 2, 13)); normalise01(ini.z);
  const l0 = diamondSquare(32, 0.9, hash32(seed, 3, 17)); normalise01(l0.z);
  const wx = diamondSquare(128, 0.55, hash32(gs, 4, 19)), wy = diamondSquare(128, 0.55, hash32(gs, 5, 23));
  normalise01(wx.z); normalise01(wy.z);
  // regional tilt: open edges are those facing the downhill direction g
  const ga = rnd() * Math.PI * 2, gx = Math.cos(ga), gy = Math.sin(ga);
  const open = { E: gx > 0.35, W: gx < -0.35, N: gy > 0.35, S: gy < -0.35 };
  // projection s ∈ [0,1]: 0 on the downhill side, 1 uphill
  const corners = [[0, 0], [S, 0], [0, S], [S, S]].map(([x, y]) => x * gx + y * gy);
  const pmin = Math.min(...corners), pmax = Math.max(...corners);
  // outlets: a few seeded gaps per open edge (about one per 3.5 km), the rest of the edge is a no-flux divide
  const outlets = [];
  for (const e of ['E', 'W', 'N', 'S']) {
    if (!open[e]) continue;
    const m = Math.max(1, Math.round(S / 3500));
    for (let q = 0; q < m; q++) outlets.push({ e, t: (q + 0.2 + 0.6 * rnd()) / m, half: Math.max(30, S * 0.004) });
  }
  // geology domains: jittered grid of points
  const gr = mulberry32(hash32(gs, 6, 29)), g = Math.max(2, Math.round(S / 3200)), pts = [];
  const LW = [0.2, 0.25, 0.2, 0.15, 0.2];
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
    const x = (i + 0.15 + 0.7 * gr()) * S / g, y = (j + 0.15 + 0.7 * gr()) * S / g;
    let u = gr(), L = 0; while (L < 4 && u > LW[L]) { u -= LW[L]; L++; }
    const graben = gr() < C.GRABEN_P;
    pts.push({
      x, y, L,
      mul: graben ? C.GRABEN_MUL : 0.75 + 0.5 * gr(),
      graben,
      foldA: (L === 0 ? 0 : 20 + 110 * gr()), foldL: 900 + 3200 * gr(), foldD: gr() * Math.PI,
      foldP: gr() * Math.PI * 2, dip: (L === 0 ? 0 : (gr() * 7) * Math.PI / 180), dipD: gr() * Math.PI * 2,
      zoff: Math.floor(gr() * 2000),
      quat: (gr() * 2 - 1) * C.F_Q,
    });
  }
  // keep at least one sedimentary and one hard domain so every region shows strata (chosen)
  if (!pts.some((p) => p.L === 1 || p.L === 2)) pts[(gr() * pts.length) | 0].L = 1;
  const strata = makeStrata(gs);
  const warp = S * 0.11;
  /** nearest domain + soft weights (for uplift and fault offsets) at (x, y) */
  function domains(x, y, soft) {
    const u = x / S, v = y / S;
    const qx = x + warp * (gridAt(wx.z, wx.n, u, v) * 2 - 1), qy = y + warp * (gridAt(wy.z, wy.n, u, v) * 2 - 1);
    let best = 0, bd = Infinity;
    const d = new Float64Array(pts.length);
    for (let k = 0; k < pts.length; k++) { const p = pts[k]; d[k] = Math.hypot(qx - p.x, qy - p.y); if (d[k] < bd) { bd = d[k]; best = k; } }
    if (!soft) return { best };
    let ws = 0, mul = 0, quat = 0;
    for (let k = 0; k < pts.length; k++) { const w = Math.exp(-(d[k] - bd) / soft); ws += w; mul += w * pts[k].mul; quat += w * pts[k].quat; }
    return { best, mul: mul / ws, quat: quat / ws };
  }
  function fold(k, x, y) {
    const p = pts[k];
    const a = (x * Math.cos(p.foldD) + y * Math.sin(p.foldD)) * 2 * Math.PI / p.foldL + p.foldP;
    return p.foldA * Math.sin(a) + Math.tan(p.dip) * (x * Math.cos(p.dipD) + y * Math.sin(p.dipD)) + p.zoff;
  }
  return { o, S, up, ini, l0, gx, gy, open, outlets, pmin, pmax, pts, strata, domains, fold };
}

// ------------------------------------------------------------------------------------------------ grid
class MinHeap {
  constructor(cap) { this.k = new Float64Array(cap + 1); this.v = new Int32Array(cap + 1); this.n = 0; }
  push(key, val) {
    const k = this.k, v = this.v; let i = ++this.n;
    while (i > 1) { const p = i >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = v[1], lk = k[this.n], lv = v[this.n], n = --this.n;
    let i = 1;
    for (;;) { let c = i << 1; if (c > n) break; if (c < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; }
    k[i] = lk; v[i] = lv;
    return top;
  }
}

function makeGrid(n, S) {
  const N = n * n, cell = S / (n - 1);
  const g = {
    n, N, S, cell, cellA: cell * cell,
    h: new Float64Array(N), w: new Float64Array(N), hOld: new Float64Array(N), tmp: new Float64Array(N),
    rec: new Int32Array(N), rdist: new Float32Array(N), stack: new Int32Array(N),
    A: new Float64Array(N), qs: new Float64Array(N),
    ndon: new Int32Array(N + 1), don: new Int32Array(N),
    seed: new Uint8Array(N), seedList: null, closed: new Uint8Array(N), pit: new Int32Array(N), heap: new MinHeap(N),
    U: new Float32Array(N), Uacc: new Float64Array(N), foldZ: new Float32Array(N), lith: new Uint8Array(N),
    base: new Float32Array(N), quat: new Float32Array(N), Kf: new Float32Array(N), tanT: new Float32Array(N),
    off: new Int32Array(8), dist: new Float32Array(8),
  };
  for (let k = 0; k < 8; k++) { g.off[k] = DY[k] * n + DX[k]; g.dist[k] = cell * (k & 1 ? SQ2 : 1); }
  return g;
}

function setupLevel(g, ctx) {
  const { n, S } = g, { up, l0, gx, gy, pmin, pmax, pts } = ctx;
  const seeds = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = i * g.cell, y = j * g.cell, u = x / S, v = y / S;
    const s = 1 - ((x * gx + y * gy) - pmin) / (pmax - pmin);         // 0 downhill … 1 uphill
    const R = 0.12 + 0.88 * smoothstep(0.0, 0.9, s);
    const d = ctx.domains(x, y, 80);
    g.U[k] = C.U_MAX * R * (0.3 + 0.7 * gridAt(up.z, up.n, u, v)) * d.mul;
    g.lith[k] = pts[d.best].L;
    g.foldZ[k] = ctx.fold(d.best, x, y);
    g.quat[k] = d.quat;
    let isOpen = false;
    for (const q of ctx.outlets) {
      const onEdge = (q.e === 'W' && i === 0) || (q.e === 'E' && i === n - 1) || (q.e === 'S' && j === 0) || (q.e === 'N' && j === n - 1);
      if (onEdge && Math.abs((q.e === 'W' || q.e === 'E' ? y : x) - q.t * S) <= Math.max(q.half, g.cell * 0.6)) isOpen = true;
    }
    g.base[k] = C.BASE_LO + (C.BASE_HI - C.BASE_LO) * gridAt(l0.z, l0.n, u, v);
    if (isOpen) { g.seed[k] = 1; seeds.push(k); }
  }
  g.seedList = Int32Array.from(seeds);
}
function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

function initSurface(g, ctx) {
  const { n, S } = g, { ini, gx, gy, pmin, pmax } = ctx;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = i * g.cell, y = j * g.cell;
    const s = 1 - ((x * gx + y * gy) - pmin) / (pmax - pmin);
    g.h[k] = g.seed[k] ? g.base[k] : g.base[k] + 30 * s + 120 * gridAt(ini.z, ini.n, x / S, y / S);
  }
}
function upsample(a, b) {
  for (let j = 0; j < b.n; j++) for (let i = 0; i < b.n; i++) {
    const k = j * b.n + i, u = i / (b.n - 1), v = j / (b.n - 1);
    b.Uacc[k] = gridAt(a.Uacc, a.n, u, v);
    b.h[k] = b.seed[k] ? b.base[k] : gridAt(a.h, a.n, u, v);
  }
}

/** hardness → erodibility and repose; ζ = h − Uacc + fold */
function updateRock(g, ctx) {
  const { strata } = ctx, T = strata.tables, zmin = strata.zmin, len = strata.len;
  const lnR = Math.log(C.K_RATIO), t0 = C.THETA_WEAK, dt = C.THETA_HARD - C.THETA_WEAK;
  for (let k = 0; k < g.N; k++) {
    let zi = Math.round(g.h[k] - g.Uacc[k] + g.foldZ[k] - zmin);
    zi = zi < 0 ? 0 : zi >= len ? len - 1 : zi;
    const H = T[g.lith[k]][zi];
    const hn = Math.min(1, Math.max(0, (H - 0.2) / 0.7));
    g.Kf[k] = C.K0 * Math.exp(lnR * (0.5 - hn));
    g.tanT[k] = Math.tan((t0 + dt * hn) * Math.PI / 180);
  }
}

// ------------------------------------------------------------------------------------------------ hydrology kernels
/** ε-Priority-Flood (Barnes, Lehman & Mulla 2014, Alg. 3): w = filled surface. Seeds = open-edge cells. */
export function flood(g, extraSeeds) {
  const { n, h, w, closed, pit, heap, off } = g;
  heap.n = 0; closed.fill(0);
  const seeds = extraSeeds || g.seedList;
  for (let s = 0; s < seeds.length; s++) { const i = seeds[s]; w[i] = h[i]; closed[i] = 1; heap.push(h[i], i); }
  let ph = 0, pt = 0;
  const EPS = C.EPS;
  while (ph < pt || heap.n > 0) {
    const c = ph < pt ? pit[ph++] : heap.pop();
    const lim = w[c] + EPS, x = c % n, y = (c - x) / n;
    const interior = x > 0 && y > 0 && x < n - 1 && y < n - 1;
    for (let k = 0; k < 8; k++) {
      let nb;
      if (interior) nb = c + off[k];
      else { const xx = x + DX[k], yy = y + DY[k]; if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue; nb = yy * n + xx; }
      if (closed[nb]) continue;
      closed[nb] = 1;
      const hn = h[nb];
      if (hn <= lim) { w[nb] = lim; pit[pt++] = nb; } else { w[nb] = hn; heap.push(hn, nb); }
    }
  }
}
/** steepest descent on w; seeds are their own receivers */
export function receivers(g, isRoot) {
  const { n, N, w, rec, rdist, off, dist } = g, it = g.iter | 0;
  const root = isRoot || g.seed;
  for (let c = 0; c < N; c++) {
    if (root[c]) { rec[c] = c; rdist[c] = g.cell; continue; }
    const x = c % n, y = (c - x) / n, interior = x > 0 && y > 0 && x < n - 1 && y < n - 1, wc = w[c];
    let best = c, bs = 0, bd = g.cell;
    // Rho8 (Fairfield & Leymarie 1991): diagonal distance factor 2 − ρ, ρ ~ U(0,1) per cell and pass
    const rho = (hash32(c, it, 0x5eed) & 0xffff) / 65536, dg = g.cell * (2 - rho);
    for (let k = 0; k < 8; k++) {
      let nb;
      if (interior) nb = c + off[k];
      else { const xx = x + DX[k], yy = y + DY[k]; if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue; nb = yy * n + xx; }
      const dw = wc - w[nb];
      if (dw > 0) { const s = dw / (k & 1 ? dg : g.cell); if (s > bs) { bs = s; best = nb; bd = dist[k]; } }
    }
    rec[c] = best; rdist[c] = bd;
  }
}
/**
 * Drainage over flats (Barnes, Lehman & Mulla 2014, "An efficient assignment of drainage direction over flat
 * surfaces"): on cells whose steepest drop is below TOL (ε-filled or sediment-filled flats), flow follows
 * mask = 2·(steps to lower terrain) − (steps from higher terrain), so it runs down the middle of a plain
 * toward its outlet instead of fanning out in straight lines from the spill point.
 */
export function resolveFlats(g) {
  const { n, N, w, rec, rdist, off, dist } = g, TOL = 1e-4;
  const flat = new Uint8Array(N), lowE = new Uint8Array(N);
  let any = false;
  for (let i = 0; i < N; i++) if (rec[i] !== i && w[i] - w[rec[i]] < TOL) { flat[i] = 1; any = true; }
  if (!any) return;
  const qa = new Int32Array(N), dL = new Int32Array(N).fill(-1), dH = new Int32Array(N).fill(-1);
  let ta = 0;
  const qb = new Int32Array(N); let tb = 0;
  for (let i = 0; i < N; i++) {
    if (!flat[i]) continue;
    const x = i % n, y = (i - x) / n;
    let low = false, high = false;
    for (let k = 0; k < 8; k++) {
      const xx = x + DX[k], yy = y + DY[k]; if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
      const nb = yy * n + xx, d = w[nb] - w[i];
      if (d < -TOL || (g.seed[nb] && d <= 0)) low = true; else if (d > TOL && !flat[nb]) high = true;
    }
    if (low) { lowE[i] = 1; dL[i] = 0; qa[ta++] = i; }
    if (high) { dH[i] = 0; qb[tb++] = i; }
  }
  const bfs = (q, t, d) => {
    for (let h = 0; h < t; h++) {
      const c = q[h], x = c % n, y = (c - x) / n;
      for (let k = 0; k < 8; k++) { const xx = x + DX[k], yy = y + DY[k]; if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue; const nb = yy * n + xx; if (flat[nb] && d[nb] < 0 && Math.abs(w[nb] - w[c]) < 0.05) { d[nb] = d[c] + 1; q[t++] = nb; } }
    }
  };
  bfs(qa, ta, dL); bfs(qb, tb, dH);
  for (let i = 0; i < N; i++) {
    if (!flat[i] || lowE[i] || dL[i] < 0) continue;
    const x = i % n, y = (i - x) / n, mi = 2 * dL[i] - Math.max(0, dH[i]);
    let best = -1, bm = mi, bd = 0;
    for (let k = 0; k < 8; k++) {
      const xx = x + DX[k], yy = y + DY[k]; if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
      const nb = yy * n + xx; if (!flat[nb] || dL[nb] < 0 || Math.abs(w[nb] - w[i]) >= 0.05) continue;
      const m = 2 * dL[nb] - Math.max(0, dH[nb]);
      if (m < bm || (m === bm && best >= 0 && dist[k] < bd)) { if (m < bm || best < 0) { bm = m; best = nb; bd = dist[k]; } }
    }
    if (best >= 0 && bm < mi) { rec[i] = best; rdist[i] = bd; }
  }
}
/** Braun–Willett stack: receivers before donors; returns the number of cells in the stack */
export function buildStack(g) {
  const { N, rec, ndon, don, stack } = g;
  ndon.fill(0);
  for (let i = 0; i < N; i++) if (rec[i] !== i) ndon[rec[i] + 1]++;
  for (let i = 0; i < N; i++) ndon[i + 1] += ndon[i];
  const cur = g.qs; // reuse as cursor (Float64 is fine for ints)
  for (let i = 0; i < N; i++) cur[i] = ndon[i];
  for (let i = 0; i < N; i++) { const r = rec[i]; if (r !== i) don[cur[r]++] = i; }
  let head = 0, tail = 0;
  for (let i = 0; i < N; i++) if (rec[i] === i) stack[tail++] = i;
  while (head < tail) { const c = stack[head++]; for (let k = ndon[c]; k < ndon[c + 1]; k++) stack[tail++] = don[k]; }
  g.nstack = tail;
  return tail;
}
export function accumulate(g, weight) {
  const { A, stack, rec, cellA } = g, ns = g.nstack;
  if (weight) for (let i = 0; i < g.N; i++) A[i] = cellA * weight[i]; else A.fill(cellA);
  for (let j = ns - 1; j >= 0; j--) { const i = stack[j], r = rec[i]; if (r !== i) A[r] += A[i]; }
}

// ------------------------------------------------------------------------------------------------ one erosion step
function step(g, dt) {
  g.iter = (g.iter | 0) + 1;
  const { N, h, w, hOld, rec, rdist, stack, A, U, Kf, tanT, qs, seed, cellA } = g, m = C.M;
  flood(g); receivers(g); buildStack(g); accumulate(g);
  hOld.set(h);
  const LAKE = 0.01;
  // implicit stream power, receivers first
  for (let j = 0; j < g.nstack; j++) {
    const i = stack[j], r = rec[i];
    if (r === i) continue;
    if (w[i] - h[i] > LAKE) { h[i] += U[i] * dt; continue; }               // under a lake: no fluvial erosion
    const br = w[r] - h[r] > LAKE ? w[r] : h[r];
    const F = Kf[i] * Math.pow(A[i], m) * dt / rdist[i];
    h[i] = (h[i] + U[i] * dt + F * br) / (1 + F);
  }
  // sediment: donors first; lake cells trap a share of what arrives
  qs.fill(0);
  for (let j = g.nstack - 1; j >= 0; j--) {
    const i = stack[j], r = rec[i];
    if (r === i) continue;
    const depth = w[i] - h[i];
    if (depth > LAKE) {
      const dep = Math.min(qs[i] * C.TRAP, depth * cellA);
      h[i] += dep / cellA; qs[i] -= dep;
    } else {
      const e = hOld[i] + U[i] * dt - h[i];
      if (e > 0) qs[i] += e * cellA;
    }
    qs[r] += qs[i];
  }
  diffuse(g, dt);
  // talus threshold in stack order
  for (let j = 0; j < g.nstack; j++) {
    const i = stack[j], r = rec[i];
    if (r === i) continue;
    const br = w[r] - hOld[r] > LAKE && w[r] > h[r] ? w[r] : h[r];
    const cap = br + tanT[i] * rdist[i];
    if (h[i] > cap) h[i] = cap;
  }
  for (let i = 0; i < N; i++) if (!seed[i]) g.Uacc[i] += U[i] * dt;
}
function diffuse(g, dt) {
  const { n, seed, A } = g;
  const r = C.D_HILL * dt / (g.cell * g.cell), nsub = Math.max(1, Math.ceil(r / 0.2)), rr = r / nsub;
  let a = g.h, b = g.tmp;
  for (let s = 0; s < nsub; s++) {
    for (let y = 0; y < n; y++) {
      const ym = y > 0 ? -n : n, yp = y < n - 1 ? n : -n;       // mirror at the edges (no flux)
      for (let x = 0; x < n; x++) {
        const k = y * n + x;
        if (seed[k]) { b[k] = a[k]; continue; }
        const xm = x > 0 ? -1 : 1, xp = x < n - 1 ? 1 : -1, c = a[k];
        const dh = rr * (a[k + xm] + a[k + xp] + a[k + ym] + a[k + yp] - 4 * c);
        // channels export the colluvium they receive (the river carries it): no diffusive gain where A ≥ A_DIFF
        b[k] = dh > 0 && A[k] >= C.A_DIFF ? c : c + dh;
      }
    }
    const t = a; a = b; b = t;
  }
  if (a !== g.h) g.h.set(a);
}

// ------------------------------------------------------------------------------------------------ generate
export function generateTerrain(opts = {}, onProgress) {
  const o = normOpts(opts), times = {};
  let t = now();
  const ctx = makeContext(o);
  const lv = o.levels || C.LEVELS;
  const totalIts = lv.reduce((a, l) => a + l[1] * (o.cells / l[0]) ** 2, 0);
  let doneIts = 0, prev = null;
  for (const [div, its, dt] of lv) {
    const n = Math.max(33, Math.round((o.cells - 1) / div) + 1);
    const g = makeGrid(n, o.size_m);
    setupLevel(g, ctx);
    if (prev) upsample(prev, g); else initSurface(g, ctx);
    for (let it = 0; it < its; it++) {
      if ((it & 7) === 0) updateRock(g, ctx);
      step(g, dt);
      doneIts += (o.cells / div) ** 2;
      if (onProgress && (it & 7) === 0) onProgress(0.85 * doneIts / totalIts, `erosion ${n}²`);
    }
    times[`erosion_${n}`] = Math.round(now() - t); t = now();
    prev = g;
  }
  const g = prev;
  // Quaternary fault offsets, then a short relaxation (tectonic lakes)
  for (let i = 0; i < g.N; i++) if (!g.seed[i]) { g.h[i] += g.quat[i]; g.Uacc[i] += g.quat[i]; }
  updateRock(g, ctx);
  for (let it = 0; it < C.RELAX[0]; it++) step(g, C.RELAX[1]);
  times.quaternary = Math.round(now() - t); t = now();
  if (onProgress) onProgress(0.88, 'hydrology');
  const T = analyse(g, ctx, o, times, onProgress);
  times.total = Object.values(times).reduce((a, b) => a + b, 0);
  T.timing = times;
  if (onProgress) onProgress(1, 'done');
  return T;
}

// ------------------------------------------------------------------------------------------------ analysis
function analyse(g, ctx, o, times, onProgress) {
  let t = now();
  const { n, N, cell, cellA } = g, S = o.size_m;
  const h = g.h;
  // final hydrology on the eroded surface
  // the region continues beyond its no-flux edges: in the final analysis every edge cell may be an outlet,
  // so no lake is truncated by the region boundary
  g.iter = 0x7fff;
  const edgeRoot = new Uint8Array(N), edgeSeeds = [];
  for (let i = 0; i < N; i++) { const x = i % n, y = (i - x) / n; if (x === 0 || y === 0 || x === n - 1 || y === n - 1) { edgeRoot[i] = 1; edgeSeeds.push(i); } }
  g.seed = edgeRoot; g.seedList = Int32Array.from(edgeSeeds);
  flood(g); receivers(g); resolveFlats(g); buildStack(g); accumulate(g);
  const w = g.w;
  // sea: flood from the region edges through cells below sea level (4-connected)
  let seaLevel = o.seaLevel;
  if (seaLevel == null && o.seaQuantile != null) {
    const s = Float64Array.from(h).sort();
    seaLevel = s[Math.min(N - 1, Math.floor(o.seaQuantile * N))];
  }
  const waterKind = new Uint8Array(N), water = new Float32Array(N), lakeId = new Int32Array(N);
  if (seaLevel != null) {
    const q = new Int32Array(N); let qh = 0, qt = 0;
    for (let i = 0; i < n; i++) for (const k of [i, (n - 1) * n + i, i * n, i * n + n - 1]) if (h[k] < seaLevel && !waterKind[k]) { waterKind[k] = 3; q[qt++] = k; }
    while (qh < qt) {
      const c = q[qh++], x = c % n, y = (c - x) / n;
      for (let k = 0; k < 8; k += 2) { const xx = x + DX[k], yy = y + DY[k]; if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue; const nb = yy * n + xx; if (!waterKind[nb] && h[nb] < seaLevel) { waterKind[nb] = 3; q[qt++] = nb; } }
    }
    for (let i = 0; i < N; i++) if (waterKind[i] === 3) water[i] = seaLevel - h[i];
    // with a sea the outlets are the sea cells: reroute the land onto them
    const root = new Uint8Array(N); let any = false;
    for (let i = 0; i < N; i++) if (waterKind[i] === 3 || g.seed[i]) { root[i] = 1; any = true; }
    if (any) {
      const seeds = []; for (let i = 0; i < N; i++) if (root[i]) seeds.push(i);
      flood(g, Int32Array.from(seeds)); receivers(g, root); resolveFlats(g); buildStack(g); accumulate(g);
    }
  }
  // lakes: filled more than 0.3 m, 4-connected components of at least 3 cells; shallower pits become marsh
  const LAKE_MIN = 0.3, lakes = [];
  {
    const q = new Int32Array(N);
    for (let s = 0; s < N; s++) {
      if (waterKind[s] || lakeId[s] || w[s] - h[s] <= LAKE_MIN) continue;
      let qh = 0, qt = 0; q[qt++] = s; lakeId[s] = -1;
      let level = 0, depth = 0, sx = 0, sy = 0;
      while (qh < qt) {
        const c = q[qh++], x = c % n, y = (c - x) / n;
        level = Math.max(level, w[c]); depth = Math.max(depth, w[c] - h[c]); sx += x; sy += y;
        for (let k = 0; k < 8; k += 2) { const xx = x + DX[k], yy = y + DY[k]; if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue; const nb = yy * n + xx; if (!lakeId[nb] && !waterKind[nb] && w[nb] - h[nb] > LAKE_MIN) { lakeId[nb] = -1; q[qt++] = nb; } }
      }
      if (qt >= 3) {
        const id = lakes.length + 1;
        // the spill point: follow receivers from the deepest cell to the first non-lake cell
        let c = s; for (let guard = 0; guard < N && w[c] - h[c] > LAKE_MIN * 0.5 && g.rec[c] !== c; guard++) c = g.rec[c];
        lakes.push({ id, level, area_m2: qt * cellA, depth_max: depth, x: (sx / qt) * cell, y: (sy / qt) * cell, outlet: c, cells: qt });
        for (let j = 0; j < qt; j++) { const k = q[j]; lakeId[k] = id; waterKind[k] = 2; water[k] = w[k] - h[k]; }
      } else for (let j = 0; j < qt; j++) lakeId[q[j]] = 0;
    }
  }
  times.hydrology = Math.round(now() - t); t = now();
  if (onProgress) onProgress(0.9, 'climate');

  // slope (central differences) and aspect
  const slope = new Float32Array(N), northness = new Float32Array(N), lap = new Float32Array(N);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const k = y * n + x;
    const xm = x > 0 ? k - 1 : k, xp = x < n - 1 ? k + 1 : k, ym = y > 0 ? k - n : k, yp = y < n - 1 ? k + n : k;
    const gx = (h[xp] - h[xm]) / ((xp - xm) * cell || 1), gy = (h[yp] - h[ym]) / (((yp - ym) / n) * cell || 1);
    const gm = Math.hypot(gx, gy);
    slope[k] = Math.atan(gm);
    northness[k] = gm > 1e-6 ? gy / gm : 0;                  // +1 when the slope faces north (falls toward +y)
    lap[k] = (h[xp] + h[xm] + h[yp] + h[ym] - 4 * h[k]) / (cell * cell);
  }
  for (let i = 0; i < N; i++) northness[i] = -northness[i];  // gradient points uphill; facing = downhill
  // climate
  const T = new Float32Array(N), P = orographic(h, n, cell, o.climate, seaLevel);
  for (let i = 0; i < N; i++) T[i] = o.climate.T0 + C.LAPSE * Math.max(0, h[i] - (seaLevel ?? 0));
  times.climate = Math.round(now() - t); t = now();

  // runoff (Turc) → mean discharge; bankfull from area
  const runoff = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const Ti = T[i], Pi = P[i], L = Math.max(50, 300 + 25 * Ti + 0.05 * Ti * Ti * Ti);
    const et = Math.min(Pi, Pi / Math.sqrt(0.9 + (Pi / L) ** 2));
    runoff[i] = Math.max(0, Pi - et) / Pi || 0;              // fraction of P that runs off
  }
  const area = new Float32Array(N); for (let i = 0; i < N; i++) area[i] = g.A[i];
  const qw = new Float64Array(N);
  for (let i = 0; i < N; i++) qw[i] = cellA * P[i] * 1e-3 * runoff[i] / 31557600; // m³/s per cell
  for (let j = g.nstack - 1; j >= 0; j--) { const i = g.stack[j], r = g.rec[i]; if (r !== i) qw[r] += qw[i]; }
  const discharge = new Float32Array(N); for (let i = 0; i < N; i++) discharge[i] = qw[i];

  // channel geometry on channel cells
  const recv = new Int32Array(N);
  for (let i = 0; i < N; i++) recv[i] = waterKind[i] === 3 || g.rec[i] === i ? -1 : g.rec[i];
  const chS = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    // channel slope over up to 3 cells downstream
    let c = i, d = 0, k = 0; while (k < 3 && recv[c] >= 0) { d += g.rdist[c]; c = recv[c]; k++; }
    chS[i] = d > 0 ? Math.max(1e-4, (h[i] - h[c]) / d) : 1e-4;
  }
  const hyd = (i) => {
    const Qbf = 0.42 * Math.pow(area[i] / 1e6, 0.69);
    const d = Math.pow(Qbf * C.MANNING / (18.8 * Math.sqrt(chS[i])), 1 / 3.077);
    return { Qbf, d, w: 18.8 * Math.pow(d, 1.41) };
  };
  // Strahler order on channel cells (A ≥ A_C, land)
  const isCh = new Uint8Array(N);
  for (let i = 0; i < N; i++) isCh[i] = area[i] >= C.A_C && waterKind[i] !== 3 ? 1 : 0;
  const order = new Uint8Array(N), mx = new Uint8Array(N), cnt = new Uint8Array(N);
  for (let j = g.nstack - 1; j >= 0; j--) {
    const i = g.stack[j];
    if (!isCh[i]) continue;
    order[i] = mx[i] === 0 ? 1 : cnt[i] >= 2 ? mx[i] + 1 : mx[i];
    const r = g.rec[i];
    if (r !== i && isCh[r]) { if (order[i] > mx[r]) { mx[r] = order[i]; cnt[r] = 1; } else if (order[i] === mx[r]) cnt[r]++; }
  }
  // river cells
  for (let i = 0; i < N; i++) if (!waterKind[i] && area[i] >= C.A_RIVER) { const q = hyd(i); waterKind[i] = 1; water[i] = q.d; }
  // polylines: one per stream segment (constant order), split at lakes and the sea
  const oxbows = [];
  const rivers = extractRivers(g, area, order, waterKind, recv, hyd, h, chS, oxbows);
  times.rivers = Math.round(now() - t); t = now();
  if (onProgress) onProgress(0.94, 'soil and materials');

  // soil, wetness, lithology at the surface, hardness
  const soil = new Float32Array(N), bedrock = new Float32Array(N), wetness = new Float32Array(N);
  const lithology = new Uint8Array(N), hardness = new Float32Array(N), strataOffset = new Float32Array(N);
  const ROCKF = [1.2, 1.0, 0.4, 1.0, 1.3];
  const st = ctx.strata;
  for (let i = 0; i < N; i++) {
    const L = g.lith[i]; lithology[i] = L;
    const sdeg = slope[i] * 180 / Math.PI;
    let hs;
    const E = -C.D_HILL * lap[i], P0 = C.SOIL_P0 * ROCKF[L];
    if (waterKind[i] >= 2) hs = 0;
    else if (E <= 1e-7) hs = C.SOIL_CAP;                                         // concave/flat: accumulates to the cap
    else hs = Math.min(C.SOIL_CAP, Math.max(0, Math.log(P0 / E) / C.SOIL_K));
    if (sdeg > 32) hs *= Math.max(0, (45 - sdeg) / 13);                           // bare above 45°
    if (g.w[i] - h[i] > 0.05 && waterKind[i] < 2) hs = Math.max(hs, 1.2);         // filled pits: alluvium
    soil[i] = hs; bedrock[i] = h[i] - hs;
    const a = area[i] / cell, tb = Math.max(1e-3, Math.tan(slope[i]));
    wetness[i] = Math.log(a / tb);
    strataOffset[i] = g.Uacc[i] - g.foldZ[i];
    let zi = Math.round(bedrock[i] - strataOffset[i] - st.zmin); zi = zi < 0 ? 0 : zi >= st.len ? st.len - 1 : zi;
    hardness[i] = st.tables[L][zi];
  }
  const material = classify({ n, N, cell, h, slope, soil, wetness, waterKind, area, P, T, northness, lithology, hardness, recv, lap, chS, seaLevel });
  times.materials = Math.round(now() - t); t = now();

  // straits
  const straits = seaLevel != null ? findStraits(n, cell, waterKind, h, seaLevel) : [];
  times.straits = Math.round(now() - t); t = now();

  const terrain = {
    n, cell_m: cell, size_m: S, seaLevel,
    height: Float32Array.from(h), bedrock, soil, slope, area, receiver: recv, discharge, water, waterKind,
    wetness, lithology, hardness, material, T, P, rivers, lakes,
    // additions (documented in LANDSCAPE.md "Status — ground")
    order, lakeId, straits, oxbows, uplift: g.U, strataOffset, lake_level: Float32Array.from(g.w), northness,
    strata: { zmin: st.zmin, step: st.step, len: st.len, tables: st.tables },
    domains: ctx.pts.map((p) => ({ x: p.x, y: p.y, lithology: p.L, graben: p.graben, upliftMul: p.mul })),
    openEdges: ctx.open, opts: o,
  };
  if (onProgress) onProgress(0.97, 'statistics');
  terrain.stats = computeStats(terrain, { stack: g.stack.slice(0, g.nstack), rdist: g.rdist });
  times.stats = Math.round(now() - t);
  attachMethods(terrain);
  return terrain;
}

function extractRivers(g, area, order, waterKind, recv, hyd, h, chS, oxbows) {
  const { n, N, cell } = g, rivers = [];
  const hAt = (x, y) => sampleGrid(h, n, x / cell, y / cell);
  const drawn = (i) => area[i] >= C.A_RIVER && waterKind[i] === 1;
  // heads: drawn cells with no drawn donor of the same order, or donors that are lake cells
  const hasSame = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const r = recv[i]; if (r >= 0 && drawn(i) && drawn(r) && order[i] === order[r]) hasSame[r] = 1; }
  for (let s = 0; s < N; s++) {
    if (!drawn(s) || hasSame[s]) continue;
    const pts = [], wid = [], dep = [], qs = [];
    let c = s;
    for (let guard = 0; guard < N; guard++) {
      const q = hyd(c), x = c % n, y = (c - x) / n;
      pts.push(x * cell, y * cell, h[c] + q.d * 0.5); wid.push(q.w); dep.push(q.d);
      const r = recv[c];
      if (r < 0) break;
      if (!drawn(r)) {                                                     // into a lake or the sea: end there
        if (waterKind[r] >= 2) { const xr = r % n, yr = (r - xr) / n; pts.push(xr * cell, yr * cell, h[c]); wid.push(q.w); dep.push(q.d); }
        break;
      }
      if (order[r] !== order[c]) {                                         // the junction: include it and stop
        const q2 = hyd(r), xr = r % n, yr = (r - xr) / n;
        pts.push(xr * cell, yr * cell, h[r] + q2.d * 0.5); wid.push(q2.w); dep.push(q2.d);
        break;
      }
      c = r;
    }
    if (pts.length < 6) continue;
    let sm = chaikin(pts, wid, dep, 2);
    const mres = meander(sm, hAt, hash32(s, 5, 0x3ea7), oxbows);
    if (mres) sm = mres;
    rivers.push({ pts: sm.pts, width: sm.wid, depth: sm.dep, order: order[s] || 1, area_m2: area[c], sinuosity: sm.sinuosity || 1 });
  }
  return rivers;
}

/**
 * Meander migration on a low-slope reach (Howard & Knutson 1984 as implemented by Paris et al. 2023):
 * centreline points move along their normal at μ = ω·μ0 + γ·⟨μ0⟩_upstream, μ0 = w·κ, the upstream mean
 * weighted by e^(−α·Δs), α = 2f/d (f = 0.011), ω = −1, γ = 2.5. Migration fades between slopes 0.002 and
 * 0.008 and is refused where it would climb more than max(1.5 m, 2·depth) above the water (the valley
 * wall), so meanders stay on the floodplain. Loops that touch (closer than 0.9 w) are cut off; the loop is
 * kept as an oxbow. Chosen: spacing 0.5 w, 240 steps, step 0.08 spacing per unit rate.
 */
function meander(sm, hAt, seed, oxbows) {
  const P = sm.pts, W = sm.wid, D = sm.dep, m = W.length;
  if (m < 4) return null;
  let L = 0; for (let i = 1; i < m; i++) L += Math.hypot(P[i * 3] - P[i * 3 - 3], P[i * 3 + 1] - P[i * 3 - 2]);
  let wm = 0, dm = 0; for (let i = 0; i < m; i++) { wm += W[i]; dm += D[i]; } wm /= m; dm /= m;
  const S = (P[2] - P[(m - 1) * 3 + 2]) / Math.max(1, L);
  const damp = 1 - smoothstep(0.002, 0.008, S);
  if (damp <= 0.01 || L < 25 * wm) return null;
  const r = mulberry32(seed), delta = Math.max(1.5, 0.5 * wm), alpha = 2 * 0.011 / Math.max(0.2, dm);
  // points as arrays with arc-length fraction for z, w, d
  let xs = [], ys = [], fs = [];
  { let acc = 0; for (let i = 0; i < m; i++) { if (i) acc += Math.hypot(P[i * 3] - P[i * 3 - 3], P[i * 3 + 1] - P[i * 3 - 2]); xs.push(P[i * 3]); ys.push(P[i * 3 + 1]); fs.push(acc / L); } }
  const lerpAt = (arr, f) => { const u = Math.min(m - 1.000001, Math.max(0, f * (m - 1))), i = u | 0, t = u - i; return arr[i] * (1 - t) + arr[i + 1] * t; };
  // water surface by arc-length fraction, tabulated (ZT samples)
  const ZT = 256, ztab = new Float64Array(ZT + 1);
  { let acc = 0, i = 1, prevAcc = 0; for (let q = 0; q <= ZT; q++) { const target = q / ZT * L; while (i < m - 1 && acc + Math.hypot(P[i * 3] - P[i * 3 - 3], P[i * 3 + 1] - P[i * 3 - 2]) < target) { acc += Math.hypot(P[i * 3] - P[i * 3 - 3], P[i * 3 + 1] - P[i * 3 - 2]); i++; } const d = Math.hypot(P[i * 3] - P[i * 3 - 3], P[i * 3 + 1] - P[i * 3 - 2]) || 1, t = Math.min(1, Math.max(0, (target - acc) / d)); ztab[q] = P[i * 3 - 1] * (1 - t) + P[i * 3 + 2] * t; } }
  const zOf = (f) => { const u = Math.min(ZT - 1e-6, Math.max(0, f * ZT)), i = u | 0, t = u - i; return ztab[i] * (1 - t) + ztab[i + 1] * t; };
  const resample = () => {
    const nx = [xs[0]], ny = [ys[0]], nf = [fs[0]];
    let carry = 0;
    for (let i = 1; i < xs.length; i++) {
      const dx = xs[i] - xs[i - 1], dy = ys[i] - ys[i - 1], d = Math.hypot(dx, dy);
      let t = delta - carry;
      while (t < d) { const u = t / d; nx.push(xs[i - 1] + dx * u); ny.push(ys[i - 1] + dy * u); nf.push(fs[i - 1] + (fs[i] - fs[i - 1]) * u); t += delta; }
      carry = d - (t - delta);
    }
    nx.push(xs[xs.length - 1]); ny.push(ys[ys.length - 1]); nf.push(fs[fs.length - 1]);
    xs = nx; ys = ny; fs = nf;
  };
  resample();
  // seed perturbation: a little noise along the normal
  for (let i = 1; i < xs.length - 1; i++) {
    const tx = xs[i + 1] - xs[i - 1], ty = ys[i + 1] - ys[i - 1], tl = Math.hypot(tx, ty) || 1;
    const a = 0.08 * wm * (r() - 0.5);
    xs[i] += (ty / tl) * a; ys[i] += (-tx / tl) * a;
  }
  const STEPS = 240, K = 0.08 * delta;
  for (let step = 0; step < STEPS; step++) {
    const k = xs.length, mu0 = new Float64Array(k), nxs = new Float64Array(k), nys = new Float64Array(k);
    for (let i = 1; i < k - 1; i++) {
      const ax = xs[i] - xs[i - 1], ay = ys[i] - ys[i - 1], bx = xs[i + 1] - xs[i], by = ys[i + 1] - ys[i];
      const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
      const cross = (ax * by - ay * bx) / (la * lb), dot = (ax * bx + ay * by) / (la * lb);
      const kappa = Math.atan2(cross, dot) / (0.5 * (la + lb));          // + for a left turn
      const tx = ax / la + bx / lb, ty = ay / la + by / lb, tl = Math.hypot(tx, ty) || 1;
      nxs[i] = ty / tl; nys[i] = -tx / tl;                                  // right-hand normal
      mu0[i] = lerpAt(W, fs[i]) * kappa;
    }
    let acc = 0, norm = 0;
    const e = Math.exp(-alpha * delta);
    for (let i = 1; i < k - 1; i++) {
      acc = acc * e + mu0[i] * delta; norm = norm * e + delta;
      const mu = -1 * mu0[i] + 2.5 * acc / norm;
      let dmove = K * mu * damp;
      dmove = Math.max(-0.25 * delta, Math.min(0.25 * delta, dmove));
      const x = xs[i] + nxs[i] * dmove, y = ys[i] + nys[i] * dmove;
      const zw = zOf(fs[i]), dd = lerpAt(D, fs[i]);
      if (hAt(x, y) > zw + Math.max(1.5, 2 * dd)) continue;               // valley wall: no migration
      xs[i] = x; ys[i] = y;
    }
    resample();
    if (step % 6 === 5) {                                                  // cutoffs via a spatial hash
      const cs = wm * 1.2, grid = new Map(), key = (x, y) => Math.floor(x / cs) * 73856093 ^ Math.floor(y / cs) * 19349663;
      for (let i = 0; i < xs.length; i++) { const kk = key(xs[i], ys[i]); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(i); }
      let cut = null;
      for (let i = 0; i < xs.length && !cut; i++) {
        const gx = Math.floor(xs[i] / cs), gy = Math.floor(ys[i] / cs);
        for (let a = -1; a <= 1 && !cut; a++) for (let b = -1; b <= 1 && !cut; b++) {
          const list = grid.get((gx + a) * 73856093 ^ (gy + b) * 19349663); if (!list) continue;
          for (const j of list) if (j > i + Math.ceil(3 * wm / delta) + 4 && Math.hypot(xs[j] - xs[i], ys[j] - ys[i]) < 0.9 * wm) { cut = [i, j]; break; }
        }
      }
      if (cut) {
        const [i, j] = cut, ox = [];
        for (let q = i; q <= j; q++) ox.push(xs[q], ys[q], zOf(fs[q]));
        oxbows.push({ pts: Float32Array.from(ox), width: lerpAt(W, fs[i]) });
        xs.splice(i + 1, j - i - 1); ys.splice(i + 1, j - i - 1); fs.splice(i + 1, j - i - 1);
      }
    }
  }
  const outP = [], outW = [], outD = [];
  let Ln = 0;
  for (let i = 0; i < xs.length; i++) { if (i) Ln += Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]); outP.push(xs[i], ys[i], zOf(fs[i])); outW.push(lerpAt(W, fs[i])); outD.push(lerpAt(D, fs[i])); }
  const chord = Math.hypot(xs[xs.length - 1] - xs[0], ys[ys.length - 1] - ys[0]) || 1;
  return { pts: Float32Array.from(outP), wid: Float32Array.from(outW), dep: Float32Array.from(outD), sinuosity: Ln / L * (L / chord > 0 ? 1 : 1), sinuosityChord: Ln / chord };
}
/** Chaikin corner cutting, endpoints kept; z, width and depth interpolated */
function chaikin(p, w, d, iters) {
  let P = p, W = w, D = d;
  for (let it = 0; it < iters; it++) {
    const m = W.length; if (m < 3) break;
    const np = [P[0], P[1], P[2]], nw = [W[0]], nd = [D[0]];
    for (let i = 0; i < m - 1; i++) {
      for (const f of [0.25, 0.75]) {
        if ((i === 0 && f === 0.25) || (i === m - 2 && f === 0.75)) continue;
        np.push(P[i * 3] * (1 - f) + P[i * 3 + 3] * f, P[i * 3 + 1] * (1 - f) + P[i * 3 + 4] * f, P[i * 3 + 2] * (1 - f) + P[i * 3 + 5] * f);
        nw.push(W[i] * (1 - f) + W[i + 1] * f); nd.push(D[i] * (1 - f) + D[i + 1] * f);
      }
    }
    np.push(P[(m - 1) * 3], P[(m - 1) * 3 + 1], P[(m - 1) * 3 + 2]); nw.push(W[m - 1]); nd.push(D[m - 1]);
    P = np; W = nw; D = nd;
  }
  return { pts: Float32Array.from(P), wid: Float32Array.from(W), dep: Float32Array.from(D) };
}

// ------------------------------------------------------------------------------------------------ materials
function classify(f) {
  const { n, N, cell, h, slope, soil, wetness, waterKind, area, T, northness, lithology, recv, lap, chS } = f;
  const mat = new Uint8Array(N).fill(2);
  const deg = (i) => slope[i] * 180 / Math.PI;
  const cliff = new Uint8Array(N), scree = new Uint8Array(N), boulder = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (waterKind[i] < 2 && (deg(i) >= C.CLIFF_DEG || (soil[i] < 0.05 && deg(i) > 20))) cliff[i] = 1;
  // rockfall runout: from every cliff cell down the receivers; scree while steep, boulders beyond
  for (let i = 0; i < N; i++) {
    if (!cliff[i]) continue;
    let c = recv[i], run = 0;
    for (let guard = 0; c >= 0 && guard < 64; guard++) {
      if (waterKind[c] >= 2 || cliff[c]) { if (cliff[c]) { run = 0; c = recv[c]; continue; } break; }
      run += cell;
      const d = deg(c);
      if (d >= 20 && run <= C.SCREE_RUN) scree[c] = 1;
      else if (run <= C.SCREE_RUN + C.BOULDER_RUN) { boulder[c] = 1; if (d < 20) run += cell; }
      else break;
      c = recv[c];
    }
  }
  // distance (in cells, ≤ 3) to standing water, for beaches
  const shore = new Uint8Array(N).fill(255);
  for (let i = 0; i < N; i++) if (waterKind[i] >= 2) shore[i] = 0;
  for (let pass = 0; pass < 3; pass++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const k = y * n + x; if (shore[k] <= pass) continue;
    for (let d = 0; d < 8; d += 2) { const xx = x + DX[d], yy = y + DY[d]; if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue; if (shore[yy * n + xx] === pass) { shore[k] = pass + 1; break; } }
  }
  for (let i = 0; i < N; i++) {
    const d = deg(i), wk = waterKind[i];
    if (wk >= 2) { mat[i] = 6; continue; }
    const Tadj = T[i] - 2 * Math.max(0, northness[i]) * Math.sin(slope[i]) * 2;
    const windswept = lap[i] < -0.02;
    if (Tadj < C.SNOW_T && d < C.SNOW_SLOPE && !windswept) { mat[i] = 5; continue; }
    if (cliff[i]) { mat[i] = 0; continue; }
    if (scree[i]) { mat[i] = 1; continue; }
    if (boulder[i]) { mat[i] = 7; continue; }
    // granite corestone/tor fields on convex thin-soiled ground; periglacial blockfields
    if ((lithology[i] === 0 && soil[i] < 0.45 && lap[i] < -0.004 && d < 28) || (T[i] < 0 && soil[i] < 0.5 && d < 30)) { mat[i] = 7; continue; }
    if ((shore[i] <= 2 && d < 8) || (area[i] >= 5e6 && chS[i] < 0.01 && wk === 1) || (f.P[i] < 250 && lithology[i] === 1 && d < 10)) { mat[i] = 4; continue; }
    if (wetness[i] >= C.TWI_WET && d < 6) { mat[i] = 3; continue; }
    mat[i] = soil[i] >= 0.3 ? 2 : 0;
  }
  return mat;
}

// ------------------------------------------------------------------------------------------------ straits
/** sea cells labelled by their nearest land mass (8-connected components); the narrowest crossing between
 *  each pair of land masses is a strait candidate. Width = distance land→sea→land. */
function findStraits(n, cell, waterKind, h, seaLevel) {
  const N = n * n, comp = new Int32Array(N), sizes = [0];
  const q = new Int32Array(N);
  let nc = 0;
  for (let s = 0; s < N; s++) {
    if (waterKind[s] === 3 || comp[s]) continue;
    nc++; let qh = 0, qt = 0; q[qt++] = s; comp[s] = nc;
    while (qh < qt) { const c = q[qh++], x = c % n, y = (c - x) / n; for (let k = 0; k < 8; k++) { const xx = x + DX[k], yy = y + DY[k]; if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue; const nb = yy * n + xx; if (!comp[nb] && waterKind[nb] !== 3) { comp[nb] = nc; q[qt++] = nb; } } }
    sizes.push(qt);
  }
  if (nc < 2) return [];
  // nearest-land label and distance for sea cells: chamfer (3-4) propagation
  const dist = new Float32Array(N).fill(1e9), lab = new Int32Array(N);
  for (let i = 0; i < N; i++) if (comp[i]) { dist[i] = 0; lab[i] = comp[i]; }
  const pass = (fw) => {
    const y0 = fw ? 0 : n - 1, y1 = fw ? n : -1, dy = fw ? 1 : -1;
    for (let y = y0; y !== y1; y += dy) for (let xi = 0; xi < n; xi++) {
      const x = fw ? xi : n - 1 - xi, k = y * n + x;
      for (const [ox, oy, c] of fw ? [[-1, 0, 1], [0, -1, 1], [-1, -1, SQ2], [1, -1, SQ2]] : [[1, 0, 1], [0, 1, 1], [1, 1, SQ2], [-1, 1, SQ2]]) {
        const xx = x + ox, yy = y + oy; if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
        const nb = yy * n + xx, d = dist[nb] + c;
        if (d < dist[k]) { dist[k] = d; lab[k] = lab[nb]; }
      }
    }
  };
  pass(true); pass(false); pass(true); pass(false);
  const minLand = Math.max(9, Math.round(5e4 / (cell * cell)));          // ignore islets under 0.05 km²
  const best = new Map();
  for (let y = 0; y < n; y++) for (let x = 0; x < n - 1; x++) for (const [ox, oy] of [[1, 0], [0, 1]]) {
    const xx = x + ox, yy = y + oy; if (yy >= n) continue;
    const a = y * n + x, b = yy * n + xx;
    if (waterKind[a] !== 3 || waterKind[b] !== 3) continue;
    const la = lab[a], lb = lab[b]; if (la === lb || !la || !lb) continue;
    if (sizes[la] < minLand || sizes[lb] < minLand) continue;
    const width = (dist[a] + dist[b] + 1) * cell, key = la < lb ? `${la}-${lb}` : `${lb}-${la}`;
    const cur = best.get(key);
    if (!cur || width < cur.width_m) best.set(key, { a: Math.min(la, lb), b: Math.max(la, lb), x: (x + ox * 0.5) * cell, y: (y + oy * 0.5) * cell, width_m: width, depth_m: seaLevel - Math.min(h[a], h[b]) });
  }
  const maxW = Math.min(2500, n * cell / 4);
  return [...best.values()].filter((s) => s.width_m <= maxW).sort((p, q2) => p.width_m - q2.width_m)
    .map((s) => ({ ...s, area_a_m2: sizes[s.a] * cell * cell, area_b_m2: sizes[s.b] * cell * cell }));
}

// ------------------------------------------------------------------------------------------------ climate
/** Smith & Barstad 2004 linear orographic precipitation (FFT), as an annual field in mm/yr. */
function orographic(h, n, cell, climate, seaLevel) {
  const m = Math.min(128, n), f = (n - 1) / (m - 1), M = m * 2, dx = cell * f, sb = C.SB;
  const re = new Float64Array(M * M), im = new Float64Array(M * M);
  let base = Infinity; for (let i = 0; i < h.length; i++) base = Math.min(base, h[i]);
  if (seaLevel != null) base = Math.max(base, seaLevel);
  const pad = (M - m) >> 1, taper = 12;
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    // extend the edge values and taper them to zero in the padding
    const ii = Math.min(m - 1, Math.max(0, i - pad)), jj = Math.min(m - 1, Math.max(0, j - pad));
    const dout = Math.max(Math.max(pad - i, i - (pad + m - 1), 0), Math.max(pad - j, j - (pad + m - 1), 0));
    const wgt = dout <= 0 ? 1 : Math.max(0, 1 - dout / taper);
    const z = Math.max(0, sampleGrid(h, n, ii * f, jj * f) - base);
    re[j * M + i] = z * (wgt * wgt * (3 - 2 * wgt));
  }
  fft2(re, im, M, false);
  const ang = climate.windDir, u = -sb.U * Math.cos(ang), v = -sb.U * Math.sin(ang);
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const kx = (i <= M / 2 ? i : i - M) * 2 * Math.PI / (M * dx), ky = (j <= M / 2 ? j : j - M) * 2 * Math.PI / (M * dx);
    const k = j * M + i, sig = u * kx + v * ky, k2 = kx * kx + ky * ky;
    if (Math.abs(sig) < 1e-12 || k2 === 0) { re[k] = 0; im[k] = 0; continue; }
    // (1 − i·m·Hw): propagating (σ² < N²) or evanescent
    let ar, ai;
    const q = (sb.NM * sb.NM - sig * sig) / (sig * sig) * k2;
    if (q > 0) { const mm = Math.sign(sig) * Math.sqrt(q); ar = 1; ai = -mm * sb.HW; }
    else { const mm = Math.sqrt(-q); ar = 1 + mm * sb.HW; ai = 0; }
    // (1 + iστc)(1 + iστf)
    const br = 1 - sig * sig * sb.TC * sb.TF, bi = sig * (sb.TC + sb.TF);
    const dr = ar * br - ai * bi, di = ar * bi + ai * br;
    // numerator Cw·i·σ·ĥ
    const nr = -sb.CW * sig * im[k], ni = sb.CW * sig * re[k];
    const den = dr * dr + di * di;
    re[k] = (nr * dr + ni * di) / den; im[k] = (ni * dr - nr * di) / den;
  }
  fft2(re, im, M, true);
  const P = new Float32Array(n * n), P0 = climate.P0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const pr = sampleGrid(re, M, pad + i / f, pad + j / f) * 3600;            // mm/h
    P[j * n + i] = P0 * Math.max(0.15, (sb.P_EVENT + pr) / sb.P_EVENT);
  }
  return P;
}
function sampleGrid(z, m, fx, fy) {
  fx = Math.min(m - 1.000001, Math.max(0, fx)); fy = Math.min(m - 1.000001, Math.max(0, fy));
  const x = fx | 0, y = fy | 0, tx = fx - x, ty = fy - y, i = y * m + x;
  return (z[i] * (1 - tx) + z[i + 1] * tx) * (1 - ty) + (z[i + m] * (1 - tx) + z[i + m + 1] * tx) * ty;
}
function fft1(re, im, off, stride, M, inv) {
  // iterative radix-2 on a strided line
  for (let i = 1, j = 0; i < M; i++) {
    let bit = M >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { const a = off + i * stride, b = off + j * stride; let t = re[a]; re[a] = re[b]; re[b] = t; t = im[a]; im[a] = im[b]; im[b] = t; }
  }
  for (let len = 2; len <= M; len <<= 1) {
    const ang = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < M; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = off + (i + k) * stride, b = off + (i + k + len / 2) * stride;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  if (inv) for (let i = 0; i < M; i++) { re[off + i * stride] /= M; im[off + i * stride] /= M; }
}
function fft2(re, im, M, inv) {
  for (let j = 0; j < M; j++) fft1(re, im, j * M, 1, M, inv);
  for (let i = 0; i < M; i++) fft1(re, im, i, M, M, inv);
}

// ------------------------------------------------------------------------------------------------ methods
/** sample() and crop() on a Terrain (also used after a structured clone from the worker) */
export function attachMethods(t) {
  const { n, cell_m } = t;
  t.sample = function sample(x, y) {
    const fx = Math.min(n - 1.000001, Math.max(0, x / cell_m)), fy = Math.min(n - 1.000001, Math.max(0, y / cell_m));
    const i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * n + i;
    const bl = (a) => (a[k] * (1 - tx) + a[k + 1] * tx) * (1 - ty) + (a[k + n] * (1 - tx) + a[k + n + 1] * tx) * ty;
    const near = (Math.round(fy) * n + Math.round(fx));
    return {
      h: bl(t.height), soil: bl(t.soil), slope: bl(t.slope), T: bl(t.T), P: bl(t.P), wet: bl(t.wetness),
      material: t.material[near], lithology: t.lithology[near], water: bl(t.water), waterKind: t.waterKind[near],
    };
  };
  t.crop = function crop(x0, y0, w_m, cells = 256, copt = {}) { return cropTerrain(t, x0, y0, w_m, cells, copt); };
  return t;
}

// ------------------------------------------------------------------------------------------------ crop
function cubic(p0, p1, p2, p3, t) {
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}
function bicubicClamped(a, n, fx, fy) {
  fx = Math.min(n - 1.000001, Math.max(0, fx)); fy = Math.min(n - 1.000001, Math.max(0, fy));
  const x = fx | 0, y = fy | 0, tx = fx - x, ty = fy - y;
  const at = (i, j) => a[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))];
  const r = [];
  for (let j = -1; j <= 2; j++) r.push(cubic(at(x - 1, y + j), at(x, y + j), at(x + 1, y + j), at(x + 2, y + j), tx));
  const v = cubic(r[0], r[1], r[2], r[3], ty);
  const c00 = at(x, y), c10 = at(x + 1, y), c01 = at(x, y + 1), c11 = at(x + 1, y + 1);
  return Math.min(Math.max(c00, c10, c01, c11), Math.max(Math.min(c00, c10, c01, c11), v));
}
/**
 * A focus window: (x0, y0) its SW corner in region metres, w_m its side, `cells` vertices per side.
 * Returns a Terrain-like object in crop-local coordinates (x0/y0 give the offset in the region), with the
 * same fields, rivers clipped and carved, and `rocks` (instances for boulders, scree blocks and tors).
 */
function cropTerrain(t, x0, y0, w_m, cells, copt) {
  const R = t.n, rc = t.cell_m, n = cells, N = n * n, c = w_m / (n - 1);
  const H = t.opts ? t.opts.roughness : 0.6, seed = hash32(t.opts ? t.opts.seed : 1, 99, 0xabc);
  const fx = (x) => (x0 + x) / rc, fy = (y) => (y0 + y) / rc;
  const out = { n, cell_m: c, size_m: w_m, x0, y0, seaLevel: t.seaLevel, isCrop: true, parent: { n: R, cell_m: rc } };
  const bl = (a, X, Y) => sampleGrid(a, R, X, Y);
  const near = (a, X, Y) => a[Math.min(R - 1, Math.max(0, Math.round(Y))) * R + Math.min(R - 1, Math.max(0, Math.round(X)))];
  const height = new Float32Array(N), slope0 = new Float32Array(N);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const X = fx(i * c), Y = fy(j * c), k = j * n + i;
    height[k] = bicubicClamped(t.height, R, X, Y);
    slope0[k] = Math.tan(bl(t.slope, X, Y));
  }
  // rivers clipped to the window (with a margin), in crop coordinates
  const margin = 30, rivers = [];
  const lines = t.rivers.concat((t.oxbows || []).map((o) => { const k = o.pts.length / 3; return { pts: o.pts, width: new Float32Array(k).fill(o.width), depth: new Float32Array(k).fill(Math.max(0.3, o.width / 18.8) ** (1 / 1.41)), order: 1, still: true }; }));
  for (const r of lines) {
    let cur = null;
    for (let p = 0; p < r.width.length; p++) {
      const x = r.pts[p * 3] - x0, y = r.pts[p * 3 + 1] - y0;
      const inside = x > -margin && y > -margin && x < w_m + margin && y < w_m + margin;
      if (inside) { if (!cur) cur = { pts: [], width: [], depth: [], order: r.order, still: !!r.still }; cur.pts.push(x, y, r.pts[p * 3 + 2]); cur.width.push(r.width[p]); cur.depth.push(r.depth[p]); }
      else if (cur) { if (cur.width.length > 1) rivers.push(cur); cur = null; }
    }
    if (cur && cur.width.length > 1) rivers.push(cur);
  }
  // densify river polylines to ≤ c/2 spacing, and rasterise distance-to-centreline for the channel mask
  const chDist = new Float32Array(N).fill(1e9), chIdx = new Int32Array(N).fill(-1), chT = new Float32Array(N);
  const segs = [];
  for (const r of rivers) {
    const P = r.pts, W = r.width, D = r.depth, dp = [], dw = [], dd = [];
    for (let p = 0; p < W.length - 1; p++) {
      const L = Math.hypot(P[p * 3 + 3] - P[p * 3], P[p * 3 + 4] - P[p * 3 + 1]), k = Math.max(1, Math.ceil(L / (c * 0.5)));
      for (let s = 0; s < k; s++) {
        const f = s / k;
        dp.push(P[p * 3] + (P[p * 3 + 3] - P[p * 3]) * f, P[p * 3 + 1] + (P[p * 3 + 4] - P[p * 3 + 1]) * f, P[p * 3 + 2] + (P[p * 3 + 5] - P[p * 3 + 2]) * f);
        dw.push(W[p] + (W[p + 1] - W[p]) * f); dd.push(D[p] + (D[p + 1] - D[p]) * f);
      }
    }
    const last = W.length - 1; dp.push(P[last * 3], P[last * 3 + 1], P[last * 3 + 2]); dw.push(W[last]); dd.push(D[last]);
    r.pts = Float32Array.from(dp); r.width = Float32Array.from(dw); r.depth = Float32Array.from(dd);
    segs.push(r);
  }
  for (let ri = 0; ri < segs.length; ri++) {
    const r = segs[ri];
    for (let p = 0; p < r.width.length; p++) {
      const px = r.pts[p * 3], py = r.pts[p * 3 + 1], reach = r.width[p] * 1.5 + 6;
      const i0 = Math.max(0, Math.floor((px - reach) / c)), i1 = Math.min(n - 1, Math.ceil((px + reach) / c));
      const j0 = Math.max(0, Math.floor((py - reach) / c)), j1 = Math.min(n - 1, Math.ceil((py + reach) / c));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * n + i, d = Math.hypot(i * c - px, j * c - py) / Math.max(0.5, r.width[p] * 0.5);
        if (d < chDist[k]) { chDist[k] = d; chIdx[k] = ri; chT[k] = p; }
      }
    }
  }
  // amplification: gradient-noise fBm, per-octave amplitude ∝ λ^H, held under 80 % of the coarse slope
  const lam0 = rc, oct = [];
  for (let lam = lam0; lam >= 2 * c && oct.length < 6; lam /= 2) oct.push(lam);
  const nOct = Math.max(1, oct.length);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, X = x0 + i * c, Y = y0 + j * c, S = slope0[k];
    let dz = 0;
    for (let o = 0; o < oct.length; o++) {
      const lam = oct[o];
      const aH = 0.12 * lam0 * Math.pow(lam / lam0, H) * 0.5;
      const aS = (0.8 / nOct) * S * lam / (2 * Math.PI * 1.2);
      dz += Math.min(aH, aS) * noise2(X / lam, Y / lam, seed + o * 7919);
    }
    const mask = smoothstep(1.0, 3.0, chDist[k]);
    height[k] += dz * mask;
  }
  // strata terraces on rock: a monotonic remap of height per rock type, z' = z + D(ζ), with D' = w(ζ)/w̄ − 1,
  // w = 0.15 + 1.7·[hard bed], band-limited (D minus its ±40 m running mean). Hard beds steepen into risers,
  // weak beds flatten into benches (Cordonnier 2018's weak 30° / hard 50° beds, resolved at focus scale).
  // Monotonic in z, so it cannot add a peak or a pit along any slope; masked to rock and scree.
  const zOffC = new Float32Array(N);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) zOffC[j * n + i] = bl(t.strataOffset, fx(i * c), fy(j * c));
  {
    const st = t.strata, mask = new Float32Array(N), litC = new Uint8Array(N);   // litC: nearest rock type
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, X = fx(i * c), Y = fy(j * c), m = near(t.material, X, Y);
      litC[k] = near(t.lithology, X, Y);
      mask[k] = (m === 0 ? 1 : m === 1 ? 0.45 : 0) * smoothstep(0.25, 0.6, slope0[k]) * (litC[k] === 0 ? 0 : 1); // granite is massive: no bed terraces (plant agent 2026-10-13; was 0.25)
    }
    // smooth the mask over ~6 m so the remap has no seams
    const rad = Math.max(1, Math.round(6 / c)), tmp = new Float32Array(N);
    for (let pass = 0; pass < 2; pass++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      let a = 0, m = 0;
      for (let d = -rad; d <= rad; d++) { const ii = pass ? i : Math.min(n - 1, Math.max(0, i + d)), jj = pass ? Math.min(n - 1, Math.max(0, j + d)) : j; a += (pass ? tmp : mask)[jj * n + ii]; m++; }
      (pass ? mask : tmp)[j * n + i] = a / m;
    }
    // the remap is evaluated at each of the four surrounding region cells with that cell's own rock type and
    // strata offset, then blended bilinearly: across a geology contact the offsets jump by up to kilometres
    // and an interpolated ζ would sweep through many beds within one region cell
    const Rc = t.n, off = t.strataOffset, lit = t.lithology;
    let zlo = Infinity, zhi = -Infinity;
    for (let k = 0; k < N; k++) {
      if (mask[k] < 0.01) continue;
      const X = fx((k % n) * c), Y = fy(Math.floor(k / n) * c), xi = Math.min(Rc - 2, Math.floor(X)), yi = Math.min(Rc - 2, Math.floor(Y));
      for (const kk of [yi * Rc + xi, yi * Rc + xi + 1, (yi + 1) * Rc + xi, (yi + 1) * Rc + xi + 1]) { const z = height[k] - off[kk]; if (z < zlo) zlo = z; if (z > zhi) zhi = z; }
    }
    if (zhi > zlo && zhi - zlo < 20000) {
      const step = 0.25, M = Math.ceil((zhi - zlo + 200) / step) + 1, z0 = zlo - 100;
      const tabs = [];
      for (let L = 0; L < 5; L++) {
        const Dz = new Float32Array(M), wv = new Float32Array(M); let acc = 0, wsum = 0;
        for (let q = 0; q < M; q++) { let zi = Math.round(z0 + q * step - st.zmin); zi = zi < 0 ? 0 : zi >= st.len ? st.len - 1 : zi; wv[q] = 0.15 + 1.7 * smoothstep(0.45, 0.8, st.tables[L][zi]); wsum += wv[q]; }
        const wbar = wsum / M;
        for (let q = 0; q < M; q++) { Dz[q] = acc; acc += (wv[q] / wbar - 1) * step; }
        // remove the ±40 m running mean so the remap stays within about a bed thickness; cap at ±8 m
        const R2 = Math.round(40 / step), pre = new Float64Array(M + 1);
        for (let q = 0; q < M; q++) pre[q + 1] = pre[q] + Dz[q];
        const out2 = new Float32Array(M);
        for (let q = 0; q < M; q++) { const a = Math.max(0, q - R2), b = Math.min(M, q + R2 + 1); out2[q] = Math.max(-8, Math.min(8, Dz[q] - (pre[b] - pre[a]) / (b - a))); }
        tabs.push(out2);
      }
      const Dat = (L, z) => { const u = (z - z0) / step, q = Math.min(M - 2, Math.max(0, u | 0)), f = u - q, T = tabs[L]; return T[q] * (1 - f) + T[q + 1] * f; };
      for (let k = 0; k < N; k++) {
        if (mask[k] < 0.01) continue;
        const X = Math.min(Rc - 1.000001, fx((k % n) * c)), Y = Math.min(Rc - 1.000001, fy(Math.floor(k / n) * c));
        const xi = Math.floor(X), yi = Math.floor(Y), tx = X - xi, ty = Y - yi, h0 = height[k];
        const k00 = yi * Rc + xi, k10 = k00 + 1, k01 = k00 + Rc, k11 = k01 + 1;
        const d = ((Dat(lit[k00], h0 - off[k00]) * (1 - tx) + Dat(lit[k10], h0 - off[k10]) * tx) * (1 - ty)
          + (Dat(lit[k01], h0 - off[k01]) * (1 - tx) + Dat(lit[k11], h0 - off[k11]) * tx) * ty) * mask[k];
        height[k] += d; zOffC[k] += d;
      }
    }
  }
  // carve channels: parabolic bed of bankfull depth under the bank line; water surface at mean depth
  const surf = new Float32Array(N).fill(-1e9);
  for (let k = 0; k < N; k++) {
    if (chDist[k] >= 1.6) continue;
    const r = segs[chIdx[k]], p = chT[k], d = chDist[k];
    const zb = r.pts[p * 3 + 2] - r.depth[p] * 0.5;                      // bank line (region surface at the cell)
    const bed = zb - r.depth[p] * (1 - Math.min(1, d) ** 2);
    if (d < 1) height[k] = Math.min(height[k], bed);
    else height[k] = Math.min(height[k], zb + (height[k] - zb) * smoothstep(1, 1.6, d));
    if (d < 1.15) surf[k] = zb - r.depth[p] * 0.45;
  }
  for (const r of segs) for (let p = 0; p < r.width.length; p++) r.pts[p * 3 + 2] = r.pts[p * 3 + 2] - r.depth[p] * 0.95;
  // fields
  const F = {};
  for (const key of ['soil', 'T', 'P', 'wetness', 'discharge', 'area', 'hardness', 'lake_level', 'northness']) {
    const a = t[key]; if (!a) continue;
    const o = new Float32Array(N);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) o[j * n + i] = bl(a, fx(i * c), fy(j * c));
    F[key] = o;
  }
  // nearest-cell categorical fields read at a noise-jittered position: organic boundaries
  const lithology = new Uint8Array(N), material = new Uint8Array(N), waterKind = new Uint8Array(N), water = new Float32Array(N), order = new Uint8Array(N);
  const slope = new Float32Array(N);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, X = x0 + i * c, Y = y0 + j * c;
    const jx = 0.55 * noise2(X / 23, Y / 23, seed + 1) + 0.25 * noise2(X / 7, Y / 7, seed + 2);
    const jy = 0.55 * noise2(X / 23, Y / 23, seed + 3) + 0.25 * noise2(X / 7, Y / 7, seed + 4);
    const XX = X / rc + jx, YY = Y / rc + jy;
    lithology[k] = near(t.lithology, XX, YY);
    material[k] = near(t.material, XX, YY);
    order[k] = near(t.order || new Uint8Array(R * R), X / rc, Y / rc);
    const xm = i > 0 ? k - 1 : k, xp = i < n - 1 ? k + 1 : k, ym = j > 0 ? k - n : k, yp = j < n - 1 ? k + n : k;
    const gx = (height[xp] - height[xm]) / ((xp - xm) * c), gy = (height[yp] - height[ym]) / (((yp - ym) / n) * c);
    slope[k] = Math.atan(Math.hypot(gx, gy));
  }
  // standing water: lake level / sea level where the surface lies below and the region says water
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, X = fx(i * c), Y = fy(j * c);
    const wk = near(t.waterKind, X, Y);
    let lv = -1e9, kind = 0;
    if (t.seaLevel != null) {
      // sea where any of the 4 nearest region cells is sea
      const xi = Math.floor(X), yi = Math.floor(Y);
      for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const kk = Math.min(R - 1, yi + b) * R + Math.min(R - 1, xi + a); if (t.waterKind[kk] === 3) { lv = t.seaLevel; kind = 3; } }
    }
    if (!kind) {
      const xi = Math.floor(X), yi = Math.floor(Y);
      for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const kk = Math.min(R - 1, yi + b) * R + Math.min(R - 1, xi + a); if (t.waterKind[kk] === 2) { lv = Math.max(lv, t.lake_level[kk]); kind = 2; } }
    }
    if (kind && height[k] < lv) { waterKind[k] = kind; water[k] = lv - height[k]; material[k] = 6; }
    else if (surf[k] > -1e8 && surf[k] > height[k]) { waterKind[k] = 1; water[k] = surf[k] - height[k]; }
    else if (wk === 1 && chDist[k] < 1) { waterKind[k] = 1; }
  }
  // local materials: cliffs from the local slope (the crop resolves faces the region smoothed), sand on
  // low shores, river gravel/sand bars in and beside wide channels
  // the cliff test reads the slope averaged over ~5 m (plant agent, 2026-10-13): per-cell slope on a 45–55° face flips
  // between cliff and scree every metre and drew a checkerboard
  const slopeS = new Float32Array(N);
  { const R = Math.max(1, Math.round(2.5 / c)), tmp = new Float32Array(N);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { let a = 0, m = 0; for (let d = -R; d <= R; d++) { const ii = Math.min(n - 1, Math.max(0, i + d)); a += slope[j * n + ii]; m++; } tmp[j * n + i] = a / m; }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { let a = 0, m = 0; for (let d = -R; d <= R; d++) { const jj = Math.min(n - 1, Math.max(0, j + d)); a += tmp[jj * n + i]; m++; } slopeS[j * n + i] = a / m; } }
  for (let k = 0; k < N; k++) {
    if (waterKind[k] >= 2) continue;
    const d = slopeS[k] * 180 / Math.PI;
    if (d >= 44 && material[k] !== 5) material[k] = 0;
    else if (d >= 38 && material[k] === 1) material[k] = 0;   // steep scree within a face reads as the face
    if (chDist[k] < 1.25 && chIdx[k] >= 0 && segs[chIdx[k]].width[chT[k] | 0] > 6 && d < 12 && waterKind[k] !== 1) material[k] = 4;
  }
  // beaches: within ~4–7 m of standing water on gentle ground (noise-modulated); region sand far from water
  // becomes soil or wet meadow at this scale
  {
    const wd = new Float32Array(N).fill(1e9);
    for (let k = 0; k < N; k++) if (waterKind[k] >= 2) wd[k] = 0;
    for (let pass = 0; pass < 2; pass++) {
      const fw = pass === 0, y0 = fw ? 0 : n - 1, y1 = fw ? n : -1, dy = fw ? 1 : -1;
      for (let y = y0; y !== y1; y += dy) for (let xi = 0; xi < n; xi++) {
        const x = fw ? xi : n - 1 - xi, k = y * n + x;
        for (const [ox, oy, w] of fw ? [[-1, 0, 1], [0, -1, 1], [-1, -1, SQ2], [1, -1, SQ2]] : [[1, 0, 1], [0, 1, 1], [1, 1, SQ2], [-1, 1, SQ2]]) {
          const xx = x + ox, yy = y + oy; if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
          const v = wd[yy * n + xx] + w * c; if (v < wd[k]) wd[k] = v;
        }
      }
    }
    for (let k = 0; k < N; k++) {
      if (waterKind[k] >= 2 || material[k] === 0 || material[k] === 5) continue;
      const X = x0 + (k % n) * c, Y = y0 + Math.floor(k / n) * c;
      const reach = 5.5 + 3 * noise2(X / 9, Y / 9, seed + 9);
      if (wd[k] < reach && slope[k] < 0.18) material[k] = 4;
      else if (material[k] === 4 && !(chDist[k] < 1.25) && wd[k] > 12) material[k] = F.wetness && F.wetness[k] >= C.TWI_WET ? 3 : 2;
    }
  }
  const soil = F.soil; for (let k = 0; k < N; k++) { if (material[k] === 0 || waterKind[k] >= 2) soil[k] = Math.min(soil[k], 0.02); }
  const bedrock = new Float32Array(N); for (let k = 0; k < N; k++) bedrock[k] = height[k] - soil[k];
  // hardness at the crop surface from the strata function
  F.strataOffset = zOffC;
  const st = t.strata, hard = new Float32Array(N);
  for (let k = 0; k < N; k++) { let zi = Math.round(bedrock[k] - F.strataOffset[k] - st.zmin); zi = zi < 0 ? 0 : zi >= st.len ? st.len - 1 : zi; hard[k] = st.tables[lithology[k]][zi]; }
  Object.assign(out, {
    height, bedrock, soil, slope, area: F.area, discharge: F.discharge, water, waterKind, wetness: F.wetness,
    lithology, hardness: hard, material, T: F.T, P: F.P, rivers: segs.filter((r) => !r.still).map((r) => ({ pts: r.pts, width: r.width, depth: r.depth, order: r.order })),
    oxbows: segs.filter((r) => r.still).map((r) => ({ pts: r.pts, width: r.width[0] })),
    lakes: t.lakes.filter((l) => l.x > x0 - 300 && l.y > y0 - 300 && l.x < x0 + w_m + 300 && l.y < y0 + w_m + 300),
    strataOffset: F.strataOffset, strata: t.strata, order, northness: F.northness, chDist,
    receiver: new Int32Array(N).fill(-1), stats: null, opts: t.opts,
  });
  attachCropMethods(out, t.sample);
  out.rocks = placeRocks(out, seed);
  return out;
}
/** sample()/crop()/parentSample on a crop (also after a structured clone from the worker) */
export function attachCropMethods(out, parentSample) {
  const n = out.n, c = out.cell_m;
  out.sample = function sample(x, y) {
    const X = Math.min(n - 1.000001, Math.max(0, x / c)), Y = Math.min(n - 1.000001, Math.max(0, y / c));
    const kk = Math.round(Y) * n + Math.round(X), b = (a) => sampleGrid(a, n, X, Y);
    return { h: b(out.height), soil: b(out.soil), slope: b(out.slope), T: b(out.T), P: b(out.P), wet: b(out.wetness), material: out.material[kk], lithology: out.lithology[kk], water: b(out.water), waterKind: out.waterKind[kk] };
  };
  out.crop = () => { throw new Error('crop of a crop: crop the region instead'); };
  out.parentSample = parentSample;   // region sampler: horizons beyond the window
  return out;
}
/** crop + light bake off the main thread: a persistent worker holds the region (plant agent, 2026-10-13) */
export function makeCropWorker(terrain) {
  if (typeof Worker === 'undefined') return null;
  let w;
  try { w = new Worker(new URL('./landscape-worker.js', import.meta.url), { type: 'module' }); } catch (e) { return null; }
  const { sample, crop, ...plain } = terrain;
  const rivers = plain.rivers; // keep functions out; arrays are copied (the main thread keeps its own)
  w.postMessage({ type: 'hold', terrain: { ...plain, rivers } });
  let id = 0; const pending = new Map();
  w.onmessage = (ev) => { const m = ev.data, p = pending.get(m.id); if (!p) return; pending.delete(m.id); m.type === 'error' ? p.reject(new Error(m.error)) : p.resolve(attachCropMethods(m.crop, terrain.sample)); };
  w.onerror = (e) => { for (const p of pending.values()) p.reject(e); pending.clear(); };
  return {
    crop(x0, y0, w_m, cells) { return new Promise((resolve, reject) => { const k = ++id; pending.set(k, { resolve, reject }); w.postMessage({ type: 'crop', id: k, x0, y0, w_m, cells }); }); },
    terminate() { w.terminate(); },
  };
}

/**
 * Rocks for a crop (Arches-style eroded Voronoi blocks are built by the renderer; here only placement):
 * Float32Array of [x, y, z, radius, kind, yaw, tilt, seed] per rock; kind 0 boulder (rounded), 1 scree block
 * (angular), 2 tor block (granite, stacked), 3 basalt prism block, 4 limestone slab. Densities chosen.
 */
function placeRocks(t, seed) {
  const { n, cell_m: c, material, lithology, height, slope } = t, out = [];
  const cellA = 2.0;                                        // candidate spacing 2 m (Poisson by hash)
  const m = Math.floor(t.size_m / cellA);
  const at = (x, y) => t.sample(x, y);
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
    const hsh = hash32(i, j, seed), r1 = (hsh & 0xffff) / 65536, r2 = (hsh >>> 16) / 65536;
    const x = (i + r1) * cellA, y = (j + r2) * cellA;
    const k = Math.min(n - 1, Math.round(y / c)) * n + Math.min(n - 1, Math.round(x / c));
    const mat = material[k], L = lithology[k], h3 = hash32(i, j, seed + 7), u = (h3 & 0xffff) / 65536, v = (h3 >>> 16) / 65536;
    let p = 0, rad = 0, kind = 0;
    if (mat === 7) { p = 0.35; rad = 0.35 + 1.3 * u * u; kind = L === 0 ? 0 : L === 3 ? 3 : 1; }
    else if (mat === 1) { p = 0.55; rad = 0.15 + 0.5 * u * u; kind = L === 3 ? 3 : 1; }
    else if (mat === 0 && slope[k] < 0.5) { p = L === 0 ? 0.2 : L === 2 ? 0.05 : 0.08; rad = 0.3 + 1.0 * u; kind = L === 0 ? 2 : L === 2 ? 4 : L === 3 ? 3 : 1; }
    else if (mat === 2 || mat === 3) { p = 0.004; rad = 0.3 + 0.6 * u; kind = L === 0 ? 0 : 1; }
    else if (mat === 4) { p = 0.003; rad = 0.15 + 0.3 * u; kind = 0; }
    if (v >= p) continue;
    const s = at(x, y);
    if (s.waterKind >= 2) continue;
    out.push(x, y, s.h - rad * 0.3, rad, kind, ((hsh >>> 8) & 1023) / 1023 * Math.PI * 2, (u - 0.5) * 0.4, hsh % 997);
    // tors: stack one or two more blocks on granite outcrops
    if (kind === 2 && u > 0.45) { out.push(x + 0.2, y - 0.1, s.h + rad * 1.1, rad * 0.75, 2, u * 6.28, 0.15, (hsh + 1) % 997); if (u > 0.8) out.push(x - 0.1, y, s.h + rad * 2.0, rad * 0.5, 2, v * 6.28, -0.1, (hsh + 2) % 997); }
  }
  return Float32Array.from(out);
}

// ------------------------------------------------------------------------------------------------ async
/** Runs generateTerrain in landscape-worker.js when Workers exist, otherwise on this thread. */
export function generateTerrainAsync(opts = {}, onProgress) {
  if (typeof Worker === 'undefined') return Promise.resolve(generateTerrain(opts, onProgress));
  return new Promise((resolve, reject) => {
    let worker;
    try { worker = new Worker(new URL('./landscape-worker.js', import.meta.url), { type: 'module' }); }
    catch (e) { resolve(generateTerrain(opts, onProgress)); return; }
    worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'progress') { if (onProgress) onProgress(m.f, m.stage); return; }
      worker.terminate();
      if (m.type === 'error') reject(new Error(m.error)); else resolve(attachMethods(m.terrain));
    };
    worker.onerror = (e) => { worker.terminate(); reject(e instanceof Error ? e : new Error(e.message || 'worker failed')); };
    worker.postMessage({ opts });
  });
}

// ------------------------------------------------------------------------------------------------ light bake
/** sun used by landscape-ground.js: from the south-west quarter (azimuth 235° from east, counter-clockwise), 38° up,
 *  as a three.js direction (x, y up, z = −north) */
export const SUN_DIR3 = (() => { const az = 235 * Math.PI / 180, el = 38 * Math.PI / 180; const v = [Math.cos(az) * Math.cos(el), Math.sin(el), -Math.sin(az) * Math.cos(el)], l = Math.hypot(...v); return { x: v[0] / l, y: v[1] / l, z: v[2] / l }; })();
/** cast shadow (soft, 0.55..1) and sky-view factor per vertex, interleaved [lit, sky] (pure; runs in the worker for
 *  the region, on the main thread for a crop). Moved here from landscape-ground.js unchanged. */
export function bakeLight(t, sunDir = SUN_DIR3, parentSample) {
  const { n, cell_m: c, height: h } = t, N = n * n, out = new Float32Array(N * 2);
  const at = (x, y) => {
    if (x >= 0 && y >= 0 && x <= (n - 1) * c && y <= (n - 1) * c) {
      const fx = Math.min(n - 1.0001, x / c), fy = Math.min(n - 1.0001, y / c), i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, k = j * n + i;
      return (h[k] * (1 - tx) + h[k + 1] * tx) * (1 - ty) + (h[k + n] * (1 - tx) + h[k + n + 1] * tx) * ty;
    }
    if (parentSample) return parentSample(x + t.x0, y + t.y0).h;
    return -1e9;
  };
  // sun direction in terrain coords: (x, y, up) = (sx, −sz, sy)
  const sx = sunDir.x, sy = -sunDir.z, sz = sunDir.y, hl = Math.hypot(sx, sy), ux = sx / hl, uy = sy / hl, tanS = sz / hl;
  const dirs = 8, steps = [];
  for (let d = c, k = 0; k < 28; k++, d *= 1.28) steps.push(d);
  const reach = parentSample ? 3000 : (n - 1) * c;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = i * c, y = j * c, z = h[k] + 0.5;
    let lit = 1;
    for (const d of steps) { if (d > reach) break; const hz = at(x + ux * d, y + uy * d); if (hz - z > tanS * d) { lit = 0; break; } }
    let sky = 0;
    for (let q = 0; q < dirs; q++) {
      const a = q * Math.PI * 2 / dirs, dx = Math.cos(a), dy = Math.sin(a);
      let mx = 0;
      for (let s = 0; s < steps.length; s += 2) { const d = steps[s]; if (d > reach) break; const hz = at(x + dx * d, y + dy * d); const tn = (hz - z) / d; if (tn > mx) mx = tn; }
      sky += 1 - Math.sin(Math.atan(mx));
    }
    out[k * 2] = lit; out[k * 2 + 1] = sky / dirs;
  }
  // soften the binary shadow by a 3×3 blur
  const s2 = new Float32Array(N);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let a = 0, m = 0;
    for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) { const ii = i + e, jj = j + b; if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue; a += out[(jj * n + ii) * 2]; m++; }
    s2[j * n + i] = a / m;
  }
  for (let k = 0; k < N; k++) out[k * 2] = 0.55 + 0.45 * s2[k];
  return out;
}
