#!/usr/bin/env bash
# Manual update on the server, after `git pull`:   bash scripts/update.sh
# Rebuilds and restarts the application, runs the fast first pass (slate, injuries, lineups, Kalshi, edition)
# and resumes the history load if it is not finished. Safe to run repeatedly.
main() {
  set -euo pipefail
  cd "$(dirname "$0")/.."
  say() { printf '\n==> %s\n' "$*"; }
  if pgrep -f "deploy.sh history" >/dev/null 2>&1; then
    say "Pausing the history load (it resumes afterwards; nothing loaded is lost)"
    pkill -f "deploy.sh history" || true
  fi
  say "Rebuilding and restarting (several minutes)"
  docker compose up -d --build
  local port; port="$( (grep -E '^GIZER_WEB_PORT=' .env 2>/dev/null || true) | cut -d= -f2)"; port="${port:-3410}"
  say "Waiting for the application to become ready"
  local ok=no i
  for i in $(seq 1 60); do
    if curl -fsS -m 8 "http://127.0.0.1:${port}/api/v1/health/ready" 2>/dev/null | grep -q '"status":"ready"'; then ok=yes; break; fi
    sleep 5
  done
  [ "$ok" = yes ] || { docker compose ps; echo "ERROR: not ready after 5 minutes. Check: docker compose logs --tail 80 migrate api worker"; exit 1; }
  say "Fast first pass: today's slate, injuries, projected lineups, Kalshi markets, research edition"
  docker compose exec -T worker gizer quickstart || echo "(first pass reported an error; the scheduled jobs will retry)"
  say "Resuming the history load in the background (progress: tail -n 5 history.log)"
  nohup bash scripts/deploy.sh history >> history.log 2>&1 < /dev/null &
  say "Update finished. Deployed: $(git rev-parse --short HEAD)"
}
main "$@"; exit $?
