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
OPENAI_API_KEY=sk-... uvicorn app:app --host 0.0.0.0 --port 8000
```

## Test

```bash
python -m pytest -q
```

## Environment variables

| Variable              | Required | Description                                                                                                                                                                                                                               |
| --------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`      | yes      | OpenAI key used server-side to call the Chat Completions API. The server fails to start without it.                                                                                                                                       |
| `ALLOWED_ORIGINS`     | no       | Comma-separated list of origins allowed to call this server via CORS (e.g. `https://example.com`). Native apps don't need this; the web build does. Defaults to empty (no CORS).                                                          |
| `SEARCH_DAILY_BUDGET` | no       | Maximum number of upstream OpenAI calls served per UTC calendar day, across all clients. Beyond it `/search` answers 503 without calling OpenAI. Must be a positive integer if set; the server fails to start otherwise. Defaults to 500. |

## Notes

- Behind a reverse proxy, run uvicorn with `--proxy-headers` so the rate
  limiter sees real client IPs instead of the proxy's.
- The rate limit (20 requests / 60s per client IP) is per process and
  in-memory — it resets on restart and is not shared across multiple worker
  processes.
- The daily budget (`SEARCH_DAILY_BUDGET`) is likewise per process and
  in-memory: running several instances gives each one its own full budget,
  so the effective total scales with instance count.
