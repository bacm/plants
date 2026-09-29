// A labelled text input: label above a rounded surface input, an optional
// hint below, or an error message (and a red border) in its place. Every
// prop besides label/required/error/hint/leading passes straight through to
// TextInput, so screens use it exactly like a TextInput with a label.
// `leading` renders a node (e.g. an icon or a colour dot) inside the input
// box, left of the text, by wrapping the box in a row and dropping the
// TextInput's own border.
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, spacing, typography, radius } from '../../lib/theme';

export function Field({ label, required, error, hint, leading, style, ...inputProps }) {
  return (
    <View style={styles.container}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? ' *' : ''}
        </Text>
      ) : null}
      {leading ? (
        <View style={[styles.inputRow, error && styles.inputError]}>
          {leading}
          <TextInput
            style={[styles.input, styles.inputBorderless, style]}
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel={label}
            {...inputProps}
          />
        </View>
      ) : (
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
      )}
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  inputBorderless: {
    flex: 1,
    borderWidth: 0,
    minHeight: undefined,
    paddingHorizontal: 0,
  },
  errorText: { ...typography.caption, color: colors.danger },
  hintText: { ...typography.caption, color: colors.textSecondary },
});
