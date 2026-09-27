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
