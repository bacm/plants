// Observed bloom history (ticket 029): folds a plant's bloom observations
// ({ id, plantId, date: 'YYYY-MM-DD', kind: 'open' | 'end' }) into seasons and
// compares a season's start with the previous year's. Pure; dates are plain
// 'YYYY-MM-DD' strings handled in UTC.
import { addYearsISO } from './dates';
import { plural } from './text';

// Two sightings further apart than this belong to different seasons.
export const SEASON_GAP_DAYS = 60;

function toUTCDays(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

function diffDays(aISO, bISO) {
  return Math.round(toUTCDays(aISO) - toUTCDays(bISO));
}

export function bloomSeasons(observations, todayISO) {
  const sorted = [...(observations ?? [])].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.kind === b.kind) return 0;
    return a.kind === 'open' ? -1 : 1;
  });

  const work = [];
  for (const obs of sorted) {
    const current = work[work.length - 1];
    const usable = current && !current.closed;
    if (obs.kind === 'open') {
      if (usable && diffDays(obs.date, current.last) <= SEASON_GAP_DAYS) {
        current.last = obs.date;
        current.lastObservationId = obs.id;
      } else {
        work.push({
          start: obs.date,
          last: obs.date,
          endDate: null,
          closed: false,
          lastObservationId: obs.id,
        });
      }
    } else if (
      obs.kind === 'end' &&
      usable &&
      obs.date >= current.start &&
      diffDays(obs.date, current.last) <= SEASON_GAP_DAYS
    ) {
      current.endDate = obs.date;
      current.closed = true;
      current.lastObservationId = obs.id;
    }
  }

  return work.map((s, i) => ({
    start: s.start,
    end: s.closed ? s.endDate : s.last,
    closed: s.closed,
    ongoing: i === work.length - 1 && !s.closed && diffDays(todayISO, s.last) <= SEASON_GAP_DAYS,
    lastObservationId: s.lastObservationId,
  }));
}

export function seasonShift(season, seasons) {
  const target = addYearsISO(season.start, -1);
  if (!target) return null;
  let best = null;
  let bestDist = Infinity;
  for (const other of seasons) {
    if (other.start >= season.start) continue;
    const dist = Math.abs(diffDays(other.start, target));
    if (dist <= SEASON_GAP_DAYS && dist < bestDist) {
      best = other;
      bestDist = dist;
    }
  }
  if (!best) return null;
  return {
    days: diffDays(season.start, addYearsISO(best.start, 1)),
    previousStart: best.start,
  };
}

export function shiftLabel(days, previousYear) {
  if (days === 0) return `même date qu'en ${previousYear}`;
  const n = Math.abs(days);
  const word = days < 0 ? 'plus tôt' : 'plus tard';
  return `${n} ${plural(n, 'jour', 'jours')} ${word} qu'en ${previousYear}`;
}
