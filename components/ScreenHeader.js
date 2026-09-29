// A form screen's header: a round back button plus a Fraunces title (and
// optional subtitle), replacing the old GradientHero + "Annuler" link.
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Icon from './Icon';
import { colors, spacing, typography, radius } from '../lib/theme';

// `right`: an optional node rendered at the row's end, next to the title
// (e.g. app/sort.js's "Importer" pill) -- ignored when `large` is set, since
// that layout has no room for a trailing node.
// `large` (ticket 071, app/settings.js): stacks the back button above a 40pt
// title instead of the usual side-by-side row, matching the mock-up's
// Réglages layout.
export function ScreenHeader({ title, subtitle, right, large }) {
  const router = useRouter();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const backBtn = (
    <TouchableOpacity
      style={styles.backBtn}
      onPress={goBack}
      accessibilityLabel="Retour"
      accessibilityRole="button">
      <Icon name="chevron-left" size={20} color={colors.text} />
    </TouchableOpacity>
  );

  if (large) {
    return (
      <View style={styles.largeContainer}>
        {backBtn}
        <View style={styles.textCol}>
          <Text style={styles.largeTitle} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {backBtn}
      <View style={styles.textCol}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  largeContainer: { gap: spacing.md + 2 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, gap: 2 },
  title: {
    fontFamily: 'Fraunces_400Regular',
    fontSize: 28,
    letterSpacing: -0.5,
    color: colors.text,
  },
  largeTitle: {
    fontFamily: 'Fraunces_400Regular',
    fontSize: 40,
    letterSpacing: -0.5,
    color: colors.text,
  },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary },
});
