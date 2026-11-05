// The lens on rotation angles and plane normals (gpu/wgsl.js lnBuild, LENS_NL): every texel rebuilds the op's
// record from its raw numbers with the angle moved. Here the rebuild, written out in JavaScript as the shader
// does it, against the record the packer writes for the formula with the value really changed; and the metric's
// side: these parameters are ranked (paramTangents gives each one its record derivative, the chain rule's first
// factor), so the grab and the lens can offer them. Run: node --test fractal-engine/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, parse } from '../core/formula.js';
import { pack, paramTangents, RAW, MODE, REC } from '../gpu/pack.js';

// gpu/wgsl.js drvGivens: rows i and j after the plane rotation by t degrees
const givens = (ri, rj, t) => {
  const r = (t * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [ri.map((v, k) => c * v - s * rj[k]), ri.map((v, k) => s * v + c * rj[k])];
};
// gpu/wgsl.js lnBuild (its first float, the op's code, left to the packed record)
function lnBuild(mode, a, b4) {
  if (mode === 3) {
    const l = Math.hypot(...a), n = l > 0 ? a.map((v) => v / l) : a;
    return [0, n[0], n[1], n[2], n[3], b4[0], 0, 0, ...Array(12).fill(0)];
  }
  let r = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  const g = (i, j, t) => { [r[i], r[j]] = givens(r[i], r[j], t); };
  if (mode === 1) { g(1, 2, a[0]); g(0, 2, -a[1]); g(0, 1, a[2]); } else { g(0, 1, a[0]); g(0, 2, a[1]); g(0, 3, a[2]); g(1, 2, a[3]); g(1, 3, b4[0]); g(2, 3, b4[1]); }
  return [0, ...r[0], ...r[1], ...r[2], ...r[3], 0, 0, 0];
}

const CASES = [
  ['rotate 10 20 30 · fold.box 1 · scale 2 · + -1 0 .5 ×10 bail=30', 0, ['x', 'y', 'z']],
  ['rotate4 10 0 25 15 0 30 · abs · sort4 · scale 3 · + -2 -2 0 -1 ×8 bail=50', 0, ['xy', 'xz', 'xw', 'yz', 'yw', 'zw']],
  ['fold.plane 1 1 0 · fold.plane 1 0 1 · scale 2 · + -1 -1 -1 ×16 bail=16', 1, ['nx', 'ny', 'nz', 'd']],
];

test('the rebuilt record equals the packed record with the value changed', () => {
  for (const [text, oi, keys] of CASES) {
    const f = normalize(parse(text)), o = f.slots.flat()[oi];
    for (const key of keys) {
      const d = key === 'd' ? 0.07 : o.op === 'fold.plane' ? 0.3 : 9;
      const raw = RAW[o.op].map((k) => (o.p[k] ?? 0) + (k === key ? d : 0)), a = raw.concat(0, 0, 0, 0, 0, 0, 0, 0);
      const got = lnBuild(MODE[o.op], a.slice(0, 4), a.slice(4, 8));
      const g = JSON.parse(JSON.stringify(f));
      g.slots.flat()[oi].p[key] = (o.p[key] ?? 0) + d;
      const want = pack(normalize(g)).ops.slice(oi * REC, oi * REC + REC);
      for (let k = 1; k < REC; k++) assert.ok(Math.abs(got[k] - want[k]) < 1e-6, `${o.op} ${key}: float ${k} ${got[k]} vs ${want[k]}`);
    }
  }
});

test('rotation angles and plane normals are in the metric, with their record derivatives', () => {
  for (const [text, oi, keys] of CASES) {
    const f = normalize(parse(text)), list = paramTangents(f).list.filter((t) => t.oi === oi);
    for (const key of keys) {
      const t = list.find((q) => q.key === key);
      assert.ok(t && t.drec, `${key} ranked`);
      assert.ok(t.drec.some((v) => Math.abs(v) > 1e-6), `${key} moves its record`);
    }
  }
});
