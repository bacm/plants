import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import Icon from '../../../components/Icon';
import { colors, spacing, typography, radius, colorHex } from '../../../lib/theme';
import { showMessage, confirm } from '../../../lib/dialogs';
import { getZones, getPlants, deleteZone, countPlantsInZone } from '../../../lib/db';
import { DEFAULT_ZONE_ICON, zoneIconFor } from '../../../lib/enums';
import { plural } from '../../../lib/text';

export default function ZoneDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [zone, setZone] = useState(null);
  const [plants, setPlants] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const zones = await getZones();
    const z = zones.find((x) => x.id === id) || null;
    setZone(z);
    if (id) {
      const p = await getPlants({ zoneId: id });
      setPlants(p);
    }
  }, [id]);

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

  const confirmDelete = useCallback(async () => {
    const count = await countPlantsInZone(id);
    const suffix = count !== 1 ? 's' : '';
    const ok = await confirm({
      title: 'Supprimer la zone',
      message: `Les ${count} plante${suffix} de cette zone resteront dans votre jardin, sans zone.`,
      confirmLabel: 'Supprimer',
      destructive: true,
    });
    if (!ok) return;
    try {
      deleteZone(id);
      // back(), not replace(): the list underneath reloads on focus, and
      // replace() would stack a second copy of it (see ticket 035).
      if (router.canGoBack()) router.back();
      else router.replace('/zones');
    } catch (e) {
      showMessage('Erreur', `Impossible de supprimer : ${e.message}`);
    }
  }, [id, router]);

  if (!zone) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>Chargement…</Text>
      </View>
    );
  }

  const { icon, tint } = zoneIconFor(zone.icon || DEFAULT_ZONE_ICON);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityLabel="Retour"
          style={styles.backButton}>
          <Icon name="chevron-left" size={20} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.headerRow}>
          <View style={[styles.iconSquare, { backgroundColor: colors[tint] }]}>
            <Icon name={icon} size={26} color={colors.text} />
          </View>
          <View style={styles.headerTextCol}>
            <Text style={styles.eyebrow}>
              {plants.length} {plural(plants.length, 'plante', 'plantes')}
            </Text>
            <Text style={styles.title}>{zone.name}</Text>
            {zone.description ? <Text style={styles.description}>{zone.description}</Text> : null}
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push(`/plant/new?zoneId=${zone.id}`)}
            accessibilityLabel="Ajouter une plante">
            <Icon name="plus" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Ajouter une plante</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.outlinedBtn}
            onPress={() => router.push(`/zone/edit?id=${zone.id}`)}
            accessibilityLabel="Modifier la zone">
            <Text style={styles.outlinedBtnText}>Modifier</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={confirmDelete} style={styles.deleteBtn}>
            <Text style={styles.deleteBtnText}>Supprimer la zone</Text>
          </TouchableOpacity>
        </View>

        {plants.length === 0 ? (
          <Text style={styles.emptyText}>
            Aucune plante dans cette zone. Ajoutez des plantes et assignez-les à « {zone.name} ».
          </Text>
        ) : (
          <View style={styles.plantsCard}>
            {plants.map((p, idx) => (
              <TouchableOpacity
                key={p.id}
                activeOpacity={0.9}
                onPress={() => router.push(`/plant/${p.id}`)}
                style={[styles.row, idx < plants.length - 1 && styles.rowDivider]}>
                <View style={styles.thumbWrap}>
                  {p.photoUri ? (
                    <Image source={{ uri: p.photoUri }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbPlaceholder]}>
                      <Icon name="leaf" size={20} color={colors.sage} />
                    </View>
                  )}
                  {p.flowerColor ? (
                    <View style={[styles.colorDot, { backgroundColor: colorHex(p.flowerColor) }]} />
                  ) : null}
                </View>
                <View style={styles.plantInfo}>
                  <Text style={styles.plantName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  {p.latinName ? (
                    <Text style={styles.latin} numberOfLines={1}>
                      {p.latinName}
                    </Text>
                  ) : null}
                </View>
                <Icon name="chevron-right" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  placeholder: { ...typography.body, color: colors.textSecondary, padding: spacing.lg },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: 56,
    paddingHorizontal: spacing.lg,
    paddingBottom: 140,
    gap: 20,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  iconSquare: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextCol: { flex: 1, gap: 4 },
  eyebrow: {
    fontFamily: 'InstrumentSans_500Medium',
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  title: {
    fontFamily: 'Fraunces_400Regular',
    fontSize: 36,
    lineHeight: 38,
    letterSpacing: -0.5,
    color: colors.text,
  },
  description: { ...typography.body, fontSize: 15, color: colors.textSecondary },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  primaryBtnText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, color: '#fff' },
  outlinedBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlinedBtnText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, color: colors.text },
  deleteBtn: {
    height: 44,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 14, color: colors.danger },
  emptyText: { ...typography.bodySmall, color: colors.textSecondary },
  plantsCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.track,
    borderRadius: radius.xl,
    paddingVertical: 4,
    paddingHorizontal: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 68, paddingVertical: 8 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  // Ticket 084: the plant's latest photo, like every other plant list; the
  // flower colour stays as a small badge on its corner.
  thumbWrap: { width: 48, height: 48 },
  thumb: { width: 48, height: 48, borderRadius: radius.full },
  thumbPlaceholder: {
    backgroundColor: colors.softGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  plantInfo: { flex: 1, minWidth: 0, gap: 1 },
  plantName: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 15, color: colors.text },
  latin: { fontFamily: 'Fraunces_400Regular_Italic', fontSize: 14, color: colors.textSecondary },
});
