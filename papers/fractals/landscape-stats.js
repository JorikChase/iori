/*
 * landscape-stats.js — the realism check: drainage and relief statistics measured on a generated Terrain and
 * set against Earth's ranges (report §2 and the §6 validation table, papers/study/2026-10-13-landscape-research.md).
 * Pure, no DOM; landscape-terrain.js calls computeStats() at the end of generation.
 *
 * MEASUREMENTS (all on the D8 tree of the filled surface; land only; network statistics only inside major
 * basins, outlet area ≥ max(1 km², 2 % of the land), as one measures a real catchment)
 *  - Hack h: L ∝ A^h, L = longest flow path upstream of a channel cell (to its farthest divide), A its
 *    drainage area. Least squares on medians of log L in 0.1-decade bins of A, A from A_c to A_max/3.
 *  - τ: P(A ≥ a) ∝ a^−(τ−1) over all land cells, fitted for a from max(A_c, 50 cells) to A_max/30.
 *  - Concavity θ: S = k_s·A^−θ on channel cells outside lakes; medians of log S in 0.1-decade bins.
 *  - Horton R_B, R_L, R_A: Strahler streams (maximal runs of one order) on channel cells A ≥ A_c; N_ω,
 *    mean length, mean area at the stream's end; log-linear fits over the middle orders (2 … Ω−1 when Ω ≥ 4,
 *    as Dodds & Rothman advise; all orders otherwise).
 *  - Tokunaga T1: side tributaries of order ω−1 per stream of order ω, averaged over ω.
 *  - Network dimension ln R_B / ln R_L; consistency τ − (2 − h).
 *  - Hypsometric integral (mean − min)/(max − min) of land heights.
 *  - Coastline box dimension: coast cells (land with a sea 4-neighbour) counted in boxes of 2…64 cells.
 * CONSTANTS CHOSEN HERE: A_c = 0.05 km² (channel initiation), bin width 0.1 decade, ≥ 5 samples per bin.
 * LIBERTIES: none in the physics; the fit ranges are choices and are reported with every value.
 */

export const EARTH = {
  hack_h: { label: 'Hack exponent h', lo: 0.57, hi: 0.60, tol: 0.05, text: '0.57–0.60 (→ 0.5 for very large basins)', source: 'Dodds & Rothman 1999', url: 'https://arxiv.org/pdf/cond-mat/9808244' },
  tau: { label: 'Area exceedance τ', lo: 1.41, hi: 1.45, tol: 0.04, text: '1.43 ± 0.02', source: 'Dodds & Rothman 1999; Rinaldo et al. 2014', url: 'https://arxiv.org/pdf/cond-mat/9808244' },
  consistency: { label: 'τ − (2 − h)', lo: -0.03, hi: 0.03, tol: 0.03, text: '0 (τ = 2 − h)', source: 'Dodds & Rothman 1999', url: 'https://arxiv.org/pdf/cond-mat/9808244' },
  concavity: { label: 'Concavity θ', lo: 0.35, hi: 0.6, tol: 0.05, text: '≈ 0.45 reference (basalt ≈ 0.7); built in at steady state', source: 'Mudd et al. 2018', url: 'https://esurf.copernicus.org/articles/6/505/2018/esurf-6-505-2018.pdf' },
  horton_Rb: { label: 'Horton bifurcation R_B', lo: 3.0, hi: 5.0, tol: 0.3, text: '3.0–5.0 (compilation 3.3–4.7)', source: 'Dodds & Rothman 1999; Cudennec et al.', url: 'https://arxiv.org/pdf/cond-mat/9808244' },
  horton_Rl: { label: 'Horton length R_L', lo: 1.5, hi: 3.0, tol: 0.2, text: '1.5–3.0 (compilation 1.6–2.4)', source: 'Dodds & Rothman 1999; Cudennec et al.', url: 'https://arxiv.org/pdf/cond-mat/9808244' },
  horton_Ra: { label: 'Horton area R_A', lo: 3.0, hi: 6.0, tol: 0.3, text: '3.0–6.0', source: 'Dodds & Rothman 1999', url: 'https://arxiv.org/pdf/cond-mat/9808244' },
  tokunaga_T1: { label: 'Tokunaga T1', lo: 1.0, hi: 1.5, tol: 0.2, text: '1.0–1.5', source: 'Dodds & Rothman 1999', url: 'https://arxiv.org/pdf/cond-mat/9808244' },
  network_D: { label: 'Network dimension ln R_B/ln R_L', lo: 1.7, hi: 2.0, tol: 0.1, text: '≈ 1.9 (space-filling)', source: 'Tarboton et al. 1988', url: 'https://hydrology.usu.edu/dtarb/egs01fractalabs.html' },
  hypsometric_integral: { label: 'Hypsometric integral', lo: 0.35, hi: 0.6, tol: 0.05, text: '0.35–0.6 mature (> 0.6 youthful, < 0.35 old; from memory)', source: 'Strahler 1952 (flagged)', url: '' },
  coastline_D: { label: 'Coastline dimension', lo: 1.02, hi: 1.25, tol: 0.03, text: '1.02 (South Africa) – 1.25 (west Britain)', source: 'Mandelbrot 1967', url: 'https://gis.humboldt.edu/olm/courses/gsp_510/Articles/Mandelbrot1967.pdf' },
  drainage: { label: 'Cells draining to an outlet or lake', lo: 1, hi: 1, tol: 0, text: 'all', source: 'Barnes et al. 2014; Galin et al. 2019', url: 'https://ar5iv.arxiv.org/html/1511.04463' },
};

const A_C = 5e4;

function fit(xs, ys) {
  const n = xs.length; if (n < 2) return { slope: NaN, r2: NaN, n };
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; syy += ys[i] * ys[i]; }
  const d = n * sxx - sx * sx, slope = (n * sxy - sx * sy) / d, b = (sy - slope * sx) / n;
  const ssTot = syy - sy * sy / n; let ssRes = 0;
  for (let i = 0; i < n; i++) { const e = ys[i] - (slope * xs[i] + b); ssRes += e * e; }
  return { slope, intercept: b, r2: ssTot > 0 ? 1 - ssRes / ssTot : 1, n };
}
/** medians of y in 0.1-decade bins of x (both already log10), bins with ≥ minN samples */
function binnedMedians(lx, ly, lo, hi, minN = 5) {
  const nb = Math.max(1, Math.ceil((hi - lo) / 0.1)), bins = Array.from({ length: nb }, () => []);
  for (let i = 0; i < lx.length; i++) { const b = Math.floor((lx[i] - lo) / 0.1); if (b >= 0 && b < nb) bins[b].push(ly[i]); }
  const X = [], Y = [];
  bins.forEach((v, b) => { if (v.length >= minN) { v.sort((p, q) => p - q); X.push(lo + (b + 0.5) * 0.1); Y.push(v[v.length >> 1]); } });
  return { X, Y };
}

/**
 * terrain: the Terrain fields (receiver, area, height, order, waterKind, cell_m, n);
 * aux: { stack (receivers first), rdist } from the generator. Returns values, Earth targets and fit details.
 */
export function computeStats(t, aux) {
  const { n, cell_m: cell, receiver: rec, area: A, height: h, order, waterKind } = t;
  const N = n * n, cellA = cell * cell, stack = aux.stack, rdist = aux.rdist;
  let land = (i) => waterKind[i] !== 3;
  const out = { fits: {} };
  // drainage consistency: every land cell reaches a root through receivers (true by construction; checked)
  let drained = 0, nland = 0;
  const reach = new Uint8Array(N);
  for (let j = 0; j < stack.length; j++) { const i = stack[j], r = rec[i]; reach[i] = r < 0 ? 1 : reach[r]; }
  for (let i = 0; i < N; i++) if (land(i)) { nland++; if (reach[i]) drained++; }
  out.drainage = nland ? drained / nland : 1;
  // measure inside major basins only (outlet area ≥ max(1 km², 2 % of the land)), as one measures a real
  // catchment: the many small basins cut by the region's open edges would otherwise skew τ and h
  const outlet = new Int32Array(N);
  for (let j = 0; j < stack.length; j++) { const i = stack[j], r = rec[i]; outlet[i] = r < 0 ? i : outlet[r]; }
  const Abmin = Math.max(1e6, 0.02 * nland * cellA);
  const inBasin = new Uint8Array(N); let basins = 0;
  for (let i = 0; i < N; i++) if (land(i) && A[outlet[i]] >= Abmin) { inBasin[i] = 1; if (outlet[i] === i) basins++; }
  const landAll = land;
  land = (i) => inBasin[i] === 1;
  out.basins = basins; out.basin_min_m2 = Abmin;
  let Amax = 0; for (let i = 0; i < N; i++) if (land(i) && A[i] > Amax) Amax = A[i];

  // Hack: longest upstream path
  const L = new Float64Array(N);
  for (let j = stack.length - 1; j >= 0; j--) { const i = stack[j], r = rec[i]; if (r >= 0) { const v = L[i] + rdist[i]; if (v > L[r]) L[r] = v; } }
  {
    const lx = [], ly = [];
    for (let i = 0; i < N; i++) if (land(i) && A[i] >= A_C && L[i] > 0) { lx.push(Math.log10(A[i])); ly.push(Math.log10(L[i])); }
    const lo = Math.log10(A_C), hi = Math.log10(Amax / 3), b = binnedMedians(lx, ly, lo, hi), f = fit(b.X, b.Y);
    out.hack_h = f.slope; out.fits.hack = { range_m2: [A_C, Amax / 3], bins: b.X.length, r2: f.r2, pts: b.X.map((x, k) => [x, b.Y[k]]) };
  }
  // τ: exceedance of drainage area
  {
    const a = []; for (let i = 0; i < N; i++) if (land(i)) a.push(A[i]);
    a.sort((p, q) => p - q);
    const lo = Math.max(A_C, 50 * cellA), hi = Amax / 30, X = [], Y = [], m = a.length;
    for (let e = Math.log10(lo); e <= Math.log10(hi); e += 0.1) {
      const thr = 10 ** e; let l = 0, r = m;
      while (l < r) { const mid = (l + r) >> 1; if (a[mid] < thr) l = mid + 1; else r = mid; }
      const p = (m - l) / m; if (p > 0) { X.push(e); Y.push(Math.log10(p)); }
    }
    const f = fit(X, Y);
    out.tau = 1 - f.slope; out.fits.tau = { range_m2: [lo, hi], r2: f.r2, pts: X.map((x, k) => [x, Y[k]]) };
  }
  // concavity
  {
    const lx = [], ly = [];
    for (let i = 0; i < N; i++) {
      const r = rec[i]; if (r < 0 || !land(i) || waterKind[i] === 2 || A[i] < A_C) continue;
      const s = (h[i] - h[r]) / rdist[i]; if (s <= 1e-5) continue;
      lx.push(Math.log10(A[i])); ly.push(Math.log10(s));
    }
    const lo = Math.log10(A_C), hi = Math.log10(Amax / 3), b = binnedMedians(lx, ly, lo, hi), f = fit(b.X, b.Y);
    out.concavity = -f.slope; out.fits.concavity = { range_m2: [A_C, Amax / 3], bins: b.X.length, r2: f.r2, ks: 10 ** f.intercept, pts: b.X.map((x, k) => [x, b.Y[k]]) };
  }
  // Horton and Tokunaga on Strahler streams
  {
    const isCh = (i) => i >= 0 && order[i] > 0 && land(i);
    const segEnd = new Int32Array(N).fill(-1), segLen = new Float64Array(N);
    for (let j = 0; j < stack.length; j++) {
      const i = stack[j]; if (!isCh(i)) continue;
      const r = rec[i];
      segEnd[i] = isCh(r) && order[r] === order[i] ? segEnd[r] : i;
    }
    for (let i = 0; i < N; i++) if (isCh(i)) segLen[segEnd[i]] += rdist[i];
    let Omega = 0; for (let i = 0; i < N; i++) if (isCh(i) && order[i] > Omega) Omega = order[i];
    const cnt = new Float64Array(Omega + 2), len = new Float64Array(Omega + 2), ar = new Float64Array(Omega + 2);
    const side = Array.from({ length: Omega + 2 }, () => new Float64Array(Omega + 2));
    // heads: channel cells with no donor of their own order (a source, or a junction that raised the order)
    const headMark = new Uint8Array(N);
    {
      const sameDon = new Uint8Array(N);
      for (let i = 0; i < N; i++) { const r = rec[i]; if (isCh(i) && isCh(r) && order[r] === order[i]) sameDon[r] = 1; }
      for (let i = 0; i < N; i++) if (isCh(i) && !sameDon[i]) headMark[i] = 1;
    }
    for (let i = 0; i < N; i++) {
      if (!isCh(i) || segEnd[i] !== i) continue;
      const w = order[i]; cnt[w]++; len[w] += segLen[i]; ar[w] += A[i];
      const r = rec[i];
      // a side tributary joins a higher-order stream without forming it
      if (isCh(r) && order[r] > w) { const formed = order[r] === w + 1 && headMark[r]; if (!formed) side[order[r]][w]++; }
    }
    const per = [];
    for (let w = 1; w <= Omega; w++) per.push({ order: w, N: cnt[w], meanLength_m: cnt[w] ? len[w] / cnt[w] : 0, meanArea_m2: cnt[w] ? ar[w] / cnt[w] : 0 });
    const lo = Omega >= 4 ? 2 : 1, hi = Omega >= 4 ? Omega - 1 : Omega;
    const W = [], lN = [], lL = [], lA = [];
    for (let w = lo; w <= hi; w++) if (cnt[w] > 0) { W.push(w); lN.push(Math.log(cnt[w])); lL.push(Math.log(len[w] / cnt[w])); lA.push(Math.log(ar[w] / cnt[w])); }
    out.horton_Rb = Math.exp(-fit(W, lN).slope);
    out.horton_Rl = Math.exp(fit(W, lL).slope);
    out.horton_Ra = Math.exp(fit(W, lA).slope);
    out.network_D = Math.log(out.horton_Rb) / Math.log(out.horton_Rl);
    let tk = 0, tn = 0;
    for (let w = 2; w <= Omega; w++) if (cnt[w] > 0) { tk += side[w][w - 1] / cnt[w]; tn++; }
    out.tokunaga_T1 = tn ? tk / tn : NaN;
    out.maxOrder = Omega;
    out.fits.horton = { orders: [lo, hi], perOrder: per };
  }
  out.consistency = out.tau - (2 - out.hack_h);
  // hypsometry
  {
    let lo = Infinity, hi = -Infinity, s = 0, m = 0;
    for (let i = 0; i < N; i++) if (landAll(i)) { const v = h[i]; if (v < lo) lo = v; if (v > hi) hi = v; s += v; m++; }
    out.hypsometric_integral = (s / m - lo) / (hi - lo);
    out.relief_m = hi - lo; out.min_m = lo; out.max_m = hi;
  }
  // coastline box dimension
  out.coastline_D = NaN;
  if (t.seaLevel != null) {
    const coast = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const k = y * n + x; if (waterKind[k] === 3) continue;
      if ((x > 0 && waterKind[k - 1] === 3) || (x < n - 1 && waterKind[k + 1] === 3) || (y > 0 && waterKind[k - n] === 3) || (y < n - 1 && waterKind[k + n] === 3)) coast.push(x, y);
    }
    out.coast_cells = coast.length / 2;
    if (coast.length / 2 >= 60) {
      const X = [], Y = [];
      for (let s = 2; s <= 64; s *= 2) {
        const seen = new Set();
        for (let p = 0; p < coast.length; p += 2) seen.add(((coast[p] / s) | 0) * 100000 + ((coast[p + 1] / s) | 0));
        X.push(Math.log(s)); Y.push(Math.log(seen.size));
      }
      const f = fit(X, Y);
      out.coastline_D = -f.slope; out.fits.coast = { boxes_cells: [2, 64], r2: f.r2 };
    }
  }
  // descriptive numbers
  {
    let sl = 0, m = 0, cliff = 0; const mats = new Float64Array(8);
    for (let i = 0; i < N; i++) if (landAll(i)) { sl += t.slope[i]; m++; if (t.material) mats[t.material[i]]++; }
    out.mean_slope_deg = sl / m * 180 / Math.PI;
    out.material_fractions = Array.from(mats, (v) => v / N);
    out.lakes = t.lakes ? t.lakes.length : 0;
    out.straits = t.straits ? t.straits.length : 0;
  }
  out.table = Object.entries(EARTH).map(([key, e]) => {
    const v = out[key];
    const fin = Number.isFinite(v);
    const inside = fin ? v >= e.lo && v <= e.hi : null, near = fin ? v >= e.lo - e.tol && v <= e.hi + e.tol : null;
    // pass: inside the Earth range; near: within the stated tolerance of it (measurement scatter)
    return { key, label: e.label, value: v, target: e.text, lo: e.lo, hi: e.hi, tol: e.tol, source: e.source, url: e.url, pass: inside, near };
  });
  return out;
}
