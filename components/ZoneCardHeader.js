// The top row of a zone card: icon square, name + one-line description, and
// a plant-count pill. Shared by the zones list (app/(tabs)/zones/index.js)
// and the zone form's live preview (components/ZoneForm.js).
import { View, Text, StyleSheet } from 'react-native';
import Icon from './Icon';
import { colors } from '../lib/theme';
import { plural } from '../lib/text';

export function ZoneCardHeader({ icon, name, description, count }) {
  return (
    <View style={styles.cardTopRow}>
      <View style={[styles.iconSquare, { backgroundColor: colors[icon.tint] }]}>
        <Icon name={icon.icon} size={22} color={colors.text} />
      </View>
      <View style={styles.zoneTextCol}>
        <Text style={styles.zoneName} numberOfLines={1}>
          {name}
        </Text>
        {description ? (
          <Text style={styles.zoneDesc} numberOfLines={1}>
            {description}
          </Text>
        ) : null}
      </View>
      <View style={styles.countPill}>
        <Text style={styles.countPillText}>
          {count} {plural(count, 'plante', 'plantes')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconSquare: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneTextCol: { flex: 1, minWidth: 0, gap: 2 },
  zoneName: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 17, color: colors.text },
  zoneDesc: { fontFamily: 'InstrumentSans_400Regular', fontSize: 13, color: colors.textSecondary },
  countPill: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: colors.highlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPillText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12, color: colors.accent },
});
