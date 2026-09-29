// The plant form shared by app/plant/new.js and app/plant/edit.js: same
// fields, search, validation and save flow for both screens. Only the
// title, initial values and what onSubmit actually does (create vs update,
// then navigate) differ between them.
import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation,
  UIManager,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showMessage } from '../lib/dialogs';
import { ScreenHeader } from './ScreenHeader';
import Icon from './Icon';
import {
  Field,
  ChipGroup,
  ChoiceTiles,
  MonthRangePicker,
  FormSection,
  PrimaryButton,
  Segmented,
  StickyFooter,
} from './form';
import { colors, spacing, typography, radius, colorHex, shadow } from '../lib/theme';
import { getZones } from '../lib/db';
import {
  PLANT_TYPES,
  SUN,
  WATER,
  SOIL_TYPES,
  SOIL_PH,
  PROPAGATION,
  TOXICITY,
  FOLIAGE,
  isUnknown,
} from '../lib/enums';
import { searchPlants, normalizeToForm, PlantSearchError } from '../lib/plantSearch';
import { formToPlantValues } from '../lib/plantFields';
import { validatePlantForm } from '../lib/validation';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FLOWERING_OPTIONS = [
  { value: false, label: 'Oui' },
  { value: true, label: 'Non applicable' },
];

// Month fields are strings in the form ('' or '5') because they feed a
// TextInput-backed Field elsewhere; MonthRangePicker wants numbers/null.
const toMonth = (t) => (t ? Number(t) : null);
const fromMonth = (n) => (n == null ? '' : String(n));

export function PlantForm({
  title,
  initialForm,
  initialShowMore = false,
  preselectZoneId,
  autoFocusName,
  onSubmit,
  onDelete,
}) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [showMore, setShowMore] = useState(initialShowMore);
  const [zones, setZones] = useState([]);
  const [preselectedZone, setPreselectedZone] = useState(false);
  const [noFlowering, setNoFlowering] = useState(
    () => !!initialForm.name && !(initialForm.bloomStartMonth && initialForm.bloomEndMonth)
  );

  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [lastSearchPrecise, setLastSearchPrecise] = useState(false);

  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  useFocusEffect(
    useCallback(() => {
      getZones().then(setZones);
    }, [])
  );

  useEffect(() => {
    if (preselectedZone || !preselectZoneId || zones.length === 0) return;
    if (zones.some((z) => z.id === preselectZoneId)) {
      setField('zoneId', preselectZoneId);
    }
    setPreselectedZone(true);
  }, [preselectZoneId, zones, preselectedZone]);

  const handleSearch = async ({ precise = false } = {}) => {
    if (form.name.trim().length < 2) return;

    setSearching(true);
    setShowSuggestions(true);
    setSearchError('');
    try {
      const results = await searchPlants(form.name, { precise });
      setSuggestions(results);
      setLastSearchPrecise(precise);
    } catch (err) {
      setSuggestions([]);
      if (err instanceof PlantSearchError) {
        setSearchError(err.message);
      } else {
        console.error('Unexpected search error:', err);
        setSearchError('Recherche impossible pour le moment');
      }
    } finally {
      setSearching(false);
    }
  };

  const handleSelectSuggestion = (plant) => {
    const formData = normalizeToForm(plant);
    const hasBloom = !!formData.bloomStartMonth && !!formData.bloomEndMonth;
    setForm((f) => ({ ...f, ...formData }));
    setNoFlowering(!hasBloom);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleNameChange = (text) => {
    setField('name', text);
    setSearchError('');
  };

  const toggleMore = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowMore((v) => !v);
  };

  const setFlowering = (nonApplicable) => {
    setNoFlowering(nonApplicable);
    setField('bloomStartMonth', '');
    setField('bloomEndMonth', '');
  };

  const save = async () => {
    if (!form.name.trim()) return;
    const validationErrors = validatePlantForm(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setShowMore(true);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await onSubmit(formToPlantValues(form));
    } catch (e) {
      showMessage('Erreur', `Impossible d'enregistrer : ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12 }]}
        keyboardShouldPersistTaps="handled">
        <ScreenHeader title={title} />

        <View style={styles.nameBlock}>
          <View style={styles.nameRow}>
            <View style={styles.nameField}>
              <Field
                label="Nom de la plante"
                required
                placeholder="ex. Rosier grimpant"
                value={form.name}
                onChangeText={handleNameChange}
                onSubmitEditing={() => handleSearch()}
                autoFocus={autoFocusName}
              />
            </View>
            <TouchableOpacity
              style={styles.searchButton}
              onPress={() => handleSearch()}
              disabled={searching || form.name.trim().length < 2}
              accessibilityLabel="Rechercher en ligne">
              {searching ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Icon name="magnify" size={20} color={colors.background} />
              )}
            </TouchableOpacity>
          </View>
          {searchError ? <Text style={styles.fieldError}>{searchError}</Text> : null}

          {showSuggestions && !searching && !searchError && (
            <View style={styles.suggestionsCard}>
              <Text style={styles.suggestionsEyebrow}>Résultats en ligne</Text>
              {suggestions.length === 0 && (
                <Text style={styles.suggestionLatin}>Aucun résultat</Text>
              )}
              {suggestions.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.suggestionItem}
                  onPress={() => handleSelectSuggestion(item)}>
                  <Text style={styles.suggestionName}>{item.common_name}</Text>
                  <Text style={styles.suggestionLatin}>{item.scientific_name}</Text>
                </TouchableOpacity>
              ))}
              {!lastSearchPrecise && (
                <TouchableOpacity
                  style={styles.deepSearchLink}
                  onPress={() => handleSearch({ precise: true })}
                  accessibilityRole="button"
                  accessibilityLabel="Recherche approfondie">
                  <Text style={styles.deepSearchText}>
                    Pas la bonne plante ? Recherche approfondie
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <Field
          label="Nom latin"
          placeholder="Facultatif"
          value={form.latinName}
          onChangeText={(v) => setField('latinName', v)}
        />

        {zones.length > 0 && (
          <ChipGroup
            scroll
            label="Zone"
            options={[
              { value: '', label: 'Aucune' },
              ...zones.map((z) => ({ value: z.id, label: z.name })),
            ]}
            value={form.zoneId ?? ''}
            allowClear={false}
            onChange={(v) => setField('zoneId', v || null)}
          />
        )}

        <ChipGroup
          scroll
          label="Type"
          options={PLANT_TYPES}
          value={form.type}
          onChange={(v) => setField('type', v)}
        />

        <ChoiceTiles
          label="Exposition"
          columns={3}
          options={SUN}
          value={form.sun}
          onChange={(v) => setField('sun', v)}
        />
        <ChoiceTiles
          label="Arrosage"
          columns={3}
          options={WATER}
          value={form.water}
          onChange={(v) => setField('water', v)}
        />

        <TouchableOpacity
          style={styles.moreToggle}
          onPress={toggleMore}
          accessibilityRole="button"
          // Without an explicit label iOS reads the merged children, the
          // chevron's icon-font glyph included.
          accessibilityLabel="Plus de détails"
          accessibilityHint="Floraison, sol, entretien, santé…"
          accessibilityState={{ expanded: showMore }}>
          <View>
            <Text style={styles.moreToggleTitle}>Plus de détails</Text>
            <Text style={styles.moreToggleSubtitle}>Floraison, sol, entretien, santé…</Text>
          </View>
          <Icon
            name={showMore ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>

        {showMore && (
          <>
            <FormSection
              title="Floraison"
              action={
                <Segmented
                  compact
                  options={FLOWERING_OPTIONS}
                  value={noFlowering}
                  onChange={setFlowering}
                  accessibilityLabel="Floraison"
                />
              }>
              <Field
                label="Couleur des fleurs"
                placeholder="ex. rose, blanc"
                value={form.flowerColor}
                onChangeText={(v) => setField('flowerColor', v)}
                leading={
                  <View
                    style={[styles.colorDot, { backgroundColor: colorHex(form.flowerColor) }]}
                  />
                }
              />
              {!noFlowering && (
                <>
                  <MonthRangePicker
                    label="Période"
                    start={toMonth(form.bloomStartMonth)}
                    end={toMonth(form.bloomEndMonth)}
                    onChange={({ start, end }) => {
                      setField('bloomStartMonth', fromMonth(start));
                      setField('bloomEndMonth', fromMonth(end));
                    }}
                  />
                  {(errors.bloomStartMonth || errors.bloomEndMonth) && (
                    <Text style={styles.fieldError}>
                      {errors.bloomStartMonth || errors.bloomEndMonth}
                    </Text>
                  )}
                </>
              )}
            </FormSection>

            <FormSection title="Dimensions">
              <View style={styles.row2}>
                <View style={styles.col}>
                  <Field
                    label="Hauteur (cm)"
                    placeholder="ex. 150"
                    keyboardType="number-pad"
                    value={form.height}
                    onChangeText={(v) => setField('height', v)}
                  />
                </View>
                <View style={styles.col}>
                  <Field
                    label="Largeur (cm)"
                    placeholder="ex. 100"
                    keyboardType="number-pad"
                    value={form.width}
                    onChangeText={(v) => setField('width', v)}
                  />
                </View>
              </View>
              <View style={styles.row2}>
                <View style={styles.col}>
                  <Field
                    label="Temp. min. (°C)"
                    placeholder="ex. -10"
                    keyboardType="numbers-and-punctuation"
                    value={form.minTemperature}
                    onChangeText={(v) => setField('minTemperature', v)}
                  />
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>Feuillage</Text>
                  <Segmented
                    options={FOLIAGE}
                    allowClear
                    // 1/0 from SQLite, true/false from web or a search result.
                    value={form.deciduous == null ? null : !!form.deciduous}
                    onChange={(v) => setField('deciduous', v)}
                    accessibilityLabel="Feuillage"
                  />
                </View>
              </View>
            </FormSection>

            <FormSection title="Sol">
              <ChipGroup
                label="Type de sol"
                options={SOIL_TYPES}
                value={form.soilType}
                onChange={(v) => setField('soilType', v)}
              />
              <ChipGroup
                label="pH"
                options={SOIL_PH}
                value={form.soilPH}
                onChange={(v) => setField('soilPH', v)}
              />
            </FormSection>

            <FormSection title="Entretien">
              <View style={styles.row2}>
                <View style={styles.col}>
                  <Field
                    label="Engrais"
                    placeholder="ex. NPK 10-10-10 au printemps"
                    value={form.fertilizer}
                    onChangeText={(v) => setField('fertilizer', v)}
                  />
                </View>
                <View style={styles.col}>
                  <Field
                    label="Taille"
                    placeholder="ex. Taille de formation en fin d'hiver"
                    value={form.pruning}
                    onChangeText={(v) => setField('pruning', v)}
                  />
                </View>
              </View>
              {/* A single-month use of the range picker: start and end are always
                  the same value, so the picker always shows one filled cell, and
                  every tap replaces it (nextRange closes an already-closed range
                  by starting over) rather than building a range. */}
              <MonthRangePicker
                label="Mois de taille"
                start={form.pruningMonth}
                end={form.pruningMonth}
                onChange={({ start }) => setField('pruningMonth', start)}
              />
              <Field
                label="Entretien hivernal"
                placeholder="ex. Paillage, protection hivernale..."
                multiline
                value={form.winterCare}
                onChangeText={(v) => setField('winterCare', v)}
              />
            </FormSection>

            <FormSection title="Multiplication">
              <ChipGroup
                label="Méthode"
                options={PROPAGATION}
                value={form.propagation}
                onChange={(v) => setField('propagation', isUnknown(v) ? null : v)}
              />
            </FormSection>

            <FormSection title="Santé">
              <Field
                label="Ravageurs / maladies"
                placeholder="ex. Pucerons, oïdium..."
                multiline
                value={form.pests}
                onChangeText={(v) => setField('pests', v)}
              />
              <ChipGroup
                label="Toxicité"
                options={TOXICITY}
                value={form.toxicity}
                onChange={(v) => setField('toxicity', v)}
              />
            </FormSection>

            <FormSection title="Récolte">
              <Field
                label="Récolte"
                placeholder="ex. Fruits mûrs en été"
                value={form.harvest}
                onChangeText={(v) => setField('harvest', v)}
              />
              <MonthRangePicker
                label="Période de récolte"
                start={toMonth(form.harvestMonthStart)}
                end={toMonth(form.harvestMonthEnd)}
                onChange={({ start, end }) => {
                  setField('harvestMonthStart', fromMonth(start));
                  setField('harvestMonthEnd', fromMonth(end));
                }}
              />
              {(errors.harvestMonthStart || errors.harvestMonthEnd) && (
                <Text style={styles.fieldError}>
                  {errors.harvestMonthStart || errors.harvestMonthEnd}
                </Text>
              )}
            </FormSection>

            <FormSection title="Autres">
              <Field
                label="Plantes compagnes"
                placeholder="ex. Tomates, basilic..."
                multiline
                value={form.companionPlants}
                onChangeText={(v) => setField('companionPlants', v)}
              />
              <View style={styles.row2}>
                <View style={styles.col}>
                  <Field
                    label="Origine"
                    placeholder="ex. Méditerranée, Asie..."
                    value={form.origin}
                    onChangeText={(v) => setField('origin', v)}
                  />
                </View>
                <View style={styles.col}>
                  <Field
                    label="Date d'ajout"
                    placeholder="AAAA-MM-JJ"
                    hint="Laissez vide pour la date du jour"
                    error={errors.createdAt}
                    keyboardType="numbers-and-punctuation"
                    value={form.createdAt}
                    onChangeText={(v) => setField('createdAt', v)}
                    leading={
                      <Icon name="calendar-blank-outline" size={18} color={colors.textSecondary} />
                    }
                  />
                </View>
              </View>
              <Field
                label="Notes"
                placeholder="Notes..."
                multiline
                value={form.notes}
                onChangeText={(v) => setField('notes', v)}
              />
            </FormSection>
          </>
        )}

        {onDelete && (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={onDelete}
            accessibilityRole="button"
            accessibilityLabel="Supprimer la plante">
            <Icon name="trash-can-outline" size={20} color={colors.danger} />
            <Text style={styles.deleteBtnText}>Supprimer la plante</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <StickyFooter>
        <PrimaryButton
          label="Enregistrer"
          loadingLabel="Enregistrement…"
          loading={saving}
          disabled={!form.name.trim()}
          onPress={save}
        />
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: spacing.md,
  },
  nameBlock: { zIndex: 10, gap: spacing.xs },
  nameRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  nameField: { flex: 1 },
  searchButton: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldError: { ...typography.caption, color: colors.danger },
  suggestionsCard: {
    position: 'absolute',
    top: '100%',
    marginTop: 4,
    left: 0,
    right: 60,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 4,
    ...shadow.card,
  },
  suggestionsEyebrow: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  suggestionItem: {
    paddingVertical: 8,
  },
  suggestionName: {
    ...typography.body,
    fontFamily: 'InstrumentSans_600SemiBold',
    fontSize: 15,
    color: colors.text,
  },
  suggestionLatin: {
    fontFamily: 'Fraunces_400Regular_Italic',
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  deepSearchLink: { paddingVertical: 8, marginTop: 4 },
  deepSearchText: {
    ...typography.caption,
    fontFamily: 'InstrumentSans_600SemiBold',
    color: colors.accent,
  },
  colorDot: { width: 22, height: 22, borderRadius: 11 },
  moreToggle: {
    minHeight: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  moreToggleTitle: {
    ...typography.body,
    fontFamily: 'InstrumentSans_600SemiBold',
    fontSize: 15,
    color: colors.text,
  },
  moreToggleSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  row2: { flexDirection: 'row', gap: 10 },
  col: { flex: 1, gap: spacing.xs },
  label: { ...typography.label, color: colors.text },
  deleteBtn: {
    height: 52,
    marginTop: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.danger,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  deleteBtnText: {
    fontFamily: 'InstrumentSans_600SemiBold',
    fontSize: 15,
    color: colors.danger,
  },
});
