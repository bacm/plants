"""Admin routes and command line (ticket 099)."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

import accounts
import app as app_module
from accounts import AccountStore
from conftest import PASSWORD
from test_accounts import NOW, ORIGIN, cookie_header, session_cookie

ADMIN_EMAIL = "boss@example.com"


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "data" / "garden.db"


@pytest.fixture
def store(db_path):
    return AccountStore(db_path)


@pytest.fixture
def client(monkeypatch, db_path, store):
    monkeypatch.setenv("SYNC_DB_PATH", str(db_path))
    monkeypatch.setenv("ALLOWED_ORIGINS", ORIGIN)
    return TestClient(app_module.create_app())


def make(store, email, status="approved", admin=False):
    if admin:
        store.create_admin(email, PASSWORD)
    else:
        store.create_pending(email, PASSWORD)
    account_id = store.find_id(email)
    if not admin and status != "pending":
        store.set_status(account_id, status)
    return account_id


def bearer(store, account_id):
    return {"Authorization": f"Bearer {store.issue_credential(account_id, 'device', 't')}"}


@pytest.fixture
def admin(store):
    account_id = make(store, ADMIN_EMAIL, admin=True)
    return account_id, bearer(store, account_id)


def test_unauthenticated_is_401_and_non_admin_is_403(client, store):
    user = make(store, "user@example.com")
    headers = bearer(store, user)
    routes = [("get", "/admin/accounts")] + [
        ("post", f"/admin/accounts/{user}/{action}")
        for action in ("approve", "refuse", "disable", "enable", "reset-password", "revoke-sessions")
    ]
    for method, path in routes:
        assert getattr(client, method)(path).status_code == 401
        response = getattr(client, method)(path, headers=headers)
        assert response.status_code == 403
        assert response.json()["detail"] == "Réservé à l'administrateur"


def test_list_sorts_pending_first_oldest_first(client, store, admin):
    late = make(store, "late@example.com", "pending")
    early = make(store, "early@example.com", "pending")
    import sqlite3

    with sqlite3.connect(store.path) as conn:
        conn.execute("UPDATE accounts SET created_at = '2026-01-02T00:00:00Z' WHERE id = ?", (late,))
        conn.execute("UPDATE accounts SET created_at = '2026-01-01T00:00:00Z' WHERE id = ?", (early,))
    make(store, "zed@example.com")
    body = client.get("/admin/accounts", headers=admin[1]).json()
    assert [a["email"] for a in body] == [
        "early@example.com",
        "late@example.com",
        ADMIN_EMAIL,
        "zed@example.com",
    ]
    assert set(body[0]) == {"id", "email", "status", "isAdmin", "createdAt", "decidedAt"}
    assert body[2]["isAdmin"] is True


def test_approve_and_refuse(client, store, admin):
    one = make(store, "one@example.com", "pending")
    two = make(store, "two@example.com", "pending")
    assert client.post(f"/admin/accounts/{one}/approve", headers=admin[1]).status_code == 200
    assert client.post(f"/admin/accounts/{two}/refuse", headers=admin[1]).status_code == 200
    statuses = {a["email"]: a for a in client.get("/admin/accounts", headers=admin[1]).json()}
    assert statuses["one@example.com"]["status"] == "approved"
    assert statuses["two@example.com"]["status"] == "refused"
    assert statuses["two@example.com"]["decidedAt"]
    assert store.verify_login("one@example.com", PASSWORD).outcome == "ok"


@pytest.mark.parametrize(
    "start,action,expected",
    [
        ("pending", "approve", 200),
        ("pending", "refuse", 200),
        ("pending", "disable", 409),
        ("pending", "enable", 409),
        ("approved", "approve", 409),
        ("approved", "refuse", 409),
        ("approved", "disable", 200),
        ("approved", "enable", 409),
        ("disabled", "approve", 409),
        ("disabled", "refuse", 409),
        ("disabled", "disable", 409),
        ("disabled", "enable", 200),
        ("refused", "approve", 200),
        ("refused", "refuse", 409),
        ("refused", "disable", 409),
        ("refused", "enable", 409),
    ],
)
def test_transition_table(client, store, admin, start, action, expected):
    target = make(store, "t@example.com", start)
    response = client.post(f"/admin/accounts/{target}/{action}", headers=admin[1])
    assert response.status_code == expected


def test_unknown_account_is_404(client, admin):
    assert client.post("/admin/accounts/nope/approve", headers=admin[1]).status_code == 404
    assert client.post("/admin/accounts/nope/reset-password", headers=admin[1]).status_code == 404
    assert client.post("/admin/accounts/nope/revoke-sessions", headers=admin[1]).status_code == 404


def test_admin_cannot_disable_or_refuse_themselves(client, store, admin):
    account_id, headers = admin
    for action in ("disable", "refuse"):
        assert client.post(f"/admin/accounts/{account_id}/{action}", headers=headers).status_code == 409
    assert client.get("/auth/me", headers=headers).status_code == 200


def test_another_admin_can_disable_an_admin(client, store, admin):
    other = make(store, "second@example.com", admin=True)
    response = client.post(f"/admin/accounts/{other}/disable", headers=admin[1])
    assert response.status_code == 200


def test_disable_revokes_credentials(client, store, admin):
    target = make(store, "t@example.com")
    headers = bearer(store, target)
    assert client.get("/auth/me", headers=headers).status_code == 200
    assert client.post(f"/admin/accounts/{target}/disable", headers=admin[1]).status_code == 200
    assert client.get("/auth/me", headers=headers).status_code == 401
    # Enabling again must not bring the old token back.
    assert client.post(f"/admin/accounts/{target}/enable", headers=admin[1]).status_code == 200
    assert client.get("/auth/me", headers=headers).status_code == 401


def test_refuse_revokes_credentials(client, store, admin):
    target = make(store, "t@example.com", "pending")
    # A token that already existed (e.g. from before the account went pending).
    token = store.issue_credential(target, "device", "t")
    store.set_status(target, "approved")
    store.set_status(target, "pending")
    assert client.post(f"/admin/accounts/{target}/refuse", headers=admin[1]).status_code == 200
    assert client.post(f"/admin/accounts/{target}/approve", headers=admin[1]).status_code == 200
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_revoke_sessions(client, store, admin):
    target = make(store, "t@example.com")
    headers = bearer(store, target)
    assert client.post(f"/admin/accounts/{target}/revoke-sessions", headers=admin[1]).status_code == 200
    assert client.get("/auth/me", headers=headers).status_code == 401
    assert store.verify_login("t@example.com", PASSWORD).outcome == "ok"


def test_reset_password(client, store, admin):
    target = make(store, "t@example.com")
    headers = bearer(store, target)
    response = client.post(f"/admin/accounts/{target}/reset-password", headers=admin[1])
    assert response.status_code == 200
    temporary = response.json()["temporaryPassword"]
    assert len(temporary) == 16
    assert client.get("/auth/me", headers=headers).status_code == 401
    assert store.verify_login("t@example.com", PASSWORD).outcome == "bad_credentials"
    assert store.verify_login("t@example.com", temporary).outcome == "ok"
    again = client.post(f"/admin/accounts/{target}/reset-password", headers=admin[1])
    assert again.json()["temporaryPassword"] != temporary


def test_reset_password_does_not_log_the_password(client, store, admin, caplog):
    target = make(store, "t@example.com")
    with caplog.at_level("INFO"):
        temporary = client.post(
            f"/admin/accounts/{target}/reset-password", headers=admin[1]
        ).json()["temporaryPassword"]
    assert temporary not in caplog.text


def test_cookie_admin_needs_a_trusted_origin(client, store):
    make(store, ADMIN_EMAIL, admin=True)
    login = client.post(
        "/auth/login",
        json={"email": ADMIN_EMAIL, "password": PASSWORD, "client": "web"},
        headers={"Origin": ORIGIN},
    )
    cookie = cookie_header(session_cookie(login))
    target = make(store, "t@example.com", "pending")
    path = f"/admin/accounts/{target}/approve"
    assert client.get("/admin/accounts", headers=cookie).status_code == 200
    assert client.post(path, headers=cookie).status_code == 403
    assert client.post(path, headers={**cookie, "Origin": "https://evil.example"}).status_code == 403
    assert client.post(path, headers={**cookie, "Origin": ORIGIN}).status_code == 200


def test_purge_refused_after_thirty_days(store):
    old = make(store, "old@example.com", "refused")
    recent = make(store, "recent@example.com", "refused")
    pending = make(store, "pending@example.com", "pending")
    store.issue_credential(old, "device")
    store.set_status(old, "refused", now=NOW - timedelta(days=31))
    store.set_status(recent, "refused", now=NOW - timedelta(days=29))
    assert store.purge_refused(now=NOW) == 1
    ids = {a["id"] for a in store.list_accounts()}
    assert old not in ids and {recent, pending} <= ids
    assert store.create_pending("old@example.com", PASSWORD) is True


def test_list_route_purges(client, store, admin):
    old = make(store, "old@example.com", "refused")
    store.set_status(old, "refused", now=accounts.utcnow() - timedelta(days=31))
    emails = [a["email"] for a in client.get("/admin/accounts", headers=admin[1]).json()]
    assert "old@example.com" not in emails


# Command line


def run(db_path, *argv):
    return accounts.main(list(argv), db_path=str(db_path))


def status_of(store, email):
    return next(a["status"] for a in store.list_accounts() if a["email"] == email)


def test_cli_approve_refuse_disable_enable(store, db_path):
    make(store, "t@example.com", "pending")
    assert run(db_path, "approve", "--email", "T@example.com") == 0
    assert status_of(store, "t@example.com") == "approved"
    assert run(db_path, "disable", "--email", "t@example.com") == 0
    assert status_of(store, "t@example.com") == "disabled"
    assert run(db_path, "enable", "--email", "t@example.com") == 0
    assert status_of(store, "t@example.com") == "approved"
    assert run(db_path, "refuse", "--email", "t@example.com") == 1
    assert status_of(store, "t@example.com") == "approved"


def test_cli_refuse(store, db_path):
    make(store, "t@example.com", "pending")
    assert run(db_path, "refuse", "--email", "t@example.com") == 0
    assert status_of(store, "t@example.com") == "refused"


def test_cli_unknown_email(db_path, capsys):
    assert run(db_path, "approve", "--email", "nobody@example.com") == 1
    assert "Aucun compte" in capsys.readouterr().err


def test_cli_reset_password_prints_a_working_password(store, db_path, capsys):
    make(store, "t@example.com")
    assert run(db_path, "reset-password", "--email", "t@example.com") == 0
    temporary = capsys.readouterr().out.strip()
    assert store.verify_login("t@example.com", temporary).outcome == "ok"


def test_cli_list_and_purge(store, db_path, capsys):
    make(store, "p@example.com", "pending")
    old = make(store, "old@example.com", "refused")
    store.set_status(old, "refused", now=accounts.utcnow() - timedelta(days=40))
    assert run(db_path, "list") == 0
    out = capsys.readouterr().out
    assert "p@example.com" in out and "pending" in out
    assert run(db_path, "purge") == 0
    assert "1 compte" in capsys.readouterr().out
    assert "old@example.com" not in [a["email"] for a in store.list_accounts()]
