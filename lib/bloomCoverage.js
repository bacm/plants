// Pure derivation of the garden's bloom coverage across the 12 months, used
// by ticket 024's year view on the bloom tab (app/(tabs)/bloom.js). Ticket
// 029 will add a second, "observed" band computed from actual photo/log
// dates -- keep bloomCoverage's per-month shape ({ month, plantIds }) as the
// thing a second band gets added next to, not folded into this module now.
import { isMonthInRange } from './months';

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
 * One entry per calendar month (1-12, in order), each listing the ids of
 * plants whose declared bloom range covers it.
 */
export function bloomCoverage(plants) {
  const coverage = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, plantIds: [] }));
  for (const plant of plants ?? []) {
    for (const month of bloomMonthsOf(plant)) {
      coverage[month - 1].plantIds.push(plant.id);
    }
  }
  return coverage;
}

/**
 * Months (1-12) with no bloom at all. Only meaningful once at least one
 * plant has a declared range -- an empty garden, or one where no plant has
 * bloom months set, returns [] rather than claiming all 12 months are gaps.
 */
export function bloomGaps(plants) {
  const list = plants ?? [];
  if (list.length === 0) return [];
  const hasAnyRange = list.some((p) => bloomMonthsOf(p).length > 0);
  if (!hasAnyRange) return [];
  return bloomCoverage(list)
    .filter((entry) => entry.plantIds.length === 0)
    .map((entry) => entry.month);
}
