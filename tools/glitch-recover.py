#!/usr/bin/env python3
"""Recover a dead Glitch project's uploaded files from the Wayback Machine.

Glitch shut down (hosting July 2025, downloads December 2025). ArchiveTeam's July 2025
rescue saved every public project's metadata and many uploaded assets (images, video,
fonts) on cdn.glitch.global. The live *.glitch.me pages and the code were mostly not
saved. Given a project name (the part before .glitch.me) this script:

  1. reads the archived metadata to get the project id (and prints owner + dates),
  2. lists every archived asset under cdn.glitch.global/<id>/,
  3. downloads the newest capture of each into the output folder.

Usage:
  python3 tools/glitch-recover.py <project-name> [out-dir] [--list]

Example:
  python3 tools/glitch-recover.py kucharkybezdomova /tmp/kucharky --list

The Wayback API rate-limits hard (HTTP 429 / "Temporarily Offline"); the script waits
and retries, so a large project can take a few minutes. Stdlib only.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

UA = {"User-Agent": "iori-glitch-recover/1.0 (personal archive recovery)"}


def get(url, tries=6, timeout=120):
    delay = 6
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read()
            if b"Temporarily Offline" in body[:600] or b"Too Many Requests" in body[:600]:
                raise IOError("archive busy")
            return body
        except Exception as e:  # noqa: BLE001 — retry anything transient
            if i == tries - 1:
                raise
            print(f"   … {e}; retrying in {delay}s", file=sys.stderr)
            time.sleep(delay)
            delay = min(delay * 2, 90)


def cdx(**params):
    q = urllib.parse.urlencode({"output": "json", **params})
    rows = json.loads(get("https://web.archive.org/cdx/search/cdx?" + q) or b"[]")
    if not rows:
        return []
    head, *rest = rows
    return [dict(zip(head, r)) for r in rest]


def project_meta(name):
    url = f"api.glitch.com/v1/projects/by/domain?domain={name}"
    caps = [c for c in cdx(url=url, fl="timestamp,statuscode") if c["statuscode"] == "200"]
    if not caps:
        return None
    ts = caps[-1]["timestamp"]
    body = get(f"https://web.archive.org/web/{ts}id_/https://{url}")
    d = json.loads(body)
    return d.get(name) or d


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__)
        sys.exit(1)
    name = args[0].replace(".glitch.me", "").strip("/").split("/")[-1]
    out = args[1] if len(args) > 1 else os.path.join("glitch-recovered", name)
    list_only = "--list" in sys.argv

    meta = project_meta(name)
    if not meta:
        print(f"no archived metadata for '{name}' — check the spelling (the part before .glitch.me)")
        sys.exit(2)
    pid = meta["id"]
    print(f"{name}: id {pid}, created {meta.get('createdAt', '?')[:10]}, updated {meta.get('updatedAt', '?')[:10]}")

    time.sleep(3)
    caps = cdx(url=f"cdn.glitch.global/{pid}/", matchType="prefix",
               fl="timestamp,original,statuscode,mimetype,length", filter="statuscode:200")
    newest = {}
    for c in caps:
        path = urllib.parse.urlsplit(c["original"]).path      # drop ?v= cache busters
        if path not in newest or c["timestamp"] > newest[path]["timestamp"]:
            newest[path] = c
    print(f"{len(newest)} archived asset(s)")
    for path, c in sorted(newest.items()):
        print(f"  {c['timestamp'][:8]}  {c['mimetype']:<24} {int(c['length'] or 0) // 1024:>6} KB  {urllib.parse.unquote(path.split('/')[-1])}")
    if list_only or not newest:
        return

    os.makedirs(out, exist_ok=True)
    for path, c in sorted(newest.items()):
        fname = urllib.parse.unquote(path.split("/")[-1]) or "index"
        dest = os.path.join(out, fname)
        if os.path.exists(dest):
            continue
        time.sleep(2)
        try:
            data = get(f"https://web.archive.org/web/{c['timestamp']}id_/{c['original']}")
        except Exception as e:  # noqa: BLE001
            print(f"  ! {fname}: {e}")
            continue
        with open(dest, "wb") as f:
            f.write(data)
        print(f"  saved {dest} ({len(data) // 1024} KB)")


if __name__ == "__main__":
    main()
