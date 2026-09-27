/**
 * Garden Manager — Design system
 * Premium, sensual, botanical. Dark mode first.
 */

export const colors = {
  dark: {
    background: '#1C1917',
    surface: '#292524',
    surfaceGlass: 'rgba(41,37,36,0.85)',
    text: '#FAFAF9',
    textSecondary: '#A8A29E',
    accent: '#6B9B7A',
    accentSoft: '#5A7D62',
    rose: '#8B7355',
    lavender: '#7D6B8A',
    sage: '#6B7D5E',
    peony: '#8B6B6B',
    gradientStart: '#2C2825',
    gradientEnd: '#1C1917',
    cardShadow: 'rgba(0,0,0,0.3)',
    border: 'rgba(250,250,249,0.08)',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  full: 9999,
};

// Use system fonts; load Playfair/Inter via expo-font for full editorial feel
export const typography = {
  display: { fontWeight: '700', fontSize: 28, letterSpacing: -0.5 },
  displaySmall: { fontWeight: '600', fontSize: 22 },
  title: { fontWeight: '600', fontSize: 18 },
  body: { fontWeight: '400', fontSize: 16 },
  bodySmall: { fontWeight: '400', fontSize: 14 },
  caption: { fontWeight: '500', fontSize: 12 },
  label: { fontWeight: '500', fontSize: 14 },
};

// Maps a free-text flower color (French) to a swatch hex. Falls back to
// accentSoft when the color is set but not recognised, and to sage when
// there is no color at all.
export function colorHex(color) {
  if (!color) return colors.dark.sage;
  const c = color.toLowerCase();
  const map = {
    rose: '#C9A9A6',
    rouge: '#B85450',
    blanc: '#E8E4DF',
    jaune: '#D4B854',
    bleu: '#6B8BAA',
    violet: '#B8A9C9',
    vert: '#6B9B7A',
    orange: '#C98B5A',
  };
  for (const [k, v] of Object.entries(map)) {
    if (c.includes(k)) return v;
  }
  return colors.dark.accentSoft;
}

export const shadow = {
  soft: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
};
