/**
 * normalizeToForm is the boundary where untrusted model output becomes form state
 * that will be written to the database. It is pure, so it is cheap to pin down.
 */
const { normalizeToForm } = require('../plantSearch');

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
    expect(form.bloomStartMonth).toBeNull();
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
    expect(form.bloomStartMonth).toBe(5);
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
