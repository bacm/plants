// Pure derivation of seasonal garden tasks (pruning, harvest, deadheading,
// winter prep) from each plant's own stored care data. Shared by ticket 022
// (yearly reminder suggestions on a plant's reminders screen) and ticket 031
// (the dashboard's "Ce mois-ci au jardin" list) so the two features can never
// disagree about what a task is for a given plant/month. Task labels live in
// lib/enums.js's REMINDER_KINDS (CLAUDE.md rule 4): every task kind below is
// also a valid REMINDER_KINDS value.

import { isMonthInRange } from './months';

// Northern hemisphere: winter preparation is suggested in October.
export const WINTER_PREP_MONTH = 10;

// Order tasks appear in within a month, and the one place a task kind maps
// to a care-log type (lib/enums.js CARE_TYPES) and a reminder kind
// (lib/enums.js REMINDER_KINDS).
const KIND_ORDER = ['prune', 'harvest', 'deadhead', 'winter_prep'];

const CARE_TYPE_BY_KIND = {
  prune: 'pruned',
  harvest: 'harvested',
  deadhead: 'deadheaded',
  winter_prep: 'winterized',
};

// Every task kind is also a valid REMINDER_KINDS value, so a suggested
// reminder can be created directly with `kind: task.kind`. Kept as an
// explicit map (rather than assumed identity) so the wiring is named once,
// here, instead of re-derived at each call site.
const REMINDER_KIND_BY_KIND = {
  prune: 'prune',
  harvest: 'harvest',
  deadhead: 'deadhead',
  winter_prep: 'winter_prep',
};

/** Care-log `type` a done task of this kind is logged as, or null. */
export function careTypeForKind(kind) {
  return CARE_TYPE_BY_KIND[kind] ?? null;
}

/** REMINDER_KINDS value a suggested reminder for this task kind uses, or null. */
export function reminderKindForKind(kind) {
  return REMINDER_KIND_BY_KIND[kind] ?? null;
}

function kindOrder(kind) {
  return KIND_ORDER.indexOf(kind);
}

function taskFor(plant, kind, month) {
  return { plantId: plant.id, plantName: plant.name, kind, month };
}

/**
 * One task per plant/kind that applies to `month` (1-12), across every plant
 * in `plants`. Stable order: kind (prune, harvest, deadhead, winter_prep),
 * then plant name (fr locale).
 */
export function deriveSeasonalTasks(plants, month) {
  const tasks = [];
  for (const plant of plants ?? []) {
    if (plant.pruningMonth === month) tasks.push(taskFor(plant, 'prune', month));
    if (isMonthInRange(month, plant.harvestMonthStart, plant.harvestMonthEnd)) {
      tasks.push(taskFor(plant, 'harvest', month));
    }
    if (plant.bloomEndMonth === month) tasks.push(taskFor(plant, 'deadhead', month));
    if (plant.winterCare && month === WINTER_PREP_MONTH) {
      tasks.push(taskFor(plant, 'winter_prep', month));
    }
  }
  return tasks.sort((a, b) => {
    const kindDiff = kindOrder(a.kind) - kindOrder(b.kind);
    if (kindDiff !== 0) return kindDiff;
    return a.plantName.localeCompare(b.plantName, 'fr');
  });
}

/**
 * Yearly reminder suggestions for one plant: one `{ kind, month }` per rule
 * that applies, independent of any particular "current" month — used to
 * offer "accept this as a yearly reminder" on the plant's reminders screen.
 * Harvest uses its start month only (a reminder recurs on one date a year);
 * deadhead uses bloomEndMonth.
 */
export function seasonalRemindersFor(plant) {
  if (!plant) return [];
  const suggestions = [];
  if (plant.pruningMonth) suggestions.push({ kind: 'prune', month: plant.pruningMonth });
  if (plant.harvestMonthStart) {
    suggestions.push({ kind: 'harvest', month: plant.harvestMonthStart });
  }
  if (plant.bloomEndMonth) suggestions.push({ kind: 'deadhead', month: plant.bloomEndMonth });
  if (plant.winterCare) suggestions.push({ kind: 'winter_prep', month: WINTER_PREP_MONTH });
  return suggestions.sort((a, b) => kindOrder(a.kind) - kindOrder(b.kind));
}

/**
 * Watering reminder suggestion for a plant that has none yet (ticket 045).
 * Unlike `seasonalRemindersFor`, this is not month-bound: it recurs every 7
 * days from today, matching what `app/plant/new.js` used to create
 * automatically. `existingReminders` is the plant's own reminder list; the
 * suggestion is withheld once a `water` reminder already exists, so this is
 * safe to call unconditionally from the reminders screen alongside the
 * seasonal suggestions.
 */
export function wateringSuggestionFor(plant, existingReminders) {
  if (!plant) return null;
  if ((existingReminders ?? []).some((r) => r.kind === 'water')) return null;
  return { kind: 'water', frequencyDays: 7 };
}

/**
 * Whether a care log already covers `task` for its plant in `year`: a log of
 * the mapped care type, dated in that task's month within that year.
 */
export function isTaskDone(task, careLogs, year) {
  const careType = careTypeForKind(task.kind);
  if (!careType) return false;
  const prefix = `${year}-${String(task.month).padStart(2, '0')}`;
  return (careLogs ?? []).some(
    (log) => log.plantId === task.plantId && log.type === careType && log.date?.startsWith(prefix)
  );
}

/**
 * ISO date (YYYY-MM-DD) for the next 1st of `month`: this year if that date
 * hasn't passed yet, otherwise next year. Seeds a newly-accepted yearly
 * reminder's first `nextDueDate`.
 */
export function nextOccurrenceOfMonthStart(
  month,
  todayISO = new Date().toISOString().slice(0, 10)
) {
  const year = Number(todayISO.slice(0, 4));
  const mm = String(month).padStart(2, '0');
  const candidate = `${year}-${mm}-01`;
  return candidate >= todayISO ? candidate : `${year + 1}-${mm}-01`;
}
