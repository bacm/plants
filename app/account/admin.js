// Administration (ticket 099): pending requests, then every account. Admin
// only: anyone else is sent back. Each action asks the server, then reloads
// the list.
import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useAccount } from '../../components/AccountProvider';
import Icon from '../../components/Icon';
import * as api from '../../lib/account';
import { getDeviceToken } from '../../lib/db';
import {
  accountActions,
  accountSubtitle,
  otherAccounts,
  pendingAccounts,
  requestAgeFr,
} from '../../lib/adminAccounts';
import { showMessage, confirm } from '../../lib/dialogs';
import { colors, typography } from '../../lib/theme';

// What each menu action calls, and whether it asks first.
const ACTIONS = {
  approve: { run: api.approveAccount },
  refuse: {
    run: api.refuseAccount,
    ask: (a) => ({
      title: 'Refuser cette demande ?',
      message: `${a.email} ne pourra pas se connecter.`,
      confirmLabel: 'Refuser',
    }),
  },
  disable: {
    run: api.disableAccount,
    ask: (a) => ({
      title: 'Désactiver ce compte ?',
      message: `${a.email} sera déconnecté partout et ne pourra plus se connecter.`,
      confirmLabel: 'Désactiver',
    }),
  },
  enable: { run: api.enableAccount },
  revoke: {
    run: api.revokeSessions,
    ask: (a) => ({
      title: 'Déconnecter partout ?',
      message: `${a.email} devra se reconnecter sur chaque appareil.`,
      confirmLabel: 'Déconnecter',
    }),
  },
  reset: {
    run: api.resetPassword,
    ask: (a) => ({
      title: 'Réinitialiser le mot de passe ?',
      message: `${a.email} sera déconnecté partout et devra utiliser un mot de passe temporaire.`,
      confirmLabel: 'Réinitialiser',
    }),
  },
};

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { status, account: me } = useAccount();
  const isWeb = Platform.OS === 'web';
  const isAdmin = status === 'signedIn' && me?.isAdmin === true;

  const [accounts, setAccounts] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [menuFor, setMenuFor] = useState(null);

  const load = useCallback(async () => {
    const res = await api.listAccounts({ token: await getDeviceToken() });
    if (res.ok) {
      setAccounts(res.accounts);
      setError(null);
    } else {
      setError(res.error ?? 'Impossible de charger les comptes.');
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (status === 'loading') return;
    if (!isAdmin) {
      if (router.canGoBack()) router.back();
      else router.replace('/settings');
      return;
    }
    load();
  }, [status, isAdmin, router, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const perform = async (key, target) => {
    const action = ACTIONS[key];
    if (action.ask && !(await confirm({ ...action.ask(target), destructive: true }))) return;
    const res = await action.run(target.id, { token: await getDeviceToken() });
    if (!res.ok) {
      showMessage('Erreur', res.error);
    } else if (key === 'reset') {
      showMessage(
        'Mot de passe temporaire',
        `${res.temporaryPassword}\n\nCommuniquez-le à la personne ; elle pourra ensuite se connecter.`
      );
    }
    await load();
  };

  if (!isAdmin) return <View style={styles.screen} />;

  const pending = pendingAccounts(accounts);
  const others = otherAccounts(accounts);
  const menuActions = menuFor ? accountActions(menuFor, me.id) : [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: isWeb ? 56 : insets.top + 12 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <ScreenHeader title="Administration" backFallback="/settings" />

      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      {loaded && !error ? (
        <>
          <View style={styles.section}>
            <Text style={styles.eyebrow}>Demandes en attente · {pending.length}</Text>
            <View style={styles.card}>
              {pending.length === 0 ? (
                <Text style={styles.empty}>Aucune demande en attente.</Text>
              ) : (
                pending.map((a, index) => (
                  <View key={a.id} style={[styles.request, index > 0 && styles.rowBorder]}>
                    <View style={styles.requestHead}>
                      <Text style={styles.email} numberOfLines={1}>
                        {a.email}
                      </Text>
                      <Text style={styles.age}>{requestAgeFr(a.createdAt)}</Text>
                    </View>
                    <View style={styles.requestButtons}>
                      <TouchableOpacity
                        style={[styles.button, styles.refuse]}
                        onPress={() => perform('refuse', a)}
                        accessibilityRole="button"
                        accessibilityLabel={`Refuser ${a.email}`}>
                        <Text style={styles.refuseText}>Refuser</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.button, styles.approve]}
                        onPress={() => perform('approve', a)}
                        accessibilityRole="button"
                        accessibilityLabel={`Approuver ${a.email}`}>
                        <Text style={styles.approveText}>Approuver</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.eyebrow}>Comptes</Text>
            <View style={styles.card}>
              {others.map((a, index) => {
                const hasActions = accountActions(a, me.id).length > 0;
                return (
                  <View key={a.id} style={[styles.accountRow, index > 0 && styles.rowBorder]}>
                    <View style={styles.accountText}>
                      <View style={styles.emailLine}>
                        <Text style={[styles.email, styles.emailFlex]} numberOfLines={1}>
                          {a.email}
                        </Text>
                        {a.isAdmin ? (
                          <View style={styles.badge}>
                            <Text style={styles.badgeText}>Admin</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.subtitle}>{accountSubtitle(a, me.id)}</Text>
                    </View>
                    {hasActions ? (
                      <TouchableOpacity
                        style={styles.more}
                        onPress={() => setMenuFor(a)}
                        accessibilityRole="button"
                        accessibilityLabel={`Actions pour ${a.email}`}>
                        <Icon name="dots-horizontal" size={20} color={colors.text} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        </>
      ) : null}

      <Modal
        visible={menuFor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuFor(null)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuFor(null)}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {menuFor?.email}
            </Text>
            {menuActions.map((action) => (
              <TouchableOpacity
                key={action.key}
                style={styles.sheetRow}
                onPress={() => {
                  const target = menuFor;
                  setMenuFor(null);
                  perform(action.key, target);
                }}
                accessibilityRole="button">
                <Text style={[styles.sheetText, action.destructive && styles.danger]}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => setMenuFor(null)}
              accessibilityRole="button">
              <Text style={styles.sheetText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 32, gap: 20 },
  section: { gap: 8 },
  eyebrow: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.track,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.divider },
  empty: { ...typography.bodySmall, color: colors.textSecondary, paddingVertical: 16 },
  error: { ...typography.bodySmall, color: colors.danger },

  request: { gap: 10, paddingVertical: 14 },
  requestHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  requestButtons: { flexDirection: 'row', gap: 8 },
  button: { flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  refuse: { borderWidth: 1.5, borderColor: colors.borderStrong },
  refuseText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, color: colors.danger },
  approve: { backgroundColor: colors.accent },
  approveText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, color: '#fff' },
  age: { fontSize: 12, color: colors.textSecondary },

  email: {
    fontFamily: 'InstrumentSans_600SemiBold',
    fontSize: 15,
    color: colors.text,
    flexShrink: 1,
  },
  emailFlex: { minWidth: 0 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
  accountText: { flex: 1, minWidth: 0, gap: 2 },
  emailLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: colors.highlight,
    justifyContent: 'center',
  },
  badgeText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 11, color: colors.accent },
  subtitle: { fontSize: 13, color: colors.textSecondary },
  more: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

  backdrop: { flex: 1, backgroundColor: 'rgba(31,42,34,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sheetTitle: { ...typography.bodySmall, color: colors.textSecondary, paddingBottom: 8 },
  sheetRow: { minHeight: 52, justifyContent: 'center' },
  sheetText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16, color: colors.text },
  danger: { color: colors.danger },
});
