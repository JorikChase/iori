// The Kleinian families and the Mandalay fold, for the GPU parity page and the unit tests: every new op,
// every seed, an estimate read through a chimera and a driver. Radii frame the part with structure.
import { parse, format, normalize } from '../core/index.js';

const n = (id, type, p = {}, inn = {}) => ({ id, type, p, in: inn });
const b = (to, from, lo, hi) => ({ to, from, lo, hi });
const D = (text, nodes, bind) => format(normalize({ ...parse(text), drive: { nodes, bind } }));

export const PK = 'fold.cell .92 .91 .92 · fold.sphere 0 1 · seed.slab ×10 bail=100';
export const PILLARS = 'fold.cell 1 1 1.2 · fold.sphere 0 1.05 · translate .1 .2 · seed.pillar .1 ×8 bail=100';
export const BALLS = 'fold.cell 1 1 1 · fold.sphere 0 1.05 · translate .1 .2 .05 · seed.sphere .5 ×8 bail=100';
export const APOLLONIAN = 'wrap 1 1 1 · invert · scale 1.1 · seed.slab 0 1 0 0 0 .25 ×8 bail=1000';
export const KLEINIAN = 'kleinian 1.95 .02 ×30 bail=100';
export const MANDALAY = 'fold.mandalay .5 .1 · fold.sphere .5 1 · scale 2 · +c ×12 bail=100';

// [text, radius] — forward estimates, dual numbers, the JIT
export const FAMILIES = [
  [PK, 2.5], [PILLARS, 2.5], [BALLS, 2.5], [APOLLONIAN, 2], [KLEINIAN, 1.5], [MANDALAY, 5],
  // the seed in a species: a Kleinian cell in a tissue beside a Mandelbox, each measured its own way
  ['[fold.cell .92 .91 .92 · fold.sphere 0 1 · seed.slab ‖ fold.box 1 · fold.sphere .5 1 · scale 2 · translate .1] tissue 6 3 .2 1 ×10 bail=100', 3],
  // the new ops inside a chimera's blend
  ['[fold.mandalay .5 · fold.sphere .5 1 · scale 2 ‖ wrap 2 2 2 · fold.box 1 · scale 2] .4 · +c ×10 bail=50', 3],
  // the seed's and the op's parameters driven
  [D(PK, [n('nz', 'noise', { f: 0.7, g: 1 }), n('i', 'i')], [b('A2.d', 'nz', -0.1, 0.1), b('A0.lx', 'i', 0.88, 0.96)]), 2.5],
  [D(KLEINIAN, [n('x', 'x')], [b('A0.a', 'x', 1.9, 2)]), 1.5],
];

// [text, radius] — inverse steps
export const FAMILIES_INV = [
  ['fold.cell .92 .91 .92 · fold.sphere 0 1 · translate .1 .2 .05 · seed.slab ×10 bail=100', 3],
  ['wrap 1 1 1 · invert · scale 1.1 ×8 bail=30', 2],
  ['kleinian 1.95 .02 ×30 bail=100', 2],
  ['kleinian 1.8 .3 1.2 .8 ×30 bail=100', 2],
  ['fold.mandalay .5 .1 · scale 2 · translate .1 .2 .3 ×12 bail=100', 3],
];

// [text, radius, [[op, key], …]] — the lens's overrides
export const FAMILIES_OV = [
  [PK, 2.5, [[0, 'lx'], [1, 'rfix']]],
  [PK, 2.5, [[2, 'd'], [2, 'k']]],
  [PILLARS, 2.5, [[3, 'r'], [0, 'lz']]],
  [APOLLONIAN, 2, [[0, 'ly'], [2, 's']]],
  [KLEINIAN, 1.5, [[0, 'a'], [0, 'b']]],
  [MANDALAY, 4, [[0, 'fo'], [0, 'g']]],
];
