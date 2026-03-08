import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { GradientHero } from '../../../components/GradientHero';
import { GlassCard } from '../../../components/GlassCard';
import { colors, spacing, typography, radius } from '../../../lib/theme';
import { getZones, getPlants } from '../../../lib/db';

export default function ZoneDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [zone, setZone] = useState(null);
  const [plants, setPlants] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const zones = await getZones();
    const z = zones.find((x) => x.id === id) || null;
    setZone(z);
    if (id) {
      const p = await getPlants({ zoneId: id });
      setPlants(p);
    }
  }, [id]);

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

  if (!zone) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>Chargement…</Text>
      </View>
    );
  }

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
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Retour</Text>
          </TouchableOpacity>
          <Text style={styles.heroTitle}>{zone.name}</Text>
          {zone.description ? (
            <Text style={styles.heroSubtitle}>{zone.description}</Text>
          ) : null}
          <Text style={styles.plantCount}>{plants.length} plante{plants.length !== 1 ? 's' : ''}</Text>
        </GradientHero>

        <View style={styles.section}>
          {plants.length === 0 ? (
            <GlassCard>
              <Text style={styles.emptyText}>
                Aucune plante dans cette zone. Ajoutez des plantes et assignez-les à « {zone.name} ».
              </Text>
              <TouchableOpacity
                style={styles.addBtn}
                onPress={() => router.push('/plant/new')}
              >
                <Text style={styles.addBtnText}>+ Ajouter une plante</Text>
              </TouchableOpacity>
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
                      {p.latinName ? (
                        <Text style={styles.latin}>{p.latinName}</Text>
                      ) : null}
                    </View>
                    <Text style={styles.chevron}>→</Text>
                  </View>
                </GlassCard>
              </TouchableOpacity>
            ))
          )}
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
  placeholder: { ...typography.body, color: colors.dark.textSecondary, padding: spacing.lg },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  backBtn: { marginBottom: 8 },
  backBtnText: { ...typography.bodySmall, color: colors.dark.textSecondary },
  heroTitle: { ...typography.display, color: colors.dark.text, marginBottom: 4 },
  heroSubtitle: { ...typography.bodySmall, color: colors.dark.textSecondary },
  plantCount: { ...typography.caption, color: colors.dark.accent, marginTop: 8 },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  emptyText: { ...typography.bodySmall, color: colors.dark.textSecondary, marginBottom: spacing.md },
  addBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.dark.accent,
    borderRadius: radius.md,
  },
  addBtnText: { ...typography.label, color: '#fff' },
  cardWrap: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  colorDot: { width: 12, height: 12, borderRadius: 6, marginRight: spacing.md },
  plantInfo: { flex: 1 },
  plantName: { ...typography.title, color: colors.dark.text },
  latin: { ...typography.bodySmall, color: colors.dark.textSecondary, marginTop: 2 },
  chevron: { ...typography.body, color: colors.dark.textSecondary },
});
