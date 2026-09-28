// "À trier" (ticket 061): sorts photos filed as "?" by the in-app camera
// (056) and photos imported from the device's photo library, one at a
// time, into the garden's plants using the same strip as the camera.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { GradientHero } from '../components/GradientHero';
import { GlassCard } from '../components/GlassCard';
import { PlantStrip } from '../components/PlantStrip';
import { colors, spacing, typography, radius } from '../lib/theme';
import { importPhotosFromLibrary } from '../lib/libraryImport';
import { resolveAssignDate } from '../lib/sortAssignDate';
import { showMessage, confirm } from '../lib/dialogs';
import {
  getZones,
  getPlantsByZoneWithImages,
  getUnsortedPhotos,
  addPhoto,
  deleteUnsortedPhoto,
} from '../lib/db';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function SortScreen() {
  const router = useRouter();
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
  }, [current?.id]);

  const assignTo = useCallback(
    async (plantId) => {
      if (!current) return;
      const { date, error } = resolveAssignDate(current, editedDate);
      if (error) {
        setEditedDateError(error);
        showMessage('Date invalide', "Indiquez une date valide avant d'assigner cette photo.");
        return; // Never assign an unknown-date photo with a silent default.
      }
      const plant = plants.find((p) => p.id === plantId);
      try {
        await addPhoto({ plantId, uri: current.uri, date });
      } catch (e) {
        showMessage('Erreur', `Impossible d'assigner cette photo : ${e.message}`);
        return; // Keep the unsorted row: nothing was lost.
      }
      try {
        await deleteUnsortedPhoto(current.id);
      } catch {
        // addPhoto already succeeded; the row left behind is a harmless
        // duplicate the user can clear from "À trier" manually.
      }
      showConfirmation(`Ajoutée à ${plant?.name ?? 'la plante'} ✓`);
      removeFromQueue(current.id);
    },
    [current, plants, editedDate]
  );

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

  const loading = photos === null;
  const empty = !loading && photos.length === 0;

  return (
    <View style={styles.container}>
      <GradientHero>
        <TouchableOpacity onPress={close} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Retour</Text>
        </TouchableOpacity>
        <View style={styles.heroRow}>
          <View>
            <Text style={styles.heroTitle}>À trier</Text>
            {!loading && !empty && (
              <Text style={styles.heroSubtitle}>
                {photos.length} photo{photos.length > 1 ? 's' : ''} à trier
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={importFromLibrary}
            disabled={importing}
            style={styles.importBtn}>
            {importing ? (
              <ActivityIndicator color={colors.dark.text} />
            ) : (
              <Text style={styles.importBtnText}>Importer de la galerie</Text>
            )}
          </TouchableOpacity>
        </View>
      </GradientHero>

      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.dark.accent} />
        </View>
      )}

      {empty && (
        <View style={styles.centered}>
          <GlassCard style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Tout est trié</Text>
            <Text style={styles.emptyBody}>Aucune photo en attente de classement.</Text>
            <TouchableOpacity onPress={close} style={styles.emptyBtn}>
              <Text style={styles.emptyBtnText}>Retour</Text>
            </TouchableOpacity>
          </GlassCard>
        </View>
      )}

      {current && (
        <View style={styles.body}>
          <View style={styles.photoWrap}>
            <Image source={{ uri: current.uri }} style={styles.photo} />
          </View>
          {current.dateUnknown ? (
            <View style={styles.dateRow}>
              <Text style={styles.unknownDateTag}>Date inconnue</Text>
              <TextInput
                style={styles.dateInput}
                value={editedDate}
                onChangeText={(text) => {
                  setEditedDate(text);
                  setEditedDateError('');
                }}
                placeholder="AAAA-MM-JJ"
                placeholderTextColor={colors.dark.textSecondary}
              />
              {editedDateError ? <Text style={styles.dateError}>{editedDateError}</Text> : null}
            </View>
          ) : (
            <View style={styles.dateRow}>
              <Text style={styles.dateText}>{current.takenAt.slice(0, 10)}</Text>
            </View>
          )}

          {confirmation && (
            <View style={styles.confirmationBanner}>
              <Text style={styles.confirmationText}>{confirmation}</Text>
            </View>
          )}

          <PlantStrip
            zones={zones}
            zoneId={zoneId}
            onSelectZone={setZoneId}
            plants={plants}
            selectedId={null}
            onSelect={assignTo}
            onAddPlant={addPlant}
          />

          <View style={styles.actionsRow}>
            <TouchableOpacity onPress={skip} style={styles.actionBtn}>
              <Text style={styles.actionBtnText}>Passer</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={removeCurrent} style={styles.actionBtn}>
              <Text style={styles.deleteBtnText}>Supprimer</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  backBtn: { marginBottom: 8 },
  backBtnText: { ...typography.bodySmall, color: colors.dark.textSecondary },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroTitle: { ...typography.display, color: colors.dark.text },
  heroSubtitle: { ...typography.bodySmall, color: colors.dark.textSecondary, marginTop: 4 },
  importBtn: {
    backgroundColor: colors.dark.surfaceGlass,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
  },
  importBtnText: { ...typography.label, color: colors.dark.text },

  emptyCard: { alignItems: 'center', width: '100%' },
  emptyTitle: { ...typography.title, color: colors.dark.text, marginBottom: spacing.xs },
  emptyBody: {
    ...typography.body,
    color: colors.dark.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  emptyBtn: {
    backgroundColor: colors.dark.accent,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  emptyBtnText: { ...typography.label, color: colors.dark.text },

  body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  photoWrap: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.dark.surface,
    marginBottom: spacing.sm,
  },
  photo: { width: '100%', height: '100%', resizeMode: 'cover' },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  dateText: { ...typography.bodySmall, color: colors.dark.textSecondary },
  unknownDateTag: {
    ...typography.caption,
    color: colors.dark.text,
    backgroundColor: colors.dark.danger,
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
  },
  dateInput: {
    ...typography.bodySmall,
    color: colors.dark.text,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  dateError: { ...typography.caption, color: colors.dark.danger },
  confirmationBanner: {
    backgroundColor: colors.dark.accentSoft,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  confirmationText: { ...typography.bodySmall, color: colors.dark.text },

  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  actionBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
  },
  actionBtnText: { ...typography.label, color: colors.dark.text },
  deleteBtnText: { ...typography.label, color: colors.dark.danger },
});
