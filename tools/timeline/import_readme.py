#!/usr/bin/env python3
"""Seed the timeline with the hidden memoir file (.readme) as PRIVATE drafts.

    python3 tools/timeline/import_readme.py --dry-run            # counts only, sends nothing
    python3 tools/timeline/import_readme.py                      # asks for the dash login, imports to api.3die.fr
    TIMELINE_TOKEN=... python3 tools/timeline/import_readme.py --api http://127.0.0.1:8793

What it does, and nothing more:
  - every "N] Place" header becomes a private chapter; the first is dated 4.12.2003, the rest undated
  - every paragraph becomes a private, undated text entry grouped under the chapter above it,
    in file order; a "> line" becomes the title of the paragraph after it
  - an entry whose text has a capitalised word mid-sentence gets the flag "names-people",
    shown in the editor until cleared
  - re-running is safe: each entry carries a hash of its text and the API skips known hashes

This file is public in the repo, so it holds no memoir text: everything is read at run time and
sent only to the API. Nothing is printed except counts.
"""
import argparse, getpass, hashlib, json, os, re, sys, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HEADER = re.compile(r"^(\d+[a-z]?)\]\s*(.*?)\s*$")
ORIGIN = "2003-12-04"


def norm(text):
    return re.sub(r"\s+", " ", text).strip().lower()


def key(*parts):
    return "readme:" + hashlib.sha1("\x1f".join(parts).encode()).hexdigest()[:16]


def parse(text):
    """-> list of chapters {num, title} and entries {chapter (num or None), title, body}."""
    chapters, entries = [], []
    current, para, title = None, [], ""

    def flush():
        nonlocal para, title
        body = " ".join(l.strip() for l in para if l.strip())
        if body:
            entries.append({"chapter": current, "title": title, "body": body})
            title = ""
        para = []

    for raw in text.splitlines():
        line = raw.rstrip()
        m = HEADER.match(line)
        if m:
            flush()
            current = m.group(1)
            chapters.append({"num": m.group(1), "title": m.group(2) or m.group(1)})
            continue
        if not line.strip():
            flush()
            continue
        if line.lstrip().startswith(">"):
            flush()
            title = line.lstrip()[1:].strip()[:300]
            continue
        # an indented line opens a paragraph only after a finished sentence: some sections
        # indent every wrapped line, so indentation alone would cut sentences apart
        indented = raw.startswith("\t") or raw.startswith(" \t")
        ended = not para or re.search(r"[.!?…)\]\"]\s*$", para[-1])
        if (indented and ended) or line.lstrip().startswith("*"):
            flush()
        para.append(line)
    flush()
    return chapters, entries


def names_people(body, place_words):
    """Capitalised words that do not start a sentence: in this file almost always a person."""
    for m in re.finditer(r"(?<![.!?:\n])\s([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]{2,})", " " + body):
        if m.group(1).lower() not in place_words:
            return True
    return False


class Api:
    def __init__(self, base, token):
        self.base, self.token = base.rstrip("/"), token

    def call(self, method, path, body=None):
        req = urllib.request.Request(self.base + path, method=method,
                                     data=None if body is None else json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json",
                                              **({"Authorization": "Bearer " + self.token} if self.token else {})})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            sys.exit(f"{method} {path}: HTTP {e.code} {e.read()[:200].decode(errors='replace')}")


def login(base):
    user = input("dash username: ").strip()
    pw = getpass.getpass("password: ")
    r = Api(base, None).call("POST", "/auth/login", {"username": user, "password": pw, "scope": "timeline"})
    return r["token"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default=str(ROOT / ".readme"))
    ap.add_argument("--api", default="https://api.3die.fr")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    chapters, entries = parse(Path(a.file).read_text(encoding="utf-8"))
    place_words = {w.lower() for c in chapters for w in re.findall(r"\w+", c["title"])}
    seen, unique = set(), []
    for e in entries:
        k = norm(e["title"] + " " + e["body"])
        if k not in seen:
            seen.add(k); unique.append(e)
    flagged = sum(names_people(e["body"], place_words) for e in unique)
    per_chapter = {}
    for e in unique:
        per_chapter[e["chapter"]] = per_chapter.get(e["chapter"], 0) + 1
    print(f"{len(chapters)} chapters, {len(unique)} paragraphs ({len(entries) - len(unique)} exact repeats skipped), "
          f"{flagged} flagged names-people")
    print("paragraphs per chapter:", ", ".join(f"{k or 'before'}:{v}" for k, v in per_chapter.items()))
    if a.dry_run:
        return

    api = Api(a.api, os.environ.get("TIMELINE_TOKEN") or login(a.api))
    ch_ids, made, existing = {}, 0, 0
    for i, c in enumerate(chapters):
        body = {"kind": "chapter", "title": c["title"], "visibility": "private", "position": i,
                "source": key("chapter", c["num"])}
        if i == 0:
            body.update(date=ORIGIN, precision="day")
        r = api.call("POST", "/timeline/entries", body)
        ch_ids[c["num"]] = r["id"]
        existing += bool(r.get("existing")); made += not r.get("existing")
    for i, e in enumerate(unique):
        r = api.call("POST", "/timeline/entries", {
            "kind": "text", "title": e["title"], "body": e["body"], "visibility": "private",
            "chapter": str(ch_ids.get(e["chapter"], "")), "position": i,
            "flags": ["names-people"] if names_people(e["body"], place_words) else [],
            "tags": ["readme"], "source": key("text", norm(e["title"] + " " + e["body"]))})
        existing += bool(r.get("existing")); made += not r.get("existing")
    print(f"created {made}, already there {existing}; all private, nothing published")


if __name__ == "__main__":
    main()
