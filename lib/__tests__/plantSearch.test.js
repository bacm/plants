/**
 * normalizeToForm is the boundary where untrusted model output becomes form state
 * that will be written to the database. It is pure, so it is cheap to pin down.
 */
jest.mock('../db', () => ({ getApiToken: jest.fn(), getDeviceToken: jest.fn() }));

const { normalizeToForm, classifySearchFailure, searchErrorMessage } = require('../plantSearch');

describe('normalizeToForm', () => {
  it('returns a complete blank form for null input, enums unknown rather than guessed', () => {
    const form = normalizeToForm(null);
    expect(form.name).toBe('');
    expect(form.type).toBe('unknown');
    expect(form.sun).toBe('unknown');
    expect(form.water).toBe('unknown');
    expect(form.soilType).toBe('unknown');
    expect(form.soilPH).toBe('unknown');
    expect(form.toxicity).toBe('unknown');
    expect(form.bloomStartMonth).toBe('');
    expect(form.bloomAbundance).toBe('unknown');
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
      bloom_abundance: 'abundant',
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
    expect(form.bloomAbundance).toBe('abundant');
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

  it('falls back to unknown (never a guessed default) when the model returns values outside the enums', () => {
    // The model is prompted for specific enum values but is not constrained to
    // them; an unmapped value must never reach a NOT NULL column, and must not
    // be presented as a real user choice either (ticket 046).
    const form = normalizeToForm({
      type: 'carnivorous',
      sun: 'moonlight',
      water: 'torrential',
      soil_type: 'volcanic',
      soil_ph: 'caustic',
      propagation: 'telepathy',
      toxicity: 'mildly cursed',
      bloom_abundance: 'overwhelming',
    });

    expect(form.type).toBe('unknown');
    expect(form.sun).toBe('unknown');
    expect(form.water).toBe('unknown');
    expect(form.soilType).toBe('unknown');
    expect(form.soilPH).toBe('unknown');
    expect(form.propagation).toBeNull();
    expect(form.toxicity).toBe('unknown');
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
    expect(classifySearchFailure({ error: new TypeError('Network request failed') })).toBe(
      'offline'
    );
  });

  it('classifies missing config (no status, no error) as unavailable', () => {
    expect(classifySearchFailure({})).toBe('unavailable');
  });

  it('classifies 401 and 403 as unauthorized', () => {
    expect(classifySearchFailure({ status: 401 })).toBe('unauthorized');
    expect(classifySearchFailure({ status: 403 })).toBe('unauthorized');
  });
});

describe('searchErrorMessage', () => {
  it('returns a distinct French message per kind', () => {
    expect(searchErrorMessage('rate_limited')).toMatch(/trop de recherches/i);
    expect(searchErrorMessage('daily_limit')).toMatch(/indisponible pour aujourd.hui/i);
    expect(searchErrorMessage('unavailable')).toMatch(/indisponible/i);
    expect(searchErrorMessage('offline')).toMatch(/connexion internet/i);
    expect(searchErrorMessage('config')).toMatch(/non configurée/i);
    expect(searchErrorMessage('no_token')).toMatch(/connectez-vous/i);
    expect(searchErrorMessage('unauthorized')).toMatch(/accès refusé/i);
  });
});

describe('searchPlants', () => {
  const ORIGINAL_URL = process.env.EXPO_PUBLIC_PLANT_API_URL;

  beforeEach(() => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_PLANT_API_URL = 'https://api.example.test';
    global.fetch = jest.fn();
    require('../db').getApiToken.mockResolvedValue('stored-token');
    require('../db').getDeviceToken.mockResolvedValue(null);
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

  it('sends the stored token as an Authorization bearer header', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ plants: [] }),
    });
    const { searchPlants } = require('../plantSearch');

    await searchPlants('rose');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer stored-token' }),
      })
    );
  });

  it('prefers the account device token over the legacy stored token', async () => {
    require('../db').getDeviceToken.mockResolvedValue('device-token');
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ plants: [] }) });
    const { searchPlants } = require('../plantSearch');

    await searchPlants('rose');

    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer device-token');
  });

  it('on the web sends the cookie session and no Authorization header', async () => {
    const { Platform } = require('react-native');
    const original = Platform.OS;
    Platform.OS = 'web';
    try {
      global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ plants: [] }) });
      const { searchPlants } = require('../plantSearch');

      await searchPlants('rose');

      const init = global.fetch.mock.calls[0][1];
      expect(init.credentials).toBe('include');
      expect(init.headers.Authorization).toBeUndefined();
    } finally {
      Platform.OS = original;
    }
  });

  it('sends only the query', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ plants: [] }) });
    const { searchPlants } = require('../plantSearch');

    await searchPlants('rosier la fraicheur');

    expect(global.fetch.mock.calls[0][1].body).toBe('{"query":"rosier la fraicheur"}');
  });

  it('throws a PlantSearchError with kind no_token when no token is stored, without calling fetch', async () => {
    require('../db').getApiToken.mockResolvedValue(null);
    const { searchPlants, PlantSearchError } = require('../plantSearch');

    try {
      await searchPlants('rose');
      throw new Error('expected searchPlants to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PlantSearchError);
      expect(err.kind).toBe('no_token');
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('throws a PlantSearchError with kind unauthorized on a 401', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 401 });
    const { searchPlants, PlantSearchError } = require('../plantSearch');

    try {
      await searchPlants('rose');
      throw new Error('expected searchPlants to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PlantSearchError);
      expect(err.kind).toBe('unauthorized');
    }
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
