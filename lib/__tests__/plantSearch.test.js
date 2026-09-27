/**
 * normalizeToForm is the boundary where untrusted model output becomes form state
 * that will be written to the database. It is pure, so it is cheap to pin down.
 */
const { normalizeToForm, classifySearchFailure, searchErrorMessage } = require('../plantSearch');

describe('normalizeToForm', () => {
  it('returns a complete blank form for null input', () => {
    const form = normalizeToForm(null);
    expect(form.name).toBe('');
    expect(form.type).toBe('perennial');
    expect(form.sun).toBe('partial');
    expect(form.water).toBe('medium');
    expect(form.soilType).toBe('loamy');
    expect(form.soilPH).toBe('neutral');
    expect(form.toxicity).toBe('none');
    expect(form.bloomStartMonth).toBe('');
    expect(form.propagation).toBeNull();
  });

  it('maps a well-formed search result onto form fields', () => {
    const form = normalizeToForm({
      common_name: 'Rose de Damas',
      scientific_name: 'Rosa damascena',
      type: 'shrub',
      sun: 'full_sun',
      water: 'medium',
      flower_color: 'rose',
      bloom_start: 5,
      bloom_end: 7,
      height: 150,
      width: 120,
      deciduous: true,
      min_temperature: -15,
      soil_type: 'loamy',
      soil_ph: 'neutral',
      propagation: 'cutting',
      toxicity: 'none',
      description: 'Rosier ancien très parfumé.',
    });

    expect(form.name).toBe('Rose de Damas');
    expect(form.latinName).toBe('Rosa damascena');
    expect(form.type).toBe('shrub');
    expect(form.bloomStartMonth).toBe('5');
    expect(form.deciduous).toBe(true);
    expect(form.propagation).toBe('cutting');
    expect(form.notes).toBe('Rosier ancien très parfumé.');
  });

  it('stringifies numeric fields, because the form inputs are TextInputs', () => {
    const form = normalizeToForm({ height: 150, width: 120, min_temperature: -15 });
    expect(form.height).toBe('150');
    expect(form.width).toBe('120');
    expect(form.minTemperature).toBe('-15');
  });

  it('falls back to safe defaults when the model returns values outside the enums', () => {
    // The model is prompted for specific enum values but is not constrained to
    // them; an unmapped value must never reach a NOT NULL column.
    const form = normalizeToForm({
      type: 'carnivorous',
      sun: 'moonlight',
      water: 'torrential',
      soil_type: 'volcanic',
      soil_ph: 'caustic',
      propagation: 'telepathy',
      toxicity: 'mildly cursed',
    });

    expect(form.type).toBe('perennial');
    expect(form.sun).toBe('partial');
    expect(form.water).toBe('medium');
    expect(form.soilType).toBe('loamy');
    expect(form.soilPH).toBe('neutral');
    expect(form.propagation).toBeNull();
    expect(form.toxicity).toBe('none');
  });

  it('coerces a missing height to an empty string rather than "undefined"', () => {
    // `details.height?.toString() || ''` must not leak the string "undefined"
    // into a numeric column.
    const form = normalizeToForm({ common_name: 'Sans dimensions' });
    expect(form.height).toBe('');
    expect(form.width).toBe('');
    expect(form.minTemperature).toBe('');
  });
});

describe('classifySearchFailure', () => {
  it('classifies 429 as rate_limited', () => {
    expect(classifySearchFailure({ status: 429 })).toBe('rate_limited');
  });

  it('classifies 503 as daily_limit', () => {
    expect(classifySearchFailure({ status: 503 })).toBe('daily_limit');
  });

  it('classifies other non-2xx statuses as unavailable', () => {
    expect(classifySearchFailure({ status: 500 })).toBe('unavailable');
    expect(classifySearchFailure({ status: 404 })).toBe('unavailable');
  });

  it('classifies a TypeError (network failure) as offline', () => {
    expect(classifySearchFailure({ error: new TypeError('Network request failed') })).toBe('offline');
  });

  it('classifies missing config (no status, no error) as unavailable', () => {
    expect(classifySearchFailure({})).toBe('unavailable');
  });
});

describe('searchErrorMessage', () => {
  it('returns a distinct French message per kind', () => {
    expect(searchErrorMessage('rate_limited')).toMatch(/trop de recherches/i);
    expect(searchErrorMessage('daily_limit')).toMatch(/indisponible pour aujourd.hui/i);
    expect(searchErrorMessage('unavailable')).toMatch(/indisponible/i);
    expect(searchErrorMessage('offline')).toMatch(/connexion internet/i);
    expect(searchErrorMessage('config')).toMatch(/non configurée/i);
  });
});

describe('searchPlants', () => {
  const ORIGINAL_URL = process.env.EXPO_PUBLIC_PLANT_API_URL;

  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_PLANT_API_URL = 'https://api.example.test';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env.EXPO_PUBLIC_PLANT_API_URL = ORIGINAL_URL;
    delete global.fetch;
  });

  it('returns mapped plants on success', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ plants: [{ common_name: 'Rose', scientific_name: 'Rosa' }] }),
    });
    const { searchPlants } = require('../plantSearch');

    const results = await searchPlants('rose');
    expect(results).toHaveLength(1);
    expect(results[0].common_name).toBe('Rose');
  });

  it('returns an empty array when the service genuinely finds nothing', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ plants: [] }),
    });
    const { searchPlants } = require('../plantSearch');

    const results = await searchPlants('zzzznotaplant');
    expect(results).toEqual([]);
  });

  it('throws a PlantSearchError with kind rate_limited on a 429', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 429 });
    const { searchPlants, PlantSearchError } = require('../plantSearch');

    await expect(searchPlants('rose')).rejects.toThrow(PlantSearchError);
    try {
      await searchPlants('rose');
      throw new Error('expected searchPlants to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PlantSearchError);
      expect(err.kind).toBe('rate_limited');
    }
  });

  it('throws a PlantSearchError with kind offline when fetch rejects', async () => {
    global.fetch.mockRejectedValue(new TypeError('Network request failed'));
    const { searchPlants, PlantSearchError } = require('../plantSearch');

    try {
      await searchPlants('rose');
      throw new Error('expected searchPlants to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PlantSearchError);
      expect(err.kind).toBe('offline');
    }
  });

  it('throws a PlantSearchError with kind config when the API URL is missing', async () => {
    delete process.env.EXPO_PUBLIC_PLANT_API_URL;
    const { searchPlants, PlantSearchError } = require('../plantSearch');

    try {
      await searchPlants('rose');
      throw new Error('expected searchPlants to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PlantSearchError);
      expect(err.kind).toBe('config');
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
