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

describe('lib/db.web.js — deleteCareLog, getPlantsByZoneWithImages, getZoneContextInfo', () => {
  let db;

  beforeEach(() => {
    jest.resetModules();
    global.localStorage = makeLocalStorage();
    db = require('../db.web.js');
    db.initDb();
  });

  test('deleteCareLog removes the log and detaches photos that reference it', async () => {
    const zoneId = db.createZone({ name: 'Front bed' });
    const plantId = db.createPlant({ name: 'Rose', type: 'perennial', sun: 'full', water: 'medium', zoneId });
    const logId = db.createCareLog({ plantId, type: 'watered', date: '2026-01-01' });
    const photoId = db.addPhoto({ plantId, careLogId: logId, uri: 'photo.jpg', date: '2026-01-01' });

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
      name: 'Older', type: 'perennial', sun: 'full', water: 'medium', zoneId,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const p2 = db.createPlant({
      name: 'Newer', type: 'perennial', sun: 'shade', water: 'low', zoneId,
      createdAt: '2026-02-01T00:00:00.000Z',
    });
    db.createPlant({ name: 'Other zone', type: 'perennial', sun: 'full', water: 'medium', zoneId: otherZoneId });
    db.addPhoto({ plantId: p2, uri: 'old.jpg', date: '2026-02-02' });
    db.addPhoto({ plantId: p2, uri: 'new.jpg', date: '2026-02-05' });

    const rows = await db.getPlantsByZoneWithImages(zoneId);

    expect(rows).toEqual([
      { id: p2, name: 'Newer', sun: 'shade', imageUrls: null, photoUri: 'new.jpg' },
      { id: p1, name: 'Older', sun: 'full', imageUrls: null, photoUri: null },
    ]);
  });

  test('getZoneContextInfo aggregates last watering, next reminder and dominant sun', async () => {
    const zoneId = db.createZone({ name: 'Patio' });
    const p1 = db.createPlant({ name: 'A', type: 'perennial', sun: 'full', water: 'medium', zoneId });
    const p2 = db.createPlant({ name: 'B', type: 'perennial', sun: 'full', water: 'medium', zoneId });
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
});
