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
  AddSheet,
  ElementSheet,
  FeatureEditSheet,
  SideSheet,
  NEW_ZONE,
} from '../../components/plan/PlanSheets';
import Icon from '../../components/Icon';
import { useSync } from '../../components/SyncProvider';
import { colors } from '../../lib/theme';
import { showMessage, confirm } from '../../lib/dialogs';
import {
  getGardenPlan,
  saveGardenPlan,
  getZones,
  getPlants,
  setPlantPosition,
  setPlantPlanSize,
  setZonePolygon,
  createZone,
  getPlanFeatures,
  createPlanFeature,
  updatePlanFeature,
  deletePlanFeature,
  getSetting,
  setSetting,
} from '../../lib/db';
import { DEFAULT_ZONE_ICON } from '../../lib/enums';
import {
  parsePolygon,
  isValidPolygon,
  polygonAreaM2,
  formatArea,
  formatLength,
} from '../../lib/gardenPlan';
import {
  addCorner,
  removeLastCorner,
  traceSubtitle,
  resizeRectangle,
  zonesWithoutOutline,
  parseZoneName,
  polygonProblem,
  polygonBounds,
  resizePolygon,
  typedSide,
  sideLabel,
} from '../../lib/zoneDraw';
import { DEFAULT_SNAP_SETTINGS, parseSnapSettings, snapSummary } from '../../lib/planSnap';
import { DEFAULT_NUDGE_STEP, parseNudgeStep } from '../../lib/planNudge';
import {
  planSummary,
  moveMessage,
  checkPlanResize,
  parsePlanMetres,
  metresText,
} from '../../lib/planView';
import {
  DEFAULT_FEATURE_KIND,
  parseFeatures,
  featureLabel,
  dragFeatureShape,
  featureRefusalMessage,
} from '../../lib/planFeatures';

// The Largeur / Longueur fields of an edited shape, from its bounding box.
function dimsOf(polygon) {
  const box = polygonBounds(polygon);
  return { width: metresText(box.widthCm), length: metresText(box.lengthCm), error: null };
}

// Ticket 117: the hint under an edited zone or element.
const CORNER_HINT =
  'Glissez un coin pour le déplacer, ou un « + » au milieu d’un côté pour y ajouter un sommet. Appui long sur un coin pour le supprimer.';

// The area shown in an edit sheet: "42 m² → 49 m²" while a corner is dragged.
function areaText(draft) {
  const now = formatArea(polygonAreaM2(draft.polygon));
  return draft.dragFrom ? `${formatArea(polygonAreaM2(draft.dragFrom))} → ${now}` : now;
}

const UNDO_MS = 6000;
// The red refusal banner (ticket 110) hides by itself a little sooner.
const REFUSAL_MS = 5000;
// Device-local (ticket 109): absent means on.
const SNAP_SETTING_KEY = 'plan.snapToGrid';
// Ticket 114: what corners snap to (JSON, lib/planSnap.js).
const SNAP_SETTINGS_KEY = 'plan.snapSettings';
// Ticket 116: the edit sheets folded ('1', the default) or unfolded ('0').
const EDIT_FOLDED_KEY = 'plan.editFolded';
// Ticket 123: the arrow buttons' step in cm (1, 5 or 10).
const NUDGE_STEP_KEY = 'plan.nudgeStepCm';

/** The folded edit sheet's line: area · size · active snapping. */
function foldedSummary(draft, snapSettings, snapEnabled) {
  const size = draft.dims ? ` · ${draft.dims.width} × ${draft.dims.length} m` : '';
  return `${areaText(draft)}${size} · ${snapSummary(snapSettings, snapEnabled)}`;
}

export default function PlanScreen() {
  const router = useRouter();
  const { changeCount } = useSync();
  const [data, setData] = useState({
    loaded: false,
    plan: null,
    zones: [],
    features: [],
    plants: [],
  });
  const [editing, setEditing] = useState(false);
  const [banner, setBanner] = useState(null);
  const bannerTimer = useRef(null);
  const controller = useRef(null);
  // The outline being drawn or edited: { kind: 'trace' | 'rect' | 'edit',
  // polygon, closed, zoneId } -- or null.
  const [draft, setDraft] = useState(null);
  const [choice, setChoice] = useState({ zoneId: null, newName: '', nameError: null });
  const [rectSize, setRectSize] = useState({ width: '4', length: '1,5', tried: false });
  // Ticket 110: the "Ajouter" choice sheet, and the new element's size fields.
  const [adding, setAdding] = useState(false);
  const [elementForm, setElementForm] = useState({ width: '4', length: '2,5', tried: false });
  const [sheetH, setSheetH] = useState(0);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapSettings, setSnapSettings] = useState(DEFAULT_SNAP_SETTINGS);
  const [editFolded, setEditFolded] = useState(true);
  const [nudgeStep, setNudgeStep] = useState(DEFAULT_NUDGE_STEP);

  useEffect(() => {
    let alive = true;
    (async () => {
      const stored = await getSetting(SNAP_SETTING_KEY);
      if (alive && stored != null) setSnapEnabled(stored !== '0');
      const settings = await getSetting(SNAP_SETTINGS_KEY);
      if (alive && settings != null) setSnapSettings(parseSnapSettings(settings));
      const folded = await getSetting(EDIT_FOLDED_KEY);
      if (alive && folded != null) setEditFolded(folded !== '0');
      const step = await getSetting(NUDGE_STEP_KEY);
      if (alive && step != null) setNudgeStep(parseNudgeStep(step));
    })();
    return () => {
      alive = false;
    };
  }, []);

  const toggleSnap = useCallback(() => {
    const next = !snapEnabled;
    setSnapEnabled(next);
    try {
      setSetting(SNAP_SETTING_KEY, next ? '1' : '0');
    } catch (error) {
      showMessage('Erreur', error?.message || 'Impossible de mémoriser ce réglage.');
    }
  }, [snapEnabled]);

  const changeNudgeStep = useCallback((next) => {
    setNudgeStep(next);
    try {
      setSetting(NUDGE_STEP_KEY, String(next));
    } catch (error) {
      showMessage('Erreur', error?.message || 'Impossible de mémoriser ce réglage.');
    }
  }, []);

  const setFolded = useCallback((next) => {
    setEditFolded(next);
    try {
      setSetting(EDIT_FOLDED_KEY, next ? '1' : '0');
    } catch (error) {
      showMessage('Erreur', error?.message || 'Impossible de mémoriser ce réglage.');
    }
  }, []);

  const changeSnapSettings = useCallback(
    (patch) => {
      const next = { ...snapSettings, ...patch };
      setSnapSettings(next);
      try {
        setSetting(SNAP_SETTINGS_KEY, JSON.stringify(next));
      } catch (error) {
        showMessage('Erreur', error?.message || 'Impossible de mémoriser ce réglage.');
      }
    },
    [snapSettings]
  );

  const load = useCallback(async () => {
    const [plan, zones, plants, featureRows] = await Promise.all([
      getGardenPlan(),
      getZones(),
      getPlants(),
      getPlanFeatures(),
    ]);
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
      features: parseFeatures(featureRows),
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

  const showBanner = useCallback((next, ms = UNDO_MS) => {
    clearTimeout(bannerTimer.current);
    setBanner(next);
    if (next) bannerTimer.current = setTimeout(() => setBanner(null), ms);
  }, []);

  // A plant dropped on a garden element is not saved: it keeps its place.
  const onRefuse = useCallback(
    ({ feature }) => {
      showBanner({ tone: 'danger', message: featureRefusalMessage(feature) }, REFUSAL_MS);
    },
    [showBanner]
  );

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

  const changePlanSize = useCallback(
    async (plantId, cm) => {
      try {
        setPlantPlanSize(plantId, cm);
      } catch (error) {
        showMessage('Erreur', error?.message || "Impossible d'enregistrer la taille.");
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

  // Ticket 123: an arrow press. The plant moves at once on screen (so a quick
  // second press starts from the new place); no zoneId key, so the zone is
  // left as it is, and no undo banner for a few centimetres.
  const onNudge = useCallback(
    async ({ plant, x, y }) => {
      setData((prev) => ({
        ...prev,
        plants: prev.plants.map((p) => (p.id === plant.id ? { ...p, planX: x, planY: y } : p)),
      }));
      // A failed write has shown its error: put the plant back where it is saved.
      if (!(await write(plant.id, { x, y }))) await load();
    },
    [write, load]
  );

  const onSubmitSize = useCallback(
    async (size) => {
      if (data.plan) {
        const check = checkPlanResize(size, data.zones, data.plants, data.features);
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
    [data.plan, data.zones, data.plants, data.features, load]
  );

  const startTrace = useCallback(() => {
    setAdding(false);
    showBanner(null);
    setChoice({ zoneId: null, newName: '', nameError: null });
    setDraft({ kind: 'trace', polygon: [], closed: false });
  }, [showBanner]);
  const cancelDraft = useCallback(() => setDraft(null), []);
  // `magnet`: true (50 cm grid) or the canvas's snapper function (ticket 114).
  const addDraftCorner = useCallback((point, plan, magnet) => {
    setDraft((d) =>
      d && d.kind === 'trace' && !d.closed
        ? { ...d, polygon: addCorner(d.polygon, point, plan, { magnet }) }
        : d
    );
  }, []);
  const changeDraft = useCallback(
    // A drag of an edited shape also refreshes its Dimensions fields and the
    // shape typed sizes are scaled from.
    (polygon, dragFrom = null) =>
      setDraft((d) =>
        d
          ? {
              ...d,
              polygon,
              // Ticket 117: while a corner is dragged, the outline it started from.
              dragFrom,
              moved: true,
              side: null,
              ...(d.dims ? { base: polygon, dims: dimsOf(polygon) } : {}),
            }
          : d
      ),
    []
  );
  // Ticket 113: tapping a side's pill opens its length for typing; Valider
  // applies it (the shape then waits for the mode's own save, like a dragged
  // corner or typed dimensions), Annuler keeps the shape as it was.
  const pressSide = useCallback((index) => {
    setDraft((d) => {
      if (!d || d.kind === 'rect' || d.kind === 'element') return d;
      const open = d.kind === 'trace';
      if (open && (d.closed || index !== d.polygon.length - 2)) return d;
      const [from, to] = [d.polygon[index], d.polygon[(index + 1) % d.polygon.length]];
      if (!from || !to) return d;
      const cm = Math.hypot(to[0] - from[0], to[1] - from[1]);
      return {
        ...d,
        side: {
          index,
          open,
          text: metresText(cm),
          lengthCm: cm,
          name: open ? 'tracé' : sideLabel(d.polygon, index),
        },
      };
    });
  }, []);
  const changeSideText = useCallback(
    (text) => setDraft((d) => (d?.side ? { ...d, side: { ...d.side, text } } : d)),
    []
  );
  const cancelSide = useCallback(() => setDraft((d) => (d ? { ...d, side: null } : d)), []);
  const patchDraft = useCallback((patch) => setDraft((d) => (d ? { ...d, ...patch } : d)), []);
  const startElement = useCallback(() => {
    setAdding(false);
    showBanner(null);
    setElementForm({ width: '4', length: '2,5', tried: false });
    setDraft({
      kind: 'element',
      polygon: [],
      closed: false,
      featureKind: DEFAULT_FEATURE_KIND,
      label: '',
      moved: false,
    });
  }, [showBanner]);
  const editFeature = useCallback(
    (featureId) => {
      const feature = data.features.find((f) => f.id === featureId);
      if (!feature) return;
      showBanner(null);
      setDraft({
        kind: 'feature',
        polygon: feature.polygon,
        closed: true,
        featureId,
        featureKind: feature.kind,
        label: feature.label ?? '',
        detailsOpen: false,
        base: feature.polygon,
        dims: dimsOf(feature.polygon),
      });
    },
    [data.features, showBanner]
  );
  const editZone = useCallback(
    (zoneId) => {
      const polygon = parsePolygon(data.zones.find((z) => z.id === zoneId)?.polygon);
      if (!polygon) return;
      showBanner(null);
      setDraft({
        kind: 'edit',
        polygon,
        closed: true,
        zoneId,
        base: polygon,
        dims: dimsOf(polygon),
      });
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

  // A new element is put on the plan as soon as its sheet is measured, in the
  // visible area, until the finger moves it (the sheet's height may still
  // change while it settles, so it is placed again until then).
  const unplacedElement = draft?.kind === 'element' && !draft.moved;
  const plan = data.plan;
  useEffect(() => {
    if (!unplacedElement || !sheetH || !plan) return;
    const w = parsePlanMetres(elementForm.width);
    const l = parsePlanMetres(elementForm.length);
    if (w.cm == null || l.cm == null) return;
    const polygon = controller.current?.placeRectangle({ widthCm: w.cm, lengthCm: l.cm });
    if (!polygon) return;
    const magnet = controller.current?.snapper() ?? snapEnabled;
    const placed = magnet ? dragFeatureShape(polygon, { dx: 0, dy: 0 }, plan, magnet) : polygon;
    setDraft((d) => (d?.kind === 'element' && !d.moved ? { ...d, polygon: placed } : d));
  }, [unplacedElement, sheetH, plan, elementForm.width, elementForm.length, snapEnabled]);

  // Writes the new element, then leaves the mode.
  const finishElement = useCallback(async () => {
    const problem = polygonProblem(draft.polygon);
    if (problem) {
      showMessage('Tracé invalide', problem);
      return;
    }
    setSaving(true);
    try {
      createPlanFeature({ kind: draft.featureKind, label: draft.label, polygon: draft.polygon });
    } catch (error) {
      showMessage('Erreur', error?.message || "Impossible d'enregistrer l'élément.");
      setSaving(false);
      return;
    }
    setSaving(false);
    setDraft(null);
    await load();
  }, [draft, load]);

  const finishFeatureEdit = useCallback(async () => {
    const problem = polygonProblem(draft.polygon);
    if (problem) {
      showMessage('Tracé invalide', problem);
      return;
    }
    setSaving(true);
    try {
      updatePlanFeature(draft.featureId, {
        kind: draft.featureKind,
        label: draft.label,
        polygon: draft.polygon,
      });
    } catch (error) {
      showMessage('Erreur', error?.message || "Impossible d'enregistrer l'élément.");
      setSaving(false);
      return;
    }
    setSaving(false);
    setDraft(null);
    await load();
  }, [draft, load]);

  const deleteFeature = useCallback(async () => {
    const name = featureLabel({ kind: draft.featureKind, label: draft.label });
    const ok = await confirm({
      title: 'Supprimer cet élément ?',
      message: `« ${name} » disparaît du plan. Les plantes et les zones ne changent pas.`,
      confirmLabel: 'Supprimer',
      destructive: true,
    });
    if (!ok) return;
    try {
      deletePlanFeature(draft.featureId);
    } catch (error) {
      showMessage('Erreur', error?.message || "Impossible de supprimer l'élément.");
      return;
    }
    setDraft(null);
    await load();
  }, [draft, load]);

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
    nameRef,
  };

  const elementDraft = draft?.kind === 'element';
  const form = elementDraft ? elementForm : rectSize;
  const setForm = elementDraft ? setElementForm : setRectSize;
  const width = parsePlanMetres(form.width);
  const length = parsePlanMetres(form.length);
  const fits =
    width.cm != null &&
    length.cm != null &&
    width.cm <= data.plan.widthCm &&
    length.cm <= data.plan.lengthCm;
  const sizeError = (parsed, max, text) => {
    if (parsed.error) return form.tried || text !== '' ? parsed.error : null;
    return parsed.cm > max ? 'Plus grand que le plan.' : null;
  };
  // Typing new sides after the rectangle is on the plan resizes it in place.
  const setSide = (key, text) => {
    const next = { ...form, [key]: text };
    setForm(next);
    const w = parsePlanMetres(next.width);
    const l = parsePlanMetres(next.length);
    // A new element nobody dragged yet is simply placed again by the effect above.
    if (
      (draft?.kind === 'rect' || (elementDraft && draft.moved)) &&
      draft.polygon.length &&
      w.cm != null &&
      l.cm != null
    ) {
      const resized = resizeRectangle(draft.polygon, { widthCm: w.cm, lengthCm: l.cm }, data.plan);
      if (resized) changeDraft(resized);
    }
  };
  // Typing the Largeur / Longueur of an edited shape resizes it live from its
  // top-left corner; an invalid value shows an error and keeps the last good shape.
  const setDimension = (key, text) => {
    setDraft((d) => {
      if (!d?.dims) return d;
      const dims = { ...d.dims, [key]: text };
      const w = parsePlanMetres(dims.width);
      const l = parsePlanMetres(dims.length);
      if (w.error || l.error) return { ...d, dims: { ...dims, error: w.error || l.error } };
      const result = resizePolygon(d.base, { widthCm: w.cm, lengthCm: l.cm }, data.plan, {
        magnet: controller.current?.snapper() ?? snapEnabled,
      });
      if (result.error) return { ...d, dims: { ...dims, error: result.error } };
      return { ...d, polygon: result.polygon, moved: true, dims: { ...dims, error: null } };
    });
  };
  const placeRectangle = () => {
    setRectSize((r) => ({ ...r, tried: true }));
    if (!fits) return;
    const polygon = controller.current?.placeRectangle({ widthCm: width.cm, lengthCm: length.cm });
    const magnet = controller.current?.snapper() ?? snapEnabled;
    if (polygon) {
      changeDraft(
        magnet ? dragFeatureShape(polygon, { dx: 0, dy: 0 }, data.plan, magnet) : polygon
      );
    }
  };

  // Ticket 113: the stretched shape for the length typed in a pill, if any.
  const sideResult = draft?.side
    ? typedSide(draft.polygon, draft.side.index, draft.side.text, data.plan, {
        open: draft.side.open,
      })
    : null;
  const submitSide = () => {
    if (sideResult?.polygon) changeDraft(sideResult.polygon);
  };
  const canvasDraft = draft?.side ? { ...draft, sidePreview: sideResult?.polygon ?? null } : draft;

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
  } else if (elementDraft) {
    subtitle = 'Nouvel élément';
    const area = fits ? formatArea((width.cm * length.cm) / 10000) : '—';
    sheet = (
      <ElementSheet
        kind={draft.featureKind}
        onKind={(featureKind) => patchDraft({ featureKind })}
        label={draft.label}
        onLabel={(label) => patchDraft({ label })}
        width={elementForm.width}
        length={elementForm.length}
        onWidth={(text) => setSide('width', text)}
        onLength={(text) => setSide('length', text)}
        widthError={sizeError(width, data.plan.widthCm, elementForm.width)}
        lengthError={sizeError(length, data.plan.lengthCm, elementForm.length)}
        note={`${area} · glissez-le à sa place, puis ajustez ses coins.`}
        saving={saving || draft.polygon.length === 0}
        onFinish={finishElement}
      />
    );
  } else if (draft?.kind === 'feature') {
    subtitle = 'Modifier l’élément · touchez une longueur pour la saisir';
    sheet = (
      <FeatureEditSheet
        title={featureLabel({ kind: draft.featureKind, label: draft.label })}
        areaText={areaText(draft)}
        dims={draft.dims}
        onDims={setDimension}
        hint={`${CORNER_HINT}${
          snapEnabled ? ' Aimant actif : les coins se calent (voir Aimantation).' : ''
        }`}
        kind={draft.featureKind}
        onKind={(featureKind) => patchDraft({ featureKind })}
        label={draft.label}
        onLabel={(label) => patchDraft({ label })}
        detailsOpen={!!draft.detailsOpen}
        onToggleDetails={() => {
          // Folded, "Type et nom" unfolds the sheet with the details open.
          if (editFolded) {
            setFolded(false);
            patchDraft({ detailsOpen: true });
          } else patchDraft({ detailsOpen: !draft.detailsOpen });
        }}
        snap={snapSettings}
        onSnap={changeSnapSettings}
        summary={foldedSummary(draft, snapSettings, snapEnabled)}
        folded={editFolded}
        onToggleFold={() => setFolded(!editFolded)}
        onDelete={deleteFeature}
        onFinish={finishFeatureEdit}
        saving={saving}
      />
    );
  } else if (draft?.kind === 'edit') {
    subtitle = 'Modifier la zone · touchez une longueur pour la saisir';
    sheet = (
      <EditSheet
        name={data.zones.find((z) => z.id === draft.zoneId)?.name ?? ''}
        areaText={areaText(draft)}
        dims={draft.dims}
        onDims={setDimension}
        hint={`${CORNER_HINT}${
          snapEnabled ? ' Aimant actif : les coins se calent (voir Aimantation).' : ''
        }`}
        snap={snapSettings}
        onSnap={changeSnapSettings}
        summary={foldedSummary(draft, snapSettings, snapEnabled)}
        folded={editFolded}
        onToggleFold={() => setFolded(!editFolded)}
        saving={saving}
        onErase={eraseOutline}
        onFinish={() => finish(draft.zoneId, '')}
      />
    );
  }

  if (draft?.side) {
    const { side } = draft;
    const edited =
      draft.kind === 'feature'
        ? featureLabel({ kind: draft.featureKind, label: draft.label })
        : null;
    const name =
      draft.kind === 'trace'
        ? 'Nouvelle zone'
        : (edited ?? data.zones.find((z) => z.id === draft.zoneId)?.name ?? '');
    const after = sideResult?.polygon;
    const changeText = side.open
      ? `${formatLength(side.lengthCm)} → ${
          after
            ? formatLength(
                Math.hypot(...after[side.index + 1].map((v, i) => v - after[side.index][i]))
              )
            : '—'
        }`
      : `${formatArea(polygonAreaM2(draft.polygon))} → ${after ? formatArea(polygonAreaM2(after)) : '—'}`;
    sheet = (
      <SideSheet
        name={name}
        changeText={changeText}
        explanation={
          side.open
            ? 'Longueur du dernier côté : le dernier coin se déplace le long de ce côté.'
            : `Longueur du côté ${side.name} : la forme s’étire de ce côté, les côtés parallèles le restent.`
        }
        error={sideResult?.error ?? null}
        canSubmit={!!after}
        onCancel={cancelSide}
        onSubmit={submitSide}
      />
    );
  }

  if (adding && !draft) {
    subtitle = planSummary(data.plan, data.zones.length, placed);
    sheet = <AddSheet onZone={startTrace} onElement={startElement} />;
  }

  return (
    <View style={styles.container}>
      <PlanCanvas
        plan={data.plan}
        zones={data.zones}
        features={data.features}
        plants={data.plants}
        summary={subtitle}
        draft={canvasDraft}
        sheet={sheet}
        onSidePress={pressSide}
        sideEdit={{ onChange: changeSideText, onSubmit: submitSide }}
        controller={controller}
        onAdd={() => setAdding(true)}
        scrim={adding && !draft}
        onScrimPress={() => setAdding(false)}
        onSheetHeight={setSheetH}
        onEditFeature={editFeature}
        onRefuse={onRefuse}
        nudgeStep={nudgeStep}
        onChangeNudgeStep={changeNudgeStep}
        onNudge={onNudge}
        onAddCorner={addDraftCorner}
        onDraftChange={changeDraft}
        onDraftPatch={patchDraft}
        onEditZone={editZone}
        onBack={cancelDraft}
        onDrop={onDrop}
        snapEnabled={snapEnabled}
        onToggleSnap={toggleSnap}
        snapSettings={snapSettings}
        onChangePlanSize={changePlanSize}
        onOpenPlant={(id) => router.push(`/plant/${id}`)}
        onEditSize={() => setEditing(true)}
        banner={
          banner ? (
            <View
              style={[styles.banner, banner.tone === 'danger' && styles.bannerDanger]}
              accessibilityRole="alert">
              {banner.tone === 'danger' ? (
                <Icon name="alert-circle-outline" size={20} color="#fff" />
              ) : null}
              <Text
                style={[styles.bannerText, banner.tone === 'danger' && styles.bannerTextDanger]}>
                {banner.message.text}
                {banner.message.strong ? (
                  <Text style={styles.bannerStrong}>{banner.message.strong}</Text>
                ) : null}
                {banner.message.after ?? ''}
              </Text>
              {banner.undo ? (
                <TouchableOpacity
                  onPress={banner.undo}
                  style={styles.undo}
                  accessibilityRole="button"
                  accessibilityLabel="Annuler le déplacement">
                  <Text style={styles.undoText}>Annuler</Text>
                </TouchableOpacity>
              ) : null}
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
  bannerDanger: { backgroundColor: colors.danger, paddingRight: 16 },
  bannerTextDanger: { color: '#fff' },
  bannerStrong: { fontFamily: 'InstrumentSans_600SemiBold' },
  undo: { height: 40, paddingHorizontal: 14, justifyContent: 'center' },
  undoText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, color: colors.highlight },
});
