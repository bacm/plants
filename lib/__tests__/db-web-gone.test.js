/**
 * Ticket 134: a plant marked gone (goneAt) stays in the database but is left
 * out of every list, count of live plants and reminder query on lib/db.web.js
 * (same contract as lib/db.js). The plant sheet still opens it, and
 * countPlantsInZone still counts it because it guards zone deletion.
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

describe('lib/db.web.js gone plants', () => {
  let db;
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().getMonth() + 1;

  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
    jest.resetModules();
    db = require('../db.web.js');
    db.initDb();
  });

  // A live plant and a gone one, same zone, both blooming now with a reminder due.
  function seed() {
    const zoneId = db.createZone({ name: 'Bed' });
    const base = {
      type: 'shrub',
      sun: 'full_sun',
      water: 'medium',
      zoneId,
      bloomStartMonth: 1,
      bloomEndMonth: 12,
    };
    const live = db.createPlant({ ...base, name: 'Vivante' });
    const gone = db.createPlant({ ...base, name: 'Disparue' });
    for (const plantId of [live, gone]) {
      db.createReminder({ plantId, kind: 'water', frequencyDays: 7, nextDueDate: today });
      db.createCareLog({ plantId, type: 'watered', date: '2026-01-01' });
    }
    db.updatePlant(gone, { goneAt: '2026-09-30' });
    return { zoneId, live, gone };
  }

  it('getPlants hides gone plants, and gone: true shows only them', async () => {
    const { zoneId, live, gone } = seed();
    expect((await db.getPlants()).map((p) => p.id)).toEqual([live]);
    expect((await db.getPlants({ gone: true })).map((p) => p.id)).toEqual([gone]);
    expect((await db.getPlants({ gone: true, zoneId })).map((p) => p.id)).toEqual([gone]);
    expect(await db.getPlants({ gone: true, search: 'vivante' })).toEqual([]);
    expect((await db.getPlants({ gone: false })).map((p) => p.id)).toEqual([live]);
  });

  it('restoring a plant (goneAt null) brings it back', async () => {
    const { live, gone } = seed();
    db.updatePlant(gone, { goneAt: null });
    expect((await db.getPlants()).map((p) => p.id).sort()).toEqual([live, gone].sort());
    expect(await db.getPlants({ gone: true })).toEqual([]);
  });

  it('getPlantById still returns a gone plant', async () => {
    const { gone } = seed();
    expect((await db.getPlantById(gone)).goneAt).toBe('2026-09-30');
  });

  it('bloom, reminders and zone queries skip gone plants', async () => {
    const { zoneId, live } = seed();
    expect((await db.getPlantsBloomingInMonth(month)).map((p) => p.id)).toEqual([live]);
    expect((await db.getDueTodayReminders()).map((r) => r.plantId)).toEqual([live]);
    expect(await db.getOverdueReminders()).toEqual([]);
    expect((await db.getPlantsByZoneWithImages(zoneId)).map((p) => p.id)).toEqual([live]);
    expect((await db.getZoneContextInfo(zoneId)).sunInfo).toEqual({ sun: 'full_sun', cnt: 1 });
  });

  it('overdue reminders of a gone plant are not listed', async () => {
    const { live, gone } = seed();
    for (const plantId of [live, gone]) {
      const [reminder] = await db.getRemindersByPlantId(plantId);
      db.updateReminder(reminder.id, { nextDueDate: '2020-01-01' });
    }
    expect((await db.getOverdueReminders()).map((r) => r.plantId)).toEqual([live]);
    expect((await db.getOverdueReminders()).some((r) => r.plantId === gone)).toBe(false);
    expect(await db.getRemindersByPlantId(gone)).toHaveLength(1);
  });

  it('countPlantsInZone counts gone plants too', async () => {
    const { zoneId } = seed();
    expect(await db.countPlantsInZone(zoneId)).toBe(2);
  });
});
