/**
 * lib/backupStream.js: the streamed, pure-ASCII backup format (ticket 102).
 * Round trip through encoder + splitter + validation, the splitter's chunk
 * edge cases, truncated/corrupted files, and a large simulated garden where
 * no single line may exceed one photo.
 */
const { buildBackup, BACKUP_VERSION_STREAMED } = require('../backupFormat');
const {
  toAsciiJson,
  encodeBackupLines,
  asciiToByteSlices,
  createLineSplitter,
  readBackupHeader,
  readBackupPhotos,
} = require('../backupStream');

function plant(overrides = {}) {
  return {
    id: 'plant-1',
    name: 'Rosé « été » \u{1F339}',
    latinName: null,
    type: 'perennial',
    flowerColor: null,
    sun: 'full',
    water: 'medium',
    bloomStartMonth: 5,
    bloomEndMonth: 9,
    height: null,
    width: null,
    deciduous: null,
    minTemperature: null,
    zoneId: null,
    notes: 'À tailler en février',
    createdAt: '2026-01-01T00:00:00.000Z',
    imageUrls: null,
    soilType: 'loamy',
    soilPH: 'neutral',
    fertilizer: null,
    pruning: null,
    pruningMonth: null,
    propagation: null,
    pests: null,
    toxicity: 'none',
    companionPlants: null,
    harvest: null,
    harvestMonthStart: null,
    harvestMonthEnd: null,
    origin: null,
    winterCare: null,
    ...overrides,
  };
}

function makeHeader(photoCount, unsortedCount = 1) {
  const photos = [];
  const photoData = {};
  for (let i = 0; i < photoCount; i++) {
    photos.push({ id: `photo-${i}`, plantId: 'plant-1', date: '2026-01-01' });
    photoData[`photo-${i}`] = { ext: 'jpg' };
  }
  const unsorted = [];
  const unsortedPhotoData = {};
  for (let i = 0; i < unsortedCount; i++) {
    unsorted.push({ id: `u-${i}`, takenAt: '2026-01-02' });
    unsortedPhotoData[`u-${i}`] = { ext: 'png' };
  }
  return buildBackup({
    tables: { plants: [plant()], photos, unsorted_photos: unsorted },
    photoData,
    unsortedPhotoData,
    version: BACKUP_VERSION_STREAMED,
  });
}

function entriesFor(header, base64 = 'aGVsbG8=') {
  const out = [];
  for (const table of ['photos', 'unsorted_photos']) {
    for (const row of header.tables[table]) {
      if (row.file) out.push({ table, id: row.id, ext: row.file.ext, base64 });
    }
  }
  return out;
}

async function encodeToString(header, entries) {
  let text = '';
  for await (const line of encodeBackupLines(header, entries)) text += line;
  return text;
}

function toChunks(text, size) {
  const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0));
  const chunks = [];
  for (let i = 0; i < bytes.length; i += size) chunks.push(bytes.subarray(i, i + size));
  return chunks;
}

async function* asAsync(chunks) {
  for (const chunk of chunks) yield chunk;
}

describe('toAsciiJson', () => {
  it('escapes every char above 0x7E and parses back to the same value', () => {
    const value = { name: 'Rosé « été » \u{1F339} ~ \u007f', n: 3 };
    const json = toAsciiJson(value);
    for (let i = 0; i < json.length; i++) expect(json.charCodeAt(i)).toBeLessThan(0x7f);
    expect(json).toContain('\\u00e9');
    expect(json).toContain('\\ud83c\\udf39');
    expect(JSON.parse(json)).toEqual(value);
  });
});

describe('line splitter', () => {
  it('reassembles a line split across three chunks', () => {
    const splitter = createLineSplitter();
    const bytes = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
    expect(splitter.push(bytes('{"a":'))).toEqual([]);
    expect(splitter.push(bytes('12,"b"'))).toEqual([]);
    expect(splitter.push(bytes(':3}\nnext'))).toEqual(['{"a":12,"b":3}']);
    expect(splitter.finish()).toBe('next');
  });

  it('returns many lines from one chunk', () => {
    const splitter = createLineSplitter();
    const lines = splitter.push(Uint8Array.from('one\ntwo\n\nthree\n', (c) => c.charCodeAt(0)));
    expect(lines).toEqual(['one', 'two', '', 'three']);
    expect(splitter.finish()).toBe('');
  });

  it('refuses a non-ASCII byte', () => {
    const splitter = createLineSplitter();
    expect(() => splitter.push(Uint8Array.of(0x61, 0xc3, 0xa9, 0x0a))).toThrow(/ASCII/);
  });

  it('slices a long line into bounded byte chunks', () => {
    const slices = [...asciiToByteSlices('x'.repeat(10), 4)];
    expect(slices.map((s) => s.length)).toEqual([4, 4, 2]);
  });
});

describe('version 2 round trip', () => {
  it('encodes pure ASCII and reads back header and photos, whatever the chunking', async () => {
    const header = makeHeader(3);
    const entries = entriesFor(header).map((e, i) => ({ ...e, base64: `${'QUJD'.repeat(i + 1)}` }));
    const text = await encodeToString(header, entries);
    for (let i = 0; i < text.length; i++) expect(text.charCodeAt(i)).toBeLessThan(0x80);
    expect(text.split('\n')).toHaveLength(1 + 4 + 1 + 1);

    for (const size of [1, 7, 1000, text.length]) {
      const got = await readBackupHeader(asAsync(toChunks(text, size)));
      expect(got.kind).toBe('streamed');
      expect(got.result.ok).toBe(true);
      const { backup } = got.result;
      expect(backup.tables.plants[0].name).toBe('Rosé « été » \u{1F339}');
      expect(backup.tables.photos[0].file).toEqual({ ext: 'jpg' });
      expect(backup.counts.photos).toBe(3);

      const read = [];
      const count = await readBackupPhotos(asAsync(toChunks(text, size)), backup, (p) =>
        read.push(p)
      );
      expect(count).toBe(4);
      expect(read).toEqual(entries);
    }
  });

  it('keeps a missing photo file as a null descriptor without a photo line', async () => {
    const header = buildBackup({
      tables: { plants: [plant()], photos: [{ id: 'p', plantId: 'plant-1', date: '2026-01-01' }] },
      version: BACKUP_VERSION_STREAMED,
    });
    const text = await encodeToString(header, []);
    const got = await readBackupHeader(asAsync(toChunks(text, 50)));
    expect(got.result.ok).toBe(true);
    expect(got.result.backup.tables.photos[0].file).toBeNull();
    expect(await readBackupPhotos(asAsync(toChunks(text, 50)), got.result.backup, () => {})).toBe(
      0
    );
  });
});

describe('truncated and corrupted files', () => {
  async function fixture() {
    const header = makeHeader(2);
    const text = await encodeToString(header, entriesFor(header));
    const { result } = await readBackupHeader(asAsync(toChunks(text, 100)));
    return { text, backup: result.backup };
  }
  const read = (text, backup) => readBackupPhotos(asAsync(toChunks(text, 64)), backup, () => {});

  it('refuses a file with no end line', async () => {
    const { text, backup } = await fixture();
    const cut = text.slice(0, text.lastIndexOf('{"end"'));
    await expect(read(cut, backup)).rejects.toThrow(/tronqué/);
  });

  it('refuses a file cut in the middle of a photo line', async () => {
    const { text, backup } = await fixture();
    await expect(read(text.slice(0, text.length - 40), backup)).rejects.toThrow(/tronqué/);
  });

  it('refuses an end line with the wrong photo count', async () => {
    const { text, backup } = await fixture();
    const bad = text.replace('"photos":3}', '"photos":9}');
    expect(bad).not.toBe(text);
    await expect(read(bad, backup)).rejects.toThrow(/9 annoncée/);
  });

  it('refuses a photo line that has no row in the header', async () => {
    const { text, backup } = await fixture();
    const bad = text.replace('{"photo":"photos","id":"photo-0"', '{"photo":"photos","id":"ghost"');
    await expect(read(bad, backup)).rejects.toThrow(/fiche/);
  });

  it('refuses a corrupted base64 payload', async () => {
    const { text, backup } = await fixture();
    const bad = text.replace('aGVsbG8=', 'aGV$bG8=');
    await expect(read(bad, backup)).rejects.toThrow(/illisible/);
  });

  it('refuses a corrupted header row', async () => {
    const header = makeHeader(1);
    header.tables.plants[0].bogus = 1;
    const text = await encodeToString(header, entriesFor(header));
    const got = await readBackupHeader(asAsync(toChunks(text, 100)));
    expect(got.kind).toBe('streamed');
    expect(got.result.ok).toBe(false);
  });

  it('treats an old pretty-printed file as legacy', async () => {
    const old = JSON.stringify({ format: 'x', version: 1, tables: {} }, null, 2);
    const got = await readBackupHeader(asAsync(toChunks(old, 10)));
    expect(got.kind).toBe('legacy');
  });

  it('treats an old file with raw UTF-8 accents as legacy', async () => {
    const bytes = new TextEncoder().encode('{\n  "name": "Rosé"\n}');
    const got = await readBackupHeader(asAsync([bytes]));
    expect(got.kind).toBe('legacy');
  });
});

describe('large simulated garden', () => {
  it('never yields a line longer than one photo', async () => {
    const header = makeHeader(199, 1);
    const photoBase64 = 'QUJD'.repeat(250000); // 1 MB of base64
    let generated = 0;
    let alive = 0;
    let maxAlive = 0;
    async function* lazy() {
      for (const entry of entriesFor(header, '')) {
        alive++;
        maxAlive = Math.max(maxAlive, alive);
        generated++;
        yield { ...entry, base64: photoBase64 };
        alive--;
      }
    }
    let lines = 0;
    let longest = 0;
    let headerLength = 0;
    for await (const line of encodeBackupLines(header, lazy())) {
      if (lines === 0) headerLength = line.length;
      lines++;
      longest = Math.max(longest, line.length);
    }
    expect(generated).toBe(200);
    expect(lines).toBe(202);
    expect(maxAlive).toBe(1);
    expect(longest).toBeLessThan(photoBase64.length + 200);
    expect(longest).toBeGreaterThan(photoBase64.length);
    expect(headerLength).toBeLessThan(200000);
  });
});
