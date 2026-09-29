// The plant detail screen's Actions tab (ticket 067): reminder cards (an
// overdue one in terracotta) with a "Fait" button, and the 10 newest care
// logs as a vertical timeline. app/plant/[id].js owns data loading and every
// handler passed in here.
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from '../Icon';
import { colors, spacing, typography, radius } from '../../lib/theme';
import { CARE_TYPES, REMINDER_KINDS, labelFor } from '../../lib/enums';
import { monthShort } from '../../lib/months';
import { reminderDueText } from '../../lib/reminderDue';

function formatLogDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!match) return iso ?? '';
  const [, , m, d] = match;
  return `${Number(d)} ${monthShort(Number(m)).toLowerCase()}.`;
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Historique</Text>
        {recentLogs.length === 0 ? (
          <Text style={styles.emptyText}>Aucun soin enregistré.</Text>
        ) : (
          <View style={styles.timeline}>
            {recentLogs.map((log, index) => (
              <View key={log.id} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View style={styles.timelineDot} />
                  {index < recentLogs.length - 1 ? <View style={styles.timelineLine} /> : null}
                </View>
                <View style={styles.timelineContent}>
                  <View style={styles.timelineTextCol}>
                    <Text style={styles.logType}>{labelFor(CARE_TYPES, log.type)}</Text>
                    <Text style={styles.logMeta}>
                      {formatLogDate(log.date)}
                      {log.notes ? ` · ${log.notes}` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => onDeleteCareLog(log)}>
                    <Text style={styles.logDeleteText}>Supprimer</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
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
