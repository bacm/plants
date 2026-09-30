// Streamed garden backup, format version 2 (ticket 102). Pure: no React
// Native, no storage, so it is testable under Jest. lib/db.js and
// lib/db.web.js feed it their own file/Blob I/O.
//
// The file is "JSON Lines", pure ASCII, one JSON value per line:
//   1. the header: today's backup object minus the photo bytes (photo rows
//      carry `file: { ext }`, or null when the photo file was missing);
//   2. one `{ photo, id, ext, base64 }` line per photo that has a file;
//   3. `{ end: true, photos: N }`, which lets import refuse a truncated file.
// No string or buffer ever holds more than one photo, which is what a
// single JSON.stringify of a large garden could not do (Hermes caps string
// length). Pure ASCII because Hermes has no guaranteed TextDecoder: a byte
// chunk is decoded with String.fromCharCode.

import { BACKUP_VERSION_STREAMED, validateBackup } from './backupFormat';
import { SAFE_EXTENSIONS } from './photoRefs';

export const PHOTO_TABLES = ['photos', 'unsorted_photos'];
// Byte slice size used when writing a line out, and when decoding a chunk.
export const WRITE_SLICE_BYTES = 64 * 1024;
const DECODE_SLICE = 8192;

/** JSON.stringify whose output is pure ASCII: every char > 0x7E becomes \uXXXX. */
export function toAsciiJson(value) {
  return JSON.stringify(value).replace(
    /[\u007f-￿]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}

/**
 * Yields the file's lines (each ending in "\n"): the header, one line per
 * photo entry, then the end line. `photoEntries` is an async (or sync)
 * iterable of `{ table, id, ext, base64 }`; it is consumed lazily, so only
 * one entry is alive at a time.
 */
export async function* encodeBackupLines(header, photoEntries) {
  yield `${toAsciiJson(header)}\n`;
  let photos = 0;
  for await (const entry of photoEntries) {
    photos++;
    yield `${toAsciiJson({
      photo: entry.table,
      id: entry.id,
      ext: entry.ext,
      base64: entry.base64,
    })}\n`;
  }
  yield `${toAsciiJson({ end: true, photos })}\n`;
}

/** Yields the ASCII string as Uint8Array slices of at most `size` bytes. */
export function* asciiToByteSlices(text, size = WRITE_SLICE_BYTES) {
  for (let start = 0; start < text.length; start += size) {
    const end = Math.min(start + size, text.length);
    const bytes = new Uint8Array(end - start);
    for (let i = start; i < end; i++) bytes[i - start] = text.charCodeAt(i);
    yield bytes;
  }
}

function decodeAscii(bytes) {
  let out = '';
  for (let start = 0; start < bytes.length; start += DECODE_SLICE) {
    const slice = bytes.subarray(start, Math.min(start + DECODE_SLICE, bytes.length));
    for (let i = 0; i < slice.length; i++) {
      if (slice[i] > 0x7f) throw new Error('Fichier invalide : caractère non ASCII.');
    }
    out += String.fromCharCode.apply(null, slice);
  }
  return out;
}

/**
 * Consumes byte chunks and yields complete lines (without the "\n").
 * `push(chunk)` returns the lines completed by that chunk; a line split
 * across several chunks is reassembled. `finish()` returns the unterminated
 * remainder, which a well-formed file never has ('' then).
 */
export function createLineSplitter() {
  let pending = [];
  return {
    push(chunk) {
      const lines = [];
      let start = 0;
      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] !== 0x0a) continue;
        pending.push(decodeAscii(chunk.subarray(start, i)));
        lines.push(pending.join(''));
        pending = [];
        start = i + 1;
      }
      if (start < chunk.length) pending.push(decodeAscii(chunk.subarray(start)));
      return lines;
    },
    finish() {
      const rest = pending.join('');
      pending = [];
      return rest;
    },
  };
}

/** Yields complete lines from an async iterable of byte chunks. */
export async function* splitLines(chunks) {
  const splitter = createLineSplitter();
  for await (const chunk of chunks) {
    for (const line of splitter.push(chunk)) yield line;
  }
  const rest = splitter.finish();
  if (rest !== '') {
    throw new Error('Fichier tronqué : la dernière ligne est incomplète.');
  }
}

function tryParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

/**
 * Reads only the first line. Returns `{ kind: 'streamed', result }` with
 * `result` = validateBackup's { ok, backup | error } for a version 2
 * header, or `{ kind: 'legacy' }` when the file is not a version 2 file
 * (an old pretty-printed backup has no complete JSON value on line 1): the
 * caller then falls back to reading the whole text.
 */
export async function readBackupHeader(chunks) {
  let first = null;
  try {
    for await (const line of splitLines(chunks)) {
      first = line;
      break;
    }
  } catch {
    // An old file: single line with no newline, or accents in raw UTF-8. Not
    // a version 2 file, so the legacy path reads and validates the whole text.
    first = null;
  }
  const raw = first === null ? undefined : tryParse(first);
  if (!raw || typeof raw !== 'object' || raw.version !== BACKUP_VERSION_STREAMED) {
    return { kind: 'legacy' };
  }
  return { kind: 'streamed', result: validateBackup(raw) };
}

function isBase64(value) {
  if (typeof value !== 'string' || value.length % 4 !== 0) return false;
  let padding = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c === 0x3d) {
      padding++;
      if (padding > 2) return false;
      continue;
    }
    if (padding > 0) return false;
    const ok =
      (c >= 0x41 && c <= 0x5a) ||
      (c >= 0x61 && c <= 0x7a) ||
      (c >= 0x30 && c <= 0x39) ||
      c === 0x2b ||
      c === 0x2f;
    if (!ok) return false;
  }
  return true;
}

/**
 * Reads every photo line of a version 2 file, after the header `backup`
 * (already validated) was parsed from line 1. `onPhoto({ table, id, ext,
 * base64 })` is awaited per photo and should store it straight away. Throws
 * on a truncated file (no end line, or an end-line count that disagrees with
 * the photo lines read) and on a photo line that does not match the header.
 * Returns the number of photo lines read.
 */
export async function readBackupPhotos(chunks, backup, onPhoto) {
  const expected = {};
  for (const table of PHOTO_TABLES) {
    expected[table] = new Map((backup.tables[table] ?? []).map((row) => [row.id, row.file]));
  }
  const seen = { photos: new Set(), unsorted_photos: new Set() };
  let lineNumber = 0;
  let photos = 0;
  let ended = false;

  for await (const line of splitLines(chunks)) {
    lineNumber++;
    if (lineNumber === 1) continue; // the header, validated by the caller
    if (ended) throw new Error('Fichier invalide : contenu après la fin de la sauvegarde.');
    const entry = tryParse(line);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Fichier invalide : ligne ${lineNumber} illisible.`);
    }
    if (entry.end === true) {
      if (entry.photos !== photos) {
        throw new Error(
          `Fichier tronqué ou corrompu : ${photos} photo(s) lue(s) sur ${entry.photos} annoncée(s).`
        );
      }
      ended = true;
      continue;
    }
    if (!PHOTO_TABLES.includes(entry.photo)) {
      throw new Error(`Fichier invalide : ligne ${lineNumber} inattendue.`);
    }
    const file = expected[entry.photo].get(entry.id);
    if (!file || file.ext !== entry.ext || !SAFE_EXTENSIONS.has(entry.ext)) {
      throw new Error(`Fichier invalide : la photo de la ligne ${lineNumber} n’a pas de fiche.`);
    }
    if (seen[entry.photo].has(entry.id)) {
      throw new Error(`Fichier invalide : photo en double à la ligne ${lineNumber}.`);
    }
    if (!isBase64(entry.base64)) {
      throw new Error(`Fichier invalide : photo illisible à la ligne ${lineNumber}.`);
    }
    seen[entry.photo].add(entry.id);
    photos++;
    await onPhoto({ table: entry.photo, id: entry.id, ext: entry.ext, base64: entry.base64 });
  }
  if (!ended) throw new Error('Fichier tronqué : la fin de la sauvegarde est absente.');
  return photos;
}
