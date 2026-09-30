// Which photo represents a plant (ticket 088): the one the owner chose if it
// is still in the plant's photos, otherwise the newest.

/**
 * @param {Array<{id: string}>} photos one plant's photos, newest first
 * @param {string|null|undefined} coverPhotoId the chosen cover, if any
 */
export function pickCoverPhoto(photos, coverPhotoId) {
  if (!photos || photos.length === 0) return null;
  if (coverPhotoId != null) {
    const chosen = photos.find((p) => p.id === coverPhotoId);
    if (chosen) return chosen;
  }
  return photos[0];
}
