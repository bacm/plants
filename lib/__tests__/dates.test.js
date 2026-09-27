const { addDaysISO, addYearsISO } = require('../dates');

describe('addDaysISO', () => {
  it('adds days within the same month', () => {
    expect(addDaysISO('2026-03-10', 7)).toBe('2026-03-17');
  });

  it('rolls over into the next month', () => {
    expect(addDaysISO('2026-01-28', 7)).toBe('2026-02-04');
  });

  it('rolls over into the next year', () => {
    expect(addDaysISO('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('handles a leap day', () => {
    expect(addDaysISO('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('returns null for malformed input', () => {
    expect(addDaysISO('', 1)).toBeNull();
    expect(addDaysISO('abc', 1)).toBeNull();
    expect(addDaysISO(null, 1)).toBeNull();
  });

  it('returns null for non-integer days', () => {
    expect(addDaysISO('2026-03-10', NaN)).toBeNull();
    expect(addDaysISO('2026-03-10', 1.5)).toBeNull();
  });
});

describe('addYearsISO', () => {
  it('adds a year to a normal date', () => {
    expect(addYearsISO('2026-03-10', 1)).toBe('2027-03-10');
  });

  it('adds several years', () => {
    expect(addYearsISO('2026-03-10', 3)).toBe('2029-03-10');
  });

  it('maps Feb 29 in a leap year to Feb 28 a year later', () => {
    expect(addYearsISO('2028-02-29', 1)).toBe('2029-02-28');
  });

  it('maps Feb 29 forward to the next leap year unchanged', () => {
    expect(addYearsISO('2028-02-29', 4)).toBe('2032-02-29');
  });

  it('returns null for malformed input', () => {
    expect(addYearsISO('', 1)).toBeNull();
    expect(addYearsISO('abc', 1)).toBeNull();
    expect(addYearsISO(null, 1)).toBeNull();
  });

  it('returns null for a source date that is not a real calendar date', () => {
    expect(addYearsISO('2026-02-30', 1)).toBeNull();
  });

  it('returns null for non-integer years', () => {
    expect(addYearsISO('2026-03-10', NaN)).toBeNull();
    expect(addYearsISO('2026-03-10', 1.5)).toBeNull();
  });
});
