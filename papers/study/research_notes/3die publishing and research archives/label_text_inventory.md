# 3die publishing: inventory of text works across 3die.fr and iori.me (repo state, 9 November 2026)

Scope: a read-only survey of /Users/iori/Desktop/code/iori. Sources are repo paths, relative to the repo root unless they are absolute. Word counts are visible text after removing `<script>`, `<style>` and the generated SEO/NAV/MENU blocks, so treat them as approximate. "Hidden" means `"hidden": true` in pages.meta.json: noindex, left out of sitemaps and hubs, but still reachable by URL. required.md was not opened.

## 1. Which authors or artists does the 3die label present?

### Takeaway
3die.fr presents four people today. **iori** (Jorik Jonathan Chase) is the author of nearly every text in the repo. **jáchym** publishes both as himself and as his alias **crow_archduke**. **moises** is a photographer whose photo journal is filled from the dashboard. **Lukáš Kalivoda**, a Prague glass artist, has a hidden draft page awaiting his review. The music catalogue is iori's alone (artist and label name "IORI"). No artists JSON exists: the artist list is hard-coded in portfolio.html, and artist pages carry `type: artist` in the registry.

### Cited Findings
- The registry holds 7 pages of `type: artist`: jachym.html, crow_archduke.html, moises.html and kalivoda/index.html (all domain 3die.fr, category `artist`), plus iori.html, umprum.html and lili.html on iori.me (categories `site` and `experiment`). — [pages.meta.json](pages.meta.json)
- jachym.html says he "works across image, sound and text. Under the 3DIE label he publishes both as himself and as crow_archduke — his ceremonial, darker alias". The page has one bio paragraph (~84 words of visible text in all) and says "works and posts appear here as they are published". — [jachym.html](jachym.html)
- crow_archduke.html is a volumetric piece called "The Cathedral" plus a short bio ("ritual pieces, volumetric spaces and sermons from the age of data"). It notes that "Content on this page is curated by jáchym's account via the 3DIE dashboard". Its registry `sameAs` is soundcloud.com/5gmaelstroem and instagram.com/5gmaelstrom. — [crow_archduke.html](crow_archduke.html), [pages.meta.json](pages.meta.json)
- moises.html is a "Photo Journal" with no static prose. It fetches `${API}/posts?author=moises` at runtime. The dashboard guide, written in Czech and addressed to him, explains how to add posts (photos, video, sound, text) and lay them out on the CANVAS. — [moises.html](moises.html), [dash/guide.html](dash/guide.html)
- Kalivoda: kalivoda/index.html is hidden, with the registry note "draft content awaiting the artist's review — drop hidden to publish". It holds about 616 words: an exhibition list (for example Galerie Skleňák 2025, *Jemný řez / Soft Cut* at Galerie Kuzebauch 2025, *MATCHES* in Sedlec Cathedral 2025, *Mirages in Water* 2024), an About section and Contact. It went live unlisted at 3die.fr/kalivoda/ on 2026-10-28. — [kalivoda/index.html](kalivoda/index.html), [kalivoda/HANDOFF.md](kalivoda/HANDOFF.md), [memory kalivoda-page.md](/Users/iori/.claude/projects/-Users-iori-Desktop-code-iori/memory/kalivoda-page.md)
- portfolio.html hard-codes `ARTIST_META` with three entries: iori ("procedural / shaders / 3d"), jáchym ("artist") and moises ("photography"). Neither crow_archduke nor Kalivoda appears there. — [portfolio.html](portfolio.html) lines ~212–216
- Music: music.html reads "IORI — COMING SOON / the catalogue is being pressed" and links iori's SoundCloud (soundcloud.com/ioriori) and Bandcamp. — [music.html](music.html)
- The release plan covers IORI only: 145 SoundCloud uploads, 20 live on stores, 112 never submitted. Releases use the label "IORI", and the songwriter field needs a full legal name. The plan contains no liner notes or release texts, only form metadata (title, genre, ISRC, artwork rules). — [tools/release/PLAN.md](tools/release/PLAN.md), [tools/release/catalogue.csv](tools/release/catalogue.csv)
- SoundCloud handle conflict: 5gmaelstroem is the crow_archduke `sameAs`, and it also appears in the 3DIE Organization JSON-LD `sameAs` on every 3die page (index.html, start.html) and in music.html and jachym.html. ioriori appears in music.html and umprum.html. — [index.html](index.html) line 55, [pages.meta.json](pages.meta.json)
- Client-work pages (category `client`): metyou.html (MetYou.ai case study, `lang: cs`, ~235 words of Czech marketing copy), univerzum.html (school website), websites.html (an index naming "Jaroslav Jaro", "ZŠ Univerzum" and "MetYou.ai"), theatre-mask/index.html (hidden, a drama-lessons client page). — [pages.meta.json](pages.meta.json), [metyou.html](metyou.html), [websites.html](websites.html)
- The 3die.fr landing star linktree (start.html, links in assets/star-tree.json) offers "art + games = crow_archduke (= jáchym), iori.me, RPG Tennis multiplayer". — [memory start-star-linktree.md](/Users/iori/.claude/projects/-Users-iori-Desktop-code-iori/memory/start-star-linktree.md)

### Inferences
- In text terms the label is iori plus three or four guests. Only iori has substantial written work in the repo. jáchym is the only other artist described as working "in text", and none of his text is in the repo; it would come in through dashboard posts.
- Because 5gmaelstroem sits in the label-wide `sameAs`, the label's own identity is currently tied to crow_archduke's SoundCloud. An author index for an imprint would need that resolved.

### Gaps
- No repo file says whether Kalivoda, MetYou or the theatre-mask client count as label "authors". He is listed under `artist`, but only as an unlisted draft.
- Whatever text jáchym or moises have posted lives in the VPS SQLite `posts` table, not in git. Its contents could not be inspected locally.

## 2. Which pages are already text works or contain substantial prose?

### Takeaway
The substantial published or near-published text is iori's **paper series** (8 pages plus an index, about 45,000 words, with the Fractal Engine manual-as-paper alone near 17,000), the **Audio Tools docs**, an **essay** (Lambda Cognition), a **Czech memoir** inside the timeline, and **Kalivoda's exhibition texts**. Behind those sits a much larger body of internal prose (studies, specs, research briefs, handoffs): about 500,000 words of markdown, mostly internal working documents.

### Cited Findings: public or hidden pages with real prose (author is iori, Jorik Jonathan Chase, unless stated)

| Page (URL) | Domain | Kind | Hidden? | ~Words | Date | Notes |
|---|---|---|---|---|---|---|
| fractal-engine/paper.html (iori.me/fractal-engine/paper.html) | iori.me | manual or documentation written as a paper | public | 16,900 | first commit 2026-10-28, last 2026-11-04 | "The Fractal Engine, Tool by Tool… A companion to the Fractal Engine and to paper 0. October 2026." Registry `docs` key links it from the app's menu |
| silviculture.html | iori.me | paper 0.3 | hidden | 9,400 | November 2026 (series.py) | "Synthetic Silviculture: Growing a Forest, Forming a World"; plan in papers/silviculture/PLAN.md |
| fractals.html | iori.me | paper 0 | public | 8,200 | October 2026 | "Fractal Optimization Through a Procedural Lens"; refs.py numbers the citations |
| metafractal.html | iori.me | paper 0.1 | hidden | 3,500 | October 2026 | "Metafractal: The Space of Fractals Is Fractal" |
| radiance-fields.html | iori.me | paper 0.2 | hidden | 3,200 | October 2026 | "Radiance Fields: Elements and Morphs" |
| lambda_cognition.html | iori.me | essay / theoretical paper (paper 4) | public | 2,000 | "Published: December 2025" (first commit 2025-12-01) | byline "Jorik Jonathan Chase, Lead Researcher, Lambda Cognition Laboratory" |
| tensor-landscapes.html | iori.me | paper 2 stub | hidden | 700 | in preparation | category `essay` |
| document-diffusion.html | iori.me | paper 3 stub | hidden | 700 | in preparation | category `essay` |
| automata.html | iori.me | paper 1 stub | hidden | 640 | in preparation | "Abstract: In preparation" |
| papers/index.html | iori.me | series index | hidden | 450 | 2026-10-12, last 2026-11-07 | "One series, five papers… iori Jorik Jonathan Chase, 3DIE — Design, Art & Technologies Label" |
| audio/docs.html | 3die.fr | manual / help | hidden | 1,400 | 2026-10-30 | "Audio Tools Docs — Gestures for Every Tool"; source markdown in audio/docs/*.md (~30,000 words total incl. FORMAT.md) |
| kalivoda/index.html | 3die.fr | artist statement / CV / exhibition texts (subject: Lukáš Kalivoda; written by iori/Claude from public sources) | hidden (unlisted) | 600 | 2026-10-25 → 2026-11-07 | draft awaiting the artist's review |
| death.html | iori.me | text-art piece (category gravity) | public | ~600 tokens, mostly █ block glyphs | 2026-01-05 | "death.sh"; probably a visual or terminal piece, not prose |
| iori_INDEX.html | iori.me | hub (NAV list) | public | 466 | — | generated link list, not prose |
| metyou.html | 3die.fr | client case study (Czech) | public | 235 | — | marketing copy |
| multiOS.html | iori.me | experiment with UI text | public | 264 | — | not prose |
| game_multiplayer.html, flame-strains.html, iris-engine/index.html, blackjach/index.html | mixed | app intro / help text | public | 150–400 each | — | short app copy |
| jachym.html, crow_archduke.html | 3die.fr | artist bio (short statement) | public | 84 / 96 | — | single paragraphs |
| timeline.html (+ timeline/data/*.json) | iori.me | timeline entries / memoir | hidden | page 3; data ~3,300 words of bodies across 250 entries | origin 2003-12-04; data generated 2026-10-14 | see below |
| theatre-mask/index.html | 3die.fr | client page | hidden | 5 | Oct 2026 | interactive mask, no prose |
| dash/guide.html | dash.3die.fr | how-to guide (Czech, for moises) | not in registry | 1,290 | 2026-10-10 | manual |

Sources: [pages.meta.json](pages.meta.json), [papers/series.py](papers/series.py) (SERIES list: numbers 0, 0.1, 0.2, 0.3, 1, 2, 3, 4 with titles, states and one-paragraph descriptions), and the page files themselves.

- Timeline data: 250 entries in 11 address "chapters" (Vinohrady 2003 → Jiráskovo náměstí 2023–2026). Kinds: embed 119 (mostly SoundCloud tracks, tag `music` 116), page 83 (iori.me/3die.fr pages, with a one-line description each), text 28, image 16, mention 4. Body words by kind: page 1,256, **text 1,191**, embed 816. The 28 `text` entries are a Czech childhood memoir, unaccented and informal, tagged `readme`, running 2004–2014 plus a few in 2025–26 (e.g. "a ted do ni zacinam zapisovat denik"). — [timeline/data/2004.json … 2026.json](timeline/data/), [timeline/data/index.json](timeline/data/index.json)
- Timeline privacy rules: "everything public except the most intimate: the 24 entries listed in privacy.json stay private". timeline/data/ is gitignored, and the page uses a timeline-only pass. — [handoffs/2026-10-16-timeline.md](handoffs/2026-10-16-timeline.md) lines 38–51, 66
- The local timeline data still holds media URLs of the form `http://127.0.0.1:8796/media/t/…` (local publish output). — [timeline/data/2025.json](timeline/data/2025.json)

### Cited Findings: internal prose documents (markdown, not pages); all would need flagging as internal

| File | ~Words | Date (last commit) | Kind | Notes |
|---|---|---|---|---|
| iris-engine/study/00-summary-and-spec.md | 38,900 | 2026-09-21 | study / spec | plus 01–16 studies (anatomy & optics 4.4k, colour science 4.6k, rendering literature 3.8k, procedural synthesis 3.4k, microstructure 5.3k, materials 4.7k, 3D capture SOTA 4.0k…) ≈ 130k words; deploy excludes iris-engine/study/ |
| iris-engine/study/11-plan-every-eye-a-layer-model.md | 24,100 | 2026-10-10 | plan | |
| iris-engine/study/outreach-2026-10-19.md | 800 | 2026-11-06 | outreach letter | relates to the email to Charles University CGG |
| iris-engine/HANDOFF.md, README.md, handoffs/*.md (8) | 3,750 + 1,400 + ~15,000 | Sept–Nov 2026 | handoffs | |
| fractal-engine/DESIGN.md | 32,500 | 2026-11-04 | design doc | prose with phases P0–P8, Q0–Q5 |
| petri/study/00–07 + HANDOFF.md + proto/FINDINGS.md | ~45,000 | Sept 2026 | studies (Physarum biophysics, algorithms, optics, validation, a "think tank") | |
| moshine/study/SPEC.md, research/*.md (datamoshing techniques 9.6k, timeline editors 7.7k, web platform 6.8k), HANDOFF.md 8.6k, TUTORIAL-PLAN.md | ~45,000 | Oct 2026 | spec / research | MOSHINE is client-facing ([memory moshine-two-checkouts](/Users/iori/.claude/projects/-Users-iori-Desktop-code-iori/memory/MEMORY.md)) |
| audio/RESEARCH.md 9.0k, PLAN.md 2.6k, MATRIX.md 5.8k | ~17,000 | Nov 2026 | research / plan / test ledger | |
| papers/study/2026-10-11-research-brief.md (13.0k), 2026-10-13-landscape-research.md (14.7k), 2026-11-06-silviculture-sota.md (6.6k), 2026-11-06-world-generation-sota.md (6.6k), 2026-10-29-examples-research.md (1.9k); reports/ are duplicates of the first two | ~43,000 unique | Oct–Nov 2026 | research briefs (Claude-assisted deep research) | |
| papers/fractals/LANDSCAPE.md, papers/silviculture/PLAN.md | 1.6k, 1.3k | | plans | |
| AUTOMATA_CATALOG.md | 8,700 | 2026-09-02 | reference catalogue ("The Universal Automata Catalog") | |
| kalivoda/HANDOFF.md, tools/kalivoda-audit/AUDIT.md | 2.5k, 1.3k | Nov 2026 | technical handoff | |
| handoffs/*.md (site, timeline plan 3.6k, tennis MP, icons & loaders plan 3.5k, agenda) | ~14,000 | Sept–Nov 2026 | handoffs | |
| BACKLOG.md | 1,400 | 2026-11-06 | backlog | |
| notes/session-ses_0abd.md | 72,300 | — | raw session transcript | the deploy excludes `session-*.md`; not a work |

Sources: the word-count sweep over every `*.md` (excluding .claude/worktrees, bench-ref, api/venv) and `git log -1` dates.

### Inferences
- Candidate "kinds" for the imprint that already exist: **papers** (series 0–4), **manual or documentation** (Fractal Engine paper, Audio Tools docs, dashboard guide), **essay** (Lambda Cognition), **memoir or timeline** (Czech text entries), **artist statements** (jáchym, crow_archduke, Kalivoda), **client case studies** (MetYou). **Studies or research briefs** exist only internally.
- Kinds the brief named that are **absent**: liner notes, release texts, album descriptions. The release work holds metadata only. No interview, review or press text exists either.
- The fractal-engine paper shows that the "docs as paper" pattern is already established (the registry `docs` key plus the menu link).
- Unconfirmed exposure risk: server_setup.sh's rsync excludes iris-engine/study/, tools/, dash/, api/ and `session-*.md`, but it does **not** exclude papers/ (memory paper-series-research says so too), fractal-engine/DESIGN.md, petri/study/, moshine/study/ or the HANDOFF.md files. Those markdown files are therefore probably copied into the webroot and fetchable by URL unless Caddy blocks `.md`. Caddy config was not checked. — [server_setup.sh](server_setup.sh) lines ~115–150

### Gaps
- Lambda Cognition's byline names a "Lambda Cognition Laboratory"; nothing in the repo describes it.
- Dates for jáchym's and crow_archduke's bios are not recorded (first commit 9485ffd "new pages: … jachym, crow_archduke…").
- Who wrote Kalivoda's text: the handoff implies it was assembled from public sources (praha6.cz, galeriekuzebauch.com, Material Times) and is awaiting his confirmation.

## 3. How are pages categorised today, and how do the hubs present them?

### Takeaway
pages.meta.json has a flat `category` and a `type` per page. The text works are scattered: papers sit under `essay` (hidden stubs, timeline, lambda) and `fractals` (fractals, metafractal, radiance, silviculture, fractal-engine paper), and the Audio docs under `tools`. **No "writing", "texts", "library" or "publications" category or hub exists.** The nearest things are the hidden papers/index.html (series index) and the `essay` category. catalog.html no longer exists; it was replaced by portfolio.html.

### Cited Findings
- The registry has 140 pages. Types: experiment 71, app 37, game 9, site 9, artist 7, client 4, internal 3. Categories by domain: 3die.fr has tools 24, game 9, site 5, artist 4, client 4, materials 1. iori.me has tools 15, fractals 10, materials 9, automata 8, **essay 6**, gravity 6, flames 6, organisms 5, fluids 4, dispheres 4, hub 4, internal 3, eyes 3, experiment 3, voxels 3, dimensions 2, site 2. 51 pages are hidden. — [pages.meta.json](pages.meta.json)
- The `essay` category holds automata.html, document-diffusion.html, tensor-landscapes.html, papers/index.html and timeline.html (all hidden) and lambda_cognition.html (public). All have `type: experiment`; no `paper`, `essay` or `text` type exists. — [pages.meta.json](pages.meta.json)
- Other registry keys: `docs` (a page's documentation slug, rendered as a "docs" menu link opening in a new tab), `order`, `menu`, `menu_pos`, `sameAs`, `lang`, `og_image`, `_note`, `icon_gallery`. — [pages.meta.json](pages.meta.json), [site.py](site.py) lines 555–565
- site.py emits schema.org JSON-LD by type: `VideoGame` for games, `Person` with `memberOf: 3DIE` for artists, `WebApplication` for apps. It has no `ScholarlyArticle`, `Article` or `Book` branch. — [site.py](site.py) lines ~230–260
- `python3 site.py manifest` writes pages.json (slug, title, description, category, type, domain, url, og_image, lastmod) as the "auto-feed for hub pages: catalog, web3d". — [site.py](site.py) line 11, [pages.json](pages.json)
- catalog.html is absent from disk and from git. Commit f4d4a17 "final touches: portfolio swap, iori_INDEX landing…" replaced it, after 9485ffd introduced it. — git log
- portfolio.html ("The whole iori catalogue in one brutal list: artists first") shows an artists strip from ARTIST_META, then category chips sorted by a hard-coded CATEGORY_ORDER (`eyes, fractals, automata, flames, fluids, organisms, gravity, voxels, dispheres, dimensions, materials, game, experiment, hub, essay, site, client`). It shows only `type === experiment || game`, and `?cat=` preselects a chip. — [portfolio.html](portfolio.html) lines 194–240
- web3d.html places each category on a Fibonacci-sphere anchor and draws pages as white nodes, with hubs as wireframe nodes on a black background in Courier New. — [web3d.html](web3d.html) lines 62, 121–148
- iori_INDEX.html has a generated `<!-- NAV:BEGIN/END -->` link list grouped by category headings (`<h2>artist</h2>`, `<h2>automata</h2>`, …), the crawlable list behind the WebGL INDEX panel. — [iori_INDEX.html](iori_INDEX.html) line 396, [AGENTS.md](AGENTS.md)
- papers/series.py generates each paper's series list and its footer ("first published {date} · {commit}"), and writes the stubs. — [papers/series.py](papers/series.py)

### Inferences
- A 3die publishing imprint would most likely need a new `type` (e.g. `text`/`paper`) or category, a JSON-LD branch (Article or ScholarlyArticle), and an entry in portfolio's CATEGORY_ORDER/ARTIST_META. The `docs` key and series.py are the existing building blocks.
- Papers live on iori.me while the label lives on 3die.fr. The papers' byline already reads "3DIE — Design, Art & Technologies Label", so cross-domain canonical placement is a decision to make.

### Gaps
- How web.html presents categories was not inspected in detail. It is a 2-D node graph per its description.

## 4. Shared long-form styling and 3die.fr's visual identity

### Takeaway
There are two distinct visual worlds. The **papers** use a light, academic look: white paper, Lora serif headings, Inter body text at 17px/1.68, a 40rem reading column, 54rem figures and semantic colour tokens. The **3die.fr label** is black-and-white brutalist: Courier New monospace, uppercase letter-spaced labels, grey #555 links, blinking cursor titles and 2px white rules. The landing uses a WebGL scene on a measured blue-dusk gradient, and the shop uses "Milksea"/Tilt Neon with yellow #ffff00. The timeline has a third look (Outfit, dust and amber).

### Cited Findings
- papers/fractals/paper.css (203 lines) is the base for all papers. `:root` tokens: `--paper #ffffff`, `--ink #1d2024`, `--ink-2 #4a4f55`, `--muted #74797f`, `--rule #e7e9eb`, `--wash #f6f7f8`, `--link #1f5fbf`, and semantic figure colours `--walk #e0703a`, `--data #23936a`, `--noise #2d6fd2`, `--note #8a5cc4`. Fonts: `--serif 'Lora'`, `--sans 'Inter'`, `--mono ui-monospace/SF Mono`. Measures: `--text 40rem` (reading column), `--wide 54rem` (figures). Body `17px/1.68` Inter, h1–h3 Lora 700, a reading progress bar, a contents rail on wide screens, figure counters. Its header comment: "Light, minimal, legible: one text column, figures a little wider, a quiet contents rail". Fonts are loaded from Google Fonts (Inter 400/700, Lora 400/700/italic). — [papers/fractals/paper.css](papers/fractals/paper.css), [fractals.html](fractals.html) line 75
- Per-paper overrides are small: papers/silviculture/paper.css (58 lines: data tables, figure aspect ratios), papers/metafractal/paper.css (17), papers/radiance/paper.css (26). — those files
- The timeline uses Outfit (variable 100–900, chosen weight bold) from Google Fonts. Light tokens: `--paper #ebe5da` ("dust"), `--ink #1d1a16`, `--amber #b9581a` ("sodium light"), `--teal #2f6573` ("the machine"). Dark: `#0b0a09` and `#e7dfd1`. The settings JSON holds `font: outfit, weight: bold, theme: system`. — [timeline/timeline.css](timeline/timeline.css), [timeline.html](timeline.html) line 81, [timeline/data/index.json](timeline/data/index.json)
- 3die artist and site pages (jachym.html, music.html, crow_archduke.html): `body { background:#000; color:#fff; font-family:"Courier New", ui-monospace, monospace }`. The header has a `.logo` with letter-spacing .3em and a 2px white bottom border. Links are #555, uppercase, letter-spacing .15em, white on hover. The hero h1 is `clamp(2.5rem, 9vw, 6rem)`, uppercase, with a blinking `_` cursor (e.g. "JÁCHYM _", "3DIE _ MUSIC"). Section labels are .75rem with letter-spacing .35em in #555, `.bio` uses line-height 1.9, colour #ddd and max-width 60ch, and work links are full-width rows with a 1px #1a1a1a rule that slide 1rem on hover. Selection is inverted. — [jachym.html](jachym.html) `<style>`
- info.html uses Courier New, black and white, with a red #ff3b30 accent, plus "Milksea"/"Tilt Neon" for a heading. Its content is a contact form, "MESSAGE THE LABEL", posting to the API `/contact`. — [info.html](info.html), [api/main.py](api/main.py) line 709
- index.html (3die.fr landing) is a three.js WebGL scene over a CSS `--backdrop` gradient measured from the render (`rgb(50,61,100)` → `rgb(25,29,46)`, blue dusk). It carries the tagline "The Age of Data" and copy "We design anything You want and make it shine" (in a comment). The Organization JSON-LD says "Independent label fusing design, art and technology: games, 3D-printed objects, music and the artists behind them". — [index.html](index.html) lines 55, 99–115, 512
- start.html: GPU flocking birds that launch from a star; a 4×3 linktree on the star's tips (engines up, tools right, art + games down, studio left), no burger menu. iori kept it minimal and rejected dropdowns and extra notes. — [start.html](start.html), [memory start-star-linktree.md](/Users/iori/.claude/projects/-Users-iori-Desktop-code-iori/memory/start-star-linktree.md)
- shop.html: background #050005, accent #ffff00, fonts "Milksea", "Tilt Neon" and Inter. It is a catalogue of printable 3D models (crystals, flowers, cottages, planets). — [shop.html](shop.html), [pages.meta.json](pages.meta.json)
- Site menu: one generated burger (`<!-- MENU:BEGIN/END -->`) on every non-hidden page, made of three coloured triangles (blue, green, orange) on no background with a translucent blurred item list and tomato hover. iori wants it kept unstyled-changed. — [memory site-menu-component.md](/Users/iori/.claude/projects/-Users-iori-Desktop-code-iori/memory/site-menu-component.md)
- Logo assets: logo_2026.png (3.3 MB), logo_dark.png, LOGO.PNG (deploy-excluded), and the icon set icon/{android,favicon,ios,windows,og.png}. The label's logo for JSON-LD is icon/android/launchericon-512x512.png. — repo root, [server_setup.sh](server_setup.sh)
- The label's own copy calls itself "3DIE — Design, Art & Technologies Label". — [pages.meta.json](pages.meta.json) (index.html title)

### Inferences
- An archive page on 3die.fr would naturally take the Courier New, black, uppercase letter-spaced list style of jachym.html and portfolio.html for its index. Individual texts could keep paper.css, which is already a reusable token sheet, or a dark variant of it. The brutalist index and the light reading page are the existing two poles.
- The logo image was not viewed; its look is not described here.

### Gaps
- The logo's appearance (glyph, colours) was not inspected visually.
- No 3die-wide shared CSS file was found. Each 3die page inlines its own `<style>`.

## 5. Dashboard and API features that could hold texts or posts

### Takeaway
The FastAPI + SQLite backend already has a per-author **posts** table (caption, media, canvas layout, YouTube embed) that feeds moises' and crow_archduke's pages, plus a **timeline** table with markdown-like `body`, `kind`, `visibility` and a publish step. Either could hold short texts. Neither has a long-form text type, versioning, ISBN-like identifiers or editorial states beyond the timeline's `visibility` and `published_at`.

### Cited Findings
- Tables in api/main.py: `users` (username, pass_hash, role default 'member'), `sessions`, `lanes`/`phases`/`tasks` (kanban), `user_prefs`, `messages` (kind default 'contact', author, email, subject, body, read, thread_id), `posts` (id, **author**, **caption**, media JSON, layout, embed, created_at). — [api/main.py](api/main.py) lines 62–133
- Posts routes: `GET /posts?author=&limit=&offset=` (public listing), `POST /posts`, `PATCH /posts/{id}`, `PUT /posts/{id}/media`, `DELETE /posts/{id}`. HEIC/TIFF uploads are rejected, `LAYOUT_KEYS = x, y, w, z, a` place a post on a canvas, and YouTube ids are validated. — [api/main.py](api/main.py) lines 778–953
- Messages: `POST /contact` (the 3die info.html form) and `GET/POST/PATCH /messages` (dashboard inbox). — [api/main.py](api/main.py) lines 709–770
- Timeline table: slug, date, precision, date_end, **kind**, title, **body**, media, src, frame, chapter, tags, **visibility** (default 'private'), flags, position, source, created_at, updated_at, **published_at**. Routes: `/settings`, `/entries` CRUD, `/upload`, media add/delete, `/publish` (writes the static timeline/data/*.json). Login has a separate `/auth/timeline-pass`. — [api/timeline.py](api/timeline.py) lines 43–70, 175–562, [api/main.py](api/main.py) line 316
- The dashboard (dash/: app.js, index.html, style.css, guide.html) has a BLOG tab for posts and a CANVAS (PLÁTNO) for layout, per the Czech guide written for moises. Media is stored on the VPS, not in git. — [dash/guide.html](dash/guide.html), [AGENTS.md](AGENTS.md)

### Inferences
- The posts model is author-keyed and already public-readable, so an imprint could start with "text posts per author" there. Long documents (papers of 10k+ words with live figures) are static HTML in git and would stay that way. A publications index would then be a merge of static registry entries and API posts.

### Gaps
- The live database contents (how many posts each author has, whether any contain long text) are on the VPS and were not checked.

## 6. Gaps: text works mentioned outside the repo but not on disk

### Takeaway
Several texts or text sources are referenced only as claude.ai artifacts, Google Drive links, other folders or other repos. The two works PDFs and the private memoir are the most publication-relevant.

### Cited Findings
- Audio Tools spec and handoff doc: a Claude Docs artifact (https://claude.ai/artifact/Wj9UFEEyyDuqTp4AadfTQN). The built-app artifact is RF1oLm69EoUecGzLea165q. The raw prototypes "were never on this Mac". — [memory audio-tools-project.md](/Users/iori/.claude/projects/-Users-iori-Desktop-code-iori/memory/audio-tools-project.md)
- Works portfolio PDFs: umprum.html links "works.pdf cut" (/assets/pdf-cut.pdf, 45 MB, on disk, Feb 2026) and "works.pdf full" (Google Drive link; the local assets/pdf-full.pdf, 100 MB, is deploy-excluded). Contents were not opened; these are likely iori's portfolio documents. — [umprum.html](umprum.html) lines 248–256, [server_setup.sh](server_setup.sh)
- An earlier agent conversation that inventoried iori's projects for the university search is "not in any transcript on this Mac". The outreach email to Charles University CGG (~2026-10-17) went out by email; a related draft may be iris-engine/study/outreach-2026-10-19.md. — [memory university-search-2026.md](/Users/iori/.claude/projects/-Users-iori-Desktop-code-iori/memory/university-search-2026.md)
- App reels: concepts and shot lists live in `~/Desktop/projects/<app>/reel/README.md` and the FAMU CAS plan in `~/Desktop/aiblender/FAMU_CAS_PORTFOLIO_PLAN.md`, both outside this repo. — [memory app-reels-series.md](/Users/iori/.claude/projects/-Users-iori-Desktop-code-iori/memory/app-reels-series.md)
- MOSHINE has a second checkout (data_moshine dev) and is client-facing; its docs may diverge. Lens (`~/Desktop/code/lens`) and Velocity Glitch (`~/Desktop/code/feedback`) are separate repos with their own READMEs. — memory notes moshine-two-checkouts, lens-glass-app, feedback-velocity-glitch
- The full timeline memoir is read "at run time" from a source outside git; tools/timeline/privacy.json holds only hashes, and 24 entries are kept private. — [handoffs/2026-10-16-timeline.md](handoffs/2026-10-16-timeline.md) lines 38–44
- Kalivoda's old Glitch site is "recoverable only by project name via tools/glitch-recover.py". — [memory kalivoda-page.md](/Users/iori/.claude/projects/-Users-iori-Desktop-code-iori/memory/kalivoda-page.md)
- The theatre-mask page is built here but ships on the client's own site; any lesson texts belong to the client. — [memory theatre-mask-page.md](/Users/iori/.claude/projects/-Users-iori-Desktop-code-iori/memory/theatre-mask-page.md)
- The 3die artists' (jáchym, crow_archduke, moises) actual posts are only in the VPS database. — [crow_archduke.html](crow_archduke.html), [moises.html](moises.html)

### Inferences
- An imprint covering "all text by the label's authors" would depend on iori and the other artists supplying material that is not in git: jáchym's writing, Kalivoda's own statements, liner notes that do not yet exist, and the works PDFs.

### Gaps
- No liner notes, release descriptions or artist statements for releases exist anywhere searched. Whether any exist on SoundCloud or Bandcamp was not checked (out of scope: local only).
- Paper 0's research notes folder (papers/study/research_notes/Fractal paper research brief/) is cited by memory, but it was outside this sweep, which excluded research_notes.
