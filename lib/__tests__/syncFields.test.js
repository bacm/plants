import { SYNCED_TABLES, nowStamp, isLive, liveRows, stampLegacyRows } from '../syncFields';

describe('syncFields', () => {
  it('lists the nine synced tables, frozen', () => {
    expect([...SYNCED_TABLES].sort()).toEqual([
      'bloom_observations',
      'care_logs',
      'garden_plan',
      'photos',
      'plan_features',
      'plants',
      'reminders',
      'unsorted_photos',
      'zones',
    ]);
    expect(Object.isFrozen(SYNCED_TABLES)).toBe(true);
  });

  it('nowStamp is an ISO timestamp', () => {
    expect(nowStamp()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('isLive and liveRows treat a missing or null deletedAt as live', () => {
    const rows = [{ id: 1 }, { id: 2, deletedAt: null }, { id: 3, deletedAt: '2026-01-01' }];
    expect(isLive(rows[0])).toBe(true);
    expect(isLive(rows[2])).toBe(false);
    expect(liveRows(rows).map((r) => r.id)).toEqual([1, 2]);
  });

  it('stampLegacyRows stamps only rows without updatedAt and counts them', () => {
    const rows = [{ id: 1 }, { id: 2, updatedAt: null }, { id: 3, updatedAt: 'kept' }];
    expect(stampLegacyRows(rows, 'NOW')).toBe(2);
    expect(rows.map((r) => r.updatedAt)).toEqual(['NOW', 'NOW', 'kept']);
    expect(stampLegacyRows(rows, 'LATER')).toBe(0);
  });
});
