// The garden plan (ticket 106): create it on the first visit, then see the
// zones and plants on it, place the ones still in the drawer and move the
// others. A drop is saved at once and a banner offers to undo it for a few
// seconds. See components/plan/PlanCanvas.js for the canvas and its gestures.
//
// Ticket 107: drawing a zone (corner by corner, or a rectangle by its sides)
// and editing or erasing the outline of one. `draft` is the outline being
// worked on; nothing is written until "Terminer". Plants are never touched
// here: a new or changed outline does not move them nor change their zone.
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { PlanCanvas } from '../../components/plan/PlanCanvas';
import { PlanSizeForm } from '../../components/PlanSizeForm';
import {
  TraceBar,
  FinishSheet,
  RectangleSheet,
  EditSheet,
  NEW_ZONE,
} from '../../components/plan/PlanSheets';
import { useSync } from '../../components/SyncProvider';
import { colors } from '../../lib/theme';
import { showMessage, confirm } from '../../lib/dialogs';
import {
  getGardenPlan,
  saveGardenPlan,
  getZones,
  getPlants,
  setPlantPosition,
  setZonePolygon,
  createZone,
} from '../../lib/db';
import { DEFAULT_ZONE_ICON } from '../../lib/enums';
import { parsePolygon, isValidPolygon, polygonAreaM2, formatArea } from '../../lib/gardenPlan';
import {
  addCorner,
  removeLastCorner,
  traceSubtitle,
  resizeRectangle,
  zonesWithoutOutline,
  parseZoneName,
  polygonProblem,
} from '../../lib/zoneDraw';
import { planSummary, moveMessage, checkPlanResize, parsePlanMetres } from '../../lib/planView';

const UNDO_MS = 6000;

export default function PlanScreen() {
  const router = useRouter();
  const { changeCount } = useSync();
  const [data, setData] = useState({ loaded: false, plan: null, zones: [], plants: [] });
  const [editing, setEditing] = useState(false);
  const [banner, setBanner] = useState(null);
  const bannerTimer = useRef(null);
  const controller = useRef(null);
  // The outline being drawn or edited: { kind: 'trace' | 'rect' | 'edit',
  // polygon, closed, zoneId } -- or null.
  const [draft, setDraft] = useState(null);
  const [choice, setChoice] = useState({ zoneId: null, newName: '', nameError: null });
  const [rectSize, setRectSize] = useState({ width: '4', length: '1,5', tried: false });
  const [saving, setSaving] = useState(false);

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

  const startTrace = useCallback(() => {
    showBanner(null);
    setChoice({ zoneId: null, newName: '', nameError: null });
    setDraft({ kind: 'trace', polygon: [], closed: false });
  }, [showBanner]);
  const cancelDraft = useCallback(() => setDraft(null), []);
  const addDraftCorner = useCallback((point, plan) => {
    setDraft((d) =>
      d && d.kind === 'trace' && !d.closed
        ? { ...d, polygon: addCorner(d.polygon, point, plan) }
        : d
    );
  }, []);
  const changeDraft = useCallback((polygon) => setDraft((d) => (d ? { ...d, polygon } : d)), []);
  const editZone = useCallback(
    (zoneId) => {
      const polygon = parsePolygon(data.zones.find((z) => z.id === zoneId)?.polygon);
      if (!polygon) return;
      showBanner(null);
      setDraft({ kind: 'edit', polygon, closed: true, zoneId });
    },
    [data.zones, showBanner]
  );

  // Writes the outline (to the chosen zone, or to a new one), then leaves the mode.
  const finish = useCallback(
    async (target, newName) => {
      const problem = polygonProblem(draft.polygon);
      if (problem) {
        showMessage('Tracé invalide', problem);
        return;
      }
      let name = null;
      if (target === NEW_ZONE) {
        const parsed = parseZoneName(newName);
        if (parsed.error) {
          setChoice((c) => ({ ...c, nameError: parsed.error }));
          return;
        }
        name = parsed.name;
      }
      setSaving(true);
      try {
        if (name) createZone({ name, icon: DEFAULT_ZONE_ICON, polygon: draft.polygon });
        else setZonePolygon(target, draft.polygon);
      } catch (error) {
        showMessage('Erreur', error?.message || "Impossible d'enregistrer la zone.");
        setSaving(false);
        return;
      }
      setSaving(false);
      setDraft(null);
      await load();
    },
    [draft, load]
  );

  const eraseOutline = useCallback(async () => {
    const zone = data.zones.find((z) => z.id === draft.zoneId);
    const ok = await confirm({
      title: 'Effacer le tracé ?',
      message: `La zone « ${zone?.name ?? ''} » reste dans la liste mais n’a plus de forme sur le plan. Les plantes gardent leur zone.`,
      confirmLabel: 'Effacer',
      destructive: true,
    });
    if (!ok) return;
    try {
      setZonePolygon(draft.zoneId, null);
    } catch (error) {
      showMessage('Erreur', error?.message || "Impossible d'effacer le tracé.");
      return;
    }
    setDraft(null);
    await load();
  }, [data.zones, draft, load]);

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

  // "Pour quelle zone ?": the zones with no outline, the first one by default.
  const available = zonesWithoutOutline(data.zones);
  const target =
    choice.zoneId === NEW_ZONE || available.some((z) => z.id === choice.zoneId)
      ? choice.zoneId
      : (available[0]?.id ?? NEW_ZONE);
  const chooser = {
    zones: available,
    value: target,
    onChange: (zoneId) => setChoice((c) => ({ ...c, zoneId, nameError: null })),
    newName: choice.newName,
    onNewName: (newName) => setChoice((c) => ({ ...c, newName, nameError: null })),
    nameError: choice.nameError,
  };

  const width = parsePlanMetres(rectSize.width);
  const length = parsePlanMetres(rectSize.length);
  const fits =
    width.cm != null &&
    length.cm != null &&
    width.cm <= data.plan.widthCm &&
    length.cm <= data.plan.lengthCm;
  const sizeError = (parsed, max, text) => {
    if (parsed.error) return rectSize.tried || text !== '' ? parsed.error : null;
    return parsed.cm > max ? 'Plus grand que le plan.' : null;
  };
  // Typing new sides after the rectangle is on the plan resizes it in place.
  const setSide = (key, text) => {
    const next = { ...rectSize, [key]: text };
    setRectSize(next);
    const w = parsePlanMetres(next.width);
    const l = parsePlanMetres(next.length);
    if (draft?.kind === 'rect' && draft.polygon.length && w.cm != null && l.cm != null) {
      const resized = resizeRectangle(draft.polygon, { widthCm: w.cm, lengthCm: l.cm }, data.plan);
      if (resized) changeDraft(resized);
    }
  };
  const placeRectangle = () => {
    setRectSize((r) => ({ ...r, tried: true }));
    if (!fits) return;
    const polygon = controller.current?.placeRectangle({ widthCm: width.cm, lengthCm: length.cm });
    if (polygon) changeDraft(polygon);
  };

  let sheet = null;
  let subtitle = planSummary(data.plan, data.zones.length, placed);
  if (draft?.kind === 'trace') {
    subtitle = traceSubtitle(draft.polygon.length);
    sheet = draft.closed ? (
      <FinishSheet
        areaText={`Surface : ${formatArea(polygonAreaM2(draft.polygon))}`}
        chooser={chooser}
        saving={saving}
        onSave={() => finish(target, choice.newName)}
        onBack={() => setDraft((d) => ({ ...d, closed: false }))}
      />
    ) : (
      <TraceBar
        canUndo={draft.polygon.length > 0}
        canFinish={isValidPolygon(draft.polygon)}
        onRectangle={() => setDraft({ kind: 'rect', polygon: [], closed: false })}
        onUndo={() => changeDraft(removeLastCorner(draft.polygon))}
        onFinish={() => setDraft((d) => ({ ...d, closed: true }))}
      />
    );
  } else if (draft?.kind === 'rect') {
    subtitle = 'Nouvelle zone';
    const area = fits ? formatArea((width.cm * length.cm) / 10000) : '—';
    sheet = (
      <RectangleSheet
        width={rectSize.width}
        length={rectSize.length}
        onWidth={(text) => setSide('width', text)}
        onLength={(text) => setSide('length', text)}
        widthError={sizeError(width, data.plan.widthCm, rectSize.width)}
        lengthError={sizeError(length, data.plan.lengthCm, rectSize.length)}
        chooser={chooser}
        note={`${area} · posé en bas du plan, glissez-le à sa place.`}
        placed={draft.polygon.length > 0}
        saving={saving}
        onPlace={placeRectangle}
        onFinish={() => finish(target, choice.newName)}
      />
    );
  } else if (draft?.kind === 'edit') {
    subtitle = 'Modifier la zone';
    sheet = (
      <EditSheet
        name={data.zones.find((z) => z.id === draft.zoneId)?.name ?? ''}
        areaText={formatArea(polygonAreaM2(draft.polygon))}
        saving={saving}
        onErase={eraseOutline}
        onFinish={() => finish(draft.zoneId, '')}
      />
    );
  }

  return (
    <View style={styles.container}>
      <PlanCanvas
        plan={data.plan}
        zones={data.zones}
        plants={data.plants}
        summary={subtitle}
        draft={draft}
        sheet={sheet}
        controller={controller}
        onStartTrace={startTrace}
        onAddCorner={addDraftCorner}
        onDraftChange={changeDraft}
        onEditZone={editZone}
        onBack={cancelDraft}
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
