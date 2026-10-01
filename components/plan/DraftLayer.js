// The outline being drawn or edited on the plan (ticket 107): its edges, the
// length pill of each side, the corners, and the touch areas that move a corner
// (edit mode) or the whole shape (rectangle mode). Drawn in the canvas's own
// coordinates, above the plants. `unit` is one screen pixel in canvas px, so
// strokes, pills and handles keep their size while the canvas is scaled.
//
// A drag is reported through `drag` ({ onStart, onMove, onEnd }, the same shape
// as a plant's): `onStart(kind, index)` with kind 'corner' or 'shape', then the
// finger's translation in screen px. The canvas turns it into a new polygon.
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Polygon, Polyline, Line } from 'react-native-svg';
import { colors } from '../../lib/theme';
import { sideLengths, PILL_OFFSET_PX } from '../../lib/zoneDraw';
import { featureLook } from '../../lib/planFeatures';

const HIT_PX = 44;
const PILL_W = 64;

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

function Handle({ cx, cy, unit, drag, index, color }) {
  const hit = HIT_PX * unit;
  const dia = 18 * unit;
  return (
    <GestureDetector gesture={panGesture('corner', index, drag)}>
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

export function DraftLayer({ draft, plan, drawScale, unit, pad, drag, sideEdit }) {
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

  let bounds = null;
  if (isRect) {
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

      {bounds ? (
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
              cx={at.x + side.normal.x * PILL_OFFSET_PX * unit}
              cy={at.y + side.normal.y * PILL_OFFSET_PX * unit}
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
            cx={at.x + side.normal.x * PILL_OFFSET_PX * unit}
            cy={at.y + side.normal.y * PILL_OFFSET_PX * unit}
            text={side.text}
            unit={unit}
          />
        );
      })}

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
                color={kind === 'feature' ? colors.text : colors.accent}
              />
            );
          })
        : null}
    </>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
