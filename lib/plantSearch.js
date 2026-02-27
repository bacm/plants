/**
 * Recherche d’infos plante via l’API Perenual.
 * Pré-remplit les champs du formulaire (nom latin, type, exposition, arrosage, floraison, etc.).
 */

const PERENUAL_BASE = 'https://perenual.com/api/v2';
const MAX_SEARCH_RESULTS = 10;

function getApiKey() {
  return typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_PERENUAL_API_KEY?.trim() || null;
}

/**
 * Recherche des espèces par nom (commun ou scientifique).
 * @param {string} query - Terme de recherche
 * @returns {Promise<Array<{ id: number, common_name: string, scientific_name: string[] }>>}
 */
export async function searchPlants(query) {
  const key = getApiKey();
  if (!key) {
    throw new Error('Clé API Perenual manquante. Ajoutez EXPO_PUBLIC_PERENUAL_API_KEY dans .env');
  }
  const q = encodeURIComponent(String(query).trim());
  if (!q) return [];
  const url = `${PERENUAL_BASE}/species-list?key=${key}&q=${q}&per_page=${MAX_SEARCH_RESULTS}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 401) throw new Error('Clé API Perenual invalide.');
    if (res.status >= 500) throw new Error('Service Perenual indisponible.');
    throw new Error(`Recherche impossible (${res.status}).`);
  }
  const data = await res.json();
  const list = data?.data || [];
  return list.map((item) => ({
    id: item.id,
    common_name: item.common_name || '',
    scientific_name: Array.isArray(item.scientific_name) ? item.scientific_name : [],
  }));
}

/**
 * Récupère les détails d’une espèce par ID.
 * @param {number} id - ID Perenual
 * @returns {Promise<object>} Réponse brute de l’API
 */
export async function getPlantDetails(id) {
  const key = getApiKey();
  if (!key) {
    throw new Error('Clé API Perenual manquante. Ajoutez EXPO_PUBLIC_PERENUAL_API_KEY dans .env');
  }
  const url = `${PERENUAL_BASE}/species/details/${id}?key=${key}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 401) throw new Error('Clé API Perenual invalide.');
    if (res.status === 404) throw new Error('Espèce introuvable.');
    throw new Error(`Détails indisponibles (${res.status}).`);
  }
  return res.json();
}

/** Mapping Perenual type/cycle → notre type (db.js PLANT_TYPES) */
const TYPE_MAP = {
  tree: 'tree',
  shrub: 'shrub',
  vine: 'vine',
  grass: 'groundcover',
  herb: 'perennial', // fallback, overridden by cycle
};
const CYCLE_MAP = {
  perennial: 'perennial',
  annual: 'annual',
  biennial: 'perennial',
  biannial: 'perennial',
};

/** Mapping Perenual sunlight → notre sun (db.js SUN) */
function mapSunlight(sunlight) {
  const arr = Array.isArray(sunlight) ? sunlight : [];
  const s = arr.map((x) => String(x || '').toLowerCase());
  if (s.some((x) => x.includes('full shade') || x === 'full_shade')) return 'shade';
  if (s.some((x) => x.includes('part shade') || x.includes('sun-part') || x === 'part_shade' || x === 'sun-part_shade')) return 'partial';
  if (s.some((x) => x.includes('full sun') || x === 'full_sun')) return 'full_sun';
  return 'partial';
}

/** Mapping Perenual watering → notre water (db.js WATER) */
function mapWatering(watering) {
  const w = String(watering || '').toLowerCase();
  if (w.includes('frequent') || w.includes('high')) return 'high';
  if (w.includes('minimum') || w.includes('none') || w.includes('low')) return 'low';
  return 'medium';
}

/** Saison de floraison → mois début, fin (1–12) */
const FLOWERING_MONTHS = {
  spring: { start: 3, end: 5 },
  summer: { start: 6, end: 8 },
  autumn: { start: 9, end: 11 },
  fall: { start: 9, end: 11 },
  winter: { start: 12, end: 2 },
};

/**
 * Normalise la réponse Perenual en objet formulaire (champs de app/plant/new.js).
 * @param {object} details - Réponse de getPlantDetails()
 * @returns {object} { name, latinName, type, sun, water, flowerColor, bloomStartMonth, bloomEndMonth, notes }
 */
export function normalizeToForm(details) {
  const commonName = details?.common_name?.trim() || '';
  const scientificNames = Array.isArray(details?.scientific_name) ? details.scientific_name : [];
  const latinName = scientificNames[0]?.trim() || '';

  let type = 'perennial';
  const perenualType = String(details?.type || '').toLowerCase();
  const cycle = String(details?.cycle || '').toLowerCase();
  if (TYPE_MAP[perenualType]) {
    type = TYPE_MAP[perenualType];
  }
  if (CYCLE_MAP[cycle]) {
    type = CYCLE_MAP[cycle];
  }
  if (perenualType === 'herb' && cycle === 'annual') type = 'annual';

  const sun = mapSunlight(details?.sunlight);
  const water = mapWatering(details?.watering);

  let flowerColor = '';
  const anatomy = Array.isArray(details?.plant_anatomy) ? details.plant_anatomy : [];
  const flowersPart = anatomy.find((a) => a?.part === 'flowers' || a?.part === 'flower');
  if (flowersPart?.color?.length) {
    flowerColor = flowersPart.color.join(', ');
  }

  let bloomStartMonth = null;
  let bloomEndMonth = null;
  const season = String(details?.flowering_season || '').toLowerCase().trim();
  if (season) {
    const months = FLOWERING_MONTHS[season];
    if (months) {
      bloomStartMonth = months.start;
      bloomEndMonth = months.end;
    }
  }

  const parts = [];
  if (details?.origin?.length) parts.push(`Origine: ${details.origin.join(', ')}`);
  if (details?.family) parts.push(`Famille: ${details.family}`);
  const notes = parts.join('. ').trim() || '';

  return {
    name: commonName,
    latinName,
    type,
    sun,
    water,
    flowerColor,
    bloomStartMonth,
    bloomEndMonth,
    notes,
  };
}

export { getApiKey };
