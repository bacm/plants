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
  photos: ['id', 'plantId', 'careLogId', 'date'],
};

// Columns optional in an archive row: absent (a v1 backup written before the
// column existed) resolves to null rather than refusing the import.
// `repeatRule` (ticket 022) postdates BACKUP_VERSION 1, which is kept at 1
// since the archive still round-trips without it.
export const OPTIONAL_TABLE_COLUMNS = {
  reminders: new Set(['repeatRule']),
};

// Columns that exist on the live table but are deliberately not part of the
// archive's column list because the archive represents them differently.
// Kept here (rather than silently divergent) so the schema-parity test can
// name the gap instead of just special-casing 'photos'.
export const OMITTED_DB_COLUMNS = {
  photos: new Set(['uri']),
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
export function buildBackup({ tables, photoData = {}, exportedAt } = {}) {
  const outTables = {};
  for (const name of TABLE_NAMES) {
    const rows = tables?.[name] ?? [];
    if (name === 'photos') {
      outTables.photos = rows.map((row) => ({
        id: row.id,
        plantId: row.plantId,
        careLogId: row.careLogId ?? null,
        date: row.date,
        file: photoData[row.id] ?? null,
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
    if (!Array.isArray(raw.tables[name])) {
      return fail(`Sauvegarde invalide : table « ${name} » manquante ou invalide.`);
    }
  }

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

  // --- photos ---
  const photos = [];
  const photoIds = new Set();
  for (let i = 0; i < raw.tables.photos.length; i++) {
    const row = raw.tables.photos[i];
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return fail(`Photo ${i} invalide.`);
    }
    const photoKeys = new Set(['id', 'plantId', 'careLogId', 'date', 'file']);
    const rowKeys = Object.keys(row);
    if (rowKeys.length !== photoKeys.size || !rowKeys.every((k) => photoKeys.has(k))) {
      return fail(`Photo ${i} contient une colonne inconnue.`);
    }
    if (!isNonEmptyString(row.id)) return fail(`Photo ${i} : identifiant invalide.`);
    if (!isNonEmptyString(row.plantId) || !plantIds.has(row.plantId)) {
      return fail(`Photo ${i} : référence à une plante manquante.`);
    }
    if (!isStringOrNull(row.careLogId)) return fail(`Photo ${i} : référence de soin invalide.`);
    if (row.careLogId != null && !careLogIds.has(row.careLogId)) {
      return fail(`Photo ${i} : référence à un soin manquant.`);
    }
    if (!isNonEmptyString(row.date)) return fail(`Photo ${i} : date invalide.`);
    if (row.file !== null) {
      if (!row.file || typeof row.file !== 'object' || Array.isArray(row.file)) {
        return fail(`Photo ${i} : fichier invalide.`);
      }
      const fileKeys = Object.keys(row.file);
      if (fileKeys.length !== 2 || !fileKeys.includes('ext') || !fileKeys.includes('base64')) {
        return fail(`Photo ${i} : fichier invalide.`);
      }
      if (!SAFE_EXTENSIONS.has(row.file.ext)) {
        return fail(`Photo ${i} : extension de fichier non prise en charge.`);
      }
      if (!isValidBase64(row.file.base64)) {
        return fail(`Photo ${i} : contenu de fichier invalide (base64).`);
      }
    }
    if (photoIds.has(row.id)) return fail(`Photo ${i} : identifiant en double.`);
    photoIds.add(row.id);
    photos.push(row);
  }

  const tables = { zones, plants, reminders, care_logs: careLogs, photos };
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
