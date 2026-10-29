// Metafractal's own figures: the Mandelbrot set as the map of the Julia sets (figure "map"), and Tan Lei's
// similarity at a Misiurewicz point (figure "tanlei"). One fragment shader draws either set: escape time in
// the paper's ink on its paper colour, the set itself in ink. A figure draws only when something changed
// (the pointer, the zoom, the slow drift of c while nobody touches it) and only while it is on screen.
//
//   createMap(el)     two panes: the parameter plane (M) and the dynamical plane of the c under the crosshair
//   createTanLei(el)  two panes zoomed together on one c: M around c, and J_c around c

const VERT = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

// mode 0: the parameter plane (z0 = 0, c = the pixel); mode 1: the dynamical plane (z0 = the pixel, c fixed)
const FRAG = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform int mode, iters;
uniform vec2 centre, c, aspect;
uniform float half_, px_h;
uniform vec3 ink, paper;
void main() {
  vec2 q = centre + (uv * 2.0 - 1.0) * aspect * half_;
  vec2 z = mode == 0 ? vec2(0.0) : q;
  vec2 k = mode == 0 ? q : c;
  // the derivative along the orbit (w.r.t. c in the parameter plane, z0 in the dynamical one) gives a distance
  // estimate, so the boundary is drawn as a hairline of ink at any zoom
  vec2 dz = mode == 0 ? vec2(0.0) : vec2(1.0, 0.0);
  float n = 0.0;
  for (int i = 0; i < 2000; i++) {
    if (i >= iters) break;
    dz = 2.0 * vec2(z.x * dz.x - z.y * dz.y, z.x * dz.y + z.y * dz.x) + (mode == 0 ? vec2(1.0, 0.0) : vec2(0.0));
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + k;
    if (dot(z, z) > 1e8) break;
    n += 1.0;
  }
  if (n >= float(iters)) { o = vec4(ink, 1.0); return; }
  float r = length(z), de = 0.5 * r * log(r) / max(length(dz), 1e-30);
  float px = 2.0 * half_ / px_h;
  float line = 1.0 - smoothstep(0.0, 1.6 * px, de);
  // a faint wash of escape time behind the line, so the far field is not blank
  float s = n + 1.0 - log2(log2(dot(z, z)) * 0.5);
  float wash = 0.12 * clamp(pow(s / float(iters), 0.25), 0.0, 1.0);
  o = vec4(mix(paper, ink, max(line, wash)), 1.0);
}`;

const css = (name) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
  const h = v.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};

// one pane: a canvas with its own context (two per figure; they draw only on demand)
function pane(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
  if (!gl) throw new Error('webgl2');
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  const U = (n) => gl.getUniformLocation(prog, n);
  const u = { mode: U('mode'), iters: U('iters'), centre: U('centre'), c: U('c'), aspect: U('aspect'), half: U('half_'), pxh: U('px_h'), ink: U('ink'), paper: U('paper') };
  return {
    canvas,
    // v: { mode, centre: [x, y], half (half the height, in plane units), c: [x, y], iters }
    draw(v) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (!w || !h) return;
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(u.mode, v.mode);
      gl.uniform1i(u.iters, v.iters);
      gl.uniform2f(u.centre, v.centre[0], v.centre[1]);
      gl.uniform2f(u.c, v.c[0], v.c[1]);
      gl.uniform2f(u.aspect, w / h, 1);
      gl.uniform1f(u.half, v.half);
      gl.uniform1f(u.pxh, h);
      gl.uniform3fv(u.ink, css('--ink'));
      gl.uniform3fv(u.paper, css('--paper'));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    // plane point under a client position, for a view v
    at(v, x, y) {
      const r = canvas.getBoundingClientRect();
      const a = r.width / r.height;
      return [v.centre[0] + ((x - r.left) / r.width * 2 - 1) * a * v.half, v.centre[1] - ((y - r.top) / r.height * 2 - 1) * v.half];
    },
    // client offset of a plane point, for the crosshair
    to(v, p) {
      const r = canvas.getBoundingClientRect(), a = r.width / r.height;
      return [((p[0] - v.centre[0]) / (a * v.half) + 1) / 2 * r.width, (1 - (p[1] - v.centre[1]) / v.half) / 2 * r.height];
    },
  };
}

// figure: the parameter plane beside the Julia set of the point under the crosshair
export function createMap(el) {
  const [cm, cj] = el.querySelectorAll('canvas');
  const cross = el.querySelector('.cross'), readout = el.querySelector('.status');
  const M = pane(cm), J = pane(cj);
  const vm = { mode: 0, centre: [-0.6, 0], half: 1.25, c: [0, 0], iters: 160 };
  const vj = { mode: 1, centre: [0, 0], half: 1.6, c: [0, 0], iters: 220 };
  let c = [-0.123, 0.745], held = false, touched = 0, raf = 0, running = false, t0 = performance.now();
  const show = () => {
    vj.c = c;
    M.draw(vm); J.draw(vj);
    const [x, y] = M.to(vm, c);
    cross.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    // connected exactly when c is in M (Fatou, Julia): the orbit of 0 stays bounded
    let z = [0, 0], inside = true;
    for (let i = 0; i < 500; i++) { z = [z[0] * z[0] - z[1] * z[1] + c[0], 2 * z[0] * z[1] + c[1]]; if (z[0] * z[0] + z[1] * z[1] > 4) { inside = false; break; } }
    readout.textContent = `c = ${c[0].toFixed(4)} ${c[1] < 0 ? '−' : '+'} ${Math.abs(c[1]).toFixed(4)} i · ${inside ? 'in M: J_c is connected' : 'outside M: J_c is dust'}`;
  };
  const loop = () => {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    // nobody touching for a while: c drifts along the main cardioid's edge, just inside and just outside
    if (!held && performance.now() - touched > 4000) {
      const t = (performance.now() - t0) / 1000 * 0.05, r = 1.0 + 0.04 * Math.sin(t * 7);
      const e = [Math.cos(t * Math.PI * 2), Math.sin(t * Math.PI * 2)];
      // the cardioid c = e/2 − e²/4, pushed out from its cusp's side by r
      c = [r * (e[0] / 2 - (e[0] * e[0] - e[1] * e[1]) / 4), r * (e[1] / 2 - (2 * e[0] * e[1]) / 4)];
      show();
    }
  };
  const move = (e) => { if (!held) return; c = M.at(vm, e.clientX, e.clientY); touched = performance.now(); show(); };
  cm.addEventListener('pointerdown', (e) => { held = true; cm.setPointerCapture(e.pointerId); move(e); });
  cm.addEventListener('pointermove', move);
  const up = () => { held = false; touched = performance.now(); };
  cm.addEventListener('pointerup', up); cm.addEventListener('pointercancel', up);
  addEventListener('resize', () => { if (running) show(); });
  return {
    start() { running = true; show(); raf = requestAnimationFrame(loop); },
    stop() { running = false; cancelAnimationFrame(raf); },
    set(x, y) { c = [x, y]; touched = performance.now(); show(); },
  };
}

// Misiurewicz points: c where the critical orbit lands on a repelling cycle; there M and J_c look alike
export const MISIUREWICZ = {
  i: [0, 1],
  m41: [-0.10109636384562, 0.95628651080914],
  tip: [-2, 0],
};

// figure: M around c and J_c around c, one zoom for both
export function createTanLei(el) {
  const [cm, cj] = el.querySelectorAll('canvas');
  const zoom = el.querySelector('input[type=range]'), pick = el.querySelector('select'), readout = el.querySelector('.status');
  const M = pane(cm), J = pane(cj);
  let running = false, c = MISIUREWICZ.i;
  const show = () => {
    if (!running) return;
    const half = Math.pow(10, -zoom.value);
    const iters = Math.round(200 + 260 * zoom.value);
    M.draw({ mode: 0, centre: c, half, c, iters });
    J.draw({ mode: 1, centre: c, half, c, iters });
    readout.textContent = `both panes ${half >= 0.01 ? half.toFixed(3) : half.toExponential(1)} high around c = ${c[0].toFixed(4)} ${c[1] < 0 ? '−' : '+'} ${Math.abs(c[1]).toFixed(4)} i`;
  };
  zoom.addEventListener('input', show);
  pick.addEventListener('change', () => { c = MISIUREWICZ[pick.value]; show(); });
  addEventListener('resize', show);
  return { start() { running = true; show(); }, stop() { running = false; } };
}
