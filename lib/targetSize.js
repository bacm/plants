// Pure sizing helper for the in-app camera (ticket 056): every shot is
// downscaled so its long side is at most `maxLongSide`, keeping the aspect
// ratio. Kept dependency-free (no expo-image-manipulator import) so it can
// be unit-tested under Jest; app/capture.js feeds the result straight into
// expo-image-manipulator's `resize` action.

/**
 * Returns the `{ width, height }` to resize an image of `width` x `height`
 * to, so its longest side is at most `maxLongSide`. An image already at or
 * under the limit is returned unchanged (never upscaled). Dimensions are
 * rounded to the nearest integer pixel.
 */
export function targetSize(width, height, maxLongSide) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width, height };
  }
  if (!Number.isFinite(maxLongSide) || maxLongSide <= 0) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const longSide = Math.max(width, height);
  if (longSide <= maxLongSide) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxLongSide / longSide;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
