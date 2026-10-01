// Drawing and editing a zone's outline on the plan (ticket 107): pure logic, so
// the screens stay thin and Jest covers it. Same conventions as
// lib/gardenPlan.js: plan space in integer cm, polygons are arrays of [x, y],
// screen space in px with a `view` of { scale, offsetX, offsetY }.
import { toPlan, toScreen, formatLength, isValidPolygon, rectanglePolygon } from './gardenPlan';
import { clampToPlan, snapToGrid } from './planView';
import { plural } from './text';

const clampInt = (value, min, max) => Math.round(Math.min(max, Math.max(min, value)));

/**
 * The corner list after a tap at `point` (plan cm): clamped into the garden
 * (on the 50 cm grid with `magnet`), never twice in a row.
 */
export function addCorner(corners, point, plan, { magnet = false } = {}) {
  const at = magnet ? snapToGrid(point, plan) : clampToPlan(point, plan);
  const next = [Math.round(at.x), Math.round(at.y)];
  const last = corners[corners.length - 1];
  if (last && last[0] === next[0] && last[1] === next[1]) return corners;
  return [...corners, next];
}

/** The corner list without its last corner. */
export function removeLastCorner(corners) {
  return corners.slice(0, -1);
}

/** "Nouvelle zone · 3 coins" (the header while drawing); just "Nouvelle zone" with none. */
export function traceSubtitle(count) {
  return count ? `Nouvelle zone · ${count} ${plural(count, 'coin', 'coins')}` : 'Nouvelle zone';
}

/**
 * The sides of a polygon, for the length pills: [{ from, to, mid, normal,
 * lengthCm, text }]. With `closed` false the closing side (last -> first) is
 * left out. `normal` is the unit vector perpendicular to the side, pointing
 * away from the polygon's centre (so a pill can sit outside the shape).
 */
export function sideLengths(polygon, closed) {
  const count = closed ? polygon.length : polygon.length - 1;
  if (count < 1) return [];
  const cx = polygon.reduce((sum, p) => sum + p[0], 0) / polygon.length;
  const cy = polygon.reduce((sum, p) => sum + p[1], 0) / polygon.length;
  const sides = [];
  for (let i = 0; i < count; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthCm = Math.hypot(dx, dy);
    if (lengthCm === 0) continue;
    const mid = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
    let normal = { x: dy / lengthCm, y: -dx / lengthCm };
    if (polygon.length > 2 && normal.x * (mid.x - cx) + normal.y * (mid.y - cy) < 0) {
      normal = { x: -normal.x, y: -normal.y };
    }
    sides.push({
      from: polygon[i],
      to: polygon[(i + 1) % polygon.length],
      mid,
      normal,
      lengthCm,
      text: formatLength(lengthCm),
    });
  }
  return sides;
}

/**
 * Index of the corner nearest to the screen point `point` within `radiusPx`
 * on screen, or -1.
 */
export function hitCorner(polygon, point, view, radiusPx) {
  let best = -1;
  let bestDistance = radiusPx;
  polygon.forEach(([x, y], index) => {
    const at = toScreen({ x, y }, view);
    const distance = Math.hypot(at.x - point.x, at.y - point.y);
    if (distance <= bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/** The polygon with corner `index` moved by (dx, dy) cm, kept inside the garden. */
export function moveCorner(polygon, index, { dx, dy }, plan) {
  return polygon.map((corner, i) =>
    i === index
      ? [clampInt(corner[0] + dx, 0, plan.widthCm), clampInt(corner[1] + dy, 0, plan.lengthCm)]
      : corner
  );
}

/** The polygon moved as a whole by (dx, dy) cm, stopped at the garden's edges. */
export function translatePolygon(polygon, { dx, dy }, plan) {
  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);
  const shiftX = clampInt(dx, -Math.min(...xs), plan.widthCm - Math.max(...xs));
  const shiftY = clampInt(dy, -Math.min(...ys), plan.lengthCm - Math.max(...ys));
  return polygon.map(([x, y]) => [x + shiftX, y + shiftY]);
}

/** Whether the point (plan cm) lies in the polygon's bounding box (a rectangle's drag area). */
export function inBounds(polygon, point) {
  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);
  return (
    point.x >= Math.min(...xs) &&
    point.x <= Math.max(...xs) &&
    point.y >= Math.min(...ys) &&
    point.y <= Math.max(...ys)
  );
}

/**
 * A `widthCm` x `lengthCm` rectangle placed at the bottom-left of what the
 * screen shows of the garden: `viewport` is { width, height } in px, `bottomPx`
 * the screen height taken by a sheet at the bottom, `topPx` the header's.
 * Returns the polygon, or null when the rectangle is larger than the garden.
 * `marginPx` keeps it off the screen's edge.
 */
export function placeRectangle(
  { widthCm, lengthCm },
  { view, viewport, plan, topPx = 118, bottomPx = 0, marginPx = 24 }
) {
  if (widthCm > plan.widthCm || lengthCm > plan.lengthCm) return null;
  const bottomLeft = toPlan({ x: marginPx, y: viewport.height - bottomPx - marginPx }, view);
  const topLimit = toPlan({ x: 0, y: topPx }, view).y;
  const x = clampInt(bottomLeft.x, 0, plan.widthCm - widthCm);
  // Not above the header when the visible band is shorter than the rectangle.
  const y = clampInt(Math.max(bottomLeft.y - lengthCm, topLimit), 0, plan.lengthCm - lengthCm);
  return rectanglePolygon({ x, y, widthCm, lengthCm });
}

/** The same rectangle resized from its top-left corner, or null when it cannot fit. */
export function resizeRectangle(polygon, { widthCm, lengthCm }, plan) {
  if (widthCm > plan.widthCm || lengthCm > plan.lengthCm) return null;
  const x = clampInt(polygon[0][0], 0, plan.widthCm - widthCm);
  const y = clampInt(polygon[0][1], 0, plan.lengthCm - lengthCm);
  return rectanglePolygon({ x, y, widthCm, lengthCm });
}

/** The zones that have no outline yet ("Pour quelle zone ?" offers only these). */
export function zonesWithoutOutline(zones) {
  return (zones || []).filter((zone) => zone.polygon == null || zone.polygon === '');
}

/** Checks a new zone's name like app/zone/new.js does (it only has to be non-empty). Returns { name } or { error }. */
export function parseZoneName(text) {
  const name = String(text ?? '').trim();
  return name ? { name } : { error: 'Donnez un nom à la zone.' };
}

/** French refusal for a shape that cannot be saved, or null when it is fine. */
export function polygonProblem(polygon) {
  if (isValidPolygon(polygon)) return null;
  return 'Le tracé est invalide : au moins 3 coins distincts, et une surface non nulle.';
}

/** The bounding box of a polygon: { x, y, widthCm, lengthCm } (x, y = its top-left corner). */
export function polygonBounds(polygon) {
  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, widthCm: Math.max(...xs) - x, lengthCm: Math.max(...ys) - y };
}

/**
 * The polygon resized to a `widthCm` x `lengthCm` bounding box, scaled from the
 * box's top-left corner (exact for an axis-aligned rectangle, proportional per
 * axis for any other shape), in integer cm. With `magnet` the corners land on
 * the 50 cm grid (zones and elements). Returns { polygon } or
 * { error } (French) when it leaves the garden or is no longer a valid shape.
 */
export function resizePolygon(polygon, { widthCm, lengthCm }, plan, { magnet = false } = {}) {
  const box = polygonBounds(polygon);
  if (box.widthCm <= 0 || box.lengthCm <= 0) return { error: 'Dimensions invalides.' };
  const fx = widthCm / box.widthCm;
  const fy = lengthCm / box.lengthCm;
  const scaled = polygon.map(([x, y]) => [
    Math.round(box.x + (x - box.x) * fx),
    Math.round(box.y + (y - box.y) * fy),
  ]);
  if (scaled.some(([x, y]) => x > plan.widthCm || y > plan.lengthCm)) {
    return { error: 'Trop grand pour le plan.' };
  }
  const result = magnet
    ? scaled.map(([x, y]) => {
        const at = snapToGrid({ x, y }, plan);
        return [at.x, at.y];
      })
    : scaled;
  if (!isValidPolygon(result)) return { error: 'Dimensions invalides.' };
  return { polygon: result };
}
