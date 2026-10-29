// The radiance-fields paper's 2-D world: two shapes as signed distance fields, the density a distance field
// becomes, an emission colour, and the representations the paper compares (voxels, a distance grid,
// Gaussians, the lowest frequencies). Pure functions on the unit square [-1, 1]²; figures.js draws them.

const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const circle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;

// shape A: three discs grown together, a bite taken out of the largest (a smooth union and a subtraction)
export function sdfA(x, y) {
  let d = smin(circle(x, y, -0.28, -0.12, 0.38), circle(x, y, 0.3, -0.2, 0.26), 0.25);
  d = smin(d, circle(x, y, 0.08, 0.36, 0.22), 0.25);
  return Math.max(d, -circle(x, y, -0.42, -0.3, 0.14));
}
// shape B: a five-armed flower, its distance approximated from the polar radius (a lower bound, scaled)
export function sdfB(x, y) {
  const r = Math.hypot(x, y), t = Math.atan2(y, x);
  return (r - (0.42 + 0.2 * Math.cos(5 * t + 0.6))) * 0.72;
}

// a distance d becomes a density: σ = s · logistic(−s·d) — fog for small s, a hard surface as s grows (the
// logistic form NeuS uses; VolSDF's Laplace CDF behaves the same way)
export const density = (d, s) => s / (1 + Math.exp(s * d));

// emission: the colour each point gives off, a slow sweep through the paper's three colours
export function emission(x, y) {
  const a = 0.5 + 0.5 * Math.sin(2.1 * x + 0.6), b = 0.5 + 0.5 * Math.sin(2.7 * y - 0.4);
  const walk = [0.878, 0.439, 0.227], data = [0.137, 0.576, 0.416], noise = [0.176, 0.435, 0.824];
  return [0, 1, 2].map((i) => walk[i] * a * (1 - b) + data[i] * (1 - a) * b + noise[i] * (a * b + (1 - a) * (1 - b)));
}

// sample a field on an n×n grid over [-1, 1]² (cell centres)
export function grid(n, f) {
  const g = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g[j * n + i] = f(-1 + (2 * i + 1) / n, -1 + (2 * j + 1) / n);
  return g;
}
// bilinear read of an n×n grid at (x, y)
export function bilinear(g, n, x, y) {
  const u = Math.min(n - 1, Math.max(0, ((x + 1) / 2) * n - 0.5)), v = Math.min(n - 1, Math.max(0, ((y + 1) / 2) * n - 0.5));
  const i = Math.min(n - 2, Math.floor(u)), j = Math.min(n - 2, Math.floor(v)), fu = u - i, fv = v - j;
  if (n < 2) return g[0];
  const a = g[j * n + i], b = g[j * n + i + 1], c = g[(j + 1) * n + i], e = g[(j + 1) * n + i + 1];
  return (a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + e * fu) * fv;
}

// occupancy (0..1) of a distance field at a soft edge of width w: what the representations try to hold
export const occupancy = (d, w = 0.02) => 1 / (1 + Math.exp(d / w));

// ---------- representations of one occupancy field, each given a budget in stored numbers ----------

// voxels: an occupancy grid of ⌊√budget⌋² cells, read bilinearly
export function voxels(sdf, budget) {
  const n = Math.max(2, Math.floor(Math.sqrt(budget)));
  const g = grid(n, (x, y) => occupancy(sdf(x, y)));
  return { n, stored: n * n, at: (x, y) => bilinear(g, n, x, y) };
}
// a distance grid: the same cells hold the distance, and the edge is drawn sharp from it (the trick behind
// signed-distance representations: a linear quantity interpolates well, a step does not)
export function distanceGrid(sdf, budget) {
  const n = Math.max(2, Math.floor(Math.sqrt(budget)));
  const g = grid(n, sdf);
  return { n, stored: n * n, at: (x, y) => occupancy(bilinear(g, n, x, y)) };
}
// Gaussians: k-means on points of the shape, each cluster an anisotropic Gaussian (6 numbers: centre, three
// covariance entries, a weight); their sum, clipped at 1, is the field (a 2-D 3DGS without the optimiser)
export function gaussians(sdf, budget, seed = 7) {
  const k = Math.max(1, Math.floor(budget / 6));
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pts = [];
  for (let j = 0; j < 72; j++) for (let i = 0; i < 72; i++) {
    const x = -1 + (2 * i + 1) / 72, y = -1 + (2 * j + 1) / 72;
    if (sdf(x, y) < 0) pts.push([x, y]);
  }
  let cs = Array.from({ length: k }, () => pts[Math.floor(rnd() * pts.length)].slice());
  const lab = new Int32Array(pts.length);
  for (let it = 0; it < 12; it++) {
    pts.forEach((p, q) => { let best = 0, bd = Infinity; cs.forEach((c, m) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2; if (d < bd) { bd = d; best = m; } }); lab[q] = best; });
    const sum = cs.map(() => [0, 0, 0]);
    pts.forEach((p, q) => { const t = sum[lab[q]]; t[0] += p[0]; t[1] += p[1]; t[2]++; });
    cs = cs.map((c, m) => (sum[m][2] ? [sum[m][0] / sum[m][2], sum[m][1] / sum[m][2]] : c));
  }
  const area = (2 / 72) ** 2;
  const G = cs.map((c, m) => {
    let xx = 0, xy = 0, yy = 0, n = 0;
    pts.forEach((p, q) => { if (lab[q] !== m) return; const dx = p[0] - c[0], dy = p[1] - c[1]; xx += dx * dx; xy += dx * dy; yy += dy * dy; n++; });
    const e = 0.0004;
    xx = xx / Math.max(1, n) + e; xy /= Math.max(1, n); yy = yy / Math.max(1, n) + e;
    // a cluster of n cells of area a covers n·a; a Gaussian of covariance Σ peaks at 1 over 2π√|Σ| of area,
    // so this weight makes each cluster's Gaussian about as full as the cells it stands for
    const det = xx * yy - xy * xy, w = Math.min(1.6, (n * area) / (2 * Math.PI * Math.sqrt(det)));
    return { c, inv: [yy / det, -xy / det, xx / det], w, cov: [xx, xy, yy] };
  });
  const at = (x, y) => {
    let v = 0;
    for (const g of G) { const dx = x - g.c[0], dy = y - g.c[1]; v += g.w * Math.exp(-0.5 * (g.inv[0] * dx * dx + 2 * g.inv[1] * dx * dy + g.inv[2] * dy * dy)); }
    return Math.min(1, v);
  };
  return { k, stored: k * 6, G, at };
}
// the lowest frequencies: the occupancy's 2-D Fourier series kept up to the frequencies the budget allows
// (each kept frequency costs two numbers, its cosine and sine weights); coarse first, as paper 0's generators
export function lowFrequencies(sdf, budget) {
  const N = 64, f = grid(N, (x, y) => occupancy(sdf(x, y)));
  // frequencies ordered by length, kept while the budget lasts
  const freq = [];
  for (let v = -16; v <= 16; v++) for (let u = 0; u <= 16; u++) { if (u === 0 && v < 0) continue; freq.push([u, v]); }
  freq.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));
  const kept = freq.slice(0, Math.max(1, Math.floor(budget / 2)));
  const coef = kept.map(([u, v]) => {
    let re = 0, im = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const ph = (2 * Math.PI * (u * i + v * j)) / N, val = f[j * N + i];
      re += val * Math.cos(ph); im -= val * Math.sin(ph);
    }
    const scale = (u === 0 && v === 0 ? 1 : 2) / (N * N);
    return [u, v, re * scale, im * scale];
  });
  const at = (x, y) => {
    const i = ((x + 1) / 2) * N - 0.5, j = ((y + 1) / 2) * N - 0.5;
    let s = 0;
    for (const [u, v, re, im] of coef) { const ph = (2 * Math.PI * (u * i + v * j)) / N; s += re * Math.cos(ph) - im * Math.sin(ph); }
    return Math.min(1, Math.max(0, s));
  };
  return { kept: kept.length, stored: kept.length * 2, at };
}
