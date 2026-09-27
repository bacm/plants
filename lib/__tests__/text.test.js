const { plural } = require('../text');

describe('plural', () => {
  it('returns the singular form for a count of one', () => {
    expect(plural(1, 'jour', 'jours')).toBe('jour');
  });

  it('follows French rules: 0 and 1 are singular, 2 and more plural', () => {
    expect(plural(0, 'jour', 'jours')).toBe('jour');
    expect(plural(-1, 'jour', 'jours')).toBe('jour');
    expect(plural(2, 'jour', 'jours')).toBe('jours');
  });
});
