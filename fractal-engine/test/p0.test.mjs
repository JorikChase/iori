// P0: notation ↔ JSON, the op library's Jacobians and inverses, the CPU reference backend.
// Run: node --test fractal-engine/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPS, getOp, parse, format, normalize, validate, hash, pullSafe, toURLHash, fromURLHash,
  iterate, de, jacobian, opJacobian, lyapunov, push, makeRng, deGrad, deParam, lyapunovOrbit,
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
    assert.ok(['unchanged', 'mul', 'plus', 'none'].includes(o.wRule), o.name);
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

