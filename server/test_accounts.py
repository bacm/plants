import os
import sqlite3
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import accounts
import app as app_module
from accounts import AccountError, AccountStore
from conftest import PASSWORD, TEST_SCRYPT_N

LEGACY = {"Authorization": f"Bearer {os.environ['API_TOKENS'].split(',')[0].strip()}"}
ORIGIN = "https://garden.example.com"
EMAIL = "Gardener@Example.com"
NOW = datetime(2026, 9, 30, 12, 0, tzinfo=timezone.utc)


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


def signup(client, email=EMAIL, password=PASSWORD, website="", **kwargs):
    return client.post(
        "/auth/signup",
        json={"email": email, "password": password, "website": website},
        **kwargs,
    )


def login(client, email=EMAIL, password=PASSWORD, kind="web", deviceName=None, **kwargs):
    body = {"email": email, "password": password, "client": kind}
    if deviceName:
        body["deviceName"] = deviceName
    return client.post("/auth/login", json=body, **kwargs)


def approve(store, email=EMAIL, status="approved"):
    """Stands in for the admin screen (ticket 099): set the status directly."""
    with sqlite3.connect(store.path) as conn:
        conn.execute("UPDATE accounts SET status = ? WHERE email = ?", (status, email.lower()))


def approved_account(client, store, email=EMAIL):
    assert signup(client, email).status_code == 202
    approve(store, email)


def session_cookie(response):
    header = response.headers["set-cookie"]
    return header.split(";")[0].split("=", 1)[1]


def cookie_header(token):
    return {"Cookie": f"__Host-session={token}"}


def zone_push():
    return {"changes": {"zones": [{"id": "z1", "name": "Z", "updatedAt": "2026-09-30T10:00:00.000Z"}]}}


# Signup


def test_signup_creates_pending_and_repeat_answers_the_same(client, store):
    first = signup(client)
    second = signup(client, email="  gardener@example.com ")
    assert first.status_code == second.status_code == 202
    assert first.json() == second.json() == {"status": "pending"}
    assert store.count_pending() == 1


@pytest.mark.parametrize("email", ["nope", "a@b", "a@@b.co", "", "x" * 250 + "@a.co"])
def test_signup_bad_email_400(client, email):
    assert signup(client, email=email).status_code == 400


@pytest.mark.parametrize("password", ["short", "x" * 11, "x" * 257])
def test_signup_bad_password_400(client, store, password):
    response = signup(client, password=password)
    assert response.status_code == 400
    assert "caractères" in response.json()["detail"]
    assert store.count_pending() == 0


def test_honeypot_answers_202_and_stores_nothing(client, store, caplog):
    response = signup(client, website="http://spam.example")
    assert response.status_code == 202
    assert response.json() == {"status": "pending"}
    assert store.count_pending() == 0
    assert "honeypot" in caplog.text


def test_signup_per_ip_limit(client):
    for i in range(5):
        assert signup(client, email=f"user{i}@example.com").status_code == 202
    response = signup(client, email="user9@example.com")
    assert response.status_code == 429
    assert "Retry-After" in response.headers


def test_pending_cap_503(client, store, monkeypatch):
    monkeypatch.setattr(app_module, "PENDING_ACCOUNTS_CAP", 2)
    store.create_pending("a@example.com", PASSWORD)
    store.create_pending("b@example.com", PASSWORD)
    response = signup(client, email="c@example.com")
    assert response.status_code == 503
    assert response.json()["detail"] == "Inscriptions temporairement fermées"


def test_signup_bad_origin_403(client, store):
    assert signup(client, headers={"Origin": "https://evil.example"}).status_code == 403
    assert store.count_pending() == 0
    assert signup(client, headers={"Origin": ORIGIN}).status_code == 202


# Passwords


def test_password_is_hashed_with_a_salt(store):
    store.create_pending("a@example.com", PASSWORD)
    store.create_pending("b@example.com", PASSWORD)
    with sqlite3.connect(store.path) as conn:
        rows = conn.execute("SELECT password_hash, salt FROM accounts ORDER BY email").fetchall()
    (hash_a, salt_a), (hash_b, salt_b) = rows
    assert hash_a != hash_b and salt_a != salt_b
    for hashed, _salt in rows:
        assert len(hashed) == 32
        assert hashed != PASSWORD.encode()
        assert PASSWORD.encode() not in hashed


def test_production_scrypt_cost_is_the_default(db_path, monkeypatch):
    monkeypatch.delenv("SCRYPT_N")
    assert AccountStore(db_path).scrypt_n == 2**15
    assert AccountStore(db_path, scrypt_n=TEST_SCRYPT_N).scrypt_n == TEST_SCRYPT_N


def test_store_rejects_invalid_input(store):
    with pytest.raises(AccountError):
        store.create_pending("not-an-email", PASSWORD)
    with pytest.raises(AccountError):
        store.create_pending("a@example.com", "short")


# Login


@pytest.mark.parametrize(
    "status,detail",
    [
        ("pending", "Compte en attente d'approbation"),
        ("refused", "Compte refusé"),
        ("disabled", "Compte désactivé"),
    ],
)
def test_unapproved_login_403_only_with_the_right_password(client, store, status, detail):
    signup(client)
    approve(store, status=status)
    response = login(client)
    assert response.status_code == 403
    assert response.json() == {"detail": detail}
    assert "set-cookie" not in response.headers
    wrong = login(client, password="not the password!")
    assert wrong.status_code == 401
    assert wrong.json() == {"detail": "Identifiants invalides"}


def test_unknown_email_and_wrong_password_look_identical(client, store):
    approved_account(client, store)
    unknown = login(client, email="nobody@example.com")
    wrong = login(client, password="not the password!")
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json() == wrong.json() == {"detail": "Identifiants invalides"}
    assert unknown.headers.get("Retry-After") == wrong.headers.get("Retry-After")


def test_web_login_sets_a_hardened_cookie(client, store):
    approved_account(client, store)
    response = login(client)
    assert response.status_code == 200
    assert response.json() == {
        "account": {"id": response.json()["account"]["id"], "email": "gardener@example.com", "isAdmin": False}
    }
    assert "token" not in response.json()
    cookie = response.headers["set-cookie"]
    assert cookie.startswith("__Host-session=")
    for attribute in ("Secure", "HttpOnly", "Path=/", "SameSite=strict", "Max-Age=2592000"):
        assert attribute.lower() in cookie.lower()
    assert "domain" not in cookie.lower()
    assert PASSWORD not in response.text + cookie


def test_device_login_returns_a_token_and_no_cookie(client, store):
    approved_account(client, store)
    response = login(client, kind="device", deviceName="iPhone de Bruno")
    assert response.status_code == 200
    assert "set-cookie" not in response.headers
    token = response.json()["token"]
    assert len(token) >= 40
    with sqlite3.connect(store.path) as conn:
        stored = conn.execute("SELECT token_hash, label FROM credentials").fetchall()
    assert stored == [(accounts.hash_token(token), "iPhone de Bruno")]
    assert token not in stored[0][0]


def test_me_with_cookie_and_with_bearer(client, store):
    approved_account(client, store)
    session = session_cookie(login(client))
    device = login(client, kind="device").json()["token"]
    by_cookie = client.get("/auth/me", headers=cookie_header(session))
    by_bearer = client.get("/auth/me", headers={"Authorization": f"Bearer {device}"})
    assert by_cookie.status_code == by_bearer.status_code == 200
    assert by_cookie.json() == by_bearer.json()
    assert by_cookie.json()["email"] == "gardener@example.com"
    assert client.get("/auth/me").status_code == 401
    # A token of one kind is not accepted as the other.
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {session}"}).status_code == 401
    assert client.get("/auth/me", headers=cookie_header(device)).status_code == 401


def test_logout_revokes_the_credential(client, store):
    approved_account(client, store)
    session = session_cookie(login(client))
    headers = {**cookie_header(session), "Origin": ORIGIN}
    response = client.post("/auth/logout", headers=headers)
    assert response.status_code == 204
    cleared = response.headers["set-cookie"].lower()
    assert "max-age=0" in cleared and "__host-session=" in cleared
    assert client.get("/auth/me", headers=cookie_header(session)).status_code == 401
    assert client.post("/auth/logout", headers=headers).status_code == 401


def test_logout_needs_a_credential(client):
    assert client.post("/auth/logout").status_code == 401


def test_device_logout_revokes_the_device_token(client, store):
    approved_account(client, store)
    device = login(client, kind="device").json()["token"]
    headers = {"Authorization": f"Bearer {device}"}
    assert client.post("/auth/logout", headers=headers).status_code == 204
    assert client.get("/auth/me", headers=headers).status_code == 401


def test_revoked_and_expired_credentials_are_refused(client, store):
    approved_account(client, store)
    account_id = store.verify_login(EMAIL, PASSWORD).account["id"]
    long_ago = NOW - timedelta(days=31)
    expired = store.issue_credential(account_id, "session", "web", now=long_ago)
    revoked = store.issue_credential(account_id, "device", "phone")
    store.revoke_credential(accounts.hash_token(revoked))
    assert client.get("/auth/me", headers=cookie_header(expired)).status_code == 401
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {revoked}"}).status_code == 401
    assert store.resolve_token(expired, "session", now=long_ago + timedelta(days=29)) is not None


def test_device_token_does_not_expire(store):
    store.create_admin("a@example.com", PASSWORD)
    account_id = store.verify_login("a@example.com", PASSWORD).account["id"]
    token = store.issue_credential(account_id, "device", now=NOW - timedelta(days=900))
    assert store.resolve_token(token, "device", now=NOW) is not None


def test_a_credential_stops_working_when_the_account_is_disabled(client, store):
    approved_account(client, store)
    session = session_cookie(login(client))
    approve(store, status="disabled")
    assert client.get("/auth/me", headers=cookie_header(session)).status_code == 401


def test_last_used_is_updated_at_most_once_a_minute(store):
    store.create_admin("a@example.com", PASSWORD)
    account_id = store.verify_login("a@example.com", PASSWORD).account["id"]
    token = store.issue_credential(account_id, "device", now=NOW)

    def last_used():
        with sqlite3.connect(store.path) as conn:
            return conn.execute("SELECT last_used_at FROM credentials").fetchone()[0]

    store.resolve_token(token, "device", now=NOW + timedelta(seconds=30))
    assert last_used() == "2026-09-30T12:00:00Z"
    store.resolve_token(token, "device", now=NOW + timedelta(seconds=90))
    assert last_used() == "2026-09-30T12:01:30Z"


# Lockout


def test_account_locks_after_five_failures(client, store):
    approved_account(client, store)
    for _ in range(5):
        assert login(client, password="wrong password!!").status_code == 401
    locked = login(client, password="wrong password!!")
    assert locked.status_code == 429
    assert "Réessayez dans" in locked.json()["detail"]
    assert 0 < int(locked.headers["Retry-After"]) <= 60
    # Even the right password is refused while locked.
    assert login(client).status_code == 429


def attempt_sequence(client, email, count=7):
    """(status, detail, has Retry-After) of `count` wrong-password logins."""
    sequence = []
    for _ in range(count):
        response = login(client, email=email, password="wrong password!!")
        sequence.append(
            (response.status_code, response.json()["detail"], "Retry-After" in response.headers)
        )
    return sequence


def test_unknown_email_locks_like_a_known_one(client, store):
    approved_account(client, store)
    unknown = attempt_sequence(client, "nobody@example.com", 6)
    assert unknown[:5] == [(401, "Identifiants invalides", False)] * 5
    status, detail, has_retry = unknown[5]
    assert (status, has_retry) == (429, True)
    assert "Réessayez dans" in detail


def test_known_and_unknown_emails_give_identical_sequences(client, store, db_path, monkeypatch):
    approved_account(client, store)
    known = attempt_sequence(client, EMAIL)
    # A fresh app so the per-IP counter starts from zero for the second run.
    monkeypatch.setenv("SYNC_DB_PATH", str(db_path))
    other = TestClient(app_module.create_app())
    unknown = attempt_sequence(other, "nobody@example.com")
    assert known == unknown
    assert [entry[0] for entry in known] == [401] * 5 + [429] * 2


def test_throttle_table_holds_no_raw_email(client, store):
    login(client, email="nobody@example.com", password="wrong password!!")
    with sqlite3.connect(store.path) as conn:
        keys = [r[0] for r in conn.execute("SELECT email_key FROM login_throttle")]
        columns = [r[1] for r in conn.execute("PRAGMA table_info(accounts)")]
    assert keys == [accounts.hash_token("nobody@example.com")]
    assert "failed_logins" not in columns and "locked_until" not in columns


def test_malformed_email_creates_no_throttle_row(client, store):
    login(client, email="not-an-email", password="wrong password!!")
    with sqlite3.connect(store.path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM login_throttle").fetchone()[0] == 0


def test_lockout_grows_and_success_resets(store):
    store.create_admin("a@example.com", PASSWORD)
    t = NOW
    for _ in range(4):
        assert store.verify_login("a@example.com", "wrong password!!", t).outcome == "bad_credentials"
    store.verify_login("a@example.com", "wrong password!!", t)
    locked = store.verify_login("a@example.com", PASSWORD, t + timedelta(seconds=10))
    assert locked.outcome == "locked"
    assert locked.until == t + timedelta(seconds=60)

    t += timedelta(seconds=61)
    store.verify_login("a@example.com", "wrong password!!", t)
    assert store.verify_login("a@example.com", PASSWORD, t).until == t + timedelta(seconds=120)

    t += timedelta(seconds=121)
    assert store.verify_login("a@example.com", PASSWORD, t).outcome == "ok"
    # Reset: a fresh run of four failures does not lock.
    for _ in range(4):
        store.verify_login("a@example.com", "wrong password!!", t)
    assert store.verify_login("a@example.com", PASSWORD, t).outcome == "ok"


def test_lockout_is_capped_at_one_hour(store):
    store.create_admin("a@example.com", PASSWORD)
    t = NOW
    for _ in range(20):
        t += timedelta(hours=2)
        store.verify_login("a@example.com", "wrong password!!", t)
    assert store.verify_login("a@example.com", PASSWORD, t).until == t + timedelta(hours=1)


def test_per_ip_login_limit(client):
    for i in range(20):
        assert login(client, email=f"nobody{i}@example.com").status_code == 401
    blocked = login(client, email="nobody99@example.com")
    assert blocked.status_code == 429
    assert "Réessayez dans" in blocked.json()["detail"]
    assert "Retry-After" in blocked.headers


def test_successful_logins_do_not_count_against_the_ip(client, store):
    approved_account(client, store)
    for _ in range(25):
        assert login(client).status_code == 200


def test_login_bad_origin_403(client, store):
    approved_account(client, store)
    assert login(client, headers={"Origin": "https://evil.example"}).status_code == 403
    assert login(client, headers={"Origin": ORIGIN}).status_code == 200
    assert login(client, kind="device").status_code == 200


def test_rejections_are_logged_without_secrets(client, store, caplog):
    approved_account(client, store)
    login(client, password="a very secret wrong password")
    login(client, email="nobody@example.com")
    assert "bad credentials" in caplog.text
    assert "a very secret wrong password" not in caplog.text
    assert "nobody@example.com" not in caplog.text
    assert "testclient" in caplog.text


# CSRF and the data routes


def test_cookie_post_needs_an_allowed_origin(client, store):
    approved_account(client, store)
    cookie = cookie_header(session_cookie(login(client)))
    assert client.post("/sync/push", json=zone_push(), headers=cookie).status_code == 403
    bad = client.post("/sync/push", json=zone_push(), headers={**cookie, "Origin": "https://evil.example"})
    assert bad.status_code == 403
    assert bad.json() == {"detail": "Origine refusée"}
    good = client.post("/sync/push", json=zone_push(), headers={**cookie, "Origin": ORIGIN})
    assert good.status_code == 200
    # Reads are not state-changing: no Origin needed.
    assert client.get("/sync/pull", headers=cookie).status_code == 200


def test_bearer_without_origin_is_fine(client, store):
    approved_account(client, store)
    token = login(client, kind="device").json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.post("/sync/push", json=zone_push(), headers=headers).status_code == 200
    assert client.get("/sync/pull", headers=headers).json()["changes"]["zones"][0]["id"] == "z1"


def test_an_account_token_works_on_photos(client, store):
    approved_account(client, store)
    token = login(client, kind="device").json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    client.post("/sync/push", json={"changes": {"photos": [{"id": "ph1", "updatedAt": "2026-09-30T10:00:00.000Z"}]}}, headers=headers)
    jpeg = b"\xff\xd8\xff\xe0" + b"j" * 50
    put = client.put("/photos/ph1", content=jpeg, headers={**headers, "Content-Type": "image/jpeg"})
    assert put.status_code == 201
    assert client.get("/photos/ph1", headers=headers).content == jpeg


def test_legacy_api_token_only_works_on_search(client, monkeypatch):
    assert client.get("/sync/pull", headers=LEGACY).status_code == 401
    assert client.post("/sync/push", json=zone_push(), headers=LEGACY).status_code == 401
    assert client.get("/photos/ph1", headers=LEGACY).status_code == 401
    assert client.put("/photos/ph1", content=b"x", headers=LEGACY).status_code == 401

    async def fake_openai(prompt, precise=False):
        return "[]"

    monkeypatch.setattr(app_module, "call_openai", fake_openai)
    assert client.post("/search", json={"query": "rose"}, headers=LEGACY).status_code == 200
    assert client.post("/search", json={"query": "rose"}).status_code == 401


def test_search_accepts_an_account_credential(client, store, monkeypatch):
    async def fake_openai(prompt, precise=False):
        return "[]"

    monkeypatch.setattr(app_module, "call_openai", fake_openai)
    approved_account(client, store)
    token = login(client, kind="device").json()["token"]
    ok = client.post("/search", json={"query": "rose"}, headers={"Authorization": f"Bearer {token}"})
    assert ok.status_code == 200
    cookie = cookie_header(session_cookie(login(client)))
    assert client.post("/search", json={"query": "rose"}, headers=cookie).status_code == 403
    assert client.post("/search", json={"query": "rose"}, headers={**cookie, "Origin": ORIGIN}).status_code == 200


def test_cors_allows_credentials_for_listed_origins_only(client):
    ok = client.options(
        "/auth/login",
        headers={"Origin": ORIGIN, "Access-Control-Request-Method": "POST"},
    )
    assert ok.headers["access-control-allow-origin"] == ORIGIN
    assert ok.headers["access-control-allow-credentials"] == "true"
    bad = client.options(
        "/auth/login",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in bad.headers


# create-admin


def test_create_admin_via_the_store(store):
    store.create_admin("Boss@Example.com", PASSWORD)
    result = store.verify_login("boss@example.com", PASSWORD)
    assert result.outcome == "ok"
    assert result.account["isAdmin"] is True
    with pytest.raises(AccountError, match="existe déjà"):
        store.create_admin("boss@example.com", PASSWORD)


def test_create_admin_command(db_path, monkeypatch, capsys):
    answers = iter([PASSWORD, PASSWORD])
    monkeypatch.setattr(accounts.getpass, "getpass", lambda prompt="": next(answers))
    assert accounts.main(["create-admin", "--email", "boss@example.com"], db_path=str(db_path)) == 0
    assert AccountStore(db_path).verify_login("boss@example.com", PASSWORD).outcome == "ok"
    assert "boss@example.com" in capsys.readouterr().out

    answers = iter([PASSWORD, PASSWORD])
    assert accounts.main(["create-admin", "--email", "boss@example.com"], db_path=str(db_path)) == 1
    assert "existe déjà" in capsys.readouterr().err


def test_create_admin_command_checks_the_password(db_path, monkeypatch, capsys):
    answers = iter([PASSWORD, "something else entirely"])
    monkeypatch.setattr(accounts.getpass, "getpass", lambda prompt="": next(answers))
    assert accounts.main(["create-admin", "--email", "boss@example.com"], db_path=str(db_path)) == 1
    assert "différents" in capsys.readouterr().err

    monkeypatch.setattr(accounts.getpass, "getpass", lambda prompt="": "short")
    assert accounts.main(["create-admin", "--email", "boss@example.com"], db_path=str(db_path)) == 1
    assert "caractères" in capsys.readouterr().err


def test_create_admin_command_uses_sync_db_path(db_path, monkeypatch):
    monkeypatch.setenv("SYNC_DB_PATH", str(db_path))
    monkeypatch.setattr(accounts.getpass, "getpass", lambda prompt="": PASSWORD)
    assert accounts.main(["create-admin", "--email", "boss@example.com"]) == 0
    assert AccountStore(db_path).verify_login("boss@example.com", PASSWORD).outcome == "ok"
