// Garden plan screen logic (ticket 106): pure maths and text, so the screen
// stays thin and Jest covers it. Same coordinate conventions as
// lib/gardenPlan.js: plan space in cm, screen space in px, and a `view` is
// { scale (px per cm), offsetX, offsetY } with the offsets being the screen
// position of the plan origin.
//
// The functions marked 'worklet' run inside gesture callbacks on the UI
// thread: they only use their arguments and Math.
import {
  DEFAULT_PLAN_SIZE_CM,
  MAX_PLAN_CM,
  MAX_PLAN_SIZE_CM,
  MIN_PLAN_SIZE_CM,
  formatSize,
  parsePolygon,
  pointInPolygon,
} from './gardenPlan';
import { plural } from './text';

// The plan canvas is the whole screen; the header and the drawer float over it.
// These are the rectangle "Voir tout" fits the garden into (the Plan artboard:
// 30 px at the sides, 118 under the header, 176 above the drawer).
export const PLAN_INSETS = { top: 118, bottom: 176, left: 30, right: 30 };

export const MIN_VISIBLE_PX = 96;
export const ZOOM_STEP = 1.5;
// Zoom limits, as multiples of the fit-to-screen scale.
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 12;

/** The view that shows the whole garden, centred in the free rectangle. */
export function fitView(plan, viewport, insets = PLAN_INSETS) {
  const availW = Math.max(1, viewport.width - insets.left - insets.right);
  const availH = Math.max(1, viewport.height - insets.top - insets.bottom);
  const scale = Math.min(availW / plan.widthCm, availH / plan.lengthCm);
  return {
    scale,
    offsetX: insets.left + (availW - plan.widthCm * scale) / 2,
    offsetY: insets.top + (availH - plan.lengthCm * scale) / 2,
  };
}

/** Scale limits for a plan whose fit scale is `fitScale`. */
export function scaleLimits(fitScale) {
  return { min: fitScale * MIN_ZOOM, max: fitScale * MAX_ZOOM };
}

/**
 * Keeps the plan from being lost off-screen: at least MIN_VISIBLE_PX of it (or
 * all of it when it is smaller) stays inside the viewport on each axis.
 */
export function clampView(view, plan, viewport) {
  'worklet';
  const w = plan.widthCm * view.scale;
  const h = plan.lengthCm * view.scale;
  const mx = Math.min(MIN_VISIBLE_PX, w);
  const my = Math.min(MIN_VISIBLE_PX, h);
  return {
    scale: view.scale,
    offsetX: Math.min(viewport.width - mx, Math.max(mx - w, view.offsetX)),
    offsetY: Math.min(viewport.height - my, Math.max(my - h, view.offsetY)),
  };
}

/**
 * The view after the scale changed to `nextScale` while the plan point under
 * `focal` (screen px) stays under it: t = f - (f - t0) * s / s0.
 */
export function zoomAround(view, nextScale, focal) {
  'worklet';
  const ratio = nextScale / view.scale;
  return {
    scale: nextScale,
    offsetX: focal.x - (focal.x - view.offsetX) * ratio,
    offsetY: focal.y - (focal.y - view.offsetY) * ratio,
  };
}

/** Clamps `value` into [min, max]. */
export function clampNumber(value, min, max) {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

/** A point of the plan kept inside the garden. */
export function clampToPlan(point, plan) {
  return {
    x: Math.min(plan.widthCm, Math.max(0, point.x)),
    y: Math.min(plan.lengthCm, Math.max(0, point.y)),
  };
}

// Ticket 109: plants snap to this grid (cm) when the magnet is on.
export const SNAP_STEP_CM = 50;

/**
 * The nearest grid point (a multiple of `stepCm` on both axes), then clamped
 * into the garden. Halves round up; the clamp may leave a non-multiple when the
 * garden's own side is not one. Only plants snap, never zone corners.
 */
export function snapToGrid(point, plan, stepCm = SNAP_STEP_CM) {
  const snap = (n) => Math.round(n / stepCm) * stepCm;
  return clampToPlan({ x: snap(point.x), y: snap(point.y) }, plan);
}

/** True when the point lies inside the garden rectangle. */
export function isInsidePlan(point, plan) {
  return point.x >= 0 && point.y >= 0 && point.x <= plan.widthCm && point.y <= plan.lengthCm;
}

/**
 * Grid line positions in cm along one axis of `lengthCm`: a line every metre,
 * stronger every 5 m, the borders left out (drawn separately). Minor lines are
 * dropped when they would be closer than `minGapPx` on screen.
 */
export function gridLines(lengthCm, pxPerCm, minGapPx = 6) {
  const minor = [];
  const major = [];
  const showMinor = 100 * pxPerCm >= minGapPx;
  const showMajor = 500 * pxPerCm >= minGapPx;
  for (let cm = 100; cm < lengthCm; cm += 100) {
    if ((cm / 100) % 5 === 0) {
      if (showMajor) major.push(cm);
    } else if (showMinor) minor.push(cm);
  }
  return { minor, major };
}

/** Where to write a zone's label: its area centroid, or the bounding-box centre. */
export function polygonLabelPoint(polygon) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    const cross = x1 * y2 - x2 * y1;
    a += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (a !== 0) {
    const centroid = { x: cx / (3 * a), y: cy / (3 * a) };
    if (pointInPolygon(centroid, polygon)) return centroid;
  }
  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

/** "15 × 25 m · 3 zones · 10 plantes placées" (the plan header's subtitle). */
export function planSummary(plan, zoneCount, placedCount) {
  return [
    formatSize(plan.widthCm, plan.lengthCm),
    `${zoneCount} ${plural(zoneCount, 'zone', 'zones')}`,
    `${placedCount} ${plural(placedCount, 'plante placée', 'plantes placées')}`,
  ].join(' · ');
}

/**
 * "Rosier ‘Pierre de Ronsard’" -> "Rosier": the name up to the first quote,
 * for the banner and the drawer where space is short.
 */
export function shortPlantName(name) {
  const text = String(name ?? '').trim();
  const cut = text.search(/['‘’"“«(]/);
  const head = (cut > 0 ? text.slice(0, cut) : text).trim();
  return head || text;
}

/** "Massif sud", or "Sans zone" when the plant has none. */
export function plantSubtitle(zoneName) {
  return zoneName || 'Sans zone';
}

/**
 * The next plan size when "−" (-1) or "+" (+1) is pressed: steps of 5 cm below
 * 50 cm, 10 cm up to 2 m, 25 cm above; always lands on a multiple of the step
 * and stays within 5 cm .. 50 m. `cm` null = not set, so it starts from the
 * fallback size.
 */
export function nextPlanSize(cm, direction) {
  const current = typeof cm === 'number' && cm > 0 ? cm : DEFAULT_PLAN_SIZE_CM;
  const stepUp = current < 50 ? 5 : current < 200 ? 10 : 25;
  const stepDown = current <= 50 ? 5 : current <= 200 ? 10 : 25;
  const next =
    direction > 0
      ? (Math.floor(current / stepUp) + 1) * stepUp
      : (Math.ceil(current / stepDown) - 1) * stepDown;
  return clampNumber(next, MIN_PLAN_SIZE_CM, MAX_PLAN_SIZE_CM);
}

/**
 * Parses the metres typed for a plant's plan size into integer cm.
 * Returns { cm } or { error } (French).
 */
export function parsePlanSizeInput(text) {
  const parsed = parsePlanMetres(text);
  if (parsed.error) return parsed;
  if (parsed.cm < MIN_PLAN_SIZE_CM) return { error: 'Minimum 0,05 m.' };
  if (parsed.cm > MAX_PLAN_SIZE_CM) return { error: `Maximum ${MAX_PLAN_SIZE_CM / 100} m.` };
  return { cm: parsed.cm };
}

/**
 * The banner after a drop: `{ text, strong }` ("Lavande déplacée vers " +
 * bold zone name), or just a text. `previousZoneId` tells "taken out of its
 * zone" from "was never in one".
 */
export function moveMessage({ plantName, zoneName, previousZoneId }) {
  const name = shortPlantName(plantName);
  if (zoneName) return { text: `${name} déplacée vers `, strong: zoneName };
  if (previousZoneId) return { text: `${name} retirée de sa zone`, strong: null };
  return { text: `${name} posée hors zone`, strong: null };
}

/**
 * Parses a length typed in metres ("15", "12,5", "12.5") into centimetres.
 * Returns { cm } or { error } (French, shown under the field).
 */
export function parsePlanMetres(text) {
  const raw = String(text ?? '')
    .trim()
    .replace(',', '.');
  if (raw === '') return { error: 'Indiquez une valeur.' };
  if (!/^\d+(\.\d+)?$/.test(raw)) return { error: 'Valeur invalide, par exemple 12,5.' };
  const cm = Math.round(Number(raw) * 100);
  if (cm <= 0) return { error: 'Doit être supérieur à 0.' };
  if (cm > MAX_PLAN_CM) return { error: `Maximum ${MAX_PLAN_CM / 100} m.` };
  return { cm };
}

/** The smallest plan that still holds every drawn zone and placed plant: { widthCm, lengthCm }. */
export function planExtent(zones, plants, features = []) {
  let widthCm = 0;
  let lengthCm = 0;
  // Zones and garden features (ticket 110) both carry an outline.
  for (const zone of [...(zones || []), ...(features || [])]) {
    const polygon = Array.isArray(zone.polygon) ? zone.polygon : parsePolygon(zone.polygon);
    for (const [x, y] of polygon || []) {
      widthCm = Math.max(widthCm, x);
      lengthCm = Math.max(lengthCm, y);
    }
  }
  for (const plant of plants || []) {
    if (plant.planX == null || plant.planY == null) continue;
    widthCm = Math.max(widthCm, plant.planX);
    lengthCm = Math.max(lengthCm, plant.planY);
  }
  return { widthCm, lengthCm };
}

/**
 * Whether the plan may be resized to `size`: not smaller than what is drawn
 * on it. Returns { ok: true } or { ok: false, message } (French).
 */
export function checkPlanResize(size, zones, plants, features = []) {
  const needed = planExtent(zones, plants, features);
  if (size.widthCm >= needed.widthCm && size.lengthCm >= needed.lengthCm) return { ok: true };
  return {
    ok: false,
    message: `Une zone, un élément ou une plante placée dépasserait du plan. Il doit mesurer au moins ${formatSize(
      Math.max(needed.widthCm, size.widthCm),
      Math.max(needed.lengthCm, size.lengthCm)
    )}.`,
  };
}
