module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.js'],
  // Native modules (expo-sqlite) cannot load under Jest, so lib/db.js is not
  // imported by any test. Tests cover pure logic and static invariants; see
  // lib/__tests__/db-parity.test.js for how the SQLite layer is guarded.
  collectCoverageFrom: ['lib/**/*.js', '!lib/**/__tests__/**'],
};
