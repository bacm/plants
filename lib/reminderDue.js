// Pure due-date phrasing for a reminder card (app/plant/[id].js's Actions
// tab, via components/plant/ActionsTab.js): "Dans N jours · 30 sept.",
// "Aujourd’hui" or "En retard de N jours". Day arithmetic is done in UTC,
// like lib/dates.js, to avoid the west-of-Greenwich day-rollback bug a local
// Date would introduce. Kept separate from lib/dashboard.js's
// daysLateFor/latenessLabel: those only ever report lateness for reminders
// already known to be due, never a future countdown.
import { monthShort } from './months';

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
