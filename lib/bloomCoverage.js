// Pure derivation of the garden's bloom coverage across the 12 months, used
// by ticket 024's year view on the bloom tab (app/(tabs)/bloom.js). Ticket
// 029 will add a second, "observed" band computed from actual photo/log
// dates -- keep bloomCoverage's per-month shape ({ month, plantIds }) as the
// thing a second band gets added next to, not folded into this module now.
//
// Ticket 090: a plant whose bloom is "insignificant" (a maple's) stays in the
// bloom lists but sorts last and never counts toward garden coverage or gaps.
import { isMonthInRange } from './months';

/** True when the plant's bloom is declared insignificant (ticket 090). */
export function isMinorBloom(plant) {
  return plant?.bloomAbundance === 'insignificant';
}

/** New array with showy blooms first and minor ones after; otherwise stable. */
export function showyFirst(plants) {
  const list = plants ?? [];
  return [...list.filter((p) => !isMinorBloom(p)), ...list.filter(isMinorBloom)];
}

/**
 * Months (1-12) a plant's declared bloom range covers, wrap-aware. Returns
 * [] when the plant has no declared range.
 */
export function bloomMonthsOf(plant) {
  if (!plant) return [];
  const { bloomStartMonth: start, bloomEndMonth: end } = plant;
  if (start == null || end == null) return [];
  const months = [];
  for (let month = 1; month <= 12; month += 1) {
    if (isMonthInRange(month, start, end)) months.push(month);
  }
  return months;
}

/**
 * The contiguous bands a plant's declared bloom range draws on a 12-month
 * row (ticket 050): one `{ start, end }` for an in-year range, two for a
 * range that wraps the year (Dec–Mar -> Jan–Mar and Dec–Dec). [] when the
 * plant has no declared range.
 */
export function bloomSegments(plant) {
  if (!plant) return [];
  const { bloomStartMonth: start, bloomEndMonth: end } = plant;
  if (start == null || end == null) return [];
  if (start <= end) return [{ start, end }];
  return [
    { start: 1, end },
    { start, end: 12 },
  ];
}

/**
 * One entry per calendar month (1-12, in order), each listing the ids of
 * plants whose declared bloom range covers it. Minor (insignificant) blooms
 * are ignored (ticket 090).
 */
export function bloomCoverage(plants) {
  const coverage = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, plantIds: [] }));
  for (const plant of plants ?? []) {
    if (isMinorBloom(plant)) continue;
    for (const month of bloomMonthsOf(plant)) {
      coverage[month - 1].plantIds.push(plant.id);
    }
  }
  return coverage;
}

/**
 * Months (1-12) with no showy bloom at all (minor blooms do not count,
 * ticket 090). Only meaningful once at least one non-minor plant has a
 * declared range -- an empty garden, or one where no plant has bloom months
 * set, returns [] rather than claiming all 12 months are gaps.
 */
export function bloomGaps(plants) {
  const list = (plants ?? []).filter((p) => !isMinorBloom(p));
  if (list.length === 0) return [];
  const hasAnyRange = list.some((p) => bloomMonthsOf(p).length > 0);
  if (!hasAnyRange) return [];
  return bloomCoverage(list)
    .filter((entry) => entry.plantIds.length === 0)
    .map((entry) => entry.month);
}
