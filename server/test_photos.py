import os

os.environ.setdefault("OPENAI_API_KEY", "test-key-not-real")
TOKEN = "a" * 64
os.environ.setdefault("API_TOKENS", TOKEN)

import pytest
from fastapi.testclient import TestClient

import app as app_module
from photo_files import MAX_PHOTO_BYTES, PhotoFiles, detect_extension, valid_photo_id

AUTH = {"Authorization": f"Bearer {os.environ['API_TOKENS'].split(',')[0].strip()}"}

JPEG = b"\xff\xd8\xff\xe0" + b"j" * 50
PNG = b"\x89PNG\r\n\x1a\n" + b"p" * 50
WEBP = b"RIFF\x10\x00\x00\x00WEBPVP8 " + b"w" * 20
HEIC = b"\x00\x00\x00\x18ftypheic" + b"h" * 20


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "sub" / "garden.db"


@pytest.fixture
def photos_dir(db_path):
    return db_path.parent / "photos"


@pytest.fixture
def client(monkeypatch, db_path):
    monkeypatch.setenv("SYNC_DB_PATH", str(db_path))
    return TestClient(app_module.create_app())


def push_photo(client, id_="ph1", table="photos", **extra):
    row = {"id": id_, "updatedAt": "2026-09-30T10:00:00.000Z", **extra}
    return client.post("/sync/push", json={"changes": {table: [row]}}, headers=AUTH)


def put(client, id_, body, content_type="image/jpeg", headers=AUTH):
    return client.put(
        f"/photos/{id_}", content=body, headers={**headers, "Content-Type": content_type}
    )


def test_detect_extension():
    assert detect_extension(JPEG) == "jpg"
    assert detect_extension(PNG) == "png"
    assert detect_extension(WEBP) == "webp"
    assert detect_extension(HEIC) == "heic"
    assert detect_extension(b"\x00\x00\x00\x18ftypmp42") is None
    assert detect_extension(b"RIFF\x00\x00\x00\x00WAVE") is None
    assert detect_extension(b"GIF89a") is None
    assert detect_extension(b"") is None


def test_valid_photo_id():
    assert valid_photo_id("abc-123")
    assert valid_photo_id("a" * 64)
    assert not valid_photo_id("a" * 65)
    assert not valid_photo_id("")
    assert not valid_photo_id("a.b")
    assert not valid_photo_id("../x")
    assert not valid_photo_id("a/b")


def test_photo_files(tmp_path):
    files = PhotoFiles(tmp_path / "photos")
    assert files.path_for("p1") is None
    files.save("p1", b"data", "png")
    assert files.path_for("p1").endswith("p1.png")
    assert sorted(os.listdir(tmp_path / "photos")) == ["p1.png"]
    files.delete("p1")
    assert files.path_for("p1") is None
    files.delete("p1")
    with pytest.raises(ValueError):
        files.save("../x", b"d", "png")
    with pytest.raises(ValueError):
        files.save("p2", b"d", "exe")


@pytest.mark.parametrize(
    "body,content_type,media",
    [(JPEG, "image/jpeg", "image/jpeg"), (PNG, "image/png", "image/png")],
)
def test_round_trip(client, body, content_type, media):
    push_photo(client)
    response = put(client, "ph1", body, content_type)
    assert response.status_code == 201
    assert response.json() == {"stored": True}
    got = client.get("/photos/ph1", headers=AUTH)
    assert got.status_code == 200
    assert got.content == body
    assert got.headers["content-type"] == media
    assert got.headers["cache-control"] == "private, max-age=31536000, immutable"


def test_unsorted_photo_row_accepted(client):
    push_photo(client, "u1", table="unsorted_photos")
    assert put(client, "u1", PNG, "image/png").status_code == 201


def test_second_put_is_noop(client, photos_dir):
    push_photo(client)
    put(client, "ph1", JPEG)
    second = put(client, "ph1", JPEG + b"different")
    assert second.status_code == 200
    assert second.json() == {"stored": False}
    assert (photos_dir / "ph1.jpg").read_bytes() == JPEG


def test_unknown_row_404(client):
    assert put(client, "nope", JPEG).status_code == 404


def test_deleted_row_410(client):
    push_photo(client, deletedAt="2026-09-30T11:00:00.000Z")
    assert put(client, "ph1", JPEG).status_code == 410


@pytest.mark.parametrize("bad", ["..%2Fetc", "a" * 65, "a.b", "%2e%2e"])
def test_bad_id_never_writes_outside(client, tmp_path, bad):
    assert put(client, bad, JPEG).status_code in (400, 404)
    assert client.get(f"/photos/{bad}", headers=AUTH).status_code in (400, 404)
    assert [p for p in tmp_path.rglob("*") if p.suffix in (".jpg", ".png")] == []


def test_too_large_413(client, photos_dir):
    push_photo(client)
    assert put(client, "ph1", JPEG + b"x" * MAX_PHOTO_BYTES).status_code == 413
    assert not photos_dir.exists() or os.listdir(photos_dir) == []


def test_empty_body_400(client):
    push_photo(client)
    assert put(client, "ph1", b"").status_code == 400


def test_unknown_bytes_415(client):
    push_photo(client)
    assert put(client, "ph1", b"GIF89a-not-supported").status_code == 415


def test_content_type_mismatch_415(client):
    push_photo(client)
    assert put(client, "ph1", JPEG, "image/png").status_code == 415
    assert put(client, "ph1", JPEG, "text/plain").status_code == 415


def test_auth_required(client):
    push_photo(client)
    put(client, "ph1", JPEG)
    for headers in ({}, {"Authorization": "Bearer " + "b" * 64}):
        assert put(client, "ph1", JPEG, headers=headers).status_code == 401
        assert client.get("/photos/ph1", headers=headers).status_code == 401


def test_get_missing_404(client):
    assert client.get("/photos/ph1", headers=AUTH).status_code == 404


def test_push_deleted_row_removes_file(client, photos_dir):
    push_photo(client)
    put(client, "ph1", JPEG)
    assert (photos_dir / "ph1.jpg").exists()
    response = push_photo(client, updatedAt="2026-09-30T12:00:00.000Z", deletedAt="2026-09-30T12:00:00.000Z")
    assert response.json() == {"accepted": 1, "revision": 2}
    assert not (photos_dir / "ph1.jpg").exists()
    assert client.get("/photos/ph1", headers=AUTH).status_code == 404


def test_push_response_keys_unchanged(client):
    response = push_photo(client)
    assert set(response.json()) == {"accepted", "revision"}
