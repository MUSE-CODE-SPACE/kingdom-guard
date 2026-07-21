"""Kingdom Guard — global leaderboard (nickname-based, no login).
Tiny FastAPI + SQLite service. One row per name; we keep the player's best score.
Deployed on Railway. CORS open so the Capacitor app / itch page can call it."""
import os, re, sqlite3, time
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

DB = os.environ.get("DB_PATH", "/data/scores.db") if os.path.isdir("/data") else "scores.db"
app = FastAPI(title="Kingdom Guard Leaderboard")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

NAME_RE = re.compile(r"[^0-9A-Za-z가-힣 _.\-]")

def db():
    c = sqlite3.connect(DB)
    c.execute("""CREATE TABLE IF NOT EXISTS scores(
        name TEXT PRIMARY KEY, score INTEGER NOT NULL, level INTEGER NOT NULL DEFAULT 0,
        updated INTEGER NOT NULL)""")
    return c

class Score(BaseModel):
    name: str = Field(min_length=1, max_length=12)
    score: int = Field(ge=0, le=10_000_000)
    level: int = Field(default=0, ge=0, le=50)

def clean(name: str) -> str:
    name = NAME_RE.sub("", name).strip()
    return name[:12]

@app.get("/")
def health():
    return {"ok": True, "service": "kingdom-guard-leaderboard"}

@app.post("/score")
def submit(s: Score):
    name = clean(s.name)
    if not name:
        raise HTTPException(400, "invalid name")
    con = db()
    row = con.execute("SELECT score FROM scores WHERE name=?", (name,)).fetchone()
    best = s.score
    if row and row[0] >= s.score:
        best = row[0]
    else:
        con.execute("INSERT INTO scores(name,score,level,updated) VALUES(?,?,?,?) "
                    "ON CONFLICT(name) DO UPDATE SET score=excluded.score, level=excluded.level, updated=excluded.updated",
                    (name, s.score, s.level, int(time.time())))
        con.commit()
    rank = con.execute("SELECT COUNT(*)+1 FROM scores WHERE score>?", (best,)).fetchone()[0]
    con.close()
    return {"name": name, "best": best, "rank": rank}

@app.get("/top")
def top(limit: int = 50):
    limit = max(1, min(100, limit))
    con = db()
    rows = con.execute("SELECT name,score,level FROM scores ORDER BY score DESC, updated ASC LIMIT ?", (limit,)).fetchall()
    con.close()
    return [{"rank": i + 1, "name": r[0], "score": r[1], "level": r[2]} for i, r in enumerate(rows)]
