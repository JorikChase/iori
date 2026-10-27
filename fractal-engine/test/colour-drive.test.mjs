// C1: drivers → colour — the shading reads the drivers ('d:' inputs), binds its parameters to them
// (shade.bind), turns its ramps around the hue ring (map.hue) and pulses its glow (out.gain).
// Run: node --test fractal-engine/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, normalize, format, hash, iterate, validate, evalShade, normShade, defaultShade, packShade } from '../core/index.js';
import { rgb2oklab, rampAt, shadeTarget, SH_BINDS_AT } from '../core/shade.js';
import { timeDriven, driveRuns } from '../core/drive.js';
import * as G from '../core/graph.js';
import * as DE from '../core/drive-edit.js';
import * as SE from '../core/shade-edit.js';
import { pack, drives, shapes, FLAG_DRIVE, SHADE_AT } from '../gpu/pack.js';

const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const STOPS = [{ t: 0, c: [0.1, 0.2, 0.7, 1] }, { t: 0.4, c: [0.9, 0.3, 0.2, 1] }, { t: 1, c: [1, 0.9, 0.5, 1] }];
const ramp = (v, map = {}) => ({ id: 'r', type: 'ramp', in: { v }, p: { stops: STOPS, interp: 'linear', space: 'oklab', map: { scale: 1, offset: 0, mode: 'clamp', ...map } } });

// a box whose colour reads a noise driver, a time driver and the iteration — nothing bound to the shape
function colourFormula() {
  const f = normalize(parse('fold.box 1 · fold.sphere .5 1 · scale 2 · +c ×8 bail=64'));
  f.drive = { nodes: [{ id: 'n0', type: 'noise', p: { f: 1.5, g: 1 } }, { id: 't0', type: 'time', p: { rate: 0.5, wave: 'saw' } }, { id: 'i0', type: 'i' }], bind: [] };
  f.shade = {
    nodes: [{ id: 'col', type: 'col' }, ramp('d:n0'), { id: 'm', type: 'math', in: { a: 'col', b: 'd:i0' }, p: { op: 'add' } }],
    out: { color: 'r', glow: 'm' },
    bind: [{ to: 'r.map.hue', from: 't0', lo: 0, hi: 1 }, { to: 'r.stops.1.t', from: 'i0', lo: 0.2, hi: 0.6 }, { to: 'out.gain', from: 'n0', lo: 0.5, hi: 2 }],
  };
  return normalize(f);
}

test('colour drivers: the notation, the hash, validation; an undriven shading keeps its form', () => {
  const f = colourFormula();
  assert.ok(validate(f).ok, validate(f).errors.join('; '));
  const g = normalize(parse(format(f)));
  assert.deepEqual(g.shade, f.shade);
  assert.equal(hash(g), hash(f));
  // no new keys on a shading that uses none of it (old formulas keep their ids)
  const d = normShade(defaultShade());
  assert.ok(!('bind' in d) && !('gain' in d.out) && !('hue' in d.nodes[1].p.map));
  // a link or binding to a driver that is not there is refused, and so are colours from a driver
  assert.ok(!validate({ ...f, shade: { ...f.shade, nodes: [{ id: 'col', type: 'col' }, ramp('d:nope')] } }).ok);
  assert.ok(!validate({ ...f, shade: { ...f.shade, bind: [{ to: 'r.map.scale', from: 'nope', lo: 0, hi: 1 }] } }).ok);
  assert.ok(!validate({ ...f, shade: { ...f.shade, bind: [{ to: 'r.interp', from: 'n0', lo: 0, hi: 1 }] } }).ok);
  assert.ok(!validate({ ...f, shade: { nodes: [{ id: 'col', type: 'col' }, ramp('col'), { id: 'x', type: 'mixc', in: { a: 'd:n0', b: 'r' } }], out: { color: 'x' } } }).ok);
  // the drive program runs for the colour alone; the shape is not driven
  assert.ok(driveRuns(f) && drives(f) && !shapes(f));
  assert.ok(timeDriven(f));
  assert.ok(!timeDriven({ ...f, shade: undefined }));
});

test('colour drivers: evalShade reads drivers and bindings; the hue turn keeps lightness', () => {
  const s = { nodes: [{ id: 'col', type: 'col' }, ramp('d:x')], out: { color: 'r' } };
  const plain = { nodes: [{ id: 'col', type: 'col' }, ramp('col')], out: { color: 'r' } };
  for (const v of [0, 0.13, 0.4, 0.77, 1]) assert.deepEqual(evalShade(s, {}, { x: v }).color, evalShade(plain, { col: v }).color);
  assert.deepEqual(evalShade(s, {}, new Map([['x', 0.3]])).color, evalShade(plain, { col: 0.3 }).color);
  // a bound offset is the offset written in
  const b = { ...plain, bind: [{ to: 'r.map.offset', from: 'y', lo: -0.2, hi: 0.4 }] };
  const want = { nodes: [{ id: 'col', type: 'col' }, ramp('col', { offset: -0.2 + 0.25 * 0.6 })], out: { color: 'r' } };
  assert.ok(evalShade(b, { col: 0.3 }, { y: 0.25 }).color.every((c, i) => near(c, evalShade(want, { col: 0.3 }).color[i])));
  // a driven stop stays between its neighbours
  const st = { ...plain, bind: [{ to: 'r.stops.1.t', from: 'y', lo: 0, hi: 2 }] };
  const top = { nodes: [{ id: 'col', type: 'col' }, { ...ramp('col'), p: { ...ramp('col').p, stops: [STOPS[0], { ...STOPS[1], t: 1 }, STOPS[2]] } }], out: { color: 'r' } };
  assert.deepEqual(evalShade(st, { col: 0.7 }, { y: 1 }).color, evalShade(top, { col: 0.7 }).color);
  assert.deepEqual(shadeTarget(normShade(st), 'r.stops.1.t').max, 1);
  // the hue: a turn moves the colour, a whole turn does not, lightness stays (in gamut)
  const p = normShade(plain).nodes[1].p, x = 0.55;
  const c0 = rampAt(p, x), h = rampAt({ ...p, map: { ...p.map, hue: 0.1 } }, x), h1 = rampAt({ ...p, map: { ...p.map, hue: 1 } }, x);
  assert.ok(Math.max(...c0.map((c, i) => Math.abs(c - h[i]))) > 0.02);
  assert.ok(c0.every((c, i) => near(c, h1[i], 1e-6)));
  assert.ok(near(rgb2oklab(c0)[0], rgb2oklab(h)[0], 0.02));
  // the glow's gain: its own value, then driven
  assert.equal(evalShade({ ...plain, out: { color: 'r', gain: 3 } }, {}).gain, 3);
  assert.equal(evalShade({ ...plain, bind: [{ to: 'out.gain', from: 'y', lo: 1, hi: 3 }] }, {}, { y: 0.5 }).gain, 2);
});

test('colour drivers: the orbit leaves the drivers\' registers for the hit, and its own path alone', () => {
  const f = colourFormula(), bare = normalize({ ...f, drive: undefined, shade: undefined });
  for (const p of [[0.3, 0.2, 0.1], [-0.6, 0.4, 0.5], [1.2, -0.9, 0.3]]) {
    const o = iterate(f, p, undefined, { time: 0.7 }), u = iterate(bare, p);
    assert.deepEqual(o.points, u.points);
    assert.ok(!('drv' in u));
    // the iteration reading at the last fill (the start of the last iteration)
    assert.equal(o.drv.get('i0'), (o.n - 1) / f.iters);
    assert.ok(near(o.drv.get('t0'), (0.7 * 0.5) % 1, 1e-12));
    // and the colour from them
    const c = evalShade(f.shade, { col: 0.2 }, o.drv);
    assert.equal(c.color.length, 4);
    assert.ok(near(c.gain, Math.min(16, Math.max(0, 0.5 + o.drv.get('n0') * 1.5)), 1e-12));
  }
});

test('colour drivers: edits — links, bindings, stops that move, drivers removed', () => {
  let f = normalize(parse('bulb 8 · +c ×6'));
  f = SE.shadeOn(f);
  f = DE.addDriver(f, 'noise');
  f = DE.addDriver(f, 'remap', null);   // reads a fresh i0
  const r = f.shade.nodes.find((n) => n.type === 'ramp').id;
  f = SE.linkDriver(f, 'remap0', r, 'v');
  assert.equal(f.shade.nodes.find((n) => n.id === r).in.v, 'd:remap0');
  assert.throws(() => SE.linkDriver(f, 'nope', r, 'v'));
  assert.ok(SE.shadeBindables(f, r).includes(`${r}.map.hue`));
  f = SE.bindShade(f, `${r}.map.hue`, 'noise0', 0, 0.5);
  f = SE.bindShade(f, `${r}.stops.2.t`, 'i0', 0.1, 0.3);
  f = SE.setShadeBand(f, `${r}.map.hue`, -0.25, 0.25);
  assert.deepEqual(f.shade.bind.find((b) => b.to === `${r}.map.hue`), { from: 'noise0', hi: 0.25, lo: -0.25, to: `${r}.map.hue` });
  // stop 2 moved past stop 0: its binding follows it to its new place
  const t2 = f.shade.nodes.find((n) => n.id === r).p.stops[2];
  f = SE.moveStop(f, r, 2, 0);
  const now = f.shade.nodes.find((n) => n.id === r).p.stops.findIndex((q) => q.c.every((x, i) => x === t2.c[i]));
  assert.ok(f.shade.bind.some((b) => b.to === `${r}.stops.${now}.t`));
  f = SE.removeStop(f, r, now);
  assert.ok(!f.shade.bind.some((b) => b.to.includes('.stops.')));
  // a remap between a shading binding and its driver (the hold ring on the binding's hairline)
  const h = DE.addDriver(f, 'remap', { bind: `${r}.map.hue` });
  assert.equal(h.shade.bind.find((b) => b.to === `${r}.map.hue`).from, 'remap1');
  assert.equal(h.drive.nodes.find((m) => m.id === 'remap1').in.a, 'noise0');
  f = SE.setGain(f, 2.5);
  assert.equal(f.shade.out.gain, 2.5);
  f = SE.bindShade(f, 'out.gain', 'noise0', 0.5, 3);
  // the remap removed: the ramp reads what the remap read (a bypass), as the lane does
  f = DE.removeDriverNode(f, 'remap0');
  assert.equal(f.shade.nodes.find((n) => n.id === r).in.v, 'd:i0');
  // noise removed: its bindings go
  f = G.removeDriver(f, 'noise0');
  assert.ok(!(f.shade.bind || []).some((b) => b.from === 'noise0'));
  // the last driver removed: the ramp's required input falls back to the fold index
  f = DE.removeDriverNode(f, 'i0');
  assert.ok(!f.drive);
  const v = f.shade.nodes.find((n) => n.id === r).in.v;
  assert.equal(f.shade.nodes.find((n) => n.id === v).type, 'col');
  assert.ok(validate(f).ok);
  // a ramp removed takes its bindings along
  let g = colourFormula();
  g = SE.removeNode(SE.addNode(g, 'ramp', { node: 'out', port: 'color' }), 'r');
  assert.ok(!(g.shade.bind || []).some((b) => b.to.startsWith('r.')));
});

test('colour drivers: the GPU program — the flag, driver inputs, the bindings table', () => {
  const f = colourFormula();
  const pk = pack(f);
  const flags = new Uint32Array(pk.head)[2];
  assert.ok(flags & FLAG_DRIVE);
  const prog = packShade(f.shade, f.drive);
  assert.deepEqual([...prog.slice(4, 6)], [1, 3]);                 // gain own value, three bindings
  // the ramp (node 1) reads driver n0 (index 0) as −2 − 0
  const r = f.shade.nodes.findIndex((n) => n.id === 'r');
  assert.equal(prog[(2 + r * 4) * 4 + 1], -2);
  // the bindings, sorted by target: out.gain, r.map.hue, r.stops.1.t
  const B = (k) => [...prog.slice((SH_BINDS_AT + k * 2) * 4, (SH_BINDS_AT + k * 2) * 4 + 8)];
  assert.deepEqual(B(0).slice(0, 3), [-1, 6, 0]);
  assert.deepEqual(B(1).slice(0, 3), [r, 2, 1]);
  assert.deepEqual(B(2).slice(0, 4), [r, 3, 2, 1]);
  assert.deepEqual(B(2).slice(4), [0.20000000298023224, 0.6000000238418579, 0, 1]);
  // the same in the ops buffer, and the shading of an undriven formula as before (no drive flag)
  assert.deepEqual([...pk.ops.slice(SHADE_AT, SHADE_AT + 8)], [...prog.slice(0, 8)]);
  assert.ok(!(new Uint32Array(pack({ ...f, drive: undefined, shade: defaultShade() }).head)[2] & FLAG_DRIVE));
});
