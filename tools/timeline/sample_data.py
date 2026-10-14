#!/usr/bin/env python3
"""Fake timeline data for the P0 shell: writes timeline/data/index.json, one file per year,
and a few SVG placeholders. Local only — timeline/data/ is gitignored and, once the API
publishes the real thing, written on the server. Usage: python3 tools/timeline/sample_data.py [N]"""
import json, random, sys, hashlib
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "timeline" / "data"
ORIGIN = date(2003, 12, 4)
TODAY = date.today()
N = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
random.seed(4)

ASPECTS = [3 / 2, 2 / 3, 1.0, 16 / 9, 4 / 5, 4 / 3]
KINDS = [("image", 68), ("text", 16), ("video", 5), ("audio", 3), ("module", 3), ("link", 3), ("embed", 2)]
WORDS = ("light morning river chalk studio shader sleep road window forest sister piano garden winter "
         "render voxel splat camera print walk fog train attic kitchen cassette engine ember glass").split()

def words(n):
    return " ".join(random.choice(WORDS) for _ in range(n)).capitalize() + "."

def paragraphs():
    k = random.choice([1, 1, 2, 3])
    return "\n\n".join(words(random.randint(18, 90)) for _ in range(k))

def pick_kind():
    r = random.uniform(0, sum(w for _, w in KINDS))
    for k, w in KINDS:
        r -= w
        if r <= 0:
            return k
    return "image"

# placeholders: 18 flat SVGs, three per aspect, named by aspect bucket
def svg(w, h, hue):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'<rect width="{w}" height="{h}" fill="hsl({hue} 28% 62%)"/>'
            f'<circle cx="{w*0.62:.0f}" cy="{h*0.4:.0f}" r="{min(w,h)*0.22:.0f}" fill="hsl({(hue+40)%360} 32% 78%)"/></svg>')

(OUT / "s").mkdir(parents=True, exist_ok=True)
svgs = {}
for ai, a in enumerate(ASPECTS):
    for v in range(3):
        name = f"{ai}-{v}.svg"
        w = 600; h = round(w / a)
        (OUT / "s" / name).write_text(svg(w, h, (ai * 57 + v * 110) % 360))
        svgs.setdefault(ai, []).append(name)

# 11 chapters spread over the span, oldest at the origin
span = (TODAY - ORIGIN).days
chapter_days = sorted({0} | {int(span * random.uniform(0.04, 0.97)) for _ in range(10)})
chapters = []
for i, d in enumerate(chapter_days[:11]):
    start = ORIGIN + timedelta(days=d)
    end = ORIGIN + timedelta(days=chapter_days[i + 1]) if i + 1 < len(chapter_days) else None
    chapters.append({"slug": f"chapter-{i+1}", "title": f"Chapter {i+1}", "date": start.isoformat(),
                     "date_end": end.isoformat() if end else None, "body": words(random.randint(12, 30))})

# entries: clustered days (photo days have many), denser in recent years
entries = []
rows = []
years = {}
i = 0
while i < N:
    f = random.random() ** 0.6                     # denser toward today
    d = ORIGIN + timedelta(days=int(span * f))
    burst = random.choice([1, 1, 1, 2, 3, 5, 8, 14])
    for _ in range(min(burst, N - i)):
        kind = pick_kind()
        ai = random.randrange(len(ASPECTS))
        a = ASPECTS[ai] if kind in ("image", "video", "module", "embed") else (16 / 9 if kind == "audio" else 1)
        w = random.choice([1/3, 1/2, 1/2, 1/2, 2/3, 1]) if kind == "image" else random.choice([2/3, 1, 1])
        if kind in ("text", "link"):
            w = random.choice([1, 1, 2/3])
        prec = random.choice(["day"] * 12 + ["month"] * 2 + ["year"])
        slug = f"{d.isoformat()}-{hashlib.sha1(str(i).encode()).hexdigest()[:5]}"
        title = words(random.randint(2, 6)).rstrip(".") if random.random() < 0.6 else ""
        body = paragraphs() if kind == "text" else (words(random.randint(6, 20)) if random.random() < 0.3 else "")
        chapter = next((c["slug"] for c in reversed(chapters) if c["date"] <= d.isoformat()), None)
        entry = {"title": title, "body": body, "kind": kind, "date": d.isoformat(), "precision": prec,
                 "frame": {"w": round(w, 4), "a": round(a, 4), "align": "c"}, "chapter": chapter, "tags": []}
        if kind == "image":
            entry["media"] = [{"src": f"timeline/data/s/{random.choice(svgs[ai])}", "w": 600, "h": round(600 / a)}]
        elif kind == "video":
            entry["media"] = [{"src": "", "poster": f"timeline/data/s/{random.choice(svgs[ai])}", "dur": random.randint(4, 90)}]
        elif kind == "link":
            entry["src"] = "https://3die.fr/"
        rows.append([slug, d.isoformat(), prec, kind, round(a, 4), round(w, 4), len(body) + len(title)])
        years.setdefault(d.year, {})[slug] = entry
        i += 1

OUT.mkdir(parents=True, exist_ok=True)
index = {"v": 1, "generated": TODAY.isoformat(),
         "settings": {"font": "manrope", "order": "asc", "start": "origin", "theme": "system", "origin": ORIGIN.isoformat()},
         "chapters": chapters, "entries": rows}
(OUT / "index.json").write_text(json.dumps(index, separators=(",", ":")))
for y, ents in years.items():
    (OUT / f"{y}.json").write_text(json.dumps({"year": y, "entries": ents}, separators=(",", ":")))
print(f"{len(rows)} entries, {len(years)} year files, index {(OUT/'index.json').stat().st_size//1024} KB → {OUT}")
