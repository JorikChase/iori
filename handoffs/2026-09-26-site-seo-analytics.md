# Site handoff — SEO, analytics, navigation (2026-09-26)

Covers the **site itself**: iori.me and 3die.fr, `site.py` and its generated regions, the
navigation menus, the deploy, and the Google Analytics / Search Console tooling.

It does **not** cover iris-engine or petri. Those are separate tracks in the same tree with their
own entry points: `iris-engine/HANDOFF.md` and `petri/HANDOFF.md`.

---

## Read this before touching anything

**1. `site.py` owns three marked regions in every page. Never hand-edit inside them.**

| Marker | Written by | Holds |
|---|---|---|
| `<!-- SEO:BEGIN … SEO:END -->` | `site.py heads` | title, description, canonical, OG, icons, JSON-LD, the GA tag |
| `<!-- MENU:BEGIN … MENU:END -->` | `site.py menu` | the corner burger menu + its links |
| `<!-- NAV:BEGIN … NAV:END -->` | `site.py nav` | the crawlable page list inside `iori_INDEX.html` |

Edit `pages.meta.json` instead, then `python3 site.py all` and `python3 site.py check`.
A new page that is not in the registry fails `check`.

**2. Deploy is not automatic.** Push, then:

```bash
ssh iori-vps 'cd /root/iori && git -c http.version=HTTP/1.1 fetch origin -q \
  && git reset -q --hard origin/main && cp -f server_setup.sh /tmp/server_setup.sh \
  && bash /tmp/server_setup.sh'
```

Run the script from `/tmp`, never from `/root/iori` — it self-updates via git while running.
The `http.version=HTTP/1.1` is required; without it the fetch silently ships the previous commit
(this host's libcurl breaks on HTTP/2 against github.com).

**3. As of today the tree is ahead of everything.** Local `6929661`, origin `921986e`, server
`921986e`. Ten commits unpushed (nine petri, one iris-engine handoff) plus uncommitted work in
`petri/` and `iris-engine/`. None of it is site work, but a deploy pulls origin, so push
deliberately rather than by habit.

---

## What is live

- **89 pages registered, 85 public, 83 carry the generated menu.** The two without it are
  `iori_INDEX.html` and `portfolio.html`, both `"menu": false` on purpose — they have their own
  navigation.
- **Every page has real internal links.** Before the menu shipped, 63 pages had zero `<a>` tags.
  That was the largest finding of the September audit and it is closed.
- **Identity is per-domain in JSON-LD.** iori.me declares a `Person` (iori, with SoundCloud and
  Instagram in `sameAs`); 3die.fr declares the `Organization` (3DIE, logo, alternate names).
  Until 2026-09-15 *every* page declared 3DIE, including all 63 iori.me pages, which told Google
  iori.me *is* 3DIE.
- Compression on, root canonicals with `301`s from the filename URLs, real 404s, repo internals
  return 404, one GA tag per page, language declared per page from the registry.

---

## The Google tooling

Credentials are a **service account**, not OAuth. Google blocks gcloud's own client from
requesting Analytics and Search Console scopes ("This app is blocked") — do not try to fix that
path, it cannot be fixed without registering and verifying a custom OAuth app.

- Identity: `seo-reader@iori-seo-audit.iam.gserviceaccount.com`, Viewer in Analytics,
  `siteFullUser` in Search Console.
- Key: `~/.config/iori-seo/sa-key.json`, `0600`, outside the repo, key filenames gitignored.
  JWT is signed with the `openssl` binary so the tools need no pip packages.
- Verified working 2026-09-26.

```bash
python3 tools/seo-audit/google_report.py --check      # what the account can see
python3 tools/seo-audit/google_report.py --days 90    # traffic + search, JSON + Markdown
python3 tools/seo-audit/crawl.py                      # live crawl of both sitemaps
python3 tools/seo-audit/sitemaps.py --fix --dry-run   # Search Console sitemap registrations
bash tools/seo-audit/setup_google_auth.sh             # rebuild access from scratch
```

**iori.me and 3die.fr are two data streams inside ONE GA4 property** (`530756051`, named "3die").
The default reports in the Analytics interface therefore add the two sites together. Every
per-site figure must filter by `hostName`; `google_report.py` does this and also prints an
unfiltered hostname breakdown so stray origins cannot inflate the totals silently.

---

## Where the numbers stand

28 days to 2026-09-23:

| | iori.me | 3die.fr |
|---|---:|---:|
| Sessions | 103 | 87 |
| Users | 51 | 39 |
| Page views | 368 | 176 |
| Engagement | 54% | 47% |
| Search clicks | 1 | 0 |
| Search impressions | 25 | 47 |
| Average position | 39.1 | 19.2 |

Traffic is direct, referral and social. Organic search is a rounding error on both sites.
The brand query "3die" sits at position 5.5 with 20 impressions and no clicks; it was 6.8 before
the identity fix, which is movement in the right direction but on a sample far too small to call.

**Local development was polluting the property** — dev servers were logging real sessions. The
generated tag now skips localhost, loopback, private ranges, `.local` and `file://`. Confirmed
effective: localhost sessions run daily through 2026-09-16 and stop dead after, the day the guard
deployed. Windows that start before 16 September still include that noise.

---

## Open, and why

**Waiting on iori**

- **`www` has no DNS record on either domain.** `www.3die.fr` and `www.iori.me` are NXDOMAIN, so
  they fail before reaching the server — no redirect, no error page. The apex records are fine;
  the `www` name was simply never created. Zones live in different places: Google/Squarespace
  nameservers for 3die.fr, registrar-servers.com (Namecheap) for iori.me. If iori adds an A record
  to `194.182.91.236`, add the `www` → apex redirect in `server_setup.sh` at the same time.
  Judged modest value, bad failure mode.
- **3DIE's own SoundCloud**, when it exists, goes in the `3die.fr` `sameAs` list in `site.py`.
  iori's personal accounts deliberately belong to the iori.me Person, not to the label.

**Decided, do not redo**

- **Do not add text or headings to the experiment pages.** This was the original audit's headline
  recommendation and iori rejected it, correctly: the menu already supplied the internal links,
  and the pages are full-screen canvases whose viewport must not be disturbed.
- **Do not hide an H1 for crawlers.** Text hidden purely for search engines is the one thing
  Google treats as deceptive, and an H1 is a minor signal next to the title tag, which every page
  already has, unique and accurate.
- **Do not "speed up" the iori.me landing.** It grows from the first cell by design and iori
  likes it on mobile. Robots never wait for it: the `NAV` block ships 83 real links in the raw
  HTML, which is what a crawler reads.

**Small and honest**

70 pages have no H1 and 53 have little visible text. Both are true and both are fine — they are
artworks. `404.html` and `clip.html` have short descriptions and are internal.

---

## Traps that cost time

- **A hidden browser pane throttles `requestAnimationFrame` to ~1 fps.** Any measurement of an
  animated page taken while the pane is hidden is worthless. Check `document.visibilityState`
  before believing a number. This produced a completely wrong reading of the landing page.
- **rsync `--exclude` does not delete what it already copied.** Excluding a path stops it being
  copied but leaves the old copy public forever. `--delete-excluded` is now in `server_setup.sh`;
  it is what finally removed a 620 MB stale checkout and the leaked repo notes from the webroot.
- **There are no Caddy access logs.** The global `log` block is runtime logging only, so there is
  no request forensics. Do not promise to look something up in them.
- **Browsers cache `assets/menu.js` and `assets/menu.css` for an hour** (`@shortcache`). A stale
  console error after editing them is usually the cache, not the file. Fetch with a cache-busting
  query to confirm what is actually served.
- **`.readme` contains personal notes and is still in public GitHub history.** It no longer serves
  from the web, but only a history rewrite removes it from the repo (BACKLOG #2).

---

## Dashboard

dash.3die.fr, vanilla SPA over FastAPI and SQLite, 14 tasks live. The kanban enrichment agreed in
September has largely shipped: task colours, priority, labels, checklists, links, estimates and
archiving on the task table; a side panel; filters, archive and Markdown export; `/users` and
`/prefs` endpoints with density and theme. Comments and an activity log were explicitly dropped
from scope. Board search does not appear to have landed.

The live database is the source of truth and has never lost a task — a scare in September turned
out to be the mock server (`tools/dash-mock/mock.py`, port 8766), whose sample tasks are now all
prefixed `sample ·` so it cannot be mistaken for real data again.
