const { buildHeroSubtitle, groupDueTasks, latenessLabel } = require('../dashboard');

describe('buildHeroSubtitle', () => {
  it('shows an empty garden with just the month and a neutral phrase', () => {
    expect(buildHeroSubtitle(9, 0, 0)).toBe('Septembre · Votre jardin se porte bien.');
  });

  it('uses singular forms for a count of one', () => {
    expect(buildHeroSubtitle(9, 1, 1)).toBe('Septembre · 1 plante en fleur · 1 soin aujourd’hui');
  });

  it('uses plural forms for counts above one', () => {
    expect(buildHeroSubtitle(9, 3, 2)).toBe('Septembre · 3 plantes en fleur · 2 soins aujourd’hui');
  });

  it('omits the bloom part when there is nothing blooming', () => {
    expect(buildHeroSubtitle(9, 0, 2)).toBe('Septembre · 2 soins aujourd’hui');
  });

  it('omits the care part when nothing is due', () => {
    expect(buildHeroSubtitle(9, 3, 0)).toBe('Septembre · 3 plantes en fleur');
  });

  it('returns an empty month name for an invalid month', () => {
    expect(buildHeroSubtitle(13, 0, 0)).toBe(' · Votre jardin se porte bien.');
  });
});

function reminder(overrides = {}) {
  return {
    id: 'r1',
    plantId: 'p1',
    plantName: 'Rosier',
    kind: 'water',
    nextDueDate: '2026-09-27',
    frequencyDays: 7,
    ...overrides,
  };
}

describe('latenessLabel', () => {
  it('labels today (and any non-positive value) as "aujourd’hui"', () => {
    expect(latenessLabel(0)).toBe('aujourd’hui');
    expect(latenessLabel(-1)).toBe('aujourd’hui');
  });

  it('uses the elided singular for one day late', () => {
    expect(latenessLabel(1)).toBe("en retard d'1 jour");
  });

  it('uses the plural for more than one day late', () => {
    expect(latenessLabel(3)).toBe('en retard de 3 jours');
  });
});

describe('groupDueTasks', () => {
  const today = '2026-09-27';

  it('groups reminders of the same kind due the same day together', () => {
    const groups = groupDueTasks(
      [
        reminder({ id: 'r1', plantName: 'Rosier', nextDueDate: today }),
        reminder({ id: 'r2', plantName: 'Lavande', nextDueDate: today }),
      ],
      today
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ kind: 'water', dueDate: today, daysLate: 0 });
    expect(groups[0].reminders.map((r) => r.id)).toEqual(['r1', 'r2']);
  });

  it('keeps different kinds due the same day in separate groups', () => {
    const groups = groupDueTasks(
      [
        reminder({ id: 'r1', kind: 'water', nextDueDate: today }),
        reminder({ id: 'r2', kind: 'fertilize', nextDueDate: today }),
      ],
      today
    );
    expect(groups).toHaveLength(2);
  });

  it('keeps the same kind due on different days in separate groups', () => {
    const groups = groupDueTasks(
      [
        reminder({ id: 'r1', kind: 'water', nextDueDate: today }),
        reminder({ id: 'r2', kind: 'water', nextDueDate: '2026-09-20' }),
      ],
      today
    );
    expect(groups).toHaveLength(2);
  });

  it('orders overdue groups before today’s, most late first', () => {
    const groups = groupDueTasks(
      [
        reminder({ id: 'r1', kind: 'water', nextDueDate: today }),
        reminder({ id: 'r2', kind: 'prune', nextDueDate: '2026-09-24' }),
        reminder({ id: 'r3', kind: 'fertilize', nextDueDate: '2026-09-20' }),
      ],
      today
    );
    expect(groups.map((g) => g.daysLate)).toEqual([7, 3, 0]);
  });

  it('produces a single-reminder group for a plant on its own', () => {
    const groups = groupDueTasks([reminder({ id: 'r1', nextDueDate: today })], today);
    expect(groups).toHaveLength(1);
    expect(groups[0].reminders).toHaveLength(1);
  });

  it('returns an empty list for no reminders', () => {
    expect(groupDueTasks([], today)).toEqual([]);
    expect(groupDueTasks(undefined, today)).toEqual([]);
  });
});
