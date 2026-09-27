// Single source of truth for every plant-related enum's values and labels.
// Pure module: no db or react-native import, so it can be used from
// lib/plantFields.js, lib/db.js/db.web.js consumers and Jest tests alike.
//
// Shape: one array per enum, each entry { value, label, ...extra }. Screens
// import the array they need instead of declaring their own values or label
// map. Use `enumValues`/`labelFor`/`iconFor` below to read it.

export const PLANT_TYPES = [
  { value: 'perennial', label: 'Vivace', icon: '🌿' },
  { value: 'annual', label: 'Annuelle', icon: '🌻' },
  { value: 'shrub', label: 'Arbuste', icon: '🌳' },
  { value: 'tree', label: 'Arbre', icon: '🌲' },
  { value: 'bulb', label: 'Bulbe', icon: '🌷' },
  { value: 'groundcover', label: 'Couvre-sol', icon: '🍀' },
  { value: 'vine', label: 'Grimpante', icon: '🌾' },
];

export const SUN = [
  { value: 'full_sun', label: 'Plein soleil', icon: '☀' },
  { value: 'partial', label: 'Mi-ombre', icon: '⛅' },
  { value: 'shade', label: 'Ombre', icon: '☁' },
];

export const WATER = [
  { value: 'low', label: 'Faible', icon: '💧' },
  { value: 'medium', label: 'Moyen', icon: '💧💧' },
  { value: 'high', label: 'Élevé', icon: '💧💧💧' },
];

export const CARE_TYPES = [
  { value: 'watered', label: 'Arrosé' },
  { value: 'pruned', label: 'Taillé' },
  { value: 'fertilized', label: 'Fertilisé' },
  { value: 'deadheaded', label: 'Fleurs fanées coupées' },
  { value: 'treated', label: 'Traité' },
  { value: 'repotted', label: 'Rempoté' },
  { value: 'planted', label: 'Planté' },
  { value: 'moved', label: 'Déplacé' },
  { value: 'harvested', label: 'Récolté' },
  { value: 'winterized', label: "Protégé pour l'hiver" },
];

// `noun` reads inside a sentence ("Prochain arrosage : 3 jours"); `label` is
// the action on a button. `prune`, `harvest`, `deadhead` and `winter_prep`
// double as lib/seasonalTasks.js's task kinds, so their `label` is also the
// task label shown on the dashboard and the reminders screen's suggestions
// (CLAUDE.md rule 4: one place for these labels).
export const REMINDER_KINDS = [
  { value: 'water', label: 'Arroser', noun: 'arrosage' },
  { value: 'prune', label: 'Tailler', noun: 'taille' },
  { value: 'fertilize', label: 'Fertiliser', noun: 'fertilisation' },
  { value: 'harvest', label: 'Récolter', noun: 'récolte' },
  { value: 'deadhead', label: 'Couper les fleurs fanées', noun: 'défloraison' },
  { value: 'winter_prep', label: "Préparer pour l'hiver", noun: 'préparation hivernale' },
  { value: 'custom', label: 'Autre', noun: 'rappel' },
];

export const SOIL_TYPES = [
  { value: 'clay', label: 'Argileux' },
  { value: 'sandy', label: 'Sableux' },
  { value: 'loamy', label: 'Limoneux' },
  { value: 'peaty', label: 'Tourbeux' },
  { value: 'rocky', label: 'Caillouteux' },
];

export const SOIL_PH = [
  { value: 'acidic', label: 'Acide' },
  { value: 'neutral', label: 'Neutre' },
  { value: 'alkaline', label: 'Alcalin' },
];

export const PROPAGATION = [
  { value: 'seed', label: 'Semis' },
  { value: 'cutting', label: 'Bouture' },
  { value: 'division', label: 'Division' },
  { value: 'layering', label: 'Marcotte' },
  { value: 'grafting', label: 'Greffe' },
];

export const TOXICITY = [
  { value: 'none', label: 'Aucune' },
  { value: 'pets', label: 'Animaux' },
  { value: 'humans', label: 'Humains' },
  { value: 'all', label: 'Tous' },
];

/** Plain array of an enum's values, e.g. for PLANT_FIELDS' `values` or a query. */
export function enumValues(list) {
  return list.map((entry) => entry.value);
}

/** Label for `value` in `list`, or '' if the value is not in it. */
export function labelFor(list, value) {
  return list.find((entry) => entry.value === value)?.label ?? '';
}

/** Icon for `value` in `list`, or '' if the value or its icon is absent. */
export function iconFor(list, value) {
  return list.find((entry) => entry.value === value)?.icon ?? '';
}
