const { daysUntil, reminderDueText } = require('../reminderDue');

describe('daysUntil', () => {
  it('is 0 for today', () => {
    expect(daysUntil('2026-09-29', '2026-09-29')).toBe(0);
  });

  it('is positive for a future date', () => {
    expect(daysUntil('2026-10-02', '2026-09-29')).toBe(3);
  });

  it('is negative for a past date', () => {
    expect(daysUntil('2026-09-27', '2026-09-29')).toBe(-2);
  });

  it('handles a month boundary', () => {
    expect(daysUntil('2026-10-01', '2026-09-29')).toBe(2);
  });
});

describe('reminderDueText', () => {
  it('labels a reminder due today as "Aujourd’hui" and overdue', () => {
    expect(reminderDueText('2026-09-29', '2026-09-29')).toEqual({
      text: 'Aujourd’hui',
      overdue: true,
    });
  });

  it('labels a future reminder with a countdown and a short date, singular', () => {
    expect(reminderDueText('2026-09-30', '2026-09-29')).toEqual({
      text: 'Dans 1 jour · 30 sep.',
      overdue: false,
    });
  });

  it('labels a future reminder with a countdown and a short date, plural', () => {
    expect(reminderDueText('2026-10-02', '2026-09-29')).toEqual({
      text: 'Dans 3 jours · 2 oct.',
      overdue: false,
    });
  });

  it('labels an overdue reminder, singular', () => {
    expect(reminderDueText('2026-09-28', '2026-09-29')).toEqual({
      text: 'En retard de 1 jour',
      overdue: true,
    });
  });

  it('labels an overdue reminder, plural', () => {
    expect(reminderDueText('2026-09-20', '2026-09-29')).toEqual({
      text: 'En retard de 9 jours',
      overdue: true,
    });
  });

  it('defaults todayISO to now when not given', () => {
    const result = reminderDueText(new Date().toISOString().slice(0, 10));
    expect(result).toEqual({ text: 'Aujourd’hui', overdue: true });
  });
});
