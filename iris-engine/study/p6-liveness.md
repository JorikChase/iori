# P6 — what still works under the tissue layer model (2026-09-21, engine 0.9.4-edge, NORMAL, ref 26)

Measured, not read: `tools/knob_probe.js` (the K0 harness, unchanged) and `tools/brush_probe.js` (new: every Design
tool through design.js's own `dab`, three rings × 25 dabs × radial repeat 8, genome restored bit-exactly — the render
after the sweep differs from the one before in 0 bytes). ΔY = mean |ΔY| in sRGB code values inside the iris mask;
*moved* = share of iris pixels that changed by more than 2. Verdict: dead < 0.1, weak < 0.5 of legacy.

The shell reads this as `TISSUE_LIVE` in `ui31.js`: while `IrisTissue.on`, dead controls are greyed (strike-through,
tooltip gives the reason), weak ones are marked `~`, and the Relief, Flow and Design windows show a note. Nothing is
disabled — the legacy model reads every value again the moment the layer model is off.

## Knobs

| knob | state key | family | origin → | legacy fit | legacy accum | tissue fit | tissue accum | ratio | verdict |
|---|---|---|---|---:|---:|---:|---:|---:|---|
| seed | `seed` | procedural | 42 → 241.8 | 34.525 | 33.613 | 37.265 | 37.326 | 1.08 | live |
| pupil | `pupil` | geometry | 4.05 → 5.25 | 39.391 | 38.002 | 36.654 | 35.650 | 0.93 | live |
| elev | `lightElev` | light | 1.4 → 1.14 | 8.466 | 7.714 | 6.282 | 5.792 | 0.74 | live |
| light | `lightAngle` | light | 1.57 → 2.826 | 4.260 | 3.813 | 2.745 | 2.426 | 0.64 | live |
| srcsize | `srcSize` | light | 0.12 → 0.206 | 0.000 | 0.000 | 0.000 | 0.000 | 0.00 | dead in both |
| ambient | `ambient` | light | 0.26 → 0.46 | 3.119 | 3.119 | 5.733 | 5.736 | 1.84 | live |
| lid | `lid` | light | 8 → 6.8 | 0.603 | 0.600 | 0.642 | 0.640 | 1.06 | live |
| ev | `ev` | camera | -0.9 → 0.3 | 54.353 | 54.795 | 55.082 | 55.400 | 1.01 | live |
| fstop | `fstop` | camera | 11 → 16.84 | 0.000 | 0.740 | 0.000 | 0.619 | 0.84 | live |
| focus | `focus` | camera | 0 → 1.2 | 0.000 | 10.348 | 0.000 | 7.298 | 0.70 | live |
| kelvin | `kelvin` | camera | 5600 → 6640 | 0.000 | 0.000 | 0.000 | 0.000 | 0.00 | dead in both |
| grain | `grain` | camera | 0.02 → 0.044 | 0.000 | 1.158 | 0.000 | 1.149 | 0.99 | live |
| bloom | `bloom` | camera | 0.35 → 0.55 | 0.000 | 0.000 | 0.000 | 0.000 | 0.00 | dead in both |
| pigment | `pigment` | procedural | 0 → 1 | 45.119 | 45.188 | 56.067 | 56.207 | 1.24 | live |
| stroma | `stroma` | procedural | 0.24 → 0.31 | 3.829 | 3.851 | 4.717 | 4.747 | 1.23 | live |
| pheo | `pheo` | procedural | 0 → 0.2 | 0.158 | 0.158 | 0.209 | 0.211 | 1.33 | live |
| yellow | `yellow` | procedural | 1.07 → 1.57 | 2.732 | 2.743 | 3.797 | 3.789 | 1.38 | live |
| mie | `mie` | procedural | 0 → 0.2 | 0.000 | 0.000 | 0.000 | 0.000 | 0.00 | dead in both |
| ring | `ring` | procedural | 0 → 0.5 | 13.617 | 13.674 | 18.771 | 18.831 | 1.38 | live |
| warp | `warp` | procedural | 0.022 → 0.038 | 0.000 | 0.000 | 0.000 | 0.000 | 0.00 | dead in both |
| collr | `collr` | procedural | 0.18 → 0.27 | 0.538 | 0.474 | 0.146 | 0.147 | 0.27 | weakened |
| crypt | `crypt` | procedural | 0.26 → 0.46 | 11.498 | 11.369 | 0.026 | 0.026 | 0.00 | KILLED |
| furrow | `furrow` | procedural | 0.66 → 0.96 | 0.137 | 0.115 | 0.000 | 0.000 | 0.00 | KILLED |
| relief | `relief` | procedural | 1 → 1.4 | 6.402 | 6.314 | 4.624 | 4.486 | 0.72 | live |
| blcol | `blColour` | procedural | 1 → 0.8 | 5.213 | 5.208 | 5.801 | 5.800 | 1.11 | live |
| blrel | `blRelief` | procedural | 1 → 0.8 | 9.624 | 9.521 | 5.049 | 5.009 | 0.53 | live |
| blflow | `blFlow` | procedural | 1 → 0.8 | 0.622 | 0.449 | 0.044 | 0.040 | 0.07 | KILLED |

Compared with K1 (`k0-knob-liveness.md`): RELIEF (0.01 → 0.72) and FIT·REL (0.27 → 0.52) came back with Z1's deck
height and `sheetZ`; CRYPT, FURROW and FIT·FLOW are still dead (→ G2, G3); COLLAR is still weak. SIZE, KELVIN, BLOOM,
MIE and WARP are dead **in both** models on a fitted eye (reasons in `k0-knob-liveness.md`; BLOOM is 0 even unmasked,
an open engine item) — not a layer-model question, so the shell does not mark them.

## Brushes

| tool | layer | legacy ΔY | moved | tissue ΔY | moved | ratio | verdict |
|---|---|---:|---:|---:|---:|---:|---|
| dent | — | 30.083 | 0.822 | 4.817 | 0.444 | 0.16 | weakened |
| bump | — | 18.550 | 0.799 | 8.304 | 0.604 | 0.45 | weakened |
| streak | — | 30.429 | 0.679 | 3.422 | 0.328 | 0.11 | weakened |
| color | — | 35.093 | 0.877 | 41.816 | 0.852 | 1.19 | live |
| paint | melanin | 4.093 | 0.290 | 5.231 | 0.289 | 1.28 | live |
| paint | yellow | 5.965 | 0.620 | 6.184 | 0.617 | 1.04 | live |
| paint | pheo | 0.331 | 0.033 | 0.448 | 0.041 | 1.35 | live |
| paint | stroma | 3.517 | 0.248 | 4.352 | 0.246 | 1.24 | live |
| paint | gapMelanin | 26.453 | 0.722 | 30.265 | 0.701 | 1.14 | live |
| paint | gapStroma | 19.022 | 0.644 | 21.676 | 0.630 | 1.14 | live |
| paint | height | 3.938 | 0.481 | 0.000 | 0.000 | 0.00 | KILLED |
| paint | crypt | 0.000 | 0.000 | 0.000 | 0.000 | 0.00 | dead in both |
| paint | furrow | 0.000 | 0.000 | 0.000 | 0.000 | 0.00 | dead in both |
| paint | radialFurrow | 0.048 | 0.008 | 0.000 | 0.000 | 0.00 | dead in both |
| paint | collarette | 0.431 | 0.049 | 0.002 | 0.000 | 0.01 | KILLED |
| paint | flowDir | 2.083 | 0.313 | 0.226 | 0.009 | 0.11 | weakened |
| paint | warpU | 2.895 | 0.384 | 0.408 | 0.045 | 0.14 | weakened |
| paint | warpV | 1.812 | 0.276 | 0.251 | 0.018 | 0.14 | weakened |
| paint | spacing | 3.287 | 0.420 | 0.457 | 0.052 | 0.14 | weakened |
| paint | phaseC | 0.726 | 0.112 | 0.042 | 0.000 | 0.06 | KILLED |
| paint | phaseS | 0.819 | 0.126 | 0.034 | 0.000 | 0.04 | KILLED |
| paint | place | 0.609 | 0.097 | 0.032 | 0.000 | 0.05 | KILLED |
| paint | placeSpacing | 1.153 | 0.188 | 0.059 | 0.000 | 0.05 | KILLED |
| paint | coherence | 0.643 | 0.095 | 0.073 | 0.000 | 0.11 | KILLED |
| paint | strandBright | 19.012 | 0.624 | 0.000 | 0.000 | 0.00 | KILLED |
| add | melanin | 3.605 | 0.267 | 4.532 | 0.264 | 1.26 | live |
| add | yellow | 2.357 | 0.417 | 2.591 | 0.429 | 1.10 | live |
| add | pheo | 0.099 | 0.007 | 0.139 | 0.010 | 1.40 | live only in tissue |
| add | stroma | 1.142 | 0.150 | 1.374 | 0.158 | 1.20 | live |
| add | gapMelanin | 21.034 | 0.683 | 23.876 | 0.667 | 1.14 | live |
| add | gapStroma | 1.114 | 0.160 | 1.168 | 0.169 | 1.05 | live |
| add | height | 2.177 | 0.335 | 0.000 | 0.000 | 0.00 | KILLED |
| add | crypt | 0.000 | 0.000 | 0.000 | 0.000 | 0.00 | dead in both |
| add | furrow | 0.000 | 0.000 | 0.000 | 0.000 | 0.00 | dead in both |
| add | radialFurrow | 0.000 | 0.000 | 0.000 | 0.000 | 0.00 | dead in both |
| add | collarette | 0.000 | 0.000 | 0.000 | 0.000 | 0.00 | dead in both |
| add | flowDir | 1.199 | 0.183 | 0.135 | 0.003 | 0.11 | weakened |
| add | warpU | 2.310 | 0.313 | 0.306 | 0.030 | 0.13 | weakened |
| add | warpV | 1.075 | 0.170 | 0.139 | 0.005 | 0.13 | weakened |
| add | spacing | 2.994 | 0.386 | 0.425 | 0.051 | 0.14 | weakened |
| add | phaseC | 0.269 | 0.026 | 0.012 | 0.000 | 0.04 | KILLED |
| add | phaseS | 0.259 | 0.023 | 0.011 | 0.000 | 0.04 | KILLED |
| add | place | 0.286 | 0.033 | 0.015 | 0.000 | 0.05 | KILLED |
| add | placeSpacing | 0.583 | 0.087 | 0.025 | 0.000 | 0.04 | KILLED |
| add | coherence | 0.313 | 0.034 | 0.037 | 0.000 | 0.12 | KILLED |
| add | strandBright | 9.022 | 0.529 | 0.000 | 0.000 | 0.00 | KILLED |
| sub | melanin | 0.355 | 0.054 | 0.450 | 0.062 | 1.27 | live |
| sub | yellow | 2.097 | 0.365 | 2.469 | 0.369 | 1.18 | live |
| sub | pheo | 0.034 | 0.003 | 0.053 | 0.004 | 1.56 | dead in both |
| sub | stroma | 1.390 | 0.165 | 1.718 | 0.169 | 1.24 | live |
| sub | gapMelanin | 0.998 | 0.142 | 1.193 | 0.144 | 1.20 | live |
| sub | gapStroma | 3.524 | 0.424 | 3.870 | 0.433 | 1.10 | live |
| sub | height | 2.177 | 0.336 | 0.000 | 0.000 | 0.00 | KILLED |
| sub | crypt | 0.000 | 0.000 | 0.000 | 0.000 | 0.00 | dead in both |
| sub | furrow | 0.000 | 0.000 | 0.000 | 0.000 | 0.00 | dead in both |
| sub | radialFurrow | 0.013 | 0.001 | 0.000 | 0.000 | 0.00 | dead in both |
| sub | collarette | 0.110 | 0.001 | 0.001 | 0.000 | 0.01 | KILLED |
| sub | flowDir | 1.194 | 0.185 | 0.132 | 0.002 | 0.11 | weakened |
| sub | warpU | 2.339 | 0.317 | 0.315 | 0.032 | 0.14 | weakened |
| sub | warpV | 1.026 | 0.162 | 0.125 | 0.003 | 0.12 | weakened |
| sub | spacing | 3.263 | 0.401 | 0.381 | 0.039 | 0.12 | weakened |
| sub | phaseC | 0.267 | 0.025 | 0.013 | 0.000 | 0.05 | KILLED |
| sub | phaseS | 0.256 | 0.022 | 0.011 | 0.000 | 0.04 | KILLED |
| sub | place | 0.304 | 0.033 | 0.016 | 0.000 | 0.05 | KILLED |
| sub | placeSpacing | 0.834 | 0.133 | 0.037 | 0.000 | 0.04 | KILLED |
| sub | coherence | 0.282 | 0.025 | 0.033 | 0.000 | 0.12 | KILLED |
| sub | strandBright | 11.776 | 0.537 | 0.000 | 0.000 | 0.00 | KILLED |
| smooth | melanin | 0.111 | 0.007 | 0.139 | 0.012 | 1.25 | live |
| smooth | height | 0.630 | 0.087 | 0.000 | 0.000 | 0.00 | KILLED |
| smear | melanin | 0.153 | 0.016 | 0.194 | 0.024 | 1.27 | live |
| smear | height | 0.808 | 0.129 | 0.000 | 0.000 | 0.00 | KILLED |

Reading: the layer model's albedo is scaled by the K1 material ratio, so every tool that writes **material** (COLOR,
and paint / add / sub / smooth / smear on melanin, stroma, pheo, yellow, gap melanin, gap stroma) is live — slightly
stronger than in the legacy model, as the knobs were. Relief **splats** (DENT, BUMP, STREAK) reach it weakly through
the sheet relief borrowed from the legacy field (`sheetZ` 0.5); the **height field** itself, strand brightness, the F2
placement fields, coherence and the structure weights do not reach it at all. Flow direction, warp and spacing move
only the strand-coverage weight inside the material ratio (≈ 0.13). The crypt / furrow / radial-furrow weight layers
are dead in both models on a fitted eye (the fitted genome overrides them).
