import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { GlassCard } from '../../../components/GlassCard';
import { colors, spacing, typography, radius } from '../../../lib/theme';
import { getZones, getPlantsByZoneWithImages, getZoneContextInfo } from '../../../lib/db';

const SUN_LABELS = {
  full_sun: 'Plein Soleil',
  partial: 'Mi-Ombre',
  shade: 'Ombre',
};

const REMINDER_LABELS = {
  water: 'arrosage',
  prune: 'taille',
  fertilize: 'fertilisation',
  deadhead: 'défloraison',
  winter_prep: 'préparation hivernale',
  custom: 'rappel',
};

function getContextLine(info) {
  if (!info) return null;
  const { lastWatering, nextReminder, sunInfo } = info;

  if (lastWatering?.date) {
    const days = Math.floor(
      (Date.now() - new Date(lastWatering.date).getTime()) / 86400000
    );
    if (days <= 14) {
      const label =
        days === 0
          ? "aujourd'hui"
          : days === 1
          ? 'il y a 1 jour'
          : `il y a ${days} jours`;
      return `Dernier arrosage : ${label}`;
    }
  }

  if (nextReminder?.nextDueDate) {
    const days = Math.floor(
      (new Date(nextReminder.nextDueDate).getTime() - Date.now()) / 86400000
    );
    const kind = REMINDER_LABELS[nextReminder.kind] || nextReminder.kind;
    if (days <= 0)
      return `${kind.charAt(0).toUpperCase() + kind.slice(1)} : aujourd'hui`;
    return `Prochain ${kind} : ${days} jour${days > 1 ? 's' : ''}`;
  }

  if (sunInfo?.sun) {
    return `Exposition : ${SUN_LABELS[sunInfo.sun] || sunInfo.sun}`;
  }

  return null;
}

function getPlantImage(plant) {
  if (plant.photoUri) return plant.photoUri;
  if (plant.imageUrls) {
    try {
      const urls = JSON.parse(plant.imageUrls);
      if (urls.length > 0) return urls[0];
    } catch {}
  }
  return null;
}

export default function ZonesScreen() {
  const router = useRouter();
  const [zones, setZones] = useState([]);
  const [zonePlants, setZonePlants] = useState({});
  const [zoneContexts, setZoneContexts] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const z = await getZones();
    setZones(z);
    const plants = {};
    const contexts = {};
    for (const zone of z) {
      plants[zone.id] = await getPlantsByZoneWithImages(zone.id);
      contexts[zone.id] = await getZoneContextInfo(zone.id);
    }
    setZonePlants(plants);
    setZoneContexts(contexts);
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
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.heroTitle}>Mes Zones de Jardin</Text>
            <Text style={styles.heroSubtitle}>
              Organisez les zones de votre jardin
            </Text>
          </View>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => {}}
            activeOpacity={0.7}
          >
            <Text style={styles.settingsIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          {zones.length === 0 ? (
            <GlassCard>
              <Text style={styles.emptyText}>
                Aucune zone. Créez une zone (ex. « Balcon », « Potager ») puis
                assignez-y des plantes.
              </Text>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => router.push('/zone/new')}
              >
                <Text style={styles.primaryBtnText}>+ Créer une zone</Text>
              </TouchableOpacity>
            </GlassCard>
          ) : (
            zones.map((zone) => {
              const plants = zonePlants[zone.id] || [];
              const context = getContextLine(zoneContexts[zone.id]);
              return (
                <TouchableOpacity
                  key={zone.id}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/zones/${zone.id}`)}
                  style={styles.cardWrap}
                >
                  <GlassCard>
                    {/* Zone header: icon + name + count */}
                    <View style={styles.cardHeader}>
                      <View style={styles.zoneInfo}>
                        <View style={styles.zoneNameRow}>
                          <Text style={styles.zoneIcon}>
                            {zone.icon || '🌱'}
                          </Text>
                          <Text style={styles.zoneName}>{zone.name}</Text>
                        </View>
                        {zone.description ? (
                          <Text style={styles.zoneDesc}>
                            ({zone.description})
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.countBadge}>
                        <Text style={styles.countText}>{plants.length}</Text>
                        <Text style={styles.countLabel}>plantes</Text>
                      </View>
                    </View>

                    {/* Plant thumbnails */}
                    {plants.length > 0 && (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.plantsScroll}
                        contentContainerStyle={styles.plantsRow}
                      >
                        {plants.map((plant, idx) => {
                          const img = getPlantImage(plant);
                          return (
                            <View key={plant.id || idx} style={styles.plantItem}>
                              {img ? (
                                <Image
                                  source={{ uri: img }}
                                  style={styles.plantThumb}
                                />
                              ) : (
                                <View
                                  style={[
                                    styles.plantThumb,
                                    styles.plantPlaceholder,
                                  ]}
                                >
                                  <Text style={styles.plantPlaceholderText}>
                                    🌿
                                  </Text>
                                </View>
                              )}
                              <Text
                                style={styles.plantName}
                                numberOfLines={1}
                              >
                                {plant.name}
                              </Text>
                            </View>
                          );
                        })}
                      </ScrollView>
                    )}

                    {/* Context info line */}
                    {context && (
                      <Text style={styles.contextLine}>{context}</Text>
                    )}
                  </GlassCard>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* Add zone button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/zone/new')}
            activeOpacity={0.7}
          >
            <Text style={styles.addButtonText}>
              + AJOUTER UNE NOUVELLE ZONE
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
    paddingBottom: spacing.lg,
  },
  headerLeft: { flex: 1, marginRight: spacing.md },
  heroTitle: {
    ...typography.display,
    color: colors.dark.text,
    marginBottom: 4,
  },
  heroSubtitle: {
    ...typography.bodySmall,
    color: colors.dark.textSecondary,
  },
  settingsBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  settingsIcon: { fontSize: 20 },

  // Section
  section: { paddingHorizontal: spacing.lg },

  // Empty state
  emptyText: {
    ...typography.bodySmall,
    color: colors.dark.textSecondary,
    marginBottom: spacing.md,
  },
  primaryBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.dark.accent,
    borderRadius: radius.md,
  },
  primaryBtnText: { ...typography.label, color: '#fff' },

  // Card
  cardWrap: { marginBottom: spacing.md },

  // Card header
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  zoneInfo: { flex: 1, marginRight: spacing.sm },
  zoneNameRow: { flexDirection: 'row', alignItems: 'center' },
  zoneIcon: { fontSize: 22, marginRight: 8 },
  zoneName: {
    ...typography.title,
    fontSize: 20,
    fontWeight: '700',
    color: colors.dark.text,
  },
  zoneDesc: {
    ...typography.bodySmall,
    color: colors.dark.textSecondary,
    marginTop: 2,
    marginLeft: 30,
  },
  countBadge: { alignItems: 'center', marginLeft: spacing.sm },
  countText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.dark.accent,
  },
  countLabel: { ...typography.caption, color: colors.dark.textSecondary },

  // Plant thumbnails
  plantsScroll: { marginTop: spacing.md },
  plantsRow: { paddingRight: spacing.sm },
  plantItem: {
    alignItems: 'center',
    marginRight: spacing.md,
    width: 68,
  },
  plantThumb: {
    width: 60,
    height: 60,
    borderRadius: radius.sm,
  },
  plantPlaceholder: {
    backgroundColor: colors.dark.surface,
    borderWidth: 1,
    borderColor: colors.dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plantPlaceholderText: { fontSize: 24 },
  plantName: {
    ...typography.caption,
    color: colors.dark.textSecondary,
    marginTop: 6,
    textAlign: 'center',
    maxWidth: 68,
  },

  // Context line
  contextLine: {
    ...typography.bodySmall,
    color: colors.dark.textSecondary,
    marginTop: spacing.md,
  },

  // Footer
  footer: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  addButton: {
    paddingVertical: 16,
    borderRadius: radius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.dark.border,
    borderStyle: 'dashed',
  },
  addButtonText: {
    ...typography.label,
    color: colors.dark.textSecondary,
    letterSpacing: 0.5,
  },
});
