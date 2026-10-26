// The app shell: the arrive state. A living field, the camera inside it, fly only.
//
//   drag            look              scroll / pinch    move along the view, speed ∝ distance to surface
//   WASD QE arrows  fly               shift             faster
//   space           drift on / off (it resumes on its own after a pause otherwise)
//   P, double-click pull ⇄ push: the same formula forward per pixel (the cave) or backward per sample
//                   (the nebula). Without a fixed c, push shows the Julia set of the point you look at.
//   L               the Lyapunov channel: where nearby orbits separate the surface runs hot and glows
//   shift (in a grab) the atlas lens: the view becomes the map of two of the op's parameters, coloured by
//                   how far the surface would be from the held point; move to travel it, let go to close
//   tab             the structure layer: depth ruler, op strip, lineage (click a dot to return there)
//   ⌘Z / ⇧⌘Z        back to the parent formula / forward to the newest child (ctrl on other systems)
//   hold            (still for 280 ms) grab what is under the cursor: the op that moves the surface most
//                   there shows its handle, the reticle and the point's orbit; drag sideways to edit it at
//                   a constant pixels-per-pixel rate, scroll to pass attention to the next op, Esc undoes
//
// Every gesture is scaled by the distance estimate at the camera, so the same hand motion means the
// same visible change in a wide hall and a hairline crevice (principle 4: gesture scale = structure).

import { parse, format, validate, normalize, iterate, getOp, de as cpuDe } from './core/index.js';
import { createRenderer } from './gpu/render.js';
import { createPush } from './gpu/push.js';
import { createSense } from './gpu/sense.js';
import { makeCamera, drawGrab, clearGrab, drawLens } from './ui/overlay.js';
import { paramTangents } from './gpu/pack.js';
import { createLineage } from './ui/lineage.js';
import { drawStructure } from './ui/structure.js';

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
  lyapMix: 0,           // the Lyapunov channel, 0 off, 1 on (L)
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
  sensed: null,         // the last sensing pass: parameter metric and λ statistics for this view
  senseDue: true,
  structure: false,     // Tab: ruler, op strip, lineage, and terraces on the surface
  thumbDue: null,       // lineage node waiting for its thumbnail
  hoverNode: null,
};

// ---------- lineage and the structure layer -------------------------------------------------------

const lineage = createLineage();
const structureSvg = document.getElementById('structure');

function remember() {
  const node = lineage.commit({ text: state.text, cam: { pos: [...state.cam.pos], yaw: state.cam.yaw, pitch: state.cam.pitch }, mode: state.mode });
  if (!node.thumb) state.thumbDue = node.id;
  drawStructureNow();
}

function restore(node) {
  if (!node) return;
  exitGrab();
  setFormula(node.text);
  state.cam = { pos: [...node.cam.pos], yaw: node.cam.yaw, pitch: node.cam.pitch };
  if (node.mode === 'push' && !P) state.mode = 'pull'; else state.mode = node.mode;
  touched();
  writeHash();
  drawStructureNow();
}

// a small JPEG of the canvas, taken right after a frame was submitted
function captureThumb() {
  try {
    const c = document.createElement('canvas');
    c.width = 192; c.height = Math.round(192 * canvas.height / canvas.width);
    c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  } catch { return null; }
}

function drawStructureNow() {
  if (!state.structure || !state.formula) { structureSvg.innerHTML = ''; return; }
  const f = normalize(state.formula);
  const b = basis(state.cam);
  const centre = add(state.cam.pos, b.fwd, Math.max(state.focus, 1e-4));
  const depth = iterate(f, centre, f.c || centre).n;
  drawStructure(structureSvg, {
    W: innerWidth, H: innerHeight, formula: f, depth,
    attention: typeof grab !== 'undefined' && grab ? grab.ranked[grab.k].oi : null,
    lineage: lineage.layout(), hover: state.hoverNode,
  });
}

function toggleStructure() {
  state.structure = !state.structure;
  // terrace bands appear with the structure, not before
  state.look.terrace = state.structure ? 1.5 : 0;
  touched();
  drawStructureNow();
}

structureSvg.addEventListener('pointermove', (e) => {
  const id = e.target && e.target.dataset ? +e.target.dataset.id || null : null;
  if (id !== state.hoverNode) { state.hoverNode = id; drawStructureNow(); }
});
structureSvg.addEventListener('pointerleave', () => { state.hoverNode = null; drawStructureNow(); });
structureSvg.addEventListener('click', (e) => {
  const id = e.target && e.target.dataset ? +e.target.dataset.id : NaN;
  if (Number.isFinite(id)) restore(lineage.jump(id));
});

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

function touched() { state.lastInput = performance.now(); state.dirty = true; state.n = 0; state.senseDue = true; }

// ---------- grab: hold to edit what is under the cursor ---------------------------------------------
// A press that stays within 5 px for 280 ms becomes a grab. A sensing pass under the cursor ranks every
// parameter by how far it moves the surface there (pixels per unit, made comparable by the parameter's
// own scale): the first is the attention op. Sideways drag edits it at the local metric, so one pixel of
// hand motion moves the surface about one pixel whatever the parameter; scroll passes attention on.

const HOLD_MS = 280, HOLD_SLOP = 5, RING = 24, RETICLE = 96;
const overlay = document.getElementById('grab');
let hold = null;   // a press that may become a grab
let grab = null;   // the grab being edited

function pixelRay(x, y) {
  const b = basis(state.cam), th = Math.tan((state.look.fovDeg * Math.PI) / 360), aspect = innerWidth / innerHeight;
  const u = (x / innerWidth) * 2 - 1, v = (y / innerHeight) * 2 - 1;
  const d = [0, 1, 2].map((k) => b.fwd[k] + b.right[k] * u * th * aspect - b.up[k] * v * th);
  const l = Math.hypot(...d);
  return { dir: d.map((q) => q / l), uv: [u, v] };
}

function traceRay(dir) {
  let t = 0;
  const pa = (2 * Math.tan((state.look.fovDeg * Math.PI) / 360)) / innerHeight;
  for (let i = 0; i < 160; i++) {
    const d = deAt(add(state.cam.pos, dir, t));
    if (d < Math.max(t * pa * 0.5, 1e-6)) return t;
    t += d * 0.9;
    if (t > state.look.maxDist) return null;
  }
  return null;
}

// a parameter's scale, so lengths and angles compete fairly: px for a step of its own size
const ownScale = (p) => Math.max(Math.abs(p.value), p.op === 'rotate' || p.op === 'twist' ? 10 : 0.1);

// press: the hold that asked for this grab; if it was released while sensing ran, there is no grab
async function enterGrab(x, y, press = null) {
  if (!S || state.mode !== 'pull') return false;  // push has no surface to sense yet
  const { dir, uv } = pixelRay(x, y);
  const t = traceRay(dir);
  if (t == null) return false;
  const hit = add(state.cam.pos, dir, t);
  // 5×5 rays within ±8 px of the cursor, then the reticle's ring
  const uvs = [];
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) uvs.push(uv[0] + (i * 4 * 2) / innerWidth, uv[1] + (j * 4 * 2) / innerHeight);
  for (let k = 0; k < RING; k++) {
    const a = (k / RING) * Math.PI * 2;
    uvs.push(((x + Math.cos(a) * RETICLE) / innerWidth) * 2 - 1, ((y + Math.sin(a) * RETICLE) / innerHeight) * 2 - 1);
  }
  let r = null;
  // the whole-view pass may be running (it is slower with many parameters): wait for it, up to 3 s
  for (let tries = 0; tries < 120 && !r; tries++) {
    r = await S.sense(state.formula, senseView(), innerHeight, new Float32Array(uvs));
    if (!r) await new Promise((res) => setTimeout(res, 25));
  }
  if (!r || (press && hold !== press)) return false;
  const local = r.rays.slice(0, 25).filter((q) => q.hit);
  if (!local.length) return false;
  const ranked = r.params.map((p, j) => {
    let sum = 0;
    for (const q of local) sum += q.speeds[j] * q.speeds[j];
    const pxPerUnit = Math.sqrt(sum / local.length);
    return { ...p, pxPerUnit, score: pxPerUnit * ownScale(p) };
  }).filter((p) => p.pxPerUnit > 0).sort((a, b) => b.score - a.score);
  if (!ranked.length) return false;
  grab = {
    x, y, hit, t, ranked, k: 0, x0: x, value0: ranked[0].value, text0: state.text,
    ring: r.rays.slice(25).map((q, k) => ({ angle: (k / RING) * Math.PI * 2, lambda: q.hit ? q.lambda : null })),
    lyap: state.sensed ? state.sensed.lyap : r.lyap,
  };
  state.lastInput = performance.now();
  drawGrabNow();
  return true;
}

function drawGrabNow() {
  if (!grab) return;
  const att = grab.ranked[grab.k];
  const f = normalize(state.formula);
  const o = f.slots.flat()[att.oi];
  att.value = o.p[att.key];
  const b = basis(state.cam);
  const C = makeCamera(state.cam, b, Math.tan((state.look.fovDeg * Math.PI) / 360), innerWidth, innerHeight);
  const orbit = iterate(f, grab.hit, f.c || grab.hit);
  drawGrab(overlay, C, {
    screen: [grab.x, grab.y], hit: grab.hit, t: grab.t,
    attention: { op: att.op, key: att.key, value: att.value, glyph: getOp(att.op).glyph },
    params: o.p, ring: grab.ring, lyap: grab.lyap,
    orbit: { points: orbit.points, branches: orbit.branches },
  });
}

function editGrab(x) {
  const att = grab.ranked[grab.k];
  const q = getOp(att.op).params.find((p) => p.k === att.key);
  let v = grab.value0 + (x - grab.x0) / att.pxPerUnit;
  if (q.min !== undefined) v = Math.max(q.min, v);
  if (q.max !== undefined) v = Math.min(q.max, v);
  setFormula(format(withParam(state.formula, att.oi, att.key, +v.toPrecision(6))));
  drawGrabNow();
}

function passAttention(step, x) {
  grab.k = (grab.k + step + grab.ranked.length) % grab.ranked.length;
  const att = grab.ranked[grab.k];
  grab.value0 = normalize(state.formula).slots.flat()[att.oi].p[att.key];
  grab.x0 = x;
  drawGrabNow();
}

// ---------- the atlas lens --------------------------------------------------------------------------
// Two parameters of the attention op (or the next in the ranking) span the view; their ranges are what a
// drag across the screen reaches at the local metric, so the map and the hand agree. Rotation angles and
// plane normals are not offered: their records are not linear in them and the lens varies records.

const NONLINEAR = (p) => p.op === 'rotate' || (p.op === 'fold.plane' && p.key !== 'd');
const INSET_R = 70;
let lens = null;

function openLens() {
  if (!grab || lens) return false;
  const att = grab.ranked[grab.k];
  const linear = grab.ranked.filter((p) => !NONLINEAR(p));
  const p1 = !NONLINEAR(att) ? att : linear[0];
  if (!p1) return false;
  const p2 = linear.find((p) => p !== p1 && p.oi === p1.oi) || linear.find((p) => p !== p1);
  const tg = paramTangents(state.formula).list;
  const drecOf = (p) => tg.find((t) => t.oi === p.oi && t.key === p.key).drec;
  const f = normalize(state.formula);
  const valueOf = (p) => f.slots.flat()[p.oi].p[p.key];
  const th = Math.tan((state.look.fovDeg * Math.PI) / 360);
  const foot = grab.t * (2 * th) / innerHeight;
  const dpr = canvas.width / innerWidth;
  const params = p2 ? [p1, p2] : [p1];
  R.lens({
    x: grab.hit, foot, spans: [innerWidth / p1.pxPerUnit, p2 ? innerHeight / p2.pxPerUnit : 0],
    ops: params.map((p) => p.oi), drecs: params.map(drecOf),
    size: [Math.round(canvas.width / 2), Math.round(canvas.height / 2)], key: state.look.key,
  });
  const inset = [innerWidth - INSET_R - 30, innerHeight - INSET_R - 30, INSET_R];
  R.setLens(true, inset.map((v) => v * dpr));
  lens = { params, v0: params.map(valueOf), x0: null, y0: null, at: [innerWidth / 2, innerHeight / 2], inset };
  drawLensNow();
  return true;
}

function moveLens(x, y) {
  if (lens.x0 === null) { lens.x0 = x; lens.y0 = y; }
  const dx = x - lens.x0, dy = y - lens.y0;
  lens.at = [innerWidth / 2 + dx, innerHeight / 2 + dy];
  let g = state.formula;
  lens.params.forEach((p, i) => {
    const q = getOp(p.op).params.find((r) => r.k === p.key);
    let v = lens.v0[i] + (i === 0 ? dx : -dy) / p.pxPerUnit;
    if (q.min !== undefined) v = Math.max(q.min, v);
    if (q.max !== undefined) v = Math.min(q.max, v);
    g = withParam(g, p.oi, p.key, +v.toPrecision(6));
  });
  setFormula(format(g));
  drawLensNow();
}

function drawLensNow() {
  const f = normalize(state.formula);
  drawLens(overlay, {
    W: innerWidth, H: innerHeight, at: lens.at, inset: lens.inset,
    glyphs: lens.params.map((p) => getOp(p.op).glyph),
    values: lens.params.map((p) => f.slots.flat()[p.oi].p[p.key]),
  });
}

function closeLens() {
  if (!lens) return;
  lens = null;
  R.setLens(false);
  if (grab) {
    // the grab carries on from where the lens left the formula
    const att = grab.ranked[grab.k];
    grab.value0 = normalize(state.formula).slots.flat()[att.oi].p[att.key];
    grab.x0 = pointers.size ? [...pointers.values()][0].x : grab.x0;
    drawGrabNow();
  } else clearGrab(overlay);
}

function exitGrab(revert = false) {
  closeLens();
  if (!grab) return;
  if (revert) setFormula(grab.text0);
  else if (state.text !== grab.text0) remember();
  grab = null;
  clearGrab(overlay);
  state.senseDue = true;
  writeHash();
}

let drag = null;
const pointers = new Map();
canvas.addEventListener('pointerdown', (e) => {
  try { canvas.setPointerCapture(e.pointerId); } catch { /* a pointer the browser does not track */ }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    drag = { x: e.clientX, y: e.clientY };
    const h = { x: e.clientX, y: e.clientY };
    h.timer = setTimeout(() => { if (hold === h) enterGrab(h.x, h.y, h).then((ok) => { if (ok) drag = null; }); }, HOLD_MS);
    hold = h;
    document.body.classList.add('grab');
  } else if (hold) { clearTimeout(hold.timer); hold = null; }
});
canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  if (lens) { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); moveLens(e.clientX, e.clientY); return; }
  if (grab) { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); editGrab(e.clientX); return; }
  // still deciding: a press that becomes a grab must not turn the camera meanwhile
  if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) <= HOLD_SLOP) { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); return; }
  if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > HOLD_SLOP) { clearTimeout(hold.timer); hold = null; }
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
  if (pointers.size === 0) {
    drag = null;
    if (hold) { clearTimeout(hold.timer); hold = null; }
    exitGrab();
    document.body.classList.remove('grab');
  }
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (grab) { passAttention(e.deltaY > 0 ? 1 : -1, e.clientX); return; }
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
  remember();
}
canvas.addEventListener('dblclick', toggleMode);

addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && grab) { exitGrab(true); return; }
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && grab && !e.repeat) { openLens(); return; }
  if (e.code === 'Tab') { e.preventDefault(); toggleStructure(); return; }
  if (e.code === 'KeyZ' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    const n = e.shiftKey ? lineage.child() : lineage.parent();
    if (n) restore(lineage.jump(n.id));
    return;
  }
  if (e.code === 'Space') { state.drift = !state.drift; touched(); e.preventDefault(); return; }
  if (e.code === 'KeyP' && !e.repeat) { toggleMode(); return; }
  if (e.code === 'KeyL' && !e.repeat) { state.look.lyapMix = state.look.lyapMix > 0 ? 0 : 1; touched(); return; }
  keys.add(e.code);
});
addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && lens) closeLens();
});
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
  if (!state.drift || grab || performance.now() - state.lastInput < 4000) return false;
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

let R = null, P = null, S = null;

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
    lyapMix: L.lyapMix,
    // centre the λ colours on this view's median, half-width from its spread (calibrated by sensing)
    lyapCentre: state.sensed ? state.sensed.lyap.median : 0.9,
    lyapScale: state.sensed ? 1 / Math.max((state.sensed.lyap.p90 - state.sensed.lyap.p10) / 2, 0.05) : 2,
  });
  if (!moving && state.senseDue && S) { state.senseDue = false; senseNow(); }
  state.n++;
  if (state.thumbDue != null && state.n >= 16) {
    const url = captureThumb();
    if (url) lineage.setThumb(state.thumbDue, url);
    state.thumbDue = null;
    drawStructureNow();
  }
  if (state.structure && (moving || state.n === 1)) drawStructureNow();
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

// ---------- the parameter metric ----------------------------------------------------------------
// How many CSS pixels the surface moves per unit of each parameter, measured from this view. A control
// moved by Δ pixels of hand motion changes its parameter by Δ / pxPerUnit, so every control feels the
// same and slows down near the cliffs where the fractal is sensitive.

function senseView() {
  const b = basis(state.cam), L = state.look;
  return {
    pos: state.cam.pos, right: b.right, up: b.up, fwd: b.fwd,
    tanHalfFov: Math.tan((L.fovDeg * Math.PI) / 360), aspect: canvas.width / canvas.height,
    maxDist: L.maxDist, stepScale: L.stepScale, maxSteps: L.maxSteps, epsScale: L.epsScale,
  };
}

async function senseNow() {
  const r = await S.sense(state.formula, senseView(), innerHeight);
  if (r) { state.sensed = r; if (state.look.lyapMix > 0) { state.n = 0; } }
  return r;
}

function withParam(f, oi, key, value) {
  const g = JSON.parse(JSON.stringify(normalize(f)));
  let n = 0;
  for (const s of g.slots) for (const o of s) { if (n === oi) o.p[key] = value; n++; }
  return g;
}

// move a parameter by a number of on-screen pixels
function nudge(oi, key, px) {
  const m = state.sensed && state.sensed.params.find((q) => q.oi === oi && q.key === key);
  if (!m || !(m.pxPerUnit > 0)) return false;
  const next = withParam(state.formula, oi, key, m.value + px / m.pxPerUnit);
  setFormula(format(next));
  return true;
}

// does a step of px pixels, as the metric predicts it, move the surface by px pixels? Measured on
// the CPU at the sensed hit points: the change of the distance estimate over its gradient is how far
// the surface moved along its normal, over the pixel footprint at that depth.
function metricCheck(px = 3) {
  const r = state.sensed;
  if (!r) return null;
  return r.params.map((m) => {
    if (!(m.pxPerUnit > 0)) return { ...m, predicted: px, measured: 0 };
    const g = withParam(state.formula, m.oi, m.key, m.value + px / m.pxPerUnit);
    let sum = 0, n = 0;
    for (const q of r.points) {
      const moved = (cpuDe(g, q.x) - cpuDe(state.formula, q.x)) / q.grad / (q.t * r.pixelAngle);
      if (Number.isFinite(moved)) { sum += moved * moved; n++; }
    }
    return { op: m.op, key: m.key, pxPerUnit: m.pxPerUnit, predicted: px, measured: Math.sqrt(sum / Math.max(n, 1)) };
  });
}

// ---------- hooks for the capture rig and tests ----------------------------------------------------

window.__fe = {
  state,
  setFormula,
  setCamera(pos, yaw, pitch) { state.cam = { pos: [...pos], yaw, pitch }; touched(); state.lastInput = -1e9; },
  setLook(o) { Object.assign(state.look, o); touched(); state.lastInput = -1e9; },
  setMode(m) { state.mode = m; touched(); state.lastInput = -1e9; },
  sense: () => senseNow(),
  // the grab, driven without a pointer (tests, the capture rig)
  grabAt: (x, y) => enterGrab(x, y),
  grabDrag: (dx) => { if (grab) editGrab(grab.x0 + dx); return grab && grab.ranked[grab.k]; },
  grabPass: (step = 1) => { if (grab) passAttention(step, grab.x0); return grab && grab.ranked[grab.k]; },
  grabEnd: (revert = false) => exitGrab(revert),
  lensOpen: () => openLens(),
  lensMove: (dx, dy) => { if (lens) { if (lens.x0 === null) moveLens(0, 0); moveLens(lens.x0 + dx, lens.y0 + dy); } return lens && lens.params.map((p) => p.op + '.' + p.key); },
  lensClose: () => closeLens(),
  structure: () => { toggleStructure(); return state.structure; },
  lineage: () => lineage.layout(200).map((n) => ({ id: n.id, parent: n.parent, text: n.text, current: n.current, thumb: !!n.thumb })),
  back: () => { const n = lineage.parent(); if (n) restore(lineage.jump(n.id)); return n && n.id; },
  forward: () => { const n = lineage.child(); if (n) restore(lineage.jump(n.id)); return n && n.id; },
  jump: (id) => restore(lineage.jump(id)),
  get grab() { return grab; },
  metric: () => state.sensed && state.sensed.params,
  nudge,
  metricCheck,
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
  try { S = await createSense(R); } catch (e) { console.error(e); }
  R.device.lost.then((info) => { console.error('device lost', info.message); document.getElementById('nogpu').hidden = false; });
  remember();
  window.__fe.ready = true;
  requestAnimationFrame(tick);
}
start();
