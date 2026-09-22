// kernels.js — the growth kernels of the petri engine, as WGSL.
//
// Following AUTOMATA_CATALOG.md and flame-strains.html: a handful of kernels, and every named
// organism is a parameter set, not code (catalog.js). A dish has 8 SLOTS; each slot is bound to one
// catalog entry: slotK[slot].x names the kernel, slotP/slotQ carry its eight parameters.
// A cell is vec4f: rgb = state (meaning per kernel), a = slot id (0 = bare agar). Two slots may run
// the same kernel as rival strains; a kernel only ever sees neighbours of its own slot.
//
// Substrate, shared by all kernels, vec4f per cell: r nutrient, g attractant signal, b toxin
// (antibiotic, salt), a sheath (extracellular deposit left behind: slime trail, EPS).
//
// Kernels (state channel semantics):
//   1 PHYSARUM   agents + trail (K9 + K3). r trail, g smoothed agent density, b age.
//                P = (sensor angle deg, turn angle deg, sensor offset mm, speed cells/step)
//                Q = (deposit, trail persistence, food weight, sheath avoidance)
//   2 COLONY     nutrient-limited reaction-diffusion with nonlinear motility (Kawasaki/Mimura).
//                r active cells, g inactive (sporulated), b smoothed thickness.
//                P = (motility, growth, sporulation, quenched noise)  Q = (ring period, ring duty, yield, -)
//   3 LAPLACIAN  stochastic aggregation on the nutrient field (Eden -> DLA -> needles by eta).
//                r solid, g age, b grain.  P = (eta, stick p, absorb, compactness)
//   4 MYCELIUM   hyphal tips as cell states: tips advance, wobble, branch, fuse on contact.
//                r hypha, g tip heading/2pi (0 = no tip), b age.
//                P = (branch p, wobble rad, tip speed, branch angle rad)  Q = (nutrient use, crowd cap, lateral p, -)
//   5 EXCITABLE  Barkley medium on a spreading lawn (Dictyostelium cAMP waves, spirals).
//                r lawn, g activator u, b recovery v.  P = (a, b, eps, D)  Q = (spread p, fire p, -, -)
//   6 GRAYSCOTT  Gray-Scott. r V, g 1-U.  P = (F, k, Du, Dv)
//   7 LIFE       outer-totalistic + Generations ageing, fed by the agar.
//                r 0 dead / 1 alive / 2..C-1 dying, g generations alive.  P = (B mask, S mask, C, period)  Q = (birth cost, -, -, -)
//   8 CYCLIC     cyclic CA (rock-paper-scissors cultures). r state 1..n, g steps since advance.
//                P = (n, threshold, spread p, period)
//   9 SECTORS    Eden growth with heritable lineages: genetic-drift sectors. r present, g lineage hue, b thickness.
//                P = (growth p, mutation p, lineages, roughness)
//  10 BIOFILM    thin-film height growth with a wrinkle layer. r height, g 1-U, b V (wrinkle pattern).
//                P = (growth, max height, active layer, wrinkle onset)  Q = (spread, yield, F, k)
//
// Adding a kernel = one rule function + one branch in rule(), seedState() and present(); adding an
// organism on an existing kernel = one line of data in catalog.js.

export const KERNELS = ['', 'PHYSARUM', 'COLONY', 'LAPLACIAN', 'MYCELIUM', 'EXCITABLE', 'GRAYSCOTT', 'LIFE', 'CYCLIC', 'SECTORS', 'BIOFILM'];

// Per-kernel parameter sliders: [label, 'P'|'Q', index, min, max, step]
export const KPARAMS = {
  1: [['sensor angle', 'P', 0, 5, 90, 0.5], ['turn angle', 'P', 1, 5, 90, 0.5], ['sensor mm', 'P', 2, 0.1, 1.5, 0.01], ['speed', 'P', 3, 0.3, 2, 0.05],
      ['deposit', 'Q', 0, 0.05, 2, 0.05], ['persistence', 'Q', 1, 0.7, 0.99, 0.005], ['food pull', 'Q', 2, 0, 12, 0.1], ['sheath avoid', 'Q', 3, 0, 2, 0.05]],
  2: [['motility', 'P', 0, 0.02, 6, 0.01], ['growth', 'P', 1, 0.02, 1.5, 0.01], ['sporulation', 'P', 2, 0, 0.2, 0.002], ['noise', 'P', 3, 0, 1, 0.02],
      ['ring period', 'Q', 0, 0, 1200, 10], ['ring duty', 'Q', 1, 0.1, 0.9, 0.05], ['yield', 'Q', 2, 0.3, 3, 0.05]],
  3: [['eta', 'P', 0, 0, 4, 0.05], ['stick', 'P', 1, 0.002, 1, 0.002], ['absorb', 'P', 2, 0.05, 1, 0.05], ['compact', 'P', 3, 0, 4, 0.05]],
  4: [['branching', 'P', 0, 0, 0.4, 0.005], ['wobble', 'P', 1, 0, 1.2, 0.02], ['tip speed', 'P', 2, 0.1, 1, 0.02], ['branch angle', 'P', 3, 0.2, 1.6, 0.02],
      ['feeding', 'Q', 0, 0, 0.05, 0.001], ['crowd cap', 'Q', 1, 1, 8, 1], ['lateral', 'Q', 2, 0, 0.01, 0.0002]],
  5: [['a', 'P', 0, 0.3, 1.2, 0.01], ['b', 'P', 1, 0.005, 0.15, 0.005], ['epsilon', 'P', 2, 0.02, 0.12, 0.002], ['diffusion', 'P', 3, 0.2, 1, 0.02],
      ['lawn spread', 'Q', 0, 0, 0.5, 0.01], ['pacemakers', 'Q', 1, 0, 0.0005, 0.00001]],
  6: [['feed F', 'P', 0, 0.005, 0.095, 0.0005], ['kill k', 'P', 1, 0.04, 0.072, 0.0005]],
  7: [['states', 'P', 2, 2, 32, 1], ['period', 'P', 3, 1, 30, 1], ['birth cost', 'Q', 0, 0, 0.1, 0.002]],
  8: [['states', 'P', 0, 3, 24, 1], ['threshold', 'P', 1, 1, 5, 1], ['spread', 'P', 2, 0, 0.5, 0.01], ['period', 'P', 3, 1, 30, 1]],
  9: [['growth', 'P', 0, 0.02, 1, 0.01], ['mutation', 'P', 1, 0, 0.02, 0.0002], ['lineages', 'P', 2, 2, 24, 1], ['roughness', 'P', 3, 0, 1, 0.02]],
  10: [['growth', 'P', 0, 0.01, 0.3, 0.005], ['max height', 'P', 1, 0.5, 4, 0.05], ['active layer', 'P', 2, 0.1, 1.5, 0.05], ['wrinkle onset', 'P', 3, 0.2, 3, 0.05],
       ['spread', 'Q', 0, 0.1, 5, 0.05], ['yield', 'Q', 1, 0.2, 3, 0.05]],
};

export const AGENT_STRIDE = 64;      // an inoculum agent owns 64 buffer slots: itself + 6 generations of offspring
export const AGENT_BYTES = 24;

// ---------------------------------------------------------------- shared library
export const LIB = /* wgsl */`
struct Sim {
  n: u32, step: u32, seed: u32, agentHigh: u32,
  dishR: f32, agar: f32, temp: f32, dn: f32,
  cellMm: f32, p0: f32, p1: f32, p2: f32,
  slotK: array<vec4u, 9>,
  slotP: array<vec4f, 9>,
  slotQ: array<vec4f, 9>,
};
const TAU = 6.28318530718;
const N8 = array<vec2i, 8>(vec2i(1,0), vec2i(1,1), vec2i(0,1), vec2i(-1,1), vec2i(-1,0), vec2i(-1,-1), vec2i(0,-1), vec2i(1,-1));
const W8 = array<f32, 8>(1.0, 0.25, 1.0, 0.25, 1.0, 0.25, 1.0, 0.25);   // isotropic 9-point laplacian: sum(W8 * (v_j - v_i)) / 1.5
fn pcg(v: u32) -> u32 { let s = v * 747796405u + 2891336453u; let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
fn hash3(a: u32, b: u32, c: u32) -> u32 { return pcg(a + pcg(b + pcg(c))); }
fn rnd(a: u32, b: u32, c: u32) -> f32 { return f32(hash3(a, b, c) >> 8u) / 16777216.0; }
`;

// inDish/idx need the Sim uniform, which each pipeline binds under its own name S
export const LIB_GRID = /* wgsl */`
fn inDish(p: vec2i) -> bool { let c = f32(S.n) * 0.5; let d = vec2f(p) + 0.5 - c; return dot(d, d) <= S.dishR * S.dishR; }
fn idx(p: vec2i) -> u32 { return u32(p.y) * S.n + u32(p.x); }
// front speeds are calibrated in cells per step on the normal grid (46.9 um); rs() keeps them the same in mm on any grid
fn rs() -> f32 { return 0.046875 / S.cellMm; }
`;

// What every kernel must expose to the renderer and the harness: (density, height, tone 0..1 along the slot's ramp).
export const PRESENT = /* wgsl */`
fn present(K: u32, c: vec4f) -> vec3f {
  switch K {
    case 1u: { let d = clamp(c.r * 0.35 + c.g * 0.9, 0.0, 1.0); return vec3f(d, d * 0.6 + c.g * 0.5, clamp(c.g * 1.4, 0.0, 1.0)); }
    case 2u: { let m = c.r + c.g; let d = clamp(m * 1.6, 0.0, 1.0); return vec3f(d, c.b * 1.5, clamp(c.g / (m + 1e-4), 0.0, 1.0)); }
    case 3u: { return vec3f(c.r, c.r * (0.5 + 0.5 * c.b), c.g); }
    case 4u: { let tip = select(0.0, 1.0, c.g > 0.0); let d = c.r * clamp(0.45 + c.b * 2.5, 0.0, 1.0); return vec3f(d, d * (0.35 + c.b * 0.8) + tip * 0.3, clamp(c.b * 1.6, 0.0, 1.0)); }
    case 5u: { return vec3f(c.r * (0.35 + 0.65 * c.g), c.r * (0.3 + 0.5 * c.g), c.g); }
    case 6u: { let d = clamp(c.r * 3.0, 0.0, 1.0); return vec3f(d, d, clamp(c.r * 2.5, 0.0, 1.0)); }
    case 7u: { let alive = select(0.0, 1.0, c.r > 0.5 && c.r < 1.5); let dying = select(0.0, 1.0, c.r > 1.5);
               return vec3f(alive + dying * 0.45, alive * 0.8 + dying * 0.3, select(clamp(c.g * 0.04, 0.0, 0.6), 0.6 + c.r * 0.02, c.r > 1.5)); }
    case 8u: { return vec3f(select(0.0, 1.0, c.r > 0.5), 0.5, fract(c.r * 0.0417 * 3.0)); }
    case 9u: { return vec3f(c.r, c.b, c.g); }
    case 10u: { let d = clamp(c.r, 0.0, 1.0); return vec3f(d, c.r * (1.0 + 1.2 * (c.b - 0.12)), clamp(c.b * 2.5, 0.0, 1.0)); }
    default: { return vec3f(0.0); }
  }
}
`;

// ---------------------------------------------------------------- the cell pass
export const CELL_PASS = LIB + /* wgsl */`
@group(0) @binding(0) var<uniform> S: Sim;
@group(0) @binding(1) var<storage, read> cA: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> cB: array<vec4f>;
@group(0) @binding(3) var<storage, read> sA: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> sB: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> dep: array<atomic<u32>>;
@group(0) @binding(6) var<storage, read_write> depId: array<atomic<u32>>;
@group(0) @binding(7) var<storage, read> cond: array<f32>;
@group(0) @binding(8) var<storage, read> flake: array<f32>;
` + LIB_GRID + /* wgsl */`
fn condAt(q: vec2i) -> f32 {
  let gn = u32(S.p2); if (gn == 0u || q.x < 0 || q.y < 0 || q.x >= i32(S.n) || q.y >= i32(S.n)) { return 0.0; }
  let gx = min(u32(q.x) * gn / S.n, gn - 1u); let gy = min(u32(q.y) * gn / S.n, gn - 1u);
  return cond[gy * gn + gx];
}
fn isAdaptive(slot: u32) -> bool { return slot != 0u && f32(slot) == S.p1; }
fn slotOf(v: vec4f) -> u32 { return u32(v.a + 0.5); }
// neighbour state if it belongs to this slot, else bare agar
fn same(q: vec2i, slot: u32) -> vec4f { let v = cA[idx(q)]; if (slotOf(v) == slot) { return v; } return vec4f(0.0); }
// one random number shared by a size x size block of cells for hold steps: a stimulus has to exceed the
// critical nucleus of an excitable or Gray-Scott medium, which a single cell never does
fn blockRnd(p: vec2i, size: i32, hold: u32, salt: u32) -> f32 { let b = p / size; return rnd(u32(b.x) + u32(b.y) * 8192u, S.step / hold, salt); }
fn foreign(q: vec2i, slot: u32) -> bool { if (!inDish(q)) { return true; } let o = slotOf(cA[idx(q)]); return o != 0u && o != slot; }

// 1 PHYSARUM ---------------------------------------------------------------
const TUBE = 1.5;                          // trail held by a fully conducting tube
const GRAZE = 1e-5;                        // nutrient taken per agent per step, fraction of local
const RETRACT = 0.0;                        // drying of explored, non-conducting ground: OFF — two A/Bs showed no benefit on either P2 test
fn kPhysarum(p: vec2i, slot: u32, c: vec4f, d: u32, s: vec4f, ds: ptr<function, vec4f>) -> vec4f {
  let Q = S.slotQ[slot];
  var sum = c.r; for (var k = 0u; k < 8u; k++) { sum += same(p + N8[k], slot).r; }
  // P2 feedback. A vein that carries flux (Tero conductivity from the graph worker) is a PHYSICAL TUBE:
  // it holds a floor of trail whether or not agents happen to pass, so the network persists between
  // graph updates and the protoplasm streams inside it. Without the floor the topology was re-derived
  // from a transient trail each update and the Tero fixture's coverage jumped 5 -> 1 -> 2 -> 3 of 36
  // food sources instead of growing (measured). A vein that stopped carrying flux fades, and explored
  // ground (sheath) with no flux on it dries out faster: the plasmodium withdraws from where it has been.
  var keep = Q.y; var tube = 0.0;
  if (isAdaptive(slot)) {
    let cd = clamp(condAt(p), 0.0, 1.0);
    keep = mix(Q.y, 0.985, cd) * (1.0 - RETRACT * s.a * (1.0 - smoothstep(0.0, 0.1, cd)));
    // A living tube holds a clear floor whatever its conductivity: existence and diameter are separate.
    // With the floor proportional to D a weak but living tube (D ~ 0.05) sat at the extraction threshold,
    // blinked in and out of the graph and split it — the fixture reached 30/36 food at 9 000 steps and
    // then flickered down to 10 (measured).
    tube = TUBE * smoothstep(0.02, 0.08, cd);
  }
  var T = max(sum / 9.0 * keep, tube);
  let fd = f32(d);
  T = min(T + Q.x * sqrt(fd), 6.0);                       // sublinear deposit (Bleuje): no blow-out
  let dens = mix(c.g, min(fd, 4.0) * 0.5, 0.12);
  // Grazing, calibrated. At 0.02 per agent-step a few agents ate an oat flake in ~100 steps, where
  // Tero's flakes fed the plasmodium for the whole 26 h run (~37 000 steps at this engine's front
  // speed of ~7 mm per 1000 steps against the organism's ~10 mm/h). Once a flake was gone its trail
  // faded, its vein left the graph and it stopped being a terminal: the P2 fixture lost food sources
  // steadily. At 1e-5 a well-visited flake lasts the whole run (2e-4 still exhausted it by ~18 000 steps).
  (*ds).r -= GRAZE * fd * s.r;
  (*ds).a += 0.004 * fd * (1.0 - s.a);                     // slime sheath: externalised memory
  if (T < 0.004 && dens < 0.004) { return vec4f(0.0); }
  return vec4f(T, dens, min(c.b + 0.0004, 1.0), f32(slot));
}

// 2 COLONY ---------------------------------------------------------------
fn sigmaAt(i: u32, slot: u32, P: vec4f) -> f32 { return P.x * (1.0 - 0.9 * S.agar) * (1.0 + P.w * (rnd(i, slot, 7u) * 2.0 - 1.0)); }
fn kColony(p: vec2i, i: u32, slot: u32, c: vec4f, s: vec4f, ds: ptr<function, vec4f>) -> vec4f {
  let P = S.slotP[slot]; let Q = S.slotQ[slot];
  let b = c.r; let n = s.r;
  let si = sigmaAt(i, slot, P);
  var flux = 0.0; var thick = c.r + c.g;
  for (var k = 0u; k < 8u; k++) {
    let q = p + N8[k]; if (foreign(q, slot)) { continue; }
    let j = idx(q); let v = same(q, slot);
    let Df = 0.5 * (si + sigmaAt(j, slot, P)) * 0.5 * (n + sA[j].r) * 0.5 * (b + v.r);
    flux += W8[k] * min(Df, 0.25) * (v.r - b);
    thick += v.r + v.g;
  }
  flux /= 1.5;
  // Swarm / consolidate cycle (Proteus-type rings). Gating motility alone leaves a smooth colony:
  // the ring is a DENSITY band, so the consolidation phase must also divide harder while it stops
  // advancing. Measured - with growth ungated the radial density profile is flat.
  var growth = P.y * n * b * S.temp;
  if (Q.x > 0.0) {
    let ph = fract(f32(S.step) / Q.x);
    let swarm = select(0.0, 1.0, ph < Q.y);
    flux *= mix(0.02, 1.0, swarm);
    growth *= mix(2.2, 0.25, swarm);
  }
  let conv = P.z * b / ((1.0 + b / 0.08) * (1.0 + n / 0.12));
  let nb = max(b + flux + growth - conv, 0.0); let ns = c.g + conv;
  (*ds).r -= growth * Q.z;
  (*ds).a += 0.002 * (nb + ns) * (1.0 - s.a);
  if (nb + ns < 0.0002) { return vec4f(0.0); }
  return vec4f(nb, ns, mix(c.b, thick / 9.0, 0.2), f32(slot));
}

// 3 LAPLACIAN ---------------------------------------------------------------
const CURV_MM = 0.047;                      // physical radius of the curvature probe (one normal cell)
fn occ(q: vec2i, slot: u32) -> f32 { return select(0.0, 1.0, same(q, slot).r > 0.5); }
fn kLaplacian(p: vec2i, i: u32, slot: u32, c: vec4f, s: vec4f, ds: ptr<function, vec4f>) -> vec4f {
  let P = S.slotP[slot];
  // A solid cell is an absorbing boundary: absorb = 1 is the perfect absorber that makes this true
  // Laplacian growth, and the nutrient in the cell next door is then a discrete estimate of the
  // gradient TIMES the cell size.
  if (c.r > 0.5) { (*ds).r -= clamp(P.z, 0.0, 1.0) * s.r; return vec4f(1.0, min(c.g + 0.0015, 1.0), c.b, f32(slot)); }
  var adj = 0.0; for (var k = 0u; k < 8u; k++) { adj += W8[k] * occ(p + N8[k], slot); }
  if (adj == 0.0) { return vec4f(0.0); }
  // Curvature over a FIXED PHYSICAL radius. At one cell it is a lattice quantity, and the exponent
  // it controls becomes a property of the grid: Eden's beta measured 0.334 at draft and 0.073 at
  // normal on the same organism. Probing a fixed 0.15 mm means the same concavity everywhere.
  let rad = max(1, i32(round(CURV_MM / S.cellMm)));
  var curv = 0.0; for (var k = 0u; k < 8u; k++) { curv += W8[k] * occ(p + N8[k] * rad, slot); }
  // ... and the gradient, not the concentration, drives the growth. n * rs() undoes the cell-size
  // factor the discrete gradient carries; without it the probability scales as cellMm^eta.
  let g = clamp(s.r * rs(), 0.0, 4.0);
  let prob = min(P.y * pow(g, P.x) * (1.0 + P.w * (curv - 1.0)) * S.temp * rs(), 0.5);
  if (rnd(i, S.step, slot + 31u) < prob) { return vec4f(1.0, 0.0, rnd(i, slot, 5u), f32(slot)); }
  return vec4f(0.0);
}

// 4 MYCELIUM ---------------------------------------------------------------
fn tipMoves(j: u32, slot: u32) -> bool { return rnd(j, S.step, 12u) < S.slotP[slot].z * S.temp * rs() * clamp(sA[j].r * 5.0, 0.0, 1.0); }
fn tipAngle(j: u32, g: f32, slot: u32) -> f32 { return g * TAU + (rnd(j, S.step, 11u) - 0.5) * 2.0 * S.slotP[slot].y; }
fn tipTarget(a: f32) -> vec2i { return vec2i(round(vec2f(cos(a), sin(a)) * 1.2)); }
fn kMycelium(p: vec2i, i: u32, slot: u32, c: vec4f, s: vec4f, ds: ptr<function, vec4f>) -> vec4f {
  let P = S.slotP[slot]; let Q = S.slotQ[slot];
  if (c.r > 0.5) {
    var g = c.g; var crowd = 0.0;
    for (var k = 0u; k < 8u; k++) { crowd += select(0.0, 1.0, same(p + N8[k], slot).r > 0.5); }
    if (g > 0.0) {
      if (tipMoves(i, slot)) {
        g = 0.0;
        if (crowd <= Q.y && rnd(i, S.step, 13u) < P.x) {                       // apical branch: a second tip stays behind
          let sgn = select(-1.0, 1.0, rnd(i, S.step, 14u) < 0.5);
          g = max(fract((c.g * TAU + sgn * P.w) / TAU), 1e-4);
        }
      }
    } else if (crowd <= Q.y - 1.0 && rnd(i, S.step, 15u) < Q.z * clamp(s.r * 4.0, 0.0, 1.0)) {
      g = max(rnd(i, S.step, 16u), 1e-4);                                       // lateral branch from a mature hypha
    }
    (*ds).r -= Q.x * s.r;
    return vec4f(1.0, g, min(c.b + 0.0006 * S.temp, 1.0), f32(slot));
  }
  for (var k = 0u; k < 8u; k++) {                                               // bare agar: does a neighbouring tip step here?
    let q = p + N8[k]; if (!inDish(q)) { continue; }
    let v = same(q, slot); if (v.g <= 0.0) { continue; }
    let j = idx(q); if (!tipMoves(j, slot)) { continue; }
    let a = tipAngle(j, v.g, slot); let t = q + tipTarget(a);
    if (t.x == p.x && t.y == p.y) { return vec4f(1.0, max(fract(a / TAU), 1e-4), 0.0, f32(slot)); }
  }
  return vec4f(0.0);
}

// 5 EXCITABLE ---------------------------------------------------------------
fn kExcitable(p: vec2i, i: u32, slot: u32, c: vec4f, s: vec4f, ds: ptr<function, vec4f>) -> vec4f {
  let P = S.slotP[slot]; let Q = S.slotQ[slot];
  if (c.r < 0.5) {
    var cnt = 0.0; for (var k = 0u; k < 8u; k++) { cnt += select(0.0, 1.0, same(p + N8[k], slot).r > 0.5); }
    if (cnt > 0.0 && rnd(i, S.step, 21u) < Q.x * cnt * 0.125 * clamp(s.r * 3.0, 0.0, 1.0) * S.temp * rs()) { return vec4f(1.0, 0.0, 0.0, f32(slot)); }
    return vec4f(0.0);
  }
  var lap = 0.0;
  for (var k = 0u; k < 8u; k++) { let v = same(p + N8[k], slot); if (v.r > 0.5) { lap += W8[k] * (v.g - c.g); } }
  lap /= 1.5;
  var u = c.g; var v = c.b; let dt = 0.05;
  let uth = (v + P.y) / P.x;
  u = clamp(u + dt * u * (1.0 - u) * (u - uth) / P.z + 0.2 * P.w * lap, 0.0, 1.0);
  v = v + dt * (c.g - v);
  if (blockRnd(p, 6, 6u, 22u) < Q.y * 8.0) { u = 1.0; }                         // pacemaker: a 6 x 6 patch fires together
  (*ds).g += 0.01 * u;                                                         // the wave is a real attractant field
  (*ds).r -= 0.0004 * s.r;
  return vec4f(1.0, u, v, f32(slot));
}

// 6 GRAYSCOTT ---------------------------------------------------------------
fn kGrayScott(p: vec2i, slot: u32, c: vec4f, s: vec4f, ds: ptr<function, vec4f>) -> vec4f {
  let P = S.slotP[slot];
  var lv = 0.0; var lw = 0.0;
  for (var k = 0u; k < 8u; k++) { let q = same(p + N8[k], slot); let w = select(0.05, 0.2, (k & 1u) == 0u); lv += w * (q.r - c.r); lw += w * (q.g - c.g); }
  let U = 1.0 - c.g; let V = c.r; let uvv = U * V * V;
  let feed = P.x * clamp(s.r * 4.0, 0.0, 1.0);
  let Du = select(P.z, 1.0, P.z <= 0.0); let Dv = select(P.w, 0.5, P.w <= 0.0);
  let nU = clamp(U - Du * lw - uvv + feed * (1.0 - U), 0.0, 1.0);             // lw is the laplacian of (1-U)
  let nV = clamp(V + Dv * lv + uvv - (P.x + P.y) * V, 0.0, 1.0);
  (*ds).r -= 0.002 * nV * s.r;
  if (nV < 0.004 && 1.0 - nU < 0.02) { return vec4f(0.0); }
  return vec4f(nV, 1.0 - nU, c.b, f32(slot));
}

// 7 LIFE ---------------------------------------------------------------
fn kLife(p: vec2i, slot: u32, c: vec4f, s: vec4f, ds: ptr<function, vec4f>) -> vec4f {
  let P = S.slotP[slot]; let Q = S.slotQ[slot];
  let period = max(u32(P.w + 0.5), 1u);
  if (S.step % period != 0u) { return c; }
  var cnt = 0u; for (var k = 0u; k < 8u; k++) { let v = same(p + N8[k], slot); if (v.r > 0.5 && v.r < 1.5) { cnt++; } }
  let st = u32(c.r + 0.5); let B = u32(P.x + 0.5); let Sv = u32(P.y + 0.5); let C = u32(P.z + 0.5);
  if (st == 0u) {
    if (((B >> cnt) & 1u) == 1u && s.r > Q.x + 0.02) { (*ds).r -= Q.x; return vec4f(1.0, 0.0, 0.0, f32(slot)); }
    return vec4f(0.0);
  }
  if (st == 1u) {
    if (((Sv >> cnt) & 1u) == 1u) { return vec4f(1.0, c.g + 1.0, 0.0, f32(slot)); }
    if (C > 2u) { return vec4f(2.0, c.g, 0.0, f32(slot)); }
    return vec4f(0.0);
  }
  if (st + 1u < C) { return vec4f(f32(st + 1u), c.g, 0.0, f32(slot)); }
  return vec4f(0.0);
}

// 8 CYCLIC ---------------------------------------------------------------
fn kCyclic(p: vec2i, i: u32, slot: u32, c: vec4f, s: vec4f, ds: ptr<function, vec4f>) -> vec4f {
  let P = S.slotP[slot];
  let period = max(u32(P.w + 0.5), 1u);
  if (S.step % period != 0u) { return c; }
  let n = max(u32(P.x + 0.5), 2u);
  if (c.r < 0.5) {
    var cnt = 0.0; for (var k = 0u; k < 8u; k++) { cnt += select(0.0, 1.0, same(p + N8[k], slot).r > 0.5); }
    if (cnt > 0.0 && rnd(i, S.step, 41u) < P.z * rs() * clamp(s.r * 3.0, 0.0, 1.0)) { (*ds).r -= 0.01; return vec4f(f32(1u + hash3(i, S.step, 42u) % n), 0.0, 0.0, f32(slot)); }
    return vec4f(0.0);
  }
  let st = u32(c.r + 0.5); let nxt = (st % n) + 1u;
  var hits = 0u; for (var k = 0u; k < 8u; k++) { if (u32(same(p + N8[k], slot).r + 0.5) == nxt) { hits++; } }
  if (hits >= u32(P.y + 0.5)) { return vec4f(f32(nxt), 0.0, 0.0, f32(slot)); }
  return vec4f(c.r, c.g + 1.0, 0.0, f32(slot));
}

// 9 SECTORS ---------------------------------------------------------------
fn kSectors(p: vec2i, i: u32, slot: u32, c: vec4f, s: vec4f, ds: ptr<function, vec4f>) -> vec4f {
  let P = S.slotP[slot];
  if (c.r > 0.5) { (*ds).r -= 0.004 * s.r; return vec4f(1.0, c.g, min(c.b + 0.002 * clamp(s.r * 3.0, 0.0, 1.0), 1.0), f32(slot)); }
  var cnt = 0.0; var pick = vec4f(0.0); var best = -1.0;
  for (var k = 0u; k < 8u; k++) {
    let v = same(p + N8[k], slot); if (v.r < 0.5) { continue; }
    cnt += W8[k]; let w = rnd(i, S.step, 50u + k);                              // a random occupied neighbour is the parent
    if (w > best) { best = w; pick = v; }
  }
  if (cnt == 0.0) { return vec4f(0.0); }
  let prob = P.x * rs() * clamp(s.r * 3.0, 0.0, 1.0) * S.temp * mix(1.0, cnt / 2.5, 1.0 - P.w);
  if (rnd(i, S.step, 58u) >= prob) { return vec4f(0.0); }
  var hue = pick.g;
  if (rnd(i, S.step, 59u) < P.y) { hue = (floor(rnd(i, S.step, 60u) * P.z) + 0.5) / P.z; }
  (*ds).r -= 0.03;
  return vec4f(1.0, hue, 0.05, f32(slot));
}

// 10 BIOFILM ---------------------------------------------------------------
fn kBiofilm(p: vec2i, i: u32, slot: u32, c: vec4f, s: vec4f, ds: ptr<function, vec4f>) -> vec4f {
  let P = S.slotP[slot]; let Q = S.slotQ[slot];
  let h = c.r; var flux = 0.0; var lv = 0.0; var lw = 0.0;
  for (var k = 0u; k < 8u; k++) {
    let q = p + N8[k]; if (foreign(q, slot)) { continue; }
    let v = same(q, slot); let hm = 0.5 * (h + v.r);
    let rough = 0.55 + 0.9 * rnd(min(i, idx(q)), max(i, idx(q)), slot);
    flux += W8[k] * min(Q.x * rough * hm * hm * (1.0 - 0.8 * S.agar), 0.25) * (v.r - h);
    let w = select(0.05, 0.2, (k & 1u) == 0u); lv += w * (v.b - c.b); lw += w * (v.g - c.g);
  }
  flux /= 1.5;
  let growth = P.x * s.r * min(h, P.z) * (1.0 - h / P.y) * S.temp;
  let nh = max(h + flux + growth, 0.0);
  (*ds).r -= max(growth, 0.0) * Q.y;
  (*ds).a += 0.004 * nh * (1.0 - s.a);
  if (nh < 0.002) { return vec4f(0.0); }
  // wrinkle layer: Gray-Scott worms, switched on by thickness (compressive stress stands in for the feed)
  var U = 1.0 - c.g; var V = c.b;
  let wOn = smoothstep(P.w * 0.8, P.w * 1.2, nh);
  let F = select(Q.z, 0.058, Q.z <= 0.0); let kk = select(Q.w, 0.063, Q.w <= 0.0);
  let uvv = U * V * V;
  U = clamp(U - 1.0 * lw - uvv + F * (1.0 - U), 0.0, 1.0);
  V = clamp(V + 0.5 * lv + uvv - (F + kk) * V, 0.0, 1.0) * mix(0.9, 1.0, wOn);
  if (wOn > 0.5 && blockRnd(p, 20, 24u, 71u + slot) < 0.01) {                  // a buckle nucleates as a soft round patch
    let fall = 1.0 - smoothstep(0.35, 0.95, length((vec2f(p % vec2i(20)) - 9.5) / 10.0));
    V = max(V, 0.5 * fall); U = min(U, 1.0 - 0.75 * fall);
  }
  return vec4f(nh, 1.0 - U, V, f32(slot));
}

fn rule(K: u32, p: vec2i, i: u32, slot: u32, c: vec4f, d: u32, s: vec4f, ds: ptr<function, vec4f>) -> vec4f {
  switch K {
    case 1u: { return kPhysarum(p, slot, c, d, s, ds); }
    case 2u: { return kColony(p, i, slot, c, s, ds); }
    case 3u: { return kLaplacian(p, i, slot, c, s, ds); }
    case 4u: { return kMycelium(p, i, slot, c, s, ds); }
    case 5u: { return kExcitable(p, i, slot, c, s, ds); }
    case 6u: { return kGrayScott(p, slot, c, s, ds); }
    case 7u: { return kLife(p, slot, c, s, ds); }
    case 8u: { return kCyclic(p, i, slot, c, s, ds); }
    case 9u: { return kSectors(p, i, slot, c, s, ds); }
    case 10u: { return kBiofilm(p, i, slot, c, s, ds); }
    default: { return vec4f(0.0); }
  }
}

@compute @workgroup_size(16, 16) fn main(@builtin(global_invocation_id) gid: vec3u) {
  let n = S.n; if (gid.x >= n || gid.y >= n) { return; }
  let p = vec2i(gid.xy); let i = gid.y * n + gid.x;
  let d = atomicExchange(&dep[i], 0u); let did = atomicExchange(&depId[i], 0u);
  if (!inDish(p)) { cB[i] = vec4f(0.0); sB[i] = vec4f(0.0); return; }
  let c = cA[i]; let s = sA[i];

  // substrate: diffusion with no-flux dish wall
  var lap = vec4f(0.0);
  for (var k = 0u; k < 8u; k++) { let q = p + N8[k]; if (inDish(q)) { lap += W8[k] * (sA[idx(q)] - s); } }
  lap /= 1.5;
  // Substrate diffusivities are PHYSICAL (mm^2 per step), so S.dn carries the per-tier conversion
  // from the engine. Holding them fixed in lattice units instead makes the growth-to-diffusion ratio
  // - and therefore the morphology - a property of the grid: measured, DLA D went 1.77 at draft to
  // 1.87 at normal on the same organism. Ratios here are nutrient : attractant : toxin.
  var ns = s + S.dn * vec4f(1.0, 1.2, 0.267, 0.0) * lap;
  // A food flake is a SOLID on the agar that keeps releasing nutrient: it pins the local level rather
  // than being a blob of dissolved nutrient. The dissolved form spread into the agar within ~1500
  // steps, dropped under the attractant threshold by ~10 000 and the organism drifted off the food it
  // had reached — the Tero fixture's late decline (measured: diag/fixture-trace.js).
  ns.r = max(ns.r, flake[i]);
  ns.g = ns.g * 0.985 + 0.02 * max(s.r - 1.0, 0.0);        // food above agar level gives off attractant
  ns.b *= 0.9997;

  // who may live here next step: the owner, else whoever deposits, else the strongest neighbour
  var slot = slotOf(c);
  if (slot == 0u) {
    if (d > 0u) { slot = did; }
    else { var best = 0.0; for (var k = 0u; k < 8u; k++) { let v = cA[idx(p + N8[k])]; if (v.a > 0.5 && v.r > best) { best = v.r; slot = slotOf(v); } } }
  }
  var o = vec4f(0.0);
  if (slot != 0u) {
    let own = select(vec4f(0.0), c, slotOf(c) == slot);
    var ds = vec4f(0.0);
    let dd = select(0u, d, did == slot);
    o = rule(S.slotK[slot].x, p, i, slot, own, dd, s, &ds);
    ns += ds;
    // toxin: continuous kernels lose mass, discrete ones die by chance
    if (s.b > 0.02 && o.a > 0.5) {
      let K = S.slotK[slot].x; let tox = clamp(s.b, 0.0, 1.0);
      if (K == 1u || K == 2u || K == 6u || K == 10u) { o.r *= 1.0 - 0.25 * tox; }
      else if (rnd(i, S.step, 90u) < tox * 0.2) { o = vec4f(0.0); }
    }
  }
  cB[i] = o; sB[i] = max(ns, vec4f(0.0));
}
`;

// ---------------------------------------------------------------- the agent pass (kernel 1)
export const AGENT_PASS = LIB + /* wgsl */`
struct Agent { x: f32, y: f32, h: f32, e: f32, tag: u32, pad: u32 };
@group(0) @binding(0) var<uniform> S: Sim;
@group(0) @binding(1) var<storage, read_write> ag: array<Agent>;
@group(0) @binding(2) var<storage, read> cA: array<vec4f>;
@group(0) @binding(3) var<storage, read> sA: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> dep: array<atomic<u32>>;
@group(0) @binding(5) var<storage, read_write> depId: array<atomic<u32>>;
@group(0) @binding(6) var<storage, read> cond: array<f32>;
` + LIB_GRID + /* wgsl */`
fn condAt(q: vec2i) -> f32 {
  let gn = u32(S.p2); if (gn == 0u || q.x < 0 || q.y < 0 || q.x >= i32(S.n) || q.y >= i32(S.n)) { return 0.0; }
  let gx = min(u32(q.x) * gn / S.n, gn - 1u); let gy = min(u32(q.y) * gn / S.n, gn - 1u);
  return cond[gy * gn + gx];
}
fn isAdaptive(slot: u32) -> bool { return slot != 0u && f32(slot) == S.p1; }
fn sense(x: f32, y: f32, slot: u32, Q: vec4f) -> f32 {
  let q = vec2i(i32(floor(x)), i32(floor(y)));
  if (!inDish(q)) { return -100.0; }
  let i = idx(q); let c = cA[i]; let s = sA[i];
  var v = Q.z * s.r + 3.0 * s.g - 8.0 * s.b - Q.w * s.a;
  if (isAdaptive(slot)) { v += S.p0 * condAt(q); }      // agents prefer veins that transport, not merely ones that exist
  let o = u32(c.a + 0.5);
  if (o == slot) { v += c.r; } else if (o != 0u) { v -= 3.0; }
  return v;
}
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x; if (i >= S.agentHigh) { return; }
  var a = ag[i]; let slot = a.tag & 15u; if (slot == 0u) { return; }
  let P = S.slotP[slot]; let Q = S.slotQ[slot];
  let SA = radians(P.x); let RA = radians(P.y); let SO = P.z / S.cellMm; let SS = P.w * S.temp;
  let f = sense(a.x + cos(a.h) * SO, a.y + sin(a.h) * SO, slot, Q);
  let l = sense(a.x + cos(a.h + SA) * SO, a.y + sin(a.h + SA) * SO, slot, Q);
  let r = sense(a.x + cos(a.h - SA) * SO, a.y + sin(a.h - SA) * SO, slot, Q);
  if (f < l && f < r) { a.h += select(-RA, RA, rnd(i, S.step, 1u) < 0.5); }
  else if (l > r && l > f) { a.h += RA; }
  else if (r > l && r > f) { a.h -= RA; }
  let nx = a.x + cos(a.h) * SS; let ny = a.y + sin(a.h) * SS;
  let q = vec2i(i32(floor(nx)), i32(floor(ny)));
  var ok = inDish(q);
  if (ok) { let o = u32(cA[idx(q)].a + 0.5); ok = (o == 0u || o == slot) && sA[idx(q)].b < 0.35; }
  if (ok) { a.x = nx; a.y = ny; } else { a.h = rnd(i, S.step, 2u) * TAU; }
  let ci = idx(vec2i(i32(floor(a.x)), i32(floor(a.y))));
  atomicAdd(&dep[ci], 1u);
  atomicMax(&depId[ci], slot);
  // feeding; division happens in its own pass (AGENT_DIVIDE) so that no thread ever reads a slot another thread is writing
  a.e += 0.035 * sA[ci].r * S.temp;
  if (a.e > 1.0 && ((a.tag >> 4u) & 15u) < 6u) { a.tag |= 256u; }
  ag[i] = a;
}
`;

// ---------------------------------------------------------------- tools: every placement is one stamp
// kind: 0 inoculate, 1 nutrient (dissolved), 2 toxin, 3 attractant, 4 erase, 5 scratch (sheath), 6 pour plate, 7 flake (solid food)
export const STAMP_PASS = LIB + /* wgsl */`
struct Stamp { cx: f32, cy: f32, r: f32, amount: f32, kind: u32, slot: u32, salt: u32, pad: u32 };
@group(0) @binding(0) var<uniform> S: Sim;
@group(0) @binding(1) var<uniform> T: Stamp;
@group(0) @binding(2) var<storage, read_write> cells: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> sub: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> flake: array<f32>;
` + LIB_GRID + /* wgsl */`
fn seedState(K: u32, i: u32, rel: vec2f, edge: f32, slot: u32) -> vec4f {
  let r1 = rnd(i, T.salt, 1u); let r2 = rnd(i, T.salt, 2u); let P = S.slotP[slot]; let fs = f32(slot);
  switch K {
    case 1u: { return vec4f(1.0, 0.5, 0.0, fs); }
    case 2u: { return vec4f(0.25 + 0.2 * r1, 0.0, 0.2, fs); }
    case 3u: { return vec4f(1.0, 0.0, r1, fs); }
    case 4u: { let outw = fract(atan2(rel.y, rel.x) / TAU + 1.0); return vec4f(1.0, select(0.0, max(outw, 1e-4), edge > 0.75 && r1 < 0.5), 0.3, fs); }
    case 5u: { return vec4f(1.0, select(0.0, 1.0, r1 < 0.02), 0.0, fs); }
    case 6u: {                                           // a scatter of 6 x 6 blobs: a solid disc starves itself in the spot regimes, single cells are sub-critical in the maze ones
      let q = (i % S.n) / 6u + ((i / S.n) / 6u) * 8192u;
      if (rnd(q, T.salt, 4u) < 0.2) { return vec4f(0.5 - 0.06 * r1, 0.75, 0.0, fs); }
      return vec4f(0.0);
    }
    case 7u: { if (r1 < 0.42) { return vec4f(1.0, 0.0, 0.0, fs); } return vec4f(0.0); }
    case 8u: { return vec4f(f32(1u + hash3(i, T.salt, 3u) % max(u32(P.x + 0.5), 2u)), 0.0, 0.0, fs); }
    case 9u: { return vec4f(1.0, (floor(r1 * P.z) + 0.5) / P.z, 0.1, fs); }
    case 10u: { return vec4f(0.35, select(0.0, 0.5, r2 < 0.03), select(0.0, 0.5, r2 < 0.03), fs); }
    default: { return vec4f(0.0); }
  }
}
@compute @workgroup_size(16, 16) fn main(@builtin(global_invocation_id) gid: vec3u) {
  let lo = vec2i(i32(floor(T.cx - T.r)) - 1, i32(floor(T.cy - T.r)) - 1);
  let p = lo + vec2i(gid.xy);
  if (p.x < 0 || p.y < 0 || p.x >= i32(S.n) || p.y >= i32(S.n) || !inDish(p)) { return; }
  let rel = vec2f(p) + 0.5 - vec2f(T.cx, T.cy); let dist = length(rel);
  if (T.kind != 6u && dist > T.r) { return; }
  let i = idx(p); let edge = dist / max(T.r, 0.5);
  let fall = 1.0 - smoothstep(0.6, 1.0, edge);
  switch T.kind {
    case 0u: { if (cells[i].a < 0.5) { cells[i] = seedState(S.slotK[T.slot].x, i, rel, edge, T.slot); } }
    case 1u: { sub[i].r = max(sub[i].r, T.amount * fall); }
    case 2u: { sub[i].b = max(sub[i].b, T.amount * fall); }
    case 3u: { sub[i].g = max(sub[i].g, T.amount * fall); }
    case 4u: { cells[i] = vec4f(0.0); }
    case 5u: { sub[i].a = max(sub[i].a, T.amount * fall); }
    case 6u: { cells[i] = vec4f(0.0); sub[i] = vec4f(T.amount, 0.0, 0.0, 0.0); flake[i] = 0.0; }   // pour a fresh plate
    case 7u: { flake[i] = max(flake[i], T.amount * fall); sub[i].r = max(sub[i].r, T.amount * fall); }   // solid food flake
    default: {}
  }
}
`;

// scalpel / eraser for agents: everything of kernel 1 inside the disc dies
export const AGENT_ERASE = LIB + /* wgsl */`
struct Agent { x: f32, y: f32, h: f32, e: f32, tag: u32, pad: u32 };
struct Stamp { cx: f32, cy: f32, r: f32, amount: f32, kind: u32, slot: u32, salt: u32, pad: u32 };
@group(0) @binding(0) var<uniform> S: Sim;
@group(0) @binding(1) var<uniform> T: Stamp;
@group(0) @binding(2) var<storage, read_write> ag: array<Agent>;
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x; if (i >= S.agentHigh) { return; }
  let d = vec2f(ag[i].x - T.cx, ag[i].y - T.cy);
  if (dot(d, d) <= T.r * T.r) { ag[i].tag = 0u; }
}
`;

// division: an agent owns a power-of-two range of the buffer (itself + 6 generations), so offspring never race for a
// slot. Only agents flagged by the agent pass act here; a newborn is never flagged, so its own thread stays passive.
export const AGENT_DIVIDE = LIB + /* wgsl */`
struct Agent { x: f32, y: f32, h: f32, e: f32, tag: u32, pad: u32 };
@group(0) @binding(0) var<uniform> S: Sim;
@group(0) @binding(1) var<storage, read_write> ag: array<Agent>;
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x; if (i >= S.agentHigh) { return; }
  let t = ag[i].tag; if ((t & 256u) == 0u) { return; }
  var a = ag[i]; let slot = t & 15u; let gen = (t >> 4u) & 15u;
  let tag = slot | ((gen + 1u) << 4u);
  ag[i + (64u >> (gen + 1u))] = Agent(a.x, a.y, a.h + 3.14159 * (0.5 + rnd(i, S.step, 3u)), 0.0, tag, 0u);
  a.e = 0.0; a.tag = tag; ag[i] = a;
}
`;
