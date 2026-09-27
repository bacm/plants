import { searchResultToForm } from './plantFields';

const PLANT_API_URL = process.env.EXPO_PUBLIC_PLANT_API_URL;

export async function searchPlants(query) {
  const q = String(query).trim();
  if (!q || q.length < 2) return [];

  try {
    if (!PLANT_API_URL) {
      throw new Error('URL du service de recherche manquante. Ajoutez EXPO_PUBLIC_PLANT_API_URL dans .env');
    }
    const res = await fetch(`${PLANT_API_URL.replace(/\/$/, '')}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q }),
    });
    if (res.status === 429) {
      throw new Error('Trop de recherches, réessayez dans une minute');
    }
    if (res.status === 503) {
      throw new Error('Recherche indisponible pour aujourd’hui, réessayez demain');
    }
    if (!res.ok) {
      throw new Error(`Erreur du service de recherche: ${res.status}`);
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
        type: p.type || 'perennial',
        sun: p.sun || 'partial',
        water: p.water || 'medium',
        flower_color: p.flower_color || '',
        bloom_start: p.bloom_start || null,
        bloom_end: p.bloom_end || null,
        height: p.height || null,
        width: p.width || null,
        deciduous: p.deciduous ?? null,
        min_temperature: p.min_temperature ?? null,
        soil_type: p.soil_type || 'loamy',
        soil_ph: p.soil_ph || 'neutral',
        fertilizer: p.fertilizer || '',
        pruning: p.pruning || '',
        pruning_month: p.pruning_month || null,
        propagation: p.propagation || null,
        pests: p.pests || '',
        toxicity: p.toxicity || 'none',
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
  } catch (err) {
    console.error('OpenAI search error:', err);
    return [];
  }
}

export async function getPlantDetails(id) {
  const plants = await searchPlants(id.replace(/-/g, ' '));
  return plants[0] || null;
}

export function normalizeToForm(details) {
  return searchResultToForm(details);
}

