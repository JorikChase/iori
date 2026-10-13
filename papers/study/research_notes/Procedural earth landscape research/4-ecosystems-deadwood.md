# Vegetation ecosystems coupled with terrain, tree death and deadwood, disturbance, and richer plant forms (for a browser extension of Synthetic Silviculture)

Scope note. Sources marked **[fetched]** were read this session, either the page or an extracted PDF. Sources marked **[recall]** are standard references cited from memory. Their DOIs and numbers are given in good faith but were **not re-verified this session**, so check them before quoting in a paper. Three primary PDFs could not be read because they exceed the fetch limit: Cordonnier 2017 (Purdue), DeadWood 2024 (UCT, about 125 MB) and Harmon 1986 (Andrews LTER scan). Details for these come from secondary but authoritative sources: Galin's own lecture slides, ACM abstracts, the authors' GitHub, and papers that cite Harmon.

---

## Q1. Vegetation–terrain coupling: Cordonnier 2017, Ecoclimates 2022, Fire in Paradise 2021, Windy Trees 2014, and 2023–2026 follow-ups

### Takeaway
Cordonnier et al. 2017 is the template for coupling plants and terrain. It uses a stack of layers on a regular grid (bedrock B, granular G, a vegetation density V per type, dead vegetation D, water W). It advances in 1-year steps over 100–1000 years using stochastic events. Vegetation reduces hydraulic detachment, increases deposition and holds slopes. Dead vegetation D decomposes into humus, which makes cells fertile. The direct 2024 follow-up from the same group, *DeadWood* (Peytavie, Gain, Guérin, Argudo, Galin), adds individual snags and logs with disturbance and decay. Of the Pałubicki/Pirk/Michels line, Ecoclimates (2022) adds an atmosphere and microclimate feedback, and Fire in Paradise (2021) adds combustion. I found no 2023–2026 deadwood paper from that group.

### Cited Findings
**Cordonnier et al. 2017**
- Citation: G. Cordonnier, E. Galin, J. Gain, B. Benes, E. Guérin, A. Peytavie, M.-P. Cani, "Authoring Landscapes by Combining Ecosystem and Terrain Erosion Simulation", ACM TOG 36(4), article 134, SIGGRAPH 2017, DOI 10.1145/3072959.3073667. — [Purdue CGV lab page](https://cs.purdue.edu/cgvlab/www/publications/cordonnier2017authoring); [PDF (Benes)](https://cs.purdue.edu/homes/bbenes/papers/Cordonnier17ToG.pdf) **[fetched page; PDF too large]**
- The model covers several geomorphological agents and their interactions with material and vegetation layers: rock, sand, humus, grass, shrubs and trees. The authors validate against real terrains, and the method produces both static landscapes and landscapes that evolve over a few centuries. — [IP Paris research portal](https://researchportal.ip-paris.fr/en/publications/authoring-landscapes-by-combining-ecosystem-and-terrain-erosion-s/); [SIGGRAPH history](https://history.siggraph.org/learning/authoring-landscapes-by-combining-ecosystem-and-terrain-erosion-simulation-by-cordonnier-gain-benes-guerin-peytavie-et-al/)
- Model structure, from Galin's 2024 lecture slides about the paper: a regular multi-material grid. Spatial scale is given as "cellules de 10×10 m², terrains de 10×10 km²" (the superscripts were lost in PDF extraction, so 10 m cells is my reading). The simulated period is 100–1000 years at 1-year steps. Materials are granular G(x,t), bedrock B(x,t), one vegetation density V(x,t) per type, dead plants D(x,t) and liquid water W(x,t). The 3-D ground and plant models are instantiated from the layer data. — [Galin, "Erosion simulation" M2 slides, Nov 2024](https://perso.liris.cnrs.fr/eric.galin/M2/Landscapes/3-erosion-simulation.pdf) **[fetched, text extracted]**
- Architecture: an event-based stochastic simulation in which each event has trigger conditions and can trigger further events in cascade. It is controlled by direct interaction or a temporal scenario. The coupling loop runs terrain h(x), then environment e(x) (shade, humidity, wind), then vegetation v(x). Vegetation decomposes into organic matter layers, can crack rock and retains sand. — [Galin slides](https://perso.liris.cnrs.fr/eric.galin/M2/Landscapes/3-erosion-simulation.pdf)
- Hydraulic erosion event: detachment on steep slopes, transport, and deposition on gentle slopes. Vegetation lowers the detachment e(x, v(x,t), t) < e(x,t) and raises deposition f(x, v(x,t), t) > f(x,t). Transfers run G→G and B→G. In validation, trees limit the intensity of hydraulic erosion. — [Galin slides](https://perso.liris.cnrs.fr/eric.galin/M2/Landscapes/3-erosion-simulation.pdf)
- Lightning event: fragments rock and throws pieces into the neighbourhood (B→G, boulders), destroys vegetation (V→D), and triggers a fire event. Fire destroys vegetation and spreads to neighbours depending on humidity (V→D). Some species germinate only after fire. — [Galin slides](https://perso.liris.cnrs.fr/eric.galin/M2/Landscapes/3-erosion-simulation.pdf)
- Emergent effects reported:
  - Trees are destroyed in rockfall zones, where small shrubs and grass grow instead (Rockies parameters).
  - Vegetation develops in wet zones with water flow.
  - Rockfall competes with vegetation (Grand Canyon).
  - Fertile sediment accumulates and vegetation grows on it (Mediterranean coast).
  - Groves form on fertile zones "obtained by the decomposition into humus of dead vegetation".

  — [Galin slides](https://perso.liris.cnrs.fr/eric.galin/M2/Landscapes/3-erosion-simulation.pdf)
- Thermal (gravity) stabilisation uses a talus angle θ: ∂h/∂t = −k (s(p) − tan θ) if s(p) > tan θ. — [Galin slides](https://perso.liris.cnrs.fr/eric.galin/M2/Landscapes/3-erosion-simulation.pdf)
- A sister paper, Cordonnier & Benes "Desertscape Simulation" (CGF / PG 2019), states that vegetation stops avalanching by holding sand, so **vegetation density raises the angle-of-repose threshold**. It also says it relies on stochastic events "close in spirit" to the 2017 work. — [ResearchGate: Desertscape Simulation](https://www.researchgate.net/publication/335488341_Desertscape_Simulation) (search snippet only)
- A demo DEM made with the 2017 method (256×256 at 10 m per pixel, 300 steps applied) is distributed in Guérin's terrain repository. — [Guérin DEM repo](https://perso.liris.cnrs.fr/eguerin/demrepo/)

**DeadWood (2024), the same Lyon/UCT group**
- Citation: A. Peytavie, J. Gain, E. Guérin, O. Argudo, E. Galin, "DeadWood: Including Disturbance and Decay in the Depiction of Digital Nature", ACM TOG 43(2), article 21, 14 Feb 2024, presented at SIGGRAPH 2024, DOI 10.1145/3641816. — [ACM DL](https://dl.acm.org/doi/10.1145/3641816); [UCT eprint](https://pubs.cs.uct.ac.za/id/eprint/1689/) **[fetched]**
- The paper couples an individual-based ecosystem simulation, with explicit disturbance events (fire, windstorm, disease) and decay, to a "model realisation" step. That step balances unique per-tree life histories against instancing, with up to 8 models per species. Snags are about **10 % of basal area** in unmanaged forests, and logs are about **2.5×** that amount. — [ACM DL](https://dl.acm.org/doi/10.1145/3641816)
- In a 2AFC user study with n = 116, snags or logs **significantly improved believability**. More model variants (up to 8 per species) and an emphasis on disturbance events gave **no measurable gain**. — [UCT eprint](https://pubs.cs.uct.ac.za/id/eprint/1689/); [GitHub](https://github.com/oargudo/deadwood)
- The code is MIT-licensed C++/Qt 6.8, GLEW and GLM, Windows only. The simulator is built on EcoLearn (Kapp et al., "Data-driven Authoring of Large-Scale Ecosystems").
  - It steps **monthly**.
  - Inputs are a heightfield, an SQLite biome database, `clim.txt` (12 monthly values each of temperature °C, clear-sky % and rainfall mm, plus the measurement elevation), per-species allometry for dense (`almc`) and isolated (`almo`) growth, monthly sun/temperature/wetness grids, and an optional `disturbanceEvents.txt` (year, month, type, parameters).
  - The demo scene "Gresolet" is 2×2 km at 2 m cells.

  — [GitHub oargudo/deadwood](https://github.com/oargudo/deadwood) **[fetched]**

**Ecoclimates (2022)**
- Citation: W. Pałubicki, M. Makowski, W. Gajda, T. Hädrich, D. L. Michels, S. Pirk, "Ecoclimates: Climate-Response Modeling of Vegetation", ACM TOG 41(4), article 155, 19 pp., 2022, DOI 10.1145/3528223.3530146. — [AMU bib page](https://wp.faculty.wmi.amu.edu.pl/papers/Palubicki.etal-2022-Ecoclimates.html); [SIGGRAPH history](https://history.siggraph.org/?p=117929)
- It models the feedback loops between vegetation, soil and atmosphere, and grows trees interactively in response to gradients of water, temperature and light. Its target is local (micro- and meso-scale) climate rather than global climate. It reproduces forest-edge effects, the Foehn effect and spatial vegetation patterning. Its keywords include cloud simulation and fluid dynamics. — [SIGGRAPH history](https://history.siggraph.org/?p=117929); [3DVF summary](https://3dvf.com/en/how-your-cg-landscapes-will-get-even-more-realistic-thanks-to-ecoclimates-siggraph2022)
- A precursor abstract: Pałubicki et al., EGU21-16600, DOI 10.5194/egusphere-egu21-16600. — [EGU21](https://meetingorganizer.copernicus.org/EGU21/EGU21-16600.html)

**Fire in Paradise (2021)**
- Citation: T. Hädrich, D. T. Banuti, W. Pałubicki, S. Pirk, D. L. Michels, "Fire in Paradise: Mesoscale Simulation of Wildfires", ACM TOG 40(4), article 163, SIGGRAPH 2021, DOI 10.1145/3450626.3459954. — [Google Research](https://research.google/pubs/fire-in-paradise-mesoscale-simulation-of-wildfires/); [authors' PDF](https://wp.faculty.wmi.amu.edu.pl/papers/Haedrich.etal-2021-Wildfires.pdf)
- Each tree is a full 3-D branch model. Combustion covers heat transfer, char insulation and mass loss, and fire spreads across the ecosystem coupled to an atmospheric fluid that forms pyrocumulus (flammagenitus) clouds and precipitation. It runs at interactive rates and supports firebreaks, retardant and rain. It does **not** model wind effects on the trees themselves, resin or flying embers. — [SIGGRAPH history](https://history.siggraph.org/learning/fire-in-paradise-mesoscale-simulation-of-wildfires-by-hadrich-banuti-palubicki-pirk-and-michels/); [3DVF](https://3dvf.com/en/siggraph-2021-how-some-researchers-virtually-set-forests-on-fire); [APS DFD 2021](https://archive.aps.org/dfd/2021/e09/10)

**Windy Trees (2014) [recall]**
- S. Pirk, T. Niese, T. Hädrich, B. Benes, O. Deussen, "Windy Trees: Computing Stress Response for Developmental Tree Models", ACM TOG 33(6), article 204, 2014, DOI 10.1145/2661229.2661252. It treats wind as a long-term stress that changes developmental growth: branches bend, become asymmetric and break on the windward side. **[recall, not fetched]**

**Synthetic Silviculture (2019), the base being extended [recall]**
- M. Makowski, T. Hädrich, J. Scheffczyk, D. L. Michels, S. Pirk, W. Pałubicki, "Synthetic Silviculture: Multi-scale Modeling of Plant Ecosystems", ACM TOG 38(4), article 131, 2019, DOI 10.1145/3306346.3323039. The search confirms the authors and SIGGRAPH 2019 venue. — [80.lv mention / search](https://80.lv/articles/002sgr-generating-procedural-plant-ecosystems) (DOI **[recall]**)

### Inferences
- In practice, Cordonnier's coupling reduces to five per-cell scalars (B, G, humus share, V[type], D) and a handful of event kernels. That is cheap enough to run on the CPU or in a WebGPU compute shader in a browser at about 10 m cells and 1-year steps.
- Vegetation-dependent repose is the highest-value coupling. One way to write it: tan θ_eff = tan θ_bare + Σ_type α_type · V_type, using Desertscape's "density raises repose" rule and Cordonnier's reduced detachment and increased deposition.
- The D → humus flux gives deadwood a direct terrain effect: soil fertility, and a thin humus thickness in the height field.
- DeadWood's user study suggests that the *presence* of snags and logs matters perceptually more than per-species variety or dramatic disturbance events. Snags and logs are therefore a high priority.

### Gaps
- I could not read the exact Cordonnier 2017 parameter tables: per-material talus angles, per-type vegetation stabilisation coefficients, the humus production rate per unit of D, and event probabilities. The PDF is over 10 MB. Get it from DOI 10.1145/3072959.3073667 or the Benes PDF.
- I could not read DeadWood's decay-stage parameters, fall rules or mortality probabilities. The paper is about 125 MB and the README does not list them. Its `AppEcosim/source/disturbance_events.cpp` holds the per-event parameters.
- I could not verify Ecoclimates' internal numbers: grid resolution, time step and plant death rule.
- No 2023–2026 paper on deadwood or decay from Pałubicki, Pirk, Michels or Makowski turned up in my search. Their DBLP pages should be checked before claiming none exists.

---

## Q2. Tree death, falling, uprooting, snags, and coarse woody debris (CWD) decay into terrain

### Takeaway
Background adult mortality in gap models is about **1 %/yr**. SORTIE's default adult stochastic mortality is 0.010, and JABOWA sets intrinsic mortality so that about 1 % of trees reach maximum age. Suppression mortality (slow growth) and disturbance are added on top.

Deadwood decays exponentially, M(t) = M0·e^(−kt):
- Hardwood logs: k above 0.05/yr. Oak boles are about 0.03/yr.
- Conifer logs: k below 0.05/yr. Douglas-fir boles are about 0.005/yr, with fragments persisting for up to about 400 years.
- k scales with temperature (Q10 ≈ 2.5).
- Logs decay about 1.7× faster than snags.
- Snags of fire-killed pines fall with half-lives of about 7–16 years.

Uprooting leaves pit-and-mound relief that can persist for **more than 1000 years**.

### Cited Findings
**Mortality rates in gap and individual-tree models**
- SORTIE standard parameters (Pacala et al. 1993, 1996): a study states it used them except that annual adult stochastic mortality was raised to 0.015 "from 0.010". So the default background is **1 %/yr**. — [Biogeosciences bg-2019-210 supplement](https://bg.copernicus.org/preprints/bg-2019-210/bg-2019-210-supplement.pdf)
- Pacala et al. criticised JABOWA/FORET for applying one growth-dependent mortality function to all species, calling it "the single greatest shortcoming". — [Kubo/Kyushu review PDF](https://catalog.lib.kyushu-u.ac.jp/opac_download_md/25084/kubo.pdf) (search snippet)
- The 4C model sets species intrinsic mortality from maximum age, using Bugmann's (1994) definition of max age as the average of the mean and maximum observed ages. — [PIK 4C species parameters](https://www.pik-potsdam.de/~lasch/Dokumente/species_par.doc)
- Keane et al. review mortality algorithms in gap models ("Tree mortality in gap models: application to climate change", *Climatic Change* 51, 2001). Mortality has mostly been limited to general relationships because data on causal mechanisms are sparse. — [Jornada archive record](https://archive.jornada.nmsu.edu/node/51013)
- **[recall]** JABOWA (Botkin, Janak & Wallis 1972, *J. Ecology* 60:849–872, DOI 10.2307/2258570) uses two terms:
  - intrinsic annual mortality m = 4.605/AGEMAX, where ln 100 = 4.605, so about 1 % of a cohort survives to AGEMAX;
  - suppression mortality 0.368/yr (= 1/e) for any tree whose diameter increment falls below a minimum, so about 1 % survive 10 consecutive bad years.

  The search engine did not find a primary text for these constants.
- **[recall]** Pacala et al. 1996, "Forest models defined by field measurements: estimation, error analysis and dynamics", *Ecol. Monogr.* 66:1–43, DOI 10.2307/2963479. SORTIE uses species-specific mortality as a function of recent radial growth, fitted in the field.

**Snag fall rates**
- After two Idaho wildfires (Russell et al. 2006), the predicted snag half-life (50 % down) was:
  - **ponderosa pine 7–8 yr** salvage-logged and **9–10 yr** unlogged;
  - **Douglas-fir 12–13 yr** logged and **15–16 yr** unlogged.

  Smaller snags fall sooner. — [NR Fire Science review](https://nrfirescience.org/node/8142)
- In a sample of 6,851 fire-killed trees, ponderosa pine fell faster than true firs and Douglas-fir at every size class. Firs and Douglas-fir larger than 45 cm had fall rates **below 50 % over 30 years**. Fire-killed ponderosa pine had at least a 50 % chance of falling within 20 years. — [USU Fire Effects session](https://digitalcommons.usu.edu/nafecology/sessions/fire_effects/3)
- Keen's long-term survey of beetle-killed ponderosa pine found three phases: 85 % still standing after 5 years, rapid fall between 5 and 15 years, then a long tail. After an Oregon escaped prescribed fire, 55 % of snags were down at 10 years and 78 % at 22 years. — [NR Fire Science](https://nrfirescience.org/node/8142)
- Half-life by size: Douglas-fir about **11 / 17 / 23 yr** for snags under 23 cm, 23–41 cm, and over 41 cm. Pinus is about 7–17 yr across the same classes. — [NR Fire Science](https://nrfirescience.org/node/8142)

**CWD decay rates**
- Harmon, Franklin, Swanson et al., "Ecology of coarse woody debris in temperate ecosystems", *Advances in Ecological Research* 15:133–302, 1986. — [Andrews Forest record](https://andrewsforest.oregonstate.edu/node/13120); [PDF](https://andrewsforest.oregonstate.edu/sites/default/files/lter/pubs/pdf/pub42.pdf) (PDF too large to fetch)
  - Secondary citations of Harmon 1986: angiosperm k is **above 0.05/yr** and gymnosperm k **below 0.05/yr**. Quercus boles are **0.03/yr** (half-time 25 yr). Pseudotsuga boles are **0.005/yr** (half-time 150 yr), with fragments lasting **up to 400 yr**. — [Black Rock Forest CWD report](https://www.blackrockforest.org/wp-content/uploads/2021/03/res_pub_burdette_c_cwd_12.10.07.pdf); [Forest Encyclopedia summary](https://old.forestencyclopedia.net/c/c1368/?showNav=n)
- Swiss NFI study (Hararuk & Didion 2020, *Forest Ecosystems* 7:36, DOI 10.1186/s40663-020-00248-x). It covers 653 snags and 363 logs on 671 plots over 3 inventories, fitted with first-order exponential decay by Bayesian MCMC.
  - **Logs decay about 1.7× faster than snags**, with similar temperature sensitivity.
  - Snag carbon half-life runs from **22 yr on the warmest plots to 118 yr on the coldest**.
  - Fagus residence time (90 % loss) is **27–54 yr**, warm to cold.
  - Softwood residence time is **58–191 yr** at wet sites and **78–286 yr** at dry sites. Hardwoods decay faster on wetter sites.

  — [Springer](https://link.springer.com/article/10.1186/s40663-020-00248-x)
- Global CWD review (Mackensen, Bauhus & Webber 2003, *Aust. J. Botany* 51:27–37, DOI 10.1071/BT02014): mean annual temperature explains **34 %** of decay-rate variation, with **Q10 = 2.53**. — [ANU portal](https://researchportalplus.anu.edu.au/en/publications/decomposition-rates-of-coarse-woody-debris-a-review-with-particul/); [CSIRO](https://publish.csiro.au/BT/BT02014)
- Meta-analysis mixed model for predicting k from "easily available" predictors, intended for large regions and process models: Zell, Kändler & Hanewinkel 2009, *Ecol. Modelling* 220:904–912, DOI 10.1016/j.ecolmodel.2009.01.020. The coefficients are paywalled. — [RePEc](https://ideas.repec.org/a/eee/ecomod/v220y2009i7p904-912.html)
- Decay-class-specific k for Korean red pine CWD: **0.044 / 0.069 / 0.105 / 0.195 /yr** for classes I–IV, and needle litter 0.250. Rates correlate with wood density, N and C:N. — [J. Ecol. Environ. 34(1):115](https://accesson.kr/jecoenv/assets/pdf/6788/journal-34-1-115.pdf)
- *Larix gmelinii* after fire (33-year chronosequence): mean k = **0.019/yr**, which is 41 yr to 50 % loss and 176 yr to 95 % loss. k rises with decay class. — [J. For. Res. 2020, DOI 10.1007/s11676-020-01270-z](https://link.springer.com/doi/10.1007/s11676-020-01270-z)
- *Quercus mongolica* stand, Korea: k = **0.058/yr**. — [same Korean journal search result](https://accesson.kr/jecoenv/assets/pdf/6788/journal-34-1-115.pdf)
- Janisch et al. 2005 (Washington clearcut chronosequence, 70 years): log k can stand in for stump k but **not** for coarse-root k. — [Andrews pub4305](https://andrewsforest.oregonstate.edu/sites/default/files/lter/pubs/pdf/pub4305.pdf)
- Decay classes are not standardised across studies, so class-specific k values do not transfer directly. — (caveat noted from the [search synthesis](https://ideas.repec.org/a/eee/ecomod/v220y2009i7p904-912.html) of the above)
- **[recall]** The standard 5-class log decay system (Maser et al. 1979; Sollins 1982):
  1. Bark intact, twigs present, round, log elevated on branches.
  2. Bark loose, few twigs, round, sagging.
  3. Bark sloughing, no twigs, heartwood sound, starting to sit on the ground.
  4. No bark, wood in soft blocks, oval cross-section, partly sunk.
  5. Wood powdery or soft, flattened, fully in contact with the ground, invaded by roots and moss.

**Uprooting, pit-and-mound, fall geometry**
- Treethrow mounds in Michigan and Wisconsin, dated by ¹⁴C, often persist for **more than 1000 years**, 2–5× longer than earlier estimates. Persistence is helped by sandy porous soils, a continuous litter mat, gravel armouring, large initial size and soil freezing. — Schaetzl & Follmer 1990, *Geomorphology* 3:113–123. — [USGS record](https://pubs.usgs.gov/publication/70016198)
- In Canadian Rockies modelling, root-plate size sets pit and mound dimensions. On slopes of zero or near-zero gradient, most root-plate soil returns to the pit and no distinct feature forms. Degradation was modelled on slopes of 10–30°. — [Sass et al. 2018, Can. J. For. Res. (Harvard Forest PDF)](https://harvardforest1.fas.harvard.edu/publications/pdfs/Sass_CanJForRes_2018.pdf) (search snippet; attribution of the Rockies study to this PDF not confirmed)
- Pit-and-mound relief creates microsites. Harvard Forest recommends growing large-diameter trees to produce long-lasting pit-mounds. — [Harvard Forest notes](https://harvardforest.fas.harvard.edu/notes/pits-and-mounds-diminished-elements-in-a-second-growth-landscape/)
- **[recall]** Nurse logs: Harmon & Franklin 1989, "Tree seedlings on logs in Picea–Tsuga forests of Oregon and Washington", *Ecology* 70:48–59, DOI 10.2307/1938411. Logs cover a small share of the ground (about 6–11 %) but host the large majority of conifer seedlings (more than 90 %) in these wet forests. Seedlings establish mostly on decay classes 3–5. **Numbers are from memory and need checking.**
- **[recall]** Fall direction: windthrow falls downwind of the storm (leeward), with a spread of about ±30°. Trees killed in place (senescence, fire, insects) fall toward the heavier crown side and downslope on steep ground. Both are standard field observations; I found no single quantitative source this session.

### Inferences (formulas for the build)
- Background mortality per year: p_bg = 1 − 0.01^(1/A_max), which is about 4.6/A_max. For A_max = 300 yr that is 1.5 %/yr, and for 500 yr it is 0.9 %/yr, which matches the 1–2 % target.
- Suppression mortality: if vigor (Synthetic Silviculture's light-driven vigor) stays below a threshold for a year, add p_sup ≈ 0.37/yr.
- Log decay: k(T) = k_ref · 2.53^((T − T_ref)/10), with k_ref ≈ 0.03 (hardwood) or 0.01 (conifer) at T_ref ≈ 8 °C. Snags use k_snag = k_log / 1.7.
  - Example: half-life = ln 2/k gives 23 yr for oak at k = 0.03 and 139 yr for Douglas-fir at k = 0.005.
  - The 90 % residence time is ln 10/k, so Hararuk's beech 27–54 yr means k ≈ 0.043–0.085.
- Map the remaining mass fraction to the 5 visual decay classes, for example class = 1 + floor(4·(1 − M/M0)^0.7). Drive bark loss, sag (log sinks into the height field by a fraction of its diameter), moss cover and colour from that class.
- When a log passes about 80–90 % mass loss, delete it and add its remaining mass to the cell's humus / D layer. This mirrors Cordonnier's D → humus flux.
- Snag fall hazard: use a lag-then-rise function to match Keen's curve, for example a Weibull hazard with half-life 8–25 yr scaled by DBH. A fallen snag becomes a log at decay class ≥ 2.
- Uprooting probability grows with height/DBH and shallow soil. On uprooting:
  - stamp a pit of depth ≈ 0.3–0.5 × root-plate radius;
  - stamp a mound on the far side;
  - let both diffuse slowly (e-folding time of centuries), except on flat ground, where the pit refills.

  These numbers are illustrative inferences, not measured values.

### Gaps
- I could not read Harmon 1986's own k table or its per-class residence times (PDF too large). The 0.03 / 0.005 / 400-yr figures are second-hand.
- I did not find the primary JABOWA text for 4.605/AGEMAX and 0.368 this session, so they are from recall.
- I could not verify the nurse-log percentages or a quantitative fall-direction distribution.

---

## Q3. Disturbance regimes (windthrow, fire, gaps, succession) and cheap simulation

### Takeaway
Cordonnier 2017 already shows the cheap pattern. Disturbances are stochastic events with trigger conditions, and they cascade: lightning → fire → V→D. Fire spread is gated by humidity, and some species germinate only after fire. DeadWood (2024) adds monthly-stepped windstorm, fire and disease events specified as year/month/type records. Full physics (Fire in Paradise) is interactive but heavy. For a browser, cellular-automaton fire on the vegetation grid plus a probabilistic windthrow kernel is the practical choice.

### Cited Findings
- Cordonnier 2017 events:
  - lightning fragments rock (B→G), kills plants (V→D) and starts fire;
  - fire spreads to neighbours as a function of humidity;
  - post-fire germination for some species;
  - rockfall destroys trees but lets shrubs and grass establish.

  — [Galin slides](https://perso.liris.cnrs.fr/eric.galin/M2/Landscapes/3-erosion-simulation.pdf)
- DeadWood's disturbance types are fire, windstorm, disease, and death and decay. Events are authored as (year, month, type, parameters) or in the UI, and simulated at monthly steps. — [ACM DL](https://dl.acm.org/doi/10.1145/3641816); [GitHub](https://github.com/oargudo/deadwood)
- Fire in Paradise lets users test firebreaks, retardant and rain against the terrain and vegetation mix at interactive rates, but it uses full 3-D combustion and atmospheric fluid. — [Google Research](https://research.google/pubs/fire-in-paradise-mesoscale-simulation-of-wildfires/)
- Ecoclimates' atmosphere–vegetation feedback produces edge effects and patterning. These are the microclimate gradients that drive post-disturbance succession at forest edges. — [SIGGRAPH history](https://history.siggraph.org/?p=117929)
- **[recall]** Representative fire return intervals (FRI) from the US fire-regime literature:
  - ponderosa pine about 5–35 yr (low severity);
  - mixed conifer about 10–50 yr;
  - lodgepole pine about 100–300 yr (stand-replacing);
  - boreal spruce about 50–200 yr;
  - coastal Douglas-fir/hemlock about 200–500+ yr;
  - temperate deciduous forests largely gap-driven, with fire rare.

  **Not verified this session.**
- **[recall]** Gap dynamics: in temperate old-growth, canopy gaps form at about 0.5–2 % of area per year, giving canopy turnover times of about 50–200 years. Most gaps come from 1–3 trees. Source family: Runkle 1982, *Ecology* 63:1533. **Not verified.**
- **[recall]** Windthrow: Mitchell 2013, "Wind as a natural disturbance agent in forests: a synthesis", *Forestry* 86:147–157, DOI 10.1093/forestry/cps058. Risk rises with height/DBH ratio, shallow or wet soils, exposed ridges and fresh edges (recent gaps). **Not fetched.**

### Inferences
- Cheap disturbance kit, on a per-year tick:
  - **Gap**: background death of single trees (Q2), about 1 %/yr.
  - **Windthrow event** with a return period of about 20–100 yr per region and a wind direction. Each tree's kill probability is a logistic of (height/DBH, exposure from terrain curvature or aspect toward the wind, edge proximity, soil depth). Survivors at new edges get raised risk the following years, which gives the realistic cascade. A share of killed trees uproots (pit-mound), and the rest snap and leave a snag stub plus a log.
  - **Fire** as a CA on the grid. Spread probability = f(fuel = V + D + logs, dryness from the moisture field, slope-upward bias, wind). It kills by bark-thickness class and turns trees into snags rather than logs. Fire also consumes part of the logs and D, so fire *reduces* deadwood on the ground while creating snags.
  - **Succession**: after an event, release suppressed saplings, and let pioneer, light-demanding species (birch, aspen, pine) colonise from the seed rain. Fire-dependent species (serotinous pines) germinate only in burnt cells, as in Cordonnier.
- Running disturbance on Cordonnier-style grid layers and promoting only nearby or visible individuals to Synthetic-Silviculture trees keeps cost bounded.

### Gaps
- Fire return intervals, gap formation rates and windthrow logistic coefficients are from memory and need primary sources (for example the LANDFIRE fire-regime groups, Runkle 1982, Mitchell 2013).
- I did not find a published browser or GPU implementation of coupled windthrow + fire + deadwood.

---

## Q4. Richer plant types and procedural models; biome assignment

### Takeaway
The Hallé–Oldeman architectural models (23 in the 1978 book; Hallé later counted 22) give a botanically grounded catalogue of tree architectures. They define trunk formation, branching and flowering position, and the AMAP/de Reffye line turned them into stochastic bud-fate simulators (SIGGRAPH 1988). For a browser, one parameterisable bud-fate grammar (self-organising trees / space colonisation for trees, L-systems for herbs and ferns) plus cheap ground-cover methods covers the growth forms an Earth-like landscape needs. Biome comes from mean annual temperature and precipitation (Whittaker or Holdridge).

### Cited Findings
- Hallé & Oldeman proposed that every tree, at least when young, follows one of 23 architectural models, each named after a botanist and defined by growth characters (trunk formation, branching pattern, flowering position). The framework was consolidated in Hallé, Oldeman & Tomlinson 1978, *Tropical Trees and Forests: An Architectural Analysis* (Springer). Hallé's 2010 article speaks of "22 architectural models so far recognized". — [Oxford tropical forests talk page / search synthesis](https://www.tropicalforests.ox.ac.uk/?p=543); [WashU tribute (Hallé 1938–2025)](https://profiles.wustl.edu/en/publications/francis-hall%C3%A9-19382025-founder-of-the-study-of-tree-architecture/)
- AMAP (CIRAD) quantified Hallé's qualitative models with stochastic bud processes (growth, death, branching). The graphics paper is de Reffye, Edelin, Françon, Jaeger & Puech, "Plant models faithful to botanical structure and development", SIGGRAPH 1988 (DOI 10.1145/54852.378505 **[recall]**), and it cites Hallé et al. 1978. — [HAL INRAE](https://hal.inrae.fr/hal-02701876/document); [IRD colloquium PDF](https://horizon.documentation.ird.fr/exl-doc/pleins_textes/pleins_textes_6/colloques2/40855.pdf)
- **[recall]** Core procedural models and DOIs (not re-fetched):
  - Pałubicki, Horel, Longay, Runions, Lane, Měch, Prusinkiewicz, "Self-organizing tree models for image synthesis", ACM TOG 28(3) 58, 2009, DOI 10.1145/1531326.1531364. Bud fate driven by light (shadow propagation or space colonisation) and a Borchert–Honda resource allocation; apical control parameter λ ≈ 0.5 balances excurrent vs decurrent forms. This is the model Synthetic Silviculture builds on.
  - Runions, Lane, Prusinkiewicz, "Modeling trees with a space colonization algorithm", Eurographics Workshop on Natural Phenomena 2007, DOI 10.2312/NPH/NPH07/063-070.
  - Prusinkiewicz & Lindenmayer, *The Algorithmic Beauty of Plants*, Springer 1990, free PDF at algorithmicbotany.org/papers/abop/abop.pdf.
  - Deussen, Hanrahan, Lintermann, Měch, Pharr, Prusinkiewicz, "Realistic modeling and rendering of plant ecosystems", SIGGRAPH 1998, DOI 10.1145/280814.280898. Multi-level distribution: an ecosystem simulation (self-thinning by competition) places the big plants, then ground layers are added at progressively finer scales, with approximate instancing to reduce geometry.
  - Boulanger, Pattanaik, Bouatouch, "Rendering grass in real time with dynamic lighting", IEEE CG&A 29(1), 2009, DOI 10.1109/MCG.2009.13. Grass uses geometry close up, vertical and horizontal volume slices further out, and a density-driven LOD.
  - Whittaker 1975, *Communities and Ecosystems* (2nd ed.), biome diagram over mean annual temperature (about −15 to 30 °C) and precipitation (about 0–450 cm).
  - Holdridge 1947, *Science* 105:367–368, DOI 10.1126/science.105.2727.367, life zones from biotemperature, precipitation and PET ratio.
  - Köppen–Geiger classes from monthly temperature and precipitation (Kottek et al. 2006, *Meteorol. Z.* 15:259, DOI 10.1127/0941-2948/2006/0130).

### Inferences: a growth-form catalogue and model per form
| Growth form | Where (biome / microsite) | Procedural model | Notes |
|---|---|---|---|
| Excurrent conifer (spruce, fir), **Massart/Rauh-like** | boreal, montane, cold-wet | self-organising tree with strong apical control (λ high), whorled orthotropic trunk, plagiotropic tiers | high snow-break and windthrow risk; slow-decaying logs (k ≈ 0.005–0.02) |
| Open crowned pine, **Rauh** | dry montane, sandy, fire-prone | same, lower apical control late in life, flat-topped mature crown | thick bark → fire survival; serotiny flag |
| Decurrent broadleaf (oak, beech, maple), **Troll/Rauh** | temperate, deep soils | self-organising tree or space colonisation, low λ, sympodial | fast-decaying logs (k ≈ 0.03–0.08) |
| Palm, **Corner** (single unbranched axis, lateral inflorescence) | tropical, riparian | parametric trunk + crown of pinnate or palmate fronds (L-system leaf) | no branching, so cheapest tree; Holttum for monocarpic |
| Candelabra / succulent, **Leeuwenberg** (sympodial, equal forks) | arid, Mediterranean | recursive fork grammar, thick segments, no leaves or rosettes | also covers *Dracaena*-like forms |
| Shrubs | understory, treeline, rockfall zones, post-fire | short-internode self-organising tree from multiple basal shoots (mesotony) | Cordonnier: shrubs colonise rockfall zones |
| Grasses / sedges | open, steppe, alpine | instanced blade clumps, density field, Boulanger-style LOD | fire fuel; holds slopes in Cordonnier's G layer |
| Herbs and flowers | meadows, gaps | L-systems (ABOP) | seasonal; colonise new gaps first |
| Ferns | moist shade, on logs | L-system frond (recursive pinnae) + rosette | strong cue for moist old forest |
| Mosses / lichens | rock, logs (decay class ≥ 3), north aspects | texture + shell or decal on surfaces, coverage from moisture × age × aspect | no geometry needed |
| Aquatic / riparian (reeds, willows, alders) | along flow-accumulation channels, lake edges | reeds as instanced blades; willow/alder as decurrent trees with high water demand | driven by the Cordonnier W layer or flow accumulation |
| Seedlings and saplings on logs | logs of class 3–5 in wet conifer forest | small instances spawned on the log surface | nurse-log effect (Q2) |

- Architecture names in the table are my mapping onto Hallé–Oldeman types, based on standard textbook examples, not on a fetched table. Check them in Hallé et al. 1978.
- Biome assignment: compute MAT and MAP per cell (lapse rate about −6.5 °C/km plus a rain shadow from the terrain). Look the cell up in a Whittaker polygon table, then modulate species weights by soil depth (humus + G), slope, aspect (insolation) and the moisture field. This is how DeadWood's monthly sun/temperature/wetness grids feed species viability.

### Gaps
- I did not fetch a current (2023–2026) procedural *architecture-model* system that encodes all 22–23 Hallé–Oldeman models as rules. I could not confirm whether one exists.
- The Whittaker and Holdridge boundaries are from recall. A digitised Whittaker polygon set should be sourced, for example the `plotbiomes` R package (Stefan & Levin), **[recall]**.

---

## Q5. Large-scale vegetation rendering in a browser

### Takeaway
Use instancing with per-instance data and BVH or frustum culling, a mesh LOD chain, and **octahedral impostors** beyond about 100 m. A three.js demo runs 200k trees on a 3072×3072 terrain this way. Ground cover and moss belong in density-field shaders and textures, not geometry.

### Cited Findings
- The three.js "forest of octahedral impostors" demo has 200k trees on a 3072×3072 terrain. It uses InstancedMesh2 with BVH frustum culling, a meshoptimizer-simplified LOD at 15–100 units, and an octahedral impostor beyond 100. Code: github.com/agargaro/octahedral-impostor. — [three.js forum](https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735)
- A 2026 browser open-world blog post (part 19) describes these pitfalls:
  - octahedral mapping snapped to the wrong tile at fold boundaries because of CPU/GPU divergence, so the author used an azimuth × elevation atlas instead;
  - a unit-quad instanced geometry caused three.js to frustum-cull the whole forest, fixed with an explicit bounding sphere;
  - placement uses a jittered grid with one tree per cell.

  — [Cinevva blog](https://app.cinevva.com/blog/2026-05-04-open-world-browser-part-19-imposters)
- Vendor benchmark (Unity, Pixyz) with a 140k-tri tree at 1,600 instances: **111 ms** per frame for the mesh vs **5.78 ms** for the impostor. This is vendor data. — [Pixyz docs](https://docs.unity3d.com/Packages/com.unity.pixyz.plugin4unity@2.0/manual/create-impostors.html)
- Swap to the impostor only when its screen size is at most the bake resolution. Dither or cross-fades draw both representations during the transition. — [three.js forum, trees](https://discourse.threejs.org/t/trees/14559/2); [Polycount](https://polycount.com/discussion/comment/2661270/)
- Instancing removes the per-tree draw-call bottleneck that stalls forest rendering even when polygon counts are low (2006 TU Wien thesis). — [TU Wien report](https://www.cg.tuwien.ac.at/research/publications/2006/G_P_06_RFS/G_P_06_RFS-Report.pdf)
- DeadWood balances unique models against instancing (up to 8 per species), and more variants did not improve perceived realism. — [ACM DL](https://dl.acm.org/doi/10.1145/3641816)

### Inferences
- Budget for tens of thousands of plants: about 4–8 baked variants per species × growth stage × decay class (logs and snags are also instanced meshes), rendered with instanced draws per (variant, LOD), plus impostors for distant trees.
- Logs are long cylinders. Bend them to the terrain in the vertex shader (sample the height field along the log axis) and set sinking from decay class, so one log mesh serves every placement.
- Grass, moss and lichen are density fields sampled in shaders. Only the 0–30 m ring gets blade geometry.

### Gaps
- No peer-reviewed WebGL/WebGPU forest-rendering benchmark was found. The evidence is forum, vendor and blog material.

---

## What this means for the build

Add growth forms in this order:
1. A second conifer architecture (excurrent spruce/fir beside the existing tree).
2. Shrubs (multi-stem, short internodes).
3. Grass and herb ground cover as instanced density fields.
4. Moss and lichen as textures driven by moisture × age × aspect on rock and logs.

Palms, succulents and riparian reeds can follow, gated by a Whittaker MAT/MAP lookup.

Death should be a per-year hazard on each tree:
- background p ≈ 4.6/A_max (about 1 %/yr);
- plus about 0.37/yr while vigor stays below a suppression threshold;
- plus event kills.

Windthrow uproots or snaps trees downwind and leaves pit-and-mound relief that stays for centuries. Fire makes snags (half-life about 8–25 yr by size and species) rather than logs.

Fallen logs keep their mesh. They lose mass as M0·e^(−kt):
- k ≈ 0.03–0.08/yr for hardwoods and 0.005–0.02/yr for conifers;
- scaled by Q10 ≈ 2.5 with temperature;
- snags decay at about k/1.7.

They step through 5 visual decay classes (bark loss, sag, sinking, moss, then seedlings on classes 3–5). Below about 10–20 % of their mass they dissolve into the cell's humus.

The coupling that gives the most for the cost is Cordonnier-style. Keep per-cell layers (bedrock, granular, humus, vegetation density per form, dead matter) on about 10 m cells with 1-year steps. Let vegetation density raise the talus angle and reduce hydraulic detachment, and let dead matter feed humus, which raises fertility and growth. Microclimate feedback (Ecoclimates) and physical fire (Fire in Paradise) come later.
