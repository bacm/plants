// The plant detail screen's Info tab (ticket 067): the Floraison card with
// its 12-month strip, the Exposition/Arrosage tiles, then every other
// "fiche technique" section restyled as a white FormSection card. Pure
// presentation -- app/plant/[id].js owns data loading and the `onEdit`
// navigation handler.
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from '../Icon';
import { FormSection } from '../form';
import { ObservedBloom } from './ObservedBloom';
import { colors, spacing, typography, colorHex } from '../../lib/theme';
import { isUnknown, labelFor, BLOOM_ABUNDANCE, PROPAGATION, TOXICITY } from '../../lib/enums';
import { monthShort, monthName, MONTH_LETTERS, isMonthInRange } from '../../lib/months';
import {
  ficheTechniqueTiles,
  ficheTechniqueMissing,
  solTiles,
  solMissing,
} from '../../lib/plantSheet';

// Shown as their own cards above, so they're dropped from the generic
// "fiche technique" tile grid -- their missing labels still surface through
// ficheTechniqueMissing()'s unfiltered "À compléter" list below.
const DEDICATED_TILE_KEYS = new Set(['bloom', 'sun', 'water']);

export function InfoTab({
  plant,
  onEdit,
  bloomObservations,
  onBloomStart,
  onBloomEnd,
  onBloomUndo,
}) {
  const allFicheTiles = ficheTechniqueTiles(plant);
  const ficheTiles = allFicheTiles.filter((t) => !DEDICATED_TILE_KEYS.has(t.key));
  const ficheMissing = ficheTechniqueMissing(plant);
  const bloomTile = allFicheTiles.find((t) => t.key === 'bloom');
  const sunTile = allFicheTiles.find((t) => t.key === 'sun');
  const waterTile = allFicheTiles.find((t) => t.key === 'water');
  const currentMonth = new Date().getMonth() + 1;
  const plantSolTiles = solTiles(plant);
  const plantSolMissing = solMissing(plant);

  return (
    <View style={styles.container}>
      {bloomTile ? (
        <FormSection>
          <View style={styles.bloomHeader}>
            <Text style={styles.bloomTitle}>Floraison</Text>
            <Text style={styles.bloomRange}>
              {monthName(plant.bloomStartMonth)} → {monthName(plant.bloomEndMonth)}
            </Text>
          </View>
          {!isUnknown(plant.bloomAbundance) ? (
            <Text style={styles.bloomAbundance}>
              Abondance : {labelFor(BLOOM_ABUNDANCE, plant.bloomAbundance)}
            </Text>
          ) : null}
          <View style={styles.monthStrip}>
            {MONTH_LETTERS.map((letter, i) => {
              const month = i + 1;
              const on = isMonthInRange(month, plant.bloomStartMonth, plant.bloomEndMonth);
              const isCurrent = month === currentMonth;
              return (
                <View key={month} style={styles.monthCell}>
                  <View
                    style={[
                      styles.monthBox,
                      { backgroundColor: on ? colorHex(plant.flowerColor) : colors.background },
                      isCurrent && styles.monthBoxCurrent,
                    ]}
                  />
                  <Text style={[styles.monthLetter, isCurrent && styles.monthLetterCurrent]}>
                    {letter}
                  </Text>
                </View>
              );
            })}
          </View>
        </FormSection>
      ) : null}

      <ObservedBloom
        observations={bloomObservations}
        todayISO={new Date().toISOString().slice(0, 10)}
        onBloomStart={onBloomStart}
        onBloomEnd={onBloomEnd}
        onBloomUndo={onBloomUndo}
      />

      {sunTile || waterTile ? (
        <View style={styles.tileRow}>
          {sunTile ? (
            <View style={[styles.tile, { backgroundColor: colors.sun }]}>
              <Icon name={sunTile.icon} size={22} color={colors.text} />
              <View>
                <Text style={styles.tileLabel}>Exposition</Text>
                <Text style={styles.tileValue}>{sunTile.value}</Text>
              </View>
            </View>
          ) : null}
          {waterTile ? (
            <View style={[styles.tile, { backgroundColor: colors.water }]}>
              <Icon name={waterTile.icon} size={22} color={colors.text} />
              <View>
                <Text style={styles.tileLabel}>Arrosage</Text>
                <Text style={styles.tileValue}>{waterTile.value}</Text>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      <FormSection title="Fiche technique">
        {ficheTiles.length > 0 ? (
          <View style={styles.infoGrid}>
            {ficheTiles.map((tile) => (
              <InfoCard key={tile.key} icon={tile.icon} label={tile.label} value={tile.value} />
            ))}
          </View>
        ) : null}
        {plant.notes ? (
          <NoteRow icon="note-text-outline" label="Notes" value={plant.notes} />
        ) : null}
        {ficheMissing.length > 0 ? (
          <TouchableOpacity onPress={onEdit}>
            <Text style={styles.missingLinkText}>
              À compléter : {ficheMissing.join(', ').toLowerCase()}
            </Text>
          </TouchableOpacity>
        ) : null}
      </FormSection>

      {plantSolTiles.length > 0 || plantSolMissing.length > 0 ? (
        <FormSection title="Sol">
          {plantSolTiles.length > 0 ? (
            <View style={styles.infoGrid}>
              {plantSolTiles.map((tile) => (
                <InfoCard key={tile.key} icon={tile.icon} label={tile.label} value={tile.value} />
              ))}
            </View>
          ) : null}
          {plantSolMissing.length > 0 ? (
            <TouchableOpacity onPress={onEdit}>
              <Text style={styles.missingLinkText}>
                À compléter : {plantSolMissing.join(', ').toLowerCase()}
              </Text>
            </TouchableOpacity>
          ) : null}
        </FormSection>
      ) : null}

      {plant.fertilizer || plant.pruning || plant.winterCare ? (
        <FormSection title="Entretien">
          {plant.fertilizer ? (
            <NoteRow icon="flask-outline" label="Engrais" value={plant.fertilizer} />
          ) : null}
          {plant.pruning ? (
            <NoteRow
              icon="content-cut"
              label={`Taille${plant.pruningMonth ? ` (${monthShort(plant.pruningMonth)})` : ''}`}
              value={plant.pruning}
            />
          ) : null}
          {plant.winterCare ? (
            <NoteRow icon="snowflake" label="Entretien hivernal" value={plant.winterCare} />
          ) : null}
        </FormSection>
      ) : null}

      {plant.pests || !isUnknown(plant.toxicity) ? (
        <FormSection title="Santé">
          {!isUnknown(plant.toxicity) ? (
            <View style={styles.infoGrid}>
              <InfoCard
                icon={plant.toxicity !== 'none' ? 'alert-outline' : 'check-circle-outline'}
                label="Toxicité"
                value={
                  plant.toxicity !== 'none' ? labelFor(TOXICITY, plant.toxicity) : 'Non toxique'
                }
              />
            </View>
          ) : null}
          {plant.pests ? (
            <NoteRow icon="bug-outline" label="Ravageurs / Maladies" value={plant.pests} />
          ) : null}
        </FormSection>
      ) : null}

      {plant.propagation ? (
        <FormSection title="Multiplication">
          <View style={styles.infoGrid}>
            <InfoCard
              icon="sprout-outline"
              value={labelFor(PROPAGATION, plant.propagation) || '—'}
            />
          </View>
        </FormSection>
      ) : null}

      {plant.harvest || plant.harvestMonthStart ? (
        <FormSection title="Récolte">
          {plant.harvestMonthStart != null && plant.harvestMonthEnd != null ? (
            <View style={styles.infoGrid}>
              <InfoCard
                icon="calendar-month-outline"
                value={`${monthShort(plant.harvestMonthStart)} — ${monthShort(plant.harvestMonthEnd)}`}
              />
            </View>
          ) : null}
          {plant.harvest ? (
            <NoteRow icon="basket-outline" label="Récolte" value={plant.harvest} />
          ) : null}
        </FormSection>
      ) : null}

      {plant.companionPlants || plant.origin ? (
        <FormSection title="Autres">
          {plant.companionPlants ? (
            <NoteRow
              icon="handshake-outline"
              label="Plantes compagnes"
              value={plant.companionPlants}
            />
          ) : null}
          {plant.origin ? <NoteRow icon="earth" label="Origine" value={plant.origin} /> : null}
        </FormSection>
      ) : null}

      <TouchableOpacity style={styles.editButton} onPress={onEdit} accessibilityRole="button">
        <Text style={styles.editButtonText}>Modifier la fiche</Text>
      </TouchableOpacity>
    </View>
  );
}

function InfoCard({ icon, label, value }) {
  return (
    <View style={styles.infoCard}>
      <Icon name={icon} size={24} color={colors.text} />
      {label ? <Text style={styles.infoCardLabel}>{label}</Text> : null}
      <Text style={styles.infoCardValue}>{value}</Text>
    </View>
  );
}

function NoteRow({ icon, label, value }) {
  return (
    <View style={styles.noteRow}>
      <View style={styles.noteRowHeader}>
        <Icon name={icon} size={18} color={colors.text} style={styles.noteIcon} />
        <Text style={styles.noteLabel}>{label} :</Text>
      </View>
      <Text style={styles.noteValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 18 },

  bloomHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  bloomTitle: { ...typography.title, fontSize: 15, color: colors.text },
  bloomAbundance: { ...typography.bodySmall, color: colors.textSecondary },
  bloomRange: { ...typography.bodySmall, color: colors.textSecondary },
  monthStrip: { flexDirection: 'row', gap: 4 },
  monthCell: { flex: 1, alignItems: 'center', gap: 6 },
  monthBox: { width: '100%', height: 28, borderRadius: 8 },
  monthBoxCurrent: { borderWidth: 2, borderColor: colors.text },
  monthLetter: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  monthLetterCurrent: { fontWeight: '700', color: colors.text },

  tileRow: { flexDirection: 'row', gap: spacing.sm },
  tile: { flex: 1, borderRadius: 24, padding: 16, gap: 10 },
  tileLabel: { ...typography.caption, color: colors.textSecondary },
  tileValue: { ...typography.label, fontSize: 16, fontWeight: '600', color: colors.text },

  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  infoCard: {
    width: '31%',
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 96,
  },
  infoCardLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  infoCardValue: {
    ...typography.bodySmall,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 18,
  },
  missingLinkText: { ...typography.caption, color: colors.accent },

  noteRow: { gap: spacing.xs },
  noteRowHeader: { flexDirection: 'row', alignItems: 'center' },
  noteIcon: { marginRight: 8 },
  noteLabel: { ...typography.label, color: colors.text, fontWeight: '600' },
  noteValue: { ...typography.bodySmall, color: colors.textSecondary },

  editButton: {
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  editButtonText: { ...typography.label, color: colors.textSecondary },
});
