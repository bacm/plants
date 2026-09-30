/**
 * lib/account.js talks to the server's /auth routes (ticket 101). fetch is
 * mocked; every status of the contract in server/README.md is covered.
 */
const { Platform } = require('react-native');

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

describe('login', () => {
  const user = { id: 'a1', email: 'camille@exemple.fr', isAdmin: false };

  it('on the phone asks for a device token and returns it with the account', async () => {
    global.fetch.mockResolvedValue(reply(200, { token: 'tok', account: user }));
    const res = await account.login({ email: 'camille@exemple.fr', password: 'secret-secret' });

    expect(res).toEqual({ ok: true, account: user, token: 'tok' });
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.example.test/auth/login');
    expect(JSON.parse(init.body)).toEqual({
      email: 'camille@exemple.fr',
      password: 'secret-secret',
      client: 'device',
      deviceName: 'iPhone',
    });
    expect(init.credentials).toBeUndefined();
  });

  it('on the web asks for the cookie session and includes credentials', async () => {
    Platform.OS = 'web';
    global.fetch.mockResolvedValue(reply(200, { account: user }));
    const res = await account.login({ email: 'camille@exemple.fr', password: 'secret-secret' });

    expect(res).toEqual({ ok: true, account: user, token: null });
    const init = global.fetch.mock.calls[0][1];
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body)).toEqual({
      email: 'camille@exemple.fr',
      password: 'secret-secret',
      client: 'web',
    });
  });

  it('maps 401 to "Identifiants invalides"', async () => {
    global.fetch.mockResolvedValue(reply(401, { detail: 'Identifiants invalides' }));
    expect(await account.login({ email: 'a@b.fr', password: 'x' })).toMatchObject({
      ok: false,
      kind: 'unauthorized',
      error: 'Identifiants invalides',
    });
  });

  it('flags a 403 pending account and shows the server text', async () => {
    global.fetch.mockResolvedValue(reply(403, { detail: 'Compte en attente d’approbation' }));
    expect(await account.login({ email: 'a@b.fr', password: 'x' })).toEqual({
      ok: false,
      kind: 'pending',
      status: 403,
      error: 'Compte en attente d’approbation',
    });
  });

  it.each(['Compte refusé', 'Compte désactivé'])(
    'shows the 403 text "%s" as an error',
    async (detail) => {
      global.fetch.mockResolvedValue(reply(403, { detail }));
      expect(await account.login({ email: 'a@b.fr', password: 'x' })).toMatchObject({
        ok: false,
        kind: 'error',
        error: detail,
      });
    }
  );

  it('shows the lockout text on 429', async () => {
    const detail = 'Trop de tentatives. Réessayez dans 3 minutes.';
    global.fetch.mockResolvedValue(reply(429, { detail }));
    expect(await account.login({ email: 'a@b.fr', password: 'x' })).toMatchObject({
      ok: false,
      kind: 'error',
      error: detail,
    });
  });

  it('reports a network failure in French', async () => {
    global.fetch.mockRejectedValue(new TypeError('Network request failed'));
    expect(await account.login({ email: 'a@b.fr', password: 'x' })).toEqual({
      ok: false,
      kind: 'network',
      error: 'Connexion au serveur impossible. Vérifiez votre réseau.',
    });
  });

  it('reports a network failure when the API URL is unset, without calling fetch', async () => {
    delete process.env.EXPO_PUBLIC_PLANT_API_URL;
    expect((await account.login({ email: 'a@b.fr', password: 'x' })).kind).toBe('network');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('falls back to a generic message when the error body is not usable', async () => {
    global.fetch.mockResolvedValue(reply(500));
    const res = await account.login({ email: 'a@b.fr', password: 'x' });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/erreur/i);
  });
});

describe('signup', () => {
  it('sends email, password and the honeypot, and succeeds on 202', async () => {
    global.fetch.mockResolvedValue(reply(202, { status: 'pending' }));
    const res = await account.signup({ email: 'a@b.fr', password: 'twelve-chars!' });

    expect(res).toEqual({ ok: true });
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      email: 'a@b.fr',
      password: 'twelve-chars!',
      website: '',
    });
  });

  it.each([
    [400, 'Adresse e-mail invalide'],
    [429, 'Trop de demandes. Réessayez plus tard.'],
    [503, 'Inscriptions temporairement fermées'],
    [403, 'Origine refusée'],
  ])('shows the server text on %i', async (status, detail) => {
    global.fetch.mockResolvedValue(reply(status, { detail }));
    expect(await account.signup({ email: 'a@b.fr', password: 'x' })).toMatchObject({
      ok: false,
      status,
      error: detail,
    });
  });

  it('reports a network failure', async () => {
    global.fetch.mockRejectedValue(new TypeError('Network request failed'));
    expect((await account.signup({ email: 'a@b.fr', password: 'x' })).kind).toBe('network');
  });
});

describe('me and logout', () => {
  it('sends the bearer token on the phone and reads the account', async () => {
    const user = { id: 'a1', email: 'a@b.fr', isAdmin: false };
    global.fetch.mockResolvedValue(reply(200, user));
    expect(await account.me({ token: 'tok' })).toEqual({ ok: true, account: user });
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.example.test/auth/me');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('sends no Authorization header on the web, only the cookie', async () => {
    Platform.OS = 'web';
    global.fetch.mockResolvedValue(reply(401, { detail: 'Non authentifié' }));
    expect(await account.me({ token: 'ignored' })).toMatchObject({
      ok: false,
      kind: 'unauthorized',
    });
    const init = global.fetch.mock.calls[0][1];
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.credentials).toBe('include');
  });

  it('tells a network failure apart from a 401 on /auth/me', async () => {
    global.fetch.mockRejectedValue(new TypeError('Network request failed'));
    expect((await account.me({ token: 'tok' })).kind).toBe('network');
  });

  it('logs out on 204 with the bearer token', async () => {
    global.fetch.mockResolvedValue(reply(204));
    expect(await account.logout({ token: 'tok' })).toEqual({ ok: true });
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  });

  it('reports a failed logout without throwing', async () => {
    global.fetch.mockRejectedValue(new TypeError('Network request failed'));
    expect((await account.logout({ token: 'tok' })).ok).toBe(false);
  });
});
