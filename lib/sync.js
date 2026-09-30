// The sync engine (ticket 094). Pure: no React Native, no storage, no fetch.
// Everything it touches is injected, so Jest drives it with an in-memory store
// and a fake api, and lib/db.js / lib/syncApi.js supply the real ones.
//
// `store` (implemented by lib/db.js):
//   getSetting(key) -> string | null              (async)
//   setSetting(key, value)
//   getRowsChangedSince(watermark) -> [{ table, row }]   rows with
//       updatedAt >= watermark (every row when null), deleted ones included
//   applyRemoteRows(changes) -> { applied }        one transaction, last write wins
//   listPhotosToUpload() / listPhotosToDownload() -> [{ table, id }]
//   readPhotoBytes(table, id) -> { bytes, mime } | null
//   markPhotoUploaded(id)
//   downloadPhoto(table, id, target) -> { status: 'ok' | <http status> | 0 }
//
// `api` (implemented by lib/syncApi.js) resolves { status, data } and throws a
// SyncError('network') when the server cannot be reached:
//   push(changes), pull(since, limit), putPhoto(id, bytes, mime),
//   downloadTarget(id) -> { url, headers }
import { TABLE_COLUMNS } from './backupFormat';
import { SYNCED_TABLES } from './syncFields';

export const PUSH_BATCH_SIZE = 500;
export const PULL_PAGE_SIZE = 500;
export const PUSHED_THROUGH_KEY = 'sync.pushedThrough';
export const PULLED_REVISION_KEY = 'sync.pulledRevision';
export const LAST_SYNC_KEY = 'sync.lastSyncAt';

export const PHOTO_TABLES = Object.freeze(['photos', 'unsorted_photos']);

export const SYNC_MESSAGES = {
  network: 'Hors ligne — nouvel essai plus tard',
  unauthorized: 'Session expirée — reconnectez-vous',
  quota: 'Espace photo plein',
  server: 'Erreur du serveur — nouvel essai plus tard',
};

export class SyncError extends Error {
  constructor(kind, message) {
    super(message ?? SYNC_MESSAGES[kind] ?? SYNC_MESSAGES.server);
    this.name = 'SyncError';
    this.kind = kind;
  }
}

function allowedColumns(table) {
  return [...TABLE_COLUMNS[table], 'deletedAt'];
}

// The row as the server accepts it: allowed columns only (never `uri`).
export function projectRow(table, row) {
  const out = {};
  for (const column of allowedColumns(table)) {
    out[column] = row[column] === undefined ? null : row[column];
  }
  return out;
}

// Rows oldest-first, cut into batches. Rows without an updatedAt cannot be
// compared by the server and are left out.
export function buildPushBatches(entries, size = PUSH_BATCH_SIZE) {
  const sorted = entries
    .filter(({ row }) => row && typeof row.updatedAt === 'string' && row.updatedAt)
    .sort((a, b) =>
      a.row.updatedAt < b.row.updatedAt ? -1 : a.row.updatedAt > b.row.updatedAt ? 1 : 0
    );
  const batches = [];
  for (let i = 0; i < sorted.length; i += size) {
    const slice = sorted.slice(i, i + size);
    const changes = {};
    for (const { table, row } of slice) {
      (changes[table] ??= []).push(projectRow(table, row));
    }
    batches.push({
      changes,
      count: slice.length,
      maxUpdatedAt: slice[slice.length - 1].row.updatedAt,
    });
  }
  return batches;
}

// A remote row reduced to the keys this app stores (server trusted, not
// blindly), with scalar values only. Returns null when it has no usable id or
// updatedAt, or the table is unknown.
export function sanitizeRemoteRow(table, remote) {
  if (!TABLE_COLUMNS[table] || !remote || typeof remote !== 'object') return null;
  if (typeof remote.id !== 'string' || !remote.id) return null;
  if (typeof remote.updatedAt !== 'string' || !remote.updatedAt) return null;
  const out = {};
  for (const column of allowedColumns(table)) {
    if (!(column in remote)) continue;
    const value = remote[column];
    if (typeof value === 'boolean') out[column] = value ? 1 : 0;
    else if (value === null || typeof value === 'string' || typeof value === 'number') {
      out[column] = value;
    }
  }
  return out;
}

/**
 * Last-write-wins decision for one pulled row. `local` is the stored row (or
 * null), `localFileExists` whether its photo file is on disk. Returns null
 * (skip: local is newer or equal, it wins and will be pushed) or
 * `{ action: 'insert' | 'replace', row, deleteFile, needsDownload }`. The row
 * keeps the REMOTE updatedAt: a pulled row is never restamped.
 */
export function planRemoteRow(table, local, remote, { localFileExists = false } = {}) {
  const row = sanitizeRemoteRow(table, remote);
  if (!row) return null;
  if (local && !(String(local.updatedAt ?? '') < row.updatedAt)) return null;
  const isPhoto = PHOTO_TABLES.includes(table);
  const deleted = row.deletedAt != null;
  return {
    action: local ? 'replace' : 'insert',
    row,
    deleteFile: isPhoto && deleted,
    needsDownload: isPhoto && !deleted && (!local || !localFileExists),
  };
}

// Tables in dependency order, for applying a pulled page.
export function orderedChanges(changes) {
  const out = [];
  for (const table of SYNCED_TABLES) {
    for (const row of changes?.[table] ?? []) out.push({ table, row });
  }
  return out;
}

function checkStatus(res) {
  if (res.status === 401) throw new SyncError('unauthorized');
  if (res.status < 200 || res.status >= 300) throw new SyncError('server');
  return res;
}

// The watermark is this device's clock only. `startedAt` is read BEFORE the
// dirty rows are queried and stored only once EVERY batch succeeded. Any local
// edit either happened before startedAt (so this run's query saw it and sent
// it) or after (so its updatedAt >= startedAt and the next run selects it).
// Pulled rows keep a REMOTE clock's updatedAt and never move the watermark, so
// a device running minutes ahead cannot hide a local edit. On failure the old
// watermark stays: the next run re-sends, and the server skips rows it has.
async function pushStep({ store, api, now }) {
  const startedAt = now();
  const watermark = await store.getSetting(PUSHED_THROUGH_KEY);
  const entries = await store.getRowsChangedSince(watermark ?? null);
  let pushed = 0;
  for (const batch of buildPushBatches(entries)) {
    checkStatus(await api.push(batch.changes));
    pushed += batch.count;
  }
  await store.setSetting(PUSHED_THROUGH_KEY, startedAt);
  return pushed;
}

// Returns { uploaded, error }. A 401 throws; everything else stops the step,
// leaving the photo pending for the next run.
async function uploadStep({ store, api }) {
  let uploaded = 0;
  const pending = await store.listPhotosToUpload();
  for (const { table, id } of pending) {
    const file = await store.readPhotoBytes(table, id);
    if (!file) continue; // file missing on this device: stays pending
    let res;
    try {
      res = await api.putPhoto(id, file.bytes, file.mime);
    } catch (e) {
      if (e instanceof SyncError && e.kind === 'unauthorized') throw e;
      return { uploaded, error: e instanceof SyncError ? e : new SyncError('network') };
    }
    if (res.status === 401) throw new SyncError('unauthorized');
    if (res.status === 201 || res.status === 200 || res.status === 410) {
      await store.markPhotoUploaded(id);
      if (res.status !== 410) uploaded++;
    } else if (res.status === 404) {
      // The row is not on the server yet: try again next run.
    } else if (res.status === 507) {
      return { uploaded, error: new SyncError('quota') };
    } else {
      return { uploaded, error: new SyncError('server') };
    }
  }
  return { uploaded, error: null };
}

async function pullStep({ store, api }) {
  let pulled = 0;
  let since = Number(await store.getSetting(PULLED_REVISION_KEY)) || 0;
  for (;;) {
    const res = checkStatus(await api.pull(since, PULL_PAGE_SIZE));
    const page = res.data ?? {};
    const { applied } = await store.applyRemoteRows(page.changes ?? {});
    pulled += applied;
    const revision = Number(page.revision);
    if (Number.isFinite(revision) && revision > since) {
      since = revision;
      await store.setSetting(PULLED_REVISION_KEY, String(revision));
    } else if (page.more) {
      break; // a page that does not advance would loop forever
    }
    if (!page.more) break;
  }
  return pulled;
}

async function downloadStep({ store, api }) {
  let downloaded = 0;
  for (const { table, id } of await store.listPhotosToDownload()) {
    const result = await store.downloadPhoto(table, id, api.downloadTarget(id));
    if (result.status === 'ok') downloaded++;
    else if (result.status === 401) throw new SyncError('unauthorized');
    else if (result.status === 404 || result.status === 410) continue;
    else return { downloaded, error: new SyncError(result.status ? 'server' : 'network') };
  }
  return { downloaded, error: null };
}

/**
 * One sync pass: push, upload photos, pull, download photos. A thrown error
 * ends the pass but never undoes a finished step; the watermark, the pulled
 * revision and the photo sets let the next pass resume. Resolves
 * `{ pushed, pulled, uploaded, downloaded, error? }` where `error` is
 * `{ kind, message }`.
 */
export async function runSync({ store, api, now = () => new Date().toISOString(), onProgress }) {
  const summary = { pushed: 0, pulled: 0, uploaded: 0, downloaded: 0 };
  const progress = (stage) => onProgress?.(stage);
  let softError = null;
  try {
    progress('push');
    summary.pushed = await pushStep({ store, api, now });

    progress('photos');
    const up = await uploadStep({ store, api });
    summary.uploaded = up.uploaded;
    softError = up.error;

    progress('pull');
    summary.pulled = await pullStep({ store, api });

    progress('download');
    const down = await downloadStep({ store, api });
    summary.downloaded = down.downloaded;
    softError = softError ?? down.error;
  } catch (e) {
    const error = e instanceof SyncError ? e : new SyncError('server');
    summary.error = { kind: error.kind, message: error.message };
    return summary;
  }
  if (softError) {
    summary.error = { kind: softError.kind, message: softError.message };
    return summary;
  }
  await store.setSetting(LAST_SYNC_KEY, now());
  return summary;
}
