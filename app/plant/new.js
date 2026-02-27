import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { GradientHero } from '../../components/GradientHero';
import { GlassCard } from '../../components/GlassCard';
import { colors, spacing, typography, radius } from '../../lib/theme';
import { createPlant, getZones, createReminder, PLANT_TYPES, SUN, WATER } from '../../lib/db';

const SUN_LABELS = { full_sun: 'Plein soleil', partial: 'Mi-ombre', shade: 'Ombre' };
const WATER_LABELS = { low: 'Faible', medium: 'Moyen', high: 'Élevé' };
const TYPE_LABELS = {
  perennial: 'Vivace',
  annual: 'Annuelle',
  shrub: 'Arbuste',
  tree: 'Arbre',
  bulb: 'Bulbe',
  groundcover: 'Couvre-sol',
  vine: 'Grimpante',
};

export default function NewPlantScreen() {
  const router = useRouter();
  const [zones, setZones] = useState([]);
  const [name, setName] = useState('');
  const [latinName, setLatinName] = useState('');
  const [type, setType] = useState('perennial');
  const [flowerColor, setFlowerColor] = useState('');
  const [sun, setSun] = useState('partial');
  const [water, setWater] = useState('medium');
  const [bloomStartMonth, setBloomStartMonth] = useState('');
  const [bloomEndMonth, setBloomEndMonth] = useState('');
  const [zoneId, setZoneId] = useState(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getZones().then(setZones);
  }, []);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const start = bloomStartMonth ? parseInt(bloomStartMonth, 10) : null;
    const end = bloomEndMonth ? parseInt(bloomEndMonth, 10) : null;
    const plantId = createPlant({
      name: name.trim(),
      latinName: latinName.trim() || null,
      type,
      flowerColor: flowerColor.trim() || null,
      sun,
      water,
      bloomStartMonth: start,
      bloomEndMonth: end,
      zoneId,
      notes: notes.trim() || null,
    });
    // Optional: default water reminder weekly
    createReminder({
      plantId,
      kind: 'water',
      frequencyDays: 7,
      nextDueDate: new Date().toISOString().slice(0, 10),
    });
    setSaving(false);
    router.replace(`/plant/${plantId}`);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <GradientHero>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Annuler</Text>
          </TouchableOpacity>
          <Text style={styles.heroTitle}>Nouvelle plante</Text>
        </GradientHero>

        <View style={styles.section}>
          <GlassCard>
            <Text style={styles.label}>Nom *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="ex. Rosier"
              placeholderTextColor={colors.dark.textSecondary}
            />
            <Text style={styles.label}>Nom latin (optionnel)</Text>
            <TextInput
              style={styles.input}
              value={latinName}
              onChangeText={setLatinName}
              placeholder="ex. Rosa"
              placeholderTextColor={colors.dark.textSecondary}
            />
            <Text style={styles.label}>Zone</Text>
            <View style={styles.pills}>
              <TouchableOpacity
                onPress={() => setZoneId(null)}
                style={[styles.pill, !zoneId && styles.pillActive]}
              >
                <Text style={[styles.pillText, !zoneId && styles.pillTextActive]}>Aucune</Text>
              </TouchableOpacity>
              {zones.map((z) => (
                <TouchableOpacity
                  key={z.id}
                  onPress={() => setZoneId(z.id)}
                  style={[styles.pill, zoneId === z.id && styles.pillActive]}
                >
                  <Text style={[styles.pillText, zoneId === z.id && styles.pillTextActive]}>{z.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Type</Text>
            <View style={styles.pills}>
              {PLANT_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setType(t)}
                  style={[styles.pill, type === t && styles.pillActive]}
                >
                  <Text style={[styles.pillText, type === t && styles.pillTextActive]}>{TYPE_LABELS[t]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Exposition</Text>
            <View style={styles.row}>
              {SUN.map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => setSun(s)}
                  style={[styles.pill, sun === s && styles.pillActive]}
                >
                  <Text style={[styles.pillText, sun === s && styles.pillTextActive]}>{SUN_LABELS[s]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Arrosage</Text>
            <View style={styles.row}>
              {WATER.map((w) => (
                <TouchableOpacity
                  key={w}
                  onPress={() => setWater(w)}
                  style={[styles.pill, water === w && styles.pillActive]}
                >
                  <Text style={[styles.pillText, water === w && styles.pillTextActive]}>{WATER_LABELS[w]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Couleur des fleurs</Text>
            <TextInput
              style={styles.input}
              value={flowerColor}
              onChangeText={setFlowerColor}
              placeholder="ex. rose, blanc"
              placeholderTextColor={colors.dark.textSecondary}
            />
            <Text style={styles.label}>Floraison (mois début – fin, 1–12)</Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.inputSmall]}
                value={bloomStartMonth}
                onChangeText={setBloomStartMonth}
                placeholder="Début"
                placeholderTextColor={colors.dark.textSecondary}
                keyboardType="number-pad"
              />
              <Text style={styles.dash}>–</Text>
              <TextInput
                style={[styles.input, styles.inputSmall]}
                value={bloomEndMonth}
                onChangeText={setBloomEndMonth}
                placeholder="Fin"
                placeholderTextColor={colors.dark.textSecondary}
                keyboardType="number-pad"
              />
            </View>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes..."
              placeholderTextColor={colors.dark.textSecondary}
              multiline
            />
          </GlassCard>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, (!name.trim() || saving) && styles.saveBtnDisabled]}
          onPress={save}
          disabled={!name.trim() || saving}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Text>
        </TouchableOpacity>
        <View style={{ height: 80 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  backBtn: { marginBottom: 8 },
  backBtnText: { ...typography.bodySmall, color: colors.dark.textSecondary },
  heroTitle: { ...typography.display, color: colors.dark.text },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  label: { ...typography.label, color: colors.dark.textSecondary, marginBottom: 6, marginTop: 12 },
  input: { ...typography.body, color: colors.dark.text, backgroundColor: colors.dark.surface, borderRadius: radius.sm, padding: 14, borderWidth: 1, borderColor: colors.dark.border },
  inputSmall: { flex: 1, marginRight: 8 },
  textArea: { minHeight: 80 },
  dash: { ...typography.body, color: colors.dark.textSecondary },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.full, backgroundColor: colors.dark.surface },
  pillActive: { backgroundColor: colors.dark.accent },
  pillText: { ...typography.caption, color: colors.dark.textSecondary },
  pillTextActive: { color: '#fff' },
  saveBtn: { marginHorizontal: spacing.lg, marginTop: spacing.xxl, backgroundColor: colors.dark.accent, paddingVertical: 16, borderRadius: radius.lg, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { ...typography.label, color: '#fff' },
});
