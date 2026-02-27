import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radius, shadow } from '../lib/theme';

export function GlassCard({ children, style, intensity = 40 }) {
  return (
    <View style={[styles.outer, style]}>
      {Platform.OS === 'ios' ? (
        <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={[styles.inner, Platform.OS !== 'ios' && styles.innerAndroid]}>
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
    backgroundColor: Platform.OS === 'ios' ? colors.dark.surfaceGlass : colors.dark.surface,
    borderRadius: radius.xl,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  innerAndroid: {
    backgroundColor: 'rgba(41,37,36,0.95)',
  },
});
