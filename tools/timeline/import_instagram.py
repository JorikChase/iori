#!/usr/bin/env python3
"""Put Instagram posts on the timeline, from Instagram's own data export.

Get the export (only the account owner can):
  Instagram → Settings → Accounts Center → Your information and permissions → Download your information
  → Download or transfer information → (your account) → Some of your information → Content
  (Posts, Reels; Stories if you want them) → Download to device → Format JSON, Media quality High.
Unzip it into tools/timeline/local/instagram/ (gitignored), then:

    python3 tools/timeline/import_instagram.py --dry-run
    python3 tools/timeline/import_instagram.py --api http://127.0.0.1:8796      # local
    python3 tools/timeline/import_instagram.py                                   # production

Each photo or video becomes an entry on the day it was posted (a carousel becomes a row of entries on
that day), the caption is the text, the tag is "instagram". Videos get a poster frame made locally
with ffmpeg when it is installed. Safe to re-run: entries carry the post's timestamp as their source.
Posts arrive as public (they are public on Instagram already) unless --visibility private; stories are
skipped unless --stories."""
import argparse, datetime, json, os, shutil, subprocess, sys, tempfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tlapi import Api, args_api  # noqa: E402

DEFAULT = Path(__file__).resolve().parent / "local" / "instagram"


def fix(s):
    """Meta's exports write UTF-8 bytes as Latin-1 escapes: 'Å¾' instead of 'ž'."""
    if not s:
        return ""
    try:
        return s.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def posts(root, stories):
    """-> list of {ts, caption, files:[Path], kind} from every known layout of the export"""
    out = []

    def media_list(m):
        return m.get("media") if isinstance(m.get("media"), list) else [m]

    for f in sorted(root.rglob("posts_*.json")):
        for p in json.loads(f.read_text()):
            items = media_list(p)
            ts = p.get("creation_timestamp") or (items[0].get("creation_timestamp") if items else None)
            cap = fix(p.get("title") or (items[0].get("title") if items else ""))
            out.append({"ts": ts, "caption": cap, "uris": [i.get("uri") for i in items if i.get("uri")], "kind": "post"})
    for f in sorted(root.rglob("reels.json")):
        for p in json.loads(f.read_text()).get("ig_reels_media", []):
            items = media_list(p)
            ts = items[0].get("creation_timestamp") if items else None
            out.append({"ts": ts, "caption": fix(items[0].get("title", "")) if items else "", "uris": [i.get("uri") for i in items if i.get("uri")], "kind": "reel"})
    if stories:
        for f in sorted(root.rglob("stories.json")):
            for s in json.loads(f.read_text()).get("ig_stories", []):
                out.append({"ts": s.get("creation_timestamp"), "caption": fix(s.get("title", "")), "uris": [s.get("uri")], "kind": "story"})
    for p in out:
        p["files"] = [resolve(root, u) for u in p.pop("uris")]
        p["files"] = [x for x in p["files"] if x]
    return [p for p in out if p["ts"] and p["files"]]


def resolve(root, uri):
    for base in [root, *root.parents][:3]:
        q = base / uri
        if q.exists():
            return q
    hits = list(root.rglob(Path(uri).name))
    return hits[0] if hits else None


def video_meta(path):
    """poster JPEG bytes + w, h, dur via ffmpeg/ffprobe, or Nones"""
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        return None, {}
    pr = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration",
                         "-of", "json", str(path)], capture_output=True, text=True)
    meta = {}
    try:
        j = json.loads(pr.stdout)
        s = j["streams"][0]; meta = {"w": s["width"], "h": s["height"], "dur": round(float(j["format"]["duration"]), 2)}
    except Exception:
        pass
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / "poster.jpg"
        subprocess.run(["ffmpeg", "-v", "error", "-ss", "0.5", "-i", str(path), "-frames:v", "1", "-q:v", "3", str(out)], capture_output=True)
        return (out.read_bytes() if out.exists() else None), meta


def main():
    ap = argparse.ArgumentParser()
    args_api(ap)
    ap.add_argument("--export", default=str(DEFAULT))
    ap.add_argument("--stories", action="store_true")
    ap.add_argument("--visibility", default="public", choices=["public", "unlisted", "private"])
    a = ap.parse_args()
    root = Path(a.export)
    if not root.exists():
        sys.exit(f"no export at {root}: download it from Instagram (see the top of this file) and unzip it there")
    ps = posts(root, a.stories)
    nfiles = sum(len(p["files"]) for p in ps)
    kinds = {}
    for p in ps:
        kinds[p["kind"]] = kinds.get(p["kind"], 0) + 1
    span = sorted(datetime.date.fromtimestamp(p["ts"]).isoformat() for p in ps)
    print(f"{len(ps)} posts ({', '.join(f'{k} {v}' for k, v in kinds.items())}), {nfiles} files" + (f", {span[0]} – {span[-1]}" if span else ""))
    if a.dry_run or not ps:
        return
    api = Api(a.api)
    have = {e["source"] for e in api.entries()}
    made = 0
    for p in sorted(ps, key=lambda p: p["ts"]):
        day = datetime.date.fromtimestamp(p["ts"]).isoformat()
        for i, f in enumerate(p["files"]):
            src = f"instagram:{p['kind']}:{p['ts']}:{i}"
            if src in have:
                continue
            fields = {"date_hint": day}
            ctype = None
            extra = {}
            if f.suffix.lower() in (".mp4", ".mov", ".m4v"):
                poster, meta = video_meta(f)
                fields.update({k: str(v) for k, v in meta.items()})
                ctype = "video/mp4"
                extra["poster"] = poster
            e = upload(api, f, fields, ctype, extra.get("poster"))
            first = i == 0
            cap = p["caption"]
            api.patch(e["id"], {"source": src, "tags": ["instagram", p["kind"]], "visibility": a.visibility,
                                "date": day, "precision": "day", "position": i,
                                "title": (cap.split("\n")[0][:120] if first else ""), "body": (cap if first and "\n" in cap else ""),
                                "frame": {"w": 0.5 if len(p["files"]) > 1 or f.suffix.lower() not in (".mp4", ".mov") else 1}})
            made += 1
    print(f"created {made} entries")


def upload(api, path, fields, ctype, poster):
    if not poster:
        return api.upload("/timeline/upload", path.name, path.read_bytes(), ctype, fields)
    # the upload endpoint takes an optional poster part next to the file
    import io, uuid
    b = uuid.uuid4().hex
    out = io.BytesIO()
    for k, v in fields.items():
        out.write(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    out.write(f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{path.name}"\r\nContent-Type: {ctype}\r\n\r\n'.encode())
    out.write(path.read_bytes()); out.write(b"\r\n")
    out.write(f'--{b}\r\nContent-Disposition: form-data; name="poster"; filename="poster.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'.encode())
    out.write(poster); out.write(f"\r\n--{b}--\r\n".encode())
    return api.call("POST", "/timeline/upload", data=out.getvalue(), ctype=f"multipart/form-data; boundary={b}")


if __name__ == "__main__":
    main()
