import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { GradientHero } from '../../components/GradientHero';
import { GlassCard } from '../../components/GlassCard';
import { colors, spacing, typography, radius, colorHex } from '../../lib/theme';
import { getPlants, getPlantsBloomingInMonth } from '../../lib/db';
import { MONTH_SHORT, monthName } from '../../lib/months';
import { bloomMonthsOf, bloomGaps } from '../../lib/bloomCoverage';

const VIEWS = { month: 'month', year: 'year' };

export default function BloomScreen() {
  const router = useRouter();
  const [view, setView] = useState(VIEWS.month);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [plants, setPlants] = useState([]);
  const [allPlants, setAllPlants] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const currentMonth = new Date().getMonth() + 1;

  const load = useCallback(async () => {
    const [monthPlants, everyPlant] = await Promise.all([
      getPlantsBloomingInMonth(selectedMonth),
      getPlants(),
    ]);
    setPlants(monthPlants);
    setAllPlants(everyPlant);
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

  const bloomRows = useMemo(
    () =>
      allPlants
        .map((p) => ({ plant: p, months: bloomMonthsOf(p) }))
        .filter((row) => row.months.length > 0)
        .sort(
          (a, b) =>
            a.plant.bloomStartMonth - b.plant.bloomStartMonth ||
            a.plant.name.localeCompare(b.plant.name)
        ),
    [allPlants]
  );
  const plantsWithoutBloom = allPlants.length - bloomRows.length;
  const gaps = useMemo(() => bloomGaps(allPlants), [allPlants]);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }>
        <GradientHero>
          <Text style={styles.heroTitle}>Floraison</Text>
          <Text style={styles.heroSubtitle}>
            {view === VIEWS.month ? 'Ce qui fleurit par mois' : 'La floraison sur toute l’année'}
          </Text>
        </GradientHero>

        <View style={styles.viewSwitch}>
          <TouchableOpacity
            onPress={() => setView(VIEWS.month)}
            style={[styles.viewTab, view === VIEWS.month && styles.viewTabSelected]}>
            <Text style={[styles.viewTabText, view === VIEWS.month && styles.viewTabTextSelected]}>
              Par mois
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setView(VIEWS.year)}
            style={[styles.viewTab, view === VIEWS.year && styles.viewTabSelected]}>
            <Text style={[styles.viewTabText, view === VIEWS.year && styles.viewTabTextSelected]}>
              Sur l’année
            </Text>
          </TouchableOpacity>
        </View>

        {view === VIEWS.month ? (
          <>
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
                      <Text
                        style={[styles.monthPillText, isSelected && styles.monthPillTextSelected]}>
                        {name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {monthName(selectedMonth)} — {plants.length} plante
                {plants.length !== 1 ? 's' : ''} en fleurs
              </Text>
              {plants.length === 0 ? (
                <GlassCard>
                  <Text style={styles.emptyText}>
                    Aucune plante en fleur ce mois-ci. Renseignez les mois de floraison sur vos
                    fiches plantes.
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
                        <View
                          style={[styles.colorDot, { backgroundColor: colorHex(p.flowerColor) }]}
                        />
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
          </>
        ) : (
          <View style={styles.section}>
            {bloomRows.length === 0 ? (
              <GlassCard>
                <Text style={styles.emptyText}>
                  Aucune plante n’a de période de floraison renseignée.
                </Text>
              </GlassCard>
            ) : (
              <GlassCard style={styles.yearCard}>
                <View style={styles.yearHeaderRow}>
                  <View style={styles.yearLabelCol} />
                  <View style={styles.yearGrid}>
                    {MONTH_SHORT.map((name, i) => {
                      const month = i + 1;
                      const isGap = gaps.includes(month);
                      const isCurrent = month === currentMonth;
                      return (
                        <View
                          key={month}
                          style={[styles.yearHeaderCell, isGap && styles.yearHeaderCellGap]}>
                          <Text
                            style={[
                              styles.yearHeaderText,
                              isGap && styles.yearHeaderTextGap,
                              isCurrent && styles.yearHeaderTextCurrent,
                            ]}>
                            {name}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {bloomRows.map(({ plant, months }) => {
                  const monthSet = new Set(months);
                  const start = plant.bloomStartMonth;
                  const end = plant.bloomEndMonth;
                  const rangeLabel =
                    start === end
                      ? `fleurit en ${monthName(start)}`
                      : `fleurit de ${monthName(start)} à ${monthName(end)}`;
                  return (
                    <TouchableOpacity
                      key={plant.id}
                      activeOpacity={0.9}
                      onPress={() => router.push(`/plant/${plant.id}`)}
                      style={styles.yearRow}
                      accessibilityLabel={`${plant.name} : ${rangeLabel}`}>
                      <View style={styles.yearLabelCol}>
                        <Text style={styles.yearRowName} numberOfLines={1}>
                          {plant.name}
                        </Text>
                      </View>
                      <View style={styles.yearGrid}>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                          const isCovered = monthSet.has(month);
                          const isCurrent = month === currentMonth;
                          return (
                            <View
                              key={month}
                              style={[styles.yearBarCell, isCurrent && styles.yearBarCellCurrent]}>
                              {isCovered ? (
                                <View
                                  style={[
                                    styles.yearBar,
                                    { backgroundColor: colorHex(plant.flowerColor) },
                                  ]}
                                />
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </GlassCard>
            )}

            {gaps.length > 0 ? (
              <Text style={styles.yearLegend}>
                Cellule grisée dans l’en-tête = aucune floraison ce mois-ci.
              </Text>
            ) : null}
            {plantsWithoutBloom > 0 ? (
              <Text style={styles.yearLegend}>
                {plantsWithoutBloom} plante{plantsWithoutBloom !== 1 ? 's' : ''} sans période de
                floraison
              </Text>
            ) : null}
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  heroTitle: { ...typography.display, color: colors.text, marginBottom: 4 },
  heroSubtitle: { ...typography.bodySmall, color: colors.textSecondary },
  monthStrip: { paddingVertical: spacing.md },
  monthStripContent: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  monthPill: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    marginRight: spacing.sm,
  },
  monthPillSelected: { backgroundColor: colors.accent },
  monthPillText: { ...typography.label, color: colors.textSecondary },
  monthPillTextSelected: { color: '#fff' },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  sectionTitle: { ...typography.title, color: colors.text, marginBottom: spacing.md },
  emptyText: { ...typography.bodySmall, color: colors.textSecondary },
  cardWrap: { marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  colorDot: { width: 12, height: 12, borderRadius: 6, marginRight: spacing.md },
  plantInfo: { flex: 1 },
  plantName: { ...typography.title, color: colors.text },
  zoneTag: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  chevron: { ...typography.body, color: colors.textSecondary },
  viewSwitch: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  viewTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  viewTabSelected: { backgroundColor: colors.accent },
  viewTabText: { ...typography.label, color: colors.textSecondary },
  viewTabTextSelected: { color: '#fff' },
  yearCard: { paddingVertical: spacing.md },
  yearHeaderRow: { flexDirection: 'row', marginBottom: spacing.sm },
  yearLabelCol: { flex: 0.32, justifyContent: 'center', paddingRight: spacing.xs },
  yearGrid: { flex: 0.68, flexDirection: 'row' },
  yearHeaderCell: { flex: 1, alignItems: 'center', paddingVertical: 2, borderRadius: radius.sm },
  yearHeaderCellGap: { backgroundColor: colors.surface },
  yearHeaderText: { ...typography.caption, color: colors.textSecondary },
  yearHeaderTextGap: { color: colors.textSecondary, opacity: 0.55 },
  yearHeaderTextCurrent: { color: colors.accent, fontWeight: '700' },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  yearRowName: { ...typography.bodySmall, color: colors.text },
  yearBarCell: { flex: 1, height: 16, paddingHorizontal: 1, justifyContent: 'center' },
  yearBarCellCurrent: { backgroundColor: colors.surface },
  yearBar: { height: 10, borderRadius: radius.sm },
  yearLegend: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
});
