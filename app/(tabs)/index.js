import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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

const MONTHS_FULL = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
const HEADER_SUBTITLE = 'En ce moment : La floraison de printemps bat son plein.';
const SETTINGS_BLUE = '#3B82F6';
const CARD_WIDTH = 168;
const TASK_PHOTO_SIZE = 48;
const BLOOM_IMAGE_SIZE = CARD_WIDTH;

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

  const periodLabel = (p) => {
    if (!p.bloomStartMonth || !p.bloomEndMonth) return '';
    const start = MONTHS_FULL[p.bloomStartMonth - 1];
    const end = MONTHS_FULL[p.bloomEndMonth - 1];
    return start === end ? start : `${start} - ${end}`;
  };

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
          <View style={styles.heroRow}>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroTitle}>Votre jardin</Text>
              <Text style={styles.heroSubtitle}>{HEADER_SUBTITLE}</Text>
            </View>
            <View style={styles.heroIcons}>
              <TouchableOpacity
                style={[styles.heroIconBtn, styles.heroIconBtnBlue]}
                onPress={() => {}}
                activeOpacity={0.8}
              >
                <Ionicons name="settings" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.heroIconBtn, styles.heroIconBtnGray]}
                onPress={() => {}}
                activeOpacity={0.8}
              >
                <Ionicons name="person-outline" size={20} color={colors.dark.text} />
              </TouchableOpacity>
            </View>
          </View>
        </GradientHero>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Tâches du jour</Text>
            {tasks.length > 0 && (
              <Text style={styles.sectionCount}>({tasks.length})</Text>
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
                    {r.photoUri ? (
                      <Image source={{ uri: r.photoUri }} style={styles.taskPhoto} />
                    ) : (
                      <View style={[styles.taskPhoto, styles.taskPhotoPlaceholder]}>
                        <Ionicons name="leaf-outline" size={24} color={colors.dark.textSecondary} />
                      </View>
                    )}
                    <View style={styles.taskContent}>
                      <Text style={styles.taskTitle} numberOfLines={1}>
                        {reminderLabel(r.kind)} {r.plantName}
                      </Text>
                      <Text style={styles.taskSubtitle}>
                        Fréquence : tous les {r.frequencyDays} jours
                      </Text>
                    </View>
                    <View style={styles.doneButton}>
                      <Ionicons name="checkmark" size={22} color="#fff" />
                    </View>
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
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.bloomScrollContent}
              >
                {blooming.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    activeOpacity={0.9}
                    onPress={() => router.push(`/plant/${p.id}`)}
                    style={styles.bloomCardWrap}
                  >
                    <GlassCard style={styles.bloomCard} noPadding>
                      <View style={styles.bloomImageWrap}>
                        {p.photoUri ? (
                          <Image source={{ uri: p.photoUri }} style={styles.bloomImage} />
                        ) : (
                          <View style={[styles.bloomImage, styles.bloomImagePlaceholder]}>
                            <Ionicons name="flower-outline" size={40} color={colors.dark.textSecondary} />
                          </View>
                        )}
                        <TouchableOpacity
                          style={styles.bloomInfoBadge}
                          onPress={(e) => {
                            e.stopPropagation();
                            router.push(`/plant/${p.id}`);
                          }}
                        >
                          <Ionicons name="information-circle" size={20} color={colors.dark.text} />
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.bloomName} numberOfLines={1}>{p.name}</Text>
                      {periodLabel(p) ? (
                        <Text style={styles.bloomPeriod}>Période : {periodLabel(p)}</Text>
                      ) : null}
                      <Text style={styles.bloomVoir}>Voir</Text>
                    </GlassCard>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.bloomHint}>
                Toutes vos plantes en fleurs sont listées ici ! Ajoutez-en plus.
              </Text>
            </>
          )}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.background },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  heroTextWrap: { flex: 1, paddingRight: spacing.md },
  heroTitle: {
    ...typography.display,
    color: colors.dark.text,
    marginBottom: 4,
  },
  heroSubtitle: {
    ...typography.bodySmall,
    color: colors.dark.textSecondary,
  },
  heroIcons: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  heroIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIconBtnBlue: { backgroundColor: SETTINGS_BLUE },
  heroIconBtnGray: { backgroundColor: colors.dark.surface },
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
    marginLeft: spacing.xs,
  },
  taskWrap: { marginBottom: spacing.sm },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskPhoto: {
    width: TASK_PHOTO_SIZE,
    height: TASK_PHOTO_SIZE,
    borderRadius: TASK_PHOTO_SIZE / 2,
    marginRight: spacing.md,
  },
  taskPhotoPlaceholder: {
    backgroundColor: colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskContent: { flex: 1, minWidth: 0 },
  taskTitle: { ...typography.label, color: colors.dark.text },
  taskSubtitle: { ...typography.bodySmall, color: colors.dark.textSecondary, marginTop: 2 },
  doneButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.dark.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  emptyText: { ...typography.bodySmall, color: colors.dark.textSecondary },
  bloomScrollContent: { paddingRight: spacing.lg },
  bloomCardWrap: { marginRight: spacing.md },
  bloomCard: { width: CARD_WIDTH, padding: 0, overflow: 'hidden' },
  bloomImageWrap: { position: 'relative', width: CARD_WIDTH, height: BLOOM_IMAGE_SIZE },
  bloomImage: { width: CARD_WIDTH, height: BLOOM_IMAGE_SIZE },
  bloomImagePlaceholder: {
    backgroundColor: colors.dark.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bloomInfoBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bloomName: { ...typography.title, color: colors.dark.text, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  bloomPeriod: { ...typography.bodySmall, color: colors.dark.textSecondary, paddingHorizontal: spacing.md, paddingTop: 2 },
  bloomVoir: { ...typography.caption, color: colors.dark.text, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bloomHint: { ...typography.bodySmall, color: colors.dark.textSecondary, marginTop: spacing.md },
});
