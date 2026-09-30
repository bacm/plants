// Who is logged in (ticket 101). state.status is 'loading' until the first
// answer, then 'signedOut' or 'signedIn'.
//
// Phone: never gated. A stored device token shows the cached account at once,
// then /auth/me confirms in the background: 401 signs out, a network failure
// keeps the phone signed in (offline). Web: the cookie is the session, so
// /auth/me alone decides.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as api from '../lib/account';
import { getDeviceToken, setDeviceToken, getCachedAccount, setCachedAccount } from '../lib/db';

const AccountContext = createContext(null);

const SIGNED_OUT = { status: 'signedOut', account: null };

export function AccountProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', account: null });

  const refresh = useCallback(async () => {
    const isWeb = Platform.OS === 'web';
    const token = await getDeviceToken();
    if (!isWeb && !token) {
      setState(SIGNED_OUT);
      return;
    }
    const cached = isWeb ? null : await getCachedAccount();
    if (cached) setState({ status: 'signedIn', account: cached });

    const res = await api.me({ token });
    if (res.ok) {
      if (!isWeb) await setCachedAccount(res.account);
      setState({ status: 'signedIn', account: res.account });
    } else if (res.kind === 'unauthorized') {
      await setDeviceToken(null);
      await setCachedAccount(null);
      setState(SIGNED_OUT);
    } else if (isWeb) {
      setState(SIGNED_OUT);
    } else {
      // Offline or server down: a stored token keeps the phone signed in.
      setState({ status: 'signedIn', account: cached ?? { email: null } });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async ({ email, password }) => {
    const res = await api.login({ email, password });
    if (!res.ok) return res;
    try {
      if (Platform.OS !== 'web') {
        if (!res.token)
          return { ok: false, kind: 'error', error: 'Réponse inattendue du serveur.' };
        await setDeviceToken(res.token);
        await setCachedAccount(res.account);
      }
    } catch (e) {
      return {
        ok: false,
        kind: 'error',
        error: `Impossible d'enregistrer la session : ${e.message}`,
      };
    }
    setState({ status: 'signedIn', account: res.account });
    return res;
  }, []);

  const signup = useCallback((fields) => api.signup(fields), []);

  const logout = useCallback(async () => {
    // Server first, but a failed call must not keep the user signed in here.
    const token = await getDeviceToken();
    await api.logout({ token });
    try {
      await setDeviceToken(null);
      await setCachedAccount(null);
    } finally {
      setState(SIGNED_OUT);
    }
  }, []);

  const value = useMemo(
    () => ({ ...state, login, signup, logout, refresh }),
    [state, login, signup, logout, refresh]
  );
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount must be used inside <AccountProvider>');
  return value;
}
