/**
 * lib/seasonalTasks.js is the pure derivation shared by ticket 022 (yearly
 * reminder suggestions) and ticket 031 (the dashboard's "Ce mois-ci au
 * jardin" list). Covers each rule individually, the wrap-year harvest case,
 * ordering, and isTaskDone across a year boundary.
 */
const {
  WINTER_PREP_MONTH,
  deriveSeasonalTasks,
  seasonalRemindersFor,
  isTaskDone,
  careTypeForKind,
  reminderKindForKind,
  nextOccurrenceOfMonthStart,
} = require('../seasonalTasks');

function plant(overrides = {}) {
  return {
    id: 'p1',
    name: 'Rosier',
    pruningMonth: null,
    harvestMonthStart: null,
    harvestMonthEnd: null,
    bloomEndMonth: null,
    winterCare: null,
    ...overrides,
  };
}

describe('deriveSeasonalTasks', () => {
  it('derives a prune task when pruningMonth matches', () => {
    const tasks = deriveSeasonalTasks([plant({ pruningMonth: 3 })], 3);
    expect(tasks).toEqual([{ plantId: 'p1', plantName: 'Rosier', kind: 'prune', month: 3 }]);
  });

  it('derives a harvest task when the month is within the harvest window', () => {
    const tasks = deriveSeasonalTasks([plant({ harvestMonthStart: 6, harvestMonthEnd: 8 })], 7);
    expect(tasks).toEqual([{ plantId: 'p1', plantName: 'Rosier', kind: 'harvest', month: 7 }]);
  });

  it('derives a deadhead task when bloomEndMonth matches', () => {
    const tasks = deriveSeasonalTasks([plant({ bloomEndMonth: 9 })], 9);
    expect(tasks).toEqual([{ plantId: 'p1', plantName: 'Rosier', kind: 'deadhead', month: 9 }]);
  });

  it('derives a winter_prep task only in WINTER_PREP_MONTH when winterCare is set', () => {
    expect(deriveSeasonalTasks([plant({ winterCare: 'Pailler' })], WINTER_PREP_MONTH)).toEqual([
      { plantId: 'p1', plantName: 'Rosier', kind: 'winter_prep', month: WINTER_PREP_MONTH },
    ]);
    expect(deriveSeasonalTasks([plant({ winterCare: 'Pailler' })], WINTER_PREP_MONTH + 1)).toEqual(
      []
    );
  });

  it('does not derive a winter_prep task when winterCare is empty', () => {
    expect(deriveSeasonalTasks([plant({ winterCare: '' })], WINTER_PREP_MONTH)).toEqual([]);
    expect(deriveSeasonalTasks([plant({ winterCare: null })], WINTER_PREP_MONTH)).toEqual([]);
  });

  it('handles a harvest window that wraps the year (Nov-Feb) in January', () => {
    const tasks = deriveSeasonalTasks([plant({ harvestMonthStart: 11, harvestMonthEnd: 2 })], 1);
    expect(tasks).toEqual([{ plantId: 'p1', plantName: 'Rosier', kind: 'harvest', month: 1 }]);
  });

  it('produces no task for a plant with no seasonal data at all', () => {
    expect(deriveSeasonalTasks([plant()], 6)).toEqual([]);
  });

  it('orders tasks by kind (prune, harvest, deadhead, winter_prep) then plant name', () => {
    const plants = [
      plant({ id: 'p-z', name: 'Zinnia', bloomEndMonth: 6 }),
      plant({ id: 'p-a', name: 'Abricotier', harvestMonthStart: 6, harvestMonthEnd: 6 }),
      plant({ id: 'p-b', name: 'Buis', pruningMonth: 6 }),
      plant({ id: 'p-e', name: 'Érable', pruningMonth: 6 }),
    ];
    const tasks = deriveSeasonalTasks(plants, 6);
    expect(tasks.map((t) => [t.kind, t.plantName])).toEqual([
      ['prune', 'Buis'],
      ['prune', 'Érable'],
      ['harvest', 'Abricotier'],
      ['deadhead', 'Zinnia'],
    ]);
  });

  it('returns one task per applicable kind when several rules match the same plant/month', () => {
    const tasks = deriveSeasonalTasks(
      [plant({ pruningMonth: 4, harvestMonthStart: 4, harvestMonthEnd: 4, bloomEndMonth: 4 })],
      4
    );
    expect(tasks.map((t) => t.kind)).toEqual(['prune', 'harvest', 'deadhead']);
  });

  it('returns an empty array for no plants', () => {
    expect(deriveSeasonalTasks([], 5)).toEqual([]);
    expect(deriveSeasonalTasks(undefined, 5)).toEqual([]);
  });
});

describe('seasonalRemindersFor', () => {
  it('returns null for a null plant', () => {
    expect(seasonalRemindersFor(null)).toEqual([]);
  });

  it('returns one suggestion per rule that applies, in kind order', () => {
    const suggestions = seasonalRemindersFor(
      plant({
        pruningMonth: 3,
        harvestMonthStart: 7,
        harvestMonthEnd: 9,
        bloomEndMonth: 8,
        winterCare: 'Voile hivernage',
      })
    );
    expect(suggestions).toEqual([
      { kind: 'prune', month: 3 },
      { kind: 'harvest', month: 7 },
      { kind: 'deadhead', month: 8 },
      { kind: 'winter_prep', month: WINTER_PREP_MONTH },
    ]);
  });

  it('uses the harvest window start month only, not the end month', () => {
    const suggestions = seasonalRemindersFor(plant({ harvestMonthStart: 6, harvestMonthEnd: 9 }));
    expect(suggestions).toEqual([{ kind: 'harvest', month: 6 }]);
  });

  it('returns nothing for a plant with no seasonal data', () => {
    expect(seasonalRemindersFor(plant())).toEqual([]);
  });
});

describe('careTypeForKind / reminderKindForKind', () => {
  it('maps every task kind to its care-log type and reminder kind', () => {
    expect(careTypeForKind('prune')).toBe('pruned');
    expect(careTypeForKind('harvest')).toBe('harvested');
    expect(careTypeForKind('deadhead')).toBe('deadheaded');
    expect(careTypeForKind('winter_prep')).toBe('winterized');
    expect(careTypeForKind('unknown')).toBeNull();

    expect(reminderKindForKind('prune')).toBe('prune');
    expect(reminderKindForKind('harvest')).toBe('harvest');
    expect(reminderKindForKind('deadhead')).toBe('deadhead');
    expect(reminderKindForKind('winter_prep')).toBe('winter_prep');
    expect(reminderKindForKind('unknown')).toBeNull();
  });
});

describe('isTaskDone', () => {
  const task = { plantId: 'p1', plantName: 'Rosier', kind: 'prune', month: 3 };

  it('is true when a matching care log exists in that month/year', () => {
    const logs = [{ plantId: 'p1', type: 'pruned', date: '2026-03-15' }];
    expect(isTaskDone(task, logs, 2026)).toBe(true);
  });

  it('is false when the log is for the same month but a different year', () => {
    const logs = [{ plantId: 'p1', type: 'pruned', date: '2025-03-15' }];
    expect(isTaskDone(task, logs, 2026)).toBe(false);
  });

  it('is false when the log is for a different plant', () => {
    const logs = [{ plantId: 'p2', type: 'pruned', date: '2026-03-15' }];
    expect(isTaskDone(task, logs, 2026)).toBe(false);
  });

  it('is false when the log is a different care type', () => {
    const logs = [{ plantId: 'p1', type: 'watered', date: '2026-03-15' }];
    expect(isTaskDone(task, logs, 2026)).toBe(false);
  });

  it('is false with no logs at all', () => {
    expect(isTaskDone(task, [], 2026)).toBe(false);
    expect(isTaskDone(task, undefined, 2026)).toBe(false);
  });
});

describe('nextOccurrenceOfMonthStart', () => {
  it('uses this year when the 1st of that month has not passed yet', () => {
    expect(nextOccurrenceOfMonthStart(6, '2026-03-15')).toBe('2026-06-01');
  });

  it('uses next year when the 1st of that month already passed', () => {
    expect(nextOccurrenceOfMonthStart(2, '2026-03-15')).toBe('2027-02-01');
  });

  it('uses this year when today is exactly the 1st of that month', () => {
    expect(nextOccurrenceOfMonthStart(3, '2026-03-01')).toBe('2026-03-01');
  });
});
