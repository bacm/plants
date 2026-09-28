const { resolveAssignDate } = require('../sortAssignDate');

describe('resolveAssignDate', () => {
  it('uses the photo takenAt date as-is for a known-date photo', () => {
    const photo = { takenAt: '2026-03-14', dateUnknown: false };
    expect(resolveAssignDate(photo, 'irrelevant')).toEqual({ date: '2026-03-14', error: null });
  });

  it('truncates a full ISO timestamp (a camera shot) to its date part', () => {
    const photo = { takenAt: '2026-03-14T10:15:00.000Z', dateUnknown: false };
    expect(resolveAssignDate(photo, '')).toEqual({ date: '2026-03-14', error: null });
  });

  it('uses the edited date for an unknown-date photo when it is valid', () => {
    const photo = { takenAt: '2026-09-28', dateUnknown: true };
    expect(resolveAssignDate(photo, '2018-03-30')).toEqual({ date: '2018-03-30', error: null });
  });

  it('never falls back to takenAt for an unknown-date photo, even a valid-looking one', () => {
    // takenAt here is only the import-time guess (see lib/originalPhotoDate.js);
    // a blank edited date must fail rather than silently use it.
    const photo = { takenAt: '2026-09-28', dateUnknown: true };
    const result = resolveAssignDate(photo, '');
    expect(result.date).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('rejects a malformed edited date for an unknown-date photo', () => {
    const photo = { takenAt: '2026-09-28', dateUnknown: true };
    const result = resolveAssignDate(photo, '30/03/2018');
    expect(result.date).toBeNull();
    expect(result.error).toBe('Date au format AAAA-MM-JJ');
  });

  it('rejects a calendar-impossible edited date for an unknown-date photo', () => {
    const photo = { takenAt: '2026-09-28', dateUnknown: true };
    const result = resolveAssignDate(photo, '2026-02-30');
    expect(result.date).toBeNull();
    expect(result.error).toBe('Date au format AAAA-MM-JJ');
  });

  it('rejects whitespace-only as a missing edited date', () => {
    const photo = { takenAt: '2026-09-28', dateUnknown: true };
    const result = resolveAssignDate(photo, '   ');
    expect(result.date).toBeNull();
    expect(result.error).toBeTruthy();
  });
});
