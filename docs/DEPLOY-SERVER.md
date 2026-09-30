# Deploying the search server

The search server (`server/`) must run somewhere reachable over HTTPS before
plant search works in a release build. It runs on a VPS as a Docker Compose
stack: the API, the web app (ticket 097) and Caddy, which gets and renews a TLS certificate
automatically. GitHub Actions deploys it (ticket 079): every push to `main`
that touches `server/` or `deploy/` is tested, then that exact commit is
deployed, with the OpenAI key and the API tokens coming from GitHub secrets.

Replace throughout:

- `203.0.113.10` with the VPS's IP address;
- `plants.example.com` with the web app's domain (its own subdomain);
- `plants-api.example.com` with the server's domain — or, without a domain,
  a free [sslip.io](https://sslip.io) name: the IP with dashes,
  `203-0-113-10.sslip.io`.

## 1. The OpenAI key

1. <https://platform.openai.com/api-keys>: **revoke** the key that shipped in
   builds before ticket 001 (every such build must be treated as compromised),
   and create a new one, e.g. `plants-server`. Keep it for step 8 only.
2. <https://platform.openai.com/settings/organization/limits>: set a hard
   monthly budget (e.g. $5), the second line of defence behind
   `SEARCH_DAILY_BUDGET`.

## 2. The VPS

Any provider, **Ubuntu 24.04**, 1 vCPU / 2 GB RAM. The web image is built on
the VPS, and `expo export` needs about 2 GB: on a smaller VPS, add swap first
(`sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap
/swapfile && sudo swapon /swapfile`, plus a line in `/etc/fstab` to keep it). Give it your Mac's SSH
public key when creating it:

```bash
ssh-keygen -t ed25519 -C "my-mac"     # only if ~/.ssh/id_ed25519 doesn't exist
cat ~/.ssh/id_ed25519.pub
```

## 3. Harden it

```bash
ssh root@203.0.113.10
```

On the VPS, as root:

```bash
adduser admin                          # your admin user; any name
usermod -aG sudo admin
mkdir -p /home/admin/.ssh
cp /root/.ssh/authorized_keys /home/admin/.ssh/
chown -R admin:admin /home/admin/.ssh
chmod 700 /home/admin/.ssh && chmod 600 /home/admin/.ssh/authorized_keys
```

**From a second terminal**, check `ssh admin@203.0.113.10` works before going
on. Then, as `admin` on the VPS:

```bash
printf 'PermitRootLogin no\nPasswordAuthentication no\n' | sudo tee /etc/ssh/sshd_config.d/99-hardening.conf
sudo systemctl restart ssh

sudo apt update && sudo apt -y upgrade
sudo apt -y install unattended-upgrades git
sudo dpkg-reconfigure -plow unattended-upgrades

sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
```

The API port (8000) is never opened: `deploy/docker-compose.yml` only
`expose`s it on the internal Docker network, reachable solely through Caddy.

## 4. Docker and the `deploy` user

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
```

Membership of `docker` is close to root, which is why `deploy` has no password
and the key GitHub uses (step 6) can only run the deploy script.

## 5. DNS

Create two **A** records at your registrar (nothing to do with sslip.io):
`plants-api.example.com` → `203.0.113.10` for the API, and
`plants.example.com` → `203.0.113.10` for the web app. Check from your Mac:

```bash
dig +short plants-api.example.com     # must print the VPS IP
dig +short plants.example.com         # must print the VPS IP
```

### Behind Cloudflare

If the domains are proxied by Cloudflare (orange cloud), set its SSL/TLS mode to
**Full (strict)**: Caddy holds a valid certificate, and "Flexible" would loop
or send traffic in clear. Caddy then only sees Cloudflare's addresses, so
`deploy/Caddyfile` starts with a global block trusting Cloudflare's ranges
(<https://www.cloudflare.com/ips-v4>, <https://www.cloudflare.com/ips-v6>) and
reading the visitor's IP from `CF-Connecting-IP`; it is only believed when the
connection really comes from those ranges. Refresh the list when Cloudflare
publishes new ranges. Optionally, limit ports 80/443 in `ufw` to those ranges
so nothing reaches the VPS around Cloudflare. A shared Caddy (step 8b) needs the
same global block.

## 6. Nothing to clone

The first deploy clones the repository into `/home/deploy/plants` itself, and
every deploy checks out the commit it deploys: no `git clone` or `git pull` on
the VPS, ever. Do not create `deploy/.env` either: each deploy writes it from
the GitHub secrets.

## 7. The key GitHub Actions deploys with

On your Mac, create the key and print the exact `authorized_keys` line for it:

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/plants_gha_deploy -C "github-actions-deploy"
deploy/authorized-key-line.sh ~/.ssh/plants_gha_deploy.pub
```

The line restricts the key to one forced command, a bootstrap that never
changes: it accepts only a full commit SHA, clones the repository if needed,
checks that commit out and runs its `deploy/deploy.sh` (see the comment in
`deploy/authorized-key-line.sh`).

On the VPS, as `deploy` (`sudo -iu deploy`), open the file and paste the
printed line as its **only** line for this key — replace any earlier
`github-actions-deploy` line, since SSH uses the first match:

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

`deploy`'s login shell must be bash (Ubuntu's default for `adduser`; check
with `getent passwd deploy`).

Check from your Mac that the key gives no shell — it must answer
`deploy: expected a full commit SHA` and close:

```bash
ssh -i ~/.ssh/plants_gha_deploy deploy@203.0.113.10 < /dev/null
```

## 8. GitHub environment, secrets and variables

Generate the API tokens on your Mac first, and keep them (a password manager):
GitHub never shows a secret again, and each device needs its token pasted into
the app.

```bash
openssl rand -hex 32   # token for the iPhone
openssl rand -hex 32   # token for the simulator / web, if wanted
```

Then, from the repository on your Mac:

```bash
gh auth login                                   # if not already logged in
gh api -X PUT repos/bacm/plants/environments/production

gh secret set VPS_HOST --env production --body "203.0.113.10"
gh secret set VPS_SSH_KEY --env production < ~/.ssh/plants_gha_deploy
ssh-keyscan -t ed25519 203.0.113.10 | gh secret set VPS_KNOWN_HOSTS --env production
gh secret set OPENAI_API_KEY --env production   # paste the key from step 1 when asked
gh secret set API_TOKENS --env production --body "<token1>,<token2>"

gh variable set API_DOMAIN --env production --body "plants-api.example.com"
gh variable set WEB_DOMAIN --env production --body "plants.example.com"
gh variable set SEARCH_DAILY_BUDGET --env production --body "500"
```

`WEB_DOMAIN` is required. `ALLOWED_ORIGINS` is optional: when unset, the deploy
sets it to `https://plants.example.com` (the web app's origin). Set it only to
allow other origins as well:
`gh variable set ALLOWED_ORIGINS --env production --body "https://…,https://…"`
(then include the web origin yourself).

Optional manual approval of every deploy: GitHub → Settings → Environments →
`production` → **Required reviewers** → add yourself.

Delete the private key from your Mac once it is in GitHub, if you like
(`rm ~/.ssh/plants_gha_deploy`): a new one can always be made with step 7.

## 8b. A VPS that already runs a Caddy

If ports 80/443 are already served by a Caddy of your own (for other sites),
don't start a second one. Tell the deploy which Docker network that Caddy is
on:

```bash
gh variable set SHARED_CADDY_NETWORK --env production --body "proxy"
```

The deploy then leaves this stack's Caddy off and attaches the API and the web
app to that network as `plants-api` and `plants-web`
(`deploy/docker-compose.shared-caddy.yml`). Add both sites to that Caddy's
`Caddyfile`, then validate and reload it — a reload doesn't interrupt the other
sites. The API's body limits are per route (sync and photo uploads are larger
than a search), that Caddy needs the global `trusted_proxies` block from
`deploy/Caddyfile` if the domains are behind Cloudflare, and the web site needs the security headers and CSP of
`deploy/Caddyfile`:

```
plants-api.example.com {
    handle /sync/push {
        request_body {
            max_size 5MB
        }
        reverse_proxy plants-api:8000
    }
    @photoUpload {
        method PUT
        path /photos/*
    }
    handle @photoUpload {
        request_body {
            max_size 16MB
        }
        reverse_proxy plants-api:8000
    }
    handle {
        request_body {
            max_size 8KB
        }
        reverse_proxy plants-api:8000
    }
}

plants.example.com {
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"
        Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://upload.wikimedia.org https://thumb.wikimedia.org; connect-src 'self' https://plants-api.example.com; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        -Server
    }
    request_body {
        max_size 8KB
    }
    reverse_proxy plants-web:8080
}
```

```bash
docker exec <caddy container> caddy validate --config /etc/caddy/Caddyfile
docker exec <caddy container> caddy reload --config /etc/caddy/Caddyfile
```

## 9. First deploy

```bash
gh workflow run deploy-server.yml
gh run watch
```

The run tests the server, checks that the web image builds, deploys the commit
and calls `https://plants-api.example.com/health` and
`https://plants.example.com/`. Then check authentication by hand:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://plants-api.example.com/search \
  -H 'Content-Type: application/json' -d '{"query":"rose"}'
# 401

curl -X POST https://plants-api.example.com/search -H 'Content-Type: application/json' \
  -H "Authorization: Bearer <token1>" -d '{"query":"rose"}'
# a list of plants
```

If HTTPS doesn't answer, on the VPS as `deploy`:

```bash
docker compose -f ~/plants/deploy/docker-compose.yml logs caddy
```

## 10. Point the app at it

```bash
echo 'EXPO_PUBLIC_PLANT_API_URL=https://plants-api.example.com' >> .env
npm run deploy:iphone
```

`EXPO_PUBLIC_PLANT_API_URL` is a URL, not a secret (CLAUDE.md rule 2); see
[`DEPLOY-IPHONE.md`](DEPLOY-IPHONE.md). On the phone: **Réglages → Recherche
de plantes**, paste the device's token, **Enregistrer le jeton**. It is kept in
the iOS Keychain, never in the app bundle.

## The web app

`https://plants.example.com` serves the Expo web build (`expo export
--platform web`), as its own container (`web/Dockerfile`) behind the same
Caddy. Every deploy rebuilds it from the commit, on the VPS (about 2 GB of RAM
during the build; see step 2 for swap). The API's public URL is baked into the
bundle at build time as `EXPO_PUBLIC_PLANT_API_URL=https://$API_DOMAIN`: a URL,
not a secret (CLAUDE.md rule 2). Changes to `app/`, `components/`, `lib/`,
`assets/` or `web/` trigger a deploy like changes to `server/` do.

## Day to day

- **Deploy:** push to `main` (changes under `server/`, `deploy/` or the web app's sources), or
  `gh workflow run deploy-server.yml`.
- **Rotate the OpenAI key:** create the new one, `gh secret set OPENAI_API_KEY
--env production`, run the workflow, then revoke the old one.
- **Revoke or add a device token:** `gh secret set API_TOKENS --env production
--body "<tokens to keep>"`, then run the workflow. A removed token gets 401 on
  its next search.
- **Logs:** on the VPS, `docker compose -f ~/plants/deploy/docker-compose.yml
logs -f api`.

## The garden data

The synced garden (ticket 092) is a SQLite file, `/data/garden.db` in the `api`
container, stored in the named volume `garden_data`. Redeploys keep it; only
`docker compose down -v` deletes it. Back it up with SQLite's online backup
(safe while the server runs), on the VPS as `deploy`:

```bash
docker compose -f ~/plants/deploy/docker-compose.yml exec -T api python -c \
  "import sqlite3; s=sqlite3.connect('/data/garden.db'); d=sqlite3.connect('/data/backup.db'); s.backup(d)"
docker compose -f ~/plants/deploy/docker-compose.yml cp api:/data/backup.db ./garden-$(date +%F).db
```

Photo files (ticket 093) live in `/data/photos/`, in the same volume, so the
backup must copy that directory too:

```bash
docker compose -f ~/plants/deploy/docker-compose.yml cp api:/data/photos ./photos-backup
```

Do not copy `garden.db` by hand while the server runs: in WAL mode, recent
writes may sit in `garden.db-wal`.

## How the deploy works, and why it is safe

- The deploy job reads the secrets from the `production` environment only.
  Third-party actions are pinned by commit SHA, and none of them touches a
  secret: the job uses plain `ssh`.
- The commit SHA is sent as the SSH "command"; the environment file goes over
  SSH stdin. No secret is ever a command-line argument, so none appears in
  `ps` or in a log (GitHub also masks secret values in its logs).
- The key's forced command (`deploy/authorized-key-line.sh`) is the only
  thing it can run: it accepts only a full 40-character SHA, fetches and
  checks out that commit, then runs its `deploy/deploy.sh`, which accepts only
  the known `KEY=value`
  lines, checks the required ones are present, checks out that commit, then
  atomically writes `deploy/.env` with mode 600 and restarts the stack. It
  fails, and the workflow with it, if the API or the web app is not healthy within 90 s.
- The VPS host key is pinned in `VPS_KNOWN_HOSTS`: a runner never trusts a
  host it hasn't been told about.
- `deploy/.env` on the VPS is still plain text: the container has to read the
  key. The OpenAI spend limit (step 1) caps the damage if the VPS is ever
  compromised.

## Without GitHub Actions

Deploy by hand on the VPS, as `deploy`, with the environment file on stdin:

```bash
cd ~/plants && git fetch && SHA=$(git rev-parse origin/main)
printf 'API_DOMAIN=%s\nWEB_DOMAIN=%s\nOPENAI_API_KEY=%s\nAPI_TOKENS=%s\n' \
  plants-api.example.com plants.example.com "$OPENAI_API_KEY" "$API_TOKENS" | deploy/deploy.sh "$SHA"
```
