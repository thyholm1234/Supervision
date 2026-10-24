import base64
import os
import secrets
import sqlite3
import tempfile

import pytest

_tmp = tempfile.mkdtemp()
os.environ["SUPERVISION_DATA_DIR"] = _tmp
os.environ["SUPERVISION_DB"] = os.path.join(_tmp, "test.db")
os.environ["SUPERVISION_COOKIE_SECURE"] = "0"

from fastapi.testclient import TestClient  # noqa: E402

from server import db, main  # noqa: E402
from server.security import limiter  # noqa: E402

H = {"X-Requested-With": "supervision"}


def b64(n=32):
    return base64.urlsafe_b64encode(secrets.token_bytes(n)).rstrip(b"=").decode()


def material():
    return {"salt": b64(16), "iterations": 600_000, "auth_key": b64(), "wrapped_dek": b64(40), "dek_iv": b64(12)}


@pytest.fixture()
def client():
    limiter._hits.clear()
    with TestClient(main.app) as c:
        yield c


def signup(client, username=None):
    username = username or f"user{secrets.token_hex(4)}"
    m = material()
    body = {"username": username, **m, "rec_salt": b64(16), "rec_auth_key": b64(), "rec_wrapped_dek": b64(40), "rec_dek_iv": b64(12)}
    r = client.post("/api/signup", json=body, headers=H)
    assert r.status_code == 200, r.text
    return username, body


def test_security_headers(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "script-src 'self'" in r.headers["content-security-policy"]
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["referrer-policy"] == "no-referrer"


def test_csrf_header_required(client):
    r = client.post("/api/prelogin", json={"username": "abc"})
    assert r.status_code == 403
    r = client.post("/api/prelogin", json={"username": "abc"}, headers={**H, "Origin": "https://evil.example"})
    assert r.status_code == 403


def test_signup_login_flow(client):
    username, body = signup(client)
    assert client.get("/api/me").json()["username"] == username
    client.post("/api/logout", headers=H)
    assert client.get("/api/me").status_code == 401
    pre = client.post("/api/prelogin", json={"username": username}, headers=H).json()
    assert pre["salt"] == body["salt"]
    bad = client.post("/api/login", json={"username": username, "auth_key": b64()}, headers=H)
    assert bad.status_code == 401
    ok = client.post("/api/login", json={"username": username, "auth_key": body["auth_key"]}, headers=H)
    assert ok.status_code == 200
    assert ok.json()["wrapped_dek"] == body["wrapped_dek"]


def test_server_stores_no_plain_auth_key(client):
    username, body = signup(client)
    conn = sqlite3.connect(os.environ["SUPERVISION_DB"])
    row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    dump = repr(row)
    assert body["auth_key"] not in dump and body["rec_auth_key"] not in dump


def test_unknown_user_gets_stable_decoy_salt(client):
    a = client.post("/api/prelogin", json={"username": "ghost"}, headers=H).json()
    b = client.post("/api/prelogin", json={"username": "ghost"}, headers=H).json()
    assert a == b and len(a["salt"]) >= 16


def test_duplicate_username(client):
    username, _ = signup(client)
    client.post("/api/logout", headers=H)
    m = material()
    body = {"username": username, **m, "rec_salt": b64(16), "rec_auth_key": b64(), "rec_wrapped_dek": b64(40), "rec_dek_iv": b64(12)}
    assert client.post("/api/signup", json=body, headers=H).status_code == 409


def test_weak_kdf_rejected(client):
    m = material()
    m["iterations"] = 1000
    body = {"username": "weakling", **m, "rec_salt": b64(16), "rec_auth_key": b64(), "rec_wrapped_dek": b64(40), "rec_dek_iv": b64(12)}
    assert client.post("/api/signup", json=body, headers=H).status_code == 422


def test_items_crud_and_conflict(client):
    signup(client)
    item = {"iv": b64(12), "ct": b64(100), "version": 0}
    r = client.put("/api/items/abcdefgh12", json=item, headers=H)
    assert r.json() == {"version": 1}
    assert client.put("/api/items/abcdefgh12", json=item, headers=H).status_code == 409  # stale version
    r = client.put("/api/items/abcdefgh12", json={**item, "version": 1}, headers=H)
    assert r.json() == {"version": 2}
    items = client.get("/api/items").json()
    assert len(items) == 1 and items[0]["version"] == 2
    assert client.delete("/api/items/abcdefgh12", headers=H).status_code == 200
    assert client.get("/api/items").json() == []
    assert client.put("/api/items/bad id!", json=item, headers=H).status_code in (400, 404)


def test_items_are_isolated_between_users(client):
    signup(client)
    client.put("/api/items/item000001", json={"iv": b64(12), "ct": b64(50), "version": 0}, headers=H)
    client.post("/api/logout", headers=H)
    signup(client)
    assert client.get("/api/items").json() == []
    # same id for another user must not collide or leak
    r = client.put("/api/items/item000001", json={"iv": b64(12), "ct": b64(50), "version": 0}, headers=H)
    assert r.json() == {"version": 1}


def test_password_change_logs_out_other_sessions(client):
    username, body = signup(client)
    other = TestClient(main.app)
    other.post("/api/login", json={"username": username, "auth_key": body["auth_key"]}, headers=H)
    assert other.get("/api/me").status_code == 200
    new = material()
    r = client.post("/api/password", json={"old_auth_key": body["auth_key"], **new}, headers=H)
    assert r.status_code == 200
    assert client.get("/api/me").json()["salt"] == new["salt"]
    assert other.get("/api/me").status_code == 401
    client.post("/api/logout", headers=H)
    assert client.post("/api/login", json={"username": username, "auth_key": new["auth_key"]}, headers=H).status_code == 200


def test_recovery(client):
    username, body = signup(client)
    client.post("/api/logout", headers=H)
    assert client.post("/api/recover/start", json={"username": username, "rec_auth_key": b64()}, headers=H).status_code == 401
    start = client.post("/api/recover/start", json={"username": username, "rec_auth_key": body["rec_auth_key"]}, headers=H).json()
    assert start["rec_wrapped_dek"] == body["rec_wrapped_dek"]
    new = material()
    r = client.post("/api/recover/finish", json={"token": start["token"], **new}, headers=H)
    assert r.status_code == 200
    # token is single-use
    assert client.post("/api/recover/finish", json={"token": start["token"], **new}, headers=H).status_code == 401


def test_lockout_after_failed_logins(client):
    username, body = signup(client)
    client.post("/api/logout", headers=H)
    for _ in range(10):
        client.post("/api/login", json={"username": username, "auth_key": b64()}, headers=H)
    r = client.post("/api/login", json={"username": username, "auth_key": body["auth_key"]}, headers=H)
    assert r.status_code == 429


def test_admin_stats_requires_admin_and_is_aggregate(client):
    username, _ = signup(client)
    assert client.get("/api/admin/stats").status_code == 403
    conn = db.connect()
    conn.execute("UPDATE users SET is_admin = 1 WHERE username = ?", (username,))
    conn.close()
    r = client.get("/api/admin/stats")
    assert r.status_code == 200
    data = r.json()
    assert data["users_total"] >= 1
    assert username not in r.text


def test_delete_account(client):
    username, body = signup(client)
    client.put("/api/items/zzzzzzzz01", json={"iv": b64(12), "ct": b64(50), "version": 0}, headers=H)
    assert client.post("/api/account/delete", json={"auth_key": b64()}, headers=H).status_code == 401
    assert client.post("/api/account/delete", json={"auth_key": body["auth_key"]}, headers=H).status_code == 200
    conn = db.connect()
    assert conn.execute("SELECT COUNT(*) FROM users WHERE username = ?", (username,)).fetchone()[0] == 0
    conn.close()


def test_blob_roundtrip_isolation_and_limits(client):
    signup(client)
    data = secrets.token_bytes(70_000)
    r = client.put("/api/blobs/blobAAAA1111", content=data, headers={**H, "Content-Type": "application/octet-stream"})
    assert r.status_code == 200, r.text
    assert client.get("/api/blobs/blobAAAA1111").content == data
    # immutable: second write with the same id is refused
    assert client.put("/api/blobs/blobAAAA1111", content=data, headers=H).status_code == 409
    # too small to be iv + tag
    assert client.put("/api/blobs/blobBBBB2222", content=b"x" * 10, headers=H).status_code == 400
    # CSRF header required
    assert client.put("/api/blobs/blobCCCC3333", content=data).status_code == 403
    st = client.get("/api/storage").json()
    assert st["files"] == 1 and st["bytes"] == len(data)

    # another user cannot read it
    client.cookies.clear()
    signup(client)
    assert client.get("/api/blobs/blobAAAA1111").status_code == 404
    assert client.get("/api/storage").json()["files"] == 0


def test_blob_size_limit_and_delete(client, monkeypatch):
    signup(client)
    monkeypatch.setattr(main.config, "MAX_BLOB_BYTES", 1000)
    assert client.put("/api/blobs/blobDDDD4444", content=b"y" * 1001, headers=H).status_code == 413
    assert client.put("/api/blobs/blobDDDD4444", content=b"y" * 1000, headers=H).status_code == 200
    monkeypatch.setattr(main.config, "MAX_USER_BLOB_BYTES", 1500)
    assert client.put("/api/blobs/blobEEEE5555", content=b"z" * 600, headers=H).status_code == 413
    assert client.delete("/api/blobs/blobDDDD4444", headers=H).status_code == 200
    assert client.get("/api/blobs/blobDDDD4444").status_code == 404
    assert client.put("/api/blobs/blobEEEE5555", content=b"z" * 600, headers=H).status_code == 200


def test_blobs_removed_with_account(client):
    _, body = signup(client)
    client.put("/api/blobs/blobFFFF6666", content=b"q" * 100, headers=H)
    assert client.post("/api/account/delete", json={"auth_key": body["auth_key"]}, headers=H).status_code == 200
    conn = db.connect()
    try:
        assert conn.execute("SELECT COUNT(*) FROM blobs WHERE id = 'blobFFFF6666'").fetchone()[0] == 0
    finally:
        conn.close()
