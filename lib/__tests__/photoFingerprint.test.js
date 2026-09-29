import { photoFingerprint, dataUrlByteLength, sameByteSize } from '../photoFingerprint';

describe('photoFingerprint', () => {
  it('uses the EXIF date-time to the second, the size and the pixel size', () => {
    const asset = {
      exif: { DateTimeOriginal: '2026:05:04 10:11:12' },
      fileSize: 12345,
      width: 4000,
      height: 3000,
    };
    expect(photoFingerprint(asset)).toBe('2026:05:04 10:11:12|12345|4000x3000');
  });

  it('normalises a T separator and trailing sub-second data', () => {
    const asset = {
      exif: { DateTimeOriginal: '2026:05:04T10:11:12.345' },
      fileSize: 10,
      width: 1,
      height: 2,
    };
    expect(photoFingerprint(asset)).toBe('2026:05:04 10:11:12|10|1x2');
  });

  it('falls back between EXIF tags', () => {
    const base = { fileSize: 9, width: 1, height: 1 };
    expect(photoFingerprint({ ...base, exif: { DateTimeDigitized: '2026:01:02 03:04:05' } })).toBe(
      '2026:01:02 03:04:05|9|1x1'
    );
    expect(
      photoFingerprint({
        ...base,
        exif: { DateTimeOriginal: 'garbage', DateTime: '2026:01:02 03:04:06' },
      })
    ).toBe('2026:01:02 03:04:06|9|1x1');
  });

  it('uses the web File lastModified and size', () => {
    const asset = { file: { lastModified: 1700000000000, size: 500 }, width: 10, height: 20 };
    expect(photoFingerprint(asset)).toBe('lm:1700000000000|500|10x20');
  });

  it('prefers EXIF over lastModified', () => {
    const asset = {
      exif: { DateTime: '2026:01:02 03:04:05' },
      file: { lastModified: 1, size: 5 },
      width: 1,
      height: 1,
    };
    expect(photoFingerprint(asset)).toBe('2026:01:02 03:04:05|5|1x1');
  });

  it('is null without a positive size', () => {
    const exif = { DateTimeOriginal: '2026:05:04 10:11:12' };
    expect(photoFingerprint({ exif, width: 1, height: 1 })).toBeNull();
    expect(photoFingerprint({ exif, fileSize: 0, width: 1, height: 1 })).toBeNull();
  });

  it('is null without a date', () => {
    expect(photoFingerprint({ fileSize: 5, width: 1, height: 1 })).toBeNull();
    expect(photoFingerprint({ exif: {}, fileSize: 5, width: 1, height: 1 })).toBeNull();
    expect(photoFingerprint(null)).toBeNull();
  });
});

describe('dataUrlByteLength', () => {
  it('decodes the base64 length', () => {
    expect(dataUrlByteLength('data:image/png;base64,QUJD')).toBe(3);
    expect(dataUrlByteLength('data:image/png;base64,QUI=')).toBe(2);
    expect(dataUrlByteLength('data:image/png;base64,QQ==')).toBe(1);
  });

  it('is 0 for anything else', () => {
    expect(dataUrlByteLength('file:///a.jpg')).toBe(0);
    expect(dataUrlByteLength('data:image/png;base64,')).toBe(0);
    expect(dataUrlByteLength(null)).toBe(0);
  });
});

describe('sameByteSize', () => {
  it('needs two equal positive sizes', () => {
    expect(sameByteSize(5, 5)).toBe(true);
    expect(sameByteSize(5, 6)).toBe(false);
    expect(sameByteSize(0, 0)).toBe(false);
    expect(sameByteSize(undefined, undefined)).toBe(false);
  });
});
