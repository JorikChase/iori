// tools/silviculture/measure.mjs — scores paper 0's forest (papers/fractals/silviculture-core.js) against the
// laws foresters and ecologists measure. Headless, deterministic per seed. Writes measure.json beside itself.
//
//   node tools/silviculture/measure.mjs [--seeds 1,2,3] [--years 400]
//
// What it measures, and the Earth range it is compared with (sources: papers/study/2026-11-06-silviculture-sota.md):
//   Yoda      log mean tree mass  vs log density, thinning phase of a plantation          −3/2  (−1.42 … −1.79 measured)
//   Reineke   log density         vs log quadratic mean diameter, same phase              −1.605
//   allometry log height          vs log stem diameter, every tree of a mixed forest      0.73 (0.71–0.76)
//   Horton    bifurcation ratio R_n and diameter ratio R_d of one open-grown tree        3.6–4.8, 1.56–1.94
//   Leonardo  Σ d_child² / d_parent² at forks; fitted exponent Δ with d_p^Δ = Σ d_c^Δ     ratio 0.90–1.05, Δ 1.8–2.3
//   box dim.  box counting of the branch skeleton, 10 cm to a quarter of the crown       1.32–1.91
//   sizes     power-law exponent θ of stem diameters, ≥ 5 cm and ≥ 20 cm, mixed forest (MLE) all 1.04–2.13, ≥20 cm 2.42–3.68
//   biomass   log stem biomass vs log diameter                                           2.89 (2.71–3.14)
// The plantation is the simulator's no-recruitment stand (any mode but 'forest' or 'single'), replanted here as a
// dense 24 × 24 grid of one species,
// so every death in it is a starvation death; the tolerant species (p_max 950 yr) never reaches old age in the run.
import { Sim, PLOT } from '../../papers/fractals/silviculture-core.js';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const SEEDS = (args.seeds || '1,2,3,4,5').split(',').map(Number);
const YEARS = +(args.years || 400);
const HA = PLOT * PLOT / 10000, WOOD = 600, TREE_D = 0.05; // trees: stems of 5 cm and more, as the paper's chart

const ols = (xs, ys) => {
  const n = xs.length; if (n < 3) return { slope: NaN, r2: NaN, n };
  let sx = 0, sy = 0; for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n; let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; sxx += a * a; sxy += a * b; syy += b * b; }
  return { slope: sxy / sxx, r2: (sxy * sxy) / (sxx * syy), n };
};
const lg = Math.log10;
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[b.length >> 1] : NaN; };

// ------------------------------------------------------------------ plantation: Yoda and Reineke
function plantation(seed, sp) {
  const sim = new Sim({ seed, mode: 'plantation', mix: sp, sTolT: null });
  // a dense even-aged stand, as self-thinning trials are planted: replace the 70 random seeds by a jittered
  // 24 × 24 grid (5,600 /ha), all of one species
  for (const p of sim.plants) { for (const m of p.mods) sim.release(m); }
  sim.plants.length = 0;
  const G = 24, cell = (PLOT - 2) / G;
  for (let i = 0; i < G; i++) for (let k = 0; k < G; k++)
    sim.addPlant(sim.species[sp], -PLOT / 2 + 1 + (i + 0.5 + (sim.rng.next() - 0.5) * 0.5) * cell, -PLOT / 2 + 1 + (k + 0.5 + (sim.rng.next() - 0.5) * 0.5) * cell);
  sim.lightPass();
  const rows = [];
  const years = sp === 0 ? 50 : YEARS; // the pioneer reaches p_max 52 yr: stop before old age kills it
  for (let y = 0; y < years; y++) {
    sim.step();
    let n = 0, m = 0, d2 = 0;
    for (const p of sim.plants) if (p.stemD >= TREE_D) { n++; m += p.bio * WOOD; d2 += p.stemD * p.stemD; }
    if (n >= 4) rows.push({ year: sim.year, N: n / HA, m: m / n, dq: Math.sqrt(d2 / n) * 100 });
  }
  // thinning phase: from the density peak on, while density falls
  let pk = 0; rows.forEach((r, i) => { if (r.N > rows[pk].N) pk = i; });
  // the self-thinning line: from the moment density has fallen 10 % below its peak (competition is killing)
  const ph = rows.slice(pk).filter((r) => r.N < 0.9 * rows[pk].N);
  const yoda = ols(ph.map((r) => lg(r.N)), ph.map((r) => lg(r.m)));
  const reineke = ols(ph.map((r) => lg(r.dq)), ph.map((r) => lg(r.N)));
  return { seed, species: sp === 0 ? 'pioneer' : 'tolerant', peakYear: rows[pk] && rows[pk].year, peakN: rows[pk] && rows[pk].N,
    endN: rows.length ? rows[rows.length - 1].N : 0, yoda: yoda.slope, yodaR2: yoda.r2, reineke: reineke.slope, reinekeR2: reineke.r2, n: ph.length,
    series: rows.filter((_, i) => i % 5 === 0).map((r) => [r.year, +r.N.toFixed(1), +r.m.toFixed(2), +r.dq.toFixed(2)]) };
}

// ------------------------------------------------------------------ mixed forest: allometry and size distribution
function forest(seed) {
  const sim = new Sim({ seed, mode: 'forest', mix: 0.3, sTolT: null });
  for (let y = 0; y < YEARS; y++) sim.step();
  const trees = sim.plants.filter((p) => p.stemD >= TREE_D && p.height > 1.3);
  const hd = ols(trees.map((p) => lg(p.stemD * 100)), trees.map((p) => lg(p.height)));
  // continuous power-law MLE (Clauset, Shalizi & Newman 2009) for stems ≥ 10 cm
  const mle = (xmin) => {
    const big = sim.plants.map((p) => p.stemD).filter((d) => d >= xmin);
    const a = big.length ? 1 + big.length / big.reduce((s, d) => s + Math.log(d / xmin), 0) : NaN;
    return { a, se: big.length ? (a - 1) / Math.sqrt(big.length) : NaN, n: big.length };
  };
  const all = mle(TREE_D), large = mle(0.20);
  const bb = ols(trees.map((p) => lg(p.stemD)), trees.map((p) => lg(p.bio)));
  return { seed, plants: sim.plants.length, trees: trees.length, hd: hd.slope, hdR2: hd.r2, betaB: bb.slope,
    sizeAlpha: all.a, sizeSE: all.se, sizeN: all.n, sizeLarge: large.a, sizeLargeSE: large.se, sizeLargeN: large.n,
    maxH: Math.max(...sim.plants.map((p) => p.height)), msStep: sim.msStep,
    scatter: trees.map((p) => [+(p.stemD * 100).toFixed(1), +p.height.toFixed(1), p.sp.key === 'pioneer' ? 0 : 1]) };
}

// ------------------------------------------------------------------ one open-grown tree: Horton, Leonardo, box dimension
function skeleton(p) {
  // global edges: one per module segment j ≥ 1; a segment's parent edge is the segment ending at its start node,
  // which for P[j] = 0 is the parent module's segment ending at the terminal the module hangs from.
  const edges = [], key = new Map();
  for (const m of p.mods) for (let j = 1; j < m.proto.n; j++) { key.set(m.id * 64 + j, edges.length); edges.push({ m, j, kids: [], d: m.dMax[j], len: m.segL[j] }); }
  for (const e of edges) {
    const { m, j } = e, pj = m.proto.P[j];
    let par = -1;
    if (pj > 0) par = key.get(m.id * 64 + pj);
    else if (m.parent) par = key.get(m.parent.id * 64 + m.parent.proto.terms[m.slot]);
    e.par = par === undefined ? -1 : par;
    if (e.par >= 0) edges[e.par].kids.push(e);
  }
  return edges.filter((e) => e.len > 1e-4);
}
function tree(seed, spIdx, age) {
  const sim = new Sim({ seed, mode: 'single', mix: 0, single: spIdx });
  for (let y = 0; y < age; y++) sim.step();
  const p = sim.plants[0];
  const all = skeleton(p), live = new Set(all);
  for (const e of all) e.kids = e.kids.filter((k) => live.has(k));
  const roots = all.filter((e) => e.par < 0 || !live.has(all.find(() => false)) && e.par < 0);
  // Strahler order, children first (edges were pushed parents before children within the module order → recurse)
  const order = new Map();
  const ord = (e) => {
    if (order.has(e)) return order.get(e);
    let o;
    if (!e.kids.length) o = 1;
    else { const ks = e.kids.map(ord), mx = Math.max(...ks); o = ks.filter((k) => k === mx).length >= 2 ? mx + 1 : mx; }
    order.set(e, o); return o;
  };
  const byOrder = {}, diam = {}, slen = {};
  const parentOf = new Map(); for (const e of all) for (const k of e.kids) parentOf.set(k, e);
  for (const e of all) {
    const o = ord(e), pe = parentOf.get(e);
    if (!pe || ord(pe) !== o) { // a stream starts here; follow it to its end for its length
      byOrder[o] = (byOrder[o] || 0) + 1; (diam[o] = diam[o] || []).push(e.d);
      let L = 0, c = e;
      while (c) { L += c.len; c = c.kids.find((k) => ord(k) === o) || null; }
      (slen[o] = slen[o] || []).push(L);
    }
  }
  const ks = Object.keys(byOrder).map(Number).sort((a, b) => a - b);
  const fitN = ols(ks, ks.map((k) => lg(byOrder[k]))), Rn = Math.pow(10, -fitN.slope);
  const fitD = ols(ks, ks.map((k) => lg(mean(diam[k])))), Rd = Math.pow(10, fitD.slope);
  const fitL = ols(ks, ks.map((k) => lg(mean(slen[k])))), Rl = Math.pow(10, fitL.slope);
  // Leonardo at forks
  const ratios = [], deltas = [];
  for (const e of all) {
    if (e.kids.length < 2 || e.d <= 0) continue;
    const ds = e.kids.map((k) => k.d);
    ratios.push(ds.reduce((s, d) => s + d * d, 0) / (e.d * e.d));
    let lo = 0.5, hi = 6; // f(Δ) = Σ (d_c/d_p)^Δ − 1 falls with Δ
    const f = (D) => ds.reduce((s, d) => s + Math.pow(d / e.d, D), 0) - 1;
    if (f(lo) > 0 && f(hi) < 0) { for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; } deltas.push((lo + hi) / 2); }
  }
  // box counting on points every 2 cm along every segment
  const pts = [];
  for (const e of all) {
    const nw = e.m.nw, j = e.j, pj = e.m.proto.P[j];
    let ax, ay, az;
    if (pj > 0 || !e.m.parent) { ax = nw[pj * 3]; ay = nw[pj * 3 + 1]; az = nw[pj * 3 + 2]; } else { ax = nw[0]; ay = nw[1]; az = nw[2]; }
    const bx = nw[j * 3], by = nw[j * 3 + 1], bz = nw[j * 3 + 2], L = Math.hypot(bx - ax, by - ay, bz - az), n = Math.max(1, Math.ceil(L / 0.02));
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t); }
  }
  let ext = 0; for (let i = 0; i < pts.length; i += 3) ext = Math.max(ext, Math.abs(pts[i] - p.x), pts[i + 1], Math.abs(pts[i + 2] - p.z));
  const sizes = [], counts = [];
  for (let s = 0.1; s <= ext / 2; s *= 1.4) {
    const set = new Set();
    for (let i = 0; i < pts.length; i += 3) set.add(`${Math.floor(pts[i] / s)},${Math.floor(pts[i + 1] / s)},${Math.floor(pts[i + 2] / s)}`);
    sizes.push(s); counts.push(set.size);
  }
  const bd = ols(sizes.map((s) => -lg(s)), counts.map(lg));
  return { seed, species: p.sp.key, age, height: p.height, stemD: p.stemD, modules: p.mods.length, segments: all.length,
    orders: ks.length, streams: byOrder, Rn, RnR2: fitN.r2, Rd, RdR2: fitD.r2, Rl, archD: Math.log(Rn) / Math.log(Rl), leonardoRatio: median(ratios), leonardoDelta: median(deltas), forks: ratios.length,
    boxDim: bd.slope, boxR2: bd.r2, boxRange: [0.1, +(sizes[sizes.length - 1] || 0).toFixed(2)], roots: roots.length };
}

const t0 = Date.now();
const out = { when: new Date().toISOString(), years: YEARS, seeds: SEEDS, plantation: [], forest: [], tree: [] };
for (const s of SEEDS) {
  for (const sp of [1, 0]) out.plantation.push(plantation(s, sp));
  out.forest.push(forest(s));
  for (const sp of [1, 0]) out.tree.push(tree(s, sp, sp === 1 ? 200 : 45));
  process.stderr.write(`seed ${s} done ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
}
const pick = (arr, k, f = () => true) => arr.filter(f).map((r) => r[k]).filter(Number.isFinite);
const range = (a) => a.length ? [Math.min(...a), Math.max(...a)].map((v) => +v.toFixed(2)) : null;
out.summary = {
  yoda_tolerant: range(pick(out.plantation, 'yoda', (r) => r.species === 'tolerant')),
  reineke_tolerant: range(pick(out.plantation, 'reineke', (r) => r.species === 'tolerant')),
  yoda_pioneer: range(pick(out.plantation, 'yoda', (r) => r.species === 'pioneer')),
  reineke_pioneer: range(pick(out.plantation, 'reineke', (r) => r.species === 'pioneer')),
  heightDiameter: range(pick(out.forest, 'hd')), sizeAlpha: range(pick(out.forest, 'sizeAlpha')),
  betaB: range(pick(out.forest, 'betaB')), sizeLarge: range(pick(out.forest, 'sizeLarge')),
  Rn_tolerant: range(pick(out.tree, 'Rn', (r) => r.species === 'tolerant')), Rd_tolerant: range(pick(out.tree, 'Rd', (r) => r.species === 'tolerant')),
  Rl_tolerant: range(pick(out.tree, 'Rl', (r) => r.species === 'tolerant')), archD_tolerant: range(pick(out.tree, 'archD', (r) => r.species === 'tolerant')),
  box_tolerant: range(pick(out.tree, 'boxDim', (r) => r.species === 'tolerant')), box_pioneer: range(pick(out.tree, 'boxDim', (r) => r.species === 'pioneer')),
  Rl: range(pick(out.tree, 'Rl')), archD: range(pick(out.tree, 'archD')),
  Rn: range(pick(out.tree, 'Rn')), Rd: range(pick(out.tree, 'Rd')), leonardoRatio: range(pick(out.tree, 'leonardoRatio')),
  leonardoDelta: range(pick(out.tree, 'leonardoDelta')), boxDim: range(pick(out.tree, 'boxDim')),
  seconds: (Date.now() - t0) / 1000,
};
const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, 'measure.json'), JSON.stringify(out));
console.log(JSON.stringify(out.summary, null, 1));
for (const r of out.plantation) console.log('plantation', r.species, r.seed, 'peak', r.peakYear, r.peakN?.toFixed(0), '→', r.endN.toFixed(0), 'yoda', r.yoda.toFixed(2), 'reineke', r.reineke.toFixed(2), 'n', r.n);
for (const r of out.tree) console.log('tree', r.species, r.seed, 'h', r.height.toFixed(1), 'orders', r.orders, JSON.stringify(r.streams), 'Rn', r.Rn.toFixed(2), 'Rd', r.Rd.toFixed(2), 'leo', r.leonardoRatio.toFixed(2), r.leonardoDelta.toFixed(2), 'box', r.boxDim.toFixed(2), r.boxRange);
for (const r of out.forest) console.log('forest', r.seed, 'trees', r.trees, 'hd', r.hd.toFixed(2), 'betaB', r.betaB.toFixed(2), 'θ≥5', r.sizeAlpha.toFixed(2), '±', r.sizeSE.toFixed(2), 'n', r.sizeN, 'θ≥20', r.sizeLarge.toFixed(2), '±', r.sizeLargeSE.toFixed(2), 'n', r.sizeLargeN, 'maxH', r.maxH.toFixed(1));
