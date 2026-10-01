// The plant detail screen's Actions tab (ticket 067): reminder cards (an
// overdue one in terracotta) with a "Fait" button, the latest measured size
// with its growth curve (ticket 115), and the 10 newest journal entries (care
// and observations) as a vertical timeline. app/plant/[id].js owns data loading and every
// handler passed in here.
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Polyline, Circle, Text as SvgText } from 'react-native-svg';
import Icon from '../Icon';
import { colors, spacing, typography, radius } from '../../lib/theme';
import { REMINDER_KINDS, labelFor } from '../../lib/enums';
import {
  formatShortDate,
  growthCurve,
  journalEntryText,
  latestMeasurement,
  measurementText,
  measurementsOf,
  polylinePoints,
} from '../../lib/journal';
import { reminderDueText } from '../../lib/reminderDue';

const CURVE_W = 150;
const CURVE_H = 56;

// The "Taille" card (PlanteActions artboard): the latest measurement and,
// from two measurements on, the growth curve (width solid, height dotted).
function SizeCard({ careLogs }) {
  const latest = latestMeasurement(careLogs);
  if (!latest) return null;
  const measurements = measurementsOf(careLogs);
  const curve = growthCurve(measurements, { width: CURVE_W, height: CURVE_H });
  const lastWidth = curve.width[curve.width.length - 1];
  return (
    <View style={styles.sizeCard} testID="size-card">
      <View style={styles.sizeInfo}>
        <Text style={styles.sizeEyebrow}>Taille</Text>
        <Text style={styles.sizeValue}>{measurementText(latest)}</Text>
        <Text style={styles.sizeDate}>mesuré le {formatShortDate(latest.date)}</Text>
      </View>
      {measurements.length >= 2 ? (
        <Svg
          testID="growth-curve"
          width="100%"
          height={CURVE_H}
          viewBox={`0 0 ${CURVE_W} ${CURVE_H}`}
          accessibilityLabel="Croissance : largeur et hauteur mesurées"
          style={styles.curve}>
          {curve.width.length >= 2 ? (
            <Polyline
              points={polylinePoints(curve.width)}
              fill="none"
              stroke={colors.accent}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {curve.height.length >= 2 ? (
            <Polyline
              points={polylinePoints(curve.height)}
              fill="none"
              stroke={colors.textSecondary}
              strokeWidth={2}
              strokeDasharray="4 3"
              strokeLinecap="round"
            />
          ) : null}
          {lastWidth ? (
            <Circle cx={lastWidth.x} cy={lastWidth.y} r={3.5} fill={colors.accent} />
          ) : null}
          <SvgText
            x={4}
            y={10}
            fontSize={9}
            fontFamily={typography.body.fontFamily}
            fill={colors.textSecondary}>
            — largeur - - hauteur
          </SvgText>
        </Svg>
      ) : null}
    </View>
  );
}

export function ActionsTab({
  reminders,
  careLogs,
  onReminderDone,
  onManageReminders,
  onDeleteCareLog,
  onDeletePlant,
}) {
  const activeReminders = reminders.filter((r) => r.enabled);
  const recentLogs = careLogs.slice(0, 10);

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Rappels</Text>
          <TouchableOpacity onPress={onManageReminders}>
            <Text style={styles.sectionLink}>Gérer</Text>
          </TouchableOpacity>
        </View>
        {activeReminders.length === 0 ? (
          <Text style={styles.emptyText}>Aucun rappel.</Text>
        ) : (
          <View style={styles.reminderList}>
            {activeReminders.map((r) => {
              const due = reminderDueText(r.nextDueDate);
              return (
                <View
                  key={r.id}
                  style={[styles.reminderCard, due.overdue && styles.reminderCardOverdue]}>
                  <View style={styles.reminderInfo}>
                    <Text style={styles.reminderKind}>{labelFor(REMINDER_KINDS, r.kind)}</Text>
                    <Text style={[styles.reminderDue, due.overdue && styles.reminderDueOverdue]}>
                      {due.text}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.doneButton}
                    onPress={() => onReminderDone(r)}
                    accessibilityRole="button"
                    accessibilityLabel="Fait">
                    <Icon name="check" size={16} color={colors.accent} />
                    <Text style={styles.doneButtonText}>Fait</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <SizeCard careLogs={careLogs} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Journal</Text>
        {recentLogs.length === 0 ? (
          <Text style={styles.emptyText}>Rien dans le journal pour l’instant.</Text>
        ) : (
          <View style={styles.timeline}>
            {recentLogs.map((log, index) => {
              const entry = journalEntryText(log);
              return (
                <View key={log.id} style={styles.timelineRow}>
                  <View style={styles.timelineRail}>
                    <View style={styles.timelineDot} />
                    {index < recentLogs.length - 1 ? <View style={styles.timelineLine} /> : null}
                  </View>
                  <View style={styles.timelineContent}>
                    <View style={styles.timelineTextCol}>
                      <Text style={styles.logType}>{entry.title}</Text>
                      <Text style={styles.logMeta}>{entry.meta}</Text>
                    </View>
                    <TouchableOpacity onPress={() => onDeleteCareLog(log)}>
                      <Text style={styles.logDeleteText}>Supprimer</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <TouchableOpacity onPress={onDeletePlant} style={styles.deleteBtn}>
        <Text style={styles.deleteBtnText}>Supprimer la plante</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xl },
  section: { gap: spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: { ...typography.title, fontSize: 15, color: colors.text },
  sectionLink: { ...typography.label, fontWeight: '600', color: colors.accent },
  emptyText: { ...typography.bodySmall, color: colors.textSecondary },

  reminderList: { gap: spacing.sm },
  reminderCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.sm,
    paddingLeft: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  reminderCardOverdue: { borderColor: colors.blush },
  reminderInfo: { flex: 1, gap: 2 },
  reminderKind: { ...typography.label, fontSize: 15, fontWeight: '600', color: colors.text },
  reminderDue: { ...typography.bodySmall, color: colors.textSecondary },
  reminderDueOverdue: { color: colors.terracotta, fontWeight: '600' },
  doneButton: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  doneButtonText: { ...typography.label, fontWeight: '600', color: colors.accent },

  sizeCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  sizeInfo: { gap: 2, flexShrink: 0 },
  sizeEyebrow: {
    ...typography.caption,
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textSecondary,
  },
  sizeValue: { ...typography.title, fontSize: 20, fontWeight: '600', color: colors.text },
  sizeDate: { ...typography.caption, color: colors.textSecondary },
  curve: { flexGrow: 1, flexShrink: 1, minWidth: 0 },

  timeline: { gap: 0 },
  timelineRow: { flexDirection: 'row', gap: spacing.md },
  timelineRail: { width: 12, alignItems: 'center' },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accent,
    marginTop: 5,
  },
  timelineLine: { width: 2, flexGrow: 1, backgroundColor: colors.border, marginTop: 4 },
  timelineContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingBottom: 14,
  },
  timelineTextCol: { flex: 1, gap: 2 },
  logType: { ...typography.label, fontSize: 15, fontWeight: '600', color: colors.text },
  logMeta: { ...typography.bodySmall, color: colors.textSecondary },
  logDeleteText: { ...typography.caption, color: colors.textSecondary },

  deleteBtn: { paddingVertical: 12, alignItems: 'center' },
  deleteBtnText: { ...typography.caption, color: colors.textSecondary },
});
