# Round handoff — strand building (2026-09-19, oracle §27 → S0 → S1 → S6-lite → guide ceiling §7)

A second track alongside the CAPTURE-audit/relief track (`handoffs/2026-09-18-capture-audit.md`, R1 = v83). This
round answered iori's question "how do we micro-detail and micro-build the irides — strand tools, displacement
brushes — and stay procedural?" with a literature survey, then four measured steps toward explicit strand geometry.
Full log: `study/08-microstructure-and-strand-building.md`. Commits, in order:
`eb6a7c3` (oracle) → `735c4be` (S0+S1) → `0b2212f`, `5b02130` (S6-lite) → `9f6320e` (guide ceiling). Interleaved with
the other track's `d73120c` (R1) — different files, no conflicts; both tracks ran in the same working tree safely.

## 1. The question the round started from

Twenty versions (v62→v82) had moved NORMAL MATCH2 from 58.8 to only 61.4. Before spending another round on the
relief fitter, iori asked for research into state-of-the-art iris-building methods and for a plan.

## 2. Literature (study/08 §1)

No published paper describes a generative, anatomy-driven iris-tissue model beyond **Zuo, Schmid & Chen 2007**
(fibres in 3-D cylindrical coordinates + a translucent top layer with holes). The state of the art for *building*
tissue is in production, not papers: **Weta (Alita, 8.5 M polys/iris)**, Houdini breakdowns (Kumodot), **IrisGen**,
**TexturingXYZ** — all explicit strand geometry in ≥ 2 depth decks, baked to a heightfield. Disney's capture papers
(Bérard 2014/2016) give a fidelity target (25 µm radial) and useful priors (radius-banded exemplars, salient
features first, relief tied to melanin). Every verification tag (READ/PAGE/2ND/unverifiable) is in the chapter.

## 3. The band-swap oracle (spec §27, `fit.bandOracle`/`oracleBench`) — decided the whole round's priority

Splits a fitted render's luminance into LOW/B1/B2/B3/TOP on the shared pixel grid and swaps in the photo's part,
scored with MATCH2's own terms.

- **Amplitude is worth ~0 (−0.6…+0.2 MATCH2); placement is worth +29…+38.** Every "how much" gene (strandGain,
  fibreContrast, openDepth, the stats loss) sits outside where the score lives — §23.1's wall, measured.
- No single band reaches 80; B1+B2 together reach ≈ 84.
- **Correction to something I told iori earlier:** NORMAL's higher score is *not* mostly a resolution artefact —
  the same CAPTURE fit scored at NORMAL's 640 px still trails NORMAL by most of the gap (54.8 vs 61.4); the CAPTURE
  fit is genuinely worse (gives up B1/B2 placement for a small B3 gain — matches R1's own audit).
- **Reading:** R1 (B1, openings) is worth doing and not sufficient. B2+B3 (bundles/strands) are worth as much or
  more and have no fitted position in the engine beyond F2's per-cell phase.

## 4. S0 — measure real strand statistics (study/08 §4, `tools/strand_stats.py`)

Hessian-ridge + NMS centrelines on 4 `ref-staging/` super-macro sectors (0.7–1.8 µm/px, scale from an *assumed*
3 mm pupil, ±30 %). Two populations, **child** and **guide**, at a self-similar ≈ 2.2× ratio in both width and
spacing (child ≈ 50–64 µm / 91–117 µm spacing; guide ≈ 111–130 µm / 203–235 µm); width/spacing ≈ 0.53 for both.
**76–80 % of strand endpoints sit beside another strand** — the signature of an evenly-spaced-streamline grower's
termination rule, not of long combed fibres (visible runs are only ≈ 1.5 spacings). Median 10–25° off radial with
a tail to 45–78° (needs a second, oblique deck — sign of the angle not measured). Ridge vs gap is almost purely a
luminance split (chroma the same) — colour stays with the per-cell material fields, strands modulate brightness.

## 5. S1 — the grower and an explicit strand pass (study/08 §5, `strands.js`, `index.html`)

`IrisStrands.grow()`: deterministic evenly-spaced streamlines over the engine's own `flowDir`/`spacing` fields.
A new ribbon rasteriser (`vs/fs-strand`) writes coverage/tube-height/brightness into an RGBA16F atlas target.
`genome.globals.strandModel` (0 LIC default / 1 curves) switches the **top layer's fine scale only**.

**Two lessons that matter for anyone editing `fs-bake` again:**
1. *Any* code added to the bake shader — even behind an inert uniform — shifts its compiled float arithmetic and
   moves the bench (±0.3 MATCH2 on two eyes). The curves path is a **separately compiled shader variant**
   (`bakeCurvesProgram`, markers `//STRAND_DECL//`/`//STRAND_FINE//` **alone on their own line** — a trailing
   comment turned into code once and silently failed to link, scoring a stale atlas at 7–22).
2. `resetForFreshFit()` deletes unknown `state` keys — an A/B override cannot live in `state` (`E.strandModelOverride`,
   `E.growOverride` live outside it).

A/B at NORMAL, v83 code: LIC 66.20 (bit-identical to v83), curves unplaced 65.98 — neutral, as the oracle predicts
for something unplaced.

## 6. S6-lite — seed/track strands on F2's fitted phase (study/08 §6) — neutral, kept behind the switch

Extended the grower to seed on and track the F2 carrier's crests (`opts.place`, confidence-ranked seeding, pull
toward the crest while growing). **Result: neutral at both qualities** (CAPTURE: LIC 67.08, curves unplaced 65.47,
curves placed 65.58). Probed why on eye 35: F2 describes a **texture** (a per-cell plane wave with 0.76 neighbour
coherence), not strand *positions* — a continuous curve can't stay on "the" crest when neighbouring cells disagree,
and a soft confidence-weighted stripe (what LIC already does) beats a hard, partially-wrong committed curve under
pixel scores. The code stays (never hurts curves mode), curves stay off by default.

## 7. Guide-scale ceiling test (study/08 §7) — the round's key result, and it reverses the read of §6

Ported the S0 tracer to the engine's *own* exactly-scaled bench photos (`tools/guide_trace.py`,
`fit.dumpForGuideTrace`/`fit.bandCorrOf`, new and reusable — factored out of the §27 oracle, no render needed).
406–523 ridges/eye, widths 102–116 µm (matches S0). Three reconstructions scored against the true photo:

| | B1 | B2 | B3 |
|---|---|---|---|
| flat/box brightness per ridge | 0.55–0.70 | 0.35–0.48 | 0.04–0.08 |
| **real photo pixels inside the traced footprint (10–15 % of the area)** | **0.88–0.91** | **0.75–0.79** | **0.66–0.70** |
| current engine, LIC + F2 | 0.62–0.91 | 0.73–0.80 | 0.17–0.31 |

A `bandCorrOf` sanity control (identical → 1.000; 1 px shift / 2 px blur barely move B1/B2) rules out a scoring bug.

**The finding: traced ridge geometry, on its own, already matches or beats the fitted engine on B1/B2 and far
exceeds it on B3 — from only 10–15 % coverage.** The gap in the box reconstruction is not placement, it is
**per-pixel brightness fidelity inside a strand's footprint** (fixing "one colour per whole ridge" to "one colour
per point along it" moved almost nothing — the missing axis is *across* the ridge and at sub-sample resolution).
**S1's strand pass has exactly this flaw**: `strands.js:138` sets one brightness scalar per strand; `fs-strand`
applies it flat across the tube, no per-texel term. That — not placement — is why S6-lite's placed curves didn't
beat LIC: a placed curve with flat brightness is still a flat curve.

## 8. What this round got wrong, corrected in the record

- My first guide-ceiling reconstruction scored *worse* than the engine and I nearly wrote that up as "ridges don't
  help." The `bandCorrOf` control and the real-pixel coverage control (§7) caught it before it went in the spec.
- I told iori NORMAL's score was mostly a resolution artefact of the scoring windows; §27's fixed-resolution
  comparison showed the CAPTURE fit is genuinely worse, not just judged more harshly.

Rule taken from both: when a measurement surprises you, build the control before writing the conclusion.

## 9. Where the next round starts

**S1b (build first): per-texel brightness inside the strand tube.** Reuse the LIC noise field (`strandNoise`) or
equivalent as modulation *inside* `fs-strand`'s tube profile, sampled in the strand's own local frame (S0/§7's
"across and along" axis) — a renderer change, no placement yet. Bench curves vs LIC alone; the guide-ceiling test
(§7) is the target to close in on.

**Then S3: guides as fitted objects from `tools/guide_trace.py`**, rendered through the now-textured strand pass,
replacing the coarse/medium LIC scales — then re-run §7's ceiling test with the *actual render* in place of the
box mock, to confirm the integration reaches the coverage-control's 0.88/0.79/0.68.

**iori's decision (2026-09-18, unchanged) on strand storage, for when S3 needs it:** guides + generated children
(evenly-spaced streamlines), with **ACTUALIZE** — freeze a guide's children into editable splines (stored in the
guide's local frame) with a RE-GROW back to generated; only actualized guides cost bytes. LIC and curves coexist
behind `strandModel`, A/B by bench. Strand brushes (ADD/CUT/COMB/PINCH/PART/WIDTH/LIFT-SINK/ARCADE) before
displacement brushes — R0 (other track, §26.1) already showed bumps are nearly invisible under the ring flash, so
displacement brushes serve the relief view and other lighting, not the photo match.

Also open, not started: S2 (decks — Rohen/Wyatt posterior arcs + anterior radial + an ABL sheet with holes =
crypts, consuming R1's opening placement as the obstacle field), S4/S5 (brushes), sub-strand decade (F3).

## 10. Data and code map (this track)

| path | what |
|---|---|
| `strands.js` | `IrisStrands.grow` — the streamline grower (S1), place-aware (S6-lite) |
| `index.html` | strand ribbon pass (`vs/fs-strand`), `growStrands`/`buildStrandGeometry`/`drawStrands`, `bakeCurvesProgram`, `LIC/CURVES` button, `E.strandModelOverride`/`E.growOverride` |
| `fit.js` | §27 oracle (`bandOracle`, `oracleBench`, `oracleParts`, `partCorrOf`); §28 `bandCorrOf`, `dumpForGuideTrace`, `guideCeilingBench` |
| `tools/strand_stats.py` | S0: ridge/centreline stats on `ref-staging/` super-macros (assumed scale) |
| `tools/guide_trace.py` | §7: the same tracer on the engine's own exactly-scaled bench photos |
| `study/08-microstructure-and-strand-building.md` | the full log: literature, S0–S7 |
| `study/audit-27/` | oracle probe data |
| `study/s0-strands/` | S0 traces + overlays (overlay jpgs gitignored) |
| `study/audit-s1/`, `study/audit-s6/` | S1/S6-lite A/B benches, guide-trace + ceiling data + overlays |

Run: same server as the other track (`python3 iris-engine/serve.py 8768`). `window.__irisEngine.fit` = `F`.
New console entry points: `F.oracleBench()`, `F.guideCeilingBench()`, `F.dumpForGuideTrace(file)`.
Python tools need `/usr/bin/python3` (has cv2), not the Homebrew one.
