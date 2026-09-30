# Plant search server

Small FastAPI server that holds the OpenAI API key. The app used to read the
key from `EXPO_PUBLIC_OPENAI_API_KEY`, but Metro inlines every
`EXPO_PUBLIC_*` variable into the shipped bundle, so the key was extractable
from the app binary. The key must never live in the app; it lives only here,
in this server's environment.

The server is not a generic OpenAI relay: it builds the prompt itself from a
short query and returns parsed plant data, so a client can never send an
arbitrary prompt through it.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

## Run

```bash
OPENAI_API_KEY=sk-... API_TOKENS=$(openssl rand -hex 32) uvicorn app:app --host 0.0.0.0 --port 8000
```

Every call to `/search` must then send `Authorization: Bearer <token>` with
one of the tokens in `API_TOKENS` (or an account credential, see Accounts).
`/health` stays open.

For a real deployment (Docker + Caddy on a VPS), see
[`docs/DEPLOY-SERVER.md`](../docs/DEPLOY-SERVER.md).

## Test

```bash
python -m pytest -q
```

## Environment variables

| Variable                          | Required | Description                                                                                                                                                                                                                                                                                                                |
| --------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`                  | yes      | OpenAI key used server-side to call the Chat Completions API. The server fails to start without it.                                                                                                                                                                                                                        |
| `API_TOKENS`                      | yes      | Comma-separated list of bearer tokens accepted on `/search`, one per device, each at least 32 characters (`openssl rand -hex 32` produces a 64-character one). The server fails to start without at least one, or with a shorter one.                                                                                      |
| `ALLOWED_ORIGINS`                 | no       | Comma-separated list of origins allowed to call this server via CORS (e.g. `https://example.com`). Native apps don't need this; the web build does. Defaults to empty (no CORS).                                                                                                                                           |
| `SYNC_DB_PATH`                    | no       | SQLite file holding the synced garden (see Sync). Created on first use, with its parent directory. Defaults to `data/garden.db` relative to the working directory; the Docker image sets `/data/garden.db`.                                                                                                                |
| `SEARCH_DAILY_BUDGET_PER_ACCOUNT` | no       | Maximum `/search` calls per account (or for the legacy `API_TOKENS` bearer, as one key) per UTC day. Beyond it `/search` answers 429. Checked before the global budget, which a refused request does not spend. Positive integer; the server fails to start otherwise. Defaults to 100. In memory, like the global budget. |
| `PHOTO_QUOTA_BYTES`               | no       | Photo storage allowed per account, in bytes. Beyond it `PUT /photos/{id}` answers 507. Positive integer; the server fails to start otherwise. Defaults to 5 GiB (5368709120).                                                                                                                                              |
| `SEARCH_DAILY_BUDGET`             | no       | Maximum number of upstream OpenAI calls served per UTC calendar day, across all clients. Beyond it `/search` answers 503 without calling OpenAI. Must be a positive integer if set; the server fails to start otherwise. Defaults to 500.                                                                                  |
| `SEARCH_REASONING_EFFORT`         | no       | Reasoning effort of the search model (`gpt-5.5`, used for every search): `low`, `medium` or `high`. The server fails to start otherwise. Defaults to `high`; drop to `medium` if searches get close to the 85 s upstream timeout.                                                                                          |

## Sync

The garden is stored as whole rows, keyed by `(account, table, id)` (table
`garden_rows`), with a revision number that grows on each accepted write. Each
account only ever sees its own rows: two accounts pushing the same `(table, id)`
get two independent rows. Revisions come from one counter shared by all accounts,
so they strictly increase within an account (with gaps) and `since` needs no
per-account bookkeeping. A database from before accounts (an old `rows` table)
is dropped at startup if empty; if it holds rows the server refuses to start,
and they must be migrated or removed by hand. Both endpoints need an
approved account's credential (see Accounts), not an `API_TOKENS` token. Columns allowed per table are in
`sync_schema.json`, shared with the app.

`POST /sync/push` with `{"changes": {"<table>": [row, ...]}}`. Each row is an
object with a non-empty `id`, an ISO `updatedAt`, optionally `deletedAt`
(null or ISO), and scalar values for the table's columns. Answers
`{"accepted": <rows stored>, "revision": <latest revision>}`. A row is stored
only if it is new or its `updatedAt` is strictly newer than the stored one
(last write wins), so re-pushing is harmless. Anything invalid (unknown table
or column, non-scalar value, bad timestamp, duplicate id) answers 400 and
stores nothing; more than 1000 rows answers 413.

`GET /sync/pull?since=<revision>&limit=<n>` (`since` default 0, `limit` 1 to
1000, default 500) answers `{"changes": {"<table>": [row, ...]}, "revision":
<revision of the last row returned, or since>, "more": <bool>}`. Soft-deleted
rows are included, with their `deletedAt`. While `more` is true, pull again
with `since` set to the returned `revision`.

`GET /sync/stats` answers `{"rows": {"<table>": <live row count>, ...},
"photoFiles": <number>}` for the caller's account only: rows with no
`deletedAt` for each synced table, and the photo files stored for it. The app
compares them with its own counts after the first sync (ticket 096).

## Photos

Photo files are stored in a `photos/` directory next to the sync database
(`dirname(SYNC_DB_PATH)/photos/`), one sub-directory per account
(`photos/<account id>/<photo id>.<ext>`, created on first use). Both routes need
an account credential and only find that account's row and file. Flat files
directly in `photos/` (from before accounts) are served to nobody; the server
logs a warning at startup if there are any. The id must match `[A-Za-z0-9-]{1,64}`
(else 400).

`PUT /photos/{photo_id}` with the raw image as body. The id must be a `photos`
or `unsorted_photos` row already pushed via `/sync/push` (unknown: 404; soft-deleted:
410). Accepted types, detected from the bytes and required to match the
`Content-Type` header: `image/jpeg`, `image/png`, `image/webp`, `image/heic`
(anything else: 415). Maximum 15 MB (413). Answers 201 `{"stored": true}`, or 200
`{"stored": false}` if a file already exists (the existing file is kept). If the
account's stored photos plus this one would exceed `PHOTO_QUOTA_BYTES`: 507
`{"detail": "Espace photo plein (quota atteint)."}`.

`GET /photos/{photo_id}` returns the file with its media type and
`Cache-Control: private, max-age=31536000, immutable`; 404 if there is none.

Pushing a `photos` or `unsorted_photos` row with `deletedAt` deletes the
caller's file only.

## Accounts

Accounts live in the same SQLite file as the sync store (`SYNC_DB_PATH`), in
their own tables (`accounts.py`). Passwords are hashed with scrypt (n=2**15) and
a per-account salt, 12 to 256 characters; login tokens are stored only as a
SHA-256 hash. The `SCRYPT_N` environment variable lowers the scrypt cost and
exists only for the test suite (`conftest.py` sets it): never set it on the
server.

| Route               | What it does                                                                                                                                                           |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/signup` | `{email, password, website}` creates a **pending** account. Always 202 `{"status":"pending"}`, whether or not the email existed.                                       |
| `POST /auth/login`  | `{email, password, client: "web"\|"device", deviceName?}`. Web: sets the session cookie. Device: returns `{"token"}`. Both return `{"account": {id, email, isAdmin}}`. |
| `POST /auth/logout` | Revokes the credential that authenticated the request and clears the cookie (204).                                                                                     |
| `GET /auth/me`      | The account of the credential, or 401.                                                                                                                                 |

Statuses: `pending` (after signup), `approved`, `refused`, `disabled`. Only an
`approved` account can log in or use a credential; a credential also stops
working if its account leaves `approved`. Until the admin screens (ticket 099),
approval is a manual `UPDATE accounts SET status = 'approved' ...`.

- **Web**: `__Host-session` cookie (`Secure; HttpOnly; SameSite=Strict; Path=/`,
  30 days). The web app calls the API with `credentials: 'include'`.
- **Device** (the phone): `Authorization: Bearer <token>`, no expiry, revocable
  with logout.
- Data routes (`/sync/*`, `/photos/*`) resolve the account from the bearer
  device token, else from the cookie. `/search` also still accepts a legacy
  `API_TOKENS` bearer, until ticket 101 removes it. Rows and photos are scoped
  to that account (ticket 100).
- **Lockout**: kept per normalized email for every well-formed address, known
  or not (table `login_throttle`, keyed by a hash), so a lockout never reveals
  that an account exists. The 5th consecutive failed password locks the email for 1
  minute, doubling with each further failure up to 1 hour (429 with
  `Retry-After`; the password is not checked while locked). A success resets it.
  Per IP, 20 failed logins in 15 minutes answer 429 too.
- **Same answer**: an unknown email and a wrong password both give 401
  `Identifiants invalides` (scrypt runs either way, so timing does not tell).
  The account status (403) is revealed only when the password is right.
- **Signup abuse**: 5 signups per hour per IP (429); `website` is a honeypot
  field, hidden in the form: if filled the answer is the usual 202 but nothing is
  stored; at 50 pending accounts signup answers 503.
- **CSRF**: a state-changing request (POST, PUT, PATCH, DELETE) authenticated by
  the **cookie** must carry an `Origin` header listed in `ALLOWED_ORIGINS`, else
  403 `Origine refusée`. Login and signup check `Origin` when one is sent. A
  request with a bearer token and no `Origin` (the phone) is fine.
- Every rejected attempt is logged with the client IP and the reason, never the
  password, and the account id rather than the email.

First admin, on the server (not through signup):

```bash
docker compose exec api python -m accounts create-admin --email you@example.com
```

It asks for the password twice. See `docs/DEPLOY-SERVER.md` for the exact
command on the VPS.

## Notes

- Behind a reverse proxy, run uvicorn with `--proxy-headers` so the rate
  limiter sees real client IPs instead of the proxy's.
- The rate limit (20 requests / 60s per client IP) is per process and
  in-memory — it resets on restart and is not shared across multiple worker
  processes.
- The daily budget (`SEARCH_DAILY_BUDGET`) is likewise per process and
  in-memory: running several instances gives each one its own full budget,
  so the effective total scales with instance count.
