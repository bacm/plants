// A photo you can zoom (ticket 086), shared by the full-screen viewers: the
// plant detail's lightbox and the "À trier" screen. Pinch zooms around the
// fingers up to MAX_SCALE, a one-finger drag pans the zoomed photo, a double
// tap toggles between the whole photo and DOUBLE_TAP_SCALE. Letting go below
// 1× springs back to the whole photo.
//
// The one-finger pan only runs while zoomed, so at 1× a horizontal swipe is
// left to a surrounding pager (components/PhotoPager.js), which
// `onZoomChange` tells to stop paging while the photo is zoomed.
//
// It carries its own GestureHandlerRootView: on Android a <Modal> renders
// outside the app's root view, where gestures would otherwise never fire.
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

// At scale `s` the photo overflows its box by (s - 1) * size / 2 on each
// side; a translation past that would drag an edge into the middle.
function clamp(value, s, size) {
  'worklet';
  const max = Math.max(0, ((s - 1) * size) / 2);
  return Math.min(max, Math.max(-max, value));
}

export function ZoomableImage({ uri, style, accessibilityLabel, onZoomChange }) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [zoomed, setZoomed] = useState(false);
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const start = useSharedValue({ scale: 1, tx: 0, ty: 0, fx: 0, fy: 0 });

  const { width, height } = box;

  const reportZoom = (next) => {
    setZoomed(next);
    onZoomChange?.(next);
  };

  // Translations are relative to the box's centre; so are focal points once
  // shifted by half the box. Keeping the photo point under the fingers fixed:
  // t = f - (f0 - t0) * s / s0.
  const pinch = Gesture.Pinch()
    .onStart((e) => {
      start.value = {
        scale: scale.value,
        tx: tx.value,
        ty: ty.value,
        fx: e.focalX - width / 2,
        fy: e.focalY - height / 2,
      };
    })
    .onUpdate((e) => {
      const s0 = start.value;
      const next = Math.min(MAX_SCALE, Math.max(0.5, s0.scale * e.scale));
      const fx = e.focalX - width / 2;
      const fy = e.focalY - height / 2;
      scale.value = next;
      tx.value = fx - ((s0.fx - s0.tx) * next) / s0.scale;
      ty.value = fy - ((s0.fy - s0.ty) * next) / s0.scale;
    })
    .onEnd(() => {
      if (scale.value <= 1) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        scheduleOnRN(reportZoom, false);
        return;
      }
      scheduleOnRN(reportZoom, true);
      tx.value = withTiming(clamp(tx.value, scale.value, width));
      ty.value = withTiming(clamp(ty.value, scale.value, height));
    });

  const pan = Gesture.Pan()
    .enabled(zoomed)
    .maxPointers(1)
    .onStart(() => {
      start.value = { ...start.value, tx: tx.value, ty: ty.value };
    })
    .onUpdate((e) => {
      tx.value = clamp(start.value.tx + e.translationX, scale.value, width);
      ty.value = clamp(start.value.ty + e.translationY, scale.value, height);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        scheduleOnRN(reportZoom, false);
        return;
      }
      scheduleOnRN(reportZoom, true);
      const fx = e.x - width / 2;
      const fy = e.y - height / 2;
      scale.value = withTiming(DOUBLE_TAP_SCALE);
      tx.value = withTiming(clamp(fx * (1 - DOUBLE_TAP_SCALE), DOUBLE_TAP_SCALE, width));
      ty.value = withTiming(clamp(fy * (1 - DOUBLE_TAP_SCALE), DOUBLE_TAP_SCALE, height));
    });

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureHandlerRootView style={[styles.box, style]}>
      <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
        <Animated.View
          style={styles.box}
          collapsable={false}
          onLayout={(e) => setBox(e.nativeEvent.layout)}>
          <Animated.Image
            source={{ uri }}
            style={[styles.image, imageStyle]}
            resizeMode="contain"
            accessibilityLabel={accessibilityLabel}
          />
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
});
