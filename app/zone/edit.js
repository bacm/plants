import { useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ZoneForm } from '../../components/ZoneForm';
import { colors, typography, spacing } from '../../lib/theme';
import { getZones, updateZone } from '../../lib/db';

export default function EditZoneScreen() {
  const { id } = useLocalSearchParams();
  const [zone, setZone] = useState(null);

  const load = useCallback(async () => {
    const zones = await getZones();
    setZone(zones.find((z) => z.id === id) || null);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!zone) {
    return (
      <View style={styles.container}>
        <Text style={styles.placeholder}>Chargement…</Text>
      </View>
    );
  }

  return (
    <ZoneForm
      heroTitle="Modifier la zone"
      heroSubtitle={zone.name}
      backLabel="← Retour"
      saveLabel="Enregistrer"
      initialName={zone.name}
      initialDescription={zone.description || ''}
      initialIcon={zone.icon || '🌱'}
      onSave={(values) => updateZone(id, values)}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  placeholder: { ...typography.body, color: colors.textSecondary, padding: spacing.lg },
});
