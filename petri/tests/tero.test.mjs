// Known-answer tests for tero.js — no GPU, run with `node petri/tests/tero.test.mjs`.
import { adapt, solvePressure, components, attachPoints } from '../tero.js';
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
// 5. Adaptation must be slow against the pair switching (Tero 2010). With dt x iters = 6 relaxation times
//    per update the conductivity remembers only the last few random pairs and the network flickers;
//    at 2.4 it averages many pairs and holds every terminal. Measured on the P2 fixture: coverage fell
//    9 -> 4 -> 2 food sources at the old setting.
{
  const N = 6, nodes = [], edges = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) nodes.push({ x, y, deg: 0 });
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; if (x < N - 1) edges.push({ a: i, b: i + 1, len_mm: 1 }); if (y < N - 1) edges.push({ a: i, b: i + N, len_mm: 1 }); }
  for (const e of edges) { nodes[e.a].deg++; nodes[e.b].deg++; }
  const T = [0, 5, 30, 35, 2, 15, 20, 33, 12, 23, 8, 27];
  const run = (dt, iters) => {
    const D = new Float64Array(edges.length).fill(0.3), live = [];
    for (let u = 0; u < 20; u++) { adapt({ nodes, edges }, D, T, { dt, iters, seed: 100 + u }); live.push(D.filter((d) => d > 0.05).length); }
    const on = new Set(); edges.forEach((e, i) => { if (D[i] > 0.05) { on.add(e.a); on.add(e.b); } });
    return { spread: Math.max(...live.slice(-6)) - Math.min(...live.slice(-6)), kept: T.filter((t) => on.has(t)).length };
  };
  const fast = run(0.25, 24), slow = run(0.05, 48);
  check('slow adaptation keeps every terminal, steadily', slow.kept === 12 && slow.spread === 0,
    `dt 0.05: kept ${slow.kept}/12 spread ${slow.spread}; (dt 0.25: kept ${fast.kept}/12 spread ${fast.spread})`);
}
// 6. A food source beside the MIDDLE of a long vein attaches to that vein (a new node splits it), not
//    to a far-away junction: nearest-node attachment lost food sources a vein ran straight past.
{
  const g = { nodes: [{ x: 0, y: 0, deg: 1 }, { x: 20, y: 0, deg: 1 }], edges: [{ a: 0, b: 1, len_mm: 20 }] };
  const { ids, D } = attachPoints(g, Float64Array.from([0.7]), [[10, 1, 0.5]], 1.5);
  const v = ids[0], nd = g.nodes[v];
  check('food attaches mid-vein', g.nodes.length === 3 && g.edges.length === 2 && Math.abs(nd.x - 10) < 1e-9 && D.length === 2 && D[1] === 0.7,
    `node ${v} at (${nd.x}, ${nd.y}), edges ${g.edges.map((e) => e.len_mm).join(' + ')} mm`);
}
// 7. Peeling dead ends is exact: a ring of terminals with a food-free chain hanging off it adapts the
//    ring exactly as the ring alone does, and the chain (zero current) decays.
{
  const ring = () => ({ nodes: [0, 1, 2, 3].map(() => ({ deg: 2 })), edges: [
    { a: 0, b: 1, len_mm: 1 }, { a: 1, b: 2, len_mm: 1.3 }, { a: 2, b: 3, len_mm: 1 }, { a: 3, b: 0, len_mm: 1.6 }] });
  const g1 = ring(), D1 = new Float64Array(4).fill(0.5);
  adapt(g1, D1, [0, 1, 2, 3], { iters: 80, seed: 3 });
  const g2 = ring(); g2.nodes.push({ deg: 2 }, { deg: 2 }, { deg: 1 });
  g2.edges.push({ a: 1, b: 4, len_mm: 1 }, { a: 4, b: 5, len_mm: 1 }, { a: 5, b: 6, len_mm: 1 });
  const D2 = new Float64Array(7).fill(0.5);
  adapt(g2, D2, [0, 1, 2, 3], { iters: 80, seed: 3 });
  const same = [0, 1, 2, 3].every((i) => Math.abs(D1[i] - D2[i]) < 1e-12);
  check('peeling dead ends is exact', same && D2[4] < 1e-3 && D2[6] < 1e-3, `ring ${[...D1].map((d) => d.toFixed(4)).join(' ')} vs ${[...D2.slice(0, 4)].map((d) => d.toFixed(4)).join(' ')}, chain ${D2[6].toExponential(1)}`);
}
// 8. Scaling: the driving each food source receives must not shrink as the network joins more food.
//    With one random pair per iteration the mean live conductivity halved from 6 to 36 terminals and
//    terminals dropped out from 24 on; with every terminal paired every iteration all are kept.
{
  const N = 10, nodes = [], edges = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) nodes.push({ x, y, deg: 0 });
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; if (x < N - 1) edges.push({ a: i, b: i + 1, len_mm: 1 }); if (y < N - 1) edges.push({ a: i, b: i + N, len_mm: 1 }); }
  for (const e of edges) { nodes[e.a].deg++; nodes[e.b].deg++; }
  let s0 = 11; const rnd = () => { s0 = (s0 * 1664525 + 1013904223) >>> 0; return s0 / 4294967296; };
  const pool = [...Array(N * N).keys()].sort(() => rnd() - 0.5);
  const rows = [6, 36].map((T) => {
    const term = pool.slice(0, T), D = new Float64Array(edges.length).fill(0.3);
    for (let u = 0; u < 20; u++) adapt({ nodes, edges }, D, term, { dt: 0.05, iters: 48, seed: 200 + u });
    const on = new Set(); edges.forEach((e, i) => { if (D[i] > 0.05) { on.add(e.a); on.add(e.b); } });
    return { T, kept: term.filter((t) => on.has(t)).length };
  });
  check('every terminal kept at 6 and at 36', rows.every((r) => r.kept === r.T), rows.map((r) => `${r.kept}/${r.T}`).join(', '));
}
process.exit(failed ? 1 : 0);
