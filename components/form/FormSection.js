// A card that groups related fields under an uppercase eyebrow title, e.g.
// "Identification" or "Exposition" in a plant form. `action` renders a node
// (e.g. a compact Segmented toggle) to the right of the title on the same
// row, for a section whose title has an inline control like Floraison's
// Oui / Non applicable toggle.
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography, radius } from '../../lib/theme';

export function FormSection({ title, action, children }) {
  return (
    <View style={styles.card}>
      {title ? (
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {action}
        </View>
      ) : null}
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
});
