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
