// A password input with its "show" eye button in a separate box beside it
// (ticket 101, per the Connexion / Inscription mock-ups). Extra props pass
// through to the TextInput, like Field.
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from '../Icon';
import { Field } from './Field';
import { colors, spacing, typography, radius } from '../../lib/theme';

export function PasswordField({ label, hint, error, ...inputProps }) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <View style={styles.inputCol}>
          <Field
            secureTextEntry={!visible}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={label}
            style={error ? styles.inputError : undefined}
            {...inputProps}
          />
        </View>
        <TouchableOpacity
          style={styles.eye}
          onPress={() => setVisible((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
          <Icon name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.text} />
        </TouchableOpacity>
      </View>
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hintText}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: { ...typography.label, fontFamily: 'InstrumentSans_600SemiBold', color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  inputCol: { flex: 1, flexBasis: 'auto', minWidth: 0 },
  eye: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputError: { borderColor: colors.danger },
  errorText: { ...typography.caption, color: colors.danger },
  hintText: { ...typography.caption, color: colors.textSecondary },
});
