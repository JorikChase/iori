#!/usr/bin/env python3
"""
blackjach-api — public deck sharing + per-deck leaderboards for the
blackjach flashcard game (see ../blackjach).

Deliberately standalone: its own SQLite DB, its own process, nothing shared
with iori-api. No accounts of any kind — sharing a deck or posting a score
just takes a free-text nickname (not reserved, not authenticated; anyone can
reuse anyone else's nickname). This is an honor-system leaderboard: scores
are trusted as reported by the client, with basic input sanitation only
(no replay/anti-cheat validation).

One file, stdlib sqlite3, FastAPI — same shape as iori-api/main.py.

Config via environment:
  PORT          (default 3100)
  DB_PATH       (default ./blackjach.db)
  MEDIA_DIR     (default ./media)
  MEDIA_BASEURL (public URL prefix for card images, default /media)
  CORS_ORIGINS  (comma-separated, default http://localhost:8791,http://127.0.0.1:8791)
"""

import base64
import binascii
import json
import os
import re
import sqlite3
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

PORT = int(os.environ.get("PORT", "3100"))
DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "blackjach.db"))
MEDIA_DIR = Path(os.environ.get("MEDIA_DIR", os.path.join(os.path.dirname(__file__), "media")))
MEDIA_BASEURL = os.environ.get("MEDIA_BASEURL", "/media")
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
CORS_ORIGINS = [o.strip() for o in os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:8791,http://127.0.0.1:8791",
).split(",") if o.strip()]

# ---- limits (input hygiene, not anti-cheat) ----
MAX_CARDS_PER_DECK = 500
MAX_NAME_LEN = 80
MAX_NICKNAME_LEN = 24
MAX_TEXT_LEN = 2000
MAX_TAGS = 10
MAX_DISTRACTORS = 4
MAX_IMAGE_BYTES = 2 * 1024 * 1024  # 2MB decoded, well above what the client's own downscale produces
MAX_POINTS = 100_000
MAX_RUNGS = 50
POST_MIN_INTERVAL_SEC = 2.0  # per-IP throttle on write endpoints
IMAGE_DATA_URL_RE = re.compile(r"^data:image/(png|jpe?g|webp|gif);base64,(.+)$", re.S)
EXT_FOR_MIME = {"png": "png", "jpg": "jpg", "jpeg": "jpg", "webp": "webp", "gif": "gif"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS decks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    shared_by TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    difficulty INTEGER NOT NULL,
    prompt_type TEXT NOT NULL,
    prompt_text TEXT NOT NULL DEFAULT '',
    image_path TEXT,
    answer TEXT NOT NULL,
    distractors TEXT NOT NULL DEFAULT '[]',
    note TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    nickname TEXT NOT NULL,
    points INTEGER NOT NULL,
    rungs_cleared INTEGER NOT NULL,
    outcome TEXT NOT NULL DEFAULT '',
    submitted_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limit (
    ip TEXT PRIMARY KEY,
    last_post_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cards_deck ON cards(deck_id);
CREATE INDEX IF NOT EXISTS idx_scores_deck_points ON scores(deck_id, points DESC);
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


app = FastAPI(title="blackjach-api")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.mount(MEDIA_BASEURL, StaticFiles(directory=MEDIA_DIR), name="media")


@app.on_event("startup")
def _startup():
    init_db()


# ---------------------------------------------------------------- models --

class CardIn(BaseModel):
    difficulty: int
    promptType: str
    promptText: str = ""
    imageDataUrl: Optional[str] = None
    answer: str
    distractors: list[str] = Field(default_factory=list)
    note: str = ""
    tags: list[str] = Field(default_factory=list)

    @field_validator("difficulty")
    @classmethod
    def _difficulty_range(cls, v):
        if v not in (1, 2, 3):
            raise ValueError("difficulty must be 1, 2 or 3")
        return v

    @field_validator("promptType")
    @classmethod
    def _prompt_type(cls, v):
        if v not in ("text", "image"):
            raise ValueError("promptType must be 'text' or 'image'")
        return v

    @field_validator("answer")
    @classmethod
    def _answer_required(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("answer is required")
        return v[:MAX_TEXT_LEN]


class DeckIn(BaseModel):
    name: str
    sharedBy: str
    cards: list[CardIn]

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("deck name is required")
        return v[:MAX_NAME_LEN]

    @field_validator("sharedBy")
    @classmethod
    def _nickname(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("nickname is required")
        return v[:MAX_NICKNAME_LEN]

    @field_validator("cards")
    @classmethod
    def _cards_bounds(cls, v):
        if not v:
            raise ValueError("deck needs at least one card")
        if len(v) > MAX_CARDS_PER_DECK:
            raise ValueError(f"too many cards (max {MAX_CARDS_PER_DECK})")
        return v


class ScoreIn(BaseModel):
    nickname: str
    points: int
    rungsCleared: int
    outcome: str = ""

    @field_validator("nickname")
    @classmethod
    def _nickname(cls, v):
        v = (v or "").strip()
        if not v:
            raise ValueError("nickname is required")
        return v[:MAX_NICKNAME_LEN]

    @field_validator("points")
    @classmethod
    def _points_range(cls, v):
        if v < 0 or v > MAX_POINTS:
            raise ValueError("points out of range")
        return v

    @field_validator("rungsCleared")
    @classmethod
    def _rungs_range(cls, v):
        if v < 0 or v > MAX_RUNGS:
            raise ValueError("rungsCleared out of range")
        return v

    @field_validator("outcome")
    @classmethod
    def _outcome_trim(cls, v):
        return (v or "")[:20]


# ------------------------------------------------------------- helpers ----

def save_image(data_url: str) -> str:
    m = IMAGE_DATA_URL_RE.match(data_url or "")
    if not m:
        raise HTTPException(400, "imageDataUrl must be a data:image/... base64 URL")
    mime, b64 = m.group(1).lower(), m.group(2)
    try:
        raw = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "invalid base64 image data")
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(400, f"image too large (max {MAX_IMAGE_BYTES // 1024}KB)")
    ext = EXT_FOR_MIME.get(mime, "png")
    filename = f"{uuid.uuid4().hex}.{ext}"
    (MEDIA_DIR / filename).write_bytes(raw)
    return filename


def enforce_rate_limit(request: Request):
    ip = request.client.host if request.client else "unknown"
    t = time.time()
    with db() as conn:
        row = conn.execute("SELECT last_post_at FROM rate_limit WHERE ip = ?", (ip,)).fetchone()
        if row and (t - row["last_post_at"]) < POST_MIN_INTERVAL_SEC:
            raise HTTPException(429, "Too many requests — slow down a little.")
        conn.execute(
            "INSERT INTO rate_limit(ip, last_post_at) VALUES (?, ?) "
            "ON CONFLICT(ip) DO UPDATE SET last_post_at = excluded.last_post_at",
            (ip, t),
        )


def card_row_to_json(row) -> dict:
    return {
        "id": row["id"],
        "difficulty": row["difficulty"],
        "promptType": row["prompt_type"],
        "promptText": row["prompt_text"],
        "imageUrl": f"{MEDIA_BASEURL}/{row['image_path']}" if row["image_path"] else None,
        "answer": row["answer"],
        "distractors": json.loads(row["distractors"]),
        "note": row["note"],
        "tags": json.loads(row["tags"]),
    }


# ------------------------------------------------------------- routes -----

@app.get("/health")
def health():
    return {"status": "ok", "time": now()}


@app.post("/decks", status_code=201)
def share_deck(payload: DeckIn):
    deck_id = uuid.uuid4().hex
    created = now()
    with db() as conn:
        conn.execute(
            "INSERT INTO decks(id, name, shared_by, created_at) VALUES (?, ?, ?, ?)",
            (deck_id, payload.name, payload.sharedBy, created),
        )
        for card in payload.cards:
            image_path = save_image(card.imageDataUrl) if card.promptType == "image" and card.imageDataUrl else None
            conn.execute(
                "INSERT INTO cards(id, deck_id, difficulty, prompt_type, prompt_text, image_path, "
                "answer, distractors, note, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    uuid.uuid4().hex, deck_id, card.difficulty, card.promptType, card.promptText,
                    image_path, card.answer, json.dumps(card.distractors[:MAX_DISTRACTORS]),
                    card.note[:MAX_TEXT_LEN], json.dumps(card.tags[:MAX_TAGS]),
                ),
            )
    return {"id": deck_id, "name": payload.name, "cardCount": len(payload.cards)}


@app.get("/decks")
def list_decks(limit: int = 50, sort: str = "new"):
    limit = max(1, min(limit, 200))
    order = "d.created_at DESC"
    if sort == "top":
        order = "best_score DESC NULLS LAST, d.created_at DESC"
    with db() as conn:
        rows = conn.execute(f"""
            SELECT d.id, d.name, d.shared_by, d.created_at,
                   COUNT(DISTINCT c.id) AS card_count,
                   SUM(CASE WHEN c.difficulty = 1 THEN 1 ELSE 0 END) AS easy_count,
                   SUM(CASE WHEN c.difficulty = 2 THEN 1 ELSE 0 END) AS medium_count,
                   SUM(CASE WHEN c.difficulty = 3 THEN 1 ELSE 0 END) AS hard_count,
                   MAX(s.points) AS best_score,
                   COUNT(DISTINCT s.id) AS play_count
            FROM decks d
            LEFT JOIN cards c ON c.deck_id = d.id
            LEFT JOIN scores s ON s.deck_id = d.id
            GROUP BY d.id
            ORDER BY {order}
            LIMIT ?
        """, (limit,)).fetchall()
    return [
        {
            "id": r["id"], "name": r["name"], "sharedBy": r["shared_by"], "createdAt": r["created_at"],
            "cardCount": r["card_count"],
            "difficulty": {"easy": r["easy_count"], "medium": r["medium_count"], "hard": r["hard_count"]},
            "bestScore": r["best_score"], "playCount": r["play_count"],
        }
        for r in rows
    ]


@app.get("/decks/{deck_id}")
def get_deck(deck_id: str):
    with db() as conn:
        deck = conn.execute("SELECT * FROM decks WHERE id = ?", (deck_id,)).fetchone()
        if not deck:
            raise HTTPException(404, "deck not found")
        cards = conn.execute("SELECT * FROM cards WHERE deck_id = ?", (deck_id,)).fetchall()
    return {
        "id": deck["id"], "name": deck["name"], "sharedBy": deck["shared_by"], "createdAt": deck["created_at"],
        "cards": [card_row_to_json(c) for c in cards],
    }


@app.post("/decks/{deck_id}/scores", status_code=201)
def submit_score(deck_id: str, payload: ScoreIn, request: Request):
    enforce_rate_limit(request)
    with db() as conn:
        deck = conn.execute("SELECT id FROM decks WHERE id = ?", (deck_id,)).fetchone()
        if not deck:
            raise HTTPException(404, "deck not found")
        cur = conn.execute(
            "INSERT INTO scores(deck_id, nickname, points, rungs_cleared, outcome, submitted_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (deck_id, payload.nickname, payload.points, payload.rungsCleared, payload.outcome, now()),
        )
    return {"id": cur.lastrowid, "nickname": payload.nickname, "points": payload.points}


@app.get("/decks/{deck_id}/leaderboard")
def leaderboard(deck_id: str, limit: int = 20):
    limit = max(1, min(limit, 100))
    with db() as conn:
        deck = conn.execute("SELECT id FROM decks WHERE id = ?", (deck_id,)).fetchone()
        if not deck:
            raise HTTPException(404, "deck not found")
        rows = conn.execute(
            "SELECT nickname, points, rungs_cleared, outcome, submitted_at FROM scores "
            "WHERE deck_id = ? ORDER BY points DESC, submitted_at ASC LIMIT ?",
            (deck_id, limit),
        ).fetchall()
    return [
        {
            "nickname": r["nickname"], "points": r["points"], "rungsCleared": r["rungs_cleared"],
            "outcome": r["outcome"], "submittedAt": r["submitted_at"],
        }
        for r in rows
    ]


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
