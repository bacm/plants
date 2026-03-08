import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
  FlatList,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { GradientHero } from '../../../components/GradientHero';
import { GlassCard } from '../../../components/GlassCard';
import { colors, spacing, typography, radius } from '../../../lib/theme';
import { getZones, getPlants, getPlantsByZoneWithPhotos } from '../../../lib/db';

export default function ZonesScreen() {
  const router = useRouter();
  const [zones, setZones] = useState([]);
  const [counts, setCounts] = useState({});
  const [plantsPhotos, setPlantsPhotos] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const z = await getZones();
    setZones(z);
    const next = {};
    const photos = {};
    for (const zone of z) {
      const zonePlants = await getPlants({ zoneId: zone.id });
      next[zone.id] = zonePlants.length;
      const plantsWithPhotos = await getPlantsByZoneWithPhotos(zone.id);
      photos[zone.id] = plantsWithPhotos.filter(p => p.photoUri);
    }
    setCounts(next);
    setPlantsPhotos(photos);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.dark.accent}
          />
        }
      >
        <GradientHero>
          <Text style={styles.heroTitle}>Zones</Text>
          <Text style={styles.heroSubtitle}>
            Bacs, massifs et emplacements
          </Text>
        </GradientHero>

        <View style={styles.section}>
          {zones.length === 0 ? (
            <GlassCard>
              <Text style={styles.emptyText}>
                Aucune zone. Créez une zone (ex. « Balcon », « Massif nord ») puis assignez-y des plantes.
              </Text>
              <TouchableOpacity
                style={styles.addZoneBtn}
                onPress={() => router.push('/zone/new')}
              >
                <Text style={styles.addZoneBtnText}>+ Créer une zone</Text>
              </TouchableOpacity>
            </GlassCard>
          ) : (
            zones.map((zone) => (
              <TouchableOpacity
                key={zone.id}
                activeOpacity={0.9}
                onPress={() => router.push(`/zones/${zone.id}`)}
                style={styles.cardWrap}
              >
                <GlassCard>
                  <View style={styles.row}>
                    <View style={styles.zoneInfo}>
                      <Text style={styles.zoneName}>{zone.name}</Text>
                      {zone.description ? (
                        <Text style={styles.zoneDesc} numberOfLines={1}>
                          {zone.description}
                        </Text>
                      ) : null}
                      {(plantsPhotos[zone.id] || []).length > 0 && (
                        <FlatList
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          data={plantsPhotos[zone.id]}
                          keyExtractor={(item, idx) => idx.toString()}
                          renderItem={({ item }) => (
                            <View style={styles.plantItem}>
                              <Image source={{ uri: item.photoUri }} style={styles.plantThumb} />
                              <Text style={styles.plantName} numberOfLines={1}>{item.name}</Text>
                            </View>
                          )}
                          style={styles.photosScroll}
                          contentContainerStyle={styles.photosContent}
                        />
                      )}
                    </View>
                    <View style={styles.countBadge}>
                      <Text style={styles.countText}>{counts[zone.id] ?? 0}</Text>
                      <Text style={styles.countLabel}>plantes</Text>
                    </View>
                  </View>
                </GlassCard>
              </TouchableOpacity>
            ))
          )}
        </View>

        {zones.length > 0 && (
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.push('/zone/new')}
            >
              <Text style={styles.secondaryButtonText}>+ Nouvelle zone</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  heroTitle: {
    ...typography.display,
    color: colors.dark.text,
    marginBottom: 4,
  },
  heroSubtitle: { ...typography.bodySmall, color: colors.dark.textSecondary },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  emptyText: {
    ...typography.bodySmall,
    color: colors.dark.textSecondary,
    marginBottom: spacing.md,
  },
  addZoneBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.dark.accent,
    borderRadius: radius.md,
  },
  addZoneBtnText: { ...typography.label, color: '#fff' },
  cardWrap: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  zoneInfo: { flex: 1, marginRight: spacing.sm },
  zoneName: { ...typography.title, color: colors.dark.text },
  zoneDesc: { ...typography.bodySmall, color: colors.dark.textSecondary, marginTop: 2 },
  photosScroll: { marginTop: spacing.sm, height: 80 },
  photosContent: { paddingRight: spacing.md },
  plantItem: { alignItems: 'center', marginRight: spacing.sm, width: 60 },
  plantThumb: { width: 50, height: 50, borderRadius: radius.sm },
  plantName: { ...typography.caption, color: colors.dark.textSecondary, marginTop: 4, textAlign: 'center', maxWidth: 60 },
  countBadge: { alignItems: 'center' },
  countText: { ...typography.displaySmall, color: colors.dark.accent },
  countLabel: { ...typography.caption, color: colors.dark.textSecondary },
  footer: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  secondaryButton: {
    paddingVertical: 16,
    borderRadius: radius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  secondaryButtonText: { ...typography.label, color: colors.dark.textSecondary },
});
