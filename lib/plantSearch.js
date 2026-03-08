const OPENAI_BASE = 'https://api.openai.com/v1';

function getApiKeyFromEnv() {
  return process.env?.EXPO_PUBLIC_OPENAI_API_KEY?.trim() || null;
}

async function callOpenAI(prompt) {
  const key = getApiKeyFromEnv();
  if (!key) {
    throw new Error('Clé API OpenAI manquante. Ajoutez OPENAI_API_KEY dans .env');
  }
  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Erreur OpenAI: ${res.status} - ${err}`);
  }
  const data = await res.json();
  return data.choices[0]?.message?.content || '';
}

function getWikipediaImages(scientificName) {
  if (!scientificName) return [];
  const encoded = encodeURIComponent(scientificName.replace(/ /g, '_'));
  return [
    `https://en.wikipedia.org/wiki/${encoded}`,
    `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}.jpg`,
    `https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Flower_poster_2.jpg/440px-Flower_poster_2.jpg`,
  ];
}

export async function searchPlants(query) {
  const q = String(query).trim();
  if (!q || q.length < 2) return [];

  const prompt = `
Tu es une base de données botanique. Pour la recherche "${q}", fournis une liste de 5 plantes max au format JSON exact ci-dessous, sans autre texte:

[
  {
    "id": "nom-commun-1",
    "common_name": "nom commun",
    "scientific_name": "nom latin",
    "type": "perennial|annual|shrub|tree|bulb|groundcover|vine",
    "sun": "full_sun|partial|shade",
    "water": "low|medium|high",
    "flower_color": "couleur des fleurs",
    "bloom_start": 1-12,
    "bloom_end": 1-12,
    "height": 50,
    "width": 30,
    "deciduous": true,
    "min_temperature": -10,
    "image_urls": ["https://example.com/image1.jpg", "https://example.com/image2.jpg", "https://example.com/image3.jpg"],
    "description": "courte description"
  }
]

RÈGLES:
- common_name: nom commun de la plante en français
- scientific_name: nom latin de la plante
- image_urls: 3 URLs valides d'images (OBLIGATOIRE, ne pas laisser de tableau vide)
- Respecte exactement ce format JSON
`;

  try {
    const response = await callOpenAI(prompt);
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    
    const plants = JSON.parse(jsonMatch[0]);
    return plants.map((p, i) => {
      const sciName = p.scientific_name || '';
      const fallbackImages = sciName ? getWikipediaImages(sciName) : [];
      const imageUrls = p.image_urls?.filter(Boolean)?.length > 0 ? p.image_urls : fallbackImages;
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

const TYPE_MAP = {
  tree: 'tree',
  shrub: 'shrub',
  vine: 'vine',
  bulb: 'bulb',
  groundcover: 'groundcover',
  perennial: 'perennial',
  annual: 'annual',
};

const SUN_MAP = {
  full_sun: 'full_sun',
  partial: 'partial',
  shade: 'shade',
};

const WATER_MAP = {
  low: 'low',
  medium: 'medium',
  high: 'high',
};

export function normalizeToForm(details) {
  if (!details) {
    return {
      name: '',
      latinName: '',
      type: 'perennial',
      sun: 'partial',
      water: 'medium',
      flowerColor: '',
      bloomStartMonth: null,
      bloomEndMonth: null,
      height: '',
      width: '',
      deciduous: null,
      minTemperature: '',
      notes: '',
    };
  }

  return {
    name: details.common_name || '',
    latinName: details.scientific_name || '',
    type: TYPE_MAP[details.type] || 'perennial',
    sun: SUN_MAP[details.sun] || 'partial',
    water: WATER_MAP[details.water] || 'medium',
    flowerColor: details.flower_color || '',
    bloomStartMonth: details.bloom_start || null,
    bloomEndMonth: details.bloom_end || null,
    height: details.height?.toString() || '',
    width: details.width?.toString() || '',
    deciduous: details.deciduous,
    minTemperature: details.min_temperature?.toString() || '',
    notes: details.description || '',
  };
}

export { getApiKeyFromEnv as getApiKey };
