// Pure helpers for the dashboard hero. Kept separate from app/(tabs)/index.js
// so the subtitle text can be unit-tested without importing SQLite.
import { monthName } from './months';

function pluralize(count, singular, plural) {
  return count === 1 ? singular : plural;
}

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
    parts.push(
      `${bloomingCount} ${pluralize(bloomingCount, 'plante en fleur', 'plantes en fleur')}`
    );
  }
  if (dueCareCount > 0) {
    parts.push(`${dueCareCount} ${pluralize(dueCareCount, 'soin', 'soins')} aujourd’hui`);
  }

  if (parts.length === 1) {
    return `${name} · Votre jardin se porte bien.`;
  }

  return parts.join(' · ');
}
