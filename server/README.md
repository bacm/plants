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
one of the tokens in `API_TOKENS`. `/health` stays open.

For a real deployment (Docker + Caddy on a VPS), see
[`docs/DEPLOY-SERVER.md`](../docs/DEPLOY-SERVER.md).

## Test

```bash
python -m pytest -q
```

## Environment variables

| Variable              | Required | Description                                                                                                                                                                                                                               |
| --------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`      | yes      | OpenAI key used server-side to call the Chat Completions API. The server fails to start without it.                                                                                                                                       |
| `API_TOKENS`          | yes      | Comma-separated list of bearer tokens accepted on `/search`, one per device, each at least 32 characters (`openssl rand -hex 32` produces a 64-character one). The server fails to start without at least one, or with a shorter one.     |
| `ALLOWED_ORIGINS`     | no       | Comma-separated list of origins allowed to call this server via CORS (e.g. `https://example.com`). Native apps don't need this; the web build does. Defaults to empty (no CORS).                                                          |
| `SYNC_DB_PATH`        | no       | SQLite file holding the synced garden (see Sync). Created on first use, with its parent directory. Defaults to `data/garden.db` relative to the working directory; the Docker image sets `/data/garden.db`.                               |
| `SEARCH_DAILY_BUDGET` | no       | Maximum number of upstream OpenAI calls served per UTC calendar day, across all clients. Beyond it `/search` answers 503 without calling OpenAI. Must be a positive integer if set; the server fails to start otherwise. Defaults to 500. |

## Sync

The garden is stored as whole rows, keyed by `(table, id)`, with a global
revision number that grows on each accepted write. Both endpoints need the same
`Authorization: Bearer <token>` as `/search`. Columns allowed per table are in
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

## Notes

- Behind a reverse proxy, run uvicorn with `--proxy-headers` so the rate
  limiter sees real client IPs instead of the proxy's.
- The rate limit (20 requests / 60s per client IP) is per process and
  in-memory — it resets on restart and is not shared across multiple worker
  processes.
- The daily budget (`SEARCH_DAILY_BUDGET`) is likewise per process and
  in-memory: running several instances gives each one its own full budget,
  so the effective total scales with instance count.
