"""
Timeline — the entries behind iori.me/timeline.html.

Admin-only CRUD over a `timeline` table, uploads with EXIF dates and WebP thumbnails, and a
publish step that writes the static files the public page reads:

    TIMELINE_DIR/index.json      settings + chapters + one compact row per public entry
    TIMELINE_DIR/<year>.json     full public entries of that year
    TIMELINE_DIR/e/<slug>.json   unlisted entries (reachable by link only)

Private entries never leave the database. Uploaded originals go to ORIGINALS_DIR, which is
not served: only the generated WebPs (no EXIF, so no GPS) are public.

main.py mounts this with make_router(); nothing here imports main (it runs as __main__).
"""

import json
import os
import re
import secrets
import shutil
import unicodedata
import uuid
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

KINDS = ("image", "video", "audio", "text", "link", "embed", "page", "module", "mention", "chapter")
VISIBILITY = ("private", "unlisted", "public")
PRECISION = ("day", "month", "year", "none")
FRAME_W = (1 / 3, 1 / 2, 2 / 3, 1.0, 2.0)          # 2 = bleed
THUMB_W = (480, 1080, 2160)
FONTS = ("manrope", "jost", "outfit")
SETTINGS_DEFAULTS = {"font": "outfit", "weight": "bold", "order": "asc", "start": "origin", "theme": "system", "origin": "2003-12-04"}
MAX_MB = 300
URL_RE = re.compile(r"^https?://[^\s]+$", re.I)
SNIPPET_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

SCHEMA = """
CREATE TABLE IF NOT EXISTS timeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    date TEXT NOT NULL DEFAULT '',
    precision TEXT NOT NULL DEFAULT 'none',
    date_end TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    media TEXT NOT NULL DEFAULT '[]',
    src TEXT NOT NULL DEFAULT '',
    frame TEXT NOT NULL DEFAULT '{}',
    chapter TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    visibility TEXT NOT NULL DEFAULT 'private',
    flags TEXT NOT NULL DEFAULT '[]',
    position REAL NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    published_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_timeline_date ON timeline(date, position);
CREATE INDEX IF NOT EXISTS idx_timeline_source ON timeline(source);
CREATE TABLE IF NOT EXISTS timeline_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

JSON_FIELDS = ("media", "frame", "tags", "flags")


# ------------------------------------------------------------------ helpers

def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text[:48].strip("-")


def snap_w(v) -> float:
    try:
        v = float(v)
    except (TypeError, ValueError):
        raise HTTPException(400, "frame.w must be a number")
    return min(FRAME_W, key=lambda f: abs(f - v))


def clean_date(value: str, precision: str):
    """Returns (iso date for sorting, precision). Month/year precision store the first day."""
    value = (value or "").strip()
    if precision not in PRECISION:
        raise HTTPException(400, f"precision must be one of {', '.join(PRECISION)}")
    if precision == "none" or not value:
        return "", "none"
    m = re.match(r"^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$", value)
    if not m:
        raise HTTPException(400, "date must be YYYY, YYYY-MM or YYYY-MM-DD")
    y, mo, d = int(m.group(1)), int(m.group(2) or 1), int(m.group(3) or 1)
    if precision == "year":
        mo, d = 1, 1
    elif precision == "month":
        d = 1
    try:
        return date(y, mo, d).isoformat(), precision
    except ValueError:
        raise HTTPException(400, "not a real date")


def row_dict(row) -> Dict[str, Any]:
    d = dict(row)
    for k in JSON_FIELDS:
        try:
            d[k] = json.loads(d[k]) if d.get(k) else ([] if k != "frame" else {})
        except (json.JSONDecodeError, TypeError):
            d[k] = [] if k != "frame" else {}
    return d


def exif_date(img) -> Optional[str]:
    try:
        ex = img.getexif()
        raw = ex.get_ifd(0x8769).get(36867) or ex.get(306)      # DateTimeOriginal, then DateTime
    except Exception:
        return None
    if not raw:
        return None
    m = re.match(r"^(\d{4}):(\d{2}):(\d{2})", str(raw))
    if not m or m.group(1) == "0000":
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
    except ValueError:
        return None


# ------------------------------------------------------------------ router

def make_router(db, now, get_session_user, media_dir: Path, media_baseurl: str,
                timeline_dir: Path, originals_dir: Path) -> APIRouter:
    router = APIRouter(prefix="/timeline")
    thumbs = media_dir / "t"
    thumbs.mkdir(parents=True, exist_ok=True)
    originals_dir.mkdir(parents=True, exist_ok=True)
    timeline_dir.mkdir(parents=True, exist_ok=True)

    with db() as conn:
        conn.executescript(SCHEMA)

    def require_editor(request: Request):
        """The timeline is iori's: admin role, from the dash cookie or a timeline-scoped bearer token."""
        user = get_session_user(request)
        if not user:
            raise HTTPException(401, "not authenticated")
        if user.get("scope") not in ("", "timeline"):
            raise HTTPException(403, "token not valid here")
        if user["role"] != "admin":
            raise HTTPException(403, "admin only")
        return user

    # ---------------------------------------------------------- settings

    def load_settings(conn) -> Dict[str, Any]:
        s = dict(SETTINGS_DEFAULTS)
        for r in conn.execute("SELECT key, value FROM timeline_settings"):
            try:
                s[r["key"]] = json.loads(r["value"])
            except json.JSONDecodeError:
                pass
        return s

    @router.get("/settings")
    def get_settings(user=Depends(require_editor)):
        with db() as conn:
            return load_settings(conn)

    @router.put("/settings")
    def put_settings(body: dict, user=Depends(require_editor)):
        allowed = {"font": FONTS, "weight": ("light", "regular", "bold"), "order": ("asc", "desc"), "start": ("origin", "now"),
                   "theme": ("system", "light", "dark")}
        with db() as conn:
            for k, v in body.items():
                if k not in allowed:
                    raise HTTPException(400, f"unknown setting: {k}")
                if v not in allowed[k]:
                    raise HTTPException(400, f"{k} must be one of {', '.join(allowed[k])}")
                conn.execute("INSERT INTO timeline_settings(key, value) VALUES (?, ?) "
                             "ON CONFLICT(key) DO UPDATE SET value = excluded.value", (k, json.dumps(v)))
            return load_settings(conn)

    # ---------------------------------------------------------- entries

    def view(e: Dict[str, Any]) -> Dict[str, Any]:
        """An entry for the editor: the stored row plus the media as the page shows it."""
        e["view"] = [public_media(m) for m in e.get("media", [])]
        return e

    def unique_slug(conn, base: str, exclude_id: Optional[int] = None) -> str:
        base = base or "entry"
        slug, n = base, 2
        while True:
            r = conn.execute("SELECT id FROM timeline WHERE slug = ?", (slug,)).fetchone()
            if not r or r["id"] == exclude_id:
                return slug
            slug = f"{base}-{n}"
            n += 1

    def base_slug(d: str, title: str, kind: str) -> str:
        head = d[:7] if d else "undated"
        tail = slugify(title) or kind
        return f"{head}-{tail}"

    def clean_fields(body: dict, current: Optional[dict] = None) -> Dict[str, Any]:
        """Validate a create/patch body; returns only the columns to write."""
        out: Dict[str, Any] = {}
        cur = current or {}
        if "kind" in body:
            if body["kind"] not in KINDS:
                raise HTTPException(400, f"kind must be one of {', '.join(KINDS)}")
            out["kind"] = body["kind"]
        if "date" in body or "precision" in body:
            prec = body.get("precision", cur.get("precision") or ("day" if body.get("date") else "none"))
            out["date"], out["precision"] = clean_date(body.get("date", cur.get("date", "")), prec)
        if "date_end" in body:
            de = (body["date_end"] or "").strip()
            if de and not DATE_RE.match(de):
                raise HTTPException(400, "date_end must be YYYY-MM-DD")
            out["date_end"] = de
        if "title" in body:
            out["title"] = str(body["title"] or "").strip()[:300]
        if "body" in body:
            out["body"] = str(body["body"] or "").replace("\r\n", "\n").strip()[:200000]
        if "src" in body:
            src = str(body["src"] or "").strip()
            kind = out.get("kind", cur.get("kind"))
            if src and kind == "module" and not SNIPPET_RE.match(src):
                raise HTTPException(400, "a module src is a snippet name: lowercase letters, digits, dashes")
            if src and kind != "module" and not URL_RE.match(src):
                raise HTTPException(400, "src must be an http(s) URL")
            out["src"] = src
        if "frame" in body:
            f = body["frame"] or {}
            if not isinstance(f, dict):
                raise HTTPException(400, "frame must be an object")
            frame = dict(cur.get("frame") or {})
            if "w" in f:
                frame["w"] = snap_w(f["w"])
            if "a" in f:
                if f["a"] is None:
                    frame.pop("a", None)
                else:
                    try:
                        frame["a"] = max(0.1, min(10.0, float(f["a"])))
                    except (TypeError, ValueError):
                        raise HTTPException(400, "frame.a must be a number")
            if "align" in f:
                if f["align"] not in ("l", "c", "r"):
                    raise HTTPException(400, "frame.align must be l, c or r")
                frame["align"] = f["align"]
            out["frame"] = json.dumps(frame)
        if "chapter" in body:
            out["chapter"] = str(body["chapter"] or "").strip()[:80]
        if "tags" in body:
            tags = body["tags"] or []
            if not isinstance(tags, list):
                raise HTTPException(400, "tags must be a list")
            seen: List[str] = []
            for t in tags:
                t = str(t).strip().lower()[:40]
                if t and t not in seen:
                    seen.append(t)
            out["tags"] = json.dumps(seen[:20])
        if "visibility" in body:
            if body["visibility"] not in VISIBILITY:
                raise HTTPException(400, f"visibility must be one of {', '.join(VISIBILITY)}")
            out["visibility"] = body["visibility"]
        if "flags" in body:
            flags = body["flags"] or []
            if not isinstance(flags, list):
                raise HTTPException(400, "flags must be a list")
            out["flags"] = json.dumps([str(x)[:40] for x in flags][:10])
        if "position" in body:
            try:
                out["position"] = float(body["position"])
            except (TypeError, ValueError):
                raise HTTPException(400, "position must be a number")
        if "source" in body:
            out["source"] = str(body["source"] or "")[:120]
        if "slug" in body:
            s = slugify(str(body["slug"] or ""))
            if not s:
                raise HTTPException(400, "slug cannot be empty")
            out["slug"] = s
        return out

    def get_row(conn, entry_id: int):
        row = conn.execute("SELECT * FROM timeline WHERE id = ?", (entry_id,)).fetchone()
        if not row:
            raise HTTPException(404, "entry not found")
        return row

    @router.get("/entries")
    def list_entries(visibility: str = "", source: str = "", user=Depends(require_editor)):
        q, args = "SELECT * FROM timeline", []
        cond = []
        if visibility:
            cond.append("visibility = ?"); args.append(visibility)
        if source:
            cond.append("source LIKE ?"); args.append(source + "%")
        if cond:
            q += " WHERE " + " AND ".join(cond)
        q += " ORDER BY date = '', date, position, id"
        with db() as conn:
            return {"entries": [view(row_dict(r)) for r in conn.execute(q, args)]}

    @router.get("/entries/{entry_id}")
    def get_entry(entry_id: int, user=Depends(require_editor)):
        with db() as conn:
            return view(row_dict(get_row(conn, entry_id)))

    @router.post("/entries")
    def create_entry(body: dict, user=Depends(require_editor)):
        if body.get("kind") not in KINDS:
            raise HTTPException(400, f"kind must be one of {', '.join(KINDS)}")
        fields = clean_fields({"precision": "none", **body})
        with db() as conn:
            if fields.get("source"):
                dup = conn.execute("SELECT * FROM timeline WHERE source = ?", (fields["source"],)).fetchone()
                if dup:
                    return {**view(row_dict(dup)), "existing": True}
            slug = fields.pop("slug", None) or base_slug(fields.get("date", ""), fields.get("title", ""), fields["kind"])
            fields["slug"] = unique_slug(conn, slug)
            fields["created_at"] = fields["updated_at"] = now()
            cols = ", ".join(fields)
            cur = conn.execute(f"INSERT INTO timeline({cols}) VALUES ({', '.join('?' * len(fields))})",
                               list(fields.values()))
            return view(row_dict(get_row(conn, cur.lastrowid)))

    @router.patch("/entries/{entry_id}")
    def update_entry(entry_id: int, body: dict, user=Depends(require_editor)):
        with db() as conn:
            current = row_dict(get_row(conn, entry_id))
            fields = clean_fields(body, current)
            if "slug" in fields:
                if current["published_at"] and fields["slug"] != current["slug"] and not body.get("force_slug"):
                    raise HTTPException(409, "this entry was published under its slug; shared links would break")
                fields["slug"] = unique_slug(conn, fields["slug"], exclude_id=entry_id)
            elif not current["published_at"] and ("date" in fields or "title" in fields):
                # an unpublished entry keeps a slug that matches its date and title
                d = fields.get("date", current["date"]); t = fields.get("title", current["title"])
                fields["slug"] = unique_slug(conn, base_slug(d, t, current["kind"]), exclude_id=entry_id)
            if not fields:
                return view(current)
            fields["updated_at"] = now()
            sets = ", ".join(f"{k} = ?" for k in fields)
            conn.execute(f"UPDATE timeline SET {sets} WHERE id = ?", [*fields.values(), entry_id])
            return view(row_dict(get_row(conn, entry_id)))

    @router.delete("/entries/{entry_id}")
    def delete_entry(entry_id: int, user=Depends(require_editor)):
        with db() as conn:
            row = row_dict(get_row(conn, entry_id))
            conn.execute("DELETE FROM timeline WHERE id = ?", (entry_id,))
        for m in row["media"]:
            unlink_item(m)
        return {"ok": True}

    # ---------------------------------------------------------- media

    def unlink_item(m: dict):
        mid = m.get("id", "")
        if not re.match(r"^[0-9a-f]{32}$", mid):
            return
        for p in list(thumbs.glob(mid + "*")) + list(originals_dir.glob(mid + "*")):
            try:
                p.unlink()
            except OSError:
                pass

    def save_upload(f: UploadFile, dest: Path):
        size = 0
        with open(dest, "wb") as out:
            while True:
                chunk = f.file.read(1 << 20)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_MB * 1024 * 1024:
                    out.close(); dest.unlink(missing_ok=True)
                    raise HTTPException(400, f"file too large (>{MAX_MB} MB): {f.filename}")
                out.write(chunk)

    def make_thumbs(img, mid: str, tag: str = "") -> List[int]:
        """WebP at each width up to the original's; no metadata is copied, so no EXIF or GPS."""
        from PIL import Image
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
        widths = [w for w in THUMB_W if w < img.width] + [min(img.width, THUMB_W[-1])]
        widths = sorted(set(widths))
        for w in widths:
            h = max(1, round(img.height * w / img.width))
            im = img if w == img.width else img.resize((w, h), Image.LANCZOS)
            im.save(thumbs / f"{mid}{tag}-{w}.webp", "WEBP", quality=82, method=5)
        return widths

    def ingest(f: UploadFile, poster: Optional[UploadFile], w: str, h: str, dur: str) -> Dict[str, Any]:
        """Store one upload; returns the media item and the EXIF date when the file has one."""
        ctype = (f.content_type or "").lower()
        ext = (Path(f.filename or "").suffix.lower()[:10] or ".bin")
        mid = uuid.uuid4().hex
        item: Dict[str, Any] = {"id": mid, "mime": ctype, "name": (f.filename or "")[:120]}
        taken = None
        if ctype.startswith("image/"):
            if re.match(r"^image/(heic|heif|tiff)", ctype):
                raise HTTPException(400, f"{f.filename}: convert HEIC/TIFF to JPEG before uploading")
            from PIL import Image, ImageOps
            orig = originals_dir / f"{mid}{ext}"
            save_upload(f, orig)
            try:
                with Image.open(orig) as im:
                    taken = exif_date(im)
                    im = ImageOps.exif_transpose(im)
                    item.update(type="image", w=im.width, h=im.height, sizes=make_thumbs(im, mid))
            except HTTPException:
                raise
            except Exception:
                orig.unlink(missing_ok=True)
                raise HTTPException(400, f"{f.filename}: not a readable image")
            if ctype == "image/gif":
                # animated GIFs keep their motion: the original is published as is
                shutil.copyfile(orig, thumbs / f"{mid}.gif")
                item["anim"] = True
        elif ctype.startswith("video/") or ctype.startswith("audio/"):
            kind = "video" if ctype.startswith("video/") else "audio"
            save_upload(f, thumbs / f"{mid}{ext}")
            item.update(type=kind, ext=ext)
            for k, v in (("w", w), ("h", h), ("dur", dur)):
                try:
                    if v:
                        item[k] = round(float(v), 2) if k == "dur" else int(float(v))
                except ValueError:
                    pass
            if poster is not None and poster.filename:
                from PIL import Image, ImageOps
                tmp = originals_dir / f"{mid}-poster.tmp"
                save_upload(poster, tmp)
                try:
                    with Image.open(tmp) as im:
                        im = ImageOps.exif_transpose(im)
                        item["poster"] = make_thumbs(im, mid, "-poster")
                        item.setdefault("w", im.width); item.setdefault("h", im.height)
                except Exception:
                    raise HTTPException(400, "poster is not a readable image")
                finally:
                    tmp.unlink(missing_ok=True)
        else:
            raise HTTPException(400, f"unsupported file type: {f.filename}")
        return {"item": item, "taken": taken}

    @router.post("/upload")
    async def upload_new(file: UploadFile = File(...), poster: Optional[UploadFile] = File(None),
                         date_hint: str = Form(""), w: str = Form(""), h: str = Form(""), dur: str = Form(""),
                         user=Depends(require_editor)):
        """Drop a file: a new private entry, dated by EXIF, else by the hint, else undated."""
        got = ingest(file, poster, w, h, dur)
        item, taken = got["item"], got["taken"]
        d, prec = (taken, "day") if taken else ((date_hint, "day") if date_hint else ("", "none"))
        frame = {"w": 0.5 if item["type"] == "image" else 1.0}
        if item.get("w") and item.get("h"):
            frame["a"] = round(item["w"] / item["h"], 4)
        body = {"kind": item["type"], "date": d, "precision": prec, "frame": frame, "visibility": "private"}
        entry = create_entry(body, user=user)
        with db() as conn:
            conn.execute("UPDATE timeline SET media = ? WHERE id = ?", (json.dumps([item]), entry["id"]))
            return view(row_dict(get_row(conn, entry["id"])))

    @router.post("/entries/{entry_id}/media")
    async def add_media(entry_id: int, file: UploadFile = File(...), poster: Optional[UploadFile] = File(None),
                        w: str = Form(""), h: str = Form(""), dur: str = Form(""), user=Depends(require_editor)):
        with db() as conn:
            get_row(conn, entry_id)
        got = ingest(file, poster, w, h, dur)
        with db() as conn:
            row = row_dict(get_row(conn, entry_id))
            media = row["media"] + [got["item"]]
            sets = {"media": json.dumps(media), "updated_at": now()}
            if row["precision"] == "none" and got["taken"]:
                sets.update(date=got["taken"], precision="day")
            if len(media) == 1 and got["item"].get("w") and got["item"].get("h") and "a" not in row["frame"]:
                sets["frame"] = json.dumps({**row["frame"], "a": round(got["item"]["w"] / got["item"]["h"], 4)})
            conn.execute(f"UPDATE timeline SET {', '.join(k + ' = ?' for k in sets)} WHERE id = ?",
                         [*sets.values(), entry_id])
            return view(row_dict(get_row(conn, entry_id)))

    @router.delete("/entries/{entry_id}/media/{media_id}")
    def remove_media(entry_id: int, media_id: str, user=Depends(require_editor)):
        with db() as conn:
            row = row_dict(get_row(conn, entry_id))
            keep = [m for m in row["media"] if m.get("id") != media_id]
            gone = [m for m in row["media"] if m.get("id") == media_id]
            if not gone:
                raise HTTPException(404, "media not found")
            conn.execute("UPDATE timeline SET media = ?, updated_at = ? WHERE id = ?",
                         (json.dumps(keep), now(), entry_id))
            out = view(row_dict(get_row(conn, entry_id)))
        for m in gone:
            unlink_item(m)
        return out

    # ---------------------------------------------------------- publish

    def public_media(m: dict) -> Dict[str, Any]:
        base = media_baseurl.rstrip("/") + "/t/"
        out: Dict[str, Any] = {"type": m.get("type")}
        for k in ("w", "h", "dur"):
            if m.get(k):
                out[k] = m[k]
        if m.get("type") == "image":
            sizes = m.get("sizes") or []
            if m.get("anim"):
                out["src"] = f"{base}{m['id']}.gif"
            elif sizes:
                mid_w = max([s for s in sizes if s <= 1080] or [sizes[0]])
                out["src"] = f"{base}{m['id']}-{mid_w}.webp"
                out["srcset"] = ", ".join(f"{base}{m['id']}-{s}.webp {s}w" for s in sizes)
        else:
            out["src"] = f"{base}{m['id']}{m.get('ext', '')}"
            if m.get("poster"):
                p = m["poster"]
                mid_w = max([s for s in p if s <= 1080] or [p[0]])
                out["poster"] = f"{base}{m['id']}-poster-{mid_w}.webp"
        return out

    def public_entry(e: Dict[str, Any], chapter: str) -> Dict[str, Any]:
        # the stored chapter is the editor's grouping; the page shows the chapter in effect at the date
        out = {"title": e["title"], "body": e["body"], "kind": e["kind"], "date": e["date"],
               "precision": e["precision"], "frame": e["frame"], "chapter": chapter,
               "tags": e["tags"], "media": [public_media(m) for m in e["media"]]}
        if e["src"]:
            out["src"] = e["src"]
        if e["date_end"]:
            out["date_end"] = e["date_end"]
        return out

    def aspect(e: Dict[str, Any]) -> float:
        a = e["frame"].get("a")
        if a:
            return round(float(a), 4)
        m = e["media"][0] if e["media"] else {}
        if m.get("w") and m.get("h"):
            return round(m["w"] / m["h"], 4)
        return {"audio": 4.0, "video": 1.7778, "embed": 1.7778, "module": 1.7778, "page": 1.6}.get(e["kind"], 1.0)

    def write_json(path: Path, data):
        tmp = path.with_name(f".{path.name}.{secrets.token_hex(4)}.tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
        os.replace(tmp, path)

    @router.post("/publish")
    def publish(user=Depends(require_editor)):
        with db() as conn:
            settings = load_settings(conn)
            rows = [row_dict(r) for r in conn.execute(
                "SELECT * FROM timeline WHERE visibility != 'private' ORDER BY date, position, id")]
            undated = [r for r in rows if r["precision"] == "none" or not r["date"]]
            dated = [r for r in rows if r not in undated]
            chapters = [r for r in dated if r["kind"] == "chapter" and r["visibility"] == "public"]
            public = [r for r in dated if r["kind"] != "chapter" and r["visibility"] == "public"]
            unlisted = [r for r in dated if r["kind"] != "chapter" and r["visibility"] == "unlisted"]

            def chapter_of(d: str) -> str:
                slug = ""
                for c in chapters:
                    if c["date"] <= d:
                        slug = c["slug"]
                return slug

            index_rows, years = [], {}
            for e in public:
                index_rows.append([e["slug"], e["date"], e["precision"], e["kind"], aspect(e),
                                   round(float(e["frame"].get("w", 1)), 4), len(e["title"]) + len(e["body"])])
                years.setdefault(e["date"][:4], {})[e["slug"]] = public_entry(e, chapter_of(e["date"]))
            index = {"v": 1, "generated": now(), "settings": settings,
                     "chapters": [{"slug": c["slug"], "title": c["title"], "date": c["date"],
                                   "date_end": c["date_end"] or None, "body": c["body"]} for c in chapters],
                     "entries": index_rows}

            (timeline_dir / "e").mkdir(exist_ok=True)
            for y, ents in years.items():
                write_json(timeline_dir / f"{y}.json", {"year": int(y), "entries": ents})
            for e in unlisted:
                write_json(timeline_dir / "e" / f"{e['slug']}.json", public_entry(e, chapter_of(e["date"])))
            write_json(timeline_dir / "index.json", index)
            # files of years or unlisted entries that are no longer published
            keep = {f"{y}.json" for y in years} | {"index.json"}
            for p in timeline_dir.glob("*.json"):
                if p.name not in keep:
                    p.unlink(missing_ok=True)
            keep_e = {f"{e['slug']}.json" for e in unlisted}
            for p in (timeline_dir / "e").glob("*.json"):
                if p.name not in keep_e:
                    p.unlink(missing_ok=True)
            stamp = now()
            ids = [e["id"] for e in public + unlisted + chapters]
            if ids:
                conn.execute(f"UPDATE timeline SET published_at = ? WHERE published_at = '' AND id IN "
                             f"({','.join('?' * len(ids))})", [stamp, *ids])
        return {"ok": True, "public": len(public), "unlisted": len(unlisted), "chapters": len(chapters),
                "years": len(years), "skipped_undated": len(undated)}

    return router
