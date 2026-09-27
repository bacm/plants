const { addDaysISO } = require('../dates');

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
