/**
 * Ticket 052: one MaterialCommunityIcons set replaces every emoji used as an
 * icon (components/Icon.js). Two things must stay true as the app grows:
 * every icon name referenced anywhere actually exists in the font's glyph
 * map, and no new emoji sneaks back in as a stand-in icon outside the
 * user-chosen ZONE_ICONS/DEFAULT_ZONE_ICON in lib/enums.js.
 */
const fs = require('fs');
const path = require('path');
const glyphMap = require('../../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json');
const { PLANT_TYPES, SUN, WATER, CARE_TYPES, OBSERVATION_TYPES } = require('../enums');
const { ficheTechniqueTiles, solTiles } = require('../plantSheet');

const FILLED_PLANT = {
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

describe('icon names exist in the MaterialCommunityIcons glyph map', () => {
  const enumIcons = [
    ...PLANT_TYPES.map((e) => e.icon).filter(Boolean),
    ...SUN.map((e) => e.icon).filter(Boolean),
    ...WATER.map((e) => e.icon).filter(Boolean),
    ...CARE_TYPES.map((e) => e.icon).filter(Boolean),
    ...OBSERVATION_TYPES.map((e) => e.icon).filter(Boolean),
  ];

  for (const name of enumIcons) {
    it(`enum icon "${name}" is a real MaterialCommunityIcons glyph`, () => {
      expect(glyphMap).toHaveProperty(name);
    });
  }

  // Sun/shade/soil can also fall back to full_sun/low's own icon (see
  // lib/plantSheet.js), so a plant with every value set exercises the
  // actual set of names shown on the sheet, not just the enum's own list.
  const sheetIcons = [...ficheTechniqueTiles(FILLED_PLANT), ...solTiles(FILLED_PLANT)].map(
    (t) => t.icon
  );

  for (const name of sheetIcons) {
    it(`plant sheet icon "${name}" is a real MaterialCommunityIcons glyph`, () => {
      expect(glyphMap).toHaveProperty(name);
    });
  }
});

// Files that legitimately keep an emoji: the zone icon picker's own choices
// (lib/enums.js's ZONE_ICONS/DEFAULT_ZONE_ICON, user-chosen data rather than
// an app icon) and this test suite itself.
const EMOJI_ALLOWED_FILES = new Set([path.join('lib', 'enums.js')]);

function collectJsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(rel, out);
    } else if (entry.name.endsWith('.js')) {
      out.push(rel);
    }
  }
  return out;
}

describe('no emoji used as an icon outside lib/enums.js', () => {
  const root = path.join(__dirname, '..', '..');
  const dirs = ['app', 'components', 'lib'];
  const files = dirs
    .map((d) => path.join(root, d))
    .flatMap((d) => collectJsFiles(d))
    .map((f) => path.relative(root, f))
    .filter((f) => !f.includes(`${path.sep}__tests__${path.sep}`))
    .filter((f) => !EMOJI_ALLOWED_FILES.has(f));

  for (const file of files) {
    it(`${file} has no emoji`, () => {
      const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n');
      const offenders = [];
      lines.forEach((line, i) => {
        const matches = line.match(/\p{Extended_Pictographic}/gu);
        if (matches) offenders.push(`line ${i + 1}: ${matches.join(' ')}`);
      });
      expect(offenders).toEqual([]);
    });
  }
});
