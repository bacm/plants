import {
  runFirstSync,
  compareCounts,
  progressText,
  formatCount,
  firstSyncView,
  FIRST_STARTED_KEY,
  FIRST_COMPLETED_KEY,
} from '../firstSync';
import { SYNCED_TABLES } from '../syncFields';

const NOW = () => '2026-06-01T00:00:00.000Z';
const rowsOf = (extra = {}) => ({
  ...Object.fromEntries(SYNCED_TABLES.map((t) => [t, 0])),
  ...extra,
});

function store({ local, settings = {} } = {}) {
  const values = { ...settings };
  return {
    values,
    getSetting: async (k) => values[k] ?? null,
    setSetting: (k, v) => {
      values[k] = v;
    },
    getRowsChangedSince: async () => [],
    applyRemoteRows: async () => ({ applied: 0 }),
    listPhotosToUpload: async () => [],
    listPhotosToDownload: async () => [],
    getLocalSyncCounts: async () =>
      local ?? { rows: rowsOf({ zones: 2, photos: 3 }), photoFiles: 3, pendingUploads: 0 },
  };
}

function api({ stats, statsStatus = 200, pullStatus = 200 } = {}) {
  return {
    push: async () => ({ status: 200, data: {} }),
    pull: async (since) => ({
      status: pullStatus,
      data: { changes: {}, revision: since, more: false },
    }),
    putPhoto: async () => ({ status: 201 }),
    downloadTarget: () => ({}),
    stats: async () => ({
      status: statsStatus,
      data: stats ?? { rows: rowsOf({ zones: 2, photos: 3 }), photoFiles: 3 },
    }),
  };
}

describe('formatCount / progressText', () => {
  it('groups thousands with a no-break space', () => {
    expect(formatCount(1240)).toBe('1 240');
    expect(formatCount(7)).toBe('7');
  });

  it('words each phase', () => {
    expect(progressText({ phase: 'push', done: 700, total: 1240 })).toBe(
      'Envoi des plantes et zones… 700 / 1 240'.replace(/ \/ /, ' / ')
    );
    expect(progressText({ phase: 'photos', done: 124, total: 480 })).toBe(
      'Envoi des photos… 124 / 480'
    );
    expect(progressText({ phase: 'photos', done: 0, total: 0 })).toBe('Envoi des photos…');
    expect(progressText({ phase: 'pull', done: 0, total: 0 })).toBe('Récupération…');
    expect(progressText({ phase: 'download', done: 1, total: 3 })).toBe('Récupération…');
    expect(progressText(null)).toBe('Préparation…');
  });
});

describe('compareCounts', () => {
  const local = { rows: rowsOf({ plants: 5, photos: 3 }), photoFiles: 3, pendingUploads: 0 };

  it('is ok when every table and the photo files match', () => {
    const r = compareCounts({ rows: rowsOf({ plants: 5, photos: 3 }), photoFiles: 3 }, local);
    expect(r).toMatchObject({ ok: true, differences: [], items: 8, photos: 3 });
  });

  it('names each difference in French', () => {
    const r = compareCounts({ rows: rowsOf({ plants: 4, photos: 3 }), photoFiles: 2 }, local);
    expect(r.ok).toBe(false);
    expect(r.differences).toEqual([
      'Plantes — serveur : 4, téléphone : 5',
      'Serveur : 2 photos, téléphone : 3',
    ]);
  });

  it('treats a missing table on the server as zero', () => {
    expect(compareCounts({ rows: {}, photoFiles: 0 }, local).ok).toBe(false);
  });
});

describe('runFirstSync', () => {
  it('completes, stores the flag and says everything is on the server', async () => {
    const s = store();
    const result = await runFirstSync({ store: s, api: api(), now: NOW });
    expect(result.status).toBe('done');
    expect(result.message).toBe('Tout est sur le serveur : 5 éléments et 3 photos.');
    expect(s.values[FIRST_COMPLETED_KEY]).toBe(NOW());
    expect(s.values[FIRST_STARTED_KEY]).toBe(NOW());
  });

  it('keeps the first start date on a resume', async () => {
    const s = store({ settings: { [FIRST_STARTED_KEY]: 'earlier' } });
    await runFirstSync({ store: s, api: api(), now: NOW });
    expect(s.values[FIRST_STARTED_KEY]).toBe('earlier');
  });

  it('does not complete when the server counts differ', async () => {
    const s = store();
    const result = await runFirstSync({
      store: s,
      api: api({ stats: { rows: rowsOf({ zones: 2, photos: 3 }), photoFiles: 2 } }),
      now: NOW,
    });
    expect(result.status).toBe('mismatch');
    expect(result.differences).toEqual(['Serveur : 2 photos, téléphone : 3']);
    expect(s.values[FIRST_COMPLETED_KEY]).toBeUndefined();
  });

  it('does not complete while a photo upload is pending, and does not ask the server', async () => {
    const s = store({
      local: { rows: rowsOf({ photos: 3 }), photoFiles: 3, pendingUploads: 1 },
    });
    const a = api();
    a.stats = jest.fn(a.stats);
    const result = await runFirstSync({ store: s, api: a, now: NOW });
    expect(result.status).toBe('mismatch');
    expect(result.differences[0]).toContain('1 photo pas encore envoyée');
    expect(a.stats).not.toHaveBeenCalled();
    expect(s.values[FIRST_COMPLETED_KEY]).toBeUndefined();
  });

  it('reports a failed sync pass without checking', async () => {
    const s = store();
    const result = await runFirstSync({ store: s, api: api({ pullStatus: 500 }), now: NOW });
    expect(result.status).toBe('error');
    expect(s.values[FIRST_COMPLETED_KEY]).toBeUndefined();
  });

  it('reports a failing stats call', async () => {
    const s = store();
    const result = await runFirstSync({ store: s, api: api({ statsStatus: 500 }), now: NOW });
    expect(result.status).toBe('error');
    expect(s.values[FIRST_COMPLETED_KEY]).toBeUndefined();
  });

  it('forwards progress', async () => {
    const events = [];
    await runFirstSync({ store: store(), api: api(), now: NOW, onProgress: (e) => events.push(e) });
    expect(events.some((e) => e.phase === 'pull')).toBe(true);
  });
});

describe('firstSyncView', () => {
  it('starts fresh', () => {
    const v = firstSyncView({ startedAt: null, running: false, progress: null, result: null });
    expect(v.primaryLabel).toBe('Lancer la première synchronisation');
    expect(v.hint).toBeNull();
    expect(v.showActions).toBe(true);
  });

  it('offers to resume after a restart, with the hint', () => {
    const v = firstSyncView({ startedAt: 'x', running: false, progress: null, result: null });
    expect(v.primaryLabel).toBe('Reprendre la première synchronisation');
    expect(v.hint).toBe('Ce qui a déjà été envoyé ne sera pas renvoyé.');
  });

  it('shows progress and hides the actions while running', () => {
    const v = firstSyncView({
      startedAt: 'x',
      running: true,
      progress: { phase: 'photos', done: 124, total: 480 },
      result: null,
    });
    expect(v.text).toBe('Envoi des photos… 124 / 480');
    expect(v.showActions).toBe(false);
  });

  it('shows the differences and Réessayer after a mismatch', () => {
    const v = firstSyncView({
      startedAt: 'x',
      running: false,
      progress: null,
      result: { status: 'mismatch', message: 'Différent.', differences: ['Serveur : 1 photo'] },
    });
    expect(v.lines).toEqual(['Différent.', 'Serveur : 1 photo']);
    expect(v.primaryLabel).toBe('Réessayer');
  });
});
