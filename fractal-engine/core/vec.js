// Small vector / 3×3 matrix helpers. Points are [x, y, z]; matrices are row-major arrays of 9.

export const I3 = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len2 = (a) => dot(a, a);
export const len = (a) => Math.sqrt(len2(a));
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const normalize = (a) => { const l = len(a) || 1; return mul(a, 1 / l); };

export function matMul(A, B) {
  const C = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  }
  return C;
}

export const matVec = (A, v) => [
  A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
  A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
  A[6] * v[0] + A[7] * v[1] + A[8] * v[2],
];

export const transpose = (A) => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
export const diag = (a, b, c) => [a, 0, 0, 0, b, 0, 0, 0, c];
export const scaled = (A, s) => A.map((x) => x * s);

// Householder reflection across the plane with unit normal n: I − 2 n nᵀ
export const reflection = (n) => [
  1 - 2 * n[0] * n[0], -2 * n[0] * n[1], -2 * n[0] * n[2],
  -2 * n[1] * n[0], 1 - 2 * n[1] * n[1], -2 * n[1] * n[2],
  -2 * n[2] * n[0], -2 * n[2] * n[1], 1 - 2 * n[2] * n[2],
];

// Rotation matrix from Euler angles in degrees, applied as Rz · Ry · Rx
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

// Operator norm estimate (largest singular value) by a few power iterations on AᵀA
export function specNorm(A) {
  const AtA = matMul(transpose(A), A);
  let v = [0.57735, 0.57735, 0.57735];
  let l = 0;
  for (let i = 0; i < 24; i++) {
    const w = matVec(AtA, v);
    l = len(w);
    if (l === 0) return 0;
    v = mul(w, 1 / l);
  }
  return Math.sqrt(l);
}
