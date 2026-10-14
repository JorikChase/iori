#!/usr/bin/env python3
"""Pull iori's public work into the timeline automatically. Safe to re-run: every entry carries a
source key and the API skips keys it already has.

    python3 tools/timeline/import_feeds.py --dry-run --api http://127.0.0.1:8796
    python3 tools/timeline/import_feeds.py                    # production, asks for the dash login
    python3 tools/timeline/import_feeds.py --only soundcloud,youtube

Sources (all public):
  soundcloud  every track in the RSS feed of soundcloud.com/ioriori: title, date, description, artwork
              → an "embed" entry that plays the SoundCloud player in place
  youtube     the "iori iori" channel feed → "embed" entries with the video's thumbnail
  pages       every non-hidden page in pages.meta.json except hubs and internal pages → a "page" entry
              that runs the experiment in place, dated by the commit that first added the file
              (files that arrived with the repository's first commit get the flag approx-date)
  mentions    public records found on the web (2026-10-13) → "mention" entries, PRIVATE until reviewed

Published work arrives as visibility public (it is public already); nothing reaches visitors until
Publish. Use --visibility private to import everything as private instead."""
import argparse, json, os, re, subprocess, sys, xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tlapi import Api, args_api, fetch  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
SC_USER = "207408298"            # soundcloud.com/ioriori
YT_CHANNEL = "UCvbggR31XZKP7mvNikQnMJA"
NS = {"itunes": "http://www.itunes.com/dtds/podcast-1.0.dtd", "a": "http://www.w3.org/2005/Atom",
      "yt": "http://www.youtube.com/xml/schemas/2015", "media": "http://search.yahoo.com/mrss/"}
MENTIONS = [
    {"key": "ares", "date": "2023-09-20", "precision": "day", "title": "Trade licence: information technology",
     "src": "https://rejstrik.penize.cz/ares/19748809-jorik-jonathan-chase", "body": "Registered as a sole trader in Prague (ARES)."},
    {"key": "flashtones", "date": "2023-05-01", "precision": "month", "title": "Full-stack engineer at Flashtones",
     "src": "https://www.linkedin.com/in/jorik-jonathan-chase/", "body": "UX/UI, Elixir backend, a custom CMS."},
    {"key": "github", "date": "2024-03-22", "precision": "day", "title": "github.com/JorikChase/iori",
     "src": "https://github.com/JorikChase/iori", "body": "The repository behind iori.me and 3die.fr."},
    {"key": "avu", "date": "", "precision": "none", "title": "Academy of Fine Arts in Prague, New Media",
     "src": "https://avu.cz/student/chase", "body": "Student in the New Media studio."},
]


def soundcloud(vis):
    rss = ET.fromstring(fetch(f"https://feeds.soundcloud.com/users/soundcloud:users:{SC_USER}/sounds.rss"))
    out = []
    for it in rss.find("channel").findall("item"):
        link = it.findtext("link") or ""
        slug = link.rstrip("/").rsplit("/", 1)[-1]
        when = parsedate_to_datetime(it.findtext("pubDate")).date().isoformat()
        img = it.find("itunes:image", NS)
        art = img.get("href").replace("-t3000x3000", "-t500x500") if img is not None else None
        desc = (it.findtext("itunes:summary", namespaces=NS) or it.findtext("description") or "").strip()
        out.append({"source": f"soundcloud:{slug}", "kind": "embed", "title": it.findtext("title") or slug, "body": desc[:2000],
                    "date": when, "precision": "day", "src": link, "frame": {"w": 0.5, "a": 1}, "visibility": vis,
                    "tags": ["music", "soundcloud"], "_poster": art})
    return out


def youtube(vis):
    feed = ET.fromstring(fetch(f"https://www.youtube.com/feeds/videos.xml?channel_id={YT_CHANNEL}"))
    out = []
    for e in feed.findall("a:entry", NS):
        vid = e.findtext("yt:videoId", namespaces=NS)
        desc = e.find("media:group/media:description", NS)
        out.append({"source": f"youtube:{vid}", "kind": "embed", "title": e.findtext("a:title", namespaces=NS), "body": (desc.text or "").strip()[:2000] if desc is not None else "",
                    "date": e.findtext("a:published", namespaces=NS)[:10], "precision": "day", "src": f"https://www.youtube.com/watch?v={vid}",
                    "frame": {"w": 1, "a": 16 / 9}, "visibility": vis, "tags": ["video", "youtube"],
                    "_poster": [f"https://i.ytimg.com/vi/{vid}/maxresdefault.jpg", f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"]})
    return out


def first_added(path):
    r = subprocess.run(["git", "log", "--diff-filter=A", "--follow", "--format=%ad %H", "--date=short", "--", path],
                       cwd=ROOT, capture_output=True, text=True)
    lines = r.stdout.strip().splitlines()
    return lines[-1].split() if lines else (None, None)


def pages(vis):
    reg = json.loads((ROOT / "pages.meta.json").read_text())["pages"]
    root_commit = subprocess.run(["git", "rev-list", "--max-parents=0", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.split()
    landing = {"iori_INDEX.html": "https://iori.me/", "index.html": "https://3die.fr/"}
    out = []
    for slug, p in reg.items():
        if p.get("hidden") or p.get("category") in ("hub", "internal", "TODO") or slug in ("404.html",):
            continue
        date, commit = first_added(slug)
        if not date:
            continue
        url = landing.get(slug) or f"https://{p['domain']}/{slug[:-len('index.html')] if slug.endswith('/index.html') else slug}"
        out.append({"source": f"page:{slug}", "kind": "page", "title": p["title"], "body": p.get("description", ""),
                    "date": date, "precision": "day", "src": url, "frame": {"w": 0.5, "a": 1.6}, "visibility": vis,
                    "tags": [p["domain"], p.get("category", "")], "flags": ["approx-date"] if commit in root_commit else []})
    return out


def mentions():
    return [{"source": f"mention:{m['key']}", "kind": "mention", "title": m["title"], "body": m["body"], "date": m["date"],
             "precision": m["precision"], "src": m["src"], "frame": {"w": 1}, "visibility": "private", "tags": ["mention"]} for m in MENTIONS]


def poster(api, entry_id, urls):
    for u in ([urls] if isinstance(urls, str) else urls or []):
        try:
            data = fetch(u, limit=8 * 1024 * 1024)
        except Exception:
            continue
        if len(data) < 2000:          # YouTube answers a missing maxres with a tiny grey placeholder
            continue
        api.upload(f"/timeline/entries/{entry_id}/media", u.rsplit("/", 1)[-1].split("?")[0] or "poster.jpg", data)
        return True
    return False


def main():
    ap = argparse.ArgumentParser()
    args_api(ap)
    ap.add_argument("--only", default="soundcloud,youtube,pages,mentions")
    ap.add_argument("--visibility", default="public", choices=["public", "unlisted", "private"])
    a = ap.parse_args()
    want = set(a.only.split(","))
    items = []
    if "soundcloud" in want: items += soundcloud(a.visibility)
    if "youtube" in want: items += youtube(a.visibility)
    if "pages" in want: items += pages(a.visibility)
    if "mentions" in want: items += mentions()
    counts = {}
    for it in items:
        counts[it["source"].split(":")[0]] = counts.get(it["source"].split(":")[0], 0) + 1
    print("found:", ", ".join(f"{k} {v}" for k, v in counts.items()))
    if a.dry_run:
        for it in items[:6]:
            print("  ", it["date"], it["kind"], it["title"][:60])
        return
    api = Api(a.api)
    have = {e["source"]: e for e in api.entries()}
    made = skipped = posters = 0
    for it in items:
        if it["source"] in have:
            skipped += 1
            continue
        body = {k: v for k, v in it.items() if not k.startswith("_")}
        e = api.create(body)
        made += 1
        if it.get("_poster") and not e.get("media"):
            posters += poster(api, e["id"], it["_poster"])
    print(f"created {made} (with {posters} posters), already there {skipped}")


if __name__ == "__main__":
    main()
