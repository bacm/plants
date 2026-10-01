// A plant's size on the plan and where it comes from (ticket 115). Pure.
//
// Order: a size set by hand in the bubble (`planSizeCm`), else the width of
// the latest measurement (`measuredWidthCm`, `measuredAt`: lib/db's getPlants),
// else nothing (the plan draws its default dot). A new measurement with a width
// clears `planSizeCm` (lib/db createCareLog) so the measurement takes over.

import { DEFAULT_PLAN_SIZE_CM } from './gardenPlan';

function positive(value) {
  return typeof value === 'number' && value > 0;
}

/** `{ cm, source: 'manual' | 'measured' | 'default', measuredAt }` for a plant row. */
export function effectivePlanSize(plant) {
  if (positive(plant?.planSizeCm)) {
    return { cm: plant.planSizeCm, source: 'manual', measuredAt: null };
  }
  if (positive(plant?.measuredWidthCm)) {
    return { cm: plant.measuredWidthCm, source: 'measured', measuredAt: plant.measuredAt ?? null };
  }
  return { cm: DEFAULT_PLAN_SIZE_CM, source: 'default', measuredAt: null };
}

/** The size to draw the plant's dot with (null when it has none, so the default applies). */
export function planSizeOf(plant) {
  const { cm, source } = effectivePlanSize(plant);
  return source === 'default' ? null : cm;
}

/** Bubble subtitle under "Taille sur le plan": null when there is nothing to say. */
export function planSizeSourceText(size, formatDate) {
  if (size.source === 'manual') return 'réglée sur le plan';
  if (size.source === 'measured' && size.measuredAt)
    return `mesurée le ${formatDate(size.measuredAt)}`;
  if (size.source === 'measured') return 'mesurée';
  return null;
}
