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
//   a collage       drag a lineage dot (or a breed ring's neighbour, carried out past its thumbnail) onto the
//                   field, or hold a Metasurface site: its formula joins what is on screen as a piece. Click a
//                   surface: its piece is picked and its frame drawn (an axis moves it, the ring turns it, the
//                   corner scales it, shift snaps); G: the collage's graph (pieces, joins, its shading, its
//                   drivers). The full list where the collage's section starts, below
//
//   touch           fingers reach all of it without keys, wheel or hover: the map is where the touch
//                   section starts, below (DESIGN.md "Touch")
//
// Every gesture is scaled by the distance estimate at the camera, so the same hand motion means the
// same visible change in a wide hall and a hairline crevice (principle 4: gesture scale = structure).

import { parse, format, validate, normalize, iterate, getOp, lift, de as cpuDe, parseCollage, validateCollage, prepare as prepareCollage, collageDE } from './core/index.js';
import { createRenderer } from './gpu/render.js';
import { createPush } from './gpu/push.js';
import { createSense } from './gpu/sense.js';
import { createLoop } from './gpu/loop.js';
import { makeCamera, drawGrab, clearGrab, drawLens, drawKnobs, drawRing } from './ui/overlay.js';
import { mutate, distancePx, features, createArchive, spread } from './core/breed.js';
import { gridUVs } from './gpu/sense.js';
import { project } from './core/vec.js';
import { surfaceNets, toStl, splatsToPly } from './core/export.js';
import { stateDoc, plyComments, readPlyState, pngWithState, readPngState } from './core/state.js';
import { evalShade, shadeTarget } from './core/shade.js';
import { hash } from './core/formula.js';
import { paramTangents } from './gpu/pack.js';
import { timeDriven, colourDrivers, evalDrive, PARAMS as DRIVE_PARAMS, TYPES as DRIVE_TYPES, getDriveParam, setDriveParam, splitTarget, opPaths } from './core/drive.js';
import * as DE from './core/drive-edit.js';
import { layoutDrive, placeDrive, drawDrive, driveNodeAt, driveOutPortAt, driveInPortAt, driveLinkAt, inLane, inTop, typeGlyph, driverGlyph } from './ui/drivegraph.js';
import { createLineage } from './ui/lineage.js';
import { drawStructure } from './ui/structure.js';
import { drawSurface, bandPath, SITE_R } from './ui/metasurface.js';
import { layout as graphLayout, place as graphPlace, between as graphBetween, drawGraph, nodeAt as graphNodeAt, edgeAt as graphEdgeAt, scheduleLayout } from './ui/graph.js';
import { stripPlacement, SHADE_GAP } from './ui/structure.js';
import { layoutShade, placeShade, drawShade, editorLayout, shadeNodeAt, shadeInPortAt, shadeOutPortAt, shadeLinkAt, inFrame, toSRGB, hsvToCss, RING_R } from './ui/shadegraph.js';
import * as SE from './core/shade-edit.js';
import { READINGS as SHADE_READINGS, RAMP_PRESETS, INTERPS, SPACES, MODES as MAP_MODES, MATH_OPS, MIX_MODES, rgb2hsv, hsv2rgb } from './core/shade.js';
import * as G from './core/graph.js';
import { glyphPath } from './ui/glyphs.js';
import { TOGGLES, toggleLayout, drawToggles } from './ui/toggles.js';
import { isCollage, isCollageText, normCollage, formatCollage, parseAny, formatAny, hashCollage, collageAt, toPiece, repFold, MAX_PIECES, KERNELS, JOIN_OPS, PLACE, REP, JOIN, collageTarget } from './core/collage.js';
import * as CE from './core/collage-edit.js';
import { collageStructure, lerpCollage, mutateCollage, collageDistancePx, metricId, metricValue, withMetric } from './core/collage-breed.js';
import { senseCollage } from './core/collage-sense.js';
import { carry } from './core/carry.js';
import { layoutCollage, placeCollage, drawCollage, joinGlyph, seamLine, pieceAt as collagePieceAt, joinAt as collageJoinAt, seamAt as collageSeamAt, outAt as collageOutAt } from './ui/collagegraph.js';
import { gizmoGeometry, gizmoHit, drawGizmo, eulerXYZ, axisAngle } from './ui/gizmo.js';
import { rotationXYZ, matMul } from './core/vec.js';
import { ORBIT as DRIVE_ORBIT } from './core/drive.js';
import { createSurface, formulaAt, weightsAt, strokeField, wallBands, hardWalls, BAND_LEVELS, layoutOf, isDefault, addSite, moveSite, removeSite, resetLayout, axesFromSensed, MAX_SITES } from './core/metasurface.js';

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

// A figure in the engine's paper (paper.html): the engine as it is, but nothing is stored — the lineage lives
// for the figure only, the Metasurface starts at its default layout, the URL is never written — and the site's
// menu stays shut. &view=D [&yaw= &pitch=] frames the origin at distance D; &win=H puts the loop's window
// on the origin, H high; &open= opens what the figure is about (structure, lyap, graph, shade, drive,
// surface, cgraph, a comma list)
const EMBED = new URLSearchParams(location.search).has('embed') ? new URLSearchParams(location.search) : null;
if (EMBED) document.documentElement.classList.add('embed');

const canvas = document.getElementById('field');
const state = {
  formula: null,        // the formula on screen — in a collage, the picked piece's (piece 0 when none is)
  text: '',             // the document's text: a formula's notation, or a collage's
  collage: null,        // the collage on screen (core/collage.js, normalised), or null for a formula
  pick: null,           // in a collage: the piece selected (its index), 'C' (the collage's own shading), or null
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

const lineage = createLineage({ store: !EMBED });
const structureSvg = document.getElementById('structure');

function remember() {
  // test code sets __fe.dry so its edits never land in the lineage (it is shared through localStorage)
  if (window.__fe && window.__fe.dry) return;
  const node = lineage.commit({ text: state.text, cam: { pos: [...state.cam.pos], yaw: state.cam.yaw, pitch: state.cam.pitch }, mode: state.mode });
  if (!node.thumb) state.thumbDue = node.id;
  drawStructureNow();
}

// Transitions never crossfade. Between formulas of the same structure the parameters and the camera
// move (350 ms, eased), so every frame between is a real fractal. Across structures or modes the old
// image flows through the new formula's map in the loop engine (380 ms), then the new mode takes over.
const MORPH_MS = 350, FLOW_MS = 380, WALK_PX_S = 150;
const structureOf = (g) => JSON.stringify([g.slots.map((sl) => sl.map((o) => o.op)), g.schedule, g.iters, g.c || null]);
const normDoc = (x) => (isCollage(x) ? normCollage(x) : normalize(x));

function restore(node) {
  if (!node) return;
  exitGrab();
  const mode = node.mode === 'push' && !P ? 'pull' : node.mode;
  const to = normDoc(parseAny(node.text));
  const cam = { pos: [...node.cam.pos], yaw: node.cam.yaw, pitch: node.cam.pitch };
  if (mode === state.mode && docStructure(to) === docStructure(doc())) {
    state.trans = { kind: 'morph', t0: performance.now(), dur: MORPH_MS, from: { f: normDoc(doc()), cam: JSON.parse(JSON.stringify(state.cam)) }, to: { f: to, cam } };
  } else {
    setDoc(node.text);
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
  const to = normDoc(parseAny(text));
  const from = normDoc(doc());
  if (docStructure(to) !== docStructure(from)) { setDoc(text); flowTo(state.mode); if (then) then(); return; }
  const m = state.sensed ? state.sensed.params : [];
  const D = m.length ? (isCollage(to) ? collageDistancePx(from, to, m) : distancePx(from, to, m)) : 100;
  const dur = Math.max(250, Math.min(3000, (D / WALK_PX_S) * 1000));
  state.trans = { kind: 'walk', t0: performance.now(), dur, from: { f: from, cam: JSON.parse(JSON.stringify(state.cam)) }, to: { f: to, cam: JSON.parse(JSON.stringify(state.cam)) }, then, commit };
}

function flowTo(mode) {
  // the flow runs through the formula's map in the loop engine: a collage has none, so it cuts
  if (!LP || state.collage) { state.mode = mode === 'loop' && state.collage ? 'pull' : mode; if (state.trans && state.trans.kind === 'flow') state.trans = null; return; }
  state.loopSeed = 1;
  placeLoopWindow();
  state.trans = { kind: 'flow', t0: performance.now(), dur: FLOW_MS, then: mode };
}

// The transition's own document writes are flagged: any other setDoc / setCollage while a morph or a walk
// runs is a new document, and it wins — the transition stops where it is (carryTo, core/carry.js)
let transWriting = false;
function advanceTransition(now) {
  const T = state.trans;
  if (!T) return;
  transWriting = true;
  try { stepTransition(T, now); } finally { transWriting = false; }
  if (!state.trans && T.done && T.then) T.then();
}
function stepTransition(T, now) {
  const s = Math.min(1, (now - T.t0) / T.dur);
  // a walk keeps a constant speed; a morph eases in and out
  const e = T.kind === 'walk' ? s : s * s * (3 - 2 * s);
  if (T.kind === 'morph' || T.kind === 'walk') {
    const a = T.from.f, b = T.to.f;
    // a collage walks piece by piece (core/collage-breed.js), a formula op by op
    if (isCollage(b)) setCollage(lerpCollage(a, b, e), true);
    else {
      const g = JSON.parse(JSON.stringify(b));
      g.slots.forEach((sl, i) => sl.forEach((o, j) => {
        for (const k of Object.keys(o.p)) o.p[k] = a.slots[i][j].p[k] + (b.slots[i][j].p[k] - a.slots[i][j].p[k]) * e;
      }));
      setDoc(format(g), true);
    }
    const c0 = T.from.cam, c1 = T.to.cam;
    state.cam = { pos: c0.pos.map((v, i) => v + (c1.pos[i] - v) * e), yaw: c0.yaw + (c1.yaw - c0.yaw) * e, pitch: c0.pitch + (c1.pitch - c0.pitch) * e };
    if (s >= 1) {
      setDoc(formatAny(b), true); state.cam = c1; state.trans = null; state.home = null;
      if (T.kind === 'walk' && T.commit) remember();
      if (T.kind === 'walk') writeHash();
      T.done = true;
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
  const b = basis(state.cam);
  let centre = add(state.cam.pos, b.fwd, Math.max(state.focus, 1e-4));
  // in a collage the ruler reads the piece that leads at the centre, at the point it reaches there
  let f = normalize(state.formula);
  if (shownCollage) {
    const pc = shownCollage.pieces[collageAt(shownCollage, centre).lead];
    f = pc.f; centre = repFold(pc.rep, toPiece(pc.place, centre));
  }
  const depth = iterate(f, centre, f.c || lift(f, centre)).n;
  drawStructure(structureSvg, {
    W: innerWidth, H: innerHeight, formula: f, depth, unfolded: !!gv || !!cv,
    strip: state.collage ? collageStrip() : null,
    attention: grab && !grab.knobs ? grab.ranked[grab.k].oi : null,
    lineage: lineage.layout(), hover: state.hoverNode,
    progress: state.exporting ? state.exporting.progress : null,
    keys: COARSE || touchSeen > 0 ? [{ k: 'lyap', on: state.look.lyapMix > 0 }, { k: 'replay' }, { k: 'surface', on: !!surf }, { k: 'drift', on: state.drift }] : null,
    step: state.sensed && state.sensed.step != null ? state.sensed.step : null,
    pins: (() => {
      const C = makeCamera(state.cam, b, Math.tan((state.look.fovDeg * Math.PI) / 360), innerWidth, innerHeight);
      return state.pins.map((p) => C.project(p.x)).filter(Boolean);
    })(),
  });
}

// a phone or tablet: the structure layer carries the row of keys (L, R, M, Space) from the start
const COARSE = matchMedia('(pointer: coarse)').matches;
let touchSeen = -1e9;   // when a finger last touched
let inputTouch = false; // the press under way is a finger's
function pressKey(k) {
  engage();
  if (k === 'lyap') { state.look.lyapMix = state.look.lyapMix > 0 ? 0 : 1; touched(); }
  else if (k === 'replay') replay();
  else if (k === 'surface') { if (surf) closeSurface(); else openSurface(); }
  else if (k === 'drift') { state.engaged = true; state.drift = !state.drift; touched(); }
  drawStructureNow();
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
  // the end of a lineage thumbnail's drag onto the field is not a click
  if (ldragDone) { ldragDone = false; return; }
  if (e.target && e.target.dataset && e.target.dataset.graph) { openGraph(); return; }
  const ex = e.target && e.target.dataset ? e.target.dataset.export : null;
  if (ex) { exportAs(ex); return; }
  const key = e.target && e.target.dataset ? e.target.dataset.key : null;
  if (key) { pressKey(key); return; }
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

// the collage on screen, prepared for the CPU (core/collage.js prepare), or null
let shownCollage = null;
const deAt = (p) => (shownCollage ? collageDE(shownCollage, p) : cpuDe(state.formula, p));
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

// ---------- the Metasurface (M): the sites as cells ---------------------------------------------------
// The surface lies over the dimmed field as hairlines (core/metasurface.js says what a point means).
// Drag: the formula follows the crosshair live, framed by the sites' views; release keeps it.
// Shift-drag draws a stroke played in time (a walk along it); Option-drag a stroke laid in space (its
// species ordered across the world along the stroke's own direction on screen). M or Esc closes.
// Hold still on open ground: the ring fills and the formula you had drops there as a site of its own.
// Drag a site's disc: it moves (the formula under the crosshair follows); off the square, yours is
// gone and a family goes home. A chimera's site is hard: its walls are cuts (core/metasurface.js). Double-click a corner mark: the families home. The layout (moved
// families, your sites with their thumbnails) is kept in this browser's localStorage.
// "Add a piece" (opened by the collage graph's plus or the collage toggle): the crosshair only points,
// and a tap — on a site or on open ground — adds the formula there to the field as a collage's piece
// instead of swapping the picked piece's formula (a plus rides the crosshair while it is so).
const SURF_KEY = 'fractal-engine.surface.v1';
const SURF_HOLD_MS = 450, SURF_OFF_PX = 24;
const SURF = createSurface(undefined, undefined, (() => {
  if (EMBED) return null;
  try { return JSON.parse(localStorage.getItem(SURF_KEY) || 'null'); } catch { return null; }
})());
let surf = null;       // { x, drag, moved, stroke: { pts, scr, kind }, press, site, bands, drift, add }
let surfAt = null;     // where the crosshair was last
let surfWalk = 0;      // the walk under way (a token: anything else stops it)
let surfCorner = 0;    // when a corner mark was last pressed (two within 350 ms: the families home)

function saveSurface() {
  // test code sets __fe.dry: the layout, like the lineage, is iori's
  if (EMBED || (window.__fe && window.__fe.dry)) return;
  try { localStorage.setItem(SURF_KEY, JSON.stringify(layoutOf(SURF))); } catch { /* full or blocked: this page only */ }
}

const surfFrame = () => { const L = Math.min(innerWidth, innerHeight) * 0.84; return { cx: innerWidth / 2, cy: innerHeight / 2, L }; };
const toScreen = (x) => { const F = surfFrame(); return [F.cx + (x[0] * F.L) / 2, F.cy - (x[1] * F.L) / 2]; };
const toSurface = (px, py) => {
  const F = surfFrame(), c = (v) => Math.max(-1, Math.min(1, v));
  return [c((px - F.cx) / (F.L / 2)), c(-(py - F.cy) / (F.L / 2))];
};
const offSquare = (px, py) => { const F = surfFrame(); return Math.max(Math.abs(px - F.cx), Math.abs(py - F.cy)) > F.L / 2 + SURF_OFF_PX; };
const siteGlyph = (s) => getOp((s.f.slots.flat().find((o) => o.op !== '+c' && o.op !== 'abs') || s.f.slots[0][0]).op).glyph;
const structureKey = (f) => normalize(f).slots[0].map((o) => o.op).join(' ');
// the site whose disc is under the pointer, nearest first
const siteHit = (px, py) => {
  let best = -1, bd = SITE_R;
  SURF.sites.forEach((s, j) => { const [x, y] = toScreen(s.at), d = Math.hypot(px - x, py - y); if (d <= bd) { bd = d; best = j; } });
  return best;
};
const cornerHit = (px, py) => { const F = surfFrame(); return Math.abs(Math.abs(px - F.cx) - F.L / 2) < 16 && Math.abs(Math.abs(py - F.cy) - F.L / 2) < 16; };

function openSurface(add = null) {
  if (surf) return;
  exitGrab();
  // the crosshair where we were, or on the site of the formula's own family
  const own = SURF.sites.find((s) => normalize(state.formula).slots.length === 1 && s.f.slots.length === 1 && s.f.slots[0].map((o) => o.op).join(' ') === structureKey(state.formula));
  surf = { x: surfAt || (own ? [...own.at] : [0, 0]), drag: false, moved: false, stroke: null, press: null, site: null, bands: null, drift: state.drift, add };
  state.drift = false;
  // on a touch screen the structure layer stays drawn under the square, but only its keys answer (on a
  // phone the strip lies under the square)
  if (COARSE || touchSeen > 0) structureSvg.classList.add('under');
  drawSurfaceNow();
  surfaceThumbs();
}

async function surfaceThumbs() {
  for (const s of SURF.sites) {
    if (s.thumb || !surf || !R) continue;
    const cam = { yaw: 0.55, pitch: 0.3 }, b = basis(cam), pos = b.fwd.map((v) => -v * s.view);
    s.thumb = await R.renderThumb(s.f, thumbView(b, pos, s.view * 0.35), 168, 112, 6).catch(() => null);
    if (s.user && s.thumb) saveSurface();
    drawSurfaceNow();
  }
}

function closeSurface() {
  if (!surf) return;
  surfWalk++;
  if (surf.press) clearTimeout(surf.press.timer);
  if (surf.site) clearTimeout(surf.site.timer);
  gizmoDue = true;
  state.drift = surf.drift;
  surf = null;
  structureSvg.classList.remove('under');
  drawStructureNow();
  clearGrab(overlay);
}

function drawSurfaceNow() {
  if (!surf) return;
  const F = surfFrame(), ws = weightsAt(SURF, surf.x);
  // the walls: contours of the leading weight, recomputed when a site moves (coarser while it does) or
  // the window does
  const n = surf.site && surf.site.moved ? 96 : 160, at = `${n} ${F.L} ${F.cx} ${F.cy}`;
  if (!surf.bands || surf.bands.at !== at) {
    surf.bands = { at, hard: bandPath(hardWalls(SURF), toScreen), list: wallBands(SURF, n).map((b) => ({ d: bandPath(b.segs, toScreen), opacity: 0.18 + 0.32 * (b.level - BAND_LEVELS[0]) / (BAND_LEVELS.at(-1) - BAND_LEVELS[0]) })) };
  }
  const held = surf.site;
  const p = surf.press;
  drawSurface(overlay, {
    w: innerWidth, h: innerHeight,
    bands: surf.bands.list, hard: surf.bands.hard,
    corners: { x0: F.cx - F.L / 2, y0: F.cy - F.L / 2, x1: F.cx + F.L / 2, y1: F.cy + F.L / 2, on: !isDefault(SURF) },
    sites: SURF.sites.map((s, j) => {
      let [x, y] = toScreen(s.at);
      const isHeld = held && held.j === j, off = isHeld && held.off;
      if (off) [x, y] = held.scr;
      return {
        x, y, thumb: s.thumb, glyph: siteGlyph(s), axes: (s.axes || []).map(() => (s.R * F.L) / 2 * 0.85), active: ws.some((e) => e.j === j),
        held: isHeld, off, home: off && !s.user ? toScreen(s.home) : null,
      };
    }),
    spokes: ws.map((e) => { const [x, y] = toScreen(SURF.sites[e.j].at); return { x, y, w: e.w }; }),
    cross: toScreen(surf.x), add: !!surf.add,
    stroke: surf.stroke && surf.stroke.scr, strokeKind: surf.stroke && surf.stroke.kind,
    ring: p && !p.full && !p.done && p.u > 0.08 ? { x: p.sx, y: p.sy, u: p.u } : held && !held.moved && held.u > 0.15 ? { x: toScreen(SURF.sites[held.j].at)[0], y: toScreen(SURF.sites[held.j].at)[1], u: held.u } : null,
  });
}

// the layout changed: the walls again, the store, the formula under the crosshair
function surfaceLayout(live) {
  surf.bands = null;
  if (!live) saveSurface();
  surfaceTo(surf.x);
}

// frame the origin from the current direction at the given distance
function frameAt(view) {
  const { fwd } = basis(state.cam);
  state.cam.pos = fwd.map((v) => -v * view);
  state.home = null;
}

function surfaceTo(x) {
  surf.x = x; surfAt = x;
  if (surf.add) { drawSurfaceNow(); return; }
  const r = formulaAt(SURF, x);
  // in a collage the crosshair swaps the picked piece's formula (the camera stays with the collage)
  setFormula(format(r.f), true);
  if (!state.collage) frameAt(r.view);
  touched();
  drawSurfaceNow();
}

// the formula you had becomes a site at x: its own thumbnail, its two most sensed parameters as axes
function dropSite(x) {
  const f = normalize(state.formula);
  const s = addSite(SURF, { f, view: Math.hypot(...state.cam.pos), axes: axesFromSensed(f, state.sensed && state.sensed.params), at: x });
  if (!s) return null;
  surf.x = [...s.at]; surfAt = surf.x;
  surf.bands = null;
  saveSurface();
  drawSurfaceNow();
  if (R) R.renderThumb(f, thumbView(basis(state.cam)), 168, 112, 6).then((url) => { if (url) { s.thumb = url; saveSurface(); drawSurfaceNow(); } }).catch(() => {});
  // no sensing pass of this formula yet: measure it now (the formula is still the one dropped)
  const text = state.text;
  if (!s.axes.length && S) senseNow().then((r) => {
    if (!r || state.text !== text || !SURF.sites.includes(s)) return;
    s.axes = axesFromSensed(f, r.params);
    saveSurface();
    drawSurfaceNow();
  }).catch(() => {});
  return s;
}

function surfDown(e) {
  surfWalk++;
  const x = toSurface(e.clientX, e.clientY);
  // fingers: the ones already down rest while the new one draws — one resting is Shift (a walk), two
  // are Option (a field). A finger carrying the crosshair or a site is not resting
  let kind = e.shiftKey || e.altKey ? (e.altKey ? 'field' : 'walk') : null;
  if (e.pointerType === 'touch') {
    const fs = surf.fingers || (surf.fingers = new Set());
    if (fs.size && (surf.drag || (surf.site && surf.site.moved) || (surf.stroke && surf.stroke.pts.length > 1))) { fs.add(e.pointerId); return; }
    if (fs.size) {
      if (surf.press) { clearTimeout(surf.press.timer); surf.press = null; }
      if (surf.site) { clearTimeout(surf.site.timer); surf.site = null; }
      kind = fs.size >= 2 ? 'field' : 'walk';
    }
    if (!fs.size) surf.lead = e.pointerId;
    fs.add(e.pointerId);
  }
  if (kind) {
    surf.stroke = { id: e.pointerId, pts: [x], scr: [[e.clientX, e.clientY]], kind };
    drawSurfaceNow();
    return;
  }
  if (cornerHit(e.clientX, e.clientY)) {
    const now = performance.now();
    if (now - surfCorner < 350) { surfCorner = 0; resetLayout(SURF); surfaceLayout(false); writeHash(); remember(); } else surfCorner = now;
    return;
  }
  const j = siteHit(e.clientX, e.clientY);
  if (j >= 0) {
    // a site: a click goes there, a drag moves it, a still hold adds its formula to the field as a
    // collage's piece (DESIGN.md "Collage (K)", K3) — the ring fills around it as the hold runs
    const h = surf.site = { j, sx: e.clientX, sy: e.clientY, scr: [e.clientX, e.clientY], moved: false, off: false, text0: state.text, t0: performance.now(), u: 0, done: false };
    const full = state.collage && state.collage.pieces.length >= MAX_PIECES;
    const tick = () => {
      if (!surf || surf.site !== h || h.moved) return;
      h.u = (performance.now() - h.t0) / SURF_HOLD_MS;
      if (h.u >= 1) { h.done = true; addFromSurface(SURF.sites[h.j].f, h.sx, h.sy); return; }
      drawSurfaceNow();
      h.timer = setTimeout(tick, 16);
    };
    if (!full) h.timer = setTimeout(tick, 16);
    drawSurfaceNow();
    return;
  }
  // open ground: a click moves the crosshair, a drag carries it, a still hold drops the formula there
  const p = { x, sx: e.clientX, sy: e.clientY, t0: performance.now(), u: 0, full: SURF.sites.length >= MAX_SITES, done: false };
  const tick = () => {
    if (!surf || surf.press !== p) return;
    p.u = (performance.now() - p.t0) / SURF_HOLD_MS;
    if (p.u >= 1 && !p.full) { p.done = true; dropSite(p.x); return; }
    drawSurfaceNow();
    if (!p.full) p.timer = setTimeout(tick, 16);
  };
  surf.press = p;
  if (!p.full) p.timer = setTimeout(tick, 16);
}

let surfLast = 0;
function surfMove(e) {
  // a resting finger (or one that came after the drawing began) does nothing
  if (surf.fingers && surf.fingers.size > 1 && (surf.stroke ? e.pointerId !== surf.stroke.id : true) && surf.lead !== e.pointerId) return;
  if (surf.stroke) {
    const scr = surf.stroke.scr.at(-1);
    if (Math.hypot(e.clientX - scr[0], e.clientY - scr[1]) < 3) return;
    surf.stroke.pts.push(toSurface(e.clientX, e.clientY));
    surf.stroke.scr.push([e.clientX, e.clientY]);
    drawSurfaceNow();
    return;
  }
  if (surf.site) {
    const h = surf.site;
    if (!h.moved && Math.hypot(e.clientX - h.sx, e.clientY - h.sy) < 4) return;
    h.moved = true;
    clearTimeout(h.timer);
    h.scr = [e.clientX, e.clientY];
    h.off = offSquare(e.clientX, e.clientY);
    const now = performance.now();
    if (now - surfLast < 30) { drawSurfaceNow(); return; }
    surfLast = now;
    if (!h.off) { moveSite(SURF, h.j, toSurface(e.clientX, e.clientY)); surfaceLayout(true); } else drawSurfaceNow();
    return;
  }
  if (surf.press) {
    const p = surf.press;
    if (p.done || Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 5) return;
    clearTimeout(p.timer);
    surf.press = null;
    surf.drag = true; surf.moved = true;
  }
  if (!surf.drag) return;
  // at most every 30 ms: each move repacks the formula
  const now = performance.now();
  if (now - surfLast < 30) return;
  surfLast = now;
  surfaceTo(toSurface(e.clientX, e.clientY));
}

function surfUp(e) {
  if (surf.fingers) {
    surf.fingers.delete(e.pointerId);
    if (surf.stroke ? e.pointerId !== surf.stroke.id : surf.lead !== e.pointerId) return;
  }
  if (surf.stroke) {
    const st = surf.stroke;
    surf.stroke = null;
    if (st.pts.length < 2) { drawSurfaceNow(); return; }
    if (st.kind === 'walk') walkSurface(st.pts); else layField(st.pts, st.scr);
    return;
  }
  if (surf.site) {
    const h = surf.site;
    surf.site = null;
    if (!h.moved && surf.add) { addFromSurface(SURF.sites[h.j].f); return; }
    if (!h.moved) surfaceTo([...SURF.sites[h.j].at]);
    else if (offSquare(e.clientX, e.clientY)) { removeSite(SURF, h.j); surfaceLayout(false); }
    else { moveSite(SURF, h.j, toSurface(e.clientX, e.clientY)); surfaceLayout(false); }
    if (state.text !== h.text0) { writeHash(); remember(); }
    return;
  }
  if (surf.press) {
    const p = surf.press;
    clearTimeout(p.timer);
    surf.press = null;
    if (p.done) { drawSurfaceNow(); return; }
    if (surf.add) { addFromSurface(formulaAt(SURF, p.x).f); return; }
    surfaceTo(p.x);
    writeHash();
    remember();
    return;
  }
  if (surf.drag) {
    if (surf.add) { addFromSurface(formulaAt(SURF, toSurface(e.clientX, e.clientY)).f); return; }
    surfaceTo(toSurface(e.clientX, e.clientY));
    surf.drag = false;
    writeHash();
    remember();
  }
}

// "add a piece": the formula becomes the collage's next piece where the view looks (the centre, or where
// a hold on its site was); opened from the collage graph, the graph comes back to show it there
function addFromSurface(f, sx = innerWidth / 2, sy = innerHeight / 2) {
  const back = surf && surf.add === 'graph';
  closeSurface();
  if (dropPiece(format(f), sx, sy) && back) openCollageGraph();
}

// a stroke played in time: the crosshair travels it at half the surface's width a second
function walkSurface(pts) {
  const token = ++surfWalk;
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = acc.at(-1), dur = Math.max(0.6, len / 0.5) * 1000, t0 = performance.now();
  const along = (u) => {
    const t = u * len;
    let i = 1;
    while (i < pts.length - 1 && acc[i] < t) i++;
    const r = Math.min(1, Math.max(0, (t - acc[i - 1]) / ((acc[i] - acc[i - 1]) || 1)));
    return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * r, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * r];
  };
  const tick = () => {
    if (token !== surfWalk || !surf) return;
    const u = Math.min(1, (performance.now() - t0) / dur);
    surfaceTo(along(u));
    if (u < 1) setTimeout(tick, 33);
    else { writeHash(); remember(); }
  };
  tick();
}

// a stroke laid in space: species along it, ordered across the visible world in the stroke's direction
function layField(pts, scr) {
  const b = basis(state.cam);
  const dx = scr.at(-1)[0] - scr[0][0], dy = scr.at(-1)[1] - scr[0][1];
  const n = [0, 1, 2].map((i) => b.right[i] * dx - b.up[i] * dy);
  const th = Math.tan((state.look.fovDeg * Math.PI) / 360), aspect = innerWidth / innerHeight;
  const view = strokeField(SURF, pts, n, 1).view;
  const r = strokeField(SURF, pts, n, 2 * th * view * aspect);
  closeSurface();
  setDoc(format(r.f));
  frameAt(r.view);
  writeHash();
  remember();
}

// ---------- the graph (G, or click the strip): the formula as a network, edited -----------------------
// The strip of the structure layer unfolds leftward into the same drawing at full size over the dimmed
// field (ui/graph.js). Hover a node: the field without it, as a thumbnail. Click: select it — its
// parameters as dimension lines to its left, dragged at the sensed metric. Drag a node: move it along
// its chain or into another. Delete removes it. Hold on an edge: the ring of ops, release on one to
// put it there (the mix glyph forks the chain). Hold on a field: the ring of fields and the plus of
// another species. Drag the count: the iterations. G or Esc folds it back.
let gv = null;   // { P, t0, from, hover, selected, press, drag, param, picker, thumbs, drift }
const GRAPH_UNFOLD_MS = 260, GRAPH_HOLD_MS = 300;
const PICK_OPS = ['translate', 'scale', 'rotate', 'rotate4', '+c', 'fold.plane', 'fold.box', 'fold.sphere', 'abs', 'sort', 'sort4',
  'bulb', 'bulb4', 'power', 'quat', 'invert', 'twist', 'spherical', 'swirl', 'sin', 'horseshoe', 'polar'];
const PICK_FIELDS = ['mix', 'mix.axis', 'mix.sphere', 'mix.noise', 'mix.tissue', 'mix.trap', 'mix.depth', 'mix.lyap', 'mix.blend'];

// the formula's network and, to its left in its own frame, the shading network, scaled together
function graphPlacement() {
  // the drivers' lane widens the repeat zone on its right (ui/drivegraph.js)
  // (either may be folded away by its toggle: the formula's network takes the room)
  const dvOn = driveShown(), shOn = shadeShown();
  const f = normalize(state.formula), L0 = graphLayout(G.tree(f)), D = layoutDrive(dvOn ? f.drive : null, L0), L = dvOn ? { ...L0, w: D.w, h: D.h } : L0, S = layoutShade(f.shade);
  const u = Math.min(64, (innerHeight - 260) / (Math.max(L.h, shOn ? S.h : 0) + 1), (innerWidth * 0.8) / (L.w + 0.9 + (shOn ? SHADE_GAP + S.w + 0.6 : 0)));
  const P = graphPlace(L, u, innerWidth - 50, innerHeight / 2 - 10);
  P.sh = placeShade(S, u, P.zone[0] - SHADE_GAP * u, P.zone[1], f.shade);
  P.dv = placeDrive(D, P);
  // the collage's own shading (pick 'C'): the proxy's op is not drawn, so it is not there to touch
  if (state.pick === 'C') { P.items = P.items.filter((q) => q.kind !== 'op'); P.edges = []; }
  return P;
}

function openGraph() {
  if (gv) return;
  // a collage's graph is its pieces and joins; a piece's own graph opens from there (drillInto)
  if (state.collage && !drilling) { openCollageGraph(); return; }
  exitGrab();
  const P = graphPlacement();
  // the collage's own shading (pick 'C') opens without unfolding: its proxy's op is not in the placement
  gview = { k: 1, tx: 0, ty: 0 }; gt = null; vtap = null;
  gv = { P, from: state.pick === 'C' ? null : stripPlacement(normalize(state.formula), innerWidth, innerHeight), t0: performance.now(), hover: null, selected: null, press: null, drag: null, param: null, picker: null, thumbs: new Map(), drift: state.drift };
  state.drift = false;
  drawStructureNow();
  if (!gv.from) drawGraphNow();
  const tick = () => { if (!gv || !gv.from) return; drawGraphNow(); if (performance.now() - gv.t0 < GRAPH_UNFOLD_MS) setTimeout(tick, 16); else { gv.from = null; drawGraphNow(); } };
  tick();
}

function closeGraph() {
  if (!gv) return;
  state.drift = gv.drift;
  const back = gv.back;
  gv = null;
  clearGrab(overlay);
  gizmoDue = true;
  drawStructureNow();
  // out of a piece's graph (or the collage's shading): back to the collage's graph
  if (back && state.collage) {
    if (state.pick === 'C') setPick(back.pick === 'C' ? null : back.pick);
    openCollageGraph();
  }
}

// after the formula changed: the new network, the selection kept where it still exists
function refreshGraph() {
  if (!gv) return;
  gv.P = graphPlacement();
  if (gv.selected && !gv.P.items.some((q) => q.id === gv.selected)) gv.selected = null;
  if (gv.shSel && !(gv.shSel === 'out' ? !gv.P.sh.empty : gv.P.sh.items.some((q) => q.id === gv.shSel))) { gv.shSel = null; gv.stopSel = null; }
  if (gv.dvSel && !gv.P.dv.byId.has(gv.dvSel)) gv.dvSel = null;
  if (gv.bandSel && !anyBindOf(gv.bandSel)) gv.bandSel = null;
  drawGraphNow();
}

// a node's parameters as dimension lines to its left: a tick where a bounded value sits in its range
function paramHandles(q) {
  const def = getOp(q.n.op), shown = def.params.filter((r) => !r.hidden);
  const g = Math.max(10, Math.min(26, gv.P.u * 0.5)), x2 = q.x - g - 22, x1 = x2 - 150;
  return shown.map((r, i) => {
    const v = q.n.p[r.k], y = q.y + (i - (shown.length - 1) / 2) * 15;
    const held = gv.param && gv.param.id === q.id && gv.param.key === r.k;
    const h = { key: r.k, x1, x2, y, v: held ? fmtValue(v) : '', value: v, held, q: r, to: `${q.id}.${r.k}` };
    // a bound parameter: its band (lo..hi) on the line, the values the orbit at the centre gives it
    const b = bindOf(h.to);
    if (b) {
      const M = gv.band && gv.band.to === h.to ? gv.band.M : bandMap(b, x1, x2), live = liveTrace().get(h.to);
      const clip = (x) => Math.max(x1, Math.min(x2, x));
      h.band = { x0: clip(M.x(b.lo)), x1: clip(M.x(b.hi)), sel: gv.bandSel === h.to, M, b };
      if (live && live.length) {
        h.band.live = [clip(M.x(Math.min(...live))), clip(M.x(Math.max(...live)))];
        h.band.tick = clip(M.x(live[0]));
      }
      h.held = !!(gv.band && gv.band.to === h.to);
      h.v = h.held ? `${fmtValue(+b.lo.toPrecision(4))} ${fmtValue(+b.hi.toPrecision(4))}` : '';
    }
    return h;
  });
}

// ---------- the drivers (DESIGN.md "Formula v2 — drivers"): the lane, bindings, bands -----------------
// A lane inside the repeat zone (orbit readings, maths, remaps) and a row on its top edge (the start,
// fields, the clock, another parameter). Hold the empty lane or row: the ring of driver types; hold an
// input dot, a link or a binding's hairline: the ring again, inserted there. Drag from a driver's output
// dot onto a selected op's dimension line: bound, the band the line's own range (±75 px at the metric);
// drag over an op on the way and its lines open. Drag a band's end: lo or hi; its middle: both; click
// it: selected (Delete unbinds). Pull a dimension line up or down off itself: a param node reading it.
// Click a driver: its parameters below the zone (lines; its switches as glyphs). Delete removes it.
const RING_TYPES = DRIVE_TYPES.filter((t) => t !== 'param');
const bindOf = (to) => { const d = normalize(state.formula).drive; return d ? d.bind.find((b) => b.to === to) || null : null; };
// a shading parameter's binding (core/shade.js shade.bind: Drivers → colour)
const shadeBindOf = (to) => { const s = normalize(state.formula).shade; return s && s.bind ? s.bind.find((b) => b.to === to) || null : null; };
const anyBindOf = (to) => bindOf(to) || shadeBindOf(to);
// a bound line's scale: the band takes its middle two thirds, so both ends can be dragged outward
function bandMap(b, x1, x2) {
  const c = (b.lo + b.hi) / 2, hr = Math.max(Math.abs(b.hi - b.lo) * 0.75, 1e-3 * Math.max(1, Math.abs(c))), xm = (x1 + x2) / 2, half = (x2 - x1) / 2;
  return { x: (v) => xm + ((v - c) / hr) * half, v: (x) => c + ((x - xm) / half) * hr };
}

// every binding's value at each iteration of the orbit from the centre of the view (the band's tick)
let liveCache = null;
function liveTrace() {
  const f = normalize(state.formula);
  if (!f.drive || !f.drive.bind.length) return new Map();
  // the centre's hit: the focus distance the renderer keeps (as the structure layer's ruler reads it)
  const key = JSON.stringify(state.cam) + state.focus;
  if (!liveCache || liveCache.key !== key) liveCache = { key, hit: state.focus > 0 ? add(state.cam.pos, basis(state.cam).fwd, state.focus) : null };
  if (!liveCache.hit) return new Map();
  const time = timeDriven(f) ? (performance.now() - clock0) / 1000 : 0;
  try { return new Map(DE.bindTrace(f, liveCache.hit, time, f.c || lift(f, liveCache.hit)).map((r) => [r.to, r.values])); } catch { return new Map(); }
}

// every shading binding's value at the centre's hit: the drivers' registers its orbit leaves
function liveShade() {
  const f = normalize(state.formula);
  if (!f.shade || !f.shade.bind || !f.drive || state.focus <= 0) return new Map();
  const hit = add(state.cam.pos, basis(state.cam).fwd, state.focus);
  const time = timeDriven(f) ? (performance.now() - clock0) / 1000 : 0;
  let o;
  try { o = iterate(f, hit, f.c || lift(f, hit), { time }); } catch { return new Map(); }
  if (!o.drv) return new Map();
  return new Map(f.shade.bind.map((b) => {
    const t = shadeTarget(f.shade, b.to);
    return [b.to, t ? Math.min(t.max, Math.max(t.min, b.lo + (o.drv.get(b.from) || 0) * (b.hi - b.lo))) : null];
  }));
}

// the selected driver's parameters, below the zone: its switches as one row of glyphs, then its numbers
// as dimension lines (a tick where a bounded one sits)
function driverHandles(q) {
  const spec = DRIVE_PARAMS[q.type] || {}, P = q.n.p;
  const x2 = Math.min(innerWidth - 24, q.x + 75), x1 = x2 - 150;
  let y = gv.P.zone[3] + 44;
  const out = [], sw = Object.entries(spec).filter(([, s]) => Array.isArray(s) || typeof s === 'boolean');
  sw.forEach(([key, s], i) => {
    const glyph = key === 'op' ? `math.${P.op}` : key === 'wave' ? `drv.wave.${P.wave}` : key === 'out' ? `drv.out.${P.out}` : `drv.${key}`;
    out.push({ key, glyph, gx: x1 + 8 + i * 28, y, off: typeof s === 'boolean' && !P[key], cycle: Array.isArray(s) ? s : null });
  });
  if (sw.length) y += 22;
  for (const [key, s] of Object.entries(spec)) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) continue;
    const held = gv.dvParam && gv.dvParam.id === q.id && gv.dvParam.key === key;
    const ranged = s.min !== undefined && s.max !== undefined && s.max - s.min < 1e4;
    out.push({ key, line: true, x1, x2, y, q: s, value: P[key], held, v: held ? fmtValue(P[key]) : '', tick: ranged ? x1 + ((P[key] - s.min) / (s.max - s.min)) * (x2 - x1) : null });
    y += 15;
  }
  return out;
}

// the bindings' far ends: a selected op's band, else the notch on the op's glyph
function bindEnds(P, handles, sel) {
  const f = normalize(state.formula), g = Math.max(10, Math.min(26, P.u * 0.5));
  return ((f.drive && f.drive.bind) || []).flatMap((b) => {
    const { path, key } = splitTarget(b.to);
    const h = sel && sel.id === path && handles.find((r) => r.key === key && r.band);
    const on = gv.bandSel === b.to || gv.dvSel === b.from;
    if (h) return [{ to: b.to, from: b.from, x2: (h.band.x0 + h.band.x1) / 2, y2: h.y, on }];
    const q = P.items.find((r) => r.id === path);
    return q ? [{ to: b.to, from: b.from, x2: q.x + g * 0.8, y2: q.y, on }] : [];
  });
}

function drawDriveNow(P, handles, sel) {
  if (!driveShown()) { gv.binds = []; return ''; }
  const V = P.dv, dsel = gv.dvSel && V.byId.get(gv.dvSel);
  gv.binds = [...bindEnds(P, handles, sel), ...shadeBindEnds(P)];
  return drawDrive(V, {
    hover: gv.dvHover, selected: gv.dvSel, link: gv.dvPress && gv.dvPress.link, drag: gv.dvDrag, binds: gv.binds,
    params: dsel ? driverHandles(dsel) : [],
  });
}

// a live change while a hand is down (quiet: no lineage); committed on release by shadeCommit
function driveLive(fn) { shadeLive(fn); }

function driveDown(x, y) {
  if (!driveShown()) return false;
  const V = gv.P.dv;
  const dsel = gv.dvSel && V.byId.get(gv.dvSel);
  if (dsel) {
    for (const h of driverHandles(dsel)) {
      if (h.glyph && Math.hypot(x - h.gx, y - h.y) < 11) {
        const v = h.cycle ? h.cycle[(h.cycle.indexOf(dsel.n.p[h.key]) + 1) % h.cycle.length] : !dsel.n.p[h.key];
        graphEdit(() => DE.setDriverParam(state.formula, dsel.id, h.key, v));
        return true;
      }
      if (h.line && x >= h.x1 - 6 && x <= h.x2 + 6 && Math.abs(y - h.y) < 7) {
        gv.dvParam = { id: dsel.id, key: h.key, x0: x, v0: dsel.n.p[h.key], q: h.q, text0: state.text };
        drawGraphNow();
        return true;
      }
    }
  }
  const from = driveOutPortAt(V, x, y);
  if (from) { const [x1, y1] = V.outPort(from); gv.dvDrag = { from: from.id, x1, y1, x2: x, y2: y }; drawGraphNow(); return true; }
  const node = driveNodeAt(V, x, y), port = node ? null : driveInPortAt(V, x, y), link = node || port ? null : driveLinkAt(V, x, y);
  if (!node && !port && !link) {
    // a binding's hairline is the formula's to test, after the selected op's lines (they end on them)
    if (driveLinkAt(V, x, y, gv.binds || []) || (!inLane(V, x, y) && !inTop(V, x, y))) return false;
  }
  drivePress(x, y, node, port, link);
  return true;
}

// a press in the drivers' part: a click selects, a hold opens the ring of driver types (inserted on the
// input, link or binding held, or free)
function drivePress(x, y, node, port, link) {
  const press = { x, y, node, port, link, moved: false };
  press.timer = setTimeout(() => {
    if (!gv || gv.dvPress !== press || press.moved || node) return;
    const at = port || (link ? (link.bind ? { bind: link.bind } : { node: link.to, port: link.port }) : null);
    gv.picker = { at: pickerAt(x, y), from: [x, y], items: RING_TYPES.map((t) => ({ glyph: typeGlyph(t), act: () => DE.addDriver(state.formula, t, at) })), sel: -1 };
    drawGraphNow();
  }, GRAPH_HOLD_MS);
  gv.dvPress = press;
  drawGraphNow();
}

function driveMove(x, y) {
  if (gv.dvParam) {
    const p = gv.dvParam, dx = x - p.x0;
    const v = p.q.discrete ? p.v0 + Math.round(dx / 14) : p.v0 + dx * 0.005 * Math.max(1, Math.abs(p.v0));
    driveLive(() => DE.setDriverParam(state.formula, p.id, p.key, p.q.discrete ? v : +v.toPrecision(5)));
    return true;
  }
  if (gv.band) {
    const B = gv.band, dv = B.M.v(x) - B.M.v(B.x0);
    if (Math.abs(x - B.x0) > 2) B.moved = true;
    const lo = B.end === 'hi' ? B.lo : B.lo + dv, hi = B.end === 'lo' ? B.hi : B.hi + dv;
    driveLive(() => (B.shade ? SE.setShadeBand : G.setBand)(state.formula, B.to, +lo.toPrecision(5), +hi.toPrecision(5)));
    return true;
  }
  if (gv.pull) { gv.pull.x = x; gv.pull.y = y; drawGraphNow(); return true; }
  if (gv.dvDrag) {
    gv.dvDrag.x2 = x; gv.dvDrag.y2 = y;
    // resting on an op on the way (a quarter second): its lines open, to drop on — passing over one
    // does not, so a drag across the chain keeps the lines it is heading for
    // (a shading node or the glow output the same way: its lines, or its ramp's editor, open)
    const q = graphNodeAt(gv.P, x, y), D = gv.dvDrag;
    const sq = !q && shadeShown() && !gv.P.sh.empty && inFrame(gv.P.sh, x, y) ? (shadeNodeAt(gv.P.sh, x, y) || (nearGlow(x, y) ? { id: 'out' } : null)) : null;
    const over = q && q.id !== gv.selected ? q.id : sq && sq.id !== gv.shSel ? 'sh:' + sq.id : null;
    if (over !== D.over) {
      D.over = over;
      clearTimeout(D.timer);
      if (over) D.timer = setTimeout(() => {
        if (!gv || gv.dvDrag !== D || D.over !== over) return;
        if (over.startsWith('sh:')) { gv.shSel = over.slice(3); gv.selected = null; gv.stopSel = null; } else { gv.selected = over; gv.shSel = null; }
        drawGraphNow();
      }, 250);
    }
    drawGraphNow();
    return true;
  }
  if (gv.dvPress && !gv.picker) {
    if (!gv.dvPress.moved && Math.hypot(x - gv.dvPress.x, y - gv.dvPress.y) > 6) { gv.dvPress.moved = true; clearTimeout(gv.dvPress.timer); }
    return true;
  }
  if (gv.picker && gv.dvPress) return false; // the ring is pointed by the formula code
  const q = driveNodeAt(gv.P.dv, x, y), id = q ? q.id : null;
  if (id !== gv.dvHover) { gv.dvHover = id; drawGraphNow(); }
  return false;
}

function driveUp(x, y) {
  if (gv.dvParam) { const p = gv.dvParam; gv.dvParam = null; if (state.text !== p.text0) shadeCommit(); else drawGraphNow(); return true; }
  if (gv.band) {
    const B = gv.band;
    gv.band = null;
    if (state.text !== B.text0) shadeCommit();
    else { if (!B.moved) gv.bandSel = gv.bandSel === B.to ? null : B.to; drawGraphNow(); }
    return true;
  }
  if (gv.pull) {
    const p = gv.pull, V = gv.P.dv, [zx0, zy0, zx1, zy1] = gv.P.zone;
    gv.pull = null;
    if ((x >= zx0 && x <= zx1 && y >= zy0 && y <= zy1) || inTop(V, x, y)) graphEdit(() => DE.addDriver(state.formula, 'param', null, { of: p.of }));
    else drawGraphNow();
    return true;
  }
  if (gv.dvDrag) {
    const d = gv.dvDrag;
    clearTimeout(d.timer);
    gv.dvDrag = null;
    const to = driveInPortAt(gv.P.dv, x, y);
    if (to) { graphEdit(() => DE.connectDriver(state.formula, d.from, to.node, to.port)); return true; }
    // into the shading: a number input reads the driver; a shading line or a stop is bound to it
    if (dropOnShade(d.from, x, y)) return true;
    // onto a dimension line of the selected op: bound over the line's own range (a bound one keeps its band)
    const sel = gv.selected && gv.P.items.find((q) => q.id === gv.selected);
    const h = sel && paramHandles(sel).find((r) => x >= r.x1 - 6 && x <= r.x2 + 6 && Math.abs(y - r.y) < 8);
    if (h) {
      const old = bindOf(h.to);
      const [lo, hi] = old ? [old.lo, old.hi] : DE.handleRange(h.value, perPxOf(sel, h.key), h.q);
      graphEdit(() => G.bind(state.formula, h.to, d.from, lo, hi));
      return true;
    }
    drawGraphNow();
    return true;
  }
  const pr = gv.dvPress;
  if (!pr) return false;
  clearTimeout(pr.timer);
  gv.dvPress = null;
  if (gv.picker) {
    const k = gv.picker;
    gv.picker = null;
    if (k.sel >= 0) {
      const t = RING_TYPES[k.sel], id = DE.nextDriverId(state.formula, t);
      if (graphEdit(k.items[k.sel].act)) { gv.dvSel = id; gv.selected = null; gv.shSel = null; drawGraphNow(); }
    } else drawGraphNow();
    return true;
  }
  if (!pr.moved) {
    if (pr.node) { gv.dvSel = gv.dvSel === pr.node.id ? null : pr.node.id; gv.bandSel = null; gv.shSel = null; }
    else if (pr.link && pr.link.bind) { gv.bandSel = gv.bandSel === pr.link.bind ? null : pr.link.bind; gv.dvSel = null; }
    else { gv.dvSel = null; gv.bandSel = null; }
  }
  drawGraphNow();
  return true;
}

// a parameter's pixels per unit as the hand moves it on its line (the sensed metric, or a guess)
function perPxOf(q, key) {
  const m = state.sensed && state.sensed.params.find((p) => p.oi === q.oi && p.key === key);
  return m && m.pxPerUnit > 0 ? 1 / m.pxPerUnit : 0.005 * Math.max(1, Math.abs(q.n.p[key]));
}
const fmtValue = (v) => (Number.isInteger(v) ? String(v) : Number(v.toPrecision(4)).toString());

function drawGraphNow() {
  if (!gv) return;
  const t = gv.from ? Math.min(1, (performance.now() - gv.t0) / GRAPH_UNFOLD_MS) : 1;
  const P = gv.from ? graphBetween(gv.from, gv.P, t) : gv.P;
  const sel = gv.selected && P.items.find((q) => q.id === gv.selected);
  const hv = gv.hover && gv.thumbs.get(gv.hover + '|' + state.text);
  const hq = gv.hover && P.items.find((q) => q.id === gv.hover);
  let svg = `<rect class="gv" x="0" y="0" width="${innerWidth}" height="${innerHeight}" style="opacity:${(0.55 * t).toFixed(2)}"/>`;
  const handles = sel && !gv.from ? paramHandles(sel) : [];
  // the collage's own shading (pick 'C'): the shading frame beside the collage's output, no formula
  const own = state.pick === 'C';
  if (own) {
    const [x0, y0, x1, y1] = P.zone;
    svg += `<g class="gr full"><path class="zn" d="M${x0} ${y0}H${x1}V${y1}H${x0}Z"/><g class="nd">${glyphPath('out.color', (x0 + x1) / 2, (y0 + y1) / 2, 22)}</g></g>`;
  } else svg += drawGraph(P, {
    driven: DE.drivenOps(normalize(state.formula)),
    full: true, hover: gv.hover, selected: gv.selected, schedSel: gv.schedSel ?? null, edge: gv.press && gv.press.edge && !gv.press.node ? gv.press.edge : gv.hoverEdge || null,
    plus: !gv.press && !gv.picker && gv.hoverEdge ? gv.hoverEdge : null,
    params: handles,
    thumb: hv && hq && !gv.drag && !gv.picker ? { x: hq.x - (sel && sel.id === hq.id ? 190 : 0), y: hq.y, href: hv } : null,
  });
  if (gv.drag) svg += `<g class="gr full"><g class="nd hv">${glyphPath(gv.drag.glyph, gv.drag.x, gv.drag.y, 26)}</g></g>`;
  if (!gv.from) svg += drawShadeNow(P);
  if (!gv.from) svg += drawDriveNow(P, handles, sel);
  if (gv.pull) svg += `<g class="gr full"><g class="nd hv">${glyphPath('drv.param', gv.pull.x, gv.pull.y, 22)}</g></g>`;
  if (gv.picker) svg += drawPicker(gv.picker);
  overlay.innerHTML = viewWrap(svg);
  overlay.classList.add('on');
}

const PICK_R = 96;
function drawPicker(k) {
  const [x, y] = k.at, R = PICK_R;
  // the ring is kept inside the screen; a hairline goes back to the edge it inserts on
  let s = `<g class="gr full pk">`;
  if (k.from && Math.hypot(k.from[0] - x, k.from[1] - y) > 30) {
    const a = Math.atan2(k.from[1] - y, k.from[0] - x);
    s += `<path d="M${(x + Math.cos(a) * 26).toFixed(1)} ${(y + Math.sin(a) * 26).toFixed(1)}L${k.from[0].toFixed(1)} ${k.from[1].toFixed(1)}"/><circle cx="${k.from[0].toFixed(1)}" cy="${k.from[1].toFixed(1)}" r="2"/>`;
  }
  s += `<circle cx="${x}" cy="${y}" r="26"/>`;
  k.items.forEach((it, i) => {
    const a = (i / k.items.length) * Math.PI * 2 - Math.PI / 2, gx = x + Math.cos(a) * R, gy = y + Math.sin(a) * R;
    it.angle = a;
    if (it.colours) {
      // a ramp preset: its colours along a short arc
      const r = i === k.sel ? 15 : 12;
      it.colours.forEach((c, j) => {
        const a0 = Math.PI * (0.75 + (j / it.colours.length) * 1.5), a1 = Math.PI * (0.75 + ((j + 1) / it.colours.length) * 1.5);
        s += `<path class="pa" style="stroke:${c}" d="M${(gx + Math.cos(a0) * r).toFixed(1)} ${(gy + Math.sin(a0) * r).toFixed(1)}A${r} ${r} 0 0 1 ${(gx + Math.cos(a1) * r).toFixed(1)} ${(gy + Math.sin(a1) * r).toFixed(1)}"/>`;
      });
    } else if (it.join) s += `<g class="nd${i === k.sel ? ' sel' : ''}"><path d="${joinGlyph(it.join, gx, gy, i === k.sel ? 26 : 20)}"/></g>`;
    else s += `<g class="nd${i === k.sel ? ' sel' : ''}">${glyphPath(it.glyph, gx, gy, i === k.sel ? 26 : 20)}</g>`;
    if (i === k.sel) s += `<circle cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="18"/>`;
  });
  return s + '</g>';
}

// the ring's centre: the press, moved in so the whole ring is on screen
const pickerAt = (x, y) => {
  const m = PICK_R + 28;
  return [Math.max(m, Math.min(innerWidth - m, x)), Math.max(m, Math.min(innerHeight - m, y))];
};

function openPicker(press) {
  const q = press.node;
  if (q && q.field) {
    // the fields, and the plus of another species
    const items = PICK_FIELDS.map((name) => ({ glyph: getOp(name).glyph, act: () => G.setField(state.formula, q.id, name) }));
    items.unshift({ glyph: 'plus', act: () => G.addSpecies(state.formula, q.id) });
    gv.picker = { at: pickerAt(press.x, press.y), from: [press.x, press.y], items, sel: -1 };
  } else if (press.edge) {
    const e = press.edge, scheduled = !e.chain.includes('.');
    const items = PICK_OPS.map((name) => ({ glyph: getOp(name).glyph, act: () => G.insert(state.formula, e.chain, e.index, name) }));
    // the fork first, at twelve o'clock: split the chain here
    if (scheduled) items.unshift({ glyph: 'fork', act: () => G.fork(state.formula, e.chain, e.index) });
    gv.picker = { at: pickerAt(press.x, press.y), from: [press.x, press.y], items, sel: -1 };
  }
  drawGraphNow();
}

// commit an edit: the formula, a lineage node, the network again
function graphEdit(fn) {
  let f;
  try { f = fn(); } catch (err) { console.warn('graph:', err.message); return false; }
  if (!f) return false;
  setFormula(format(f));
  writeHash();
  remember();
  refreshGraph();
  return true;
}

function graphDown(e) {
  if (gv.from) return;
  const x = e.clientX, y = e.clientY, touch = e.pointerType === 'touch';
  if (touch && state.pick !== 'C') graphHover(x, y);
  if (shadeDown(x, y)) return;
  // the collage's own shading has its frame and the collage's drivers to read from (a drag from a
  // driver's output dot into the frame): anything else goes back to the collage
  if (state.pick === 'C') { if (!driveOutPortAt(gv.P.dv, x, y) || !driveDown(x, y)) closeGraph(); return; }
  if (driveDown(x, y)) return;
  // a parameter handle of the selected node
  const sel = gv.selected && gv.P.items.find((q) => q.id === gv.selected);
  if (sel) {
    const h = paramHandles(sel).find((r) => x >= r.x1 - 6 && x <= r.x2 + 6 && Math.abs(y - r.y) < 7);
    if (h && h.band) {
      // a bound line: its band's ends (lo, hi), or its middle (both); a click selects it
      const B = h.band, end = Math.abs(x - B.x0) < 6 ? 'lo' : Math.abs(x - B.x1) < 6 ? 'hi' : 'both';
      gv.band = { to: h.to, end, M: B.M, x0: x, lo: B.b.lo, hi: B.b.hi, text0: state.text, moved: false };
      drawGraphNow();
      return;
    }
    if (h) {
      const m = state.sensed && state.sensed.params.find((p) => p.oi === sel.oi && p.key === h.key);
      gv.param = { id: sel.id, key: h.key, x0: x, y0: y, v0: sel.n.p[h.key], q: h.q, perPx: m && m.pxPerUnit > 0 ? 1 / m.pxPerUnit : 0.005 * Math.max(1, Math.abs(sel.n.p[h.key])), text0: state.text };
      drawGraphNow();
      return;
    }
  }
  // below the repeat zone: the count (drag: iterations), the schedule's letters (click one: a letter key
  // changes it, Delete drops it), the plus after them (another letter), and beside the last chain the plus
  // that adds a chain
  const [zx0, , zx1, zy1] = gv.P.zone;
  const SL = scheduleLayout(gv.P), near = (q, r = 10) => Math.hypot(x - q.x, y - (q.y - 4)) < r;
  if (near(SL.chainPlus, 12)) { gv.schedSel = null; graphEdit(() => G.addChain(state.formula)); return; }
  if (near(SL.plus)) { gv.schedSel = null; graphEdit(() => G.setSchedule(state.formula, state.formula.schedule + state.formula.schedule.at(-1))); return; }
  const letter = SL.letters.find((q) => near(q, 7));
  if (letter && touch) {
    // a finger: up or down through the chains' letters (a tap selects, a second tap lets go)
    gv.letter = { i: letter.i, y0: y, was: gv.schedSel === letter.i, moved: false, text0: state.text, w0: state.formula.schedule || '' };
    gv.schedSel = letter.i;
    drawGraphNow();
    return;
  }
  if (letter) { gv.schedSel = gv.schedSel === letter.i ? null : letter.i; drawGraphNow(); return; }
  if (Math.abs(y - (SL.count.y - 4)) < 12 && Math.abs(x - SL.count.x) < 22) {
    gv.param = { iters: true, x0: x, v0: state.formula.iters, text0: state.text };
    return;
  }
  gv.schedSel = null;
  const node = graphNodeAt(gv.P, x, y), edge = node ? null : graphEdgeAt(gv.P, x, y);
  // a binding's hairline: click selects its band, hold inserts a driver on it
  const bl = !node && !edge && driveLinkAt(gv.P.dv, x, y, gv.binds || []);
  if (bl) { drivePress(x, y, null, null, bl); return; }
  if (!node && !edge) {
    // outside the zone folds the graph; inside it, a press on nothing clears the selection
    // (a finger's waits for its release: a second finger makes it a pinch instead)
    if (x < zx0 - 30 || x > zx1 + 30 || y < gv.P.zone[1] - 30 || y > zy1 + 40) { if (touch) gv.outside = true; else closeGraph(); return; }
    gv.selected = null; drawGraphNow();
    return;
  }
  const press = { x, y, node, edge, moved: false };
  press.timer = setTimeout(() => { if (gv && gv.press === press && !press.moved && (edge || (node && node.field))) openPicker(press); }, GRAPH_HOLD_MS);
  gv.press = press;
  drawGraphNow();
}

function graphMove(e) {
  const x = e.clientX, y = e.clientY;
  if (gv.letter) {
    const L = gv.letter, n = normalize(state.formula).slots.length, steps = Math.round((L.y0 - y) / 18);
    if (Math.abs(y - L.y0) > 6) L.moved = true;
    const w0 = L.w0, c0 = w0.charCodeAt(L.i) - 65;
    if (!L.moved || n < 2 || c0 < 0) return;
    const w = w0.slice(0, L.i) + String.fromCharCode(65 + (((c0 + steps) % n) + n) % n) + w0.slice(L.i + 1);
    if (w !== state.formula.schedule) { try { setFormula(format(G.setSchedule(state.formula, w)), true); touched(); refreshGraph(); } catch { /* refused */ } }
    return;
  }
  if (shadeMove(x, y)) return;
  if ((state.pick !== 'C' || gv.dvDrag) && driveMove(x, y)) return;
  if (gv.picker) {
    const [cx, cy] = gv.picker.at;
    if (Math.hypot(x - cx, y - cy) < 30) gv.picker.sel = -1;
    else {
      const a = Math.atan2(y - cy, x - cx), n = gv.picker.items.length;
      gv.picker.sel = ((Math.round(((a + Math.PI / 2) / (Math.PI * 2)) * n) % n) + n) % n;
    }
    drawGraphNow();
    return;
  }
  if (gv.param) {
    const p = gv.param, dx = x - p.x0;
    // pulled up or down off its line: a param node reading it, dropped in the lane or on the top row
    if (!p.iters && Math.abs(y - p.y0) > 18 && Math.abs(dx) < 14) {
      setFormula(p.text0, true);
      gv.param = null;
      gv.pull = { of: `${p.id}.${p.key}`, x, y };
      refreshGraph();
      return;
    }
    let f;
    try {
      if (p.iters) f = G.setIters(state.formula, p.v0 + Math.round(dx / 12));
      else f = G.setParam(state.formula, p.id, p.key, p.q.discrete ? p.v0 + Math.round(dx / 14) : p.v0 + dx * p.perPx);
    } catch { return; }
    setFormula(format(f), true);
    touched();
    refreshGraph();
    return;
  }
  const pr = gv.press;
  if (pr) {
    if (!pr.moved && Math.hypot(x - pr.x, y - pr.y) > 6) { pr.moved = true; clearTimeout(pr.timer); }
    if (pr.moved && pr.node) {
      gv.drag = { id: pr.node.id, glyph: pr.node.glyph, x, y, edge: graphEdgeAt(gv.P, x, y) };
      gv.press.edge = gv.drag.edge;
      drawGraphNow();
    }
    return;
  }
  if (state.pick === 'C') return;
  graphHover(x, y);
}

// hover: which node, and its thumbnail once the pointer rests; off the nodes, the edge a hold would
// insert on (it shows a plus). A finger's press is its hover
function graphHover(x, y) {
  const q = graphNodeAt(gv.P, x, y), id = q ? q.id : null;
  const he = q ? null : graphEdgeAt(gv.P, x, y);
  if (he !== gv.hoverEdge) { gv.hoverEdge = he; drawGraphNow(); }
  if (id !== gv.hover) {
    gv.hover = id;
    drawGraphNow();
    if (id) {
      const key = id + '|' + state.text;
      clearTimeout(gv.thumbTimer);
      gv.thumbTimer = setTimeout(async () => {
        if (!gv || gv.hover !== id || gv.thumbs.has(key) || !R) return;
        const without = G.bypass(state.formula, id);
        if (!without) return;
        const href = await R.renderThumb(without, thumbView(basis(state.cam)), 168, 112, 6).catch(() => null);
        if (!gv || !href) return;
        gv.thumbs.set(key, href);
        drawGraphNow();
      }, 180);
    }
  }
}

function graphUp(e) {
  if (gv.outside) { gv.outside = null; closeGraph(); return; }
  if (gv.letter) {
    const L = gv.letter;
    gv.letter = null;
    if (!L.moved && L.was) gv.schedSel = null;
    if (state.text !== L.text0) { setFormula(state.text); writeHash(); remember(); }
    refreshGraph();
    return;
  }
  if (shadeUp(e.clientX, e.clientY)) return;
  if ((state.pick !== 'C' || gv.dvDrag) && driveUp(e.clientX, e.clientY)) return;
  if (gv.picker) {
    const k = gv.picker;
    gv.picker = null; gv.press = null;
    if (k.sel >= 0) graphEdit(k.items[k.sel].act); else drawGraphNow();
    return;
  }
  if (gv.param) {
    const p = gv.param;
    gv.param = null;
    if (state.text !== p.text0) { setFormula(state.text); writeHash(); remember(); }
    refreshGraph();
    return;
  }
  const pr = gv.press;
  gv.press = null;
  if (!pr) return;
  clearTimeout(pr.timer);
  if (gv.drag) {
    const d = gv.drag;
    gv.drag = null;
    const [zx0, zy0, zx1, zy1] = gv.P.zone, x = e.clientX, y = e.clientY;
    if (e.pointerType === 'touch' && (x < zx0 - 40 || x > zx1 + 40 || y < zy0 - 40 || y > zy1 + 60)) { if (gv.selected === d.id) gv.selected = null; graphEdit(() => G.remove(state.formula, d.id)); return; }
    if (d.edge && !(d.edge.chain === pr.node.chain && (d.edge.index === pr.node.index || d.edge.index === pr.node.index + 1))) graphEdit(() => G.move(state.formula, d.id, d.edge.chain, d.edge.index));
    else drawGraphNow();
    return;
  }
  if (pr.node && !pr.moved) { gv.selected = gv.selected === pr.node.id ? null : pr.node.id; gv.dvSel = null; gv.bandSel = null; drawGraphNow(); return; }
  drawGraphNow();
}

// ---------- the shading frame (DESIGN.md "Shading"): beside the formula, the same chain -----------------
// Click a node: select it (a ramp opens its editor; maths and mixes show their op and constant). Drag
// from a node's output dot to an input: a link. Hold on a link or an input dot: the ring of node types,
// inserted there; hold on empty frame: a free node; hold on a ramp: the ring of presets. Delete removes
// the selected node (or the selected stop). The ramp editor: click the bar for a stop, drag a stop, hold a
// stop for the hue ring (angle hue, distance saturation, scroll lightness, shift-scroll alpha), click the
// toggles (interpolation, colour space, mapping mode, log, invert), drag scale and offset.
const SHADE_TYPES = [...SHADE_READINGS, 'ramp', 'math', 'mixc'];
const shadeGlyph = (t) => (t === 'ramp' ? 'shade' : t === 'math' ? 'math.mul' : t === 'mixc' ? 'mixc.mix' : t);
const presetColours = (name) => Array.from({ length: 10 }, (_, j) => { const c = SE.rampColourAt(RAMP_PRESETS[name], j / 9); return `rgb(${c.slice(0, 3).map((x) => Math.round(255 * Math.min(1, toSRGB(x)))).join(',')})`; });
const linearToHsv = (c) => rgb2hsv(c.slice(0, 3).map((x) => Math.min(1, Math.max(0, toSRGB(x)))));
const hsvToLinear = (h, sat, v) => hsv2rgb([h, sat, v]).map((x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));

// the selected math or mix node's op and constant, as a toggle glyph and a dimension line to its left
function shadeHandles(q) {
  const x2 = q.x - q.hw - 24, x1 = x2 - 110;
  if (q.type === 'math') return [shadeBand({ key: 'c', to: `${q.id}.c`, value: q.n.p.c, x1, x2, y: q.y, v: fmtValue(q.n.p.c), held: gv.shParam && gv.shParam.key === 'c', glyph: `math.${q.n.p.op}`, cycle: ['op', MATH_OPS] })];
  if (q.type === 'mixc') return [shadeBand({ key: 'f', to: `${q.id}.f`, value: q.n.p.f, x1, x2, y: q.y, v: fmtValue(q.n.p.f), held: gv.shParam && gv.shParam.key === 'f', glyph: `mixc.${q.n.p.mode}`, cycle: ['mode', MIX_MODES] })];
  return [];
}

// ---------- drivers → colour (DESIGN.md "Drivers → colour (C)") ------------------------------------
// Drag a driver's output dot onto a shading input: it reads the driver. Onto a shading line (a math's
// constant, a mix's amount, a ramp's scale, offset and hue turn, the glow's gain) or onto a stop: bound,
// with a band, as an op's line is. Rest on a shading node during the drag: its lines open. Click the
// glow output: its gain line. Bands drag and delete as ops' do.
const glowOut = () => gv.P.sh.outs.find((o) => o.port === 'glow');
const nearGlow = (x, y) => { const o = glowOut(); return !!o && Math.hypot(x - o.x, y - o.y) < 12; };
// the glow's gain, a line to the left of the glow output
function gainHandle() {
  const o = glowOut(), g = normalize(state.formula).shade.out.gain ?? 1, x2 = o.x - 24, x1 = x2 - 110;
  return shadeBand({ key: 'gain', to: 'out.gain', value: g, x1, x2, y: o.y, v: fmtValue(+g.toPrecision(4)), held: gv.shParam && gv.shParam.id === 'out' });
}
// a shading line's band when it is bound (the same scale as an op's: the band the middle two thirds)
function shadeBand(h) {
  const b = shadeBindOf(h.to);
  if (!b) return h;
  const M = gv.band && gv.band.to === h.to ? gv.band.M : bandMap(b, h.x1, h.x2), clip = (x) => Math.max(h.x1, Math.min(h.x2, x));
  const live = liveShade().get(h.to);
  h.band = { x0: clip(M.x(b.lo)), x1: clip(M.x(b.hi)), sel: gv.bandSel === h.to, M, b, tick: live != null ? clip(M.x(live)) : null };
  h.held = !!(gv.band && gv.band.to === h.to);
  h.v = h.text = h.held ? `${fmtValue(+b.lo.toPrecision(4))} ${fmtValue(+b.hi.toPrecision(4))}` : h.v;
  return h;
}
// the lines the selected shading node shows: a ramp's editor lines, a math's or mix's, the gain
function shadeLines() {
  const S = gv.P.sh;
  if (S.empty) return [];
  if (gv.shSel === 'out') return [gainHandle()];
  const sel = gv.shSel && S.items.find((q) => q.id === gv.shSel);
  if (!sel) return [];
  if (!sel.ramp) return shadeHandles(sel);
  return editorLayout(sel, innerWidth, innerHeight, S.frame).handles.map((h) => shadeBand({ ...h, to: `${sel.id}.${h.key}`, value: h.v }));
}
// a bound stop's band on the bar's axis (t → x), above the bar
function stopBands(E) {
  const id = E.id, live = liveShade(), M = { x: (t) => E.x + t * E.w, v: (x) => (x - E.x) / E.w };
  return E.stops.flatMap((st) => {
    const to = `${id}.stops.${st.i}.t`, b = shadeBindOf(to);
    if (!b) return [];
    const lv = live.get(to);
    return [{ to, i: st.i, x0: M.x(b.lo), x1: M.x(b.hi), sel: gv.bandSel === to, M, b, live: lv != null ? M.x(lv) : null }];
  });
}
// a line's pixels per unit as the hand moves it (as shadeMove drags them)
const shadePerPx = (key, v) => (key === 'map.scale' ? Math.max(Math.abs(v), 1e-3) / 120 : key === 'map.offset' ? 1 / 200 : key === 'map.hue' ? 1 / 300 : 0.005 * Math.max(1, Math.abs(v)));

// the far ends of the shading's bindings: a visible line's band, a bound stop's band, else the node (the
// glow output for the gain)
function shadeBindEnds(P) {
  const f = normalize(state.formula), S = P.sh;
  if (!f.shade || !f.shade.bind || S.empty || !shadeShown()) return [];
  const lines = shadeLines(), sel = gv.shSel && S.items.find((q) => q.id === gv.shSel);
  const sb = sel && sel.ramp ? stopBands(editorLayout(sel, innerWidth, innerHeight, S.frame)) : [];
  const E = sel && sel.ramp ? editorLayout(sel, innerWidth, innerHeight, S.frame) : null;
  return f.shade.bind.flatMap((b) => {
    const on = gv.bandSel === b.to || gv.dvSel === b.from;
    const h = lines.find((r) => r.to === b.to && r.band);
    if (h) return [{ to: b.to, from: b.from, x2: (h.band.x0 + h.band.x1) / 2, y2: h.y, on, shade: true }];
    const st = sb.find((r) => r.to === b.to);
    if (st && E) return [{ to: b.to, from: b.from, x2: (st.x0 + st.x1) / 2, y2: E.y - 6, on, shade: true }];
    if (b.to === 'out.gain') { const o = glowOut(); return [{ to: b.to, from: b.from, x2: o.x + 8, y2: o.y, on, shade: true }]; }
    const q = S.items.find((r) => b.to.startsWith(r.id + '.'));
    return q ? [{ to: b.to, from: b.from, x2: q.x + q.hw, y2: q.y, on, shade: true }] : [];
  });
}

// the drivers' links into the shading: from the driver's output along the drivers' bus (under the
// readings') and down to the input
function shadeDriverLinks(P) {
  const S = P.sh, V = P.dv, busY = S.frame[1] + 9, out = [];
  for (const q of S.items) SE.portsOf(q.type).forEach((port, k, all) => {
    const ref = q.n.in[port];
    if (typeof ref !== 'string' || !ref.startsWith('d:')) return;
    const d = V.byId.get(ref.slice(2));
    if (!d) return;
    const [x1, y1] = V.outPort(d), [x2, y2] = S.inPort(q, k, all.length);
    out.push({ from: d.id, to: q.id, port, on: gv.dvSel === d.id, d: `M${x1.toFixed(1)} ${y1.toFixed(1)}C${x1.toFixed(1)} ${(y1 + 30).toFixed(1)} ${(x1 + 20).toFixed(1)} ${busY.toFixed(1)} ${(x1 - 10).toFixed(1)} ${busY.toFixed(1)}H${x2.toFixed(1)}V${y2.toFixed(1)}` });
  });
  return out;
}

// a driver dropped on the shading: an input reads it, a line or a stop is bound to it
function dropOnShade(from, x, y) {
  const S = gv.P.sh;
  if (S.empty) return false;
  const port = inFrame(S, x, y) ? shadeInPortAt(S, x, y) : null;
  if (port && port.node !== 'out') return graphEdit(() => SE.linkDriver(state.formula, from, port.node, port.port)) || true;
  const h = shadeLines().find((r) => x >= r.x1 - 6 && x <= r.x2 + 6 && Math.abs(y - r.y) < 8);
  if (h) {
    const old = shadeBindOf(h.to);
    const [lo, hi] = old ? [old.lo, old.hi] : DE.handleRange(h.value, shadePerPx(h.key, h.value), h.key === 'gain' ? { min: 0, max: 16 } : {});
    graphEdit(() => SE.bindShade(state.formula, h.to, from, lo, hi));
    return true;
  }
  const sel = gv.shSel && S.items.find((q) => q.id === gv.shSel);
  if (sel && sel.ramp) {
    const E = editorLayout(sel, innerWidth, innerHeight, S.frame);
    const st = E.stops.find((q) => Math.abs(x - q.x) < 7 && y > E.y - 12 && y < E.y + E.h + 22);
    if (st) {
      // a stop's band: between its neighbours (where it may go)
      const ts = E.stops.map((q) => q.t), lo = st.i > 0 ? ts[st.i - 1] : 0, hi = st.i < ts.length - 1 ? ts[st.i + 1] : 1;
      graphEdit(() => SE.bindShade(state.formula, `${sel.id}.stops.${st.i}.t`, from, lo, hi));
      return true;
    }
  }
  return false;
}

function drawShadeNow(P) {
  if (!shadeShown()) return '';
  const S = P.sh, sel = gv.shSel && S.items.find((q) => q.id === gv.shSel);
  let editor = null;
  if (sel && sel.ramp) {
    editor = editorLayout(sel, innerWidth, innerHeight, S.frame);
    editor.selStop = gv.stopSel && gv.stopSel.id === sel.id ? gv.stopSel.i : null;
    editor.held = gv.shParam && gv.shParam.id === sel.id ? gv.shParam.key : null;
    editor.handles = shadeLines();
    editor.stopBands = stopBands(editor);
  }
  const drvLinks = S.empty ? [] : shadeDriverLinks(P), f = normalize(state.formula);
  return drawShade(S, {
    bus: [P.zone[0], P.zone[1] + 4], hover: gv.shHover, selected: gv.shSel, link: gv.shPress && gv.shPress.link,
    drag: gv.shDrag, params: (sel && !sel.ramp) || gv.shSel === 'out' ? shadeLines() : [], editor, ring: gv.hue,
    drvBus: f.drive && !S.empty ? [P.zone[0], S.frame[1] + 9] : null, drvLinks,
  });
}

// a press on a shading band: its ends (lo, hi) or its middle (both); a click selects it (driveUp)
function shadeBandPress(to, B, x) {
  const end = Math.abs(x - B.x0) < 6 ? 'lo' : Math.abs(x - B.x1) < 6 ? 'hi' : 'both';
  gv.band = { to, end, M: B.M, x0: x, lo: B.b.lo, hi: B.b.hi, text0: state.text, moved: false, shade: true };
  drawGraphNow();
}

// a live change while a hand is down (quiet: no lineage), and its commit on release
function shadeLive(fn) {
  let f;
  try { f = fn(); } catch { return; }
  setFormula(format(f), true);
  touched();
  refreshGraph();
}
function shadeCommit() { setFormula(state.text); writeHash(); remember(); refreshGraph(); }

function shadeDown(x, y) {
  if (!shadeShown()) return false;
  const S = gv.P.sh;
  // the selected ramp's editor: toggles, scale and offset, stops, the bar
  const sel = gv.shSel && S.items.find((q) => q.id === gv.shSel);
  if (sel && sel.ramp) {
    const E = editorLayout(sel, innerWidth, innerHeight, S.frame), p = sel.n.p;
    const tg = E.toggles.find((t) => Math.hypot(x - t.x, y - t.y) < 11);
    if (tg) {
      const next = (list, v) => list[(list.indexOf(v) + 1) % list.length];
      if (tg.key === 'interp') graphEdit(() => SE.setRamp(state.formula, sel.id, 'interp', next(INTERPS, p.interp)));
      if (tg.key === 'space') graphEdit(() => SE.setRamp(state.formula, sel.id, 'space', next(SPACES, p.space)));
      if (tg.key === 'mode') graphEdit(() => SE.setRamp(state.formula, sel.id, 'map.mode', next(MAP_MODES, p.map.mode)));
      if (tg.key === 'log') graphEdit(() => SE.setRamp(state.formula, sel.id, 'map.log', !p.map.log));
      if (tg.key === 'invert') graphEdit(() => SE.setRamp(state.formula, sel.id, 'map.invert', !p.map.invert));
      return true;
    }
    const h = shadeLines().find((r) => x >= r.x1 - 6 && x <= r.x2 + 6 && Math.abs(y - r.y) < 7);
    if (h && h.band) { shadeBandPress(h.to, h.band, x); return true; }
    if (h) { gv.shParam = { id: sel.id, key: h.key, x0: x, v0: h.value, text0: state.text }; drawGraphNow(); return true; }
    // a bound stop's band above the bar: its ends, or its middle
    const sb = stopBands(E).find((B) => Math.abs(y - (E.y - 6)) < 6 && x >= Math.min(B.x0, B.x1) - 6 && x <= Math.max(B.x0, B.x1) + 6);
    if (sb) { shadeBandPress(sb.to, sb, x); return true; }
    const st = E.stops.find((q) => Math.abs(x - q.x) < 7 && y > E.y + E.h - 2 && y < E.y + E.h + 22);
    if (st) {
      gv.stopSel = { id: sel.id, i: st.i };
      const press = { stop: true, id: sel.id, i: st.i, x, y, t0: st.t, c: st.c, moved: false, text0: state.text };
      // held still: the hue ring around the stop
      press.timer = setTimeout(() => {
        if (!gv || gv.shStop !== press || press.moved) return;
        const [hh, ss, vv] = linearToHsv(press.c);
        gv.hue = { id: sel.id, i: press.i, x: st.x, y: st.y, h: hh, s: ss, v: vv, a: press.c[3], css: hsvToCss(hh, ss, vv), text0: state.text };
        drawGraphNow();
      }, GRAPH_HOLD_MS);
      gv.shStop = press;
      drawGraphNow();
      return true;
    }
    if (x >= E.x && x <= E.x + E.w && y >= E.y && y <= E.y + E.h) {
      const t = (x - E.x) / E.w;
      if (graphEdit(() => SE.addStop(state.formula, sel.id, t))) gv.stopSel = { id: sel.id, i: SE.stopIndex(state.formula, sel.id, +t.toFixed(4)) };
      drawGraphNow();
      return true;
    }
  }
  // a selected math or mix node: its op glyph cycles, its constant drags (or its band, bound); the
  // glow output selected: its gain
  if ((sel && !sel.ramp) || gv.shSel === 'out') {
    const h = shadeLines().find((r) => Math.abs(y - r.y) < 9 && x >= r.x1 - (r.cycle ? 24 : 6) && x <= r.x2 + 6);
    if (h) {
      if (h.cycle && x < h.x1 - 6) { const [key, list] = h.cycle; graphEdit(() => SE.setNodeParam(state.formula, sel.id, key, list[(list.indexOf(sel.n.p[key]) + 1) % list.length])); }
      else if (h.band) { shadeBandPress(h.to, h.band, x); return true; }
      else gv.shParam = { id: gv.shSel, key: h.key, x0: x, v0: h.value, text0: state.text };
      drawGraphNow();
      return true;
    }
  }
  if (!inFrame(S, x, y)) return false;
  if (S.empty) {
    const [fx0, fy0, fx1, fy1] = S.frame;
    if (Math.hypot(x - (fx0 + fx1) / 2, y - ((fy0 + fy1) / 2 - 8)) < 16) graphEdit(() => SE.shadeOn(state.formula));
    return true;
  }
  // from an output dot: a link being drawn
  const from = shadeOutPortAt(S, x, y);
  if (from) { const [x1, y1] = S.outPort(from); gv.shDrag = { from: from.id, x1, y1, x2: x, y2: y }; drawGraphNow(); return true; }
  const node = shadeNodeAt(S, x, y), port = node ? null : shadeInPortAt(S, x, y), link = node || port ? null : shadeLinkAt(S, x, y);
  const press = { x, y, node, port, link, moved: false };
  press.timer = setTimeout(() => {
    if (!gv || gv.shPress !== press || press.moved) return;
    const at = port || (link ? { node: link.to, port: link.port } : null);
    if (node && node.ramp) {
      gv.picker = { at: pickerAt(x, y), from: [x, y], items: Object.keys(RAMP_PRESETS).map((name) => ({ colours: presetColours(name), act: () => SE.applyPreset(state.formula, node.id, name) })), sel: -1 };
    } else if (!node) {
      // only what fits the held input: colours on a colour link, numbers on a number link
      const want = SE.wantsAt(state.formula, at);
      const types = SHADE_TYPES.filter((t) => !want || (want === 'colour') === (t === 'ramp' || t === 'mixc'));
      gv.picker = { at: pickerAt(x, y), from: [x, y], items: types.map((t) => ({ glyph: shadeGlyph(t), act: () => SE.addNode(state.formula, t, at) })), sel: -1 };
    }
    drawGraphNow();
  }, GRAPH_HOLD_MS);
  gv.shPress = press;
  drawGraphNow();
  return true;
}

function shadeMove(x, y) {
  if (gv.hue) {
    const r = gv.hue, d = Math.hypot(x - r.x, y - r.y);
    r.h = ((Math.atan2(y - r.y, x - r.x) / (Math.PI * 2)) % 1 + 1) % 1;
    r.s = Math.min(1, d / RING_R);
    r.css = hsvToCss(r.h, r.s, r.v);
    shadeLive(() => SE.setStopColour(state.formula, r.id, r.i, [...hsvToLinear(r.h, r.s, r.v), r.a]));
    return true;
  }
  if (gv.shParam) {
    const p = gv.shParam, dx = x - p.x0;
    const v = p.key === 'map.scale' ? p.v0 * Math.exp(dx / 120) : p.key === 'map.offset' ? p.v0 + dx / 200 : p.key === 'map.hue' ? p.v0 + dx / 300 : p.v0 + dx * 0.005 * Math.max(1, Math.abs(p.v0));
    shadeLive(() => (p.id === 'out' ? SE.setGain(state.formula, +v.toPrecision(5)) : SE.setNodeParam(state.formula, p.id, p.key, +v.toPrecision(5))));
    return true;
  }
  if (gv.shStop) {
    const st = gv.shStop;
    if (!st.moved && Math.abs(x - st.x) > 4) { st.moved = true; clearTimeout(st.timer); }
    if (st.moved) {
      const t = Math.min(1, Math.max(0, st.t0 + (x - st.x) / 260));
      shadeLive(() => SE.moveStop(state.formula, st.id, st.i, t));
      st.i = SE.stopIndex(state.formula, st.id, +t.toFixed(4), st.c);
      gv.stopSel = { id: st.id, i: st.i };
    }
    return true;
  }
  if (gv.shDrag) { gv.shDrag.x2 = x; gv.shDrag.y2 = y; drawGraphNow(); return true; }
  if (gv.shPress && !gv.picker) {
    if (!gv.shPress.moved && Math.hypot(x - gv.shPress.x, y - gv.shPress.y) > 6) { gv.shPress.moved = true; clearTimeout(gv.shPress.timer); }
    return true;
  }
  if (gv.picker && gv.shPress) return false; // the ring is pointed by the formula code
  // hover
  const q = inFrame(gv.P.sh, x, y) ? shadeNodeAt(gv.P.sh, x, y) : null, id = q ? q.id : null;
  if (id !== gv.shHover) { gv.shHover = id; drawGraphNow(); }
  return false;
}

function shadeUp(x, y) {
  if (gv.hue) { gv.hue = null; gv.shStop = null; shadeCommit(); return true; }
  if (gv.shParam) { const p = gv.shParam; gv.shParam = null; if (state.text !== p.text0) shadeCommit(); else drawGraphNow(); return true; }
  if (gv.shStop) { const st = gv.shStop; clearTimeout(st.timer); gv.shStop = null; if (state.text !== st.text0) shadeCommit(); else drawGraphNow(); return true; }
  if (gv.shDrag) {
    const d = gv.shDrag, to = shadeInPortAt(gv.P.sh, x, y);
    gv.shDrag = null;
    if (to) graphEdit(() => SE.connect(state.formula, d.from, to.node, to.port)); else drawGraphNow();
    return true;
  }
  const pr = gv.shPress;
  if (!pr) return false;
  clearTimeout(pr.timer);
  gv.shPress = null;
  if (gv.picker) {
    const k = gv.picker;
    gv.picker = null;
    if (k.sel >= 0) graphEdit(k.items[k.sel].act); else drawGraphNow();
    return true;
  }
  if (pr.node && !pr.moved) { gv.shSel = gv.shSel === pr.node.id ? null : pr.node.id; gv.stopSel = null; gv.selected = null; gv.dvSel = null; gv.bandSel = null; }
  else if (pr.port && pr.port.node === 'out' && pr.port.port === 'glow' && !pr.moved) { gv.shSel = gv.shSel === 'out' ? null : 'out'; gv.stopSel = null; gv.selected = null; gv.dvSel = null; }
  else if (!pr.node && !pr.moved) { gv.shSel = null; gv.stopSel = null; }
  drawGraphNow();
  return true;
}

// the hue ring's scroll: lightness; with shift, alpha
function hueWheel(e) {
  const r = gv.hue, d = -Math.max(-4, Math.min(4, e.deltaY / 100)) * 0.04;
  if (e.shiftKey) r.a = Math.min(1, Math.max(0, r.a + d)); else r.v = Math.min(1, Math.max(0, r.v + d));
  r.css = hsvToCss(r.h, r.s, r.v);
  shadeLive(() => SE.setStopColour(state.formula, r.id, r.i, [...hsvToLinear(r.h, r.s, r.v), r.a]));
}

// keys while the graph is open; true when used
function graphKey(e) {
  // a selected schedule letter: a letter key sets it, Delete drops it
  if (gv.schedSel != null) {
    const w = state.formula.schedule, i = gv.schedSel;
    const m = e.code.match(/^Key([A-H])$/);
    if (m) { graphEdit(() => G.setSchedule(state.formula, w.slice(0, i) + m[1] + w.slice(i + 1))); return true; }
    if (e.code === 'Delete' || e.code === 'Backspace') {
      gv.schedSel = null;
      if (w.length > 1) graphEdit(() => G.setSchedule(state.formula, w.slice(0, i) + w.slice(i + 1)));
      else drawGraphNow();
      return true;
    }
    if (e.code === 'Escape') { gv.schedSel = null; drawGraphNow(); return true; }
  }
  if (e.code === 'Escape') {
    if (gv.picker) { gv.picker = null; gv.press = null; gv.shPress = null; drawGraphNow(); }
    else if (gv.stopSel) { gv.stopSel = null; drawGraphNow(); }
    else if (gv.bandSel) { gv.bandSel = null; drawGraphNow(); }
    else if (gv.dvSel) { gv.dvSel = null; drawGraphNow(); }
    else if (gv.shSel) { gv.shSel = null; drawGraphNow(); }
    else if (gv.selected) { gv.selected = null; drawGraphNow(); } else closeGraph();
    return true;
  }
  if ((e.code === 'Delete' || e.code === 'Backspace') && gv.stopSel) { const st = gv.stopSel; gv.stopSel = null; graphEdit(() => SE.removeStop(state.formula, st.id, st.i)); return true; }
  if ((e.code === 'Delete' || e.code === 'Backspace') && gv.bandSel) { const to = gv.bandSel; gv.bandSel = null; graphEdit(() => (shadeBindOf(to) ? SE.unbindShade : G.unbind)(state.formula, to)); return true; }
  if ((e.code === 'Delete' || e.code === 'Backspace') && gv.dvSel) { const id = gv.dvSel; gv.dvSel = null; graphEdit(() => DE.removeDriverNode(state.formula, id)); return true; }
  if ((e.code === 'Delete' || e.code === 'Backspace') && gv.shSel) { const id = gv.shSel; gv.shSel = null; graphEdit(() => SE.removeNode(state.formula, id)); return true; }
  if ((e.code === 'Delete' || e.code === 'Backspace') && gv.selected) { const id = gv.selected; gv.selected = null; graphEdit(() => G.remove(state.formula, id)); return true; }
  if (e.code === 'KeyG' && !e.repeat) { closeGraph(); return true; }
  return false;
}

// ---------- the collage (DESIGN.md "Collage (K)", K3): starting one, picking, placing, its graph ------
// Drag a thumbnail from the lineage or the breed ring onto the field, or hold on a Metasurface site: the
// formula on screen becomes piece 1 and the dropped one lands on the surface under the cursor (else at
// the view's focus), a quarter of the view across, joined by a quad smooth union a tenth of its size
// wide. Up to eight pieces; a collage dropped on a collage is refused (they do not nest).
// Click a surface: the piece that leads there is picked and its affine frame drawn (ui/gizmo.js) — an
// axis moves it along itself, the ring turns it about the line of sight, the corner scales it, Shift
// snaps (a tenth of the frame, 15°, two figures). Click open ground: nothing is picked.
// G (or the strip): the collage's graph (ui/collagegraph.js) over the dimmed field — click a piece: picked,
// its placement and repetition as dimension lines below; click one of its ops then: its own formula graph
// opens (G or Esc comes back); hold a piece: the ring of repetitions. Click a join: its numbers; hold it:
// the ring of ops and kernels (a new cutter grows a tenth of its size); drag its seam line: the seam's
// width, as wide on screen as the seam is at the focus. Click the output: the collage's own shading.
// The collage's drivers sit in a row above the pieces: hold the row for the ring of drivers, drag from a
// driver's dot onto a line (or the seam line): bound; onto another's input: linked. Delete removes the
// picked piece, the selected driver or band.

function docTimeDriven() {
  if (!state.collage) return timeDriven(state.formula);
  const c = state.collage;
  return c.pieces.some((q) => timeDriven(q.f)) || !!(c.drive && c.drive.bind.length && c.drive.nodes.some((m) => m.type === 'time'));
}

// a collage number's glyph: a placement's, a repetition's, a join's
function refGlyph(ref) {
  const { path, key } = splitTarget(ref);
  if (path[0] === 'J') return key === 'w' ? 'mixc.mix' : key === 'n' ? 'math.bands' : 'seam';
  if (/^t[xyz]$/.test(key)) return 'translate';
  if (/^r[xyz]$/.test(key)) return 'rotate';
  if (key === 's') return 'scale';
  if (key === 'g') return 'cl.grow';
  const pc = state.collage && state.collage.pieces[+path.slice(1)];
  return pc && pc.rep ? `rep.${pc.rep.kind}` : 'rep.none';
}

// a formula's natural radius: how far out its surface is, marched in from 16 along the six axes
const radii = new Map();
function naturalRadius(f) {
  const key = format(normalize(f));
  if (radii.has(key)) return radii.get(key);
  let R0 = 0;
  for (const a of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    let t = 0;
    for (let i = 0; i < 200 && t < 16; i++) {
      const d = cpuDe(f, a.map((v) => v * (16 - t)));
      if (d < 1e-3) { R0 = Math.max(R0, 16 - t); break; }
      t += Math.max(d * 0.9, 1e-3);
    }
  }
  R0 = R0 || 1;
  radii.set(key, R0);
  return R0;
}

// pixels a world unit is at the view's focus
const pxAtFocus = () => innerHeight / (2 * Math.tan((state.look.fovDeg * Math.PI) / 360) * Math.max(state.focus, 1e-4));

// a formula's text dropped at screen point (sx, sy): added to the collage (one is started); false when refused
function dropPiece(text, sx, sy) {
  let f;
  try { f = parseAny(text); } catch { return false; }
  if (isCollage(f)) return false;
  const c0 = state.collage || normCollage({ pieces: [{ f: normalize(state.formula) }], joins: [] });
  if (c0.pieces.length >= MAX_PIECES) return false;
  const { dir } = pixelRay(sx, sy);
  const t = traceRay(dir) ?? Math.max(state.focus, 1e-3);
  const at = add(state.cam.pos, dir, t), R0 = naturalRadius(f), th = Math.tan((state.look.fovDeg * Math.PI) / 360);
  const s = +Math.max(PLACE.s.min, (0.25 * t * th) / R0).toPrecision(3), r = +(0.1 * s * R0).toPrecision(3);
  let c;
  try { c = CE.addPiece(c0, normalize(f), null, { op: 'union', k: 'quad', r }, { tx: +at[0].toPrecision(6), ty: +at[1].toPrecision(6), tz: +at[2].toPrecision(6), s }); }
  catch (e) { console.warn('collage:', e.message); return false; }
  exitGrab();
  setCollage(c);
  setPick(c.pieces.length - 1);
  writeHash();
  remember();
  return true;
}

// a join's op or kernel changed; a new cutter (the piece after a subtraction or intersection) with no
// growth grows a tenth of its size, so it carves at once
function withJoin(c, k, change) {
  let g = CE.setJoin(c, k, change);
  const j = g.joins[k], pc = g.pieces[k + 1];
  if ((j.op === 'sub' || j.op === 'inter') && !(pc.place.g > 0)) g = CE.setPlace(g, k + 1, 'g', +(0.1 * pc.place.s * naturalRadius(pc.f)).toPrecision(3));
  return g;
}

// ---------- picking and the gizmo ------------------------------------------------------------------

let gz = null;          // a gizmo drag: { kind, k, x0, y0, place0, G, a0, value, text0 }
let gizmoG = null;      // the gizmo's geometry as last drawn
let gizmoShown = false, gizmoDue = false;

const overlayBusy = () => !!(gv || cv || surf || grab || ring || lens || (ldrag && ldrag.moved));

function drawGizmoNow() {
  gizmoDue = false;
  const show = state.collage && typeof state.pick === 'number' && state.mode !== 'loop' && !overlayBusy();
  if (!show) {
    gizmoG = null;
    if (gizmoShown && !overlayBusy()) clearGrab(overlay);
    gizmoShown = false;
    return;
  }
  const pc = state.collage.pieces[state.pick], R0 = naturalRadius(pc.f);
  const C = makeCamera(state.cam, basis(state.cam), Math.tan((state.look.fovDeg * Math.PI) / 360), innerWidth, innerHeight);
  gizmoG = gizmoGeometry(C, pc.place, R0);
  drawGizmo(overlay, C, gizmoG, { place: pc.place, rep: pc.rep, R0, drag: gz && { kind: gz.kind, k: gz.k, from: gz.G.O, value: gz.value, a0: gz.a0, a1: gz.a1 } });
  gizmoShown = true;
}

// a click on the field: the piece that leads at the surface under it, or none
function pickAt(x, y) {
  const { dir } = pixelRay(x, y);
  const t = traceRay(dir);
  setPick(t == null ? null : collageAt(shownCollage, add(state.cam.pos, dir, t)).lead);
}

function gizmoDown(x, y, slop = 1) {
  const h = gizmoHit(gizmoG, x, y, slop);
  if (!h) return false;
  const pc = state.collage.pieces[state.pick];
  gz = { ...h, x0: x, y0: y, place0: { ...pc.place }, G: gizmoG, a0: Math.atan2(y - gizmoG.O[1], x - gizmoG.O[0]), value: '', text0: state.text };
  gz.a1 = gz.a0;
  drawGizmoNow();
  return true;
}

const sig = (v, n = 4) => +v.toPrecision(n);
function gizmoMove(x, y, snap) {
  const g = gz, pl = { ...g.place0 }, G0 = g.G;
  if (g.kind === 'axis') {
    const v = G0.axes[g.k].v, e = G0.e[g.k];
    let d = ((x - g.x0) * v[0] + (y - g.y0) * v[1]) / (v[0] * v[0] + v[1] * v[1] || 1);
    if (snap) { const st = Math.pow(10, Math.floor(Math.log10(G0.A / 2))); d = Math.round(d / st) * st; }
    pl.tx = sig(pl.tx + e[0] * d, 6); pl.ty = sig(pl.ty + e[1] * d, 6); pl.tz = sig(pl.tz + e[2] * d, 6);
    g.value = fmtValue(sig(d));
  } else if (g.kind === 'ring') {
    let a = Math.atan2(y - G0.O[1], x - G0.O[0]) - g.a0;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    if (snap) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
    g.a1 = g.a0 + a;
    const R = matMul(axisAngle(basis(state.cam).fwd, a), rotationXYZ(pl.rx, pl.ry, pl.rz)), [rx, ry, rz] = eulerXYZ(R);
    Object.assign(pl, { rx: sig(rx, 5), ry: sig(ry, 5), rz: sig(rz, 5) });
    g.value = `${Math.round((a * 180) / Math.PI)}°`;
  } else {
    const r0 = Math.hypot(g.x0 - G0.O[0], g.y0 - G0.O[1]) || 1, r1 = Math.hypot(x - G0.O[0], y - G0.O[1]);
    pl.s = Math.max(PLACE.s.min, Math.min(PLACE.s.max, pl.s * (r1 / r0)));
    pl.s = snap ? +pl.s.toPrecision(2) : sig(pl.s, 5);
    g.value = `×${fmtValue(pl.s)}`;
  }
  const c = JSON.parse(JSON.stringify(state.collage));
  c.pieces[state.pick].place = pl;
  try { setCollage(c, true); } catch { return; }
  touched();
  drawGizmoNow();
}

function gizmoUp() {
  const g = gz;
  gz = null;
  if (state.text !== g.text0) { writeHash(); remember(); }
  drawGizmoNow();
}

// ---------- dragging a thumbnail onto the field: the lineage's, the breed ring's -------------------

let ldrag = null, ldragDone = false;   // { id, x0, y0, x, y, moved, thumb }

function drawDragNow(thumb, x, y) {
  const tw = 120, th = 80;
  overlay.innerHTML = `<g class="dg">${thumb ? `<image href="${thumb}" x="${(x + 14).toFixed(1)}" y="${(y + 14).toFixed(1)}" width="${tw}" height="${th}" preserveAspectRatio="xMidYMid slice" opacity="0.8"/><rect x="${(x + 14).toFixed(1)}" y="${(y + 14).toFixed(1)}" width="${tw}" height="${th}"/>` : ''}<path d="M${x - 14} ${y}h10M${x + 4} ${y}h10M${x} ${y - 14}v10M${x} ${y + 4}v10"/></g>`;
  overlay.classList.add('on');
}

// the press lands on a lineage dot; the hand is followed on the window (hovering redraws the structure
// layer, so the dot pressed is gone by the first move)
structureSvg.addEventListener('pointerdown', (e) => {
  const id = e.target && e.target.dataset ? e.target.dataset.id : null;
  if (!id) return;
  const n = lineage.byId(id);
  ldrag = { id, x0: e.clientX, y0: e.clientY, moved: false, thumb: n && n.thumb, text: n && n.text };
});
addEventListener('pointermove', (e) => {
  if (!ldrag) return;
  if (!ldrag.moved && Math.hypot(e.clientX - ldrag.x0, e.clientY - ldrag.y0) < 8) return;
  ldrag.moved = true;
  drawDragNow(ldrag.thumb, e.clientX, e.clientY);
});
addEventListener('pointerup', (e) => {
  const d = ldrag;
  ldrag = null;
  if (!d || !d.moved) return;
  // the click that may follow the release is not one
  ldragDone = true;
  setTimeout(() => { ldragDone = false; }, 0);
  clearGrab(overlay);
  // dropped back on the lineage: nothing
  if (!(e.clientY > innerHeight - 110 && e.clientX < 420) && d.text) dropPiece(d.text, e.clientX, e.clientY);
  gizmoDue = true;
});

// ---------- the collage's graph ----------------------------------------------------------------------

let cv = null;   // { PC, sel, press, param, picker, band, bandSel, dvSel, dvDrag, dvParam, hover, drift }
const COLLAGE_DRIVERS = DRIVE_TYPES.filter((t) => !DRIVE_ORBIT.includes(t) && t !== 'param');
const REP_DEFAULTS = (R0) => ({ grid: { cx: +(2.5 * R0).toPrecision(3), nx: 1 }, mirror: { mx: 1, ox: +(1.2 * R0).toPrecision(3) }, polar: { n: 6, r: +(2 * R0).toPrecision(3), axis: 1 } });
const repGlyphs = (c) => c.pieces.map((q) => (q.rep ? `rep.${q.rep.kind}` : null));

// the collage's drivers in a row above its pieces (ui/drivegraph.js draws them)
function placeCollageDrive(drive, PC) {
  const u = PC.u, g = Math.max(10, Math.min(22, u * 0.42));
  const items = ((drive && drive.nodes) || []).map((m, i) => ({ id: m.id, n: m, type: m.type, glyph: driverGlyph(m), x: PC.zone[0] + (0.5 + i * 1.1) * u, y: PC.zone[1] - 1.3 * u, hw: g / 2, hh: g / 2 }));
  const byId = new Map(items.map((q) => [q.id, q]));
  const inPort = (q, k, of) => [q.x + (of > 1 ? (k - (of - 1) / 2) * 9 : 0), q.y - q.hh - 3];
  const outPort = (q) => [q.x, q.y + q.hh + 3];
  const links = [];
  for (const q of items) DE.driverPorts(q.type).forEach((port, k, all) => {
    const src = q.n.in[port];
    if (src == null || !byId.has(src)) return;
    const [x1, y1] = outPort(byId.get(src)), [x2, y2] = inPort(q, k, all.length);
    links.push({ from: src, to: q.id, port, x1, y1, x2, y2 });
  });
  return { u, g, items, links, byId, inPort, outPort, lane: null, top: [PC.zone[0] - 10, PC.zone[1] - 2.4 * u, PC.zone[2] + 10, PC.zone[1] - 0.3 * u] };
}

function collagePlacement(full) {
  const c = state.collage, L = layoutCollage(c);
  const u = full ? Math.min(56, (innerHeight - 340) / (L.out.y + 3.5), (innerWidth * 0.8) / (L.w + 1)) : Math.min(30, (innerHeight - 260) / (L.out.y + 3), 230 / (L.w + 1));
  const PC = placeCollage(L, u, innerWidth - 50, innerHeight / 2 - (full ? 60 : 10));
  PC.dv = placeCollageDrive(c.drive, PC);
  return PC;
}

// the Tab strip: the collage drawn small, a click unfolds it
function collageStrip() {
  const PC = collagePlacement(false), [x0, y0, x1, y1] = PC.zone;
  return drawCollage(PC, { pxPerUnit: pxAtFocus(), repGlyph: repGlyphs(state.collage), shaded: !!state.collage.shade, selected: typeof state.pick === 'number' ? { kind: 'piece', i: state.pick } : null })
    + `<rect class="hit" data-graph="1" x="${(x0 - 8).toFixed(1)}" y="${(y0 - 8).toFixed(1)}" width="${(x1 - x0 + 16).toFixed(1)}" height="${(y1 - y0 + 16).toFixed(1)}"/>`;
}

function openCollageGraph() {
  if (cv || !state.collage) return;
  exitGrab();
  gview = { k: 1, tx: 0, ty: 0 }; gt = null; vtap = null;
  cv = { PC: collagePlacement(true), sel: typeof state.pick === 'number' ? { kind: 'piece', i: state.pick } : null, drift: state.drift };
  state.drift = false;
  drawStructureNow();
  drawCvNow();
}

function closeCollageGraph() {
  if (!cv) return;
  state.drift = cv.drift;
  cv = null;
  clearGrab(overlay);
  gizmoDue = true;
  drawStructureNow();
}

function cvRefresh() {
  if (!cv) return;
  cv.PC = collagePlacement(true);
  const c = state.collage;
  if (cv.sel && ((cv.sel.kind === 'piece' && !c.pieces[cv.sel.i]) || (cv.sel.kind === 'join' && !c.joins[cv.sel.k]))) cv.sel = null;
  if (cv.dvSel && !cv.PC.dv.byId.has(cv.dvSel)) cv.dvSel = null;
  if (cv.bandSel && !cBindOf(cv.bandSel)) cv.bandSel = null;
  drawCvNow();
}

const cBindOf = (to) => { const d = state.collage && state.collage.drive; return d ? d.bind.find((b) => b.to === to) || null : null; };

// an edit of the collage: committed (a lineage node), or live while a hand is down
function cvEdit(fn) {
  let c;
  try { c = fn(state.collage); } catch (err) { console.warn('collage:', err.message); return false; }
  if (!c) return false;
  setCollage(c);
  writeHash();
  remember();
  cvRefresh();
  return true;
}
function cvLive(fn) {
  try { setCollage(fn(state.collage), true); } catch { return; }
  touched();
  cvRefresh();
}

// the selection's numbers as dimension lines below the output, a glyph at the head of each group
function cvLines() {
  if (!cv || !cv.sel) return [];
  const c = state.collage, PC = cv.PC, px = pxAtFocus(), out = [];
  let cx, groups = [];
  if (cv.sel.kind === 'piece') {
    const i = cv.sel.i, pc = c.pieces[i], P = PC.pieces[i];
    cx = (P.zone[0] + P.zone[2]) / 2;
    const world = 1 / px, own = world / pc.place.s;
    groups = [
      ['translate', ['tx', 'ty', 'tz'].map((k) => [k, PLACE[k], world])],
      ['rotate', ['rx', 'ry', 'rz'].map((k) => [k, PLACE[k], 0.5])],
      ['scale', [['s', PLACE.s, 'mul']]],
      ['cl.grow', [['g', PLACE.g, world]]],
    ];
    if (pc.rep) groups.push([`rep.${pc.rep.kind}`, Object.entries(REP[pc.rep.kind]).map(([k, q]) => [k, q, q.discrete ? 'step' : own])]);
    groups = groups.map(([glyph, keys]) => [glyph, keys.map(([k, q, per]) => ({ to: `P${i}.${k}`, key: k, q, per, value: k in pc.place ? pc.place[k] : pc.rep[k] }))]);
  } else if (cv.sel.kind === 'join') {
    const k = cv.sel.k, j = c.joins[k], q = PC.joins[k];
    cx = q.x;
    const keys = j.op === 'morph' ? [['w', 1 / 150]] : j.k === 'hard' ? [] : j.k === 'stairs' ? [['r', 1 / px], ['n', 'step']] : [['r', 1 / px]];
    groups = keys.map(([key, per]) => [refGlyph(`J${k}.${key}`), [{ to: `J${k}.${key}`, key, q: JOIN[key], per, value: j[key] }]]);
  } else return [];
  const x2 = Math.max(190, Math.min(innerWidth - 24, cx + 75)), x1 = x2 - 150;
  let y = PC.out.y + PC.g + 30;
  for (const [glyph, keys] of groups) {
    keys.forEach((h, n) => {
      const held = cv.param && cv.param.to === h.to;
      const ranged = h.q.min !== undefined && h.q.max !== undefined && h.q.max - h.q.min < 1e4;
      const line = { ...h, x1, x2, y, held, v: held ? fmtValue(h.value) : '', tick: ranged ? x1 + ((h.value - h.q.min) / (h.q.max - h.q.min)) * (x2 - x1) : null, glyph: n === 0 ? glyph : null, gx: x1 - 16 };
      const b = cBindOf(h.to);
      if (b && !h.q.discrete) {
        const M = cv.band && cv.band.to === h.to ? cv.band.M : bandMap(b, x1, x2), clip = (v) => Math.max(x1, Math.min(x2, v));
        line.band = { x0: clip(M.x(b.lo)), x1: clip(M.x(b.hi)), sel: cv.bandSel === h.to, M, b };
        if (cv.band && cv.band.to === h.to) { line.held = true; line.v = `${fmtValue(+b.lo.toPrecision(4))} ${fmtValue(+b.hi.toPrecision(4))}`; }
      }
      out.push(line);
      y += 15;
    });
    y += 6;
  }
  return out;
}

// the selected driver's numbers and switches (as ui/drivegraph.js draws a formula's), below the lines
function cvDriverHandles(q) {
  const spec = DRIVE_PARAMS[q.type] || {}, P = q.n.p;
  const x2 = Math.max(190, Math.min(innerWidth - 24, q.x + 75)), x1 = x2 - 150;
  let y = cv.PC.out.y + cv.PC.g + 30;
  const out = [], sw = Object.entries(spec).filter(([, s]) => Array.isArray(s) || typeof s === 'boolean');
  sw.forEach(([key, s], i) => {
    const glyph = key === 'op' ? `math.${P.op}` : key === 'wave' ? `drv.wave.${P.wave}` : key === 'out' ? `drv.out.${P.out}` : `drv.${key}`;
    out.push({ key, glyph, gx: x1 + 8 + i * 28, y, off: typeof s === 'boolean' && !P[key], cycle: Array.isArray(s) ? s : null });
  });
  if (sw.length) y += 22;
  for (const [key, s] of Object.entries(spec)) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) continue;
    const held = cv.dvParam && cv.dvParam.id === q.id && cv.dvParam.key === key;
    const ranged = s.min !== undefined && s.max !== undefined && s.max - s.min < 1e4;
    out.push({ key, line: true, x1, x2, y, q: s, value: P[key], held, v: held ? fmtValue(P[key]) : '', tick: ranged ? x1 + ((P[key] - s.min) / (s.max - s.min)) * (x2 - x1) : null });
    y += 15;
  }
  return out;
}

// the bindings' far ends: a visible line's band, else the join's glyph or the piece's zone corner
function cvBinds(lines) {
  const d = state.collage.drive, PC = cv.PC;
  return ((d && d.bind) || []).flatMap((b) => {
    const h = lines.find((r) => r.to === b.to), { path } = splitTarget(b.to), on = cv.bandSel === b.to || cv.dvSel === b.from;
    if (h) return [{ to: b.to, from: b.from, x2: h.band ? (h.band.x0 + h.band.x1) / 2 : (h.x1 + h.x2) / 2, y2: h.y, on }];
    if (path[0] === 'J') { const q = PC.joins[+path.slice(1)]; return q ? [{ to: b.to, from: b.from, x2: q.x + PC.g * 0.7, y2: q.y, on }] : []; }
    const p = PC.pieces[+path.slice(1)];
    return p ? [{ to: b.to, from: b.from, x2: p.zone[2], y2: p.zone[1], on }] : [];
  });
}

function drawCvNow() {
  if (!cv) return;
  const PC = cv.PC, lines = cvLines(), V = PC.dv, dsel = cv.dvSel && V.byId.get(cv.dvSel);
  let svg = `<rect class="gv" x="0" y="0" width="${innerWidth}" height="${innerHeight}" style="opacity:0.55"/>`;
  svg += drawCollage(PC, {
    full: true, selected: cv.sel, hover: cv.hover, pxPerUnit: pxAtFocus(), held: cv.param && cv.param.seam ? cv.param.seam : null,
    value: cv.param ? fmtValue(cv.param.cur ?? cv.param.v0) : '', lines: dsel ? [] : lines, repGlyph: repGlyphs(state.collage), shaded: !!state.collage.shade,
  });
  cv.binds = cvBinds(dsel ? [] : lines);
  svg += drawDrive(V, { hover: cv.dvHover, selected: cv.dvSel, drag: cv.dvDrag, binds: cv.binds, params: dsel ? cvDriverHandles(dsel) : [] });
  const pl = cvPlus(PC);
  if (pl) svg += `<g class="cg"><g class="pl">${glyphPath('plus', pl[0], pl[1], 16)}<circle cx="${pl[0].toFixed(1)}" cy="${pl[1].toFixed(1)}" r="12"/></g></g>`;
  if (cv.picker) svg += drawPicker(cv.picker);
  overlay.innerHTML = viewWrap(svg);
  overlay.classList.add('on');
}

// the plus left of the pieces: the Metasurface in "add a piece" mode (none once the collage is full)
function cvPlus(PC) {
  if (state.collage.pieces.length >= MAX_PIECES) return null;
  const q = PC.pieces[0];
  return [Math.max(24, PC.zone[0] - Math.max(28, 0.8 * PC.u)), (q.zone[1] + q.zone[3]) / 2];
}

// into a piece's own formula graph (or the collage's shading, pick 'C'); G or Esc comes back
let drilling = false;
function drillInto(pick, nodeId = null) {
  const back = { pick: state.pick };
  closeCollageGraph();
  setPick(pick);
  drilling = true;
  try { openGraph(); } finally { drilling = false; }
  gv.back = back;
  if (nodeId) { gv.selected = nodeId; drawGraphNow(); }
}

function cvDown(x, y) {
  const PC = cv.PC, V = PC.dv, c = state.collage;
  const pl = cvPlus(PC);
  if (pl && Math.hypot(x - pl[0], y - pl[1]) < 18) { closeCollageGraph(); openSurface('graph'); return; }
  // the drivers: the selected one's numbers and switches, an output dot, a node, the row
  const dsel = cv.dvSel && V.byId.get(cv.dvSel);
  if (dsel) for (const h of cvDriverHandles(dsel)) {
    if (h.glyph && Math.hypot(x - h.gx, y - h.y) < 11) {
      const v = h.cycle ? h.cycle[(h.cycle.indexOf(dsel.n.p[h.key]) + 1) % h.cycle.length] : !dsel.n.p[h.key];
      cvEdit((g) => CE.setCollageDriver(g, { ...dsel.n, p: { ...dsel.n.p, [h.key]: v } }));
      return;
    }
    if (h.line && x >= h.x1 - 6 && x <= h.x2 + 6 && Math.abs(y - h.y) < 7) { cv.dvParam = { id: dsel.id, key: h.key, x0: x, v0: dsel.n.p[h.key], q: h.q, text0: state.text }; drawCvNow(); return; }
  }
  const from = driveOutPortAt(V, x, y);
  if (from) { const [x1, y1] = V.outPort(from); cv.dvDrag = { from: from.id, x1, y1, x2: x, y2: y }; drawCvNow(); return; }
  const dnode = driveNodeAt(V, x, y);
  const inRow = inTop(V, x, y);
  // the selection's lines
  const lines = dsel ? [] : cvLines();
  const h = lines.find((r) => x >= r.x1 - 6 && x <= r.x2 + 6 && Math.abs(y - r.y) < 7);
  if (h && h.band) {
    const B = h.band, end = Math.abs(x - B.x0) < 6 ? 'lo' : Math.abs(x - B.x1) < 6 ? 'hi' : 'both';
    cv.band = { to: h.to, end, M: B.M, x0: x, lo: B.b.lo, hi: B.b.hi, from: B.b.from, text0: state.text, moved: false };
    drawCvNow();
    return;
  }
  if (h) { cv.param = { to: h.to, x0: x, v0: h.value, q: h.q, per: h.per, text0: state.text }; drawCvNow(); return; }
  // a join's seam line: its width (a morph's weight)
  const sk = collageSeamAt(PC, x, y, pxAtFocus());
  if (sk >= 0 && collageJoinAt(PC, x, y) < 0) {
    const j = c.joins[sk], key = j.op === 'morph' ? 'w' : 'r';
    cv.param = { to: `J${sk}.${key}`, seam: `J${sk}`, x0: x, v0: j[key], q: JOIN[key], per: key === 'w' ? 1 / 60 : 2 / pxAtFocus(), text0: state.text };
    drawCvNow();
    return;
  }
  const k = collageJoinAt(PC, x, y), i = k >= 0 ? -1 : collagePieceAt(PC, x, y), out = k < 0 && i < 0 && collageOutAt(PC, x, y);
  if (k < 0 && i < 0 && !out && !dnode && !inRow) {
    // outside everything folds the graph; inside the zone a press clears the selection
    const [zx0, zy0, zx1, zy1] = PC.zone;
    if (x < zx0 - 30 || x > zx1 + 30 || y < zy0 - 2.6 * PC.u || y > zy1 + 40) { if (inputTouch) cv.outside = true; else closeCollageGraph(); return; }
    cv.sel = null; cv.dvSel = null; cv.bandSel = null; drawCvNow();
    return;
  }
  const press = { x, y, k, i, out, dnode, node: i >= 0 ? graphNodeAt(PC.pieces[i].P, x, y) : null, moved: false };
  press.timer = setTimeout(() => {
    if (!cv || cv.press !== press || press.moved) return;
    if (k >= 0) {
      // the ring of joins: the four ops (with this kernel), then the seven kernels (with this op)
      const j = c.joins[k], op = j.op === 'morph' ? 'union' : j.op;
      const items = [...JOIN_OPS.map((o) => ({ join: { op: o, k: j.k, n: j.n, w: 0.5 }, act: (g) => withJoin(g, k, { op: o }) })),
        ...KERNELS.map((kk) => ({ join: { op, k: kk, n: j.n }, act: (g) => withJoin(g, k, { op, k: kk }) }))];
      cv.picker = { at: pickerAt(x, y), from: [x, y], items, sel: -1 };
    } else if (i >= 0) {
      const R0 = naturalRadius(c.pieces[i].f), D = REP_DEFAULTS(R0);
      cv.picker = { at: pickerAt(x, y), from: [x, y], items: [{ glyph: 'rep.none', act: (g) => CE.setRep(g, i, null) }, ...['grid', 'mirror', 'polar'].map((kind) => ({ glyph: `rep.${kind}`, act: (g) => CE.setRep(g, i, kind, D[kind]) }))], sel: -1 };
    } else if (inRow && !dnode) {
      cv.picker = { at: pickerAt(x, y), from: [x, y], items: COLLAGE_DRIVERS.map((t) => ({ glyph: typeGlyph(t), act: (g) => addCollageDriver(g, t) })), sel: -1 };
    }
    drawCvNow();
  }, GRAPH_HOLD_MS);
  cv.press = press;
}

// a fresh collage driver, as core/drive-edit.js makes a formula's (a math node the constant ½)
function addCollageDriver(c, type) {
  const nodes = (c.drive && c.drive.nodes) || [];
  let n = 0;
  while (nodes.some((m) => m.id === `${type}${n}`)) n++;
  const id = `${type}${n}`;
  cv.newDriver = id;
  // a remap reads the driver before it (there is no iteration to read in a collage)
  if (type === 'remap' && !nodes.length) throw new Error('a remap reads another driver: add one first');
  return CE.setCollageDriver(c, { id, type, in: type === 'remap' ? { a: nodes[nodes.length - 1].id } : {}, p: type === 'math' ? { op: 'add', c: 0.5 } : type === 'remap' ? { lo: 0, hi: 1, clamp: false } : {} });
}

function cvMove(x, y) {
  if (cv.picker) {
    const [cx, cy] = cv.picker.at;
    if (Math.hypot(x - cx, y - cy) < 30) cv.picker.sel = -1;
    else { const a = Math.atan2(y - cy, x - cx), n = cv.picker.items.length; cv.picker.sel = ((Math.round(((a + Math.PI / 2) / (Math.PI * 2)) * n) % n) + n) % n; }
    drawCvNow();
    return;
  }
  if (cv.param) {
    const p = cv.param, dx = x - p.x0;
    const v = p.per === 'step' ? p.v0 + Math.round(dx / 14) : p.per === 'mul' ? p.v0 * Math.exp(dx * 0.005) : p.v0 + dx * p.per;
    p.cur = p.q.discrete ? Math.round(v) : sig(v, 5);
    cvLive((g) => CE.setCollageParam(g, p.to, p.cur));
    return;
  }
  if (cv.dvParam) {
    const p = cv.dvParam, dx = x - p.x0, v = p.q.discrete ? p.v0 + Math.round(dx / 14) : sig(p.v0 + dx * 0.005 * Math.max(1, Math.abs(p.v0)), 5);
    const n = cv.PC.dv.byId.get(p.id).n;
    cvLive((g) => CE.setCollageDriver(g, { ...n, p: { ...n.p, [p.key]: v } }));
    return;
  }
  if (cv.band) {
    const B = cv.band, dv = B.M.v(x) - B.M.v(B.x0);
    if (Math.abs(x - B.x0) > 2) B.moved = true;
    const lo = B.end === 'hi' ? B.lo : B.lo + dv, hi = B.end === 'lo' ? B.hi : B.hi + dv;
    cvLive((g) => CE.bindCollage(g, B.to, B.from, sig(lo, 5), sig(hi, 5)));
    return;
  }
  if (cv.dvDrag) { cv.dvDrag.x2 = x; cv.dvDrag.y2 = y; drawCvNow(); return; }
  if (cv.press) {
    if (!cv.press.moved && Math.hypot(x - cv.press.x, y - cv.press.y) > 6) { cv.press.moved = true; clearTimeout(cv.press.timer); }
    return;
  }
  const k = collageJoinAt(cv.PC, x, y), dn = driveNodeAt(cv.PC.dv, x, y);
  const hv = k >= 0 ? { kind: 'join', k } : null, dh = dn ? dn.id : null;
  if (JSON.stringify(hv) !== JSON.stringify(cv.hover) || dh !== cv.dvHover) { cv.hover = hv; cv.dvHover = dh; drawCvNow(); }
}

function cvCommit(text0) { if (state.text !== text0) { setCollage(state.collage); writeHash(); remember(); } cvRefresh(); }

function cvUp(x, y) {
  if (cv.outside) { cv.outside = null; closeCollageGraph(); return; }
  if (cv.picker) {
    const kk = cv.picker;
    cv.picker = null;
    if (cv.press) clearTimeout(cv.press.timer);
    cv.press = null;
    if (kk.sel >= 0 && cvEdit(kk.items[kk.sel].act) && cv.newDriver) { cv.dvSel = cv.newDriver; cv.sel = null; }
    cv.newDriver = null;
    drawCvNow();
    return;
  }
  if (cv.param) { const p = cv.param; cv.param = null; cvCommit(p.text0); return; }
  if (cv.dvParam) { const p = cv.dvParam; cv.dvParam = null; cvCommit(p.text0); return; }
  if (cv.band) {
    const B = cv.band;
    cv.band = null;
    if (state.text !== B.text0) cvCommit(B.text0);
    else { if (!B.moved) cv.bandSel = cv.bandSel === B.to ? null : B.to; drawCvNow(); }
    return;
  }
  if (cv.dvDrag) {
    const d = cv.dvDrag;
    cv.dvDrag = null;
    const to = driveInPortAt(cv.PC.dv, x, y);
    if (to) { cvEdit((g) => CE.connectCollageDriver(g, d.from, to.node, to.port)); return; }
    // onto a line of the selection, or a seam line: bound over the line's own range (a bound one keeps its band)
    const h = cvLines().find((r) => x >= r.x1 - 6 && x <= r.x2 + 6 && Math.abs(y - r.y) < 8 && !r.q.discrete);
    const sk = h ? -1 : collageSeamAt(cv.PC, x, y, pxAtFocus());
    const target = h ? { to: h.to, value: h.value, per: h.per === 'mul' ? 0.005 * h.value : h.per, q: h.q } : sk >= 0 ? (() => { const j = state.collage.joins[sk], key = j.op === 'morph' ? 'w' : 'r'; return { to: `J${sk}.${key}`, value: j[key], per: key === 'w' ? 1 / 150 : 1 / pxAtFocus(), q: JOIN[key] }; })() : null;
    if (target && collageTarget(state.collage, target.to)) {
      const old = cBindOf(target.to), [lo, hi] = old ? [old.lo, old.hi] : DE.handleRange(target.value, target.per, target.q);
      cvEdit((g) => CE.bindCollage(g, target.to, d.from, lo, hi));
      return;
    }
    drawCvNow();
    return;
  }
  const pr = cv.press;
  cv.press = null;
  if (!pr) return;
  clearTimeout(pr.timer);
  if (pr.moved) return;
  if (pr.dnode) { cv.dvSel = cv.dvSel === pr.dnode.id ? null : pr.dnode.id; cv.bandSel = null; drawCvNow(); return; }
  if (pr.k >= 0) { cv.sel = cv.sel && cv.sel.kind === 'join' && cv.sel.k === pr.k ? null : { kind: 'join', k: pr.k }; cv.dvSel = null; drawCvNow(); return; }
  if (pr.out) { drillInto('C'); return; }
  if (pr.i >= 0) {
    // a second click on a picked piece's op: its own graph
    if (cv.sel && cv.sel.kind === 'piece' && cv.sel.i === pr.i && pr.node) { drillInto(pr.i, pr.node.id); return; }
    cv.sel = { kind: 'piece', i: pr.i };
    cv.dvSel = null;
    setPick(pr.i);
    drawCvNow();
  }
}

function cvKey(e) {
  if (e.code === 'Escape' || (e.code === 'KeyG' && !e.repeat)) { closeCollageGraph(); return true; }
  if (e.code !== 'Delete' && e.code !== 'Backspace') return false;
  if (cv.bandSel) { const to = cv.bandSel; cv.bandSel = null; cvEdit((g) => CE.unbindCollage(g, to)); return true; }
  if (cv.dvSel) { const id = cv.dvSel; cv.dvSel = null; cvEdit((g) => CE.removeCollageDriver(g, id)); return true; }
  if (cv.sel && cv.sel.kind === 'piece' && state.collage.pieces.length > 1) {
    const i = cv.sel.i;
    cv.sel = null;
    setPick(null);
    cvEdit((g) => CE.removePiece(g, i));
    return true;
  }
  return true;
}

// ---------- the overlay toggles (DESIGN.md "Overlay toggles") ---------------------------------------
// The page's menu mark (the site's burger, a hairline here: app.css) unfolds a row of glyphs, one per
// overlay (ui/toggles.js); a choice or ROW_MS folds it. A second press of the mark while the row is out
// opens the site's own menu, as the mark does on every other page. The keys keep working; the row only
// shows them, the same on every device.
const togglesSvg = document.getElementById('toggles');
const siteNav = document.getElementById('site-menu');
const siteBox = siteNav && siteNav.querySelector('.menuToggle input');
const ROW_MS = 4000, ROW_UNFOLD_MS = 180;
// the graph's shading frame and drivers' lane, each folded away by its toggle (the collage's own
// shading, pick 'C', is only those two: always shown)
const panes = { shade: true, drive: true };
const shadeShown = () => state.pick === 'C' || panes.shade;
const driveShown = () => state.pick === 'C' || panes.drive;
let row = null;   // { t0, timer }: the row is out

function toggleOn(k) {
  if (k === 'graph') return !!(gv || cv);
  if (k === 'shade') return !!gv && shadeShown();
  if (k === 'drive') return (!!gv && driveShown()) || !!cv;
  if (k === 'surface') return !!surf;
  if (k === 'collage') return !!state.collage;
  if (k === 'structure') return !!state.structure;
  if (k === 'lyap') return state.look.lyapMix > 0;
  if (k === 'mode') return state.mode !== 'pull';
  return false;
}

// the row grows from the mark, wherever the site's stylesheet (and the safe area) put it
function rowAnchor() {
  const r = siteBox && siteBox.getBoundingClientRect();
  return r && r.width ? [r.left + r.width / 2, r.top + r.height / 2] : [innerWidth - 70, 70];
}
const rowStep = () => (COARSE || touchSeen > 0 ? 46 : 38);

function drawTogglesNow() {
  if (!row) { togglesSvg.innerHTML = ''; return; }
  const [cx, cy] = rowAnchor(), S = rowStep();
  const items = toggleLayout(cx, cy, innerWidth, innerHeight, S).map((q) => ({ ...q, on: toggleOn(q.k), glyph: q.k === 'mode' ? `mode.${state.mode}` : q.k }));
  drawToggles(togglesSvg, { items, cx, cy, S, t: Math.min(1, (performance.now() - row.t0) / ROW_UNFOLD_MS) });
}

function unfoldRow() {
  row = { t0: performance.now(), timer: 0 };
  if (siteNav) siteNav.classList.add('fe-row');
  holdRow();
  const tick = () => { if (!row) return; drawTogglesNow(); if (performance.now() - row.t0 < ROW_UNFOLD_MS) setTimeout(tick, 16); };
  tick();
}
function holdRow() { if (!row) return; clearTimeout(row.timer); row.timer = setTimeout(foldRow, ROW_MS); }
function foldRow() {
  if (!row) return;
  clearTimeout(row.timer);
  row = null;
  if (siteNav) siteNav.classList.remove('fe-row');
  drawTogglesNow();
}

// one drawing at a time: the graph, the collage's graph and the Metasurface replace each other
function clearOverlays() {
  if (grab) exitGrab();
  if (ring) closeRing(false);
  if (lens) closeLens();
  if (surf) closeSurface();
  if (gv) { gv.back = null; closeGraph(); }
  if (cv) closeCollageGraph();
}

function pressToggle(k) {
  engage();
  if (k === 'graph') { const was = !!(gv || cv); clearOverlays(); if (!was) openGraph(); }
  else if (k === 'shade' || k === 'drive') {
    if (gv && state.pick !== 'C') {
      // inside the formula's graph: the frame or the lane folds away, the network takes the room
      panes[k] = !panes[k];
      if (!panes.shade) { gv.shSel = null; gv.stopSel = null; gv.hue = null; }
      refreshGraph();
    } else if (gv) closeGraph();
    else if (k === 'drive' && cv) closeCollageGraph();
    else {
      panes[k] = true;
      clearOverlays();
      // a collage's shading is its own (pick 'C'); its drivers are the collage graph's row
      if (state.collage && k === 'shade') drillInto('C');
      else openGraph();
    }
  } else if (k === 'surface') { const was = !!surf; clearOverlays(); if (!was) openSurface(); }
  else if (k === 'collage') {
    // a collage: its graph (pieces, joins, the plus); not yet one: the Metasurface adds the first piece
    const was = !!cv;
    clearOverlays();
    if (!state.collage) openSurface('glyph');
    else if (!was) openCollageGraph();
  } else if (k === 'structure') toggleStructure();
  else if (k === 'lyap') pressKey('lyap');
  else if (k === 'mode') toggleMode();
  foldRow();
}

togglesSvg.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (e.pointerType === 'touch') touchSeen = performance.now(); holdRow(); });
togglesSvg.addEventListener('pointermove', () => holdRow());
togglesSvg.addEventListener('click', (e) => {
  const k = e.target && e.target.dataset ? e.target.dataset.toggle : null;
  if (k) pressToggle(k);
});
// the mark: unfold the row; pressed again while it is out, the site's menu (the checkbox's own behaviour)
if (siteBox) {
  siteBox.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') touchSeen = performance.now(); });
  siteBox.addEventListener('click', (e) => {
    if (!siteBox.checked) return;   // the site's menu folding
    // a figure in the paper: the mark only folds the row (the site's menu belongs to the paper around it)
    if (row) { if (EMBED) e.preventDefault(); foldRow(); return; }
    e.preventDefault();
    unfoldRow();
  });
}
addEventListener('keyup', () => { if (row) drawTogglesNow(); });

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
  if ((!S && !state.collage) || state.mode !== 'pull') return false;  // push has no surface to sense yet
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
  // a collage is sensed on the CPU (core/collage-sense.js); a formula on the GPU, where the whole-view
  // pass may be running (it is slower with many parameters): wait for it, up to 3 s
  if (state.collage) r = senseCollage(state.collage, senseView(), innerHeight, new Float32Array(uvs), { lyap: false });
  for (let tries = 0; tries < 120 && !r; tries++) {
    r = await S.sense(state.formula, senseView(), innerHeight, new Float32Array(uvs));
    if (!r) await new Promise((res) => setTimeout(res, 25));
  }
  if (!r || (press && hold !== press)) return false;
  const local = r.rays.slice(0, 25).filter((q) => q.hit);
  if (!local.length) return false;
  // the ops' parameters and the drivers' (bands, driver nodes), in the order sense measured them
  const ranked = [...r.params, ...(r.driveParams || [])].map((p, j) => {
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
  const b = basis(state.cam);
  const C = makeCamera(state.cam, b, Math.tan((state.look.fovDeg * Math.PI) / 360), innerWidth, innerHeight);
  if (state.collage) {
    // a collage's number: a placement's or a join's glyph, or the piece's op; the piece's orbit is in its
    // own frame, so none is drawn
    att.value = valueOf(state.collage, att);
    const pf = att.piece != null ? state.collage.pieces[att.piece].f : null, o = pf ? pf.slots.flat()[att.oi] : null;
    drawGrab(overlay, C, {
      screen: [grab.x, grab.y], hit: grab.hit, t: grab.t,
      attention: { op: att.op || null, key: att.key || att.ref, value: att.value, glyph: att.ref ? refGlyph(att.ref) : getOp(att.op).glyph },
      params: o ? o.p : {}, ring: grab.ring, lyap: grab.lyap, orbit: { points: [], branches: [] },
    });
    return;
  }
  const f = normalize(state.formula);
  const o = att.drive ? null : f.slots.flat()[att.oi];
  att.value = valueOf(f, att);
  const orbit = iterate(f, grab.hit, f.c || lift(f, grab.hit));
  drawGrab(overlay, C, {
    screen: [grab.x, grab.y], hit: grab.hit, t: grab.t,
    // a driver's parameter has no geometry of its own: its glyph (or its op's, for a band) and value
    attention: att.drive ? { op: null, key: att.drive, value: att.value, glyph: driveGlyphOf(f, att.drive) } : { op: att.op, key: att.key, value: att.value, glyph: getOp(att.op).glyph },
    params: o ? o.p : {}, ring: grab.ring, lyap: grab.lyap,
    // the orbit lives in 4-D: drawn where each iterate sits along the slice's axes
    orbit: { points: orbit.points.map((x4) => project(f.slice || {}, x4).x), branches: orbit.branches },
  });
}

function editGrab(x) {
  const att = grab.ranked[grab.k];
  const v = grab.value0 + (x - grab.x0) / att.pxPerUnit;
  setDoc(formatAny(withAny(doc(), att, +v.toPrecision(6))));
  drawGrabNow();
}

function passAttention(step, x) {
  grab.k = (grab.k + step + grab.ranked.length) % grab.ranked.length;
  const att = grab.ranked[grab.k];
  grab.value0 = valueOf(doc(), att);
  grab.x0 = x;
  drawGrabNow();
}

// ---------- the atlas lens --------------------------------------------------------------------------
// Two parameters of the attention op (or the next in the ranking) span the view; their ranges are what a
// drag across the screen reaches at the local metric, so the map and the hand agree. Rotation angles and
// plane normals are not offered: their records are not linear in them and the lens varies records.

// parameters whose packed record is not linear in them (the lens varies records linearly). A chimera's
// field parameters all enter its record linearly.
const NONLINEAR = (p) => p.op === 'rotate' || p.op === 'rotate4' || (p.op === 'fold.plane' && p.key !== 'd');
const INSET_R = 70;
let lens = null;

function openLens() {
  // the lens varies a formula's op records in one pass: a collage has no such pass yet
  if (!grab || grab.knobs || lens || state.collage) return false;
  const att = grab.ranked[grab.k];
  // a driver's parameter is not offered: the lens varies op records, the drivers' program is not one
  const linear = grab.ranked.filter((p) => !p.drive && !NONLINEAR(p));
  const p1 = !att.drive && !NONLINEAR(att) ? att : linear[0];
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
    grab.value0 = valueOf(doc(), att);
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
  gizmoDue = true;
  writeHash();
}

let drag = null;
let clickAt = null;   // a press that may be a click (in a collage: picks the piece under it)
const pointers = new Map();
// The drift greets an arrival; the first real input turns it off so the field holds still while it is
// worked on (Space turns it back on)
function engage() { if (!state.engaged) { state.engaged = true; state.drift = false; } }

canvas.addEventListener('pointerdown', (e) => {
  engage();
  stopReplay();
  try { canvas.setPointerCapture(e.pointerId); } catch { /* a pointer the browser does not track */ }
  inputTouch = e.pointerType === 'touch';
  if (inputTouch && (surf || gv || cv)) viewTap(e);
  if (surf) { surfDown(e); return; }
  if (gv) { if (!graphTouch(e)) graphDown(viewEv(e)); return; }
  if (cv) { if (!graphTouch(e)) { const v = viewEv(e); cvDown(v.clientX, v.clientY); } return; }
  // the picked piece's frame: an axis, the ring or the corner
  if (pointers.size === 0 && state.collage && gizmoG && gizmoDown(e.clientX, e.clientY, e.pointerType === 'touch' ? 2.5 : 1)) { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); return; }
  if (e.pointerType === 'touch' && touchDown(e)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  clickAt = pointers.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  if (pointers.size === 1) {
    drag = { x: e.clientX, y: e.clientY };
    const h = { x: e.clientX, y: e.clientY };
    // a finger grabs what is at the crosshair in the centre of the screen and edits it by its drag
    const aim = e.pointerType === 'touch' ? [innerWidth / 2, innerHeight / 2] : [h.x, h.y];
    h.timer = setTimeout(() => { if (hold === h) enterGrab(aim[0], aim[1], h).then((ok) => { if (ok) { drag = null; if (grab) grab.x0 = pointers.size ? [...pointers.values()][0].x : h.x; } }); }, HOLD_MS);
    // still longer: the breed ring (pull and push; the loop's hold is its knobs)
    h.ringTimer = setTimeout(() => {
      if (hold !== h || state.mode === 'loop' || (grab && grab.moved)) return;
      drag = null;
      // on a phone the ring opens in the middle of the screen, where it fits; the finger points from
      // where it pressed
      if (e.pointerType === 'touch') openRing(innerWidth / 2, innerHeight / 2, 1, [h.x, h.y]); else openRing(h.x, h.y);
    }, RING_MS);
    hold = h;
    document.body.classList.add('grab');
  } else if (hold) { clearTimeout(hold.timer); clearTimeout(hold.ringTimer); hold = null; }
});
canvas.addEventListener('pointermove', (e) => {
  if (vtap && vtap.starts.has(e.pointerId)) viewTap(e);
  if (surf) { surfMove(e); return; }
  if (gv) { if (!graphTouch(e)) graphMove(viewEv(e)); return; }
  if (cv) { if (!graphTouch(e)) { const v = viewEv(e); cvMove(v.clientX, v.clientY); } return; }
  if (tmod && e.pointerId === tmod.id) { touchModMove(e); return; }
  if (gz) { gizmoMove(e.clientX, e.clientY, e.shiftKey || !!tmod); return; }
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  if (clickAt && Math.hypot(e.clientX - clickAt.x, e.clientY - clickAt.y) > HOLD_SLOP) clickAt = null;
  if (tg && tg.starts.has(e.pointerId)) { const [sx, sy] = tg.starts.get(e.pointerId); tg.travel = Math.max(tg.travel, Math.hypot(e.clientX - sx, e.clientY - sy)); }
  if (ring) { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); pointRing(e.clientX, e.clientY); if (tmod) ringPinch(); return; }
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
  if (pointers.size >= 2) { multiMove(e); return; }
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

// ---------- touch (DESIGN.md "Touch") ---------------------------------------------------------------
// Desktop decides what happens; fingers reach it without keys, wheel or hover.
//   two fingers        pinch moves along the view (the wheel), pan moves sideways and up (WASD, QE); in
//                      the loop pinch zooms its window, pan moves it, twist rolls it (shift-drag)
//   three fingers      the slice: drag tilts it (Option-drag), pinch moves it along w (Option-wheel)
//   tap with two/three the parent / the newest child (⌘Z / ⇧⌘Z)
//   double tap         pull → push → loop (P)
//   tap a corner mark  the structure layer (Tab); its glyph row holds L, R, M and Space
//   hold               grabs what is at the crosshair in the centre of the screen (the finger would
//                      hide what it holds); the drag edits it as the mouse's does
//   a second finger    in a grab, the lens, the knobs, the ring or a gizmo drag it is the modifier:
//                      resting, Shift (the lens; the gizmo snaps); a tap, a wheel notch (the next op,
//                      the next knob pair, farther neighbours); a double tap, F (pin). In the ring a
//                      pinch brings farther or nearer neighbours
const TAP_MS = 300, TAP_SLOP = 12, DTAP_PX = 30, CORNER_PX = 64;
let tg = null;      // the fingers on the field: { n (most at once), t0, starts, travel, live }
let tmod = null;    // the modifier finger: { id, x, y, t0, moved, timer, lens, d0 }
let tapAt = null;   // the last one-finger tap: a second one soon and near is a double tap
let modTapAt = 0;   // the last modifier tap: a second one soon is a pin

function touchDown(e) {
  touchSeen = performance.now();
  const busy = grab || lens || ring || gz;
  if (busy) {
    // the second finger: the modifier (a third is ignored)
    if (tmod || (!pointers.size && !gz)) return true;
    tmod = { id: e.pointerId, x: e.clientX, y: e.clientY, t0: performance.now(), moved: false, lens: false };
    // a grab worked with the modifier is not a hold waiting for the ring
    if (hold) clearTimeout(hold.ringTimer);
    if (ring) { const [p] = pointers.values(); tmod.d0 = Math.hypot(p.x - e.clientX, p.y - e.clientY); }
    if (grab && !grab.knobs) tmod.timer = setTimeout(() => { if (tmod && !tmod.moved && grab && !lens) tmod.lens = openLens(); }, HOLD_MS);
    return true;
  }
  if (!pointers.size) tg = { n: 0, t0: performance.now(), starts: new Map(), travel: 0, live: false };
  if (tg) { tg.starts.set(e.pointerId, [e.clientX, e.clientY]); tg.n = Math.max(tg.n, pointers.size + 1); }
  return false;
}

function touchModMove(e) {
  if (Math.hypot(e.clientX - tmod.x, e.clientY - tmod.y) > TAP_SLOP && !tmod.lens) { tmod.moved = true; clearTimeout(tmod.timer); }
  tmod.cx = e.clientX; tmod.cy = e.clientY;
  if (ring) ringPinch();
}

// the ring's pinch: apart by a third, the next farther neighbours; together, the nearer
function ringPinch() {
  if (!ring || !tmod || tmod.d0 == null || tmod.cx == null || !pointers.size) return;
  const [p] = pointers.values(), d = Math.hypot(p.x - tmod.cx, p.y - tmod.cy);
  if (d > tmod.d0 * 1.35 || d < tmod.d0 / 1.35) { ringScale(d > tmod.d0 ? 1 : -1); tmod.d0 = d; tmod.moved = true; }
}
function ringScale(step) {
  const { at, origin } = ring, sc = ring.scale * (step > 0 ? 1.5 : 1 / 1.5);
  ring = null;
  openRing(at[0], at[1], sc, origin);
}

function touchModUp(e) {
  const m = tmod;
  tmod = null;
  clearTimeout(m.timer);
  if (m.lens) { if (lens) closeLens(); return; }
  if (m.moved || performance.now() - m.t0 > TAP_MS || e.type === 'pointercancel') return;
  // a tap: a wheel notch
  const [p] = pointers.size ? pointers.values() : [{ x: m.x, y: m.y }];
  if (ring) ringScale(1);
  else if (grab && grab.knobs) nextKnobs(1, p.x, p.y);
  else if (grab) {
    if (performance.now() - modTapAt < 350) { passAttention(-1, p.x); togglePin(); modTapAt = 0; }
    else { passAttention(1, p.x); modTapAt = performance.now(); }
  }
}

// two or three fingers on the field; nothing moves until they have travelled past a tap's slop
function multiMove(e) {
  const before = [...pointers.values()];
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const after = [...pointers.values()];
  if (tg && !tg.live) { if (tg.travel <= TAP_SLOP) return; tg.live = true; }
  const mid = (q) => [q.reduce((s, p) => s + p.x, 0) / q.length, q.reduce((s, p) => s + p.y, 0) / q.length];
  const spread = (q) => { const [cx, cy] = mid(q); return q.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / q.length; };
  const [x0, y0] = mid(before), [x1, y1] = mid(after), dx = x1 - x0, dy = y1 - y0;
  const s0 = spread(before), s1 = spread(after);
  if (after.length >= 3) {
    sliceDrag(dx, dy);
    if (s1 !== s0) sliceBy((s1 - s0) * 0.002 * Math.max(0.02, deAt(state.cam.pos)), null);
    return;
  }
  if (state.mode === 'loop') {
    const ang = (q) => Math.atan2(q[1].y - q[0].y, q[1].x - q[0].x);
    let da = ang(after) - ang(before);
    da = Math.atan2(Math.sin(da), Math.cos(da));
    if (s0 > 0 && s1 > 0) zoomLoop(s0 / s1);
    panLoop(dx, dy);
    rollLoop(da);
    touched();
    return;
  }
  // the pinch as before (the distance between two fingers is twice their spread), the pan carries the
  // camera the other way, so the field follows the fingers
  const { fwd, right, up } = basis(state.cam), d = deAt(state.cam.pos);
  moveBy(fwd, 2 * (s1 - s0) * 0.004 * d);
  moveBy(right, -dx * 0.004 * d);
  moveBy(up, dy * 0.004 * d);
  touched();
}

// over the Metasurface and the graphs a tap of two fingers is Esc: the selection, then the view, goes
let vtap = null;   // { n, t0, starts, travel, up }
function viewTap(e) {
  if (e.type === 'pointerdown') {
    if (!vtap || !vtap.starts.size) vtap = { n: 0, t0: performance.now(), starts: new Map(), travel: 0 };
    vtap.starts.set(e.pointerId, [e.clientX, e.clientY]);
    vtap.n = Math.max(vtap.n, vtap.starts.size);
    return false;
  }
  const [sx, sy] = vtap.starts.get(e.pointerId);
  vtap.travel = Math.max(vtap.travel, Math.hypot(e.clientX - sx, e.clientY - sy));
  if (e.type === 'pointermove') return false;
  vtap.starts.delete(e.pointerId);
  if (vtap.starts.size || vtap.n < 2 || vtap.travel > TAP_SLOP || performance.now() - vtap.t0 > TAP_MS || e.type === 'pointercancel') return false;
  // three fingers on a graph: Delete (the selection goes); two anywhere here: Esc. What the first finger
  // pressed is let go without acting
  const code = vtap.n === 3 ? 'Delete' : 'Escape';
  vtap = null; gt = null;
  if (surf) { if (code === 'Escape') { if (surf.stroke) surf.stroke = null; closeSurface(); } }
  else if (gv) { viewLetGo(); graphKey({ code }); }
  else if (cv) { viewLetGo(); cvKey({ code }); }
  return true;
}

// a graph under the fingers: two pinch and pan it (closed past 0.6 of its size, it folds away), the press
// the first one began is let go; with the hue ring held, the second finger sets lightness (up and down)
// and alpha (sideways) as the scroll and shift-scroll do
let gview = { k: 1, tx: 0, ty: 0 };
let gt = null;   // { pts, multi, travel, text0, hue }
const viewXY = (e) => [(e.clientX - gview.tx) / gview.k, (e.clientY - gview.ty) / gview.k];
function viewEv(e) {
  const [x, y] = viewXY(e);
  return { clientX: x, clientY: y, shiftKey: e.shiftKey, altKey: e.altKey, pointerType: e.pointerType, pointerId: e.pointerId, type: e.type };
}
// the overlay's drawing (after its dimming rect) in the graph's view
function viewWrap(svg) {
  if (gview.k === 1 && !gview.tx && !gview.ty) return svg;
  const i = svg.indexOf('/>') + 2;
  return `${svg.slice(0, i)}<g class="vz" transform="translate(${gview.tx.toFixed(1)} ${gview.ty.toFixed(1)}) scale(${gview.k.toFixed(4)})">${svg.slice(i)}</g>`;
}
function viewLetGo() {
  const g = gv || cv;
  if (!g) return;
  for (const k of ['press', 'dvPress', 'shPress', 'shStop']) if (g[k] && g[k].timer) clearTimeout(g[k].timer);
  for (const k of ['press', 'drag', 'param', 'band', 'pull', 'dvDrag', 'dvPress', 'dvParam', 'picker', 'shPress', 'shDrag', 'shStop', 'shParam', 'hue', 'letter', 'outside']) g[k] = null;
  if (gt && gt.text0 != null && state.text !== gt.text0) setFormula(gt.text0, true);
  if (gv) refreshGraph(); else cvRefresh();
}
function graphTouch(e) {
  if (e.pointerType !== 'touch') return false;
  const id = e.pointerId;
  if (e.type === 'pointerdown') {
    if (!gt || !gt.pts.size) gt = { pts: new Map(), multi: false, travel: 0, text0: state.text };
    gt.pts.set(id, [e.clientX, e.clientY, e.clientX, e.clientY]);
    if (gt.pts.size === 1) return false;
    if (!gt.multi) {
      gt.multi = true;
      if (gv && gv.hue) { gt.hue = { id, x: e.clientX, y: e.clientY, v: gv.hue.v, a: gv.hue.a }; return true; }
      viewLetGo();
    }
    return true;
  }
  if (!gt || !gt.pts.has(id)) return false;
  if (e.type === 'pointermove') {
    const p = gt.pts.get(id);
    gt.travel = Math.max(gt.travel, Math.hypot(e.clientX - p[2], e.clientY - p[3]));
    if (!gt.multi) { p[0] = e.clientX; p[1] = e.clientY; return false; }
    if (gt.hue) {
      if (id !== gt.hue.id) return false;   // the ring's own finger: hue and saturation
      const r = gv && gv.hue, cl = (v) => Math.min(1, Math.max(0, v));
      if (r) {
        r.v = cl(gt.hue.v - (e.clientY - gt.hue.y) / 200); r.a = cl(gt.hue.a + (e.clientX - gt.hue.x) / 200);
        r.css = hsvToCss(r.h, r.s, r.v);
        shadeLive(() => SE.setStopColour(state.formula, r.id, r.i, [...hsvToLinear(r.h, r.s, r.v), r.a]));
      }
      return true;
    }
    const before = [...gt.pts.values()].map(([x, y]) => [x, y]);
    p[0] = e.clientX; p[1] = e.clientY;
    if (gt.travel <= TAP_SLOP || gt.pts.size < 2) return true;
    const after = [...gt.pts.values()].map(([x, y]) => [x, y]);
    const mid = (q) => [q.reduce((s, a) => s + a[0], 0) / q.length, q.reduce((s, a) => s + a[1], 0) / q.length];
    const spread = (q) => { const [cx, cy] = mid(q); return q.reduce((s, a) => s + Math.hypot(a[0] - cx, a[1] - cy), 0) / q.length; };
    const [x0, y0] = mid(before), [x1, y1] = mid(after), f = spread(before) > 0 ? spread(after) / spread(before) : 1;
    const k = Math.min(6, Math.max(0.3, gview.k * f)), r = k / gview.k;
    // the point under the fingers' middle stays under it
    gview = { k, tx: x1 - (x0 - gview.tx) * r, ty: y1 - (y0 - gview.ty) * r };
    if (gv) drawGraphNow(); else drawCvNow();
    return true;
  }
  gt.pts.delete(id);
  if (!gt.multi) return false;
  if (gt.hue) {
    if (id !== gt.hue.id) return false;
    gt.hue = null; gt.multi = false;
    return true;
  }
  if (!gt.pts.size) {
    gt = null;
    if (gview.k < 0.6) { if (gv) closeGraph(); else closeCollageGraph(); }
  }
  return true;
}

// all fingers up: a tap of two or three is the lineage, one the corner marks or a double tap
function touchEnd(g, e) {
  if (grab || ring || lens || e.type === 'pointercancel' || g.live || g.travel > TAP_SLOP || performance.now() - g.t0 > TAP_MS) { tapAt = null; return false; }
  if (g.n >= 2) {
    const n = g.n === 2 ? lineage.parent() : lineage.child();
    if (n) restore(lineage.jump(n.id));
    tapAt = null;
    return true;
  }
  const x = e.clientX, y = e.clientY;
  if ((x < CORNER_PX || x > innerWidth - CORNER_PX) && (y < CORNER_PX || y > innerHeight - CORNER_PX)) { toggleStructure(); tapAt = null; return true; }
  const t = performance.now();
  if (tapAt && t - tapAt.t < TAP_MS + 100 && Math.hypot(x - tapAt.x, y - tapAt.y) < DTAP_PX) { tapAt = null; toggleMode(); return true; }
  tapAt = { x, y, t };
  return false;
}

const release = (e) => {
  if (vtap && vtap.starts.has(e.pointerId) && viewTap(e)) return;
  if (surf) { surfUp(e); return; }
  if (gv) { if (!graphTouch(e)) graphUp(viewEv(e)); return; }
  if (cv) { if (!graphTouch(e)) { const v = viewEv(e); cvUp(v.clientX, v.clientY); } return; }
  if (tmod && e.pointerId === tmod.id) { touchModUp(e); return; }
  if (gz) { pointers.delete(e.pointerId); gizmoUp(); return; }
  pointers.delete(e.pointerId);
  // a click (short and still) in a collage: the piece under it
  let click = clickAt && performance.now() - clickAt.t < HOLD_MS && !grab && !ring && !lens;
  clickAt = null;
  if (tg && pointers.size === 0) { const g = tg; tg = null; if (touchEnd(g, e)) click = false; }
  if (click && state.collage && pointers.size === 0) pickAt(e.clientX, e.clientY);
  // a finger left of two: the one still down carries the look on from where it is
  if (pointers.size === 1 && drag) { const [p] = pointers.values(); drag = { x: p.x, y: p.y }; }
  if (pointers.size === 0) {
    if (sliceMoved && e.pointerType === 'touch') { sliceMoved = false; writeHash(); remember(); }
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
  engage();
  if (gv && gv.hue) { hueWheel(e); return; }
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
  if (next === 'loop' && (!LP || state.collage)) { state.mode = 'pull'; }
  else if (next === 'loop') {
    // the loop starts from the field just seen, through a window placed where the view was focused
    state.mode = 'loop'; state.loopSeed = 2; placeLoopWindow();
  } else flowTo(next);
  touched();
  writeHash();
  remember();
}
// a browser may make a dblclick of a finger's double tap (touchEnd has taken it) and a context menu of a
// long press; Safari pinches the page itself unless its gesture events are refused
canvas.addEventListener('dblclick', () => { if (performance.now() - touchSeen > 1000) toggleMode(); });
canvas.addEventListener('contextmenu', (e) => { if (performance.now() - touchSeen < 1500) e.preventDefault(); });
for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, (e) => e.preventDefault());

addEventListener('keydown', (e) => {
  if (e.code !== 'Space') engage();
  if (e.code === 'Escape' && row) { foldRow(); return; }
  if (e.code === 'Escape' && surf) { closeSurface(); return; }
  if (gv && graphKey(e)) return;
  if (cv && cvKey(e)) return;
  if (e.code === 'KeyG' && !e.repeat && !grab && !ring && !lens && !surf) { openGraph(); return; }
  if (e.code === 'Escape' && state.collage && typeof state.pick === 'number' && !grab && !ring) { setPick(null); return; }
  if (e.code === 'KeyM' && !e.repeat && !grab && !ring && !lens) { if (surf) closeSurface(); else openSurface(); return; }
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
  if (e.code === 'Space') { state.engaged = true; state.drift = !state.drift; touched(); e.preventDefault(); return; }
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

const steer = { dy: 0, dp: 0 };   // the drift's heading, low-passed

function drift(dt) {
  if (!state.drift || grab || surf || gv || performance.now() - state.lastInput < 4000) return false;
  herd(dt);
  if (state.mode === 'loop') { if (state.loopWin) rollLoop(dt * 0.03); return true; }
  const c = state.cam, here = deAt(c.pos);
  let best = { s: -1, dy: 0, dp: 0 };
  for (const [dy, dp] of [[0, 0], [0.25, 0], [-0.25, 0], [0, 0.18], [0, -0.18]]) {
    const b = basis({ yaw: c.yaw + dy, pitch: c.pitch + dp });
    const s = deAt(add(c.pos, b.fwd, here * 3));
    if (s > best.s) best = { s, dy, dp };
  }
  // the most open way changes its mind from frame to frame where two are nearly equal: steer toward it
  // through a low-pass (≈1.5 s), never by the frame's own choice
  const k = Math.min(1, dt * 0.7);
  steer.dy += (best.dy - steer.dy) * k;
  steer.dp += (best.dp - steer.dp) * k;
  c.yaw += steer.dy * dt * 0.35 + Math.sin(state.frame * 0.003) * dt * 0.02;
  c.pitch = Math.max(-1.2, Math.min(1.2, c.pitch * (1 - dt * 0.05) + steer.dp * dt * 0.35));
  moveBy(basis(c).fwd, here * 0.08 * dt);
  state.dirty = true;
  return true;
}

// Herding: each unpinned parameter wanders smoothly about its home value — a sum of three slow sines
// (periods 11–50 s, random phases, zero when the drift starts) in pixels on screen divided by the
// parameter's metric when the wander began, so every parameter moves the same few pixels, calm or
// chaotic. (It was an Ornstein–Uhlenbeck walk: a fresh random step every frame, which read as a
// shiver, not a drift.) Needs the metric of a sensing pass; until then it waits.
const HERD_PX = 8;
const pinned = () => new Set(state.pins.flatMap((p) => p.keys));
let herdT = 0;
const wander = new Map();   // parameter id → { scale (units per px), waves: [{ f, ph }] }

function herd(dt) {
  // the ops' parameters and the drivers' wander alike
  const m = state.sensed && metricOf(state.sensed);
  if (!m || !m.length) return;
  let f = normDoc(doc());
  if (!state.home) {
    state.home = Object.fromEntries(m.map((p) => [pid(p), valueOf(f, p)]));
    herdT = 0;
    wander.clear();
  }
  herdT += dt;
  const pins = pinned();
  let changed = false;
  for (const p of m) {
    const id = pid(p);
    if (pins.has(id) || !(p.pxPerUnit > 0) || state.home[id] === undefined) continue;
    let w = wander.get(id);
    if (!w) {
      w = { scale: 1 / p.pxPerUnit, waves: [0, 1, 2].map(() => ({ f: 0.02 + Math.random() * 0.07, ph: Math.random() * Math.PI * 2 })) };
      wander.set(id, w);
    }
    const off = w.waves.reduce((a, q) => a + Math.sin(2 * Math.PI * q.f * herdT + q.ph) - Math.sin(q.ph), 0) / Math.sqrt(3);
    const nv = state.home[id] + HERD_PX * w.scale * off;
    f = withAny(f, p, +nv.toPrecision(7));
    changed = true;
  }
  if (changed) setDoc(formatAny(f), true);
}

// a pin freezes the parameters that move the held region: those scoring at least a quarter of the top
function togglePin() {
  if (!grab || grab.knobs) return;
  const C = makeCamera(state.cam, basis(state.cam), Math.tan((state.look.fovDeg * Math.PI) / 360), innerWidth, innerHeight);
  const near = state.pins.findIndex((p) => { const q = C.project(p.x); return q && Math.hypot(q[0] - grab.x, q[1] - grab.y) < 30; });
  if (near >= 0) state.pins.splice(near, 1);
  else {
    const top = grab.ranked[0].score;
    state.pins.push({ x: [...grab.hit], keys: grab.ranked.filter((p) => p.score >= top / 4).map(pid) });
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
  if (EMBED) return;
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

// The document on screen is a formula or a collage (DESIGN.md "Collage (K)"). setDoc replaces it with
// either; setFormula is the formula tools' edit — on a formula it is setDoc, on a collage it lands in the
// picked piece (piece 0 when none is), or in the collage's own shading while that is open (pick 'C').
const doc = () => state.collage || state.formula;
const docStructure = (x) => (isCollage(x) ? 'C' + collageStructure(x) : structureOf(normalize(x)));
const hashDoc = (x) => (isCollage(x) ? hashCollage(x) : hash(x));

// the collage's own shading as a formula the shading frame can edit: one translate, the collage's shade,
// and the collage's own drivers as its drive — the only drivers the frame offers (decided with iori
// 2026-10-28: a collage's colour reads the collage's drivers, never a piece's). The proxy's drive has no
// bindings (the shape's stay the collage's); a param node reads a collage number, so it holds its value.
const PROXY = 'translate ×1';
function proxyDrive(c) {
  if (!c.drive || !c.drive.nodes.length) return null;
  return { nodes: c.drive.nodes.map((m) => (m.type === 'param' ? { id: m.id, type: 'math', in: {}, p: { op: 'add', c: CE.getCollageParam(c, m.p.of) ?? 0 } } : m)), bind: [] };
}
function pickedFormula(c, pick) {
  if (pick === 'C') { const d = proxyDrive(c); return normalize({ ...parse(PROXY), ...(d ? { drive: d } : {}), ...(c.shade ? { shade: c.shade } : {}) }); }
  return normalize(c.pieces[typeof pick === 'number' ? pick : 0].f);
}

// another document on screen: the metric and a morph or walk under way stay only while they still
// describe it (core/carry.js); a metric dropped is measured again at the next pass
function carryTo(structure) {
  const k = carry(state, structure, transWriting);
  if (state.sensed && !k.sensed) { state.home = null; state.senseDue = true; }
  state.sensed = k.sensed;
  state.trans = k.trans;
}

function setDoc(text, quiet = false) {
  if (isCollageText(text)) { setCollage(parseAny(text), quiet); return; }
  const f = parse(text);
  const v = validate(f);
  if (!v.ok) throw new Error(v.errors.join('; '));
  const st = structureOf(normalize(f));
  carryTo(st);
  const same = !state.collage && !!state.formula && st === structureOf(normalize(state.formula));
  if (state.collage) { state.collage = null; state.pick = null; cv = null; }
  state.formula = f;
  state.text = format(f);
  shownCollage = null;
  if (R) R.setFormula(f);
  // walkers stay on a slowly changing attractor; a new structure scatters them
  if (P && !same) P.resetWalkers();
  if (quiet) { state.n = 0; state.dirty = true; } else { touched(); state.home = null; }
  gizmoDue = true;
}

function setCollage(c, quiet = false) {
  const v = validateCollage(c);
  if (!v.ok) throw new Error(v.errors.join('; '));
  carryTo(docStructure(normCollage(c)));
  const was = state.collage;
  state.collage = normCollage(c);
  const N = state.collage.pieces.length;
  if (typeof state.pick === 'number' && state.pick >= N) state.pick = null;
  state.formula = pickedFormula(state.collage, state.pick);
  state.text = formatCollage(state.collage);
  shownCollage = prepareCollage(state.collage);
  if (R) R.setCollage(shownCollage);
  if (P && (!was || collageStructure(was) !== collageStructure(state.collage))) P.resetWalkers();
  if (quiet) { state.n = 0; state.dirty = true; } else { touched(); state.home = null; }
  gizmoDue = true;
}

function setFormula(text, quiet = false) {
  if (!state.collage || isCollageText(text)) { setDoc(text, quiet); return; }
  const f = parse(text);
  const v = validate(f);
  if (!v.ok) throw new Error(v.errors.join('; '));
  const c = JSON.parse(JSON.stringify(state.collage));
  // the collage's shading: its network, links and bindings to the collage's drivers included (the proxy's
  // drive is the collage's own and is not written back)
  if (state.pick === 'C') { if (f.shade) c.shade = normalize(f).shade; else delete c.shade; }
  else c.pieces[typeof state.pick === 'number' ? state.pick : 0].f = normalize(f);
  setCollage(c, quiet);
}

// the renderer draws a document (exports borrow it frame by frame)
const showDoc = (x) => (isCollage(x) ? R.setCollage(prepareCollage(x)) : R.setFormula(x));

// the pick changed: the formula the tools edit follows it
function setPick(pick) {
  if (!state.collage) return;
  state.pick = pick;
  state.formula = pickedFormula(state.collage, pick);
  gizmoDue = true;
  drawStructureNow();
}

function sizeCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; state.n = 0; }
}

// Governor: the next frame is submitted only after the GPU finished the last one, so work never
// queues up (a stalled queue froze this Mac once). Resolution follows the measured GPU time.
let gpuMs = 16, lastScaleChange = 0;
// While moving, resolution follows the frame time in small steps. On stopping it jumps once to the still
// resolution the measured frame time affords, then holds until the next move: every change restarts the
// accumulation, and stepping up 8 % every 400 ms rebuilt the still image several times in its first
// seconds (it read as the field moving on its own).
let stillSettled = false;
function govern(moving) {
  const target = moving ? 18 : 45;
  const now = performance.now();
  if (!moving) {
    if (stillSettled || !(gpuMs > 0)) return;
    stillSettled = true;
    const s = Math.max(0.25, Math.min(1, Math.round(state.scale * Math.sqrt(target / gpuMs) * 20) / 20));
    if (s !== state.scale) { state.scale = s; state.n = 0; lastScaleChange = now; }
    return;
  }
  stillSettled = false;
  if (now - lastScaleChange < 400) return;
  let s = state.scale;
  if (gpuMs > target * 1.25) s *= 0.85;
  else if (gpuMs < target * 0.6) s *= 1.08;
  const max = moving ? 0.75 : 1;
  s = Math.max(0.25, Math.min(max, Math.round(s * 20) / 20));
  if (s !== state.scale) { state.scale = s; state.n = 0; lastScaleChange = now; }
}

let last = performance.now(), busy = false;
const clock0 = performance.now();
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
  // a formula driven by the clock animates on its own: never still, its frames a soft trail
  const animated = docTimeDriven();
  if (animated) R.setClock((now - clock0) / 1000);
  // the open graph's bands follow the clock: their ticks redrawn a few times a second while nothing is held
  if (animated && gv && !gv.from && now - (gv.liveAt || 0) > 150 && !gv.param && !gv.dvParam && !gv.band && !gv.picker && !gv.dvDrag) { gv.liveAt = now; drawGraphNow(); }
  const moving = interacting || drifting || !!state.trans || animated;
  // a flow renders in the loop engine whatever mode it is heading for
  const mode = state.trans && state.trans.kind === 'flow' ? 'loop' : state.mode;
  govern(moving);

  // a collage has no one map for the loop to feed back through
  if (!P || (state.mode === 'loop' && (!LP || state.collage))) state.mode = 'pull';
  const E = mode === 'push' ? P : mode === 'loop' ? LP : R;
  if (E.resize(canvas.width * state.scale, canvas.height * state.scale)) state.n = 0;
  if (!moving && state.n >= state.maxSamples && mode !== 'loop') return false;

  if (moving || state.dirty) {
    state.focus += (traceCentre() - state.focus) * (moving ? 0.35 : 1);
    if (!drifting) writeHash();
  }
  state.dirty = false;

  // drift blends a short history (a soft trail); stillness converges
  const blend = (drifting || animated) && !interacting ? Math.max(1 / (state.n + 1), 1 / 8) : 1 / (state.n + 1);
  const b = basis(state.cam);
  const L = state.look;
  const clear = Math.max(deAt(state.cam.pos), 1e-5);
  const lamp = [0, 1, 2].map((i) => state.cam.pos[i] + (b.right[i] * L.lamp[0] + b.up[i] * L.lamp[1] + b.fwd[i] * L.lamp[2]) * clear);
  if (mode === 'push') {
    pushFrame(b, clear, moving, drifting && !interacting);
  } else if (mode === 'loop') {
    loopFrame(b);
  } else R.frame(pullView(b, clear, blend, moving));
  // no JIT for collages yet: the interpreter draws them
  if (!moving && !state.trans && mode === 'pull' && R.compileJit && !state.collage) R.compileJit(state.formula).catch((e) => console.warn(e.message));
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
  if (moving || gizmoDue) drawGizmoNow();
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
const viewKey = () => docStructure(doc()) + '|' + state.cam.pos.map((v) => Math.round(v * 4)).join(',') + ',' + Math.round(state.cam.yaw * 5) + ',' + Math.round(state.cam.pitch * 5);
const rnd = () => Math.random();

async function growArchive() {
  if (archiveBusy || (!S && !state.collage) || !state.sensed || grab || state.trans) return;
  const now = performance.now();
  if (now - lastArchive < 150) return;
  lastArchive = now;
  archiveBusy = true;
  try {
    const key = viewKey();
    if (archive.structure !== key) archive.reset(key, state.sensed.lyap);
    const elites = archive.elites();
    const parent = elites.length && rnd() < 0.6 ? normDoc(parseAny(elites[Math.floor(rnd() * elites.length)].text)) : doc();
    const cand = isCollage(parent) ? mutateCollage(parent, metricOf(state.sensed), pinned(), 30 + rnd() * 190, rnd) : mutate(parent, metricOf(state.sensed), pinned(), 30 + rnd() * 190, rnd);
    const r = await senseOther(cand);
    if (r && archive.structure === key) archive.offer({ text: formatAny(cand), features: features(r) });
  } finally { archiveBusy = false; }
}

// a small sensing pass of another document: a formula on the GPU, a collage on the CPU (no parameters)
const senseOther = (x) => (isCollage(x) ? Promise.resolve(senseCollage(x, senseView(), innerHeight, SMALL, { params: false })) : S.sense(x, senseView(), innerHeight, SMALL, true));

const RING_MS = 1200, LOCAL_D = [35, 60, 90, 130], FAR_D = [170, 230, 300, 380];
let ring = null;

function thumbView(b, pos = state.cam.pos, clear0 = null) {
  const L = state.look;
  const clear = Math.max(clear0 ?? deAt(pos), 1e-5);
  const lamp = [0, 1, 2].map((i) => pos[i] + (b.right[i] * L.lamp[0] + b.up[i] * L.lamp[1] + b.fwd[i] * L.lamp[2]) * clear);
  return {
    pos, tanHalfFov: Math.tan((L.fovDeg * Math.PI) / 360), right: b.right, aperture: 0, up: b.up,
    focus: Math.max(state.focus, 1e-4), fwd: b.fwd, blend: 1, light: lamp, glow: L.glow, lampRange: L.lampRange * clear,
    lampPower: L.lampPower, hue: L.hue, fog: L.fog / Math.max(clear * 8, 1e-4), exposure: L.exposure, terrace: L.terrace,
    stepScale: L.stepScale, maxDist: L.maxDist, epsScale: L.epsScale, frame: 0, key: L.key, ambient: L.ambient,
    maxSteps: 160, glowWidth: L.glowWidth, iridescence: L.iridescence, spread: L.spread, shadowK: L.shadowK, quality: 0,
  };
}

// origin: where the finger pressed (a ring opened for a finger stays unopened if it lifts meanwhile)
async function openRing(x, y, scale = 1, origin = null) {
  if ((!S && !state.collage) || !state.sensed || !R) return false;
  exitGrab();
  const metric = metricOf(state.sensed);
  const pins = pinned();
  // a collage breeds piece by piece, its placements and joins too (core/collage-breed.js)
  const f0 = normDoc(doc()), col = isCollage(f0);
  const step = (D) => (col ? mutateCollage(f0, metric, pins, D * scale, rnd) : mutate(f0, metric, pins, D * scale, rnd));
  const here = await senseOther(f0).catch(() => null);
  if (origin && !pointers.size) return false;
  const ft0 = here ? features(here) : { density: 0.5, chaos: state.sensed.lyap.median };
  const locals = LOCAL_D.map((D) => ({ f: step(D), local: true }));
  // the archive serves the view it was grown for (another structure's elites, a formula's in a collage, are not neighbours)
  const fromArchive = spread(archive.structure === viewKey() ? archive.elites() : [], ft0, 4).map((e) => ({ f: normDoc(parseAny(e.text)), local: false, features: e.features }));
  const fars = FAR_D.slice(fromArchive.length).map((D) => ({ f: step(D), local: false }));
  const items = [...locals, ...fromArchive, ...fars].slice(0, 8);
  ring = { at: [x, y], items, sel: -1, scale, origin };
  // spokes shorten on a small screen so the farthest neighbour still fits around the centre
  const fit = Math.min(1, (Math.min(innerWidth, innerHeight) / 2 - 44) / 220);
  // features for the angle, then the layout: the cyclic order of feature directions, evenly spaced
  for (const it of items) {
    if (!it.features) { const r = await senseOther(it.f).catch(() => null); it.features = r ? features(r) : ft0; }
    it.D = col ? collageDistancePx(f0, it.f, metric) : distancePx(f0, it.f, metric);
    it.dir = Math.atan2(it.features.chaos - ft0.chaos, (it.features.density - ft0.density) * 4) || Math.random() * 6.28;
    it.len = (110 + 110 * Math.tanh(it.D / 160)) * fit;
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

function drawRingNow() {
  if (!ring) return;
  drawRing(overlay, { at: ring.at, items: ring.items.filter((it) => it.angle !== undefined), sel: ring.sel });
  // a neighbour carried out past its thumbnail: it follows the hand, to be dropped as a piece
  if (ring.drop) {
    const it = ring.items[ring.sel], [x, y] = ring.drop;
    overlay.insertAdjacentHTML('beforeend', `<g class="dg">${it.thumb ? `<image href="${it.thumb}" x="${x + 14}" y="${y + 14}" width="120" height="80" preserveAspectRatio="xMidYMid slice" opacity="0.8"/><rect x="${x + 14}" y="${y + 14}" width="120" height="80"/>` : ''}<path d="M${x - 14} ${y}h10M${x + 4} ${y}h10M${x} ${y - 14}v10M${x} ${y + 4}v10"/></g>`);
  }
}

function pointRing(x, y) {
  const [cx, cy] = ring.origin || ring.at;
  if (Math.hypot(x - cx, y - cy) < 40) ring.sel = -1;
  else {
    const a = Math.atan2(y - cy, x - cx);
    let best = -1, bd = 9;
    ring.items.forEach((it, i) => { if (it.angle === undefined) return; const d = Math.abs(Math.atan2(Math.sin(a - it.angle), Math.cos(a - it.angle))); if (d < bd) { bd = d; best = i; } });
    ring.sel = best;
  }
  const it = ring.sel >= 0 && ring.items[ring.sel];
  ring.drop = it && it.len && Math.hypot(x - cx, y - cy) > it.len + 60 && !isCollage(it.f) ? [x, y] : null;
  drawRingNow();
}

function closeRing(choose) {
  if (!ring) return;
  const pick = choose && ring.sel >= 0 ? ring.items[ring.sel] : null, drop = ring.drop;
  ring = null;
  clearGrab(overlay);
  gizmoDue = true;
  // carried out past its thumbnail: the neighbour is dropped there as a piece; else walked to
  if (pick && drop) dropPiece(formatAny(pick.f), drop[0], drop[1]);
  else if (pick) walkTo(formatAny(pick.f));
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
  setDoc(path[0].text);
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

// the scene's state, for the file an export writes (core/state.js): drop that file back to return here
const sceneDoc = (exp) => stateDoc({ formula: doc(), cam: state.cam, mode: state.mode, look: state.look, focus: state.focus, pins: state.pins, export: exp });

// a file dropped on the engine: a splat cloud or a still it exported brings back the state that made it
async function importFile(buffer, name = '') {
  const b = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
  const isPng = b[0] === 0x89 && b[1] === 0x50, isPly = b[0] === 0x70 && b[1] === 0x6c && b[2] === 0x79;
  const doc = isPng ? readPngState(buffer) : isPly ? readPlyState(buffer) : null;
  if (!doc) throw new Error(`no fractal-engine state in ${name || 'the file'}`);
  restoreDoc(doc);
  return doc;
}

function restoreDoc(doc) {
  setDoc(formatAny(doc.formula));
  state.cam = { pos: [...doc.cam.pos], yaw: doc.cam.yaw, pitch: doc.cam.pitch };
  if (doc.mode && MODES.includes(doc.mode) && doc.mode !== state.mode) {
    state.mode = doc.mode;
    if (doc.mode === 'loop') { state.loopSeed = 2; placeLoopWindow(); }
  }
  // only the look's own keys, and only numbers and number lists
  if (doc.look) for (const [k, v] of Object.entries(doc.look)) {
    if (!(k in state.look)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) state.look[k] = v;
    else if (Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x))) state.look[k] = [...v];
  }
  if (typeof doc.focus === 'number' && doc.focus > 0) state.focus = doc.focus;
  if (Array.isArray(doc.pins)) state.pins = doc.pins.filter((q) => q && Array.isArray(q.x) && Array.isArray(q.keys)).map((q) => ({ x: q.x.slice(0, 3).map(Number), keys: q.keys.map(String) }));
  state.home = null;
  touched();
  state.lastInput = performance.now();
  writeHash();
  remember();
  drawStructureNow();
}

addEventListener('dragover', (e) => { e.preventDefault(); });
addEventListener('drop', async (e) => {
  e.preventDefault();
  const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (!file) return;
  try { await importFile(await file.arrayBuffer(), file.name); } catch (err) { console.warn(err.message); }
});

function download(blob, name) {
  window.__fe.lastExport = { blob, name };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
const baseName = () => 'fractal-' + hashDoc(doc());
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
      if (!state.collage) await R.compileJit(state.formula).catch(() => {});
      const [W, H] = stillSize(3840);
      const img = await R.renderStill(pullView(b, clear), W, H, { tile: 512, samples: 64, onProgress: progress });
      const png = await (await img.convertToBlob({ type: 'image/png' })).arrayBuffer();
      const blob = new Blob([pngWithState(png, sceneDoc({ kind: 'still', width: W, height: H, samples: 64 }))], { type: 'image/png' });
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
      // a collage's splats take its own shading (its drivers read at the splat's point), else the engine's colour
      const fs = state.collage ? pickedFormula(state.collage, 'C') : normalize(state.formula), shade = fs.shade;
      // drivers the colour reads: at the splat's point, as the walk reads them at its own (its iteration
      // unknown here: the point's readings as at an orbit's start)
      const ownOf = (to) => { const { path, key } = splitTarget(to), o = opPaths(fs).get(path); return o ? o.p[key] : 0; };
      const time = timeDriven(fs) ? (performance.now() - clock0) / 1000 : 0;
      const drvAt = colourDrivers(fs).length ? (p) => {
        const x = lift(fs, p), r2 = x.reduce((a, v) => a + v * v, 0);
        return evalDrive(fs.drive, { start: x, time, own: ownOf, read: { i: 0, r: Math.sqrt(r2), trap: r2, lyap: 0, px: x[0], py: x[1], pz: x[2], pw: x[3] } }).reg;
      } : () => null;
      const samples = raw.map((q) => {
        // the formula's colour graph when it has one (a splat knows only its fold colour index)
        if (shade) return { p: q.p, cov: q.cov, rgb: evalShade(shade, { col: q.col }, drvAt(q.p)).color.slice(0, 3) };
        const film = [0, 0.33, 0.67].map((o) => 0.5 + 0.5 * Math.cos(2 * Math.PI * (o + q.col * L.spread + L.hue)));
        const rgb = L.key.map((k, i) => Math.min(1, k + (film[i] * len - k) * L.iridescence));
        return { p: q.p, cov: q.cov, rgb };
      });
      const doc = sceneDoc({ kind: 'splats', count: samples.length, opacity: 0.6, slab: state.look.pushSlab, requested: 200000 });
      const blob = new Blob([splatsToPly(samples, 0.6, plyComments(doc))], { type: 'application/octet-stream' });
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
    if (state.text !== snapshot.text) setDoc(snapshot.text, true);
    if (state.collage) state.formula = pickedFormula(state.collage, state.pick);
    if (R) showDoc(doc());
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
    const to = normDoc(parseAny(path[i].text));
    if (i === 0) { frames.push(to); continue; }
    const from = normDoc(parseAny(path[i - 1].text));
    if (docStructure(from) !== docStructure(to) || !metric.length) { for (let k = 0; k < 15; k++) frames.push(to); continue; }
    if (isCollage(to)) {
      // a collage walks piece by piece; the metric is a formula's or a collage's, whichever was sensed last
      const D = metric.some((m) => m.ref || m.piece != null) ? collageDistancePx(from, to, metric) : 100;
      const steps = Math.max(1, Math.round((D / WALK_PX_S) * 30));
      for (let k = 1; k <= steps; k++) frames.push(lerpCollage(from, to, k / steps));
      continue;
    }
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
  if (!isCollage(frames[0])) await R.compileStructureJit(frames[0]).catch(() => {});
  try {
    for (let i = 0; i < frames.length; i++) {
      showDoc(frames[i]);
      R.setClock(i / 30);
      if (!isCollage(frames[i])) state.formula = frames[i];
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
  // a collage is sensed on the CPU (core/collage-sense.js) over a coarser grid; a driven one's step
  // factor is measured on the GPU at the hits (gpu/render.js collageStep)
  if (state.collage) {
    const c = state.collage, r = senseCollage(c, senseView(), innerHeight, COLLAGE_GRID, { time: docTimeDriven() ? (performance.now() - clock0) / 1000 : 0 });
    if (state.collage !== c) return r;
    r.structure = docStructure(c);
    state.sensed = r;
    if (c.drive && c.drive.bind.length && r.points.length && R.collageStep) {
      const m = await R.collageStep(r.points.map((q) => q.x)).catch(() => null);
      if (m && state.collage === c) { r.step = m.step; R.setStep(m.step); }
    } else R.setStep(1);
    return r;
  }
  // the pass is asynchronous: what it measured may be gone by its end (another document: its metric is
  // not this one's)
  const st = docStructure(doc());
  const r = await S.sense(state.formula, senseView(), innerHeight);
  if (r && docStructure(doc()) === st) {
    r.structure = st;
    state.sensed = r;
    if (state.look.lyapMix > 0) { state.n = 0; }
    // the drivers' steepness: the raymarch shortens its steps by it (1 without drivers)
    R.setStep(r.step);
  }
  return r;
}

const COLLAGE_GRID = gridUVs(12, 8);

// the breeding metric: the ops' parameters and the drivers' (bands, driver nodes)
const metricOf = (sensed) => sensed.params.concat(sensed.driveParams || []);

// a sensed parameter, an op's ({ oi, op, key }) or a driver's ({ drive: a core/drive.js ref }): its id,
// its value in a formula, the formula with it set (clamped to its range)
const pid = (p) => (p.ref || p.piece != null ? metricId(p) : p.drive || p.oi + '.' + p.key);
function valueOf(f, p) {
  if (isCollage(f)) return metricValue(f, p);
  const g = normalize(f);
  return p.drive ? getDriveParam(g.drive, p.drive) : g.slots.flat()[p.oi].p[p.key];
}
function withAny(f, p, v) {
  if (isCollage(f)) return withMetric(f, p, v);
  if (!p.drive) {
    const q = getOp(p.op).params.find((r) => r.k === p.key);
    if (q.min !== undefined) v = Math.max(q.min, v);
    if (q.max !== undefined) v = Math.min(q.max, v);
    return withParam(f, p.oi, p.key, v);
  }
  const g = JSON.parse(JSON.stringify(normalize(f)));
  setDriveParam(g.drive, p.drive, v);
  return g;
}
// a driver parameter's glyph: a band's is its op's, a node's its own
function driveGlyphOf(f, ref) {
  const [kind, id] = ref.split('/');
  if (kind === 'bind') { const o = opPaths(f).get(splitTarget(id).path); return o ? getOp(o.op).glyph : 'drv.param'; }
  const m = f.drive && f.drive.nodes.find((n) => n.id === id);
  return m ? driverGlyph(m) : 'drv.param';
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
  // a formula's or a collage's text, in place of what is on screen (tests: set __fe.dry first)
  setFormula: (text, quiet) => setDoc(text, quiet),
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
  importFile: (buffer, name) => importFile(buffer, name),
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
  // what the hand holds (the touch rig reads it after real touch events)
  get input() {
    return { grab: grab && { x: grab.x, y: grab.y, k: grab.k, knobs: !!grab.knobs, key: grab.knobs ? KNOBS[grab.k][0][0] : (grab.ranked[grab.k].key || grab.ranked[grab.k].drive) }, lens: !!lens, ring: ring && { scale: ring.scale, sel: ring.sel }, mod: !!tmod, pins: state.pins.length, structure: state.structure, mode: state.mode, gz: gz && gz.kind, pointers: pointers.size,
      surf: surf && { stroke: surf.stroke && surf.stroke.kind, x: [...surf.x] }, lyap: state.look.lyapMix > 0, drift: state.drift, pick: state.pick,
      // a graph's view and its nodes and schedule letters where they are on screen
      graph: gv && (() => {
        const sx = (x) => x * gview.k + gview.tx, sy = (y) => y * gview.k + gview.ty;
        return { k: gview.k, selected: gv.selected, hover: gv.hover, thumb: !!(gv.hover && gv.thumbs.get(gv.hover + '|' + state.text)), schedSel: gv.schedSel ?? null,
          nodes: gv.P.items.filter((q) => q.kind === 'op').map((q) => ({ id: q.id, x: sx(q.x), y: sy(q.y) })),
          letters: scheduleLayout(gv.P).letters.map((q) => ({ i: q.i, x: sx(q.x), y: sy(q.y - 4) })), zone: gv.P.zone };
      })(),
      cgraph: cv && { sel: cv.sel, k: gview.k, plus: (() => { const p = cvPlus(cv.PC); return p && [p[0] * gview.k + gview.tx, p[1] * gview.k + gview.ty]; })() },
      // the overlay toggles: out or not, each one's state, the graph's panes, the surface's add mode
      toggles: { row: !!row, on: Object.fromEntries(TOGGLES.map((k) => [k, toggleOn(k)])), panes: { ...panes }, add: surf ? surf.add : null } };
  },
  grabDrag: (dx) => { if (grab) editGrab(grab.x0 + dx); return grab && grab.ranked[grab.k]; },
  grabPass: (step = 1) => { if (grab) passAttention(step, grab.x0); return grab && grab.ranked[grab.k]; },
  grabEnd: (revert = false) => exitGrab(revert),
  lensOpen: () => openLens(),
  lensMove: (dx, dy) => { if (lens) { if (lens.x0 === null) moveLens(0, 0); moveLens(lens.x0 + dx, lens.y0 + dy); } return lens && lens.params.map((p) => p.op + '.' + p.key); },
  lensClose: () => closeLens(),
  structure: () => { toggleStructure(); return state.structure; },
  surface: (on = true) => { if (on) openSurface(); else closeSurface(); return !!surf; },
  surfaceTo: (x, y) => { if (surf) surfaceTo([x, y]); return state.text; },
  // the sites: drop the current formula at (x, y), move site j, take it off, send the families home
  surfaceSites: () => SURF.sites.map((s) => ({ id: s.id, user: s.user, at: [...s.at], axes: s.axes, thumb: !!s.thumb })),
  surfaceDrop: (x, y) => { const s = surf && dropSite([x, y]); return s ? s.id : null; },
  surfaceMove: (j, x, y) => { if (!surf) return null; moveSite(SURF, j, [x, y]); surfaceLayout(false); return state.text; },
  surfaceRemove: (j) => { if (!surf) return null; const r = removeSite(SURF, j); surfaceLayout(false); return r; },
  surfaceReset: () => { if (!surf) return null; resetLayout(SURF); surfaceLayout(false); return state.text; },
  surfaceStroke: (pts, kind = 'walk') => {
    if (!surf) return null;
    const scr = pts.map(toScreen);
    if (kind === 'walk') walkSurface(pts); else layField(pts, scr);
    return state.text;
  },
  get surfaceThumbs() { return SURF.sites.filter((s) => s.thumb).length; },
  graph: (on = true) => { if (on) openGraph(); else closeGraph(); return !!gv; },
  get shadeView() {
    if (!gv) return null;
    const S = gv.P.sh;
    return {
      frame: S.frame, outs: S.outs.map((o) => ({ port: o.port, x: o.x, y: o.y })), selected: gv.shSel, stop: gv.stopSel, hue: !!gv.hue,
      items: S.items.map((q) => ({ id: q.id, type: q.type, x: q.x, y: q.y, out: S.outPort(q), ins: SE.portsOf(q.type).map((port, k, all) => ({ port, at: S.inPort(q, k, all.length) })) })),
      editor: (() => { const q = gv.shSel && S.items.find((r) => r.id === gv.shSel); if (!q || !q.ramp) return null; const E = editorLayout(q, innerWidth, innerHeight, S.frame); return { x: E.x, y: E.y, w: E.w, h: E.h, stops: E.stops.map((t) => ({ i: t.i, x: t.x, y: t.y, t: t.t })), toggles: E.toggles.map((t) => ({ key: t.key, x: t.x, y: t.y })), handles: E.handles.map((h) => ({ key: h.key, x: (h.x1 + h.x2) / 2, y: h.y })), stopBands: stopBands(E).map((B) => ({ to: B.to, x0: B.x0, x1: B.x1, y: E.y - 6, live: B.live })) }; })(),
      // drivers → colour: the selected node's lines (bands when bound), the drivers' links in
      lines: shadeLines().map((h) => ({ key: h.key, to: h.to, x1: h.x1, x2: h.x2, y: h.y, band: h.band ? { x0: h.band.x0, x1: h.band.x1, tick: h.band.tick } : null })),
      drvLinks: S.empty ? [] : shadeDriverLinks(gv.P).map((l) => ({ from: l.from, to: l.to, port: l.port })),
    };
  },
  get driveView() {
    if (!gv) return null;
    const V = gv.P.dv, sel = gv.selected && gv.P.items.find((q) => q.id === gv.selected), dsel = gv.dvSel && V.byId.get(gv.dvSel);
    return {
      lane: V.lane, top: V.top, selected: gv.dvSel, band: gv.bandSel, picker: !!gv.picker,
      items: V.items.map((q) => ({ id: q.id, type: q.type, place: q.place, x: q.x, y: q.y, out: V.outPort(q), ins: DE.driverPorts(q.type).map((port, k, all) => ({ port, at: V.inPort(q, k, all.length) })) })),
      binds: (gv.binds || []).map((b) => ({ to: b.to, from: b.from, x: b.x2, y: b.y2 })),
      handles: sel ? paramHandles(sel).map((h) => ({ key: h.key, to: h.to, x1: h.x1, x2: h.x2, y: h.y, band: h.band ? { x0: h.band.x0, x1: h.band.x1, tick: h.band.tick ?? null, live: h.band.live || null } : null })) : [],
      params: dsel ? driverHandles(dsel).map((h) => ({ key: h.key, x: h.line ? (h.x1 + h.x2) / 2 : h.gx, y: h.y, line: !!h.line })) : [],
    };
  },
  get graphView() { return gv && { items: gv.P.items.filter((q) => q.kind === 'op').map((q) => ({ id: q.id, op: q.n.op, x: q.x, y: q.y })), edges: gv.P.edges.map((e) => ({ chain: e.chain, index: e.index, x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2 })), zone: gv.P.zone, selected: gv.selected, picker: !!gv.picker }; },
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
  // a collage (its notation or document) drawn in place of the formula, pull and push, until the next
  // formula; null goes back to the formula. Resolves once its shaders are compiled. Tests set __fe.dry.
  async collage(c) {
    if (c == null) { if (state.collage) setDoc(format(state.collage.pieces[0].f), true); return null; }
    const doc = typeof c === 'string' ? parseCollage(c) : c, v = validateCollage(doc);
    if (!v.ok) throw new Error(v.errors.join('; '));
    setCollage(doc);
    await R.collageReady();
    return true;
  },
  // K3: starting, picking, placing (tests drive what the hand does; nothing here is remembered when dry)
  collageDrop: (text, x, y) => dropPiece(text, x, y),
  pick: (i) => { setPick(i); drawGizmoNow(); return state.pick; },
  pickAt: (x, y) => { pickAt(x, y); return state.pick; },
  get gizmo() { drawGizmoNow(); return gizmoG && { O: gizmoG.O, axes: gizmoG.axes.map((a) => a && a.tip), ring: gizmoG.ring, corner: gizmoG.corner }; },
  gizmoDrag(handle, dx, dy, snap = false) {
    // handle: 'x' | 'y' | 'z' | 'ring' | 'corner' — pressed where it is drawn, moved by (dx, dy), released
    drawGizmoNow();
    const G = gizmoG;
    if (!G) return null;
    const at = handle === 'ring' ? [G.O[0] + G.ring, G.O[1]] : handle === 'corner' ? G.corner : (() => { const t = G.axes['xyz'.indexOf(handle)].tip; return [G.O[0] + (t[0] - G.O[0]) * 0.8, G.O[1] + (t[1] - G.O[1]) * 0.8]; })();
    if (!gizmoDown(at[0], at[1])) return null;
    gizmoMove(at[0] + dx, at[1] + dy, snap);
    const value = gz.value;
    gizmoUp();
    return { value, place: state.collage.pieces[state.pick].place };
  },
  collageGraph: (on = true) => { if (on) openCollageGraph(); else closeCollageGraph(); return !!cv; },
  get collageView() {
    if (!cv) return null;
    const PC = cv.PC;
    return {
      pieces: PC.pieces.map((p) => ({ i: p.i, zone: p.zone, ops: p.P.items.filter((q) => q.kind === 'op').map((q) => ({ id: q.id, x: q.x, y: q.y })) })),
      joins: PC.joins.map((q) => ({ k: q.k, x: q.x, y: q.y, seam: seamLine(PC, q, pxAtFocus()) })), out: PC.out, top: PC.dv.top,
      drivers: PC.dv.items.map((q) => ({ id: q.id, x: q.x, y: q.y, out: PC.dv.outPort(q) })),
      lines: cvLines().map((h) => ({ to: h.to, x1: h.x1, x2: h.x2, y: h.y, band: h.band ? { x0: h.band.x0, x1: h.band.x1 } : null })),
      sel: cv.sel, dvSel: cv.dvSel || null, picker: cv.picker ? cv.picker.items.length : 0,
    };
  },
  naturalRadius: (text) => naturalRadius(parse(text)),
  get gpuMs() { return gpuMs; },
};

async function start() {
  const fromHash = readHash();
  try {
    setDoc(fromHash ? fromHash.text : DEFAULT.formula);
  } catch (e) {
    console.warn('formula in the URL did not parse:', e.message);
    setDoc(DEFAULT.formula);
  }
  if (fromHash && fromHash.cam) state.cam = fromHash.cam;
  if (fromHash) state.mode = fromHash.mode;
  if (EMBED && EMBED.has('view')) {
    if (EMBED.has('yaw')) state.cam.yaw = +EMBED.get('yaw');
    if (EMBED.has('pitch')) state.cam.pitch = +EMBED.get('pitch');
    frameAt(+EMBED.get('view'));
  }
  try {
    R = await createRenderer(canvas);
  } catch (e) {
    console.error(e);
    document.getElementById('nogpu').hidden = false;
    window.__fe.error = String(e.message || e);
    return;
  }
  showDoc(doc());
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
  if (EMBED) {
    // the loop's window: on the plane through the origin facing the camera, &win= its half height
    if (EMBED.has('win')) { placeLoopWindow(); state.loopWin.o = [0, 0, 0]; state.loopWin.hh = +EMBED.get('win'); state.loopSeed = 2; }
    openEmbed((EMBED.get('open') || '').split(',').filter(Boolean));
  }
  window.__fe.ready = true;
  requestAnimationFrame(tick);
}

// what a paper figure opens with (the toggles' own actions, so it looks as if the reader had pressed them)
function openEmbed(keys) {
  for (const k of keys) {
    if (k === 'structure') toggleStructure();
    else if (k === 'lyap') { state.look.lyapMix = 1; touched(); }
    else if (k === 'graph' || k === 'shade' || k === 'drive') {
      if (k === 'shade') panes.drive = false;
      if (k === 'drive') panes.shade = false;
      if (state.collage && k !== 'graph') { if (k === 'shade') drillInto('C'); else openCollageGraph(); } else openGraph();
    } else if (k === 'surface') openSurface();
    else if (k === 'cgraph' && state.collage) openCollageGraph();
  }
}
start();
