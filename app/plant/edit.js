import { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { PlantForm } from '../../components/PlantForm';
import { colors, typography, spacing } from '../../lib/theme';
import { getPlantById, updatePlant } from '../../lib/db';
import { plantRowToForm } from '../../lib/plantFields';

export default function EditPlantScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [plant, setPlant] = useState(null);

  useEffect(() => {
    if (id) getPlantById(id).then((p) => setPlant(p || null));
  }, [id]);

  if (!plant) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>Chargement…</Text>
      </View>
    );
  }

  return (
    <PlantForm
      title="Modifier"
      initialForm={plantRowToForm(plant)}
      initialShowMore
      onSubmit={async (values) => {
        await updatePlant(id, values);
        // back(), not replace(): the detail screen is still underneath and reloads
        // on focus. replace() stacked a second copy of it, which broke "Retour".
        router.back();
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  placeholder: { ...typography.body, color: colors.textSecondary, padding: spacing.lg },
});
