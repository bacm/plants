const { bloomMonthsOf, bloomSegments, bloomCoverage, bloomGaps } = require('../bloomCoverage');

describe('bloomSegments', () => {
  it('draws an in-year range as one band', () => {
    expect(bloomSegments({ bloomStartMonth: 5, bloomEndMonth: 7 })).toEqual([{ start: 5, end: 7 }]);
  });

  it('draws a single month as a one-month band', () => {
    expect(bloomSegments({ bloomStartMonth: 5, bloomEndMonth: 5 })).toEqual([{ start: 5, end: 5 }]);
  });

  it('splits a range that wraps the year into two bands', () => {
    expect(bloomSegments({ bloomStartMonth: 12, bloomEndMonth: 3 })).toEqual([
      { start: 1, end: 3 },
      { start: 12, end: 12 },
    ]);
  });

  it('returns [] without a declared range', () => {
    expect(bloomSegments({ bloomStartMonth: 5, bloomEndMonth: null })).toEqual([]);
    expect(bloomSegments(null)).toEqual([]);
  });
});

describe('bloomMonthsOf', () => {
  it('returns the months of a normal range', () => {
    expect(bloomMonthsOf({ bloomStartMonth: 4, bloomEndMonth: 6 })).toEqual([4, 5, 6]);
  });

  it('wraps a November to February range', () => {
    expect(bloomMonthsOf({ bloomStartMonth: 11, bloomEndMonth: 2 })).toEqual([1, 2, 11, 12]);
  });

  it('returns a single month for a single-month range', () => {
    expect(bloomMonthsOf({ bloomStartMonth: 5, bloomEndMonth: 5 })).toEqual([5]);
  });

  it('returns [] when the plant has no declared range', () => {
    expect(bloomMonthsOf({ bloomStartMonth: null, bloomEndMonth: null })).toEqual([]);
    expect(bloomMonthsOf({})).toEqual([]);
    expect(bloomMonthsOf(null)).toEqual([]);
  });
});

describe('bloomCoverage', () => {
  it('lists plant ids per month, wrap-aware', () => {
    const plants = [
      { id: 1, bloomStartMonth: 4, bloomEndMonth: 6 },
      { id: 2, bloomStartMonth: 11, bloomEndMonth: 2 },
      { id: 3, bloomStartMonth: null, bloomEndMonth: null },
    ];
    const coverage = bloomCoverage(plants);
    expect(coverage).toHaveLength(12);
    expect(coverage[0]).toEqual({ month: 1, plantIds: [2] });
    expect(coverage[3]).toEqual({ month: 4, plantIds: [1] });
    expect(coverage[10]).toEqual({ month: 11, plantIds: [2] });
    expect(coverage[6]).toEqual({ month: 7, plantIds: [] });
  });

  it('returns 12 empty entries for an empty garden', () => {
    const coverage = bloomCoverage([]);
    expect(coverage).toHaveLength(12);
    expect(coverage.every((c) => c.plantIds.length === 0)).toBe(true);
  });
});

describe('bloomGaps', () => {
  it('reports months with no bloom when at least one plant has a range', () => {
    const plants = [{ id: 1, bloomStartMonth: 4, bloomEndMonth: 6 }];
    expect(bloomGaps(plants)).toEqual([1, 2, 3, 7, 8, 9, 10, 11, 12]);
  });

  it('returns [] for an empty garden', () => {
    expect(bloomGaps([])).toEqual([]);
  });

  it('returns [] when no plant has a declared range', () => {
    const plants = [{ id: 1, bloomStartMonth: null, bloomEndMonth: null }, { id: 2 }];
    expect(bloomGaps(plants)).toEqual([]);
  });
});
