# Reference data plan

Status 2026-09-19: **nothing downloaded.** The dev Mac has 3.9 GB free (disk 100 % full), so large sets wait for storage. Details, licences and file listings for every set are in `../study/05-validation-data-and-metrics.md` §1.

## Principles

1. Raw data lives in `petri/ref-data/` (gitignored) or wherever `PETRI_DATA` points — an external volume is fine. Nothing in the engine or the harness needs raw data at run time.
2. What the harness needs is **derived targets**: small JSON files of statistics (degree histogram, width distribution, α, D(t), growth curves) computed once from the raw data by scripts in `petri/tools/`, committed to `petri/ref/targets/` with provenance (dataset DOI, file list, script version, date). Raw data can then be deleted or unplugged.
3. Until a set is available, its scorecard rows run against the **published numbers** of chapter 05 §3 (Tero 2010 fixture, contraction period, Marbach adaptation times, degree-3 fraction, Baumgarten 2015 coarsening). These five gates need no download at all.
4. Attribution for everything kept goes in `petri/ref/ATTRIBUTION.md` (CC BY requires it; CC0 gets it anyway).

## Stages

| Stage | Set | Size | Licence | Approved by iori | Needs | How |
|---|---|---|---|---|---|---|
| **0** | Rosina & Grube 2025 `GrowthFractalDimension.zip` (D every 60 s for 24 h; area vs time) | 2 MB | CC0 | yes, now | nothing | **Manual**: Dryad refuses scripted downloads (API wants a bearer token, the public link answers 403 to curl). Open https://datadryad.org/dataset/doi:10.5061/dryad.0k6djhb9m, download `GrowthFractalDimension.zip` and `README.md`, drop them in `petri/ref-data/rosina-grube-2025/`. |
| **1** | SMGR minimum: `processed_graphs/` (0.79 GB, 74 networkx pickles, 3134 filtered graphs) + `tools/` + `documentation/` + the processed images of 3 series (≈ 0.5 GB) | ≈ 1.3 GB | CC BY 4.0 | yes, later | ≥ 5 GB free | Selective pull from the single 453 GB zip: Edmond `/api/access/datafile/310729` returns a presigned S3 URL that honours HTTP Range; read the 79 MB central directory, then fetch members (Python `remotezip`). Script to write then: `petri/tools/fetch_smgr.py --members processed_graphs tools documentation --series 3`. First job after the pull: read `documentation/` for the **mm-per-pixel scale** (unverified in ch. 05) and check the Python-2-era pickles load (`encoding='latin1'`). |
| **2** | SMGR all `processed_images/` (53 series, 5362 ROI JPGs) | 9.4 GB | CC BY 4.0 | yes, later | external disk | same script, `--members processed_images` |
| **2** | Rosina & Grube 2024 `Data.zip` (whole-dish image every 60 s for 24 h, then macro every 4 s for 1 h; vein diameters) — the best public-domain *appearance* reference for T3 | 10.4 GB | CC0 | yes, later | external disk + manual Dryad download (same restriction as stage 0) | https://datadryad.org/dataset/doi:10.5061/dryad.79cnp5j4c |
| — | Marbach/Alim 2023 close-up movies (0.25–0.35 µm/px) + vein-radius series | 12 GB | CC BY-SA 4.0 | **not approved** (2026-09-19) | — | Would be the reference for the cell-level view (P4) and adaptation dynamics. Revisit at P4; until then the adaptation gate uses the published time constants. |
| — | Commons photographs of *P. polycephalum* (CC0/BY/BY-SA) | MBs | per file | not yet asked | — | Casebook / art-direction references; select like `iris-engine/study/select_refs.py` did. Ask before pulling. |

## What each stage unlocks

- **No data (P1–P2 start):** T0, T1, T4 complete; T2 rows against published numbers only (the five gates); T3 off.
- **Stage 0:** D(t) curve and area growth curve as T2 dynamic rows.
- **Stage 1:** T2 proper — our skeleton→graph pipeline validated on SMGR image/graph pairs, then degree, width, length, α, loop-area distributions as targets with error bars from 36 top-quality series.
- **Stage 2:** T3 appearance (sliced Wasserstein, spectrum, KID) stratified front / mid / core, at matched mm-per-pixel.

## Storage note

Stage 1 fits on the laptop once ≈ 5 GB is free. Stage 2 (≈ 20 GB) should go on an external volume with `PETRI_DATA=/Volumes/<disk>/petri-data`; derived targets come back into git, the volume can be unplugged.
