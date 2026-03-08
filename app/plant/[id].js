import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  Dimensions,
  Animated,
} from 'react-native';
import { GestureHandlerRootView, PinchGestureHandler, State } from 'react-native-gesture-handler';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
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
  deleteCareLog,
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
  winter_prep: "Préparer l'hiver",
  custom: 'Autre',
};
const SUN_LABELS = { full_sun: 'Plein soleil', partial: 'Mi-ombre', shade: 'Ombre' };
const WATER_LABELS = { low: 'Faible', medium: 'Moyen', high: 'Élevé' };

export default function PlantDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('info');
  const [plant, setPlant] = useState(null);
  const [careLogs, setCareLogs] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pendingPhotoUri, setPendingPhotoUri] = useState(null);
  const [photoDate, setPhotoDate] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [zoomScale, setZoomScale] = useState(1);
  
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

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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
        setPendingPhotoUri(result.assets[0].uri);
        setPhotoDate(new Date().toISOString().slice(0, 10));
        setShowDatePicker(true);
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission refusée', 'Autorisez l\'accès aux photos pour en ajouter une.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled) {
        setPendingPhotoUri(result.assets[0].uri);
        setPhotoDate(new Date().toISOString().slice(0, 10));
        setShowDatePicker(true);
      }
    }
  };

  const confirmPhoto = async () => {
    if (!pendingPhotoUri) return;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const validDate = dateRegex.test(photoDate) ? photoDate : new Date().toISOString().slice(0, 10);
    addPhoto({ plantId: id, uri: pendingPhotoUri, date: validDate });
    setShowDatePicker(false);
    setPendingPhotoUri(null);
    setPhotoDate('');
    await load();
  };

  const cancelPhoto = () => {
    setShowDatePicker(false);
    setPendingPhotoUri(null);
    setPhotoDate('');
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

  const handleDeleteCareLog = (log) => {
    Alert.alert('Supprimer le soin', 'Ce soin sera supprimé.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: async () => { deleteCareLog(log.id); await load(); } },
    ]);
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

  const renderTabContent = () => {
    switch (activeTab) {
      case 'info':
        return (
          <ScrollView style={styles.tabScroll} contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.dark.accent} />}>
            <View style={styles.tabContentInner}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Fiche</Text>
              <GlassCard>
                <Row label="Exposition" value={SUN_LABELS[plant.sun]} />
                <Row label="Arrosage" value={WATER_LABELS[plant.water]} />
                {plant.flowerColor ? <Row label="Couleur" value={plant.flowerColor} /> : null}
                {plant.bloomStartMonth != null && plant.bloomEndMonth != null ? (
                  <Row label="Floraison" value={`${MONTHS[plant.bloomStartMonth - 1]} – ${MONTHS[plant.bloomEndMonth - 1]}`} />
                ) : null}
                {plant.height ? <Row label="Hauteur" value={`${plant.height} cm`} /> : null}
                {plant.width ? <Row label="Largeur" value={`${plant.width} cm`} /> : null}
                {plant.deciduous !== null ? (
                  <Row label="Feuillage" value={plant.deciduous ? 'Caduque' : 'Persistante'} />
                ) : null}
                {plant.minTemperature != null ? (
                  <Row label="Temp. min" value={`${plant.minTemperature} °C`} />
                ) : null}
                {plant.notes ? (
                  <View style={styles.notesRow}>
                    <Text style={styles.rowLabel}>Notes</Text>
                    <Text style={styles.notesText}>{plant.notes}</Text>
                  </View>
                ) : null}
              </GlassCard>
            </View>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.editButton} onPress={() => router.push({ pathname: '/plant/edit', params: { id } })}>
                <Text style={styles.editButtonText}>Modifier la fiche</Text>
              </TouchableOpacity>
            </View>
            </View>
          </ScrollView>
        );
      case 'photos':
        return (
          <ScrollView style={styles.tabScroll} contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.dark.accent} />}>
            <View style={styles.tabContentInner}>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Mes photos</Text>
                <TouchableOpacity onPress={showAddPhotoOptions}>
                  <Text style={styles.sectionLink}>+ Ajouter</Text>
                </TouchableOpacity>
              </View>
              {photos.length === 0 ? (
                <GlassCard>
                  <TouchableOpacity style={styles.emptyPhotos} onPress={showAddPhotoOptions}>
                    <Text style={styles.emptyPhotosText}>📷</Text>
                    <Text style={styles.emptyPhotosHint}>Appuyez pour ajouter une photo</Text>
                  </TouchableOpacity>
                </GlassCard>
              ) : (
                <View style={styles.timeline}>
                  {photos.map((photo, index) => (
                    <View key={photo.id} style={styles.timelineItem}>
                      <View style={styles.timelineLeft}>
                        <View style={styles.timelineDot} />
                        {index < photos.length - 1 && <View style={styles.timelineLine} />}
                      </View>
                      <View style={styles.timelineContent}>
                        <Text style={styles.timelineDate}>{photo.date}</Text>
                        <TouchableOpacity 
                          style={styles.timelinePhotoWrap} 
                          onPress={() => setSelectedPhoto(photo)}
                          onLongPress={() => handleDeletePhoto(photo)} 
                          activeOpacity={1}
                        >
                          <Image source={{ uri: photo.uri }} style={styles.timelinePhoto} resizeMode="contain" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.addPhotoItem} onPress={showAddPhotoOptions}>
                    <Text style={styles.addPhotoItemText}>+</Text>
                    <Text style={styles.addPhotoItemLabel}>Ajouter</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            </View>
          </ScrollView>
        );
      case 'actions':
        return (
          <ScrollView style={styles.tabScroll} contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.dark.accent} />}>
            <View style={styles.tabContentInner}>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Rappels</Text>
                <TouchableOpacity onPress={() => router.push({ pathname: '/plant/reminders', params: { plantId: id } })}>
                  <Text style={styles.sectionLink}>Gérer</Text>
                </TouchableOpacity>
              </View>
              {reminders.filter((r) => r.enabled).length === 0 ? (
                <GlassCard><Text style={styles.emptyText}>Aucun rappel.</Text></GlassCard>
              ) : (
                reminders.filter((r) => r.enabled).map((r) => (
                  <GlassCard key={r.id} style={styles.reminderCard}>
                    <View style={styles.reminderRow}>
                      <View style={styles.reminderInfo}>
                        <Text style={styles.reminderKind}>{REMINDER_LABELS[r.kind]}</Text>
                        <Text style={styles.reminderDue}>Prochaine : {r.nextDueDate}</Text>
                      </View>
                      <TouchableOpacity onPress={() => handleReminderDone(r)} style={styles.doneBtn}>
                        <Text style={styles.doneBtnText}>Fait</Text>
                      </TouchableOpacity>
                    </View>
                  </GlassCard>
                ))
              )}
            </View>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Historique</Text>
                <TouchableOpacity onPress={() => router.push({ pathname: '/plant/log', params: { plantId: id } })}>
                  <Text style={styles.sectionLink}>+ Log</Text>
                </TouchableOpacity>
              </View>
              {careLogs.length === 0 ? (
                <GlassCard><Text style={styles.emptyText}>Aucun soin enregistré.</Text></GlassCard>
              ) : (
                careLogs.slice(0, 10).map((log) => (
                  <GlassCard key={log.id} style={styles.logCard}>
                    <View style={styles.logRow}>
                      <View style={styles.logInfo}>
                        <Text style={styles.logType}>{CARE_LABELS[log.type]}</Text>
                        <Text style={styles.logDate}>{log.date}</Text>
                      </View>
                      <TouchableOpacity onPress={() => handleDeleteCareLog(log)}>
                        <Text style={styles.logDeleteText}>Supprimer</Text>
                      </TouchableOpacity>
                    </View>
                  </GlassCard>
                ))
              )}
            </View>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.primaryButton} onPress={() => router.push({ pathname: '/plant/log', params: { plantId: id } })}>
                <Text style={styles.primaryButtonText}>Enregistrer un soin</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
                <Text style={styles.deleteBtnText}>Supprimer la plante</Text>
              </TouchableOpacity>
            </View>
            </View>
          </ScrollView>
        );
    }
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      <ScrollView style={styles.mainScroll} contentContainerStyle={styles.mainScrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.dark.accent} />}>
        <View style={styles.heroSection}>
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
          {plant.latinName ? <Text style={styles.latinName}>{plant.latinName}</Text> : null}
          {plant.zoneName ? <Text style={styles.zoneTag}>{plant.zoneName}</Text> : null}
        </View>

        <View style={styles.tabBar}>
          <TouchableOpacity style={[styles.tab, activeTab === 'info' && styles.tabActive]} onPress={() => setActiveTab('info')}>
            <Text style={[styles.tabText, activeTab === 'info' && styles.tabTextActive]}>Info</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, activeTab === 'photos' && styles.tabActive]} onPress={() => setActiveTab('photos')}>
            <Text style={[styles.tabText, activeTab === 'photos' && styles.tabTextActive]}>Photos</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, activeTab === 'actions' && styles.tabActive]} onPress={() => setActiveTab('actions')}>
            <Text style={[styles.tabText, activeTab === 'actions' && styles.tabTextActive]}>Actions</Text>
          </TouchableOpacity>
        </View>

        {renderTabContent()}
      </ScrollView>

      <Modal visible={showDatePicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Date de la photo</Text>
            <TextInput
              style={styles.dateInput}
              value={photoDate}
              onChangeText={setPhotoDate}
              placeholder="AAAA-MM-JJ"
              placeholderTextColor={colors.dark.textSecondary}
              keyboardType="numbers-and-punctuation"
            />
            <Text style={styles.dateHint}>Format: AAAA-MM-JJ (ex: 2024-05-15)</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={cancelPhoto}>
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirmBtn} onPress={confirmPhoto}>
                <Text style={styles.modalConfirmText}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!selectedPhoto} transparent animationType="fade" onRequestClose={() => setSelectedPhoto(null)}>
        <View style={styles.lightboxOverlay}>
          <View style={styles.lightboxHeader}>
            <TouchableOpacity style={styles.lightboxBackBtn} onPress={() => setSelectedPhoto(null)}>
              <Text style={styles.lightboxBackText}>← Retour</Text>
            </TouchableOpacity>
          </View>
          {selectedPhoto && (
            <PinchGestureHandler onGestureEvent={(e) => {
              if (e.nativeEvent.scale > 1) {
                setZoomScale(e.nativeEvent.scale);
              }
            }} onHandlerStateChange={(e) => {
              if (e.nativeEvent.oldState === State.ACTIVE) {
                setZoomScale(1);
              }
            }}>
              <Animated.View style={[styles.lightboxImageContainer, { transform: [{ scale: zoomScale }] }]}>
                <Image source={{ uri: selectedPhoto.uri }} style={styles.lightboxImage} resizeMode="contain" />
              </Animated.View>
            </PinchGestureHandler>
          )}
          {selectedPhoto && (
            <Text style={styles.lightboxDate}>{selectedPhoto.date}</Text>
          )}
        </View>
      </Modal>
    </GestureHandlerRootView>
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
  scrollContent: { paddingBottom: 24 },
  heroAnimated: { overflow: 'hidden' },
  hero: { paddingBottom: 24 },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.dark.border, backgroundColor: colors.dark.surface },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.dark.accent },
  tabText: { ...typography.caption, color: colors.dark.textSecondary, textTransform: 'uppercase' },
  tabTextActive: { color: colors.dark.accent, fontWeight: '600' },
  tabScroll: { flex: 1 },
  mainScroll: { flex: 1 },
  mainScrollContent: { paddingBottom: 20 },
  heroSection: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.lg },
  tabContent: { flex: 1 },
  tabContentInner: { paddingBottom: 40 },
  backBtn: { marginBottom: 8 },
  backBtnText: { ...typography.bodySmall, color: colors.dark.textSecondary },
  coverWrap: { width: '100%', height: 200, borderRadius: radius.lg, overflow: 'hidden', marginVertical: 12 },
  coverImage: { width: '100%', height: '100%', resizeMode: 'contain' },
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
  photoGrid: { gap: spacing.md },
  photoItemWrap: { width: '100%', aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.dark.surface, marginBottom: spacing.xs },
  photoItem: { width: '100%', height: '100%' },
  photoDate: { ...typography.caption, color: colors.dark.textSecondary, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.sm },
  timeline: { paddingLeft: spacing.sm },
  timelineItem: { flexDirection: 'row', marginBottom: spacing.md },
  timelineLeft: { alignItems: 'center', width: 24 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.dark.accent },
  timelineLine: { flex: 1, width: 2, backgroundColor: colors.dark.border, marginTop: spacing.xs },
  timelineContent: { flex: 1, marginLeft: spacing.md },
  timelineDate: { ...typography.label, color: colors.dark.text, marginBottom: spacing.sm },
  timelinePhotoWrap: { width: '100%', aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.dark.surface },
  timelinePhoto: { width: '100%', height: '100%' },
  addPhotoItem: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.dark.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  addPhotoItemText: { fontSize: 48, color: colors.dark.textSecondary, lineHeight: 56 },
  addPhotoItemLabel: { ...typography.body, color: colors.dark.textSecondary, marginTop: spacing.xs },
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
  emptyPhotos: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyPhotosText: { fontSize: 48, marginBottom: 8 },
  emptyPhotosHint: { ...typography.caption, color: colors.dark.textSecondary },
  reminderCard: { marginBottom: spacing.sm },
  reminderRow: { flexDirection: 'row', alignItems: 'center' },
  reminderInfo: { flex: 1 },
  reminderKind: { ...typography.label, color: colors.dark.text },
  reminderDue: { ...typography.caption, color: colors.dark.textSecondary, marginTop: 2 },
  doneBtn: { paddingVertical: 8, paddingHorizontal: 14, backgroundColor: colors.dark.accent, borderRadius: radius.sm },
  doneBtnText: { ...typography.caption, color: '#fff' },
  logCard: { marginBottom: spacing.sm },
  logRow: { flexDirection: 'row', alignItems: 'flex-start' },
  logInfo: { flex: 1 },
  logType: { ...typography.label, color: colors.dark.text },
  logDate: { ...typography.caption, color: colors.dark.textSecondary, marginTop: 2 },
  logNotes: { ...typography.bodySmall, color: colors.dark.text, marginTop: 4 },
  logDeleteBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  logDeleteText: { ...typography.caption, color: colors.dark.accent },
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: colors.dark.surface, borderRadius: radius.lg, padding: spacing.lg, width: '85%', maxWidth: 340 },
  modalTitle: { ...typography.title, color: colors.dark.text, textAlign: 'center', marginBottom: spacing.md },
  dateInput: { ...typography.body, color: colors.dark.text, backgroundColor: colors.dark.background, borderRadius: radius.sm, padding: 14, borderWidth: 1, borderColor: colors.dark.border, textAlign: 'center' },
  dateHint: { ...typography.caption, color: colors.dark.textSecondary, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.md },
  modalButtons: { flexDirection: 'row', gap: spacing.sm },
  modalCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.dark.border, alignItems: 'center' },
  modalCancelText: { ...typography.label, color: colors.dark.textSecondary },
  modalConfirmBtn: { flex: 1, paddingVertical: 14, borderRadius: radius.sm, backgroundColor: colors.dark.accent, alignItems: 'center' },
  modalConfirmText: { ...typography.label, color: '#fff' },
  lightboxOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  lightboxHeader: { position: 'absolute', top: 50, left: 0, right: 0, paddingHorizontal: spacing.lg, zIndex: 10 },
  lightboxBackBtn: { paddingVertical: spacing.sm, paddingRight: spacing.lg },
  lightboxBackText: { ...typography.body, color: '#fff' },
  lightboxCloseBtn: { position: 'absolute', top: 60, right: 20, zIndex: 10, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  lightboxCloseText: { fontSize: 24, color: '#fff' },
  lightboxImageContainer: { width: Dimensions.get('window').width, height: Dimensions.get('window').height * 0.7, justifyContent: 'center', alignItems: 'center' },
  lightboxImage: { width: '100%', height: '100%' },
  lightboxDate: { position: 'absolute', bottom: 50, ...typography.body, color: '#fff', textAlign: 'center' },
});
