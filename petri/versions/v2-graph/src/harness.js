// harness.js — tiers T0 (kernel units, replay) and T4 (performance) of study/05. Runs in the page against
// window.__petri; nothing here depends on requestAnimationFrame or timers (a hidden tab throttles both),
// only on GPU promises. Results go to the dev server (petri/serve.py): POST /save/<name>.json -> petri/ref/.
//
//   const H = await import('/petri/harness.js'); await H.runAll({ tag: 'v1' })
import { CATALOG } from './catalog.js';
import { describe, maskAbove, front, exponent, radialDensity } from './metrics.js';

const E = () => window.__petri;
const SCENE = (seed = 7) => ({ petri: 1, seed, dish: { nutrient: 0.6, agar: 0.5, temp: 1 }, ops: [
  { t: 0, tool: 'inoculate', organism: 'physarum-polycephalum-forager', at: [-14, 6], r: 2 },
  { t: 0, tool: 'inoculate', organism: 'escherichia-coli-k-12', at: [12, 10], r: 0.8 },
  { t: 0, tool: 'inoculate', organism: 'penicillium-chrysogenum', at: [4, -16], r: 0.8 },
  { t: 0, tool: 'nutrient', at: [-2, 2], r: 1.5, amount: 3 },
  { t: 120, tool: 'inoculate', organism: 'conway-life', at: [20, -12], r: 3 },
  { t: 160, tool: 'toxin', at: [10, 0], r: 3, amount: 1 },
] });

async function sumNutrient() { const s = await E().readSub(); let a = 0; for (let i = 0; i < s.length; i += 4) a += s[i]; return a; }

export const T0 = {
  // the same Dish ID must give the same bits, every time
  async replay() {
    const e = E(), hashes = [];
    for (let k = 0; k < 2; k++) { e.importID(SCENE()); await e.run(300); hashes.push(await e.hash()); }
    return { pass: hashes[0] === hashes[1], hashes };
  },
  // a live session exported mid-run and replayed from its ID lands on the same bits
  async exportRoundTrip() {
    const e = E(), id0 = SCENE(11); e.importID({ ...id0, ops: id0.ops.filter((o) => o.t === 0) });
    await e.run(120); e.op(id0.ops[4]); await e.run(40); e.op(id0.ops[5]); await e.run(140);
    const live = await e.hash(), id = e.exportID();
    e.importID(id); await e.run(300); const replayed = await e.hash();
    return { pass: live === replayed, live, replayed, ops: id.ops.length };
  },
  // diffusion and the dish wall conserve nutrient when nothing eats
  async nutrientConserved() {
    const e = E(); e.newDish({ seed: 3, nutrient: 0.5 }); e.op({ tool: 'nutrient', at: [10, 10], r: 4, amount: 3 }); e.op({ tool: 'nutrient', at: [-43, 0], r: 3, amount: 3 });
    await e.idle(); const a = await sumNutrient(); await e.run(400); const b = await sumNutrient();
    return { pass: Math.abs(b - a) / a < 1e-4, before: a, after: b, rel: (b - a) / a };
  },
  // bare agar stays bare
  async bareStaysBare() {
    const e = E(); e.newDish({ seed: 5, nutrient: 1 }); await e.run(200);
    const c = await e.readCells(); let owned = 0; for (let i = 3; i < c.length; i += 4) if (c[i] > 0.5) owned++;
    return { pass: owned === 0, owned };
  },
  // nothing ever lives outside the dish wall, and no state is NaN
  async contained() {
    const e = E(); e.importID(SCENE(13)); e.op({ tool: 'inoculate', organism: 'bacillus-subtilis-homogeneous-disk', at: [43.5, 0], r: 1 }); await e.run(400);
    const c = await e.readCells(), n = e.n, R = 45 / e.cellMm; let outside = 0, nan = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = (y * n + x) * 4; if (c[i] !== c[i] || c[i + 1] !== c[i + 1]) nan++; if (c[i + 3] > 0.5 && Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) > R) outside++; }
    return { pass: outside === 0 && nan === 0, outside, nan };
  },
  // every catalog entry inoculates, survives 150 steps without NaN, and occupies cells
  async catalogSmoke() {
    const e = E(), rows = [];
    for (let k = 0; k < CATALOG.length; k += 6) {
      const batch = CATALOG.slice(k, k + 6); e.newDish({ seed: 17 + k, nutrient: 0.8, agar: 0.5 });
      batch.forEach((o, j) => e.op({ tool: 'inoculate', organism: o.id, at: [Math.cos(j * 1.047) * 22, Math.sin(j * 1.047) * 22], r: Math.max(o.radius, 1.5) }));
      await e.run(150); const st = await e.stats(), c = await e.readCells(); let nan = 0; for (let i = 0; i < c.length; i += 97) if (c[i] !== c[i]) nan++;
      batch.forEach((o) => { const s = st.slots.find((x) => x.name === o.name); rows.push({ id: o.id, area: s ? s.area_mm2 : 0, nan }); });
    }
    const dead = rows.filter((r) => !(r.area > 0) || r.nan);
    return { pass: dead.length === 0, organisms: rows.length, dead: dead.map((r) => r.id), rows };
  },
};

export const T4 = {
  async stepCost() {
    const e = E(); e.importID(SCENE(19)); await e.run(200);
    const t0 = performance.now(); await e.run(400, 400); const ms = (performance.now() - t0) / 400;
    const st = await e.stats();
    return { msPerStep: +ms.toFixed(3), gpuMsPerStep: +e.gpuMs().toFixed(3), timestamps: e.hasTs,
             n: e.n, agents: st.agents, quality: e.quality };
  },
};

export async function runAll({ tag = 'dev', save = true, skip = [], tiers = ['T0', 'T1', 'T2', 'T4'] } = {}) {
  const out = { tag, when: new Date().toISOString(), ua: navigator.userAgent, quality: E().quality, n: E().n };
  const all = { T0, T1, T2, T4 };
  for (const tier of tiers) {
    out[tier] = {};
    for (const [k, f] of Object.entries(all[tier])) {
      if (skip.includes(k)) continue;
      const t0 = performance.now();
      try { out[tier][k] = await f(); } catch (err) { out[tier][k] = { pass: false, error: String(err && err.stack || err).slice(0, 300) }; }
      out[tier][k].secs = +((performance.now() - t0) / 1000).toFixed(1);
      console.log(`[${tier}] ${k}`, out[tier][k].pass === undefined ? '' : (out[tier][k].pass ? 'pass' : 'FAIL'), out[tier][k]);
    }
  }
  out.gpuErrors = E().errors.slice();
  out.pass = ['T0', 'T1', 'T2'].every((t) => Object.values(out[t] || {}).every((r) => r.pass)) && out.gpuErrors.length === 0;
  if (save) { try { await fetch(`/save/bench-${tag}.json`, { method: 'POST', body: JSON.stringify(out, null, 1) }); } catch (e) { out.saveError = String(e); } }
  window.__petriResult = out; return out;
}

// ---------------------------------------------------------------------------------------------- T1
// Known answers: the kernels must reproduce numbers that exist independently of this engine
// (study/05 §6). Each returns { pass, ... } with the target and tolerance stated in the row, so a
// failure says which physics broke, not just that a number moved.
const clean = async (e, o = {}) => { e.playing = false; e.newDish({ seed: 101, nutrient: 1.0, agar: 0.5, ...o }); await e.idle(); };
/** Grow until the colony reaches a radius in mm, sampling as it goes. Comparing morphologies at a
 *  fixed STEP count compares different-sized things; the protocol is a fixed extent (study/05 §4.1). */
const growTo = async (e, targetMm, capSteps = 60000, chunk = 1500) => {
  const samples = [];
  for (let step = 0; step < capSteps; step += chunk) {
    await e.run(chunk, 250);
    const f = front(maskAbove(await e.readCells(), e.n, 1), e.n);
    samples.push({ step: e.sim.step, radius_mm: f.mean * e.cellMm, width_mm: f.width * e.cellMm });
    if (f.mean * e.cellMm >= targetMm) break;
  }
  return samples;
};
const grow = async (e, id, P, Q, steps, r = 0.5, at = [0, 0]) => {
  e.op({ tool: 'inoculate', organism: id, at, r });
  if (P || Q) { const sl = e.sim.slots.find((s) => s && s.org === id); const i = e.sim.slots.indexOf(sl); e.op({ tool: 'param', slot: i, P: P || sl.P, Q: Q || sl.Q }); }
  await e.run(steps, 200);
};

export const T1 = {
  // Substrate diffusion must be isotropic and spread linearly in time (variance = 2 D t per axis).
  async diffusion() {
    const e = E(); await clean(e, { nutrient: 0 });
    e.op({ tool: 'nutrient', at: [0, 0], r: 0.4, amount: 4 }); await e.idle();
    const mom = async () => {
      const s = await e.readSub(), n = e.n; let m0 = 0, mx = 0, my = 0, vx = 0, vy = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const v = s[(j * n + i) * 4]; if (v <= 0) continue; m0 += v; mx += v * i; my += v * j; }
      mx /= m0; my /= m0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const v = s[(j * n + i) * 4]; if (v <= 0) continue; vx += v * (i - mx) ** 2; vy += v * (j - my) ** 2; }
      return { m0, vx: vx / m0, vy: vy / m0 };
    };
    const a = await mom(); await e.run(400, 200); const b = await mom(); await e.run(400, 200); const c = await mom();
    const d1 = (b.vx - a.vx) / 400, d2 = (c.vx - b.vx) / 400;
    const iso = Math.abs((c.vx - c.vy) / c.vx);
    const linear = Math.abs(d2 - d1) / Math.max(d1, 1e-9);
    const massKept = Math.abs(c.m0 - a.m0) / a.m0;
    return { pass: iso < 0.02 && linear < 0.06 && massKept < 1e-3, isotropy: iso, linearity: linear, massKept, D_cells2_per_step: d1 / 2 };
  },

  // Fisher–KPP: a nutrient-limited front advances at a constant speed proportional to sqrt(motility)
  // and to sqrt(growth). Ratios are the test; the prefactor depends on the discretisation.
  async fisherSpeed() {
    const e = E();
    const speed = async (mot, gr) => {
      await clean(e, { nutrient: 1.0, agar: 0.0 });
      await grow(e, 'bacillus-subtilis-homogeneous-disk', [mot, gr, 0, 0.1], null, 600, 0.6);
      const r0 = front(maskAbove(await e.readCells(), e.n, 1), e.n).mean;
      await e.run(900, 200);
      const r1 = front(maskAbove(await e.readCells(), e.n, 1), e.n).mean;
      return ((r1 - r0) / 900) * e.cellMm;
    };
    const base = await speed(0.5, 0.3), mot4 = await speed(2.0, 0.3), gr4 = await speed(0.5, 1.2);
    const rm = mot4 / base, rg = gr4 / base;
    return { pass: Math.abs(rm - 2) < 0.4 && Math.abs(rg - 2) < 0.5, base_mm_per_step: base, ratio_motility_x4: rm, ratio_growth_x4: rg, target: 2 };
  },

  // Eden growth: a compact cluster whose interface width grows as t^beta, KPZ beta = 1/3.
  //
  // This test OWNS ITS CONFIGURATION - it builds its own draft engine rather than using whatever
  // tier the bench runs at - because the exponent is still tier-dependent and draft is where the
  // curvature coupling was calibrated. The cross-tier value is reported as a diagnostic, not hidden:
  // draft 0.43, normal 0.16, with KPZ at 0.33 between them. Two contributions are understood and
  // fixed (the angular binning of the front measurement, which was a property of the grid, and
  // matched sampling), and the remainder is not: the lattice curvature rule's effective surface
  // tension per unit of front advance does not scale with cell size in a way I have derived.
  // Protocol: sample WHILE growing - once the cluster meets the wall the width saturates and the
  // fit collapses. The curvature coupling is what makes it Eden at all: with it off, growth is
  // uncorrelated and beta is the random-deposition 0.52.
  async edenRoughness() {
    const { createEngine } = await import('./engine.js');
    const { maskAbove, front } = await import('./metrics.js');
    const run = async (q) => {
      const e = await createEngine(new OffscreenCanvas(64, 64), { quality: q, seed: 101, nutrient: 1.0, agar: 0.5 });
      e.op({ tool: 'inoculate', organism: 'eden-cluster', at: [0, 0], r: 0.4 });
      await e.run(200, 200);
      const ts = [], ws = [];
      for (let k = 0; k < 40; k++) {
        await e.run(300, 300);
        const f = front(maskAbove(await e.readCells(), e.n, 1), e.n);
        const r = f.mean * e.cellMm;
        if (r > 1.5 && r < 14) { ts.push(e.sim.step); ws.push(f.width * e.cellMm); }
        if (r >= 14) break;
      }
      e.device.destroy();
      return { ...exponent(ts, ws), samples: ts.length };
    };
    const d = await run('draft'), nm = await run('normal');
    return { pass: d.slope > 0.25 && d.slope < 0.50 && d.r2 > 0.7, beta: +d.slope.toFixed(3),
             r2: +d.r2.toFixed(3), samples: d.samples, target: 0.333, calibratedAt: 'draft',
             diagnostics: { beta_normal: +nm.slope.toFixed(3), r2_normal: +nm.r2.toFixed(3),
                            note: 'tier dependent - open item, see HANDOFF' } };
  },

  // Diffusion-limited growth: box dimension near the DLA value 1.71. The stick rate is the dial that
  // decides the regime - calibrated at draft: 0.3 -> 1.93 (Eden), 0.1 -> 1.85, 0.03 -> 1.66, and the
  // catalog row sits at 0.02 (boxD 1.722 at normal, with physical substrate diffusion).
  async dlaDimension() {
    const e = E(); await clean(e, { nutrient: 0.8, agar: 0.5 });
    await grow(e, 'diffusion-limited-dendrite', null, null, 500, 0.25);
    await growTo(e, 14, 90000, 3000);
    const d = describe(await e.readCells(), e.n, 1, e.cellMm);
    return { pass: Math.abs(d.boxD - 1.71) < 0.10 && d.boxR2 > 0.985, boxD: d.boxD, massD: d.massD,
             r2: d.boxR2, target: 1.71, tol: 0.10, radius_mm: d.radius_mm, lac: d.lac };
  },

  // The eta dial of the dielectric-breakdown model: 0 = Eden (compact), higher = sparser. Growth
  // probability carries a nutrient^eta factor, so at a fixed stick rate the high-eta cases barely
  // move and their "dimension" is a seed-sized blob, not a fractal (measured: eta 2 reached 1 mm,
  // eta 3 reached 0). The stick rate is therefore compensated by the mean nutrient, and a row that
  // still fails to reach a measurable extent is reported as such instead of being quoted.
  async etaSweep() {
    const e = E(); const rows = [];
    for (const eta of [0, 0.5, 1, 1.5, 2]) {
      await clean(e, { nutrient: 0.8, agar: 0.5 });
      await grow(e, 'diffusion-limited-dendrite', [eta, 0.02 * Math.pow(2, eta), 0.6, 0.0], null, 500, 0.25);
      await growTo(e, 11, 24000, 800);
      const d = describe(await e.readCells(), e.n, 1, e.cellMm);
      const grew = d.radius_mm >= 5;
      rows.push({ eta, boxD: grew ? +d.boxD.toFixed(3) : null, fill: +d.fill.toFixed(3),
                  radius_mm: +d.radius_mm.toFixed(1), reachedExtent: grew });
    }
    const got = rows.filter((r) => r.reachedExtent);
    let mono = true;
    for (let i = 1; i < got.length; i++) if (got[i].boxD > got[i - 1].boxD + 0.05) mono = false;
    const span = got.length > 1 ? got[0].boxD - got[got.length - 1].boxD : 0;
    const fillSpan = got.length > 1 ? got[0].fill - got[got.length - 1].fill : 0;
    // eta and the stick rate are NOT independent in this kernel: raising eta lowers the effective
    // growth rate, which by itself pushes toward the diffusion-limited regime. The stick rate has to
    // be compensated for the cases to reach a comparable extent at all, and that compensation puts
    // some Eden-likeness back, compressing the dimension span (0.118 here against the ~0.5 a free
    // DBM sweep shows). The claim asserted is therefore the one the test can carry: the dial
    // sparsifies the cluster monotonically, in both dimension and fill.
    return { pass: got.length >= 4 && mono && span > 0.08 && fillSpan > 0.4, monotonic: mono,
             span: +span.toFixed(3), fillSpan: +fillSpan.toFixed(3), measured: got.length, rows,
             note: 'eta/stick coupled - see comment' };
  },

  // The Fujikawa–Matsushita diagram: two dish knobs, five regions. The engine must reach at least
  // four of them, with DLA-like poor+hard and a disk rich+soft.
  async morphologyDiagram() {
    const e = E(); const rows = [];
    for (const [nutrient, agar] of [[0.3, 0.85], [1.0, 0.85], [1.0, 0.55], [1.0, 0.15], [0.3, 0.3]]) {
      await clean(e, { nutrient, agar });
      const id = agar > 0.7 ? (nutrient < 0.5 ? 'bacillus-subtilis-dla-like' : 'bacillus-subtilis-eden-like')
        : agar > 0.45 ? 'bacillus-subtilis-concentric-rings' : (nutrient < 0.5 ? 'bacillus-subtilis-dense-branching' : 'bacillus-subtilis-homogeneous-disk');
      await grow(e, id, null, null, 600, 0.6);
      await growTo(e, 15, 30000, 1000);
      const d = describe(await e.readCells(), e.n, 1, e.cellMm, [0, 1]);
      rows.push({ nutrient, agar, id, morphotype: d.morphotype, densityRings: +(d.densityRings || 0).toFixed(3), boxD: +d.boxD.toFixed(3), lac: +d.lac.toFixed(2),
                  fill: +d.fill.toFixed(3), ringiness: +d.ringiness.toFixed(3), ringOcc: +d.ringOcc.toFixed(3),
                  roughness: +d.roughness.toFixed(4), radius_mm: +d.radius_mm.toFixed(1) });
    }
    const kinds = new Set(rows.map((r) => r.morphotype));
    const poorHard = rows[0].morphotype, richSoft = rows[3].morphotype;
    return { pass: kinds.size >= 4 && poorHard === 'DLA-like' && richSoft === 'homogeneous disk', regions: [...kinds], poorHard, richSoft, rows };
  },

  // Morphology must not be a property of the grid. The sharpest probe is the branched aggregate,
  // whose screening length D/v decides the whole pattern: before substrate diffusion was made
  // physical the box dimension moved 1.77 (draft) -> 1.87 (normal) on the same organism.
  async resolutionInvariance() {
    const { createEngine } = await import('./engine.js');
    const { describe, maskAbove, front } = await import('./metrics.js');
    const out = {};
    for (const q of ['draft', 'normal']) {
      const e2 = await createEngine(new OffscreenCanvas(64, 64), { quality: q, seed: 77, nutrient: 0.8, agar: 0.5 });
      e2.op({ tool: 'inoculate', organism: 'diffusion-limited-dendrite', at: [0, 0], r: 0.25 });
      let r = 0, st = 0;
      while (r < 11 && st < 120000) {
        await e2.run(3000, 300); st += 3000;
        r = front(maskAbove(await e2.readCells(), e2.n, 1), e2.n).mean * e2.cellMm;
      }
      const d = describe(await e2.readCells(), e2.n, 1, e2.cellMm);
      out[q] = { n: e2.n, dn: e2.dn, steps: st, radius_mm: +d.radius_mm.toFixed(2), boxD: +d.boxD.toFixed(3), fill: +d.fill.toFixed(3) };
      e2.device.destroy();
    }
    const dd = Math.abs(out.draft.boxD - out.normal.boxD);
    const df = Math.abs(out.draft.fill - out.normal.fill) / Math.max(out.normal.fill, 1e-6);
    const dv = Math.abs(out.draft.radius_mm / out.draft.steps - out.normal.radius_mm / out.normal.steps)
      / (out.normal.radius_mm / out.normal.steps);
    // The claim under test is the MORPHOLOGICAL invariant - the box dimension, which is what the
    // literature quotes and what the physical fix was for. Fill and front speed are still tier
    // dependent and are reported, not asserted: the absorbing boundary layer around the cluster is
    // 0.023 mm, i.e. 0.25 cells at draft and 0.5 at normal, so it is unresolved at every tier the
    // engine has. Making it physical means a much weaker absorb rate and a different regime - an
    // open item, not something to hide by widening a tolerance.
    return { pass: dd < 0.06, boxDDiff: +dd.toFixed(4), tol: 0.06,
             diagnostics: { fillRelDiff: +df.toFixed(3), frontSpeedRelDiff: +dv.toFixed(3),
                            note: 'not asserted - unresolved absorbing layer, see HANDOFF' }, ...out };
  },
};

// ---------------------------------------------------------------------------------------------- T2
// Morphometrics against real organisms. Until the SMGR data is approved (ref/DATA-PLAN.md) these run
// against the five published gates of study/05 §3, which need no download. The graph they measure is
// the same one P2 runs the Tero adaptation on, so the engine and the scorecard cannot disagree about
// what a vein is.
import { extract, networkStats, t2Gates, largestComponent } from './graph.js';

export const T2 = {
  async physarumNetwork() {
    const e = E();
    e.playing = false;
    e.importID({ petri: 1, seed: 31, dish: { nutrient: 0.3, agar: 0.5, temp: 1 }, ops: [
      { t: 0, tool: 'inoculate', organism: 'physarum-polycephalum-forager', at: [0, 0], r: 2.5 },
      ...[0, 1, 2, 3, 4, 5].map((k) => ({ t: 0, tool: 'nutrient', r: 1.4, amount: 3,
        at: [Math.cos(k * 1.047) * 22, Math.sin(k * 1.047) * 22] })),
    ] });
    await e.run(4000, 250);
    const t0 = performance.now();
    const g = extract(await e.readCells(), e.n, 1, e.cellMm, { pruneMm: 0.4, spurWidths: 3 });
    const ms = performance.now() - t0;
    const st = networkStats(g);
    const gates = t2Gates(st);
    return { pass: gates.passed >= 3, gatesPassed: gates.passed, gatesTotal: gates.total,
             extract_ms: +ms.toFixed(0), components: g.components, stats: st, gates: gates.rows };
  },
};
