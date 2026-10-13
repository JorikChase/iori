/*
 * silviculture-region.js — the region level: a coarse per-cell vegetation + deadwood + humus model over the whole
 * terrain, after Cordonnier et al. 2017 (layers V per plant type, dead vegetation D, 1-year steps, stochastic events)
 * and the DeadWood line (Peytavie et al. 2024). Pure JS, no DOM.
 *
 * FROM THE SOURCES (via papers/study/2026-10-13-landscape-research.md §4–5)
 *  - Layers per cell: a cover V for each plant type, dead wood D, humus; yearly steps; events (windstorm) that move
 *    V into D; decay of D into humus, and humus raising fertility ("groves form on that fertile ground").
 *  - Background mortality p = 1 − 0.01^(1/A_max) ≈ 4.6/A_max per year (the researchers' derivation from SORTIE's
 *    0.010 and JABOWA's 1 %-survive-to-A_max rule, flagged as recall).
 *  - Deadwood decay k(T) = k_ref · 2.53^((T − 8)/10), Q10 = 2.53 (Mackensen et al. 2003); k_ref 0.01/yr for
 *    conifer and 0.03/yr for hardwood boles (Harmon et al. 1986, second-hand).
 *  - Biome from mean annual temperature and precipitation by a Whittaker lookup (boundaries from recall, flagged).
 *
 * OURS
 *  - Grid: the terrain sampled at 129 × 129 cells (~78 m on 10 km).
 *  - The plant types (pft) and which catalogue forms belong to each; their niches are the means of their forms'
 *    T_A, P_A with σ_T = 4 °C, σ_P = 600 mm at region scale; grass σ_T = 10 °C.
 *  - Cover dynamics: trees compete Lotka–Volterra style for the cell (Σ tree cover ≤ capacity); recruitment from
 *    the four neighbours (DISPERSE = 0.04/yr) and a regional seed rain (RAIN = 0.002/yr), both scaled by
 *    suitability and, under a canopy, by lerp(s_tol, 1, light) (the paper's shade-tolerance lerp); shrubs and
 *    grass grow in the light the trees leave (1 − 0.85·tree cover).
 *  - Growth rates r (per year), A_max, biomass per unit cover (t/ha) per type: see PFT below. For shrubs and grass
 *    A_max is the life span of the clonal cover (120 and 60 yr), not of a ramet: with ramet ages (40 and 8 yr) the
 *    background mortality (11 % and 44 %/yr) keeps the ground layer from ever establishing.
 *  - Material factor (trees / shrubs and grass): soil 1/1, wet meadow 1/1, sand 0.25/0.6, boulders 0.35/0.6, scree 0/0.45,
 *    bedrock 0/0.05, snow and water 0; but bedrock below 42° (the terrain's CLIFF_DEG; it is thin soil over rock)
 *    counts 0.55 for trees and 0.8 for shrubs and grass. Riparian trees need a shore: a river, lake or sea cell of the full terrain
 *    within one region cell (else 0.1 × wetness); other trees get half suitability on shore cells.
 *  - Fertility = 1 + 0.5·min(1, humus/HU_REF); 40 % of decayed wood becomes humus; humus mineralises at
 *    0.02/yr·Q10-scaled.
 *  - Windstorms: probability 0.2/yr, an ellipse 300–1500 m long along the wind, killing up to 70 % of tree cover,
 *    more on exposed (high, steep) cells.
 */
import { PLANTS } from './silviculture-plants.js';
import { makeRng } from './silviculture-core.js';

const CLIFF_RAD = 42 * Math.PI / 180, DISPERSE = 0.04, RAIN = 0.002, HU_REF = 40, P_STORM = 0.2, Q10 = 2.53;
export const PFT = [
  { key: 'conifer', tree: true, r: 0.05, Amax: 500, B: 280, sTol: 0.45, k: 0.01, sT: 4, sP: 600, draw: 0x55705f, nat: 0x2f4f36 },
  { key: 'broadleaf', tree: true, r: 0.06, Amax: 400, B: 300, sTol: 0.6, k: 0.03, sT: 4, sP: 600, draw: 0x8ea56d, nat: 0x557c34 },
  { key: 'pioneer', tree: true, r: 0.25, Amax: 60, B: 120, sTol: 0.1, k: 0.03, sT: 5, sP: 600, draw: 0xb3b878, nat: 0x8daa45 },
  { key: 'riparian', tree: true, r: 0.12, Amax: 120, B: 200, sTol: 0.3, k: 0.03, sT: 5, sP: 700, wetNeed: true, draw: 0x9fb58a, nat: 0x7fa04e },
  { key: 'palm', tree: true, r: 0.08, Amax: 80, B: 120, sTol: 0.4, k: 0.03, sT: 3, sP: 700, draw: 0x8fa36a, nat: 0x5e8a34 },
  { key: 'arid', tree: true, r: 0.05, Amax: 120, B: 60, sTol: 0.2, k: 0.03, sT: 4, sP: 250, draw: 0xb7b07e, nat: 0x8a8f4a },
  { key: 'shrub', tree: false, r: 0.2, Amax: 120, B: 25, sTol: 0.4, k: 0.03, sT: 5, sP: 600, draw: 0xa9a77a, nat: 0x6f8b3e },
  { key: 'grass', tree: false, r: 0.6, Amax: 60, B: 3, sTol: 0.2, k: 0.1, sT: 10, sP: 800, TA: 6, PA: 600, draw: 0xd6d6b0, nat: 0xa8b36a },
];
for (const t of PFT) {
  const m = PLANTS.filter((p) => p.pft === t.key);
  t.members = m.map((p) => p.key);
  if (m.length) { t.TA = m.reduce((a, p) => a + p.TA, 0) / m.length; t.PA = m.reduce((a, p) => a + p.PA, 0) / m.length; }
}
// Whittaker biomes (boundaries from recall, flagged): [name, T range, P range]
export const BIOMES = [
  { key: 'tundra', name: 'tundra / alpine', test: (T, P) => T < -2 },
  { key: 'boreal', name: 'boreal forest', test: (T, P) => T < 4 && P >= 300 },
  { key: 'temperate-rain', name: 'temperate rainforest', test: (T, P) => T < 18 && P >= 2000 },
  { key: 'temperate', name: 'temperate seasonal forest', test: (T, P) => T < 18 && P >= 700 },
  { key: 'woodland', name: 'woodland / shrubland', test: (T, P) => T < 18 && P >= 300 },
  { key: 'steppe', name: 'temperate grassland / desert', test: (T, P) => T < 18 },
  { key: 'tropical-rain', name: 'tropical rainforest', test: (T, P) => P >= 2500 },
  { key: 'tropical-seasonal', name: 'tropical seasonal forest / savanna', test: (T, P) => P >= 450 },
  { key: 'desert', name: 'subtropical desert', test: () => true },
];
export const biomeOf = (T, P) => BIOMES.findIndex((b) => b.test(T, P));
// material factor for trees / for shrubs and grass: nothing on bedrock, snow or water; only shrubs and grass on scree
const MAT_TREE = [0, 0, 1, 1, 0.25, 0, 0, 0.35], MAT_LOW = [0.05, 0.45, 1, 1, 0.6, 0, 0, 0.6]; // bedrock, scree, soil, wet meadow, sand, snow, water, boulders

/** the region's own grid: terrain fields sampled at n × n cell centres (vegetation at ~80 m is enough for 10 km) */
function resample(T, n) {
  const N = n * n, cell_m = T.size_m / (n - 1), o = { n, cell_m, size_m: T.size_m, climate: T.climate,
    height: new Float32Array(N), slope: new Float32Array(N), T: new Float32Array(N), P: new Float32Array(N), wetness: new Float32Array(N),
    material: new Uint8Array(N), waterKind: new Uint8Array(N) };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const s = T.sample(x * cell_m, y * cell_m), i = y * n + x;
    o.height[i] = s.h; o.slope[i] = s.slope; o.T[i] = s.T; o.P[i] = s.P; o.wetness[i] = s.wet; o.material[i] = s.material; o.waterKind[i] = s.waterKind;
  }
  // shore: any river, lake or sea cell of the full-resolution terrain within ~1 region cell (riparian habitat)
  o.shore = new Uint8Array(N);
  const tn = T.n, tc = T.cell_m, rr = Math.ceil(cell_m / tc);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (o.waterKind[y * n + x]) continue;
    const ci = Math.round(x * cell_m / tc), cj = Math.round(y * cell_m / tc);
    let near = 0;
    for (let b = -rr; b <= rr && !near; b++) for (let a = -rr; a <= rr; a++) { const ii = ci + a, jj = cj + b; if (ii >= 0 && jj >= 0 && ii < tn && jj < tn && T.waterKind[jj * tn + ii]) { near = 1; break; } }
    o.shore[y * n + x] = near;
  }
  return o;
}

export class RegionSim {
  constructor(terrain, { seed = 1, spinup = 0, cells = 129 } = {}) {
    this.terrain = terrain;
    this.t = resample(terrain, Math.min(cells, terrain.n)); this.n = this.t.n; this.rng = makeRng(seed * 977 + 13); this.year = 0;
    const N = this.n * this.n, K = PFT.length;
    this.V = PFT.map(() => new Float32Array(N)); this.D = new Float32Array(N); this.Hu = new Float32Array(N);
    this.s = PFT.map(() => new Float32Array(N)); this.biome = new Uint8Array(N); this.kd = new Float32Array(N);
    this.tmp = new Float32Array(N);
    this.events = []; this.hist = [];
    let wmin = Infinity, wmax = -Infinity; for (const v of this.t.wetness) { if (Number.isFinite(v)) { wmin = Math.min(wmin, v); wmax = Math.max(wmax, v); } }
    this.wn = new Float32Array(N); for (let i = 0; i < N; i++) this.wn[i] = Math.min(1, Math.max(0, (this.t.wetness[i] - wmin) / (wmax - wmin || 1)));
    this.climate();
    for (let k = 0; k < K; k++) for (let i = 0; i < N; i++) this.V[k][i] = 0.15 * this.s[k][i] * (PFT[k].tree ? 0.5 : 1);
    for (let y = 0; y < spinup; y++) this.step();
  }
  /** suitability per type per cell from T, P, wetness, material; biome per cell; decay rate per cell */
  climate(dT = 0, Pmul = 1) {
    const t = this.t, N = this.n * this.n;
    for (let i = 0; i < N; i++) {
      const T = t.T[i] + dT, P = t.P[i] * Pmul, wn = this.wn[i], Pe = P * (0.6 + 0.8 * wn), mt = t.material[i];
      this.biome[i] = biomeOf(T, P);
      this.kd[i] = Math.pow(Q10, (T - 8) / 10);
      for (let k = 0; k < PFT.length; k++) {
        const f = PFT[k], a = (T - f.TA) / f.sT, b = (Pe - f.PA) / f.sP;
        // bedrock below the cliff angle is thin soil over rock (the terrain marks slopes > 20° with < 5 cm of soil as
        // bedrock): trees and shrubs root in its fractures at reduced suitability; only cliffs (≥ 42°) are bare
        const thinRock = mt === 0 && t.slope[i] < CLIFF_RAD;
        let s = Math.exp(-0.5 * (a * a + b * b)) * (thinRock ? (f.tree ? 0.55 : 0.8) : (f.tree ? MAT_TREE[mt] : MAT_LOW[mt])) * (t.waterKind[i] ? 0 : 1);
        if (f.wetNeed) s *= t.shore[i] ? 1 : 0.1 * Math.min(1, Math.max(0, (wn - 0.6) / 0.3));
        else if (f.tree && t.shore[i]) s *= 0.5; // waterlogged shores favour riparian trees
        this.s[k][i] = s;
      }
    }
  }
  step() {
    const t = this.t, n = this.n, N = n * n, V = this.V, K = PFT.length, rng = this.rng;
    // a windstorm: an ellipse along the wind, killing tree cover, more on exposed cells
    let storm = null;
    if (rng.next() < P_STORM) {
      const wd = (t.climate && t.climate.windDir) || 0, ang = wd + Math.PI + rng.gauss() * 0.3;
      storm = { x: rng.next() * t.size_m, y: rng.next() * t.size_m, a: 300 + rng.next() * 1200, b: 150 + rng.next() * 400, ang, I: 0.3 + 0.7 * rng.next(), year: this.year };
      this.events.push(storm); if (this.events.length > 50) this.events.shift();
    }
    if (!this.hmax) { let h = 0; for (const v of t.height) h = Math.max(h, v); this.hmax = h; this.m0 = PFT.map((f) => 1 - Math.pow(0.01, 1 / f.Amax)); }
    const m0 = this.m0, hmax = this.hmax, tree = PFT.map((f) => f.tree), r = PFT.map((f) => f.r), sTol = PFT.map((f) => f.sTol), B = PFT.map((f) => f.B), kf = PFT.map((f) => f.k);
    const st = storm ? { c: Math.cos(storm.ang), s: Math.sin(storm.ang), ia: 1 / storm.a, ib: 1 / storm.b, cm: t.cell_m } : null;
    const wk = t.waterKind, Hu = this.Hu, D = this.D, kd = this.kd, S = this.s;
    for (let i = 0; i < N; i++) {
      if (wk[i]) continue;
      const x = i % n, y = (i / n) | 0;
      let trees = 0, und = 0;
      for (let k = 0; k < K; k++) { if (tree[k]) trees += V[k][i]; else und += V[k][i]; }
      const light = 1 - 0.85 * (trees < 1 ? trees : 1), fert = 1 + 0.5 * Math.min(1, Hu[i] / HU_REF), free = trees < 1 ? 1 - trees : 0;
      let inStorm = 0;
      if (st) { const px = x * st.cm - storm.x, py = y * st.cm - storm.y, u = (px * st.c + py * st.s) * st.ia, w = (-px * st.s + py * st.c) * st.ib; if (u * u + w * w < 1) inStorm = Math.min(0.7, storm.I * (0.4 + 0.6 * Math.min(1, t.height[i] / hmax + t.slope[i]))); }
      let dead = 0, kdead = 0;
      for (let k = 0; k < K; k++) {
        const Vk = V[k], v = Vk[i], sk = S[k][i], s = sk * fert;
        if (v === 0 && sk < 1e-4) continue;
        const nb = 0.25 * ((x > 0 ? Vk[i - 1] : v) + (x < n - 1 ? Vk[i + 1] : v) + (y > 0 ? Vk[i - n] : v) + (y < n - 1 ? Vk[i + n] : v));
        const sm = s < 1 ? s : 1;
        let dv;
        if (tree[k]) dv = r[k] * v * (sm - trees) + (DISPERSE * nb + RAIN) * s * (sTol[k] + (1 - sTol[k]) * light) * free;
        else dv = r[k] * v * (sm * light - v - 0.5 * (und - v)) + (DISPERSE * nb + RAIN) * s * light;
        const m = m0[k] + (sk < 0.03 ? 0.2 : 0);
        let nv = v + dv - m * v;
        let d = m * v * B[k];
        if (inStorm && tree[k]) { const kill = inStorm * nv; nv -= kill; d += kill * B[k]; }
        dead += d; kdead += d * kf[k];
        Vk[i] = nv < 0 ? 0 : nv > 1 ? 1 : nv;
      }
      // dead wood (t/ha) decays at k(T) = k_ref·Q10^((T−8)/10); 40 % of the loss becomes humus, humus mineralises slowly
      const kk = (dead > 0 ? kdead / dead : 0.02) * kd[i], loss = D[i] * (kk < 0.5 ? kk : 0.5);
      D[i] += dead - loss;
      Hu[i] += 0.4 * loss - Hu[i] * Math.min(0.2, 0.02 * kd[i]);
    }
    this.year++;
    this.record();
  }
  record() {
    const N = this.n * this.n; let D = 0, Hu = 0, land = 0;
    const cov = PFT.map(() => 0);
    for (let i = 0; i < N; i++) { if (this.t.waterKind[i]) continue; land++; D += this.D[i]; Hu += this.Hu[i]; for (let k = 0; k < PFT.length; k++) cov[k] += this.V[k][i]; }
    this.stats = { year: this.year, cover: cov.map((c) => c / land), D: D / land, Hu: Hu / land };
    this.hist.push(this.stats); if (this.hist.length > 2000) this.hist.shift();
  }
  /** layers at a point (x, y metres): cover per type, dead wood, humus, biome */
  at(x, y) {
    const n = this.n, c = this.t.cell_m, i = Math.min(n - 1, Math.max(0, Math.round(y / c))) * n + Math.min(n - 1, Math.max(0, Math.round(x / c)));
    return { cover: PFT.map((_, k) => this.V[k][i]), D: this.D[i], Hu: this.Hu[i], biome: this.biome[i], i };
  }
}
