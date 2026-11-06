// 2.9 Roots and the root plate, reduced from Rhizomorph (Li, Klein, Michels, Benes, Pirk & Pałubicki 2023).
// Rhizomorph grows roots with the shoot's own vigour logic in a voxel soil of water and texture, and the root types
// (tap, heart, lateral) emerge from the soil rather than being chosen. Here the shoot is §2.3's self-organising tree
// at 15 years; the roots grow by space colonisation (§2.2) toward points of soil water, whose depth profile is the
// soil: deep sand (water deep, so roots go down), shallow soil over rock (nothing below 0.7 m), wet clay (a water
// table at 1 m and no air below it). Root length is budgeted from the shoot's leaves, one root segment per leaf
// cluster (ours), a crude stand-in for Rhizomorph's shoot–root signalling.
//
// A storm tips the tree over a hinge on the downwind edge of its root plate: the shallow roots within the plate's
// radius lift with the soil they hold; the rest break. The plate is the disc that holds 80 % of the root length in
// the top of the soil, and the pit it leaves is a half-ellipsoid of that radius and depth (ours). Paper 0's plot uses
// such pits and mounds; here the root system sets their size.
import { Skeleton, measure } from './skeleton.js?v=3';
import { createSelfOrg } from './selforg.js?v=3';
import { makeRng } from '../fractals/silviculture-core.js?v=3';

export const SOILS = {
  sand: { label: 'deep sand', depth: 4.0, radius: 4.5, pdf: (d) => 0.4 + d / 4, down: 0.25 },
  rock: { label: 'shallow soil over rock', depth: 0.7, radius: 6.5, pdf: () => 1, down: 0 },
  clay: { label: 'wet clay, water table at 1 m', depth: 1.0, radius: 6.0, pdf: (d) => Math.exp(-d / 0.35), down: 0.02 },
};

export function createRoots() {
  let soil = 'rock', seed = 1, it = 0, done = false, tilt = 0;
  let shoot, pts, alive, rx = [], ry = [], rz = [], rp = [], budget = 0, shootN = 0;
  const S = new Skeleton(16384);
  const D = 0.12, di = 8 * D, dk = 2 * D;
  function reset(s = 1, opts = {}) {
    seed = s; if (opts.soil) soil = opts.soil; it = 0; done = false; tilt = 0;
    const so = createSelfOrg(); so.reset(seed, { wall: false }); for (let y = 0; y < 15; y++) so.step();
    shoot = so.skeleton();
    let leaves = 0; for (let i = 0; i < shoot.n; i++) if (shoot.leaf[i] > 0) leaves++;
    budget = leaves; shootN = shoot.n;
    const rng = makeRng(seed * 31 + 5), so2 = SOILS[soil];
    pts = [];
    let tries = 0;
    while (pts.length < 1800 * 3 && tries++ < 200000) {
      const r = so2.radius * Math.sqrt(rng.next()), a = rng.next() * 6.2832, d = rng.next() * so2.depth;
      if (rng.next() * 1.5 > so2.pdf(d)) continue;
      pts.push(r * Math.cos(a), -0.05 - d, r * Math.sin(a));
    }
    alive = new Uint8Array(pts.length / 3).fill(1);
    rx = [0]; ry = [0]; rz = [0]; rp = [-1];
    build();
  }
  function step() {
    if (done) return false;
    it++;
    const n0 = rx.length, sx = new Float64Array(n0), sy = new Float64Array(n0), sz = new Float64Array(n0), cnt = new Int32Array(n0);
    let any = false;
    for (let a = 0; a < alive.length; a++) {
      if (!alive[a]) continue;
      const px = pts[a * 3], py = pts[a * 3 + 1], pz = pts[a * 3 + 2];
      let best = -1, bd = di * di;
      for (let q = 0; q < n0; q++) { const d = (rx[q] - px) ** 2 + (ry[q] - py) ** 2 + (rz[q] - pz) ** 2; if (d < bd) { bd = d; best = q; } }
      if (best < 0) continue;
      if (bd < dk * dk) { alive[a] = 0; continue; }
      const l = Math.sqrt(bd); sx[best] += (px - rx[best]) / l; sy[best] += (py - ry[best]) / l; sz[best] += (pz - rz[best]) / l; cnt[best]++; any = true;
    }
    let grew = 0;
    const down = SOILS[soil].down;
    if (!any) { // the radicle: straight down until it reaches water
      const t = rx.length - 1; if (it < 60) { rx.push(rx[t]); ry.push(ry[t] - D); rz.push(rz[t]); rp.push(t); grew++; }
    } else for (let i = 0; i < n0 && rx.length - 1 < budget; i++) {
      if (!cnt[i]) continue;
      let dx = sx[i], dy = sy[i] - down * cnt[i], dz = sz[i]; const l = Math.hypot(dx, dy, dz); if (l < 1e-6) continue;
      const x = rx[i] + dx / l * D, y = Math.min(-0.02, ry[i] + dy / l * D), z = rz[i] + dz / l * D;
      let dup = false; for (let q = n0; q < rx.length; q++) if (rp[q] === i && (rx[q] - x) ** 2 + (ry[q] - y) ** 2 + (rz[q] - z) ** 2 < 0.0009) { dup = true; break; }
      if (dup) continue;
      rx.push(x); ry.push(y); rz.push(z); rp.push(i); grew++;
      for (let a = 0; a < alive.length; a++) if (alive[a] && (x - pts[a * 3]) ** 2 + (y - pts[a * 3 + 1]) ** 2 + (z - pts[a * 3 + 2]) ** 2 < dk * dk) alive[a] = 0;
    }
    if (!grew || rx.length - 1 >= budget || it > 300) done = true;
    build();
    return grew > 0;
  }
  // the plate: radius holding 80 % of root length in the top layer, depth = 90th percentile depth of that layer
  function plate() {
    const top = Math.min(1.2, SOILS[soil].depth), L = [];
    for (let i = 1; i < rx.length; i++) { const p = rp[i], y = (ry[i] + ry[p]) / 2; if (-y > top) continue; L.push([Math.hypot((rx[i] + rx[p]) / 2, (rz[i] + rz[p]) / 2), -y, Math.hypot(rx[i] - rx[p], ry[i] - ry[p], rz[i] - rz[p])]); }
    if (!L.length) return { r: 0, d: 0, vol: 0 };
    const tot = L.reduce((s, a) => s + a[2], 0);
    L.sort((a, b) => a[0] - b[0]); let acc = 0, r = 0; for (const a of L) { acc += a[2]; r = a[0]; if (acc >= 0.8 * tot) break; }
    const ds = L.filter((a) => a[0] <= r).map((a) => a[1]).sort((a, b) => a - b), d = Math.max(0.2, ds[Math.floor(ds.length * 0.9)] || 0.3);
    return { r, d, vol: (2 / 3) * Math.PI * r * r * d / 2 };
  }
  function build() {
    S.clear();
    const pl = plate(), hinge = pl.r, ang = tilt * 80 * Math.PI / 180, c = Math.cos(ang), s = Math.sin(ang);
    // a storm from −x: rotate about the hinge line (x = hinge, y = 0, along z), clockwise seen from +z
    const rot = (x, y, z, inPlate) => { if (!tilt || !inPlate) return [x, y, z]; const X = x - hinge; return [hinge + X * c + y * s, -X * s + y * c, z]; };
    for (let i = 0; i < shoot.n; i++) { const [x, y, z] = rot(shoot.x[i], shoot.y[i], shoot.z[i], true); S.add(x, y, z, shoot.par[i], shoot.d[i], shoot.leaf[i]); }
    const base = S.n;
    for (let i = 1; i < rx.length; i++) {
      const inPlate = Math.hypot(rx[i], rz[i]) <= hinge * 1.05 && -ry[i] <= pl.d * 1.6;
      const [x, y, z] = rot(rx[i], ry[i], rz[i], inPlate);
      const p = rp[i] === 0 ? 0 : base + rp[i] - 1;
      if (tilt && !inPlate) { S.add(rx[i], ry[i], rz[i], -1, 0, 0); continue; } // broken: left in the ground, unattached
      S.add(x, y, z, p, 0, 0);
    }
    // widths: the shoot keeps its own; roots by the pipe model from tips of 8 mm
    const keep = S.d.slice(0, base);
    S.pipe(0.008, 2);
    S.d.set(keep);
  }
  function stats() {
    let len = 0, depth = 0, sl = 0;
    for (let i = 1; i < rx.length; i++) { const p = rp[i]; len += Math.hypot(rx[i] - rx[p], ry[i] - ry[p], rz[i] - rz[p]); depth = Math.max(depth, -ry[i]); }
    for (let i = 0; i < shootN; i++) { const p = shoot.par[i]; if (p >= 0) sl += Math.hypot(shoot.x[i] - shoot.x[p], shoot.y[i] - shoot.y[p], shoot.z[i] - shoot.z[p]); }
    const pl = plate();
    return { rootLen: len, shootLen: sl, depth, plateR: pl.r, plateD: pl.d, pit: pl.vol, roots: rx.length - 1 };
  }
  return {
    name: 'Roots', unit: 'iteration', max: 300,
    reset, step, get t() { return it; }, get done() { return done; },
    skeleton: () => S, points: () => ({ pts, alive }), stats,
    storm(t) { tilt = t; build(); },
    get tilt() { return tilt; },
  };
}
