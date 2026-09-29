const { isMonthInRange, MONTH_LETTERS } = require('../months');

describe('MONTH_LETTERS', () => {
  it('gives one letter per month, January to December', () => {
    expect(MONTH_LETTERS).toEqual(['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']);
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
