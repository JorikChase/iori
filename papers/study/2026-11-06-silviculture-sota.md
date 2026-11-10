# Silviculture after 2019: what grew past Synthetic Silviculture, and the numbers a forest must hit

Research brief for the fractals paper, 2026-11-06. It builds on two earlier briefs and does not repeat them:

- [2026-10-11 research brief §5](2026-10-11-research-brief.md) covers Makowski et al. 2019, Pałubicki 2009, Borchert–Honda and Table 4.
- [2026-10-13 landscape brief §4](2026-10-13-landscape-research.md) covers Cordonnier 2017, DeadWood 2024, mortality, deadwood decay, pit-and-mound, Hallé–Oldeman and impostor rendering.
- What the page does now is in `fractals.html` §3.1–3.2. It runs a reduced Makowski model on a 32 m plot with 11 forms and 8 Hallé–Oldeman models. It reports self-thinning slopes of −2.3 to −3.1 against −3/2, plus succession, deadwood decay and storms.

Every claim below links to its source. Where a number came from a summary page rather than the paper, the text says so, and the flag table at the end lists it. Primary PDFs were read as text where they could be downloaded: Ecoclimates, Rhizomorph, Interactive Invigoration, Stressful Tree Modeling, Fire in Paradise, Scintilla, Tree-D Fusion, TreeStructor, Makowski 2019, Eloy 2011 and 2017, Minamino & Tateno, Muller-Landau 2006, Asner 2013, Vaughn 2015, Reis 2021 and Seidl 2012.

---

## Summary

1. **No paper has replaced Synthetic Silviculture as an ecosystem model.** The same group (Pałubicki, Pirk, Michels, Benes) has extended it sideways instead:
   - climate feedback (Ecoclimates 2022)
   - roots (Rhizomorph 2023)
   - fire (Fire in Paradise 2021, Scintilla 2024)
   - strand-based wood volume (Interactive Invigoration 2024)
   - branch fracture (Stressful Tree Modeling 2025)
   - fungal decay (Woodstock 2026)

   Each one still grows its trees with Makowski's module simulator or with Li et al.'s 2023 shoot–root simulator.
2. **The learned generators are trained on procedural trees.**
   - The SIGGRAPH Asia 2025 autoregressive tree transformer trains on 10k–50k trees from the Rhizomorph simulator.
   - Latent L-systems trains on 155k trees from a procedural generator.
   - Tree-D Fusion fills diffusion-made envelopes with space colonisation.

   So the procedural model is still the ground truth, and the learned models compress it.
3. **The page's self-thinning comparison mixes two laws.**
   - Yoda's −3/2 relates mean mass to density.
   - Makowski's Fig. 14 relates density to trunk *diameter*, which is Reineke's form with slope −1.605.
   - iLand meets both on 42 sites: −1.62 for N–Dq and −1.52 for volume–N.
   - MECHATREE gets −1.418 for mass–N.

   The page's −2.3 to −3.1 should be re-measured in both forms before it is called a miss.
4. **There are now enough real numbers to give the forest the river network's scorecard.** The targets, from §3:
   - Stem-size exponent: 1.04–2.13 across 14 tropical plots.
   - Height–diameter exponent: 0.73 (0.71–0.76).
   - Horton ratios for trees: Rn 3.6–4.8, Rd 1.56–1.94.
   - Leonardo area ratio: 0.90–1.05.
   - Box dimension: 1.32–1.91.
   - Canopy-gap exponent: 1.83 ± 0.09 in Peru and 1.66–2.50 across 650 Amazon transects.
5. **The cheapest scale-up is iLand's light-influence stamp** on a 2 m grid. iLand runs about 10,000 ha individually, so a 1 ha plot in WebGPU is realistic. A gap statistic needs at least that much area.
6. **Browser rendering at forest scale now exists as MIT code.**
   - threejs-nanites draws 1M trees and 1.5M bushes with GPU cluster LOD in WebGPU.
   - Nanite Foliage's "assemblies" are Makowski's instanced modules under another name.

---

## 1. Graphics after 2019: extensions, not a successor

### 1.1 The Pałubicki–Pirk–Michels–Benes line

The author lists of [Pałubicki's publication page](https://wp.faculty.wmi.amu.edu.pl/) and the [Purdue Computational Vegetation Lab](https://www.cs.purdue.edu/compveg/publications/) show one continuous programme.

| Paper | Venue | Adds to the 2019 model | Scale, timing, hardware | Validation | Code |
|---|---|---|---|---|---|
| **Fire in Paradise** (Hädrich, Banuti, Pałubicki, Pirk, Michels) | ACM TOG 40(4) Art. 163, SIGGRAPH 2021 | Combustion of branch modules (pyrolysis, char insulation, mass loss) coupled to an atmospheric fluid with pyrocumulus. Trees come from Makowski's simulator, "who kindly provided their software" | Yosemite: 68K trees, 75K modules, 160³ grid at 25 m, **82 ms** per 0.016 s step. Flammagenitus: 120K trees, 95 ms. GTX 1080 | Coarse-vs-mesoscale comparison: cylinder trees burn unrealistically fast. No ground fire | none ([PDF](https://wp.faculty.wmi.amu.edu.pl/papers/Haedrich.etal-2021-Wildfires.pdf)) |
| **Ecoclimates** (Pałubicki, Makowski, Gajda, Hädrich, Michels, Pirk) | ACM TOG 41(4) Art. 155, SIGGRAPH 2022 | Vegetation–soil–atmosphere feedback: soil water infiltration, evapotranspiration, a Kessler-type cloud scheme. Vegetation and soil step monthly, weather in seconds | 4 km² terrains. 1.5 m ecosystem voxels for light and temperature, 1.5 m vapour and precipitation maps, 20 m weather voxels. Fig. 1 has 200K plants and 1M modules over 250 yr at **8.0 s per simulated year**. Claims ">500K plants at interactive rates". i5 + GTX 1050 | Qualitative only: canopy height against distance to the forest edge "conform" to Delgado et al. 2007; Meron 2019 pattern transitions; Foehn; deforestation | none ([PDF](https://storage.googleapis.com/pirk.io/papers/Palubicki.etal-2022-Ecoclimates.pdf)) |
| **Rhizomorph** (Li, Klein, Michels, Benes, Pirk, Pałubicki) | ACM TOG 42(4) Art. 59, SIGGRAPH 2023 | Roots grown with the same vigour logic as shoots, a voxel soil (texture triangle, permeability, water capacity, 1 h diffusion step), and long-distance shoot–root signalling. Root types (tap, heart, lateral) emerge from soil | Interactive, RTX 3090 + i9-10850K | Visual comparison with root atlases | **BSD-3** [edisonlee0212/rhizomorph](https://github.com/edisonlee0212/rhizomorph) (replicability stamp) |
| **Scintilla** (Kokosza, Wrede, Gonzalez Esparza, Makowski, Liu, Michels, Pirk, Pałubicki) | ACM TOG 43(4), SIGGRAPH 2024 | Adds grass, fine fuel, duff and fuel moisture to Fire in Paradise. Ground-to-crown transition and spotting | not extracted | Abstract claims validation against experiments and real fires | none ([PDF](https://wp.faculty.wmi.amu.edu.pl/Kokosza.etal-2024-Scintilla.pdf)) |
| **Interactive Invigoration** (Li, Schwarz, Pałubicki, Pirk, Benes) | ACM TOG 43(4) Art. 146, SIGGRAPH 2024 | Strands, fixed-size pipes running from leaves to root, set the wood volume. "Injecting vigour" locally regrows a part of the tree. Junctions, twists, burls | Interactive | Visual | none ([PDF](https://cs.purdue.edu/homes/bbenes/papers/Li24ToG.pdf)) |
| **Stressful Tree Modeling** (Li, Schwarz, Pałubicki, Pirk, Michels, Benes) | SIGGRAPH 2025 Conference Papers, DOI 10.1145/3721238.3730745 | Strands become Cosserat rods (XPBD), so branches bend, twist and break. Alpha-shape meshing tracks the topology change | Vulkan, RTX 3090 | Visual | none ([PDF](https://cs.purdue.edu/homes/bbenes/papers/Li25Sigg.pdf)) |
| **Woodstock** (Yang, Schwarz, Li, Michels, Benes, Pirk, Pałubicki) | ACM TOG 45(4) Art. 155, SIGGRAPH 2026 | White and brown rot as anisotropic diffusion and consumption in strand wood, moisture-driven fracture | – | – | project page [jango6324.github.io/woodstock](https://jango6324.github.io/woodstock/) |
| **GreenScapes** | listed "SIGGRAPH Asia 2026, to appear" | A vision-language model drafts a city vegetation layout, then CMA-ES refines it for shade, acoustics and aesthetics | – | – | [project](https://greenscapes-project.github.io/) |

Notes:

- Ecoclimates is the only direct "Synthetic Silviculture 2". Its Table 2 has the per-figure plant counts and per-year costs.
- Ecoclimates' DOI is 10.1145/3528223.3530146 ([BibTeX page](https://wp.faculty.wmi.amu.edu.pl/papers/Palubicki.etal-2022-Ecoclimates.html)). Fire in Paradise's is 10.1145/3450626.3459954 ([ACM record](https://dl.acm.org/doi/10.1145/3450626.3459954)).
- The same group also published plant wilting (SIGGRAPH Asia 2023), *Procedural Urban Forestry* (Niese et al., TOG 41(2) 2022) and the perceptual metric *ICTree* (Polasek et al., TOG 40(6) 2021) ([Purdue list](https://www.cs.purdue.edu/compveg/publications/)).
- The SIGGRAPH 2025 and 2026 programmes list no other tree or forest growth paper ([Kesen 2025](https://kesen.realtimerendering.com/sig2025.html), [2026](https://kesen.realtimerendering.com/sig2026.html)). A title grep found only *Stressful Tree Modeling* and the *Mokume* wood-texture paper in 2025.

The procedural line has gone **down in scale**, toward strands, rods, rot and roots. It has not gone **up**: no graphics paper since 2019 grows more individual trees than Makowski's 468K, and none validates ecosystem statistics more tightly than his Figs. 14–16.

**Earlier work still worth knowing:**

- *Windy Trees* couples growth to turbulent wind and models breakage and bud abrasion ([Pirk et al. 2014](https://kops.uni-konstanz.de/entities/publication/2e815ff4-b7b7-4fa8-86ee-f88b1b126cfb)).
- *Plastic Trees* adapts a skeleton to light and obstacles ([Pirk et al. 2012](https://history.siggraph.org/learning/plastic-trees-interactive-self-adapting-botanical-tree-models-by-pirk-stava-kratt-said-neubert-et-al/)).
- Snow load has no graphics paper (searched; flagged).

### 1.2 Reconstruction and learned generators: procedural data inside

| Method | Venue / date | Learned or procedural | Training or reference data | Numbers | Code |
|---|---|---|---|---|---|
| Learning to Reconstruct Botanical Trees from Single Images (Li et al.) | TOG 40(6), SIGGRAPH Asia 2021 | learned → procedural parameters | synthetic | – | video only |
| TreePartNet (Liu et al.) | TOG 40(6) 2021 | learned point-cloud decomposition | – | – | – |
| DeepTree (Zhou, Li, Benes, Fei, Pirk) | arXiv 2305.05153; IEEE TVCG | learned growth rule with "situated latents" | procedural trees | validated with tree-form metrics against procedural trees | none ([arXiv](https://arxiv.org/abs/2305.05153)) |
| Latent L-Systems (Lee et al.) | TOG 43(1) Art. 7, 2024 | transformer emitting L-system strings | **155k** procedural trees, 6 species | "97% agreement" on perceptual metrics (abstract) | [repo](https://github.com/JaeLee18/ACM-TOG-Latent-L-systems-Transformer-based-Tree-Generator) (no licence) ([PDF](https://cs.purdue.edu/homes/bbenes/papers/Lee24ToG.pdf)) |
| SVDTree (Li et al.) | CVPR 2024 | semantic voxel diffusion, single image | – | – | none listed |
| Tree-D Fusion (Lee et al.) | ECCV 2024 | hybrid: SD 1.5 LoRA envelope + space colonisation by genus | Auto Arborist street view | **600,000** trees, 23 cities, >300 genera. Closer to LiDAR trees than baselines | [repo](https://github.com/JaeLee18/TreeDFusion_ECCV24) ([arXiv](https://arxiv.org/abs/2407.10330)) |
| TreeStructor (Zhou, Li, Benes, Habib, Fei, Shao, Pirk) | IEEE TGRS 63, 2025 | learned retrieval of pre-generated branch parts by neural ranking | synthetic forests from an ecosystem model | ~6% better than prior state of the art; 12% less error than QSM on low-quality scans. Cannot detect dead trees or understory | [repo](https://github.com/lewkesy/treestructor_official) ([project](https://lewkesy.github.io/treestructor)) |
| DiffTS (Marks et al.) | ICCV 2025 | DDPM for node positions + MST | 280 apple trees × 10 scans | – | **MIT** [PRBonn/DiffTS](https://github.com/PRBonn/DiffTS) ([paper](https://openaccess.thecvf.com/content/ICCV2025/html/Marks_Tree_Skeletonization_from_3D_Point_Clouds_by_Denoising_Diffusion_ICCV_2025_paper.html)) |
| **Autoregressive Generation of Static and Growing Trees** (Wang, Zhang, Klein, Michels, Yan, Wonka) | SIGGRAPH Asia 2025, DOI 10.1145/3757377.3763818 | hourglass transformer over branch tokens, DFS order | **Rhizomorph's simulator**: 6 species, 10k samples (unconditional), 50k (conditional), 19,118 (growth) | 79.4M params, 4×A100. FID 5.64 on elm. DFS order beats BFS, Hilbert and zyx (5.64 / 10.21 / 83.36 / 36.30). Growth and "ungrowth" tokens give 4-D trees | not stated ([arXiv 2502.04762](https://arxiv.org/html/2502.04762v1)) |
| Autoregressive Frontier Expansion (Gupta, Peltonen, Ritzert) | arXiv 2609.38506, 29 Sep 2026 | flow matching + SO(2)-equivariant GNN; each frontier node splits or ends | **3,386 real QSMs** from BioDiv-3DTrees; also 26k neurons | Botanical W1: 0.236 vs 0.661 for SemlaFlow; 0.19 s per tree at depth 10 | not stated ([arXiv](https://arxiv.org/html/2609.38506v1)) |
| TreesFormer | under review (Submission 1008) | transformer predicting L-system grammars from orthophoto + DSM | synthetic GeoTree3D | NCD 0.21, F1 0.81 (SVDTree 0.31/0.58, Latent L-systems 0.33/0.57, Tree-D Fusion 0.66/0.01) | [repo](https://github.com/AngelikiGram/treesformer) ([page](https://angelikigram.github.io/treesformer/)) |
| DynamicTree | arXiv 2510.22213, Oct 2025 | feed-forward animation of 3DGS trees via a sparse voxel spectrum | **4DTree**: 8,786 synthetic animated trees | real-time modal response | [project](https://dynamictree-dev.github.io/DynamicTree.github.io) ([arXiv](https://arxiv.org/html/2510.22213v1)) |

Three things follow from the table.

1. **Learned tree generators are trained on procedural trees.** Seven of the eleven rows train on synthetic or procedural data. The only one trained on real architecture, Frontier Expansion, uses QSMs, which are themselves model fits. A procedural growth model is therefore not superseded by the generative models; it is their data source.
2. **None of them generates a forest.** All are per-tree, conditioned on an image, a point cloud or a sketch. No learned model reproduces competition, self-thinning or succession, and none reports an ecological statistic. Their scores are FID, Chamfer distance, IoU or W1 on node features.
3. **Gaussian splats and NeRFs reconstruct trees but do not grow them.**
   - TreeDGS measures diameter at breast height from UAV 3DGS with **4.79 cm RMSE** in loblolly pine ([arXiv 2601.12823](https://arxiv.org/html/2601.12823)).
   - "A LoD of Gaussians" renders ultra-large scenes on one consumer GPU ([arXiv 2507.01110](https://arxiv.org/abs/2507.01110v1)).
   - No splat-based *growth* method was found.

### 1.3 Real-time forest rendering at scale

| System | Date | Status | What it does | Numbers |
|---|---|---|---|---|
| **Nanite Foliage** (Unreal) | introduced in UE 5.7 (Nov 2025); docs now target **5.8** | Experimental | **Assemblies** (reused branch or frond parts, up to 65k part instances per asset), **Voxels** (near-pixel voxels replace distant clusters, no LODs or billboards), **Skinning** (wind through bones instead of WPO) | Demo tree: 41M triangles, 12 parts, 2,160 instances, 850 bones. Largest tree asset 3.5 GB → **29 MB**. ~500k instances of 1–10M-polygon trees. 100k bones ≈ 0.1 ms GPU ([Epic docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-foliage)) |
| **Procedural Vegetation Editor** (Unreal) | UE 5.7 | Experimental | Graph tool on PCG that outputs Nanite skeletal assemblies; USD import | secondary only ([80.lv](https://80.lv/articles/unreal-engine-5-7-is-now-availabe), [Digital Production](https://digitalproduction.com/2025/11/12/unreal-engine-5-7-foliage-pcg-and-in-editor-ai/)) |
| **SpeedTree 10** | 10.0 Aug/Sep 2024; 10.1 on 2025-08-18 | shipping | Vines between trees, freehand Trim (pruning), Mesh helper, Games and Cinema merged | ([CG Channel](https://www.cgchannel.com/2024/09/unity-releases-speedtree-10), [Unity docs](https://docs.unity3d.com/speedtree-modeler/manual/whats-new.html)) |
| **threejs-nanites** | updated 2026-11-04 | MIT, 92★ | three.js WebGPU: **1M trees + 1.5M bushes** on a curved planet. Per-plant cluster DAG of 128-triangle clusters, GPU culling and LOD in compute, indirect draws. Six ez-tree species, wind; WebGL2 fallback by instancing | ([repo](https://github.com/VictorZakharov/threejs-nanites), [wiki](https://github.com/VictorZakharov/threejs-nanites/wiki)) |
| **ez-tree** | 2026 | MIT, 1.7k★ | JS / three.js parametric tree generator | ([repo](https://github.com/dgreenheck/ez-tree)) |
| **Infinigen** | CVPR 2023 → 2026 | BSD-3, 7.4k★ | Procedural natural scenes, plants included, on Blender | ([repo](https://github.com/princeton-vl/infinigen), [paper](https://openaccess.thecvf.com/content/CVPR2023/html/Raistrick_Infinite_Photorealistic_Worlds_Using_Procedural_Generation_CVPR_2023_paper.html)) |

The 2019 paper's "multi-scale" was module, plant and ecosystem, rendered by instancing a few prototypes. Nanite assemblies are the same compression applied to rendering: repeated parts, instanced inside a tree. A browser version can therefore instance the simulator's own modules as its LOD-0 geometry. That makes simulation and rendering one representation, as Makowski already argued. A GPU cluster-LOD over each module prototype then follows the threejs-nanites approach.

---

## 2. Ecology and forestry models that graphics rarely cites

### 2.1 Individual-based gap models and demographic vegetation models

| Model | Unit and light | Scale | Predicts / validated against | Open? |
|---|---|---|---|---|
| **JABOWA / FORET lineage** | Trees in patches of ~100–1000 m² with no position inside the patch. Vertical light only | stands | Succession. Bugmann's review finds "a number of unrealistic assumptions" ([Bugmann 2001](https://link.springer.com/content/pdf/10.1023%2FA%3A1012525626267.pdf)) | various |
| **SORTIE / SORTIE-ND** | Spatially explicit trees. Light through species-specific crown extinction. In the 1996 version light is the *only* competition, because the field data showed little else | stands to ~ha | Neighbourhood dynamics from measured growth, mortality and dispersal ([Pacala et al. 1996](https://collaborate.princeton.edu/en/publications/forest-models-defined-by-field-measurements-estimation-error-anal/), [SORTIE](https://bvcentre.ca/forest-dynamics-program/sortie/)) | GUI + docs; R interface rsortie |
| **FORMIND** | Trees on regular square patches with no position inside; light by height layers | tropical stands to regions | Logging, fragmentation, drought, carbon ([Fischer et al. 2016](https://publications.goettingen-research-online.de/ID-40807)) | site behind a bot wall ([formind.pages.ufz.de](https://formind.pages.ufz.de/)) |
| **iLand** | Individual trees. Each stamps a pre-computed **light interference pattern** (LIP, from a fisheye GLI on a 2×2×2 m grid) into a continuous landscape light field on a **2 m** grid. Height grid 10 m. Productivity by light-use efficiency per **100 m** resource unit, split to trees by light | **10,000 ha and beyond** | Site index R² = 0.634. Dominant height bias −1.22 m, RMSE 4.62 m. **Reineke slope −1.62 vs −1.605; Yoda slope −1.52 vs −1.5** over 42 sites (not significantly different). Observed vs simulated diameter distributions in five 1 ha old-growth plots ([Seidl et al. 2012](https://andrewsforest.oregonstate.edu/pubs/pdf/pub4649.pdf), [site](https://iland-model.org/startpage)) | **GPL-3** [edfm-tum/iland-model](https://github.com/edfm-tum/iland-model), C++ |
| **PPA** (perfect plasticity approximation) | Crowns fill the canopy wherever there is room, so stem positions drop out. Canopy/understory split by a height threshold | analytic | Self-thinning exponents, equilibria. Diameter distributions of 100-yr stands "correct in form and slope" ([Strigul et al. 2008](https://zendy.io/title/10.1890/08-0082.1), [Purves et al. 2008](https://pmc.ncbi.nlm.nih.gov/articles/PMC2579370)). Rüger et al. reproduce Barro Colorado basal area and succession with two demographic trade-offs (282 species) ([Science 2020](https://forestgeo.si.edu/demographic-trade-offs-predict-tropical-forest-dynamics)) | equations |
| **LPJ-GUESS** | Age cohorts of PFTs per replicate patch, with stochastic patch disturbance | regional to global | Carbon and nitrogen ([Smith et al. 2014](https://lup.lub.lu.se/record/4392557)) | licence via Lund ([resources](https://web.nateko.lu.se/lpj-guess/resources.html)) |
| **ED2** | Size- and age-structured cohorts in patches | regional to global | Biophysics, demography ([GMD 12:4309](https://gmd.copernicus.org/articles/12/4347/2019/gmd-12-4347-2019-relations.html)) | CC-BY-4.0 [EDmodel/ED2](https://github.com/EDmodel/ED2), Fortran |
| **FATES** | Size- and age-structured, inside the CLM/E3SM land models | Earth-system | At BCI, large-tree quantities (biomass) are the most sensitive to the number of competing PFTs ([Koven et al. 2020](https://bg.copernicus.org/articles/17/3017/2020/)) | [NGEET/fates](https://github.com/NGEET/fates), Fortran |

**iLand is the one to copy.** Its light model is a stamp, so it is cheap and maps directly to a GPU blend or atomic pass. It scales to landscapes. And it reports self-thinning in exactly the two forms the page needs (§2.4). The LIP is a fixed per-species, per-height kernel, which plays the role of Makowski's grid shadow lerp(s_tol, 1, Q·Q_G) at 2 m.

The cohort models (LPJ-GUESS, ED2, FATES) drop individual geometry altogether. They are useful as references for regional biomass and PFT mixes, not as plot models.

### 2.2 Functional–structural plant models

| Platform | What it is | Relevance |
|---|---|---|
| **GroIMP** | Relational growth grammars (XL) with a built-in light model. Cyclic graphs make export to tree formats awkward ([Kurth slides](https://wkurth.grogra.de/ws15a.pdf)) | Its light model has been called from OpenAlea through a canonical graph format ([HAL 2020](https://hal-lirmm.ccsd.cnrs.fr/hal-03059527v1)) |
| **OpenAlea / L-Py** | Python component platform with MTG data and visual programming ([OpenAlea](https://publish.csiro.au/FP/fulltext/FP08084)); L-Py is the L-system engine ([openalea/lpy](https://github.com/openalea/lpy)) | MTG is the standard plant-architecture exchange format |
| **AMAPstudio / AmapSim** | Stochastic bud-fate simulator over a *physiological age* axis, built on Hallé–Oldeman; Xplo + Simeo ([Barczi et al. 2008](https://publications.cirad.fr/une_notice.php?dk=544088), [amapstudio.cirad.fr](https://amapstudio.cirad.fr)) | Primary source for architectural-model parameters (earlier brief §4) |
| **Helios** | C++ plug-in framework: radiation, energy balance, stomata, photosynthesis, procedural trees, LiDAR. Many plug-ins run on the GPU ([Bailey 2019](https://www.frontiersin.org/article/10.3389/fpls.2019.01185/full)) | LGPL-2.1, active ([PlantSimulationLab/Helios](https://github.com/PlantSimulationLab/Helios)). Reference for leaf-level light |
| **MECHATREE** | Trees evolve on a virtual island under light competition and recurrent gales, with no hydraulics ([Eloy et al. 2017](https://www.nature.com/articles/s41467-017-00995-6.pdf)) | **The closest analogue to the page**: a fractal-dimension, Horton-ratio and allometry scorecard against real trees (§3) |

### 2.3 Forest digital twins from LiDAR and QSMs

- **Wytham Woods.** The 1 ha stand has all **559** trees modelled individually from TLS for radiative transfer ([Calders et al. 2018](https://doi.org/10.3390/rs10060933)). A bitemporal 2015/2022 model followed ([2024](https://www.researchgate.net/publication/384494350_Bitemporal_Radiative_Transfer_Modeling_Using_Bitemporal_3D-Explicit_Forest_Reconstruction_from_Terrestrial_Laser_Scanning)), and a 1 ha library-subsampling study quantifies the trade-offs ([RSE 2023](https://discovery.ucl.ac.uk/id/eprint/10179284/1/Reconstructing%20the%20digital%20twin%20of%20forests%20from%20a%203D%20library%20-%20quantifying%20trade-offs%20for%20radiative%20transfer%20modeling.pdf)).
- **BioDiv-3DTrees.** 4,952 TLS/ULS tree clouds of 19 species and **3,386 QSMs**, from Germany, leaf-off ([Griese, Ritzert & Nölke 2025](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12712040/)). It is the largest public set of real branch graphs found, and the training set of Frontier Expansion.
- **QSM bias.** TreeQSM overestimated woody volume by **+336 L and +392 L** on two destructively harvested ash trees, **80–83%** of it in branches under 5 cm. A review puts this at 38–52% ([TreeQSM validation review](https://silvafennica.fi/article/10550)). Lau et al. found TreeQSM's WBE exponents for radius and length both biased, cancelling in θ ([Lau et al. 2019](https://cifor-icraf.org/knowledge/publication/7312)). **Fine-branch statistics from QSMs should therefore not be used as a target.** Use trunk and major-branch statistics, or destructive data.
- **Treegraph.** 603 TLS trees, 18,657 branching nodes, area-preserving at node level. The exponents deviate from WBE ([Yang et al. 2024, RSEC](https://oro.open.ac.uk/97941); numbers from a summary page).
- **Tallo.** 498,838 trees with diameter, height and/or crown radius, at 61,856 sites and 5,163 species, CC-BY on Zenodo ([Jucker et al. 2022](https://research-information.bris.ac.uk/en/publications/tallo-a-global-tree-allometry-and-crown-architecture-database/)). It is the reference cloud for H–D and crown–D.

### 2.4 Correction for the paper: the "3/2 law" has two forms, and the page mixes them

- **Yoda (1963):** mean plant **mass** against density, slope **−3/2**.
- **Reineke (1933):** stem **number** against quadratic mean **diameter**, log N = a + b·log Dq with b = **−1.605**.
- **Makowski 2019, Fig. 14:** plots **Density (1/m²) against Trunk Diameter (m)** for trees over 5 cm and calls the line the "3/2 power law", citing Zeide 1987 ([Makowski et al. 2019 §8](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)). That is the Reineke form, where 3/2 happens to sit close to 1.605. It is *not* the mass form the page states in §3.1: "mean plant mass rises as density to the power −3/2 … Makowski's full model reproduces that law."

Measured references for each form:

| Form | Value | Source |
|---|---|---|
| N vs Dq | −1.605 | Reineke 1933 |
| N vs Dq, species-specific (28 German stands since 1870) | beech **−1.789**, spruce **−1.664**, Scots pine **−1.593**, oak **−1.424** | [Pretzsch & Biber 2005](https://agris.fao.org/search/en/records/65df68844c5aef494fe27e52) |
| Mean mass vs N | −4/3 predicted from 3/4-power resource use | [Enquist, Brown & West 1998](https://experts.arizona.edu/en/publications/allometric-scaling-of-plant-energetics-and-population-density/) |
| Mean mass vs N (MECHATREE) | −1.418 (CI −1.421 to −1.416) | [Eloy et al. 2017](https://www.nature.com/articles/s41467-017-00995-6.pdf) |
| Mean mass vs N, individual populations | 20 of 63 data sets differ significantly from −3/2; slopes correlate with shade tolerance | [Weller 1987](https://repository.si.edu/items/4b10966d-d8da-4581-ac3d-79ec8d9bd965) |
| iLand, 42 sites | N–Dq **−1.62**; volume–N **−1.52** | [Seidl et al. 2012](https://andrewsforest.oregonstate.edu/pubs/pdf/pub4649.pdf) |

The two forms are linked through the mass–diameter exponent. If M ∝ D^βB and N ∝ D^b, then M ∝ N^(βB/b). With βB ≈ 2.4–2.9 (§3) and b ≈ −1.6, the mass slope comes out between −1.5 and −1.8. **A mass slope of −2.3 to −3.1 implies a Reineke slope of about −0.9 to −1.3**, a stand that sheds far fewer stems as it grows than any measured one.

Before calling it a defect, re-measure:

1. Fit only the **boundary line**, the maximum-density, self-thinning phase, after canopy closure. Iori's earlier text already notes Makowski fitted only trees over 5 cm.
2. Report **both** the N–Dq and the M–N slopes, plus the sim's own βB.
3. Exclude density-independent deaths (background 1%/yr, storms, senescence) from the thinning fit. They remove stems without the growth-driven crowding the law describes, and they steepen the curve.

---

## 3. Scaling numbers a simulation can be scored against

The river table in §3.2 of the page has a forest counterpart. Each row gives the statistic, the measured value, how it was measured, and the source.

### 3.1 Single-tree architecture

| Statistic | Measured value | Method / caveat | Source |
|---|---|---|---|
| Leonardo exponent Δ (Σ dᵢ^Δ = d₀^Δ) | **1.8 < Δ < 2.3** for many species; theory gives 1.93–2.21 for 2 < D < 3 | review of data | [Eloy 2011, PRL](https://arxiv.org/pdf/1105.2591) |
| Leonardo area ratio (a₁+a₂)/a₀ | mean **0.90–1.05** for balsa, maple, oak, piñon, ponderosa (~7,100 nodes) | manual measurement | Bentley et al. 2013 via [Eloy 2017](https://www.nature.com/articles/s41467-017-00995-6.pdf); [Bentley 2013](https://pubmed.ncbi.nlm.nih.gov/23800188/) |
| Leonardo vs biomechanics | small deviation in real Fagus crenata / Abies homolepis; Fagus fits uniform-stress best | field + model | [Minamino & Tateno 2014](https://doi.org/10.1371/journal.pone.0093535) |
| Horton bifurcation ratio Rn | red oak **3.83**, poplar **4.22**, fir **4.8**, apple **4.35**, birch **4.00**, piñon **3.63**. MECHATREE 3.51 (CI 3.42–3.60) | Strahler order | table in [Eloy 2017](https://www.nature.com/articles/s41467-017-00995-6.pdf) |
| Horton length ratio Rl | fir **2.7**, piñon **1.71**. MECHATREE 1.60 in forest / 1.74 alone | – | same |
| Horton diameter ratio Rd | **1.56–1.94** (oak, poplar, apple, birch, piñon). MECHATREE 1.85 | – | same |
| Architectural fractal dimension D = ln Rn / ln Rl | piñon **2.40**, fir 1.6. MECHATREE **2.68** in forest, **2.26** alone; the fittest trees have D ≈ 2.5 | – | same |
| Bifurcation ratio, earlier survey | "about 3–8", length ratio ~2.6 | summary page only, flagged | [Leopold 1971](https://pubs.usgs.gov/publication/70010394) |
| Bifurcation ratio as a species constant | disputed: varies within crowns and with vigour | – | [Whitney 1976](https://scilit.com/publications/90a6a1e025170136980a7a640fef528b); [Borchert & Slade 1981](https://www.journals.uchicago.edu/doi/10.1086/337238) |
| WBE branch exponents | WBE predicts radius 1/2, length 1/3, θ 3/4; 9 Guyanese trees deviate significantly | TLS + TreeQSM vs destructive | [Lau et al. 2019](https://cifor-icraf.org/knowledge/publication/7312) |
| Node-level vs whole-tree scaling | area-preserving, self-similar within trees, but node-level and whole-tree exponents differ | 5 species | [Bentley et al. 2013](https://pubmed.ncbi.nlm.nih.gov/23800188/) |
| **Box dimension Db** of whole trees (TLS) | maple 1.43–1.81 (mean **1.65**, n = 5); beech 1.35–1.91 (**1.66**, n = 46); ash 1.32–1.81 (**1.52**, n = 25); all real trees 1.18–2.2, Hainich none above 2 | box sizes from 30 m down to 10 cm; Db rises with crown-surface / wood-volume ratio (R² = 0.45). Leaf-on Db > leaf-off | [Seidel et al. 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6662337); [Seidel 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC5756834) (one beech: 1.78; none above 1.9) |

### 3.2 Allometry

| Statistic | Measured | Source |
|---|---|---|
| H ∝ D^βH | dicots and conifers **0.73 (0.71–0.76)**; reported range 0.54–0.89; WBE 2/3; MECHATREE 0.87; curvilinear at large D | Table 3 in [Eloy 2017](https://www.nature.com/articles/s41467-017-00995-6.pdf) |
| Leaf mass ∝ D^βN | **2.17 (2.01–2.32)**; WBE 2; MECHATREE 1.97 | same |
| Stem biomass ∝ D^βB | **2.89 (2.71–3.14)**; WBE 3; MECHATREE 2.82 | same |
| Leaf mass ∝ B^βML | **0.74**; MECHATREE 0.68 | same |
| H–crown–D cloud | 498,838 trees | [Tallo](https://research-information.bris.ac.uk/en/publications/tallo-a-global-tree-allometry-and-crown-architecture-database/) |

Makowski 2019 Fig. 16 already compared H–D and leaf-mass–D for simulated pines with Eloy 2017. The table above gives the exponents to print beside the sim's.

### 3.3 Stand: size distribution and self-thinning

| Statistic | Measured | Source |
|---|---|---|
| N(D) ∝ D^−θ, WBE / metabolic prediction | **θ = 2**. Supported in Costa Rica, Malaysia and Panama; successional stands converge to it after ~50–80 yr | [Enquist, West & Brown 2009](https://pmc.ncbi.nlm.nih.gov/articles/PMC2678479) |
| θ across 14 tropical plots, 473 ha, >2M trees | **All stems 1.04–2.13**; small stems 1.08–2.05 (≤ 0 at Mudumalai); **stems ≥ 20 cm 2.42–3.68**. Significantly different from 2 in 13 of 14 forests. BCI 1.90–1.97; Pasoh 1.87–1.93; Yasuni 1.84–1.86; Ituri 2.04–2.13; Mudumalai 1.04–1.16. Best fits are usually Weibull or quasi-Weibull, consistent with demographic equilibrium | Table 3, [Muller-Landau et al. 2006](https://faculty.lsu.edu/kharms/files/muller_landau_etal_2006_ecol_ltrs_589.pdf) |
| Understory size structure | power law whose exponent depends only on the crown-area–diameter exponent | [Farrior et al. 2016](https://repository.si.edu/items/f7a65a0e-c7b5-4b9d-b25b-e296fdbdfb7a) (value not read) |
| MECHATREE trunk diameters | ∝ d^−2 | [Eloy 2017](https://www.nature.com/articles/s41467-017-00995-6.pdf) |
| Self-thinning | see §2.4 | – |

**Scoring rule.** Report θ for all stems and for stems ≥ 20 cm separately. A forest scoring θ_all ≈ 1.8–2.0 and θ_large ≈ 2.5–3.5 sits in the real band. A single −2 law is the theory's claim, not the data's.

### 3.4 Canopy: gap size distribution

Gap areas follow a Zeta / power-law frequency f(A) ∝ A^−λ. The fitted λ depends on the height threshold that defines a gap and on the minimum gap size, so a simulation must copy the method.

| Site | λ | Method | Source |
|---|---|---|---|
| Southern Peruvian Amazon: 5,877,937 gaps over 125,581 ha | **mean 1.83, s = 0.09**; per-block 1.63–2.03; λ 1.60–1.85 from ground to 20 m | CAO airborne LiDAR; thresholds ≤1 m and ≤20 m | [Asner et al. 2013](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0060875) |
| Lowland Costa Rica | **1.99** (≤ 1 m gaps), **1.66** (≤ 20 m) | Kellner et al., as reported by Asner 2013 | same |
| Hawaiian submontane, Metrosideros-dominated | **1.8–2.6** | same | same |
| Amazon (Fisher et al. 2008) | 1.1–1.6, recalculated by Lloyd et al. to **1.9–3.1** | same | same |
| Brazilian Amazon: 650 transects, ~2,500 km² | intact **1.66–2.50** (n = 421); human-modified 1.73–2.31 (n = 229); regional means 1.91–2.06 | 1 m CHM, gaps = holes at **10 m** height, **20 m²–1 ha**, poweRlaw fit | [Reis et al. 2021 preprint](https://www.biorxiv.org/content/10.1101/2021.05.03.442416.full.pdf) |
| Hawaiian montane fragments | site-wide **1.36**, "much smaller" than elsewhere; λ falls within 20 m of an edge | repeat LiDAR | [Vaughn, Asner & Giardina 2015](https://par.nsf.gov/servlets/purl/10057540) |
| Rule of thumb | λ > 2: small-gap dynamics; λ < 2: large disturbances | – | Reis et al., citing Asner 2013 / Silva 2019 |

**Scale.** A 1 ha upper cut-off means the plot must be at least about 1 ha, and preferably many hectares, before λ can be estimated. The page's 32 m plot is 0.1 ha, so it can only report the gap fraction. That is the strongest reason to grow the plot (§4, item 3).

### 3.5 Dynamics

- **Background mortality** of ~1%/yr and the snag and log decay tables are in the [landscape brief §4](2026-10-13-landscape-research.md). The plot report (85% age, 11% storm, 4% shade over 2,012 deaths) can be checked against the Amazon mortality rates Reis et al. tabulate: 1.3–2.8%/yr by region from Esquivel-Muelbert 2020, and 0.65–0.89%/yr from Dalagnol 2021.
- **Edge effect.** Ecoclimates shows canopy height rising with distance from the forest edge, steeper in pine than in mixed forest (Fig. 21, after Delgado et al. 2007). Vaughn 2015 finds λ reaching its interior value within 20 m of an edge. Both are cheap spatial checks once the plot has edges.

---

## 4. What a browser implementation could adopt next

The ranking is by visual and scientific payoff per unit of effort, for the existing `fractals.html` forest in WebGL2/WebGPU.

| # | Adopt | Payoff | Effort | Notes |
|---|---|---|---|---|
| **1** | **Re-measure self-thinning in both forms** (§2.4): Reineke N–Dq and Yoda M–N, fitted on the boundary line after canopy closure, density-independent deaths excluded, plus the sim's βB | Scientific: high. Fixes a stated comparison, and may turn "a miss" into a hit or a precise miss | **hours** | iLand's −1.62 / −1.52 and Pretzsch's species slopes are the targets. Rewrite the §3.1 sentence about Makowski either way |
| **2** | **A forest scorecard table** under §3.1, like the river table: H–D exponent, size-distribution θ (all and ≥ 20 cm), Horton Rn / Rd / Rl and D = ln Rn / ln Rl, Leonardo area ratio, box dimension Db per specimen, background mortality | Scientific: very high. Visual: low | **1–2 days**; all are computable from existing state | Targets in §3. Box-count each specimen window on its branch cylinders, from 30 m to 10 cm as Seidel does. Strahler-order each specimen's graph. This turns "a tree is a fractal" into measured numbers |
| **3** | **iLand-style light-influence stamps on a 2 m GPU grid**, replacing or augmenting per-module overlap at plant scale; then grow the plot from 32 m to **100–300 m** | Scientific: high, since gap statistics λ become measurable and edge effects appear. Visual: high, since real gaps and edges show | **3–5 days** | Each tree adds its species × height kernel by additive blending or atomics; read light at crown cells. Precompute kernels once per species. Measure λ the Reis way: 1 m CHM, 10 m threshold, gaps 20 m²–1 ha |
| **4** | **Instance the simulator's modules as render geometry**, with a GPU cluster-LOD per module prototype and impostors beyond (threejs-nanites, MIT) | Visual: very high in the region view, where individual trees could replace cell colour | **1–2 weeks** | Nanite assemblies use the same idea. Keep the octahedral-impostor pitfalls in mind (landscape brief) |
| **5** | **Pipe-model thickening with Leonardo exponent Δ** as a per-species parameter in 1.8–2.3, and print the measured area ratio | Visual: medium (trunk taper and junction weight). Scientific: medium | **hours** | Check what the code uses now. Eloy predicts Δ from D |
| **6** | **Microclimate scalar** (Ecoclimates-lite): canopy cover per cell lowers temperature and raises humidity under the canopy. Feed it into deadwood k(T) (Q10 = 2.53, already in the page) and seedling establishment | Scientific: medium (edge effects, decay gradients). Visual: medium (moss and decay patterns follow canopy) | **1 day** | No fluid solver; a blur of canopy cover is enough for a first version |
| **7** | **Root plates from a Rhizomorph-style root graph** on uprooted trees: tap, heart or lateral by species, depth by soil depth; the pit and mound sized from it | Visual: high at storm-damage close-ups | **2–4 days** | BSD-3 C++ reference ([rhizomorph](https://github.com/edisonlee0212/rhizomorph)). Grow roots only for the trees that fall |
| **8** | **Fire as a cellular automaton with a ground → ladder → crown transition** (Scintilla's idea at cell level), leaving snags | Visual: high. Scientific: low–medium | **2–3 days** | The landscape brief already proposes the CA; Scintilla adds the fuel layers |
| **9** | **PPA overlay**: from the sim's own growth, mortality and crown allometries, draw the PPA-predicted size distribution next to the simulated one | Scientific: medium. A model–model check that needs no data | **1 day** | [Purves et al. 2008](https://pmc.ncbi.nlm.nih.gov/articles/PMC2579370) |
| **10** | **Strand-based wood** (Invigoration, Stressful, Woodstock) | Visual: very high in close-ups (junctions, burls, breakage, rot) | **weeks**; GPU rods are feasible in WebGPU but heavy | Use only for one hero specimen |
| **11** | **Learned generators** (autoregressive tree transformer, Latent L-systems) | low for this paper | high | They are trained on procedural output and carry no ecology. Worth one sentence in the paper: the generative models learned *from* simulators like this one |

The order reflects the paper's method: measure before adding. Items 1–3 make §3.1 as checkable as §3.2. Item 4 is the largest visual step. Items 6–8 deepen the dead half of the cycle the page already has.

---

## Flags: what could not be verified from a primary source

| Item | Status | What is missing |
|---|---|---|
| Ecoclimates ">500K plants at interactive rates" | author claim | Table 2's largest listed scene is 200K plants at 8 s per simulated year |
| Scintilla performance and validation numbers | not extracted | the abstract claims validation against experiments and real fires; tables not read |
| Woodstock venue | partly checked | the ACM citation (TOG 45(4) Art. 155) appears via a search summary; the project page said "conditionally accepted" |
| GreenScapes venue | author page only | "SIGGRAPH Asia 2026, to appear" |
| Autoregressive trees code | none found | arXiv does not link code |
| SVDTree, TreePartNet numbers | not read | listed from the Purdue publication page |
| Nanite Foliage version | inconsistent | secondary sources say UE 5.7 (Nov 2025); Epic's live doc targets 5.8. The figures are from the live doc |
| UE 5.7 Procedural Vegetation Editor details | secondary only | Epic release notes not retrieved |
| SpeedTree 10.0 date | inconsistent | CG Channel's article is dated 30 Sep 2024 but says the release was "last month" |
| threejs-nanites performance | not measured | only the repo wiki's claims |
| FORMIND patch size and licence | not verified | site behind a bot-protection page |
| LPJ-GUESS cohort details | from later papers | Smith 2014 methods not read |
| FATES using the PPA for canopy layering | from memory | not stated in the abstracts read; omitted from the table |
| ED2 2019 author list | not checked | GMD record only |
| Bugmann 2001 "1/12 ha" JABOWA patch | not confirmed | snippet gives 100–1000 m² |
| Leopold 1971 "Rb 3–8, Rl 2.6" | aggregator summary | full text not read |
| Whitney 1976 per-species Rb | not read | JSTOR |
| Bentley 2013 area ratio 0.90–1.05 | via Eloy 2017's citation | Bentley full text not opened |
| Treegraph (Yang et al. 2024) "603 trees, 18,657 nodes, area-preserving" | search summary | Wiley / ORO PDF blocked (403) |
| Chmurzynski & Brummer 2024 | bioRxiv abstract only | – |
| Farrior et al. 2016 exponent value | not read | Science paywall |
| Kellner & Asner 2009 exponents | second-hand | via Asner 2013's text (1.99 and 1.66 for Costa Rica) |
| Reis et al. Amazon gaps | preprint (May 2021) | the published version's numbers may differ |
| Jucker et al. 2017 D(H, CD) equation coefficients | not retrieved | Wiley and CORE returned 403; omitted |
| AdQSM (Fan et al. 2020) | not found | no source located under that name; omitted |
| TreeQSM overestimation 38–52% / +336 L, +392 L (Demol et al. 2022) | via a review summary | Demol full text not opened |
| Calders et al. 2025 Nat. Commun. TLS review | not read | the Nature login redirect blocked it |
| Muller-Landau "small" vs "large" cut-offs | read | "large" = ≥ 20 cm; the "small" cut-off was not extracted |
| Snow-load breakage in graphics | absence | no paper found |
| Splat-based tree growth | absence | no paper found |
| The page's own self-thinning measurement (what "mass" is, which phase is fitted) | not inspected | §2.4's diagnosis is conditional on how the code computes the slope |

---

## References

**Graphics, procedural.**
- Makowski et al., "Synthetic Silviculture", TOG 38(4) 131, 2019 ([PDF](https://wp.faculty.wmi.amu.edu.pl/papers/Makowski.etal-2019-Synthetic-Silviculture.pdf)).
- Hädrich et al., "Fire in Paradise", TOG 40(4) 163, 2021 ([PDF](https://wp.faculty.wmi.amu.edu.pl/papers/Haedrich.etal-2021-Wildfires.pdf)).
- Pałubicki et al., "Ecoclimates", TOG 41(4) 155, 2022 ([PDF](https://storage.googleapis.com/pirk.io/papers/Palubicki.etal-2022-Ecoclimates.pdf)).
- Li et al., "Rhizomorph", TOG 42(4) 59, 2023 ([PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Li23ToG.pdf), [code](https://github.com/edisonlee0212/rhizomorph)).
- Kokosza et al., "Scintilla", TOG 43(4), 2024 ([PDF](https://wp.faculty.wmi.amu.edu.pl/Kokosza.etal-2024-Scintilla.pdf)).
- Li et al., "Interactive Invigoration", TOG 43(4) 146, 2024 ([PDF](https://cs.purdue.edu/homes/bbenes/papers/Li24ToG.pdf)).
- Li et al., "Stressful Tree Modeling", SIGGRAPH 2025 ([PDF](https://cs.purdue.edu/homes/bbenes/papers/Li25Sigg.pdf)).
- Yang et al., "Woodstock", TOG 45(4) 155, 2026 ([project](https://jango6324.github.io/woodstock/)).
- GreenScapes ([project](https://greenscapes-project.github.io/)).
- Pirk et al., "Windy Trees", SIGGRAPH Asia 2014 ([KOPS](https://kops.uni-konstanz.de/entities/publication/2e815ff4-b7b7-4fa8-86ee-f88b1b126cfb)).
- Peytavie et al., "DeadWood", TOG 2024 ([ACM](https://dl.acm.org/doi/10.1145/3641816), [code](https://github.com/oargudo/deadwood)).
- Raistrick et al., "Infinigen", CVPR 2023 ([paper](https://openaccess.thecvf.com/content/CVPR2023/html/Raistrick_Infinite_Photorealistic_Worlds_Using_Procedural_Generation_CVPR_2023_paper.html), [code](https://github.com/princeton-vl/infinigen)).

**Graphics and vision, learned.**
- Zhou et al., "DeepTree" ([arXiv 2305.05153](https://arxiv.org/abs/2305.05153)).
- Lee et al., "Latent L-Systems", TOG 43(1) 7 ([PDF](https://cs.purdue.edu/homes/bbenes/papers/Lee24ToG.pdf)).
- Lee et al., "Tree-D Fusion", ECCV 2024 ([arXiv 2407.10330](https://arxiv.org/abs/2407.10330)).
- Zhou et al., "TreeStructor", IEEE TGRS 63, 2025 ([project](https://lewkesy.github.io/treestructor)).
- Marks et al., "Tree Skeletonization … by Denoising Diffusion", ICCV 2025 ([paper](https://openaccess.thecvf.com/content/ICCV2025/html/Marks_Tree_Skeletonization_from_3D_Point_Clouds_by_Denoising_Diffusion_ICCV_2025_paper.html)).
- Wang et al., "Autoregressive Generation of Static and Growing Trees", SIGGRAPH Asia 2025 ([arXiv 2502.04762](https://arxiv.org/html/2502.04762v1)).
- Gupta, Peltonen & Ritzert, "Autoregressive Frontier Expansion", 2026 ([arXiv 2609.38506](https://arxiv.org/html/2609.38506v1)).
- TreesFormer ([page](https://angelikigram.github.io/treesformer/)).
- DynamicTree ([arXiv 2510.22213](https://arxiv.org/html/2510.22213v1)).
- TreeDGS ([arXiv 2601.12823](https://arxiv.org/html/2601.12823)).
- Purdue CompVeg publication list ([page](https://www.cs.purdue.edu/compveg/publications/)).

**Rendering.**
- Epic, Nanite Foliage ([docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/nanite-foliage)).
- UE 5.7 ([80.lv](https://80.lv/articles/unreal-engine-5-7-is-now-availabe)).
- SpeedTree 10 ([CG Channel](https://www.cgchannel.com/2024/09/unity-releases-speedtree-10)).
- threejs-nanites ([repo](https://github.com/VictorZakharov/threejs-nanites)).
- ez-tree ([repo](https://github.com/dgreenheck/ez-tree)).

**Ecology models.**
- Seidl et al., "iLand", Ecol. Model. 231:87–100, 2012 ([PDF](https://andrewsforest.oregonstate.edu/pubs/pdf/pub4649.pdf), [code](https://github.com/edfm-tum/iland-model)).
- Pacala et al. 1996, Ecol. Monogr. 66:1–43 ([record](https://collaborate.princeton.edu/en/publications/forest-models-defined-by-field-measurements-estimation-error-anal/)).
- Fischer et al. 2016, Ecol. Model. 326:124–133 ([record](https://publications.goettingen-research-online.de/ID-40807)).
- Bugmann 2001, Climatic Change 51:259–305 ([PDF](https://link.springer.com/content/pdf/10.1023%2FA%3A1012525626267.pdf)).
- Strigul et al. 2008, Ecol. Monogr. ([record](https://zendy.io/title/10.1890/08-0082.1)).
- Purves et al. 2008, PNAS ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC2579370)).
- Rüger et al. 2020, Science 368:165 ([ForestGEO](https://forestgeo.si.edu/demographic-trade-offs-predict-tropical-forest-dynamics)).
- Smith et al. 2014, Biogeosciences 11:2027 ([record](https://lup.lub.lu.se/record/4392557)).
- Koven et al. 2020, Biogeosciences 17:3017 ([article](https://bg.copernicus.org/articles/17/3017/2020/)).
- ED2 ([code](https://github.com/EDmodel/ED2)); FATES ([code](https://github.com/NGEET/fates)).
- Barczi et al. 2008, Ann. Bot. 101:1125 ([record](https://publications.cirad.fr/une_notice.php?dk=544088)).
- Bailey 2019, Helios, Front. Plant Sci. ([article](https://www.frontiersin.org/article/10.3389/fpls.2019.01185/full)).
- OpenAlea ([article](https://publish.csiro.au/FP/fulltext/FP08084)).

**Measurement and scaling.**
- Eloy 2011, PRL ([arXiv 1105.2591](https://arxiv.org/pdf/1105.2591)).
- Eloy et al. 2017, Nat. Commun. 8:1014 ([PDF](https://www.nature.com/articles/s41467-017-00995-6.pdf)).
- Minamino & Tateno 2014, PLoS ONE 9:e93535 ([DOI](https://doi.org/10.1371/journal.pone.0093535)).
- Bentley et al. 2013, Ecol. Lett. 16:1069 ([PubMed](https://pubmed.ncbi.nlm.nih.gov/23800188/)).
- Lau et al. 2019, For. Ecol. Manage. 439:132 ([record](https://cifor-icraf.org/knowledge/publication/7312)).
- Seidel 2018, Ecol. Evol. 8:128 ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC5756834)).
- Seidel et al. 2019, Ecol. Evol. ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6662337)).
- Enquist, Brown & West 1998, Nature 395:163 ([record](https://experts.arizona.edu/en/publications/allometric-scaling-of-plant-energetics-and-population-density/)).
- Enquist, West & Brown 2009, PNAS 106:7046 ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC2678479)).
- Muller-Landau et al. 2006, Ecol. Lett. 9:589 ([PDF](https://faculty.lsu.edu/kharms/files/muller_landau_etal_2006_ecol_ltrs_589.pdf)).
- Farrior et al. 2016, Science 351:155 ([record](https://repository.si.edu/items/f7a65a0e-c7b5-4b9d-b25b-e296fdbdfb7a)).
- Weller 1987, Ecol. Monogr. 57:23 ([record](https://repository.si.edu/items/4b10966d-d8da-4581-ac3d-79ec8d9bd965)).
- Pretzsch & Biber 2005, For. Sci. 51:304 ([record](https://agris.fao.org/search/en/records/65df68844c5aef494fe27e52)).
- Asner et al. 2013, PLoS ONE 8:e60875 ([article](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0060875)).
- Kellner & Asner 2009, Ecol. Lett. 12:887 ([record](https://hilo.hawaii.edu/maunakea/library/ref/1805)).
- Vaughn, Asner & Giardina 2015, Ecosphere 6:271 ([PDF](https://par.nsf.gov/servlets/purl/10057540)).
- Reis et al. 2021, bioRxiv 10.1101/2021.05.03.442416 ([PDF](https://www.biorxiv.org/content/10.1101/2021.05.03.442416.full.pdf)).
- Leopold 1971, J. Theor. Biol. 31:339 ([USGS](https://pubs.usgs.gov/publication/70010394)).
- Whitney 1976 ([record](https://scilit.com/publications/90a6a1e025170136980a7a640fef528b)).
- Jucker et al. 2022, "Tallo", GCB 28:5254 ([record](https://research-information.bris.ac.uk/en/publications/tallo-a-global-tree-allometry-and-crown-architecture-database/)).
- Calders et al. 2018, Remote Sens. 10:933 ([DOI](https://doi.org/10.3390/rs10060933)).
- Griese, Ritzert & Nölke 2025, Sci. Data, BioDiv-3DTrees ([PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12712040/)).
- TreeQSM validation review ([Silva Fennica](https://silvafennica.fi/article/10550)).
