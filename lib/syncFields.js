// Change tracking for sync (ticket 091). Every synced row carries `updatedAt`
// (ISO stamp of its last change) and `deletedAt` (set instead of removing the
// row, so a later sync can propagate the deletion). Pure: no db import, so
// lib/db.js, lib/db.web.js and Jest can all use it.

export const SYNCED_TABLES = Object.freeze([
  'zones',
  'garden_plan',
  'plan_features',
  'plants',
  'care_logs',
  'reminders',
  'photos',
  'unsorted_photos',
  'bloom_observations',
]);

export function nowStamp() {
  return new Date().toISOString();
}

export function isLive(row) {
  return row.deletedAt == null;
}

export function liveRows(rows) {
  return rows.filter(isLive);
}

// Sets `updatedAt = stamp` on every row lacking one (rows written before
// ticket 091). Mutates in place; returns how many rows changed.
export function stampLegacyRows(rows, stamp) {
  let count = 0;
  for (const row of rows) {
    if (row.updatedAt == null) {
      row.updatedAt = stamp;
      count++;
    }
  }
  return count;
}
