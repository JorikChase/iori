// The paper's live figures: one engine per figure, each set up for the tool its section is about.
// A figure is the engine itself (index.html?embed, app.js "EMBED"): the document in the hash as the app
// writes it, &view= frames the origin, &win= places the loop's window, &open= what is open on arrival.
// Formulas with shading or drivers are built here through core/, so their notation is the engine's own.
import { parse, format, normalize } from '../core/index.js';
import { parseCollage, normCollage, formatCollage } from '../core/collage.js';
import { rampPreset, PRESET_READING } from '../core/shade.js';

const BOX = 'fold.box 1 · fold.sphere .5 1 · scale 2.5 · +c ×12 bail=100';
const BULB = 'bulb 8 · +c ×10 bail=2';
const TETRA = 'fold.plane 1 1 0 · fold.plane 1 0 1 · fold.plane 0 1 1 · scale 2 · translate -1 -1 -1 ×16 bail=16';

const map = (o = {}) => ({ scale: 1, offset: 0, mode: 'clamp', log: false, invert: false, ...o });
const withProgram = (text, o) => format(normalize({ ...parse(text), ...o }));
const collage = (text, extra = {}) => formatCollage(normCollage({ ...parseCollage(text), ...extra }));

// a bulb painted by its orbit trap through the ice ramp, terraced
const SHADED = withProgram(BULB, { shade: {
  nodes: [{ id: 't', type: 'trap' }, { id: 'b', type: 'math', in: { a: 't' }, p: { op: 'bands', c: 0.08 } },
    { id: 'r', type: 'ramp', in: { v: 'b' }, p: { ...rampPreset('ice'), map: map({ scale: 1.6 }) } }],
  out: { color: 'r' },
} });

// the bulb's power follows the iteration, 3 at the first and 9 at the last (a schedule written as a driver)
const DRIVEN = withProgram(BULB, { drive: { nodes: [{ id: 'i', type: 'i', p: {} }], bind: [{ to: 'A0.n', from: 'i', lo: 3, hi: 9 }] } });

// one noise bends the Mandelbox's scale and is the fire ramp's input, so it paints what it bent; the clock
// turns the ramp's hue
const PAINTED = withProgram(BOX, {
  drive: { nodes: [{ id: 'nz', type: 'noise', p: { f: 0.7, g: 1 } }, { id: 'tm', type: 'time', p: { rate: 0.08, wave: 'saw' } }],
    bind: [{ to: 'A2.s', from: 'nz', lo: 2.4, hi: 2.6 }] },
  shade: { nodes: [{ id: 'r', type: 'ramp', in: { v: 'd:nz' }, p: { ...rampPreset('fire'), map: map({ mode: 'mirror', scale: 1.4, offset: 0.5 }) } }],
    out: { color: 'r' }, bind: [{ to: 'r.map.hue', from: 'tm', lo: 0, hi: 1 }] },
});

const CHIMERA = '[fold.box 1 · fold.sphere .5 1 · scale 2.5 ‖ abs · sort · scale 3 · + -2 -2 0] axis .5 1.5 1 1 0 0 · +c ×12 bail=100';
const TISSUE = '[bulb 8 · +c ‖ bulb 3 · +c] tissue 6 1.5 .1 ×10 bail=4';

// ---------- the closing examples: as published, then one step beyond ----------
const BOX15 = 'fold.box 1 · fold.sphere .5 1 · scale -1.5 · +c ×14 bail=100';
const MENGER = 'abs · sort · scale 3 · translate -2 -2 · fold.plane 0 0 -1 -1 ×8 bail=50';
const SURF = 'fold.plane -1 0 0 -1 · fold.plane 1 0 0 -1 · fold.plane 0 -1 0 -1 · fold.plane 0 1 0 -1 · fold.sphere .5 1 · scale 2 · rotate 0 0 20 · +c ×12 bail=100';
const QJULIA = 'quat · translate -.2 .6 .2 .1 ×12 bail=4';
// one hue, terraced: the orbit trap in bands through a violet ramp (iori's cave taste: one hue with highlights)
const ONE_HUE = { nodes: [{ id: 't', type: 'trap' }, { id: 'b', type: 'math', in: { a: 't' }, p: { op: 'bands', c: 0.05 } },
  { id: 'r', type: 'ramp', in: { v: 'b' }, p: { stops: [{ t: 0, c: [0.01, 0.005, 0.02, 1] }, { t: 0.5, c: [0.32, 0.1, 0.55, 1] }, { t: 0.85, c: [0.85, 0.6, 1, 1] }, { t: 1, c: [1, 1, 1, 1] }], interp: 'ease', space: 'oklab', map: map({ scale: 0.35, mode: 'mirror' }) } }],
  out: { color: 'r' } };
const EXAMPLES = {
  exBulb: { doc: BULB, view: 2.5, yaw: 0, pitch: -0.25 },
  exBulbTissue: { doc: '[bulb 8 · +c ‖ bulb 5 · +c] tissue 8 1.4 .15 ×10 bail=4', view: 2.7, yaw: 0, pitch: -0.25 },
  exBox: { doc: BOX15, view: 4, yaw: 0.6, pitch: -0.45 },
  exBoxRing: { doc: collage(`{ ${BOX15} } size .2 polar 6 6 y ∪ .12 { ${BOX15} } size .2`), view: 4.2, yaw: 0, pitch: -0.9 },
  exMenger: { doc: MENGER, view: 3.2, yaw: 0.6, pitch: -0.45 },
  exMengerSier: { doc: '[abs · sort · scale 3 · translate -2 -2 · fold.plane 0 0 -1 -1 ‖ fold.plane 1 1 0 · fold.plane 1 0 1 · fold.plane 0 1 1 · scale 2 · translate -1 -1 -1] .5 ×10 bail=30', view: 3.4, yaw: 0.6, pitch: -0.45 },
  exQuat: { doc: QJULIA, view: 2.4 },
  exQuatWalk: { doc: withProgram(QJULIA, { drive: { nodes: [{ id: 'tm', type: 'time', p: { rate: 0.05, wave: 'sine' } }], bind: [{ to: 'A1.x', from: 'tm', lo: -0.35, hi: -0.05 }, { to: 'A1.w', from: 'tm', lo: 0.0, hi: 0.25 }] } }), view: 2.4 },
  exSurf: { doc: SURF, view: 8, yaw: 0, pitch: -0.5 },
  // (a Mandelbox chimera with shading measured 0.6–1.1 s a frame here: too heavy for a page; the step is a clock)
  exSurfTurn: { doc: withProgram(SURF, { shade: ONE_HUE, drive: { nodes: [{ id: 'tm', type: 'time', p: { rate: 0.04, wave: 'sine' } }], bind: [{ to: 'A6.z', from: 'tm', lo: 10, hi: 35 }] } }), view: 8, yaw: 0, pitch: -0.5 },
  exCave: { doc: withProgram(BOX, { shade: ONE_HUE }) },
  exCaveNoise: { doc: withProgram(BOX, { shade: ONE_HUE, drive: { nodes: [{ id: 'nz', type: 'noise', p: { f: 0.6, g: 1 } }], bind: [{ to: 'A2.s', from: 'nz', lo: 2.35, hi: 2.65 }] } }) },
  exJuliaPull: { doc: 'bulb 8 · +c ×10 bail=2 c=-.2,.3,.1', view: 2.2, yaw: 0, pitch: -0.25 },
  exJuliaPush: { doc: 'bulb 8 · +c ×10 bail=2 c=-.2,.3,.1', view: 2.2, yaw: 0, pitch: -0.25, mode: 'push' },
};

// ---------- the seed families, the Mandalay fold, the kaliset (their halls are core/presets.js's eyes) ----------
const PK = 'fold.cell .92 .91 .92 · fold.sphere 0 1 · seed.slab ×12 bail=100';
const PILLARS = 'fold.cell .92 .91 .92 · fold.sphere 0 1 · translate .1 .12 · seed.pillar .08 ×12 bail=100';
const APOLLONIAN = 'wrap 1 1 1 · invert · scale 1.1 · seed.slab 0 1 0 0 0 .4 ×8 bail=1000';
const KLEINIAN = 'kleinian 1.95 .02 ×40 bail=100';
const MANDALAY = 'fold.mandalay .5 .15 · fold.sphere .5 1 · scale 2.3 · rotate 0 0 10 · +c ×12 bail=100';
// a ring preset on the reading it was chosen for (core/shade.js): iori's colours on a family that has none of its own
const painted = (text, preset) => withProgram(text, { shade: { nodes: [{ id: 'q', type: PRESET_READING[preset] }, { id: 'r', type: 'ramp', in: { v: 'q' }, p: rampPreset(preset) }], out: { color: 'r' } } });
const KALI = (text) => withProgram(text, { shade: { nodes: [{ id: 'k', type: 'kali', p: { cx: 0.8, cy: 0.7, cz: 0.6, f: 1, n: 10, mode: 'mean' } }, { id: 'r', type: 'ramp', in: { v: 'k' }, p: rampPreset('oil') }], out: { color: 'r' } } });
const FAMILY = {
  fmPK: { doc: painted(PK, 'strata'), cam: [-1.204, -0.34, -0.779, 2.29, -0.08] },
  fmPillars: { doc: painted(PILLARS, 'bone'), cam: [-1.144, -0.068, -0.21, 4.84, 0.25] },
  fmApollonian: { doc: APOLLONIAN, cam: [0.95, -0.284, -0.842, 2.15, 0.2] },
  fmKleinian: { doc: painted(KLEINIAN, 'oil'), cam: [-0.516, 0.882, -0.135, 0.3, 0.07] },
  fmMandalay: { doc: painted(MANDALAY, 'malachite'), view: 2, yaw: 0, pitch: -0.3 },
  fmKali: { doc: KALI(BOX) },
};

export const FIGURES = {
  notation: { open: 'structure' },
  pull: {},
  push: { doc: TETRA, view: 3.6, yaw: 0.6, pitch: -0.5, mode: 'push' },
  loop: { doc: 'power 2 · +c ×24 c=-.123,.745,0', view: 2.5, yaw: 0, pitch: 0, win: 1.3, mode: 'loop' },
  lyap: { open: 'lyap' },
  grab: {},
  lens: {},
  // radiance-fields.html: the tetrahedron as a distance field (pull) beside its splats (push)
  tetraPull: { doc: TETRA, view: 3.6, yaw: 0.6, pitch: -0.5 },
  // metafractal.html: the arrival Mandelbox drawn by push, the Julia-type set of the point looked at
  pushJulia: { doc: BOX, mode: 'push' },
  lineage: { open: 'structure' },
  ring: { doc: BULB, view: 2.4 },
  slice: { doc: 'quat · translate -.2 .6 .2 .1 ×12 bail=4', view: 2.4 },
  chimera: { doc: CHIMERA, view: 10, pitch: -0.35 },
  tissue: { doc: TISSUE, view: 2.6 },
  surface: { open: 'surface' },
  graph: { doc: TISSUE, view: 2.6, open: 'graph' },
  shade: { doc: SHADED, view: 2.4, open: 'shade' },
  drive: { doc: DRIVEN, view: 2.4, open: 'drive' },
  colour: { doc: PAINTED, open: 'graph' },
  // a collage's repetition is in the piece's own units, before its size: polar 6 4 at size .25 is a ring of radius 1
  joins: { doc: collage(`{ ${BULB} } at .55 0 0 ∪ stairs .25 4 { ${BOX} } at -.55 0 0 size .12`), view: 3, yaw: 0, pitch: -0.3, open: 'cgraph' },
  place: { doc: collage(`{ ${BULB} } size .25 polar 6 4 y ∪ .2 { ${BOX} } size .05`), view: 3.6, yaw: 0, pitch: -1 },
  exports: { open: 'structure' },
  // chapter 9: the graph open, to hold a node for its name (ui/labels.js)
  labels: { doc: TISSUE, view: 2.6, open: 'graph' },
  ...EXAMPLES,
  ...FAMILY,
  touch: {},
};

// the engine's URL for a figure, absolute (other papers embed these figures too: metafractal.html); doc
// overrides the figure's own document (the notation figure's input)
export function figureSrc(id, doc) {
  const F = FIGURES[id];
  const q = new URLSearchParams({ embed: '' });
  for (const k of ['view', 'yaw', 'pitch', 'win', 'open']) if (F[k] != null) q.set(k, F[k]);
  const text = doc || F.doc;
  const cam = F.cam ? '&c=' + F.cam.join(',') : '';
  const hash = text ? '#' + encodeURIComponent(text) + cam + (F.mode && F.mode !== 'pull' ? '&m=' + F.mode : '') : '';
  return new URL('../index.html?' + q.toString().replace('embed=', 'embed') + hash, import.meta.url).href;
}
