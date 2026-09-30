/**
 * Admin client of lib/account.js and the pure helpers of lib/adminAccounts.js
 * (ticket 099). fetch is mocked.
 */
const { Platform } = require('react-native');
const helpers = require('../adminAccounts');

const ORIGINAL_URL = process.env.EXPO_PUBLIC_PLANT_API_URL;
const ORIGINAL_OS = Platform.OS;

function reply(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new Error('no body');
      return body;
    },
  };
}

let account;

beforeEach(() => {
  process.env.EXPO_PUBLIC_PLANT_API_URL = 'https://api.example.test/';
  global.fetch = jest.fn();
  Platform.OS = 'ios';
  account = require('../account');
});

afterEach(() => {
  process.env.EXPO_PUBLIC_PLANT_API_URL = ORIGINAL_URL;
  Platform.OS = ORIGINAL_OS;
  delete global.fetch;
});

describe('admin client', () => {
  it('lists accounts with the bearer token', async () => {
    const accounts = [{ id: 'a', email: 'a@b.fr', status: 'pending' }];
    global.fetch.mockResolvedValue(reply(200, accounts));
    expect(await account.listAccounts({ token: 'tok' })).toEqual({ ok: true, accounts });
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.example.test/admin/accounts');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('uses the cookie on the web', async () => {
    Platform.OS = 'web';
    global.fetch.mockResolvedValue(reply(200, []));
    await account.listAccounts({ token: 'ignored' });
    const init = global.fetch.mock.calls[0][1];
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.credentials).toBe('include');
  });

  it.each([
    ['approveAccount', 'approve'],
    ['refuseAccount', 'refuse'],
    ['disableAccount', 'disable'],
    ['enableAccount', 'enable'],
    ['revokeSessions', 'revoke-sessions'],
  ])('%s posts to the %s route', async (fn, route) => {
    global.fetch.mockResolvedValue(reply(200, { status: 'ok' }));
    expect(await account[fn]('a 1', { token: 'tok' })).toEqual({ ok: true });
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe(`https://api.example.test/admin/accounts/a%201/${route}`);
    expect(init.method).toBe('POST');
  });

  it('returns the temporary password', async () => {
    global.fetch.mockResolvedValue(reply(200, { temporaryPassword: 'abc123XYZ789abcd' }));
    expect(await account.resetPassword('a', { token: 'tok' })).toEqual({
      ok: true,
      temporaryPassword: 'abc123XYZ789abcd',
    });
    expect(global.fetch.mock.calls[0][0]).toContain('/admin/accounts/a/reset-password');
  });

  it('rejects a reset answer without a password', async () => {
    global.fetch.mockResolvedValue(reply(200, {}));
    expect((await account.resetPassword('a', { token: 'tok' })).ok).toBe(false);
  });

  it.each([
    [401, 'unauthorized', 'Unauthorized'],
    [403, 'forbidden', 'Réservé à l’administrateur'],
    [409, 'error', 'Cette action n’est pas possible pour ce compte.'],
  ])('maps %i to kind %s', async (status, kind, detail) => {
    global.fetch.mockResolvedValue(reply(status, { detail }));
    expect(await account.approveAccount('a', { token: 'tok' })).toMatchObject({
      ok: false,
      kind,
      status,
      error: detail,
    });
  });

  it('reports a network failure', async () => {
    global.fetch.mockRejectedValue(new TypeError('Network request failed'));
    expect((await account.listAccounts({ token: 'tok' })).kind).toBe('network');
  });

  it('rejects a list answer that is not an array', async () => {
    global.fetch.mockResolvedValue(reply(200, { nope: true }));
    expect((await account.listAccounts({ token: 'tok' })).ok).toBe(false);
  });
});

describe('adminAccounts helpers', () => {
  const now = new Date('2026-09-30T12:00:00Z');

  it('ages a request', () => {
    expect(helpers.requestAgeFr('2026-09-30T11:00:00Z', now)).toBe('aujourd’hui');
    expect(helpers.requestAgeFr('2026-09-30T11:59:59Z', now)).toBe('aujourd’hui');
    expect(helpers.requestAgeFr('2026-09-29T10:00:00Z', now)).toBe('hier');
    expect(helpers.requestAgeFr('2026-09-27T10:00:00Z', now)).toBe('il y a 3 j');
    expect(helpers.requestAgeFr(null, now)).toBe('');
  });

  it('writes the subtitle of an account', () => {
    const base = { id: 'a', status: 'approved', decidedAt: '2026-10-02T08:00:00Z' };
    expect(helpers.accountSubtitle(base, 'a')).toBe('Vous');
    expect(helpers.accountSubtitle(base, 'other')).toBe('Actif depuis le 2 oct.');
    expect(helpers.accountSubtitle({ ...base, status: 'disabled' }, 'other')).toBe('Désactivé');
    expect(helpers.accountSubtitle({ ...base, status: 'refused' }, 'other')).toBe('Refusé');
  });

  it('splits pending from the others and labels the count', () => {
    const accounts = [{ status: 'pending' }, { status: 'approved' }, { status: 'refused' }];
    expect(helpers.pendingAccounts(accounts)).toHaveLength(1);
    expect(helpers.otherAccounts(accounts)).toHaveLength(2);
    expect(helpers.pendingLabel(1)).toBe('1 demande');
    expect(helpers.pendingLabel(2)).toBe('2 demandes');
  });

  it('offers the right actions and never self-disable', () => {
    const keys = (a, me) => helpers.accountActions(a, me).map((x) => x.key);
    expect(keys({ id: 'a', status: 'approved' }, 'b')).toEqual(['disable', 'revoke', 'reset']);
    expect(keys({ id: 'a', status: 'approved' }, 'a')).toEqual(['revoke', 'reset']);
    expect(keys({ id: 'a', status: 'disabled' }, 'b')).toEqual(['enable', 'reset']);
    expect(keys({ id: 'a', status: 'refused' }, 'b')).toEqual(['approve']);
    expect(keys({ id: 'a', status: 'pending' }, 'b')).toEqual([]);
  });
});
