// Driven formulas (formula v2 drivers, core/drive.js) for the GPU parity page and the unit tests: every
// node kind, every rebuild mode (rotate, rotate4, fold.plane), a chimera's species and field weight,
// a parameter linked to another. As notation text, so the parity page treats them like any formula.
import { parse, format, normalize } from '../core/index.js';

const n = (id, type, p = {}, inn = {}) => ({ id, type, p, in: inn });
const b = (to, from, lo, hi) => ({ to, from, lo, hi });
const D = (text, nodes, bind) => format(normalize({ ...parse(text), drive: { nodes, bind } }));

const BOX = 'fold.box 1 · fold.sphere .5 1 · scale 2.5 · +c ×12 bail=100';
const KIFS = 'fold.plane 1 1 0 · fold.plane 1 0 1 · fold.plane 0 1 1 · scale 2 · + -1 -1 -1 ×16 bail=16';
const ROT = 'rotate 10 20 30 · fold.box 1 · scale 2 · + -1 0 .5 · twist 20 ×10 bail=30';
const ROT4 = 'rotate4 10 0 25 15 0 30 · abs · sort4 · scale 3 · + -2 -2 0 -1 ×8 bail=50';
const CHIM = '[fold.box 1 · fold.sphere .5 1 · scale 2.5 ‖ abs · sort · scale 3 · + -2 -2 0] axis .5 1.5 1 1 0 0 · +c ×12 bail=100';

// [text, radius] — forward estimates, dual numbers, the JIT
export const DRIVEN = [
  // the iteration drives a bulb's power (the hand-unrolled schedule of test/drive.test.mjs)
  [D('bulb 8 · +c ×10 bail=2', [n('i', 'i')], [b('A0.n', 'i', 3, 9)]), 1.3],
  // a world noise drives the Mandelbox scale; |p| (through a min) its box fold. (Bands kept narrow: the
  // estimate goes through scale¹², so float32's noise and orbit — a few 1e-6 off — show at fold edges;
  // a ±0.3 scale band put the 99th percentile at 5 %, the same tail as Q2's steep fields)
  [D(BOX, [n('nz', 'noise', { f: 0.7, g: 1 }), n('r', 'r'), n('m', 'math', { op: 'min', c: 2 }, { a: 'r' })],
    [b('A2.s', 'nz', 2.35, 2.65), b('A0.l', 'm', 0.9, 1)]), 5],
  // rotation angles rebuilt on the GPU: a sphere field and the trap; the twist from λ
  [D(ROT, [n('sp', 'sphere', { r: 1, g: 1 }), n('t', 'trap'), n('l', 'lyap')],
    [b('A0.y', 'sp', 10, 40), b('A0.z', 't', 30, 45), b('A4.a', 'l', 15, 25)]), 3],
  // plane normals rebuilt: the orbit's x; a tissue cell and its wall move two offsets
  [D(KIFS, [n('px', 'px'), n('tc', 'tissue', { n: 5, size: 1.2, soft: 0.2, seed: 3 }), n('tw', 'tissue', { n: 5, size: 1.2, seed: 3, out: 'wall' })],
    [b('A0.nx', 'px', 0.8, 1.2), b('A1.d', 'tc', -0.1, 0.1), b('A2.nz', 'tw', 0.9, 1.3)]), 2],
  // a 4-D rotation from the clock (t = 0 on the parity page: its sine's phase) and the iteration
  [D(ROT4, [n('tm', 'time', { rate: 0.5, phase: 0.2, wave: 'sine' }), n('i', 'i')],
    [b('A0.xw', 'tm', 0, 50), b('A0.yz', 'i', 5, 25)]), 2],
  // a chimera: one species' scale from the start's x, the field weight from a remapped noise
  [D(CHIM, [n('x', 'x'), n('nz', 'noise', { f: 1, g: 1, seed: 4 }), n('rm', 'remap', { lo: -0.5, hi: 0.5, clamp: true }, { a: 'nz' })],
    [b('A0.0.2.s', 'x', 2.3, 2.7), b('A0.w', 'rm', 0.3, 0.7)]), 5],
  // a parameter linked to another: the box fold follows the scale; a saw of the clock and pw
  [D(BOX, [n('s', 'param', { of: 'A2.s' }), n('k', 'math', { op: 'mul', c: 0.4 }, { a: 's' }), n('y', 'y'), n('tm', 'time', { rate: 1, phase: 0.3, wave: 'tri' }), n('pw', 'pw'), n('sum', 'math', { op: 'add' }, { a: 'y', b: 'pw' })],
    [b('A0.l', 'k', 0, 1), b('A1.rmin', 'tm', 0.3, 0.6), b('A1.rfix', 'sum', 0.95, 1.05)]), 5],
];

// [text, radius] — inverse steps (a fixed c, so +c inverts)
export const DRIVEN_INV = [
  [D(BOX + ' c=.3,.2,.1', [n('nz', 'noise', { f: 0.7, g: 1 }), n('r', 'r')], [b('A2.s', 'nz', 2.2, 2.8), b('A0.l', 'r', 0.9, 1.1)]), 2],
  [D('rotate 10 20 30 · fold.box 1 · scale 2 · + -1 0 .5 · twist 20 · invert ×10 bail=30', [n('sp', 'sphere', { r: 1, g: 1 }), n('i', 'i')], [b('A0.x', 'sp', 0, 30), b('A4.a', 'sp', 10, 30)]), 1.5],
  [D(KIFS, [n('px', 'px'), n('tc', 'tissue', { n: 5, size: 1.2, soft: 0.2, seed: 3 })], [b('A0.nx', 'px', 0.8, 1.2), b('A1.d', 'tc', -0.1, 0.1)]), 1.5],
  [D(ROT4, [n('x', 'x')], [b('A0.zw', 'x', 10, 40)]), 1.5],
  [D('[fold.box 1 · fold.sphere .5 1 · scale 2 ‖ bulb 8] .3 · +c ×10 bail=8 c=.1,.2,.3', [n('nz', 'noise', { f: 1, g: 1 })], [b('A0.0.2.s', 'nz', 1.8, 2.2), b('A0.w', 'nz', 0.2, 0.4)]), 1.2],
];
