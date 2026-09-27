// Pure helpers for the dashboard hero and "Tâches du jour" list. Kept
// separate from app/(tabs)/index.js so this logic can be unit-tested without
// importing SQLite.
import { monthName } from './months';
import { plural } from './text';

/**
 * Builds the dashboard hero subtitle from the current month and counts the
 * dashboard already loads: plants blooming this month, and reminders due
 * today or overdue. Parts with a zero count are omitted; with nothing to
 * report, a short neutral phrase follows the month name.
 */
export function buildHeroSubtitle(month, bloomingCount = 0, dueCareCount = 0) {
  const name = monthName(month);
  const parts = [name];

  if (bloomingCount > 0) {
    parts.push(`${bloomingCount} ${plural(bloomingCount, 'plante en fleur', 'plantes en fleur')}`);
  }
  if (dueCareCount > 0) {
    parts.push(`${dueCareCount} ${plural(dueCareCount, 'soin', 'soins')} aujourd’hui`);
  }

  if (parts.length === 1) {
    return `${name} · Votre jardin se porte bien.`;
  }

  return parts.join(' · ');
}

function toUTCDays(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

/** Whole days `dueDateISO` is before `todayISO` (negative if not yet due). */
function daysLateFor(todayISO, dueDateISO) {
  return Math.round(toUTCDays(todayISO) - toUTCDays(dueDateISO));
}

/**
 * French label for how late a task is: "aujourd’hui" when due today or in
 * the future, "en retard d'1 jour" / "en retard de N jours" otherwise.
 */
export function latenessLabel(daysLate) {
  if (daysLate <= 0) return 'aujourd’hui';
  if (daysLate === 1) return "en retard d'1 jour";
  return `en retard de ${daysLate} ${plural(daysLate, 'jour', 'jours')}`;
}

/**
 * Groups due/overdue `reminders` by kind + due date, so the dashboard can
 * show "Arroser 4 plantes" instead of four identical cards. Each group is
 * `{ kind, dueDate, daysLate, reminders }`. Groups are ordered overdue-first
 * (most late first), then today's groups, matching the order the dashboard
 * wants tasks to draw attention in; within the same lateness, groups are
 * ordered by kind (fr locale) for a stable list.
 */
export function groupDueTasks(reminders, todayISO = new Date().toISOString().slice(0, 10)) {
  const groups = new Map();
  for (const r of reminders ?? []) {
    const key = `${r.kind}|${r.nextDueDate}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        kind: r.kind,
        dueDate: r.nextDueDate,
        daysLate: daysLateFor(todayISO, r.nextDueDate),
        reminders: [],
      };
      groups.set(key, group);
    }
    group.reminders.push(r);
  }
  return Array.from(groups.values()).sort((a, b) => {
    if (b.daysLate !== a.daysLate) return b.daysLate - a.daysLate;
    return a.kind.localeCompare(b.kind, 'fr');
  });
}
