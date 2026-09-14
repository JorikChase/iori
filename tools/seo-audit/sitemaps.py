#!/usr/bin/env python3
"""
sitemaps.py — list, submit and remove Search Console sitemap registrations.

Uses the same service-account credentials as google_report.py.

    python3 tools/seo-audit/sitemaps.py                # list what is registered
    python3 tools/seo-audit/sitemaps.py --fix          # submit the canonical set,
                                                       # remove registrations whose URL 404s
    python3 tools/seo-audit/sitemaps.py --fix --dry-run

"Fix" is conservative: it only ever removes a registration whose URL does not
resolve (200), and only ever submits a URL that does.
"""
import sys
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, __import__("os").path.dirname(__file__))
from google_report import GSC, WRITE_SCOPES, call, failed, gsc_sites, token  # noqa: E402

# what each property should have registered, in robots.txt order
CANONICAL = {
    "sc-domain:iori.me": ["https://iori.me/sitemap-iori.xml", "https://iori.me/sitemap.xml"],
    "sc-domain:3die.fr": ["https://3die.fr/sitemap-3die.xml", "https://3die.fr/sitemap.xml"],
}


def reachable(url):
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "iori-seo-audit/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status == 200
    except Exception:
        return False


def listing(tok, site):
    res = call(f"{GSC}/sites/{urllib.parse.quote(site, safe='')}/sitemaps", tok)
    return [] if failed(res) else res.get("sitemap", [])


def put(tok, site, feed, dry):
    url = f"{GSC}/sites/{urllib.parse.quote(site, safe='')}/sitemaps/{urllib.parse.quote(feed, safe='')}"
    if dry:
        return "would submit"
    req = urllib.request.Request(url, method="PUT", headers={"Authorization": f"Bearer {tok}"})
    try:
        urllib.request.urlopen(req, timeout=60)
        return "submitted"
    except urllib.error.HTTPError as e:
        return f"FAILED {e.code} {e.read().decode()[:120]}"


def delete(tok, site, feed, dry):
    url = f"{GSC}/sites/{urllib.parse.quote(site, safe='')}/sitemaps/{urllib.parse.quote(feed, safe='')}"
    if dry:
        return "would remove"
    req = urllib.request.Request(url, method="DELETE", headers={"Authorization": f"Bearer {tok}"})
    try:
        urllib.request.urlopen(req, timeout=60)
        return "removed"
    except urllib.error.HTTPError as e:
        return f"FAILED {e.code} {e.read().decode()[:120]}"


def main():
    fix = "--fix" in sys.argv
    dry = "--dry-run" in sys.argv
    # writing a sitemap registration needs the full Search Console scope;
    # reading is done with the same token, which also covers reads
    tok = token(WRITE_SCOPES if fix else None)
    sites = gsc_sites(tok)
    if "_error" in sites:
        sys.exit(f"cannot list Search Console properties: {sites['_error'].get('_message')}")

    for site in sorted(sites):
        print(f"\n== {site}  ({sites[site]})")
        registered = {s["path"]: s for s in listing(tok, site)}
        for path, s in sorted(registered.items()):
            ok = reachable(path)
            print(f"   {path}\n     url={'200' if ok else 'DEAD'} errors={s.get('errors')} "
                  f"lastDownloaded={s.get('lastDownloaded', 'never')}")
        if not fix:
            continue
        want = CANONICAL.get(site, [])
        for path, s in sorted(registered.items()):
            if path not in want and not reachable(path):
                print(f"   -> {delete(tok, site, path, dry)}: {path} (url does not resolve)")
        for path in want:
            if reachable(path):
                print(f"   -> {put(tok, site, path, dry)}: {path}")
            else:
                print(f"   -> skipped (not reachable): {path}")
    if not fix:
        print("\n(run with --fix to submit the canonical sitemaps and drop dead registrations)")


if __name__ == "__main__":
    main()
