// A pill-shaped segmented control: equal-width segments in a single track,
// the selected one filled with `colors.text`. Used where a field has a
// small, fixed set of choices shown inline rather than as wrapping chips
// (Floraison Oui / Non applicable, Feuillage Caduc / Persistant).
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, typography, radius } from '../../lib/theme';

export function Segmented({
  options,
  value,
  onChange,
  allowClear = false,
  accessibilityLabel,
  compact = false,
}) {
  return (
    <View
      style={[styles.track, compact && styles.trackCompact]}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <TouchableOpacity
            key={String(option.value)}
            style={[
              styles.segment,
              compact && styles.segmentCompact,
              selected && styles.segmentSelected,
            ]}
            onPress={() => {
              if (selected) {
                if (allowClear) onChange(null);
                return;
              }
              onChange(option.value);
            }}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected }}>
            <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: radius.full,
    padding: 3,
    height: 48,
  },
  trackCompact: { height: 38 },
  segment: {
    flex: 1,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Compact segments size to their label (the Floraison toggle sits beside a
  // section title, where equal halves would truncate "Non applicable").
  segmentCompact: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', paddingHorizontal: 14 },
  segmentSelected: {
    backgroundColor: colors.text,
  },
  label: { ...typography.label, color: colors.text },
  labelSelected: { color: colors.background },
});
