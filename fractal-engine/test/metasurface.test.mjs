// The Metasurface's sites: dropped formulas (chimeras too), moved and removed sites, the stored layout,
// the soft walls. Run: node --test fractal-engine/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, format, normalize, validate, de } from '../core/index.js';
import * as M from '../core/metasurface.js';
import { PRESETS } from '../core/presets.js';

const same = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
const CHIMERA = '[fold.box 1 · scale 2 ‖ bulb 8] noise .5 1 · +c ×10';

const nearest = (S, s) => S.sites.filter((t) => t !== s).sort((a, b) => Math.hypot(a.at[0] - s.at[0], a.at[1] - s.at[1]) - Math.hypot(b.at[0] - s.at[0], b.at[1] - s.at[1]))[0];

test('a dropped chimera is a hard site: whole in its cell, a cut at its wall, drawn hard', () => {
  const S = M.createSurface();
  const f = normalize(parse(CHIMERA));
  const s = M.addSite(S, { f, view: 4, axes: [], at: [0.05, 0.05] });
  assert.ok(s && s.user && s.hard);
  const nb = nearest(S, s), u = [nb.at[0] - s.at[0], nb.at[1] - s.at[1]];
  // the whole cell, right up to the bisector, is the chimera; just past it, the neighbour alone
  for (const t of [0, 0.3, 0.499]) assert.ok(same(M.formulaAt(S, [s.at[0] + t * u[0], s.at[1] + t * u[1]]).f, f), `t ${t}`);
  const past = M.formulaAt(S, [s.at[0] + 0.501 * u[0], s.at[1] + 0.501 * u[1]]);
  assert.ok(validate(past.f).ok);
  assert.ok(!past.species.some((e) => e.sites.includes(S.sites.indexOf(s))));
  // its walls are hard edges, and no soft band enters its cell
  const walls = M.hardWalls(S);
  assert.ok(walls.length >= 3);
  const mid = [s.at[0] + 0.5 * u[0], s.at[1] + 0.5 * u[1]];
  assert.ok(walls.some((g) => Math.abs((g[2] - g[0]) * (mid[1] - g[1]) - (g[3] - g[1]) * (mid[0] - g[0])) < 1e-9));
  for (const { segs } of M.wallBands(S, 120)) for (const g of segs) assert.ok(Math.hypot(g[0] - s.at[0], g[1] - s.at[1]) > 0.05);
  // a stroke through it lays its first species in its place
  const sf = M.strokeField(S, [s.at, nb.at], [1, 0, 0], 4);
  assert.ok(validate(sf.f).ok, validate(sf.f).errors.join('; '));
  assert.equal(sf.f.slots[1].map((o) => o.op).join(), 'fold.box,scale,+c');
});

test('a constant-weight chimera stays soft: its species join the wall\'s blend, continuously', () => {
  const S = M.createSurface();
  const f = normalize(parse('[fold.box 1 · fold.sphere .5 1 · scale 2.5 · +c ‖ bulb 8 · +c] blend 3 1 ×10 bail=8'));
  const s = M.addSite(S, { f, view: 4, axes: [], at: [0.05, 0.05] });
  assert.ok(!s.hard);
  assert.ok(same(M.formulaAt(S, s.at).f, f));
  const nb = nearest(S, s);
  const mid = [(s.at[0] + nb.at[0]) / 2, (s.at[1] + nb.at[1]) / 2];
  const m = M.formulaAt(S, mid).f;
  assert.ok(validate(m).ok, validate(m).errors.join('; '));
  assert.equal(m.slots[0][0].op, 'mix.blend');
  // its two species at its own 3 : 1, beside the neighbours'
  const K = ['a', 'b', 'c', 'd', 'e', 'f', 'h'], wOf = (op) => m.slots[0][0].p[K[m.slots.slice(1).findIndex((sl) => sl[0].op === op && sl.length === (op === 'bulb' ? 2 : 4))]];
  assert.ok(m.slots[0][0].p.s >= 3);
  assert.ok(Math.abs(wOf('fold.box') / wOf('bulb') - 3) < 0.01, format(m));
  const p = [0.3, 0.2, -0.4];
  let prev = null;
  for (let t = -0.06; t <= 0.06; t += 0.004) {
    const x = [mid[0] + t * (nb.at[0] - s.at[0]), mid[1] + t * (nb.at[1] - s.at[1])];
    const d = de(M.formulaAt(S, x).f, p);
    if (prev !== null) assert.ok(Math.abs(d - prev) < 0.08, `jump ${prev} → ${d} at ${t}`);
    prev = d;
  }
});

test('a site of a family\'s structure blends with it by parameters; a schedule unrolls, a fixed c becomes a translate', () => {
  const S = M.createSurface();
  const bulb = S.sites.find((t) => t.id === 'mandelbulb');
  const s = M.addSite(S, { f: parse('bulb 4 · +c ×10 bail=4'), view: 2.6, axes: [], at: [bulb.at[0], bulb.at[1] + 0.1] });
  const mid = M.formulaAt(S, [bulb.at[0], bulb.at[1] + 0.05]).f;
  assert.equal(mid.slots.length, 1);
  assert.ok(Math.abs(mid.slots[0][0].p.n - 6) < 1e-6, `n ${mid.slots[0][0].p.n}`);
  assert.ok(s.key === bulb.key);
  const ch = M.asChain(parse('abs · scale 2 | bulb 8 · +c ×9 AAB c=.1,.2,.3'));
  assert.deepEqual(ch.nodes.map((n) => n.op), ['abs', 'scale', 'abs', 'scale', 'bulb', 'translate']);
  assert.equal(ch.iters, 3);
  assert.deepEqual(ch.nodes[5].p, { x: 0.1, y: 0.2, z: 0.3, w: 0 });
  // a hybrid site beside a family: valid at the wall
  const h = M.addSite(S, { f: parse('abs · scale 2 · + -1 -1 -1 | bulb 8 · +c ×9 AAB'), view: 3, axes: [], at: [0, -0.2] });
  const nb = S.sites.find((t) => t.id === 'sierpinski');
  const w = M.formulaAt(S, [(h.at[0] + nb.at[0]) / 2, (h.at[1] + nb.at[1]) / 2]).f;
  assert.ok(validate(w).ok, validate(w).errors.join('; '));
});

test('sites move, leave, go home; the layout round-trips through storage; the surface holds 24', () => {
  const S = M.createSurface();
  assert.ok(M.isDefault(S));
  const box = S.sites.findIndex((t) => t.id === 'mandelbox');
  M.moveSite(S, box, [-0.4, 0.9]);
  assert.ok(!M.isDefault(S));
  const u = M.addSite(S, { f: parse(CHIMERA), view: 4, axes: [[1, 's', 0.5]], at: [0.9, 0.9], thumb: 'data:x' });
  const L = JSON.parse(JSON.stringify(M.layoutOf(S)));
  assert.deepEqual(L.moved, { mandelbox: [-0.4, 0.9] });
  assert.equal(L.sites.length, 1);
  const T = M.createSurface(undefined, undefined, L);
  assert.deepEqual(T.sites.find((t) => t.id === 'mandelbox').at, [-0.4, 0.9]);
  const v = T.sites.find((t) => t.user);
  assert.ok(same(v.f, u.f));
  assert.equal(v.thumb, 'data:x');
  assert.deepEqual(v.axes, [[1, 's', 0.5]]);
  // the radius follows the move
  assert.ok(Math.abs(T.sites.find((t) => t.id === 'mandelbox').R - S.sites[box].R) < 1e-12);
  // a family taken off goes home; yours is gone
  const tb = T.sites.findIndex((t) => t.id === 'mandelbox');
  assert.equal(M.removeSite(T, tb), false);
  assert.deepEqual(T.sites[tb].at, PRESETS.find((p) => p.id === 'mandelbox').at);
  assert.equal(M.removeSite(T, T.sites.indexOf(v)), true);
  assert.equal(T.sites.length, PRESETS.length);
  // reset keeps your sites
  M.resetLayout(S);
  assert.ok(M.isDefault(S));
  assert.ok(S.sites.includes(u));
  // full at 24
  while (S.sites.length < M.MAX_SITES) assert.ok(M.addSite(S, { f: parse('bulb 8 · +c ×6'), view: 2.6, at: [Math.random() * 2 - 1, Math.random() * 2 - 1] }));
  assert.equal(M.addSite(S, { f: parse('bulb 8 · +c ×6'), view: 2.6, at: [0, 0] }), null);
  // two sites in one place still breed and blend
  const Z = M.createSurface();
  const z = M.addSite(Z, { f: parse('bulb 5 · +c ×8'), view: 2, axes: [[0, 'n', 2]], at: Z.sites[0].at });
  assert.ok(z.R > 0);
  assert.ok(validate(M.formulaAt(Z, [z.at[0] + 0.01, z.at[1]]).f).ok);
  // a stroke across a chimera site lays it as a species in space
  const sf = M.strokeField(S, [S.sites[0].at, u.at], [1, 0, 0], 4);
  assert.ok(validate(sf.f).ok, validate(sf.f).errors.join('; '));
});

test('a dropped formula breeds along its two most sensed parameters', () => {
  const f = parse('fold.box 1 · fold.sphere .5 1 · scale 2.5 · +c ×12');
  const axes = M.axesFromSensed(f, [
    { oi: 0, op: 'fold.box', key: 'l', value: 1, pxPerUnit: 100 },
    { oi: 2, op: 'scale', key: 's', value: 2.5, pxPerUnit: 400 },
    { oi: 1, op: 'fold.sphere', key: 'rmin', value: 0.5, pxPerUnit: 50 },
    { oi: 9, op: 'scale', key: 's', value: 1, pxPerUnit: 999 },
    { drive: { node: 0 }, value: 1, pxPerUnit: 999 },
  ]);
  assert.deepEqual(axes, [[2, 's', 0.6], [0, 'l', 2.4]]);
  const S = M.createSurface();
  const s = M.addSite(S, { f, view: 16, axes, at: [0, 0.1] });
  const r = M.formulaAt(S, [s.at[0] + s.R * 0.5, s.at[1]]).f;
  assert.ok(Math.abs(r.slots[0][2].p.s - 2.65) < 1e-6, `s ${r.slots[0][2].p.s}`);
});

test('the walls are drawn as the soft band: contours of the leading weight sit where πⱼ says', () => {
  const S = M.createSurface([PRESETS[0], { ...PRESETS[4], at: [0.2, 0.3] }]);
  const [a, b] = S.sites.map((s) => s.at);
  const bands = M.wallBands(S, 160);
  assert.deepEqual(bands.map((x) => x.level), M.BAND_LEVELS);
  for (const { level, segs } of bands) {
    assert.ok(segs.length > 50);
    // two sites: max π = 1 / (1 + exp(−Δ/wall)), Δ = |d_a − d_b|
    const want = S.wall * Math.log(level / (1 - level));
    for (const g of segs) for (const q of [[g[0], g[1]], [g[2], g[3]]]) {
      const D = Math.abs(Math.hypot(q[0] - a[0], q[1] - a[1]) - Math.hypot(q[0] - b[0], q[1] - b[1]));
      assert.ok(Math.abs(D - want) < 0.004, `level ${level}: Δ ${D} want ${want}`);
    }
  }
});
