import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { GradientHero } from '../../components/GradientHero';
import { GlassCard } from '../../components/GlassCard';
import { colors, spacing, typography, radius } from '../../lib/theme';
import { getPlantById, getRemindersByPlantId, createReminder, deleteReminder, markReminderDone, REMINDER_KINDS } from '../../lib/db';

const REMINDER_LABELS = {
  water: 'Arroser',
  prune: 'Tailler',
  fertilize: 'Fertiliser',
  deadhead: 'Couper fleurs fanées',
  winter_prep: 'Préparer l’hiver',
  custom: 'Autre',
};

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
    createReminder({
      plantId,
      kind,
      frequencyDays: days,
      nextDueDate: nextDueDate || new Date().toISOString().slice(0, 10),
    });
    await load();
  };

  const removeReminder = (id) => {
    deleteReminder(id);
    load();
  };

  const doNow = async (r) => {
    markReminderDone(r.id);
    await load();
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
            <Text style={styles.backBtnText}>← Retour</Text>
          </TouchableOpacity>
          <Text style={styles.heroTitle}>Rappels</Text>
          <Text style={styles.heroSubtitle}>{plant.name}</Text>
        </GradientHero>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ajouter un rappel</Text>
          <GlassCard>
            <Text style={styles.label}>Type</Text>
            <View style={styles.pills}>
              {REMINDER_KINDS.map((k) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => setKind(k)}
                  style={[styles.pill, kind === k && styles.pillActive]}
                >
                  <Text style={[styles.pillText, kind === k && styles.pillTextActive]}>{REMINDER_LABELS[k]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Tous les … jours</Text>
            <TextInput
              style={styles.input}
              value={frequencyDays}
              onChangeText={setFrequencyDays}
              placeholder="7"
              placeholderTextColor={colors.dark.textSecondary}
              keyboardType="number-pad"
            />
            <Text style={styles.label}>Prochaine échéance</Text>
            <TextInput
              style={styles.input}
              value={nextDueDate}
              onChangeText={setNextDueDate}
              placeholder="AAAA-MM-JJ"
              placeholderTextColor={colors.dark.textSecondary}
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
                    <Text style={styles.reminderKind}>{REMINDER_LABELS[r.kind]}</Text>
                    <Text style={styles.reminderMeta}>Tous les {r.frequencyDays} j · Prochaine : {r.nextDueDate}</Text>
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
  container: { flex: 1, backgroundColor: colors.dark.background },
  placeholder: { ...typography.body, color: colors.dark.textSecondary, padding: spacing.lg },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  backBtn: { marginBottom: 8 },
  backBtnText: { ...typography.bodySmall, color: colors.dark.textSecondary },
  heroTitle: { ...typography.display, color: colors.dark.text },
  heroSubtitle: { ...typography.bodySmall, color: colors.dark.textSecondary, marginTop: 4 },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionTitle: { ...typography.title, color: colors.dark.text, marginBottom: spacing.md },
  label: { ...typography.label, color: colors.dark.textSecondary, marginBottom: 6, marginTop: 12 },
  input: { ...typography.body, color: colors.dark.text, backgroundColor: colors.dark.surface, borderRadius: radius.sm, padding: 14, borderWidth: 1, borderColor: colors.dark.border },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.full, backgroundColor: colors.dark.surface },
  pillActive: { backgroundColor: colors.dark.accent },
  pillText: { ...typography.caption, color: colors.dark.textSecondary },
  pillTextActive: { color: '#fff' },
  addBtn: { marginTop: 16, alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 16, backgroundColor: colors.dark.accent, borderRadius: radius.md },
  addBtnText: { ...typography.label, color: '#fff' },
  emptyText: { ...typography.bodySmall, color: colors.dark.textSecondary },
  reminderCard: { marginBottom: spacing.sm },
  reminderRow: { flexDirection: 'row', alignItems: 'center' },
  reminderInfo: { flex: 1 },
  reminderKind: { ...typography.label, color: colors.dark.text },
  reminderMeta: { ...typography.caption, color: colors.dark.textSecondary, marginTop: 2 },
  reminderActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  doneBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: colors.dark.accent, borderRadius: radius.sm },
  doneBtnText: { ...typography.caption, color: '#fff' },
  deleteBtnText: { ...typography.caption, color: colors.dark.textSecondary },
});
