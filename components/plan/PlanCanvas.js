// The garden plan screen's body (ticket 106; Plan, PlanBulle and PlanDeplacer
// artboards): the zoomable canvas, the plants on it, the "À placer" drawer, the
// bubble and the banner. The screen (app/plan/index.js) owns the data and the
// writes; this reports a drop through `onDrop`.
//
// One transform (translate + scale, reanimated) moves the whole canvas. The
// grid and zones are react-native-svg; each plant is a View so it can carry its
// own gestures. Everything is drawn at BASE px per cm (the fit-to-screen scale)
// and the transform scales it, so a dot's size is recomputed from the committed
// zoom (`view`) when a gesture ends: it keeps its real size relative to the
// plan, with a touchable minimum, and the hit area is at least HIT_PX on screen.
//
// Gestures: pinch (around the fingers) and one-finger pan work together on the
// canvas; a plant, or a drawer item, has its own pan that only starts after a
// long press (so a quick drag still pans the canvas) and then drags a "ghost"
// dot at the finger. The drop is resolved in JS (toPlan, zoneAt).
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Keyboard,
  Platform,
  StyleSheet,
} from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useKeyboardHeight } from './useKeyboardHeight';
import Svg, { G, Polygon, Line, Defs, ClipPath, Text as SvgText } from 'react-native-svg';
import { PlanGrid } from './PlanGrid';
import { DraftLayer } from './DraftLayer';
import { ScreenHeader } from '../ScreenHeader';
import Icon from '../Icon';
import { colors, spacing, radius, shadow, colorHex } from '../../lib/theme';
import {
  parsePolygon,
  toScreen,
  toPlan,
  zoneAt,
  edgeDistances,
  formatDistance,
  rectanglePolygon,
  dotDiameterPx,
  formatArea,
  formatLength,
  polygonAreaM2,
} from '../../lib/gardenPlan';
import {
  PLAN_INSETS,
  ZOOM_STEP,
  fitView,
  scaleLimits,
  clampView,
  zoomAround,
  clampNumber,
  clampToPlan,
  snapToGrid,
  isInsidePlan,
  polygonLabelPoint,
  plantSubtitle,
  shortPlantName,
  nextPlanSize,
  parsePlanSizeInput,
} from '../../lib/planView';
import {
  hitCorner,
  hitSide,
  hitMidpoint,
  insertCorner,
  removeCorner,
  sideMidpoints,
  placeRectangle,
  PILL_OFFSET_PX,
  PILL_OFFSET_EDIT_PX,
} from '../../lib/zoneDraw';
import { effectivePlanSize, planSizeOf, planSizeSourceText } from '../../lib/planSize';
import { formatShortDate } from '../../lib/journal';
import { DEFAULT_SNAP_SETTINGS, makeSnapper, snapShapes } from '../../lib/planSnap';
import {
  DEFAULT_NUDGE_STEP,
  NUDGE_DIRS,
  nextNudgeStep,
  nudgeLabel,
  nudgeTarget,
} from '../../lib/planNudge';
import {
  featureAt,
  featureLabel,
  featureLook,
  dragFeatureCorner,
  dragFeatureShape,
} from '../../lib/planFeatures';

const HIT_PX = 44;
const LONG_PRESS_MS = 450;
const PAD = 120; // base px around the plan so edge dots stay inside the touchable parent
const ZOOM_MS = 220;
// While the undo banner shows, the zoom buttons sit above it.
const BANNER_LIFT = 90;
const DEFAULT_DRAWER_H = 130;
// Zones other than the one being drawn (the PlanTracer artboard).
const DIM_OPACITY = 0.45;
const CORNER_MENU_W = 184;
const CORNER_MENU_H = 46;
// Ticket 117: the "+" of a side, shown only when the side is long enough on screen.
const PLUS_HIT_PX = 16;
const PLUS_MIN_SIDE_PX = 40;

function sideScreenLength(polygon, index, view) {
  const [x1, y1] = polygon[index];
  const [x2, y2] = polygon[(index + 1) % polygon.length];
  return Math.hypot(x2 - x1, y2 - y1) * view.scale;
}

const FONT_BOLD = 'InstrumentSans_600SemiBold';
const FONT_BODY = 'InstrumentSans_400Regular';

function dragGesture({ onStart, onMove, onEnd }) {
  return Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_MS)
    .onStart((e) => {
      scheduleOnRN(onStart, e.absoluteX, e.absoluteY);
    })
    .onUpdate((e) => {
      scheduleOnRN(onMove, e.translationX, e.translationY);
    })
    .onEnd((e, success) => {
      scheduleOnRN(onEnd, e.translationX, e.translationY, success);
    });
}

function PlanDot({ plant, left, top, hit, dia, selected, hidden, passive, ring, onSelect, drag }) {
  const tap = Gesture.Tap()
    .maxDuration(400)
    .onEnd((e, success) => {
      if (success) scheduleOnRN(onSelect, plant.id);
    });
  const gesture = Gesture.Race(dragGesture(drag), tap);
  const body = (
    <View
      collapsable={false}
      accessibilityRole="button"
      accessibilityLabel={`Plante ${plant.name}`}
      style={[styles.dotHit, { width: hit, height: hit, left: 0, top: 0 }]}>
      {hidden ? (
        <View
          style={{
            width: dia,
            height: dia,
            borderRadius: dia / 2,
            borderWidth: ring.thin,
            borderStyle: 'dashed',
            borderColor: colors.planOutline,
          }}
        />
      ) : (
        <>
          {selected ? (
            <View
              style={{
                position: 'absolute',
                width: dia + 2 * 5 * ring.unit,
                height: dia + 2 * 5 * ring.unit,
                borderRadius: (dia + 10 * ring.unit) / 2,
                borderWidth: 2.5 * ring.unit,
                borderColor: colors.text,
              }}
            />
          ) : null}
          <View
            testID={`plan-dot-${plant.id}`}
            style={{
              width: dia,
              height: dia,
              borderRadius: dia / 2,
              backgroundColor: colorHex(plant.flowerColor),
              opacity: 0.85,
              borderWidth: 2 * ring.unit,
              borderColor: '#fff',
            }}
          />
        </>
      )}
    </View>
  );
  // While a zone is drawn or edited the plants stay visible but do not react
  // (a tap must place a corner, not select the plant under it).
  return (
    <View
      style={[styles.dotHit, { left, top, width: hit, height: hit }]}
      pointerEvents={passive ? 'none' : 'box-none'}>
      {passive ? body : <GestureDetector gesture={gesture}>{body}</GestureDetector>}
    </View>
  );
}

// The "Taille sur le plan" row of the bubble (PlanBulle artboard): "−" and "+"
// step the size, the value opens an inline input in metres. `onChange(cm)`
// saves and resolves to true on success.
function BubbleSize({ size, onChange }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const current = size.cm;
  const sourceText = planSizeSourceText(size, formatShortDate);

  const step = (direction) => onChange(nextPlanSize(current, direction));
  const open = () => {
    setText(String(current / 100).replace('.', ','));
    setError(null);
    setEditing(true);
  };
  const submit = async () => {
    const parsed = parsePlanSizeInput(text);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    if (await onChange(parsed.cm)) setEditing(false);
  };

  if (editing) {
    return (
      <View style={styles.sizeBlock}>
        <View style={styles.sizeRow}>
          <TextInput
            testID="plan-size-input"
            accessibilityLabel="Taille sur le plan (m)"
            value={text}
            onChangeText={(value) => {
              setText(value);
              setError(null);
            }}
            onSubmitEditing={submit}
            returnKeyType="done"
            keyboardType="decimal-pad"
            autoFocus
            selectTextOnFocus
            style={styles.sizeInput}
          />
          <Text style={styles.sizeLabel}>m</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Annuler la saisie"
            onPress={() => setEditing(false)}
            style={styles.sizeButton}>
            <Icon name="close" size={18} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Valider la taille"
            onPress={submit}
            style={styles.sizeButton}>
            <Icon name="check" size={18} color={colors.text} />
          </TouchableOpacity>
        </View>
        {error ? <Text style={styles.sizeError}>{error}</Text> : null}
      </View>
    );
  }
  return (
    <View style={styles.sizeRow}>
      <View style={styles.sizeTitle}>
        <Text style={styles.sizeLabel}>Taille sur le plan</Text>
        {sourceText ? (
          <Text testID="plan-size-source" style={styles.sizeSource}>
            {sourceText}
          </Text>
        ) : null}
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Réduire la taille sur le plan"
        onPress={() => step(-1)}
        style={styles.sizeButton}>
        <Text style={styles.sizeGlyph}>−</Text>
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Saisir la taille sur le plan"
        onPress={open}
        style={[styles.sizeButton, styles.sizeValue]}>
        <Text style={styles.sizeValueText}>{formatLength(current)}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Augmenter la taille sur le plan"
        onPress={() => step(1)}
        style={styles.sizeButton}>
        <Text style={styles.sizeGlyph}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

// The "Déplacer" row of the bubble (ticket 123): a pill showing the step (a
// press cycles 1 -> 5 -> 10 cm) and four arrows. `targets` maps each direction
// to what nudgeTarget answered: null disables the arrow.
const NUDGE_ICONS = {
  left: 'arrow-left',
  up: 'arrow-up',
  down: 'arrow-down',
  right: 'arrow-right',
};

function BubbleNudge({ step, targets, onStep, onPress }) {
  return (
    <View style={styles.nudgeRow}>
      <Text style={[styles.sizeLabel, styles.nudgeLabel]}>Déplacer</Text>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`Pas de déplacement : ${step} cm`}
        onPress={() => onStep(nextNudgeStep(step))}
        style={styles.nudgePill}>
        <Text style={styles.sizeValueText}>{step} cm</Text>
      </TouchableOpacity>
      {NUDGE_DIRS.map((dir) => {
        const disabled = !targets[dir];
        return (
          <TouchableOpacity
            key={dir}
            accessibilityRole="button"
            accessibilityLabel={nudgeLabel(dir, step)}
            accessibilityState={{ disabled }}
            disabled={disabled}
            hitSlop={{ top: 5, bottom: 5, left: 2, right: 2 }}
            onPress={() => onPress(targets[dir])}
            style={[styles.nudgeButton, disabled && styles.nudgeDisabled]}>
            <Icon name={NUDGE_ICONS[dir]} size={16} color={colors.text} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function DrawerItem({ plant, drag }) {
  const gesture = dragGesture(drag);
  return (
    <GestureDetector gesture={gesture}>
      <View
        collapsable={false}
        style={styles.drawerItem}
        accessibilityRole="button"
        accessibilityLabel={`À placer : ${plant.name}`}>
        <View style={[styles.drawerDot, { backgroundColor: colorHex(plant.flowerColor) }]} />
        <Text style={styles.drawerName} numberOfLines={1}>
          {shortPlantName(plant.name)}
        </Text>
      </View>
    </GestureDetector>
  );
}

export function PlanCanvas({
  plan,
  zones,
  features = [],
  plants,
  summary,
  banner,
  onDrop,
  onOpenPlant,
  onEditSize,
  onChangePlanSize,
  // Ticket 109: the magnet. When on, a plant's ghost and drop snap to the grid.
  snapEnabled = true,
  onToggleSnap,
  // Ticket 114: what zone and element corners snap to (lib/planSnap.js).
  snapSettings = DEFAULT_SNAP_SETTINGS,
  // Ticket 107: drawing and editing a zone. `draft` is null, or
  // { kind: 'trace' | 'rect' | 'edit', polygon, closed, zoneId }; `sheet` is the
  // bar or sheet shown under the plan while it lasts; `controller` receives
  // { placeRectangle } so the screen can ask where a rectangle fits.
  draft,
  sheet,
  controller,
  onAdd,
  onAddCorner,
  onDraftChange,
  onDraftPatch,
  onEditZone,
  onBack,
  // Ticket 113: a tap on a side's length pill calls `onSidePress(index)`; the
  // pill being typed into reports through `sideEdit` { onChange, onSubmit }.
  onSidePress,
  sideEdit,
  // Ticket 110: garden elements. `features` are { id, kind, label, polygon }
  // with the polygon parsed. A long press on one (where no zone covers it)
  // edits it; a plant dropped on one is refused through `onRefuse`.
  onEditFeature,
  onRefuse,
  // Ticket 123: the bubble's arrows. `onNudge({ plant, x, y })` moves the plant
  // inside its zone; the step (cm) is a device setting kept by the screen.
  nudgeStep = DEFAULT_NUDGE_STEP,
  onChangeNudgeStep,
  onNudge,
  onSheetHeight,
  // The veil behind the "Ajouter" sheet; a tap on it calls `onScrimPress`.
  scrim = false,
  onScrimPress,
}) {
  const [viewport, setViewport] = useState(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [drawerH, setDrawerH] = useState(DEFAULT_DRAWER_H);
  const [sheetH, setSheetH] = useState(0);
  const [view, setView] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [drag, setDrag] = useState(null);
  const rootRef = useRef(null);
  const selectedAt = useRef(0);
  const dragRef = useRef(null);

  const fit = useMemo(() => (viewport ? fitView(plan, viewport) : null), [plan, viewport]);
  const base = fit ? fit.scale : 1;
  const limits = scaleLimits(base);
  // The canvas is drawn at the committed zoom (kept between 1x and 3x the fit
  // scale, to bound the SVG's size) and the transform only carries the
  // difference while a gesture runs, so it is crisp again once it ends.
  const drawScale = view ? clampNumber(view.scale, base, base * 3) : base;

  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const panStart = useSharedValue({ x: 0, y: 0 });
  const pinchStart = useSharedValue({ scale: 1, x: 0, y: 0, fx: 0, fy: 0 });

  // Whole garden in view whenever the viewport or the plan size changes.
  useEffect(() => {
    if (!fit) return;
    scale.value = fit.scale;
    tx.value = fit.offsetX;
    ty.value = fit.offsetY;
    setView(fit);
  }, [fit, scale, tx, ty]);

  // Latest values for callbacks fired from gesture worklets (they must stay
  // stable, so they read refs rather than closing over state).
  const latest = useRef({});
  latest.current = {
    plan,
    zones,
    view,
    origin,
    drawerTop: viewport ? viewport.height - drawerH : 0,
    plants,
    draft,
    sheetH,
    viewport,
    snapEnabled,
    snapSettings,
    features,
    onAddCorner,
    onDraftChange,
    onDraftPatch,
    onEditZone,
    onEditFeature,
    onRefuse,
    onSidePress,
  };

  // Ticket 114: point -> { point, kind } for the shape being drawn or edited
  // (itself excluded), or null with the magnet off.
  const buildSnapper = useCallback(() => {
    const l = latest.current;
    const excludeId =
      l.draft?.kind === 'edit'
        ? `zone:${l.draft.zoneId}`
        : l.draft?.kind === 'feature'
          ? `feature:${l.draft.featureId}`
          : null;
    return makeSnapper({
      enabled: l.snapEnabled,
      settings: l.snapSettings,
      shapes: snapShapes(l.zones, l.features),
      plan: l.plan,
      scalePxPerCm: l.view.scale,
      excludeId,
    });
  }, []);
  // Ticket 117: the corner whose "Supprimer ce sommet" popover is open.
  const [cornerMenu, setCornerMenu] = useState(null);
  const cornerMenuAt = useRef(0);
  const openCornerMenu = useCallback((index) => {
    cornerMenuAt.current = Date.now();
    setCornerMenu(index);
  }, []);
  // The popover belongs to one outline: it closes when the draft changes or ends.
  const draftPolygon = draft?.polygon;
  useEffect(() => {
    setCornerMenu(null);
  }, [draftPolygon, draft?.kind]);
  // The marker on the chosen target (a vertex, side or border), shown while a
  // corner is dragged and briefly after a tracing tap.
  const [snapMarker, setSnapMarker] = useState(null);
  const markerTimer = useRef(null);
  const showMarker = useCallback((result, ms) => {
    clearTimeout(markerTimer.current);
    const shown = result && result.kind && result.kind !== 'grid' ? result : null;
    setSnapMarker(shown ? { x: shown.point.x, y: shown.point.y, kind: shown.kind } : null);
    if (shown && ms) markerTimer.current = setTimeout(() => setSnapMarker(null), ms);
  }, []);
  useEffect(() => () => clearTimeout(markerTimer.current), []);

  useImperativeHandle(controller, () => ({
    snapper: buildSnapper,
    placeRectangle: (size) => {
      const { view: v, viewport: vp, plan: p, sheetH: h } = latest.current;
      return placeRectangle(size, { view: v, viewport: vp, plan: p, bottomPx: h });
    },
  }));

  const parsedZones = useMemo(
    () =>
      zones
        .map((zone, index) => ({
          id: zone.id,
          name: zone.name,
          polygon: parsePolygon(zone.polygon),
          fill: colors.planZoneFills[index % colors.planZoneFills.length],
        }))
        .filter((zone) => zone.polygon),
    [zones]
  );
  const zonesRef = useRef(parsedZones);
  zonesRef.current = parsedZones;

  const commit = useCallback((next) => setView(next), []);
  const keyboardHeight = useKeyboardHeight();
  // Touching the canvas closes the keyboard (the bubble's or a sheet's field).
  const clearSelection = useCallback(() => {
    Keyboard.dismiss();
    setSelectedId(null);
  }, []);
  const select = useCallback((id) => {
    selectedAt.current = Date.now();
    setSelectedId(id);
  }, []);
  const backgroundTap = useCallback(
    (x, y) => {
      const { draft: d, view: v, plan: p, snapEnabled: snap } = latest.current;
      // Ticket 113: a length pill is tapped to type into it (while tracing, only the
      // last side's); a tap on the one being typed into must not close its keyboard.
      const withHandles = d?.kind === 'edit' || d?.kind === 'feature';
      // Ticket 117: while editing, a corner comes first, then a side's "+", then a pill.
      if (withHandles) {
        if (Date.now() - cornerMenuAt.current < 400) return;
        setCornerMenu(null);
        if (!d.side && hitCorner(d.polygon, { x, y }, v, PLUS_HIT_PX) < 0) {
          const mid = hitMidpoint(d.polygon, { x, y }, v, PLUS_HIT_PX);
          if (mid >= 0 && sideScreenLength(d.polygon, mid, v) >= PLUS_MIN_SIDE_PX) {
            Keyboard.dismiss();
            const at = sideMidpoints(d.polygon)[mid];
            latest.current.onDraftChange(insertCorner(d.polygon, mid, at, p));
            return;
          }
        }
      }
      const sideIndex =
        d && (d.kind === 'trace' || d.kind === 'edit' || d.kind === 'feature')
          ? hitSide(
              d.polygon,
              d.kind !== 'trace',
              { x, y },
              v,
              withHandles ? PILL_OFFSET_EDIT_PX : PILL_OFFSET_PX
            )
          : -1;
      const tappable = d?.kind === 'trace' ? d.polygon.length - 2 : sideIndex;
      if (sideIndex >= 0 && sideIndex === tappable && !(d.kind === 'trace' && d.closed)) {
        if (d.side?.index !== sideIndex) latest.current.onSidePress?.(sideIndex);
        return;
      }
      Keyboard.dismiss();
      if (d) {
        // Typing a side's length: a tap elsewhere only closes the keyboard.
        if (d.side) return;
        // Drawing: a tap places a corner (not on top of one already there).
        if (d.kind === 'trace' && !d.closed && hitCorner(d.polygon, { x, y }, v, HIT_PX / 2) < 0) {
          const snapper = buildSnapper();
          const at = toPlan({ x, y }, v);
          latest.current.onAddCorner(at, p, snapper ?? snap);
          showMarker(snapper?.(at), 1500);
        }
        return;
      }
      // A tap on a plant reaches both its own tap and this one; the plant wins.
      if (Date.now() - selectedAt.current < 250) return;
      setSelectedId(null);
    },
    [buildSnapper, showMarker]
  );

  // A long press on a zone's empty area edits its outline. A plant keeps its
  // own long press (moving it), so a press on a plant, or while one is being
  // dragged, does nothing here. Where no zone covers the spot, a garden element
  // under it is edited instead (zones are drawn above elements).
  const zoneLongPress = useCallback((x, y) => {
    const { view: v, plants: all, onEditZone: edit, onEditFeature: editFeature } = latest.current;
    if (dragRef.current) return;
    for (const plant of all) {
      if (plant.planX == null || plant.planY == null) continue;
      const c = toScreen({ x: plant.planX, y: plant.planY }, v);
      const r = Math.max(HIT_PX / 2, dotDiameterPx(planSizeOf(plant), v.scale) / 2);
      if (Math.hypot(c.x - x, c.y - y) <= r) return;
    }
    const at = toPlan({ x, y }, v);
    const zone = zoneAt(at, zonesRef.current);
    if (zone) {
      edit(zone.id);
      return;
    }
    const feature = featureAt(at, latest.current.features);
    if (feature && editFeature) editFeature(feature.id);
  }, []);

  // Moving a corner (edit) or the whole rectangle: the translation in screen px
  // from the start of the drag becomes cm, applied to the polygon as it was.
  const draftDrag = useRef(null);
  const draftHandlers = useMemo(
    () => ({
      onStart: (kind, index) => {
        const { draft: d, plan: p } = latest.current;
        setCornerMenu(null);
        if (!d) return;
        if (kind === 'midpoint') {
          // Ticket 117: dragging a "+" adds the corner at the midpoint, then
          // drags it like any corner.
          const mid = sideMidpoints(d.polygon)[index];
          if (!mid) return;
          const inserted = insertCorner(d.polygon, index, mid, p);
          draftDrag.current = { kind: 'corner', index: index + 1, start: inserted };
          latest.current.onDraftChange(inserted, inserted);
          return;
        }
        draftDrag.current = { kind, index, start: d.polygon };
      },
      onMove: (tx, ty) => {
        const start = draftDrag.current;
        if (!start) return;
        const { view: v, plan: p, snapEnabled: snap } = latest.current;
        const delta = { dx: Math.round(tx / v.scale), dy: Math.round(ty / v.scale) };
        // Zones and elements share one path: snapped with the magnet (tickets 110, 112, 114).
        const snapper = buildSnapper();
        let last = null;
        const magnet = snapper
          ? (point, corner) => {
              last = snapper(point, corner);
              return last;
            }
          : snap;
        const next =
          start.kind === 'corner'
            ? dragFeatureCorner(start.start, start.index, delta, p, magnet)
            : dragFeatureShape(start.start, delta, p, magnet);
        showMarker(last, 0);
        // A corner drag also reports the outline it started from (the sheet's "before → after").
        latest.current.onDraftChange(next, start.kind === 'corner' ? start.start : null);
      },
      onEnd: () => {
        draftDrag.current = null;
        showMarker(null, 0);
        latest.current.onDraftPatch?.({ dragFrom: null });
      },
    }),
    [buildSnapper, showMarker]
  );

  const startDrag = useCallback((plant, source, absX, absY) => {
    const { origin: o, view: v } = latest.current;
    const centre =
      source === 'plan'
        ? toScreen({ x: plant.planX, y: plant.planY }, v)
        : { x: absX - o.x, y: absY - o.y };
    dragRef.current = {
      plant,
      source,
      startX: centre.x,
      startY: centre.y,
      x: centre.x,
      y: centre.y,
    };
    setDrag(dragRef.current);
    setSelectedId(null);
  }, []);
  const moveDrag = useCallback((dx, dy) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = { ...d, x: d.startX + dx, y: d.startY + dy };
    setDrag(dragRef.current);
  }, []);
  const endDrag = useCallback(
    (dx, dy, success) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d || !success) return;
      const { plan: p, view: v, drawerTop, snapEnabled: snap } = latest.current;
      const x = d.startX + dx;
      const y = d.startY + dy;
      const point = toPlan({ x, y }, v);
      if (d.source === 'drawer' && (y >= drawerTop || !isInsidePlan(point, p))) return;
      const at = snap ? snapToGrid(point, p) : clampToPlan(point, p);
      // A plant never stands on a garden element: the drop is refused and the
      // plant keeps its place (or stays in the drawer).
      const blocking = featureAt(at, latest.current.features);
      if (blocking) {
        latest.current.onRefuse?.({ plant: d.plant, feature: blocking });
        return;
      }
      onDrop({
        plant: d.plant,
        x: at.x,
        y: at.y,
        zoneId: zoneAt(at, zonesRef.current)?.id ?? null,
      });
    },
    [onDrop]
  );
  const dragHandlers = (plant, source) => ({
    onStart: (absX, absY) => startDrag(plant, source, absX, absY),
    onMove: moveDrag,
    onEnd: endDrag,
  });

  const readView = () => {
    'worklet';
    return { scale: scale.value, offsetX: tx.value, offsetY: ty.value };
  };
  const applyView = (next) => {
    'worklet';
    scale.value = next.scale;
    tx.value = next.offsetX;
    ty.value = next.offsetY;
  };

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      const v = readView();
      pinchStart.value = { scale: v.scale, x: v.offsetX, y: v.offsetY, fx: e.focalX, fy: e.focalY };
      scheduleOnRN(clearSelection);
    })
    .onUpdate((e) => {
      const s0 = pinchStart.value;
      const nextScale = clampNumber(s0.scale * e.scale, limits.min, limits.max);
      const zoomed = zoomAround({ scale: s0.scale, offsetX: s0.x, offsetY: s0.y }, nextScale, {
        x: s0.fx,
        y: s0.fy,
      });
      applyView(
        clampView(
          {
            scale: nextScale,
            offsetX: zoomed.offsetX + (e.focalX - s0.fx),
            offsetY: zoomed.offsetY + (e.focalY - s0.fy),
          },
          plan,
          viewport
        )
      );
    })
    .onEnd(() => {
      scheduleOnRN(commit, readView());
    });

  const pan = Gesture.Pan()
    .maxPointers(1)
    .onStart(() => {
      const v = readView();
      panStart.value = { x: v.offsetX, y: v.offsetY };
      scheduleOnRN(clearSelection);
    })
    .onUpdate((e) => {
      applyView(
        clampView(
          {
            scale: scale.value,
            offsetX: panStart.value.x + e.translationX,
            offsetY: panStart.value.y + e.translationY,
          },
          plan,
          viewport
        )
      );
    })
    .onEnd(() => {
      scheduleOnRN(commit, readView());
    });

  const backgroundTapGesture = Gesture.Tap().onEnd((e, success) => {
    if (success) scheduleOnRN(backgroundTap, e.x, e.y);
  });

  const longPress = Gesture.LongPress()
    .minDuration(600)
    .maxDistance(10)
    .enabled(!draft)
    .onStart((e) => {
      scheduleOnRN(zoneLongPress, e.x, e.y);
    });

  const canvasStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value - PAD * (scale.value / drawScale) },
      { translateY: ty.value - PAD * (scale.value / drawScale) },
      { scale: scale.value / drawScale },
    ],
  }));

  const animateTo = (target) => {
    const next = clampView(target, plan, viewport);
    scale.value = withTiming(next.scale, { duration: ZOOM_MS });
    tx.value = withTiming(next.offsetX, { duration: ZOOM_MS });
    ty.value = withTiming(next.offsetY, { duration: ZOOM_MS }, (finished) => {
      if (finished) scheduleOnRN(commit, next);
    });
  };
  const zoomBy = (factor) => {
    const centre = {
      x: viewport.width / 2,
      y: (PLAN_INSETS.top + viewport.height - PLAN_INSETS.bottom) / 2,
    };
    const current = { scale: scale.value, offsetX: tx.value, offsetY: ty.value };
    animateTo(
      zoomAround(current, clampNumber(current.scale * factor, limits.min, limits.max), centre)
    );
  };

  const onRootLayout = (e) => {
    const { width, height } = e.nativeEvent.layout;
    setViewport((prev) =>
      prev && prev.width === width && prev.height === height ? prev : { width, height }
    );
    rootRef.current?.measureInWindow?.((x, y) => setOrigin({ x: x ?? 0, y: y ?? 0 }));
  };

  const unplaced = draft ? [] : plants.filter((p) => p.planX == null || p.planY == null);
  const placed = plants.filter((p) => p.planX != null && p.planY != null);
  const unit = view ? drawScale / view.scale : 1; // one screen px in canvas px
  const selected = draft ? null : placed.find((p) => p.id === selectedId) || null;
  // A zone being edited is drawn from its draft; the others are dimmed while a
  // new one is traced.
  const drawnZones = parsedZones.map((zone) =>
    draft?.kind === 'edit' && zone.id === draft.zoneId ? { ...zone, polygon: draft.polygon } : zone
  );
  const dimOthers = draft?.kind === 'trace' || draft?.kind === 'rect';
  // The element being edited is drawn from its draft (shape, type and name live).
  const drawnFeatures = features.map((feature) =>
    draft?.kind === 'feature' && feature.id === draft.featureId
      ? { ...feature, polygon: draft.polygon, kind: draft.featureKind, label: draft.label }
      : feature
  );
  // The spot a drag would land on: snapped when the magnet is on (ticket 109).
  let ghostAt = drag ? { x: drag.x, y: drag.y } : null;
  let ghostPoint = null;
  if (drag && view) {
    ghostPoint = toPlan(drag, view);
    if (snapEnabled && plan) {
      ghostPoint = snapToGrid(ghostPoint, plan);
      ghostAt = toScreen(ghostPoint, view);
    }
  }
  // Ticket 122: distances from the dragged ghost, else the selected plant, to
  // the sides of the zone under that point (the garden border when in none).
  const measured =
    draft || !view
      ? null
      : ghostPoint || (selected ? { x: selected.planX, y: selected.planY } : null);
  const distances = measured
    ? edgeDistances(
        measured,
        zoneAt(measured, parsedZones)?.polygon ||
          rectanglePolygon({ x: 0, y: 0, widthCm: plan.widthCm, lengthCm: plan.lengthCm })
      )
    : [];
  const highlightId = ghostPoint ? (zoneAt(ghostPoint, parsedZones)?.id ?? null) : null;
  const ghostRefused = !!ghostPoint && !!featureAt(ghostPoint, features);
  const drawerHeight = draft ? sheetH : unplaced.length ? drawerH : 0;

  const hitSize = HIT_PX * unit;
  const dotDia = (plant) => dotDiameterPx(planSizeOf(plant), view.scale) * unit;

  let bubble = null;
  if (selected && view && viewport) {
    const c = toScreen({ x: selected.planX, y: selected.planY }, view);
    const r = dotDiameterPx(planSizeOf(selected), view.scale) / 2 + 5;
    const left = clampNumber(c.x - 20, 12, Math.max(12, viewport.width - 312));
    const below = c.y + r + 3 < viewport.height - keyboardHeight - drawerHeight - 136;
    const nudgeContext = { zones: parsedZones, features, plan };
    const here = { x: selected.planX, y: selected.planY };
    const targets = {};
    for (const dir of NUDGE_DIRS) targets[dir] = nudgeTarget(here, dir, nudgeStep, nudgeContext);
    const pressNudge = (result) => {
      if (!result) return;
      if (result.refused) onRefuse?.({ plant: selected, feature: result.refused });
      else onNudge?.({ plant: selected, x: result.point.x, y: result.point.y });
    };
    bubble = (
      <View
        testID="plan-bubble"
        style={[
          styles.bubble,
          { left },
          below
            ? { top: c.y + r + 3 }
            : { bottom: Math.max(viewport.height - (c.y - r - 3), keyboardHeight + 12) },
        ]}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => onOpenPlant(selected.id)}
          accessibilityRole="button"
          accessibilityLabel={`Ouvrir la fiche : ${selected.name}`}
          style={styles.bubbleLink}>
          <View style={styles.bubbleText}>
            <Text style={styles.bubbleName} numberOfLines={1}>
              {selected.name}
            </Text>
            <Text style={styles.bubbleSub} numberOfLines={1}>
              {plantSubtitle(selected.zoneName)}
            </Text>
          </View>
          <Icon name="chevron-right" size={18} color={colors.planOutline} />
        </TouchableOpacity>
        <View style={styles.bubbleRule} />
        <BubbleSize
          key={selected.id}
          size={effectivePlanSize(selected)}
          onChange={(cm) => onChangePlanSize(selected.id, cm)}
        />
        <View style={styles.bubbleRule} />
        <BubbleNudge
          step={nudgeStep}
          targets={targets}
          onStep={(next) => onChangeNudgeStep?.(next)}
          onPress={pressNudge}
        />
      </View>
    );
  }

  return (
    <View ref={rootRef} style={styles.root} onLayout={onRootLayout}>
      {view && viewport ? (
        <GestureDetector
          gesture={Gesture.Simultaneous(pinch, pan, backgroundTapGesture, longPress)}>
          <Animated.View style={styles.fill} collapsable={false}>
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: plan.widthCm * drawScale + 2 * PAD,
                  height: plan.lengthCm * drawScale + 2 * PAD,
                  transformOrigin: 'top left',
                },
                canvasStyle,
              ]}>
              <View style={{ position: 'absolute', left: PAD, top: PAD }}>
                <PlanGrid
                  plan={plan}
                  pxPerCm={drawScale}
                  unit={unit}
                  accessibilityLabel={`Plan du jardin, ${plan.widthCm / 100} × ${plan.lengthCm / 100} m`}>
                  {drawnFeatures.map((feature) => (
                    <Feature
                      key={feature.id}
                      feature={feature}
                      scale={drawScale}
                      unit={unit}
                      editing={draft?.kind === 'feature' && feature.id === draft.featureId}
                    />
                  ))}
                  {drawnZones.map((zone) => {
                    const points = zone.polygon
                      .map(([x, y]) => `${x * drawScale},${y * drawScale}`)
                      .join(' ');
                    return (
                      <Zone
                        key={zone.id}
                        zone={zone}
                        points={points}
                        unit={unit}
                        dim={dimOthers}
                        highlighted={
                          zone.id === highlightId ||
                          (draft?.kind === 'edit' && zone.id === draft.zoneId)
                        }
                      />
                    );
                  })}
                </PlanGrid>
              </View>
              {placed.map((plant) => (
                <PlanDot
                  key={plant.id}
                  plant={plant}
                  left={PAD + plant.planX * drawScale - Math.max(hitSize, dotDia(plant)) / 2}
                  top={PAD + plant.planY * drawScale - Math.max(hitSize, dotDia(plant)) / 2}
                  hit={Math.max(hitSize, dotDia(plant))}
                  dia={dotDia(plant)}
                  selected={plant.id === selectedId}
                  hidden={drag?.plant.id === plant.id}
                  passive={!!draft}
                  ring={{ unit, thin: 1.5 * unit }}
                  onSelect={select}
                  drag={dragHandlers(plant, 'plan')}
                />
              ))}
              <View pointerEvents="none" style={{ position: 'absolute', left: PAD, top: PAD }}>
                <Svg
                  width={plan.widthCm * drawScale}
                  height={plan.lengthCm * drawScale}
                  pointerEvents="none">
                  {drawnFeatures.map((feature) => {
                    const label = polygonLabelPoint(feature.polygon);
                    return (
                      <FeatureLabel
                        key={feature.id}
                        text={featureLabel(feature)}
                        lx={label.x * drawScale}
                        ly={label.y * drawScale}
                        unit={unit}
                      />
                    );
                  })}
                  {drawnZones.map((zone) => {
                    const label = polygonLabelPoint(zone.polygon);
                    return (
                      <ZoneLabel
                        key={zone.id}
                        zone={zone}
                        dim={dimOthers}
                        lx={label.x * drawScale}
                        ly={label.y * drawScale}
                        unit={unit}
                      />
                    );
                  })}
                  {measured ? (
                    <EdgeDistances
                      point={measured}
                      distances={distances}
                      scale={drawScale}
                      pxPerCm={view.scale}
                      unit={unit}
                    />
                  ) : null}
                </Svg>
              </View>
              {draft ? (
                <DraftLayer
                  draft={draft}
                  plan={plan}
                  drawScale={drawScale}
                  unit={unit}
                  pad={PAD}
                  drag={draftHandlers}
                  marker={snapMarker}
                  sideEdit={sideEdit}
                  scalePxPerCm={view.scale}
                  ringIndex={cornerMenu}
                  onCornerLongPress={openCornerMenu}
                />
              ) : null}
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      ) : null}

      <View style={styles.header} pointerEvents="box-none">
        <ScreenHeader
          compact
          title="Plan du jardin"
          subtitle={summary}
          backFallback="/(tabs)/zones"
          onBack={draft ? onBack : undefined}
          right={
            draft ? null : (
              <TouchableOpacity
                style={styles.pill}
                onPress={onAdd}
                accessibilityRole="button"
                accessibilityLabel="Ajouter">
                <Icon name="plus" size={18} color={colors.text} />
                <Text style={styles.pillText}>Ajouter</Text>
              </TouchableOpacity>
            )
          }
        />
      </View>

      {bubble}

      {draft?.kind === 'trace' && !draft.closed ? (
        <View style={styles.instruction} pointerEvents="none">
          <Text style={styles.instructionText}>
            {`Touchez chaque coin de la zone${snapEnabled ? ' (aimant actif : les coins se calent)' : ''}. Au moins 3 coins ; « Terminer » referme la forme.`}
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.zoomCol,
          { bottom: drawerHeight + 20 + (banner && !draft ? BANNER_LIFT : 0) },
        ]}>
        <RoundButton
          label={`Aimanter les plantes à la grille (${snapEnabled ? 'activé' : 'désactivé'})`}
          onPress={onToggleSnap}
          pressed={snapEnabled}>
          <Icon name="magnet" size={18} color={snapEnabled ? colors.background : colors.text} />
        </RoundButton>
        {draft ? null : (
          <RoundButton label="Dimensions du plan" onPress={onEditSize}>
            <Icon name="ruler-square" size={18} color={colors.text} />
          </RoundButton>
        )}
        <RoundButton label="Zoomer" onPress={() => zoomBy(ZOOM_STEP)}>
          <Text style={styles.zoomGlyph}>+</Text>
        </RoundButton>
        <RoundButton label="Dézoomer" onPress={() => zoomBy(1 / ZOOM_STEP)}>
          <Text style={styles.zoomGlyph}>−</Text>
        </RoundButton>
        <RoundButton label="Voir tout le jardin" onPress={() => animateTo(fit)}>
          <Icon name="fullscreen" size={18} color={colors.text} />
        </RoundButton>
      </View>

      {scrim ? (
        <TouchableOpacity
          activeOpacity={1}
          style={styles.scrim}
          onPress={onScrimPress}
          accessibilityRole="button"
          accessibilityLabel="Fermer"
        />
      ) : null}

      {sheet ? (
        <View
          style={styles.sheetWrap}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            setSheetH(h);
            onSheetHeight?.(h);
          }}>
          {sheet}
        </View>
      ) : null}

      {cornerMenu != null && (draft?.kind === 'edit' || draft?.kind === 'feature') && view
        ? (() => {
            const corner = draft.polygon[cornerMenu];
            if (!corner) return null;
            const c = toScreen({ x: corner[0], y: corner[1] }, view);
            const enabled = draft.polygon.length > 3;
            return (
              <View
                style={[
                  styles.cornerMenu,
                  {
                    left: clampNumber(
                      c.x - CORNER_MENU_W / 2,
                      8,
                      Math.max(8, viewport.width - CORNER_MENU_W - 8)
                    ),
                    top: Math.max(8, c.y - 16 - 8 - CORNER_MENU_H),
                  },
                ]}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={!enabled}
                  accessibilityRole="button"
                  accessibilityLabel="Supprimer ce sommet"
                  accessibilityState={{ disabled: !enabled }}
                  onPress={() => {
                    setCornerMenu(null);
                    latest.current.onDraftChange(removeCorner(draft.polygon, cornerMenu));
                  }}
                  style={styles.cornerMenuItem}>
                  <Text
                    style={[
                      styles.cornerMenuText,
                      { color: enabled ? colors.danger : colors.textSecondary },
                    ]}>
                    Supprimer ce sommet
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })()
        : null}

      {banner && !draft ? (
        <View style={[styles.bannerWrap, { bottom: drawerHeight + 36 }]}>{banner}</View>
      ) : null}

      {unplaced.length ? (
        <View style={styles.drawer} onLayout={(e) => setDrawerH(e.nativeEvent.layout.height)}>
          <View style={styles.drawerHead}>
            <Text style={styles.drawerTitle}>À placer · {unplaced.length}</Text>
            <Text style={styles.drawerHint}>Appui long pour poser</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.drawerRow}>
              {unplaced.map((plant) => (
                <DrawerItem key={plant.id} plant={plant} drag={dragHandlers(plant, 'drawer')} />
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {drag && view ? (
        <View
          pointerEvents="none"
          accessibilityLabel={`Déplacement : ${drag.plant.name}`}
          style={[
            styles.ghost,
            shadow.card,
            (() => {
              const d = Math.max(32, dotDiameterPx(planSizeOf(drag.plant), view.scale));
              return {
                left: ghostAt.x - d / 2,
                top: ghostAt.y - d / 2,
                width: d,
                height: d,
                borderRadius: d / 2,
                backgroundColor: colorHex(drag.plant.flowerColor),
                borderColor: ghostRefused ? colors.danger : '#fff',
              };
            })(),
          ]}
        />
      ) : null}
    </View>
  );
}

// A garden element (ticket 110, PlanElements artboard): filled and outlined per
// kind (lib/theme.js), the house also hatched. Drawn under zones and plants.
function Feature({ feature, scale, unit, editing }) {
  const look = featureLook(feature.kind);
  const points = feature.polygon.map(([x, y]) => `${x * scale},${y * scale}`).join(' ');
  const xs = feature.polygon.map((p) => p[0] * scale);
  const ys = feature.polygon.map((p) => p[1] * scale);
  const [left, right] = [Math.min(...xs), Math.max(...xs)];
  const [top, bottom] = [Math.min(...ys), Math.max(...ys)];
  const rise = bottom - top;
  // Diagonal hatching, clipped to the shape; the gap grows with the shape so
  // a large house never draws thousands of lines.
  const gap = Math.max(14 * unit, (right - left + rise) / 200);
  const hatch = [];
  if (look.hatch) for (let x = left - rise; x < right; x += gap) hatch.push(x);
  const clipId = `hatch-${feature.id}`;
  return (
    <>
      <Polygon
        testID={`plan-feature-${feature.id}`}
        points={points}
        fill={look.fill}
        stroke={editing ? colors.text : look.stroke}
        strokeWidth={(editing ? 2 : 1) * unit}
      />
      {hatch.length ? (
        <>
          <Defs>
            <ClipPath id={clipId}>
              <Polygon points={points} />
            </ClipPath>
          </Defs>
          {hatch.map((x) => (
            <Line
              key={x}
              x1={x}
              y1={bottom}
              x2={x + rise}
              y2={top}
              stroke={look.hatch}
              strokeWidth={unit}
              clipPath={`url(#${clipId})`}
            />
          ))}
        </>
      ) : null}
    </>
  );
}

function FeatureLabel({ text, lx, ly, unit }) {
  return (
    <HaloText
      unit={unit}
      x={lx}
      y={ly + 4 * unit}
      textAnchor="middle"
      fontSize={11 * unit}
      fontFamily={FONT_BOLD}
      fill={colors.planInk}>
      {text}
    </HaloText>
  );
}

// Dashed dimension lines from a point to the zone sides (ticket 122).
function EdgeDistances({ point, distances, scale, pxPerCm, unit }) {
  return distances
    .filter((d) => d.cm * pxPerCm >= 4)
    .map(({ dir, cm, to }) => {
      const x1 = point.x * scale;
      const y1 = point.y * scale;
      const x2 = to.x * scale;
      const y2 = to.y * scale;
      const horizontal = dir === 'left' || dir === 'right';
      const tick = 3 * unit;
      return (
        <G key={dir}>
          <Line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={colors.planInk}
            strokeWidth={1.25 * unit}
            strokeDasharray={`${4 * unit} ${3 * unit}`}
          />
          <Line
            x1={horizontal ? x2 : x2 - tick}
            y1={horizontal ? y2 - tick : y2}
            x2={horizontal ? x2 : x2 + tick}
            y2={horizontal ? y2 + tick : y2}
            stroke={colors.planInk}
            strokeWidth={1.25 * unit}
          />
          <HaloText
            unit={unit}
            testID={`plan-distance-${dir}`}
            x={horizontal ? (x1 + x2) / 2 : x1 + 4 * unit}
            y={horizontal ? y1 - 4 * unit : (y1 + y2) / 2 + 4 * unit}
            textAnchor={horizontal ? 'middle' : 'start'}
            fontSize={11 * unit}
            fontFamily={FONT_BOLD}
            fill={colors.planInk}>
            {formatDistance(cm)}
          </HaloText>
        </G>
      );
    });
}

function Zone({ zone, points, unit, highlighted, dim }) {
  return (
    <>
      <Polygon
        opacity={dim ? DIM_OPACITY : 1}
        points={points}
        fill={zone.fill}
        stroke={highlighted ? colors.accent : colors.planOutline}
        strokeWidth={(highlighted ? 2 : 1.25) * unit}
      />
    </>
  );
}

// Zone name and area, drawn above the plants (ticket 106) with a paper-coloured
// halo so they stay readable over a dot. react-native-svg ignores paintOrder on
// iOS and Android, where the stroke then covers the letters (ticket 124): there
// the halo is a stroked copy drawn under the text instead.
function HaloText({ unit, children, ...props }) {
  const halo = {
    stroke: colors.planPaper,
    strokeWidth: 3 * unit,
    strokeLinejoin: 'round',
  };
  if (Platform.OS === 'web') {
    return (
      <SvgText {...props} {...halo} paintOrder="stroke">
        {children}
      </SvgText>
    );
  }
  const { testID: _testID, ...rest } = props;
  return (
    <G>
      <SvgText {...rest} {...halo} fill={colors.planPaper}>
        {children}
      </SvgText>
      <SvgText {...props}>{children}</SvgText>
    </G>
  );
}

function ZoneLabel({ zone, lx, ly, unit, dim }) {
  const area = formatArea(polygonAreaM2(zone.polygon));
  return (
    <G opacity={dim ? DIM_OPACITY : 1}>
      <HaloText
        unit={unit}
        x={lx}
        y={ly - 1 * unit}
        textAnchor="middle"
        fontSize={11 * unit}
        fontFamily={FONT_BOLD}
        fill={colors.planInk}>
        {zone.name}
      </HaloText>
      <HaloText
        unit={unit}
        x={lx}
        y={ly + 12 * unit}
        textAnchor="middle"
        fontSize={10 * unit}
        fontFamily={FONT_BODY}
        fill={colors.textSecondary}>
        {area}
      </HaloText>
    </G>
  );
}

function RoundButton({ label, onPress, pressed, children }) {
  return (
    <TouchableOpacity
      style={[styles.roundBtnBig, pressed ? styles.roundBtnPressed : null]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={pressed === undefined ? undefined : { pressed }}
      accessibilityLabel={label}>
      {children}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, overflow: 'hidden' },
  fill: { ...StyleSheet.absoluteFillObject },
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingTop: 56,
    paddingHorizontal: spacing.lg - 4,
    paddingBottom: 10,
    backgroundColor: colors.background,
    zIndex: 2,
  },
  // The header's "Ajouter" button (Plan artboard).
  pill: {
    height: 40,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pillText: { fontFamily: FONT_BOLD, fontSize: 13, color: colors.text },
  instruction: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 116,
    zIndex: 4,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.track,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    ...shadow.card,
  },
  instructionText: { fontFamily: FONT_BODY, fontSize: 14, lineHeight: 20, color: colors.planInk },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5 },
  scrim: { ...StyleSheet.absoluteFillObject, zIndex: 4, backgroundColor: colors.planScrim },
  dotHit: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  zoomCol: { position: 'absolute', right: 12, gap: 8, zIndex: 3 },
  roundBtnBig: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.soft,
  },
  roundBtnPressed: { backgroundColor: colors.text, borderColor: colors.text },
  zoomGlyph: { fontSize: 22, color: colors.text, lineHeight: 26 },
  bubble: {
    position: 'absolute',
    zIndex: 4,
    width: 290,
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingTop: 6,
    paddingBottom: 10,
    paddingHorizontal: 8,
    ...shadow.card,
  },
  bubbleLink: {
    minHeight: 44,
    paddingVertical: 4,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bubbleRule: { height: 1, backgroundColor: colors.divider, marginHorizontal: 6 },
  sizeBlock: { paddingHorizontal: 6, gap: 4 },
  sizeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6 },
  sizeLabel: { fontFamily: FONT_BODY, fontSize: 13, color: colors.planInk },
  sizeTitle: { flexGrow: 1, flexShrink: 1 },
  sizeSource: { fontFamily: FONT_BODY, fontSize: 11, color: colors.textSecondary },
  sizeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeValue: {
    width: undefined,
    minWidth: 64,
    paddingHorizontal: 10,
    backgroundColor: colors.background,
  },
  sizeValueText: { fontFamily: FONT_BOLD, fontSize: 14, color: colors.text },
  nudgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  nudgeLabel: { flexGrow: 1, marginRight: 2 },
  nudgePill: {
    minWidth: 46,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 8,
    marginRight: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudgeDisabled: { opacity: 0.35 },
  sizeGlyph: { fontFamily: FONT_BODY, fontSize: 18, lineHeight: 22, color: colors.text },
  sizeInput: {
    flexGrow: 1,
    flexShrink: 1,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    fontFamily: FONT_BOLD,
    fontSize: 14,
    color: colors.text,
  },
  sizeError: { fontFamily: FONT_BODY, fontSize: 12, color: colors.danger },
  bubbleText: { flexShrink: 1, gap: 1 },
  bubbleName: { fontFamily: FONT_BOLD, fontSize: 15, color: colors.text },
  bubbleSub: { fontFamily: FONT_BODY, fontSize: 12, color: colors.textSecondary },
  bannerWrap: { position: 'absolute', left: 16, right: 16, zIndex: 5 },
  drawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 3,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.track,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: 14,
    paddingHorizontal: spacing.lg - 4,
    paddingBottom: 30,
    gap: 10,
    ...shadow.soft,
  },
  drawerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  drawerTitle: {
    fontFamily: 'InstrumentSans_500Medium',
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  drawerHint: { fontFamily: FONT_BODY, fontSize: 12, color: colors.textSecondary },
  drawerRow: { flexDirection: 'row', gap: 14 },
  drawerItem: { width: 64, alignItems: 'center', gap: 4 },
  drawerDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fff',
  },
  drawerName: {
    fontFamily: 'InstrumentSans_500Medium',
    fontSize: 11,
    color: colors.planInk,
  },
  cornerMenu: {
    position: 'absolute',
    width: CORNER_MENU_W,
    borderRadius: 16,
    backgroundColor: colors.surface,
    overflow: 'visible',
    zIndex: 5,
    ...shadow.card,
  },
  cornerMenuItem: {
    height: CORNER_MENU_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerMenuText: { fontFamily: FONT_BOLD, fontSize: 15 },
  ghost: {
    position: 'absolute',
    zIndex: 6,
    borderWidth: 3,
    borderColor: '#fff',
  },
});
