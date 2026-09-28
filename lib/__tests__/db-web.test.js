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

    await db.markReminderDone(reminderId);

    const [reminder] = await db.getRemindersByPlantId(plantId);
    expect(reminder.lastDoneDate).toBe('2028-02-29');
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

    await db.markReminderDone(reminderId);

    const [reminder] = await db.getRemindersByPlantId(plantId);
    expect(reminder.nextDueDate).toBe('2026-03-08');
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
      uri: 'data:image/jpeg;base64,VU5TT1JURUQ=',
    });

    await db.deleteUnsortedPhoto(id);
    expect(await db.getUnsortedPhotos()).toEqual([]);
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
});
