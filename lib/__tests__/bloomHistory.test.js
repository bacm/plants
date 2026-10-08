const { bloomSeasons, seasonShift, shiftLabel, SEASON_GAP_DAYS } = require('../bloomHistory');

let n = 0;
const open = (date) => ({ id: `o${++n}`, plantId: 'p', date, kind: 'open' });
const end = (date) => ({ id: `e${++n}`, plantId: 'p', date, kind: 'end' });

describe('bloomSeasons', () => {
  it('groups consecutive daily opens into one season', () => {
    const s = bloomSeasons(
      [open('2026-04-12'), open('2026-04-13'), open('2026-04-20')],
      '2026-04-21'
    );
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ start: '2026-04-12', end: '2026-04-20', closed: false });
  });

  it('keeps a 60 day gap in one season and splits at 61', () => {
    expect(SEASON_GAP_DAYS).toBe(60);
    expect(bloomSeasons([open('2026-04-01'), open('2026-05-31')], '2026-06-01')).toHaveLength(1);
    expect(bloomSeasons([open('2026-04-01'), open('2026-06-01')], '2026-06-02')).toHaveLength(2);
  });

  it('closes a season on end and starts a new one on a later open', () => {
    const s = bloomSeasons(
      [open('2026-04-12'), end('2026-05-01'), open('2026-05-10')],
      '2026-05-11'
    );
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({
      start: '2026-04-12',
      end: '2026-05-01',
      closed: true,
      ongoing: false,
    });
    expect(s[1]).toMatchObject({ start: '2026-05-10', closed: false, ongoing: true });
  });

  it('ignores an orphan end', () => {
    expect(bloomSeasons([end('2026-05-01')], '2026-05-02')).toEqual([]);
    const s = bloomSeasons([open('2026-04-01'), end('2026-09-01')], '2026-09-02');
    expect(s).toHaveLength(1);
    expect(s[0].closed).toBe(false);
  });

  it('orders an open before an end on the same day', () => {
    const s = bloomSeasons([end('2026-04-12'), open('2026-04-12')], '2026-04-13');
    expect(s[0]).toMatchObject({ closed: true, start: '2026-04-12', end: '2026-04-12' });
  });

  it('is ongoing only while recent and unclosed', () => {
    const obs = [open('2026-04-12')];
    expect(bloomSeasons(obs, '2026-04-20')[0].ongoing).toBe(true);
    expect(bloomSeasons(obs, '2026-08-01')[0].ongoing).toBe(false);
  });

  it('tracks the last observation id', () => {
    const a = open('2026-04-12');
    const b = open('2026-04-14');
    expect(bloomSeasons([a, b], '2026-04-15')[0].lastObservationId).toBe(b.id);
    const e = end('2026-05-01');
    expect(bloomSeasons([a, e], '2026-05-02')[0].lastObservationId).toBe(e.id);
  });
});

describe('seasonShift', () => {
  const seasonsOf = (...dates) => bloomSeasons(dates.map(open), '2030-01-01');

  it('finds an earlier start', () => {
    const s = seasonsOf('2025-04-20', '2026-04-08');
    expect(seasonShift(s[1], s)).toEqual({ days: -12, previousStart: '2025-04-20' });
  });

  it('finds a later start', () => {
    const s = seasonsOf('2025-04-20', '2026-04-21');
    expect(seasonShift(s[1], s).days).toBe(1);
  });

  it('finds the same date', () => {
    const s = seasonsOf('2025-04-20', '2026-04-20');
    expect(seasonShift(s[1], s).days).toBe(0);
  });

  it('works across New Year', () => {
    let s = seasonsOf('2024-12-20', '2026-01-05');
    expect(seasonShift(s[1], s).days).toBe(16);
    s = seasonsOf('2025-01-05', '2025-12-28');
    expect(seasonShift(s[1], s).days).toBe(-8);
  });

  it('returns null without a previous season', () => {
    const s = seasonsOf('2026-04-08');
    expect(seasonShift(s[0], s)).toBeNull();
  });

  it('returns null when nothing falls in the previous year', () => {
    const s = seasonsOf('2024-04-08', '2026-04-08');
    expect(seasonShift(s[1], s)).toBeNull();
  });
});

describe('shiftLabel', () => {
  it('words earlier, later and same', () => {
    expect(shiftLabel(-12, 2025)).toBe("12 jours plus tôt qu'en 2025");
    expect(shiftLabel(1, 2025)).toBe("1 jour plus tard qu'en 2025");
    expect(shiftLabel(0, 2025)).toBe("même date qu'en 2025");
  });
});
