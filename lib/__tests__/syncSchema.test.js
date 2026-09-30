/**
 * server/sync_schema.json is the server's allow-list of columns per synced
 * table (ticket 092). It must mirror the app's TABLE_COLUMNS plus `deletedAt`,
 * or the server would reject (or never know about) a newly added field.
 */
const fs = require('fs');
const path = require('path');
const { TABLE_COLUMNS } = require('../backupFormat');
const { SYNCED_TABLES } = require('../syncFields');

const schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'server', 'sync_schema.json'), 'utf8')
);

describe('server/sync_schema.json', () => {
  it('covers exactly the synced tables', () => {
    expect(Object.keys(schema).sort()).toEqual([...SYNCED_TABLES].sort());
  });

  it.each(SYNCED_TABLES)('%s columns match TABLE_COLUMNS + deletedAt', (table) => {
    const expected = [...TABLE_COLUMNS[table], 'deletedAt'].sort();
    const actual = [...(schema[table] ?? [])].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `server/sync_schema.json is out of date for "${table}": update server/sync_schema.json ` +
          `to [${expected.join(', ')}] (got [${actual.join(', ')}]).`
      );
    }
  });
});
