#!/usr/bin/env python3
"""Seed a LOCAL timeline API with test entries for working on the editor: generated photos with
camera dates across the years, notes, a link, two chapters. Everything is tagged "seed".

    TIMELINE_TOKEN=... python3 tools/timeline/seed_local.py [--api http://127.0.0.1:8796] [--wipe]

--wipe deletes every entry tagged "seed" first. Never point this at api.3die.fr."""
import argparse, io, json, os, random, sys, urllib.request, uuid

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("run with api/venv/bin/python (needs Pillow)")

ap = argparse.ArgumentParser()
ap.add_argument("--api", default="http://127.0.0.1:8796")
ap.add_argument("--wipe", action="store_true")
a = ap.parse_args()
if "3die.fr" in a.api:
    sys.exit("refusing to seed the production API")
TOKEN = os.environ["TIMELINE_TOKEN"]
random.seed(7)


def call(method, path, body=None, data=None, ctype="application/json"):
    req = urllib.request.Request(a.api + path, method=method, data=data if data is not None else (json.dumps(body).encode() if body is not None else None),
                                 headers={"Authorization": "Bearer " + TOKEN, "Content-Type": ctype})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or b"{}")


def multipart(fields, files):
    b = uuid.uuid4().hex
    out = io.BytesIO()
    for k, v in fields.items():
        out.write(f"--{b}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode())
    for k, (name, data, ctype) in files.items():
        out.write(f"--{b}\r\nContent-Disposition: form-data; name=\"{k}\"; filename=\"{name}\"\r\nContent-Type: {ctype}\r\n\r\n".encode())
        out.write(data); out.write(b"\r\n")
    out.write(f"--{b}--\r\n".encode())
    return out.getvalue(), f"multipart/form-data; boundary={b}"


PALETTES = [((22, 18, 14), (214, 120, 52)), ((18, 30, 34), (120, 168, 176)), ((34, 22, 30), (226, 160, 120)), ((28, 26, 20), (200, 190, 160))]


def photo(w, h, when):
    lo, hi = random.choice(PALETTES)
    im = Image.new("RGB", (w, h), lo)
    d = ImageDraw.Draw(im)
    for i in range(h):
        t = (i / h) ** 1.6
        d.line([(0, i), (w, i)], fill=tuple(int(lo[c] + (hi[c] - lo[c]) * t) for c in range(3)))
    for _ in range(5):
        r = random.randint(min(w, h) // 12, min(w, h) // 4)
        x, y = random.randint(0, w), random.randint(h // 3, h)
        d.ellipse((x - r, y - r, x + r, y + r), fill=tuple(min(255, c + 30) for c in hi))
    ex = Image.Exif(); ex.get_ifd(0x8769)[36867] = when.replace("-", ":") + " 12:00:00"
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=85, exif=ex.tobytes())
    return buf.getvalue()


if a.wipe:
    for e in call("GET", "/timeline/entries")["entries"]:
        if "seed" in e["tags"]:
            call("DELETE", f"/timeline/entries/{e['id']}")

made = 0
call("POST", "/timeline/entries", {"kind": "chapter", "title": "The river flat", "body": "A test chapter with a body line, seeded locally.",
                                   "date": "2008-03-01", "precision": "month", "visibility": "public", "tags": ["seed"]})
call("POST", "/timeline/entries", {"kind": "chapter", "title": "The hill flat", "date": "2019-09-01", "precision": "month", "visibility": "public", "tags": ["seed"]})
days = ["2006-07-21", "2008-05-14", "2011-10-02", "2014-02-11", "2016-08-30", "2019-11-05", "2022-04-17", "2025-06-21"]
for day in days:
    for j in range(random.choice([1, 2, 3, 4])):
        w, h = random.choice([(1800, 1200), (1200, 1800), (1600, 1600), (1920, 1080), (1200, 1500)])
        data, ctype = multipart({}, {"file": (f"seed-{day}-{j}.jpg", photo(w, h, day), "image/jpeg")})
        e = call("POST", "/timeline/upload", data=data, ctype=ctype)
        call("PATCH", f"/timeline/entries/{e['id']}", {"tags": ["seed"], "visibility": random.choice(["public", "public", "private"]),
                                                     "title": random.choice(["", "", "Evening light", "The yard", "Fog over the roofs"])})
        made += 1
    if random.random() < 0.7:
        call("POST", "/timeline/entries", {"kind": "text", "date": day, "precision": "day", "visibility": "public", "tags": ["seed"],
                                           "title": random.choice(["A note", "Afterwards", "What stayed"]),
                                           "body": "Light comes through the window in long bars and lands on the desk. The machine hums; outside, the tram turns.\n\nA second paragraph, shorter."})
        made += 1
call("POST", "/timeline/entries", {"kind": "link", "date": "2023-09-20", "precision": "day", "visibility": "public", "tags": ["seed"],
                                   "title": "3DIE — Design, Art & Technologies Label", "src": "https://3die.fr/", "frame": {"w": 1}})
print(f"seeded {made + 3} entries")
