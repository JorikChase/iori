// K3: what the app learns of the collage — breeding (lerpCollage, mutateCollage, the metric), the CPU
// sensing pass, the state document carrying a collage, the join glyphs, the gizmo's maths, the new
// drive edits. Run: node --test fractal-engine/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCollage, normCollage, collageAt, hashCollage, formatCollage, prepare } from '../core/collage.js';
import * as E from '../core/collage-edit.js';
import { lerpCollage, canBreed, collageStructure, mutateCollage, collageDistancePx, metricId, metricValue, withMetric, lerpFormula } from '../core/collage-breed.js';
import { senseCollage, collageMetricParams } from '../core/collage-sense.js';
import { stateDoc, plyComments, readPlyState } from '../core/state.js';
import { parse, normalize } from '../core/formula.js';
import { rotationXYZ } from '../core/vec.js';
import { eulerXYZ, axisAngle, repCells } from '../ui/gizmo.js';
import { joinGlyph, layoutCollage, placeCollage, drawCollage, seamLine, pieceAt, joinAt } from '../ui/collagegraph.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
const A = '{ bulb 8 · +c ×10 bail=4 } at .7 0 0 ∪ .3 { fold.box 1 · fold.sphere .5 1 · scale 2.5 · +c ×12 bail=100 } at -.7 0 0 size .1';
const B = '{ bulb 6 · +c ×10 bail=4 } at .5 .2 0 turn 0 30 0 ∪ cubic .1 { fold.box 1.2 · fold.sphere .5 1 · scale 2.2 · +c ×12 bail=100 } at -.9 0 0 size .2';
const rnd = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
const VIEW = { pos: [0, 0, -3], right: [1, 0, 0], up: [0, 1, 0], fwd: [0, 0, 1], tanHalfFov: 0.7, aspect: 1.5, maxDist: 12 };
const grid = (nx, ny) => { const u = []; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) u.push(-1 + (2 * i + 1) / nx, -1 + (2 * j + 1) / ny); return new Float32Array(u); };

test('breeding: same counts interpolate piece by piece, a differing kernel or op comes from one parent', () => {
  const a = parseCollage(A), b = parseCollage(B);
  assert.ok(canBreed(a, b));
  assert.deepEqual(lerpCollage(a, b, 0), normCollage(a));
  assert.deepEqual(lerpCollage(a, b, 1), normCollage(b));
  const m = lerpCollage(a, b, 0.25);
  assert.ok(near(m.pieces[0].place.tx, 0.65) && near(m.pieces[0].place.ty, 0.05) && near(m.pieces[0].place.ry, 7.5));
  assert.ok(near(m.pieces[1].place.s, 0.125));
  assert.ok(near(m.pieces[0].f.slots[0][0].p.n, 7.5), 'a piece of one structure interpolates its parameters');
  assert.ok(near(m.pieces[1].f.slots[0][2].p.s, 2.425));
  // the join's kernel differs: quad before t = ½, cubic from there, the whole join from that parent
  assert.equal(m.joins[0].k, 'quad');
  assert.ok(near(m.joins[0].r, 0.3));
  assert.equal(lerpCollage(a, b, 0.75).joins[0].k, 'cubic');
  assert.ok(near(lerpCollage(a, b, 0.75).joins[0].r, 0.1));
  // same op and kernel: r interpolates
  const b2 = parseCollage(B.replace('∪ cubic .1', '∪ .1'));
  assert.ok(near(lerpCollage(a, b2, 0.5).joins[0].r, 0.2));
  // different counts, or a collage and a formula, do not breed
  const three = E.addPiece(a, parse('bulb 4 · +c ×8'));
  assert.equal(lerpCollage(a, three, 0.5), null);
  assert.equal(lerpCollage(a, parse('bulb 8 · +c ×10'), 0.5), null);
  // a piece of another structure is taken whole from the nearer parent
  const c = E.editPiece(b, 0, () => parse('quat · +c ×10'));
  assert.equal(lerpCollage(a, c, 0.4).pieces[0].f.slots[0][0].op, 'bulb');
  assert.equal(lerpCollage(a, c, 0.6).pieces[0].f.slots[0][0].op, 'quat');
  assert.notEqual(collageStructure(a), collageStructure(c));
  assert.equal(collageStructure(a), collageStructure(b2));
  // repetitions of one kind interpolate, of another come from one parent
  const ga = E.setRep(a, 1, 'grid', { cx: 2, nx: 1 }), gb = E.setRep(b2, 1, 'grid', { cx: 4, nx: 3 });
  const g = lerpCollage(ga, gb, 0.5);
  assert.equal(g.pieces[1].rep.kind, 'grid');
  assert.ok(near(g.pieces[1].rep.cx, 3) && g.pieces[1].rep.nx === 2);
  assert.equal(lerpCollage(ga, E.setRep(b2, 1, 'polar', { n: 5, r: 1 }), 0.4).pieces[1].rep.kind, 'grid');
  assert.equal(lerpFormula(parse('bulb 8 · +c ×10'), parse('bulb 4 · +c ×10'), 0.5).slots[0][0].p.n, 6);
});

test('the metric: ids, values, the collage with one set, mutation at a known pixel distance', () => {
  const a = parseCollage(A);
  const metric = [{ ref: 'P0.tx', pxPerUnit: 100 }, { ref: 'J0.r', pxPerUnit: 50 }, { piece: 1, oi: 2, op: 'scale', key: 's', pxPerUnit: 20 }];
  assert.deepEqual(metric.map(metricId), ['P0.tx', 'J0.r', 'P1:2.s']);
  assert.equal(metricValue(a, metric[2]), 2.5);
  assert.equal(withMetric(a, metric[2], 3).pieces[1].f.slots[0][2].p.s, 3);
  assert.equal(withMetric(a, metric[1], -1).joins[0].r, 0, 'clamped to the range');
  for (let s = 1; s < 6; s++) {
    const m = mutateCollage(a, metric, new Set(), 40, rnd(s));
    assert.ok(near(collageDistancePx(a, m, metric), 40, 1e-3), 'a neighbour is D pixels away by the metric');
  }
  const pinned = mutateCollage(a, metric, new Set(['P0.tx', 'P1:2.s']), 40, rnd(9));
  assert.equal(pinned.pieces[0].place.tx, 0.7);
  assert.ok(near(Math.abs(pinned.joins[0].r - 0.3) * 50, 40, 1e-3));
});

test('sensing a collage on the CPU: hits, the leading piece, every parameter measured', () => {
  const a = parseCollage(A), r = senseCollage(a, VIEW, 800, grid(10, 6));
  assert.ok(r.hits > 4, 'the view sees the collage');
  assert.equal(r.rays.length, 60);
  const ps = collageMetricParams(a);
  assert.equal(r.params.length, ps.length);
  assert.ok(ps.some((p) => p.ref === 'J0.r') && ps.some((p) => p.piece === 1 && p.op === 'scale'));
  for (const p of r.params) assert.ok(Number.isFinite(p.pxPerUnit) && p.pxPerUnit >= 0);
  assert.ok(r.params.find((p) => p.ref === 'P0.tx').pxPerUnit > 1, 'moving a piece moves the surface');
  for (const q of r.rays.filter((x) => x.hit)) {
    assert.equal(q.lead, collageAt(prepare(a), q.x).lead);
    assert.ok(collageAt(prepare(a), q.x).d < 0.01);
  }
  // the measure: a step of px pixels by the metric moves the surface about px pixels at the hits
  const p = r.params.find((q) => q.ref === 'P0.tx'), g = withMetric(a, p, p.value + 3 / p.pxPerUnit), G = prepare(g);
  let s = 0;
  for (const q of r.rays.filter((x) => x.hit)) { const moved = (collageAt(G, q.x).d - collageAt(prepare(a), q.x).d) / q.grad / (q.t * r.pixelAngle); s += moved * moved; }
  const rms = Math.sqrt(s / r.hits);
  assert.ok(rms > 1 && rms < 6, `3 px by the metric moved the surface ${rms.toFixed(2)} px`);
  const f = senseCollage(a, VIEW, 800, grid(10, 6), { params: false });
  assert.equal(f.params.length, 0);
  assert.equal(f.hits, r.hits);
});

test('the state document carries a collage', () => {
  const a = parseCollage(A);
  const doc = stateDoc({ formula: a, cam: { pos: [0, 0, -3], yaw: 0, pitch: 0 } });
  assert.equal(doc.id, hashCollage(a));
  assert.equal(doc.notation, formatCollage(a));
  const lines = plyComments(doc), ply = `ply\nformat ascii 1.0\n${lines.join('\n')}\nend_header\n`;
  const back = readPlyState(new TextEncoder().encode(ply).buffer);
  assert.equal(hashCollage(back.formula), hashCollage(a));
  // a formula still round-trips as one
  const f = stateDoc({ formula: parse('bulb 8 · +c ×10'), cam: { pos: [0, 0, -3], yaw: 0, pitch: 0 } });
  assert.equal(readPlyState(new TextEncoder().encode(`ply\n${plyComments(f).join('\n')}\nend_header\n`).buffer).formula.slots[0][0].op, 'bulb');
});

test('the collage graph: layout, the joins\' own contours, the seam line, hit tests', () => {
  const c = E.addPiece(parseCollage(A), parse('fold.plane 1 1 0 · fold.plane 1 0 1 · fold.plane 0 1 1 · scale 2 · translate -1 -1 -1 ×16 bail=16'), null, { op: 'sub', k: 'stairs', r: 0.2, n: 3 });
  const L = layoutCollage(normCollage(c));
  assert.equal(L.pieces.length, 3);
  assert.equal(L.joins.length, 2);
  const PC = placeCollage(L, 40, 1200, 400);
  // pieces side by side, left to right, each its own zone; joins between their pieces
  assert.ok(PC.pieces[0].zone[2] < PC.pieces[1].zone[0] && PC.pieces[1].zone[2] < PC.pieces[2].zone[0]);
  PC.joins.forEach((q, k) => assert.ok(q.x > PC.pieces[k].zone[0] && q.x < PC.pieces[k + 1].zone[2]));
  for (const q of PC.joins) assert.equal(joinAt(PC, q.x, q.y), q.k);
  const p1 = PC.pieces[1].zone;
  assert.equal(pieceAt(PC, (p1[0] + p1[2]) / 2, (p1[1] + p1[3]) / 2), 1);
  // the seam line: r on screen at the focus, clamped; the stairs' steps; a morph's fixed line
  assert.equal(seamLine(PC, PC.joins[0], 100).len, 30);
  assert.equal(seamLine(PC, PC.joins[0], 1e5).len, 140);
  assert.equal(seamLine(PC, PC.joins[1], 100).steps, 3);
  // every kernel and op draws a contour (a hard join a corner, a morph a straight line)
  for (const op of ['union', 'inter', 'sub']) for (const k of ['quad', 'cubic', 'exp', 'circ', 'stairs', 'chamfer', 'hard']) assert.ok(joinGlyph({ op, k, r: 0.2, n: 4 }, 0, 0, 24).length > 40, `${op} ${k}`);
  const morph = joinGlyph({ op: 'morph', k: 'quad', w: 0.5 }, 0, 0, 24);
  assert.ok(morph.length > 20);
  // the stairs' contour has more corners than the quad's fillet
  assert.notEqual(joinGlyph({ op: 'union', k: 'stairs', r: 0.2, n: 4 }, 0, 0, 24), joinGlyph({ op: 'union', k: 'quad', r: 0.2 }, 0, 0, 24));
  assert.ok(drawCollage(PC, { full: true, selected: { kind: 'join', k: 1 }, pxPerUnit: 100 }).includes('class="nd jn sel"'));
});

test('the gizmo: Euler angles back from a rotation, Rodrigues, the repetition\'s cells', () => {
  for (const [x, y, z] of [[10, 20, 30], [-70, 45, 160], [0, 0, 0], [5, -80, -120]]) {
    const R = rotationXYZ(x, y, z), [a, b, c] = eulerXYZ(R), R2 = rotationXYZ(a, b, c);
    R.forEach((v, i) => assert.ok(near(v, R2[i], 1e-9)));
  }
  const n = [0, 0, 1], Q = axisAngle(n, Math.PI / 2);
  // a quarter turn about z takes x to y
  assert.ok(near(Q[0], 0, 1e-12) && near(Q[3], 1) && near(Q[8], 1));
  const place = { tx: 1, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, s: 2, g: 0 };
  const grid = repCells(place, { kind: 'grid', cx: 1, cy: 0, cz: 0, nx: 1, ny: 1, nz: 1 }, 0.5);
  assert.equal(grid.solid.length, 12, 'the original cell solid: one box');
  assert.equal(grid.ghost.length, 2 * (12 + 3), 'two copies along x, each its box and frame');
  // the original's box spans the cell (cx = 1 → ±0.5 in the piece's frame, ×2 in the world, about tx)
  const xs = grid.solid.flat().map((p) => p[0]);
  assert.ok(near(Math.min(...xs), 0) && near(Math.max(...xs), 2));
  const polar = repCells(place, { kind: 'polar', n: 6, r: 1, axis: 1 }, 0.5);
  assert.equal(polar.solid.length, 2, 'the axis and the original spoke');
  assert.equal(polar.ghost.length, 5 * 4 + 6, 'five copies (spoke, frame), six sector walls');
  const mirror = repCells(place, { kind: 'mirror', mx: 1, my: 0, mz: 1, ox: 0.3, oy: 0, oz: 0.2 }, 0.5);
  assert.equal(mirror.solid.length, 8, 'two mirror planes');
  assert.equal(mirror.ghost.length, 3 * 3, 'three mirrored copies, each a frame');
});

test('collage drive edits: link two drivers, remove one with its bindings', () => {
  let c = parseCollage(A);
  c = E.setCollageDriver(c, { id: 'axis0', type: 'axis', in: {}, p: {} });
  c = E.setCollageDriver(c, { id: 'math0', type: 'math', in: {}, p: { op: 'mul', c: 2 } });
  c = E.connectCollageDriver(c, 'axis0', 'math0', 'a');
  assert.equal(c.drive.nodes.find((m) => m.id === 'math0').in.a, 'axis0');
  c = E.setCollageDriver(c, { id: 'remap0', type: 'remap', in: { a: 'axis0' }, p: { lo: 0, hi: 1, clamp: false } });
  c = E.setCollageDriver(c, { id: 'time0', type: 'time', in: {}, p: {} });
  c = E.bindCollage(c, 'J0.r', 'math0', 0.1, 0.4);
  c = E.bindCollage(c, 'P1.tx', 'remap0', -1, 1);
  c = E.bindCollage(c, 'P0.ty', 'time0', -1, 1);
  // the axis out: the math node loses its input, the remap (which must read one) goes with it
  c = E.removeCollageDriver(c, 'axis0');
  assert.deepEqual(c.drive.bind.map((b) => b.to).sort(), ['J0.r', 'P0.ty']);
  assert.deepEqual(c.drive.nodes.map((m) => m.id), ['math0', 'time0']);
  assert.equal(c.drive.nodes[0].in.a, undefined);
  assert.throws(() => E.connectCollageDriver(c, 'nope', 'math0', 'a'));
});
