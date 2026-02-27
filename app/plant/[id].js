import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GradientHero } from '../../components/GradientHero';
import { GlassCard } from '../../components/GlassCard';
import { colors, spacing, typography, radius } from '../../lib/theme';
import * as ImagePicker from 'expo-image-picker';
import {
  getPlantById,
  getCareLogsByPlantId,
  getRemindersByPlantId,
  getPhotosByPlantId,
  addPhoto,
  deletePhoto,
  markReminderDone,
  createCareLog,
  deletePlant,
  deleteReminder,
} from '../../lib/db';

const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
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
const REMINDER_LABELS = {
  water: 'Arroser',
  prune: 'Tailler',
  fertilize: 'Fertiliser',
  deadhead: 'Couper fleurs fanées',
  winter_prep: 'Préparer l’hiver',
  custom: 'Autre',
};
const SUN_LABELS = { full_sun: 'Plein soleil', partial: 'Mi-ombre', shade: 'Ombre' };
const WATER_LABELS = { low: 'Faible', medium: 'Moyen', high: 'Élevé' };

export default function PlantDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [plant, setPlant] = useState(null);
  const [careLogs, setCareLogs] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (id === 'new') return;
    const [p, c, r, ph] = await Promise.all([
      getPlantById(id),
      getCareLogsByPlantId(id),
      getRemindersByPlantId(id),
      getPhotosByPlantId(id),
    ]);
    setPlant(p);
    setCareLogs(c);
    setReminders(r);
    setPhotos(ph);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleReminderDone = async (reminder) => {
    const kindMap = {
      water: 'watered',
      prune: 'pruned',
      fertilize: 'fertilized',
      deadhead: 'deadheaded',
      winter_prep: 'treated',
      custom: 'treated',
    };
    markReminderDone(reminder.id);
    await createCareLog({
      plantId: id,
      type: kindMap[reminder.kind] || 'watered',
      date: new Date().toISOString().slice(0, 10),
    });
    await load();
  };

  const handleAddPhoto = async (source) => {
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission refusée', 'Autorisez l’accès à la caméra pour prendre une photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled) {
        addPhoto({ plantId: id, uri: result.assets[0].uri });
        await load();
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission refusée', 'Autorisez l’accès aux photos pour en ajouter une.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled) {
        addPhoto({ plantId: id, uri: result.assets[0].uri });
        await load();
      }
    }
  };

  const showAddPhotoOptions = () => {
    Alert.alert('Ajouter une photo', 'Prendre une photo ou choisir depuis la galerie ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Prendre une photo', onPress: () => handleAddPhoto('camera') },
      { text: 'Galerie', onPress: () => handleAddPhoto('gallery') },
    ]);
  };

  const handleDeletePhoto = (photo) => {
    Alert.alert('Supprimer la photo', 'Cette photo sera supprimée.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { deletePhoto(photo.id); await load(); } },
    ]);
  };

  const handleDelete = () => {
    Alert.alert(
      'Supprimer la plante',
      'Cette plante et tout son historique seront supprimés.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            deletePlant(id);
            router.replace('/(tabs)');
          },
        },
      ]
    );
  };

  if (id === 'new') {
    router.replace('/plant/new');
    return null;
  }

  if (!plant) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>Chargement…</Text>
      </View>
    );
  }

  const coverPhoto = photos[0];

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.dark.accent}
          />
        }
      >
        <GradientHero style={styles.hero}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Retour</Text>
          </TouchableOpacity>
          {coverPhoto ? (
            <TouchableOpacity style={styles.coverWrap} onLongPress={() => handleDeletePhoto(coverPhoto)} activeOpacity={1}>
              <Image source={{ uri: coverPhoto.uri }} style={styles.coverImage} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.coverPlaceholder} onPress={showAddPhotoOptions} activeOpacity={0.8}>
              <Text style={styles.coverPlaceholderText}>📷</Text>
              <Text style={styles.coverPlaceholderHint}>Appuyez pour ajouter une photo</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.plantName}>{plant.name}</Text>
          {plant.latinName ? (
            <Text style={styles.latinName}>{plant.latinName}</Text>
          ) : null}
          {plant.zoneName ? (
            <Text style={styles.zoneTag}>{plant.zoneName}</Text>
          ) : null}
        </GradientHero>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Photos</Text>
            <TouchableOpacity onPress={showAddPhotoOptions}>
              <Text style={styles.sectionLink}>+ Ajouter</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photosScroll}
          >
            {photos.map((photo) => (
              <TouchableOpacity
                key={photo.id}
                style={styles.photoThumbWrap}
                onLongPress={() => handleDeletePhoto(photo)}
                activeOpacity={1}
              >
                <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.addPhotoTile} onPress={showAddPhotoOptions}>
              <Text style={styles.addPhotoTileText}>+</Text>
              <Text style={styles.addPhotoTileLabel}>Ajouter</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fiche</Text>
          <GlassCard>
            <Row label="Exposition" value={SUN_LABELS[plant.sun]} />
            <Row label="Arrosage" value={WATER_LABELS[plant.water]} />
            {plant.flowerColor ? <Row label="Couleur" value={plant.flowerColor} /> : null}
            {plant.bloomStartMonth != null && plant.bloomEndMonth != null ? (
              <Row
                label="Floraison"
                value={`${MONTHS[plant.bloomStartMonth - 1]} – ${MONTHS[plant.bloomEndMonth - 1]}`}
              />
            ) : null}
            {plant.notes ? (
              <View style={styles.notesRow}>
                <Text style={styles.rowLabel}>Notes</Text>
                <Text style={styles.notesText}>{plant.notes}</Text>
              </View>
            ) : null}
          </GlassCard>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Rappels</Text>
            <TouchableOpacity onPress={() => router.push({ pathname: '/plant/reminders', params: { plantId: id } })}>
              <Text style={styles.sectionLink}>Gérer</Text>
            </TouchableOpacity>
          </View>
          {reminders.filter((r) => r.enabled).length === 0 ? (
            <GlassCard>
              <Text style={styles.emptyText}>Aucun rappel. Ajoutez-en depuis « Gérer ».</Text>
            </GlassCard>
          ) : (
            reminders
              .filter((r) => r.enabled)
              .map((r) => (
                <GlassCard key={r.id} style={styles.reminderCard}>
                  <View style={styles.reminderRow}>
                    <View style={styles.reminderInfo}>
                      <Text style={styles.reminderKind}>{REMINDER_LABELS[r.kind]}</Text>
                      <Text style={styles.reminderDue}>Prochaine échéance : {r.nextDueDate}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleReminderDone(r)}
                      style={styles.doneBtn}
                    >
                      <Text style={styles.doneBtnText}>Fait</Text>
                    </TouchableOpacity>
                  </View>
                </GlassCard>
              ))
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Historique de soins</Text>
            <TouchableOpacity onPress={() => router.push({ pathname: '/plant/log', params: { plantId: id } })}>
              <Text style={styles.sectionLink}>+ Log</Text>
            </TouchableOpacity>
          </View>
          {careLogs.length === 0 ? (
            <GlassCard>
              <Text style={styles.emptyText}>Aucun soin enregistré.</Text>
            </GlassCard>
          ) : (
            careLogs.slice(0, 10).map((log) => (
              <GlassCard key={log.id} style={styles.logCard}>
                <Text style={styles.logType}>{CARE_LABELS[log.type]}</Text>
                <Text style={styles.logDate}>{log.date}</Text>
                {log.notes ? <Text style={styles.logNotes}>{log.notes}</Text> : null}
              </GlassCard>
            ))
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push({ pathname: '/plant/log', params: { plantId: id } })}
          >
            <Text style={styles.primaryButtonText}>Enregistrer un soin</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => router.push({ pathname: '/plant/edit', params: { id } })}
          >
            <Text style={styles.editButtonText}>Modifier la fiche</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
            <Text style={styles.deleteBtnText}>Supprimer la plante</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.attrRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.background },
  placeholder: { ...typography.body, color: colors.dark.textSecondary, padding: spacing.lg },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  hero: { paddingBottom: 24 },
  backBtn: { marginBottom: 8 },
  backBtnText: { ...typography.bodySmall, color: colors.dark.textSecondary },
  coverWrap: { width: '100%', height: 200, borderRadius: radius.lg, overflow: 'hidden', marginVertical: 12 },
  coverImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  coverPlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: radius.lg,
    backgroundColor: colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  coverPlaceholderText: { fontSize: 48 },
  coverPlaceholderHint: { ...typography.caption, color: colors.dark.textSecondary, marginTop: 8 },
  photosScroll: { gap: spacing.sm, paddingVertical: spacing.sm },
  photoThumbWrap: { width: 88, height: 88, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.dark.surface },
  photoThumb: { width: '100%', height: '100%', resizeMode: 'cover' },
  addPhotoTile: {
    width: 88,
    height: 88,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.dark.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoTileText: { fontSize: 28, color: colors.dark.textSecondary, lineHeight: 32 },
  addPhotoTileLabel: { ...typography.caption, color: colors.dark.textSecondary, marginTop: 2 },
  plantName: { ...typography.display, color: colors.dark.text, marginTop: 8 },
  latinName: { ...typography.bodySmall, color: colors.dark.textSecondary, fontStyle: 'italic' },
  zoneTag: { ...typography.caption, color: colors.dark.accent, marginTop: 4 },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { ...typography.title, color: colors.dark.text },
  sectionLink: { ...typography.caption, color: colors.dark.accent },
  attrRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.dark.border },
  rowLabel: { ...typography.caption, color: colors.dark.textSecondary },
  rowValue: { ...typography.body, color: colors.dark.text },
  notesRow: { paddingVertical: 8 },
  notesText: { ...typography.bodySmall, color: colors.dark.text },
  emptyText: { ...typography.bodySmall, color: colors.dark.textSecondary },
  reminderCard: { marginBottom: spacing.sm },
  reminderRow: { flexDirection: 'row', alignItems: 'center' },
  reminderInfo: { flex: 1 },
  reminderKind: { ...typography.label, color: colors.dark.text },
  reminderDue: { ...typography.caption, color: colors.dark.textSecondary, marginTop: 2 },
  doneBtn: { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: colors.dark.accent, borderRadius: radius.sm },
  doneBtnText: { ...typography.caption, color: '#fff' },
  logCard: { marginBottom: spacing.sm },
  logType: { ...typography.label, color: colors.dark.text },
  logDate: { ...typography.caption, color: colors.dark.textSecondary, marginTop: 2 },
  logNotes: { ...typography.bodySmall, color: colors.dark.text, marginTop: 4 },
  actions: { paddingHorizontal: spacing.lg, marginTop: spacing.xxl, gap: spacing.md },
  primaryButton: {
    backgroundColor: colors.dark.accent,
    paddingVertical: 16,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  primaryButtonText: { ...typography.label, color: '#fff' },
  editButton: {
    paddingVertical: 16,
    borderRadius: radius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  editButtonText: { ...typography.label, color: colors.dark.textSecondary },
  deleteBtn: { paddingVertical: 12, alignItems: 'center' },
  deleteBtnText: { ...typography.caption, color: colors.dark.textSecondary },
});
