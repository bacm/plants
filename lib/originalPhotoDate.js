// Pure date-extraction for a photo-library import (ticket 061): preserves
// the day the photo was actually taken instead of the day it was imported.
//
// Preference order, matching the ticket's notes:
//   1. EXIF `DateTimeOriginal` (the day the shutter was pressed).
//   2. EXIF `DateTimeDigitized`, then `DateTime` -- some cameras/apps only
//      ever set one of the three tags.
//   3. The web `File`'s `lastModified` timestamp. expo-image-picker's web
//      implementation never populates `exif` at all (see
//      node_modules/expo-image-picker/build/ExponentImagePicker.web.js), so
//      this is the only signal available there.
//   4. `now` (the import moment), with `unknown: true` so a caller can flag
//      the photo in the UI rather than silently pretend the date is solid.
//
// expo-media-library is not a dependency of this app (see package.json), so
// the `assetId` field expo-image-picker's native result can carry is not
// used here -- there is nothing installed that can resolve it to a
// creation date.
//
// The EXIF date string ("YYYY:MM:DD HH:MM:SS") carries no timezone. It is
// parsed by hand rather than handed to `new Date(...)`, which does not
// accept the ':'-separated date part and would otherwise risk a day shift
// by reinterpreting it. The `lastModified` fallback is a real epoch
// timestamp, so it is converted using the runtime's local calendar date
// (getFullYear/getMonth/getDate), not `toISOString`'s UTC date, so a photo
// saved late at night keeps the day it was saved on, not the day it became
// in UTC.

const EXIF_DATE_RE = /^(\d{4}):(\d{2}):(\d{2})(?:[ T]\d{2}:\d{2}:\d{2})?/;

function isValidYmd(year, month, day) {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= 31
  );
}

function pad(n, len = 2) {
  return String(n).padStart(len, '0');
}

function parseExifDate(value) {
  if (typeof value !== 'string') return null;
  const m = EXIF_DATE_RE.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!isValidYmd(year, month, day)) return null;
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

function localDateFromEpochMs(ms) {
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Returns `{ date: 'YYYY-MM-DD', unknown }` for one asset out of an
 * expo-image-picker `launchImageLibraryAsync` result's `assets` array.
 * `now` defaults to the current time and is only reached when neither EXIF
 * nor a web `File` gives up a date -- pass it explicitly to test that path.
 */
export function originalPhotoDate(asset, now = new Date()) {
  const exif = asset?.exif;
  if (exif && typeof exif === 'object') {
    for (const field of ['DateTimeOriginal', 'DateTimeDigitized', 'DateTime']) {
      const parsed = parseExifDate(exif[field]);
      if (parsed) return { date: parsed, unknown: false };
    }
  }

  const lastModified = asset?.file?.lastModified;
  if (typeof lastModified === 'number') {
    const parsed = localDateFromEpochMs(lastModified);
    if (parsed) return { date: parsed, unknown: false };
  }

  return {
    date: localDateFromEpochMs(now.getTime()) ?? now.toISOString().slice(0, 10),
    unknown: true,
  };
}
