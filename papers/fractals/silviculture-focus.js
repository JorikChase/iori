/*
 * silviculture-focus.js — the focus plot: an individual-plant ecosystem on a 200–300 m window of the region, with
 * mortality, snags, fallen logs that decay into humus, windthrow with pit-and-mound, nurse logs and ground cover.
 * Pure JS, no DOM. silviculture-env.js draws it.
 *
 * MODEL (plant scale, calibrated from the module model — Makowski et al. 2019 §3, §6; see silviculture-envsim history)
 *  - Each catalogue species (silviculture-plants.js) is grown once alone with the module model; the reference run
 *    gives, year by year, leaf-bearing modules N, height, crown radius, crown base, stem diameter, plus module
 *    skeletons at six sizes. A plant moves along its reference trajectory (equivalent age e) at the pace
 *    q = (Q_eff − Q_need)/(1 − Q_need), Q_need = (FOLIAGE·v̄_min + K_H·height/N)/α, Q_eff = lerp(s_tol, 1, Q·Q_G);
 *    it can carry at most N_final·o·fertility·senescence leaf-bearing modules (v̄_rootmax scaled by o, Eq. 11).
 *  - Climate adaptation o from the terrain's T and P at the plant (Gaussian niches, σ_T = 3 °C, σ_P = 500 mm, ours);
 *    nothing on bedrock, snow or water, only shrubs on scree, half on boulder fields, riparian forms within
 *    SHORE_M = 10 m of a river, lake or sea (× 0.08 elsewhere) (ours).
 *  - Seeding: flowering plants (F_eff = F_age·N_final/N) seed seedFreq·o seeds a year, Gaussian σ = radius/2; seeds
 *    establish where ground light Q_G ≥ 1 − s_tol, on soil (not bedrock, snow or water), ≥ STEM_GAP from a stem;
 *    plus a seed rain from the region (RAIN_SEEDS a year, species ∝ region cover × o).
 *
 * MORTALITY AND DEADWOOD (papers/study/2026-10-13-landscape-research.md §4; flagged items are recall there)
 *  - Background: p = 1 − 0.01^(1/A_max) per year with A_max = Table 4's p_max (the researchers' link, ≈ 4.6/A_max).
 *  - Suppression: 0.368 per year while the plant's vigour is below need (q < 0) (JABOWA, recall).
 *  - Senescence: after p_max the carrying capacity ramps to zero over max(5, 0.1·p_max) years (Makowski).
 *  - Windstorms (ours, after Cordonnier's event cascade): P_STORM = 0.06/yr, intensity I ∈ [0.3, 1], direction the
 *    region wind ± 0.3 rad; kill p = 0.18·I·σ((H − 18)/4)·(0.35 + 0.65·exposure), exposure = light at the crown;
 *    shallow soil (< 0.6 m) uproots 70 % of the kills, deeper soil 40 %; the rest snap at 30–70 % of the height.
 *    Fall direction: downwind ± 30° (recall).
 *  - A background or suppression death leaves a standing snag; snags shed fine branches (pruning threshold rises
 *    with snag age) and fall with an exponential half-life of 8 + 15·clamp((D − 0.1)/0.35) years (7–23 yr in the
 *    report), downslope if the ground slopes more than 8°, else in a random direction.
 *  - Logs keep the tree's trunk (drawn as the species' module skeleton near the camera), lose mass as
 *    M = M0·e^(−k t) with k(T) = k_ref·2.53^((T − 8)/10) (Q10 = 2.53, Mackensen et al. 2003), k_ref 0.01/yr
 *    conifer, 0.03/yr hardwood (Harmon et al. 1986, second-hand); snags decay at k/1.7 (logs ≈ 1.7× faster).
 *    Decay class = 1 + ⌊5·(1 − M/M0)^0.7⌋, capped at 5 (the researchers' mapping uses 4, which reaches class 5 only
 *    at zero mass; ours lets the mound show): 1 bark intact, 2 bark loss, 3 sagging and moss, 4 fragmenting,
 *    5 a mound. Below 12 % of its mass a log becomes humus in the cells under it.
 *  - Only stems of at least MIN_DEAD_D = 8 cm leave snags or logs; thinner stems vanish into the litter (ours).
 *  - Humus raises fertility, 1 + 0.6·min(1, humus/HU_REF), HU_REF = 3 kg/m², which scales growth pace and the
 *    carrying capacity (ours); inputs are decayed logs and litterfall (LITTER = 0.065 kg per leaf-bearing module
 *    per year, about 0.06 kg/m²/yr under a closed canopy); humus mineralises at 0.02/yr·Q10-scaled.
 *  - Nurse logs: seeds of species with s_tol ≥ 0.45 that land on a class 3–4 log may establish on it even where
 *    the ground is crowded, at most one seedling per 3 m of log, still ≥ STEM_GAP from a stem (ours, after the
 *    nurse-log effect, recall).
 *  - Pit-and-mound: an uprooted tree leaves a pit of radius = root plate and a mound beside it; they persist and
 *    flatten with a 600-year time constant (radiocarbon-dated mounds outlast 1000 years, Schaetzl & Follmer 1990).
 *    Root plate radius 0.8 + 3·D m (ours).
 *  - Ground cover (ours): grass, herb and fern densities per 4 m cell from ground light, wetness and humus,
 *    updated every 2 years.
 *
 * Reference individuals: VARIANTS = 4 per species (seeds 5, 982, 1959, 2936), snapshots every 3 years, six kept.
 * OTHER CONSTANTS (ours): STEM_GAP 1.5 m, N_INIT 1400 plants at random equivalent ages, MAX_PLANTS 5000, shade grid
 * 4 m × 3 m × 16 layers following the terrain, crown hash 8 m, K_SH_N 0.35 per leaf-bearing module, SHRINK 2,
 * REF_YEARS 160, initial logs from the region's dead wood (at most 300, random decay states), RAIN_SEEDS 120/yr.
 */
import { Sim, makeRng, ALPHA_BH, V_MIN, FOLIAGE, K_H, C_COL, F_MIN } from './silviculture-core.js';
import { PLANTS, speciesOf } from './silviculture-plants.js';
import { PFT } from './silviculture-region.js';

const SIG_T = 3, SIG_P = 500, STEM_GAP = 1.5, MAX_PLANTS = 5000, N_INIT = 1400, K_SH_N = 0.35, REF_YEARS = 160, SHRINK = 2;
const SC = 4, SL = 3, SNL = 16, HC = 8, RAIN_SEEDS = 120, MAX_INIT_LOGS = 300;
const P_STORM = 0.06, HU_REF = 3, HUMUS_AT = 0.12, Q10 = 2.53, SUPP = 0.368, MIN_DEAD_D = 0.08, LITTER = 0.065;
const BLOCK = [1, 0, 0, 0, 0, 1, 1, 0]; // material: bedrock, scree, soil, wet meadow, sand, snow, water, boulders
const SHORE_M = 10, CLIFF_RAD = 42 * Math.PI / 180; // bedrock below 42° is thin soil over rock: plants grow at × 0.55 // riparian habitat: within 10 m of a river, lake or sea (ours)

/**
 * Grow every catalogue species alone with the module model; yields between chunks; returns { key: ref }.
 * ref.N/H/R/CB/D: the trajectory of variant 0 (the plant-scale sim moves along it). ref.variants[v]: six skeleton
 * snapshots (at 6, 15, 30, 50, 75, 100 % of that individual's final leaf-bearing modules) of VARIANTS individuals
 * grown from different seeds, so no two neighbours need share a silhouette; ref.snaps = ref.variants[0].
 * One pass per individual: a snapshot is kept every SNAP_EVERY years and the six nearest the targets are chosen.
 */
export const VARIANTS = 4, SNAP_EVERY = 3;
export function* buildRefs(keys = PLANTS.map((p) => p.key), V = VARIANTS) {
  const refs = {}, fr = [0.06, 0.15, 0.3, 0.5, 0.75, 1.0];
  for (const key of keys) {
    const d = PLANTS.find((p) => p.key === key), sp = speciesOf(d);
    const Y = Math.min(REF_YEARS, Math.round(sp.pmax * 0.9));
    const ref = { key, N: new Float32Array(Y + 1), H: new Float32Array(Y + 1), R: new Float32Array(Y + 1), CB: new Float32Array(Y + 1), D: new Float32Array(Y + 1), Y, variants: [] };
    for (let v = 0; v < V; v++) {
      const sim = new Sim({ seed: 5 + 977 * v, mode: 'single', speciesList: [sp], single: 0 });
      const kept = []; let Nmax = 1;
      for (let y = 0; y <= Y; y++) {
        if (y > 0) sim.step();
        const p = sim.plants[0];
        if (!p) { if (v === 0) for (const a of ['N', 'H', 'R', 'CB', 'D']) ref[a][y] = ref[a][y - 1]; continue; }
        let n = 0, r = 0.2, cb = Infinity;
        for (const m of p.mods) if (m.nLive) { n++; if (v === 0) { r = Math.max(r, Math.hypot(m.cx - p.x, m.cz - p.z) + 0.6 * m.r); cb = Math.min(cb, m.cy - 0.5 * m.r); } }
        Nmax = Math.max(Nmax, n);
        if (v === 0) {
          ref.N[y] = Math.max(n, y ? ref.N[y - 1] : 1); ref.H[y] = Math.max(p.height, 0.2, y ? ref.H[y - 1] : 0); ref.R[y] = Math.max(r, y ? ref.R[y - 1] : 0);
          ref.CB[y] = Math.max(0, Math.min(cb === Infinity ? 0 : cb, ref.H[y] * 0.8)); ref.D[y] = Math.max(p.stemD, y ? ref.D[y - 1] : 0);
        }
        if (y > 0 && (y % SNAP_EVERY === 0 || y === Y)) kept.push({ year: y, N: Math.max(n, kept.length ? kept[kept.length - 1].N : 0), H: p.height, plant: snapshot(p) });
        if (y % 20 === 0) yield key;
      }
      const snaps = fr.map((f) => { let best = kept[0], bd = Infinity; for (const k of kept) { const dd = Math.abs(k.N - f * Nmax); if (dd < bd) { bd = dd; best = k; } } return best; });
      ref.variants.push(snaps.filter(Boolean));
    }
    ref.snaps = ref.variants[0];
    refs[key] = ref;
  }
  return refs;
}
function snapshot(p) {
  const mods = p.mods.map((m) => ({ proto: m.proto, nw: Float32Array.from(m.nw), segL: Float32Array.from(m.segL), dMax: Float32Array.from(m.dMax),
    nLive: m.nLive, bud: Uint8Array.from(m.bud), Q: m.Q, QG: m.QG, age: m.age, id: m.id, isAxis: m.isAxis }));
  for (const m of mods) for (let j = 0; j < m.nw.length; j += 3) { m.nw[j] -= p.x; m.nw[j + 2] -= p.z; }
  return { mods, sp: p.sp, capF: 1, height: p.height };
}

export class FocusSim {
  /**
   * plot: a Terrain-like crop (n, cell_m, size_m, height, T, P, wetness, material, waterKind, soil, slope), local
   * coordinates x east, y north in [0, size_m]. refs: from buildRefs. region: { cover[], D, Hu } at the plot.
   */
  constructor({ seed = 1, plot, refs, region = null, windDir = 0, dT = 0, Pmul = 1 }) {
    this.seed = seed; this.rng = makeRng(seed * 7 + 3); this.plot = plot; this.refs = refs; this.windDir = windDir;
    this.W = plot.size_m; this.year = 0; this.nextId = 1; this.msHist = new Float32Array(20); this.msN = 0; this.msStep = 0;
    this.species = PLANTS.filter((d) => refs[d.key]).map((d, i) => {
      const sp = speciesOf(d), r = refs[d.key];
      return { ...sp, idx: i, def: d, Nf: r.N[r.Y], kref: d.wood === 'soft' ? 0.01 : 0.03, pft: PFT.findIndex((f) => f.key === d.pft) };
    });
    this.enabled = this.species.map(() => true);
    const n = plot.n, N = n * n;
    this.n = n; this.cell = plot.cell_m;
    let wmin = Infinity, wmax = -Infinity; for (const v of plot.wetness) if (Number.isFinite(v)) { wmin = Math.min(wmin, v); wmax = Math.max(wmax, v); }
    this.wn = new Float32Array(N); for (let i = 0; i < N; i++) this.wn[i] = Math.min(1, Math.max(0, (plot.wetness[i] - wmin) / (wmax - wmin || 1)));
    this.o = this.species.map(() => new Float32Array(N)); this.kT = new Float32Array(N);
    this.shore = shoreMask(plot);
    this.dT = dT; this.Pmul = Pmul; this.climate();
    this.humus = new Float32Array(N);
    const SNX = this.SNX = Math.ceil(this.W / SC);
    this.dep = new Float32Array(SNX * SNX * SNL); this.tau = new Float32Array(SNX * SNX * SNL);
    this.layA = new Float32Array(SNX * SNX); this.layB = new Float32Array(SNX * SNX);
    const HNX = this.HNX = Math.ceil(this.W / HC);
    this.cellStart = new Int32Array(HNX * HNX + 1); this.cellFill = new Int32Array(HNX * HNX + 1);
    const GN = this.GN = Math.ceil(this.W / 2);
    this.stemHead = new Int32Array(GN * GN); this.stemNext = new Int32Array(MAX_PLANTS + 64); this.stemP = new Array(MAX_PLANTS + 64);
    this.GC = Math.ceil(this.W / 4); this.cover = { grass: new Float32Array(this.GC * this.GC), herb: new Float32Array(this.GC * this.GC), fern: new Float32Array(this.GC * this.GC), moss: new Float32Array(this.GC * this.GC) };
    this.plants = []; this.snags = []; this.logs = []; this.pits = []; this.storms = [];
    this.deaths = { background: 0, suppression: 0, senescence: 0, wind: 0 }; this.hist = [];
    this.region = region;
    this.seedFromRegion(region);
  }

  // ------------------------------------------------------------------ fields
  ci(x, y) { const n = this.n, c = this.cell; return Math.min(n - 1, Math.max(0, Math.round(y / c))) * n + Math.min(n - 1, Math.max(0, Math.round(x / c))); }
  groundAt(x, y) {
    const n = this.n, c = this.cell, h = this.plot.height;
    const fx = Math.min(n - 1.0001, Math.max(0, x / c)), fy = Math.min(n - 1.0001, Math.max(0, y / c)), ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, i = iy * n + ix;
    return (h[i] * (1 - tx) + h[i + 1] * tx) * (1 - ty) + (h[i + n] * (1 - tx) + h[i + n + 1] * tx) * ty;
  }
  blocked(c) { const m = this.plot.material[c]; return (BLOCK[m] === 1 && !(m === 0 && this.plot.slope[c] < CLIFF_RAD)) || this.plot.waterKind[c] > 0; }
  climate() {
    const p = this.plot, N = this.n * this.n;
    for (let i = 0; i < N; i++) {
      const T = p.T[i] + this.dT, Pe = p.P[i] * this.Pmul * (0.6 + 0.8 * this.wn[i]), scree = p.material[i] === 1;
      this.kT[i] = Math.pow(Q10, (T - 8) / 10);
      for (const sp of this.species) {
        const a = (T - sp.TA) / SIG_T, b = (Pe - sp.PA) / SIG_P;
        let o = Math.exp(-0.5 * (a * a + b * b));
        if (scree && sp.def.pft !== 'shrub') o = 0;                    // only shrubs root in scree
        if (p.material[i] === 7) o *= 0.5;                             // boulder fields: thin soil
        if (p.material[i] === 0) o *= sp.def.pft === 'shrub' ? 0.8 : 0.55;  // thin soil over rock (cliffs are blocked)
        if (sp.def.pft === 'riparian') o *= this.shore[i] ? 1 : 0.08;  // willows and poplars keep to the water
        else if (this.shore[i] && sp.def.pft !== 'shrub') o *= 0.5;     // waterlogged banks
        this.o[sp.idx][i] = o;
      }
    }
  }
  setClimate(dT, Pmul) { this.dT = dT; this.Pmul = Pmul; this.climate(); }

  // ------------------------------------------------------------------ setup from the region
  seedFromRegion(region) {
    const rng = this.rng, W = this.W;
    const pftW = region ? region.cover : PFT.map(() => 0.2);
    const weight = (s, c) => { const sp = this.species[s]; return (sp.pft >= 0 ? (pftW[sp.pft] || 0) + 0.02 : 0.02) * this.o[s][c] * sp.seedFreq; };
    for (let i = 0, tries = 0; i < N_INIT && tries < N_INIT * 30; tries++) {
      const x = rng.next() * W, y = rng.next() * W, c = this.ci(x, y);
      if (this.blocked(c)) continue;
      let tot = 0; for (let s = 0; s < this.species.length; s++) tot += weight(s, c);
      if (tot <= 0) continue;
      let u = rng.next() * tot, s = 0; for (; s < this.species.length - 1; s++) { u -= weight(s, c); if (u <= 0) break; }
      const sp = this.species[s];
      if (this.o[s][c] * sp.Nf < 1) continue;
      const p = this.addPlant(s, x, y);
      const r = this.refs[sp.key]; p.e = rng.next() * r.Y * 0.85; p.age = Math.round(p.e * (1 + 0.5 * rng.next())); this.geom(p);
      i++;
    }
    // initial dead wood from the region's D (t/ha): logs at random decay states, a few snags
    const D = region ? region.D : 40, area_ha = (W * W) / 1e4;
    const nLogs = Math.min(MAX_INIT_LOGS, Math.round(D * area_ha / 0.8 * 0.15));
    for (let k = 0; k < nLogs; k++) {
      const x = rng.next() * W, y = rng.next() * W, c = this.ci(x, y);
      if (this.blocked(c)) continue;
      const s = (rng.next() * this.species.length) | 0, sp = this.species[s], r = this.refs[sp.key], e = r.Y * (0.3 + 0.7 * rng.next());
      const H = r.H[e | 0], Dm = Math.max(0.08, r.D[e | 0]);
      const log = this.makeLog(sp, x, y, rng.next() * Math.PI * 2, H, Dm, 0);
      const frac = 0.2 + 0.8 * rng.next(); log.M = log.M0 * frac; log.age = Math.log(1 / frac) / log.k; log.cls = classOf(frac);
      this.logs.push(log);
    }
    if (region) for (let i = 0; i < this.humus.length; i++) this.humus[i] = Math.min(HU_REF, region.Hu * 0.1);
    this.shade(); this.groundCover(); this.record();
  }

  addPlant(s, x, y) {
    const c = this.ci(x, y);
    const p = { id: this.nextId++, s, x, y, c, gy: this.groundAt(x, y), age: 0, e: 0, H: 0.2, flowering: false, capF: 1, dead: false,
      rot: this.rng.next() * Math.PI * 2, jit: this.rng.next(), N: 1, R: 0.2, CB: 0, D: 0.01, Qeff: 1, q: 1, o: this.o[s][c], lean: 0, leanDir: 0 };
    this.geom(p);
    this.plants.push(p);
    return p;
  }
  geom(p) {
    const r = this.refs[this.species[p.s].key], e = Math.min(r.Y, Math.max(0, p.e)), i = Math.min(r.Y - 1, e | 0), f = e - i;
    const L = (a) => a[i] * (1 - f) + a[i + 1] * f;
    p.N = L(r.N); p.H = Math.max(p.H, L(r.H)); p.R = L(r.R); p.CB = Math.min(L(r.CB), p.H * 0.8); p.D = Math.max(p.D, L(r.D));
  }
  eOfN(s, N) { const r = this.refs[this.species[s].key]; let y = 0; while (y < r.Y && r.N[y + 1] <= N) y++; return y; }

  // ------------------------------------------------------------------ light
  layerOf(p) { return Math.min(SNL - 1, Math.max(0, Math.floor((p.CB + p.H) * 0.5 / SL))); }
  sIndex(x, y, layer) { const S = this.SNX, ix = Math.min(S - 1, Math.max(0, Math.floor(x / SC))), iy = Math.min(S - 1, Math.max(0, Math.floor(y / SC))); return (ix * S + iy) * SNL + layer; }
  shade() {
    const dep = this.dep, tau = this.tau, S = this.SNX;
    dep.fill(0);
    for (const p of this.plants) {
      if (p.dead) continue;
      const ly = this.layerOf(p) - 1; if (ly < 0) continue;
      const rc = p.R / SC + 0.5, Rr = Math.ceil(rc), ix0 = Math.floor(p.x / SC), iy0 = Math.floor(p.y / SC);
      let cnt = 0;
      for (let a = -Rr; a <= Rr; a++) for (let b = -Rr; b <= Rr; b++) { if (a * a + b * b > rc * rc) continue; const ix = ix0 + a, iy = iy0 + b; if (ix >= 0 && iy >= 0 && ix < S && iy < S) cnt++; }
      if (!cnt) continue;
      const t = K_SH_N * p.N / cnt;
      for (let a = -Rr; a <= Rr; a++) for (let b = -Rr; b <= Rr; b++) {
        if (a * a + b * b > rc * rc) continue; const ix = ix0 + a, iy = iy0 + b; if (ix < 0 || iy < 0 || ix >= S || iy >= S) continue;
        dep[(ix * S + iy) * SNL + ly] += t;
      }
    }
    let prev = this.layA, cur = this.layB; prev.fill(0);
    for (let l = SNL - 1; l >= 0; l--) {
      for (let ix = 0; ix < S; ix++) for (let iy = 0; iy < S; iy++) {
        const c = ix * S + iy, mid = prev[c];
        const v = 0.5 * mid + 0.125 * ((ix > 0 ? prev[c - S] : mid) + (ix < S - 1 ? prev[c + S] : mid) + (iy > 0 ? prev[c - 1] : mid) + (iy < S - 1 ? prev[c + 1] : mid)) + dep[c * SNL + l];
        cur[c] = v; tau[c * SNL + l] = v;
      }
      const t = prev; prev = cur; cur = t;
    }
  }
  groundLight(x, y) { return Math.exp(-this.tau[this.sIndex(x, y, 0)]); }

  hashCrowns() {
    const n = this.plants.length, start = this.cellStart, H = this.HNX;
    if (!this.hcx || this.hcx.length < n) { const c = Math.max(1024, n * 2); this.hcx = new Float32Array(c); this.hcy = new Float32Array(c); this.hcz = new Float32Array(c); this.hcr = new Float32Array(c); this.hid = new Int32Array(c); this.hcell = new Int32Array(c); }
    start.fill(0); let rMax = 0;
    for (let i = 0; i < n; i++) {
      const p = this.plants[i], ix = Math.min(H - 1, Math.max(0, Math.floor(p.x / HC))), iy = Math.min(H - 1, Math.max(0, Math.floor(p.y / HC))), c = iy * H + ix;
      this.hcell[i] = c; start[c + 1]++;
      p.cr = Math.max(p.R, 0.5 * (p.H - p.CB), 0.15); p.cy = p.gy + 0.5 * (p.H + p.CB); if (p.cr > rMax) rMax = p.cr;
    }
    for (let c = 0; c < H * H; c++) start[c + 1] += start[c];
    this.cellFill.set(start);
    for (let i = 0; i < n; i++) { const p = this.plants[i], j = this.cellFill[this.hcell[i]]++; this.hcx[j] = p.x; this.hcy[j] = p.cy; this.hcz[j] = p.y; this.hcr[j] = p.cr; this.hid[j] = i; }
    this.rMax = rMax;
  }
  overlap(i, p) {
    const R = p.cr + this.rMax, r = p.cr, iV = 1 / (4.18879 * r * r * r), start = this.cellStart, H = this.HNX;
    const ix0 = Math.max(0, Math.floor((p.x - R) / HC)), ix1 = Math.min(H - 1, Math.floor((p.x + R) / HC)), iy0 = Math.max(0, Math.floor((p.y - R) / HC)), iy1 = Math.min(H - 1, Math.floor((p.y + R) / HC));
    let f = 0, ax = 0, ay = 0;
    for (let iy = iy0; iy <= iy1; iy++) {
      const j0 = start[iy * H + ix0], j1 = start[iy * H + ix1 + 1];
      for (let j = j0; j < j1; j++) {
        if (this.hid[j] === i) continue;
        const a = this.hcx[j] - p.x, b = this.hcy[j] - p.cy, c = this.hcz[j] - p.y, wr = this.hcr[j], rs = r + wr, d2 = a * a + b * b + c * c;
        if (d2 >= rs * rs) continue;
        const d = Math.sqrt(d2); let v;
        if (d <= Math.abs(r - wr)) { const m = Math.min(r, wr); v = 4.18879 * m * m * m; } else { const t = rs - d; v = Math.PI * t * t * (d2 + 2 * d * rs - 3 * (r - wr) * (r - wr)) / (12 * d); }
        f += v * iV; ax -= a * v; ay -= c * v; // crowd vector: crowns lean away from their neighbours
      }
    }
    const al = Math.hypot(ax, ay); p.lean = Math.min(1, al * iV * 0.5 / Math.max(0.5, r)); p.leanDir = Math.atan2(ay, ax);
    return f;
  }

  // ------------------------------------------------------------------ the year
  step() {
    const t0 = performance.now(), rng = this.rng;
    this.shade(); this.hashCrowns();
    const storm = rng.next() < P_STORM ? { I: 0.3 + 0.7 * rng.next(), dir: this.windDir + Math.PI + rng.gauss() * 0.3, year: this.year } : null;
    if (storm) { storm.kills = 0; this.storms.push(storm); }
    for (let i = 0; i < this.plants.length; i++) {
      const p = this.plants[i], sp = this.species[p.s];
      if (!this.enabled[p.s]) { p.dead = true; continue; }
      const QG = Math.exp(-this.tau[this.sIndex(p.x, p.y, this.layerOf(p))]);
      const Q = Math.exp(-C_COL * this.overlap(i, p));
      p.Qeff = sp.sTol + (1 - sp.sTol) * Q * QG;
      p.o = this.o[p.s][p.c];
      p.age += 1;
      if (p.age >= sp.pmax) p.capF = Math.max(0, 1 - (p.age - sp.pmax) / Math.max(5, 0.1 * sp.pmax));
      const fert = 1 + 0.6 * Math.min(1, this.humus[p.c] / HU_REF);
      const Nmax = sp.Nf * Math.min(1, p.o * fert) * p.capF;
      const need = (FOLIAGE * V_MIN + K_H * p.H / Math.max(1, p.N)) / ALPHA_BH;
      const q = (p.Qeff - need) / Math.max(0.05, 1 - need); p.q = q;
      if (p.N > Nmax) p.e -= Math.max(0.5, 0.25 * (p.e - this.eOfN(p.s, Nmax)));
      else if (q >= 0) p.e = Math.min(p.e + q * fert, this.refs[sp.key].Y);
      else p.e += q * SHRINK;
      this.geom(p);
      // death
      let cause = null;
      if (p.e < 0 || Nmax < 1) cause = p.capF < 1 ? 'senescence' : 'suppression';
      else if (rng.next() < 1 - Math.pow(0.01, 1 / sp.pmax)) cause = 'background';
      else if (q < 0 && rng.next() < SUPP) cause = 'suppression';
      else if (storm && p.H > 6) {
        const pk = 0.18 * storm.I / (1 + Math.exp(-(p.H - 18) / 4)) * (0.35 + 0.65 * QG);
        if (rng.next() < pk) cause = 'wind';
      }
      if (cause) this.kill(p, cause, storm);
      else if (!p.flowering && p.age >= Math.max(F_MIN, sp.Fage * sp.Nf / Math.max(1, p.N))) p.flowering = true;
    }
    this.reproduce();
    this.deadwood();
    let w = 0; for (const p of this.plants) if (!p.dead) this.plants[w++] = p; this.plants.length = w;
    this.year++;
    if (this.year % 2 === 0) this.groundCover();
    this.record();
    const ms = performance.now() - t0; this.msHist[this.msN++ % 20] = ms;
    let s = 0; const k = Math.min(this.msN, 20); for (let i = 0; i < k; i++) s += this.msHist[i]; this.msStep = s / k;
  }

  kill(p, cause, storm) {
    p.dead = true; this.deaths[cause]++;
    const sp = this.species[p.s];
    if (p.D < MIN_DEAD_D) return; // thin stems vanish into the litter
    if (cause === 'wind') {
      storm.kills++;
      const dir = storm.dir + (this.rng.next() - 0.5) * 1.05;
      const soil = this.plot.soil ? this.plot.soil[p.c] : 1, uproot = this.rng.next() < (soil < 0.6 ? 0.7 : 0.4);
      if (uproot) {
        const plate = Math.min(3, 0.8 + 3 * p.D);
        this.logs.push(this.makeLog(sp, p.x, p.y, dir, p.H, p.D, plate, p));
        this.pits.push({ x: p.x, y: p.y, gy: p.gy, r: plate, dir, age: 0, depth: 0.35 * plate });
      } else {
        const h = p.H * (0.3 + 0.4 * this.rng.next());
        this.snags.push(this.makeSnag(sp, p, h, true));
        const log = this.makeLog(sp, p.x + Math.cos(dir) * 0.5, p.y + Math.sin(dir) * 0.5, dir, p.H - h, p.D * 0.75, 0, p); log.z0 = h * 0.15; this.logs.push(log);
      }
    } else this.snags.push(this.makeSnag(sp, p, p.H, false));
  }
  makeSnag(sp, p, h, snapped) {
    const D = p.D, M0 = 0.5 * Math.PI / 4 * D * D * h * 500;
    return { id: this.nextId++, s: p.s, x: p.x, y: p.y, gy: p.gy, H: h, fullH: p.H, D, R: p.R, CB: p.CB, N: p.N, M0, M: M0, k: sp.kref * this.kT[p.c] / 1.7,
      age: 0, half: 8 + 15 * Math.min(1, Math.max(0, (D - 0.1) / 0.35)), snapped, rot: p.rot, sp: p.s };
  }
  makeLog(sp, x, y, dir, L, D, plate, p) {
    const c = this.ci(x, y), M0 = 0.5 * Math.PI / 4 * D * D * L * 500;
    return { id: this.nextId++, s: sp.idx, x, y, dir, L, D, M0, M: M0, k: sp.kref * this.kT[c], cls: 1, age: 0, plate, N: p ? p.N : 10, H: L, R: p ? p.R : L * 0.2, rot: p ? p.rot : 0, z0: 0 };
  }

  deadwood() {
    const rng = this.rng;
    // snags: decay standing, then fall with their half-life
    let w = 0;
    for (const s of this.snags) {
      s.age++; s.M *= Math.exp(-s.k);
      if (rng.next() < Math.LN2 / s.half) {
        const c = this.ci(s.x, s.y), sl = this.plot.slope[c];
        let dir = rng.next() * Math.PI * 2;
        if (sl > 8 * Math.PI / 180) { const n = this.n, i = c, hx = this.plot.height[Math.min(i + 1, n * n - 1)] - this.plot.height[Math.max(i - 1, 0)], hy = this.plot.height[Math.min(i + n, n * n - 1)] - this.plot.height[Math.max(i - n, 0)]; dir = Math.atan2(-hy, -hx); }
        const log = this.makeLog(this.species[s.s], s.x, s.y, dir, s.H, s.D, 0, s); log.M0 = s.M0; log.M = s.M; log.age = 0;
        this.logs.push(log);
      } else this.snags[w++] = s;
    }
    this.snags.length = w;
    // logs: exponential mass loss, decay classes, humus
    w = 0;
    for (const L of this.logs) {
      L.age++; L.M *= Math.exp(-L.k);
      const f = L.M / L.M0; L.cls = classOf(f);
      if (f < HUMUS_AT) { this.toHumus(L); continue; }
      this.logs[w++] = L;
    }
    this.logs.length = w;
    for (const p of this.pits) p.age++;
    // litterfall from living crowns humifies in the cell under the plant; humus mineralises slowly
    for (const p of this.plants) if (!p.dead) this.humus[p.c] += LITTER * p.N / (this.cell * this.cell);
    for (let i = 0; i < this.humus.length; i++) this.humus[i] -= this.humus[i] * Math.min(0.2, 0.02 * this.kT[i]);
  }
  toHumus(L) {
    const steps = Math.max(1, Math.round(L.L / this.cell)), per = L.M / steps / (this.cell * this.cell); // kg per m² per cell
    for (let k = 0; k < steps; k++) { const t = (k + 0.5) / steps, c = this.ci(L.x + Math.cos(L.dir) * L.L * t, L.y + Math.sin(L.dir) * L.L * t); this.humus[c] += per; }
  }

  reproduce() {
    const rng = this.rng, W = this.W;
    this.stemHash();
    let alive = 0; for (const p of this.plants) if (!p.dead) alive++;
    const n0 = this.plants.length;
    const tryAt = (s, x, y) => {
      if (alive >= MAX_PLANTS || x < 0.5 || y < 0.5 || x > W - 0.5 || y > W - 0.5) return false;
      const c = this.ci(x, y), sp = this.species[s];
      if (this.blocked(c) || this.o[s][c] * sp.Nf < 1) return false;
      const gl = this.groundLight(x, y), fert = 1 + 0.6 * Math.min(1, this.humus[c] / HU_REF);
      let ok = gl >= 1 - sp.sTol && !this.stemBlocked(x, y), nurse = null;
      if (!ok && sp.sTol >= 0.45 && sp.def.pft !== 'riparian' && gl >= (1 - sp.sTol) * 0.6 && !this.stemBlocked(x, y)) { // nurse log: a class 3–4 log under the seed
        const L = this.logAt(x, y, 0.6);
        if (L && (L.cls === 3 || L.cls === 4) && (L.nursed || 0) < L.L / 3) { ok = true; nurse = L; L.nursed = (L.nursed || 0) + 1; }
      }
      if (!ok || rng.next() > 0.5 * fert) return false;
      const np = this.addPlant(s, x, y); this.stemAdd(np); alive++;
      if (nurse) { np.onLog = nurse.id; np.gy += nurse.D * 0.5; this.nurseCount = (this.nurseCount || 0) + 1; }
      return true;
    };
    for (let i = 0; i < n0; i++) {
      const p = this.plants[i];
      if (p.dead || !p.flowering || p.capF < 1) continue;
      const sp = this.species[p.s], expct = sp.seedFreq * p.o;
      let k = Math.floor(expct) + (rng.next() < expct % 1 ? 1 : 0);
      for (; k > 0; k--) tryAt(p.s, p.x + rng.gauss() * sp.seedRadius / 2, p.y + rng.gauss() * sp.seedRadius / 2);
    }
    // seed rain from the region around the plot
    const cov = this.region ? this.region.cover : null;
    for (let k = 0; k < RAIN_SEEDS; k++) {
      const x = rng.next() * W, y = rng.next() * W, c = this.ci(x, y);
      let tot = 0; const wts = this.species.map((sp, s) => { const w = this.enabled[s] ? ((cov && sp.pft >= 0 ? cov[sp.pft] : 0.2) + 0.02) * this.o[s][c] * sp.seedFreq : 0; tot += w; return w; });
      if (tot <= 0) continue;
      let u = rng.next() * tot, s = 0; for (; s < wts.length - 1; s++) { u -= wts[s]; if (u <= 0) break; }
      tryAt(s, x, y);
    }
  }
  logAt(x, y, r) {
    for (const L of this.logs) {
      const dx = x - L.x, dy = y - L.y, t = dx * Math.cos(L.dir) + dy * Math.sin(L.dir);
      if (t < 0 || t > L.L) continue;
      if (Math.abs(-dx * Math.sin(L.dir) + dy * Math.cos(L.dir)) < r + L.D * 0.5) return L;
    }
    return null;
  }
  stemHash() { this.stemHead.fill(-1); this.ns = 0; for (const p of this.plants) if (!p.dead) this.stemAdd(p); }
  stemAdd(p) {
    if (this.ns >= this.stemNext.length) return;
    const G = this.GN, c = Math.min(G - 1, Math.max(0, Math.floor(p.x / 2))) * G + Math.min(G - 1, Math.max(0, Math.floor(p.y / 2)));
    this.stemP[this.ns] = p; this.stemNext[this.ns] = this.stemHead[c]; this.stemHead[c] = this.ns; this.ns++;
  }
  stemBlocked(x, y) {
    const G = this.GN, ix = Math.floor(x / 2), iy = Math.floor(y / 2);
    for (let a = ix - 1; a <= ix + 1; a++) for (let b = iy - 1; b <= iy + 1; b++) {
      if (a < 0 || b < 0 || a >= G || b >= G) continue;
      for (let i = this.stemHead[a * G + b]; i >= 0; i = this.stemNext[i]) { const q = this.stemP[i]; if ((q.x - x) ** 2 + (q.y - y) ** 2 < STEM_GAP * STEM_GAP) return true; }
    }
    return false;
  }

  /** ground cover densities per 4 m cell: grass in light, ferns in moist shade, herbs on humus in partial light, moss on wet shade */
  groundCover() {
    const G = this.GC, cov = this.cover;
    for (let iy = 0; iy < G; iy++) for (let ix = 0; ix < G; ix++) {
      const x = (ix + 0.5) * 4, y = (iy + 0.5) * 4, c = this.ci(x, y), k = iy * G + ix;
      if (this.blocked(c) || this.plot.material[c] === 1) { cov.grass[k] = cov.herb[k] = cov.fern[k] = 0; cov.moss[k] = this.plot.material[c] === 0 ? 0.5 * this.wn[c] : 0; continue; }
      const L = this.groundLight(x, y), wet = this.wn[c], hu = Math.min(1, this.humus[c] / HU_REF), T = this.plot.T[c] + this.dT;
      const warm = Math.min(1, Math.max(0, (T + 2) / 8));
      cov.grass[k] = warm * Math.max(0, L - 0.25) * (1 - 0.6 * wet);
      cov.fern[k] = warm * Math.max(0, 0.75 - L) * (0.3 + 0.7 * wet) * (0.5 + 0.5 * hu);
      cov.herb[k] = warm * L * (1 - L) * 2.5 * (0.3 + 0.7 * hu);
      cov.moss[k] = Math.max(0, 0.8 - L) * wet;
    }
  }

  record() {
    const S = this.species.length, count = new Array(S).fill(0);
    for (const p of this.plants) count[p.s]++;
    const cls = [0, 0, 0, 0, 0]; let logM = 0; for (const L of this.logs) { cls[L.cls - 1]++; logM += L.M; }
    let hu = 0; for (const v of this.humus) hu += v;
    const st = { year: this.year, count, snags: this.snags.length, logs: this.logs.length, cls, pits: this.pits.length,
      logMass_t_ha: logM / 1000 / (this.W * this.W / 1e4), humus_kg_m2: hu / this.humus.length, deaths: { ...this.deaths } };
    this.stats = st;
    this.hist.push({ year: st.year, snags: st.snags, cls: cls.slice(), humus: st.humus_kg_m2, count: count.slice() });
    if (this.hist.length > 3000) this.hist.shift();
  }
}

/** cells within SHORE_M of water (BFS over the crop grid) */
function shoreMask(plot) {
  const n = plot.n, N = n * n, d = new Int32Array(N).fill(1e9), q = new Int32Array(N); let h = 0, t = 0;
  for (let i = 0; i < N; i++) if (plot.waterKind[i]) { d[i] = 0; q[t++] = i; }
  const lim = Math.ceil(SHORE_M / plot.cell_m);
  while (h < t) { const i = q[h++], x = i % n, y = (i / n) | 0; if (d[i] >= lim) continue;
    for (const j of [x > 0 ? i - 1 : -1, x < n - 1 ? i + 1 : -1, y > 0 ? i - n : -1, y < n - 1 ? i + n : -1]) if (j >= 0 && d[j] > d[i] + 1) { d[j] = d[i] + 1; q[t++] = j; } }
  const m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = d[i] > 0 && d[i] <= lim ? 1 : 0; return m;
}
export function classOf(f) { return Math.min(5, 1 + Math.floor(5 * Math.pow(Math.max(0, 1 - f), 0.7))); }
