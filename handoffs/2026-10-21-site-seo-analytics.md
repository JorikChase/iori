# Site handoff — October reading (2026-10-21)

Supersedes `handoffs/2026-09-26-site-seo-analytics.md` for *status*. That file still holds the
durable material — the generated regions, the deploy command, the credentials, the traps — and is
still worth reading first if you have not. This one records what six weeks of data showed.

Published report (artifact, version 2): https://claude.ai/artifact/9GY2XN7ka3KiMzRtTUwbZY
Source now lives in the repo at `tools/seo-audit/report.html` — the scratchpad copy was wiped,
which is why it is tracked now. `tools/` is excluded from the deploy, and `site.py` only scans
root-level HTML, so it is invisible to both.

---

## The blocker cleared

In September only 25% of pages had been recrawled since the 15 Sep identity fix, so no search
number meant anything. Now **69% (60 of 87)**. The data is finally judgeable.

| URL inspection | 26 Sep | 21 Oct |
|---|---:|---:|
| Indexed | 69 / 85 | 70 / 87 |
| Unknown to Google | 7 | 4 |
| Crawled, not indexed | 3 | 7 |
| Discovered, not indexed | 6 | 6 |
| Canonical mismatches | 0 | 0 |

The 17 unindexed are either brand new and uncrawled (`iris-engine/`, `petri/`, `audio/`) or thin
canvases Google declined (`webgl.html`, `liquid-automata.html`, `fractals.html`,
`lambda_cognition.html`). The second group is the accepted cost of not writing filler text.

## Search improved substantially

Two clean 28-day windows, 24 Aug–20 Sep against 21 Sep–18 Oct:

| | iori.me | 3die.fr |
|---|---|---|
| Average position | 46.4 → **28.2** | 23.1 → **11.1** |
| Clicks | 1 → 3 | 0 → 1 |
| Pages with impressions | 21 → 24 | 16 → 5 |

**3die.fr losing 11 pages is the cleanup working, not a regression.** Eight of them were iori.me
experiments wrongly indexed on the 3die domain (aquarium, bismuth-fluid, fractal-dimension, lili,
meta-iris, pi, two-body, universe). Five genuinely-3die pages remain, at less than half the
position. Do not "fix" this.

iori.me gained 11 pages showing for the first time (crystalize, death, fluid, fungal-growth,
mycelium, multiOS, voxel-terrain…) — pages that previously had nothing linking to them. The
generated menu is what got them crawled, which retroactively justifies choosing links over body
text.

Brand query "3die": 19 impressions at pos 5.4 → 16 at 6.2, still zero clicks. Noise.
Total search demand across both sites in a month: **ten distinct queries.**

## Traffic fell, and it is not a measurement artefact

Users, same two windows: iori.me 50 → 45, 3die.fr 40 → 30. These figures are hostname-filtered and
never contained the localhost noise, so this is real. Engagement *rose* (48→52%, 48→57%).

The drop is almost entirely **direct**: 72 → 47 users. Referral −5, social −2, organic search +2.
Instagram went 3 → 0 users while Facebook mobile went 0 → 3. Two spam referrers (`blog2026.online`,
`sunblog.asia`) stopped. Read: the sites were shared less that month, nothing broke.

## Open

- **Label SoundCloud has no link field.** `soundcloud.com/5gmaelstroem` only mentions "3Die.FR" as
  plain text in its description. `soundcloud.com/ioriori` is done properly — `iori.me` is a real
  profile link. Adding `https://3die.fr/` to the label profile completes the Organization pair.
  *(iori's action.)*
- **Instagram cannot be verified from here** (JS-rendered, blocks reading). iori confirms the
  backlinks are set and that stories carry the link. Worth knowing: Instagram bio links are
  `nofollow` and story links are not crawlable — their value is entity corroboration and human
  traffic, never ranking signal.
- **`www` still NXDOMAIN** on both domains. A record → 194.182.91.236; the Caddy redirect goes in
  the same day. Zones: Squarespace/Google for 3die.fr, Namecheap for iori.me. *(iori's action.)*
- **No cross-domain Analytics linker**, so a visitor crossing domains is counted twice. **Quote
  users, not sessions.**
- Eleven pages still import three.js from unversioned `threejs.org/build`; the 3die.fr HDR is still
  1.4 MB though it no longer blocks first paint.

## The conclusion that matters

Everything indexable is indexed, canonicals are clean, duplicates are draining, positions halved.
The technical ceiling has been reached. Ten search queries a month is a demand problem, and no
further SEO work moves it. Anything else spent here has worse expected value than spending it on
the work itself.

## Re-running this

```bash
python3 tools/seo-audit/crawl.py            # then inspect_urls reads its output
python3 tools/seo-audit/inspect_urls.py     # ~10 min, 2000/day quota
python3 tools/seo-audit/google_report.py --days 90
```

Archive the previous `out/*.json` as `out/<date>-*.json` first — the scripts overwrite. The
2026-09-26 baseline is already archived there. `google_report.py`'s window ends three days before
today, so back-to-back runs repeat.
