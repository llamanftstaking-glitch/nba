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
Then add the proxy site (do not edit other sites):
`infrastructure/proxy/nginx-nba.gizergroup.com.conf` (or `Caddyfile.snippet`), issue the certificate with the
proxy's existing ACME tooling, reload the proxy, and run:
```bash
scripts/smoke.sh https://nba.gizergroup.com "$OWNER_EMAIL" "$OWNER_PASSWORD"
docker compose exec backup sh /scripts/backup-once.sh && docker compose exec backup sh /scripts/restore-test.sh
```
Remove `GIZER_OWNER_PASSWORD` from `.env` after the first successful sign-in if you prefer; re-add it only to reset.

## Updates
```bash
git pull && docker compose up -d --build     # migrations run automatically before services start
```
Rollback: `git checkout <previous tag> && docker compose up -d --build`. The baseline migration has no
destructive downgrade; schema rollbacks are restore-from-backup operations.

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
