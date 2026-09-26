# Site handoff — SEO, analytics, navigation (2026-09-26, status check added the same evening)

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

**3. Check where the tree stands before deploying.** On the evening of 2026-09-26 local, origin
and the server were all on `c11de9e`; the status check that same evening then committed the
SoundCloud identity change on top, which is **not deployed until pushed and the command above is
run**. Uncommitted iris-engine and petri work sits in the tree; it is not site work, but a deploy
pulls origin, so push deliberately rather than by habit.

---

## What is live

- **89 pages registered, 85 public, 83 carry the generated menu.** The two without it are
  `iori_INDEX.html` and `portfolio.html`, both `"menu": false` on purpose — they have their own
  navigation.
- **Every page has real internal links.** Before the menu shipped, 63 pages had zero `<a>` tags.
  That was the largest finding of the September audit and it is closed.
- **Identity is per-domain in JSON-LD.** iori.me declares a `Person` (iori, `sameAs`
  `soundcloud.com/ioriori` and `instagram.com/jorikjonathan`); 3die.fr declares the
  `Organization` (3DIE, logo, alternate names, `sameAs` iori.me and `soundcloud.com/5gmaelstroem`).
  Until 2026-09-15 *every* page declared 3DIE, including all 63 iori.me pages, which told Google
  iori.me *is* 3DIE.
- **The label's SoundCloud handle is `5gmaelstroem`, with the e.** `soundcloud.com/5gmaelstrom`
  is a 404. Its profile description reads "3Die.FR", which is what makes it the label's account.
  It is also on `crow_archduke.html` as that artist's `sameAs`, via the registry: artist pages
  accept a `"sameAs": [...]` list in `pages.meta.json`. An Instagram `@5gmaelstrom` exists too
  ("krau soulja"); ownership unconfirmed, so it is not declared anywhere.
- **No page shows a visible link to any social profile.** The `sameAs` claims are machine-only.
  The SoundCloud profile links back to both domains; Instagram cannot be checked without a login.
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
python3 tools/seo-audit/inspect_urls.py               # URL inspection of every crawled page → out/inspect.json
python3 tools/seo-audit/trend.py                      # weekly GSC + GA4, before/after the 2026-09-15 fix
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

### Status check, evening of 2026-09-26

`google_report.py` ends its window at today minus three days, so a run on the 26th covers the same
28 days as the table above. The new information came from `inspect_urls.py` and `trend.py`.

**Indexing** (Search Console URL inspection of all 85 sitemap URLs, `out/inspect.json`):

| | iori.me | 3die.fr |
|---|---:|---:|
| Submitted and indexed | 50 of 64 | 19 of 21 |
| URL unknown to Google | 7 | 0 |
| Discovered, not yet crawled | 5 | 1 |
| Crawled, not indexed | 2 | 1 |
| Google canonical ≠ ours | 0 | 0 |
| Recrawled on or after 2026-09-15 | 16 of 52 | 5 of 20 |

The seven unknown pages are `iori.html`, `iris.html`, `iris-engine/`, `petri/`,
`three-body-shaded.html`, `voxel-flames.html`, `voxel-flames-3d.html`. All are in the sitemap
Google downloaded on 2026-09-24 and linked from the home page; Google simply has not fetched them.
Three quarters of the index still holds the pre-fix pages, so the identity fix has not been
absorbed yet. **Do not judge the fix before the recrawl is mostly done** — late October is a
reasonable first look.

**Search, nine days before the fix versus nine after:** zero clicks in both windows on both sites.
iori.me impressions 5 → 3, 3die.fr 11 → 12 with average position 17 → 12, brand "3die" 8 → 7
impressions at position 5.6. Noise on this sample size; consistent with "not recrawled yet".

**Traffic is a small circle, and sessions double-count.** 31 August to 23 September by source:

| | iori.me | 3die.fr |
|---|---:|---:|
| Direct | 43 sessions / 24 users | 41 / 25 |
| Referral from the other domain | 31 / 7 | 36 / 10 |
| Google organic | 2 | 0 |

Cities: Prague, Kladno, Jablonec, Brno. The two domains are separate GA4 streams with no
cross-domain linking, so a person following the menu between the sites starts a new session on
every hop: about a third of each site's sessions are the same handful of people bouncing across.
**Quote users, not sessions.** Some September volume is also the audit's own browser checks,
which the localhost guard cannot filter.

---

## Open, and why

**Waiting on iori**

- **`www` has no DNS record on either domain.** `www.3die.fr` and `www.iori.me` are NXDOMAIN, so
  they fail before reaching the server — no redirect, no error page. The apex records are fine;
  the `www` name was simply never created. Zones live in different places: Google/Squarespace
  nameservers for 3die.fr, registrar-servers.com (Namecheap) for iori.me. If iori adds an A record
  to `194.182.91.236`, add the `www` → apex redirect in `server_setup.sh` at the same time.
  Judged modest value, bad failure mode.
- **Backlinks from the profiles, which only iori can set.** Instagram `@jorikjonathan` bio link →
  `https://iori.me/`; SoundCloud `ioriori` profile link → iori.me (it already links to both
  domains); SoundCloud `5gmaelstroem` profile link → `https://3die.fr/`; the Facebook page that
  sends referrals → 3die.fr. These are the external signals the `sameAs` claims are waiting for;
  Google corroborates an identity when the profile links back.
- **Request indexing for the seven unknown iori.me pages** in the Search Console UI (URL
  inspection → Request indexing). The API cannot do it; the Indexing API is for job postings only.
  Or simply wait.

**Next for the site track, in order**

1. Push and deploy the SoundCloud identity commit (see the deploy command above).
2. iori sets the profile backlinks listed under "waiting on iori".
3. Cross-domain linking on the GA tag, so sessions stop double-counting between the domains:
   `linker: {domains: ["iori.me", "3die.fr"]}` in the generated `gtag('config', …)` in `site.py`,
   plus "Configure your domains" on both streams in the Analytics admin. Small, contained.
4. Visible social links in the generated menu (`MENU_LINKS` in `site.py`): a SoundCloud and
   Instagram entry on iori.me pages, SoundCloud on 3die.fr pages. This is the only way to put a
   crawlable, human-visible outbound link on 83 canvas pages without touching the viewports. It is
   a visible change to the menu, so **ask iori before doing it**.
5. Re-run `inspect_urls.py` and `trend.py` in late October, once most pages show a lastCrawl after
   2026-09-15. Only then compare search numbers against the table above.

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
- **The sitemaps API says "0 indexed" for every sitemap.** That field is a known quirk, not a
  finding. `inspect_urls.py` gives the real per-URL answer (69 of 85 indexed on 2026-09-26).
- **`google_report.py` ends its window three days ago** (GA and Search Console lag). Two runs a
  few days apart can print identical numbers; that is the same window, not a flat line.
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
