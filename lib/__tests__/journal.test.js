const {
  normalizeJournalEntry,
  measurementText,
  journalEntryText,
  formatShortDate,
  careEntries,
  measurementsOf,
  latestMeasurement,
  growthCurve,
  polylinePoints,
} = require('../journal');
const { isCareType, isObservationType, journalLabelFor, OBSERVATION_CHOICES } = require('../enums');

describe('care vs observation', () => {
  it('tells care types from observations', () => {
    expect(isCareType('watered')).toBe(true);
    expect(isCareType('measured')).toBe(false);
    expect(isCareType('bloom')).toBe(false);
    expect(isObservationType('note')).toBe(true);
    expect(isObservationType('watered')).toBe(false);
  });

  it('labels both kinds for the timeline', () => {
    expect(journalLabelFor('watered')).toBe('Arrosé');
    expect(journalLabelFor('measured')).toBe('Mesuré');
    expect(journalLabelFor('note')).toBe('Note');
    expect(journalLabelFor('bloom')).toBe('En fleur');
    expect(journalLabelFor('nope')).toBe('');
  });

  it('the entry screen buttons read Mesure / Note / En fleur', () => {
    expect(OBSERVATION_CHOICES.map((o) => o.label)).toEqual(['Mesure', 'Note', 'En fleur']);
    expect(OBSERVATION_CHOICES.map((o) => o.value)).toEqual(['measured', 'note', 'bloom']);
  });

  it('careEntries drops observations', () => {
    const logs = [{ type: 'watered' }, { type: 'measured' }, { type: 'bloom' }, { type: 'pruned' }];
    expect(careEntries(logs).map((l) => l.type)).toEqual(['watered', 'pruned']);
  });
});

describe('normalizeJournalEntry', () => {
  it('accepts a measurement with both sizes, as strings or numbers', () => {
    expect(normalizeJournalEntry({ type: 'measured', widthCm: '120', heightCm: 90 })).toEqual({
      type: 'measured',
      notes: null,
      widthCm: 120,
      heightCm: 90,
    });
  });

  it('accepts one size only', () => {
    expect(normalizeJournalEntry({ type: 'measured', widthCm: '', heightCm: '80' })).toMatchObject({
      widthCm: null,
      heightCm: 80,
    });
  });

  it('refuses a measurement with no size', () => {
    expect(() => normalizeJournalEntry({ type: 'measured', widthCm: '', heightCm: null })).toThrow(
      /au moins/
    );
  });

  it.each(['0', '-3', '1.5', 'abc', '10001', 0])('refuses a width of %p', (bad) => {
    expect(() => normalizeJournalEntry({ type: 'measured', widthCm: bad, heightCm: '50' })).toThrow(
      /entier/
    );
  });

  it('requires text for a note', () => {
    expect(() => normalizeJournalEntry({ type: 'note', notes: '  ' })).toThrow(/note/);
    expect(normalizeJournalEntry({ type: 'note', notes: ' Rejets au pied ' }).notes).toBe(
      'Rejets au pied'
    );
  });

  it('ignores sizes for other types', () => {
    expect(
      normalizeJournalEntry({ type: 'watered', notes: 'x', widthCm: 100, heightCm: 5 })
    ).toEqual({ type: 'watered', notes: 'x', widthCm: null, heightCm: null });
    expect(normalizeJournalEntry({ type: 'bloom', widthCm: 100 }).widthCm).toBeNull();
  });
});

describe('timeline text', () => {
  it('formats the measurement', () => {
    expect(measurementText({ widthCm: 120, heightCm: 90 })).toBe('120 × 90 cm');
    expect(measurementText({ widthCm: 120, heightCm: null })).toBe('Largeur 120 cm');
    expect(measurementText({ widthCm: null, heightCm: 90 })).toBe('Hauteur 90 cm');
  });

  it('formats a short date', () => {
    expect(formatShortDate('2026-09-12')).toBe('12 sept.');
    expect(formatShortDate('nope')).toBe('nope');
  });

  it('builds the entry title and meta', () => {
    expect(
      journalEntryText({ type: 'measured', date: '2026-09-12', widthCm: 120, heightCm: 90 })
    ).toEqual({ title: 'Mesuré', meta: '12 sept. · 120 × 90 cm' });
    expect(journalEntryText({ type: 'bloom', date: '2026-09-12' })).toEqual({
      title: 'En fleur',
      meta: '12 sept.',
    });
    expect(journalEntryText({ type: 'watered', date: '2026-09-26', notes: 'au pied' })).toEqual({
      title: 'Arrosé',
      meta: '26 sept. · au pied',
    });
  });
});

describe('measurements and the growth curve', () => {
  const logs = [
    { type: 'measured', date: '2026-09-12', widthCm: 120, heightCm: 90 },
    { type: 'watered', date: '2026-09-20' },
    { type: 'measured', date: '2026-03-01', widthCm: 60, heightCm: 50 },
    { type: 'measured', date: '2026-06-01', widthCm: 90, heightCm: null },
  ];

  it('orders measurements oldest first and finds the latest', () => {
    expect(measurementsOf(logs).map((m) => m.date)).toEqual([
      '2026-03-01',
      '2026-06-01',
      '2026-09-12',
    ]);
    expect(latestMeasurement(logs).widthCm).toBe(120);
    expect(latestMeasurement([{ type: 'watered', date: '2026-01-01' }])).toBeNull();
  });

  it('has no curve under two measurements', () => {
    expect(growthCurve(measurementsOf(logs.slice(0, 1)))).toEqual({ width: [], height: [] });
  });

  it('spreads points over the dates, bigger values higher', () => {
    const curve = growthCurve(measurementsOf(logs), { width: 150, height: 56, pad: 4, top: 14 });
    expect(curve.width).toHaveLength(3);
    expect(curve.height).toHaveLength(2);
    expect(curve.width[0].x).toBe(4);
    expect(curve.width[2].x).toBe(146);
    expect(curve.width[2].y).toBeLessThan(curve.width[0].y);
    expect(curve.width[2].y).toBe(14);
    expect(curve.width[1].x).toBeGreaterThan(40);
  });

  it('spaces points evenly when every date is the same', () => {
    const curve = growthCurve([
      { date: '2026-01-01', widthCm: 10, heightCm: null },
      { date: '2026-01-01', widthCm: 20, heightCm: null },
    ]);
    expect(curve.width.map((p) => p.x)).toEqual([4, 146]);
  });

  it('serialises points', () => {
    expect(
      polylinePoints([
        { x: 4, y: 44.04 },
        { x: 50, y: 36 },
      ])
    ).toBe('4.0,44.0 50.0,36.0');
  });
});
