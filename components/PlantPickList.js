// The plant list of the "À trier" screen (app/sort.js, ticket 081): one
// full-width row per plant with its complete name, so plants that differ only
// by a trailing suffix ("… est 1", "… ouest 1") can be told apart. The
// horizontal PlantStrip truncated those names.
import { View, Text, Image, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import Icon from './Icon';
import { colors, radius } from '../lib/theme';

export function PlantPickList({ plants, onSelect, onAddPlant }) {
  return (
    <View style={styles.card}>
      <ScrollView>
        {plants.map((plant) => (
          <TouchableOpacity
            key={plant.id}
            style={[styles.row, styles.rowBorder]}
            onPress={() => onSelect(plant.id)}
            accessibilityRole="button"
            accessibilityLabel={plant.name}>
            <View style={styles.thumb}>
              {plant.photoUri ? (
                <Image source={{ uri: plant.photoUri }} style={styles.thumbImage} />
              ) : (
                <Text style={styles.thumbInitial}>{plant.name?.[0]?.toUpperCase() ?? '?'}</Text>
              )}
            </View>
            <Text style={styles.name}>{plant.name}</Text>
            <Icon name="chevron-right" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}

        {onAddPlant && (
          <TouchableOpacity
            style={styles.row}
            onPress={onAddPlant}
            accessibilityRole="button"
            accessibilityLabel="Nouvelle plante">
            <View style={styles.addCircle}>
              <Icon name="plus" size={18} color={colors.accent} />
            </View>
            <Text style={styles.addText}>Nouvelle plante</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.softGreen,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: '100%' },
  thumbInitial: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16, color: colors.text },
  name: {
    flex: 1,
    fontFamily: 'InstrumentSans_600SemiBold',
    fontSize: 15,
    lineHeight: 20,
    color: colors.text,
  },
  addCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 15, color: colors.accent },
});
