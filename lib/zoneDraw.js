// Drawing and editing a zone's outline on the plan (ticket 107): pure logic, so
// the screens stay thin and Jest covers it. Same conventions as
// lib/gardenPlan.js: plan space in integer cm, polygons are arrays of [x, y],
// screen space in px with a `view` of { scale, offsetX, offsetY }.
import { toPlan, toScreen, formatLength, isValidPolygon, rectanglePolygon } from './gardenPlan';
import { clampToPlan, parsePlanMetres } from './planView';
import { applyMagnet } from './planSnap';
import { plural } from './text';

const clampInt = (value, min, max) => Math.round(Math.min(max, Math.max(min, value)));

/**
 * The corner list after a tap at `point` (plan cm): clamped into the garden
 * (on the 50 cm grid with `magnet` true, or wherever the snapper function given as
 * `magnet` puts it, ticket 114), never twice in a row.
 */
export function addCorner(corners, point, plan, { magnet = false } = {}) {
  const at = magnet ? applyMagnet(magnet, point, plan).point : clampToPlan(point, plan);
  let next = [Math.round(at.x), Math.round(at.y)];
  // Ticket 113: with the magnet off, a side that is nearly square to the
  // previous one becomes exactly square.
  if (!magnet && corners.length >= 2) {
    const squared = squareCorner(corners[corners.length - 2], corners[corners.length - 1], next);
    const kept = clampToPlan({ x: squared[0], y: squared[1] }, plan);
    next = [Math.round(kept.x), Math.round(kept.y)];
  }
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
 * lengthCm, text, index }] (`index` = the side's start corner in `polygon`). With `closed` false the closing side (last -> first) is
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
      index: i,
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
        const at = applyMagnet(magnet, { x, y }, plan).point;
        return [at.x, at.y];
      })
    : scaled;
  if (!isValidPolygon(result)) return { error: 'Dimensions invalides.' };
  return { polygon: result };
}

// ---- Ticket 113: typing a side's length, right-angle help ----

// The length pill of a side sits this far (screen px) outside it; its touch
// area is at least 44 px high (and as wide as the pill).
export const PILL_OFFSET_PX = 16;
export const PILL_HIT_PX = { width: 64, height: 44 };

/**
 * The side whose length pill is under the screen point `point` (its touch
 * area), or -1. Returns the side's `index` as in `sideLengths`.
 */
export function hitSide(polygon, closed, point, view) {
  for (const side of sideLengths(polygon, closed)) {
    const at = toScreen(side.mid, view);
    const cx = at.x + side.normal.x * PILL_OFFSET_PX;
    const cy = at.y + side.normal.y * PILL_OFFSET_PX;
    if (
      Math.abs(point.x - cx) <= PILL_HIT_PX.width / 2 &&
      Math.abs(point.y - cy) <= PILL_HIT_PX.height / 2
    ) {
      return side.index;
    }
  }
  return -1;
}

/**
 * The polygon with side `sideIndex` (corner i -> corner i + 1) made `newLengthCm`
 * long. The shape stretches from that side: every corner lying strictly past
 * the side's midpoint along the side's direction moves by the length
 * difference along that direction, the others stay. So a rectangle stays a
 * rectangle and the sides parallel to the stretched one keep their length.
 * A typed length is exact: it is NOT snapped to the grid (ticket 113).
 * With `open` (a zone being traced) only the last corner moves, along the
 * last side, and no closed shape is required.
 * Returns { polygon } or { error } (French).
 */
export function stretchSide(points, sideIndex, newLengthCm, plan, { open = false } = {}) {
  const n = points.length;
  const from = points[sideIndex];
  const to = points[(sideIndex + 1) % n];
  if (!from || !to || !(newLengthCm > 0) || !Number.isFinite(newLengthCm)) {
    return { error: 'Longueur invalide.' };
  }
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (length === 0) return { error: 'Longueur invalide.' };
  const ux = (to[0] - from[0]) / length;
  const uy = (to[1] - from[1]) / length;
  const delta = newLengthCm - length;
  const midProjection = ((from[0] + to[0]) / 2) * ux + ((from[1] + to[1]) / 2) * uy;
  const moves = (p, i) => (open ? i === n - 1 : p[0] * ux + p[1] * uy > midProjection + 1e-9);
  const result = points.map((p, i) =>
    moves(p, i) ? [Math.round(p[0] + delta * ux), Math.round(p[1] + delta * uy)] : p
  );
  if (result.some(([x, y]) => x < 0 || y < 0 || x > plan.widthCm || y > plan.lengthCm)) {
    return { error: 'Trop grand pour le plan.' };
  }
  if (!open && !isValidPolygon(result)) return { error: 'Dimensions invalides.' };
  return { polygon: result };
}

/**
 * What typing `text` (metres, French decimals) in a side's pill gives:
 * { polygon } (the stretched shape) or { error } (French). `open` as in stretchSide.
 */
export function typedSide(points, sideIndex, text, plan, { open = false } = {}) {
  const parsed = parsePlanMetres(text);
  if (parsed.error) return { error: parsed.error };
  return stretchSide(points, sideIndex, parsed.cm, plan, { open });
}

/**
 * How to name a side in "Longueur du côté du haut": "du haut", "du bas",
 * "de gauche", "de droite" by its orientation (within 30 degrees of an axis)
 * and its position against the shape's centre; "sélectionné" otherwise.
 */
export function sideLabel(points, sideIndex) {
  const from = points[sideIndex];
  const to = points[(sideIndex + 1) % points.length];
  if (!from || !to) return 'sélectionné';
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const midX = (from[0] + to[0]) / 2;
  const midY = (from[1] + to[1]) / 2;
  const tan30 = Math.tan(Math.PI / 6);
  if (Math.abs(dy) <= Math.abs(dx) * tan30 && midY !== cy) return midY < cy ? 'du haut' : 'du bas';
  if (Math.abs(dx) <= Math.abs(dy) * tan30 && midX !== cx) {
    return midX < cx ? 'de gauche' : 'de droite';
  }
  return 'sélectionné';
}

/**
 * Right-angle help: `next` is a candidate corner after `corner`, the side
 * `prev` -> `corner` is the previous one. When the new side is within
 * `toleranceDeg` of perpendicular to it, `next` is rotated about `corner` to
 * exactly 90 degrees (same length, same side), rounded to whole cm (exact
 * when the previous side is horizontal or vertical). Otherwise `next` as is.
 */
export function squareCorner(prev, corner, next, toleranceDeg = 8) {
  const dx = corner[0] - prev[0];
  const dy = corner[1] - prev[1];
  const vx = next[0] - corner[0];
  const vy = next[1] - corner[1];
  const dl = Math.hypot(dx, dy);
  const vl = Math.hypot(vx, vy);
  if (dl === 0 || vl === 0) return next;
  const cos = (dx * vx + dy * vy) / (dl * vl);
  if (cos === 0 || Math.abs(cos) > Math.sin((toleranceDeg * Math.PI) / 180)) return next;
  const side = dx * vy - dy * vx > 0 ? 1 : -1;
  return [
    Math.round(corner[0] + (side * -dy * vl) / dl),
    Math.round(corner[1] + (side * dx * vl) / dl),
  ];
}

/**
 * Right-angle help for a corner being dragged (magnet off): the polygon with
 * corner `index` rotated so that the side it shares with a neighbour is square
 * to that neighbour's other side, when that is within tolerance. Of the two
 * neighbours the one needing the smaller move wins. Kept inside the garden.
 */
export function squareDraggedCorner(polygon, index, plan, toleranceDeg = 8) {
  const n = polygon.length;
  if (n < 3) return polygon;
  const corner = polygon[index];
  let best = null;
  let bestMove = Infinity;
  for (const step of [-1, 1]) {
    const neighbour = (index + step + n) % n;
    const beyond = (neighbour + step + n) % n;
    const squared = squareCorner(polygon[beyond], polygon[neighbour], corner, toleranceDeg);
    if (squared === corner) continue;
    const move = Math.hypot(squared[0] - corner[0], squared[1] - corner[1]);
    if (move < bestMove) {
      best = squared;
      bestMove = move;
    }
  }
  if (!best) return polygon;
  const kept = clampToPlan({ x: best[0], y: best[1] }, plan);
  return polygon.map((p, i) => (i === index ? [Math.round(kept.x), Math.round(kept.y)] : p));
}
