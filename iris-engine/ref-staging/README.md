# ref-staging/ — quarantine for candidate references

Photographs that are **not** part of the base dataset (`ref/`). Nothing here is read by BENCH ISO,
BENCH ALL, the casebook, the presets or `refs.json`, so a doubtful image cannot bias a fit or a score.

A file leaves staging only by an explicit decision, recorded in `staging.json` (`promoted`, date, reason).

| field | meaning |
|---|---|
| `kind` | `full-iris` (whole iris visible), `sector` (part of the iris), `super-macro-sector` (part of the iris at ≈ 1–2 µm/px), `isolated` (iris cut out on a plain ground) |
| `verified` | camera EXIF present and nothing in the pixels contradicts a real photograph |
| `caution` | why an image is not trusted — `-UNVERIFIED` is also in its filename |

Images: 10 from Unsplash (Unsplash License — free use; no reselling unaltered copies, no competing
collection). Attribution per file in `staging.json`. The JPEGs are gitignored; re-fetch them from `raw`.

These are the partial-sample set for the gated (mixture-of-experts) fitting design, spec §23: each image
constrains only the parts of the model its mask, resolution, focus and trust allow.
