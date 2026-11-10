// 2.6–2.8 The stand: individual trees on a hectare, light by stamps, then microclimate, then fire.
// Pure JS, no DOM (tools/silviculture/stand-measure.mjs runs it in Node).
//
// 2.6 LIGHT STAMPS, after iLand (Seidl, Rammer, Scheller & Spies 2012). A tree has no branches here, only a stem
// diameter D, a height H, a crown radius R and a crown base. Each year the trees are sorted by height; the tallest
// reads the light field over its crown first and then stamps its shade into it, the next reads what is left, and so
// on down: every tree is shaded by every taller tree, on a 2 m grid, at the cost of one stamp per tree. iLand
// stamps a pre-computed light-influence pattern from a fisheye light model with the sun's path; ours is a
// Gaussian of the crown's radius with vertical light (a liberty). Growth: dD = g·r(L)·(1 − D/Dmax) with r a
// saturating light response, steep and low for the tolerant species, late for the pioneer; height and crown from
// diameter by saturating allometries. Death: a background rate at which 1 % of trees would reach the maximum age
// (the gap-model convention), and a stress rate when a tree grows less than 1 mm in a year. Recruitment: saplings of
// 1 cm where the ground light passes the species' threshold, seeds near parents and a little rain from outside.
// Every constant in SP below is ours; the paper gives the form, not these numbers.
//
// 2.7 MICROCLIMATE, reduced from Ecoclimates (Pałubicki et al. 2022). The canopy cools the air under it: the
// warmest days are on average about 4 °C cooler under forest canopies, and more the hotter it is (De Frenne et al.
// 2019). Here T_max under = T_max open − cover · 4 °C · (T_max open − 10)/20, cover = 1 − ground light. The tolerant
// species' seedlings take root only where T_max under stays below 31 °C (ours). Ecoclimates simulates water, soil,
// evaporation and clouds; this keeps only the buffering and one consequence.
//
// 2.8 FIRE, reduced from Fire in Paradise (Hädrich et al. 2021) and Scintilla (Kokosza et al. 2024): three fuel
// layers per 2 m cell. Ground fuel (litter under crowns, grass where the ground is lit), ladder fuel (small trees
// whose crowns reach down near the ground) and crown fuel (the canopy). A ground fire spreads cell to cell by its
// ground fuel and the wind; it climbs into the crowns only where ladder fuel bridges the gap to the canopy, the
// condition Van Wagner (1977) stated for the start of a crown fire; a crown fire spreads through the canopy faster
// and further downwind. Ground fire kills thin-barked small trees; crown fire kills every tree it burns. Rates ours.

import { makeRng } from '../fractals/silviculture-core.js?v=3';

export const CELL = 2;
export let CROWN = 0.05; export const setCrown = (v) => { CROWN = v; };
// species: g (m/yr of diameter at full light), Dmax (m), Hmax (m), hk (height curve), crown radius a + b·D^0.7,
// crown ratio cr (live crown / height), opacity of its stamp, light response k and compensation point Lc, the ground
// light a sapling needs (est), maximum age, seeds per adult per year and their radius
export const SP = [
  { key: 'pioneer', g: 0.014, Dmax: 0.7, Hmax: 24, hk: 4.0, ca: 0.8, cb: 7.0, cr: 0.4, op: 0.5, k: 1.6, Lc: 0.22, est: 0.5, pmax: 120, seeds: 6, sr: 30, hex: '#b0883a' },
  { key: 'tolerant', g: 0.008, Dmax: 1.0, Hmax: 34, hk: 3.2, ca: 0.6, cb: 9.0, cr: 0.65, op: 0.8, k: 6.0, Lc: 0.03, est: 0.04, pmax: 400, seeds: 3, sr: 12, hex: '#3d6b4c' },
];

const hOf = (s, D) => 1.3 + (s.Hmax - 1.3) * (1 - Math.exp(-s.hk * D));
const rOf = (s, D) => s.ca + s.cb * Math.pow(D, 0.7);
const resp = (s, L) => (L <= s.Lc ? 0 : (1 - Math.exp(-s.k * (L - s.Lc))) / (1 - Math.exp(-s.k * (1 - s.Lc))));

export function createStand(opts = {}) {
  const P = { size: 100, seed: 1, mix: 0.5, micro: false, Tmax: 30, ...opts };
  const N = Math.round(P.size / CELL), rng = makeRng(P.seed * 6151 + 3);
  const F = new Float32Array(N * N), ground = new Float32Array(N * N), Tu = new Float32Array(N * N);
  let trees = [], year = 0, deaths = 0, stats = {};
  const cellOf = (x) => Math.max(0, Math.min(N - 1, Math.floor(x / CELL)));
  const plant = (sp, x, z, D = 0.01) => { const s = SP[sp]; const t = { sp, x, z, D, H: hOf(s, D), R: rOf(s, D), age: 0, slow: 0, dD: 0.003 }; trees.push(t); return t; };
  // a first cohort of saplings, as on a cleared plot
  for (let i = 0; i < P.size * P.size / 25; i++) plant(rng.next() < P.mix ? 1 : 0, rng.next() * P.size, rng.next() * P.size, 0.01 + rng.next() * 0.03);

  function light() {
    F.fill(1);
    trees.sort((a, b) => b.H - a.H);
    for (const t of trees) {
      const s = SP[t.sp], R = t.R, cx = t.x / CELL, cz = t.z / CELL, r = Math.max(1, R / CELL);
      // read: mean light over the crown (cells within R; at least the stem's cell)
      let sum = 0, n = 0;
      const i0 = Math.floor(cx - r), i1 = Math.ceil(cx + r), j0 = Math.floor(cz - r), j1 = Math.ceil(cz + r);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const di = i + 0.5 - cx, dj = j + 0.5 - cz; if (di * di + dj * dj > r * r) continue;
        const ii = (i + N) % N, jj = (j + N) % N; sum += F[ii * N + jj]; n++; // the plot wraps around (a torus)
      }
      t.L = n ? sum / n : F[cellOf(t.x) * N + cellOf(t.z)];
      // stamp: a Gaussian of the crown, reaching to 1.6 R
      const rs = r * 1.6, op = s.op;
      for (let i = Math.floor(cx - rs); i <= Math.ceil(cx + rs); i++) for (let j = Math.floor(cz - rs); j <= Math.ceil(cz + rs); j++) {
        const di = i + 0.5 - cx, dj = j + 0.5 - cz, d2 = (di * di + dj * dj) / (r * r); if (d2 > 2.56) continue;
        const ii = (i + N) % N, jj = (j + N) % N; F[ii * N + jj] *= 1 - op * Math.exp(-d2);
      }
    }
    ground.set(F);
    if (P.micro) for (let c = 0; c < N * N; c++) Tu[c] = P.Tmax - (1 - ground[c]) * 4 * (P.Tmax - 10) / 20;
  }

  function step() {
    light();
    const keep = [];
    let dead = 0;
    for (const t of trees) {
      const s = SP[t.sp];
      t.dD = s.g * resp(s, t.L) * Math.max(0, 1 - t.D / s.Dmax);
      t.D += t.dD; t.H = hOf(s, t.D); t.R = rOf(s, t.D); t.age++;
      t.slow = t.dD < 0.001 ? t.slow + 1 : 0;
      const pBack = 1 - Math.pow(0.01, 1 / s.pmax), pStress = t.slow >= 2 ? 0.25 : 0;
      if (rng.next() < pBack + pStress || t.age > s.pmax * 1.2) { dead++; continue; }
      keep.push(t);
    }
    trees = keep; deaths += dead;
    // recruitment: seeds from adults (D ≥ 10 cm) around them, plus rain from outside; a seed becomes a sapling if
    // its cell is lit enough for its species (and, with microclimate, cool enough for the tolerant one)
    const occupied = new Uint8Array(N * N);
    for (const t of trees) if (t.D < 0.05) occupied[cellOf(t.x) * N + cellOf(t.z)] = 1;
    const tryAt = (sp, x, z) => {
      x = ((x % P.size) + P.size) % P.size; z = ((z % P.size) + P.size) % P.size;
      const c = cellOf(x) * N + cellOf(z), s = SP[sp];
      if (occupied[c] || ground[c] < s.est) return;
      if (P.micro && sp === 1 && Tu[c] > 31) return;
      occupied[c] = 1; plant(sp, x, z);
    };
    const adults = trees.filter((t) => t.D >= 0.1);
    for (const t of adults) { const s = SP[t.sp]; for (let k = 0; k < s.seeds; k++) tryAt(t.sp, t.x + rng.gauss() * s.sr / 2, t.z + rng.gauss() * s.sr / 2); }
    const rain = P.size * P.size / 1000;
    for (let k = 0; k < rain; k++) tryAt(rng.next() < 0.5 ? 0 : 1, rng.next() * P.size, rng.next() * P.size);
    year++;
  }

  // ---- canopy height model at 1 m and its gaps (Reis et al.: holes below 10 m, 20 m² to 1 ha)
  const M = P.size, chm = new Float32Array(M * M);
  function canopy() {
    chm.fill(0);
    for (const t of trees) {
      if (t.H < 2) continue;
      const s = SP[t.sp], base = t.H * (1 - s.cr), R = t.R;
      for (let i = Math.floor(t.x - R); i <= Math.ceil(t.x + R); i++) for (let j = Math.floor(t.z - R); j <= Math.ceil(t.z + R); j++) {
        const dx = i + 0.5 - t.x, dz = j + 0.5 - t.z, q = (dx * dx + dz * dz) / (R * R); if (q > 1) continue;
        const h = t.H - (t.H - base) * q, c = ((i + M) % M) * M + ((j + M) % M);
        if (h > chm[c]) chm[c] = h;
      }
    }
    return chm;
  }
  function gaps(th = 10, amin = 20) {
    canopy();
    const lab = new Int32Array(M * M).fill(-1), sizes = [];
    const st = [];
    for (let c = 0; c < M * M; c++) {
      if (lab[c] >= 0 || chm[c] >= th) continue;
      let n = 0; st.push(c); lab[c] = sizes.length;
      while (st.length) {
        const k = st.pop(); n++;
        const i = (k / M) | 0, j = k % M;
        for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
          const q = ((a + M) % M) * M + ((b + M) % M);
          if (lab[q] < 0 && chm[q] < th) { lab[q] = sizes.length; st.push(q); }
        }
      }
      sizes.push(n);
    }
    const fit = sizes.filter((a) => a >= amin && a <= 10000);
    // discrete power law, MLE with the continuity correction (Clauset, Shalizi & Newman 2009, eq. 3.7)
    const lam = fit.length ? 1 + fit.length / fit.reduce((s, a) => s + Math.log(a / (amin - 0.5)), 0) : NaN;
    const open = chm.reduce((s, h) => s + (h < th ? 1 : 0), 0) / (M * M);
    return { sizes, fit, lambda: lam, se: fit.length ? (lam - 1) / Math.sqrt(fit.length) : NaN, open, lab };
  }

  function census() {
    let pio = 0, tol = 0, ba = 0, big = 0, h = 0;
    for (const t of trees) { if (t.D >= 0.05) { if (t.sp) tol++; else pio++; } ba += Math.PI * t.D * t.D / 4; if (t.D >= 0.3) big++; if (t.H > h) h = t.H; }
    const ha = P.size * P.size / 10000;
    return { year, stems: (pio + tol) / ha, pioneer: pio / ha, tolerant: tol / ha, basal: ba / ha, big: big / ha, top: h, n: trees.length };
  }

  // ---- fire (2.8): a cellular automaton over the three fuel layers
  function fuels() {
    const g = new Float32Array(N * N), lad = new Float32Array(N * N), cr = new Float32Array(N * N);
    for (let c = 0; c < N * N; c++) g[c] = 0.35 + 0.45 * (1 - ground[c]) + 0.6 * ground[c] * ground[c]; // litter under crowns, grass in the light
    for (const t of trees) {
      const s = SP[t.sp], base = t.H * (1 - s.cr), c = cellOf(t.x) * N + cellOf(t.z);
      if (t.H >= 10) { const r = Math.max(1, t.R / CELL); for (let i = Math.floor(t.x / CELL - r); i <= Math.ceil(t.x / CELL + r); i++) for (let j = Math.floor(t.z / CELL - r); j <= Math.ceil(t.z / CELL + r); j++) { const di = i + 0.5 - t.x / CELL, dj = j + 0.5 - t.z / CELL; if (di * di + dj * dj <= r * r) cr[((i + N) % N) * N + ((j + N) % N)] += 0.5; } }
      else if (base < 3 && t.H > 1.5) lad[c] += 0.6; // a small tree whose crown reaches the ground's flames
    }
    for (let c = 0; c < N * N; c++) { lad[c] = Math.min(1, lad[c]); cr[c] = Math.min(1, cr[c]); }
    return { g, lad, cr };
  }
  function fire({ x, z, wind = 0.5, dir = 0, dry = 1, clearLadder = false, onTick }) {
    const fu = fuels(); if (clearLadder) fu.lad.fill(0);
    // state: 0 unburnt, 1 ground burning, 2 crown burning, 3 ground burnt, 4 crown burnt
    const S = new Uint8Array(N * N), age = new Uint8Array(N * N);
    const wx = Math.cos(dir), wz = Math.sin(dir);
    S[cellOf(x) * N + cellOf(z)] = 1;
    let active = 1, ticks = 0;
    const frames = [];
    while (active && ticks < 600) {
      const nxt = S.slice();
      active = 0;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const c = i * N + j, st = S[c];
        if (st !== 1 && st !== 2) continue;
        active++;
        const crown = st === 2, reach = crown ? 2 : 1;
        for (let a = -reach; a <= reach; a++) for (let b = -reach; b <= reach; b++) {
          if (!a && !b) continue;
          const d = Math.hypot(a, b); if (d > reach + 0.5) continue; // the 8 neighbours (ground), radius 2.5 cells (crown)
          const q = ((i + a + N) % N) * N + ((j + b + N) % N);
          if (S[q] !== 0 || nxt[q] !== 0) continue;
          const along = (a * wx + b * wz) / d, w = Math.max(0.05, 1 + wind * 1.6 * along) / d;
          const p = crown ? CROWN * dry * fu.cr[q] * w : 0.3 * dry * fu.g[q] * w;
          if (rng.next() < p) nxt[q] = crown && fu.cr[q] > 0 ? 2 : 1;
        }
        // climb: a ground fire enters the crowns where ladder fuel bridges to a canopy above it
        if (!crown && fu.cr[c] > 0 && rng.next() < 0.85 * fu.lad[c]) { nxt[c] = 2; age[c] = 0; continue; }
        age[c]++;
        if (age[c] >= (crown ? 2 : 1)) nxt[c] = crown ? 4 : 3;
      }
      S.set(nxt); ticks++;
      if (onTick) onTick(S, ticks);
    }
    // effects on the trees
    let killed = 0, crownKilled = 0;
    const keep = [];
    for (const t of trees) {
      const st = S[cellOf(t.x) * N + cellOf(t.z)];
      if (st === 4) { killed++; crownKilled++; continue; }
      if (st === 3 && t.D < 0.1 && rng.next() < 0.8) { killed++; continue; }
      keep.push(t);
    }
    const before = trees.length; trees = keep;
    let g = 0, c = 0; for (let k = 0; k < N * N; k++) { if (S[k] === 3) g++; if (S[k] === 4) c++; }
    return { S, ticks, burnt: (g + c) / (N * N), crown: c / (N * N), killed, crownKilled, before };
  }

  return {
    P, N, F, ground, Tu, step, light, canopy, gaps, census, fire, fuels,
    get trees() { return trees; }, set trees(v) { trees = v; },
    get year() { return year; }, get deaths() { return deaths; },
    chm: () => chm,
  };
}
