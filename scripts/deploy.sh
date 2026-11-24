#!/usr/bin/env bash
# GIZER NBA — first deployment / update on the server. Run from the repository root on Server M:
#   bash scripts/deploy.sh            # set up .env if needed, build, start, wait for health
#   bash scripts/deploy.sh history    # one-off history load + model validation (about two hours)
# It never touches other containers, the reverse proxy or DNS.
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || die "Docker is not installed on this server."
docker compose version >/dev/null 2>&1 || die "The Docker Compose plugin is not installed."
docker info >/dev/null 2>&1 || die "Cannot talk to Docker. Run this as a user in the 'docker' group (or with sudo)."

if [ "${1:-}" = "history" ]; then
  say "Loading two seasons of results (the data provider throttles requests; this takes about two hours)"
  docker compose exec -T worker gizer ingest-results --season 2025-26
  docker compose exec -T worker gizer ingest-results --season 2026-27
  say "Loading confirmed starters and did-not-play records"
  docker compose exec -T worker gizer ingest-starters --since 2025-10-01
  say "Validating models (only models that pass the gate are promoted)"
  docker compose exec -T worker gizer backtest | tail -n 40
  say "Running today's intelligence and publishing an edition"
  docker compose exec -T worker gizer run-job morning_intel
  docker compose exec -T worker gizer run-job edition --args '{"kind":"morning"}'
  say "History load finished."
  exit 0
fi

if [ ! -f .env ]; then
  say "Creating .env (kept only on this server, never committed)"
  read -r -p "Owner sign-in email: " OWNER_EMAIL
  [ -n "$OWNER_EMAIL" ] || die "An email is required."
  while :; do
    read -r -s -p "Owner password (at least 12 characters): " OWNER_PW; echo
    [ "${#OWNER_PW}" -ge 12 ] && break
    echo "Too short."
  done
  case "$OWNER_PW" in *"'"*|*$'\n'*) die "Please choose a password without single quotes.";; esac
  PORT="${GIZER_WEB_PORT:-3410}"
  if command -v ss >/dev/null && ss -ltn 2>/dev/null | grep -q ":${PORT} "; then
    die "Port ${PORT} is already in use on this server. Re-run as: GIZER_WEB_PORT=<free port> bash scripts/deploy.sh"
  fi
  PG_PW="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  umask 077
  cat > .env <<EOF
POSTGRES_PASSWORD=${PG_PW}
GIZER_PUBLIC_ORIGIN=https://nba.gizergroup.com
GIZER_OWNER_EMAIL=${OWNER_EMAIL}
GIZER_OWNER_PASSWORD='${OWNER_PW}'
GIZER_COOKIE_SECURE=true
GIZER_SEASONS=2025-26,2026-27
GIZER_WEB_PORT=${PORT}
GIZER_ODDS_API_KEY=
GIZER_ODDS_API_MONTHLY_QUOTA=500
GIZER_ODDS_API_MONTHLY_COST_USD=0
GIZER_PAPER_UNIT=1.0
BACKUP_KEEP_DAYS=14
EOF
  chmod 600 .env
else
  say ".env already exists; keeping it"
fi
PORT="$(grep -E '^GIZER_WEB_PORT=' .env | cut -d= -f2)"; PORT="${PORT:-3410}"

say "Building images and starting services (first build takes several minutes)"
docker compose up -d --build

say "Waiting for the application to become healthy"
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/v1/health/ready" 2>/dev/null | grep -q '"status":"ready"'; then
    docker compose ps --format 'table {{.Service}}\t{{.State}}\t{{.Status}}'
    say "Running on http://127.0.0.1:${PORT} (database, worker and scheduler are up)."
    cat <<EOF

Next steps:
  1. Load history (about two hours; run it inside tmux or screen):
       bash scripts/deploy.sh history
  2. Point the reverse proxy at 127.0.0.1:${PORT}:
       infrastructure/proxy/nginx-nba.gizergroup.com.conf   (or Caddyfile.snippet)
  3. Verify from outside:
       scripts/smoke.sh https://nba.gizergroup.com <email> <password>
EOF
    exit 0
  fi
  sleep 5
done
docker compose ps
die "The application did not become ready within 5 minutes. Check: docker compose logs --tail 80 migrate api worker scheduler"
