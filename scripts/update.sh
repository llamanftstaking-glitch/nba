#!/usr/bin/env bash
# Manual update on the server, after `git pull`:   bash scripts/update.sh
# Updates and restarts the application (pulls the images GitHub Actions built for the checked-out commit when
# they are available, otherwise builds here; `GIZER_AU_NO_PULL=1 bash scripts/update.sh` forces a build), runs the fast first pass (slate, injuries, lineups, Kalshi, edition)
# and resumes the history load if it is not finished. Safe to run repeatedly.
main() {
  set -euo pipefail
  cd "$(dirname "$0")/.."
  say() { printf '\n==> %s\n' "$*"; }
  if pgrep -f "deploy.sh history" >/dev/null 2>&1; then
    say "Pausing the history load (it resumes afterwards; nothing loaded is lost)"
    pkill -f "deploy.sh history" || true
  fi
  log() { printf '%s\n' "$*"; }
  # shellcheck source=scripts/lib-images.sh
  . scripts/lib-images.sh
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    say "Tracked files differ from the commit, so published images would not match: building here (several minutes)"
    docker compose up -d --build
  else
    say "Updating to $(git rev-parse --short HEAD) and restarting (seconds to a minute when images can be pulled, several minutes when building)"
    gi_up "$(git rev-parse HEAD)"
  fi
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
