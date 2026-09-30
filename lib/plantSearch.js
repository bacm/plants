import { searchResultToForm } from './plantFields';
import { getApiToken } from './db';

const PLANT_API_URL = process.env.EXPO_PUBLIC_PLANT_API_URL;

export class PlantSearchError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'PlantSearchError';
    this.kind = kind;
  }
}

/**
 * Classify a failed search into a stable kind, from either an HTTP status
 * code or a thrown/rejected error (e.g. a network failure).
 */
export function classifySearchFailure({ status, error } = {}) {
  if (status === 429) return 'rate_limited';
  if (status === 503) return 'daily_limit';
  if (status === 401 || status === 403) return 'unauthorized';
  if (typeof status === 'number') return 'unavailable';
  if (error instanceof TypeError) return 'offline';
  return 'unavailable';
}

export function searchErrorMessage(kind) {
  switch (kind) {
    case 'rate_limited':
      return 'Trop de recherches, réessayez dans une minute';
    case 'daily_limit':
      return 'Recherche indisponible pour aujourd’hui, réessayez demain';
    case 'offline':
      return 'Pas de connexion internet';
    case 'config':
      return 'Recherche non configurée';
    case 'no_token':
      return 'Ajoutez votre jeton d’accès dans Réglages pour activer la recherche';
    case 'unauthorized':
      return 'Jeton d’accès refusé : vérifiez-le dans Réglages';
    case 'unavailable':
    default:
      return 'Service de recherche indisponible, réessayez plus tard';
  }
}

export async function searchPlants(query) {
  const q = String(query).trim();
  if (!q || q.length < 2) return [];

  if (!PLANT_API_URL) {
    console.warn('Plant search: EXPO_PUBLIC_PLANT_API_URL is not set');
    throw new PlantSearchError('config', searchErrorMessage('config'));
  }

  const token = await getApiToken();
  if (!token) {
    throw new PlantSearchError('no_token', searchErrorMessage('no_token'));
  }

  let res;
  try {
    res = await fetch(`${PLANT_API_URL.replace(/\/$/, '')}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: q }),
    });
  } catch (err) {
    console.warn('Plant search network error:', err);
    const kind = classifySearchFailure({ error: err });
    throw new PlantSearchError(kind, searchErrorMessage(kind));
  }

  if (!res.ok) {
    console.warn('Plant search error status:', res.status);
    const kind = classifySearchFailure({ status: res.status });
    throw new PlantSearchError(kind, searchErrorMessage(kind));
  }

  const { plants = [] } = await res.json();
  return plants.map((p, i) => {
    const sciName = p.scientific_name || '';
    const imageUrls = Array.isArray(p.image_urls)
      ? p.image_urls.filter((url) => typeof url === 'string' && url.startsWith('https://'))
      : [];
    return {
      id: p.id || `${q}-${i}`,
      common_name: p.common_name || '',
      scientific_name: sciName,
      // No fallback to a guessed enum value here (ticket 046): an absent
      // field must reach searchResultToForm as absent, so it falls through
      // to plantFields.js's 'unknown' dbDefault rather than a fabricated fact.
      type: p.type || null,
      sun: p.sun || null,
      water: p.water || null,
      flower_color: p.flower_color || '',
      bloom_start: p.bloom_start || null,
      bloom_end: p.bloom_end || null,
      bloom_abundance: p.bloom_abundance || null,
      height: p.height || null,
      width: p.width || null,
      deciduous: p.deciduous ?? null,
      min_temperature: p.min_temperature ?? null,
      soil_type: p.soil_type || null,
      soil_ph: p.soil_ph || null,
      fertilizer: p.fertilizer || '',
      pruning: p.pruning || '',
      pruning_month: p.pruning_month || null,
      propagation: p.propagation || null,
      pests: p.pests || '',
      toxicity: p.toxicity || null,
      companion_plants: p.companion_plants || '',
      harvest: p.harvest || '',
      harvest_start: p.harvest_start || null,
      harvest_end: p.harvest_end || null,
      origin: p.origin || '',
      winter_care: p.winter_care || '',
      image_url: imageUrls[0] || null,
      image_urls: imageUrls,
      description: p.description || '',
    };
  });
}

export function normalizeToForm(details) {
  return searchResultToForm(details);
}
