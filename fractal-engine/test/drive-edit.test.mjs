// V3: the driver lane's edits (core/drive-edit.js) — add, insert on links and bindings, connect, remove by
// bypass, parameters, the band's live trace and the line's range.
// Run: node --test fractal-engine/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, normalize, format, iterate } from '../core/index.js';
import * as G from '../core/graph.js';
import * as DE from '../core/drive-edit.js';

const BULB = normalize(parse('bulb 8 · +c ×6'));

test('driver edits: add, insert on a binding and a link, connect, loops refused, remove by bypass', () => {
  let f = DE.addDriver(BULB, 'i');
  assert.deepEqual(f.drive.nodes.map((m) => m.id), ['i0']);
  f = G.bind(f, 'A0.n', 'i0', 2, 8);
  // a remap between the binding and its source: the source becomes its input, nothing else moves
  f = DE.addDriver(f, 'remap', { bind: 'A0.n' });
  assert.equal(f.drive.bind[0].from, 'remap0');
  assert.equal(f.drive.nodes.find((m) => m.id === 'remap0').in.a, 'i0');
  assert.deepEqual(iterate(f, [0.3, 0.2, 0.1]).points, iterate(G.bind(DE.addDriver(BULB, 'i'), 'A0.n', 'i0', 2, 8), [0.3, 0.2, 0.1]).points);
  // a math node on the remap's input multiplies by 1: still nothing changes
  f = DE.addDriver(f, 'math', { node: 'remap0', port: 'a' });
  const m = f.drive.nodes.find((q) => q.type === 'math');
  assert.deepEqual([m.p.op, m.p.c, m.in.a], ['mul', 1, 'i0']);
  // a free reading, wired into the math's b; a loop refused
  f = DE.addDriver(f, 'r');
  f = DE.connectDriver(f, 'r0', m.id, 'b');
  assert.throws(() => DE.connectDriver(f, 'remap0', m.id, 'a'), /loop/);
  assert.ok(f.drive.nodes.findIndex((q) => q.id === 'r0') < f.drive.nodes.findIndex((q) => q.id === m.id), 'topological');
  f = DE.disconnectDriver(f, m.id, 'b');
  assert.equal(f.drive.nodes.find((q) => q.id === m.id).in.b, undefined);
  assert.throws(() => DE.disconnectDriver(f, 'remap0', 'a'), /must be connected/);
  // removing the math: the remap reads i0 again
  let g = DE.removeDriverNode(f, m.id);
  assert.equal(g.drive.nodes.find((q) => q.id === 'remap0').in.a, 'i0');
  // removing i0: the remap loses its required input and goes too, and so does the binding
  g = DE.removeDriverNode(g, 'i0');
  assert.equal(g.drive && g.drive.bind.length, g.drive ? 0 : undefined);
  // a free remap reads the iteration (one is made when there is none)
  const h = DE.addDriver(BULB, 'remap');
  assert.deepEqual(h.drive.nodes.map((q) => q.type), ['i', 'remap']);
  // round trip through the notation
  assert.equal(format(normalize(parse(format(f)))), format(f));
  assert.equal(DE.placeOf('noise'), 'top');
  assert.equal(DE.placeOf('trap'), 'lane');
  assert.equal(DE.nextDriverId(f, 'i'), 'i1');
  assert.throws(() => DE.addDriver(BULB, 'param'), /reads a parameter/);
  assert.equal(DE.addDriver(BULB, 'param', null, { of: 'A0.n' }).drive.nodes[0].p.of, 'A0.n');
});

test('driver parameters: numbers clamped, words and switches, unknown keys refused', () => {
  let f = DE.addDriver(BULB, 'noise');
  f = DE.setDriverParam(f, 'noise0', 'f', 99);
  assert.equal(f.drive.nodes[0].p.f, 16);
  f = DE.setDriverParam(f, 'noise0', 'o', 2.6);
  assert.equal(f.drive.nodes[0].p.o, 3);
  f = DE.addDriver(f, 'time');
  f = DE.setDriverParam(f, 'time0', 'wave', 'tri');
  assert.equal(f.drive.nodes.find((m) => m.id === 'time0').p.wave, 'tri');
  assert.throws(() => DE.setDriverParam(f, 'time0', 'wave', 'square'), /one of/);
  assert.throws(() => DE.setDriverParam(f, 'time0', 'nope', 1), /no parameter/);
  f = DE.addDriver(f, 'remap', null);
  f = DE.setDriverParam(f, 'remap0', 'clamp', true);
  assert.equal(f.drive.nodes.find((m) => m.id === 'remap0').p.clamp, true);
});

test('the band\'s live trace: the value each iteration gives its op; the line\'s range', () => {
  const f = G.bind(DE.addDriver(BULB, 'i'), 'A0.n', 'i0', 2, 8);
  const tr = DE.bindTrace(f, [0.3, 0.2, 0.1]);
  assert.equal(tr.length, 1);
  const o = iterate(f, [0.3, 0.2, 0.1]);
  assert.equal(tr[0].values.length, o.points.length - 1);
  tr[0].values.forEach((v, i) => assert.ok(Math.abs(v - (2 + (6 * i) / 6)) < 1e-12));
  // |p| at the start of each iteration, replayed from the orbit
  const g = G.bind(DE.addDriver(normalize(parse('fold.box 1 · scale 2 · +c ×8 bail=64')), 'r'), 'A1.s', 'r0', 2, 2.1);
  const og = iterate(g, [0.4, 0.3, 0.2]);
  DE.bindTrace(g, [0.4, 0.3, 0.2])[0].values.forEach((v, i) => assert.ok(Math.abs(v - (2 + 0.1 * Math.hypot(...og.points[i]))) < 1e-12));
  assert.deepEqual(DE.bindTrace(BULB, [0, 0, 0]), []);
  assert.deepEqual(DE.handleRange(8, 0.01, { min: 1, max: 16 }), [7.25, 8.75]);
  assert.deepEqual(DE.handleRange(1.2, 0.01, { min: 1, max: 16 }), [1, 1.95]);
});

// the graph's hover thumbnail is the field without an op (G.bypass): the bindings follow it as a delete
// moves them, so an op before a bound one still has its thumbnail (the touch rig holds A1 for it)
test('bypass re-points bindings as a delete does', () => {
  const f = normalize({ ...parse('abs · sort · scale 3 · + -2 -2 0 | fold.box 1 · fold.sphere .5 1 · scale 2.5 · +c ×9 AAB bail=100'),
    drive: { nodes: [{ id: 'r', type: 'r', in: {}, p: {} }], bind: [{ to: 'A2.s', from: 'r', lo: 2.9, hi: 3.1 }] } });
  const to = (g) => g && g.drive.bind.map((b) => b.to);
  for (const id of ['A0', 'A1', 'A3', 'B1']) {
    const b = G.bypass(f, id);
    assert.ok(b, `${id}: a thumbnail formula`);
    assert.deepEqual(b, G.remove(f, id), `${id}: the same formula a delete leaves`);
  }
  assert.deepEqual(to(G.bypass(f, 'A0')), ['A1.s']);
  assert.deepEqual(to(G.bypass(f, 'A1')), ['A1.s']);
  assert.deepEqual(to(G.bypass(f, 'A3')), ['A2.s']);
  // the bound op itself: its binding goes with it
  assert.deepEqual(to(G.bypass(f, 'A2')), []);
  // and the formula without A1 is one the app can carry (its notation reads back the same)
  const g = G.bypass(f, 'A1');
  assert.equal(format(parse(format(g))), format(g));
});
