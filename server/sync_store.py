"""SQLite store for the synced garden (ticket 092, scoped per account in 100).

Every synced row is kept whole, as JSON, keyed by (account, table, id), with a
revision number that grows on each accepted write. Clients pull "everything
after revision N". Conflicts are last-write-wins on `updatedAt`. Deletions are
rows carrying `deletedAt`: they are stored and served like any other row.

Every query filters on the account id, so one account can never read, overwrite
or delete another's rows, even when both push the same (table, id).

All SQL here is fixed text; client input only ever travels as bound
parameters, and table names are validated upstream (sync_validation).
"""

import json
import os
import sqlite3
from contextlib import closing

# A new table name, not `rows` with an extra column: an old-shaped `rows` table
# (tickets 092/093, no account column) can then never be reused by accident.
SCHEMA = """
CREATE TABLE IF NOT EXISTS garden_rows (
    account_id TEXT NOT NULL,
    tbl TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    revision INTEGER NOT NULL,
    PRIMARY KEY (account_id, tbl, id)
);
CREATE INDEX IF NOT EXISTS garden_rows_account_revision ON garden_rows (account_id, revision);
"""


def _drop_legacy_rows_table(conn):
    """Remove the pre-account `rows` table if it holds nothing.

    Databases created by 092/093 on a dev machine may still have it. Rows in it
    belong to no account, so they cannot be carried over automatically: refuse
    to start rather than silently ignore (or publish) someone's data.
    """
    legacy = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'rows'"
    ).fetchone()
    if legacy is None:
        return
    if conn.execute("SELECT COUNT(*) FROM rows").fetchone()[0] > 0:
        raise RuntimeError(
            "The database has a legacy `rows` table with pre-account sync data (tickets "
            "092/093). It belongs to no account: migrate it into `garden_rows` or remove "
            "it by hand before starting the server."
        )
    conn.execute("DROP TABLE rows")


class SyncStore:
    def __init__(self, path):
        self.path = str(path)
        parent = os.path.dirname(os.path.abspath(self.path))
        os.makedirs(parent, exist_ok=True)
        with closing(self._connect()) as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            _drop_legacy_rows_table(conn)
            conn.executescript(SCHEMA)

    def _connect(self):
        # One connection per operation: FastAPI runs sync endpoints in a
        # thread pool, and a sqlite3 connection must not cross threads.
        # isolation_level=None: transactions are managed explicitly below.
        conn = sqlite3.connect(self.path, timeout=30, isolation_level=None)
        return conn

    def _latest_revision(self, conn):
        # One counter for the whole table, not one per account: it is still
        # strictly increasing within each account, and a client's `since`
        # needs no per-account bookkeeping. Gaps between an account's own
        # revisions are harmless (pull only asks "revision > since").
        value = conn.execute("SELECT MAX(revision) FROM garden_rows").fetchone()[0]
        return value or 0

    def push(self, account_id, changes):
        accepted = 0
        deleted = []
        with closing(self._connect()) as conn:
            # IMMEDIATE takes the write lock up front, so two pushes can never
            # be handed the same revision numbers.
            conn.execute("BEGIN IMMEDIATE")
            try:
                revision = self._latest_revision(conn)
                for table, rows in changes.items():
                    for row in rows:
                        existing = conn.execute(
                            "SELECT updated_at FROM garden_rows "
                            "WHERE account_id = ? AND tbl = ? AND id = ?",
                            (account_id, table, row["id"]),
                        ).fetchone()
                        if existing is not None and not row["updatedAt"] > existing[0]:
                            continue
                        revision += 1
                        conn.execute(
                            "INSERT OR REPLACE INTO garden_rows "
                            "(account_id, tbl, id, data, updated_at, deleted_at, revision) "
                            "VALUES (?, ?, ?, ?, ?, ?, ?)",
                            (
                                account_id,
                                table,
                                row["id"],
                                json.dumps(row, separators=(",", ":")),
                                row["updatedAt"],
                                row.get("deletedAt"),
                                revision,
                            ),
                        )
                        accepted += 1
                        if row.get("deletedAt"):
                            deleted.append((table, row["id"]))
                conn.execute("COMMIT")
            except BaseException:
                conn.execute("ROLLBACK")
                raise
            # "deleted" is internal (used to remove photo files); the HTTP
            # layer strips it.
            # The account's own latest revision: the global counter would tell
            # it how much other accounts are writing.
            own = conn.execute(
                "SELECT MAX(revision) FROM garden_rows WHERE account_id = ?", (account_id,)
            ).fetchone()[0]
            return {
                "accepted": accepted,
                "revision": own or 0,
                "deleted": deleted,
            }

    def photo_row_state(self, account_id, photo_id):
        """None if no photo row is known, else "live" or "deleted"."""
        with closing(self._connect()) as conn:
            found = conn.execute(
                "SELECT deleted_at FROM garden_rows WHERE account_id = ? "
                "AND tbl IN ('photos', 'unsorted_photos') "
                "AND id = ? ORDER BY revision DESC LIMIT 1",
                (account_id, photo_id),
            ).fetchone()
        if found is None:
            return None
        return "deleted" if found[0] else "live"

    def pull(self, account_id, since, limit):
        with closing(self._connect()) as conn:
            found = conn.execute(
                "SELECT tbl, data, revision FROM garden_rows "
                "WHERE account_id = ? AND revision > ? ORDER BY revision LIMIT ?",
                (account_id, since, limit + 1),
            ).fetchall()
        more = len(found) > limit
        found = found[:limit]
        changes = {}
        for table, data, _revision in found:
            changes.setdefault(table, []).append(json.loads(data))
        return {
            "changes": changes,
            "revision": found[-1][2] if found else since,
            "more": more,
        }
