/**
 * lib/enums.js is the single source of truth for every plant-related enum's
 * values and labels, and lib/months.js for month names. This test pins the
 * two invariants that matter: every enum value has a non-empty label (so
 * adding a value without its label fails the build), and PLANT_FIELDS'
 * enum `values` match the enum they describe rather than a second copy.
 */
const {
  PLANT_TYPES,
  SUN,
  WATER,
  BLOOM_ABUNDANCE,
  CARE_TYPES,
  OBSERVATION_TYPES,
  REMINDER_KINDS,
  SOIL_TYPES,
  SOIL_PH,
  PROPAGATION,
  TOXICITY,
  UNKNOWN,
  ZONE_ICONS,
  DEFAULT_ZONE_ICON,
  zoneIconFor,
  enumValues,
  isUnknown,
  choices,
  toggleChip,
} = require('../enums');
const { PLANT_FIELDS } = require('../plantFields');
const { MONTH_NAMES, MONTH_SHORT, monthName, monthShort } = require('../months');
const { colors } = require('../theme');
const glyphMap = require('../../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json');

const ENUMS = {
  PLANT_TYPES,
  SUN,
  WATER,
  BLOOM_ABUNDANCE,
  CARE_TYPES,
  OBSERVATION_TYPES,
  REMINDER_KINDS,
  SOIL_TYPES,
  SOIL_PH,
  PROPAGATION,
  TOXICITY,
};

describe('enums', () => {
  for (const [name, list] of Object.entries(ENUMS)) {
    it(`every value in ${name} has a non-empty label`, () => {
      expect(list.length).toBeGreaterThan(0);
      for (const entry of list) {
        expect(typeof entry.value).toBe('string');
        expect(entry.value.length).toBeGreaterThan(0);
        expect(typeof entry.label).toBe('string');
        expect(entry.label.length).toBeGreaterThan(0);
      }
    });
  }

  it('every enum-kind PLANT_FIELDS field has values matching its enum', () => {
    const byKey = {
      type: PLANT_TYPES,
      sun: SUN,
      water: WATER,
      bloomAbundance: BLOOM_ABUNDANCE,
      soilType: SOIL_TYPES,
      soilPH: SOIL_PH,
      toxicity: TOXICITY,
    };
    const enumFields = PLANT_FIELDS.filter((f) => f.kind === 'enum');
    expect(enumFields.length).toBeGreaterThan(0);
    for (const field of enumFields) {
      const expected = byKey[field.key];
      expect(expected).toBeDefined();
      expect(field.values).toEqual(enumValues(expected));
    }
  });

  it('propagation field values match the PROPAGATION enum', () => {
    const propagation = PLANT_FIELDS.find((f) => f.key === 'propagation');
    expect(propagation.values).toEqual(enumValues(PROPAGATION));
  });
});

// Ticket 046: type/sun/water/soilType/soilPH/toxicity default to 'unknown'
// rather than a guessed value, so each of their enums must carry a label for
// it (used wherever a screen chooses to spell out "no data" explicitly).
const UNKNOWN_ENUMS = { PLANT_TYPES, SUN, WATER, BLOOM_ABUNDANCE, SOIL_TYPES, SOIL_PH, TOXICITY };

describe('the unknown sentinel', () => {
  for (const [name, list] of Object.entries(UNKNOWN_ENUMS)) {
    it(`${name} has a labelled 'unknown' entry`, () => {
      const entry = list.find((e) => e.value === UNKNOWN);
      expect(entry).toBeDefined();
      expect(entry.label.length).toBeGreaterThan(0);
    });
  }

  it('isUnknown treats the sentinel, null, and empty string as no data', () => {
    expect(isUnknown(UNKNOWN)).toBe(true);
    expect(isUnknown(null)).toBe(true);
    expect(isUnknown(undefined)).toBe(true);
    expect(isUnknown('')).toBe(true);
    expect(isUnknown('full_sun')).toBe(false);
  });

  it('choices() excludes the unknown entry, keeping every real value', () => {
    for (const list of Object.values(UNKNOWN_ENUMS)) {
      const filtered = choices(list);
      expect(filtered.some((e) => e.value === UNKNOWN)).toBe(false);
      expect(filtered.length).toBe(list.length - 1);
    }
  });

  it('toggleChip clears back to unknown when the tapped chip is already selected', () => {
    expect(toggleChip('full_sun', 'full_sun')).toBe(UNKNOWN);
    expect(toggleChip('full_sun', 'shade')).toBe('shade');
    expect(toggleChip(UNKNOWN, 'shade')).toBe('shade');
  });
});

describe('zoneIconFor', () => {
  for (const emoji of ZONE_ICONS) {
    it(`maps ${emoji} to a real MaterialCommunityIcons glyph and a colors key`, () => {
      const { icon, tint } = zoneIconFor(emoji);
      expect(glyphMap).toHaveProperty(icon);
      expect(colors).toHaveProperty(tint);
    });
  }

  it('falls back to the DEFAULT_ZONE_ICON mapping for an unknown or missing emoji', () => {
    const fallback = zoneIconFor(DEFAULT_ZONE_ICON);
    expect(zoneIconFor('🚀')).toEqual(fallback);
    expect(zoneIconFor(null)).toEqual(fallback);
    expect(zoneIconFor(undefined)).toEqual(fallback);
  });

  it('maps every ZONE_ICONS emoji to a distinct glyph, so the picker never shows two identical circles', () => {
    const glyphs = ZONE_ICONS.map((emoji) => zoneIconFor(emoji).icon);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });
});

describe('months', () => {
  it('MONTH_NAMES and MONTH_SHORT each have 12 entries', () => {
    expect(MONTH_NAMES).toHaveLength(12);
    expect(MONTH_SHORT).toHaveLength(12);
  });

  it('monthName returns the full name for valid months', () => {
    expect(monthName(1)).toBe('Janvier');
    expect(monthName(12)).toBe('Décembre');
  });

  it('monthShort returns the short name for valid months', () => {
    expect(monthShort(1)).toBe('Jan');
    expect(monthShort(12)).toBe('Déc');
  });

  it('monthName and monthShort return empty string for invalid input', () => {
    for (const bad of [0, 13, null, 'x']) {
      expect(monthName(bad)).toBe('');
      expect(monthShort(bad)).toBe('');
    }
  });
});
