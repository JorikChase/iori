# Large, random, Earth-like procedural regions in the browser: multi-scale generation, streaming, LOD, climate, style, realism

Scope: architecture options and their costs for tens-of-km to unbounded regions explored in a browser. Researched 2026-10-13. Primary sources were read where possible: the full text of Galin et al. 2019 and Argudo et al. 2019, and the GPU Gems 2 clipmap chapter. Other sources were read only as abstracts, metadata or secondary summaries, and the notes say which. DOIs were checked against Crossref unless marked otherwise.

---

## 1. Multi-scale generation: coarse uplift + stream-power erosion, then amplification to metre scale

### Takeaway
The recommended approach in the literature has two stages:
1. Run a coarse, physically grounded pass at about 30–200 m per cell. This is uplift plus stream-power erosion, or a graph-based method that builds rivers or peaks and saddles first.
2. Amplify by 4–8× per level, up to about 256× in total, with example atoms, noise or erosion that is constrained so it cannot break the coarse drainage.

Galin et al. say no single method spans the full 50–100 km extent at 1–2 m precision, which is 50 000–100 000 samples per side. Stream-power methods run in seconds at the coarse scale. Fine-scale simulation over 100 km at 1 m takes hours, so the fine scale has to be procedural or amplified.

### Cited Findings

**Galin et al. 2019, "A Review of Digital Terrain Modeling" (CGF 38(2):553–577, Eurographics STAR)**
- Citation: E. Galin, E. Guérin, A. Peytavie, G. Cordonnier, M.-P. Cani, B. Benes, J. Gain. DOI [10.1111/cgf.13657](https://doi.org/10.1111/cgf.13657). Full text: [author PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Galin19CGF.pdf).
- **Taxonomy.** Methods fall into three families: "procedural modeling, physically-based simulation of erosion and land formation processes, and example-based methods driven by scanned terrain data". They are compared on five criteria: variety of landforms; realism ("both a perceptual and geomorphological perspective"); scale (extent and sampling precision); interaction metaphors and user control; and compute and memory cost — [Galin 2019 abstract](https://www.cs.purdue.edu/homes/bbenes/papers/Galin19CGF.pdf).
  - Authoring is classified by metaphor: painting with brushes, sketching vector features, sculpting, and time-line scenarios.
  - Representations covered: heightfields, layered models, volumetric models (voxels, implicit surfaces), and function or construction-tree models. The review notes that function-based heightfields are "potentially infinite, whereas voxels are grid limited". Procedural noise can represent "infinite terrains, i.e. defined over R²" — same source.
- **Scale numbers (§6.3).**
  - Extent a = side length, resolution n = samples per side, precision = a/n. Cost grows as O(n²).
  - "Landforms … such as those caused by glacial erosion, are 50 − 100 km in extent. At the same time localized hydraulic erosion can require a precision in the range of 1−2 m. Very few current techniques can accommodate this range … (50,000 − 100,000 samples per dimension)" — [Galin 2019 §6.3](https://www.cs.purdue.edu/homes/bbenes/papers/Galin19CGF.pdf).
- **Erosion cost.** Iterative erosion needs "in general hundreds" of O(n) iterations. In the review's words, erosion simulations that need under a second on a 1 km² terrain at 1 m precision "typically take more than three hours to complete on 100 × 100 km² terrains at the same precision". GPUs "do not change the overall complexity … only a temporary fix" — [Galin 2019 §6.5/§7](https://www.cs.purdue.edu/homes/bbenes/papers/Galin19CGF.pdf).
- **Memory.** At 512²–1024² a heightfield takes "1 − 4 Mb and rarely a cause for concern". For larger sizes the review recommends "Kolmogorov compression": store the generator plus its parameters and regenerate on the fly, "arguably the largest single benefit of procedural methods" — same source.
- **Realism.**
  - Under a common rendering, "erosion- and example-based methods appear significantly more realistic than procedural approaches".
  - The two big weaknesses of current methods: (a) poor depiction of terrains that combine distinctive large-scale and fine-scale features, for example large riverbeds with fine erosion around them; (b) difficulty mixing landforms from different processes in one terrain, such as rolling hills, plains, canyons and eroded mountains.
  - "A canyon landscape with surrounding plains serves as a kind of stress test … which is why it often does not appear in papers."
  - Four ways of judging realism are listed, each with problems: static renderings, user studies, expert assessment, and validation of physical consistency (for example simulating water flow to check drainage) — [Galin 2019 §6.2](https://www.cs.purdue.edu/homes/bbenes/papers/Galin19CGF.pdf).
- **Amplification.** Recent methods amplify large terrains with fine detail ([GDGP16], [AAC*17]). This is "a promising avenue, but it does rely on a reasonable initial coarse terrain". Fig. 33 shows sparse amplification from ε = 1 km to ε = 4 m per pixel, "a total amplification factor of 256" — same source.
- **Recommendations and open problems (§7).**
  - "Generating large-scale terrains with a variety of landforms and geomorphological patterns, while maintaining overall consistency, remains an open challenge."
  - Wind and glacial erosion are still missing.
  - Volumetric layer-stack and voxel models are limited to "less than a few hundreds meters".
  - Planet-scale generation "suffers from severe shortcomings in user control and realism".
  - Suggested direction: "begin by enhancing the realism of the more efficient methods, such as procedural generation … a new class of basis-functions for noise could be designed that directly generate the dendritic patterns observed in real terrain" — [Galin 2019 §7](https://www.cs.purdue.edu/homes/bbenes/papers/Galin19CGF.pdf).
- **Table 3/4 extents and precisions** as printed, read from two-column PDF text. Row alignment in the extraction was imperfect, so check against the PDF.

  | Method | Extent | Precision | Speed |
  |---|---|---|---|
  | Cordonnier 2016, uplift + stream power [CBC*16] | 10–100 km | 10–100 m | seconds |
  | Génevaux 2013/2015, hydrology construction trees [GGG*13, GGP*15] | 100–1000 km | 1–10 m | seconds |
  | Noise (Derzapf et al. 2011) [DGGK11] | > 10 000 km | < 1 m | real time |
  | Sparse modelling [GDGP16] | 4–4000 km | 1–1000 m | seconds |

  Source: [Galin 2019 Tables 2–4](https://www.cs.purdue.edu/homes/bbenes/papers/Galin19CGF.pdf).

**Cordonnier et al. 2016, uplift + stream power**
- Citation: "Large Scale Terrain Generation from Tectonic Uplift and Fluvial Erosion", CGF 35(2), DOI [10.1111/cgf.12820](https://doi.org/10.1111/cgf.12820) — [EG diglib](https://diglib.eg.org/handle/10.1111/cgf12820); [PDF](https://www.cs.purdue.edu/homes/bbenes/papers/Cordonier16CGF.pdf).
- Erosion law: ∂h/∂t = −k·A(p)^m·s(p)^n + u(p), where A is drainage area, s is slope and u is the uplift map. It is "solved implicitly in linear time" on a stream graph, and the graph is turned into a DEM by blending landform kernels — [Galin 2019 §4.2.1](https://www.cs.purdue.edu/homes/bbenes/papers/Galin19CGF.pdf).
- Produces ranges with dendritic rivers "≈ 100 km-wide" (Fig. 20 shows 100 × 100 km) — same source.
- Extended in [CCB*18] with uplift derived from tectonic plates, plus folds and strata — same source.

**Schott et al. 2023, interactive stream-power authoring**
- Citation: "Large-scale Terrain Authoring through Interactive Erosion Simulation", ACM TOG 42(5):1–15, DOI [10.1145/3592787](https://doi.org/10.1145/3592787).
- The user paints uplift and stream-power erosion runs continuously, using "a fast yet accurate approximation of drainage area and flow routing". Code: [github.com/H-Schott/StreamPowerErosion](https://github.com/H-Schott/StreamPowerErosion); preprint hal-04049125 (blocked by a bot check here).
- A community project (WitchySim) runs stream-power erosion plus a simplified climate in compute shaders — [itch.io](https://witchymonster.itch.io/witchysim). Not peer reviewed.

**Tzathas, Gailleton, Steer, Cordonnier 2024, analytical stream power**
- Citation: "Physically-based analytical erosion for fast terrain generation", CGF 43(2), DOI [10.1111/cgf.15033](https://doi.org/10.1111/cgf.15033).
- Uses analytical solutions of the stream-power law. Time becomes a function parameter rather than a stopping criterion. Iteration is multigrid-accelerated, with landslide and hillslope terms. This avoids "thousands of time-stepping iterations" — [EG diglib record](https://diglib.eg.org/handle/10.1111/cgf15033), abstract only. The full PDF was not readable (403).

**Génevaux et al. 2013, hydrology-based construction trees**
- Citation: "Terrain generation using procedural models based on hydrology", ACM TOG 32(4), DOI [10.1145/2461912.2461996](https://doi.org/10.1145/2461912.2461996).
- Method: river network → classified river segments → terrain primitives → construction tree.
  - The river network grows by a grammar that satisfies Horton–Strahler properties.
  - Each river is labelled with the Rosgen watercourse classification.
  - Elevation spreads out from the river trajectories through a hierarchical construction tree — [Galin 2019 §3](https://www.cs.purdue.edu/homes/bbenes/papers/Galin19CGF.pdf).

**Guérin, Digne, Galin, Peytavie 2016, sparse representation and amplification**
- Citation: "Sparse representation of terrains for procedural modeling", CGF 35(2):177–187, DOI [10.1111/cgf.12821](https://doi.org/10.1111/cgf.12821).
- The terrain is a sparse construction tree whose leaves are circular "atoms": patches from real DEM exemplars on a regular grid, blended by distance-weighted sums. The dictionary bounds the reconstruction error with the fewest atoms.
- Amplification pairs low-resolution atoms with high-resolution ones, "increasing resolution by a factor of 4 to 8" per step. Shown going from 1 km to 4 m per pixel (×256) — [Galin 2019 §5.4](https://www.cs.purdue.edu/homes/bbenes/papers/Galin19CGF.pdf).

**Argudo et al. 2019, "Orometry-based terrain analysis and synthesis"**
- Citation: ACM TOG 38(6), Art. 199, DOI [10.1145/3355089.3356535](https://doi.org/10.1145/3355089.3356535) (Crossref) — [author PDF](https://people.cs.uct.ac.za/~jgain/wp-content/papercite-data/pdf/argudo2019.pdf).
- **Analysis.** Builds a descriptor from peak prominence, dominance, isolation and saddle orientation over the Divide Tree (the graph of peaks and saddles). A Random Forest on this descriptor reliably tells mountain ranges apart — same PDF.
- **Synthesis steps.**
  1. Sample a peak graph from the orometric distributions, steered by a coarse elevation map and a peak-density map.
  2. Build a dual river network.
  3. Add samples on ridges and slopes and build a constrained Delaunay TIN.
  4. Add multifractal noise whose amplitude is held "lower than the prominence threshold ε to guarantee that the orometry … is preserved".
  5. Apply constrained multi-scale hydraulic erosion.

  Source: same PDF.
- **Density and timing.** The Divide Tree holds "about one sample per 2.5 km²". A 90 × 90 km terrain at 30 m (3000²) takes 60 s (Norway, ~1000 peaks) to 190 s (Appalachians, >2800 peaks) on an i7 with a GTX 970. The method "scales with the number of peaks rather than the size or resolution". The authors note Cordonnier et al. 2016 use 10–160 k samples for terrains of similar size — same PDF.
- **Validation.**
  - In a perceptual study, judged more plausible than prior methods.
  - Against an Alps 90 × 90 km SRTM crop, a GAN baseline produced 7× too many peaks, an Earth Mover's Distance 20–50% higher, and an elevation histogram 20× larger.
  - Limitation: the Divide Tree drops slope profiles and the subsidiary ridge network.

  Source: same PDF.

**Other amplification work (metadata from Crossref)**
- Paris, Galin, Peytavie, Guérin, Gain 2019, "Terrain Amplification with Implicit 3D Features", ACM TOG 38(5), DOI [10.1145/3342765](https://doi.org/10.1145/3342765).
- Argudo et al. 2017, "Coherent multi-layer landscape synthesis", The Visual Computer 33(6–8):1005–1015, DOI [10.1007/s00371-017-1393-6](https://doi.org/10.1007/s00371-017-1393-6). This is [AAC*17], cited by Galin as large-scale amplification.
- Cordonnier et al. 2017, "Authoring landscapes by combining ecosystem and terrain erosion simulation", ACM TOG 36(4), DOI [10.1145/3072959.3073667](https://doi.org/10.1145/3072959.3073667). Galin's [CGG*17]: combined erosion processes plus vegetation, "a first step towards … more variety".
- Argudo, Guérin, Schott, Galin 2025, "Terrain descriptors for landscape synthesis, analysis and simulation", CGF 44(2), DOI [10.1111/cgf.70080](https://doi.org/10.1111/cgf.70080). A newer survey on terrain metrics; **not read**.

### Inferences
- **Coarse grid sizes.**
  - 512² over 100 km is about 195 m per cell; 1024² over 50 km is about 49 m; Argudo's 3000² over 90 km is 30 m.
  - Reaching 1 m from 50–200 m means 50–200× amplification, roughly 3–4 levels at 4–8× each. That matches Galin's ×256 example.
  - Stream-power erosion at 512²–1024² is in the "seconds" class (Galin Table 3) and should be feasible in a web worker or WebGPU compute. This is an inference; no browser timing was found.
- **Keeping amplification consistent with rivers.** Two published patterns:
  - Argudo: keep added noise below a structural threshold (prominence) so no new peaks or saddles appear, and carve rivers from a graph *before* adding noise.
  - Génevaux/Guérin: amplify with primitives or atoms attached to the river graph.

  The general rule: amplification adds detail with amplitude below the coarse cell's relief tolerance, is masked or attenuated near channels, and is applied after the channel network is fixed.
- The "dendritic noise" Galin calls for in §7 is the cheap route for fine scales. Recent erosion-like noise filters (not researched here) are candidates.

### Gaps
- No browser (JS/WASM/WebGPU) timing of stream-power erosion at 512²–2048² was found. It has to be benchmarked.
- The Tzathas 2024 full text could not be retrieved: numbers on speedup, resolution and GPU use are missing.
- The Schott 2023 preprint was blocked: exact grid size and interactive frame rate are unknown.
- Galin's table rows came from imperfect two-column extraction. Check the extents above against the PDF.

---

## 2. Unbounded / streamed worlds: chunked generation, consistent boundaries, determinism

### Takeaway
Erosion is non-local: drainage area at a point depends on the whole upstream catchment. Neither industry nor research has a pixel-exact tiled erosion. Three strategies are used:
1. Erode one global coarse map once and only tile the local, fine-scale work. This is the World Machine two-project workflow.
2. Erode tiles with large overlap and blend them. This is expensive, and seams remain if the overlap is smaller than erosion's reach.
3. Use a hierarchy: coarse global context, deterministic in (seed, x, y), conditions local generation. This is what InfiniteDiffusion and Minecraft's noise-driven biomes do.

For "effectively unbounded", the coarse level itself must be either pure functions of the seed (noise, Minecraft style) or generated in large region blocks with overlap.

### Cited Findings
- **World Machine: erosion is not tile-local.**
  - A moderator states that erosion "is very context sensitive, so things that are quite far away can strongly influence local erosion", so "there's no way to get pixel-perfect results" building tiles independently — [WM forum: better erosion support in big maps](https://forum.world-machine.com/t/better-erosion-support-in-big-maps/4082).
  - Seams with 1024² tiles at 25% blend were diagnosed as the blend area being "smaller than the area of influence of the erosion". 25–50% blend is the usual starting range, and "100% blending should eliminate any 'blocking', but will of course take longer to render" — [WM forum: too obvious seams](https://forum.world-machine.com/t/too-obvious-seams-in-tiled-output/3710); [tiling issue](https://forum.world-machine.com/t/tiling-issue/2896).
  - Recommended workaround: build the heavy terrain once, as one file or a few big tiles, then slice it into small tiles in a second project for the final fine erosion and surfacing — [WM forum](https://forum.world-machine.com/t/tiling-issue/2896?page=2).
  - These are forum posts by moderators and users, not documentation. Gaea's tiled-build behaviour was **not found**.
- **Tile-graph erosion (Lim, Tan, Bhojan 2022).** "Visually Improved Erosion Algorithm for the Procedural Generation of Tile-based Terrain", GRAPP 2022, pp. 49–59, DOI [10.5220/0010799700003124](https://doi.org/10.5220/0010799700003124). Each tile is a node in a drainage graph and drains to its steepest neighbour. Fluvial erosion scales with accumulated drainage — [ResearchGate summary](https://www.researchgate.net/publication/364771642_Visually_Improved_Erosion_Algorithm_for_the_Procedural_Generation_of_Tile-based_Terrain). Abstract only.
- **Hierarchical unbounded generation (InfiniteDiffusion, Goslin, arXiv 2512.08309, v4 May 2026).**
  - A training-free reformulation of diffusion sampling "for lazy, unbounded generation", aiming at "seed consistency, and constant-time random access".
  - A hierarchical stack of diffusion models combines "planetary context with local detail". It adds a Laplacian encoding for Earth-scale value ranges and an "infinite-tensor framework for constant-memory handling of unbounded tensors".
  - Claims interactive rates on a consumer GPU. There is no browser claim — [arXiv abs](https://arxiv.org/abs/2512.08309).
  - Listed open problems: latent-space continuity across tiles must still be measured after decoding, and "hierarchical global indices for biome maps and rivers" are needed for long-distance queries — [arXiv PDF](https://arxiv.org/pdf/2512.08309).
  - This is a recent preprint and not peer reviewed.
- **Minecraft multi-noise (Java 1.18+).**
  - Each column gets climate parameters from seeded noise: temperature, humidity, continentalness, erosion, weirdness, plus depth and an offset that is always 0 during biome generation. The biome chosen is the "closest noise hypercube" to that point — [Fabric yarn docs, MultiNoiseUtil.NoiseHypercube](https://maven.fabricmc.net/docs/yarn-1.18.2+build.1/net/minecraft/world/biome/source/util/MultiNoiseUtil.NoiseHypercube.html).
  - The vanilla layout is a grid: temperature × humidity tables, slices chosen by continentalness and erosion, and weirdness ranges inside each slice — [Snowcapped README](https://github.com/jacobsjo/snowcapped).
  - The same continentalness, erosion and weirdness noises also shape terrain height, so biome and relief correlate by construction — [dawnosaur explainer](https://dawnosaur.substack.com/p/how-minecraft-generates-worlds-you) (secondary).
  - A Mojang bug notes these noises are sampled at a different scale than the others — [MC-239790](https://bugs.mojang.com/browse/MC-239790).
- **Seam conventions in engines.** Shared edge vertices or a 1-vertex border overlap, plus downward "skirts" to hide cracks — [PulseGeek guide](https://pulsegeek.com/articles/terrain-stitching-and-chunking-seamless-streaming/); [WorldGen UE5 listing](https://www.fab.com/listings/e4e93fbe-9326-40b8-a043-a809f788306a?lang=en). These are commercial or blog sources and unverified.
- **Determinism / Kolmogorov compression.** Galin recommends the generator plus its parameters as the storage format for large terrains — [Galin 2019 §6.5](https://www.cs.purdue.edu/homes/bbenes/papers/Galin19CGF.pdf).

### Inferences
- **A workable architecture for "effectively unbounded".** Three levels, all keyed by integer cell coordinates and the seed:
  - **L0, continental:** pure seeded noise for uplift, continentalness and climate parameters, at about 1–5 km per cell. It is evaluable anywhere, as in Minecraft.
  - **L1, region:** stream-power erosion on blocks of about 512² at about 100–200 m per cell, i.e. 50–100 km. Each block is generated with a halo (overlap), or the region is treated as closed basins with outlets set by L0 (sea and base level).
  - **L2, local:** amplification and noise from L1 that only needs a few cells of L1 neighbourhood, so it is tile-local and seam-free.
- Erosion on L1 blocks will seam unless (a) block edges are set as fixed boundary elevations from L0, with rivers allowed to exit only at L0-designated outlets, or (b) each block is computed with a large halo and cross-faded. WM practice suggests a halo of ≥25–50% of the tile width.
- For "tens of km", a single region of 512²–1024² eroded once at load (or cached) avoids the whole problem. True unboundedness can be layered on later.
- **Determinism needs care:**
  - integer hashing for seeds;
  - no reliance on floating-point summation order across GPU vendors, for example in drainage accumulation;
  - a fixed iteration count.

  The repo's own experience (moshine M8 commit: "integer kernels, deterministic JS math") points the same way. That is a local precedent, not an external source.

### Gaps
- No peer-reviewed method for pixel-consistent stream-power erosion across independently generated tiles was found.
- Gaea's tiled-build documentation was not found.
- No engine documentation describes how No Man's Sky, Outerra or Minecraft handle rivers across chunks. Minecraft has no drainage simulation, from prior knowledge, unverified here.

---

## 3. Terrain LOD in WebGL2/WebGPU: clipmaps, CDLOD, chunked LOD; engine support; draw calls

### Takeaway
Geometry clipmaps (nested viewer-centred grids, about 6–14 draws per level) and CDLOD (a quadtree of one instanced grid mesh with per-vertex morphing) both suit procedural heightfields drawn from GPU textures. Of the two, clipmaps are the closest fit for a GPU-generated, toroidally updated height texture.

- Reference numbers: n = 255, L = 11 gives about 71 draw calls (35 with instancing) at 130 fps on a 2005 GeForce 6800 GT.
- None of three.js, Babylon or CesiumJS ships a procedural-terrain clipmap.
- Cesium uses a screen-space-error quadtree over 16-bit quantized-mesh tiles.
- The web has no tessellation, geometry or mesh shaders, so LOD has to be done with pre-made grids in the vertex shader or with compute.

### Cited Findings
**Losasso & Hoppe 2004**
- Citation: "Geometry clipmaps: terrain rendering using nested regular grids", ACM TOG 23(3) (SIGGRAPH 2004) — [project page](https://hhoppe.com/proj/geomclipmap/); [PDF](https://www.hhoppe.com/geomclipmap.pdf).
- Nested regular grids centred on the viewer are kept as vertex buffers and filled in incrementally as the viewer moves.
- They used a 40 GB US height map compressed about 100× to fit in memory. Finer levels are synthesised with fractal noise near the surface. The paper claims 60 fps — [SIGGRAPH history](https://history.siggraph.org/?p=116120).

**Asirvatham & Hoppe 2005, GPU Gems 2 ch. 2 ("Terrain Rendering Using GPU-Based Geometry Clipmaps")** — [NVIDIA](https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-2-terrain-rendering-using-gpu-based-geometry)
- **Grid structure.**
  - Grid size n = 2^k − 1, usually n = 255, with L = 11 levels.
  - A level is disabled when its extent is under 2.5 h, where h is viewer height.
  - Triangles are about 5 px wide at 1024 × 768.
  - Transition width w = n/10.
- **Footprints.**
  - 12 ring blocks of m × m, with m = (n+1)/4 = 64.
  - 4 fix-up strips of m × 3 and an L-shaped interior trim.
  - Degenerate triangles on the outer edge avoid T-junctions.
  - 16-bit indices, 4-byte SHORT2 vertices.
- **Draw calls.**
  - Up to 14 per level. With culling, about 4 of the 12 blocks are visible.
  - Total 6L + 5 = **71 draws for L = 11**, or **3L + 2 = 35 with instancing**.
- **Performance and update cost.**
  - 60 M triangles/s, **130 fps** with vertex textures, n = 255, L = 11, on a GeForce 6800 GT. 185 fps without the vertex-texture fetch; 298 fps at n = 127.
  - Full-level update costs: upsampling 1 ms, synthesis about 0 ms, normal map 0.6 ms. CPU decompression at 8 ms is the bottleneck.
- **Data and textures.**
  - Dataset: 216 000 × 93 600 samples at 30 m (conterminous US), compressed >100× to 355 MB.
  - Normal maps are 8-bit RGBA at 2× geometry resolution. Upsampling uses 4-point subdivision with 16 taps.

**Strugar 2009/2010, CDLOD**
- Citation: "Continuous Distance-Dependent Level of Detail for Rendering Heightmaps", J. Graphics, GPU & Game Tools, DOI [10.1080/2151237X.2009.10129287](https://doi.org/10.1080/2151237X.2009.10129287). Paper and code: [github.com/fstrugar/CDLOD](https://github.com/fstrugar/CDLOD).
- Organises levels as a quadtree of regular grids sampled from the heightmap.
- The LOD function depends on 3D viewer distance and is consistent across the mesh. Vertices are morphed per vertex rather than per node (unlike Ulrich), so no stitching is needed.
- Requires Shader Model 3.0. The original code is DX9 — same.
- One forum commenter calls it "at its core just an interpolated discrete lod" — [gamedev.net](https://gamedev.net/forums/topic/620084-a-good-heightmap-lod-technique-no-vtf-please). That is an opinion.

**Ulrich 2002, Chunked LOD**
- Citation: "Rendering massive terrains using chunked level of detail control", SIGGRAPH 2002 course notes. Crossref reference entry via [api.crossref.org](https://api.crossref.org/works/10.1145%2F2077378.2077415); demo at tulrich.com/geekstuff/chunklod.html.
- Precomputed meshes per quadtree node. Mismatched borders produce T-junctions and cracks, hidden with skirts — [UChicago CMSC 23700 project notes](https://classes.cs.uchicago.edu/archive/2014/winter/23700-1/project_4_and_5/project-04.pdf).

**Web engines**
- **CesiumJS.**
  - Quadtree selection by screen-space error; `maximumScreenSpaceError` defaults to 2 px; `heightmapTerrainQuality` defaults to 0.25 — [Cesium forum](https://community.cesium.com/t/maximum-terrain-tiles-level-of-detail/1948); [DeepWiki summary of the quadtree](https://deepwiki.com/CesiumGS/cesium/5.1-quadtree-system).
  - Quantized-mesh stores u, v and height as 16-bit (0–32767), with height scaled per tile between min and max — [Cesium QuantizedMeshTerrainData docs](https://cesium.com/learn/cesiumjs/ref-doc/QuantizedMeshTerrainData.html).
  - Quantized-mesh carries no per-tile geometric error, unlike 3D Tiles — [Cesium forum](https://community.cesium.com/t/clarifying-geometric-error-in-cesium-world-terrain-quantized-mesh-tiles/45699).
  - A martini-based plugin meshes raster tiles on the fly — [cesium-martini](https://github.com/mlim15/cesium-martini).
- **Babylon.js.** The DynamicTerrain extension is a CPU mesh with no clipmap. Forum advice: "Tessellation, geometry, and mesh shaders provide dynamic vertex LOD, but that is not available on the web". Use prebuilt LOD grids or compute-generated geometry. A WebGPU quadtree compute sample with indirect draw is referenced — [Babylon forum: Advanced Terrain with LOD](https://forum.babylonjs.com/t/advanced-terrain-with-lod/49385).
- **three.js.**
  - The `lod-terrain` npm package implements CDLOD over a DataTexture — [npm](https://www.npmjs.com/package/lod-terrain).
  - A 2026 browser open-world write-up (three.js 0.183.1, `three/webgpu` + TSL) uses three tiers: clipmap rings for the far field, heightmap chunks for the mid field, and marching cubes with Transvoxel near the camera. Each ring doubles vertex spacing. Seams are made watertight by 2:1 edge morphing, h = ½(h_left + h_right) on odd boundary vertices, "without transition geometry". Fog colour is sampled from the HDR sky per fragment direction. Lesson: "test under motion" because clipmap pops do not show in still frames — [Cinevva blog part 12](https://app.cinevva.com/blog/2026-02-25-open-world-browser-part-12-lessons). Ring counts and frame times were not given.
  - A readable clipmap demo with K, L and R parameters, level size 2^K − 1 — [Olluo/geometry-clipmaps-demo](https://github.com/Olluo/geometry-clipmaps-demo).

### Inferences
- **Coverage arithmetic for a clipmap.** With n = 255 and a 1 m finest cell, L = 11 covers about 255 × 2^10 m ≈ 261 km across the outermost ring. That is enough for a 100 km region viewed to the horizon.
  - Each ring has about ¾·n² ≈ 49 k vertices, so roughly 0.5–0.6 M vertices in total. That is trivial for any 2020s GPU, including integrated laptop GPUs (inference).
  - On WebGPU the 12 blocks per level can be one instanced draw, about 11–22 draws in total. Vertex fetch from an r32float or r16 texture is cheap on modern hardware; the 2005 vertex-texture bottleneck no longer applies.
- **Height storage per clipmap level.** One 256² r32float texture is 256 KB; 11 levels are about 2.9 MB. A toroidal update (refill only the newly exposed L-shaped strip) with a compute or fragment pass that evaluates amplification from the L1 region map makes the world procedural with no stored fine heights.
- CDLOD is the better choice when the height data are tiles (for example cached region tiles) and when height-based frustum culling per quadtree node matters, as in strongly mountainous scenes viewed from low altitude.
- **Vegetation LOD** is not covered by the sources above. Standard practice, from prior knowledge and not verified here: GPU instancing for near trees, billboards or octahedral impostors for mid distance, and a canopy-height or colour texture on the terrain for far distance.

### Gaps
- No primary source was found for vegetation LOD in the browser: impostors, instance counts, or the cost of WebGPU indirect draws. This needs a dedicated search.
- No measured WebGL2 vs WebGPU terrain benchmarks were found.
- The Losasso–Hoppe DOI was not checked against Crossref. From prior knowledge it is 10.1145/1015706.1015799; flagged as unverified.

---

## 4. Climate and biomes at regional scale

### Takeaway
At 50–100 km, the main physically grounded climate fields can be derived cheaply from terrain plus one prevailing-wind vector:
- temperature from elevation (lapse rate);
- precipitation from the Smith–Barstad linear orographic model, an FFT-based steady solution that gives windward maxima and lee rain shadows.

Biomes then follow from a Whittaker-style lookup on (mean annual temperature, annual precipitation). Graphics research on procedural climate is mostly local (Ecoclimates, at forest scale). No peer-reviewed regional procedural-climate method for graphics was found.

### Cited Findings
- **Smith & Barstad 2004.**
  - Citation: R. B. Smith, I. Barstad, "A Linear Theory of Orographic Precipitation", *J. Atmos. Sci.* 61(12):1377–1391, DOI [10.1175/1520-0469(2004)061<1377:ALTOOP>2.0.CO;2](https://doi.org/10.1175/1520-0469(2004)061%3C1377:ALTOOP%3E2.0.CO;2). Verified on Crossref.
  - The model includes airflow dynamics, condensed-water advection and downslope evaporation. The vertically integrated steady-state equations are solved with Fourier transforms — [AMS 10th Mesoscale conference abstract](https://ams.confex.com/ams/10Meso/techprogram/paper_62756.htm).
  - The key parameter is the cloud delay time τ. The authors flag linear wave dynamics, near-saturation, steady state and constant cloud time scales as strong assumptions — [AMS confex PDF](https://ams.confex.com/ams/pdfpapers/62756.pdf).
  - Applied to downscale precipitation over western Norway from 12 GCM runs — [Hydrol. Earth Syst. Sci. 14, 2329 (2010)](https://hess.copernicus.org/articles/14/2329/2010/).
  - A Python implementation exists: [`orographic_precipitation` on PyPI](https://pypi.org/project/orographic_precipitation/0.1rc0/). The page did not render here.
- **Ecoclimates (Pałubicki et al. 2022).**
  - Citation: "Ecoclimates: Climate-Response Modeling of Vegetation", ACM TOG 41(4) Art. 155, DOI [10.1145/3528223.3530146](https://doi.org/10.1145/3528223.3530146).
  - Couples a weather or cloud fluid simulation with individual tree growth and soil hydrology. Reproduces geomorphic controls, forest edge effects, the Foehn effect and vegetation patterning. It is local rather than global, with trees at branch level — [SIGGRAPH history](https://history.siggraph.org/?p=117929); [author page](https://wp.faculty.wmi.amu.edu.pl/papers/Palubicki.etal-2022-Ecoclimates.html); [EGU21 abstract](https://meetingorganizer.copernicus.org/EGU21/EGU21-16600.html).
- **Ecosystems coupled with terrain.** Cordonnier et al. 2017 couple vegetation with multiple erosion processes, DOI [10.1145/3072959.3073667](https://doi.org/10.1145/3072959.3073667). Galin 2019 calls this the first step towards more varied landscapes.
- **Minecraft as an industry contrast.** Temperature and humidity are independent noise fields that "only guide world generation". Correlation with altitude comes from sharing terrain noises, not from physics — [Fabric docs](https://maven.fabricmc.net/docs/yarn-1.18.2+build.1/net/minecraft/world/biome/source/util/MultiNoiseUtil.NoiseHypercube.html); [dawnosaur](https://dawnosaur.substack.com/p/how-minecraft-generates-worlds-you).

### Inferences
- **Pipeline at region scale (L1, about 100–200 m cells).** All steps are O(N log N) or O(N) and can run in a worker or in compute.
  1. Choose a prevailing wind (u, v) from latitude band or seed.
  2. Smith–Barstad FFT on the L1 DEM → precipitation P(x, y), plus a background rate.
  3. T(x, y) = T_sea − Γ·z, with Γ ≈ 6.5 K/km (standard-atmosphere value, prior knowledge), optionally adjusted for aspect and insolation.
  4. Whittaker lookup (T, P) → biome.
  5. Optionally, flow accumulation from the erosion pass → riparian and wetland zones.
- For the FFT on a non-periodic region, pad with a taper (inference). The model is a 2D FFT plus a pointwise transfer function, so a 512² grid is a few ms in WebGPU or tens of ms in JS (inference, not benchmarked).
- **Few artistic liberties.** Physically based inputs are wind direction, sea-level temperature (latitude), lapse rate, background precipitation and the τ values. Everything else follows from them.

### Gaps
- The Smith–Barstad transfer function and default parameters (τ_c, τ_f ≈ 1000 s, Hw, Nm) were **not verified** from the paper here; the PyPI page did not render. Check before implementing.
- No source was fetched for the Whittaker biome diagram boundaries (Whittaker 1975, *Communities and Ecosystems*) or for the 6.5 K/km lapse rate (ICAO standard atmosphere). Both are standard but uncited here.
- No graphics paper on *regional* (10–100 km) procedural climate beyond Ecoclimates' local scale was found.

---

## 5. Rendering style: a light, drawing-like look at large scale

### Takeaway
The cartographic tradition (Imhof's Swiss relief shading, hypsometric tints, contours) gives a principled, low-cost "drawn" look that can be computed in a fragment shader from height and normals. Neural relief shading (Jenny et al. 2021) shows what the manual Swiss style adds to plain hillshade:
- generalisation that removes small detail;
- light direction locally adjusted to bring out landforms;
- brightness varied to emphasise large forms.

These can be approximated in real time with multi-scale (pre-filtered) normals and aerial-perspective fading.

### Cited Findings
- **Jenny et al. 2021.**
  - Citation: B. Jenny, M. Heitzler, D. Singh, M. Farmakis-Serebryakova, J. C. Liu, L. Hurni, "Cartographic Relief Shading with Neural Networks", IEEE TVCG 27(2):1225–1235, DOI 10.1109/TVCG.2020.3030456 — [arXiv 2010.01256](https://arxiv.org/pdf/2010.01256); [ETH research collection](https://www.research-collection.ethz.ch/items/0fdf1a68-f911-4ff4-a54f-305bf3362026).
  - A U-Net is trained on manual Swiss topographic-map relief shading. It learns to remove unnecessary detail, locally adjust illumination direction, and vary brightness for larger landforms. Output takes seconds per model; 18 relief-shading experts rated it high quality.
  - The paper cites Imhof's *Cartographic Relief Presentation* (1982) — same sources.
- **Jenny 2001**, "An Interactive Approach to Analytical Relief Shading", Cartographica 38(1–2):67–75, DOI [10.3138/F722-0825-3142-HW05](https://doi.org/10.3138/F722-0825-3142-HW05). Crossref metadata only.
- **Leonowicz, Jenny, Hurni 2010**, "Terrain Sculptor: Generalizing Terrain Models for Relief Shading", Cartographic Perspectives 67:51–60, DOI [10.14714/cp67.114](https://doi.org/10.14714/cp67.114). Generalising the DEM before shading. Metadata only.
- **Follow-ups.** A 2022 extension covers generalised relief, contour lines and coastlines — [Monash record](https://research.monash.edu/en/publications/neural-networks-for-generalized-relief-shading-contour-lines-and-/).
- **Fog.** Sky-coloured distance fog, sampling the HDR sky along the view direction, in a three.js WebGPU open world — [Cinevva blog](https://app.cinevva.com/blog/2026-02-25-open-world-browser-part-12-lessons).

### Inferences
- **Real-time recipe (inference).**
  - **Hillshade** from normals sampled at a scale proportional to view distance: use the clipmap's coarser level, or mip-filtered normals. This gives Terrain-Sculptor-like generalisation for free, because each clipmap level is already a low-pass of the one below it.
  - **Two lights:** a main north-west light plus a soft ambient sky term, as in the Swiss style.
  - **Hypsometric tint** on a 1D LUT indexed by elevation, or better by the biome map so the tint means something. Lighten with distance (aerial perspective) and desaturate towards the sky colour.
  - **Contour lines** via fract(h/Δ) with screen-space derivatives (fwidth) for constant width. Index contours every 5th line; fade the interval with distance.
- These are all per-fragment, cost a few texture taps, and need no extra geometry.

### Gaps
- No primary source on real-time (shader) implementations of Swiss-style shading or contours was fetched.
- Imhof's 1982 book was not consulted directly.

---

## 6. Realism checks at region scale

### Takeaway
Realism can be checked quantitatively against Earth statistics:
- hypsometry (elevation histogram);
- slope distribution;
- river-network laws (Hack's law, Horton ratios, network fractal dimension, drainage consistency, meaning no pits);
- orometric statistics (peak prominence, isolation and saddle distributions, which Argudo et al. show discriminate real ranges).

Several Earth reference values were found. Global land hypsometry percentiles, slope distributions and biome area fractions were **not** found with primary sources in this session.

### Cited Findings
- **Galin's four realism methods.** Renderings, user studies, expert review and physical-consistency validation (for example drainage). The review warns that perceptual and quantitative judgements can disagree — [Galin 2019 §6.2](https://www.cs.purdue.edu/homes/bbenes/papers/Galin19CGF.pdf).
- **Orometric metrics as a discriminator.**
  - Prominence, dominance, isolation and saddle-orientation histograms plus a Random Forest classify mountain ranges. Synthetic terrains can be scored by the classifier and by Earth Mover's Distance of these histograms against SRTM regions — [Argudo 2019](https://people.cs.uct.ac.za/~jgain/wp-content/papercite-data/pdf/argudo2019.pdf).
  - Earlier histogram matching on heights and gradients: Parberry 2014/2015, cited in Argudo 2019.
- **Hack's law.** Main-stream length L ∝ A^h, with h ≈ 0.6 in Hack's original Virginia/Maryland basins and 0.57 per Gray. Some multi-basin analyses find no significant deviation from 0.5. h decreases slightly for larger basins — [Wikipedia: Hack's law](https://en.wikipedia.org/wiki/Hack%27s_law) (secondary; primary is Hack 1957, USGS Prof. Paper 294-B).
- **Horton ratios.** Bifurcation ratio is typically 3–5 and length ratio 1.5–3.0 in a 2025 study of Chinese basins, with regional values of about 4.0–4.6 — [J. Hohai Univ. 2025](https://jour.hhu.edu.cn/szybh/article/abstract/20250203).
- **Network fractal dimension.** D = log R_B / log R_L, "usually found to be approximately 1.9" — [Tarboton, Fractal River Networks](https://hydrology.usu.edu/dtarb/egs01fractalabs.html); [Tarboton 1996 J. Hydrol. PDF](https://hydrology.usu.edu/dtarb/TarbotonFractalRiverNetworksJH96.pdf).
- **Earth hypsometry, coarse.**
  - About 29% of Earth's surface is above sea level. 85% of the surface lies in two bands: +2000 to −500 m, and −3000 to −6000 m — [SERC Carleton](https://serc.carleton.edu/13751).
  - The global hypsometric curve has frequency maxima at about +100 m (continental lowlands) and about −4700 m (deep-sea floor) — [Britannica](https://www.britannica.com/print/article/280163).
- **Why topography is fractal** (background on self-affinity and its limits): [arXiv physics/9705033](https://arxiv.org/pdf/physics/9705033).

### Inferences
- **Practical acceptance tests for a generated 50–100 km region (inference):**
  1. **Drainage.** After depression filling, every cell drains to an outlet. River length–area pairs fit L ∝ A^0.5–0.6. Strahler bifurcation ratio is 3–5.
  2. **Hypsometry.** The land elevation histogram is right-skewed, with most area in lowlands and a long tail to the peaks, not Gaussian. Compare against a real SRTM region of the same relief class.
  3. **Slopes.** Compare the slope histogram with SRTM at the *same* resolution. Slope depends strongly on resolution, so only compare like with like.
  4. **Orometry.** Compare peak-density and prominence histograms per 1000 km² against a reference range (Argudo's method).
  5. **Biomes.** Biome fractions should follow the climate fields monotonically. Earth-level fractions are not a meaningful target for a single 100 km region.
- Pure fBm noise typically fails tests 1 and 2: it has pits and a symmetric histogram. Stream-power output passes 1 by construction (inference consistent with Galin's realism ranking).

### Gaps
- No primary source was found for:
  - global land hypsometry percentiles (for example mean land elevation, often quoted as about 840 m, **unverified**);
  - global land slope distributions (for example from SRTM or GMTED);
  - Earth biome area fractions (for example from Olson et al. 2001 WWF ecoregions).
- A Rodríguez-Iturbe & Rinaldo (*Fractal River Basins*, 1997) primary citation was not retrieved.
- Hack exponent values here rest on a secondary source (Wikipedia).

---

## What this means for the build

**Generation**
- Build three levels, all deterministic in (seed, integer cell):
  - **L0, continental:** about 2 km/cell seeded noise for uplift, base level and climate drivers, evaluable anywhere.
  - **L1, region:** a 512²–1024² block at about 100–200 m/cell, covering 50–100 km. Uplift plus implicit stream-power erosion (Cordonnier 2016 / Schott 2023, "seconds" class) runs once in a worker or WebGPU compute and is cached. At the same resolution, derive Smith–Barstad precipitation (FFT), lapse-rate temperature, Whittaker biomes and flow accumulation.
  - **L2, local:** amplification evaluated per tile in the shader or compute, 4–8× per octave and about 100–200× in total down to about 1 m. It is masked along L1 channels and kept below the coarse relief tolerance, as Argudo keeps noise below the prominence threshold, so rivers and ridges are respected.
- For unbounded worlds, generate L1 blocks with fixed L0 boundary elevations and outlets plus a ≥25–50% halo blend, the World Machine experience. Or start with a single "tens of km" region, which avoids cross-tile erosion entirely.

**Rendering and cost**
- Render with geometry clipmaps: n = 255, about 10–11 levels, 1 m finest. That covers about 260 km, uses about 0.5 M vertices, about 3 MB of height textures and about 11–35 draw calls, with toroidal compute refill and 2:1 edge morphing. Use CDLOD only if heights come as cached tiles.
- Vegetation goes in instanced tiers (meshes, then impostors, then a canopy texture) and needs its own benchmark.
- The drawing-like look is per-fragment and nearly free: distance-generalised hillshade from coarser clipmap normals, biome-indexed hypsometric tint, fwidth contours, and sky-coloured aerial perspective.
- **Budget to plan for:**
  - L1 generation: one-off, about 1–10 s at 1024² in WebGPU. This is an estimate to benchmark; no browser timing was found.
  - Memory: about 4–16 MB per cached region (several float fields at 512²–1024²).
  - Frame: a few ms GPU for terrain.

**Realism gate**
- Hold the build to measurable checks rather than eyeballing: no pits, Hack exponent 0.5–0.6, bifurcation ratio 3–5, and hypsometry and prominence histograms close (by Earth Mover's Distance) to an SRTM reference region of the same relief class.
