const { nextRange, cellState, rangeSummary } = require('../monthRange');

describe('nextRange', () => {
  it('starts a range on the first tap', () => {
    expect(nextRange({ start: null, end: null }, 5)).toEqual({ start: 5, end: null });
  });

  it('closes the range forward on the second tap', () => {
    expect(nextRange({ start: 5, end: null }, 9)).toEqual({ start: 5, end: 9 });
  });

  it('wraps the range when the second tap is earlier than the start', () => {
    expect(nextRange({ start: 11, end: null }, 2)).toEqual({ start: 11, end: 2 });
  });

  it('gives a single-month range when the start month is tapped again', () => {
    expect(nextRange({ start: 5, end: null }, 5)).toEqual({ start: 5, end: 5 });
  });

  it('restarts the range on a third tap once both ends are set', () => {
    expect(nextRange({ start: 5, end: 9 }, 3)).toEqual({ start: 3, end: null });
  });
});

describe('cellState', () => {
  it('reads a normal range (May to September)', () => {
    const range = { start: 5, end: 9 };
    expect(cellState(5, range)).toBe('start');
    expect(cellState(7, range)).toBe('inside');
    expect(cellState(9, range)).toBe('end');
    expect(cellState(10, range)).toBe('none');
  });

  it('reads a wrapping range (November to February)', () => {
    const range = { start: 11, end: 2 };
    expect(cellState(12, range)).toBe('inside');
    expect(cellState(1, range)).toBe('inside');
    expect(cellState(3, range)).toBe('none');
    expect(cellState(10, range)).toBe('none');
    expect(cellState(11, range)).toBe('start');
    expect(cellState(2, range)).toBe('end');
  });

  it('reads a single-month range', () => {
    const range = { start: 5, end: 5 };
    expect(cellState(5, range)).toBe('single');
    expect(cellState(4, range)).toBe('none');
    expect(cellState(6, range)).toBe('none');
  });

  it('reads a start-only range', () => {
    const range = { start: 5, end: null };
    expect(cellState(5, range)).toBe('start');
    expect(cellState(6, range)).toBe('none');
  });

  it('reads an empty range', () => {
    expect(cellState(5, { start: null, end: null })).toBe('none');
  });
});

describe('rangeSummary', () => {
  it('summarises a normal range', () => {
    expect(rangeSummary({ start: 5, end: 9 })).toBe('Mai → Septembre');
  });

  it('summarises a single month', () => {
    expect(rangeSummary({ start: 5, end: 5 })).toBe('Mai');
  });

  it('summarises an empty range', () => {
    expect(rangeSummary({ start: null, end: null })).toBe('Aucune période');
  });
});
