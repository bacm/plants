const { buildHeroSubtitle } = require('../dashboard');

describe('buildHeroSubtitle', () => {
  it('shows an empty garden with just the month and a neutral phrase', () => {
    expect(buildHeroSubtitle(9, 0, 0)).toBe('Septembre · Votre jardin se porte bien.');
  });

  it('uses singular forms for a count of one', () => {
    expect(buildHeroSubtitle(9, 1, 1)).toBe('Septembre · 1 plante en fleur · 1 soin aujourd’hui');
  });

  it('uses plural forms for counts above one', () => {
    expect(buildHeroSubtitle(9, 3, 2)).toBe('Septembre · 3 plantes en fleur · 2 soins aujourd’hui');
  });

  it('omits the bloom part when there is nothing blooming', () => {
    expect(buildHeroSubtitle(9, 0, 2)).toBe('Septembre · 2 soins aujourd’hui');
  });

  it('omits the care part when nothing is due', () => {
    expect(buildHeroSubtitle(9, 3, 0)).toBe('Septembre · 3 plantes en fleur');
  });

  it('returns an empty month name for an invalid month', () => {
    expect(buildHeroSubtitle(13, 0, 0)).toBe(' · Votre jardin se porte bien.');
  });
});
