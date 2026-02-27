import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../lib/theme';

export function GradientHero({ children, style }) {
  return (
    <LinearGradient
      colors={[colors.dark.gradientStart, colors.dark.gradientEnd]}
      style={[styles.gradient, style]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    padding: 24,
    paddingTop: 48,
    paddingBottom: 32,
  },
});
