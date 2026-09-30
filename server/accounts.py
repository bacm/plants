"""Accounts, passwords and credentials (ticket 098).

Lives in the same SQLite file as the sync store (SYNC_DB_PATH), in its own
tables. Like sync_store, all SQL here is fixed text and client input only
travels as bound parameters, and every operation opens its own connection
(FastAPI runs sync endpoints in a thread pool).

Secrets: passwords are stored as scrypt hashes with a per-account salt, and
login tokens (session cookie or device token) are stored only as a SHA-256
hash, so a leaked database file does not hand out working credentials. A
token is 32 random bytes, so a fast hash is enough for it (unlike a password).

Account lifecycle: signup creates a `pending` account that cannot do anything
until an admin sets it to `approved` (admin screen, /admin/* routes, or the
command line below). Allowed moves are in TRANSITIONS. Refused accounts are
deleted 30 days after the decision (`purge_refused`). The first admin is
created with the command line, not through signup.

Usage on the server:
    docker compose exec api python -m accounts create-admin --email you@example.com
    docker compose exec api python -m accounts list
    docker compose exec api python -m accounts approve --email them@example.com
    (also refuse, disable, enable, reset-password, purge)
"""

import argparse
import getpass
import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import sys
import uuid
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

SYNC_DB_PATH_DEFAULT = "data/garden.db"

# scrypt cost. 2**15 (about 32 MiB of memory, roughly 100 ms) is the
# production value. The SCRYPT_N environment variable lowers it, read when an
# AccountStore is created, and exists only so the test suite is not slow:
# never set it on the server.
SCRYPT_N_DEFAULT = 2**15
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_MAXMEM = 64 * 1024 * 1024
SALT_BYTES = 16
HASH_BYTES = 32

MIN_PASSWORD_LENGTH = 12
# Longer passwords are rejected before hashing: scrypt on a huge input is a
# cheap way to burn the server's CPU.
MAX_PASSWORD_LENGTH = 256
MAX_EMAIL_LENGTH = 254
EMAIL_SHAPE = re.compile(r"^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$")

STATUSES = ("pending", "approved", "refused", "disabled")

# Per-account lockout: after the 5th consecutive failure the account is locked
# for 1 minute, doubling with each further failure, capped at 1 hour.
LOCK_AFTER_FAILURES = 5
LOCK_BASE_SECONDS = 60
LOCK_MAX_SECONDS = 3600

SESSION_LIFETIME = timedelta(days=30)
# Writing last_used_at on every request would turn each read into a write.
LAST_USED_GRANULARITY = timedelta(minutes=1)

TIME_FORMAT = "%Y-%m-%dT%H:%M:%SZ"

SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash BLOB,
    salt BLOB,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'refused', 'disabled')),
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT,
    decided_at TEXT
);
-- Lockout state per normalized email, for every well-formed email whether or
-- not an account exists, so a lockout never reveals that an address is
-- registered. Keyed by a hash so the table holds no raw addresses.
CREATE TABLE IF NOT EXISTS login_throttle (
    email_key TEXT PRIMARY KEY,
    failed INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT
);
CREATE TABLE IF NOT EXISTS credentials (
    token_hash TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    kind TEXT CHECK (kind IN ('session', 'device')),
    label TEXT,
    created_at TEXT,
    last_used_at TEXT,
    expires_at TEXT,
    revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS credentials_account ON credentials (account_id);
"""

ACCOUNT_COLUMNS = "id, email, status, is_admin"

# action -> (statuses it may start from, status it leads to)
TRANSITIONS = {
    "approve": (("pending", "refused"), "approved"),
    "refuse": (("pending",), "refused"),
    "disable": (("approved",), "disabled"),
    "enable": (("disabled",), "approved"),
}
# Actions that end an account's access: its credentials are revoked with them.
REVOKING_ACTIONS = ("refuse", "disable")
REFUSED_RETENTION = timedelta(days=30)
# No 0/O/1/l/I: a temporary password is read out or typed from a message.
TEMP_PASSWORD_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
TEMP_PASSWORD_LENGTH = 16


class AccountError(ValueError):
    """Invalid input or a conflict; the message is safe to show to the caller."""


class AccountNotFound(AccountError):
    """No account with that id."""


class AccountConflict(AccountError):
    """The action is not allowed in the account's current state."""


def utcnow():
    return datetime.now(timezone.utc)


def _stamp(moment):
    return moment.astimezone(timezone.utc).strftime(TIME_FORMAT)


def _parse(stamp):
    return datetime.strptime(stamp, TIME_FORMAT).replace(tzinfo=timezone.utc)


def normalize_email(email):
    """Lowercased, stripped address, or None if it does not look like one."""
    if not isinstance(email, str):
        return None
    cleaned = email.strip().lower()
    if len(cleaned) > MAX_EMAIL_LENGTH or not EMAIL_SHAPE.match(cleaned):
        return None
    return cleaned


def password_problem(password):
    """A French message if the password is unacceptable, else None."""
    if not isinstance(password, str) or not (
        MIN_PASSWORD_LENGTH <= len(password) <= MAX_PASSWORD_LENGTH
    ):
        return (
            f"Le mot de passe doit contenir entre {MIN_PASSWORD_LENGTH} "
            f"et {MAX_PASSWORD_LENGTH} caractères."
        )
    return None


def hash_token(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _account(row):
    return {"id": row[0], "email": row[1], "status": row[2], "isAdmin": bool(row[3])}


@dataclass
class LoginResult:
    """Outcome of verify_login: ok, bad_credentials, locked or not_approved.

    `account_id` is set whenever the email matched an account, so the caller
    can log it (never the raw email) even for a rejection.
    """

    outcome: str
    account: dict | None = None
    account_id: str | None = None
    until: datetime | None = None
    status: str | None = None


class AccountStore:
    def __init__(self, path, scrypt_n=None):
        self.path = str(path)
        if scrypt_n is None:
            scrypt_n = int(os.environ.get("SCRYPT_N") or SCRYPT_N_DEFAULT)
        self.scrypt_n = scrypt_n
        # Hashed against when the email is unknown, so an unknown email costs
        # the same time as a wrong password.
        self._dummy_salt = b"\x00" * SALT_BYTES
        parent = os.path.dirname(os.path.abspath(self.path))
        os.makedirs(parent, exist_ok=True)
        with closing(self._connect()) as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(SCHEMA)

    def _connect(self):
        return sqlite3.connect(self.path, timeout=30, isolation_level=None)

    def _hash(self, password, salt):
        return hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=self.scrypt_n,
            r=SCRYPT_R,
            p=SCRYPT_P,
            maxmem=SCRYPT_MAXMEM,
            dklen=HASH_BYTES,
        )

    def _insert(self, email, password, status, is_admin, now):
        email = normalize_email(email)
        if email is None:
            raise AccountError("Adresse e-mail invalide.")
        problem = password_problem(password)
        if problem:
            raise AccountError(problem)
        salt = secrets.token_bytes(SALT_BYTES)
        stamp = _stamp(now)
        try:
            with closing(self._connect()) as conn:
                conn.execute(
                    "INSERT INTO accounts (id, email, password_hash, salt, status, is_admin, "
                    "created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        str(uuid.uuid4()),
                        email,
                        self._hash(password, salt),
                        salt,
                        status,
                        1 if is_admin else 0,
                        stamp,
                        stamp if status == "approved" else None,
                    ),
                )
        except sqlite3.IntegrityError:
            # The UNIQUE email constraint: also what makes two simultaneous
            # signups for one address safe.
            return False
        return True

    def create_pending(self, email, password, now=None):
        """Create a pending account. False if the email already exists."""
        return self._insert(email, password, "pending", False, now or utcnow())

    def create_admin(self, email, password, now=None):
        """Create an approved admin. Raises AccountError if the email exists."""
        if not self._insert(email, password, "approved", True, now or utcnow()):
            raise AccountError("Un compte existe déjà avec cette adresse e-mail.")

    def count_pending(self):
        with closing(self._connect()) as conn:
            return conn.execute("SELECT COUNT(*) FROM accounts WHERE status = 'pending'").fetchone()[0]

    def set_status(self, account_id, status, now=None):
        """Set a status unconditionally (no transition rules). Tests only; use transition()."""
        if status not in STATUSES:
            raise AccountError("Statut inconnu.")
        with closing(self._connect()) as conn:
            conn.execute(
                "UPDATE accounts SET status = ?, decided_at = ? WHERE id = ?",
                (status, _stamp(now or utcnow()), account_id),
            )

    def list_accounts(self):
        """Every account, pending first (oldest request first), then by email."""
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT id, email, status, is_admin, created_at, decided_at FROM accounts "
                "ORDER BY status != 'pending', "
                "CASE WHEN status = 'pending' THEN created_at END, email"
            ).fetchall()
        return [
            {**_account(row[:4]), "createdAt": row[4], "decidedAt": row[5]} for row in rows
        ]

    def find_id(self, email):
        """The id of the account with that email, else raises AccountNotFound."""
        with closing(self._connect()) as conn:
            row = conn.execute(
                "SELECT id FROM accounts WHERE email = ?", (normalize_email(email),)
            ).fetchone()
        if row is None:
            raise AccountNotFound("Aucun compte avec cette adresse e-mail.")
        return row[0]

    def _get(self, conn, account_id):
        row = conn.execute(
            "SELECT id, email, status, is_admin FROM accounts WHERE id = ?", (account_id,)
        ).fetchone()
        if row is None:
            raise AccountNotFound("Compte introuvable.")
        return _account(row)

    def transition(self, account_id, action, acting_id=None, now=None):
        """Apply approve/refuse/disable/enable. Raises AccountNotFound or AccountConflict.

        An admin cannot refuse or disable their own account. Refusing or
        disabling revokes every credential of the account.
        """
        if action not in TRANSITIONS:
            raise AccountError("Action inconnue.")
        sources, target = TRANSITIONS[action]
        now = now or utcnow()
        with closing(self._connect()) as conn:
            account = self._get(conn, account_id)
            if action in REVOKING_ACTIONS and account_id == acting_id:
                raise AccountConflict("Vous ne pouvez pas désactiver votre propre compte.")
            if account["status"] not in sources:
                raise AccountConflict("Cette action n'est pas possible pour ce compte.")
            # Guarded on the old status too, so two admins racing cannot both win.
            changed = conn.execute(
                "UPDATE accounts SET status = ?, decided_at = ? WHERE id = ? AND status = ?",
                (target, _stamp(now), account_id, account["status"]),
            ).rowcount
            if not changed:
                raise AccountConflict("Cette action n'est pas possible pour ce compte.")
        if action in REVOKING_ACTIONS:
            self.revoke_account_credentials(account_id, now)

    def revoke_account_credentials(self, account_id, now=None):
        """Revoke every session and device token of an account."""
        with closing(self._connect()) as conn:
            self._get(conn, account_id)
            conn.execute(
                "UPDATE credentials SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL",
                (_stamp(now or utcnow()), account_id),
            )

    def reset_password(self, account_id, now=None):
        """Set a random temporary password, revoke all credentials, return the password.

        The password is returned once and stored only as a hash. The email's
        login lockout is cleared so the person can use it straight away.
        """
        temporary = "".join(
            secrets.choice(TEMP_PASSWORD_ALPHABET) for _ in range(TEMP_PASSWORD_LENGTH)
        )
        salt = secrets.token_bytes(SALT_BYTES)
        with closing(self._connect()) as conn:
            account = self._get(conn, account_id)
            conn.execute(
                "UPDATE accounts SET password_hash = ?, salt = ? WHERE id = ?",
                (self._hash(temporary, salt), salt, account_id),
            )
            conn.execute(
                "DELETE FROM login_throttle WHERE email_key = ?", (hash_token(account["email"]),)
            )
        self.revoke_account_credentials(account_id, now)
        return temporary

    def purge_refused(self, now=None):
        """Delete refused accounts decided more than 30 days ago; returns how many."""
        cutoff = _stamp((now or utcnow()) - REFUSED_RETENTION)
        with closing(self._connect()) as conn:
            ids = [
                row[0]
                for row in conn.execute(
                    "SELECT id FROM accounts WHERE status = 'refused' AND decided_at < ?",
                    (cutoff,),
                ).fetchall()
            ]
            for account_id in ids:
                conn.execute("DELETE FROM credentials WHERE account_id = ?", (account_id,))
                conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
        return len(ids)

    def verify_login(self, email, password, now=None):
        now = now or utcnow()
        email = normalize_email(email)
        too_long = not isinstance(password, str) or len(password) > MAX_PASSWORD_LENGTH
        if email is None:
            # Malformed: no throttle row (only the per-IP limiter counts it).
            if not too_long:
                self._hash(password, self._dummy_salt)
            return LoginResult("bad_credentials")

        key = hash_token(email)
        with closing(self._connect()) as conn:
            row = conn.execute(
                "SELECT id, email, status, is_admin, password_hash, salt "
                "FROM accounts WHERE email = ?",
                (email,),
            ).fetchone()
            throttle = conn.execute(
                "SELECT locked_until FROM login_throttle WHERE email_key = ?", (key,)
            ).fetchone()
        account_id = row[0] if row else None
        if throttle is not None and throttle[0] is not None and _parse(throttle[0]) > now:
            # Locked: the password is not even checked, so guessing during the
            # lockout learns nothing.
            return LoginResult("locked", account_id=account_id, until=_parse(throttle[0]))

        if row is None:
            if not too_long:
                self._hash(password, self._dummy_salt)
            self._record_failure(key, now)
            return LoginResult("bad_credentials")

        matches = not too_long and hmac.compare_digest(
            self._hash(password, row[5]), bytes(row[4])
        )
        if not matches:
            self._record_failure(key, now)
            return LoginResult("bad_credentials", account_id=account_id)

        with closing(self._connect()) as conn:
            conn.execute("DELETE FROM login_throttle WHERE email_key = ?", (key,))
        if row[2] != "approved":
            # Revealed only because the password was right.
            return LoginResult("not_approved", account_id=account_id, status=row[2])
        return LoginResult("ok", account=_account(row[:4]), account_id=account_id)

    def _record_failure(self, key, now):
        with closing(self._connect()) as conn:
            # One statement, so two parallel failures both count.
            conn.execute(
                "INSERT INTO login_throttle (email_key, failed) VALUES (?, 1) "
                "ON CONFLICT (email_key) DO UPDATE SET failed = failed + 1",
                (key,),
            )
            failures = conn.execute(
                "SELECT failed FROM login_throttle WHERE email_key = ?", (key,)
            ).fetchone()[0]
            if failures >= LOCK_AFTER_FAILURES:
                seconds = min(
                    LOCK_BASE_SECONDS * 2 ** (failures - LOCK_AFTER_FAILURES), LOCK_MAX_SECONDS
                )
                conn.execute(
                    "UPDATE login_throttle SET locked_until = ? WHERE email_key = ?",
                    (_stamp(now + timedelta(seconds=seconds)), key),
                )

    def issue_credential(self, account_id, kind, label=None, now=None):
        """Create a session (30 days) or device (no expiry) token; returns the token.

        Only its hash is stored, so this is the one time the token is visible.
        """
        if kind not in ("session", "device"):
            raise AccountError("Type de jeton inconnu.")
        now = now or utcnow()
        token = secrets.token_urlsafe(32)
        expires = _stamp(now + SESSION_LIFETIME) if kind == "session" else None
        with closing(self._connect()) as conn:
            conn.execute(
                "INSERT INTO credentials (token_hash, account_id, kind, label, created_at, "
                "last_used_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (hash_token(token), account_id, kind, label, _stamp(now), _stamp(now), expires),
            )
        return token

    def resolve_token(self, token, kind, now=None):
        """The approved account behind a token of the given kind, else None.

        The account dict carries `credential` (the token hash, for logout).
        Revoked, expired, unknown, wrong-kind tokens and accounts that are not
        approved all give None, indistinguishably.
        """
        if not token:
            return None
        now = now or utcnow()
        digest = hash_token(token)
        with closing(self._connect()) as conn:
            row = conn.execute(
                "SELECT a.id, a.email, a.status, a.is_admin, c.expires_at, c.last_used_at "
                "FROM credentials c JOIN accounts a ON a.id = c.account_id "
                "WHERE c.token_hash = ? AND c.kind = ? AND c.revoked_at IS NULL",
                (digest, kind),
            ).fetchone()
            if row is None or row[2] != "approved":
                return None
            if row[4] is not None and _parse(row[4]) <= now:
                return None
            if row[5] is None or _parse(row[5]) <= now - LAST_USED_GRANULARITY:
                conn.execute(
                    "UPDATE credentials SET last_used_at = ? WHERE token_hash = ?",
                    (_stamp(now), digest),
                )
        return {**_account(row[:4]), "credential": digest}

    def revoke_credential(self, token_hash, now=None):
        with closing(self._connect()) as conn:
            conn.execute(
                "UPDATE credentials SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
                (_stamp(now or utcnow()), token_hash),
            )


def create_admin_command(args, db_path=None):
    """`create-admin`: prompts for the password twice. Returns a process exit code."""
    path = db_path or os.environ.get("SYNC_DB_PATH") or SYNC_DB_PATH_DEFAULT
    password = getpass.getpass("Mot de passe : ")
    if password != getpass.getpass("Confirmez le mot de passe : "):
        print("Les deux mots de passe sont différents.", file=sys.stderr)
        return 1
    try:
        AccountStore(path).create_admin(args.email, password)
    except AccountError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(f"Administrateur créé : {normalize_email(args.email)}")
    return 0


def _store(db_path):
    return AccountStore(db_path or os.environ.get("SYNC_DB_PATH") or SYNC_DB_PATH_DEFAULT)


def manage_command(args, db_path=None):
    """list / approve / refuse / disable / enable / reset-password / purge."""
    store = _store(db_path)
    try:
        if args.command == "list":
            for account in store.list_accounts():
                admin = " admin" if account["isAdmin"] else ""
                print(f"{account['status']:9} {account['email']}{admin}  {account['createdAt']}")
        elif args.command == "purge":
            print(f"{store.purge_refused()} compte(s) refusé(s) supprimé(s).")
        else:
            account_id = store.find_id(args.email)
            if args.command == "reset-password":
                print(store.reset_password(account_id))
            else:
                store.transition(account_id, args.command)
                print(f"{args.command}: {normalize_email(args.email)}")
    except AccountError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


def main(argv=None, db_path=None):
    parser = argparse.ArgumentParser(prog="accounts", description=__doc__.split("\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create-admin", help="create an approved administrator account")
    create.add_argument("--email", required=True)
    commands.add_parser("list", help="list accounts, pending first")
    commands.add_parser("purge", help="delete refused accounts older than 30 days")
    for name in ("approve", "refuse", "disable", "enable", "reset-password"):
        sub = commands.add_parser(name, help=f"{name} an account")
        sub.add_argument("--email", required=True)
    args = parser.parse_args(argv)
    if args.command == "create-admin":
        return create_admin_command(args, db_path)
    return manage_command(args, db_path)


if __name__ == "__main__":
    sys.exit(main())
