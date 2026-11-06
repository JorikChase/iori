// 2.4 Branch modules and 2.5 the ecosystem: paper 0's simulator (papers/fractals/silviculture-core.js, after
// Makowski et al. 2019), unchanged, behind the same interface as the other lineage methods.
//
// The neighbour: the wall is written into the simulator's shared shadow grid (1 m cells, optical depth per cell,
// the same grid every plant shades) as a block of opaque cells, so a module beside it reads its shade as it reads a
// neighbour's crown. Modules test collisions only against modules, so the wall's space is not otherwise taken.
import { Sim, SPECIES, PLOT, HALF, SH_NY } from '../fractals/silviculture-core.js?v=3';
import { Skeleton, WALL, fromSim } from './skeleton.js?v=3';

const NX = PLOT; // SH_CELL = 1 m
export const WALL_DEPTH = 1.2; // optical depth per wall cell (1 m), summed down the wall: opaque below its top, a seedling 2 m away keeps half its light

export function wallDepth() {
  const d = new Float32Array(NX * NX * SH_NY);
  for (let ix = 0; ix < NX; ix++) for (let iz = 0; iz < NX; iz++) for (let y = 0; y < SH_NY; y++) {
    const x = ix - HALF + 0.5, z = iz - HALF + 0.5, yy = y + 0.5;
    if (x > WALL.x0 - 0.5 && x < WALL.x1 + 0.5 && z > WALL.z0 && z < WALL.z1 && yy < WALL.y1) d[(ix * NX + iz) * SH_NY + y] = WALL_DEPTH;
  }
  return d;
}

// one tree, the tolerant species (Table 4 row i) by default
export function createModules() {
  let sim, P = { wall: true, species: 1 };
  const S = new Skeleton(8192);
  return {
    name: 'Branch modules', unit: 'year', max: 120,
    reset(seed = 1, opts = {}) {
      P = { ...P, ...opts };
      sim = new Sim({ seed, mode: 'single', single: P.species });
      sim.extraDep = P.wall ? wallDepth() : null;
      sim.lightPass();
      fromSim(sim.plants, S);
    },
    set(opts) { this.reset(1, opts); },
    step() { if (sim.year >= 120 || !sim.plants.length) return false; sim.step(); fromSim(sim.plants, S); return true; },
    get t() { return sim.year; },
    skeleton: () => S,
    get sim() { return sim; },
  };
}

// the whole plot: two species, seeding, senescence, succession (paper 0's forest figure), beside the wall
export function createEcosystem() {
  let sim, P = { wall: true, mix: 0.3 };
  return {
    name: 'Ecosystem', unit: 'year', max: 400, plot: true,
    reset(seed = 1, opts = {}) {
      P = { ...P, ...opts };
      sim = new Sim({ seed, mode: 'forest', mix: P.mix });
      // no seedling inside the wall
      if (P.wall) {
        for (const p of sim.plants) if (p.x > WALL.x0 - 0.3 && p.x < WALL.x1 + 0.3 && p.z > WALL.z0 && p.z < WALL.z1) { for (const m of p.mods) sim.release(m); p.mods.length = 0; p.dead = true; }
        sim.plants = sim.plants.filter((p) => !p.dead);
        const add = sim.addPlant.bind(sim);
        sim.addPlant = (sp, x, z) => (x > WALL.x0 - 0.3 && x < WALL.x1 + 0.3 && z > WALL.z0 && z < WALL.z1 ? { mods: [], dead: true, sp, x, z, age: 0 } : add(sp, x, z));
      }
      sim.extraDep = P.wall ? wallDepth() : null;
      sim.lightPass();
    },
    set(opts) { this.reset(1, opts); },
    step() { if (sim.year >= 400) return false; sim.step(); return true; },
    get t() { return sim.year; },
    skeleton: () => null,
    get sim() { return sim; },
    stats() {
      let pio = 0, tol = 0, h = 0, near = 0, nearN = 0, far = 0, farN = 0;
      for (const p of sim.plants) {
        if (p.sp.key === 'pioneer') pio++; else tol++;
        if (p.height > h) h = p.height;
        if (p.stemD >= 0.05) { const d = WALL.x0 - p.x; if (d > 0 && d < 6) { near += p.height; nearN++; } else if (d >= 6) { far += p.height; farN++; } }
      }
      return { pioneer: pio, tolerant: tol, height: h, nearH: nearN ? near / nearN : NaN, farH: farN ? far / farN : NaN };
    },
  };
}
export { SPECIES };
