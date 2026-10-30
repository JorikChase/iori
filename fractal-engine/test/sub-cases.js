// Formulas with subgraphs, for the GPU parity page and the unit tests. A subgraph is a link over plain ops
// (core/sub.js), so each of these packs to exactly its inlined form; the parity rows run them anyway.
import { parse, format, normalize } from '../core/index.js';

const n = (id, type, p = {}, inn = {}) => ({ id, type, p, in: inn });
const b = (to, from, lo, hi) => ({ to, from, lo, hi });

// [text, the radius the points are drawn from], as the parity page's FORMULAS
export const SUBS = [
  ['a( fold.box ^1 · fold.sphere .5 1 · scale ^2 ) · +c · a( 1.2 2.4 ) · +c ×4 bail=100', 2.5],
  ['[ a( abs · scale ^3 · translate -1 -1 -1 ) ‖ a( 2 ) · sort ] .4 ×10 bail=100', 2],
  ['a( [ fold.box ‖ abs · sort ] ^.3 · scale 2 ) · +c | a( .7 ) · +c ×8 AB bail=100', 2.5],
  [format(normalize({ ...parse('a( fold.box · scale ^2 ) · +c · a( 2.2 ) · +c ×4 bail=100'), drive: { nodes: [n('r0', 'r'), n('m0', 'math', { op: 'mul', c: 0.5 }, { a: 'r0' }), n('r1', 'r'), n('m1', 'math', { op: 'mul', c: 0.5 }, { a: 'r1' })], bind: [b('A1.s', 'm0', 1.8, 2.4), b('A4.s', 'm1', 2, 2.6)], sub: [{ id: 'a', uses: [['r0', 'm0'], ['r1', 'm1']], expose: [] }] } })), 2.5],
];
