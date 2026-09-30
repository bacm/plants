// "Administration · 2 demandes" row of the signed-in Compte card in Réglages
// (ticket 099). Renders nothing for a non-admin. The pending count is read
// once when the screen opens; a failed read just leaves the count out.
import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAccount } from './AccountProvider';
import Icon from './Icon';
import * as api from '../lib/account';
import { getDeviceToken } from '../lib/db';
import { pendingAccounts, pendingLabel } from '../lib/adminAccounts';
import { colors } from '../lib/theme';

export function AdminEntry() {
  const router = useRouter();
  const { status, account } = useAccount();
  const isAdmin = status === 'signedIn' && account?.isAdmin === true;
  const [pending, setPending] = useState(null);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    (async () => {
      const res = await api.listAccounts({ token: await getDeviceToken() });
      if (!cancelled && res.ok) setPending(pendingAccounts(res.accounts).length);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (!isAdmin) return null;
  const label = pending ? `Administration · ${pendingLabel(pending)}` : 'Administration';
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push('/account/admin')}
      accessibilityRole="link"
      accessibilityLabel={label}>
      <Icon name="shield-account-outline" size={20} color={colors.text} />
      <Text style={styles.text}>{label}</Text>
      <Icon name="chevron-right" size={20} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: 12,
  },
  text: { flex: 1, fontFamily: 'InstrumentSans_600SemiBold', fontSize: 15, color: colors.text },
});
