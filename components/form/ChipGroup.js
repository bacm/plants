// Single-choice pill chips over an enum list (lib/enums.js shape). Renders
// only the real values (choices() drops the UNKNOWN sentinel) and toggles
// through toggleChip() so tapping the selected chip clears it back to
// "no choice" rather than leaving the user stuck on it. `scroll` puts the
// chips in a single-line horizontal ScrollView instead of a wrapping row —
// the mock-up's Zone and Type rows.
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { colors, spacing, typography, radius } from '../../lib/theme';
import { choices, toggleChip } from '../../lib/enums';

export function ChipGroup({ label, options, value, onChange, allowClear = true, scroll = false }) {
  const items = choices(options);

  const chips = items.map((option) => {
    const selected = option.value === value;
    return (
      <TouchableOpacity
        key={option.value}
        style={[styles.chip, selected && styles.chipSelected]}
        onPress={() => onChange(allowClear ? toggleChip(value, option.value) : option.value)}
        accessibilityRole="button"
        accessibilityLabel={option.label}
        accessibilityState={{ selected }}>
        <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{option.label}</Text>
      </TouchableOpacity>
    );
  });

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {scroll ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.row}>{chips}</View>
        </ScrollView>
      ) : (
        <View style={[styles.row, styles.rowWrap]}>{chips}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  label: { ...typography.label, color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  rowWrap: { flexWrap: 'wrap' },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  chipLabel: { ...typography.label, color: colors.text },
  chipLabelSelected: { color: colors.background },
});
