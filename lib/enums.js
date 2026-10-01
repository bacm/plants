// Single source of truth for every plant-related enum's values and labels.
// Pure module: no db or react-native import, so it can be used from
// lib/plantFields.js, lib/db.js/db.web.js consumers and Jest tests alike.
//
// Shape: one array per enum, each entry { value, label, ...extra }. Screens
// import the array they need instead of declaring their own values or label
// map. Use `enumValues`/`labelFor`/`iconFor` below to read it.

// Sentinel stored for an enum field the user never actually chose (see
// lib/plantFields.js's dbDefault for type/sun/water/soilType/soilPH/toxicity).
// It is a real, valid value for those NOT NULL columns, never a guessed
// default — screens must treat it as "no data" (hide it, or fold it into an
// "À compléter" prompt) rather than print its label as if it were a fact.
export const UNKNOWN = 'unknown';
const UNKNOWN_ENTRY = { value: UNKNOWN, label: 'Non renseigné' };

/** True when a plant enum field holds no real user choice. */
export function isUnknown(value) {
  return value == null || value === '' || value === UNKNOWN;
}

/**
 * The chip/segment choices a form should offer for an enum that has an
 * `UNKNOWN_ENTRY` appended (below): the real values only, never the
 * sentinel itself — a form never lets the user tap "Non renseigné", it just
 * has nothing selected until they pick a real value.
 */
export function choices(list) {
  return list.filter((entry) => entry.value !== UNKNOWN);
}

/**
 * Toggle helper for an enum chip: tapping the already-selected chip clears
 * the field back to `UNKNOWN` instead of leaving it stuck on a value the
 * user may just be re-considering.
 */
export function toggleChip(current, tapped) {
  return current === tapped ? UNKNOWN : tapped;
}

// `plural` is the plant-type filter chip's label on the Bibliothèque screen
// (ticket 068) -- kept next to the enum rather than pluralised ad hoc in the
// screen (CLAUDE.md rule 4).
export const PLANT_TYPES = [
  { value: 'perennial', label: 'Vivace', plural: 'Vivaces', icon: 'leaf' },
  { value: 'annual', label: 'Annuelle', plural: 'Annuelles', icon: 'flower-outline' },
  { value: 'shrub', label: 'Arbuste', plural: 'Arbustes', icon: 'sprout-outline' },
  { value: 'tree', label: 'Arbre', plural: 'Arbres', icon: 'tree-outline' },
  { value: 'bulb', label: 'Bulbe', plural: 'Bulbes', icon: 'flower-tulip-outline' },
  { value: 'groundcover', label: 'Couvre-sol', plural: 'Couvre-sols', icon: 'clover' },
  { value: 'vine', label: 'Grimpante', plural: 'Grimpantes', icon: 'grass' },
  UNKNOWN_ENTRY,
];

// `icon` is the per-value exposure icon (ticket 046), a MaterialCommunityIcons
// name (ticket 052 — the single icon set, see components/Icon.js) rather
// than an emoji, so each value keeps its own and a tile is never shown with
// the wrong picture.
export const SUN = [
  { value: 'full_sun', label: 'Plein soleil', icon: 'white-balance-sunny' },
  { value: 'partial', label: 'Mi-ombre', icon: 'weather-partly-cloudy' },
  { value: 'shade', label: 'Ombre', icon: 'weather-cloudy' },
  UNKNOWN_ENTRY,
];

export const WATER = [
  { value: 'low', label: 'Faible', icon: 'water-outline' },
  { value: 'medium', label: 'Moyen', icon: 'water' },
  { value: 'high', label: 'Élevé', icon: 'weather-pouring' },
  UNKNOWN_ENTRY,
];

// How showy a plant's bloom is (ticket 090): an insignificant bloom (a maple's)
// stays listed but sorts last, dimmed, and does not count as garden coverage.
export const BLOOM_ABUNDANCE = [
  { value: 'insignificant', label: 'Insignifiante' },
  { value: 'moderate', label: 'Modérée' },
  { value: 'abundant', label: 'Abondante' },
  UNKNOWN_ENTRY,
];

// `icon` is the care-type grid tile icon on the care log screen (ticket 070),
// a MaterialCommunityIcons name like every other enum icon above.
export const CARE_TYPES = [
  { value: 'watered', label: 'Arrosé', icon: 'water-outline' },
  { value: 'pruned', label: 'Taillé', icon: 'content-cut' },
  { value: 'fertilized', label: 'Fertilisé', icon: 'sprout-outline' },
  { value: 'deadheaded', label: 'Fleurs fanées coupées', icon: 'flower-outline' },
  { value: 'treated', label: 'Traité', icon: 'shield-outline' },
  { value: 'repotted', label: 'Rempoté', icon: 'pot-mix-outline' },
  { value: 'planted', label: 'Planté', icon: 'shovel' },
  { value: 'moved', label: 'Déplacé', icon: 'swap-horizontal' },
  { value: 'harvested', label: 'Récolté', icon: 'basket-outline' },
  { value: 'winterized', label: "Protégé pour l'hiver", icon: 'snowflake' },
];

// Journal observations (ticket 115): entries of the plant journal that are not
// care. They share the care_logs table with CARE_TYPES (one timeline), so a
// reader that means "care" (last watering, seasonal tasks) must go through
// `isCareType`. `icon` is a MaterialCommunityIcons name.
export const OBSERVATION_TYPES = [
  { value: 'measured', label: 'Mesuré', choice: 'Mesure', icon: 'ruler' },
  { value: 'note', label: 'Note', choice: 'Note', icon: 'pencil-outline' },
  { value: 'bloom', label: 'En fleur', choice: 'En fleur', icon: 'flower' },
];

// The same list as the entry screen's buttons: `choice` is the noun on the
// button ("Mesure"), `label` the past form on the timeline ("Mesuré").
export const OBSERVATION_CHOICES = OBSERVATION_TYPES.map(({ choice, ...entry }) => ({
  ...entry,
  label: choice,
}));

/** True for a care type (CARE_TYPES), false for a journal observation or an unknown value. */
export function isCareType(type) {
  return CARE_TYPES.some((entry) => entry.value === type);
}

/** True for a journal observation type (OBSERVATION_TYPES). */
export function isObservationType(type) {
  return OBSERVATION_TYPES.some((entry) => entry.value === type);
}

/** Timeline label for any journal entry type, care or observation ('' when unknown). */
export function journalLabelFor(type) {
  return labelFor(CARE_TYPES, type) || labelFor(OBSERVATION_TYPES, type);
}

// `noun` reads inside a sentence ("Prochain arrosage : 3 jours"); `label` is
// the action on a button. `prune`, `harvest`, `deadhead` and `winter_prep`
// double as lib/seasonalTasks.js's task kinds, so their `label` is also the
// task label shown on the dashboard and the reminders screen's suggestions
// (CLAUDE.md rule 4: one place for these labels).
// `icon` is the tinted-square icon shown for the kind on the dashboard's
// "Tâches du jour" and "Ce mois-ci au jardin" lists (ticket 066) -- see
// lib/theme.js's reminderTint for the matching background colour.
export const REMINDER_KINDS = [
  { value: 'water', label: 'Arroser', noun: 'arrosage', icon: 'water-outline' },
  { value: 'prune', label: 'Tailler', noun: 'taille', icon: 'content-cut' },
  { value: 'fertilize', label: 'Fertiliser', noun: 'fertilisation', icon: 'sprout-outline' },
  { value: 'harvest', label: 'Récolter', noun: 'récolte', icon: 'basket-outline' },
  {
    value: 'deadhead',
    label: 'Couper les fleurs fanées',
    noun: 'défloraison',
    icon: 'content-cut',
  },
  {
    value: 'winter_prep',
    label: "Préparer pour l'hiver",
    noun: 'préparation hivernale',
    icon: 'snowflake',
  },
  { value: 'custom', label: 'Autre', noun: 'rappel', icon: 'bell-outline' },
];

export const SOIL_TYPES = [
  { value: 'clay', label: 'Argileux' },
  { value: 'sandy', label: 'Sableux' },
  { value: 'loamy', label: 'Limoneux' },
  { value: 'peaty', label: 'Tourbeux' },
  { value: 'rocky', label: 'Caillouteux' },
  UNKNOWN_ENTRY,
];

export const SOIL_PH = [
  { value: 'acidic', label: 'Acide' },
  { value: 'neutral', label: 'Neutre' },
  { value: 'alkaline', label: 'Alcalin' },
  UNKNOWN_ENTRY,
];

export const PROPAGATION = [
  { value: 'seed', label: 'Semis' },
  { value: 'cutting', label: 'Bouture' },
  { value: 'division', label: 'Division' },
  { value: 'layering', label: 'Marcotte' },
  { value: 'grafting', label: 'Greffe' },
];

// The plant `deciduous` column is a raw boolean (null = unknown), not an
// enum with a stored sentinel, but its two values still need one shared
// label pair rather than each screen spelling out "Caduc"/"Persistant".
export const FOLIAGE = [
  { value: true, label: 'Caduc' },
  { value: false, label: 'Persistant' },
];

export const TOXICITY = [
  { value: 'none', label: 'Aucune' },
  { value: 'pets', label: 'Animaux' },
  { value: 'humans', label: 'Humains' },
  { value: 'all', label: 'Tous' },
  UNKNOWN_ENTRY,
];

// The zone icon picker's choices: unlike every other icon in the app
// (ticket 052 — one MaterialCommunityIcons set), these are emoji a user
// picks themselves in components/ZoneForm.js, so the stored `zone.icon`
// stays this emoji (no migration). Screens never render the emoji glyph
// itself though — they look it up through `zoneIconFor` below, which maps
// it to the app's single MaterialCommunityIcons set (ticket 068).
export const ZONE_ICONS = [
  '🌱',
  '🌳',
  '🌿',
  '🪴',
  '🌺',
  '🌻',
  '🌹',
  '🍅',
  '🥕',
  '🌾',
  '🍃',
  '🪻',
  '🌵',
  '🎋',
  '🍀',
  '☘️',
];

export const DEFAULT_ZONE_ICON = '🌱';

// Per-emoji { icon, tint } for zoneIconFor below: `icon` a MaterialCommunityIcons
// name, `tint` a key of `colors` in lib/theme.js. Every ZONE_ICONS entry has
// one; lib/__tests__/enums.test.js checks both stay valid as the sets change.
const ZONE_ICON_MAP = {
  '🌱': { icon: 'sprout-outline', tint: 'softGreen' },
  '🌳': { icon: 'tree-outline', tint: 'softGreen' },
  '🌿': { icon: 'leaf', tint: 'softGreen' },
  '🪴': { icon: 'pot-mix-outline', tint: 'softGreen' },
  '🌺': { icon: 'flower-poppy', tint: 'blush' },
  '🌻': { icon: 'flower-pollen-outline', tint: 'sun' },
  '🌹': { icon: 'flower-outline', tint: 'blush' },
  '🍅': { icon: 'food-apple-outline', tint: 'blush' },
  '🥕': { icon: 'carrot', tint: 'sun' },
  '🌾': { icon: 'barley', tint: 'sun' },
  '🍃': { icon: 'leaf-maple', tint: 'softGreen' },
  '🪻': { icon: 'flower-tulip-outline', tint: 'blush' },
  '🌵': { icon: 'cactus', tint: 'sun' },
  '🎋': { icon: 'grass', tint: 'softGreen' },
  '🍀': { icon: 'clover', tint: 'softGreen' },
  '☘️': { icon: 'spa-outline', tint: 'softGreen' },
};

/**
 * `{ icon, tint }` for a zone's stored emoji (ticket 068): `icon` a
 * MaterialCommunityIcons name to render instead of the emoji glyph, `tint`
 * a key of `colors` for the icon's background square. Falls back to
 * DEFAULT_ZONE_ICON's own mapping for an emoji outside ZONE_ICONS, or none
 * at all (a zone created before this ticket may have no icon set).
 */
export function zoneIconFor(emoji) {
  return ZONE_ICON_MAP[emoji] ?? ZONE_ICON_MAP[DEFAULT_ZONE_ICON];
}

// Garden features drawn on the plan only (ticket 110): landmarks that never
// hold plants. Values are stored in plan_features.kind; no "Pelouse" (the
// plan's background is the lawn).
export const PLAN_FEATURE_KINDS = [
  { value: 'house', label: 'Maison' },
  { value: 'shed', label: 'Abri' },
  { value: 'terrace', label: 'Terrasse' },
  { value: 'path', label: 'Allée' },
  { value: 'pond', label: 'Bassin' },
  { value: 'fence', label: 'Clôture' },
  { value: 'other', label: 'Autre' },
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
