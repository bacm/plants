// The full-width, 56pt call-to-action button used to save a form. Shows a
// small spinner and the loading label while `loading` is true, and dims
// itself (without being pressable) when disabled or loading.
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, typography, radius } from '../../lib/theme';

export function PrimaryButton({ label, onPress, disabled, loading, loadingLabel }) {
  const inactive = disabled || loading;

  return (
    <TouchableOpacity
      style={[styles.button, inactive && styles.buttonInactive]}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={loading ? loadingLabel || label : label}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}>
      {loading ? <ActivityIndicator color="#fff" style={styles.spinner} /> : null}
      <Text style={styles.label}>{loading ? loadingLabel || label : label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonInactive: { opacity: 0.5 },
  spinner: { marginRight: 8 },
  label: { ...typography.title, fontSize: 16, color: '#fff' },
});
