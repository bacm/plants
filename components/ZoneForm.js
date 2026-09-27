import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { showMessage } from '../lib/dialogs';
import { useRouter } from 'expo-router';
import { GradientHero } from './GradientHero';
import { GlassCard } from './GlassCard';
import { colors, spacing, typography, radius } from '../lib/theme';

const ZONE_ICONS = [
  '🌱',
  '🌳',
  '🌿',
  '🪴',
  '🌺',
  '🌻',
  '🌹',
  '🍅',
  '🥕',
  '🌾',
  '🍃',
  '🪻',
  '🌵',
  '🎋',
  '🍀',
  '☘️',
];

// Shared by app/zone/new.js and app/zone/edit.js: same name/icon/description
// fields, same save-and-go-back flow. Only the hero copy, save label and
// initial values differ, plus what onSave actually does (create vs update).
export function ZoneForm({
  heroTitle,
  heroSubtitle,
  backLabel = '← Annuler',
  saveLabel,
  savingLabel = 'Enregistrement…',
  initialName = '',
  initialDescription = '',
  initialIcon = '🌱',
  onSave,
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [icon, setIcon] = useState(initialIcon);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || null,
        icon,
      });
      router.back();
    } catch (e) {
      showMessage('Erreur', `Impossible d'enregistrer : ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <GradientHero>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityLabel="Annuler et revenir en arrière">
            <Text style={styles.backBtnText}>{backLabel}</Text>
          </TouchableOpacity>
          <Text style={styles.heroTitle}>{heroTitle}</Text>
          {heroSubtitle ? <Text style={styles.heroSubtitle}>{heroSubtitle}</Text> : null}
        </GradientHero>

        <View style={styles.section}>
          <GlassCard>
            <Text style={styles.label}>Icône</Text>
            <View style={styles.iconGrid}>
              {ZONE_ICONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.iconOption, icon === emoji && styles.iconOptionSelected]}
                  onPress={() => setIcon(emoji)}
                  activeOpacity={0.7}
                  accessibilityLabel={`Choisir l'icône ${emoji}`}>
                  <Text style={styles.iconEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Nom *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="ex. Massif nord, Balcon"
              placeholderTextColor={colors.dark.textSecondary}
              accessibilityLabel="Nom de la zone"
            />
            <Text style={styles.label}>Description (optionnel)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="ex. Potager Carré, Plein Sud-Est…"
              placeholderTextColor={colors.dark.textSecondary}
              multiline
              accessibilityLabel="Description de la zone"
            />
          </GlassCard>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, (!name.trim() || saving) && styles.saveBtnDisabled]}
          onPress={save}
          disabled={!name.trim() || saving}
          accessibilityLabel={saveLabel}>
          <Text style={styles.saveBtnText}>{saving ? savingLabel : saveLabel}</Text>
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
  input: {
    ...typography.body,
    color: colors.dark.text,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.sm,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  textArea: { minHeight: 80 },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconOption: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.dark.surface,
    borderWidth: 1,
    borderColor: colors.dark.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOptionSelected: {
    borderColor: colors.dark.accent,
    borderWidth: 2,
    backgroundColor: 'rgba(107,155,122,0.15)',
  },
  iconEmoji: { fontSize: 24 },
  saveBtn: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xxl,
    backgroundColor: colors.dark.accent,
    paddingVertical: 16,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { ...typography.label, color: '#fff' },
});
