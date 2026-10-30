// A subgraph costs the shaders nothing: an instanced formula packs, byte for byte, as its inlined form.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, validate } from '../core/index.js';
import { pack } from '../gpu/pack.js';
import { structureKey } from '../gpu/jit.js';
import { parse } from '../core/index.js';
import { SUBS } from './sub-cases.js';

const plain = (f) => {
  const g = JSON.parse(JSON.stringify(normalize(f)));
  delete g.sub;
  if (g.shade) delete g.shade.sub;
  if (g.drive) delete g.drive.sub;
  return normalize(g);
};
const bytes = (p) => Object.fromEntries(Object.entries(p).filter(([, v]) => ArrayBuffer.isView(v)).map(([k, v]) => [k, Array.from(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))]));

test('an instanced formula packs as its inlined form', () => {
  for (const [text] of SUBS) {
    const f = normalize(parse(text));
    assert.ok(validate(f).ok, `${text}: ${validate(f).errors.join()}`);
    assert.ok(f.sub || f.drive?.sub);
    const a = bytes(pack(f)), b = bytes(pack(plain(f)));
    assert.ok(Object.keys(a).length, 'pack gives arrays');
    assert.deepEqual(a, b, text);
    assert.equal(structureKey(f), structureKey(plain(f)));
  }
});
