// The outline being drawn or edited on the plan (ticket 107): its edges, the
// length pill of each side, the corners, and the touch areas that move a corner
// (edit mode) or the whole shape (rectangle mode, or a long press inside the
// edited shape). Drawn in the canvas's own
// coordinates, above the plants. `unit` is one screen pixel in canvas px, so
// strokes, pills and handles keep their size while the canvas is scaled.
//
// A drag is reported through `drag` ({ onStart, onMove, onEnd }, the same shape
// as a plant's): `onStart(kind, index)` with kind 'corner' or 'shape', then the
// finger's translation in screen px. The canvas turns it into a new polygon.
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Polygon, Polyline, Line, Circle, Text as SvgText } from 'react-native-svg';
import { colors } from '../../lib/theme';
import { sideLengths, PILL_OFFSET_PX, PILL_OFFSET_EDIT_PX } from '../../lib/zoneDraw';
import { featureLook } from '../../lib/planFeatures';
import { pointInPolygon } from '../../lib/gardenPlan';
import { SNAP_KIND_LABELS } from '../../lib/planSnap';

const HIT_PX = 44;
const PILL_W = 64;
// Ticket 117: a long press this long on a corner opens "Supprimer ce sommet".
export const CORNER_LONG_PRESS_MS = 600;
// An edited shape moves as a whole after a long press inside it (as a plant does).
const SHAPE_LONG_PRESS_MS = 450;
const PLUS_R = 8;
// A side shorter than this on screen has no "+" (it would sit under its corners).
const PLUS_MIN_SIDE_PX = 40;

function panGesture(kind, index, drag) {
  return Gesture.Pan()
    .minDistance(2)
    .onStart(() => {
      scheduleOnRN(drag.onStart, kind, index);
    })
    .onUpdate((e) => {
      scheduleOnRN(drag.onMove, e.translationX, e.translationY);
    })
    .onEnd(() => {
      scheduleOnRN(drag.onEnd);
    });
}

// The whole edited shape, dragged after a long press. The touch area is the
// shape's bounding box; a press outside the outline itself (a concave corner)
// starts nothing.
function ShapeArea({ bounds, contains, drag }) {
  const start = (x, y) => {
    if (contains(bounds.left + x, bounds.top + y)) drag.onStart('shape', 0);
  };
  const gesture = Gesture.Pan()
    .activateAfterLongPress(SHAPE_LONG_PRESS_MS)
    .onStart((e) => {
      scheduleOnRN(start, e.x, e.y);
    })
    .onUpdate((e) => {
      scheduleOnRN(drag.onMove, e.translationX, e.translationY);
    })
    .onEnd(() => {
      scheduleOnRN(drag.onEnd);
    });
  return (
    <GestureDetector gesture={gesture}>
      <View
        collapsable={false}
        accessibilityLabel="Forme à déplacer (appui long)"
        style={[styles.abs, bounds]}
      />
    </GestureDetector>
  );
}

function Handle({ cx, cy, unit, drag, index, color, onLongPress }) {
  const hit = HIT_PX * unit;
  const dia = 18 * unit;
  const pan = panGesture('corner', index, drag);
  const gesture = onLongPress
    ? Gesture.Simultaneous(
        pan,
        Gesture.LongPress()
          .minDuration(CORNER_LONG_PRESS_MS)
          .maxDistance(10)
          .onStart(() => {
            scheduleOnRN(onLongPress, index);
          })
      )
    : pan;
  return (
    <GestureDetector gesture={gesture}>
      <View
        collapsable={false}
        accessibilityRole="button"
        accessibilityLabel={`Coin ${index + 1}`}
        style={[
          styles.abs,
          styles.center,
          { left: cx - hit / 2, top: cy - hit / 2, width: hit, height: hit },
        ]}>
        <View style={dot(dia, unit, 2.5, color)} />
      </View>
    </GestureDetector>
  );
}

// The "+" at a side's midpoint (ticket 117): a tap adds a corner there (the
// canvas handles the tap), a drag adds one and moves it.
function PlusHandle({ cx, cy, unit, drag, index }) {
  const hit = 2 * 16 * unit;
  return (
    <GestureDetector gesture={panGesture('midpoint', index, drag)}>
      <View
        collapsable={false}
        accessibilityRole="button"
        accessibilityLabel={`Ajouter un sommet, côté ${index + 1}`}
        style={[
          styles.abs,
          styles.center,
          { left: cx - hit / 2, top: cy - hit / 2, width: hit, height: hit },
        ]}>
        <Svg
          width={2 * PLUS_R * unit + 4 * unit}
          height={2 * PLUS_R * unit + 4 * unit}
          viewBox="-10 -10 20 20"
          pointerEvents="none">
          <Circle
            r={PLUS_R}
            fill={colors.surface}
            fillOpacity={0.85}
            stroke={colors.accent}
            strokeWidth={1.5}
            strokeDasharray="2 2"
          />
          <SvgText
            x={0}
            y={4}
            textAnchor="middle"
            fontSize={12}
            fontWeight="700"
            fill={colors.accent}>
            +
          </SvgText>
        </Svg>
      </View>
    </GestureDetector>
  );
}

const dot = (dia, unit, border, color = colors.accent) => ({
  width: dia,
  height: dia,
  borderRadius: dia / 2,
  backgroundColor: colors.surface,
  borderWidth: border * unit,
  borderColor: color,
});

function Pill({ cx, cy, text, unit }) {
  const w = PILL_W * unit;
  const h = 16 * unit;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.abs,
        styles.center,
        { left: cx - w / 2, top: cy - h / 2, width: w, height: h },
      ]}>
      <View
        style={{
          height: h,
          paddingHorizontal: 8 * unit,
          borderRadius: h / 2,
          backgroundColor: colors.text,
          justifyContent: 'center',
        }}>
        <Text
          style={{ fontFamily: 'InstrumentSans_600SemiBold', fontSize: 10 * unit, color: '#fff' }}>
          {text}
        </Text>
      </View>
    </View>
  );
}

// The pill being typed into (ticket 113, PlanCote artboard): a dark pill with a
// white field and "m". Enter validates; the sheet shows the result.
function EditPill({ cx, cy, text, unit, onChange, onSubmit, label }) {
  const w = 124 * unit;
  const h = 36 * unit;
  return (
    <View
      style={[
        styles.abs,
        styles.center,
        { left: cx - w / 2, top: cy - h / 2, width: w, height: h },
      ]}>
      <View
        style={{
          height: h,
          paddingHorizontal: 4 * unit,
          borderRadius: h / 2,
          backgroundColor: colors.text,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4 * unit,
        }}>
        <TextInput
          value={text}
          onChangeText={onChange}
          onSubmitEditing={onSubmit}
          autoFocus
          selectTextOnFocus
          keyboardType="decimal-pad"
          inputMode="decimal"
          returnKeyType="done"
          blurOnSubmit={false}
          accessibilityLabel={label}
          testID="plan-side-input"
          style={{
            width: 60 * unit,
            height: 28 * unit,
            paddingVertical: 0,
            paddingHorizontal: 0,
            borderRadius: 14 * unit,
            backgroundColor: '#fff',
            color: colors.text,
            fontSize: 15 * unit,
            fontFamily: 'InstrumentSans_600SemiBold',
            textAlign: 'center',
          }}
        />
        <Text
          style={{
            fontFamily: 'InstrumentSans_600SemiBold',
            fontSize: 13 * unit,
            color: colors.background,
          }}>
          m
        </Text>
      </View>
    </View>
  );
}

// The snapping target (ticket 114, PlanAimantation artboard): an orange dashed
// ring with a pill "Sommet" / "Côté" / "Bord" above it.
function SnapMarker({ cx, cy, kind, unit }) {
  const ring = 26 * unit;
  const pillW = 64 * unit;
  const pillH = 18 * unit;
  return (
    <View pointerEvents="none">
      <View
        testID="plan-snap-marker"
        accessibilityLabel={SNAP_KIND_LABELS[kind]}
        style={[
          styles.abs,
          {
            left: cx - ring / 2,
            top: cy - ring / 2,
            width: ring,
            height: ring,
            borderRadius: ring / 2,
            borderWidth: 2 * unit,
            borderStyle: 'dashed',
            borderColor: colors.terracotta,
          },
        ]}
      />
      <View
        style={[
          styles.abs,
          styles.center,
          {
            left: cx - pillW / 2,
            top: cy - ring / 2 - pillH - 4 * unit,
            width: pillW,
            height: pillH,
          },
        ]}>
        <View
          style={{
            height: pillH,
            paddingHorizontal: 8 * unit,
            borderRadius: pillH / 2,
            backgroundColor: colors.terracotta,
            justifyContent: 'center',
          }}>
          <Text
            style={{
              fontFamily: 'InstrumentSans_600SemiBold',
              fontSize: 10 * unit,
              color: '#fff',
            }}>
            {SNAP_KIND_LABELS[kind]}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function DraftLayer({
  draft,
  plan,
  drawScale,
  unit,
  pad,
  drag,
  sideEdit,
  marker = null,
  scalePxPerCm = 1,
  ringIndex = null,
  onCornerLongPress,
}) {
  const { kind, polygon, closed } = draft;
  // A rectangle only exists once "Poser sur le plan" was pressed. A garden
  // element (ticket 110) is a rectangle too while new, then has corner handles.
  const isRect = kind === 'rect' || kind === 'element';
  const hasHandles = kind === 'edit' || kind === 'feature';
  if (isRect && polygon.length === 0) return null;
  const px = ([x, y]) => ({ x: pad + x * drawScale, y: pad + y * drawScale });
  const local = (point) => `${point[0] * drawScale},${point[1] * drawScale}`;
  // Ticket 113: every side of an edited shape has a pill, and so do the sides traced so far.
  const sides = isRect ? [] : sideLengths(polygon, hasHandles || closed);
  const editing = draft.side ?? null;
  const preview = draft.sidePreview ?? null;
  const filled = isRect || closed;
  const look = featureLook(draft.featureKind);
  const strokeW = 2 * unit;
  // Ticket 117: pills of an edited shape sit clear of the "+" at each midpoint.
  const pillOffset = (hasHandles ? PILL_OFFSET_EDIT_PX : PILL_OFFSET_PX) * unit;

  let bounds = null;
  if (isRect || hasHandles) {
    const xs = polygon.map((p) => p[0]);
    const ys = polygon.map((p) => p[1]);
    bounds = {
      left: pad + Math.min(...xs) * drawScale,
      top: pad + Math.min(...ys) * drawScale,
      width: (Math.max(...xs) - Math.min(...xs)) * drawScale,
      height: (Math.max(...ys) - Math.min(...ys)) * drawScale,
    };
  }

  return (
    <>
      {!hasHandles ? (
        <View pointerEvents="none" style={[styles.abs, { left: pad, top: pad }]}>
          <Svg
            width={plan.widthCm * drawScale}
            height={plan.lengthCm * drawScale}
            pointerEvents="none">
            {filled ? (
              <Polygon
                points={polygon.map(local).join(' ')}
                fill={kind === 'element' ? look.fill : colors.highlight}
                fillOpacity={kind === 'element' ? 0.8 : 0.7}
                stroke={kind === 'element' ? colors.text : colors.accent}
                strokeWidth={strokeW}
                strokeDasharray={isRect ? [5 * unit, 4 * unit] : undefined}
              />
            ) : (
              <>
                {polygon.length > 1 ? (
                  <Polyline
                    points={polygon.map(local).join(' ')}
                    fill="none"
                    stroke={colors.accent}
                    strokeWidth={strokeW}
                  />
                ) : null}
                {polygon.length > 2 ? (
                  <Line
                    x1={polygon[polygon.length - 1][0] * drawScale}
                    y1={polygon[polygon.length - 1][1] * drawScale}
                    x2={polygon[0][0] * drawScale}
                    y2={polygon[0][1] * drawScale}
                    stroke={colors.accent}
                    strokeWidth={1.5 * unit}
                    strokeDasharray={[4 * unit, 4 * unit]}
                  />
                ) : null}
              </>
            )}
          </Svg>
        </View>
      ) : null}

      {preview ? (
        <View pointerEvents="none" style={[styles.abs, { left: pad, top: pad }]}>
          <Svg
            width={plan.widthCm * drawScale}
            height={plan.lengthCm * drawScale}
            pointerEvents="none">
            {closed || hasHandles ? (
              <Polygon
                points={preview.map(local).join(' ')}
                fill={colors.highlight}
                fillOpacity={0.35}
                stroke={colors.accent}
                strokeWidth={strokeW}
                strokeDasharray={[5 * unit, 4 * unit]}
              />
            ) : (
              <Polyline
                points={preview.map(local).join(' ')}
                fill="none"
                stroke={colors.accent}
                strokeWidth={strokeW}
                strokeDasharray={[5 * unit, 4 * unit]}
              />
            )}
          </Svg>
        </View>
      ) : null}

      {bounds && hasHandles ? (
        <ShapeArea
          bounds={bounds}
          drag={drag}
          contains={(x, y) =>
            pointInPolygon([(x - pad) / drawScale, (y - pad) / drawScale], polygon)
          }
        />
      ) : null}

      {bounds && isRect ? (
        <GestureDetector gesture={panGesture('shape', 0, drag)}>
          <View
            collapsable={false}
            accessibilityRole="button"
            accessibilityLabel="Rectangle à déplacer"
            style={[styles.abs, bounds]}
          />
        </GestureDetector>
      ) : null}

      {kind === 'trace'
        ? polygon.map((corner, i) => {
            const at = px(corner);
            const dia = 14 * unit;
            return (
              <View
                key={i}
                pointerEvents="none"
                style={[
                  styles.abs,
                  dot(dia, unit, 2.5),
                  { left: at.x - dia / 2, top: at.y - dia / 2 },
                ]}
              />
            );
          })
        : null}

      {sides.map((side) => {
        const at = px([side.mid.x, side.mid.y]);
        if (editing && editing.index === side.index) {
          return (
            <EditPill
              key={side.index}
              cx={at.x + side.normal.x * pillOffset}
              cy={at.y + side.normal.y * pillOffset}
              text={editing.text}
              unit={unit}
              onChange={sideEdit?.onChange}
              onSubmit={sideEdit?.onSubmit}
              label={`Longueur du côté ${editing.name}, en mètres`}
            />
          );
        }
        return (
          <Pill
            key={side.index}
            cx={at.x + side.normal.x * pillOffset}
            cy={at.y + side.normal.y * pillOffset}
            text={side.text}
            unit={unit}
          />
        );
      })}

      {hasHandles && !draft.side
        ? sides
            .filter((side) => side.lengthCm * scalePxPerCm >= PLUS_MIN_SIDE_PX)
            .map((side) => {
              const at = px([side.mid.x, side.mid.y]);
              return (
                <PlusHandle
                  key={`plus-${side.index}`}
                  cx={at.x}
                  cy={at.y}
                  index={side.index}
                  unit={unit}
                  drag={drag}
                />
              );
            })
        : null}

      {hasHandles
        ? polygon.map((corner, i) => {
            const at = px(corner);
            return (
              <Handle
                key={i}
                cx={at.x}
                cy={at.y}
                index={i}
                unit={unit}
                drag={drag}
                onLongPress={onCornerLongPress}
                color={kind === 'feature' ? colors.text : colors.accent}
              />
            );
          })
        : null}

      {hasHandles && ringIndex != null && polygon[ringIndex] ? (
        <View
          pointerEvents="none"
          testID="plan-corner-ring"
          style={[
            styles.abs,
            {
              left: px(polygon[ringIndex]).x - 16 * unit,
              top: px(polygon[ringIndex]).y - 16 * unit,
              width: 32 * unit,
              height: 32 * unit,
              borderRadius: 16 * unit,
              borderWidth: 2 * unit,
              borderColor: colors.danger,
            },
          ]}
        />
      ) : null}

      {marker ? (
        <SnapMarker
          cx={pad + marker.x * drawScale}
          cy={pad + marker.y * drawScale}
          kind={marker.kind}
          unit={unit}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
