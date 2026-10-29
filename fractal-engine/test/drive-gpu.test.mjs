// V2: the drivers on the GPU side — the packed drive program, the parameter-tangent rows, the JIT, and
// the step factor validated against a brute-force CPU march (core/cpu.js de).
// Run: node --test fractal-engine/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, normalize, de, makeRng, evalDrive, validateDrive } from '../core/index.js';
import { pack, paramTangents, DRIVE_AT, OPS_FLOATS, FLAG_DRIVE, CLOCK_WORD, STEP_WORD, NO_OP, DRIVE_TYPE, driveBinds } from '../gpu/pack.js';
import { jitIterate, structureKey } from '../gpu/jit.js';
import { withDrive, INTERP } from '../gpu/wgsl.js';
import { DRIVEN, DRIVEN_INV } from './driven-cases.js';

const n = (id, type, p = {}, inn = {}) => ({ id, type, p, in: inn });
const BOX = 'fold.box 1 · fold.sphere .5 1 · scale 2.5 · +c ×12 bail=100';
const withDriveF = (text, nodes, bind) => normalize({ ...parse(text), drive: { nodes, bind } });

test('drive program: packed after the shading program, the flag, the clock and step words', () => {
  const plain = pack(parse(BOX));
  assert.equal(new Uint32Array(plain.head)[2] & FLAG_DRIVE, 0);
  assert.ok(plain.ops.slice(DRIVE_AT).every((x) => x === 0));
  assert.equal(new Float32Array(plain.head)[STEP_WORD], 1);
  assert.equal(new Float32Array(plain.head)[CLOCK_WORD], 0);
  assert.equal(plain.ops.length, OPS_FLOATS);

  const f = withDriveF(BOX, [n('nz', 'noise', { f: 0.7 }), n('r', 'r'), n('m', 'math', { op: 'min', c: 2 }, { a: 'r' })],
    [{ to: 'A2.s', from: 'nz', lo: 2.2, hi: 2.8 }, { to: 'A0.l', from: 'm', lo: 0.8, hi: 1 }]);
  const pk = pack(f), o = pk.ops, at = DRIVE_AT;
  assert.ok(new Uint32Array(pk.head)[2] & FLAG_DRIVE);
  assert.deepEqual([...o.slice(at, at + 4)], [3, 2, 1, 0]);          // nodes, bindings, live
  assert.equal(o[at + 4], 0b101);                                     // ops 0 and 2 are driven
  // nodes: [type, a, b, per-iteration]
  assert.deepEqual([...o.slice(at + 8, at + 12)], [DRIVE_TYPE.noise, -1, -1, 0]);
  assert.deepEqual([...o.slice(at + 20, at + 24)], [DRIVE_TYPE.r, -1, -1, 1]);
  assert.deepEqual([...o.slice(at + 32, at + 36)], [DRIVE_TYPE.math, 1, -1, 1]);
  // bindings, sorted by target: A0.l (op 0, node m), then A2.s (op 2, node nz); the record derivative
  const b0 = at + (2 + 96) * 4, b1 = b0 + 40;
  assert.deepEqual([...o.slice(b0, b0 + 4)].map((x) => +x.toFixed(4)), [0, 2, 0.8, 1]);
  assert.deepEqual([...o.slice(b1, b1 + 4)].map((x) => +x.toFixed(4)), [2, 0, 2.2, 2.8]);
  assert.ok(Math.abs(o[b1 + 12 + 1] - 1) < 1e-6, 'scale s sits in record float 1');
  assert.equal(o[b1 + 7], 0, 'scale is rebuilt-free (mode 0)');

  // a rotation and a plane fold carry their raw parameters and slots instead
  const g = normalize(parse(DRIVEN[2][0]));
  const gp = pack(g).ops, bs = driveBinds(g);
  const k = bs.findIndex((x) => x.b.to === 'A0.y'), ob = at + (2 + 96 + k * 10) * 4;
  assert.equal(gp[ob + 7], 1);
  assert.deepEqual([...gp.slice(ob + 8, ob + 11)], [1, 0, k === 0 ? 0 : 1]);
  assert.deepEqual([...gp.slice(ob + 32, ob + 35)], [10, 20, 30]);
});

test('parameter tangents: bound parameters left out, the drivers\' parameters and the frozen row in', () => {
  const f = normalize(parse(DRIVEN[1][0]));
  const { list, buf } = paramTangents(f, { frozen: true });
  assert.ok(!list.some((t) => t.oi === 2 && t.key === 's'), 'the bound scale is not sensed');
  assert.ok(list.some((t) => t.oi === 1 && t.key === 'rmin'));
  const refs = list.filter((t) => t.drive).map((t) => t.drive);
  assert.ok(refs.includes('bind/A2.s/lo') && refs.includes('bind/A0.l/hi') && refs.includes('node/nz/f') && refs.includes('node/m/c'));
  const last = list[list.length - 1];
  assert.ok(last.frozen);
  const row = (i) => [...buf.slice(i * 24, i * 24 + 4)];
  assert.deepEqual(row(list.length - 1), [NO_OP, 4, 0, 0]);
  const j = list.findIndex((t) => t.drive === 'node/nz/f');
  assert.deepEqual(row(j), [NO_OP, 3, 0, 0]);
  // an op row: [op, 0, 0, the parameter's place among the op's]
  const r = list.findIndex((t) => t.oi === 1 && t.key === 'rfix');
  assert.deepEqual(row(r), [1, 0, 0, 1]);
  // without drivers nothing changes: no driver rows, no frozen row
  const plain = paramTangents(parse(BOX), { frozen: true }).list;
  assert.ok(plain.every((t) => t.drec));
});

test('every driven case validates, packs and gets a JIT that starts each iteration with its drivers', () => {
  for (const [text] of [...DRIVEN, ...DRIVEN_INV]) {
    const f = normalize(parse(text));
    assert.deepEqual(validateDrive(f.drive, f), []);
    pack(f);
    // the drive program inline (its bindings' registers dv…), or the interpreter's driveIter where a
    // binding rebuilds a rotation or a plane fold, or sets a chimera's field
    const starts = /driveIter\(p, t\.dr, i|if \(i == 0u\) \{[^]*?dv0 = clamp/;
    assert.match(jitIterate(f), starts);
    assert.match(jitIterate(f, 'structure'), starts);
  }
  assert.doesNotMatch(jitIterate(parse(BOX)), /driveIter|dv0/);
  // the inlined program is part of the structure: another wiring is another structure JIT
  const g = normalize(parse(DRIVEN[1][0]));
  assert.notEqual(structureKey(g), structureKey({ ...g, drive: { ...g.drive, bind: g.drive.bind.slice(1) } }));
  // a structure JIT compiled for an undriven formula is not reused for a driven one
  assert.notEqual(structureKey(parse(BOX)), structureKey(normalize(parse(DRIVEN[1][0]))));
  // the variant switch
  assert.match(INTERP, /const DRIVE_ON = false;/);
  assert.match(withDrive(INTERP), /const DRIVE_ON = true;/);
  // too many rebuilt ops for the GPU are refused by validation
  const many = withDriveF('rotate 1 2 3 · rotate 1 2 3 · rotate 1 2 3 · rotate 1 2 3 · rotate 1 2 3 ×4', [n('i', 'i')],
    [0, 1, 2, 3, 4].map((k) => ({ to: `A${k}.x`, from: 'i', lo: 0, hi: 10 })));
  assert.ok(validateDrive(many.drive, many).some((e) => /four driven rotations/.test(e)));
});

// The step factor (gpu/sense.js): L = |∇DE| / |∇DE with the drivers held| at the hits, the march's steps
// divided by its 90th percentile. A noise-driven Mandelbox scale against a brute-force march (steps of
// 5 % of the estimate): the plain march oversteps a fifth of its rays, the march with 1 / L none.
test('step factor: dividing the march by L recovers the brute-force hits of a steep driven formula', () => {
  const f = withDriveF(BOX, [n('nz', 'noise', { f: 1, g: 1 })], [{ to: 'A2.s', from: 'nz', lo: 2.3, hi: 2.7 }]);
  const held = (x) => {
    const v = evalDrive(f.drive, { start: [...x, 0] }).values[0];
    const g = JSON.parse(JSON.stringify(f));
    delete g.drive;
    g.slots[0][2].p.s = v;
    return normalize(g);
  };
  const grad = (F, x, h = 1e-5) => Math.hypot(...[0, 1, 2].map((i) => { const a = [...x], b = [...x]; a[i] += h; b[i] -= h; return (de(F, a) - de(F, b)) / (2 * h); }));
  const cam = [0, 0, 6], rng = makeRng(4);
  const march = (step, d) => {
    let t = 0;
    for (let i = 0; i < 3000; i++) {
      const e = de(f, cam.map((v, k) => v + d[k] * t));
      if (e < 1e-4 * (1 + t)) return t;
      t += e * step;
      if (t > 12) return Infinity;
    }
    return t;
  };
  const rays = Array.from({ length: 48 }, () => { const d = [(rng.float() * 2 - 1) * 0.5, (rng.float() * 2 - 1) * 0.5, -1]; const l = Math.hypot(...d); return d.map((x) => x / l); });
  const brute = rays.map((d) => march(0.05, d));
  const naive = rays.map((d) => march(1, d));
  const Ls = [];
  rays.forEach((d, i) => {
    if (!Number.isFinite(naive[i])) return;
    const x = cam.map((v, k) => v + d[k] * naive[i]);
    const g = grad(f, x), g0 = grad(held(x), x);
    if (g > 0 && g0 > 0) Ls.push(Math.max(1, g / g0));
  });
  Ls.sort((a, b) => a - b);
  const L = Ls[Math.floor(Ls.length * 0.9)];
  const safe = rays.map((d) => march(1 / L, d));
  const off = (a) => a.filter((t, i) => (Number.isFinite(brute[i]) ? !(Math.abs(t - brute[i]) < 0.02) : Number.isFinite(t))).length;
  assert.ok(L > 1.3 && L < 4, `L ${L}`);
  assert.ok(off(naive) >= 4, `the plain march oversteps (${off(naive)} rays)`);
  assert.equal(off(safe), 0);
});
