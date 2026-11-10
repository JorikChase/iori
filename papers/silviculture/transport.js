// 3.3 Particles instead of a law: stochastic sediment transport at plot scale, reduced.
// McDonald & Cordonnier (TOG 2026) replace the stream-power law with many water particles that each carry
// sediment, sampled stochastically, with momentum averaged across particles into a field that later particles
// feel; braided rivers, fans and deltas emerge without being drawn. Their code is CUDA. This is the reduced form
// the same first author published before it as SimpleHydrology (McDonald 2020, open source): a particle descends
// the surface; its speed is pushed by gravity and by the mean momentum of earlier particles in that cell; it picks
// up sediment toward an equilibrium load c_eq = (1 + E·discharge)·Δh and sets down the excess; water evaporates;
// discharge and momentum are running averages of what passed. A talus rule moves material steeper than 40°.
//
// The plot: 1.6 km of 10 m cells, an upland block along the top whose front drops 150 m to a plain that slopes
// 1 % to the bottom edge, the only outlet. Rain falls everywhere. Mass is conserved: every metre removed is
// carried, set down or leaves through the outlet; the budget is checked.
// Liberties: the rates are SimpleHydrology's, scaled to 10 m cells; no grain sizes, no bedrock/sediment split,
// no time unit (an iteration is one batch of particles, not a year).
import { diamondSquare, hash32, mulberry32 } from '../fractals/landscape-terrain.js';

export function createTransport({ seed = 1, n = 160, cell = 10 } = {}) {
  const N = n * n;
  const h = new Float64Array(N), h0 = new Float64Array(N), Q = new Float32Array(N), MX = new Float32Array(N), MY = new Float32Array(N);
  const tQ = new Float32Array(N), tX = new Float32Array(N), tY = new Float32Array(N);
  const P = { particles: 400, momentum: 1, dt: 1.2, dep: 0.1, evap: 0.001, E: 10, minVol: 0.01, maxAge: 400, lrate: 0.1, talus: Math.tan(40 * Math.PI / 180) * 1, settle: 0.8 };
  let rng, it = 0, exported = 0, front = 0;
  // heights are kept in cell units (metres / cell), so a slope is a height difference
  function reset(s = seed, opts = {}) {
    seed = s; Object.assign(P, opts); rng = mulberry32(hash32(seed, 7, 0x7a5)); it = 0; exported = 0;
    const d = diamondSquare(256, 0.7, hash32(seed, 2, 0xf00)), m = d.n;
    const at = (u, v) => d.z[Math.min(m - 1, Math.round(v * (m - 1))) * m + Math.min(m - 1, Math.round(u * (m - 1)))];
    let lo = Infinity, hi = -Infinity; for (const v of d.z) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    front = Math.round(n * 0.34);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const k = j * n + i, u = i / (n - 1), v = j / (n - 1), r = (at(u, v) - lo) / (hi - lo);
      const fy = front + 4 * Math.sin(u * 9 + seed);                         // a wavy mountain front
      const plain = 0.01 * (n - 1 - j) * cell + 0.6 * r;                     // 1 % to the outlet edge, 0.6 m roughness
      const s = Math.min(1, Math.max(0, (fy - j) / 6));                       // the front: 6 cells wide
      h[k] = (plain + s * (150 + 120 * r)) / cell;
    }
    h0.set(h); Q.fill(0); MX.fill(0); MY.fill(0);
  }
  const H = (x, y) => h[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))];
  const disch = (k) => erf(0.4 * Q[k]);
  function cascade(x, y) {
    const k = y * n + x;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
      const kk = yy * n + xx, dist = Math.hypot(dx, dy), diff = h[k] - h[kk], excess = Math.abs(diff) - P.talus * dist;
      if (excess <= 0) continue;
      const tr = P.settle * excess / 2;
      if (diff > 0) { h[k] -= tr; h[kk] += tr; } else { h[k] += tr; h[kk] -= tr; }
    }
  }
  function particle() {
    let px = rng() * (n - 1), py = rng() * (n - 1), vx = 0, vy = 0, vol = 1, sed = 0;
    for (let age = 0; age < P.maxAge; age++) {
      const x = px | 0, y = py | 0, k = y * n + x;
      // gravity: down the gradient (central differences)
      const gx = (H(x + 1, y) - H(x - 1, y)) / 2, gy = (H(x, y + 1) - H(x, y - 1)) / 2;
      vx -= P.dt * gx / vol; vy -= P.dt * gy / vol;
      // the mean momentum of earlier particles, felt in proportion to how aligned it is
      const fx = MX[k], fy = MY[k], fl = Math.hypot(fx, fy), sl = Math.hypot(vx, vy);
      if (P.momentum && fl > 0 && sl > 0) { const a = P.dt * P.momentum * (fx * vx + fy * vy) / (fl * sl) / (vol + disch(k)); vx += a * fx; vy += a * fy; }
      const s2 = Math.hypot(vx, vy); if (s2 > 0) { vx *= Math.SQRT2 / s2; vy *= Math.SQRT2 / s2; }
      px += vx; py += vy;
      tQ[k] += vol; tX[k] += vol * vx; tY[k] += vol * vy;
      const oob = px < 0 || py < 0 || px >= n - 1 || py >= n - 1;
      if (oob && py >= n - 1) { exported += sed * vol; return; }                   // the outlet edge: the load leaves
      if (oob) { h[k] += sed * vol; return; }                                       // a closed edge: set it down
      const k2 = (py | 0) * n + (px | 0);
      let ceq = (1 + P.E * disch(k)) * (h[k] - h[k2]); if (ceq < 0) ceq = 0;
      const cd = ceq - sed;
      sed += P.dt * P.dep * cd; h[k] -= P.dt * vol * P.dep * cd;
      sed /= 1 - P.dt * P.evap; vol *= 1 - P.dt * P.evap;
      cascade(x, y);
      if (vol < P.minVol) break;
    }
    const k = (py | 0) * n + (px | 0); h[k] += sed * vol;                           // dried out: set the load down
  }
  function step() {
    tQ.fill(0); tX.fill(0); tY.fill(0);
    for (let p = 0; p < P.particles; p++) particle();
    for (let k = 0; k < N; k++) { Q[k] += P.lrate * (tQ[k] - Q[k]); MX[k] += P.lrate * (tX[k] - MX[k]); MY[k] += P.lrate * (tY[k] - MY[k]); }
    it++;
    return true;
  }
  // measurements: braiding (channel threads crossing each row of the plain), the fan, and the mass budget
  function stats() {
    let threads = 0, rows = 0;
    for (let j = front + 25; j < n - 10; j += 5) {
      let c = 0, on = false;
      for (let i = 0; i < n; i++) { const w = disch(j * n + i) > 0.3; if (w && !on) c++; on = w; }
      threads += c; rows++;
    }
    let ero = 0, dep = 0, fan = 0, dz = 0;
    const c3 = cell * cell * cell;
    for (let k = 0; k < N; k++) { const d = (h[k] - h0[k]); dz += d; if (d < 0) ero -= d; else dep += d; if (d > 0 && ((k / n) | 0) > front) fan += d; }
    return { it, threads: threads / rows, eroded: ero * c3, deposited: dep * c3, fan: fan * c3, exported: exported * c3, balance: (dz + exported) * c3 };
  }
  reset(seed);
  return { reset, step, stats, P, n, cell, h, h0, Q, disch, get front() { return front; }, get t() { return it; } };
}

// Abramowitz & Stegun 7.1.26
function erf(x) {
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
}
