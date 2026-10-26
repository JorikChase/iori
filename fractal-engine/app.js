// The app shell: the arrive state. A living field, the camera inside it, fly only.
//
//   drag            look              scroll / pinch    move along the view, speed ∝ distance to surface
//   WASD QE arrows  fly               shift             faster
//   space           drift on / off: after a pause the camera glides and every unpinned parameter wanders
//                   a few pixels about its home value (herding); it resumes on its own otherwise
//   long hold       (still for 1.2 s) the breed ring: eight neighbours around the cursor — four near, four
//                   from the archive of variety — placed by their feature direction, spoke length their
//                   visual distance; release on one to walk there at constant visual speed, scroll for
//                   farther or nearer neighbours, release at the centre to stay
//   R               replay the lineage from its root to here, at constant visual speed
//   ⌘S              a 4K still (3840 px on the long side, the view's aspect) — and in the Tab layer, bottom
//                   right: still, video (the lineage walked at constant speed, a PNG sequence), splats
//                   (push samples as 3D Gaussians, .ply), mesh (surface nets of the field around the focus, .stl)
//   F (in a grab)   pin this region: the parameters that move it stop wandering; F on a pin unpins it
//   in the loop      scroll zooms its window, drag pans it, shift-drag rolls it (the optical machine's
//                   distance, offset and roll); drift turns it slowly
//   P, double-click pull → push → loop: the same formula forward per pixel (the cave), backward per
//                   sample (the nebula), or as optical feedback through its own map (the loop, which
//                   starts from the field you were looking at). Without a fixed c, push shows the Julia
//                   set of the point you look at.
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

import { parse, format, validate, normalize, iterate, getOp, lift, de as cpuDe } from './core/index.js';
import { createRenderer } from './gpu/render.js';
import { createPush } from './gpu/push.js';
import { createSense } from './gpu/sense.js';
import { createLoop } from './gpu/loop.js';
import { makeCamera, drawGrab, clearGrab, drawLens, drawKnobs, drawRing } from './ui/overlay.js';
import { mutate, distancePx, features, createArchive, spread } from './core/breed.js';
import { gridUVs } from './gpu/sense.js';
import { project } from './core/vec.js';
import { surfaceNets, toStl, splatsToPly } from './core/export.js';
import { hash } from './core/formula.js';
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
  pushSlab: 0.1,        // push draws the 4-D attractor within this distance of the slice (0: its whole shadow)
  splatMax: 4,          // px; the kernel is shrunk (energy kept) beyond this
  lyapMix: 0,           // the Lyapunov channel, 0 off, 1 on (L)
  // loop: the monitor's knobs, per pass
  loopHue: 0.045,       // hue rotation, radians
  loopSaturation: 1.03,
  loopGain: 0.99,       // with decay: below 1 nested escape-time halos, at or above 1 the set saturates
  loopContrast: 1.0,
  loopPivot: 0.15,      // contrast pivots here, in the dark
  loopDecay: 0.97,
  loopBlur: 0.6,        // texels
  loopNoise: 0.6,       // seed: sparks of the key colour
  loopField: 0.08,      // the field fed in every pass, the loop's secondary input (0 none)
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
  mode: 'pull',         // 'pull' | 'push' | 'loop'
  loopSeed: 0,          // frames left during which the loop is (re)seeded from the field
  loopWin: null,        // the loop's window: { o, e1, e2, n, hh } on the plane where the view was focused
  sensed: null,         // the last sensing pass: parameter metric and λ statistics for this view
  senseDue: true,
  structure: false,     // Tab: ruler, op strip, lineage, and terraces on the surface
  thumbDue: null,       // lineage node waiting for its thumbnail
  hoverNode: null,
  home: null,           // parameter values drift wanders about (set at every edit)
  pins: [],             // [{ x (world point), keys: ['oi.key', …] }]
  trans: null,          // a transition in progress (morph or flow)
  exporting: null,      // { kind, progress } while an export runs; the live view pauses
};

// ---------- lineage and the structure layer -------------------------------------------------------

const lineage = createLineage();
const structureSvg = document.getElementById('structure');

function remember() {
  const node = lineage.commit({ text: state.text, cam: { pos: [...state.cam.pos], yaw: state.cam.yaw, pitch: state.cam.pitch }, mode: state.mode });
  if (!node.thumb) state.thumbDue = node.id;
  drawStructureNow();
}

// Transitions never crossfade. Between formulas of the same structure the parameters and the camera
// move (350 ms, eased), so every frame between is a real fractal. Across structures or modes the old
// image flows through the new formula's map in the loop engine (380 ms), then the new mode takes over.
const MORPH_MS = 350, FLOW_MS = 380, WALK_PX_S = 150;
const structureOf = (g) => JSON.stringify([g.slots.map((sl) => sl.map((o) => o.op)), g.schedule, g.iters, g.c || null]);

function restore(node) {
  if (!node) return;
  exitGrab();
  const mode = node.mode === 'push' && !P ? 'pull' : node.mode;
  const to = normalize(parse(node.text));
  const cam = { pos: [...node.cam.pos], yaw: node.cam.yaw, pitch: node.cam.pitch };
  if (mode === state.mode && structureOf(to) === structureOf(normalize(state.formula))) {
    state.trans = { kind: 'morph', t0: performance.now(), dur: MORPH_MS, from: { f: normalize(state.formula), cam: JSON.parse(JSON.stringify(state.cam)) }, to: { f: to, cam } };
  } else {
    setFormula(node.text);
    state.cam = cam;
    flowTo(mode);
  }
  touched();
  writeHash();
  drawStructureNow();
}

// walk to a formula of the same structure at constant visual speed: parameters linear in time, the
// duration its distance by the metric over WALK_PX_S. then: called on arrival
function walkTo(text, then, commit = true) {
  const to = normalize(parse(text));
  const from = normalize(state.formula);
  if (structureOf(to) !== structureOf(from)) { setFormula(text); flowTo(state.mode); if (then) then(); return; }
  const m = state.sensed ? state.sensed.params : [];
  const D = m.length ? distancePx(from, to, m) : 100;
  const dur = Math.max(250, Math.min(3000, (D / WALK_PX_S) * 1000));
  state.trans = { kind: 'walk', t0: performance.now(), dur, from: { f: from, cam: JSON.parse(JSON.stringify(state.cam)) }, to: { f: to, cam: JSON.parse(JSON.stringify(state.cam)) }, then, commit };
}

function flowTo(mode) {
  if (!LP) { state.mode = mode; return; }
  state.loopSeed = 1;
  placeLoopWindow();
  state.trans = { kind: 'flow', t0: performance.now(), dur: FLOW_MS, then: mode };
}

function advanceTransition(now) {
  const T = state.trans;
  if (!T) return;
  const s = Math.min(1, (now - T.t0) / T.dur);
  // a walk keeps a constant speed; a morph eases in and out
  const e = T.kind === 'walk' ? s : s * s * (3 - 2 * s);
  if (T.kind === 'morph' || T.kind === 'walk') {
    const a = T.from.f, b = T.to.f;
    const g = JSON.parse(JSON.stringify(b));
    g.slots.forEach((sl, i) => sl.forEach((o, j) => {
      for (const k of Object.keys(o.p)) o.p[k] = a.slots[i][j].p[k] + (b.slots[i][j].p[k] - a.slots[i][j].p[k]) * e;
    }));
    setFormula(format(g), true);
    const c0 = T.from.cam, c1 = T.to.cam;
    state.cam = { pos: c0.pos.map((v, i) => v + (c1.pos[i] - v) * e), yaw: c0.yaw + (c1.yaw - c0.yaw) * e, pitch: c0.pitch + (c1.pitch - c0.pitch) * e };
    if (s >= 1) {
      setFormula(format(b), true); state.cam = c1; state.trans = null; state.home = null;
      if (T.kind === 'walk' && T.commit) remember();
      if (T.kind === 'walk') writeHash();
      if (T.then) T.then();
    }
  } else if (s >= 1) {
    state.mode = T.then;
    state.trans = null;
    state.n = 0;
    if (state.mode === 'loop') state.loopSeed = 0;
  }
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
  const depth = iterate(f, centre, f.c || lift(f, centre)).n;
  drawStructure(structureSvg, {
    W: innerWidth, H: innerHeight, formula: f, depth,
    attention: grab && !grab.knobs ? grab.ranked[grab.k].oi : null,
    lineage: lineage.layout(), hover: state.hoverNode,
    progress: state.exporting ? state.exporting.progress : null,
    pins: (() => {
      const C = makeCamera(state.cam, b, Math.tan((state.look.fovDeg * Math.PI) / 360), innerWidth, innerHeight);
      return state.pins.map((p) => C.project(p.x)).filter(Boolean);
    })(),
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
  const id = e.target && e.target.dataset ? e.target.dataset.id || null : null;
  if (id !== state.hoverNode) { state.hoverNode = id; drawStructureNow(); }
});
structureSvg.addEventListener('pointerleave', () => { state.hoverNode = null; drawStructureNow(); });
structureSvg.addEventListener('click', (e) => {
  const ex = e.target && e.target.dataset ? e.target.dataset.export : null;
  if (ex) { exportAs(ex); return; }
  const id = e.target && e.target.dataset ? e.target.dataset.id : null;
  if (id) restore(lineage.jump(id));
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

// In the loop a hold grabs the monitor's knobs instead, two at a time: drag sideways for the first,
// up and down for the second, scroll for the next pair. One pixel turns a knob by its range / 600.
const KNOBS = [
  [['loopGain', 0.9, 1.1], ['loopHue', -0.3, 0.3]],
  [['loopContrast', 0.6, 1.6], ['loopBlur', 0, 3]],
  [['loopSaturation', 0.6, 1.4], ['loopDecay', 0.85, 1.0]],
  [['loopNoise', 0, 2], ['loopField', 0, 0.5]],
];

function knobGrab(x, y) {
  grab = { knobs: true, x, y, x0: x, y0: y, k: 0, v0: KNOBS[0].map(([key]) => state.look[key]), text0: state.text, look0: { ...state.look } };
  drawKnobsNow();
  return true;
}
function drawKnobsNow() {
  drawKnobs(overlay, { at: [grab.x, grab.y], knobs: KNOBS[grab.k].map(([key, min, max]) => ({ value: state.look[key], min, max })) });
}
function turnKnobs(x, y) {
  KNOBS[grab.k].forEach(([key, min, max], i) => {
    const d = i ? -(y - grab.y0) : x - grab.x0;
    state.look[key] = Math.max(min, Math.min(max, grab.v0[i] + (d * (max - min)) / 600));
  });
  drawKnobsNow();
}
function nextKnobs(step, x, y) {
  grab.k = (grab.k + step + KNOBS.length) % KNOBS.length;
  grab.v0 = KNOBS[grab.k].map(([key]) => state.look[key]);
  grab.x0 = x; grab.y0 = y;
  drawKnobsNow();
}

// press: the hold that asked for this grab; if it was released while sensing ran, there is no grab
async function enterGrab(x, y, press = null) {
  if (state.mode === 'loop') return knobGrab(x, y);
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
  if (grab.knobs) { drawKnobsNow(); return; }
  const att = grab.ranked[grab.k];
  const f = normalize(state.formula);
  const o = f.slots.flat()[att.oi];
  att.value = o.p[att.key];
  const b = basis(state.cam);
  const C = makeCamera(state.cam, b, Math.tan((state.look.fovDeg * Math.PI) / 360), innerWidth, innerHeight);
  const orbit = iterate(f, grab.hit, f.c || lift(f, grab.hit));
  drawGrab(overlay, C, {
    screen: [grab.x, grab.y], hit: grab.hit, t: grab.t,
    attention: { op: att.op, key: att.key, value: att.value, glyph: getOp(att.op).glyph },
    params: o.p, ring: grab.ring, lyap: grab.lyap,
    // the orbit lives in 4-D: drawn where each iterate sits along the slice's axes
    orbit: { points: orbit.points.map((x4) => project(f.slice || {}, x4).x), branches: orbit.branches },
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
  if (!grab || grab.knobs || lens) return false;
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
  if (grab.knobs && revert) Object.assign(state.look, grab.look0);
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
  stopReplay();
  try { canvas.setPointerCapture(e.pointerId); } catch { /* a pointer the browser does not track */ }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    drag = { x: e.clientX, y: e.clientY };
    const h = { x: e.clientX, y: e.clientY };
    h.timer = setTimeout(() => { if (hold === h) enterGrab(h.x, h.y, h).then((ok) => { if (ok) drag = null; }); }, HOLD_MS);
    // still longer: the breed ring (pull and push; the loop's hold is its knobs)
    h.ringTimer = setTimeout(() => {
      if (hold === h && state.mode !== 'loop' && !(grab && grab.moved)) { drag = null; openRing(h.x, h.y); }
    }, RING_MS);
    hold = h;
    document.body.classList.add('grab');
  } else if (hold) { clearTimeout(hold.timer); clearTimeout(hold.ringTimer); hold = null; }
});
canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  if (ring) { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); pointRing(e.clientX, e.clientY); return; }
  if (lens) { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); moveLens(e.clientX, e.clientY); return; }
  if (grab && grab.knobs) { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); turnKnobs(e.clientX, e.clientY); return; }
  if (grab) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (Math.abs(e.clientX - grab.x0) > HOLD_SLOP) grab.moved = true;
    editGrab(e.clientX);
    return;
  }
  // still deciding: a press that becomes a grab must not turn the camera meanwhile
  if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) <= HOLD_SLOP) { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); return; }
  if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > HOLD_SLOP) { clearTimeout(hold.timer); clearTimeout(hold.ringTimer); hold = null; }
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
  if (e.altKey) { sliceDrag(e.clientX - drag.x, e.clientY - drag.y); drag = { x: e.clientX, y: e.clientY }; return; }
  if (state.mode === 'loop') {
    if (e.shiftKey) rollLoop((e.clientX - drag.x) * 0.006); else panLoop(e.clientX - drag.x, e.clientY - drag.y);
    drag = { x: e.clientX, y: e.clientY };
    touched();
    return;
  }
  const k = (state.look.fovDeg / 70) * 0.0035;
  state.cam.yaw -= (e.clientX - drag.x) * k;
  state.cam.pitch = Math.max(-1.5, Math.min(1.5, state.cam.pitch - (e.clientY - drag.y) * k));
  drag = { x: e.clientX, y: e.clientY };
  touched();
});
// ---------- the slice: where the 3-D world cuts the 4-D orbit space --------------------------------
// Option + wheel moves the cut along w; Option + drag tilts it toward w in the plane of the camera's
// right (sideways) or up (vertical) direction. The camera stays put; the object turns through it.
let sliceMoved = false;
function sliceBy(dw, tiltDeg) {
  const sl = state.formula.slice || {}, t = [...(sl.tilt || [0, 0, 0])];
  if (tiltDeg) for (let i = 0; i < 3; i++) t[i] = +(t[i] + tiltDeg[i]).toFixed(3);
  const w = +((sl.w || 0) + dw).toPrecision(6);
  setFormula(format({ ...state.formula, slice: { w, tilt: t } }));
  sliceMoved = true;
}
function sliceDrag(dx, dy) {
  const { right, up } = basis(state.cam), k = 0.25;
  sliceBy(0, right.map((r, i) => r * dx * k - up[i] * dy * k));
}

const release = (e) => {
  pointers.delete(e.pointerId);
  if (pointers.size === 0) {
    drag = null;
    if (hold) { clearTimeout(hold.timer); clearTimeout(hold.ringTimer); hold = null; }
    closeRing(true);
    exitGrab();
    document.body.classList.remove('grab');
  }
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (ring) { const at = ring.at, sc = ring.scale * (e.deltaY > 0 ? 1.5 : 1 / 1.5); ring = null; openRing(at[0], at[1], sc); return; }
  if (grab && grab.knobs) { nextKnobs(e.deltaY > 0 ? 1 : -1, e.clientX, e.clientY); return; }
  if (grab) { passAttention(e.deltaY > 0 ? 1 : -1, e.clientX); return; }
  if (e.altKey) { sliceBy(Math.max(-4, Math.min(4, -e.deltaY / 100)) * 0.1 * Math.max(0.02, deAt(state.cam.pos)), null); return; }
  if (state.mode === 'loop') { zoomLoop(Math.exp(Math.max(-4, Math.min(4, e.deltaY / 100)) * 0.08)); touched(); return; }
  const { fwd } = basis(state.cam);
  const notches = Math.max(-4, Math.min(4, -e.deltaY / 100));
  moveBy(fwd, notches * 0.3 * deAt(state.cam.pos));
  touched();
}, { passive: false });

const keys = new Set();
const MODES = ['pull', 'push', 'loop'];
function toggleMode() {
  if (!P) return;
  const next = MODES[(MODES.indexOf(state.mode) + 1) % MODES.length];
  if (next === 'loop' && !LP) { state.mode = 'pull'; }
  else if (next === 'loop') {
    // the loop starts from the field just seen, through a window placed where the view was focused
    state.mode = 'loop'; state.loopSeed = 2; placeLoopWindow();
  } else flowTo(next);
  touched();
  writeHash();
  remember();
}
canvas.addEventListener('dblclick', toggleMode);

addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && ring) { closeRing(false); return; }
  if (e.code === 'Escape' && grab) { exitGrab(true); return; }
  if (e.code === 'KeyR' && !e.repeat && !grab && !ring) { replay(); return; }
  stopReplay();
  if (e.code === 'KeyF' && grab && !e.repeat) { togglePin(); return; }
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && grab && !grab.knobs && !e.repeat) { openLens(); return; }
  if (e.code === 'KeyS' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); exportAs('still'); return; }
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
  if ((e.code === 'AltLeft' || e.code === 'AltRight') && sliceMoved) { sliceMoved = false; writeHash(); remember(); }
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
  herd(dt);
  if (state.mode === 'loop') { if (state.loopWin) rollLoop(dt * 0.03); return true; }
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

// Herding: each unpinned parameter does an Ornstein–Uhlenbeck walk about its home value, its noise in
// pixels per √s divided by the parameter's metric — so every parameter wanders the same few pixels on
// screen (σ/√(2κ) ≈ 8 px), calm or chaotic. Needs the metric of a sensing pass; until then it waits.
const HERD_PX = 6, HERD_K = 0.3;
let gauss = null;
const randn = () => {
  if (gauss !== null) { const g = gauss; gauss = null; return g; }
  const u = Math.random() || 1e-9, v = Math.random(), r = Math.sqrt(-2 * Math.log(u));
  gauss = r * Math.sin(2 * Math.PI * v);
  return r * Math.cos(2 * Math.PI * v);
};
const pinned = () => new Set(state.pins.flatMap((p) => p.keys));

function herd(dt) {
  const m = state.sensed && state.sensed.params;
  if (!m || !m.length) return;
  let f = normalize(state.formula);
  if (!state.home) state.home = Object.fromEntries(m.map((p) => [p.oi + '.' + p.key, f.slots.flat()[p.oi].p[p.key]]));
  const pins = pinned();
  let changed = false;
  for (const p of m) {
    const id = p.oi + '.' + p.key;
    if (pins.has(id) || !(p.pxPerUnit > 0) || state.home[id] === undefined) continue;
    const q = getOp(p.op).params.find((r) => r.k === p.key);
    const v = f.slots.flat()[p.oi].p[p.key];
    let nv = v - HERD_K * (v - state.home[id]) * dt + (HERD_PX / p.pxPerUnit) * Math.sqrt(dt) * randn();
    if (q.min !== undefined) nv = Math.max(q.min, nv);
    if (q.max !== undefined) nv = Math.min(q.max, nv);
    f = withParam(f, p.oi, p.key, +nv.toPrecision(7));
    changed = true;
  }
  if (changed) setFormula(format(f), true);
}

// a pin freezes the parameters that move the held region: those scoring at least a quarter of the top
function togglePin() {
  if (!grab || grab.knobs) return;
  const C = makeCamera(state.cam, basis(state.cam), Math.tan((state.look.fovDeg * Math.PI) / 360), innerWidth, innerHeight);
  const near = state.pins.findIndex((p) => { const q = C.project(p.x); return q && Math.hypot(q[0] - grab.x, q[1] - grab.y) < 30; });
  if (near >= 0) state.pins.splice(near, 1);
  else {
    const top = grab.ranked[0].score;
    state.pins.push({ x: [...grab.hit], keys: grab.ranked.filter((p) => p.score >= top / 4).map((p) => p.oi + '.' + p.key) });
  }
  drawStructureNow();
}

// ---------- URL -------------------------------------------------------------------------------------

function readHash() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (!h) return null;
  const [rest, modePart] = h.split('&m=');
  const [text, camPart] = rest.split('&c=');
  const out = { text, mode: MODES.includes(modePart) ? modePart : 'pull' };
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
      + (state.mode !== 'pull' ? '&m=' + state.mode : '');
    history.replaceState(null, '', h);
  }, 600);
}

// ---------- main loop -------------------------------------------------------------------------------

let R = null, P = null, S = null, LP = null;

function setFormula(text, quiet = false) {
  const f = parse(text);
  const v = validate(f);
  if (!v.ok) throw new Error(v.errors.join('; '));
  const structure = (g) => g && JSON.stringify([g.slots.map((sl) => sl.map((o) => o.op)), g.schedule, g.iters, g.c || null]);
  const same = structure(normalize(f)) === structure(state.formula && normalize(state.formula));
  state.formula = f;
  state.text = format(f);
  if (R) R.setFormula(f);
  // walkers stay on a slowly changing attractor; a new structure scatters them
  if (P && !same) P.resetWalkers();
  if (quiet) { state.n = 0; state.dirty = true; } else { touched(); state.home = null; }
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
  if (busy || !R || state.exporting) return false;
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  state.frame++;

  sizeCanvas();
  if (!canvas.width || !canvas.height) return false; // a page with no size has no swapchain
  const interacting = !!drag || keys.size > 0 || now - state.lastInput < 150;
  flyKeys(dt);
  advanceTransition(now);
  const drifting = !state.trans && drift(dt);
  const moving = interacting || drifting || !!state.trans;
  // a flow renders in the loop engine whatever mode it is heading for
  const mode = state.trans && state.trans.kind === 'flow' ? 'loop' : state.mode;
  govern(moving);

  if (!P || (state.mode === 'loop' && !LP)) state.mode = 'pull';
  const E = mode === 'push' ? P : mode === 'loop' ? LP : R;
  if (E.resize(canvas.width * state.scale, canvas.height * state.scale)) state.n = 0;
  if (!moving && state.n >= state.maxSamples && mode !== 'loop') return false;

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
  if (mode === 'push') {
    pushFrame(b, clear, moving, drifting && !interacting);
  } else if (mode === 'loop') {
    loopFrame(b);
  } else R.frame(pullView(b, clear, blend, moving));
  if (!moving && !state.trans && mode === 'pull' && R.compileJit) R.compileJit(state.formula).catch((e) => console.warn(e.message));
  if (!moving && state.senseDue && S) { state.senseDue = false; senseNow(); }
  else if (!interacting && mode === 'pull' && state.sensed && !state.senseDue) growArchive();
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
function pushFrame(b, clear, moving, drifting) { P.frame(pushView(b, clear, moving, drifting), canvas); }
function pushView(b, clear, moving, drifting) {
  const L = state.look;
  const th = Math.tan((L.fovDeg * Math.PI) / 360);
  const [, ih] = P.size;
  const focus = Math.max(state.focus, 1e-4);
  // the constant: the formula's own, or the point the camera looks at, carried into 4-D by the slice
  const c = state.formula.c || lift(state.formula, add(state.cam.pos, b.fwd, focus));
  return {
    pos: state.cam.pos, tanHalfFov: th, right: b.right, aperture: L.aperture * focus,
    up: b.up, focus, fwd: b.fwd, near: 1e-4,
    frame: state.frame, steps: moving ? L.pushSteps : L.pushSteps * 2,
    c, eps: (focus * 2 * th) / ih * 0.7, slab: L.pushSlab,
    hue: L.hue, iridescence: L.iridescence, spread: L.spread, maxRadius: moving ? L.splatMax * 0.6 : L.splatMax,
    key: L.key, fog: L.fog / Math.max(clear * 8, 1e-4), burn: 24, seed: state.formula.seed, spawn: 1,
    decay: state.n === 0 ? 0 : drifting ? 0.85 : 1,
    gain: L.pushGain, exposure: L.pushExposure,
  };
}

// Loop: the formula's forward map as the optics of a feedback loop (gpu/loop.js). It never converges —
// it is alive — so it renders every frame, still or not.
function placeLoopWindow() {
  const b = basis(state.cam);
  const th = Math.tan((state.look.fovDeg * Math.PI) / 360);
  const focus = Math.max(state.focus, 1e-3);
  state.loopWin = { o: add(state.cam.pos, b.fwd, focus), e1: [...b.right], e2: [...b.up], n: [...b.fwd], hh: focus * th };
}

function panLoop(dx, dy) {
  const w = state.loopWin, k = (2 * w.hh) / innerHeight;
  w.o = add(add(w.o, w.e1, -dx * k), w.e2, dy * k);
}
function zoomLoop(f) { state.loopWin.hh *= f; }
function rollLoop(a) {
  const w = state.loopWin, c = Math.cos(a), s = Math.sin(a);
  const e1 = [0, 1, 2].map((i) => c * w.e1[i] + s * w.e2[i]);
  const e2 = [0, 1, 2].map((i) => -s * w.e1[i] + c * w.e2[i]);
  w.e1 = e1; w.e2 = e2;
}

function loopFrame(b) {
  const L = state.look;
  const f = normalize(state.formula);
  const slots = [...new Set([...f.schedule].map((ch) => 'ABCD'.indexOf(ch)))].slice(0, 2);
  const seeding = state.loopSeed > 0;
  if (seeding) state.loopSeed--;
  if (!state.loopWin) placeLoopWindow();
  const w = state.loopWin;
  LP.frame({
    o: w.o, e1: w.e1, e2: w.e2, n: w.n, hh: w.hh, aspect: canvas.width / canvas.height, slots,
    hue: L.loopHue, saturation: L.loopSaturation, gain: L.loopGain, contrast: L.loopContrast, pivot: L.loopPivot,
    decay: L.loopDecay, blur: L.loopBlur, noise: L.loopNoise, frame: state.frame,
    field: seeding || L.loopField > 0 ? R.accumView() : null, fieldSeed: seeding ? 1 : L.loopField, key: L.key,
  }, canvas);
}

// ---------- breeding: the archive and the ring -------------------------------------------------------
// The archive fills in the background while the hand is still: a parent (an elite, or the formula on
// screen), a step of 30–220 px by the metric, a small sensing pass of the candidate for its features.
// It belongs to one structure and roughly one view (the camera to a quarter unit and a fifth of a radian):
// a new structure or a flight elsewhere starts it over; drift does not.

const archive = createArchive({ bins: 8 });
const SMALL = gridUVs(16, 10);
let archiveBusy = false, lastArchive = 0;
const viewKey = () => structureOf(normalize(state.formula)) + '|' + state.cam.pos.map((v) => Math.round(v * 4)).join(',') + ',' + Math.round(state.cam.yaw * 5) + ',' + Math.round(state.cam.pitch * 5);
const rnd = () => Math.random();

async function growArchive() {
  if (archiveBusy || !S || !state.sensed || grab || state.trans) return;
  const now = performance.now();
  if (now - lastArchive < 150) return;
  lastArchive = now;
  archiveBusy = true;
  try {
    const key = viewKey();
    if (archive.structure !== key) archive.reset(key, state.sensed.lyap);
    const elites = archive.elites();
    const parent = elites.length && rnd() < 0.6 ? normalize(parse(elites[Math.floor(rnd() * elites.length)].text)) : state.formula;
    const cand = mutate(parent, state.sensed.params, pinned(), 30 + rnd() * 190, rnd);
    const r = await S.sense(cand, senseView(), innerHeight, SMALL, true);
    if (r && archive.structure === key) archive.offer({ text: format(cand), features: features(r) });
  } finally { archiveBusy = false; }
}

const RING_MS = 1200, LOCAL_D = [35, 60, 90, 130], FAR_D = [170, 230, 300, 380];
let ring = null;

function thumbView(b) {
  const L = state.look;
  const clear = Math.max(deAt(state.cam.pos), 1e-5);
  const lamp = [0, 1, 2].map((i) => state.cam.pos[i] + (b.right[i] * L.lamp[0] + b.up[i] * L.lamp[1] + b.fwd[i] * L.lamp[2]) * clear);
  return {
    pos: state.cam.pos, tanHalfFov: Math.tan((L.fovDeg * Math.PI) / 360), right: b.right, aperture: 0, up: b.up,
    focus: Math.max(state.focus, 1e-4), fwd: b.fwd, blend: 1, light: lamp, glow: L.glow, lampRange: L.lampRange * clear,
    lampPower: L.lampPower, hue: L.hue, fog: L.fog / Math.max(clear * 8, 1e-4), exposure: L.exposure, terrace: L.terrace,
    stepScale: L.stepScale, maxDist: L.maxDist, epsScale: L.epsScale, frame: 0, key: L.key, ambient: L.ambient,
    maxSteps: 160, glowWidth: L.glowWidth, iridescence: L.iridescence, spread: L.spread, shadowK: L.shadowK, quality: 0,
  };
}

async function openRing(x, y, scale = 1) {
  if (!S || !state.sensed || !R) return false;
  exitGrab();
  const metric = state.sensed.params;
  const pins = pinned();
  const f0 = normalize(state.formula);
  const here = await S.sense(f0, senseView(), innerHeight, SMALL, true).catch(() => null);
  const ft0 = here ? features(here) : { density: 0.5, chaos: state.sensed.lyap.median };
  const locals = LOCAL_D.map((D) => ({ f: mutate(f0, metric, pins, D * scale, rnd), local: true }));
  const fromArchive = spread(archive.elites(), ft0, 4).map((e) => ({ f: normalize(parse(e.text)), local: false, features: e.features }));
  const fars = FAR_D.slice(fromArchive.length).map((D) => ({ f: mutate(f0, metric, pins, D * scale, rnd), local: false }));
  const items = [...locals, ...fromArchive, ...fars].slice(0, 8);
  ring = { at: [x, y], items, sel: -1, scale };
  // features for the angle, then the layout: the cyclic order of feature directions, evenly spaced
  for (const it of items) {
    if (!it.features) { const r = await S.sense(it.f, senseView(), innerHeight, SMALL, true).catch(() => null); it.features = r ? features(r) : ft0; }
    it.D = distancePx(f0, it.f, metric);
    it.dir = Math.atan2(it.features.chaos - ft0.chaos, (it.features.density - ft0.density) * 4) || Math.random() * 6.28;
    it.len = 110 + 110 * Math.tanh(it.D / 160);
  }
  if (!ring) return false;
  const order = items.map((it, i) => i).sort((a, b) => items[a].dir - items[b].dir);
  const base = items[order[0]].dir;
  order.forEach((i, k) => { items[i].angle = base + (k / items.length) * Math.PI * 2; });
  drawRingNow();
  const b = basis(state.cam);
  for (const it of items) {
    if (!ring) return true;
    it.thumb = await R.renderThumb(it.f, thumbView(b), 168, 112, 6).catch(() => null);
    drawRingNow();
  }
  return true;
}

function drawRingNow() { if (ring) drawRing(overlay, { at: ring.at, items: ring.items.filter((it) => it.angle !== undefined), sel: ring.sel }); }

function pointRing(x, y) {
  const [cx, cy] = ring.at;
  if (Math.hypot(x - cx, y - cy) < 40) ring.sel = -1;
  else {
    const a = Math.atan2(y - cy, x - cx);
    let best = -1, bd = 9;
    ring.items.forEach((it, i) => { if (it.angle === undefined) return; const d = Math.abs(Math.atan2(Math.sin(a - it.angle), Math.cos(a - it.angle))); if (d < bd) { bd = d; best = i; } });
    ring.sel = best;
  }
  drawRingNow();
}

function closeRing(choose) {
  if (!ring) return;
  const pick = choose && ring.sel >= 0 ? ring.items[ring.sel] : null;
  ring = null;
  clearGrab(overlay);
  if (pick) walkTo(format(pick.f));
}

// replay the lineage from its root to the current node, each step a walk (or a flow across structures)
// along the existing nodes — nothing is committed; any input stops it where it is
let replayToken = 0;
function replay() {
  const path = [];
  for (let n = lineage.byId(lineage.cur); n; n = n.parent != null ? lineage.byId(n.parent) : null) path.unshift(n);
  if (path.length < 2) return;
  const token = ++replayToken;
  let i = 0;
  lineage.jump(path[0].id);
  setFormula(path[0].text);
  const next = () => {
    if (token !== replayToken) return;
    i++;
    if (i < path.length) { lineage.jump(path[i].id); walkTo(path[i].text, next, false); } else drawStructureNow();
  };
  next();
}
const stopReplay = () => { if (replayToken) { replayToken++; if (state.trans && state.trans.kind === 'walk' && !state.trans.commit) state.trans = null; } };

// the pull frame's view (also the still renderer's and the video's)
function pullView(b, clear, blend = 1, moving = false) {
  const L = state.look;
  const lamp = [0, 1, 2].map((i) => state.cam.pos[i] + (b.right[i] * L.lamp[0] + b.up[i] * L.lamp[1] + b.fwd[i] * L.lamp[2]) * clear);
  return {
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
    lyapCentre: state.sensed ? state.sensed.lyap.median : 0.9,
    lyapScale: state.sensed ? 1 / Math.max((state.sensed.lyap.p90 - state.sensed.lyap.p10) / 2, 0.05) : 2,
  };
}

// ---------- exports ---------------------------------------------------------------------------------
// The live view pauses while one runs; the hairline at the bottom of the Tab layer shows how far it is.

function download(blob, name) {
  window.__fe.lastExport = { blob, name };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
const baseName = () => 'fractal-' + hash(state.formula);
const progress = (p) => { if (state.exporting) { state.exporting.progress = p; drawStructureNow(); } };
const stillSize = (long) => (canvas.width >= canvas.height ? [long, Math.round((long * canvas.height) / canvas.width)] : [Math.round((long * canvas.width) / canvas.height), long]);

// where: for the video, 'auto' (a folder or a ZIP the user picks) or 'opfs' (browser storage; tests)
// maxFrames: for the video, stop after this many frames (tests)
async function exportAs(kind, where = 'auto', maxFrames = Infinity) {
  if (state.exporting || !R) return null;
  state.exporting = { kind, progress: 0 };
  drawStructureNow();
  const snapshot = { text: state.text, mode: state.mode, cam: JSON.parse(JSON.stringify(state.cam)) };
  try {
    const b = basis(state.cam), clear = Math.max(deAt(state.cam.pos), 1e-5);
    if (kind === 'still') {
      await R.compileJit(state.formula).catch(() => {});
      const [W, H] = stillSize(3840);
      const img = await R.renderStill(pullView(b, clear), W, H, { tile: 512, samples: 64, onProgress: progress });
      const blob = await img.convertToBlob({ type: 'image/png' });
      download(blob, `${baseName()}-${W}x${H}.png`);
      return { W, H, bytes: blob.size, jit: R.jitReady };
    }
    if (kind === 'video') return await exportVideo(b, clear, where, maxFrames);
    if (kind === 'splats') {
      if (!P) throw new Error('no push engine');
      // the push engine may never have run (pull mode): give it a histogram first
      P.resize(canvas.width * state.scale, canvas.height * state.scale);
      const v = pushView(b, clear, false, false);
      const raw = await P.captureSplats(v, canvas, 200000, progress);
      const L = state.look, len = Math.hypot(...L.key);
      const samples = raw.map((q) => {
        const film = [0, 0.33, 0.67].map((o) => 0.5 + 0.5 * Math.cos(2 * Math.PI * (o + q.col * L.spread + L.hue)));
        const rgb = L.key.map((k, i) => Math.min(1, k + (film[i] * len - k) * L.iridescence));
        return { p: q.p, cov: q.cov, rgb };
      });
      const blob = new Blob([splatsToPly(samples)], { type: 'application/octet-stream' });
      download(blob, `${baseName()}-splats.ply`);
      return { splats: samples.length, bytes: blob.size };
    }
    if (kind === 'mesh') {
      // the cube the camera sees at its focus distance, centred where it looks
      const focus = Math.max(state.focus, 1e-3), half = focus * Math.tan((state.look.fovDeg * Math.PI) / 360);
      const centre = add(state.cam.pos, b.fwd, focus);
      const lo = centre.map((x) => x - half), hi = centre.map((x) => x + half);
      const n = 128;
      progress(0.1);
      const field = await R.deGrid(lo, hi, n);
      progress(0.6);
      const step = (2 * half) / (n - 1);
      // the surface sits half a cell out from where the estimate reaches zero
      for (let i = 0; i < field.length; i++) field[i] -= step * 0.5;
      const mesh = surfaceNets(field, n, lo, [step, step, step]);
      progress(0.9);
      const blob = new Blob([toStl(mesh)], { type: 'model/stl' });
      download(blob, `${baseName()}-mesh.stl`);
      return { triangles: mesh.indices.length / 3, bytes: blob.size, half };
    }
    return null;
  } finally {
    // the export may have borrowed the formula and the mode; give them back
    if (state.text !== snapshot.text) setFormula(snapshot.text, true);
    if (R) R.setFormula(state.formula);
    state.mode = snapshot.mode;
    state.cam = snapshot.cam;
    state.exporting = null;
    state.n = 0;
    drawStructureNow();
  }
}

// The lineage from its root to here, walked at constant visual speed (WALK_PX_S) at 30 frames a second,
// rendered offline (16 samples a frame, 1920 px on the long side) into a PNG sequence — a folder or a
// streamed ZIP, the same files moshine exports for editing. A change of structure is a cut.
async function exportVideo(b, clear, where, maxFrames = Infinity) {
  const path = [];
  for (let n = lineage.byId(lineage.cur); n; n = n.parent != null ? lineage.byId(n.parent) : null) path.unshift(n);
  if (path.length < 2) throw new Error('the lineage has one formula: nothing to walk');
  const metric = state.sensed ? state.sensed.params : [];
  const frames = [];
  for (let i = 0; i < path.length; i++) {
    const to = normalize(parse(path[i].text));
    if (i === 0) { frames.push(to); continue; }
    const from = normalize(parse(path[i - 1].text));
    if (structureOf(from) !== structureOf(to) || !metric.length) { for (let k = 0; k < 15; k++) frames.push(to); continue; }
    const steps = Math.max(1, Math.round((distancePx(from, to, metric) / WALK_PX_S) * 30));
    for (let k = 1; k <= steps; k++) {
      const g = JSON.parse(JSON.stringify(to));
      g.slots.forEach((sl, si) => sl.forEach((o, j) => { for (const key of Object.keys(o.p)) o.p[key] = from.slots[si][j].p[key] + (to.slots[si][j].p[key] - from.slots[si][j].p[key]) * (k / steps); }));
      frames.push(g);
    }
  }
  // moshine's sequence target and frame sink, loaded only now: the engine does not depend on them
  const { openSequenceTarget, createFrameSink } = await import('../moshine/frames.js');
  if (frames.length > maxFrames) frames.length = maxFrames;
  const target = await openSequenceTarget(baseName() + '-walk', where);
  const sink = createFrameSink(target);
  const [W, H] = stillSize(1920);
  // every frame has new values but one structure: one structure JIT serves the whole walk
  await R.compileStructureJit(frames[0]).catch(() => {});
  try {
    for (let i = 0; i < frames.length; i++) {
      R.setFormula(frames[i]);
      state.formula = frames[i];
      const img = await R.renderStill(pullView(b, clear), W, H, { tile: 1024, samples: 16 });
      await sink.add(img);
      progress((i + 1) / frames.length);
    }
    await sink.finish();
  } catch (e) { await sink.cancel(); throw e; }
  return { frames: frames.length, W, H, target: target.name };
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
  pin: () => { togglePin(); return state.pins; },
  archive: () => ({ size: archive.size, elites: archive.elites().map((e) => ({ cell: e.cell, q: +e.features.quality.toFixed(3), d: +e.features.density.toFixed(2), l: +e.features.chaos.toFixed(3) })) }),
  growArchive: async (n = 20) => { for (let i = 0; i < n; i++) { lastArchive = 0; await growArchive(); } return archive.size; },
  ringOpen: (x, y) => openRing(x, y),
  ringPoint: (x, y) => { if (ring) pointRing(x, y); return ring && ring.sel; },
  ringClose: (choose = true) => closeRing(choose),
  ringItems: () => ring && ring.items.map((it) => ({ D: +(it.D || 0).toFixed(1), local: it.local, thumb: !!it.thumb, angle: it.angle && +it.angle.toFixed(2) })),
  replay: () => replay(),
  export: (kind, where, maxFrames) => exportAs(kind, where, maxFrames),
  get jitReady() { return R && R.jitReady; },
  get pipeline() { return R && R.pipelineKind; },
  stopReplay: () => stopReplay(),
  herd: (seconds, dt = 1 / 30) => { for (let t = 0; t < seconds; t += dt) herd(dt); return state.text; },
  transition: () => state.trans && { kind: state.trans.kind, then: state.trans.then },
  setMode(m) { state.mode = m; if (m === 'loop') { state.loopSeed = 2; placeLoopWindow(); } touched(); state.lastInput = -1e9; },
  loopWindow(o, hh) { placeLoopWindow(); if (o) state.loopWin.o = [...o]; if (hh) state.loopWin.hh = hh; touched(); return state.loopWin; },
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
  slice: (dw = 0, dx = 0, dy = 0) => { if (dw) sliceBy(dw, null); if (dx || dy) sliceDrag(dx, dy); sliceMoved = false; return state.formula.slice; },
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
  try { LP = await createLoop(R); } catch (e) { console.error(e); window.__fe.error = String(e.message || e); }
  R.device.lost.then((info) => { console.error('device lost', info.message); document.getElementById('nogpu').hidden = false; });
  remember();
  window.__fe.ready = true;
  requestAnimationFrame(tick);
}
start();
