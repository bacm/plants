import os

os.environ.setdefault("OPENAI_API_KEY", "test-key-not-real")
TOKEN = "a" * 64
os.environ.setdefault("API_TOKENS", TOKEN)

import pytest
from fastapi.testclient import TestClient

import app as app_module
from conftest import approved_device_token
from sync_store import SyncStore



@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "sub" / "garden.db"


@pytest.fixture
def client(monkeypatch, db_path):
    monkeypatch.setenv("SYNC_DB_PATH", str(db_path))
    test_client = TestClient(app_module.create_app())
    # The data routes take an approved account's device token (ticket 098);
    # the legacy API_TOKENS bearer no longer works on them.
    token = approved_device_token(db_path)
    test_client.auth_headers = {"Authorization": f"Bearer {token}"}
    return test_client


def zone(id_, updated="2026-09-30T10:00:00.000Z", **extra):
    return {"id": id_, "name": f"Zone {id_}", "updatedAt": updated, **extra}


def push(client, changes, headers=None):
    headers = client.auth_headers if headers is None else headers
    return client.post("/sync/push", json={"changes": changes}, headers=headers)


def pull(client, headers=None, **params):
    headers = client.auth_headers if headers is None else headers
    return client.get("/sync/pull", params=params, headers=headers)


def test_round_trip(client):
    response = push(
        client,
        {"zones": [zone("z1")], "plants": [{"id": "p1", "name": "Rose", "updatedAt": "2026-09-30T10:00:00Z"}]},
    )
    assert response.status_code == 200
    assert response.json() == {"accepted": 2, "revision": 2}
    body = pull(client).json()
    assert body["more"] is False
    assert body["revision"] == 2
    assert body["changes"]["zones"] == [zone("z1")]
    # timestamps are normalised to milliseconds
    assert body["changes"]["plants"][0]["updatedAt"] == "2026-09-30T10:00:00.000Z"


def test_garden_plan_data_round_trips(client):
    polygon = "[[0,0],[400,0],[400,300],[0,300]]"
    stamp = "2026-10-01T10:00:00.000Z"
    plan = {"id": "main", "widthCm": 1500, "lengthCm": 2500, "updatedAt": stamp, "deletedAt": None}
    plant = {"id": "p1", "name": "Rose", "planX": 120, "planY": 80, "planSizeCm": 150, "updatedAt": stamp}
    response = push(
        client,
        {"garden_plan": [plan], "zones": [zone("z1", polygon=polygon)], "plants": [plant]},
    )
    assert response.status_code == 200
    assert response.json()["accepted"] == 3
    changes = pull(client).json()["changes"]
    assert changes["garden_plan"] == [plan]
    assert changes["zones"][0]["polygon"] == polygon
    assert changes["plants"][0]["planX"] == 120
    assert changes["plants"][0]["planY"] == 80
    assert changes["plants"][0]["planSizeCm"] == 150


def test_plan_features_round_trip(client):
    stamp = "2026-10-01T10:00:00.000Z"
    polygon = "[[0,0],[500,0],[500,400],[0,400]]"
    feature = {
        "id": "f1",
        "kind": "terrace",
        "label": "Terrasse sud",
        "polygon": polygon,
        "updatedAt": stamp,
        "deletedAt": None,
    }
    response = push(client, {"plan_features": [feature]})
    assert response.status_code == 200
    assert response.json()["accepted"] == 1
    assert pull(client).json()["changes"]["plan_features"] == [feature]
    deleted = {**feature, "updatedAt": "2026-10-01T11:00:00.000Z", "deletedAt": "2026-10-01T11:00:00.000Z"}
    assert push(client, {"plan_features": [deleted]}).json()["accepted"] == 1
    assert pull(client).json()["changes"]["plan_features"] == [deleted]


def test_pull_empty(client):
    assert pull(client).json() == {"changes": {}, "revision": 0, "more": False}
    assert pull(client, since=7).json()["revision"] == 7


def test_pagination(client):
    push(client, {"zones": [zone(f"z{i}") for i in range(5)]})
    first = pull(client, limit=2).json()
    assert [r["id"] for r in first["changes"]["zones"]] == ["z0", "z1"]
    assert first["more"] is True
    assert first["revision"] == 2
    second = pull(client, since=first["revision"], limit=2).json()
    assert [r["id"] for r in second["changes"]["zones"]] == ["z2", "z3"]
    assert second["more"] is True
    last = pull(client, since=second["revision"], limit=2).json()
    assert [r["id"] for r in last["changes"]["zones"]] == ["z4"]
    assert last["more"] is False
    assert last["revision"] == 5


def test_last_write_wins(client):
    push(client, {"zones": [zone("z1", "2026-09-30T10:00:00.000Z", name="v1")]})
    older = push(client, {"zones": [zone("z1", "2026-09-30T09:00:00.000Z", name="old")]}).json()
    assert older["accepted"] == 0
    equal = push(client, {"zones": [zone("z1", "2026-09-30T10:00:00.000Z", name="same")]}).json()
    assert equal["accepted"] == 0
    assert equal["revision"] == 1
    newer = push(client, {"zones": [zone("z1", "2026-09-30T11:00:00.000Z", name="v2")]}).json()
    assert newer["accepted"] == 1
    rows = pull(client).json()["changes"]["zones"]
    assert len(rows) == 1 and rows[0]["name"] == "v2"


def test_soft_deleted_row_is_pulled(client):
    push(client, {"zones": [zone("z1")]})
    push(client, {"zones": [zone("z1", "2026-09-30T12:00:00.000Z", deletedAt="2026-09-30T12:00:00Z")]})
    row = pull(client).json()["changes"]["zones"][0]
    assert row["deletedAt"] == "2026-09-30T12:00:00.000Z"


def test_revisions_strictly_increase(client):
    revisions = [
        push(client, {"zones": [zone("z1", f"2026-09-30T1{i}:00:00.000Z")]}).json()["revision"]
        for i in range(3)
    ]
    assert revisions == [1, 2, 3]


@pytest.mark.parametrize(
    "changes",
    [
        {"nope": [zone("z1")]},
        {"zones": [zone("z1", uri="file:///x")]},
        {"zones": [zone("z1", name=["a"])]},
        {"zones": [zone("z1", name={"a": 1})]},
        {"zones": [zone("z1", "yesterday")]},
        {"zones": [{"id": "z1", "name": "x"}]},
        {"zones": [zone("z1", deletedAt="garbage")]},
        {"zones": [{"name": "x", "updatedAt": "2026-09-30T10:00:00Z"}]},
        {"zones": [zone("")]},
        {"zones": ["not an object"]},
        {"zones": [zone("z1"), zone("z1", "2026-10-01T10:00:00Z")]},
        {"zones": [zone("z1")], "plants": "x"},
    ],
)
def test_invalid_push_is_rejected_and_stores_nothing(client, changes):
    response = push(client, changes)
    assert response.status_code == 400
    assert response.json()["detail"]
    assert pull(client).json()["changes"] == {}


def test_invalid_row_rejects_whole_push(client):
    response = push(client, {"zones": [zone("good"), zone("bad", uri="x")]})
    assert response.status_code == 400
    assert pull(client).json()["changes"] == {}


def test_too_many_rows(client):
    rows = [zone(f"z{i}") for i in range(1001)]
    assert push(client, {"zones": rows}).status_code == 413
    assert pull(client).json()["changes"] == {}


def test_bad_body_shape(client):
    assert client.post("/sync/push", json=[1], headers=client.auth_headers).status_code == 400
    assert client.post("/sync/push", json={"x": 1}, headers=client.auth_headers).status_code == 400


@pytest.mark.parametrize("params", [{"since": -1}, {"limit": 0}, {"limit": 1001}, {"since": "x"}])
def test_bad_pull_query(client, params):
    assert pull(client, **params).status_code == 422


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer " + "z" * 64}, {"Authorization": "Basic x"}])
def test_auth_required(client, headers):
    for response in (push(client, {"zones": [zone("z1")]}, headers=headers), pull(client, headers=headers)):
        assert response.status_code == 401
        assert response.headers["WWW-Authenticate"] == "Bearer"
    assert pull(client).json()["changes"] == {}


def test_store_persists_across_instances(db_path):
    first = SyncStore(db_path)
    first.push("acc", {"zones": [zone("z1")]})
    second = SyncStore(db_path)
    assert second.pull("acc", 0, 10)["changes"]["zones"][0]["id"] == "z1"
    assert second.push("acc", {"zones": [zone("z2")]})["revision"] == 2


def test_normalize_timestamp():
    from sync_validation import normalize_timestamp

    assert normalize_timestamp("2026-09-30T12:00:00+02:00") == "2026-09-30T10:00:00.000Z"
    assert normalize_timestamp("2026-09-30T10:00:00.123456Z") == "2026-09-30T10:00:00.123Z"
    assert normalize_timestamp("2026-09-30T10:00:00") == "2026-09-30T10:00:00.000Z"
    assert normalize_timestamp("nope") is None
    assert normalize_timestamp(5) is None
    assert normalize_timestamp("") is None


def test_care_log_measurement_round_trips(client):
    stamp = "2026-10-01T10:00:00.000Z"
    log = {
        "id": "c1",
        "plantId": "p1",
        "type": "measured",
        "date": "2026-09-12",
        "notes": None,
        "widthCm": 120,
        "heightCm": 90,
        "updatedAt": stamp,
        "deletedAt": None,
    }
    response = push(client, {"care_logs": [log]})
    assert response.status_code == 200
    assert response.json()["accepted"] == 1
    assert pull(client).json()["changes"]["care_logs"] == [log]
