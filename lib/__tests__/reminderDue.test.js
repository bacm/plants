const {
  daysUntil,
  reminderDueText,
  nextDueAfterDone,
  postponedDueDate,
  pickReminderUpdates,
} = require('../reminderDue');

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

describe('nextDueAfterDone', () => {
  const today = '2026-10-08';

  it('counts the interval from today for an overdue weekly reminder', () => {
    expect(nextDueAfterDone({ frequencyDays: 7, nextDueDate: '2026-09-17' }, today)).toBe(
      '2026-10-15'
    );
  });

  it('counts from today when done early', () => {
    expect(nextDueAfterDone({ frequencyDays: 7, nextDueDate: '2026-10-12' }, today)).toBe(
      '2026-10-15'
    );
  });

  it('returns null for an invalid frequency', () => {
    expect(nextDueAfterDone({ frequencyDays: 0, nextDueDate: '2026-10-01' }, today)).toBeNull();
    expect(nextDueAfterDone({ frequencyDays: null, nextDueDate: '2026-10-01' }, today)).toBeNull();
  });

  it('moves a yearly reminder overdue by two years to the next future anniversary', () => {
    const r = { repeatRule: 'yearly', frequencyDays: 365, nextDueDate: '2024-03-15' };
    expect(nextDueAfterDone(r, today)).toBe('2027-03-15');
  });

  it('moves a yearly reminder done before its due date by one year', () => {
    const r = { repeatRule: 'yearly', frequencyDays: 365, nextDueDate: '2026-11-01' };
    expect(nextDueAfterDone(r, today)).toBe('2027-11-01');
  });

  it('advances a yearly reminder due today to next year', () => {
    const r = { repeatRule: 'yearly', frequencyDays: 365, nextDueDate: today };
    expect(nextDueAfterDone(r, today)).toBe('2027-10-08');
  });

  it('handles a Feb 29 yearly reminder', () => {
    const r = { repeatRule: 'yearly', frequencyDays: 365, nextDueDate: '2028-02-29' };
    expect(nextDueAfterDone(r, '2028-03-01')).toBe('2029-02-28');
  });

  it('falls back to today for a yearly reminder without a date', () => {
    expect(nextDueAfterDone({ repeatRule: 'yearly' }, today)).toBe('2027-10-08');
  });
});

describe('postponedDueDate', () => {
  it('counts from today when the reminder is overdue', () => {
    expect(postponedDueDate('2026-10-01', 3, '2026-10-08')).toBe('2026-10-11');
  });

  it('counts from the due date when it is in the future', () => {
    expect(postponedDueDate('2026-10-20', 7, '2026-10-08')).toBe('2026-10-27');
  });

  it('counts from today when the due date is today or missing', () => {
    expect(postponedDueDate('2026-10-08', 1, '2026-10-08')).toBe('2026-10-09');
    expect(postponedDueDate(null, 1, '2026-10-08')).toBe('2026-10-09');
  });
});

describe('pickReminderUpdates', () => {
  it('returns the allowed entries', () => {
    expect(pickReminderUpdates({ frequencyDays: 10, nextDueDate: '2026-10-20' })).toEqual([
      ['frequencyDays', 10],
      ['nextDueDate', '2026-10-20'],
    ]);
  });

  it('throws on an unknown key, so it never reaches SQL', () => {
    expect(() => pickReminderUpdates({ 'kind = 1, id': 'x' })).toThrow('Champ de rappel inconnu');
    expect(() => pickReminderUpdates({ plantId: 'x' })).toThrow('Champ de rappel inconnu');
  });

  it('throws on an empty change set', () => {
    expect(() => pickReminderUpdates({})).toThrow('Aucune modification');
  });
});
