// The app shell: the arrive state. A living field, the camera inside it, fly only.
//
//   drag            look              scroll / pinch    move along the view, speed ∝ distance to surface
//   WASD QE arrows  fly               shift             faster
//   space           drift on / off (it resumes on its own after a pause otherwise)
//   P, double-click pull ⇄ push: the same formula forward per pixel (the cave) or backward per sample
//                   (the nebula). Without a fixed c, push shows the Julia set of the point you look at.
//
// Every gesture is scaled by the distance estimate at the camera, so the same hand motion means the
// same visible change in a wide hall and a hairline crevice (principle 4: gesture scale = structure).

import { parse, format, validate, de as cpuDe } from './core/index.js';
import { createRenderer } from './gpu/render.js';
import { createPush } from './gpu/push.js';

// a room inside the scale-2.5 Mandelbox (found by sphere-tracing 14 directions from random points and
// keeping the enclosed ones), turned toward a terraced amphitheatre
const DEFAULT = {
  formula: 'fold.box 1 · fold.sphere .5 1 · scale 2.5 · +c ×12 bail=100',
  cam: { pos: [-1.979, -1.43, -2.071], yaw: -1.156, pitch: -0.2 },
};

const LOOK = {
  fovDeg: 70,
  aperture: 0.006,      // thin-lens radius as a fraction of the focus distance
  hue: 0.0,
  fog: 0.15,            // absorption per clearance-length: depth goes dark at the scale you are at
  exposure: 1.2,
  terrace: 0,           // terrace bands off unless asked for
  stepScale: 0.9,
  maxDist: 12,
  epsScale: 0.6,
  key: [1.0, 0.22, 0.55],
  ambient: 0.012,
  glow: 0.05,
  glowWidth: 0.004,
  iridescence: 0.35,
  spread: 1.6,
  shadowK: 10,
  maxSteps: 220,
  lamp: [1.6, 1.1, -0.4],  // key lamp offset from the camera, in clearances along right, up, forward
  lampRange: 3,            // falloff distance, in clearances
  lampPower: 3,
  // push
  pushGain: 1,
  pushExposure: 0.9,
  pushSteps: 24,
  splatMax: 4,          // px; the kernel is shrunk (energy kept) beyond this
};

const canvas = document.getElementById('field');
const state = {
  formula: null,
  text: '',
  cam: { pos: [...DEFAULT.cam.pos], yaw: DEFAULT.cam.yaw, pitch: DEFAULT.cam.pitch },
  look: { ...LOOK },
  focus: 0.5,
  n: 0,                 // samples blended since the last change
  dirty: true,
  drift: true,
  lastInput: -1e9,
  scale: 0.6,           // internal resolution / canvas resolution, set by the governor
  frame: 0,
  maxSamples: 384,
  mode: 'pull',         // 'pull' | 'push'
};

// ---------- camera ---------------------------------------------------------------------------------

const basis = (c) => {
  const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch), cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
  const fwd = [sy * cp, sp, cy * cp];
  let right = [-fwd[2], 0, fwd[0]];
  const rl = Math.hypot(right[0], right[2]) || 1;
  right = [right[0] / rl, 0, right[2] / rl];
  const up = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ];
  return { fwd, right, up };
};

const deAt = (p) => cpuDe(state.formula, p);
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

// move without entering the surface: refuse steps that would end closer than a fraction of the
// current clearance
function moveBy(dir, dist) {
  const d0 = deAt(state.cam.pos);
  const next = add(state.cam.pos, dir, dist);
  const d1 = deAt(next);
  if (d1 > Math.max(d0 * 0.2, 1e-6)) { state.cam.pos = next; return true; }
  return false;
}

// autofocus: sphere-trace the centre ray on the CPU
function traceCentre() {
  const { fwd } = basis(state.cam);
  let t = 0;
  for (let i = 0; i < 128; i++) {
    const d = deAt(add(state.cam.pos, fwd, t));
    if (d < 1e-5 + t * 0.0015) return t;
    t += d * 0.9;
    if (t > state.look.maxDist) break;
  }
  return Math.min(t, state.look.maxDist);
}

// ---------- input -----------------------------------------------------------------------------------

function touched() { state.lastInput = performance.now(); state.dirty = true; state.n = 0; }

let drag = null;
const pointers = new Map();
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) { drag = { x: e.clientX, y: e.clientY }; document.body.classList.add('grab'); }
});
canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const before = Math.hypot(a.x - b.x, a.y - b.y);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [c, d] = [...pointers.values()];
    const after = Math.hypot(c.x - d.x, c.y - d.y);
    const { fwd } = basis(state.cam);
    moveBy(fwd, (after - before) * 0.004 * deAt(state.cam.pos));
    touched();
    return;
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!drag) return;
  const k = (state.look.fovDeg / 70) * 0.0035;
  state.cam.yaw -= (e.clientX - drag.x) * k;
  state.cam.pitch = Math.max(-1.5, Math.min(1.5, state.cam.pitch - (e.clientY - drag.y) * k));
  drag = { x: e.clientX, y: e.clientY };
  touched();
});
const release = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size === 0) { drag = null; document.body.classList.remove('grab'); }
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const { fwd } = basis(state.cam);
  const notches = Math.max(-4, Math.min(4, -e.deltaY / 100));
  moveBy(fwd, notches * 0.3 * deAt(state.cam.pos));
  touched();
}, { passive: false });

const keys = new Set();
function toggleMode() {
  if (!P) return;
  state.mode = state.mode === 'pull' ? 'push' : 'pull';
  touched();
  writeHash();
}
canvas.addEventListener('dblclick', toggleMode);

addEventListener('keydown', (e) => {
  if (e.code === 'Space') { state.drift = !state.drift; touched(); e.preventDefault(); return; }
  if (e.code === 'KeyP' && !e.repeat) { toggleMode(); return; }
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

function flyKeys(dt) {
  if (!keys.size) return false;
  const { fwd, right } = basis(state.cam);
  const speed = deAt(state.cam.pos) * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4 : 1.5) * dt;
  let moved = false;
  const go = (dir, s) => { moved = moveBy(dir, s) || moved; };
  if (keys.has('KeyW') || keys.has('ArrowUp')) go(fwd, speed);
  if (keys.has('KeyS') || keys.has('ArrowDown')) go(fwd, -speed);
  if (keys.has('KeyD') || keys.has('ArrowRight')) go(right, speed);
  if (keys.has('KeyA') || keys.has('ArrowLeft')) go(right, -speed);
  if (keys.has('KeyE')) go([0, 1, 0], speed);
  if (keys.has('KeyQ')) go([0, 1, 0], -speed);
  if (moved) touched();
  return moved;
}

// ---------- drift: the field is alive -------------------------------------------------------------
// After a pause the camera glides forward and steers toward the most open direction, sensed by the
// distance estimate a short way ahead in a ring of directions.

function drift(dt) {
  if (!state.drift || performance.now() - state.lastInput < 4000) return false;
  const c = state.cam, here = deAt(c.pos);
  let best = { s: -1, dy: 0, dp: 0 };
  for (const [dy, dp] of [[0, 0], [0.25, 0], [-0.25, 0], [0, 0.18], [0, -0.18]]) {
    const b = basis({ yaw: c.yaw + dy, pitch: c.pitch + dp });
    const s = deAt(add(c.pos, b.fwd, here * 3));
    if (s > best.s) best = { s, dy, dp };
  }
  c.yaw += best.dy * dt * 0.35 + Math.sin(state.frame * 0.003) * dt * 0.02;
  c.pitch = Math.max(-1.2, Math.min(1.2, c.pitch * (1 - dt * 0.05) + best.dp * dt * 0.35));
  moveBy(basis(c).fwd, here * 0.08 * dt);
  state.dirty = true;
  return true;
}

// ---------- URL -------------------------------------------------------------------------------------

function readHash() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (!h) return null;
  const [rest, modePart] = h.split('&m=');
  const [text, camPart] = rest.split('&c=');
  const out = { text, mode: modePart === 'push' ? 'push' : 'pull' };
  if (camPart) {
    const v = camPart.split(',').map(Number);
    if (v.length >= 5 && v.every(Number.isFinite)) out.cam = { pos: v.slice(0, 3), yaw: v[3], pitch: v[4] };
  }
  return out;
}

let hashTimer = 0;
function writeHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const c = state.cam, r = (x) => +x.toFixed(5);
    const h = '#' + encodeURIComponent(state.text) + '&c=' + [...c.pos.map(r), r(c.yaw), r(c.pitch)].join(',')
      + (state.mode === 'push' ? '&m=push' : '');
    history.replaceState(null, '', h);
  }, 600);
}

// ---------- main loop -------------------------------------------------------------------------------

let R = null, P = null;

function setFormula(text) {
  const f = parse(text);
  const v = validate(f);
  if (!v.ok) throw new Error(v.errors.join('; '));
  state.formula = f;
  state.text = format(f);
  if (R) R.setFormula(f);
  if (P) P.resetWalkers();
  touched();
}

function sizeCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; state.n = 0; }
}

// Governor: the next frame is submitted only after the GPU finished the last one, so work never
// queues up (a stalled queue froze this Mac once). Resolution follows the measured GPU time.
let gpuMs = 16, lastScaleChange = 0;
function govern(moving) {
  const target = moving ? 18 : 45;
  const now = performance.now();
  if (now - lastScaleChange < 400) return;
  let s = state.scale;
  if (gpuMs > target * 1.25) s *= 0.85;
  else if (gpuMs < target * 0.6) s *= 1.08;
  const max = moving ? 0.75 : 1;
  s = Math.max(0.25, Math.min(max, Math.round(s * 20) / 20));
  if (s !== state.scale) { state.scale = s; state.n = 0; lastScaleChange = now; }
}

let last = performance.now(), busy = false;
function tick() {
  requestAnimationFrame(tick);
  step();
}

// one frame; returns false when there was nothing to do. The capture rig calls it directly, since a
// hidden page gets no animation frames.
async function step() {
  if (busy || !R) return false;
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  state.frame++;

  sizeCanvas();
  if (!canvas.width || !canvas.height) return false; // a page with no size has no swapchain
  const interacting = !!drag || keys.size > 0 || now - state.lastInput < 150;
  flyKeys(dt);
  const drifting = drift(dt);
  const moving = interacting || drifting;
  govern(moving);

  if (!P) state.mode = 'pull';
  const E = state.mode === 'push' ? P : R;
  if (E.resize(canvas.width * state.scale, canvas.height * state.scale)) state.n = 0;
  if (!moving && state.n >= state.maxSamples) return false;

  if (moving || state.dirty) {
    state.focus += (traceCentre() - state.focus) * (moving ? 0.35 : 1);
    if (!drifting) writeHash();
  }
  state.dirty = false;

  // drift blends a short history (a soft trail); stillness converges
  const blend = drifting && !interacting ? Math.max(1 / (state.n + 1), 1 / 8) : 1 / (state.n + 1);
  const b = basis(state.cam);
  const L = state.look;
  const clear = Math.max(deAt(state.cam.pos), 1e-5);
  const lamp = [0, 1, 2].map((i) => state.cam.pos[i] + (b.right[i] * L.lamp[0] + b.up[i] * L.lamp[1] + b.fwd[i] * L.lamp[2]) * clear);
  if (state.mode === 'push') {
    pushFrame(b, clear, moving, drifting && !interacting);
  } else R.frame({
    pos: state.cam.pos, tanHalfFov: Math.tan((L.fovDeg * Math.PI) / 360),
    right: b.right, aperture: L.aperture * Math.max(state.focus, 1e-4),
    up: b.up, focus: Math.max(state.focus, 1e-4),
    fwd: b.fwd, blend,
    light: lamp, glow: L.glow, lampRange: L.lampRange * clear, lampPower: L.lampPower,
    hue: L.hue, fog: L.fog / Math.max(clear * 8, 1e-4), exposure: L.exposure, terrace: L.terrace,
    stepScale: L.stepScale, maxDist: L.maxDist, epsScale: L.epsScale, frame: state.frame,
    key: L.key, ambient: L.ambient, maxSteps: L.maxSteps, glowWidth: L.glowWidth,
    iridescence: L.iridescence, spread: L.spread, shadowK: L.shadowK, quality: moving ? 0 : 1,
  });
  state.n++;
  busy = true;
  const t0 = performance.now();
  await R.device.queue.onSubmittedWorkDone();
  gpuMs = gpuMs * 0.7 + (performance.now() - t0) * 0.3;
  busy = false;
  return true;
}

// Push: the constant for +c is the formula's own, or the point the camera looks at. The base splat
// size ε is one pixel's footprint at the focus distance; the walk then stretches each splat to the
// cell of the attractor it stands for.
function pushFrame(b, clear, moving, drifting) {
  const L = state.look;
  const th = Math.tan((L.fovDeg * Math.PI) / 360);
  const [, ih] = P.size;
  const focus = Math.max(state.focus, 1e-4);
  const c = state.formula.c || add(state.cam.pos, b.fwd, focus);
  P.frame({
    pos: state.cam.pos, tanHalfFov: th, right: b.right, aperture: L.aperture * focus,
    up: b.up, focus, fwd: b.fwd, near: 1e-4,
    frame: state.frame, steps: moving ? L.pushSteps : L.pushSteps * 2,
    c, eps: (focus * 2 * th) / ih * 0.7,
    hue: L.hue, iridescence: L.iridescence, spread: L.spread, maxRadius: moving ? L.splatMax * 0.6 : L.splatMax,
    key: L.key, fog: L.fog / Math.max(clear * 8, 1e-4), burn: 24, seed: state.formula.seed, spawn: 1,
    decay: state.n === 0 ? 0 : drifting ? 0.85 : 1,
    gain: L.pushGain, exposure: L.pushExposure,
  }, canvas);
}

// ---------- hooks for the capture rig and tests ----------------------------------------------------

window.__fe = {
  state,
  setFormula,
  setCamera(pos, yaw, pitch) { state.cam = { pos: [...pos], yaw, pitch }; touched(); state.lastInput = -1e9; },
  setLook(o) { Object.assign(state.look, o); touched(); state.lastInput = -1e9; },
  setMode(m) { state.mode = m; touched(); state.lastInput = -1e9; },
  hold(on = true) { state.drift = !on; touched(); state.lastInput = -1e9; },
  waitSamples(n) {
    return new Promise((res) => { const chk = () => (state.n >= n ? res(state.n) : setTimeout(chk, 50)); chk(); });
  },
  // drive n frames without animation frames (hidden pages, the capture rig); scale pins the
  // resolution so the governor does not reset the accumulation mid-run
  async run(n, scale) {
    if (scale) { state.scale = scale; lastScaleChange = performance.now() + 1e9; }
    for (let i = 0; i < n; i++) { while (busy) await new Promise((r) => setTimeout(r, 1)); if (!(await step())) break; }
    return state.n;
  },
  release() { lastScaleChange = 0; },
  get gpuMs() { return gpuMs; },
};

async function start() {
  const fromHash = readHash();
  try {
    setFormula(fromHash ? fromHash.text : DEFAULT.formula);
  } catch (e) {
    console.warn('formula in the URL did not parse:', e.message);
    setFormula(DEFAULT.formula);
  }
  if (fromHash && fromHash.cam) state.cam = fromHash.cam;
  if (fromHash) state.mode = fromHash.mode;
  try {
    R = await createRenderer(canvas);
  } catch (e) {
    console.error(e);
    document.getElementById('nogpu').hidden = false;
    window.__fe.error = String(e.message || e);
    return;
  }
  R.setFormula(state.formula);
  try {
    P = await createPush(R);
  } catch (e) {
    // pull still works without push
    console.error(e);
    window.__fe.error = String(e.message || e);
    state.mode = 'pull';
  }
  R.device.lost.then((info) => { console.error('device lost', info.message); document.getElementById('nogpu').hidden = false; });
  window.__fe.ready = true;
  requestAnimationFrame(tick);
}
start();
