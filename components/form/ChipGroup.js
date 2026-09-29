// Single-choice pill chips over an enum list (lib/enums.js shape). Renders
// only the real values (choices() drops the UNKNOWN sentinel) and toggles
// through toggleChip() so tapping the selected chip clears it back to
// "no choice" rather than leaving the user stuck on it.
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, typography, radius } from '../../lib/theme';
import { choices, toggleChip } from '../../lib/enums';

export function ChipGroup({ label, options, value, onChange, allowClear = true }) {
  const items = choices(options);

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        {items.map((option) => {
          const selected = option.value === value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => onChange(allowClear ? toggleChip(value, option.value) : option.value)}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}>
              <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  label: { ...typography.label, color: colors.text },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
