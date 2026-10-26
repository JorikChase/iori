// Vector and matrix helpers, dimension-agnostic: points are arrays of any length (the orbit lives in
// 4-D, the world in 3-D), matrices are row-major arrays of n·n. rotationXYZ stays 3×3 (the 3-D Euler
// rotation op and the overlay); rotation4 and embed are the 4-D ones.

export const I3 = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const I4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export const eye = (n) => Array.from({ length: n * n }, (_, i) => (i % (n + 1) === 0 ? 1 : 0));

export const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
export const len2 = (a) => dot(a, a);
export const len = (a) => Math.sqrt(len2(a));
export const add = (a, b) => a.map((x, i) => x + b[i]);
export const sub = (a, b) => a.map((x, i) => x - b[i]);
export const mul = (a, s) => a.map((x) => x * s);
export const normalize = (a) => { const l = len(a) || 1; return mul(a, 1 / l); };

const dimOf = (A) => Math.round(Math.sqrt(A.length));

export function matMul(A, B) {
  const n = dimOf(A);
  const C = new Array(n * n).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    let s = 0;
    for (let k = 0; k < n; k++) s += A[i * n + k] * B[k * n + j];
    C[i * n + j] = s;
  }
  return C;
}

export function matVec(A, v) {
  const n = v.length;
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < n; k++) s += A[i * n + k] * v[k]; out[i] = s; }
  return out;
}

export function transpose(A) {
  const n = dimOf(A);
  const T = new Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) T[j * n + i] = A[i * n + j];
  return T;
}

export const diag = (...d) => { const n = d.length, M = new Array(n * n).fill(0); d.forEach((x, i) => { M[i * n + i] = x; }); return M; };
export const scaled = (A, s) => A.map((x) => x * s);

// Householder reflection across the hyperplane with unit normal n: I − 2 n nᵀ
export function reflection(n) {
  const d = n.length, M = eye(d);
  for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) M[i * d + j] -= 2 * n[i] * n[j];
  return M;
}

// Rotation matrix from Euler angles in degrees, applied as Rz · Ry · Rx (3×3)
export function rotationXYZ(ax, ay, az) {
  const r = Math.PI / 180;
  const cx = Math.cos(ax * r), sx = Math.sin(ax * r);
  const cy = Math.cos(ay * r), sy = Math.sin(ay * r);
  const cz = Math.cos(az * r), sz = Math.sin(az * r);
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return matMul(Rz, matMul(Ry, Rx));
}

// The 3×3 rotation lifted to 4×4, w untouched
export const lift4 = (R) => [R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, 0, 0, 0, 1];

// a Givens rotation by a degrees in the plane of axes i and j of ℝⁿ
export function givens(n, i, j, a) {
  const G = eye(n), r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  G[i * n + i] = c; G[j * n + j] = c; G[i * n + j] = -s; G[j * n + i] = s;
  return G;
}

// 4-D rotation from its six plane angles in degrees, applied in the order xy, xz, xw, yz, yw, zw
export const PLANES4 = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
export function rotation4(angles) {
  let R = I4();
  PLANES4.forEach(([i, j], k) => { if (angles[k]) R = matMul(givens(4, i, j, angles[k]), R); });
  return R;
}

// The slice: the world (3-D) sits in the orbit's space (4-D) as x₄ = T · (x, y, z, w₀), T the rotation
// by the tilt angles in the xw, yw, zw planes. Its first three columns are the world's axes in 4-D.
export function sliceMatrix(slice = {}) {
  const t = slice.tilt || [0, 0, 0];
  return rotation4([0, 0, t[0], 0, t[1], t[2]]);
}
export function embed(slice, x) {
  const T = sliceMatrix(slice);
  return matVec(T, [x[0], x[1], x[2], slice.w || 0]);
}
// back to the world: the point's coordinates along the slice's axes, and how far off the slice it is
export function project(slice, x4) {
  const v = matVec(transpose(sliceMatrix(slice)), x4);
  return { x: [v[0], v[1], v[2]], off: v[3] - (slice.w || 0) };
}

// Operator norm estimate (largest singular value) by power iteration on AᵀA
export function specNorm(A) {
  const n = dimOf(A);
  const AtA = matMul(transpose(A), A);
  let v = new Array(n).fill(1 / Math.sqrt(n));
  let l = 0;
  for (let i = 0; i < 24; i++) {
    const w = matVec(AtA, v);
    l = len(w);
    if (l === 0) return 0;
    v = mul(w, 1 / l);
  }
  return Math.sqrt(l);
}
