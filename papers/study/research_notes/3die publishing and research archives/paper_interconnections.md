# How iori's paper series interconnects (repo state, 9 November 2026)

All sources are files in `/Users/iori/Desktop/code/iori` (links are repo-relative paths) or git commits in that repo. Word counts are visible text with `<script>`/`<style>` stripped, measured 2026-11-09 with a one-off script; they include captions, references and UI labels, so treat them as ±10 %.

## 1. What papers exist (title, number, URL, visibility, first published, size, status)

### Takeaway
Eight numbered entries in the series registry: four written papers (0, 0.1, 0.2, 0.3), three generated stubs (1, 2, 3), and an older essay adopted as paper 4. A ninth long-form text, the Fractal Engine's documentation paper, uses the same look and reference tooling but is not in the series registry. Only paper 0, the engine paper and paper 4 are public; every sub-paper, stub and the series index are hidden.

### Cited Findings
- The registry is the `SERIES` list in `papers/series.py`: (number, slug, title, state, description) for 0, 0.1, 0.2, 0.3, 1, 2, 3, 4. — [papers/series.py](papers/series.py)

| # | Title | URL (iori.me/…) | hidden? | First published (footer) | First git add | Size (words / h2 / h3 / figures / refs) | Status |
|---|---|---|---|---|---|---|---|
| 0 | Fractal Optimization Through a Procedural Lens | `fractals.html` | public | footer shows two versions: "first published 14 October 2025 · 04ed1a6", "this version 12 October 2026 · 5e6a84e" | 04ed1a6 (author date 2025-10-14, commit date 2025-11-01) | ~8,200 / 11 (ch 1–8, glossary, refs, summary) / 24 / 24 / 79 | written; last touched 7548f43 (2026-11-07); 29 commits on the file |
| 0.1 | Metafractal: The Space of Fractals Is Fractal | `metafractal.html` | hidden | 29 October 2026 · 2223325 | 2223325 (2026-10-29) | ~3,500 / 10 (ch 1–8) / 3 / 12 (7 live engine embeds) / 23 | written, hidden |
| 0.2 | Radiance Fields: Elements and Morphs | `radiance-fields.html` | hidden | 29 October 2026 · 2223325 | 2223325 (2026-10-29) | ~3,200 / 10 (ch 1–8) / 2 / 8 (2 engine embeds) / 22 | written, hidden |
| 0.3 | Synthetic Silviculture: Growing a Forest, Forming a World | `silviculture.html` | hidden | 7 November 2026 · 7548f43 | 6cc4499 (2026-11-06, phase 1) | ~9,400 / 7 (ch 1–5) / 20 / 15 / 42 | written in 5 phases, deployed hidden 2026-11-07 |
| 1 | Cellular Automata as the Computational Basis | `automata.html` | hidden | stub footer "12 October 2026 · 5e6a84e" | 5e6a84e | ~640, abstract + 6-item plan + "what exists" | stub, "in preparation" |
| 2 | Fractal Optimization of Tensor Landscapes | `tensor-landscapes.html` | hidden | same stub footer | 5e6a84e | ~700, abstract + 5-item plan | stub |
| 3 | Diffusion Over the Whole Document | `document-diffusion.html` | hidden | same stub footer | 5e6a84e | ~700, abstract + 5-item plan | stub |
| 4 | Lambda Cognition & the TIH Framework | `lambda_cognition.html` | public | no footer; series says "published December 2025" | 8614b32 (2025-12-01) | ~2,000 / 11 / 15 / 0 / reference section without `class="cite"` | older essay, own look (MathJax, site menu), not on paper.css |
| — | Papers (series index) | `papers/index.html` | hidden | stub footer (5e6a84e) | 5e6a84e | ~450 | generated |
| (docs) | The Fractal Engine, Tool by Tool | `fractal-engine/paper.html` | public since a4f754c (2026-10-31) | 28 October 2026 · 59327b1 | 59327b1 | ~16,900 / 14 (ch 1–11, key reference, refs) / 52 / 49 / 39 | the engine's documentation; registry key `"docs"` |

- Sources for the table: footers grepped from each HTML file; `git log --diff-filter=A` for first adds; `git show -s` for author vs commit dates; `pages.meta.json` for `hidden`. — [fractals.html](fractals.html), [metafractal.html](metafractal.html), [radiance-fields.html](radiance-fields.html), [silviculture.html](silviculture.html), [pages.meta.json](pages.meta.json)
- Registry categories: papers 0, 0.1, 0.2, 0.3 and the engine paper are `category: "fractals"`; stubs 1–3, paper 4, `papers/index.html` and `timeline.html` are `category: "essay"`. Priorities: 0 = 0.6; 0.1–0.3 and the engine paper = 0.5; stubs and index = 0.3. — [pages.meta.json](pages.meta.json)
- Other `essay`-category pages: only `timeline.html` (hidden, life-and-work timeline). It contains no link to any paper (0 matches for `fractals.html`, `papers/`, `silviculture`). — [timeline.html](timeline.html)
- The stub footers all share one constant, `FIRST = "12 October 2026", "5e6a84e"`, written by `footer()`; so every stub and the index carry the same date regardless of when they changed. — [papers/series.py](papers/series.py)
- `papers/index.html` subtitle still reads "One series, five papers", while it lists eight entries (0, 0.1, 0.2, 0.3, 1, 2, 3, 4). — [papers/series.py](papers/series.py) `index()`
- Memory note: iori says a 2023 version of paper 0 existed but was lost; "Don't claim 2023 on the page without a linkable record." — memory `fractals-paper.md`

### Inferences
- The footer "first published" date means different things per page: for paper 0 it is the oldest commit carrying the file (2025), for 0.1/0.2 the first commit, for 0.3 the first *deploy* commit (7548f43) not the first commit (6cc4499), and for stubs a shared constant. An archive page that wants consistent dates needs one rule.
- The real series today is a "0 family" (0 + three sub-papers + the engine paper, all fractal-themed, all on one stylesheet) plus three placeholders and one stylistically separate older essay.

### Gaps
- No `PLAN.md` exists for 0.1 or 0.2; their planning lives in `fractal-engine/DESIGN.md` (§ around lines 1685–1772). No plan exists for stubs 1–3 beyond the stub text in `series.py`.
- Paper 4's origin and whether it will be re-skinned into the series look is not recorded anywhere I found.

## 2. How the papers link to each other

### Takeaway
Linking is strongly hub-and-spoke around paper 0. Paper 0 links out to every other paper (hand-written chapter 8 list plus in-text links); each sub-paper links back only through its byline ("Paper 0.x of a series, a companion to paper 0"). Sub-papers do not carry the series list, and references are per paper, not shared, though five pairs overlap.

### Cited Findings
**Explicit hyperlinks (anchor hrefs) between papers**
- fractals.html → automata.html ×3, document-diffusion.html ×1, tensor-landscapes.html ×1, lambda_cognition.html ×3, metafractal.html ×2, radiance-fields.html ×1, silviculture.html ×1, `silviculture.html#ch4` ×1, `papers/` ×1, `fractal-engine/` ×1, `fractal-engine/paper.html` ×1 (+1 absolute), iris-engine/ ×3, petri/ ×4, flame-strains.html ×3, liquid-automata.html ×2. — [fractals.html](fractals.html)
- The `silviculture.html#ch4` link is inside §3.1 (the corrected self-thinning sentence: "Measured again in paper 0.3 … thins at −1.65 to −1.92 in mass"). §1.6 "The Space of Fractals" carries the links to `fractal-engine/`, `metafractal.html` and `fractal-engine/paper.html` ("Every tool, explained"). — [fractals.html](fractals.html) lines ~205–223, ~363–368
- metafractal.html → `papers/`, `fractals.html` (byline), `fractal-engine/`, `fractal-engine/paper.html`. — [metafractal.html](metafractal.html)
- radiance-fields.html → `papers/`, `fractals.html`, `metafractal.html` (byline: "a companion to paper 0 and paper 0.1") and `metafractal.html` again in ch 6 on chimeras; `fractal-engine/`. — [radiance-fields.html](radiance-fields.html) lines 83–84, 303
- silviculture.html → `papers/`, `fractals.html` (byline) only. Its text names paper 0 about 46 times ("paper 0" 16, "Paper 0" 4, "paper 0's" 17, "Paper 0's" 9) and points to "§3.1" and "§3.2" in plain text, none of it hyperlinked. — [silviculture.html](silviculture.html)
- fractal-engine/paper.html → `../fractals.html`, `../radiance-fields.html` (inside a `details.math` on the volume integral, line ~1331). No link to metafractal. — [fractal-engine/paper.html](fractal-engine/paper.html)
- lambda_cognition.html links to no other paper. — [lambda_cognition.html](lambda_cognition.html)
- Stubs link back through "What already exists": tensor-landscapes → `fractals.html#ch6`, `fractals.html#ch4-2`, `petri/`; document-diffusion → `fractals.html#ch5`, `lambda_cognition.html`; automata → flame-strains.html, petri/, game-of-life.html, ember-engine.html, mycelium.html, liquid-automata.html. — [papers/series.py](papers/series.py) `STUBS`

**Chapter anchors**
- fractals.html has ids `ch1`…`ch8-2` (32 ids); silviculture.html `ch1`…`ch5-3` (25); metafractal + radiance 21 between them. Cross-paper deep links that exist: `fractals.html#ch4-2`, `#ch5`, `#ch6` (from stubs) and `silviculture.html#ch4` (from paper 0). No paper uses an in-text `#ch` link to its own chapters except the engine paper (`#ch5`, `#ch7`, `#limits`, `#keys`). — grep of `id="ch…"` and `href="#…"` in each file

**The series list**
- `series.py` writes the series list (`<ul class="series">`) into the three stubs and `papers/index.html` only. It does not touch fractals.html ("The finished paper (fractals.html) is written by hand and is not touched here"). — [papers/series.py](papers/series.py) docstring
- fractals.html §8.2 "The Other Papers" is a hand-written copy of the same list with different descriptions (e.g. 0.1 "Section 1.6 made a paper…", 0.3 "Sections 3.1 and 3.2 made a paper…", 2 "Chapter 6 made precise…", 3 "Chapter 5 applied to text…"). §8.1 is a full live section pointing at paper 1 (Life, Langton's ant, Flame Strains, Petri, Tero fixture table). — [fractals.html](fractals.html) lines 727–803
- metafractal.html, radiance-fields.html and silviculture.html have no series list (no `class="series"` / `id="series"`). — grep
- The index subtitle promises "each ends with a pointer to the next"; only paper 0 (ch 8) and the stubs do. — [papers/series.py](papers/series.py)

**Reference system**
- `papers/fractals/refs.py <page>` renumbers `<a class="cite" href="#ref-KEY">[?]</a>` by first appearance and reorders `<li id="ref-KEY">` inside `<ol class="refs">` of that one page; it reports missing and never-cited keys. It is per-page; there is no shared bibliography file. — [papers/fractals/refs.py](papers/fractals/refs.py)
- Every page is clean: 0 → 79 entries/79 cited; 0.1 → 23/23; 0.2 → 22/22; 0.3 → 42/42; engine paper → 39/39; no missing, no unused. — script over the five pages
- Shared reference keys (same key in two lists, entries duplicated per page): 0∩0.3 = 8 (barnes2014, borchert1984, braun2013, cordonnier2016, dodds1999, makowski2019, palubicki2009, yoda1963); 0.1∩engine paper = 8 (lowe2010, mandelbrot1980, mouret2015, norton1982, sibson1981, wengert1964, wolf1985, worley1996); 0.2∩engine paper = 3 (gibson1998, hart1996, kerbl2023); 0∩0.1 = 1 (sohldickstein2024); 0∩0.2, 0.1∩0.2, 0.3∩0.1/0.2/engine = 0. — same script
- Paper 0 cites iori's own works as numbered references (17 entries such as `irisengine`, `petri`, `flamestrains`, `lambda`, `automata` "in preparation", `mirrorbrot`, `splats`), so paper 1 and paper 4 are both hyperlinked and cited. No sub-paper cites another paper of the series as a reference entry. — [fractals.html](fractals.html) refs list
- fractal-engine/DESIGN.md: the engine paper's references are numbered with the same `refs.py`. — [fractal-engine/DESIGN.md](fractal-engine/DESIGN.md)

**Shared CSS/JS**
- All series pages load `papers/fractals/paper.css` (`?v=4` on written papers, `?v=3` on generated stubs/index — series.py hard-codes v=3). Each sub-paper adds its own `papers/<name>/paper.css` + `paper.js`. — `<link>`/`<script>` grep
- 0.1, 0.2, 0.3 also load `fractal-engine/paper/paper.css?v=6` and `fractal-engine/paper/paper.js?v=10`, the engine's figure embedder ("Every figure is the engine itself in an iframe"; figures declared as `<figure … data-fig>`). 0.1 uses 7 engine figures (pushJulia, lens, lyap, chimera, ring, surface, tissue), 0.2 uses 2 (push, tetraPull), 0.3 loads the script but has no `data-fig`. `figures.js` notes "other papers embed these figures too: metafractal.html". — [fractal-engine/paper/paper.js](fractal-engine/paper/paper.js), [fractal-engine/paper/figures.js](fractal-engine/paper/figures.js)
- Paper 0's own `paper.js` is the only one that is a classic script plus `assets/menu.js`; it lazy-imports `./silviculture.js`. — [papers/fractals/paper.js](papers/fractals/paper.js) line 1292

**Shared code modules (ES imports across paper folders)**
- papers/silviculture/ imports from papers/fractals/: `silviculture-core.js` (makeRng, Sim, SPECIES, PLOT, HALF, SH_NY) in colonise, learned, lineage, modules, roots, selforg, stand, thinning; `silviculture-draw.js` in lineage; `landscape-terrain.js` (flood, receivers, resolveFlats, buildStack, accumulate, diamondSquare, noise2, hash32, mulberry32) in ground and transport; `landscape-stats.js` (computeStats, EARTH) in ground. — grep of `import … from '../fractals/…'`
- Inside papers/fractals/, the forest (`silviculture-*.js`) imports the landscape (`landscape-ground.js`, `landscape-terrain.js`) and workers (`landscape-worker.js`, `silviculture-worker.js`). — grep
- No cross-folder imports in papers/metafractal/ or papers/radiance/ (only three.js and own modules). — grep
- PLAN.md rule: 0.3 "Reuses `papers/fractals/silviculture-*.js` and `landscape-*.js` by import; it does not fork them." Memory adds: "reuse … by import, never fork". — [papers/silviculture/PLAN.md](papers/silviculture/PLAN.md)

### Inferences
- The link graph is asymmetric: everything is reachable from paper 0 and from the (hidden) index, but a reader landing on 0.1–0.3 sees only "paper 0" and "a series" links; there is no sibling navigation or "next paper" pointer.
- Paper 0's §8.2 list and `series.py SERIES` must be kept in sync by hand (commit a18d9b1 exists only to refresh paper 0's lastmod after its series list changed).
- A shared bibliography would deduplicate 20 entries today; the current design keeps each paper self-contained.

### Gaps
- I did not check whether in-text section numbers in 0.3 ("§3.1", "§3.2") still match paper 0 after later edits; they did match the h3 headings on 2026-11-09 (3.1 Trees and Forests; 3.2 A Landscape Formed by Rivers).

## 3. Conceptual dependency structure (what spawns what, what is reused, open items)

### Takeaway
Every sub-paper is a section of paper 0 "made a paper": §1.6 → 0.1, the engine's object → 0.2, §3.1–3.2 → 0.3, ch 6 → 2, ch 5 → 3, ch 8.1 → 1. Paper 0.3 also feeds back into paper 0 (a correction to §3.1 and a ranked adoption list for paper 0).

### Cited Findings
- Paper 0 §8.2: 0.1 "Section 1.6 made a paper"; 0.3 "Sections 3.1 and 3.2 made a paper"; 2 "Chapter 6 made precise"; 3 "Chapter 5 applied to text"; §8.1 opens paper 1 from Life, Langton's ant, Flame Strains, Petri and the Tero Physarum fixture. — [fractals.html](fractals.html)
- 0.2's description: "The Fractal Engine's object taken apart"; byline: companion to paper 0 and paper 0.1. — [papers/series.py](papers/series.py), [radiance-fields.html](radiance-fields.html)
- 0.1 and 0.2 were decided together with iori on 2026-10-29 because "iori asked for the engine's illustrations in the fractal paper and for a radiance-fields paper"; iori "chose sub-papers over a new chapter"; paper 0 got the §1.6 bridge. — [fractal-engine/DESIGN.md](fractal-engine/DESIGN.md) ~line 1747; memory `fractals-paper.md`
- 0.3 was chosen 2026-11-06 as "a sub-paper in the series (not a doc, not a paper 0 chapter)"; "this stretch explains and measures what exists, with no new engine features". — [papers/silviculture/PLAN.md](papers/silviculture/PLAN.md)
- Feedback from 0.3 into 0: "Correction to paper 0: fractals.html §3.1 says Makowski's model reproduces the −3/2 mass law. Makowski's figure is density against trunk diameter (Reineke)"; fixed in phase 1 (6cc4499) with a pointer to 0.3 ch 4. — [papers/silviculture/PLAN.md](papers/silviculture/PLAN.md)
- 0.3 ch 5.2 is a ranked adoption list *for paper 0*: Earth tiles through `measureGround`; InfiniteDiffusion/Lochner tiles; stamps in a 4 ha plot with storms; fire with outside seed; canopy cooling into decay; root plates by soil; Leonardo Δ; GPU particle transport; module LOD. Memory: "Next step from ch 5: Earth tiles + InfiniteDiffusion through measureGround." — PLAN.md P5 status; memory `silviculture-paper.md`
- Reused measurement: 0.3's `measureGround` runs paper 0's `computeStats` on any 10 km grid; 0.3 runs "paper 0's generator in its own worker" as the "Region" and paper 0's `Sim` with a wall hook (`sim.extraDep`, "a no-op hook added to" paper 0's core). — PLAN.md status P2, P4
- Stubs depend on paper 0 claims: paper 2 restates ch 6 (Barnes–Hut on Lévy dust, the table of fast methods) and §4.2 (Metropolis walker); paper 3 transposes paper 0's ch 5 theorem (diffusion settles large scales first because the spectrum is a power law) to text; paper 1 takes ch 8.1's Tero table as its first measured result. — [papers/series.py](papers/series.py) `STUBS`
- The 2026-10-11 brief set the series as "0 Fractal Optimization … · 1 Cellular Automata … · 2 … tensor landscapes · 3 Diffusion over the whole document … · 4 Lambda Cognition (exists). Same shell, pointer sections." It found no published source for steps 3–4 of the theorem ("the paper must prove itself"), which became paper 0 ch 5's own contribution and paper 3's hypothesis. — memory `paper-series-research.md`; [papers/study/2026-10-11-research-brief.md](papers/study/2026-10-11-research-brief.md)
- Briefs and what they feed: 2026-10-11 research brief (~13,000 words) → paper 0 and the series plan, §5 → silviculture; 2026-10-13 landscape research (~14,700) → paper 0 §3.2 / LANDSCAPE.md and BACKLOG #8 nature engine; 2026-10-29 examples research (~1,900) → "the end of the engine paper …, Metafractal (0.1) and Radiance Fields (0.2)"; 2026-11-06 silviculture SOTA (~6,600) and world-generation SOTA (~6,600) → 0.3, both explicitly "build on" the earlier two briefs. — first lines of each file in [papers/study/](papers/study/)
- iori decided 2026-10-13 "the landscape stays in paper 0 (fractals.html §2.6–2.7) as panels", full engine later (BACKLOG #8). — [BACKLOG.md](BACKLOG.md); [papers/fractals/LANDSCAPE.md](papers/fractals/LANDSCAPE.md)

### Inferences
- The series is a tree rooted at paper 0, not a chain 0→1→2→3→4 as the index copy suggests; the 0.x branch grew in Oct–Nov 2026 while 1–3 stayed stubs since 12 Oct 2026.
- 0.3 is the only paper with a two-way dependency (it corrects and directs paper 0, and paper 0 links into it at #ch4); the others only receive from paper 0.

### Gaps
- No document states the intended order or criteria for writing papers 1–3, or whether more 0.x sub-papers are planned (memory only lists 0.1–0.3 and BACKLOG #8).

## 4. How papers are built and published today, and the traps

### Takeaway
Hand-written HTML per paper + `refs.py` per page + `series.py` for stubs/index + `site.py all` for SEO/menu/sitemaps; hidden pages are noindex and absent from every hub. Versioning is a hand-set footer; sitemap lastmod is git-derived from the HTML file only.

### Cited Findings
- Build order: `python3 papers/series.py && python3 site.py all`; "site.py fills the SEO block and the site menu". series.py writes an empty `<!-- SEO:BEGIN … --> <!-- SEO:END -->` block, so running it without `site.py all` afterwards leaves stubs/index with no head metadata. PLAN.md: "Order matters: series.py rewrites pages without their SEO block, so run `python3 site.py all` after it." — [papers/series.py](papers/series.py), [papers/silviculture/PLAN.md](papers/silviculture/PLAN.md)
- `hidden: true` → `robots "noindex, nofollow"`, skipped by sitemap, hubs, `site.py nav` (iori_INDEX), and `cmd_menu` (no site burger). Observed: site-menu present in fractals.html (9 hits), fractal-engine/paper.html (9), lambda_cognition.html (5); absent (0) in metafractal, radiance-fields, silviculture, automata, tensor-landscapes, papers/index. — [site.py](site.py) lines ~276–277, 484, 677, 704; grep
- lastmod: `git_lastmod(filename)` = date of last commit touching that HTML file, else mtime. Edits that only change `papers/*/…js` do not move the page's lastmod; commit a18d9b1 "site: fractals.html lastmod 2026-11-07 (paper 0's series list)" touched only pages.json and the sitemaps. — [site.py](site.py) lines 175–192; `git show --stat a18d9b1`
- Versioning: "paper footers carry 'first published <date> · <commit link>' (papers/series.py FIRST/footer() for the stubs; hand-set in fractals.html, metafractal.html, radiance-fields.html, fractal-engine/paper.html)", introduced 46604cc and f41d252 on 2026-10-29. Cache-busting is manual `?v=N` on every CSS/JS include ("bump every `?v=` on a changed import or the cache serves the old module"). — memory `fractals-paper.md`, `silviculture-paper.md`; `git log -- fractals.html`
- Deploy: rsync excludes `*.md`, `*.py`, `tools/`, so `papers/study/`, PLAN.md, LANDSCAPE.md, `series.py`, `refs.py` never reach the webroot, while `papers/**/*.js|css|html` do (they must, since pages import them). — [server_setup.sh](server_setup.sh) lines 123–156
- Measurement rigs live outside papers/: `tools/silviculture/measure.mjs`, `stand-measure.mjs`, `ground-measure.mjs`; `tools/fractals/*-test.html`; the engine's `run-paper.mjs --page metafractal.html | radiance-fields.html`. — PLAN.md; [fractal-engine/DESIGN.md](fractal-engine/DESIGN.md) ~line 1769
- Other traps recorded: pushes of ~50 MB time out (HTTP 408); other tracks push main from the same checkout, so `git fetch` and re-diff before pushing; the hidden Browser pane gives no IntersectionObserver ticks (drive figures with `advance(n)`). — memory `silviculture-paper.md`, `fractal-engine-design.md`

### Inferences
- An imprint/archive needs at least: a single source of truth for the series list (today two: `SERIES` and fractals.html §8.2), a uniform "first published / this version" rule, and a lastmod that follows the paper's code folder, not just its HTML.
- Because sub-papers are hidden, the only public path into the series is paper 0 (and 3die.fr's index, which links "iori" to `/fractals.html`).

### Gaps
- No per-paper version history beyond paper 0's two-version footer; no DOI/archival snapshot mechanism exists in the repo.

## 5. Engines and apps outside papers/ that the papers cite or embed, and backlinks

### Takeaway
The Fractal Engine is embedded live (iframes) in 0.1 and 0.2 and is the only outside app with a paper-style docs page that links back into the series. Petri, Flame Strains, Iris Engine and the single-rule automata are linked and cited from paper 0 but none of them links back to any paper.

### Cited Findings
- fractal-engine/: embedded through `fractal-engine/paper/paper.js` + `figures.js` (9 figure embeds across 0.1 and 0.2); linked from 0 (§1.6), 0.1, 0.2; its docs paper links `../fractals.html` and `../radiance-fields.html`; `figures.js` comments name `radiance-fields.html` and `metafractal.html` as embedders. DESIGN.md calls iteration depth "coarse-to-fine … paper 0's thesis" and uses "paper 0's" fBm field. — [fractal-engine/paper/figures.js](fractal-engine/paper/figures.js), [fractal-engine/DESIGN.md](fractal-engine/DESIGN.md)
- The engine app (`fractal-engine/index.html`) links to its docs paper via the site burger's docs item (`"docs"` registry key, site.py line ~555) but contains no link to fractals.html or the sub-papers. — grep returned no match in fractal-engine/index.html
- petri/: linked ×4 and cited from paper 0 (§8.1, Tero table: Petri n = 21 vs Tero 2010, e.g. total length/minimum tree 1.80 ± 0.26 vs 1.75 ± 0.30); listed in stubs 1 and 2. No backlink found in petri/*.html or *.md. — [fractals.html](fractals.html); grep
- iris-engine/: linked ×3 and cited (`irisengine`) from paper 0 (spectra measured on iris, per memory: 2.87 / 2.73). No backlink in iris-engine/*.html or *.md. — [fractals.html](fractals.html); memory `fractals-paper.md`
- flame-strains.html (×3), liquid-automata.html (×2), plus cited game-of-life, ember-engine, mycelium, slime mold: linked from paper 0 and the automata stub; none links back (their only matches are site-menu prev/next to each other). — grep
- Landscape/forest code is not an outside app: it lives in `papers/fractals/` (LANDSCAPE.md ownership table: ground agent / plant agent / main session). Test harnesses in `tools/fractals/` link the paper code. — [papers/fractals/LANDSCAPE.md](papers/fractals/LANDSCAPE.md)
- Site hubs: `web.html` curated edges include fractals.html ↔ webgl, meta-iris, orbitals, lambda_cognition; `iori_INDEX.html` treats fractals.html as a PRIMORDIAL cell and lists it and the engine paper in the NAV block. 3die.fr `index.html` links "iori" → `/fractals.html`. — [web.html](web.html), [iori_INDEX.html](iori_INDEX.html), [index.html](index.html)

### Inferences
- For a "connected whole", the cheapest missing edges are backlinks from Petri, Flame Strains, Iris Engine and the Fractal Engine app to the paper that cites them.

### Gaps
- Did not inspect every subfolder of petri/ and iris-engine/ (only top-level *.html and *.md); a deeper JS-generated link could exist.

## 6. Graph (nodes and typed edges)

### Takeaway
Nodes: P0, P0.1, P0.2, P0.3, P1, P2, P3, P4, IDX (papers/index.html), FEP (fractal-engine/paper.html), FE (fractal-engine app), PETRI, FLAME (flame-strains), IRIS (iris-engine), CA-SMALL (game-of-life, ember, mycelium, frost, slime mold), SERIES (series.py), REFS (refs.py), BRIEF-1011, BRIEF-1013, BRIEF-1029, BRIEF-1106s (silviculture SOTA), BRIEF-1106w (world-gen SOTA), PLAN03 (silviculture PLAN.md), DESIGN (fractal-engine/DESIGN.md).

### Cited Findings
| From | To | Type | Evidence |
|---|---|---|---|
| P0 | P0.1, P0.2, P0.3, P1, P2, P3, P4, IDX | links to | ch 8.2 list, §1.6, §3.1 (#ch4), refs — fractals.html |
| P0 | P1, P4 | cites (numbered ref) | ref keys `automata`, `lambda` — fractals.html |
| P0 | FE, FEP, PETRI, FLAME, IRIS, CA-SMALL | links to + cites | fractals.html |
| P0.1 | P0, IDX, FE, FEP | links to | metafractal.html |
| P0.1 | FE | embeds (7 live figures) | data-fig, fractal-engine/paper/paper.js |
| P0.2 | P0, P0.1, IDX, FE | links to | radiance-fields.html |
| P0.2 | FE | embeds (2 live figures) | radiance-fields.html |
| P0.3 | P0, IDX | links to | silviculture.html |
| P0.3 | P0 | imports code from | silviculture-core/draw.js, landscape-terrain/stats.js |
| P0.3 | P0 | corrects / feeds back (ch 5.2 adoptions) | PLAN.md |
| P0.1 | P0 | spawned from §1.6 | fractals.html §8.2, DESIGN.md |
| P0.2 | P0 / FE | spawned from the engine's object | series.py, DESIGN.md |
| P0.3 | P0 | spawned from §3.1–3.2 | fractals.html §8.2, PLAN.md |
| P1 | P0 | spawned from ch 8.1 | fractals.html §8.1, series.py |
| P2 | P0 | spawned from ch 6 (+§4.2) | series.py STUBS |
| P3 | P0 | spawned from ch 5 | series.py STUBS |
| P1 | PETRI, FLAME, CA-SMALL | links to | series.py STUBS |
| P2 | P0 (#ch6, #ch4-2), PETRI | links to | series.py STUBS |
| P3 | P0 (#ch5), P4 | links to | series.py STUBS |
| P1, P2, P3, IDX | all series entries | links to (generated list) | series.py `series_list` |
| P0, P0.3 | each other | shares references (8) | refs script |
| P0.1, FEP | each other | shares references (8) | refs script |
| P0.2, FEP | each other | shares references (3) | refs script |
| P0, P0.1 | each other | shares references (1) | refs script |
| FEP | P0, P0.2 | links to | fractal-engine/paper.html |
| FE | FEP | links to (docs burger item) | site.py `docs` |
| P0, P0.1, P0.2, P0.3, FEP, P1–P3, IDX | papers/fractals/paper.css | shares CSS | `<link>` grep |
| P0.1, P0.2, P0.3 | fractal-engine/paper/paper.{css,js} | shares CSS/JS | `<link>`/`<script>` grep |
| SERIES | IDX, P1, P2, P3 | generates | series.py |
| REFS | P0, P0.1, P0.2, P0.3, FEP | numbers citations (per page) | refs.py, DESIGN.md |
| BRIEF-1011 | P0, series plan, P0.3 (§5), P3 hypothesis | informs | memory paper-series-research.md |
| BRIEF-1013 | P0 §3.2, LANDSCAPE.md, BACKLOG #8 | informs | LANDSCAPE.md |
| BRIEF-1029 | FEP, P0.1, P0.2 | informs | brief header |
| BRIEF-1106s, BRIEF-1106w | P0.3 | informs (build on 1011, 1013) | brief headers, PLAN.md |
| PETRI, FLAME, IRIS, FE app, P4 | any paper | links back | none found |

### Inferences
- In-degree within the series: P0 is linked from every paper and stub; P0.1 from P0 and P0.2 (and IDX/stubs); P0.2 from P0, FEP; P0.3 only from P0 (one in-text deep link + ch 8 list) and IDX/stubs. Out-degree: P0 ≫ others; P0.3 has the most textual dependence on P0 with the fewest hyperlinks.

### Gaps
- Edges are based on static HTML/JS; links injected at runtime by page scripts (other than the engine figure iframes) were not traced.
