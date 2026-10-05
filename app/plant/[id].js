import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  Modal,
  TextInput,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import { PhotoPager } from '../../components/PhotoPager';
import { PrimaryButton, Field } from '../../components/form';
import { ZoneChips } from '../../components/PlantStrip';
import { PlantPickList } from '../../components/PlantPickList';
import { InfoTab } from '../../components/plant/InfoTab';
import { PhotosTab } from '../../components/plant/PhotosTab';
import { ActionsTab } from '../../components/plant/ActionsTab';
import { useDeletePlant } from '../../components/plant/useDeletePlant';
import { colors, spacing, typography, radius, colorHex } from '../../lib/theme';
import { showMessage, confirm, choose } from '../../lib/dialogs';
import * as ImagePicker from 'expo-image-picker';
import { prepareForStorage } from '../../lib/photoPipeline';
import {
  getPlantById,
  getCareLogsByPlantId,
  getRemindersByPlantId,
  getPhotosByPlantId,
  getBloomObservations,
  addPhoto,
  deletePhoto,
  updatePhotoDate,
  movePhoto,
  getZones,
  getPlantsByZoneWithImages,
  markReminderDone,
  createCareLog,
  deleteCareLog,
  updatePlant,
} from '../../lib/db';
import { pickCoverPhoto } from '../../lib/coverPhoto';
import { PLANT_TYPES, isUnknown, labelFor, iconFor } from '../../lib/enums';
import { parseISODate } from '../../lib/validation';
import { isoDateLabel } from '../../lib/months';
import { parseImageUrls } from '../../lib/plantFields';
import { originalPhotoDate } from '../../lib/originalPhotoDate';
import { photoFingerprint } from '../../lib/photoFingerprint';

const HERO_HEIGHT = 310;

const TABS = [
  { key: 'info', label: 'Info' },
  { key: 'photos', label: 'Photos' },
  { key: 'actions', label: 'Actions' },
];

function getQuickTags(plant) {
  const tags = [];
  if (!isUnknown(plant.type)) {
    tags.push({
      icon: iconFor(PLANT_TYPES, plant.type) || 'sprout-outline',
      label: labelFor(PLANT_TYPES, plant.type),
    });
  }
  if (plant.minTemperature != null) {
    if (plant.minTemperature <= -15) tags.push({ icon: 'snowflake', label: 'Très rustique' });
    else if (plant.minTemperature <= -5) tags.push({ icon: 'snowflake', label: 'Rustique' });
    else tags.push({ icon: 'thermometer', label: 'Gélif' });
  }
  if (plant.type === 'tree' || plant.type === 'shrub') {
    tags.push({ icon: 'food-apple-outline', label: 'Fruitier' });
  } else if (plant.bloomStartMonth != null) {
    tags.push({ icon: 'flower-outline', label: 'Florifère' });
  }
  return tags.slice(0, 3);
}

function getNameChips(plant) {
  const chips = getQuickTags(plant).map((tag) => ({
    key: `tag-${tag.label}`,
    icon: tag.icon,
    label: tag.label,
  }));
  if (plant.flowerColor) {
    chips.push({ key: 'color', color: colorHex(plant.flowerColor), label: plant.flowerColor });
  }
  return chips;
}

function getEyebrow(plant) {
  const parts = [];
  if (!isUnknown(plant.type)) parts.push(labelFor(PLANT_TYPES, plant.type));
  if (plant.zoneName) parts.push(plant.zoneName);
  return parts.join(' · ');
}

export default function PlantDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState('info');
  const [plant, setPlant] = useState(null);
  const [careLogs, setCareLogs] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [bloomObservations, setBloomObservations] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  // Photos picked but not yet saved: [{ uri, date, unknown, fingerprint }].
  // The date modal is open while this is non-empty.
  const [pendingPhotos, setPendingPhotos] = useState([]);
  const [photoDate, setPhotoDate] = useState('');
  const [photoDateError, setPhotoDateError] = useState('');
  // Ticket 087: the lightbox pages through `photos`; the photo shown is
  // tracked by id so it survives the re-sort that follows a date edit.
  const [selectedPhotoId, setSelectedPhotoId] = useState(null);
  const [remoteImageError, setRemoteImageError] = useState(false);
  const [editingPhotoDate, setEditingPhotoDate] = useState(false);
  const [photoDateEdit, setPhotoDateEdit] = useState('');
  const [photoDateEditError, setPhotoDateEditError] = useState('');
  // Ticket 082: the "Déplacer" sheet inside the lightbox.
  const [movingPhoto, setMovingPhoto] = useState(false);
  const [moveZoneId, setMoveZoneId] = useState(null);
  const [moveZones, setMoveZones] = useState([]);
  const [movePlants, setMovePlants] = useState([]);
  const selectedIndex = photos.findIndex((p) => p.id === selectedPhotoId);
  const selectedPhoto = selectedIndex >= 0 ? photos[selectedIndex] : null;

  const load = useCallback(async () => {
    if (id === 'new') return;
    const [p, c, r, ph, blooms] = await Promise.all([
      getPlantById(id),
      getCareLogsByPlantId(id),
      getRemindersByPlantId(id),
      getPhotosByPlantId(id),
      getBloomObservations(id),
    ]);
    setPlant(p);
    setCareLogs(c);
    setReminders(r);
    setPhotos(ph);
    setBloomObservations(blooms);
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
    await markReminderDone(reminder.id);
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
        showMessage('Permission refusée', 'Autorisez l’accès à la caméra pour prendre une photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (!result.canceled) {
        const today = new Date().toISOString().slice(0, 10);
        const asset = result.assets[0];
        const uri = await prepareForStorage(asset.uri, asset.width, asset.height);
        setPendingPhotos([{ uri, date: today, unknown: false }]);
        setPhotoDate(today);
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showMessage('Permission refusée', "Autorisez l'accès aux photos pour en ajouter une.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 0,
        exif: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.length) {
        // Each photo keeps the day it was taken; the modal's date field is
        // the one photo's date, or the fallback for those without one. The
        // image is downscaled now, not on confirm: Safari can no longer read
        // the picked file once the date modal has been dismissed.
        const picked = [];
        for (const asset of result.assets) {
          picked.push({
            uri: await prepareForStorage(asset.uri, asset.width, asset.height),
            ...originalPhotoDate(asset),
            fingerprint: photoFingerprint(asset),
          });
        }
        setPendingPhotos(picked);
        setPhotoDate(picked.length === 1 ? picked[0].date : new Date().toISOString().slice(0, 10));
      }
    }
  };

  const confirmPhoto = async () => {
    if (pendingPhotos.length === 0) return;
    const single = pendingPhotos.length === 1;
    const needsDate = single || pendingPhotos.some((p) => p.unknown);
    let fallbackDate = null;
    if (needsDate) {
      const { value, error } = parseISODate(photoDate);
      if (error || value == null) {
        setPhotoDateError(error || 'Date requise');
        return;
      }
      fallbackDate = value;
    }
    // Saved one by one: on a failure, drop the ones already saved from the
    // pending list so a retry does not add them twice.
    for (let i = 0; i < pendingPhotos.length; i++) {
      const p = pendingPhotos[i];
      try {
        await addPhoto({
          plantId: id,
          uri: p.uri,
          date: single || p.unknown ? fallbackDate : p.date,
          fingerprint: p.fingerprint ?? null,
        });
      } catch (e) {
        setPendingPhotos(pendingPhotos.slice(i));
        await load();
        showMessage('Erreur', `Impossible d'ajouter la photo : ${e.message}`);
        return;
      }
    }
    setPendingPhotos([]);
    setPhotoDate('');
    setPhotoDateError('');
    await load();
  };

  const cancelPhoto = () => {
    setPendingPhotos([]);
    setPhotoDate('');
    setPhotoDateError('');
  };

  const unknownDateCount = pendingPhotos.filter((p) => p.unknown).length;

  const showAddPhotoOptions = async () => {
    const key = await choose({
      title: 'Ajouter une photo',
      message: 'Prendre une photo ou choisir depuis la galerie ?',
      options: [
        { key: 'camera', label: 'Prendre une photo' },
        { key: 'gallery', label: 'Galerie' },
      ],
      webKey: 'gallery',
    });
    if (key) await handleAddPhoto(key);
  };

  useEffect(() => {
    if (!movingPhoto) return undefined;
    let cancelled = false;
    (async () => {
      const [zs, ps] = await Promise.all([getZones(), getPlantsByZoneWithImages(moveZoneId)]);
      if (cancelled) return;
      setMoveZones(zs);
      setMovePlants(ps);
    })();
    return () => {
      cancelled = true;
    };
  }, [movingPhoto, moveZoneId]);

  const startMovePhoto = () => {
    setMoveZoneId(plant?.zoneId ?? null);
    setMovePlants([]);
    setMovingPhoto(true);
  };

  const confirmMove = async (targetId) => {
    if (targetId === plant.id) return;
    const target = movePlants.find((p) => p.id === targetId);
    try {
      movePhoto(selectedPhoto.id, targetId);
    } catch (e) {
      showMessage('Erreur', `Impossible de déplacer la photo : ${e.message}`);
      return;
    }
    closeLightbox();
    await load();
    showMessage('Photo déplacée', `Déplacée vers ${target?.name ?? 'la plante'}`);
  };

  const closeLightbox = () => {
    setSelectedPhotoId(null);
    setMovingPhoto(false);
    setEditingPhotoDate(false);
    setPhotoDateEdit('');
    setPhotoDateEditError('');
  };

  const startEditPhotoDate = () => {
    setPhotoDateEdit(selectedPhoto.date);
    setPhotoDateEditError('');
    setEditingPhotoDate(true);
  };

  const cancelEditPhotoDate = () => {
    setEditingPhotoDate(false);
    setPhotoDateEdit('');
    setPhotoDateEditError('');
  };

  const confirmEditPhotoDate = async () => {
    const { value, error } = parseISODate(photoDateEdit);
    if (error || value == null) {
      setPhotoDateEditError(error || 'Date requise');
      return;
    }
    try {
      updatePhotoDate(selectedPhoto.id, value);
    } catch (e) {
      showMessage('Erreur', `Impossible de modifier la date : ${e.message}`);
      return;
    }
    setEditingPhotoDate(false);
    setPhotoDateEdit('');
    setPhotoDateEditError('');
    await load();
  };

  const handleDeletePhoto = async (photo) => {
    const ok = await confirm({
      title: 'Supprimer la photo',
      message: 'Cette photo sera supprimée.',
      confirmLabel: 'Supprimer',
      destructive: true,
    });
    if (!ok) return;
    await deletePhoto(photo.id);
    await load();
  };

  const { deletePlantWithConfirm } = useDeletePlant(id);

  const handleDeleteCareLog = async (log) => {
    const ok = await confirm({
      title: 'Supprimer l’entrée',
      message: 'Cette entrée sera supprimée.',
      confirmLabel: 'Supprimer',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteCareLog(log.id);
    } catch (e) {
      showMessage('Erreur', `Impossible de supprimer l’entrée : ${e.message}`);
      return;
    }
    await load();
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

  const coverPhoto = pickCoverPhoto(photos, plant.coverPhotoId);
  // Ticket 088: the lightbox toggle marks/unmarks the shown photo as the cover.
  const selectedIsChosenCover =
    !!selectedPhoto &&
    plant.coverPhotoId === selectedPhoto.id &&
    coverPhoto?.id === selectedPhoto.id;
  async function toggleCoverPhoto() {
    try {
      updatePlant(plant.id, { coverPhotoId: selectedIsChosenCover ? null : selectedPhoto.id });
    } catch (e) {
      showMessage('Erreur', `Impossible de changer la photo d'accueil : ${e.message}`);
      return;
    }
    await load();
  }
  const remoteImageUrl =
    !coverPhoto && !remoteImageError ? parseImageUrls(plant.imageUrls)[0] : null;
  const hasHeroImage = Boolean(coverPhoto || remoteImageUrl);
  const bloomDates = new Set(bloomObservations.map((o) => o.date));
  const nameChips = getNameChips(plant);
  const eyebrow = getEyebrow(plant);

  const goToLog = () => router.push({ pathname: '/plant/log', params: { plantId: id } });

  const renderTabContent = () => {
    switch (activeTab) {
      case 'info':
        return (
          <InfoTab
            plant={plant}
            onEdit={() => router.push({ pathname: '/plant/edit', params: { id } })}
          />
        );
      case 'photos':
        return (
          <PhotosTab
            photos={photos}
            coverPhotoId={coverPhoto?.id}
            bloomDates={bloomDates}
            onAddPhoto={showAddPhotoOptions}
            onSelectPhoto={(photo) => setSelectedPhotoId(photo.id)}
            onDeletePhoto={handleDeletePhoto}
          />
        );
      case 'actions':
        return (
          <ActionsTab
            reminders={reminders}
            careLogs={careLogs}
            onReminderDone={handleReminderDone}
            onManageReminders={() =>
              router.push({ pathname: '/plant/reminders', params: { plantId: id } })
            }
            onDeleteCareLog={handleDeleteCareLog}
            onDeletePlant={deletePlantWithConfirm}
          />
        );
      default:
        return null;
    }
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      <ScrollView
        style={styles.mainScroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }>
        <View style={styles.heroContainer}>
          {coverPhoto ? (
            <TouchableOpacity
              style={styles.heroImageWrap}
              onLongPress={() => handleDeletePhoto(coverPhoto)}
              activeOpacity={1}>
              <Image source={{ uri: coverPhoto.uri }} style={styles.heroImage} />
            </TouchableOpacity>
          ) : remoteImageUrl ? (
            <TouchableOpacity
              style={styles.heroImageWrap}
              onPress={showAddPhotoOptions}
              activeOpacity={0.8}>
              <Image
                source={{ uri: remoteImageUrl }}
                style={styles.heroImage}
                onError={() => setRemoteImageError(true)}
              />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.heroPlaceholder}
              onPress={showAddPhotoOptions}
              activeOpacity={0.8}>
              <Icon
                name="camera-outline"
                size={40}
                color={colors.text}
                style={styles.heroPlaceholderIcon}
              />
              <Text style={styles.heroPlaceholderHint}>Appuyez pour ajouter une photo</Text>
            </TouchableOpacity>
          )}
          <View style={[styles.heroOverlay, { top: insets.top + 12 }]}>
            <TouchableOpacity
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
              style={styles.heroRoundBtn}
              accessibilityRole="button"
              accessibilityLabel="Retour">
              <Icon name="chevron-left" size={20} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push({ pathname: '/plant/edit', params: { id } })}
              style={styles.heroRoundBtn}
              accessibilityRole="button"
              accessibilityLabel="Modifier la fiche">
              <Icon name="pencil-outline" size={18} color={colors.text} />
            </TouchableOpacity>
          </View>
          {hasHeroImage && photos.length > 0 ? (
            <View style={styles.heroPill}>
              <Text style={styles.heroPillText}>1 / {photos.length} photos</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.contentSheet}>
          <View style={styles.nameBlock}>
            {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
            <Text style={styles.plantName}>{plant.name}</Text>
            {plant.latinName ? <Text style={styles.latinName}>{plant.latinName}</Text> : null}
          </View>

          {nameChips.length > 0 ? (
            <View style={styles.chipsRow}>
              {nameChips.map((chip) => (
                <View key={chip.key} style={styles.chip}>
                  {chip.color ? (
                    <View style={[styles.colorSwatch, { backgroundColor: chip.color }]} />
                  ) : (
                    <Icon name={chip.icon} size={16} color={colors.text} />
                  )}
                  <Text style={styles.chipLabel}>{chip.label}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.tabTrack} accessibilityRole="tablist" accessibilityLabel="Sections">
            {TABS.map((tab) => {
              const selected = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tabButton, selected && styles.tabButtonActive]}
                  onPress={() => setActiveTab(tab.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}>
                  <Text style={[styles.tabButtonText, selected && styles.tabButtonTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.tabContent}>{renderTabContent()}</View>
        </View>
      </ScrollView>

      <View style={[styles.stickyButtonWrap, { bottom: insets.bottom + spacing.md }]}>
        <TouchableOpacity
          style={styles.duplicateButton}
          onPress={() => router.push(`/plant/new?copyOf=${id}`)}
          accessibilityRole="button"
          accessibilityLabel="Dupliquer">
          <Icon name="content-copy" size={18} color={colors.text} />
          <Text style={styles.duplicateLabel}>Dupliquer</Text>
        </TouchableOpacity>
        <View style={styles.journalButton}>
          <PrimaryButton label="Ajouter au journal" onPress={goToLog} />
        </View>
      </View>

      <Modal visible={pendingPhotos.length > 0} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {pendingPhotos.length > 1 ? `${pendingPhotos.length} photos` : 'Date de la photo'}
            </Text>
            {pendingPhotos.length > 1 ? (
              <Text style={styles.dateHint}>
                Chaque photo garde sa date de prise de vue.
                {unknownDateCount > 0
                  ? ` Date pour ${unknownDateCount === 1 ? 'la photo' : `les ${unknownDateCount} photos`} sans date :`
                  : ''}
              </Text>
            ) : null}
            {pendingPhotos.length === 1 || unknownDateCount > 0 ? (
              <TextInput
                style={styles.dateInput}
                value={photoDate}
                onChangeText={(v) => {
                  setPhotoDate(v);
                  setPhotoDateError('');
                }}
                placeholder="AAAA-MM-JJ"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numbers-and-punctuation"
              />
            ) : null}
            {pendingPhotos.length === 1 || unknownDateCount > 0 ? (
              <Text style={styles.dateHint}>Format: AAAA-MM-JJ (ex: 2024-05-15)</Text>
            ) : null}
            {photoDateError ? <Text style={styles.fieldError}>{photoDateError}</Text> : null}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={cancelPhoto}
                accessibilityRole="button">
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={confirmPhoto}
                accessibilityRole="button">
                <Text style={styles.modalConfirmText}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!selectedPhoto}
        transparent
        animationType="fade"
        onRequestClose={closeLightbox}>
        <KeyboardAvoidingView
          style={styles.lightboxOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.lightboxHeader}>
            <TouchableOpacity
              style={styles.lightboxBackBtn}
              onPress={closeLightbox}
              accessibilityRole="button"
              accessibilityLabel="Retour">
              <Icon name="chevron-left" size={18} color="#fff" />
              <Text style={styles.lightboxBackText}>Retour</Text>
            </TouchableOpacity>
            {selectedPhoto && (
              <TouchableOpacity
                style={styles.lightboxCoverBtn}
                onPress={toggleCoverPhoto}
                accessibilityRole="button"
                accessibilityLabel={
                  selectedIsChosenCover
                    ? "Retirer comme photo d'accueil"
                    : "Choisir comme photo d'accueil"
                }>
                <Icon
                  name={selectedIsChosenCover ? 'star' : 'star-outline'}
                  size={18}
                  color={selectedIsChosenCover ? colors.highlight : '#fff'}
                />
                <Text style={styles.lightboxBackText}>
                  {selectedIsChosenCover ? "Photo d'accueil" : 'Mettre en accueil'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {selectedPhoto && (
            <View style={styles.lightboxImageContainer}>
              <PhotoPager
                photos={photos}
                index={selectedIndex}
                onIndexChange={(i) => setSelectedPhotoId(photos[i].id)}
              />
            </View>
          )}
          {selectedPhoto && !editingPhotoDate && (
            <View style={[styles.lightboxInfo, { paddingBottom: insets.bottom + 36 }]}>
              <View>
                <Text style={styles.lightboxPlantName}>{plant?.name}</Text>
                <Text style={styles.lightboxDate}>
                  {isoDateLabel(selectedPhoto.date)} · {selectedIndex + 1} / {photos.length}
                </Text>
              </View>
              <View style={styles.lightboxActions}>
                <TouchableOpacity
                  style={[styles.lightboxPill, styles.lightboxPillOutline]}
                  onPress={startEditPhotoDate}
                  accessibilityRole="button"
                  accessibilityLabel="Modifier la date">
                  <Icon name="calendar-blank-outline" size={18} color="#fff" />
                  <Text style={styles.lightboxPillOutlineText}>Modifier la date</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.lightboxPill, styles.lightboxPillFilled]}
                  onPress={startMovePhoto}
                  accessibilityRole="button"
                  accessibilityLabel="Déplacer">
                  <Icon name="arrow-right" size={18} color={colors.text} />
                  <Text style={styles.lightboxPillFilledText}>Déplacer</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {selectedPhoto && editingPhotoDate && (
            <View style={styles.lightboxDateEditRow}>
              <Field
                value={photoDateEdit}
                onChangeText={(v) => {
                  setPhotoDateEdit(v);
                  setPhotoDateEditError('');
                }}
                placeholder="AAAA-MM-JJ"
                keyboardType="numbers-and-punctuation"
                accessibilityLabel="Date de la photo"
                error={photoDateEditError}
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={cancelEditPhotoDate}
                  accessibilityRole="button">
                  <Text style={[styles.modalCancelText, styles.lightboxCancelText]}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalConfirmBtn}
                  onPress={confirmEditPhotoDate}
                  accessibilityRole="button">
                  <Text style={styles.modalConfirmText}>Enregistrer</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {selectedPhoto && movingPhoto && (
            <View style={styles.moveOverlay}>
              <View style={styles.moveSheet}>
                <View style={styles.moveGrabber} />
                <View style={styles.moveHeader}>
                  <Image source={{ uri: selectedPhoto.uri }} style={styles.moveThumb} />
                  <View style={styles.moveHeaderText}>
                    <Text style={styles.moveTitle}>Déplacer la photo</Text>
                    <Text style={styles.moveSubtitle}>Actuellement dans {plant?.name}</Text>
                  </View>
                </View>
                <ZoneChips
                  variant="light"
                  zones={moveZones}
                  zoneId={moveZoneId}
                  onSelectZone={setMoveZoneId}
                  style={styles.moveZoneChips}
                />
                <PlantPickList plants={movePlants} currentId={plant?.id} onSelect={confirmMove} />
                <TouchableOpacity
                  style={styles.moveCancelBtn}
                  onPress={() => setMovingPhoto(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Annuler le déplacement">
                  <Text style={styles.moveCancelText}>Annuler</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  placeholder: { ...typography.body, color: colors.textSecondary, padding: spacing.lg },
  mainScroll: { flex: 1 },

  // Hero
  heroContainer: { width: '100%', height: HERO_HEIGHT, backgroundColor: colors.blush },
  heroImageWrap: { width: '100%', height: '100%' },
  heroImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  heroPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  heroPlaceholderIcon: { opacity: 0.5 },
  heroPlaceholderHint: { ...typography.caption, color: colors.textSecondary },
  heroOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroRoundBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPill: {
    position: 'absolute',
    right: 16,
    bottom: 44,
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(31,42,34,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPillText: { ...typography.caption, fontSize: 12, fontWeight: '600', color: '#fff' },

  // Content sheet
  contentSheet: {
    marginTop: -30,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingTop: spacing.lg,
    paddingHorizontal: 20,
    paddingBottom: 140,
    gap: 18,
  },
  nameBlock: { gap: 4 },
  eyebrow: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: colors.textSecondary,
  },
  plantName: { ...typography.display, color: colors.text },
  latinName: { ...typography.body, fontStyle: 'italic', color: colors.textSecondary },

  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    height: 34,
    paddingLeft: 10,
    paddingRight: 14,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipLabel: { ...typography.label, fontSize: 13, fontWeight: '500', color: colors.text },
  colorSwatch: { width: 14, height: 14, borderRadius: 7 },

  // Tabs
  tabTrack: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    backgroundColor: colors.track,
    borderRadius: 22,
  },
  tabButton: {
    flex: 1,
    height: 40,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: { backgroundColor: colors.surface },
  tabButtonText: {
    ...typography.label,
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  tabButtonTextActive: { color: colors.text, fontWeight: '600' },
  tabContent: {},

  // Sticky bottom button
  stickyButtonWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    gap: 10,
  },
  duplicateButton: {
    height: 56,
    paddingHorizontal: 18,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    flexShrink: 0,
  },
  duplicateLabel: { ...typography.title, fontSize: 15, color: colors.text },
  journalButton: { flex: 1 },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: '85%',
    maxWidth: 340,
  },
  modalTitle: {
    ...typography.title,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  dateInput: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    textAlign: 'center',
  },
  dateHint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  fieldError: {
    ...typography.caption,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  modalButtons: { flexDirection: 'row', gap: spacing.sm },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modalCancelText: { ...typography.label, color: colors.textSecondary },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  modalConfirmText: { ...typography.label, color: '#fff' },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: colors.lightbox,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxHeader: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  // Round pills on the dark viewer, as in the PhotoVisionneuse artboard (ticket 119).
  lightboxCoverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingLeft: 12,
    paddingRight: 16,
    borderRadius: 22,
    backgroundColor: colors.onDarkChipBg,
  },
  lightboxBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 44,
    paddingLeft: 10,
    paddingRight: 16,
    borderRadius: 22,
    backgroundColor: colors.onDarkChipBg,
  },
  lightboxBackText: { ...typography.body, color: '#fff', fontWeight: '600' },
  lightboxImageContainer: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.7,
  },
  // The shared modal's cancel label is dark (it sits on a light card); on the
  // lightbox's black it needs the light text colour.
  lightboxCancelText: { color: colors.background },
  lightboxInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    gap: 14,
  },
  lightboxPlantName: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 17, color: '#fff' },
  lightboxDate: {
    fontFamily: 'InstrumentSans_400Regular',
    fontSize: 14,
    color: colors.onDarkMuted,
  },
  lightboxActions: { flexDirection: 'row', gap: 12 },
  lightboxPill: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  lightboxPillOutline: { borderWidth: 1.5, borderColor: colors.onDarkBorder },
  lightboxPillFilled: { backgroundColor: colors.highlight },
  lightboxPillOutlineText: {
    fontFamily: 'InstrumentSans_600SemiBold',
    fontSize: 15,
    color: '#fff',
  },
  lightboxPillFilledText: {
    fontFamily: 'InstrumentSans_600SemiBold',
    fontSize: 15,
    color: colors.text,
  },
  moveOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlayDark,
    zIndex: 20,
  },
  moveSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '76%',
    backgroundColor: colors.background,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 10,
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 14,
  },
  moveGrabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.borderStrong,
  },
  moveHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  moveThumb: { width: 52, height: 52, borderRadius: 14 },
  moveHeaderText: { flex: 1 },
  moveTitle: { ...typography.displaySmall, color: colors.text },
  moveSubtitle: {
    fontFamily: 'InstrumentSans_400Regular',
    fontSize: 13,
    color: colors.textSecondary,
  },
  moveZoneChips: { flexGrow: 0, flexShrink: 0, marginBottom: 0, marginRight: -20 },
  moveCancelBtn: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveCancelText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 15, color: colors.text },
  lightboxDateEditRow: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
});
