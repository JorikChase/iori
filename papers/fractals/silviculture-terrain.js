/*
 * silviculture-terrain.js — a STAND-IN for the ground agent's landscape-terrain.js / landscape-ground.js, with the
 * same interface shape (papers/fractals/LANDSCAPE.md). The environment view imports the real modules when they
 * exist and falls back to this file otherwise. Nothing here is physical erosion: it is the section 2.3 diamond-square
 * fBm with the climate and drainage fields the plants read. Every rule below is ours and only a placeholder:
 *  - height: diamond-square fBm (Hurst = roughness) plus a broad dome so the region has one massif, scaled to
 *    RELIEF_M = 1600 m; datum 0 at the lowest cell.
 *  - lakes: cells below the 4th height percentile (waterKind 2); rivers: D8 drainage area above RIVER_KM2 = 2 km²
 *    (waterKind 1, depth 1 m).
 *  - soil depth: 1.8 m on flat ground thinning to 0 at 40°, plus up to 1 m with wetness.
 *  - material: 0 bedrock above 40°, 1 scree 32–40°, 5 snow where T < −3 °C, 6 water, 3 wet meadow (wet), else 2 soil.
 *  - climate: T = T0 − 0.0065·h; P = P0·(1 + 0.0004·h)·(1 + 0.6·windward slope component), a crude orographic stand-in.
 *  - crop(): bilinear resampling plus a small fBm amplification (amplitude 0.25 × region cell size, damped on water).
 * Coordinates: x east, y north, metres from the region's south-west corner; grid row 0 is the south edge.
 * three.js mapping used by the ground stand-in (silviculture-ground.js): (x, height, −y).
 */
const RELIEF_M = 1600, RIVER_KM2 = 2, LAPSE = -0.0065;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gaussFrom(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); }
function diamondSquare(size, H, seed) {
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
  return z;
}

/** derive slope, drainage, wetness, soil, material, climate from a height grid; returns a Terrain-like object */
function derive(t, climate) {
  const { n, cell_m } = t, h = t.height, N = n * n;
  const slope = new Float32Array(N), area = new Float32Array(N).fill(cell_m * cell_m), receiver = new Int32Array(N).fill(-1);
  const at = (x, y) => h[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))];
  let gxw = 0, gyw = 0; // wind unit vector (wind FROM windDir → blowing toward windDir + π)
  const wd = climate.windDir || 0; gxw = -Math.cos(wd); gyw = -Math.sin(wd);
  const T = new Float32Array(N), P = new Float32Array(N), windward = new Float32Array(N);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) / (2 * cell_m), dy = (at(x, y + 1) - at(x, y - 1)) / (2 * cell_m), i = y * n + x;
    slope[i] = Math.atan(Math.hypot(dx, dy));
    windward[i] = Math.max(0, -(dx * gxw + dy * gyw)); // terrain rising into the wind
  }
  const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => h[b] - h[a]);
  for (const i of order) {
    const x = i % n, y = (i / n) | 0;
    let best = -1, bh = h[i];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const j = ny * n + nx; if (h[j] < bh) { bh = h[j]; best = j; }
    }
    receiver[i] = best;
    if (best >= 0) area[best] += area[i];
  }
  const sorted = Float32Array.from(h).sort(), lakeLevel = sorted[Math.floor(0.04 * N)];
  const wetness = new Float32Array(N), water = new Float32Array(N), waterKind = new Uint8Array(N), soil = new Float32Array(N), material = new Uint8Array(N);
  let wmin = Infinity, wmax = -Infinity;
  for (let i = 0; i < N; i++) { wetness[i] = Math.log(area[i] / Math.max(0.01, Math.tan(slope[i]))); wmin = Math.min(wmin, wetness[i]); wmax = Math.max(wmax, wetness[i]); }
  for (let i = 0; i < N; i++) {
    T[i] = climate.T0 + LAPSE * h[i];
    P[i] = climate.P0 * (1 + 0.0004 * h[i]) * (1 + 0.6 * Math.min(1, windward[i] * 3));
    const wn = (wetness[i] - wmin) / (wmax - wmin || 1), deg = slope[i] * 180 / Math.PI;
    if (h[i] <= lakeLevel) { waterKind[i] = 2; water[i] = lakeLevel - h[i] + 0.5; }
    else if (area[i] > RIVER_KM2 * 1e6) { waterKind[i] = 1; water[i] = 1; }
    soil[i] = Math.max(0, 1.8 * (1 - deg / 40)) + wn;
    material[i] = waterKind[i] ? 6 : deg > 40 ? 0 : deg > 32 ? 1 : T[i] < -3 ? 5 : wn > 0.62 ? 3 : 2;
  }
  return Object.assign(t, { slope, area, receiver, wetness, water, waterKind, soil, material, T, P, bedrock: Float32Array.from(h),
    hardness: new Float32Array(N).fill(0.5), lithology: new Uint8Array(N), rivers: [], lakes: [], stats: {} });
}

function sampler(t) {
  const { n, cell_m } = t;
  const bil = (a, x, y) => {
    const fx = Math.min(n - 1.0001, Math.max(0, x / cell_m)), fy = Math.min(n - 1.0001, Math.max(0, y / cell_m));
    const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, i = iy * n + ix;
    return (a[i] * (1 - tx) + a[i + 1] * tx) * (1 - ty) + (a[i + n] * (1 - tx) + a[i + n + 1] * tx) * ty;
  };
  const near = (a, x, y) => a[Math.min(n - 1, Math.max(0, Math.round(y / cell_m))) * n + Math.min(n - 1, Math.max(0, Math.round(x / cell_m)))];
  t.sample = (x, y) => ({ h: bil(t.height, x, y), soil: bil(t.soil, x, y), slope: bil(t.slope, x, y), T: bil(t.T, x, y), P: bil(t.P, x, y),
    wet: bil(t.wetness, x, y), material: near(t.material, x, y), lithology: near(t.lithology, x, y), water: bil(t.water, x, y), waterKind: near(t.waterKind, x, y) });
  t.heightAt = (x, y) => bil(t.height, x, y);
  return t;
}

export function generateTerrain(opts = {}) {
  const seed = opts.seed ?? 1, size_m = opts.size_m ?? 10000, cells = opts.cells ?? 256, H = opts.roughness ?? 0.6;
  const climate = { T0: 14, P0: 900, windDir: 0, ...(opts.climate || {}) };
  const z = diamondSquare(nextPow2(cells - 1), H, seed);
  const zn = Math.round(Math.sqrt(z.length));
  const n = zn, cell_m = size_m / (n - 1), height = new Float32Array(n * n);
  let lo = Infinity, hi = -Infinity;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = x / (n - 1) - 0.5, v = y / (n - 1) - 0.5, dome = Math.exp(-(u * u + v * v) / 0.09);
    const val = z[y * n + x] + 1.6 * dome; height[y * n + x] = val; lo = Math.min(lo, val); hi = Math.max(hi, val);
  }
  for (let i = 0; i < height.length; i++) height[i] = (height[i] - lo) / (hi - lo) * RELIEF_M;
  const t = derive({ n, cell_m, size_m, seaLevel: null, height, standIn: true, climate }, climate);
  sampler(t);
  t.crop = (x0, y0, w_m, cells2) => crop(t, x0, y0, w_m, cells2, seed, climate);
  return t;
}
function nextPow2(v) { let p = 1; while (p < v) p <<= 1; return p; }
export async function generateTerrainAsync(opts, onProgress) { onProgress && onProgress(0.5); const t = generateTerrain(opts); onProgress && onProgress(1); return t; }

function crop(t, x0, y0, w_m, cells, seed, climate) {
  const n = cells, cell_m = w_m / (n - 1), height = new Float32Array(n * n);
  const amp = 0.25 * t.cell_m, det = diamondSquare(nextPow2(n - 1), 0.7, (seed * 7919 + Math.round(x0) * 31 + Math.round(y0)) >>> 0), dn = Math.round(Math.sqrt(det.length));
  let dlo = Infinity, dhi = -Infinity; for (const v of det) { dlo = Math.min(dlo, v); dhi = Math.max(dhi, v); }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const s = t.sample(x0 + x * cell_m, y0 + y * cell_m);
    const d = (det[Math.min(dn - 1, y) * dn + Math.min(dn - 1, x)] - dlo) / (dhi - dlo || 1) - 0.5;
    height[y * n + x] = s.h + (s.waterKind ? 0 : amp * d);
  }
  const c = derive({ n, cell_m, size_m: w_m, seaLevel: null, height, origin: { x: x0, y: y0 }, standIn: true }, climate);
  // keep the region's water (the window is too small to grow its own drainage)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const s = t.sample(x0 + x * cell_m, y0 + y * cell_m), i = y * n + x;
    c.waterKind[i] = s.waterKind; c.water[i] = s.water; if (s.waterKind) c.material[i] = 6; else if (c.material[i] === 6) c.material[i] = 2;
    c.P[i] = s.P;
  }
  return sampler(c);
}

