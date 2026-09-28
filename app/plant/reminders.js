import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { showMessage } from '../../lib/dialogs';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { GradientHero } from '../../components/GradientHero';
import { GlassCard } from '../../components/GlassCard';
import Icon from '../../components/Icon';
import { colors, spacing, typography, radius } from '../../lib/theme';
import {
  getPlantById,
  getRemindersByPlantId,
  createReminder,
  deleteReminder,
  markReminderDone,
} from '../../lib/db';
import { REMINDER_KINDS, labelFor } from '../../lib/enums';
import { monthName } from '../../lib/months';
import {
  seasonalRemindersFor,
  wateringSuggestionFor,
  nextOccurrenceOfMonthStart,
} from '../../lib/seasonalTasks';

export default function RemindersScreen() {
  const { plantId } = useLocalSearchParams();
  const router = useRouter();
  const [plant, setPlant] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [kind, setKind] = useState('water');
  const [frequencyDays, setFrequencyDays] = useState('7');
  const [nextDueDate, setNextDueDate] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    if (!plantId) return;
    const [p, r] = await Promise.all([getPlantById(plantId), getRemindersByPlantId(plantId)]);
    setPlant(p);
    setReminders(r);
  }, [plantId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const addReminder = async () => {
    const days = parseInt(frequencyDays, 10);
    if (!plantId || !days || days < 1) return;
    try {
      createReminder({
        plantId,
        kind,
        frequencyDays: days,
        nextDueDate: nextDueDate || new Date().toISOString().slice(0, 10),
      });
      await load();
    } catch (e) {
      showMessage('Erreur', `Impossible d'enregistrer : ${e.message}`);
    }
  };

  const removeReminder = async (id) => {
    try {
      deleteReminder(id);
      await load();
    } catch (e) {
      showMessage('Erreur', `Impossible de supprimer : ${e.message}`);
    }
  };

  const doNow = async (r) => {
    try {
      await markReminderDone(r.id);
      await load();
    } catch (e) {
      showMessage('Erreur', `Impossible d'enregistrer : ${e.message}`);
    }
  };

  // Suggestions derived from the plant's own pruning/harvest/bloom/winter-care
  // data (ticket 022), plus a weekly watering suggestion when the plant has
  // no water reminder yet (ticket 045 — watering used to be created
  // automatically for every new plant; now it's offered here instead), minus
  // any kind already covered by an existing reminder — never auto-created,
  // the user has to tap "Ajouter".
  const seasonalSuggestions = plant
    ? seasonalRemindersFor(plant).filter((s) => !reminders.some((r) => r.kind === s.kind))
    : [];
  const wateringSuggestion = plant ? wateringSuggestionFor(plant, reminders) : null;
  const suggestions = wateringSuggestion
    ? [wateringSuggestion, ...seasonalSuggestions]
    : seasonalSuggestions;

  const addSuggestion = async (suggestion) => {
    try {
      if (suggestion.kind === 'water') {
        createReminder({
          plantId,
          kind: 'water',
          frequencyDays: suggestion.frequencyDays,
          nextDueDate: new Date().toISOString().slice(0, 10),
        });
      } else {
        createReminder({
          plantId,
          kind: suggestion.kind,
          frequencyDays: 365,
          nextDueDate: nextOccurrenceOfMonthStart(suggestion.month),
          repeatRule: 'yearly',
        });
      }
      await load();
    } catch (e) {
      showMessage('Erreur', `Impossible d'enregistrer : ${e.message}`);
    }
  };

  if (!plant) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>Chargement…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <GradientHero>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Icon name="chevron-left" size={16} color={colors.textSecondary} />
            <Text style={styles.backBtnText}>Retour</Text>
          </TouchableOpacity>
          <Text style={styles.heroTitle}>Rappels</Text>
          <Text style={styles.heroSubtitle}>{plant.name}</Text>
        </GradientHero>

        {suggestions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Suggestions</Text>
            {suggestions.map((s) => (
              <GlassCard key={s.kind} style={styles.reminderCard}>
                <View style={styles.reminderRow}>
                  <View style={styles.reminderInfo}>
                    <Text style={styles.reminderKind}>{labelFor(REMINDER_KINDS, s.kind)}</Text>
                    <Text style={styles.reminderMeta}>
                      {s.kind === 'water'
                        ? `Tous les ${s.frequencyDays} jours`
                        : `Chaque année, en ${monthName(s.month)}`}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => addSuggestion(s)} style={styles.doneBtn}>
                    <Text style={styles.doneBtnText}>Ajouter</Text>
                  </TouchableOpacity>
                </View>
              </GlassCard>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ajouter un rappel</Text>
          <GlassCard>
            <Text style={styles.label}>Type</Text>
            <View style={styles.pills}>
              {REMINDER_KINDS.map(({ value: k, label }) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => setKind(k)}
                  style={[styles.pill, kind === k && styles.pillActive]}>
                  <Text style={[styles.pillText, kind === k && styles.pillTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Tous les … jours</Text>
            <TextInput
              style={styles.input}
              value={frequencyDays}
              onChangeText={setFrequencyDays}
              placeholder="7"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
            />
            <Text style={styles.label}>Prochaine échéance</Text>
            <TextInput
              style={styles.input}
              value={nextDueDate}
              onChangeText={setNextDueDate}
              placeholder="AAAA-MM-JJ"
              placeholderTextColor={colors.textSecondary}
            />
            <TouchableOpacity style={styles.addBtn} onPress={addReminder}>
              <Text style={styles.addBtnText}>+ Ajouter</Text>
            </TouchableOpacity>
          </GlassCard>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rappels enregistrés</Text>
          {reminders.length === 0 ? (
            <GlassCard>
              <Text style={styles.emptyText}>Aucun rappel. Ajoutez-en ci-dessus.</Text>
            </GlassCard>
          ) : (
            reminders.map((r) => (
              <GlassCard key={r.id} style={styles.reminderCard}>
                <View style={styles.reminderRow}>
                  <View style={styles.reminderInfo}>
                    <Text style={styles.reminderKind}>{labelFor(REMINDER_KINDS, r.kind)}</Text>
                    <Text style={styles.reminderMeta}>
                      {r.repeatRule === 'yearly'
                        ? `Chaque année, en ${monthName(Number(r.nextDueDate.slice(5, 7)))}`
                        : `Tous les ${r.frequencyDays} j`}{' '}
                      · Prochaine : {r.nextDueDate}
                    </Text>
                  </View>
                  <View style={styles.reminderActions}>
                    <TouchableOpacity onPress={() => doNow(r)} style={styles.doneBtn}>
                      <Text style={styles.doneBtnText}>Fait</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeReminder(r.id)}>
                      <Text style={styles.deleteBtnText}>Suppr.</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </GlassCard>
            ))
          )}
        </View>
        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  placeholder: { ...typography.body, color: colors.textSecondary, padding: spacing.lg },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  backBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  backBtnText: { ...typography.bodySmall, color: colors.textSecondary },
  heroTitle: { ...typography.display, color: colors.text },
  heroSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 4 },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionTitle: { ...typography.title, color: colors.text, marginBottom: spacing.md },
  label: { ...typography.label, color: colors.textSecondary, marginBottom: 6, marginTop: 12 },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  pillActive: { backgroundColor: colors.accent },
  pillText: { ...typography.caption, color: colors.textSecondary },
  pillTextActive: { color: '#fff' },
  addBtn: {
    marginTop: 16,
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
  },
  addBtnText: { ...typography.label, color: '#fff' },
  emptyText: { ...typography.bodySmall, color: colors.textSecondary },
  reminderCard: { marginBottom: spacing.sm },
  reminderRow: { flexDirection: 'row', alignItems: 'center' },
  reminderInfo: { flex: 1 },
  reminderKind: { ...typography.label, color: colors.text },
  reminderMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  reminderActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  doneBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
  },
  doneBtnText: { ...typography.caption, color: '#fff' },
  deleteBtnText: { ...typography.caption, color: colors.textSecondary },
});
