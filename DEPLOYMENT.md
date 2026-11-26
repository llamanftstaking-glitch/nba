# Deployment — Server M

Status: **NOT DEPLOYED.** The build session had no access to Server M. Everything below was exercised on a
local Docker engine (build, migrate, start, health, restart, backup, restore) but not on the server.

## Prerequisites on Server M
* Docker Engine with the compose plugin; outbound HTTPS to `api.pbpstats.com`, `site.api.espn.com`
  (and `api.the-odds-api.com` if a key is added).
* The existing reverse proxy (nginx/openresty or Caddy) terminating TLS for `nba.gizergroup.com`.
* DNS: `nba.gizergroup.com` A → Server M (observed 2026-11-24: 74.208.191.181).
* A free loopback port (default 3410). Check first: `ss -ltnp | grep 3410`.

## First deployment

Shortcut: `bash scripts/deploy.sh` performs the checks, creates `.env` interactively (random database password),
builds, starts and waits for health; `bash scripts/deploy.sh history` runs the one-off history load and model
validation. The manual equivalent follows.
```bash
sudo mkdir -p /opt/gizer-nba && cd /opt/gizer-nba
git clone https://github.com/llamanftstaking-glitch/nba .
cp .env.example .env && chmod 600 .env      # set POSTGRES_PASSWORD, GIZER_OWNER_EMAIL, GIZER_OWNER_PASSWORD
docker compose up -d --build                # builds images, runs migrations, seeds teams, creates the owner
docker compose ps                           # api must be healthy
docker compose exec worker gizer ingest-results --season 2025-26   # one-off history load (~2 hours, rate-limited)
docker compose exec worker gizer ingest-results --season 2026-27
docker compose exec worker gizer backtest   # validates models; promotes only those passing the gate
```
**Server M uses a Caddy container (`mon-caddy`, Caddyfile at `/opt/mon/Caddyfile`) that reaches apps over a
shared Docker network.** Use `bash scripts/connect-caddy.sh`: it attaches only the web container to that network
via `docker-compose.override.yml`, appends one site block between `gizer-nba-begin/end` markers (with a backup and
validation), and reloads Caddy. The generic instructions below apply to a host-level proxy instead.

Then add the proxy site (do not edit other sites):
`infrastructure/proxy/nginx-nba.gizergroup.com.conf` (or `Caddyfile.snippet`), issue the certificate with the
proxy's existing ACME tooling, reload the proxy, and run:
```bash
scripts/smoke.sh https://nba.gizergroup.com "$OWNER_EMAIL" "$OWNER_PASSWORD"
docker compose exec backup sh /scripts/backup-once.sh && docker compose exec backup sh /scripts/restore-test.sh
```
Remove `GIZER_OWNER_PASSWORD` from `.env` after the first successful sign-in if you prefer; re-add it only to reset.

## Updates
Releases are installed by the unattended updater (RUNBOOK.md, "Updates"). Since 0.6.1 the server no longer has
to compile the application (D-032):

1. Every push to `main` runs the `images` check on GitHub. It builds both images and pushes them to the GitHub
   Container Registry as `ghcr.io/llamanftstaking-glitch/nba-api:<full commit id>` and `...nba-web:<full commit id>`.
2. Promotion is unchanged: `git push origin <commit>:production` for a verified commit whose checks are green.
3. The updater on the server waits for every check on that commit (which includes `images`), then pulls those
   two images, checks they are labelled with that commit and built for the server's processor type, gives them
   the names `docker-compose.yml` uses (`gizer-nba-api:local`, `gizer-nba-web:local`) and runs
   `docker compose up -d --no-build`. Health check and rollback are as before; a rollback pulls the previous
   commit's images when they exist.
4. If the images cannot be pulled for any reason, the updater logs the reason and runs
   `docker compose up -d --build` as it did before 0.6.1. Nothing needs the owner for releases to keep working.

Status: IMPLEMENTED, TESTED with stubs (`bash scripts/test-auto-update.sh`). NOT VERIFIED on Server M, against a
real Docker engine, or against the real registry.

### One-time owner step: let the server read the images
Only needed if `bash scripts/auto-update.sh status` reports `registry pulls : NOT working`. Images pushed by
GitHub Actions can be private; a private image needs a sign-in on the server. Until then every release still
installs, by building on the server.

1. On github.com: Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate new
   token. Tick **only** `read:packages`. Set an expiry you will remember to renew. (The container registry is
   expected to need a classic token; fine-grained tokens were not usable for packages when this was written —
   NOT VERIFIED.) The token can read packages and nothing else: it cannot push code, images or settings.
2. On Server M, as root (the updater runs as root, and the sign-in is stored per user):
```bash
sudo -i
read -rsp "GitHub token (read:packages only): " GHCR_TOKEN; echo
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u <github-username-that-owns-the-token> --password-stdin
unset GHCR_TOKEN
chmod 600 /root/.docker/config.json
cd /opt/gizer-nba && bash scripts/auto-update.sh status     # expect: registry pulls : working
```
   The token is typed at a hidden prompt, so it is not in the shell history or the process list. Docker keeps it
   in `/root/.docker/config.json` (encoded, not encrypted) — keep that file readable by root only. Never put the
   token in `.env`, the repository or a chat.
3. Nothing else: the next release is pulled. To stop using the token: `docker logout ghcr.io` (releases build on
   the server again) and delete the token on github.com.

Do not make the packages or the repository public to avoid this step without an owner decision.

### Manual update and rollback
```bash
git pull && bash scripts/update.sh           # pulls the images for the checked-out commit, or builds if it cannot
git pull && docker compose up -d --build     # always builds here; needs no registry access
```
Rollback: `git checkout <previous commit> && bash scripts/update.sh` (or `docker compose up -d --build`). The
baseline migration has no destructive downgrade; schema rollbacks are restore-from-backup operations.
`scripts/deploy.sh` (first deployment) always builds on the machine.

## Isolation guarantees
Project name `gizer-nba` namespaces containers, networks and volumes. No host ports except
`127.0.0.1:${GIZER_WEB_PORT}`. No shared database, no changes to other applications or to the proxy's
existing sites. All services have `restart: unless-stopped` and come back after a reboot with the Docker daemon.

## Verification checklist (fill in on the server)
- [ ] HTTPS reachable, certificate valid
- [ ] `scripts/smoke.sh` passes (health, readiness incl. worker + scheduler heartbeats, auth)
- [ ] First scheduled job ran without an open session (`/admin` → recent jobs)
- [ ] Backup created and restore test passed
- [ ] `sudo reboot`, then smoke test passes again
