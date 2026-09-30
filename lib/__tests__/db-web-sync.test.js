/**
 * Ticket 095: the web store as a cache synced through lib/sync.js. A fake
 * localStorage, a fake IndexedDB and a fake server (an in-memory api object).
 */
function makeLocalStorage() {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
}

function makeFakeIndexedDB() {
  const stores = new Map();
  const later = (fn) => Promise.resolve().then(fn);
  return {
    open(name) {
      const request = { onsuccess: null, onupgradeneeded: null, onerror: null, result: null };
      if (!stores.has(name)) stores.set(name, new Map());
      const storeMap = stores.get(name);
      request.result = {
        objectStoreNames: { contains: (n) => storeMap.has(n) },
        createObjectStore: (n) => storeMap.set(n, new Map()),
        transaction: (storeName) => {
          const data = storeMap.get(storeName);
          const tx = { oncomplete: null, onerror: null, onabort: null };
          const op = (fn) => {
            const req = { onsuccess: null, onerror: null, result: undefined };
            fn(req);
            later(() => req.onsuccess && req.onsuccess());
            return req;
          };
          tx.objectStore = () => ({
            get: (key) => op((req) => (req.result = data.get(key))),
            put: (value, key) => op(() => data.set(key, value)),
            delete: (key) => op(() => data.delete(key)),
            clear: () => op(() => data.clear()),
          });
          later(() => tx.oncomplete && tx.oncomplete());
          return tx;
        },
      };
      later(() => {
        if (!storeMap.has('photos')) request.onupgradeneeded && request.onupgradeneeded();
        request.onsuccess && request.onsuccess();
      });
      return request;
    },
  };
}

const JPEG = 'data:image/jpeg;base64,UEhPVE8='; // "PHOTO"

// A server reduced to what the engine needs: rows with a revision, photo bytes.
function makeFakeServer() {
  const rows = []; // { rev, table, row }
  const photos = new Map();
  let rev = 0;
  const server = {
    photos,
    rows,
    seed(table, row) {
      rows.push({ rev: ++rev, table, row });
    },
    api: {
      push: async (changes) => {
        for (const [table, list] of Object.entries(changes)) {
          for (const row of list) {
            const at = rows.findIndex((r) => r.table === table && r.row.id === row.id);
            if (at >= 0 && rows[at].row.updatedAt >= row.updatedAt) continue;
            if (at >= 0) rows.splice(at, 1);
            rows.push({ rev: ++rev, table, row });
          }
        }
        return { status: 200, data: {} };
      },
      pull: async (since) => {
        const changes = {};
        for (const r of rows.filter((x) => x.rev > since)) (changes[r.table] ??= []).push(r.row);
        return { status: 200, data: { changes, revision: rev, more: false } };
      },
      putPhoto: async (id, bytes, mime) => {
        photos.set(id, { bytes, mime });
        return { status: 201, data: null };
      },
      downloadTarget: () => ({ url: '', headers: {} }),
    },
  };
  return server;
}

describe('lib/db.web.js as a synced cache (ticket 095)', () => {
  let db;
  let sync;

  beforeEach(() => {
    jest.resetModules();
    global.localStorage = makeLocalStorage();
    global.indexedDB = makeFakeIndexedDB();
    process.env.EXPO_PUBLIC_PLANT_API_URL = 'https://api.test';
    db = require('../db.web.js');
    sync = require('../sync');
    db.initDb();
  });

  const store = () => ({
    getSetting: db.getSetting,
    setSetting: db.setSetting,
    getRowsChangedSince: db.getRowsChangedSince,
    applyRemoteRows: db.applyRemoteRows,
    listPhotosToUpload: db.listPhotosToUpload,
    listPhotosToDownload: db.listPhotosToDownload,
    readPhotoBytes: db.readPhotoBytes,
    markPhotoUploaded: db.markPhotoUploaded,
    downloadPhoto: db.downloadPhoto,
    getLocalSyncCounts: db.getLocalSyncCounts,
  });

  const remotePlant = (over = {}) => ({
    id: 'p-remote',
    name: 'Rose du serveur',
    type: 'shrub',
    sun: 'full_sun',
    water: 'medium',
    updatedAt: '2026-05-01T10:00:00.000Z',
    deletedAt: null,
    ...over,
  });

  test('getRowsChangedSince returns deleted rows and keeps rows stamped exactly at the watermark', async () => {
    const zoneId = db.createZone({ name: 'Bed' });
    const plantId = db.createPlant({ name: 'Rose', type: 'shrub', sun: 'full_sun', water: 'low' });
    await db.deletePlant(plantId);
    const all = await db.getRowsChangedSince(null);
    const plant = all.find((e) => e.table === 'plants').row;
    expect(plant.deletedAt).not.toBeNull();
    expect(all.some((e) => e.table === 'zones' && e.row.id === zoneId)).toBe(true);

    expect(await db.getRowsChangedSince(plant.updatedAt)).toContainEqual(
      expect.objectContaining({ table: 'plants' })
    );
    expect(await db.getRowsChangedSince('9999-01-01T00:00:00.000Z')).toEqual([]);
  });

  test('applyRemoteRows is last-write-wins, keeps the remote updatedAt and never notifies', async () => {
    const listener = jest.fn();
    db.onLocalChange(listener);
    const id = db.createPlant({ name: 'Local', type: 'shrub', sun: 'full_sun', water: 'low' });
    listener.mockClear();
    const local = (await db.getRowsChangedSince(null)).find((e) => e.table === 'plants').row;

    const older = remotePlant({ id, name: 'Older', updatedAt: '2000-01-01T00:00:00.000Z' });
    expect(await db.applyRemoteRows({ plants: [older] })).toEqual({ applied: 0 });
    expect((await db.getPlantById(id)).name).toBe('Local');

    const newer = remotePlant({ id, name: 'Newer', updatedAt: '2999-01-01T00:00:00.000Z' });
    expect(await db.applyRemoteRows({ plants: [newer] })).toEqual({ applied: 1 });
    expect((await db.getPlantById(id)).name).toBe('Newer');
    const after = (await db.getRowsChangedSince(null)).find((e) => e.table === 'plants').row;
    expect(after.updatedAt).toBe('2999-01-01T00:00:00.000Z');
    expect(after.updatedAt).not.toBe(local.updatedAt);
    expect(listener).not.toHaveBeenCalled();
  });

  test('applyRemoteRows drops unknown keys and uri, and applies a remote delete', async () => {
    await db.applyRemoteRows({
      plants: [remotePlant({ evil: 'x', uri: 'javascript:1', 'name; DROP': 'y' })],
    });
    const row = (await db.getRowsChangedSince(null)).find((e) => e.table === 'plants').row;
    expect(row.evil).toBeUndefined();
    expect(row['name; DROP']).toBeUndefined();

    await db.applyRemoteRows({
      plants: [remotePlant({ updatedAt: '2026-06-01T00:00:00.000Z', deletedAt: '2026-06-01' })],
    });
    expect(await db.getPlantById('p-remote')).toBeNull();
  });

  test('a pulled photo gets a remote: ref, is not downloaded nor uploaded; deleting drops local bytes', async () => {
    await db.applyRemoteRows({
      plants: [remotePlant()],
      photos: [
        {
          id: 'ph-1',
          plantId: 'p-remote',
          date: '2026-05-01',
          updatedAt: '2026-05-01T10:00:00.000Z',
          deletedAt: null,
        },
      ],
    });
    const [photo] = await db.getPhotosByPlantId('p-remote');
    expect(photo.uri).toBe('remote:ph-1');
    expect(await db.listPhotosToDownload()).toEqual([]);
    expect(await db.listPhotosToUpload()).toEqual([]);
    expect((await db.getLocalSyncCounts()).photoFiles).toBe(0);

    // A photo added on the web is pending upload until marked.
    const mine = await db.addPhoto({ plantId: 'p-remote', uri: JPEG, date: '2026-05-02' });
    expect(await db.listPhotosToUpload()).toEqual([{ table: 'photos', id: mine }]);
    const file = await db.readPhotoBytes('photos', mine);
    expect(file.mime).toBe('image/jpeg');
    expect(String.fromCharCode(...file.bytes)).toBe('PHOTO');
    await db.markPhotoUploaded(mine);
    expect(await db.listPhotosToUpload()).toEqual([]);

    await db.applyRemoteRows({
      photos: [
        {
          id: mine,
          plantId: 'p-remote',
          date: '2026-05-02',
          updatedAt: '2999-01-01T00:00:00.000Z',
          deletedAt: '2999-01-01',
        },
      ],
    });
    expect(await db.readPhotoBytes('photos', mine)).toBeNull();
  });

  test('photo state is not part of a backup', async () => {
    const plantId = db.createPlant({ name: 'Rose', type: 'shrub', sun: 'full_sun', water: 'low' });
    const id = await db.addPhoto({ plantId, uri: JPEG, date: '2026-05-02' });
    await db.markPhotoUploaded(id);
    const { blob } = await db.exportGardenToFile();
    expect(await blob.text()).not.toContain('garden_photo_state');
    expect(await blob.text()).not.toContain('uploaded');
  });

  test('runSync round trip: pulls the server garden, pushes a web edit and its photo', async () => {
    const server = makeFakeServer();
    server.seed('plants', remotePlant());

    let result = await sync.runSync({ store: store(), api: server.api });
    expect(result.error).toBeUndefined();
    expect(result.pulled).toBe(1);
    expect((await db.getPlants()).map((p) => p.name)).toEqual(['Rose du serveur']);

    const id = db.createPlant({ name: 'Web', type: 'shrub', sun: 'full_sun', water: 'low' });
    const photoId = await db.addPhoto({ plantId: id, uri: JPEG, date: '2026-05-02' });
    result = await sync.runSync({ store: store(), api: server.api });
    expect(result.error).toBeUndefined();
    expect(server.rows.some((r) => r.table === 'plants' && r.row.id === id)).toBe(true);
    expect(server.photos.get(photoId).mime).toBe('image/jpeg');
    expect(await db.listPhotosToUpload()).toEqual([]);

    // Nothing is sent twice: the echo of our own rows is skipped on pull.
    server.seed('plants', remotePlant({ name: 'Renommée', updatedAt: '2999-01-01T00:00:00.000Z' }));
    result = await sync.runSync({ store: store(), api: server.api });
    expect(result.pulled).toBeGreaterThanOrEqual(1);
    expect((await db.getPlantById('p-remote')).name).toBe('Renommée');
  });

  test('a local write notifies listeners, an unsubscribed listener stays quiet', () => {
    const listener = jest.fn();
    const off = db.onLocalChange(listener);
    db.createZone({ name: 'A' });
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    db.createZone({ name: 'B' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('claimCache empties the cache when the account changes, and only then', async () => {
    const { claimCache } = require('../webCache');
    const deps = { getSetting: db.getSetting, resetLocalCache: db.resetLocalCache };
    const server = makeFakeServer();
    server.seed('plants', remotePlant());

    expect(await claimCache({ ...deps, accountId: 'acc-1' })).toBe(true); // no owner yet
    await sync.runSync({ store: store(), api: server.api });
    const mine = await db.addPhoto({
      plantId: 'p-remote',
      uri: JPEG,
      date: '2026-05-02',
    });
    expect(await db.getPlants()).toHaveLength(1);

    expect(await claimCache({ ...deps, accountId: 'acc-1' })).toBe(false); // same account
    expect(await db.getPlants()).toHaveLength(1);

    expect(await claimCache({ ...deps, accountId: 'acc-2' })).toBe(true);
    expect(await db.getPlants()).toEqual([]);
    expect(await db.readPhotoBytes('photos', mine)).toBeNull();
    expect(await db.getSetting(sync.PULLED_REVISION_KEY)).toBeNull();
    expect(await db.getSetting(sync.PUSHED_THROUGH_KEY)).toBeNull();
    expect(await db.listPhotosToUpload()).toEqual([]);

    await db.resetLocalCache(null); // sign-out
    expect(await db.getSetting('cache.owner')).toBeNull();
  });
});

describe('lib/remotePhotos.js (ticket 095)', () => {
  let remote;
  let created;
  let revoked;

  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_PLANT_API_URL = 'https://api.test/';
    created = 0;
    revoked = [];
    global.URL.createObjectURL = jest.fn(() => `blob:fake-${++created}`);
    global.URL.revokeObjectURL = jest.fn((u) => revoked.push(u));
    remote = require('../remotePhotos');
  });

  const okResponse = () => ({ ok: true, blob: async () => ({}) });

  test('fetches once with the cookie, then answers from memory', async () => {
    global.fetch = jest.fn(async () => okResponse());
    const [a, b] = await Promise.all([
      remote.resolveRemotePhoto('remote:ph-1'),
      remote.resolveRemotePhoto('remote:ph-1'),
    ]);
    expect(a).toBe('blob:fake-1');
    expect(b).toBe('blob:fake-1');
    expect(await remote.resolveRemotePhoto('remote:ph-1')).toBe('blob:fake-1');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('https://api.test/photos/ph-1', {
      credentials: 'include',
    });
  });

  test('a 404 or an unreachable server resolves to the ref and is retried next time', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 404 }));
    expect(await remote.resolveRemotePhoto('remote:ph-2')).toBe('remote:ph-2');
    global.fetch = jest.fn(async () => {
      throw new Error('offline');
    });
    expect(await remote.resolveRemotePhoto('remote:ph-2')).toBe('remote:ph-2');
    global.fetch = jest.fn(async () => okResponse());
    expect(await remote.resolveRemotePhoto('remote:ph-2')).toBe('blob:fake-1');
  });

  test('anything else passes through, and sign-out revokes every blob URL', async () => {
    global.fetch = jest.fn(async () => okResponse());
    expect(await remote.resolveRemotePhoto('idb:x')).toBe('idb:x');
    await remote.resolveRemotePhoto('remote:a');
    await remote.resolveRemotePhoto('remote:b');
    remote.revokeRemotePhotos();
    expect(revoked.sort()).toEqual(['blob:fake-1', 'blob:fake-2']);
  });
});

describe('lib/syncApi.js on the web (ticket 095)', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_PLANT_API_URL = 'https://api.test';
    global.fetch = jest.fn(async () => ({ status: 200, json: async () => ({}) }));
  });

  test('sends the cookie and no Authorization header', async () => {
    const { createSyncApi } = require('../syncApi');
    await createSyncApi(null, { web: true }).pull(0, 10);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.test/sync/pull?since=0&limit=10');
    expect(init.credentials).toBe('include');
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.mode).toBeUndefined();
  });

  test('the phone keeps its bearer token and no credentials option', async () => {
    const { createSyncApi } = require('../syncApi');
    await createSyncApi('tok', { web: false }).pull(0, 10);
    const [, init] = global.fetch.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.credentials).toBeUndefined();
  });
});
