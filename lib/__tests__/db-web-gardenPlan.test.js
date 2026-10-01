/**
 * Ticket 105: garden plan reads and writes through lib/db.web.js (same names
 * and contract as lib/db.js, which cannot run under Jest).
 */
const store = {};
global.localStorage = {
  getItem: (key) => (key in store ? store[key] : null),
  setItem: (key, value) => {
    store[key] = String(value);
  },
  removeItem: (key) => {
    delete store[key];
  },
};

const RECT = [
  [0, 0],
  [400, 0],
  [400, 300],
  [0, 300],
];

describe('lib/db.web.js garden plan', () => {
  let db;
  let changes;

  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
    jest.resetModules();
    db = require('../db.web.js');
    db.initDb();
    changes = 0;
    db.onLocalChange(() => changes++);
  });

  const newPlant = (extra = {}) =>
    db.createPlant({ name: 'Rose', type: 'shrub', sun: 'full', water: 'medium', ...extra });

  it('has no plan until one is saved, then upserts the single row', async () => {
    expect(await db.getGardenPlan()).toBeNull();
    db.saveGardenPlan({ widthCm: 1500, lengthCm: 2500 });
    expect(await db.getGardenPlan()).toEqual({ widthCm: 1500, lengthCm: 2500 });
    db.saveGardenPlan({ widthCm: 2000, lengthCm: 2500 });
    expect(await db.getGardenPlan()).toEqual({ widthCm: 2000, lengthCm: 2500 });
    expect(JSON.parse(store['garden_db']).garden_plan).toHaveLength(1);
    expect(changes).toBe(2);
  });

  it('refuses invalid sizes with a French error and writes nothing', async () => {
    expect(() => db.saveGardenPlan({ widthCm: 0, lengthCm: 100 })).toThrow(/Dimensions/);
    expect(() => db.saveGardenPlan({ widthCm: 100.5, lengthCm: 100 })).toThrow();
    expect(() => db.saveGardenPlan({ widthCm: 100, lengthCm: 100001 })).toThrow();
    expect(await db.getGardenPlan()).toBeNull();
    expect(changes).toBe(0);
  });

  it('ignores a soft-deleted plan row', async () => {
    db.saveGardenPlan({ widthCm: 1500, lengthCm: 2500 });
    const raw = JSON.parse(store['garden_db']);
    raw.garden_plan[0].deletedAt = '2026-01-01T00:00:00.000Z';
    store['garden_db'] = JSON.stringify(raw);
    expect(await db.getGardenPlan()).toBeNull();
  });

  it('places a plant and leaves the zone alone when no zoneId key is given', async () => {
    const zoneId = db.createZone({ name: 'Pelouse' });
    const id = newPlant({ zoneId });
    db.setPlantPosition(id, { x: 120, y: 80 });
    expect(await db.getPlantById(id)).toMatchObject({ planX: 120, planY: 80, zoneId });
  });

  it('sets the zone with the position, or clears it with null', async () => {
    const zoneId = db.createZone({ name: 'Pelouse' });
    const id = newPlant();
    db.setPlantPosition(id, { x: 1, y: 2, zoneId });
    expect((await db.getPlantById(id)).zoneId).toBe(zoneId);
    db.setPlantPosition(id, { x: 3, y: 4, zoneId: null });
    expect(await db.getPlantById(id)).toMatchObject({ planX: 3, planY: 4, zoneId: null });
  });

  it('unplaces with null coordinates and rejects half or fractional positions', async () => {
    const id = newPlant();
    db.setPlantPosition(id, { x: 5, y: 6 });
    db.setPlantPosition(id, { x: null, y: null });
    expect(await db.getPlantById(id)).toMatchObject({ planX: null, planY: null });
    expect(() => db.setPlantPosition(id, { x: 5, y: null })).toThrow(/Position/);
    expect(() => db.setPlantPosition(id, { x: 1.5, y: 2 })).toThrow();
  });

  it('stamps updatedAt and notifies on a position write', async () => {
    const id = newPlant();
    const before = (await db.getPlantById(id)).updatedAt;
    changes = 0;
    await new Promise((r) => setTimeout(r, 5));
    db.setPlantPosition(id, { x: 1, y: 1 });
    expect((await db.getPlantById(id)).updatedAt > before).toBe(true);
    expect(changes).toBe(1);
  });

  it('stores a zone polygon as JSON, clears it, and refuses an invalid one', async () => {
    const zoneId = db.createZone({ name: 'Pelouse' });
    expect((await db.getZones())[0].polygon).toBeNull();
    db.setZonePolygon(zoneId, RECT);
    expect(JSON.parse((await db.getZones())[0].polygon)).toEqual(RECT);
    expect(() =>
      db.setZonePolygon(zoneId, [
        [0, 0],
        [1, 1],
      ])
    ).toThrow();
    expect(JSON.parse((await db.getZones())[0].polygon)).toEqual(RECT);
    db.setZonePolygon(zoneId, null);
    expect((await db.getZones())[0].polygon).toBeNull();
  });

  it('createZone accepts a polygon', async () => {
    db.createZone({ name: 'Massif', polygon: RECT });
    expect(JSON.parse((await db.getZones())[0].polygon)).toEqual(RECT);
  });

  it('counts a saved plan as a non-empty garden', async () => {
    expect(await db.isGardenEmpty()).toBe(true);
    db.saveGardenPlan({ widthCm: 1500, lengthCm: 2500 });
    expect(await db.isGardenEmpty()).toBe(false);
  });
});
