import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { GradientHero } from '../../components/GradientHero';
import { GlassCard } from '../../components/GlassCard';
import Icon from '../../components/Icon';
import { colors, spacing, typography, radius } from '../../lib/theme';
import { showMessage } from '../../lib/dialogs';
import { getPlantById, createCareLog, addPhoto } from '../../lib/db';
import { CARE_TYPES } from '../../lib/enums';
import { parseISODate } from '../../lib/validation';

export default function LogCareScreen() {
  const { plantId } = useLocalSearchParams();
  const router = useRouter();
  const [plant, setPlant] = useState(null);
  const [type, setType] = useState('watered');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dateError, setDateError] = useState('');
  const [notes, setNotes] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (plantId) getPlantById(plantId).then(setPlant);
    }, [plantId])
  );

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showMessage('Permission refusée', 'Autorisez l’accès aux photos pour joindre une image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  };

  const save = async () => {
    if (!plantId) return;
    const { value, error } = parseISODate(date);
    if (error || value == null) {
      setDateError(error || 'Date requise');
      return;
    }
    setDateError('');
    setSaving(true);
    try {
      const logId = createCareLog({ plantId, type, date: value, notes: notes.trim() || null });
      if (photoUri) {
        await addPhoto({ plantId, careLogId: logId, uri: photoUri, date: value });
      }
      router.back();
    } catch (e) {
      showMessage('Erreur', `Impossible d'enregistrer : ${e.message}`);
    } finally {
      setSaving(false);
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
            <Text style={styles.backBtnText}>Annuler</Text>
          </TouchableOpacity>
          <Text style={styles.heroTitle}>Enregistrer un soin</Text>
          <Text style={styles.heroSubtitle}>{plant.name}</Text>
        </GradientHero>

        <View style={styles.section}>
          <GlassCard>
            <Text style={styles.label}>Type de soin</Text>
            <View style={styles.pills}>
              {CARE_TYPES.map(({ value: t, label }) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setType(t)}
                  style={[styles.pill, type === t && styles.pillActive]}>
                  <Text style={[styles.pillText, type === t && styles.pillTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Date</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={(v) => {
                setDate(v);
                setDateError('');
              }}
              placeholder="AAAA-MM-JJ"
              placeholderTextColor={colors.textSecondary}
            />
            {dateError ? <Text style={styles.fieldError}>{dateError}</Text> : null}
            <Text style={styles.label}>Notes (optionnel)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes..."
              placeholderTextColor={colors.textSecondary}
              multiline
            />
            <Text style={styles.label}>Photo (optionnel)</Text>
            {photoUri ? (
              <View style={styles.photoRow}>
                <Text style={styles.photoLabel}>Photo ajoutée</Text>
                <TouchableOpacity onPress={() => setPhotoUri(null)}>
                  <Text style={styles.removePhoto}>Retirer</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.photoBtn} onPress={pickImage}>
                <Text style={styles.photoBtnText}>+ Ajouter une photo</Text>
              </TouchableOpacity>
            )}
          </GlassCard>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Text>
        </TouchableOpacity>
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
  fieldError: { ...typography.caption, color: colors.danger, marginTop: 6 },
  textArea: { minHeight: 80 },
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
  photoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  photoLabel: { ...typography.bodySmall, color: colors.text },
  removePhoto: { ...typography.caption, color: colors.accent },
  photoBtn: {
    paddingVertical: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  photoBtnText: { ...typography.caption, color: colors.textSecondary },
  saveBtn: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xxl,
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  saveBtnText: { ...typography.label, color: '#fff' },
});
