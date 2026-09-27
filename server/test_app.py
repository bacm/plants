import os

os.environ.setdefault("OPENAI_API_KEY", "test-key-not-real")

import pytest
from fastapi.testclient import TestClient

import app as app_module


@pytest.fixture
def client(monkeypatch):
    test_app = app_module.create_app()
    return TestClient(test_app)


def _set_call_openai(monkeypatch, result=None, exc=None):
    async def fake_call_openai(prompt):
        if exc is not None:
            raise exc
        return result

    monkeypatch.setattr(app_module, "call_openai", fake_call_openai)


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_valid_query_returns_parsed_plants(client, monkeypatch):
    text = '[{"id": "rose-1", "common_name": "Rose", "scientific_name": "Rosa"}]'
    _set_call_openai(monkeypatch, result=text)

    res = client.post("/search", json={"query": "rose"})

    assert res.status_code == 200
    body = res.json()
    assert body["plants"] == [{"id": "rose-1", "common_name": "Rose", "scientific_name": "Rosa"}]


def test_prose_around_array_still_parses(monkeypatch, client):
    text = 'Voici le resultat:\n[{"id": "a"}, {"id": "b"}]\nMerci.'
    _set_call_openai(monkeypatch, result=text)

    res = client.post("/search", json={"query": "tulipe"})

    assert res.status_code == 200
    assert res.json()["plants"] == [{"id": "a"}, {"id": "b"}]


def test_garbage_response_returns_empty_list(monkeypatch, client):
    _set_call_openai(monkeypatch, result="not json at all")

    res = client.post("/search", json={"query": "cactus"})

    assert res.status_code == 200
    assert res.json() == {"plants": []}


def test_non_list_json_returns_empty_list(monkeypatch, client):
    _set_call_openai(monkeypatch, result='{"foo": "bar"}')

    res = client.post("/search", json={"query": "cactus"})

    assert res.status_code == 200
    assert res.json() == {"plants": []}


def test_more_than_five_items_capped(monkeypatch, client):
    items = [{"id": str(i)} for i in range(8)]
    import json as jsonlib

    _set_call_openai(monkeypatch, result=jsonlib.dumps(items))

    res = client.post("/search", json={"query": "fleur"})

    assert res.status_code == 200
    assert len(res.json()["plants"]) == 5


def test_query_too_short_rejected(client):
    res = client.post("/search", json={"query": "a"})
    assert res.status_code == 422


def test_query_too_long_rejected(client):
    res = client.post("/search", json={"query": "a" * 101})
    assert res.status_code == 422


def test_query_missing_rejected(client):
    res = client.post("/search", json={})
    assert res.status_code == 422


def test_rate_limit_then_recovers_after_window(monkeypatch, client):
    _set_call_openai(monkeypatch, result="[]")

    now = [0.0]
    client.app.state.limiter.clock = lambda: now[0]
    client.app.state.limiter._hits = {}

    for _ in range(20):
        res = client.post("/search", json={"query": "rose"})
        assert res.status_code == 200

    res = client.post("/search", json={"query": "rose"})
    assert res.status_code == 429

    now[0] += 60.1

    res = client.post("/search", json={"query": "rose"})
    assert res.status_code == 200


def test_upstream_error_returns_502_without_leaking_details(monkeypatch, client):
    import httpx

    request = httpx.Request("POST", app_module.OPENAI_URL)
    response = httpx.Response(500, request=request, text="super secret upstream body sk-leaked-key")
    exc = httpx.HTTPStatusError("upstream failed", request=request, response=response)
    _set_call_openai(monkeypatch, exc=exc)

    res = client.post("/search", json={"query": "rose"})

    assert res.status_code == 502
    body_text = res.text
    assert "sk-leaked-key" not in body_text
    assert os.environ["OPENAI_API_KEY"] not in body_text
    assert res.json() == {"detail": "Plant search is temporarily unavailable"}
