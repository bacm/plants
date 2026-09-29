// The one delete-a-plant flow, shared by the detail screen's Actions tab and
// the edit screen's destructive button (ticket 077): confirm, delete, surface
// a failure, and leave no screen of the deleted plant in the back stack.
import { useRouter } from 'expo-router';
import { confirm, showMessage } from '../../lib/dialogs';
import { deletePlant } from '../../lib/db';

export function useDeletePlant(plantId) {
  const router = useRouter();

  const deletePlantWithConfirm = async () => {
    const ok = await confirm({
      title: 'Supprimer la plante',
      message: 'Cette plante et tout son historique seront supprimés.',
      confirmLabel: 'Supprimer',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deletePlant(plantId);
    } catch (e) {
      showMessage('Erreur', `Impossible de supprimer la plante : ${e.message}`);
      return;
    }
    router.dismissTo('/(tabs)');
  };

  return { deletePlantWithConfirm };
}
