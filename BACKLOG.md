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

## 6. Fix soft-404s (SEO polish) — DONE

**Checked 2026-11-06:** both vhosts already serve a real 404 status with `404.html` through
`handle_errors` in `server_setup.sh` (commit f4d4a17); a missing URL on iori.me and 3die.fr returns 404.
The text below is the original note.

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

---

## 9. 4D Gaussian splatting (to discuss)

**Status (2026-10-13):** added by iori as a topic to discuss, not yet scoped. Nothing built.

**What it is:** Gaussian splatting extended in time, so a captured scene can move: people, water, foliage in
wind, a performance. The splats either carry a time dimension or deform over time from a canonical set.
Starting points to read and verify before the discussion:
- Wu et al., "4D Gaussian Splatting for Real-Time Dynamic Scene Rendering", CVPR 2024 (canonical splats +
  a deformation field).
- Yang et al., "Real-time Photorealistic Dynamic Scene Representation and Rendering with 4D Gaussian
  Splatting", ICLR 2024 (native 4D Gaussians sliced in time).
- Luiten et al., "Dynamic 3D Gaussians: Tracking by Persistent Dynamic View Synthesis", 3DV 2024.
- Li et al., "Spacetime Gaussian Feature Splatting", CVPR 2024.
- Browser playback and compression of dynamic splats (streaming formats, per-frame deltas): survey needed.

**How it connects to existing work:**
- Splat app remake (#1) and the splat engine research (own WebGPU core + WebGL2 twin, SPZ in git, Luma
  captures): a 4D viewer would extend that engine, not replace it.
- Training: the Windows boxes with RTX 4090/3090 (Postshot, then gsplat/nerfstudio) would also train 4D.
- Nature engine (#8) and paper 0: procedural growth and erosion could be baked into 4D splats for playback,
  or 4D captures of real plants in wind could serve as ground truth for the procedural ones.
- Music / 3DIE: captured performances as moving splat scenes.

**Questions for the discussion:**
1. What should move: people and performances, nature (plants, water), or the procedural engines' output?
2. Capture: how many cameras or phones in sync, indoor or outdoor, how long a clip?
3. Where it plays: iori.me pages, the splat app, a 3DIE release? Phone budget (memory, decode, sort)?
4. Build or adopt: own 4D extension of the planned WebGPU splat core, or an existing viewer?
5. Order relative to #1 (splat app remake) and #8 (nature engine).

**Steps when resuming:** run a research pass on the questions above (current methods, browser playback,
compression, capture rigs), bring a short options brief to the discussion, then scope a first capture and a
first in-browser playback test.
