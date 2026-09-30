"""Validation of a sync push body (ticket 092). Pure functions, no I/O.

The per-table column allow-list lives in sync_schema.json, shared with the
app (lib/__tests__/syncSchema.test.js keeps the two in step).
"""

import json
import os
from datetime import datetime, timezone

MAX_ROWS_PER_PUSH = 1000

with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "sync_schema.json")) as _f:
    SYNC_SCHEMA = {table: frozenset(columns) for table, columns in json.load(_f).items()}


class SyncValidationError(Exception):
    def __init__(self, detail, status_code=400):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def normalize_timestamp(value):
    """Return `value` as `YYYY-MM-DDTHH:MM:SS.mmmZ` (UTC), or None if unparsable.

    The normalised form compares correctly as a plain string.
    """
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    parsed = parsed.astimezone(timezone.utc)
    return parsed.strftime("%Y-%m-%dT%H:%M:%S.") + f"{parsed.microsecond // 1000:03d}Z"


def validate_push(body, schema=None):
    """Validate a push body; return normalised `{table: [row, ...]}`.

    Raises SyncValidationError (400, or 413 when too large) on the first problem.
    """
    schema = SYNC_SCHEMA if schema is None else schema
    if not isinstance(body, dict) or not isinstance(body.get("changes"), dict):
        raise SyncValidationError("Body must be an object with a 'changes' object")
    changes = body["changes"]

    total = 0
    for rows in changes.values():
        if isinstance(rows, list):
            total += len(rows)
    if total > MAX_ROWS_PER_PUSH:
        raise SyncValidationError(
            f"At most {MAX_ROWS_PER_PUSH} rows per push", status_code=413
        )

    clean = {}
    seen = set()
    for table, rows in changes.items():
        if table not in schema:
            raise SyncValidationError(f"Unknown table: {table!r}")
        if not isinstance(rows, list):
            raise SyncValidationError(f"Rows of {table!r} must be a list")
        allowed = schema[table]
        clean_rows = []
        for index, row in enumerate(rows):
            label = f"{table}[{index}]"
            if not isinstance(row, dict):
                raise SyncValidationError(f"{label} must be an object")
            for key, value in row.items():
                if key not in allowed:
                    raise SyncValidationError(f"{label}: unknown column {key!r}")
                if value is not None and not isinstance(value, (str, int, float, bool)):
                    raise SyncValidationError(f"{label}: {key!r} must be a scalar")
            row_id = row.get("id")
            if not isinstance(row_id, str) or not row_id:
                raise SyncValidationError(f"{label}: missing or empty id")
            updated_at = normalize_timestamp(row.get("updatedAt"))
            if updated_at is None:
                raise SyncValidationError(f"{label}: missing or invalid updatedAt")
            deleted_at = row.get("deletedAt")
            if deleted_at is not None:
                deleted_at = normalize_timestamp(deleted_at)
                if deleted_at is None:
                    raise SyncValidationError(f"{label}: invalid deletedAt")
            if (table, row_id) in seen:
                raise SyncValidationError(f"{label}: duplicate id {row_id!r} in request")
            seen.add((table, row_id))
            clean_row = dict(row)
            clean_row["updatedAt"] = updated_at
            if "deletedAt" in clean_row:
                clean_row["deletedAt"] = deleted_at
            clean_rows.append(clean_row)
        clean[table] = clean_rows
    return clean
