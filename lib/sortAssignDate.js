// Pure decision for app/sort.js's "assign to a plant" step (ticket 061):
// given an unsorted photo row and, when its date is unknown, the text typed
// into the date field, decides the date `addPhoto` should use -- or an
// error that must block the assign instead. Extracted so this can be unit
// tested: app/sort.js itself is a screen and cannot be imported under Jest
// (see CLAUDE.md's "extract logic worth testing into a pure module").
import { parseISODate } from './validation';

/**
 * `photo` is an unsorted_photos row (`{ takenAt, dateUnknown }`);
 * `editedDate` is only consulted when `photo.dateUnknown` is true. Returns
 * `{ date, error }` -- exactly one of the two is non-null.
 *
 * A known-date photo never fails: its `takenAt` (already an ISO date, or an
 * ISO timestamp for a camera shot) is used as-is. An unknown-date photo
 * fails whenever `editedDate` is blank or not a real calendar date, rather
 * than silently falling back to `takenAt` -- which for an unknown-date row
 * is only the import-time guess (see lib/originalPhotoDate.js), never the
 * photo's real capture date.
 */
export function resolveAssignDate(photo, editedDate) {
  if (!photo?.dateUnknown) {
    return { date: photo.takenAt.slice(0, 10), error: null };
  }
  const { value, error } = parseISODate(editedDate);
  if (error || !value) {
    return { date: null, error: error || 'Date requise' };
  }
  return { date: value, error: null };
}
