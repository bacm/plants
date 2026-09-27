/**
 * lib/plantSheet.js decides what app/plant/[id].js shows for a plant's
 * enum-backed fields: a filled tile per real value, and the labels of the
 * fields still unset for the "À compléter" prompt (ticket 046 — a default
 * value must never be presented on the sheet as if the user chose it).
 */
const {
  ficheTechniqueTiles,
  ficheTechniqueMissing,
  solTiles,
  solMissing,
} = require('../plantSheet');

const BLANK_PLANT = {
  sun: 'unknown',
  water: 'unknown',
  soilType: 'unknown',
  soilPH: 'unknown',
  bloomStartMonth: null,
  bloomEndMonth: null,
  height: null,
  width: null,
  minTemperature: null,
  deciduous: null,
  flowerColor: '',
};

const FILLED_PLANT = {
  ...BLANK_PLANT,
  sun: 'full_sun',
  water: 'medium',
  soilType: 'loamy',
  soilPH: 'neutral',
  bloomStartMonth: 5,
  bloomEndMonth: 7,
  height: 150,
  width: 100,
  minTemperature: -10,
  deciduous: false,
  flowerColor: 'rose',
};

describe('ficheTechniqueTiles / ficheTechniqueMissing', () => {
  it('a plant with only a name has no filled tiles and lists all six as missing', () => {
    expect(ficheTechniqueTiles(BLANK_PLANT)).toEqual([]);
    expect(ficheTechniqueMissing(BLANK_PLANT)).toEqual([
      'Exposition',
      'Arrosage',
      'Floraison',
      'Rusticité',
      'Feuillage',
      'Couleur',
    ]);
  });

  it('a fully described plant has six filled tiles and nothing missing', () => {
    const tiles = ficheTechniqueTiles(FILLED_PLANT);
    expect(tiles).toHaveLength(6);
    expect(tiles.map((t) => t.label)).toEqual([
      'Exposition',
      'Arrosage',
      'Floraison',
      'Rusticité',
      'Feuillage',
      'Couleur',
    ]);
    expect(ficheTechniqueMissing(FILLED_PLANT)).toEqual([]);
  });

  it('every filled tile carries a non-empty icon and value', () => {
    for (const tile of ficheTechniqueTiles(FILLED_PLANT)) {
      expect(tile.icon.length).toBeGreaterThan(0);
      expect(tile.value.length).toBeGreaterThan(0);
    }
  });

  it("the exposure tile uses full_sun/partial/shade's own icon", () => {
    const sunTile = (plant) => ficheTechniqueTiles(plant).find((t) => t.key === 'sun');
    expect(sunTile({ ...BLANK_PLANT, sun: 'full_sun' }).icon).toBe('☀');
    expect(sunTile({ ...BLANK_PLANT, sun: 'partial' }).icon).toBe('⛅');
    expect(sunTile({ ...BLANK_PLANT, sun: 'shade' }).icon).toBe('☁');
  });

  it('a partially described plant only shows the filled tiles', () => {
    const plant = { ...BLANK_PLANT, sun: 'shade', flowerColor: 'blanc' };
    const tiles = ficheTechniqueTiles(plant);
    expect(tiles.map((t) => t.key).sort()).toEqual(['flowerColor', 'sun']);
    expect(ficheTechniqueMissing(plant)).toEqual([
      'Arrosage',
      'Floraison',
      'Rusticité',
      'Feuillage',
    ]);
  });
});

describe('solTiles / solMissing', () => {
  it('a plant with unknown soil has no tiles and both fields missing', () => {
    expect(solTiles(BLANK_PLANT)).toEqual([]);
    expect(solMissing(BLANK_PLANT)).toEqual(['Type de sol', 'pH du sol']);
  });

  it('a plant with a known soil type and pH has two filled tiles', () => {
    const tiles = solTiles(FILLED_PLANT);
    expect(tiles).toHaveLength(2);
    expect(solMissing(FILLED_PLANT)).toEqual([]);
  });
});
