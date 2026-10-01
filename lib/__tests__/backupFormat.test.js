/**
 * lib/backupFormat.js is the pure (de)serialisation for the whole-garden
 * backup archive (ticket 020): buildBackup turns raw db rows into a JSON-able
 * object, parseBackup validates one read from disk before anything touches
 * SQL or IndexedDB. This test pins: TABLE_COLUMNS agrees with lib/db.js's
 * schema (mirrors plantFields.test.js's approach), a full round trip through
 * JSON survives, and parseBackup rejects every untrusted-input case the
 * ticket calls out.
 */
const fs = require('fs');
const path = require('path');
const {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  TABLE_COLUMNS,
  OMITTED_DB_COLUMNS,
  buildBackup,
  parseBackup,
} = require('../backupFormat');

function extractCreateTableColumns(source, table) {
  const re = new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\(([\\s\\S]*?)\\n\\s*\\);`);
  const match = source.match(re);
  const body = match[1];
  const columns = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim().replace(/,$/, '');
    if (!line || line.startsWith('FOREIGN KEY')) continue;
    columns.push(line.split(/\s+/)[0]);
  }
  return columns;
}

function extractAlterColumns(source, table) {
  const columns = [];
  const re = new RegExp(`ALTER TABLE ${table} ADD COLUMN (\\w+)`, 'g');
  let m;
  while ((m = re.exec(source))) columns.push(m[1]);
  return columns;
}

describe('TABLE_COLUMNS matches lib/db.js schema', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf8');

  for (const table of Object.keys(TABLE_COLUMNS)) {
    it(`${table}: agrees with the CREATE TABLE / ALTER TABLE columns`, () => {
      const schemaColumns = new Set([
        ...extractCreateTableColumns(source, table),
        ...extractAlterColumns(source, table),
      ]);
      const omitted = OMITTED_DB_COLUMNS[table] ?? new Set();
      for (const col of omitted) schemaColumns.delete(col);
      expect([...TABLE_COLUMNS[table]].sort()).toEqual([...schemaColumns].sort());
    });
  }
});

function samplePlant(overrides = {}) {
  return {
    id: 'plant-1',
    name: 'Rose',
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
    notes: null,
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

function sampleZone(overrides = {}) {
  return {
    id: 'zone-1',
    name: 'Massif nord',
    description: null,
    icon: null,
    orderIndex: 0,
    ...overrides,
  };
}

function sampleTables(overrides = {}) {
  return {
    zones: [sampleZone()],
    plants: [samplePlant({ zoneId: 'zone-1' })],
    reminders: [
      {
        id: 'rem-1',
        plantId: 'plant-1',
        kind: 'water',
        frequencyDays: 7,
        nextDueDate: '2026-01-08',
        lastDoneDate: null,
        enabled: 1,
      },
    ],
    care_logs: [
      { id: 'log-1', plantId: 'plant-1', type: 'watered', date: '2026-01-01', notes: null },
    ],
    photos: [{ id: 'photo-1', plantId: 'plant-1', careLogId: 'log-1', date: '2026-01-01' }],
    ...overrides,
  };
}

describe('buildBackup', () => {
  it('produces the documented shape and counts', () => {
    const backup = buildBackup({
      tables: sampleTables(),
      photoData: { 'photo-1': { ext: 'jpg', base64: 'aGVsbG8=' } },
      exportedAt: '2026-02-01T00:00:00.000Z',
    });
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.exportedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(backup.counts).toEqual({
      zones: 1,
      plants: 1,
      reminders: 1,
      care_logs: 1,
      photos: 1,
      unsorted_photos: 0,
      bloom_observations: 0,
      garden_plan: 0,
    });
    expect(backup.tables.photos).toEqual([
      {
        id: 'photo-1',
        plantId: 'plant-1',
        careLogId: 'log-1',
        date: '2026-01-01',
        caption: null,
        fingerprint: null,
        updatedAt: null,
        file: { ext: 'jpg', base64: 'aGVsbG8=' },
      },
    ]);
  });

  it('archives a photo with a missing file as file: null and still counts it', () => {
    const backup = buildBackup({ tables: sampleTables(), photoData: {} });
    expect(backup.tables.photos[0].file).toBeNull();
    expect(backup.counts.photos).toBe(1);
  });

  it('strips any extra row keys (e.g. joined columns) down to TABLE_COLUMNS', () => {
    const backup = buildBackup({
      tables: sampleTables({
        zones: [{ ...sampleZone(), plantCount: 3 }],
      }),
    });
    expect(Object.keys(backup.tables.zones[0]).sort()).toEqual([...TABLE_COLUMNS.zones].sort());
  });

  it('defaults exportedAt to now when not given', () => {
    const backup = buildBackup({ tables: sampleTables() });
    expect(typeof backup.exportedAt).toBe('string');
    expect(() => new Date(backup.exportedAt).toISOString()).not.toThrow();
  });
});

describe('parseBackup: round trip', () => {
  it('accepts its own buildBackup output, unchanged in substance', () => {
    const built = buildBackup({
      tables: sampleTables(),
      photoData: { 'photo-1': { ext: 'png', base64: 'aGVsbG8=' } },
    });
    const result = parseBackup(JSON.stringify(built));
    expect(result.ok).toBe(true);
    expect(result.backup.counts).toEqual(built.counts);
    expect(result.backup.tables.plants[0].id).toBe('plant-1');
    expect(result.backup.tables.photos[0].file).toEqual({ ext: 'png', base64: 'aGVsbG8=' });
    expect(result.backup.warnings).toEqual({ danglingZoneRefs: 0 });
  });

  it('round-trips an archive with no photo file', () => {
    const built = buildBackup({ tables: sampleTables(), photoData: {} });
    const result = parseBackup(JSON.stringify(built));
    expect(result.ok).toBe(true);
    expect(result.backup.tables.photos[0].file).toBeNull();
  });

  it('round-trips a plant with the unknown sentinel on every enum field (ticket 046)', () => {
    const built = buildBackup({
      tables: sampleTables({
        plants: [
          samplePlant({
            zoneId: 'zone-1',
            type: 'unknown',
            sun: 'unknown',
            water: 'unknown',
            soilType: 'unknown',
            soilPH: 'unknown',
            toxicity: 'unknown',
          }),
        ],
      }),
    });
    const result = parseBackup(JSON.stringify(built));
    expect(result.ok).toBe(true);
    const plant = result.backup.tables.plants[0];
    expect(plant.type).toBe('unknown');
    expect(plant.sun).toBe('unknown');
    expect(plant.water).toBe('unknown');
    expect(plant.soilType).toBe('unknown');
    expect(plant.soilPH).toBe('unknown');
    expect(plant.toxicity).toBe('unknown');
  });

  it('round-trips an empty garden', () => {
    const built = buildBackup({
      tables: { zones: [], plants: [], reminders: [], care_logs: [], photos: [] },
    });
    const result = parseBackup(JSON.stringify(built));
    expect(result.ok).toBe(true);
    expect(result.backup.counts).toEqual({
      zones: 0,
      plants: 0,
      reminders: 0,
      care_logs: 0,
      photos: 0,
      unsorted_photos: 0,
      bloom_observations: 0,
      garden_plan: 0,
    });
  });
});

describe('buildBackup / parseBackup: unsorted_photos and bloom_observations (ticket 056)', () => {
  it('archives unsorted photos with their file, and round-trips them', () => {
    const built = buildBackup({
      tables: sampleTables({
        unsorted_photos: [{ id: 'unsorted-1', takenAt: '2026-03-01T10:00:00.000Z', caption: null }],
      }),
      unsortedPhotoData: { 'unsorted-1': { ext: 'jpg', base64: 'aGVsbG8=' } },
    });
    expect(built.tables.unsorted_photos).toEqual([
      {
        id: 'unsorted-1',
        takenAt: '2026-03-01T10:00:00.000Z',
        caption: null,
        dateUnknown: false,
        fingerprint: null,
        updatedAt: null,
        file: { ext: 'jpg', base64: 'aGVsbG8=' },
      },
    ]);
    expect(built.counts.unsorted_photos).toBe(1);

    const result = parseBackup(JSON.stringify(built));
    expect(result.ok).toBe(true);
    expect(result.backup.tables.unsorted_photos).toEqual(built.tables.unsorted_photos);
  });

  it('archives an unsorted photo with dateUnknown true, and round-trips it (ticket 061)', () => {
    const built = buildBackup({
      tables: sampleTables({
        unsorted_photos: [
          {
            id: 'unsorted-1',
            takenAt: '2026-03-01',
            caption: null,
            dateUnknown: true,
          },
        ],
      }),
      unsortedPhotoData: { 'unsorted-1': { ext: 'jpg', base64: 'aGVsbG8=' } },
    });
    expect(built.tables.unsorted_photos[0].dateUnknown).toBe(true);

    const result = parseBackup(JSON.stringify(built));
    expect(result.ok).toBe(true);
    expect(result.backup.tables.unsorted_photos[0].dateUnknown).toBe(true);
  });

  it('a v1 unsorted photo row missing dateUnknown entirely defaults it to false', () => {
    const built = buildBackup({
      tables: sampleTables({
        unsorted_photos: [{ id: 'unsorted-1', takenAt: '2026-03-01T10:00:00.000Z', caption: null }],
      }),
      unsortedPhotoData: { 'unsorted-1': { ext: 'jpg', base64: 'aGVsbG8=' } },
    });
    delete built.tables.unsorted_photos[0].dateUnknown;
    const result = parseBackup(JSON.stringify(built));
    expect(result.ok).toBe(true);
    expect(result.backup.tables.unsorted_photos[0].dateUnknown).toBe(false);
  });

  it('round-trips a fingerprint on a photo and an unsorted photo (ticket 085)', () => {
    const fp = '2026:05:04 10:11:12|12345|4000x3000';
    const base = sampleTables();
    const built = buildBackup({
      tables: {
        ...base,
        photos: [{ ...base.photos[0], fingerprint: fp }],
        unsorted_photos: [
          { id: 'unsorted-1', takenAt: '2026-03-01', caption: null, fingerprint: fp },
        ],
      },
      photoData: { 'photo-1': { ext: 'jpg', base64: 'aGVsbG8=' } },
      unsortedPhotoData: { 'unsorted-1': { ext: 'jpg', base64: 'aGVsbG8=' } },
    });
    expect(built.tables.photos[0].fingerprint).toBe(fp);
    expect(built.tables.unsorted_photos[0].fingerprint).toBe(fp);
    const result = parseBackup(JSON.stringify(built));
    expect(result.ok).toBe(true);
    expect(result.backup.tables.photos[0].fingerprint).toBe(fp);
    expect(result.backup.tables.unsorted_photos[0].fingerprint).toBe(fp);
  });

  it('a v1 row missing fingerprint entirely defaults it to null (ticket 085)', () => {
    const built = buildBackup({
      tables: sampleTables({
        unsorted_photos: [{ id: 'unsorted-1', takenAt: '2026-03-01', caption: null }],
      }),
      unsortedPhotoData: { 'unsorted-1': { ext: 'jpg', base64: 'aGVsbG8=' } },
    });
    delete built.tables.photos[0].fingerprint;
    delete built.tables.unsorted_photos[0].fingerprint;
    const result = parseBackup(JSON.stringify(built));
    expect(result.ok).toBe(true);
    expect(result.backup.tables.photos[0].fingerprint).toBeNull();
    expect(result.backup.tables.unsorted_photos[0].fingerprint).toBeNull();
  });

  it('a plant row missing coverPhotoId still parses as null, and a set one round-trips (ticket 088)', () => {
    const built = buildBackup({ tables: sampleTables(), photoData: {} });
    delete built.tables.plants[0].coverPhotoId;
    const old = parseBackup(JSON.stringify(built));
    expect(old.ok).toBe(true);
    expect(old.backup.tables.plants[0].coverPhotoId).toBeNull();

    built.tables.plants[0].coverPhotoId = 'photo-1';
    const fresh = parseBackup(JSON.stringify(built));
    expect(fresh.ok).toBe(true);
    expect(fresh.backup.tables.plants[0].coverPhotoId).toBe('photo-1');
  });

  it('a plant row missing bloomAbundance still parses as unknown (ticket 090)', () => {
    const built = buildBackup({ tables: sampleTables(), photoData: {} });
    delete built.tables.plants[0].bloomAbundance;
    const old = parseBackup(JSON.stringify(built));
    expect(old.ok).toBe(true);
    expect(old.backup.tables.plants[0].bloomAbundance).toBe('unknown');

    built.tables.plants[0].bloomAbundance = 'insignificant';
    const fresh = parseBackup(JSON.stringify(built));
    expect(fresh.ok).toBe(true);
    expect(fresh.backup.tables.plants[0].bloomAbundance).toBe('insignificant');
  });

  it('archives a bloom observation and round-trips it', () => {
    const built = buildBackup({
      tables: sampleTables({
        bloom_observations: [
          { id: 'bloom-1', plantId: 'plant-1', date: '2026-05-01', kind: 'open' },
        ],
      }),
    });
    expect(built.tables.bloom_observations).toEqual([
      { id: 'bloom-1', plantId: 'plant-1', date: '2026-05-01', kind: 'open', updatedAt: null },
    ]);

    const result = parseBackup(JSON.stringify(built));
    expect(result.ok).toBe(true);
    expect(result.backup.tables.bloom_observations).toEqual(built.tables.bloom_observations);
  });

  it('a v1 backup missing unsorted_photos/bloom_observations entirely still imports', () => {
    const built = buildBackup({ tables: sampleTables() });
    delete built.tables.unsorted_photos;
    delete built.tables.bloom_observations;
    const result = parseBackup(JSON.stringify(built));
    expect(result.ok).toBe(true);
    expect(result.backup.tables.unsorted_photos).toEqual([]);
    expect(result.backup.tables.bloom_observations).toEqual([]);
  });

  it('rejects a bloom observation referencing a missing plant', () => {
    const built = buildBackup({
      tables: sampleTables({
        bloom_observations: [
          { id: 'bloom-1', plantId: 'ghost-plant', date: '2026-05-01', kind: 'open' },
        ],
      }),
    });
    expect(parseBackup(JSON.stringify(built)).ok).toBe(false);
  });

  it('rejects an unsorted photo file with an unsupported extension', () => {
    const built = buildBackup({
      tables: sampleTables({
        unsorted_photos: [{ id: 'unsorted-1', takenAt: '2026-03-01T10:00:00.000Z', caption: null }],
      }),
      unsortedPhotoData: { 'unsorted-1': { ext: 'exe', base64: 'aGVsbG8=' } },
    });
    expect(parseBackup(JSON.stringify(built)).ok).toBe(false);
  });

  it('a v1 photo row missing caption entirely defaults it to null', () => {
    const built = buildBackup({ tables: sampleTables() });
    delete built.tables.photos[0].caption;
    const result = parseBackup(JSON.stringify(built));
    expect(result.ok).toBe(true);
    expect(result.backup.tables.photos[0].caption).toBeNull();
  });
});

describe('parseBackup: rejects untrusted input', () => {
  it('rejects unparseable JSON', () => {
    expect(parseBackup('not json').ok).toBe(false);
  });

  it('rejects a non-object JSON value', () => {
    expect(parseBackup('42').ok).toBe(false);
    expect(parseBackup('[]').ok).toBe(false);
  });

  it('rejects the wrong format string', () => {
    const built = buildBackup({ tables: sampleTables() });
    const result = parseBackup(JSON.stringify({ ...built, format: 'something-else' }));
    expect(result.ok).toBe(false);
  });

  it('rejects a missing version', () => {
    const built = buildBackup({ tables: sampleTables() });
    delete built.version;
    expect(parseBackup(JSON.stringify(built)).ok).toBe(false);
  });

  it('rejects a newer version than supported', () => {
    const built = buildBackup({ tables: sampleTables() });
    const result = parseBackup(JSON.stringify({ ...built, version: BACKUP_VERSION + 98 }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/version/i);
  });

  it('rejects an older version than supported', () => {
    const built = buildBackup({ tables: sampleTables() });
    const result = parseBackup(JSON.stringify({ ...built, version: 0 }));
    expect(result.ok).toBe(false);
  });

  it('rejects a missing table', () => {
    const built = buildBackup({ tables: sampleTables() });
    delete built.tables.photos;
    expect(parseBackup(JSON.stringify(built)).ok).toBe(false);
  });

  it('rejects a row with a column not in TABLE_COLUMNS', () => {
    const built = buildBackup({ tables: sampleTables() });
    built.tables.zones[0].evilColumn = "'; DROP TABLE zones; --";
    const result = parseBackup(JSON.stringify(built));
    expect(result.ok).toBe(false);
  });

  it('rejects a zone with a non-string id', () => {
    const built = buildBackup({ tables: sampleTables() });
    built.tables.zones[0].id = 42;
    expect(parseBackup(JSON.stringify(built)).ok).toBe(false);
  });

  it('rejects a plant with a wrongly-typed field', () => {
    const built = buildBackup({ tables: sampleTables() });
    built.tables.plants[0].bloomStartMonth = 'may';
    expect(parseBackup(JSON.stringify(built)).ok).toBe(false);
  });

  it('nulls a dangling plant.zoneId and reports it as a warning, not a rejection', () => {
    const built = buildBackup({
      tables: sampleTables({ zones: [], plants: [samplePlant({ zoneId: 'ghost-zone' })] }),
    });
    const result = parseBackup(JSON.stringify(built));
    expect(result.ok).toBe(true);
    expect(result.backup.tables.plants[0].zoneId).toBeNull();
    expect(result.backup.warnings.danglingZoneRefs).toBe(1);
  });

  it('rejects a reminder referencing a missing plant', () => {
    const built = buildBackup({
      tables: sampleTables({
        plants: [],
        reminders: [
          {
            id: 'rem-1',
            plantId: 'ghost-plant',
            kind: 'water',
            frequencyDays: 7,
            nextDueDate: '2026-01-08',
            lastDoneDate: null,
            enabled: 1,
          },
        ],
      }),
    });
    expect(parseBackup(JSON.stringify(built)).ok).toBe(false);
  });

  it('rejects a care log referencing a missing plant', () => {
    const built = buildBackup({
      tables: sampleTables({
        plants: [],
        reminders: [],
        care_logs: [
          { id: 'log-1', plantId: 'ghost-plant', type: 'watered', date: '2026-01-01', notes: null },
        ],
        photos: [],
      }),
    });
    expect(parseBackup(JSON.stringify(built)).ok).toBe(false);
  });

  it('rejects a photo referencing a missing plant', () => {
    const built = buildBackup({
      tables: sampleTables({
        plants: [],
        reminders: [],
        care_logs: [],
        photos: [{ id: 'photo-1', plantId: 'ghost-plant', careLogId: null, date: '2026-01-01' }],
      }),
    });
    expect(parseBackup(JSON.stringify(built)).ok).toBe(false);
  });

  it('rejects a photo file with an unsupported extension', () => {
    const built = buildBackup({
      tables: sampleTables(),
      photoData: { 'photo-1': { ext: 'exe', base64: 'aGVsbG8=' } },
    });
    expect(parseBackup(JSON.stringify(built)).ok).toBe(false);
  });

  it('rejects a photo file with invalid base64', () => {
    const built = buildBackup({
      tables: sampleTables(),
      photoData: { 'photo-1': { ext: 'jpg', base64: 'not-base64!!' } },
    });
    expect(parseBackup(JSON.stringify(built)).ok).toBe(false);
  });

  it('rejects duplicate ids within the same table', () => {
    const built = buildBackup({
      tables: sampleTables({ zones: [sampleZone(), sampleZone()] }),
    });
    expect(parseBackup(JSON.stringify(built)).ok).toBe(false);
  });
});

describe('updatedAt (ticket 091)', () => {
  it('round-trips updatedAt on every table', () => {
    const stamp = '2026-03-01T00:00:00.000Z';
    const tables = sampleTables();
    for (const name of Object.keys(tables)) {
      tables[name] = tables[name].map((row) => ({ ...row, updatedAt: stamp }));
    }
    const backup = buildBackup({
      tables: { ...tables, unsorted_photos: [], bloom_observations: [] },
      photoData: { 'photo-1': { ext: 'jpg', base64: 'aGVsbG8=' } },
    });
    for (const name of ['zones', 'plants', 'reminders', 'care_logs', 'photos']) {
      expect(backup.tables[name][0].updatedAt).toBe(stamp);
    }
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    expect(parsed.backup.tables.plants[0].updatedAt).toBe(stamp);
    expect(parsed.backup.tables.photos[0].updatedAt).toBe(stamp);
  });

  it('still parses a backup without updatedAt', () => {
    const backup = buildBackup({ tables: sampleTables() });
    for (const rows of Object.values(backup.tables)) {
      for (const row of rows) delete row.updatedAt;
    }
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    expect(parsed.backup.tables.zones[0].updatedAt).toBeNull();
  });

  it('rejects a non-string updatedAt', () => {
    const backup = buildBackup({ tables: sampleTables() });
    backup.tables.care_logs[0].updatedAt = 12345;
    expect(parseBackup(JSON.stringify(backup)).ok).toBe(false);
  });
});

describe('garden plan data in backups (ticket 105)', () => {
  const RECT = '[[0,0],[400,0],[400,300],[0,300]]';
  const roundTrip = (tables) => parseBackup(JSON.stringify(buildBackup({ tables })));

  it('round-trips the plan size, a zone outline and a plant position', () => {
    const result = roundTrip(
      sampleTables({
        zones: [sampleZone({ polygon: RECT })],
        plants: [samplePlant({ zoneId: 'zone-1', planX: 120, planY: 80 })],
        garden_plan: [{ id: 'main', widthCm: 1500, lengthCm: 2500 }],
      })
    );
    expect(result.ok).toBe(true);
    expect(result.backup.counts.garden_plan).toBe(1);
    expect(result.backup.tables.garden_plan[0]).toMatchObject({ widthCm: 1500, lengthCm: 2500 });
    expect(result.backup.tables.zones[0].polygon).toBe(RECT);
    expect(result.backup.tables.plants[0]).toMatchObject({ planX: 120, planY: 80 });
  });

  it('still imports an older backup with no plan data', () => {
    const built = buildBackup({ tables: sampleTables() });
    delete built.tables.garden_plan;
    for (const zone of built.tables.zones) delete zone.polygon;
    for (const plant of built.tables.plants) {
      delete plant.planX;
      delete plant.planY;
    }
    const result = parseBackup(JSON.stringify(built));
    expect(result.ok).toBe(true);
    expect(result.backup.tables.garden_plan).toEqual([]);
    expect(result.backup.tables.zones[0].polygon).toBeNull();
    expect(result.backup.tables.plants[0]).toMatchObject({ planX: null, planY: null });
  });

  it('refuses an invalid zone outline', () => {
    for (const polygon of ['not json', '[[0,0],[1,1]]', '{"a":1}', 5]) {
      const result = roundTrip(sampleTables({ zones: [sampleZone({ polygon })] }));
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/contour/);
    }
  });

  it('refuses a non-integer plant position', () => {
    const result = roundTrip(sampleTables({ plants: [samplePlant({ planX: 1.5, planY: 2 })] }));
    expect(result.ok).toBe(false);
  });

  it('refuses a bad plan size, id or a second plan row', () => {
    const bad = [
      [{ id: 'main', widthCm: 0, lengthCm: 100 }],
      [{ id: 'main', widthCm: 100.5, lengthCm: 100 }],
      [{ id: 'other', widthCm: 100, lengthCm: 100 }],
      [
        { id: 'main', widthCm: 100, lengthCm: 100 },
        { id: 'main', widthCm: 200, lengthCm: 200 },
      ],
    ];
    for (const garden_plan of bad) {
      expect(roundTrip(sampleTables({ garden_plan })).ok).toBe(false);
    }
  });
});
