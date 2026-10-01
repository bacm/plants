// Single definition of every `plants` table column (except `id`): its storage
// kind, default, and how it maps to and from a form value or a plant-search
// result. lib/db.js, lib/db.web.js, lib/plantSearch.js, app/plant/new.js and
// app/plant/edit.js all derive their column lists / form state / mappings from
// this file instead of each hand-writing their own copy.
//
// kind:
//   'text' - form '' <-> db value.trim() || null
//   'int'  - form numeric string <-> db integer or null
//   'enum' - fixed set of values, always has a non-null dbDefault
//   'raw'  - form value === db value, no coercion (booleans, ids, bare ints)
//   'date' - createdAt only: form 'YYYY-MM-DD' <-> db ISO string
//   'json' - imageUrls only: form value is an array of https:// strings <-> db
//            JSON string (or null when empty). The form carries it but no
//            screen renders it as an editable field.
//
// `noForm: true` marks a column the plant form must never carry: it is absent
// from emptyPlantForm / plantRowToForm / formToPlantValues, so saving the form
// neither shows nor overwrites it (planX / planY are set by the garden plan,
// ticket 105, through setPlantPosition).
//
// `searchKey` is the snake_case key normalizeToForm/plant-search results use
// for this field. Fields the search API never returns (zoneId, createdAt)
// have none and are absent from searchResultToForm's output, matching the
// original normalizeToForm.

import {
  PLANT_TYPES,
  SUN,
  WATER,
  BLOOM_ABUNDANCE,
  SOIL_TYPES,
  SOIL_PH,
  PROPAGATION,
  TOXICITY,
  enumValues,
} from './enums';

const PLANT_FIELDS = [
  { key: 'name', kind: 'text', searchKey: 'common_name' },
  { key: 'latinName', kind: 'text', searchKey: 'scientific_name' },
  {
    key: 'type',
    kind: 'enum',
    dbDefault: 'unknown',
    values: enumValues(PLANT_TYPES),
    searchKey: 'type',
  },
  { key: 'flowerColor', kind: 'text', searchKey: 'flower_color' },
  { key: 'sun', kind: 'enum', dbDefault: 'unknown', values: enumValues(SUN), searchKey: 'sun' },
  {
    key: 'water',
    kind: 'enum',
    dbDefault: 'unknown',
    values: enumValues(WATER),
    searchKey: 'water',
  },
  { key: 'bloomStartMonth', kind: 'int', month: true, searchKey: 'bloom_start' },
  { key: 'bloomEndMonth', kind: 'int', month: true, searchKey: 'bloom_end' },
  // ticket 090: how showy the bloom is; insignificant blooms are dimmed and sorted last
  {
    key: 'bloomAbundance',
    kind: 'enum',
    dbDefault: 'unknown',
    values: enumValues(BLOOM_ABUNDANCE),
    searchKey: 'bloom_abundance',
  },
  { key: 'height', kind: 'int', searchKey: 'height' },
  { key: 'width', kind: 'int', searchKey: 'width' },
  // deciduous is passed through with no fallback at all, even from search
  // results that omit it entirely (normalizeToForm did `details.deciduous`
  // with no `|| null`).
  { key: 'deciduous', kind: 'raw', searchKey: 'deciduous', noFallback: true },
  { key: 'minTemperature', kind: 'int', searchKey: 'min_temperature' },
  { key: 'zoneId', kind: 'raw' },
  { key: 'notes', kind: 'text', searchKey: 'description' },
  { key: 'createdAt', kind: 'date' },
  { key: 'imageUrls', kind: 'json', searchKey: 'image_urls' },
  // ticket 088: the photo chosen as the plant's cover; ignored when that photo is gone or moved to another plant
  { key: 'coverPhotoId', kind: 'raw' },
  {
    key: 'soilType',
    kind: 'enum',
    dbDefault: 'unknown',
    values: enumValues(SOIL_TYPES),
    searchKey: 'soil_type',
  },
  {
    key: 'soilPH',
    kind: 'enum',
    dbDefault: 'unknown',
    values: enumValues(SOIL_PH),
    searchKey: 'soil_ph',
  },
  { key: 'fertilizer', kind: 'text', searchKey: 'fertilizer' },
  { key: 'pruning', kind: 'text', searchKey: 'pruning' },
  { key: 'pruningMonth', kind: 'raw', month: true, searchKey: 'pruning_month' },
  { key: 'propagation', kind: 'raw', values: enumValues(PROPAGATION), searchKey: 'propagation' },
  { key: 'pests', kind: 'text', searchKey: 'pests' },
  {
    key: 'toxicity',
    kind: 'enum',
    dbDefault: 'unknown',
    values: enumValues(TOXICITY),
    searchKey: 'toxicity',
  },
  { key: 'companionPlants', kind: 'text', searchKey: 'companion_plants' },
  { key: 'harvest', kind: 'text', searchKey: 'harvest' },
  { key: 'harvestMonthStart', kind: 'int', month: true, searchKey: 'harvest_start' },
  { key: 'harvestMonthEnd', kind: 'int', month: true, searchKey: 'harvest_end' },
  { key: 'origin', kind: 'text', searchKey: 'origin' },
  { key: 'winterCare', kind: 'text', searchKey: 'winter_care' },
  // ticket 105: position on the garden plan, integer cm from its top-left
  // corner; null = not placed. Not part of the form (see noForm above).
  { key: 'planX', kind: 'int', noForm: true },
  { key: 'planY', kind: 'int', noForm: true },
  // ticket 108: the plant's own size on the plan, integer cm; null = not set.
  { key: 'planSizeCm', kind: 'int', noForm: true },
];

const FORM_FIELDS = PLANT_FIELDS.filter((f) => !f.noForm);

const PLANT_COLUMNS = PLANT_FIELDS.map((f) => f.key);

/**
 * Safe parse of the `imageUrls` column: invalid JSON, a non-array, or entries
 * that aren't https:// strings all resolve to an empty array rather than
 * throwing. Shared by plantRowToForm and any screen that renders a plant's
 * stored image (currently the zones list and the plant detail hero).
 */
function parseImageUrls(value) {
  if (!value) return [];
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((url) => typeof url === 'string' && url.startsWith('https://'));
}

// Blank value for the unified screen form (new.js / edit.js). Every 'int'
// field blanks to '' here because it feeds a TextInput's `value` prop, which
// must be a string.
function formBlank(f) {
  switch (f.kind) {
    case 'text':
      return '';
    case 'enum':
      return f.dbDefault;
    case 'int':
      return '';
    case 'raw':
      return null;
    case 'date':
      return '';
    case 'json':
      return [];
    default:
      return null;
  }
}

function fieldFromSearch(f, details) {
  // A search result maps onto the exact same shape a screen's form state
  // uses (formBlank), so a suggestion pick can be merged straight into it
  // with `setForm((f) => ({ ...f, ...normalizeToForm(result) }))`.
  if (!details) return formBlank(f);
  switch (f.kind) {
    case 'text':
      return details[f.searchKey] || '';
    case 'enum':
      return f.values.includes(details[f.searchKey]) ? details[f.searchKey] : f.dbDefault;
    case 'int':
      return details[f.searchKey]?.toString() || '';
    case 'raw':
      if (f.noFallback) return details[f.searchKey];
      if (f.values) return f.values.includes(details[f.searchKey]) ? details[f.searchKey] : null;
      return details[f.searchKey] || null;
    case 'json':
      return Array.isArray(details[f.searchKey])
        ? details[f.searchKey].filter(
            (url) => typeof url === 'string' && url.startsWith('https://')
          )
        : [];
    default:
      return null;
  }
}

function fieldFromRow(f, row) {
  switch (f.kind) {
    case 'text':
      return row[f.key] || '';
    case 'enum':
      return row[f.key] || f.dbDefault;
    case 'int':
      return row[f.key] != null ? String(row[f.key]) : '';
    case 'raw':
      return f.noFallback ? row[f.key] : row[f.key] || null;
    case 'date':
      return row[f.key] ? row[f.key].slice(0, 10) : '';
    case 'json':
      return parseImageUrls(row[f.key]);
    default:
      return row[f.key];
  }
}

function fieldToDb(f, form) {
  const v = form[f.key];
  switch (f.kind) {
    case 'text':
      return v?.trim() || null;
    case 'int': {
      if (!v) return null;
      const n = parseInt(v, 10);
      return Number.isNaN(n) ? null : n;
    }
    case 'enum':
    case 'raw':
      return v;
    case 'date':
      return v?.trim() ? new Date(v.trim()).toISOString() : undefined;
    case 'json': {
      const arr = Array.isArray(v) ? v : [];
      return arr.length ? JSON.stringify(arr) : null;
    }
    default:
      return v;
  }
}

/** Form state with every field at its blank/default value. */
function emptyPlantForm() {
  const form = {};
  for (const f of FORM_FIELDS) {
    form[f.key] = formBlank(f);
  }
  return form;
}

/** Builds edit.js's populate-from-row form state. */
function plantRowToForm(row) {
  const form = {};
  for (const f of FORM_FIELDS) {
    form[f.key] = fieldFromRow(f, row);
  }
  return form;
}

/** Builds the form fields normalizeToForm derives from a plant-search result. */
function searchResultToForm(details) {
  const form = {};
  for (const f of FORM_FIELDS) {
    if (!f.searchKey) continue;
    form[f.key] = fieldFromSearch(f, details);
  }
  return form;
}

/** Converts screen form state into the value shape createPlant/updatePlant expect. */
function formToPlantValues(form) {
  const values = {};
  for (const f of FORM_FIELDS) {
    values[f.key] = fieldToDb(f, form);
  }
  return values;
}

/** Column + value lists for createPlant's INSERT, with defaults applied. */
function plantInsertValues(plant) {
  const columns = [];
  const values = [];
  for (const f of PLANT_FIELDS) {
    columns.push(f.key);
    if (f.key === 'createdAt') {
      values.push(plant.createdAt || new Date().toISOString());
    } else {
      values.push(plant[f.key] ?? f.dbDefault ?? null);
    }
  }
  return { columns, values };
}

// updatePlant builds its SET clause from these keys, so they must never come
// from the caller unchecked. Unknown keys throw rather than being dropped, so a
// typo in a caller surfaces instead of silently not saving.
function pickPlantUpdates(updates) {
  const entries = [];
  for (const [key, value] of Object.entries(updates)) {
    if (!PLANT_COLUMNS.includes(key)) throw new Error(`Unknown plant field: ${key}`);
    if (value !== undefined) entries.push([key, value]);
  }
  return entries;
}

// Fields a duplicate (ticket 118) does not take from the original: they belong
// to that individual plant, not to its species sheet. Reset to their blank value.
const NOT_COPIED_FIELDS = ['notes', 'createdAt', 'coverPhotoId'];

/** "Rose" -> "Rose 2", "Rose 2" -> "Rose 3"; '' stays ''. */
function nextCopyName(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^(.*\S)\s+(\d+)$/);
  if (match) return `${match[1]} ${parseInt(match[2], 10) + 1}`;
  return `${trimmed} 2`;
}

/** Form state for a copy of `plant`: its species sheet and zone, not its own history. */
function duplicatePlantForm(plant) {
  const form = plantRowToForm(plant);
  const blank = emptyPlantForm();
  for (const key of NOT_COPIED_FIELDS) form[key] = blank[key];
  form.name = nextCopyName(form.name);
  return form;
}

export {
  NOT_COPIED_FIELDS,
  nextCopyName,
  duplicatePlantForm,
  PLANT_FIELDS,
  PLANT_COLUMNS,
  emptyPlantForm,
  plantRowToForm,
  searchResultToForm,
  formToPlantValues,
  plantInsertValues,
  pickPlantUpdates,
  parseImageUrls,
};
