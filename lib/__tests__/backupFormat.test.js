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
    expect(backup.counts).toEqual({ zones: 1, plants: 1, reminders: 1, care_logs: 1, photos: 1 });
    expect(backup.tables.photos).toEqual([
      {
        id: 'photo-1',
        plantId: 'plant-1',
        careLogId: 'log-1',
        date: '2026-01-01',
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
    });
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
    const result = parseBackup(JSON.stringify({ ...built, version: BACKUP_VERSION + 1 }));
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
