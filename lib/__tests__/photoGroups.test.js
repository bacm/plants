const { groupPhotosByMonth } = require('../photoGroups');

function photo(id, date) {
  return { id, date, uri: `file:///${id}.jpg` };
}

describe('groupPhotosByMonth', () => {
  it('groups photos into one entry per calendar month', () => {
    const photos = [photo('a', '2026-09-26'), photo('b', '2026-09-03'), photo('c', '2026-07-14')];
    const groups = groupPhotosByMonth(photos);
    expect(groups).toHaveLength(2);
    expect(groups[0].photos.map((p) => p.id)).toEqual(['a', 'b']);
    expect(groups[1].photos.map((p) => p.id)).toEqual(['c']);
  });

  it('orders groups newest month first', () => {
    const photos = [photo('a', '2026-01-05'), photo('b', '2026-09-01'), photo('c', '2025-12-20')];
    const groups = groupPhotosByMonth(photos);
    expect(groups.map((g) => g.key)).toEqual(['2026-09', '2026-01', '2025-12']);
  });

  it('handles a year boundary as two distinct groups', () => {
    const photos = [photo('a', '2025-12-31'), photo('b', '2026-01-01')];
    const groups = groupPhotosByMonth(photos);
    expect(groups.map((g) => g.key)).toEqual(['2026-01', '2025-12']);
    expect(groups[0].title).toBe('Janvier 2026');
    expect(groups[1].title).toBe('Décembre 2025');
  });

  it('builds a French month + year title', () => {
    const groups = groupPhotosByMonth([photo('a', '2026-09-26')]);
    expect(groups[0].title).toBe('Septembre 2026');
  });

  it('drops photos with a missing or malformed date', () => {
    const photos = [photo('a', '2026-09-26'), { id: 'b', date: null }, { id: 'c' }];
    const groups = groupPhotosByMonth(photos);
    expect(groups).toHaveLength(1);
    expect(groups[0].photos.map((p) => p.id)).toEqual(['a']);
  });

  it('returns an empty array for no photos', () => {
    expect(groupPhotosByMonth([])).toEqual([]);
    expect(groupPhotosByMonth(undefined)).toEqual([]);
  });
});
