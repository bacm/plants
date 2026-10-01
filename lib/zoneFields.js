// Single definition of the zone fields a caller may update. updateZone builds
// its SET clause from these keys (lib/db.js) or its store-mutation keys
// (lib/db.web.js), so they must never come from the caller unchecked. Unknown
// keys throw rather than being dropped, mirroring pickPlantUpdates in
// lib/plantFields.js.

const ZONE_FIELDS = ['name', 'description', 'icon', 'orderIndex', 'polygon'];
// polygon (ticket 105): JSON string of [x, y] integer-cm points, null = not drawn.

function pickZoneUpdates(updates) {
  const entries = [];
  for (const [key, value] of Object.entries(updates)) {
    if (!ZONE_FIELDS.includes(key)) throw new Error(`Unknown zone field: ${key}`);
    // An outline must be validated first: setZonePolygon is its only writer.
    if (key === 'polygon') throw new Error('Use setZonePolygon to change a zone outline');
    if (value !== undefined) entries.push([key, value]);
  }
  return entries;
}

export { ZONE_FIELDS, pickZoneUpdates };
