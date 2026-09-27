// Pure validation helpers for month and date form fields. Screens call these
// instead of parsing text themselves, so the care-log form, the photo-date
// modal and the plant form all reject the same malformed input the same way.

import { PLANT_FIELDS } from './plantFields';

function isBlank(text) {
  return text == null || String(text).trim() === '';
}

/**
 * Parses a month field's raw text/number. Empty input is valid (means
 * "unset"); anything else must be an integer 1-12.
 * Returns { value: 1-12 | null, error: string | null }.
 */
export function parseMonth(text) {
  if (isBlank(text)) return { value: null, error: null };
  const trimmed = String(text).trim();
  if (!/^\d{1,2}$/.test(trimmed)) return { value: null, error: 'Mois entre 1 et 12' };
  const n = parseInt(trimmed, 10);
  if (n < 1 || n > 12) return { value: null, error: 'Mois entre 1 et 12' };
  return { value: n, error: null };
}

/**
 * Parses a 'YYYY-MM-DD' date string. Empty input is valid (means "unset");
 * anything else must match the format and be a real calendar date.
 * Returns { value: 'YYYY-MM-DD' | null, error: string | null }.
 */
export function parseISODate(text) {
  if (isBlank(text)) return { value: null, error: null };
  const trimmed = String(text).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return { value: null, error: 'Date au format AAAA-MM-JJ' };

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!isRealDate) return { value: null, error: 'Date au format AAAA-MM-JJ' };

  return { value: trimmed, error: null };
}

function checkMonthPair(form, errors, startKey, endKey) {
  const startBlank = isBlank(form[startKey]);
  const endBlank = isBlank(form[endKey]);
  if (startBlank === endBlank) return;
  if (startBlank && !errors[startKey]) errors[startKey] = 'Indiquez aussi le mois de début';
  if (endBlank && !errors[endKey]) errors[endKey] = 'Indiquez aussi le mois de fin';
}

/**
 * Validates every month field and createdAt on a plant form. Returns a map
 * of fieldKey -> error message; empty object when the form is valid.
 */
export function validatePlantForm(form) {
  const errors = {};

  for (const f of PLANT_FIELDS) {
    if (f.month) {
      const { error } = parseMonth(form[f.key]);
      if (error) errors[f.key] = error;
    } else if (f.kind === 'date') {
      const { error } = parseISODate(form[f.key]);
      if (error) errors[f.key] = error;
    }
  }

  checkMonthPair(form, errors, 'bloomStartMonth', 'bloomEndMonth');
  checkMonthPair(form, errors, 'harvestMonthStart', 'harvestMonthEnd');

  return errors;
}
