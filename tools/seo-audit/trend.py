#!/usr/bin/env python3
"""Weekly Search Console + GA4 trend, and a before/after comparison around FIX
(equal-length windows). Use it to judge whether a change moved anything, since
google_report.py only prints one window."""
import sys, json, urllib.parse, collections
sys.path.insert(0, "tools/seo-audit")
import google_report as g
tok = g.token()
START, END, FIX = "2026-06-26", "2026-09-23", "2026-09-15"
print("== Search Console by week (clicks / impressions / pos) ==")
for site in ("sc-domain:iori.me", "sc-domain:3die.fr"):
    q = f"{g.GSC}/sites/{urllib.parse.quote(site, safe='')}/searchAnalytics/query"
    r = g.call(q, tok, {"startDate": START, "endDate": END, "dimensions": ["date"], "rowLimit": 400})
    if g.failed(r): print(site, r); continue
    wk = collections.OrderedDict()
    for row in r.get("rows", []):
        d = row["keys"][0]; import datetime as dt
        y, w, _ = dt.date.fromisoformat(d).isocalendar()
        k = f"{y}-W{w:02}"
        a = wk.setdefault(k, [0, 0, 0.0, 0])
        a[0] += row["clicks"]; a[1] += row["impressions"]; a[2] += row["position"] * row["impressions"]; a[3] += 1
    print(site)
    for k, (c, i, pw, n) in wk.items():
        print(f"  {k}  clicks {c:2}  impr {i:4}  pos {pw / i if i else 0:5.1f}  ({n} days with data)")
    # before/after fix, equal length windows
    import datetime as dt
    fix = dt.date.fromisoformat(FIX); end = dt.date.fromisoformat(END); n = (end - fix).days + 1
    b0 = fix - dt.timedelta(days=n); b1 = fix - dt.timedelta(days=1)
    for lbl, s, e in (("before", b0, b1), ("after ", fix, end)):
        t = g.call(q, tok, {"startDate": s.isoformat(), "endDate": e.isoformat(), "dimensions": [], "rowLimit": 1})
        row = (t.get("rows") or [{}])[0]
        print(f"  {lbl} {s}..{e}: clicks {row.get('clicks',0)} impr {row.get('impressions',0)} pos {row.get('position',0):.1f}")
    if site.endswith("3die.fr"):
        for lbl, s, e in (("before", b0, b1), ("after ", fix, end)):
            t = g.call(q, tok, {"startDate": s.isoformat(), "endDate": e.isoformat(), "dimensions": ["query"], "rowLimit": 5,
                                "dimensionFilterGroups": [{"filters": [{"dimension": "query", "operator": "equals", "expression": "3die"}]}]})
            row = (t.get("rows") or [{}])[0]
            print(f"  brand '3die' {lbl}: clicks {row.get('clicks',0)} impr {row.get('impressions',0)} pos {row.get('position',0):.1f}")
    # distinct pages with impressions before/after
    for lbl, s, e in (("before", b0, b1), ("after ", fix, end)):
        t = g.call(q, tok, {"startDate": s.isoformat(), "endDate": e.isoformat(), "dimensions": ["page"], "rowLimit": 500})
        print(f"  pages with impressions {lbl}: {len(t.get('rows', []))}")

print("\n== GA4 sessions per week by hostname ==")
r = g.call(f"{g.DATA}/properties/530756051:runReport", tok, {
    "dateRanges": [{"startDate": START, "endDate": END}],
    "dimensions": [{"name": "date"}, {"name": "hostName"}],
    "metrics": [{"name": "sessions"}], "limit": 10000})
if g.failed(r): print(r)
else:
    import datetime as dt
    wk = collections.defaultdict(lambda: collections.Counter())
    last_local = None
    for row in r.get("rows", []):
        d = row["dimensionValues"][0]["value"]; h = row["dimensionValues"][1]["value"]; s = int(row["metricValues"][0]["value"])
        dd = dt.date(int(d[:4]), int(d[4:6]), int(d[6:]))
        y, w, _ = dd.isocalendar(); wk[f"{y}-W{w:02}"][h] += s
        if h == "localhost" and s: last_local = max(last_local or dd, dd)
    hosts = sorted({h for c in wk.values() for h in c})
    print("  week      " + "".join(f"{h:>12}" for h in hosts))
    for k in sorted(wk): print(f"  {k}  " + "".join(f"{wk[k].get(h,0):12}" for h in hosts))
    print("  last localhost session:", last_local)
