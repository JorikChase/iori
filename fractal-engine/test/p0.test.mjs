// P0: notation ↔ JSON, the op library's Jacobians and inverses, the CPU reference backend.
// Run: node --test fractal-engine/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPS, getOp, parse, format, normalize, validate, hash, pullSafe, toURLHash, fromURLHash, weights, orbitWeights,
  iterate, de, jacobian, opJacobian, lyapunov, push, makeRng, deGrad, deParam, lyapunovOrbit,
  stepInverse, slotAt,
} from '../core/index.js';

const MANDELBROT = 'power 2 · +c ×200';
const MANDELBOX = 'fold.box 1 · fold.sphere .5 1 · scale 2 · +c ×12 bail=64';
// Sierpiński tetrahedron: three plane folds, then p → 2p − (1,1,1)
const SIERPINSKI = 'fold.plane 1 1 0 · fold.plane 1 0 1 · fold.plane 0 1 1 · scale 2 · + -1 -1 -1 ×16 bail=16';
const HYBRID = 'abs · sort · scale 3 · + -2 -2 0 | bulb 8 · +c ×9 AAB seed=7';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
const matNear = (A, B, eps = 1e-4) => A.every((x, i) => near(x, B[i], eps));

test('notation round-trips through JSON', () => {
  for (const text of [MANDELBROT, MANDELBOX, SIERPINSKI, HYBRID, 'rotate 10 20 30 · twist 45 · invert ×3']) {
    const f = parse(text);
    assert.ok(validate(f).ok, validate(f).errors.join('; '));
    const again = parse(format(f));
    assert.deepEqual(normalize(again), normalize(f));
    assert.equal(format(again), format(f));
    assert.equal(hash(again), hash(f));
  }
});

test('notation details: aliases, keyed values, separators, trailing defaults', () => {
  const f = parse('+ 1 2 3; fold.sphere rfix=2\nscale 2 x5 seed=3');
  assert.equal(f.slots[0][0].op, 'translate');
  assert.deepEqual(f.slots[0][1].p, { rmin: 0.5, rfix: 2 });
  assert.equal(f.iters, 5);
  assert.equal(f.seed, 3);
  assert.equal(format(f), 'translate 1 2 3 · fold.sphere .5 2 · scale ×5 seed=3');
  assert.equal(format(parse(HYBRID)), 'abs · sort · scale 3 · translate -2 -2 | bulb · +c ×9 AAB seed=7');
  assert.throws(() => parse('fold.box 1 2'), /too many values/);
  assert.throws(() => parse('nope 1'), /unknown op/);
  assert.throws(() => parse('scale 2 | ×3'), /empty slot/);
});

test('a fixed c makes a Julia set, in the notation and in the orbit', () => {
  const f = parse('power 2 · +c ×100 c=-.75,.1,0');
  assert.deepEqual(f.c, [-0.75, 0.1, 0, 0]);
  assert.equal(format(f), 'power · +c ×100 c=-.75,.1,0');
  assert.ok(validate(f).ok);
  assert.notEqual(hash(f), hash(parse('power 2 · +c ×100')));
  // z0 = 0 under the Julia set of c = −0.75+0.1i escapes (c is outside the Mandelbrot set) …
  assert.equal(iterate(f, [0, 0, 0], f.c).escaped, true);
  // … and de() reads c from the formula instead of using the point
  assert.ok(de(f, [0, 0, 0]) > 0);
  assert.equal(de(parse('power 2 · +c ×100'), [0, 0, 0]), 0);
  assert.ok(validate({ ...normalize(f), c: [1, 2] }).errors.some((e) => e.includes('c must')));
});

test('URL hash carries the formula', () => {
  const f = parse(MANDELBOX);
  assert.deepEqual(normalize(fromURLHash(toURLHash(f))), normalize(f));
});

test('validate finds every problem', () => {
  const bad = { v: 1, seed: 1.5, iters: 0, bail: -1, schedule: 'AC', slots: [[{ op: 'scale', p: { s: 999, zz: 1 } }], []] };
  const { ok, errors } = validate(bad);
  assert.equal(ok, false);
  for (const needle of ['seed', 'iters', 'bail', 'above', 'no parameter zz', 'slot 1 is empty', 'slot C']) {
    assert.ok(errors.some((e) => e.includes(needle)), `missing error about ${needle}: ${errors}`);
  }
  assert.ok(validate(normalize(parse(MANDELBOX))).ok);
});

test('every op has params with defaults, a glyph, a wRule, and inv is a function or null', () => {
  for (const o of Object.values(OPS)) {
    assert.ok(o.glyph, o.name);
    assert.ok(['unchanged', 'mul', 'plus', 'none', 'mix'].includes(o.wRule), o.name);
    assert.ok(o.params.every((q) => typeof q.d === 'number'), o.name);
    assert.ok(o.inv === null || typeof o.inv === 'function', o.name);
    assert.equal(getOp(o.name), o);
  }
  assert.equal(pullSafe(parse(MANDELBOX)), true);
  assert.equal(pullSafe(parse('swirl · scale .5 ×4')), false);
});

test('Mandelbrot escape times', () => {
  const f = parse(MANDELBROT);
  const z0 = [0, 0, 0];
  assert.equal(iterate(f, z0, [0, 0, 0]).escaped, false);
  assert.equal(iterate(f, z0, [-1, 0, 0]).escaped, false); // period-2 bulb centre
  assert.equal(iterate(f, z0, [-0.75, 0.1, 0]).escaped, true);
  const far = iterate(f, z0, [2, 0, 0]);
  assert.equal(far.escaped, true);
  assert.ok(far.n <= 3);
  // the distance estimate is positive outside and shrinks toward the set
  const d1 = de(f, z0, [0.6, 0.6, 0]), d2 = de(f, z0, [1.2, 1.2, 0]);
  assert.ok(d1 > 0 && d2 > d1, `${d1} ${d2}`);
  assert.equal(de(f, z0, [0, 0, 0]), 0);
});

test('Mandelbox: the origin is inside, far points are outside with a finite estimate', () => {
  const f = parse(MANDELBOX);
  assert.equal(iterate(f, [0, 0, 0], [0, 0, 0]).escaped, false);
  assert.equal(de(f, [0, 0, 0]), 0);
  const far = de(f, [10, 0, 0]);
  assert.ok(far > 0 && far < 10, `de at 10 = ${far}`);
  const farther = de(f, [20, 0, 0]);
  assert.ok(farther > far);
});

test('Sierpiński tetrahedron: vertices stay, the centre of a face escapes', () => {
  const f = parse(SIERPINSKI);
  for (const v of [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]]) {
    const o = iterate(f, v);
    assert.equal(o.escaped, false, `vertex ${v}`);
    assert.ok(near(o.r, Math.sqrt(3)), 'a vertex is a fixed point');
  }
  assert.equal(iterate(f, [0, 0, 0]).escaped, true);
  assert.equal(iterate(f, [5, 5, 5]).escaped, true);
  assert.ok(de(f, [5, 5, 5]) > 0);
});

test('every op reaches the GPU: an opcode for each (a missing one packs as NaN)', async () => {
  const { OPCODE } = await import('../gpu/pack.js');
  for (const name of Object.keys(OPS)) assert.ok(Number.isInteger(OPCODE[name]), `no opcode for ${name}`);
});

test('analytic Jacobians agree with finite differences', () => {
  const pts = [[0.3, -0.2, 0.7, 0.4], [1.4, 0.2, -0.9, -0.3], [0.05, 0.1, 0.02, 0.07], [-2, 1.5, 0.4, 0.9]];
  for (const o of Object.values(OPS)) {
    if (!o.jac) continue;
    const q = { op: o.name, p: Object.fromEntries(o.params.map((x) => [x.k, x.d])) };
    if (o.name === 'fold.plane') q.p = { nx: 1, ny: 1, nz: 0, d: 0.1, nw: 0.5 };
    if (o.name === 'rotate4') q.p = { xy: 10, xz: -20, xw: 30, yz: 15, yw: -25, zw: 40 };
    if (o.name === 'rotate') q.p = { x: 20, y: -35, z: 60 };
    for (const pt of pts) {
      const analytic = o.jac(pt, q.p);
      const numeric = opJacobian(q, pt, [0, 0, 0, 0], true);
      assert.ok(matNear(analytic, numeric, 1e-4), `${o.name} at ${pt}: ${analytic} vs ${numeric}`);
    }
  }
});

test('inverses are preimages of the forward map, on every branch', () => {
  const rng = makeRng(11);
  const pts = [[0.3, -0.2, 0.7, 0.2], [1.4, 0.2, -0.9, -0.5], [0.6, 0.1, 0.02, 0.3], [-2, 1.5, 0.4, -0.1], [0.2, 0.3, 0.1, 0.05]];
  for (const o of Object.values(OPS)) {
    if (!o.inv) continue;
    const P = Object.fromEntries(o.params.map((x) => [x.k, x.d]));
    if (o.name === 'fold.plane') Object.assign(P, { nx: 1, ny: 1, nz: 0, d: 0, nw: 0.5 });
    if (o.name === 'rotate4') Object.assign(P, { xy: 10, xz: -20, xw: 30, yz: 15, yw: -25, zw: 40 });
    for (const pt of pts) {
      // push pt forward first so we ask for preimages of a point that has some
      const s0 = { p: [...pt], c: [0.1, 0.2, 0.3, -0.2], dr: 1 };
      o.fwd(s0, P);
      const target = s0.p;
      for (let k = 0; k < 12; k++) {
        const pre = o.inv([...target], P, rng, { c: [0.1, 0.2, 0.3, -0.2] });
        if (!pre) continue;
        const s = { p: [...pre], c: [0.1, 0.2, 0.3, -0.2], dr: 1 };
        o.fwd(s, P);
        assert.ok(s.p.every((x, i) => near(x, target[i], 1e-6)), `${o.name}: inv ${pre} → fwd ${s.p} ≠ ${target}`);
      }
    }
  }
});

test('push samples of the Sierpiński formula lie in the set the pull engine keeps', () => {
  const f = parse(SIERPINSKI);
  const samples = push(f, 400, { burn: 32 });
  assert.equal(samples.length, 400);
  let kept = 0;
  for (const s of samples) if (!iterate(f, s.p).escaped) kept++;
  assert.ok(kept / samples.length > 0.97, `${kept}/400 kept`);
  // the inverse of an expanding map contracts: the step's operator norm is below one
  const ks = samples.map((s) => s.k).sort((a, b) => a - b);
  assert.ok(ks[Math.floor(ks.length / 2)] < 1, `median k ${ks[Math.floor(ks.length / 2)]}`);
  // and it is the same stream every time
  const again = push(f, 5, { burn: 32 });
  assert.deepEqual(again.map((s) => s.p), push(f, 5, { burn: 32 }).map((s) => s.p));
});

test('push covers the set evenly instead of collapsing onto a branch', () => {
  // voxel entropy of the samples over their bounding box, 16³ voxels
  const entropy = (pts) => {
    const lo = [0, 1, 2].map((k) => Math.min(...pts.map((q) => q[k]))), hi = [0, 1, 2].map((k) => Math.max(...pts.map((q) => q[k])));
    const h = new Map();
    for (const q of pts) {
      const key = q.map((x, k) => Math.min(15, Math.floor(((x - lo[k]) / (hi[k] - lo[k] + 1e-12)) * 16))).join(',');
      h.set(key, (h.get(key) || 0) + 1);
    }
    let e = 0;
    for (const v of h.values()) { const pr = v / pts.length; e -= pr * Math.log2(pr); }
    return e;
  };
  const tetra = push(parse(SIERPINSKI), 8000, { jacobians: false }).map((s) => s.p);
  assert.equal(tetra.length, 8000);
  // the Sierpiński tetrahedron has dimension 2: at 16³ about 4^(log2 16)=256 voxels, 8 bits if even
  assert.ok(entropy(tetra) > 7, `tetrahedron entropy ${entropy(tetra)}`);
  const menger = push(parse('abs · sort · scale 3 · + -2 -2 0 ×8 bail=50'), 4000, { jacobians: false });
  assert.equal(menger.length, 4000);
  assert.ok(entropy(menger.map((s) => s.p)) > 7.5);
});

test('Lyapunov exponents have the right sign', () => {
  // the tetrahedron map doubles distances: λ = log 2
  const l = lyapunov(parse('fold.plane 1 1 0 · fold.plane 1 0 1 · fold.plane 0 1 1 · scale 2 · + -1 -1 -1 ×16 bail=1e9'), [0.9, 0.95, 1], [0, 0, 0], 12);
  assert.ok(near(l, Math.log(2), 1e-6), `λ = ${l}`);
  assert.ok(near(lyapunov(parse('scale .5 ×4'), [1, 1, 1], [0, 0, 0], 8), Math.log(0.5), 1e-9));
  // the Mandelbrot interior has a bounded, non-chaotic orbit at c = 0
  assert.ok(lyapunov(parse(MANDELBROT), [0.01, 0, 0], [0, 0, 0], 20) < 0);
  // a Jacobian of a whole iteration composes the ops
  const J = jacobian(parse('scale 2 · rotate 0 0 90 ×1'), [1, 0, 0]);
  assert.ok(matNear(J, [0, -2, 0, 0, 2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2], 1e-9), `${J}`);
});

test('references for the GPU duals: gradient, parameter derivative, Lyapunov', () => {
  // the tetrahedron map doubles every tangent: λ = log 2 per iteration, whatever the point
  assert.ok(near(lyapunovOrbit(parse(SIERPINSKI), [0.9, 0.95, 1]), Math.log(2), 1e-9));
  // one step of scale 2 gives DE = |2p| / 2 = |p|: its gradient is the unit outward direction
  const f = parse('scale 2 ×1 bail=1');
  const g = deGrad(f, [3, 0, 0]);
  assert.ok(near(g[0], 1, 1e-6) && Math.abs(g[1]) < 1e-6, `${g}`);
  // DE = |2p|/2 = |p| for one step of scale s: ∂DE/∂s = 0 (|sp|/|s|); with +c it is not
  assert.ok(Math.abs(deParam(f, [3, 0, 0], 0, 's')) < 1e-6);
  assert.ok(Math.abs(deParam(parse(MANDELBOX), [3.1, 0.4, -0.2], 2, 's')) > 1e-3);
});


test('breeding: a neighbour is the asked visual distance away; the archive keeps one elite per cell', async () => {
  const { mutate, distancePx, createArchive, spread } = await import('../core/breed.js');
  const f = parse(MANDELBOX);
  const metric = [{ oi: 0, key: 'l', pxPerUnit: 1600 }, { oi: 1, key: 'rmin', pxPerUnit: 500 }, { oi: 1, key: 'rfix', pxPerUnit: 750 }, { oi: 2, key: 's', pxPerUnit: 290 }];
  const rng = makeRng(4);
  for (const D of [10, 40, 120]) {
    const g = mutate(f, metric, new Set(), D, rng.float);
    assert.ok(Math.abs(distancePx(f, g, metric) - D) < 0.05 * D + 0.01, `D ${D} → ${distancePx(f, g, metric)}`);
  }
  // pinned parameters do not move
  const g = mutate(f, metric, new Set(['0.l', '2.s']), 50, rng.float);
  assert.equal(g.slots.flat()[0].p.l, 1);
  assert.equal(g.slots.flat()[2].p.s, 2);
  const A = createArchive({ bins: 4 });
  A.reset('x', { median: 1, p10: 0.9, p90: 1.1 });
  assert.equal(A.offer({ text: 'a', features: { density: 0.5, chaos: 1, quality: 0.2 } }), true);
  assert.equal(A.offer({ text: 'b', features: { density: 0.52, chaos: 1.01, quality: 0.1 } }), false);
  assert.equal(A.offer({ text: 'c', features: { density: 0.53, chaos: 1.02, quality: 0.3 } }), true);
  assert.equal(A.offer({ text: 'd', features: { density: 0.9, chaos: 1.5, quality: 0.1 } }), true);
  assert.equal(A.size, 2);
  const picks = spread(A.elites(), { density: 0.5, chaos: 1 }, 1);
  assert.equal(picks[0].text, 'd');
});

test('exports: surface nets of a sphere, STL size, splat covariance round trip', async () => {
  const { surfaceNets, toStl, eigenSym3, splatsToPly } = await import('../core/export.js');
  // a sphere of radius 0.8 on a 24³ grid over [-1, 1]³
  const n = 24, lo = [-1, -1, -1], step = [2 / (n - 1), 2 / (n - 1), 2 / (n - 1)];
  const field = new Float32Array(n * n * n);
  for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    field[x + n * (y + n * z)] = Math.hypot(lo[0] + x * step[0], lo[1] + y * step[1], lo[2] + z * step[2]) - 0.8;
  }
  const m = surfaceNets(field, n, lo, step);
  assert.ok(m.indices.length > 0 && m.indices.length % 3 === 0);
  // every vertex sits near the sphere
  for (let i = 0; i < m.positions.length; i += 3) {
    const r = Math.hypot(m.positions[i], m.positions[i + 1], m.positions[i + 2]);
    assert.ok(Math.abs(r - 0.8) < step[0], `vertex at r ${r}`);
  }
  // closed: every edge is shared by exactly two triangles
  const edges = new Map();
  for (let t = 0; t < m.indices.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = m.indices[t + k], b = m.indices[t + ((k + 1) % 3)];
    const key = a < b ? a + ',' + b : b + ',' + a;
    edges.set(key, (edges.get(key) || 0) + 1);
  }
  assert.ok([...edges.values()].every((c) => c === 2), 'watertight');
  assert.equal(toStl(m).byteLength, 84 + (m.indices.length / 3) * 50);
  // eigen: values and vectors reproduce the matrix
  const A = [2, 0.3, 0.1, 0.3, 1, -0.2, 0.1, -0.2, 0.5];
  const { values, vectors: V } = eigenSym3(A);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let s = 0;
    for (let k = 0; k < 3; k++) s += V[i][k] * values[k] * V[j][k];
    assert.ok(near(s, A[i * 3 + j], 1e-9), `A[${i}][${j}]`);
  }
  const ply = splatsToPly([{ p: [0, 0, 0], cov: [1, 0, 0, 1, 0, 1], rgb: [0.5, 0.5, 0.5] }]);
  assert.ok(new TextDecoder().decode(new Uint8Array(ply, 0, 200)).startsWith('ply\nformat binary_little_endian'));
});

test('4-D: the slice embeds the world, quaternion Julia sets, and 3-D formulas unchanged on the default slice', () => {
  // default slice: a 3-D point is itself with w = 0
  const f = parse(MANDELBOX);
  assert.deepEqual(iterate(f, [3.1, 0.4, -0.2]).points[0], [3.1, 0.4, -0.2, 0]);
  // a tilted slice in the xw plane by 90° sends the world's x axis to w
  const g = parse('scale 2 ×1 bail=100 slice=0,90,0,0');
  const p0 = iterate(g, [1, 0, 0]).points[0];
  assert.ok(Math.abs(p0[0]) < 1e-12 && Math.abs(Math.abs(p0[3]) - 1) < 1e-12, `${p0}`);
  assert.equal(format(g), 'scale ×1 bail=100 slice=0,90,0,0');
  // the quaternion Julia set of c = −1 contains 0 (its orbit 0 → −1 → 0 cycles) and escapes far away
  const q = parse('quat · +c ×64 bail=4 c=-1,0,0,0');
  assert.equal(iterate(q, [0, 0, 0], q.c).escaped, false);
  assert.equal(iterate(q, [2, 0, 0], q.c).escaped, true); // beyond the golden ratio, where the basilica ends
  // q² agrees with complex squaring on the (x, y) plane
  const sq = iterate(parse('quat ×1 bail=100'), [0.3, 0.4, 0, 0]).points[1];
  assert.ok(near(sq[0], 0.09 - 0.16) && near(sq[1], 0.24), `${sq}`);
  // the 4-D bulb with n = 1 is the identity
  const b = iterate(parse('bulb4 1 ×1 bail=100'), [0.3, -0.2, 0.5, 0.4]).points[1];
  assert.ok([0.3, -0.2, 0.5, 0.4].every((v, i) => near(v, b[i], 1e-9)), `${b}`);
});


test('chimera: [A ‖ B] w blends two species inside the iteration', () => {
  const BOX = 'fold.box 1 · fold.sphere .5 1 · scale 2';
  const text = `[${BOX} ‖ bulb 8] axis .3 2 0 1 · +c ×10 bail=8`;
  const f = parse(text);
  assert.ok(validate(f).ok, validate(f).errors.join('; '));
  assert.equal(f.slots.length, 3);
  assert.equal(format(f), '[fold.box · fold.sphere · scale ‖ bulb] axis .3 2 0 1 · +c ×10 bail=8');
  assert.deepEqual(normalize(parse(format(f))), normalize(f));
  assert.equal(format(parse('[abs || scale 3] · +c ×4')), '[abs ‖ scale 3] · +c ×4');
  // a chimera in the second scheduled slot: its sub-stacks still come after both
  const two = parse('abs | [scale 2 ‖ invert] .7 · +c ×6 AB');
  assert.equal(two.slots.length, 4);
  assert.equal(format(parse(format(two))), format(two));
  assert.throws(() => parse('[abs ‖ [scale 2 ‖ abs]]'), /inside another mix/);
  assert.throws(() => parse('[abs] ×3'), /\[ A ‖ B \]/);
  assert.ok(!validate({ ...parse('[abs ‖ scale 2] · +c ×3'), schedule: 'B' }).ok);

  // w = 0 and w = 1 are the pure species
  const pt = [0.4, -0.3, 0.5];
  for (const [w, alone] of [[0, `${BOX} · +c ×10 bail=8`], [1, 'bulb 8 · +c ×10 bail=8']]) {
    const a = iterate(parse(`[${BOX} ‖ bulb 8] ${w} · +c ×10 bail=8`), pt, [0.4, -0.3, 0.5, 0]);
    const b = iterate(parse(alone), pt, [0.4, -0.3, 0.5, 0]);
    assert.equal(a.n, b.n);
    assert.ok(a.points.at(-1).every((x, i) => near(x, b.points.at(-1)[i], 1e-9)), `w=${w}`);
  }

  // the blend's Jacobian, field included, against differences
  const m = normalize(parse(`[${BOX} · rotate4 10 20 0 5 ‖ bulb4 3 · translate .1] sphere .4 1.5 .8 .2 -.1 0 .1 ×1`));
  const mixOp = m.slots[0][0];
  for (const q of [[0.3, -0.2, 0.7, 0.4], [1.2, 0.2, -0.3, -0.3], [0.05, 0.6, 0.2, 0.07]]) {
    const J = opJacobian(mixOp, q, [0, 0, 0, 0]), N = opJacobian(mixOp, q, [0, 0, 0, 0], true);
    assert.ok(matNear(J, N, 1e-4), `mix at ${q}: ${J} vs ${N}`);
  }

  // push finds genuine preimages of the blend (Newton from one species' inverse)
  const pushF = parse('[fold.plane 1 1 0 · fold.plane 1 0 1 · fold.plane 0 1 1 · scale 2 · + -1 -1 -1 ‖ abs · sort · scale 3 · + -2 -2 0] axis .5 .8 ×16 bail=16');
  const pf = normalize(pushF);
  const samples = push(pushF, 400, { burn: 8 });
  assert.equal(samples.length, 400);
  // each sample is a genuine preimage: the forward step from it lands on a point the walk held
  const rng = makeRng(3);
  let checked = 0;
  for (let k = 0; k < 200; k++) {
    const q = samples[k].p;
    const s = { p: [...q], c: [0, 0, 0, 0], dr: 1 };
    const pre = stepInverse(s, slotAt(pf, 0), rng);
    if (!pre) continue;
    const t = iterate(pf, pre, [0, 0, 0, 0], { iters: 1 }).points[1];
    assert.ok(t.every((x, i) => near(x, q[i], 1e-7)), `${pre} → ${t} ≠ ${q}`);
    checked++;
  }
  assert.ok(checked > 20, `only ${checked} preimages found`);
});

test('fields: weights sum to one, their gradients and reading derivatives match differences', () => {
  const ctx = { p0: [0.2, 0.1, -0.3, 0.1], trap: 0.4, i: 3, n: 10, dr: 7 };
  const cases = [
    ['mix.axis', { w: 0.4, g: 1.7, nx: 1, ny: 2, nz: -1, nw: 0.5 }],
    ['mix.sphere', { w: 0.6, g: 3, r: 0.8, cx: 0.1, cy: 0, cz: -0.2, cw: 0.1 }],
    ['mix.noise', { w: 0.5, g: 2, f: 1.3, o: 3, seed: 5 }],
    ['mix.tissue', { n: 7, size: 1.2, soft: 0.15, seed: 3 }],
    ['mix.trap', { w: 0.5, g: 4, t: 0.3 }],
  ];
  for (const k of [2, 3, 5]) for (const [op, P] of cases) {
    for (const x of [[0.3, -0.2, 0.7, 0.4], [1.1, 0.4, -0.5, -0.2], [-0.2, 0.05, 0.3, 0.6]]) {
      const W = weights(op, P, k, x, ctx);
      assert.ok(near(W.w.reduce((a, b) => a + b, 0), 1, 1e-9), `${op} sums to ${W.w}`);
      for (let a = 0; a < 4; a++) {
        const h = 1e-6, xp = [...x], xm = [...x];
        xp[a] += h; xm[a] -= h;
        const wp = weights(op, P, k, xp, ctx).w, wm = weights(op, P, k, xm, ctx).w;
        wp.forEach((v, i) => assert.ok(Math.abs((v - wm[i]) / (2 * h) - W.G[i][a]) < 1e-5 * Math.max(1, Math.abs(W.G[i][a])), `${op} k=${k} ∂ω${i}/∂x${a}`));
      }
      // read at the orbit point: within radius 2 as it is, beyond on the sphere (the chain rule checked)
      const xf = x.map((v) => v * 2.3), WO = orbitWeights(op, P, k, xf, ctx);
      for (let a = 0; a < 4; a++) {
        const h = 1e-6, xp = [...xf], xm = [...xf];
        xp[a] += h; xm[a] -= h;
        const wp = orbitWeights(op, P, k, xp, ctx).w, wm = orbitWeights(op, P, k, xm, ctx).w;
        wp.forEach((v, i) => assert.ok(Math.abs((v - wm[i]) / (2 * h) - WO.G[i][a]) < 1e-5 * Math.max(1, Math.abs(WO.G[i][a])), `${op} beyond R ∂ω${i}/∂x${a}`));
      }
      if (op === 'mix.trap') {
        const h = 1e-6, wp = weights(op, P, k, x, { ...ctx, trap: ctx.trap + h }).w, wm = weights(op, P, k, x, { ...ctx, trap: ctx.trap - h }).w;
        wp.forEach((v, i) => assert.ok(Math.abs((v - wm[i]) / (2 * h) - W.S[i]) < 1e-5, `trap ∂ω${i}/∂trap`));
      }
    }
  }
});

test('tissue: k species, frames, self-fields', () => {
  // three species in Voronoi cells; the notation round-trips and the cells' blend has an honest Jacobian
  const t = parse('[fold.box 1 · scale 2 ‖ abs · sort · scale 3 · + -2 -2 0 ‖ bulb 3] tissue 7 1.2 .2 4 0 · +c ×8 bail=20');
  assert.ok(validate(t).ok, validate(t).errors.join('; '));
  assert.equal(t.slots.length, 4);
  assert.equal(format(parse(format(t))), format(t));
  const mt = normalize(t).slots[0][0];
  for (const q of [[0.3, -0.2, 0.7, 0.4], [1.1, 0.4, -0.5, -0.2]]) {
    const ctx = { p0: q, trap: 0.5, i: 0, n: 8 };
    const J = opJacobian(mt, q, [0, 0, 0, 0], false, ctx), N = opJacobian(mt, q, [0, 0, 0, 0], true, ctx);
    assert.ok(matNear(J, N, 1e-4), `tissue at ${q}`);
  }
  // eight slots: seven species and the scheduled one
  const seven = parse('[abs ‖ scale 2 ‖ bulb ‖ quat ‖ invert ‖ sort ‖ bulb4] tissue · +c ×4');
  assert.equal(seven.slots.length, 8);
  assert.ok(validate(seven).ok);
  assert.throws(() => parse('[abs ‖ scale 2 ‖ bulb ‖ quat ‖ invert ‖ sort ‖ bulb4 ‖ abs] ×4'), /seven/);

  // world frame: far along the axis the start point decides, and the whole orbit runs one species
  const world = (x) => iterate(parse('[scale 2 ‖ scale 3] axis .5 40 1 0 0 0 1 ×3 bail=100'), x).points.at(-1);
  assert.ok(near(world([1, 0, 0])[0], 27, 1e-9) && near(world([-1, 0, 0])[0], -8, 1e-9));
  // …while the orbit frame reads each iterate: the first step at x = .1 is a blend
  const orbit = iterate(parse('[scale 2 ‖ scale 3] axis .5 4 1 0 0 0 ×1'), [0.1, 0, 0]).points[1][0];
  const wB = 1 / (1 + Math.exp(-0.4));
  assert.ok(near(orbit, 0.1 * (2 * (1 - wB) + 3 * wB), 1e-12));

  // depth: a sharp switch is a schedule
  const d = iterate(parse('[scale 2 · translate .1 ‖ translate 1 · abs] depth .5 100 ×5'), [0.3, -0.2, 0.1]).points.at(-1);
  const sch = iterate(parse('scale 2 · translate .1 | translate 1 · abs ×5 AAABB'), [0.3, -0.2, 0.1]).points.at(-1);
  assert.ok(d.every((x, i) => near(x, sch[i], 1e-3)), `${d} vs ${sch}`);

  // push through a three-species tissue in the orbit frame: genuine preimages
  const pf = normalize(parse('[fold.plane 1 1 0 · fold.plane 1 0 1 · fold.plane 0 1 1 · scale 2 · + -1 -1 -1 ‖ abs · sort · scale 3 · + -2 -2 0 ‖ fold.box 1 · scale 2] tissue 6 1.5 .3 1 0 ×16 bail=16'));
  const samples = push(pf, 200, { burn: 6 });
  assert.equal(samples.length, 200);
  const rng = makeRng(9);
  let checked = 0;
  for (const sm of samples.slice(0, 100)) {
    const pre = stepInverse({ p: [...sm.p], c: [0, 0, 0, 0], dr: 1 }, slotAt(pf, 0), rng);
    if (!pre) continue;
    const back = iterate(pf, pre, [0, 0, 0, 0], { iters: 1 }).points[1];
    assert.ok(back.every((x, i) => near(x, sm.p[i], 1e-7)), `${pre} → ${back} ≠ ${sm.p}`);
    checked++;
  }
  assert.ok(checked > 10, `only ${checked} preimages found`);
});

test('presets: every family parses, is pull-safe, single-slot, and names real breeding axes', async () => {
  const { PRESETS } = await import('../core/presets.js');
  assert.ok(PRESETS.length >= 10);
  for (const P of PRESETS) {
    const f = normalize(parse(P.text));
    assert.ok(validate(f).ok, P.id);
    assert.ok(pullSafe(f), P.id);
    assert.equal(f.slots.length, 1, P.id);
    for (const [oi, key] of P.axes) assert.ok(f.slots[0][oi] && key in f.slots[0][oi].p, `${P.id} axis ${oi}.${key}`);
    // something is there: the estimate at the camera is positive and less than the distance to the origin
    const d = de(f, [0, 0, -P.view]);
    assert.ok(d > 0 && d <= P.view + 1e-9, `${P.id} de ${d}`);
  }
});

test('Metasurface: a site is its family, a cell breeds, a wall blends, strokes lay species in space', async () => {
  const M = await import('../core/metasurface.js');
  const S = M.createSurface();
  const same = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
  // at a site: the preset itself
  for (const s of S.sites) assert.ok(same(M.formulaAt(S, s.at).f, s.f), s.id);
  // inside a cell: the structure stays, the axis parameter sweeps
  const box = S.sites.find((s) => s.id === 'mandelbox');
  const right = M.formulaAt(S, [box.at[0] + box.R * 0.5, box.at[1]]).f;
  assert.equal(right.slots.length, 1);
  assert.ok(near(right.slots[0][2].p.s, 2.5 + 0.6 * 0.5, 1e-6), `scale ${right.slots[0][2].p.s}`);
  // across a wall between different structures: a chimera of constant weights, valid and even at the bisector
  const bulb = S.sites.find((s) => s.id === 'mandelbulb'), sier = S.sites.find((s) => s.id === 'sierpinski');
  const mid = [(bulb.at[0] + sier.at[0]) / 2, (bulb.at[1] + sier.at[1]) / 2];
  const m = M.formulaAt(S, mid);
  assert.ok(validate(m.f).ok, validate(m.f).errors.join('; '));
  assert.equal(m.f.slots[0][0].op, 'mix.blend');
  assert.ok(m.species.length >= 2);
  // continuity: the estimate at a point moves little for a small step across the wall
  const p = [0.3, 0.2, -0.4];
  let prev = null;
  for (let t = -0.06; t <= 0.06; t += 0.004) {
    const x = [mid[0] + t * (sier.at[0] - bulb.at[0]), mid[1] + t * (sier.at[1] - bulb.at[1])];
    const d = de(M.formulaAt(S, x).f, p);
    if (prev !== null) assert.ok(Math.abs(d - prev) < 0.08, `jump ${prev} → ${d} at ${t}`);
    prev = d;
  }
  // the cells tile the square
  const area = (poly) => Math.abs(poly.reduce((a, q, i) => { const r = poly[(i + 1) % poly.length]; return a + q[0] * r[1] - r[0] * q[1]; }, 0)) / 2;
  assert.ok(near(M.cells(S).reduce((a, c) => a + area(c), 0), 4, 1e-9));
  // a stroke from the bulb to the Sierpiński cell laid along x: species in order, a world-frame ramp
  const sf = M.strokeField(S, [bulb.at, mid, sier.at], [1, 0, 0], 4);
  assert.ok(validate(sf.f).ok, validate(sf.f).errors.join('; '));
  assert.equal(sf.f.slots[0][0].op, 'mix.axis');
  assert.equal(sf.f.slots[0][0].p.at, 1);
  const k = sf.f.slots[0][0].p.s;
  assert.ok(k >= 2 && sf.f.slots.length === k + 1);
  assert.equal(sf.f.slots[1].map((o) => o.op).join(), 'bulb,+c');
  assert.equal(sf.f.slots[k].map((o) => o.op).join(), sier.f.slots[0].map((o) => o.op).join());
});

test('graph: the formula as a tree with path ids and typed ports, and every edit', async () => {
  const G = await import('../core/graph.js');
  const texts = [MANDELBOX, HYBRID, 'abs | [scale 2 · abs ‖ invert ‖ bulb] tissue 5 · +c ×6 AB',
    '[fold.box 1 · scale 2 ‖ bulb 8] noise .5 1 · +c ×10 slice=.2,10,0,0 c=.1,.2,.3,.4'];
  for (const text of texts) {
    const f = normalize(parse(text));
    assert.equal(format(G.flatten(G.tree(f))), format(f), text);
    assert.deepEqual(G.flatten(G.tree(f)), f);
  }
  const t = G.tree(parse('abs | [scale 2 · abs ‖ invert ‖ bulb] tissue 5 · +c ×6 AB'));
  assert.deepEqual(t.chains.map((c) => c.id), ['A', 'B']);
  assert.equal(t.chains[1].nodes[0].id, 'B0');
  assert.deepEqual(t.chains[1].nodes[0].species.map((s) => s.id), ['B0.0', 'B0.1', 'B0.2']);
  assert.equal(t.chains[1].nodes[0].species[0].nodes[1].id, 'B0.0.1');
  const pt = G.ports(t.chains[1].nodes[0]);
  assert.ok(pt.some((q) => q.name === 'weight' && q.type === 'field'));
  assert.ok(pt.some((q) => q.name === 'seed' && q.type === 'int'));
  assert.ok(pt.some((q) => q.name === 'out2' && q.type === 'point'));
  assert.ok(!pt.some((q) => q.name === 's'));

  const f0 = parse(MANDELBOX);
  // insert, move, set, remove
  let f = G.insert(f0, 'A', 2, 'rotate');
  assert.equal(format(f), 'fold.box · fold.sphere · rotate · scale · +c ×12 bail=64');
  f = G.move(f, 'A2', 'A', 0);
  assert.equal(format(f), 'rotate · fold.box · fold.sphere · scale · +c ×12 bail=64');
  f = G.setParam(f, 'A0', 'x', 30);
  assert.equal(f.slots[0][0].p.x, 30);
  assert.equal(G.setParam(f, 'A3', 's', 999).slots[0][3].p.s, 64);
  f = G.remove(f, 'A0');
  assert.equal(format(f), format(f0));
  assert.throws(() => G.remove(parse('abs ×3'), 'A0'), /emptied/);
  // fork: nothing changes in the orbit until a species does
  const fk = G.fork(f0, 'A', 2);
  assert.equal(format(fk), 'fold.box · fold.sphere · [scale ‖ scale] · +c ×12 bail=64');
  const p = [0.3, -0.2, 0.5];
  assert.ok(near(de(fk, p), de(f0, p), 1e-12));
  // species edits, the field, unwrap
  let g = G.setParam(fk, 'A2.1.0', 's', 3);
  g = G.addSpecies(g, 'A2');
  assert.equal(G.tree(g).chains[0].nodes[2].species.length, 3);
  g = G.setField(g, 'A2', 'mix.tissue');
  assert.equal(g.slots[0][2].op, 'mix.tissue');
  assert.equal(g.slots[0][2].p.s, 3);
  g = G.remove(g, 'A2.2.0');
  assert.equal(G.tree(g).chains[0].nodes[2].species.length, 2);
  g = G.remove(g, 'A2.1.0');
  assert.equal(format(g), format(f0));
  assert.equal(format(G.unwrap(fk, 'A2', 1)), format(f0));
  assert.throws(() => G.move(parse('abs | [scale 2 ‖ abs] ×3 AB'), 'B0', 'B0.0', 0), /inside a chimera/);
  // bypass: the formula without one node
  assert.equal(format(G.bypass(f0, 'A1')), 'fold.box · scale · +c ×12 bail=64');
  assert.equal(format(G.bypass(fk, 'A2')), format(f0));
  assert.equal(G.bypass(parse('abs ×3'), 'A0'), null);
  assert.equal(G.setIters(f0, 30).iters, 30);
});

test('state in exported files: PLY header comments and a PNG chunk round-trip, and tampering is refused', async () => {
  const S = await import('../core/state.js');
  const { splatsToPly } = await import('../core/export.js');
  const f = parse('abs | [bulb 8 ‖ quat ‖ fold.box 1 · scale 2] tissue 6 1.5 .1 · +c ×9 AAB bail=40 slice=.2,10,0,0');
  const doc = S.stateDoc({ formula: f, cam: { pos: [0.1, -0.2, -3], yaw: 0.3, pitch: -0.1 }, mode: 'push', look: { hue: 0.2, key: [1, 0.5, 0.8] }, focus: 1.7, pins: [{ x: [0, 0, 0], keys: ['0.l'] }], export: { kind: 'splats', count: 3 }, created: '2026-10-26T00:00:00Z' });
  const comments = S.plyComments(doc);
  assert.ok(comments.every((l) => l.length <= 140 && /^[\x20-\x7e]+$/.test(l)), 'short ASCII lines');
  const samples = [0, 1, 2].map((i) => ({ p: [i, 0, 0], cov: [0.01, 0, 0, 0.01, 0, 0.01], rgb: [0.5, 0.5, 0.5] }));
  const ply = splatsToPly(samples, 0.6, comments);
  const back = S.readPlyState(ply);
  assert.equal(back.id, hash(f));
  assert.equal(format(back.formula), format(f));
  assert.deepEqual(back.cam, doc.cam);
  assert.deepEqual(back.look, doc.look);
  assert.equal(back.mode, 'push');
  // the splats are untouched: the vertex count and the body after the header
  const text = new TextDecoder('latin1').decode(new Uint8Array(ply));
  assert.ok(text.includes('element vertex 3\n'));
  assert.equal(ply.byteLength - (text.indexOf('end_header\n') + 11), 3 * 17 * 4);
  // a file without a state, a flipped character, a formula that is not its id
  assert.equal(S.readPlyState(splatsToPly(samples)), null);
  const bytes = new Uint8Array(ply.slice(0));
  const at = text.indexOf('b64 ') + 10;
  bytes[at] = bytes[at] === 65 ? 66 : 65;
  assert.throws(() => S.readPlyState(bytes.buffer), /checksum|length|JSON|state/);
  const forged = { ...doc, id: '00000000000000' };
  assert.throws(() => S.readPlyState(splatsToPly(samples, 0.6, S.plyComments(forged))), /does not match its id/);
  const broken = { ...doc, formula: { ...doc.formula, iters: -3 } };
  assert.throws(() => S.readPlyState(splatsToPly(samples, 0.6, S.plyComments(broken))), /invalid formula/);
  // PNG: a minimal file, the chunk before IEND
  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
    dv.setUint32(0, data.length); out.set([...type].map((c) => c.charCodeAt(0)), 4); out.set(data, 8);
    return out;
  };
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', new Uint8Array(13)), ...chunk('IEND', new Uint8Array(0))]);
  assert.equal(S.readPngState(png.buffer), null);
  const withState = S.pngWithState(png.buffer, doc);
  assert.equal(S.readPngState(withState.buffer).id, hash(f));
  assert.equal(String.fromCharCode(...withState.subarray(withState.length - 8, withState.length - 4)), 'IEND');
});

test('graph: chains and the schedule — add a copy, remove one, edit the word', async () => {
  const G = await import('../core/graph.js');
  const f0 = parse(MANDELBOX), p = [0.3, -0.2, 0.5];
  const two = G.addChain(f0);
  assert.equal(format(two), 'fold.box · fold.sphere · scale · +c | fold.box · fold.sphere · scale · +c ×12 AB bail=64');
  assert.ok(near(de(two, p), de(f0, p), 1e-12), 'a copied chain leaves the orbit as it was');
  const hy = G.setSchedule(G.setParam(two, 'B2', 's', 3), 'aab');
  assert.equal(hy.schedule, 'AAB');
  assert.throws(() => G.setSchedule(two, 'AC'), /no chain C/);
  assert.throws(() => G.setSchedule(two, ''), /word/);
  // removing chain A: B becomes A, the word follows
  const back = G.removeChain(hy, 'A');
  assert.equal(back.schedule, 'A');
  assert.equal(back.slots[0][2].p.s, 3);
  // deleting the last op of a chain takes the chain while another remains
  const one = G.remove(G.remove(G.remove(G.remove(two, 'B3'), 'B2'), 'B1'), 'B0');
  assert.equal(format(one), format(f0));
  assert.throws(() => G.removeChain(f0, 'A'), /last chain/);
  // chains with chimeras keep their species slots in order
  const ch = G.addChain(parse('abs | [scale 2 ‖ invert] · +c ×6 AB'));
  assert.ok(validate(ch).ok);
  assert.equal(ch.schedule, 'ABC');
  assert.equal(format(G.removeChain(ch, 'B')), 'abs | [scale ‖ invert] · +c ×6 AB');
});

test('shading: the graph in the formula, the notation and the hash; ramps, maps, maths, mixes, presets', async () => {
  const S = await import('../core/shade.js');
  // without shade every formula keeps its id and its text
  for (const t of [MANDELBOX, HYBRID]) assert.equal(format(parse(format(parse(t)))), format(parse(t)));
  const idBefore = hash(parse(MANDELBOX));
  const shade = {
    nodes: [
      { id: 'c', type: 'col' }, { id: 'tr', type: 'trap' },
      { id: 'r1', type: 'ramp', in: { v: 'c' }, p: S.rampPreset('fire') },
      { id: 'r2', type: 'ramp', in: { v: 'tr' }, p: { ...S.rampPreset('ice'), map: { scale: 0.25, offset: 0.5, mode: 'mirror', log: true, invert: false } } },
      { id: 'b', type: 'math', in: { a: 'tr' }, p: { op: 'bands', c: 0.5 } },
      { id: 'm', type: 'mixc', in: { a: 'r1', b: 'r2', f: 'b' }, p: { mode: 'screen' } },
    ],
    out: { color: 'm', glow: 'r1' },
  };
  const f = { ...normalize(parse(MANDELBOX)), shade };
  const g = normalize(f);
  assert.ok(validate(g).ok, validate(g).errors.join('; '));
  assert.notEqual(hash(g), idBefore);
  assert.equal(hash(parse(MANDELBOX)), idBefore);
  const text = format(g);
  assert.match(text, / shade=[A-Za-z0-9_-]+/);
  const back = parse(text);
  assert.deepEqual(normalize(back), g);
  assert.equal(hash(back), hash(g));
  assert.equal(format(back), text);
  // the graph view and the exported state carry it untouched
  const G = await import('../core/graph.js');
  assert.deepEqual(G.flatten(G.tree(g)).shade, g.shade);
  const ST = await import('../core/state.js');
  assert.deepEqual(normalize(ST.stateDoc({ formula: g, cam: { pos: [0, 0, -3], yaw: 0, pitch: 0 } }).formula).shade, g.shade);

  // validation
  const bad = (sh) => validate({ ...normalize(parse(MANDELBOX)), shade: sh }).errors.join('; ');
  assert.match(bad({ nodes: [{ id: 'r', type: 'ramp', in: { v: 'x' }, p: S.rampPreset('fire') }], out: { color: 'r' } }), /not an earlier node/);
  assert.match(bad({ nodes: [{ id: 'c', type: 'col' }], out: { color: 'c' } }), /out.color must name a colour node/);
  assert.match(bad({ nodes: [{ id: 'c', type: 'col' }, { id: 'r', type: 'ramp', in: { v: 'c' }, p: S.rampPreset('fire') }, { id: 'm', type: 'mixc', in: { a: 'r', b: 'c' } }], out: { color: 'm' } }), /wants a colour/);
  assert.match(bad({ nodes: [{ id: 'q', type: 'quux' }], out: {} }), /unknown type/);
  assert.match(bad({ nodes: [{ id: 'c', type: 'col' }, { id: 'r', type: 'ramp', in: { v: 'c' }, p: { stops: [] } }], out: { color: 'r' } }), /1..16 stops/);

  // ramps: each interpolation at known points
  const two = (interp, space = 'rgb') => S.normShade({ nodes: [{ id: 'r', type: 'ramp', in: { v: 'x' }, p: { stops: [{ t: 0, c: [0, 0, 0, 1] }, { t: 1, c: [1, 0.5, 0, 0] }], interp, space } }], out: { color: 'r' } }).nodes[0].p;
  const close = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
  assert.ok(close(S.rampAt(two('linear'), 0.25), [0.25, 0.125, 0, 0.75]));
  assert.ok(close(S.rampAt(two('constant'), 0.75), [0, 0, 0, 1]));
  assert.ok(close(S.rampAt(two('ease'), 0.25), [0.15625, 0.078125, 0, 0.84375]));
  // with two stops the four-point weights fall on the ends: B-spline at 0.5 is ⅙·0 + ⅔·0 … it averages
  const bs = S.rampAt(two('bspline'), 0.5), cr = S.rampAt(two('cardinal'), 0.5);
  assert.ok(Math.abs(bs[0] - 0.5) < 1e-9 && Math.abs(cr[0] - 0.5) < 1e-9);
  // HSV: red to blue the short way round goes through magenta, not green
  const hsv = S.normShade({ nodes: [{ id: 'r', type: 'ramp', in: { v: 'x' }, p: { stops: [{ t: 0, c: [1, 0, 0, 1] }, { t: 1, c: [0, 0, 1, 1] }], interp: 'linear', space: 'hsv' } }], out: { color: 'r' } }).nodes[0].p;
  const mid = S.rampAt(hsv, 0.5);
  assert.ok(mid[0] > 0.9 && mid[2] > 0.9 && mid[1] < 1e-9, `hsv midpoint ${mid}`);
  // Oklab: the midpoint is perceptually half way, which in linear light is far below RGB's 0.5
  const ok = S.rampAt(two('linear', 'oklab'), 0.5);
  assert.ok(ok[0] > 0.05 && ok[0] < 0.3, `oklab midpoint ${ok}`);
  // (the published Oklab matrices are inverses to about 1e-7)
  assert.ok(S.oklab2rgb(S.rgb2oklab([0.2, 0.5, 0.9])).every((x, i) => Math.abs(x - [0.2, 0.5, 0.9][i]) < 1e-5));
  assert.ok(close(S.hsv2rgb(S.rgb2hsv([0.2, 0.5, 0.9])), [0.2, 0.5, 0.9]));
  // mapping
  const M = (o) => ({ scale: 1, offset: 0, mode: 'clamp', log: false, invert: false, ...o });
  assert.equal(S.mapInput(1.7, M()), 1);
  assert.ok(Math.abs(S.mapInput(1.7, M({ mode: 'repeat' })) - 0.7) < 1e-12);
  assert.ok(Math.abs(S.mapInput(1.7, M({ mode: 'mirror' })) - 0.3) < 1e-12);
  assert.equal(S.mapInput(8, M({ log: true, scale: 0.25 })), 0.75);
  assert.equal(S.mapInput(0.2, M({ invert: true })), 0.8);
  // presets and today's look
  for (const name of Object.keys(S.RAMP_PRESETS)) assert.equal(S.validateShade(S.normShade({ nodes: [{ id: 'c', type: 'col' }, { id: 'r', type: 'ramp', in: { v: 'c' }, p: S.rampPreset(name) }], out: { color: 'r' } })).length, 0, name);
  const d = S.defaultShade();
  assert.equal(S.validateShade(d).length, 0);
  const film = (t) => [0, 0.33, 0.67].map((o) => 0.5 + 0.5 * Math.cos(2 * Math.PI * (o + t)));
  const kl = Math.hypot(1, 0.22, 0.55), want = [1, 0.22, 0.55].map((k, i) => k + (film(0.8)[i] * kl - k) * 0.35);
  const got = S.evalShade(d, { col: 0.5 }).color;
  assert.ok(got.slice(0, 3).every((x, i) => Math.abs(x - Math.min(1, Math.max(0, want[i]))) < 0.08), `default ${got} vs ${want}`);
  // a small graph end to end
  const out = S.evalShade(shade, { col: 0.3, trap: 0.7 });
  assert.equal(out.color.length, 4);
  assert.equal(out.glow.length, 3);
  assert.ok(out.color.every((x) => x >= 0 && x <= 1));
  // the program for the GPU: header, a ramp's stops in place
  const prog = S.packShade(shade);
  assert.equal(prog[0], 6);
  assert.equal(prog[1], 5);
  assert.equal(prog[2], 2);
  assert.equal(prog[3], 1);
});

test('shading edits: start, insert on links, connect with types, remove by bypass, stops, ramp options, presets', async () => {
  const E = await import('../core/shade-edit.js');
  const { evalShade } = await import('../core/shade.js');
  const f0 = parse(MANDELBOX);
  assert.throws(() => E.addNode(f0, 'ramp'), /no shading yet/);
  let f = E.shadeOn(f0);
  assert.ok(validate(f).ok);
  assert.equal(format(parse(format(f))), format(f));
  assert.notEqual(hash(f), hash(f0));
  assert.equal(format(E.shadeOff(f)), format(f0));
  const c0 = evalShade(f.shade, { col: 0.3 }).color;
  // a × 1 on the ramp's input changes nothing; a mix of the colour with itself neither
  let g = E.addNode(f, 'math', { node: 'ramp', port: 'v' });
  const m = g.shade.nodes.find((n) => n.type === 'math');
  assert.equal(m.in.a, 'col');
  assert.equal(g.shade.nodes.find((n) => n.id === 'ramp').in.v, m.id);
  assert.ok(evalShade(g.shade, { col: 0.3 }).color.every((x, i) => near(x, c0[i], 1e-9)));
  g = E.addNode(g, 'mixc', { node: 'out', port: 'color' });
  assert.equal(g.shade.out.color, 'mixc0');
  assert.ok(evalShade(g.shade, { col: 0.3 }).color.every((x, i) => near(x, c0[i], 1e-9)));
  // a new ramp on trap, mixed in; types are checked and loops refused
  g = E.addNode(g, 'trap');
  g = E.addNode(g, 'ramp');
  assert.throws(() => E.connect(g, 'trap0', 'mixc0', 'b'), /wants a colour/);
  g = E.connect(g, 'trap0', 'ramp0', 'v');
  g = E.connect(g, 'ramp0', 'mixc0', 'b');
  assert.ok(validate(g).ok, validate(g).errors.join('; '));
  assert.throws(() => E.connect(g, 'mixc0', 'mixc0', 'a'), /loop/);
  assert.throws(() => E.connect(E.connect(g, 'math0', 'mixc0', 'f'), 'mixc0', 'ramp', 'v'), /number|colour/);
  // nodes keep topological order whatever order they were made in
  const ids = g.shade.nodes.map((n) => n.id);
  assert.ok(ids.indexOf('trap0') < ids.indexOf('ramp0') && ids.indexOf('ramp0') < ids.indexOf('mixc0'));
  // remove: the math node is bypassed (the ramp reads col again), the mix takes its own a
  let r = E.removeNode(g, 'math0');
  assert.equal(r.shade.nodes.find((n) => n.id === 'ramp').in.v, 'col');
  r = E.removeNode(r, 'mixc0');
  assert.equal(r.shade.out.color, 'ramp');
  assert.throws(() => E.removeNode(r, 'col'), /unconnected/);
  // optional inputs disconnect, required ones stay
  const withF = E.connect(g, 'trap0', 'mixc0', 'f');
  assert.equal(E.disconnect(withF, 'mixc0', 'f').shade.nodes.find((n) => n.id === 'mixc0').in.f, undefined);
  assert.throws(() => E.disconnect(withF, 'mixc0', 'a'), /stays connected/);
  // stops: add (sampled from the ramp), move past another (sorted again), recolour, remove — on a
  // two-stop ramp (a new one starts as a copy of the surface's: test/colour-presets.test.mjs)
  const g2 = E.setNodeParam(g, 'ramp0', 'stops', [{ t: 0, c: [0, 0, 0, 1] }, { t: 1, c: [1, 1, 1, 1] }]);
  let s = E.addStop(g2, 'ramp0', 0.5);
  let st = s.shade.nodes.find((n) => n.id === 'ramp0').p.stops;
  assert.equal(st.length, 3);
  assert.ok(st[1].c.every((x, i) => near(x, E.rampColourAt(g2.shade.nodes.find((n) => n.id === 'ramp0').p, 0.5)[i], 1e-3)));
  s = E.moveStop(s, 'ramp0', 1, 0.95);
  st = s.shade.nodes.find((n) => n.id === 'ramp0').p.stops;
  assert.equal(E.stopIndex(s, 'ramp0', 0.95), 1);
  s = E.setStopColour(s, 'ramp0', 1, [1, 0, 0, 0.5]);
  assert.deepEqual(s.shade.nodes.find((n) => n.id === 'ramp0').p.stops[1].c, [1, 0, 0, 0.5]);
  s = E.removeStop(s, 'ramp0', 1);
  assert.equal(s.shade.nodes.find((n) => n.id === 'ramp0').p.stops.length, 2);
  // ramp options and presets
  s = E.setRamp(s, 'ramp0', 'interp', 'bspline');
  s = E.setRamp(s, 'ramp0', 'map.mode', 'mirror');
  s = E.setRamp(s, 'ramp0', 'map.log', true);
  const p = s.shade.nodes.find((n) => n.id === 'ramp0').p;
  assert.equal(p.interp, 'bspline'); assert.equal(p.map.mode, 'mirror'); assert.equal(p.map.log, true);
  assert.throws(() => E.setRamp(s, 'ramp0', 'interp', 'wobbly'), /interp/);
  s = E.applyPreset(s, 'ramp0', 'fire');
  assert.equal(s.shade.nodes.find((n) => n.id === 'ramp0').p.stops.length, 5);
  assert.equal(format(parse(format(s))), format(s));
});
