// The bottom bars and sheets of the zone drawing modes (ticket 107; PlanTracer,
// PlanRectangle and PlanModifierZone artboards). They hold no state of their
// own: app/plan/index.js owns it and passes values and callbacks.
import {
  View,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { Field } from '../form';
import Icon from '../Icon';
import { colors, spacing, radius, shadow } from '../../lib/theme';
import { PLAN_FEATURE_KINDS } from '../../lib/enums';

const FONT_BOLD = 'InstrumentSans_600SemiBold';
const FONT_MEDIUM = 'InstrumentSans_500Medium';
const FONT_BODY = 'InstrumentSans_400Regular';

export const NEW_ZONE = 'new';

function Sheet({ onLayout, sheetStyle, children }) {
  return (
    <KeyboardAvoidingView
      style={styles.keyboard}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      pointerEvents="box-none">
      <View style={[styles.sheet, sheetStyle]} onLayout={onLayout}>
        {children}
      </View>
    </KeyboardAvoidingView>
  );
}

function Button({ label, onPress, kind = 'outline', disabled, style, testID }) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[
        styles.button,
        kind === 'primary' ? styles.primary : styles.outline,
        style,
        disabled && styles.disabled,
      ]}>
      <Text
        style={[
          styles.buttonText,
          kind === 'primary' && styles.primaryText,
          kind === 'danger' && styles.dangerText,
        ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** "Pour quelle zone ?": the zones without an outline, "+ Nouvelle zone", and the name of a new one. */
export function ZoneChooser({ zones, value, onChange, newName, onNewName, nameError }) {
  return (
    <View style={styles.chooser}>
      <Text style={styles.label}>Pour quelle zone ?</Text>
      <View style={styles.chips}>
        {zones.map((zone) => (
          <Chip
            key={zone.id}
            label={zone.name}
            selected={value === zone.id}
            onPress={() => onChange(zone.id)}
          />
        ))}
        <Chip
          label="+ Nouvelle zone"
          selected={value === NEW_ZONE}
          onPress={() => onChange(NEW_ZONE)}
        />
      </View>
      {value === NEW_ZONE ? (
        <Field
          placeholder="ex. Massif nord, Balcon"
          value={newName}
          onChangeText={onNewName}
          error={nameError}
          accessibilityLabel="Nom de la nouvelle zone"
          autoFocus={false}
        />
      ) : null}
      <Text style={styles.hint}>Seules les zones sans tracé sont proposées.</Text>
    </View>
  );
}

function Chip({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Finger mode: the bar under the plan while corners are being tapped. */
export function TraceBar({ canUndo, canFinish, onRectangle, onUndo, onFinish, onLayout }) {
  return (
    <Sheet onLayout={onLayout} sheetStyle={styles.bar}>
      <View style={styles.row}>
        <Button label="Rectangle par cotes" onPress={onRectangle} style={styles.flex} />
        <Button
          label="Retirer le dernier coin"
          onPress={onUndo}
          disabled={!canUndo}
          style={styles.flex}
        />
      </View>
      <Button
        label="Terminer la zone"
        kind="primary"
        onPress={onFinish}
        disabled={!canFinish}
        style={styles.tall}
      />
    </Sheet>
  );
}

/** Finger mode, once the shape is closed: choose the zone, then save. */
export function FinishSheet({ areaText, chooser, onSave, onBack, saving, onLayout }) {
  return (
    <Sheet onLayout={onLayout}>
      <View style={styles.grip} />
      <Text style={styles.title}>Zone tracée</Text>
      <ZoneChooser {...chooser} />
      <Text style={styles.note}>{areaText}</Text>
      <Button
        label="Enregistrer la zone"
        kind="primary"
        onPress={onSave}
        disabled={saving}
        style={styles.tall}
      />
      <Button label="Revenir au tracé" onPress={onBack} />
    </Sheet>
  );
}

/** "Rectangle par cotes": the dimensions, the zone, then place and drag. */
export function RectangleSheet({
  width,
  length,
  onWidth,
  onLength,
  widthError,
  lengthError,
  chooser,
  note,
  placed,
  saving,
  onPlace,
  onFinish,
  onLayout,
}) {
  return (
    <Sheet onLayout={onLayout}>
      <View style={styles.grip} />
      <Text style={styles.title}>Zone en rectangle</Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field
            label="Largeur (m)"
            value={width}
            onChangeText={onWidth}
            error={widthError}
            keyboardType="decimal-pad"
            inputMode="decimal"
          />
        </View>
        <View style={styles.flex}>
          <Field
            label="Longueur (m)"
            value={length}
            onChangeText={onLength}
            error={lengthError}
            keyboardType="decimal-pad"
            inputMode="decimal"
          />
        </View>
      </View>
      <ZoneChooser {...chooser} />
      <Text style={styles.note}>{note}</Text>
      {placed ? (
        <Button
          label="Terminer"
          kind="primary"
          onPress={onFinish}
          disabled={saving}
          style={styles.tall}
        />
      ) : (
        <Button label="Poser sur le plan" kind="primary" onPress={onPlace} style={styles.tall} />
      )}
    </Sheet>
  );
}

/** Editing a zone: its name and area, erase the outline, or finish. */
export function EditSheet({ name, areaText, onErase, onFinish, saving, onLayout }) {
  return (
    <Sheet onLayout={onLayout} sheetStyle={styles.edit}>
      <View style={styles.nameRow}>
        <Text style={styles.editName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.editArea}>{areaText}</Text>
      </View>
      <Text style={styles.editHint}>Glissez un coin pour le déplacer.</Text>
      <View style={styles.row}>
        <Button
          label="Effacer le tracé"
          kind="danger"
          onPress={onErase}
          style={[styles.flex, styles.mid]}
        />
        <Button
          label="Terminer"
          kind="primary"
          onPress={onFinish}
          disabled={saving}
          style={[styles.flex, styles.mid]}
        />
      </View>
    </Sheet>
  );
}

/** The kinds of garden element, a single choice. */
function KindChips({ value, onChange }) {
  return (
    <View style={styles.chips}>
      {PLAN_FEATURE_KINDS.map((kind) => (
        <Chip
          key={kind.value}
          label={kind.label}
          selected={value === kind.value}
          onPress={() => onChange(kind.value)}
        />
      ))}
    </View>
  );
}

function ChoiceRow({ icon, tint, title, text, onPress, testID }) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={styles.choice}>
      <View style={[styles.choiceIcon, { backgroundColor: tint }]}>
        <Icon name={icon} size={20} color={colors.text} />
      </View>
      <View style={styles.choiceText}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceBody}>{text}</Text>
      </View>
    </TouchableOpacity>
  );
}

/** "Ajouter au plan" (ticket 110, PlanAjouter artboard): a zone, or a garden element. */
export function AddSheet({ onZone, onElement, onLayout }) {
  return (
    <Sheet onLayout={onLayout}>
      <View style={styles.grip} />
      <Text style={styles.title}>Ajouter au plan</Text>
      <ChoiceRow
        icon="sprout-outline"
        tint={colors.planZoneFills[0]}
        title="Une zone de plantes"
        text="Massif, bordure, potager… Les plantes posées dedans y sont rangées."
        onPress={onZone}
      />
      <ChoiceRow
        icon="home-outline"
        tint={colors.planFeatures.house.fill}
        title="Un élément du jardin"
        text="Maison, abri, terrasse, allée, bassin… Seulement sur le plan, sans plantes."
        onPress={onElement}
      />
    </Sheet>
  );
}

/** A new element (PlanElement artboard): type, optional name, width x length, then "Terminer". */
export function ElementSheet({
  kind,
  onKind,
  label,
  onLabel,
  width,
  length,
  onWidth,
  onLength,
  widthError,
  lengthError,
  note,
  saving,
  onFinish,
  onLayout,
}) {
  return (
    <Sheet onLayout={onLayout}>
      <View style={styles.grip} />
      <Text style={styles.title}>Élément du jardin</Text>
      <KindChips value={kind} onChange={onKind} />
      <Field
        label="Nom (facultatif)"
        value={label}
        onChangeText={onLabel}
        maxLength={60}
        autoFocus={false}
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field
            label="Largeur (m)"
            value={width}
            onChangeText={onWidth}
            error={widthError}
            keyboardType="decimal-pad"
            inputMode="decimal"
          />
        </View>
        <View style={styles.flex}>
          <Field
            label="Longueur (m)"
            value={length}
            onChangeText={onLength}
            error={lengthError}
            keyboardType="decimal-pad"
            inputMode="decimal"
          />
        </View>
      </View>
      <Text style={styles.note}>{note}</Text>
      <Button
        label="Terminer"
        kind="primary"
        onPress={onFinish}
        disabled={saving}
        style={styles.tall}
      />
    </Sheet>
  );
}

/** Editing an element (PlanElementModifier artboard). "Type et nom" opens the chips and the name inline. */
export function FeatureEditSheet({
  title,
  areaText,
  hint,
  kind,
  onKind,
  label,
  onLabel,
  detailsOpen,
  onToggleDetails,
  onDelete,
  onFinish,
  saving,
  onLayout,
}) {
  return (
    <Sheet onLayout={onLayout} sheetStyle={styles.edit}>
      <View style={styles.nameRow}>
        <Text style={styles.editName} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.editArea}>{areaText}</Text>
      </View>
      {detailsOpen ? (
        <>
          <KindChips value={kind} onChange={onKind} />
          <Field
            label="Nom (facultatif)"
            value={label}
            onChangeText={onLabel}
            maxLength={60}
            autoFocus={false}
          />
        </>
      ) : (
        <Text style={styles.editHint}>{hint}</Text>
      )}
      <View style={styles.row}>
        <Button
          label="Supprimer"
          kind="danger"
          onPress={onDelete}
          style={[styles.flex, styles.mid]}
        />
        <Button label="Type et nom" onPress={onToggleDetails} style={[styles.flex, styles.mid]} />
        <Button
          label="Terminer"
          kind="primary"
          onPress={onFinish}
          disabled={saving}
          style={[styles.flex, styles.mid]}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  keyboard: {},
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  choiceIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: { flex: 1, gap: 2 },
  choiceTitle: { fontFamily: FONT_BOLD, fontSize: 16, color: colors.text },
  choiceBody: { fontFamily: FONT_BODY, fontSize: 13, color: colors.textSecondary },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: 10,
    paddingHorizontal: spacing.lg - 4,
    paddingBottom: 28,
    gap: 14,
    ...shadow.soft,
  },
  bar: {
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.track,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingTop: 12,
    paddingBottom: 30,
    gap: 10,
  },
  edit: { paddingTop: 16, paddingBottom: 30, gap: 12 },
  grip: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
  },
  title: { fontFamily: 'Fraunces_400Regular', fontSize: 22, color: colors.text },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  button: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  tall: { height: 56, borderRadius: 28 },
  mid: { height: 52, borderRadius: 26 },
  outline: { borderWidth: 1.5, borderColor: colors.planGridMajor },
  primary: { backgroundColor: colors.accent },
  disabled: { opacity: 0.4 },
  buttonText: { fontFamily: FONT_BOLD, fontSize: 14, color: colors.text, textAlign: 'center' },
  primaryText: { fontSize: 16, color: '#fff' },
  dangerText: { fontSize: 15, color: colors.danger },
  chooser: { gap: 6 },
  label: { fontFamily: FONT_BOLD, fontSize: 13, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { fontFamily: FONT_MEDIUM, fontSize: 14, color: colors.text },
  chipTextSelected: { color: colors.background },
  hint: { fontFamily: FONT_BODY, fontSize: 12, color: colors.textSecondary },
  note: { fontFamily: FONT_BODY, fontSize: 13, color: colors.textSecondary },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
  },
  editName: { flexShrink: 1, fontFamily: FONT_BOLD, fontSize: 17, color: colors.text },
  editArea: { fontFamily: FONT_BODY, fontSize: 14, color: colors.textSecondary },
  editHint: { fontFamily: FONT_BODY, fontSize: 14, color: colors.textSecondary },
});
