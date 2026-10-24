"""Supervisionsregnskab – zero-knowledge backend.

The browser derives all keys from the user's password. The server receives only:
  * an auth key (PBKDF2+HKDF output, re-hashed here with scrypt) used to prove knowledge of the password,
  * the data-encryption key wrapped with a password-derived key (and with a recovery-code-derived key),
  * opaque AES-GCM ciphertext items.
Nothing here can decrypt user data.
"""
import re
import sqlite3
import time
from contextlib import asynccontextmanager
from datetime import date, timedelta
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse, Response as RawResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from . import config, db
from .security import (
    b64d,
    decoy_salt,
    hash_auth_key,
    limiter,
    new_token,
    token_hash,
    verify_auth_key,
)

SESSION_COOKIE = "__Host-sid" if config.COOKIE_SECURE else "sid"
B64 = r"^[A-Za-z0-9_-]+$"
USERNAME_RE = re.compile(r"^[a-z0-9._-]{3,40}$")
ITEM_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init()
    yield


app = FastAPI(title="Supervisionsregnskab", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)


# ---------------------------------------------------------------- middleware

CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
    "connect-src 'self'; manifest-src 'self'; worker-src 'self'; font-src 'self'; "
    "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/") and request.method not in ("GET", "HEAD"):
        # CSRF defence in depth on top of SameSite=Strict: require a custom header (forces CORS preflight)
        # and, when present, a same-origin Origin header.
        if request.headers.get("x-requested-with") != "supervision":
            return JSONResponse({"detail": "Manglende header"}, status_code=403)
        origin = request.headers.get("origin")
        if origin and origin.split("://", 1)[-1] != request.headers.get("host"):
            return JSONResponse({"detail": "Ugyldig oprindelse"}, status_code=403)
    response = await call_next(request)
    h = response.headers
    h["Content-Security-Policy"] = CSP
    h["X-Content-Type-Options"] = "nosniff"
    h["X-Frame-Options"] = "DENY"
    h["Referrer-Policy"] = "no-referrer"
    h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    h["Cross-Origin-Opener-Policy"] = "same-origin"
    h["Cross-Origin-Resource-Policy"] = "same-origin"
    if config.COOKIE_SECURE:
        h["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    if path.startswith("/api/") or path in ("/", "/index.html", "/sw.js"):
        h["Cache-Control"] = "no-store"
    return response


# ---------------------------------------------------------------- dependencies

def get_conn():
    conn = db.connect()
    try:
        yield conn
    finally:
        conn.close()


Conn = Annotated[sqlite3.Connection, Depends(get_conn)]


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "?"


def rate_limit(key: tuple, limit: int, window_s: float) -> None:
    if not limiter.hit(key, limit, window_s):
        raise HTTPException(429, "For mange forsøg. Vent lidt og prøv igen.")


def current_user(request: Request, conn: Conn) -> sqlite3.Row:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(401, "Ikke logget ind")
    th = token_hash(token)
    row = conn.execute(
        "SELECT s.created, s.last_used, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
        (th,),
    ).fetchone()
    now = time.time()
    if (
        row is None
        or now - row["created"] > config.SESSION_MAX_HOURS * 3600
        or now - row["last_used"] > config.SESSION_IDLE_MINUTES * 60
    ):
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (th,))
        raise HTTPException(401, "Sessionen er udløbet")
    if now - row["last_used"] > 60:
        conn.execute("UPDATE sessions SET last_used = ? WHERE token_hash = ?", (now, th))
    today = date.today().isoformat()
    if row["last_seen_day"] != today:
        conn.execute("UPDATE users SET last_seen_day = ? WHERE id = ?", (today, row["id"]))
    return row


User = Annotated[sqlite3.Row, Depends(current_user)]


def admin_user(user: User) -> sqlite3.Row:
    if not user["is_admin"]:
        raise HTTPException(403, "Kun for administratorer")
    return user


def start_session(conn: sqlite3.Connection, response: Response, user_id: int) -> None:
    token, th = new_token()
    now = time.time()
    conn.execute("INSERT INTO sessions(token_hash, user_id, created, last_used) VALUES (?,?,?,?)", (th, user_id, now, now))
    conn.execute("DELETE FROM sessions WHERE created < ?", (now - config.SESSION_MAX_HOURS * 3600,))
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=config.SESSION_MAX_HOURS * 3600,
        httponly=True,
        secure=config.COOKIE_SECURE,
        samesite="strict",
        path="/",
    )


# ---------------------------------------------------------------- models

B64Str = Annotated[str, Field(pattern=B64, min_length=16, max_length=512)]


class UsernameIn(BaseModel):
    username: str

    @field_validator("username")
    @classmethod
    def norm(cls, v: str) -> str:
        v = v.strip().lower()
        if not USERNAME_RE.match(v):
            raise ValueError("Brugernavn: 3-40 tegn, a-z, 0-9, punktum, bindestreg eller understreg")
        return v


class KeyMaterial(BaseModel):
    salt: Annotated[str, Field(pattern=B64, min_length=16, max_length=64)]
    iterations: int = Field(ge=config.MIN_KDF_ITERATIONS, le=10_000_000)
    auth_key: B64Str
    wrapped_dek: B64Str
    dek_iv: Annotated[str, Field(pattern=B64, min_length=16, max_length=24)]


class SignupIn(UsernameIn, KeyMaterial):
    rec_salt: Annotated[str, Field(pattern=B64, min_length=16, max_length=64)]
    rec_auth_key: B64Str
    rec_wrapped_dek: B64Str
    rec_dek_iv: Annotated[str, Field(pattern=B64, min_length=16, max_length=24)]


class LoginIn(UsernameIn):
    auth_key: B64Str


class PasswordChangeIn(KeyMaterial):
    old_auth_key: B64Str


class RecoverStartIn(UsernameIn):
    rec_auth_key: B64Str


class RecoverFinishIn(KeyMaterial):
    token: Annotated[str, Field(min_length=20, max_length=100)]


class DeleteAccountIn(BaseModel):
    auth_key: B64Str


class ItemIn(BaseModel):
    iv: Annotated[str, Field(pattern=B64, min_length=16, max_length=24)]
    ct: Annotated[str, Field(pattern=B64, min_length=16, max_length=config.MAX_ITEM_BYTES)]
    version: int = Field(ge=0)  # expected current version; 0 = create


# ---------------------------------------------------------------- auth endpoints

def user_public(row: sqlite3.Row) -> dict:
    return {
        "username": row["username"],
        "is_admin": bool(row["is_admin"]),
        "salt": row["kdf_salt"],
        "iterations": row["kdf_iterations"],
        "wrapped_dek": row["wrapped_dek"],
        "dek_iv": row["dek_iv"],
    }


@app.post("/api/prelogin")
def prelogin(body: UsernameIn, request: Request, conn: Conn):
    rate_limit(("prelogin", client_ip(request)), 60, 300)
    row = conn.execute("SELECT kdf_salt, kdf_iterations FROM users WHERE username = ?", (body.username,)).fetchone()
    if row is None:
        return {"salt": decoy_salt(body.username, "login"), "iterations": config.MIN_KDF_ITERATIONS}
    return {"salt": row["kdf_salt"], "iterations": row["kdf_iterations"]}


@app.post("/api/prerecover")
def prerecover(body: UsernameIn, request: Request, conn: Conn):
    rate_limit(("prelogin", client_ip(request)), 60, 300)
    row = conn.execute("SELECT rec_salt FROM users WHERE username = ?", (body.username,)).fetchone()
    salt = row["rec_salt"] if row else decoy_salt(body.username, "recover")
    return {"salt": salt, "iterations": config.MIN_KDF_ITERATIONS}


@app.post("/api/signup")
def signup(body: SignupIn, request: Request, response: Response, conn: Conn):
    rate_limit(("signup", client_ip(request)), 5, 3600)
    auth_hash, auth_salt = hash_auth_key(b64d(body.auth_key))
    rec_hash, rec_salt = hash_auth_key(b64d(body.rec_auth_key))
    today = date.today().isoformat()
    with db.tx(conn):
        try:
            cur = conn.execute(
                """INSERT INTO users(username, kdf_salt, kdf_iterations, auth_hash, auth_hash_salt, wrapped_dek, dek_iv,
                   rec_salt, rec_auth_hash, rec_auth_salt, rec_wrapped_dek, rec_dek_iv, created_day, last_seen_day)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (body.username, body.salt, body.iterations, auth_hash, auth_salt, body.wrapped_dek, body.dek_iv,
                 body.rec_salt, rec_hash, rec_salt, body.rec_wrapped_dek, body.rec_dek_iv, today, today),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(409, "Brugernavnet er optaget")
        db.bump(conn, "signups")
        start_session(conn, response, cur.lastrowid)
        row = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return user_public(row)


@app.post("/api/login")
def login(body: LoginIn, request: Request, response: Response, conn: Conn):
    ip = client_ip(request)
    rate_limit(("login-ip", ip), 20, 300)
    rate_limit(("login-user", body.username), 10, 300)
    row = conn.execute("SELECT * FROM users WHERE username = ?", (body.username,)).fetchone()
    auth_key = b64d(body.auth_key)
    if row is None:
        hash_auth_key(auth_key)  # equalise timing with the real path
        with db.tx(conn):
            db.bump(conn, "failed")
        raise HTTPException(401, "Forkert brugernavn eller adgangskode")
    if row["locked_until"] > time.time():
        raise HTTPException(429, "Kontoen er midlertidigt låst efter for mange forkerte forsøg. Prøv igen om 15 minutter.")
    if not verify_auth_key(auth_key, row["auth_hash"], row["auth_hash_salt"]):
        failed = row["failed_logins"] + 1
        locked = time.time() + 15 * 60 if failed >= 10 else 0
        with db.tx(conn):
            conn.execute("UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?",
                         (0 if locked else failed, locked, row["id"]))
            db.bump(conn, "failed")
        raise HTTPException(401, "Forkert brugernavn eller adgangskode")
    with db.tx(conn):
        conn.execute("UPDATE users SET failed_logins = 0, locked_until = 0, last_seen_day = ? WHERE id = ?",
                     (date.today().isoformat(), row["id"]))
        db.bump(conn, "logins")
        start_session(conn, response, row["id"])
    return user_public(row)


@app.post("/api/logout")
def logout(request: Request, response: Response, conn: Conn):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))
    response.delete_cookie(SESSION_COOKIE, path="/", secure=config.COOKIE_SECURE, httponly=True, samesite="strict")
    return {"ok": True}


@app.get("/api/me")
def me(user: User):
    return user_public(user)


@app.post("/api/password")
def change_password(body: PasswordChangeIn, user: User, request: Request, response: Response, conn: Conn):
    rate_limit(("password", user["id"]), 10, 900)
    if not verify_auth_key(b64d(body.old_auth_key), user["auth_hash"], user["auth_hash_salt"]):
        raise HTTPException(401, "Den nuværende adgangskode er forkert")
    auth_hash, auth_salt = hash_auth_key(b64d(body.auth_key))
    with db.tx(conn):
        conn.execute(
            "UPDATE users SET kdf_salt=?, kdf_iterations=?, auth_hash=?, auth_hash_salt=?, wrapped_dek=?, dek_iv=? WHERE id=?",
            (body.salt, body.iterations, auth_hash, auth_salt, body.wrapped_dek, body.dek_iv, user["id"]),
        )
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))  # log out every device
        start_session(conn, response, user["id"])
    return {"ok": True}


@app.post("/api/recover/start")
def recover_start(body: RecoverStartIn, request: Request, conn: Conn):
    rate_limit(("recover-ip", client_ip(request)), 10, 900)
    rate_limit(("recover-user", body.username), 5, 900)
    row = conn.execute("SELECT * FROM users WHERE username = ?", (body.username,)).fetchone()
    rec_key = b64d(body.rec_auth_key)
    if row is None:
        hash_auth_key(rec_key)
        raise HTTPException(401, "Brugernavn eller gendannelseskode er forkert")
    if not verify_auth_key(rec_key, row["rec_auth_hash"], row["rec_auth_salt"]):
        raise HTTPException(401, "Brugernavn eller gendannelseskode er forkert")
    token, th = new_token()
    with db.tx(conn):
        conn.execute("DELETE FROM recovery_tokens WHERE expires < ?", (time.time(),))
        conn.execute("INSERT INTO recovery_tokens(token_hash, user_id, expires) VALUES (?,?,?)", (th, row["id"], time.time() + 600))
    return {"token": token, "rec_wrapped_dek": row["rec_wrapped_dek"], "rec_dek_iv": row["rec_dek_iv"]}


@app.post("/api/recover/finish")
def recover_finish(body: RecoverFinishIn, response: Response, conn: Conn):
    th = token_hash(body.token)
    row = conn.execute("SELECT user_id FROM recovery_tokens WHERE token_hash = ? AND expires > ?", (th, time.time())).fetchone()
    if row is None:
        raise HTTPException(401, "Gendannelsen er udløbet. Start forfra.")
    auth_hash, auth_salt = hash_auth_key(b64d(body.auth_key))
    with db.tx(conn):
        conn.execute("DELETE FROM recovery_tokens WHERE token_hash = ?", (th,))
        conn.execute(
            """UPDATE users SET kdf_salt=?, kdf_iterations=?, auth_hash=?, auth_hash_salt=?, wrapped_dek=?, dek_iv=?,
               failed_logins=0, locked_until=0 WHERE id=?""",
            (body.salt, body.iterations, auth_hash, auth_salt, body.wrapped_dek, body.dek_iv, row["user_id"]),
        )
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (row["user_id"],))
        db.bump(conn, "logins")
        start_session(conn, response, row["user_id"])
        user = conn.execute("SELECT * FROM users WHERE id = ?", (row["user_id"],)).fetchone()
    return user_public(user)


@app.post("/api/account/delete")
def delete_account(body: DeleteAccountIn, user: User, response: Response, conn: Conn):
    if not verify_auth_key(b64d(body.auth_key), user["auth_hash"], user["auth_hash_salt"]):
        raise HTTPException(401, "Forkert adgangskode")
    with db.tx(conn):
        conn.execute("DELETE FROM users WHERE id = ?", (user["id"],))
        db.bump(conn, "deletions")
    conn.execute("VACUUM")
    response.delete_cookie(SESSION_COOKIE, path="/", secure=config.COOKIE_SECURE, httponly=True, samesite="strict")
    return {"ok": True}


# ---------------------------------------------------------------- encrypted items

def check_item_id(item_id: str) -> None:
    if not ITEM_ID_RE.match(item_id):
        raise HTTPException(400, "Ugyldigt id")


@app.get("/api/items")
def list_items(user: User, conn: Conn):
    rows = conn.execute("SELECT id, iv, ct, version FROM items WHERE user_id = ?", (user["id"],)).fetchall()
    return [dict(r) for r in rows]


@app.put("/api/items/{item_id}")
def put_item(item_id: str, body: ItemIn, user: User, conn: Conn):
    check_item_id(item_id)
    rate_limit(("write", user["id"]), 600, 60)
    with db.tx(conn):
        cur = conn.execute("SELECT version FROM items WHERE user_id = ? AND id = ?", (user["id"], item_id)).fetchone()
        current = cur["version"] if cur else 0
        if current != body.version:
            raise HTTPException(409, {"message": "Posten er ændret på en anden enhed", "version": current})
        if cur is None:
            (count,) = conn.execute("SELECT COUNT(*) FROM items WHERE user_id = ?", (user["id"],)).fetchone()
            if count >= config.MAX_ITEMS_PER_USER:
                raise HTTPException(413, "Maksimalt antal poster nået")
            conn.execute("INSERT INTO items(user_id, id, iv, ct, version) VALUES (?,?,?,?,1)", (user["id"], item_id, body.iv, body.ct))
        else:
            conn.execute("UPDATE items SET iv=?, ct=?, version=version+1 WHERE user_id=? AND id=?", (body.iv, body.ct, user["id"], item_id))
        db.bump(conn, "writes")
    return {"version": current + 1}


@app.delete("/api/items/{item_id}")
def delete_item(item_id: str, user: User, conn: Conn):
    check_item_id(item_id)
    with db.tx(conn):
        conn.execute("DELETE FROM items WHERE user_id = ? AND id = ?", (user["id"], item_id))
        db.bump(conn, "writes")
    return {"ok": True}


# ---------------------------------------------------------------- encrypted attachments

BLOB_MIN = 12 + 16  # iv + GCM tag


@app.put("/api/blobs/{blob_id}")
async def put_blob(blob_id: str, request: Request, user: User, conn: Conn):
    """Store an encrypted file (iv || ciphertext). The server never sees the name, type or content."""
    check_item_id(blob_id)
    rate_limit(("blob", user["id"]), 120, 3600)
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > config.MAX_BLOB_BYTES:
        raise HTTPException(413, "Filen er for stor")
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > config.MAX_BLOB_BYTES:
            raise HTTPException(413, "Filen er for stor")
        chunks.append(chunk)
    if size < BLOB_MIN:
        raise HTTPException(400, "Ugyldige data")
    with db.tx(conn):
        if conn.execute("SELECT 1 FROM blobs WHERE user_id = ? AND id = ?", (user["id"], blob_id)).fetchone():
            raise HTTPException(409, "Filen findes allerede")
        count, used = conn.execute("SELECT COUNT(*), COALESCE(SUM(size), 0) FROM blobs WHERE user_id = ?", (user["id"],)).fetchone()
        if count >= config.MAX_BLOBS_PER_USER or used + size > config.MAX_USER_BLOB_BYTES:
            raise HTTPException(413, "Din lagerplads til dokumenter er brugt op")
        conn.execute("INSERT INTO blobs(user_id, id, data, size) VALUES (?,?,?,?)", (user["id"], blob_id, b"".join(chunks), size))
        db.bump(conn, "writes")
    return {"ok": True, "size": size}


@app.get("/api/blobs/{blob_id}")
def get_blob(blob_id: str, user: User, conn: Conn):
    check_item_id(blob_id)
    row = conn.execute("SELECT data FROM blobs WHERE user_id = ? AND id = ?", (user["id"], blob_id)).fetchone()
    if row is None:
        raise HTTPException(404, "Filen findes ikke")
    return RawResponse(row["data"], media_type="application/octet-stream")


@app.delete("/api/blobs/{blob_id}")
def delete_blob(blob_id: str, user: User, conn: Conn):
    check_item_id(blob_id)
    with db.tx(conn):
        conn.execute("DELETE FROM blobs WHERE user_id = ? AND id = ?", (user["id"], blob_id))
        db.bump(conn, "writes")
    return {"ok": True}


@app.get("/api/storage")
def storage(user: User, conn: Conn):
    count, used = conn.execute("SELECT COUNT(*), COALESCE(SUM(size), 0) FROM blobs WHERE user_id = ?", (user["id"],)).fetchone()
    return {"files": count, "bytes": used, "quota": config.MAX_USER_BLOB_BYTES, "max_file": config.MAX_BLOB_BYTES}


# ---------------------------------------------------------------- admin (aggregates only)

@app.get("/api/admin/stats")
def admin_stats(_admin: Annotated[sqlite3.Row, Depends(admin_user)], conn: Conn):
    today = date.today()

    def since(days: int) -> str:
        return (today - timedelta(days=days)).isoformat()

    one = lambda sql, *a: conn.execute(sql, a).fetchone()[0]  # noqa: E731
    users_total = one("SELECT COUNT(*) FROM users")
    per_user = conn.execute(
        "SELECT u.id, COUNT(i.id) AS n, COALESCE(SUM(LENGTH(i.ct)), 0) AS bytes FROM users u LEFT JOIN items i ON i.user_id = u.id GROUP BY u.id"
    ).fetchall()
    buckets = {"0": 0, "1-49": 0, "50-199": 0, "200-499": 0, "500+": 0}
    for r in per_user:
        n = r["n"]
        key = "0" if n == 0 else "1-49" if n < 50 else "50-199" if n < 200 else "200-499" if n < 500 else "500+"
        buckets[key] += 1
    daily = [dict(r) for r in conn.execute("SELECT * FROM daily_stats WHERE day >= ? ORDER BY day", (since(89),))]
    weekly_signups = [
        dict(r) for r in conn.execute(
            "SELECT strftime('%Y-W%W', created_day) AS week, COUNT(*) AS n FROM users WHERE created_day >= ? GROUP BY week ORDER BY week",
            (since(7 * 26),),
        )
    ]
    return {
        "users_total": users_total,
        "active_1d": one("SELECT COUNT(*) FROM users WHERE last_seen_day >= ?", today.isoformat()),
        "active_7d": one("SELECT COUNT(*) FROM users WHERE last_seen_day >= ?", since(6)),
        "active_30d": one("SELECT COUNT(*) FROM users WHERE last_seen_day >= ?", since(29)),
        "dormant_180d": one("SELECT COUNT(*) FROM users WHERE last_seen_day < ?", since(180)),
        "new_30d": one("SELECT COUNT(*) FROM users WHERE created_day >= ?", since(29)),
        "items_total": sum(r["n"] for r in per_user),
        "bytes_total": sum(r["bytes"] for r in per_user),
        "items_median": sorted(r["n"] for r in per_user)[len(per_user) // 2] if per_user else 0,
        "item_buckets": buckets,
        "files_total": one("SELECT COUNT(*) FROM blobs"),
        "file_bytes_total": one("SELECT COALESCE(SUM(size), 0) FROM blobs"),
        "sessions_open": one("SELECT COUNT(*) FROM sessions WHERE last_used > ?", time.time() - config.SESSION_IDLE_MINUTES * 60),
        "daily": daily,
        "weekly_signups": weekly_signups,
        "db_bytes": config.DB_PATH.stat().st_size if config.DB_PATH.exists() else 0,
    }


@app.get("/api/health")
def health():
    return {"ok": True}


# ---------------------------------------------------------------- static PWA

@app.get("/")
def index():
    return FileResponse(config.STATIC_DIR / "index.html")


@app.get("/sw.js")
def service_worker():
    return FileResponse(config.STATIC_DIR / "sw.js", media_type="text/javascript", headers={"Service-Worker-Allowed": "/"})


@app.get("/manifest.webmanifest")
def manifest():
    return FileResponse(config.STATIC_DIR / "manifest.webmanifest", media_type="application/manifest+json")


app.mount("/static", StaticFiles(directory=config.STATIC_DIR), name="static")
