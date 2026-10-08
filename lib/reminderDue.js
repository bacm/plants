// Pure due-date phrasing for a reminder card (app/plant/[id].js's Actions
// tab, via components/plant/ActionsTab.js): "Dans N jours · 30 sept.",
// "Aujourd’hui" or "En retard de N jours". Day arithmetic is done in UTC,
// like lib/dates.js, to avoid the west-of-Greenwich day-rollback bug a local
// Date would introduce. Kept separate from lib/dashboard.js's
// daysLateFor/latenessLabel: those only ever report lateness for reminders
// already known to be due, never a future countdown.
import { monthShort } from './months';
import { addDaysISO, addYearsISO } from './dates';

function toUTCDays(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

/**
 * Whole days from `todayISO` to `dueDateISO`: positive when due in the
 * future, 0 when due today, negative when overdue.
 */
export function daysUntil(dueDateISO, todayISO = new Date().toISOString().slice(0, 10)) {
  return Math.round(toUTCDays(dueDateISO) - toUTCDays(todayISO));
}

function shortDate(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${Number(d)} ${monthShort(Number(m)).toLowerCase()}.`;
}

/**
 * The due-line for a reminder card: `{ text, overdue }`. `overdue` is true
 * for today or a past due date, driving the terracotta styling; false for a
 * future date.
 */
export function reminderDueText(dueDateISO, todayISO = new Date().toISOString().slice(0, 10)) {
  const days = daysUntil(dueDateISO, todayISO);
  if (days === 0) return { text: 'Aujourd’hui', overdue: true };
  if (days > 0) {
    const noun = days === 1 ? 'jour' : 'jours';
    return { text: `Dans ${days} ${noun} · ${shortDate(dueDateISO)}`, overdue: false };
  }
  const late = -days;
  const noun = late === 1 ? 'jour' : 'jours';
  return { text: `En retard de ${late} ${noun}`, overdue: true };
}

/**
 * Next due date after a reminder is done on `todayISO` ('YYYY-MM-DD'), or null
 * when it cannot be computed. A 'yearly' reminder keeps its calendar date and
 * moves forward a year at a time until strictly after today (at least once);
 * any other reminder is due again `frequencyDays` after today.
 */
export function nextDueAfterDone(reminder, todayISO) {
  if (reminder.repeatRule === 'yearly') {
    let next = reminder.nextDueDate || todayISO;
    do {
      next = addYearsISO(next, 1);
      if (!next) return null;
    } while (next <= todayISO);
    return next;
  }
  const days = reminder.frequencyDays;
  if (!Number.isInteger(days) || days <= 0) return null;
  return addDaysISO(todayISO, days);
}

/**
 * Due date after postponing a reminder by `days` (ticket 131): counted from
 * the later of its current due date and today, so postponing an overdue
 * reminder never leaves it still overdue. ISO dates compare as strings.
 */
export function postponedDueDate(nextDueDateISO, days, todayISO) {
  const base = nextDueDateISO && nextDueDateISO > todayISO ? nextDueDateISO : todayISO;
  return addDaysISO(base, days);
}

export const REMINDER_UPDATE_KEYS = ['frequencyDays', 'nextDueDate'];

/**
 * Allowlist check for updateReminder (CLAUDE.md rule 5): returns the
 * [column, value] pairs to write, and throws on any key not in
 * REMINDER_UPDATE_KEYS so a caller-supplied key never reaches SQL.
 */
export function pickReminderUpdates(changes) {
  const entries = Object.entries(changes || {});
  for (const [key] of entries) {
    if (!REMINDER_UPDATE_KEYS.includes(key)) {
      throw new Error(`Champ de rappel inconnu : ${key}`);
    }
  }
  if (entries.length === 0) throw new Error('Aucune modification');
  return entries;
}
