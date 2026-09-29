// Pure (de)serialisation for the whole-garden backup archive (ticket 020).
// lib/db.js and lib/db.web.js each implement exportGarden/importGarden using
// their own storage; this module only knows how to turn their raw rows into
// one JSON-able object and back, and to validate an archive read from disk
// before any of it touches SQL or IndexedDB.
//
// Photo bytes never carry a platform URI: a native `photos/<file>` ref and a
// web `idb:<id>` ref are both meaningless on the other platform, so the
// archive stores `{ ext, base64 }` instead and each platform's importGarden
// recreates its own ref from that.

import { PLANT_COLUMNS, PLANT_FIELDS } from './plantFields';
import { ZONE_FIELDS } from './zoneFields';
import { SAFE_EXTENSIONS } from './photoRefs';

export const BACKUP_FORMAT = 'plants-garden-backup';
export const BACKUP_VERSION = 1;

// Every user-data table in lib/db.js's schema, and the column list each row
// in the archive carries. `photos` intentionally omits `uri`: a photo row in
// the archive is `{ id, plantId, careLogId, date, file }`, with `file` built
// separately by buildBackup (see PHOTO_OMITTED_DB_COLUMNS below, used by the
// schema-parity test in lib/__tests__/backupFormat.test.js).
export const TABLE_COLUMNS = {
  zones: ['id', ...ZONE_FIELDS],
  plants: ['id', ...PLANT_COLUMNS],
  reminders: [
    'id',
    'plantId',
    'kind',
    'frequencyDays',
    'nextDueDate',
    'lastDoneDate',
    'enabled',
    'repeatRule',
  ],
  care_logs: ['id', 'plantId', 'type', 'date', 'notes'],
  photos: ['id', 'plantId', 'careLogId', 'date', 'caption', 'fingerprint'],
  // ticket 056: garden-walk shots not filed against a plant yet ("?"), and
  // one "seen blooming" mark per plant per day. Both post-date BACKUP_VERSION
  // 1 and are optional tables (see OPTIONAL_TABLES): a v1 backup written
  // before they existed still imports, just with none of either.
  unsorted_photos: ['id', 'takenAt', 'caption', 'dateUnknown', 'fingerprint'],
  bloom_observations: ['id', 'plantId', 'date', 'kind'],
};

// Columns optional in an archive row: absent (a v1 backup written before the
// column existed) resolves to null rather than refusing the import.
// `repeatRule` (ticket 022), `caption` (ticket 056) and `dateUnknown`
// (ticket 061) postdate BACKUP_VERSION 1, which is kept at 1 since the
// archive still round-trips without them -- an absent `dateUnknown` resolves
// to null, which both platforms' importGarden treat as falsy (0), matching
// the column's `NOT NULL DEFAULT 0`. `fingerprint` (ticket 085) is the same:
// absent resolves to null (no fingerprint, so no duplicate detection).
export const OPTIONAL_TABLE_COLUMNS = {
  reminders: new Set(['repeatRule']),
  photos: new Set(['caption', 'fingerprint']),
  unsorted_photos: new Set(['dateUnknown', 'fingerprint']),
};

// Tables that may be entirely absent from an archive (a v1 backup written
// before they existed): they import as empty rather than refusing the whole
// backup. See TABLE_COLUMNS' ticket 056 tables above.
export const OPTIONAL_TABLES = new Set(['unsorted_photos', 'bloom_observations']);

// Columns that exist on the live table but are deliberately not part of the
// archive's column list because the archive represents them differently.
// Kept here (rather than silently divergent) so the schema-parity test can
// name the gap instead of just special-casing 'photos'.
export const OMITTED_DB_COLUMNS = {
  photos: new Set(['uri']),
  unsorted_photos: new Set(['uri']),
};

const TABLE_NAMES = Object.keys(TABLE_COLUMNS);

function nowIso() {
  return new Date().toISOString();
}

function pickColumns(row, columns) {
  const out = {};
  for (const col of columns) out[col] = row[col] ?? null;
  return out;
}

/**
 * Builds the plain, JSON-able backup object.
 *
 * `tables` holds raw rows for zones/plants/reminders/care_logs/photos (photo
 * rows need at least `id`, `plantId`, `careLogId`, `date` — any `uri` is
 * ignored). `photoData` maps a photo id to `{ ext, base64 }`, or the entry
 * may be absent/null for a photo whose file could not be read — it is
 * archived with `file: null` rather than dropped, so it is still counted and
 * still merges into the restored garden's row set.
 */
export function buildBackup({ tables, photoData = {}, unsortedPhotoData = {}, exportedAt } = {}) {
  const outTables = {};
  for (const name of TABLE_NAMES) {
    const rows = tables?.[name] ?? [];
    if (name === 'photos') {
      outTables.photos = rows.map((row) => ({
        id: row.id,
        plantId: row.plantId,
        careLogId: row.careLogId ?? null,
        date: row.date,
        caption: row.caption ?? null,
        fingerprint: row.fingerprint ?? null,
        file: photoData[row.id] ?? null,
      }));
    } else if (name === 'unsorted_photos') {
      outTables.unsorted_photos = rows.map((row) => ({
        id: row.id,
        takenAt: row.takenAt,
        caption: row.caption ?? null,
        dateUnknown: !!row.dateUnknown,
        fingerprint: row.fingerprint ?? null,
        file: unsortedPhotoData[row.id] ?? null,
      }));
    } else {
      outTables[name] = rows.map((row) => pickColumns(row, TABLE_COLUMNS[name]));
    }
  }

  const counts = {};
  for (const name of TABLE_NAMES) counts[name] = outTables[name].length;

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: exportedAt || nowIso(),
    counts,
    tables: outTables,
  };
}

function ok(backup) {
  return { ok: true, backup };
}

function fail(error) {
  return { ok: false, error };
}

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

function isValidBase64(value) {
  return typeof value === 'string' && value.length % 4 === 0 && BASE64_RE.test(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isStringOrNull(value) {
  return value === null || typeof value === 'string';
}

function isNumberOrNull(value) {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function validatePlantFieldValue(kind, value) {
  switch (kind) {
    case 'text':
      return isStringOrNull(value);
    case 'int':
      return isNumberOrNull(value);
    case 'enum':
      return isNonEmptyString(value);
    case 'date':
      return isNonEmptyString(value);
    case 'json':
      return isStringOrNull(value);
    case 'raw':
    default:
      // zoneId, deciduous, pruningMonth, propagation: intentionally loose,
      // these are id refs / booleans / free-form values with no single type.
      return value === null || ['string', 'number', 'boolean'].includes(typeof value);
  }
}

/**
 * A row's keys must be exactly `columns`, except a key in `optionalColumns`
 * (see OPTIONAL_TABLE_COLUMNS) may be missing entirely — never extra, never
 * a stray unknown key.
 */
function keysMatch(row, columns, optionalColumns) {
  const rowKeys = Object.keys(row);
  const columnSet = new Set(columns);
  if (!rowKeys.every((k) => columnSet.has(k))) return false;
  const required = columns.filter((c) => !optionalColumns.has(c));
  return required.every((c) => rowKeys.includes(c));
}

function validateRowShape(row, columns, label, index, optionalColumns = new Set()) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return `Ligne ${index} de « ${label} » invalide.`;
  }
  // CLAUDE.md rule 5: a caller-supplied key becomes a SQL column downstream
  // in importGarden. A row carrying a key outside TABLE_COLUMNS is refused
  // outright rather than silently dropped.
  if (!keysMatch(row, columns, optionalColumns)) {
    return `Ligne ${index} de « ${label} » contient une colonne inconnue.`;
  }
  if (!isNonEmptyString(row.id)) {
    return `Ligne ${index} de « ${label} » : identifiant manquant ou invalide.`;
  }
  return null;
}

/**
 * Parses and validates an archive read from disk. The file is treated as
 * fully untrusted: malformed JSON, wrong format/version, a row shape that
 * disagrees with TABLE_COLUMNS, wrong basic types, or a dangling reference to
 * a plant/care log all refuse the import outright. A dangling `zoneId` is the
 * one reference downgraded to a warning: the row is kept with `zoneId: null`.
 */
export function parseBackup(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('Fichier illisible : ce n’est pas un JSON valide.');
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail('Fichier invalide : contenu inattendu.');
  }
  if (raw.format !== BACKUP_FORMAT) {
    return fail('Ce fichier ne semble pas être une sauvegarde de jardin.');
  }
  if (typeof raw.version !== 'number') {
    return fail('Sauvegarde invalide : version manquante.');
  }
  if (raw.version !== BACKUP_VERSION) {
    return fail(
      `Version de sauvegarde non prise en charge (${raw.version}). Cette version de l’application prend en charge la version ${BACKUP_VERSION}.`
    );
  }
  if (!raw.tables || typeof raw.tables !== 'object' || Array.isArray(raw.tables)) {
    return fail('Sauvegarde invalide : tables manquantes.');
  }
  for (const name of TABLE_NAMES) {
    if (raw.tables[name] === undefined && OPTIONAL_TABLES.has(name)) continue;
    if (!Array.isArray(raw.tables[name])) {
      return fail(`Sauvegarde invalide : table « ${name} » manquante ou invalide.`);
    }
  }
  const unsortedPhotoRows = raw.tables.unsorted_photos ?? [];
  const bloomObservationRows = raw.tables.bloom_observations ?? [];

  // --- zones ---
  const zoneIds = new Set();
  const zones = [];
  for (let i = 0; i < raw.tables.zones.length; i++) {
    const row = raw.tables.zones[i];
    const shapeError = validateRowShape(row, TABLE_COLUMNS.zones, 'zones', i);
    if (shapeError) return fail(shapeError);
    if (!isNonEmptyString(row.name)) return fail(`Zone ${i} : nom invalide.`);
    if (!isStringOrNull(row.description)) return fail(`Zone ${i} : description invalide.`);
    if (!isStringOrNull(row.icon)) return fail(`Zone ${i} : icône invalide.`);
    if (!isNumberOrNull(row.orderIndex)) return fail(`Zone ${i} : ordre invalide.`);
    if (zoneIds.has(row.id)) return fail(`Zone ${i} : identifiant en double.`);
    zoneIds.add(row.id);
    zones.push(row);
  }

  // --- plants ---
  const plantIds = new Set();
  const plants = [];
  let danglingZoneRefs = 0;
  for (let i = 0; i < raw.tables.plants.length; i++) {
    const row = raw.tables.plants[i];
    const shapeError = validateRowShape(row, TABLE_COLUMNS.plants, 'plants', i);
    if (shapeError) return fail(shapeError);
    for (const field of PLANT_FIELDS) {
      if (!validatePlantFieldValue(field.kind, row[field.key])) {
        return fail(`Plante ${i} : champ « ${field.key} » invalide.`);
      }
    }
    if (plantIds.has(row.id)) return fail(`Plante ${i} : identifiant en double.`);
    plantIds.add(row.id);
    let zoneId = row.zoneId ?? null;
    if (zoneId != null && !zoneIds.has(zoneId)) {
      zoneId = null;
      danglingZoneRefs++;
    }
    plants.push({ ...row, zoneId });
  }

  // --- reminders ---
  const reminders = [];
  const reminderIds = new Set();
  for (let i = 0; i < raw.tables.reminders.length; i++) {
    const row = raw.tables.reminders[i];
    const shapeError = validateRowShape(
      row,
      TABLE_COLUMNS.reminders,
      'reminders',
      i,
      OPTIONAL_TABLE_COLUMNS.reminders
    );
    if (shapeError) return fail(shapeError);
    if (!isNonEmptyString(row.plantId) || !plantIds.has(row.plantId)) {
      return fail(`Rappel ${i} : référence à une plante manquante.`);
    }
    if (!isNonEmptyString(row.kind)) return fail(`Rappel ${i} : type invalide.`);
    if (typeof row.frequencyDays !== 'number' || !Number.isFinite(row.frequencyDays)) {
      return fail(`Rappel ${i} : fréquence invalide.`);
    }
    if (!isNonEmptyString(row.nextDueDate)) return fail(`Rappel ${i} : échéance invalide.`);
    if (!isStringOrNull(row.lastDoneDate)) {
      return fail(`Rappel ${i} : dernière réalisation invalide.`);
    }
    if (typeof row.enabled !== 'number' && typeof row.enabled !== 'boolean') {
      return fail(`Rappel ${i} : état activé invalide.`);
    }
    const repeatRule = row.repeatRule ?? null;
    if (repeatRule !== null && repeatRule !== 'yearly') {
      return fail(`Rappel ${i} : règle de répétition invalide.`);
    }
    if (reminderIds.has(row.id)) return fail(`Rappel ${i} : identifiant en double.`);
    reminderIds.add(row.id);
    reminders.push({ ...row, repeatRule });
  }

  // --- care_logs ---
  const careLogs = [];
  const careLogIds = new Set();
  for (let i = 0; i < raw.tables.care_logs.length; i++) {
    const row = raw.tables.care_logs[i];
    const shapeError = validateRowShape(row, TABLE_COLUMNS.care_logs, 'care_logs', i);
    if (shapeError) return fail(shapeError);
    if (!isNonEmptyString(row.plantId) || !plantIds.has(row.plantId)) {
      return fail(`Soin ${i} : référence à une plante manquante.`);
    }
    if (!isNonEmptyString(row.type)) return fail(`Soin ${i} : type invalide.`);
    if (!isNonEmptyString(row.date)) return fail(`Soin ${i} : date invalide.`);
    if (!isStringOrNull(row.notes)) return fail(`Soin ${i} : notes invalides.`);
    if (careLogIds.has(row.id)) return fail(`Soin ${i} : identifiant en double.`);
    careLogIds.add(row.id);
    careLogs.push(row);
  }

  // A photo's { ext, base64 } file (or null), shared by photos and
  // unsorted_photos, which archive a file the same way.
  function fileFieldError(file, label) {
    if (file === null) return null;
    if (!file || typeof file !== 'object' || Array.isArray(file)) {
      return `${label} : fichier invalide.`;
    }
    const fileKeys = Object.keys(file);
    if (fileKeys.length !== 2 || !fileKeys.includes('ext') || !fileKeys.includes('base64')) {
      return `${label} : fichier invalide.`;
    }
    if (!SAFE_EXTENSIONS.has(file.ext)) {
      return `${label} : extension de fichier non prise en charge.`;
    }
    if (!isValidBase64(file.base64)) {
      return `${label} : contenu de fichier invalide (base64).`;
    }
    return null;
  }

  // --- photos ---
  const photos = [];
  const photoIds = new Set();
  for (let i = 0; i < raw.tables.photos.length; i++) {
    const row = raw.tables.photos[i];
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return fail(`Photo ${i} invalide.`);
    }
    const photoKeys = new Set([
      'id',
      'plantId',
      'careLogId',
      'date',
      'caption',
      'fingerprint',
      'file',
    ]);
    const rowKeys = Object.keys(row);
    // `caption` (ticket 056) postdates BACKUP_VERSION 1: a row omitting it
    // entirely is a v1 backup and defaults to null, same as OPTIONAL_TABLE_COLUMNS.
    if (
      !rowKeys.every((k) => photoKeys.has(k)) ||
      !['id', 'plantId', 'date', 'file'].every((k) => rowKeys.includes(k))
    ) {
      return fail(`Photo ${i} contient une colonne inconnue.`);
    }
    if (!isNonEmptyString(row.id)) return fail(`Photo ${i} : identifiant invalide.`);
    if (!isNonEmptyString(row.plantId) || !plantIds.has(row.plantId)) {
      return fail(`Photo ${i} : référence à une plante manquante.`);
    }
    if (!isStringOrNull(row.careLogId ?? null)) {
      return fail(`Photo ${i} : référence de soin invalide.`);
    }
    if (row.careLogId != null && !careLogIds.has(row.careLogId)) {
      return fail(`Photo ${i} : référence à un soin manquant.`);
    }
    if (!isNonEmptyString(row.date)) return fail(`Photo ${i} : date invalide.`);
    if (!isStringOrNull(row.caption ?? null)) return fail(`Photo ${i} : note invalide.`);
    if (!isStringOrNull(row.fingerprint ?? null)) {
      return fail(`Photo ${i} : empreinte invalide.`);
    }
    const fileError = fileFieldError(row.file, `Photo ${i}`);
    if (fileError) return fail(fileError);
    if (photoIds.has(row.id)) return fail(`Photo ${i} : identifiant en double.`);
    photoIds.add(row.id);
    photos.push({
      ...row,
      careLogId: row.careLogId ?? null,
      caption: row.caption ?? null,
      fingerprint: row.fingerprint ?? null,
    });
  }

  // --- unsorted_photos (ticket 056, optional table) ---
  const unsortedPhotos = [];
  const unsortedPhotoIds = new Set();
  for (let i = 0; i < unsortedPhotoRows.length; i++) {
    const row = unsortedPhotoRows[i];
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return fail(`Photo à trier ${i} invalide.`);
    }
    const keys = new Set(['id', 'takenAt', 'caption', 'dateUnknown', 'fingerprint', 'file']);
    const rowKeys = Object.keys(row);
    if (
      !rowKeys.every((k) => keys.has(k)) ||
      !['id', 'takenAt', 'file'].every((k) => rowKeys.includes(k))
    ) {
      return fail(`Photo à trier ${i} contient une colonne inconnue.`);
    }
    if (!isNonEmptyString(row.id)) return fail(`Photo à trier ${i} : identifiant invalide.`);
    if (!isNonEmptyString(row.takenAt)) return fail(`Photo à trier ${i} : date invalide.`);
    if (!isStringOrNull(row.caption ?? null)) return fail(`Photo à trier ${i} : note invalide.`);
    if (!isStringOrNull(row.fingerprint ?? null)) {
      return fail(`Photo à trier ${i} : empreinte invalide.`);
    }
    if (
      row.dateUnknown !== undefined &&
      typeof row.dateUnknown !== 'boolean' &&
      typeof row.dateUnknown !== 'number'
    ) {
      return fail(`Photo à trier ${i} : indicateur de date invalide.`);
    }
    const fileError = fileFieldError(row.file, `Photo à trier ${i}`);
    if (fileError) return fail(fileError);
    if (unsortedPhotoIds.has(row.id)) return fail(`Photo à trier ${i} : identifiant en double.`);
    unsortedPhotoIds.add(row.id);
    unsortedPhotos.push({
      ...row,
      caption: row.caption ?? null,
      dateUnknown: !!row.dateUnknown,
      fingerprint: row.fingerprint ?? null,
    });
  }

  // --- bloom_observations (ticket 056, optional table) ---
  const bloomObservations = [];
  const bloomObservationIds = new Set();
  for (let i = 0; i < bloomObservationRows.length; i++) {
    const row = bloomObservationRows[i];
    const shapeError = validateRowShape(
      row,
      TABLE_COLUMNS.bloom_observations,
      'bloom_observations',
      i
    );
    if (shapeError) return fail(shapeError);
    if (!isNonEmptyString(row.plantId) || !plantIds.has(row.plantId)) {
      return fail(`Observation de floraison ${i} : référence à une plante manquante.`);
    }
    if (!isNonEmptyString(row.date)) return fail(`Observation de floraison ${i} : date invalide.`);
    if (row.kind !== 'open' && row.kind !== 'end') {
      return fail(`Observation de floraison ${i} : type invalide.`);
    }
    if (bloomObservationIds.has(row.id)) {
      return fail(`Observation de floraison ${i} : identifiant en double.`);
    }
    bloomObservationIds.add(row.id);
    bloomObservations.push(row);
  }

  const tables = {
    zones,
    plants,
    reminders,
    care_logs: careLogs,
    photos,
    unsorted_photos: unsortedPhotos,
    bloom_observations: bloomObservations,
  };
  const counts = {};
  for (const name of TABLE_NAMES) counts[name] = tables[name].length;

  return ok({
    format: raw.format,
    version: raw.version,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : null,
    counts,
    warnings: { danglingZoneRefs },
    tables,
  });
}
