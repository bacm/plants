import asyncio
import os
from datetime import datetime, timezone

os.environ.setdefault("OPENAI_API_KEY", "test-key-not-real")

TOKEN = "a" * 64
SECOND_TOKEN = "b" * 64
os.environ.setdefault("API_TOKENS", TOKEN)

import httpx
import pytest
from fastapi.testclient import TestClient

import app as app_module

AUTH = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture
def client(monkeypatch):
    test_app = app_module.create_app()
    return TestClient(test_app)


def _set_call_openai(monkeypatch, result=None, exc=None):
    precise_calls = []

    async def fake_call_openai(prompt, precise=False):
        precise_calls.append(precise)
        if exc is not None:
            raise exc
        return result

    monkeypatch.setattr(app_module, "call_openai", fake_call_openai)
    return precise_calls


@pytest.fixture(autouse=True)
def _no_wikipedia_by_default(monkeypatch):
    """Every test gets a stubbed, no-op image lookup unless it opts in.

    This keeps existing tests (which assert exact response bodies) working
    without reaching the real Wikipedia API, and keeps the module-level
    image cache from leaking state between tests.
    """
    app_module._image_cache.clear()

    async def fake_fetch_wikipedia_image(client, scientific_name):
        return None

    monkeypatch.setattr(app_module, "fetch_wikipedia_image", fake_fetch_wikipedia_image)
    yield
    app_module._image_cache.clear()


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_valid_query_returns_parsed_plants(client, monkeypatch):
    text = '[{"id": "rose-1", "common_name": "Rose", "scientific_name": "Rosa"}]'
    _set_call_openai(monkeypatch, result=text)

    res = client.post("/search", json={"query": "rose"}, headers=AUTH)

    assert res.status_code == 200
    body = res.json()
    assert body["plants"] == [
        {"id": "rose-1", "common_name": "Rose", "scientific_name": "Rosa", "image_urls": []}
    ]


def test_prose_around_array_still_parses(monkeypatch, client):
    text = 'Voici le resultat:\n[{"id": "a"}, {"id": "b"}]\nMerci.'
    _set_call_openai(monkeypatch, result=text)

    res = client.post("/search", json={"query": "tulipe"}, headers=AUTH)

    assert res.status_code == 200
    assert res.json()["plants"] == [
        {"id": "a", "image_urls": []},
        {"id": "b", "image_urls": []},
    ]


def test_garbage_response_returns_empty_list(monkeypatch, client):
    _set_call_openai(monkeypatch, result="not json at all")

    res = client.post("/search", json={"query": "cactus"}, headers=AUTH)

    assert res.status_code == 200
    assert res.json() == {"plants": []}


def test_non_list_json_returns_empty_list(monkeypatch, client):
    _set_call_openai(monkeypatch, result='{"foo": "bar"}')

    res = client.post("/search", json={"query": "cactus"}, headers=AUTH)

    assert res.status_code == 200
    assert res.json() == {"plants": []}


def test_more_than_five_items_capped(monkeypatch, client):
    items = [{"id": str(i)} for i in range(8)]
    import json as jsonlib

    _set_call_openai(monkeypatch, result=jsonlib.dumps(items))

    res = client.post("/search", json={"query": "fleur"}, headers=AUTH)

    assert res.status_code == 200
    assert len(res.json()["plants"]) == 5


def test_query_too_short_rejected(client):
    res = client.post("/search", json={"query": "a"}, headers=AUTH)
    assert res.status_code == 422


def test_query_too_long_rejected(client):
    res = client.post("/search", json={"query": "a" * 101}, headers=AUTH)
    assert res.status_code == 422


def test_query_missing_rejected(client):
    res = client.post("/search", json={}, headers=AUTH)
    assert res.status_code == 422


def test_rate_limit_then_recovers_after_window(monkeypatch, client):
    _set_call_openai(monkeypatch, result="[]")

    now = [0.0]
    client.app.state.limiter.clock = lambda: now[0]
    client.app.state.limiter._hits = {}

    for _ in range(20):
        res = client.post("/search", json={"query": "rose"}, headers=AUTH)
        assert res.status_code == 200

    res = client.post("/search", json={"query": "rose"}, headers=AUTH)
    assert res.status_code == 429

    now[0] += 60.1

    res = client.post("/search", json={"query": "rose"}, headers=AUTH)
    assert res.status_code == 200


def test_prompt_no_longer_asks_for_image_urls():
    prompt = app_module.build_prompt("rose")
    assert "image_urls" not in prompt


def test_image_found_is_attached(monkeypatch, client):
    text = '[{"id": "rose-1", "scientific_name": "Rosa canina"}]'
    _set_call_openai(monkeypatch, result=text)

    async def fake_fetch(client_, scientific_name):
        assert scientific_name == "Rosa canina"
        return "https://upload.wikimedia.org/wikipedia/commons/rosa-canina.jpg"

    monkeypatch.setattr(app_module, "fetch_wikipedia_image", fake_fetch)

    res = client.post("/search", json={"query": "rosa canina"}, headers=AUTH)

    assert res.status_code == 200
    assert res.json()["plants"][0]["image_urls"] == [
        "https://upload.wikimedia.org/wikipedia/commons/rosa-canina.jpg"
    ]


def test_image_not_found_yields_empty_list(monkeypatch, client):
    text = '[{"id": "rose-1", "scientific_name": "Rosa canina"}]'
    _set_call_openai(monkeypatch, result=text)
    # The autouse fixture already stubs fetch_wikipedia_image to return None.

    res = client.post("/search", json={"query": "rosa canina"}, headers=AUTH)

    assert res.status_code == 200
    assert res.json()["plants"][0]["image_urls"] == []


def test_model_supplied_image_urls_are_discarded(monkeypatch, client):
    text = '[{"id": "rose-1", "scientific_name": "Rosa canina", "image_urls": ["https://evil.example/x.jpg"]}]'
    _set_call_openai(monkeypatch, result=text)

    async def fake_fetch(client_, scientific_name):
        return "https://upload.wikimedia.org/wikipedia/commons/real.jpg"

    monkeypatch.setattr(app_module, "fetch_wikipedia_image", fake_fetch)

    res = client.post("/search", json={"query": "rosa canina"}, headers=AUTH)

    assert res.status_code == 200
    assert res.json()["plants"][0]["image_urls"] == [
        "https://upload.wikimedia.org/wikipedia/commons/real.jpg"
    ]


def test_image_lookup_exception_does_not_fail_request(monkeypatch, client):
    text = '[{"id": "rose-1", "scientific_name": "Rosa canina"}]'
    _set_call_openai(monkeypatch, result=text)

    async def fake_fetch(client_, scientific_name):
        raise RuntimeError("boom")

    monkeypatch.setattr(app_module, "fetch_wikipedia_image", fake_fetch)

    res = client.post("/search", json={"query": "rosa canina"}, headers=AUTH)

    assert res.status_code == 200
    assert res.json()["plants"][0]["image_urls"] == []


def test_repeated_lookup_uses_cache(monkeypatch):
    # The autouse fixture stubs fetch_wikipedia_image itself; undo that so
    # this test exercises the real function, stubbing the HTTP transport
    # instead (same shared monkeypatch instance as the autouse fixture).
    monkeypatch.undo()
    app_module._image_cache.clear()
    calls = []

    async def counting_get(self, url, **kwargs):
        calls.append(url)
        request = httpx.Request("GET", url)
        return httpx.Response(
            200,
            request=request,
            json={"originalimage": {"source": "https://upload.wikimedia.org/wikipedia/commons/real.jpg"}},
        )

    monkeypatch.setattr(httpx.AsyncClient, "get", counting_get)

    async def run():
        async with httpx.AsyncClient() as http_client:
            first = await app_module.fetch_wikipedia_image(http_client, "Rosa canina")
            second = await app_module.fetch_wikipedia_image(http_client, "rosa canina")
            return first, second

    first, second = asyncio.run(run())

    assert first == "https://upload.wikimedia.org/wikipedia/commons/real.jpg"
    assert second == first
    assert len(calls) == 1


def test_non_wikimedia_upload_url_is_rejected(monkeypatch):
    monkeypatch.undo()  # exercise the real fetch_wikipedia_image, not the autouse stub
    app_module._image_cache.clear()

    async def fake_get(self, url, **kwargs):
        request = httpx.Request("GET", url)
        return httpx.Response(
            200,
            request=request,
            json={"originalimage": {"source": "https://not-wikimedia.example/image.jpg"}},
        )

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)

    async def run():
        async with httpx.AsyncClient() as http_client:
            return await app_module.fetch_wikipedia_image(http_client, "Rosa canina")

    result = asyncio.run(run())

    assert result is None


def test_upstream_error_returns_502_without_leaking_details(monkeypatch, client):
    request = httpx.Request("POST", app_module.OPENAI_URL)
    response = httpx.Response(500, request=request, text="super secret upstream body sk-leaked-key")
    exc = httpx.HTTPStatusError("upstream failed", request=request, response=response)
    _set_call_openai(monkeypatch, exc=exc)

    res = client.post("/search", json={"query": "rose"}, headers=AUTH)

    assert res.status_code == 502
    body_text = res.text
    assert "sk-leaked-key" not in body_text
    assert os.environ["OPENAI_API_KEY"] not in body_text
    assert res.json() == {"detail": "Plant search is temporarily unavailable"}


def test_wikipedia_lookup_prefers_the_thumbnail(monkeypatch):
    monkeypatch.undo()  # exercise the real fetch_wikipedia_image, not the autouse stub
    app_module._image_cache.clear()

    async def fake_get(self, url, **kwargs):
        return httpx.Response(
            200,
            request=httpx.Request("GET", url),
            json={
                "thumbnail": {"source": "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/330px-a.jpg"},
                "originalimage": {"source": "https://upload.wikimedia.org/wikipedia/commons/a.jpg"},
            },
        )

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)

    async def run():
        async with httpx.AsyncClient() as http_client:
            return await app_module.fetch_wikipedia_image(http_client, "Thumbnail preferred")

    assert asyncio.run(run()) == "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/330px-a.jpg"


def test_daily_budget_under_limit_passes(monkeypatch, client):
    _set_call_openai(monkeypatch, result="[]")
    client.app.state.budget = app_module.DailyBudget(2, clock=lambda: datetime(2026, 1, 1, tzinfo=timezone.utc))

    for _ in range(2):
        res = client.post("/search", json={"query": "rose"}, headers=AUTH)
        assert res.status_code == 200


def test_daily_budget_exceeded_returns_503_without_calling_openai(monkeypatch, client):
    calls = []

    async def fake_call_openai(prompt, precise=False):
        calls.append(prompt)
        return "[]"

    monkeypatch.setattr(app_module, "call_openai", fake_call_openai)
    client.app.state.budget = app_module.DailyBudget(1, clock=lambda: datetime(2026, 1, 1, tzinfo=timezone.utc))

    res = client.post("/search", json={"query": "rose"}, headers=AUTH)
    assert res.status_code == 200
    assert len(calls) == 1

    res = client.post("/search", json={"query": "rose"}, headers=AUTH)
    assert res.status_code == 503
    assert res.json() == {"detail": "Plant search daily limit reached"}
    assert len(calls) == 1


def test_daily_budget_warns_once_per_day(monkeypatch, client, caplog):
    _set_call_openai(monkeypatch, result="[]")
    client.app.state.budget = app_module.DailyBudget(0, clock=lambda: datetime(2026, 1, 1, tzinfo=timezone.utc))

    with caplog.at_level("WARNING"):
        for _ in range(3):
            res = client.post("/search", json={"query": "rose"}, headers=AUTH)
            assert res.status_code == 503

    warnings = [r for r in caplog.records if r.levelname == "WARNING"]
    assert len(warnings) == 1


def test_daily_budget_resets_on_next_utc_day(monkeypatch, client):
    _set_call_openai(monkeypatch, result="[]")
    current = [datetime(2026, 1, 1, 23, 59, tzinfo=timezone.utc)]
    client.app.state.budget = app_module.DailyBudget(1, clock=lambda: current[0])

    res = client.post("/search", json={"query": "rose"}, headers=AUTH)
    assert res.status_code == 200

    res = client.post("/search", json={"query": "rose"}, headers=AUTH)
    assert res.status_code == 503

    current[0] = datetime(2026, 1, 2, 0, 1, tzinfo=timezone.utc)

    res = client.post("/search", json={"query": "rose"}, headers=AUTH)
    assert res.status_code == 200


def test_validation_error_does_not_consume_budget(monkeypatch, client):
    _set_call_openai(monkeypatch, result="[]")
    budget = app_module.DailyBudget(1, clock=lambda: datetime(2026, 1, 1, tzinfo=timezone.utc))
    client.app.state.budget = budget

    res = client.post("/search", json={"query": "a"}, headers=AUTH)
    assert res.status_code == 422

    res = client.post("/search", json={"query": "rose"}, headers=AUTH)
    assert res.status_code == 200


def test_rate_limited_request_does_not_consume_budget(monkeypatch, client):
    _set_call_openai(monkeypatch, result="[]")
    budget = app_module.DailyBudget(1, clock=lambda: datetime(2026, 1, 1, tzinfo=timezone.utc))
    client.app.state.budget = budget
    client.app.state.limiter.allow = lambda key: False

    res = client.post("/search", json={"query": "rose"}, headers=AUTH)
    assert res.status_code == 429

    client.app.state.limiter.allow = lambda key: True
    res = client.post("/search", json={"query": "rose"}, headers=AUTH)
    assert res.status_code == 200


def test_invalid_search_daily_budget_fails_fast(monkeypatch):
    monkeypatch.setenv("SEARCH_DAILY_BUDGET", "not-a-number")
    with pytest.raises(RuntimeError):
        app_module.create_app()

    monkeypatch.setenv("SEARCH_DAILY_BUDGET", "0")
    with pytest.raises(RuntimeError):
        app_module.create_app()

    monkeypatch.setenv("SEARCH_DAILY_BUDGET", "-5")
    with pytest.raises(RuntimeError):
        app_module.create_app()


def test_missing_auth_header_rejected_without_calling_openai(client, monkeypatch):
    calls = []

    async def fake_call_openai(prompt, precise=False):
        calls.append(prompt)
        return "[]"

    monkeypatch.setattr(app_module, "call_openai", fake_call_openai)

    res = client.post("/search", json={"query": "rose"})

    assert res.status_code == 401
    assert res.headers["WWW-Authenticate"] == "Bearer"
    assert calls == []


def test_wrong_token_rejected(client):
    res = client.post("/search", json={"query": "rose"}, headers={"Authorization": "Bearer wrong-token-wrong-token-wrong-token"})
    assert res.status_code == 401


def test_wrong_auth_scheme_rejected(client):
    res = client.post("/search", json={"query": "rose"}, headers={"Authorization": f"Basic {TOKEN}"})
    assert res.status_code == 401


def test_lowercase_bearer_scheme_accepted(monkeypatch, client):
    _set_call_openai(monkeypatch, result="[]")

    res = client.post("/search", json={"query": "rose"}, headers={"Authorization": f"bearer {TOKEN}"})

    assert res.status_code == 200


def test_second_of_two_configured_tokens_accepted(monkeypatch):
    monkeypatch.setenv("API_TOKENS", f"{TOKEN},{SECOND_TOKEN}")
    test_app = app_module.create_app()
    local_client = TestClient(test_app)
    _set_call_openai(monkeypatch, result="[]")

    res = local_client.post(
        "/search", json={"query": "rose"}, headers={"Authorization": f"Bearer {SECOND_TOKEN}"}
    )

    assert res.status_code == 200


def test_unauthorized_request_does_not_consume_budget(monkeypatch, client):
    _set_call_openai(monkeypatch, result="[]")
    budget = app_module.DailyBudget(1, clock=lambda: datetime(2026, 1, 1, tzinfo=timezone.utc))
    client.app.state.budget = budget

    res = client.post("/search", json={"query": "rose"})
    assert res.status_code == 401

    res = client.post("/search", json={"query": "rose"}, headers=AUTH)
    assert res.status_code == 200


def test_startup_fails_without_api_tokens(monkeypatch):
    monkeypatch.delenv("API_TOKENS", raising=False)
    with pytest.raises(RuntimeError):
        app_module.create_app()


def test_startup_fails_with_empty_api_tokens(monkeypatch):
    monkeypatch.setenv("API_TOKENS", "")
    with pytest.raises(RuntimeError):
        app_module.create_app()

    monkeypatch.setenv("API_TOKENS", " , ")
    with pytest.raises(RuntimeError):
        app_module.create_app()


def test_startup_fails_with_short_token(monkeypatch):
    monkeypatch.setenv("API_TOKENS", "a" * 31)
    with pytest.raises(RuntimeError):
        app_module.create_app()


def test_health_works_without_auth_header(client):
    res = client.get("/health")
    assert res.status_code == 200


def test_precise_flag_is_passed_to_call_openai(monkeypatch, client):
    seen = _set_call_openai(monkeypatch, result="[]")
    res = client.post("/search", json={"query": "rosier", "precise": True}, headers=AUTH)
    assert res.status_code == 200
    assert seen == [True]


def test_precise_defaults_to_false(monkeypatch, client):
    seen = _set_call_openai(monkeypatch, result="[]")
    res = client.post("/search", json={"query": "rosier"}, headers=AUTH)
    assert res.status_code == 200
    assert seen == [False]


def test_non_boolean_precise_is_rejected(monkeypatch, client):
    seen = _set_call_openai(monkeypatch, result="[]")
    res = client.post("/search", json={"query": "rosier", "precise": "yes please"}, headers=AUTH)
    assert res.status_code == 422
    assert seen == []


def test_openai_request_body_default_is_unchanged():
    assert app_module.openai_request_body("p", False) == {
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": "p"}],
        "temperature": 0.3,
        "max_tokens": 3000,
    }


def test_openai_request_body_precise_uses_reasoning_model():
    body = app_module.openai_request_body("p", True)
    assert body["model"] == "gpt-5.5"
    assert body["messages"] == [{"role": "user", "content": "p"}]
    assert body["reasoning_effort"] == "low"
    assert body["max_completion_tokens"] == 16000
    assert "temperature" not in body
    assert "max_tokens" not in body
