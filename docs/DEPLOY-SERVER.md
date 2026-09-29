# Deploying the search server

The search server (`server/`) must run somewhere reachable over HTTPS before
plant search works in a release build. This walks through a fresh VPS: Docker
Compose runs the server plus Caddy, which gets and renews a TLS certificate
automatically.

## Prerequisites

- A small VPS running Debian or Ubuntu. 1 vCPU / 1 GB RAM is plenty.
- A domain name pointed at the VPS, or a free [sslip.io](https://sslip.io)
  address (`<ip-with-dashes>.sslip.io`, e.g. `203-0-113-10.sslip.io` resolves
  to `203.0.113.10`) if you don't have one.

## 1. DNS

Point an A record for the domain you'll use at the VPS's public IP. If using
sslip.io, skip this — it resolves automatically.

## 2. Install Docker

Install Docker Engine and the Compose plugin. Either the
[official convenience script](https://docs.docker.com/engine/install/) or the
[apt repository](https://docs.docker.com/engine/install/ubuntu/) works.

## 3. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
```

The API port (8000) is never opened on the host: `deploy/docker-compose.yml`
only `expose`s it on the internal Docker network, reachable solely through
Caddy.

## 4. Configure

```bash
git clone <this repo> plants && cd plants
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

Edit `deploy/.env`:

- `API_DOMAIN` — the domain or sslip.io address from step 1.
- `OPENAI_API_KEY` — the server's OpenAI key (see the note on 019 below).
- `API_TOKENS` — one token per device that will use plant search,
  comma-separated. Generate each with:

  ```bash
  openssl rand -hex 32
  ```

- `SEARCH_DAILY_BUDGET` — leave at the default (500) unless you have a reason
  to change it.
- `ALLOWED_ORIGINS` — leave empty unless the web build calls this server
  directly.

## 5. Start

```bash
docker compose -f deploy/docker-compose.yml up -d --build
```

## 6. Check

```bash
curl https://$API_DOMAIN/health
# {"status":"ok"}

curl -i -X POST https://$API_DOMAIN/search -H 'Content-Type: application/json' -d '{"query":"rose"}'
# HTTP/1.1 401 Unauthorized

curl -X POST https://$API_DOMAIN/search \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer <one of the API_TOKENS values>" \
  -d '{"query":"rose"}'
# HTTP/1.1 200 OK, a list of plants
```

## 7. Point the app at it

`EXPO_PUBLIC_PLANT_API_URL` is a URL, not a secret (CLAUDE.md rule 2) — set it
to `https://$API_DOMAIN` before building a release (see
[`docs/DEPLOY-IPHONE.md`](DEPLOY-IPHONE.md)). Then, in the app, paste one of
the `API_TOKENS` values into **Réglages → Recherche de plantes**. The token is
stored on-device only (Keychain on iOS, `localStorage` on web) and never ships
in the app bundle.

## 8. Update

```bash
git pull
docker compose -f deploy/docker-compose.yml up -d --build
```

## 9. Rotate or revoke a token

Edit `API_TOKENS` in `deploy/.env` (drop the old token, add a new one if
rotating), then recreate the API container:

```bash
docker compose -f deploy/docker-compose.yml up -d
```

Existing devices using a removed token get 401 on their next search and need
the new token pasted into Réglages.

## 10. Logs

```bash
docker compose -f deploy/docker-compose.yml logs -f api
```

## 11. The OpenAI key

This deployment closes the "nothing safe to deploy" half of ticket 019. The
owner steps in 019 still apply and are not automated here: revoke the
pre-001 OpenAI key that was ever exposed client-side, and set a hard monthly
spend limit on the OpenAI account as a second line of defense behind
`SEARCH_DAILY_BUDGET`.
