// Pure grouping of a plant's photos by month for app/plant/[id].js's Photos
// tab (ticket 067): newest month first, each photo's own order (already
// newest-first from lib/db.js/db.web.js's getPhotosByPlantId) preserved
// inside its group. No react-native import, so it can be unit-tested without
// SQLite.
import { monthName } from './months';

/**
 * Groups `photos` (each with a 'YYYY-MM-DD' `date`) by calendar month.
 * Returns `[{ key: 'YYYY-MM', title: 'Septembre 2026', photos }]`, ordered
 * newest month first. A photo with a missing or malformed date is dropped
 * rather than crashing the grouping.
 */
export function groupPhotosByMonth(photos) {
  const groups = new Map();
  for (const photo of photos ?? []) {
    const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(photo?.date ?? '');
    if (!match) continue;
    const [, year, month] = match;
    const key = `${year}-${month}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, title: `${monthName(Number(month))} ${year}`, photos: [] };
      groups.set(key, group);
    }
    group.photos.push(photo);
  }
  return Array.from(groups.values()).sort((a, b) => b.key.localeCompare(a.key));
}
