/**
 * Garden Manager — Design system
 * Light, botanical "Herbier": paper background, moss and sprout greens,
 * Fraunces display type over Instrument Sans body text. Light-only by
 * decision (ticket 063, which replaces 003's earlier dark-only choice); a
 * dark variant would be a separate ticket.
 */

export const colors = {
  background: '#F4F1EA',
  surface: '#FFFFFF',
  surfaceGlass: '#FFFFFF',
  text: '#1F2A22',
  textSecondary: '#5E6B61',
  accent: '#2F5D3A',
  accentSoft: '#4A7556',
  highlight: '#D5EDA8',
  softGreen: '#EEF5E0',
  blush: '#E9D6D0',
  terracotta: '#B4532A',
  sage: '#6B7D5E',
  gradientStart: '#EDE8DC',
  gradientEnd: '#F4F1EA',
  border: '#E4DFD3',
  danger: '#A3402F',
  // Light sage for an inactive tab bar icon on the ink pill background
  // (ticket 064) -- too pale a tint of `sage` to name generically.
  onInkMuted: '#C9D2C4',
  // Track behind the plant detail screen's Info/Photos/Actions segmented
  // control (ticket 067) -- a warm neutral between `border` and `background`.
  track: '#E9E4D8',
  // Exposition / Arrosage tile backgrounds on the plant detail Info tab
  // (ticket 067): a warm sun tint and a cool water tint, each just saturated
  // enough to read as its own color next to `softGreen` and `blush`.
  sun: '#FBEFD9',
  water: '#DDE8F0',
  // Hairline between task rows on the dashboard's "Tâches du jour" card
  // (ticket 066) -- lighter than `border`, just enough to separate rows on
  // white.
  divider: '#F0ECE2',
  // Outline of the round "Marquer fait" button on a task row (ticket 066) --
  // a stronger neutral than `border` so the button reads on white.
  borderStrong: '#CFC8B8',
  // 90%-opaque white for the flower-colour tag overlaid on a bloom photo
  // (ticket 066).
  tagOverlay: 'rgba(255,255,255,0.9)',
  // PlantStrip's `variant="dark"` (ticket 071, used on the camera screen's
  // dark bottom bar): a translucent light chip/avatar background, its
  // border, and a muted light label colour, all readable over a dark panel
  // without a solid light surface.
  onDarkChipBg: 'rgba(244,241,234,0.16)',
  onDarkBorder: 'rgba(244,241,234,0.28)',
  onDarkMuted: 'rgba(244,241,234,0.72)',
  // `colors.text` at ~75% opacity for the "À trier" screen's "i / N" photo
  // counter pill (ticket 071) -- a plain `opacity` style would also fade the
  // pill's own (already-light) label text, so this bakes the alpha into the
  // background colour instead.
  overlayDark: 'rgba(31,42,34,0.75)',
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
  md: 18,
  lg: 24,
  xl: 28,
  xxl: 32,
  full: 9999,
};

// The weight lives in the font family name (e.g. InstrumentSans_600SemiBold),
// loaded via useFonts(fonts) in app/_layout.js — see lib/fonts.js.
export const typography = {
  display: { fontFamily: 'Fraunces_400Regular', fontSize: 34, letterSpacing: -0.5 },
  displaySmall: { fontFamily: 'Fraunces_400Regular', fontSize: 24 },
  title: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 18 },
  body: { fontFamily: 'InstrumentSans_400Regular', fontSize: 16 },
  bodySmall: { fontFamily: 'InstrumentSans_400Regular', fontSize: 14 },
  caption: { fontFamily: 'InstrumentSans_500Medium', fontSize: 12 },
  label: { fontFamily: 'InstrumentSans_500Medium', fontSize: 14 },
};

// Maps a free-text flower color (French) to a swatch hex. Falls back to
// accentSoft when the color is set but not recognised, and to sage when
// there is no color at all.
export function colorHex(color) {
  if (!color) return colors.sage;
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
  return colors.accentSoft;
}

// Icon-square background for a REMINDER_KINDS value on the dashboard
// (ticket 066): each kind gets the tile colour closest to its meaning,
// falling back to `track` for anything unmapped (custom reminders).
const REMINDER_TINT_BY_KIND = {
  water: colors.water,
  prune: colors.blush,
  deadhead: colors.blush,
  fertilize: colors.softGreen,
  harvest: colors.sun,
  winter_prep: colors.water,
};

export function reminderTint(kind) {
  return REMINDER_TINT_BY_KIND[kind] ?? colors.track;
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
