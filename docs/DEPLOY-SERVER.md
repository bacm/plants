# Deploying the search server

The search server (`server/`) must run somewhere reachable over HTTPS before
plant search works in a release build. It runs on a VPS as a Docker Compose
stack: the API plus Caddy, which gets and renews a TLS certificate
automatically. GitHub Actions deploys it (ticket 079): every push to `main`
that touches `server/` or `deploy/` is tested, then that exact commit is
deployed, with the OpenAI key and the API tokens coming from GitHub secrets.

Replace throughout:

- `203.0.113.10` with the VPS's IP address;
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

Any provider, **Ubuntu 24.04**, 1 vCPU / 1 GB RAM. Give it your Mac's SSH
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

Create an **A** record `plants-api.example.com` → `203.0.113.10` at your
registrar (nothing to do with sslip.io). Check from your Mac:

```bash
dig +short plants-api.example.com     # must print the VPS IP
```

## 6. Clone the repository on the VPS

```bash
sudo -iu deploy
```

If the GitHub repository is **private**, give the VPS a read-only key:

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/github_read -C "vps-read-only"
cat ~/.ssh/github_read.pub
```

GitHub → repository → Settings → Deploy keys → Add deploy key: paste it,
leave **Allow write access unticked**. Then:

```bash
printf 'Host github.com\n  IdentityFile ~/.ssh/github_read\n' >> ~/.ssh/config
ssh -o StrictHostKeyChecking=accept-new -T git@github.com   # "successfully authenticated"
git clone git@github.com:bacm/plants.git ~/plants
```

(Public repository: `git clone https://github.com/bacm/plants.git ~/plants`.)

Do **not** create `deploy/.env`: the first deploy writes it from the GitHub
secrets.

If the VPS clone predates `deploy/deploy.sh` (pushed with ticket 079), update
it once by hand — the forced command of step 7 needs the script to exist; every
later deploy updates the checkout itself:

```bash
cd ~/plants && git pull
```

## 7. The key GitHub Actions deploys with

On your Mac:

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/plants_gha_deploy -C "github-actions-deploy"
cat ~/.ssh/plants_gha_deploy.pub
```

On the VPS, as `deploy`, authorise it **only** for the deploy script — replace
`AAAA...` with the content of `plants_gha_deploy.pub`:

```bash
echo 'command="/home/deploy/plants/deploy/deploy.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... github-actions-deploy' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Check from your Mac that it gives no shell — it must answer
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
gh variable set SEARCH_DAILY_BUDGET --env production --body "500"
```

`ALLOWED_ORIGINS` is optional (only if the web build calls this server):
`gh variable set ALLOWED_ORIGINS --env production --body "https://…"`.

Optional manual approval of every deploy: GitHub → Settings → Environments →
`production` → **Required reviewers** → add yourself.

Delete the private key from your Mac once it is in GitHub, if you like
(`rm ~/.ssh/plants_gha_deploy`): a new one can always be made with step 7.

## 9. First deploy

```bash
gh workflow run deploy-server.yml
gh run watch
```

The run tests the server, builds the image, deploys the commit and calls
`https://plants-api.example.com/health`. Then check authentication by hand:

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

## Day to day

- **Deploy:** push to `main` (changes under `server/` or `deploy/`), or
  `gh workflow run deploy-server.yml`.
- **Rotate the OpenAI key:** create the new one, `gh secret set OPENAI_API_KEY
--env production`, run the workflow, then revoke the old one.
- **Revoke or add a device token:** `gh secret set API_TOKENS --env production
--body "<tokens to keep>"`, then run the workflow. A removed token gets 401 on
  its next search.
- **Logs:** on the VPS, `docker compose -f ~/plants/deploy/docker-compose.yml
logs -f api`.

## How the deploy works, and why it is safe

- The deploy job reads the secrets from the `production` environment only.
  Third-party actions are pinned by commit SHA, and none of them touches a
  secret: the job uses plain `ssh`.
- The commit SHA is sent as the SSH "command"; the environment file goes over
  SSH stdin. No secret is ever a command-line argument, so none appears in
  `ps` or in a log (GitHub also masks secret values in its logs).
- `deploy/deploy.sh` is the key's forced command: the key can do nothing else.
  It accepts only a full 40-character SHA and only the known `KEY=value`
  lines, checks the required ones are present, checks out that commit, then
  atomically writes `deploy/.env` with mode 600 and restarts the stack. It
  fails, and the workflow with it, if the API is not healthy within 90 s.
- The VPS host key is pinned in `VPS_KNOWN_HOSTS`: a runner never trusts a
  host it hasn't been told about.
- `deploy/.env` on the VPS is still plain text: the container has to read the
  key. The OpenAI spend limit (step 1) caps the damage if the VPS is ever
  compromised.

## Without GitHub Actions

Deploy by hand on the VPS, as `deploy`, with the environment file on stdin:

```bash
cd ~/plants && git fetch && SHA=$(git rev-parse origin/main)
printf 'API_DOMAIN=%s\nOPENAI_API_KEY=%s\nAPI_TOKENS=%s\n' \
  plants-api.example.com "$OPENAI_API_KEY" "$API_TOKENS" | deploy/deploy.sh "$SHA"
```
