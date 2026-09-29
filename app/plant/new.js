import { useRouter, useLocalSearchParams } from 'expo-router';
import { PlantForm } from '../../components/PlantForm';
import { createPlant } from '../../lib/db';
import { emptyPlantForm } from '../../lib/plantFields';

export default function NewPlantScreen() {
  const router = useRouter();
  const { zoneId, returnTo } = useLocalSearchParams();

  return (
    <PlantForm
      title="Nouvelle plante"
      initialForm={emptyPlantForm()}
      preselectZoneId={zoneId}
      autoFocusName
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
