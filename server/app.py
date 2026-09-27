"""Plant search server.

Holds the OpenAI API key server-side and builds the prompt itself, so the
client never sees a credential and can never send an arbitrary prompt to
OpenAI (this is not a generic relay).
"""

import json
import logging
import os
import time
from collections import deque

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

logger = logging.getLogger("plant_search")

OPENAI_URL = "https://api.openai.com/v1/chat/completions"

RATE_LIMIT_MAX_REQUESTS = 20
RATE_LIMIT_WINDOW_SECONDS = 60


class SearchRequest(BaseModel):
    query: str

    @field_validator("query")
    @classmethod
    def strip_and_check_length(cls, value):
        stripped = value.strip()
        if not (2 <= len(stripped) <= 100):
            raise ValueError("query must be between 2 and 100 characters after stripping")
        return stripped


class RateLimiter:
    """Rolling-window rate limiter, in memory, per key.

    Keeps a deque of request timestamps per key and drops any timestamp
    older than the window on each check. The clock is injectable so tests
    can drive it without sleeping.
    """

    def __init__(self, max_requests=RATE_LIMIT_MAX_REQUESTS, window_seconds=RATE_LIMIT_WINDOW_SECONDS, clock=time.monotonic):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.clock = clock
        self._hits = {}

    def allow(self, key):
        now = self.clock()
        cutoff = now - self.window_seconds
        hits = self._hits.setdefault(key, deque())
        while hits and hits[0] < cutoff:
            hits.popleft()
        if len(hits) >= self.max_requests:
            return False
        hits.append(now)
        return True


def build_prompt(query):
    return f"""
Tu es une base de données botanique. Pour la recherche "{query}", fournis une liste de 5 plantes max au format JSON exact ci-dessous, sans autre texte:

[
  {{
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
    "soil_type": "clay|sandy|loamy|peaty|rocky",
    "soil_ph": "acidic|neutral|alkaline",
    "fertilizer": "conseils d'engrais",
    "pruning": "conseils de taille",
    "pruning_month": 1-12,
    "propagation": "seed|cutting|division|layering|grafting",
    "pests": "ravageurs et maladies courants",
    "toxicity": "none|pets|humans|all",
    "companion_plants": "plantes compagnes",
    "harvest": "informations de récolte",
    "harvest_start": 1-12,
    "harvest_end": 1-12,
    "origin": "région d'origine",
    "winter_care": "conseils d'entretien hivernal",
    "image_urls": ["url1", "url2", "url3"],
    "description": "courte description"
  }}
]

RÈGLES:
- common_name: nom commun de la plante en français
- scientific_name: nom latin de la plante
- soil_type: type de sol préféré (clay=argileux, sandy=sableux, loamy=limoneux, peaty=tourbeux, rocky=caillouteux)
- soil_ph: pH du sol (acidic=acide, neutral=neutre, alkaline=alcalin)
- propagation: méthode de multiplication (seed=semis, cutting=bouture, division=division, layering=marcotte, grafting=greffe)
- toxicity: toxicité (none=aucune, pets=animaux, humans=humains, all=tous)
- image_urls: 3 URLs valides d'images (OBLIGATOIRE, ne pas laisser de tableau vide)
- Respecte exactement ce format JSON
- Laisse null pour les champs inconnus
"""


async def call_openai(prompt):
    api_key = os.environ["OPENAI_API_KEY"]
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            OPENAI_URL,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.3,
                "max_tokens": 3000,
            },
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"] or ""


def parse_plants(text):
    match = None
    start = text.find("[")
    if start != -1:
        end = text.rfind("]")
        if end != -1 and end > start:
            match = text[start : end + 1]
    if match is None:
        return []
    try:
        parsed = json.loads(match)
    except (json.JSONDecodeError, ValueError):
        return []
    if not isinstance(parsed, list):
        return []
    plants = [item for item in parsed if isinstance(item, dict)]
    return plants[:5]


def create_app():
    if "OPENAI_API_KEY" not in os.environ or not os.environ["OPENAI_API_KEY"].strip():
        raise RuntimeError(
            "OPENAI_API_KEY environment variable is required to start the plant search server."
        )

    app = FastAPI()

    allowed_origins = [
        origin.strip()
        for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",")
        if origin.strip()
    ]
    if allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=allowed_origins,
            allow_methods=["GET", "POST"],
            allow_headers=["Content-Type"],
        )

    limiter = RateLimiter()
    app.state.limiter = limiter

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.post("/search")
    async def search(payload: SearchRequest, request: Request):
        client_host = request.client.host if request.client else "unknown"
        if not app.state.limiter.allow(client_host):
            raise HTTPException(status_code=429, detail="Too many requests")

        prompt = build_prompt(payload.query)
        try:
            text = await call_openai(prompt)
        except httpx.HTTPStatusError as exc:
            logger.warning("Upstream OpenAI error: status=%s", exc.response.status_code)
            raise HTTPException(status_code=502, detail="Plant search is temporarily unavailable")
        except httpx.HTTPError as exc:
            logger.warning("Upstream OpenAI request failed: %s", type(exc).__name__)
            raise HTTPException(status_code=502, detail="Plant search is temporarily unavailable")

        return {"plants": parse_plants(text)}

    return app


app = create_app()
