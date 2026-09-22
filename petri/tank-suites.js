// tank-suites.js — the think tank's first four experiment families (study/07 §3). Each is a function
// returning a spec for tank.js, so a scheme after the MVP is a new entry here, not new machinery.
// Run one:  node petri/tools/bench.mjs --tank catalogue      (or --tank competitions,sweep,replicates)
import { CATALOG } from './catalog.js';
import { fixture36 } from './fixture.js';

const inoc = (organism, at, r) => ({ t: 0, tool: 'inoculate', organism, at, r });

export const SUITES = {
  // Every organism alone in a 6 mm micro-dish: alive? how big, what shape? A regression net — compare a
  // run with the previous one; a row that changes says which organism moved.
  catalogue: ({ steps = 3000 } = {}) => ({
    name: 'catalogue', dish: { dishMm: 6, nutrient: 0.8, agar: 0.5 }, steps, sample: steps / 2,
    vary: { organism: CATALOG.map((o) => o.id) }, seed: () => 17,
    ops: (v) => [inoc(v.organism, [0, 0], 1.2)], measure: ['census', 'shape'], parallel: 32,
    summarise: (rows) => {
      const end = rows.map((r) => ({ organism: r.v.organism, area: r.samples.at(-1).census.slots.reduce((a, s) => a + s.area_mm2, 0) }));
      return { dead: end.filter((x) => x.area === 0).map((x) => x.organism), alive: end.filter((x) => x.area > 0).length };
    },
  }),

  // Pairs sharing an 8 mm dish, 5 mm apart. Within each category every pair (both placements), plus one
  // sampled partner from every other category. Outcome: who holds more ground, and do both survive.
  competitions: ({ steps = 4000, perCategoryPairs = true } = {}) => {
    const byCat = {}; for (const o of CATALOG) (byCat[o.category] ||= []).push(o.id);
    const cats = Object.keys(byCat), pairs = [];
    if (perCategoryPairs) for (const ids of Object.values(byCat)) for (const a of ids) for (const b of ids) if (a !== b) pairs.push([a, b]);
    for (const c of cats) for (const d of cats) if (c < d) pairs.push([byCat[c][0], byCat[d][0]]);
    return {
      name: 'competitions', dish: { dishMm: 8, nutrient: 0.8, agar: 0.5 }, steps, sample: steps,
      vary: { pair: pairs }, seed: () => 23,
      ops: (v) => [inoc(v.pair[0], [-2.5, 0], 1.0), inoc(v.pair[1], [2.5, 0], 1.0)], measure: ['census'], parallel: 32,
      summarise: (rows) => rows.map((r) => {
        const s = r.samples.at(-1).census.slots, A = s[0]?.area_mm2 || 0, B = s[1]?.area_mm2 || 0, T = A + B;
        return { a: r.v.pair[0], b: r.v.pair[1], shareA: T ? +(A / T).toFixed(3) : null, coexist: T > 0 && Math.min(A, B) / T > 0.05 };
      }),
    };
  },

  // One organism over a nutrient x agar grid (the Fujikawa–Matsushita diagram, dense instead of 5
  // points). Scale-dependent shape metrics: 12 mm dishes, and the shrink check decides trust (study/07 §4).
  sweep: ({ organism = 'bacillus-subtilis-dla-like', steps = 8000, grid = 5 } = {}) => {
    const g = Array.from({ length: grid }, (_, k) => +(0.15 + (0.85 * k) / (grid - 1)).toFixed(3));
    return {
      name: `sweep-${organism}`, dish: { dishMm: 12, nutrient: 0.6, agar: 0.5 }, steps, sample: steps,
      vary: { nutrient: g.map((x) => x * 1.2), agar: g }, seed: () => 101,
      medium: (v) => ({ nutrient: v.nutrient, agar: v.agar }), ops: () => [inoc(organism, [0, 0], 0.6)],
      measure: ['shape'], parallel: 16,
    };
  },

  // Tero's fixture replicated at Tero's own n = 21. Full 45 mm dish (the layout is scale-dependent), so
  // the gain here is overlap of the graph workers only; parallel is limited by GPU memory.
  replicates: ({ n = 21, steps = 36000 } = {}) => {
    const food = fixture36();
    return {
      name: 'tero-replicates', dish: { nutrient: 0.3, agar: 0.5 }, steps, sample: 3000,
      vary: { seed: Array.from({ length: n }, (_, k) => 2010 + k) }, seed: (v) => v.seed, food: () => food,
      ops: () => [inoc('physarum-polycephalum-adaptive-network', food[0], 4), ...food.map((p) => ({ t: 0, tool: 'flake', at: p, r: 1.2, amount: 3 }))],
      measure: ['tero'], parallel: 6,
      summarise: (rows) => {
        const fin = rows.map((r) => r.samples.at(-1).tero || {}), k = (f) => fin.map(f).filter(Number.isFinite);
        const ms = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return [+m.toFixed(3), +Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(a.length - 1, 1)).toFixed(3)]; };
        return { n: fin.length, coverageMin: Math.min(...k((f) => f.coverage)), TL_MST: ms(k((f) => f.TL_MST)), MD_MST: ms(k((f) => f.MD_MST)), FT: ms(k((f) => f.FT)) };
      },
    };
  },
};
