// Nudging a placed plant with the arrow buttons of its bubble (ticket 123):
// pure maths and text, so Jest covers it. Same conventions as lib/planView.js:
// plan space in cm, points are { x, y }, y grows downward.
import { edgeDistances, rectanglePolygon, zoneAt } from './gardenPlan';
import { featureAt } from './planFeatures';
import { isInsidePlan } from './planView';

export const NUDGE_STEPS = [1, 5, 10];
export const DEFAULT_NUDGE_STEP = 5;

/** The step after `cm` in 1 -> 5 -> 10 -> 1; an unknown value gives the default. */
export function nextNudgeStep(cm) {
  const index = NUDGE_STEPS.indexOf(cm);
  if (index < 0) return DEFAULT_NUDGE_STEP;
  return NUDGE_STEPS[(index + 1) % NUDGE_STEPS.length];
}

/** The stored setting text as a step of NUDGE_STEPS, else the default. */
export function parseNudgeStep(stored) {
  const cm = Number(stored);
  return NUDGE_STEPS.includes(cm) ? cm : DEFAULT_NUDGE_STEP;
}

// Arrow order in the bubble, with the direction as a unit vector.
export const NUDGE_DIRS = ['left', 'up', 'down', 'right'];
const VECTORS = { left: [-1, 0], up: [0, -1], down: [0, 1], right: [1, 0] };
const DIR_TEXT = {
  left: 'vers la gauche',
  up: 'vers le haut',
  down: 'vers le bas',
  right: 'vers la droite',
};

/** "Déplacer de 5 cm vers la gauche" (the arrow's accessibility label). */
export function nudgeLabel(dir, cm) {
  return `Déplacer de ${cm} cm ${DIR_TEXT[dir]}`;
}

/**
 * Where one press of the `dir` arrow puts a plant at `point`, or null when the
 * arrow is disabled. `zones` are [{ id, polygon }] (polygon parsed), `features`
 * the parsed garden elements. The plant never leaves the zone it stands in (or
 * the garden border when it is in none) and never enters another zone: a step
 * longer than the room left stops on the side. Returns { point } or, when an
 * element stands there, { point, refused: feature }.
 */
export function nudgeTarget(point, dir, stepCm, { zones, features, plan }) {
  const zone = zoneAt(point, zones);
  const polygon =
    zone?.polygon ??
    rectanglePolygon({ x: 0, y: 0, widthCm: plan.widthCm, lengthCm: plan.lengthCm });
  const [dx, dy] = VECTORS[dir];
  const hit = edgeDistances(point, polygon).find((d) => d.dir === dir);
  // `cm` is rounded; the exact room is the gap to the hit point on the axis.
  const room = hit
    ? Math.floor(Math.abs(hit.to.x - point.x) + Math.abs(hit.to.y - point.y) + 1e-9)
    : Infinity;
  // A point exactly on a side counts as inside on the left/top and outside on
  // the right/bottom (ray casting), so a stop on the side backs off by 1 cm
  // when that would put the plant in another zone.
  let move = Math.min(stepCm, room);
  const at = (cm) => ({ x: point.x + dx * cm, y: point.y + dy * cm });
  const allowed = (p) =>
    isInsidePlan(p, plan) && (zoneAt(p, zones)?.id ?? null) === (zone?.id ?? null);
  while (move > 0 && !allowed(at(move))) move -= 1;
  if (move <= 0) return null;
  const target = at(move);
  const feature = featureAt(target, features);
  return feature ? { point: target, refused: feature } : { point: target };
}
