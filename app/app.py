import json
import os
import re
import secrets
import string

import psycopg
import redis
from flask import Flask, jsonify, render_template, request
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool, PoolTimeout

app = Flask(__name__)

DATABASE_URL = os.environ["DATABASE_URL"]          # e.g. postgresql://user:pass@db:5432/vault
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
LORE_TTL = int(os.environ.get("LORE_CACHE_TTL", "60"))
ONLINE_WINDOW = 45                                  # seconds since last heartbeat = "in the campaign"
DICE = {"d4": 4, "d6": 6, "d8": 8, "d10": 10, "d12": 12, "d20": 20, "d100": 100}

pool = ConnectionPool(DATABASE_URL, min_size=1, max_size=5, kwargs={"row_factory": dict_row}, open=False)
cache = redis.Redis.from_url(REDIS_URL, decode_responses=True)


USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,40}$")
_bootstrapped = False


def _bootstrap():
    """Self-heal databases created by an older version of db/01-schema.sql (no users table yet)."""
    q("""CREATE TABLE IF NOT EXISTS users (
             username VARCHAR(40) PRIMARY KEY,
             display_name VARCHAR(80) NOT NULL DEFAULT '',
             created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())""", commit=True)
    q("""INSERT INTO users (username)
         SELECT owner FROM campaigns UNION SELECT username FROM members
         ON CONFLICT (username) DO NOTHING""", commit=True)


@app.before_request
def _open_pool():
    global _bootstrapped
    if pool.closed:
        try:
            pool.open(wait=True, timeout=5)
        except Exception:  # noqa: BLE001 — /health reports the DB as down instead of a 500
            pool.close()
            return
    if not _bootstrapped:
        try:
            _bootstrap()
            _bootstrapped = True
        except Exception:  # noqa: BLE001
            app.logger.exception("bootstrap failed")


@app.errorhandler(psycopg.OperationalError)
@app.errorhandler(PoolTimeout)
def _db_down(_e):
    return err("database is not reachable, check `docker compose ps`", 503)


def q(sql, params=(), one=False, commit=False):
    with pool.connection() as conn:
        cur = conn.execute(sql, params)
        rows = cur.fetchall() if cur.description else None
        if commit:
            conn.commit()
    if rows is None:
        return None
    return (rows[0] if rows else None) if one else rows


def err(message, status):
    return jsonify({"error": message}), status


def current_user():
    user = (request.headers.get("X-User") or "").strip()[:40]
    return user or None


def membership(campaign_id, user):
    if not user:
        return None
    return q("SELECT * FROM members WHERE campaign_id=%s AND username=%s", (campaign_id, user), one=True)


def ensure_user(user):
    q("INSERT INTO users (username) VALUES (%s) ON CONFLICT (username) DO NOTHING", (user,), commit=True)


def require_role(campaign_id, role):
    """Return (member, None) if the caller has `role` in this campaign, else (None, error_response)."""
    member = membership(campaign_id, current_user())
    if not member:
        return None, err("not a member of this campaign", 403)
    if role and member["role"] != role:
        label = "the Game Master" if role == "gm" else "players"
        return None, err(f"only {label} can do this", 403)
    return member, None


@app.errorhandler(psycopg.errors.UniqueViolation)
def _unique(_e):
    return err("already taken", 409)


@app.errorhandler(psycopg.errors.CheckViolation)
def _check(_e):
    return err("not allowed for this role", 403)


def lore_key(campaign_id):
    return f"lore:{campaign_id}"


def rolls_key(campaign_id):
    return f"rolls:{campaign_id}"


# ---------------------------------------------------------------- pages
@app.get("/")
def page_landing():
    return render_template("landing.html")


@app.get("/home")
def page_home():
    return render_template("home.html")


@app.get("/c/<int:campaign_id>/pick")
def page_pick(campaign_id):
    return render_template("pick.html", campaign_id=campaign_id)


@app.get("/c/<int:campaign_id>")
def page_campaign(campaign_id):
    return render_template("campaign.html", campaign_id=campaign_id)


# ---------------------------------------------------------------- health
@app.get("/health")
def health():
    status = {"app": "ok"}
    try:
        q("SELECT 1 AS ok", one=True)
        status["database"] = "ok"
    except Exception as e:  # noqa: BLE001
        status["database"] = f"error: {e.__class__.__name__}"
    try:
        cache.ping()
        status["cache"] = "ok"
    except Exception as e:  # noqa: BLE001
        status["cache"] = f"error: {e.__class__.__name__}"
    healthy = all(v == "ok" for v in status.values())
    return jsonify(status), (200 if healthy else 503)


# ---------------------------------------------------------------- login (demo: username only, no password)
@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username") or "").strip()
    signup = bool(data.get("signup"))
    if not USERNAME_RE.match(username):
        return err("username must be 3-40 letters, numbers or underscores", 400)
    exists = q("SELECT username FROM users WHERE username=%s", (username,), one=True)
    if signup:
        if exists:
            return err("that username is taken, use Log In instead", 409)
        q("INSERT INTO users (username) VALUES (%s)", (username,), commit=True)
        return jsonify({"username": username, "created": True}), 201
    if not exists:
        return err("no account with that username, use Sign Up first", 404)
    return jsonify({"username": username, "created": False}), 200


@app.get("/api/demo-accounts")
def demo_accounts():
    """Lists the seeded accounts (whatever names are in db/02-seed.sql) for the login dialog.
    Turn off with DEMO_MODE=false once real authentication is added."""
    if os.environ.get("DEMO_MODE", "true").lower() != "true":
        return jsonify([]), 200
    rows = q(
        """SELECT u.username,
                  COALESCE(json_agg(json_build_object('title', c.title, 'code', c.code, 'role', m.role)
                           ORDER BY m.role, c.id) FILTER (WHERE c.id IS NOT NULL), '[]') AS campaigns
           FROM users u
           LEFT JOIN members m ON m.username = u.username
           LEFT JOIN campaigns c ON c.id = m.campaign_id
           GROUP BY u.username, u.created_at
           ORDER BY bool_or(m.role = 'gm') DESC NULLS LAST, u.created_at, u.username
           LIMIT 12""",
    )
    for r in rows:                      # campaign codes are a GM secret; only show them on GM rows
        for c in r["campaigns"]:
            if c["role"] != "gm":
                c.pop("code", None)
    return jsonify(rows), 200


# ---------------------------------------------------------------- campaigns
@app.get("/api/campaigns")
def list_campaigns():
    user = current_user()
    if not user:
        return err("X-User header required", 401)
    rows = q(
        """SELECT c.id, c.code, c.title, c.owner, m.role, m.character_id
           FROM campaigns c JOIN members m ON m.campaign_id = c.id
           WHERE m.username = %s ORDER BY m.joined_at DESC""",
        (user,),
    )
    return jsonify(rows), 200


@app.post("/api/campaigns")
def create_campaign():
    user = current_user()
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()[:120]
    if not user:
        return err("X-User header required", 401)
    if not title:
        return err("title is required", 400)
    ensure_user(user)
    code = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))
    row = q(
        "INSERT INTO campaigns (code, title, owner) VALUES (%s, %s, %s) RETURNING id, code, title, owner",
        (code, title, user), one=True, commit=True,
    )
    q("INSERT INTO members (campaign_id, username, role) VALUES (%s, %s, 'gm')", (row["id"], user), commit=True)
    return jsonify({**row, "role": "gm"}), 201


@app.post("/api/join")
def join_campaign():
    user = current_user()
    code = ((request.get_json(silent=True) or {}).get("code") or "").strip().upper()
    if not user:
        return err("X-User header required", 401)
    camp = q("SELECT id, title FROM campaigns WHERE code=%s", (code,), one=True)
    if not camp:
        return err("campaign code not found", 404)
    ensure_user(user)
    existing = membership(camp["id"], user)
    if existing:
        return jsonify({"campaign_id": camp["id"], "role": existing["role"]}), 200
    q("INSERT INTO members (campaign_id, username, role) VALUES (%s, %s, 'player')", (camp["id"], user), commit=True)
    return jsonify({"campaign_id": camp["id"], "role": "player"}), 201


# ---------------------------------------------------------------- lore (Redis cache-aside)
@app.get("/api/campaigns/<int:campaign_id>/lore")
def get_lore(campaign_id):
    user = current_user()
    member = membership(campaign_id, user)
    if not member:
        return err("not a member of this campaign", 403)

    cached = cache.get(lore_key(campaign_id))
    if cached:
        lore, source = json.loads(cached), "cache"
    else:
        lore = q(
            "SELECT id, code, title, owner, summary, notes, map_url, map_public FROM campaigns WHERE id=%s",
            (campaign_id,), one=True,
        )
        if not lore:
            return err("campaign not found", 404)
        cache.setex(lore_key(campaign_id), LORE_TTL, json.dumps(lore))
        source = "database"

    is_gm = member["role"] == "gm"
    if not is_gm:                       # players only ever receive the summary (+ map if shared)
        lore.pop("notes", None)
        lore.pop("code", None)
        if not lore["map_public"]:
            lore["map_url"] = None
    lore.update({"role": member["role"], "character_id": member["character_id"], "source": source})
    return jsonify(lore), 200


@app.patch("/api/campaigns/<int:campaign_id>/lore")
def update_lore(campaign_id):
    _, denied = require_role(campaign_id, "gm")
    if denied:
        return denied
    data = request.get_json(silent=True) or {}
    allowed = {"title": str, "summary": str, "notes": str, "map_url": str, "map_public": bool}
    fields = {k: v for k, v in data.items() if k in allowed and isinstance(v, allowed[k])}
    if not fields:
        return err("nothing to update", 400)
    sets = ", ".join(f"{k} = %s" for k in fields)
    q(f"UPDATE campaigns SET {sets} WHERE id = %s", (*fields.values(), campaign_id), commit=True)
    cache.delete(lore_key(campaign_id))     # invalidate so the next GET reads fresh data
    return jsonify({"updated": list(fields)}), 200


# ---------------------------------------------------------------- characters
@app.get("/api/campaigns/<int:campaign_id>/characters")
def list_characters(campaign_id):
    member = membership(campaign_id, current_user())
    if not member:
        return err("not a member of this campaign", 403)
    rows = q(
        f"""SELECT ch.*, m.username AS player_name,
                   (m.last_seen IS NOT NULL AND m.last_seen > NOW() - INTERVAL '{ONLINE_WINDOW} seconds') AS online
            FROM characters ch
            LEFT JOIN members m ON m.character_id = ch.id AND m.campaign_id = ch.campaign_id
            WHERE ch.campaign_id = %s ORDER BY ch.kind, ch.id""",
        (campaign_id,),
    )
    if member["role"] != "gm":
        rows = [r for r in rows if r["kind"] != "MONSTER"]
    for r in rows:
        if r["kind"] != "PC":
            r["online"] = None          # status only exists for player characters
    return jsonify(rows), 200


@app.post("/api/campaigns/<int:campaign_id>/characters")
def create_character(campaign_id):
    user = current_user()
    member = membership(campaign_id, user)
    if not member:
        return err("not a member of this campaign", 403)
    data = request.get_json(silent=True) or {}
    kind = (data.get("kind") or "PC").upper()
    name = (data.get("name") or "").strip()[:80]
    if kind not in ("PC", "NPC", "MONSTER"):
        return err("kind must be PC, NPC or MONSTER", 400)
    if member["role"] != "gm" and kind != "PC":
        return err("players can only create PCs", 403)
    if not name:
        return err("name is required", 400)
    row = q(
        """INSERT INTO characters (campaign_id, kind, name, race, class_level, age, quote, image_url, created_by)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
        (campaign_id, kind, name, str(data.get("race", ""))[:40], str(data.get("class_level", ""))[:40],
         str(data.get("age", ""))[:20], str(data.get("quote", ""))[:160], str(data.get("image_url", "")),
         user),
        one=True, commit=True,
    )
    return jsonify(row), 201


@app.post("/api/campaigns/<int:campaign_id>/characters/<int:character_id>/claim")
def claim_character(campaign_id, character_id):
    user = current_user()
    _, denied = require_role(campaign_id, "player")      # the GM never claims a PC
    if denied:
        return denied
    ch = q("SELECT kind FROM characters WHERE id=%s AND campaign_id=%s", (character_id, campaign_id), one=True)
    if not ch or ch["kind"] != "PC":
        return err("player character not found", 404)
    taken = q("SELECT username FROM members WHERE campaign_id=%s AND character_id=%s AND username<>%s",
              (campaign_id, character_id, user), one=True)
    if taken:
        return err(f"already played by {taken['username']}", 409)
    q("UPDATE members SET character_id=%s, last_seen=NOW() WHERE campaign_id=%s AND username=%s",
      (character_id, campaign_id, user), commit=True)
    return jsonify({"character_id": character_id}), 200


@app.post("/api/campaigns/<int:campaign_id>/presence")
def presence(campaign_id):
    """Heartbeat from the dashboard every 20 s; online = heartbeat within the last 45 s."""
    user = current_user()
    if not membership(campaign_id, user):
        return err("not a member of this campaign", 403)
    online = (request.get_json(silent=True) or {}).get("online", True)
    q("UPDATE members SET last_seen = CASE WHEN %s THEN NOW() ELSE NULL END WHERE campaign_id=%s AND username=%s",
      (bool(online), campaign_id, user), commit=True)
    return "", 204


# ---------------------------------------------------------------- dice
@app.post("/api/campaigns/<int:campaign_id>/roll")
def roll(campaign_id):
    user = current_user()
    if not membership(campaign_id, user):
        return err("not a member of this campaign", 403)
    dice = ((request.get_json(silent=True) or {}).get("dice") or "").lower()
    if dice not in DICE:
        return err(f"dice must be one of {', '.join(DICE)}", 400)
    result = secrets.randbelow(DICE[dice]) + 1          # server-side roll, cannot be faked by the client
    row = q(
        """INSERT INTO rolls (campaign_id, username, dice, result) VALUES (%s,%s,%s,%s)
           RETURNING id, username, dice, result, created_at""",
        (campaign_id, user, dice, result), one=True, commit=True,
    )
    row["created_at"] = row["created_at"].isoformat()
    key = rolls_key(campaign_id)
    cache.lpush(key, json.dumps(row))
    cache.ltrim(key, 0, 14)                               # keep only the latest 15 in Redis
    return jsonify(row), 201


@app.get("/api/campaigns/<int:campaign_id>/recent-rolls")
def recent_rolls(campaign_id):
    if not membership(campaign_id, current_user()):
        return err("not a member of this campaign", 403)
    key = rolls_key(campaign_id)
    items = cache.lrange(key, 0, 14)
    if not items:                                         # cache cold (e.g. Redis restarted) -> rebuild
        rows = q("""SELECT id, username, dice, result, created_at FROM rolls
                    WHERE campaign_id=%s ORDER BY created_at DESC LIMIT 15""", (campaign_id,))
        for r in rows:
            r["created_at"] = r["created_at"].isoformat()
        if rows:
            cache.rpush(key, *[json.dumps(r) for r in rows])
        return jsonify(rows), 200
    return jsonify([json.loads(i) for i in items]), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")), debug=True)
