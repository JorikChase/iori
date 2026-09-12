#!/usr/bin/env python3
"""
google_report.py — pull Google Analytics 4 + Google Search Console data for
iori.me and 3die.fr, programmatically, with zero pip dependencies.

Auth = Application Default Credentials from gcloud (one-time, interactive):

    gcloud auth application-default login \
      --scopes=https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/webmasters.readonly,https://www.googleapis.com/auth/cloud-platform

  * log in as the Google account that OWNS the GA4 properties and the Search
    Console properties (the one that sees them at analytics.google.com and
    search.google.com/search-console)
  * a GCP project is needed only to bill API quota (free): pick/create one,
    enable "Google Analytics Data API" and "Google Search Console API" there,
    then `gcloud auth application-default set-quota-project <PROJECT_ID>`

Then:

    python3 tools/seo-audit/google_report.py               # last 28 days
    python3 tools/seo-audit/google_report.py --days 90

Writes tools/seo-audit/out/google_report.json and prints a summary.
GA4 property ids are discovered via the Admin API (the measurement ids
G-GKKJ5VX340 / G-ERECDMYSNT are matched to their numeric property ids).
"""
import json, os, subprocess, sys, urllib.request, urllib.error, urllib.parse
from datetime import date, timedelta

MEASUREMENT_IDS = {"iori.me": "G-GKKJ5VX340", "3die.fr": "G-ERECDMYSNT"}
SITES = ["https://iori.me/", "https://3die.fr/", "sc-domain:iori.me", "sc-domain:3die.fr"]
OUT = os.path.join(os.path.dirname(__file__), "out", "google_report.json")
DAYS = int(sys.argv[sys.argv.index("--days") + 1]) if "--days" in sys.argv else 28


def token():
    try:
        return subprocess.run(["gcloud", "auth", "application-default", "print-access-token"],
                              capture_output=True, text=True, check=True).stdout.strip()
    except subprocess.CalledProcessError as e:
        sys.exit("no Application Default Credentials — run the gcloud login command in this file's docstring.\n" + e.stderr)


def call(url, body=None, tok=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"error": e.code, "detail": e.read().decode()[:600]}


def ga4_properties(tok):
    """measurement id -> numeric property id, via Admin API account summaries."""
    out = {}
    res = call("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200", tok=tok)
    for acc in res.get("accountSummaries", []):
        for p in acc.get("propertySummaries", []):
            pid = p["property"]  # properties/123
            streams = call(f"https://analyticsadmin.googleapis.com/v1beta/{pid}/dataStreams", tok=tok)
            for s in streams.get("dataStreams", []):
                mid = s.get("webStreamData", {}).get("measurementId")
                if mid: out[mid] = {"property": pid, "name": p.get("displayName"), "uri": s.get("webStreamData", {}).get("defaultUri")}
    if "error" in res: out["_error"] = res
    return out


def ga4_report(tok, prop, start, end):
    base = f"https://analyticsdata.googleapis.com/v1beta/{prop}:runReport"
    rng = [{"startDate": start, "endDate": end}]
    return {
        "totals": call(base, {"dateRanges": rng, "metrics": [{"name": m} for m in
                 ["sessions", "totalUsers", "newUsers", "screenPageViews", "engagementRate", "averageSessionDuration", "bounceRate"]]}, tok),
        "top_pages": call(base, {"dateRanges": rng, "dimensions": [{"name": "pagePath"}],
                 "metrics": [{"name": "screenPageViews"}, {"name": "totalUsers"}, {"name": "engagementRate"}],
                 "orderBys": [{"metric": {"metricName": "screenPageViews"}, "desc": True}], "limit": 40}, tok),
        "channels": call(base, {"dateRanges": rng, "dimensions": [{"name": "sessionDefaultChannelGroup"}],
                 "metrics": [{"name": "sessions"}, {"name": "engagementRate"}], "limit": 20}, tok),
        "referrers": call(base, {"dateRanges": rng, "dimensions": [{"name": "sessionSource"}],
                 "metrics": [{"name": "sessions"}], "orderBys": [{"metric": {"metricName": "sessions"}, "desc": True}], "limit": 25}, tok),
        "countries": call(base, {"dateRanges": rng, "dimensions": [{"name": "country"}],
                 "metrics": [{"name": "sessions"}], "orderBys": [{"metric": {"metricName": "sessions"}, "desc": True}], "limit": 15}, tok),
        "devices": call(base, {"dateRanges": rng, "dimensions": [{"name": "deviceCategory"}], "metrics": [{"name": "sessions"}]}, tok),
        "daily": call(base, {"dateRanges": rng, "dimensions": [{"name": "date"}], "metrics": [{"name": "sessions"}, {"name": "totalUsers"}],
                 "orderBys": [{"dimension": {"dimensionName": "date"}}], "limit": 400}, tok),
    }


def gsc_report(tok, site, start, end):
    base = f"https://www.googleapis.com/webmasters/v3/sites/{urllib.parse.quote(site, safe='')}/searchAnalytics/query"
    def q(dims, limit=50):
        return call(base, {"startDate": start, "endDate": end, "dimensions": dims, "rowLimit": limit}, tok)
    res = {"totals": q([]), "queries": q(["query"], 100), "pages": q(["page"], 100),
           "countries": q(["country"], 20), "devices": q(["device"]), "daily": q(["date"], 400)}
    # index coverage: inspect the sitemap URLs (URL Inspection API, 2000/day quota)
    sm = call(f"https://www.googleapis.com/webmasters/v3/sites/{urllib.parse.quote(site, safe='')}/sitemaps", tok=tok)
    res["sitemaps"] = sm
    return res


def main():
    tok = token()
    end = date.today() - timedelta(days=2)  # GA/GSC data lag
    start = end - timedelta(days=DAYS)
    s, e = start.isoformat(), end.isoformat()
    report = {"range": [s, e], "ga4": {}, "gsc": {}}
    props = ga4_properties(tok)
    report["ga4_properties"] = props
    for dom, mid in MEASUREMENT_IDS.items():
        if mid in props:
            report["ga4"][dom] = ga4_report(tok, props[mid]["property"], s, e)
        else:
            report["ga4"][dom] = {"error": f"measurement id {mid} not visible to this Google account"}
    sites = call("https://www.googleapis.com/webmasters/v3/sites", tok=tok)
    report["gsc_sites"] = sites
    have = {x["siteUrl"] for x in sites.get("siteEntry", [])}
    for site in SITES:
        if site in have:
            report["gsc"][site] = gsc_report(tok, site, s, e)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(report, open(OUT, "w"), indent=1)
    # ---- summary
    print(f"range {s} .. {e}")
    for dom, r in report["ga4"].items():
        print(f"\n== GA4 {dom}")
        if "error" in r: print("  ", r["error"]); continue
        t = r["totals"]
        if "rows" in t:
            print("   " + "  ".join(f"{h['name']}={v['value']}" for h, v in zip(t["metricHeaders"], t["rows"][0]["metricValues"])))
        for row in r["top_pages"].get("rows", [])[:15]:
            print(f"   {row['metricValues'][0]['value']:>6} views  {row['dimensionValues'][0]['value']}")
        for row in r["channels"].get("rows", []):
            print(f"   channel {row['dimensionValues'][0]['value']}: {row['metricValues'][0]['value']} sessions")
        if "error" in t: print("   ERROR", t)
    for site, r in report["gsc"].items():
        print(f"\n== GSC {site}")
        t = r["totals"].get("rows", [{}])[0]
        print(f"   clicks={t.get('clicks')} impressions={t.get('impressions')} ctr={t.get('ctr')} position={t.get('position')}")
        for row in r["queries"].get("rows", [])[:20]:
            print(f"   {row['clicks']:>4} clicks {row['impressions']:>6} impr  pos {row['position']:.1f}  {row['keys'][0]}")
        for row in r["pages"].get("rows", [])[:15]:
            print(f"   {row['clicks']:>4} clicks {row['impressions']:>6} impr  {row['keys'][0]}")
        for sm in r["sitemaps"].get("sitemap", []):
            print(f"   sitemap {sm.get('path')} submitted={sm.get('isPending')=='false'} errors={sm.get('errors')} warnings={sm.get('warnings')} last={sm.get('lastDownloaded')}")
        if "error" in r["totals"]: print("   ERROR", r["totals"])
    if not report["gsc"]:
        print("\nno Search Console properties visible to this account:", sites)
    print(f"\nfull JSON: {OUT}")


if __name__ == "__main__":
    main()
