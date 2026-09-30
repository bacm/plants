// "Synchronisé il y a 2 min" (ticket 094): a French relative time for an ISO
// stamp. Pure; `now` is a Date (or ms) so tests do not depend on the clock.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTimeFr(iso, now = new Date()) {
  const then = new Date(iso).getTime();
  if (!iso || Number.isNaN(then)) return null;
  const diff = new Date(now).getTime() - then;
  if (diff < MINUTE) return 'à l’instant';
  if (diff < HOUR) return `il y a ${Math.floor(diff / MINUTE)} min`;
  if (diff < DAY) return `il y a ${Math.floor(diff / HOUR)} h`;
  if (diff < 2 * DAY) return 'hier';
  return `il y a ${Math.floor(diff / DAY)} j`;
}
