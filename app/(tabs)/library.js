import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { GradientHero } from '../../components/GradientHero';
import { GlassCard } from '../../components/GlassCard';
import { colors, spacing, typography, radius } from '../../lib/theme';
import { getPlants, getZones, PLANT_TYPES, SUN } from '../../lib/db';

const SUN_LABELS = { full_sun: 'Plein soleil', partial: 'Mi-ombre', shade: 'Ombre' };

export default function LibraryScreen() {
  const router = useRouter();
  const [plants, setPlants] = useState([]);
  const [zones, setZones] = useState([]);
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState(null);
  const [sunFilter, setSunFilter] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [p, z] = await Promise.all([
      getPlants({
        search: search || undefined,
        zoneId: zoneFilter || undefined,
        sun: sunFilter || undefined,
      }),
      getZones(),
    ]);
    setPlants(p);
    setZones(z);
  }, [search, zoneFilter, sunFilter]);

  useEffect(() => {
    load();
  }, [load]);

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
          <Text style={styles.heroTitle}>Bibliothèque</Text>
          <Text style={styles.heroSubtitle}>
            Toutes vos plantes
          </Text>
        </GradientHero>

        <View style={styles.searchRow}>
          <GlassCard style={styles.searchCard}>
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher (nom, couleur…)"
              placeholderTextColor={colors.dark.textSecondary}
              value={search}
              onChangeText={setSearch}
            />
          </GlassCard>
        </View>

        <View style={styles.filters}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersContent}>
            <TouchableOpacity
              onPress={() => setZoneFilter(null)}
              style={[styles.filterPill, !zoneFilter && styles.filterPillActive]}
            >
              <Text style={[styles.filterPillText, !zoneFilter && styles.filterPillTextActive]}>
                Toutes zones
              </Text>
            </TouchableOpacity>
            {zones.map((z) => (
              <TouchableOpacity
                key={z.id}
                onPress={() => setZoneFilter(zoneFilter === z.id ? null : z.id)}
                style={[styles.filterPill, zoneFilter === z.id && styles.filterPillActive]}
              >
                <Text style={[styles.filterPillText, zoneFilter === z.id && styles.filterPillTextActive]}>
                  {z.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.sunFilters}>
          {SUN.map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => setSunFilter(sunFilter === s ? null : s)}
              style={[styles.sunPill, sunFilter === s && styles.sunPillActive]}
            >
              <Text style={[styles.sunPillText, sunFilter === s && styles.sunPillTextActive]}>
                {SUN_LABELS[s]}
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
                style={styles.cardWrap}
              >
                <GlassCard>
                  <View style={styles.row}>
                    <View style={[styles.colorDot, { backgroundColor: colorHex(p.flowerColor) }]} />
                    <View style={styles.plantInfo}>
                      <Text style={styles.plantName}>{p.name}</Text>
                      <Text style={styles.meta}>
                        {p.zoneName || 'Sans zone'} · {SUN_LABELS[p.sun] || p.sun}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>→</Text>
                  </View>
                </GlassCard>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/plant/new')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>+ Ajouter une plante</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

function colorHex(color) {
  if (!color) return colors.dark.sage;
  const c = (color || '').toLowerCase();
  const map = { rose: '#C9A9A6', rouge: '#B85450', blanc: '#E8E4DF', jaune: '#D4B854', bleu: '#6B8BAA', violet: '#B8A9C9', vert: '#6B9B7A', orange: '#C98B5A' };
  for (const [k, v] of Object.entries(map)) {
    if (c.includes(k)) return v;
  }
  return colors.dark.accentSoft;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  heroTitle: { ...typography.display, color: colors.dark.text, marginBottom: 4 },
  heroSubtitle: { ...typography.bodySmall, color: colors.dark.textSecondary },
  searchRow: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  searchCard: { paddingVertical: 12, paddingHorizontal: 16 },
  searchInput: {
    ...typography.body,
    color: colors.dark.text,
    padding: 0,
  },
  filters: { marginTop: spacing.md },
  filtersContent: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  filterPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    marginRight: spacing.sm,
  },
  filterPillActive: { backgroundColor: colors.dark.accent },
  filterPillText: { ...typography.caption, color: colors.dark.textSecondary },
  filterPillTextActive: { color: '#fff' },
  sunFilters: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: spacing.lg, marginTop: spacing.sm, gap: spacing.sm },
  sunPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
  },
  sunPillActive: { backgroundColor: colors.dark.accentSoft },
  sunPillText: { ...typography.caption, color: colors.dark.textSecondary },
  sunPillTextActive: { color: '#fff' },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  emptyText: { ...typography.bodySmall, color: colors.dark.textSecondary },
  cardWrap: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  colorDot: { width: 12, height: 12, borderRadius: 6, marginRight: spacing.md },
  plantInfo: { flex: 1 },
  plantName: { ...typography.title, color: colors.dark.text },
  meta: { ...typography.caption, color: colors.dark.textSecondary, marginTop: 2 },
  chevron: { ...typography.body, color: colors.dark.textSecondary },
  footer: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  primaryButton: {
    backgroundColor: colors.dark.accent,
    paddingVertical: 16,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  primaryButtonText: { ...typography.label, color: '#fff' },
});
