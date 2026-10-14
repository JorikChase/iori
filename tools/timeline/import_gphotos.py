#!/usr/bin/env python3
"""Load a Google Photos album into the timeline, each photo or video on its own date.

    python3 tools/timeline/import_gphotos.py "https://photos.app.goo.gl/XXXX" --dry-run
    python3 tools/timeline/import_gphotos.py "https://photos.app.goo.gl/XXXX" --api http://127.0.0.1:8796
    python3 tools/timeline/import_gphotos.py "https://photos.app.goo.gl/XXXX"          # production

The album must be shared by link (Google Photos → the album → Share → Create link). Google closed its
library API to outside apps in 2025, so this reads the shared album's page the way a browser does:
not an official interface, and it may need adjusting if Google changes the page.

HEIC originals (iPhone) are converted to JPEG with macOS sips, which keeps the camera time.
Dates, per item: the original file is downloaded (=d / =dv), so the API dates it by the camera's own
EXIF time; when a file has none (screenshots, edited exports, videos) Google's capture time from the
album page is sent as the date hint. Each item becomes its own entry (photos share rows on busy days),
private by default (--visibility to change), tagged "google-photos" and the album's name. Videos get a
poster frame and their size and length locally via ffmpeg. Safe to re-run: the item id is the source."""
import argparse, datetime, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tlapi import Api, args_api, fetch  # noqa: E402
from import_instagram import video_meta, upload  # noqa: E402

VIDEO_KEY = "76647426"          # the metadata block Google attaches to video items on shared album pages


def blocks(html):
    """every AF_initDataCallback data payload on the page, parsed"""
    out = []
    for m in re.finditer(r"AF_initDataCallback\(\{key:\s*'(ds:\d+)'.*?data:(.*?), sideChannel:", html, re.S):
        try:
            out.append((m.group(1), json.loads(m.group(2))))
        except json.JSONDecodeError:
            pass
    return out


def walk(x):
    if isinstance(x, list):
        yield x
        for y in x:
            yield from walk(y)
    elif isinstance(x, dict):
        for y in x.values():
            yield from walk(y)


def items_of(data):
    """media items: [id, [url, w, h, ...], timestamp_ms, ...] wherever they sit in the payload"""
    seen, out = set(), []
    for x in walk(data):
        if (len(x) >= 3 and isinstance(x[0], str) and isinstance(x[1], list) and len(x[1]) >= 3
                and isinstance(x[1][0], str) and "googleusercontent.com" in x[1][0]
                and isinstance(x[2], int) and x[2] > 10 ** 11 and x[0] not in seen):
            seen.add(x[0])
            out.append({"id": x[0], "url": x[1][0], "w": x[1][1], "h": x[1][2], "ts": x[2] / 1000,
                        "video": VIDEO_KEY in json.dumps(x, separators=(",", ":"))})
    return out


def is_heif(data):
    return data[4:8] == b"ftyp" and data[8:12] in (b"heic", b"heix", b"hevc", b"heim", b"heis", b"mif1", b"msf1")


def heif_to_jpeg(data):
    """iPhone originals are HEIC, which browsers other than Safari cannot show: convert with macOS's
    sips (keeps the EXIF camera time); None when sips is not there."""
    import shutil, subprocess, tempfile
    if not shutil.which("sips"):
        return None
    with tempfile.TemporaryDirectory() as td:
        src, dst = os.path.join(td, "in.heic"), os.path.join(td, "out.jpg")
        with open(src, "wb") as f:
            f.write(data)
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "92", src, "--out", dst], capture_output=True)
        return open(dst, "rb").read() if os.path.exists(dst) else None


def album_title(html):
    m = re.search(r'<meta property="og:title" content="([^"]*)"', html)
    t = (m.group(1) if m else "").split(" · ")[0].strip()
    return re.sub(r"\s*-\s*Google Photos$", "", t) or "album"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("link", help="the album's share link")
    args_api(ap)
    ap.add_argument("--visibility", default="private", choices=["public", "unlisted", "private"])
    ap.add_argument("--width", type=int, default=0, help="download at this width instead of the original (photos only)")
    a = ap.parse_args()

    html = fetch(a.link, limit=40 * 1024 * 1024).decode("utf-8", "replace")
    title = album_title(html)
    items = []
    for key, data in blocks(html):
        got = items_of(data)
        if len(got) > len(items):
            items = got
    if not items:
        sys.exit("no photos found on that page: is the album shared by link, and is the link complete?")
    days = sorted(datetime.datetime.fromtimestamp(i["ts"]).date().isoformat() for i in items)
    vids = sum(i["video"] for i in items)
    print(f"“{title}”: {len(items)} items ({vids} videos), {days[0]} – {days[-1]}, {len(set(days))} different days")
    if len(items) in (300, 500):
        print("  note: Google pages large albums; only the first page was read")
    if a.dry_run:
        return

    api = Api(a.api)
    have = {e["source"] for e in api.entries()}
    tag = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:40]
    made = 0
    for it in sorted(items, key=lambda i: i["ts"]):
        src = f"gphotos:{it['id']}"
        if src in have:
            continue
        day = datetime.datetime.fromtimestamp(it["ts"]).date().isoformat()
        fields = {"date_hint": day}
        if it["video"]:
            data = fetch(it["url"] + "=dv", limit=300 * 1024 * 1024)
            tmp = os.path.join(os.path.dirname(os.path.abspath(__file__)), "local", f".gp-{it['id'][:12]}.mp4")
            os.makedirs(os.path.dirname(tmp), exist_ok=True)
            with open(tmp, "wb") as f:
                f.write(data)
            try:
                poster, meta = video_meta(tmp)
                fields.update({k: str(v) for k, v in meta.items()})
                from pathlib import Path
                e = upload(api, Path(tmp), fields, "video/mp4", poster)
            finally:
                os.remove(tmp)
        else:
            suffix = f"=w{a.width}" if a.width else "=d"
            data = fetch(it["url"] + suffix, limit=80 * 1024 * 1024)
            if is_heif(data):
                data = heif_to_jpeg(data) or fetch(f"{it['url']}=w{it['w']}-h{it['h']}", limit=80 * 1024 * 1024)
            ctype = "image/png" if data[:8] == b"\x89PNG\r\n\x1a\n" else "image/gif" if data[:4] == b"GIF8" else "image/jpeg"
            e = api.upload("/timeline/upload", f"{it['id'][:16]}.{ctype.split('/')[1]}", data, ctype, fields)
        # the API dated it by EXIF when the file has it; otherwise by the hint (Google's capture time)
        api.patch(e["id"], {"source": src, "tags": ["google-photos", tag], "visibility": a.visibility,
                            "frame": {"w": 0.5 if not it["video"] else 1}})
        made += 1
        if made % 10 == 0:
            print(f"  {made} …")
    print(f"created {made} entries, already there {len(items) - made}")


if __name__ == "__main__":
    main()
