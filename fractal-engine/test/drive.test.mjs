// V1: drivers — parameters driven by the orbit, the world, time and each other (core/drive.js).
// Run: node --test fractal-engine/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parse, format, normalize, validate, hash, iterate, de, push, lyapunovOrbit, jacobian, fbm,
  evalDrive, driveParams,
} from '../core/index.js';
import * as G from '../core/graph.js';
import { mutate } from '../core/breed.js';
import { stateDoc } from '../core/state.js';

const MANDELBOX = 'fold.box 1 · fold.sphere .5 1 · scale 2 · +c ×12 bail=64';
const HYBRID = 'abs · sort · scale 3 · + -2 -2 0 | bulb 8 · +c ×9 AAB seed=7';
const withDrive = (text, drive) => normalize({ ...parse(text), drive });
const pts = (f, p, opts) => iterate(f, p, undefined, opts).points;

test('drivers: a bulb whose power follows the iteration is the hand-unrolled schedule', () => {
  const N = 6, lo = 2, hi = 8;
  const f = withDrive(`bulb 8 · +c ×${N}`, { nodes: [{ id: 'i', type: 'i' }], bind: [{ to: 'A0.n', from: 'i', lo, hi }] });
  assert.ok(validate(f).ok, validate(f).errors.join('; '));
  // one slot per iteration, its power written out
  const slots = Array.from({ length: N }, (_, k) => [{ op: 'bulb', p: { n: lo + (k / N) * (hi - lo) } }, { op: '+c', p: {} }]);
  const u = normalize({ ...parse(`bulb 8 · +c ×${N}`), slots, schedule: 'ABCDEF' });
  for (const p of [[0.3, 0.2, 0.1], [-0.5, 0.4, 0.6], [0.9, -0.1, 0.2]]) {
    for (const c of [[0, 0, 0, 0], [0.2, -0.3, 0.1, 0]]) {
      assert.deepEqual(iterate(f, p, c).points, iterate(u, p, c).points);
    }
    assert.equal(de(f, p), de(u, p));
  }
  // readings: the orbit's own |p| and trap drive too, read at the start of each iteration
  const r = withDrive('fold.box 1 · scale 2 · +c ×8 bail=64', { nodes: [{ id: 'r', type: 'r' }], bind: [{ to: 'A1.s', from: 'r', lo: 2, hi: 2.1 }] });
  const o = iterate(r, [0.4, 0.3, 0.2]), m = iterate(normalize(parse('fold.box 1 · scale 2 · +c ×8 bail=64')), [0.4, 0.3, 0.2]);
  assert.notDeepEqual(o.points, m.points);
  // replayed by hand: each iteration's scale is 2 + 0.1·|p| at its start
  let p = [0.4, 0.3, 0.2, 0];
  const c = [0, 0, 0, 0];
  for (let i = 0; i < o.n; i++) {
    const s = 2 + 0.1 * Math.hypot(...p);
    p = p.map((v) => (v > 1 ? 2 - v : v < -1 ? -2 - v : v)).map((v, a) => v * s + c[a]);
    assert.ok(p.every((v, a) => Math.abs(v - o.points[i + 1][a]) < 1e-12), `iteration ${i}`);
  }
});

test('drivers: world fields, the start, time and parameters read where they should', () => {
  // the Mandelbox's scale follows x across the world: equal to the plain formula with that scale
  const f = withDrive(MANDELBOX, { nodes: [{ id: 'ax', type: 'axis', p: { nx: 1, g: 1 } }], bind: [{ to: 'A2.s', from: 'ax', lo: 2, hi: 2.5 }] });
  for (const p of [[0.3, 0.2, 0.1], [-1.2, 0.4, 0.6], [2, -0.1, 0.2]]) {
    const plain = normalize(parse(MANDELBOX));
    plain.slots[0][2].p.s = 2 + 0.5 * p[0];
    assert.deepEqual(pts(f, p), pts(plain, p));
  }
  // the binding's value clamps to the parameter's range
  const big = withDrive(MANDELBOX, { nodes: [{ id: 'ax', type: 'axis', p: { nx: 1, g: 1 } }], bind: [{ to: 'A0.l', from: 'ax', lo: 0, hi: -10 }] });
  const zero = normalize(parse(MANDELBOX)); zero.slots[0][0].p.l = 0;
  assert.deepEqual(pts(big, [1, 0, 0]), pts(zero, [1, 0, 0]));

  // the reference evaluator: fields are core/fields.js's, the start, time waves, params and maths
  const x = [0.3, -0.7, 1.1, 0.2];
  const drive = {
    nodes: [
      { id: 'n', type: 'noise', p: { f: 1.3, g: 2, o: 3, seed: 7 } },
      { id: 's', type: 'sphere', p: { cx: 1, r: 0.5, g: 3 } },
      { id: 'y', type: 'y' },
      { id: 't', type: 'time', p: { rate: 0.5, phase: 0.1, wave: 'saw' } },
      { id: 'tri', type: 'time', p: { rate: 1, wave: 'tri' } },
      { id: 'own', type: 'param', p: { of: 'A2.s' } },
      { id: 'm', type: 'math', in: { a: 'own', b: 'y' }, p: { op: 'mul' } },
      { id: 'rm', type: 'remap', in: { a: 'm' }, p: { lo: -4, hi: 4, clamp: true } },
      { id: 'c', type: 'tissue', p: { n: 4, size: 1.5, soft: 0.1, seed: 2 } },
      { id: 'wall', type: 'tissue', p: { n: 4, size: 1.5, seed: 2, out: 'wall' } },
    ],
    bind: [],
  };
  const { reg } = evalDrive(drive, { start: x, time: 3, own: () => 2 });
  assert.equal(reg.get('n'), 2 * fbm(x, 1.3, 3, 7).n);
  assert.ok(Math.abs(reg.get('s') - 3 * (Math.hypot(x[0] - 1, x[1], x[2], x[3]) - 0.5)) < 1e-12);
  assert.equal(reg.get('y'), -0.7);
  assert.ok(Math.abs(reg.get('t') - 0.6) < 1e-12);
  assert.equal(reg.get('tri'), 0);
  assert.equal(reg.get('m'), -1.4);
  assert.ok(Math.abs(reg.get('rm') - (2.6 / 8)) < 1e-12);
  assert.ok(reg.get('c') >= 0 && reg.get('c') <= 1 && reg.get('wall') >= 0);
  // the tissue's cell value is continuous: a small step moves it a little
  const near = evalDrive(drive, { start: x.map((v) => v + 1e-6), time: 3, own: () => 2 }).reg.get('c');
  assert.ok(Math.abs(near - reg.get('c')) < 1e-3);

  // time: a formula at two clocks differs, at one clock it is repeatable
  const tf = withDrive(MANDELBOX, { nodes: [{ id: 't', type: 'time', p: { rate: 1, wave: 'sine' } }], bind: [{ to: 'A2.s', from: 't', lo: 1.8, hi: 2.2 }] });
  assert.notDeepEqual(pts(tf, [0.5, 0.2, 0.1], { time: 0 }), pts(tf, [0.5, 0.2, 0.1], { time: 0.25 }));
  assert.deepEqual(pts(tf, [0.5, 0.2, 0.1], { time: 0.25 }), pts(tf, [0.5, 0.2, 0.1], { time: 0.25 }));
  // a param link: the sphere fold's rfix follows the scale's own value (0.5 of it)
  const pf = withDrive(MANDELBOX, { nodes: [{ id: 'o', type: 'param', p: { of: 'A2.s' } }], bind: [{ to: 'A1.rfix', from: 'o', lo: 0, hi: 0.5 }] });
  const pl = normalize(parse(MANDELBOX)); pl.slots[0][1].p.rfix = 1;
  assert.deepEqual(pts(pf, [0.3, 0.2, 0.1]), pts(pl, [0.3, 0.2, 0.1]));

  // a driven species op inside a chimera, and a driven field weight
  const chim = '[bulb 8 · +c ‖ fold.box 1 · scale 2 · +c] .5 ×8';
  const cf = withDrive(chim, { nodes: [{ id: 'x', type: 'x' }], bind: [{ to: 'A0.0.0.n', from: 'x', lo: 4, hi: 8 }, { to: 'A0.w', from: 'x', lo: 0.2, hi: 0.8 }] });
  assert.ok(validate(cf).ok, validate(cf).errors.join('; '));
  const p0 = [0.5, 0.1, 0.2], cp = normalize(parse(chim));
  cp.slots[1][0].p.n = 4 + 4 * 0.5; cp.slots[0][0].p.w = 0.2 + 0.6 * 0.5;
  assert.deepEqual(pts(cf, p0), pts(cp, p0));
  // Lyapunov and the one-iteration Jacobian see the driven values
  assert.equal(lyapunovOrbit(cf, p0), lyapunovOrbit(cp, p0));
  assert.deepEqual(jacobian(cf, p0, p0), jacobian(cp, p0, p0));
});

test('drivers: undriven formulas are untouched; a band equal to the own value changes nothing', () => {
  for (const t of [MANDELBOX, HYBRID]) {
    const f = normalize(parse(t));
    assert.equal(f.drive, undefined);
    assert.equal(format(f), format(parse(format(f))));
    assert.ok(!format(f).includes('drive='));
    // an empty drive is no drive: same id
    assert.equal(hash({ ...f, drive: { nodes: [], bind: [] } }), hash(f));
  }
  // hoisted drivers whose band is the parameter's own value: the same orbit, the same push walk
  const f = normalize(parse(HYBRID));
  const g = withDrive(HYBRID, { nodes: [{ id: 'n', type: 'noise' }], bind: [{ to: 'B0.n', from: 'n', lo: 8, hi: 8 }, { to: 'A2.s', from: 'n', lo: 3, hi: 3 }] });
  for (const p of [[0.3, 0.2, 0.1], [-1.2, 0.4, 0.6]]) assert.deepEqual(pts(g, p), pts(f, p));
  const S = normalize(parse('fold.plane 1 1 0 · fold.plane 1 0 1 · fold.plane 0 1 1 · scale 2 · + -1 -1 -1 ×16 bail=16'));
  const SD = { ...S, drive: { nodes: [{ id: 'z', type: 'pz' }], bind: [{ to: 'A3.s', from: 'z', lo: 2, hi: 2 }] } };
  const a = push(S, 300), b = push(SD, 300);
  assert.equal(a.length, b.length);
  a.forEach((q, i) => assert.ok(q.p.every((v, k) => Math.abs(v - b[i].p[k]) < 1e-12)));
  // a driven push still lands samples
  const SV = { ...S, drive: { nodes: [{ id: 'x', type: 'x' }], bind: [{ to: 'A3.s', from: 'x', lo: 1.9, hi: 2.1 }] } };
  const c = push(SV, 200);
  assert.equal(c.length, 200);
  assert.ok(c.every((q) => q.p.every(Number.isFinite)));
});

test('drivers: notation, hash, state and validation', () => {
  const drive = {
    nodes: [{ id: 'i', type: 'i' }, { id: 'n', type: 'noise', p: { f: 2 } }, { id: 'm', type: 'math', in: { a: 'i', b: 'n' }, p: { op: 'add' } }],
    bind: [{ to: 'A2.s', from: 'm', lo: 1.9, hi: 2.3 }, { to: 'A0.l', from: 'n', lo: 0.8, hi: 1.2 }],
  };
  const f = withDrive(MANDELBOX, drive);
  assert.ok(validate(f).ok, validate(f).errors.join('; '));
  assert.notEqual(hash(f), hash(parse(MANDELBOX)));
  const text = format(f);
  assert.match(text, / drive=[A-Za-z0-9_-]+/);
  const back = parse(text);
  assert.deepEqual(normalize(back), f);
  assert.equal(hash(back), hash(f));
  assert.equal(format(back), text);
  // bindings are kept in a canonical order: the same drive written another way has the same id
  assert.equal(hash(withDrive(MANDELBOX, { ...drive, bind: [...drive.bind].reverse() })), hash(f));
  assert.deepEqual(normalize(stateDoc({ formula: f, cam: { pos: [0, 0, -3], yaw: 0, pitch: 0 } }).formula).drive, f.drive);
  assert.deepEqual(G.flatten(G.tree(f)).drive, f.drive);

  const bad = (d, re) => {
    const v = validate(normalize({ ...parse(MANDELBOX), drive: d }));
    assert.ok(!v.ok && v.errors.some((e) => re.test(e)), `${re}: ${v.errors.join('; ')}`);
  };
  const I = [{ id: 'i', type: 'i' }];
  bad({ nodes: I, bind: [{ to: 'A9.s', from: 'i' }] }, /cannot be driven|not a parameter/);
  bad({ nodes: I, bind: [{ to: 'A2.q', from: 'i' }] }, /not a parameter/);
  bad({ nodes: I, bind: [{ to: 'A2.s', from: 'nope' }] }, /not a node/);
  bad({ nodes: I, bind: [{ to: 'A2.s', from: 'i' }, { to: 'A2.s', from: 'i', lo: 3 }] }, /bound twice/);
  bad({ nodes: [{ id: 'x', type: 'bogus' }], bind: [] }, /unknown type/);
  bad({ nodes: [{ id: 'm', type: 'math', in: { a: 'later' } }, { id: 'later', type: 'i' }], bind: [] }, /earlier node/);
  bad({ nodes: [{ id: 'r', type: 'remap' }], bind: [] }, /not connected/);
  bad({ nodes: [{ id: 'p', type: 'param', p: { of: 'B0.n' } }], bind: [] }, /no parameter/);
  bad({ nodes: Array.from({ length: 33 }, (_, k) => ({ id: 'n' + k, type: 'i' })), bind: [] }, /more than 32/);
  // a discrete parameter (a tissue's count) cannot be driven
  const tissue = normalize({ ...parse('[bulb 8 · +c ‖ bulb 3 · +c] tissue 6 ×8'), drive: { nodes: I, bind: [{ to: 'A0.n', from: 'i' }] } });
  assert.ok(!validate(tissue).ok);
});

test('drivers: graph edits carry the bindings; bind, unbind, bands, drivers', () => {
  const base = withDrive(MANDELBOX, {
    nodes: [{ id: 'i', type: 'i' }, { id: 'own', type: 'param', p: { of: 'A1.rmin' } }],
    bind: [{ to: 'A2.s', from: 'i', lo: 1.9, hi: 2.2 }, { to: 'A1.rfix', from: 'own', lo: 0, hi: 2 }],
  });
  const tos = (f) => (f.drive ? f.drive.bind.map((b) => b.to).sort() : []);
  // an op inserted before: the targets shift with their ops
  const ins = G.insert(base, 'A', 0, 'abs');
  assert.deepEqual(tos(ins), ['A2.rfix', 'A3.s']);
  assert.equal(ins.drive.nodes.find((m) => m.id === 'own').p.of, 'A2.rmin');
  // moved: follows
  const mv = G.move(base, 'A2', 'A', 0);
  assert.deepEqual(tos(mv), ['A0.s', 'A2.rfix']);
  // removed: its binding goes; a param driver reading it becomes the constant it read
  const rm = G.remove(base, 'A1');
  assert.deepEqual(tos(rm), ['A1.s']);
  const k = rm.drive.nodes.find((m) => m.id === 'own');
  assert.equal(k.type, 'math');
  assert.equal(k.p.c, 0.5);
  // forked: the copy is driven like the original, so the orbit is unchanged
  const fk = G.fork(base, 'A', 2);
  assert.deepEqual(tos(fk), ['A1.rfix', 'A2.0.0.s', 'A2.1.0.s']);
  for (const p of [[0.3, 0.2, 0.1], [-1.2, 0.4, 0.6]]) {
    const a = pts(base, p).at(-1), b = pts(fk, p).at(-1);
    assert.ok(a.every((v, i) => Math.abs(v - b[i]) < 1e-9 * (1 + Math.abs(v))));
  }
  // another species: a copy, bound too; unwrap keeps the kept species' bindings
  const sp = G.addSpecies(fk, 'A2');
  assert.deepEqual(tos(sp), ['A1.rfix', 'A2.0.0.s', 'A2.1.0.s', 'A2.2.0.s']);
  assert.deepEqual(tos(G.unwrap(sp, 'A2', 1)), ['A1.rfix', 'A2.s']);
  // a field weight bound, then the field changed to one without it: the binding goes
  const wb = G.bind(fk, 'A2.w', 'i', 0.3, 0.7);
  assert.ok(tos(wb).includes('A2.w'));
  assert.ok(!tos(G.setField(wb, 'A2', 'mix.tissue')).includes('A2.w'));
  // a chain added is a copy, bindings and all; removing the first renames the later chain's bindings
  const two = G.bind(G.addChain(base), 'B2.s', 'i', 2, 3);
  assert.deepEqual(tos(two), ['A1.rfix', 'A2.s', 'B1.rfix', 'B2.s']);
  assert.equal(two.drive.bind.find((b) => b.to === 'B2.s').hi, 3);
  const one = G.removeChain(two, 'A');
  assert.deepEqual(tos(one), ['A1.rfix', 'A2.s']);
  assert.equal(one.drive.bind.find((b) => b.to === 'A2.s').hi, 3);

  // bind / unbind / setBand / drivers
  const b2 = G.bind(base, 'A0.l', 'i', 0.5, 1);
  assert.deepEqual(tos(b2), ['A0.l', 'A1.rfix', 'A2.s']);
  assert.deepEqual(G.bind(b2, 'A0.l', 'i', 0.6, 1).drive.bind.find((b) => b.to === 'A0.l').lo, 0.6);
  assert.throws(() => G.bind(base, 'A9.s', 'i'));
  assert.throws(() => G.bind(base, 'A0.l', 'nope'));
  assert.deepEqual(tos(G.unbind(b2, 'A0.l')), ['A1.rfix', 'A2.s']);
  assert.equal(G.setBand(base, 'A2.s', 1, 3).drive.bind.find((b) => b.to === 'A2.s').hi, 3);
  const nd = G.setDriver(base, { id: 'ax', type: 'axis', p: { ny: 1 } });
  assert.equal(nd.drive.nodes.at(-1).id, 'ax');
  const rd = G.removeDriver(base, 'i');
  assert.deepEqual(tos(rd), ['A1.rfix']);
  // nothing left: the drive goes and the id is the plain formula's
  const none = G.unbind(G.unbind(G.removeDriver(G.removeDriver(base, 'i'), 'own'), 'A2.s'), 'A1.rfix');
  assert.equal(none.drive, undefined);
  assert.equal(hash(none), hash(parse(MANDELBOX)));
});

test('drivers: breeding moves bands and driver parameters, never structure', () => {
  const f = withDrive(MANDELBOX, { nodes: [{ id: 'n', type: 'noise' }], bind: [{ to: 'A2.s', from: 'n', lo: 1.9, hi: 2.2 }] });
  const refs = driveParams(f.drive).map((q) => q.ref);
  assert.deepEqual(refs, ['bind/A2.s/lo', 'bind/A2.s/hi', 'node/n/f', 'node/n/g']);
  let k = 0;
  const rnd = () => [0.3, 0.7, 0.1, 0.9, 0.5, 0.2][k++ % 6];
  const metric = refs.map((drive) => ({ drive, pxPerUnit: 100 }));
  const g = mutate(f, metric, new Set(['node/n/g']), 10, rnd);
  assert.ok(validate(normalize(g)).ok);
  assert.notEqual(g.drive.bind[0].lo, 1.9);
  assert.equal(g.drive.nodes[0].p.g, 1);
  assert.deepEqual(g.drive.nodes.map((m) => m.type), ['noise']);
  assert.deepEqual(g.slots, normalize(f).slots.map((s) => s.map((o) => ({ op: o.op, p: o.p }))));
});
