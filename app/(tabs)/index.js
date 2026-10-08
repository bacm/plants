import { useState, useCallback, useEffect } from 'react';
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
import { useSync } from '../../components/SyncProvider';
import { colors, spacing, typography, radius, colorHex, reminderTint } from '../../lib/theme';
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
import { longDateLabel } from '../../lib/months';
import { groupDueTasks, latenessLabel } from '../../lib/dashboard';
import { showMessage, confirm } from '../../lib/dialogs';
import { plural } from '../../lib/text';
import { isMinorBloom } from '../../lib/bloomCoverage';
import { REMINDER_KINDS, labelFor, iconFor } from '../../lib/enums';
import {
  deriveSeasonalTasks,
  isTaskDone,
  careTypeForKind,
  nextOccurrenceOfMonthStart,
} from '../../lib/seasonalTasks';

const BLOOM_CARD_WIDTH = 148;
const BLOOM_IMAGE_HEIGHT = 176;

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

  // Ticket 094: a sync that brought rows in reloads the dashboard.
  const { syncNow, changeCount } = useSync();
  useEffect(() => {
    if (changeCount > 0) load();
  }, [changeCount, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncNow();
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load, syncNow]);

  const handleDone = async (reminder) => {
    try {
      await markReminderDone(reminder.id);
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

  const completeAll = async (reminders) => {
    const n = reminders.length;
    const ok = await confirm({
      title: 'Tout marquer fait',
      message: `Marquer ${n} ${plural(n, 'rappel', 'rappels')} comme fait${n > 1 ? 's' : ''} ?`,
    });
    if (!ok) return;
    try {
      for (const reminder of reminders) {
        await markReminderDone(reminder.id);
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
      await createReminder({
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

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }>
        <View style={styles.headerRow}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.eyebrow}>{longDateLabel(new Date())}</Text>
            <Text style={styles.title}>
              Votre <Text style={styles.titleAccent}>jardin</Text>
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/settings')}
            accessibilityLabel="Réglages"
            style={styles.settingsButton}>
            <Icon name="cog-outline" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        {unsortedCount > 0 && (
          <TouchableOpacity
            onPress={() => router.push('/sort')}
            activeOpacity={0.8}
            style={styles.unsortedBanner}>
            <Icon name="image-multiple-outline" size={20} color={colors.text} />
            <Text style={styles.unsortedBannerText}>
              {unsortedCount} photo{unsortedCount > 1 ? 's' : ''} à trier
            </Text>
            <Icon name="chevron-right" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderLeft}>
              <Text style={styles.cardTitle}>Tâches du jour</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{tasks.length}</Text>
              </View>
            </View>
            {tasks.length > 0 && (
              <TouchableOpacity onPress={() => completeAll(tasks)}>
                <Text style={styles.markAllHeaderText}>Tout marquer fait</Text>
              </TouchableOpacity>
            )}
          </View>

          {taskGroups.length === 0 ? (
            <Text style={styles.emptyText}>Aucune tâche due pour l’instant.</Text>
          ) : (
            taskGroups.slice(0, 8).map((group) => {
              const key = `${group.kind}-${group.dueDate}`;
              const count = group.reminders.length;
              const lateLabel = group.daysLate > 0 ? latenessLabel(group.daysLate) : null;

              if (count === 1) {
                const r = group.reminders[0];
                return (
                  <View key={key} style={styles.taskRow}>
                    <View style={[styles.taskIcon, { backgroundColor: reminderTint(group.kind) }]}>
                      <Icon
                        name={iconFor(REMINDER_KINDS, group.kind)}
                        size={20}
                        color={colors.text}
                      />
                    </View>
                    <View style={styles.taskTextCol}>
                      <Text style={styles.taskAction} numberOfLines={1}>
                        {labelFor(REMINDER_KINDS, group.kind)}
                      </Text>
                      <Text style={styles.taskSubtitle} numberOfLines={1}>
                        {r.plantName}
                        {r.zoneName ? ` · ${r.zoneName}` : ''}
                      </Text>
                      {lateLabel && <Text style={styles.taskLate}>{lateLabel}</Text>}
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDone(r)}
                      accessibilityLabel="Marquer fait"
                      style={styles.doneRoundBtn}>
                      <Icon name="check" size={18} color={colors.accent} />
                    </TouchableOpacity>
                  </View>
                );
              }

              const isExpanded = expandedGroups.has(key);
              return (
                <View key={key}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => toggleGroup(key)}
                    style={styles.taskRow}>
                    <View style={[styles.taskIcon, { backgroundColor: reminderTint(group.kind) }]}>
                      <Icon
                        name={iconFor(REMINDER_KINDS, group.kind)}
                        size={20}
                        color={colors.text}
                      />
                    </View>
                    <View style={styles.taskTextCol}>
                      <Text style={styles.taskAction} numberOfLines={1}>
                        {labelFor(REMINDER_KINDS, group.kind)}
                      </Text>
                      <Text style={styles.taskSubtitle}>
                        {count} {plural(count, 'plante', 'plantes')}
                      </Text>
                      {lateLabel && <Text style={styles.taskLate}>{lateLabel}</Text>}
                    </View>
                    <Icon
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                  {isExpanded && (
                    <View style={styles.groupExpanded}>
                      {group.reminders.map((r) => (
                        <View key={r.id} style={styles.groupSubRow}>
                          <Text style={styles.groupSubText} numberOfLines={1}>
                            {r.plantName}
                            {r.zoneName ? ` · ${r.zoneName}` : ''}
                          </Text>
                          <TouchableOpacity
                            onPress={() => handleDone(r)}
                            accessibilityLabel="Marquer fait"
                            style={styles.doneRoundBtn}>
                            <Icon name="check" size={18} color={colors.accent} />
                          </TouchableOpacity>
                        </View>
                      ))}
                      <TouchableOpacity
                        onPress={() => completeAll(group.reminders)}
                        style={styles.markAllBtn}>
                        <Text style={styles.markAllBtnText}>Marquer les {count} faits</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>

        <View>
          <View style={styles.bloomHeaderRow}>
            <Text style={styles.bloomSectionTitle}>En fleurs ce mois</Text>
            <TouchableOpacity onPress={() => router.push('/bloom')}>
              <Text style={styles.seeAllLink}>Voir tout</Text>
            </TouchableOpacity>
          </View>
          {blooming.length === 0 ? (
            <Text style={styles.emptyText}>
              Aucune plante en fleur ce mois-ci. Ajoutez des périodes de floraison à vos plantes.
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.bloomScroll}
              contentContainerStyle={styles.bloomScrollContent}>
              {blooming.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  activeOpacity={0.9}
                  onPress={() => router.push(`/plant/${p.id}`)}
                  accessibilityHint={isMinorBloom(p) ? 'floraison insignifiante' : undefined}
                  style={[styles.bloomCard, isMinorBloom(p) && styles.minorBloom]}>
                  <View style={styles.bloomImageWrap}>
                    {p.photoUri ? (
                      <Image source={{ uri: p.photoUri }} style={styles.bloomImage} />
                    ) : (
                      <View style={[styles.bloomImage, styles.bloomImagePlaceholder]}>
                        <Icon
                          name="leaf"
                          size={40}
                          color={colors.sage}
                          style={styles.bloomPlaceholderIcon}
                        />
                      </View>
                    )}
                    {p.flowerColor ? (
                      <View style={styles.bloomTag}>
                        <View
                          style={[
                            styles.bloomTagSwatch,
                            { backgroundColor: colorHex(p.flowerColor) },
                          ]}
                        />
                        <Text style={styles.bloomTagText}>
                          {p.flowerColor.charAt(0).toUpperCase() + p.flowerColor.slice(1)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.bloomInfo}>
                    <Text style={styles.bloomName} numberOfLines={1}>
                      {p.name}
                    </Text>
                    {p.zoneName ? (
                      <Text style={styles.bloomZone} numberOfLines={1}>
                        {p.zoneName}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Ce mois-ci au jardin</Text>
            <TouchableOpacity
              onPress={() => setMonthOffset((o) => (o === 0 ? 1 : 0))}
              style={styles.monthTogglePill}>
              <Text style={styles.monthToggleText}>
                {monthOffset === 0 ? 'Mois prochain' : 'Ce mois-ci'}
              </Text>
            </TouchableOpacity>
          </View>
          {seasonalTasks.length === 0 ? (
            <Text style={styles.emptyText}>Rien à faire ce mois-ci. Profitez du jardin !</Text>
          ) : (
            seasonalTasks.map((t) => (
              <View key={`${t.plantId}-${t.kind}`} style={styles.taskRow}>
                <View style={[styles.taskIcon, { backgroundColor: reminderTint(t.kind) }]}>
                  <Icon name={iconFor(REMINDER_KINDS, t.kind)} size={20} color={colors.text} />
                </View>
                <View style={styles.taskTextCol}>
                  <Text style={styles.taskAction} numberOfLines={1}>
                    {labelFor(REMINDER_KINDS, t.kind)} · {t.plantName}
                  </Text>
                </View>
                <View style={styles.seasonalActions}>
                  <TouchableOpacity
                    onPress={() => addSeasonalReminder(t)}
                    style={styles.reminderLinkBtn}>
                    <Text style={styles.reminderLinkText}>Rappel annuel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => monthOffset === 0 && tickSeasonalTask(t)}
                    disabled={monthOffset !== 0}
                    accessibilityLabel="Fait"
                    style={[
                      styles.seasonalDoneBtn,
                      monthOffset !== 0 && styles.doneButtonDisabled,
                    ]}>
                    <Icon name="check" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
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
    gap: 28,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  headerTextWrap: { flex: 1 },
  eyebrow: {
    fontFamily: 'InstrumentSans_500Medium',
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  title: {
    fontFamily: 'Fraunces_400Regular',
    fontSize: 40,
    lineHeight: 42,
    letterSpacing: -0.8,
    color: colors.text,
  },
  titleAccent: {
    fontFamily: 'Fraunces_400Regular_Italic',
    color: colors.accent,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unsortedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.track,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  unsortedBannerText: { ...typography.label, color: colors.text, flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.track,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { ...typography.title, fontSize: 17, color: colors.text },
  countBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.highlight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countBadgeText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 13, color: colors.accent },
  markAllHeaderText: {
    fontFamily: 'InstrumentSans_600SemiBold',
    fontSize: 14,
    color: colors.accent,
    paddingVertical: 12,
  },
  emptyText: { ...typography.bodySmall, color: colors.textSecondary },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingVertical: 10,
  },
  taskIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskTextCol: { flex: 1, minWidth: 0 },
  taskAction: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 15, color: colors.text },
  taskSubtitle: {
    ...typography.bodySmall,
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  taskLate: { ...typography.caption, color: colors.danger, marginTop: 2 },
  doneRoundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupExpanded: { paddingBottom: spacing.sm },
  groupSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 58,
    paddingVertical: 8,
    gap: 12,
  },
  groupSubText: { ...typography.bodySmall, color: colors.text, flex: 1, minWidth: 0 },
  markAllBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: spacing.xs,
  },
  markAllBtnText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, color: colors.accent },
  bloomHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  bloomSectionTitle: { ...typography.displaySmall, letterSpacing: -0.2, color: colors.text },
  seeAllLink: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, color: colors.accent },
  bloomScroll: { marginRight: -spacing.lg },
  bloomScrollContent: { gap: 12, paddingRight: spacing.lg },
  bloomCard: { width: BLOOM_CARD_WIDTH, gap: 10 },
  minorBloom: { opacity: 0.5 },
  bloomImageWrap: {
    width: BLOOM_CARD_WIDTH,
    height: BLOOM_IMAGE_HEIGHT,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  bloomImage: { width: BLOOM_CARD_WIDTH, height: BLOOM_IMAGE_HEIGHT },
  bloomImagePlaceholder: {
    backgroundColor: colors.softGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bloomPlaceholderIcon: { opacity: 0.35 },
  bloomTag: {
    position: 'absolute',
    top: 10,
    left: 10,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.tagOverlay,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  bloomTagSwatch: { width: 14, height: 14, borderRadius: 7 },
  bloomTagText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 12, color: colors.text },
  bloomInfo: { paddingHorizontal: 4, gap: 2 },
  bloomName: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 15, color: colors.text },
  bloomZone: { ...typography.bodySmall, fontSize: 13, color: colors.textSecondary },
  monthTogglePill: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.track,
  },
  monthToggleText: { ...typography.caption, color: colors.text },
  seasonalActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reminderLinkBtn: { paddingHorizontal: spacing.xs },
  reminderLinkText: { ...typography.caption, color: colors.accent },
  seasonalDoneBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonDisabled: { opacity: 0.35 },
});
