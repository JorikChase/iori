# 05 — Validation data and metrics

What the harness compares the engine against, how each number is computed, and how the comparison is kept honest. Rung names follow chapter 03 (R1 body 22 µm, G vein graph, R2 bricks, R3 lens grid). Everything here was checked on 2026-09-18 by web search, page fetch or repository API; **[unverified]** = could not be confirmed against a primary page (usually a paywall), **[proposal]** = a design value of this chapter. **Nothing was downloaded**: for the one large archive (§1.1) only the ZIP central directory (file names and sizes) and three README text files were read by HTTP range request.

## 1. Datasets of real *Physarum*

### 1.1 Slime Mold Graph Repository: the KIST Europe data set

The original site `smgr.mpi-inf.mpg.de` now 301-redirects to the Max Planck repository Edmond. The landing page sits behind an Anubis bot wall; the Dataverse API does not.

| Field | Value (verified via Edmond API and the ZIP directory) |
|---|---|
| Landing page | https://edmond.mpg.de/dataset.xhtml?persistentId=doi:10.17617/3.XWST2Q |
| Metadata API | `https://edmond.mpg.de/api/datasets/:persistentId/?persistentId=doi:10.17617/3.XWST2Q` |
| File | `KIST_Europe_data_set.zip`, **one file, 453 566 498 101 bytes (453.6 GB; 488 GB unpacked)**, MD5 `19faae94810a3a3719663d0a5f2153bc`, file id 310729 (`/api/access/datafile/310729` → presigned S3 URL that honours `Range`) |
| Licence | **CC BY 4.0** (API licence field and the archive's own README). Published on Edmond 2025-05-09, v1.0; authors T. Mehlhorn (KIST Europe), M. Dirnberger (MPI-INF). |
| Experiment | 81 identical runs, strain HU195×HU200, sclerotia crumbs lined along the short edge of a rectangular agar dish in a dark box; after ≈ 14 h (front ≈ 5 cm in) one top-view image every 120 s for ≈ 30 h. 54 series show proper network formation; 36 gave top-quality graph sequences; **3134 filtered graphs**. |
| Archive contents | 351 675 files. `raw_images/` 83 series folders, 52 301 JPG, 264 GB, median 5.1 MB per frame. `processed_images/` 53 series, 5362 ROI-cropped JPG, **9.4 GB**. `processed_graphs/` filtered + node-tracked graphs, 74 Python pickles (networkx), **0.79 GB** in two filter sets (`high`, `high_unfiltered`, 37 series each). `raw_graphs/` 142 GB (NEFI intermediate images + 10 727 graph txt). `graph_drawings/` 17 GB. `associated_results/` 19.8 GB (236 k plot PNG, CSV, SQLite). `tools/` filters, tracking and analysis scripts (Python). |
| Graph attributes | node x, y; edge length and width in pixels; node-tracking "color" property. |
| Pixel size, mm scale | **[unverified]**: not in the API text or READMEs; the 5 MB JPEGs suggest an ≈ 18 MP DSLR. The `documentation/` folder and the J. Phys. D paper (paywalled) should state dish size; read them first. |

Recommendation for approval: **do not take the 453 GB**. Because the S3 URL honours range requests and the central directory (79 MB) lists every member, `processed_graphs/` (0.8 GB), `tools/`, `documentation/` and `processed_images/` (9.4 GB) can be pulled selectively (e.g. with `remotezip`), ≈ 10 GB total. Raw series can be added one at a time (≈ 3–5 GB each). The pickles are Python-2-era networkx objects and may need `encoding='latin1'` and an old networkx **[unverified]**.

### 1.2 Other sources

| Source | Location | Size, format | Licence | Use |
|---|---|---|---|---|
| NEFI (Dirnberger, Neumann, Kehl 2015, arXiv:1502.05241; Sci. Rep. 5:15669) | https://github.com/05dirnbe/nefi (NEFI2); old site nefi.mpi-inf.mpg.de | Python 3.8, PyQt5, OpenCV, networkx; 903 commits, 25 open issues, unmaintained | **BSD-2-Clause** | Runnable only in a pinned Python 3.8 environment **[unverified on current macOS]**. Do not depend on it: re-implement its pipeline (Guo–Hall thinning → graph → width from DT) in the harness and check it against SMGR image/graph pairs. |
| Rosina & Grube 2025, J. R. Soc. Interface (viscosity, growth, fractal dimension) | Dryad doi:10.5061/dryad.0k6djhb9m | 730 MB total: `DensityViscosity.zip` 706.5 MB (sensor CSV, calibration images), **`GrowthFractalDimension.zip` 2.04 MB**, `Model-Files.zip` 21 MB (STL), drawings 0.3 MB, README | **CC0** (Dryad API). Code: Zenodo 10.5281/zenodo.13925272, MIT | Only the 2 MB archive matters: `FractalDimension.csv` (D every 60 s for 24 h, with slope, R², std error) and `growthResults.csv` (area in mm² vs time). **No plasmodium images.** |
| Lee, Fricker, Porter 2017 (J. Complex Netw.; arXiv:1406.5855): 270 fungal **and slime-mould** spatial graphs | https://www.cs.cornell.edu/~arb/data/spatial-fungi/ → Google Drive `fungal_networks.zip` | weighted graphs (conductance), no images; size **[unverified]** | none stated, "please cite" | Best ready-made graph ensemble after SMGR; ask Fricker/Porter for terms before redistribution. |
| Fricker *Physarum Network Analysis* app | markfricker.org → software → physarum-network-analysis | v1.1 (2017), 53 MB, Windows 64-bit, MATLAB Runtime 2017a; test images 45 MB | none stated | Reference for method (Fricker et al. 2017, J. Phys. D 50:254005), not a dependency. No macOS build. |
| Fricker *Fungal Network Analysis* app | Zenodo 10.5281/zenodo.5187933 (v1.0.0); latest 10.5281/zenodo.17218314 (v1.00.26, 2025-09-28) | `.mlappinstall` 48.6 MB (MATLAB ≥ 2024b) or Windows exe 403.5 MB (free Runtime); test images 17.7 MB | **CC BY 4.0** | Same. |
| **Rosina & Grube 2024** (R. Soc. Open Sci., doi:10.1098/rsos.240950) | Dryad doi:10.5061/dryad.79cnp5j4c | `Data.zip` **10.4 GB**: whole-dish images every 60 s for 24 h, then macro every 4 s for 1 h; growth, D, vein diameters | **CC0**; code MIT (zenodo.13954199) | The best small, public-domain image series. Zip contents not inspected. |
| Marbach, Ziethen, Bastin, Bäuerle, Alim 2023 (eLife 12:e78100) | mediaTUM doi:10.14459/2023mp1705720 (rsync; password on landing page) | **12 GB**, 1062 files: bright-field movies of 12 close-ups (0.25–0.35 µm/px) and 3 full networks (5.03 µm/px, 10 frames/min, ≈ 1 h), `.mat`, MATLAB code for vein diameter and flow extraction | **CC BY-SA 4.0** | Yes: vein-radius time series are published. Share-alike. |
| Other Alim-lab deposits (mediaTUM) | Tröger & Alim 10.14459/2024mp1734713; Schick, Kramar, Alim 10.14459/2024mp1733537; Chen & Alim 10.14459/2023mp1703653 | 332 GB (26 TIFF stacks, 4 min/frame over days, **10.8 µm/px**, 8 × 8 cm); 748 GB; 255 GB | CC BY 4.0; CC BY 4.0; CC BY-SA 4.0 | Whole-plasmodium migration and foraging with known scale. Take single stacks only. |
| Kramar & Alim 2021 (PNAS 118:e2007815118); Fleig et al. 2022 (eLife) | no deposit; SI movies only | MP4, 3–6 MB each | PNAS licence; eLife CC BY 4.0 | Numbers only. |
| PhysarumAI (Sakiyev 2026) | Zenodo 10.5281/zenodo.18411397 | 850 replicates, 86 food layouts, 12 × 12 cm dishes, 96 h endpoint photos + binary masks + adjacency matrices; size **[unverified]** | CC BY 4.0 | Food-source-mode T2 (MST ratio, FT) with ready graphs. Content not inspected. |
| Cellects validation set (Boussard … Dussutour) | Dryad 10.5061/dryad.7wm37pvzp | 7.9 GB growth sequences | CC0 | Area-growth curves. |
| Baumgarten, Ueda, Hauser 2010 (PRE 82:046113); Baumgarten & Hauser 2013 (Phys. Biol. 10:026003) | paywalled; no deposits | — | publisher | Numbers only (§3). |
| Tero et al. 2010 (Science 327:439) | author PDF on markfricker.org | — | publisher | Numbers only (§3); the 36-city fixture geometry must be re-digitised. |

### 1.3 Photographs and video: Wikimedia Commons, iNaturalist, GBIF

Commons has **one flat category**, https://commons.wikimedia.org/wiki/Category:Physarum_polycephalum, 108 files, no sub-categories (API audit 2026-09-18).

| Licence | Files | Note |
|---|---|---|
| CC BY-SA 4.0 | 57 | 55 by uploader "Tim Tim (VD fr)", incl. 8 videos |
| CC BY-SA 3.0 | 17 | Mushroom Observer imports; Heather Barnett stills (tag suspect: YouTube offers only CC BY) |
| CC BY 4.0 / 2.0 / 2.5 | 13 / 3 / 1 | iNaturalist imports, one PLOS figure, one Frontiers video, Flickr |
| CC0 | 9 | all field photos |
| Public domain | 8 | protein renders, a maze diagram: irrelevant |

97 stills, 2 GIF, 9 WebM. Only 4 videos show a real macroscopic plasmodium; **three are computer simulations** (`Physarum simulation.webm`, `Physarum-simulation.webm`, `Physarum-simulation-2.webm`) and must be kept out of any reference set. About 15 files are usable for agar-network validation. Best, by filename:

| File | Pixels | Licence | Content |
|---|---|---|---|
| `Physarum polycephalum exploration 2.jpg` | 9000² | CC BY-SA 4.0 | true top view, whole dish, veins linking ≈ 10 oat flakes; best still |
| `Physarum polycephalum exploration.jpg` | 9000² | CC BY-SA 4.0 | top view, dense dendritic network from a central mass |
| `Australian physarum polycephalum timelapse.webm` | 2160², 12.9 s | CC BY-SA 4.0 | top-view time-lapse, ≈ 10 h, clear vein hierarchy; best video |
| `Réseau veineux physarum polycephalum.jpg`, `… 2.jpg` | 1944² | CC BY-SA 4.0 | macro of trunk veins with polygonal fine mesh |
| `Slime mould (P. polycephalum).jpg` | 2873 × 2455 | **CC BY 2.0** | top view, sparse mature network, 4 oat clusters; best non-share-alike still |
| `Plant hairy root cultures … Physarum polycephalum - Video1.webm` | 916 × 1080, 28.8 s | **CC BY 4.0** (Ricigliano et al. 2015, Front. Microbiol.) | whole dish, paper-grade |
| `Timelapse of Slime Mould.webm` (Category:Slime mould) | 1280 × 720, 64 s | CC BY 3.0, review status **[unverified]** | front and coarsening; 4 frames/min stated, so real time is recoverable |
| `P. polycephalum islands.TIF` | 1050 × 633 | CC BY 4.0 (Mayne & Adamatzky, PLOS ONE) | the only file with a scale bar |

Avoid `Slime mold (NHGRI).jpg` (actually *Fuligo*), `Physarum polycephalum network.jpg` and `Habituation P. polycephalum.png` (derivatives of paper figures tagged "own work"). None of the stills states dish size, so mm/px rests on the 90 mm assumption.

**iNaturalist / GBIF caveats.** Licences are per photo, separate from the observation licence, and the default is CC BY-NC. iNaturalist has moved the species to *Badhamia polycephala* (391 observations): 56 have CC0/CC BY/CC BY-SA photos, 238 are CC BY-NC, 83 all rights reserved. GBIF ingests only research-grade records licensed CC0, CC BY or CC BY-NC; its *Physarum polycephalum* key (3214606; 1381 occurrences, 114 with stills) **misses every iNaturalist record**, which sit under the verbatim name "Badhamia polycephala". These are field photos on bark and leaf litter: texture colour reference at most, not T2/T3 data. CC BY-SA material may be used for testing but share-alike attaches to derivatives: keep it out of shipped assets and do not publish crops without attribution and the same licence.

## 2. Datasets for later organisms

| Dataset | Location | Size, format | Licence / access | Use |
|---|---|---|---|---|
| **AGAR** (Majchrowska et al. 2021, arXiv:2108.01234) | https://agar.neurosys.com/ | 18 000 dish photos, 336 442 annotated colonies, 5 species (*S. aureus, B. subtilis, P. aeruginosa, E. coli, C. albicans*), 4000 × 6000 and 2048² px, COCO-style JSON; GB **[unverified]** | **CC BY-NC 2.0, "freely available for academic research"**; full set behind a sign-up form (name, company, marketing consent). A demo zip is linked without a form. | Research-only. Usable for private T3 statistics of small round colonies; nothing derived from it may ship. Owner decision needed. |
| Pawłowski et al. 2022 (Sci. Rep. 12:5212) generator | https://github.com/jarek-pawlowski/microbial-dataset-generation | code + a 100-image AGAR-derived input zip | **no LICENSE file** (all rights reserved); inputs inherit CC BY-NC | Read for ideas only. |
| DIBaS (Zieliński 2017) | original URL 404; mirrors on Kaggle/GitHub | 660 images, 33 species, 2048 × 1532 | none stated | **Gram-stain microscopy, not colonies.** Skip. |
| ColTapp time-lapse (Bär et al.) | figshare 10.6084/m9.figshare.12951152.v1 | ≈ 19.5 GB, 25 zips, *S. aureus* plates over time | **CC BY 4.0** | Best open colony time-lapse: radial growth curves, colony-size distributions. |
| *B. subtilis* colony biofilm time-lapse (Porter, Stanley-Wall 2022) | BioStudies S-BIAD474 | size **[unverified]** | dataset licence **[unverified]**; paper CC BY | Wrinkle development. |
| *V. cholerae* wrinkling (Yan et al. 2019, eLife 8:e43920) | article videos 1–6 | MP4, 72–75 h, 0.4–1.0 % agar | CC BY 4.0 (eLife default) | Wrinkle wavelength vs agar stiffness. Fei et al. 2020 PNAS: code only, no licence. |
| Biofilm topographies (Bravo/Yunker) | Dryad 10.5061/dryad.pg4f4qrsw | 762 MB, interferometry height maps, 7 species, 10 min–14 d | CC0 (Dryad default) **[unverified]** | Colony height profiles for the 2.5-D body. |
| *P. aeruginosa* 69-strain morphology (Rattray 2023, PLOS CB) | github.com/GaTechBrownLab/Rattray-2023-PLOSCompBio | 335 downsized images | repo licence **[unverified]** | Morphology variety. |
| Ben-Jacob lab patterns (*P. dendritiformis*, *P. vortex*) | Commons categories of those names | 3 + 11 files incl. 5 OGV | CC BY-SA 3.0; BMC-derived items CC BY 2.0 | No institutional archive exists. Images are false-coloured density maps. |
| Matsushita/Wakita morphology diagram | closed papers only | — | publisher | Redraw from published axes; used as T1 #11. |
| **MyceliumSeg** (Sci. Data 2025) | Zenodo 10.5281/zenodo.15224240 | **56.6 GB**, 20 176 JPG at 4608 × 3456 of 90 mm dishes, 4 species, full growth cycle, 567 masks | Zenodo record CC BY 4.0 (article says BY-NC-ND: conflict, record governs) | Best mycelium petri-dish set. |
| AMF travelling-wave networks (Oyarte Galvez et al. 2025, Nature 639:172) | figshare 10.6084/m9.figshare.27889143.v1 | 8.24 GB, notebooks + one example plate | CC BY 4.0 | Hyphal network growth laws. |
| Fricker fungal graphs | Cornell spatial-fungi zip (§1.2); Aguilar-Trigueros et al. 2022 at github.com/aguilart/Fungal_Networks | graph matrices, 12 species × 3 | none stated | Graph-level targets. |
| Bebber et al. 2007 (Proc. R. Soc. B 274:2307) | PMC2288531; no raw data | — | — | Targets: *Phanerochaete velutina*, day 39: 697 ± 145 nodes, 883 ± 234 links; **α = 0.11 ± 0.04 (control), 0.20 ± 0.05 (baited)**; robustness tracks the Delaunay graph until ≈ 40 % of link area is removed. Check efficiency values against the paper's Table 1 before use. |

## 3. Target numbers

Checked 2026-09-19. **read** = full text read (open PDF, PMC, eLife); **abstract** = only the abstract or an indexed snippet was readable (APS paywall; IOP bot wall, not circumvented). Background is in chapter 01, cited as "01 §n". Harness bands are **[proposal]**.

### 3.1 Static morphometrics (T2)

| Quantity | Value, conditions | Source | Harness band |
|---|---|---|---|
| Node degree | "exclusively nodes of degree 3"; free extension, plain agar, network zone, up to 62 000 s | Baumgarten, Ueda, Hauser 2010 (abstract) | f₃ ≥ 0.90 after the SMGR "high" filter |
| | mean degree **2.65**, E ≈ 1.35 V; 90 mm dish, 1 % agar, 25 °C, dead ends kept, ≥ 40 replicates per substrate | Patino-Ramirez, Arson, Dussutour 2021 (read) | dead ends kept: 2.6–2.8, i.e. f₃ ≈ 0.83 if only degrees 1 and 3 occur **[derived]** |
| | degree histogram of 1998 SMGR graphs | Dirnberger & Mehlhorn 2017 | **[unverified]**; recompute from `processed_graphs/` (§1.1) |
| Segment length | exponential (2010 abstract); log-normal (Baumgarten, Jones, Hauser 2015, read, citing the 2010 paper); log-logistic (Patino-Ramirez 2021) | — | **sources disagree on the form**; parameters **[unverified]**. Gate on shape only: right-skewed, mode < mean, CV ≥ 0.7 |
| Vein width | log-normal and "narrow" at every coarsening stage; 1 % plain agar, 21 °C, 45.6 µm/px. Log-logistic in Patino-Ramirez 2021 | Baumgarten 2010; 2015 | log-normal not rejected (KS) and preferred to normal by AIC; µ, σ **[unverified]**: fit them from SMGR widths. Support: radii 5–70 µm (01 §2.2) |
| Loop (face) area | exponential | Baumgarten 2010 (abstract) | linear on semi-log axes over ≥ 1 decade; mean **[unverified]** |
| α (meshedness) | planar cubic ceiling 0.25 (§4.2 #7); E = 1.35 V gives α ≈ 0.18 **[derived]**; "non-informative" between substrates (Patino-Ramirez 2021) | — | 0.15–0.25, pruning stated. No published *Physarum* α with error bars was found; fungi 0.11–0.20 (§2) |
| Hierarchy, efficiency | thick principal cycles enclose nested, less efficient cycles | Baumgarten & Hauser 2013 (abstract) | betweenness–width ρ > 0; no scalar published |
| Murray exponent | x in r₀ˣ = Σrᵢˣ: **2.53–3.29** at branches of evacuation trees; predicted current, speed and shear scale with radius as Murray predicts | Akita et al. 2017; Fricker et al. 2017 (abstracts) | 3.0 ± 0.4, tree-like drains only; fills the **[unverified]** in 01 §2.2. Not a target for loopy meshes, where shear is not uniform (Marbach 2023) |
| Percolation | fusing microplasmodia form one giant component; exact configuration-model solution | Fessel et al. 2012 (abstract) | Molloy–Reed ⟨k²⟩/⟨k⟩ = 2, i.e. n₃/n₁ = 1/3, mean degree 1.5 for a degree-1/3 mix **[derived]**; measured critical values **[unverified]** |

### 3.2 Tero et al. 2010 (read, author PDF)

36 food sources, arena 17 cm wide, read at 26 h. FT = 1 − fraction of single-link faults that isolate a part. Tero's "α" = FT/TL_MST is a benefit/cost ratio, not meshedness.

| Network | TL_MST | MD_MST | FT | FT/TL_MST |
|---|---|---|---|---|
| *Physarum* (n = 21) | 1.75 ± 0.30 | 0.85 ± 0.04 | 0.86 ± 0.04 illuminated; 0.80 ± 0.13 unconstrained | ≈ 0.5 |
| Tokyo rail | ≈ 1.8 | 0.85 | 0.96 | ≈ 0.5 |
| Model, I₀ = 2, γ = 1.8 | — | 0.85 | — | 0.7 |
| MST; Delaunay | 1; ≈ 4.6 | 1; lowest | — | — |

Model I₀ = 0.20, γ = 1.15 gives "remarkably similar topology and metrics" to the rail network (numbers only in fig. S2). *Physarum* keeps ≈ 30 % of the maximum possible links.

### 3.3 Fractal dimension and lacunarity

| Condition | D (box counting on the mask) | Source |
|---|---|---|
| 24 °C, 0–50 mM MgCl₂ (substrate viscosity), n = 5–15 | noise phase to 2.5 h, adaptation to 15.5 h, then **≈ 1.533 in every condition** | Rosina & Grube 2025 (read); per-minute CSV, §1.2 |
| 20–22 °C, 1.2 % agar, 92 mm dish, oats | control rises for the whole 24 h; starved: overshoot within 6 h, then ≈ **1.4** | Rosina & Grube 2024 (read) |
| nutrient × agar morphology diagram | D, circularity, flatness measured; values **[unverified]** | Takamatsu et al. 2009 (abstract) |

Disagreement: a plateau in 2025, a still-rising control in 2024. Neither paper states the ε range in the text read, so compare only after recomputing both with §4.2 #1. Band: D_mask 1.45–1.60 fed, 1.35–1.45 starved, ± 0.05. **Lacunarity: no published *Physarum* value was found**; the reference must be measured from SMGR and Rosina images, and stays a held-out row (§7).

### 3.4 Dynamics

| Quantity | Value | Source |
|---|---|---|
| Front speed | 1–10 mm/h default, up to 20–40 mm/h (01 §2.4). SMGR: ≈ 5 cm in ≈ 14 h = 3.6 mm/h **[derived]**. Area × 4 in 10 h on neutral agar, 21–26 h on nutritive or adverse agar | 01; §1.1; Patino-Ramirez 2021 |
| Coarsening behind the front | vein count N = N₀e^(−αt), one process (α = 7.69 per normalised time t/t_max); ⟨l⟩ grows almost linearly in time; **⟨l⟩ ∝ N^−0.35**; mean width constant. 12 cm dish, 1 % plain agar, 21 °C, 3.5 × 2.6 cm window | Baumgarten, Jones, Hauser 2015 (read) |
| | single veins vanish in 15–40 min; avalanches clear a region in < 15 min; 80 of 200 veins shrinking, 100 stable | Marbach et al. 2023 (read); 01 §2.6 |
| | mesh size against distance from the front | **[unverified]**: no number found; measure on SMGR |
| Contraction period | 100 s (60–130); 131 ± 43 s over one network; 2.0 / 1.5 / 1.2 min at 16 / 20 / 24 °C, so Q₁₀ ≈ 1.9 **[derived]** | 01 §3.1 |
| Vein adaptation | shear-to-radius delay 1–3 min (mean 2); t_adapt 10–100 min; radii 5–70 µm | Marbach 2023 (read); 01 §3.5 |
| Global reorganisation | ≈ 45 min after a stimulus; one peristaltic wavelength per organism | Alim 2013; Kramar & Alim 2021; 01 §3.3, §3.5 |

Smooth exponential decay of N and minute-scale avalanches are not in conflict: the first is a 3 cm window average, the second single-vein resolution. The engine must show both.

### 3.5 The most trustworthy five: gate on these first

1. **Tero triple on the 36-city fixture: 1.75 ± 0.30, 0.85 ± 0.04, 0.86 ± 0.04.** Read from the paper, with errors and n; the protocol is exact (§4.2 #9–10) and insensitive to thresholds.
2. **Contraction period 100 s (60–130) and its temperature slope.** Reproduced by many laboratories over 50 years; cheap to measure.
3. **Adaptation times: delay 1–3 min, t_adapt 10–100 min, vein death 15–40 min.** Open paper, and the raw radius series are public (§1.2), so the band can be re-measured.
4. **f₃ ≥ 0.90 after the SMGR filter.** Two groups agree once pruning is accounted for, and 3134 SMGR graphs can confirm it; α follows from it.
5. **Coarsening invariants: N falls monotonically, ⟨l⟩ ∝ N^−0.35 ± 0.1, mean width constant, widths log-normal.** Open paper with stated scale and temperature; tests the history rather than the last frame.

Not gates yet: D (method-bound), length-distribution form (three sources, three forms), α, lacunarity, Murray exponent (abstract only, trees only).

## 4. Metric definitions

### 4.1 Canonical preprocessing (the protocol every metric shares)

Simulated density and photographs go through the *same* code path; thresholds are fixed by protocol, never tuned per image.

1. **Scale.** Resample to s₀ = 22 µm/px (= R1) for T2 and 44 µm/px for T3 **[proposal]**. Photo scale comes from a scale bar, else from the dish inner diameter (assume 86 mm for a "90 mm" dish and record the assumption). A photo with no recoverable scale is T3-diagnostic only.
2. **Channel.** Physarum is yellow on a neutral ground, so use optical density of the blue channel, OD = −log₁₀(B / B_bg). The engine renders the same OD channel directly from biomass thickness (chapter 04), bypassing lighting.
3. **Flat-field.** B_bg = morphological closing (disc r = 1.5 mm) followed by a Gaussian (σ = 3 mm). Mask everything outside the dish wall minus 2 mm (meniscus band).
4. **Mask.** M = OD > Otsu(OD inside the dish mask); remove components < 16 px; fill holes < 9 px. The harness additionally reports every T2 metric at 0.8× and 1.25× the Otsu threshold; a metric whose value moves by more than its tolerance across that band is flagged *threshold-fragile* for that run.
5. **Region.** "Network zone" = mask pixels further than 3 mm behind the front (the SMGR authors likewise exclude the apical zone). Front zone = the rest.

### 4.2 Metrics

Where: **GPU** = cheap enough for the in-page live panel; **PY** = offline Python (scikit-image, networkx, skan), authoritative for the scorecard. Cost is for a 4096² frame.

| # | Metric | Definition / protocol | Cost, where | Sensitivity |
|---|---|---|---|---|
| 1 | Box-counting D | N(ε) = boxes of side ε touching M; ε = 2^k px from ε_min = 2 × median vein width to ε_max = L_ROI/4; min N over 16 grid offsets; OLS slope of log N vs log(1/ε); require ≥ 5 octaves and R² ≥ 0.995; also report local slopes. | GPU (mip-style OR-reduction), ms | High. Below the vein width the set is 2-D (slope → 2); above the mesh size a homogeneous net also → 2; beyond the colony → 0. Finite-width networks have at most ~1.5 decades of true scaling. Always report D_mask and D_skeleton and the fit range. Never compare a D obtained with a different ε range. |
| 2 | Mass–radius D | M(r) ∝ r^D, sandbox average over 200 random on-mask centres; r from 4 × vein width to 0.4 × R_front. | GPU/PY, ms | Medium; centre choice and edge truncation. More robust than #1 for radial colonies. |
| 3 | Lacunarity | Gliding box: Λ(r) = ⟨m²⟩/⟨m⟩² = 1 + var/mean² of box mass over all positions; r = 2^k px; report the curve, Λ(1 mm), and slope of log Λ vs log r. | GPU (summed-area table), ms | Low–medium; depends on mask fill fraction, so compare at matched fill or report Λ normalised by 1/fill. |
| 4 | Skeleton | PY reference: Guo–Hall thinning (the NEFI default, so graphs are comparable with SMGR) or skimage `skeletonize` (Zhang 1984); `medial_axis` when widths are needed in one pass. GPU live: jump-flood distance transform (⌈log₂ 4096⌉ = 12 passes) + ridge test (DT local maximum along ∇DT, or divergence of nearest-seed vectors > 60°), then two constrained Zhang–Suen passes to reach 1 px. | PY 1–3 s; GPU ≈ 15 stencil passes | Zhang–Suen/Guo–Hall: spur-prone on noisy edges, 8-connected, no width. Medial axis: width for free but more spurs. JFA: approximate DT (errors ≤ 1 px), ridge not guaranteed connected, hence live-only. |
| 5 | Graph + pruning | Nodes = skeleton pixels with ≠ 2 neighbours, junction clusters merged within the local DT radius; edges traced (skan / sknw). Pruning = SMGR "high" filter: drop edges not on a cycle, contract edges < 30 px (SMGR pixels; ≈ the same in mm once its scale is known), smooth degree-2 nodes, keep the largest component. A second variant keeps dead ends but removes spurs shorter than 2 × local width. | PY, 1–5 s | High: degree statistics are decided by the contraction length. Fix it in mm. The engine's native graph G must agree with the skeleton graph of its own render (node count ± 5 %) or G may not be used for T2. |
| 6 | Vein width | w(e) = 2 × median DT along the edge, excluding pixels within one junction radius of either end. | PY/GPU | ± 1 px bias; veins < 5 px are untrustworthy (SMGR drops them). At 22 µm/px that is 110 µm. |
| 7 | α, β, γ | α = (E − V + 1)/(2V − 5); β = E/V; γ = E/(3(V − 2)). | trivial | A planar all-degree-3 graph has E = 3V/2, so α → 0.25, β = 1.5, γ → 0.5 exactly. Lower values measure dead ends and degree-2 artefacts, so α depends on pruning (#5). |
| 8 | Global / local efficiency | E_glob = ⟨1/d_ij⟩ over node pairs, d = shortest path by length (or by hydraulic resistance L/w⁴); normalise by the Euclidean ideal. Local = mean E_glob of each node's neighbourhood subgraph. | PY, O(V·E log V): ~10 s for V = 10⁴; sample 500 sources above that | Low once the graph is fixed. |
| 9 | MST ratio | TL/TL_MST. Food-source mode (Tero): MST over the Euclidean complete graph on the food sources. Free-growth mode: MST of the extracted graph itself (cost of redundancy). Also MD/MD_MST, MD = mean shortest path between food sources. | PY, ms | Low. |
| 10 | Fault tolerance | Tero protocol: FT = probability that no food source is isolated when one edge fails, failure probability ∝ edge length. Exact: FT = 1 − Σ length(bridges separating food sources)/TL, bridges by Tarjan in O(V+E). Extension: k = 2, 5 % random failures by Monte Carlo (10³ draws). | PY, ms | Low; but needs food sources. In free growth use "largest component fraction after 5 % length removed". |
| 11 | Betweenness–width | Spearman ρ between edge betweenness (length-weighted) and width. | PY, O(V·E) | Low. Directional target only (ρ > 0). |
| 12 | Loop areas; hierarchical decomposition | Faces = connected components of the mask complement inside the network zone; area distribution, CV, tail. Katifori–Magnasco: repeatedly delete the thinnest edge between two faces, merging them; the merge history is a binary tree; report Strahler bifurcation ratio, tree asymmetry, cumulative subtree-size distribution. | labelling GPU/PY ms; tree PY O(F log F) | Medium: small faces vanish with resolution; count only faces > 25 px. Needs widths (#6). |
| 13 | Persistent homology (optional) | Cubical sublevel filtration of −OD; H₀/H₁ diagrams; compare by sliced Wasserstein between diagrams (GUDHI, cripser). | PY, 5–30 s | Threshold-free, which is its whole value: use it to audit threshold-fragile runs. |
| 14 | Front roughness | Front h(x, t) (strip geometry, line inoculum as in SMGR) or r(θ, t); W(ℓ, t) = rms of h in windows ℓ; α from W ∝ ℓ^α, β from W ∝ t^β. | GPU/PY ms | Overhangs must be resolved by taking the outermost crossing. Radial geometry stretches the front and biases β; use strips for exponents. |
| 15 | Radial density profile | ρ(r/R_front), annular mean of OD. | GPU | Low. |
| 16 | Power spectrum | Radially averaged \|FFT(OD)\|² with Hann window; slope over k ∈ [4/L, 1/(2w)]; peak position = mesh scale. | GPU/PY ms | Low; scale matching is essential. |
| 17 | Orientation field | Structure tensor (σ = 2 × vein width): coherence, and nematic order relative to the radial direction S = ⟨cos 2(θ − θ_r)⟩. | GPU | Low. |

## 5. T3: statistical image comparison for chaotic growth

Two dishes grown from the same protocol never align pixel for pixel, so T3 compares *distributions of local appearance* between an ensemble of simulated dishes and an ensemble of photographs.

| Candidate | What it compares | Verdict |
|---|---|---|
| VGG-19 Gram (style) distance (Gatys 2015) | second moments of features, position-free | Works, cheap, but blind to everything beyond second order. Kept inside the primary as a fallback term. |
| **Sliced Wasserstein on VGG features** (Heitz et al., CVPR 2021) | full feature distributions per layer via random 1-D projections | **Primary.** Captures the complete feature statistics, no alignment, O(n log n) per projection. |
| Steerable-pyramid / Portilla–Simoncelli statistics (710 parameters at 4 scales × 4 orientations) | marginals, cross-scale and cross-orientation correlations; phase-free | **Diagnostic 1**, with the power spectrum (#16): network-free, interpretable ("too little energy at the 1 mm band"), can run in-page. |
| KID on patches (Bińkowski 2018) | MMD between patch-feature ensembles | **Diagnostic 2.** Has an unbiased estimator, so it is usable at 1–2 k patches per side with bootstrap CIs. |
| FID on patches | Fréchet distance of Gaussian fits | No. Biased at finite N, the bias is model-dependent (Chong & Forsyth 2020), and the customary 50 k samples is out of reach with a few dozen licensed photographs. |
| LPIPS, SSIM, MSE | features or pixels *at corresponding positions* | No. Full-reference metrics: two real dishes score as badly against each other as against a wrong simulation. |

**Protocol.** (1) §4.1 preprocessing to the OD channel at 44 µm/px; standardise OD to zero mean, unit variance inside the mask. (2) 256² patches (11 mm), random rotation and flip, stratified by r/R_front into front, mid and core so that like is compared with like. (3) Features from VGG-19 relu1_1…relu4_1 (the Oxford weights are CC BY 4.0). (4) The score is an energy-distance ratio: T3 = SWD(sim, real) / SWD(real, real′), where the denominator is the mean distance between disjoint halves of the reference set. T3 ≈ 1 means the engine is inside photograph-to-photograph variability; this self-normalises for camera and lighting differences that survive step 1. (5) Minimum sizes: ≥ 12 reference photographs from ≥ 3 independent sources, ≥ 8 simulated dishes, ≥ 1000 patches per side for KID.

## 6. T1: known-answer tests

Tolerances assume the stated resolution; each test states its own.

| # | Test | Setup | Expected | Tolerance |
|---|---|---|---|---|
| 1 | Diffusion Green's function | Point mass, 2-D, no decay | c = M/(4πDt)·exp(−r²/4Dt); ⟨r²⟩ = 4Dt | ⟨r²⟩ ± 1 % once σ ≥ 4 px and before the wall; axis/diagonal variance ratio 1 ± 0.005 (stencil isotropy) |
| 2 | Mass conservation | Closed dish, all transport on, reactions off | Σc constant | relative drift < 10⁻⁵ per 10⁴ steps (sum in f64 on readback) |
| 3 | Decay | Uniform field, rate k | c₀e^(−kt); explicit Euler gives exactly (1 − kΔt)ⁿ | 10⁻⁶ against the discrete form |
| 4 | Fisher–KPP front | 1-D strip, front width √(D/r) ≥ 4 px | c* = 2√(Dr); Bramson: c(t) = c*·(1 − 3/(4rt)) | ± 2 % at rt ≥ 50 after the correction; radial runs subtract D/R |
| 5 | DLA | Off-lattice or noise-reduced, ≥ 10 clusters, N ≥ 10⁵ | D = 1.71 (large-scale off-lattice: 1.712 ± 0.003) from R_g ∝ N^(1/D) | ± 0.02; ± 0.05 if N = 10⁴. Square-lattice anisotropy appears above ~10⁶ |
| 6 | Eden / KPZ | Strip, L ≥ 1024, ≥ 20 runs | β = 1/3, α = 1/2, z = 3/2 | β ± 0.03, α ± 0.05; strong corrections to scaling below L = 512 |
| 7 | Laplacian growth (DBM) η sweep | φ solved to 10⁻⁴, growth ∝ \|∇φ\|^η | D = 2 (η = 0), 1.71 (1), 1.43 (2), 1.26 (3), ≈ 1.13 and falling to 1 (η ≥ 4; Hastings 2001) | monotone; each ± 0.05 |
| 8a | Tero, μ = 1, maze | f(Q) = \|Q\|, decay 1, one source, one sink | surviving tubes = Dijkstra shortest path | off-path D < 10⁻³ D_max at t = 50; path identical |
| 8b | Tero, ring with two paths L₁ < L₂, fixed total flux | μ = 1: D₂ ∝ exp(−(1 − L₁/L₂)t). μ < 1: both survive, D₁/D₂ = (L₂/L₁)^(μ/(1−μ)), Q₁/Q₂ = (L₂/L₁)^(1/(1−μ)). μ > 1: bistable, winner set by the initial ratio | rate and ratios ± 1 % |
| 9 | Poiseuille (R3 lens grid) | Steady pressure-driven flow, ≥ 16 cells across | slit: u_max/ū = 3/2, Q = h³ΔP/(12ηL); tube: u_max/ū = 2, Q = πR⁴ΔP/(8ηL) | profile L2 < 2 %; Q ± 2 %; Q ∝ R⁴ slope 4 ± 0.05 |
| 10a | Oscillator synchronisation | Kuramoto, all-to-all, Lorentzian width γ, N ≥ 10⁴ | K_c = 2γ; r = √(1 − K_c/K) | r ± 0.03 for K ≥ 1.5 K_c |
| 10b | Phase-wave speed | φ_t = ω + a∇²φ + b(∇φ)², pacemaker at ω + Δω | k = √(Δω/b); v = (ω + Δω)/k | ± 5 % |
| 11 | Morphology diagram | Colony model on a 5 × 5 grid of nutrient × agar hardness | five Matsushita regions: A DLA-like (D ≈ 1.7), B Eden-like (compact, rough), C concentric rings, D smooth disc, E dense branching | ≥ 4 of 5 region centres classified correctly by (D, front roughness, ring periodicity); D monotone in nutrient |

Notes. Tests 8a/8b use the 2007 form f = \|Q\|^μ; the 2010 sigmoidal form f = Q^γ/(1 + Q^γ) keeps both ring paths alive at high flux and needs its own fixture. The 8b results follow from the steady state D_i = \|Q_i\|^μ with Q_i = D_iΔp/L_i. Real *B. subtilis* colonies give α ≈ 0.78 in region B and ≈ 0.50 in region D (Wakita et al. 1997), so α = 1/2 is a test of the *kernel*, not of the organism.

## 7. T5: evolution

**Objectives.** Minimise a vector, never a single scalar: (z_topology, z_width, z_fractal, z_dynamics, T3, cost_ms), where each z is the root-mean-square of the §3 z-scores in that family, z = (value − target)/tolerance. Performance is a constraint first (frame budget from chapter 03: reject genomes over budget) and an objective second.

**CMA-ES** for local refinement of continuous parameters. Default λ = 4 + ⌊3 ln n⌋: 12 for n = 20, 15 for n = 50; use 2λ because the objective is noisy. At ≈ 60 s per dish and 3 seeds, one generation of 24 genomes is 72 dish-minutes; 150 generations ≈ 180 h serial. Hence: a 10 s proxy dish (R1 only, 1024², 20 mm arena) for the first 80 % of generations, full dishes only for re-ranking the top quartile, and 4–8 dishes batched per GPU.

**MAP-Elites** for coverage of morphologies and for algorithm-structure genes. Behaviour descriptors **[proposal]**: D_mask (1.3–2.0) × α (0–0.25) × median vein width / mesh size (0.02–0.5), none of which is a fitness term's exact twin. Use CVT-MAP-Elites with 512 niches rather than a 10³ grid; 2 × 10⁴ proxy evaluations ≈ 56 h serial, under 10 h batched. Fitness inside a niche = −‖z‖ over the metrics that are *not* descriptors.

**Noise.** Each genome is scored on k = 3 seeds (median); elites are re-evaluated with 3 fresh seeds whenever challenged; the top 5 % get k = 8. The seed-to-seed standard deviation of every metric is recorded and becomes the floor of its tolerance.

**Gaming.** (1) Held-out metrics: persistent homology, loop-tree asymmetry, lacunarity slope and the KID diagnostic never enter any objective; divergence between trained and held-out scores is reported per generation. (2) Threshold-fragile results (§4.1) score zero. (3) T1 must still pass for an evolved genome: physics cannot be traded for looks. (4) Casebook review: the 12 best and 12 most novel elites per run are rendered to a contact sheet beside reference photographs for a human to accept or reject; rejected elites become negative cases with a written reason.

**Reproducibility.** Same device, same build, same seed: the state hash after N steps must match bit for bit (a) across two runs, (b) when the test list is executed forwards and reversed (no leaked state), and (c) when agent dispatch order is reversed (deposits are order-independent only if they go through atomics or sorting, chapter 03). Across devices only metric-level agreement within tolerance is required, since WGSL does not fix floating-point rounding across drivers.

## 8. Scorecard

One table per engine version, printed by the harness; rows abbreviated here.

| Tier | Row | Target | Tolerance | Value | Pass |
|---|---|---|---|---|---|
| T0 | kernel unit tests | all | — | n/n | gate |
| T1 | 13 known-answer rows of §6 | as listed | as listed | … | gate |
| T2 | fraction of degree-3 nodes | ≥ 0.90 | — | … | … |
| T2 | α (SMGR-filtered) | §3 | §3 | … | … |
| T2 | width log-normal σ; length distribution form | §3 | §3 | … | … |
| T2 | D_mask, D_skel (network zone), lacunarity Λ(1 mm) | §3 | ± 0.05 | … | … |
| T2 | TL_MST, MD_MST, FT on the 36-city fixture | 1.75, 0.85, 0.86 | ± 0.30, ± 0.04, ± 0.04 | … | … |
| T2 | Murray exponent; betweenness–width ρ | 3; > 0 | §3 | … | … |
| T2 | front speed, contraction period, coarsening exponent | §3 | §3 | … | … |
| T3 | SWD ratio (front / mid / core) | 1.0 | ≤ 1.5 | … | … |
| T3 | spectrum slope, mesh-scale peak; KID | ref. | CI overlap | … | diag. |
| T4 | ms per step, ms per frame, memory, per device tier | ch. 03 budgets | — | … | gate |
| T5 | seed std of each metric; held-out gap; bit-exact replay | — ; < 1 z; exact | — | … | gate |

**PETRI score [proposal]** = 100 × G × (0.40·S_T2 + 0.25·S_T3 + 0.15·S_dyn + 0.10·S_T4 + 0.10·S_rob), each S ∈ [0, 1].

| Term | Computation | Protects against |
|---|---|---|
| G (gate) | 1 if T0, T1 and replay pass, else 0.5 | good-looking engines with wrong physics or hidden nondeterminism |
| S_T2 | mean of exp(−z²/2) over static morphometric rows | networks that look right but have the wrong topology, widths or cost |
| S_T3 | exp(−max(0, T3 − 1)) averaged over strata | right graph statistics but wrong appearance (texture, fans, sheath) |
| S_dyn | front speed, period, coarsening exponent, as S_T2 | a correct final frame reached by the wrong history |
| S_T4 | min(1, budget/actual) on the weakest supported tier | accuracy bought with frame time |
| S_rob | 1 − (threshold-fragile + seed-unstable rows)/rows, times the held-out agreement | metric gaming and results that hold for one seed or one threshold |

The headline is for trend lines only; release decisions read the table.

## Sources

Data and tools
- SMGR / KIST Europe data set: https://doi.org/10.17617/3.XWST2Q ; API `https://edmond.mpg.de/api/datasets/:persistentId/?persistentId=doi:10.17617/3.XWST2Q` ; paper Dirnberger, Mehlhorn, Mehlhorn, J. Phys. D 50:264001 (2017), https://doi.org/10.1088/1361-6463/aa7326
- NEFI: https://arxiv.org/abs/1502.05241 ; https://github.com/05dirnbe/nefi
- Rosina & Grube Dryad: https://doi.org/10.5061/dryad.0k6djhb9m
- Fricker software: https://markfricker.org ; https://doi.org/10.5281/zenodo.5187933 ; https://doi.org/10.5281/zenodo.17218314 ; Fricker et al. 2017, J. Phys. D 50:254005
- Spatial fungi and slime-mould graphs: https://www.cs.cornell.edu/~arb/data/spatial-fungi/ ; https://arxiv.org/abs/1406.5855
- Commons: https://commons.wikimedia.org/wiki/Category:Physarum_polycephalum ; iNaturalist licence help https://help.inaturalist.org/en/support/solutions/articles/151000175695 ; GBIF iNaturalist dataset https://api.gbif.org/v1/dataset/50c9509d-22c7-4a22-a47d-8c48425ef4a7
- AGAR: https://agar.neurosys.com/ ; https://arxiv.org/abs/2108.01234 ; Pawłowski: https://doi.org/10.1038/s41598-022-09264-z ; https://github.com/jarek-pawlowski/microbial-dataset-generation
- DIBaS: https://doi.org/10.1371/journal.pone.0184554 ; ColTapp: https://doi.org/10.6084/m9.figshare.12951152.v1 ; S-BIAD474: https://www.ebi.ac.uk/biostudies/studies/S-BIAD474 ; Yan et al.: https://doi.org/10.7554/eLife.43920 ; Bravo/Yunker: https://doi.org/10.5061/dryad.pg4f4qrsw ; Rattray: https://doi.org/10.1371/journal.pcbi.1011699
- MyceliumSeg: https://doi.org/10.5281/zenodo.15224240 ; AMF networks: https://doi.org/10.1038/s41586-025-08614-x , https://doi.org/10.6084/m9.figshare.27889143.v1 ; Bebber et al. 2007: https://doi.org/10.1098/rspb.2007.0459 ; Aguilar-Trigueros et al. 2022: https://doi.org/10.1038/s43705-021-00085-1

Target numbers
- Tero et al. 2010, Science 327:439: https://doi.org/10.1126/science.1177894 (author PDF: https://markfricker.org/wp-content/uploads/2015/12/tero_et_al-2010-science-327-439.pdf)
- Baumgarten, Ueda, Hauser 2010: https://doi.org/10.1103/PhysRevE.82.046113 ; Baumgarten & Hauser 2013: https://doi.org/10.1088/1478-3975/10/2/026003
- Fessel et al. 2012: https://doi.org/10.1103/PhysRevLett.109.078103
- Baumgarten, Jones, Hauser 2015, Acta Phys. Pol. B 46:1201 (coarsening kinetics, open access): https://doi.org/10.5506/APhysPolB.46.1201
- Dirnberger & Mehlhorn 2017, J. Phys. D 50:224002 (1998 SMGR graphs; full text not readable): https://doi.org/10.1088/1361-6463/aa6e7b
- Patino-Ramirez, Arson, Dussutour 2021, Sci. Rep. 11 (substrate and fusion effects on network dynamics): https://doi.org/10.1038/s41598-020-80320-2 ; https://pmc.ncbi.nlm.nih.gov/articles/PMC7810851/
- Akita et al. 2017, J. Phys. D 50:024001 (Murray's law): https://doi.org/10.1088/1361-6463/50/2/024001 ; Fricker et al. 2017, J. Phys. D 50:254005: https://doi.org/10.1088/1361-6463/aa72b9
- Takamatsu, Takaba, Takizawa 2009, J. Theor. Biol. 256:29: https://doi.org/10.1016/j.jtbi.2008.09.010
- Rosina & Grube 2025, J. R. Soc. Interface 22:20240720: https://doi.org/10.1098/rsif.2024.0720 ; https://pmc.ncbi.nlm.nih.gov/articles/PMC11879620/ ; Rosina & Grube 2024, R. Soc. Open Sci. 11:240950: https://doi.org/10.1098/rsos.240950 ; https://pmc.ncbi.nlm.nih.gov/articles/PMC11528663/
- Alim et al. 2013, PNAS 110:13306: https://doi.org/10.1073/pnas.1305049110 ; Kramar & Alim 2021, PNAS 118:e2007815118: https://doi.org/10.1073/pnas.2007815118 ; https://pmc.ncbi.nlm.nih.gov/articles/PMC7958412/
- Marbach, Ziethen, Bastin, Bäuerle, Alim 2023, eLife 12:e78100: https://doi.org/10.7554/eLife.78100 ; data https://doi.org/10.14459/2023mp1705720
- Period against temperature, front speed and the other biophysical values: see the source list of chapter 01 (Wohlfarth-Bottermann 1977; Kuroda et al. 2015; Saigusa et al. 2008; Le Verge-Serandour & Alim 2023)
- Wakita et al. 1997, J. Phys. Soc. Jpn 66:67 (colony front self-affinity): https://journals.jps.jp/doi/10.1143/JPSJ.66.67

Methods and known answers
- Katifori & Magnasco 2012: https://doi.org/10.1371/journal.pone.0037994
- Hastings 2001 (DBM η): https://arxiv.org/abs/cond-mat/0103312 ; DLA dimension: https://en.wikipedia.org/wiki/Diffusion-limited_aggregation and references therein (Tolman & Meakin; Ossadnik)
- Heitz et al. 2021, sliced Wasserstein texture loss: https://arxiv.org/abs/2006.07229 ; Gatys et al. 2015: https://arxiv.org/abs/1505.07376 ; Portilla & Simoncelli 2000, IJCV 40:49
- Bińkowski et al. 2018 (KID): https://arxiv.org/abs/1801.01401 ; Chong & Forsyth 2020 (FID bias): https://arxiv.org/abs/1911.07023
- VGG weights licence (CC BY 4.0): https://www.robots.ox.ac.uk/~vgg/research/very_deep/
- Not re-fetched for this chapter, standard results quoted from memory: Allain & Cloitre 1991 (gliding-box lacunarity), Guo & Hall 1989, Zhang & Suen 1984, Rong & Tan 2006 (jump flooding), Bramson 1983 (KPP front correction), Kardar–Parisi–Zhang 1986, Kuramoto 1984, Hansen 2016 (CMA-ES tutorial), Mouret & Clune 2015 and Vassiliades et al. 2018 (MAP-Elites, CVT).
