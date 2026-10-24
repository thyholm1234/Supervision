"""Administration CLI.

    python -m server.manage make-admin <brugernavn>
    python -m server.manage revoke-admin <brugernavn>
    python -m server.manage purge-sessions
"""
import sys

from . import db


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 1
    db.init()
    conn = db.connect()
    cmd, *args = argv
    if cmd in ("make-admin", "revoke-admin") and len(args) == 1:
        cur = conn.execute("UPDATE users SET is_admin = ? WHERE username = ?", (int(cmd == "make-admin"), args[0].lower()))
        if cur.rowcount == 0:
            print(f"Ukendt bruger: {args[0]}")
            return 1
        print("OK")
    elif cmd == "purge-sessions":
        conn.execute("DELETE FROM sessions")
        print("Alle sessioner er afsluttet")
    else:
        print(__doc__)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
