#!/usr/bin/env python3
"""Same-origin mock of api.3die.fr + static dash/ so the dashboard can be
rendered with representative data and no real login.

    python3 tools/dash-mock/mock.py dash 8766
    then in the browser console once: localStorage.setItem('dash_api', 'http://localhost:8766')

Writes are accepted and applied in memory (they vanish on restart)."""
import json, os, sys, itertools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
DASH = sys.argv[1] if len(sys.argv) > 1 else "dash"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8766

users = [
    {"username": "iori", "role": "admin", "display_name": "", "color": "yellow", "avatar": ""},
    {"username": "jachym", "role": "member", "display_name": "jáchym", "color": "violet", "avatar": ""},
    {"username": "moises", "role": "member", "display_name": "", "color": "cyan", "avatar": ""},
]
prefs = {"display_name": "", "color": "yellow", "avatar": "", "default_lane": "iori", "default_view": "board",
         "density": "comfortable", "theme": "dark", "poll": 25, "lang": "en"}
T = "2026-09-02T10:00:00Z"
def task(i, title, lane, phase, **kw):
    d = {"id": i, "title": title, "body": "", "lane": lane, "phase": phase, "position": i, "pinned": False,
         "assignee": "", "due": "", "created_by": "iori", "created_at": T, "updated_at": T, "updated_by": "",
         "color": "", "priority": "none", "labels": [], "checklist": [], "links": [], "estimate": "", "archived": False}
    d.update(kw); return d
board = {
 "lanes": [{"name": "general", "position": 0, "pinned": 1}, {"name": "3die", "position": 1, "pinned": 0},
           {"name": "iori", "position": 2, "pinned": 0}, {"name": "moises", "position": 3, "pinned": 0}, {"name": "jachym", "position": 4, "pinned": 0}],
 "phases": [{"name": "idea", "position": 0}, {"name": "doing", "position": 1}, {"name": "review", "position": 2}, {"name": "done", "position": 3}],
 "tasks": [
  task(1, "Splat app remake + Hugging Face hosting", "iori", "idea", body="see BACKLOG #1", pinned=True, assignee="iori", due="2026-10-01",
       color="cyan", priority="high", labels=["splats", "infra"], estimate="3d",
       checklist=[{"text": "create the Space repo", "done": True}, {"text": "upload ksplats", "done": False}, {"text": "new viewer", "done": False}],
       links=["https://huggingface.co/spaces", "iori.html"]),
  task(2, "Git history rewrite (repo slimming)", "iori", "idea", priority="low", labels=["infra"]),
  task(3, "Bandcamp activation", "3die", "idea", assignee="jachym", due="2026-09-20", color="pink", labels=["music"]),
  task(4, "OG share images per page", "iori", "doing", assignee="iori", due="2026-09-05", color="orange", priority="urgent", labels=["seo"],
       checklist=[{"text": "default card", "done": True}, {"text": "per-page screenshots", "done": False}], estimate="2h", updated_by="jachym", updated_at="2026-09-10T12:00:00Z"),
  task(5, "blackjach casino redesign", "3die", "review", assignee="jachym", color="violet", labels=["game"], created_by="jachym"),
  task(6, "Fix soft-404s", "general", "done", assignee="iori", color="green", checklist=[{"text": "404 page", "done": True}, {"text": "caddy", "done": True}]),
  task(7, "Photo journal: September shoot", "moises", "doing", body="upload + captions", assignee="moises", due="2026-09-12", color="cyan", labels=["blog"], created_by="moises"),
  task(8, "Cathedral page copy pass", "jachym", "idea", assignee="jachym", priority="medium", created_by="jachym"),
  task(9, "A long task title that keeps going to show how cards wrap when the title is verbose and detailed", "general", "idea", due="2026-08-01", priority="medium"),
  task(10, "Old archived thing", "general", "done", archived=True),
 ]}
msgs = {"contact": [{"id": 11, "kind": "contact", "author": "Anna", "email": "anna@example.com", "subject": "print order", "body": "Hi, can I order the plague doctor print?", "read": 0, "thread_id": None, "created_at": "2026-09-10T12:00:00Z"}],
        "thread": [{"id": 12, "kind": "thread", "author": "jachym", "email": "", "subject": "", "body": "pushed the casino redesign", "read": 1, "thread_id": None, "created_at": "2026-09-10T12:00:00Z"},
                   {"id": 13, "kind": "thread", "author": "iori", "email": "", "subject": "", "body": "looks great, merging", "read": 1, "thread_id": None, "created_at": "2026-09-10T12:05:00Z"}]}
ids = itertools.count(100)

class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=DASH, **k)
    def _json(self, obj, code=200):
        b = json.dumps(obj).encode(); self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b""
        try: return json.loads(raw or b"{}")
        except Exception: return {}
    def do_GET(self):
        p = self.path.split("?")[0]
        if p == "/auth/me": return self._json({"id": 1, "username": "iori", "role": "admin"})
        if p == "/board":
            arch = "archived=1" in self.path or "archived=true" in self.path
            return self._json({**board, "tasks": [t for t in board["tasks"] if arch or not t["archived"]], "users": users})
        if p == "/users": return self._json({"users": users})
        if p == "/prefs": return self._json(prefs)
        if p == "/messages": return self._json({"messages": msgs["thread" if "kind=thread" in self.path else "contact"]})
        if p == "/posts": return self._json({"posts": []})
        return super().do_GET()
    def do_POST(self):
        p = self.path.split("?")[0]; b = self._body()
        if p == "/tasks":
            t = task(next(ids), b.get("title", "?"), b.get("lane", "general"), b.get("phase", "idea"), **{k: v for k, v in b.items() if k not in ("title", "lane", "phase")})
            board["tasks"].append(t); return self._json(t)
        if p == "/tasks/archive":
            n = 0
            for t in board["tasks"]:
                if t["phase"] == b.get("phase") and not t["archived"]: t["archived"] = True; n += 1
            return self._json({"ok": True, "archived": n})
        if p == "/lanes": board["lanes"].append({"name": b["name"].lower(), "position": len(board["lanes"]), "pinned": 0}); return self._json({"ok": True})
        if p == "/phases": board["phases"].append({"name": b["name"].lower(), "position": len(board["phases"])}); return self._json({"ok": True})
        if p == "/messages": msgs["thread"].insert(0, {"id": next(ids), "kind": "thread", "author": "iori", "body": b.get("body", ""), "read": 1, "created_at": T}); return self._json({"ok": True})
        return self._json({"ok": True})
    def do_PUT(self):
        p = self.path.split("?")[0]; b = self._body()
        if p == "/prefs": prefs.update({k: v for k, v in b.items() if k in prefs}); return self._json(prefs)
        return self._json({"ok": True})
    def do_PATCH(self):
        p = self.path.split("?")[0]; b = self._body()
        if p.startswith("/tasks/"):
            tid = int(p.split("/")[2])
            for t in board["tasks"]:
                if t["id"] == tid: t.update(b); t["updated_by"] = "iori"; return self._json(t)
            return self._json({"detail": "task not found"}, 404)
        if p.startswith("/lanes/"):
            name = p.split("/")[2]
            for l in board["lanes"]:
                if l["name"] == name:
                    if "name" in b:
                        new = b["name"].strip().lower(); l["name"] = new
                        for t in board["tasks"]:
                            if t["lane"] == name: t["lane"] = new
                    if "pinned" in b: l["pinned"] = int(bool(b["pinned"]))
                    if "position" in b: l["position"] = b["position"]
            board["lanes"].sort(key=lambda l: (-l["pinned"], l["position"]))
            return self._json({"ok": True})
        return self._json({"ok": True})
    def do_DELETE(self):
        p = self.path.split("?")[0]
        if p.startswith("/tasks/"):
            tid = int(p.split("/")[2]); board["tasks"] = [t for t in board["tasks"] if t["id"] != tid]
        if p.startswith("/lanes/"):
            name = p.split("/")[2]; board["lanes"] = [l for l in board["lanes"] if l["name"] != name]
        return self._json({"ok": True})
    def log_message(self, *a): pass

ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
