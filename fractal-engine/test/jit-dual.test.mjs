// The compiled dual pass (gpu/jit.js jitDual): it exists for every op and both kinds, and λ's form holds no
// gradient. The maths is run on the GPU: test/parity.html's "dual jit" rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../core/index.js';
import { jitDual, withJit } from '../gpu/jit.js';
import { DRIVEN } from './driven-cases.js';
import { FAMILIES } from './family-cases.js';

const CHAINS = ['translate .1 · scale 2 · rotate 10 20 30 · rotate4 1 2 3 4 5 6 · fold.plane 1 1 0 · fold.box 1 · fold.sphere .5 1 ×4',
  'abs · sort · sort4 · bulb 8 · bulb4 8 · power 2 · quat · invert · twist 20 ×4',
  'spherical · swirl · sin · horseshoe · polar · +c ×4',
  'fold.cell 1 1 1 · wrap 1 1 1 · kleinian 1.95 .02 · fold.mandalay .5 .1 · seed.slab ×4'];

test('every op compiles, in both kinds', () => {
  for (const text of CHAINS) for (const kind of ['structure', 'literal']) assert.match(jitDual(parse(text), kind), /fn iterateDual/);
});

test('every driven and family case compiles, in both kinds and for λ alone', () => {
  for (const [text] of [...DRIVEN, ...FAMILIES]) for (const kind of ['structure', 'literal']) {
    const f = parse(text);
    assert.match(jitDual(f, kind), /fn iterateDual/);
    assert.doesNotMatch(jitDual(f, kind, { lyapOnly: true }), /\bg0\b/);
  }
});

test('the shader takes the compiled pass in place of the interpreter\'s', () => {
  const src = 'fn iterate(p0: vec4f, c: vec4f) -> Trace {}\nfn iterateDual(p0: vec4f, c: vec4f, cIsP: bool) -> Dual {}\n';
  const out = withJit(src, parse('bulb 8 · +c ×10 bail=2'), 'structure');
  assert.match(out, /fn iterateDualInterpreted/);
  assert.equal(out.match(/fn iterateDual\(/g).length, 1);
});
