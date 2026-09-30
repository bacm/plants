// Keeps the phone's garden in step with the server (ticket 094). Native only:
// on the web nothing runs and the context is an inert default. Sync runs when
// the phone is signed in and its first sync is done (ticket 096), at app start, whenever the app becomes active, on
// request (pull-to-refresh, "Synchroniser maintenant") and 5 s after a local
// write. Never two at once (lib/syncRunner.js). Offline failures are quiet: the
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
import { runSync, LAST_SYNC_KEY } from '../lib/sync';
import { createSyncApi } from '../lib/syncApi';
import { createSyncRunner } from '../lib/syncRunner';
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
const IDLE = { running: false, lastSyncAt: null, error: null, changeCount: 0, first: FIRST_IDLE };
const INERT = { ...IDLE, syncNow: async () => null, startFirstSync: async () => null };

const SyncContext = createContext(INERT);

export function SyncProvider({ children }) {
  const { status, refresh } = useAccount();
  const [state, setState] = useState(IDLE);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const runner = useMemo(
    () =>
      createSyncRunner(async () => {
        const token = await getDeviceToken();
        if (!token) return null;
        setState((s) => ({ ...s, running: true }));
        let summary;
        try {
          summary = await runSync({ store, api: createSyncApi(token) });
        } catch (e) {
          summary = { error: { kind: 'server', message: e.message } };
        }
        const lastSyncAt = summary.error ? null : await getSetting(LAST_SYNC_KEY);
        setState((s) => ({
          running: false,
          lastSyncAt: lastSyncAt ?? s.lastSyncAt,
          error: summary.error?.message ?? null,
          changeCount:
            s.changeCount + ((summary.pulled ?? 0) + (summary.downloaded ?? 0) > 0 ? 1 : 0),
        }));
        // A dead token: let the account provider confirm with /auth/me and sign
        // out locally (the phone keeps its data).
        if (summary.error?.kind === 'unauthorized') await refreshRef.current();
        return summary;
      }),
    []
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

  const enabled = Platform.OS !== 'web' && status === 'signedIn';
  const firstDone = Boolean(state.first.completedAt);

  useEffect(() => {
    if (!enabled) return undefined;
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
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !firstDone) return undefined;
    let cancelled = false;
    (async () => {
      const lastSyncAt = await getSetting(LAST_SYNC_KEY);
      if (!cancelled) setState((s) => ({ ...s, lastSyncAt }));
    })();
    runner.request();
    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') runner.request();
    });
    let timer = null;
    const unsubscribe = onLocalChange(() => {
      clearTimeout(timer);
      timer = setTimeout(() => runner.request(), WRITE_DELAY_MS);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      appSub.remove();
      unsubscribe();
    };
  }, [enabled, firstDone, runner]);

  const syncNow = useCallback(
    async () => (enabled && firstDone ? runner.request() : null),
    [enabled, firstDone, runner]
  );

  const startFirstSync = useCallback(
    async () => (enabled && !firstDone && !runner.isRunning() ? firstRunner.request() : null),
    [enabled, firstDone, runner, firstRunner]
  );

  const value = useMemo(
    () => ({ ...state, syncNow, startFirstSync }),
    [state, syncNow, startFirstSync]
  );
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  return useContext(SyncContext);
}
