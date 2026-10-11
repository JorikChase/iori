// dmath: deterministic transcendental functions agree with Math to ~1 ulp (and use only basic operations).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dsin, dcos, dexp, dlog, dpow, dpowi, dhypot } from '../dmath.js';

const ulpRel = (a, b) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(b), 1e-300));
test('sin, cos match Math within 4e-16 relative (or 1e-16 absolute near zeros)', () => {
  let worst = 0;
  for (let i = -20000; i <= 20000; i++) { const x = i * 0.0137 + 0.001 * Math.sin(i);
    for (const [f, g] of [[dsin, Math.sin], [dcos, Math.cos]]) { const a = f(x), b = g(x), e = Math.abs(a - b); worst = Math.max(worst, Math.abs(b) > 1e-3 ? e / Math.abs(b) : e); } }
  assert.ok(worst < 4e-16, 'worst ' + worst);
  assert.equal(dsin(0), 0); assert.equal(dcos(0), 1);
});
test('exp, log, pow match Math within 2e-15 relative', () => {
  let worst = 0;
  for (let i = 1; i < 5000; i++) { const x = i * 0.001 + 1e-6 * i * i;
    worst = Math.max(worst, ulpRel(dexp(x / 7 - 300 / i), Math.exp(x / 7 - 300 / i)), ulpRel(dlog(x * 3.7), Math.log(x * 3.7)), ulpRel(dpow(x / 5000, 1 / 2.2), Math.pow(x / 5000, 1 / 2.2))); }
  assert.ok(worst < 2e-15, 'worst ' + worst);
  assert.equal(dpowi(1.05, 3), 1.05 * 1.05 * 1.05); assert.equal(dlog(1), 0); assert.equal(dexp(0), 1); assert.equal(dhypot(3, 4), 5);
  assert.ok(dlog(5e-324) < -744 && dlog(5e-324) > -745, 'subnormal');
});
