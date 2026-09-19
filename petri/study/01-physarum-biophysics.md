# 01 — Physarum polycephalum biophysics: the numbers

Scope: the quantities the petri engine needs to look and behave like a real *Physarum polycephalum* plasmodium, from a 90 mm dish down to < 1 µm. Units: µm, mm, s, min, h, Pa, µm/s, mM.

Conventions:
- A number with a source tag, e.g. (Alim 2013), was checked against the paper text or abstract in this pass.
- **[unverified]** = textbook/recollection value not checked against a primary source. A starting guess, not a target.
- **[derived]** = computed here from verified numbers.
- "Model value" = assumed by a published model, not measured.

---

## 1. Life cycle and what the dish actually shows

### 1.1 Stages

| Stage | What it is | Size | Visual relevance |
|---|---|---|---|
| Plasmodium | One diploid multinucleate cell (syncytium); nuclei divide without cytokinesis | 100 µm to > 0.5 m (Alim 2018; Gerber 2022) | **What the engine simulates** (§2–§5) |
| Sclerotium | Dormant, dried plasmodium (starvation/drying in the dark); reversible | Spherules 24–40 µm, up to ~14 nuclei each (secondary source); survives months to > 1 year (NBK586933) | "Dried out" preset: dull orange-brown crust, network frozen, no streaming; revives on re-wetting in hours–1 day **[unverified]** |
| Sporangia | Starvation + light → multi-headed, stalked, dark fruiting bodies | ~1–2 mm tall **[unverified]** | Optional irreversible end-state |
| Spores / amoebae | Haploid; amoebae mate to form a new plasmodium | ~8–11 µm / ~10 µm **[unverified]** | Ignore for v1 |

Sporulation action spectrum: UVA (~350 nm), blue (~460 nm), UVC (~270 nm), near-IR (~750 nm) (Nakagaki 1996); a phytochrome-like red/far-red pigment (670 nm) gates it in starved plasmodia (Lamparter & Marwan 2001).

### 1.2 Standard lab culture (the "default dish")

| Parameter | Typical value | Source |
|---|---|---|
| Substrate | 1–2 % (w/v) non-nutrient agar; 1 % most common in behaviour work, 1.2–1.5 % in network imaging | Reid 2012 (1 %); Alim 2013 (1.5 %); Sánchez-Parra 2025 (1.2 %); Kuroda 2015 (1.0 %) |
| Food | Rolled oat flakes on the agar, or 10 % blended oats in 1 % agar | Boisseau 2016 |
| Light | Dark (light is aversive and induces sporulation when starved) | all of the above |
| Temperature | 22–26 °C (22 °C Reid; 24 ± 1 °C Kuroda; 25 °C Boisseau; 26 °C Saigusa) | — |
| Humidity | ~90 % RH | Saigusa 2008; Kuroda 2015; NBK586933 |
| Growth limits | min ~15 °C, optimum ~26 °C, max ~30 °C | Le Verge-Serandour 2023 |
| Dish coverage | A 90 mm plate of plain agar is explored in ~1 day from a large inoculum; from a small inoculum, growth toward food starts by day 2 and the plate is covered within 5 days | Sánchez-Parra 2025; NBK586933 |

### 1.3 Colour

- The yellow is a mix of polyene pigments: physarochrome A (a pentaenoyl-glutamine conjugate; Steffan 1987), chrysophysarin A, polycephalins. Physarochrome-type pigments are candidate photoreceptors.
- The pigment is a pH indicator: deep red-orange at pH ~1 through bright yellow to yellow-green above pH 8; the plasmodium reportedly shifts from ~pH 8 when fruiting to ~pH 1.6 when sclerotising (Seifriz & Zetzmann 1935). Mapping: hue drifts yellow → orange with stress/drying.
- Colour scales with thickness: thin sheet = pale lemon, near-transparent; thick veins and front rim = saturated yellow-ochre; abandoned veins fade. **[qualitative]**

### 1.4 The slime sheath and slime trail

- The plasmodium is coated by an extracellular slime sheath that collapses behind it into a track: a thin, translucent, glossy film keeping the ghost outline of former veins; near-invisible in brightfield, clear in darkfield/oblique light.
- Composition: sulfated (and phosphorylated) β-D-galactan / glycoprotein. Scraped tracks: 64 % carbohydrate, 12.7 % protein, 5.2 % sulfate (Huynh 2017). Thickness ~1–10 µm hydrated **[unverified]**.
- Avoidance (Reid et al. 2012, PNAS): in a Y-maze, 39 of 40 plasmodia chose the blank-agar arm over the slime-coated arm. In a U-trap (5.2 cm base, 3.5 cm arms, 1 % agar, 22 °C, goal = 2 % w/v glucose ≈ 111 mM **[derived]**), 96 % (23/24) reached the goal within 120 h on blank agar, only 33 % (8/24) when the agar was pre-coated with slime (which masks the trail signal). Slime is a weak repellent: overridden when no fresh substrate remains; on adverse substrate the plasmodium prefers its own slime (Patino-Ramirez 2019).
- Mapping: persistent non-diffusing scalar, deposited under biomass, decaying over days, mild negative chemotactic term.

---

## 2. Morphology at each scale

### 2.1 Zones (front to rear)

| Zone | Description | Numbers |
|---|---|---|
| Fan / advancing front | Continuous sheet with a thickened leading rim; no individual veins at the rim; pulsates as a whole | Height ~100 µm is the usual modelling assumption for small plasmodia (Oettmeier 2019). Thickness peaks just behind the edge, then decays exponentially rearward with length 2.6 / 6.9 / 11.6 mm (small / medium / large); h_max ∝ V^0.75 (Kuroda 2015). Dish-scale rim height 0.1–0.5 mm **[unverified]** |
| Reticulate sheet | Sheet perforated by fine endoplasm channels; dense small mesh | Channels 10–30 µm wide in 200–500 µm plasmodia (Matsumoto 2008); tracked internal veins ~20 µm radius, ~500 µm segments in mesoplasmodia (Oettmeier 2019) |
| Transition zone | Holes enlarge, channels become walled tubes; mesh grows rearward | Width ~1–5 mm **[unverified]** |
| Trailing vein network | Hierarchical tubes; few trunks, many thin veins; bare agar + slime between | see 2.2 |

Nuclei are denser in the front than in veins (Gerber 2022).

### 2.2 Veins

| Quantity | Value | Source |
|---|---|---|
| Radius, imaged networks | 5–70 µm (dish-scale, 1–3 cm specimens) | Marbach 2023 |
| Representative radius | a0 = 50 µm | Alim 2013, 2017; Kramar & Alim 2021 |
| Diameter, full range | 50 µm to 1–2 mm (thick strands of large plasmodia) | Adamatzky & Jones 2011 citing classic work |
| Width distribution | Log-normal; segment lengths and areas exponential | Baumgarten, Ueda & Hauser 2010 |
| Topology | Planar graph, essentially only degree-3 nodes | Baumgarten 2010 |
| Hierarchy | Principal cycles of thick veins enclose nested cycles of thinner, less efficient veins (self-similar) | Baumgarten & Hauser 2013 |
| Murray's law | Evacuation networks are reported hydrodynamically optimised and consistent with Murray's law (Σ r³ conserved at junctions) | Akita 2017; exact fitted exponent **[unverified]** — use 3 |
| Wall (ectoplasm) vs lumen (endoplasm) | Model value h = 0.1·a0 (Alim 2017). Real lumen often ~half the outer diameter **[unverified]**. Wall thins in contraction, thickens in relaxation; ~29 % of wall material leaves with the endoplasm each cycle | Protoplasma 1978 (DOI 10.1007/BF01276293) |

### 2.3 Whole-organism sizes

| Class | Size | Behaviour |
|---|---|---|
| Microplasmodia | < 100–200 µm | Irregular activity, non-motile (Matsumoto 2008; Le Verge-Serandour 2023) |
| Onset of rhythm | 200–300 µm | Regular contraction and shuttle streaming appear (Matsumoto 2008) |
| Mesoplasmodia | up to ~2 mm² | Tadpole shape, 6–17 µm/min (Oettmeier 2019) |
| Network-forming | > ~500 µm | Full tube networks (Alim 2018 review) |
| Dish scale | 1–10 cm | Fan + network; large ones are long and flat, small ones short and thick (Kuroda 2015) |

### 2.4 Front speed

| Condition | Speed | Source |
|---|---|---|
| Mesoplasmodia (~1 mm) | 6–17 µm/min = 0.4–1 mm/h | Oettmeier 2019 |
| Macroplasmodium, 26 °C, 90 % RH, plain agar lane | ~1 cm/h = 10 mm/h | Saigusa 2008 |
| Typical quoted range | few mm/h to 2–4 cm/h | Le Verge-Serandour 2023 |
| Scaling | speed ∝ h_max^0.95 (thicker front = faster), r = 0.93 | Kuroda 2015 |
| Nutrients in substrate | Migration strongly reduced on nutrient-rich gel; slightly reduced by most sugars at 56 mM | Knowles & Carlile 1978 |
| Uniform 100–200 mM glucose or 100 mM NaCl | Slower exploration, fewer pseudopods; on NaCl exploration starts only after ~3 h | Patino-Ramirez 2019 |

### 2.5 Morphology vs nutrition

- Starved on plain agar: fast, directed, sparse — narrow fan, few thick veins, little mass left behind.
- Rich substrate: slow, isotropic, sheet-like — dense mesh or continuous sheet that stays put and thickens. Takamatsu (2009) mapped morphology against nutrient and agar concentration, analogous to bacterial-colony diagrams; phase boundaries **[unverified]**.
- 50 mM NaCl: thinner veins, fewer dominant trunks, more isotropic spread, detached coralloid outgrowths; 75 mM: strongly delayed growth (Sánchez-Parra 2025).

### 2.6 Coarsening and pruning timescales

| Process | Timescale | Source |
|---|---|---|
| Amplitude/pattern modulation | ~10³ s (e.g. 485 s peak on a 60 mm ring) | Saiseau 2025 |
| Morphological rearrangement | ~45 min; network scale ~10⁴ s | Alim 2013; Saiseau 2025 |
| Single vein shrinking to zero | 15–40 min; local "avalanches" of pruning clear a region in < 15 min | Marbach 2023 |
| Vein radius adaptation time t_adapt | 10–100 min (fit example 37 ± 2 min) | Marbach 2023 |
| Network re-alignment to new confinement | ~3 h | Le Verge-Serandour 2023 |
| Maze: dead ends withdrawn / shortest tube selected | 4 h / 8 h | Nakagaki 2000 |
| Free coarsening behind a front | continues > 17 h (networks analysed at 62 000 s) | Baumgarten 2010 (figure caption only) |

---

## 3. Flow and oscillation

### 3.1 The oscillator

| Quantity | Value | Source |
|---|---|---|
| Period, typical | 60–120 s; "about 100 s"; 131 ± 43 s over one 17 mm network for 1.5 h | Alim 2013 |
| Period, model value | 120 s (ω = 2π/120 s ≈ 0.05 rad/s) | Alim 2017; Kramar 2021 |
| Full range in literature | 50–200 s | Adamatzky & Jones 2011 |
| Temperature | Radial period 2.0 min at 16 °C, 1.5 min at 20 °C, 1.2 min at 24 °C; f ∝ (T − T0)^0.66 | Wohlfarth-Bottermann 1977; Le Verge-Serandour 2023 |
| Size | Period rises logarithmically with plasmodium size | Kuroda 2015 |
| Stimuli | Attractants raise local frequency, repellents lower it; uniform 50 mM NaCl lowers vein frequency | Le Verge-Serandour 2023; Sánchez-Parra 2025 |
| Slow envelope | 20 ± 10 min modulation of speed, shape and period | Kuroda 2015 |
| Amplitude | Model value ε = 0.1·a0 (10 % of radius). Real amplitudes are variable, larger in thicker tubes | Alim 2013 |

### 3.2 Shuttle streaming

| Quantity | Value | Source |
|---|---|---|
| Peak velocity | up to ~1 mm/s; record quoted 1.3–1.35 mm/s | Alim 2013; Goldstein & van de Meent 2015; Gerber 2022 |
| Typical range | 50 µm/s – 1 mm/s in networks; 3 ± 0.5 µm/s mean in 200–500 µm plasmodia; ≤ 20 µm/s in young regenerating droplets | Le Verge-Serandour 2023; Matsumoto 2008; Sato 2025 |
| Reversal | Every half period, ~50–60 s (secondary sources quote 100 s to 2–3 min). Use T/2 of the local oscillator | — |
| Net transport | Forward stroke slightly exceeds backward; this asymmetry moves the organism at mm/h | Matsumoto 2008 |
| Advection reach | ~2 cm per half-period vs ~0.25 mm by diffusion | Alim 2018 review |
| Nuclei | Carried in the endoplasm at up to 1.3 mm/s; others sit immobile in the ectoplasm for minutes | Gerber 2022 |

### 3.3 Peristaltic wave and phase

- One wavelength spans the organism, whatever its size: phase runs 0 → 2π along the longest axis for networks of 3–17 mm, still true at 2.1 cm; ATP-gradient data suggest the scaling holds to ~50 cm (Alim 2013).
- Apparent wave speed **[derived]** = L/T: 10 mm / 100 s = 100 µm/s; 50 mm / 100 s = 500 µm/s.
- In isotropic specimens the phase gradient can point anywhere and rotate; on rings, rotating / standing patterns last ~10⁴ / ~5 × 10³ s; amplitude modulation rotates at ~52 µm/s (Saiseau 2025).
- A local attractant raises frequency and amplitude; that region becomes phase leader and the fan grows there. Repellents do the opposite.

### 3.4 Hydraulics

| Quantity | Value | Source |
|---|---|---|
| Flow law | Poiseuille, C = πa⁴/(8µL), in every published network model; Re ≈ 10⁻³–10⁻¹, Womersley ≪ 1 → quasi-steady Stokes flow | Alim 2013, 2017, 2018 |
| Viscosity used in network models | µ = 6.4 × 10⁻³ Pa·s (ν = 6.4 × 10⁻⁶ m²/s) | Alim 2017; Alim 2018 |
| Measured endoplasm viscosity | 0.1–0.5 Pa·s direct; ~10 Pa·s inferred from velocity profiles; sol 1–2 Pa·s in poroelastic models. The endoplasm is non-Newtonian and the profile is blunter than a parabola | Radszuweit 2013; Le Verge-Serandour 2023 |
| Pressure | ~1 kPa along a 1 cm tube (Le Verge-Serandour 2023). Poiseuille check **[derived]**: a = 50 µm, L = 10 mm, mean v = 0.5 mm/s → ΔP ≈ 100 Pa at 6.4 mPa·s, ≈ 1.6 kPa at 0.1 Pa·s. Kamiya double-chamber balance pressures ±10–20 cm H₂O (1–2 kPa) **[unverified]** | — |
| Wall mechanics | Model E = 10–44 Pa for the thin-wall tube (Alim 2017; Kramar 2021); bulk Young's modulus 10–16.5 kPa; active tension ~20 kPa; gel fraction 0.25; actin mesh pore ~0.25 µm | Radszuweit 2013; Le Verge-Serandour 2023 |

The viscosity spread is absorbed by the pressure scale: fix velocities (observable), let pressure float.

### 3.5 Signal transport

- Taylor dispersion: D_eff = κ + U²a²/(48 κ). With κ = 10⁻¹⁰ m²/s (small molecule), a = 50 µm, U = 0.5–1 mm/s → D_eff ≈ 1.3–5 × 10⁻⁷ m²/s **[derived]**, i.e. 10³–10⁴ × κ (steady-flow upper bound).
- Stimulus front (Alim 2017): a local nutrient stimulus raises contraction amplitude; the front of raised amplitude travels at ~13 µm/s (1–20 µm/s), 2–3× slower than peak flow, consistent with an advected, self-amplifying signalling molecule.
- Softening agent (Kramar & Alim 2021): identity unknown. Food releases an agent that softens tube walls; softened tubes dilate, carry more flow, receive more agent. Dilation front ~15 µm/s; new diameter hierarchy within ~15 min; migration direction reorganised within ~45 min; imprint persists to the end of observation (45–90 min). Model values: k_deg = 10⁻³ s⁻¹, κ = 10⁻¹⁰ m²/s, a0 = 50 µm, T = 120 s.
- Vein adaptation (Marbach 2023): radius follows shear rate with delay 1–3 min (mean ~2 min), then relaxes over t_adapt = 10–100 min. Shear rate oscillates at twice the contraction frequency. Vein fate is set by relative resistance, shear and pressure, i.e. network position, not local shear alone.
- Tube diameter responds 5–15 min after food contact (Le Verge-Serandour 2023).

---

## 4. Sub-cellular view (down to < 1 µm)

### 4.1 Inventory

| Object | Size | Abundance / notes | Source |
|---|---|---|---|
| Nuclei | 5.65 µm mean diameter (3–6 µm in reviews) | Mean inter-nuclear distance 6.63 µm; 99.9 % within 12 µm of another; → order 10⁶ per mm³ **[derived, rough]**; up to ~10⁹ per large plasmodium | Gerber 2022; Le Verge-Serandour 2023 |
| Mitosis | Every 8–10 h, synchronous within ~5 min, closed (intranuclear) | Synchrony degrades in large networks (mitotic waves or asynchrony) | Le Verge-Serandour 2023; Gerber 2022 |
| Mitochondria | ~0.5–1 µm × 1–2 µm **[unverified]** | Very numerous; rod-like mitochondrial nucleoid is a *Physarum* hallmark | — |
| Pigment granules | ≤ 1 µm **[unverified]** | Carry the yellow; concentrated in ectoplasm | — |
| Vacuoles, contractile vacuoles | 1–10 µm **[unverified]** | Clear discs in phase/DIC | — |
| Food vacuoles | 2–30 µm **[unverified]** | Bacteria (1–2 µm rods), oat starch grains (2–10 µm, bright under crossed polarisers), debris | — |
| Tracer-scale particles | 1 µm beads are endocytosed and advected; natural particles of 6–30 µm are trackable | Alim 2013; Sato 2025 |
| Cortex | 0.5–0.7 µm, up to several µm at fans | Dense actomyosin mesh under the membrane | Le Verge-Serandour 2023 |
| Actomyosin fibrils | Mean length ~21 µm; wound helically/circularly in the tube wall; birefringent; assemble in contraction, dissolve in relaxation; longitudinal in stretched strands | ~60 % of actin is F-actin | Le Verge-Serandour 2023 |
| Membrane invaginations | Plasmalemma infoldings arranged circumferentially at the ecto/endoplasm border; apertures ~1.7 µm spaced ~7.3 µm (Le Verge-Serandour 2023); "ca. 10 µm" pores (Radszuweit 2013) | Route for ecto↔endoplasm exchange | — |
| Membrane resealing | 5–6 s | Le Verge-Serandour 2023 |
| Slime layer | ~1–10 µm hydrated **[unverified]** | Sulfated galactan/glycoprotein, outside the membrane | §1.4 |

### 4.2 Ectoplasm gel vs endoplasm sol

- Ectoplasm: stationary fibrillar gel; nuclei and granules locked in place; carries fibrils and invaginations; forms the tube wall and the front rim.
- Endoplasm: flowing sol packed with granules, nuclei, mitochondria, food vacuoles. No membrane separates them; the border shifts every cycle (§2.2). At the front endoplasm gels into new ectoplasm; at the rear ectoplasm solates and drains forward.

### 4.3 What each optical mode shows

Abbe limit d = λ/(2 NA) at 550 nm **[derived]**:

| Objective | NA | Resolves | Field (22 mm FN) | What is visible |
|---|---|---|---|---|
| 4× | 0.10 | ~2.8 µm | 5.5 mm | Whole fan and network; veins as yellow bands; pulsation seen as brightness change (thicker = darker, the radius proxy used by Alim 2013); streaming as a shimmering granular drift in big veins |
| 10× | 0.25 | ~1.1 µm | 2.2 mm | Clear channel vs wall; large particles and food vacuoles streaking at ≤ 1 mm/s (crosses the field in ~2 s; 1 ms exposure = 1 µm blur **[derived]**); plug-like profile |
| 40× | 0.65 | ~0.42 µm | 0.55 mm | Nuclei (~5.6 µm discs with nucleolus), vacuoles, granule texture, fibril bundles in polarisation/DIC, frozen granules in wall vs flowing granules in lumen |
| 100× oil | 1.3 | ~0.21 µm | 0.22 mm | Mitochondria, pigment granules, invagination openings, Brownian jitter of granules in resting sol (stops in gel) |

- Brightfield: the yellow absorbs blue; contrast is thickness. Thin sheet nearly invisible.
- Darkfield / oblique: granules, slime trail and vein edges glow; best whole-dish look.
- Phase contrast: halos around veins; nuclei grey with dark nucleoli; vacuoles bright; works only on thin regions (front sheet, microplasmodia).
- DIC: shadow-cast relief, optical sectioning through thick veins; fibrils and gel/sol boundary are clearest.
- Streaming texture: dense suspension of 0.5–5 µm refractile granules plus sparser 5–30 µm bodies, moving as a plug with a thin sheared wall layer, reversing every ~50 s with a brief standstill.

---

## 5. Behaviour and stimuli (interactive tools)

### 5.1 Chemicals

| Agent | Role | Concentrations | Source |
|---|---|---|---|
| D-glucose | Attractant | Chemotaxis threshold 0.25 mM; spots of 100–200 mM; goal wells 2 % w/v | Knowles & Carlile 1978b; Patino-Ramirez 2019; Reid 2012 |
| D-mannose, D-galactose, maltose, 2-deoxyglucose | Attractants | Thresholds up to 5 mM (mannose) | Knowles & Carlile 1978b |
| Fructose, sucrose | Weak | Membrane-potential thresholds ~10 mM and ~30 mM | Ueda 1975 |
| Oat flake / 10 % oat agar | Strong attractant + food | — | standard |
| Amino acids (e.g. alanine), nucleotides | Attractants | mM range **[thresholds unverified]** | Ueda-school papers |
| NaCl | Repellent | 100 mM uniform or 200 mM spot = standard repellent; 25 mM mild, 50 mM alters network, 75 mM inhibits | Patino-Ramirez 2019; Sánchez-Parra 2025 |
| KCl, CaCl₂, Li/Na/K nitrates | Repellents | Salt thresholds ~mM, raised by co-present sugars | Ueda 1975 and follow-ups; exact values **[unverified]** |
| Quinine | Repellent (harmless) | 4 mM: stops the front for several hours | Boisseau 2016 |
| Caffeine | Repellent | 1 mM used; bridges crossed only below 2 mM; 5–15 mM causes cytoplasm extrusion | Boisseau 2016 |

Habituation (Boisseau 2016): plasmodia crossing a 13 × 15 × 2 mm 1 % agar bridge laced with quinine or caffeine once a day stop hesitating after ~5 days; aversion returns after 2 days off; stimulus-specific. Salt habituation transfers to a naive plasmodium by fusion lasting ≥ 3 h (Vogel & Dussutour 2016, via Le Verge-Serandour 2023).

### 5.2 Light, temperature, humidity, mechanics

- Light: negative phototaxis to white and blue; action spectrum peaks near 260, 370 and 460 nm; ~100× more sensitive to far-UV than to near-UV/blue; strong far-UV gels the protoplasm. UV/blue raises the level or amplitude of cAMP/cGMP oscillations and changes contractile activity (Ueda 1988); the lit region thins and the front withdraws over minutes–tens of minutes **[timing unverified]**. Starvation and 31 °C reduce photoavoidance (Nakagaki 1996). Illumination masks constrain growth (Tero 2010). Irradiance thresholds **[unverified]**.
- Temperature: moves toward warmth within 20–34 °C gradients **[secondary source]**; detects ~3 °C differences (Le Verge-Serandour 2023); period vs T in §3.1.
- Humidity: needs ~90 % RH; drying → slowdown → sclerotium. Dry plastic is avoided (maze walls in Nakagaki 2000 are plastic film).
- Substrate: stiffer/drier agar → more network-like and faster; soft, wet, nutrient agar → more sheet-like (§2.5) **[trend unverified beyond Takamatsu 2009]**. Mechanosensing (Murugan 2021): on semi-flexible agar, plasmodia grow isotropically for ~12–14 h, then choose the side with three glass discs over one disc in ~70 % of trials, sensing substrate strain; abolished by TRP-channel block (11 %) or changed stiffness.
- Anticipation (Saigusa 2008): lane 0.5 × 28 cm, 26 °C/90 % RH, speed ~1 cm/h; three 10 min pulses of 23 °C/60 % RH at interval τ (30–90 min tested) → spontaneous slowdown at the time of the omitted 4th pulse in ~40–50 % of plasmodia.

### 5.3 Path-finding benchmarks

- Maze (Nakagaki 2000): ~4 cm agar maze, plastic-film walls; plasmodium 90 ± 10 mg fills it; two 0.5 × 1 × 2 cm oat-agar blocks; competing segments α1 = 41 ± 1 vs α2 = 33 ± 1 mm and β1 = 44 ± 1 vs β2 = 45 ± 1 mm; dead ends withdrawn at 4 h, one thick tube on the shortest route at 8 h. The 2 % β difference is not resolved.
- Tokyo rail (Tero 2010): 17 cm arena, 36 oat food sources, plasmodium seeded at Tokyo, illumination mask as terrain; the front colonises all food, then the mesh resolves over ~26 h (secondary source) into a network with rail-like cost, efficiency and fault tolerance. Its model (dD/dt = f(|Q|) − decay) is the ancestor of the engine's D-update.

### 5.4 Fusion, cutting, fragments

- Fusion: same-strain plasmodia fuse on contact within minutes; streaming crosses the junction and phases re-synchronise over a few periods **[timing unverified]**. Different fusA/fusB/fusC alleles → no fusion, the two stay distinct in contact. Same fus but different let/kil alleles → fusion, then a lethal reaction in the sensitive partner within ~6 h, its nuclei vacuolised and eliminated (Carlile & Dee 1967; Carlile 1976; Lane & Carlile 1979).
- Cutting: membrane reseals in 5–6 s; each fragment resumes contraction and becomes an independent plasmodium within minutes; a severed major vein is re-routed/repaired over ≥ 5 h (NBK586933).
- Minimum fragment: see §2.3 (< ~100 µm immotile; 200–300 µm rhythmic; ~500 µm networked). Sheared microplasmodia re-fuse into one macroplasmodium via a percolation transition (Fessel 2012).

---

## 6. Other slime moulds worth a preset

| Species | Look | Numbers |
|---|---|---|
| *Fuligo septica* (dog-vomit slime) | Bright yellow, thick, foamy plasmodium with coarse veins; ends as a cushion-like aethalium with chalky white-to-ochre crust over a dark spore mass. Pigment fuligorubin A (metal-chelating) | Aethalium 2.5–20 cm across, 1–3 cm thick; tolerates 4 000–20 000 ppm zinc (Wikipedia and refs therein) |
| *Badhamia utricularis* | Yellow to yellow-orange plasmodium that digests bracket fungi (a *Stereum hirsutum* fruit body in hours); fruits as grape-like clusters of grey sporangia hanging on strand-like stalks | Sporocarps 0.5–1 mm; chemotaxis to *Stereum* extract (Carlile lab, 1975) |
| *Physarum rigidum* | Yellow phaneroplasmodium, similar dynamics to *P. polycephalum*; pigments physarigins A–C (physarochrome-like) | Morphometrics **[unverified]** — reuse Physarum parameters with a greener-yellow hue |
| *Dictyostelium discoideum* (cellular slime mould; different engine mode: discrete ~10 µm cells) | Lawn of amoebae → darkfield spiral/target waves → branching inward streams → mound → 2–4 mm slug → 1–2 mm fruiting body | cAMP wave period ~8 min initially, ~6 min typical, 2–3 min in late aggregation (Singer 2019; Wikipedia). Wave speed ~300 µm/min (De Palo 2017; models 280–340). Wavelength **[derived]** ≈ 1.8–2.4 mm early, < 1 mm late. Cells step toward the source ~60 s per wave at ~10 µm/min **[cell speed unverified]**. Waves start ~4–5 h after starvation, streams form hours later **[approximate]**; ≤ 10⁵ cells per aggregate; 22–24 °C |

---

## 7. What the engine must reproduce

| # | Phenomenon | Scale | Numbers to hit | Sim quantity |
|---|---|---|---|---|
| 1 | Fan-shaped front advance | dish | 1–10 mm/h default; up to 20–40 mm/h starved/warm; speed ∝ front thickness | Agent trail / biomass field, height |
| 2 | Front thickness profile | mm | Peak just behind edge; exponential rearward decay, length 2.6–11.6 mm; ~100 µm effective height | Height |
| 3 | Sheet → mesh → veins | 0.1–5 mm | Channels 10–30 µm at front; veins 5–70 µm radius behind; trunks to 1 mm | Conductivity D, height |
| 4 | Vein statistics | network | Degree-3 nodes; log-normal widths; exponential lengths; Σr³ conserved | D-update rule |
| 5 | Pruning/coarsening | min–h | Delay 1–3 min; t_adapt 10–100 min; vein death 15–40 min; avalanches < 15 min; rearrangement ~45 min | D-update with delayed shear |
| 6 | Contraction oscillation | everywhere | T = 100 s (60–130); radius amplitude ~10 %; 2.0/1.5/1.2 min at 16/20/24 °C; slow envelope ~20 min | Oscillator phase + amplitude |
| 7 | One peristaltic wavelength per organism | organism | Phase spans 0–2π along the long axis, 3 mm–2 cm+ | Phase coupling |
| 8 | Shuttle streaming | vein | Peak 0.05–1.3 mm/s, reversal every T/2, brief standstill; small forward bias | Flow Q (Poiseuille) |
| 9 | Pressure | network | 0.1–2 kPa across cm | Pressure solve (scale free) |
| 10 | Stimulus propagation | cm | Amplitude/dilation front 13–15 µm/s; new hierarchy in 15 min; k_deg 10⁻³ s⁻¹ | Advected scalar in Q |
| 11 | Taylor dispersion | vein | D_eff ~10⁻⁷ m²/s vs κ 10⁻¹⁰ | Scalar transport |
| 12 | Chemotaxis | dish | Glucose threshold 0.25 mM; NaCl 100 mM repels; quinine 4 mM stalls for hours; attractant ↑ frequency | Agent sensing, oscillator frequency |
| 13 | Slime trail memory | dish | 39/40 avoid slime; U-trap 96 % vs 33 %; persists days | Static trail field |
| 14 | Light avoidance | dish | Blue/UV (460/370/260 nm) repels (timing unverified); masks shape growth | Stimulus field |
| 15 | Maze / Tokyo | dish | 8 h to shortest path over ~4 cm; 26 h for 36 nodes on 17 cm | Whole loop |
| 16 | Cutting, fusion | any | Reseal 5–6 s; rhythm returns in minutes; < 100 µm immotile, ≥ 200–300 µm rhythmic; lethal reaction ≤ 6 h | Topology edits, per-strain ID |
| 17 | Anticipation | lane | Slowdown at omitted pulse, τ = 30–90 min, ~45 % of trials | Multi-frequency oscillator bank |
| 18 | Nuclei | < 10 µm | 5.65 µm, spacing 6.6 µm, denser at front; mitosis every 8–10 h, synchronous | Micro-particles |
| 19 | Streaming texture | < 50 µm | 0.5–5 µm granules + 5–30 µm bodies; plug flow in lumen, frozen in wall; wall/lumen exchange ~29 % per cycle | Micro-particles on Q |
| 20 | Cortex and fibrils | < 5 µm | Cortex 0.5–0.7 µm; fibrils ~21 µm, circumferential/helical, appear in contraction phase; invagination pores ~1.7 µm | Phase-driven detail shader |
| 21 | Colour | all | Yellow ∝ thickness; shifts orange under stress/acid; pale in thin sheet | Height + state → hue |

Biggest uncertainties for builders: (a) endoplasm viscosity spans 6 mPa·s–10 Pa·s across the literature — fix velocities, not pressures; (b) absolute front height and wall/lumen ratio at dish scale are poorly documented; (c) organelle sizes below the nucleus are textbook values, not *Physarum*-specific measurements; (d) irradiance and salt thresholds were not verified.

---

## Sources

Titles omitted for brevity; tags match the in-text citations.

1. Alim, Amselem, Peaudecerf, Brenner, Pringle (2013). PNAS 110:13306. doi:10.1073/pnas.1305049110
2. Alim, Andrew, Pringle, Brenner (2017). PNAS 114:5136. doi:10.1073/pnas.1618114114 — https://pmc.ncbi.nlm.nih.gov/articles/PMC5441820/
3. Alim (2018). Phil Trans R Soc B 373:20170112. arXiv:1801.02464
4. Kramar, Alim (2021). PNAS 118:e2007815118. https://pmc.ncbi.nlm.nih.gov/articles/PMC7958412/
5. Marbach, Ziethen, Bastin, Bäuerle, Alim (2023). eLife 12:e78100. https://elifesciences.org/articles/78100
6. Reid, Latty, Dussutour, Beekman (2012). PNAS 109:17490. https://pmc.ncbi.nlm.nih.gov/articles/PMC3491460/
7. Baumgarten, Ueda, Hauser (2010). Phys Rev E 82:046113. doi:10.1103/PhysRevE.82.046113
8. Baumgarten, Hauser (2013). Phys Biol 10:026003. doi:10.1088/1478-3975/10/2/026003
9. Akita, Kunita, Fricker, Kuroda, Sato, Nakagaki (2017). J Phys D 50:024001. doi:10.1088/1361-6463/50/2/024001
10. Kuroda, Takagi, Nakagaki, Ueda (2015). J Exp Biol 218:3729. doi:10.1242/jeb.124354
11. Matsumoto, Takagi, Nakagaki (2008). Biophys J 94:2492. https://pmc.ncbi.nlm.nih.gov/articles/PMC2267142/
12. Oettmeier, Döbereiner (2019). PLoS One 14:e0215622. doi:10.1371/journal.pone.0215622
13. Sato et al. (2025). Biophys Physicobiol. https://pmc.ncbi.nlm.nih.gov/articles/PMC11876801/
14. Gerber et al. (2022). eLife 11:e69745. https://elifesciences.org/articles/69745
15. Radszuweit, Engel, Bär (2013/2014). arXiv:1307.0670 (published PLoS One 9:e99220 — journal ref not re-checked)
16. Le Verge-Serandour, Alim (2023). "Physarum polycephalum: smart network adaptation", review. arXiv:2306.09063
17. Saiseau, Busson, Durand (2025). arXiv:2501.02651
18. Wohlfarth-Bottermann (1977). J Exp Biol 67:49. https://journals.biologists.com/jeb/article/67/1/49/22232
19. "Dynamics of the ectoplasmic walls during pulsation of plasmodial veins" (1978). Protoplasma. doi:10.1007/BF01276293 (authors not verified)
20. Goldstein, van de Meent (2015). Interface Focus 5:20150030. arXiv:1505.04931
21. Adamatzky, Jones (2011). arXiv:1012.1809
22. Nakagaki, Yamada, Tóth (2000). Nature 407:470. doi:10.1038/35035159
23. Tero, Takagi, Saigusa, Ito, Bebber, Fricker, Yumiki, Kobayashi, Nakagaki (2010). Science 327:439. doi:10.1126/science.1177894
24. Saigusa, Tero, Nakagaki, Kuramoto (2008). Phys Rev Lett 100:018101. https://eprints.lib.hokudai.ac.jp/repo/huscap/all/33004/PhysRevLett_100_018101.pdf
25. Boisseau, Vogel, Dussutour (2016). Proc R Soc B 283:20160446. doi:10.1098/rspb.2016.0446
26. Patino-Ramirez, Boussard, Arson, Dussutour (2019). Sci Rep 9. doi:10.1038/s41598-019-50872-z
27. Sánchez-Parra, Rosina, Fernández-Mendoza, Grube (2025). Sci Rep. doi:10.1038/s41598-025-29951-x
28. Knowles, Carlile (1978a). J Gen Microbiol 108:9. doi:10.1099/00221287-108-1-9; (1978b) 108:17. doi:10.1099/00221287-108-1-17
29. Ueda, Terayama, Kurihara, Kobatake (1975). J Gen Physiol 65:223. doi:10.1085/jgp.65.2.223
30. Ueda, Mori, Nakagaki, Kobatake (1988). Photochem Photobiol (action spectra; and cAMP/cGMP companion, doi:10.1111/j.1751-1097.1988.tb02726.x). Abstracts only.
31. Nakagaki, Umemura, Kakiuchi, Ueda (1996). Photochem Photobiol 64:859. doi:10.1111/j.1751-1097.1996.tb01847.x
32. Lamparter, Marwan (2001). Photochem Photobiol 73:697.
33. Murugan et al. (2021). Adv Mater 33:2008161. doi:10.1002/adma.202008161; trial percentages from https://phys.org/news/2021-07-brain-brainless-slime-molds-reveal.html
34. Takamatsu, Takaba, Takizawa (2009). J Theor Biol 256:29. doi:10.1016/j.jtbi.2008.09.010
35. Fessel, Oettmeier, Bernitt, Gauthier, Döbereiner (2012). Phys Rev Lett 109:078103. doi:10.1103/PhysRevLett.109.078103
36. Carlile, Dee (1967) Nature 215:832; Carlile (1976) J Gen Microbiol 93:371. doi:10.1099/00221287-93-2-371; Lane, Carlile (1979) J Cell Sci 35:339. Abstracts only.
37. Steffan, Praemassing, Steglich (1987). Tetrahedron Lett 28:3667 (physarochrome A). Abstract only.
38. Seifriz, Zetzmann (1935). Protoplasma 23:175. doi:10.1007/BF01603385. Abstract only.
39. Huynh, Phung, Stephenson, Tran (2017). BMC Biotechnol 17:76. https://pmc.ncbi.nlm.nih.gov/articles/PMC5679387/
40. NCBI Bookshelf NBK586933 (2022), "Studying Protista WBR and repair using Physarum polycephalum". https://www.ncbi.nlm.nih.gov/books/NBK586933/
41. Singer, Araki, Weijer (2019). Commun Biol 2:139. https://pmc.ncbi.nlm.nih.gov/articles/PMC6478855/
42. De Palo, Yi, Endres (2017). PLoS Biol 15:e1002602. arXiv:1801.03707
43. Wikipedia (secondary, used only where noted): Physarum_polycephalum, Fuligo_septica, Dictyostelium_discoideum. Badhamia description: discoverlife.org species page and Frontiers Plant Sci 2024, doi:10.3389/fpls.2024.1411231
