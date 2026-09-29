// Icon tiles over an enum list (lib/enums.js shape), for choices with an
// icon per value: Exposition, Arrosage, care types. Same choices()/
// toggleChip() logic as ChipGroup. `columns` lays out a grid of tiles sized
// by percentage width; `columns=1` is a single full-width column. `stacked`
// (default `columns > 1`, so Exposition/Arrosage stay unchanged) picks each
// tile's own layout: `true` stacks the icon above the label, centred (the
// mock-up's Exposition/Arrosage); `false` puts the icon left of a label that
// may wrap to two lines, left-aligned (the mock-up's care-type grid,
// `columns={2} stacked={false}`).
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, typography, radius } from '../../lib/theme';
import { choices, toggleChip } from '../../lib/enums';
import Icon from '../Icon';

export function ChoiceTiles({
  label,
  options,
  value,
  onChange,
  allowClear = true,
  columns = 1,
  stacked = columns > 1,
}) {
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
                  stacked ? styles.tileGrid : styles.tileRow,
                  selected && styles.tileSelected,
                ]}
                onPress={() =>
                  onChange(allowClear ? toggleChip(value, option.value) : option.value)
                }
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityState={{ selected }}>
                {option.icon ? <Icon name={option.icon} size={20} color={colors.text} /> : null}
                <Text style={[styles.tileLabel, !stacked && styles.tileLabelRow]}>
                  {option.label}
                </Text>
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
    minHeight: 48,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: 16,
    paddingVertical: 10,
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
  // `stacked=false` rows: let the label take the remaining row width so it
  // wraps instead of overflowing past the icon. `flexBasis: 'auto'` is
  // required alongside `flex: 1` on react-native-web, or the label collapses
  // to zero width.
  tileLabelRow: { flex: 1, flexBasis: 'auto' },
});
