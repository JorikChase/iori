// Known-answer tests for tero.js — no GPU, run with `node petri/tests/tero.test.mjs`.
import { adapt, solvePressure, components } from '../tero.js';
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'pass' : 'FAIL'}  ${name}  ${detail}`); if (!ok) failed++; };

// 1. Bonifaci, Mehlhorn & Varma 2012: power law, mu = 1, one fixed pair -> the shortest route survives.
{
  const g = { nodes: [0, 1, 2, 3].map(() => ({ deg: 2 })), edges: [
    { a: 0, b: 1, len_mm: 1 }, { a: 1, b: 3, len_mm: 1 }, { a: 0, b: 2, len_mm: 2 }, { a: 2, b: 3, len_mm: 2 }] };
  const D = Float64Array.from([1, 1, 1, 1]);
  adapt(g, D, [0, 3], { mode: 'power', mu: 1, iters: 400, dt: 0.1 });
  check('shortest path (mu = 1)', D[0] > 0.5 && D[1] > 0.5 && D[2] < 1e-3 && D[3] < 1e-3,
    `short ${D[0].toFixed(3)} ${D[1].toFixed(3)}, long ${D[2].toExponential(1)} ${D[3].toExponential(1)}`);
}
// 2. Kirchhoff: two parallel unit conductances share the current, so the drop is 1/2.
{
  const g = { nodes: [{}, {}], edges: [{ a: 0, b: 1, len_mm: 1 }, { a: 0, b: 1, len_mm: 1 }] };
  const { comp, count } = components(g);
  const { p } = solvePressure(g, Float64Array.from([1, 1]), Float64Array.from([1, -1]), comp, count);
  check('kirchhoff', Math.abs(p[0] - p[1] - 0.5) < 1e-6, `drop ${(p[0] - p[1]).toFixed(6)} (0.5)`);
}
// 3. A component with no terminal carries no current, so its veins decay — this is what dissolves
//    stray fragments on a dish.
{
  const g = { nodes: [{ deg: 1 }, { deg: 1 }, { deg: 1 }, { deg: 1 }], edges: [{ a: 0, b: 1, len_mm: 1 }, { a: 2, b: 3, len_mm: 1 }] };
  const D = Float64Array.from([1, 1]);
  adapt(g, D, [0], { iters: 60 });
  check('orphan fragment decays', D[1] < 1e-2 && D[0] > 0.1, `fed ${D[0].toFixed(3)}, orphan ${D[1].toExponential(1)}`);
}
// 4. Tero 2010: sigmoid response + a random terminal pair per iteration keeps a CYCLE. Three
//    terminals on a ring with a hub: the ring (a loop) survives, the hub spokes are pruned. A tree —
//    what the power law would settle on — would have no surviving cycle.
{
  const g = { nodes: [0, 1, 2, 3].map(() => ({ deg: 3 })), edges: [
    { a: 0, b: 1, len_mm: 1 }, { a: 1, b: 2, len_mm: 1 }, { a: 2, b: 0, len_mm: 1 },
    { a: 3, b: 0, len_mm: 0.6 }, { a: 3, b: 1, len_mm: 0.6 }, { a: 3, b: 2, len_mm: 0.6 }] };
  const D = new Float64Array(6).fill(0.5);
  adapt(g, D, [0, 1, 2], { iters: 400, seed: 7 });
  const alive = g.edges.map((e, i) => ({ ...e, i })).filter((e) => D[e.i] > 0.05);
  const V = new Set(alive.flatMap((e) => [e.a, e.b])).size;
  const loops = alive.length - V + 1;
  check('a cycle survives (sigmoid, random pairs)', loops >= 1, `surviving edges ${alive.length}, nodes ${V}, loops ${loops}`);
}
process.exit(failed ? 1 : 0);
