"""Plant search server.

Holds the OpenAI API key server-side and builds the prompt itself, so the
client never sees a credential and can never send an arbitrary prompt to
OpenAI (this is not a generic relay).
"""

import asyncio
import hmac
import json
import logging
import os
import time
import urllib.parse
from collections import OrderedDict, deque
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

logger = logging.getLogger("plant_search")

OPENAI_URL = "https://api.openai.com/v1/chat/completions"

RATE_LIMIT_MAX_REQUESTS = 20
RATE_LIMIT_WINDOW_SECONDS = 60

SEARCH_DAILY_BUDGET_DEFAULT = 500

MIN_API_TOKEN_LENGTH = 32

WIKIPEDIA_SUMMARY_URL = "https://en.wikipedia.org/api/rest_v1/page/summary/{title}"
WIKIPEDIA_USER_AGENT = "PlantsApp/1.0 (https://github.com/bacm/plants)"
# Wikimedia serves originals from upload. and scaled thumbnails from thumb.
WIKIPEDIA_IMAGE_PREFIXES = ("https://upload.wikimedia.org/", "https://thumb.wikimedia.org/")
IMAGE_CACHE_MAX_ENTRIES = 512

_MISSING = object()
_image_cache = OrderedDict()


def _cache_get(key):
    if key in _image_cache:
        _image_cache.move_to_end(key)
        return _image_cache[key]
    return _MISSING


def _cache_set(key, value):
    _image_cache[key] = value
    _image_cache.move_to_end(key)
    while len(_image_cache) > IMAGE_CACHE_MAX_ENTRIES:
        _image_cache.popitem(last=False)


def _valid_wikimedia_url(url):
    return isinstance(url, str) and url.startswith(WIKIPEDIA_IMAGE_PREFIXES)


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


class DailyBudget:
    """Caps the number of upstream OpenAI calls across all clients per UTC day.

    The count resets whenever the UTC calendar date changes. Only calls that
    actually reach OpenAI should consume budget; the caller decides that by
    only calling `try_spend()` right before the upstream request. The clock
    is injectable so tests can drive it without sleeping.
    """

    def __init__(self, limit, clock=lambda: datetime.now(timezone.utc)):
        self.limit = limit
        self.clock = clock
        self._date = None
        self._count = 0
        self._warned_date = None

    def _roll_if_new_day(self):
        today = self.clock().date()
        if today != self._date:
            self._date = today
            self._count = 0

    def try_spend(self):
        self._roll_if_new_day()
        if self._count >= self.limit:
            return False
        self._count += 1
        return True

    def should_warn(self):
        """True the first time the budget is hit on a given UTC day."""
        self._roll_if_new_day()
        if self._warned_date == self._date:
            return False
        self._warned_date = self._date
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


async def fetch_wikipedia_image(client, scientific_name):
    """Look up a real image URL for a plant on Wikipedia.

    Returns None on any failure (network error, timeout, non-200 response,
    or missing image field) so a lookup problem never fails the search.
    Results (including negative ones) are cached by lowercased scientific
    name to avoid repeat lookups.
    """
    if not scientific_name:
        return None
    cache_key = scientific_name.strip().lower()
    if not cache_key:
        return None

    cached = _cache_get(cache_key)
    if cached is not _MISSING:
        return cached

    title = urllib.parse.quote(scientific_name.strip().replace(" ", "_"))
    url = WIKIPEDIA_SUMMARY_URL.format(title=title)
    result = None
    try:
        response = await client.get(
            url,
            headers={"User-Agent": WIKIPEDIA_USER_AGENT},
            timeout=5,
            follow_redirects=True,
        )
        if response.status_code == 200:
            data = response.json()
            # Prefer the scaled thumbnail: the original can be several MB and the
            # app only shows it as a small picture.
            for field in ("thumbnail", "originalimage"):
                image = data.get(field)
                candidate = image.get("source") if isinstance(image, dict) else None
                if _valid_wikimedia_url(candidate):
                    result = candidate
                    break
        else:
            logger.debug(
                "Wikipedia image lookup for %s returned status %s", scientific_name, response.status_code
            )
    except httpx.HTTPError as exc:
        logger.debug("Wikipedia image lookup failed for %s: %s", scientific_name, exc)
    except (ValueError, KeyError) as exc:
        logger.debug("Wikipedia image lookup returned unexpected payload for %s: %s", scientific_name, exc)

    _cache_set(cache_key, result)
    return result


async def attach_images(plants):
    """Fetch real images for parsed plants, overwriting any model output.

    The model is never asked for image URLs anymore, but even if it invents
    an `image_urls` key it is discarded here in favor of a real lookup (or
    an empty list). A failing lookup never fails the whole request.
    """
    candidates = [p for p in plants if p.get("scientific_name")]
    if candidates:
        async with httpx.AsyncClient() as client:
            results = await asyncio.gather(
                *(fetch_wikipedia_image(client, p["scientific_name"]) for p in candidates),
                return_exceptions=True,
            )
        for plant, result in zip(candidates, results):
            if isinstance(result, Exception):
                logger.debug(
                    "Wikipedia image lookup raised for %s: %s", plant.get("scientific_name"), result
                )
                result = None
            plant["image_urls"] = [result] if result else []
    for plant in plants:
        plant.setdefault("image_urls", [])


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


def _is_authorized(header, tokens):
    """Check an `Authorization` header against the configured tokens.

    Requires the `Bearer` scheme (case-insensitive) and compares the
    presented token against every configured token with a constant-time
    comparison, looping over all of them rather than stopping at the first
    match, so the response time never leaks which token (if any) was close.
    """
    if not header:
        return False
    scheme, _, presented = header.partition(" ")
    if scheme.lower() != "bearer" or not presented:
        return False
    presented_bytes = presented.encode("utf-8")
    authorized = False
    for token in tokens:
        if hmac.compare_digest(presented_bytes, token.encode("utf-8")):
            authorized = True
    return authorized


def create_app():
    if "OPENAI_API_KEY" not in os.environ or not os.environ["OPENAI_API_KEY"].strip():
        raise RuntimeError(
            "OPENAI_API_KEY environment variable is required to start the plant search server."
        )

    raw_tokens = os.environ.get("API_TOKENS", "")
    api_tokens = tuple(token.strip() for token in raw_tokens.split(",") if token.strip())
    if not api_tokens:
        raise RuntimeError(
            "API_TOKENS environment variable is required to start the plant search server "
            "(comma-separated, each at least 32 characters)."
        )
    if any(len(token) < MIN_API_TOKEN_LENGTH for token in api_tokens):
        raise RuntimeError(
            f"API_TOKENS entries must each be at least {MIN_API_TOKEN_LENGTH} characters."
        )

    raw_budget = os.environ.get("SEARCH_DAILY_BUDGET")
    if raw_budget is None or not raw_budget.strip():
        daily_budget_limit = SEARCH_DAILY_BUDGET_DEFAULT
    else:
        try:
            daily_budget_limit = int(raw_budget)
        except ValueError:
            daily_budget_limit = -1
        if daily_budget_limit <= 0:
            raise RuntimeError(
                "SEARCH_DAILY_BUDGET environment variable must be a positive integer."
            )

    app = FastAPI()
    app.state.api_tokens = api_tokens

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
            allow_headers=["Content-Type", "Authorization"],
        )

    limiter = RateLimiter()
    app.state.limiter = limiter

    budget = DailyBudget(daily_budget_limit)
    app.state.budget = budget

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.post("/search")
    async def search(payload: SearchRequest, request: Request):
        client_host = request.client.host if request.client else "unknown"
        if not app.state.limiter.allow(client_host):
            raise HTTPException(status_code=429, detail="Too many requests")

        if not _is_authorized(request.headers.get("Authorization"), app.state.api_tokens):
            logger.warning("Rejected unauthorized /search request from %s", client_host)
            raise HTTPException(
                status_code=401, detail="Unauthorized", headers={"WWW-Authenticate": "Bearer"}
            )

        if not app.state.budget.try_spend():
            if app.state.budget.should_warn():
                logger.warning("Plant search daily budget of %s calls reached", app.state.budget.limit)
            raise HTTPException(status_code=503, detail="Plant search daily limit reached")

        prompt = build_prompt(payload.query)
        try:
            text = await call_openai(prompt)
        except httpx.HTTPStatusError as exc:
            logger.warning("Upstream OpenAI error: status=%s", exc.response.status_code)
            raise HTTPException(status_code=502, detail="Plant search is temporarily unavailable")
        except httpx.HTTPError as exc:
            logger.warning("Upstream OpenAI request failed: %s", type(exc).__name__)
            raise HTTPException(status_code=502, detail="Plant search is temporarily unavailable")

        plants = parse_plants(text)
        try:
            await attach_images(plants)
        except Exception as exc:  # noqa: BLE001 - a lookup failure must never fail the search
            logger.debug("Attaching plant images failed: %s", exc)
            for plant in plants:
                plant.setdefault("image_urls", [])

        return {"plants": plants}

    return app


app = create_app()
