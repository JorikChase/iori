// The paper's live figures: one engine per figure, each set up for the tool its section is about.
// A figure is the engine itself (index.html?embed, app.js "EMBED"): the document in the hash as the app
// writes it, &view= frames the origin, &win= places the loop's window, &open= what is open on arrival.
// Formulas with shading or drivers are built here through core/, so their notation is the engine's own.
import { parse, format, normalize } from '../core/index.js';
import { parseCollage, normCollage, formatCollage } from '../core/collage.js';
import { rampPreset } from '../core/shade.js';

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

// one noise bends the Mandelbox's scale and shifts the colour along the trap's ramp; the clock turns its hue.
// (Bound, not linked: a ramp whose input is a driver lays the graph out as NaN — reported, ui/shadegraph.js)
const PAINTED = withProgram(BOX, {
  drive: { nodes: [{ id: 'nz', type: 'noise', p: { f: 0.7, g: 1 } }, { id: 'tm', type: 'time', p: { rate: 0.08, wave: 'saw' } }],
    bind: [{ to: 'A2.s', from: 'nz', lo: 2.4, hi: 2.6 }] },
  shade: { nodes: [{ id: 't', type: 'trap' }, { id: 'r', type: 'ramp', in: { v: 't' }, p: { ...rampPreset('fire'), map: map({ mode: 'mirror', scale: 0.8 }) } }],
    out: { color: 'r' }, bind: [{ to: 'r.map.offset', from: 'nz', lo: 0, hi: 0.6 }, { to: 'r.map.hue', from: 'tm', lo: 0, hi: 1 }] },
});

const CHIMERA = '[fold.box 1 · fold.sphere .5 1 · scale 2.5 ‖ abs · sort · scale 3 · + -2 -2 0] axis .5 1.5 1 1 0 0 · +c ×12 bail=100';
const TISSUE = '[bulb 8 · +c ‖ bulb 3 · +c] tissue 6 1.5 .1 ×10 bail=4';

export const FIGURES = {
  notation: { open: 'structure' },
  pull: {},
  push: { doc: TETRA, view: 3.6, yaw: 0.5, pitch: -0.6, mode: 'push' },
  loop: { doc: 'power 2 · +c ×24 c=-.123,.745,0', view: 2.5, yaw: 0, pitch: 0, win: 1.3, mode: 'loop' },
  lyap: { open: 'lyap' },
  grab: {},
  lens: {},
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
  touch: {},
};

// the engine's URL for a figure; doc overrides the figure's own document (the notation figure's input)
export function figureSrc(id, doc) {
  const F = FIGURES[id];
  const q = new URLSearchParams({ embed: '' });
  for (const k of ['view', 'yaw', 'pitch', 'win', 'open']) if (F[k] != null) q.set(k, F[k]);
  const text = doc || F.doc;
  const hash = text ? '#' + encodeURIComponent(text) + (F.mode && F.mode !== 'pull' ? '&m=' + F.mode : '') : '';
  return 'index.html?' + q.toString().replace('embed=', 'embed') + hash;
}
