// Snapping a zone or element corner to the other shapes (ticket 114): pure
// maths, Jest-tested. Priority: a corner (or the garden's) within reach, then
// the nearest point on another shape's side (or the garden's border), then a
// right or flat angle with the dragged corner's neighbours (ticket 121), then
// the grid, then nothing. The reach is measured in screen px, so it feels the same
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
  angles: true,
  distance: 'medium',
};
export const SNAP_KIND_LABELS = {
  vertex: 'Sommet',
  edge: 'Côté',
  border: 'Bord',
  square: 'Angle droit',
  flat: 'Aligné',
};

const gridLabel = (cm) => (cm >= 100 ? `${cm / 100} m` : `${cm} cm`);

/**
 * Ticket 116: the active targets in a line, for the folded edit sheet:
 * "Grille 50 cm · Sommets · Côtés · Angles", "Aimant coupé" with the magnet
 * off, "Aucune aimantation" with every target off.
 */
export function snapSummary(settings, enabled = true) {
  if (!enabled) return 'Aimant coupé';
  const parts = [];
  if (settings.grid) parts.push(`Grille ${gridLabel(settings.gridStepCm)}`);
  if (settings.vertices) parts.push('Sommets');
  if (settings.edges) parts.push('Côtés');
  if (settings.border) parts.push('Bord');
  if (settings.angles) parts.push('Angles');
  return parts.length ? parts.join(' · ') : 'Aucune aimantation';
}

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
  for (const key of ['grid', 'vertices', 'edges', 'border', 'angles']) {
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
 * The lines a dragged corner can snap to on the side of one neighbour, through
 * that neighbour: square to the neighbour's other side, or in line with it
 * (only past the neighbour, not folding back). [{ origin, dir (unit), kind }].
 */
function angleLines(neighbour, beyond) {
  const dx = neighbour[0] - beyond[0];
  const dy = neighbour[1] - beyond[1];
  const dl = Math.hypot(dx, dy);
  if (dl === 0) return [];
  const origin = { x: neighbour[0], y: neighbour[1] };
  return [
    { origin, dir: { x: -dy / dl, y: dx / dl }, kind: 'square', both: true },
    { origin, dir: { x: dx / dl, y: dy / dl }, kind: 'flat', both: false },
  ];
}

/** The point of the line nearest to `point`, or null behind a one-way (flat) line's origin. */
function projectOnLine(point, { origin, dir, both = true }) {
  const t = (point.x - origin.x) * dir.x + (point.y - origin.y) * dir.y;
  if (!both && t <= 0) return null;
  return { x: origin.x + t * dir.x, y: origin.y + t * dir.y };
}

function intersect(a, b) {
  const cross = a.dir.x * b.dir.y - a.dir.y * b.dir.x;
  if (Math.abs(cross) < 1e-9) return null;
  const t = ((b.origin.x - a.origin.x) * b.dir.y - (b.origin.y - a.origin.y) * b.dir.x) / cross;
  return { x: a.origin.x + t * a.dir.x, y: a.origin.y + t * a.dir.y };
}

/**
 * Ticket 121: where corner `index` of `polygon` lands when `point` is within
 * `reachCm` of a line that makes a right (or flat) angle at a neighbour: on
 * that line, or where both neighbours' lines cross when both are in reach.
 * Along a horizontal or vertical line the free coordinate still takes the grid
 * step (`gridStepCm`, or null for none). Returns { point, kind: 'square' |
 * 'flat' } or null. The reach is a distance, not an angle, so the corner never
 * jumps further from the finger than the other snaps do.
 */
export function snapAngle(point, polygon, index, { reachCm, gridStepCm = null }) {
  const n = polygon?.length ?? 0;
  if (n < 3) return null;
  const found = [];
  for (const step of [-1, 1]) {
    const neighbour = polygon[(index + step + n) % n];
    const beyond = polygon[(index + 2 * step + n) % n];
    let best = null;
    for (const line of angleLines(neighbour, beyond)) {
      const at = projectOnLine(point, line);
      const d = at ? dist(point, at) : Infinity;
      if (d <= reachCm && (!best || d < best.d)) best = { line, at, d };
    }
    if (best) found.push(best);
  }
  if (found.length === 0) return null;
  found.sort((a, b) => a.d - b.d);
  if (found.length === 2) {
    const both = intersect(found[0].line, found[1].line);
    if (both && dist(point, both) <= reachCm * 1.5) {
      const kind = found.some((f) => f.line.kind === 'square') ? 'square' : 'flat';
      return { point: both, kind };
    }
  }
  const { line, at } = found[0];
  if (gridStepCm) {
    const snap = (v) => Math.round(v / gridStepCm) * gridStepCm;
    if (Math.abs(line.dir.x) < 1e-9) at.y = snap(at.y);
    else if (Math.abs(line.dir.y) < 1e-9) at.x = snap(at.x);
  }
  return { point: at, kind: line.kind };
}

/**
 * Where `point` (plan cm) lands: { point, kind } with kind 'vertex' | 'edge' |
 * 'border' | 'square' | 'flat' | 'grid' | null (free). `shapes` as in
 * snapShapes; `excludeId` is the shape being edited, which never snaps to
 * itself. `corner` ({ polygon, index }) is the corner being dragged, for the
 * angle snap.
 */
export function snapPoint(
  point,
  { settings, shapes = [], plan, scalePxPerCm, excludeId = null, corner = null }
) {
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
  if (settings.angles && corner) {
    const angled = snapAngle(point, corner.polygon, corner.index, {
      reachCm: reach,
      gridStepCm: settings.grid ? settings.gridStepCm : null,
    });
    if (angled) return finish(angled.point, angled.kind);
  }
  if (settings.grid) return { point: snapToGrid(point, plan, settings.gridStepCm), kind: 'grid' };
  return finish(point, null);
}

/**
 * A function (point, corner?) -> { point, kind } for the corner-moving helpers,
 * or null when the magnet is off. `corner` as in snapPoint.
 */
export function makeSnapper({ enabled, settings, shapes, plan, scalePxPerCm, excludeId }) {
  if (!enabled || !plan || !(scalePxPerCm > 0)) return null;
  return (point, corner = null) =>
    snapPoint(point, { settings, shapes, plan, scalePxPerCm, excludeId, corner });
}

/**
 * What a `magnet` argument (true = 50 cm grid, or a snapper function) does to
 * `point`; `corner` ({ polygon, index }) is passed on to a snapper.
 */
export function applyMagnet(magnet, point, plan, corner = null) {
  if (typeof magnet === 'function') return magnet(point, corner);
  return { point: snapToGrid(point, plan), kind: 'grid' };
}
