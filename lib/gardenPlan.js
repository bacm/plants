// Garden plan (ticket 105): pure geometry and formatting. No React Native or db
// import, so lib/db.js, lib/db.web.js, the plan screens and Jest all share it.
//
// Every length is an integer number of centimetres, in "plan space": x runs
// right, y runs down, (0, 0) is the top-left corner of the garden. A polygon is
// an array of [x, y] points. Screen space is pixels; see toScreen / toPlan.

// The garden_plan table holds a single live row with this id.
export const GARDEN_PLAN_ID = 'main';

// Largest side a plan may have: 1 km, far beyond any garden, but a guard
// against a typo such as an extra zero.
export const MAX_PLAN_CM = 100000;

/** True when `n` is a finite integer. */
function isInt(n) {
  return typeof n === 'number' && Number.isInteger(n);
}

/** True when `p` is a [x, y] pair of finite integers. */
function isPoint(p) {
  return Array.isArray(p) && p.length === 2 && isInt(p[0]) && isInt(p[1]);
}

/** Twice the signed area of a polygon, in cm² (shoelace formula). */
function signedDoubleArea(polygon) {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum;
}

/**
 * Area of a polygon in m² (shoelace formula; the input is in cm², hence the
 * division by 10 000). Always positive, whatever the winding order.
 */
export function polygonAreaM2(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return 0;
  return Math.abs(signedDoubleArea(polygon)) / 2 / 10000;
}

function onSegment(px, py, [x1, y1], [x2, y2]) {
  const cross = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
  if (cross !== 0) return false;
  return (
    px >= Math.min(x1, x2) &&
    px <= Math.max(x1, x2) &&
    py >= Math.min(y1, y2) &&
    py <= Math.max(y1, y2)
  );
}

/**
 * Ray casting. A point exactly on an edge or a corner counts as INSIDE, so a
 * plant dropped on a zone's border still belongs to that zone. Works for
 * concave polygons. `point` is [x, y] or {x, y}.
 */
export function pointInPolygon(point, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  const [px, py] = Array.isArray(point) ? point : [point.x, point.y];
  for (let i = 0; i < polygon.length; i++) {
    if (onSegment(px, py, polygon[i], polygon[(i + 1) % polygon.length])) return true;
  }
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The zone under a point, among `zones` ([{ id, polygon }], polygon may be
 * null or invalid and is then ignored). When zones overlap, the one with the
 * smallest area wins (a bed inside a lawn). Returns the zone or null.
 */
export function zoneAt(point, zones) {
  let best = null;
  let bestArea = Infinity;
  for (const zone of zones || []) {
    const polygon = Array.isArray(zone.polygon) ? zone.polygon : parsePolygon(zone.polygon);
    if (!polygon || !pointInPolygon(point, polygon)) continue;
    const area = polygonAreaM2(polygon);
    if (area < bestArea) {
      best = zone;
      bestArea = area;
    }
  }
  return best;
}

/** The four corners of a rectangle whose top-left corner is (x, y), clockwise. */
export function rectanglePolygon({ x, y, widthCm, lengthCm }) {
  return [
    [x, y],
    [x + widthCm, y],
    [x + widthCm, y + lengthCm],
    [x, y + lengthCm],
  ];
}

/**
 * A polygon is valid when it has at least 3 points, all [int, int], no two
 * consecutive points (including last/first) equal, and a non-zero area.
 * Self-intersection is not checked.
 */
export function isValidPolygon(polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  if (!polygon.every(isPoint)) return false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (a[0] === b[0] && a[1] === b[1]) return false;
  }
  return signedDoubleArea(polygon) !== 0;
}

/**
 * Reads a stored polygon (JSON string) back into an array. Null, invalid JSON
 * or an invalid polygon all give null.
 */
export function parsePolygon(value) {
  if (value == null || value === '') return null;
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return isValidPolygon(parsed) ? parsed : null;
}

/** JSON string to store for a polygon; null for null. Throws on an invalid one. */
export function serializePolygon(polygon) {
  if (polygon == null) return null;
  if (!isValidPolygon(polygon)) throw new Error('Contour de zone invalide.');
  return JSON.stringify(polygon);
}

/**
 * Plan (cm) to screen (px). `view` is { scale (px per cm), offsetX, offsetY }
 * where the offsets are the screen position of the plan origin.
 */
export function toScreen({ x, y }, { scale, offsetX, offsetY }) {
  return { x: x * scale + offsetX, y: y * scale + offsetY };
}

/** Screen (px) to plan (cm), rounded to a whole centimetre. */
export function toPlan({ x, y }, { scale, offsetX, offsetY }) {
  return { x: Math.round((x - offsetX) / scale), y: Math.round((y - offsetY) / scale) };
}

// Size of a dot on the plan when the plant has no planSizeCm (ticket 108).
export const DEFAULT_PLAN_SIZE_CM = 50;
export const MIN_PLAN_SIZE_CM = 5;
export const MAX_PLAN_SIZE_CM = 5000;

/**
 * Diameter in px of a plant's dot: its plan size (planSizeCm) at the current
 * scale, but never under `minPx` so it stays touchable. A plant with no (or
 * invalid) size is drawn as `fallbackCm` wide. The adult width is not used.
 */
export function dotDiameterPx(
  planSizeCm,
  scale,
  { minPx = 12, fallbackCm = DEFAULT_PLAN_SIZE_CM } = {}
) {
  const cm = typeof planSizeCm === 'number' && planSizeCm > 0 ? planSizeCm : fallbackCm;
  return Math.max(minPx, cm * scale);
}

function decimal(n, digits = 1) {
  const rounded = Number(n.toFixed(digits));
  return String(rounded).replace('.', ',');
}

/** "39,2 m²" (one decimal); "< 0,1 m²" when above zero but under 0,05 m². */
export function formatArea(m2) {
  if (!(m2 > 0)) return `0 m²`;
  if (m2 < 0.05) return `< 0,1 m²`;
  return `${decimal(m2)} m²`;
}

/** "1,5 m" for 150 cm; whole metres drop the decimal ("15 m"). */
export function formatLength(cm) {
  return `${decimal(cm / 100, 2)} m`;
}

/** "15 × 25 m", "12,5 × 8 m". */
export function formatSize(widthCm, lengthCm) {
  return `${decimal(widthCm / 100, 2)} × ${decimal(lengthCm / 100, 2)} m`;
}

/** Throws a French Error unless width and length are positive ints within MAX_PLAN_CM. */
export function assertValidPlanSize({ widthCm, lengthCm }) {
  for (const value of [widthCm, lengthCm]) {
    if (!isInt(value) || value <= 0 || value > MAX_PLAN_CM) {
      throw new Error(
        `Dimensions du plan invalides : entiers en centimètres entre 1 et ${MAX_PLAN_CM}.`
      );
    }
  }
}

/** Throws a French Error unless `cm` is null or an integer from 5 to 5000. */
export function assertValidPlanSizeCm(cm) {
  if (cm === null) return;
  if (!isInt(cm) || cm < MIN_PLAN_SIZE_CM || cm > MAX_PLAN_SIZE_CM) {
    throw new Error(
      `Taille invalide : entre ${MIN_PLAN_SIZE_CM} cm et ${MAX_PLAN_SIZE_CM / 100} m.`
    );
  }
}

/** Throws a French Error unless x and y are both null or both integers. */
export function assertValidPosition({ x, y }) {
  if (x === null && y === null) return;
  if (!isInt(x) || !isInt(y)) {
    throw new Error('Position invalide : deux entiers en centimètres, ou aucune.');
  }
}
