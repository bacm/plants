/**
 * Ticket 110: garden features drawn on the plan, through lib/db.web.js (same
 * names and contract as lib/db.js, which cannot run under Jest).
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
  [500, 0],
  [500, 400],
  [0, 400],
];

describe('lib/db.web.js plan features', () => {
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

  it('creates a feature, trims its label and lists it', async () => {
    const id = db.createPlanFeature({ kind: 'terrace', label: '  Terrasse sud ', polygon: RECT });
    const [feature] = await db.getPlanFeatures();
    expect(feature).toMatchObject({ id, kind: 'terrace', label: 'Terrasse sud' });
    expect(JSON.parse(feature.polygon)).toEqual(RECT);
    expect(changes).toBe(1);
  });

  it('stores an empty label as null', async () => {
    db.createPlanFeature({ kind: 'house', label: '   ', polygon: RECT });
    expect((await db.getPlanFeatures())[0].label).toBeNull();
  });

  it('refuses a bad kind, a long label or an invalid polygon with a French error', () => {
    expect(() => db.createPlanFeature({ kind: 'lawn', polygon: RECT })).toThrow(/Type/);
    expect(() =>
      db.createPlanFeature({ kind: 'house', label: 'x'.repeat(61), polygon: RECT })
    ).toThrow(/trop long/);
    expect(() =>
      db.createPlanFeature({
        kind: 'house',
        polygon: [
          [0, 0],
          [1, 1],
        ],
      })
    ).toThrow(/Contour/);
    expect(changes).toBe(0);
  });

  it('updates only the given keys and stamps updatedAt', async () => {
    const id = db.createPlanFeature({ kind: 'shed', label: 'Abri', polygon: RECT });
    const before = JSON.parse(store['garden_db']).plan_features[0].updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    db.updatePlanFeature(id, { kind: 'pond' });
    let [feature] = await db.getPlanFeatures();
    expect(feature).toMatchObject({ kind: 'pond', label: 'Abri' });
    db.updatePlanFeature(id, { label: null });
    [feature] = await db.getPlanFeatures();
    expect(feature.label).toBeNull();
    const moved = RECT.map(([x, y]) => [x + 50, y]);
    db.updatePlanFeature(id, { polygon: moved });
    [feature] = await db.getPlanFeatures();
    expect(JSON.parse(feature.polygon)).toEqual(moved);
    expect(JSON.parse(store['garden_db']).plan_features[0].updatedAt > before).toBe(true);
    expect(changes).toBe(4);
    expect(() => db.updatePlanFeature(id, { kind: 'lawn' })).toThrow();
  });

  it('soft-deletes: the row stays, stamped, but is no longer listed', async () => {
    const id = db.createPlanFeature({ kind: 'path', polygon: RECT });
    db.deletePlanFeature(id);
    expect(await db.getPlanFeatures()).toEqual([]);
    const [row] = JSON.parse(store['garden_db']).plan_features;
    expect(row.deletedAt).not.toBeNull();
    expect(row.updatedAt).toBe(row.deletedAt);
    // Updating a deleted feature does nothing.
    db.updatePlanFeature(id, { kind: 'pond' });
    expect(await db.getPlanFeatures()).toEqual([]);
  });

  it('counts a feature as a non-empty garden, and never appears among the zones', async () => {
    expect(await db.isGardenEmpty()).toBe(true);
    db.createPlanFeature({ kind: 'house', polygon: RECT });
    expect(await db.isGardenEmpty()).toBe(false);
    expect(await db.getZones()).toEqual([]);
  });

  it('is part of the synced rows', async () => {
    db.createPlanFeature({ kind: 'house', polygon: RECT });
    const entries = await db.getRowsChangedSince(null);
    expect(entries.filter((e) => e.table === 'plan_features')).toHaveLength(1);
  });
});
