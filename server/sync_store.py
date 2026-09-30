"""SQLite store for the synced garden (ticket 092).

Every synced row is kept whole, as JSON, keyed by (table, id), with a global
revision number that grows on each accepted write. Clients pull "everything
after revision N". Conflicts are last-write-wins on `updatedAt`. Deletions are
rows carrying `deletedAt`: they are stored and served like any other row.

All SQL here is fixed text; client input only ever travels as bound
parameters, and table names are validated upstream (sync_validation).
"""

import json
import os
import sqlite3
from contextlib import closing

SCHEMA = """
CREATE TABLE IF NOT EXISTS rows (
    tbl TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    revision INTEGER NOT NULL,
    PRIMARY KEY (tbl, id)
);
CREATE INDEX IF NOT EXISTS rows_revision ON rows (revision);
"""


class SyncStore:
    def __init__(self, path):
        self.path = str(path)
        parent = os.path.dirname(os.path.abspath(self.path))
        os.makedirs(parent, exist_ok=True)
        with closing(self._connect()) as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(SCHEMA)

    def _connect(self):
        # One connection per operation: FastAPI runs sync endpoints in a
        # thread pool, and a sqlite3 connection must not cross threads.
        # isolation_level=None: transactions are managed explicitly below.
        conn = sqlite3.connect(self.path, timeout=30, isolation_level=None)
        return conn

    def _latest_revision(self, conn):
        value = conn.execute("SELECT MAX(revision) FROM rows").fetchone()[0]
        return value or 0

    def push(self, changes):
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
                            "SELECT updated_at FROM rows WHERE tbl = ? AND id = ?",
                            (table, row["id"]),
                        ).fetchone()
                        if existing is not None and not row["updatedAt"] > existing[0]:
                            continue
                        revision += 1
                        conn.execute(
                            "INSERT OR REPLACE INTO rows "
                            "(tbl, id, data, updated_at, deleted_at, revision) "
                            "VALUES (?, ?, ?, ?, ?, ?)",
                            (
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
            return {
                "accepted": accepted,
                "revision": self._latest_revision(conn),
                "deleted": deleted,
            }

    def photo_row_state(self, photo_id):
        """None if no photo row is known, else "live" or "deleted"."""
        with closing(self._connect()) as conn:
            found = conn.execute(
                "SELECT deleted_at FROM rows WHERE tbl IN ('photos', 'unsorted_photos') "
                "AND id = ? ORDER BY revision DESC LIMIT 1",
                (photo_id,),
            ).fetchone()
        if found is None:
            return None
        return "deleted" if found[0] else "live"

    def pull(self, since, limit):
        with closing(self._connect()) as conn:
            found = conn.execute(
                "SELECT tbl, data, revision FROM rows WHERE revision > ? "
                "ORDER BY revision LIMIT ?",
                (since, limit + 1),
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
