// Web fallback for expo-sqlite using localStorage
// Metro automatically resolves db.web.js on web platform

import { addDaysISO } from './dates';
import { isMonthInRange } from './months';
import { pickPlantUpdates, plantInsertValues } from './plantFields';
import { pickZoneUpdates } from './zoneFields';
import { createPhotoStore, createIndexedDbAdapter } from './webPhotoStore';

const STORAGE_KEY = 'garden_db';
const photoStore = createPhotoStore(createIndexedDbAdapter());

async function withResolvedPhotoUri(row) {
  if (!row || row.photoUri == null) return row;
  return { ...row, photoUri: await photoStore.loadPhoto(row.photoUri) };
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { zones: [], plants: [], care_logs: [], reminders: [], photos: [] };
}

function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function initDb() {
  // Ensure store exists
  if (!localStorage.getItem(STORAGE_KEY)) {
    saveStore({ zones: [], plants: [], care_logs: [], reminders: [], photos: [] });
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
    return { ...p, zoneName: zone?.name ?? null, reminderCount };
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
  return results.sort((a, b) => a.name.localeCompare(b.name));
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

// Reminders
export async function getRemindersByPlantId(plantId) {
  const store = loadStore();
  return store.reminders
    .filter((r) => r.plantId === plantId)
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
}

export function createReminder({ plantId, kind, frequencyDays, nextDueDate, lastDoneDate }) {
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
  });
  saveStore(store);
  return id;
}

export async function markReminderDone(id) {
  const store = loadStore();
  const r = store.reminders.find((rem) => rem.id === id);
  if (!r) return;
  const nextStr = addDaysISO(r.nextDueDate, r.frequencyDays);
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
  const ref = await photoStore.storePhoto(id, uri);
  store.photos.push({ id, plantId, careLogId: careLogId ?? null, uri: ref, date: photoDate });
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

/**
 * One-time (idempotent) migration of photo rows still holding an inline
 * data: URL in localStorage into IndexedDB, matching lib/db.js's
 * `migratePhotosToAppStorage`. Rows already migrated (an `idb:` ref) are
 * left alone. Nothing on web can go "missing" the way a purged native cache
 * file can, so `missing` is always 0 — the shape is kept for parity with the
 * native module and with app/_layout.js, which calls this once at startup.
 */
export async function migratePhotosToAppStorage() {
  const store = loadStore();
  let copied = 0;
  for (const photo of store.photos) {
    if (typeof photo.uri === 'string' && photo.uri.startsWith('data:')) {
      photo.uri = await photoStore.storePhoto(photo.id, photo.uri);
      copied++;
    }
  }
  if (copied) saveStore(store);
  return { copied, missing: 0 };
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
      return { ...r, plantName: p?.name, plantId: r.plantId };
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
      return { ...r, plantName: p?.name, plantId: r.plantId };
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
    if (p.zoneId !== zoneId || p.sun == null) continue;
    sunCounts.set(p.sun, (sunCounts.get(p.sun) ?? 0) + 1);
  }
  let sunInfo = null;
  for (const [sun, cnt] of sunCounts) {
    if (!sunInfo || cnt > sunInfo.cnt) sunInfo = { sun, cnt };
  }

  return { lastWatering, nextReminder, sunInfo };
}
