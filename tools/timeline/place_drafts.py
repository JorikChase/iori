#!/usr/bin/env python3
"""Give the undated memoir drafts (imported by import_readme.py) approximate dates.

    python3 tools/timeline/place_drafts.py --dry-run --api http://127.0.0.1:8796
    python3 tools/timeline/place_drafts.py                     # production, asks for the dash login

Clues, strongest first:
  1. a four-digit year in the paragraph
  2. an age in the paragraph ("v osmi", "ve dvanacti", "od dvanacti", "okolo pateho roku", "mi bylo 9",
     "mel 4/5"): the year the author turned that age, born 4.12.2003. Ages of other people
     ("ji bylo", "trinactiletou") are not matched.
  3. the chapter: chapters are places in order, spread evenly from the origin to the date the file was
     written; a clue inside a chapter moves its start when it goes forward in time and lands within
     four years of that spread (the last chapter, written now about childhood, cannot pull the present
     back); chapters without an accepted clue sit between their neighbours. Paragraphs without a clue spread across their
     chapter's span in file order.
  4. paragraphs before the first chapter are notes from the time of writing.
iori's reading (2026-10-14): the prose is about 2014 and before, with some later pieces; run with
    --split 5:2015 --recollect 11:2008-2015 --start 11:2026-01
(the first five places before 2015, the last chapter's undated recollections across 2008–2015, and the
last place starting at the end of January 2026).
Every placed entry gets the flag "approx-date" (shown in the editor until cleared) and keeps its
visibility (private). Only undated entries are touched unless --force. Prints counts, never text."""
import argparse, datetime, os, re, sys, unicodedata
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tlapi import Api, args_api  # noqa: E402

BIRTH = 2003 + (31 + 30 + 31 + 30 + 31 + 31 + 30 + 31 + 30 + 31 + 30 + 4) / 365.25   # 4 Dec 2003 as a decimal year
LOC = {"tri": 3, "trech": 3, "ctyrech": 4, "peti": 5, "sesti": 6, "sedmi": 7, "osmi": 8, "devíti": 9, "deviti": 9, "devti": 9,
       "deseti": 10, "jedenacti": 11, "dvanacti": 12, "trinacti": 13, "ctrnacti": 14, "patnacti": 15, "sestnacti": 16,
       "sedmnacti": 17, "osmnacti": 18, "devatenacti": 19, "dvaceti": 20}
NOM = {"tri": 3, "ctyri": 4, "pet": 5, "sest": 6, "sedm": 7, "osm": 8, "devet": 9, "deset": 10, "jedenact": 11, "dvanact": 12,
       "trinact": 13, "ctrnact": 14, "patnact": 15, "sestnact": 16, "sedmnact": 17, "osmnact": 18, "devatenact": 19, "dvacet": 20}
ORD = {"tretiho": 3, "ctvrteho": 4, "pateho": 5, "sesteho": 6, "sedmeho": 7, "osmeho": 8, "devateho": 9, "desateho": 10}


def fold(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


def clue(text):
    """-> decimal year or None"""
    t = fold(text)
    years = [int(y) for y in re.findall(r"\b(200[4-9]|20[1-3]\d)\b", t)]
    if years:
        return min(years) + 0.5
    ages = []
    for m in re.finditer(r"\b(?:v|ve|od|kolem|okolo)\s+([a-z]+)\b", t):
        if m.group(1) in LOC:
            ages.append(LOC[m.group(1)])
    for m in re.finditer(r"\b(?:okolo|kolem)\s+([a-z]+)\s+roku\b", t):
        if m.group(1) in ORD:
            ages.append(ORD[m.group(1)])
    for m in re.finditer(r"\bmi\s+bylo\s+(\d{1,2}|[a-z]+)\b", t):
        v = m.group(1)
        ages.append(int(v) if v.isdigit() else NOM.get(v))
    for m in re.finditer(r"\bmel\s+(\d{1,2})(?:\s*/\s*(\d{1,2}))?\b", t):
        a = int(m.group(1)); b = int(m.group(2)) if m.group(2) else a
        if a < 25:
            ages.append((a + b) / 2)
    ages = [a for a in ages if a is not None and 1 <= a <= 25]
    if not ages:
        return None
    return BIRTH + min(ages) + 0.5          # the middle of the year after that birthday


def to_date(y, prec):
    y = max(BIRTH, y)
    year = int(y)
    month = min(12, max(1, int((y - year) * 12) + 1))
    if prec == "year":
        return f"{year}-01-01"
    if prec == "month":
        return f"{year}-{month:02d}-01"
    return f"{year}-{month:02d}-01"


def main():
    ap = argparse.ArgumentParser()
    args_api(ap)
    ap.add_argument("--written", help="YYYY-MM the memoir was written (default: the .readme file's creation date)")
    ap.add_argument("--force", action="store_true",
                    help="re-date entries that already have a date, but only those still flagged approx-date "
                         "(a cleared flag means iori checked the date: never touched again)")
    ap.add_argument("--split", help="K:YEAR — chapters before order K fit between the origin and YEAR, "
                                    "chapters from K on between YEAR and the time of writing")
    ap.add_argument("--start", action="append", default=[],
                    help="K:YYYY-MM — chapter K is known to start that month (month precision, not flagged "
                         "approximate); its paragraphs keep their own placement (repeatable)")
    ap.add_argument("--recollect", action="append", default=[],
                    help="K:FROM-TO — chapter K looks back: its paragraphs without a clue spread across FROM–TO "
                         "in file order instead of across the chapter's own span (repeatable)")
    a = ap.parse_args()

    if a.written:
        wy, wm = map(int, a.written.split("-"))
    else:
        st = (Path(__file__).resolve().parents[2] / ".readme").stat()
        d = datetime.date.fromtimestamp(getattr(st, "st_birthtime", st.st_mtime))
        wy, wm = d.year, d.month
    written = wy + (wm - 0.5) / 12

    api = Api(a.api)
    allx = [e for e in api.entries() if e["source"].startswith("readme:")]
    chapters = sorted([e for e in allx if e["kind"] == "chapter"], key=lambda e: e["position"])
    paras = sorted([e for e in allx if e["kind"] != "chapter"], key=lambda e: e["position"])
    by_ch = {str(c["id"]): [] for c in chapters}
    loose = []
    for p in paras:
        (by_ch[p["chapter"]] if p["chapter"] in by_ch else loose).append(p)

    # chapter starts: places in order, spread evenly from the origin to the time of writing; a clue in
    # a chapter moves its start only when it goes forward and lands within four years of that spread
    # (a chapter written now about childhood must not drag the present back to 2008)
    n = len(chapters)
    split = None
    if a.split:
        k, y = a.split.split(":"); split = (int(k), float(y))

    def prior_of(i):
        if not split:
            return BIRTH + (written - BIRTH) * i / n
        k, y = split
        return BIRTH + (y - BIRTH) * i / k if i < k else y + (written - y) * (i - k) / max(1, n - k)

    recollect = {}
    for r in a.recollect:
        k, span = r.split(":"); lo, hi = span.split("-")
        recollect[int(k)] = (float(lo), float(hi))

    starts = [None] * n
    starts[0] = BIRTH
    if split:
        starts[split[0]] = split[1]
    known_start = {}
    for r in a.start:
        k, ym = r.split(":"); y, m = map(int, ym.split("-"))
        known_start[int(k)] = (y, m)
        starts[int(k)] = y + (m - 0.5) / 12
    for i in range(1, n):
        if starts[i] is not None:
            continue
        prior = prior_of(i)
        prev = max([s for s in starts[:i] if s is not None])
        hints = [h for h in (clue(p["title"] + " " + p["body"]) for p in by_ch[str(chapters[i]["id"])])
                 if h is not None and prev < h < written and abs(h - prior) <= 4]
        if hints:
            starts[i] = min(hints)
        elif split:
            starts[i] = prior
    # spread the unknown ones between known neighbours, the last ends at the time of writing
    known = [(i, s) for i, s in enumerate(starts) if s is not None]
    end_i, end_s = n, written
    for i in range(len(chapters)):
        if starts[i] is not None:
            continue
        lo = max((k for k in known if k[0] < i), key=lambda k: k[0])
        hi = min((k for k in known if k[0] > i), key=lambda k: k[0], default=(end_i, end_s))
        starts[i] = lo[1] + (hi[1] - lo[1]) * (i - lo[0]) / (hi[0] - lo[0])
    ends = starts[1:] + [written]

    plan = []        # (entry, date, precision, date_end)
    for i, c in enumerate(chapters):
        prec = "day" if i == 0 else "year"
        date = "2003-12-04" if i == 0 else to_date(starts[i], prec)
        if i in known_start:
            prec, date = "month", "%d-%02d-01" % known_start[i]
        plan.append((c, date, prec, None if i == n - 1 else to_date(ends[i], "month")))
        ps = by_ch[str(c["id"])]
        lo, hi = recollect.get(i, (starts[i], ends[i]))
        quiet = [p for p in ps if clue(p["title"] + " " + p["body"]) is None]
        for p in ps:
            h = clue(p["title"] + " " + p["body"])
            y = h if h is not None else lo + (hi - lo) * (quiet.index(p) + 0.5) / max(1, len(quiet))
            plan.append((p, to_date(y, "year"), "year", None))
    for p in loose:
        h = clue(p["title"] + " " + p["body"])
        plan.append((p, to_date(h, "year") if h else f"{wy}-{wm:02d}-01", "year" if h else "month", None))

    fixed_ids = {chapters[k]["id"] for k in known_start}
    todo = [x for x in plan if x[0]["precision"] == "none" or x[0]["id"] in fixed_ids
            or (a.force and "approx-date" in (x[0].get("flags") or []))]
    by_clue = sum(1 for e, *_ in todo if e["kind"] != "chapter" and clue(e["title"] + " " + e["body"]) is not None)
    years = sorted({d[:4] for _, d, _, _ in todo})
    print(f"{len(chapters)} chapters, {len(paras)} paragraphs; placing {len(todo)} "
          f"({by_clue} paragraphs by a clue in the text, the rest by their chapter); years {years[0]}–{years[-1]}" if todo else "nothing to place")
    print("chapter starts:", ", ".join(f"{s:.1f}" for s in starts), f"| written {written:.1f}")
    if a.dry_run:
        return
    fixed = {chapters[k]["id"] for k in known_start}
    for e, date, prec, end in todo:
        flags = set(e.get("flags") or [])
        if e["id"] in fixed: flags.discard("approx-date")
        else: flags.add("approx-date")
        body = {"date": date, "precision": prec, "flags": sorted(flags)}
        if e["kind"] == "chapter":
            body["date_end"] = end or ""     # the last place is where iori lives now: open-ended
        api.patch(e["id"], body)
    print(f"placed {len(todo)}; all still private, flagged approx-date")


if __name__ == "__main__":
    main()
