import { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { PlantForm } from '../../components/PlantForm';
import { colors, typography, spacing } from '../../lib/theme';
import { createPlant, getPlantById } from '../../lib/db';
import { emptyPlantForm, duplicatePlantForm } from '../../lib/plantFields';

export default function NewPlantScreen() {
  const router = useRouter();
  const { zoneId, returnTo, copyOf } = useLocalSearchParams();
  // Ticket 118: `copyOf` prefills the form from that plant's species sheet.
  // `original` stays undefined while loading, null when there is nothing to copy.
  const [original, setOriginal] = useState(copyOf ? undefined : null);

  useEffect(() => {
    if (!copyOf) return;
    let cancelled = false;
    getPlantById(copyOf)
      .then((p) => {
        if (!cancelled) setOriginal(p || null);
      })
      .catch(() => {
        if (!cancelled) setOriginal(null);
      });
    return () => {
      cancelled = true;
    };
  }, [copyOf]);

  if (original === undefined) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>Chargement…</Text>
      </View>
    );
  }

  return (
    <PlantForm
      title="Nouvelle plante"
      initialForm={original ? duplicatePlantForm(original) : emptyPlantForm()}
      notice={
        original
          ? {
              title: `Copie de ${original.name}.`,
              text: 'La fiche espèce est reprise ; photos, journal, rappels, emplacement sur le plan, date de plantation et notes ne le sont pas.',
            }
          : undefined
      }
      preselectZoneId={zoneId}
      autoFocusName={!original}
      onSubmit={(values) => {
        const plantId = createPlant(values);
        if (returnTo === 'capture') {
          // The garden-walk camera (ticket 056) opened this screen from its
          // "+" strip item; go back there with the new plant preselected
          // instead of jumping to its detail screen.
          router.replace(`/capture?selectPlantId=${plantId}`);
        } else if (returnTo === 'sort') {
          // Same idea from the "À trier" sorting screen's "+" strip item
          // (ticket 061): go back there with the new plant preselected so the
          // photo being sorted can be assigned to it right away.
          router.replace(`/sort?selectPlantId=${plantId}`);
        } else {
          router.replace(`/plant/${plantId}`);
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  placeholder: { ...typography.body, color: colors.textSecondary, padding: spacing.lg },
});
