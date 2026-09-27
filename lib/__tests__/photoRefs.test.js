const {
  photoFileName,
  isRelativePhotoRef,
  resolvePhotoUri,
  planPhotoMigration,
  extensionOfRelativeRef,
} = require('../photoRefs');

describe('photoFileName', () => {
  test('keeps a known safe extension, lowercased', () => {
    expect(photoFileName('abc', 'file:///cache/pic.JPG')).toBe('abc.jpg');
    expect(photoFileName('abc', 'file:///cache/pic.png')).toBe('abc.png');
    expect(photoFileName('abc', 'file:///cache/pic.heic')).toBe('abc.heic');
    expect(photoFileName('abc', 'file:///cache/pic.webp')).toBe('abc.webp');
  });

  test('strips a query string or hash before reading the extension', () => {
    expect(photoFileName('abc', 'https://x/pic.png?token=1')).toBe('abc.png');
    expect(photoFileName('abc', 'https://x/pic.jpeg#frag')).toBe('abc.jpeg');
  });

  test('defaults to jpg for an unknown or missing extension', () => {
    expect(photoFileName('abc', 'file:///cache/pic.gif')).toBe('abc.jpg');
    expect(photoFileName('abc', 'file:///cache/noextension')).toBe('abc.jpg');
    expect(photoFileName('abc', undefined)).toBe('abc.jpg');
    expect(photoFileName('abc', null)).toBe('abc.jpg');
  });
});

describe('extensionOfRelativeRef', () => {
  test('reads the extension off an owned relative ref', () => {
    expect(extensionOfRelativeRef('photos/abc.png')).toBe('png');
    expect(extensionOfRelativeRef('photos/abc.HEIC')).toBe('heic');
  });

  test('defaults to jpg for an unknown extension or a non-string', () => {
    expect(extensionOfRelativeRef('photos/abc.gif')).toBe('jpg');
    expect(extensionOfRelativeRef('photos/noextension')).toBe('jpg');
    expect(extensionOfRelativeRef(null)).toBe('jpg');
  });
});

describe('isRelativePhotoRef', () => {
  test('true for a photos/ relative path', () => {
    expect(isRelativePhotoRef('photos/abc.jpg')).toBe(true);
  });

  test('false for an absolute uri, a non-string, or null', () => {
    expect(isRelativePhotoRef('file:///documents/photos/abc.jpg')).toBe(false);
    expect(isRelativePhotoRef('data:image/png;base64,AAA')).toBe(false);
    expect(isRelativePhotoRef('idb:abc')).toBe(false);
    expect(isRelativePhotoRef(null)).toBe(false);
    expect(isRelativePhotoRef(undefined)).toBe(false);
  });
});

describe('resolvePhotoUri', () => {
  const documentDir = 'file:///data/user/0/app/files/';

  test('joins a relative ref to the document directory', () => {
    expect(resolvePhotoUri('photos/abc.jpg', documentDir)).toBe(
      'file:///data/user/0/app/files/photos/abc.jpg'
    );
  });

  test('adds the missing slash when the document dir has none', () => {
    expect(resolvePhotoUri('photos/abc.jpg', 'file:///data/files')).toBe(
      'file:///data/files/photos/abc.jpg'
    );
  });

  test('returns file://, data:, http(s) and idb: refs unchanged', () => {
    expect(resolvePhotoUri('file:///cache/pic.jpg', documentDir)).toBe('file:///cache/pic.jpg');
    expect(resolvePhotoUri('data:image/png;base64,AAA', documentDir)).toBe(
      'data:image/png;base64,AAA'
    );
    expect(resolvePhotoUri('https://example.com/pic.jpg', documentDir)).toBe(
      'https://example.com/pic.jpg'
    );
    expect(resolvePhotoUri('idb:abc', documentDir)).toBe('idb:abc');
  });

  test('passes null/undefined through', () => {
    expect(resolvePhotoUri(null, documentDir)).toBeNull();
    expect(resolvePhotoUri(undefined, documentDir)).toBeNull();
  });
});

describe('planPhotoMigration', () => {
  function fileExistsFrom(existingUris) {
    return (uri) => existingUris.has(uri);
  }

  test('sorts rows already owned, to be copied, and missing', () => {
    const rows = [
      { id: '1', uri: 'photos/1.jpg' }, // already owned
      { id: '2', uri: 'file:///cache/2.jpg' }, // exists -> toCopy
      { id: '3', uri: 'file:///cache/3.jpg' }, // gone -> missing
      { id: '4', uri: 'data:image/png;base64,AAA' }, // not managed -> alreadyOwned
      { id: '5', uri: '/absolute/cache/5.jpg' }, // exists -> toCopy
    ];
    const fileExists = fileExistsFrom(new Set(['file:///cache/2.jpg', '/absolute/cache/5.jpg']));

    const { toCopy, missing, alreadyOwned } = planPhotoMigration(rows, fileExists);

    expect(toCopy.map((r) => r.id)).toEqual(['2', '5']);
    expect(missing.map((r) => r.id)).toEqual(['3']);
    expect(alreadyOwned.map((r) => r.id)).toEqual(['1', '4']);
  });

  test('treats a row with no uri as already owned (nothing to do)', () => {
    const { toCopy, missing, alreadyOwned } = planPhotoMigration(
      [{ id: '1', uri: null }],
      () => false
    );
    expect(toCopy).toEqual([]);
    expect(missing).toEqual([]);
    expect(alreadyOwned).toEqual([{ id: '1', uri: null }]);
  });

  test('an empty batch produces empty buckets', () => {
    expect(planPhotoMigration([], () => true)).toEqual({
      toCopy: [],
      missing: [],
      alreadyOwned: [],
    });
  });
});
