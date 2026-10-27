// Breeding by the metric. A neighbour is a step of D on-screen pixels in a random direction across the
// unpinned parameters: each parameter moves by D·zₖ / (its pixels per unit), with z a random unit
// vector — so every neighbour is a known visual distance away, whatever the parameters measure.
// The archive is MAP-Elites over two features the sensing pass already gives: how much of the view is
// surface, and the median Lyapunov exponent there. Each cell keeps its best formula by a quality that
// rewards depth structure (spread of hit distances) and a view neither empty nor full.

import { normalize } from './formula.js';
import { getOp } from './ops.js';
import { driveParams, getDriveParam, setDriveParam } from './drive.js';

const flat = (f) => f.slots.flat();
// a metric entry names an op parameter (oi, key) or a driver's (drive: a core/drive.js ref — a band's
// lo or hi, a driver node's parameter); the drivers' structure is never bred
const pinKey = (m) => (m.drive ? m.drive : m.oi + '.' + m.key);
const valueOf = (f, ops, m) => (m.drive ? (f.drive ? getDriveParam(f.drive, m.drive) : undefined) : ops[m.oi].p[m.key]);

// metric: [{ oi, key, pxPerUnit } | { drive, pxPerUnit }]; pins: Set('oi.key' | drive ref); rnd: () => uniform [0, 1)
export function mutate(formula, metric, pins, D, rnd) {
  const f = JSON.parse(JSON.stringify(normalize(formula)));
  const free = metric.filter((m) => m.pxPerUnit > 0 && !pins.has(pinKey(m)) && valueOf(f, flat(f), m) !== undefined);
  if (!free.length) return f;
  // a uniform direction: normalised Gaussians
  const z = free.map(() => {
    const u = rnd() || 1e-9, v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  });
  const n = Math.hypot(...z) || 1;
  const ops = flat(f);
  const drv = new Map(driveParams(f.drive).map((q) => [q.ref, q]));
  free.forEach((m, i) => {
    if (m.drive) {
      const q = drv.get(m.drive);
      let v = getDriveParam(f.drive, m.drive) + (D * z[i]) / n / m.pxPerUnit;
      if (q && q.min !== undefined) v = Math.max(q.min, v);
      if (q && q.max !== undefined) v = Math.min(q.max, v);
      setDriveParam(f.drive, m.drive, +v.toPrecision(6));
      return;
    }
    const o = ops[m.oi];
    const q = getOp(o.op).params.find((p) => p.k === m.key);
    let v = o.p[m.key] + (D * z[i]) / n / m.pxPerUnit;
    if (q.min !== undefined) v = Math.max(q.min, v);
    if (q.max !== undefined) v = Math.min(q.max, v);
    o.p[m.key] = +v.toPrecision(6);
  });
  return f;
}

// how far apart two formulas of one structure look, in pixels, by the metric (first order)
export function distancePx(a, b, metric) {
  const fa = normalize(a), fb = normalize(b), A = flat(fa), B = flat(fb);
  let s = 0;
  for (const m of metric) {
    const d = (valueOf(fb, B, m) - valueOf(fa, A, m)) * m.pxPerUnit;
    if (Number.isFinite(d)) s += d * d;
  }
  return Math.sqrt(s);
}

// features from a sensing result: { density (fraction of rays that hit), chaos (median λ), quality }
export function features(r) {
  const hits = r.rays.filter((q) => q.hit);
  const density = hits.length / Math.max(r.rays.length, 1);
  const ts = hits.map((q) => q.t);
  const mean = ts.reduce((a, b) => a + b, 0) / Math.max(ts.length, 1);
  const sd = Math.sqrt(ts.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(ts.length, 1));
  const structure = mean > 0 ? sd / mean : 0;
  // an empty or a full view is a poor elite whatever its depth spread
  const fill = density > 0.05 && density < 0.97 ? 1 : 0.2;
  return { density, chaos: r.lyap.median, quality: structure * fill };
}

// MAP-Elites over (density, chaos). Chaos is binned about the λ of the view the archive started from,
// ±spread·3, so the grid fits the formula family it serves.
export function createArchive({ bins = 8 } = {}) {
  let cells = new Map(), structure = null, lam0 = 0, lamW = 1;
  const keyOf = (ft) => {
    const i = Math.min(bins - 1, Math.max(0, Math.floor(ft.density * bins)));
    const j = Math.min(bins - 1, Math.max(0, Math.floor(((ft.chaos - lam0) / lamW + 0.5) * bins)));
    return i + ',' + j;
  };
  return {
    // start over for a new structure or view
    reset(structureKey, lambda) {
      cells = new Map();
      structure = structureKey;
      lam0 = lambda.median;
      lamW = Math.max((lambda.p90 - lambda.p10) * 6, 0.2);
    },
    get structure() { return structure; },
    // entry: { text, features }; returns true when it became an elite
    offer(entry) {
      const k = keyOf(entry.features);
      const cur = cells.get(k);
      if (!cur || entry.features.quality > cur.features.quality) { cells.set(k, { ...entry, cell: k }); return true; }
      return false;
    },
    elites: () => [...cells.values()],
    get size() { return cells.size; },
    cellOf: keyOf,
    bins,
  };
}

// pick n elites spread out in feature space: farthest-point sampling from the current features
export function spread(elites, from, n) {
  const pts = [];
  const d = (a, b) => Math.hypot(a.density - b.density, (a.chaos - b.chaos) * 0.5);
  const pool = elites.slice();
  let anchors = [from];
  while (pts.length < n && pool.length) {
    let best = -1, bi = -1;
    pool.forEach((e, i) => {
      const m = Math.min(...anchors.map((a) => d(a, e.features)));
      if (m > best) { best = m; bi = i; }
    });
    const e = pool.splice(bi, 1)[0];
    pts.push(e);
    anchors.push(e.features);
  }
  return pts;
}
