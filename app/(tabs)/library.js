import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Image,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Icon from '../../components/Icon';
import { colors, spacing, typography, radius, colorHex } from '../../lib/theme';
import { getPlants } from '../../lib/db';
import { PLANT_TYPES, choices, isUnknown, labelFor } from '../../lib/enums';
import { plural } from '../../lib/text';

export default function LibraryScreen() {
  const router = useRouter();
  const [plants, setPlants] = useState([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const latestRequestId = useRef(0);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(handle);
  }, [search]);

  const load = useCallback(async () => {
    const requestId = ++latestRequestId.current;
    const p = await getPlants({
      search: debouncedSearch || undefined,
      type: typeFilter || undefined,
    });
    // Ignore a response that arrives after a newer request has been made.
    if (requestId !== latestRequestId.current) return;
    setPlants(p);
  }, [debouncedSearch, typeFilter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }>
        <View style={styles.headerRow}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.eyebrow}>
              {plants.length} {plural(plants.length, 'plante', 'plantes')}
            </Text>
            <Text style={styles.title} accessibilityRole="header">
              Bibliothèque
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/plant/new')}
            accessibilityLabel="Ajouter une plante"
            style={styles.addButton}>
            <Icon name="plus" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.searchRow}>
          <Icon name="magnify" size={20} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher (nom, couleur…)"
            placeholderTextColor={colors.textSecondary}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filters}
          contentContainerStyle={styles.filtersContent}>
          <TouchableOpacity
            onPress={() => setTypeFilter(null)}
            style={[styles.filterPill, !typeFilter && styles.filterPillActive]}>
            <Text style={[styles.filterPillText, !typeFilter && styles.filterPillTextActive]}>
              Toutes
            </Text>
          </TouchableOpacity>
          {choices(PLANT_TYPES).map(({ value, plural: pluralLabel }) => (
            <TouchableOpacity
              key={value}
              onPress={() => setTypeFilter(typeFilter === value ? null : value)}
              style={[styles.filterPill, typeFilter === value && styles.filterPillActive]}>
              <Text
                style={[
                  styles.filterPillText,
                  typeFilter === value && styles.filterPillTextActive,
                ]}>
                {pluralLabel}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {plants.length === 0 ? (
          <Text style={styles.emptyText}>
            {search || typeFilter
              ? 'Aucun résultat. Modifiez les filtres.'
              : 'Aucune plante. Ajoutez votre première plante.'}
          </Text>
        ) : (
          <View style={styles.grid}>
            {plants.map((p) => {
              const metaParts = [];
              if (!isUnknown(p.type)) metaParts.push(labelFor(PLANT_TYPES, p.type));
              metaParts.push(p.zoneName || 'Sans zone');
              return (
                <TouchableOpacity
                  key={p.id}
                  activeOpacity={0.9}
                  onPress={() => router.push(`/plant/${p.id}`)}
                  style={styles.card}>
                  <View style={styles.imageBox}>
                    {p.photoUri ? (
                      <Image source={{ uri: p.photoUri }} style={styles.image} />
                    ) : (
                      <View style={[styles.image, styles.imagePlaceholder]}>
                        <Icon
                          name="leaf"
                          size={36}
                          color={colors.sage}
                          style={styles.imagePlaceholderIcon}
                        />
                      </View>
                    )}
                    {p.flowerColor ? (
                      <View style={[styles.swatch, { backgroundColor: colorHex(p.flowerColor) }]} />
                    ) : null}
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.plantName} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {metaParts.join(' · ')}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: 64,
    paddingHorizontal: spacing.lg,
    paddingBottom: 140,
    gap: 18,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  headerTextWrap: { flex: 1 },
  eyebrow: {
    fontFamily: 'InstrumentSans_500Medium',
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  title: {
    fontFamily: 'Fraunces_400Regular',
    fontSize: 40,
    lineHeight: 42,
    letterSpacing: -0.8,
    color: colors.text,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'InstrumentSans_400Regular',
    fontSize: 15,
    color: colors.text,
    padding: 0,
  },
  filters: { marginRight: -spacing.lg },
  filtersContent: { gap: spacing.sm, paddingRight: spacing.lg },
  filterPill: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillActive: { backgroundColor: colors.text, borderColor: colors.text },
  filterPillText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, color: colors.text },
  filterPillTextActive: { color: colors.background },
  emptyText: { ...typography.bodySmall, color: colors.textSecondary },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },
  card: { width: '48%', gap: 8 },
  imageBox: {
    height: 150,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: {
    backgroundColor: colors.softGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderIcon: { opacity: 0.35 },
  swatch: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  cardInfo: { paddingHorizontal: 4, gap: 1 },
  plantName: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 15, color: colors.text },
  meta: { fontFamily: 'InstrumentSans_400Regular', fontSize: 13, color: colors.textSecondary },
});
