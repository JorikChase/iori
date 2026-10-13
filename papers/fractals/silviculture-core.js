/*
 * silviculture-core.js — the module-scale simulation (no rendering) of a browser reimplementation of
 *   Makowski, Hädrich, Scheffczyk, Michels, Pirk, Pałubicki,
 *   "Synthetic Silviculture: Multi-scale Modeling of Plant Ecosystems", ACM TOG 38(4) 131, SIGGRAPH 2019,
 * with the bud-scale rules it defers to from Pałubicki et al., "Self-organizing tree models", SIGGRAPH 2009.
 *
 * Used by silviculture.js (the forest figure), silviculture-specimens.js (plant windows) and
 * silviculture-env.js (terrain, climate and the coarse ecosystem, which is calibrated from this model).
 *
 * ---------------------------------------------------------------------------------------------------------
 * WHAT IS FAITHFUL (paper equation / section in brackets)
 *  - Three tiers: branch module -> plant (a tree of modules) -> ecosystem (§3).
 *  - Per-module light Q(u) = exp(-f_collisions(u)), f = sum of bounding-sphere intersection volumes (Eq. 1).
 *  - A shadow grid shared by ALL plants: a module darkens the cells beneath it, and
 *    Q_eff = lerp(s_tol, 1, Q * Q_G) (§6.2), so plants of both species shade each other.
 *  - Extended Borchert-Honda: basipetal sum of Q, acropetal split v_m = v·λQ_m / (λQ_m + (1-λ)Q_l) (Eq. 2),
 *    root vigour clamped to v̄_rootmax; v_base = α·Q_base as in Pałubicki 2009 §4.2.
 *  - Growth rate Υ = S((v̄ - v̄_min)/(v̄_max - v̄_min))·g_p with S(x) = 3x² - 2x³ (Eq. 5), forward-Euler
 *    physiological age until a_mature (Eq. 6).
 *  - A mature module hands q = Q(u)/#terminals to each free terminal, BH splits the module's vigour again among
 *    its children and terminals, and a new module attaches where a terminal's vigour exceeds v̄_min (§5.3).
 *  - Segment length ℓ_b = min(ℓ_max, β·a_b) with a_b = max(0, a_u - a_n) (Eq. 9); pipe model d = sqrt(Σ d_c²),
 *    φ at tips (Eqs. 7-8); widths never shrink (Pałubicki 2009 §4.5).
 *  - Tropism as a positional offset τ(a_b) = g1·g_dir·g2/(a_b + g1) (Eq. 10).
 *  - New modules oriented by minimising ω1·f_collisions + ω2·f_tropism over four perturbations of the start
 *    direction, a few steps (Eqs. 3-4, App. A.1).
 *  - Module type picked by nearest prototype (Voronoi) in the (λ, D') morphospace, D' = v̄(parent)·D/v̄_max;
 *    at flowering age F_eff = F_age·v̄_rootmax/v̄_root the plant switches to λ_mature, D_mature (§5.2.2, §6.3).
 *  - Ecosystem: Gaussian seeding around flowering plants at the species' seeding frequency and radius, seeds
 *    establish only where light allows, senescence ramps v̄_rootmax to zero after p_max, and a plant dies when
 *    no module is left (starvation or age) (§5.2.1, §6.3).
 *  - Species constants from Table 4 (rows n and i) and plasticity values from Table 3 (Fig. 19 shrub for the
 *    pioneer: 5 seeds/yr, radius 8 m, s_tol 0.15; Fig. 19 conifer for the tolerant species: 2, 3 m, 0.45).
 *
 * SUBSTITUTIONS AND SIMPLIFICATIONS
 *  - The paper's nine prototypes are published only as pictures. This file generates its own nine on a 3×3 grid
 *    of the (λ, D) morphospace: low D = sympodial fork with no continuing apex, middle D = short axis with one or
 *    two laterals, high D = monopodial axis with a whorl; high λ = short, wide-angled laterals.
 *  - Light is counted only for modules that still carry foliage (a live free terminal). A bud drops its leaves
 *    when its vigour per live bud of its module falls below FOLIAGE·v̄_min, and the shedding rule "v̄ < v̄_min"
 *    is read with v̄ = v/N, N = foliage-bearing modules in the subtree: a branch is shed once nothing on it
 *    carries foliage. Counting light on bare trunk modules (as the paper's Q(u) does) lets a bare pole feed its
 *    own tip forever; testing raw flow against v̄_min kills a capped plant at the root before its tips.
 *  - In the BH split, Table 4's λ is compressed toward 0.5, λ' = 0.5 + (λ - 0.5)·LAM_K: applied at every module
 *    split, λ = 0.87..0.96 compounds into a bare whip. Table 4's λ is used unchanged in the morphospace.
 *  - Stature cost (an addition, not in either paper): v_root = min(α·S - K_H·height, v̄_rootmax). Without it a
 *    tree that keeps a few leafy modules at the top of a bare stem out-climbs the canopy without limit.
 *  - Shadow: each foliage-bearing module deposits optical depth K_SH per live bud in the cells under its bounding
 *    sphere, one layer below it; the depth accumulates downward and spreads sideways by a 3×3 blur per layer
 *    (the widening shadow pyramid of Pałubicki 2009 §4.1, in place of the paper's straight column, which made
 *    narrow crowns shade their own trunk to darkness); Q_G = exp(-depth).
 *  - Orientation: the four Euler perturbations are applied as rotations of the start direction in two
 *    perpendicular planes; f_tropism = (sin α - cos θ)², θ the zenith angle, i.e. Table 4's α is read as the
 *    preferred elevation above the horizontal (its negative entries then mean drooping branches); the main
 *    axis (apical chain from the root) targets the vertical with weight max(ω2, W_AXIS).
 *  - Table 4's g1 column carries both signs; its sign is read as lift (+) or droop (-) and |g1| as the decay
 *    constant of Eq. 10, with |g2| = K_TAU.
 *  - Architectures (ours, after Hallé & Oldeman 1978): besides the paper's nine prototypes ('makowski', the default),
 *    a species may name an architecture (massart, roux, rauh, troll, attims, leeuwenberg, corner, collar) that gives
 *    its trunk modules and its branch modules their own generated prototypes and its branches their own elevation
 *    target; see the table above ARCH. The forest figure uses only the default and is unchanged by them.
 *  - Hmax (ours, JABOWA-style): a species height asymptote; each module's growth is multiplied by
 *    max(0, 1 − (height/Hmax)²). Without it rows that never switch to λ_mature grow 50–70 m poles.
 *  - sprout (ours): when a branch is shed, its parent's bud survives as a dormant bud with this probability.
 *  - reit (ours): reiteration — a vigorous lateral bud (v·#live > REIT·v̄_min = 3) of a flowering plant starts a
 *    new trunk (an orthotropic axis).
 *  - stemD (ours): a stem-diameter floor for unbranched palms (the pipe model alone gives one tip's diameter).
 *  - Dropped here: climate Gaussians (adaptation o = 1), terrain, soil maps, LOD — they live in silviculture-focus.js
 *    and silviculture-region.js for the environment figure. Flat square plot, no wrap-around.
 *  - Collisions skip a module's own parent and children (they always touch at the attachment node).
 *  - Exact caching: a module's overlap is recomputed only when a hash cell within reach changed, positions only
 *    for modules that grew or whose parent moved, the pipe model only along paths where something grew.
 *
 * CONSTANTS CHOSEN HERE (the paper is silent on each)
 *  DT = 1 yr            one simulation step is one year (the paper's units for AGE and seeding are years).
 *  DT_PHYS = 3          physiological time per year in Eq. 6, so a vigorous tolerant leader adds a module every ~3 yr.
 *  A_MATURE = 1         module maturity age; node birth ages run 0..0.5 so segments finish before maturity.
 *  ALPHA_BH = 2         v_base = α·Q_base, the value of Pałubicki 2009 Fig. 7.
 *  V_MIN = 1, V_MAX = 3 vigour thresholds of Eq. 5; with α = 2 a lone module needs Q_eff ≳ 0.5 to keep foliage.
 *  FOLIAGE = 0.8        foliage is dropped below 0.8·v̄_min per live bud (spawning needs the full v̄_min).
 *  LAM_K = 0.25         compression of λ in the BH split (see above).
 *  K_H = 0.05           stature cost per metre of height, in vigour units (see above).
 *  CAP_SCALE = 0.2      Table 4's v̄_rootmax (42..900) × 0.2, so an open-grown tolerant tree carries ~400 modules.
 *  C_COL = 0.6          weight of the normalised sphere overlap in Q = exp(-C_COL·Σ V∩/V_u).
 *  K_SH = 0.2           optical depth per live bud in the shadow grid; a closed canopy passes a few per cent.
 *  SH_CELL = 1 m        shadow grid cell, 48 layers; HC = 1 m hash cell for the sphere tests.
 *  S_EST = 0.6          a seed establishes where lerp(s_tol, 1, Q_G at the ground) ≥ 0.6.
 *  STEM_GAP = 1 m       a seed is rejected within 1 m of a living stem (the paper's "blocked cell").
 *  SIGMA = radius/2     Gaussian σ of seed placement, so ~86 % of seeds land within the seeding radius.
 *  F_MIN = 5 yr         earliest flowering, since row n has F_age = 0.
 *  SEN_RAMP             senescence ramps v̄_rootmax to zero over max(5, 0.1·p_max) years.
 *  K_TAU = 0.12         |g2| of Eq. 10 in module lengths.
 *  D_TIP = 0.008 m      tip diameter is φ·D_TIP.
 *  L (per species)      module length in metres: 0.85 (pioneer), 0.8 (tolerant).
 *  ω1 = 1, W_AXIS = 0.6 collision weight and leader tropism floor of the orientation search; step 0.3 rad,
 *                       halved on failure, 4 steps.
 *  PLOT = 32 m          square plot; seeds landing outside are lost.  MAX_PLANTS = 600 safety cap.
 *  MAX_MODULES = 25000  safety cap: no new modules beyond it. Only reached at very high shade tolerance
 *                       (s_tol ≳ 0.8), where nothing thins and the stand packs (the paper's Fig. 7 "tightly packed").
 *  Initial forest: 70 seeds placed uniformly at random; the "tolerant share" slider sets the species mix.
 *
 * Reference port consulted: wlejon/broflora (C++20, MIT License, Copyright (c) wlejon) — its N-child vigour
 * split, Beer-Lambert shadow stamping and light-gated recruitment informed the choices above; no code copied.
 * ---------------------------------------------------------------------------------------------------------
 */

// ------------------------------------------------------------------------------------------- constants
const DT = 1, DT_PHYS = 3, A_MATURE = 1, ALPHA_BH = 2, V_MIN = 1, V_MAX = 3, LAM_K = 0.25, FOLIAGE = 0.8, K_H = 0.05;
const CAP_SCALE = 0.2, C_COL = 0.6, K_SH = 0.2, S_EST = 0.6, STEM_GAP = 1.0, F_MIN = 5, K_TAU = 0.12;
const D_TIP = 0.008, W_COL = 1, W_AXIS = 0.6, REIT = 3, PLOT = 32, HALF = PLOT / 2, MAX_PLANTS = 600, MAX_MODULES = 25000, N_INIT = 70;
const SH_CELL = 1, SH_NX = Math.ceil(PLOT / SH_CELL), SH_NY = 48;
const HC = 1.0, HNX = Math.ceil(PLOT / HC), HNY = Math.ceil(SH_NY / HC);
const WOOD = 600; // kg/m³, only for the chart's mass axis
const DEG = Math.PI / 180, TAU2 = Math.PI * 2;

// Table 4 rows + Table 3 plasticity. n: fast short-lived shrub/pioneer. i: slow long-lived shade-tolerant tree.
const SPECIES = [
  { key: 'pioneer', label: 'pioneer', row: 'n', pmax: 52, vRootMax: 200, gp: 0.55, lam: 0.96, lamM: 0.43, D: 0.48, DM: 0.7,
    Fage: 0, alpha: -0.27, w2: 0.43, g1: 0.73, phi: 1.5, beta: 2.5, seedFreq: 5, seedRadius: 8, sTol: 0.15, L: 0.85,
    leafHex: 0xa3b06e, leafSize: 0.55, chartHex: '#b0883a' },
  { key: 'tolerant', label: 'tolerant', row: 'i', pmax: 950, vRootMax: 900, gp: 0.12, lam: 0.87, lamM: 0.34, D: 0.93, DM: 0.55,
    Fage: 57, alpha: 0.66, w2: 0.14, g1: 0.2, phi: 1.41, beta: 1.29, seedFreq: 2, seedRadius: 3, sTol: 0.45, L: 0.8,
    leafHex: 0x5f7f5b, leafSize: 0.75, chartHex: '#3d6b4c' },
];

// Makowski et al. 2019, Table 4, all sixteen rows: p_max, v̄_rootmax, g_p, λ, λ_mature, D, D_mature, F_age, α, ω2, g1, φ, β
// (a "–" in the table, no mature value, is stored as the juvenile value).
const TABLE4 = {
  a: [20, 42, 0.19, 0.62, 0.62, 0.25, 0.25, 0, 0.52, 0.63, -0.38, 0.57, 0.47],
  b: [200, 78, 0.30, 0.84, 0.84, 1.0, 1.0, 0, 0.52, 0.63, -1.2, 1.00, 0.79],
  c: [80, 11, 0.80, 1.0, 1.0, 1.0, 1.0, 0, 0.9, 0.5, 1.0, 5.00, 1.95],
  d: [16, 1.7, 0.23, 0.44, 0.44, 0.31, 0.31, 0, 1.0, 1.0, 1.0, 5.00, 3.00],
  e: [430, 600, 0.15, 1.0, 0.5, 1.0, 0.33, 58, 0.52, 0.63, 0.56, 3.00, 1.23],
  f: [550, 450, 0.20, 0.76, 0.76, 0.82, 0.82, 0, 0.17, 0.5, 0.47, 1.20, 1.90],
  g: [550, 700, 0.20, 0.9, 0.5, 0.93, 0.74, 55, 0.17, 0.5, 0.47, 1.38, 0.94],
  h: [500, 570, 0.24, 1.0, 0.5, 1.0, 0.5, 55, 0.5, 0.27, -0.66, 1.38, 1.29],
  i: [950, 900, 0.12, 0.87, 0.34, 0.93, 0.55, 57, 0.66, 0.14, 0.2, 1.41, 1.29],
  j: [950, 600, 0.14, 1.0, 0.5, 1.0, 0.51, 57, 0.45, 0.63, -0.9, 0.82, 0.93],
  k: [950, 600, 0.14, 1.0, 0.5, 1.0, 0.51, 57, -0.2, 0.63, -0.9, 0.82, 0.93],
  l: [1000, 815, 0.19, 0.92, 0.7, 0.59, 0.56, 80, -0.19, 0.72, -0.21, 5.00, 1.54],
  m: [130, 400, 0.21, 0.88, 0.43, 0.9, 0.7, 66, 0.85, 0.55, 0.9, 1.42, 1.11],
  n: [52, 200, 0.55, 0.96, 0.43, 0.48, 0.7, 0, -0.27, 0.43, 0.73, 1.50, 2.50],
  o: [300, 600, 0.20, 0.8, 0.8, 0.86, 0.86, 0, -0.19, 0.81, 1.0, 1.00, 1.60],
  p: [450, 450, 0.15, 1.0, 0.5, 0.66, 0.33, 135, 0.52, 0.32, 0.42, 1.50, 1.06],
};
// Table 3 plasticity sets: seeding frequency (/yr), seeding radius (m), shade tolerance, T_A (°C), P_A (mm).
const TABLE3 = {
  shrub: [5.0, 8.0, 0.15, 8.0, 672], conifer: [2.0, 3.0, 0.45, 12.0, 672], deciduous: [1.0, 3.0, 0.6, 16.0, 672],
  fig7dense: [3.0, 1.0, 0.9, 28.0, 4100], fig7sparse: [3.0, 9.0, 0.1, 28.0, 4100],
};
/** A species object from a Table 4 row and a Table 3 plasticity set, plus look and module length (ours). */
function speciesFromTable(row, plast, extra = {}) {
  const t = TABLE4[row], q = TABLE3[plast];
  return { key: row, label: row, row, pmax: t[0], vRootMax: t[1], gp: t[2], lam: t[3], lamM: t[4], D: t[5], DM: t[6], Fage: t[7],
    alpha: t[8], w2: t[9], g1: t[10], phi: t[11], beta: t[12], seedFreq: q[0], seedRadius: q[1], sTol: q[2], TA: q[3], PA: q[4],
    L: 0.85, leafHex: 0x6f8a5f, leafSize: 0.6, chartHex: '#5f7a52', ...extra };
}

// ------------------------------------------------------------------------------------------- PRNG
function makeRng(seed) {
  let a = (seed >>> 0) || 1, b = 0x9e3779b9, c = 0x243f6a88, d = 0xb7e15162;
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 16; i++) next();
  let spare = 0, has = false;
  const gauss = () => {
    if (has) { has = false; return spare; }
    let u, v, s;
    do { u = next() * 2 - 1; v = next() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
    const m = Math.sqrt(-2 * Math.log(s) / s); spare = v * m; has = true; return u * m;
  };
  return { next, gauss };
}

// ------------------------------------------------------------------------------------------- prototypes
// Nine generated branch modules on a 3×3 grid of the (λ, D) morphospace. Local frame: axis +Y, unit length.
function makeProto(id, lam, D) {
  const P = [], X = [], Y = [], Z = [], terms = [];
  const add = (p, x, y, z) => { P.push(p); X.push(x); Y.push(y); Z.push(z); return P.length - 1; };
  const arm = (b, th, az, len, bend) => { // two segments, the second bent up by `bend`
    const s1 = Math.sin(th), c1 = Math.cos(th);
    const m = add(b, X[b] + 0.5 * len * s1 * Math.cos(az), Y[b] + 0.5 * len * c1, Z[b] + 0.5 * len * s1 * Math.sin(az));
    const th2 = Math.max(0, th - bend), s2 = Math.sin(th2), c2 = Math.cos(th2);
    return add(m, X[m] + 0.5 * len * s2 * Math.cos(az), Y[m] + 0.5 * len * c2, Z[m] + 0.5 * len * s2 * Math.sin(az));
  };
  const r = add(-1, 0, 0, 0);
  const spread = (32 + 40 * lam) * DEG;      // excurrent: laterals leave nearly horizontally
  const latLen = 0.62 - 0.3 * lam;           // excurrent: short laterals
  const GA = 137.5 * DEG;
  if (D < 1 / 3) {                           // sympodial: short stem, fork, no continuing apex
    const s = add(r, 0, 0.3, 0);
    const n = lam > 0.5 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const th = i === 0 ? spread * 0.28 : spread * 0.8;
      terms.push(arm(s, th, i * TAU2 / n + 0.4, i === 0 ? 0.62 : 0.62 * (1.05 - 0.35 * lam), 14 * DEG));
    }
  } else if (D < 2 / 3) {                    // short axis with one or two laterals
    const a1 = add(r, 0.02, 0.38, 0), a2 = add(a1, -0.01, 0.78, 0.02);
    terms.push(a2);
    const n = lam > 0.5 ? 1 : 2;
    for (let i = 0; i < n; i++) terms.push(arm(a1, spread, i * Math.PI + 0.2, latLen * 1.1, 16 * DEG));
  } else {                                   // monopodial axis with a whorl
    const a1 = add(r, 0.01, 0.34, 0), a2 = add(a1, -0.01, 0.68, 0.01), a3 = add(a2, 0.01, 1.0, -0.01);
    terms.push(a3);
    terms.push(arm(a1, spread, 0, latLen, 16 * DEG));
    const n = lam > 0.5 ? 2 : 3;
    for (let i = 0; i < n; i++) terms.push(arm(a2, spread * 0.92, (i + 1) * GA, latLen * 0.85, 16 * DEG));
  }
  return finishProto(id, lam, D, P, X, Y, Z, terms);
}
function finishProto(id, lam, D, P, X, Y, Z, terms, extra = {}) {
  const n = P.length;
  const len = new Float32Array(n), dx = new Float32Array(n * 3), path = new Float32Array(n), aBirth = new Float32Array(n);
  let pmax = 0;
  for (let j = 1; j < n; j++) {
    const p = P[j], ex = X[j] - X[p], ey = Y[j] - Y[p], ez = Z[j] - Z[p], l = Math.hypot(ex, ey, ez);
    len[j] = l; dx[j * 3] = ex / l; dx[j * 3 + 1] = ey / l; dx[j * 3 + 2] = ez / l;
    path[j] = path[p] + l; pmax = Math.max(pmax, path[j]);
  }
  for (let j = 0; j < n; j++) aBirth[j] = 0.5 * path[j] / pmax;
  let cx = 0, cy = 0, cz = 0;
  for (let j = 0; j < n; j++) { cx += X[j]; cy += Y[j]; cz += Z[j]; }
  cx /= n; cy /= n; cz /= n;
  let rF = 0;
  for (let j = 0; j < n; j++) rF = Math.max(rF, Math.hypot(X[j] - cx, Y[j] - cy, Z[j] - cz));
  const termOf = new Int8Array(n).fill(-1);
  terms.forEach((t, k) => { termOf[t] = k; });
  return { id, lam, D, axisTerm: 0, ...extra, n, nT: terms.length, P: Int16Array.from(P), len, dx, aBirth, terms: Int16Array.from(terms), termOf,
    cyF: Math.hypot(cx, cy, cz), rF };
}
const PROTOS = [];
for (const D of [0.15, 0.5, 0.85]) for (const lam of [0.35, 0.65, 0.95]) PROTOS.push(makeProto(PROTOS.length, lam, D));
function pickProto(lam, D) {
  let best = PROTOS[0], bd = Infinity;
  for (const p of PROTOS) { const d = (p.lam - lam) ** 2 + (p.D - D) ** 2; if (d < bd) { bd = d; best = p; } }
  return best;
}


// ------------------------------------------------------------------------------------------- architectures
// Hallé & Oldeman (1978) architectural models, read as a trunk prototype, a branch prototype and a branch tropism
// (the mapping is ours; the paper's nine prototypes stay the default "makowski" architecture). What separates the
// models is the difference between the orthotropic trunk and the branches:
//   massart     monopodial trunk, rhythmic whorls of plagiotropic (flat) branches      → layered conifer (fir)
//   roux        monopodial trunk, continuous plagiotropic branching                      → spire conifer (spruce)
//   rauh        rhythmic whorls of orthotropic branches that repeat the trunk            → round/ovoid crown (oak, pine)
//   troll       sympodial arching axes, the trunk built by relays that rise from the arch → vase/arching crown (elm)
//   attims      continuous orthotropic branching close to the trunk                      → columnar crown (poplar)
//   leeuwenberg sympodial equal forks, no continuing leader                              → candelabra / rounded dome
//   corner      one unbranched axis with a terminal crown                                → palm
//   collar      a basal collar of several stems (basitonic), each stem a small rauh axis  → multi-stem shrub
// Each architecture also names its leaf type for drawing: broad, needle or frond.
const ALL_PROTOS = PROTOS.slice();
function build(fn, lam, D, extra) {
  const P = [], X = [], Y = [], Z = [], terms = [];
  const add = (p, x, y, z) => { P.push(p); X.push(x); Y.push(y); Z.push(z); return P.length - 1; };
  const arm = (b, th, az, len, bend) => {
    const s1 = Math.sin(th), c1 = Math.cos(th);
    const m = add(b, X[b] + 0.5 * len * s1 * Math.cos(az), Y[b] + 0.5 * len * c1, Z[b] + 0.5 * len * s1 * Math.sin(az));
    const th2 = th - bend, s2 = Math.sin(th2), c2 = Math.cos(th2);
    return add(m, X[m] + 0.5 * len * s2 * Math.cos(az), Y[m] + 0.5 * len * c2, Z[m] + 0.5 * len * s2 * Math.sin(az));
  };
  add(-1, 0, 0, 0);
  fn(add, arm, terms, X, Y, Z);
  const pr = finishProto(ALL_PROTOS.length, lam, D, P, X, Y, Z, terms, extra);
  ALL_PROTOS.push(pr);
  return pr;
}
const GA_ = 137.5 * DEG;
const ARCH = {
  makowski: { leaf: 'broad' },
  massart: {
    leaf: 'needle', latElev: -0.05,
    axis: build((add, arm, T) => { const a1 = add(0, 0, 0.5, 0), a2 = add(a1, 0, 1.0, 0); T.push(a2); for (let i = 0; i < 5; i++) T.push(arm(a1, 84 * DEG, i * TAU2 / 5 + 0.3, 0.95, -6 * DEG)); }, 0.95, 0.9),
    branch: build((add, arm, T) => { const a1 = add(0, 0, 0.5, 0), a2 = add(a1, 0, 1.0, 0); T.push(a2); T.push(arm(a1, 55 * DEG, 0, 0.5, 0)); T.push(arm(a1, 55 * DEG, Math.PI, 0.5, 0)); }, 0.9, 0.9),
  },
  roux: {
    leaf: 'needle', latElev: -0.18,
    axis: build((add, arm, T) => { const a1 = add(0, 0, 0.3, 0), a2 = add(a1, 0, 0.6, 0), a3 = add(a2, 0, 0.9, 0); T.push(a3); T.push(arm(a1, 82 * DEG, 0, 0.85, -10 * DEG)); T.push(arm(a2, 82 * DEG, GA_, 0.72, -10 * DEG)); T.push(arm(a3, 80 * DEG, 2 * GA_, 0.6, -10 * DEG)); }, 0.95, 0.95),
    branch: build((add, arm, T) => { const a1 = add(0, 0, 0.45, 0), a2 = add(a1, 0, 0.9, 0); T.push(a2); T.push(arm(a1, 60 * DEG, Math.PI / 2, 0.35, 0)); T.push(arm(a1, 60 * DEG, -Math.PI / 2, 0.35, 0)); }, 0.9, 0.9),
  },
  rauh: {
    leaf: 'broad', latElev: 0.85,
    axis: build((add, arm, T) => { const a1 = add(0, 0, 0.45, 0), a2 = add(a1, 0, 0.9, 0); T.push(a2); for (let i = 0; i < 3; i++) T.push(arm(a1, 48 * DEG, i * TAU2 / 3, 0.55, 14 * DEG)); }, 0.75, 0.85),
    branch: build((add, arm, T) => { const a1 = add(0, 0, 0.4, 0), a2 = add(a1, 0, 0.75, 0); T.push(a2); for (let i = 0; i < 2; i++) T.push(arm(a1, 45 * DEG, i * Math.PI + 0.5, 0.5, 12 * DEG)); }, 0.7, 0.8),
  },
  troll: {
    leaf: 'broad', latElev: 0.12,
    // the arch (terminal 0) leans out and is plagiotropic; the relay (terminal 1) rises from its back and carries the trunk
    axis: build((add, arm, T) => { const a1 = add(0, 0, 0.35, 0); T.push(arm(a1, 62 * DEG, 0, 0.75, -22 * DEG)); T.push(arm(a1, 14 * DEG, Math.PI, 0.55, 6 * DEG)); }, 0.6, 0.5, { axisTerm: 1 }),
    branch: build((add, arm, T) => { const a1 = add(0, 0.05, 0.3, 0); T.push(arm(a1, 70 * DEG, 0, 0.6, -25 * DEG)); T.push(arm(a1, 35 * DEG, Math.PI, 0.4, 0)); }, 0.55, 0.4),
  },
  attims: {
    leaf: 'broad', latElev: 1.25,
    axis: build((add, arm, T) => { const a1 = add(0, 0, 0.33, 0), a2 = add(a1, 0, 0.66, 0), a3 = add(a2, 0, 1.0, 0); T.push(a3); T.push(arm(a1, 24 * DEG, 0, 0.5, 4 * DEG)); T.push(arm(a2, 22 * DEG, GA_, 0.45, 4 * DEG)); T.push(arm(a3, 20 * DEG, 2 * GA_, 0.4, 4 * DEG)); }, 0.9, 0.95),
    branch: build((add, arm, T) => { const a1 = add(0, 0, 0.35, 0), a2 = add(a1, 0, 0.7, 0); T.push(a2); T.push(arm(a1, 22 * DEG, 0, 0.35, 0)); }, 0.85, 0.9),
  },
  leeuwenberg: {
    leaf: 'broad', latElev: 0.75, noLeader: true,
    axis: build((add, arm, T) => { const s = add(0, 0, 0.38, 0); for (let i = 0; i < 3; i++) T.push(arm(s, 34 * DEG, i * TAU2 / 3 + 0.2, 0.5, 6 * DEG)); }, 0.5, 0.1, { axisTerm: -1 }),
    branch: build((add, arm, T) => { const s = add(0, 0, 0.34, 0); for (let i = 0; i < 3; i++) T.push(arm(s, 30 * DEG, i * TAU2 / 3 + 0.2, 0.42, 6 * DEG)); }, 0.5, 0.1, { axisTerm: -1 }),
  },
  corner: {
    leaf: 'frond',
    axis: build((add, arm, T) => { const a1 = add(0, 0.02, 0.5, 0), a2 = add(a1, 0, 1.0, 0.01); T.push(a2); }, 1, 1),
  },
  collar: {
    leaf: 'broad', latElev: 0.9, multiStem: true,
    root: build((add, arm, T) => { for (let i = 0; i < 5; i++) T.push(arm(0, (16 + 7 * (i % 3)) * DEG, i * TAU2 / 5 + 0.4, 0.22, 0)); }, 0.5, 0.5),
  },
};
ARCH.rauh.root = null; ARCH.collar.axis = ARCH.rauh.axis; ARCH.collar.branch = ARCH.rauh.branch;
const MAX_NODES = ALL_PROTOS.reduce((m, p) => Math.max(m, p.n), 0);
/** prototype for a new module: the architecture's trunk or branch prototype, else the paper's (λ, D') Voronoi pick */
function pickFor(sp, isAxis, lam, Dp) {
  const a = ARCH[sp.arch || 'makowski'];
  if (isAxis && a.axis) return a.axis;
  if (!isAxis && a.branch) return a.branch;
  if (a.axis && !a.branch) return a.axis;
  return pickProto(lam, Dp);
}

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
function sphereIntersect(r1, r2, d) {
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) { const m = Math.min(r1, r2); return 4.18879020479 * m * m * m; }
  const t = r1 + r2 - d;
  return Math.PI * t * t * (d * d + 2 * d * (r1 + r2) - 3 * (r1 - r2) * (r1 - r2)) / (12 * d);
}

// ------------------------------------------------------------------------------------------- simulation
class Sim {
  constructor({ seed, mode, mix, sTolT, single, speciesList }) {
    this.seed = seed; this.mode = mode; this.mix = mix;
    this.rng = makeRng(seed);
    this.species = (speciesList || SPECIES).map((s) => ({ ...s }));
    if (sTolT != null && this.species[1]) this.species[1].sTol = sTolT;
    this.year = 0; this.plants = []; this.pool = ALL_PROTOS.map(() => []);
    this.nextId = 1; this.msHist = new Float32Array(20); this.msN = 0; this.msStep = 0;
    // shared fields
    this.dep = new Float32Array(SH_NX * SH_NX * SH_NY); this.qg = new Float32Array(this.dep.length); // optical depth
    this.cellStart = new Int32Array(HNX * HNX * HNY + 1); this.cellDirty = new Uint8Array(HNX * HNX * HNY).fill(1); this.cellFill = new Int32Array(HNX * HNX * HNY + 1);
    this.gcap = 4096; this.gm = new Array(this.gcap); this.sx = null;
    this.stemHead = new Int32Array(PLOT * PLOT); this.stemNext = new Int32Array(MAX_PLANTS + 64); this.stemP = new Array(MAX_PLANTS + 64);
    this.acc = new Float64Array(MAX_NODES); this.shedBuf = []; this.layA = new Float32Array(SH_NX * SH_NX); this.layB = new Float32Array(SH_NX * SH_NX);
    // history for the chart
    this.hcap = 1024; this.hist = { n: 0, year: new Float32Array(this.hcap), c0: new Float32Array(this.hcap), c1: new Float32Array(this.hcap),
      b0: new Float32Array(this.hcap), b1: new Float32Array(this.hcap), den: new Float32Array(this.hcap), mass: new Float32Array(this.hcap) };
    this.stats = { count: [0, 0], bio: [0, 0], modules: 0, trees: 0, meanMass: 0 };
    if (mode === 'single') {
      this.addPlant(this.species[single], 0, 0);
    } else {
      for (let i = 0; i < N_INIT; i++) {
        const x = (this.rng.next() - 0.5) * (PLOT - 2), z = (this.rng.next() - 0.5) * (PLOT - 2);
        this.addPlant(this.species[this.rng.next() < mix ? 1 : 0], x, z);
      }
    }
    this.lightPass(); // so the first frame has light values
    this.record();
  }

  alloc(proto) {
    const pool = this.pool[proto.id];
    let m = pool.pop();
    if (!m) {
      m = { proto, plant: null, parent: null, slot: 0, isAxis: false, age: 0, v: 0, S: 0, Q: 1, QG: 1, Qeff: 1,
        N: 0, g: 0, moved: true, fresh: true, pipeDirty: true, bio: 0, top: 0, child: new Array(proto.nT).fill(null), bud: new Uint8Array(proto.nT), budV: new Float32Array(proto.nT), nLive: 0,
        wdir: new Float32Array(proto.n * 3), nw: new Float32Array(proto.n * 3), segL: new Float32Array(proto.n),
        dMax: new Float32Array(proto.n), dBase: 0, cx: 0, cy: 0, cz: 0, r: 0, shed: false, id: 0 };
    } else {
      m.child.fill(null); m.budV.fill(0); m.segL.fill(0); m.dMax.fill(0);
      m.parent = null; m.moved = true; m.fresh = true; m.pipeDirty = true; m.bio = 0; m.top = 0; m.age = 0; m.v = 0; m.S = 0; m.Q = 1; m.QG = 1; m.Qeff = 1; m.dBase = 0; m.shed = false;
    }
    m.bud.fill(1); m.nLive = proto.nT; m.id = this.nextId++;
    return m;
  }
  release(m) { this.markCell(m); m.plant = null; m.parent = null; m.child.fill(null); this.pool[m.proto.id].push(m); }

  // orthonormal frame with Y = dir, rolled by `roll`; writes the module's world-space segment directions
  setFrame(m, dx, dy, dz, roll) {
    let rx = 0, ry = 1, rz = 0;
    if (Math.abs(dy) > 0.95) { rx = 1; ry = 0; }
    // X0 = normalize(ref × Y)
    let xx = ry * dz - rz * dy, xy = rz * dx - rx * dz, xz = rx * dy - ry * dx;
    let l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    // Z0 = X0 × Y
    const zx = xy * dz - xz * dy, zy = xz * dx - xx * dz, zz = xx * dy - xy * dx;
    const c = Math.cos(roll), s = Math.sin(roll);
    const Xx = xx * c + zx * s, Xy = xy * c + zy * s, Xz = xz * c + zz * s;
    const Zx = zx * c - xx * s, Zy = zy * c - xy * s, Zz = zz * c - xz * s;
    const pr = m.proto, w = m.wdir, d = pr.dx;
    for (let j = 1; j < pr.n; j++) {
      const lx = d[j * 3], ly = d[j * 3 + 1], lz = d[j * 3 + 2];
      w[j * 3] = Xx * lx + dx * ly + Zx * lz; w[j * 3 + 1] = Xy * lx + dy * ly + Zy * lz; w[j * 3 + 2] = Xz * lx + dz * ly + Zz * lz;
    }
  }

  addPlant(sp, x, z) {
    const p = { id: this.nextId++, sp, x, z, age: 0, mods: [], flowering: false, dead: false, capF: 1, bio: 0, stemD: 0, height: 0 };
    const A = ARCH[sp.arch || 'makowski'];
    const m = this.alloc(A.root || (A.axis ? A.axis : pickProto(sp.lam, sp.D)));
    m.plant = p; m.isAxis = true;
    const tx = this.rng.gauss() * 0.06, tz = this.rng.gauss() * 0.06, l = Math.hypot(tx, 1, tz);
    this.setFrame(m, tx / l, 1 / l, tz / l, this.rng.next() * TAU2);
    p.mods.push(m);
    this.positions(p, m);
    this.plants.push(p);
    return p;
  }

  // node world positions from ages (Eq. 9) plus the tropism offset (Eq. 10); then the bounding sphere
  positions(p, m) {
    const sp = p.sp, pr = m.proto, nw = m.nw, w = m.wdir, L = sp.L, P = pr.P;
    if (m.parent) { const t = m.parent.proto.terms[m.slot] * 3, q = m.parent.nw; nw[0] = q[t]; nw[1] = q[t + 1]; nw[2] = q[t + 2]; }
    else { nw[0] = p.x; nw[1] = 0; nw[2] = p.z; }
    const g = Math.abs(sp.g1), sg = Math.sign(sp.g1) * K_TAU * L * g;
    let sx = nw[0], sy = nw[1], sz = nw[2];
    for (let j = 1; j < pr.n; j++) {
      const pj = P[j], ab = Math.max(0, m.age - pr.aBirth[pj]);
      const l = Math.min(pr.len[j], sp.beta * ab), f = l / pr.len[j];
      const tau = sg * f / (ab + g);
      const k = j * 3, kp = pj * 3;
      nw[k] = nw[kp] + w[k] * l * L; nw[k + 1] = nw[kp + 1] + w[k + 1] * l * L + tau; nw[k + 2] = nw[kp + 2] + w[k + 2] * l * L;
      m.segL[j] = l * L;
      sx += nw[k]; sy += nw[k + 1]; sz += nw[k + 2];
    }
    const n = pr.n; sx /= n; sy /= n; sz /= n;
    let r2 = 0, top = 0;
    for (let j = 0; j < n; j++) if (nw[j * 3 + 1] > top) top = nw[j * 3 + 1];
    m.top = top;
    for (let j = 0; j < n; j++) { const k = j * 3, a = nw[k] - sx, b = nw[k + 1] - sy, c = nw[k + 2] - sz; r2 = Math.max(r2, a * a + b * b + c * c); }
    m.cx = sx; m.cy = sy; m.cz = sz; m.r = Math.max(0.15 * L, Math.sqrt(r2));
  }

  shIndex(x, y, z) {
    let ix = Math.floor((x + HALF) / SH_CELL), iz = Math.floor((z + HALF) / SH_CELL), iy = Math.floor(y / SH_CELL);
    ix = ix < 0 ? 0 : ix >= SH_NX ? SH_NX - 1 : ix; iz = iz < 0 ? 0 : iz >= SH_NX ? SH_NX - 1 : iz; iy = iy < 0 ? 0 : iy >= SH_NY ? SH_NY - 1 : iy;
    return (ix * SH_NX + iz) * SH_NY + iy;
  }
  hIndex(x, y, z) {
    let ix = Math.floor((x + HALF) / HC), iz = Math.floor((z + HALF) / HC), iy = Math.floor(y / HC);
    ix = ix < 0 ? 0 : ix >= HNX ? HNX - 1 : ix; iz = iz < 0 ? 0 : iz >= HNX ? HNX - 1 : iz; iy = iy < 0 ? 0 : iy >= HNY ? HNY - 1 : iy;
    return (iy * HNX + iz) * HNX + ix;
  }

  // Σ V∩(B, B_w) / V(B) over hashed modules near (x, y, z, r), skipping `a` and `b` and their parent/child links
  overlap(x, y, z, r, selfG, skipG, parG) {
    const R = r + this.rMax;
    const ix0 = Math.max(0, Math.floor((x - R + HALF) / HC)), ix1 = Math.min(HNX - 1, Math.floor((x + R + HALF) / HC));
    const iz0 = Math.max(0, Math.floor((z - R + HALF) / HC)), iz1 = Math.min(HNX - 1, Math.floor((z + R + HALF) / HC));
    const iy0 = Math.max(0, Math.min(HNY - 1, Math.floor((y - R) / HC))), iy1 = Math.max(0, Math.min(HNY - 1, Math.floor((y + R) / HC)));
    const iV = 1 / (4.18879020479 * r * r * r), start = this.cellStart, SX = this.sx, SY = this.sy, SZ = this.sz, SR = this.sr, SI = this.si, SP = this.spar;
    let f = 0;
    for (let iy = iy0; iy <= iy1; iy++)
      for (let iz = iz0; iz <= iz1; iz++) {
        const row = (iy * HNX + iz) * HNX;
        const j0 = start[row + ix0], j1 = start[row + ix1 + 1];
        for (let j = j0; j < j1; j++) {
          const a = SX[j] - x, b = SY[j] - y, c = SZ[j] - z, wr = SR[j], rs = r + wr, d2 = a * a + b * b + c * c;
          if (d2 >= rs * rs) continue;
          const id = SI[j];
          if (id === selfG || id === skipG || id === parG || SP[j] === selfG) continue;
          f += sphereIntersect(r, wr, Math.sqrt(d2)) * iV;
        }
      }
    return f;
  }

  // (A) shared shadow grid + per-module light, Q_eff = lerp(s_tol, 1, Q·Q_G)
  lightPass() {
    let n = 0;
    for (const p of this.plants) n += p.mods.length;
    if (n > this.gcap) { while (this.gcap < n) this.gcap *= 2; this.gm = new Array(this.gcap); this.sx = null; }
    if (!this.sx || this.sx.length < n) {
      const c = this.gcap; this.sx = new Float32Array(c); this.sy = new Float32Array(c); this.sz = new Float32Array(c); this.sr = new Float32Array(c);
      this.si = new Int32Array(c); this.spar = new Int32Array(c); this.cellOf = new Int32Array(c);
    }
    // counting sort of module spheres by hash cell: each cell's spheres are contiguous in flat arrays
    const gm = this.gm, start = this.cellStart, cellOf = this.cellOf;
    start.fill(0);
    let i = 0, rMax = 0;
    for (const p of this.plants) for (const m of p.mods) {
      gm[i] = m; m.g = i; const c = this.hIndex(m.cx, m.cy, m.cz); cellOf[i] = c; start[c + 1]++; i++;
      if (m.r > rMax) rMax = m.r;
    }
    this.rMax = rMax; this.budget = MAX_MODULES - n;
    for (let c = 0; c < HNX * HNX * HNY; c++) start[c + 1] += start[c];
    const fill = this.cellFill; fill.set(start);
    for (let k = 0; k < n; k++) {
      const m = gm[k], j = fill[cellOf[k]]++;
      this.sx[j] = m.cx; this.sy[j] = m.cy; this.sz[j] = m.cz; this.sr[j] = m.r; this.si[j] = k; this.spar[j] = m.parent ? m.parent.g : -1;
    }

    const dep = this.dep, qg = this.qg;
    dep.fill(0);
    for (let k = 0; k < n; k++) {
      const m = gm[k];
      if (m.nLive === 0) continue;
      const iy = Math.floor(m.cy / SH_CELL) - 1;
      if (iy < 0) continue;
      const y = Math.min(SH_NY - 1, iy), rc = m.r / SH_CELL + 0.5, R = Math.ceil(rc);
      const ix0 = Math.floor((m.cx + HALF) / SH_CELL), iz0 = Math.floor((m.cz + HALF) / SH_CELL);
      let cnt = 0;
      for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
        if (a * a + b * b > rc * rc) continue;
        const ix = ix0 + a, iz = iz0 + b; if (ix < 0 || iz < 0 || ix >= SH_NX || iz >= SH_NX) continue; cnt++;
      }
      if (!cnt) continue;
      const t = K_SH * m.nLive / cnt;
      for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
        if (a * a + b * b > rc * rc) continue;
        const ix = ix0 + a, iz = iz0 + b; if (ix < 0 || iz < 0 || ix >= SH_NX || iz >= SH_NX) continue;
        dep[(ix * SH_NX + iz) * SH_NY + y] += t;
      }
    }
    // cumulative optical depth from the top, spread sideways one cell per layer (the widening shadow
    // pyramid of Pałubicki 2009): acc_y = blur(acc_{y+1}) + dep_y; `qg` stores the depth, Q_G = exp(-acc) on lookup
    let prev = this.layA, cur = this.layB;
    prev.fill(0);
    const NX = SH_NX;
    for (let y = SH_NY - 1; y >= 0; y--) {
      for (let ix = 0; ix < NX; ix++) for (let iz = 0; iz < NX; iz++) {
        const c = ix * NX + iz, mid = prev[c];
        const l = ix > 0 ? prev[c - NX] : mid, r = ix < NX - 1 ? prev[c + NX] : mid;
        const d = iz > 0 ? prev[c - 1] : mid, u = iz < NX - 1 ? prev[c + 1] : mid;
        const v = 0.5 * mid + 0.125 * (l + r + d + u) + dep[c * SH_NY + y];
        cur[c] = v; qg[c * SH_NY + y] = v;
      }
      const t = prev; prev = cur; cur = t;
    }
    for (let k = 0; k < n; k++) {
      const m = gm[k], st = m.plant.sp.sTol;
      m.QG = Math.exp(-qg[this.shIndex(m.cx, m.cy, m.cz)]);
      if (m.nLive && (m.moved || this.boxDirty(m.cx, m.cy, m.cz, m.r))) m.Q = Math.exp(-C_COL * this.overlap(m.cx, m.cy, m.cz, m.r, k, -1, m.parent ? m.parent.g : -1));
      m.Qeff = st + (1 - st) * m.Q * m.QG;
    }
    this.cellDirty.fill(0);
  }

  boxDirty(x, y, z, r) {
    const R = r + this.rMax, D = this.cellDirty;
    const ix0 = Math.max(0, Math.floor((x - R + HALF) / HC)), ix1 = Math.min(HNX - 1, Math.floor((x + R + HALF) / HC));
    const iz0 = Math.max(0, Math.floor((z - R + HALF) / HC)), iz1 = Math.min(HNX - 1, Math.floor((z + R + HALF) / HC));
    const iy0 = Math.max(0, Math.min(HNY - 1, Math.floor((y - R) / HC))), iy1 = Math.max(0, Math.min(HNY - 1, Math.floor((y + R) / HC)));
    for (let iy = iy0; iy <= iy1; iy++) for (let iz = iz0; iz <= iz1; iz++) {
      const row = (iy * HNX + iz) * HNX;
      for (let ix = ix0; ix <= ix1; ix++) if (D[row + ix]) return true;
    }
    return false;
  }

  // (B) Borchert-Honda passes, foliage loss, shedding
  vigour(p) {
    const mods = p.mods, sp = p.sp, lam = 0.5 + ((p.flowering ? sp.lamM : sp.lam) - 0.5) * LAM_K;
    // basipetal: light S and the number of leaf-bearing modules N of every subtree
    for (const m of mods) { const leafy = m.nLive > 0; m.S = leafy ? m.Qeff : 0; m.N = leafy ? 1 : 0; }
    for (let i = mods.length - 1; i > 0; i--) { const m = mods[i]; m.parent.S += m.S; m.parent.N += m.N; }
    const root = mods[0], cap = sp.vRootMax * CAP_SCALE * p.capF;
    root.v = Math.min(Math.max(0, ALPHA_BH * root.S - K_H * p.height), cap); // stature cost (an addition, see header)
    // acropetal: v_m = v·λQ_m / (λQ_m + (1-λ)ΣQ_l) over child modules and free buds (q = Q/#terminals)
    for (const m of mods) {
      const nT = m.proto.nT, q = m.Qeff / nT, v = m.v;
      let den = 0;
      for (let k = 0; k < nT; k++) { const c = m.child[k], s = c ? c.S : m.bud[k] ? q : 0; den += (k === 0 ? lam : 1 - lam) * s; }
      for (let k = 0; k < nT; k++) {
        const c = m.child[k], s = c ? c.S : m.bud[k] ? q : 0, share = den > 0 ? v * (k === 0 ? lam : 1 - lam) * s / den : 0;
        if (c) c.v = share; else m.budV[k] = m.bud[k] ? share : 0;
      }
    }
    // foliage: a bud whose share, per unit of module light (v·#terminals), falls below FOLIAGE·v̄_min drops its
    // leaves; a module is shed when nothing in its subtree carries foliage (its v̄ has gone to zero)
    let any = false;
    for (const m of mods) {
      if (m.nLive) {
        const nT = m.proto.nT, nl = m.nLive;
        for (let k = 0; k < nT; k++) if (m.bud[k] && m.budV[k] * nl < FOLIAGE * V_MIN) { m.bud[k] = 0; m.nLive--; }
      }
      m.shed = m.N === 0 || (m.parent !== null && m.parent.shed);
      if (m.shed) any = true;
    }
    if (!any) return;
    if (root.shed) { p.dead = true; return; }
    let w = 0;
    for (let i = 0; i < mods.length; i++) {
      const m = mods[i];
      if (m.shed) {
        if (!m.parent.shed) {
          m.parent.child[m.slot] = null;
          if (sp.sprout && this.rng.next() < sp.sprout) { m.parent.bud[m.slot] = 1; m.parent.nLive++; } // a dormant bud re-sprouts
        }
        this.shedBuf.push(m);
      } else mods[w++] = m;
    }
    mods.length = w;
    for (const m of this.shedBuf) this.release(m);
    this.shedBuf.length = 0;
  }

  // (C) ageing (Eqs. 5-6), positions, pipe model
  develop(p) {
    const mods = p.mods, sp = p.sp, k = sp.gp * DT_PHYS * DT, dtip = sp.phi * D_TIP, dt2 = dtip * dtip;
    const iH = sp.Hmax ? 1 / sp.Hmax : 0;
    for (const m of mods) {
      let growing = false;
      if (m.age < A_MATURE) {
        let da = smooth((m.v / Math.max(1, m.N) - V_MIN) / (V_MAX - V_MIN)) * k;
        if (iH) da *= Math.max(0, 1 - (m.cy * iH) ** 2); // JABOWA-style height asymptote (species Hmax, ours)
        if (da > 0) { m.age = Math.min(A_MATURE, m.age + da); growing = true; }
      }
      if (growing || m.fresh || (m.parent !== null && m.parent.moved)) {
        this.markCell(m); this.positions(p, m); this.markCell(m);
        m.moved = true; m.fresh = false; m.pipeDirty = true;
      } else m.moved = false;
    }
    // pipe model, children before parents; only along paths where something grew
    const acc = this.acc;
    let h = 0, bio = 0;
    for (let i = mods.length - 1; i >= 0; i--) {
      const m = mods[i];
      if (m.pipeDirty) {
        const pr = m.proto, P = pr.P, dm = m.dMax;
        let mb = 0;
        for (let j = 0; j < pr.n; j++) acc[j] = 0;
        for (let j = pr.n - 1; j > 0; j--) {
          let s = acc[j];
          const t = pr.termOf[j];
          if (t >= 0) { const c = m.child[t]; if (c) s += c.dBase * c.dBase; else if (m.bud[t]) s += dt2; }
          const d = Math.sqrt(s);
          if (d > dm[j]) dm[j] = d;
          acc[P[j]] += dm[j] * dm[j];
          mb += 0.7853981634 * dm[j] * dm[j] * m.segL[j];
        }
        m.bio = mb; m.pipeDirty = false;
        const b = Math.sqrt(acc[0]);
        if (b > m.dBase) { m.dBase = b; if (m.parent) m.parent.pipeDirty = true; }
      }
      bio += m.bio; if (m.top > h) h = m.top;
    }
    p.height = h; p.bio = bio; p.stemD = mods[0].dBase;
    if (sp.stemD) for (const m of mods) { m.dBase = Math.max(m.dBase, sp.stemD); for (let j = 1; j < m.proto.n; j++) if (m.dMax[j] < sp.stemD) m.dMax[j] = sp.stemD; }
  }

  markCell(m) { this.cellDirty[this.hIndex(m.cx, m.cy, m.cz)] = 1; }

  // (D) new modules on mature modules' live buds whose BH share exceeds v̄_min, oriented by the cheap search
  spawn(p) {
    const mods = p.mods, sp = p.sp, lam = p.flowering ? sp.lamM : sp.lam, D = p.flowering ? sp.DM : sp.D, L = sp.L;
    const A = ARCH[sp.arch || 'makowski'];
    const n0 = mods.length, rng = this.rng, cosA = Math.sin(sp.latElev != null ? sp.latElev : A.latElev != null ? A.latElev : sp.alpha); // target cos(zenith) = sin(elevation)
    for (let i = 0; i < n0; i++) {
      const m = mods[i];
      if (m.age < A_MATURE || !m.nLive) continue;
      const pr = m.proto, nl = m.nLive;
      for (let k = 0; k < pr.nT; k++) {
        if (!m.bud[k] || m.child[k] || m.budV[k] * nl <= V_MIN) continue;
        if (this.budget <= 0) return;
        this.budget--;
        let isAxis = (m.isAxis && k === pr.axisTerm) || (A.multiStem && m.parent === null);
        if (!isAxis && sp.reit && k === pr.axisTerm && p.flowering && m.budV[k] * nl > REIT * V_MIN) isAxis = true; // reiteration
        const proto = pickFor(sp, isAxis, lam, Math.min(1, Math.max(0, m.v / Math.max(1, m.N) * D / V_MAX)));
        const tn = pr.terms[k], pn = pr.P[tn], nw = m.nw;
        let dx = nw[tn * 3] - nw[pn * 3], dy = nw[tn * 3 + 1] - nw[pn * 3 + 1], dz = nw[tn * 3 + 2] - nw[pn * 3 + 2];
        let l = Math.hypot(dx, dy, dz);
        if (l < 1e-6) { dx = m.wdir[tn * 3]; dy = m.wdir[tn * 3 + 1]; dz = m.wdir[tn * 3 + 2]; l = 1; }
        dx = dx / l + rng.gauss() * 0.08; dy = dy / l + rng.gauss() * 0.08; dz = dz / l + rng.gauss() * 0.08;
        l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
        const cT = isAxis ? 1 : cosA, w2 = isAxis ? Math.max(W_AXIS, sp.w2) : sp.w2;
        // orientation search: f = ω1·f_collisions + ω2·f_tropism
        const ax = nw[tn * 3], ay = nw[tn * 3 + 1], az = nw[tn * 3 + 2], cr = L * proto.cyF, rr = L * proto.rF;
        const F = (x, y, z) => W_COL * this.overlap(ax + x * cr, ay + y * cr, az + z * cr, rr, -2, m.g, -2) + w2 * (cT - y) * (cT - y) + (y < -0.5 ? 10 : 0);
        let best = F(dx, dy, dz), step = 0.3;
        for (let it = 0; it < 4; it++) {
          let ex = 0, ey = 1, ez = 0; if (Math.abs(dy) > 0.9) { ex = 1; ey = 0; }
          let e1x = ey * dz - ez * dy, e1y = ez * dx - ex * dz, e1z = ex * dy - ey * dx; const el = Math.hypot(e1x, e1y, e1z); e1x /= el; e1y /= el; e1z /= el;
          const e2x = dy * e1z - dz * e1y, e2y = dz * e1x - dx * e1z, e2z = dx * e1y - dy * e1x;
          const c = Math.cos(step), s = Math.sin(step);
          let bx = 0, by = 0, bz = 0, found = false;
          for (let q = 0; q < 4; q++) {
            const sx = q === 0 ? e1x : q === 1 ? -e1x : q === 2 ? e2x : -e2x;
            const sy = q === 0 ? e1y : q === 1 ? -e1y : q === 2 ? e2y : -e2y;
            const sz = q === 0 ? e1z : q === 1 ? -e1z : q === 2 ? e2z : -e2z;
            const cx = dx * c + sx * s, cy = dy * c + sy * s, cz = dz * c + sz * s;
            const f = F(cx, cy, cz);
            if (f < best - 1e-5) { best = f; bx = cx; by = cy; bz = cz; found = true; }
          }
          if (found) { dx = bx; dy = by; dz = bz; } else step *= 0.5;
        }
        const c = this.alloc(proto);
        c.plant = p; c.parent = m; c.slot = k; c.isAxis = isAxis;
        this.setFrame(c, dx, dy, dz, rng.next() * TAU2);
        m.child[k] = c; m.bud[k] = 0; m.nLive--;
        mods.push(c);
        this.positions(p, c); this.markCell(c);
      }
    }
  }

  // (E) ageing of plants, senescence, flowering, Gaussian seeding, removal of the dead
  ecosystem() {
    const rng = this.rng, head = this.stemHead, nx = this.stemNext, sp_ = this.stemP;
    head.fill(-1);
    let ns = 0;
    const addStem = (p) => {
      if (ns >= nx.length) return;
      const c = Math.min(PLOT - 1, Math.max(0, Math.floor(p.x + HALF))) * PLOT + Math.min(PLOT - 1, Math.max(0, Math.floor(p.z + HALF)));
      sp_[ns] = p; nx[ns] = head[c]; head[c] = ns; ns++;
    };
    for (const p of this.plants) if (!p.dead) addStem(p);
    const blocked = (x, z) => {
      const ix = Math.floor(x + HALF), iz = Math.floor(z + HALF);
      for (let a = ix - 1; a <= ix + 1; a++) for (let b = iz - 1; b <= iz + 1; b++) {
        if (a < 0 || b < 0 || a >= PLOT || b >= PLOT) continue;
        for (let i = head[a * PLOT + b]; i >= 0; i = nx[i]) { const q = sp_[i]; if ((q.x - x) ** 2 + (q.z - z) ** 2 < STEM_GAP * STEM_GAP) return true; }
      }
      return false;
    };
    const n0 = this.plants.length;
    let alive = 0;
    for (let i = 0; i < n0; i++) if (!this.plants[i].dead) alive++;
    for (let i = 0; i < n0; i++) {
      const p = this.plants[i];
      if (p.dead) continue;
      const sp = p.sp;
      p.age += DT;
      if (p.age >= sp.pmax) p.capF = Math.max(0, 1 - (p.age - sp.pmax) / Math.max(5, 0.1 * sp.pmax));
      const root = p.mods[0];
      if (!p.flowering) {
        const cap = sp.vRootMax * CAP_SCALE * p.capF, Feff = sp.Fage * cap / Math.max(1e-3, root.v);
        if (p.age >= Math.max(F_MIN, Feff)) p.flowering = true;
      }
      if (this.mode !== 'forest' || !p.flowering || p.age >= sp.pmax) continue;
      const expct = sp.seedFreq * DT;
      let ns2 = Math.floor(expct) + (rng.next() < expct % 1 ? 1 : 0);
      const sigma = sp.seedRadius / 2;
      for (; ns2 > 0; ns2--) {
        const x = p.x + rng.gauss() * sigma, z = p.z + rng.gauss() * sigma;
        if (Math.abs(x) > HALF - 0.3 || Math.abs(z) > HALF - 0.3) continue;
        const q = Math.exp(-this.qg[this.shIndex(x, 0.2, z)]);
        if (sp.sTol + (1 - sp.sTol) * q < S_EST) continue;
        if (alive >= MAX_PLANTS || blocked(x, z)) continue;
        const np = this.addPlant(sp, x, z); alive++;
        addStem(np);
      }
    }
    let w = 0;
    for (const p of this.plants) {
      if (p.dead || !p.mods.length) { for (const m of p.mods) this.release(m); p.mods.length = 0; }
      else this.plants[w++] = p;
    }
    this.plants.length = w;
  }

  step() {
    const t0 = performance.now();
    this.lightPass();
    for (const p of this.plants) this.vigour(p);
    for (const p of this.plants) if (!p.dead) this.develop(p);
    for (const p of this.plants) if (!p.dead) this.spawn(p);
    this.ecosystem();
    this.year += DT;
    this.record();
    const ms = performance.now() - t0;
    this.msHist[this.msN++ % this.msHist.length] = ms;
    let s = 0; const k = Math.min(this.msN, this.msHist.length);
    for (let i = 0; i < k; i++) s += this.msHist[i];
    this.msStep = s / k;
  }

  record() {
    const st = this.stats; st.count[0] = st.count[1] = 0; st.bio[0] = st.bio[1] = 0; st.modules = 0;
    let trees = 0, mass = 0;
    for (const p of this.plants) {
      const s = p.sp.key === 'pioneer' ? 0 : 1;
      st.count[s]++; st.bio[s] += p.bio * WOOD / 1000; st.modules += p.mods.length;
      if (p.stemD >= 0.05) { trees++; mass += p.bio * WOOD; }
    }
    st.trees = trees; st.meanMass = trees ? mass / trees : 0;
    const H = this.hist;
    if (H.n >= this.hcap) {
      this.hcap *= 2;
      for (const key of ['year', 'c0', 'c1', 'b0', 'b1', 'den', 'mass']) { const a = new Float32Array(this.hcap); a.set(H[key]); H[key] = a; }
    }
    const i = H.n++;
    H.year[i] = this.year; H.c0[i] = st.count[0]; H.c1[i] = st.count[1]; H.b0[i] = st.bio[0]; H.b1[i] = st.bio[1];
    H.den[i] = trees / (PLOT * PLOT / 10000); H.mass[i] = st.meanMass;
  }

  // least-squares slope of log mean mass against log density, after the density peak (the thinning phase)
  thinningSlope() {
    const H = this.hist;
    let peak = 0;
    for (let i = 0; i < H.n; i++) if (H.den[i] > H.den[peak]) peak = i;
    let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = peak; i < H.n; i++) {
      if (H.den[i] <= 0 || H.mass[i] <= 0 || H.den[i] * PLOT * PLOT / 10000 < 4) continue;
      const x = Math.log10(H.den[i]), y = Math.log10(H.mass[i]);
      n++; sx += x; sy += y; sxx += x * x; sxy += x * y;
    }
    const den = n * sxx - sx * sx;
    if (n < 8 || Math.abs(den) < 1e-9) return { slope: NaN, n };
    return { slope: (n * sxy - sx * sy) / den, n, peak: H.year[peak] };
  }
}

export { ARCH, ALL_PROTOS, TABLE4, TABLE3, speciesFromTable, Sim, SPECIES, PROTOS, makeRng, smooth, sphereIntersect, pickProto, A_MATURE, ALPHA_BH, V_MIN, V_MAX, FOLIAGE, K_H, CAP_SCALE, C_COL, K_SH, S_EST, F_MIN, D_TIP, PLOT, HALF, SH_NY, DT_PHYS, LAM_K, DEG, TAU2 };
