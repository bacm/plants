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
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { G, Polygon, Text as SvgText } from 'react-native-svg';
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
  isInsidePlan,
  polygonLabelPoint,
  plantSubtitle,
  shortPlantName,
} from '../../lib/planView';
import { hitCorner, moveCorner, translatePolygon, placeRectangle } from '../../lib/zoneDraw';

const HIT_PX = 44;
const LONG_PRESS_MS = 450;
const PAD = 120; // base px around the plan so edge dots stay inside the touchable parent
const ZOOM_MS = 220;
// While the undo banner shows, the zoom buttons sit above it.
const BANNER_LIFT = 90;
const DEFAULT_DRAWER_H = 130;
// Zones other than the one being drawn (the PlanTracer artboard).
const DIM_OPACITY = 0.45;

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
  plants,
  summary,
  banner,
  onDrop,
  onOpenPlant,
  onEditSize,
  // Ticket 107: drawing and editing a zone. `draft` is null, or
  // { kind: 'trace' | 'rect' | 'edit', polygon, closed, zoneId }; `sheet` is the
  // bar or sheet shown under the plan while it lasts; `controller` receives
  // { placeRectangle } so the screen can ask where a rectangle fits.
  draft,
  sheet,
  controller,
  onStartTrace,
  onAddCorner,
  onDraftChange,
  onEditZone,
  onBack,
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
    onAddCorner,
    onDraftChange,
    onEditZone,
  };

  useImperativeHandle(controller, () => ({
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
  const clearSelection = useCallback(() => setSelectedId(null), []);
  const select = useCallback((id) => {
    selectedAt.current = Date.now();
    setSelectedId(id);
  }, []);
  const backgroundTap = useCallback((x, y) => {
    const { draft: d, view: v, plan: p } = latest.current;
    if (d) {
      // Drawing: a tap places a corner (not on top of one already there).
      if (d.kind === 'trace' && !d.closed && hitCorner(d.polygon, { x, y }, v, HIT_PX / 2) < 0) {
        latest.current.onAddCorner(toPlan({ x, y }, v), p);
      }
      return;
    }
    // A tap on a plant reaches both its own tap and this one; the plant wins.
    if (Date.now() - selectedAt.current < 250) return;
    setSelectedId(null);
  }, []);

  // A long press on a zone's empty area edits its outline. A plant keeps its
  // own long press (moving it), so a press on a plant, or while one is being
  // dragged, does nothing here.
  const zoneLongPress = useCallback((x, y) => {
    const { view: v, plants: all, onEditZone: edit } = latest.current;
    if (dragRef.current) return;
    for (const plant of all) {
      if (plant.planX == null || plant.planY == null) continue;
      const c = toScreen({ x: plant.planX, y: plant.planY }, v);
      const r = Math.max(HIT_PX / 2, dotDiameterPx(plant.width, v.scale) / 2);
      if (Math.hypot(c.x - x, c.y - y) <= r) return;
    }
    const zone = zoneAt(toPlan({ x, y }, v), zonesRef.current);
    if (zone) edit(zone.id);
  }, []);

  // Moving a corner (edit) or the whole rectangle: the translation in screen px
  // from the start of the drag becomes cm, applied to the polygon as it was.
  const draftDrag = useRef(null);
  const draftHandlers = useMemo(
    () => ({
      onStart: (kind, index) => {
        const d = latest.current.draft;
        if (d) draftDrag.current = { kind, index, start: d.polygon };
      },
      onMove: (tx, ty) => {
        const start = draftDrag.current;
        if (!start) return;
        const { view: v, plan: p } = latest.current;
        const delta = { dx: Math.round(tx / v.scale), dy: Math.round(ty / v.scale) };
        latest.current.onDraftChange(
          start.kind === 'corner'
            ? moveCorner(start.start, start.index, delta, p)
            : translatePolygon(start.start, delta, p)
        );
      },
      onEnd: () => {
        draftDrag.current = null;
      },
    }),
    []
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
      const { plan: p, view: v, drawerTop } = latest.current;
      const x = d.startX + dx;
      const y = d.startY + dy;
      const point = toPlan({ x, y }, v);
      if (d.source === 'drawer' && (y >= drawerTop || !isInsidePlan(point, p))) return;
      const at = clampToPlan(point, p);
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
  const dimOthers = !!draft && draft.kind !== 'edit';
  const highlightId = drag ? (zoneAt(toPlan(drag, view), parsedZones)?.id ?? null) : null;
  const drawerHeight = draft ? sheetH : unplaced.length ? drawerH : 0;

  const hitSize = HIT_PX * unit;
  const dotDia = (plant) => dotDiameterPx(plant.width, view.scale) * unit;

  let bubble = null;
  if (selected && view && viewport) {
    const c = toScreen({ x: selected.planX, y: selected.planY }, view);
    const r = dotDiameterPx(selected.width, view.scale) / 2 + 5;
    const left = clampNumber(c.x - 20, 12, Math.max(12, viewport.width - 312));
    const below = c.y + r + 3 < viewport.height - drawerHeight - 90;
    bubble = (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => onOpenPlant(selected.id)}
        accessibilityRole="button"
        accessibilityLabel={`Ouvrir la fiche : ${selected.name}`}
        style={[
          styles.bubble,
          { left },
          below ? { top: c.y + r + 3 } : { bottom: viewport.height - (c.y - r - 3) },
        ]}>
        <View style={styles.bubbleText}>
          <Text style={styles.bubbleName} numberOfLines={1}>
            {selected.name}
          </Text>
          <Text style={styles.bubbleSub} numberOfLines={1}>
            {plantSubtitle(selected.zoneName, selected.width, formatLength)}
          </Text>
        </View>
        <Icon name="chevron-right" size={18} color={colors.planOutline} />
      </TouchableOpacity>
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
                onPress={onStartTrace}
                accessibilityRole="button"
                accessibilityLabel="Tracer une zone">
                <Icon name="pencil-outline" size={16} color={colors.text} />
                <Text style={styles.pillText}>Tracer une zone</Text>
              </TouchableOpacity>
            )
          }
        />
      </View>

      {bubble}

      {draft?.kind === 'trace' && !draft.closed ? (
        <View style={styles.instruction} pointerEvents="none">
          <Text style={styles.instructionText}>
            Touchez chaque coin de la zone. Au moins 3 coins ; « Terminer » referme la forme.
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.zoomCol,
          { bottom: drawerHeight + 20 + (banner && !draft ? BANNER_LIFT : 0) },
        ]}>
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

      {sheet ? (
        <View style={styles.sheetWrap} onLayout={(e) => setSheetH(e.nativeEvent.layout.height)}>
          {sheet}
        </View>
      ) : null}

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
              const d = Math.max(32, dotDiameterPx(drag.plant.width, view.scale));
              return {
                left: drag.x - d / 2,
                top: drag.y - d / 2,
                width: d,
                height: d,
                borderRadius: d / 2,
                backgroundColor: colorHex(drag.plant.flowerColor),
              };
            })(),
          ]}
        />
      ) : null}
    </View>
  );
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
// halo so they stay readable over a dot.
const HALO = (unit) => ({
  stroke: colors.planPaper,
  strokeWidth: 3 * unit,
  strokeLinejoin: 'round',
  paintOrder: 'stroke',
});

function ZoneLabel({ zone, lx, ly, unit, dim }) {
  const area = formatArea(polygonAreaM2(zone.polygon));
  return (
    <G opacity={dim ? DIM_OPACITY : 1}>
      <SvgText
        x={lx}
        y={ly - 1 * unit}
        textAnchor="middle"
        fontSize={11 * unit}
        fontFamily={FONT_BOLD}
        fill={colors.planInk}
        {...HALO(unit)}>
        {zone.name}
      </SvgText>
      <SvgText
        x={lx}
        y={ly + 12 * unit}
        textAnchor="middle"
        fontSize={10 * unit}
        fontFamily={FONT_BODY}
        fill={colors.textSecondary}
        {...HALO(unit)}>
        {area}
      </SvgText>
    </G>
  );
}

function RoundButton({ label, onPress, children }) {
  return (
    <TouchableOpacity
      style={styles.roundBtnBig}
      onPress={onPress}
      accessibilityRole="button"
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
  // The header's "Tracer une zone" button (Plan artboard).
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
  zoomGlyph: { fontSize: 22, color: colors.text, lineHeight: 26 },
  bubble: {
    position: 'absolute',
    zIndex: 4,
    maxWidth: 300,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    ...shadow.card,
  },
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
  ghost: {
    position: 'absolute',
    zIndex: 6,
    borderWidth: 3,
    borderColor: '#fff',
  },
});
