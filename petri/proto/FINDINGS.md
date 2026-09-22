# P1b — the coupling-B gate: results

Run with `/usr/bin/python3 petri/proto/coupling_b.py`. Raw numbers in `out/*.json`, fields in `out/*.png`.
This is the gate the spec (study/00 §6, §12 risk 1) put in front of any hybrid WGSL. **It came back
negative for the form that was tested, and that is the useful outcome: it says what not to build.**

## The question

Study/02 §4.2 proposes coupling B: biomass carried by agents in two states, vein conductivity `D` on
cell faces adapting to the rectified flux it carries, flow driven by the plasmodium's own peristaltic
cortex through an elliptic pressure solve. Two things were unknown and unpublished:

1. does a uniform sheet break into veins at a plausible spacing and width, and
2. does net mass then move **toward** food, and which term sets the sign.

The prototype tests the **continuum** form of that coupling — ρ as a field rather than as discrete
walkers — because it isolates the field dynamics, which is where both questions live.

## What was built

A depth-averaged sheet on a square grid: cell-centred ρ (plasm thickness), phase φ and pressure p;
face-centred conductivity `D` and flux `q`. Per step: Kuramoto phase update → peristaltic source
`s = −ρ a ω cos φ` → solve `β ∂p/∂t − ∇·(P∇p) = s` with `P = r₀ρ + D` → `q = −P∇p` → rectified
average `Q̄` → adaptation `∂D/∂t = α Q̄^μ/(1+(Q̄/Q_h)^μ) − r_D D`, μ = 4/3 → upwind transport of a
tracer by `q`. Vein building draws its material from the local sheet, so channels compete for a
finite budget.

## 1. Channelling — NO, for the continuum form

| driver | vein faces | conductivity contrast | Gini of D | flux in veins | solver residual |
|---|---|---|---|---|---|
| peristalsis only (free phases) | 0.000 | 10 | 0.28 | 0.00 | 2.1e-3 |
| + global pressure feedback on phase | 0.000 | 7 | 0.28 | 0.00 | 1.8e-4 |
| + steady throughput (uptake at food, sink at the rim) | 0.000 | 26 | 0.39 | 0.00 | 3.6e-3 |

`D` stays a smooth mottle on the scale of the pressure field. Contrast rises to ~26 with the
conductivity-smoothing term off (it was 9 with `κ_D` at the study's value — that term diffuses `D`
about 520 µm over a run, wider than a vein, and must be near zero in any future attempt), but no
filamentary network forms under any driver. Transport question 2 was not reached: with no veins, the
tracer drift is not a meaningful measurement.

**Why the negative is credible, not a numerical artefact.** The solve is converged (residual 1e-4 to
3e-3, §3); the adaptation is superlinear (μ > 1) so the uniform state *is* linearly unstable; the
seed noise is present; and the material budget supplies the competition that was missing in the first
attempt (without it `D` simply saturated everywhere at contrast 3–9 — also measured).

**What it rules out.** "Veins emerge from flux adaptation on a uniform continuum sheet" is not
sufficient at this coupling. In a 2-D sheet every path is in parallel with every other, so a single
face's conductivity is a negligible fraction of any path's resistance: raising `D` on one face barely
changes the pressure drop across it, and the competition that makes Tero's network select paths never
starts. Tero's model channels because it runs on a **graph** whose topology already exists.

**What it does not rule out** — and the recommended next step — is the form study/02 actually
specifies: biomass in discrete quanta (gel agents that build wall, sol agents advected by `q`), where
the wall is laid down by walkers rather than by a smooth field. That keeps the discreteness that
makes a channel a channel. Before any WGSL, re-run this prototype with walkers.

## 2. Coordination — local phase coupling cannot span a body

Explicit phase diffusion is unusable here: at dt = 1 s and 47–62 µm cells the stability limit is
`K ≤ h²/4dt ≈ 500 µm²/s`, while a body-scale peristaltic wave (Alim 2013: one wavelength per
organism) needs `K ≈ L²Δω ≈ 6×10⁴`. The first version blew up for exactly this reason. Rewritten as
bounded Kuramoto phase, it is stable but its coherence length is 0.06–0.75 mm against an 8 mm body —
local coupling simply cannot carry coordination across an organism at a physical timestep.

The elliptic pressure solve is the only global coupler in the model, and it is already there. If
body-scale peristalsis is wanted, it has to come through the pressure feedback term `χ_p`, not
through phase diffusion. (In this test `χ_p` did not produce coherence either — it lowered it — so
the mechanism is still open.)

## 3. The pressure solve — three concrete answers for P2

Study/02 §6 recommended "one warm-started red-black V(1,1) per step, ≈2.8 ms". Measured, at the vein
contrast the model actually produces:

- **The compliance term does not regularise.** At the physically right β (pressure must equilibrate
  across the body within a fraction of a 100 s period) the system is near-incompressible, `β/dt` is
  ~2 % of the face terms, and the problem is effectively pure Neumann. Its slowest mode is the
  constant — which is *physically meaningless*, since only ∇p drives flux. **Project the mean out of
  the right-hand side and work in the mean-zero subspace.** Without this the solve looks divergent
  (factor 0.996/cycle); with it the same code reaches 0.88.
- **The coarsest level must be solved, not smoothed**, and coarse face conductance must be the
  **sum** of the fine faces it spans (parallel), as the study said — the arithmetic mean makes the
  coarse operator exactly 2× too weak.
- **A V-cycle alone is not enough.** Piecewise-constant prolongation is unsmoothed aggregation and
  plateaus at ≈0.88 per cycle at contrast 60 — so one cycle per step does not track the solution, and
  the study's 2.8 ms estimate is optimistic. Wrapped as a **CG preconditioner** it converges without
  tuning as the contrast grows during a run. P2 should budget MG-preconditioned CG, or switch to
  bilinear prolongation and re-measure.

## Verdict for P2

Do not build the continuum hybrid. Either (a) re-run this gate with discrete gel/sol walkers and only
then port, or (b) accept the study's fallback and run the Tero adaptation on the **extracted vein
graph** (study/00 §3 already keeps G as a first-class representation), where the competition works by
construction, and use the grid only for the sheet and the front. (b) is the lower-risk route and
reuses the skeleton→graph code that T2 needs anyway.

## 4. Question 2 answered on the graph (P2, 2026-09-22) — the minimal pump goes the wrong way

The continuum prototype never reached the transport question, because the sheet never channelled. On
the vein graph the pressure solve is cheap enough to run inside every contraction, so `peristalsis.js`
puts the pump where it belongs: a Kuramoto phase per tube node coupled along the tubes, a pump
`s = −V a ω cos φ`, Kirchhoff flow, and upwind transport of a passive tracer standing for the carried
biomass. Tests in `tests/peristalsis.test.mjs`:

- two halves beating in antiphase shuttle sol back and forth with zero net flux, as they must; all
  tubes beating in phase move nothing at all (a closed network has nowhere to put the volume);
- coupled identical tubes synchronise (order parameter 0.97);
- **with no food the tracer does not move (drift exactly 0). With food at one end raising the local
  frequency, the tracer drifts about 1.7 nodes of 24 AWAY from the food, and softening the cortex at
  the food (larger amplitude there, Kobayashi's suggestion in its simplest form) barely changes it:
  +1.74, +1.75, +1.70 nodes.**

The wave direction is right — raised frequency at food makes contraction waves run outward from it,
as observed — and a wave that runs outward pumps outward (Shapiro peristalsis). The organism, of
course, goes toward food. So in this formulation frequency and amplitude cannot set the sign; that
agrees with Kobayashi, Tero & Nakagaki 2006, who put it on wall stiffness. The candidates left are the
ones that model the wall: an elastic, rate-dependent cortex, or phase feedback from pressure (the χ_p
term that is not in this pump yet), or growth sinks at the front.

One trap on the way, worth keeping: updating the tracer edge by edge in list order let mass cross
several edges in one step, producing a ~3-node drift in the direction the edges happen to be stored.
It read as a physics result ("away from food, in every case") until a no-food control was added.

**Consequence for the engine:** the peristaltic pump is NOT wired in as the adaptation driver. Tero's
random terminal pairs stay: they are phenomenological, but they produce the right networks (TL/MST,
MD/MST and FT in Tero's regime on the 36-source fixture), and the pump as it stands would teach the
organism to flee its food.

### 4b. The elastic-tube pump (2026-09-22) — still not toward food

`pumpElastic` adds what the incompressible pump lacked: a compliant wall (pressure from the stretch of
each tube stretch against an actively oscillating rest volume), Poiseuille conductance ∝ (volume per
length)², and no global projection — sol is simply conserved. On the same 24-node tube with food at one
end, drift of the centre of volume over 40 periods:

| condition | drift (nodes) |
|---|---|
| no food (control) | 0.0000 |
| frequency raised at food | +0.0089 (away) |
| softer cortex at food (Kobayashi's factor) | +0.0009 (≈ none) |
| stiffer cortex at food | −0.0006 (≈ none) |
| frequency + softer | +0.0092 (away) |

Stiffness alone does almost nothing here, for a clear reason: with the total volume conserved the mean
pressure is ≈ 0, so a stiffness contrast has nothing to redistribute. A softer region only stores more
sol when the body is pressurised — by growth, uptake at food, or an osmotic load — none of which this
model has. So the next candidate is not a better wall but a **source**: uptake of fluid at food (the
organism drinks and grows there), which pressurises the body and lets the soft food region fill. Until
that is tested the engine keeps Tero's pairs as the driver.

### 4c. Fluid uptake at food (2026-09-22) — the question dissolves

`pumpElastic({uptake})`: fluid drunk at the food nodes, removed everywhere in proportion to volume
(growth / evaporation), and a passive tracer for the RESIDENT sol, since adding fluid at food moves the
centre of volume toward food by itself. Prediction written before the run: the resident sol goes away.

| condition (40 periods, food at node 0) | volume centre | resident sol |
|---|---|---|
| uptake, no food (control) | 0 | 0 |
| food, no uptake | 0 | 0 |
| uptake 0.002, no contraction | −1.93 (toward) | +2.65 (away) |
| uptake 0.002 | −1.93 | +2.65 |
| + softer cortex at food | −2.19 | +2.37 |
| + stiffer cortex at food | −1.80 | +2.78 |
| + faster at food | −1.92 | +2.65 |
| uptake 0.01 + softer | −3.79 | +6.50 |

Uptake is the one ingredient that finally makes stiffness matter (softer cortex at food stores more of
the drunk fluid there, as §4b said it would), but it never reverses the resident flow: fluid entering
at food leaves through the body — nutrient distribution, which is what the real network does. The
organism "goes toward food" in the only way these experiments allow: material is ADDED where food is
and the rest is exported. That is growth at food, and the engine already has it (agents grow on
nutrient; Tero's pairs shape the tubes). **Question 2 is closed for the engine: no pump is wired in; the
direction of migration belongs to growth, not to transport.** The contraction term contributes nothing
to the net drift in any row — peristalsis stays a candidate for the *look* (P4), not the dynamics.

(Tracer transport uses the upstream node's rest volume; exact on the uniform test chain, approximate on
graphs with unequal node volumes.)
