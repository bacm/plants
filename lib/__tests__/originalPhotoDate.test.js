// Runs in Pacific/Kiritimati (UTC+14, no DST), set for the whole Jest run by
// jest.global-setup.js -- a bug that used UTC instead of local time (for the
// EXIF string or the `lastModified` fallback) shows up as a wrong calendar
// day rather than passing by accident. This guards that it really applies:
test('runs in UTC+14', () => {
  expect(new Date(Date.UTC(2026, 0, 1, 12)).getTimezoneOffset()).toBe(-14 * 60);
});

const { originalPhotoDate } = require('../originalPhotoDate');

describe('originalPhotoDate', () => {
  it('prefers EXIF DateTimeOriginal over DateTimeDigitized and DateTime', () => {
    const asset = {
      exif: {
        DateTimeOriginal: '2026:03:14 08:15:00',
        DateTimeDigitized: '2026:03:15 08:15:00',
        DateTime: '2026:03:16 08:15:00',
      },
    };
    expect(originalPhotoDate(asset)).toEqual({ date: '2026-03-14', unknown: false });
  });

  it('falls back to DateTimeDigitized when DateTimeOriginal is missing', () => {
    const asset = {
      exif: { DateTimeDigitized: '2025-11-02 09:00:00', DateTime: '2025:11:03 09:00:00' },
    };
    // DateTimeDigitized here is malformed (hyphens, not colons) so it is
    // skipped in favor of the well-formed DateTime.
    expect(originalPhotoDate(asset)).toEqual({ date: '2025-11-03', unknown: false });
  });

  it('falls back to DateTime when only that tag is set', () => {
    const asset = { exif: { DateTime: '2024:01:05 20:00:00' } };
    expect(originalPhotoDate(asset)).toEqual({ date: '2024-01-05', unknown: false });
  });

  it('parses an EXIF date with no time component', () => {
    const asset = { exif: { DateTimeOriginal: '2023:07:04' } };
    expect(originalPhotoDate(asset)).toEqual({ date: '2023-07-04', unknown: false });
  });

  it('rejects an out-of-range month/day and keeps looking', () => {
    const asset = {
      exif: { DateTimeOriginal: '2026:13:40 10:00:00', DateTime: '2026:02:02 10:00:00' },
    };
    expect(originalPhotoDate(asset)).toEqual({ date: '2026-02-02', unknown: false });
  });

  it('falls back to the web File lastModified when EXIF is absent', () => {
    // 2026-01-01T23:00:00Z: in UTC still Jan 1, but in the test's UTC+14
    // timezone it is already 2026-01-02 -- using UTC here would be a bug.
    const ms = Date.UTC(2026, 0, 1, 23, 0, 0);
    const asset = { file: { lastModified: ms } };
    expect(originalPhotoDate(asset)).toEqual({ date: '2026-01-02', unknown: false });
  });

  it('ignores an empty exif object and falls back to lastModified', () => {
    const ms = Date.UTC(2026, 5, 10, 1, 0, 0); // local (UTC+14): 2026-06-10 15:00
    const asset = { exif: {}, file: { lastModified: ms } };
    expect(originalPhotoDate(asset)).toEqual({ date: '2026-06-10', unknown: false });
  });

  it('flags unknown and uses `now` when neither EXIF nor a file is present', () => {
    const now = new Date(Date.UTC(2026, 8, 20, 3, 0, 0));
    expect(originalPhotoDate({}, now)).toEqual({ date: '2026-09-20', unknown: true });
  });

  it('flags unknown for a malformed lastModified value', () => {
    // 12:00 UTC on March 1 is already March 2 in UTC+14.
    const now = new Date(Date.UTC(2026, 2, 1, 12, 0, 0));
    const asset = { file: { lastModified: 'not-a-number' } };
    expect(originalPhotoDate(asset, now)).toEqual({ date: '2026-03-02', unknown: true });
  });

  it('handles an asset with no exif and no file field at all', () => {
    const now = new Date(Date.UTC(2026, 2, 1, 12, 0, 0)); // March 2 in UTC+14
    expect(originalPhotoDate(null, now)).toEqual({ date: '2026-03-02', unknown: true });
  });
});
