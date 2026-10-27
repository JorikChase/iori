// Collage K2 (the GPU's side, without a GPU): the packed program against the collage it came from, the
// flat binding slots, the static step factor, the shader rewrite, and the piece and seam readings.
// The GPU's arithmetic is test/parity.html's (run-parity.mjs --only collage). Run: node --test fractal-engine/test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { packCollage, pack, collageSlot, collageStepFactor, collageShapes, CL_AT, OPS_FLOATS, HEAD_BYTES, SHADE_AT, DRIVE_AT, FLAG_SHADE, CL_PIECE_FLOATS, CL_JOIN_AT, CL_JOIN_FLOATS } from '../gpu/pack.js';
import { INTERP, DUAL, COLLAGE, withCollage } from '../gpu/wgsl.js';
import { COLLAGE_MARCH } from '../gpu/render.js';
import { COLLAGE_WALK } from '../gpu/push.js';
import { normCollage, prepare, collageAt, collageColour, collageTarget, MAX_PIECES, KERNELS, JOIN_OPS } from '../core/collage.js';
import { evalShade, packShade, READINGS, TYPE_CODE } from '../core/shade.js';
import { COLLAGES, collageCase } from './collage-cases.js';

const vec4 = (ops, at) => Array.from(ops.slice(at, at + 4));

test('every piece packs as the formula it is, behind its index', () => {
  for (const [label, c] of COLLAGES) {
    const pk = packCollage(c), g = normCollage(c);
    g.pieces.forEach((q, i) => {
      const one = pack(q.f);
      assert.deepEqual(Array.from(pk.ops.slice(i * OPS_FLOATS, (i + 1) * OPS_FLOATS)), Array.from(one.ops), `${label} P${i} ops`);
      assert.deepEqual(Array.from(new Uint8Array(pk.head, i * HEAD_BYTES, HEAD_BYTES)), Array.from(new Uint8Array(one.head)), `${label} P${i} head`);
    });
    // the program: the header, the placements, the joins in their codes
    const P = CL_AT;
    assert.deepEqual(vec4(pk.ops, P).slice(0, 2), [g.pieces.length, g.shade ? 1 : 0]);
    g.pieces.forEach((q, i) => {
      const o = P + (2 + i * 4) * 4, f = Math.fround;
      assert.deepEqual(Array.from(pk.ops.slice(o, o + 8)), [q.place.tx, q.place.ty, q.place.tz, q.place.s, q.place.rx, q.place.ry, q.place.rz, q.place.g].map(f));
      assert.equal(pk.ops[o + 8], q.rep ? { grid: 1, mirror: 2, polar: 3 }[q.rep.kind] : 0);
    });
    g.joins.forEach((j, i) => {
      const o = P + (2 + MAX_PIECES * 4 + i * 2) * 4;
      assert.equal(pk.ops[o], JOIN_OPS.indexOf(j.op));
      assert.equal(pk.ops[o + 1], KERNELS.indexOf(j.k));
      assert.equal(pk.ops[o + 2], Math.fround(j.r));
    });
  }
});

test('a binding names the program number its target is', () => {
  const [, c] = collageCase('three: turn, polar, chamfer cut');
  const pk = packCollage(c), g = normCollage(c);
  const targets = ['P0.tx', 'P0.s', 'P1.rz', 'P2.g', 'P0.r', 'J0.r', 'J1.r'];
  for (const to of targets) {
    const slot = collageSlot(g, to), t = collageTarget(g, to);
    assert.equal(pk.ops[CL_AT + 8 + slot], Math.fround(t.obj[t.key]), to);
  }
  assert.equal(collageSlot(g, 'P0.n'), null, 'a count is not driven');
  assert.equal(collageSlot(g, 'J0.r'), CL_JOIN_AT + 2);
  assert.equal(collageSlot(g, 'P2.s'), 2 * CL_PIECE_FLOATS + 3);
  assert.equal(collageSlot(g, 'J1.r'), CL_JOIN_AT + CL_JOIN_FLOATS + 2);
  // the drive's bindings: [slot, node, lo, hi] [min, max]
  const [, d] = collageCase('drive: axis → seam, time → place');
  const dk = packCollage(d), at = CL_AT + (2 + MAX_PIECES * 4 + (MAX_PIECES - 1) * 2) * 4;
  assert.deepEqual(vec4(dk.ops, at), [collageSlot(normCollage(d), 'J0.r'), 1, Math.fround(0.05), Math.fround(0.6)]);
  assert.deepEqual(vec4(dk.ops, at + 8).slice(0, 2), [collageSlot(normCollage(d), 'P1.ty'), 2]);
  assert.equal(dk.ops[CL_AT + 3], 1, 'the drive runs');
  // its nodes sit in the collage's own region, as a formula's drive program
  assert.equal(dk.ops[MAX_PIECES * OPS_FLOATS + DRIVE_AT], 3);
  assert.ok(collageShapes(d) && !collageShapes(collageCase('union quad')[1]));
});

test('the static step factor: √½ per chamfer, 0.3 for an unsafe piece', () => {
  assert.equal(collageStepFactor(collageCase('union quad')[1]).step, 1);
  assert.ok(Math.abs(collageStepFactor(collageCase('union chamfer')[1]).step - Math.SQRT1_2) < 1e-12);
  const c = normCollage({ pieces: [{ f: { slots: [[{ op: 'sin' }]], iters: 4 } }, { f: { slots: [[{ op: 'bulb' }, { op: '+c' }]] } }], joins: [{ k: 'chamfer' }] });
  const s = collageStepFactor(c);
  assert.ok(s.unsafe && Math.abs(s.step - 0.3 * Math.SQRT1_2) < 1e-12);
});

test('the collage shaders: heads and ops behind the piece index, the collage program read directly', () => {
  const src = withCollage(INTERP + DUAL);
  assert.ok(!/\bhead\./.test(src) && !/var<uniform> head:/.test(src));
  assert.ok(!/\bops\[(?!pb \+ )/.test(src), 'every read of the formula code goes through pb');
  assert.ok(src.includes('fn deFormula(') && !src.includes('fn de(x: vec3f)'));
  // the appended code reads the program by absolute index and defines the collage's estimate
  assert.ok(COLLAGE.includes('fn de(x: vec3f) -> f32 { return collageAt(x).d; }'));
  for (const s of [COLLAGE_MARCH, COLLAGE_WALK]) {
    assert.equal((s.match(/\bfn de\(x: vec3f\)/g) || []).length, 1);
    assert.equal((s.match(/\bfn shade\(|\bfn cwalk\(/g) || []).length, 1);
    assert.ok(!/\bhead\./.test(s));
  }
  // one call site of iterate in the collage's own code: the pieces dispatched from its loop
  assert.equal((COLLAGE.match(/\biterate\(/g) || []).length, 1);
});

test('piece and seam are readings: a collage shade reads them, a formula reads 0', () => {
  assert.ok(READINGS.includes('piece') && READINGS.includes('seam'));
  assert.equal(TYPE_CODE.piece, 8);
  assert.equal(TYPE_CODE.seam, 9);
  const sh = { nodes: [{ id: 'p', type: 'piece' }, { id: 's', type: 'seam' }, { id: 'm', type: 'math', in: { a: 'p', b: 's' }, p: { op: 'add' } },
    { id: 'r', type: 'ramp', in: { v: 'm' }, p: { stops: [{ t: 0, c: [0, 0, 0, 1] }, { t: 1, c: [1, 1, 1, 1] }], interp: 'linear', space: 'rgb' } }], out: { color: 'r', glow: 'm' } };
  assert.equal(evalShade(sh, { piece: 0.25, seam: 0.5 }).glow, 0.75);
  assert.equal(evalShade(sh, {}).glow, 0);
  const prog = packShade(sh);
  assert.equal(prog[(2 + 0 * 4) * 4], 8);
  assert.equal(prog[(2 + 1 * 4) * 4], 9);
  // through collageColour: the seam's middle of a two-piece union reads 1 there, the piece ½
  const c = prepare({ ...normCollage(collageCase('union quad')[1]), shade: sh });
  const at = { ...collageAt(c, [0, 0, 0]), piece: 0.5, seam: 1, w: [0.5, 0.5] };
  assert.deepEqual(collageColour(c, at, [{}, {}]), [1, 1, 1, 1]);
  // the packed head of the collage's own region says it shades
  const pk = packCollage(c);
  assert.equal(new Uint32Array(pk.head, MAX_PIECES * HEAD_BYTES, 4)[2] & FLAG_SHADE, FLAG_SHADE);
  assert.ok(pk.ops[MAX_PIECES * OPS_FLOATS + SHADE_AT] === sh.nodes.length);
});
