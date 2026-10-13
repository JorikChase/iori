# BACKLOG — post-overhaul projects

Instruction docs for everything deliberately deferred during the 2026-07-27
overhaul. Each entry has context, steps and resume instructions.
These items are also seeded as cards on the dashboard kanban (dash.3die.fr).

---

## 1. Splat app remake + Hugging Face hosting

**Status:** splats/ untracked from git HEAD (2.6 GB kept locally on iori's Mac),
purged from the VPS. `iori.html` shows an archive notice (probe-based, still
works locally). The old viewer was deemed unacceptable — full remake paused
until the overhaul is done.

**Target architecture:**
```
iori.me/splat.html (new SEO page, tiny, on VPS)
  └─ iframe → huggingface.co/spaces/iori/splats
                ├─ remade viewer app (Docker or static Space)
                └─ gs_*.ksplat files in the Space repo (HF LFS, free)
```
- HF account: exists (credentials with iori)
- Viewer: three.js splat viewer (@mkkellogg/gaussian-splats-3d or newer),
  gallery UX, mobile-first, lazy scene loading
- **Evaluate .ksplat → .spz conversion** (Niantic compressed splat format,
  ~2–4× smaller). Test on 1–2 scenes first (e.g. gs_kyticki, gs_lili),
  compare visual quality before batch-converting
- Mirror option if HF ever throttles: Cloudflare R2 (10 GB free, zero egress)

**Steps when resuming:**
1. Create the Space repo (Docker SDK, or static if supported)
2. Upload splats from the local `splats/` dir via `huggingface-cli` (large
   files → use `huggingface_hub` Python lib or git-lfs push)
3. Build the new viewer (start from iori.html's importmap but design the
   gallery properly — it's a remake, not a reskin)
4. Create `splat.html` on iori.me embedding the Space; register it in
   `pages.meta.json` (category "site", domain iori.me); retire iori.html
   fully; run `python3 site.py all`, commit, deploy

---

## 2. Git history rewrite (repo slimming)

**Status:** repo is ~6.8 GB locally (3.7 GB .git history — ksplat/pdf/glb
stored as plain blobs). TODO comments are in `.gitattributes` and
`server_setup.sh`. Local working trees are unaffected by splat untracking;
only history is heavy.

**Why deferred:** requires force-push + every clone to be re-created
(this Mac, the server, any collaborator machine).

**Steps when resuming:**
1. Fresh Backup A (tarball of the whole repo dir — see RESTORE.md)
2. `git lfs migrate import --include="*.ksplat,*.glb,*.pdf,*.mp4" --everything`
3. `git push --force-with-lease` (all branches + tags)
4. Server: `rm -rf /root/iori && git clone --depth 50 <url> /root/iori`
   (re-clone shallow — the deploy script tolerates it)
5. This Mac: re-clone or `git fetch + reset`; verify sizes
6. Verify site builds: `python3 site.py all && python3 site.py check`

---

## 3. iori.me landing decision (catalog vs web.html)

**Status:** web.html remains the landing (unchanged, per requirement).
catalog.html shipped as a linked page. Decision deferred.

**To flip later:** in `server_setup.sh` Caddyfile, iori.me block:
`index web.html index.html` → `index catalog.html web.html index.html`,
and `try_files ... /web.html` → `/catalog.html`. One-line change + deploy.
Both pages stay live at their URLs regardless.

---

## 4. Bandcamp activation

**Status:** iori is not on Bandcamp yet. music.html ships with a
"coming soon" placeholder block.

**When the Bandcamp page exists:**
1. Replace the `.bandcamp-box` div in music.html with the Bandcamp
   embed/player or a hard link
2. Optionally add the URL to pages.meta.json description for music.html
3. `python3 site.py all`, commit, deploy

---

## 5. Extend the blog engine to more artists

**Status:** the posts engine (api `/posts`) is generic — any dashboard
account can publish. moises.html filters `?author=moises`.

**To give jáchym/crow_archduke feed-driven pages:** clone moises.html,
change the `author` query param and the header copy, register in
pages.meta.json. The upload UI is the dashboard BLOG tab (same flow as
Instagram: pick photos → caption → publish).

---

## 6. Fix soft-404s (SEO polish)

**Status:** iori.me's SPA fallback (`try_files {path} {path}/ /web.html`)
returns 200 + web.html for nonexistent URLs — search engines see soft-404s.
**Fix when convenient:** add a real 404 page and only keep the fallback for
known hub routes; or enumerate valid pages in the Caddyfile via the site.py
generator (it already knows every page).

---

## 7. OG share images per page

**Status:** og:image is emitted only where a real image exists
(e.g. socci). Consider generating 1200×630 OG cards per experiment
(screenshot batch via headless browser) and registering paths in
pages.meta.json `og_image`.

---

## 8. Nature engine (the landscape figure grown into its own engine)

**Status (2026-10-13):** decided by iori: the landscape stays in paper 0 (fractals.html §2.6–2.7) as panels,
made richer and faster there; the full engine is a later project that will expose its logic back to the paper.
Current in-paper pieces live in `papers/fractals/` (`silviculture-*.js`, `landscape-*.js`), interface and
ownership in `papers/fractals/LANDSCAPE.md`.

**Target:** a folder app like Petri and the Iris Engine (e.g. `nature/`, canonical `https://iori.me/nature/`):
an Earth-like, fully procedural landscape with as few artistic liberties as possible, validated against real
statistics, exploring regions larger than the paper can hold.
- Terrain: uplift + stream-power erosion (n = 1, m ≈ 0.45) + hillslope diffusion + talus, strata-driven
  differential erosion, glacial erosion later; WebGPU compute (FastFlow-style routing), WebGL2 viewer fallback.
- Water: Priority-Flood lakes, Strahler rivers with hydraulic geometry and meander migration (Paris 2023
  constants), sea level, coasts, islands, straits, deltas; flow-map water rendering.
- Geology and materials: lithology regions with signature details (strata, columnar basalt, karst, granite
  tors, scree, sand, snow); soil production and wetness.
- Ecosystem: Synthetic Silviculture modules near the camera, Cordonnier 2017 / DeadWood 2024 layers at region
  scale; Hallé–Oldeman architectures; mortality, windthrow, fire, snags, logs decaying into humus.
- Scale: three seeded levels (continental noise, eroded 50–100 km region, amplified tiles), geometry clipmaps,
  vegetation impostors; climate from lapse rate + orographic precipitation + Whittaker biomes.
- Look: the paper's drawing palette and a natural palette, toggled.
- Harness: Hack, Horton, τ, concavity, hypsometry, spectrum, coastline dimension against Earth values, and a
  comparison against a real SRTM/Copernicus tile (needs iori's go-ahead for the download).

**Steps when resuming:**
1. Read `papers/study/2026-10-13-landscape-research.md` (§6 pipeline and validation table) and
   `papers/fractals/LANDSCAPE.md`; study what the in-paper version measured and where it took liberties.
2. Write `nature/study/00-summary-and-spec.md` like Petri's P0 (scope decisions with iori first:
   region size, WebGPU-only or fallback, which processes first).
3. Move the generators out of `papers/fractals/` into `nature/` as modules the paper imports back
   (the paper keeps its panels; the engine owns the logic).
4. Register `nature/index.html` in `pages.meta.json`, `python3 site.py all`, commit, deploy.
