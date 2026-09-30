import {
  runSync,
  SyncError,
  buildPushBatches,
  planRemoteRow,
  projectRow,
  PUSHED_THROUGH_KEY,
  PULLED_REVISION_KEY,
  LAST_SYNC_KEY,
} from '../sync';
import { createSyncRunner } from '../syncRunner';
import { relativeTimeFr } from '../relativeTime';
import { sniffImageExtension, mimeForExtension } from '../photoMime';

const stamp = (n) => new Date(Date.UTC(2026, 0, 1) + n).toISOString();
const zone = (id, n, extra = {}) => ({
  id,
  name: id,
  description: null,
  icon: null,
  orderIndex: 0,
  updatedAt: stamp(n),
  deletedAt: null,
  ...extra,
});
const photo = (id, n, extra = {}) => ({
  id,
  plantId: 'p1',
  careLogId: null,
  date: '2026-01-01',
  caption: null,
  fingerprint: null,
  updatedAt: stamp(n),
  deletedAt: null,
  ...extra,
});

function fakeStore({ rows = {}, files = {} } = {}) {
  const tables = {};
  for (const [t, list] of Object.entries(rows)) {
    tables[t] = new Map(list.map((r) => [r.id, { ...r, uri: `photos/${r.id}.jpg` }]));
  }
  const settings = {};
  const state = {};
  const deletedFiles = [];
  const fileIds = new Set(Object.keys(files));
  const table = (t) => (tables[t] ??= new Map());
  return {
    tables,
    settings,
    state,
    deletedFiles,
    getSetting: async (k) => settings[k] ?? null,
    setSetting: (k, v) => {
      settings[k] = v;
    },
    getRowsChangedSince: async (w) =>
      Object.keys(tables).flatMap((t) =>
        [...tables[t].values()]
          .filter((r) => !w || r.updatedAt >= w)
          .map((row) => ({ table: t, row }))
      ),
    applyRemoteRows: async (changes) => {
      let applied = 0;
      for (const [t, list] of Object.entries(changes)) {
        for (const remote of list) {
          const local = table(t).get(remote.id) ?? null;
          const plan = planRemoteRow(t, local, remote, {
            localFileExists: !!local && fileIds.has(remote.id),
          });
          if (!plan) continue;
          table(t).set(remote.id, {
            ...local,
            ...plan.row,
            uri: local?.uri ?? `photos/${remote.id}.jpg`,
          });
          if (plan.needsDownload) (state[remote.id] ??= {}).pending = true;
          if (plan.deleteFile) deletedFiles.push(remote.id);
          applied++;
        }
      }
      return { applied };
    },
    listPhotosToUpload: async () =>
      ['photos', 'unsorted_photos'].flatMap((t) =>
        [...table(t).values()]
          .filter((r) => !r.deletedAt && !state[r.id]?.uploaded && !state[r.id]?.pending)
          .map((r) => ({ table: t, id: r.id }))
      ),
    readPhotoBytes: async (t, id) =>
      fileIds.has(id) ? { bytes: new Uint8Array([1, 2]), mime: 'image/jpeg' } : null,
    markPhotoUploaded: async (id) => {
      (state[id] ??= {}).uploaded = true;
    },
    listPhotosToDownload: async () =>
      Object.keys(state)
        .filter((id) => state[id].pending)
        .map((id) => ({ table: 'photos', id })),
    downloadPhoto: jest.fn(async (t, id) => {
      const status = store_downloadStatus[id] ?? 'ok';
      if (status === 'ok') {
        state[id] = { uploaded: true, pending: false };
        fileIds.add(id);
      }
      return { status };
    }),
  };
}
let store_downloadStatus = {};
beforeEach(() => {
  store_downloadStatus = {};
});

function fakeApi({ failPushOn, photoStatus = {}, pages = [] } = {}) {
  const pushes = [];
  let pageIndex = 0;
  const pulls = [];
  return {
    pushes,
    pulls,
    push: jest.fn(async (changes) => {
      if (failPushOn === pushes.length + 1) throw new SyncError('network');
      pushes.push(changes);
      return { status: 200, data: { accepted: 1, revision: 1 } };
    }),
    pull: jest.fn(async (since) => {
      pulls.push(since);
      const page = pages[pageIndex++] ?? { changes: {}, revision: since, more: false };
      return { status: 200, data: page };
    }),
    putPhoto: jest.fn(async (id) => {
      const s = photoStatus[id] ?? 201;
      if (s === 'network') throw new SyncError('network');
      return { status: s, data: null };
    }),
    downloadTarget: (id) => ({ url: `https://x/photos/${id}`, headers: {} }),
  };
}

const NOW = () => '2026-06-01T00:00:00.000Z';

describe('push', () => {
  it('sends everything in batches, oldest first, advancing the watermark per batch', () => {
    const entries = Array.from({ length: 1200 }, (_, i) => ({
      table: 'zones',
      row: zone(`z${i}`, 1200 - i),
    }));
    const batches = buildPushBatches(entries);
    expect(batches.map((b) => b.count)).toEqual([500, 500, 200]);
    expect(batches[0].changes.zones[0].updatedAt < batches[1].changes.zones[0].updatedAt).toBe(
      true
    );
    expect(batches[2].maxUpdatedAt).toBe(stamp(1200));
  });

  it('projects allowed columns only, never uri', () => {
    const row = projectRow('photos', { ...photo('a', 1), uri: 'photos/a.jpg', extra: 1 });
    expect(row).not.toHaveProperty('uri');
    expect(row).not.toHaveProperty('extra');
    expect(row).toHaveProperty('deletedAt', null);
  });

  it('first push sends deleted rows too and stores the watermark', async () => {
    const store = fakeStore({
      rows: { zones: [zone('a', 1), zone('b', 2, { deletedAt: stamp(2) })] },
    });
    const api = fakeApi();
    const summary = await runSync({ store, api, now: NOW });
    expect(summary.pushed).toBe(2);
    expect(api.pushes[0].zones.map((r) => r.id)).toEqual(['a', 'b']);
    expect(store.settings[PUSHED_THROUGH_KEY]).toBe(NOW());
    expect(store.settings[LAST_SYNC_KEY]).toBe(NOW());
  });

  it('a push failing on the 2nd batch keeps the watermark; a rerun re-sends everything', async () => {
    const zones = Array.from({ length: 700 }, (_, i) => zone(`z${i}`, i + 1));
    const store = fakeStore({ rows: { zones } });
    const failing = fakeApi({ failPushOn: 2 });
    const first = await runSync({ store, api: failing, now: NOW });
    expect(first.error.kind).toBe('network');
    expect(store.settings[PUSHED_THROUGH_KEY]).toBeUndefined();
    expect(store.settings[LAST_SYNC_KEY]).toBeUndefined();

    const ok = fakeApi();
    const second = await runSync({ store, api: ok, now: NOW });
    expect(second.error).toBeUndefined();
    const sent = new Set(ok.pushes.flatMap((p) => p.zones.map((r) => r.id)));
    expect(sent.size).toBe(700);
  });

  it('a pulled row stamped in the future does not hide a later local edit', async () => {
    let clock = '2026-06-01T00:00:00.000Z';
    const now = () => clock;
    const store = fakeStore();
    const future = zone('remote', 0, { updatedAt: '2026-06-01T00:10:00.000Z' });
    const api1 = fakeApi({ pages: [{ changes: { zones: [future] }, revision: 1, more: false }] });
    await runSync({ store, api: api1, now });
    expect(store.settings[PUSHED_THROUGH_KEY]).toBe(clock);
    clock = '2026-06-01T00:02:00.000Z';
    store.tables.zones.set('local', zone('local', 0, { updatedAt: clock }));
    const api2 = fakeApi();
    await runSync({ store, api: api2, now });
    expect(api2.pushes[0].zones.map((r) => r.id)).toContain('local');
  });

  it('a row edited during the push is pushed by the next run', async () => {
    const clock = '2026-06-01T00:00:00.000Z';
    const store = fakeStore({ rows: { zones: [zone('a', 1)] } });
    const api = fakeApi();
    const push = api.push;
    api.push = async (changes) => {
      store.tables.zones.set('b', zone('b', 0, { updatedAt: '2026-06-01T00:00:00.500Z' }));
      return push(changes);
    };
    await runSync({ store, api, now: () => clock });
    const next = fakeApi();
    await runSync({ store, api: next, now: () => '2026-06-01T00:01:00.000Z' });
    expect(next.pushes[0].zones.map((r) => r.id)).toContain('b');
  });

  it('401 surfaces as unauthorized and stops', async () => {
    const store = fakeStore({ rows: { zones: [zone('a', 1)] } });
    const api = fakeApi();
    api.push = async () => ({ status: 401, data: null });
    const summary = await runSync({ store, api, now: NOW });
    expect(summary.error.kind).toBe('unauthorized');
    expect(api.pull).not.toHaveBeenCalled();
  });
});

describe('pull and merge', () => {
  it('paginates, saving the revision after each page', async () => {
    const store = fakeStore();
    const api = fakeApi({
      pages: [
        { changes: { zones: [zone('a', 1)] }, revision: 5, more: true },
        { changes: { zones: [zone('b', 2)] }, revision: 9, more: false },
      ],
    });
    const summary = await runSync({ store, api, now: NOW });
    expect(api.pulls).toEqual([0, 5]);
    expect(store.settings[PULLED_REVISION_KEY]).toBe('9');
    expect(summary.pulled).toBe(2);
    expect(store.tables.zones.get('a').updatedAt).toBe(stamp(1));
  });

  it('resumes from the saved revision', async () => {
    const store = fakeStore();
    store.settings[PULLED_REVISION_KEY] = '7';
    const api = fakeApi();
    await runSync({ store, api, now: NOW });
    expect(api.pulls).toEqual([7]);
  });

  it('last write wins: newer remote replaces, newer local stays and is pushed, equal skipped', () => {
    const local = zone('a', 5, { name: 'local' });
    expect(planRemoteRow('zones', local, zone('a', 9, { name: 'remote' })).action).toBe('replace');
    expect(planRemoteRow('zones', local, zone('a', 2, { name: 'remote' }))).toBeNull();
    expect(planRemoteRow('zones', local, zone('a', 5, { name: 'remote' }))).toBeNull();
    expect(planRemoteRow('zones', null, zone('a', 1)).action).toBe('insert');
  });

  it('keeps a newer local row through a pull and still pushes it', async () => {
    const store = fakeStore({ rows: { zones: [zone('a', 50, { name: 'local' })] } });
    const api = fakeApi({
      pages: [
        { changes: { zones: [zone('a', 10, { name: 'remote' })] }, revision: 3, more: false },
      ],
    });
    await runSync({ store, api, now: NOW });
    expect(store.tables.zones.get('a').name).toBe('local');
    expect(api.pushes[0].zones[0].name).toBe('local');
  });

  it('ignores unknown keys and keeps the remote updatedAt', () => {
    const plan = planRemoteRow('zones', null, { ...zone('a', 4), evil: 'x; DROP', uri: 'nope' });
    expect(plan.row).not.toHaveProperty('evil');
    expect(plan.row).not.toHaveProperty('uri');
    expect(plan.row.updatedAt).toBe(stamp(4));
    expect(planRemoteRow('nope', null, zone('a', 1))).toBeNull();
    expect(planRemoteRow('zones', null, { name: 'no id', updatedAt: stamp(1) })).toBeNull();
  });

  it('applies a remote delete and asks for the photo file to go', async () => {
    const store = fakeStore({ rows: { photos: [photo('ph', 1)] }, files: { ph: true } });
    const api = fakeApi({
      pages: [
        {
          changes: { photos: [photo('ph', 8, { deletedAt: stamp(8) })] },
          revision: 2,
          more: false,
        },
      ],
    });
    await runSync({ store, api, now: NOW });
    expect(store.tables.photos.get('ph').deletedAt).toBe(stamp(8));
    expect(store.deletedFiles).toEqual(['ph']);
  });
});

describe('photos', () => {
  async function upload(status) {
    const store = fakeStore({
      rows: { photos: [photo('ph', 1)] },
      files: { ph: true },
    });
    const api = fakeApi({ photoStatus: { ph: status } });
    const summary = await runSync({ store, api, now: NOW });
    return { store, summary };
  }

  it.each([[201], [200], [410]])('%s marks the photo uploaded', async (status) => {
    const { store, summary } = await upload(status);
    expect(store.state.ph.uploaded).toBe(true);
    expect(summary.error).toBeUndefined();
  });

  it('404 leaves it pending without an error', async () => {
    const { store, summary } = await upload(404);
    expect(store.state.ph?.uploaded).toBeFalsy();
    expect(summary.error).toBeUndefined();
  });

  it('507 stops uploading and reports the full quota, yet still pulls', async () => {
    const store = fakeStore({
      rows: { photos: [photo('a', 1), photo('b', 2)] },
      files: { a: true, b: true },
    });
    const api = fakeApi({ photoStatus: { a: 507 } });
    const summary = await runSync({ store, api, now: NOW });
    expect(summary.error).toEqual({ kind: 'quota', message: 'Espace photo plein' });
    expect(api.putPhoto).toHaveBeenCalledTimes(1);
    expect(api.pull).toHaveBeenCalled();
    expect(store.state.a?.uploaded).toBeFalsy();
  });

  it('a network error keeps the photo pending', async () => {
    const { store, summary } = await upload('network');
    expect(summary.error.kind).toBe('network');
    expect(store.state.ph?.uploaded).toBeFalsy();
  });

  it('skips a photo whose file is missing', async () => {
    const store = fakeStore({ rows: { photos: [photo('ph', 1)] } });
    const api = fakeApi();
    await runSync({ store, api, now: NOW });
    expect(api.putPhoto).not.toHaveBeenCalled();
  });

  it('401 on an upload surfaces as unauthorized', async () => {
    const { summary } = await upload(401);
    expect(summary.error.kind).toBe('unauthorized');
  });

  it('downloads a pulled photo then drains the set; 404 stays pending', async () => {
    const store = fakeStore();
    const api = fakeApi({
      pages: [
        {
          changes: { photos: [photo('x', 3), photo('y', 4)] },
          revision: 2,
          more: false,
        },
      ],
    });
    store_downloadStatus = { y: 404 };
    const summary = await runSync({ store, api, now: NOW });
    expect(summary.downloaded).toBe(1);
    expect(store.state.x).toEqual({ uploaded: true, pending: false });
    expect(store.state.y.pending).toBe(true);
    expect(summary.error).toBeUndefined();
  });

  it('a download that cannot reach the server reports a network error', async () => {
    const store = fakeStore();
    const api = fakeApi({
      pages: [{ changes: { photos: [photo('x', 3)] }, revision: 1, more: false }],
    });
    store_downloadStatus = { x: 0 };
    const summary = await runSync({ store, api, now: NOW });
    expect(summary.error.kind).toBe('network');
  });
});

describe('onProgress', () => {
  it('reports rows pushed, photos uploaded, pull and download with counts', async () => {
    const store = fakeStore({
      rows: {
        zones: Array.from({ length: 600 }, (_, i) => zone(`z${i}`, i + 1)),
        photos: [photo('a', 1), photo('b', 2)],
      },
      files: { a: true, b: true },
    });
    const events = [];
    await runSync({ store, api: fakeApi(), now: NOW, onProgress: (e) => events.push(e) });
    const push = events.filter((e) => e.phase === 'push');
    expect(push[0]).toEqual({ phase: 'push', done: 0, total: 602 });
    expect(push[push.length - 1]).toEqual({ phase: 'push', done: 602, total: 602 });
    const photos = events.filter((e) => e.phase === 'photos');
    expect(photos[0]).toEqual({ phase: 'photos', done: 0, total: 2 });
    expect(photos[photos.length - 1]).toEqual({ phase: 'photos', done: 2, total: 2 });
    expect(events.map((e) => e.phase)).toEqual(
      expect.arrayContaining(['push', 'photos', 'pull', 'download'])
    );
  });

  it('is optional', async () => {
    const summary = await runSync({ store: fakeStore(), api: fakeApi(), now: NOW });
    expect(summary.error).toBeUndefined();
  });
});

describe('runner', () => {
  it('coalesces a request made during a run into one more run', async () => {
    let release;
    const gate = new Promise((r) => {
      release = r;
    });
    const task = jest.fn(async () => {
      if (task.mock.calls.length === 1) await gate;
      return {};
    });
    const runner = createSyncRunner(task);
    const first = runner.request();
    runner.request();
    runner.request();
    expect(runner.isRunning()).toBe(true);
    release();
    await first;
    expect(task).toHaveBeenCalledTimes(2);
    expect(runner.isRunning()).toBe(false);
  });

  it('does not rerun after an error', async () => {
    const task = jest.fn(async () => {
      runner.request();
      return { error: { kind: 'unauthorized' } };
    });
    const runner = createSyncRunner(task);
    await runner.request();
    expect(task).toHaveBeenCalledTimes(1);
  });
});

describe('relativeTimeFr', () => {
  const now = new Date('2026-06-10T12:00:00.000Z');
  const ago = (ms) => new Date(now.getTime() - ms).toISOString();
  it('formats each range', () => {
    expect(relativeTimeFr(ago(10_000), now)).toBe('à l’instant');
    expect(relativeTimeFr(ago(2 * 60_000), now)).toBe('il y a 2 min');
    expect(relativeTimeFr(ago(3 * 3_600_000), now)).toBe('il y a 3 h');
    expect(relativeTimeFr(ago(30 * 3_600_000), now)).toBe('hier');
    expect(relativeTimeFr(ago(5 * 86_400_000), now)).toBe('il y a 5 j');
  });
  it('returns null for nothing usable', () => {
    expect(relativeTimeFr(null, now)).toBeNull();
    expect(relativeTimeFr('nope', now)).toBeNull();
  });
});

describe('photoMime', () => {
  it('sniffs the extension from the first bytes', () => {
    expect(sniffImageExtension([0xff, 0xd8, 0xff])).toBe('jpg');
    expect(sniffImageExtension([0x89, 0x50, 0x4e, 0x47])).toBe('png');
    expect(
      sniffImageExtension(
        [...'RIFF']
          .map((c) => c.charCodeAt(0))
          .concat(
            [0, 0, 0, 0],
            [...'WEBP'].map((c) => c.charCodeAt(0))
          )
      )
    ).toBe('webp');
    expect(sniffImageExtension([0, 0, 0, 0x18, ...[...'ftyp'].map((c) => c.charCodeAt(0))])).toBe(
      'heic'
    );
    expect(sniffImageExtension([])).toBe('jpg');
    expect(mimeForExtension('png')).toBe('image/png');
  });
});
