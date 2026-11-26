#!/usr/bin/env bash
# GIZER NBA — release images: pull what GitHub Actions built, or build on this machine.
# Sourced by scripts/auto-update.sh and scripts/update.sh (it does nothing when run directly).
# The caller defines `log` (one line of text per call) and runs from the repository root.
#
# How it works
#   * CI pushes two images per commit on `main`:  <prefix>-api:<full sha>  and  <prefix>-web:<full sha>
#     (prefix defaults to ghcr.io/llamanftstaking-glitch/nba).
#   * gi_up <sha> pulls both, checks each really is that commit and fits this machine, then gives them the
#     image names docker-compose.yml already uses (by default gizer-nba-api:local / gizer-nba-web:local) and
#     starts the stack without building. Because the compose names are reused, every later plain
#     `docker compose ...` command on the server keeps using the release that was deployed.
#   * If anything about that is not possible, it says why and runs `docker compose up -d --build`.
#
# Settings (all optional):
#   GIZER_IMAGE_PREFIX      registry path without the -api / -web suffix
#   GIZER_AU_NO_PULL=1      never pull (same as creating the file .auto-update/no-pull)
#   GIZER_AU_PULL_TIMEOUT   seconds allowed for one image pull (default 300)
#   GIZER_AU_PULL_TRIES     attempts when the image is not there yet or the network hiccups (default 3)
#   GIZER_AU_PULL_SLEEP     seconds between attempts (default 20)

GI_REASON=""        # why registry images could not be used (set by the functions below)
GI_PATH=""          # "pulled" or "built": what the last gi_up did
GI_FETCHED=0        # images downloaded by the last gi_obtain (0 = they were already on this machine)
GI_REGISTRY_OFF=0   # 1 after a sign-in failure or a timeout: no further pull attempts in this run

gi_prefix() {
  local repo="${GIZER_AU_REPO:-llamanftstaking-glitch/nba}"
  printf '%s' "${GIZER_IMAGE_PREFIX:-ghcr.io/${repo,,}}"
}
gi_ref() { printf '%s-%s:%s' "$(gi_prefix)" "$1" "$2"; }   # gi_ref api|web <sha>

# The docker client looks for the registry sign-in under $HOME/.docker; a systemd service has no HOME.
gi_fix_home() {
  [ -n "${HOME:-}" ] && return 0
  local h; h="$(getent passwd "$(id -u)" 2>/dev/null | cut -d: -f6)"
  export HOME="${h:-/root}"
}

# Is this image on this machine, built from exactly this commit, for this machine's processor type?
gi_verify() {
  local ref="$1" sha="$2" got rev arch want
  got="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}} {{.Architecture}}' "$ref" 2>/dev/null)" \
    || { GI_REASON="image not on this machine"; return 1; }
  rev="${got%% *}"; arch="${got##* }"
  [ "$rev" = "$sha" ] || { GI_REASON="${ref##*/} is not labelled as commit ${sha:0:7}"; return 1; }
  want="$(docker version --format '{{.Server.Arch}}' 2>/dev/null || true)"
  if [ -n "$want" ] && [ "$arch" != "$want" ]; then
    GI_REASON="${ref##*/} was built for $arch, this machine is $want"; return 1
  fi
  return 0
}

gi_pull() {
  local ref="$1" tries="${GIZER_AU_PULL_TRIES:-3}" secs="${GIZER_AU_PULL_TIMEOUT:-300}" i out rc
  for i in $(seq 1 "$tries"); do
    rc=0; out="$(timeout -k 10 "$secs" docker pull -q "$ref" 2>&1)" || rc=$?
    [ "$rc" = 0 ] && return 0
    if [ "$rc" = 124 ] || [ "$rc" = 137 ]; then
      GI_REASON="pulling ${ref##*/} took longer than ${secs}s"; GI_REGISTRY_OFF=1; return 1
    fi
    case "$out" in
      *unauthorized*|*denied*|*"authentication required"*|*"no basic auth"*)
        GI_REASON="this machine is not signed in to the registry or has no access (see RUNBOOK: docker login ghcr.io)"
        GI_REGISTRY_OFF=1; return 1 ;;
      *"manifest unknown"*|*"not found"*)
        GI_REASON="no image published for commit ${ref##*:}" ;;
      *)
        out="$(printf '%s' "$out" | tail -n 1 | tr -d '\r' | cut -c1-160)"
        GI_REASON="pull failed: ${out:-exit code $rc}" ;;
    esac
    [ "$i" -lt "$tries" ] && sleep "${GIZER_AU_PULL_SLEEP:-20}"
  done
  return 1
}

# Make both images for <sha> present and verified on this machine. Returns 1 with GI_REASON otherwise.
gi_obtain() {
  local sha="$1" part ref
  GI_REASON=""; GI_FETCHED=0
  if [ -n "${GIZER_AU_NO_PULL:-}" ] || [ -f .auto-update/no-pull ]; then
    GI_REASON="pulling is switched off on this machine"; return 1
  fi
  gi_fix_home
  for part in api web; do
    ref="$(gi_ref "$part" "$sha")"
    gi_verify "$ref" "$sha" && continue          # already here (for example the previous release)
    if [ "$GI_REGISTRY_OFF" = 1 ]; then
      GI_REASON="registry not usable earlier in this run"; return 1
    fi
    gi_pull "$ref" || return 1
    gi_verify "$ref" "$sha" || return 1
    GI_FETCHED=$((GI_FETCHED + 1))
  done
  GI_REASON=""
  return 0
}

# The image names docker compose will start: line 1 = api family, line 2 = web. Honours .env and the
# server's docker-compose.override.yml. Prints nothing and fails if they cannot be read.
gi_targets() {
  docker compose config --format json 2>/dev/null | python3 -c '
import json, sys
s = json.load(sys.stdin)["services"]
api = {s[n]["image"] for n in ("migrate", "api", "worker", "research-worker", "scheduler", "live") if n in s}
if len(api) != 1 or not s["web"]["image"]:
    raise SystemExit(1)
print(api.pop()); print(s["web"]["image"])' 2>/dev/null
}

# Start the stack on <sha>: registry images when possible, otherwise build here. Compose output goes to
# $GI_OUT (default: the terminal). Returns the exit code of `docker compose up`.
gi_up() {
  local sha="$1" out="${GI_OUT:-/dev/stdout}" targets api_t web_t prefix
  GI_PATH=built; prefix="$(gi_prefix)"
  if gi_obtain "$sha"; then
    targets="$(gi_targets)" || targets=""
    api_t="$(printf '%s\n' "$targets" | sed -n 1p)"; web_t="$(printf '%s\n' "$targets" | sed -n 2p)"
    if [ -z "$api_t" ] || [ -z "$web_t" ]; then
      GI_REASON="could not read the image names from docker compose"
    elif [ "${api_t%:*}" = "$prefix-api" ] || [ "${web_t%:*}" = "$prefix-web" ]; then
      # Someone pinned compose to a registry tag; giving that tag another commit's image would be a lie.
      GI_REASON="docker compose is pinned to a registry tag on this machine (GIZER_API_IMAGE / GIZER_WEB_IMAGE are set)"
    elif docker tag "$(gi_ref api "$sha")" "$api_t" && docker tag "$(gi_ref web "$sha")" "$web_t"; then
      GI_PATH=pulled
      if [ "$GI_FETCHED" -gt 0 ]; then log "pulled images for ${sha:0:7}; starting without a build"
      else log "registry images for ${sha:0:7} already on this machine; starting without a build"; fi
      docker compose up -d --no-build >> "$out" 2>&1
      return $?
    else
      GI_REASON="could not tag the pulled images"
    fi
  fi
  log "registry images unavailable (${GI_REASON:-unknown reason}); building on this machine"
  docker compose up -d --build >> "$out" 2>&1
}

# Remove old release tags of THIS project's two registry repositories only; keep the commits given.
# Never touches other repositories, other projects, the compose image names, or untagged images.
gi_cleanup() {
  local part repo line tag k keep removed=0 targets
  targets="$(gi_targets)" || targets=""
  for part in api web; do
    repo="$(gi_prefix)-$part"
    while IFS= read -r line; do
      [ "${line%:*}" = "$repo" ] || continue
      tag="${line##*:}"
      [ -n "$tag" ] && [ "$tag" != "<none>" ] || continue
      keep=no
      for k in "$@"; do [ "$tag" = "$k" ] && keep=yes; done
      printf '%s\n' "$targets" | grep -qxF -- "$line" && keep=yes     # a name docker compose starts
      [ "$keep" = yes ] && continue
      docker image rm "$line" >/dev/null 2>&1 && removed=$((removed + 1))
    done < <(docker image ls --format '{{.Repository}}:{{.Tag}}' "$repo" 2>/dev/null || true)
  done
  [ "$removed" -gt 0 ] && log "removed $removed old release image tag(s) of this project"
  return 0
}
