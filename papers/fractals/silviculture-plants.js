/*
 * silviculture-plants.js — the plant catalogue shared by the specimens, the focus plot and the region.
 *
 * Every form is a Table 4 row of Makowski et al. 2019 (growth constants), a Table 3 plasticity set (seeding,
 * shade tolerance, climate optimum) and a Hallé–Oldeman architecture from silviculture-core.js. Ours, listed:
 *  - Which row and architecture stand for which plain-word form (the paper names its species only as pictures).
 *  - Hmax: a JABOWA-style species height asymptote (Botkin et al. 1972 used Hmax and Dmax per species); the values
 *    are typical adult heights from memory, not from a source. Without it, rows that never switch to λ_mature
 *    grow 50–70 m poles in this reduced model.
 *  - latElev (branch elevation), sprout (chance a shed branch leaves a dormant bud that re-sprouts), reit
 *    (reiteration: a vigorous lateral of a flowering tree becomes a new trunk), stemD (palm stem diameter: an
 *    unbranched stem has one tip, so the pipe model alone would give it 4 cm).
 *  - Climate optima T_A (mean annual °C) set near the middle of each genus's European range, from memory (flagged):
 *    spruce 3, fir 6, pine 7, beech 8, elm 10, poplar 11, willow 9, birch 4, the multi-stem shrub 1 (a treeline
 *    shrub such as green alder or dwarf pine), candelabra 19, palm 22; P_A as set below; and the region type (pft).
 *  - Deadwood group: 'soft' (gymnosperm, k_ref 0.01/yr) or 'hard' (angiosperm, k_ref 0.03/yr), after Harmon et
 *    al. 1986 as quoted second-hand in the landscape research.
 *  - Colours: 'draw' is the ink-drawing tint, 'nat' the natural one; bark is ink or brown (silviculture-draw.js).
 */
import { speciesFromTable } from './silviculture-core.js';

export const PLANTS = [
  { key: 'fir', name: 'layered conifer', arch: 'massart', row: 'j', plast: 'conifer', Hmax: 40, L: 0.8, pft: 'conifer', wood: 'soft',
    TA: 6, PA: 900, leaf: 'needle', leafSize: 0.55, draw: 0x4e6b5c, nat: 0x2f4f36, shape: 'cone' },
  { key: 'spruce', name: 'spire conifer', arch: 'roux', row: 'k', plast: 'conifer', Hmax: 38, L: 0.8, pft: 'conifer', wood: 'soft',
    TA: 3, PA: 800, leaf: 'needle', leafSize: 0.5, draw: 0x55705f, nat: 0x2b4733, shape: 'spire' },
  { key: 'pine', name: 'open pine', arch: 'rauh', row: 'h', plast: 'conifer', Hmax: 28, L: 0.85, pft: 'conifer', wood: 'soft',
    TA: 7, PA: 600, leaf: 'needle', leafSize: 0.55, draw: 0x637a5e, nat: 0x40603a, shape: 'umbrella' },
  { key: 'elm', name: 'arching vase', arch: 'troll', row: 'f', plast: 'deciduous', Hmax: 30, L: 0.85, pft: 'broadleaf', wood: 'hard',
    TA: 10, PA: 900, leaf: 'broad', leafSize: 0.65, draw: 0x9aae72, nat: 0x5f8a3a, shape: 'vase', sprout: 0.3 },
  { key: 'poplar', name: 'columnar', arch: 'attims', row: 'o', plast: 'deciduous', Hmax: 32, L: 0.85, pft: 'riparian', wood: 'hard',
    TA: 11, PA: 1300, leaf: 'broad', leafSize: 0.55, draw: 0xa3b27a, nat: 0x6d9440, shape: 'column', sprout: 0.4 },
  { key: 'willow', name: 'weeping willow', arch: 'troll', row: 'f', plast: 'deciduous', Hmax: 16, L: 0.85, pft: 'riparian', wood: 'hard',
    TA: 9, PA: 1600, leaf: 'needle', leafSize: 0.55, draw: 0x9fb58a, nat: 0x7fa04e, shape: 'droop', latElev: -0.6, sprout: 0.5 },
  { key: 'birch', name: 'pioneer', arch: 'makowski', row: 'n', plast: 'fig7sparse', Hmax: 25, L: 0.85, pft: 'pioneer', wood: 'hard',
    TA: 4, PA: 700, leaf: 'broad', leafSize: 0.5, draw: 0xb3b878, nat: 0x8daa45, shape: 'tall', sTol: 0.1 },
  { key: 'beech', name: 'round shade-tolerant broadleaf', arch: 'makowski', row: 'i', plast: 'conifer', Hmax: 35, L: 0.8, pft: 'broadleaf', wood: 'hard',
    TA: 8, PA: 900, leaf: 'broad', leafSize: 0.7, draw: 0x6f8d63, nat: 0x4a7232, shape: 'round', sTol: 0.6, reit: true },
  { key: 'candelabra', name: 'candelabra', arch: 'leeuwenberg', row: 'm', plast: 'shrub', Hmax: 14, L: 0.85, pft: 'arid', wood: 'hard',
    TA: 19, PA: 400, leaf: 'broad', leafSize: 0.45, draw: 0xb7b07e, nat: 0x8a8f4a, shape: 'dome' },
  { key: 'palm', name: 'palm', arch: 'corner', row: 'c', plast: 'deciduous', Hmax: 18, L: 0.9, pft: 'palm', wood: 'hard',
    TA: 22, PA: 1400, leaf: 'frond', leafSize: 1.4, draw: 0x8fa36a, nat: 0x5e8a34, shape: 'palm', stemD: 0.35 },
  { key: 'hazel', name: 'multi-stem shrub', arch: 'collar', row: 'n', plast: 'shrub', Hmax: 6, L: 0.6, pft: 'shrub', wood: 'hard',
    TA: 1, PA: 700, leaf: 'broad', leafSize: 0.42, draw: 0xa9a77a, nat: 0x6f8b3e, shape: 'dome', sprout: 0.4 },
];
export const PLANT = Object.fromEntries(PLANTS.map((p) => [p.key, p]));

/** species object for the module model from a catalogue entry */
export function speciesOf(d, extra = {}) {
  const o = { arch: d.arch, Hmax: d.Hmax, L: d.L, label: d.name, key: d.key, TA: d.TA, PA: d.PA, leafSize: d.leafSize };
  for (const k of ['latElev', 'sprout', 'reit', 'stemD', 'sTol']) if (d[k] != null) o[k] = d[k];
  return speciesFromTable(d.row, d.plast, { ...o, ...extra });
}
