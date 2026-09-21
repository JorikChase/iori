// metrics.js — morphometrics on a dish, by the fixed protocols of study/05 §4. Pure functions over a
// cell readback (Float32Array, 4 floats per cell, a = slot id), so the harness, the telemetry panel and
// a future T2 run against real SMGR graphs all measure the same way.
//
// Every protocol choice that could be tuned to flatter a result is FIXED HERE and stated in the
// comment: thresholds, scale ranges, fit windows. Changing one changes every past number, so change it
// in a new version, never in place.

export function mask(cells, n, slot = 0) {
  const m = new Uint8Array(n * n);
  for (let i = 0, k = 0; i < cells.length; i += 4, k++) {
    const s = cells[i + 3] | 0;
    if (s > 0 && (slot === 0 || s === slot)) m[k] = 1;
  }
  return m;
}

/** Density-weighted mask: kernels whose "presence" is continuous (colony, biofilm, Gray-Scott) need a
 *  level, not an owner. Fixed at 5 % of the field's own 99th percentile.
 *  The percentile comes from a 4096-bin histogram, not a sort: sorting every occupied cell of a 2048²
 *  dish took most of a second and put the graph extraction out of reach of the engine loop. The bin
 *  error is max/4096, far inside the 5 % threshold. */
export function maskAbove(cells, n, slot = 0, channel = 0) {
  const N = n * n;
  let max = 0, count = 0;
  for (let k = 0; k < N; k++) {
    const s = cells[k * 4 + 3] | 0;
    if (s > 0 && (slot === 0 || s === slot)) { const v = cells[k * 4 + channel]; if (v > 0) { count++; if (v > max) max = v; } }
  }
  const m = new Uint8Array(N);
  if (!count) return m;
  const B = 4096, hist = new Uint32Array(B);
  for (let k = 0; k < N; k++) {
    const s = cells[k * 4 + 3] | 0;
    if (s > 0 && (slot === 0 || s === slot)) { const v = cells[k * 4 + channel]; if (v > 0) hist[Math.min(B - 1, ((v / max) * B) | 0)]++; }
  }
  const want = Math.floor(count * 0.99);
  let acc = 0, b = 0;
  for (; b < B; b++) { acc += hist[b]; if (acc > want) break; }
  const thr = 0.05 * ((b + 0.5) / B) * max;
  for (let k = 0; k < N; k++) {
    const s = cells[k * 4 + 3] | 0;
    if (s > 0 && (slot === 0 || s === slot) && cells[k * 4 + channel] > thr) m[k] = 1;
  }
  return m;
}

export function area(m) { let a = 0; for (let i = 0; i < m.length; i++) a += m[i]; return a; }

export function centroid(m, n) {
  let x = 0, y = 0, c = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (m[j * n + i]) { x += i; y += j; c++; }
  return c ? [x / c + 0.5, y / c + 0.5, c] : [n / 2, n / 2, 0];
}

/** Box-counting dimension. Protocol: boxes from 2 cells up to a QUARTER of the cluster's own radius.
 *  The upper limit matters: letting boxes approach the cluster size drags the slope toward the
 *  embedding dimension and flattens away the very differences being measured (measured — with boxes
 *  up to n/8 an eta sweep whose fill fell 0.97 -> 0.28 read a box dimension of 1.84 throughout).
 *  Least squares on log N vs log(1/s); R² returned so a bad fit can be rejected instead of quoted. */
export function boxDimension(m, n, maxBox = 0) {
  const cap = maxBox > 0 ? Math.max(4, maxBox) : n / 8;
  const xs = [], ys = [];
  for (let s = 2; s <= cap; s *= 2) {
    const g = n / s;
    const hit = new Uint8Array(g * g);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (m[j * n + i]) hit[((j / s) | 0) * g + ((i / s) | 0)] = 1;
    let c = 0; for (let i = 0; i < hit.length; i++) c += hit[i];
    if (c > 0) { xs.push(Math.log(1 / s)); ys.push(Math.log(c)); }
  }
  return fit(xs, ys);
}

/** Mass-radius dimension about the centroid: M(r) ~ r^D. Fitted over r from 4 cells to half the
 *  cluster's maximum radius, which avoids both the seed and the ragged outer edge. */
export function massRadiusDimension(m, n) {
  const [cx, cy] = centroid(m, n);
  let rmax = 0;
  const pts = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (m[j * n + i]) {
    const r = Math.hypot(i + 0.5 - cx, j + 0.5 - cy); pts.push(r); if (r > rmax) rmax = r;
  }
  pts.sort((a, b) => a - b);
  const xs = [], ys = [];
  for (let r = 4; r <= rmax * 0.5; r *= 1.3) {
    let c = 0; while (c < pts.length && pts[c] <= r) c++;
    if (c > 4) { xs.push(Math.log(r)); ys.push(Math.log(c)); }
  }
  return fit(xs, ys);
}

/** Radial front: the outermost occupied cell per angular bin. Returns mean radius and the interface
 *  width w = sd(r), the quantity whose growth exponent is KPZ's beta.
 *
 *  The bin count is NOT fixed. Each bin reports a max over the cells it covers, so a fixed 256 bins
 *  averages over 2.9 cells of arc on a draft cluster and 5.8 on the same cluster at normal, and the
 *  width it returns is then a property of the grid rather than of the interface. Bins are therefore
 *  chosen to hold a constant arc of two cells. This was measured, not assumed: it is what made the
 *  Eden exponent look resolution-dependent. */
export function front(m, n, bins = 0) {
  const [cx, cy] = centroid(m, n);
  if (!bins) {
    let rmax = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (m[j * n + i]) {
      const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cy); if (d > rmax) rmax = d;
    }
    bins = Math.max(64, Math.min(2048, Math.round((2 * Math.PI * rmax) / 2)));
  }
  const r = new Float64Array(bins);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (m[j * n + i]) {
    const dx = i + 0.5 - cx, dy = j + 0.5 - cy;
    const b = (((Math.atan2(dy, dx) / (2 * Math.PI) + 1) * bins) | 0) % bins;
    const d = Math.hypot(dx, dy);
    if (d > r[b]) r[b] = d;
  }
  const used = Array.from(r).filter((v) => v > 0);
  if (used.length < bins * 0.5) return { mean: 0, width: 0, bins: used.length };
  const mean = used.reduce((a, b) => a + b, 0) / used.length;
  const width = Math.sqrt(used.reduce((a, b) => a + (b - mean) ** 2, 0) / used.length);
  return { mean, width, bins: used.length };
}

/** Gliding-box lacunarity (Allain & Cloitre) at one box size, reported as Lambda = 1 + var/mean^2. */
export function lacunarity(m, n, box) {
  const sum = new Float64Array((n + 1) * (n + 1));
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++)
    sum[(j + 1) * (n + 1) + i + 1] = m[j * n + i] + sum[j * (n + 1) + i + 1] + sum[(j + 1) * (n + 1) + i] - sum[j * (n + 1) + i];
  let s1 = 0, s2 = 0, c = 0;
  for (let j = 0; j + box <= n; j++) for (let i = 0; i + box <= n; i++) {
    const v = sum[(j + box) * (n + 1) + i + box] - sum[j * (n + 1) + i + box] - sum[(j + box) * (n + 1) + i] + sum[j * (n + 1) + i];
    s1 += v; s2 += v * v; c++;
  }
  if (!c || s1 === 0) return 1;
  const mean = s1 / c;
  return (s2 / c) / (mean * mean);
}

/** Least squares with R². */
export function fit(xs, ys) {
  const k = xs.length;
  if (k < 3) return { slope: NaN, r2: 0, points: k };
  const mx = xs.reduce((a, b) => a + b, 0) / k, my = ys.reduce((a, b) => a + b, 0) / k;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < k; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  const slope = sxy / sxx;
  return { slope, r2: syy > 0 ? (sxy * sxy) / (sxx * syy) : 0, points: k };
}

/** Power-law exponent of a series of (t, y) samples, fitted on log-log over the last 3/4 (the early
 *  points are the seed, not the scaling regime). */
export function exponent(ts, ys) {
  const k0 = Math.floor(ts.length / 4);
  const xs = [], zs = [];
  for (let i = k0; i < ts.length; i++) if (ts[i] > 0 && ys[i] > 0) { xs.push(Math.log(ts[i])); zs.push(Math.log(ys[i])); }
  return fit(xs, zs);
}

/** The five regions of the Fujikawa–Matsushita diagram, decided by numbers rather than by eye
 *  (study/05 §6 test 11). The ring test is gated on the band actually being FILLED: a dendritic
 *  cluster's radial occupancy oscillates just as hard as a ringed colony's, and only the ring colony
 *  is azimuthally coherent, which shows up as a high mean occupancy in the band.
 *  The last split is roughness, not fill: Eden and a homogeneous disk are both solid, and what
 *  separates them is a KPZ-rough front against a smooth one. */
export function morphotype({ boxD, ringiness, ringOcc, fill, roughness, densityRings = 0 }) {
  if (fill > 0.5 && (densityRings > 0.10 || (ringOcc > 0.5 && ringiness > 0.12))) return 'concentric rings';
  // DLA against dense branching: both are branched and both sit near D 1.5-1.8. What separates them
  // is that DBM has a filled envelope of roughly constant branch density and DLA does not.
  if (fill < 0.12) return 'DLA-like';
  if (fill < 0.75) return 'dense branching';
  if (roughness > 0.02) return 'Eden-like';
  return 'homogeneous disk';
}

/** Radial profile of a CONTINUOUS field (density), not of the binary mask. A ring colony's rings are
 *  density bands: on a mask they are invisible, which is why the first ring test read zero. */
export function radialDensity(cells, n, slot, chans = [0], nb = 48) {
  const m = maskAbove(cells, n, slot);
  const [cx, cy] = centroid(m, n);
  const R = front(m, n).mean || 1;
  const sum = new Float64Array(nb), cnt = new Float64Array(nb);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    if ((cells[k * 4 + 3] | 0) !== slot) continue;
    const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cy) / R;
    if (d >= 1) continue;
    const b = Math.min(nb - 1, (d * nb) | 0);
    let v = 0; for (const c of chans) v += cells[k * 4 + c];
    sum[b] += v; cnt[b]++;
  }
  const prof = Array.from(sum, (v, i) => (cnt[i] ? v / cnt[i] : 0));
  const lo = Math.floor(nb * 0.15), hi = Math.floor(nb * 0.95);
  const band = prof.slice(lo, hi).filter((v) => v > 0);
  if (band.length < 8) return { ringiness: 0, mean: 0, profile: prof };
  const mean = band.reduce((a, b) => a + b, 0) / band.length;
  let best = 0;
  for (let k = 2; k <= 9; k++) {
    let re = 0, im = 0;
    for (let i = 0; i < band.length; i++) { const t = (2 * Math.PI * k * i) / band.length; re += band[i] * Math.cos(t); im += band[i] * Math.sin(t); }
    best = Math.max(best, (2 * Math.hypot(re, im)) / band.length);
  }
  return { ringiness: mean > 0 ? best / mean : 0, mean, profile: prof };
}

/** Ringiness on the occupancy mask (kept for sparse growths where density has no meaning). */
export function radialProfile(m, n, nb = 64) {
  const [cx, cy] = centroid(m, n);
  const f = front(m, n);
  const R = f.mean || 1;
  const occ = new Float64Array(nb), tot = new Float64Array(nb);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cy) / R;
    if (d >= 1) continue;
    const b = Math.min(nb - 1, (d * nb) | 0);
    tot[b]++; if (m[j * n + i]) occ[b]++;
  }
  const prof = Array.from(occ, (v, i) => (tot[i] ? v / tot[i] : 0));
  const lo = Math.floor(nb * 0.2), hi = Math.floor(nb * 0.9);
  const band = prof.slice(lo, hi);
  const mean = band.reduce((a, b) => a + b, 0) / Math.max(band.length, 1);
  let best = 0;
  for (let k = 2; k <= 10; k++) {                       // 2..10 rings across the band
    let re = 0, im = 0;
    for (let i = 0; i < band.length; i++) { const t = (2 * Math.PI * k * i) / band.length; re += band[i] * Math.cos(t); im += band[i] * Math.sin(t); }
    best = Math.max(best, (2 * Math.hypot(re, im)) / band.length);
  }
  return { profile: prof, mean, ringiness: mean > 0 ? best / mean : 0, R };
}

/** Everything the morphotype test needs, in one pass. */
export function describe(cells, n, slot = 0, cellMm = 1, densChans = null) {
  const m = maskAbove(cells, n, slot);
  const a = area(m);
  if (!a) return { area: 0 };
  const f = front(m, n);
  const rp = radialProfile(m, n);
  const box = boxDimension(m, n, Math.floor(f.mean / 4)), mr = massRadiusDimension(m, n);
  const disc = Math.PI * f.mean * f.mean;
  const out = {
    area: a, area_mm2: a * cellMm * cellMm,
    radius_mm: f.mean * cellMm, width_mm: f.width * cellMm,
    roughness: f.mean > 0 ? f.width / f.mean : 0,
    boxD: box.slope, boxR2: box.r2, massD: mr.slope, massR2: mr.r2,
    lac: lacunarity(m, n, Math.max(4, Math.round(n / 64))),
    fill: disc > 0 ? Math.min(1, a / disc) : 0,
    ringiness: rp.ringiness, ringOcc: rp.mean,
  };
  if (densChans) out.densityRings = radialDensity(cells, n, slot, densChans).ringiness;
  out.morphotype = morphotype(out);
  return out;
}
