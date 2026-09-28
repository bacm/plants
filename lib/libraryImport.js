// Shared "pick photos from the device library, downscale, file them as
// unsorted" step (ticket 061), used by both the camera screen's "Galerie"
// button and the À trier screen's own "Importer de la galerie" -- so the
// permission request, EXIF/lastModified date extraction and downscaling
// only exist in one place, not two screens that would drift apart.
import * as ImagePicker from 'expo-image-picker';
import { prepareForStorage } from './photoPipeline';
import { originalPhotoDate } from './originalPhotoDate';
import { addUnsortedPhoto } from './db';

/**
 * Opens the library picker (multi-select, EXIF requested), downscales and
 * files every photo picked into "À trier" with its own original date (see
 * lib/originalPhotoDate.js) via `addUnsortedPhoto`.
 *
 * Returns `{ imported, canceled, permissionDenied }`: `imported` is the
 * number of photos actually filed (0 when canceled or denied);
 * `permissionDenied` distinguishes "the user has no photos to share" from
 * "we were never allowed to ask", so a caller can show the right message.
 */
export async function importPhotosFromLibrary() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return { imported: 0, canceled: false, permissionDenied: true };
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    allowsMultipleSelection: true,
    selectionLimit: 0,
    exif: true,
    quality: 1,
  });
  if (result.canceled || !result.assets?.length) {
    return { imported: 0, canceled: true, permissionDenied: false };
  }

  for (const asset of result.assets) {
    const { date, unknown } = originalPhotoDate(asset);
    const resizedUri = await prepareForStorage(asset.uri, asset.width, asset.height);
    await addUnsortedPhoto({ uri: resizedUri, takenAt: date, dateUnknown: unknown });
  }

  return { imported: result.assets.length, canceled: false, permissionDenied: false };
}
