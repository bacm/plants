// A form screen's header: a round back button plus a Fraunces title (and
// optional subtitle), replacing the old GradientHero + "Annuler" link.
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Icon from './Icon';
import { colors, spacing, typography, radius } from '../lib/theme';

export function ScreenHeader({ title, subtitle }) {
  const router = useRouter();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={goBack}
        accessibilityLabel="Retour"
        accessibilityRole="button">
        <Icon name="chevron-left" size={20} color={colors.text} />
      </TouchableOpacity>
      <View style={styles.textCol}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
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
  subtitle: { ...typography.bodySmall, color: colors.textSecondary },
});
