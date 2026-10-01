/**
 * lib/plantFields.js is the single definition of every `plants` column and how
 * it maps to/from a form value or a plant-search result. This test pins the
 * three things that matter: the definition covers every column that actually
 * exists on the table, a row survives a form round trip, and the blank/default
 * forms match what the screens used to hand-write.
 */
const fs = require('fs');
const path = require('path');
const {
  PLANT_FIELDS,
  PLANT_COLUMNS,
  emptyPlantForm,
  plantRowToForm,
  searchResultToForm,
  formToPlantValues,
  plantInsertValues,
  parseImageUrls,
} = require('../plantFields');

function extractCreateTableColumns(source) {
  const match = source.match(/CREATE TABLE IF NOT EXISTS plants \(([\s\S]*?)\n\s*\);/);
  const body = match[1];
  const columns = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim().replace(/,$/, '');
    if (!line || line.startsWith('FOREIGN KEY')) continue;
    const name = line.split(/\s+/)[0];
    if (name === 'id') continue;
    columns.push(name);
  }
  return columns;
}

function extractAlterColumns(source) {
  const columns = [];
  const re = /ALTER TABLE plants ADD COLUMN (\w+)/g;
  let m;
  while ((m = re.exec(source))) columns.push(m[1]);
  return columns;
}

describe('PLANT_FIELDS covers every plants column', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf8');
  const tableColumns = extractCreateTableColumns(source);
  const alterColumns = extractAlterColumns(source);
  // updatedAt / deletedAt are sync bookkeeping (ticket 091), not plant fields.
  const allColumns = new Set([...tableColumns, ...alterColumns]);
  allColumns.delete('updatedAt');
  allColumns.delete('deletedAt');

  it('found a plausible number of columns (extractor sanity check)', () => {
    expect(allColumns.size).toBeGreaterThan(20);
  });

  it('matches the CREATE TABLE + migration column set exactly', () => {
    const fieldKeys = new Set(PLANT_FIELDS.map((f) => f.key));
    expect([...fieldKeys].sort()).toEqual([...allColumns].sort());
  });

  it('exposes the same keys via PLANT_COLUMNS', () => {
    const fieldKeys = new Set(PLANT_FIELDS.map((f) => f.key));
    expect([...PLANT_COLUMNS].sort()).toEqual([...fieldKeys].sort());
  });
});

describe('form <-> row round trip', () => {
  // createdAt is midnight UTC so the date-only round trip (form only carries
  // the day, not the time) reproduces the exact same ISO string.
  const row = {
    id: 'p1',
    name: 'Rose',
    latinName: 'Rosa gallica',
    type: 'shrub',
    flowerColor: 'rose',
    sun: 'full_sun',
    water: 'medium',
    bloomStartMonth: 5,
    bloomEndMonth: 7,
    bloomAbundance: 'abundant',
    height: 150,
    width: 100,
    deciduous: 1,
    minTemperature: -15,
    zoneId: 'zone-1',
    notes: 'Parfumee',
    createdAt: '2024-05-01T00:00:00.000Z',
    imageUrls: null,
    coverPhotoId: null,
    soilType: 'loamy',
    soilPH: 'neutral',
    fertilizer: 'NPK',
    pruning: 'Taille en hiver',
    pruningMonth: 2,
    propagation: 'cutting',
    pests: 'pucerons',
    toxicity: 'none',
    companionPlants: 'basilic',
    harvest: null,
    harvestMonthStart: null,
    harvestMonthEnd: null,
    origin: 'Europe',
    winterCare: 'Paillage',
  };

  it('formToPlantValues(plantRowToForm(row)) reproduces the row values', () => {
    const values = formToPlantValues(plantRowToForm(row));
    for (const f of PLANT_FIELDS.filter((field) => !field.noForm)) {
      expect(values[f.key]).toEqual(row[f.key]);
    }
  });

  it('keeps the plan position out of the form, so saving the form never overwrites it', () => {
    const planned = { ...row, planX: 120, planY: 340 };
    expect(plantRowToForm(planned)).not.toHaveProperty('planX');
    expect(emptyPlantForm()).not.toHaveProperty('planY');
    const values = formToPlantValues(plantRowToForm(planned));
    expect(values).not.toHaveProperty('planX');
    expect(values).not.toHaveProperty('planY');
    expect(plantRowToForm({ ...planned, planSizeCm: 80 })).not.toHaveProperty('planSizeCm');
    expect(values).not.toHaveProperty('planSizeCm');
  });
});

describe('emptyPlantForm', () => {
  it('has a key for every field', () => {
    const form = emptyPlantForm();
    for (const f of PLANT_FIELDS.filter((field) => !field.noForm)) {
      expect(form).toHaveProperty(f.key);
    }
  });

  it('blanks imageUrls to an empty array', () => {
    expect(emptyPlantForm().imageUrls).toEqual([]);
  });
});

describe('searchResultToForm(null) vs emptyPlantForm()', () => {
  it('differs only on fields a search result never carries', () => {
    // searchResultToForm(null) is form-shaped on purpose: a screen merges a
    // suggestion pick straight in with `setForm((f) => ({ ...f, ...normalizeToForm(result) }))`,
    // so every field it does return must already match emptyPlantForm()'s
    // representation (e.g. '' rather than null for a numeric TextInput).
    const search = searchResultToForm(null);
    const empty = emptyPlantForm();

    // zoneId and createdAt are not part of a search result at all, so a merge
    // leaves whatever the form already had for them.
    expect(search.zoneId).toBeUndefined();
    expect(search.createdAt).toBeUndefined();
    expect(empty.zoneId).toBeNull();
    expect(empty.createdAt).toBe('');

    const shared = Object.keys(search);
    for (const key of shared) {
      expect(search[key]).toEqual(empty[key]);
    }
  });
});

describe('plantInsertValues', () => {
  it('defaults the six enum fields to unknown (never a guessed fact) when the plant only has a name', () => {
    // Ticket 046: a plant created with just a name must not come out the
    // other end looking like the user chose "Mi-ombre" / "Moyen" / etc.
    const { columns, values } = plantInsertValues({ name: 'x' });
    const at = (key) => values[columns.indexOf(key)];

    expect(at('type')).toBe('unknown');
    expect(at('sun')).toBe('unknown');
    expect(at('water')).toBe('unknown');
    expect(at('bloomAbundance')).toBe('unknown');
    expect(at('soilType')).toBe('unknown');
    expect(at('soilPH')).toBe('unknown');
    expect(at('toxicity')).toBe('unknown');
    expect(typeof at('createdAt')).toBe('string');
    expect(at('createdAt').length).toBeGreaterThan(0);
  });
});

describe('unknown enum values round-trip through the form', () => {
  it('searchResultToForm maps an unknown/absent search value to unknown, never a guess', () => {
    const form = searchResultToForm({
      sun: 'not-a-real-value',
      water: undefined,
      bloom_abundance: 'overwhelming',
    });
    expect(form.bloomAbundance).toBe('unknown');
    expect(form.sun).toBe('unknown');
    expect(form.water).toBe('unknown');
    expect(form.type).toBe('unknown');
  });

  it('formToPlantValues(plantRowToForm(row)) keeps unknown as unknown', () => {
    const row = {
      id: 'p1',
      name: 'Mystère',
      type: 'unknown',
      sun: 'unknown',
      water: 'unknown',
      soilType: 'unknown',
      soilPH: 'unknown',
      toxicity: 'unknown',
    };
    const values = formToPlantValues(plantRowToForm(row));
    expect(values.type).toBe('unknown');
    expect(values.sun).toBe('unknown');
    expect(values.water).toBe('unknown');
    expect(values.soilType).toBe('unknown');
    expect(values.soilPH).toBe('unknown');
    expect(values.toxicity).toBe('unknown');
  });
});

describe('imageUrls', () => {
  it('searchResultToForm keeps the https image_urls from a search result', () => {
    const form = searchResultToForm({
      image_urls: ['https://a.example/1.jpg', 'https://a.example/2.jpg'],
    });
    expect(form.imageUrls).toEqual(['https://a.example/1.jpg', 'https://a.example/2.jpg']);
  });

  it('searchResultToForm drops non-https entries', () => {
    const form = searchResultToForm({
      image_urls: ['https://ok.example/1.jpg', 'http://insecure.example/2.jpg', 42],
    });
    expect(form.imageUrls).toEqual(['https://ok.example/1.jpg']);
  });

  it('formToPlantValues JSON-stringifies a non-empty array', () => {
    const values = formToPlantValues({
      ...emptyPlantForm(),
      imageUrls: ['https://a.example/1.jpg'],
    });
    expect(values.imageUrls).toBe(JSON.stringify(['https://a.example/1.jpg']));
  });

  it('formToPlantValues writes null for an empty array', () => {
    const values = formToPlantValues({ ...emptyPlantForm(), imageUrls: [] });
    expect(values.imageUrls).toBeNull();
  });

  it('plantRowToForm parses the stored JSON column back into an array', () => {
    const form = plantRowToForm({
      name: 'Rose',
      imageUrls: JSON.stringify(['https://a.example/1.jpg']),
    });
    expect(form.imageUrls).toEqual(['https://a.example/1.jpg']);
  });

  it('plantRowToForm drops an invalid JSON column', () => {
    const form = plantRowToForm({ name: 'Rose', imageUrls: 'not json' });
    expect(form.imageUrls).toEqual([]);
  });

  it('plantRowToForm drops a JSON column that is not an array', () => {
    const form = plantRowToForm({ name: 'Rose', imageUrls: JSON.stringify({ foo: 'bar' }) });
    expect(form.imageUrls).toEqual([]);
  });
});

describe('parseImageUrls', () => {
  it('returns [] for null/undefined/empty string', () => {
    expect(parseImageUrls(null)).toEqual([]);
    expect(parseImageUrls(undefined)).toEqual([]);
    expect(parseImageUrls('')).toEqual([]);
  });

  it('returns [] for invalid JSON', () => {
    expect(parseImageUrls('{not json')).toEqual([]);
  });

  it('returns [] for JSON that is not an array', () => {
    expect(parseImageUrls(JSON.stringify({ a: 1 }))).toEqual([]);
  });

  it('filters out non-https entries', () => {
    const value = JSON.stringify(['https://a.example/1.jpg', 'http://b.example/2.jpg', 3, null]);
    expect(parseImageUrls(value)).toEqual(['https://a.example/1.jpg']);
  });

  it('returns every https entry', () => {
    const urls = ['https://a.example/1.jpg', 'https://a.example/2.jpg'];
    expect(parseImageUrls(JSON.stringify(urls))).toEqual(urls);
  });
});

describe('pickPlantUpdates', () => {
  const { pickPlantUpdates, formToPlantValues, emptyPlantForm } = require('../plantFields');

  it('rejects a key that is not a plant column', () => {
    expect(() => pickPlantUpdates({ name: 'Rose', 'name = 1; --': 'x' })).toThrow(
      'Unknown plant field'
    );
  });

  it('keeps known keys and skips undefined values', () => {
    expect(pickPlantUpdates({ name: 'Rose', notes: undefined, height: null })).toEqual([
      ['name', 'Rose'],
      ['height', null],
    ]);
  });

  it('accepts everything the edit form produces', () => {
    expect(() =>
      pickPlantUpdates(formToPlantValues({ ...emptyPlantForm(), name: 'x' }))
    ).not.toThrow();
  });
});
