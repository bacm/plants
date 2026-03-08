import { useState, useEffect, useCallback, useRef } from 'react';
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
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { GradientHero } from '../../components/GradientHero';
import { GlassCard } from '../../components/GlassCard';
import { colors, spacing, typography, radius } from '../../lib/theme';
import { getPlantById, updatePlant, getZones, PLANT_TYPES, SUN, WATER } from '../../lib/db';
import { searchPlants, normalizeToForm } from '../../lib/plantSearch';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SUN_LABELS = { full_sun: 'Plein soleil', partial: 'Mi-ombre', shade: 'Ombre' };
const WATER_LABELS = { low: 'Faible', medium: 'Moyen', high: 'Élevé' };
const TYPE_LABELS = {
  perennial: 'Vivace',
  annual: 'Annuelle',
  shrub: 'Arbuste',
  tree: 'Arbre',
  bulb: 'Bulbe',
  groundcover: 'Couvre-sol',
  vine: 'Grimpante',
};

const SUN_ICONS = { full_sun: '\u2600', partial: '\u26C5', shade: '\u2601' };
const WATER_ICONS = { low: '\uD83D\uDCA7', medium: '\uD83D\uDCA7\uD83D\uDCA7', high: '\uD83D\uDCA7\uD83D\uDCA7\uD83D\uDCA7' };

export default function EditPlantScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [zones, setZones] = useState([]);
  const [plant, setPlant] = useState(null);
  const [name, setName] = useState('');
  const [latinName, setLatinName] = useState('');
  const [type, setType] = useState('perennial');
  const [flowerColor, setFlowerColor] = useState('');
  const [sun, setSun] = useState('partial');
  const [water, setWater] = useState('medium');
  const [bloomStartMonth, setBloomStartMonth] = useState('');
  const [bloomEndMonth, setBloomEndMonth] = useState('');
  const [noFlowering, setNoFlowering] = useState(false);
  const [height, setHeight] = useState('');
  const [width, setWidth] = useState('');
  const [deciduous, setDeciduous] = useState(null);
  const [minTemperature, setMinTemperature] = useState('');
  const [zoneId, setZoneId] = useState(null);
  const [notes, setNotes] = useState('');
  const [createdAt, setCreatedAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getZones().then(setZones);
    }, [])
  );

  useEffect(() => {
    if (id)
      getPlantById(id).then((p) => {
        if (!p) return;
        setPlant(p);
        setName(p.name);
        setLatinName(p.latinName || '');
        setType(p.type || 'perennial');
        setFlowerColor(p.flowerColor || '');
        setSun(p.sun || 'partial');
        setWater(p.water || 'medium');
        const hasBloom = p.bloomStartMonth != null && p.bloomEndMonth != null;
        setBloomStartMonth(p.bloomStartMonth != null ? String(p.bloomStartMonth) : '');
        setBloomEndMonth(p.bloomEndMonth != null ? String(p.bloomEndMonth) : '');
        setNoFlowering(!hasBloom);
        setHeight(p.height != null ? String(p.height) : '');
        setWidth(p.width != null ? String(p.width) : '');
        setDeciduous(p.deciduous);
        setMinTemperature(p.minTemperature != null ? String(p.minTemperature) : '');
        setZoneId(p.zoneId || null);
        setNotes(p.notes || '');
        setCreatedAt(p.createdAt ? p.createdAt.slice(0, 10) : '');
        setSearchQuery(p.name);
        // Auto-expand details if any secondary field has data
        if (p.flowerColor || p.bloomStartMonth || p.bloomEndMonth || p.height || p.width || p.deciduous != null || p.minTemperature || p.notes || p.createdAt) {
          setShowMore(true);
        }
      });
  }, [id]);

  const toggleMore = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowMore((v) => !v);
  };

  const handleSearch = async () => {
    if (searchQuery.trim().length < 2) return;
    
    setSearching(true);
    setShowSuggestions(true);
    try {
      const results = await searchPlants(searchQuery);
      setSuggestions(results);
    } catch (err) {
      console.error('Search error:', err);
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectSuggestion = (plant) => {
    const formData = normalizeToForm(plant);
    const hasBloom = formData.bloomStartMonth != null && formData.bloomEndMonth != null;
    setName(formData.name);
    setLatinName(formData.latinName);
    setType(formData.type);
    setSun(formData.sun);
    setWater(formData.water);
    setFlowerColor(formData.flowerColor);
    setBloomStartMonth(formData.bloomStartMonth?.toString() || '');
    setBloomEndMonth(formData.bloomEndMonth?.toString() || '');
    setNoFlowering(!hasBloom);
    setHeight(formData.height || '');
    setWidth(formData.width || '');
    setDeciduous(formData.deciduous);
    setMinTemperature(formData.minTemperature || '');
    setNotes(formData.notes);
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const handleNameChange = (text) => {
    setName(text);
    setSearchQuery(text);
  };

  const save = async () => {
    if (!id || !name.trim()) return;
    setSaving(true);
    const start = bloomStartMonth ? parseInt(bloomStartMonth, 10) : null;
    const end = bloomEndMonth ? parseInt(bloomEndMonth, 10) : null;
    const h = height ? parseInt(height, 10) : null;
    const w = width ? parseInt(width, 10) : null;
    const minTemp = minTemperature ? parseInt(minTemperature, 10) : null;
    updatePlant(id, {
      name: name.trim(),
      latinName: latinName.trim() || null,
      type,
      flowerColor: flowerColor.trim() || null,
      sun,
      water,
      bloomStartMonth: start,
      bloomEndMonth: end,
      height: h,
      width: w,
      deciduous: deciduous,
      minTemperature: minTemp,
      zoneId,
      notes: notes.trim() || null,
      createdAt: createdAt ? new Date(createdAt).toISOString() : null,
    });
    setSaving(false);
    router.replace(`/plant/${id}`);
  };

  if (!plant) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>Chargement\u2026</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <GradientHero>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>{'\u2190'} Annuler</Text>
          </TouchableOpacity>
          <Text style={styles.heroTitle}>Modifier</Text>
        </GradientHero>

        {/* --- Essential fields --- */}
        <View style={styles.section}>
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.inputName}
              value={name}
              onChangeText={handleNameChange}
              onSubmitEditing={handleSearch}
              placeholder="Nom de la plante *"
              placeholderTextColor={colors.dark.textSecondary}
            />
            <TouchableOpacity 
              style={styles.searchButton} 
              onPress={handleSearch}
              disabled={searching || searchQuery.trim().length < 2}
            >
              {searching ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.searchButtonText}>{'\uD83D\uDD0D'}</Text>
              )}
            </TouchableOpacity>
          </View>

          {showSuggestions && suggestions.length > 0 && (
            <View style={styles.suggestionsOverlay}>
              {suggestions.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.suggestionItem}
                  onPress={() => handleSelectSuggestion(item)}
                >
                  <Text style={styles.suggestionName}>{item.common_name}</Text>
                  <Text style={styles.suggestionLatin}>{item.scientific_name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <GlassCard>
            <TextInput
              style={styles.inputLatin}
              value={latinName}
              onChangeText={setLatinName}
              placeholder="Nom latin (optionnel)"
              placeholderTextColor={colors.dark.border}
            />
          </GlassCard>

          <GlassCard>
            {zones.length > 0 && (
              <>
                <Text style={styles.label}>Zone</Text>
                <View style={styles.pills}>
                  <TouchableOpacity
                    onPress={() => setZoneId(null)}
                    style={[styles.pill, !zoneId && styles.pillActive]}
                  >
                    <Text style={[styles.pillText, !zoneId && styles.pillTextActive]}>Aucune</Text>
                  </TouchableOpacity>
                  {zones.map((z) => (
                    <TouchableOpacity
                      key={z.id}
                      onPress={() => setZoneId(z.id)}
                      style={[styles.pill, zoneId === z.id && styles.pillActive]}
                    >
                      <Text style={[styles.pillText, zoneId === z.id && styles.pillTextActive]}>
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
              {PLANT_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setType(t)}
                  style={[styles.pill, type === t && styles.pillActive]}
                >
                  <Text style={[styles.pillText, type === t && styles.pillTextActive]}>
                    {TYPE_LABELS[t]}
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
                {SUN.map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setSun(s)}
                    style={[styles.segBtn, sun === s && styles.segBtnActive]}
                  >
                    <Text style={styles.segIcon}>{SUN_ICONS[s]}</Text>
                    <Text
                      style={[styles.segLabel, sun === s && styles.segLabelActive]}
                      numberOfLines={1}
                    >
                      {SUN_LABELS[s]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.dualCol}>
              <Text style={styles.labelSmall}>Arrosage</Text>
              <View style={styles.segmented}>
                {WATER.map((w) => (
                  <TouchableOpacity
                    key={w}
                    onPress={() => setWater(w)}
                    style={[styles.segBtn, water === w && styles.segBtnActive]}
                  >
                    <Text style={styles.segIcon}>{WATER_ICONS[w]}</Text>
                    <Text
                      style={[styles.segLabel, water === w && styles.segLabelActive]}
                      numberOfLines={1}
                    >
                      {WATER_LABELS[w]}
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
              {showMore ? 'Moins de details  \u25B2' : 'Plus de details  \u25BC'}
            </Text>
          </TouchableOpacity>

          {showMore && (
            <GlassCard style={styles.moreCard}>
              <Text style={styles.label}>Couleur des fleurs</Text>
              <TextInput
                style={styles.input}
                value={flowerColor}
                onChangeText={setFlowerColor}
                placeholder="ex. rose, blanc"
                placeholderTextColor={colors.dark.textSecondary}
              />

              <Text style={styles.label}>Floraison</Text>
              <View style={styles.pills}>
                <TouchableOpacity
                  onPress={() => { setNoFlowering(false); setBloomStartMonth(''); setBloomEndMonth(''); }}
                  style={[styles.pill, !noFlowering && styles.pillActive]}
                >
                  <Text style={[styles.pillText, !noFlowering && styles.pillTextActive]}>Oui</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setNoFlowering(true); setBloomStartMonth(''); setBloomEndMonth(''); }}
                  style={[styles.pill, noFlowering && styles.pillActive]}
                >
                  <Text style={[styles.pillText, noFlowering && styles.pillTextActive]}>Non applicable</Text>
                </TouchableOpacity>
              </View>

              {!noFlowering && (
                <View style={styles.bloomRow}>
                  <TextInput
                    style={[styles.input, styles.inputSmall]}
                    value={bloomStartMonth}
                    onChangeText={setBloomStartMonth}
                    placeholder="Debut"
                    placeholderTextColor={colors.dark.textSecondary}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                  <Text style={styles.dash}>{'\u2013'}</Text>
                  <TextInput
                    style={[styles.input, styles.inputSmall]}
                    value={bloomEndMonth}
                    onChangeText={setBloomEndMonth}
                    placeholder="Fin"
                    placeholderTextColor={colors.dark.textSecondary}
                    keyboardType="number-pad"
                    maxLength={2}
                  />
                </View>
              )}

              <Text style={styles.label}>Hauteur (cm)</Text>
              <TextInput
                style={styles.input}
                value={height}
                onChangeText={setHeight}
                placeholder="ex. 150"
                placeholderTextColor={colors.dark.textSecondary}
                keyboardType="number-pad"
              />

              <Text style={styles.label}>Largeur (cm)</Text>
              <TextInput
                style={styles.input}
                value={width}
                onChangeText={setWidth}
                placeholder="ex. 100"
                placeholderTextColor={colors.dark.textSecondary}
                keyboardType="number-pad"
              />

              <Text style={styles.label}>Type de feuille</Text>
              <View style={styles.pills}>
                <TouchableOpacity
                  onPress={() => setDeciduous(null)}
                  style={[styles.pill, deciduous === null && styles.pillActive]}
                >
                  <Text style={[styles.pillText, deciduous === null && styles.pillTextActive]}>?</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setDeciduous(false)}
                  style={[styles.pill, deciduous === false && styles.pillActive]}
                >
                  <Text style={[styles.pillText, deciduous === false && styles.pillTextActive]}>Persistante</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setDeciduous(true)}
                  style={[styles.pill, deciduous === true && styles.pillActive]}
                >
                  <Text style={[styles.pillText, deciduous === true && styles.pillTextActive]}>Caduque</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Température min (°C)</Text>
              <TextInput
                style={styles.input}
                value={minTemperature}
                onChangeText={setMinTemperature}
                placeholder="ex. -10"
                placeholderTextColor={colors.dark.textSecondary}
                keyboardType="numbers-and-punctuation"
              />

              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Notes..."
                placeholderTextColor={colors.dark.textSecondary}
                multiline
              />

              <Text style={styles.label}>Date d'ajout</Text>
              <TextInput
                style={styles.input}
                value={createdAt}
                onChangeText={setCreatedAt}
                placeholder="AAAA-MM-JJ"
                placeholderTextColor={colors.dark.textSecondary}
                keyboardType="numbers-and-punctuation"
              />
              <Text style={styles.dateHint}>Laissez vide pour la date du jour</Text>
            </GlassCard>
          )}
        </View>

        {/* --- Save --- */}
        <TouchableOpacity
          style={[styles.saveBtn, (!name.trim() || saving) && styles.saveBtnDisabled]}
          onPress={save}
          disabled={!name.trim() || saving}
        >
          <Text style={styles.saveBtnText}>
            {saving ? 'Enregistrement\u2026' : 'Enregistrer'}
          </Text>
        </TouchableOpacity>
        <View style={{ height: 60 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.background },
  placeholder: { ...typography.body, color: colors.dark.textSecondary, padding: spacing.lg },
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

  /* Name input — prominent, borderless */
  inputName: {
    ...typography.displaySmall,
    color: colors.dark.text,
    paddingVertical: 8,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.dark.border,
    marginBottom: 4,
  },
  inputLatin: {
    ...typography.bodySmall,
    color: colors.dark.textSecondary,
    fontStyle: 'italic',
    paddingVertical: 6,
    paddingHorizontal: 0,
    marginBottom: 8,
  },

  /* Labels */
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

  /* Pills */
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

  /* Segmented controls for sun / water */
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

  /* Collapsible toggle */
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

  /* Inputs in secondary section */
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

  /* Date hint */
  dateHint: {
    ...typography.caption,
    color: colors.dark.textSecondary,
    marginTop: 4,
  },

  /* Save button */
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
