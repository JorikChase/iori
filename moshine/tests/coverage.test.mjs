// study/coverage.md: every name in a v1 or partial row must exist in config.js (spec §1.1, coverage).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OPS, FX, SCHEMA, PRESETS, LEGACY, normalize } from '../config.js';

const md = readFileSync(new URL('../study/coverage.md', import.meta.url), 'utf8');
const rows = md.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Reference') && !l.startsWith('| Capability') && !l.startsWith('|---'))
  .map((l) => l.split('|').slice(1, -1).map((c) => c.trim())).filter((c) => c.length === 4);

function check(param, spec, value) {
  if (!spec) return `no parameter`;
  if (value === undefined) return null;
  if (spec.length === 4) { const v = Number(value); return v >= spec[0] && v <= spec[1] ? null : `${value} outside [${spec[0]}, ${spec[1]}]`; }
  if (spec.length === 2) return spec[0].map(String).includes(value) ? null : `${value} not in ${spec[0].join('/')}`;
  return null;
}
/** Resolve one reference; returns null when it exists, else the reason. */
export function resolveRef(ref) {
  const [path, value] = ref.split('=');
  if (path.startsWith('preset:')) return PRESETS[path.slice(7)] ? null : 'no such preset';
  if (path.startsWith('legacy:')) return LEGACY[path.slice(7)] ? null : 'no such legacy preset';
  if (path === 'block' || path === 'seed') return null;
  const [head, name, param] = path.split('.');
  if (head === 'ops') { if (!OPS[name]) return 'no such field op'; return param ? check(param, OPS[name].params[param], value) : null; }
  if (head === 'inLoop' || head === 'post') { if (name === '*') return null; if (!FX[name]) return 'no such effect'; return param ? check(param, FX[name].params[param], value) : null; }
  if (SCHEMA[head]) { if (!SCHEMA[head].params[name] && name in normalize({})[head]) return null; return check(name, SCHEMA[head].params[name], value); }   // list fields such as bloom.hits
  return 'unknown stage';
}

test('coverage matrix: every reference in v1 and partial rows exists', () => {
  const bad = [], counts = {};
  for (const [op, , moshine, status] of rows) {
    counts[status] = (counts[status] || 0) + 1;
    if (status !== 'v1' && status !== 'partial') continue;
    const refs = [...moshine.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    if (!refs.length) bad.push(`${op}: no reference`);
    for (const r of refs) { const why = resolveRef(r); if (why) bad.push(`${op}: \`${r}\` ${why}`); }
  }
  console.log('coverage rows by status', JSON.stringify(counts));
  assert.deepEqual(bad, []);
  assert.ok(rows.length > 100, `${rows.length} rows`);
});
test('presets named in the matrix normalise cleanly', () => {
  for (const p of [...Object.values(PRESETS), ...Object.values(LEGACY)]) assert.deepEqual(normalize(p), p);
});
