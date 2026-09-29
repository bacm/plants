// A labelled text input: label above a rounded surface input, an optional
// hint below, or an error message (and a red border) in its place. Every
// prop besides label/required/error/hint passes straight through to
// TextInput, so screens use it exactly like a TextInput with a label.
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, spacing, typography, radius } from '../../lib/theme';

export function Field({ label, required, error, hint, style, ...inputProps }) {
  return (
    <View style={styles.container}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? ' *' : ''}
        </Text>
      ) : null}
      <TextInput
        style={[
          styles.input,
          inputProps.multiline && styles.inputMultiline,
          error && styles.inputError,
          style,
        ]}
        placeholderTextColor={colors.textSecondary}
        accessibilityLabel={label}
        {...inputProps}
      />
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hintText}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { ...typography.label, color: colors.text },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  inputMultiline: {
    minHeight: 96,
    textAlignVertical: 'top',
    paddingVertical: 12,
  },
  inputError: { borderColor: colors.danger },
  errorText: { ...typography.caption, color: colors.danger },
  hintText: { ...typography.caption, color: colors.textSecondary },
});
