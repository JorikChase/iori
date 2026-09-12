#!/usr/bin/env python3
"""
crawl.py — live SEO crawl of iori.me + 3die.fr driven by their sitemaps.

Zero dependencies. For every sitemap URL: status, redirect target, TTFB, size,
<title>, meta description, canonical (and whether it matches the request URL),
robots meta, og:image, twitter:card, H1 count/text, lang, viewport, JSON-LD
validity, script/link counts, external script hosts, image alt coverage,
internal link count, and whether the page is registered with a real
description (not the site.py TODO placeholder).

Usage: python3 tools/seo-audit/crawl.py  [--out tools/seo-audit/out]
"""
import json, re, sys, time, os, ssl, concurrent.futures as cf
from html.parser import HTMLParser
from urllib.request import Request, urlopen
from urllib.parse import urlparse, urljoin
import xml.etree.ElementTree as ET

UA = "Mozilla/5.0 (compatible; iori-seo-audit/1.0; +https://iori.me/)"
CTX = ssl.create_default_context()
SITEMAPS = ["https://iori.me/sitemap.xml", "https://3die.fr/sitemap.xml"]
OUT = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else os.path.join(os.path.dirname(__file__), "out")


def fetch(url, timeout=30):
    req = Request(url, headers={"User-Agent": UA, "Accept": "text/html,*/*"})
    t0 = time.time()
    try:
        with urlopen(req, timeout=timeout, context=CTX) as r:
            ttfb = time.time() - t0
            body = r.read()
            return {"status": r.status, "final_url": r.geturl(), "ttfb": round(ttfb, 3),
                    "bytes": len(body), "headers": dict(r.headers), "body": body.decode("utf-8", "replace")}
    except Exception as e:  # HTTPError has .code
        code = getattr(e, "code", None)
        return {"status": code or 0, "final_url": getattr(e, "url", url), "ttfb": round(time.time() - t0, 3),
                "bytes": 0, "headers": {}, "body": "", "error": str(e)[:200]}


class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""; self._in_title = False
        self.metas = []; self.links = []; self.h1 = []; self._in_h1 = False
        self.scripts = []; self._script_type = None; self._ld = []; self._in_ld = False
        self.imgs = []; self.anchors = []; self.lang = None; self.h2 = 0; self.text_len = 0
        self.iframes = 0; self._skip = 0
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "html": self.lang = a.get("lang")
        elif tag == "title": self._in_title = True
        elif tag == "meta": self.metas.append(a)
        elif tag == "link": self.links.append(a)
        elif tag == "h1": self._in_h1 = True; self.h1.append("")
        elif tag == "h2": self.h2 += 1
        elif tag == "img": self.imgs.append(a)
        elif tag == "a": self.anchors.append(a.get("href", ""))
        elif tag == "iframe": self.iframes += 1
        elif tag == "script":
            self.scripts.append(a)
            if (a.get("type") or "").lower() == "application/ld+json": self._in_ld = True; self._ld.append("")
            self._skip += 1
        elif tag == "style": self._skip += 1
    def handle_endtag(self, tag):
        if tag == "title": self._in_title = False
        elif tag == "h1": self._in_h1 = False
        elif tag == "script": self._in_ld = False; self._skip = max(0, self._skip - 1)
        elif tag == "style": self._skip = max(0, self._skip - 1)
    def handle_data(self, d):
        if self._in_title: self.title += d
        if self._in_h1: self.h1[-1] += d
        if self._in_ld: self._ld[-1] += d
        elif not self._skip: self.text_len += len(d.strip())


def meta(p, **kw):
    for m in p.metas:
        if all((m.get(k) or "").lower() == v.lower() for k, v in kw.items()):
            return m.get("content", "")
    return None


def audit(url):
    r = fetch(url)
    row = {"url": url, "status": r["status"], "final_url": r["final_url"], "ttfb_s": r["ttfb"],
           "bytes": r["bytes"], "cache_control": r["headers"].get("Cache-Control"),
           "content_encoding": r["headers"].get("Content-Encoding"), "issues": []}
    if r.get("error"): row["error"] = r["error"]
    if r["status"] != 200:
        row["issues"].append(f"status {r['status']}")
        return row
    p = P(); p.feed(r["body"])
    host = urlparse(url).netloc
    canon = next((l.get("href") for l in p.links if (l.get("rel") or "").lower() == "canonical"), None)
    desc = meta(p, name="description")
    robots = meta(p, name="robots")
    ogimg = meta(p, property="og:image")
    ext_scripts = sorted({urlparse(s["src"]).netloc for s in p.scripts if s.get("src") and s["src"].startswith("http") and urlparse(s["src"]).netloc != host})
    inline_js = sum(1 for s in p.scripts if not s.get("src"))
    ld_ok, ld_types = True, []
    for blob in p._ld:
        try:
            j = json.loads(blob); ld_types.append(j.get("@type"))
        except Exception: ld_ok = False
    imgs_no_alt = [i.get("src") for i in p.imgs if not i.get("alt")]
    internal = [a for a in p.anchors if a and not a.startswith(("http", "mailto:", "tel:", "#", "javascript:"))]
    internal += [a for a in p.anchors if a.startswith("http") and urlparse(a).netloc == host]
    row.update({
        "title": p.title.strip(), "title_len": len(p.title.strip()),
        "description": desc, "desc_len": len(desc or ""),
        "canonical": canon, "robots": robots, "og_image": ogimg,
        "twitter_card": meta(p, name="twitter:card"),
        "h1": [h.strip() for h in p.h1], "h2_count": p.h2, "lang": p.lang,
        "viewport": meta(p, name="viewport"), "jsonld_valid": ld_ok, "jsonld_types": ld_types,
        "scripts_total": len(p.scripts), "scripts_inline": inline_js, "external_script_hosts": ext_scripts,
        "imgs": len(p.imgs), "imgs_without_alt": len(imgs_no_alt),
        "internal_links": len(internal), "iframes": p.iframes, "visible_text_chars": p.text_len,
    })
    I = row["issues"]
    if not p.title: I.append("missing title")
    elif len(p.title) > 65: I.append(f"title long ({len(p.title)})")
    if not desc: I.append("missing description")
    elif len(desc) < 70: I.append(f"description short ({len(desc)})")
    elif len(desc) > 160: I.append(f"description long ({len(desc)})")
    if not canon: I.append("missing canonical")
    elif canon.rstrip("/") != url.rstrip("/") and not (url.endswith("/") and canon.endswith(("index.html", "iori_INDEX.html"))):
        I.append(f"canonical != url ({canon})")
    elif url.endswith("/") and canon.endswith(("index.html", "iori_INDEX.html")):
        I.append(f"canonical points at file, sitemap at root ({canon})")
    if robots and "noindex" in robots.lower(): I.append("noindex")
    if not ogimg: I.append("no og:image")
    if len(p.h1) == 0: I.append("no H1")
    elif len(p.h1) > 1: I.append(f"{len(p.h1)} H1s")
    if not p.lang: I.append("no html lang")
    if not row["viewport"]: I.append("no viewport")
    if not ld_ok: I.append("invalid JSON-LD")
    if imgs_no_alt: I.append(f"{len(imgs_no_alt)} img without alt")
    if len(internal) == 0: I.append("no internal links")
    if p.text_len < 200: I.append(f"thin visible text ({p.text_len} chars)")
    if r["ttfb"] > 1.0: I.append(f"slow TTFB {r['ttfb']}s")
    if r["bytes"] > 300_000: I.append(f"heavy HTML {r['bytes']//1024}KB")
    if not row["content_encoding"]: I.append("no compression")
    if ext_scripts: I.append("3rd-party script hosts: " + ", ".join(ext_scripts))
    return row


def sitemap_urls(sm):
    r = fetch(sm)
    if r["status"] != 200: return []
    root = ET.fromstring(r["body"])
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    return [(u.find("s:loc", ns).text, (u.find("s:lastmod", ns).text if u.find("s:lastmod", ns) is not None else None))
            for u in root.findall("s:url", ns)]


def main():
    os.makedirs(OUT, exist_ok=True)
    allrows = []
    for sm in SITEMAPS:
        urls = sitemap_urls(sm)
        print(f"{sm}: {len(urls)} urls", file=sys.stderr)
        with cf.ThreadPoolExecutor(8) as ex:
            rows = list(ex.map(audit, [u for u, _ in urls]))
        for (u, lm), row in zip(urls, rows):
            row["sitemap"] = sm; row["lastmod"] = lm
        allrows += rows
    # also probe: robots, www, http, 404, dash, api, common junk
    extra = {}
    for u in ["https://iori.me/robots.txt", "https://3die.fr/robots.txt", "https://iori.me/does-not-exist",
              "https://3die.fr/does-not-exist", "https://iori.me/index.html", "https://3die.fr/iori_INDEX.html",
              "https://3die.fr/index.html", "https://iori.me/iori_INDEX.html", "https://iori.me/pages.json",
              "https://iori.me/.git/HEAD", "https://iori.me/required.md", "https://iori.me/AGENTS.md",
              "https://iori.me/pages.meta.json", "https://iori.me/site.py", "https://iori.me/session-ses_0abd.md",
              "https://iori.me/sandbox.md", "https://iori.me/AUTOMATA_CATALOG.md", "https://iori.me/BACKLOG.md",
              "https://iori.me/server_setup.sh", "https://iori.me/.readme", "https://3die.fr/api/main.py",
              "https://iori.me/parsed_data.json", "https://iori.me/build_univerzum.py",
              "https://dash.3die.fr/", "https://api.3die.fr/health"]:
        r = fetch(u); extra[u] = {"status": r["status"], "bytes": r["bytes"], "final": r["final_url"], "ct": r["headers"].get("Content-Type")}
    json.dump({"generated": time.strftime("%Y-%m-%d %H:%M"), "pages": allrows, "extra": extra},
              open(os.path.join(OUT, "crawl.json"), "w"), indent=1, ensure_ascii=False)
    # summary
    print(f"\n{len(allrows)} sitemap URLs crawled")
    from collections import Counter
    c = Counter()
    for r in allrows:
        for i in r["issues"]:
            c[re.sub(r"\(.*?\)|\d+(\.\d+)?s|\d+KB|: .*", "", i).strip()] += 1
    for k, v in c.most_common(): print(f"  {v:3d}  {k}")
    print("\nextra probes:")
    for u, e in extra.items(): print(f"  {e['status']:>3}  {e['bytes']:>8}  {u}")


if __name__ == "__main__":
    main()
