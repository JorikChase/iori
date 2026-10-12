/*
 * silviculture.js — a browser reimplementation of
 *   Makowski, Hädrich, Scheffczyk, Michels, Pirk, Pałubicki,
 *   "Synthetic Silviculture: Multi-scale Modeling of Plant Ecosystems", ACM TOG 38(4) 131, SIGGRAPH 2019,
 * with the bud-scale rules it defers to from Pałubicki et al., "Self-organizing tree models", SIGGRAPH 2009.
 *
 * export createSilviculture(root) -> { start(), stop(), reset() }   (plus a non-enumerable `debug` for harnesses)
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
 *  - Dropped: climate Gaussians (adaptation o = 1), terrain, soil maps, LOD. Flat square plot, no wrap-around.
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
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ------------------------------------------------------------------------------------------- constants
const DT = 1, DT_PHYS = 3, A_MATURE = 1, ALPHA_BH = 2, V_MIN = 1, V_MAX = 3, LAM_K = 0.25, FOLIAGE = 0.8, K_H = 0.05;
const CAP_SCALE = 0.2, C_COL = 0.6, K_SH = 0.2, S_EST = 0.6, STEM_GAP = 1.0, F_MIN = 5, K_TAU = 0.12;
const D_TIP = 0.008, W_COL = 1, W_AXIS = 0.6, PLOT = 32, HALF = PLOT / 2, MAX_PLANTS = 600, MAX_MODULES = 25000, N_INIT = 70;
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
  return { id, lam, D, n, nT: terms.length, P: Int16Array.from(P), len, dx, aBirth, terms: Int16Array.from(terms), termOf,
    cyF: Math.hypot(cx, cy, cz), rF };
}
const PROTOS = [];
for (const D of [0.15, 0.5, 0.85]) for (const lam of [0.35, 0.65, 0.95]) PROTOS.push(makeProto(PROTOS.length, lam, D));
const MAX_NODES = PROTOS.reduce((m, p) => Math.max(m, p.n), 0);
function pickProto(lam, D) {
  let best = PROTOS[0], bd = Infinity;
  for (const p of PROTOS) { const d = (p.lam - lam) ** 2 + (p.D - D) ** 2; if (d < bd) { bd = d; best = p; } }
  return best;
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
  constructor({ seed, mode, mix, sTolT, single }) {
    this.seed = seed; this.mode = mode; this.mix = mix;
    this.rng = makeRng(seed);
    this.species = SPECIES.map((s) => ({ ...s }));
    this.species[1].sTol = sTolT;
    this.year = 0; this.plants = []; this.pool = PROTOS.map(() => []);
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
    const m = this.alloc(pickProto(sp.lam, sp.D));
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
      if (m.shed) { if (!m.parent.shed) m.parent.child[m.slot] = null; this.shedBuf.push(m); } else mods[w++] = m;
    }
    mods.length = w;
    for (const m of this.shedBuf) this.release(m);
    this.shedBuf.length = 0;
  }

  // (C) ageing (Eqs. 5-6), positions, pipe model
  develop(p) {
    const mods = p.mods, sp = p.sp, k = sp.gp * DT_PHYS * DT, dtip = sp.phi * D_TIP, dt2 = dtip * dtip;
    for (const m of mods) {
      let growing = false;
      if (m.age < A_MATURE) {
        const da = smooth((m.v / Math.max(1, m.N) - V_MIN) / (V_MAX - V_MIN)) * k;
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
  }

  markCell(m) { this.cellDirty[this.hIndex(m.cx, m.cy, m.cz)] = 1; }

  // (D) new modules on mature modules' live buds whose BH share exceeds v̄_min, oriented by the cheap search
  spawn(p) {
    const mods = p.mods, sp = p.sp, lam = p.flowering ? sp.lamM : sp.lam, D = p.flowering ? sp.DM : sp.D, L = sp.L;
    const n0 = mods.length, rng = this.rng, cosA = Math.sin(sp.alpha); // target cos(zenith) = sin(elevation α)
    for (let i = 0; i < n0; i++) {
      const m = mods[i];
      if (m.age < A_MATURE || !m.nLive) continue;
      const pr = m.proto, nl = m.nLive;
      for (let k = 0; k < pr.nT; k++) {
        if (!m.bud[k] || m.child[k] || m.budV[k] * nl <= V_MIN) continue;
        if (this.budget <= 0) return;
        this.budget--;
        const proto = pickProto(lam, Math.min(1, Math.max(0, m.v / Math.max(1, m.N) * D / V_MAX)));
        const tn = pr.terms[k], pn = pr.P[tn], nw = m.nw;
        let dx = nw[tn * 3] - nw[pn * 3], dy = nw[tn * 3 + 1] - nw[pn * 3 + 1], dz = nw[tn * 3 + 2] - nw[pn * 3 + 2];
        let l = Math.hypot(dx, dy, dz);
        if (l < 1e-6) { dx = m.wdir[tn * 3]; dy = m.wdir[tn * 3 + 1]; dz = m.wdir[tn * 3 + 2]; l = 1; }
        dx = dx / l + rng.gauss() * 0.08; dy = dy / l + rng.gauss() * 0.08; dz = dz / l + rng.gauss() * 0.08;
        l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
        const isAxis = m.isAxis && k === 0, cT = isAxis ? 1 : cosA, w2 = isAxis ? Math.max(W_AXIS, sp.w2) : sp.w2;
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

// ------------------------------------------------------------------------------------------- figure
export function createSilviculture(root) {
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const mq = window.matchMedia('(max-width: 700px)');

  const view = el('div', 'fig-view');
  view.style.position = 'relative'; view.style.width = '100%'; view.style.overflow = 'hidden';
  const setAspect = () => { view.style.aspectRatio = mq.matches ? '4 / 5' : '16 / 10'; };
  setAspect();

  const row1 = el('div', 'controls'), row2 = el('div', 'controls');
  const playBtn = el('button', null, 'Pause'), resetBtn = el('button', null, 'Reset'), seedBtn = el('button', null, 'New seed');
  playBtn.type = resetBtn.type = seedBtn.type = 'button';
  const modeSel = el('select');
  for (const [v, t] of [['forest', 'Forest'], ['single', 'Single tree']]) { const o = el('option', null, t); o.value = v; modeSel.append(o); }
  modeSel.setAttribute('aria-label', 'Mode');
  const treeSel = el('select');
  for (const [v, t] of [['1', 'tolerant (Table 4 i)'], ['0', 'pioneer (Table 4 n)']]) { const o = el('option', null, t); o.value = v; treeSel.append(o); }
  treeSel.setAttribute('aria-label', 'Species');
  const slider = (label, min, max, step, value, fmt) => {
    const lab = el('label'); const input = el('input'); const span = el('span');
    input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = value;
    lab.append(label + ' ', input, ' ', span);
    const upd = () => { span.textContent = fmt(+input.value); };
    upd(); input.addEventListener('input', upd);
    return { lab, input };
  };
  const speed = slider('Speed', 1, 40, 1, 8, (v) => `${v} yr/s`);
  const mix = slider('Tolerant share', 0, 100, 5, 30, (v) => `${v}%`);
  const stol = slider('Shade tolerance', 0, 100, 5, 45, (v) => (v / 100).toFixed(2));
  row1.append(playBtn, resetBtn, seedBtn, modeSel, treeSel);
  row2.append(speed.lab, mix.lab, stol.lab);
  const chart = el('canvas', 'chart');
  chart.style.width = '100%'; chart.style.display = 'block';
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', 'Plants and biomass per species over time, and log mean tree mass against log density');
  const status = el('p', 'status');
  root.append(view, row1, row2, chart, status);

  // ---- state
  let seed = 1, sim = null, playing = true, running = false, raf = 0, last = 0, acc = 0;
  let renderer, scene, camera, controls, branchMesh, leafMesh, sun, ro, autoFrame = true;
  let dirty = true, chartDirty = true, lastChart = 0;
  const leafLin = SPECIES.map((s) => new THREE.Color(s.leafHex)); // linear components
  const mode = () => modeSel.value;
  const syncVisibility = () => { treeSel.style.display = mode() === 'single' ? '' : 'none'; mix.lab.style.display = mode() === 'single' ? 'none' : ''; };
  syncVisibility();

  const newSim = () => {
    sim = new Sim({ seed, mode: mode(), mix: +mix.input.value / 100, sTolT: +stol.input.value / 100, single: +treeSel.value });
    acc = 0; dirty = true; chartDirty = true; autoFrame = true;
    if (camera) frameCamera(true);
  };

  // ---- leaf orientation table (deterministic), leaf + branch geometry
  const LEAF_ROT = new Float32Array(256 * 9);
  {
    const r = makeRng(12345);
    for (let i = 0; i < 256; i++) {
      // random rotation from a random unit quaternion
      let x, y, z, w, s;
      do { x = r.next() * 2 - 1; y = r.next() * 2 - 1; z = r.next() * 2 - 1; w = r.next() * 2 - 1; s = x * x + y * y + z * z + w * w; } while (s > 1 || s < 1e-3);
      s = 1 / Math.sqrt(s); x *= s; y *= s; z *= s; w *= s;
      const m = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w),
        2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)];
      LEAF_ROT.set(m, i * 9);
    }
  }
  const LEAF_BUD = 4, LEAF_NODE = 2;

  function makeBranchMesh(cap) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true); geo.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x212529 }), cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.castShadow = true; mesh.count = 0;
    return mesh;
  }
  function makeLeafMesh(cap) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.32, 0.45, 0, 0, 1, 0, -0.32, 0.45, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]); geo.computeVertexNormals();
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), cap);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.castShadow = true; mesh.count = 0;
    return mesh;
  }
  function ensureCap(nb, nl) {
    if (nb > branchMesh.instanceMatrix.count) {
      scene.remove(branchMesh); branchMesh.geometry.dispose(); branchMesh.material.dispose(); branchMesh.dispose();
      branchMesh = makeBranchMesh(Math.ceil(nb * 1.5)); scene.add(branchMesh);
    }
    if (nl > leafMesh.instanceMatrix.count) {
      scene.remove(leafMesh); leafMesh.geometry.dispose(); leafMesh.material.dispose(); leafMesh.dispose();
      leafMesh = makeLeafMesh(Math.ceil(nl * 1.5)); scene.add(leafMesh);
    }
  }

  function init() {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0xffffff, 1);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
    const cv = renderer.domElement; cv.style.width = '100%'; cv.style.height = '100%'; cv.style.display = 'block'; cv.style.touchAction = 'none';
    view.append(cv);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(35, 16 / 10, 0.1, 600);
    controls = new OrbitControls(camera, cv);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 2; controls.maxDistance = 200;
    controls.addEventListener('start', () => { autoFrame = false; });
    scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe3dc, 1.9));
    sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(18, 40, 10); sun.castShadow = true;
    const sc = sun.shadow.camera; sc.left = sc.bottom = -26; sc.right = sc.top = 26; sc.near = 1; sc.far = 120;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(PLOT, PLOT), new THREE.MeshLambertMaterial({ color: 0xf2f3ef }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-HALF, 0.01, -HALF), new THREE.Vector3(HALF, 0.01, -HALF), new THREE.Vector3(HALF, 0.01, HALF), new THREE.Vector3(-HALF, 0.01, HALF)]),
    new THREE.LineBasicMaterial({ color: 0xced4da }));
    scene.add(edge);
    branchMesh = makeBranchMesh(30000); leafMesh = makeLeafMesh(30000);
    scene.add(branchMesh, leafMesh);
    ro = new ResizeObserver(resize);
    if (!sim) newSim();
    frameCamera(true);
    resize();
  }

  function resize() {
    if (!renderer) return;
    setAspect();
    const w = Math.max(1, view.clientWidth), h = Math.max(1, view.clientHeight || Math.round(w * (mq.matches ? 1.25 : 0.625)));
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    chartDirty = true;
  }

  function frameCamera(snap) {
    if (!camera) return;
    let tx = 0, ty, dist;
    const small = mq.matches ? 1.3 : 1;
    if (sim && sim.mode === 'single') {
      const p = sim.plants[0], h = p ? Math.max(2, p.height) : 2;
      ty = h * 0.52; dist = Math.max(7, h * 2.0) * small;
    } else {
      let h = 6; for (const p of sim.plants) if (p.height > h) h = p.height;
      ty = 2 + h * 0.4; dist = (46 + h * 1.1) * small;
    }
    if (!snap && !autoFrame) return;
    const dir = new THREE.Vector3(0.62, 0.34, 0.7).normalize();
    const goal = new THREE.Vector3(tx, ty, 0), pos = goal.clone().addScaledVector(dir, dist);
    if (snap) { controls.target.copy(goal); camera.position.copy(pos); }
    else { controls.target.lerp(goal, 0.05); camera.position.lerp(pos, 0.05); }
  }

  function updateInstances() {
    let nb = 0, nl = 0;
    for (const p of sim.plants) for (const m of p.mods) { nb += m.proto.n - 1; if (m.nLive) nl += m.nLive * LEAF_BUD + (m.proto.n - 1 - m.proto.nT) * LEAF_NODE; }
    ensureCap(nb, nl);
    const B = branchMesh.instanceMatrix.array, Lm = leafMesh.instanceMatrix.array, LC = leafMesh.instanceColor.array;
    let b = 0, l = 0;
    for (const p of sim.plants) {
      const sp = p.sp, si = sp.key === 'pioneer' ? 0 : 1, col = leafLin[si], ls = sp.leafSize * (p.capF < 1 ? 0.5 + 0.5 * p.capF : 1);
      for (const m of p.mods) {
        const pr = m.proto, nw = m.nw, P = pr.P;
        for (let j = 1; j < pr.n; j++) {
          const len = m.segL[j];
          if (len < 0.01) continue;
          const k = j * 3, kp = P[j] * 3;
          const x0 = nw[kp], y0 = nw[kp + 1], z0 = nw[kp + 2];
          const dx = nw[k] - x0, dy = nw[k + 1] - y0, dz = nw[k + 2] - z0, dl = Math.hypot(dx, dy, dz) || 1;
          const ux = dx / dl, uy = dy / dl, uz = dz / dl;
          let ax = 0, ay = 1, az = 0; if (Math.abs(uy) > 0.9) { ax = 1; ay = 0; }
          let e1x = uy * az - uz * ay, e1y = uz * ax - ux * az, e1z = ux * ay - uy * ax; const el1 = Math.hypot(e1x, e1y, e1z); e1x /= el1; e1y /= el1; e1z /= el1;
          const e2x = uy * e1z - uz * e1y, e2y = uz * e1x - ux * e1z, e2z = ux * e1y - uy * e1x;
          const r = Math.max(0.012, m.dMax[j] * 0.5), o = b * 16, ext = (dl + r) / dl; // overlap joints by r
          B[o] = e1x * r; B[o + 1] = e1y * r; B[o + 2] = e1z * r; B[o + 3] = 0;
          B[o + 4] = dx * ext; B[o + 5] = dy * ext; B[o + 6] = dz * ext; B[o + 7] = 0;
          B[o + 8] = e2x * r; B[o + 9] = e2y * r; B[o + 10] = e2z * r; B[o + 11] = 0;
          B[o + 12] = x0 - ux * r * 0.5; B[o + 13] = y0 - uy * r * 0.5; B[o + 14] = z0 - uz * r * 0.5; B[o + 15] = 1;
          b++;
        }
        if (!m.nLive) continue;
        const shade = 0.72 + 0.28 * m.Q * m.QG, grow = 0.35 + 0.65 * Math.min(1, m.age / A_MATURE);
        for (let j = 1; j < pr.n; j++) {
          const t = pr.termOf[j];
          if (t >= 0 && !m.bud[t]) continue;
          const reps = t >= 0 ? LEAF_BUD : LEAF_NODE, k = j * 3, px = nw[k], py = nw[k + 1], pz = nw[k + 2];
          for (let q = 0; q < reps; q++) {
            const h = ((m.id * 2654435761 + j * 40503 + q * 9973) >>> 0) & 255, R = h * 9;
            const jit = 0.85 + 0.3 * (((h * 37) & 63) / 63), s = ls * grow * jit * (t >= 0 ? 1 : 0.8), o = l * 16;
            Lm[o] = LEAF_ROT[R] * s; Lm[o + 1] = LEAF_ROT[R + 1] * s; Lm[o + 2] = LEAF_ROT[R + 2] * s; Lm[o + 3] = 0;
            Lm[o + 4] = LEAF_ROT[R + 3] * s; Lm[o + 5] = LEAF_ROT[R + 4] * s; Lm[o + 6] = LEAF_ROT[R + 5] * s; Lm[o + 7] = 0;
            Lm[o + 8] = LEAF_ROT[R + 6] * s; Lm[o + 9] = LEAF_ROT[R + 7] * s; Lm[o + 10] = LEAF_ROT[R + 8] * s; Lm[o + 11] = 0;
            Lm[o + 12] = px; Lm[o + 13] = py; Lm[o + 14] = pz; Lm[o + 15] = 1;
            const c = shade * (0.92 + 0.16 * (((h * 13) & 31) / 31)), o3 = l * 3;
            LC[o3] = col.r * c; LC[o3 + 1] = col.g * c; LC[o3 + 2] = col.b * c;
            l++;
          }
        }
      }
    }
    branchMesh.count = b; leafMesh.count = l;
    branchMesh.instanceMatrix.needsUpdate = true; leafMesh.instanceMatrix.needsUpdate = true; leafMesh.instanceColor.needsUpdate = true;
    renderer.shadowMap.needsUpdate = true;
  }

  // ---- chart: (a) plants (solid) and biomass (dashed) per species against years; (b) self-thinning
  function drawChart() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.max(1, chart.clientWidth), stack = W < 560;
    const Hc = stack ? 330 : 170;
    chart.style.height = Hc + 'px';
    if (chart.width !== Math.round(W * dpr) || chart.height !== Math.round(Hc * dpr)) { chart.width = Math.round(W * dpr); chart.height = Math.round(Hc * dpr); }
    const g = chart.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, Hc);
    g.font = '11px Inter, system-ui, sans-serif'; g.textBaseline = 'middle';
    const H = sim.hist, n = H.n;
    const pw = stack ? W : (W - 24) / 2, ph = stack ? (Hc - 10) / 2 : Hc;
    const boxA = { x: 0, y: 0, w: pw, h: ph }, boxB = stack ? { x: 0, y: ph + 10, w: pw, h: ph } : { x: pw + 24, y: 0, w: pw, h: ph };
    const ink = '#212529', mute = '#6c757d', rule = '#dee2e6';
    const frame = (bx, title, xl, yl) => {
      g.strokeStyle = rule; g.lineWidth = 1; g.strokeRect(bx.x + 34.5, bx.y + 18.5, bx.w - 70, bx.h - 40);
      g.fillStyle = ink; g.textAlign = 'left'; g.fillText(title, bx.x + 34, bx.y + 8);
      g.fillStyle = mute; g.textAlign = 'center'; g.fillText(xl, bx.x + 34 + (bx.w - 70) / 2, bx.y + bx.h - 8);
      g.save(); g.translate(bx.x + 8, bx.y + 18 + (bx.h - 40) / 2); g.rotate(-Math.PI / 2); g.fillText(yl, 0, 0); g.restore();
    };
    // (a)
    {
      const bx = boxA, x0 = bx.x + 35, y0 = bx.y + 19, w = bx.w - 71, h = bx.h - 41;
      frame(bx, 'a  plants (solid), biomass (dashed, t)', 'years', 'plants');
      const xmax = Math.max(100, Math.ceil((n ? H.year[n - 1] : 0) / 100) * 100);
      let cmax = 10, bmax = 1;
      for (let i = 0; i < n; i++) { cmax = Math.max(cmax, H.c0[i], H.c1[i]); bmax = Math.max(bmax, H.b0[i], H.b1[i]); }
      cmax = Math.ceil(cmax / 10) * 10;
      g.fillStyle = mute; g.textAlign = 'right';
      g.fillText(String(cmax), x0 - 4, y0); g.fillText('0', x0 - 4, y0 + h);
      g.textAlign = 'left'; g.fillText(bmax >= 10 ? bmax.toFixed(0) + ' t' : bmax.toFixed(1) + ' t', x0 + w + 4, y0);
      g.textAlign = 'center'; g.fillText('0', x0, y0 + h + 9); g.fillText(String(xmax), x0 + w, y0 + h + 9);
      const line = (arr, max, color, dash) => {
        g.strokeStyle = color; g.lineWidth = 1.5; g.setLineDash(dash ? [4, 3] : []); g.beginPath();
        for (let i = 0; i < n; i++) { const X = x0 + w * H.year[i] / xmax, Y = y0 + h * (1 - arr[i] / max); i ? g.lineTo(X, Y) : g.moveTo(X, Y); }
        g.stroke(); g.setLineDash([]);
      };
      line(H.c0, cmax, SPECIES[0].chartHex, false); line(H.c1, cmax, SPECIES[1].chartHex, false);
      line(H.b0, bmax, SPECIES[0].chartHex, true); line(H.b1, bmax, SPECIES[1].chartHex, true);
      g.textAlign = 'right';
      g.fillStyle = SPECIES[1].chartHex; g.fillText('tolerant', x0 + w + 34, bx.y + 8);
      const tw = g.measureText('tolerant').width;
      g.fillStyle = SPECIES[0].chartHex; g.fillText('pioneer', x0 + w + 34 - tw - 10, bx.y + 8);
    }
    // (b)
    {
      const bx = boxB, x0 = bx.x + 35, y0 = bx.y + 19, w = bx.w - 71, h = bx.h - 41;
      frame(bx, 'b  self-thinning, stems ≥ 5 cm', 'log₁₀ density (trees/ha)', 'log₁₀ mean mass (kg)');
      let xa = Infinity, xb = -Infinity, ya = Infinity, yb = -Infinity, k = 0;
      for (let i = 0; i < n; i++) if (H.den[i] > 0 && H.mass[i] > 0) {
        const x = Math.log10(H.den[i]), y = Math.log10(H.mass[i]); xa = Math.min(xa, x); xb = Math.max(xb, x); ya = Math.min(ya, y); yb = Math.max(yb, y); k++;
      }
      if (k < 2) { g.fillStyle = mute; g.textAlign = 'center'; g.fillText('waiting for trees ≥ 5 cm', x0 + w / 2, y0 + h / 2); }
      else {
        xa = Math.floor(xa * 4) / 4; xb = Math.ceil(xb * 4) / 4 + 0.001; ya = Math.floor(ya * 2) / 2; yb = Math.ceil(yb * 2) / 2 + 0.001;
        if (xb - xa < 0.5) { const c = (xa + xb) / 2; xa = c - 0.25; xb = c + 0.25; }
        if (yb - ya < 1) { const c = (ya + yb) / 2; ya = c - 0.5; yb = c + 0.5; }
        const X = (x) => x0 + w * (x - xa) / (xb - xa), Y = (y) => y0 + h * (1 - (y - ya) / (yb - ya));
        g.fillStyle = mute; g.textAlign = 'right'; g.fillText(yb.toFixed(1), x0 - 4, y0); g.fillText(ya.toFixed(1), x0 - 4, y0 + h);
        g.textAlign = 'center'; g.fillText(xa.toFixed(2), x0, y0 + h + 9); g.fillText(xb.toFixed(2), x0 + w, y0 + h + 9);
        // −3/2 reference through the last point
        let li = n - 1; while (li > 0 && !(H.den[li] > 0 && H.mass[li] > 0)) li--;
        const lx = Math.log10(H.den[li]), ly = Math.log10(H.mass[li]);
        g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
        g.strokeStyle = '#adb5bd'; g.setLineDash([3, 3]); g.lineWidth = 1; g.beginPath();
        g.moveTo(X(xa), Y(ly - 1.5 * (xa - lx))); g.lineTo(X(xb), Y(ly - 1.5 * (xb - lx))); g.stroke(); g.setLineDash([]);
        g.strokeStyle = ink; g.lineWidth = 1.2; g.beginPath();
        let first = true;
        for (let i = 0; i < n; i++) {
          if (!(H.den[i] > 0 && H.mass[i] > 0)) continue;
          const px = X(Math.log10(H.den[i])), py = Y(Math.log10(H.mass[i]));
          first ? g.moveTo(px, py) : g.lineTo(px, py); first = false;
        }
        g.stroke();
        g.fillStyle = ink; g.beginPath(); g.arc(X(lx), Y(ly), 2.5, 0, TAU2); g.fill();
        g.restore();
        const fit = sim.thinningSlope();
        g.textAlign = 'right'; g.fillStyle = ink;
        g.fillText(Number.isFinite(fit.slope) ? `fit ${fit.slope.toFixed(2)} · dashed −3/2` : 'dashed −3/2', x0 + w + 34, bx.y + 8);
      }
    }
  }

  function drawStatus() {
    const st = sim.stats, p = sim.plants;
    const fmt = (v) => v.toLocaleString('en-US').replace(/,/g, ' ');
    if (sim.mode === 'single') {
      const t = p[0];
      status.textContent = t
        ? `year ${sim.year} · ${t.sp.label} · height ${t.height.toFixed(1)} m · stem ${(t.stemD * 100).toFixed(0)} cm · modules ${fmt(st.modules)} · ${sim.msStep.toFixed(2)} ms/step · seed ${seed}`
        : `year ${sim.year} · the tree has died · seed ${seed}`;
    } else {
      status.textContent = `year ${sim.year} · pioneer ${st.count[0]} · tolerant ${st.count[1]} · modules ${fmt(st.modules)} · ${sim.msStep.toFixed(2)} ms/step · seed ${seed}`;
    }
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (t - last) / 1000)); last = t;
    if (playing) {
      acc += dt * +speed.input.value;
      const n = Math.floor(acc);
      if (n > 0) {
        const t0 = performance.now(); let done = 0;
        while (done < n && performance.now() - t0 < 24) { sim.step(); done++; }
        acc = done < n ? 0 : acc - n;
        dirty = true;
        if (sim.mode === 'single' && sim.year >= 250) setPlaying(false);
      }
    }
    if (dirty) { updateInstances(); dirty = false; chartDirty = true; }
    frameCamera(false);
    if (chartDirty && t - lastChart > 200) { drawChart(); drawStatus(); lastChart = t; chartDirty = false; }
    controls.update();
    renderer.render(scene, camera);
  }

  function setPlaying(v) { playing = v; playBtn.textContent = v ? 'Pause' : 'Play'; }
  playBtn.addEventListener('click', () => setPlaying(!playing));
  resetBtn.addEventListener('click', () => api.reset());
  seedBtn.addEventListener('click', () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0 || 1; seed %= 100000; api.reset(); });
  modeSel.addEventListener('change', () => { syncVisibility(); speed.input.value = mode() === 'single' ? 4 : 8; speed.input.dispatchEvent(new Event('input')); api.reset(); });
  treeSel.addEventListener('change', () => api.reset());
  mix.input.addEventListener('change', () => api.reset());
  stol.input.addEventListener('input', () => { if (sim) sim.species[1].sTol = +stol.input.value / 100; });
  mq.addEventListener('change', () => { setAspect(); resize(); frameCamera(true); });

  const api = {
    start() {
      if (running) return;
      running = true;
      if (!renderer) init();
      ro.observe(view);
      resize();
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf); raf = 0;
      if (ro) ro.disconnect();
    },
    reset() {
      newSim();
      if (sim.mode === 'single' && !playing) setPlaying(true);
      if (renderer) { updateInstances(); drawChart(); drawStatus(); if (!running) renderer.render(scene, camera); }
    },
  };
  Object.defineProperty(api, 'debug', {
    enumerable: false,
    value: {
      advance(years) {
        if (!renderer) init();
        for (let i = 0; i < years; i++) sim.step();
        updateInstances(); frameCamera(true); drawChart(); drawStatus(); controls.update(); renderer.render(scene, camera);
        return this.counts();
      },
      counts() {
        const st = sim.stats, f = sim.thinningSlope();
        const tallest = sim.plants.reduce((m, p) => Math.max(m, p.height), 0);
        return { year: sim.year, pioneer: st.count[0], tolerant: st.count[1], modules: st.modules, msPerStep: +sim.msStep.toFixed(3),
          biomass_t: st.bio.map((b) => +b.toFixed(2)), trees5cm: st.trees, slope: f.slope, slopeN: f.n, tallest: +tallest.toFixed(2),
          branches: branchMesh ? branchMesh.count : 0, leaves: leafMesh ? leafMesh.count : 0 };
      },
      setMode(m, species) { modeSel.value = m; if (species != null) treeSel.value = String(species); syncVisibility(); api.reset(); },
      setPlaying, setSeed(s) { seed = s; api.reset(); },
      setMix(v) { mix.input.value = v; mix.input.dispatchEvent(new Event('input')); api.reset(); },
      setShadeTolerance(v) { stol.input.value = v; stol.input.dispatchEvent(new Event('input')); },
      get sim() { return sim; },
      get running() { return running; },
      get rafId() { return raf; },
      render() { if (!renderer) init(); updateInstances(); drawChart(); drawStatus(); controls.update(); renderer.render(scene, camera); },
      history() { const H = sim.hist; return Array.from({ length: H.n }, (_, i) => [H.year[i], H.c0[i], H.c1[i], +H.b0[i].toFixed(2), +H.b1[i].toFixed(2), +H.den[i].toFixed(1), +H.mass[i].toFixed(1)]); },
    },
  });
  newSim();
  drawStatus();
  return api;
}
