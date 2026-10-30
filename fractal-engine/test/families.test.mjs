// The Kleinian families and the Mandalay fold: the ops' forward, Jacobian and inverse; the seed estimate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, format, normalize, validate, de, iterate, push, stepInverse, stepForward, opJacobian, getOp, makeRng, pullSafe, hasPower } from '../core/index.js';
import { seedOf, spawnRadius } from '../core/formula.js';
import { mandalayFwd, kleinLine } from '../core/ops.js';
import { FAMILIES, FAMILIES_INV, PK, APOLLONIAN, KLEINIAN, MANDALAY } from './family-cases.js';

const fp = (k, n) => { const r = makeRng(n); return Array.from({ length: k }, () => [0, 1, 2, 3].map((i) => (i < 3 ? r.float() * 6 - 3 : 0))); };
const dist = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));

test('notation: the new ops round-trip and validate', () => {
  for (const [text] of FAMILIES) {
    const f = normalize(parse(text));
    assert.deepEqual(validate(f).errors, [], text);
    assert.equal(format(normalize(parse(format(f)))), format(f));
    assert.ok(pullSafe(f));
  }
});

test('fold.cell is fold.box with equal limits, and each limit is its own axis', () => {
  const a = normalize(parse('fold.cell .7 .7 .7 .7 ×1')), b = normalize(parse('fold.box .7 ×1'));
  for (const q of fp(200, 3)) {
    const s = { p: [...q], c: q, dr: 1 }, t = { p: [...q], c: q, dr: 1 };
    stepForward(s, a.slots[0]); stepForward(t, b.slots[0]);
    assert.deepEqual(s.p, t.p);
  }
  const s = { p: [2, 2, 2, 0], c: [0, 0, 0, 0], dr: 1 };
  stepForward(s, normalize(parse('fold.cell .5 1 1.5 ×1')).slots[0]);
  assert.deepEqual(s.p, [-1, 0, 1, 0]);
});

test('fold.sphere with rmin 0 is max(rfix²/|p|², 1) with no scaling floor', () => {
  const f = normalize(parse('fold.sphere 0 1 ×1'));
  for (const r of [1e-3, 0.1, 0.5, 2]) {
    const s = { p: [r, 0, 0, 0], c: [0, 0, 0, 0], dr: 1 };
    stepForward(s, f.slots[0]);
    const k = Math.max(1 / (r * r), 1);
    assert.ok(Math.abs(s.p[0] / (r * k) - 1) < 1e-12 && Math.abs(s.dr / k - 1) < 1e-12);
  }
});

test('wrap: into the cell, identity inside it, an axis of limit 0 untouched', () => {
  const f = normalize(parse('wrap 1 .5 0 ×1'));
  for (const q of fp(300, 5)) {
    const s = { p: [...q], c: [0, 0, 0, 0], dr: 1 };
    stepForward(s, f.slots[0]);
    assert.ok(s.p[0] >= -1 && s.p[0] < 1 && s.p[1] >= -0.5 && s.p[1] < 0.5);
    assert.equal(s.p[2], q[2]);
    assert.ok(Math.abs(Math.round((s.p[0] - q[0]) / 2) * 2 - (s.p[0] - q[0])) < 1e-12);
  }
});

test('the Mandalay fold matches its source, written out axis by axis', () => {
  // the fold of Mandelbulber's transf_mandalay_fold_v1 written out as there, for one octant's order
  const ref = (q, fo, g) => {
    const z = q.map(Math.abs), sg = q.map((x) => (x < 0 ? -1 : 1)), o = [...z];
    let [px, py, pz] = z;
    if (pz > py) [py, pz] = [pz, py];
    let t1 = px - 2 * fo, t2 = py - 4 * fo;
    o[0] = Math.min(Math.min(Math.max(Math.abs(t1 + fo) - fo, t2), Math.max(t1 - g, py)), px);
    [px, py, pz] = z;
    if (px > pz) [pz, px] = [px, pz];
    t1 = py - 2 * fo; t2 = pz - 4 * fo;
    o[1] = Math.min(Math.min(Math.max(Math.abs(t1 + fo) - fo, t2), Math.max(t1 - g, pz)), py);
    [px, py, pz] = z;
    if (py > px) [px, py] = [py, px];
    t1 = pz - 2 * fo; t2 = px - 4 * fo;
    o[2] = Math.min(Math.min(Math.max(Math.abs(t1 + fo) - fo, t2), Math.max(t1 - g, px)), pz);
    return o.map((x, i) => x * sg[i]);
  };
  for (const q of fp(2000, 9)) assert.ok(dist(mandalayFwd(q, { fo: 0.5, g: 0.1 }).slice(0, 3), ref(q.slice(0, 3), 0.5, 0.1)) < 1e-12);
});

test('analytic Jacobians agree with differences', () => {
  for (const text of ['fold.cell .9 .8 1.1 ×1', 'wrap 1 .5 2 ×1', 'seed.slab 1 2 3 .5 ×1', 'seed.pillar .2 ×1']) {
    const o = normalize(parse(text)).slots[0][0], rc = [0, 0, 0, 0];
    for (const q of fp(100, 11)) {
      const A = opJacobian(o, q, rc), N = opJacobian(o, q, rc, true);
      if (A.every((x, i) => Math.abs(x - N[i]) < 1e-5)) continue;
      // a difference across a fold's or a cell's edge is a jump, not a derivative
      const near = q.some((x) => Math.abs(Math.abs(x) - 0.9) < 1e-4);
      assert.ok(near || !A.every(Number.isFinite), `${text} at ${q}`);
    }
  }
});

test('every preimage maps back; a chaos walk finds them; walks of a seeded formula start outside', () => {
  for (const [text, R] of FAMILIES_INV) {
    const f = normalize(parse(text)), rng = makeRng(3);
    let found = 0;
    for (let i = 0; i < 600; i++) {
      const start = [0, 1, 2].map(() => (rng.float() * 2 - 1) * R).concat(0);
      const s = { p: [...start], c: [0, 0, 0, 0], dr: 1 };
      stepForward(s, f.slots[0]);
      const q = [...s.p], b = { p: [...q], c: [0, 0, 0, 0], dr: 1 };
      const x = stepInverse(b, f.slots[0], rng, 8);
      if (!x) continue;
      found++;
      const t = { p: [...x], c: [0, 0, 0, 0], dr: 1 };
      stepForward(t, f.slots[0]);
      assert.ok(dist(t.p, q) < 1e-6 * (1 + Math.hypot(...q)), `${text}: ${x} → ${t.p}, wanted ${q}`);
    }
    assert.ok(found > 150, `${text}: ${found}`);
  }
  assert.equal(spawnRadius(normalize(parse(PK))), 3);
  assert.equal(spawnRadius(normalize(parse('bulb 8 · +c ×10'))), 1);
});

test('push lands on the set: the estimate at its samples is tiny', () => {
  for (const [text, tol] of [[PK.replace('×10', '×24'), 1e-3], [APOLLONIAN.replace('×8', '×24'), 1e-3], [KLEINIAN, 1e-3]]) {
    const f = normalize(parse(text)), S = push(f, 400, { jacobians: false, c: [0, 0, 0, 0] });
    assert.ok(S.length === 400, `${text}: ${S.length} samples`);
    const ds = S.map((s) => de(f, s.p)).sort((a, b) => a - b);
    assert.ok(ds[200] < tol, `${text}: median ${ds[200]}`);
  }
});

test('the seed: r/dr would fill space, the seed measures; escaped orbits keep r/dr', () => {
  const f = normalize(parse(PK));
  assert.ok(seedOf(f) && !hasPower(f));
  const p = [0.4, 0.3, 0.2], o = iterate(f, p);
  assert.ok(!o.escaped);
  const q = o.points[o.points.length - 1];
  assert.ok(Math.abs(de(f, p) - (0.5 * Math.abs(q[2])) / o.dr) < 1e-12);
  // t is Knighty's DEoffset, k the factor
  const g = normalize(parse('fold.cell .92 .91 .92 · fold.sphere 0 1 · seed.slab 0 0 1 0 .01 .25 ×10 bail=100'));
  assert.ok(Math.abs(de(g, p) - Math.abs((0.25 * Math.abs(q[2])) / o.dr - 0.01)) < 1e-12);
  // a formula far outside its bail
  const h = normalize(parse('fold.cell 1 1 1 · seed.sphere ×3 bail=4'));
  const O = iterate(h, [50, 0, 0]);
  assert.ok(O.escaped);
  assert.ok(Math.abs(de(h, [50, 0, 0]) - O.r / O.dr) < 1e-12);
});

test('a driven seed reads its driven value', () => {
  const [text] = FAMILIES.find(([t]) => t.startsWith('fold.cell') && t.includes('drive='));
  const f = normalize(parse(text)), p = [0.3, 0.2, 0.4];
  const o = iterate(f, p);
  assert.notEqual(o.seedP, seedOf(f).p);
  assert.ok(Math.abs(o.seedP.d) > 0);
  const q = o.points[o.points.length - 1];
  assert.ok(Math.abs(de(f, p) - (0.5 * Math.abs(q[2] - o.seedP.d)) / o.dr) < 1e-12);
});

test('the Kleinian: the separation line is in the cell; the op and its own seed', () => {
  const P = { a: 1.95, b: 0.02, bx: 1, bz: 1 };
  assert.ok(Math.abs(kleinLine(-0.01, P) - 0.975) < 1e-12);
  const f = normalize(parse(KLEINIAN));
  assert.equal(seedOf(f).op, 'kleinian');
  assert.ok(getOp('kleinian').seed([0, 0.1, 0, 0], 5, P).v === 0.1);
  assert.equal(getOp('kleinian').seed([0, 1, 0, 0], 1, P).dr, 2);
  assert.ok(de(f, [0.2, 0.7, 0.1]) > 0);
});

test('Mandalay is the box family: r/dr, no seed, pull-safe', () => {
  const f = normalize(parse(MANDALAY));
  assert.ok(!seedOf(f) && !hasPower(f));
  const o = iterate(f, [1, 2, 3], [1, 2, 3, 0]);
  assert.ok(Math.abs(de(f, [1, 2, 3]) - o.r / o.dr) < 1e-12);
});

test('the kaliset as a shading node: its map, a validated node, the picker', async () => {
  const S = await import('../core/shade.js'), E = await import('../core/shade-edit.js');
  const P = { cx: 0.8, cy: 0.7, cz: 0.6, f: 2, n: 3, mode: 'mean' };
  // by hand
  let p = [0.2, -0.4, 0.6], last = Math.hypot(...p), sum = 0;
  for (let i = 0; i < 3; i++) { const r2 = p[0] ** 2 + p[1] ** 2 + p[2] ** 2; p = [Math.abs(p[0]) / r2 - 0.8, Math.abs(p[1]) / r2 - 0.7, Math.abs(p[2]) / r2 - 0.6]; const l = Math.hypot(...p); sum += Math.abs(l - last); last = l; }
  assert.ok(Math.abs(S.kaliAt(P, [0.1, -0.2, 0.3]) - sum / 3) < 1e-12);
  const shade = { nodes: [{ id: 'k', type: 'kali', p: { n: 8 } }, { id: 'r', type: 'ramp', in: { v: 'k' }, p: S.rampPreset('mono') }], out: { color: 'r' } };
  assert.deepEqual(S.validateShade(S.normShade(shade)), []);
  assert.deepEqual(S.validateShade(S.normShade({ ...shade, nodes: [{ id: 'k', type: 'kali', p: { n: 99 } }, shade.nodes[1]] })).length, 1);
  const a = S.evalShade(shade, { x: [0.3, 0.1, 0.2] }).color, b = S.evalShade(shade, { x: [0.31, 0.1, 0.2] }).color;
  assert.notDeepEqual(a, b);
  const f = E.shadeOn(parse('bulb 8 · +c ×6'));
  const g = E.addNode(f, 'kali');
  assert.ok(g.shade.nodes.some((n) => n.type === 'kali'));
  assert.equal(format(normalize(parse(format(normalize(g))))), format(normalize(g)));
});
