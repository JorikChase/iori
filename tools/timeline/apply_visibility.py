#!/usr/bin/env python3
"""Publish everything except the most intimate: set visibility from tools/timeline/privacy.json.

    python3 tools/timeline/apply_visibility.py --dry-run --api http://127.0.0.1:8796
    python3 tools/timeline/apply_visibility.py                      # production, asks for the dash login

Memoir entries (source readme:…) listed in privacy.json stay private, the rest become public; the Google
Photos album and the public records become public. Entries iori already changed by hand keep their
setting unless --all. Undated entries stay out of the published site anyway. Then press Publish."""
import argparse, json, os, sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tlapi import Api, args_api  # noqa: E402

HERE = Path(__file__).resolve().parent


def main():
    ap = argparse.ArgumentParser()
    args_api(ap)
    ap.add_argument("--all", action="store_true", help="also reset entries whose visibility was changed by hand")
    a = ap.parse_args()
    private = set(json.loads((HERE / "privacy.json").read_text())["private"])
    api = Api(a.api)
    plan = []
    for e in api.entries():
        src = e["source"]
        if src.startswith("readme:"):
            want = "private" if src in private else "public"
        elif src.startswith(("gphotos:", "mention:")):
            want = "public"
        else:
            continue
        # imports arrive private; anything else was set by hand
        if e["visibility"] != want and (a.all or e["visibility"] == "private" or want == "private"):
            plan.append((e, want))
    counts = {}
    for e, want in plan:
        k = f"{e['source'].split(':')[0]} → {want}"
        counts[k] = counts.get(k, 0) + 1
    print("changes:", ", ".join(f"{k} {v}" for k, v in counts.items()) or "none")
    if a.dry_run:
        return
    for e, want in plan:
        api.patch(e["id"], {"visibility": want})
    print(f"applied {len(plan)}; press Publish (or POST /timeline/publish) to update the site")


if __name__ == "__main__":
    main()
