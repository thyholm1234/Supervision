"""SQLite storage. The server only ever stores ciphertext and minimal account metadata."""
import sqlite3
from contextlib import contextmanager
from datetime import date

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY,
    username        TEXT NOT NULL UNIQUE,
    kdf_salt        TEXT NOT NULL,
    kdf_iterations  INTEGER NOT NULL,
    auth_hash       BLOB NOT NULL,
    auth_hash_salt  BLOB NOT NULL,
    wrapped_dek     TEXT NOT NULL,
    dek_iv          TEXT NOT NULL,
    rec_salt        TEXT NOT NULL,
    rec_auth_hash   BLOB NOT NULL,
    rec_auth_salt   BLOB NOT NULL,
    rec_wrapped_dek TEXT NOT NULL,
    rec_dek_iv      TEXT NOT NULL,
    is_admin        INTEGER NOT NULL DEFAULT 0,
    created_day     TEXT NOT NULL,
    last_seen_day   TEXT NOT NULL,
    failed_logins   INTEGER NOT NULL DEFAULT 0,
    locked_until    REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash  BLOB PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created     REAL NOT NULL,
    last_used   REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS items (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id          TEXT NOT NULL,
    iv          TEXT NOT NULL,
    ct          TEXT NOT NULL,
    version     INTEGER NOT NULL,
    PRIMARY KEY (user_id, id)
);
CREATE TABLE IF NOT EXISTS recovery_tokens (
    token_hash  BLOB PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires     REAL NOT NULL
);
-- Encrypted attachments: iv || AES-GCM ciphertext of a padded file. Immutable once written.
CREATE TABLE IF NOT EXISTS blobs (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id          TEXT NOT NULL,
    data        BLOB NOT NULL,
    size        INTEGER NOT NULL,
    PRIMARY KEY (user_id, id)
);
-- Aggregate, non-identifying usage counters for the admin panel.
CREATE TABLE IF NOT EXISTS daily_stats (
    day         TEXT PRIMARY KEY,
    logins      INTEGER NOT NULL DEFAULT 0,
    signups     INTEGER NOT NULL DEFAULT 0,
    writes      INTEGER NOT NULL DEFAULT 0,
    failed      INTEGER NOT NULL DEFAULT 0,
    deletions   INTEGER NOT NULL DEFAULT 0
);
"""


def connect() -> sqlite3.Connection:
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    # One connection per request; it may be opened in a worker thread and used on the event loop (async endpoints).
    conn = sqlite3.connect(config.DB_PATH, timeout=10, isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA secure_delete = ON")
    return conn


def init() -> None:
    conn = connect()
    try:
        conn.executescript(SCHEMA)
    finally:
        conn.close()


@contextmanager
def tx(conn: sqlite3.Connection):
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise


def bump(conn: sqlite3.Connection, field: str, n: int = 1) -> None:
    assert field in {"logins", "signups", "writes", "failed", "deletions"}
    conn.execute(
        f"INSERT INTO daily_stats(day, {field}) VALUES (?, ?) "
        f"ON CONFLICT(day) DO UPDATE SET {field} = {field} + excluded.{field}",
        (date.today().isoformat(), n),
    )
