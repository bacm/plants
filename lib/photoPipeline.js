// Shared "downscale before it enters app storage" step (ticket 056/061).
// The camera shutter, the gallery import and, previously, nothing else all
// needed the same three lines of expo-image-manipulator plumbing; kept here
// once so the target size (and JPEG/compression settings) cannot drift
// between callers the way the ~30 plant fields did (see CLAUDE.md's coding
// rule 3).
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { targetSize } from './targetSize';

export const MAX_PHOTO_LONG_SIDE = 2048;

/**
 * Downscales the image at `uri` (with source dimensions `width` x
 * `height`) so its long side is at most `MAX_PHOTO_LONG_SIDE`, and returns
 * the resulting local uri. Always re-encodes to JPEG at a fixed
 * compression level, even for an image already under the limit, so every
 * caller (capture, import, and any future one) stores a predictable
 * format regardless of the source.
 */
export async function prepareForStorage(uri, width, height) {
  const size = targetSize(width, height, MAX_PHOTO_LONG_SIDE);
  const resized = await manipulateAsync(uri, [{ resize: size }], {
    compress: 0.8,
    format: SaveFormat.JPEG,
  });
  return resized.uri;
}
