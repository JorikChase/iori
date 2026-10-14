#!/usr/bin/env python3
"""
Smoke test for the timeline: scoped sessions, entries, uploads (EXIF date, thumbnails, no GPS
in what is served), publish (private never leaves the database). Calls the route functions
directly against a throwaway SQLite file and temp folders.

    api/venv/bin/python api/test_timeline.py
"""
import io, json, os, sys, tempfile
from pathlib import Path

tmp = tempfile.mkdtemp(prefix="iori-timeline-test-")
os.environ["DB_PATH"] = os.path.join(tmp, "test.db")
os.environ["MEDIA_DIR"] = os.path.join(tmp, "media")
os.environ["TIMELINE_DIR"] = os.path.join(tmp, "published")
os.environ["ORIGINALS_DIR"] = os.path.join(tmp, "originals")
os.environ["MEDIA_BASEURL"] = "https://3die.fr/media"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import main as m  # noqa: E402
from fastapi import HTTPException, UploadFile  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402
from starlette.datastructures import Headers  # noqa: E402

client = TestClient(m.app)
PUB = Path(os.environ["TIMELINE_DIR"])
iori = {"id": 1, "username": "iori", "role": "admin", "scope": ""}


def expect(code, fn):
    try:
        fn()
    except HTTPException as e:
        assert e.status_code == code, f"expected {code}, got {e.status_code}: {e.detail}"
        return
    raise AssertionError(f"expected HTTP {code}")


def route(path, method):
    for r in m.app.routes:
        if getattr(r, "path", None) == path and method in getattr(r, "methods", ()):
            return r.endpoint
    raise KeyError(path)


create = route("/timeline/entries", "POST")
patch = route("/timeline/entries/{entry_id}", "PATCH")
delete = route("/timeline/entries/{entry_id}", "DELETE")
listing = route("/timeline/entries", "GET")
publish = route("/timeline/publish", "POST")
put_settings = route("/timeline/settings", "PUT")

# --- sessions: a timeline token edits the timeline and nothing else
pw = "test-" + os.urandom(6).hex()
with m.db() as conn:
    conn.execute("INSERT INTO users(username, pass_hash, role, created_at) VALUES (?, ?, 'admin', ?)",
                 ("tladmin", m.bcrypt.hashpw(pw.encode(), m.bcrypt.gensalt(4)).decode(), m.now()))
    conn.execute("INSERT INTO users(username, pass_hash, role, created_at) VALUES (?, ?, 'member', ?)",
                 ("tlmember", m.bcrypt.hashpw(pw.encode(), m.bcrypt.gensalt(4)).decode(), m.now()))
r = client.post("/auth/login", json={"username": "tladmin", "password": pw, "scope": "timeline"})
assert r.status_code == 200 and r.json()["token"] and "set-cookie" not in r.headers, r.text
tok = {"Authorization": "Bearer " + r.json()["token"]}
assert client.get("/auth/me", headers=tok).json()["scope"] == "timeline"
assert client.get("/timeline/entries", headers=tok).status_code == 200
assert client.get("/board", headers=tok).status_code == 403          # the dash stays closed to it
assert client.get("/timeline/entries").status_code == 401
r = client.post("/auth/login", json={"username": "tlmember", "password": pw, "scope": "timeline"})
assert client.get("/timeline/entries", headers={"Authorization": "Bearer " + r.json()["token"]}).status_code == 403
assert client.post("/auth/login", json={"username": "tladmin", "password": pw, "scope": "root"}).status_code == 400
cookie_login = client.post("/auth/login", json={"username": "tladmin", "password": pw})
assert "token" not in cookie_login.json() and "iori_session" in cookie_login.headers.get("set-cookie", "")
client.cookies.clear()
assert client.post("/auth/logout", headers=tok).status_code == 200
assert client.get("/timeline/entries", headers=tok).status_code == 401

# --- entries: validation, slugs, snapping
ch = create({"kind": "chapter", "title": "First Place", "date": "2003-12-04", "precision": "day", "visibility": "public"}, user=iori)
assert ch["slug"] == "2003-12-first-place", ch["slug"]
t1 = create({"kind": "text", "title": "First", "body": "Hello **world**.", "date": "2004-05", "precision": "month",
             "frame": {"w": 0.62}, "visibility": "public", "tags": ["A", "a", " b "]}, user=iori)
assert t1["date"] == "2004-05-01" and t1["precision"] == "month"
assert abs(t1["frame"]["w"] - 2 / 3) < 1e-9 and t1["tags"] == ["a", "b"]
private = create({"kind": "text", "title": "Secret", "body": "never published", "date": "2004-05-02",
                  "precision": "day", "source": "readme:abc"}, user=iori)
assert private["visibility"] == "private"
again = create({"kind": "text", "body": "dup", "source": "readme:abc"}, user=iori)
assert again["existing"] and again["id"] == private["id"]                  # imports are idempotent
undated = create({"kind": "text", "title": "Someday", "visibility": "public"}, user=iori)
assert undated["precision"] == "none" and undated["slug"].startswith("undated-")
unl = create({"kind": "link", "title": "Unlisted", "src": "https://3die.fr/", "date": "2005", "precision": "year",
              "visibility": "unlisted"}, user=iori)
expect(400, lambda: create({"kind": "poem"}, user=iori))
expect(400, lambda: create({"kind": "text", "date": "2004-13-01", "precision": "day"}, user=iori))
expect(400, lambda: create({"kind": "link", "src": "javascript:alert(1)"}, user=iori))
expect(400, lambda: create({"kind": "module", "src": "../../etc"}, user=iori))
expect(400, lambda: patch(t1["id"], {"visibility": "everyone"}, user=iori))
moved = patch(private["id"], {"date": "2004-06-01", "title": "Moved"}, user=iori)
assert moved["slug"] == "2004-06-moved"                                    # unpublished slugs follow the entry

# --- uploads: EXIF date, orientation, WebP sizes, originals private, no GPS served
def jpeg(w, h, exif_date=None, gps=False):
    im = Image.new("RGB", (w, h), (200, 120, 40))
    ex = Image.Exif()
    if exif_date:
        ex.get_ifd(0x8769)[36867] = exif_date
    if gps:
        ex.get_ifd(0x8825)[2] = (50.0, 5.0, 0.0)
    buf = io.BytesIO(); im.save(buf, "JPEG", exif=ex.tobytes()); buf.seek(0)
    return buf

up = client.post("/timeline/upload", headers={"Authorization": "Bearer " +
                 client.post("/auth/login", json={"username": "tladmin", "password": pw, "scope": "timeline"}).json()["token"]},
                 files={"file": ("p.jpg", jpeg(3000, 2000, "2007:03:14 10:00:00", gps=True), "image/jpeg")})
assert up.status_code == 200, up.text
img = up.json()
assert img["date"] == "2007-03-14" and img["precision"] == "day" and img["kind"] == "image"
mi = img["media"][0]
assert mi["sizes"] == [480, 1080, 2160] and (mi["w"], mi["h"]) == (3000, 2000)
assert abs(img["frame"]["a"] - 1.5) < 1e-3 and img["visibility"] == "private"
assert img["view"][0]["src"].endswith(f"{mi['id']}-1080.webp") and "2160w" in img["view"][0]["srcset"]
thumb = Path(os.environ["MEDIA_DIR"]) / "t" / f"{mi['id']}-1080.webp"
assert thumb.exists() and not Image.open(thumb).getexif(), "a served thumbnail must carry no EXIF"
assert list(Path(os.environ["ORIGINALS_DIR"]).glob(mi["id"] + "*")), "original kept privately"
assert not list((Path(os.environ["MEDIA_DIR"]) / "t").glob(mi["id"] + ".jp*")), "original not in the served folder"
small = client.post("/timeline/upload", headers=tok, files={"file": ("s.png", jpeg(300, 300), "image/jpeg")})
assert small.status_code == 401                                             # logged-out token
img = patch(img["id"], {"visibility": "public", "title": "A photo"}, user=iori)
assert img["slug"] == "2007-03-a-photo"

# --- settings
assert put_settings({"font": "jost"}, user=iori)["font"] == "jost"
assert put_settings({"weight": "bold"}, user=iori)["weight"] == "bold"
expect(400, lambda: put_settings({"weight": "black"}, user=iori))
expect(400, lambda: put_settings({"font": "comic-sans"}, user=iori))
expect(400, lambda: put_settings({"admin": True}, user=iori))

# --- publish: public rows in index + years, unlisted in e/, private and undated nowhere
res = publish(user=iori)
assert res == {"ok": True, "public": 2, "unlisted": 1, "chapters": 1, "years": 2, "skipped_undated": 1}, res
index = json.loads((PUB / "index.json").read_text())
slugs = [r[0] for r in index["entries"]]
assert slugs == [t1["slug"], img["slug"]] and index["settings"]["font"] == "jost"
assert index["chapters"][0]["title"] == "First Place"
everything = "".join(p.read_text() for p in PUB.rglob("*.json"))
assert "never published" not in everything and "Secret" not in everything and "Someday" not in everything
assert "readme:" not in everything and '"flags"' not in everything and '"source"' not in everything
y2007 = json.loads((PUB / "2007.json").read_text())["entries"][img["slug"]]
assert y2007["media"][0]["src"].endswith("-1080.webp") and "480w" in y2007["media"][0]["srcset"]
assert y2007["chapter"] == ch["slug"]
assert (PUB / "e" / f"{unl['slug']}.json").exists()
# published slugs are locked
expect(409, lambda: patch(t1["id"], {"slug": "renamed"}, user=iori))
# unpublishing removes the year file
patch(img["id"], {"visibility": "private"}, user=iori)
publish(user=iori)
assert not (PUB / "2007.json").exists() and (PUB / "2004.json").exists()

# --- delete removes media files
delete(img["id"], user=iori)
assert not list((Path(os.environ["MEDIA_DIR"]) / "t").glob(mi["id"] + "*"))
assert not list(Path(os.environ["ORIGINALS_DIR"]).glob(mi["id"] + "*"))
assert all(e["id"] != img["id"] for e in listing(user=iori)["entries"])

print("timeline: all checks passed")
