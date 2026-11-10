// 2.3 The self-organising tree: buds compete for light.
// Pałubicki, Horel, Longay, Runions, Lane, Měch & Prusinkiewicz, "Self-organizing tree models for image synthesis",
// SIGGRAPH 2009, with the shadow-propagation environment (§4.1) and the extended Borchert–Honda allocation (§4.2).
//
// Each year:
//  1. Shadow. Every live bud in voxel (I, J, K) adds a·b^−q to the voxels (I ± p, J − q, K ± p), q = 0…q_max,
//     p = 0…q: a pyramid of shade below it. A bud's light is Q = max(C − s + a, 0) (the + a removes its own shade);
//     its optimal growth direction is down the shadow gradient, −∇s.
//  2. Borchert–Honda. Light is summed from the buds to the base (basipetal); the base gets v = α·Q_base; at each
//     branching node the vigour is split between the continuing axis (Q_m) and the lateral (Q_l):
//     v_m = v·λQ_m / (λQ_m + (1 − λ)Q_l), v_l = v − v_m (acropetal).
//  3. Shedding. A lateral branch whose light per internode falls below a threshold is shed (after Takenaka 1994).
//  4. Growth. A bud with vigour v grows n = ⌊v⌋ metamers (internode, leaf, lateral bud) of length ℓ·v/n; each
//     metamer turns toward d + ξ·(−∇s) + η·up, from its default direction d.
//
// The neighbour: the wall's voxels are opaque (they shade like buds, and nothing is lit inside them). So this tree
// avoids the wall because of its shadow, not its space.
//
// Constants. The paper gives the form of every rule; the values here are ours, chosen in a sweep
// (tools/silviculture/lineage-measure.mjs) and listed so they can be argued with: voxel = internode length ℓ = 0.25 m,
// a = 1, b = 2, q_max = 6, C = 2 (with C = 1 every lateral bud on a shoot is fully shaded by the buds above it,
// ½ + ¼ + … = 1, and the tree grows as a bare pole), α = 2, λ = 0.52, ξ = 0.25, η = 0.12, branching angle 45°,
// phyllotaxis 137.5°, shedding below 0.15 light per internode, pipe exponent 2, tip 1.5 cm.
// Liberties: internodes keep length ℓ (the paper's ℓ·v/n reaches 2ℓ and doubled the leader's growth), and a bud grows
// at most 4 metamers a year, so the leader grows 1 m a year and the tree stands 15 m at 15 years, like the others.
import { Skeleton, WALL } from './skeleton.js?v=3';
import { makeRng } from '../fractals/silviculture-core.js?v=3';

export const SO_DEFAULTS = { lambda: 0.52, alpha: 2, xi: 0.25, eta: 0.12, shed: 0.15, C: 2, b: 2, wall: true };
const VOX = 0.25, GX = 72, GY = 80, GZ = 72, OX = -GX * VOX / 2, OZ = -GZ * VOX / 2; // 18 × 20 × 18 m
let A = 1, B = 2, QMAX = 6, C = 1;
const ELL = VOX, ANG = 45 * Math.PI / 180, PHY = 137.5 * Math.PI / 180, MAXN = 4, CAP = 40000;

const vi = (x, y, z) => {
  const i = Math.floor((x - OX) / VOX), j = Math.floor(y / VOX), k = Math.floor((z - OZ) / VOX);
  return i < 0 || j < 0 || k < 0 || i >= GX || j >= GY || k >= GZ ? -1 : (i * GY + j) * GZ + k;
};

export function createSelfOrg() {
  let P = { ...SO_DEFAULTS }, rng, year = 0;
  // nodes: position, heading, parent, main child, lateral child, buds (terminal / lateral, alive), lateral dir
  let n = 0, X, Y, Z, HX, HY, HZ, par, mainC, latC, bT, bL, LX, LY, LZ, Qt, Ql, QI, cntI, vT, vL, dead;
  const s = new Float32Array(GX * GY * GZ), wallS = new Float32Array(GX * GY * GZ);
  const S = new Skeleton(8192);

  function allocNodes(cap) {
    const f = (A0, T = Float32Array) => { const B0 = new T(cap); if (A0) B0.set(A0); return B0; };
    X = f(X); Y = f(Y); Z = f(Z); HX = f(HX); HY = f(HY); HZ = f(HZ); LX = f(LX); LY = f(LY); LZ = f(LZ);
    par = f(par, Int32Array); mainC = f(mainC, Int32Array); latC = f(latC, Int32Array); bT = f(bT, Uint8Array); bL = f(bL, Uint8Array); dead = f(dead, Uint8Array);
    Qt = f(Qt); Ql = f(Ql); QI = f(QI); cntI = f(cntI, Int32Array); vT = f(vT); vL = f(vL);
  }
  function addNode(x, y, z, hx, hy, hz, p, k) {
    if (n >= X.length) allocNodes(X.length * 2);
    const i = n++;
    X[i] = x; Y[i] = y; Z[i] = z; HX[i] = hx; HY[i] = hy; HZ[i] = hz; par[i] = p; mainC[i] = -1; latC[i] = -1; bT[i] = 1; bL[i] = p >= 0 ? 1 : 0; dead[i] = 0;
    // the lateral bud's default direction: the heading turned by the branching angle, rolled by the phyllotaxis
    let ux = 0, uy = 1, uz = 0; if (Math.abs(hy) > 0.95) { ux = 1; uy = 0; }
    let ax = uy * hz - uz * hy, ay = uz * hx - ux * hz, az = ux * hy - uy * hx; const al = Math.hypot(ax, ay, az); ax /= al; ay /= al; az /= al;
    const bx = hy * az - hz * ay, by = hz * ax - hx * az, bz = hx * ay - hy * ax;
    const r = k * PHY + rng.next() * 0.3, cr = Math.cos(r), sr = Math.sin(r), c = Math.cos(ANG), sn = Math.sin(ANG);
    LX[i] = hx * c + (ax * cr + bx * sr) * sn; LY[i] = hy * c + (ay * cr + by * sr) * sn; LZ[i] = hz * c + (az * cr + bz * sr) * sn;
    return i;
  }

  function reset(seed = 1, opts = {}) {
    P = { ...SO_DEFAULTS, ...opts }; rng = makeRng(seed * 104729 + 7); year = 0; n = 0;
    C = P.C; B = P.b;
    X = null; allocNodes(4096);
    // the wall: opaque voxels that also cast the pyramid below and beside them
    wallS.fill(0);
    if (P.wall) {
      const w = WALL;
      for (let x = w.x0 + VOX / 2; x < w.x1; x += VOX) for (let y = w.y0 + VOX / 2; y < w.y1; y += VOX) for (let z = w.z0 + VOX / 2; z < w.z1; z += VOX) {
        const v = vi(x, y, z); if (v < 0) continue;
        wallS[v] += 1e3; cast(wallS, x, y, z, 1);
      }
    }
    const r = addNode(0, 0, 0, 0, 1, 0, -1, 0); bL[r] = 0;
    toSkel();
  }
  function cast(arr, x, y, z, a) {
    const I = Math.floor((x - OX) / VOX), J = Math.floor(y / VOX), K = Math.floor((z - OZ) / VOX);
    for (let q = 0; q <= QMAX; q++) {
      const j = J - q; if (j < 0) break;
      const ds = a * Math.pow(B, -q);
      for (let p = -q; p <= q; p++) { const i = I + p; if (i < 0 || i >= GX) continue;
        for (let r = -q; r <= q; r++) { const k = K + r; if (k < 0 || k >= GZ) continue; arr[(i * GY + j) * GZ + k] += ds; } }
    }
  }
  const sAt = (x, y, z) => { const v = vi(x, y, z); return v < 0 ? 1e3 : s[v]; };
  function grad(x, y, z) { // −∇s, normalised (zero if flat)
    const e = VOX;
    let gx = sAt(x - e, y, z) - sAt(x + e, y, z), gy = sAt(x, y - e, z) - sAt(x, y + e, z), gz = sAt(x, y, z - e) - sAt(x, y, z + e);
    gx = Math.max(-50, Math.min(50, gx)); gy = Math.max(-50, Math.min(50, gy)); gz = Math.max(-50, Math.min(50, gz));
    const l = Math.hypot(gx, gy, gz); return l < 1e-6 ? [0, 0, 0] : [gx / l, gy / l, gz / l];
  }

  function step() {
    if (n >= CAP || year >= 15) return false;
    year++;
    // 1. shadow from every live bud, on top of the wall's
    s.set(wallS);
    for (let i = 0; i < n; i++) { if (dead[i]) continue; const k = (bT[i] && mainC[i] < 0 ? 1 : 0) + (bL[i] && latC[i] < 0 ? 1 : 0); if (k) cast(s, X[i], Y[i], Z[i], A * k); }
    for (let i = 0; i < n; i++) {
      if (dead[i]) continue;
      const own = (bT[i] && mainC[i] < 0 ? 1 : 0) + (bL[i] && latC[i] < 0 ? 1 : 0); // a node's own buds do not shade it
      const l = Math.min(C, Math.max(0, C - sAt(X[i], Y[i], Z[i]) + A * own));
      Qt[i] = bT[i] && mainC[i] < 0 ? l : 0; Ql[i] = bL[i] && latC[i] < 0 ? l : 0;
    }
    // 2. basipetal: light and internode count of each node's subtree (children have higher indices)
    for (let i = n - 1; i >= 0; i--) {
      if (dead[i]) continue;
      const m = mainC[i], L = latC[i];
      QI[i] = (m >= 0 ? QI[m] : Qt[i]) + (L >= 0 ? QI[L] : Ql[i]);
      cntI[i] = 1 + (m >= 0 ? cntI[m] : 0) + (L >= 0 ? cntI[L] : 0);
    }
    // 3. shedding: lateral branches with too little light per internode (not in the first years)
    if (year > 3) for (let i = 0; i < n; i++) {
      const L = latC[i]; if (dead[i] || L < 0) continue;
      if (QI[L] / cntI[L] < P.shed) { kill(L); latC[i] = -1; bL[i] = 0; QI[i] = mainC[i] >= 0 ? QI[mainC[i]] : Qt[i]; }
    }
    // acropetal Borchert–Honda
    vT.fill(0, 0, n); vL.fill(0, 0, n);
    const inV = new Float32Array(n); inV[0] = P.alpha * QI[0];
    const lam = P.lambda;
    for (let i = 0; i < n; i++) {
      if (dead[i]) continue;
      const v = inV[i], m = mainC[i], L = latC[i];
      const qm = m >= 0 ? QI[m] : Qt[i], ql = L >= 0 ? QI[L] : Ql[i], den = lam * qm + (1 - lam) * ql;
      const vm = den > 0 ? v * lam * qm / den : 0, vl = v - vm;
      if (m >= 0) inV[m] = vm; else vT[i] = vm;
      if (L >= 0) inV[L] = vl; else vL[i] = vl;
    }
    // 4. growth
    const n0 = n;
    for (let i = 0; i < n0 && n < CAP; i++) {
      if (dead[i]) continue;
      if (bT[i] && mainC[i] < 0 && vT[i] >= 1) { const c = shoot(i, vT[i], HX[i], HY[i], HZ[i]); if (c >= 0) { mainC[i] = c; bT[i] = 0; } }
      if (bL[i] && latC[i] < 0 && vL[i] >= 1) { const c = shoot(i, vL[i], LX[i], LY[i], LZ[i]); if (c >= 0) { latC[i] = c; bL[i] = 0; } }
    }
    toSkel();
    return true;
  }
  // a shoot of ⌊v⌋ metamers from node i; returns the first new node
  function shoot(i, v, dx, dy, dz) {
    const k = Math.min(MAXN, Math.floor(v)), len = ELL; // the paper: length ℓ·v/n; fixed ℓ here (a liberty: v/n up to 2 doubled the leader)
    let x = X[i], y = Y[i], z = Z[i], p = i, first = -1;
    for (let m = 0; m < k; m++) {
      const g = grad(x, y, z);
      let hx = dx + P.xi * g[0], hy = dy + P.xi * g[1] + P.eta, hz = dz + P.xi * g[2];
      const l = Math.hypot(hx, hy, hz); hx /= l; hy /= l; hz /= l;
      const nx = x + hx * len, ny = Math.max(0.05, y + hy * len), nz = z + hz * len;
      if (vi(nx, ny, nz) < 0 || s[vi(nx, ny, nz)] > 500) break; // out of the grid, or into the wall
      const c = addNode(nx, ny, nz, hx, hy, hz, p, n);
      if (first < 0) first = c; else mainC[p] = c, bT[p] = 0;
      x = nx; y = ny; z = nz; dx = hx; dy = hy; dz = hz; p = c;
      if (n >= CAP) break;
    }
    return first;
  }
  function kill(i) { const st = [i]; while (st.length) { const j = st.pop(); dead[j] = 1; if (mainC[j] >= 0) st.push(mainC[j]); if (latC[j] >= 0) st.push(latC[j]); } }

  function toSkel() {
    S.clear();
    const map = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      if (dead[i]) continue;
      const leafy = (mainC[i] < 0 ? 1 : 0) || (i > 0 && latC[i] < 0 && bL[i] ? 0.6 : 0);
      map[i] = S.add(X[i], Y[i], Z[i], par[i] >= 0 ? map[par[i]] : -1, 0, leafy);
    }
    S.pipe(0.015, 2);
  }
  return {
    name: 'Self-organising tree', unit: 'year', max: 15,
    reset, step, set(opts) { reset(1, { ...P, ...opts }); },
    get t() { return year; },
    skeleton: () => S,
    shadow: () => ({ s, GX, GY, GZ, VOX, OX, OZ }),
  };
}
