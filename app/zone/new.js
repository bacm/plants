import { ZoneForm } from '../../components/ZoneForm';
import { createZone } from '../../lib/db';

export default function NewZoneScreen() {
  return (
    <ZoneForm
      heroTitle="Nouvelle zone"
      heroSubtitle="Massif, bac, balcon…"
      saveLabel="Créer la zone"
      onSave={(values) => createZone(values)}
    />
  );
}
