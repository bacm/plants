// The one place that reads EXPO_PUBLIC_PLANT_API_URL (a URL, not a secret).
// Read at call time, and spelled out in full, so Metro can still inline it.
// Returns null when the variable is unset.
export function apiUrl(path) {
  const base = process.env.EXPO_PUBLIC_PLANT_API_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}${path}`;
}
