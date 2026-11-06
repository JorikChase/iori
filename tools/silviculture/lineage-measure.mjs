// tools/silviculture/lineage-measure.mjs — runs every method of paper 0.3 chapter 2 to its end, with and without the
// wall, and measures each with the same instrument (papers/silviculture/skeleton.js measure()). Writes lineage.json.
//
//   node tools/silviculture/lineage-measure.mjs [--seeds 1,2,3]
import { createLSystem } from '../../papers/silviculture/lsystem.js?v=1';
import { createColonise } from '../../papers/silviculture/colonise.js?v=1';
import { createSelfOrg } from '../../papers/silviculture/selforg.js?v=1';
import { createModules } from '../../papers/silviculture/modules.js?v=1';
import { measure } from '../../papers/silviculture/skeleton.js?v=1';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? a.concat([[v.slice(2), all[i + 1]]]) : a), []));
const SEEDS = (args.seeds || '1,2,3').split(',').map(Number);
const STEPS = { 'L-system': 10, 'Space colonisation': 400, 'Self-organising tree': 15, 'Branch modules': 120 };
const out = [];
for (const make of [createLSystem, createColonise, createSelfOrg, createModules]) {
  for (const wall of [false, true]) for (const seed of SEEDS) {
    const g = make();
    g.reset(seed, { wall });
    const t0 = performance.now(); let steps = 0, worst = 0;
    for (let i = 0; i < STEPS[g.name]; i++) { const a = performance.now(); if (!g.step()) break; steps++; worst = Math.max(worst, performance.now() - a); }
    const ms = performance.now() - t0, m = measure(g.skeleton());
    const r = { method: g.name, wall, seed, t: g.t, msPerStep: ms / Math.max(1, steps), worstStep: worst, ...m };
    out.push(r);
    console.log(`${g.name.padEnd(21)} wall ${wall ? 'y' : 'n'} seed ${seed} t ${String(g.t).padStart(3)} seg ${String(m.segments).padStart(6)} h ${m.height.toFixed(1).padStart(5)} ord ${m.orders} Rn ${m.Rn.toFixed(2)} Rd ${m.Rd.toFixed(2)} leo ${m.leonardo.toFixed(2)} box ${m.box.toFixed(2)} lean ${m.lean.toFixed(2).padStart(6)} inWall ${String(m.inWall).padStart(4)} ${(ms / Math.max(1, steps)).toFixed(1)} ms/step (worst ${worst.toFixed(0)})`);
  }
}
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'lineage.json'), JSON.stringify(out));
