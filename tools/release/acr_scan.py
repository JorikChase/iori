#!/usr/bin/env python3
"""acr_scan.py — find which recordings a track matches BEFORE a distributor does.

SoundCloud's distribution review runs a content-recognition pass and only says
"your release matched existing audio", never which track or which sample. This
tool asks ACRCloud the same question for every track in a release and names the
match: title, artist, label, ISRC, and where in your track it occurs.

Two engines, same report format:

  identify   ACRCloud Identification API. The track is sliced into overlapping
             windows (default 12 s every 10 s), each window is identified, and
             the hits are merged per recording. Needs an "Audio & Video
             Recognition" project (host + access key + secret). Cheapest, works
             on the free trial, no container needed.

  fs         ACRCloud File Scanning. Whole files are uploaded to a scanning
             container and the results are polled. Built for derivative-work
             detection (pitch- and tempo-shifted loops), so it catches what the
             window scan can miss. Needs a Console API bearer token and a
             container id.

Credentials live in tools/release/.acr.env (gitignored), KEY=VALUE per line:

  ACR_HOST=identify-eu-west-1.acrcloud.com
  ACR_ACCESS_KEY=...
  ACR_ACCESS_SECRET=...
  ACR_CONSOLE_TOKEN=...        # fs only
  ACR_CONTAINER_ID=...         # fs only
  ACR_API_BASE=https://api-eu-west-1.acrcloud.com   # fs only, optional

Usage:
  python3 tools/release/acr_scan.py identify ~/Desktop/sound/darkwood/mp3/*.mp3 --name darkwood
  python3 tools/release/acr_scan.py identify @tools/release/sets/darkwood.txt --name darkwood   # @file = list of paths
  python3 tools/release/acr_scan.py identify FILES... --dry-run      # slice + count requests, no network
  python3 tools/release/acr_scan.py fs upload FILES... --name darkwood
  python3 tools/release/acr_scan.py fs results --name darkwood

Reports land in tools/release/reports/<name>-<engine>-<date>.json and .md.
Only the stdlib + ffmpeg/ffprobe are required.
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import hashlib
import hmac
import json
import mimetypes
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
ENV_FILE = HERE / ".acr.env"
REPORTS = HERE / "reports"
SELF_ARTISTS = {"iori"}  # matches against our own catalogue are reported, not counted as foreign


# ----------------------------------------------------------------------------- config

def load_env() -> dict:
    env = dict(os.environ)
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    return env


def need(env: dict, *keys: str) -> None:
    missing = [k for k in keys if not env.get(k)]
    if missing:
        sys.exit(
            f"missing {', '.join(missing)} — put them in {ENV_FILE.relative_to(HERE.parent.parent)} "
            "(see the docstring at the top of acr_scan.py)"
        )


# ----------------------------------------------------------------------------- audio

def ffprobe_duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return float(out)


def slice_window(path: Path, start: float, length: float, out: Path) -> None:
    """Mono 8 kHz WAV: ~16 KB/s, well under ACRCloud's 5 MB sample cap, plenty for fingerprinting."""
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.3f}", "-t", f"{length:.3f}", "-i", str(path),
         "-ac", "1", "-ar", "8000", "-f", "wav", str(out)],
        check=True,
    )


def windows(duration: float, length: float, hop: float) -> list[float]:
    starts, t = [], 0.0
    while t < duration - 1.0:
        starts.append(round(t, 3))
        t += hop
    if not starts:
        starts = [0.0]
    return starts


# ----------------------------------------------------------------------------- http

def multipart(fields: dict, files: dict) -> tuple[bytes, str]:
    boundary = "----acrscan" + uuid.uuid4().hex
    body = bytearray()
    for k, v in fields.items():
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
    for k, (fname, data) in files.items():
        ctype = mimetypes.guess_type(fname)[0] or "application/octet-stream"
        body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"; filename=\"{fname}\"\r\n"
                 f"Content-Type: {ctype}\r\n\r\n").encode()
        body += data + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    return bytes(body), f"multipart/form-data; boundary={boundary}"


def post(url: str, body: bytes, ctype: str, headers: dict | None = None, retries: int = 3) -> dict:
    hdrs = {"Content-Type": ctype, **(headers or {})}
    for attempt in range(retries):
        req = urllib.request.Request(url, data=body, headers=hdrs, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            txt = e.read().decode(errors="replace")
            if e.code in (429, 500, 502, 503) and attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
                continue
            raise SystemExit(f"HTTP {e.code} from {url}: {txt[:400]}")
        except urllib.error.URLError as e:
            if attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
                continue
            raise SystemExit(f"network error talking to {url}: {e}")
    raise SystemExit("unreachable")


def get(url: str, headers: dict) -> dict:
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code} from {url}: {e.read().decode(errors='replace')[:400]}")


# ----------------------------------------------------------------------------- identify engine

def acr_identify(env: dict, sample: bytes) -> dict:
    host, key, secret = env["ACR_HOST"], env["ACR_ACCESS_KEY"], env["ACR_ACCESS_SECRET"]
    ts = str(int(time.time()))
    to_sign = "\n".join(["POST", "/v1/identify", key, "audio", "1", ts])
    sig = base64.b64encode(hmac.new(secret.encode(), to_sign.encode(), hashlib.sha1).digest()).decode()
    fields = {
        "access_key": key, "data_type": "audio", "signature_version": "1",
        "signature": sig, "sample_bytes": str(len(sample)), "timestamp": ts,
    }
    body, ctype = multipart(fields, {"sample": ("sample.wav", sample)})
    return post(f"https://{host}/v1/identify", body, ctype)


def fmt_t(sec: float) -> str:
    sec = int(round(sec))
    return f"{sec // 60}:{sec % 60:02d}"


def run_identify(args: argparse.Namespace) -> None:
    env = load_env()
    if not args.dry_run:
        need(env, "ACR_HOST", "ACR_ACCESS_KEY", "ACR_ACCESS_SECRET")
    files = [Path(f).expanduser() for f in args.files]
    report = {"name": args.name, "engine": "identify", "when": dt.datetime.now().isoformat(timespec="seconds"),
              "window_s": args.window, "hop_s": args.hop, "min_score": args.min_score, "tracks": []}
    total_requests = 0
    with tempfile.TemporaryDirectory() as td:
        for path in files:
            dur = ffprobe_duration(path)
            starts = windows(dur, args.window, args.hop)
            total_requests += len(starts)
            track = {"file": str(path), "track": path.stem, "duration_s": round(dur, 1),
                     "windows": len(starts), "matches": {}, "errors": []}
            print(f"\n{path.name}  {fmt_t(dur)}  {len(starts)} windows", flush=True)
            if args.dry_run:
                report["tracks"].append(track)
                continue
            for i, s in enumerate(starts):
                wav = Path(td) / f"w{i}.wav"
                slice_window(path, s, args.window, wav)
                res = acr_identify(env, wav.read_bytes())
                code = res.get("status", {}).get("code")
                if code == 1001:            # no result
                    print(".", end="", flush=True)
                    continue
                if code != 0:
                    track["errors"].append({"at_s": s, "status": res.get("status")})
                    print("!", end="", flush=True)
                    if code in (3001, 3003, 3014, 3015):   # bad key / quota / limits: stop early, say why
                        print(f"\n  ACRCloud says: {res.get('status')}")
                        break
                    continue
                hits = res.get("metadata", {}).get("music", []) + res.get("metadata", {}).get("humming", [])
                for m in hits:
                    score = int(m.get("score", 0))
                    if score < args.min_score:
                        continue
                    artists = ", ".join(a.get("name", "") for a in m.get("artists", [])) or "?"
                    key = f"{m.get('title','?')} — {artists}"
                    e = track["matches"].setdefault(key, {
                        "title": m.get("title"), "artists": artists,
                        "album": (m.get("album") or {}).get("name"),
                        "label": m.get("label"), "release_date": m.get("release_date"),
                        "isrc": (m.get("external_ids") or {}).get("isrc"),
                        "acrid": m.get("acrid"),
                        "self": any(a.get("name", "").strip().lower() in SELF_ARTISTS for a in m.get("artists", [])),
                        "best_score": 0, "windows": [],
                    })
                    e["best_score"] = max(e["best_score"], score)
                    e["windows"].append({"at_s": s, "score": score,
                                         "match_offset_ms": m.get("play_offset_ms")})
                print("x" if hits else ".", end="", flush=True)
                time.sleep(args.pause)
            report["tracks"].append(track)
    report["requests"] = total_requests
    write_report(report, dry=args.dry_run)


# ----------------------------------------------------------------------------- file scanning engine

def fs_headers(env: dict) -> dict:
    return {"Authorization": f"Bearer {env['ACR_CONSOLE_TOKEN']}", "Accept": "application/json"}


def fs_base(env: dict) -> str:
    return env.get("ACR_API_BASE", "https://api-v2.acrcloud.com").rstrip("/") + f"/api/fs-containers/{env['ACR_CONTAINER_ID']}/files"


def run_fs_upload(args: argparse.Namespace) -> None:
    env = load_env()
    need(env, "ACR_CONSOLE_TOKEN", "ACR_CONTAINER_ID")
    state_file = REPORTS / f"{args.name}-fs-uploads.json"
    state = json.loads(state_file.read_text()) if state_file.exists() else {}
    for f in args.files:
        path = Path(f).expanduser()
        if str(path) in state:
            print(f"already uploaded: {path.name} → {state[str(path)]}")
            continue
        body, ctype = multipart({"data_type": "audio", "name": f"{args.name}/{path.stem}"},
                                {"file": (path.name, path.read_bytes())})
        res = post(fs_base(env), body, ctype, headers=fs_headers(env))
        fid = (res.get("data") or res).get("id")
        state[str(path)] = fid
        print(f"uploaded {path.name} → file id {fid}")
        state_file.write_text(json.dumps(state, indent=2))
    print(f"\nfile ids saved to {state_file}. Run:  acr_scan.py fs results --name {args.name}")


def run_fs_results(args: argparse.Namespace) -> None:
    env = load_env()
    need(env, "ACR_CONSOLE_TOKEN", "ACR_CONTAINER_ID")
    state_file = REPORTS / f"{args.name}-fs-uploads.json"
    if not state_file.exists():
        sys.exit(f"no uploads recorded for {args.name}; run `fs upload` first")
    state = json.loads(state_file.read_text())
    report = {"name": args.name, "engine": "fs", "when": dt.datetime.now().isoformat(timespec="seconds"),
              "min_score": args.min_score, "tracks": []}
    for path_s, fid in state.items():
        path = Path(path_s)
        for _ in range(args.max_polls):
            res = get(f"{fs_base(env)}/{fid}?with_result=1", fs_headers(env))
            data = res.get("data") or res
            st = data.get("state")
            if st in (1, -1, -2, -3):
                break
            print(f"{path.name}: still scanning (state {st})…", flush=True)
            time.sleep(args.poll_s)
        track = {"file": path_s, "track": path.stem, "state": st, "matches": {}, "errors": []}
        results = (data.get("results") or {})
        for m in results.get("music", []) or []:
            r = m.get("result") or m
            score = int(r.get("score", 0))
            if score < args.min_score:
                continue
            artists = ", ".join(a.get("name", "") for a in r.get("artists", [])) or "?"
            key = f"{r.get('title','?')} — {artists}"
            e = track["matches"].setdefault(key, {
                "title": r.get("title"), "artists": artists,
                "album": (r.get("album") or {}).get("name"),
                "label": r.get("label"), "release_date": r.get("release_date"),
                "isrc": (r.get("external_ids") or {}).get("isrc"), "acrid": r.get("acrid"),
                "self": any(a.get("name", "").strip().lower() in SELF_ARTISTS for a in r.get("artists", [])),
                "best_score": 0, "windows": [],
            })
            e["best_score"] = max(e["best_score"], score)
            e["windows"].append({"at_s": m.get("offset", r.get("offset")), "score": score,
                                 "played_s": m.get("played_duration", r.get("played_duration"))})
        if st == -1:
            track["note"] = "no results recognised"
        elif st in (-2, -3):
            track["errors"].append({"state": st, "raw": data.get("error") or data.get("message")})
        report["tracks"].append(track)
    write_report(report)


# ----------------------------------------------------------------------------- report

def write_report(report: dict, dry: bool = False) -> None:
    REPORTS.mkdir(exist_ok=True)
    stamp = dt.date.today().isoformat()
    base = REPORTS / f"{report['name']}-{report['engine']}-{stamp}"
    if dry:
        print(f"\n\ndry run: {len(report['tracks'])} tracks, {report['requests']} identify requests would be sent.")
        return
    base.with_suffix(".json").write_text(json.dumps(report, indent=2, ensure_ascii=False))
    lines = [f"# {report['name']} — ACRCloud {report['engine']} scan, {report['when'][:10]}", ""]
    foreign_total = 0
    for t in report["tracks"]:
        foreign = {k: v for k, v in t["matches"].items() if not v["self"]}
        own = {k: v for k, v in t["matches"].items() if v["self"]}
        foreign_total += len(foreign)
        flag = "⚠ " if foreign else ""
        lines.append(f"## {flag}{t['track']}")
        if not t["matches"]:
            lines.append("clean — no recording matched" + (f" ({t.get('note')})" if t.get("note") else ""))
        for k, v in sorted(foreign.items(), key=lambda kv: -kv[1]["best_score"]):
            where = ", ".join(fmt_t(w["at_s"]) for w in v["windows"] if w.get("at_s") is not None)
            lines.append(f"- **{v['title']}** — {v['artists']}  ·  score {v['best_score']}  ·  at {where}")
            meta = [x for x in [v.get("album"), v.get("label"), v.get("release_date"), v.get("isrc")] if x]
            if meta:
                lines.append(f"  - {' · '.join(str(m) for m in meta)}")
        for k, v in own.items():
            lines.append(f"- (own catalogue) {v['title']} — {v['artists']}, score {v['best_score']}")
        if t.get("errors"):
            lines.append(f"- errors: {json.dumps(t['errors'])[:300]}")
        lines.append("")
    lines.insert(2, f"**{foreign_total} foreign recording(s) matched across {len(report['tracks'])} tracks.**  "
                    "A foreign match on a track that uses a loop usually means another release used the same "
                    "loop: declare the sample on that track and attach the loop's licence. "
                    "A foreign match with no loop at that position needs a listen.")
    lines.insert(3, "")
    base.with_suffix(".md").write_text("\n".join(lines))
    print(f"\n\nreport: {base.with_suffix('.md').relative_to(HERE.parent.parent)}")
    print("\n".join(lines))


# ----------------------------------------------------------------------------- cli

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("identify", help="sliding-window scan via the Identification API")
    p.add_argument("files", nargs="+")
    p.add_argument("--name", default="scan")
    p.add_argument("--window", type=float, default=12.0, help="seconds per sample (default 12)")
    p.add_argument("--hop", type=float, default=10.0, help="seconds between window starts (default 10)")
    p.add_argument("--min-score", type=int, default=70)
    p.add_argument("--pause", type=float, default=0.3, help="seconds between requests")
    p.add_argument("--dry-run", action="store_true", help="slice and count, send nothing")
    p.set_defaults(fn=run_identify)

    f = sub.add_parser("fs", help="File Scanning container (upload / results)")
    fsub = f.add_subparsers(dest="fscmd", required=True)
    u = fsub.add_parser("upload"); u.add_argument("files", nargs="+"); u.add_argument("--name", default="scan")
    u.set_defaults(fn=run_fs_upload)
    r = fsub.add_parser("results"); r.add_argument("--name", default="scan")
    r.add_argument("--min-score", type=int, default=70); r.add_argument("--poll-s", type=float, default=20)
    r.add_argument("--max-polls", type=int, default=30)
    r.set_defaults(fn=run_fs_results)

    args = ap.parse_args()
    if hasattr(args, "files"):   # @sets/name.txt expands to the paths listed in that file, one per line
        expanded = []
        for f in args.files:
            if f.startswith("@"):
                expanded += [l.strip() for l in Path(f[1:]).read_text().splitlines() if l.strip() and not l.startswith("#")]
            else:
                expanded.append(f)
        args.files = expanded
    args.fn(args)


if __name__ == "__main__":
    main()
