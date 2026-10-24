"""Hashing of client-derived auth keys, session tokens and a small in-memory rate limiter."""
import base64
import hashlib
import hmac
import secrets
import threading
import time
from collections import defaultdict, deque

from . import config

# scrypt parameters for hashing the (already PBKDF2-stretched) client auth key.
_SCRYPT = dict(n=2**14, r=8, p=1, maxmem=64 * 1024 * 1024, dklen=32)


def b64d(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def b64e(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def hash_auth_key(auth_key: bytes, salt: bytes | None = None) -> tuple[bytes, bytes]:
    salt = salt or secrets.token_bytes(16)
    return hashlib.scrypt(auth_key, salt=salt, **_SCRYPT), salt


def verify_auth_key(auth_key: bytes, stored_hash: bytes, salt: bytes) -> bool:
    candidate, _ = hash_auth_key(auth_key, salt)
    return hmac.compare_digest(candidate, stored_hash)


def decoy_salt(username: str, purpose: str) -> str:
    """Deterministic fake salt so unknown usernames look identical to real ones."""
    digest = hmac.new(config.SERVER_SECRET, f"{purpose}:{username}".encode(), hashlib.sha256).digest()
    return b64e(digest[:16])


def new_token() -> tuple[str, bytes]:
    token = secrets.token_urlsafe(32)
    return token, token_hash(token)


def token_hash(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


class RateLimiter:
    """Sliding-window limiter. Adequate for a single-process, low-traffic deployment."""

    def __init__(self):
        self._hits: dict[tuple, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: tuple, limit: int, window_s: float) -> bool:
        """Record an attempt; return False if the limit is exceeded."""
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and q[0] <= now - window_s:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            if len(self._hits) > 50_000:  # bound memory under abuse
                self._hits.clear()
            return True


limiter = RateLimiter()
