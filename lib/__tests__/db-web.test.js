/**
 * lib/db.web.js touches only localStorage, so it can be imported under Jest
 * with a small in-memory stub. This covers the three functions that were
 * missing from the web shim (docs/backlog/005-decide-web-target.md): each
 * one is checked against the equivalent SQL in lib/db.js.
 */
function makeLocalStorage() {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    clear: () => {
      store = {};
    },
  };
}

/**
 * Minimal fake of the IndexedDB API surface lib/webPhotoStore.js uses
 * (open/onupgradeneeded, one object store, get/put/delete). Good enough for
 * lib/db.web.js's photo functions (ticket 043) without a new dependency;
 * data is kept in a plain Map and request/transaction callbacks fire on a
 * microtask, matching how real IndexedDB defers them.
 */
function makeFakeIndexedDB() {
  const stores = new Map(); // dbName -> Map(storeName -> Map(key, value))

  function fireAsync(fn) {
    Promise.resolve().then(fn);
  }

  return {
    open(name) {
      const request = { onsuccess: null, onupgradeneeded: null, onerror: null, result: null };
      if (!stores.has(name)) stores.set(name, new Map());
      const storeMap = stores.get(name);
      const dbHandle = {
        objectStoreNames: { contains: (n) => storeMap.has(n) },
        createObjectStore: (n) => storeMap.set(n, new Map()),
        transaction: (storeName) => {
          const data = storeMap.get(storeName);
          const tx = {
            oncomplete: null,
            onerror: null,
            onabort: null,
            objectStore: () => ({
              get: (key) => {
                const req = { onsuccess: null, onerror: null, result: data.get(key) };
                fireAsync(() => req.onsuccess && req.onsuccess());
                return req;
              },
              put: (value, key) => {
                data.set(key, value);
                const req = { onsuccess: null, onerror: null, result: key };
                fireAsync(() => req.onsuccess && req.onsuccess());
                return req;
              },
              delete: (key) => {
                data.delete(key);
                const req = { onsuccess: null, onerror: null, result: undefined };
                fireAsync(() => req.onsuccess && req.onsuccess());
                return req;
              },
            }),
          };
          fireAsync(() => tx.oncomplete && tx.oncomplete());
          return tx;
        },
      };
      request.result = dbHandle;
      fireAsync(() => {
        if (!storeMap.has('photos')) request.onupgradeneeded && request.onupgradeneeded();
        request.onsuccess && request.onsuccess();
      });
      return request;
    },
  };
}

describe('lib/db.web.js — deleteCareLog, getPlantsByZoneWithImages, getZoneContextInfo', () => {
  let db;

  beforeEach(() => {
    jest.resetModules();
    global.localStorage = makeLocalStorage();
    global.indexedDB = makeFakeIndexedDB();
    db = require('../db.web.js');
    db.initDb();
  });

  test('deleteCareLog removes the log and detaches photos that reference it', async () => {
    const zoneId = db.createZone({ name: 'Front bed' });
    const plantId = db.createPlant({
      name: 'Rose',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
      zoneId,
    });
    const logId = db.createCareLog({ plantId, type: 'watered', date: '2026-01-01' });
    const photoId = await db.addPhoto({
      plantId,
      careLogId: logId,
      uri: 'data:image/jpeg;base64,UEhPVE8=',
      date: '2026-01-01',
    });

    db.deleteCareLog(logId);

    const logs = await db.getCareLogsByPlantId(plantId);
    expect(logs).toEqual([]);
    const photos = await db.getPhotosByPlantId(plantId);
    expect(photos).toHaveLength(1);
    expect(photos[0].id).toBe(photoId);
    expect(photos[0].careLogId).toBeNull();
  });

  test('getPlantsBloomingInMonth lists insignificant blooms last, name order within groups (ticket 090)', async () => {
    const zoneId = db.createZone({ name: 'Garden' });
    const base = { type: 'shrub', sun: 'full_sun', water: 'medium', zoneId };
    db.createPlant({
      ...base,
      name: 'Acer',
      bloomStartMonth: 4,
      bloomEndMonth: 6,
      bloomAbundance: 'insignificant',
    });
    db.createPlant({
      ...base,
      name: 'Rose',
      bloomStartMonth: 4,
      bloomEndMonth: 6,
      bloomAbundance: 'abundant',
    });
    db.createPlant({ ...base, name: 'Tulipe', bloomStartMonth: 4, bloomEndMonth: 6 });

    const plants = await db.getPlantsBloomingInMonth(5);
    expect(plants.map((p) => p.name)).toEqual(['Rose', 'Tulipe', 'Acer']);
  });

  test('getPlantsByZoneWithImages returns id/name/sun/imageUrls/photoUri, newest plant first', async () => {
    const zoneId = db.createZone({ name: 'Greenhouse' });
    const otherZoneId = db.createZone({ name: 'Elsewhere' });
    const p1 = db.createPlant({
      name: 'Older',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
      zoneId,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const p2 = db.createPlant({
      name: 'Newer',
      type: 'perennial',
      sun: 'shade',
      water: 'low',
      zoneId,
      createdAt: '2026-02-01T00:00:00.000Z',
    });
    db.createPlant({
      name: 'Other zone',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
      zoneId: otherZoneId,
    });
    await db.addPhoto({ plantId: p2, uri: 'data:image/jpeg;base64,T0xE', date: '2026-02-02' });
    await db.addPhoto({ plantId: p2, uri: 'data:image/jpeg;base64,TkVX', date: '2026-02-05' });

    const rows = await db.getPlantsByZoneWithImages(zoneId);

    expect(rows).toEqual([
      {
        id: p2,
        name: 'Newer',
        sun: 'shade',
        imageUrls: null,
        photoUri: 'data:image/jpeg;base64,TkVX',
      },
      { id: p1, name: 'Older', sun: 'full', imageUrls: null, photoUri: null },
    ]);
  });

  test('addPhoto refuses a reference it cannot read the bytes of', async () => {
    const plantId = db.createPlant({
      name: 'Rose',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
    });
    await expect(db.addPhoto({ plantId, uri: 'photo.jpg', date: '2026-01-01' })).rejects.toThrow(
      'Photo illisible'
    );
  });

  test('addPhoto stores the data in IndexedDB and keeps only an idb: ref on the row', async () => {
    const plantId = db.createPlant({
      name: 'Rose',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
    });
    await db.addPhoto({ plantId, uri: 'data:image/png;base64,AAA', date: '2026-01-01' });

    const raw = JSON.parse(global.localStorage.getItem('garden_db'));
    expect(raw.photos[0].uri).toMatch(/^idb:/);

    const photos = await db.getPhotosByPlantId(plantId);
    expect(photos[0].uri).toBe('data:image/png;base64,AAA');
  });

  test('deletePlant (ticket 077) removes bloom observations and photo bytes along with the plant', async () => {
    const plantId = db.createPlant({
      name: 'Rose',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
    });
    const otherPlantId = db.createPlant({
      name: 'Lavande',
      type: 'perennial',
      sun: 'full',
      water: 'low',
    });
    await db.addBloomObservation({ plantId, date: '2026-05-01' });
    await db.addBloomObservation({ plantId: otherPlantId, date: '2026-05-02' });
    const photoId = await db.addPhoto({
      plantId,
      uri: 'data:image/png;base64,AAA',
      date: '2026-01-01',
    });

    await db.deletePlant(plantId);

    expect(await db.getBloomObservations(plantId)).toEqual([]);
    expect(await db.getBloomObservations(otherPlantId)).toHaveLength(1);
    const raw = JSON.parse(global.localStorage.getItem('garden_db'));
    // Soft-deleted (ticket 091): the row stays, marked deleted.
    expect(raw.photos.find((p) => p.id === photoId).deletedAt).toEqual(expect.any(String));
    await expect(db.getPhotosByPlantId(plantId)).resolves.toEqual([]);
  });

  test('a chosen cover photo is the plant photoUri until it is deleted (ticket 088)', async () => {
    const zoneId = db.createZone({ name: 'Cover zone' });
    const plantId = db.createPlant({
      name: 'Rose',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
      zoneId,
    });
    const olderId = await db.addPhoto({
      plantId,
      uri: 'data:image/jpeg;base64,T0xE',
      date: '2026-01-01',
    });
    await db.addPhoto({ plantId, uri: 'data:image/jpeg;base64,TkVX', date: '2026-02-01' });

    db.updatePlant(plantId, { coverPhotoId: olderId });
    let rows = await db.getPlantsByZoneWithImages(zoneId);
    expect(rows[0].photoUri).toBe('data:image/jpeg;base64,T0xE');

    await db.deletePhoto(olderId);
    rows = await db.getPlantsByZoneWithImages(zoneId);
    expect(rows[0].photoUri).toBe('data:image/jpeg;base64,TkVX');
  });

  test('deletePhoto removes the stored data along with the row', async () => {
    const plantId = db.createPlant({
      name: 'Rose',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
    });
    const photoId = await db.addPhoto({
      plantId,
      uri: 'data:image/png;base64,AAA',
      date: '2026-01-01',
    });

    await db.deletePhoto(photoId);

    const photos = await db.getPhotosByPlantId(plantId);
    expect(photos).toEqual([]);
  });

  test('migratePhotosToAppStorage moves inline data: rows into IndexedDB, once', async () => {
    const plantId = db.createPlant({
      name: 'Rose',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
    });
    // Simulate a pre-043 row written directly with an inline data: URL.
    const raw = JSON.parse(global.localStorage.getItem('garden_db'));
    raw.photos.push({
      id: 'legacy-1',
      plantId,
      careLogId: null,
      uri: 'data:image/png;base64,BBB',
      date: '2026-01-01',
    });
    global.localStorage.setItem('garden_db', JSON.stringify(raw));

    const first = await db.migratePhotosToAppStorage();
    expect(first).toEqual({ copied: 1, missing: 0 });

    const migrated = JSON.parse(global.localStorage.getItem('garden_db'));
    expect(migrated.photos[0].uri).toMatch(/^idb:/);

    const second = await db.migratePhotosToAppStorage();
    expect(second).toEqual({ copied: 0, missing: 0 });

    const photos = await db.getPhotosByPlantId(plantId);
    expect(photos[0].uri).toBe('data:image/png;base64,BBB');
  });

  test('getZoneContextInfo aggregates last watering, next reminder and dominant sun', async () => {
    const zoneId = db.createZone({ name: 'Patio' });
    const p1 = db.createPlant({
      name: 'A',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
      zoneId,
    });
    const p2 = db.createPlant({
      name: 'B',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
      zoneId,
    });
    db.createPlant({ name: 'C', type: 'perennial', sun: 'shade', water: 'medium', zoneId });

    db.createCareLog({ plantId: p1, type: 'watered', date: '2026-01-05' });
    db.createCareLog({ plantId: p2, type: 'watered', date: '2026-01-10' });
    db.createCareLog({ plantId: p1, type: 'fertilized', date: '2026-01-20' });

    db.createReminder({ plantId: p1, kind: 'water', frequencyDays: 7, nextDueDate: '2026-03-01' });
    db.createReminder({ plantId: p2, kind: 'prune', frequencyDays: 30, nextDueDate: '2026-02-15' });

    const info = await db.getZoneContextInfo(zoneId);

    expect(info.lastWatering).toEqual({ date: '2026-01-10' });
    expect(info.nextReminder).toEqual({ kind: 'prune', nextDueDate: '2026-02-15' });
    expect(info.sunInfo).toEqual({ sun: 'full', cnt: 2 });
  });

  test('getZoneContextInfo returns nulls for a zone with no data', async () => {
    const zoneId = db.createZone({ name: 'Empty' });
    const info = await db.getZoneContextInfo(zoneId);
    expect(info).toEqual({ lastWatering: null, nextReminder: null, sunInfo: null });
  });

  test('updateZone changes name/icon/description and leaves other zones untouched', async () => {
    const zoneId = db.createZone({ name: 'Old name', description: 'Old desc', icon: '🌱' });
    const otherId = db.createZone({ name: 'Other', description: 'Other desc', icon: '🌳' });

    db.updateZone(zoneId, { name: 'New name', icon: '🌿', description: 'New desc' });

    const zones = await db.getZones();
    const zone = zones.find((z) => z.id === zoneId);
    expect(zone).toMatchObject({ name: 'New name', icon: '🌿', description: 'New desc' });
    const other = zones.find((z) => z.id === otherId);
    expect(other).toMatchObject({ name: 'Other', icon: '🌳', description: 'Other desc' });
  });

  test('updateZone rejects an unknown field', () => {
    const zoneId = db.createZone({ name: 'Bed' });
    expect(() => db.updateZone(zoneId, { orderIndex: 2, bogus: true })).toThrow(
      'Unknown zone field: bogus'
    );
  });

  test('deleteZone removes the zone and detaches its plants without deleting them', async () => {
    const zoneId = db.createZone({ name: 'Removed bed' });
    const plantId = db.createPlant({
      name: 'Rose',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
      zoneId,
    });

    db.deleteZone(zoneId);

    const zones = await db.getZones();
    expect(zones.find((z) => z.id === zoneId)).toBeUndefined();
    const plants = await db.getPlants();
    const plant = plants.find((p) => p.id === plantId);
    expect(plant).toBeDefined();
    expect(plant.zoneId).toBeNull();
  });

  test('getPlants filters by zone and by noZone, combined with type (ticket 135)', async () => {
    const a = db.createZone({ name: 'Zone A' });
    const b = db.createZone({ name: 'Zone B' });
    const base = { type: 'perennial', sun: 'full', water: 'medium' };
    db.createPlant({ ...base, name: 'InA', zoneId: a });
    db.createPlant({ ...base, name: 'InB', zoneId: b });
    db.createPlant({ ...base, name: 'Loose', type: 'shrub' });
    const names = async (f) => (await db.getPlants(f)).map((p) => p.name);
    expect(await names({ zoneId: a })).toEqual(['InA']);
    expect(await names({ noZone: true })).toEqual(['Loose']);
    expect(await names({ noZone: true, type: 'perennial' })).toEqual([]);
    db.deleteZone(b);
    expect(await names({ noZone: true })).toEqual(['InB', 'Loose']);
  });

  test('countPlantsInZone counts only plants in that zone', async () => {
    const zoneId = db.createZone({ name: 'Counted' });
    const otherZoneId = db.createZone({ name: 'Elsewhere' });
    db.createPlant({ name: 'A', type: 'perennial', sun: 'full', water: 'medium', zoneId });
    db.createPlant({ name: 'B', type: 'perennial', sun: 'full', water: 'medium', zoneId });
    db.createPlant({
      name: 'C',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
      zoneId: otherZoneId,
    });

    await expect(db.countPlantsInZone(zoneId)).resolves.toBe(2);
    await expect(db.countPlantsInZone(otherZoneId)).resolves.toBe(1);
  });

  test('createReminder rejects an unknown repeatRule', () => {
    const plantId = db.createPlant({
      name: 'Rose',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
    });
    expect(() =>
      db.createReminder({
        plantId,
        kind: 'prune',
        frequencyDays: 365,
        nextDueDate: '2026-03-01',
        repeatRule: 'monthly',
      })
    ).toThrow('Règle de répétition inconnue');
  });

  test('updateReminder changes the allowed fields, bumps updatedAt and rejects others', async () => {
    const plantId = db.createPlant({
      name: 'Rose',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
    });
    const id = db.createReminder({
      plantId,
      kind: 'water',
      frequencyDays: 7,
      nextDueDate: '2026-03-01',
    });
    const [before] = await db.getRemindersByPlantId(plantId);
    db.updateReminder(id, { frequencyDays: 10, nextDueDate: '2026-03-05' });
    const [after] = await db.getRemindersByPlantId(plantId);
    expect(after.frequencyDays).toBe(10);
    expect(after.nextDueDate).toBe('2026-03-05');
    expect(after.kind).toBe('water');
    expect(after.updatedAt >= before.updatedAt).toBe(true);
    expect(() => db.updateReminder(id, { kind: 'prune' })).toThrow('Champ de rappel inconnu');
    expect(() => db.updateReminder('nope', { frequencyDays: 3 })).toThrow('Rappel introuvable');
  });

  test('createReminder defaults repeatRule to null', async () => {
    const plantId = db.createPlant({
      name: 'Rose',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
    });
    db.createReminder({ plantId, kind: 'water', frequencyDays: 7, nextDueDate: '2026-03-01' });
    const [reminder] = await db.getRemindersByPlantId(plantId);
    expect(reminder.repeatRule).toBeNull();
  });

  test("markReminderDone on a 'yearly' reminder advances by one year, not frequencyDays", async () => {
    const plantId = db.createPlant({
      name: 'Rose',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
    });
    const reminderId = db.createReminder({
      plantId,
      kind: 'prune',
      frequencyDays: 365,
      nextDueDate: '2028-02-29',
      repeatRule: 'yearly',
    });

    await db.markReminderDone(reminderId, '2028-02-20');

    const [reminder] = await db.getRemindersByPlantId(plantId);
    expect(reminder.lastDoneDate).toBe('2028-02-20');
    // A leap day advanced a plain year lands on Feb 28, not Mar 1 (which
    // frequencyDays=365 would have given for a leap year).
    expect(reminder.nextDueDate).toBe('2029-02-28');
  });

  test('markReminderDone on a non-yearly reminder still advances by frequencyDays', async () => {
    const plantId = db.createPlant({
      name: 'Rose',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
    });
    const reminderId = db.createReminder({
      plantId,
      kind: 'water',
      frequencyDays: 7,
      nextDueDate: '2026-03-01',
    });

    await db.markReminderDone(reminderId, '2026-03-20');

    const [reminder] = await db.getRemindersByPlantId(plantId);
    // Counted from the day it was done, not from the (older) due date.
    expect(reminder.nextDueDate).toBe('2026-03-27');
    expect(reminder.lastDoneDate).toBe('2026-03-20');
    const logs = await db.getCareLogsByPlantId(plantId);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ type: 'watered', date: '2026-03-20' });
  });

  test('getCareLogsBetween returns logs (any plant) within an inclusive date range, sorted', async () => {
    const plantId = db.createPlant({
      name: 'Rose',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
    });
    const other = db.createPlant({ name: 'Sage', type: 'perennial', sun: 'full', water: 'medium' });
    db.createCareLog({ plantId, type: 'pruned', date: '2026-03-01' });
    db.createCareLog({ plantId: other, type: 'harvested', date: '2026-03-15' });
    db.createCareLog({ plantId, type: 'watered', date: '2026-03-31' });
    db.createCareLog({ plantId, type: 'watered', date: '2026-04-01' });

    const logs = await db.getCareLogsBetween('2026-03-01', '2026-03-31');

    expect(logs.map((l) => l.date)).toEqual(['2026-03-01', '2026-03-15', '2026-03-31']);
  });

  // --- ticket 056: settings, unsorted photos, bloom observations, caption ---

  test('getSetting/setSetting round-trip a value, and getSetting on an unset key is null', async () => {
    await expect(db.getSetting('lastZoneId')).resolves.toBeNull();
    db.setSetting('lastZoneId', 'zone-42');
    await expect(db.getSetting('lastZoneId')).resolves.toBe('zone-42');
    db.setSetting('lastZoneId', 'zone-43');
    await expect(db.getSetting('lastZoneId')).resolves.toBe('zone-43');
  });

  test('setPhotoCaption attaches a note to a photo, and clears it with an empty string', async () => {
    const plantId = db.createPlant({
      name: 'Rose',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
    });
    const photoId = await db.addPhoto({
      plantId,
      uri: 'data:image/jpeg;base64,UEhPVE8=',
      date: '2026-01-01',
    });

    db.setPhotoCaption(photoId, '  Première fleur  ');
    let [photo] = await db.getPhotosByPlantId(plantId);
    expect(photo.caption).toBe('Première fleur');

    db.setPhotoCaption(photoId, '   ');
    [photo] = await db.getPhotosByPlantId(plantId);
    expect(photo.caption).toBeNull();
  });

  test('updatePhotoDate changes a photo’s date, re-sorting getPhotosByPlantId', async () => {
    const plantId = db.createPlant({
      name: 'Rose',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
    });
    const olderId = await db.addPhoto({
      plantId,
      uri: 'data:image/jpeg;base64,T0xE',
      date: '2026-01-01',
    });
    const newerId = await db.addPhoto({
      plantId,
      uri: 'data:image/jpeg;base64,TkVX',
      date: '2026-02-01',
    });

    let photos = await db.getPhotosByPlantId(plantId);
    expect(photos.map((p) => p.id)).toEqual([newerId, olderId]);

    db.updatePhotoDate(olderId, '2026-03-01');
    photos = await db.getPhotosByPlantId(plantId);
    expect(photos.map((p) => p.id)).toEqual([olderId, newerId]);
    expect(photos[0].date).toBe('2026-03-01');
  });

  test('updatePhotoDate throws when the photo does not exist', () => {
    expect(() => db.updatePhotoDate('missing-id', '2026-03-01')).toThrow('Photo introuvable');
  });

  test('movePhoto refiles a photo under another plant and clears careLogId', async () => {
    const fields = { type: 'perennial', sun: 'full', water: 'medium' };
    const fromId = db.createPlant({ name: 'Rose', ...fields });
    const toId = db.createPlant({ name: 'Lavande', ...fields });
    const id = await db.addPhoto({
      plantId: fromId,
      uri: 'data:image/jpeg;base64,T0xE',
      date: '2026-01-01',
      careLogId: 'care-1',
    });

    db.movePhoto(id, toId);

    expect(await db.getPhotosByPlantId(fromId)).toHaveLength(0);
    const moved = await db.getPhotosByPlantId(toId);
    expect(moved.map((p) => p.id)).toEqual([id]);
    expect(moved[0].careLogId ?? null).toBeNull();
  });

  test('movePhoto throws when the photo does not exist', () => {
    expect(() => db.movePhoto('missing-id', 'p')).toThrow('Photo introuvable');
  });

  test('addUnsortedPhoto/getUnsortedPhotos/deleteUnsortedPhoto round-trip a "?" shot', async () => {
    const id = await db.addUnsortedPhoto({
      uri: 'data:image/jpeg;base64,VU5TT1JURUQ=',
      takenAt: '2026-04-01T09:00:00.000Z',
    });

    const photos = await db.getUnsortedPhotos();
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({
      id,
      takenAt: '2026-04-01T09:00:00.000Z',
      caption: null,
      dateUnknown: false,
      uri: 'data:image/jpeg;base64,VU5TT1JURUQ=',
    });

    await db.deleteUnsortedPhoto(id);
    expect(await db.getUnsortedPhotos()).toEqual([]);
  });

  test('addUnsortedPhoto persists dateUnknown (ticket 061): a library import with no readable date', async () => {
    const id = await db.addUnsortedPhoto({
      uri: 'data:image/jpeg;base64,VU5TT1JURUQ=',
      takenAt: '2026-09-28',
      dateUnknown: true,
    });

    const [photo] = await db.getUnsortedPhotos();
    expect(photo.id).toBe(id);
    expect(photo.dateUnknown).toBe(true);

    // Confirms the flag survives a reload (it's read back from storage, not
    // just echoed from the write), the way a relaunch before sorting would.
    const [reloaded] = await db.getUnsortedPhotos();
    expect(reloaded.dateUnknown).toBe(true);
  });

  test('assigning an unsorted photo (ticket 061): addPhoto failure keeps the unsorted row', async () => {
    // app/sort.js's "assign to a plant" flow calls addPhoto and only calls
    // deleteUnsortedPhoto once that succeeds, so a failed addPhoto never
    // loses the photo. Exercise both halves of that ordering here, since
    // app/sort.js itself (a screen) is not something Jest can import.
    const plantId = db.createPlant({
      name: 'Rose',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
    });
    const unsortedId = await db.addUnsortedPhoto({
      uri: 'data:image/jpeg;base64,VU5TT1JURUQ=',
      takenAt: '2026-04-01',
    });

    // addPhoto rejects (an unreadable uri, same as the existing
    // "addPhoto refuses..." case above) -- a caller must not have deleted
    // the unsorted row yet, and indeed still has not.
    await expect(
      db.addPhoto({ plantId, uri: 'not-a-real-uri', date: '2026-04-01' })
    ).rejects.toThrow();
    expect(await db.getUnsortedPhotos()).toHaveLength(1);
    expect(await db.getPhotosByPlantId(plantId)).toHaveLength(0);

    // Once addPhoto succeeds, the unsorted row is deleted and the photo now
    // lives on the plant.
    await db.addPhoto({
      plantId,
      uri: 'data:image/jpeg;base64,VU5TT1JURUQ=',
      date: '2026-04-01',
    });
    await db.deleteUnsortedPhoto(unsortedId);
    expect(await db.getUnsortedPhotos()).toEqual([]);
    expect(await db.getPhotosByPlantId(plantId)).toHaveLength(1);
  });

  describe('findDuplicateOfUnsorted (ticket 085)', () => {
    const PNG_A = 'data:image/jpeg;base64,VU5TT1JURUQ='; // 8 bytes
    const PNG_B = 'data:image/jpeg;base64,QUJDREVGR0g='; // 8 bytes, different content
    const PNG_C = 'data:image/jpeg;base64,QUJD'; // 3 bytes
    const newPlant = (name) =>
      db.createPlant({ name, type: 'perennial', sun: 'full', water: 'medium' });

    test('matches a photo of the plant with the same fingerprint', async () => {
      const plantId = newPlant('Rose');
      const photoId = await db.addPhoto({
        plantId,
        uri: PNG_A,
        date: '2026-04-01',
        fingerprint: 'fp1',
      });
      const unsortedId = await db.addUnsortedPhoto({
        uri: PNG_C,
        takenAt: '2026-04-05',
        fingerprint: 'fp1',
      });
      const found = await db.findDuplicateOfUnsorted(unsortedId, plantId, '2026-04-05');
      expect(found).toEqual({
        id: photoId,
        uri: PNG_A,
        date: '2026-04-01',
        plantId,
        plantName: 'Rose',
      });
    });

    test('getUnsortedPhotos and addPhoto keep the fingerprint', async () => {
      const plantId = newPlant('Rose');
      await db.addUnsortedPhoto({ uri: PNG_A, takenAt: '2026-04-05', fingerprint: 'fp1' });
      const [unsorted] = await db.getUnsortedPhotos();
      expect(unsorted.fingerprint).toBe('fp1');
      await db.addPhoto({ plantId, uri: PNG_A, date: '2026-04-05', fingerprint: 'fp1' });
      const [photo] = await db.getPhotosByPlantId(plantId);
      expect(photo.fingerprint).toBe('fp1');
    });

    test('no fingerprint: same date and same bytes match', async () => {
      const plantId = newPlant('Rose');
      const photoId = await db.addPhoto({ plantId, uri: PNG_A, date: '2026-04-01' });
      const unsortedId = await db.addUnsortedPhoto({ uri: PNG_B, takenAt: '2026-04-01' });
      const found = await db.findDuplicateOfUnsorted(unsortedId, plantId, '2026-04-01');
      expect(found).toMatchObject({ id: photoId, date: '2026-04-01' });
    });

    test('no fingerprint: a different date or different size does not match', async () => {
      const plantId = newPlant('Rose');
      await db.addPhoto({ plantId, uri: PNG_A, date: '2026-04-01' });
      const same = await db.addUnsortedPhoto({ uri: PNG_B, takenAt: '2026-04-02' });
      expect(await db.findDuplicateOfUnsorted(same, plantId, '2026-04-02')).toBeNull();
      const smaller = await db.addUnsortedPhoto({ uri: PNG_C, takenAt: '2026-04-01' });
      expect(await db.findDuplicateOfUnsorted(smaller, plantId, '2026-04-01')).toBeNull();
    });

    test('a fingerprinted photo is never matched by size alone', async () => {
      const plantId = newPlant('Rose');
      await db.addPhoto({ plantId, uri: PNG_A, date: '2026-04-01', fingerprint: 'other' });
      const unsortedId = await db.addUnsortedPhoto({
        uri: PNG_B,
        takenAt: '2026-04-01',
        fingerprint: 'fp1',
      });
      expect(await db.findDuplicateOfUnsorted(unsortedId, plantId, '2026-04-01')).toBeNull();
    });

    test('finds the photo on another plant, by fingerprint and by size', async () => {
      const plantId = newPlant('Rose');
      const otherId = newPlant('Lavande');
      const byFp = await db.addPhoto({
        plantId: otherId,
        uri: PNG_A,
        date: '2026-04-01',
        fingerprint: 'fp1',
      });
      const withFp = await db.addUnsortedPhoto({
        uri: PNG_B,
        takenAt: '2026-04-01',
        fingerprint: 'fp1',
      });
      expect(await db.findDuplicateOfUnsorted(withFp, plantId, '2026-04-01')).toMatchObject({
        id: byFp,
        plantId: otherId,
        plantName: 'Lavande',
      });

      const bySize = await db.addPhoto({ plantId: otherId, uri: PNG_C, date: '2026-05-01' });
      const noFp = await db.addUnsortedPhoto({ uri: PNG_C, takenAt: '2026-05-01' });
      expect(await db.findDuplicateOfUnsorted(noFp, plantId, '2026-05-01')).toMatchObject({
        id: bySize,
        plantId: otherId,
      });
      // The same size on another day is not a duplicate.
      expect(await db.findDuplicateOfUnsorted(noFp, plantId, '2026-05-02')).toBeNull();
    });

    test('a match on the target plant wins over one on another plant', async () => {
      const plantId = newPlant('Rose');
      const otherId = newPlant('Lavande');
      await db.addPhoto({ plantId: otherId, uri: PNG_A, date: '2026-04-01', fingerprint: 'fp1' });
      const own = await db.addPhoto({
        plantId,
        uri: PNG_A,
        date: '2026-04-01',
        fingerprint: 'fp1',
      });
      const unsortedId = await db.addUnsortedPhoto({
        uri: PNG_B,
        takenAt: '2026-04-01',
        fingerprint: 'fp1',
      });
      const found = await db.findDuplicateOfUnsorted(unsortedId, plantId, '2026-04-01');
      expect(found).toMatchObject({ id: own, plantId });
    });

    test('an unknown unsorted id returns null', async () => {
      expect(await db.findDuplicateOfUnsorted('nope', 'p', '2026-04-01')).toBeNull();
    });
  });

  test('getUnsortedPhotos orders newest taken first', async () => {
    const older = await db.addUnsortedPhoto({
      uri: 'data:image/jpeg;base64,QQ==',
      takenAt: '2026-04-01T09:00:00.000Z',
    });
    const newer = await db.addUnsortedPhoto({
      uri: 'data:image/jpeg;base64,Qg==',
      takenAt: '2026-04-02T09:00:00.000Z',
    });

    const photos = await db.getUnsortedPhotos();
    expect(photos.map((p) => p.id)).toEqual([newer, older]);
  });

  test('addBloomObservation is idempotent per plant/day and getBloomObservations sorts by date', async () => {
    const plantId = db.createPlant({
      name: 'Lavande',
      type: 'perennial',
      sun: 'full',
      water: 'low',
    });

    const first = await db.addBloomObservation({ plantId, date: '2026-05-01' });
    const second = await db.addBloomObservation({ plantId, date: '2026-05-01' });
    expect(second).toBe(first);
    await db.addBloomObservation({ plantId, date: '2026-04-15' });

    const observations = await db.getBloomObservations(plantId);
    expect(observations.map((o) => o.date)).toEqual(['2026-04-15', '2026-05-01']);
    expect(observations.every((o) => o.kind === 'open')).toBe(true);
  });

  test('bloom observations: kind validation, end insert and delete (ticket 029)', async () => {
    const plantId = db.createPlant({
      name: 'Lavande',
      type: 'perennial',
      sun: 'full',
      water: 'low',
    });

    await expect(
      db.addBloomObservation({ plantId, date: '2026-05-01', kind: 'bogus' })
    ).rejects.toThrow('Type d’observation inconnu');

    const openId = await db.addBloomObservation({ plantId, date: '2026-05-01' });
    const endId = await db.addBloomObservation({ plantId, date: '2026-05-01', kind: 'end' });
    expect(endId).not.toBe(openId);
    expect(await db.addBloomObservation({ plantId, date: '2026-05-01', kind: 'end' })).toBe(endId);
    expect((await db.getBloomObservations(plantId)).map((o) => o.kind).sort()).toEqual([
      'end',
      'open',
    ]);

    db.deleteBloomObservation(endId);
    const left = await db.getBloomObservations(plantId);
    expect(left.map((o) => o.id)).toEqual([openId]);
  });

  describe('change tracking (ticket 091)', () => {
    const plantInput = { name: 'Rose', type: 'perennial', sun: 'full', water: 'medium' };
    const rawStore = () => JSON.parse(global.localStorage.getItem('garden_db'));

    afterEach(() => {
      jest.useRealTimers();
    });

    test('deletePlant soft-deletes the plant and its children', async () => {
      const plantId = db.createPlant(plantInput);
      db.createCareLog({ plantId, type: 'watered', date: '2026-01-01' });
      db.createReminder({ plantId, kind: 'water', frequencyDays: 7 });
      await db.addPhoto({ plantId, uri: 'data:image/jpeg;base64,UEhPVE8=', date: '2026-01-01' });
      await db.addBloomObservation({ plantId, date: '2026-05-01' });

      await db.deletePlant(plantId);

      expect(await db.getPlantById(plantId)).toBeNull();
      expect(await db.getPlants()).toEqual([]);
      expect(await db.getPhotosByPlantId(plantId)).toEqual([]);
      expect(await db.getCareLogsByPlantId(plantId)).toEqual([]);
      expect(await db.getRemindersByPlantId(plantId)).toEqual([]);
      expect(await db.getBloomObservations(plantId)).toEqual([]);
      const raw = rawStore();
      for (const table of ['plants', 'photos', 'care_logs', 'reminders', 'bloom_observations']) {
        expect(raw[table]).toHaveLength(1);
        expect(raw[table][0].deletedAt).toEqual(expect.any(String));
        expect(raw[table][0].updatedAt).toBe(raw[table][0].deletedAt);
      }
    });

    test('updatePlant bumps updatedAt', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const plantId = db.createPlant(plantInput);
      expect(rawStore().plants[0].updatedAt).toBe('2026-01-01T00:00:00.000Z');
      jest.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
      db.updatePlant(plantId, { name: 'Rosier' });
      expect(rawStore().plants[0].updatedAt).toBe('2026-02-01T00:00:00.000Z');
    });

    test('initDb stamps a legacy row without updatedAt', () => {
      global.localStorage.setItem(
        'garden_db',
        JSON.stringify({
          zones: [{ id: 'z1', name: 'Old', orderIndex: 0 }],
          plants: [],
          care_logs: [],
          reminders: [],
          photos: [],
        })
      );
      db.initDb();
      const raw = rawStore();
      expect(raw.zones[0].updatedAt).toEqual(expect.any(String));
    });

    test('deleteZone soft-deletes the zone and re-stamps the detached plant', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const zoneId = db.createZone({ name: 'Front bed' });
      const plantId = db.createPlant({ ...plantInput, zoneId });
      jest.setSystemTime(new Date('2026-03-01T00:00:00.000Z'));

      db.deleteZone(zoneId);

      expect(await db.getZones()).toEqual([]);
      const raw = rawStore();
      expect(raw.zones[0].deletedAt).toBe('2026-03-01T00:00:00.000Z');
      expect(raw.plants[0].zoneId).toBeNull();
      expect(raw.plants[0].updatedAt).toBe('2026-03-01T00:00:00.000Z');
      expect((await db.getPlantById(plantId)).zoneName).toBeNull();
    });

    test('isGardenEmpty ignores deleted rows', async () => {
      const zoneId = db.createZone({ name: 'Front bed' });
      const plantId = db.createPlant({ ...plantInput, zoneId });
      expect(await db.isGardenEmpty()).toBe(false);
      await db.deletePlant(plantId);
      db.deleteZone(zoneId);
      expect(await db.isGardenEmpty()).toBe(true);
    });
  });
});
