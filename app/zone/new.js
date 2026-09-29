import { ZoneForm } from '../../components/ZoneForm';
import { createZone } from '../../lib/db';

export default function NewZoneScreen() {
  return (
    <ZoneForm
      title="Nouvelle zone"
      saveLabel="Créer la zone"
      onSave={(values) => createZone(values)}
    />
  );
}
