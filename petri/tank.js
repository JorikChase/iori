// tank.js — the automata think tank (study/07, K3): many dishes on one GPU device, stepped in
// parallel, described by a declarative experiment spec, measured on a fixed cadence.
//
//   const T = await import('/petri/tank.js'); const S = await import('/petri/tank-suites.js');
//   const out = await T.runTank(S.SUITES.catalogue());          // or: node petri/tools/bench.mjs --tank catalogue
//
// Exact by construction: every dish is its own engine (own buffers, own worker, own Dish ID) on a shared
// device, and interleaving dishes on one device leaves each dish's bits unchanged (T0.microDish checks
// exactly that). So every row replays alone from its `id`, and parallelism can reorder dishes but never
// change results. The speed comes from two places: small dishes (GPU work is cells x steps), and one
// dish's CPU graph update overlapping the other dishes' GPU stepping.
import { createEngine } from './engine.js';
import { describe } from './metrics.js';
import { teroMetrics } from './fixture.js';

/** spec.vary {k: [..]} -> list of variant objects (cartesian product, keys in insertion order). */
export function expand(vary = {}) {
  let out = [{}];
  for (const [k, vals] of Object.entries(vary)) out = out.flatMap((v) => vals.map((x) => ({ ...v, [k]: x })));
  return out;
}

// Metric registry: name -> async (dish) => object. A dish is { e, v, spec, food }.
export const MEASURES = {
  // who is where: area and mass per organism slot (competitions, liveness)
  async census({ e }) {
    const st = await e.stats();
    return { agents: st.agents, slots: st.slots.map((s) => ({ name: s.name, area_mm2: s.area_mm2, mass: s.mass })) };
  },
  // shape of every living slot: size, front, fractal dimension, fill, morphotype
  async shape({ e }) {
    const c = await e.readCells(), out = [];
    for (let s = 1; s <= 8; s++) {
      const d = describe(c, e.n, s, e.cellMm, [0, 1]);
      if (!d.area) continue;
      out.push({ slot: s, area_mm2: +d.area_mm2.toFixed(2), radius_mm: +d.radius_mm.toFixed(2), boxD: +(d.boxD || 0).toFixed(3),
                 fill: +(d.fill || 0).toFixed(3), roughness: +(d.roughness || 0).toFixed(4), morphotype: d.morphotype });
    }
    return out;
  },
  // Tero 2010 metrics on the adaptive graph, against the spec's food points
  async tero({ e, food }) {
    if (!e.graph.net || !food) return null;
    const span = e.n * e.cellMm, m = teroMetrics(e.graph.net, food.map(([x, y]) => [x + span / 2, y + span / 2]));
    const { reachedIdx, ...rest } = m; return rest;
  },
  async hash({ e }) { return e.hash(); },
};

/**
 * spec: { name, dish: {dishMm?, cellMm?, quality?, nutrient, agar, temp}, steps, sample, chunk?,
 *         vary: {key: [values]}, seed(v), ops(v) -> Dish ID ops (mm), medium?(v) -> dish overrides,
 *         food?(v) -> [[x, y]] mm, adapt?(v) -> Tero adaptation overrides,
 *         measure: [names from MEASURES], parallel? }
 * Returns { name, spec summary, rows: [{ i, v, id, samples: [{ step, <measure>: … }] }], wall_s }.
 */
export async function runTank(spec, { device, parallel = spec.parallel || 16, save = true, log = console.log } = {}) {
  const t0 = performance.now();
  const variants = expand(spec.vary);
  const dev = device || (window.__petri && window.__petri.device);
  const dish = spec.dish || {};
  const measures = spec.measure || ['census'];
  const rows = new Array(variants.length);
  const chunk = spec.chunk || 100;
  for (let w = 0; w < variants.length; w += parallel) {
    const wave = [];
    for (let i = w; i < Math.min(variants.length, w + parallel); i++) {
      const v = variants[i];
      const e = await createEngine(new OffscreenCanvas(8, 8), { quality: dish.quality || 'draft', dishMm: dish.dishMm, cellMm: dish.cellMm, device: dev });
      e.playing = false;
      const id = { petri: 1, seed: spec.seed ? spec.seed(v) : 1, dish: { nutrient: dish.nutrient ?? 0.6, agar: dish.agar ?? 0.5, temp: dish.temp ?? 1, ...(spec.medium ? spec.medium(v) : {}) }, ops: spec.ops(v) };
      e.importID(id);
      if (spec.adapt && e.sim.adapt) Object.assign(e.sim.adapt, spec.adapt(v));   // per-variant adaptation knobs
      const d = { i, e, v, id, spec, food: spec.food ? spec.food(v) : null, next: spec.sample || spec.steps, busy: null, done: false, samples: [], refused: [] };
      if (e.lastRefusal) d.refused.push(e.lastRefusal);
      wave.push(d);
    }
    // Round-robin: every dish that is not waiting on its graph worker submits a chunk; one GPU wait per
    // round. A dish whose graph update is due hands it to its worker and sits out until it returns.
    while (wave.some((d) => !d.done)) {
      let submitted = 0;
      for (const d of wave) {
        if (d.done || d.busy) continue;
        const want = Math.min(chunk, d.next - d.e.sim.step);
        if (want <= 0) continue;
        const did = d.e.step(want); submitted += did;
        if (did < want) d.busy = d.e.updateGraph().then(() => { d.busy = null; });
      }
      if (submitted) await dev.queue.onSubmittedWorkDone();
      else { const b = wave.filter((d) => d.busy).map((d) => d.busy); if (b.length) await Promise.race(b); }
      for (const d of wave) {
        if (d.done || d.busy || d.e.sim.step < d.next) continue;
        const sample = { step: d.e.sim.step };
        for (const m of measures) sample[m] = await MEASURES[m](d);
        d.samples.push(sample);
        if (d.e.sim.step >= spec.steps) d.done = true; else d.next = Math.min(spec.steps, d.next + (spec.sample || spec.steps));
      }
    }
    for (const d of wave) {
      rows[d.i] = { i: d.i, v: d.v, id: d.id, n: d.e.n, samples: d.samples, ...(d.refused.length ? { refused: d.refused } : {}) };
      d.e.dispose();
    }
    log(`[tank] ${spec.name}: ${Math.min(variants.length, w + parallel)}/${variants.length} dishes, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  }
  const out = { name: spec.name, when: new Date().toISOString(), dish, steps: spec.steps, sample: spec.sample, measures,
                dishes: variants.length, wall_s: +((performance.now() - t0) / 1000).toFixed(1), rows };
  if (spec.summarise) out.summary = spec.summarise(rows);
  if (save) { try { await fetch(`/save/tank-${spec.name}.json`, { method: 'POST', body: JSON.stringify(out) }); } catch (err) { out.saveError = String(err); } }
  return out;
}
