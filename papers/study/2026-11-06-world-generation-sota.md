# World generation, November 2026: three families, one missing scoreboard

Research report for iori's landscape paper (fractals.html §3.2), compiled 2026-11-06. It builds on [2026-10-13-landscape-research.md](2026-10-13-landscape-research.md), which covers stream power, FastFlow, Cordonnier 2016/2017, Paris meanders and the drainage statistics (Hack, Horton, τ), and on the "Status — ground" section of `papers/fractals/LANDSCAPE.md`. That status gives the build as a 10 km region at 512², generated in 3.7 s on an M3 Pro, with measured Hack h 0.54–0.58, τ 1.36–1.45, R_B 3.1–4.6, coastline D 1.23–1.27 and hypsometric integral 0.18–0.31. Neither document is repeated here. Every claim carries a link. Inferences made by the researchers are labelled as such. Items that could not be verified from a primary source are collected in the flag table at the end.

**BLUF.**

1. **Physically based terrain grew in four directions in 2023–2026: control, speed, scale and new processes.**
   - Control: uplift painting (Schott 2023); hydrologically consistent amplification (Schott 2024).
   - Speed: O(log n) GPU flow routing (FastFlow 2024).
   - Scale: an infinite diffusion terrain with procedural-noise access (InfiniteDiffusion, SIGGRAPH 2026).
   - New processes: glaciers (Cordonnier 2023); a stochastic transport model that yields braided rivers, deltas and fans without stream power (McDonald & Cordonnier, TOG 2026, SIGGRAPH honorable mention). An independent WebGPU port of that model already runs at **3.0 ms per iteration at 512²** on an M2 Max.
2. **Learned world generators are judged on appearance, not on Earth.**
   - Video world models now reach 720p at 24–40 fps for "a few minutes" of consistency: Genie 3, Matrix-Game 3.0, AlayaWorld, and Genie 4 (announced 27 Oct 2026, no specs published).
   - DeepMind itself lists Genie 3's limits as no geographic accuracy and short sessions.
   - Every benchmark found for this family scores appearance, control, memory or short-clip physics: FID/FVD, BRISQUE/NIQE/CLIP, WorldScore, iWorld-Bench, GameWorld Score, Physics-IQ. None scores drainage, relief or vegetation.
3. **Iori's claim splits in two.**
   - *Drainage half: confirmed, with two caveats.* No graphics or learned generator was found that reports Hack, τ or Horton statistics for its output. The closest work is Lochner et al. 2023 (a breach-volume drainage score) and the Eurographics 2025 terrain-descriptor survey by Argudo et al. The survey catalogues Hack's law and the hypsometric integral and ships an MIT implementation, so the descriptors themselves are not new to graphics. What is new is using them as a scoreboard.
   - *Ecology half: refuted for graphics simulation, confirmed for learned generators.* Graphics ecosystem papers have checked self-thinning since 1998. Makowski 2019 checks the 3/2 law, and EcoBrush 2017 and Ecoclimates 2022 validate against ecological behaviour. No learned scene or world generator found checks any ecological law.
   - The defensible wording is: *"Learned world generators never, and graphics terrain generators almost never, measure Earth's drainage laws; scoring both against the same Earth statistics is cheap and has not been done."*
4. **The highest-payoff next step is not a new simulation. It is to point the harness that already exists at other generators and at real DEMs.** Terrain Diffusion's 30 m weights are MIT-licensed. Copernicus 30 m tiles of the same relief class are free. One table, showing ours, InfiniteDiffusion, a noise baseline and real Earth on h, τ, R_B and the hypsometric integral, would be the first cross-family drainage scoreboard found anywhere.

---

## 1. Physically based and procedural worlds, 2020–2026

### 1.1 The Inria/LIRIS/UCT line, after 2016

The 2026-10-13 report covered Cordonnier 2016/2017, FastFlow, Jain's debris-flow paper (2024), Tzathas 2024 and Paris 2023. New or newly checked since then:

| Year, venue | Paper | What it adds | Speed and scale | Validation |
|---|---|---|---|---|
| 2023 TOG (SIGGRAPH) | **Large-scale terrain authoring through interactive erosion simulation**: Schott, Paris, Fournier, Guérin, Galin ([project](https://h-schott.github.io/publications/uplift/publi_uplift.html); [code, MIT](https://github.com/H-Schott/StreamPowerErosion)) | Authoring in the uplift domain. Copy and paste, warping for folds and faults, ridge and river constraints, inverse modelling from a DEM, and hydrologically consistent blending ([abstract](https://www.aminer.org/pub/64d07b153fda6d7f06d6182e/large-scale-terrain-authoring-through-interactive-erosion-simulation)) | interactive (GPU) | visual |
| 2023 TOG (SIGGRAPH) | **Forming Terrains by Glacial Erosion**: Cordonnier, Jouvet, Peytavie, Braun, Cani, Benes, Galin, Guérin, Gain ([SIGGRAPH history](https://history.siggraph.org/learning/forming-terrains-by-glacial-erosion-by-cordonnier-jouvet-peytavie-braun-cani-et-al/); [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier23ToG.pdf)) | Learned ice flow plus multi-scale advection across glacial cycles. U-shaped and hanging valleys, fjords, glacial lakes. "No procedural methods had specifically targeted glacial phenomena" before it | about 300 ms per step at 1024² (2026-10-13 report) | visual, plus a glacial-hypsometry argument |
| 2024 TOG (SIGGRAPH) | **Terrain Amplification using Multi-Scale Erosion**: Schott, Galin, Guérin, Peytavie, Paris ([project](https://h-schott.github.io/publications/mserosion/publi_mserosion.html); [Paris page](https://aparis69.github.io/public_html/projects/schott2024_Erosion.html)) | Amplifies low-resolution terrain into high-resolution, **hydrologically consistent** terrain using fast approximations of thermal erosion, stream-power erosion and deposition at several scales | not retrieved | not retrieved (flag) |
| 2024 CGF (PG) | **FastFlow**: Jain, Kerbl, Gain, Finley, Cordonnier ([EG DL](https://diglib.eg.org/handle/10.1111/cgf15243); [PDF](https://people.cs.uct.ac.za/~jgain/wp-content/papercite-data/pdf/jain2024.pdf)) | Flow routing in O(log n) and depression routing in O(log² n) | 5× and 34–52× faster at 1024²; no public code found | visual |
| 2025 CGF (EG STAR) | **Terrain Descriptors for Landscape Synthesis, Analysis and Simulation**: Argudo, Guérin, Schott, Galin ([project](https://h-schott.github.io/p/desc); [UPC open-access record](https://upcommons.upc.edu/entities/publication/84a67bc5-1c9e-477e-b32a-ec08a3d1670f); [code, MIT](https://github.com/oargudo/terrain-descriptors)) | Brings geomorphology descriptors into graphics, with a correlation matrix to swap expensive metrics for cheap ones and an artist study. Notes that CG relies on "simple descriptors such as slope, light accessibility, and drainage area" and judges mainly visual plausibility | C++/Qt reference code; computations run on the UI thread | the survey is itself the validation toolkit (see §3) |
| 2025 CGF | **Vector-Based Terrain Modelling**: Perche, Guérin, Galin, Peytavie ([project](https://simonperche.github.io/vector-based_terrain_modelling); [EG DL](https://diglib.eg.org/handle/10.1111/cgf70160)) | Converts a grid DEM into ellipsoid primitives at a chosen accuracy, then edits by skeleton | — | — |
| 2025 CGF | **Single-Shot Example Terrain Sketching by Graph Neural Networks**: Liu et al. ([Wiley](https://onlinelibrary.wiley.com/doi/10.1111/cgf.15281)) | sketch-based example terrain | not retrieved | not retrieved |
| **2026 TOG (SIGGRAPH)** | **Stochastic Geomorphological Transport for Terrain Erosion Simulation**: N. McDonald (erosiv), G. Cordonnier (Inria). TOG 45(4) art. 78 ([project](https://erosiv.studio/publications/stochastic-geomorphological-transport); [DOI](https://doi.org/10.1145/3811336); [code, MIT, CUDA/Python](https://github.com/erosiv/geotransport); [video](https://www.youtube.com/watch?v=Eu5ATKUWyWw)) | A parallel stochastic particle method over geological time that "relaxes the strong velocity assumptions" of stream power and conserves momentum more generally. Braided rivers, meanders, deltas, debris-flow scars and alluvial fans emerge. **SIGGRAPH 2026 Technical Papers honorable mention** | Resolution-invariance test at 768², 1024² and 1536² over 500 ky. Timings are not on the project page | qualitative: ablations and a comparison with stream power. **No drainage statistics** |

Three things follow for the build:

- **The field has moved past pure stream power at the transport scale, but not at the relief scale.** McDonald & Cordonnier compare against stream power instead of replacing the uplift-versus-incision balance that sets relief. Our stage 3 (stream power plus hillslope) remains the standard tool for 10⁵–10⁷ yr relief. The stochastic transport model is the candidate for what our build currently does by rule: deltas, fans and braided reaches (researchers' reading of the abstract).
- **Someone has already ported the 2026 model to the browser.** [soilwebgpu](https://github.com/taesiri/soilwebgpu) (MIT, LGPL parts) implements geotransport with uplift on WebGPU, with WebGL2 and f64 CPU fallbacks. On an Apple M2 Max with WebGPU it reports **1.1 ms per iteration at 256², 3.0 ms at 512² and 14.1 ms at 1024²**, about 15 s for a 1024² bootstrap, and about 2 min to maturity at 2048². Its WebGPU path uses 64-bit fixed-point atomics, so it is "order-independent and bit-deterministic per seed". That is the determinism property the 2026-10-13 report asked for. It reports no drainage statistics. With seven stars and seventeen commits, it is a hobby port, not a reference.
- **Every paper in the table validates by eye.** The exceptions are the descriptor survey and the drainage measure in Lochner 2023 (§3).

### 1.2 Ecosystem–terrain coupling

| Work | Coupling | Ecology checks |
|---|---|---|
| Deussen et al. 1998, *Realistic modeling and rendering of plant ecosystems* ([PDF](https://graphics.stanford.edu/papers/ecosys/ecosys.pdf)) | competition places plants; 62 500 plants start at random | self-thinning by competition |
| Cordonnier et al. 2017, *Authoring landscapes by combining ecosystem and terrain erosion simulation* ([PDF](https://www.cs.purdue.edu/cgvlab/www/resources/papers/Cordonnier-ACM_Trans_Graph-2017-Authoring_Landscapes_by_Combining_Ecosystem_and_Terrain_Erosion_.pdf)) | two-way: rock, sand, humus, grass, shrub and tree layers | visual (2026-10-13 report) |
| Gain, Long, Cordonnier, Cani 2017, **EcoBrush** ([HAL](https://hal.archives-ouvertes.fr/hal-01519852)) | terrain-indexed, biome-specific plant distributions from simulation; brushes for age, density and variability | ecosystems up to 5 × 5 km interactively; validated on **succession, self-thinning and underbrush** behaviour across biomes (abstract) |
| Makowski et al. 2019, **Synthetic Silviculture** ([PDF](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)) | plants compete through a shadow field | **3/2 self-thinning**, logistic biomass, allometries against Eloy 2017, 500-year succession (earlier brief §5). Our `silviculture.js` already plots self-thinning |
| Kapp, Gain, Guérin, Galin, Peytavie 2020, *Data-driven authoring of large-scale ecosystems* ([ACM](https://dl.acm.org/doi/10.1145/3414685.3417848)) | a learned canopy-height model on user terrain, fast enough for iterative authoring | not retrieved |
| Pałubicki et al. 2022, **Ecoclimates** ([page](https://wp.faculty.wmi.amu.edu.pl/papers/Palubicki.etal-2022-Ecoclimates.html); [SIGGRAPH history](https://history.siggraph.org/?p=117929)) | vegetation, soil and atmosphere feedback: forest edges, Foehn, vegetation patterning; vegetation steps roughly monthly, weather every 10–60 s ([3DVF](https://3dvf.com/en/wp-json/wp/v2/posts/51423)) | "validate[d]… against ecology and climatology studies" ([AMiner abstract](https://www.aminer.org/pub/632633a890e50fcafd020fad/ecoclimates-climate-response-modeling-of-vegetation)) |
| Amador Herrera et al. 2021, **Weatherscapes** ([Google Research](https://research.google/pubs/weatherscapes-nowcasting-heat-transfer-and-water-continuity/); [PDF](https://storage.googleapis.com/pirk.io/papers/Amador-Herrera.etal.2021-Weatherscapes.pdf)) | atmosphere plus ground: radiative heat with albedo and cloud shadow, soil infiltration, cloud microphysics, real-weather nowcasting | visual, plus reproduced Foehn winds |
| Kokosza et al. 2024, **Scintilla** (combustible vegetation for wildfires) ([SIGGRAPH 2024 list](https://kesen.realtimerendering.com/sig2024.html)) | vegetation as fuel | not retrieved |
| *Foliager* 2025 (SIGGRAPH poster) ([ACM](https://dl.acm.org/doi/10.1145/3721250.3743024)) | LLM plus the 3-PG forest growth model from climate and stand parameters | uses a forestry growth model, not a test |

No 2024–2026 TOG paper was found that couples climate, terrain and forest growth beyond Ecoclimates. "EcoSyNth" was not found under that or any similar spelling (flag). The closest are EcoBrush, Kapp 2020, and Ecormier-Nocca et al. 2021, which produces steady-state per-species density maps (seen only in a search snippet).

### 1.3 Planet-scale procedural worlds in games

| System | How the world is made | Physical drainage? |
|---|---|---|
| **No Man's Sky** (Hello Games) | Voxel generation, then polygonisation, texturing, population and simulation, generated continuously in real time ([GDC 2017, McKendrick](https://gdcvault.com/play/1024265/); [Game Developer summary](https://gamedeveloper.com/programming/video-how-continuous-world-generation-works-in-i-no-man-s-sky-i-)). *Worlds Part II* (5.50, Jan 2025) brought a new terrain system, oceans "several kilometres deep" and gas giants ([Hello Games](https://www.nomanssky.com/2025/01/no-mans-sky-worlds-part-ii); [Gematsu](https://www.gematsu.com/2025/01/no-mans-sky-worlds-part-ii-update-now-available)) | No evidence of drainage routing. Noise and voxel fields (researchers' reading; no primary source states it) |
| **Star Citizen**, Planet Tech v5 / Genesis | "Physically based rules" over data pools of height, temperature, moisture, soil, geology and **erosion**. The erosion data drives texture blending, competition-based flora distribution and rock placement ([Star Citizen Wiki](https://starcitizen.tools/Planet_Tech_v5); [Impound guide](https://theimpound.com/pages/star-citizen-starchitect-planet-tech-v5)) | Rivers are claimed in CitizenCon coverage only. No technical source (flag) |
| **Microsoft Flight Simulator 2024** | Real Earth: Bing aerial imagery classified by Blackshark.ai neural networks into buildings, vegetation and so on; a full 3D ground mesh replaces 2020's textured 2D ground; **procedurally generated vegetation in 30 biomes**; Azure-AI ground clutter ([PC Gamer](https://pcgamer.com/games/sim/more-details-on-ms-flight-simulator-2024-including-full-3d-landscapes-in-30-biomes); [FSExpo 2024 report](https://fsnews.eu/microsoft-flightsim-development-update-at-fsexpo-2024/); [SimpleBiomes SDK](https://docs.flightsimulator.com/msfs2024/html/7_Samples_Tutorials/Samples/Sceneries/SimpleBiomes.htm)). Sim Update 2 tuned forest edges and biome transitions ([release notes](https://forums.flightsimulator.com/t/release-notes-microsoft-flight-simulator-2024-sim-update-2-1-4-20-0-available-now/720656/10)) | Drainage comes free because the relief is measured Earth. Vegetation is procedural on classified land cover. Players report trees in the wrong places ([forum](https://forums.flightsimulator.com/t/blackshark-ai-too-many-trees-in-too-many-wrong-places/305431?page=2)) |
| **Minecraft** 1.18+ and **Distant Horizons** | Multi-noise biome hypercubes (2026-10-13 report). Distant Horizons is an LOD mod that draws far chunks as simplified meshes out to 256–512+ chunks, at a cost of 2–4 GB of extra RAM ([CurseForge](https://www.curseforge.com/minecraft/mc-mods/distant-horizons); [PC Gamer](https://pcgamer.com/games/survival-crafting/distant-horizons-mod-blows-past-minecrafts-max-render-distance-pushing-viewable-terrain-out-to-an-unbelievable-512-chunks)). A Terrain Diffusion Fabric mod replaces vanilla generation with InfiniteDiffusion ([repo](https://github.com/xandergos/terrain-diffusion)) | Vanilla: correlated by construction, not by physics |
| Research planets | *Procedural Tectonic Planets* (Cortial et al., CGF 2019) steers plates into continents, ridges, ranges and island arcs ([EG DL](https://diglib.eg.org/handle/10.1111/cgf13614)). *River Networks for Instant Procedural Planets* (Derzapf et al., CGF 2011) ([EG DL](https://diglib.eg.org/handle/10.1111/v30i7pp2031-2040)) | river networks by construction. Not validated against Hack (not retrieved) |

The pattern: commercial planets fake physics with correlated fields. Star Citizen is the one that bakes an erosion layer. MSFS skips the problem by using the real Earth. None publishes drainage statistics.

### 1.4 Tools

- **Houdini 21** (2025): the Heightfield Erode SOP was "entirely rewritten… from scratch to give more realistic results with fewer, more intuitive parameters". It produces "branched and feathered" channels, and separate Hydro, Thermal and Precipitation nodes plus flow fields remain ([SideFX docs](https://www.sidefx.com/docs/houdini/heightfields/erosion.html)).
- **Gaea 2** (QuadSpinner): a core rewrite and the Erosion_2 algorithm, claimed "up to 10×" faster ([CG Channel](https://www.cgchannel.com/2023/10/quadspinner-unveils-gaea-2-0/)). Gaea 2.2 (July 2025) added selective precipitation by mask, slope or altitude, a GPU ThermalShaper, **deterministic Erosion_2**, and Glacier and IceFloe nodes ([Digital Production](https://digitalproduction.com/2025/07/18/gaea-2-2-unveils-frosty-nodes-and-selective-erosion/); [QuadSpinner blog](https://blog.quadspinner.com/gaea-2-2-released/)).
- **World Machine**: no tiled erosion is pixel-perfect (2026-10-13 report).
- **Unreal Engine 5.7**: the PCG framework is "production ready" and has GPU overrides with an Auto CPU/GPU mode that needs DX12 ([TweakTown](https://www.tweaktown.com/news/107858/unreal-engine-5-7-preview-now-out-with-production-ready-procedural-content-generation-framework/index.html); [StraySpark guide, secondary](https://www.strayspark.studio/blog/ue-57-pcg-framework-production-ready-migration-guide)). PCG scatters content; it does not simulate landscape processes.
- **Infinigen** (Princeton, CVPR 2023) ([paper](https://ar5iv.labs.arxiv.org/html/2306.09310); [site](https://infinigen.org/)):
  - Terrain is "SDF elements derived from fractal noise", meshed by marching cubes and shaped with **Landlab and SoilMachine** (McDonald 2022, the same author as the 2026 TOG paper).
  - Water is FLIP fluid for waterfalls; there is no river generator. Plants are scattered by Poisson disc with density masks, and priors such as "cacti often grow in deserts" live in config files.
  - **"The wall time to produce a pair of 1080p images is 3.5 hours."**
  - Evaluation is downstream stereo accuracy only, not terrain realism.
  - Infinigen Indoors (CVPR 2024) and Infinigen-Sim (2025, articulated objects) extend it away from landscapes.

### 1.5 Browser precedents

- **soilwebgpu**, described in §1.1, is the closest browser analogue to our physical build. It covers erosion only: no climate, ecology or statistics.
- **Frozen Fractal**'s *Around the World* (2025) tried stream power, rejected it ("artifacts and inland lakes below sea level"), and settled on a one-droplet-per-cell hybrid. It erodes 2048×1024 in under 1.5 s and measures no drainage statistics ([blog](https://frozenfractal.com/blog/2025/6/6/around-the-world-23-hydraulic-erosion/)). Its trouble with lakes is exactly what Priority-Flood solves in our build.
- **Cinevva**'s browser open world (2026) is noise plus LOD streaming (2026-10-13 report).

No other browser world was found that runs a published law at every stage and reports Earth statistics (not found ≠ does not exist; flag).

---

## 2. Learned world generation, 2023–2026

### 2.1 Terrain (DEM) generators

| Model | Data and resolution | Speed and hardware | Metrics reported | Drainage | Weights |
|---|---|---|---|---|---|
| GAN baselines, e.g. in Argudo et al. 2019 ([PDF](https://people.cs.uct.ac.za/~jgain/wp-content/papercite-data/pdf/argudo2019.pdf)) | SRTM crops | — | orometry | a GAN produced **7× too many peaks** against an Alps crop (2026-10-13 report) | — |
| **Lochner et al. 2023**, *Interactive Authoring of Terrain using Diffusion Models*, CGF (PG) ([UCT](https://pubs.cs.uct.ac.za/id/eprint/1583/); [code](https://github.com/terrain-diffusion/terrain-diffusion)) | Real DEMs, 256² tiles at ≈19.1 m (≈4.9 km). Cascaded upscalers go 153 → 19.1 → 2.39 m/px (64×) | one A100 for tuning; "approaches but does not cross" 20 Hz | FID, LPIPS; a 2AFC user study (n = 41) | **Average breaching volume b̄**: material removed by minimal breaching for free drainage, divided by area. Lochner's own model 0.61, Cordonnier 2018 erosion 0.45, Šťava 2008 3.5, Guérin 2017 4.18, Tasse 2014 5.9, Guérin 2016 14.8, Gain 2015 27.2, Zhou 2007 106, ridged noise 125.9. Scott & Dodgson 2021 post-breaching scores 0 | code + pretrained |
| StyleDEM 2023 ([arXiv](https://arxiv.org/pdf/2304.09626)) | — | — | not retrieved | — | — |
| Terrain Diffusion Network 2023 ([arXiv](https://arxiv.org/abs/2308.16725)) | "NASA Topology Images" | — | "state-of-the-art" (unnamed in the abstract) | sketch-guided rivers; no measurement | — |
| **MESA** 2025, CVPR-W (MORSE) ([arXiv](https://arxiv.org/html/2504.07210v1); [CVF](https://openaccess.thecvf.com/content/CVPR2025W/MORSE/html/Borne--Pons_MESA_Text-Driven_Terrain_Generation_Using_Latent_Diffusion_and_Global_Copernicus_CVPRW_2025_paper.html)) | SD 2.1 latent diffusion over a joint DEM and Sentinel-2 latent; ≈1.3 M 10 × 10 km tiles; Copernicus DEM 30 m; ≈768² | trained on 8×A100; DDIM 50 steps | **"primarily qualitative"**; "no existing benchmarks for text-based terrain modeling" | none | weights on HF; Core-DEM dataset released |
| TerraFusion 2025 ([arXiv](https://arxiv.org/abs/2505.04050)) | joint heightmap and texture LDM with a sketch adapter | — | not in the abstract | — | — |
| **InfiniteDiffusion / Terrain Diffusion**, Goslin, **SIGGRAPH 2026** ([arXiv v4](https://arxiv.org/html/2512.08309v4); [project](https://xandergos.github.io/terrain-diffusion/); [code + weights, MIT](https://github.com/xandergos/terrain-diffusion)) | MERIT 90 m, ETOPO1, WorldClim. A hierarchical stack from a 23 km/px coarse layer down to 512² latent tiles at 90 m (46 km); a 30 m model also exists. Laplacian encoding; training-free lazy infinite sampling; seed-consistent, constant-time random access | RTX 3090 Ti: **first tile 1.72 s, next 0.66 s**, 1.8–2.2 GB VRAM; "outpaces orbital velocity by 9×"; CPU only on Mac | **FID-50k**: Perlin blending 186.7 → naive tiling 74.4 → InfiniteDiffusion 14.8 (T = 2) → untiled base 8.1 | "visually coherent river basins". Hydrology fails more often at T = 1 (Fig. 8). **No drainage metric** | **yes (30 m and 90 m)** |

InfiniteDiffusion is the strongest learned competitor to a procedural world. It has unbounded extent, a noise-like interface, Earth-trained statistics, a Minecraft mod and MIT weights. It is also exactly the system our harness can score: it shows Earth-like appearance (FID 8–15) with unmeasured drainage.

### 2.2 3D scene generators (static, explorable)

| System | Representation | Extent and consistency | Speed and hardware | Geography physically consistent? | Open |
|---|---|---|---|---|---|
| InfiniCity 2023 ([arXiv](https://arxiv.org/abs/2301.09637)) | infinite-pixel BEV map → octree voxels → neural rendering | "arbitrary-scale" cities | — | urban layout only | — |
| **SceneDreamer**, TPAMI 2023 ([arXiv](https://arxiv.org/pdf/2302.01330); [project](https://scene-dreamer.github.io)) | **height field and semantics from simplex noise** (BEV) + neural hash grid + adversarial volumetric rendering from 2D photo collections | unbounded | — | **No: the relief is simplex noise**; realism is learned only in appearance | code |
| CityDreamer, CVPR 2024 ([arXiv](https://arxiv.org/abs/2309.00610v3)) | separate neural fields for buildings and background; OSM-based CityGen data | unbounded cities | — | real OSM layouts possible | datasets released |
| WonderJourney, CVPR 2024 ([CVF](https://openaccess.thecvf.com/content/CVPR2024/html/Yu_WonderJourney_Going_from_Anywhere_to_Everywhere_CVPR_2024_paper.html)) | LLM-written scenes → text-driven point clouds → VLM check | a perpetual chain of scenes | — | no | — |
| **WonderWorld**, CVPR 2025 ([CVF](https://openaccess.thecvf.com/content/CVPR2025/html/Yu_WonderWorld_Interactive_3D_Scene_Generation_from_a_Single_Image_CVPR_2025_paper.html)) | Fast Layered Gaussian Surfels from a single image | connected scenes on demand | **< 10 s per scene on one A6000** | no | code |
| **HunyuanWorld 1.0**, Tencent, July 2025 ([arXiv](https://arxiv.org/html/2507.21809v2); [HF](https://huggingface.co/tencent/HunyuanWorld-1)) | panorama proxy → semantically layered mesh | panoramas rotate but do not translate; Voyager adds long-range extension with a world cache | not reported | no | weights under a community licence (not OSI) |
| **World Labs Marble**, GA 12 Nov 2025 ([blog](https://www.worldlabs.ai/blog/marble-world-model)); 1.1 / 1.1 Plus, 2 Apr 2026 ([release notes](https://docs.worldlabs.ai/marble/release-notes.md)) | Gaussian splats (up to about 2 M; 500 k "light"), mesh export; Chisel coarse-block layout; LOD splat backend for "significantly larger worlds"; 1.1 Plus auto-expands | no published size limit | cloud | no | closed; export on paid plans |
| **Meta WorldGen**, Nov 2025, CVPR 2026 ([arXiv](https://arxiv.org/html/2511.16825v1); [Meta blog](https://www.meta.com/el-gr/blog/worldgen-3d-world-generation-reality-labs-generative-ai-research/)) | procedural blockout + navmesh → AssetGen2 → textured meshes | **50 × 50 m**; quality degrades 3–5 m from the centre (Meta) | — | navigability is enforced; geography is not | research only |
| WorldClaw, Aug 2026 ([arXiv](https://arxiv.org/abs/2608.05248)) | agentic: planner → terrain base → editable meshes → render-based refinement | "large-scale" (no figures) | — | no metrics in the abstract | — |

Only SceneDreamer exposes its terrain model, and that model is simplex noise. The learned part of these systems is appearance and object placement, not landform.

### 2.3 Interactive video world models

| Model (date) | Resolution, fps | Consistency horizon | Hardware | Geography physically consistent? | Open weights |
|---|---|---|---|---|---|
| **GameNGen**, Google, ICLR 2025 ([arXiv](https://arxiv.org/pdf/2408.14837)) | DOOM, **20 fps** | "stable over extended multi-minute play"; next-frame PSNR 29.4; raters near chance on short clips | one TPU | one fixed game map | no |
| **Oasis**, Decart + Etched, 31 Oct 2024 ([blog](https://oasis-model.github.io/)) | Minecraft-like, **20 fps** | "fuzzy" at distance; weak long-horizon memory; error compounding | Decart stack, H100 demo ([TechCrunch](https://techcrunch.com/2024/10/31/decarts-ai-simulates-a-real-time-playable-version-of-minecraft/)) | no | **500 M weights** on HF |
| **Genie 2**, DeepMind, 4 Dec 2024 ([Engadget](https://www.engadget.com/ai/google-deepminds-genie-2-can-generate-interactive-3d-worlds-200708207.html)) | — | up to 60 s; most examples 10–20 s | — | no | no |
| **NVIDIA Cosmos**, 6 Jan 2025 ([HF blog](https://huggingface.co/blog/mingyuliutw/nvidia-cosmos); [NVIDIA](https://www.nvidia.com/en-eu/ai/cosmos)) | Predict, Transfer and Reason; trained on ≈20 M hours of video; Predict 2.5 at 2B/14B | short physical-AI rollouts | data-centre GPUs | robotics and driving physics, not landforms | **NVIDIA Open Model License**, commercial use |
| **Genie 3**, 5 Aug 2025 ([DeepMind](https://deepmind.google/discover/blog/genie-3-a-new-frontier-for-world-models/)) | **720p, 24 fps** | "a few minutes"; visual memory about 1 min | not disclosed | **Limitations listed by DeepMind: "no perfect geographic accuracy for real-world locations"**, short interactions | no |
| **Matrix-Game 2.0**, Skywork, Aug 2025 ([arXiv](https://arxiv.org/html/2508.13009v3); [HF](https://huggingface.co/Skywork/Matrix-Game-2.0)) | **352×640, 25 fps** | minute-level; rolling KV cache "infinite-length" | one H100 | no | 1.8 B, Wan-derived; MIT per the HF card |
| **World Labs RTFM**, 16 Oct 2025 ([blog](https://worldlabs.ai/blog/rtfm)) | interactive | persistent via retrieval of posed frames | **one H100** | can explore real places from a few photos | no |
| **Project Genie**, 29 Jan 2026 ([Google](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/project-genie/)) | Genie 3 + Nano Banana Pro + Gemini | **60 s cap**; may "not obey real-world physics" | cloud (AI Ultra, US) | no | no |
| **Matrix-Game 3.0**, Apr 2026 (v3 Sep 2026) ([arXiv](https://arxiv.org/abs/2604.08995)) | **720p, up to 40 fps**, 5 B | "minute-long" memory consistency | not stated | no | not stated |
| HY-World 1.5 / WorldPlay (Tencent, 2026) | — | scored 0.848 on iWorld-Bench memory symmetry (via AlayaWorld) | — | no | code (flag) |
| LingBot-World (Jan 2026) | — | "minute-level memory" ([awesome list](https://github.com/EasonTuT/Awesome-Interactive-World-Model)) | — | no | flag |
| **AlayaWorld**, Shanda Alaya Lab, Jul–Aug 2026 ([report](https://arxiv.org/html/2607.18367v1); [repo](https://github.com/AlayaLab/AlayaWorld)) | **540p/720p, 24 fps**, on LTX-2.3 | "in principle unbounded"; iWorld-Bench memory symmetry 0.887 | not stated | the report itself: physical causality "remains limited to [its] visible consequences" | code + v1.1 weights (repo, 17 Aug 2026) |
| OmniRoam, SIGGRAPH 2026 ([project](https://yuheng.ink/project-page/omniroam/)) | long-horizon panoramic video | long-horizon | — | no | code |
| **Genie 4**, 27 Oct 2026 ([Google](https://blog.google/innovation-and-ai/models-and-research/google-deepmind/introducing-genie-4/)) | **not published**; native audio, live text direction (weather, camera, characters) | secondary sources say about 2 min ([DataNorth](https://datanorth.ai/news/google-deepmind-genie-4-world-model)); flag | not disclosed | "anchored to real-world appearance and behavior" via Gemini Omni; no geographic claim | trusted testers only |

**Summary of the family.** In two years, frame rates rose from 20 to 40 fps, resolution from 360p-class to 720p, and memory from about 20 s to minutes. No model in the table produces a world whose drainage, scale or relief is checked. The two that touch real geography do so by retrieval or reconstruction (RTFM, and Street View in Project Genie per Wikipedia, flagged), not by law. Open weights exist at the small end (Oasis 500 M, Matrix-Game 2.0, AlayaWorld, Cosmos). The frontier (Genie, Marble) is closed.

---

## 3. Evaluation: what each family measures

### 3.1 The metrics in use

| Family | Typical realism measure | Examples |
|---|---|---|
| Physically based terrain (graphics) | renderings beside a real site; expert eye; occasionally a user study | Cordonnier 2016 ("validations are based only on our observations"); Schott 2023/2024; Cordonnier 2023; McDonald & Cordonnier 2026 (ablations, a stream-power comparison, resolution invariance) |
| Terrain metrics inside graphics | orometry histograms with EMD (Argudo 2019); **geomorphon distributions** (PTRM, [Rajasekaran et al.](https://arxiv.org/abs/1909.04610)); **breach volume** (Lochner 2023); perceptual believability ([Scott & Dodgson 2022, TAP](https://openaccess.wgtn.ac.nz/articles/journal_contribution/Evaluating_Realism_in_Example-Based_Terrain_Synthesis/20129309)); the **descriptor catalogue** (Argudo 2025) | see below |
| Learned DEMs | FID, LPIPS, rFID; qualitative | Lochner 2023 (FID, LPIPS + breach + n = 41 study); InfiniteDiffusion (FID-50k only); MESA (none) |
| Learned 3D scenes | no-reference image quality and prompt alignment | HunyuanWorld: BRISQUE, NIQE, Q-Align, CLIP-I/T (e.g. image-to-world 36.2 / 4.6 / 3.9 / 84.5); [WorldScore](https://arxiv.org/abs/2504.00983) (ICCV 2025: controllability, quality, dynamics over 3 000 examples, 19 models) |
| Video world models | PSNR, LPIPS, FVD; human real-vs-fake; control accuracy; memory benchmarks | GameNGen PSNR 29.4; GameWorld Score (visual, temporal, control, "physical understanding" = object and scene consistency); iWorld-Bench (memory symmetry, trajectory alignment, brightness, colour temperature, sharpness); **Physics-IQ** ([arXiv](https://arxiv.org/abs/2501.09038): 396 real videos, 5 s clips; physical understanding "severely limited, and unrelated to visual realism") |
| Geomorphology (not graphics) | Hack, Horton and Tokunaga as targets for landscape-evolution models | e.g. [Goren & Willett, EGU 2011](https://meetingorganizer.copernicus.org/EGU2011/EGU2011-10614.pdf): h emerges at higher orders, Horton ratios measured; [Dodds & Rothman 1999](https://arxiv.org/pdf/cond-mat/9808244) |

### 3.2 Does any paper score generated terrain on Hack, Horton, hypsometry or drainage?

The search targeted generated terrain against drainage statistics, graphics and learned alike. What it found:

- **Drainage consistency, yes, once.** Lochner et al. 2023 §6.1 measures average breaching volume b̄ across ten generators. Lochner's diffusion model scores 0.61; erosion (Cordonnier 2018) scores 0.45; noise and earlier example-based methods score 3.5–126. This measures whether water can leave the map. It does not measure the shape of the network: a single straight trench gets b̄ = 0.
- **The descriptors are catalogued, not applied.** Argudo et al. 2025 surveys geomorphology descriptors for graphics, including Hack's law and the hypsometric integral (per search snippets of the paper) and river and ridge networks, and implements them. Its abstract says CG validates mainly by "visual plausibility" with "simple descriptors". It did not, as far as could be retrieved, score a set of generators on Hack or Horton (flag: full text blocked).
- **No exponents found.** Not for graphics generators (Génevaux 2013, Peytavie 2019, Fischer 2022, Paris 2023, Schott 2023/2024, McDonald 2026, Bremen CGI 2022 (which compared to real DEMs **visually only**; text extracted from [the report](https://cgvr.cs.uni-bremen.de/papers/cgi22/TR.pdf))). Not for learned DEMs (Lochner 2023, TDN, MESA, TerraFusion, InfiniteDiffusion). Not for browser projects (soilwebgpu, Frozen Fractal). One unreviewed GitHub GAN project claims "7 geomorphometric & hydrological metrics" including hypsometric integrals and D8 routing ([repo](https://github.com/maheshpaulj/Generative-Adversarial-Network-for-Synthetic-Terrain-Generation)). It is unverified (flag).
- **Geomorphology does this routinely, for its own models.** That makes the targets solid, and the transfer is what is new.

### 3.3 Does any paper score generated vegetation against ecological laws?

- **Graphics simulation: yes, repeatedly.**
  - Deussen 1998: self-thinning.
  - Makowski 2019: the 3/2 law, logistic biomass, allometry and succession.
  - EcoBrush 2017: succession, self-thinning and underbrush.
  - Ecoclimates 2022: "against ecology and climatology studies".
  - Weatherscapes 2021: reproduces Foehn.
- **Learned scene and world generators: none found.** Infinigen's vegetation follows config priors and is not tested. MSFS's procedural vegetation is judged by players. No learned forest or scene model was found that reports self-thinning, size distributions, pair-correlation functions or treeline against climate.

### 3.4 Verdict on the claim

> "Graphics and learned generators rarely measure Earth's drainage and ecological laws; a harness that scores them is cheap and new."

| Part | Verdict | Evidence |
|---|---|---|
| Learned generators rarely measure drainage | **Confirmed.** Only Lochner 2023 measures any drainage quantity (breach volume). None measures network laws | §2.1, §3.2 |
| Graphics generators rarely measure drainage | **Confirmed, with nuance.** Breach volume, orometry and geomorphons exist; the Argudo 2025 STAR provides the descriptors; no paper reports h, τ or R_B for a generator | §3.2 |
| Learned generators rarely measure ecology | **Confirmed.** None found | §3.3 |
| Graphics generators rarely measure ecology | **Refuted.** Self-thinning and succession checks have been standard since 1998 | §3.3 |
| The harness is cheap | **Confirmed.** Ours already computes h, τ, R_B, R_L, R_A, T1, θ, coastline D and the hypsometric integral on every region at 512². Lochner's b̄ and Argudo's MIT descriptors are drop-in additions | LANDSCAPE.md status; [terrain-descriptors](https://github.com/oargudo/terrain-descriptors) |
| The harness is new | **Qualified.** The metrics are not new: they are geomorphology standards, catalogued for graphics in 2025. New: (a) one scoreboard across procedural, simulated, learned and real-Earth terrain, (b) network exponents rather than breach volume, (c) drainage and ecology scored in one build | — |

Suggested wording for the paper: *"Learned world generators never, and graphics terrain generators almost never, report Earth's drainage laws. Graphics ecosystems check self-thinning, but no learned world checks any ecological law. Scoring all of them against the same Earth statistics costs seconds and has not been done."*

---

## 4. Where a law-based browser world sits, and what to adopt

### 4.1 Position

| Axis | Ours (fractals.html §3.2) | Best physical (FastFlow / McDonald 2026) | Best learned terrain (InfiniteDiffusion) | Best learned world (Genie 3/4, Marble) |
|---|---|---|---|---|
| Extent | 10 km region; a focus plot by click | 2048² (FastFlow); 1536² tested (2026) | infinite, seed-consistent | minutes of video / one splat scene (Marble) / 50 m (WorldGen) |
| Time to world | 3.7 s at 512² (M3 Pro, CPU worker) | < 10 s at 2048² (A6000, CUDA) | 1.7 s first tile (3090 Ti) | real time once running; data-centre GPU |
| Runs where | any browser, no server | CUDA / PyTorch (a WebGPU port of 2026 exists) | CUDA; Mac CPU only | cloud (Genie, Marble) or an H100 |
| Physics of relief | uplift + stream power + hillslope + talus + strata | same family, faster and larger, or new transport | none (learned from MERIT) | none |
| Drainage measured | **h, τ, R_B, R_L, R_A, T1, θ, D, HI** | no | FID only | no |
| Ecology | climate lapse, orographic rain, per-cell vegetation, plot-scale silviculture with mortality, storms, deadwood | separate papers (Ecoclimates, EcoBrush) | WorldClim conditioning only | none |
| Photorealism and open vocabulary | drawn or natural palette; fixed species | renders | heights only | **yes** |
| Determinism, editability | seeded; every constant listed | yes | seeded, constant-time access | prompt-steerable, not reproducible |

Ours is the only system found that runs as a whole world in a browser, couples relief, drainage, climate and vegetation, and publishes Earth statistics. It is smaller (10 km) and slower to scale than the GPU papers, and far less photoreal and open-ended than the learned worlds.

### 4.2 Adoptions, ranked by payoff per effort

| # | Adopt | Payoff | Effort | Why now |
|---|---|---|---|---|
| 1 | **Real-Earth baseline in the harness.** Run the same h/τ/Horton/HI code on Copernicus 30 m tiles of matched relief class (e.g. 10 km foothill and mountain crops). MESA's [Core-DEM](https://arxiv.org/html/2504.07210v1) is one source | Replaces the literature ranges, including the hypsometric integral 0.35–0.6 "from memory", with measured Earth values at our resolution and window. Hack and τ estimates depend on window and threshold, so this calibrates the harness itself | **low**: a few tiles, existing code (downloading needs iori's go-ahead) | The paper's table gains a "measured Earth, same method" column |
| 2 | **Score other generators with the harness.** InfiniteDiffusion 30 m (MIT weights), a Perlin/fBm baseline, Lochner's model (code + weights), and soilwebgpu/geotransport output | **The first cross-family drainage scoreboard**: the paper's novelty claim made concrete | low–medium: CUDA preferred (Mac is CPU-only for Terrain Diffusion); a few 512² crops suffice | Directly tests the §3.4 claim |
| 3 | **Add b̄ (breach volume) and two Argudo descriptors** (geomorphon histogram as in PTRM; prominence/isolation orometry) | Puts our numbers on the same scales other graphics papers use: b̄ is directly comparable with Lochner's Fig. 8 | low: Priority-Flood exists; descriptors are MIT C++ to port | Argudo 2025 already chose the metrics |
| 4 | **Fix the hypsometric miss.** Test stepped or graded uplift, longer runs, or a lower base level. Then re-measure against #1 | Removes one of the two stated misses in §3.2 | low | The target may move once #1 measures it |
| 5 | **Debris flow / fans** (Jain, Benes & Cordonnier 2024 terms, constants in the 2026-10-13 report) | Fans and scars under every cliff; replaces the 30–37° talus rule | low–medium: the explicit terms fit the existing loop | Published constants |
| 6 | **Stochastic transport at focus scale** (McDonald & Cordonnier 2026), starting from soilwebgpu's numbers (3.0 ms/iter at 512², bit-deterministic WebGPU) | Braided reaches, deltas and fans from a law instead of rules; aligns the focus plot with SIGGRAPH 2026 | medium: port or reimplement; licence check (MIT core, LGPL soillib parts) | The newest peer-reviewed process model, already proven in WebGPU |
| 7 | **GPU flow and lake routing** (FastFlow pointer jumping) to reach 1024² at 10 m–20 m inside 5 s | More Strahler orders, so network dimension and R_B rest on more orders (now only 4–5) | medium–high: depression routing is the hard part | Fixes the known "network dimension 1.4–1.9" miss |
| 8 | **Hydrologically consistent amplification** for the focus crop (Schott 2024, multi-scale erosion) | Sub-20 m detail that keeps drainage | medium: paper only, no code found | Crop strata terraces are rules now |
| 9 | **Microclimate feedback** (Ecoclimates: forest edges, Foehn) | Vegetation writes back into climate | high | A paper-0 stretch, not a fix |
| 10 | **Glacial stage** (Cordonnier 2023) | U-valleys, cirques, fjords | high: learned ice flow, about 300 ms/step at 1024² on a workstation | Out of the seconds budget |
| 11 | **Unbounded extent** with an InfiniteDiffusion-like coarse prior feeding L0 uplift and base level | Infinite world, with law-based drainage inside each region | high | Pairs learned context with physics, the hybrid the field is circling |

The first four cost days, not weeks. Together they turn "our numbers sit inside Earth's ranges" into "here is every family measured against Earth, by the same code".

### 4.3 What learned systems do that ours cannot yet

- **Photorealism from data.** Materials, lighting, clutter and the long tail of objects all come from data. Genie 3 runs at 720p/24 fps; Marble exports 2 M-splat scenes; MSFS classifies the whole planet. Our look is a deliberate drawing or a palette.
- **Open vocabulary.** Text or image in, world out: WonderWorld in under 10 s, Genie, HunyuanWorld, Marble. Our species, rocks and climates are a fixed list.
- **Starting from a photo or a real place.** RTFM reconstructs real locations from sparse photos; MSFS is the real Earth.
- **Dynamics and agents at interactive rates.** Promptable weather, characters and audio (Genie 4); action-conditioned play at 20–40 fps (GameNGen, Oasis, Matrix-Game 3.0).
- **Earth-like appearance at map scale, instantly.** InfiniteDiffusion's FID of 8–15 against MERIT, at 1.7 s per tile, unbounded. Our relief is physically formed but fixed to one 10 km region.

### 4.4 What ours does that they cannot

- **Law-checked drainage.** Every Strahler order, lake and strait follows from routing, and the statistics are measured. Genie 3 disclaims geographic accuracy; InfiniteDiffusion reports hydrology failures at low T.
- **Real units and causality.** Change the sea temperature and the treeline climbs. Learned worlds have no such lever, except text.
- **Reproducibility and inspectability.** The same seed gives the same world, and every liberty is listed. Learned worlds are prompt-steerable but not auditable.
- **Cost.** A laptop browser with no server, against an H100 (RTFM, Matrix-Game), a TPU (GameNGen) or a cloud subscription (Genie, Marble).

---

## Flags: unverified or derived

| # | Item | Status |
|---|---|---|
| 1 | Schott 2024 multi-scale erosion: timings, resolutions, any validation | Full text not read (ACM 403); abstract-level only |
| 2 | Argudo 2025 STAR: whether it tabulates which descriptors CG has used, and whether Hack and the hypsometric integral are among them | Hack and HI seen in a search snippet; HAL and EG PDFs blocked (Anubis/403). Abstract confirmed |
| 3 | McDonald & Cordonnier 2026: timings, hardware, quantitative validation | The project page gives none; the PDF was not read |
| 4 | soilwebgpu benchmarks (M2 Max, 1.1/3.0/14.1 ms per iteration) | From the repo README; not reproduced; hobby repository |
| 5 | Genie 4 specs (resolution, fps, about 2 min consistency) | Google's post gives none; "two minutes" is secondary (TechCrunch via DataNorth) |
| 6 | Project Genie worldwide rollout and Street View integration (May 2026) | Wikipedia only |
| 7 | Genie 2 "up to 60 s" | Secondary (Engadget); the DeepMind post was not fetched |
| 8 | Oasis resolution (often quoted as 360p) | Not stated on the official blog; omitted |
| 9 | GameNGen LPIPS and FVD | Secondary only; omitted |
| 10 | Matrix-Game 2.0 MIT licence | From the HF card snippet; the paper does not state a licence |
| 11 | Matrix-Game 3.0 weights, hardware | Not stated in the abstract |
| 12 | HY-World 1.5 = WorldPlay; LingBot-World details | From an awesome list and AlayaWorld's comparison table |
| 13 | AlayaWorld weights release (v1.1, 17 Aug 2026) | Repo news log, per search; the report itself does not state weights |
| 14 | Star Citizen rivers in Genesis | CitizenCon video summary only |
| 15 | MSFS 2024 "30 biomes", procedural vegetation, Azure ground clutter | Press coverage of FSExpo 2024; the official dev-update text was not fetched |
| 16 | No Man's Sky has no drainage routing | Researchers' inference; Hello Games does not document it |
| 17 | "EcoSyNth" | Not found under any spelling; possibly a misremembered name |
| 18 | Ecormier-Nocca et al. 2021 steady-state density maps | Search snippet only |
| 19 | Unreal 5.7 PCG "nearly twice the performance of 5.5" | Trade press; Epic's notes not read |
| 20 | Gaea 2.0 "up to 10×" erosion speed | Vendor claim via CG Channel |
| 21 | InfiniteDiffusion venue (SIGGRAPH Conference Papers '26) | Stated in the arXiv v4 HTML and the repo title; the ACM DL entry not seen |
| 22 | "No other browser world runs a law at every stage and reports Earth statistics" | Absence of evidence from targeted searches, not proof |
| 23 | "No paper reports h/τ/R_B for a generator" | Absence of evidence across about 15 targeted searches and ten paper texts or abstracts; the Argudo 2025 full text is the main unread risk |
| 24 | The GitHub GAN project with "7 geomorphometric & hydrological metrics" | Unreviewed README claim; not inspected |
| 25 | Physics-IQ venue (ICCV 2025 vs WACV 2026) | Sources disagree |
| 26 | Researchers' inferences: stochastic transport fits focus scale, not relief scale; ranking of adoptions; effort estimates | Judgement, not measured |

## References (primary, in order of first use)

- Schott et al. 2023, uplift authoring: https://h-schott.github.io/publications/uplift/publi_uplift.html · code https://github.com/H-Schott/StreamPowerErosion
- Cordonnier et al. 2023, glacial erosion: https://www.cs.purdue.edu/homes/bbenes/papers/Cordonnier23ToG.pdf
- Schott et al. 2024, multi-scale erosion amplification: https://h-schott.github.io/publications/mserosion/publi_mserosion.html
- Jain et al. 2024, FastFlow: https://people.cs.uct.ac.za/~jgain/wp-content/papercite-data/pdf/jain2024.pdf
- Argudo et al. 2025, terrain descriptors: https://h-schott.github.io/p/desc · https://github.com/oargudo/terrain-descriptors
- Perche et al. 2025, vector terrain: https://simonperche.github.io/vector-based_terrain_modelling
- McDonald & Cordonnier 2026, stochastic transport: https://erosiv.studio/publications/stochastic-geomorphological-transport · https://github.com/erosiv/geotransport
- soilwebgpu: https://github.com/taesiri/soilwebgpu
- Deussen et al. 1998: https://graphics.stanford.edu/papers/ecosys/ecosys.pdf
- EcoBrush 2017: https://hal.archives-ouvertes.fr/hal-01519852
- Makowski et al. 2019: https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf
- Ecoclimates 2022: https://wp.faculty.wmi.amu.edu.pl/papers/Palubicki.etal-2022-Ecoclimates.html
- Weatherscapes 2021: https://storage.googleapis.com/pirk.io/papers/Amador-Herrera.etal.2021-Weatherscapes.pdf
- No Man's Sky GDC 2017: https://gdcvault.com/play/1024265/
- Cortial et al. 2019, tectonic planets: https://diglib.eg.org/handle/10.1111/cgf13614
- Houdini 21 erosion: https://www.sidefx.com/docs/houdini/heightfields/erosion.html
- Gaea 2.2: https://blog.quadspinner.com/gaea-2-2-released/
- Infinigen: https://ar5iv.labs.arxiv.org/html/2306.09310
- Lochner et al. 2023: https://pubs.cs.uct.ac.za/id/eprint/1583/
- MESA 2025: https://arxiv.org/html/2504.07210v1
- InfiniteDiffusion 2026: https://arxiv.org/html/2512.08309v4 · https://github.com/xandergos/terrain-diffusion
- SceneDreamer: https://arxiv.org/pdf/2302.01330
- WonderWorld: https://openaccess.thecvf.com/content/CVPR2025/html/Yu_WonderWorld_Interactive_3D_Scene_Generation_from_a_Single_Image_CVPR_2025_paper.html
- HunyuanWorld 1.0: https://arxiv.org/html/2507.21809v2
- Marble: https://www.worldlabs.ai/blog/marble-world-model · RTFM https://worldlabs.ai/blog/rtfm
- Meta WorldGen: https://arxiv.org/html/2511.16825v1
- GameNGen: https://arxiv.org/pdf/2408.14837
- Oasis: https://oasis-model.github.io/
- Genie 3: https://deepmind.google/discover/blog/genie-3-a-new-frontier-for-world-models/
- Project Genie: https://blog.google/innovation-and-ai/models-and-research/google-deepmind/project-genie/
- Genie 4: https://blog.google/innovation-and-ai/models-and-research/google-deepmind/introducing-genie-4/
- Matrix-Game 2.0: https://arxiv.org/html/2508.13009v3 · 3.0 https://arxiv.org/abs/2604.08995
- AlayaWorld: https://arxiv.org/html/2607.18367v1
- Cosmos: https://huggingface.co/blog/mingyuliutw/nvidia-cosmos
- WorldScore: https://arxiv.org/abs/2504.00983
- Physics-IQ: https://arxiv.org/abs/2501.09038
- PTRM: https://arxiv.org/abs/1909.04610
