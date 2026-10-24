"""Runtime configuration, read from environment variables."""
import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
DATA_DIR = Path(os.environ.get("SUPERVISION_DATA_DIR", BASE_DIR / "data"))
DB_PATH = Path(os.environ.get("SUPERVISION_DB", DATA_DIR / "supervision.db"))

# Cookies are marked Secure unless explicitly disabled (only do that for local development over http).
COOKIE_SECURE = os.environ.get("SUPERVISION_COOKIE_SECURE", "1") != "0"
SESSION_MAX_HOURS = int(os.environ.get("SUPERVISION_SESSION_HOURS", "12"))
SESSION_IDLE_MINUTES = int(os.environ.get("SUPERVISION_IDLE_MINUTES", "60"))

# Client-side PBKDF2 iteration floor; the server refuses weaker key material parameters.
MIN_KDF_ITERATIONS = 600_000
MAX_ITEM_BYTES = 64 * 1024
MAX_ITEMS_PER_USER = 20_000
# Encrypted attachments (documentation files). Sizes are of the padded ciphertext.
MAX_BLOB_BYTES = int(os.environ.get("SUPERVISION_MAX_FILE_MB", "15")) * 1024 * 1024
MAX_USER_BLOB_BYTES = int(os.environ.get("SUPERVISION_QUOTA_MB", "250")) * 1024 * 1024
MAX_BLOBS_PER_USER = 1000


def _load_secret() -> bytes:
    """Server secret used only to derive decoy salts for unknown usernames."""
    env = os.environ.get("SUPERVISION_SECRET")
    if env:
        return env.encode()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / "server.secret"
    if not path.exists():
        path.write_bytes(secrets.token_bytes(32))
        path.chmod(0o600)
    return path.read_bytes()


SERVER_SECRET = _load_secret()
