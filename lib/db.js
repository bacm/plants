import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';
import { addDaysISO } from './dates';
import { isMonthInRange } from './months';
import { pickPlantUpdates, plantInsertValues } from './plantFields';

const db = SQLite.openDatabaseSync('garden.db');

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

    CREATE INDEX IF NOT EXISTS idx_plants_zone ON plants(zoneId);
    CREATE INDEX IF NOT EXISTS idx_plants_bloom ON plants(bloomStartMonth, bloomEndMonth);
    CREATE INDEX IF NOT EXISTS idx_care_logs_plant ON care_logs(plantId);
    CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(nextDueDate);
    CREATE INDEX IF NOT EXISTS idx_photos_plant ON photos(plantId);
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

export function updateZone(id, { name, description, icon, orderIndex }) {
  const updates = [];
  const args = [];
  if (name !== undefined) {
    updates.push('name = ?');
    args.push(name);
  }
  if (description !== undefined) {
    updates.push('description = ?');
    args.push(description);
  }
  if (icon !== undefined) {
    updates.push('icon = ?');
    args.push(icon);
  }
  if (orderIndex !== undefined) {
    updates.push('orderIndex = ?');
    args.push(orderIndex);
  }
  if (updates.length) {
    args.push(id);
    db.runSync(`UPDATE zones SET ${updates.join(', ')} WHERE id = ?`, args);
  }
}

export function deleteZone(id) {
  db.runSync('UPDATE plants SET zoneId = NULL WHERE zoneId = ?', [id]);
  db.runSync('DELETE FROM zones WHERE id = ?', [id]);
}

// Plants
export async function getPlants(filters = {}) {
  let sql = `
    SELECT p.*, z.name as zoneName,
      (SELECT COUNT(*) FROM reminders r WHERE r.plantId = p.id AND r.enabled = 1) as reminderCount
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
  if (filters.bloomMonth == null) return rows;
  return rows.filter((p) => isMonthInRange(filters.bloomMonth, p.bloomStartMonth, p.bloomEndMonth));
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
  db.runSync(
    `INSERT INTO plants (id, ${columns.join(', ')}) VALUES (?, ${placeholders})`,
    [id, ...values]
  );
  return id;
}

export function updatePlant(id, updates) {
  const entries = pickPlantUpdates(updates);
  if (!entries.length) return;
  const set = entries.map(([key]) => `${key} = ?`).join(', ');
  db.runSync(`UPDATE plants SET ${set} WHERE id = ?`, [...entries.map(([, v]) => v), id]);
}

export function deletePlant(id) {
  db.runSync('DELETE FROM photos WHERE plantId = ?', [id]);
  db.runSync('DELETE FROM care_logs WHERE plantId = ?', [id]);
  db.runSync('DELETE FROM reminders WHERE plantId = ?', [id]);
  db.runSync('DELETE FROM plants WHERE id = ?', [id]);
}

// Care logs
export function getCareLogsByPlantId(plantId) {
  return db.getAllAsync(
    'SELECT * FROM care_logs WHERE plantId = ? ORDER BY date DESC',
    [plantId]
  );
}

export function createCareLog({ plantId, type, date, notes }) {
  const id = uuid();
  const d = date || new Date().toISOString().slice(0, 10);
  db.runSync(
    'INSERT INTO care_logs (id, plantId, type, date, notes) VALUES (?, ?, ?, ?, ?)',
    [id, plantId, type, d, notes ?? null]
  );
  return id;
}

export function deleteCareLog(id) {
  db.runSync('UPDATE photos SET careLogId = NULL WHERE careLogId = ?', [id]);
  db.runSync('DELETE FROM care_logs WHERE id = ?', [id]);
}

// Reminders
export function getRemindersByPlantId(plantId) {
  return db.getAllAsync(
    'SELECT * FROM reminders WHERE plantId = ? ORDER BY nextDueDate',
    [plantId]
  );
}

export function createReminder({ plantId, kind, frequencyDays, nextDueDate, lastDoneDate }) {
  const id = uuid();
  const next = nextDueDate || new Date().toISOString().slice(0, 10);
  db.runSync(
    'INSERT INTO reminders (id, plantId, kind, frequencyDays, nextDueDate, lastDoneDate, enabled) VALUES (?, ?, ?, ?, ?, ?, 1)',
    [id, plantId, kind, frequencyDays, next, lastDoneDate ?? null]
  );
  return id;
}

export async function markReminderDone(id) {
  const r = await db.getFirstAsync('SELECT * FROM reminders WHERE id = ?', [id]);
  if (!r || !r.nextDueDate) return;
  const nextStr = addDaysISO(r.nextDueDate, r.frequencyDays);
  if (!nextStr) return;
  db.runSync(
    'UPDATE reminders SET lastDoneDate = ?, nextDueDate = ? WHERE id = ?',
    [r.nextDueDate, nextStr, id]
  );
}

export function deleteReminder(id) {
  db.runSync('DELETE FROM reminders WHERE id = ?', [id]);
}

// Photos
export function getPhotosByPlantId(plantId) {
  return db.getAllAsync('SELECT * FROM photos WHERE plantId = ? ORDER BY date DESC', [plantId]);
}

export function addPhoto({ plantId, careLogId, uri, date }) {
  const id = uuid();
  const photoDate = date || new Date().toISOString().slice(0, 10);
  db.runSync(
    'INSERT INTO photos (id, plantId, careLogId, uri, date) VALUES (?, ?, ?, ?, ?)',
    [id, plantId, careLogId ?? null, uri, photoDate]
  );
  return id;
}

export async function deletePhoto(id) {
  const photo = db.getFirstSync('SELECT uri FROM photos WHERE id = ?', [id]);
  if (photo?.uri) {
    try {
      await FileSystem.deleteAsync(photo.uri, { idempotent: true });
    } catch {
      // The file may already be gone; the DB row is deleted either way.
    }
  }
  db.runSync('DELETE FROM photos WHERE id = ?', [id]);
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
  return rows.filter((p) => isMonthInRange(month, p.bloomStartMonth, p.bloomEndMonth));
}

// Dashboard: due today
export function getDueTodayReminders() {
  const today = new Date().toISOString().slice(0, 10);
  return db.getAllAsync(
    `
    SELECT r.*, p.name as plantName, p.id as plantId,
     (SELECT uri FROM photos WHERE plantId = p.id ORDER BY date DESC LIMIT 1) as photoUri
    FROM reminders r
    JOIN plants p ON r.plantId = p.id
    WHERE r.enabled = 1 AND r.nextDueDate = ?
    ORDER BY r.kind
  `,
    [today]
  );
}

export function getOverdueReminders() {
  const today = new Date().toISOString().slice(0, 10);
  return db.getAllAsync(
    `
    SELECT r.*, p.name as plantName, p.id as plantId,
     (SELECT uri FROM photos WHERE plantId = p.id ORDER BY date DESC LIMIT 1) as photoUri
    FROM reminders r
    JOIN plants p ON r.plantId = p.id
    WHERE r.enabled = 1 AND r.nextDueDate < ?
    ORDER BY r.nextDueDate
  `,
    [today]
  );
}

// Zone detail: all plants with best available image
export function getPlantsByZoneWithImages(zoneId) {
  return db.getAllAsync(
    `SELECT p.id, p.name, p.sun, p.imageUrls,
     (SELECT uri FROM photos WHERE plantId = p.id ORDER BY date DESC LIMIT 1) as photoUri
     FROM plants p
     WHERE p.zoneId = ?
     ORDER BY p.createdAt DESC`,
    [zoneId]
  );
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
       WHERE zoneId = ? AND sun IS NOT NULL
       GROUP BY sun ORDER BY cnt DESC LIMIT 1`,
      [zoneId]
    ),
  ]);

  return { lastWatering, nextReminder, sunInfo };
}

