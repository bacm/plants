import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import Icon from '../../components/Icon';
import { Field, ChipGroup, ChoiceTiles, PrimaryButton, StickyFooter } from '../../components/form';
import { colors, spacing, typography, radius } from '../../lib/theme';
import { showMessage } from '../../lib/dialogs';
import { getPlantById, createCareLog, addPhoto } from '../../lib/db';
import { CARE_TYPES } from '../../lib/enums';
import { parseISODate } from '../../lib/validation';
import { addDaysISO } from '../../lib/dates';

export default function LogCareScreen() {
  const insets = useSafeAreaInsets();
  const { plantId } = useLocalSearchParams();
  const router = useRouter();
  const [plant, setPlant] = useState(null);
  const [type, setType] = useState('watered');
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = addDaysISO(today, -1);
  const [date, setDate] = useState(today);
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

  const setDateValue = (v) => {
    setDate(v);
    setDateError('');
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12 }]}
        keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Enregistrer un soin" subtitle={plant.name} />

        <ChoiceTiles
          label="Type de soin"
          columns={2}
          stacked={false}
          options={CARE_TYPES}
          value={type}
          onChange={setType}
          allowClear={false}
        />

        <View style={styles.dateBlock}>
          <Text style={styles.label}>Date</Text>
          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <Field
                accessibilityLabel="Date"
                placeholder="AAAA-MM-JJ"
                value={date}
                onChangeText={setDateValue}
                error={dateError}
                leading={
                  <Icon name="calendar-blank-outline" size={18} color={colors.textSecondary} />
                }
              />
            </View>
            <ChipGroup
              allowClear={false}
              options={[
                { value: today, label: 'Aujourd’hui' },
                { value: yesterday, label: 'Hier' },
              ]}
              value={date}
              onChange={setDateValue}
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.notesCol}>
            <Field
              label="Notes"
              multiline
              placeholder="Facultatif"
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
            />
          </View>
          <View style={styles.photoCol}>
            <Text style={styles.label}>Photo</Text>
            {photoUri ? (
              <View style={styles.photoTile}>
                <Image source={{ uri: photoUri }} style={styles.photoImage} />
                <TouchableOpacity
                  style={styles.removePhotoBtn}
                  onPress={() => setPhotoUri(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Retirer la photo">
                  <Icon name="close" size={14} color={colors.text} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.photoPlaceholder}
                onPress={pickImage}
                accessibilityRole="button">
                <Icon name="camera-outline" size={22} color={colors.textSecondary} />
                <Text style={styles.photoPlaceholderText}>Ajouter une photo</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>

      <StickyFooter>
        <PrimaryButton
          label="Enregistrer"
          loadingLabel="Enregistrement…"
          loading={saving}
          onPress={save}
        />
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  placeholder: { ...typography.body, color: colors.textSecondary, padding: spacing.lg },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: spacing.md,
  },
  label: { ...typography.label, color: colors.text },
  dateBlock: { gap: spacing.sm },
  dateRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  dateField: { flex: 1, flexBasis: 'auto', minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  notesCol: { flex: 1, flexBasis: 'auto', gap: spacing.xs },
  notesInput: { minHeight: 104 },
  photoCol: { width: 104, gap: spacing.xs },
  photoTile: { width: 104, height: 104, borderRadius: radius.lg },
  photoImage: { width: 104, height: 104, borderRadius: radius.lg },
  removePhotoBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlaceholder: {
    width: 104,
    height: 104,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
  },
  photoPlaceholderText: {
    ...typography.caption,
    color: colors.accent,
    textAlign: 'center',
  },
});
