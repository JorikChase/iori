// 2.2 Space colonisation: branches compete for space.
// Runions, Lane & Prusinkiewicz, "Modeling trees with a space colonization algorithm", Eurographics Workshop on
// Natural Phenomena 2007. Attraction points fill the crown's envelope; every point pulls the nearest node within
// the radius of influence d_i; every pulled node grows one segment of length D toward the mean direction of its
// points; points within the kill distance d_k of a node are taken and removed. The tree fills the free space, and
// two branches never grow into the same space because a point serves one node only.
//
// The neighbour: points that fall inside the wall are never made, and no node may grow inside it, because the wall's
// space is taken. That is the one thing this method knows about the world. It does not know about light.
//
// Values: envelope an ellipsoid centred 8.5 m up with radii 5.5 × 5 × 5.5 m, 2,000 points, D = 0.3 m,
// d_i = 6·D, d_k = 2·D (the paper's ranges: d_i a few to ten times D, d_k about 2·D). Before the trunk reaches the
// crown's points it grows straight up (the paper's trunk rule). Widths by the pipe model, exponent 2, tip 2 cm.
// Liberties: a slight upward bias (0.15) on every growth direction, as the paper's tropism option allows, and a
// node may grow at most one child per pull direction (the paper's guard against stacked duplicates).
import { Skeleton, WALL, inWall } from './skeleton.js?v=3';
import { makeRng } from '../fractals/silviculture-core.js?v=3';

export const SC_DEFAULTS = { N: 2000, D: 0.3, di: 6, dk: 2, wall: true };

export function createColonise() {
  let P = { ...SC_DEFAULTS }, rng, pts, alive, nx = [], ny = [], nz = [], np = [], it = 0, done = false;
  const S = new Skeleton(8192);
  const C = 1.0, key = (x, y, z) => ((Math.floor(x / C) + 512) * 1024 + (Math.floor(y / C) + 512)) * 1024 + (Math.floor(z / C) + 512);
  let grid = new Map();
  const addNode = (x, y, z, p) => {
    const i = nx.length; nx.push(x); ny.push(y); nz.push(z); np.push(p);
    const k = key(x, y, z); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(i);
    return i;
  };
  function reset(seed = 1, opts = {}) {
    P = { ...SC_DEFAULTS, ...opts }; rng = makeRng(seed * 7919 + 13);
    pts = []; nx = []; ny = []; nz = []; np = []; grid = new Map(); it = 0; done = false;
    let tries = 0;
    while (pts.length < P.N * 3 && tries++ < P.N * 20) {
      const x = (rng.next() * 2 - 1) * 5.5, y = (rng.next() * 2 - 1) * 5, z = (rng.next() * 2 - 1) * 5.5;
      if ((x / 5.5) ** 2 + (y / 5) ** 2 + (z / 5.5) ** 2 > 1) continue;
      if (P.wall && inWall(x, y + 8.5, z)) continue; // the wall's space is taken
      pts.push(x, y + 8.5, z);
    }
    alive = new Uint8Array(pts.length / 3).fill(1);
    addNode(0, 0, 0, -1);
    toSkel();
  }
  function step() {
    if (done) return false;
    it++;
    const D = P.D, di = P.di * D, dk = P.dk * D, di2 = di * di, dk2 = dk * dk, R = Math.ceil(di / C);
    const n0 = nx.length, sx = new Float64Array(n0), sy = new Float64Array(n0), sz = new Float64Array(n0), cnt = new Int32Array(n0);
    let any = false;
    for (let a = 0; a < alive.length; a++) {
      if (!alive[a]) continue;
      const px = pts[a * 3], py = pts[a * 3 + 1], pz = pts[a * 3 + 2];
      const gx = Math.floor(px / C), gy = Math.floor(py / C), gz = Math.floor(pz / C);
      let best = -1, bd = di2;
      for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (let k = -R; k <= R; k++) {
        const arr = grid.get(((gx + i + 512) * 1024 + (gy + j + 512)) * 1024 + gz + k + 512); if (!arr) continue;
        for (const q of arr) { const d = (nx[q] - px) ** 2 + (ny[q] - py) ** 2 + (nz[q] - pz) ** 2; if (d < bd) { bd = d; best = q; } }
      }
      if (best < 0) continue;
      if (bd < dk2) { alive[a] = 0; continue; }
      const l = Math.sqrt(bd); sx[best] += (px - nx[best]) / l; sy[best] += (py - ny[best]) / l; sz[best] += (pz - nz[best]) / l; cnt[best]++; any = true;
    }
    let grew = 0;
    if (!any) { // the trunk: grow the newest node straight up until it reaches the crown's points
      const t = n0 - 1;
      if (ny[t] < 8.5 + 5 && it < 200) { addNode(nx[t], ny[t] + D, nz[t], t); grew++; }
    } else {
      for (let i = 0; i < n0; i++) {
        if (!cnt[i]) continue;
        let dx = sx[i], dy = sy[i] + 0.15 * cnt[i], dz = sz[i];
        const l = Math.hypot(dx, dy, dz); if (l < 1e-6) continue;
        dx /= l; dy /= l; dz /= l;
        const x = nx[i] + dx * D, y = ny[i] + dy * D, z = nz[i] + dz * D;
        if (P.wall && inWall(x, y, z)) continue; // nor may a branch grow into the wall's space
        // guard: no second child of i in (nearly) the same place
        let dup = false;
        const arr = grid.get(key(x, y, z)); if (arr) for (const q of arr) if (np[q] === i && (nx[q] - x) ** 2 + (ny[q] - y) ** 2 + (nz[q] - z) ** 2 < (0.3 * D) ** 2) { dup = true; break; }
        if (!dup) { addNode(x, y, z, i); grew++; }
      }
      // kill pass for the new nodes
      for (let a = 0; a < alive.length; a++) {
        if (!alive[a]) continue;
        for (let i = n0; i < nx.length; i++) if ((nx[i] - pts[a * 3]) ** 2 + (ny[i] - pts[a * 3 + 1]) ** 2 + (nz[i] - pts[a * 3 + 2]) ** 2 < dk2) { alive[a] = 0; break; }
      }
    }
    if (!grew || it > 400) done = true;
    toSkel();
    return grew > 0;
  }
  function toSkel() {
    S.clear();
    const kids = new Uint8Array(nx.length);
    for (let i = 1; i < nx.length; i++) kids[np[i]] = 1;
    for (let i = 0; i < nx.length; i++) S.add(nx[i], ny[i], nz[i], np[i], 0, i > 0 && !kids[i] ? 1 : 0);
    S.pipe(0.02, 2);
  }
  return {
    name: 'Space colonisation', unit: 'iteration', max: 400,
    reset, step, set(opts) { reset(this.seed || 1, { ...P, ...opts }); },
    get t() { return it; }, get done() { return done; },
    skeleton: () => S,
    points: () => ({ pts, alive }),
  };
}
