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
import { Ionicons } from '@expo/vector-icons';
import { GradientHero } from '../../components/GradientHero';
import { GlassCard } from '../../components/GlassCard';
import { colors, spacing, typography } from '../../lib/theme';
import {
  getDueTodayReminders,
  getOverdueReminders,
  getPlantsBloomingInMonth,
  getPlants,
  getCareLogsBetween,
  getRemindersByPlantId,
  markReminderDone,
  createCareLog,
  createReminder,
} from '../../lib/db';
import { monthName } from '../../lib/months';
import { buildHeroSubtitle } from '../../lib/dashboard';
import { showMessage } from '../../lib/dialogs';
import { REMINDER_KINDS, labelFor } from '../../lib/enums';
import {
  deriveSeasonalTasks,
  isTaskDone,
  careTypeForKind,
  nextOccurrenceOfMonthStart,
} from '../../lib/seasonalTasks';

const CARD_WIDTH = 168;
const TASK_PHOTO_SIZE = 48;
const BLOOM_IMAGE_SIZE = CARD_WIDTH;

// This month's task list looks one month ahead when the "Mois prochain"
// toggle is on; wraps December -> January into the next calendar year.
function shiftedMonth(offset) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (offset === 0) return { month, year };
  return month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };
}

function monthRangeISO(month, year) {
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    startISO: `${year}-${mm}-01`,
    endISO: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

const NON_SEASONAL_CARE_TYPE = { water: 'watered', fertilize: 'fertilized' };

export default function Dashboard() {
  const router = useRouter();
  const [overdue, setOverdue] = useState([]);
  const [dueToday, setDueToday] = useState([]);
  const [blooming, setBlooming] = useState([]);
  const [allPlants, setAllPlants] = useState([]);
  const [seasonalCareLogs, setSeasonalCareLogs] = useState([]);
  const [monthOffset, setMonthOffset] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const currentMonth = new Date().getMonth() + 1;

  const load = useCallback(async () => {
    const { month: seasonalMonth, year: seasonalYear } = shiftedMonth(monthOffset);
    const { startISO, endISO } = monthRangeISO(seasonalMonth, seasonalYear);
    const [o, d, b, plants, careLogs] = await Promise.all([
      getOverdueReminders(),
      getDueTodayReminders(),
      getPlantsBloomingInMonth(currentMonth),
      getPlants(),
      getCareLogsBetween(startISO, endISO),
    ]);
    setOverdue(o);
    setDueToday(d);
    setBlooming(b);
    setAllPlants(plants);
    setSeasonalCareLogs(careLogs);
  }, [currentMonth, monthOffset]);

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

  const handleDone = async (reminder) => {
    try {
      await markReminderDone(reminder.id);
      const type =
        careTypeForKind(reminder.kind) || NON_SEASONAL_CARE_TYPE[reminder.kind] || 'treated';
      await createCareLog({
        plantId: reminder.plantId,
        type,
        date: new Date().toISOString().slice(0, 10),
      });
      await load();
    } catch (e) {
      showMessage('Erreur', `Impossible d'enregistrer : ${e.message}`);
    }
  };

  const { month: seasonalMonth, year: seasonalYear } = shiftedMonth(monthOffset);
  const seasonalTasks = deriveSeasonalTasks(allPlants, seasonalMonth).filter(
    (t) => !isTaskDone(t, seasonalCareLogs, seasonalYear)
  );

  const tickSeasonalTask = async (task) => {
    try {
      await createCareLog({
        plantId: task.plantId,
        type: careTypeForKind(task.kind),
        date: new Date().toISOString().slice(0, 10),
      });
      await load();
    } catch (e) {
      showMessage('Erreur', `Impossible d'enregistrer : ${e.message}`);
    }
  };

  const addSeasonalReminder = async (task) => {
    try {
      const existing = await getRemindersByPlantId(task.plantId);
      if (existing.some((r) => r.kind === task.kind)) {
        showMessage('Rappel déjà présent', 'Un rappel de ce type existe déjà pour cette plante.');
        return;
      }
      createReminder({
        plantId: task.plantId,
        kind: task.kind,
        frequencyDays: 365,
        nextDueDate: nextOccurrenceOfMonthStart(task.month),
        repeatRule: 'yearly',
      });
      showMessage('Rappel créé', 'Le rappel annuel a été ajouté.');
    } catch (e) {
      showMessage('Erreur', `Impossible d'enregistrer : ${e.message}`);
    }
  };

  const tasks = [...overdue, ...dueToday];
  const heroSubtitle = buildHeroSubtitle(currentMonth, blooming.length, tasks.length);

  const periodLabel = (p) => {
    if (!p.bloomStartMonth || !p.bloomEndMonth) return '';
    const start = monthName(p.bloomStartMonth);
    const end = monthName(p.bloomEndMonth);
    return start === end ? start : `${start} - ${end}`;
  };

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
          <View style={styles.heroRow}>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroTitle}>Votre jardin</Text>
              <Text style={styles.heroSubtitle}>{heroSubtitle}</Text>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/settings')}
              accessibilityLabel="Réglages"
              style={styles.settingsButton}>
              <Ionicons name="settings-outline" size={22} color={colors.dark.text} />
            </TouchableOpacity>
          </View>
        </GradientHero>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Tâches du jour</Text>
            {tasks.length > 0 && <Text style={styles.sectionCount}>({tasks.length})</Text>}
          </View>
          {tasks.length === 0 ? (
            <GlassCard>
              <Text style={styles.emptyText}>Aucune tâche due pour l’instant.</Text>
            </GlassCard>
          ) : (
            tasks.slice(0, 8).map((r) => (
              <TouchableOpacity
                key={r.id}
                activeOpacity={0.8}
                onPress={() => handleDone(r)}
                style={styles.taskWrap}>
                <GlassCard>
                  <View style={styles.taskRow}>
                    {r.photoUri ? (
                      <Image source={{ uri: r.photoUri }} style={styles.taskPhoto} />
                    ) : (
                      <View style={[styles.taskPhoto, styles.taskPhotoPlaceholder]}>
                        <Ionicons name="leaf-outline" size={24} color={colors.dark.textSecondary} />
                      </View>
                    )}
                    <View style={styles.taskContent}>
                      <Text style={styles.taskTitle} numberOfLines={1}>
                        {labelFor(REMINDER_KINDS, r.kind)} {r.plantName}
                      </Text>
                      <Text style={styles.taskSubtitle}>
                        Fréquence : tous les {r.frequencyDays} jours
                      </Text>
                    </View>
                    <View style={styles.doneButton}>
                      <Ionicons name="checkmark" size={22} color="#fff" />
                    </View>
                  </View>
                </GlassCard>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={styles.section}>
          <View style={[styles.sectionHeader, styles.sectionHeaderBetween]}>
            <Text style={styles.sectionTitle}>Ce mois-ci au jardin</Text>
            <TouchableOpacity
              onPress={() => setMonthOffset((o) => (o === 0 ? 1 : 0))}
              style={styles.monthToggle}>
              <Text style={styles.monthToggleText}>
                {monthOffset === 0 ? 'Mois prochain' : 'Ce mois-ci'}
              </Text>
            </TouchableOpacity>
          </View>
          {seasonalTasks.length === 0 ? (
            <GlassCard>
              <Text style={styles.emptyText}>Rien à faire ce mois-ci. Profitez du jardin !</Text>
            </GlassCard>
          ) : (
            seasonalTasks.map((t) => (
              <GlassCard key={`${t.plantId}-${t.kind}`} style={styles.taskWrap}>
                <View style={styles.taskRow}>
                  <View style={styles.taskContent}>
                    <Text style={styles.taskTitle} numberOfLines={1}>
                      {labelFor(REMINDER_KINDS, t.kind)} · {t.plantName}
                    </Text>
                  </View>
                  <View style={styles.seasonalActions}>
                    <TouchableOpacity
                      onPress={() => monthOffset === 0 && tickSeasonalTask(t)}
                      disabled={monthOffset !== 0}
                      accessibilityLabel="Fait"
                      style={[styles.doneButton, monthOffset !== 0 && styles.doneButtonDisabled]}>
                      <Ionicons name="checkmark" size={20} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => addSeasonalReminder(t)}
                      style={styles.reminderLinkBtn}>
                      <Text style={styles.reminderLinkText}>Rappel annuel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </GlassCard>
            ))
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>En fleurs ce mois</Text>
          </View>
          {blooming.length === 0 ? (
            <GlassCard>
              <Text style={styles.emptyText}>
                Aucune plante en fleur ce mois-ci. Ajoutez des périodes de floraison à vos plantes.
              </Text>
            </GlassCard>
          ) : (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.bloomScrollContent}>
                {blooming.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    activeOpacity={0.9}
                    onPress={() => router.push(`/plant/${p.id}`)}
                    style={styles.bloomCardWrap}>
                    <GlassCard style={styles.bloomCard} noPadding>
                      <View style={styles.bloomImageWrap}>
                        {p.photoUri ? (
                          <Image source={{ uri: p.photoUri }} style={styles.bloomImage} />
                        ) : (
                          <View style={[styles.bloomImage, styles.bloomImagePlaceholder]}>
                            <Ionicons
                              name="flower-outline"
                              size={40}
                              color={colors.dark.textSecondary}
                            />
                          </View>
                        )}
                        <TouchableOpacity
                          style={styles.bloomInfoBadge}
                          onPress={(e) => {
                            e.stopPropagation();
                            router.push(`/plant/${p.id}`);
                          }}>
                          <Ionicons name="information-circle" size={20} color={colors.dark.text} />
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.bloomName} numberOfLines={1}>
                        {p.name}
                      </Text>
                      {periodLabel(p) ? (
                        <Text style={styles.bloomPeriod}>Période : {periodLabel(p)}</Text>
                      ) : null}
                      <Text style={styles.bloomVoir}>Voir</Text>
                    </GlassCard>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.bloomHint}>
                Toutes vos plantes en fleurs sont listées ici ! Ajoutez-en plus.
              </Text>
            </>
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
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  heroTextWrap: { flex: 1 },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.dark.surfaceGlass,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.md,
  },
  heroTitle: {
    ...typography.display,
    color: colors.dark.text,
    marginBottom: 4,
  },
  heroSubtitle: {
    ...typography.bodySmall,
    color: colors.dark.textSecondary,
  },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.title,
    color: colors.dark.text,
  },
  sectionCount: {
    ...typography.caption,
    color: colors.dark.accent,
    marginLeft: spacing.xs,
  },
  sectionHeaderBetween: { justifyContent: 'space-between' },
  monthToggle: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
    backgroundColor: colors.dark.surfaceGlass,
  },
  monthToggleText: { ...typography.caption, color: colors.dark.text },
  taskWrap: { marginBottom: spacing.sm },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskPhoto: {
    width: TASK_PHOTO_SIZE,
    height: TASK_PHOTO_SIZE,
    borderRadius: TASK_PHOTO_SIZE / 2,
    marginRight: spacing.md,
  },
  taskPhotoPlaceholder: {
    backgroundColor: colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskContent: { flex: 1, minWidth: 0 },
  taskTitle: { ...typography.label, color: colors.dark.text },
  taskSubtitle: { ...typography.bodySmall, color: colors.dark.textSecondary, marginTop: 2 },
  doneButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.dark.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  doneButtonDisabled: { opacity: 0.35 },
  seasonalActions: { flexDirection: 'row', alignItems: 'center' },
  reminderLinkBtn: { marginLeft: spacing.sm, paddingHorizontal: spacing.xs },
  reminderLinkText: { ...typography.caption, color: colors.dark.accent },
  emptyText: { ...typography.bodySmall, color: colors.dark.textSecondary },
  bloomScrollContent: { paddingRight: spacing.lg },
  bloomCardWrap: { marginRight: spacing.md },
  bloomCard: { width: CARD_WIDTH, padding: 0, overflow: 'hidden' },
  bloomImageWrap: { position: 'relative', width: CARD_WIDTH, height: BLOOM_IMAGE_SIZE },
  bloomImage: { width: CARD_WIDTH, height: BLOOM_IMAGE_SIZE },
  bloomImagePlaceholder: {
    backgroundColor: colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bloomInfoBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bloomName: {
    ...typography.title,
    color: colors.dark.text,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  bloomPeriod: {
    ...typography.bodySmall,
    color: colors.dark.textSecondary,
    paddingHorizontal: spacing.md,
    paddingTop: 2,
  },
  bloomVoir: {
    ...typography.caption,
    color: colors.dark.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bloomHint: { ...typography.bodySmall, color: colors.dark.textSecondary, marginTop: spacing.md },
});
