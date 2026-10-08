const {
  isMonthInRange,
  MONTH_LETTERS,
  DAY_NAMES,
  longDateLabel,
  isoDateLabel,
  shortDateLabel,
} = require('../months');

describe('MONTH_LETTERS', () => {
  it('gives one letter per month, January to December', () => {
    expect(MONTH_LETTERS).toEqual(['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']);
  });
});

describe('DAY_NAMES', () => {
  it('gives one name per day, dimanche to samedi', () => {
    expect(DAY_NAMES).toEqual([
      'Dimanche',
      'Lundi',
      'Mardi',
      'Mercredi',
      'Jeudi',
      'Vendredi',
      'Samedi',
    ]);
  });
});

describe('longDateLabel', () => {
  it('capitalises the day name and lower-cases the month', () => {
    // 2026-09-29 is a Tuesday.
    expect(longDateLabel(new Date(2026, 8, 29))).toBe('Mardi 29 septembre');
  });

  it('uses the date’s own day-of-month, not padded', () => {
    expect(longDateLabel(new Date(2026, 0, 1))).toBe('Jeudi 1 janvier');
  });
});

describe('isoDateLabel', () => {
  it('formats an ISO date in French', () => {
    expect(isoDateLabel('2026-09-29')).toBe('29 septembre 2026');
    expect(isoDateLabel('2026-01-05T10:00:00.000Z')).toBe('5 janvier 2026');
  });

  it('returns anything else unchanged', () => {
    expect(isoDateLabel('demain')).toBe('demain');
    expect(isoDateLabel('2026-13-01')).toBe('2026-13-01');
  });
});

describe('isMonthInRange', () => {
  it('handles a normal range (April to June)', () => {
    expect(isMonthInRange(3, 4, 6)).toBe(false);
    expect(isMonthInRange(4, 4, 6)).toBe(true);
    expect(isMonthInRange(6, 4, 6)).toBe(true);
    expect(isMonthInRange(7, 4, 6)).toBe(false);
  });

  it('handles a wrapping range (November to February)', () => {
    expect(isMonthInRange(11, 11, 2)).toBe(true);
    expect(isMonthInRange(12, 11, 2)).toBe(true);
    expect(isMonthInRange(1, 11, 2)).toBe(true);
    expect(isMonthInRange(2, 11, 2)).toBe(true);
    expect(isMonthInRange(3, 11, 2)).toBe(false);
    expect(isMonthInRange(10, 11, 2)).toBe(false);
  });

  it('handles a single-month range', () => {
    expect(isMonthInRange(5, 5, 5)).toBe(true);
    expect(isMonthInRange(4, 5, 5)).toBe(false);
    expect(isMonthInRange(6, 5, 5)).toBe(false);
  });

  it('returns false when start or end is null or undefined', () => {
    expect(isMonthInRange(5, null, 6)).toBe(false);
    expect(isMonthInRange(5, 4, null)).toBe(false);
    expect(isMonthInRange(5, undefined, 6)).toBe(false);
    expect(isMonthInRange(5, 4, undefined)).toBe(false);
  });

  it('returns false for invalid month values', () => {
    expect(isMonthInRange(0, 4, 6)).toBe(false);
    expect(isMonthInRange(13, 4, 6)).toBe(false);
    expect(isMonthInRange(1.5, 4, 6)).toBe(false);
    expect(isMonthInRange(5, 0, 6)).toBe(false);
    expect(isMonthInRange(5, 4, 13)).toBe(false);
  });
});

describe('shortDateLabel', () => {
  it('formats a day and abbreviated month', () => {
    expect(shortDateLabel('2026-04-12')).toBe('12 avr.');
    expect(shortDateLabel('2026-05-03')).toBe('3 mai');
  });

  it('returns non-dates unchanged', () => {
    expect(shortDateLabel('nope')).toBe('nope');
    expect(shortDateLabel(null)).toBe('');
  });
});
