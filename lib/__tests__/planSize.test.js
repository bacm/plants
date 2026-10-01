const { effectivePlanSize, planSizeOf, planSizeSourceText } = require('../planSize');
const { formatShortDate } = require('../journal');

describe('effectivePlanSize', () => {
  it('prefers the size set by hand', () => {
    expect(
      effectivePlanSize({ planSizeCm: 150, measuredWidthCm: 120, measuredAt: '2026-09-12' })
    ).toEqual({ cm: 150, source: 'manual', measuredAt: null });
  });

  it('uses the latest measured width otherwise', () => {
    expect(
      effectivePlanSize({ planSizeCm: null, measuredWidthCm: 120, measuredAt: '2026-09-12' })
    ).toEqual({
      cm: 120,
      source: 'measured',
      measuredAt: '2026-09-12',
    });
  });

  it('falls back to the default dot', () => {
    expect(effectivePlanSize({})).toEqual({ cm: 50, source: 'default', measuredAt: null });
    expect(planSizeOf({})).toBeNull();
    expect(planSizeOf({ measuredWidthCm: 120 })).toBe(120);
    expect(planSizeOf({ planSizeCm: 80, measuredWidthCm: 120 })).toBe(80);
  });
});

describe('planSizeSourceText', () => {
  it('says where the size comes from', () => {
    expect(
      planSizeSourceText({ source: 'measured', measuredAt: '2026-09-12' }, formatShortDate)
    ).toBe('mesurée le 12 sept.');
    expect(planSizeSourceText({ source: 'manual' }, formatShortDate)).toBe('réglée sur le plan');
    expect(planSizeSourceText({ source: 'default' }, formatShortDate)).toBeNull();
  });
});
