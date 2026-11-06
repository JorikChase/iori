// tools/silviculture/ground-measure.mjs — the numbers quoted in paper 0.3 chapter 3. Writes ground.json.
//   node tools/silviculture/ground-measure.mjs [--seeds 1,2,3]
import { createSPL, makeGrid, fbm, ridged, measureGround } from '../../papers/silviculture/ground.js?v=1';
import { createTransport } from '../../papers/silviculture/transport.js?v=1';
import { generateTerrain } from '../../papers/fractals/landscape-terrain.js';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const SEEDS = (args.seeds || '1,2,3').split(',').map(Number);
const K = ['pit_share', 'fill_m', 'hack_h', 'tau', 'concavity', 'horton_Rb', 'horton_Rl', 'hypsometric_integral'];
const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–');
const pick = (s) => Object.fromEntries(K.map((k) => [k, s[k]]));
const line = (s) => K.map((k) => `${k} ${f(s[k])}`).join(' ');
const out = { spl: [], solver: [], region: [], transport: [], score: [] };

// 3.1: implicit at 100 kyr to 15 Myr; explicit at 100 kyr (unstable) and at 1 kyr (stable, 100× the steps)
for (const seed of SEEDS) {
  const S = createSPL({ seed }); const t0 = performance.now(); const curve = [];
  for (let i = 0; i < 150; i++) { S.step(); if (i % 10 === 9) curve.push(S.stats()); }
  const ms = (performance.now() - t0) / 150, m = measureGround(S.g), st = S.stats();
  out.spl.push({ seed, ms, ...st, ...pick(m), curve }); console.log('spl', seed, `max ${f(st.max, 0)} mean ${f(st.mean, 0)} C ${f(st.courant, 1)} ${f(ms, 1)} ms/step`, line(m));
  const S2 = createSPL({ seed }); S2.P.creep = false; for (let i = 0; i < 150; i++) S2.step();
  const m2 = measureGround(S2.g); out.spl.push({ seed, creep: false, ...S2.stats(), ...pick(m2) }); console.log('spl-nocreep', seed, `max ${f(S2.stats().max, 0)}`, line(m2));
  for (const dt of [1e5, 2e3, 1e3]) {
    const E = createSPL({ seed }); E.P.solver = 'explicit'; E.P.dt = dt; const steps = Math.round(3e6 / dt); const t1 = performance.now();
    for (let i = 0; i < steps; i++) E.step();
    const I = createSPL({ seed }); I.P.dt = dt; for (let i = 0; i < steps; i++) I.step();
    let diff = 0; for (let k = 0; k < E.g.N; k++) diff = Math.max(diff, Math.abs(E.g.h[k] - I.g.h[k]));
    const r = { seed, dt, steps, explicit: E.stats(), implicit: I.stats(), maxDiff: diff, ms: performance.now() - t1 };
    out.solver.push(r); console.log('solver', seed, dt, `steps ${steps} C ${f(r.explicit.courant, 2)} explicit max ${f(r.explicit.max, 0)} implicit max ${f(r.implicit.max, 0)} max|Δ| ${f(diff, 0)} m`);
  }
}
// 3.2: paper 0's region at 257² and 513², with its sea, measured by its own statistics
for (const seed of SEEDS) for (const cells of [257, 513]) {
  const t0 = performance.now(); const T = generateTerrain({ seed, size_m: 10000, cells, seaQuantile: 0.08 }); const ms = performance.now() - t0, s = T.stats;
  out.region.push({ seed, cells, ms, relief: s.relief_m, lakes: s.lakes, coast: s.coastline_D, ...pick(s) });
  console.log('region', seed, cells, `${f(ms / 1000, 1)} s relief ${f(s.relief_m, 0)} coast ${f(s.coastline_D)}`, line(s));
}
// 3.3: transport with and without momentum, 600 iterations
for (const seed of SEEDS) for (const mom of [1, 0]) {
  const T = createTransport({ seed }); T.reset(seed, { momentum: mom }); const t0 = performance.now();
  for (let i = 0; i < 600; i++) T.step();
  const s = T.stats(); out.transport.push({ seed, momentum: mom, ms: (performance.now() - t0) / 600, ...s });
  console.log('transport', seed, mom ? 'momentum' : 'none', `threads ${f(s.threads, 1)} eroded ${f(s.eroded / 1e6, 1)} M fan ${f(s.fan / 1e6, 1)} M exported ${f(s.exported / 1e6, 1)} M balance ${s.balance.toExponential(1)} ${f((performance.now() - t0) / 600, 1)} ms/it`);
}
// 3.4: the same harness on four generators (region without its sea, so that all four are measured alike)
for (const seed of SEEDS) {
  const row = { seed };
  row.fbm = pick(measureGround(fbm(makeGrid(), seed)));
  row.ridged = pick(measureGround(ridged(makeGrid(), seed)));
  const S = createSPL({ seed }); for (let i = 0; i < 150; i++) S.step(); row.spl = pick(measureGround(S.g));
  const T = generateTerrain({ seed, size_m: 10000, cells: 257 }); const g = makeGrid(); for (let i = 0; i < g.N; i++) g.h[i] = T.height[i]; row.region = pick(measureGround(g));
  out.score.push(row);
  for (const k of ['fbm', 'ridged', 'spl', 'region']) console.log('score', seed, k, line(row[k]));
}
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'ground.json'), JSON.stringify(out));
