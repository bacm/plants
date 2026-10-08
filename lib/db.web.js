// Web fallback for expo-sqlite using localStorage
// Metro automatically resolves db.web.js on web platform

import { isMonthInRange } from './months';
import { nextDueAfterDone, pickReminderUpdates } from './reminderDue';
import { careTypeForReminderKind } from './enums';
import { showyFirst } from './bloomCoverage';
import { pickCoverPhoto } from './coverPhoto';
import { pickPlantUpdates, plantInsertValues } from './plantFields';
import { pickZoneUpdates } from './zoneFields';
import { normalizeFeatureInput } from './planFeatures';
import { normalizeJournalEntry } from './journal';
import {
  GARDEN_PLAN_ID,
  assertValidPlanSize,
  assertValidPosition,
  assertValidPlanSizeCm,
  serializePolygon,
} from './gardenPlan';
import {
  createPhotoStore,
  createIndexedDbAdapter,
  isIdbRef,
  dataUrlToFileData,
  fileDataToDataUrl,
} from './webPhotoStore';
import { BACKUP_VERSION, BACKUP_VERSION_STREAMED, buildBackup, parseBackup } from './backupFormat';
import {
  PHOTO_TABLES,
  encodeBackupLines,
  readBackupHeader,
  readBackupPhotos,
} from './backupStream';
import { dataUrlByteLength, sameByteSize } from './photoFingerprint';
import { SYNCED_TABLES, nowStamp, isLive, liveRows, stampLegacyRows } from './syncFields';
import {
  orderedChanges,
  planRemoteRow,
  PUSHED_THROUGH_KEY,
  PULLED_REVISION_KEY,
  LAST_SYNC_KEY,
} from './sync';
import { CACHE_OWNER_KEY } from './webCache';
import {
  remoteRef,
  isRemoteRef,
  resolveRemotePhoto,
  forgetRemotePhoto,
  revokeRemotePhotos,
} from './remotePhotos';

const STORAGE_KEY = 'garden_db';
const photoStore = createPhotoStore(createIndexedDbAdapter());

// Ticket 095: on the web this store is a CACHE of the signed-in account's
// garden. A photo pulled from the server has no bytes here: its row holds
// `remote:<id>` (lib/remotePhotos.js) and the image is fetched on display.
// A photo row's uri -> something an <img> can show: bytes from IndexedDB, or a
// blob: URL fetched from the server for a `remote:` ref.
async function resolvePhotoUri(ref) {
  return isRemoteRef(ref) ? resolveRemotePhoto(ref) : photoStore.loadPhoto(ref);
}

async function withResolvedPhotoUri(row) {
  if (!row || row.photoUri == null) return row;
  return { ...row, photoUri: await resolvePhotoUri(row.photoUri) };
}

function emptyStore() {
  return {
    zones: [],
    garden_plan: [],
    plan_features: [],
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
      store.garden_plan = store.garden_plan || [];
      store.plan_features = store.plan_features || [];
      return store;
    }
  } catch {}
  return emptyStore();
}

// Raw write: no change notification (initDb, a pulled page, a cache reset,
// the device-local uri migration).
function writeStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

// Ticket 095: same contract as lib/db.js, so the sync runner schedules a push
// a few seconds after a local write. Every write function below saves through
// saveStore; applyRemoteRows never does.
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

function saveStore(store) {
  writeStore(store);
  notifyLocalChange();
}

export function initDb() {
  // Ensure store exists
  if (!localStorage.getItem(STORAGE_KEY)) {
    writeStore(emptyStore());
  }
  // Rows written before ticket 091 have no updatedAt: stamp them once.
  const store = loadStore();
  const stamp = nowStamp();
  let changed = 0;
  for (const table of SYNCED_TABLES) changed += stampLegacyRows(store[table], stamp);
  if (changed) writeStore(store);
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
  return liveRows(store.zones).sort(
    (a, b) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name)
  );
}

export function createZone({ name, description, icon, orderIndex = 0, polygon = null }) {
  const store = loadStore();
  const id = uuid();
  store.zones.push({
    id,
    name,
    description: description ?? null,
    icon: icon ?? null,
    orderIndex,
    polygon: serializePolygon(polygon),
    updatedAt: nowStamp(),
    deletedAt: null,
  });
  saveStore(store);
  return id;
}

export function updateZone(id, updates) {
  const entries = pickZoneUpdates(updates);
  if (!entries.length) return;
  const store = loadStore();
  const zone = liveRows(store.zones).find((z) => z.id === id);
  if (!zone) return;
  for (const [key, value] of entries) zone[key] = value;
  zone.updatedAt = nowStamp();
  saveStore(store);
}

// Garden plan (ticket 105); same contract as lib/db.js.

export async function getGardenPlan() {
  const row = liveRows(loadStore().garden_plan).find((r) => r.id === GARDEN_PLAN_ID);
  return row ? { widthCm: row.widthCm, lengthCm: row.lengthCm } : null;
}

export function saveGardenPlan({ widthCm, lengthCm }) {
  assertValidPlanSize({ widthCm, lengthCm });
  const store = loadStore();
  const stamp = nowStamp();
  const existing = store.garden_plan.find((r) => r.id === GARDEN_PLAN_ID);
  if (existing) {
    Object.assign(existing, { widthCm, lengthCm, updatedAt: stamp, deletedAt: null });
  } else {
    store.garden_plan.push({
      id: GARDEN_PLAN_ID,
      widthCm,
      lengthCm,
      updatedAt: stamp,
      deletedAt: null,
    });
  }
  saveStore(store);
}

// Garden features drawn on the plan (ticket 110); same contract as lib/db.js.

export async function getPlanFeatures() {
  return liveRows(loadStore().plan_features)
    .map((r) => ({ id: r.id, kind: r.kind, label: r.label ?? null, polygon: r.polygon }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function createPlanFeature({ kind, label = null, polygon }) {
  const clean = normalizeFeatureInput({ kind, label, polygon });
  const store = loadStore();
  const id = uuid();
  store.plan_features.push({
    id,
    kind: clean.kind,
    label: clean.label,
    polygon: JSON.stringify(clean.polygon),
    updatedAt: nowStamp(),
    deletedAt: null,
  });
  saveStore(store);
  return id;
}

export function updatePlanFeature(id, changes) {
  const clean = normalizeFeatureInput({
    ...(changes.kind !== undefined && { kind: changes.kind }),
    ...(changes.label !== undefined && { label: changes.label }),
    ...(changes.polygon !== undefined && { polygon: changes.polygon }),
  });
  const store = loadStore();
  const row = liveRows(store.plan_features).find((r) => r.id === id);
  if (!row) return;
  if (clean.kind !== undefined) row.kind = clean.kind;
  if ('label' in clean) row.label = clean.label;
  if (clean.polygon) row.polygon = JSON.stringify(clean.polygon);
  row.updatedAt = nowStamp();
  saveStore(store);
}

export function deletePlanFeature(id) {
  const store = loadStore();
  const row = liveRows(store.plan_features).find((r) => r.id === id);
  if (!row) return;
  const stamp = nowStamp();
  row.deletedAt = stamp;
  row.updatedAt = stamp;
  saveStore(store);
}

export function setPlantPosition(plantId, position) {
  const { x, y } = position;
  assertValidPosition({ x, y });
  const store = loadStore();
  const plant = liveRows(store.plants).find((p) => p.id === plantId);
  if (!plant) return;
  plant.planX = x;
  plant.planY = y;
  if ('zoneId' in position && position.zoneId !== undefined) plant.zoneId = position.zoneId ?? null;
  plant.updatedAt = nowStamp();
  saveStore(store);
}

export function setPlantPlanSize(plantId, cm) {
  assertValidPlanSizeCm(cm);
  const store = loadStore();
  const plant = liveRows(store.plants).find((p) => p.id === plantId);
  if (!plant) return;
  plant.planSizeCm = cm;
  plant.updatedAt = nowStamp();
  saveStore(store);
}

export function setZonePolygon(zoneId, polygon) {
  const serialized = serializePolygon(polygon);
  const store = loadStore();
  const zone = liveRows(store.zones).find((z) => z.id === zoneId);
  if (!zone) return;
  zone.polygon = serialized;
  zone.updatedAt = nowStamp();
  saveStore(store);
}

export function deleteZone(id) {
  const store = loadStore();
  const stamp = nowStamp();
  liveRows(store.plants).forEach((p) => {
    if (p.zoneId === id) {
      p.zoneId = null;
      p.updatedAt = stamp;
    }
  });
  liveRows(store.zones).forEach((z) => {
    if (z.id === id) {
      z.deletedAt = stamp;
      z.updatedAt = stamp;
    }
  });
  saveStore(store);
}

export async function countPlantsInZone(zoneId) {
  const store = loadStore();
  return liveRows(store.plants).filter((p) => p.zoneId === zoneId).length;
}

// The plant's latest live measurement that gave a width (ticket 115); mirrors
// lib/db.js's MEASURED_WIDTH_SQL (newest date, then newest change).
function latestWidthMeasurement(careLogs, plantId) {
  return (
    careLogs
      .filter((c) => c.plantId === plantId && c.type === 'measured' && c.widthCm != null)
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) || (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
      )[0] ?? null
  );
}

// Plants
export async function getPlants(filters = {}) {
  const store = loadStore();
  const zones = liveRows(store.zones);
  const reminders = liveRows(store.reminders);
  const livePhotos = liveRows(store.photos);
  let results = liveRows(store.plants).map((p) => {
    const zone = zones.find((z) => z.id === p.zoneId);
    const reminderCount = reminders.filter((r) => r.plantId === p.id && r.enabled).length;
    const measured = latestWidthMeasurement(liveRows(store.care_logs), p.id);
    const photos = livePhotos
      .filter((ph) => ph.plantId === p.id)
      .sort((a, b) => b.date.localeCompare(a.date));
    return {
      ...p,
      zoneName: zone?.name ?? null,
      reminderCount,
      photoUri: pickCoverPhoto(photos, p.coverPhotoId)?.uri ?? null,
      measuredWidthCm: measured?.widthCm ?? null,
      measuredAt: measured?.date ?? null,
    };
  });
  if (filters.zoneId) results = results.filter((p) => p.zoneId === filters.zoneId);
  if (filters.noZone) results = results.filter((p) => p.zoneName === null);
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
  const p = liveRows(store.plants).find((pl) => pl.id === id);
  if (!p) return null;
  const zone = liveRows(store.zones).find((z) => z.id === p.zoneId);
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
  record.updatedAt = nowStamp();
  record.deletedAt = null;
  store.plants.push(record);
  saveStore(store);
  return id;
}

export function updatePlant(id, updates) {
  const store = loadStore();
  const plant = liveRows(store.plants).find((p) => p.id === id);
  if (!plant) return;
  for (const [key, value] of pickPlantUpdates(updates)) plant[key] = value;
  plant.updatedAt = nowStamp();
  saveStore(store);
}

export async function deletePlant(id) {
  const store = loadStore();
  const stamp = nowStamp();
  const markDeleted = (row) => {
    row.deletedAt = stamp;
    row.updatedAt = stamp;
  };
  const photos = liveRows(store.photos).filter((p) => p.plantId === id);
  photos.forEach(markDeleted);
  liveRows(store.bloom_observations)
    .filter((o) => o.plantId === id)
    .forEach(markDeleted);
  liveRows(store.care_logs)
    .filter((c) => c.plantId === id)
    .forEach(markDeleted);
  liveRows(store.reminders)
    .filter((r) => r.plantId === id)
    .forEach(markDeleted);
  liveRows(store.plants)
    .filter((p) => p.id === id)
    .forEach(markDeleted);
  saveStore(store);
  for (const photo of photos) await photoStore.deletePhoto(photo.uri);
}

// Care logs
export async function getCareLogsByPlantId(plantId) {
  const store = loadStore();
  return liveRows(store.care_logs)
    .filter((c) => c.plantId === plantId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

// A measurement with a width also clears the plant's manual plan size, in the
// same write, so the measurement takes over on the plan (ticket 115).
// Throws a French Error on an invalid entry (see lib/journal.js).
export function createCareLog({ plantId, type, date, notes, widthCm, heightCm }) {
  const entry = normalizeJournalEntry({ type, notes, widthCm, heightCm });
  const store = loadStore();
  const id = uuid();
  const d = date || new Date().toISOString().slice(0, 10);
  const stamp = nowStamp();
  store.care_logs.push({
    id,
    plantId,
    type: entry.type,
    date: d,
    notes: entry.notes,
    widthCm: entry.widthCm,
    heightCm: entry.heightCm,
    updatedAt: stamp,
    deletedAt: null,
  });
  if (entry.widthCm != null) {
    const plant = liveRows(store.plants).find((p) => p.id === plantId);
    if (plant && plant.planSizeCm != null) {
      plant.planSizeCm = null;
      plant.updatedAt = stamp;
    }
  }
  saveStore(store);
  return id;
}

// One live journal entry, or null.
export async function getCareLogById(id) {
  return liveRows(loadStore().care_logs).find((c) => c.id === id) || null;
}

// Same normalisation as createCareLog; a new width also clears the manual plan size.
export function updateCareLog(id, { type, date, notes, widthCm, heightCm }) {
  const entry = normalizeJournalEntry({ type, notes, widthCm, heightCm });
  const store = loadStore();
  const log = liveRows(store.care_logs).find((c) => c.id === id);
  if (!log) throw new Error('Entrée introuvable');
  const stamp = nowStamp();
  Object.assign(log, {
    type: entry.type,
    date,
    notes: entry.notes,
    widthCm: entry.widthCm,
    heightCm: entry.heightCm,
    updatedAt: stamp,
  });
  if (entry.widthCm != null) {
    const plant = liveRows(store.plants).find((p) => p.id === log.plantId);
    if (plant && plant.planSizeCm != null) {
      plant.planSizeCm = null;
      plant.updatedAt = stamp;
    }
  }
  saveStore(store);
}

export function deleteCareLog(id) {
  const store = loadStore();
  const stamp = nowStamp();
  liveRows(store.photos).forEach((p) => {
    if (p.careLogId === id) {
      p.careLogId = null;
      p.updatedAt = stamp;
    }
  });
  liveRows(store.care_logs).forEach((c) => {
    if (c.id === id) {
      c.deletedAt = stamp;
      c.updatedAt = stamp;
    }
  });
  saveStore(store);
}

// Every care log (any plant) dated between startISO and endISO, inclusive.
// Mirrors lib/db.js's getCareLogsBetween.
export async function getCareLogsBetween(startISO, endISO) {
  const store = loadStore();
  return liveRows(store.care_logs)
    .filter((c) => c.date >= startISO && c.date <= endISO)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Reminders
export async function getRemindersByPlantId(plantId) {
  const store = loadStore();
  return liveRows(store.reminders)
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
    updatedAt: nowStamp(),
    deletedAt: null,
  });
  saveStore(store);
  return id;
}

export async function markReminderDone(id, todayISO = new Date().toISOString().slice(0, 10)) {
  const store = loadStore();
  const r = liveRows(store.reminders).find((rem) => rem.id === id);
  if (!r) return;
  const nextStr = nextDueAfterDone(r, todayISO);
  if (!nextStr) return;
  r.lastDoneDate = todayISO;
  r.nextDueDate = nextStr;
  r.updatedAt = nowStamp();
  saveStore(store);
  createCareLog({ plantId: r.plantId, type: careTypeForReminderKind(r.kind), date: todayISO });
}

// Ticket 131: edit a reminder's frequency and/or next due date; see lib/db.js.
export function updateReminder(id, changes) {
  const entries = pickReminderUpdates(changes);
  const store = loadStore();
  const reminder = liveRows(store.reminders).find((r) => r.id === id);
  if (!reminder) throw new Error('Rappel introuvable');
  entries.forEach(([key, value]) => {
    reminder[key] = value;
  });
  reminder.updatedAt = nowStamp();
  saveStore(store);
}

export function deleteReminder(id) {
  const store = loadStore();
  const stamp = nowStamp();
  liveRows(store.reminders).forEach((r) => {
    if (r.id === id) {
      r.deletedAt = stamp;
      r.updatedAt = stamp;
    }
  });
  saveStore(store);
}

// Photos
export async function getPhotosByPlantId(plantId) {
  const store = loadStore();
  const rows = liveRows(store.photos)
    .filter((p) => p.plantId === plantId)
    .sort((a, b) => b.date.localeCompare(a.date));
  return Promise.all(rows.map(async (row) => ({ ...row, uri: await resolvePhotoUri(row.uri) })));
}

export async function addPhoto({ plantId, careLogId, uri, date, fingerprint = null }) {
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
    fingerprint: fingerprint ?? null,
    updatedAt: nowStamp(),
    deletedAt: null,
  });
  saveStore(store);
  return id;
}

export async function deletePhoto(id) {
  const store = loadStore();
  const photo = liveRows(store.photos).find((p) => p.id === id);
  if (photo) {
    const stamp = nowStamp();
    photo.deletedAt = stamp;
    photo.updatedAt = stamp;
    await photoStore.deletePhoto(photo.uri);
  }
  saveStore(store);
}

/** Attaches (or clears, with `text` null/empty) a note to an existing photo. */
export function setPhotoCaption(photoId, text) {
  const store = loadStore();
  const photo = liveRows(store.photos).find((p) => p.id === photoId);
  if (!photo) return;
  photo.caption = text?.trim() || null;
  photo.updatedAt = nowStamp();
  saveStore(store);
}

/** Changes an existing photo's date. Throws if the photo does not exist. */
export function updatePhotoDate(id, date) {
  const store = loadStore();
  const photo = liveRows(store.photos).find((p) => p.id === id);
  if (!photo) throw new Error('Photo introuvable');
  photo.date = date;
  photo.updatedAt = nowStamp();
  saveStore(store);
}

// Ticket 082: refile a photo under another plant; see lib/db.js.
export function movePhoto(id, plantId) {
  const store = loadStore();
  const photo = liveRows(store.photos).find((p) => p.id === id);
  if (!photo) throw new Error('Photo introuvable');
  photo.plantId = plantId;
  photo.careLogId = null;
  photo.updatedAt = nowStamp();
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
// The Réglages field is gone (ticket 101); ticket 104 removes these two.

// ---------------------------------------------------------------------------
// Account session (ticket 101): on web the session is the HttpOnly cookie, so
// nothing is kept in localStorage. The token getter returns null, the setters
// do nothing, and the provider asks /auth/me who is logged in.
// ---------------------------------------------------------------------------

export async function getDeviceToken() {
  return null;
}

export async function setDeviceToken() {}

export async function getCachedAccount() {
  return null;
}

export async function setCachedAccount() {}

// ---------------------------------------------------------------------------
// Unsorted photos (ticket 056): mirrors lib/db.js's addUnsortedPhoto /
// getUnsortedPhotos / deleteUnsortedPhoto, over IndexedDB via photoStore
// instead of the file system.
// ---------------------------------------------------------------------------

export async function addUnsortedPhoto({ uri, takenAt, dateUnknown = false, fingerprint = null }) {
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
    fingerprint: fingerprint ?? null,
    updatedAt: nowStamp(),
    deletedAt: null,
  });
  saveStore(store);
  return id;
}

export async function getUnsortedPhotos() {
  const store = loadStore();
  const rows = [...liveRows(store.unsorted_photos)].sort((a, b) =>
    b.takenAt.localeCompare(a.takenAt)
  );
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      uri: await resolvePhotoUri(row.uri),
      dateUnknown: !!row.dateUnknown,
      fingerprint: row.fingerprint ?? null,
    }))
  );
}

/**
 * Ticket 085: mirrors lib/db.js's findDuplicateOfUnsorted, including the
 * preference for `plantId`'s own photos. The size of a stored photo is the
 * byte length of its data URL's payload.
 */
export async function findDuplicateOfUnsorted(unsortedId, plantId, date) {
  const store = loadStore();
  const unsorted = liveRows(store.unsorted_photos).find((p) => p.id === unsortedId);
  if (!unsorted) return null;
  const livePlants = liveRows(store.plants);
  const toResult = async (row) => ({
    id: row.id,
    uri: await resolvePhotoUri(row.uri),
    date: row.date,
    plantId: row.plantId,
    plantName: livePlants.find((pl) => pl.id === row.plantId)?.name ?? null,
  });
  // The target plant's photos first, then everyone else's. A photo whose
  // plant is deleted is deleted with it (the join in lib/db.js).
  const livePhotos = liveRows(store.photos).filter((p) =>
    livePlants.some((pl) => pl.id === p.plantId)
  );
  const ordered = [
    ...livePhotos.filter((p) => p.plantId === plantId),
    ...livePhotos.filter((p) => p.plantId !== plantId),
  ];
  if (unsorted.fingerprint) {
    const match = ordered.find((p) => p.fingerprint === unsorted.fingerprint);
    if (match) return toResult(match);
  }
  const wanted = dataUrlByteLength(await photoStore.loadPhoto(unsorted.uri));
  if (!wanted) return null;
  for (const candidate of ordered) {
    if (candidate.fingerprint || candidate.date !== date) continue;
    const size = dataUrlByteLength(await photoStore.loadPhoto(candidate.uri));
    if (sameByteSize(wanted, size)) return toResult(candidate);
  }
  return null;
}

export async function deleteUnsortedPhoto(id) {
  const store = loadStore();
  const photo = liveRows(store.unsorted_photos).find((p) => p.id === id);
  if (photo) {
    const stamp = nowStamp();
    photo.deletedAt = stamp;
    photo.updatedAt = stamp;
    await photoStore.deletePhoto(photo.uri);
  }
  saveStore(store);
}

// ---------------------------------------------------------------------------
// Bloom observations (ticket 056, storage part of 029): mirrors
// lib/db.js's addBloomObservation / getBloomObservations.
// ---------------------------------------------------------------------------

export async function addBloomObservation({ plantId, date, kind = 'open' }) {
  if (kind !== 'open' && kind !== 'end') throw new Error('Type d’observation inconnu');
  const store = loadStore();
  const existing = liveRows(store.bloom_observations).find(
    (o) => o.plantId === plantId && o.date === date && o.kind === kind
  );
  if (existing) return existing.id;
  const id = uuid();
  store.bloom_observations.push({
    id,
    plantId,
    date,
    kind,
    updatedAt: nowStamp(),
    deletedAt: null,
  });
  saveStore(store);
  return id;
}

export function deleteBloomObservation(id) {
  const store = loadStore();
  const stamp = nowStamp();
  liveRows(store.bloom_observations).forEach((o) => {
    if (o.id === id) {
      o.deletedAt = stamp;
      o.updatedAt = stamp;
    }
  });
  saveStore(store);
}

export async function getBloomObservations(plantId) {
  const store = loadStore();
  return liveRows(store.bloom_observations)
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
  // `uri` is a device-local ref: rewriting it deliberately leaves updatedAt alone.
  for (const photo of liveRows(store.photos)) {
    if (isRemoteRef(photo.uri)) continue; // fetched on display (ticket 095)
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
  if (copied) writeStore(store);
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
    const raw = await resolvePhotoUri(uri);
    return await readPhotoFileData(raw);
  } catch {
    return null;
  }
}

/**
 * Builds the whole garden as a streamed backup (lib/backupStream.js, ticket
 * 102) and returns `{ blob, counts }`. The Blob is assembled from one small
 * Blob per line, never from one joined string, and photos are read from the
 * store one at a time (read once to learn its ext for the header, again when
 * its line is written). `onProgress(done, total)` follows each photo; the
 * file name is chosen by the caller, as lib/db.js takes it as an option too.
 */
export async function exportGardenToFile({ onProgress } = {}) {
  const store = loadStore();
  const tables = {
    zones: liveRows(store.zones),
    garden_plan: liveRows(store.garden_plan),
    plan_features: liveRows(store.plan_features),
    plants: liveRows(store.plants),
    reminders: liveRows(store.reminders),
    care_logs: liveRows(store.care_logs),
    photos: liveRows(store.photos),
    unsorted_photos: liveRows(store.unsorted_photos),
    bloom_observations: liveRows(store.bloom_observations),
  };

  const pending = [];
  const descriptors = { photos: {}, unsorted_photos: {} };
  for (const table of PHOTO_TABLES) {
    for (const row of tables[table]) {
      const data = await readArchivableFile(row.uri);
      descriptors[table][row.id] = data ? { ext: data.ext } : null;
      if (data) pending.push({ table, id: row.id, uri: row.uri, ext: data.ext });
    }
  }

  const header = buildBackup({
    tables,
    photoData: descriptors.photos,
    unsortedPhotoData: descriptors.unsorted_photos,
    version: BACKUP_VERSION_STREAMED,
  });

  async function* photoEntries() {
    let done = 0;
    for (const item of pending) {
      const data = await readArchivableFile(item.uri);
      done++;
      if (onProgress) onProgress(done, pending.length);
      if (data) yield { table: item.table, id: item.id, ext: item.ext, base64: data.base64 };
    }
  }

  const parts = [];
  for await (const line of encodeBackupLines(header, photoEntries())) {
    parts.push(new Blob([line]));
  }
  return { blob: new Blob(parts, { type: 'application/json' }), counts: header.counts };
}

export async function isGardenEmpty() {
  const store = loadStore();
  return SYNCED_TABLES.every((table) => !store[table].some(isLive));
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
  const photoFiles = await writeArchivedFilesWeb(tables.photos);
  const unsortedFiles = await writeArchivedFilesWeb(tables.unsorted_photos ?? []);
  return commitImportWeb(tables, {
    photoRefs: photoFiles.refsById,
    unsortedRefs: unsortedFiles.refsById,
    writtenIds: [...photoFiles.writtenIds, ...unsortedFiles.writtenIds],
  });
}

// The storage half of an import, shared by importGarden (version 1) and
// importGardenFromFile (version 2); see the matching commitImport in
// lib/db.js. `photoRefs` / `unsortedRefs` map a row id to the `idb:` ref of
// its already-stored photo; a row with no ref is skipped.
async function commitImportWeb(tables, { photoRefs, unsortedRefs, writtenIds }) {
  const unsortedPhotoRows = tables.unsorted_photos ?? [];
  const bloomObservationRows = tables.bloom_observations ?? [];
  const gardenPlanRows = tables.garden_plan ?? [];
  const planFeatureRows = tables.plan_features ?? [];
  const skippedPhotos = tables.photos.filter((p) => !photoRefs[p.id]).length;
  const skippedUnsorted = unsortedPhotoRows.filter((p) => !unsortedRefs[p.id]).length;

  const stamp = nowStamp();
  const withStamp = (row) => ({ ...row, updatedAt: row.updatedAt ?? stamp, deletedAt: null });
  const oldStore = loadStore();
  const oldPhotoRefs = [...oldStore.photos, ...oldStore.unsorted_photos]
    .map((p) => p.uri)
    .filter(isIdbRef);

  try {
    saveStore({
      zones: tables.zones.map(withStamp),
      garden_plan: gardenPlanRows.map(withStamp),
      plan_features: planFeatureRows.map(withStamp),
      plants: tables.plants.map(withStamp),
      reminders: tables.reminders.map(withStamp),
      care_logs: tables.care_logs.map(withStamp),
      photos: tables.photos
        .filter((p) => photoRefs[p.id])
        .map((p) => ({
          id: p.id,
          plantId: p.plantId,
          careLogId: p.careLogId ?? null,
          date: p.date,
          caption: p.caption ?? null,
          fingerprint: p.fingerprint ?? null,
          updatedAt: p.updatedAt ?? stamp,
          deletedAt: null,
          uri: photoRefs[p.id],
        })),
      unsorted_photos: unsortedPhotoRows
        .filter((p) => unsortedRefs[p.id])
        .map((p) => ({
          id: p.id,
          takenAt: p.takenAt,
          caption: p.caption ?? null,
          dateUnknown: !!p.dateUnknown,
          fingerprint: p.fingerprint ?? null,
          updatedAt: p.updatedAt ?? stamp,
          deletedAt: null,
          uri: unsortedRefs[p.id],
        })),
      bloom_observations: bloomObservationRows.map(withStamp),
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
      unsorted_photos: unsortedPhotoRows.length - skippedUnsorted,
      bloom_observations: bloomObservationRows.length,
      garden_plan: gardenPlanRows.length,
      plan_features: planFeatureRows.length,
    },
    skippedPhotos,
  };
}

// The picked File/Blob's bytes as chunks (the browser streams it from disk).
async function* blobChunks(blob) {
  const reader = blob.stream().getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Reads only what a preview needs: `{ ok, backup }` or `{ ok: false, error }`.
 * A version 2 file yields its header; an older file is read whole and parsed
 * as before. `source` is the picked File (or any Blob).
 */
export async function previewBackupFile(source) {
  const header = await readBackupHeader(blobChunks(source));
  if (header.kind === 'streamed') return header.result;
  return parseBackup(await source.text());
}

/**
 * Replaces the garden with `source`, whose preview `backup` came from
 * previewBackupFile. Version 2: each photo is stored in IndexedDB as it is
 * read; the tables are only replaced once the whole file, end line included,
 * was read. On any failure the stored photos are deleted and the garden is
 * untouched. Mirrors lib/db.js's importGardenFromFile.
 */
export async function importGardenFromFile(source, backup) {
  if (backup.version === BACKUP_VERSION) return importGarden(backup);

  const refs = { photos: {}, unsorted_photos: {} };
  const writtenIds = [];
  try {
    await readBackupPhotos(blobChunks(source), backup, async ({ table, id, ext, base64 }) => {
      try {
        const newId = uuid();
        refs[table][id] = await photoStore.storePhoto(newId, fileDataToDataUrl({ ext, base64 }));
        writtenIds.push(newId);
      } catch {
        // Unstorable photo: its row is skipped, as in a version 1 import.
      }
    });
  } catch (e) {
    for (const id of writtenIds) {
      try {
        await photoStore.deletePhoto(`idb:${id}`);
      } catch {
        // Best-effort cleanup; the garden is untouched either way.
      }
    }
    throw e;
  }
  return commitImportWeb(backup.tables, {
    photoRefs: refs.photos,
    unsortedRefs: refs.unsorted_photos,
    writtenIds,
  });
}

// Bloom
export async function getPlantsBloomingInMonth(month) {
  const store = loadStore();
  // ticket 090: insignificant blooms go last, name order kept within each group
  const zones = liveRows(store.zones);
  return showyFirst(
    liveRows(store.plants)
      .filter((p) => isMonthInRange(month, p.bloomStartMonth, p.bloomEndMonth))
      .map((p) => {
        const zone = zones.find((z) => z.id === p.zoneId);
        return { ...p, zoneName: zone?.name ?? null };
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  );
}

// Dashboard
export async function getDueTodayReminders() {
  const store = loadStore();
  const today = new Date().toISOString().slice(0, 10);
  const plants = liveRows(store.plants);
  const zones = liveRows(store.zones);
  return liveRows(store.reminders)
    .filter((r) => r.enabled && r.nextDueDate === today)
    .filter((r) => plants.some((pl) => pl.id === r.plantId))
    .map((r) => {
      const p = plants.find((pl) => pl.id === r.plantId);
      return {
        ...r,
        plantName: p?.name,
        plantId: r.plantId,
        zoneName: zones.find((z) => z.id === p?.zoneId)?.name ?? null,
      };
    })
    .sort((a, b) => a.kind.localeCompare(b.kind));
}

export async function getOverdueReminders() {
  const store = loadStore();
  const today = new Date().toISOString().slice(0, 10);
  const plants = liveRows(store.plants);
  const zones = liveRows(store.zones);
  return liveRows(store.reminders)
    .filter((r) => r.enabled && r.nextDueDate < today)
    .filter((r) => plants.some((pl) => pl.id === r.plantId))
    .map((r) => {
      const p = plants.find((pl) => pl.id === r.plantId);
      return {
        ...r,
        plantName: p?.name,
        plantId: r.plantId,
        zoneName: zones.find((z) => z.id === p?.zoneId)?.name ?? null,
      };
    })
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
}

// Zone detail: all plants with best available image
export async function getPlantsByZoneWithImages(zoneId) {
  const store = loadStore();
  const livePhotos = liveRows(store.photos);
  const rows = liveRows(store.plants)
    .filter((p) => p.zoneId === zoneId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((p) => {
      const photos = livePhotos
        .filter((ph) => ph.plantId === p.id)
        .sort((a, b) => b.date.localeCompare(a.date));
      return {
        id: p.id,
        name: p.name,
        sun: p.sun,
        imageUrls: p.imageUrls,
        photoUri: pickCoverPhoto(photos, p.coverPhotoId)?.uri ?? null,
      };
    });
  return Promise.all(rows.map(withResolvedPhotoUri));
}

// Zone context: last watering, next reminder, sun exposure
export async function getZoneContextInfo(zoneId) {
  const store = loadStore();
  const livePlants = liveRows(store.plants);
  const zonePlantIds = new Set(livePlants.filter((p) => p.zoneId === zoneId).map((p) => p.id));

  const waterings = liveRows(store.care_logs)
    .filter((c) => zonePlantIds.has(c.plantId) && c.type === 'watered')
    .sort((a, b) => b.date.localeCompare(a.date));
  const lastWatering = waterings.length ? { date: waterings[0].date } : null;

  const reminders = liveRows(store.reminders)
    .filter((r) => zonePlantIds.has(r.plantId) && r.enabled)
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  const nextReminder = reminders.length
    ? { kind: reminders[0].kind, nextDueDate: reminders[0].nextDueDate }
    : null;

  const sunCounts = new Map();
  for (const p of livePlants) {
    if (p.zoneId !== zoneId || p.sun == null || p.sun === 'unknown') continue;
    sunCounts.set(p.sun, (sunCounts.get(p.sun) ?? 0) + 1);
  }
  let sunInfo = null;
  for (const [sun, cnt] of sunCounts) {
    if (!sunInfo || cnt > sunInfo.cnt) sunInfo = { sun, cnt };
  }

  return { lastWatering, nextReminder, sunInfo };
}

// ---------------------------------------------------------------------------
// Sync adapter (tickets 094, 095): the storage half of lib/sync.js over this
// localStorage cache, same semantics as lib/db.js. The decisions live in the
// pure module. The "uploaded" set is device-local sync bookkeeping, kept in
// its own key and never exported in a backup. A pulled photo is not
// downloaded in bulk (no pending-download set on web): it is stored as a
// `remote:<id>` ref, marked uploaded, and fetched when displayed.
// ---------------------------------------------------------------------------

const PHOTO_STATE_KEY = 'garden_photo_state';

function loadUploaded() {
  try {
    return JSON.parse(localStorage.getItem(PHOTO_STATE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function saveUploaded(uploaded) {
  localStorage.setItem(PHOTO_STATE_KEY, JSON.stringify(uploaded));
}

// Whether this cache holds the photo's bytes (not a remote: ref, not lost).
async function hasLocalBytes(uri) {
  if (typeof uri !== 'string') return false;
  if (uri.startsWith('data:')) return true;
  if (!isIdbRef(uri)) return false;
  return (await photoStore.loadPhoto(uri)) !== uri;
}

// Server columns are numbers/strings; the web store holds some booleans.
function toSyncRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof value === 'boolean' ? (value ? 1 : 0) : value;
  }
  return out;
}

/** Every synced row (deleted ones too) stamped at or after `watermark`. */
export async function getRowsChangedSince(watermark) {
  const store = loadStore();
  const entries = [];
  for (const table of SYNCED_TABLES) {
    for (const row of store[table]) {
      if (!watermark || String(row.updatedAt ?? '') >= watermark) {
        entries.push({ table, row: toSyncRow(row) });
      }
    }
  }
  return entries;
}

/**
 * Merges one pulled page, last write wins per row, in one localStorage write.
 * Pulled rows keep their remote updatedAt. Does not notify local-change
 * listeners. Resolves `{ applied }`.
 */
export async function applyRemoteRows(changes) {
  const entries = orderedChanges(changes);
  const store = loadStore();
  const uploaded = loadUploaded();
  const staleUris = [];
  let applied = 0;
  for (const { table, row: remote } of entries) {
    const id = typeof remote?.id === 'string' ? remote.id : '';
    const local = store[table].find((r) => r.id === id) ?? null;
    const isPhoto = PHOTO_TABLES.includes(table);
    const plan = planRemoteRow(table, local, remote, {
      localFileExists: isPhoto && local ? await hasLocalBytes(local.uri) : false,
    });
    if (!plan) continue;
    if (plan.action === 'insert') {
      const row = { deletedAt: null, ...plan.row };
      if (isPhoto) row.uri = remoteRef(row.id);
      store[table].push(row);
    } else {
      Object.assign(local, plan.row);
      if (plan.needsDownload) local.uri = remoteRef(plan.row.id);
    }
    if (isPhoto) {
      // The server has the bytes of a photo it sent us a row for.
      if (plan.needsDownload) uploaded[plan.row.id] = 1;
      if (plan.deleteFile) {
        delete uploaded[plan.row.id];
        forgetRemotePhoto(plan.row.id);
        if (local?.uri) staleUris.push(local.uri);
      }
    }
    applied++;
  }
  if (applied) {
    writeStore(store);
    saveUploaded(uploaded);
  }
  for (const uri of staleUris) await photoStore.deletePhoto(uri);
  return { applied };
}

/** Counts for the first-sync check (ticket 096); unused on web, kept in step. */
export async function getLocalSyncCounts() {
  const store = loadStore();
  const uploaded = loadUploaded();
  const rows = {};
  for (const table of SYNCED_TABLES) rows[table] = liveRows(store[table]).length;
  let photoFiles = 0;
  let pendingUploads = 0;
  for (const table of PHOTO_TABLES) {
    for (const row of liveRows(store[table])) {
      if (!(await hasLocalBytes(row.uri))) continue;
      photoFiles++;
      if (!uploaded[row.id]) pendingUploads++;
    }
  }
  return { rows, photoFiles, pendingUploads };
}

/** Live photo rows whose bytes the server may not have yet. */
export async function listPhotosToUpload() {
  const store = loadStore();
  const uploaded = loadUploaded();
  const out = [];
  for (const table of PHOTO_TABLES) {
    for (const row of liveRows(store[table])) {
      if (!uploaded[row.id] && !isRemoteRef(row.uri)) out.push({ table, id: row.id });
    }
  }
  return out;
}

/** The photo's bytes and media type, or null when this cache does not hold them. */
export async function readPhotoBytes(table, id) {
  if (!PHOTO_TABLES.includes(table)) throw new Error(`Table inconnue : ${table}`);
  const row = loadStore()[table].find((r) => r.id === id);
  if (!row) return null;
  const dataUrl = await photoStore.loadPhoto(row.uri);
  const match = typeof dataUrl === 'string' ? /^data:([^;]+);base64,(.*)$/s.exec(dataUrl) : null;
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime: match[1] };
}

export async function markPhotoUploaded(id) {
  const uploaded = loadUploaded();
  uploaded[id] = 1;
  saveUploaded(uploaded);
}

// Photos are fetched on display on web, never in bulk.
export async function listPhotosToDownload() {
  return [];
}

export async function downloadPhoto() {
  return { status: 410 };
}

/**
 * Empties the cache of the signed-in account's garden: every row, the photo
 * bytes, the sync bookkeeping and the blob URLs of displayed server photos.
 * `ownerId` (the account the cache is about to hold) is recorded so a later
 * sign-in can tell whether the cache is its own; null when signed out.
 * lib/db.js refuses: the phone's garden is never a cache.
 */
export async function resetLocalCache(ownerId = null) {
  revokeRemotePhotos();
  await photoStore.clearAll();
  writeStore(emptyStore());
  for (const key of [PHOTO_STATE_KEY, MISSING_PHOTOS_KEY]) localStorage.removeItem(key);
  for (const key of [PUSHED_THROUGH_KEY, PULLED_REVISION_KEY, LAST_SYNC_KEY, CACHE_OWNER_KEY]) {
    localStorage.removeItem(SETTING_KEY_PREFIX + key);
  }
  if (ownerId != null) setSetting(CACHE_OWNER_KEY, String(ownerId));
}
