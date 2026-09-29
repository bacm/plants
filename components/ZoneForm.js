import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showMessage } from '../lib/dialogs';
import { useRouter } from 'expo-router';
import { ScreenHeader } from './ScreenHeader';
import { ZoneCardHeader } from './ZoneCardHeader';
import Icon from './Icon';
import { Field, PrimaryButton, StickyFooter } from './form';
import { colors, spacing, typography, radius } from '../lib/theme';
import { ZONE_ICONS, DEFAULT_ZONE_ICON, zoneIconFor } from '../lib/enums';

const ICON_COLUMNS = 6;

// Shared by app/zone/new.js and app/zone/edit.js: same icon/name/description
// fields, live preview and save-and-go-back flow. Only the title, save
// label and initial values differ, plus what onSave actually does (create
// vs update).
export function ZoneForm({
  title,
  saveLabel,
  savingLabel = 'Enregistrement…',
  initialName = '',
  initialDescription = '',
  initialIcon = DEFAULT_ZONE_ICON,
  plantCount = 0,
  onSave,
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12 }]}
        keyboardShouldPersistTaps="handled">
        <ScreenHeader title={title} />

        <View style={styles.section}>
          <Text style={styles.label}>Icône</Text>
          <View style={styles.iconGrid}>
            {ZONE_ICONS.map((emoji) => {
              const selected = icon === emoji;
              const { icon: glyph, tint } = zoneIconFor(emoji);
              return (
                <View key={emoji} style={styles.iconCell}>
                  <TouchableOpacity
                    style={[
                      styles.iconOption,
                      { backgroundColor: selected ? colors[tint] : colors.surface },
                      selected && styles.iconOptionSelected,
                    ]}
                    onPress={() => setIcon(emoji)}
                    activeOpacity={0.7}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`Choisir l'icône ${emoji}`}>
                    <Icon name={glyph} size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>

        <Field
          label="Nom"
          required
          placeholder="ex. Massif nord, Balcon"
          value={name}
          onChangeText={setName}
          accessibilityLabel="Nom de la zone"
        />
        <Field
          label="Description"
          multiline
          placeholder="ex. Potager Carré, Plein Sud-Est…"
          value={description}
          onChangeText={setDescription}
          accessibilityLabel="Description de la zone"
        />

        <View style={styles.section}>
          <Text style={styles.label}>Aperçu</Text>
          <View style={styles.previewCard}>
            <ZoneCardHeader
              icon={zoneIconFor(icon)}
              name={name.trim() || 'Sans nom'}
              description={description}
              count={plantCount}
            />
            {plantCount === 0 && (
              <View style={styles.previewEmpty}>
                <Text style={styles.previewEmptyText}>Les plantes de la zone apparaîtront ici</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <StickyFooter>
        <PrimaryButton
          label={saveLabel}
          loadingLabel={savingLabel}
          loading={saving}
          disabled={!name.trim()}
          onPress={save}
        />
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: spacing.md,
  },
  section: { gap: spacing.sm },
  label: { ...typography.label, color: colors.text },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  iconCell: { width: `${100 / ICON_COLUMNS}%`, alignItems: 'center', paddingVertical: 4 },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOptionSelected: {
    borderWidth: 1.5,
    borderColor: colors.text,
  },
  previewCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: 14,
    gap: spacing.md,
  },
  previewEmpty: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewEmptyText: { ...typography.caption, color: colors.textSecondary },
});
