// The zone switcher + horizontal plant list shared by the in-app camera
// (app/capture.js, ticket 056) and the "À trier" sorting screen
// (app/sort.js, ticket 061), so the one strip only exists in one place.
import { View, Text, Image, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import Icon from './Icon';
import { colors, spacing, typography, radius } from '../lib/theme';

export const UNSORTED_ID = '__unsorted__';

// `variant` picks the strip's palette (ticket 071): 'light' sits on the
// app's paper background (app/sort.js), 'dark' sits on the camera screen's
// dark bottom bar (app/capture.js).
const PALETTE = {
  light: {
    chipBg: colors.surface,
    chipBorder: colors.border,
    chipBgActive: colors.text,
    chipBorderActive: colors.text,
    chipLabel: colors.text,
    chipLabelActive: colors.background,
    thumbBg: colors.softGreen,
    thumbGlyph: colors.text,
    name: colors.textSecondary,
    nameSelected: colors.text,
  },
  dark: {
    chipBg: colors.onDarkChipBg,
    chipBorder: colors.onDarkBorder,
    chipBgActive: colors.background,
    chipBorderActive: colors.background,
    chipLabel: colors.background,
    chipLabelActive: colors.text,
    thumbBg: colors.onDarkChipBg,
    thumbGlyph: colors.background,
    name: colors.onDarkMuted,
    nameSelected: colors.background,
  },
};

/**
 * The zone chip row: a "Sans zone" chip (`zoneId === null`) plus one chip per
 * zone. Shared by PlantStrip and the sort screen's plant list (ticket 081).
 * `style` lets the caller override the row's margins.
 */
export function ZoneChips({ zones, zoneId, onSelectZone, variant = 'light', style }) {
  const p = PALETTE[variant];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.zoneScroll, style]}>
      <TouchableOpacity
        style={[
          styles.zoneChip,
          { backgroundColor: p.chipBg, borderColor: p.chipBorder },
          zoneId === null && { backgroundColor: p.chipBgActive, borderColor: p.chipBorderActive },
        ]}
        onPress={() => onSelectZone(null)}
        accessibilityRole="button"
        accessibilityLabel="Sans zone"
        accessibilityState={{ selected: zoneId === null }}>
        <Text
          style={[
            styles.zoneChipText,
            { color: zoneId === null ? p.chipLabelActive : p.chipLabel },
          ]}>
          Sans zone
        </Text>
      </TouchableOpacity>
      {zones.map((z) => {
        const selected = zoneId === z.id;
        return (
          <TouchableOpacity
            key={z.id}
            style={[
              styles.zoneChip,
              { backgroundColor: p.chipBg, borderColor: p.chipBorder },
              selected && { backgroundColor: p.chipBgActive, borderColor: p.chipBorderActive },
            ]}
            onPress={() => onSelectZone(z.id)}
            accessibilityRole="button"
            accessibilityLabel={z.name}
            accessibilityState={{ selected }}>
            <Text
              style={[styles.zoneChipText, { color: selected ? p.chipLabelActive : p.chipLabel }]}>
              {z.name}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/**
 * `zones`/`zoneId`/`onSelectZone` drive the zone chip row; `null` selects
 * "Sans zone". `plants`/`selectedId`/`onSelect` drive the plant thumbnails
 * below it (each plant's latest photo, or an initial when it has none).
 * `showUnsorted` prepends a "?" / "À trier" item selectable with
 * `UNSORTED_ID`. `onAddPlant`, when given, appends a trailing "+" item.
 * `variant` ('light' | 'dark', default 'light') picks the palette for the
 * panel the strip sits on.
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
  variant = 'light',
}) {
  const p = PALETTE[variant];

  const renderThumb = (selected, content) => (
    <View style={[styles.thumbRing, { borderColor: selected ? colors.highlight : 'transparent' }]}>
      <View style={[styles.plantThumb, { backgroundColor: p.thumbBg }]}>{content}</View>
    </View>
  );

  return (
    <View>
      <ZoneChips zones={zones} zoneId={zoneId} onSelectZone={onSelectZone} variant={variant} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.plantStrip}>
        {showUnsorted && (
          <TouchableOpacity
            style={styles.plantItem}
            onPress={() => onSelect(UNSORTED_ID)}
            accessibilityRole="button"
            accessibilityLabel="À trier"
            accessibilityState={{ selected: selectedId === UNSORTED_ID }}>
            {renderThumb(
              selectedId === UNSORTED_ID,
              <Icon name="help" size={20} color={p.thumbGlyph} />
            )}
            <Text
              style={[
                styles.plantName,
                { color: selectedId === UNSORTED_ID ? p.nameSelected : p.name },
                selectedId === UNSORTED_ID && styles.plantNameSelected,
              ]}>
              À trier
            </Text>
          </TouchableOpacity>
        )}

        {plants.map((plant) => {
          const selected = selectedId === plant.id;
          return (
            <TouchableOpacity
              key={plant.id}
              style={styles.plantItem}
              onPress={() => onSelect(plant.id)}
              accessibilityRole="button"
              accessibilityLabel={plant.name}
              accessibilityState={{ selected }}>
              {renderThumb(
                selected,
                plant.photoUri ? (
                  <Image source={{ uri: plant.photoUri }} style={styles.plantThumbImage} />
                ) : (
                  <Text style={[styles.plantThumbInitial, { color: p.thumbGlyph }]}>
                    {plant.name?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                )
              )}
              <Text
                style={[
                  styles.plantName,
                  { color: selected ? p.nameSelected : p.name },
                  selected && styles.plantNameSelected,
                ]}
                // Up to 3 lines, and a middle ellipsis past that: plants of
                // the same kind in one zone differ only by a trailing suffix
                // ("… est 1", "… ouest 2"), so the end must stay visible.
                numberOfLines={3}
                ellipsizeMode="middle">
                {plant.name}
              </Text>
            </TouchableOpacity>
          );
        })}

        {onAddPlant && (
          <TouchableOpacity
            style={styles.plantItem}
            onPress={onAddPlant}
            accessibilityRole="button"
            accessibilityLabel="Nouvelle plante">
            {renderThumb(false, <Icon name="plus" size={20} color={p.thumbGlyph} />)}
            <Text style={[styles.plantName, { color: p.name }]}>Nouvelle</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  zoneScroll: { marginBottom: spacing.sm },
  zoneChip: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    borderWidth: 1,
    marginRight: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneChipText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14 },

  plantStrip: { marginBottom: spacing.sm },
  plantItem: { alignItems: 'center', marginRight: spacing.sm, width: 80 },
  // The selected ring (2px `colors.highlight`, 3px gap from the avatar) is
  // built as a wrapping border + padding rather than a box-shadow, which
  // doesn't exist on native.
  thumbRing: {
    borderWidth: 2,
    padding: 3,
    borderRadius: radius.full,
  },
  plantThumb: {
    width: 50,
    height: 50,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  plantThumbImage: { width: '100%', height: '100%' },
  plantThumbInitial: { ...typography.title },
  plantName: { ...typography.caption, marginTop: 6, textAlign: 'center' },
  plantNameSelected: { fontFamily: 'InstrumentSans_600SemiBold' },
});
