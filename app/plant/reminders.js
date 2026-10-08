import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { showMessage } from '../../lib/dialogs';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import Icon from '../../components/Icon';
import { Field, ChipGroup, FormSection, PrimaryButton } from '../../components/form';
import { colors, spacing, typography, radius, reminderTint } from '../../lib/theme';
import {
  getPlantById,
  getRemindersByPlantId,
  createReminder,
  deleteReminder,
  markReminderDone,
  updateReminder,
} from '../../lib/db';
import { REMINDER_KINDS, labelFor, iconFor } from '../../lib/enums';
import { monthName } from '../../lib/months';
import { reminderDueText, postponedDueDate } from '../../lib/reminderDue';
import { parseISODate } from '../../lib/validation';
import {
  seasonalRemindersFor,
  wateringSuggestionFor,
  nextOccurrenceOfMonthStart,
} from '../../lib/seasonalTasks';

export default function RemindersScreen() {
  const insets = useSafeAreaInsets();
  const { plantId } = useLocalSearchParams();
  const [plant, setPlant] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [kind, setKind] = useState('water');
  const [frequencyDays, setFrequencyDays] = useState('7');
  const [nextDueDate, setNextDueDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Ticket 131: the reminder being edited inline, with its draft fields.
  const [editingId, setEditingId] = useState(null);
  const [editFrequency, setEditFrequency] = useState('');
  const [editDue, setEditDue] = useState('');

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

  const openEditor = (r) => {
    if (editingId === r.id) {
      setEditingId(null);
      return;
    }
    setEditingId(r.id);
    setEditFrequency(String(r.frequencyDays ?? ''));
    setEditDue(r.nextDueDate);
  };

  const saveEdit = async (r) => {
    const changes = {};
    if (r.repeatRule !== 'yearly') {
      const days = Number(editFrequency.trim());
      if (!Number.isInteger(days) || days < 1) {
        showMessage('Erreur', 'La fréquence doit être un nombre de jours entier, au moins 1.');
        return;
      }
      changes.frequencyDays = days;
    }
    const due = parseISODate(editDue);
    if (due.error || !due.value) {
      showMessage('Erreur', due.error || 'Indiquez la prochaine échéance (AAAA-MM-JJ).');
      return;
    }
    changes.nextDueDate = due.value;
    try {
      updateReminder(r.id, changes);
      setEditingId(null);
      await load();
    } catch (e) {
      showMessage('Erreur', `Impossible d'enregistrer : ${e.message}`);
    }
  };

  const postpone = async (r, days) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      updateReminder(r.id, { nextDueDate: postponedDueDate(r.nextDueDate, days, today) });
      setEditingId(null);
      await load();
    } catch (e) {
      showMessage('Erreur', `Impossible de reporter : ${e.message}`);
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 12, paddingBottom: 40 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Rappels" subtitle={plant.name} />

        {suggestions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.eyebrow}>Suggestions</Text>
            <View style={styles.suggestionList}>
              {suggestions.map((s) => (
                <View key={s.kind} style={styles.suggestionCard}>
                  <Icon name={iconFor(REMINDER_KINDS, s.kind)} size={20} color={colors.accent} />
                  <View style={styles.suggestionInfo}>
                    <Text style={styles.suggestionLabel}>{labelFor(REMINDER_KINDS, s.kind)}</Text>
                    <Text style={styles.suggestionMeta}>
                      {s.kind === 'water'
                        ? `Tous les ${s.frequencyDays} jours`
                        : `Chaque année, en ${monthName(s.month)}`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.suggestionAddBtn}
                    onPress={() => addSuggestion(s)}>
                    <Text style={styles.suggestionAddBtnText}>Ajouter</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        <FormSection title="Nouveau rappel">
          <ChipGroup
            scroll
            options={REMINDER_KINDS}
            value={kind}
            onChange={setKind}
            allowClear={false}
          />
          {/* Stacked, not side by side as in the mock-up: an ISO date does not fit
              a half-width column next to "Tous les N jours". */}
          <Field
            label="Fréquence"
            keyboardType="number-pad"
            value={frequencyDays}
            onChangeText={setFrequencyDays}
            leading={
              <Text style={styles.freqAffix} numberOfLines={1}>
                Tous les
              </Text>
            }
            trailing={<Text style={styles.freqAffix}>jours</Text>}
            style={styles.freqInput}
          />
          <Field
            label="Prochaine échéance"
            placeholder="AAAA-MM-JJ"
            value={nextDueDate}
            onChangeText={setNextDueDate}
            leading={<Icon name="calendar-blank-outline" size={18} color={colors.textSecondary} />}
          />
          <TouchableOpacity
            style={styles.addReminderBtn}
            onPress={addReminder}
            accessibilityRole="button"
            accessibilityLabel="Ajouter le rappel">
            <Icon name="plus" size={18} color={colors.background} />
            <Text style={styles.addReminderBtnText}>Ajouter</Text>
          </TouchableOpacity>
        </FormSection>

        <View style={styles.section}>
          <Text style={styles.eyebrow}>Enregistrés</Text>
          <View style={styles.savedCard}>
            {reminders.length === 0 ? (
              <Text style={styles.emptyText}>Aucun rappel. Ajoutez-en ci-dessus.</Text>
            ) : (
              reminders.map((r, index) => {
                const due = reminderDueText(r.nextDueDate);
                const frequency =
                  r.repeatRule === 'yearly'
                    ? `Chaque année, en ${monthName(Number(r.nextDueDate.slice(5, 7)))}`
                    : `Tous les ${r.frequencyDays} j`;
                const kindLabel = labelFor(REMINDER_KINDS, r.kind);
                return (
                  <View key={r.id} style={index > 0 && styles.reminderRowDivider}>
                    <View style={styles.reminderRow}>
                      <View
                        style={[styles.reminderIcon, { backgroundColor: reminderTint(r.kind) }]}>
                        <Icon
                          name={iconFor(REMINDER_KINDS, r.kind)}
                          size={18}
                          color={colors.text}
                        />
                      </View>
                      <TouchableOpacity
                        style={styles.reminderTextCol}
                        onPress={() => openEditor(r)}
                        accessibilityRole="button"
                        accessibilityLabel={`Modifier le rappel ${kindLabel}`}>
                        <Text style={styles.reminderLabel} numberOfLines={1}>
                          {kindLabel}
                        </Text>
                        <Text
                          style={[
                            styles.reminderDetail,
                            due.overdue && styles.reminderDetailOverdue,
                          ]}
                          numberOfLines={1}>
                          {frequency} · {due.text}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.doneBtn}
                        onPress={() => doNow(r)}
                        accessibilityRole="button"
                        accessibilityLabel="Fait">
                        <Text style={styles.doneBtnText}>Fait</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => removeReminder(r.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Supprimer le rappel ${kindLabel}`}>
                        <Icon name="trash-can-outline" size={18} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                    {editingId === r.id && (
                      <View style={styles.editor}>
                        {r.repeatRule !== 'yearly' && (
                          <Field
                            label="Fréquence"
                            keyboardType="number-pad"
                            value={editFrequency}
                            onChangeText={setEditFrequency}
                            accessibilityLabel="Fréquence du rappel"
                            leading={
                              <Text style={styles.freqAffix} numberOfLines={1}>
                                Tous les
                              </Text>
                            }
                            trailing={<Text style={styles.freqAffix}>jours</Text>}
                            style={styles.freqInput}
                          />
                        )}
                        <Field
                          label="Prochaine échéance"
                          placeholder="AAAA-MM-JJ"
                          value={editDue}
                          onChangeText={setEditDue}
                          accessibilityLabel="Échéance du rappel"
                          leading={
                            <Icon
                              name="calendar-blank-outline"
                              size={18}
                              color={colors.textSecondary}
                            />
                          }
                        />
                        <Text style={styles.eyebrow}>Reporter</Text>
                        <View style={styles.postponeRow}>
                          {[1, 3, 7].map((n) => (
                            <TouchableOpacity
                              key={n}
                              style={styles.postponeBtn}
                              onPress={() => postpone(r, n)}
                              accessibilityRole="button"
                              accessibilityLabel={`Reporter de ${n} jour${n > 1 ? 's' : ''}`}>
                              <Text style={styles.postponeBtnText}>+{n} j</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <View style={styles.editorActions}>
                          <TouchableOpacity
                            style={styles.cancelBtn}
                            onPress={() => setEditingId(null)}
                            accessibilityRole="button"
                            accessibilityLabel="Annuler la modification">
                            <Text style={styles.cancelBtnText}>Annuler</Text>
                          </TouchableOpacity>
                          <View style={styles.saveWrap}>
                            <PrimaryButton label="Enregistrer" onPress={() => saveEdit(r)} />
                          </View>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  placeholder: { ...typography.body, color: colors.textSecondary, padding: spacing.lg },
  scrollContent: {
    paddingHorizontal: 20,
    gap: spacing.md,
  },
  section: { gap: spacing.sm },
  eyebrow: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  suggestionList: { gap: spacing.sm },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.softGreen,
    borderRadius: 20,
    paddingTop: 8,
    paddingRight: 8,
    paddingBottom: 8,
    paddingLeft: 14,
  },
  suggestionInfo: { flex: 1, flexBasis: 'auto', gap: 2 },
  suggestionLabel: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 15, color: colors.text },
  suggestionMeta: { ...typography.bodySmall, fontSize: 13, color: colors.textSecondary },
  suggestionAddBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionAddBtnText: { ...typography.label, fontWeight: '600', color: '#fff' },

  freqAffix: { ...typography.bodySmall, color: colors.textSecondary, flexShrink: 0 },
  freqInput: {
    textAlign: 'center',
    fontFamily: 'InstrumentSans_600SemiBold',
  },
  addReminderBtn: {
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.text,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addReminderBtnText: { ...typography.label, fontWeight: '600', color: colors.background },

  savedCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  emptyText: { ...typography.bodySmall, color: colors.textSecondary, padding: 12 },
  reminderRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editor: { gap: spacing.sm, paddingBottom: spacing.md },
  postponeRow: { flexDirection: 'row', gap: spacing.sm },
  postponeBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.softGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postponeBtnText: { ...typography.label, fontWeight: '600', color: colors.accent },
  editorActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cancelBtn: {
    height: 56,
    paddingHorizontal: 20,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: { ...typography.label, fontWeight: '600', color: colors.text },
  saveWrap: { flex: 1 },
  reminderRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  reminderIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderTextCol: { flex: 1, flexBasis: 'auto', gap: 2 },
  reminderLabel: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 15, color: colors.text },
  reminderDetail: { ...typography.bodySmall, color: colors.textSecondary },
  reminderDetailOverdue: { color: colors.terracotta, fontWeight: '600' },
  doneBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: { ...typography.label, fontWeight: '600', color: colors.accent },
  deleteBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
