// Pure range logic for MonthRangePicker: what tapping a month cell does to
// a { start, end } range, what visual state each cell should render, and
// the one-line summary text under the picker. No react-native import so
// this stays testable under Jest and reusable outside the component.
import { isMonthInRange, monthName } from './months';

/**
 * Next { start, end } after tapping `tapped`, from the current range.
 * - no start yet: start the range at `tapped`.
 * - start set, no end: close the range at `tapped` (tapping the start month
 *   again gives a single-month range; tapping a month earlier than start
 *   wraps the range across the year boundary).
 * - both set: start over at `tapped`.
 */
export function nextRange({ start, end }, tapped) {
  if (start == null) return { start: tapped, end: null };
  if (end == null) return { start, end: tapped };
  return { start: tapped, end: null };
}

/**
 * Visual state of `month` (1-12) given the current { start, end } range:
 * 'none' | 'start' | 'end' | 'single' | 'inside'.
 */
export function cellState(month, { start, end }) {
  if (start == null) return 'none';
  if (end == null) return month === start ? 'start' : 'none';
  if (start === end) return month === start ? 'single' : 'none';
  if (month === start) return 'start';
  if (month === end) return 'end';
  return isMonthInRange(month, start, end) ? 'inside' : 'none';
}

/** "Mai → Septembre" / "Mai" (single month) / "Aucune période" (no start). */
export function rangeSummary({ start, end }) {
  if (start == null) return 'Aucune période';
  if (end == null || start === end) return monthName(start);
  return `${monthName(start)} → ${monthName(end)}`;
}
