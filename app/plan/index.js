// The garden plan (ticket 106): create it on the first visit, then see the
// zones and plants on it, place the ones still in the drawer and move the
// others. A drop is saved at once and a banner offers to undo it for a few
// seconds. See components/plan/PlanCanvas.js for the canvas and its gestures.
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { PlanCanvas } from '../../components/plan/PlanCanvas';
import { PlanSizeForm } from '../../components/PlanSizeForm';
import { useSync } from '../../components/SyncProvider';
import { colors } from '../../lib/theme';
import { showMessage } from '../../lib/dialogs';
import { getGardenPlan, saveGardenPlan, getZones, getPlants, setPlantPosition } from '../../lib/db';
import { planSummary, moveMessage, checkPlanResize } from '../../lib/planView';

const UNDO_MS = 6000;

export default function PlanScreen() {
  const router = useRouter();
  const { changeCount } = useSync();
  const [data, setData] = useState({ loaded: false, plan: null, zones: [], plants: [] });
  const [editing, setEditing] = useState(false);
  const [banner, setBanner] = useState(null);
  const bannerTimer = useRef(null);

  const load = useCallback(async () => {
    const [plan, zones, plants] = await Promise.all([getGardenPlan(), getZones(), getPlants()]);
    setData((prev) => ({
      loaded: true,
      // Same object while the size is unchanged: the canvas only re-fits when
      // the garden is resized, not on every reload.
      plan:
        prev.plan &&
        plan &&
        prev.plan.widthCm === plan.widthCm &&
        prev.plan.lengthCm === plan.lengthCm
          ? prev.plan
          : plan,
      zones,
      plants,
    }));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // A sync brought rows in: positions may have changed.
  useEffect(() => {
    load();
  }, [changeCount, load]);

  useEffect(() => () => clearTimeout(bannerTimer.current), []);

  const showBanner = useCallback((next) => {
    clearTimeout(bannerTimer.current);
    setBanner(next);
    if (next) bannerTimer.current = setTimeout(() => setBanner(null), UNDO_MS);
  }, []);

  const write = useCallback(
    async (plantId, position) => {
      try {
        setPlantPosition(plantId, position);
      } catch (error) {
        showMessage('Erreur', error?.message || "Impossible d'enregistrer la position.");
        return false;
      }
      await load();
      return true;
    },
    [load]
  );

  const onDrop = useCallback(
    async ({ plant, x, y, zoneId }) => {
      const previous = {
        x: plant.planX ?? null,
        y: plant.planY ?? null,
        zoneId: plant.zoneId ?? null,
      };
      if (!(await write(plant.id, { x, y, zoneId }))) return;
      const zone = data.zones.find((z) => z.id === zoneId);
      showBanner({
        message: moveMessage({
          plantName: plant.name,
          zoneName: zone?.name ?? null,
          previousZoneId: previous.zoneId,
        }),
        undo: async () => {
          showBanner(null);
          await write(plant.id, previous);
        },
      });
    },
    [data.zones, write, showBanner]
  );

  const onSubmitSize = useCallback(
    async (size) => {
      if (data.plan) {
        const check = checkPlanResize(size, data.zones, data.plants);
        if (!check.ok) return check.message;
      }
      try {
        saveGardenPlan(size);
      } catch (error) {
        showMessage('Erreur', error?.message || "Impossible d'enregistrer le plan.");
        return null;
      }
      await load();
      setEditing(false);
      return null;
    },
    [data.plan, data.zones, data.plants, load]
  );

  if (!data.loaded) return <View style={styles.container} />;

  if (!data.plan || editing) {
    return (
      <PlanSizeForm
        initial={data.plan}
        submitLabel={data.plan ? 'Enregistrer' : 'Créer le plan'}
        onSubmit={onSubmitSize}
        onBack={data.plan ? () => setEditing(false) : undefined}
      />
    );
  }

  const placed = data.plants.filter((p) => p.planX != null && p.planY != null).length;

  return (
    <View style={styles.container}>
      <PlanCanvas
        plan={data.plan}
        zones={data.zones}
        plants={data.plants}
        summary={planSummary(data.plan, data.zones.length, placed)}
        onDrop={onDrop}
        onOpenPlant={(id) => router.push(`/plant/${id}`)}
        onEditSize={() => setEditing(true)}
        banner={
          banner ? (
            <View style={styles.banner} accessibilityRole="alert">
              <Text style={styles.bannerText}>
                {banner.message.text}
                {banner.message.strong ? (
                  <Text style={styles.bannerStrong}>{banner.message.strong}</Text>
                ) : null}
              </Text>
              <TouchableOpacity
                onPress={banner.undo}
                style={styles.undo}
                accessibilityRole="button"
                accessibilityLabel="Annuler le déplacement">
                <Text style={styles.undoText}>Annuler</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  banner: {
    backgroundColor: colors.text,
    borderRadius: 16,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bannerText: {
    flex: 1,
    fontFamily: 'InstrumentSans_400Regular',
    fontSize: 14,
    lineHeight: 19,
    color: colors.background,
  },
  bannerStrong: { fontFamily: 'InstrumentSans_600SemiBold' },
  undo: { height: 40, paddingHorizontal: 14, justifyContent: 'center' },
  undoText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, color: colors.highlight },
});
