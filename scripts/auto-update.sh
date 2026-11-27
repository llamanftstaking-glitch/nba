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
#   * Images come from the registry: GitHub Actions builds and pushes them for every commit on `main`, and this
#     script pulls the two images for the exact commit it deploys. If that is not possible for any reason
#     (not signed in, registry down, image missing) it builds on this machine instead, as it always did.
#   * After the restart the app must report ready; otherwise the previous version is restored (pulled if its
#     images exist, else rebuilt) and the failed commit is remembered so it is not retried in a loop.
#   * It touches only this project's containers. It never edits the proxy, DNS or other applications.
main() {
  set -euo pipefail
  cd "$(dirname "$0")/.."
  local REPO="${GIZER_AU_REPO:-llamanftstaking-glitch/nba}" BRANCH="${GIZER_AU_BRANCH:-production}"
  local STATE=.auto-update LOG=.auto-update/update.log
  mkdir -p "$STATE"
  log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG"; }
  # Pull-or-build helpers. Loaded in full before anything changes on disk, so a deploy that updates the
  # file cannot affect this run.
  # shellcheck source=scripts/lib-images.sh
  . scripts/lib-images.sh

  if [ "${1:-}" = "status" ]; then
    echo "deployed commit : $(git rev-parse --short HEAD)  $(git log -1 --format=%s)"
    echo "release branch  : $BRANCH"
    echo "last failed     : $(cat "$STATE/failed" 2>/dev/null || echo none)"
    echo "last deploy used: $(cat "$STATE/images" 2>/dev/null || echo "unknown (no deploy by this version yet)")"
    gi_fix_home
    local head_sha api_ref cid img rev probe
    head_sha="$(git rev-parse HEAD)"; api_ref="$(gi_ref api "$head_sha")"
    echo "registry images : $(gi_prefix)-api, $(gi_prefix)-web (tag = full commit id)"
    if [ -n "${GIZER_AU_NO_PULL:-}" ] || [ -f "$STATE/no-pull" ]; then
      echo "registry pulls  : switched off on this machine (remove $STATE/no-pull to switch on)"
    elif probe="$(timeout -k 5 25 docker manifest inspect "$api_ref" 2>&1 >/dev/null)"; then
      echo "registry pulls  : working (image for the deployed commit is readable)"
    else
      probe="$(printf '%s' "$probe" | tail -n 1 | cut -c1-160)"
      echo "registry pulls  : NOT working for the deployed commit (${probe:-timed out}); releases build on this machine"
    fi
    cid="$(docker compose ps -q api 2>/dev/null | head -n 1 || true)"
    if [ -n "$cid" ]; then
      img="$(docker inspect --format '{{.Config.Image}} ({{.Image}})' "$cid" 2>/dev/null || echo unknown)"
      rev="$(docker inspect --format '{{.Image}}' "$cid" 2>/dev/null \
        | xargs -r docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || true)"
      echo "api container   : $img"
      if [ -n "$rev" ]; then echo "                  built by GitHub Actions from commit ${rev:0:7}"
      else echo "                  built on this machine (no commit label)"; fi
    else
      echo "api container   : not running"
    fi
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

  # Private repository: a read-only GitHub token kept in a root-only file on the server (never in the repository,
  # never printed). It is passed to git through environment variables and to curl through a file descriptor, so it
  # does not appear in the process list. Without the file the script works as before (public repository).
  local TOKEN_FILE="${GIZER_AU_TOKEN_FILE:-/etc/gizer-nba/github-token}" GH_TOKEN=""
  if [ -r "$TOKEN_FILE" ]; then GH_TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"; fi
  if [ -n "$GH_TOKEN" ]; then
    export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0="http.https://github.com/.extraheader"
    GIT_CONFIG_VALUE_0="Authorization: Basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 | tr -d '\n')"
    export GIT_CONFIG_VALUE_0
  fi
  gh_auth() { if [ -n "$GH_TOKEN" ]; then printf 'Authorization: Bearer %s\n' "$GH_TOKEN"; fi; }

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
  verdict="$(curl -fsS -m 30 -H 'Accept: application/vnd.github+json' -H @<(gh_auth) \
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
  # gi_up pulls the two images CI pushed for that commit and starts them without building; when it cannot,
  # it logs the reason and runs `docker compose up -d --build` exactly as before.
  local GI_OUT="$LOG"
  if gi_up "$new" && ready; then
    log "deployed ${new:0:7}: application is ready (images $GI_PATH)"
    echo "$GI_PATH ${new:0:7} $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$STATE/images"
    rm -f "$STATE/failed"
  else
    log "release ${new:0:7} did not become ready; restoring previous version ${cur:0:7}"
    echo "$new" > "$STATE/failed"
    git reset -q --hard "$cur"
    if gi_up "$cur" && ready; then
      log "rolled back to ${cur:0:7}: application is ready (images $GI_PATH; database migrations are not reversed)"
    else
      log "ROLLBACK DID NOT BECOME READY — manual attention needed: docker compose ps; docker compose logs --tail 80"
    fi
    echo "$GI_PATH ${cur:0:7} $(date -u +%Y-%m-%dT%H:%M:%SZ) (rollback)" > "$STATE/images"
  fi
  gi_cleanup "$cur" "$new"   # keep this release and the one before it; other projects' images are never touched
  if [ -f "$STATE/history.done" ]; then log "history load: finished earlier ($(cat "$STATE/history.done"))"
  else log "history load: not finished; resuming it"; fi
  resume_history_if_needed   # it resumes; nothing already loaded is fetched again
  # keep the log bounded
  tail -n 2000 "$LOG" > "$LOG.tmp" 2>/dev/null && cat "$LOG.tmp" > "$LOG" && rm -f "$LOG.tmp"
}
# The whole script is parsed before it runs, so updating this file during a deploy cannot corrupt the run.
main "$@"; exit $?
