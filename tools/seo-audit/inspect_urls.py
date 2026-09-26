#!/usr/bin/env python3
"""Search Console URL inspection of every sitemap URL in out/crawl.json.
Run tools/seo-audit/crawl.py first. Prints coverage per domain, which pages are
not indexed, how many were recrawled since the 2026-09-15 identity fix, and any
canonical mismatches. Writes out/inspect.json. Quota: 2000 inspections/day.
Note: the sitemaps API reports "0 indexed" for every sitemap; that field is a
known quirk. This script is the real answer."""
import sys, json, collections, time
sys.path.insert(0, "tools/seo-audit")
import google_report as g
tok = g.token()
crawl = json.load(open("tools/seo-audit/out/crawl.json"))
urls = [p["url"] for p in crawl["pages"]]
out = []
for u in urls:
    site = "sc-domain:iori.me" if "iori.me" in u else "sc-domain:3die.fr"
    r = g.call("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", tok,
               {"inspectionUrl": u, "siteUrl": site})
    if g.failed(r):
        out.append({"url": u, "error": r}); 
        if r.get("_error") in (401, 403): print("FATAL", r); break
        continue
    ix = r.get("inspectionResult", {}).get("indexStatusResult", {})
    out.append({"url": u, "verdict": ix.get("verdict"), "coverage": ix.get("coverageState"),
                "indexing": ix.get("indexingState"), "fetch": ix.get("pageFetchState"),
                "robots": ix.get("robotsTxtState"), "lastCrawl": ix.get("lastCrawlTime"),
                "googleCanonical": ix.get("googleCanonical"), "userCanonical": ix.get("userCanonical"),
                "sitemaps": ix.get("sitemap"), "referring": ix.get("referringUrls")})
    time.sleep(0.15)
OUT = sys.argv[1] if len(sys.argv) > 1 else "tools/seo-audit/out/inspect.json"
json.dump(out, open(OUT, "w"), indent=1)
ok = [o for o in out if "error" not in o]
print(f"{len(ok)} inspected, {len(out)-len(ok)} errors")
if len(out) - len(ok): print("first error:", [o for o in out if "error" in o][0])
for dom in ("iori.me", "3die.fr"):
    rows = [o for o in ok if dom in o["url"]]
    print(f"\n== {dom}: {len(rows)} urls ==")
    print(" coverage:", dict(collections.Counter(o["coverage"] for o in rows)))
    print(" verdict: ", dict(collections.Counter(o["verdict"] for o in rows)))
    lc = sorted(o["lastCrawl"][:10] for o in rows if o.get("lastCrawl"))
    print(f" lastCrawl: {len(lc)} have one; oldest {lc[0] if lc else None} newest {lc[-1] if lc else None}")
    print(" crawled on/after 2026-09-15:", sum(1 for d in lc if d >= "2026-09-15"), " before:", sum(1 for d in lc if d < "2026-09-15"))
    mism = [o for o in rows if o["googleCanonical"] and o["googleCanonical"] != o["userCanonical"]]
    print(" canonical mismatches:", len(mism))
    for o in mism[:10]: print("   ", o["url"], "-> google:", o["googleCanonical"], "user:", o["userCanonical"])
    print(" not indexed:")
    for o in rows:
        if o["verdict"] != "PASS": print(f"   {o['url']:50} {o['coverage']}  lastCrawl={str(o.get('lastCrawl'))[:10]}")
