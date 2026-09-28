import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radius, shadow } from '../lib/theme';

export function GlassCard({ children, style, intensity = 40, noPadding }) {
  return (
    <View style={[styles.outer, style]}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={intensity} tint="light" style={StyleSheet.absoluteFill} />
      ) : null}
      <View
        style={[
          styles.inner,
          Platform.OS !== 'ios' && styles.innerAndroid,
          noPadding && styles.innerNoPadding,
        ]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadow.soft,
  },
  inner: {
    backgroundColor: Platform.OS === 'ios' ? colors.surfaceGlass : colors.surface,
    borderRadius: radius.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  innerAndroid: {
    backgroundColor: colors.surface,
  },
  innerNoPadding: {
    padding: 0,
  },
});
