// A 12-cell month range picker (J F M A M J J A S O N D) for bloom/harvest
// periods that may wrap the year. All the tap and range logic lives in
// lib/monthRange.js (pure, tested); this component only renders it.
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../lib/theme';
import { MONTH_LETTERS, monthName } from '../../lib/months';
import { nextRange, cellState, rangeSummary } from '../../lib/monthRange';

const CELL_BACKGROUND = {
  none: colors.background,
  inside: colors.blush,
  start: colors.text,
  end: colors.text,
  single: colors.text,
};

export function MonthRangePicker({ label, start, end, onChange }) {
  const range = { start, end };

  const handlePress = (month) => {
    onChange(nextRange(range, month));
  };

  const clear = () => onChange({ start: null, end: null });

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        {MONTH_LETTERS.map((letter, index) => {
          const month = index + 1;
          const state = cellState(month, range);
          const filled = state === 'start' || state === 'end' || state === 'single';
          return (
            <TouchableOpacity
              key={month}
              style={[styles.cell, { backgroundColor: CELL_BACKGROUND[state] }]}
              onPress={() => handlePress(month)}
              accessibilityRole="button"
              accessibilityLabel={monthName(month)}
              accessibilityState={{ selected: state !== 'none' }}>
              <Text style={[styles.cellLabel, filled && styles.cellLabelFilled]}>{letter}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>{rangeSummary(range)}</Text>
        {start != null ? (
          <TouchableOpacity
            onPress={clear}
            accessibilityRole="button"
            accessibilityLabel="Effacer la période">
            <Text style={styles.clearText}>Effacer</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  label: { ...typography.label, color: colors.text },
  row: { flexDirection: 'row', gap: 4 },
  cell: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellLabel: { ...typography.caption, color: colors.text },
  cellLabelFilled: { color: colors.background },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryText: { ...typography.bodySmall, color: colors.textSecondary },
  clearText: { ...typography.caption, color: colors.accent },
});
