#!/usr/bin/env python3
"""
google_report.py — pull Google Analytics 4 + Search Console data for iori.me and
3die.fr, programmatically, with zero pip dependencies (stdlib + gcloud only).

Setup (once, needs a browser — run it yourself):

    bash tools/seo-audit/setup_google_auth.sh

Then:

    python3 tools/seo-audit/google_report.py --check      # what can I see?
    python3 tools/seo-audit/google_report.py              # last 28 days
    python3 tools/seo-audit/google_report.py --days 90
    python3 tools/seo-audit/google_report.py --compare    # vs the previous period

Writes tools/seo-audit/out/google_report.json (full data) and
tools/seo-audit/out/google_report.md (readable summary), and prints the summary.

GA4 numeric property ids are discovered from the measurement ids in the pages,
so nothing has to be hard-coded when a property is recreated.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta

MEASUREMENT_IDS = {"iori.me": "G-GKKJ5VX340", "3die.fr": "G-ERECDMYSNT"}
# Search Console properties can be registered either way; we use whichever exists
GSC_CANDIDATES = {
    "iori.me": ["sc-domain:iori.me", "https://iori.me/"],
    "3die.fr": ["sc-domain:3die.fr", "https://3die.fr/"],
}
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")

ADMIN = "https://analyticsadmin.googleapis.com/v1beta"
DATA = "https://analyticsdata.googleapis.com/v1beta"
GSC = "https://searchconsole.googleapis.com/webmasters/v3"

API_HINTS = {
    "analyticsadmin": "Google Analytics Admin API",
    "analyticsdata": "Google Analytics Data API",
    "searchconsole": "Google Search Console API",
}


# ---------------------------------------------------------------- transport

def token():
    try:
        return subprocess.run(
            ["gcloud", "auth", "application-default", "print-access-token"],
            capture_output=True, text=True, check=True, timeout=60,
        ).stdout.strip()
    except FileNotFoundError:
        sys.exit("gcloud is not installed. Install it, then run tools/seo-audit/setup_google_auth.sh")
    except subprocess.CalledProcessError:
        sys.exit("No Google credentials on this machine.\n"
                 "Run:  bash tools/seo-audit/setup_google_auth.sh")


def call(url, tok, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers={
        "Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            msg = json.loads(raw)["error"]["message"]
        except Exception:
            msg = raw[:300]
        host = urllib.parse.urlparse(url).netloc.split(".")[0]
        err = {"_error": e.code, "_message": msg, "_api": API_HINTS.get(host, host)}
        if e.code == 403 and ("disabled" in msg or "has not been used" in msg):
            err["_fix"] = f'enable "{err["_api"]}" for your quota project'
        elif e.code == 401:
            err["_fix"] = "credentials expired — re-run tools/seo-audit/setup_google_auth.sh"
        elif e.code == 403:
            err["_fix"] = "this Google account cannot see that property — sign in as the owner"
        return err
    except Exception as e:  # network, timeout
        return {"_error": 0, "_message": str(e)[:300]}


def failed(x):
    return isinstance(x, dict) and "_error" in x


# ---------------------------------------------------------------- discovery

def ga4_properties(tok):
    """measurement id (G-XXXX) -> {property, name, uri}"""
    out, res = {}, call(f"{ADMIN}/accountSummaries?pageSize=200", tok)
    if failed(res):
        return {"_error": res}
    for acc in res.get("accountSummaries", []):
        for p in acc.get("propertySummaries", []):
            streams = call(f"{ADMIN}/{p['property']}/dataStreams", tok)
            if failed(streams):
                continue
            for s in streams.get("dataStreams", []):
                web = s.get("webStreamData") or {}
                if web.get("measurementId"):
                    out[web["measurementId"]] = {
                        "property": p["property"],
                        "name": p.get("displayName"),
                        "uri": web.get("defaultUri"),
                    }
    return out


def gsc_sites(tok):
    res = call(f"{GSC}/sites", tok)
    if failed(res):
        return {"_error": res}
    return {s["siteUrl"]: s.get("permissionLevel") for s in res.get("siteEntry", [])}


# ---------------------------------------------------------------- reports

def ga4(tok, prop, start, end):
    base = f"{DATA}/{prop}:runReport"
    rng = [{"startDate": start, "endDate": end}]

    def report(dims, mets, limit=25, order=None):
        body = {"dateRanges": rng,
                "dimensions": [{"name": d} for d in dims],
                "metrics": [{"name": m} for m in mets],
                "limit": limit}
        if order:
            body["orderBys"] = [{"metric": {"metricName": order}, "desc": True}]
        elif dims == ["date"]:
            body["orderBys"] = [{"dimension": {"dimensionName": "date"}}]
        return call(base, tok, body)

    return {
        "totals": report([], ["sessions", "totalUsers", "newUsers", "screenPageViews",
                              "engagementRate", "averageSessionDuration", "bounceRate"]),
        "pages": report(["pagePath"], ["screenPageViews", "totalUsers", "engagementRate"], 40, "screenPageViews"),
        "channels": report(["sessionDefaultChannelGroup"], ["sessions", "totalUsers"], 20, "sessions"),
        "sources": report(["sessionSource"], ["sessions"], 25, "sessions"),
        "countries": report(["country"], ["sessions"], 15, "sessions"),
        "devices": report(["deviceCategory"], ["sessions"], 10, "sessions"),
        "daily": report(["date"], ["sessions", "totalUsers"], 400),
    }


def gsc(tok, site, start, end):
    q = f"{GSC}/sites/{urllib.parse.quote(site, safe='')}/searchAnalytics/query"

    def query(dims, limit=100):
        return call(q, tok, {"startDate": start, "endDate": end,
                             "dimensions": dims, "rowLimit": limit})

    return {
        "totals": query([], 1),
        "queries": query(["query"], 100),
        "pages": query(["page"], 100),
        "countries": query(["country"], 20),
        "devices": query(["device"], 10),
        "daily": query(["date"], 400),
        "sitemaps": call(f"{GSC}/sites/{urllib.parse.quote(site, safe='')}/sitemaps", tok),
    }


# ---------------------------------------------------------------- formatting

def ga_rows(res):
    """runReport -> [(dim values tuple, [metric values])]"""
    if failed(res) or "rows" not in res:
        return []
    return [(tuple(d["value"] for d in r.get("dimensionValues", [])),
             [m["value"] for m in r["metricValues"]]) for r in res["rows"]]


def ga_total(res, i):
    rows = ga_rows(res)
    return rows[0][1][i] if rows else None


def num(v, nd=0):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return "—"
    return f"{f:,.{nd}f}"


def pct(v):
    try:
        return f"{float(v) * 100:.1f}%"
    except (TypeError, ValueError):
        return "—"


def dur(v):
    try:
        s = int(float(v))
    except (TypeError, ValueError):
        return "—"
    return f"{s // 60}m {s % 60:02d}s"


def render(report):
    L = []
    s, e = report["range"]
    L.append(f"# Google report — {s} to {e}\n")

    for dom, r in report["ga4"].items():
        L.append(f"\n## Analytics · {dom}\n")
        if failed(r) or "_skipped" in r:
            L.append(f"- not available: {r.get('_message') or r.get('_skipped')}")
            if r.get("_fix"):
                L.append(f"- fix: {r['_fix']}")
            continue
        t = r["totals"]
        if failed(t):
            L.append(f"- error: {t['_message']}")
            if t.get("_fix"):
                L.append(f"- fix: {t['_fix']}")
            continue
        L.append("| metric | value |")
        L.append("|---|---|")
        for i, (label, fmt) in enumerate([
                ("sessions", num), ("users", num), ("new users", num), ("page views", num),
                ("engagement rate", pct), ("avg session", dur), ("bounce rate", pct)]):
            L.append(f"| {label} | {fmt(ga_total(t, i))} |")

        rows = ga_rows(r["pages"])[:15]
        if rows:
            L.append("\n**Top pages**\n")
            L.append("| page | views | users |")
            L.append("|---|---:|---:|")
            for d, m in rows:
                L.append(f"| {d[0]} | {num(m[0])} | {num(m[1])} |")

        rows = ga_rows(r["channels"])
        if rows:
            L.append("\n**Channels**\n")
            L.append("| channel | sessions |")
            L.append("|---|---:|")
            for d, m in rows:
                L.append(f"| {d[0]} | {num(m[0])} |")

        rows = ga_rows(r["devices"])
        if rows:
            L.append("\n**Devices**: " + ", ".join(f"{d[0]} {num(m[0])}" for d, m in rows))
        rows = ga_rows(r["countries"])[:8]
        if rows:
            L.append("\n**Countries**: " + ", ".join(f"{d[0]} {num(m[0])}" for d, m in rows))

    for site, r in report["gsc"].items():
        L.append(f"\n## Search Console · {site}\n")
        t = r["totals"]
        if failed(t):
            L.append(f"- error: {t['_message']}")
            if t.get("_fix"):
                L.append(f"- fix: {t['_fix']}")
            continue
        row = (t.get("rows") or [{}])[0]
        L.append("| metric | value |")
        L.append("|---|---|")
        L.append(f"| clicks | {num(row.get('clicks'))} |")
        L.append(f"| impressions | {num(row.get('impressions'))} |")
        L.append(f"| CTR | {pct(row.get('ctr'))} |")
        L.append(f"| avg position | {num(row.get('position'), 1)} |")

        rows = (r["queries"].get("rows") or [])[:25] if not failed(r["queries"]) else []
        if rows:
            L.append("\n**Search queries**\n")
            L.append("| query | clicks | impressions | CTR | position |")
            L.append("|---|---:|---:|---:|---:|")
            for x in rows:
                L.append(f"| {x['keys'][0]} | {num(x['clicks'])} | {num(x['impressions'])} "
                         f"| {pct(x['ctr'])} | {num(x['position'], 1)} |")
        else:
            L.append("\n_No search queries recorded in this period._")

        rows = (r["pages"].get("rows") or [])[:15] if not failed(r["pages"]) else []
        if rows:
            L.append("\n**Landing pages from search**\n")
            L.append("| page | clicks | impressions | position |")
            L.append("|---|---:|---:|---:|")
            for x in rows:
                L.append(f"| {x['keys'][0]} | {num(x['clicks'])} | {num(x['impressions'])} | {num(x['position'], 1)} |")

        sm = r["sitemaps"]
        if not failed(sm):
            entries = sm.get("sitemap", [])
            L.append("\n**Sitemaps**\n")
            if not entries:
                L.append("- none submitted — add them in Search Console")
            for x in entries:
                counts = ", ".join(f"{c.get('type')}: {c.get('submitted')} submitted"
                                   + (f", {c['indexed']} indexed" if c.get("indexed") else "")
                                   for c in x.get("contents", []))
                L.append(f"- {x.get('path')} — errors {x.get('errors', 0)}, "
                         f"warnings {x.get('warnings', 0)}, last downloaded {x.get('lastDownloaded', '—')}"
                         + (f" ({counts})" if counts else ""))
    return "\n".join(L)


# ---------------------------------------------------------------- main

def main():
    args = sys.argv[1:]
    days = int(args[args.index("--days") + 1]) if "--days" in args else 28
    tok = token()

    props = ga4_properties(tok)
    sites = gsc_sites(tok)

    if "--check" in args:
        print("Analytics properties visible to this account:")
        if failed(props) or "_error" in props:
            e = props.get("_error", props)
            print(f"  ERROR {e.get('_message')}")
            if e.get("_fix"):
                print(f"  fix: {e['_fix']}")
        else:
            for mid, p in sorted(props.items()):
                mine = next((d for d, m in MEASUREMENT_IDS.items() if m == mid), None)
                print(f"  {mid}  {p['name']}  {p['uri'] or ''}" + (f"   <-- {mine}" if mine else ""))
            for dom, mid in MEASUREMENT_IDS.items():
                if mid not in props:
                    print(f"  MISSING {dom} ({mid}) — this account cannot see that property")
        print("\nSearch Console properties visible to this account:")
        if "_error" in sites:
            e = sites["_error"]
            print(f"  ERROR {e.get('_message')}")
            if e.get("_fix"):
                print(f"  fix: {e['_fix']}")
        else:
            for s, perm in sorted(sites.items()):
                print(f"  {s}  ({perm})")
            for dom, cands in GSC_CANDIDATES.items():
                if not any(c in sites for c in cands):
                    print(f"  MISSING {dom} — not verified on this account")
        return 0

    end = date.today() - timedelta(days=3)      # GA ~1d, Search Console ~3d lag
    start = end - timedelta(days=days - 1)
    s, e = start.isoformat(), end.isoformat()
    report = {"range": [s, e], "days": days, "ga4_properties": props,
              "gsc_sites": sites, "ga4": {}, "gsc": {}}

    for dom, mid in MEASUREMENT_IDS.items():
        if isinstance(props, dict) and mid in props:
            report["ga4"][dom] = ga4(tok, props[mid]["property"], s, e)
        else:
            report["ga4"][dom] = {"_skipped": f"measurement id {mid} not visible to this account"}

    for dom, cands in GSC_CANDIDATES.items():
        site = next((c for c in cands if c in sites), None)
        if site:
            report["gsc"][site] = gsc(tok, site, s, e)

    os.makedirs(OUT_DIR, exist_ok=True)
    json.dump(report, open(os.path.join(OUT_DIR, "google_report.json"), "w"), indent=1, ensure_ascii=False)
    md = render(report)
    open(os.path.join(OUT_DIR, "google_report.md"), "w").write(md + "\n")
    print(md)
    print(f"\n\nfull data: {os.path.join(OUT_DIR, 'google_report.json')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
