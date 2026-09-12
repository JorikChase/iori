#!/usr/bin/env python3
"""
Smoke test for the kanban + prefs endpoints, calling the route functions
directly against a throwaway SQLite file (no HTTP, no login).

    DB_PATH=/tmp/iori-test.db MEDIA_DIR=/tmp/iori-test-media api/venv/bin/python api/test_kanban.py
"""
import os, sys, tempfile

tmp = tempfile.mkdtemp(prefix="iori-api-test-")
os.environ.setdefault("DB_PATH", os.path.join(tmp, "test.db"))
os.environ.setdefault("MEDIA_DIR", os.path.join(tmp, "media"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import main as m  # noqa: E402  (init_db runs on import)
from fastapi import HTTPException  # noqa: E402

iori = {"id": 1, "username": "iori", "role": "admin"}
jachym = {"id": 2, "username": "jachym", "role": "member"}


def expect_error(fn, code):
    try:
        fn()
    except HTTPException as e:
        assert e.status_code == code, f"expected {code}, got {e.status_code}: {e.detail}"
        return
    raise AssertionError(f"expected HTTP {code}")


# --- migrations: a pre-enrichment tasks table gains the new columns
with m.db() as conn:
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(tasks)")}
assert {"color", "priority", "labels", "checklist", "links", "estimate", "archived", "updated_by"} <= cols

# --- create with enriched fields
t = m.create_task(m.TaskBody(
    title="Voxel flames: og image", lane="iori", phase="doing", assignee="Iori", due="2026-09-20",
    color="orange", priority="high", labels=["SEO", "seo", " render "],
    checklist=[{"text": "screenshot", "done": True}, {"text": "register og_image"}, {"text": ""}],
    links=["https://iori.me/voxel-flames-3d.html", "javascript:alert(1)", "pages.meta.json"],
    estimate="2h"), user=iori)
assert t["labels"] == ["seo", "render"], t["labels"]
assert t["checklist"] == [{"text": "screenshot", "done": True}, {"text": "register og_image", "done": False}]
assert t["links"] == ["https://iori.me/voxel-flames-3d.html"], t["links"]
assert t["assignee"] == "iori" and t["color"] == "orange" and t["priority"] == "high"
assert t["created_by"] == "iori" and t["updated_by"] == "iori" and t["archived"] is False

# --- validation
expect_error(lambda: m.create_task(m.TaskBody(title="x", color="teal"), user=iori), 400)
expect_error(lambda: m.create_task(m.TaskBody(title="x", priority="asap"), user=iori), 400)
expect_error(lambda: m.update_task(t["id"], {"labels": "seo"}, user=iori), 400)
expect_error(lambda: m.update_task(t["id"], {"title": "  "}, user=iori), 400)
expect_error(lambda: m.update_task(9999, {"title": "x"}, user=iori), 404)

# --- patch keeps json fields as lists and records who touched it
u = m.update_task(t["id"], {"checklist": [{"text": "a", "done": True}], "priority": "urgent", "position": 0.5}, user=jachym)
assert u["checklist"] == [{"text": "a", "done": True}] and u["priority"] == "urgent" and u["updated_by"] == "jachym"

# --- board carries users and hides archived tasks
done = m.create_task(m.TaskBody(title="old thing", phase="done"), user=iori)
b = m.get_board(user=iori)
assert {x["username"] for x in b["users"]} == {"iori", "jachym", "moises"}
assert any(x["id"] == done["id"] for x in b["tasks"])
r = m.archive_phase(m.ArchiveBody(phase="done"), user=iori)
assert r["archived"] == 1
assert not any(x["id"] == done["id"] for x in m.get_board(user=iori)["tasks"])
assert any(x["id"] == done["id"] and x["archived"] for x in m.get_board(archived=True, user=iori)["tasks"])
m.update_task(done["id"], {"archived": False}, user=iori)
assert any(x["id"] == done["id"] for x in m.get_board(user=iori)["tasks"])

# --- lane rename cascades to tasks; collisions and bad names refused
m.create_lane(m.LaneBody(name="temp lane"), user=iori)
m.update_task(t["id"], {"lane": "temp lane"}, user=iori)
r = m.update_lane("temp lane", {"name": "Renamed Lane", "pinned": True}, user=iori)
assert r["name"] == "renamed lane"
b = m.get_board(user=iori)
assert any(l["name"] == "renamed lane" and l["pinned"] == 1 for l in b["lanes"])
assert next(x for x in b["tasks"] if x["id"] == t["id"])["lane"] == "renamed lane"
expect_error(lambda: m.update_lane("renamed lane", {"name": "iori"}, user=iori), 400)
expect_error(lambda: m.update_lane("renamed lane", {"name": "no/slash"}, user=iori), 400)
expect_error(lambda: m.update_lane("ghost", {"pinned": True}, user=iori), 404)

# --- prefs: defaults, partial update, validation, visibility through /users
p = m.get_prefs(user=iori)
assert p == m.PREF_DEFAULTS
p = m.put_prefs({"display_name": "IORI", "color": "yellow", "theme": "light", "poll": "60", "lang": "cs", "bogus": 1}, user=iori)
assert p["display_name"] == "IORI" and p["color"] == "yellow" and p["poll"] == 60 and p["lang"] == "cs" and "bogus" not in p
assert p["density"] == "comfortable"  # untouched default survives a partial update
expect_error(lambda: m.put_prefs({"theme": "sepia"}, user=iori), 400)
expect_error(lambda: m.put_prefs({"poll": "soon"}, user=iori), 400)
me = next(x for x in m.list_users(user=jachym)["users"] if x["username"] == "iori")
assert me["display_name"] == "IORI" and me["color"] == "yellow"
assert m.get_prefs(user=jachym) == m.PREF_DEFAULTS  # prefs are per user

print("kanban + prefs: all checks passed")
