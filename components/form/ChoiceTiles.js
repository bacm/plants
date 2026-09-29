// Icon tiles over an enum list (lib/enums.js shape), for choices with an
// icon per value: Exposition, Arrosage, care types. Same choices()/
// toggleChip() logic as ChipGroup. `columns=1` stacks icon+label rows (as
// in the mock-up's Exposition/Arrosage); `columns>1` lays out a grid with
// the icon above the label, sized by percentage width per tile.
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, typography, radius } from '../../lib/theme';
import { choices, toggleChip } from '../../lib/enums';
import Icon from '../Icon';

export function ChoiceTiles({ label, options, value, onChange, allowClear = true, columns = 1 }) {
  const items = choices(options);
  const isGrid = columns > 1;
  const tileWidth = isGrid ? `${100 / columns}%` : '100%';

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.row, isGrid && styles.rowWrap]}>
        {items.map((option) => {
          const selected = option.value === value;
          return (
            <View key={option.value} style={{ width: tileWidth, padding: spacing.xs / 2 }}>
              <TouchableOpacity
                style={[
                  styles.tile,
                  isGrid ? styles.tileGrid : styles.tileRow,
                  selected && styles.tileSelected,
                ]}
                onPress={() =>
                  onChange(allowClear ? toggleChip(value, option.value) : option.value)
                }
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityState={{ selected }}>
                {option.icon ? <Icon name={option.icon} size={20} color={colors.text} /> : null}
                <Text style={styles.tileLabel}>{option.label}</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  label: { ...typography.label, color: colors.text },
  row: { flexDirection: 'column', gap: 0, marginHorizontal: -spacing.xs / 2 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  tileRow: {
    minHeight: 52,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: 16,
  },
  tileGrid: {
    minHeight: 84,
    flexDirection: 'column',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 12,
  },
  tileSelected: {
    borderWidth: 2,
    borderColor: colors.text,
    backgroundColor: colors.softGreen,
  },
  tileLabel: { ...typography.label, color: colors.text },
});
