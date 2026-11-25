#!/usr/bin/env bash
# GIZER NBA — unattended updater for the server. Installed as a systemd timer by scripts/install-auto-update.sh.
#
#   bash scripts/auto-update.sh          # one check: deploy the release branch if it moved and its checks passed
#   bash scripts/auto-update.sh status   # show what is deployed and the last few log lines
#
# Safety rules (all enforced below):
#   * Only the `production` branch is deployed. `main` receives work in progress and is never deployed from.
#   * A commit is deployed only if every GitHub check on that exact commit completed successfully.
#   * Fast-forward only: it never moves the server to an older or unrelated commit, and never touches local changes.
#   * After the rebuild the app must report ready; otherwise the previous version is rebuilt and the failed
#     commit is remembered so it is not retried in a loop.
#   * It touches only this project's containers. It never edits the proxy, DNS or other applications.
main() {
  set -euo pipefail
  cd "$(dirname "$0")/.."
  local REPO="${GIZER_AU_REPO:-llamanftstaking-glitch/nba}" BRANCH="${GIZER_AU_BRANCH:-production}"
  local STATE=.auto-update LOG=.auto-update/update.log
  mkdir -p "$STATE"
  log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG"; }

  if [ "${1:-}" = "status" ]; then
    echo "deployed commit : $(git rev-parse --short HEAD)  $(git log -1 --format=%s)"
    echo "release branch  : $BRANCH"
    echo "last failed     : $(cat "$STATE/failed" 2>/dev/null || echo none)"
    echo "--- last log lines"; tail -n 15 "$LOG" 2>/dev/null || echo "(no log yet)"
    return 0
  fi

  exec 9>"$STATE/lock"
  flock -n 9 || { echo "another update is running"; return 0; }

  # The history load must outlive this (oneshot) service: systemd stops a service's child processes when the
  # service ends, so the loader is started as its own transient unit. nohup alone is not enough here.
  start_history() {
    pgrep -f "deploy.sh history" >/dev/null 2>&1 && return 0
    if command -v systemd-run >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
      systemctl reset-failed gizer-nba-history.service >/dev/null 2>&1 || true
      systemd-run --quiet --collect --unit gizer-nba-history --working-directory "$PWD" \
        /usr/bin/env bash -c 'exec bash scripts/deploy.sh history >> history.log 2>&1' \
        && log "history load started as its own job (gizer-nba-history)" \
        || log "could not start the history load (systemd-run failed)"
    else
      nohup bash scripts/deploy.sh history >> history.log 2>&1 < /dev/null &
      log "history load started in the background"
    fi
  }
  # Self-healing: if the history load has not finished and is not running, start it (it resumes).
  resume_history_if_needed() {
    [ -f "$STATE/history.done" ] && return 0
    docker compose ps --status running --services 2>/dev/null | grep -qx worker || return 0
    start_history
  }

  git fetch -q origin "$BRANCH" 2>/dev/null || { log "fetch failed (network or branch '$BRANCH' missing); nothing done"; return 0; }
  local cur new
  cur="$(git rev-parse HEAD)"; new="$(git rev-parse "origin/$BRANCH")"
  if [ "$cur" = "$new" ] || git merge-base --is-ancestor "$new" "$cur"; then   # already at or ahead of the release
    resume_history_if_needed; return 0
  fi
  if ! git merge-base --is-ancestor "$cur" "$new"; then
    log "release ${new:0:7} is not a fast-forward of deployed ${cur:0:7}; refusing (manual action needed)"; return 0
  fi
  [ "$(cat "$STATE/failed" 2>/dev/null)" = "$new" ] && return 0   # this commit already failed once; wait for a newer one
  if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    log "tracked files were changed on the server; refusing to update over them"; return 0
  fi

  # Gate: every check on this exact commit must have completed successfully.
  local verdict
  verdict="$(curl -fsS -m 30 -H 'Accept: application/vnd.github+json' \
      "${GIZER_AU_API:-https://api.github.com}/repos/$REPO/commits/$new/check-runs?per_page=100" 2>/dev/null \
    | python3 -c '
import json, sys
try:
    runs = json.load(sys.stdin).get("check_runs", [])
except Exception:
    print("unreadable"); raise SystemExit
if not runs:
    print("no-checks")
elif any(r.get("status") != "completed" for r in runs):
    print("pending")
elif all(r.get("conclusion") in ("success", "skipped", "neutral") for r in runs):
    print("passed")
else:
    print("failed")' 2>/dev/null || echo unreadable)"
  case "$verdict" in
    passed) ;;
    pending|no-checks|unreadable) log "release ${new:0:7}: checks $verdict; waiting"; return 0 ;;
    *) log "release ${new:0:7}: checks $verdict; NOT deploying"; echo "$new" > "$STATE/failed"; return 0 ;;
  esac

  local history_running=no
  pgrep -f "deploy.sh history" >/dev/null 2>&1 && history_running=yes
  log "deploying ${cur:0:7} -> ${new:0:7} ($(git log -1 --format=%s "$new"))"
  if [ "$history_running" = yes ]; then
    systemctl stop gizer-nba-history.service >/dev/null 2>&1 || true
    pkill -f "deploy.sh history" || true
  fi
  git merge -q --ff-only "$new"

  local port; port="$( (grep -E '^GIZER_WEB_PORT=' .env 2>/dev/null || true) | cut -d= -f2)"; port="${port:-3410}"
  local health="${GIZER_AU_HEALTH_URL:-http://127.0.0.1:${port}/api/v1/health/ready}"
  ready() {
    local i
    for i in $(seq 1 "${GIZER_AU_HEALTH_TRIES:-60}"); do
      curl -fsS -m 8 "$health" 2>/dev/null | grep -q '"status":"ready"' && return 0
      sleep "${GIZER_AU_HEALTH_SLEEP:-5}"
    done
    return 1
  }
  if docker compose up -d --build >> "$LOG" 2>&1 && ready; then
    log "deployed ${new:0:7}: application is ready"
    rm -f "$STATE/failed"
  else
    log "release ${new:0:7} did not become ready; rebuilding previous version ${cur:0:7}"
    echo "$new" > "$STATE/failed"
    git reset -q --hard "$cur"
    if docker compose up -d --build >> "$LOG" 2>&1 && ready; then
      log "rolled back to ${cur:0:7}: application is ready (database migrations are not reversed)"
    else
      log "ROLLBACK DID NOT BECOME READY — manual attention needed: docker compose ps; docker compose logs --tail 80"
    fi
  fi
  resume_history_if_needed   # it resumes; nothing already loaded is fetched again
  # keep the log bounded
  tail -n 2000 "$LOG" > "$LOG.tmp" 2>/dev/null && cat "$LOG.tmp" > "$LOG" && rm -f "$LOG.tmp"
}
# The whole script is parsed before it runs, so updating this file during a deploy cannot corrupt the run.
main "$@"; exit $?
