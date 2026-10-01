// Garden features drawn on the plan only (ticket 110): pure logic shared by
// lib/db.js, lib/db.web.js, the plan screen and Jest. A feature is
// { id, kind, label, polygon } with the polygon in integer cm like a zone's.
import { PLAN_FEATURE_KINDS, enumValues, labelFor } from './enums';
import { isValidPolygon, parsePolygon, pointInPolygon, polygonAreaM2 } from './gardenPlan';
import { snapToGrid } from './planView';
import { moveCorner, translatePolygon } from './zoneDraw';
import { colors } from './theme';

export const MAX_FEATURE_LABEL = 60;
export const DEFAULT_FEATURE_KIND = PLAN_FEATURE_KINDS[0].value;

/** The kind's French label ("Terrasse"); '' for an unknown kind. */
export function featureKindLabel(kind) {
  return labelFor(PLAN_FEATURE_KINDS, kind);
}

/** The fill / outline (and hatch) of a kind, from lib/theme.js. */
export function featureLook(kind) {
  return colors.planFeatures[kind] ?? colors.planFeatures.other;
}

/** What to write on the plan: the name when set, else the kind's label. */
export function featureLabel(feature) {
  const label = typeof feature?.label === 'string' ? feature.label.trim() : '';
  return label || featureKindLabel(feature?.kind) || 'Élément';
}

/**
 * Checks what a feature write carries. `input` may hold any of kind, label,
 * polygon; only the keys present are checked and returned (label trimmed, ''
 * becomes null). Throws a French Error on the first problem.
 */
export function normalizeFeatureInput(input) {
  const out = {};
  if ('kind' in input) {
    if (!enumValues(PLAN_FEATURE_KINDS).includes(input.kind)) {
      throw new Error("Type d'élément invalide.");
    }
    out.kind = input.kind;
  }
  if ('label' in input) {
    const label = input.label == null ? '' : String(input.label).trim();
    if (label.length > MAX_FEATURE_LABEL) {
      throw new Error(`Le nom est trop long : ${MAX_FEATURE_LABEL} caractères au plus.`);
    }
    out.label = label || null;
  }
  if ('polygon' in input) {
    const polygon = Array.isArray(input.polygon) ? input.polygon : parsePolygon(input.polygon);
    if (!isValidPolygon(polygon)) {
      throw new Error('Contour invalide : au moins 3 coins distincts, et une surface non nulle.');
    }
    out.polygon = polygon;
  }
  return out;
}

/** Features as the plan draws them: the polygon parsed, invalid rows dropped. */
export function parseFeatures(rows) {
  const out = [];
  for (const row of rows || []) {
    const polygon = Array.isArray(row.polygon) ? row.polygon : parsePolygon(row.polygon);
    if (polygon) out.push({ ...row, polygon });
  }
  return out;
}

/**
 * The feature under `point` (plan cm), or null. When features overlap the
 * smallest one wins (a terrace's pot inside a house's footprint), ties go to
 * the last one.
 */
export function featureAt(point, features) {
  let best = null;
  let bestArea = Infinity;
  for (const feature of features || []) {
    if (!pointInPolygon(point, feature.polygon)) continue;
    const area = polygonAreaM2(feature.polygon);
    if (area <= bestArea) {
      best = feature;
      bestArea = area;
    }
  }
  return best;
}

/**
 * The red banner shown when a plant is dropped on a feature: the label in bold
 * between `text` and `after`.
 */
export function featureRefusalMessage(feature) {
  return {
    text: 'Impossible de poser une plante sur ',
    strong: featureLabel(feature),
    after: ' : la plante reprend sa place.',
  };
}

/** True for the plan modes that draw an element (a new one, or one being edited). */
export function isFeatureDraft(draft) {
  return draft?.kind === 'element' || draft?.kind === 'feature';
}

/**
 * The polygon after a corner drag: corner `index` moved by (dx, dy) from where
 * the drag began (`start` is the polygon then); with the magnet on the corner
 * lands on the 50 cm grid.
 */
export function dragFeatureCorner(start, index, delta, plan, magnet) {
  const moved = moveCorner(start, index, delta, plan);
  if (!magnet) return moved;
  const snapped = snapToGrid({ x: moved[index][0], y: moved[index][1] }, plan);
  return moved.map((corner, i) => (i === index ? [snapped.x, snapped.y] : corner));
}

/**
 * The polygon after a whole-shape drag by (dx, dy) from `start`; with the
 * magnet on, its top-left corner (min x, min y) lands on the 50 cm grid.
 */
export function dragFeatureShape(start, delta, plan, magnet) {
  const moved = translatePolygon(start, delta, plan);
  if (!magnet) return moved;
  const minX = Math.min(...moved.map((p) => p[0]));
  const minY = Math.min(...moved.map((p) => p[1]));
  const snapped = snapToGrid({ x: minX, y: minY }, plan);
  return translatePolygon(moved, { dx: snapped.x - minX, dy: snapped.y - minY }, plan);
}
