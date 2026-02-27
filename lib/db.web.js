// Web fallback for expo-sqlite using localStorage
// Metro automatically resolves db.web.js on web platform

const STORAGE_KEY = 'garden_db';

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
  return store.zones.sort((a, b) => (a.orderIndex - b.orderIndex) || a.name.localeCompare(b.name));
}

export function createZone({ name, description, orderIndex = 0 }) {
  const store = loadStore();
  const id = uuid();
  store.zones.push({ id, name, description: description ?? null, orderIndex });
  saveStore(store);
  return id;
}

export function updateZone(id, { name, description, orderIndex }) {
  const store = loadStore();
  const zone = store.zones.find((z) => z.id === id);
  if (!zone) return;
  if (name !== undefined) zone.name = name;
  if (description !== undefined) zone.description = description;
  if (orderIndex !== undefined) zone.orderIndex = orderIndex;
  saveStore(store);
}

export function deleteZone(id) {
  const store = loadStore();
  store.plants.forEach((p) => { if (p.zoneId === id) p.zoneId = null; });
  store.zones = store.zones.filter((z) => z.id !== id);
  saveStore(store);
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
    results = results.filter(
      (p) => p.bloomStartMonth != null && p.bloomEndMonth != null && p.bloomStartMonth <= filters.bloomMonth && p.bloomEndMonth >= filters.bloomMonth
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

const PLANT_TYPES = ['perennial', 'annual', 'shrub', 'tree', 'bulb', 'groundcover', 'vine'];
const SUN = ['full_sun', 'partial', 'shade'];
const WATER = ['low', 'medium', 'high'];

export function createPlant(plant) {
  const store = loadStore();
  const id = uuid();
  const now = new Date().toISOString();
  store.plants.push({
    id,
    name: plant.name,
    latinName: plant.latinName ?? null,
    type: plant.type ?? 'perennial',
    flowerColor: plant.flowerColor ?? null,
    sun: plant.sun ?? 'partial',
    water: plant.water ?? 'medium',
    bloomStartMonth: plant.bloomStartMonth ?? null,
    bloomEndMonth: plant.bloomEndMonth ?? null,
    zoneId: plant.zoneId ?? null,
    notes: plant.notes ?? null,
    createdAt: now,
  });
  saveStore(store);
  return id;
}

export function updatePlant(id, updates) {
  const store = loadStore();
  const plant = store.plants.find((p) => p.id === id);
  if (!plant) return;
  const allowed = ['name', 'latinName', 'type', 'flowerColor', 'sun', 'water', 'bloomStartMonth', 'bloomEndMonth', 'zoneId', 'notes'];
  for (const key of allowed) {
    if (updates[key] !== undefined) plant[key] = updates[key];
  }
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

const CARE_TYPES = ['watered', 'pruned', 'fertilized', 'deadheaded', 'treated', 'repotted', 'planted', 'moved'];

export function createCareLog({ plantId, type, date, notes }) {
  const store = loadStore();
  const id = uuid();
  const d = date || new Date().toISOString().slice(0, 10);
  store.care_logs.push({ id, plantId, type, date: d, notes: notes ?? null });
  saveStore(store);
  return id;
}

// Reminders
export async function getRemindersByPlantId(plantId) {
  const store = loadStore();
  return store.reminders
    .filter((r) => r.plantId === plantId)
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
}

export async function getDueReminders(overdue = false) {
  const store = loadStore();
  const today = new Date().toISOString().slice(0, 10);
  return store.reminders
    .filter((r) => {
      if (!r.enabled) return false;
      return overdue ? r.nextDueDate < today : r.nextDueDate <= today;
    })
    .map((r) => {
      const p = store.plants.find((pl) => pl.id === r.plantId);
      const z = p ? store.zones.find((zo) => zo.id === p.zoneId) : null;
      return { ...r, plantName: p?.name, zoneId: p?.zoneId, zoneName: z?.name ?? null };
    })
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
}

export async function getUpcomingReminders(limit = 10) {
  const store = loadStore();
  const today = new Date().toISOString().slice(0, 10);
  return store.reminders
    .filter((r) => r.enabled && r.nextDueDate > today)
    .map((r) => {
      const p = store.plants.find((pl) => pl.id === r.plantId);
      return { ...r, plantName: p?.name };
    })
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))
    .slice(0, limit);
}

const REMINDER_KINDS = ['water', 'prune', 'fertilize', 'deadhead', 'winter_prep', 'custom'];

export function createReminder({ plantId, kind, frequencyDays, nextDueDate, lastDoneDate }) {
  const store = loadStore();
  const id = uuid();
  const next = nextDueDate || new Date().toISOString().slice(0, 10);
  store.reminders.push({
    id, plantId, kind, frequencyDays, nextDueDate: next,
    lastDoneDate: lastDoneDate ?? null, enabled: 1,
  });
  saveStore(store);
  return id;
}

export function markReminderDone(id) {
  const store = loadStore();
  const r = store.reminders.find((rem) => rem.id === id);
  if (!r) return;
  const next = new Date(r.nextDueDate);
  next.setDate(next.getDate() + r.frequencyDays);
  r.lastDoneDate = r.nextDueDate;
  r.nextDueDate = next.toISOString().slice(0, 10);
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
  return store.photos
    .filter((p) => p.plantId === plantId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function addPhoto({ plantId, careLogId, uri }) {
  const store = loadStore();
  const id = uuid();
  const date = new Date().toISOString().slice(0, 10);
  store.photos.push({ id, plantId, careLogId: careLogId ?? null, uri, date });
  saveStore(store);
  return id;
}

export function deletePhoto(id) {
  const store = loadStore();
  store.photos = store.photos.filter((p) => p.id !== id);
  saveStore(store);
}

// Bloom
export async function getPlantsBloomingInMonth(month) {
  const store = loadStore();
  return store.plants
    .filter((p) => p.bloomStartMonth != null && p.bloomEndMonth != null && p.bloomStartMonth <= month && p.bloomEndMonth >= month)
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

export { PLANT_TYPES, SUN, WATER, CARE_TYPES, REMINDER_KINDS };
