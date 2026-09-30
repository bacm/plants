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
import threading
import time
import urllib.parse
from collections import OrderedDict, deque
from datetime import datetime, timezone
from typing import Any, Literal, Optional

import httpx
from fastapi import Body, FastAPI, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

from accounts import (
    SESSION_LIFETIME,
    AccountStore,
    normalize_email,
    password_problem,
)
from photo_files import MAX_PHOTO_BYTES, MEDIA_TYPES, PhotoFiles, detect_extension, valid_photo_id
from sync_store import SyncStore
from sync_validation import SyncValidationError, validate_push

logger = logging.getLogger("plant_search")

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
# The client only chooses between these two, never the model name.
SEARCH_MODEL = "gpt-4o-mini"
PRECISE_SEARCH_MODEL = "gpt-5.5"

RATE_LIMIT_MAX_REQUESTS = 20
RATE_LIMIT_WINDOW_SECONDS = 60

SEARCH_DAILY_BUDGET_DEFAULT = 500

SYNC_DB_PATH_DEFAULT = "data/garden.db"

SESSION_COOKIE = "__Host-session"
STATE_CHANGING_METHODS = ("POST", "PUT", "PATCH", "DELETE")

SIGNUP_LIMIT = 5
SIGNUP_WINDOW_SECONDS = 3600
# Signups waiting for the owner's approval. Beyond this the form closes, so a
# bot cannot bury the owner under thousands of pending accounts.
PENDING_ACCOUNTS_CAP = 50
LOGIN_FAILURES_PER_IP = 20
LOGIN_FAILURES_WINDOW_SECONDS = 15 * 60
MAX_DEVICE_NAME_LENGTH = 100

NOT_APPROVED_DETAILS = {
    "pending": "Compte en attente d'approbation",
    "refused": "Compte refusé",
    "disabled": "Compte désactivé",
}

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
    precise: bool = False

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

    def _prune(self, key):
        cutoff = self.clock() - self.window_seconds
        hits = self._hits.setdefault(key, deque())
        while hits and hits[0] < cutoff:
            hits.popleft()
        return hits

    def is_full(self, key):
        """True if `key` already used up its quota, without counting a hit."""
        return len(self._prune(key)) >= self.max_requests

    def record(self, key):
        """Count a hit unconditionally (used to count only failures)."""
        self._prune(key).append(self.clock())

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


class SignupRequest(BaseModel):
    email: str
    password: str
    # Honeypot: hidden in the form, so only a bot fills it in.
    website: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str
    client: Literal["web", "device"]
    deviceName: Optional[str] = None


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
    "bloom_abundance": "insignificant|moderate|abundant",
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
- bloom_abundance: abondance de la floraison (insignificant=fleurs présentes mais discrètes, sans valeur ornementale, ex. la plupart des érables et de nombreuses graminées; moderate=modérée; abundant=floraison massive et spectaculaire, ex. les rosiers); null si la plante ne fleurit pas ou si inconnu
- Respecte exactement ce format JSON
- Laisse null pour les champs inconnus
"""


def openai_request_body(prompt, precise):
    messages = [{"role": "user", "content": prompt}]
    if precise:
        # Reasoning models reject temperature/max_tokens, and reasoning tokens
        # count against max_completion_tokens, hence the larger cap.
        return {
            "model": PRECISE_SEARCH_MODEL,
            "messages": messages,
            "reasoning_effort": "low",
            "max_completion_tokens": 16000,
        }
    return {
        "model": SEARCH_MODEL,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 3000,
    }


async def call_openai(prompt, precise=False):
    api_key = os.environ["OPENAI_API_KEY"]
    timeout = 90 if precise else 30
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            OPENAI_URL,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            json=openai_request_body(prompt, precise),
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


def _client_host(request):
    return request.client.host if request.client else "unknown"


def _bearer_token(header):
    """The token of an `Authorization: Bearer <token>` header, else None."""
    if not header:
        return None
    scheme, _, presented = header.partition(" ")
    if scheme.lower() != "bearer" or not presented.strip():
        return None
    return presented.strip()


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
    sync_db_path = os.environ.get("SYNC_DB_PATH") or SYNC_DB_PATH_DEFAULT
    sync_store_lock = threading.Lock()

    def get_sync_store():
        # Opened on first use, so importing the module (which builds the
        # module-level `app`) never creates a database file.
        with sync_store_lock:
            if getattr(app.state, "sync_store", None) is None:
                app.state.sync_store = SyncStore(sync_db_path)
            return app.state.sync_store

    account_store_lock = threading.Lock()

    def get_account_store():
        # Same lazy opening as the sync store, on the same SQLite file.
        with account_store_lock:
            if getattr(app.state, "account_store", None) is None:
                app.state.account_store = AccountStore(sync_db_path)
            return app.state.account_store

    photo_files = PhotoFiles(os.path.join(os.path.dirname(os.path.abspath(sync_db_path)), "photos"))

    allowed_origins = [
        origin.strip()
        for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",")
        if origin.strip()
    ]
    if allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=allowed_origins,
            # The web app sends its session cookie with fetch credentials:
            # 'include'. Credentials require explicit origins, never "*".
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT"],
            allow_headers=["Content-Type", "Authorization"],
        )

    limiter = RateLimiter()
    app.state.limiter = limiter

    budget = DailyBudget(daily_budget_limit)
    app.state.budget = budget

    signup_limiter = RateLimiter(SIGNUP_LIMIT, SIGNUP_WINDOW_SECONDS)
    app.state.signup_limiter = signup_limiter
    # Only failed logins are recorded in this one.
    login_failure_limiter = RateLimiter(LOGIN_FAILURES_PER_IP, LOGIN_FAILURES_WINDOW_SECONDS)
    app.state.login_failure_limiter = login_failure_limiter

    def check_origin(request, required):
        """CSRF guard: the Origin header must be one of ALLOWED_ORIGINS.

        `required` is True for requests authenticated by the cookie, which the
        browser attaches by itself to a forged cross-site request. Login and
        signup (no cookie yet) only check it when the browser sent one, which
        it always does on a cross-origin POST. The phone sends no Origin.
        """
        origin = request.headers.get("Origin")
        if origin is None and not required:
            return
        if origin not in allowed_origins:
            logger.warning(
                "Rejected %s %s from %s: origin refused (%s)",
                request.method,
                request.url.path,
                _client_host(request),
                "missing" if origin is None else "not allowed",
            )
            raise HTTPException(status_code=403, detail="Origine refusée")

    def authenticate(request):
        """The approved account behind the request's credential, or None.

        `Authorization: Bearer` is a device token; without that header the
        `__Host-session` cookie is a web session. A bearer header that does not
        resolve is final: it never falls back to the cookie. Cookie-authenticated
        requests that change data are CSRF-checked. The account is left on
        `request.state.account` (the data is not scoped per account yet; 100).
        """
        header = request.headers.get("Authorization")
        if header:
            token = _bearer_token(header)
            via_cookie = False
            kind = "device"
        else:
            token = request.cookies.get(SESSION_COOKIE)
            via_cookie = True
            kind = "session"
        if not token:
            return None
        account = get_account_store().resolve_token(token, kind)
        if account is None:
            return None
        if via_cookie and request.method in STATE_CHANGING_METHODS:
            check_origin(request, True)
        request.state.account = account
        return account

    def current_account(request):
        """Auth dependency of every data route: the account or a 401.

        NOTE: the sync store and photo files are not scoped per account yet
        (ticket 100); until then every approved account reaches the same garden.
        """
        account = authenticate(request)
        if account is None:
            logger.warning(
                "Rejected unauthenticated %s %s from %s",
                request.method,
                request.url.path,
                _client_host(request),
            )
            raise HTTPException(
                status_code=401, detail="Unauthorized", headers={"WWW-Authenticate": "Bearer"}
            )
        return account

    def public_account(account):
        return {"id": account["id"], "email": account["email"], "isAdmin": account["isAdmin"]}

    def too_many_attempts(seconds):
        minutes = max(1, -(-int(seconds) // 60))
        return HTTPException(
            status_code=429,
            detail=f"Trop de tentatives. Réessayez dans {minutes} minutes.",
            headers={"Retry-After": str(max(1, int(seconds)))},
        )

    @app.post("/auth/signup", status_code=202)
    def signup(payload: SignupRequest, request: Request):
        host = _client_host(request)
        check_origin(request, False)
        if not signup_limiter.allow(host):
            logger.warning("Rejected signup from %s: rate limited", host)
            raise HTTPException(
                status_code=429,
                detail="Trop de demandes. Réessayez plus tard.",
                headers={"Retry-After": str(SIGNUP_WINDOW_SECONDS)},
            )
        if payload.website.strip():
            # Answers like a success so the bot learns nothing; stores nothing.
            logger.warning("Rejected signup from %s: honeypot filled", host)
            return {"status": "pending"}
        email = normalize_email(payload.email)
        if email is None:
            raise HTTPException(status_code=400, detail="Adresse e-mail invalide.")
        problem = password_problem(payload.password)
        if problem:
            raise HTTPException(status_code=400, detail=problem)
        store = get_account_store()
        if store.count_pending() >= PENDING_ACCOUNTS_CAP:
            logger.warning("Signups closed: %s pending accounts (request from %s)", PENDING_ACCOUNTS_CAP, host)
            raise HTTPException(status_code=503, detail="Inscriptions temporairement fermées")
        # Same answer whether or not the email already had an account.
        if not store.create_pending(email, payload.password):
            logger.info("Signup from %s for an existing account", host)
        return {"status": "pending"}

    @app.post("/auth/login")
    def login(payload: LoginRequest, request: Request, response: Response):
        host = _client_host(request)
        check_origin(request, False)
        if login_failure_limiter.is_full(host):
            logger.warning("Rejected login from %s: too many failures from this address", host)
            raise too_many_attempts(LOGIN_FAILURES_WINDOW_SECONDS)
        store = get_account_store()
        result = store.verify_login(payload.email, payload.password)
        if result.outcome == "locked":
            login_failure_limiter.record(host)
            logger.warning("Rejected login from %s: account %s locked", host, result.account_id)
            raise too_many_attempts((result.until - datetime.now(timezone.utc)).total_seconds())
        if result.outcome == "bad_credentials":
            login_failure_limiter.record(host)
            logger.warning(
                "Rejected login from %s: bad credentials (account %s)", host, result.account_id or "unknown"
            )
            raise HTTPException(status_code=401, detail="Identifiants invalides")
        if result.outcome == "not_approved":
            # The status is revealed only because the password was right.
            logger.warning(
                "Rejected login from %s: account %s is %s", host, result.account_id, result.status
            )
            raise HTTPException(status_code=403, detail=NOT_APPROVED_DETAILS[result.status])

        body = {"account": public_account(result.account)}
        if payload.client == "web":
            token = store.issue_credential(result.account_id, "session", "web")
            response.set_cookie(
                SESSION_COOKIE,
                token,
                max_age=int(SESSION_LIFETIME.total_seconds()),
                path="/",
                secure=True,
                httponly=True,
                samesite="strict",
            )
        else:
            label = (payload.deviceName or "").strip()[:MAX_DEVICE_NAME_LENGTH] or "device"
            body["token"] = store.issue_credential(result.account_id, "device", label)
        return body

    @app.post("/auth/logout", status_code=204)
    def logout(request: Request):
        account = current_account(request)
        get_account_store().revoke_credential(account["credential"])
        response = Response(status_code=204)
        response.set_cookie(
            SESSION_COOKIE,
            "",
            max_age=0,
            path="/",
            secure=True,
            httponly=True,
            samesite="strict",
        )
        return response

    @app.get("/auth/me")
    def me(request: Request):
        return public_account(current_account(request))

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.post("/search")
    async def search(payload: SearchRequest, request: Request):
        client_host = request.client.host if request.client else "unknown"
        if not app.state.limiter.allow(client_host):
            raise HTTPException(status_code=429, detail="Too many requests")

        # The legacy API_TOKENS bearer is accepted here only, because the
        # installed phone app still sends it; ticket 101 (login in the app)
        # removes it. Any approved account's credential works too.
        if not _is_authorized(
            request.headers.get("Authorization"), app.state.api_tokens
        ) and await run_in_threadpool(authenticate, request) is None:
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
            text = await call_openai(prompt, payload.precise)
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

    # Plain `def`: the sqlite calls block, so FastAPI runs them in its thread pool.
    @app.post("/sync/push")
    def sync_push(request: Request, payload: Any = Body(default=None)):
        current_account(request)
        try:
            changes = validate_push(payload)
        except SyncValidationError as exc:
            raise HTTPException(status_code=exc.status_code, detail=exc.detail)
        result = get_sync_store().push(changes)
        for table, row_id in result["deleted"]:
            if table in ("photos", "unsorted_photos"):
                photo_files.delete(row_id)
        return {"accepted": result["accepted"], "revision": result["revision"]}

    @app.get("/sync/pull")
    def sync_pull(
        request: Request,
        since: int = Query(0, ge=0),
        limit: int = Query(500, ge=1, le=1000),
    ):
        current_account(request)
        return get_sync_store().pull(since, limit)

    def check_photo_id(photo_id):
        if not valid_photo_id(photo_id):
            raise HTTPException(status_code=400, detail="Invalid photo id")

    @app.put("/photos/{photo_id}")
    async def put_photo(photo_id: str, request: Request):
        await run_in_threadpool(current_account, request)
        check_photo_id(photo_id)
        state = await run_in_threadpool(get_sync_store().photo_row_state, photo_id)
        if state is None:
            raise HTTPException(status_code=404, detail="Unknown photo")
        if state == "deleted":
            raise HTTPException(status_code=410, detail="Photo deleted")
        if photo_files.path_for(photo_id) is not None:
            return {"stored": False}

        declared = request.headers.get("Content-Length")
        if declared is not None and declared.isdigit() and int(declared) > MAX_PHOTO_BYTES:
            raise HTTPException(status_code=413, detail="Photo too large")
        chunks = []
        size = 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_PHOTO_BYTES:
                raise HTTPException(status_code=413, detail="Photo too large")
            chunks.append(chunk)
        data = b"".join(chunks)
        if not data:
            raise HTTPException(status_code=400, detail="Empty body")

        ext = detect_extension(data)
        content_type = request.headers.get("Content-Type", "").split(";")[0].strip().lower()
        if ext is None or content_type != MEDIA_TYPES[ext]:
            raise HTTPException(status_code=415, detail="Unsupported image type")

        await run_in_threadpool(photo_files.save, photo_id, data, ext)
        return JSONResponse({"stored": True}, status_code=201)

    @app.get("/photos/{photo_id}")
    def get_photo(photo_id: str, request: Request):
        current_account(request)
        check_photo_id(photo_id)
        path = photo_files.path_for(photo_id)
        if path is None:
            raise HTTPException(status_code=404, detail="No such photo")
        media_type = MEDIA_TYPES[os.path.splitext(path)[1][1:]]
        return FileResponse(
            path,
            media_type=media_type,
            headers={"Cache-Control": "private, max-age=31536000, immutable"},
        )

    return app


app = create_app()
