// Collages (core/collage.js) for the GPU parity page and the unit tests: every join and kernel, every
// placement and repetition, pieces that are chimeras / sliced / driven / Julia, the collage's own drive
// (a world field, a tissue, a parameter link, the clock), its own shade reading piece and seam, and
// pieces with shades of their own. Documents, not notation, so the drive and shade read as written.
import { parseCollage, normCollage } from '../core/collage.js';
import { parse, normalize } from '../core/index.js';
import { rampPreset } from '../core/shade.js';
import { DRIVEN } from './driven-cases.js';

const BULB = 'bulb 8 · +c ×10 bail=2';
const BOX = 'fold.box 1 · fold.sphere .5 1 · scale 2.5 · +c ×12 bail=100';
const KIFS = 'fold.plane 1 1 0 · fold.plane 1 0 1 · fold.plane 0 1 1 · scale 2 · + -1 -1 -1 ×16 bail=16';
const C = (text) => normCollage(parseCollage(text));
const two = (join, extra = '') => C(`{ ${BULB} } at .6 0 0 ${join} { ${BOX} } at -.6 0 0 size .25${extra}`);
const map = (o = {}) => ({ scale: 1, offset: 0, mode: 'clamp', log: false, invert: false, ...o });

// a shade reading the collage's own readings: piece through one ramp, seam through another, mixed by depth
const OWN_SHADE = {
  nodes: [{ id: 'p', type: 'piece' }, { id: 's', type: 'seam' }, { id: 'd', type: 'depth' },
    { id: 'r1', type: 'ramp', in: { v: 'p' }, p: { ...rampPreset('fire'), map: map() } },
    { id: 'r2', type: 'ramp', in: { v: 's' }, p: { ...rampPreset('ice'), map: map({ scale: 1.2 }) } },
    { id: 'm', type: 'mixc', in: { a: 'r1', b: 'r2', f: 'd' }, p: { mode: 'mix' } }],
  out: { color: 'm' },
};
// a shade reading the collage's own drivers: 'd:' inputs and a binding (core/shade.js Drivers → colour)
const DRV_SHADE = {
  nodes: [{ id: 's', type: 'seam' },
    { id: 'r1', type: 'ramp', in: { v: 'd:sp' }, p: { ...rampPreset('fire'), map: map({ mode: 'repeat', scale: 0.8 }) } },
    { id: 'r2', type: 'ramp', in: { v: 's' }, p: { ...rampPreset('ice'), map: map() } },
    { id: 'm', type: 'mixc', in: { a: 'r1', b: 'r2', f: 'd:xm' }, p: { mode: 'mix' } }],
  out: { color: 'm' },
  bind: [{ to: 'r1.map.hue', from: 't', lo: 0, hi: 0.5 }],
};
const TRAP_SHADE = { nodes: [{ id: 't', type: 'trap' }, { id: 'r', type: 'ramp', in: { v: 't' }, p: { ...rampPreset('mono'), map: map({ log: true, scale: 0.3, offset: 0.6 }) } }], out: { color: 'r' } };

// [label, collage, radius]: forward estimates, shares, readings and colour at random points in the ball
export const COLLAGES = [
  ['union quad', two('∪ .3'), 1.6],
  ['union cubic', two('∪ cubic .3'), 1.6],
  ['union exp', two('∪ exp .15'), 1.6],
  ['union circ', two('∪ circ .3'), 1.6],
  ['union stairs', two('∪ stairs .4 4'), 1.6],
  ['union chamfer', two('∪ chamfer .2'), 1.6],
  ['union hard', two('∪ hard'), 1.6],
  ['inter, a grown cutter', C(`{ ${BOX} } size .3 ∩ .1 { ${BULB} } at .2 .1 0 grow .25`), 1.6],
  ['sub stairs, a grown cutter', C(`{ ${BOX} } size .3 ∖ stairs .2 3 { ${BULB} } at .4 .4 .3 size .6 grow .15`), 1.6],
  ['morph', C(`{ ${BULB} } ~ .35 { ${BOX} } size .25`), 1.5],
  ['three: turn, polar, chamfer cut', C(`{ ${BULB} } size .3 polar 5 1.2 y ∪ .2 { ${KIFS} } turn 10 20 30 size .4 ∖ chamfer .1 { quat · +c ×12 bail=4 c=-.2,.6,.2,.1 } at 0 .3 0 size .5 grow .08`), 2],
  ['grid', C(`{ ${BULB} } size .2 grid .6 .6 0 2 1 ∪ .1 { ${BOX} } at 0 0 .8 size .15`), 1.8],
  ['mirror xz', C(`{ ${BULB} } at .5 0 .2 size .4 mirror xz .5 .3 ∪ exp .1 { ${BOX} } size .2`), 1.8],
  // (a chimera whose walk finds preimages: the CPU's push of the box ‖ bulb blend dies out)
  ['chimera and sliced pieces', C(`{ [fold.plane 1 1 0 · fold.plane 1 0 1 · fold.plane 0 1 1 · scale 2 · + -1 -1 -1 ‖ abs · sort · scale 3 · + -2 -2 0] axis .5 .8 ×16 bail=16 } size .6 ∪ .2 { ${BOX} slice=.3,20,10,0 } at .9 0 0 size .3`), 1.8],
  ['a driven piece', normCollage({ pieces: [{ f: normalize(parse(DRIVEN[1][0])), place: { s: 0.25 } }, { f: normalize(parse(BULB)), place: { tx: 1 } }], joins: [{ r: 0.25 }] }), 1.8],
  // the collage's own drive: a world axis widens the seam, the clock moves a piece
  ['drive: axis → seam, time → place', normCollage({ ...two('∪ .2'), drive: {
    nodes: [{ id: 'ax', type: 'axis', p: { nx: 0, ny: 1, g: 1 } }, { id: 'rm', type: 'remap', in: { a: 'ax' }, p: { lo: -1, hi: 1, clamp: true } }, { id: 't', type: 'time', p: { rate: 0.3, wave: 'sine' } }],
    bind: [{ to: 'J0.r', from: 'rm', lo: 0.05, hi: 0.6 }, { to: 'P1.ty', from: 't', lo: -0.2, hi: 0.2 }] } }), 1.6],
  // the tissue of pieces: a tissue cell decides which piece is there; a parameter link turns a piece
  ['drive: tissue → morph, param link', normCollage({ ...C(`{ ${BULB} } ~ .5 { ${BOX} } size .25 turn 0 20 0`), drive: {
    nodes: [{ id: 'tc', type: 'tissue', p: { n: 4, size: 1.2, soft: 0.15, seed: 3, out: 'cell' } }, { id: 'q', type: 'param', p: { of: 'P1.ry' } }, { id: 'x', type: 'x' },
      { id: 'm', type: 'math', in: { a: 'q', b: 'x' }, p: { op: 'mul' } }],
    bind: [{ to: 'J0.w', from: 'tc', lo: 0, hi: 1 }, { to: 'P1.rz', from: 'm', lo: 0, hi: 1 }] } }), 1.5],
  // colour: the collage's shade (piece, seam, depth); pieces with shades of their own beside the default
  ['own shade: piece, seam', normCollage({ ...two('∪ .4'), shade: OWN_SHADE }), 1.6],
  // K3.1: the collage's shade reads the collage's own drivers at the hit — a sphere field through a ramp, the
  // clock turning its hue, the x coordinate mixing in the seam's ramp; the same drive also shapes the seam
  ['own shade: its drivers', normCollage({ ...two('∪ .3'), shade: DRV_SHADE, drive: {
    nodes: [{ id: 'sp', type: 'sphere', p: { r: 0.9, g: 1.5 } }, { id: 't', type: 'time', p: { rate: 0.2, wave: 'tri' } }, { id: 'x', type: 'x' },
      { id: 'xm', type: 'remap', in: { a: 'x' }, p: { lo: -1, hi: 1, clamp: true } }],
    bind: [{ to: 'J0.r', from: 'xm', lo: 0.1, hi: 0.5 }] } }), 1.6],
  ['pieces\' shades', normCollage({ pieces: [{ f: { ...normalize(parse(BOX)), shade: TRAP_SHADE }, place: { s: 0.25, tx: -0.5 } }, { f: normalize(parse(BULB)), place: { tx: 0.5 } }], joins: [{ k: 'exp', r: 0.2 }] }), 1.6],
];

// push with the keep rule: the placed, repeated and carved collages
export const KEEP = ['union quad', 'sub stairs, a grown cutter', 'three: turn, polar, chamfer cut', 'grid', 'mirror xz', 'chimera and sliced pieces'];
// the step factor's measurement: driven (L > 1 where the drive steepens the estimate) and not (L = 1)
export const STEP = ['drive: axis → seam, time → place', 'drive: tissue → morph, param link', 'union quad'];

export const collageCase = (label) => COLLAGES.find((c) => c[0] === label);
