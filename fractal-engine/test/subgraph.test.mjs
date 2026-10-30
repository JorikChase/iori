// Subgraphs (core/sub.js, DESIGN.md "Subgraphs"): a link over plain ops. The engines see only slots, so the
// tests here are about the link: that it holds through every edit, the notation, the hash and breeding.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, validate, canonical, hash, parse, format, iterate, toURLHash, fromURLHash } from '../core/index.js';
import * as G from '../core/graph.js';
import { linkMap, masterParam, reduceMetric, useOf } from '../core/sub.js';
import { mutate } from '../core/breed.js';
import { makeRng } from '../core/rng.js';
import { parseCollage, formatCollage, canonicalCollage } from '../core/collage.js';
import { stateDoc } from '../core/state.js';

const BOX = 'fold.box 1 · fold.sphere .5 1 · scale 2 · +c · fold.sphere .5 1 · scale 2 ×6 bail=100';
const wrapped = () => G.place(G.remove(G.remove(G.wrap(parse(BOX), 'A', 1, 2), 'A4'), 'A4'), 'a', 'A', 4);
const rnd = (seed) => { const r = makeRng(seed); return () => r.float(); };
const ops = (f) => f.slots.flat().map((o) => o.op);

test('a wrap changes nothing but the link', () => {
  const f = normalize(parse(BOX)), g = G.wrap(f, 'A', 1, 2);
  assert.deepEqual(g.slots, f.slots);
  assert.deepEqual(g.sub, [{ id: 'a', n: 2, uses: ['A1'], expose: [] }]);
  assert.ok(validate(g).ok);
  assert.notEqual(hash(f), hash(g));
  assert.equal(hash(normalize(parse(format(f)))), hash(f), 'a plain formula keeps its id');
  assert.ok(!('sub' in JSON.parse(canonical(f))));
});

test('a placed use equals the plain formula, ray for ray', () => {
  const g = wrapped(), plain = normalize({ ...g, sub: undefined });
  assert.equal(format(g), 'fold.box · a( fold.sphere · scale ) · +c · a( ) ×6 bail=100');
  assert.deepEqual(plain.slots, normalize(parse(BOX)).slots);
  const x = [0.31, -0.2, 0.44];
  assert.deepEqual(iterate(g, x), iterate(plain, x));
});

test('the notation round-trips, exposed numbers, chimeras and species included', () => {
  for (const text of [
    'a( fold.sphere .5 1 · scale ^2 ) · +c · a( 2.5 ) ×12',
    'a( fold.box ^1 · scale ^2 ) · b( abs ) · a( 1.5 3 ) · b( ) · +c | a( .5 ) ×9 AB',
    '[ a( abs · scale ^2 ) ‖ bulb 8 ] .3 · +c · a( 3 ) ×8',
    'a( [ fold.box ^1 ‖ scale ^2 ] ^.3 · abs ) · +c | a( .7 1.5 .2 ) ×7 AB',
  ]) {
    const f = normalize(parse(text));
    assert.ok(validate(f).ok, `${text}: ${validate(f).errors}`);
    const again = normalize(parse(format(f)));
    assert.equal(format(again), format(f), text);
    assert.deepEqual(JSON.parse(canonical(again)), JSON.parse(canonical(f)), text);
    assert.deepEqual(normalize(fromURLHash(toURLHash(f))).sub, f.sub);
  }
  const f = normalize(parse('a( fold.sphere .5 1 · scale ^2 ) · +c · a( 2.5 ) ×12'));
  assert.deepEqual(f.sub, [{ id: 'a', n: 2, uses: ['A0', 'A3'], expose: ['1.s'] }]);
  assert.equal(f.slots[0][1].p.s, 2);
  assert.equal(f.slots[0][4].p.s, 2.5);
  for (const bad of ['a( )  ×3', 'a( a( abs ) ) ×3', 'a( abs ×3', 'a( abs ) · a( 1 ) ×3', 'abs ^2 ×3', 'a( abs | scale ) ×3']) assert.throws(() => parse(bad), undefined, bad);
});

test('a shared number is every use\'s, an exposed one its own', () => {
  let f = wrapped();
  f = G.setParam(f, 'A5', 's', 3);    // the second use's: shared, so both
  assert.deepEqual([f.slots[0][2].p.s, f.slots[0][5].p.s], [3, 3]);
  f = G.expose(f, 'A2', 's');
  f = G.setParam(f, 'A5', 's', 4);
  assert.deepEqual([f.slots[0][2].p.s, f.slots[0][5].p.s], [3, 4]);
  assert.deepEqual(G.exposedOf(f, 'A4').map((q) => [q.id, q.key, q.value]), [['A5', 's', 4]]);
  f = G.unexpose(f, 'A5', 's');
  assert.deepEqual([f.slots[0][2].p.s, f.slots[0][5].p.s], [3, 3]);
  // a direct write to a copy does not last: normalize takes the first use's
  const g = JSON.parse(JSON.stringify(f));
  g.slots[0][5].p.s = 9;
  assert.equal(normalize(g).slots[0][5].p.s, 3);
  assert.equal(normalize(parse(format(g))).slots[0][5].p.s, 3);
});

test('structure edits inside a use reach every use', () => {
  let f = wrapped();
  f = G.expose(f, 'A5', 's');
  f = G.setParam(f, 'A5', 's', 4);
  // an op inserted between the members of the second use
  f = G.insert(f, 'A', 5, 'abs');
  assert.deepEqual(ops(f), ['fold.box', 'fold.sphere', 'abs', 'scale', '+c', 'fold.sphere', 'abs', 'scale']);
  assert.deepEqual(f.sub[0], { id: 'a', n: 3, uses: ['A1', 'A5'], expose: ['2.s'] });
  assert.equal(f.slots[0][7].p.s, 4, 'the exposed number stays with its use');
  // the ends of a run are the chain's edges: insertIn reaches them
  f = G.insertIn(f, 'a', 3, 'sort');
  assert.deepEqual(ops(f), ['fold.box', 'fold.sphere', 'abs', 'scale', 'sort', '+c', 'fold.sphere', 'abs', 'scale', 'sort']);
  // removing a member removes it everywhere
  f = G.remove(f, 'A7');
  assert.deepEqual(ops(f), ['fold.box', 'fold.sphere', 'scale', 'sort', '+c', 'fold.sphere', 'scale', 'sort']);
  // a move inside the run
  f = G.move(f, 'A3', 'A', 2);
  assert.deepEqual(ops(f), ['fold.box', 'fold.sphere', 'sort', 'scale', '+c', 'fold.sphere', 'sort', 'scale']);
  assert.deepEqual(f.sub[0].expose, ['2.s']);
  assert.ok(validate(f).ok);
  assert.equal(format(normalize(parse(format(f)))), format(f));
});

test('a chimera forked inside a run forks in every use', () => {
  let f = G.place(G.wrap(parse('abs · scale 2 · +c ×6'), 'A', 0, 1), 'a', 'A', 3);
  f = G.fork(f, 'A', 4);
  assert.ok(validate(f).ok, validate(f).errors.join());
  assert.equal(f.sub[0].n, 2);
  assert.deepEqual(f.sub[0].uses, ['A0', 'A3']);
  assert.deepEqual(ops(f), ['abs', 'mix', '+c', 'abs', 'mix', 'scale', 'scale', 'scale', 'scale']);
  f = G.setParam(f, 'A1.1.0', 's', 3);
  assert.equal(f.slots.at(-1)[0].p.s, 3, 'the same species of the other use');
  assert.equal(format(normalize(parse(format(f)))), format(f));
  // a chimera subgraph has no place in a species
  assert.throws(() => G.place(f, 'a', 'A1.0', 0));
});

test('uses are placed, moved, removed and detached', () => {
  let f = wrapped();
  f = G.moveUse(f, 'A4', 'A', 1);
  assert.deepEqual(f.sub[0].uses, ['A1', 'A3']);
  assert.deepEqual(ops(f), ['fold.box', 'fold.sphere', 'scale', 'fold.sphere', 'scale', '+c']);
  assert.ok(validate(f).ok);
  const a = G.detach(f, 'A3');
  assert.deepEqual(a.sub[0].uses, ['A1']);
  assert.deepEqual(a.slots, f.slots);
  const b = G.detach(a, 'A1');
  assert.equal(b.sub, undefined);
  assert.deepEqual(b.slots, f.slots);
  const c = G.removeUse(f, 'A1');
  assert.deepEqual(ops(c), ['fold.box', 'fold.sphere', 'scale', '+c']);
  assert.deepEqual(c.sub[0].uses, ['A1']);
  assert.throws(() => G.place(f, 'a', 'A', 2), /inside/);
  assert.throws(() => G.wrap(f, 'A', 2, 3), /inside/);
  assert.throws(() => G.place(f, 'z', 'A', 0));
  // a use in a species, and the eight-slot, 64-op bound the uses share
  const s = G.place(G.fork(G.wrap(parse('abs · scale 2 · +c ×6'), 'A', 0, 1), 'A', 2), 'a', 'A2.0', 0);
  assert.deepEqual(s.sub[0].uses, ['A0', 'A2.0.0']);
  assert.ok(validate(s).ok);
  let big = G.wrap(parse('[ abs ‖ sort ] .5 · [ abs ‖ sort ] .5 · [ abs ‖ sort ] .5 ×6'), 'A', 0, 0);
  assert.throws(() => G.place(big, 'a', 'A', 3), /slots/);
});

test('bindings stay with their use and come along with a copy', () => {
  let f = G.wrap(parse('fold.box 1 · scale 2 · +c ×6'), 'A', 0, 1);
  f = G.setDriver(f, { id: 'r0', type: 'r', in: {}, p: {} });
  f = G.bind(f, 'A1.s', 'r0', 1, 3);
  f = G.place(f, 'a', 'A', 3);
  assert.deepEqual(f.drive.bind.map((b) => b.to), ['A1.s', 'A4.s']);
  f = G.insert(f, 'A', 1, 'abs');
  assert.deepEqual(f.drive.bind.map((b) => b.to), ['A2.s', 'A6.s']);
  f = G.unbind(f, 'A6.s');
  f = G.remove(f, 'A1');
  assert.deepEqual(f.drive.bind.map((b) => b.to), ['A1.s']);
  assert.ok(validate(f).ok);
});

test('breeding: a shared number is one gene', () => {
  const f = G.setParam(G.expose(wrapped(), 'A2', 's'), 'A5', 's', 2.5);
  const links = linkMap(f);
  assert.equal(links.size, 2, 'fold.sphere rmin, rfix of the second use (scale s is exposed)');
  assert.deepEqual(masterParam(f, 4, 'rmin'), { oi: 1, key: 'rmin' });
  assert.deepEqual(masterParam(f, 5, 's'), { oi: 5, key: 's' });
  const metric = [{ oi: 1, key: 'rmin', pxPerUnit: 10 }, { oi: 4, key: 'rmin', pxPerUnit: 5 }, { oi: 2, key: 's', pxPerUnit: 8 }, { oi: 5, key: 's', pxPerUnit: 8 }];
  const m = reduceMetric(f, metric);
  assert.deepEqual(m.map((q) => [q.oi, q.key, q.pxPerUnit]), [[1, 'rmin', 15], [2, 's', 8], [5, 's', 8]]);
  const g = normalize(mutate(f, m, new Set(), 6, rnd(3)));
  assert.equal(g.slots[0][1].p.rmin, g.slots[0][4].p.rmin);
  assert.notEqual(g.slots[0][1].p.rmin, f.slots[0][1].p.rmin);
  assert.notEqual(g.slots[0][2].p.s, g.slots[0][5].p.s);
});

test('collages, state documents and validation carry the link', () => {
  const c = parseCollage('{ a( abs · scale ^2 ) · +c · a( 3 ) ×8 } at .5 0 0 ∪ .2 { bulb 8 · +c ×10 }');
  assert.deepEqual(c.pieces[0].f.sub[0].uses, ['A0', 'A3']);
  assert.deepEqual(JSON.parse(canonicalCollage(parseCollage(formatCollage(c)))), JSON.parse(canonicalCollage(c)));
  const f = wrapped(), doc = stateDoc({ formula: f, cam: { pos: [0, 0, 3], yaw: 0, pitch: 0 } });
  assert.deepEqual(doc.formula.sub, f.sub);
  assert.equal(doc.notation, format(f));
  const bad = [
    { sub: [{ id: 'ab', n: 1, uses: ['A0'], expose: [] }] },
    { sub: [{ id: 'a', n: 9, uses: ['A0'], expose: [] }] },
    { sub: [{ id: 'a', n: 2, uses: ['A0', 'A1'], expose: [] }] },
    { sub: [{ id: 'a', n: 1, uses: ['A0', 'A1'], expose: [] }] },
    { sub: [{ id: 'a', n: 1, uses: ['A0'], expose: ['0.nope'] }] },
    { sub: [{ id: 'a', n: 1, uses: ['Z0'], expose: [] }] },
  ];
  for (const b of bad) assert.ok(!validate({ ...normalize(parse('abs · scale 2 ×6')), ...b }).ok, JSON.stringify(b));
  assert.equal(useOf(f, 'A0'), null);
  assert.equal(useOf(f, 'A2').member, 1);
});

test('shading and driver subgraphs: parameters and inner links shared, outside links their own', async () => {
  const SE = await import('../core/shade-edit.js'), DE = await import('../core/drive-edit.js');
  const { wrapNet, placeNet, detachNet, exposeNet, exposedNet, foldNet, peersOfNet } = await import('../core/netsub.js');
  const { evalShade, normShade } = await import('../core/shade.js');
  let f = SE.shadeOn(parse('bulb 8 · +c ×6'));
  f = SE.addNode(f, 'math');
  const m = normalize(f).shade.nodes.find((n) => n.type === 'math').id;
  const newId = (net, type) => { let i = 0; while (net.nodes.some((n) => n.id === `${type}${i}`)) i++; return `${type}${i}`; };
  const put = (shade) => normalize({ ...f, shade });
  f = put(wrapNet(normalize(f).shade, [m]));
  assert.equal(f.shade.sub[0].id, 'a');
  assert.ok(validate(f).ok, validate(f).errors.join());
  f = put(placeNet(f.shade, 'a', newId));
  const [, peer] = f.shade.sub[0].uses.map((u) => u[0]);
  assert.notEqual(peer, m);
  // the first use's number reaches the other; the text round-trips with the link in shade=
  f = SE.setNodeParam(f, m, 'c', 2.5);
  assert.equal(f.shade.nodes.find((n) => n.id === peer).p.c, 2.5);
  assert.deepEqual(normalize(parse(format(f))).shade, f.shade);
  // exposed: each its own
  f = put(exposeNet(f.shade, m, 'c'));
  f = SE.setNodeParam(f, peer, 'c', 4);
  assert.deepEqual(f.shade.nodes.filter((n) => n.type === 'math').map((n) => n.p.c), [2.5, 4]);
  assert.deepEqual(exposedNet(f.shade, peer).map((e) => [e.id, e.key, e.value]), [[peer, 'c', 4]]);
  const fold = foldNet(f.shade);
  assert.equal(fold.uses.size, 2);
  assert.deepEqual(peersOfNet(f.shade, peer), [m, peer]);
  // a removed node leaves its place in every use; the last takes the subgraph
  const g = SE.removeNode(SE.removeNode(f, peer), m);
  assert.equal(g.shade.sub, undefined);
  assert.equal(normalize(put(detachNet(f.shade, m))).shade.sub[0].uses.length, 1);
  // drivers: the same link, through an op edit too (the bindings' remap keeps it)
  let d = G.setDriver(parse('fold.box · scale 2 · +c ×6'), { id: 'n0', type: 'noise', in: {}, p: {} });
  d = G.setDriver(d, { id: 'm0', type: 'math', in: { a: 'n0' }, p: { op: 'mul', c: 2 } });
  d = G.bind(d, 'A1.s', 'm0', 1, 3);
  d = normalize({ ...d, drive: wrapNet(d.drive, ['n0', 'm0']) });
  d = normalize({ ...d, drive: placeNet(d.drive, 'a', newId) });
  assert.ok(validate(d).ok, validate(d).errors.join());
  const [a, b] = d.drive.sub[0].uses;
  assert.equal(d.drive.nodes.find((n) => n.id === b[1]).in.a, b[0], 'the copy reads its own copy');
  d = G.setDriver(d, { ...d.drive.nodes.find((n) => n.id === a[0]), p: { ...d.drive.nodes.find((n) => n.id === a[0]).p, f: 3 } });
  assert.equal(d.drive.nodes.find((n) => n.id === b[0]).p.f, 3);
  d = G.insert(d, 'A', 0, 'abs');
  assert.deepEqual(d.drive.bind.map((q) => q.to), ['A2.s']);
  assert.equal(d.drive.sub[0].uses.length, 2);
  assert.deepEqual(normalize(parse(format(d))).drive, d.drive);
});

test('the shelf: a kept subgraph comes in as a subgraph of its own, its numbers with it', async () => {
  const SE = await import('../core/shade-edit.js'), DE = await import('../core/drive-edit.js');
  const f = G.expose(wrapped(), 'A2', 's'), def = JSON.parse(JSON.stringify(G.defOf(f, 'A1')));
  assert.equal(def.nodes.length, 2);
  const g = G.placeDef(parse('bulb 8 · +c ×6'), def, 'A', 1);
  assert.deepEqual(g.sub, [{ id: 'a', n: 2, uses: ['A1'], expose: ['1.s'] }]);
  assert.deepEqual(ops(g), ['bulb', 'fold.sphere', 'scale', '+c']);
  assert.ok(validate(g).ok, validate(g).errors.join());
  const h = G.placeDef(f, def, 'A', 0);
  assert.deepEqual(h.sub.map((s) => [s.id, s.uses]), [['b', ['A0']], ['a', ['A3', 'A6']]].map(([i, u]) => [i === 'b' ? 'b' : 'a', u]));
  assert.ok(validate(h).ok);
  // the networks: outside links are gone, required inputs fed
  let s = SE.shadeOn(parse('bulb 8 · +c ×6'));
  const before = normalize(s).shade.nodes.length;
  s = SE.addRun(s, [{ id: 'm', type: 'math', in: { a: 'zz' }, p: { op: 'mul', c: 3 } }, { id: 'r', type: 'math', in: { a: 'm' }, p: { op: 'add', c: 1 } }], ['0.c']);
  assert.equal(s.shade.nodes.length, before + 2);
  assert.ok(validate(s).ok, validate(s).errors.join());
  assert.equal(s.shade.sub[0].uses[0].length, 2);
  let d = DE.addRun(parse('bulb 8 ×6'), [{ id: 'x', type: 'remap', in: { a: 'q' }, p: { lo: 0, hi: 2, clamp: true } }]);
  assert.ok(validate(d).ok, validate(d).errors.join());
  assert.equal(d.drive.nodes[0].type, 'i');
});
