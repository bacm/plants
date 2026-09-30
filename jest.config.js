module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.js'],
  // Git worktrees the tooling creates inside the repo hold a second copy of
  // every test (and of node_modules via a symlink): never collect them.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.claude/worktrees/'],
  modulePathIgnorePatterns: ['<rootDir>/.claude/worktrees/'],
  // Every run uses the same unusual timezone, see the file's comment.
  globalSetup: '<rootDir>/jest.global-setup.js',
  // Native modules (expo-sqlite) cannot load under Jest, so lib/db.js is not
  // imported by any test. Tests cover pure logic and static invariants; see
  // lib/__tests__/db-parity.test.js for how the SQLite layer is guarded.
  collectCoverageFrom: ['lib/**/*.js', '!lib/**/__tests__/**'],
};
