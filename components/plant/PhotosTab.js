// The plant detail screen's Photos tab (ticket 067): the gallery grouped by
// month in a 3-column grid, with an "En fleur" tag on a photo whose date has
// a matching bloom observation. app/plant/[id].js owns data loading, the
// lightbox and every handler passed in here.
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import Icon from '../Icon';
import { colors, spacing, typography, radius } from '../../lib/theme';
import { groupPhotosByMonth } from '../../lib/photoGroups';

export function PhotosTab({ photos, bloomDates, onAddPhoto, onSelectPhoto, onDeletePhoto }) {
  const groups = groupPhotosByMonth(photos);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Mes photos</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={onAddPhoto}
          accessibilityRole="button"
          // Distinct from the photo-date modal's own "Ajouter" confirm
          // button (both read "Ajouter" on screen) so e2e/web-smoke.spec.js
          // can target each by accessible name without ambiguity.
          accessibilityLabel="Ajouter une photo">
          <Icon name="plus" size={18} color={colors.text} />
          <Text style={styles.addButtonText}>Ajouter</Text>
        </TouchableOpacity>
      </View>

      {photos.length === 0 ? (
        <TouchableOpacity style={styles.emptyState} onPress={onAddPhoto}>
          <Icon name="camera-outline" size={40} color={colors.textSecondary} />
          <Text style={styles.emptyHint}>Appuyez pour ajouter une photo</Text>
        </TouchableOpacity>
      ) : (
        groups.map((group) => (
          <View key={group.key} style={styles.group}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            <View style={styles.grid}>
              {group.photos.map((photo) => (
                <TouchableOpacity
                  key={photo.id}
                  style={styles.photoTile}
                  onPress={() => onSelectPhoto(photo)}
                  onLongPress={() => onDeletePhoto(photo)}
                  activeOpacity={0.9}
                  // No text sits on the photo itself, so this is the only
                  // selector Maestro (e2e/ios) has for tapping/long-pressing
                  // a specific photo. See docs/backlog/055.
                  accessibilityLabel={`Photo du ${photo.date}`}>
                  <Image source={{ uri: photo.uri }} style={styles.photoImage} resizeMode="cover" />
                  {bloomDates?.has(photo.date) ? (
                    <View style={styles.bloomPill}>
                      <View style={styles.bloomDot} />
                      <Text style={styles.bloomPillText}>En fleur</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 18 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...typography.displaySmall, color: colors.text },
  addButton: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addButtonText: { ...typography.label, fontWeight: '600', color: colors.text },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  emptyHint: { ...typography.caption, color: colors.textSecondary },
  group: { gap: 10 },
  groupTitle: {
    ...typography.caption,
    fontWeight: '600',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  photoTile: {
    width: '32%',
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  photoImage: { width: '100%', height: '100%' },
  bloomPill: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.92)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bloomDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.blush },
  bloomPillText: { ...typography.caption, fontSize: 11, fontWeight: '600', color: colors.text },
});
