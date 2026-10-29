// Colour defaults (2026-10-29): a new ramp keeps the look (a copy of the ramp colouring where it lands),
// the ring's presets (core/shade.js RING_PRESETS) bring their reading, shadeOn starts as the view's colour.
// Run: node --test fractal-engine/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, format, validate, evalShade, defaultShade } from '../core/index.js';
import { RING_PRESETS, PRESET_READING, RAMP_PRESETS, validateShade, normShade, rampPreset } from '../core/shade.js';
import * as SE from '../core/shade-edit.js';

const BOX = parse('fold.box 1 · fold.sphere .5 1 · scale 2.5 · +c ×12 bail=100');
const READ = [{ col: 0.42, trap: 0.3, facing: 0.6, depth: 0.9 }, { col: 0.1, trap: 2.5, facing: 0.2, depth: 0.4 }, { col: 0.77, trap: 0.02, facing: 0.95, depth: 1 }];
const same = (a, b) => READ.every((r) => evalShade(a.shade, r).color.every((x, i) => Math.abs(x - evalShade(b.shade, r).color[i]) < 1e-9));

test('a ramp added on the colour link, or free, starts as the colour already there', () => {
  const g = SE.shadeOn(BOX);
  const a = SE.addNode(g, 'ramp', { node: 'out', port: 'color' });
  assert.equal(a.shade.out.color, 'ramp0');
  assert.ok(same(a, g));
  // behind a mix: the mix's first colour's ramp
  const m = SE.addNode(g, 'mixc', { node: 'out', port: 'color' });
  const b = SE.addNode(m, 'ramp', { node: 'out', port: 'color' });
  assert.deepEqual(b.shade.nodes.find((n) => n.id === 'ramp0').p, g.shade.nodes.find((n) => n.id === 'ramp').p);
  assert.ok(same(b, g));
  // free: a copy of the surface's ramp, so wiring it in changes nothing either
  const c = SE.addNode(SE.applyPreset(g, 'ramp', 'bone'), 'ramp');
  assert.equal(c.shade.nodes.find((n) => n.id === 'ramp0').in.v, 'trap0');
  assert.ok(same(SE.connect(c, 'ramp0', 'out', 'color'), SE.applyPreset(g, 'ramp', 'bone')));
});

test('the ring: seven presets in iori\'s order, each valid, each bringing its reading', () => {
  assert.deepEqual(RING_PRESETS, ['oil', 'malachite', 'bone', 'prism', 'strata', 'beetle', 'abyss']);
  for (const name of RING_PRESETS) {
    assert.ok(RAMP_PRESETS[name] && PRESET_READING[name], name);
    assert.equal(validateShade(normShade({ nodes: [{ id: 'c', type: 'col' }, { id: 'r', type: 'ramp', in: { v: 'c' }, p: rampPreset(name) }], out: { color: 'r' } })).length, 0, name);
  }
  const g = SE.shadeOn(BOX);
  // the reading the ramp read goes when nothing else reads it; the preset's comes in
  let s = SE.applyPreset(g, 'ramp', 'oil');
  assert.equal(s.shade.nodes.find((n) => n.id === s.shade.nodes.find((q) => q.id === 'ramp').in.v).type, 'facing');
  assert.ok(!s.shade.nodes.some((n) => n.type === 'col'));
  assert.ok(validate(s).ok);
  assert.equal(format(parse(format(s))), format(s));
  // and back: trap read by a new node, the facing one dropped
  s = SE.applyPreset(s, 'ramp', 'malachite');
  assert.deepEqual(s.shade.nodes.map((n) => n.type).sort(), ['ramp', 'trap']);
  // a reading something else reads stays
  const two = SE.connect(SE.addNode(g, 'mixc', { node: 'out', port: 'color' }), 'col', 'mixc0', 'f');
  assert.ok(SE.applyPreset(two, 'ramp', 'bone').shade.nodes.some((n) => n.type === 'col'));
  // a math (or a driver) feeding the ramp is the user's: the preset leaves the input alone
  const math = SE.addNode(g, 'math', { node: 'ramp', port: 'v' });
  assert.equal(SE.applyPreset(math, 'ramp', 'oil').shade.nodes.find((n) => n.id === 'ramp').in.v, 'math0');
  // the old presets stay (documents name them), off the ring
  for (const name of ['fire', 'ice', 'film', 'mono']) assert.ok(RAMP_PRESETS[name] && !RING_PRESETS.includes(name));
});

test('shadeOn starts as the view\'s colour', () => {
  const look = { key: [0.2, 0.6, 1], iridescence: 0.5, spread: 2, hue: 0.1 };
  assert.ok(same(SE.shadeOn(BOX, look), { shade: defaultShade(look.key, 0.5, 2, 0.1) }));
  assert.ok(!same(SE.shadeOn(BOX, look), SE.shadeOn(BOX)));
});
