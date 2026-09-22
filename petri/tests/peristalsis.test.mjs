// Known answers and the P1b gate's question 2, on the graph — `node petri/tests/peristalsis.test.mjs`
import { pump } from '../peristalsis.js';
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'pass' : 'FAIL'}  ${name}  ${detail}`); if (!ok) failed++; };
const chain = (n, len = 1, w = 0.2) => {
  const nodes = Array.from({ length: n }, (_, i) => ({ x: i * len, y: 0, deg: 0 }));
  const edges = []; for (let i = 0; i < n - 1; i++) edges.push({ a: i, b: i + 1, len_mm: len, width_mm: w });
  for (const e of edges) { nodes[e.a].deg++; nodes[e.b].deg++; }
  return { nodes, edges };
};

// 1. Shuttle streaming: two halves of a tube beating in antiphase push sol back and forth. The signed
//    flux over whole periods is ~0 while the rectified flux is not. (All tubes in phase move NOTHING:
//    a closed network has nowhere to put the expelled volume — my first version of this test expected
//    flow there, which was wrong.)
{
  const g = chain(12), D = new Float64Array(11).fill(1), phi = Float64Array.from({ length: 12 }, (_, i) => (i < 6 ? 0 : Math.PI));
  const r = pump(g, D, new Float64Array(12), phi, { periods: 4, chiA: 0, K: 0 });
  const net = Math.max(...r.Qnet.map(Math.abs)), mid = r.Qabs[5];
  check('antiphase halves shuttle, no net flow', mid > 0 && net < 1e-3 * mid, `rectified at the middle ${mid.toExponential(2)}, max |net| ${net.toExponential(1)}`);
}
// 2. Kuramoto coupling synchronises identical oscillators along a connected tube.
{
  const g = chain(20), D = new Float64Array(19).fill(1);
  let a = 7; const rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const phi = Float64Array.from({ length: 20 }, () => rnd() * 2 * Math.PI);
  const r = pump(g, D, new Float64Array(20), phi, { periods: 30, K: 0.6, chiA: 0 });
  check('coupled tubes synchronise', r.order > 0.95, `order parameter ${r.order.toFixed(3)}`);
}
// 3. The P1b gate's open question 2, answered on the graph: a food source at one end raises the local
//    frequency, the phase leads there and a travelling wave forms. Which way does the carried biomass
//    drift? Reported for the frequency effect alone and with cortex softening (Kobayashi 2006); the
//    test asserts only that the model gives a definite, reproducible answer, not which one.
{
  const out = [];
  for (const [chiA, chiE] of [[0, 0], [0.3, 0], [0.3, 0.8], [0.3, -0.8]]) {
    const g = chain(24), D = new Float64Array(23).fill(1), food = new Float64Array(24); food[0] = 1; food[1] = 0.6; food[2] = 0.3;
    const phi = new Float64Array(24), tr = new Float64Array(24).fill(1);
    const x0 = tr.reduce((s, m, i) => s + m * i, 0) / tr.reduce((s, m) => s + m, 0);
    pump(g, D, food, phi, { periods: 40, K: 0.5, chiA, chiE, tracer: tr });
    const x1 = tr.reduce((s, m, i) => s + m * i, 0) / tr.reduce((s, m) => s + m, 0);
    out.push({ chiA, chiE, drift: +(x1 - x0).toFixed(4) });
  }
  const control = Math.abs(out[0].drift), definite = out.slice(1).every((o) => Math.abs(o.drift) > 10 * control + 1e-3);
  check('no food, no drift; with food, a definite sign (gate question 2)', control < 1e-3 && definite,
    out.map((o) => `chiA ${o.chiA} chiE ${o.chiE >= 0 ? '+' : ''}${o.chiE}: drift ${o.drift > 0 ? '+' : ''}${o.drift} nodes (${o.drift < 0 ? 'TOWARD' : 'away from'} food)`).join(' | '));
}
process.exit(failed ? 1 : 0);
