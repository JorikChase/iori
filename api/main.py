#!/usr/bin/env python3
"""
iori-api — the 3die/iori backend service.

Replaces zausi. One file, stdlib sqlite3, FastAPI.
Features: session auth, kanban (pinnable swimlanes + phases), contact inbox,
internal messages, and the moises photo blog (multipart upload -> media dir).

Config via environment:
  PORT          (default 3000)
  DB_PATH       (default ./iori.db)
  MEDIA_DIR     (default ./media)
  MEDIA_BASEURL (public URL prefix for media, default /media)
  CORS_ORIGINS  (comma-separated, default https://dash.3die.fr,http://localhost:8000,http://127.0.0.1:8000)
"""

import json
import os
import re
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

import bcrypt
import uvicorn
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

PORT = int(os.environ.get("PORT", "3000"))
DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "iori.db"))
MEDIA_DIR = Path(os.environ.get("MEDIA_DIR", os.path.join(os.path.dirname(__file__), "media")))
MEDIA_BASEURL = os.environ.get("MEDIA_BASEURL", "/media")
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
CORS_ORIGINS = [o.strip() for o in os.environ.get(
    "CORS_ORIGINS",
    "https://dash.3die.fr,http://localhost:8000,http://127.0.0.1:8000",
).split(",") if o.strip()]

SESSION_COOKIE = "iori_session"
SESSION_DAYS = 30
MAX_UPLOAD_MB = 50
ALLOWED_MEDIA = re.compile(r"^(image|video)/", re.I)

DEFAULT_LANES = [("general", 0), ("3die", 1), ("iori", 2), ("moises", 3), ("jachym", 4)]
DEFAULT_PHASES = [("idea", 0), ("doing", 1), ("review", 2), ("done", 3)]
DEFAULT_USERS = ["iori", "jachym", "moises"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    pass_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lanes (
    name TEXT PRIMARY KEY,
    position REAL NOT NULL DEFAULT 0,
    pinned INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS phases (
    name TEXT PRIMARY KEY,
    position REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    lane TEXT NOT NULL DEFAULT 'general',
    phase TEXT NOT NULL DEFAULT 'idea',
    position REAL NOT NULL DEFAULT 0,
    pinned INTEGER NOT NULL DEFAULT 0,
    assignee TEXT NOT NULL DEFAULT '',
    due TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL DEFAULT 'contact',
    author TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    thread_id INTEGER,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    media TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_lane_phase ON tasks(lane, phase, position);
CREATE INDEX IF NOT EXISTS idx_messages_kind ON messages(kind, read);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
"""


def now():
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    with db() as conn:
        conn.executescript(SCHEMA)
        if conn.execute("SELECT COUNT(*) c FROM lanes").fetchone()["c"] == 0:
            conn.executemany("INSERT INTO lanes(name, position) VALUES (?, ?)", DEFAULT_LANES)
        if conn.execute("SELECT COUNT(*) c FROM phases").fetchone()["c"] == 0:
            conn.executemany("INSERT INTO phases(name, position) VALUES (?, ?)", DEFAULT_PHASES)
        if conn.execute("SELECT COUNT(*) c FROM users").fetchone()["c"] == 0:
            pw_file = Path(DB_PATH).parent / "initial-passwords.txt"
            lines = ["Initial accounts — change these passwords after first login.", ""]
            for uname in DEFAULT_USERS:
                password = secrets.token_urlsafe(9)
                role = "admin" if uname == "iori" else "member"
                conn.execute(
                    "INSERT INTO users(username, pass_hash, role, created_at) VALUES (?, ?, ?, ?)",
                    (uname, bcrypt.hashpw(password.encode(), bcrypt.gensalt(12)).decode(), role, now()),
                )
                lines.append(f"{uname}: {password}")
            pw_file.write_text("\n".join(lines) + "\n")
            os.chmod(pw_file, 0o600)


# ---------------------------------------------------------------- auth

def get_session_user(request: Request):
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None
    with db() as conn:
        row = conn.execute(
            """SELECT u.id, u.username, u.role FROM sessions s
               JOIN users u ON u.id = s.user_id
               WHERE s.token = ? AND s.expires_at > ?""",
            (token, now()),
        ).fetchone()
    return dict(row) if row else None


def require_user(request: Request):
    user = get_session_user(request)
    if not user:
        raise HTTPException(401, "not authenticated")
    return user


def require_admin(user=Depends(require_user)):
    if user["role"] != "admin":
        raise HTTPException(403, "admin only")
    return user


# ---------------------------------------------------------------- app

app = FastAPI(title="iori-api", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CONTACT_RATE = {}  # ip -> [timestamps]


@app.middleware("http")
async def security_headers(request, call_next):
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    return resp


@app.get("/health")
def health():
    return {"ok": True, "service": "iori-api", "time": now()}


# ---- auth

class LoginBody(BaseModel):
    username: str
    password: str


@app.post("/auth/login")
def login(body: LoginBody):
    with db() as conn:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (body.username.strip().lower(),)).fetchone()
        if not row or not bcrypt.checkpw(body.password.encode(), row["pass_hash"].encode()):
            raise HTTPException(401, "invalid credentials")
        token = secrets.token_urlsafe(32)
        conn.execute(
            "INSERT INTO sessions(token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token, row["id"], now(), (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)).isoformat()),
        )
        conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now(),))
    resp = JSONResponse({"ok": True, "username": row["username"], "role": row["role"]})
    resp.set_cookie(SESSION_COOKIE, token, max_age=SESSION_DAYS * 86400,
                    httponly=True, secure=True, samesite="none", path="/")
    return resp


@app.post("/auth/logout")
def logout(request: Request):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        with db() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(SESSION_COOKIE, path="/")
    return resp


@app.get("/auth/me")
def me(user=Depends(require_user)):
    return user


class PasswordBody(BaseModel):
    old_password: str
    new_password: str


@app.post("/auth/change-password")
def change_password(body: PasswordBody, request: Request, user=Depends(require_user)):
    if len(body.new_password) < 8:
        raise HTTPException(400, "password must be at least 8 characters")
    with db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
        if not bcrypt.checkpw(body.old_password.encode(), row["pass_hash"].encode()):
            raise HTTPException(401, "wrong current password")
        conn.execute("UPDATE users SET pass_hash = ? WHERE id = ?",
                     (bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt(12)).decode(), user["id"]))
        conn.execute("DELETE FROM sessions WHERE user_id = ? AND token != ?",
                     (user["id"], request.cookies.get(SESSION_COOKIE, "")))
    return {"ok": True}


# ---- kanban

def full_board(conn):
    lanes = [dict(r) for r in conn.execute("SELECT * FROM lanes ORDER BY pinned DESC, position").fetchall()]
    phases = [dict(r) for r in conn.execute("SELECT * FROM phases ORDER BY position").fetchall()]
    tasks = [dict(r) for r in conn.execute(
        "SELECT * FROM tasks ORDER BY pinned DESC, position, id").fetchall()]
    return {"lanes": lanes, "phases": phases, "tasks": tasks}


@app.get("/board")
def get_board(user=Depends(require_user)):
    with db() as conn:
        return full_board(conn)


class TaskBody(BaseModel):
    title: str
    body: str = ""
    lane: str = "general"
    phase: str = "idea"
    assignee: str = ""
    due: str = ""
    pinned: bool = False


def task_row(conn, task_id):
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        raise HTTPException(404, "task not found")
    return row


@app.post("/tasks")
def create_task(body: TaskBody, user=Depends(require_user)):
    title = body.title.strip()
    if not title:
        raise HTTPException(400, "title required")
    with db() as conn:
        pos = (conn.execute("SELECT COALESCE(MAX(position), 0) + 1 p FROM tasks WHERE lane = ? AND phase = ?",
                            (body.lane, body.phase)).fetchone())["p"]
        cur = conn.execute(
            """INSERT INTO tasks(title, body, lane, phase, position, pinned, assignee, due, created_by, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (title, body.body, body.lane, body.phase, pos, int(body.pinned),
             body.assignee, body.due, user["username"], now(), now()),
        )
        return dict(task_row(conn, cur.lastrowid))


@app.patch("/tasks/{task_id}")
def update_task(task_id: int, body: dict, user=Depends(require_user)):
    allowed = {"title", "body", "lane", "phase", "position", "pinned", "assignee", "due"}
    fields = {k: v for k, v in body.items() if k in allowed}
    if not fields:
        raise HTTPException(400, "nothing to update")
    if "pinned" in fields:
        fields["pinned"] = int(bool(fields["pinned"]))
    if "title" in fields and not str(fields["title"]).strip():
        raise HTTPException(400, "title cannot be empty")
    fields["updated_at"] = now()
    with db() as conn:
        task_row(conn, task_id)
        sets = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE tasks SET {sets} WHERE id = ?", (*fields.values(), task_id))
        return dict(task_row(conn, task_id))


@app.delete("/tasks/{task_id}")
def delete_task(task_id: int, user=Depends(require_user)):
    with db() as conn:
        task_row(conn, task_id)
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    return {"ok": True}


class LaneBody(BaseModel):
    name: str


@app.post("/lanes")
def create_lane(body: LaneBody, user=Depends(require_user)):
    name = body.name.strip().lower()
    if not name or not re.match(r"^[a-z0-9 _-]+$", name):
        raise HTTPException(400, "invalid lane name")
    with db() as conn:
        pos = conn.execute("SELECT COALESCE(MAX(position), 0) + 1 p FROM lanes").fetchone()["p"]
        conn.execute("INSERT OR IGNORE INTO lanes(name, position) VALUES (?, ?)", (name, pos))
    return {"ok": True, "name": name}


@app.patch("/lanes/{name}")
def update_lane(name: str, body: dict, user=Depends(require_user)):
    allowed = {"position", "pinned"}
    fields = {k: v for k, v in body.items() if k in allowed}
    if "pinned" in fields:
        fields["pinned"] = int(bool(fields["pinned"]))
    if not fields:
        raise HTTPException(400, "nothing to update")
    with db() as conn:
        sets = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(f"UPDATE lanes SET {sets} WHERE name = ?", (*fields.values(), name))
    return {"ok": True}


@app.delete("/lanes/{name}")
def delete_lane(name: str, user=Depends(require_user)):
    with db() as conn:
        count = conn.execute("SELECT COUNT(*) c FROM tasks WHERE lane = ?", (name,)).fetchone()["c"]
        if count:
            raise HTTPException(400, f"lane has {count} tasks — move them first")
        conn.execute("DELETE FROM lanes WHERE name = ?", (name,))
    return {"ok": True}


@app.post("/phases")
def create_phase(body: LaneBody, user=Depends(require_user)):
    name = body.name.strip().lower()
    if not name or not re.match(r"^[a-z0-9 _-]+$", name):
        raise HTTPException(400, "invalid phase name")
    with db() as conn:
        pos = conn.execute("SELECT COALESCE(MAX(position), 0) + 1 p FROM phases").fetchone()["p"]
        conn.execute("INSERT OR IGNORE INTO phases(name, position) VALUES (?, ?)", (name, pos))
    return {"ok": True, "name": name}


@app.delete("/phases/{name}")
def delete_phase(name: str, user=Depends(require_user)):
    with db() as conn:
        count = conn.execute("SELECT COUNT(*) c FROM phases").fetchone()["c"]
        if count <= 1:
            raise HTTPException(400, "cannot delete the last phase")
        used = conn.execute("SELECT COUNT(*) c FROM tasks WHERE phase = ?", (name,)).fetchone()["c"]
        if used:
            raise HTTPException(400, f"phase has {used} tasks — move them first")
        conn.execute("DELETE FROM phases WHERE name = ?", (name,))
    return {"ok": True}


# ---- messages

class ContactBody(BaseModel):
    name: str = ""
    email: str = ""
    subject: str = ""
    body: str


@app.post("/contact")
def contact(body: ContactBody, request: Request):
    ip = request.client.host if request.client else "unknown"
    hits = [t for t in CONTACT_RATE.get(ip, []) if time.time() - t < 3600]
    if len(hits) >= 5:
        raise HTTPException(429, "too many messages — try later")
    hits.append(time.time())
    CONTACT_RATE[ip] = hits
    text = body.body.strip()
    if len(text) < 3:
        raise HTTPException(400, "message too short")
    if len(text) > 8000:
        raise HTTPException(400, "message too long")
    with db() as conn:
        conn.execute(
            "INSERT INTO messages(kind, author, email, subject, body, created_at) VALUES ('contact', ?, ?, ?, ?, ?)",
            (body.name.strip()[:120], body.email.strip()[:200], body.subject.strip()[:200], text, now()),
        )
    return {"ok": True}


@app.get("/messages")
def list_messages(kind: str = "contact", user=Depends(require_user)):
    if kind not in ("contact", "thread"):
        raise HTTPException(400, "kind must be contact or thread")
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM messages WHERE kind = ? ORDER BY id DESC LIMIT 500", (kind,)).fetchall()
    return {"messages": [dict(r) for r in rows]}


class ThreadBody(BaseModel):
    body: str


@app.post("/messages")
def post_thread(body: ThreadBody, user=Depends(require_user)):
    text = body.body.strip()
    if not text:
        raise HTTPException(400, "empty message")
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO messages(kind, author, body, read, created_at) VALUES ('thread', ?, ?, 1, ?)",
            (user["username"], text, now()),
        )
        row = conn.execute("SELECT * FROM messages WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)


@app.patch("/messages/{msg_id}")
def mark_message(msg_id: int, body: dict, user=Depends(require_user)):
    read = int(bool(body.get("read", True)))
    with db() as conn:
        conn.execute("UPDATE messages SET read = ? WHERE id = ?", (read, msg_id))
    return {"ok": True}


# ---- posts (photo blog)

def post_dict(row):
    d = dict(row)
    d["media"] = [f"{MEDIA_BASEURL}/{m}" for m in json.loads(d["media"])]
    return d


@app.get("/posts")
def list_posts(author: str = "", limit: int = 100, offset: int = 0):
    limit = min(max(limit, 1), 200)
    with db() as conn:
        if author:
            rows = conn.execute(
                "SELECT * FROM posts WHERE author = ? ORDER BY id DESC LIMIT ? OFFSET ?",
                (author, limit, offset)).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM posts ORDER BY id DESC LIMIT ? OFFSET ?", (limit, offset)).fetchall()
    return {"posts": [post_dict(r) for r in rows]}


@app.post("/posts")
async def create_post(
    caption: str = Form(""),
    files: list[UploadFile] = File(default=[]),
    user=Depends(require_user),
):
    saved = []
    for f in files:
        if not f.filename:
            continue
        ctype = (f.content_type or "").lower()
        if not ALLOWED_MEDIA.match(ctype):
            raise HTTPException(400, f"unsupported file type: {f.filename}")
        data = await f.read()
        if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
            raise HTTPException(400, f"file too large (>{MAX_UPLOAD_MB}MB): {f.filename}")
        ext = Path(f.filename).suffix.lower()[:10] or ".bin"
        name = f"{uuid.uuid4().hex}{ext}"
        (MEDIA_DIR / name).write_bytes(data)
        saved.append(name)
    if not saved and not caption.strip():
        raise HTTPException(400, "post needs media or a caption")
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO posts(author, caption, media, created_at) VALUES (?, ?, ?, ?)",
            (user["username"], caption.strip(), json.dumps(saved), now()),
        )
        row = conn.execute("SELECT * FROM posts WHERE id = ?", (cur.lastrowid,)).fetchone()
        return post_dict(row)


@app.delete("/posts/{post_id}")
def delete_post(post_id: int, user=Depends(require_user)):
    with db() as conn:
        row = conn.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
        if not row:
            raise HTTPException(404, "post not found")
        if row["author"] != user["username"] and user["role"] != "admin":
            raise HTTPException(403, "can only delete your own posts")
        for name in json.loads(row["media"]):
            try:
                (MEDIA_DIR / name).unlink(missing_ok=True)
            except OSError:
                pass
        conn.execute("DELETE FROM posts WHERE id = ?", (post_id,))
    return {"ok": True}


# local dev: serve uploaded media (production serves it via Caddy)
app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")


if __name__ == "__main__":
    init_db()
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="info")
else:
    init_db()
