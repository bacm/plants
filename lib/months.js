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

// Abbreviation with its full stop as in a journal date ("12 sept."), index 0
// = janvier. Lower case; `MONTH_SHORT` is the capitalised picker form.
export const MONTH_ABBR = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

// Single-letter form for a 12-cell row (MonthRangePicker), index 0 = janvier.
export const MONTH_LETTERS = MONTH_SHORT.map((short) => short[0]);

// Full French day names, index 0 = dimanche (matches Date#getDay()).
export const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

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

/** Lower-case abbreviation ("sept.") for a 1-12 month value, or '' for anything else. */
export function monthAbbr(m) {
  return isValidMonth(m) ? MONTH_ABBR[m - 1] : '';
}

/**
 * Dashboard header eyebrow (ticket 066): e.g. "Mardi 29 septembre" -- day
 * name capitalised, month name lower-case, using `date`'s local date parts.
 */
export function longDateLabel(date) {
  const day = DAY_NAMES[date.getDay()];
  const month = MONTH_NAMES[date.getMonth()].toLowerCase();
  return `${day} ${date.getDate()} ${month}`;
}

/**
 * "YYYY-MM-DD" (a longer ISO string is fine) as "29 septembre 2026"; anything
 * that is not an ISO date comes back unchanged.
 */
export function isoDateLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return iso ?? '';
  const month = monthName(Number(m[2]));
  if (!month) return iso;
  return `${Number(m[3])} ${month.toLowerCase()} ${m[1]}`;
}

/** "YYYY-MM-DD" as a short journal date ("12 avr."); anything else comes back unchanged. */
export function shortDateLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return iso ?? '';
  const abbr = monthAbbr(Number(m[2]));
  if (!abbr) return iso;
  return `${Number(m[3])} ${abbr}`;
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
