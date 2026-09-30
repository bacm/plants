/**
 * Streamed backups through lib/db.web.js (ticket 102): export builds a Blob
 * from one part per line, import reads it back in chunks and only replaces
 * the garden once the whole file has been validated. Uses the same in-memory
 * localStorage / fake IndexedDB approach as db-web.test.js.
 */
function makeLocalStorage() {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    clear: () => {
      store = {};
    },
  };
}

function makeFakeIndexedDB() {
  const stores = new Map();
  const fireAsync = (fn) => Promise.resolve().then(fn);
  return {
    photoCount: () => stores.get('garden_photos')?.get('photos')?.size ?? 0,
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
          tx.objectStore = () => ({
            get: (key) => {
              const req = { onsuccess: null, onerror: null, result: data.get(key) };
              fireAsync(() => req.onsuccess && req.onsuccess());
              return req;
            },
            put: (value, key) => {
              data.set(key, value);
              return {};
            },
            delete: (key) => {
              data.delete(key);
              return {};
            },
          });
          fireAsync(() => tx.oncomplete && tx.oncomplete());
          return tx;
        },
      };
      fireAsync(() => {
        if (!storeMap.has('photos')) request.onupgradeneeded && request.onupgradeneeded();
        request.onsuccess && request.onsuccess();
      });
      return request;
    },
  };
}

const { toAsciiJson } = require('../backupStream');

const PHOTO_A = 'data:image/jpeg;base64,UEhPVE9B';
const PHOTO_B = 'data:image/png;base64,UEhPVE9C';

describe('lib/db.web.js streamed backups', () => {
  let db;
  let idb;

  beforeEach(() => {
    jest.resetModules();
    global.localStorage = makeLocalStorage();
    idb = makeFakeIndexedDB();
    global.indexedDB = idb;
    db = require('../db.web.js');
    db.initDb();
  });

  async function seedGarden() {
    const zoneId = db.createZone({ name: 'Massif été' });
    const plantId = db.createPlant({
      name: 'Rosé',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
      zoneId,
    });
    await db.addPhoto({ plantId, uri: PHOTO_A, date: '2026-01-01' });
    await db.addPhoto({ plantId, uri: PHOTO_B, date: '2026-01-02' });
    return plantId;
  }

  async function photoUris(plantId) {
    const photos = await db.getPhotosByPlantId(plantId);
    return photos.map((p) => p.uri).sort();
  }

  async function exportText() {
    const { blob, counts } = await db.exportGardenToFile({});
    return { text: await blob.text(), counts };
  }

  it('round-trips counts and photo bytes through export then import', async () => {
    const plantId = await seedGarden();
    const { text, counts } = await exportText();
    expect(counts).toMatchObject({ zones: 1, plants: 1, photos: 2 });
    for (let i = 0; i < text.length; i++) expect(text.charCodeAt(i)).toBeLessThan(0x80);

    // Wipe the garden, then restore it from the file.
    db.deletePlant(plantId);
    const source = new Blob([text]);
    const preview = await db.previewBackupFile(source);
    expect(preview.ok).toBe(true);
    expect(preview.backup.counts.photos).toBe(2);

    const result = await db.importGardenFromFile(source, preview.backup);
    expect(result.imported).toMatchObject({ zones: 1, plants: 1, photos: 2 });
    expect(result.skippedPhotos).toBe(0);
    expect(await photoUris(plantId)).toEqual([PHOTO_A, PHOTO_B].sort());
    expect((await db.getZones())[0].name).toBe('Massif été');
    expect(idb.photoCount()).toBe(2);
  });

  it('refuses a corrupted header before writing anything', async () => {
    const plantId = await seedGarden();
    const { text } = await exportText();
    const lines = text.split('\n');
    const header = JSON.parse(lines[0]);
    header.tables.plants[0].bogus = 1;
    lines[0] = toAsciiJson(header);
    const source = new Blob([lines.join('\n')]);

    const before = idb.photoCount();
    const preview = await db.previewBackupFile(source);
    expect(preview.ok).toBe(false);
    expect(idb.photoCount()).toBe(before);
    expect(await photoUris(plantId)).toEqual([PHOTO_A, PHOTO_B].sort());
  });

  it('leaves the garden untouched and no staged photo when the file is truncated', async () => {
    const plantId = await seedGarden();
    const { text } = await exportText();
    const cut = text.slice(0, text.lastIndexOf('{"end"'));
    const source = new Blob([cut]);
    const preview = await db.previewBackupFile(source);
    expect(preview.ok).toBe(true);

    const before = idb.photoCount();
    await expect(db.importGardenFromFile(source, preview.backup)).rejects.toThrow(/tronqué/);
    expect(idb.photoCount()).toBe(before);
    expect(await photoUris(plantId)).toEqual([PHOTO_A, PHOTO_B].sort());
  });

  it('skips a row whose photo line is absent', async () => {
    await seedGarden();
    const { text } = await exportText();
    const lines = text.split('\n');
    // Drop one photo line and fix the end line's count accordingly.
    lines.splice(1, 1);
    lines[lines.length - 2] = '{"end":true,"photos":1}';
    const source = new Blob([lines.join('\n')]);
    const preview = await db.previewBackupFile(source);
    const result = await db.importGardenFromFile(source, preview.backup);
    expect(result.skippedPhotos).toBe(1);
    expect(result.imported.photos).toBe(1);
  });

  it('still imports a version 1 file (one pretty-printed JSON object)', async () => {
    const plantId = await seedGarden();
    const { text } = await exportText();
    const lines = text.split('\n').filter(Boolean);
    const backup = JSON.parse(lines[0]);
    backup.version = 1;
    const files = {};
    for (const line of lines.slice(1, -1)) {
      const entry = JSON.parse(line);
      files[entry.id] = { ext: entry.ext, base64: entry.base64 };
    }
    for (const row of backup.tables.photos) row.file = files[row.id];
    const source = new Blob([
      JSON.stringify(backup, null, 2),
    ]); /* raw UTF-8, as the old exporter wrote it */

    db.deletePlant(plantId);
    const preview = await db.previewBackupFile(source);
    expect(preview.ok).toBe(true);
    expect(preview.backup.version).toBe(1);
    const result = await db.importGardenFromFile(source, preview.backup);
    expect(result.imported).toMatchObject({ plants: 1, photos: 2 });
    expect(await photoUris(plantId)).toEqual([PHOTO_A, PHOTO_B].sort());
  });

  it('builds the export Blob from line-sized parts, never one joined string', async () => {
    const plantId = db.createPlant({
      name: 'Rose',
      type: 'perennial',
      sun: 'full',
      water: 'medium',
    });
    const megabyte = 'QUJD'.repeat(250000);
    const big = `data:image/jpeg;base64,${megabyte}`;
    for (let i = 0; i < 40; i++) {
      await db.addPhoto({ plantId, uri: big, date: '2026-01-01' });
    }

    const RealBlob = global.Blob;
    const stringPartLengths = [];
    global.Blob = class extends RealBlob {
      constructor(parts, options) {
        for (const part of parts ?? []) {
          if (typeof part === 'string') stringPartLengths.push(part.length);
        }
        super(parts, options);
      }
    };
    let blob;
    try {
      ({ blob } = await db.exportGardenToFile({}));
    } finally {
      global.Blob = RealBlob;
    }
    expect(stringPartLengths).toHaveLength(40 + 2);
    expect(Math.max(...stringPartLengths)).toBeLessThan(megabyte.length + 200);
    expect(blob.size).toBeGreaterThan(40 * megabyte.length);
  });
});
