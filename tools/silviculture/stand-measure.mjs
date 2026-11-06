// tools/silviculture/stand-measure.mjs — the numbers quoted in paper 0.3 §2.6–2.10. Writes stand.json.
//   node tools/silviculture/stand-measure.mjs [--seeds 1,2,3]
import { createStand } from '../../papers/silviculture/stand.js?v=3';
import { createRoots } from '../../papers/silviculture/roots.js?v=1';
import { createLearned } from '../../papers/silviculture/learned.js?v=1';
import { createSelfOrg } from '../../papers/silviculture/selforg.js?v=3';
import { measure } from '../../papers/silviculture/skeleton.js?v=3';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const SEEDS = (args.seeds || '1,2,3').split(',').map(Number);
const out = { light: [], micro: [], fire: [], roots: [], learned: [], teachers: [] };
const f = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–');

// 2.6: 16 ha, 300 years
for (const seed of SEEDS) for (const size of [100, 200, 400]) {
  const S = createStand({ size, seed }); const t = performance.now();
  for (let y = 0; y < 300; y++) S.step();
  const c = S.census(), g = S.gaps();
  const r = { seed, size, ...c, lambda: g.lambda, se: g.se, gaps: g.fit.length, open: g.open, msYr: (performance.now() - t) / 300 };
  out.light.push(r); console.log('light', seed, size, `stems ${f(c.stems, 0)} BA ${f(c.basal, 1)} big ${f(c.big, 0)} top ${f(c.top, 1)} pio ${f(c.pioneer, 0)} λ ${f(g.lambda)}±${f(g.se)} n ${g.fit.length} open ${f(g.open * 100, 1)}% ${f(r.msYr, 1)}ms/yr`);
}
// 2.7: 4 ha, 300 years, warmest day 26–40 °C
for (const seed of SEEDS) for (const T of [26, 30, 34, 38, 40]) {
  const S = createStand({ size: 200, seed, micro: true, Tmax: T });
  for (let y = 0; y < 300; y++) S.step();
  const c = S.census(); let hot = 0, off = 0; for (const v of S.Tu) { if (v > 31) hot++; off += T - v; }
  const r = { seed, T, tolerant: c.tolerant, pioneer: c.pioneer, hot: hot / S.Tu.length, cooling: off / S.Tu.length };
  out.micro.push(r); console.log('micro', seed, T, `tol ${f(c.tolerant, 0)} pio ${f(c.pioneer, 0)} hot ${f(r.hot * 100, 0)}% cooling ${f(r.cooling, 1)}`);
}
// 2.8: 4 ha grown 200 years, fire from the west edge, wind × ladder
for (const seed of SEEDS) {
  const base = createStand({ size: 200, seed }); for (let y = 0; y < 200; y++) base.step();
  const snap = base.trees.map((t) => ({ ...t }));
  for (const clear of [false, true]) for (const wind of [0.1, 0.5, 0.9]) {
    base.trees = snap.map((t) => ({ ...t })); base.light();
    const r = base.fire({ x: 4, z: 100, wind, dir: 0, dry: 1, clearLadder: clear });
    const res = { seed, clear, wind, burnt: r.burnt, crown: r.crown, killed: r.killed, before: r.before };
    for (let y = 0; y < 60; y++) base.step();
    res.pioneerAfter = base.census().pioneer; res.lambdaAfter = base.gaps().lambda;
    out.fire.push(res); console.log('fire', seed, clear ? 'cleared' : 'ladder', wind, `burnt ${f(r.burnt * 100, 0)}% crown ${f(r.crown * 100, 0)}% killed ${r.killed}/${r.before} +60y pioneers ${f(res.pioneerAfter, 0)}/ha λ ${f(res.lambdaAfter)}`);
  }
}
// 2.9: roots by soil
for (const seed of SEEDS) for (const soil of ['sand', 'rock', 'clay']) {
  const g = createRoots(); g.reset(seed, { soil }); while (g.step());
  const s = g.stats(); out.roots.push({ seed, soil, ...s });
  console.log('roots', seed, soil, `depth ${f(s.depth)} plate r ${f(s.plateR)} d ${f(s.plateD)} pit ${f(s.pit, 1)} root ${f(s.rootLen, 0)} m shoot ${f(s.shootLen, 0)} m`);
}
// 2.10: the teachers (8 self-organising trees beside the wall, seeds 101–108) and samples by order
for (let i = 0; i < 8; i++) { const g = createSelfOrg(); g.reset(101 + i, { wall: true }); for (let y = 0; y < 15; y++) g.step(); out.teachers.push(measure(g.skeleton())); }
const tr = (k, d = 2) => { const v = out.teachers.map((m) => m[k]).filter(Number.isFinite); return `${f(Math.min(...v), d)}–${f(Math.max(...v), d)}`; };
console.log('teachers', `seg ${tr('segments', 0)} h ${tr('height', 1)} Rn ${tr('Rn')} box ${tr('box')} lean ${tr('lean')} inWall ${tr('inWall', 0)}`);
for (const order of [1, 3, 6, 10]) for (const seed of SEEDS) {
  const g = createLearned(); g.reset(seed, { order, trees: 8 }); while (g.step());
  const m = measure(g.skeleton()); out.learned.push({ order, seed, ...m });
  console.log('learned', order, seed, `seg ${m.segments} h ${f(m.height, 1)} Rn ${f(m.Rn)} box ${f(m.box)} lean ${f(m.lean)} inWall ${m.inWall}`);
}
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'stand.json'), JSON.stringify(out));
