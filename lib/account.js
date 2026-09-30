// Client of the server's account routes (ticket 101, contract in
// server/README.md "Accounts"). Pure apart from `fetch`: it stores nothing.
// The device token and the cached account live in lib/db.*, and the provider
// (components/AccountProvider.js) ties the two together.
//
// Every function resolves, never throws, to { ok, account?, token?, error?,
// kind? }. `kind` is 'network', 'unauthorized', 'pending' or 'error'.
import { Platform } from 'react-native';
import { apiUrl } from './apiUrl';

export const NETWORK_ERROR = 'Connexion au serveur impossible. Vérifiez votre réseau.';
export const INVALID_CREDENTIALS = 'Identifiants invalides';
const GENERIC_ERROR = 'Une erreur est survenue. Réessayez plus tard.';

// The phone names itself after its platform only: a device name is shown to
// the admin, not something the user should have to type.
function deviceName() {
  return Platform.OS === 'ios' ? 'iPhone' : 'Android';
}

function isWeb() {
  return Platform.OS === 'web';
}

async function call(method, path, { body, token } = {}) {
  const url = apiUrl(path);
  if (!url) return { networkFailure: true };
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  // The phone authenticates with its bearer token; the web with its cookie.
  if (!isWeb() && token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      ...(isWeb() ? { credentials: 'include' } : {}),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    return { networkFailure: true };
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // 204, or a body that is not JSON.
  }
  return { res, data };
}

// The server's `detail` is already French and safe to show; anything else
// (a validation error list, a missing body) falls back to a generic message.
function detailOf(data) {
  return typeof data?.detail === 'string' && data.detail ? data.detail : GENERIC_ERROR;
}

export async function signup({ email, password, website = '' }) {
  const { res, data, networkFailure } = await call('POST', '/auth/signup', {
    body: { email, password, website },
  });
  if (networkFailure) return { ok: false, kind: 'network', error: NETWORK_ERROR };
  if (res.status === 202) return { ok: true };
  return { ok: false, kind: 'error', status: res.status, error: detailOf(data) };
}

export async function login({ email, password }) {
  const body = isWeb()
    ? { email, password, client: 'web' }
    : { email, password, client: 'device', deviceName: deviceName() };
  const { res, data, networkFailure } = await call('POST', '/auth/login', { body });
  if (networkFailure) return { ok: false, kind: 'network', error: NETWORK_ERROR };
  if (res.status === 200 && data?.account) {
    return { ok: true, account: data.account, token: data.token ?? null };
  }
  if (res.status === 401) {
    return { ok: false, kind: 'unauthorized', status: 401, error: INVALID_CREDENTIALS };
  }
  const error = detailOf(data);
  const pending = res.status === 403 && /attente/i.test(error);
  return { ok: false, kind: pending ? 'pending' : 'error', status: res.status, error };
}

export async function logout({ token } = {}) {
  const { res, networkFailure } = await call('POST', '/auth/logout', { token });
  if (networkFailure) return { ok: false, kind: 'network', error: NETWORK_ERROR };
  return res.status === 204 || res.ok
    ? { ok: true }
    : { ok: false, kind: 'error', status: res.status, error: GENERIC_ERROR };
}

export async function me({ token } = {}) {
  const { res, data, networkFailure } = await call('GET', '/auth/me', { token });
  if (networkFailure) return { ok: false, kind: 'network', error: NETWORK_ERROR };
  if (res.status === 200 && data?.id !== undefined) return { ok: true, account: data };
  if (res.status === 200 && data?.account) return { ok: true, account: data.account };
  if (res.status === 401) return { ok: false, kind: 'unauthorized', status: 401 };
  return { ok: false, kind: 'error', status: res.status, error: detailOf(data) };
}
