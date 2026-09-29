import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import { File, Directory, Paths } from 'expo-file-system';
import { addDaysISO, addYearsISO } from './dates';
import { isMonthInRange } from './months';
import { pickPlantUpdates, plantInsertValues } from './plantFields';
import { pickZoneUpdates } from './zoneFields';
import {
  photoFileName,
  isRelativePhotoRef,
  resolvePhotoUri,
  planPhotoMigration,
  extensionOfRelativeRef,
} from './photoRefs';
import { TABLE_COLUMNS } from './backupFormat';

const db = SQLite.openDatabaseSync('garden.db');

const PHOTOS_DIR_NAME = 'photos';
const MISSING_PHOTOS_META_KEY = 'missingPhotoIds';

function photosDirectory() {
  const dir = new Directory(Paths.document, PHOTOS_DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function resolveRowUri(uri) {
  return resolvePhotoUri(uri, Paths.document.uri);
}

function withResolvedPhotoUri(row) {
  if (!row || row.photoUri === undefined) return row;
  return { ...row, photoUri: resolveRowUri(row.photoUri) };
}

export function initDb() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS zones (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      orderIndex INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS plants (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      latinName TEXT,
      type TEXT NOT NULL,
      flowerColor TEXT,
      sun TEXT NOT NULL,
      water TEXT NOT NULL,
      bloomStartMonth INTEGER,
      bloomEndMonth INTEGER,
      height INTEGER,
      width INTEGER,
      deciduous INTEGER,
      minTemperature INTEGER,
      zoneId TEXT,
      notes TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (zoneId) REFERENCES zones(id)
    );

    CREATE TABLE IF NOT EXISTS care_logs (
      id TEXT PRIMARY KEY NOT NULL,
      plantId TEXT NOT NULL,
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      notes TEXT,
      FOREIGN KEY (plantId) REFERENCES plants(id)
    );

    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY NOT NULL,
      plantId TEXT NOT NULL,
      kind TEXT NOT NULL,
      frequencyDays INTEGER NOT NULL,
      nextDueDate TEXT NOT NULL,
      lastDoneDate TEXT,
      enabled INTEGER DEFAULT 1,
      FOREIGN KEY (plantId) REFERENCES plants(id)
    );

    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY NOT NULL,
      plantId TEXT NOT NULL,
      careLogId TEXT,
      uri TEXT NOT NULL,
      date TEXT NOT NULL,
      FOREIGN KEY (plantId) REFERENCES plants(id),
      FOREIGN KEY (careLogId) REFERENCES care_logs(id)
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS unsorted_photos (
      id TEXT PRIMARY KEY NOT NULL,
      uri TEXT NOT NULL,
      takenAt TEXT NOT NULL,
      caption TEXT
    );

    CREATE TABLE IF NOT EXISTS bloom_observations (
      id TEXT PRIMARY KEY NOT NULL,
      plantId TEXT NOT NULL,
      date TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'open',
      FOREIGN KEY (plantId) REFERENCES plants(id)
    );

    CREATE INDEX IF NOT EXISTS idx_plants_zone ON plants(zoneId);
    CREATE INDEX IF NOT EXISTS idx_plants_bloom ON plants(bloomStartMonth, bloomEndMonth);
    CREATE INDEX IF NOT EXISTS idx_care_logs_plant ON care_logs(plantId);
    CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(nextDueDate);
    CREATE INDEX IF NOT EXISTS idx_photos_plant ON photos(plantId);
    CREATE INDEX IF NOT EXISTS idx_bloom_observations_plant ON bloom_observations(plantId);
  `);

  // Migration: ajouter les colonnes si elles n'existent pas
  try {
    db.runSync('ALTER TABLE plants ADD COLUMN height INTEGER');
  } catch {}
  try {
    db.runSync('ALTER TABLE plants ADD COLUMN width INTEGER');
  } catch {}
  try {
    db.runSync('ALTER TABLE plants ADD COLUMN deciduous INTEGER');
  } catch {}
  try {
    db.runSync('ALTER TABLE plants ADD COLUMN minTemperature INTEGER');
  } catch {}
  try {
    db.runSync('ALTER TABLE plants ADD COLUMN imageUrls TEXT');
  } catch {}
  try {
    db.runSync('ALTER TABLE zones ADD COLUMN icon TEXT');
  } catch {}

  // Migration: nouveaux champs plantes
  try {
    db.runSync('ALTER TABLE plants ADD COLUMN soilType TEXT');
  } catch {}
  try {
    db.runSync('ALTER TABLE plants ADD COLUMN soilPH TEXT');
  } catch {}
  try {
    db.runSync('ALTER TABLE plants ADD COLUMN fertilizer TEXT');
  } catch {}
  try {
    db.runSync('ALTER TABLE plants ADD COLUMN pruning TEXT');
  } catch {}
  try {
    db.runSync('ALTER TABLE plants ADD COLUMN pruningMonth INTEGER');
  } catch {}
  try {
    db.runSync('ALTER TABLE plants ADD COLUMN propagation TEXT');
  } catch {}
  try {
    db.runSync('ALTER TABLE plants ADD COLUMN pests TEXT');
  } catch {}
  try {
    db.runSync('ALTER TABLE plants ADD COLUMN toxicity TEXT');
  } catch {}
  try {
    db.runSync('ALTER TABLE plants ADD COLUMN companionPlants TEXT');
  } catch {}
  try {
    db.runSync('ALTER TABLE plants ADD COLUMN harvest TEXT');
  } catch {}
  try {
    db.runSync('ALTER TABLE plants ADD COLUMN harvestMonthStart INTEGER');
  } catch {}
  try {
    db.runSync('ALTER TABLE plants ADD COLUMN harvestMonthEnd INTEGER');
  } catch {}
  try {
    db.runSync('ALTER TABLE plants ADD COLUMN origin TEXT');
  } catch {}
  try {
    db.runSync('ALTER TABLE plants ADD COLUMN winterCare TEXT');
  } catch {}

  // Migration: yearly reminders (ticket 022). NULL = every frequencyDays
  // days (existing behaviour); 'yearly' = same month/day every year.
  try {
    db.runSync('ALTER TABLE reminders ADD COLUMN repeatRule TEXT');
  } catch {}

  // Migration: a note attached to a photo, e.g. the garden-walk camera's
  // "✎ Note" (ticket 056).
  try {
    db.runSync('ALTER TABLE photos ADD COLUMN caption TEXT');
  } catch {}

  // Migration: whether an unsorted photo's takenAt is a guess rather than a
  // real capture date (ticket 061) -- a library import that could not read
  // EXIF or a file timestamp sets this so app/sort.js asks for the date
  // instead of silently keeping the import-day default.
  try {
    db.runSync('ALTER TABLE unsorted_photos ADD COLUMN dateUnknown INTEGER NOT NULL DEFAULT 0');
  } catch {}
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Zones
export function getZones() {
  return db.getAllAsync('SELECT * FROM zones ORDER BY orderIndex, name');
}

export function createZone({ name, description, icon, orderIndex = 0 }) {
  const id = uuid();
  db.runSync('INSERT INTO zones (id, name, description, icon, orderIndex) VALUES (?, ?, ?, ?, ?)', [
    id,
    name,
    description ?? null,
    icon ?? null,
    orderIndex,
  ]);
  return id;
}

export function updateZone(id, updates) {
  const entries = pickZoneUpdates(updates);
  if (!entries.length) return;
  const set = entries.map(([key]) => `${key} = ?`).join(', ');
  db.runSync(`UPDATE zones SET ${set} WHERE id = ?`, [...entries.map(([, v]) => v), id]);
}

export function deleteZone(id) {
  db.runSync('UPDATE plants SET zoneId = NULL WHERE zoneId = ?', [id]);
  db.runSync('DELETE FROM zones WHERE id = ?', [id]);
}

export async function countPlantsInZone(zoneId) {
  const row = await db.getFirstAsync('SELECT COUNT(*) as count FROM plants WHERE zoneId = ?', [
    zoneId,
  ]);
  return row?.count ?? 0;
}

// Plants
export async function getPlants(filters = {}) {
  let sql = `
    SELECT p.*, z.name as zoneName,
      (SELECT COUNT(*) FROM reminders r WHERE r.plantId = p.id AND r.enabled = 1) as reminderCount,
      (SELECT uri FROM photos WHERE plantId = p.id ORDER BY date DESC LIMIT 1) as photoUri
    FROM plants p
    LEFT JOIN zones z ON p.zoneId = z.id
    WHERE 1=1
  `;
  const args = [];
  if (filters.zoneId) {
    sql += ' AND p.zoneId = ?';
    args.push(filters.zoneId);
  }
  if (filters.search) {
    sql += ' AND (p.name LIKE ? OR p.latinName LIKE ? OR p.flowerColor LIKE ?)';
    const term = `%${filters.search}%`;
    args.push(term, term, term);
  }
  if (filters.sun) {
    sql += ' AND p.sun = ?';
    args.push(filters.sun);
  }
  if (filters.type) {
    sql += ' AND p.type = ?';
    args.push(filters.type);
  }
  sql += ' ORDER BY p.name';
  const rows = await db.getAllAsync(sql, args);
  const resolved = rows.map(withResolvedPhotoUri);
  if (filters.bloomMonth == null) return resolved;
  return resolved.filter((p) =>
    isMonthInRange(filters.bloomMonth, p.bloomStartMonth, p.bloomEndMonth)
  );
}

export async function getPlantById(id) {
  const row = await db.getFirstAsync(
    'SELECT p.*, z.name as zoneName FROM plants p LEFT JOIN zones z ON p.zoneId = z.id WHERE p.id = ?',
    [id]
  );
  return row ?? null;
}

export function createPlant(plant) {
  const id = uuid();
  const { columns, values } = plantInsertValues(plant);
  const placeholders = columns.map(() => '?').join(', ');
  db.runSync(`INSERT INTO plants (id, ${columns.join(', ')}) VALUES (?, ${placeholders})`, [
    id,
    ...values,
  ]);
  return id;
}

export function updatePlant(id, updates) {
  const entries = pickPlantUpdates(updates);
  if (!entries.length) return;
  const set = entries.map(([key]) => `${key} = ?`).join(', ');
  db.runSync(`UPDATE plants SET ${set} WHERE id = ?`, [...entries.map(([, v]) => v), id]);
}

export function deletePlant(id) {
  const photos = db.getAllSync('SELECT uri FROM photos WHERE plantId = ?', [id]);
  const runDelete = () => {
    db.runSync('DELETE FROM photos WHERE plantId = ?', [id]);
    db.runSync('DELETE FROM bloom_observations WHERE plantId = ?', [id]);
    db.runSync('DELETE FROM care_logs WHERE plantId = ?', [id]);
    db.runSync('DELETE FROM reminders WHERE plantId = ?', [id]);
    db.runSync('DELETE FROM plants WHERE id = ?', [id]);
  };
  if (typeof db.withTransactionSync === 'function') {
    db.withTransactionSync(runDelete);
  } else {
    db.execSync('BEGIN');
    try {
      runDelete();
      db.execSync('COMMIT');
    } catch (e) {
      db.execSync('ROLLBACK');
      throw e;
    }
  }
  // File deletion happens after the transaction commits, so a failed delete
  // never removes a photo file whose row is still there.
  for (const photo of photos) deletePhotoFile(photo.uri);
}

// Care logs
export function getCareLogsByPlantId(plantId) {
  return db.getAllAsync('SELECT * FROM care_logs WHERE plantId = ? ORDER BY date DESC', [plantId]);
}

export function createCareLog({ plantId, type, date, notes }) {
  const id = uuid();
  const d = date || new Date().toISOString().slice(0, 10);
  db.runSync('INSERT INTO care_logs (id, plantId, type, date, notes) VALUES (?, ?, ?, ?, ?)', [
    id,
    plantId,
    type,
    d,
    notes ?? null,
  ]);
  return id;
}

export function deleteCareLog(id) {
  db.runSync('UPDATE photos SET careLogId = NULL WHERE careLogId = ?', [id]);
  db.runSync('DELETE FROM care_logs WHERE id = ?', [id]);
}

// Every care log (any plant) dated between startISO and endISO, inclusive.
// Used by the dashboard's "Ce mois-ci au jardin" section (lib/seasonalTasks.js's
// isTaskDone) to know which of this month's derived tasks are already done.
export function getCareLogsBetween(startISO, endISO) {
  return db.getAllAsync('SELECT * FROM care_logs WHERE date >= ? AND date <= ? ORDER BY date', [
    startISO,
    endISO,
  ]);
}

// Reminders
export function getRemindersByPlantId(plantId) {
  return db.getAllAsync('SELECT * FROM reminders WHERE plantId = ? ORDER BY nextDueDate', [
    plantId,
  ]);
}

// Reminders (ticket 022): repeatRule is null (every frequencyDays days) or
// 'yearly' (same month/day every year). Validated here, not just trusted,
// because it flows straight into a column read back by markReminderDone.
const VALID_REPEAT_RULES = new Set([null, 'yearly']);

export function createReminder({
  plantId,
  kind,
  frequencyDays,
  nextDueDate,
  lastDoneDate,
  repeatRule = null,
}) {
  if (!VALID_REPEAT_RULES.has(repeatRule)) {
    throw new Error(`Règle de répétition inconnue : ${repeatRule}`);
  }
  const id = uuid();
  const next = nextDueDate || new Date().toISOString().slice(0, 10);
  db.runSync(
    'INSERT INTO reminders (id, plantId, kind, frequencyDays, nextDueDate, lastDoneDate, enabled, repeatRule) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
    [id, plantId, kind, frequencyDays, next, lastDoneDate ?? null, repeatRule]
  );
  return id;
}

export async function markReminderDone(id) {
  const r = await db.getFirstAsync('SELECT * FROM reminders WHERE id = ?', [id]);
  if (!r || !r.nextDueDate) return;
  const nextStr =
    r.repeatRule === 'yearly'
      ? addYearsISO(r.nextDueDate, 1)
      : addDaysISO(r.nextDueDate, r.frequencyDays);
  if (!nextStr) return;
  db.runSync('UPDATE reminders SET lastDoneDate = ?, nextDueDate = ? WHERE id = ?', [
    r.nextDueDate,
    nextStr,
    id,
  ]);
}

export function deleteReminder(id) {
  db.runSync('DELETE FROM reminders WHERE id = ?', [id]);
}

// Photos
export async function getPhotosByPlantId(plantId) {
  const rows = await db.getAllAsync('SELECT * FROM photos WHERE plantId = ? ORDER BY date DESC', [
    plantId,
  ]);
  return rows.map((row) => ({ ...row, uri: resolveRowUri(row.uri) }));
}

export async function addPhoto({ plantId, careLogId, uri, date }) {
  const id = uuid();
  const photoDate = date || new Date().toISOString().slice(0, 10);
  const dir = photosDirectory();
  const fileName = photoFileName(id, uri);
  const target = new File(dir, fileName);
  new File(uri).copy(target);
  const relativeRef = `${PHOTOS_DIR_NAME}/${fileName}`;
  try {
    db.runSync('INSERT INTO photos (id, plantId, careLogId, uri, date) VALUES (?, ?, ?, ?, ?)', [
      id,
      plantId,
      careLogId ?? null,
      relativeRef,
      photoDate,
    ]);
  } catch (e) {
    // No row points at the copy, so it would be an orphan: remove it.
    if (target.exists) target.delete();
    throw e;
  }
  return id;
}

// Deletes the file a relative photo ref points at, if any. A missing file
// (already gone, or the ref isn't a local file at all) is not an error:
// the caller is about to delete the DB row either way.
function deletePhotoFile(uri) {
  if (!uri || !isRelativePhotoRef(uri)) return;
  try {
    const file = new File(Paths.document, uri);
    if (file.exists) file.delete();
  } catch {
    // The file may already be gone.
  }
}

export async function deletePhoto(id) {
  const photo = db.getFirstSync('SELECT uri FROM photos WHERE id = ?', [id]);
  deletePhotoFile(photo?.uri);
  db.runSync('DELETE FROM photos WHERE id = ?', [id]);
}

/** Attaches (or clears, with `text` null/empty) a note to an existing photo. */
export function setPhotoCaption(photoId, text) {
  db.runSync('UPDATE photos SET caption = ? WHERE id = ?', [text?.trim() || null, photoId]);
}

/** Changes an existing photo's date. Throws if the photo does not exist. */
export function updatePhotoDate(id, date) {
  const result = db.runSync('UPDATE photos SET date = ? WHERE id = ?', [date, id]);
  if (result.changes === 0) throw new Error('Photo introuvable');
}

// ---------------------------------------------------------------------------
// Settings (ticket 056): a small typed key/value store on top of app_meta,
// e.g. the capture screen's last-used zone.
// ---------------------------------------------------------------------------

export async function getSetting(key) {
  const row = await db.getFirstAsync('SELECT value FROM app_meta WHERE key = ?', [key]);
  return row?.value ?? null;
}

export function setSetting(key, value) {
  db.runSync(
    'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value]
  );
}

// ---------------------------------------------------------------------------
// Plant search API token (ticket 076): kept in the Keychain rather than the
// settings table above so it is never included in a backup export.
// ---------------------------------------------------------------------------

const API_TOKEN_KEY = 'plantSearchToken';

export async function getApiToken() {
  return (await SecureStore.getItemAsync(API_TOKEN_KEY)) ?? null;
}

export async function setApiToken(token) {
  const trimmed = typeof token === 'string' ? token.trim() : '';
  if (!trimmed) {
    await SecureStore.deleteItemAsync(API_TOKEN_KEY);
    return;
  }
  await SecureStore.setItemAsync(API_TOKEN_KEY, trimmed);
}

// ---------------------------------------------------------------------------
// Unsorted photos (ticket 056): the "?" bucket for a garden-walk shot not
// filed against a plant yet. Filing them into the library is ticket 061's
// scope; this only needs to store them somewhere that ticket can read from.
// ---------------------------------------------------------------------------

export async function addUnsortedPhoto({ uri, takenAt, dateUnknown = false }) {
  const id = uuid();
  const takenAtValue = takenAt || new Date().toISOString();
  const dir = photosDirectory();
  const fileName = photoFileName(id, uri);
  const target = new File(dir, fileName);
  new File(uri).copy(target);
  const relativeRef = `${PHOTOS_DIR_NAME}/${fileName}`;
  try {
    db.runSync(
      'INSERT INTO unsorted_photos (id, uri, takenAt, caption, dateUnknown) VALUES (?, ?, ?, ?, ?)',
      [id, relativeRef, takenAtValue, null, dateUnknown ? 1 : 0]
    );
  } catch (e) {
    // No row points at the copy, so it would be an orphan: remove it.
    if (target.exists) target.delete();
    throw e;
  }
  return id;
}

export async function getUnsortedPhotos() {
  const rows = await db.getAllAsync('SELECT * FROM unsorted_photos ORDER BY takenAt DESC');
  return rows.map((row) => ({
    ...row,
    uri: resolveRowUri(row.uri),
    dateUnknown: !!row.dateUnknown,
  }));
}

export async function deleteUnsortedPhoto(id) {
  const photo = db.getFirstSync('SELECT uri FROM unsorted_photos WHERE id = ?', [id]);
  if (photo?.uri && isRelativePhotoRef(photo.uri)) {
    try {
      const file = new File(Paths.document, photo.uri);
      if (file.exists) file.delete();
    } catch {
      // The file may already be gone; the DB row is deleted either way.
    }
  }
  db.runSync('DELETE FROM unsorted_photos WHERE id = ?', [id]);
}

// ---------------------------------------------------------------------------
// Bloom observations (ticket 056, storage part of 029): one "seen blooming"
// mark per plant per day, from the capture screen's "En fleur" toggle.
// ---------------------------------------------------------------------------

export async function addBloomObservation({ plantId, date }) {
  const existing = await db.getFirstAsync(
    'SELECT id FROM bloom_observations WHERE plantId = ? AND date = ? AND kind = ?',
    [plantId, date, 'open']
  );
  if (existing) return existing.id;
  const id = uuid();
  db.runSync('INSERT INTO bloom_observations (id, plantId, date, kind) VALUES (?, ?, ?, ?)', [
    id,
    plantId,
    date,
    'open',
  ]);
  return id;
}

export function getBloomObservations(plantId) {
  return db.getAllAsync('SELECT * FROM bloom_observations WHERE plantId = ? ORDER BY date', [
    plantId,
  ]);
}

function getMissingPhotoIds() {
  const row = db.getFirstSync('SELECT value FROM app_meta WHERE key = ?', [
    MISSING_PHOTOS_META_KEY,
  ]);
  if (!row?.value) return new Set();
  try {
    return new Set(JSON.parse(row.value));
  } catch {
    return new Set();
  }
}

function setMissingPhotoIds(ids) {
  db.runSync(
    'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [MISSING_PHOTOS_META_KEY, JSON.stringify([...ids])]
  );
}

/**
 * One-time (idempotent) migration of photo rows that still point into the
 * image picker's cache: copies files that still exist into the owned
 * `photos/` directory and rewrites their row to the relative ref. Rows whose
 * file is already gone are left untouched (so the app can show a
 * placeholder instead of losing the entry) and reported once — a photo id
 * already recorded in `app_meta` is not counted again on a later launch.
 */
export async function migratePhotosToAppStorage() {
  const rows = db.getAllSync('SELECT id, uri FROM photos');
  const fileExists = (uri) => {
    try {
      return new File(uri).exists;
    } catch {
      return false;
    }
  };
  const { toCopy, missing } = planPhotoMigration(rows, fileExists);

  const dir = photosDirectory();
  let copied = 0;
  for (const row of toCopy) {
    try {
      const fileName = photoFileName(row.id, row.uri);
      const target = new File(dir, fileName);
      // A previous run may have copied the file but not updated the row.
      if (!target.exists) new File(row.uri).copy(target);
      db.runSync('UPDATE photos SET uri = ? WHERE id = ?', [
        `${PHOTOS_DIR_NAME}/${fileName}`,
        row.id,
      ]);
      copied++;
    } catch {
      // Leave the row untouched; retried on the next launch.
    }
  }

  const knownMissing = getMissingPhotoIds();
  const newlyMissing = missing.filter((row) => !knownMissing.has(row.id));
  for (const row of missing) knownMissing.add(row.id);
  setMissingPhotoIds(knownMissing);

  return { copied, missing: newlyMissing.length };
}

// ---------------------------------------------------------------------------
// Backup & restore (ticket 020)
// ---------------------------------------------------------------------------

/**
 * Raw rows for every user-data table, plus each photo's file as base64 (or
 * `null` when the file could not be read, e.g. it was already reported
 * missing by migratePhotosToAppStorage). lib/backupFormat.js's buildBackup
 * turns this into the archive; this function never touches JSON itself.
 */
export async function exportGarden() {
  const [zones, plants, reminders, careLogs, photos, unsortedPhotos, bloomObservations] =
    await Promise.all([
      db.getAllAsync('SELECT * FROM zones'),
      db.getAllAsync('SELECT * FROM plants'),
      db.getAllAsync('SELECT * FROM reminders'),
      db.getAllAsync('SELECT * FROM care_logs'),
      db.getAllAsync('SELECT * FROM photos'),
      db.getAllAsync('SELECT * FROM unsorted_photos'),
      db.getAllAsync('SELECT * FROM bloom_observations'),
    ]);

  const photoData = {};
  for (const photo of photos) {
    let entry = null;
    if (isRelativePhotoRef(photo.uri)) {
      try {
        const file = new File(Paths.document, photo.uri);
        if (file.exists) {
          entry = { ext: extensionOfRelativeRef(photo.uri), base64: await file.base64() };
        }
      } catch {
        entry = null;
      }
    }
    photoData[photo.id] = entry;
  }

  const unsortedPhotoData = {};
  for (const photo of unsortedPhotos) {
    let entry = null;
    if (isRelativePhotoRef(photo.uri)) {
      try {
        const file = new File(Paths.document, photo.uri);
        if (file.exists) {
          entry = { ext: extensionOfRelativeRef(photo.uri), base64: await file.base64() };
        }
      } catch {
        entry = null;
      }
    }
    unsortedPhotoData[photo.id] = entry;
  }

  return {
    tables: {
      zones,
      plants,
      reminders,
      care_logs: careLogs,
      photos,
      unsorted_photos: unsortedPhotos,
      bloom_observations: bloomObservations,
    },
    photoData,
    unsortedPhotoData,
  };
}

export async function isGardenEmpty() {
  const row = await db.getFirstAsync(`SELECT
    (SELECT COUNT(*) FROM zones) +
    (SELECT COUNT(*) FROM plants) +
    (SELECT COUNT(*) FROM reminders) +
    (SELECT COUNT(*) FROM care_logs) +
    (SELECT COUNT(*) FROM photos) +
    (SELECT COUNT(*) FROM unsorted_photos) +
    (SELECT COUNT(*) FROM bloom_observations) as total`);
  return (row?.total ?? 0) === 0;
}

function insertRow(table, row) {
  const columns = TABLE_COLUMNS[table];
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map((c) => row[c] ?? null);
  db.runSync(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`, values);
}

/**
 * Replaces the entire garden with a validated backup (see
 * lib/backupFormat.js's parseBackup — this function trusts its input
 * completely and does no validation of its own).
 *
 * Order of operations, so a failure never leaves a half-replaced garden:
 * 1. Write every photo file into `photos/` under a brand-new name (nothing
 *    existing is touched or overwritten yet).
 * 2. One transaction deletes every row of every user table and inserts the
 *    backup's rows, photos pointing at the files just written.
 * 3. Only if that transaction commits: delete the photo files the old
 *    garden owned. If it throws instead, the newly written files are
 *    removed and the error is rethrown — the old garden (rows and files) is
 *    untouched.
 */
// Writes each row's { ext, base64 } file into `dir` under a fresh name and
// returns { refsById, writtenFiles, skipped }: `refsById[row.id]` is the new
// relative ref (or null if the file was absent/unreadable), `writtenFiles`
// the File handles to roll back on failure, `skipped` the count of rows with
// no ref. Shared by importGarden's photos and unsorted_photos tables, which
// archive a file the same way (see lib/backupFormat.js).
function writeArchivedFiles(rows, dir) {
  const refsById = {};
  const writtenFiles = [];
  let skipped = 0;
  for (const row of rows) {
    if (!row.file) {
      refsById[row.id] = null;
      skipped++;
      continue;
    }
    try {
      const fileName = `${uuid()}.${row.file.ext}`;
      const target = new File(dir, fileName);
      target.write(row.file.base64, { encoding: 'base64' });
      writtenFiles.push(target);
      refsById[row.id] = `${PHOTOS_DIR_NAME}/${fileName}`;
    } catch {
      refsById[row.id] = null;
      skipped++;
    }
  }
  return { refsById, writtenFiles, skipped };
}

export async function importGarden(backup) {
  const { tables } = backup;
  const unsortedPhotoRows = tables.unsorted_photos ?? [];
  const bloomObservationRows = tables.bloom_observations ?? [];
  const dir = photosDirectory();

  const photoFiles = writeArchivedFiles(tables.photos, dir);
  const unsortedFiles = writeArchivedFiles(unsortedPhotoRows, dir);
  const writtenFiles = [...photoFiles.writtenFiles, ...unsortedFiles.writtenFiles];
  const skippedPhotos = photoFiles.skipped;

  const oldPhotoRefs = [
    ...db.getAllSync('SELECT uri FROM photos').map((r) => r.uri),
    ...db.getAllSync('SELECT uri FROM unsorted_photos').map((r) => r.uri),
  ].filter(isRelativePhotoRef);

  const runReplace = () => {
    db.runSync('DELETE FROM bloom_observations');
    db.runSync('DELETE FROM unsorted_photos');
    db.runSync('DELETE FROM photos');
    db.runSync('DELETE FROM reminders');
    db.runSync('DELETE FROM care_logs');
    db.runSync('DELETE FROM plants');
    db.runSync('DELETE FROM zones');
    for (const zone of tables.zones) insertRow('zones', zone);
    for (const plant of tables.plants) insertRow('plants', plant);
    for (const log of tables.care_logs) insertRow('care_logs', log);
    for (const reminder of tables.reminders) insertRow('reminders', reminder);
    for (const photo of tables.photos) {
      const ref = photoFiles.refsById[photo.id];
      if (!ref) continue;
      db.runSync(
        'INSERT INTO photos (id, plantId, careLogId, uri, date, caption) VALUES (?, ?, ?, ?, ?, ?)',
        [photo.id, photo.plantId, photo.careLogId ?? null, ref, photo.date, photo.caption ?? null]
      );
    }
    for (const photo of unsortedPhotoRows) {
      const ref = unsortedFiles.refsById[photo.id];
      if (!ref) continue;
      db.runSync(
        'INSERT INTO unsorted_photos (id, uri, takenAt, caption, dateUnknown) VALUES (?, ?, ?, ?, ?)',
        [photo.id, ref, photo.takenAt, photo.caption ?? null, photo.dateUnknown ? 1 : 0]
      );
    }
    for (const observation of bloomObservationRows) insertRow('bloom_observations', observation);
  };

  try {
    if (typeof db.withTransactionSync === 'function') {
      db.withTransactionSync(runReplace);
    } else {
      db.execSync('BEGIN');
      try {
        runReplace();
        db.execSync('COMMIT');
      } catch (e) {
        db.execSync('ROLLBACK');
        throw e;
      }
    }
  } catch (e) {
    for (const file of writtenFiles) {
      try {
        if (file.exists) file.delete();
      } catch {
        // Best-effort cleanup; the old garden's rows are untouched either way.
      }
    }
    throw e;
  }

  for (const ref of oldPhotoRefs) {
    try {
      const file = new File(Paths.document, ref);
      if (file.exists) file.delete();
    } catch {
      // Best-effort: an orphaned file is a disk-space debt, not data loss.
    }
  }

  return {
    imported: {
      zones: tables.zones.length,
      plants: tables.plants.length,
      reminders: tables.reminders.length,
      care_logs: tables.care_logs.length,
      photos: tables.photos.length - skippedPhotos,
      unsorted_photos: unsortedPhotoRows.length - unsortedFiles.skipped,
      bloom_observations: bloomObservationRows.length,
    },
    skippedPhotos,
  };
}

// Bloom: plants blooming in a given month
export async function getPlantsBloomingInMonth(month) {
  const rows = await db.getAllAsync(
    `SELECT p.*, z.name as zoneName,
     (SELECT uri FROM photos WHERE plantId = p.id ORDER BY date DESC LIMIT 1) as photoUri
     FROM plants p
     LEFT JOIN zones z ON p.zoneId = z.id
     WHERE p.bloomStartMonth IS NOT NULL AND p.bloomEndMonth IS NOT NULL
     ORDER BY p.name`
  );
  return rows
    .filter((p) => isMonthInRange(month, p.bloomStartMonth, p.bloomEndMonth))
    .map(withResolvedPhotoUri);
}

// Dashboard: due today
export async function getDueTodayReminders() {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.getAllAsync(
    `
    SELECT r.*, p.name as plantName, p.id as plantId, z.name as zoneName,
     (SELECT uri FROM photos WHERE plantId = p.id ORDER BY date DESC LIMIT 1) as photoUri
    FROM reminders r
    JOIN plants p ON r.plantId = p.id
    LEFT JOIN zones z ON p.zoneId = z.id
    WHERE r.enabled = 1 AND r.nextDueDate = ?
    ORDER BY r.kind
  `,
    [today]
  );
  return rows.map(withResolvedPhotoUri);
}

export async function getOverdueReminders() {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.getAllAsync(
    `
    SELECT r.*, p.name as plantName, p.id as plantId, z.name as zoneName,
     (SELECT uri FROM photos WHERE plantId = p.id ORDER BY date DESC LIMIT 1) as photoUri
    FROM reminders r
    JOIN plants p ON r.plantId = p.id
    LEFT JOIN zones z ON p.zoneId = z.id
    WHERE r.enabled = 1 AND r.nextDueDate < ?
    ORDER BY r.nextDueDate
  `,
    [today]
  );
  return rows.map(withResolvedPhotoUri);
}

// Zone detail: all plants with best available image. `zoneId: null` (the
// capture screen's "Sans zone", ticket 056) returns plants with no zone
// rather than none, hence the IS NULL branch.
export async function getPlantsByZoneWithImages(zoneId) {
  const rows = await db.getAllAsync(
    `SELECT p.id, p.name, p.sun, p.imageUrls,
     (SELECT uri FROM photos WHERE plantId = p.id ORDER BY date DESC LIMIT 1) as photoUri
     FROM plants p
     WHERE p.zoneId ${zoneId == null ? 'IS NULL' : '= ?'}
     ORDER BY p.createdAt DESC`,
    zoneId == null ? [] : [zoneId]
  );
  return rows.map(withResolvedPhotoUri);
}

// Zone context: last watering, next reminder, sun exposure
export async function getZoneContextInfo(zoneId) {
  const [lastWatering, nextReminder, sunInfo] = await Promise.all([
    db.getFirstAsync(
      `SELECT cl.date FROM care_logs cl
       JOIN plants p ON cl.plantId = p.id
       WHERE p.zoneId = ? AND cl.type = 'watered'
       ORDER BY cl.date DESC LIMIT 1`,
      [zoneId]
    ),
    db.getFirstAsync(
      `SELECT r.kind, r.nextDueDate FROM reminders r
       JOIN plants p ON r.plantId = p.id
       WHERE p.zoneId = ? AND r.enabled = 1
       ORDER BY r.nextDueDate ASC LIMIT 1`,
      [zoneId]
    ),
    db.getFirstAsync(
      `SELECT sun, COUNT(*) as cnt FROM plants
       WHERE zoneId = ? AND sun IS NOT NULL AND sun != 'unknown'
       GROUP BY sun ORDER BY cnt DESC LIMIT 1`,
      [zoneId]
    ),
  ]);

  return { lastWatering, nextReminder, sunInfo };
}
