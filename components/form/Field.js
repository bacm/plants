// A labelled text input: label above a rounded surface input, an optional
// hint below, or an error message (and a red border) in its place. Every
// prop besides label/required/error/hint/leading/trailing passes straight
// through to TextInput, so screens use it exactly like a TextInput with a
// label. `leading`/`trailing` render a node (e.g. an icon, a colour dot or a
// unit label) inside the input box, left/right of the text, by wrapping the
// box in a row and dropping the TextInput's own border. Either one alone
// takes the row path; both can be set together (e.g. "Tous les [7] jours").
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, spacing, typography, radius } from '../../lib/theme';

export function Field({ label, required, error, hint, leading, trailing, style, ...inputProps }) {
  return (
    <View style={styles.container}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {required ? ' *' : ''}
        </Text>
      ) : null}
      {leading || trailing ? (
        <View style={[styles.inputRow, error && styles.inputError]}>
          {leading}
          <TextInput
            style={[styles.input, styles.inputBorderless, style]}
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel={label}
            {...inputProps}
          />
          {trailing}
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
  // minWidth 0: on web a TextInput keeps its intrinsic width (~20 chars) and
  // would push past the row, over whatever sits beside the Field.
  inputBorderless: {
    flex: 1,
    flexBasis: 'auto',
    minWidth: 0,
    borderWidth: 0,
    minHeight: undefined,
    paddingHorizontal: 0,
  },
  errorText: { ...typography.caption, color: colors.danger },
  hintText: { ...typography.caption, color: colors.textSecondary },
});
