import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { GradientHero } from '../../components/GradientHero';
import { GlassCard } from '../../components/GlassCard';
import { colors, spacing, typography, radius, colorHex } from '../../lib/theme';
import { getPlantsBloomingInMonth } from '../../lib/db';
import { MONTH_SHORT, monthName } from '../../lib/months';

export default function BloomScreen() {
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [plants, setPlants] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const p = await getPlantsBloomingInMonth(selectedMonth);
    setPlants(p);
  }, [selectedMonth]);

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
        }>
        <GradientHero>
          <Text style={styles.heroTitle}>Floraison</Text>
          <Text style={styles.heroSubtitle}>Ce qui fleurit par mois</Text>
        </GradientHero>

        <View style={styles.monthStrip}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.monthStripContent}>
            {MONTH_SHORT.map((name, i) => {
              const month = i + 1;
              const isSelected = month === selectedMonth;
              return (
                <TouchableOpacity
                  key={month}
                  onPress={() => setSelectedMonth(month)}
                  style={[styles.monthPill, isSelected && styles.monthPillSelected]}>
                  <Text style={[styles.monthPillText, isSelected && styles.monthPillTextSelected]}>
                    {name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {monthName(selectedMonth)} — {plants.length} plante{plants.length !== 1 ? 's' : ''} en
            fleurs
          </Text>
          {plants.length === 0 ? (
            <GlassCard>
              <Text style={styles.emptyText}>
                Aucune plante en fleur ce mois-ci. Renseignez les mois de floraison sur vos fiches
                plantes.
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
                      {p.zoneName ? <Text style={styles.zoneTag}>{p.zoneName}</Text> : null}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  heroTitle: { ...typography.display, color: colors.dark.text, marginBottom: 4 },
  heroSubtitle: { ...typography.bodySmall, color: colors.dark.textSecondary },
  monthStrip: { paddingVertical: spacing.md },
  monthStripContent: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  monthPill: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    marginRight: spacing.sm,
  },
  monthPillSelected: { backgroundColor: colors.dark.accent },
  monthPillText: { ...typography.label, color: colors.dark.textSecondary },
  monthPillTextSelected: { color: '#fff' },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  sectionTitle: { ...typography.title, color: colors.dark.text, marginBottom: spacing.md },
  emptyText: { ...typography.bodySmall, color: colors.dark.textSecondary },
  cardWrap: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  colorDot: { width: 12, height: 12, borderRadius: 6, marginRight: spacing.md },
  plantInfo: { flex: 1 },
  plantName: { ...typography.title, color: colors.dark.text },
  zoneTag: { ...typography.caption, color: colors.dark.textSecondary, marginTop: 2 },
  chevron: { ...typography.body, color: colors.dark.textSecondary },
});
