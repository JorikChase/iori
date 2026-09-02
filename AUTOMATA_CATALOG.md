# The Universal Automata Catalog

A working reference for building one engine that can run almost any grid-based
simulation: classic cellular automata, physics automata, procedural/effect
automata, and continuous/agent-based systems.

Two things live in this document:

1. **The engine model** — the small set of primitives that everything below
   reduces to. Build these ten things and the catalog becomes data, not code.
2. **The catalog** — ~350 named systems, grouped by family, with the fields an
   implementation actually needs.

---

## Part 0 — How to run this research

The mistake with a list like this is treating it as a naming exercise. Names are
cheap; what makes an engine universal is discovering the *small number of
execution shapes* that the hundreds of names collapse into. So the research runs
in five passes:

**Pass 1 — Enumerate by family, not by name.** Nine families cover essentially
everything: discrete-lattice rule automata, continuous-kernel automata,
partitioned/block automata, mobile-agent automata, field solvers (PDE-on-grid),
particle-grid hybrids, procedural one-shot generators, image-space kernels, and
learned/neural automata. Any new system you meet belongs to one of these, and
each family maps to exactly one engine execution path.

**Pass 2 — Mine the canonical sources exhaustively.** The high-yield ones:
LifeWiki's rule lists (hundreds of named rulestrings for free), Golly's rule
documentation, Wolfram's *A New Kind of Science* and the elementary-rule atlas,
Mirek Wójtowicz's MCell rule families (the origin of most Generations names),
the Powder Toy element list and Sandspiel's element table, LBM and lattice-gas
literature, Karl Sims' and Robert Munafo's Gray-Scott pages, and the Lenia /
SmoothLife / Neural-CA paper cluster on arXiv and distill.pub.

**Pass 3 — Normalize into one schema.** Every entry gets the same fields:
lattice, state, rule, update scheme, boundary, init, render, engine primitive.
Uniform fields are what let you diff systems and notice that, say, Brian's Brain
and a forest-fire model are the same execution shape with different tables.

**Pass 4 — Reduce to primitives.** Sort the schema'd entries by their
`engine_notes` field and count. You will find the long tail is dominated by
maybe eight kernels. That count is your engine spec.

**Pass 5 — Verify by implementing the hard ones first.** Lenia (large radial
convolution), a falling-sand element table (order-dependent in-place mutation),
D2Q9 LBM (two-phase stream/collide), and Physarum (agent list coupled to a
field) are the four corners of the design space. If your engine runs those four,
it runs nearly everything else in this document.

**Entry schema used below**

| Field | Meaning |
|---|---|
| `lattice` | grid topology, dimension, neighborhood/stencil |
| `state` | per-cell channels and their types |
| `rule` | the actual update math or transition table |
| `update` | sync / async / block / multi-pass / agent-then-field |
| `boundary` | torus, fixed, reflective, open |
| `init` | typical seeding |
| `render` | how it's normally drawn |
| `engine` | which engine primitive it needs |

---

## Part 1 — The engine model

### 1.1 The universal state

```
World = {
  lattice:   SQUARE | HEX | TRI | GRAPH | VOXEL | OFF_LATTICE
  dims:      [w, h, (d)]
  channels:  [ Channel ]          // named, typed, per-cell
  agents:    [ AgentBuffer ]      // optional, coupled to channels
  boundary:  TORUS | CLAMP | REFLECT | OPEN | ABSORB
}

Channel = { name, type: u8|u16|f16|f32|vec2|vec4, buffers: 1|2, init }
```

Everything is a multi-channel float/int grid plus an optional agent list. One
buffer for in-place order-dependent rules (sand), two for parallel rules (Life,
reaction-diffusion, LBM).

### 1.2 The ten kernels

Every system in this catalog is a pipeline of these:

| # | Kernel | What it does | Powers |
|---|---|---|---|
| K1 | **LUT rule** | index a lookup table by a packed neighborhood | elementary CA, Wireworld, block CA, Margolus |
| K2 | **Outer-totalistic count** | count live neighbors → birth/survive bitmask | Life-like, Generations, Larger-than-Life, vote rules |
| K3 | **Stencil convolution** | small fixed kernel (3×3, 5-pt Laplacian, Sobel) | diffusion, heat, waves, image kernels, NCA perception |
| K4 | **Large radial convolution** | arbitrary-radius kernel, separable or FFT | Lenia, SmoothLife, multi-scale Turing, Larger-than-Life at big R |
| K5 | **Per-cell ODE step** | pointwise nonlinear function of channels + kernel output | Gray-Scott, FitzHugh-Nagumo, Lenia growth, coupled map lattices |
| K6 | **Material swap** | order-dependent in-place cell movement + reaction table | falling sand, all powder/liquid/gas games |
| K7 | **Stream + collide** | directional distributions shifted then relaxed | HPP, FHP, all LBM variants |
| K8 | **Iterative solve** | N Jacobi/Gauss-Seidel passes on a scalar field | pressure projection, Poisson, implicit diffusion |
| K9 | **Agent step** | per-agent sense → turn → move, reading/writing a field | Langton's ant, turmites, Physarum, Boids, particle life |
| K10 | **Advect** | semi-Lagrangian backtrace and sample | Stam fluids, smoke, FLIP/PIC transfer |

Plus two non-per-frame paths the engine must distinguish from the above:

- **G — one-shot generator** (maze, WFC, DLA-to-completion, noise field): runs
  to a fixed point or a fixed count, then stops.
- **P — post/present pass** (colormap, bloom, dithering, feedback): reads the
  final grid and produces pixels; never feeds back into state unless the system
  is explicitly a feedback effect.

### 1.3 The scheduler

```
Scheduler = SYNC              // double-buffer, all cells at once
          | INPLACE_ORDERED   // sand: bottom-up, alternate L/R bias per frame
          | BLOCK_PARTITION   // Margolus: alternate 2x2 offset each step
          | STOCHASTIC        // update each cell with probability p (async CA, NCA)
          | RANDOM_ORDER      // shuffle cell list per step
          | SUBSTEPPED        // n physics substeps per rendered frame (CFL)
          | AGENT_THEN_FIELD  // move agents, then diffuse/decay their field
```

Getting the scheduler as a first-class, per-layer setting is what makes one
engine able to host both Conway and Noita. Most engines hard-code SYNC and can
therefore never do sand correctly.

### 1.4 Layers and coupling

A "universal" engine is really a **layer stack**: several channel groups, each
with its own kernel and scheduler, executed in a declared order per frame, able
to read each other's channels. Fire = a material layer (K6) + a heat layer (K3)
+ a fuel-reaction table (K6) + a palette pass (P). Noita is a material layer + a
pressure layer + an agent/rigid layer. Lenia-with-obstacles is K4/K5 plus a mask
channel. Declare the stack in data; the engine just runs kernels in order.

---

## Part 2 — Catalog

### 2.1 Elementary 1D cellular automata (Wolfram code)

**Shape:** `lattice` 1D line, radius-1 (3-cell) neighborhood · `state` 1 bit ·
`rule` 8-bit Wolfram number, bit *i* = output for neighborhood pattern *i*
(pattern 111=bit7 … 000=bit0) · `update` SYNC · `boundary` torus · `init` single
centre cell, or random · `render` space-time diagram, one row per generation ·
`engine` **K1** with an 8-entry LUT. All 256 rules are one code path.

| Rule | Behavior |
|---|---|
| 0, 255 | trivial fixed points (class 1) |
| 30 | chaotic; Wolfram's randomness generator; used in *Mathematica*'s RNG and in cone-snail pigmentation |
| 90 | Sierpiński triangle; XOR of the two neighbors; additive/linear |
| 110 | **Turing-complete** (Cook); localized structures with collisions |
| 184 | traffic/ballistic annihilation; density classifier; particle transport |
| 150 | XOR of all three cells; additive; nested fractal |
| 54 | class 4, complex, gliders and reactions |
| 60 | left-shifted Sierpiński (XOR of self and left) |
| 22 | fractal-chaotic, "Sierpiński with noise" |
| 126 | chaotic, symmetric relative of 90 |
| 45, 73, 89, 137 | additional chaotic/complex specimens studied in the atlas |
| 33 | a class-2 rule; sparse periodic/nested structure — one of the symmetric "amphichiral" pairs; behaves as a thin nested pattern from a single seed |
| 105 | additive with complement, dense nested pattern |
| 62, 94 | class 2 with periodic backgrounds |

**Wolfram's four classes** — 1: homogeneous fixed point; 2: periodic/localized
structures; 3: chaotic/random-looking; 4: complex, long-lived localized
structures (the interesting ones: 110, 54).

**Related 1D generalizations**

- **Totalistic 1D CA** — rule indexed by the *sum* of the neighborhood rather
  than its pattern; k states, radius r; numbered by "totalistic code". Rule
  spaces stay small even for k=3.
- **Second-order (reversible) 1D CA** — `next = rule(neigh) XOR prev`; every
  elementary rule gains a reversible twin (rule 30R etc.). Needs 2 history
  buffers. **K1 + history channel.**
- **Additive / linear CA** — rules expressible as XOR/mod-k sums (90, 150, 60);
  admit closed-form fractal solutions and superposition.
- **Rule 90 on a ring / Pascal's triangle mod n** — nested fractals for any
  modulus.
- **Cyclic tag systems & Rule 110 emulation** — how universality is proved;
  worth having as a demo pattern.
- **1D traffic (Rule 184) → Nagel–Schreckenberg** — see §2.7.

### 2.2 Life-like (2D outer-totalistic, B/S notation)

**Shape:** `lattice` 2D square, Moore r=1 · `state` 1 bit · `rule` `B<births>/S<survivals>` over the neighbor count 0–8 · `update` SYNC ·
`boundary` torus (or unbounded) · `init` random density ~0.3, or a named pattern ·
`render` binary, often with an age colormap · `engine` **K2**, an 18-bit
birth/survive mask. **All 2^18 = 262,144 life-like rules are one code path.**

Named rules (rulestrings verified against LifeWiki):

| Rulestring | Name | Character |
|---|---|---|
| B3/S23 | **Conway's Life** | the canonical chaotic rule; Turing-complete |
| B36/S23 | **HighLife** | Life plus a simple replicator |
| B3678/S34678 | **Day & Night** | symmetric under on/off reversal |
| B2/S | **Seeds** | every cell dies every step; explosive |
| B3/S012345678 | **Life without Death** | monotone growth, complex "flakes" |
| B35678/S5678 | **Diamoeba** | large diamonds with chaotic boundaries |
| B3/S12345 | **Maze** | crystallizes into maze corridors |
| B3/S1234 | **Mazectric** | longer, straighter corridors |
| B37/S12345 | **Maze with Mice** | maze plus wandering "mice" |
| B37/S1234 | **Mazectric with Mice** | as above, thinner |
| B1357/S1357 | **Replicator** | *every* pattern replicates |
| B1357/S02468 | **Fredkin** | replicator, parity rule |
| B36/S125 | **2×2** | rich still lifes/oscillators/ships |
| B3678/S1258 | **2×2 2** | 2×2 variant |
| B45678/S2345 | **Walled Cities** | walled pockets of activity |
| B5678/S45678 | **Vote** | Vichniac majority voting rule |
| B4678/S35678 | **Vote 4/5** | biased majority; anneal/coarsening |
| B45678/S5678 | **Majority** | pure majority |
| B345/S4567 | **Assimilation** | stable diamonds |
| B345/S5 | **Long Life** | very high-period oscillators |
| B357/S1358 | **Amoeba** | balanced chaos |
| B357/S238 | **Pseudo Life** | Life-like evolution, different physics |
| B3/S45678 | **Coral** | slow coral-textured growth |
| B378/S235678 | **Coagulations** | forever-expanding blobs |
| B3678/S235678 | **Stains** | fills bounded regions |
| B34/S34 | **3-4 Life** | exploding near-Life |
| B34/S456 | **Bacteria** | |
| B35/S234578 | **Land Rush** | chaos organizing into fields |
| B36/S234578 | **Land Rush 2** | |
| B368/S245 | **Morley / Move** | random soup stabilizes very fast |
| B37/S23 | **DryLife** | Life + B7 |
| B38/S23 | **Pedestrian Life** | Life + B8 |
| B3/S238 | **EightLife** | Life + S8 |
| B35/S23 | **Grounded Life** | one condition from Life |
| B3/S023 | **DotLife** | |
| B3/S13 | **LowLife** | |
| B367/S23 | **DrighLife** | DryLife × HighLife |
| B368/S238 | **LowDeath** | HighLife's replicator survives |
| B368/S236 | **Life SkyHigh** | |
| B38/S238 | **HoneyLife** | |
| B36/S238 | **IronLife** | |
| B36/S235 | **Blinker Life** | T-tetromino is a puffer |
| B234/S | **Serviettes / Persian Rug** | everything dies each step |
| B1/S1 | **Gnarl** | one cell explodes into intricate lace |
| B1/S012345678 | **H-trees** | H-shaped branching growth |
| B1/S014567 | **Fuzz** | |
| B1/S134567 | **Snakeskin** | |
| B3/S12 | **Flock** | settles into dominoes fast |
| B36/S12 | **HighFlock** | |
| B37/S12 | **DryFlock** | |
| B38/S12 | **Pedestrian Flock** | |
| B3/S128 | **EightFlock** | |
| B36/S128 | **IronFlock** | |
| B38/S128 | **HoneyFlock** | |
| B368/S128 | **LowFlockDeath** | |
| B3457/S4568 | **Gems** | many high-period oscillators |
| B34578/S456 | **Gems Minor** | |
| B3578/S24678 | **Geology** | large stable "continents" |
| B35678/S4678 | **Holstein** | self-complementary |
| B35678/S34567 | **Cheerios** | explosive with ring structures |
| B3567/S15678 | **Bugs** | |
| B34568/S15678 | **Spiral/polygonal growth** | plow structures on polygon edges |
| B25678/S5678 | **Iceballs** | flickering solid masses |
| B12678/S15678 | **Solid islands in static** | |
| B0123478/S01234678 | **AntiLife** | black/white reversal of Life |
| B0123478/S34678 | **InverseLife** | Life-like oscillators, inverted |
| B3678/S23 | — | reversal of InverseLife |
| B2/S0 | **Live Free or Die** | only isolated cells survive |
| B2/S13 | — | rare B2 rule with a replicator |
| B2/S2345 | — | still lifes act as growth barriers |
| B345/S0456 | **Never Happy** | |
| B345/S2 | **Blinkers** | |
| B34/S35 | **Dance** | |
| B3/S0248 | **Star Trek** | |
| B3/S1237 | **SnowLife** | |
| B3/S124 | **Corrosion of Conformity** | |
| B3/S123678 | **Magnezones** | |
| B3/S245678 | **Shoots and Roots** | |
| B3/S4567 | **Lifeguard 2** | |
| B48/S234 | **Lifeguard 1** | |
| B3/S2 | — | six small still lifes |
| B36/S245 | **sqrt replicator rule** | |
| B367/S125678 | **Slow Blob** | |
| B3678/S135678 | **Castles** | |
| B45/S12345 | **Electrified Maze** | |
| B45/S1235 | **Oscillators Rule** | periods 1–16 |
| B56/S14568 | **Rings 'n' Slugs** | |
| B014/S2 | **Oils** | |
| B028/S0124 | **Invertamaze** | self-inverting mazes |
| B08/S4 | **Neon Blobs** | |
| B1358/S0247 | **Feux** | |
| B25/S4 | — | 1D asymmetric replicator |
| B378/S012345678 | **Plow World** | |
| B37/S012345678 | **DryLife without Death** | |
| B38/S012345678 | **Pedestrian Life without Death** | |
| B35/S236 | — | Hickerson/Eppstein rule |
| B01245/S01245 | — | strobing spearheads |
| B01356/S012345 | **Wickstretcher and the Parasites** | |
| B017/S01, B026/S1 | — | strobing oddities |

**Rules with B0** ("strobing") need the engine to support either background
inversion each generation or an explicit alternating-rule mode.

### 2.3 Generations (B/S/C — Life-like with refractory ageing)

**Shape:** identical to life-like plus an age counter. `state` u8 age 0..C-1 ·
`rule` a dead cell with a birth count → age 1; a live (age-1) cell with a
survive count stays age 1; otherwise ages by 1 and dies at C. Only age-1 cells
count as neighbors. `engine` **K2 + age channel**; render by age → palette,
which is where the "fire/plasma" look comes from.

| Rulestring | Name | | Rulestring | Name |
|---|---|---|---|---|
| B2/S/C3 | **Brian's Brain** | | B2/S345/C4 | **Star Wars** |
| B246/S6/C3 | Brain 6 | | B24/S345/C25 | Bombers |
| B13/S2/C21 | **Fireworks** | | B2/S2/C25 | Faders |
| B3468/S0235678/C9 | Burst | | B3468/S235678/C9 | Burst II |
| B378/S124567/C4 | Caterpillars | | B34/S12/C3 | Frogs |
| B45678/S12345/C8 | **Lava** | | B34/S345/C6 | **Prairie on Fire** |
| B2678/S3467/C6 | Rake | | B2/S3456/C6 | Sticks |
| B34/S23/C8 | Swirl | | B234/S2/C5 | **Spirals** |
| B26/S345/C5 | Transers | | B26/S0345/C6 | Transers II |
| B34678/S345/C5 | Wanderers | | B34/S1234/C48 | Thrill Grill |
| B34678/S234/C24 | Bloomerang | | B3457/S2367/C5 | Banners |
| B23/S23/C8 | **BelZhab** (Zhabotinsky) | | B23/S145678/C8 | BelZhab Sediment |
| B23/S2/C8 | RainZha | | B23/S356/C6 | Frozen Spirals |
| B23/S347/C8 | Flaming Starbows | | B1234/S2345/C8 | Circuit Genesis |
| B2/S23/C8 | Cooties | | B24567/S05678/C6 | Chenille |
| B36/S012478/C18 | Ebb and Flow | | B37/S012468/C18 | Ebb and Flow II |
| B245678/S035678/C7 | Glisserati | | B245678/S035678/C5 | Glissergy |
| B458/S012345/C3 | Lines | | B3/S345/C6 | Living on the Edge |
| B3/S01245678/C8 | Meteor Guns | | B2478/S45678/C25 | Nova |
| B2/S3/C4 | OrthoGo | | B25678/S45678/C4 | SediMental |
| B25/S03467/C6 | Snake | | B25/S3467/C6 | Worms |
| B38/S13458/C6 | Soft Freeze | | B2356/S1456/C16 | Xtasy |

### 2.4 Beyond outer-totalistic: bigger rule spaces

- **Isotropic non-totalistic (INT) rules / Hensel notation** — birth and
  survival conditioned on the *configuration*, not just the count, up to the 8
  symmetries. 102 distinct isotropic neighborhoods. `engine` K1 with a
  512-entry LUT canonicalized by symmetry. This is the rulespace most modern
  discoveries live in.
- **MAP rules** — a raw 512-bit table over the 3×3 neighborhood, base64
  encoded; the fully general non-isotropic 2-state Moore rule. **K1, 512-LUT.**
  Every rule in §2.2 and every INT rule is a special case; if the engine
  supports MAP it supports all of them.
- **Larger than Life (LtL)** — Moore neighborhood of radius R (up to ~10+),
  birth/survival as *count intervals* `R,C,M,S_min..S_max,B_min..B_max`.
  Bosco's Rule = R5,C0,M1,S33..57,B34..45. **K4 (box-blur is separable) + K2
  interval test.** The discrete ancestor of Lenia.
- **RealLife / continuous LtL** — LtL with real-valued cell states; the bridge
  to §2.9.
- **Weighted/generalized neighborhoods** — arbitrary integer weight mask +
  interval table; covers knight-move rules, checkerboard rules, hex/tri
  emulated on a square grid.
- **Alternating rules** — a cycle of rulestrings applied in turn (rule A on
  even steps, B on odd). Needed for many B0 and "strobing" rules.
- **"Super"/History rules (LifeHistory)** — extra marking states carried
  alongside the live/dead bit; used for tracing. **Extra u8 channel, no new
  kernel.**
- **Non-uniform CA** — a per-cell rule index channel; different regions run
  different rules. Cheap in the engine (one extra u8 lookup), enormous for
  authoring.
- **Stochastic / probabilistic CA** — birth/survival applied with probability
  p; add noise/temperature. Covers noisy Life, probabilistic forest fire,
  Domany–Kinzel.
- **Asynchronous CA** — same rules, RANDOM_ORDER or STOCHASTIC scheduler.
  Radically different behavior from the same rule table; a first-class engine
  toggle, not a variant rule.
- **Multi-state totalistic 2D** — k states, rule on the neighborhood sum.
- **3D life-like** — Bays' notation `R/S/B` or `S/B/states/M|VN`; named 3D rules
  include 5766 (Bays' 3D Life), Clouds 1 (B13-26/S13-14,17-19), Amoeba 3D,
  Pyroclastic, Slow Decay, Crystal Growth, 445, Builder. **K2 over a 26-cell
  neighborhood; render by marching cubes or raymarched voxels.**
- **4D and hyperbolic CA** — same K2 with a different adjacency table; mostly of
  theoretical interest but nearly free if adjacency is data.

### 2.5 Partitioned / block / reversible automata

**Shape:** the grid is tiled into 2×2 blocks; the tiling offset alternates
between even and odd steps (**Margolus neighborhood**). The rule is a
permutation or map on the 16 block states. `update` BLOCK_PARTITION ·
`engine` **K1 over a 16-entry block table.** Reversibility is exactly the
condition that the table is a bijection.

- **Critters** — Margolus rule, reversible, produces gliders; the canonical
  demo.
- **Tron** — Margolus, reversible, "inverts everything unless the block is
  uniform".
- **BBM (Billiard Ball Model)** — Margolus rule computing with colliding
  "balls"; a universal reversible computer (Fredkin–Toffoli).
- **Margolus sand / "Sand" rule** — the simplest possible falling-sand: in each
  block, matter falls to the lower cells. Momentum-free but exactly
  mass-conserving.
- **Rotations / "Rotations II" / Sand-like Margolus family** — MCell's block
  rule set.
- **HPP gas** — see §2.6; historically a block/partitioned automaton.
- **Second-order (Fredkin) reversible CA** — `s(t+1) = f(neigh(t)) XOR s(t-1)`.
  Turns *any* rule into a reversible one. **Needs a previous-state channel.**
- **Reversible Life variants** — Life-like rules run second-order; time-reversal
  is exact, so scrubbing backwards is free.
- **Toffoli/Fredkin gate lattices** — conservative logic embedded in a CA.
- **von Neumann's 29-state universal constructor** — the original
  self-replicating CA; von Neumann neighborhood, 29 states, transmission/
  confluent/ordinary states. **K1 with a large sparse table.**
- **Codd's 8-state CA** — von Neumann's simplified to 8 states.
- **Nobili / Hutton 32-state CA** — completed and corrected universal
  constructors, actual working self-replicators.
- **Banks' CA** — 2-state, 4-neighbor, universal.
- **Wireworld** — 4 states: empty, conductor, electron head, electron tail.
  Head→tail, tail→conductor, conductor→head iff 1 or 2 of the 8 neighbors are
  heads. Turing-complete; the Wireworld computer runs a real instruction set.
  **K1 / small-state LUT.** The canonical "logic circuits in an automaton".
- **Wireworld variants** — Wireworld++ , multi-signal variants, delay-insensitive
  circuit CA.
- **Langton's loops** — 8 states, von Neumann neighborhood, a self-replicating
  loop of 86 cells. Descendants: **Byl's loop** (12 cells), **Chou–Reggia loop**,
  **SDSR loop**, **Evoloop** (evolving, Sayama), **Sexyloop** (sexual
  recombination), **Perrier loop** (with a universal computer).
- **Sayama's Structurally Dissolvable SDSR** and **Evoloop** — self-replication
  under selection; the alife bridge.
- **Quantum cellular automata** — unitary local update on a lattice of qubits;
  partitioned QCA, Feynman/Watrous models, the "Quantum Game of Life". Needs
  complex amplitudes per cell and a unitary block table — the same K1/block
  machinery over ℂ.
- **Wolfram Physics model / hypergraph rewriting** — rewrite rules on a graph
  rather than a lattice; requires the GRAPH lattice mode and dynamic topology.

### 2.6 Lattice gases and lattice Boltzmann

**Shape:** each cell holds *q* directional populations. Every step: **stream**
(shift each population along its direction) then **collide** (relax toward
equilibrium). `update` two-phase SYNC · `engine` **K7**, the single most
reusable physics kernel.

- **HPP (Hardy–Pomeau–de Pazzis, 1973)** — 2D square, 4 directions, 1 bit each.
  Head-on pairs rotate 90°. Mass and momentum conserved but the square lattice
  gives anisotropic (non-Navier–Stokes) macroscopic behavior. Historically
  important, visually distinctive, cheap.
- **FHP (Frisch–Hasslacher–Pomeau, 1986)** — **hexagonal** lattice, 6
  directions; the hexagonal symmetry is exactly what recovers isotropic
  Navier–Stokes. FHP-I (6 bits), FHP-II (+rest particle, 7 bits), FHP-III (full
  collision set, 7 bits). **Boolean, exact, noisy — needs spatial/temporal
  averaging to render.**
- **FCHC** — 4D face-centred hyper-cubic lattice projected to 3D; the 3D
  isotropy fix.
- **Lattice Boltzmann, D2Q9** — the continuum version: replace booleans with
  real-valued distributions f_i.
  - velocities `e = {(0,0),(±1,0),(0,±1),(±1,±1)}`
  - weights `w = {4/9; 1/9 ×4; 1/36 ×4}`
  - equilibrium `f_i^eq = w_i ρ [1 + 3(e_i·u) + 4.5(e_i·u)² − 1.5 u·u]`
  - BGK collision `f_i ← f_i − (f_i − f_i^eq)/τ`
  - `ρ = Σf_i`, `ρu = Σ f_i e_i`, viscosity `ν = c_s²(τ − ½)`, `c_s² = 1/3`
  - stability needs τ > 0.5; τ→0.5 is low viscosity and gets unstable
  - boundaries: **bounce-back** (no-slip walls, trivially easy), Zou–He
    velocity/pressure inlets, periodic
- **D3Q19 / D3Q27 / D2Q7 / D1Q3** — the same kernel, different velocity sets.
- **MRT (multiple relaxation time)** — collide in moment space with per-moment
  τ; much more stable at low viscosity.
- **TRT / regularized / entropic / cumulant LBM** — successive stability fixes.
- **Shan–Chen multiphase/multicomponent LBM** — an interparticle pseudopotential
  force gives surface tension, droplets, wetting, and phase separation for free.
  Density ratios to ~1000:1 with an improved equation of state.
- **Free-surface LBM** — a fill-fraction channel plus interface cells; how you
  get real splashing liquid on a lattice.
- **Thermal LBM** — multi-speed, passive scalar, or double-distribution
  approaches; buoyancy and convection.
- **Immersed boundary LBM** — moving solid objects inside the fluid.
- **LBM for other PDEs** — advection-diffusion LBM, shallow-water LBM,
  magnetohydrodynamic LBM.

### 2.7 Falling-sand and material automata

**Shape:** one buffer, `state` u8/u16 material id + optional per-cell velocity,
temperature, lifetime, "moved this frame" flag · `update` **INPLACE_ORDERED**,
scanned bottom-up with the horizontal scan direction alternating each frame to
kill the directional bias · `boundary` solid walls · `engine` **K6**: a
per-material *movement class* plus a pairwise *reaction table*.

The general movement classes — the whole family is just these five plus a table:

| Class | Rule |
|---|---|
| STATIC | never moves (wall, stone) |
| POWDER | try down; else down-left/down-right (random order); optional inertia |
| LIQUID | powder rules; else left/right up to `dispersion` cells |
| GAS | inverted powder (up-biased), plus random lateral drift and lifetime |
| RIGID | belongs to a body; moved by a physics solver, rasterized back to the grid |

Systems and their contributions:

- **Falling Sand Game / "Hell of Sand" (2005)** — the original browser
  formulation: sand, water, wall, plant, fire, oil.
- **The Powder Toy** — the deepest element model in the family: ~200 elements,
  per-element temperature, pressure and velocity fields, heat conduction,
  state-change temperatures, radiation, electronics (spark propagation),
  pressure waves. The reference for *how big a reaction table can get*.
- **Noita** — 64×64 pixel chunks, each with a **dirty rect** so only touched
  regions update; multithreaded across chunks (checkerboard chunk ordering
  avoids races); **marching squares** over solid pixel clusters to extract
  polygons that go into a rigid-body solver and get rasterized back. This is the
  blueprint for a large-world sand engine.
- **Sandspiel / Sandspiel Studio** — WebAssembly + WebGL; a clean, readable
  element set and a visual rule editor. Good source for element semantics.
- **Dust / Powder Game / Sandbox variants** — additional element vocabularies.
- **Velocity-carrying sand** — grains hold a vec2 and integrate ballistically,
  falling back to the swap rules on contact; what makes explosions look right.
- **Reaction tables** — the general primitive: `(A, B, dir) → (A', B', p)`.
  Acid dissolves, water+lava→stone(+steam), fire needs fuel and consumes it,
  plant grows into adjacent water, ice melts above T, gunpowder ignites, oil
  floats on water by density comparison.
- **Density-ordered displacement** — liquids stratify automatically if a heavier
  liquid may swap with a lighter one; one comparison replaces dozens of rules.
- **Pressure/air grid** — a coarse scalar+vector field coupled to the material
  grid; drives gas motion and explosion shockwaves (Powder Toy, Noita).
- **Sand rigid bodies** — Noita/FallingSandSurvival approach: connected
  components → marching squares → Douglas–Peucker simplify → Box2D polygon →
  simulate → re-rasterize.
- **Cellular fracture / crack propagation CA** — stress channel, threshold, and
  directional crack advance.
- **Support/stability check** — flood fill from anchors; unsupported clusters
  become rigid bodies or crumble.
- **Melting/freezing/burning as temperature thresholds** — one heat layer (K3)
  plus per-material thresholds gives all phase change with no extra rules.

### 2.8 Field solvers: fluids, heat, waves, erosion

- **Heat / diffusion equation** — `T += α·Δt·∇²T`, 5-point Laplacian
  `(T_L+T_R+T_U+T_D−4T_C)/h²`. Explicit stability: `α·Δt/h² ≤ 0.25` in 2D.
  9-point Laplacian for better isotropy. **K3.**
- **Implicit / iterative diffusion** — Jacobi or Gauss-Seidel sweeps; **K8**;
  unconditionally stable, needed for large α.
- **Jos Stam "Stable Fluids" / "Real-Time Fluid Dynamics for Games"** — the
  canonical real-time Eulerian solver: `add force → diffuse → advect
  (semi-Lagrangian) → project (Poisson pressure solve)`. Unconditionally stable
  because advection backtraces. **K10 + K8 + K3.** The single most useful fluid
  path for an engine.
- **MAC staggered grid** — velocities on faces, pressure at centres; the correct
  discretization for divergence-free projection.
- **Vorticity confinement** — re-injects lost curl; keeps smoke swirly.
- **Buoyancy + smoke** — density and temperature advected as scalars, forces fed
  back into velocity. The standard "smoke/steam" look.
- **FLIP / PIC / APIC** — particles carry velocity, grid solves pressure,
  velocity transfers both ways. Best-looking liquids; needs an agent buffer
  alongside the grid.
- **MPM (Material Point Method)** — particles + background grid; the standard
  for snow (Disney's *Frozen*), sand, mud, elastoplastic goo. Same coupling
  shape as FLIP with a constitutive model.
- **SPH** — meshless particles with smoothing kernels; grid-free but usually
  neighbor-searched with a uniform grid, so it fits the same engine.
- **Level set / VOF (volume of fluid)** — free-surface tracking; VOF conserves
  mass, level sets stay smooth.
- **Shallow water equations on a grid** — height + 2D velocity; cheap, great for
  large water surfaces, rivers, floods.
- **Height-field ripple / 2-buffer wave automaton** — the classic demo effect:
  `new = (L+R+U+D)/2 − prev; new *= damping`. Two history buffers, no velocity
  field. **K3 + history.** Still the cheapest convincing water.
- **2D wave equation / FDTD acoustics** — `u_next = 2u − u_prev + c²Δt²∇²u`.
  Ripple tanks, interference, diffraction, room acoustics.
- **FDTD electromagnetics (Yee grid)** — E and H on interleaved staggered grids;
  same K3 shape, beautiful renders.
- **Ising model / Metropolis / Glauber dynamics** — spin lattice with
  temperature; magnetization, phase transition at T_c. **Stochastic K2.**
- **Q2R / Creutz / microcanonical Ising** — deterministic reversible Ising CA.
- **Potts model** — q-state Ising; grain growth, foam coarsening, cell sorting
  (the Cellular Potts / Glazier–Graner–Hogeweg model for biological tissue).
- **Hydraulic erosion on heightmaps** — water, sediment, and velocity channels;
  dissolve, transport, deposit, evaporate.
- **Droplet/particle erosion** — thousands of independent droplets carving a
  heightmap; agent + field coupling.
- **Thermal erosion / talus angle** — material above the repose angle slides to
  lower neighbors.
- **Dune formation (Werner model)** — sand slabs picked up and deposited
  downwind with a shadow zone; produces barchan and transverse dunes.
- **Sediment transport / river carving / watershed flow accumulation.**
- **Abelian sandpile (Bak–Tang–Wiesenfeld)** — a cell with ≥4 grains topples,
  giving one to each neighbor. Self-organized criticality; the identity element
  fractal is a famous image. **K2-shaped, but needs relaxation-to-stable
  iteration.**
- **Manna model / Oslo model / chip-firing** — stochastic and 1D sandpile
  relatives.
- **Bak–Sneppen evolution model** — punctuated equilibrium on a lattice.
- **Forest fire model (Drossel–Schwabl)** — empty→tree with p, tree→burning if a
  neighbor burns or with lightning probability f, burning→empty. Criticality at
  p/f→∞. **Stochastic K2 with 3 states.**
- **Percolation / invasion percolation / Eden growth** — cluster growth and
  connectivity thresholds.
- **SIR / SEIR epidemic CA, contact process, voter model** — stochastic
  multi-state K2; identical machinery to the forest fire.

### 2.9 Continuous and kernel-based automata

**Shape:** float channels, a *large* radially symmetric kernel, and a smooth
growth function. `engine` **K4 + K5** — this is the second big kernel and the
reason an FFT or separable-convolution path belongs in the engine.

- **SmoothLife (Rafler, 2011)** — the principled continuous Life. Two disk
  filters: an inner disk of radius r_i and an outer annulus of radius r_a
  (typically r_a = 3·r_i, e.g. r_i=6, r_a=18). `n` = normalized outer fill, `m` =
  inner fill. A smooth transition `s(n,m)` built from sigmoids
  `σ(x,a,α)=1/(1+e^{−4(x−a)/α})` interpolates between "birth interval [b1,b2]"
  and "survival interval [d1,d2]" according to m. Discrete-time (`f = s(n,m)`)
  and smooth-time (`∂f/∂t = 2s−1`, integrated with dt) variants; the smooth-time
  version has genuine free-swimming gliders. Typical b1,b2 ≈ 0.257, 0.336;
  d1,d2 ≈ 0.365, 0.549; α_n ≈ 0.028, α_m ≈ 0.147. **[verify exact constants
  against the paper PDF before shipping presets]**
- **Lenia (Bert Chan, 2018)** — the general framework. A radial kernel shell
  (typically a Gaussian bump `exp(−(r/μ_k−1)²/(2σ_k²))` or a polynomial/
  rectangular shell), optionally expanded by a **kernel skeleton** — a peak
  vector β=(β₁,β₂,…) that makes concentric rings of different heights — then
  normalized to sum 1 over a ball of radius R. Each step: `U = K * A`
  (convolution), growth `G(U) = 2·exp(−(U−μ)²/(2σ²)) − 1` (a bell mapped to
  [−1,1]), then `A ← clip(A + G(U)/T, 0, 1)` where T is the time resolution.
  Conway's Life is the R=1, T=1, step-function limit. Over 400 catalogued
  "species" showing self-organization, self-repair, bilateral and radial
  symmetry, and locomotion — *Orbium*, *Scutium*, *Hydrogeminium natans*,
  *Gyrorbium*, *Pentafolium*. **Look up exact per-species (R,T,μ,σ,β) from the
  paper appendix rather than trusting any secondhand table.**
- **Lenia variants** — **Expanded Lenia** (multiple kernels and channels,
  asymmetric/non-radial kernels, 3D), **Asymptotic Lenia** (smooth,
  well-defined limit dynamics), **Flow Lenia** (mass-conserving, matter flows
  rather than being created — species can coexist), **Particle Lenia**
  (off-lattice, particles with an energy landscape), **Glaberish** (splits the
  growth term into genesis and persistence, arbitrary functions), **Sensorimotor
  Lenia** (agents with actions).
- **Multi-channel / multi-kernel Lenia** — several channels each convolved with
  several kernels and cross-coupled; a whole "chemistry".
- **Multi-scale Turing patterns (Jonathan McCabe)** — blur the image at N
  different radii, compare successive scales, and nudge each pixel by the
  smallest-scale winner. Produces astonishing organic patterns from pure
  convolution. **K4 at multiple radii + K5 selection.**
- **Reintegration tracking** — a mass-conserving advection scheme for
  cellular-scale motion; used to make Lenia-like systems conserve matter.
- **Coupled map lattices** — each cell runs a 1D map (usually logistic
  `x→rx(1−x)`), then diffuses with its neighbors: `x_i ← (1−ε)f(x_i) +
  (ε/2)(f(x_{i−1})+f(x_{i+1}))`. Spatiotemporal chaos, travelling waves,
  intermittency. **K5 + K3.**
- **Kuramoto oscillator lattice** — phase per cell, coupled to neighbors;
  synchronization waves, chimera states.
- **Chialvo / Izhikevich / FitzHugh–Nagumo neuron lattices** — excitable neural
  media; spiral waves and bursting.
- **Random Boolean networks (Kauffman NK)** — each node has K random inputs and
  a random boolean function; a CA on an arbitrary graph. Order/chaos phase
  transition at K=2.
- **Hopfield / spin-glass lattices** — associative memory dynamics rendered as a
  grid.

### 2.10 Reaction–diffusion and pattern formation

**Shape:** 2+ float channels, 5-point Laplacian, per-cell nonlinear ODE.
`engine` **K3 + K5.** Second only to Life for output-per-line-of-code.

- **Gray–Scott** — the workhorse:
  ```
  ∂u/∂t = D_u ∇²u − u v² + F(1 − u)
  ∂v/∂t = D_v ∇²v + u v² − (F + k) v
  ```
  with `D_u ≈ 0.16, D_v ≈ 0.08` (or 0.2097/0.105), dt≈1. Pearson's parameter
  map over (F,k) contains named regimes — solitons, mitosis/self-replicating
  spots, coral/fingerprint growth, worms, stripes, waves, chaos, U-Skate.
  Useful starting presets: mitosis ≈ (0.0367, 0.0649); coral ≈ (0.0545,
  0.0620); spots/solitons ≈ (0.030, 0.062); worms ≈ (0.078, 0.061); waves ≈
  (0.014, 0.054). **Verify against Munafo's xmorphia map — the regimes are
  narrow and mislabelled everywhere on the web.**
- **Turing / activator–inhibitor (Gierer–Meinhardt)** — short-range activation,
  long-range inhibition; spots and stripes; the original morphogenesis model.
- **Brusselator, Schnakenberg, Oregonator** — alternative reaction kinetics with
  the same shape.
- **FitzHugh–Nagumo** — excitable medium; spiral waves, target patterns; the
  continuous cousin of Greenberg–Hastings.
- **Belousov–Zhabotinsky (chemical oscillator)** — real spiral chemistry;
  simulated either as RD or as the **Hodgepodge machine** (Gerhardt–Schuster):
  discrete states with healthy/infected/ill cells and `k1,k2,g` parameters,
  giving BZ spirals from integer arithmetic alone.
- **Greenberg–Hastings model** — the minimal excitable automaton: resting →
  excited (if enough excited neighbors) → refractory (n steps) → resting.
  Spiral waves. Brian's Brain is its 3-state cousin.
- **Cyclic cellular automaton (Fisch–Gravner–Griffeath)** — n states in a cycle;
  a cell advances to state (s+1) mod n if at least θ neighbors are already
  there. Debris → droplets → defects → spirals. Gorgeous, four lines of code.
- **Rock–paper–scissors / cyclic competition lattices** — 3-state CCA; spiral
  domains and biodiversity models.
- **Cahn–Hilliard** — conserved phase separation; spinodal decomposition,
  bicontinuous foams. Fourth-order, needs ∇⁴.
- **Allen–Cahn** — non-conserved phase field; interface sharpening, grain
  growth.
- **Swift–Hohenberg** — pattern selection with a preferred wavelength; stripes,
  hexagons, labyrinths.
- **Complex Ginzburg–Landau** — spiral defect chaos in a complex field.
- **Keller–Segel chemotaxis** — cells climb a chemical gradient they secrete;
  aggregation and streaming.
- **Phase-field solidification / dendritic growth** — the physics-correct
  snowflake: order parameter + temperature field, anisotropic surface energy.
- **Reiter's snowflake CA** — hexagonal lattice, one real value per cell split
  into "receptive" and "non-receptive" parts, with parameters α (diffusion), β
  (background vapor), γ (vapor addition). Produces convincing snowflakes.
- **Gravner–Griffeath "snowfakes"** — a more elaborate 3-mechanism hexagonal
  model (diffusion, freezing, attachment, melting) that reproduces the real
  morphology diagram.

### 2.11 Growth, aggregation and dendrites

- **Diffusion-limited aggregation (DLA)** — random walkers stick on contact with
  the cluster. Fractal dimension ≈ 1.71 in 2D. Slow naively; the standard
  speedups are a birth circle, variable step size, and a distance field.
  **Agent (K9) + occupancy grid.**
- **Dielectric breakdown model (DBM / Niemeyer–Pietronero–Wiesmann)** — solve
  the Laplace equation, grow toward high-potential sites with probability ∝ |∇φ|^η.
  η controls the branching: η=1 is DLA-like, η=3 gives lightning. **K8 + growth.**
  The correct way to make lightning.
- **Laplacian growth / viscous fingering (Saffman–Taylor)** — same family,
  continuous interface.
- **Eden growth model** — occupied cells recruit random empty neighbors;
  compact clusters with rough (KPZ) boundaries.
- **Ballistic deposition** — particles fall and stick where they first touch;
  columnar deposits, KPZ scaling.
- **Invasion percolation** — grow into the weakest available site.
- **Corrosion / rust / mould spread CA** — probabilistic contact spread with a
  material mask.
- **Crystal growth CA** — anisotropic sticking probability by direction.
- **Space colonization algorithm** — attraction points guide branch growth;
  trees, veins, lightning, river networks.
- **L-systems (on or off grid)** — rewriting grammars for plants; rasterized
  into the grid as a generator (G).
- **Root/mycelium growth models**, **vein/leaf venation**, **coral growth**,
  **slime networks** — all the same "grow toward a resource field" shape.

### 2.12 Mobile-agent automata (turmites and friends)

**Shape:** the grid holds cell colors; one or more agents hold `(x, y, heading,
internal state)`. Each step an agent reads its cell, consults a table, writes a
new color, turns, and steps forward. `engine` **K9** — an agent buffer plus grid
read/write. Distinct enough from cell-parallel rules to deserve its own path.

- **Langton's ant** — 2 colors: on white turn right, flip, move; on black turn
  left, flip, move. Chaotic for ~10,000 steps, then unavoidably builds a
  period-104 "highway" — one of the loveliest emergence demos there is.
- **Turmites / generalized ants** — rule strings over {L,R,U,N} per color:
  **RL** (Langton), **RLR**, **LLRR**, **LRRRRRLLR**, **RRLLLRLLLRRR**
  (builds symmetric growth), **LLRRRLRLRLLR**, **RRLRLLLLLRRR**. Dozens of
  named specimens with distinct signature growths.
- **Multi-state turmites (Turing machines on a 2D tape)** — an internal state
  register multiplies the rule space enormously.
- **Langton's ant on hexagonal / triangular lattices** — different turn
  alphabets.
- **Multiple interacting ants** — collisions and interference.
- **Paterson's worms** — an agent on a triangular lattice that cannot cross its
  own path.
- **Busy beaver / Turing machine visualizations** — the 1D tape as a
  space-time image.
- **Ant colony / pheromone foraging** — many agents depositing and following
  evaporating pheromone; ACO for pathfinding. **K9 + K3 field.**
- **Termite / wood-chip agents (StarLogo classic)** — pick up and drop chips;
  spontaneous sorting.
- **Physarum / slime mould (Jones 2010)** — the highest beauty-to-code ratio in
  this whole document. Each of ~10⁶ agents has a position and heading; it
  samples the trail map at three sensors (forward, forward-left, forward-right)
  at distance `SO` and angle `SA`, rotates by `RA` toward the strongest, moves
  `SS` forward, and deposits `depT`. The trail map is then blurred (3×3 mean)
  and multiplied by a decay factor. Typical: SA≈22.5°, RA≈45°, SO≈9px, SS≈1px,
  decay≈0.1, 3×3 diffusion. Produces transport networks indistinguishable from
  the real organism. **K9 + K3 + decay.**
- **Boids (Reynolds 1987)** — separation, alignment, cohesion within a
  perception radius, plus optional goal/avoid forces. Neighbor search via a
  uniform grid — which the engine already has. Off-lattice agents, grid-
  accelerated.
- **Vicsek model** — the minimal flocking model: align with the mean heading of
  neighbors within r, plus angular noise η. A genuine phase transition to
  collective motion as η drops.
- **Active matter / self-propelled particles / active Brownian particles** —
  motility-induced phase separation.
- **Particle Life / Clusters (Ventrella, Mohr)** — k species, an asymmetric k×k
  attraction matrix, short-range repulsion. Produces cells, chasers, and
  self-maintaining structures from pure pairwise force. **Agent buffer + grid
  neighbor search.**
- **Primordial Particle Systems (Schmickl et al.)** — a single motion law
  (turn by α + β·N·sign(R−L)) that spontaneously produces self-replicating
  cell-like structures.
- **Swarm Chemistry (Sayama)** — heterogeneous kinetic parameters per species;
  recipes that self-organize into segregated, dynamic aggregates.
- **Braitenberg vehicles** — sensor→motor couplings; "fear", "aggression",
  "love" from two wires.
- **Floor-field pedestrian CA** — a static field (distance to exit) plus a
  dynamic field (footprint traces); the standard evacuation model.
- **Crowd/panic models, lane formation, bottleneck oscillation.**

### 2.13 Neural and learned automata

- **Growing Neural Cellular Automata (Mordvintsev et al., distill.pub 2020)** —
  16 channels per cell (RGBA + 12 hidden). Perception = per-channel Sobel-x,
  Sobel-y and identity → 48 values; then a 1×1 conv (dense 128) → ReLU → 1×1
  conv to a 16-channel *residual* update, zero-initialized. Applied
  **stochastically** (each cell updates with p≈0.5) and masked by an "alive"
  test (max-pooled alpha > 0.1). Trained by backprop through 64–96 steps to
  regenerate a target image — and it regenerates after damage. **K3 (fixed
  filters) + K5 (tiny per-cell MLP).** Very much an engine primitive: a
  learned-weight kernel.
- **Self-classifying MNIST CA** — cells reach consensus on a global label with
  only local messages.
- **Texture NCA / self-organising textures** — trained against a VGG style loss;
  endlessly generative textures.
- **Adversarially robust NCA, Variational NCA, Goal-conditioned NCA,
  Hypernetwork/meta NCA, Attention-based (Vision Transformer) CA,
  Differentiable Lenia, Neural Patterns** — the current research frontier;
  all the same execution shape with different weights.
- **Learned life-like rules / GA-evolved CA rules** — evolve rule tables for a
  target behavior (the classic density-classification task, Mitchell et al.).
- **CA for texture synthesis and style transfer** — grid kernels with learned
  weights, run as a per-frame layer.

### 2.14 Noise and procedural fields (one-shot generators, G)

Not per-step automata, but the engine needs them as *initializers and modulators*
for every layer above — a wind field, a fuel map, a terrain seed.

- **Value noise** — random lattice values, smoothly interpolated.
- **Perlin noise (1985) / Improved Perlin (2002)** — random gradients at lattice
  points, dot with the offset, quintic fade `6t⁵−15t⁴+10t³`, interpolate.
- **Simplex noise (2001) / OpenSimplex / OpenSimplex2** — simplex grid, O(n²)
  instead of O(2ⁿ), no directional artifacts, patent-free variants.
- **Worley / cellular / Voronoi noise (1996)** — distance to the nth nearest
  feature point; F1, F2, F2−F1 (cracks/cells); Euclidean, Manhattan, Chebyshev,
  Minkowski metrics.
- **fBm / turbulence / ridged multifractal** — octave sums with lacunarity and
  gain; `|noise|` for turbulence, `1−|noise|` ridged for mountain ridges.
- **Domain warping** — `noise(p + noise(p))`; the single highest-value trick for
  organic-looking fields (Iñigo Quílez).
- **Curl noise** — take the curl of a noise field to get a divergence-free
  velocity field; instant plausible fluid motion with no solver.
- **Gabor noise / wavelet noise / spot noise** — band-limited, controllable
  spectrum, no aliasing.
- **Diamond–square / midpoint displacement** — the classic fractal terrain
  generator (and the classic *plasma* effect).
- **Blue noise: void-and-cluster, Poisson-disk (Bridson), best-candidate** —
  even point distributions; the right noise for dithering and sampling.
- **White / pink / brown noise, hash-based GPU noise (PCG, xxhash, integer
  hashes)** — the raw sources.
- **Perlin worms** — carve tunnels along a noise-driven path; cave generation.
- **Sparse convolution noise, flow noise, tiling/periodic noise variants.**

### 2.15 Worldgen and constraint automata (G)

- **CA cave generation** — random fill at ~45%, then N passes of "a cell becomes
  wall if ≥5 of its 9 neighbors are wall" (the 4-5 rule). Four lines, and it
  produces the caves in half the roguelikes ever written. It is literally a
  life-like rule (B5678/S45678) run to a fixed point.
- **Drunkard's walk / random walk caves** — carve with a wandering agent.
- **BSP dungeon generation, room-and-corridor, Delaunay + MST corridors.**
- **Maze generation** — recursive backtracker (deep winding), randomized Prim
  and Kruskal (short dead ends), Wilson's and Aldous–Broder (uniform spanning
  trees, unbiased), Eller's (infinite, O(1) memory), hunt-and-kill, binary tree
  and sidewinder (biased, trivially fast), growing tree (parameterized to
  become any of the above), recursive division.
- **Wave Function Collapse (Gumin)** — overlapping model (learn N×N tile
  frequencies from a sample image) and tiled model (explicit adjacency).
  Iterate: pick the lowest-entropy cell, collapse it by weighted random choice,
  propagate constraints; backtrack on contradiction. **A constraint solver over
  the grid — its own engine path (G), but it shares the lattice.**
- **Model synthesis (Merrell)** — the predecessor, with modification-in-blocks
  for large worlds.
- **Constraint/adjacency tilemaps, Markov junior, answer-set worldgen.**
- **Marching squares / marching cubes / dual contouring / surface nets** — grid
  → geometry; needed for sand rigid bodies and 3D CA rendering.
- **Flood fill / connected components / union-find** — supports, cavities,
  region labels.
- **Distance transform / jump flooding algorithm (JFA)** — O(log n) Voronoi and
  signed distance fields on the GPU; used for pathing fields, glow, erosion.
- **Voronoi + Lloyd relaxation** — region partition for biomes, plates, cities.
- **Poisson-disk scattering** — object placement.
- **Diffusion/flow accumulation for rivers, watershed segmentation.**
- **Biome assignment from temperature/moisture fields (Whittaker diagram).**

### 2.16 Fire, smoke and effect automata

- **Demoscene fire (the classic)** — the bottom row is seeded with random hot
  values; every other cell becomes the average of the cells below it
  (down, down-left, down-right, and two-below) minus a small random decay, with
  a random horizontal jitter; the result indexes a black→red→orange→yellow→white
  palette. **K3 with an asymmetric downward stencil + P.** Cheap, and still the
  best-looking fire per instruction.
- **DOOM (PSX/Mobile) fire** — the same idea with an explicit per-pixel
  randomized left/right offset and decay; the well-known 30-line implementation.
- **Fire as a multi-channel CA** — `fuel`, `heat`, `oxygen` channels: heat
  diffuses and rises, ignites cells whose fuel > 0 and heat > threshold, fuel
  burns down producing heat and smoke. This is the version that composes with a
  falling-sand material layer.
- **Wildfire spread CA (Rothermel-based, FARSITE-like)** — per-cell fuel model,
  slope, and wind give an anisotropic spread probability to each neighbor; the
  standard applied model.
- **Drossel–Schwabl forest fire** — the minimal statistical version (§2.8).
- **Smoke** — density advected by a velocity field with buoyancy
  (`force ∝ (T − T_ambient)`) and vorticity confinement. **K10 + K8.**
- **Explosion / shockwave** — a radial impulse into a pressure field, then
  pressure→velocity coupling into the material layer.
- **Plasma effect** — sum of sines of distance and time (`sin(x/a)+sin(y/b)+
  sin((x+y)/c)+sin(√(x²+y²)/d)`), or diamond-square, mapped through a cycling
  palette. Pure P.
- **Water ripple buffer** — the two-buffer damped wave (§2.8), refract-mapped
  over an image.
- **Metaballs / implicit blobs** — scalar field threshold; marching squares to
  outline.
- **Video feedback / zoom-rotate-blend** — sample the previous frame with a
  transform and blend; the analog of a CA whose rule is an affine warp. Produces
  spirals, tunnels, and Rorschach dynamics.
- **Trail/decay buffers** — deposit + diffuse + multiply; underpins Physarum,
  particle trails, motion blur, glow.
- **Heat haze, bloom, chromatic aberration, kaleidoscope** — pure present-pass
  grid kernels the engine should expose for free.

### 2.17 Image-space grid kernels (P)

Same lattice, same neighborhood machinery — worth unifying so any automaton can
be post-processed or fed into another.

- **Convolutions** — box/Gaussian blur (separable), sharpen, emboss, Sobel and
  Scharr gradients, Laplacian and Laplacian-of-Gaussian, unsharp mask.
- **Nonlinear filters** — median, bilateral, anisotropic (Perona–Malik)
  diffusion, kuwahara (painterly).
- **Morphology** — erode, dilate, open, close, hit-or-miss, skeletonize,
  thinning (Zhang–Suen), watershed.
- **Dithering** — Floyd–Steinberg, Atkinson, Jarvis, ordered/Bayer,
  blue-noise threshold; the right way to render a 2-state CA at low bit depth.
- **Halftoning, ASCII/character mapping, palette quantization (median cut, k-means).**
- **Edge detect → Canny, flow-field line integral convolution (LIC)** — LIC in
  particular is the correct way to *see* a velocity field.
- **Seam carving, optical flow, image quilting/texture synthesis.**

### 2.18 Traffic, crowds and lattice social models

- **Rule 184** — the elementary-CA traffic model; exact particle-hole duality.
- **Nagel–Schreckenberg** — accelerate, brake to the gap, randomize (dawdle with
  p), move. Reproduces phantom traffic jams. **1D agent-on-lattice.**
- **Biham–Middleton–Levine (BML)** — two species of car moving east and north on
  alternating steps; a sharp jamming phase transition. Beautiful and trivial.
- **Cellular highway / multi-lane models with lane-change rules.**
- **Floor-field pedestrian CA, evacuation, social force model on a grid.**
- **Schelling segregation model** — agents relocate if dissimilar neighbors
  exceed a threshold; segregation from mild preferences.
- **Sugarscape** — agents with metabolism harvesting a regrowing resource grid;
  the canonical agent-based-modelling world.
- **Voter model, majority dynamics, opinion dynamics, Axelrod culture model.**
- **Game-theoretic spatial CA** — spatial prisoner's dilemma (Nowak–May),
  producing fractal cooperator/defector patterns.
- **Epidemic CA (SIR/SEIR on a lattice), contact process, Domany–Kinzel PCA.**
- **Predator–prey lattice (WaTor)** — sharks and fish on a torus with breeding
  and starvation; population oscillations. A classic and very cheap.
- **Daisyworld** — albedo/temperature feedback on a grid.

### 2.19 Exotic lattices and topologies

For the engine, this is one thing: **adjacency must be data, not code.**

- **Hexagonal lattices** — 6 neighbors; the isotropy fix for FHP, Reiter
  snowflakes, and hex Life variants. Axial/offset coordinates, stored in a
  normal 2D array.
- **Triangular lattices** — 3 or 12 neighbors depending on the definition.
- **Penrose-tile and aperiodic-tiling CA** — Life on a Penrose tiling; no
  translation symmetry, so gliders behave very differently.
- **Graph/network automata** — CA on an arbitrary graph; social networks, random
  Boolean networks, hypergraph rewriting.
- **CA on a sphere (icosahedral/geodesic grid)** — for planetary simulation;
  12 pentagons are unavoidable.
- **3D and 4D lattices** — Moore-26, von Neumann-6, and their 4D analogues.
- **Hyperbolic-plane CA** — exponential neighbor growth; strange dynamics.
- **Irregular / Voronoi meshes** — CA on unstructured cells.
- **Multi-scale and hierarchical CA** — coarse and fine grids exchanging state;
  how you get a large world running at interactive rates.
- **Nested / fractal CA** — subdivision-driven rules.

---

## Part 3 — Coverage check for a "universal" engine

If the engine implements the ten kernels and the seven schedulers, this is what
it costs to add each family:

| Family | New code | Data only |
|---|---|---|
| All 256 elementary rules | — | ✅ 8-bit LUT |
| All 262,144 life-like rules | — | ✅ 18-bit mask |
| All Generations rules | age channel (once) | ✅ B/S/C string |
| All INT + MAP rules | — | ✅ 512-bit table |
| Larger than Life, RealLife | separable box blur | ✅ intervals |
| Wireworld, von Neumann, Codd, loops | — | ✅ state table |
| Margolus/block/reversible | block scheduler (once) | ✅ 16-entry table |
| Falling sand (any element set) | in-place ordered scheduler (once) | ✅ material + reaction table |
| HPP, FHP, all LBM | stream+collide (once) | ✅ velocity set + weights |
| Stam fluids, smoke, shallow water | advect + Poisson solve (once) | ✅ params |
| Heat, waves, FDTD, ripples | stencil (once) | ✅ stencil coefficients |
| Gray-Scott and all RD models | per-cell ODE (once) | ✅ equations + params |
| Lenia, SmoothLife, multi-scale Turing | large radial convolution (once) | ✅ kernel + growth params |
| Neural CA | learned 1×1 conv (once) | ✅ weights |
| Langton's ant, all turmites | agent buffer (once) | ✅ turn string |
| Physarum, Boids, particle life, ACO | agent+field coupling (once) | ✅ params |
| Sandpile, forest fire, Ising, epidemics | stochastic scheduler (once) | ✅ rule |
| DLA, DBM/lightning, Eden, erosion | — | ✅ agent or growth rule |
| All noise, mazes, WFC, caves | generator path (once) | ✅ generator params |
| Hex, tri, 3D, graph, Penrose | adjacency-as-data (design decision) | ✅ neighbor table |

Ten kernels, seven schedulers, one adjacency table, one layer stack. Everything
in this document then becomes a JSON file.

---

## Sources

- [List of Life-like rules — LifeWiki](https://conwaylife.com/wiki/List_of_Life-like_rules)
- [List of Generations rules — LifeWiki](https://conwaylife.com/wiki/List_of_Generations_rules)
- [Life-like cellular automaton — Wikipedia](https://en.wikipedia.org/wiki/Life-like_cellular_automaton)
- [Day and Night — Wikipedia](https://en.wikipedia.org/wiki/Day_and_Night_(cellular_automaton))
- [Lenia — Wikipedia](https://en.wikipedia.org/wiki/Lenia)
- [Lenia: Biology of Artificial Life (Chan) — full paper](https://content.wolfram.com/sites/13/2019/10/28-3-1.pdf)
- [Lenia appendix (species parameters)](https://wpmedia.wolfram.com/sites/13/2019/10/28-3-1-Appendix.pdf)
- [Lenia and Expanded Universe (Chan, ALIFE 2020)](https://direct.mit.edu/isal/proceedings-pdf/isal2020/32/221/1908612/isal_a_00297.pdf)
- [Glaberish: generalizing Lenia](https://par.nsf.gov/servlets/purl/10358005)
- [SmoothLife (Rafler, arXiv:1111.1567)](https://arxiv.org/abs/1111.1567)
- [Lattice Boltzmann methods — Wikipedia](https://en.wikipedia.org/wiki/Lattice_Boltzmann_methods)
- [Gray-Scott / Pearson's parameterization — Munafo (xmorphia)](http://www.mrob.com/pub/comp/xmorphia/index.html)
- [U-Skate World — Munafo](http://www.mrob.com/pub/comp/xmorphia/uskate-world.html)
- [Exploring the Tech and Design of Noita — GDC 2019 notes](https://braindump.jethro.dev/posts/gdc_vault_exploring_the_tech_and_design_of_noita/)
- [Exploring the Tech and Design of Noita — GDC talk](https://www.youtube.com/watch?v=prXuyMCgbTc)
- [Noita: a Game Based on Falling Sand Simulation — 80.lv](https://80.lv/articles/noita-a-game-based-on-falling-sand-simulation)
- [Physarum — Sage Jenson](https://cargocollective.com/sagejenson/physarum)
- [Understanding the Physarum simulation](https://denizbicer.com/202408-UnderstandingPhysarum.html)
- [Rigid bodies in a falling-sand sim (FallingSandSurvival)](https://github.com/PieKing1215/FallingSandSurvival/issues/4)
