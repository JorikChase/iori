// graphworker.js — one P2 graph update off the main thread: the adaptive slot's density → vein graph →
// Tero adaptation → conductivity field for the agents. Input and output are plain arrays, and the
// result depends only on the input, so the update is as deterministic as the step that requested it.
import { extractValues, networkStats } from './graph.js';
import { adapt, rasterise, sampleField, attachPoints, components } from './tero.js';

self.onmessage = (ev) => {
  const { id, vals, n, cellMm, gn, field, bodyMm, foodMm, step, seed, params } = ev.data;
  const t0 = performance.now();
  const span = n * cellMm;
  const g = extractValues(vals, n, cellMm, { ds: params.ds, level: params.level, closeR: params.closeR, pruneMm: params.pruneMm, spurWidths: 3,
    keepTips: foodMm, tipReach: params.bodyReach });
  const t1 = performance.now();
  let D = null, info = { solves: 0, components: 0, maxResidual: 0 };
  let terminals = [];
  if (g.edges.length) {
    D = sampleField(g, field, gn, span, params.D0);
    // Terminals come from WHERE FOOD WAS PLACED and where the organism was inoculated (the op log), not
    // from the nutrient under a node: agents graze a flake below any threshold within a few hundred
    // steps. Each is attached where it touches a vein, splitting the vein if needed (attachPoints).
    const att = attachPoints(g, D, [...foodMm, ...bodyMm], params.bodyReach);
    D = att.D; terminals = att.ids;
    terminals = [...new Set(terminals)];
    info = adapt(g, D, terminals, { mu: params.mu, Qh: params.Qh, iters: params.iters, dt: params.dt, seed: seed ^ step });
  }
  const out = rasterise(g, D || new Float64Array(0), gn, span, new Float32Array(gn * gn));
  const st = g.edges.length ? networkStats(g) : { nodes: 0, edges: 0 };
  const t2 = performance.now();
  const alive = D ? D.filter((d) => d > 0.05).length : 0;
  // The graph itself goes back too (grid mm): the scorecard measures the tubes the adaptation keeps.
  const net = { nodes: g.nodes.map((nd) => [nd.x, nd.y]), edges: g.edges.map((e) => [e.a, e.b, e.len_mm]), D: D ? Array.from(D) : [] };
  self.postMessage({ id, field: out, net, stats: {
    ...st, components: g.edges.length ? components(g).count : 0, terminals: terminals.length,
    veinsAlive: alive, solves: info.solves, maxResidual: info.maxResidual,
    extract_ms: +(t1 - t0).toFixed(0), adapt_ms: +(t2 - t1).toFixed(0),
  } }, [out.buffer]);
};
