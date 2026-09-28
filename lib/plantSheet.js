// Pure derivation of what app/plant/[id].js's "Fiche technique" and "Sol"
// sections show for a plant row: which tiles have a real, user-chosen value
// (ticket 046 — a plant sheet must never present an unset enum default as a
// fact), and which are still unfilled and belong in the compact "À compléter"
// prompt instead of a tile of their own. No react-native import, so it can be
// tested under Jest and reused by any other screen that needs the same rules.

import { SUN, WATER, SOIL_TYPES, SOIL_PH, isUnknown, labelFor, iconFor } from './enums';
import { monthShort } from './months';

function formatCm(cm) {
  if (cm >= 100) return `${(cm / 100).toFixed(cm % 100 === 0 ? 0 : 1)} m`;
  return `${cm} cm`;
}

// Same composition as the pre-046 "Rusticité" tile: height, width and the
// minimum temperature all read together, so it only counts as unfilled when
// none of the three is set.
function dimensionsText(plant) {
  const parts = [];
  if (plant.height) parts.push(`Hauteur: ${formatCm(plant.height)}`);
  if (plant.width) parts.push(`Largeur: ${formatCm(plant.width)}`);
  if (plant.minTemperature != null) parts.push(`${plant.minTemperature}°C`);
  return parts.join('\n');
}

// One entry per tile: `label` is the text shown on/under the tile and the
// word used in "À compléter"; `hasValue` decides whether the tile is filled;
// `render` (only called when `hasValue` is true) returns its icon + text.
const FICHE_TECHNIQUE_TILES = [
  {
    key: 'sun',
    label: 'Exposition',
    hasValue: (p) => !isUnknown(p.sun),
    render: (p) => ({
      icon: iconFor(SUN, p.sun) || 'white-balance-sunny',
      value: labelFor(SUN, p.sun),
    }),
  },
  {
    key: 'water',
    label: 'Arrosage',
    hasValue: (p) => !isUnknown(p.water),
    render: (p) => ({
      icon: iconFor(WATER, p.water) || 'water-outline',
      value: labelFor(WATER, p.water),
    }),
  },
  {
    key: 'bloom',
    label: 'Floraison',
    hasValue: (p) => p.bloomStartMonth != null && p.bloomEndMonth != null,
    render: (p) => ({
      icon: 'calendar-month-outline',
      value: `${monthShort(p.bloomStartMonth)} — ${monthShort(p.bloomEndMonth)}`,
    }),
  },
  {
    key: 'dimensions',
    label: 'Rusticité',
    hasValue: (p) => Boolean(p.height || p.width || p.minTemperature != null),
    render: (p) => ({ icon: 'thermometer', value: dimensionsText(p) }),
  },
  {
    key: 'deciduous',
    label: 'Feuillage',
    hasValue: (p) => p.deciduous !== null && p.deciduous !== undefined,
    render: (p) => ({ icon: 'leaf', value: p.deciduous ? 'Caduque' : 'Persistant' }),
  },
  {
    key: 'flowerColor',
    label: 'Couleur',
    hasValue: (p) => Boolean(p.flowerColor),
    render: (p) => ({ icon: 'flower-outline', value: p.flowerColor }),
  },
];

const SOL_TILES = [
  {
    key: 'soilType',
    label: 'Type de sol',
    hasValue: (p) => !isUnknown(p.soilType),
    render: (p) => ({ icon: 'shovel', value: labelFor(SOIL_TYPES, p.soilType) }),
  },
  {
    key: 'soilPH',
    label: 'pH du sol',
    hasValue: (p) => !isUnknown(p.soilPH),
    render: (p) => ({ icon: 'flask-outline', value: labelFor(SOIL_PH, p.soilPH) }),
  },
];

function tilesFor(definitions, plant) {
  return definitions
    .filter((t) => t.hasValue(plant))
    .map((t) => ({ key: t.key, label: t.label, ...t.render(plant) }));
}

function missingFor(definitions, plant) {
  return definitions.filter((t) => !t.hasValue(plant)).map((t) => t.label);
}

/** Filled "Fiche technique" tiles: { key, label, icon, value }[]. */
export function ficheTechniqueTiles(plant) {
  return tilesFor(FICHE_TECHNIQUE_TILES, plant);
}

/** Labels of the "Fiche technique" fields still unset, for "À compléter". */
export function ficheTechniqueMissing(plant) {
  return missingFor(FICHE_TECHNIQUE_TILES, plant);
}

/** Filled "Sol" tiles: { key, label, icon, value }[]. */
export function solTiles(plant) {
  return tilesFor(SOL_TILES, plant);
}

/** Labels of the "Sol" fields still unset, for "À compléter". */
export function solMissing(plant) {
  return missingFor(SOL_TILES, plant);
}
