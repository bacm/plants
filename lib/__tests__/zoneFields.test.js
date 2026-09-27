/**
 * lib/zoneFields.js is the allowlist updateZone builds its SET clause from
 * (lib/db.js) or applies to the stored zone (lib/db.web.js). pickZoneUpdates
 * must reject any key outside that list rather than silently dropping it —
 * mirrors pickPlantUpdates in lib/plantFields.js.
 */
const { ZONE_FIELDS, pickZoneUpdates } = require('../zoneFields');

describe('ZONE_FIELDS / pickZoneUpdates', () => {
  it('lists exactly the editable zone columns', () => {
    expect(ZONE_FIELDS).toEqual(['name', 'description', 'icon', 'orderIndex']);
  });

  it('picks only the defined keys with a value', () => {
    const entries = pickZoneUpdates({ name: 'Front bed', icon: '🌱', description: undefined });
    expect(entries).toEqual([
      ['name', 'Front bed'],
      ['icon', '🌱'],
    ]);
  });

  it('returns an empty list when nothing is provided', () => {
    expect(pickZoneUpdates({})).toEqual([]);
  });

  it('throws on an unknown key instead of dropping it', () => {
    expect(() => pickZoneUpdates({ zoneId: 'x' })).toThrow('Unknown zone field: zoneId');
  });
});
