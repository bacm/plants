// Web only (ticket 095): a discreet, non-blocking bar at the top of the screen
// when the last sync failed, so the owner never mistakes a stale or empty
// cache for the real garden. It never intercepts a tap.
import { StyleSheet, Text, View } from 'react-native';
import { useSync } from './SyncProvider';
import { colors, radius, spacing, typography } from '../lib/theme';

export const OFFLINE_MESSAGE =
  'Serveur injoignable — les modifications seront envoyées dès le retour de la connexion.';

export function SyncBanner() {
  const { error, errorKind } = useSync();
  if (!error) return null;
  const message = errorKind === 'network' ? OFFLINE_MESSAGE : error;
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.bar} accessibilityRole="alert">
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: spacing.sm,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  bar: {
    backgroundColor: colors.terracotta,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    maxWidth: '90%',
  },
  text: { ...typography.caption, color: '#fff', textAlign: 'center' },
});
