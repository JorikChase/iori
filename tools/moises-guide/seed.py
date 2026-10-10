#!/usr/bin/env python3
"""Move moises' sample posts from a local test API into the live one.

The samples are made locally through the real dashboard (tools/moises-guide/
shoot.js), so they are already resized and arranged exactly as the guide's
screenshots show them. This copies those rows + media files across.

  local:   python3 tools/moises-guide/seed.py export <local.db> <local media dir> <bundle dir>
  server:  python3 seed.py import <bundle dir> /var/lib/iori-api/iori.db /var/www/media

import is idempotent: a sample whose caption moises already has is skipped.
Run it as root after the API has started once on the new code (the `embed`
column is added by the API's own migration); it chowns media to ioriapi.
"""
import json
import os
import shutil
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

AUTHOR = "moises"


def export(db, media, out):
    out = Path(out)
    (out / "media").mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM posts WHERE author = ? ORDER BY id", (AUTHOR,)).fetchall()
    posts = []
    for r in rows:
        names = json.loads(r["media"])
        for n in names:
            shutil.copy2(Path(media) / n, out / "media" / n)
        posts.append({"caption": r["caption"], "media": names, "layout": json.loads(r["layout"]) if r["layout"] else None,
                      "embed": r["embed"]})
    (out / "posts.json").write_text(json.dumps(posts, ensure_ascii=False, indent=1))
    print(f"exported {len(posts)} posts to {out}")


def import_(bundle, db, media):
    bundle = Path(bundle)
    posts = json.loads((bundle / "posts.json").read_text())
    conn = sqlite3.connect(db)
    cols = [r[1] for r in conn.execute("PRAGMA table_info(posts)")]
    if "embed" not in cols:
        sys.exit("posts.embed is missing: deploy the new API and let it start once first")
    have = {r[0] for r in conn.execute("SELECT caption FROM posts WHERE author = ?", (AUTHOR,))}
    added = 0
    for p in posts:
        if p["caption"] in have:
            print("skip (exists):", p["caption"][:50])
            continue
        names = []
        for n in p["media"]:
            new = uuid.uuid4().hex + Path(n).suffix.lower()
            dst = Path(media) / new
            shutil.copy2(bundle / "media" / n, dst)
            try:
                shutil.chown(dst, "ioriapi", "ioriapi")
            except (LookupError, PermissionError):
                pass
            os.chmod(dst, 0o644)
            names.append(new)
        conn.execute(
            "INSERT INTO posts(author, caption, media, layout, embed, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (AUTHOR, p["caption"], json.dumps(names), json.dumps(p["layout"]) if p["layout"] else None,
             p["embed"], datetime.now(timezone.utc).isoformat()),
        )
        added += 1
        print("added:", p["caption"][:50])
    conn.commit()
    print(f"{added} added, {len(posts) - added} skipped")


if __name__ == "__main__":
    if len(sys.argv) != 5 or sys.argv[1] not in ("export", "import"):
        sys.exit(__doc__)
    (export if sys.argv[1] == "export" else import_)(*sys.argv[2:])
