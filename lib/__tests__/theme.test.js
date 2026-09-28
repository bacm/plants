import { colors } from '../theme';

// WCAG 2.x relative luminance / contrast ratio, per
// https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
function relativeLuminance(hex) {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const linear = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [lr, lg, lb] = [r, g, b].map(linear);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrastRatio(a, b) {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('Herbier palette contrast', () => {
  it('text reaches 4.5:1 on background and surface', () => {
    expect(contrastRatio(colors.text, colors.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.text, colors.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('textSecondary reaches 4.5:1 on background and surface', () => {
    expect(contrastRatio(colors.textSecondary, colors.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.textSecondary, colors.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('#fff reaches 4.5:1 on accent, accentSoft and danger', () => {
    expect(contrastRatio('#FFFFFF', colors.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#FFFFFF', colors.accentSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#FFFFFF', colors.danger)).toBeGreaterThanOrEqual(4.5);
  });

  it('danger reaches 4.5:1 on background', () => {
    expect(contrastRatio(colors.danger, colors.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('has no dark variant', () => {
    expect(colors.dark).toBeUndefined();
  });
});
