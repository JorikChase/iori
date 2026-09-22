// diag/fixture-trace.js — time-resolved diagnosis of the Tero fixture. Run in the page:
//   const D = await import('/petri/diag/fixture-trace.js'); await D.trace({ steps: 24000, every: 1500 })
// Records, per sample: coverage and Tero metrics (fixture.js), the worker's graph stats, mean live
// conductivity, where the agents are (on a conducting tube or not), and how much food is left.
import { teroMetrics, fixture36 } from '../fixture.js';

export async function trace({ steps = 24000, every = 1500, quality = 'draft', overrides = {} } = {}) {
  const { createEngine } = await import('../engine.js');
  const E = await createEngine(new OffscreenCanvas(64, 64), { quality, seed: 2010, nutrient: 0.3, agar: 0.5 });
  const food = fixture36();
  E.importID({ petri: 1, seed: 2010, dish: { nutrient: 0.3, agar: 0.5, temp: 1 }, ops: [
    { t: 0, tool: 'inoculate', organism: 'physarum-polycephalum-adaptive-network', at: food[0], r: 4 },
    ...food.map((p) => ({ t: 0, tool: 'flake', at: p, r: 1.2, amount: 3 }))] });
  if (overrides.adapt) Object.assign(E.sim.adapt, overrides.adapt);
  const n = E.n, span = n * E.cellMm, gn = E.gn, foodGrid = food.map(([x, y]) => [x + span / 2, y + span / 2]);
  const rows = [];
  for (let done = 0; done < steps; done += every) {
    await E.run(every, 300);
    const net = E.graph.net, st = E.graph.stats || {};
    const m = net ? teroMetrics(net, foodGrid) : {};
    const liveD = net ? net.D.filter((d) => d > 0.05) : [];
    // agents on a conducting tube
    const ab = await E.readAgents(), f = new Float32Array(ab), u = new Uint32Array(ab);
    let agents = 0, onTube = 0;
    for (let i = 0; i < u.length; i += 6) {
      if (!(u[i + 4] & 15)) continue;
      agents++;
      const gx = Math.min(gn - 1, Math.floor(f[i] * gn / n)), gy = Math.min(gn - 1, Math.floor(f[i + 1] * gn / n));
      if (E.graph.field[gy * gn + gx] > 0.05) onTube++;
    }
    // food left under the flakes
    const sub = await E.readSub();
    let foodLeft = 0;
    for (const [x, y] of foodGrid) { const cx = Math.floor(x / E.cellMm), cy = Math.floor(y / E.cellMm); foodLeft += sub[(cy * n + cx) * 4]; }
    rows.push({
      step: E.sim.step, reached: m.reached, TL: m.TL_MST, MD: m.MD_MST, FT: m.FT,
      term: st.terminals, comp: st.components, edges: st.edges, alive: liveD.length,
      meanD: liveD.length ? +(liveD.reduce((a, b) => a + b, 0) / liveD.length).toFixed(3) : 0,
      agents, onTube: +(onTube / Math.max(agents, 1)).toFixed(3), foodLeft: +(foodLeft / food.length).toFixed(2),
      upd_ms: st.wall_ms,
    });
    if (typeof window !== 'undefined') window.__trace = rows;
  }
  E.device.destroy();
  return rows;
}
