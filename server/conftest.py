import os

os.environ.setdefault("OPENAI_API_KEY", "test-key-not-real")
os.environ.setdefault("API_TOKENS", "a" * 64)

import pytest

from accounts import AccountStore

# scrypt at its production cost (n=2**15) takes about 100 ms per hash, which
# would make the account tests slow. Tests only.
TEST_SCRYPT_N = 2**10
PASSWORD = "correct horse battery"


@pytest.fixture(autouse=True)
def _test_environment(monkeypatch, tmp_path):
    monkeypatch.setenv("SCRYPT_N", str(TEST_SCRYPT_N))
    # Tests that do not choose a database get a throwaway one, never data/.
    if not os.environ.get("SYNC_DB_PATH"):
        monkeypatch.setenv("SYNC_DB_PATH", str(tmp_path / "default" / "garden.db"))


def approved_device_token(db_path, email="gardener@example.com"):
    """An approved account on `db_path` and one of its device tokens."""
    store = AccountStore(db_path)
    store.create_admin(email, PASSWORD)
    account = store.verify_login(email, PASSWORD).account
    return store.issue_credential(account["id"], "device", "test")
