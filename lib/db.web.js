// Web fallback for expo-sqlite using localStorage
// Metro automatically resolves db.web.js on web platform

import { addDaysISO, addYearsISO } from './dates';
import { isMonthInRange } from './months';
import { pickPlantUpdates, plantInsertValues } from './plantFields';
import { pickZoneUpdates } from './zoneFields';
import {
  createPhotoStore,
  createIndexedDbAdapter,
  isIdbRef,
  dataUrlToFileData,
  fileDataToDataUrl,
} from './webPhotoStore';

const STORAGE_KEY = 'garden_db';
const photoStore = createPhotoStore(createIndexedDbAdapter());

async function withResolvedPhotoUri(row) {
  if (!row || row.photoUri == null) return row;
  return { ...row, photoUri: await photoStore.loadPhoto(row.photoUri) };
}

function emptyStore() {
  return {
    zones: [],
    plants: [],
    care_logs: [],
    reminders: [],
    photos: [],
    unsorted_photos: [],
    bloom_observations: [],
  };
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const store = JSON.parse(raw);
      // Tables added after a garden was first created (ticket 056): default
      // to empty rather than crash on the first read of an older store.
      store.unsorted_photos = store.unsorted_photos || [];
      store.bloom_observations = store.bloom_observations || [];
      return store;
    }
  } catch {}
  return emptyStore();
}

function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function initDb() {
  // Ensure store exists
  if (!localStorage.getItem(STORAGE_KEY)) {
    saveStore(emptyStore());
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
export async function getZones() {
  const store = loadStore();
  return store.zones.sort((a, b) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name));
}

export function createZone({ name, description, icon, orderIndex = 0 }) {
  const store = loadStore();
  const id = uuid();
  store.zones.push({ id, name, description: description ?? null, icon: icon ?? null, orderIndex });
  saveStore(store);
  return id;
}

export function updateZone(id, updates) {
  const entries = pickZoneUpdates(updates);
  if (!entries.length) return;
  const store = loadStore();
  const zone = store.zones.find((z) => z.id === id);
  if (!zone) return;
  for (const [key, value] of entries) zone[key] = value;
  saveStore(store);
}

export function deleteZone(id) {
  const store = loadStore();
  store.plants.forEach((p) => {
    if (p.zoneId === id) p.zoneId = null;
  });
  store.zones = store.zones.filter((z) => z.id !== id);
  saveStore(store);
}

export async function countPlantsInZone(zoneId) {
  const store = loadStore();
  return store.plants.filter((p) => p.zoneId === zoneId).length;
}

// Plants
export async function getPlants(filters = {}) {
  const store = loadStore();
  let results = store.plants.map((p) => {
    const zone = store.zones.find((z) => z.id === p.zoneId);
    const reminderCount = store.reminders.filter((r) => r.plantId === p.id && r.enabled).length;
    const photos = store.photos
      .filter((ph) => ph.plantId === p.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    return {
      ...p,
      zoneName: zone?.name ?? null,
      reminderCount,
      photoUri: photos[0]?.uri ?? null,
    };
  });
  if (filters.zoneId) results = results.filter((p) => p.zoneId === filters.zoneId);
  if (filters.search) {
    const term = filters.search.toLowerCase();
    results = results.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.latinName && p.latinName.toLowerCase().includes(term)) ||
        (p.flowerColor && p.flowerColor.toLowerCase().includes(term))
    );
  }
  if (filters.bloomMonth != null) {
    results = results.filter((p) =>
      isMonthInRange(filters.bloomMonth, p.bloomStartMonth, p.bloomEndMonth)
    );
  }
  if (filters.sun) results = results.filter((p) => p.sun === filters.sun);
  if (filters.type) results = results.filter((p) => p.type === filters.type);
  const sorted = results.sort((a, b) => a.name.localeCompare(b.name));
  return Promise.all(sorted.map(withResolvedPhotoUri));
}

export async function getPlantById(id) {
  const store = loadStore();
  const p = store.plants.find((pl) => pl.id === id);
  if (!p) return null;
  const zone = store.zones.find((z) => z.id === p.zoneId);
  return { ...p, zoneName: zone?.name ?? null };
}

export function createPlant(plant) {
  const store = loadStore();
  const id = uuid();
  const { columns, values } = plantInsertValues(plant);
  const record = { id };
  columns.forEach((c, i) => {
    record[c] = values[i];
  });
  store.plants.push(record);
  saveStore(store);
  return id;
}

export function updatePlant(id, updates) {
  const store = loadStore();
  const plant = store.plants.find((p) => p.id === id);
  if (!plant) return;
  for (const [key, value] of pickPlantUpdates(updates)) plant[key] = value;
  saveStore(store);
}

export function deletePlant(id) {
  const store = loadStore();
  store.photos = store.photos.filter((p) => p.plantId !== id);
  store.care_logs = store.care_logs.filter((c) => c.plantId !== id);
  store.reminders = store.reminders.filter((r) => r.plantId !== id);
  store.plants = store.plants.filter((p) => p.id !== id);
  saveStore(store);
}

// Care logs
export async function getCareLogsByPlantId(plantId) {
  const store = loadStore();
  return store.care_logs
    .filter((c) => c.plantId === plantId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function createCareLog({ plantId, type, date, notes }) {
  const store = loadStore();
  const id = uuid();
  const d = date || new Date().toISOString().slice(0, 10);
  store.care_logs.push({ id, plantId, type, date: d, notes: notes ?? null });
  saveStore(store);
  return id;
}

export function deleteCareLog(id) {
  const store = loadStore();
  store.photos.forEach((p) => {
    if (p.careLogId === id) p.careLogId = null;
  });
  store.care_logs = store.care_logs.filter((c) => c.id !== id);
  saveStore(store);
}

// Every care log (any plant) dated between startISO and endISO, inclusive.
// Mirrors lib/db.js's getCareLogsBetween.
export async function getCareLogsBetween(startISO, endISO) {
  const store = loadStore();
  return store.care_logs
    .filter((c) => c.date >= startISO && c.date <= endISO)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Reminders
export async function getRemindersByPlantId(plantId) {
  const store = loadStore();
  return store.reminders
    .filter((r) => r.plantId === plantId)
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
}

// Mirrors lib/db.js's VALID_REPEAT_RULES.
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
  const store = loadStore();
  const id = uuid();
  const next = nextDueDate || new Date().toISOString().slice(0, 10);
  store.reminders.push({
    id,
    plantId,
    kind,
    frequencyDays,
    nextDueDate: next,
    lastDoneDate: lastDoneDate ?? null,
    enabled: 1,
    repeatRule,
  });
  saveStore(store);
  return id;
}

export async function markReminderDone(id) {
  const store = loadStore();
  const r = store.reminders.find((rem) => rem.id === id);
  if (!r) return;
  const nextStr =
    r.repeatRule === 'yearly'
      ? addYearsISO(r.nextDueDate, 1)
      : addDaysISO(r.nextDueDate, r.frequencyDays);
  if (!nextStr) return;
  r.lastDoneDate = r.nextDueDate;
  r.nextDueDate = nextStr;
  saveStore(store);
}

export function deleteReminder(id) {
  const store = loadStore();
  store.reminders = store.reminders.filter((r) => r.id !== id);
  saveStore(store);
}

// Photos
export async function getPhotosByPlantId(plantId) {
  const store = loadStore();
  const rows = store.photos
    .filter((p) => p.plantId === plantId)
    .sort((a, b) => b.date.localeCompare(a.date));
  return Promise.all(
    rows.map(async (row) => ({ ...row, uri: await photoStore.loadPhoto(row.uri) }))
  );
}

export async function addPhoto({ plantId, careLogId, uri, date }) {
  const store = loadStore();
  const id = uuid();
  const photoDate = date || new Date().toISOString().slice(0, 10);
  // The web picker returns a blob: URL that dies with the page, so store the
  // image bytes themselves, never the URL.
  const fileData = await readPhotoFileData(uri);
  if (!fileData) throw new Error('Photo illisible : format non pris en charge');
  const ref = await photoStore.storePhoto(id, fileDataToDataUrl(fileData));
  store.photos.push({
    id,
    plantId,
    careLogId: careLogId ?? null,
    uri: ref,
    date: photoDate,
    caption: null,
  });
  saveStore(store);
  return id;
}

export async function deletePhoto(id) {
  const store = loadStore();
  const photo = store.photos.find((p) => p.id === id);
  if (photo) await photoStore.deletePhoto(photo.uri);
  store.photos = store.photos.filter((p) => p.id !== id);
  saveStore(store);
}

/** Attaches (or clears, with `text` null/empty) a note to an existing photo. */
export function setPhotoCaption(photoId, text) {
  const store = loadStore();
  const photo = store.photos.find((p) => p.id === photoId);
  if (!photo) return;
  photo.caption = text?.trim() || null;
  saveStore(store);
}

// ---------------------------------------------------------------------------
// Settings (ticket 056): mirrors lib/db.js's getSetting/setSetting.
// ---------------------------------------------------------------------------

const SETTING_KEY_PREFIX = 'garden_setting:';

export async function getSetting(key) {
  try {
    return localStorage.getItem(SETTING_KEY_PREFIX + key);
  } catch {
    return null;
  }
}

export function setSetting(key, value) {
  localStorage.setItem(SETTING_KEY_PREFIX + key, value);
}

// ---------------------------------------------------------------------------
// Plant search API token (ticket 076): mirrors lib/db.js's getApiToken /
// setApiToken over localStorage — web has no Keychain, and the web build is
// a development target, not a shipped one.
// ---------------------------------------------------------------------------

const API_TOKEN_KEY = 'plants.apiToken';

export async function getApiToken() {
  return localStorage.getItem(API_TOKEN_KEY) ?? null;
}

export async function setApiToken(token) {
  const trimmed = typeof token === 'string' ? token.trim() : '';
  if (!trimmed) {
    localStorage.removeItem(API_TOKEN_KEY);
    return;
  }
  localStorage.setItem(API_TOKEN_KEY, trimmed);
}

// ---------------------------------------------------------------------------
// Unsorted photos (ticket 056): mirrors lib/db.js's addUnsortedPhoto /
// getUnsortedPhotos / deleteUnsortedPhoto, over IndexedDB via photoStore
// instead of the file system.
// ---------------------------------------------------------------------------

export async function addUnsortedPhoto({ uri, takenAt, dateUnknown = false }) {
  const store = loadStore();
  const id = uuid();
  const takenAtValue = takenAt || new Date().toISOString();
  const fileData = await readPhotoFileData(uri);
  if (!fileData) throw new Error('Photo illisible : format non pris en charge');
  const ref = await photoStore.storePhoto(id, fileDataToDataUrl(fileData));
  store.unsorted_photos.push({
    id,
    uri: ref,
    takenAt: takenAtValue,
    caption: null,
    dateUnknown: !!dateUnknown,
  });
  saveStore(store);
  return id;
}

export async function getUnsortedPhotos() {
  const store = loadStore();
  const rows = [...store.unsorted_photos].sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      uri: await photoStore.loadPhoto(row.uri),
      dateUnknown: !!row.dateUnknown,
    }))
  );
}

export async function deleteUnsortedPhoto(id) {
  const store = loadStore();
  const photo = store.unsorted_photos.find((p) => p.id === id);
  if (photo) await photoStore.deletePhoto(photo.uri);
  store.unsorted_photos = store.unsorted_photos.filter((p) => p.id !== id);
  saveStore(store);
}

// ---------------------------------------------------------------------------
// Bloom observations (ticket 056, storage part of 029): mirrors
// lib/db.js's addBloomObservation / getBloomObservations.
// ---------------------------------------------------------------------------

export async function addBloomObservation({ plantId, date }) {
  const store = loadStore();
  const existing = store.bloom_observations.find(
    (o) => o.plantId === plantId && o.date === date && o.kind === 'open'
  );
  if (existing) return existing.id;
  const id = uuid();
  store.bloom_observations.push({ id, plantId, date, kind: 'open' });
  saveStore(store);
  return id;
}

export async function getBloomObservations(plantId) {
  const store = loadStore();
  return store.bloom_observations
    .filter((o) => o.plantId === plantId)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * One-time (idempotent) migration of photo rows still holding an inline
 * data: URL in localStorage into IndexedDB, matching lib/db.js's
 * `migratePhotosToAppStorage`. Rows already migrated (an `idb:` ref) are
 * left alone. Nothing on web can go "missing" the way a purged native cache
 * file can, so `missing` is always 0 — the shape is kept for parity with the
 * native module and with app/_layout.js, which calls this once at startup.
 */
const MISSING_PHOTOS_KEY = 'garden_missing_photos';

// Brings every photo to "bytes stored in IndexedDB". Inline data: rows (pre-043)
// are moved in; blob: URLs stored by 043 are rescued only if still alive in this
// page, otherwise reported once as missing and left in place.
export async function migratePhotosToAppStorage() {
  const store = loadStore();
  const knownMissing = new Set(JSON.parse(localStorage.getItem(MISSING_PHOTOS_KEY) || '[]'));
  let copied = 0;
  let missing = 0;
  for (const photo of store.photos) {
    const raw = await photoStore.loadPhoto(photo.uri);
    if (typeof raw !== 'string' || raw.startsWith('data:')) {
      if (typeof photo.uri === 'string' && photo.uri.startsWith('data:')) {
        photo.uri = await photoStore.storePhoto(photo.id, photo.uri);
        copied++;
      }
      continue;
    }
    let fileData = null;
    try {
      fileData = await readPhotoFileData(raw);
    } catch {
      fileData = null;
    }
    if (fileData) {
      photo.uri = await photoStore.storePhoto(photo.id, fileDataToDataUrl(fileData));
      copied++;
    } else if (!knownMissing.has(photo.id)) {
      knownMissing.add(photo.id);
      missing++;
    }
  }
  if (copied) saveStore(store);
  if (missing) localStorage.setItem(MISSING_PHOTOS_KEY, JSON.stringify([...knownMissing]));
  return { copied, missing };
}

// ---------------------------------------------------------------------------
// Backup & restore (ticket 020) — mirrors lib/db.js's exportGarden /
// isGardenEmpty / importGarden, over localStorage + IndexedDB instead of
// SQLite + the file system.
// ---------------------------------------------------------------------------

// A photo added via expo-image-picker on web (see app/plant/[id].js) is
// stored as a `blob:` object URL, not a `data:` one -- the picker is never
// called with `base64: true`. A `blob:` URL is only readable for as long as
// the document that created it is alive, so this only recovers real bytes
// for a photo added earlier in the same session; one added in a previous
// session (a `blob:` URL surviving a reload, which the browser has already
// revoked) yields a dead reference `fetch` rejects, and the photo exports as
// `file: null` like any other unreadable photo.
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function readPhotoFileData(raw) {
  if (typeof raw !== 'string') return null;
  if (raw.startsWith('data:')) return dataUrlToFileData(raw);
  if (raw.startsWith('blob:')) {
    const response = await fetch(raw);
    const blob = await response.blob();
    const base64 = await blobToBase64(blob);
    return dataUrlToFileData(`data:${blob.type || 'image/jpeg'};base64,${base64}`);
  }
  return null;
}

// Reads a photo/unsorted-photo row's stored bytes back into an archivable
// `{ ext, base64 }`, or null when unreadable. Shared by exportGarden's two
// photo-bearing tables.
async function readArchivableFile(uri) {
  try {
    const raw = await photoStore.loadPhoto(uri);
    return await readPhotoFileData(raw);
  } catch {
    return null;
  }
}

export async function exportGarden() {
  const store = loadStore();
  const photoData = {};
  for (const photo of store.photos) {
    photoData[photo.id] = await readArchivableFile(photo.uri);
  }
  const unsortedPhotoData = {};
  for (const photo of store.unsorted_photos) {
    unsortedPhotoData[photo.id] = await readArchivableFile(photo.uri);
  }
  return {
    tables: {
      zones: store.zones,
      plants: store.plants,
      reminders: store.reminders,
      care_logs: store.care_logs,
      photos: store.photos,
      unsorted_photos: store.unsorted_photos,
      bloom_observations: store.bloom_observations,
    },
    photoData,
    unsortedPhotoData,
  };
}

export async function isGardenEmpty() {
  const store = loadStore();
  return (
    store.zones.length === 0 &&
    store.plants.length === 0 &&
    store.reminders.length === 0 &&
    store.care_logs.length === 0 &&
    store.photos.length === 0 &&
    store.unsorted_photos.length === 0 &&
    store.bloom_observations.length === 0
  );
}

/**
 * Replaces the entire garden with a validated backup (see
 * lib/backupFormat.js's parseBackup — this trusts its input completely).
 *
 * Same order as lib/db.js's importGarden: every photo is written into
 * IndexedDB under a brand-new key first, then one localStorage write
 * replaces every table at once, then the old garden's IndexedDB entries are
 * dropped. A failure before that single `saveStore` call removes the
 * IndexedDB entries just written and rethrows, leaving the old garden
 * (localStorage and IndexedDB) untouched.
 */
// Writes each row's { ext, base64 } file into IndexedDB under a fresh id and
// returns { refsById, writtenIds, skipped }, mirroring lib/db.js's
// writeArchivedFiles. Shared by importGarden's photos and unsorted_photos.
async function writeArchivedFilesWeb(rows) {
  const refsById = {};
  const writtenIds = [];
  let skipped = 0;
  for (const row of rows) {
    if (!row.file) {
      refsById[row.id] = null;
      skipped++;
      continue;
    }
    try {
      const newId = uuid();
      const ref = await photoStore.storePhoto(newId, fileDataToDataUrl(row.file));
      writtenIds.push(newId);
      refsById[row.id] = ref;
    } catch {
      refsById[row.id] = null;
      skipped++;
    }
  }
  return { refsById, writtenIds, skipped };
}

export async function importGarden(backup) {
  const { tables } = backup;
  const unsortedPhotoRows = tables.unsorted_photos ?? [];
  const bloomObservationRows = tables.bloom_observations ?? [];

  const photoFiles = await writeArchivedFilesWeb(tables.photos);
  const unsortedFiles = await writeArchivedFilesWeb(unsortedPhotoRows);
  const writtenIds = [...photoFiles.writtenIds, ...unsortedFiles.writtenIds];
  const skippedPhotos = photoFiles.skipped;

  const oldStore = loadStore();
  const oldPhotoRefs = [...oldStore.photos, ...oldStore.unsorted_photos]
    .map((p) => p.uri)
    .filter(isIdbRef);

  try {
    saveStore({
      zones: tables.zones,
      plants: tables.plants,
      reminders: tables.reminders,
      care_logs: tables.care_logs,
      photos: tables.photos
        .filter((p) => photoFiles.refsById[p.id])
        .map((p) => ({
          id: p.id,
          plantId: p.plantId,
          careLogId: p.careLogId ?? null,
          date: p.date,
          caption: p.caption ?? null,
          uri: photoFiles.refsById[p.id],
        })),
      unsorted_photos: unsortedPhotoRows
        .filter((p) => unsortedFiles.refsById[p.id])
        .map((p) => ({
          id: p.id,
          takenAt: p.takenAt,
          caption: p.caption ?? null,
          dateUnknown: !!p.dateUnknown,
          uri: unsortedFiles.refsById[p.id],
        })),
      bloom_observations: bloomObservationRows,
    });
  } catch (e) {
    for (const id of writtenIds) {
      try {
        await photoStore.deletePhoto(`idb:${id}`);
      } catch {
        // Best-effort cleanup; the old garden is untouched either way.
      }
    }
    throw e;
  }

  for (const ref of oldPhotoRefs) {
    try {
      await photoStore.deletePhoto(ref);
    } catch {
      // Best-effort: an orphaned IndexedDB entry is disk-space debt, not data loss.
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

// Bloom
export async function getPlantsBloomingInMonth(month) {
  const store = loadStore();
  return store.plants
    .filter((p) => isMonthInRange(month, p.bloomStartMonth, p.bloomEndMonth))
    .map((p) => {
      const zone = store.zones.find((z) => z.id === p.zoneId);
      return { ...p, zoneName: zone?.name ?? null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Dashboard
export async function getDueTodayReminders() {
  const store = loadStore();
  const today = new Date().toISOString().slice(0, 10);
  return store.reminders
    .filter((r) => r.enabled && r.nextDueDate === today)
    .map((r) => {
      const p = store.plants.find((pl) => pl.id === r.plantId);
      return {
        ...r,
        plantName: p?.name,
        plantId: r.plantId,
        zoneName: store.zones.find((z) => z.id === p?.zoneId)?.name ?? null,
      };
    })
    .sort((a, b) => a.kind.localeCompare(b.kind));
}

export async function getOverdueReminders() {
  const store = loadStore();
  const today = new Date().toISOString().slice(0, 10);
  return store.reminders
    .filter((r) => r.enabled && r.nextDueDate < today)
    .map((r) => {
      const p = store.plants.find((pl) => pl.id === r.plantId);
      return {
        ...r,
        plantName: p?.name,
        plantId: r.plantId,
        zoneName: store.zones.find((z) => z.id === p?.zoneId)?.name ?? null,
      };
    })
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
}

// Zone detail: all plants with best available image
export async function getPlantsByZoneWithImages(zoneId) {
  const store = loadStore();
  const rows = store.plants
    .filter((p) => p.zoneId === zoneId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((p) => {
      const photos = store.photos
        .filter((ph) => ph.plantId === p.id)
        .sort((a, b) => b.date.localeCompare(a.date));
      return {
        id: p.id,
        name: p.name,
        sun: p.sun,
        imageUrls: p.imageUrls,
        photoUri: photos[0]?.uri ?? null,
      };
    });
  return Promise.all(rows.map(withResolvedPhotoUri));
}

// Zone context: last watering, next reminder, sun exposure
export async function getZoneContextInfo(zoneId) {
  const store = loadStore();
  const zonePlantIds = new Set(store.plants.filter((p) => p.zoneId === zoneId).map((p) => p.id));

  const waterings = store.care_logs
    .filter((c) => zonePlantIds.has(c.plantId) && c.type === 'watered')
    .sort((a, b) => b.date.localeCompare(a.date));
  const lastWatering = waterings.length ? { date: waterings[0].date } : null;

  const reminders = store.reminders
    .filter((r) => zonePlantIds.has(r.plantId) && r.enabled)
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  const nextReminder = reminders.length
    ? { kind: reminders[0].kind, nextDueDate: reminders[0].nextDueDate }
    : null;

  const sunCounts = new Map();
  for (const p of store.plants) {
    if (p.zoneId !== zoneId || p.sun == null || p.sun === 'unknown') continue;
    sunCounts.set(p.sun, (sunCounts.get(p.sun) ?? 0) + 1);
  }
  let sunInfo = null;
  for (const [sun, cnt] of sunCounts) {
    if (!sunInfo || cnt > sunInfo.cnt) sunInfo = { sun, cnt };
  }

  return { lastWatering, nextReminder, sunInfo };
}
