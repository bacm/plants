/**
 * lib/webPhotoStore.js underlies lib/db.web.js's photo storage (IndexedDB,
 * ticket 043). jsdom/Jest has no real IndexedDB, so this exercises the store
 * logic through the injectable in-memory adapter instead of adding a
 * fake-indexeddb dependency; `createIndexedDbAdapter` itself (the real
 * IndexedDB wiring) is exercised by the browser via e2e (`npm run e2e:web`).
 */
const {
  createPhotoStore,
  createInMemoryAdapter,
  isIdbRef,
  dataUrlToFileData,
  fileDataToDataUrl,
} = require('../webPhotoStore');

describe('dataUrlToFileData / fileDataToDataUrl (ticket 020 export/import)', () => {
  test('splits a data: URL into { ext, base64 }', () => {
    expect(dataUrlToFileData('data:image/png;base64,aGVsbG8=')).toEqual({
      ext: 'png',
      base64: 'aGVsbG8=',
    });
    expect(dataUrlToFileData('data:image/jpeg;base64,aGVsbG8=').ext).toBe('jpg');
    expect(dataUrlToFileData('data:image/webp;base64,aGVsbG8=').ext).toBe('webp');
  });

  test('defaults to jpg for an unrecognised mime type', () => {
    expect(dataUrlToFileData('data:application/octet-stream;base64,aGVsbG8=').ext).toBe('jpg');
  });

  test('returns null for anything that is not a base64 data URL', () => {
    expect(dataUrlToFileData('idb:abc')).toBeNull();
    expect(dataUrlToFileData('https://example.com/pic.jpg')).toBeNull();
    expect(dataUrlToFileData(null)).toBeNull();
  });

  test('fileDataToDataUrl is the inverse for a known extension', () => {
    expect(fileDataToDataUrl({ ext: 'png', base64: 'aGVsbG8=' })).toBe(
      'data:image/png;base64,aGVsbG8='
    );
  });

  test('round trips through both directions', () => {
    const original = 'data:image/webp;base64,aGVsbG8gd29ybGQ=';
    const fileData = dataUrlToFileData(original);
    expect(fileDataToDataUrl(fileData)).toBe(original);
  });
});

describe('isIdbRef', () => {
  test('true only for an idb: prefixed string', () => {
    expect(isIdbRef('idb:abc')).toBe(true);
    expect(isIdbRef('data:image/png;base64,AAA')).toBe(false);
    expect(isIdbRef('photos/abc.jpg')).toBe(false);
    expect(isIdbRef(null)).toBe(false);
    expect(isIdbRef(undefined)).toBe(false);
  });
});

describe('createPhotoStore', () => {
  test('storePhoto saves the data and returns an idb: ref', async () => {
    const store = createPhotoStore(createInMemoryAdapter());
    const ref = await store.storePhoto('abc', 'data:image/png;base64,AAA');
    expect(ref).toBe('idb:abc');
  });

  test('loadPhoto resolves an idb: ref back to the stored data', async () => {
    const store = createPhotoStore(createInMemoryAdapter());
    const ref = await store.storePhoto('abc', 'data:image/png;base64,AAA');
    await expect(store.loadPhoto(ref)).resolves.toBe('data:image/png;base64,AAA');
  });

  test('loadPhoto passes through anything that is not one of its refs', async () => {
    const store = createPhotoStore(createInMemoryAdapter());
    await expect(store.loadPhoto('https://example.com/pic.jpg')).resolves.toBe(
      'https://example.com/pic.jpg'
    );
    await expect(store.loadPhoto(null)).resolves.toBeNull();
  });

  test('loadPhoto falls back to the ref itself if the data is gone', async () => {
    const store = createPhotoStore(createInMemoryAdapter());
    await expect(store.loadPhoto('idb:missing')).resolves.toBe('idb:missing');
  });

  test('deletePhoto removes stored data for an idb: ref', async () => {
    const adapter = createInMemoryAdapter();
    const store = createPhotoStore(adapter);
    const ref = await store.storePhoto('abc', 'data:image/png;base64,AAA');

    await store.deletePhoto(ref);

    await expect(store.loadPhoto(ref)).resolves.toBe(ref);
  });

  test('deletePhoto is a no-op for a ref it does not own', async () => {
    const store = createPhotoStore(createInMemoryAdapter());
    await expect(store.deletePhoto('https://example.com/pic.jpg')).resolves.toBeUndefined();
  });
});
