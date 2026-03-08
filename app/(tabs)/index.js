import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { GradientHero } from '../../components/GradientHero';
import { GlassCard } from '../../components/GlassCard';
import {
  colors,
  spacing,
  typography,
  radius,
} from '../../lib/theme';
import {
  getDueTodayReminders,
  getOverdueReminders,
  getPlantsBloomingInMonth,
  markReminderDone,
  createCareLog,
} from '../../lib/db';

const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];

export default function Dashboard() {
  const router = useRouter();
  const [overdue, setOverdue] = useState([]);
  const [dueToday, setDueToday] = useState([]);
  const [blooming, setBlooming] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const currentMonth = new Date().getMonth() + 1;

  const load = useCallback(async () => {
    const [o, d, b] = await Promise.all([
      getOverdueReminders(),
      getDueTodayReminders(),
      getPlantsBloomingInMonth(currentMonth),
    ]);
    setOverdue(o);
    setDueToday(d);
    setBlooming(b);
  }, [currentMonth]);

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

  const handleDone = async (reminder) => {
    markReminderDone(reminder.id);
    const kindMap = {
      water: 'watered',
      prune: 'pruned',
      fertilize: 'fertilized',
      deadhead: 'deadheaded',
      winter_prep: 'treated',
      custom: 'treated',
    };
    await createCareLog({
      plantId: reminder.plantId,
      type: kindMap[reminder.kind] || 'watered',
      date: new Date().toISOString().slice(0, 10),
    });
    await load();
  };

  const tasks = [...overdue, ...dueToday];

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.dark.accent}
          />
        }
      >
        <GradientHero>
          <Text style={styles.heroTitle}>Votre jardin</Text>
          <Text style={styles.heroSubtitle}>
            {MONTHS[currentMonth - 1]} — Ce qui fleurit maintenant
          </Text>
        </GradientHero>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>À faire</Text>
            {tasks.length > 0 && (
              <Text style={styles.sectionCount}>{tasks.length}</Text>
            )}
          </View>
          {tasks.length === 0 ? (
            <GlassCard>
              <Text style={styles.emptyText}>Aucune tâche due pour l’instant.</Text>
            </GlassCard>
          ) : (
            tasks.slice(0, 8).map((r) => (
              <TouchableOpacity
                key={r.id}
                activeOpacity={0.8}
                onPress={() => handleDone(r)}
                style={styles.taskWrap}
              >
                <GlassCard>
                  <View style={styles.taskRow}>
                    <View style={styles.taskBullet} />
                    <View style={styles.taskContent}>
                      <Text style={styles.taskKind}>{reminderLabel(r.kind)}</Text>
                      <Text style={styles.taskPlant}>{r.plantName}</Text>
                    </View>
                    <Text style={styles.doneLabel}>Marquer fait</Text>
                  </View>
                </GlassCard>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>En fleurs ce mois</Text>
          </View>
          {blooming.length === 0 ? (
            <GlassCard>
              <Text style={styles.emptyText}>
                Aucune plante en fleur ce mois-ci. Ajoutez des périodes de floraison à vos plantes.
              </Text>
            </GlassCard>
          ) : (
            blooming.slice(0, 6).map((p) => (
              <TouchableOpacity
                key={p.id}
                activeOpacity={0.9}
                onPress={() => router.push(`/plant/${p.id}`)}
                style={styles.plantCardWrap}
              >
                <GlassCard>
                  <View style={styles.plantRow}>
                    <View style={[styles.colorDot, { backgroundColor: colorHex(p.flowerColor) }]} />
                    <Text style={styles.plantName}>{p.name}</Text>
                    {p.zoneName ? (
                      <Text style={styles.zoneTag}>{p.zoneName}</Text>
                    ) : null}
                  </View>
                </GlassCard>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push('/plant/new')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>+ Ajouter une plante</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push('/library')}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryButtonText}>Voir la bibliothèque</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

function reminderLabel(kind) {
  const labels = {
    water: 'Arroser',
    prune: 'Tailler',
    fertilize: 'Fertiliser',
    deadhead: 'Couper les fleurs fanées',
    winter_prep: 'Préparer l’hiver',
    custom: 'À faire',
  };
  return labels[kind] || kind;
}

function colorHex(color) {
  if (!color) return colors.dark.sage;
  const c = (color || '').toLowerCase();
  const map = {
    rose: '#C9A9A6',
    rouge: '#B85450',
    blanc: '#E8E4DF',
    jaune: '#D4B854',
    bleu: '#6B8BAA',
    violet: '#B8A9C9',
    vert: '#6B9B7A',
    orange: '#C98B5A',
  };
  for (const [k, v] of Object.entries(map)) {
    if (c.includes(k)) return v;
  }
  return colors.dark.accentSoft;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  heroTitle: {
    ...typography.display,
    color: colors.dark.text,
    marginBottom: 4,
  },
  heroSubtitle: {
    ...typography.bodySmall,
    color: colors.dark.textSecondary,
  },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.xl },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.title,
    color: colors.dark.text,
  },
  sectionCount: {
    ...typography.caption,
    color: colors.dark.accent,
    marginLeft: spacing.sm,
  },
  taskWrap: { marginBottom: spacing.sm },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.dark.accent,
    marginRight: spacing.md,
  },
  taskContent: { flex: 1 },
  taskKind: { ...typography.label, color: colors.dark.text },
  taskPlant: { ...typography.bodySmall, color: colors.dark.textSecondary, marginTop: 2 },
  doneLabel: { ...typography.caption, color: colors.dark.accent },
  emptyText: { ...typography.bodySmall, color: colors.dark.textSecondary },
  plantCardWrap: { marginBottom: spacing.sm },
  plantRow: { flexDirection: 'row', alignItems: 'center' },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: spacing.md,
  },
  plantName: { ...typography.title, color: colors.dark.text, flex: 1 },
  zoneTag: { ...typography.caption, color: colors.dark.textSecondary },
  actions: { paddingHorizontal: spacing.lg, marginTop: spacing.xxl, gap: spacing.md },
  primaryButton: {
    backgroundColor: colors.dark.accent,
    paddingVertical: 16,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  primaryButtonText: { ...typography.label, color: '#fff' },
  secondaryButton: {
    paddingVertical: 16,
    borderRadius: radius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.dark.border,
  },
  secondaryButtonText: { ...typography.label, color: colors.dark.textSecondary },
});
