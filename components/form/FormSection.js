// A card that groups related fields under an uppercase eyebrow title, e.g.
// "Identification" or "Exposition" in a plant form.
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, radius } from '../../lib/theme';

export function FormSection({ title, children }) {
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: 18,
    gap: spacing.md,
  },
  title: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
});
