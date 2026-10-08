// "Floraison observée" card of the plant detail Info tab (ticket 029): start /
// end buttons, an undo link for today's entry, and the observed seasons with
// how much earlier or later each started than the year before.
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from '../Icon';
import { FormSection } from '../form';
import { colors, spacing, typography } from '../../lib/theme';
import { bloomSeasons, seasonShift, shiftLabel } from '../../lib/bloomHistory';
import { shortDateLabel } from '../../lib/months';

function newestObservation(observations) {
  let best = null;
  for (const o of observations) {
    if (
      !best ||
      o.date > best.date ||
      (o.date === best.date && o.kind === 'end' && best.kind !== 'end')
    ) {
      best = o;
    }
  }
  return best;
}

export function ObservedBloom({ observations, todayISO, onBloomStart, onBloomEnd, onBloomUndo }) {
  const list = observations ?? [];
  const seasons = bloomSeasons(list, todayISO);
  const last = seasons[seasons.length - 1];
  const ongoing = last?.ongoing ? last : null;
  const newest = newestObservation(list);
  const canUndo = newest && newest.date === todayISO;

  return (
    <FormSection title="Floraison observée">
      {ongoing ? (
        <Text style={styles.line}>En fleur depuis le {shortDateLabel(ongoing.start)}</Text>
      ) : null}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.pill}
          onPress={ongoing ? onBloomEnd : onBloomStart}
          accessibilityRole="button"
          accessibilityLabel={ongoing ? 'Fin de floraison' : 'En fleur aujourd’hui'}>
          <Icon name="flower-outline" size={18} color="#fff" />
          <Text style={styles.pillText}>
            {ongoing ? 'Fin de floraison' : 'En fleur aujourd’hui'}
          </Text>
        </TouchableOpacity>
        {canUndo ? (
          <TouchableOpacity
            onPress={() => onBloomUndo(newest.id)}
            accessibilityRole="button"
            accessibilityLabel="Annuler la dernière observation">
            <Text style={styles.undoText}>Annuler</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {seasons.length === 0 ? (
        <Text style={styles.caption}>
          Notez le début et la fin de la floraison pour comparer d’une année sur l’autre.
        </Text>
      ) : (
        [...seasons].reverse().map((season) => {
          const shift = seasonShift(season, seasons);
          return (
            <View key={season.start} style={styles.seasonRow}>
              <View style={styles.seasonLine}>
                <Text style={styles.year}>{season.start.slice(0, 4)}</Text>
                <Text style={styles.range}>
                  {season.ongoing
                    ? `depuis le ${shortDateLabel(season.start)}`
                    : `${shortDateLabel(season.start)} → ${shortDateLabel(season.end)}`}
                </Text>
              </View>
              {shift ? (
                <Text style={styles.shift}>
                  {shiftLabel(shift.days, shift.previousStart.slice(0, 4))}
                </Text>
              ) : null}
            </View>
          );
        })
      )}
    </FormSection>
  );
}

const styles = StyleSheet.create({
  line: { ...typography.bodySmall, color: colors.text },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 28,
    backgroundColor: colors.accent,
  },
  pillText: { ...typography.label, color: '#fff' },
  undoText: { ...typography.caption, color: colors.accent },
  caption: { ...typography.caption, color: colors.textSecondary },
  seasonRow: { gap: 2 },
  seasonLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  year: { ...typography.label, fontWeight: '700', color: colors.text },
  range: { ...typography.bodySmall, color: colors.textSecondary },
  shift: { ...typography.caption, color: colors.textSecondary },
});
