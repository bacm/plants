// fetch-based api adapter for lib/sync.js (ticket 094, contract in
// server/README.md "Sync" and "Photos"). Native only: the phone authenticates
// with its bearer device token. A failed fetch throws SyncError('network').
import { apiUrl } from './apiUrl';
import { SyncError } from './sync';

export function createSyncApi(token) {
  const auth = { Authorization: `Bearer ${token}` };

  async function call(method, path, { json, body, headers = {} } = {}) {
    const url = apiUrl(path);
    if (!url) throw new SyncError('network');
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          ...auth,
          ...headers,
          ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
        ...(body !== undefined ? { body } : {}),
      });
    } catch {
      throw new SyncError('network');
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      // No JSON body.
    }
    return { status: res.status, data };
  }

  return {
    push: (changes) => call('POST', '/sync/push', { json: { changes } }),
    pull: (since, limit) => call('GET', `/sync/pull?since=${since}&limit=${limit}`),
    putPhoto: (id, bytes, mime) =>
      call('PUT', `/photos/${encodeURIComponent(id)}`, {
        body: bytes,
        headers: { 'Content-Type': mime },
      }),
    downloadTarget: (id) => ({
      url: apiUrl(`/photos/${encodeURIComponent(id)}`),
      headers: auth,
    }),
  };
}
