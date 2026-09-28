// In-app camera for a garden walk (ticket 056): stays open across shots, a
// plant is picked from the current zone's strip ("?" files the shot as
// "à trier" instead — ticket 061 picks that up), each shot is saved at once
// with no form and no date modal.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Linking,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { colors, spacing, typography, radius, shadow } from '../lib/theme';
import { prepareForStorage } from '../lib/photoPipeline';
import { showMessage } from '../lib/dialogs';
import { PlantStrip, UNSORTED_ID } from '../components/PlantStrip';
import {
  getZones,
  getPlantsByZoneWithImages,
  getSetting,
  setSetting,
  addPhoto,
  addUnsortedPhoto,
  getUnsortedPhotos,
  deletePhoto,
  deleteUnsortedPhoto,
  setPhotoCaption,
  addBloomObservation,
  getBloomObservations,
} from '../lib/db';

const LAST_ZONE_SETTING_KEY = 'captureLastZoneId';
const NO_ZONE_SENTINEL = '__none__';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Full-screen modal, no interactive swipe-back gesture: react-native-screens
// keeps the previous screen mounted underneath during that gesture, which
// left a stale, unresponsive close button behind on a second open+close
// (observed on the iOS simulator -- see e2e/ios/09-capture-screen.yaml).
// Hoisted to module scope: a fresh element (and options object) on every
// render made expo-router re-apply the screen config every render too,
// which looped into "Maximum update depth exceeded".
const SCREEN_OPTIONS = <Stack.Screen options={{ gestureEnabled: false }} />;

export default function CaptureScreen() {
  const router = useRouter();
  const { selectPlantId } = useLocalSearchParams();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  const [zones, setZones] = useState([]);
  // undefined = not loaded yet, null = "Sans zone".
  const [zoneId, setZoneId] = useState(undefined);
  const [plants, setPlants] = useState([]);
  const [selectedId, setSelectedId] = useState(UNSORTED_ID);
  const [bloomedToday, setBloomedToday] = useState(false);
  const [noteVisible, setNoteVisible] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastShot, setLastShot] = useState(null); // { photoId, kind, uri, label }
  const [counts, setCounts] = useState({}); // id -> shots this session
  const [unsortedCount, setUnsortedCount] = useState(0);

  // --- "À trier" badge count (ticket 061) ---
  const reloadUnsortedCount = useCallback(async () => {
    const rows = await getUnsortedPhotos();
    setUnsortedCount(rows.length);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reloadUnsortedCount();
    }, [reloadUnsortedCount])
  );

  // --- zone: load once, restore the last one used ---
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const [zoneRows, lastZone] = await Promise.all([
          getZones(),
          getSetting(LAST_ZONE_SETTING_KEY),
        ]);
        if (cancelled) return;
        setZones(zoneRows);
        setZoneId((current) => {
          if (current !== undefined) return current;
          if (!lastZone || lastZone === NO_ZONE_SENTINEL) return null;
          return zoneRows.some((z) => z.id === lastZone) ? lastZone : null;
        });
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  // --- plants of the current zone ---
  const reloadPlants = useCallback(async () => {
    if (zoneId === undefined) return;
    const rows = await getPlantsByZoneWithImages(zoneId ?? null);
    setPlants(rows);
  }, [zoneId]);

  useEffect(() => {
    reloadPlants();
  }, [reloadPlants]);

  useFocusEffect(
    useCallback(() => {
      reloadPlants();
    }, [reloadPlants])
  );

  // A plant just created via the strip's "+" (app/plant/new.js with
  // returnTo=capture) comes back here selected.
  useEffect(() => {
    if (selectPlantId) setSelectedId(selectPlantId);
  }, [selectPlantId]);

  const selectZone = (nextZoneId) => {
    setZoneId(nextZoneId);
    setSetting(LAST_ZONE_SETTING_KEY, nextZoneId ?? NO_ZONE_SENTINEL);
  };

  // --- "En fleur" state for the selected plant, today ---
  useEffect(() => {
    let cancelled = false;
    if (selectedId === UNSORTED_ID) {
      setBloomedToday(false);
      return undefined;
    }
    (async () => {
      const observations = await getBloomObservations(selectedId);
      if (!cancelled) setBloomedToday(observations.some((o) => o.date === todayISO()));
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const toggleBloom = async () => {
    if (selectedId === UNSORTED_ID) return;
    await addBloomObservation({ plantId: selectedId, date: todayISO() });
    setBloomedToday(true);
  };

  const selectedPlant = plants.find((p) => p.id === selectedId);
  const selectedLabel = selectedId === UNSORTED_ID ? 'À trier' : (selectedPlant?.name ?? '');

  const shoot = async () => {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });
      const resizedUri = await prepareForStorage(photo.uri, photo.width, photo.height);

      let photoId;
      let kind;
      if (selectedId === UNSORTED_ID) {
        photoId = await addUnsortedPhoto({ uri: resizedUri, takenAt: new Date().toISOString() });
        kind = 'unsorted';
      } else {
        photoId = await addPhoto({ plantId: selectedId, uri: resizedUri, date: todayISO() });
        kind = 'plant';
      }

      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Haptics can be unavailable (web, some devices); the shot is saved either way.
      }

      setCounts((c) => ({ ...c, [selectedId]: (c[selectedId] ?? 0) + 1 }));
      setLastShot({ photoId, kind, uri: resizedUri, label: selectedLabel, countKey: selectedId });
      if (kind === 'plant') reloadPlants();
      if (kind === 'unsorted') reloadUnsortedCount();
    } catch (e) {
      showMessage('Erreur', `Impossible de prendre la photo : ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const undoLastShot = async () => {
    if (!lastShot) return;
    try {
      if (lastShot.kind === 'unsorted') {
        await deleteUnsortedPhoto(lastShot.photoId);
        reloadUnsortedCount();
      } else {
        await deletePhoto(lastShot.photoId);
      }
      // Decrement the plant the shot was taken for, even if the user has
      // switched plant since.
      const key = lastShot.countKey;
      setCounts((c) => ({ ...c, [key]: Math.max(0, (c[key] ?? 1) - 1) }));
      setLastShot(null);
      reloadPlants();
    } catch (e) {
      showMessage('Erreur', `Impossible d'annuler : ${e.message}`);
    }
  };

  const openNote = () => {
    if (!lastShot || lastShot.kind !== 'plant') return;
    setNoteText('');
    setNoteVisible(true);
  };

  const saveNote = () => {
    if (lastShot) setPhotoCaption(lastShot.photoId, noteText);
    setNoteVisible(false);
  };

  const addPlant = () => {
    const query = zoneId != null ? `?zoneId=${zoneId}&returnTo=capture` : '?returnTo=capture';
    router.push(`/plant/new${query}`);
  };

  // "Galerie" (ticket 061): the only always-visible way into "À trier" --
  // the badge next to it only shows once there is something to sort, so a
  // first-ever import needs its own entry point.
  //
  // Navigates to app/sort.js with autoImport=1 rather than running the
  // picker from here: launching it while this screen's CameraView is still
  // mounted never showed a picker in the iOS simulator (see
  // e2e/ios/10-sort-and-import.yaml's notes on a pre-existing defect, not
  // introduced by this ticket, where this screen doesn't navigate away
  // reliably on iOS at all -- same close() is affected). Once app/sort.js
  // has mounted (no camera), it runs the exact same lib/libraryImport.js
  // import on its own.
  const openGallery = () => {
    router.replace('/sort?autoImport=1');
  };

  // The tab bar's central button pushes this screen (see
  // app/(tabs)/_layout.js) from any tab, but a screen reached earlier via a
  // save's router.replace() can leave expo-router's back stack inconsistent
  // (documented app defect, see e2e/web-smoke.spec.js -- observed here too,
  // including a router.back() that silently does nothing rather than throw).
  // Always land on the dashboard instead, the same fallback the rest of the
  // app uses after a destructive action (e.g. app/plant/[id].js's delete).
  const close = () => {
    router.replace('/(tabs)');
  };

  const sessionCount = counts[selectedId] ?? 0;

  if (!permission) {
    return (
      <>
        {SCREEN_OPTIONS}
        <View style={styles.container} />
      </>
    );
  }

  if (!permission.granted) {
    return (
      <>
        {SCREEN_OPTIONS}
        <View style={[styles.container, styles.centered]}>
          <Text style={styles.permissionTitle}>Accès à l’appareil photo requis</Text>
          <Text style={styles.permissionBody}>
            Autorisez l’accès à l’appareil photo pour prendre des photos de vos plantes.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Autoriser</Text>
          </TouchableOpacity>
          {Platform.OS !== 'web' && (
            <TouchableOpacity
              style={[styles.permissionButton, styles.permissionButtonSecondary]}
              onPress={() => Linking.openSettings()}>
              <Text style={styles.permissionButtonText}>Ouvrir les réglages</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => close()} style={styles.closeLink}>
            <Text style={styles.closeLinkText}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <View style={styles.container}>
      {SCREEN_OPTIONS}
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => close()}
          accessibilityLabel="Fermer l’appareil photo"
          style={styles.iconButton}>
          <Text style={styles.iconButtonText}>✕</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={openGallery}
          accessibilityLabel="Importer de la galerie"
          style={styles.iconButton}>
          <Ionicons name="images-outline" size={20} color={colors.dark.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        {unsortedCount > 0 && (
          <TouchableOpacity onPress={() => router.push('/sort')} style={styles.sortBadge}>
            <Text style={styles.sortBadgeText}>À trier ({unsortedCount})</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.bottomBar}>
        <PlantStrip
          zones={zones}
          zoneId={zoneId}
          onSelectZone={selectZone}
          plants={plants}
          selectedId={selectedId}
          onSelect={setSelectedId}
          showUnsorted
          onAddPlant={addPlant}
        />

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.pill, bloomedToday && styles.pillActive]}
            disabled={selectedId === UNSORTED_ID}
            onPress={toggleBloom}>
            <Text style={styles.pillText}>🌸 En fleur{bloomedToday ? ' ✓' : ''}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.pill}
            disabled={!lastShot || lastShot.kind !== 'plant'}
            onPress={openNote}>
            <Text style={styles.pillText}>✎ Note</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.shutterRow}>
          <View style={styles.lastShotWrapper}>
            {lastShot && (
              <TouchableOpacity onPress={undoLastShot} style={styles.lastShotButton}>
                <Image source={{ uri: lastShot.uri }} style={styles.lastShotThumb} />
                <Text style={styles.undoText}>Annuler</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            accessibilityLabel="Déclencher"
            style={styles.shutter}
            disabled={busy}
            onPress={shoot}>
            <View style={styles.shutterInner} />
          </TouchableOpacity>

          <View style={styles.counterWrapper}>
            {sessionCount > 0 && (
              <Text style={styles.counterText}>
                {selectedLabel} · {sessionCount}
              </Text>
            )}
          </View>
        </View>
      </View>

      {noteVisible && (
        <View style={styles.noteOverlay}>
          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>Note pour cette photo</Text>
            <TextInput
              style={styles.noteInput}
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Ex. première fleur ouverte"
              placeholderTextColor={colors.dark.textSecondary}
              multiline
              autoFocus
            />
            <View style={styles.noteButtons}>
              <TouchableOpacity onPress={() => setNoteVisible(false)} style={styles.noteButton}>
                <Text style={styles.noteButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveNote} style={styles.noteButton}>
                <Text style={styles.noteButtonTextPrimary}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.background },
  centered: { justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  permissionTitle: { ...typography.title, color: colors.dark.text, marginBottom: spacing.sm },
  permissionBody: {
    ...typography.body,
    color: colors.dark.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  permissionButton: {
    backgroundColor: colors.dark.accent,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  permissionButtonSecondary: { backgroundColor: colors.dark.surface },
  permissionButtonText: { ...typography.label, color: colors.dark.text },
  closeLink: { marginTop: spacing.md },
  closeLinkText: { ...typography.body, color: colors.dark.textSecondary },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surfaceGlass,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconButtonText: { color: colors.dark.text, fontSize: 18 },
  sortBadge: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surfaceGlass,
  },
  sortBadgeText: { ...typography.caption, color: colors.dark.text },

  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: spacing.xl,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(28,25,23,0.55)',
  },

  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  pill: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surfaceGlass,
  },
  pillActive: { backgroundColor: colors.dark.accentSoft },
  pillText: { ...typography.label, color: colors.dark.text },

  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
  },
  lastShotWrapper: { width: 56, height: 56 },
  lastShotButton: { alignItems: 'center' },
  lastShotThumb: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  undoText: { ...typography.caption, color: colors.dark.text, fontSize: 10 },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    borderWidth: 4,
    borderColor: colors.dark.text,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadow.card,
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: radius.full,
    backgroundColor: colors.dark.text,
  },
  counterWrapper: { width: 100, alignItems: 'flex-end' },
  counterText: { ...typography.caption, color: colors.dark.text },

  noteOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  noteCard: {
    width: '100%',
    backgroundColor: colors.dark.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  noteTitle: { ...typography.title, color: colors.dark.text, marginBottom: spacing.sm },
  noteInput: {
    ...typography.body,
    color: colors.dark.text,
    backgroundColor: colors.dark.background,
    borderRadius: radius.md,
    padding: spacing.sm,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  noteButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  noteButton: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  noteButtonText: { ...typography.label, color: colors.dark.textSecondary },
  noteButtonTextPrimary: { ...typography.label, color: colors.dark.accent },
});
