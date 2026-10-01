// The first sync of an existing garden (ticket 096). Pure: the store and api are
// injected like in lib/sync.js. Until `sync.firstCompletedAt` is set, the
// phone does not sync by itself: the user starts it from Réglages, sees its
// progress, and it only counts as done once the server's counts equal the
// phone's.
//
// `store` adds to lib/sync.js's: getLocalSyncCounts() ->
//   { rows: {table: n}, photoFiles, pendingUploads }
// `api` adds: stats() -> { status, data: { rows: {table: n}, photoFiles } }
import { SYNCED_TABLES } from './syncFields';
import { runSync } from './sync';

export const FIRST_STARTED_KEY = 'sync.firstStartedAt';
export const FIRST_COMPLETED_KEY = 'sync.firstCompletedAt';

export const TABLE_LABELS = {
  zones: 'Zones',
  garden_plan: 'Plan du jardin',
  plan_features: 'Éléments du plan',
  plants: 'Plantes',
  care_logs: 'Soins',
  reminders: 'Rappels',
  photos: 'Lignes de photos',
  unsorted_photos: 'Photos à trier',
  bloom_observations: 'Observations de floraison',
};

// 1240 -> "1 240" (no-break space: it must not wrap inside a number).
export function formatCount(n) {
  return String(Math.max(0, Math.round(Number(n) || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function plural(n, singular, pluralForm = `${singular}s`) {
  return `${formatCount(n)} ${n > 1 ? pluralForm : singular}`;
}

/** "Envoi des photos… 124 / 480", from runSync's onProgress payload. */
export function progressText(progress) {
  if (!progress) return 'Préparation…';
  const { phase, done, total } = progress;
  const counts = total > 0 ? ` ${formatCount(done)} / ${formatCount(total)}` : '';
  if (phase === 'push') return `Envoi des plantes et zones…${counts}`;
  if (phase === 'photos') return `Envoi des photos…${counts}`;
  return 'Récupération…';
}

function sumRows(rows) {
  return SYNCED_TABLES.reduce((sum, table) => sum + (rows?.[table] ?? 0), 0);
}

/**
 * Server counts against the phone's. Resolves
 * `{ ok, differences: string[], items, photos }` (items and photos are the
 * phone's totals, the ones shown when everything matches).
 */
export function compareCounts(server, local) {
  const differences = [];
  for (const table of SYNCED_TABLES) {
    const remote = server?.rows?.[table] ?? 0;
    const here = local.rows?.[table] ?? 0;
    if (remote !== here) {
      differences.push(`${TABLE_LABELS[table]} — serveur : ${remote}, téléphone : ${here}`);
    }
  }
  const remotePhotos = server?.photoFiles ?? 0;
  if (remotePhotos !== local.photoFiles) {
    differences.push(`Serveur : ${plural(remotePhotos, 'photo')}, téléphone : ${local.photoFiles}`);
  }
  return {
    ok: differences.length === 0,
    differences,
    items: sumRows(local.rows),
    photos: local.photoFiles,
  };
}

export function doneMessage({ items, photos }) {
  return `Tout est sur le serveur : ${plural(items, 'élément')} et ${plural(photos, 'photo')}.`;
}

function failure(status, message, differences = [], kind) {
  return { status, message, differences, kind };
}

/**
 * The whole first sync: run the normal pass with progress, then the final
 * check. Resolves `{ status: 'done' | 'error' | 'mismatch', message,
 * differences, kind }`. Only 'done' sets `sync.firstCompletedAt`.
 */
export async function runFirstSync({
  store,
  api,
  now = () => new Date().toISOString(),
  onProgress,
}) {
  if (!(await store.getSetting(FIRST_STARTED_KEY))) {
    await store.setSetting(FIRST_STARTED_KEY, now());
  }
  const summary = await runSync({ store, api, now, onProgress });
  if (summary.error) return failure('error', summary.error.message, [], summary.error.kind);

  const local = await store.getLocalSyncCounts();
  if (local.pendingUploads > 0) {
    const n = local.pendingUploads;
    return failure('mismatch', 'Toutes les photos ne sont pas encore envoyées.', [
      `${plural(n, 'photo pas encore envoyée', 'photos pas encore envoyées')} : le serveur ne les a pas encore acceptées.`,
    ]);
  }
  let res;
  try {
    res = await api.stats();
  } catch (e) {
    return failure('error', e.message, [], e.kind);
  }
  if (res.status === 401) {
    return failure('error', 'Session expirée — reconnectez-vous', [], 'unauthorized');
  }
  if (res.status < 200 || res.status >= 300 || !res.data) {
    return failure('error', 'Erreur du serveur — nouvel essai plus tard', [], 'server');
  }
  const result = compareCounts(res.data, local);
  if (!result.ok) {
    return failure(
      'mismatch',
      'Le serveur et le téléphone ne contiennent pas la même chose.',
      result.differences
    );
  }
  await store.setSetting(FIRST_COMPLETED_KEY, now());
  return { status: 'done', message: doneMessage(result), differences: [] };
}

/**
 * What the Réglages block shows. `startedAt` is the stored setting, `running`
 * and `progress` the live state, `result` the last runFirstSync outcome.
 */
export function firstSyncView({ startedAt, running, progress, result }) {
  const failed = Boolean(result) && result.status !== 'done';
  return {
    title: 'Première synchronisation',
    text: running
      ? progressText(progress)
      : 'Copie tout votre jardin et ses photos sur le serveur. À faire en Wi-Fi : les photos pèsent lourd.',
    lines: !running && failed ? [result.message, ...result.differences] : [],
    hint:
      !running && (startedAt || failed) ? 'Ce qui a déjà été envoyé ne sera pas renvoyé.' : null,
    primaryLabel: failed
      ? 'Réessayer'
      : startedAt
        ? 'Reprendre la première synchronisation'
        : 'Lancer la première synchronisation',
    showActions: !running,
  };
}
