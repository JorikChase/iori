// Metafractal's contemporary figures (chapter 7):
//
//   createTrain(el)      Sohl-Dickstein's trainability map, small: a width-4 tanh network trained on one data point
//                        per pixel, the pixel being a pair of learning rates; tap to zoom, measure the boundary
//   createButterfly(el)  Hofstadter's butterfly by the transfer-matrix trace at every rational flux p/q, and the
//                        shrinking bands at the golden mean's approximants (the Ten Martini spectrum)
//   createRauzy(el)      the Rauzy fractal of the tribonacci substitution, and its copies tiling the plane
//
// All draw on demand; nothing animates.

const tok = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const rgb = (hex) => { const h = hex.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); };
function fit(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2), w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  return { w, h, dpr };
}

// ---------- the trainability map ----------
// the network and its data, fixed by a seed (the same draws as the CPU check that measured D ≈ 1.44)
export const N = 4, STEPS = 300;
export function trainData(seed = 12345) {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const x = Array.from({ length: N }, gauss), y = gauss();
  return { x, y, W0: Array.from({ length: N * N }, gauss), W1: Array.from({ length: N }, gauss) };
}
// one run on the CPU: steps survived (STEPS = converged) and the mean loss
export function trainCPU(D, e0, e1) {
  const a0 = Math.sqrt(2 / N), a1 = 1 / N, W0 = D.W0.slice(), W1 = D.W1.slice(), h = new Array(N);
  let sum = 0;
  for (let t = 0; t < STEPS; t++) {
    let f = 0;
    for (let i = 0; i < N; i++) { let z = 0; for (let j = 0; j < N; j++) z += W0[i * N + j] * D.x[j]; h[i] = Math.tanh(a0 * z); f += W1[i] * h[i]; }
    f *= a1;
    const e = f - D.y, L = 0.5 * e * e;
    if (!(L < 1e6)) return { steps: t, loss: sum / Math.max(1, t) };
    sum += L;
    for (let i = 0; i < N; i++) {
      const dz = e * a1 * W1[i] * (1 - h[i] * h[i]);
      W1[i] -= e1 * e * a1 * h[i];
      for (let j = 0; j < N; j++) W0[i * N + j] -= e0 * a0 * dz * D.x[j];
    }
  }
  return { steps: STEPS, loss: sum / STEPS };
}

const VERT = `#version 300 es
in vec2 p; out vec2 uv; void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
const TRAIN_FRAG = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform vec2 centre; uniform float half_;
uniform float X[4], W0i[16], W1i[4];
uniform float Y;
uniform vec3 paper, div, conv;
void main() {
  // log10 of the two learning rates
  vec2 l = centre + (uv * 2.0 - 1.0) * half_;
  float e0 = pow(10.0, l.x), e1 = pow(10.0, l.y);
  float W0[16]; float W1[4]; float h[4];
  for (int k = 0; k < 16; k++) W0[k] = W0i[k];
  for (int k = 0; k < 4; k++) W1[k] = W1i[k];
  const float a0 = 0.70710678, a1 = 0.25;
  float sum = 0.0; int steps = ${STEPS};
  for (int t = 0; t < ${STEPS}; t++) {
    float f = 0.0;
    for (int i = 0; i < 4; i++) { float z = 0.0; for (int j = 0; j < 4; j++) z += W0[i * 4 + j] * X[j]; h[i] = tanh(a0 * z); f += W1[i] * h[i]; }
    f *= a1;
    float e = f - Y, L = 0.5 * e * e;
    if (!(L < 1e6)) { steps = t; break; }
    sum += L;
    for (int i = 0; i < 4; i++) {
      float dz = e * a1 * W1[i] * (1.0 - h[i] * h[i]);
      W1[i] -= e1 * e * a1 * h[i];
      for (int j = 0; j < 4; j++) W0[i * 4 + j] -= e0 * a0 * dz * X[j];
    }
  }
  // diverged: orange, darker the sooner; trained: blue, darker the lower the mean loss
  if (steps < ${STEPS}) { float k = 1.0 - float(steps) / float(${STEPS}); o = vec4(mix(paper, div, 0.35 + 0.65 * k), 1.0); }
  else { float k = clamp(-log(max(sum / float(${STEPS}), 1e-9)) / 12.0, 0.0, 1.0); o = vec4(mix(paper, conv, 0.25 + 0.6 * k), 1.0); }
}`;

export function createTrain(el) {
  const canvas = el.querySelector('canvas'), status = el.querySelector('.status');
  const [outBtn, resetBtn, measureBtn] = el.querySelectorAll('button');
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
  if (!gl) throw new Error('webgl2');
  const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, TRAIN_FRAG)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const U = (n) => gl.getUniformLocation(prog, n), D = trainData();
  const HOME = { centre: [1.5, 1.1], half: 0.6 };
  let view = { ...HOME, centre: [...HOME.centre] }, running = false;
  const draw = () => {
    if (!running) return;
    const { w } = fit(canvas);
    const size = Math.min(canvas.width, 900);
    if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(U('centre'), view.centre[0], view.centre[1]); gl.uniform1f(U('half_'), view.half);
    gl.uniform1fv(U('X'), D.x); gl.uniform1fv(U('W0i'), D.W0); gl.uniform1fv(U('W1i'), D.W1); gl.uniform1f(U('Y'), D.y);
    gl.uniform3fv(U('paper'), rgb(tok('--paper') || '#ffffff')); gl.uniform3fv(U('div'), rgb(tok('--walk') || '#e0703a')); gl.uniform3fv(U('conv'), rgb(tok('--noise') || '#2d6fd2'));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    const f = (v) => v.toFixed(2);
    status.textContent = `log₁₀ η₀ ${f(view.centre[0] - view.half)} … ${f(view.centre[0] + view.half)} · log₁₀ η₁ ${f(view.centre[1] - view.half)} … ${f(view.centre[1] + view.half)} · zoom ×${(HOME.half / view.half).toFixed(0)}`;
    void w;
  };
  // box-counting dimension of the boundary in the current image (read back, 256² cells)
  const measure = () => {
    const n = canvas.width, px = new Uint8Array(n * n * 4);
    gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const G = 256, cls = new Uint8Array(G * G);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const o = (Math.floor((j * n) / G) * n + Math.floor((i * n) / G)) * 4; cls[j * G + i] = px[o] > px[o + 2] ? 1 : 0; }
    const pts = [];
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const c = cls[j * G + i]; if ((i + 1 < G && cls[j * G + i + 1] !== c) || (j + 1 < G && cls[(j + 1) * G + i] !== c)) pts.push([i, j]); }
    const rows = [];
    for (let b = 1; b <= G / 8; b *= 2) rows.push([Math.log(G / b), Math.log(new Set(pts.map(([i, j]) => `${i / b | 0},${j / b | 0}`)).size)]);
    const mx = rows.reduce((a, r) => a + r[0], 0) / rows.length, my = rows.reduce((a, r) => a + r[1], 0) / rows.length;
    const d = rows.reduce((a, r) => a + (r[0] - mx) * (r[1] - my), 0) / rows.reduce((a, r) => a + (r[0] - mx) ** 2, 0);
    status.textContent += pts.length > 20 ? ` · boundary dimension ≈ ${d.toFixed(2)} (box counting, 256² cells, boxes 1–32)` : ' · too little boundary in view to measure';
    return d;
  };
  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    view.centre = [view.centre[0] + ((e.clientX - r.left) / r.width * 2 - 1) * view.half, view.centre[1] - ((e.clientY - r.top) / r.height * 2 - 1) * view.half];
    view.half /= 2.5; draw();
  });
  outBtn.addEventListener('click', () => { view.half = Math.min(HOME.half * 4, view.half * 2.5); draw(); });
  resetBtn.addEventListener('click', () => { view = { ...HOME, centre: [...HOME.centre] }; draw(); });
  measureBtn.addEventListener('click', () => { draw(); measure(); });
  return { start() { running = true; draw(); }, stop() { running = false; }, set(c, h) { view = { centre: c, half: h }; draw(); }, measure };
}

// ---------- Hofstadter's butterfly ----------
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
// the bands at flux p/q: E where |trace of the q transfer matrices| ≤ 4, taken at the phase θ = π/2q where the
// trace is Chambers' θ-independent polynomial P(E)
export function bands(p, q, cols) {
  const out = [], th = Math.PI / (2 * q);
  let inside = false, start = 0;
  for (let k = 0; k <= cols; k++) {
    const E = -4 + (8 * k) / cols;
    let a = 1, b = 0, c = 0, d = 1;
    for (let n = 0; n < q; n++) {
      const v = E - 2 * Math.cos(2 * Math.PI * (p / q) * n + th);
      // [[v, −1], [1, 0]] · [[a, b], [c, d]]
      const na = v * a - c, nb = v * b - d; c = a; d = b; a = na; b = nb;
    }
    const ok = Math.abs(a + d) <= 4;
    if (ok && !inside) { inside = true; start = E; }
    if ((!ok || k === cols) && inside) { inside = false; out.push([start, E]); }
  }
  return out;
}
export function createButterfly(el) {
  const canvas = el.querySelector('canvas'), status = el.querySelector('.status'), qmax = el.querySelector('input[type=range]');
  let running = false;
  const draw = () => {
    if (!running) return;
    const { w, h, dpr } = fit(canvas), ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const Q = +qmax.value, cols = Math.round(w * 1.5), m = 10;
    ctx.fillStyle = tok('--ink');
    for (let q = 1; q <= Q; q++) for (let p = 0; p <= q; p++) {
      if (gcd(p, q) !== 1) continue;
      const y = m + (1 - p / q) * (h - 2 * m);
      for (const [a, b] of bands(p, q, cols)) ctx.fillRect(m + ((a + 4) / 8) * (w - 2 * m), y - 0.5, Math.max(0.6, ((b - a) / 8) * (w - 2 * m)), 1);
    }
    // the golden mean's approximants: Fibonacci ratios, their total band width shrinking toward zero
    const fib = [[1, 2], [2, 3], [3, 5], [5, 8], [8, 13], [13, 21], [21, 34], [34, 55]];
    ctx.strokeStyle = tok('--walk'); ctx.lineWidth = 1;
    const gy = m + (1 - (Math.sqrt(5) - 1) / 2) * (h - 2 * m);
    ctx.beginPath(); ctx.moveTo(m, gy); ctx.lineTo(w - m, gy); ctx.stroke();
    const widths = fib.map(([p, q]) => bands(p, q, 4000).reduce((s, [a, b]) => s + (b - a), 0));
    status.textContent = `rational fluxes p/q, q ≤ ${Q} · at the golden mean (orange line) the bands' total width at the Fibonacci approximants: ${widths.map((v) => v.toFixed(2)).join(', ')} → 0`;
  };
  qmax.addEventListener('change', draw);
  addEventListener('resize', draw);
  return { start() { running = true; draw(); }, stop() { running = false; } };
}

// ---------- the Rauzy fractal ----------
// the tribonacci word 1→12, 2→13, 3→1, its prefixes' letter counts projected on the contracting plane: the left
// eigenvector u of the substitution matrix for its complex eigenvalue, z = u · (count₁, count₂, count₃)
export function rauzyPoints(n) {
  let w = [1];
  while (w.length < n) w = w.flatMap((c) => (c === 1 ? [1, 2] : c === 2 ? [1, 3] : [1]));
  w = w.slice(0, n);
  // the complex roots of x³ = x² + x + 1 besides β ≈ 1.8393 solve x² + (β − 1)x + 1/β = 0
  const beta = 1.839286755214161, bq = beta - 1, disc = bq * bq - 4 / beta;
  const uu = leftEigen([-bq / 2, Math.sqrt(-disc) / 2]);
  const pts = new Float32Array(n * 2), letters = new Uint8Array(n);
  const cnt = [0, 0, 0];
  for (let k = 0; k < n; k++) {
    const z = [0, 0];
    for (let i = 0; i < 3; i++) { z[0] += uu[i][0] * cnt[i]; z[1] += uu[i][1] * cnt[i]; }
    pts[2 * k] = z[0]; pts[2 * k + 1] = z[1]; letters[k] = w[k];
    cnt[w[k] - 1]++;
  }
  return { pts, letters, u: uu };
}
// a left eigenvector u (u M = λ u) of the abelianised tribonacci substitution, complex λ
function leftEigen(L) {
  // u M: (u1 + u2, u1 + u3, u1)·… with M = [[1,1,1],[1,0,0],[0,1,0]] acting on columns of letter counts:
  // u M = (u1 + u2, u1 + u3, u1) = λ (u1, u2, u3) ⇒ u3 = u1/λ, u2 = (λ − 1)u1 … take u1 = 1
  const div = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
  const u1 = [1, 0], u2 = [L[0] - 1, L[1]], u3 = div(u1, L);
  return [u1, u2, u3];
}
export function createRauzy(el) {
  const canvas = el.querySelector('canvas'), status = el.querySelector('.status'), tile = el.querySelector('input[type=checkbox]');
  let running = false;
  const R = rauzyPoints(200000);
  const draw = () => {
    if (!running) return;
    const { w, h, dpr } = fit(canvas), ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let k = 0; k < R.letters.length; k++) { const x = R.pts[2 * k], y = R.pts[2 * k + 1]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, span = Math.max(x1 - x0, y1 - y0) * (tile.checked ? 2.4 : 1.15);
    const s = Math.min(w, h) / span;
    const cols = [tok('--walk'), tok('--data'), tok('--noise')];
    // the lattice that tiles: translates by u·(e_i − e₃)
    const shifts = [[0, 0]];
    if (tile.checked) for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (a || b) shifts.push([a * (R.u[0][0] - R.u[2][0]) + b * (R.u[1][0] - R.u[2][0]), a * (R.u[0][1] - R.u[2][1]) + b * (R.u[1][1] - R.u[2][1])]);
    shifts.forEach((sh, si) => {
      for (let k = 0; k < R.letters.length; k += tile.checked ? 3 : 1) {
        ctx.fillStyle = cols[R.letters[k] - 1];
        ctx.globalAlpha = si ? 0.35 : 0.9;
        ctx.fillRect(w / 2 + (R.pts[2 * k] + sh[0] - cx) * s, h / 2 - (R.pts[2 * k + 1] + sh[1] - cy) * s, 1, 1);
      }
    });
    ctx.globalAlpha = 1;
    status.textContent = `${R.letters.length.toLocaleString()} prefixes of the tribonacci word, coloured by the next letter${tile.checked ? '; faint: its copies shifted by the lattice, filling the plane' : ''}`;
  };
  tile.addEventListener('change', draw);
  addEventListener('resize', draw);
  return { start() { running = true; draw(); }, stop() { running = false; }, R };
}
