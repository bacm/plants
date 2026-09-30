// Keeps the local garden in step with the server (ticket 094). Sync runs when
// the phone is signed in and its first sync is done (ticket 096), at app start, whenever the app becomes active, on
// request (pull-to-refresh, "Synchroniser maintenant") and 5 s after a local
// write.
//
// Web (ticket 095): the same engine over the localStorage cache, authenticated
// by the session cookie, with no first-sync step (the server is the
// reference). Signing in as another account than the cached one empties the
// cache before the first pull; signing out empties it. The tab becoming
// visible again is the web's "app active". Never two at once (lib/syncRunner.js). Offline failures are quiet: the
// state carries the message, the next trigger retries.
//
// `changeCount` goes up whenever a sync brought rows or photos in; a screen
// that lists data listens to it and reloads (the dashboard does; the others
// already reload on focus).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import { useAccount } from './AccountProvider';
import {
  getDeviceToken,
  resetLocalCache,
  getSetting,
  setSetting,
  onLocalChange,
  getRowsChangedSince,
  applyRemoteRows,
  listPhotosToUpload,
  listPhotosToDownload,
  readPhotoBytes,
  markPhotoUploaded,
  downloadPhoto,
  getLocalSyncCounts,
} from '../lib/db';
import { runSync, LAST_SYNC_KEY, PUSHED_THROUGH_KEY } from '../lib/sync';
import { needsLogoutConfirmation } from '../lib/logoutGuard';
import { createSyncApi } from '../lib/syncApi';
import { createSyncRunner } from '../lib/syncRunner';
import { claimCache } from '../lib/webCache';
import { runFirstSync, FIRST_STARTED_KEY, FIRST_COMPLETED_KEY } from '../lib/firstSync';

const WRITE_DELAY_MS = 5000;

const store = {
  getSetting,
  setSetting,
  getRowsChangedSince,
  applyRemoteRows,
  listPhotosToUpload,
  listPhotosToDownload,
  readPhotoBytes,
  markPhotoUploaded,
  downloadPhoto,
  getLocalSyncCounts,
};

const FIRST_IDLE = {
  loaded: false,
  startedAt: null,
  completedAt: null,
  running: false,
  progress: null,
  result: null,
};
const IDLE = {
  running: false,
  lastSyncAt: null,
  error: null,
  errorKind: null,
  changeCount: 0,
  first: FIRST_IDLE,
};
const INERT = {
  ...IDLE,
  syncNow: async () => null,
  startFirstSync: async () => null,
  unsyncedBeforeLogout: async () => false,
};

async function hasUnsent() {
  const watermark = await getSetting(PUSHED_THROUGH_KEY);
  if ((await getRowsChangedSince(watermark ?? null)).length > 0) return true;
  // Only photos whose file is on this device: a photo with a missing file can
  // never be uploaded, and would otherwise trigger the dialog at every logout.
  return (await getLocalSyncCounts()).pendingUploads > 0;
}

const SyncContext = createContext(INERT);

export function SyncProvider({ children }) {
  const { status, account, refresh } = useAccount();
  const isWeb = Platform.OS === 'web';
  const [state, setState] = useState(IDLE);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const signedInRef = useRef(false);
  signedInRef.current = status === 'signedIn';
  // The cache is keyed by the account; without an id nothing can be cached.
  const accountId = account?.id != null ? String(account.id) : (account?.email ?? '');

  const runner = useMemo(
    () =>
      createSyncRunner(async () => {
        // Web: the cookie is the credential, there is no token to read.
        const token = isWeb ? null : await getDeviceToken();
        if (isWeb ? !signedInRef.current : !token) return null;
        setState((s) => ({ ...s, running: true }));
        let summary;
        try {
          summary = await runSync({ store, api: createSyncApi(token) });
        } catch (e) {
          summary = { error: { kind: 'server', message: e.message } };
        }
        const lastSyncAt = summary.error ? null : await getSetting(LAST_SYNC_KEY);
        // `...s` keeps `first` (the first-sync state): dropping it crashed Réglages.
        setState((s) => ({
          ...s,
          running: false,
          lastSyncAt: lastSyncAt ?? s.lastSyncAt,
          error: summary.error?.message ?? null,
          errorKind: summary.error?.kind ?? null,
          changeCount:
            s.changeCount + ((summary.pulled ?? 0) + (summary.downloaded ?? 0) > 0 ? 1 : 0),
        }));
        // A dead token: let the account provider confirm with /auth/me and sign
        // out locally (the phone keeps its data).
        if (summary.error?.kind === 'unauthorized') await refreshRef.current();
        return summary;
      }),
    [isWeb]
  );

  // Ticket 096: the first sync is started by the user (Réglages). Until it has
  // completed, nothing below starts a sync by itself.
  const firstRunner = useMemo(
    () =>
      createSyncRunner(async () => {
        const token = await getDeviceToken();
        if (!token) return null;
        const patchFirst = (patch) => setState((s) => ({ ...s, first: { ...s.first, ...patch } }));
        patchFirst({
          running: true,
          progress: null,
          result: null,
          startedAt: new Date().toISOString(),
        });
        let result;
        try {
          result = await runFirstSync({
            store,
            api: createSyncApi(token),
            onProgress: (progress) => patchFirst({ progress }),
          });
        } catch (e) {
          result = { status: 'error', message: e.message, differences: [] };
        }
        const done = result.status === 'done';
        const lastSyncAt = done ? await getSetting(LAST_SYNC_KEY) : null;
        setState((s) => ({
          ...s,
          lastSyncAt: lastSyncAt ?? s.lastSyncAt,
          changeCount: s.changeCount + 1,
          first: {
            ...s.first,
            running: false,
            progress: null,
            result,
            completedAt: done ? new Date().toISOString() : null,
          },
        }));
        if (result.kind === 'unauthorized') await refreshRef.current();
        return result;
      }),
    []
  );

  const enabled = status === 'signedIn' && (!isWeb || accountId !== '');
  const firstDone = isWeb || Boolean(state.first.completedAt);

  useEffect(() => {
    if (!enabled || isWeb) return undefined;
    let cancelled = false;
    (async () => {
      const [startedAt, completedAt] = await Promise.all([
        getSetting(FIRST_STARTED_KEY),
        getSetting(FIRST_COMPLETED_KEY),
      ]);
      if (cancelled) return;
      setState((s) => ({
        ...s,
        first: s.first.running ? s.first : { ...s.first, loaded: true, startedAt, completedAt },
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, isWeb]);

  useEffect(() => {
    if (!enabled || !firstDone) return undefined;
    let cancelled = false;
    let timer = null;
    let appSub = null;
    let unsubscribe = null;
    const onVisible = () => {
      if (document.visibilityState === 'visible') runner.request();
    };
    (async () => {
      if (isWeb) {
        // Another account than the cached one (or none recorded): start empty.
        const emptied = await claimCache({ getSetting, resetLocalCache, accountId });
        if (cancelled) return;
        if (emptied) setState((s) => ({ ...s, changeCount: s.changeCount + 1 }));
      }
      const lastSyncAt = await getSetting(LAST_SYNC_KEY);
      if (cancelled) return;
      setState((s) => ({ ...s, lastSyncAt }));
      runner.request();
      if (isWeb) document.addEventListener('visibilitychange', onVisible);
      else {
        appSub = AppState.addEventListener('change', (next) => {
          if (next === 'active') runner.request();
        });
      }
      unsubscribe = onLocalChange(() => {
        clearTimeout(timer);
        timer = setTimeout(() => runner.request(), WRITE_DELAY_MS);
      });
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      appSub?.remove();
      if (isWeb && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisible);
      }
      unsubscribe?.();
    };
  }, [enabled, firstDone, runner, isWeb, accountId]);

  // Web: signing out (signedIn -> signedOut in this page) empties the cache.
  // A page that loads signed out leaves it alone: unsent edits made offline
  // survive, and claimCache empties it if another account signs in.
  const wasSignedInRef = useRef(false);
  useEffect(() => {
    if (!isWeb) return;
    if (status === 'signedIn') {
      wasSignedInRef.current = true;
      return;
    }
    if (status !== 'signedOut' || !wasSignedInRef.current) return;
    wasSignedInRef.current = false;
    (async () => {
      // Let a sync in flight finish first (the task is inert once signed out).
      await runner.request();
      await resetLocalCache(null);
      setState((s) => ({ ...IDLE, changeCount: s.changeCount + 1 }));
    })();
  }, [isWeb, status, runner]);

  const syncNow = useCallback(
    async () => (enabled && firstDone ? runner.request() : null),
    [enabled, firstDone, runner]
  );

  const startFirstSync = useCallback(
    async () => (enabled && !firstDone && !runner.isRunning() ? firstRunner.request() : null),
    [enabled, firstDone, runner, firstRunner]
  );

  // Syncs once, then says whether the user must be asked before logging out.
  const unsyncedBeforeLogout = useCallback(
    () =>
      needsLogoutConfirmation({
        applicable: enabled && firstDone,
        runNow: () => runner.request(),
        hasPending: hasUnsent,
      }),
    [enabled, firstDone, runner]
  );

  const value = useMemo(
    () => ({ ...state, syncNow, startFirstSync, unsyncedBeforeLogout }),
    [state, syncNow, startFirstSync, unsyncedBeforeLogout]
  );
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  return useContext(SyncContext);
}
