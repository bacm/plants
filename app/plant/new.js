import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  LayoutAnimation,
  UIManager,
  ActivityIndicator,
} from 'react-native';
import { showMessage } from '../../lib/dialogs';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { GradientHero } from '../../components/GradientHero';
import { GlassCard } from '../../components/GlassCard';
import { colors, spacing, typography, radius } from '../../lib/theme';
import { createPlant, getZones } from '../../lib/db';
import {
  PLANT_TYPES,
  SUN,
  WATER,
  SOIL_TYPES,
  SOIL_PH,
  PROPAGATION,
  TOXICITY,
  choices,
  toggleChip,
} from '../../lib/enums';
import { MONTH_SHORT } from '../../lib/months';
import { searchPlants, normalizeToForm, PlantSearchError } from '../../lib/plantSearch';
import { emptyPlantForm, formToPlantValues } from '../../lib/plantFields';
import { validatePlantForm } from '../../lib/validation';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function NewPlantScreen() {
  const router = useRouter();
  const { zoneId, returnTo } = useLocalSearchParams();
  const [zones, setZones] = useState([]);
  const [form, setForm] = useState(emptyPlantForm);
  const [errors, setErrors] = useState({});
  const [noFlowering, setNoFlowering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [preselectedZone, setPreselectedZone] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchError, setSearchError] = useState('');

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
    if (preselectedZone || !zoneId || zones.length === 0) return;
    if (zones.some((z) => z.id === zoneId)) {
      setField('zoneId', zoneId);
    }
    setPreselectedZone(true);
  }, [zoneId, zones, preselectedZone]);

  const handleSearch = async () => {
    if (searchQuery.trim().length < 2) return;

    setSearching(true);
    setShowSuggestions(true);
    setSearchError('');
    try {
      const results = await searchPlants(searchQuery);
      setSuggestions(results);
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
    setSearchQuery(text);
    setSearchError('');
  };

  const toggleMore = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowMore((v) => !v);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    const validationErrors = validatePlantForm(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const plantId = createPlant(formToPlantValues(form));
      if (returnTo === 'capture') {
        // The garden-walk camera (ticket 056) opened this screen from its
        // "+" strip item; go back there with the new plant preselected
        // instead of jumping to its detail screen.
        router.replace(`/capture?selectPlantId=${plantId}`);
      } else {
        router.replace(`/plant/${plantId}`);
      }
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
      {showSuggestions && suggestions.length > 0 && (
        <View style={styles.suggestionsOverlay}>
          {suggestions.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.suggestionItem}
              onPress={() => handleSelectSuggestion(item)}>
              <Text style={styles.suggestionName}>{item.common_name}</Text>
              <Text style={styles.suggestionLatin}>{item.scientific_name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <GradientHero>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>{'←'} Annuler</Text>
          </TouchableOpacity>
          <Text style={styles.heroTitle}>Nouvelle plante</Text>
        </GradientHero>

        {/* --- Essential fields --- */}
        <View style={styles.section}>
          <GlassCard>
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.inputName}
                value={form.name}
                onChangeText={handleNameChange}
                onSubmitEditing={handleSearch}
                placeholder="Nom de la plante *"
                placeholderTextColor={colors.dark.textSecondary}
                autoFocus
              />
              <TouchableOpacity
                style={styles.searchButton}
                onPress={handleSearch}
                disabled={searching || searchQuery.trim().length < 2}>
                {searching ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.searchButtonText}>{'🔍'}</Text>
                )}
              </TouchableOpacity>
            </View>
            {searchError ? <Text style={styles.fieldError}>{searchError}</Text> : null}

            <TextInput
              style={styles.inputLatin}
              value={form.latinName}
              onChangeText={(v) => setField('latinName', v)}
              placeholder="Nom latin (optionnel)"
              placeholderTextColor={colors.dark.border}
            />

            {/* Zone */}
            {zones.length > 0 && (
              <>
                <Text style={styles.label}>Zone</Text>
                <View style={styles.pills}>
                  <TouchableOpacity
                    onPress={() => setField('zoneId', null)}
                    style={[styles.pill, !form.zoneId && styles.pillActive]}>
                    <Text style={[styles.pillText, !form.zoneId && styles.pillTextActive]}>
                      Aucune
                    </Text>
                  </TouchableOpacity>
                  {zones.map((z) => (
                    <TouchableOpacity
                      key={z.id}
                      onPress={() => setField('zoneId', z.id)}
                      style={[styles.pill, form.zoneId === z.id && styles.pillActive]}>
                      <Text
                        style={[styles.pillText, form.zoneId === z.id && styles.pillTextActive]}>
                        {z.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Type */}
            <Text style={styles.label}>Type</Text>
            <View style={styles.pills}>
              {choices(PLANT_TYPES).map(({ value: t, label }) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setField('type', toggleChip(form.type, t))}
                  style={[styles.pill, form.type === t && styles.pillActive]}>
                  <Text style={[styles.pillText, form.type === t && styles.pillTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </GlassCard>
        </View>

        {/* --- Exposition & Arrosage — compact row --- */}
        <View style={styles.section}>
          <View style={styles.dualRow}>
            <View style={styles.dualCol}>
              <Text style={styles.labelSmall}>Exposition</Text>
              <View style={styles.segmented}>
                {choices(SUN).map(({ value: s, label, icon }) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setField('sun', toggleChip(form.sun, s))}
                    style={[styles.segBtn, form.sun === s && styles.segBtnActive]}>
                    <Text style={styles.segIcon}>{icon}</Text>
                    <Text
                      style={[styles.segLabel, form.sun === s && styles.segLabelActive]}
                      numberOfLines={1}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.dualCol}>
              <Text style={styles.labelSmall}>Arrosage</Text>
              <View style={styles.segmented}>
                {choices(WATER).map(({ value: w, label, icon }) => (
                  <TouchableOpacity
                    key={w}
                    onPress={() => setField('water', toggleChip(form.water, w))}
                    style={[styles.segBtn, form.water === w && styles.segBtnActive]}>
                    <Text style={styles.segIcon}>{icon}</Text>
                    <Text
                      style={[styles.segLabel, form.water === w && styles.segLabelActive]}
                      numberOfLines={1}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* --- Collapsible secondary fields --- */}
        <View style={styles.section}>
          <TouchableOpacity onPress={toggleMore} style={styles.moreToggle}>
            <Text style={styles.moreToggleText}>
              {showMore ? 'Moins de details  ▲' : 'Plus de details  ▼'}
            </Text>
          </TouchableOpacity>

          {showMore && (
            <GlassCard style={styles.moreCard}>
              <Text style={styles.label}>Couleur des fleurs</Text>
              <TextInput
                style={styles.input}
                value={form.flowerColor}
                onChangeText={(v) => setField('flowerColor', v)}
                placeholder="ex. rose, blanc"
                placeholderTextColor={colors.dark.textSecondary}
              />

              <Text style={styles.label}>Floraison</Text>
              <View style={styles.pills}>
                <TouchableOpacity
                  onPress={() => {
                    setNoFlowering(false);
                    setField('bloomStartMonth', '');
                    setField('bloomEndMonth', '');
                  }}
                  style={[styles.pill, !noFlowering && styles.pillActive]}>
                  <Text style={[styles.pillText, !noFlowering && styles.pillTextActive]}>Oui</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setNoFlowering(true);
                    setField('bloomStartMonth', '');
                    setField('bloomEndMonth', '');
                  }}
                  style={[styles.pill, noFlowering && styles.pillActive]}>
                  <Text style={[styles.pillText, noFlowering && styles.pillTextActive]}>
                    Non applicable
                  </Text>
                </TouchableOpacity>
              </View>

              {!noFlowering && (
                <View style={styles.bloomRow}>
                  <TextInput
                    style={[styles.input, styles.inputSmall]}
                    value={form.bloomStartMonth}
                    onChangeText={(v) => setField('bloomStartMonth', v)}
                    placeholder="Debut"
                    placeholderTextColor={colors.dark.textSecondary}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                  <Text style={styles.dash}>{'–'}</Text>
                  <TextInput
                    style={[styles.input, styles.inputSmall]}
                    value={form.bloomEndMonth}
                    onChangeText={(v) => setField('bloomEndMonth', v)}
                    placeholder="Fin"
                    placeholderTextColor={colors.dark.textSecondary}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                </View>
              )}
              {errors.bloomStartMonth ? (
                <Text style={styles.fieldError}>{errors.bloomStartMonth}</Text>
              ) : null}
              {errors.bloomEndMonth ? (
                <Text style={styles.fieldError}>{errors.bloomEndMonth}</Text>
              ) : null}

              <Text style={styles.label}>Hauteur (cm)</Text>
              <TextInput
                style={styles.input}
                value={form.height}
                onChangeText={(v) => setField('height', v)}
                placeholder="ex. 150"
                placeholderTextColor={colors.dark.textSecondary}
                keyboardType="number-pad"
              />

              <Text style={styles.label}>Largeur (cm)</Text>
              <TextInput
                style={styles.input}
                value={form.width}
                onChangeText={(v) => setField('width', v)}
                placeholder="ex. 100"
                placeholderTextColor={colors.dark.textSecondary}
                keyboardType="number-pad"
              />

              <Text style={styles.label}>Type de feuille</Text>
              <View style={styles.pills}>
                <TouchableOpacity
                  onPress={() => setField('deciduous', null)}
                  style={[styles.pill, form.deciduous === null && styles.pillActive]}>
                  <Text style={[styles.pillText, form.deciduous === null && styles.pillTextActive]}>
                    ?
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setField('deciduous', false)}
                  style={[styles.pill, form.deciduous === false && styles.pillActive]}>
                  <Text
                    style={[styles.pillText, form.deciduous === false && styles.pillTextActive]}>
                    Persistante
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setField('deciduous', true)}
                  style={[styles.pill, form.deciduous === true && styles.pillActive]}>
                  <Text style={[styles.pillText, form.deciduous === true && styles.pillTextActive]}>
                    Caduque
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Température min (°C)</Text>
              <TextInput
                style={styles.input}
                value={form.minTemperature}
                onChangeText={(v) => setField('minTemperature', v)}
                placeholder="ex. -10"
                placeholderTextColor={colors.dark.textSecondary}
                keyboardType="numbers-and-punctuation"
              />

              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={form.notes}
                onChangeText={(v) => setField('notes', v)}
                placeholder="Notes..."
                placeholderTextColor={colors.dark.textSecondary}
                multiline
              />

              <Text style={styles.label}>Date d'ajout</Text>
              <TextInput
                style={styles.input}
                value={form.createdAt}
                onChangeText={(v) => setField('createdAt', v)}
                placeholder="AAAA-MM-JJ"
                placeholderTextColor={colors.dark.textSecondary}
                keyboardType="numbers-and-punctuation"
              />
              <Text style={styles.dateHint}>Laissez vide pour la date du jour</Text>
              {errors.createdAt ? <Text style={styles.fieldError}>{errors.createdAt}</Text> : null}

              {/* --- Section Sol --- */}
              <Text style={styles.sectionTitle}>Sol</Text>

              <Text style={styles.label}>Type de sol</Text>
              <View style={styles.pills}>
                {choices(SOIL_TYPES).map(({ value: s, label }) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setField('soilType', toggleChip(form.soilType, s))}
                    style={[styles.pill, form.soilType === s && styles.pillActive]}>
                    <Text style={[styles.pillText, form.soilType === s && styles.pillTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>pH du sol</Text>
              <View style={styles.pills}>
                {choices(SOIL_PH).map(({ value: p, label }) => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setField('soilPH', toggleChip(form.soilPH, p))}
                    style={[styles.pill, form.soilPH === p && styles.pillActive]}>
                    <Text style={[styles.pillText, form.soilPH === p && styles.pillTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* --- Section Entretien --- */}
              <Text style={styles.sectionTitle}>Entretien</Text>

              <Text style={styles.label}>Engrais</Text>
              <TextInput
                style={styles.input}
                value={form.fertilizer}
                onChangeText={(v) => setField('fertilizer', v)}
                placeholder="ex. NPK 10-10-10 au printemps"
                placeholderTextColor={colors.dark.textSecondary}
              />

              <Text style={styles.label}>Taille</Text>
              <TextInput
                style={styles.input}
                value={form.pruning}
                onChangeText={(v) => setField('pruning', v)}
                placeholder="ex. Taille de formation en fin d'hiver"
                placeholderTextColor={colors.dark.textSecondary}
              />

              <Text style={styles.label}>Mois de taille</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.pills}>
                  <TouchableOpacity
                    onPress={() => setField('pruningMonth', null)}
                    style={[styles.pill, form.pruningMonth === null && styles.pillActive]}>
                    <Text
                      style={[
                        styles.pillText,
                        form.pruningMonth === null && styles.pillTextActive,
                      ]}>
                      —
                    </Text>
                  </TouchableOpacity>
                  {MONTH_SHORT.map((m, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setField('pruningMonth', i + 1)}
                      style={[styles.pill, form.pruningMonth === i + 1 && styles.pillActive]}>
                      <Text
                        style={[
                          styles.pillText,
                          form.pruningMonth === i + 1 && styles.pillTextActive,
                        ]}>
                        {m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <Text style={styles.label}>Entretien hivernal</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={form.winterCare}
                onChangeText={(v) => setField('winterCare', v)}
                placeholder="ex. Paillage, protection hivernale..."
                placeholderTextColor={colors.dark.textSecondary}
                multiline
              />

              {/* --- Section Multiplication --- */}
              <Text style={styles.sectionTitle}>Multiplication</Text>

              <Text style={styles.label}>Méthode</Text>
              <View style={styles.pills}>
                <TouchableOpacity
                  onPress={() => setField('propagation', null)}
                  style={[styles.pill, form.propagation === null && styles.pillActive]}>
                  <Text
                    style={[styles.pillText, form.propagation === null && styles.pillTextActive]}>
                    —
                  </Text>
                </TouchableOpacity>
                {PROPAGATION.map(({ value: p, label }) => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setField('propagation', p)}
                    style={[styles.pill, form.propagation === p && styles.pillActive]}>
                    <Text
                      style={[styles.pillText, form.propagation === p && styles.pillTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* --- Section Santé --- */}
              <Text style={styles.sectionTitle}>Santé</Text>

              <Text style={styles.label}>Ravageurs / Maladies</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={form.pests}
                onChangeText={(v) => setField('pests', v)}
                placeholder="ex. Pucerons, oïdium..."
                placeholderTextColor={colors.dark.textSecondary}
                multiline
              />

              <Text style={styles.label}>Toxicité</Text>
              <View style={styles.pills}>
                {choices(TOXICITY).map(({ value: t, label }) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setField('toxicity', toggleChip(form.toxicity, t))}
                    style={[styles.pill, form.toxicity === t && styles.pillActive]}>
                    <Text style={[styles.pillText, form.toxicity === t && styles.pillTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* --- Section Récolte (pour comestibles) --- */}
              <Text style={styles.sectionTitle}>Récolte</Text>

              <Text style={styles.label}>Informations de récolte</Text>
              <TextInput
                style={styles.input}
                value={form.harvest}
                onChangeText={(v) => setField('harvest', v)}
                placeholder="ex. Fruits mûrs en été"
                placeholderTextColor={colors.dark.textSecondary}
              />

              <Text style={styles.label}>Période de récolte (mois)</Text>
              <View style={styles.bloomRow}>
                <TextInput
                  style={[styles.input, styles.inputSmall]}
                  value={form.harvestMonthStart}
                  onChangeText={(v) => setField('harvestMonthStart', v)}
                  placeholder="Début"
                  placeholderTextColor={colors.dark.textSecondary}
                  keyboardType="number-pad"
                  maxLength={2}
                />
                <Text style={styles.dash}>{'–'}</Text>
                <TextInput
                  style={[styles.input, styles.inputSmall]}
                  value={form.harvestMonthEnd}
                  onChangeText={(v) => setField('harvestMonthEnd', v)}
                  placeholder="Fin"
                  placeholderTextColor={colors.dark.textSecondary}
                  keyboardType="number-pad"
                  maxLength={2}
                />
              </View>
              {errors.harvestMonthStart ? (
                <Text style={styles.fieldError}>{errors.harvestMonthStart}</Text>
              ) : null}
              {errors.harvestMonthEnd ? (
                <Text style={styles.fieldError}>{errors.harvestMonthEnd}</Text>
              ) : null}

              {/* --- Section Autres --- */}
              <Text style={styles.sectionTitle}>Autres informations</Text>

              <Text style={styles.label}>Plantes compagnes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={form.companionPlants}
                onChangeText={(v) => setField('companionPlants', v)}
                placeholder="ex. Tomates, basilic..."
                placeholderTextColor={colors.dark.textSecondary}
                multiline
              />

              <Text style={styles.label}>Région d'origine</Text>
              <TextInput
                style={styles.input}
                value={form.origin}
                onChangeText={(v) => setField('origin', v)}
                placeholder="ex. Méditerranée, Asie..."
                placeholderTextColor={colors.dark.textSecondary}
              />
            </GlassCard>
          )}
        </View>

        {/* --- Save --- */}
        <TouchableOpacity
          style={[styles.saveBtn, (!form.name.trim() || saving) && styles.saveBtnDisabled]}
          onPress={save}
          disabled={!form.name.trim() || saving}>
          <Text style={styles.saveBtnText}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Text>
        </TouchableOpacity>
        <View style={{ height: 60 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  backBtn: { marginBottom: 4 },
  backBtnText: { ...typography.bodySmall, color: colors.dark.textSecondary },
  heroTitle: { ...typography.display, color: colors.dark.text },
  section: { paddingHorizontal: spacing.md, marginTop: spacing.md },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchButton: {
    backgroundColor: colors.dark.accent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    marginLeft: 8,
  },
  searchButtonText: {
    fontSize: 18,
  },
  suggestionsOverlay: {
    position: 'absolute',
    top: 140,
    left: 20,
    right: 20,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dark.border,
    zIndex: 100,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  suggestionItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.dark.border,
  },
  suggestionName: {
    ...typography.body,
    color: colors.dark.text,
    fontWeight: '600',
  },
  suggestionLatin: {
    ...typography.caption,
    color: colors.dark.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
  },

  inputName: {
    ...typography.displaySmall,
    color: colors.dark.text,
    paddingVertical: 8,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.dark.border,
    marginBottom: 4,
    flex: 1,
  },
  inputLatin: {
    ...typography.bodySmall,
    color: colors.dark.textSecondary,
    fontStyle: 'italic',
    paddingVertical: 6,
    paddingHorizontal: 0,
    marginBottom: 8,
  },

  label: {
    ...typography.caption,
    color: colors.dark.textSecondary,
    marginBottom: 4,
    marginTop: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  labelSmall: {
    ...typography.caption,
    color: colors.dark.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    backgroundColor: colors.dark.surface,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pillActive: {
    backgroundColor: colors.dark.accentSoft,
    borderColor: colors.dark.accent,
  },
  pillText: { ...typography.caption, color: colors.dark.textSecondary },
  pillTextActive: { color: '#fff', fontWeight: '600' },

  dualRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dualCol: {
    flex: 1,
  },
  segmented: {
    flexDirection: 'column',
    backgroundColor: colors.dark.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  segBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 6,
  },
  segBtnActive: {
    backgroundColor: colors.dark.accentSoft,
  },
  segIcon: {
    fontSize: 14,
  },
  segLabel: {
    ...typography.caption,
    color: colors.dark.textSecondary,
    flexShrink: 1,
  },
  segLabelActive: {
    color: '#fff',
    fontWeight: '600',
  },

  moreToggle: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  moreToggleText: {
    ...typography.bodySmall,
    color: colors.dark.accent,
  },
  moreCard: {
    marginTop: 4,
  },

  input: {
    ...typography.body,
    color: colors.dark.text,
    backgroundColor: colors.dark.surface,
    borderRadius: radius.sm,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  inputSmall: { flex: 1 },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  bloomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dash: { ...typography.body, color: colors.dark.textSecondary },

  dateHint: {
    ...typography.caption,
    color: colors.dark.textSecondary,
    marginTop: 4,
  },
  fieldError: {
    ...typography.caption,
    color: colors.dark.danger,
    marginTop: 4,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.dark.accent,
    marginTop: 24,
    marginBottom: 8,
    fontWeight: '600',
  },

  saveBtn: {
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    backgroundColor: colors.dark.accent,
    paddingVertical: 14,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { ...typography.label, color: '#fff', fontWeight: '600' },
});
