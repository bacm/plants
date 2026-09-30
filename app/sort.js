// "À trier" (ticket 061): sorts photos filed as "?" by the in-app camera
// (056) and photos imported from the device's photo library, one at a
// time, into the garden's plants using the same strip as the camera.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../components/ScreenHeader';
import { ZoneChips } from '../components/PlantStrip';
import { PlantPickList } from '../components/PlantPickList';
import { ZoomableImage } from '../components/ZoomableImage';
import { Field, PrimaryButton } from '../components/form';
import Icon from '../components/Icon';
import { colors, spacing, typography, radius } from '../lib/theme';
import { importPhotosFromLibrary } from '../lib/libraryImport';
import { resolveAssignDate } from '../lib/sortAssignDate';
import { showMessage, confirm } from '../lib/dialogs';
import { isoDateLabel } from '../lib/months';
import {
  getZones,
  getPlantsByZoneWithImages,
  getUnsortedPhotos,
  addPhoto,
  deleteUnsortedPhoto,
  deletePhoto,
  findDuplicateOfUnsorted,
} from '../lib/db';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function SortScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { selectPlantId, autoImport } = useLocalSearchParams();

  const [zones, setZones] = useState([]);
  const [zoneId, setZoneId] = useState(null);
  const [plants, setPlants] = useState([]);
  const [photos, setPhotos] = useState(null); // null = not loaded yet
  const [pos, setPos] = useState(0);
  const [importing, setImporting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const confirmationTimer = useRef(null);
  const consumedSelectPlantId = useRef(null);
  // The date field shown for a photo whose original date couldn't be read
  // (row.dateUnknown -- see lib/originalPhotoDate.js and the unsorted_photos
  // migration in lib/db.js). Reset to today whenever the current photo
  // changes; validated with parseISODate before an assign is allowed to
  // proceed, so an unknown date is never silently kept as the "today"
  // fallback lib/libraryImport.js filed it under.
  const [editedDate, setEditedDate] = useState(todayISO());
  const [editedDateError, setEditedDateError] = useState('');
  // Ticket 085: `{ plantId, date, existing }` while the "Photo déjà présente"
  // sheet is open for the photo being sorted.
  const [duplicate, setDuplicate] = useState(null);
  // Ticket 086: the photo being sorted, shown whole and zoomable.
  const [viewerOpen, setViewerOpen] = useState(false);

  const reload = useCallback(async () => {
    const rows = await getUnsortedPhotos();
    setPhotos(rows);
    setPos((p) => (rows.length === 0 ? 0 : Math.min(p, rows.length - 1)));
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const [zoneRows] = await Promise.all([getZones(), reload()]);
        if (!cancelled) setZones(zoneRows);
      })();
      return () => {
        cancelled = true;
      };
    }, [reload])
  );

  const reloadPlants = useCallback(async () => {
    const rows = await getPlantsByZoneWithImages(zoneId ?? null);
    setPlants(rows);
  }, [zoneId]);

  useEffect(() => {
    reloadPlants();
  }, [reloadPlants]);

  useEffect(() => {
    return () => {
      if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    };
  }, []);

  const showConfirmation = (text) => {
    setConfirmation(text);
    if (confirmationTimer.current) clearTimeout(confirmationTimer.current);
    confirmationTimer.current = setTimeout(() => setConfirmation(null), 1400);
  };

  const removeFromQueue = (id) => {
    setPhotos((prev) => {
      if (!prev) return prev;
      const next = prev.filter((p) => p.id !== id);
      setPos((p) => (next.length === 0 ? 0 : Math.min(p, next.length - 1)));
      return next;
    });
  };

  const current = photos && photos.length > 0 ? photos[pos] : null;

  // The date field resets to today each time the photo shown changes, so a
  // stale edit from a previous unknown-date photo can't leak into this one.
  useEffect(() => {
    setEditedDate(todayISO());
    setEditedDateError('');
    setDuplicate(null);
    setViewerOpen(false);
  }, [current?.id]);

  // Files the photo being sorted into `plantId`. With `replaceId`, the plant's
  // older copy of the photo is deleted once the new one is safely filed.
  const fileCurrent = useCallback(
    async (plantId, date, replaceId = null, replacedVerb = 'Remplacée') => {
      if (!current) return;
      const plant = plants.find((p) => p.id === plantId);
      try {
        await addPhoto({ plantId, uri: current.uri, date, fingerprint: current.fingerprint });
      } catch (e) {
        showMessage('Erreur', `Impossible d'assigner cette photo : ${e.message}`);
        return; // Keep the unsorted row: nothing was lost.
      }
      if (replaceId) {
        try {
          await deletePhoto(replaceId);
        } catch (e) {
          showMessage(
            'Erreur',
            `La nouvelle photo est classée, mais l'ancienne n'a pas pu être supprimée : ${e.message}`
          );
        }
      }
      try {
        await deleteUnsortedPhoto(current.id);
      } catch {
        // addPhoto already succeeded; the row left behind is a harmless
        // duplicate the user can clear from "À trier" manually.
      }
      showConfirmation(
        `${replaceId ? replacedVerb : 'Classée'} dans ${plant?.name ?? 'la plante'}`
      );
      removeFromQueue(current.id);
    },
    [current, plants]
  );

  const assignTo = useCallback(
    async (plantId) => {
      if (!current) return;
      const { date, error } = resolveAssignDate(current, editedDate);
      if (error) {
        setEditedDateError(error);
        showMessage('Date invalide', "Indiquez une date valide avant d'assigner cette photo.");
        return; // Never assign an unknown-date photo with a silent default.
      }
      let existing = null;
      try {
        existing = await findDuplicateOfUnsorted(current.id, plantId, date);
      } catch {
        // The check is a courtesy: on error, file the photo as usual.
      }
      if (existing) {
        setDuplicate({ plantId, date, existing });
        return;
      }
      await fileCurrent(plantId, date);
    },
    [current, editedDate, fileCurrent]
  );

  const resolveDuplicate = async (replace) => {
    if (!duplicate) return;
    const { plantId, date, existing } = duplicate;
    setDuplicate(null);
    const elsewhere = existing.plantId !== plantId;
    await fileCurrent(
      plantId,
      date,
      replace ? existing.id : null,
      elsewhere ? 'Déplacée' : 'Remplacée'
    );
  };

  // A plant created via the strip's "+" (app/plant/new.js with
  // returnTo=sort) comes back here with the new plant's id: assign the
  // photo being sorted to it right away. Only fires for a photo with a
  // known date -- an unknown one needs the date field filled first, and
  // assignTo already refuses a silent default in that case.
  useEffect(() => {
    if (selectPlantId && consumedSelectPlantId.current !== selectPlantId) {
      consumedSelectPlantId.current = selectPlantId;
      assignTo(selectPlantId);
    }
  }, [selectPlantId, assignTo]);

  const skip = () => {
    if (!photos || photos.length === 0) return;
    setPos((p) => (p + 1) % photos.length);
  };

  const removeCurrent = async () => {
    if (!current) return;
    const ok = await confirm({
      title: 'Supprimer cette photo ?',
      message: 'Elle sera définitivement supprimée sans être classée dans une plante.',
      confirmLabel: 'Supprimer',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteUnsortedPhoto(current.id);
      removeFromQueue(current.id);
    } catch (e) {
      showMessage('Erreur', `Impossible de supprimer : ${e.message}`);
    }
  };

  const addPlant = () => {
    const query = zoneId != null ? `?zoneId=${zoneId}&returnTo=sort` : '?returnTo=sort';
    router.push(`/plant/new${query}`);
  };

  const importFromLibrary = useCallback(async () => {
    if (importing) return;
    setImporting(true);
    try {
      const result = await importPhotosFromLibrary();
      if (result.permissionDenied) {
        showMessage(
          'Accès à la photothèque requis',
          "Autorisez l'accès aux photos pour importer depuis la galerie."
        );
        return;
      }
      if (result.canceled) return;
      await reload();
    } catch (e) {
      showMessage('Erreur', `Import impossible : ${e.message}`);
    } finally {
      setImporting(false);
    }
  }, [importing, reload]);

  // app/capture.js's "Galerie" button navigates here with autoImport=1
  // instead of running the picker itself: expo-image-picker's
  // launchImageLibraryAsync silently no-ops while that screen's CameraView
  // is still mounted (see its comment). Run the same import once this
  // screen (no camera) is what's actually on screen.
  const consumedAutoImport = useRef(false);
  useEffect(() => {
    if (autoImport && !consumedAutoImport.current) {
      consumedAutoImport.current = true;
      importFromLibrary();
    }
  }, [autoImport, importFromLibrary]);

  const close = () => {
    router.back();
  };

  const elsewhere = !!duplicate && duplicate.existing.plantId !== duplicate.plantId;
  const existingPlantName = duplicate
    ? (duplicate.existing.plantName ??
      plants.find((p) => p.id === duplicate.plantId)?.name ??
      'la plante')
    : '';

  const loading = photos === null;
  const empty = !loading && photos.length === 0;
  const countLabel =
    !loading && !empty ? `${photos.length} photo${photos.length > 1 ? 's' : ''}` : undefined;

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 },
      ]}>
      <ScreenHeader
        title="À trier"
        subtitle={countLabel}
        right={
          <TouchableOpacity
            onPress={importFromLibrary}
            disabled={importing}
            accessibilityRole="button"
            accessibilityLabel="Importer"
            accessibilityState={{ disabled: importing, busy: importing }}
            style={[styles.importPill, importing && styles.importPillDisabled]}>
            {importing ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <Icon name="image-outline" size={18} color={colors.text} />
                <Text style={styles.importPillText}>Importer</Text>
              </>
            )}
          </TouchableOpacity>
        }
      />

      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}

      {empty && (
        <View style={styles.centered}>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Tout est trié</Text>
            <Text style={styles.emptyBody}>Aucune photo en attente de classement.</Text>
            <PrimaryButton label="Retour" onPress={close} />
          </View>
        </View>
      )}

      {current && (
        <>
          <View style={styles.photoWrap}>
            <TouchableOpacity
              style={styles.photoTouch}
              activeOpacity={0.9}
              onPress={() => setViewerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Afficher la photo en plein écran">
              <Image
                source={{ uri: current.uri }}
                style={styles.photo}
                accessibilityLabel={`Photo ${pos + 1} sur ${photos.length}`}
              />
            </TouchableOpacity>
            <View style={styles.expandBadge} pointerEvents="none">
              <Icon name="arrow-expand" size={16} color={colors.background} />
            </View>
            <View style={styles.photoBadge}>
              <Text style={styles.photoBadgeText}>
                {pos + 1} / {photos.length}
              </Text>
            </View>
            {confirmation && (
              <View style={styles.confirmationBanner} accessibilityRole="alert">
                <Icon name="check" size={16} color={colors.accent} />
                <Text style={styles.confirmationText} numberOfLines={1}>
                  {confirmation}
                </Text>
              </View>
            )}
          </View>

          {current.dateUnknown ? (
            <View style={styles.dateRow}>
              <View style={styles.unknownTag}>
                <Icon name="alert-circle-outline" size={14} color={colors.terracotta} />
                <Text style={styles.unknownTagText}>Date inconnue</Text>
              </View>
              <View style={styles.dateFieldWrap}>
                <Field
                  value={editedDate}
                  onChangeText={(text) => {
                    setEditedDate(text);
                    setEditedDateError('');
                  }}
                  placeholder="AAAA-MM-JJ"
                  accessibilityLabel="Date de la photo"
                  error={editedDateError}
                />
              </View>
            </View>
          ) : (
            <View style={styles.dateRow}>
              <Icon name="calendar-blank-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.dateText}>{current.takenAt.slice(0, 10)}</Text>
            </View>
          )}

          <ZoneChips
            variant="light"
            zones={zones}
            zoneId={zoneId}
            onSelectZone={setZoneId}
            style={styles.zoneChips}
          />

          <PlantPickList plants={plants} onSelect={assignTo} onAddPlant={addPlant} />

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={skip}
              accessibilityRole="button"
              accessibilityLabel="Passer">
              <Text style={styles.skipBtnText}>Passer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={removeCurrent}
              accessibilityRole="button"
              accessibilityLabel="Supprimer">
              <Icon name="trash-can-outline" size={18} color={colors.danger} />
              <Text style={styles.deleteBtnText}>Supprimer</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <Modal
        visible={!!current && viewerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerOpen(false)}>
        <View style={styles.viewer}>
          {current && (
            <ZoomableImage
              uri={current.uri}
              accessibilityLabel={`Photo ${pos + 1} sur ${photos.length}, plein écran`}
            />
          )}
          <TouchableOpacity
            style={[styles.viewerBackBtn, { top: insets.top + 12 }]}
            onPress={() => setViewerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Retour">
            <Icon name="chevron-left" size={18} color="#fff" />
            <Text style={styles.viewerBackText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {current && duplicate && (
        <View style={styles.sheetOverlay}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 28 }]}>
            <View style={styles.grabber} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetIcon}>
                <Icon name="alert-outline" size={22} color={colors.terracotta} />
              </View>
              <Text style={styles.sheetTitle} accessibilityRole="header">
                {elsewhere ? 'Photo déjà classée ailleurs' : 'Photo déjà présente'}
              </Text>
            </View>
            <Text style={styles.sheetBody}>
              Cette photo est déjà dans{' '}
              <Text style={styles.sheetBodyStrong}>{existingPlantName}</Text>, datée du{' '}
              {isoDateLabel(duplicate.existing.date)}.
            </Text>
            <View style={styles.compareRow}>
              <View style={styles.compareCol}>
                <Image
                  source={{ uri: duplicate.existing.uri }}
                  style={styles.compareImage}
                  accessibilityLabel="Photo déjà classée"
                />
                <Text style={styles.compareLabel} numberOfLines={1}>
                  {elsewhere ? `Dans ${existingPlantName}` : 'Déjà classée'}
                </Text>
              </View>
              <View style={styles.compareCol}>
                <Image
                  source={{ uri: current.uri }}
                  style={[styles.compareImage, styles.compareImageNew]}
                  accessibilityLabel="Photo à classer"
                />
                <Text style={styles.compareLabel}>À classer</Text>
              </View>
            </View>
            <PrimaryButton
              label={elsewhere ? 'Garder seulement ici' : 'Remplacer l’ancienne'}
              onPress={() => resolveDuplicate(true)}
            />
            <TouchableOpacity
              style={styles.keepBothBtn}
              onPress={() => resolveDuplicate(false)}
              accessibilityRole="button"
              accessibilityLabel="Garder les deux">
              <Text style={styles.skipBtnText}>Garder les deux</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => setDuplicate(null)}
              accessibilityRole="button"
              accessibilityLabel="Annuler">
              <Text style={styles.cancelBtnText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    gap: 14,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  // A horizontal ScrollView grows along the column by default, which would
  // take the height the plant list below needs.
  zoneChips: { flexGrow: 0, flexShrink: 0, marginBottom: 0, marginRight: -20 },

  importPill: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  importPillDisabled: { opacity: 0.6 },
  importPillText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, color: colors.text },

  emptyCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: 20,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: { ...typography.displaySmall, color: colors.text },
  emptyBody: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },

  photoWrap: {
    height: 220,
    flexShrink: 0,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  photoTouch: { flex: 1 },
  photo: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoBadge: {
    position: 'absolute',
    right: 12,
    top: 12,
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.overlayDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandBadge: {
    position: 'absolute',
    left: 12,
    top: 12,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.overlayDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewer: { flex: 1, backgroundColor: colors.lightbox },
  viewerBackBtn: {
    position: 'absolute',
    left: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingRight: spacing.lg,
  },
  viewerBackText: { ...typography.body, color: '#fff' },
  photoBadgeText: {
    fontFamily: 'InstrumentSans_600SemiBold',
    fontSize: 12,
    color: colors.background,
  },

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dateText: { ...typography.bodySmall, color: colors.textSecondary },
  unknownTag: {
    height: 32,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: colors.blush,
  },
  unknownTagText: {
    fontFamily: 'InstrumentSans_600SemiBold',
    fontSize: 13,
    color: colors.terracotta,
  },
  dateFieldWrap: { flex: 1, flexBasis: 'auto', minWidth: 0 },

  confirmationBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.softGreen,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  confirmationText: {
    fontFamily: 'InstrumentSans_600SemiBold',
    fontSize: 14,
    color: colors.accent,
  },

  sheetOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.overlayDark,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 10,
    paddingHorizontal: 20,
    gap: 16,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.borderStrong,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.blush,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: { ...typography.displaySmall, color: colors.text, flex: 1 },
  sheetBody: { ...typography.body, color: colors.textSecondary },
  sheetBodyStrong: { fontFamily: 'InstrumentSans_600SemiBold', color: colors.text },
  compareRow: { flexDirection: 'row', gap: 12 },
  compareCol: { flex: 1, gap: 6 },
  compareImage: {
    width: '100%',
    height: 130,
    borderRadius: 18,
    resizeMode: 'cover',
    backgroundColor: colors.surface,
  },
  compareImageNew: { borderWidth: 2, borderColor: colors.accent },
  compareLabel: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  keepBothBtn: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: { height: 44, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 15, color: colors.text },

  actionsRow: { flexDirection: 'row', gap: 12 },
  skipBtn: {
    flex: 1,
    flexBasis: 'auto',
    minWidth: 0,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtnText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 15, color: colors.text },
  deleteBtn: {
    flex: 1,
    flexBasis: 'auto',
    minWidth: 0,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.blush,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  deleteBtnText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 15, color: colors.danger },
});
