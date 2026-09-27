/**
 * Date arithmetic done in UTC, on purpose: constructing a Date from a
 * 'YYYY-MM-DD' string parses it as UTC midnight, but Date#setDate() shifts
 * it in local time. West of Greenwich that silently rolls the date back a
 * day. Building the result with Date.UTC(...) avoids that mismatch.
 */
export function addDaysISO(isoDate, days) {
  if (typeof isoDate !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  if (typeof days !== 'number' || !Number.isFinite(days) || !Number.isInteger(days)) return null;

  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) + days));
  if (isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
}

/**
 * Same month/day `years` later, for a 'yearly' reminder's recurrence
 * (lib/db.js's markReminderDone). Feb 29 in a leap year lands on Feb 28 in a
 * target year that isn't one, rather than overflowing into March the way
 * `new Date(Date.UTC(y, 1, 29))` would.
 */
export function addYearsISO(isoDate, years) {
  if (typeof isoDate !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  if (typeof years !== 'number' || !Number.isFinite(years) || !Number.isInteger(years)) return null;

  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);

  // Reject a source date that isn't a real calendar date (Date.UTC would
  // otherwise silently roll it over, e.g. day 31 in April).
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  const targetYear = year + years;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
  const targetDay = Math.min(day, daysInTargetMonth);
  const date = new Date(Date.UTC(targetYear, month - 1, targetDay));
  if (isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
}
