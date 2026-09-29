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
import Icon from '../../../components/Icon';
import { colors, spacing, typography, radius } from '../../../lib/theme';
import { getZones, getPlantsByZoneWithImages, getZoneContextInfo } from '../../../lib/db';
import {
  SUN,
  REMINDER_KINDS,
  isUnknown,
  labelFor,
  DEFAULT_ZONE_ICON,
  zoneIconFor,
} from '../../../lib/enums';
import { parseImageUrls } from '../../../lib/plantFields';
import { plural } from '../../../lib/text';

const THUMB_COLUMNS = 4;

function getContextLine(info) {
  if (!info) return null;
  const { lastWatering, nextReminder, sunInfo } = info;

  if (lastWatering?.date) {
    const days = Math.floor((Date.now() - new Date(lastWatering.date).getTime()) / 86400000);
    if (days <= 14) {
      const label =
        days === 0 ? "aujourd'hui" : days === 1 ? 'il y a 1 jour' : `il y a ${days} jours`;
      return `Dernier arrosage : ${label}`;
    }
  }

  if (nextReminder?.nextDueDate) {
    const days = Math.floor((new Date(nextReminder.nextDueDate).getTime() - Date.now()) / 86400000);
    const kind =
      REMINDER_KINDS.find((k) => k.value === nextReminder.kind)?.noun || nextReminder.kind;
    if (days <= 0) return `${kind.charAt(0).toUpperCase() + kind.slice(1)} : aujourd'hui`;
    return `Prochain ${kind} : ${days} jour${days > 1 ? 's' : ''}`;
  }

  if (sunInfo?.sun && !isUnknown(sunInfo.sun)) {
    return `Exposition : ${labelFor(SUN, sunInfo.sun)}`;
  }

  return null;
}

function getPlantImage(plant) {
  if (plant.photoUri) return plant.photoUri;
  return parseImageUrls(plant.imageUrls)[0] || null;
}

export default function ZonesScreen() {
  const router = useRouter();
  const [zones, setZones] = useState([]);
  const [zonePlants, setZonePlants] = useState({});
  const [zoneContexts, setZoneContexts] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [imageLoadErrors, setImageLoadErrors] = useState({});

  const markImageLoadError = useCallback((plantId) => {
    setImageLoadErrors((prev) => (prev[plantId] ? prev : { ...prev, [plantId]: true }));
  }, []);

  const load = useCallback(async () => {
    const z = await getZones();
    setZones(z);
    const results = await Promise.all(
      z.map((zone) =>
        Promise.all([getPlantsByZoneWithImages(zone.id), getZoneContextInfo(zone.id)])
      )
    );
    const plants = {};
    const contexts = {};
    z.forEach((zone, idx) => {
      plants[zone.id] = results[idx][0];
      contexts[zone.id] = results[idx][1];
    });
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }>
        <View style={styles.headerTextWrap}>
          <Text style={styles.eyebrow}>
            Votre jardin · {zones.length} {plural(zones.length, 'zone', 'zones')}
          </Text>
          <Text style={styles.title} accessibilityRole="header">
            Zones
          </Text>
        </View>

        {zones.length === 0 ? (
          <Text style={styles.emptyText}>
            Aucune zone. Créez une zone (ex. « Balcon », « Potager ») puis assignez-y des plantes.
          </Text>
        ) : (
          <View style={styles.list}>
            {zones.map((zone) => {
              const plants = zonePlants[zone.id] || [];
              const context = getContextLine(zoneContexts[zone.id]);
              const { icon, tint } = zoneIconFor(zone.icon || DEFAULT_ZONE_ICON);
              const count = plants.length;
              return (
                <TouchableOpacity
                  key={zone.id}
                  activeOpacity={0.85}
                  onPress={() => router.push(`/zones/${zone.id}`)}
                  style={styles.card}>
                  <View style={styles.cardTopRow}>
                    <View style={[styles.iconSquare, { backgroundColor: colors[tint] }]}>
                      <Icon name={icon} size={22} color={colors.text} />
                    </View>
                    <View style={styles.zoneTextCol}>
                      <Text style={styles.zoneName} numberOfLines={1}>
                        {zone.name}
                      </Text>
                      {zone.description ? (
                        <Text style={styles.zoneDesc} numberOfLines={1}>
                          {zone.description}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.countPill}>
                      <Text style={styles.countPillText}>
                        {count} {plural(count, 'plante', 'plantes')}
                      </Text>
                    </View>
                  </View>

                  {plants.length > 0 && (
                    <View style={styles.thumbRow}>
                      {plants.slice(0, THUMB_COLUMNS).map((plant, idx) => {
                        const img = imageLoadErrors[plant.id] ? null : getPlantImage(plant);
                        return (
                          <View key={plant.id || idx} style={styles.thumbCol}>
                            {img ? (
                              <Image
                                source={{ uri: img }}
                                style={styles.thumb}
                                onError={() => markImageLoadError(plant.id)}
                              />
                            ) : (
                              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                                <Icon
                                  name="leaf"
                                  size={18}
                                  color={colors.sage}
                                  style={styles.thumbPlaceholderIcon}
                                />
                              </View>
                            )}
                            <Text style={styles.thumbName} numberOfLines={1}>
                              {plant.name}
                            </Text>
                          </View>
                        );
                      })}
                      {/* Empty columns keep a fixed 4-column grid when a zone has
                          fewer plants, as in the mock-up. */}
                      {Array.from(
                        { length: Math.max(0, THUMB_COLUMNS - plants.length) },
                        (_, i) => (
                          <View key={`empty-${i}`} style={styles.thumbCol} />
                        )
                      )}
                    </View>
                  )}

                  {context && (
                    <View style={styles.contextRow}>
                      <Icon name="water-outline" size={14} color={colors.textSecondary} />
                      <Text style={styles.contextText}>{context}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <TouchableOpacity
          testID="zone-list-new-button"
          style={styles.dashedButton}
          onPress={() => router.push('/zone/new')}
          activeOpacity={0.7}>
          <Icon name="plus" size={20} color={colors.accent} />
          <Text style={styles.dashedButtonText}>Nouvelle zone</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: 64,
    paddingHorizontal: spacing.lg,
    paddingBottom: 140,
    gap: 20,
  },
  headerTextWrap: { gap: 6 },
  eyebrow: {
    fontFamily: 'InstrumentSans_500Medium',
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  title: {
    fontFamily: 'Fraunces_400Regular',
    fontSize: 40,
    lineHeight: 42,
    letterSpacing: -0.8,
    color: colors.text,
  },
  emptyText: { ...typography.bodySmall, color: colors.textSecondary },
  list: { gap: 12 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.track,
    borderRadius: radius.xl,
    padding: 16,
    gap: 12,
  },
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
  zoneDesc: { ...typography.bodySmall, fontSize: 13, color: colors.textSecondary },
  countPill: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: colors.highlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPillText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12, color: colors.accent },
  thumbRow: { flexDirection: 'row', gap: 8 },
  thumbCol: { flex: 1, gap: 4, minWidth: 0 },
  thumb: { height: 52, borderRadius: 14 },
  thumbPlaceholder: {
    backgroundColor: colors.softGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPlaceholderIcon: { opacity: 0.35 },
  thumbName: {
    fontFamily: 'InstrumentSans_500Medium',
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  contextRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  contextText: { ...typography.bodySmall, fontSize: 13, color: colors.textSecondary },
  dashedButton: {
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dashedButtonText: {
    fontFamily: 'InstrumentSans_600SemiBold',
    fontSize: 15,
    color: colors.accent,
  },
});
