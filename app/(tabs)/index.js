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
import Icon from '../../components/Icon';
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
  getUnsortedPhotos,
} from '../../lib/db';
import { monthName } from '../../lib/months';
import { buildHeroSubtitle, groupDueTasks, latenessLabel } from '../../lib/dashboard';
import { showMessage, confirm } from '../../lib/dialogs';
import { plural } from '../../lib/text';
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
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());
  const [unsortedCount, setUnsortedCount] = useState(0);

  const currentMonth = new Date().getMonth() + 1;

  const load = useCallback(async () => {
    const { month: seasonalMonth, year: seasonalYear } = shiftedMonth(monthOffset);
    const { startISO, endISO } = monthRangeISO(seasonalMonth, seasonalYear);
    const [o, d, b, plants, careLogs, unsorted] = await Promise.all([
      getOverdueReminders(),
      getDueTodayReminders(),
      getPlantsBloomingInMonth(currentMonth),
      getPlants(),
      getCareLogsBetween(startISO, endISO),
      getUnsortedPhotos(),
    ]);
    setOverdue(o);
    setDueToday(d);
    setBlooming(b);
    setAllPlants(plants);
    setSeasonalCareLogs(careLogs);
    setUnsortedCount(unsorted.length);
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

  const toggleGroup = (key) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleMarkAllDone = async (group) => {
    const count = group.reminders.length;
    const ok = await confirm({
      title: 'Tout marquer fait',
      message: `Marquer ${count} ${plural(count, 'rappel', 'rappels')} « ${labelFor(REMINDER_KINDS, group.kind)} » comme fait${count > 1 ? 's' : ''} ?`,
    });
    if (!ok) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      for (const reminder of group.reminders) {
        await markReminderDone(reminder.id);
        const type =
          careTypeForKind(reminder.kind) || NON_SEASONAL_CARE_TYPE[reminder.kind] || 'treated';
        await createCareLog({ plantId: reminder.plantId, type, date: today });
      }
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
  const taskGroups = groupDueTasks(tasks, new Date().toISOString().slice(0, 10));
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
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
              <Icon name="cog-outline" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
        </GradientHero>

        {unsortedCount > 0 && (
          <View style={styles.section}>
            <TouchableOpacity onPress={() => router.push('/sort')} activeOpacity={0.8}>
              <GlassCard noPadding style={styles.unsortedCard}>
                <Text style={styles.unsortedCardText}>
                  {unsortedCount} photo{unsortedCount > 1 ? 's' : ''} à trier
                </Text>
                <Icon name="chevron-right" size={20} color={colors.textSecondary} />
              </GlassCard>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Tâches du jour</Text>
            {tasks.length > 0 && <Text style={styles.sectionCount}>({tasks.length})</Text>}
          </View>
          {taskGroups.length === 0 ? (
            <GlassCard>
              <Text style={styles.emptyText}>Aucune tâche due pour l’instant.</Text>
            </GlassCard>
          ) : (
            taskGroups.slice(0, 8).map((group) => {
              const key = `${group.kind}-${group.dueDate}`;
              const isOverdue = group.daysLate > 0;
              const label = latenessLabel(group.daysLate);

              if (group.reminders.length === 1) {
                const r = group.reminders[0];
                return (
                  <TouchableOpacity
                    key={key}
                    activeOpacity={0.8}
                    onPress={() => handleDone(r)}
                    style={styles.taskWrap}>
                    <GlassCard noPadding style={isOverdue && styles.taskCardOverdue}>
                      <View style={styles.taskCardInner}>
                        <View style={styles.taskRow}>
                          {r.photoUri ? (
                            <Image source={{ uri: r.photoUri }} style={styles.taskPhoto} />
                          ) : (
                            <View style={[styles.taskPhoto, styles.taskPhotoPlaceholder]}>
                              <Icon name="leaf" size={24} color={colors.textSecondary} />
                            </View>
                          )}
                          <View style={styles.taskContent}>
                            <Text style={styles.taskTitle} numberOfLines={1}>
                              {labelFor(REMINDER_KINDS, r.kind)} {r.plantName}
                            </Text>
                            <Text
                              style={[
                                styles.taskSubtitle,
                                isOverdue && styles.taskSubtitleOverdue,
                              ]}>
                              {label}
                            </Text>
                          </View>
                          <View style={styles.doneButton}>
                            <Icon name="check" size={22} color="#fff" />
                          </View>
                        </View>
                      </View>
                    </GlassCard>
                  </TouchableOpacity>
                );
              }

              const isExpanded = expandedGroups.has(key);
              const count = group.reminders.length;
              return (
                <View key={key} style={styles.taskWrap}>
                  <GlassCard noPadding style={isOverdue && styles.taskCardOverdue}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => toggleGroup(key)}
                      style={styles.taskCardInner}>
                      <View style={styles.taskRow}>
                        <View style={styles.taskContent}>
                          <Text style={styles.taskTitle} numberOfLines={1}>
                            {labelFor(REMINDER_KINDS, group.kind)} {count}{' '}
                            {plural(count, 'plante', 'plantes')}
                          </Text>
                          <Text
                            style={[styles.taskSubtitle, isOverdue && styles.taskSubtitleOverdue]}>
                            {label}
                          </Text>
                        </View>
                        <Icon
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={20}
                          color={colors.textSecondary}
                        />
                      </View>
                    </TouchableOpacity>
                    {isExpanded && (
                      <View style={styles.groupExpanded}>
                        {group.reminders.map((r) => (
                          <View key={r.id} style={styles.groupRow}>
                            <Text style={styles.groupPlantName} numberOfLines={1}>
                              {r.plantName}
                            </Text>
                            <TouchableOpacity
                              onPress={() => handleDone(r)}
                              style={styles.groupDoneBtn}>
                              <Text style={styles.groupDoneBtnText}>Fait</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                        <TouchableOpacity
                          onPress={() => handleMarkAllDone(group)}
                          style={styles.markAllBtn}>
                          <Text style={styles.markAllBtnText}>Tout marquer fait</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </GlassCard>
                </View>
              );
            })
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
                      <Icon name="check" size={20} color="#fff" />
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
                            <Icon name="flower-outline" size={40} color={colors.textSecondary} />
                          </View>
                        )}
                        <TouchableOpacity
                          style={styles.bloomInfoBadge}
                          accessibilityLabel={`Voir la fiche de ${p.name}`}
                          onPress={(e) => {
                            e.stopPropagation();
                            router.push(`/plant/${p.id}`);
                          }}>
                          <Icon name="information-outline" size={20} color={colors.text} />
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
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  heroTextWrap: { flex: 1 },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceGlass,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.md,
  },
  heroTitle: {
    ...typography.display,
    color: colors.text,
    marginBottom: 4,
  },
  heroSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.title,
    color: colors.text,
  },
  sectionCount: {
    ...typography.caption,
    color: colors.accent,
    marginLeft: spacing.xs,
  },
  sectionHeaderBetween: { justifyContent: 'space-between' },
  unsortedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  unsortedCardText: { ...typography.label, color: colors.text },
  monthToggle: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
    backgroundColor: colors.surfaceGlass,
  },
  monthToggleText: { ...typography.caption, color: colors.text },
  taskWrap: { marginBottom: spacing.sm },
  // Tâches du jour cards use noPadding + this inner padding instead of
  // GlassCard's default 20, so four groups fit above the fold (ticket 045).
  taskCardInner: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  taskCardOverdue: { borderWidth: 1, borderColor: colors.danger },
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
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskContent: { flex: 1, minWidth: 0 },
  taskTitle: { ...typography.label, color: colors.text },
  taskSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  taskSubtitleOverdue: { color: colors.danger },
  groupExpanded: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  groupPlantName: { ...typography.bodySmall, color: colors.text, flex: 1, minWidth: 0 },
  groupDoneBtn: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: 10,
    marginLeft: spacing.sm,
  },
  groupDoneBtnText: { ...typography.caption, color: '#fff' },
  markAllBtn: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  markAllBtnText: { ...typography.caption, color: colors.accent },
  doneButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  doneButtonDisabled: { opacity: 0.35 },
  seasonalActions: { flexDirection: 'row', alignItems: 'center' },
  reminderLinkBtn: { marginLeft: spacing.sm, paddingHorizontal: spacing.xs },
  reminderLinkText: { ...typography.caption, color: colors.accent },
  emptyText: { ...typography.bodySmall, color: colors.textSecondary },
  bloomScrollContent: { paddingRight: spacing.lg },
  bloomCardWrap: { marginRight: spacing.md },
  bloomCard: { width: CARD_WIDTH, padding: 0, overflow: 'hidden' },
  bloomImageWrap: { position: 'relative', width: CARD_WIDTH, height: BLOOM_IMAGE_SIZE },
  bloomImage: { width: CARD_WIDTH, height: BLOOM_IMAGE_SIZE },
  bloomImagePlaceholder: {
    backgroundColor: colors.surface,
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
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  bloomPeriod: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingTop: 2,
  },
  bloomVoir: {
    ...typography.caption,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bloomHint: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.md },
});
