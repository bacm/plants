import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { GradientHero } from '../../components/GradientHero';
import { GlassCard } from '../../components/GlassCard';
import { colors, spacing, typography, radius } from '../../lib/theme';
import { getPlantById, createCareLog, addPhoto, CARE_TYPES } from '../../lib/db';

const CARE_LABELS = {
  watered: 'Arrosé',
  pruned: 'Taillé',
  fertilized: 'Fertilisé',
  deadheaded: 'Fleurs fanées coupées',
  treated: 'Traité',
  repotted: 'Rempoté',
  planted: 'Planté',
  moved: 'Déplacé',
};

export default function LogCareScreen() {
  const { plantId } = useLocalSearchParams();
  const router = useRouter();
  const [plant, setPlant] = useState(null);
  const [type, setType] = useState('watered');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (plantId) getPlantById(plantId).then(setPlant);
  }, [plantId]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', 'Autorisez l’accès aux photos pour joindre une image.');
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
    setSaving(true);
    const logId = createCareLog({ plantId, type, date, notes: notes.trim() || null });
    if (photoUri) {
      addPhoto({ plantId, careLogId: logId, uri: photoUri });
    }
    setSaving(false);
    router.replace(`/plant/${plantId}`);
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
            <Text style={styles.backBtnText}>← Annuler</Text>
          </TouchableOpacity>
          <Text style={styles.heroTitle}>Enregistrer un soin</Text>
          <Text style={styles.heroSubtitle}>{plant.name}</Text>
        </GradientHero>

        <View style={styles.section}>
          <GlassCard>
            <Text style={styles.label}>Type de soin</Text>
            <View style={styles.pills}>
              {CARE_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setType(t)}
                  style={[styles.pill, type === t && styles.pillActive]}
                >
                  <Text style={[styles.pillText, type === t && styles.pillTextActive]}>{CARE_LABELS[t]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Date</Text>
            <TextInput
              style={styles.input}
              value={date}
              onChangeText={setDate}
              placeholder="AAAA-MM-JJ"
              placeholderTextColor={colors.dark.textSecondary}
            />
            <Text style={styles.label}>Notes (optionnel)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes..."
              placeholderTextColor={colors.dark.textSecondary}
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
  container: { flex: 1, backgroundColor: colors.dark.background },
  placeholder: { ...typography.body, color: colors.dark.textSecondary, padding: spacing.lg },
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
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.full, backgroundColor: colors.dark.surface },
  pillActive: { backgroundColor: colors.dark.accent },
  pillText: { ...typography.caption, color: colors.dark.textSecondary },
  pillTextActive: { color: '#fff' },
  photoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  photoLabel: { ...typography.bodySmall, color: colors.dark.text },
  removePhoto: { ...typography.caption, color: colors.dark.accent },
  photoBtn: { paddingVertical: 14, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.dark.border, borderStyle: 'dashed', alignItems: 'center' },
  photoBtnText: { ...typography.caption, color: colors.dark.textSecondary },
  saveBtn: { marginHorizontal: spacing.lg, marginTop: spacing.xxl, backgroundColor: colors.dark.accent, paddingVertical: 16, borderRadius: radius.lg, alignItems: 'center' },
  saveBtnText: { ...typography.label, color: '#fff' },
});
