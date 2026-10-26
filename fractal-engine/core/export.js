// Exports that are pure arithmetic: meshes from a distance-estimate grid (surface nets → binary STL)
// and 3D Gaussian splats from push samples (covariance → scales and a rotation → 3DGS PLY).

// ---------- meshes --------------------------------------------------------------------------------
// Surface nets: one vertex per grid cell the surface crosses (the mean of its edge crossings), one quad
// per grid edge the surface crosses (joining the four cells around it). No tables, watertight inside
// the grid, smoother than marching cubes at the same resolution. field[x + n·(y + n·z)] is the
// distance estimate minus the iso level; the surface is where it changes sign.

const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

export function surfaceNets(field, n, lo, step) {
  const at = (x, y, z) => field[x + n * (y + n * z)];
  const vid = new Int32Array((n - 1) ** 3).fill(-1);
  const verts = [];
  const cell = (x, y, z) => x + (n - 1) * (y + (n - 1) * z);
  for (let z = 0; z < n - 1; z++) for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    const v = CORNERS.map(([a, b, c]) => at(x + a, y + b, z + c));
    let mask = 0;
    v.forEach((q, i) => { if (q < 0) mask |= 1 << i; });
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, k = 0;
    for (const [i, j] of EDGES) {
      if ((v[i] < 0) === (v[j] < 0)) continue;
      const t = v[i] / (v[i] - v[j]);
      const A = CORNERS[i], B = CORNERS[j];
      sx += A[0] + (B[0] - A[0]) * t; sy += A[1] + (B[1] - A[1]) * t; sz += A[2] + (B[2] - A[2]) * t;
      k++;
    }
    vid[cell(x, y, z)] = verts.length / 3;
    verts.push(lo[0] + (x + sx / k) * step[0], lo[1] + (y + sy / k) * step[1], lo[2] + (z + sz / k) * step[2]);
  }
  const tris = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) tris.push(a, c, b, a, d, c); else tris.push(a, b, c, a, c, d);
  };
  for (let z = 1; z < n - 1; z++) for (let y = 1; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    // edge along x from (x,y,z): the four cells around it share it
    const a = at(x, y, z), b = at(x + 1, y, z);
    if ((a < 0) !== (b < 0)) quad(vid[cell(x, y - 1, z - 1)], vid[cell(x, y, z - 1)], vid[cell(x, y, z)], vid[cell(x, y - 1, z)], a < 0);
  }
  for (let z = 1; z < n - 1; z++) for (let y = 0; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const a = at(x, y, z), b = at(x, y + 1, z);
    if ((a < 0) !== (b < 0)) quad(vid[cell(x - 1, y, z - 1)], vid[cell(x - 1, y, z)], vid[cell(x, y, z)], vid[cell(x, y, z - 1)], a < 0);
  }
  for (let z = 0; z < n - 1; z++) for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const a = at(x, y, z), b = at(x, y, z + 1);
    if ((a < 0) !== (b < 0)) quad(vid[cell(x - 1, y - 1, z)], vid[cell(x, y - 1, z)], vid[cell(x, y, z)], vid[cell(x - 1, y, z)], a < 0);
  }
  return { positions: new Float32Array(verts), indices: new Uint32Array(tris) };
}

export function toStl({ positions: P, indices: I }) {
  const nt = I.length / 3;
  const buf = new ArrayBuffer(84 + nt * 50), dv = new DataView(buf);
  const head = 'fractal engine — surface nets of the distance estimate';
  for (let i = 0; i < Math.min(80, head.length); i++) dv.setUint8(i, head.charCodeAt(i) & 0x7f);
  dv.setUint32(80, nt, true);
  let o = 84;
  for (let t = 0; t < nt; t++) {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0], l = Math.hypot(nx, ny, nz) || 1;
    for (const x of [nx / l, ny / l, nz / l, P[a], P[a + 1], P[a + 2], P[b], P[b + 1], P[b + 2], P[c], P[c + 1], P[c + 2]]) { dv.setFloat32(o, x, true); o += 4; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return buf;
}

// ---------- splats --------------------------------------------------------------------------------
// Jacobi eigen-decomposition of a symmetric 3×3 (row-major): values and the eigenvectors as columns
export function eigenSym3(A) {
  const a = [[A[0], A[1], A[2]], [A[3], A[4], A[5]], [A[6], A[7], A[8]]];
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 24; sweep++) {
    let off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    if (off < 1e-20) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-30) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
      for (let k = 0; k < 3; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
      for (let k = 0; k < 3; k++) { const x = V[k][p], y = V[k][q]; V[k][p] = c * x - s * y; V[k][q] = s * x + c * y; }
    }
  }
  return { values: [a[0][0], a[1][1], a[2][2]], vectors: V };
}

// rotation matrix (columns = axes) → quaternion [w, x, y, z]
function quatOf(R) {
  const [[m00, m01, m02], [m10, m11, m12], [m20, m21, m22]] = R;
  const tr = m00 + m11 + m22;
  let w, x, y, z;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = s / 4; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = s / 4; y = (m01 + m10) / s; z = (m02 + m20) / s; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = s / 4; z = (m12 + m21) / s; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = s / 4; }
  const l = Math.hypot(w, x, y, z) || 1;
  return [w / l, x / l, y / l, z / l];
}

// samples: [{ p:[x,y,z], cov:[xx, xy, xz, yy, yz, zz], rgb:[r,g,b] (0..1) }] → 3DGS PLY (degree-0 SH)
export function splatsToPly(samples, opacity = 0.6) {
  const props = ['x', 'y', 'z', 'nx', 'ny', 'nz', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
  const header = `ply\nformat binary_little_endian 1.0\ncomment fractal engine push samples: covariance carried along the chaos game\nelement vertex ${samples.length}\n${props.map((p) => `property float ${p}`).join('\n')}\nend_header\n`;
  const hb = new TextEncoder().encode(header);
  const buf = new ArrayBuffer(hb.length + samples.length * props.length * 4);
  new Uint8Array(buf).set(hb);
  const dv = new DataView(buf);
  let o = hb.length;
  const C0 = 0.28209479177387814;
  const logit = Math.log(opacity / (1 - opacity));
  for (const s of samples) {
    const [xx, xy, xz, yy, yz, zz] = s.cov;
    const { values, vectors } = eigenSym3([xx, xy, xz, xy, yy, yz, xz, yz, zz]);
    // a right-handed frame
    const R = vectors.map((r) => r.slice());
    const det = R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1]) - R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0]) + R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0]);
    if (det < 0) for (let k = 0; k < 3; k++) R[k][2] = -R[k][2];
    const q = quatOf(R);
    const row = [...s.p, 0, 0, 0, ...s.rgb.map((c) => (c - 0.5) / C0), logit,
      ...values.map((v) => Math.log(Math.sqrt(Math.max(v, 1e-14)))), ...q];
    for (const x of row) { dv.setFloat32(o, x, true); o += 4; }
  }
  return buf;
}
