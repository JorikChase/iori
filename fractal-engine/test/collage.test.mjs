// K1: the collage on the CPU — kernels, placement and repetition, the estimate, shares and readings, the
// collage's drive, push with the keep rule, notation, edits. Run: node --test fractal-engine/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parse, normalize, de, isCollage, normCollage, validateCollage, hashCollage, smin, joinEval, repFold, repCopies,
  toPiece, fromPiece, pieceDE, collageAt, collageDE, collageGrad, collageColour, collagePush, parseCollage,
  formatCollage, parseAny, formatAny, collageToURLHash, fromURLHashAny, collageOf, prepare,
} from '../core/index.js';
import { KERNELS } from '../core/collage.js';
import * as E from '../core/collage-edit.js';
import { insert } from '../core/graph.js';
import { defaultShade } from '../core/shade.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
// r/dr with dr = 1 after one translate: the estimate is |p|, the distance to a point — an exact test piece
const POINT = 'translate 0 0 0 ×1 bail=1000';
const BULB = 'bulb 8 · +c ×10 bail=4';
const BOX = 'fold.box 1 · fold.sphere .5 1 · scale 2.5 · +c ×12 bail=100';
const SIERPINSKI = 'fold.plane 1 1 0 · fold.plane 1 0 1 · fold.plane 0 1 1 · scale 2 · translate -1 -1 -1 ×16 bail=16';
const rnd = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };

test('kernels: hard is min exactly, unions share 1 between their inputs, partials match differences', () => {
  const r = rnd(1);
  for (const k of KERNELS) for (let t = 0; t < 200; t++) {
    const a = r() * 2 - 1, b = r() * 2 - 1, w = 0.05 + r() * 0.5;
    const [d, ga, gb] = smin(k, a, b, w, 3);
    assert.ok(d <= Math.min(a, b) + 1e-12, `${k} never above min`);
    const [d0] = smin(k, a, b, 0);
    assert.equal(d0, Math.min(a, b));
    if (k !== 'chamfer') {
      assert.ok(ga >= -1e-12 && gb >= -1e-12 && near(ga + gb, 1, 1e-9), `${k}: shares ${ga} ${gb}`);
    }
    // away from the kinks (stairs' and chamfer's corners, the edge of the fillet) the partials are the slope
    const h = 1e-7, da = (smin(k, a + h, b, w, 3)[0] - smin(k, a - h, b, w, 3)[0]) / (2 * h), db = (smin(k, a, b + h, w, 3)[0] - smin(k, a, b - h, w, 3)[0]) / (2 * h);
    if (Math.abs(da - ga) > 1e-4 || Math.abs(db - gb) > 1e-4) {
      // only allowed at a kink: the one-sided slopes then disagree
      const l = (smin(k, a, b, w, 3)[0] - smin(k, a - 1e-4, b, w, 3)[0]) / 1e-4, u = (smin(k, a + 1e-4, b, w, 3)[0] - smin(k, a, b, w, 3)[0]) / 1e-4;
      const lb = (smin(k, a, b, w, 3)[0] - smin(k, a, b - 1e-4, w, 3)[0]) / 1e-4, ub = (smin(k, a, b + 1e-4, w, 3)[0] - smin(k, a, b, w, 3)[0]) / 1e-4;
      assert.ok(Math.abs(l - u) > 1e-3 || Math.abs(lb - ub) > 1e-3, `${k} at ${a}, ${b}, ${w}: ${da} vs ${ga}, ${db} vs ${gb}`);
    }
  }
  // far apart, every smooth union is the min
  for (const k of KERNELS) if (k !== 'exp') assert.ok(near(smin(k, 0.1, 5, 0.3)[0], 0.1, 1e-12));
  assert.ok(near(smin('exp', 0.1, 5, 0.3)[0], 0.1, 1e-6));
  // the quadratic at the seam's middle: a − r/4
  assert.ok(near(smin('quad', 0.4, 0.4, 0.2)[0], 0.35));
});

test('joins: intersection and subtraction are the complements, morph is the lerp', () => {
  const r = rnd(2);
  for (let t = 0; t < 100; t++) {
    const a = r() * 2 - 1, b = r() * 2 - 1;
    for (const k of KERNELS) {
      const u = joinEval({ op: 'union', k, r: 0.3, n: 3 }, -a, -b), x = joinEval({ op: 'inter', k, r: 0.3, n: 3 }, a, b);
      assert.ok(near(x[0], -u[0]), `inter ${k}`);
      assert.ok(x[0] >= Math.max(a, b) - 1e-12);
      const s = joinEval({ op: 'sub', k, r: 0.3, n: 3 }, a, b), i2 = joinEval({ op: 'inter', k, r: 0.3, n: 3 }, a, -b);
      assert.ok(near(s[0], i2[0]) && near(s[2], -i2[2]), `sub ${k}`);
    }
    const m = joinEval({ op: 'morph', w: 0.25 }, a, b);
    assert.ok(near(m[0], 0.75 * a + 0.25 * b) && m[3] === 0.75);
  }
  assert.equal(joinEval({ op: 'union', k: 'hard', r: 0.3 }, 0.2, 0.2)[3], 0);
  assert.equal(joinEval({ op: 'union', k: 'quad', r: 0.3 }, 0.2, 0.2)[3], 1);
});

test('placement and scale keep the estimate exact; toPiece and fromPiece are inverses', () => {
  const r = rnd(3);
  const place = { tx: 0.3, ty: -1, tz: 2, rx: 20, ry: -35, rz: 70, s: 0.4 };
  const pc = normCollage({ pieces: [{ f: parse(POINT), place }], joins: [] }).pieces[0];
  for (let t = 0; t < 50; t++) {
    const x = [r() * 4 - 2, r() * 4 - 2, r() * 4 - 2];
    const back = fromPiece(pc.place, toPiece(pc.place, x));
    assert.ok(back.every((v, i) => near(v, x[i], 1e-12)));
    // the placed point piece is the distance to its placement's origin, whatever the turn and size
    assert.ok(near(pieceDE(pc, x), Math.hypot(x[0] - 0.3, x[1] + 1, x[2] - 2), 1e-12));
  }
  // a real piece: s·DE(x′/s)
  const bulb = normCollage({ pieces: [{ f: parse(BULB), place: { tx: 1, s: 2 } }], joins: [] }).pieces[0];
  assert.ok(near(pieceDE(bulb, [1.5, 0.4, 2.9]), 2 * de(parse(BULB), [0.25, 0.2, 1.45])));
});

test('repetition: grid, mirror and polar fold to the nearest copy; every copy folds back', () => {
  const r = rnd(4);
  const reps = [
    { kind: 'grid', cx: 2, cy: 0, cz: 3, nx: 2, ny: 1, nz: 1 },
    { kind: 'mirror', mx: 1, my: 0, mz: 1, ox: 1.5, oy: 0, oz: 0.5 },
    { kind: 'polar', n: 5, r: 2, axis: 1 },
    { kind: 'polar', n: 3, r: 1, axis: 2 },
  ];
  for (const rep of reps) {
    const copies = repCopies(rep);
    const pc = normCollage({ pieces: [{ f: parse(POINT), rep }], joins: [] }).pieces[0];
    // the point piece repeated: the distance to the nearest copy's origin
    const origins = copies.map((c) => c.o);
    for (let t = 0; t < 60; t++) {
      const x = [r() * 10 - 5, r() * 6 - 3, r() * 10 - 5];
      const want = Math.min(...origins.map((o) => Math.hypot(x[0] - o[0], x[1] - o[1], x[2] - o[2])));
      assert.ok(near(pieceDE(pc, x), want, 1e-9), `${rep.kind}: ${pieceDE(pc, x)} vs ${want}`);
    }
    // a point near the drawn copy's origin, sent to each copy, folds back to itself
    const q = [0.1, -0.05, 0.08];
    for (const c of copies) {
      const v = c.L.length ? [0, 1, 2].map((i) => c.L[i * 3] * q[0] + c.L[i * 3 + 1] * q[1] + c.L[i * 3 + 2] * q[2] + c.o[i]) : q;
      const back = repFold(rep, v);
      assert.ok(back.every((a, i) => near(a, q[i], 1e-9)), `${rep.kind} copy folds back`);
    }
  }
  assert.equal(repCopies({ kind: 'grid', cx: 2, cy: 0, cz: 3, nx: 2, ny: 1, nz: 1 }).length, 15);
  assert.equal(repCopies({ kind: 'mirror', mx: 1, my: 1, mz: 1, ox: 0, oy: 0, oz: 0 }).length, 8);
});

test('the estimate: two points joined is their smooth union; far from a seam it is the near piece alone', () => {
  const c = prepare(collageOf(parse(POINT), parse(POINT), { op: 'union', k: 'quad', r: 0.4 }, { tx: -1 }, { tx: 1 }));
  // the seam's middle: both at distance √(1 + y²)
  const y = 0.5, a = Math.hypot(1, y);
  assert.ok(near(collageDE(c, [0, y, 0]), a - 0.1));
  const at = collageAt(c, [0, y, 0]);
  assert.ok(near(at.w[0], 0.5) && near(at.piece, 0.5) && near(at.seam, 1));
  const far = collageAt(c, [-1.2, 0, 0]);
  assert.ok(near(far.d, 0.2) && far.w[0] === 1 && far.seam === 0 && far.lead === 0);
  // the gradient of the union is the share-weighted gradient of the pieces (|∇| ≤ 1)
  const x = [0.1, 0.3, -0.2], g = collageGrad(c, x), w = collageAt(c, x).w;
  const ga = [x[0] + 1, x[1], x[2]].map((v, _, q) => v / Math.hypot(...q)), gb = [x[0] - 1, x[1], x[2]].map((v, _, q) => v / Math.hypot(...q));
  g.forEach((v, i) => assert.ok(near(v, w[0] * ga[i] + w[1] * gb[i], 1e-6)));
  // real pieces: a smooth union never exceeds either piece's own estimate, and the hard union is the min
  const real = prepare(collageOf(parse(BULB), parse(BOX), { op: 'union', k: 'cubic', r: 0.3 }, { tx: 0.8 }, { tx: -0.8, s: 0.12 }));
  const hard = prepare(collageOf(parse(BULB), parse(BOX), { op: 'union', k: 'hard' }, { tx: 0.8 }, { tx: -0.8, s: 0.12 }));
  const r = rnd(5);
  for (let t = 0; t < 30; t++) {
    const x = [r() * 4 - 2, r() * 3 - 1.5, r() * 3 - 1.5], at = collageAt(real, x);
    assert.ok(at.d <= Math.min(...at.dists) + 1e-12);
    assert.equal(collageDE(hard, x), Math.min(...collageAt(hard, x).dists));
    assert.ok(near(at.w.reduce((s, v) => s + v, 0), 1, 1e-12));
  }
});

test('three pieces fold left to right; a grown cutter carves, its share goes to the cutter on the cut', () => {
  const c = prepare(normCollage({
    pieces: [{ f: parse(POINT) }, { f: parse(POINT), place: { tx: 2 } }, { f: parse(POINT), place: { ty: 0.1, g: 0.3 } }],
    joins: [{ op: 'union', k: 'hard' }, { op: 'sub', k: 'hard' }],
  }));
  const x = [0.3, 1.1, 0], a = Math.hypot(0.3, 1.1), b = Math.hypot(1.7, 1.1), p3 = Math.hypot(0.3, 1) - 0.3;
  assert.ok(near(collageDE(c, x), Math.max(Math.min(a, b), -p3)));
  // a point near piece 0 and inside the grown third: cut away, the share goes to piece 2
  const inside = collageAt(c, [0, 0.05, 0]);
  assert.ok(inside.d > 0 && inside.lead === 2 && inside.w[2] === 1);
  // ungrown, an unsigned cutter has no inside: nothing is carved
  const flat = prepare(normCollage({ pieces: [{ f: parse(BULB) }, { f: parse(BULB), place: { tx: 0.3 } }], joins: [{ op: 'sub', k: 'hard' }] }));
  const at = collageAt(flat, [0.2, 0, 0]);
  assert.equal(at.d, at.dists[0]);
});

test('a piece is any formula: a chimera, its own slice, its own drive', () => {
  const chim = parse('[bulb 8 · +c ‖ bulb 3 · +c] tissue 6 1.5 .1 ×10 bail=4');
  const sliced = parse('quat · +c ×12 bail=4 slice=.3,10,0,20');
  const driven = normalize({ ...parse('bulb 8 · +c ×10 bail=4'), drive: { nodes: [{ id: 'r0', type: 'x' }], bind: [{ to: 'A0.n', from: 'r0', lo: 6, hi: 8 }] } });
  const c = prepare(normCollage({ pieces: [{ f: chim }, { f: sliced, place: { tx: 1 } }, { f: driven, place: { tz: 1, s: 0.5 } }], joins: [{}, { op: 'inter', k: 'exp', r: 0.1 }] }));
  assert.ok(validateCollage(c).ok, validateCollage(c).errors.join('; '));
  const x = [0.4, 0.2, 0.9], at = collageAt(c, x);
  assert.ok(near(at.dists[0], de(chim, x)));
  assert.ok(near(at.dists[1], de(sliced, [x[0] - 1, x[1], x[2]])));
  assert.ok(near(at.dists[2], 0.5 * de(driven, [x[0] / 0.5, x[1] / 0.5, (x[2] - 1) / 0.5])));
  // a collage cannot sit inside a collage
  assert.ok(!validateCollage({ pieces: [{ f: c }], joins: [] }).ok);
});

test('the collage drive: a world field binds the seam width; orbit readings are refused', () => {
  const base = collageOf(parse(POINT), parse(POINT), { op: 'union', k: 'quad', r: 0.2 }, { tx: -1 }, { tx: 1 });
  const drive = { nodes: [{ id: 'ax', type: 'axis', p: { nx: 0, ny: 1, g: 1 } }, { id: 'rm', type: 'remap', in: { a: 'ax' }, p: { lo: -1, hi: 1, clamp: true } }], bind: [{ to: 'J0.r', from: 'rm', lo: 0.05, hi: 0.6 }] };
  const c = prepare({ ...base, drive });
  assert.ok(validateCollage(c).ok, validateCollage(c).errors.join('; '));
  for (const y of [-0.8, 0, 0.5]) {
    const r = 0.05 + ((y + 1) / 2) * 0.55;
    const fixed = collageOf(parse(POINT), parse(POINT), { op: 'union', k: 'quad', r }, { tx: -1 }, { tx: 1 });
    assert.ok(near(collageDE(c, [0, y, 0.3]), collageDE(fixed, [0, y, 0.3])));
  }
  // a morph by a tissue: the field decides which piece is there
  const m = prepare({
    ...collageOf(parse(POINT), parse(POINT), { op: 'morph', w: 0.5 }, { tx: -1 }, { tx: 1 }),
    drive: { nodes: [{ id: 't', type: 'tissue', p: { n: 2, size: 2, soft: 0.01, seed: 3, out: 'cell' } }], bind: [{ to: 'J0.w', from: 't', lo: 0, hi: 1 }] },
  });
  const ws = [[-1.9, 0, 0], [1.9, 0, 0], [0, 1.9, 0]].map((x) => collageAt(m, x).w[1]);
  assert.ok(ws.some((w) => w < 0.01) || ws.some((w) => w > 0.99), `tissue cells pure: ${ws}`);
  // param links and placement targets
  const p = prepare({ ...base, drive: { nodes: [{ id: 'q', type: 'param', p: { of: 'P0.tx' } }], bind: [{ to: 'P1.tx', from: 'q', lo: 0, hi: -1 }] } });
  assert.ok(near(collageAt(p, [1, 0, 0]).dists[1], Math.hypot(1 - 1, 0, 0)));
  assert.ok(!validateCollage({ ...base, drive: { nodes: [{ id: 'i', type: 'i' }], bind: [{ to: 'J0.r', from: 'i' }] } }).ok);
  assert.ok(!validateCollage({ ...base, drive: { nodes: [{ id: 'x', type: 'x' }], bind: [{ to: 'J3.r', from: 'x' }] } }).ok);
  // time: the clock reaches the collage's drive
  const tc = prepare({ ...base, drive: { nodes: [{ id: 'c', type: 'time', p: { rate: 1, wave: 'saw' } }], bind: [{ to: 'P1.ty', from: 'c', lo: 0, hi: 1 }] } });
  assert.ok(near(collageAt(tc, [1, 0.25, 0], { time: 0.25 }).dists[1], 0, 1e-12));
});

test('push: samples land on their placed, repeated piece and are kept by their share', () => {
  const c = prepare(normCollage({
    pieces: [
      { f: parse(SIERPINSKI), place: { tx: 0.5, ry: 30, s: 0.5 }, rep: { kind: 'mirror', mx: 1, my: 0, mz: 0, ox: 1.5 } },
      // a second Sierpiński far away: the shares stay pure
      { f: parse(SIERPINSKI), place: { tx: 8 } },
    ],
    joins: [{ op: 'union', k: 'quad', r: 0.05 }],
  }));
  const s = collagePush(c, 400);
  assert.ok(s.length > 300, `${s.length} samples`);
  for (const q of s) {
    const own = pieceDE(c.pieces[q.piece], q.p);
    assert.ok(own < 0.05, `sample ${q.p} off its piece by ${own}`);
    assert.ok(q.a > 0 && q.a <= 1);
  }
  // both mirror copies sampled
  const left = s.filter((q) => q.piece === 0 && q.p[0] < 0.5).length, right = s.filter((q) => q.piece === 0 && q.p[0] > 0.5).length;
  assert.ok(left > 50 && right > 50, `${left} / ${right}`);
  // a subtraction hides the part of piece 0 inside piece 1
  const cut = prepare(normCollage({
    pieces: [{ f: parse(SIERPINSKI) }, { f: parse(POINT), place: { tx: 1 } }],
    joins: [{ op: 'sub', k: 'hard' }],
  }));
  // an ungrown point carves nothing (an unsigned estimate has no inside): every sample of piece 0 stays
  assert.ok(collagePush(cut, 100).filter((q) => q.piece === 0).every((q) => q.a === 1));
  // an intersection with a far piece keeps nothing of piece 0
  const none = prepare(normCollage({ pieces: [{ f: parse(SIERPINSKI) }, { f: parse(SIERPINSKI), place: { tx: 10 } }], joins: [{ op: 'inter', k: 'hard' }] }));
  assert.equal(collagePush(none, 100).filter((q) => q.piece === 0).length, 0);
  // the splat map: world from orbit, s·R in the slice's columns
  for (const q of s) for (let k = 0; k < 3; k++) assert.ok(near(Math.hypot(q.M[0][k], q.M[1][k], q.M[2][k]), q.piece === 0 ? 0.5 : 1));
  // a grown cutter does carve: samples of piece 0 inside it fade out
  const grown = prepare(normCollage({ pieces: [{ f: parse(SIERPINSKI) }, { f: parse(POINT), place: { tx: 1, ty: 1, tz: 1, g: 0.8 } }], joins: [{ op: 'sub', k: 'hard' }] }));
  const kept = collagePush(grown, 300);
  assert.ok(kept.length > 50 && kept.every((q) => Math.hypot(q.p[0] - 1, q.p[1] - 1, q.p[2] - 1) >= 0.8 - 1e-9));
});

test('colour: the collage shade wins; otherwise the pieces blend by their shares', () => {
  const red = { nodes: [{ id: 'c', type: 'col' }, { id: 'r', type: 'ramp', in: { v: 'c' }, p: { stops: [{ t: 0, c: [1, 0, 0, 1] }, { t: 1, c: [1, 0, 0, 1] }] } }], out: { color: 'r' } };
  const blue = JSON.parse(JSON.stringify(red).replaceAll('[1,0,0,1]', '[0,0,1,1]'));
  const c = prepare(normCollage({ pieces: [{ f: { ...parse(POINT), shade: red }, place: { tx: -1 } }, { f: { ...parse(POINT), shade: blue }, place: { tx: 1 } }], joins: [{ r: 0.4 }] }));
  const mid = collageColour(c, collageAt(c, [0, 0.5, 0]), [{}, {}]);
  assert.ok(near(mid[0], 0.5) && near(mid[2], 0.5));
  const side = collageColour(c, collageAt(c, [-1.1, 0, 0]), [{}, {}]);
  assert.deepEqual(side.map((v) => +v.toFixed(9)), [1, 0, 0, 1]);
  // no shade on a piece: the caller's colour for it
  const plain = prepare(collageOf(parse(POINT), parse(POINT), { r: 0.4 }, { tx: -1 }, { tx: 1 }));
  assert.ok(near(collageColour(plain, collageAt(plain, [0, 0.5, 0]), [{}, {}], (i) => [i, 0, 0, 1])[0], 0.5));
  // the collage's shade, read with the shares' readings
  const own = prepare({ ...c, shade: defaultShade() });
  assert.equal(collageColour(own, collageAt(own, [0, 0.5, 0]), [{ col: 0.2 }, { col: 0.6 }]).length, 4);
});

test('notation: round trips, hash, URL; one parser for formulas and collages', () => {
  const texts = [
    '{ bulb 8 · +c ×10 } at .7 0 0 ∪ .3 { fold.box 1 · fold.sphere .5 1 · scale 2.5 · +c ×12 bail=100 } at -.7 0 0 size .1',
    '{ abs · sort · scale 3 · translate -2 -2 · fold.plane 0 0 -1 -1 ×8 bail=50 } polar 6 1.5 ∖ stairs .2 5 { bulb 8 · +c ×10 } turn 0 45 grid 2 0 2 3 0 1',
    '{ [bulb 8 · +c ‖ bulb 3 · +c] tissue 6 ×10 } mirror xz 1 .5 ~ .3 { quat · +c ×12 slice=.3,10,0,20 } polar 4 1 z ∩ hard { bulb 8 · +c ×10 } size 2',
    '{ bulb 8 · +c ×10 } ∪ exp .1 { bulb 3 · +c ×10 } grow .05 ∪ circ .2 { bulb 4 · +c ×10 } ∪ chamfer .05 { bulb 5 · +c ×10 }',
    '{ bulb 8 · +c ×10 }',
  ];
  for (const t of texts) {
    const c = parseCollage(t);
    assert.ok(validateCollage(c).ok, validateCollage(c).errors.join('; '));
    const again = parseCollage(formatCollage(c));
    assert.equal(formatCollage(again), formatCollage(c));
    assert.equal(hashCollage(again), hashCollage(c));
    assert.deepEqual(JSON.parse(JSON.stringify(normCollage(again))), JSON.parse(JSON.stringify(normCollage(c))));
    assert.equal(hashCollage(fromURLHashAny(collageToURLHash(c))), hashCollage(c));
  }
  // ASCII words, and the drive/shade tail
  const words = parseCollage('{ bulb 8 · +c ×10 } union cubic .2 { bulb 3 · +c ×10 } \\ .1 { bulb 2 · +c ×4 } morph .4 { bulb 5 · +c ×10 }');
  assert.deepEqual(normCollage(words).joins.map((j) => j.op), ['union', 'sub', 'morph']);
  const withDrive = { ...parseCollage(texts[0]), drive: { nodes: [{ id: 'n', type: 'noise' }], bind: [{ to: 'J0.r', from: 'n', lo: 0, hi: 0.5 }] }, shade: defaultShade() };
  const back = parseCollage(formatCollage(withDrive));
  assert.equal(hashCollage(back), hashCollage(withDrive));
  assert.ok(isCollage(parseAny(texts[0])) && !isCollage(parseAny(BULB)));
  assert.equal(formatAny(parse(BULB)), formatAny(parseAny(BULB)));
  // irrelevant numbers do not change the id
  assert.equal(hashCollage(collageOf(parse(BULB), parse(BOX), { op: 'union', k: 'hard', r: 0.7 })), hashCollage(collageOf(parse(BULB), parse(BOX), { op: 'union', k: 'hard' })));
  for (const bad of ['bulb 8 ×10', '{ bulb 8 ×10 } { bulb 3 ×10 }', '{ bulb 8 ×10 } ∪ .2', '{ bulb 8 ×10 } at 1 ∪ ∩ { bulb 3 ×10 }', '{ bulb 8 { bulb 3 } }', '{ bulb 8 ×10 } frob']) {
    assert.throws(() => parseCollage(bad), bad);
  }
});

test('edits: pieces and joins by id, the drive follows', () => {
  const drive = { nodes: [{ id: 'x', type: 'x' }, { id: 'q', type: 'param', p: { of: 'P1.tx' } }], bind: [{ to: 'J0.r', from: 'x', lo: 0, hi: 0.4 }, { to: 'P1.ty', from: 'q', lo: 0, hi: 1 }, { to: 'J1.w', from: 'x', lo: 0, hi: 1 }] };
  let c = normCollage({ ...parseCollage('{ bulb 8 · +c ×10 } ∪ .2 { bulb 3 · +c ×10 } at 1 ~ .5 { bulb 4 · +c ×10 } at 2'), drive });
  assert.ok(validateCollage(c).ok, validateCollage(c).errors.join('; '));
  const t = E.collageTree(c);
  assert.deepEqual(t.pieces.map((p) => p.id), ['P0', 'P1', 'P2']);
  assert.deepEqual(t.joins.map((j) => [j.id, j.a, j.b]), [['J0', 'P0', 'P1'], ['J1', 'J0', 'P2']]);
  assert.deepEqual(E.joinPorts(t.joins[1]).map((p) => p.name), ['a', 'b', 'd', 'w']);
  // a piece added first: everything shifts
  const added = E.addPiece(c, parse(BOX), 0, { op: 'inter', k: 'exp', r: 0.1 });
  assert.equal(added.pieces.length, 4);
  assert.deepEqual(added.drive.bind.map((b) => b.to), ['J1.r', 'J2.w', 'P2.ty']);
  assert.equal(added.drive.nodes[1].p.of, 'P2.tx');
  assert.equal(added.joins[0].op, 'inter');
  // piece 1 removed: its bindings and the join before it go; the param node reading it becomes its value
  const removed = E.removePiece(c, 1);
  assert.equal(removed.pieces.length, 2);
  assert.deepEqual(removed.joins.map((j) => j.op), ['morph']);
  assert.deepEqual(removed.drive.bind.map((b) => b.to), ['J0.w']);
  assert.deepEqual(removed.drive.nodes[1], { id: 'q', in: {}, p: { c: 1, op: 'add' }, type: 'math' });
  assert.throws(() => E.removePiece(normCollage({ pieces: [{ f: parse(BULB) }], joins: [] }), 0));
  // moved: bindings follow the piece, joins stay
  const moved = E.movePiece(c, 1, 2);
  assert.deepEqual(moved.pieces.map((p) => p.place.tx), [0, 2, 1]);
  assert.ok(moved.drive.bind.some((b) => b.to === 'P2.ty') && moved.drive.nodes[1].p.of === 'P2.tx');
  // a piece edited by any graph edit
  const edited = E.editPiece(c, 1, (f) => insert(f, 'A', 0, 'abs'));
  assert.equal(edited.pieces[1].f.slots[0][0].op, 'abs');
  // joins and numbers, clamped
  assert.equal(E.setJoinParam(c, 0, 'r', 99).joins[0].r, 16);
  assert.equal(E.setJoin(c, 0, { k: 'stairs' }).joins[0].k, 'stairs');
  assert.equal(E.setPlace(c, 2, 's', 0).pieces[2].place.s, 1e-3);
  const rep = E.setRep(c, 1, 'grid', { cx: 2 });
  assert.equal(rep.pieces[1].rep.cx, 2);
  assert.equal(E.setRepParam(rep, 1, 'nx', 3.6).pieces[1].rep.nx, 4);
  const bound = E.bindCollage(rep, 'P1.cx', 'x', 1, 3);
  assert.ok(bound.drive.bind.some((b) => b.to === 'P1.cx'));
  // the repetition gone: its binding goes too
  assert.ok(!E.setRep(bound, 1, null).drive.bind.some((b) => b.to === 'P1.cx'));
  assert.throws(() => E.bindCollage(c, 'J0.n', 'x'));
  assert.deepEqual(E.unbindCollage(c, 'J0.r').drive.bind.map((b) => b.to), ['J1.w', 'P1.ty']);
  // parameters for breeding and the grab
  const ps = E.collageParams(c).map((p) => p.ref);
  assert.ok(ps.includes('P0.tx') && ps.includes('J0.r') && ps.includes('J1.w') && !ps.includes('J1.r'));
  assert.equal(E.getCollageParam(E.setCollageParam(c, 'J0.r', 0.33), 'J0.r'), 0.33);
});
