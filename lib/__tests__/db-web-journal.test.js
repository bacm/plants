/**
 * Ticket 115: journal entries (care_logs with widthCm / heightCm) and the plan
 * size they feed, through lib/db.web.js (same contract as lib/db.js).
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

describe('lib/db.web.js journal', () => {
  let db;
  let plantId;

  beforeEach(async () => {
    for (const key of Object.keys(store)) delete store[key];
    jest.resetModules();
    db = require('../db.web.js');
    db.initDb();
    plantId = db.createPlant({ name: 'Rose', type: 'shrub', sun: 'full', water: 'medium' });
  });

  it('stores a measurement and lists it', async () => {
    db.createCareLog({
      plantId,
      type: 'measured',
      date: '2026-09-12',
      widthCm: '120',
      heightCm: 90,
    });
    const logs = await db.getCareLogsByPlantId(plantId);
    expect(logs[0]).toMatchObject({ type: 'measured', widthCm: 120, heightCm: 90 });
  });

  it('refuses invalid entries without writing', async () => {
    expect(() => db.createCareLog({ plantId, type: 'measured', date: '2026-09-12' })).toThrow();
    expect(() => db.createCareLog({ plantId, type: 'note', notes: ' ' })).toThrow();
    expect(await db.getCareLogsByPlantId(plantId)).toHaveLength(0);
  });

  it('keeps care entries unchanged (no sizes)', async () => {
    db.createCareLog({ plantId, type: 'watered', date: '2026-09-12', widthCm: 100 });
    const [log] = await db.getCareLogsByPlantId(plantId);
    expect(log).toMatchObject({ type: 'watered', widthCm: null, heightCm: null });
  });

  it('getPlants exposes the latest measured width, ignoring deleted entries', async () => {
    db.createCareLog({ plantId, type: 'measured', date: '2026-03-01', widthCm: 60 });
    const newest = db.createCareLog({
      plantId,
      type: 'measured',
      date: '2026-09-12',
      widthCm: 120,
      heightCm: 90,
    });
    db.createCareLog({ plantId, type: 'measured', date: '2026-10-01', heightCm: 100 });
    let [plant] = await db.getPlants();
    expect(plant).toMatchObject({ measuredWidthCm: 120, measuredAt: '2026-09-12' });
    db.deleteCareLog(newest);
    [plant] = await db.getPlants();
    expect(plant).toMatchObject({ measuredWidthCm: 60, measuredAt: '2026-03-01' });
  });

  it('has no measured width without a measurement', async () => {
    const [plant] = await db.getPlants();
    expect(plant).toMatchObject({ measuredWidthCm: null, measuredAt: null });
  });

  it('a measurement with a width clears the manual plan size; height only does not', async () => {
    db.setPlantPlanSize(plantId, 200);
    db.createCareLog({ plantId, type: 'measured', date: '2026-09-12', heightCm: 90 });
    expect((await db.getPlants())[0].planSizeCm).toBe(200);
    db.createCareLog({ plantId, type: 'measured', date: '2026-09-13', widthCm: 120 });
    expect((await db.getPlants())[0].planSizeCm).toBeNull();
    db.setPlantPlanSize(plantId, 80);
    expect((await db.getPlants())[0]).toMatchObject({ planSizeCm: 80, measuredWidthCm: 120 });
  });

  it('observations are not watering', async () => {
    db.createCareLog({ plantId, type: 'bloom', date: '2026-09-12' });
    db.createCareLog({ plantId, type: 'note', date: '2026-09-12', notes: 'x' });
    const logs = await db.getCareLogsByPlantId(plantId);
    expect(logs.map((l) => l.type).sort()).toEqual(['bloom', 'note']);
  });

  it('updateCareLog changes the fields, bumps updatedAt and clears a manual size on a new width', async () => {
    const id = db.createCareLog({ plantId, type: 'note', date: '2026-09-12', notes: 'a' });
    const [before] = await db.getCareLogsByPlantId(plantId);
    db.setPlantPlanSize(plantId, 80);
    await new Promise((r) => setTimeout(r, 5));
    db.updateCareLog(id, { type: 'note', date: '2026-09-13', notes: 'b' });
    const logs = await db.getCareLogsByPlantId(plantId);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ id, date: '2026-09-13', notes: 'b' });
    expect(logs[0].updatedAt > before.updatedAt).toBe(true);
    expect((await db.getPlantById(plantId)).planSizeCm).toBe(80);
    db.updateCareLog(id, { type: 'measured', date: '2026-09-13', widthCm: 110 });
    expect(await db.getCareLogById(id)).toMatchObject({ type: 'measured', widthCm: 110 });
    expect((await db.getPlantById(plantId)).planSizeCm).toBeNull();
  });

  it('updateCareLog refuses an invalid entry and an unknown id', async () => {
    const id = db.createCareLog({ plantId, type: 'note', notes: 'a' });
    expect(() => db.updateCareLog(id, { type: 'note', date: '2026-09-13', notes: ' ' })).toThrow();
    expect(() => db.updateCareLog('nope', { type: 'note', notes: 'x' })).toThrow(
      'Entrée introuvable'
    );
    expect((await db.getCareLogById(id)).notes).toBe('a');
  });
});
