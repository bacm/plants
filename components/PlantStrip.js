// The zone switcher + horizontal plant list shared by the in-app camera
// (app/capture.js, ticket 056) and the "À trier" sorting screen
// (app/sort.js, ticket 061), so the one strip only exists in one place.
import { View, Text, Image, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { colors, spacing, typography, radius } from '../lib/theme';

export const UNSORTED_ID = '__unsorted__';

/**
 * `zones`/`zoneId`/`onSelectZone` drive the zone chip row; `null` selects
 * "Sans zone". `plants`/`selectedId`/`onSelect` drive the plant thumbnails
 * below it (each plant's latest photo, or an initial when it has none).
 * `showUnsorted` prepends a "?" / "À trier" item selectable with
 * `UNSORTED_ID`. `onAddPlant`, when given, appends a trailing "+" item.
 */
export function PlantStrip({
  zones,
  zoneId,
  onSelectZone,
  plants,
  selectedId,
  onSelect,
  showUnsorted = false,
  onAddPlant,
}) {
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.zoneScroll}>
        <TouchableOpacity
          style={[styles.zoneChip, zoneId === null && styles.zoneChipActive]}
          onPress={() => onSelectZone(null)}>
          <Text style={[styles.zoneChipText, zoneId === null && styles.zoneChipTextActive]}>
            Sans zone
          </Text>
        </TouchableOpacity>
        {zones.map((z) => (
          <TouchableOpacity
            key={z.id}
            style={[styles.zoneChip, zoneId === z.id && styles.zoneChipActive]}
            onPress={() => onSelectZone(z.id)}>
            <Text style={[styles.zoneChipText, zoneId === z.id && styles.zoneChipTextActive]}>
              {z.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.plantStrip}>
        {showUnsorted && (
          <TouchableOpacity
            style={[styles.plantItem, selectedId === UNSORTED_ID && styles.plantItemSelected]}
            onPress={() => onSelect(UNSORTED_ID)}>
            <View style={styles.plantThumb}>
              <Text style={styles.plantThumbInitial}>?</Text>
            </View>
            <Text style={styles.plantName}>À trier</Text>
          </TouchableOpacity>
        )}

        {plants.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={[styles.plantItem, selectedId === p.id && styles.plantItemSelected]}
            onPress={() => onSelect(p.id)}>
            <View style={styles.plantThumb}>
              {p.photoUri ? (
                <Image source={{ uri: p.photoUri }} style={styles.plantThumbImage} />
              ) : (
                <Text style={styles.plantThumbInitial}>{p.name?.[0]?.toUpperCase() ?? '?'}</Text>
              )}
            </View>
            <Text style={styles.plantName} numberOfLines={1}>
              {p.name}
            </Text>
          </TouchableOpacity>
        ))}

        {onAddPlant && (
          <TouchableOpacity style={styles.plantItem} onPress={onAddPlant}>
            <View style={styles.plantThumb}>
              <Text style={styles.plantThumbInitial}>+</Text>
            </View>
            <Text style={styles.plantName}>Nouvelle</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  zoneScroll: { marginBottom: spacing.sm },
  zoneChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceGlass,
    marginRight: spacing.xs,
  },
  zoneChipActive: { backgroundColor: colors.accent },
  zoneChipText: { ...typography.caption, color: colors.text },
  zoneChipTextActive: { color: '#fff' },

  plantStrip: { marginBottom: spacing.sm },
  plantItem: { alignItems: 'center', marginRight: spacing.md, width: 64 },
  plantItemSelected: { opacity: 1 },
  plantThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  plantThumbImage: { width: '100%', height: '100%' },
  plantThumbInitial: { ...typography.title, color: colors.text },
  plantName: { ...typography.caption, color: colors.text, marginTop: 4 },
});
