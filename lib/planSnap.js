// Snapping a zone or element corner to the other shapes (ticket 114): pure
// maths, Jest-tested. Priority: a corner (or the garden's) within reach, then
// the nearest point on another shape's side (or the garden's border), then the
// grid, then nothing. The reach is measured in screen px, so it feels the same
// at any zoom. Plan space in integer cm, polygons are arrays of [x, y].
import { parsePolygon } from './gardenPlan';
import { clampToPlan, snapToGrid } from './planView';

export const GRID_STEPS_CM = [10, 25, 50, 100];
export const SNAP_DISTANCES_PX = { small: 8, medium: 12, large: 18 };
export const DEFAULT_SNAP_SETTINGS = {
  grid: true,
  gridStepCm: 50,
  vertices: true,
  edges: true,
  border: false,
  distance: 'medium',
};
export const SNAP_KIND_LABELS = { vertex: 'Sommet', edge: 'Côté', border: 'Bord' };

/** Settings from their stored JSON (or an object); anything invalid falls back to the default. */
export function parseSnapSettings(raw) {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      value = null;
    }
  }
  const out = { ...DEFAULT_SNAP_SETTINGS };
  if (!value || typeof value !== 'object') return out;
  for (const key of ['grid', 'vertices', 'edges', 'border']) {
    if (typeof value[key] === 'boolean') out[key] = value[key];
  }
  if (GRID_STEPS_CM.includes(value.gridStepCm)) out.gridStepCm = value.gridStepCm;
  if (value.distance in SNAP_DISTANCES_PX) out.distance = value.distance;
  return out;
}

/** The polygons other shapes offer: [{ id, polygon }] for zones ('zone:1') and elements ('feature:1'). */
export function snapShapes(zones, features) {
  const out = [];
  for (const zone of zones || []) {
    const polygon = Array.isArray(zone.polygon) ? zone.polygon : parsePolygon(zone.polygon);
    if (polygon) out.push({ id: `zone:${zone.id}`, polygon });
  }
  for (const feature of features || []) {
    const polygon = Array.isArray(feature.polygon)
      ? feature.polygon
      : parsePolygon(feature.polygon);
    if (polygon) out.push({ id: `feature:${feature.id}`, polygon });
  }
  return out;
}

/** The point of segment a-b nearest to p. */
function nearestOnSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t =
    len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / len2));
  return { x: a[0] + t * dx, y: a[1] + t * dy };
}

const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

/**
 * Where `point` (plan cm) lands: { point, kind } with kind 'vertex' | 'edge' |
 * 'border' | 'grid' | null (free). `shapes` as in snapShapes; `excludeId` is
 * the shape being edited, which never snaps to itself.
 */
export function snapPoint(point, { settings, shapes = [], plan, scalePxPerCm, excludeId = null }) {
  const reach = SNAP_DISTANCES_PX[settings.distance] / scalePxPerCm;
  const others = shapes.filter((s) => s.id !== excludeId);
  const corners = [];
  const sides = [];
  for (const { polygon } of others) {
    polygon.forEach((corner, i) => {
      if (settings.vertices) corners.push({ at: { x: corner[0], y: corner[1] }, kind: 'vertex' });
      if (settings.edges)
        sides.push({ a: corner, b: polygon[(i + 1) % polygon.length], kind: 'edge' });
    });
  }
  if (settings.border) {
    const { widthCm: w, lengthCm: l } = plan;
    const box = [
      [0, 0],
      [w, 0],
      [w, l],
      [0, l],
    ];
    box.forEach((corner, i) => {
      corners.push({ at: { x: corner[0], y: corner[1] }, kind: 'border' });
      sides.push({ a: corner, b: box[(i + 1) % 4], kind: 'border' });
    });
  }
  const finish = (at, kind) => {
    const kept = clampToPlan({ x: Math.round(at.x), y: Math.round(at.y) }, plan);
    return { point: kept, kind };
  };
  let best = null;
  let bestDistance = reach;
  for (const c of corners) {
    const d = dist(point, c.at);
    if (d <= bestDistance) {
      best = c;
      bestDistance = d;
    }
  }
  if (best) return finish(best.at, best.kind);
  let bestPoint = null;
  bestDistance = reach;
  for (const s of sides) {
    const at = nearestOnSegment(point, s.a, s.b);
    const d = dist(point, at);
    if (d <= bestDistance) {
      bestPoint = { at, kind: s.kind };
      bestDistance = d;
    }
  }
  if (bestPoint) return finish(bestPoint.at, bestPoint.kind);
  if (settings.grid) return { point: snapToGrid(point, plan, settings.gridStepCm), kind: 'grid' };
  return finish(point, null);
}

/**
 * A function point -> { point, kind } for the corner-moving helpers, or null
 * when the magnet is off.
 */
export function makeSnapper({ enabled, settings, shapes, plan, scalePxPerCm, excludeId }) {
  if (!enabled || !plan || !(scalePxPerCm > 0)) return null;
  return (point) => snapPoint(point, { settings, shapes, plan, scalePxPerCm, excludeId });
}

/** What a `magnet` argument (true = 50 cm grid, or a snapper function) does to `point`. */
export function applyMagnet(magnet, point, plan) {
  if (typeof magnet === 'function') return magnet(point);
  return { point: snapToGrid(point, plan), kind: 'grid' };
}
