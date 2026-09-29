// Ticket 085: a cheap identity for a photo picked from the library, so the
// sort screen can tell that a plant already has it. The stored file is
// re-encoded on import (lib/photoPipeline.js), so the stored bytes cannot be
// compared with the original's; the original's own metadata can.
//
// Fingerprint = capture time to the second + file size in bytes + pixel size.
// The capture time is EXIF (native) or the web File's `lastModified` (the web
// picker never fills `exif`, see lib/originalPhotoDate.js). Returns null when
// either the time or the size is missing: a weak fingerprint would flag
// unrelated photos as duplicates.

const EXIF_DATE_TIME_RE = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}:\d{2}:\d{2})/;

function exifDateTime(exif) {
  if (!exif || typeof exif !== 'object') return null;
  for (const field of ['DateTimeOriginal', 'DateTimeDigitized', 'DateTime']) {
    const value = exif[field];
    if (typeof value !== 'string') continue;
    const m = EXIF_DATE_TIME_RE.exec(value.trim());
    if (m) return `${m[1]}:${m[2]}:${m[3]} ${m[4]}`;
  }
  return null;
}

function captureTime(asset) {
  const fromExif = exifDateTime(asset?.exif);
  if (fromExif) return fromExif;
  const lastModified = asset?.file?.lastModified;
  if (typeof lastModified === 'number' && Number.isFinite(lastModified)) {
    return `lm:${lastModified}`;
  }
  return null;
}

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Fingerprint of one expo-image-picker asset, or null when it cannot be made. */
export function photoFingerprint(asset) {
  const dateTime = captureTime(asset);
  const bytes = asset?.fileSize ?? asset?.file?.size;
  if (!dateTime || !isPositiveNumber(bytes)) return null;
  return `${dateTime}|${bytes}|${asset.width}x${asset.height}`;
}

/**
 * Byte length of a `data:<mime>;base64,<payload>` URL, or 0 when the value is
 * not one. Used on web to compare two stored photos' sizes.
 */
export function dataUrlByteLength(dataUrl) {
  if (typeof dataUrl !== 'string') return 0;
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma === -1) return 0;
  const payload = dataUrl.slice(comma + 1);
  if (!payload) return 0;
  let padding = 0;
  if (payload.endsWith('==')) padding = 2;
  else if (payload.endsWith('=')) padding = 1;
  return Math.floor((payload.length * 3) / 4) - padding;
}

/** True when both sizes are positive numbers and equal. */
export function sameByteSize(a, b) {
  return isPositiveNumber(a) && isPositiveNumber(b) && a === b;
}
