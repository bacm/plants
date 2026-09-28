import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { GradientHero } from '../../components/GradientHero';
import { GlassCard } from '../../components/GlassCard';
import Icon from '../../components/Icon';
import { colors, spacing, typography, radius, shadow, colorHex } from '../../lib/theme';
import { getPlants, getZones } from '../../lib/db';
import { SUN, choices, isUnknown, labelFor } from '../../lib/enums';

export default function LibraryScreen() {
  const router = useRouter();
  const [plants, setPlants] = useState([]);
  const [zones, setZones] = useState([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState(null);
  const [sunFilter, setSunFilter] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const latestRequestId = useRef(0);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(handle);
  }, [search]);

  const load = useCallback(async () => {
    const requestId = ++latestRequestId.current;
    const [p, z] = await Promise.all([
      getPlants({
        search: debouncedSearch || undefined,
        zoneId: zoneFilter || undefined,
        sun: sunFilter || undefined,
      }),
      getZones(),
    ]);
    // Ignore a response that arrives after a newer request has been made.
    if (requestId !== latestRequestId.current) return;
    setPlants(p);
    setZones(z);
  }, [debouncedSearch, zoneFilter, sunFilter]);

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
        <GradientHero>
          <Text style={styles.heroTitle}>Bibliothèque</Text>
          <Text style={styles.heroSubtitle}>Toutes vos plantes</Text>
        </GradientHero>

        <View style={styles.searchRow}>
          <GlassCard style={styles.searchCard}>
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher (nom, couleur…)"
              placeholderTextColor={colors.textSecondary}
              value={search}
              onChangeText={setSearch}
            />
          </GlassCard>
        </View>

        <View style={styles.filters}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersContent}>
            <TouchableOpacity
              onPress={() => setZoneFilter(null)}
              style={[styles.filterPill, !zoneFilter && styles.filterPillActive]}>
              <Text style={[styles.filterPillText, !zoneFilter && styles.filterPillTextActive]}>
                Toutes zones
              </Text>
            </TouchableOpacity>
            {zones.map((z) => (
              <TouchableOpacity
                key={z.id}
                onPress={() => setZoneFilter(zoneFilter === z.id ? null : z.id)}
                style={[styles.filterPill, zoneFilter === z.id && styles.filterPillActive]}>
                <Text
                  style={[
                    styles.filterPillText,
                    zoneFilter === z.id && styles.filterPillTextActive,
                  ]}>
                  {z.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.sunFilters}>
          {choices(SUN).map(({ value: s, label }) => (
            <TouchableOpacity
              key={s}
              onPress={() => setSunFilter(sunFilter === s ? null : s)}
              style={[styles.sunPill, sunFilter === s && styles.sunPillActive]}>
              <Text style={[styles.sunPillText, sunFilter === s && styles.sunPillTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.section}>
          {plants.length === 0 ? (
            <GlassCard>
              <Text style={styles.emptyText}>
                {search || zoneFilter || sunFilter
                  ? 'Aucun résultat. Modifiez les filtres.'
                  : 'Aucune plante. Ajoutez votre première plante.'}
              </Text>
            </GlassCard>
          ) : (
            plants.map((p) => (
              <TouchableOpacity
                key={p.id}
                activeOpacity={0.9}
                onPress={() => router.push(`/plant/${p.id}`)}
                style={styles.cardWrap}>
                <GlassCard>
                  <View style={styles.row}>
                    <View style={[styles.colorDot, { backgroundColor: colorHex(p.flowerColor) }]} />
                    <View style={styles.plantInfo}>
                      <Text style={styles.plantName}>{p.name}</Text>
                      <Text style={styles.meta}>
                        {p.zoneName || 'Sans zone'}
                        {isUnknown(p.sun) ? '' : ` · ${labelFor(SUN, p.sun)}`}
                      </Text>
                    </View>
                    <Icon name="chevron-right" size={18} color={colors.textSecondary} />
                  </View>
                </GlassCard>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>

      <TouchableOpacity
        style={[styles.fab, shadow.card]}
        onPress={() => router.push('/plant/new')}
        accessibilityLabel="Ajouter une plante"
        accessibilityRole="button">
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 72 },
  heroTitle: { ...typography.display, color: colors.text, marginBottom: 4 },
  heroSubtitle: { ...typography.bodySmall, color: colors.textSecondary },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.md,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: { fontSize: 28, lineHeight: 30, color: '#fff', fontWeight: '600' },
  searchRow: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  searchCard: { paddingVertical: 12, paddingHorizontal: 16 },
  searchInput: {
    ...typography.body,
    color: colors.text,
    padding: 0,
  },
  filters: { marginTop: spacing.md },
  filtersContent: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  filterPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
  },
  filterPillActive: { backgroundColor: colors.accent },
  filterPillText: { ...typography.caption, color: colors.textSecondary },
  filterPillTextActive: { color: '#fff' },
  sunFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  sunPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  sunPillActive: { backgroundColor: colors.accentSoft },
  sunPillText: { ...typography.caption, color: colors.textSecondary },
  sunPillTextActive: { color: '#fff' },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  emptyText: { ...typography.bodySmall, color: colors.textSecondary },
  cardWrap: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  colorDot: { width: 12, height: 12, borderRadius: 6, marginRight: spacing.md },
  plantInfo: { flex: 1 },
  plantName: { ...typography.title, color: colors.text },
  meta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
});
