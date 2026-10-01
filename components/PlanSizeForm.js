// Width and length of the garden plan, in metres (ticket 106; PlanCreer
// artboard). Used to create the plan on the first visit and, prefilled, to
// enlarge it later. The preview is drawn to scale. Validation is inline; the
// caller's `onSubmit({ widthCm, lengthCm })` may return an error message
// (refusing a size smaller than what is drawn) which is shown under the form.
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { ScreenHeader } from './ScreenHeader';
import { PlanGrid } from './plan/PlanGrid';
import { colors, spacing, typography, radius } from '../lib/theme';
import { formatSize, formatArea } from '../lib/gardenPlan';
import { parsePlanMetres } from '../lib/planView';

const PREVIEW_W = 150;
const PREVIEW_H = 250;

function metresText(cm) {
  return cm == null ? '' : String(cm / 100).replace('.', ',');
}

export function PlanSizeForm({ initial, submitLabel, onSubmit, onBack }) {
  const [width, setWidth] = useState(metresText(initial?.widthCm ?? 1500));
  const [length, setLength] = useState(metresText(initial?.lengthCm ?? 2500));
  const [submitted, setSubmitted] = useState(false);
  const [refusal, setRefusal] = useState(null);

  const w = parsePlanMetres(width);
  const l = parsePlanMetres(length);
  const valid = w.cm != null && l.cm != null;

  const submit = async () => {
    setSubmitted(true);
    setRefusal(null);
    if (!valid) return;
    const message = await onSubmit({ widthCm: w.cm, lengthCm: l.cm });
    if (message) setRefusal(message);
  };

  const preview = valid ? { widthCm: w.cm, lengthCm: l.cm } : null;
  const pxPerCm = preview ? Math.min(PREVIEW_W / preview.widthCm, PREVIEW_H / preview.lengthCm) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <ScreenHeader title="Plan du jardin" onBack={onBack} />
        <Text style={styles.intro}>
          Indiquez les dimensions de votre jardin. Vous pourrez l’agrandir plus tard.
        </Text>
        <View style={styles.row}>
          <Field
            label="Largeur (m)"
            value={width}
            onChangeText={setWidth}
            error={submitted || width !== '' ? w.error : null}
            testID="plan-width"
          />
          <Field
            label="Longueur (m)"
            value={length}
            onChangeText={setLength}
            error={submitted || length !== '' ? l.error : null}
            testID="plan-length"
          />
        </View>
        {refusal ? (
          <Text style={styles.error} accessibilityRole="alert">
            {refusal}
          </Text>
        ) : null}
        {preview ? (
          <View style={styles.previewWrap}>
            <PlanGrid plan={preview} pxPerCm={pxPerCm} accessibilityLabel="Aperçu du plan" />
            <Text style={styles.caption}>
              {formatSize(preview.widthCm, preview.lengthCm)} ·{' '}
              {formatArea((preview.widthCm * preview.lengthCm) / 10000)}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.submit}
          onPress={submit}
          accessibilityRole="button"
          accessibilityLabel={submitLabel}>
          <Text style={styles.submitText}>{submitLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Field({ label, value, onChangeText, error, testID }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        style={[styles.input, focused && styles.inputFocused, error && styles.inputError]}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="decimal-pad"
        inputMode="decimal"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: 56, paddingHorizontal: spacing.lg - 4, gap: 18 },
  intro: {
    fontFamily: 'InstrumentSans_400Regular',
    fontSize: 15,
    lineHeight: 22,
    color: colors.planInk,
  },
  row: { flexDirection: 'row', gap: 10 },
  field: { flex: 1, gap: 6 },
  label: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 13, color: colors.text },
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    ...typography.body,
    fontSize: 15,
    color: colors.text,
  },
  inputFocused: { borderWidth: 1.5, borderColor: colors.text },
  inputError: { borderColor: colors.danger },
  error: { ...typography.caption, color: colors.danger },
  previewWrap: { alignItems: 'center', gap: 8, paddingTop: 8 },
  caption: { ...typography.bodySmall, fontSize: 13, color: colors.textSecondary },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg - 4,
    paddingTop: 12,
    paddingBottom: 28,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.track,
  },
  submit: {
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 16, color: '#fff' },
});
