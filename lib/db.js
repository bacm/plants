import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import { File, Directory, Paths } from 'expo-file-system';
import { addDaysISO, addYearsISO } from './dates';
import { isMonthInRange } from './months';
import { showyFirst } from './bloomCoverage';
import { pickPlantUpdates, plantInsertValues } from './plantFields';
import { pickZoneUpdates } from './zoneFields';
import {
  GARDEN_PLAN_ID,
  assertValidPlanSize,
  assertValidPosition,
  serializePolygon,
} from './gardenPlan';
import {
  photoFileName,
  isRelativePhotoRef,
  resolvePhotoUri,
  planPhotoMigration,
  extensionOfRelativeRef,
} from './photoRefs';
import {
  TABLE_COLUMNS,
  BACKUP_VERSION,
  BACKUP_VERSION_STREAMED,
  buildBackup,
  parseBackup,
} from './backupFormat';
import {
  PHOTO_TABLES,
  encodeBackupLines,
  asciiToByteSlices,
  readBackupHeader,
  readBackupPhotos,
} from './backupStream';
import { sameByteSize } from './photoFingerprint';
import { SYNCED_TABLES, nowStamp } from './syncFields';
import { PHOTO_TABLES as SYNC_PHOTO_TABLES, orderedChanges, planRemoteRow } from './sync';
import { mimeForExtension, sniffImageExtension } from './photoMime';

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

    CREATE TABLE IF NOT EXISTS sync_photo_state (
      id TEXT PRIMARY KEY NOT NULL,
      uploaded INTEGER NOT NULL DEFAULT 0,
      pending_download INTEGER NOT NULL DEFAULT 0
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

    CREATE TABLE IF NOT EXISTS garden_plan (
      id TEXT PRIMARY KEY NOT NULL,
      widthCm INTEGER NOT NULL,
      lengthCm INTEGER NOT NULL,
      updatedAt TEXT,
      deletedAt TEXT
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
  try {
    db.runSync('ALTER TABLE plants ADD COLUMN coverPhotoId TEXT');
  } catch {}
  try {
    db.runSync('ALTER TABLE plants ADD COLUMN bloomAbundance TEXT');
  } catch {}

  // Migration: the garden plan (ticket 105). A zone's outline (JSON string of
  // [x, y] cm points) and a plant's position on the plan, in integer cm.
  try {
    db.runSync('ALTER TABLE zones ADD COLUMN polygon TEXT');
  } catch {}
  try {
    db.runSync('ALTER TABLE plants ADD COLUMN planX INTEGER');
  } catch {}
  try {
    db.runSync('ALTER TABLE plants ADD COLUMN planY INTEGER');
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

  // Migration: a fingerprint of the original library photo (ticket 085, see
  // lib/photoFingerprint.js), kept from the unsorted row onto the filed photo
  // so app/sort.js can warn when a plant already has the photo.
  try {
    db.runSync('ALTER TABLE photos ADD COLUMN fingerprint TEXT');
  } catch {}
  try {
    db.runSync('ALTER TABLE unsorted_photos ADD COLUMN fingerprint TEXT');
  } catch {}

  // Migration: change tracking for sync (ticket 091). `updatedAt` is the ISO
  // stamp of a row's last change, `deletedAt` marks a row deleted without
  // removing it so a later sync can propagate the deletion.
  const syncColumns = [
    'ALTER TABLE zones ADD COLUMN updatedAt TEXT',
    'ALTER TABLE zones ADD COLUMN deletedAt TEXT',
    'ALTER TABLE plants ADD COLUMN updatedAt TEXT',
    'ALTER TABLE plants ADD COLUMN deletedAt TEXT',
    'ALTER TABLE care_logs ADD COLUMN updatedAt TEXT',
    'ALTER TABLE care_logs ADD COLUMN deletedAt TEXT',
    'ALTER TABLE reminders ADD COLUMN updatedAt TEXT',
    'ALTER TABLE reminders ADD COLUMN deletedAt TEXT',
    'ALTER TABLE photos ADD COLUMN updatedAt TEXT',
    'ALTER TABLE photos ADD COLUMN deletedAt TEXT',
    'ALTER TABLE unsorted_photos ADD COLUMN updatedAt TEXT',
    'ALTER TABLE unsorted_photos ADD COLUMN deletedAt TEXT',
    'ALTER TABLE bloom_observations ADD COLUMN updatedAt TEXT',
    'ALTER TABLE bloom_observations ADD COLUMN deletedAt TEXT',
  ];
  for (const statement of syncColumns) {
    try {
      db.runSync(statement);
    } catch {}
  }
  // Rows that predate the column get one shared stamp. Table names come from
  // the SYNCED_TABLES constant, never from a caller.
  const legacyStamp = nowStamp();
  for (const table of SYNCED_TABLES) {
    db.runSync(`UPDATE ${table} SET updatedAt = ? WHERE updatedAt IS NULL`, [legacyStamp]);
  }
}

// Ticket 094: a tiny change notification so the sync runner can schedule a
// push a few seconds after a local write. Called from every function that
// writes a synced table; never from applyRemoteRows or a migration.
const localChangeListeners = new Set();

export function onLocalChange(listener) {
  localChangeListeners.add(listener);
  return () => localChangeListeners.delete(listener);
}

function notifyLocalChange() {
  for (const listener of [...localChangeListeners]) {
    try {
      listener();
    } catch {
      // A listener failing must not fail the write that triggered it.
    }
  }
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
  return db.getAllAsync('SELECT * FROM zones WHERE deletedAt IS NULL ORDER BY orderIndex, name');
}

export function createZone({ name, description, icon, orderIndex = 0, polygon = null }) {
  const id = uuid();
  db.runSync(
    'INSERT INTO zones (id, name, description, icon, orderIndex, polygon, updatedAt, deletedAt) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)',
    [id, name, description ?? null, icon ?? null, orderIndex, serializePolygon(polygon), nowStamp()]
  );
  notifyLocalChange();
  return id;
}

export function updateZone(id, updates) {
  const entries = pickZoneUpdates(updates);
  if (!entries.length) return;
  const set = entries.map(([key]) => `${key} = ?`).join(', ');
  db.runSync(`UPDATE zones SET ${set}, updatedAt = ? WHERE id = ? AND deletedAt IS NULL`, [
    ...entries.map(([, v]) => v),
    nowStamp(),
    id,
  ]);
  notifyLocalChange();
}

// Garden plan (ticket 105). Column names are constants (rule 5).

/** The garden's size `{ widthCm, lengthCm }`, or null when no plan was created. */
export async function getGardenPlan() {
  const row = await db.getFirstAsync(
    'SELECT widthCm, lengthCm FROM garden_plan WHERE id = ? AND deletedAt IS NULL',
    [GARDEN_PLAN_ID]
  );
  return row ? { widthCm: row.widthCm, lengthCm: row.lengthCm } : null;
}

/** Creates or resizes the plan (single row, id 'main'). Throws a French Error on bad sizes. */
export function saveGardenPlan({ widthCm, lengthCm }) {
  assertValidPlanSize({ widthCm, lengthCm });
  db.runSync(
    `INSERT INTO garden_plan (id, widthCm, lengthCm, updatedAt, deletedAt) VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET widthCm = excluded.widthCm, lengthCm = excluded.lengthCm, updatedAt = excluded.updatedAt, deletedAt = NULL`,
    [GARDEN_PLAN_ID, widthCm, lengthCm, nowStamp()]
  );
  notifyLocalChange();
}

/**
 * Places a plant on the plan (x, y in cm; both null = unplace) in one write.
 * The zone is only touched when the `zoneId` key is present (null = no zone).
 */
export function setPlantPosition(plantId, position) {
  const { x, y } = position;
  assertValidPosition({ x, y });
  if ('zoneId' in position && position.zoneId !== undefined) {
    db.runSync(
      'UPDATE plants SET planX = ?, planY = ?, zoneId = ?, updatedAt = ? WHERE id = ? AND deletedAt IS NULL',
      [x, y, position.zoneId ?? null, nowStamp(), plantId]
    );
  } else {
    db.runSync(
      'UPDATE plants SET planX = ?, planY = ?, updatedAt = ? WHERE id = ? AND deletedAt IS NULL',
      [x, y, nowStamp(), plantId]
    );
  }
  notifyLocalChange();
}

/** Sets (or, with null, clears) a zone's outline. Throws on an invalid polygon. */
export function setZonePolygon(zoneId, polygon) {
  const serialized = serializePolygon(polygon);
  db.runSync('UPDATE zones SET polygon = ?, updatedAt = ? WHERE id = ? AND deletedAt IS NULL', [
    serialized,
    nowStamp(),
    zoneId,
  ]);
  notifyLocalChange();
}

export function deleteZone(id) {
  const stamp = nowStamp();
  db.runSync(
    'UPDATE plants SET zoneId = NULL, updatedAt = ? WHERE zoneId = ? AND deletedAt IS NULL',
    [stamp, id]
  );
  db.runSync('UPDATE zones SET deletedAt = ?, updatedAt = ? WHERE id = ? AND deletedAt IS NULL', [
    stamp,
    stamp,
    id,
  ]);
  notifyLocalChange();
}

export async function countPlantsInZone(zoneId) {
  const row = await db.getFirstAsync(
    'SELECT COUNT(*) as count FROM plants WHERE zoneId = ? AND deletedAt IS NULL',
    [zoneId]
  );
  return row?.count ?? 0;
}

// Ticket 088: a plant's photo is its chosen cover if that photo still exists
// and still belongs to the plant, else its newest photo. Expects the plants
// table to be aliased `p`.
const PLANT_PHOTO_URI_SQL = `COALESCE(
  (SELECT uri FROM photos WHERE id = p.coverPhotoId AND plantId = p.id AND deletedAt IS NULL),
  (SELECT uri FROM photos WHERE plantId = p.id AND deletedAt IS NULL ORDER BY date DESC LIMIT 1))`;

// Plants
export async function getPlants(filters = {}) {
  let sql = `
    SELECT p.*, z.name as zoneName,
      (SELECT COUNT(*) FROM reminders r WHERE r.plantId = p.id AND r.enabled = 1 AND r.deletedAt IS NULL) as reminderCount,
      ${PLANT_PHOTO_URI_SQL} as photoUri
    FROM plants p
    LEFT JOIN zones z ON p.zoneId = z.id AND z.deletedAt IS NULL
    WHERE p.deletedAt IS NULL
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
    'SELECT p.*, z.name as zoneName FROM plants p LEFT JOIN zones z ON p.zoneId = z.id AND z.deletedAt IS NULL WHERE p.id = ? AND p.deletedAt IS NULL',
    [id]
  );
  return row ?? null;
}

export function createPlant(plant) {
  const id = uuid();
  const { columns, values } = plantInsertValues(plant);
  const placeholders = columns.map(() => '?').join(', ');
  db.runSync(
    `INSERT INTO plants (id, ${columns.join(', ')}, updatedAt, deletedAt) VALUES (?, ${placeholders}, ?, NULL)`,
    [id, ...values, nowStamp()]
  );
  notifyLocalChange();
  return id;
}

export function updatePlant(id, updates) {
  const entries = pickPlantUpdates(updates);
  if (!entries.length) return;
  const set = entries.map(([key]) => `${key} = ?`).join(', ');
  db.runSync(`UPDATE plants SET ${set}, updatedAt = ? WHERE id = ? AND deletedAt IS NULL`, [
    ...entries.map(([, v]) => v),
    nowStamp(),
    id,
  ]);
  notifyLocalChange();
}

export function deletePlant(id) {
  const photos = db.getAllSync('SELECT uri FROM photos WHERE plantId = ? AND deletedAt IS NULL', [
    id,
  ]);
  const stamp = nowStamp();
  const runDelete = () => {
    const mark = 'SET deletedAt = ?, updatedAt = ? WHERE deletedAt IS NULL AND';
    db.runSync(`UPDATE photos ${mark} plantId = ?`, [stamp, stamp, id]);
    db.runSync(`UPDATE bloom_observations ${mark} plantId = ?`, [stamp, stamp, id]);
    db.runSync(`UPDATE care_logs ${mark} plantId = ?`, [stamp, stamp, id]);
    db.runSync(`UPDATE reminders ${mark} plantId = ?`, [stamp, stamp, id]);
    db.runSync(`UPDATE plants ${mark} id = ?`, [stamp, stamp, id]);
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
  notifyLocalChange();
}

// Care logs
export function getCareLogsByPlantId(plantId) {
  return db.getAllAsync(
    'SELECT * FROM care_logs WHERE plantId = ? AND deletedAt IS NULL ORDER BY date DESC',
    [plantId]
  );
}

export function createCareLog({ plantId, type, date, notes }) {
  const id = uuid();
  const d = date || new Date().toISOString().slice(0, 10);
  db.runSync(
    'INSERT INTO care_logs (id, plantId, type, date, notes, updatedAt, deletedAt) VALUES (?, ?, ?, ?, ?, ?, NULL)',
    [id, plantId, type, d, notes ?? null, nowStamp()]
  );
  notifyLocalChange();
  return id;
}

export function deleteCareLog(id) {
  const stamp = nowStamp();
  db.runSync(
    'UPDATE photos SET careLogId = NULL, updatedAt = ? WHERE careLogId = ? AND deletedAt IS NULL',
    [stamp, id]
  );
  db.runSync(
    'UPDATE care_logs SET deletedAt = ?, updatedAt = ? WHERE id = ? AND deletedAt IS NULL',
    [stamp, stamp, id]
  );
  notifyLocalChange();
}

// Every care log (any plant) dated between startISO and endISO, inclusive.
// Used by the dashboard's "Ce mois-ci au jardin" section (lib/seasonalTasks.js's
// isTaskDone) to know which of this month's derived tasks are already done.
export function getCareLogsBetween(startISO, endISO) {
  return db.getAllAsync(
    'SELECT * FROM care_logs WHERE date >= ? AND date <= ? AND deletedAt IS NULL ORDER BY date',
    [startISO, endISO]
  );
}

// Reminders
export function getRemindersByPlantId(plantId) {
  return db.getAllAsync(
    'SELECT * FROM reminders WHERE plantId = ? AND deletedAt IS NULL ORDER BY nextDueDate',
    [plantId]
  );
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
    'INSERT INTO reminders (id, plantId, kind, frequencyDays, nextDueDate, lastDoneDate, enabled, repeatRule, updatedAt, deletedAt) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)',
    [id, plantId, kind, frequencyDays, next, lastDoneDate ?? null, repeatRule, nowStamp()]
  );
  notifyLocalChange();
  return id;
}

export async function markReminderDone(id) {
  const r = await db.getFirstAsync('SELECT * FROM reminders WHERE id = ? AND deletedAt IS NULL', [
    id,
  ]);
  if (!r || !r.nextDueDate) return;
  const nextStr =
    r.repeatRule === 'yearly'
      ? addYearsISO(r.nextDueDate, 1)
      : addDaysISO(r.nextDueDate, r.frequencyDays);
  if (!nextStr) return;
  db.runSync('UPDATE reminders SET lastDoneDate = ?, nextDueDate = ?, updatedAt = ? WHERE id = ?', [
    r.nextDueDate,
    nextStr,
    nowStamp(),
    id,
  ]);
  notifyLocalChange();
}

export function deleteReminder(id) {
  const stamp = nowStamp();
  db.runSync(
    'UPDATE reminders SET deletedAt = ?, updatedAt = ? WHERE id = ? AND deletedAt IS NULL',
    [stamp, stamp, id]
  );
  notifyLocalChange();
}

// Photos
export async function getPhotosByPlantId(plantId) {
  const rows = await db.getAllAsync(
    'SELECT * FROM photos WHERE plantId = ? AND deletedAt IS NULL ORDER BY date DESC',
    [plantId]
  );
  return rows.map((row) => ({ ...row, uri: resolveRowUri(row.uri) }));
}

export async function addPhoto({ plantId, careLogId, uri, date, fingerprint = null }) {
  const id = uuid();
  const photoDate = date || new Date().toISOString().slice(0, 10);
  const dir = photosDirectory();
  const fileName = photoFileName(id, uri);
  const target = new File(dir, fileName);
  new File(uri).copy(target);
  const relativeRef = `${PHOTOS_DIR_NAME}/${fileName}`;
  try {
    db.runSync(
      'INSERT INTO photos (id, plantId, careLogId, uri, date, fingerprint, updatedAt, deletedAt) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)',
      [id, plantId, careLogId ?? null, relativeRef, photoDate, fingerprint ?? null, nowStamp()]
    );
  } catch (e) {
    // No row points at the copy, so it would be an orphan: remove it.
    if (target.exists) target.delete();
    throw e;
  }
  notifyLocalChange();
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
  const photo = db.getFirstSync('SELECT uri FROM photos WHERE id = ? AND deletedAt IS NULL', [id]);
  const stamp = nowStamp();
  db.runSync('UPDATE photos SET deletedAt = ?, updatedAt = ? WHERE id = ? AND deletedAt IS NULL', [
    stamp,
    stamp,
    id,
  ]);
  deletePhotoFile(photo?.uri);
  notifyLocalChange();
}

/** Attaches (or clears, with `text` null/empty) a note to an existing photo. */
export function setPhotoCaption(photoId, text) {
  db.runSync('UPDATE photos SET caption = ?, updatedAt = ? WHERE id = ?', [
    text?.trim() || null,
    nowStamp(),
    photoId,
  ]);
  notifyLocalChange();
}

/** Changes an existing photo's date. Throws if the photo does not exist. */
export function updatePhotoDate(id, date) {
  const result = db.runSync('UPDATE photos SET date = ?, updatedAt = ? WHERE id = ?', [
    date,
    nowStamp(),
    id,
  ]);
  if (result.changes === 0) throw new Error('Photo introuvable');
  notifyLocalChange();
}

// Ticket 082: refile a photo under another plant (a sorting mistake). The
// file is named by photo id, so only the row changes. careLogId is cleared:
// that care entry belongs to the old plant.
export function movePhoto(id, plantId) {
  const result = db.runSync(
    'UPDATE photos SET plantId = ?, careLogId = NULL, updatedAt = ? WHERE id = ?',
    [plantId, nowStamp(), id]
  );
  if (result.changes === 0) throw new Error('Photo introuvable');
  notifyLocalChange();
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
// The Réglages field is gone (ticket 101); getApiToken stays only as a
// fallback for plant search until the owner logs in. Ticket 104 removes it.

// ---------------------------------------------------------------------------
// Account session (ticket 101): the device token returned by /auth/login and
// the signed-in account, both in the Keychain under keys distinct from the
// legacy search token, so neither reaches a backup export.
// ---------------------------------------------------------------------------

const DEVICE_TOKEN_KEY = 'accountDeviceToken';
const ACCOUNT_KEY = 'accountCached';

export async function getDeviceToken() {
  return (await SecureStore.getItemAsync(DEVICE_TOKEN_KEY)) ?? null;
}

export async function setDeviceToken(token) {
  if (!token) {
    await SecureStore.deleteItemAsync(DEVICE_TOKEN_KEY);
    return;
  }
  await SecureStore.setItemAsync(DEVICE_TOKEN_KEY, token);
}

// The account last seen by the server, so the phone shows who is logged in
// while offline.
export async function getCachedAccount() {
  const raw = await SecureStore.getItemAsync(ACCOUNT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function setCachedAccount(account) {
  if (!account) {
    await SecureStore.deleteItemAsync(ACCOUNT_KEY);
    return;
  }
  await SecureStore.setItemAsync(ACCOUNT_KEY, JSON.stringify(account));
}

// ---------------------------------------------------------------------------
// Unsorted photos (ticket 056): the "?" bucket for a garden-walk shot not
// filed against a plant yet. Filing them into the library is ticket 061's
// scope; this only needs to store them somewhere that ticket can read from.
// ---------------------------------------------------------------------------

export async function addUnsortedPhoto({ uri, takenAt, dateUnknown = false, fingerprint = null }) {
  const id = uuid();
  const takenAtValue = takenAt || new Date().toISOString();
  const dir = photosDirectory();
  const fileName = photoFileName(id, uri);
  const target = new File(dir, fileName);
  new File(uri).copy(target);
  const relativeRef = `${PHOTOS_DIR_NAME}/${fileName}`;
  try {
    db.runSync(
      'INSERT INTO unsorted_photos (id, uri, takenAt, caption, dateUnknown, fingerprint, updatedAt, deletedAt) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)',
      [id, relativeRef, takenAtValue, null, dateUnknown ? 1 : 0, fingerprint ?? null, nowStamp()]
    );
  } catch (e) {
    // No row points at the copy, so it would be an orphan: remove it.
    if (target.exists) target.delete();
    throw e;
  }
  notifyLocalChange();
  return id;
}

export async function getUnsortedPhotos() {
  const rows = await db.getAllAsync(
    'SELECT * FROM unsorted_photos WHERE deletedAt IS NULL ORDER BY takenAt DESC'
  );
  return rows.map((row) => ({
    ...row,
    uri: resolveRowUri(row.uri),
    dateUnknown: !!row.dateUnknown,
    fingerprint: row.fingerprint ?? null,
  }));
}

// Size in bytes of the stored file a relative ref points at, or 0 when the ref
// is not a local file, the file is gone or empty.
function storedFileSize(ref) {
  if (!ref || !isRelativePhotoRef(ref)) return 0;
  try {
    const file = new File(Paths.document, ref);
    return file.exists ? (file.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

const DUPLICATE_SELECT =
  'SELECT ph.id, ph.uri, ph.date, ph.plantId, pl.name AS plantName FROM photos ph JOIN plants pl ON pl.id = ph.plantId AND pl.deletedAt IS NULL';

function duplicateResult(row) {
  return {
    id: row.id,
    uri: resolveRowUri(row.uri),
    date: row.date,
    plantId: row.plantId,
    plantName: row.plantName,
  };
}

/**
 * Ticket 085: the filed photo that duplicates the unsorted photo `unsortedId`,
 * as `{ id, uri, date, plantId, plantName }`, or null. A match is either the
 * same fingerprint, or -- for photos filed before fingerprints existed -- no
 * fingerprint, the same `date` and an identical stored file size. Photos of
 * `plantId` win over photos of other plants, whatever the kind of match.
 */
export async function findDuplicateOfUnsorted(unsortedId, plantId, date) {
  const unsorted = await db.getFirstAsync(
    'SELECT uri, fingerprint FROM unsorted_photos WHERE id = ? AND deletedAt IS NULL',
    [unsortedId]
  );
  if (!unsorted) return null;
  if (unsorted.fingerprint) {
    const match = await db.getFirstAsync(
      `${DUPLICATE_SELECT} WHERE ph.deletedAt IS NULL AND ph.fingerprint = ? ORDER BY (ph.plantId = ?) DESC LIMIT 1`,
      [unsorted.fingerprint, plantId]
    );
    if (match) return duplicateResult(match);
  }
  const wanted = storedFileSize(unsorted.uri);
  if (!wanted) return null;
  const candidates = await db.getAllAsync(
    `${DUPLICATE_SELECT} WHERE ph.deletedAt IS NULL AND ph.fingerprint IS NULL AND ph.date = ? ORDER BY (ph.plantId = ?) DESC`,
    [date, plantId]
  );
  for (const candidate of candidates) {
    if (sameByteSize(wanted, storedFileSize(candidate.uri))) return duplicateResult(candidate);
  }
  return null;
}

export async function deleteUnsortedPhoto(id) {
  const photo = db.getFirstSync(
    'SELECT uri FROM unsorted_photos WHERE id = ? AND deletedAt IS NULL',
    [id]
  );
  const stamp = nowStamp();
  db.runSync(
    'UPDATE unsorted_photos SET deletedAt = ?, updatedAt = ? WHERE id = ? AND deletedAt IS NULL',
    [stamp, stamp, id]
  );
  if (photo?.uri && isRelativePhotoRef(photo.uri)) {
    try {
      const file = new File(Paths.document, photo.uri);
      if (file.exists) file.delete();
    } catch {
      // The file may already be gone; the DB row is deleted either way.
    }
  }
  notifyLocalChange();
}

// ---------------------------------------------------------------------------
// Bloom observations (ticket 056, storage part of 029): one "seen blooming"
// mark per plant per day, from the capture screen's "En fleur" toggle.
// ---------------------------------------------------------------------------

export async function addBloomObservation({ plantId, date }) {
  const existing = await db.getFirstAsync(
    'SELECT id FROM bloom_observations WHERE plantId = ? AND date = ? AND kind = ? AND deletedAt IS NULL',
    [plantId, date, 'open']
  );
  if (existing) return existing.id;
  const id = uuid();
  db.runSync(
    'INSERT INTO bloom_observations (id, plantId, date, kind, updatedAt, deletedAt) VALUES (?, ?, ?, ?, ?, NULL)',
    [id, plantId, date, 'open', nowStamp()]
  );
  notifyLocalChange();
  return id;
}

export function getBloomObservations(plantId) {
  return db.getAllAsync(
    'SELECT * FROM bloom_observations WHERE plantId = ? AND deletedAt IS NULL ORDER BY date',
    [plantId]
  );
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
  const rows = db.getAllSync('SELECT id, uri FROM photos WHERE deletedAt IS NULL');
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
      // `uri` is a device-local path: deliberately no updatedAt bump.
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

const EXPORT_TABLES = Object.keys(TABLE_COLUMNS);

// The photo file behind a row, or null when it is missing on disk (e.g. it
// was already reported missing by migratePhotosToAppStorage).
function existingPhotoFile(row) {
  if (!isRelativePhotoRef(row.uri)) return null;
  try {
    const file = new File(Paths.document, row.uri);
    return file.exists ? file : null;
  } catch {
    return null;
  }
}

/**
 * Writes the whole garden to a cache file in the streamed backup format
 * (lib/backupStream.js, ticket 102) and returns `{ uri, counts }`. Only one
 * photo's base64 is ever in memory: the header line is written first, then
 * each photo is read, written and released in turn. `onProgress(done, total)`
 * is called after each photo.
 */
export async function exportGardenToFile({ fileName, onProgress }) {
  const rows = {};
  for (const table of EXPORT_TABLES) {
    rows[table] = await db.getAllAsync(`SELECT * FROM ${table} WHERE deletedAt IS NULL`);
  }

  const pending = [];
  const descriptors = { photos: {}, unsorted_photos: {} };
  for (const table of PHOTO_TABLES) {
    for (const row of rows[table]) {
      const file = existingPhotoFile(row);
      descriptors[table][row.id] = file ? { ext: extensionOfRelativeRef(row.uri) } : null;
      if (file) pending.push({ table, id: row.id, ext: descriptors[table][row.id].ext, file });
    }
  }

  const header = buildBackup({
    tables: rows,
    photoData: descriptors.photos,
    unsortedPhotoData: descriptors.unsorted_photos,
    version: BACKUP_VERSION_STREAMED,
  });

  async function* photoEntries() {
    let done = 0;
    for (const item of pending) {
      let base64 = null;
      try {
        base64 = await item.file.base64();
      } catch {
        // Vanished since the header was written: the row imports as skipped.
      }
      done++;
      if (onProgress) onProgress(done, pending.length);
      if (base64 !== null) yield { table: item.table, id: item.id, ext: item.ext, base64 };
    }
  }

  const out = new File(Paths.cache, fileName);
  out.create({ overwrite: true });
  const handle = out.open();
  try {
    for await (const line of encodeBackupLines(header, photoEntries())) {
      for (const bytes of asciiToByteSlices(line)) handle.writeBytes(bytes);
    }
  } finally {
    handle.close();
  }
  return { uri: out.uri, counts: header.counts };
}

export async function isGardenEmpty() {
  const row = await db.getFirstAsync(`SELECT
    (SELECT COUNT(*) FROM zones WHERE deletedAt IS NULL) +
    (SELECT COUNT(*) FROM garden_plan WHERE deletedAt IS NULL) +
    (SELECT COUNT(*) FROM plants WHERE deletedAt IS NULL) +
    (SELECT COUNT(*) FROM reminders WHERE deletedAt IS NULL) +
    (SELECT COUNT(*) FROM care_logs WHERE deletedAt IS NULL) +
    (SELECT COUNT(*) FROM photos WHERE deletedAt IS NULL) +
    (SELECT COUNT(*) FROM unsorted_photos WHERE deletedAt IS NULL) +
    (SELECT COUNT(*) FROM bloom_observations WHERE deletedAt IS NULL) as total`);
  return (row?.total ?? 0) === 0;
}

function insertRow(table, row, stamp) {
  const columns = TABLE_COLUMNS[table];
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map((c) =>
    c === 'updatedAt' ? (row.updatedAt ?? stamp) : (row[c] ?? null)
  );
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
  const dir = photosDirectory();

  const photoFiles = writeArchivedFiles(tables.photos, dir);
  const unsortedFiles = writeArchivedFiles(tables.unsorted_photos ?? [], dir);
  return commitImport(tables, {
    photoRefs: photoFiles.refsById,
    unsortedRefs: unsortedFiles.refsById,
    writtenFiles: [...photoFiles.writtenFiles, ...unsortedFiles.writtenFiles],
  });
}

// The database half of an import, shared by importGarden (version 1, files
// written from inline base64) and importGardenFromFile (version 2, files
// staged while streaming). `photoRefs` / `unsortedRefs` map a row id to the
// relative ref of its already-written file; a row with no ref is skipped.
// `writtenFiles` are deleted if the transaction fails.
function commitImport(tables, { photoRefs, unsortedRefs, writtenFiles }) {
  const unsortedPhotoRows = tables.unsorted_photos ?? [];
  const bloomObservationRows = tables.bloom_observations ?? [];
  const gardenPlanRows = tables.garden_plan ?? [];
  const skippedPhotos = tables.photos.filter((p) => !photoRefs[p.id]).length;
  const skippedUnsorted = unsortedPhotoRows.filter((p) => !unsortedRefs[p.id]).length;

  const oldPhotoRefs = [
    ...db.getAllSync('SELECT uri FROM photos').map((r) => r.uri),
    ...db.getAllSync('SELECT uri FROM unsorted_photos').map((r) => r.uri),
  ].filter(isRelativePhotoRef);

  const stamp = nowStamp();
  const runReplace = () => {
    db.runSync('DELETE FROM bloom_observations');
    db.runSync('DELETE FROM unsorted_photos');
    db.runSync('DELETE FROM photos');
    db.runSync('DELETE FROM reminders');
    db.runSync('DELETE FROM care_logs');
    db.runSync('DELETE FROM plants');
    db.runSync('DELETE FROM zones');
    db.runSync('DELETE FROM garden_plan');
    for (const zone of tables.zones) insertRow('zones', zone, stamp);
    for (const plan of gardenPlanRows) insertRow('garden_plan', plan, stamp);
    for (const plant of tables.plants) insertRow('plants', plant, stamp);
    for (const log of tables.care_logs) insertRow('care_logs', log, stamp);
    for (const reminder of tables.reminders) insertRow('reminders', reminder, stamp);
    for (const photo of tables.photos) {
      const ref = photoRefs[photo.id];
      if (!ref) continue;
      db.runSync(
        'INSERT INTO photos (id, plantId, careLogId, uri, date, caption, fingerprint, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          photo.id,
          photo.plantId,
          photo.careLogId ?? null,
          ref,
          photo.date,
          photo.caption ?? null,
          photo.fingerprint ?? null,
          photo.updatedAt ?? stamp,
        ]
      );
    }
    for (const photo of unsortedPhotoRows) {
      const ref = unsortedRefs[photo.id];
      if (!ref) continue;
      db.runSync(
        'INSERT INTO unsorted_photos (id, uri, takenAt, caption, dateUnknown, fingerprint, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          photo.id,
          ref,
          photo.takenAt,
          photo.caption ?? null,
          photo.dateUnknown ? 1 : 0,
          photo.fingerprint ?? null,
          photo.updatedAt ?? stamp,
        ]
      );
    }
    for (const observation of bloomObservationRows) {
      insertRow('bloom_observations', observation, stamp);
    }
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
  notifyLocalChange();

  return {
    imported: {
      zones: tables.zones.length,
      plants: tables.plants.length,
      reminders: tables.reminders.length,
      care_logs: tables.care_logs.length,
      photos: tables.photos.length - skippedPhotos,
      unsorted_photos: unsortedPhotoRows.length - skippedUnsorted,
      bloom_observations: bloomObservationRows.length,
      garden_plan: gardenPlanRows.length,
    },
    skippedPhotos,
  };
}

const READ_CHUNK_BYTES = 1024 * 1024;

// The picked file's bytes, 1 MiB at a time (never the whole file at once).
async function* fileChunks(uri) {
  const handle = new File(uri).open();
  try {
    for (;;) {
      const bytes = handle.readBytes(READ_CHUNK_BYTES);
      if (bytes.length === 0) break;
      yield bytes;
    }
  } finally {
    handle.close();
  }
}

/**
 * Reads only what is needed to preview a backup file: `{ ok, backup }` or
 * `{ ok: false, error }`. A version 2 file yields its header (counts, rows;
 * no photo bytes); an older file is read whole and parsed as before.
 * `source` is the picked file's `uri`. Nothing is written or replaced.
 */
export async function previewBackupFile(source) {
  const header = await readBackupHeader(fileChunks(source));
  if (header.kind === 'streamed') return header.result;
  return parseBackup(await new File(source).text());
}

/**
 * Replaces the garden with the file `source` (a uri), whose preview `backup`
 * came from previewBackupFile. A version 1 backup goes through importGarden.
 * A version 2 file is read in chunks and each photo is written to disk as it
 * is met, under a brand-new name; the database is only touched once the
 * whole file, end line included, was read. On any failure the staged files
 * are deleted and the garden is untouched.
 */
export async function importGardenFromFile(source, backup) {
  if (backup.version === BACKUP_VERSION) return importGarden(backup);

  const dir = photosDirectory();
  const refs = { photos: {}, unsorted_photos: {} };
  const writtenFiles = [];
  const discard = () => {
    for (const file of writtenFiles) {
      try {
        if (file.exists) file.delete();
      } catch {
        // Best-effort cleanup; the garden's rows and files are untouched.
      }
    }
  };
  try {
    await readBackupPhotos(fileChunks(source), backup, ({ table, id, ext, base64 }) => {
      try {
        const fileName = `${uuid()}.${ext}`;
        const target = new File(dir, fileName);
        target.write(base64, { encoding: 'base64' });
        writtenFiles.push(target);
        refs[table][id] = `${PHOTOS_DIR_NAME}/${fileName}`;
      } catch {
        // Unwritable photo: its row is skipped, as in a version 1 import.
      }
    });
  } catch (e) {
    discard();
    throw e;
  }
  return commitImport(backup.tables, {
    photoRefs: refs.photos,
    unsortedRefs: refs.unsorted_photos,
    writtenFiles,
  });
}

// Bloom: plants blooming in a given month
export async function getPlantsBloomingInMonth(month) {
  const rows = await db.getAllAsync(
    `SELECT p.*, z.name as zoneName,
     ${PLANT_PHOTO_URI_SQL} as photoUri
     FROM plants p
     LEFT JOIN zones z ON p.zoneId = z.id AND z.deletedAt IS NULL
     WHERE p.deletedAt IS NULL AND p.bloomStartMonth IS NOT NULL AND p.bloomEndMonth IS NOT NULL
     ORDER BY p.name`
  );
  // ticket 090: insignificant blooms go last, name order kept within each group
  return showyFirst(
    rows
      .filter((p) => isMonthInRange(month, p.bloomStartMonth, p.bloomEndMonth))
      .map(withResolvedPhotoUri)
  );
}

// Dashboard: due today
export async function getDueTodayReminders() {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.getAllAsync(
    `
    SELECT r.*, p.name as plantName, p.id as plantId, z.name as zoneName,
     ${PLANT_PHOTO_URI_SQL} as photoUri
    FROM reminders r
    JOIN plants p ON r.plantId = p.id AND p.deletedAt IS NULL
    LEFT JOIN zones z ON p.zoneId = z.id AND z.deletedAt IS NULL
    WHERE r.deletedAt IS NULL AND r.enabled = 1 AND r.nextDueDate = ?
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
     ${PLANT_PHOTO_URI_SQL} as photoUri
    FROM reminders r
    JOIN plants p ON r.plantId = p.id AND p.deletedAt IS NULL
    LEFT JOIN zones z ON p.zoneId = z.id AND z.deletedAt IS NULL
    WHERE r.deletedAt IS NULL AND r.enabled = 1 AND r.nextDueDate < ?
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
     ${PLANT_PHOTO_URI_SQL} as photoUri
     FROM plants p
     WHERE p.deletedAt IS NULL AND p.zoneId ${zoneId == null ? 'IS NULL' : '= ?'}
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
       JOIN plants p ON cl.plantId = p.id AND p.deletedAt IS NULL
       WHERE cl.deletedAt IS NULL AND p.zoneId = ? AND cl.type = 'watered'
       ORDER BY cl.date DESC LIMIT 1`,
      [zoneId]
    ),
    db.getFirstAsync(
      `SELECT r.kind, r.nextDueDate FROM reminders r
       JOIN plants p ON r.plantId = p.id AND p.deletedAt IS NULL
       WHERE r.deletedAt IS NULL AND p.zoneId = ? AND r.enabled = 1
       ORDER BY r.nextDueDate ASC LIMIT 1`,
      [zoneId]
    ),
    db.getFirstAsync(
      `SELECT sun, COUNT(*) as cnt FROM plants
       WHERE deletedAt IS NULL AND zoneId = ? AND sun IS NOT NULL AND sun != 'unknown'
       GROUP BY sun ORDER BY cnt DESC LIMIT 1`,
      [zoneId]
    ),
  ]);

  return { lastWatering, nextReminder, sunInfo };
}

// ---------------------------------------------------------------------------
// Sync adapter (ticket 094): the storage half of lib/sync.js. Thin on purpose;
// the decisions live in the pure module. Every table name below comes from
// SYNCED_TABLES / SYNC_PHOTO_TABLES, every column from TABLE_COLUMNS (through
// planRemoteRow's sanitising) -- never from the caller (rule 5).
// ---------------------------------------------------------------------------

/** Every synced row (deleted ones too) stamped at or after `watermark`. */
export async function getRowsChangedSince(watermark) {
  const entries = [];
  for (const table of SYNCED_TABLES) {
    const rows = watermark
      ? await db.getAllAsync(`SELECT * FROM ${table} WHERE updatedAt >= ?`, [watermark])
      : await db.getAllAsync(`SELECT * FROM ${table}`);
    for (const row of rows) entries.push({ table, row });
  }
  return entries;
}

function markPhotoState(id, column) {
  // `column` is one of two constants chosen by the two callers below.
  db.runSync(
    `INSERT INTO sync_photo_state (id, ${column}) VALUES (?, 1) ON CONFLICT(id) DO UPDATE SET ${column} = 1`,
    [id]
  );
}

/**
 * Merges one pulled page, last write wins per row, in ONE transaction. Pulled
 * rows keep their remote updatedAt (never restamped) so they are not dirty.
 * Does not notify local-change listeners. Resolves `{ applied }`.
 */
export async function applyRemoteRows(changes) {
  const entries = orderedChanges(changes);
  const filesToDelete = [];
  let applied = 0;
  const run = () => {
    for (const { table, row: remote } of entries) {
      const id = typeof remote?.id === 'string' ? remote.id : '';
      const local = db.getFirstSync(`SELECT * FROM ${table} WHERE id = ?`, [id]);
      const isPhoto = SYNC_PHOTO_TABLES.includes(table);
      const plan = planRemoteRow(table, local, remote, {
        localFileExists: isPhoto && local ? existingPhotoFile(local) !== null : false,
      });
      if (!plan) continue;
      const columns = Object.keys(plan.row);
      const values = columns.map((c) => plan.row[c]);
      if (plan.action === 'insert') {
        if (isPhoto) {
          columns.push('uri');
          values.push(`${PHOTOS_DIR_NAME}/${photoFileName(plan.row.id, null)}`);
        }
        const marks = columns.map(() => '?').join(', ');
        db.runSync(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${marks})`, values);
      } else {
        const set = columns.map((c) => `${c} = ?`).join(', ');
        db.runSync(`UPDATE ${table} SET ${set} WHERE id = ?`, [...values, plan.row.id]);
      }
      if (plan.needsDownload) markPhotoState(plan.row.id, 'pending_download');
      if (plan.deleteFile) {
        db.runSync('UPDATE sync_photo_state SET pending_download = 0 WHERE id = ?', [plan.row.id]);
        if (local?.uri) filesToDelete.push(local.uri);
      }
      applied++;
    }
  };
  if (typeof db.withTransactionSync === 'function') {
    db.withTransactionSync(run);
  } else {
    db.execSync('BEGIN');
    try {
      run();
      db.execSync('COMMIT');
    } catch (e) {
      db.execSync('ROLLBACK');
      throw e;
    }
  }
  for (const uri of filesToDelete) deletePhotoFile(uri);
  return { applied };
}

/**
 * What the phone holds, for the first-sync final check (ticket 096):
 * `rows` live rows per synced table, `photoFiles` live photos (both tables)
 * whose file is on disk, `pendingUploads` of those not yet on the server.
 */
export async function getLocalSyncCounts() {
  const rows = {};
  for (const table of SYNCED_TABLES) {
    const found = await db.getFirstAsync(
      `SELECT COUNT(*) AS n FROM ${table} WHERE deletedAt IS NULL`
    );
    rows[table] = found?.n ?? 0;
  }
  let photoFiles = 0;
  let pendingUploads = 0;
  for (const table of SYNC_PHOTO_TABLES) {
    const live = await db.getAllAsync(
      `SELECT p.uri AS uri, COALESCE(s.uploaded, 0) AS uploaded FROM ${table} p LEFT JOIN sync_photo_state s ON s.id = p.id WHERE p.deletedAt IS NULL`
    );
    for (const row of live) {
      if (existingPhotoFile(row) === null) continue;
      photoFiles++;
      if (!row.uploaded) pendingUploads++;
    }
  }
  return { rows, photoFiles, pendingUploads };
}

/** Live photo rows whose file the server may not have yet. */
export async function listPhotosToUpload() {
  const out = [];
  for (const table of SYNC_PHOTO_TABLES) {
    const rows = await db.getAllAsync(
      `SELECT id FROM ${table} WHERE deletedAt IS NULL AND id NOT IN (SELECT id FROM sync_photo_state WHERE uploaded = 1 OR pending_download = 1)`
    );
    for (const row of rows) out.push({ table, id: row.id });
  }
  return out;
}

/** The photo's bytes and media type, or null when the file is not on disk. */
export async function readPhotoBytes(table, id) {
  if (!SYNC_PHOTO_TABLES.includes(table)) throw new Error(`Table inconnue : ${table}`);
  const row = await db.getFirstAsync(`SELECT uri FROM ${table} WHERE id = ?`, [id]);
  const file = row ? existingPhotoFile(row) : null;
  if (!file) return null;
  const bytes = await file.bytes();
  return { bytes, mime: mimeForExtension(extensionOfRelativeRef(row.uri)) };
}

export async function markPhotoUploaded(id) {
  markPhotoState(id, 'uploaded');
}

/** Live photo rows whose file was pulled as a row but not downloaded yet. */
export async function listPhotosToDownload() {
  const out = [];
  for (const table of SYNC_PHOTO_TABLES) {
    const rows = await db.getAllAsync(
      `SELECT id FROM ${table} WHERE deletedAt IS NULL AND id IN (SELECT id FROM sync_photo_state WHERE pending_download = 1)`
    );
    for (const row of rows) out.push({ table, id: row.id });
  }
  return out;
}

/**
 * Downloads a photo into the photos directory under the extension its bytes
 * say it has, points the row at it (no updatedAt bump: `uri` is device-local)
 * and records it as already on the server. Resolves `{ status }`: 'ok', the
 * HTTP status of a refusal, or 0 when the server could not be reached.
 */
export async function downloadPhoto(table, id, target) {
  if (!SYNC_PHOTO_TABLES.includes(table)) throw new Error(`Table inconnue : ${table}`);
  const row = await db.getFirstAsync(`SELECT uri FROM ${table} WHERE id = ?`, [id]);
  if (!row) return { status: 410 };
  const temp = new File(Paths.cache, `sync-${id}`);
  try {
    if (temp.exists) temp.delete();
    await File.downloadFileAsync(target.url, temp, { headers: target.headers, idempotent: true });
  } catch (e) {
    const match = /status (\d+)/.exec(e?.message ?? '');
    return { status: match ? Number(match[1]) : 0 };
  }
  let head;
  const handle = temp.open();
  try {
    head = handle.readBytes(16);
  } finally {
    handle.close();
  }
  const fileName = `${id}.${sniffImageExtension(head)}`;
  const destination = new File(photosDirectory(), fileName);
  if (destination.exists) destination.delete();
  temp.move(destination);
  const ref = `${PHOTOS_DIR_NAME}/${fileName}`;
  if (row.uri !== ref) deletePhotoFile(row.uri);
  db.runSync(`UPDATE ${table} SET uri = ? WHERE id = ?`, [ref, id]);
  db.runSync(
    'INSERT INTO sync_photo_state (id, uploaded, pending_download) VALUES (?, 1, 0) ON CONFLICT(id) DO UPDATE SET uploaded = 1, pending_download = 0',
    [id]
  );
  return { status: 'ok' };
}

/** Web only (ticket 095: the web store is a cache). The phone's garden is never one. */
export async function resetLocalCache() {
  throw new Error('resetLocalCache: réservé au web');
}
