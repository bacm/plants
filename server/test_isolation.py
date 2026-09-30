"""One account must never reach another's garden (ticket 100), route by route."""

import logging
import os
import sqlite3

os.environ.setdefault("OPENAI_API_KEY", "test-key-not-real")
LEGACY_TOKEN = "a" * 64
os.environ.setdefault("API_TOKENS", LEGACY_TOKEN)

import pytest
from fastapi.testclient import TestClient

import app as app_module
from conftest import approved_account
from photo_files import PhotoFiles
from sync_store import SyncStore

JPEG_A = b"\xff\xd8\xff\xe0" + b"A" * 50
JPEG_B = b"\xff\xd8\xff\xe0" + b"B" * 70
OLD = "2026-09-30T09:00:00.000Z"
MID = "2026-09-30T10:00:00.000Z"
NEW = "2026-09-30T11:00:00.000Z"


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "sub" / "garden.db"


@pytest.fixture
def photos_root(db_path):
    return db_path.parent / "photos"


@pytest.fixture
def client(monkeypatch, db_path):
    monkeypatch.setenv("SYNC_DB_PATH", str(db_path))
    return TestClient(app_module.create_app())


@pytest.fixture
def accounts(db_path):
    a_id, a_token = approved_account(db_path, "a@example.com")
    b_id, b_token = approved_account(db_path, "b@example.com")
    return {
        "a": {"id": a_id, "headers": {"Authorization": f"Bearer {a_token}"}},
        "b": {"id": b_id, "headers": {"Authorization": f"Bearer {b_token}"}},
    }


def row(id_, updated=MID, **extra):
    return {"id": id_, "name": f"Zone {id_}", "updatedAt": updated, **extra}


def push(client, who, changes):
    return client.post("/sync/push", json={"changes": changes}, headers=who["headers"])


def pull(client, who, **params):
    return client.get("/sync/pull", params=params, headers=who["headers"]).json()


def put_photo(client, who, id_, body):
    return client.put(
        f"/photos/{id_}", content=body, headers={**who["headers"], "Content-Type": "image/jpeg"}
    )


def get_photo(client, who, id_):
    return client.get(f"/photos/{id_}", headers=who["headers"])


# --- sync routes -------------------------------------------------------------


def test_pull_never_returns_another_accounts_rows(client, accounts):
    a, b = accounts["a"], accounts["b"]
    push(client, a, {"zones": [row("z1")]})
    assert pull(client, b) == {"changes": {}, "revision": 0, "more": False}
    assert pull(client, a)["changes"]["zones"][0]["id"] == "z1"


def test_same_id_pushed_by_two_accounts_is_two_rows(client, accounts):
    a, b = accounts["a"], accounts["b"]
    push(client, a, {"zones": [row("z1", name="mine")]})
    push(client, b, {"zones": [row("z1", name="theirs")]})
    assert pull(client, a)["changes"]["zones"][0]["name"] == "mine"
    assert pull(client, b)["changes"]["zones"][0]["name"] == "theirs"


@pytest.mark.parametrize("updated", [OLD, NEW])
def test_other_accounts_push_never_changes_my_row(client, accounts, updated):
    a, b = accounts["a"], accounts["b"]
    push(client, a, {"zones": [row("z1", MID, name="mine")]})
    # An older timestamp would lose against A's row, a newer one would win: in
    # both cases B's push must be accepted as B's own row and leave A's alone.
    assert push(client, b, {"zones": [row("z1", updated, name="theirs")]}).json()["accepted"] == 1
    assert pull(client, a)["changes"]["zones"] == [row("z1", MID, name="mine")]


def test_other_account_cannot_delete_my_row(client, accounts):
    a, b = accounts["a"], accounts["b"]
    push(client, a, {"zones": [row("z1")]})
    push(client, b, {"zones": [row("z1", NEW, deletedAt=NEW)]})
    mine = pull(client, a)["changes"]["zones"]
    assert len(mine) == 1 and "deletedAt" not in mine[0]
    assert pull(client, b)["changes"]["zones"][0]["deletedAt"] == NEW


def test_revisions_increase_per_account_and_paginate(client, accounts):
    a, b = accounts["a"], accounts["b"]
    for i in range(3):
        push(client, a, {"zones": [row(f"a{i}")]})
        push(client, b, {"zones": [row(f"b{i}")]})
    for who, prefix in ((a, "a"), (b, "b")):
        seen = []
        since = 0
        while True:
            page = pull(client, who, since=since, limit=2)
            assert page["revision"] >= since
            ids = [r["id"] for r in page["changes"].get("zones", [])]
            seen += ids
            since = page["revision"]
            if not page["more"]:
                break
        assert seen == [f"{prefix}{i}" for i in range(3)]
    revisions = [
        push(client, a, {"zones": [row("a9", f"2026-10-0{i}T10:00:00.000Z")]}).json()["revision"]
        for i in range(1, 4)
    ]
    assert revisions == sorted(set(revisions))


def test_push_response_does_not_leak_other_accounts_activity(client, accounts):
    a, b = accounts["a"], accounts["b"]
    push(client, a, {"zones": [row("z1"), row("z2")]})
    assert push(client, b, {"zones": [row("z1")]}).json()["accepted"] == 1
    assert pull(client, b)["revision"] == push(client, b, {"zones": []}).json()["revision"]


# --- photo routes ------------------------------------------------------------


def photo_row(id_, updated=MID, **extra):
    return {"id": id_, "updatedAt": updated, **extra}


def test_photo_routes_only_find_the_callers_row_and_file(client, accounts, photos_root):
    a, b = accounts["a"], accounts["b"]
    push(client, a, {"photos": [photo_row("ph1")]})
    assert put_photo(client, a, "ph1", JPEG_A).status_code == 201

    # B has no row with that id: neither route finds A's photo.
    assert put_photo(client, b, "ph1", JPEG_B).status_code == 404
    assert get_photo(client, b, "ph1").status_code == 404

    push(client, b, {"photos": [photo_row("ph1")]})
    assert get_photo(client, b, "ph1").status_code == 404
    assert put_photo(client, b, "ph1", JPEG_B).status_code == 201

    assert get_photo(client, a, "ph1").content == JPEG_A
    assert get_photo(client, b, "ph1").content == JPEG_B
    assert (photos_root / a["id"] / "ph1.jpg").read_bytes() == JPEG_A
    assert (photos_root / b["id"] / "ph1.jpg").read_bytes() == JPEG_B


def test_deleted_photo_row_removes_only_the_callers_file(client, accounts, photos_root):
    a, b = accounts["a"], accounts["b"]
    for who, body in ((a, JPEG_A), (b, JPEG_B)):
        push(client, who, {"photos": [photo_row("ph1")]})
        put_photo(client, who, "ph1", body)
    push(client, b, {"photos": [photo_row("ph1", NEW, deletedAt=NEW)]})
    assert not (photos_root / b["id"] / "ph1.jpg").exists()
    assert (photos_root / a["id"] / "ph1.jpg").read_bytes() == JPEG_A
    assert get_photo(client, a, "ph1").content == JPEG_A


def test_other_accounts_deleted_row_does_not_make_mine_gone(client, accounts):
    a, b = accounts["a"], accounts["b"]
    push(client, a, {"photos": [photo_row("ph1")]})
    push(client, b, {"photos": [photo_row("ph1", NEW, deletedAt=NEW)]})
    assert put_photo(client, a, "ph1", JPEG_A).status_code == 201


# --- quota -------------------------------------------------------------------


def test_quota_refuses_with_507_and_writes_nothing(monkeypatch, db_path, photos_root):
    monkeypatch.setenv("PHOTO_QUOTA_BYTES", str(len(JPEG_A) + 10))
    monkeypatch.setenv("SYNC_DB_PATH", str(db_path))
    client = TestClient(app_module.create_app())
    a_id, token = approved_account(db_path)
    a = {"id": a_id, "headers": {"Authorization": f"Bearer {token}"}}
    push(client, a, {"photos": [photo_row("ph1"), photo_row("ph2")]})

    assert put_photo(client, a, "ph1", JPEG_A).status_code == 201
    full = put_photo(client, a, "ph2", JPEG_A)
    assert full.status_code == 507
    assert full.json() == {"detail": "Espace photo plein (quota atteint)."}
    assert sorted(os.listdir(photos_root / a_id)) == ["ph1.jpg"]
    # A finished upload retried is still "already stored", never "full".
    assert put_photo(client, a, "ph1", JPEG_A).status_code == 200


def test_quota_is_per_account(monkeypatch, db_path):
    monkeypatch.setenv("PHOTO_QUOTA_BYTES", str(len(JPEG_A)))
    monkeypatch.setenv("SYNC_DB_PATH", str(db_path))
    client = TestClient(app_module.create_app())
    a_id, a_token = approved_account(db_path, "a@example.com")
    b_id, b_token = approved_account(db_path, "b@example.com")
    a = {"id": a_id, "headers": {"Authorization": f"Bearer {a_token}"}}
    b = {"id": b_id, "headers": {"Authorization": f"Bearer {b_token}"}}
    for who in (a, b):
        push(client, who, {"photos": [photo_row("ph1")]})
        assert put_photo(client, who, "ph1", JPEG_A).status_code == 201


@pytest.mark.parametrize("value", ["abc", "0", "-1"])
def test_invalid_photo_quota_fails_fast(monkeypatch, value):
    monkeypatch.setenv("PHOTO_QUOTA_BYTES", value)
    with pytest.raises(RuntimeError):
        app_module.create_app()


@pytest.mark.parametrize("value", ["abc", "0", "-1"])
def test_invalid_account_search_budget_fails_fast(monkeypatch, value):
    monkeypatch.setenv("SEARCH_DAILY_BUDGET_PER_ACCOUNT", value)
    with pytest.raises(RuntimeError):
        app_module.create_app()


def test_flat_legacy_photo_files_only_warn(monkeypatch, db_path, photos_root, caplog):
    photos_root.mkdir(parents=True)
    (photos_root / "old.jpg").write_bytes(JPEG_A)
    monkeypatch.setenv("SYNC_DB_PATH", str(db_path))
    with caplog.at_level(logging.WARNING, logger="plant_search"):
        TestClient(app_module.create_app())
    assert any("flat photo files" in r.getMessage() for r in caplog.records)


# --- search budget -----------------------------------------------------------


@pytest.fixture
def search_client(monkeypatch, db_path):
    monkeypatch.setenv("SEARCH_DAILY_BUDGET_PER_ACCOUNT", "2")
    monkeypatch.setenv("SYNC_DB_PATH", str(db_path))
    calls = []

    async def fake_call_openai(prompt, reasoning_effort="high"):
        calls.append(prompt)
        return "[]"

    monkeypatch.setattr(app_module, "call_openai", fake_call_openai)
    test_client = TestClient(app_module.create_app())
    test_client.calls = calls
    return test_client


def search(client, headers):
    return client.post("/search", json={"query": "rose"}, headers=headers)


def test_account_budget_exhausts_for_one_account_only(search_client, accounts):
    a, b = accounts["a"]["headers"], accounts["b"]["headers"]
    assert search(search_client, a).status_code == 200
    assert search(search_client, a).status_code == 200
    refused = search(search_client, a)
    assert refused.status_code == 429
    assert refused.json() == {"detail": "Limite quotidienne de recherches atteinte pour ce compte."}
    assert search(search_client, b).status_code == 200
    assert len(search_client.calls) == 3


def test_legacy_token_has_its_own_budget(search_client, accounts):
    legacy = {"Authorization": f"Bearer {LEGACY_TOKEN}"}
    a = accounts["a"]["headers"]
    assert search(search_client, legacy).status_code == 200
    assert search(search_client, legacy).status_code == 200
    assert search(search_client, legacy).status_code == 429
    assert search(search_client, a).status_code == 200


def test_refused_account_request_does_not_spend_the_global_budget(search_client, accounts):
    a = accounts["a"]["headers"]
    search_client.app.state.budget = app_module.DailyBudget(3)
    for _ in range(2):
        assert search(search_client, a).status_code == 200
    assert search(search_client, a).status_code == 429
    assert search(search_client, a).status_code == 429
    # Only 2 of the global 3 calls were spent, so another account still passes.
    assert search(search_client, accounts["b"]["headers"]).status_code == 200
    assert search(search_client, accounts["b"]["headers"]).status_code == 503


def test_account_budget_warns_once(search_client, accounts, caplog):
    a = accounts["a"]["headers"]
    with caplog.at_level(logging.WARNING, logger="plant_search"):
        for _ in range(5):
            search(search_client, a)
    warnings = [r for r in caplog.records if "reached for" in r.getMessage()]
    assert len(warnings) == 1


# --- legacy table and path guards ---------------------------------------------


def make_legacy_rows(db_path, with_row):
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute(
        "CREATE TABLE rows (tbl TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, "
        "updated_at TEXT NOT NULL, deleted_at TEXT, revision INTEGER NOT NULL, PRIMARY KEY (tbl, id))"
    )
    if with_row:
        conn.execute("INSERT INTO rows VALUES ('zones', 'z1', '{}', 'x', NULL, 1)")
    conn.commit()
    conn.close()


def table_names(db_path):
    conn = sqlite3.connect(db_path)
    try:
        return {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    finally:
        conn.close()


def test_empty_legacy_rows_table_is_dropped(db_path):
    make_legacy_rows(db_path, with_row=False)
    SyncStore(db_path)
    names = table_names(db_path)
    assert "rows" not in names
    assert "garden_rows" in names


def test_non_empty_legacy_rows_table_refuses_to_start(db_path):
    make_legacy_rows(db_path, with_row=True)
    with pytest.raises(RuntimeError, match="legacy `rows` table"):
        SyncStore(db_path)
    assert "rows" in table_names(db_path)


@pytest.mark.parametrize("bad", ["../x", "", "x" * 36, "A" * 36, "0" * 35, None, 5])
def test_invalid_account_id_is_refused_without_touching_the_filesystem(tmp_path, bad):
    root = tmp_path / "photos"
    files = PhotoFiles(root)
    for call in (
        lambda: files.save(bad, "p1", b"d", "jpg"),
        lambda: files.path_for(bad, "p1"),
        lambda: files.delete(bad, "p1"),
        lambda: files.usage_bytes(bad),
    ):
        with pytest.raises(ValueError):
            call()
    assert list(tmp_path.rglob("*")) == []


# --- sync stats ---------------------------------------------------------------


def stats(client, who):
    return client.get("/sync/stats", headers=who["headers"])


def test_stats_count_live_rows_and_files_per_account(client, accounts):
    a, b = accounts["a"], accounts["b"]
    assert stats(client, a).json()["photoFiles"] == 0
    assert stats(client, a).json()["rows"]["zones"] == 0
    push(client, a, {"zones": [row("z1"), row("z2"), row("z3")], "photos": [photo_row("ph1")]})
    push(client, a, {"zones": [row("z3", NEW, deletedAt=NEW)]})
    assert put_photo(client, a, "ph1", JPEG_A).status_code == 201
    push(client, b, {"zones": [row("z9")], "photos": [photo_row("ph1"), photo_row("ph2")]})
    put_photo(client, b, "ph2", JPEG_B)

    a_stats = stats(client, a).json()
    assert a_stats["rows"]["zones"] == 2
    assert a_stats["rows"]["photos"] == 1
    assert a_stats["rows"]["plants"] == 0
    assert a_stats["photoFiles"] == 1
    b_stats = stats(client, b).json()
    assert b_stats["rows"]["zones"] == 1
    assert b_stats["rows"]["photos"] == 2
    assert b_stats["photoFiles"] == 1


def test_stats_require_an_account(client):
    assert client.get("/sync/stats").status_code == 401
