// The common currency of chapter 2: every method in the lineage hands back a Skeleton (a tree of nodes; each node
// with a parent is a segment from its parent to it), and every figure draws and measures the same thing.
// Pure JS, no DOM: tools/silviculture/lineage-measure.mjs runs the same code in Node.
//
// WALL is the neighbour every figure grows beside: an opaque block 3 m to the tree's +x side, lower than a grown
// tree, so the methods differ in what they do about it (ignore it, avoid its space, avoid its shade).

export const WALL = { x0: 2.2, x1: 3.4, y0: 0, y1: 10, z0: -5, z1: 5 };
export const inWall = (x, y, z, w = WALL) => x > w.x0 && x < w.x1 && y > w.y0 && y < w.y1 && z > w.z0 && z < w.z1;

export class Skeleton {
  constructor(cap = 1024) { this.n = 0; this.alloc(cap); }
  alloc(cap) {
    const grow = (A, T) => { const B = new T(cap); if (A) B.set(A.subarray(0, Math.min(A.length, cap))); return B; };
    this.x = grow(this.x, Float32Array); this.y = grow(this.y, Float32Array); this.z = grow(this.z, Float32Array);
    this.par = grow(this.par, Int32Array); this.d = grow(this.d, Float32Array); this.leaf = grow(this.leaf, Float32Array);
    this.cap = cap;
  }
  clear() { this.n = 0; return this; }
  // leaf: 0 bare, > 0 a leaf cluster of that relative size (1 = the figure's default)
  add(x, y, z, par, d, leaf = 0) {
    if (this.n >= this.cap) this.alloc(this.cap * 2);
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.z[i] = z; this.par[i] = par; this.d[i] = d; this.leaf[i] = leaf;
    return i;
  }
  // pipe model, children before parents: needs parents to have lower indices than their children
  pipe(dTip, exp = 2) {
    const acc = new Float64Array(this.n), kids = new Uint32Array(this.n);
    for (let i = this.n - 1; i >= 0; i--) {
      const d = kids[i] ? Math.pow(acc[i], 1 / exp) : dTip;
      this.d[i] = Math.max(this.d[i] || 0, d);
      const p = this.par[i];
      if (p >= 0) { acc[p] += Math.pow(this.d[i], exp); kids[p]++; }
    }
  }
}

const lg = Math.log10;
function ols(xs, ys) {
  const n = xs.length; if (n < 2) return { slope: NaN, r2: NaN };
  let sx = 0, sy = 0; for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n; let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; sxx += a * a; sxy += a * b; syy += b * b; }
  return { slope: sxy / sxx, r2: syy ? (sxy * sxy) / (sxx * syy) : 1 };
}

// The same instrument as chapter 4 (tools/silviculture/measure.mjs), on any skeleton:
//   segments, height, Strahler orders and Horton's R_n / R_d, Leonardo's ratio at forks, the box dimension from 10 cm
//   up, the crown's lean (mean x of leafy nodes above 2 m; negative = away from the wall), segments inside the wall.
export function measure(S, { box = true, wall = WALL } = {}) {
  const n = S.n;
  const out = { segments: Math.max(0, n - 1), height: 0, orders: 0, Rn: NaN, Rd: NaN, leonardo: NaN, box: NaN, lean: NaN, inWall: 0, leaves: 0 };
  if (n < 3) return out;
  const nk = new Int32Array(n), first = new Int32Array(n).fill(-1), next = new Int32Array(n).fill(-1);
  for (let i = n - 1; i >= 0; i--) { const p = S.par[i]; if (p >= 0) { next[i] = first[p]; first[p] = i; nk[p]++; } }
  // Strahler order of the segment ending at each node, children first (children have higher indices)
  const ord = new Uint8Array(n);
  for (let i = n - 1; i >= 0; i--) {
    if (!nk[i]) { ord[i] = 1; continue; }
    let mx = 0, c = 0;
    for (let k = first[i]; k >= 0; k = next[k]) { if (ord[k] > mx) { mx = ord[k]; c = 1; } else if (ord[k] === mx) c++; }
    ord[i] = c >= 2 ? mx + 1 : mx;
  }
  const N = [], D = [];
  let h = 0, lx = 0, ln = 0, inW = 0, leaves = 0;
  const ratios = [];
  for (let i = 0; i < n; i++) {
    const p = S.par[i];
    if (S.y[i] > h) h = S.y[i];
    if (S.leaf[i] > 0) { leaves++; if (S.y[i] > 2) { lx += S.x[i]; ln++; } }
    if (p < 0) continue;
    const mx = (S.x[i] + S.x[p]) / 2, my = (S.y[i] + S.y[p]) / 2, mz = (S.z[i] + S.z[p]) / 2;
    if (wall && inWall(mx, my, mz, wall)) inW++;
    const o = ord[i];
    if (ord[p] !== o || S.par[p] < 0) { N[o] = (N[o] || 0) + 1; (D[o] = D[o] || []).push(S.d[i]); } // a stream starts here
    if (nk[i] >= 2 && S.d[i] > 0) { let s = 0; for (let k = first[i]; k >= 0; k = next[k]) s += S.d[k] * S.d[k]; ratios.push(s / (S.d[i] * S.d[i])); }
  }
  const ks = []; for (let k = 1; k < N.length; k++) if (N[k]) ks.push(k);
  out.orders = ks.length; out.height = h; out.inWall = inW; out.leaves = leaves; out.lean = ln ? lx / ln : NaN;
  if (ks.length >= 3) {
    out.Rn = Math.pow(10, -ols(ks, ks.map((k) => lg(N[k]))).slope);
    out.Rd = Math.pow(10, ols(ks, ks.map((k) => lg(D[k].reduce((a, b) => a + b, 0) / D[k].length))).slope);
  }
  if (ratios.length) { ratios.sort((a, b) => a - b); out.leonardo = ratios[ratios.length >> 1]; }
  if (box) out.box = boxDim(S);
  return out;
}

// box counting on points along every segment, boxes from 10 cm to half the tree's extent in steps of 1.4
export function boxDim(S) {
  let L = 0, ext = 0;
  const x0 = S.x[0], z0 = S.z[0];
  for (let i = 0; i < S.n; i++) {
    ext = Math.max(ext, Math.abs(S.x[i] - x0), S.y[i], Math.abs(S.z[i] - z0));
    const p = S.par[i]; if (p >= 0) L += Math.hypot(S.x[i] - S.x[p], S.y[i] - S.y[p], S.z[i] - S.z[p]);
  }
  const step = Math.max(0.02, L / 150000); // at most ~150k sample points
  const px = [];
  for (let i = 0; i < S.n; i++) {
    const p = S.par[i]; if (p < 0) continue;
    const ax = S.x[p], ay = S.y[p], az = S.z[p], bx = S.x[i], by = S.y[i], bz = S.z[i];
    const m = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) / step));
    for (let k = 0; k <= m; k++) { const t = k / m; px.push(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t); }
  }
  const xs = [], ys = [];
  for (let s = 0.1; s <= ext / 2; s *= 1.4) {
    const set = new Set(), inv = 1 / s;
    for (let k = 0; k < px.length; k += 3) set.add(((Math.floor(px[k] * inv) + 4096) * 8192 + (Math.floor(px[k + 1] * inv) + 4096)) * 8192 + Math.floor(px[k + 2] * inv) + 4096);
    xs.push(-lg(s)); ys.push(lg(set.size));
  }
  return xs.length >= 3 ? ols(xs, ys).slope : NaN;
}

// paper 0's simulator (silviculture-core.js) → a skeleton: every module segment, leafy where a live bud is
export function fromSim(plants, S = new Skeleton(4096)) {
  S.clear();
  for (const p of plants) {
    const idx = new Map(); // module id → index of each of its nodes (node 0 shares its parent's terminal)
    for (const m of p.mods) {
      const pr = m.proto, nw = m.nw, ids = new Int32Array(pr.n);
      if (m.parent) ids[0] = idx.get(m.parent.id)[m.parent.proto.terms[m.slot]];
      else ids[0] = S.add(nw[0], nw[1], nw[2], -1, m.dBase, 0);
      for (let j = 1; j < pr.n; j++) {
        const t = pr.termOf[j], leafy = m.nLive && (t < 0 ? 0.6 : m.bud[t] ? 1 : 0);
        ids[j] = S.add(nw[j * 3], nw[j * 3 + 1], nw[j * 3 + 2], ids[pr.P[j]], m.dMax[j], leafy);
      }
      idx.set(m.id, ids);
    }
  }
  return S;
}
