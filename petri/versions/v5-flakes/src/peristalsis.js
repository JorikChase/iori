// peristalsis.js — the plasmodium's own pump, on the vein graph.
//
// The P1b prototype could not carry this on a continuum grid: explicit phase coupling is unstable at
// a physical timestep, and a body-scale wave needs the elliptic pressure solve as its coupler (proto/
// FINDINGS.md §2). On the graph the pressure solve costs a millisecond, so it can run inside every
// contraction. Each node is a stretch of tube with a volume and a contraction phase:
//
//   phase:     dphi_i/dt = w_i + K sum_j c_ij sin(phi_j - phi_i)     c_ij = edge conductance (Kuramoto)
//   frequency: w_i = w0 (1 + chiA * food_i)                           food makes the local pump faster
//   pump:      s_i = -V_i a_i w_i cos(phi_i)                          contracting tube expels its sol
//              a_i = a0 (1 + chiE * food_i)                           food softens the cortex (Kobayashi)
//   flow:      L p = s,  Q_ij = c_ij (p_i - p_j)                        Kirchhoff, as in tero.js
//
// Averaged over a period the pump is zero at every node, so shuttle streaming alone moves nothing.
// Net transport comes from correlations between the phase field and the flow — study/02 §4.3 — and
// its sign is exactly the unanswered question 2 of the P1b gate. The rectified mean |Q| over a period
// is what the adaptation uses in place of Tero's random source/sink pairs.
//
// Pure functions; tests in tests/peristalsis.test.mjs.

import { components, solvePressure } from './tero.js';

/** Node volumes: half the volume of every incident tube (pi r^2 L), mm^3. */
export function nodeVolumes(g) {
  const V = new Float64Array(g.nodes.length);
  for (const e of g.edges) {
    const r = 0.5 * (e.width_mm || 0.1), vol = Math.PI * r * r * e.len_mm;
    V[e.a] += 0.5 * vol; V[e.b] += 0.5 * vol;
  }
  return V;
}

/**
 * Integrate `periods` contraction periods. Returns per-edge rectified mean flux |Q|, signed mean flux
 * (net transport), the final phases and the phase order parameter.
 *   D: per-edge conductivity (Tero's D); food: per-node attractant 0..1; phi: initial phases (mutated)
 */
export function pump(g, D, food, phi, {
  period = 100, stepsPerPeriod = 32, periods = 3, K = 0.4, chiA = 0.3, chiE = 0.0, a0 = 0.1,
  tracer = null,
} = {}) {
  const Vn = g.nodes.length, E = g.edges.length;
  const { comp, count } = components(g);
  const vol = nodeVolumes(g);
  const cond = Float64Array.from(g.edges, (e, i) => D[i] / Math.max(e.len_mm, 1e-6));
  const w0 = (2 * Math.PI) / period, dt = period / stepsPerPeriod;
  const w = Float64Array.from({ length: Vn }, (_, v) => w0 * (1 + chiA * (food[v] || 0)));
  const amp = Float64Array.from({ length: Vn }, (_, v) => a0 * (1 + chiE * (food[v] || 0)));
  const inc = g.nodes.map(() => []);
  g.edges.forEach((e, i) => { inc[e.a].push(i); inc[e.b].push(i); });
  const Qabs = new Float64Array(E), Qsum = new Float64Array(E);
  const nsteps = periods * stepsPerPeriod;
  const s = new Float64Array(Vn);
  for (let k = 0; k < nsteps; k++) {
    // phase: Kuramoto on the tube network, weighted by conductance (bounded, cannot blow up)
    const dphi = new Float64Array(Vn);
    for (let v = 0; v < Vn; v++) {
      let acc = 0, wsum = 0;
      for (const i of inc[v]) { const e = g.edges[i], u = e.a === v ? e.b : e.a; acc += cond[i] * Math.sin(phi[u] - phi[v]); wsum += cond[i]; }
      dphi[v] = w[v] + (wsum > 0 ? K * w0 * acc / wsum : 0);
    }
    for (let v = 0; v < Vn; v++) phi[v] += dt * dphi[v];
    // pump and flow
    for (let v = 0; v < Vn; v++) s[v] = -vol[v] * amp[v] * w[v] * Math.cos(phi[v]);
    const { p } = solvePressure(g, cond, s, comp, count, { tol: 1e-7 });
    // Upwind transport of a passive tracer (the carried biomass). Every edge reads the tracer as it was
    // at the START of the step and the moves are applied afterwards: updating edge by edge in order let
    // mass cross several edges in one step, which showed up as a spurious drift of ~3 nodes in the
    // direction the edges happen to be listed (measured — it read as "away from food" in every case).
    const moved = tracer ? new Float64Array(Vn) : null;
    for (let i = 0; i < E; i++) {
      const e = g.edges[i], q = cond[i] * (p[e.a] - p[e.b]);
      Qabs[i] += Math.abs(q) / nsteps; Qsum[i] += q / nsteps;
      if (tracer) {
        const up = q > 0 ? e.a : e.b, dn = q > 0 ? e.b : e.a;
        const m = Math.abs(q) * dt * tracer[up] / Math.max(vol[up], 1e-12);   // concentration x volume moved
        moved[up] -= m; moved[dn] += m;
      }
    }
    if (tracer) for (let v = 0; v < Vn; v++) tracer[v] = Math.max(0, tracer[v] + moved[v]);
  }
  let re = 0, im = 0;
  for (let v = 0; v < Vn; v++) { re += Math.cos(phi[v]); im += Math.sin(phi[v]); }
  return { Qabs, Qnet: Qsum, order: Math.hypot(re, im) / Math.max(Vn, 1) };
}

/**
 * The elastic-tube pump — the ingredient the incompressible pump lacks (proto/FINDINGS.md §4).
 * Kobayashi, Tero & Nakagaki 2006 put the direction of transport on the stiffness of the cortex, and
 * stiffness can only act through a compliant wall:
 *
 *   rest volume   V0_i(t) = Vbar_i (1 + a sin phi_i)          the active contraction
 *   wall          p_i = k_i (V_i - V0_i) / Vbar_i              k_i = k0 (1 - chiS food_i): softer at food
 *   flow          Q_ij = c_ij (p_i - p_j),  c_ij ∝ Vmean^2     Poiseuille: conductance ∝ r^4 ∝ (volume per length)^2
 *   volume        dV_i/dt = -sum_j Q_ij                        sol is conserved, nothing is projected away
 *
 * Integrated explicitly (pressure follows from the volumes; no global solve). Returns the drift of the
 * centre of volume along `axis` (node x by default), in the same units as node x.
 */
export function pumpElastic(g, food, phi, {
  period = 100, stepsPerPeriod = 400, periods = 40, K = 0.5, chiA = 0.0, chiS = 0.0, a0 = 0.1, k0 = 1.0, c0 = 0.02,
} = {}) {
  const Vn = g.nodes.length;
  const Vbar = nodeVolumes(g);
  const V = Float64Array.from(Vbar);
  const k = Float64Array.from({ length: Vn }, (_, v) => k0 * (1 - chiS * (food[v] || 0)));
  const w0 = (2 * Math.PI) / period, dt = period / stepsPerPeriod;
  const w = Float64Array.from({ length: Vn }, (_, v) => w0 * (1 + chiA * (food[v] || 0)));
  const inc = g.nodes.map(() => []);
  g.edges.forEach((e, i) => { inc[e.a].push(i); inc[e.b].push(i); });
  const cx = () => { let m = 0, s = 0; for (let v = 0; v < Vn; v++) { m += V[v]; s += V[v] * g.nodes[v].x; } return s / m; };
  const x0 = cx();
  const p = new Float64Array(Vn), dV = new Float64Array(Vn), dphi = new Float64Array(Vn);
  for (let step = 0; step < periods * stepsPerPeriod; step++) {
    for (let v = 0; v < Vn; v++) {
      let acc = 0, n = 0;
      for (const i of inc[v]) { const e = g.edges[i], u = e.a === v ? e.b : e.a; acc += Math.sin(phi[u] - phi[v]); n++; }
      dphi[v] = w[v] + (n ? K * w0 * acc / n : 0);
    }
    for (let v = 0; v < Vn; v++) {
      phi[v] += dt * dphi[v];
      const V0 = Vbar[v] * (1 + a0 * Math.sin(phi[v]));
      p[v] = k[v] * (V[v] - V0) / Vbar[v];
    }
    dV.fill(0);
    for (const e of g.edges) {
      const vm = 0.5 * (V[e.a] / Vbar[e.a] + V[e.b] / Vbar[e.b]);
      const q = c0 * vm * vm * (p[e.a] - p[e.b]);
      dV[e.a] -= q * dt; dV[e.b] += q * dt;
    }
    for (let v = 0; v < Vn; v++) V[v] = Math.max(1e-9, V[v] + dV[v] * Vbar[v]);
  }
  return { drift: cx() - x0, order: (() => { let re = 0, im = 0; for (const f of phi) { re += Math.cos(f); im += Math.sin(f); } return Math.hypot(re, im) / Vn; })() };
}
