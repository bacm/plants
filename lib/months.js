// Full French month names, index 0 = janvier. This is the single source of
// truth for month names: no screen should declare its own MONTHS array.
export const MONTH_NAMES = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

// Short form used by pickers and compact labels, index 0 = janvier.
export const MONTH_SHORT = [
  'Jan',
  'Fév',
  'Mar',
  'Avr',
  'Mai',
  'Juin',
  'Juil',
  'Août',
  'Sep',
  'Oct',
  'Nov',
  'Déc',
];

// Single-letter form for a 12-cell row (MonthRangePicker), index 0 = janvier.
export const MONTH_LETTERS = MONTH_SHORT.map((short) => short[0]);

function isValidMonth(m) {
  return Number.isInteger(m) && m >= 1 && m <= 12;
}

/** Full month name for a 1-12 month value, or '' for anything else. */
export function monthName(m) {
  return isValidMonth(m) ? MONTH_NAMES[m - 1] : '';
}

/** Short month name for a 1-12 month value, or '' for anything else. */
export function monthShort(m) {
  return isValidMonth(m) ? MONTH_SHORT[m - 1] : '';
}

/**
 * Whether month `m` falls within a bloom/harvest range that may wrap the
 * year (e.g. November to February). When start <= end the range is a
 * normal in-year span; when start > end it wraps, so a month matches if
 * it is on either side of the year boundary.
 */
export function isMonthInRange(month, start, end) {
  if (start == null || end == null) return false;
  for (const value of [month, start, end]) {
    if (!Number.isInteger(value) || value < 1 || value > 12) return false;
  }
  return start <= end ? month >= start && month <= end : month >= start || month <= end;
}
