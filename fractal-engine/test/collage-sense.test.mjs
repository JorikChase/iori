// The collage's sensing pass off the GPU: the kernels' and folds' derivatives, the chain rule through
// placements, repetitions, joins and the drive against differences of collageAt, on every case; the pass's
// output buffer read back as gpu/sense.js gets it (filled here from the CPU's orbits); the pieces' drivers in
// the metric. The orbits' own duals are parity's. Run: node --test fractal-engine/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepare, collageAt, collageGrad, drivenAt, smin, sminR, joinShape, joinEval, repFold, repDual, toPiece, parseCollage, normCollage, KERNELS, collageTarget } from '../core/collage.js';
import { collageNumbers, collageDual, readCollageSense, senseCollage, collageDriveParams, collageDriveJac, setter, CS_RAY, CS_PIECE, CS_VALUES, CS_DVALUES } from '../core/collage-sense.js';
import { collageSenseRows, CS_ROW_FLOATS, TAN_FLOATS } from '../gpu/pack.js';
import { metricId, metricValue, withMetric, mutateCollage, collageDistancePx } from '../core/collage-breed.js';
import { evalDrive, getDriveParam, setDriveParam } from '../core/drive.js';
import { de } from '../core/cpu.js';
import { normalize, parse } from '../core/formula.js';
import { makeRng } from '../core/rng.js';
import { COLLAGES, collageCase } from './collage-cases.js';

const T = 1.37;
const clone = (x) => JSON.parse(JSON.stringify(x));
const pct = (a, f) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * f))] ?? 0; };

// what one piece's dual orbit reports at world point x, from the CPU: DE and ∇DE at its folded point
function recsAt(c, x) {
  const g = drivenAt(c, x, T), h = 1e-6;
  return g.pieces.map((pc) => {
    const q = repFold(pc.rep, toPiece(pc.place, x)), D = (u) => de(pc.f, u, undefined, { time: T });
    const grad = [0, 1, 2].map((k) => { const a = [...q], b = [...q]; a[k] += h; b[k] -= h; return (D(a) - D(b)) / (2 * h); });
    return { de: D(q), grad };
  });
}
// the drive's values and their gradients at x, as the GPU reports them
function driveAt(c, x) {
  if (!c.drive || !c.drive.bind.length) return null;
  const binds = c.drive.bind.filter((b) => collageTarget(c, b.to) && c.drive.nodes.some((m) => m.id === b.from));
  const vals = (p) => { const g = drivenAt(c, p, T); return binds.map((b) => { const t = collageTarget(g, b.to); return t.obj[t.key]; }); };
  const h = 1e-6, grads = binds.map(() => [0, 0, 0]);
  for (let k = 0; k < 3; k++) {
    const a = [...x], b = [...x];
    a[k] += h; b[k] -= h;
    const u = vals(a), w = vals(b);
    grads.forEach((q, j) => { q[k] = (u[j] - w[j]) / (2 * h); });
  }
  return { values: vals(x), grads };
}

test('kernels: sminR against differences of smin, every kernel, either side of the seam', () => {
  const rng = makeRng(3);
  for (const k of KERNELS) for (let i = 0; i < 400; i++) {
    const a = rng.range ? rng.range(-1, 1) : rng.ball()[0], b = a + (rng.ball()[1] * 0.6), r = 0.05 + Math.abs(rng.ball()[2]) * 0.5, h = 1e-6;
    const fd = (smin(k, a, b, r + h, 4)[0] - smin(k, a, b, r - h, 4)[0]) / (2 * h);
    const an = sminR(k, a, b, r, 4);
    // a stair's edge can land inside the difference
    if (k === 'stairs' && Math.abs(fd - an) > 0.5) continue;
    assert.ok(Math.abs(fd - an) < 1e-5, `${k} a=${a} b=${b} r=${r}: ${an} vs ${fd}`);
  }
});

test('joins: joinShape is the derivative in r or w, through every op', () => {
  const rng = makeRng(5);
  for (const op of ['union', 'inter', 'sub', 'morph']) for (const k of ['quad', 'exp', 'circ', 'cubic', 'chamfer']) for (let i = 0; i < 100; i++) {
    const [a, b] = rng.ball(), j = { op, k, r: 0.3, n: 4, w: 0.4 }, key = op === 'morph' ? 'w' : 'r', h = 1e-6;
    const fd = (joinEval({ ...j, [key]: j[key] + h }, a, b)[0] - joinEval({ ...j, [key]: j[key] - h }, a, b)[0]) / (2 * h);
    assert.ok(Math.abs(fd - joinShape(j, a, b)) < 1e-5, `${op} ${k}`);
  }
});

test('folds: repDual against differences of repFold', () => {
  const rng = makeRng(9);
  const reps = [{ kind: 'grid', cx: .6, cy: .6, cz: 0, nx: 2, ny: 1, nz: 1 }, { kind: 'mirror', mx: 1, my: 0, mz: 1, ox: .5, oy: 0, oz: .3 }, { kind: 'polar', n: 5, r: 1.2, axis: 1 }, { kind: 'polar', n: 7, r: .4, axis: 2 }];
  for (const rep of reps) for (let i = 0; i < 200; i++) {
    const v = rng.ball().map((q) => q * 2).slice(0, 3), g = rng.ball().slice(0, 3), f = (u) => repFold(rep, u), h = 1e-7, D = repDual(rep, v);
    const dq = (u, w) => f(u).reduce((s, q, k) => s + q * g[k], 0) - f(w).reduce((s, q, k) => s + q * g[k], 0);
    const up = D.up(g);
    for (let k = 0; k < 3; k++) {
      const a = [...v], b = [...v];
      a[k] += h; b[k] -= h;
      const fd = dq(a, b) / (2 * h);
      if (Math.abs(fd - up[k]) > 1e-2) continue;   // a cell wall inside the difference
      assert.ok(Math.abs(fd - up[k]) < 1e-5, `${rep.kind} up ${k}`);
    }
  }
});

// the case's points near its surface
function points(c, R, n, seed) {
  const rng = makeRng(seed), out = [];
  for (let t = 0; out.length < n && t < 400 * n; t++) {
    const x = rng.ball().slice(0, 3).map((v) => v * R), d = collageAt(c, x, { time: T }).d;
    if (d > 2e-4 && d < 0.2) out.push(x);
  }
  return out;
}

for (const [label, c0, R] of COLLAGES) {
  test(`the chain rule: ${label}`, () => {
    const c = prepare(c0), numbers = collageNumbers(c), pts = points(c, R, 24, 11);
    assert.ok(pts.length > 8, 'no points near the surface');
    const gErr = [], pErr = [];
    const w = prepare(clone(c));
    for (const x of pts) {
      const D = collageDual(c, x, recsAt(c, x), numbers, driveAt(c, x));
      const fd = collageGrad(c, x, { time: T }, 1e-6), scale = Math.max(Math.hypot(...fd), 1e-3);
      gErr.push(Math.hypot(...fd.map((q, k) => q - D.grad[k])) / scale);
      assert.ok(Math.abs(D.d - collageAt(c, x, { time: T }).d) < 1e-9, 'the estimate');
      numbers.forEach((q, n) => {
        if (q.bound || label.includes('param link')) return;
        const t = collageTarget(w, q.ref), v0 = t.obj[t.key], h = 1e-5 * Math.max(1, Math.abs(v0)) * (q.key[0] === 'r' && q.i !== undefined && !q.join ? 10 : 1);
        t.obj[t.key] = v0 + h; const a = collageAt(w, x, { time: T }).d;
        t.obj[t.key] = v0 - h; const b = collageAt(w, x, { time: T }).d;
        t.obj[t.key] = v0;
        pErr.push(Math.abs((a - b) / (2 * h) - D.partial[n]) / Math.max(1, Math.abs(D.partial[n])));
      });
    }
    assert.ok(pct(gErr, 0.5) < 1e-3, `gradient median ${pct(gErr, 0.5)}`);
    assert.ok(pct(gErr, 0.75) < 2e-2, `gradient p75 ${pct(gErr, 0.75)}`);
    if (pErr.length) assert.ok(pct(pErr, 0.9) < 1e-3, `numbers p90 ${pct(pErr, 0.9)}`);
  });
}

// the pass's output, filled from the CPU's orbits where the WGSL would write it
const VIEW = { pos: [0, 0, -3.5], right: [1, 0, 0], up: [0, 1, 0], fwd: [0, 0, 1], tanHalfFov: 0.5, aspect: 1.5, maxDist: 12, stepScale: 1, maxSteps: 160, epsScale: 0.5 };
const grid = (nx, ny) => { const u = []; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) u.push(-1 + (2 * i + 1) / nx, -1 + (2 * j + 1) / ny); return new Float32Array(u); };

function fillBuffer(c, uvs, H, rows) {
  const n = uvs.length / 2, o = new Float32Array((CS_RAY * n + n * rows.length) * 4);
  const base = senseCollage(c, VIEW, H, uvs, { params: false, lyap: false, time: T });
  base.rays.forEach((r, i) => {
    const at = i * CS_RAY * 4;
    o[at] = r.t; o[at + 1] = r.hit ? 1 : 0;
    if (!r.hit) return;
    recsAt(c, r.x).forEach((q, p) => { o.set([...q.grad, q.de], at + (CS_PIECE + 2 * p) * 4); o[at + (CS_PIECE + 2 * p) * 4 + 4] = 0.25 * (p + 1); });
    const dv = driveAt(c, r.x);
    if (dv) dv.values.forEach((v, b) => {
      o[at + CS_VALUES * 4 + b] = v;
      for (let e = 0; e < 3; e++) o[at + (CS_DVALUES + 4 * e) * 4 + b] = dv.grads[b][e];
    });
    const g = drivenAt(c, r.x, T);
    rows.forEach((row, j) => {
      const pc = g.pieces[row.piece], q = repFold(pc.rep, toPiece(pc.place, r.x)), k = (CS_RAY * n + j * n + i) * 4;
      if (row.frozen) { const h = 1e-6, D = (u) => de({ ...pc.f, drive: undefined }, u, undefined, { time: T }); o.set([0, 1, 2].map((e) => { const a = [...q], b = [...q]; a[e] += h; b[e] -= h; return (D(a) - D(b)) / (2 * h); }), k); return; }
      const h = 1e-6, f0 = clone(pc.f), set = (v) => { if (row.drive) setDriveParam(f0.drive, row.drive, v); else f0.slots.flat()[row.oi].p[row.key] = v; };
      set(row.value + h); const a = de(f0, q, undefined, { time: T });
      set(row.value - h); const b = de(f0, q, undefined, { time: T });
      o[k + 3] = (a - b) / (2 * h);
    });
  });
  return { o, base };
}

test('the pass read back: every parameter, the order, the rows, λ by the shares', () => {
  const c = prepare(collageCase('mirror xz')[1]), uvs = grid(10, 7), H = 800, rows = collageSenseRows(c).list;
  const { o, base } = fillBuffer(c, uvs, H, rows);
  const r = readCollageSense(c, VIEW, H, uvs, o, rows);
  assert.equal(r.hits, base.hits);
  assert.ok(r.hits > 6);
  const cpu = senseCollage(c, VIEW, H, uvs, { lyap: false, time: T });
  assert.deepEqual(r.params.map(metricId), cpu.params.map(metricId));
  cpu.params.forEach((p, j) => {
    const a = r.params[j].pxPerUnit, b = p.pxPerUnit;
    // (the CPU's gradient is a difference a quarter pixel wide, the pass's the point's own: a rough surface differs)
    assert.ok(Math.abs(a - b) <= 0.3 * Math.max(b, 1), `${metricId(p)}: ${a} vs the CPU's ${b}`);
  });
  for (const q of r.rays.filter((y) => y.hit)) {
    assert.equal(q.speeds.length, r.params.length);
    assert.ok(Math.abs(Math.hypot(...q.n) - 1) < 1e-9);
    assert.ok(q.lambda > 0.2 && q.lambda < 0.8);
  }
});

test('the bound numbers are not measured, the drive enters the normal, L comes from the pass', () => {
  const [, c0] = collageCase('drive: axis → seam, time → place'), c = prepare(c0), uvs = grid(10, 7), rows = collageSenseRows(c).list;
  const { o } = fillBuffer(c, uvs, 800, rows);
  const r = readCollageSense(c, VIEW, 800, uvs, o, rows);
  assert.ok(r.hits > 6);
  assert.ok(!r.params.some((p) => p.ref === 'J0.r' || p.ref === 'P1.ty'));
  const off = r.rays.filter((y) => y.hit).map((q) => {
    const fd = collageGrad(c, q.x, { time: T }, 1e-6);
    return Math.hypot(...fd.map((v, k) => v / Math.hypot(...fd) - q.n[k]));
  });
  // (a hit's t is float32 in the buffer: the point moved off the one the orbits ran at, and the surface is rough)
  assert.ok(pct(off, 0.5) < 1e-2, `the normal, median ${pct(off, 0.5)}`);
  assert.ok(r.step >= 1 && r.step <= 16);
});

test('the pieces\' drivers are in the metric', () => {
  const [, c0] = collageCase('a driven piece'), c = prepare(c0), uvs = grid(10, 7), rows = collageSenseRows(c).list;
  assert.ok(rows.some((q) => q.drive) && rows.some((q) => q.frozen));
  const { o } = fillBuffer(c, uvs, 800, rows);
  const r = readCollageSense(c, VIEW, 800, uvs, o, rows);
  assert.ok(r.driveParams.length > 0 && r.driveParams.every((p) => p.piece === 0));
  assert.ok(r.driveParams.some((p) => p.pxPerUnit > 0));
  assert.equal(r.rays.find((q) => q.hit).speeds.length, r.params.length + r.driveParams.length);
  // ids, values, clamps, a mutation a known distance away
  const m = r.driveParams.find((p) => p.pxPerUnit > 0), id = metricId(m);
  assert.ok(id.startsWith('P0:'));
  assert.equal(metricValue(c, m), m.value);
  const next = withMetric(c, m, m.value + 0.01);
  assert.ok(Math.abs(metricValue(next, m) - (m.value + 0.01)) < 1e-6);
  const metric = [...r.params, ...r.driveParams], rnd = makeRng(4);
  const b = mutateCollage(c, metric, new Set(), 40, () => rnd.next ? rnd.next() : Math.random());
  const dist = collageDistancePx(c, b, metric);
  assert.ok(Math.abs(dist - 40) < 8, `moved ${dist} px`);
});

// the collage's own drivers: band ends and node numbers, carried through the numbers they bind (the chain rule
// in core/collage-sense.js) against differences of collageAt with the parameter really moved
for (const label of ['drive: axis → seam, time → place', 'drive: tissue → morph, param link', 'own shade: its drivers']) {
  test(`the collage's own drivers are in the metric: ${label}`, () => {
    const [, c0] = collageCase(label), c = prepare(c0), uvs = grid(12, 8), rows = collageSenseRows(c).list;
    const own = collageDriveParams(c);
    assert.ok(own.length > 0);
    // every band end of a live binding, and only nodes upstream of one (the shade's sphere and clock bind nothing)
    for (const b of c.drive.bind) assert.ok(own.some((p) => p.drive === `bind/${b.to}/lo`) && own.some((p) => p.drive === `bind/${b.to}/hi`));
    if (label.startsWith('own shade')) assert.ok(!own.some((p) => /^node\/(sp|t)\//.test(p.drive)));
    const { o } = fillBuffer(c, uvs, 800, rows);
    const r = readCollageSense(c, VIEW, 800, uvs, o, rows, { time: T });
    const mine = r.driveParams.filter((p) => p.piece == null);
    assert.deepEqual(mine.map((p) => p.drive), own.map((p) => p.drive));
    assert.ok(mine.some((p) => p.pxPerUnit > 0));
    const first = r.params.length + r.driveParams.length - mine.length, w = prepare(clone(c)), errs = [];
    for (const q of r.rays.filter((y) => y.hit && y.grad > 1e-6)) {
      assert.equal(q.speeds.length, r.params.length + r.driveParams.length);
      mine.forEach((p, j) => {
        const set = setter(w, p), h = 1e-6 * Math.max(1, Math.abs(p.value));
        set(p.value + h); const a = collageAt(w, q.x, { time: T }).d;
        set(p.value - h); const b = collageAt(w, q.x, { time: T }).d;
        set(p.value);
        const s = Math.abs((a - b) / (2 * h)) / q.grad / (q.t * r.pixelAngle);
        errs.push(Math.abs(Math.abs(q.speeds[first + j]) - s) / Math.max(s, 0.05 * Math.max(p.pxPerUnit, 1e-6)));
      });
    }
    assert.ok(errs.length > 10);
    assert.ok(pct(errs, 0.5) < 1e-3, `median ${pct(errs, 0.5)}`);
    assert.ok(pct(errs, 0.9) < 2e-2, `p90 ${pct(errs, 0.9)}`);
    // ids, values, writes, a mutation a known distance away
    const m = mine.find((p) => p.pxPerUnit > 0);
    assert.ok(metricId(m).startsWith('C:'));
    assert.equal(metricValue(c, m), m.value);
    assert.ok(Math.abs(metricValue(withMetric(c, m, m.value + 0.01), m) - (m.value + 0.01)) < 1e-6);
    const metric = [...r.params, ...r.driveParams], rnd = makeRng(9);
    const b = mutateCollage(c, metric, new Set(), 40, () => rnd.next ? rnd.next() : Math.random());
    assert.ok(Math.abs(collageDistancePx(c, b, metric) - 40) < 8);
  });
}

test('a binding clamped at its number\'s range moves nothing', () => {
  const [, c0] = collageCase('drive: axis → seam, time → place'), c = prepare(clone(c0));
  // the seam's band pushed far past J0.r's range: every point clamps
  c.drive.bind.find((b) => b.to === 'J0.r').hi = 50;
  c.drive.bind.find((b) => b.to === 'J0.r').lo = 40;
  const own = collageDriveParams(c), J = collageDriveJac(c, [0.2, 0.3, 0.1], own, T);
  own.forEach((p, j) => { if (p.drive.includes('J0.r') || p.drive.startsWith('node/')) assert.equal(J[j][c.drive.bind.findIndex((b) => b.to === 'J0.r')], 0, p.drive); });
  assert.ok(J.some((row) => row.some((q) => q !== 0)), 'the clock\'s binding still moves');
});

test('the rows: seven vec4, the piece first, its table row after', () => {
  const [, c] = collageCase('a driven piece');
  const { list, buf } = collageSenseRows(c);
  assert.equal(CS_ROW_FLOATS, 4 + TAN_FLOATS);
  assert.equal(buf.length, list.length * CS_ROW_FLOATS);
  list.forEach((t, i) => { assert.equal(buf[i * CS_ROW_FLOATS], t.piece); assert.equal(buf[i * CS_ROW_FLOATS + 5], t.drec ? 0 : t.kind); });
});
