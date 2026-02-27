import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { GradientHero } from '../../components/GradientHero';
import { GlassCard } from '../../components/GlassCard';
import { colors, spacing, typography, radius } from '../../lib/theme';
import { createZone } from '../../lib/db';

export default function NewZoneScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const save = () => {
    if (!name.trim()) return;
    setSaving(true);
    createZone({ name: name.trim(), description: description.trim() || null });
    setSaving(false);
    router.back();
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <GradientHero>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Annuler</Text>
          </TouchableOpacity>
          <Text style={styles.heroTitle}>Nouvelle zone</Text>
          <Text style={styles.heroSubtitle}>Massif, bac, balcon…</Text>
        </GradientHero>

        <View style={styles.section}>
          <GlassCard>
            <Text style={styles.label}>Nom *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="ex. Massif nord, Balcon"
              placeholderTextColor={colors.dark.textSecondary}
            />
            <Text style={styles.label}>Description (optionnel)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Description..."
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
          <Text style={styles.saveBtnText}>{saving ? 'Enregistrement…' : 'Créer la zone'}</Text>
        </TouchableOpacity>
        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  backBtn: { marginBottom: 8 },
  backBtnText: { ...typography.bodySmall, color: colors.dark.textSecondary },
  heroTitle: { ...typography.display, color: colors.dark.text },
  heroSubtitle: { ...typography.bodySmall, color: colors.dark.textSecondary, marginTop: 4 },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  label: { ...typography.label, color: colors.dark.textSecondary, marginBottom: 6, marginTop: 12 },
  input: { ...typography.body, color: colors.dark.text, backgroundColor: colors.dark.surface, borderRadius: radius.sm, padding: 14, borderWidth: 1, borderColor: colors.dark.border },
  textArea: { minHeight: 80 },
  saveBtn: { marginHorizontal: spacing.lg, marginTop: spacing.xxl, backgroundColor: colors.dark.accent, paddingVertical: 16, borderRadius: radius.lg, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { ...typography.label, color: '#fff' },
});
