// Runs once in Jest's parent process, before the test workers start, so the
// workers inherit it. Setting process.env.TZ inside a test file does NOT
// work: Jest gives each test file its own copy of process.env, so the
// timezone silently stayed the machine's own -- lib/__tests__/
// originalPhotoDate.test.js passed in Paris and failed in CI (UTC).
//
// UTC+14, no DST: any code that uses the UTC calendar date where it meant the
// local one lands on the wrong day here, whichever machine runs the tests.
module.exports = () => {
  process.env.TZ = 'Pacific/Kiritimati';
};
