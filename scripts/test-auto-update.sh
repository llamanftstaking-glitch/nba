#!/usr/bin/env bash
# Rehearsal of scripts/auto-update.sh, scripts/update.sh and scripts/lib-images.sh. Safe to run anywhere:
#   bash scripts/test-auto-update.sh          # prints one line per check, exits 1 if any failed
#   KEEP=1 bash scripts/test-auto-update.sh   # keep the temporary directory for inspection
#
# What is real: git (a throwaway origin and a throwaway "server" clone in a temp directory), bash, flock,
# timeout, python3, and the scripts under test exactly as they are in this working tree.
# What is a stub: docker, curl, pgrep, pkill, systemctl, systemd-run, nohup (placed first on PATH). The docker
# stub keeps a pretend registry and a pretend local image store in text files. So this proves the decision
# logic (when to pull, when to build, rollback, cleanup, the release gate); it does NOT prove behaviour of a
# real Docker engine, the real registry or Server M.
set -uo pipefail
SRC="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d "${TMPDIR:-/tmp}/gizer-au-test.XXXXXX")"
[ -n "${KEEP:-}" ] || trap 'rm -rf "$T"' EXIT
PASS=0; FAIL=0
PFX=ghcr.io/llamanftstaking-glitch/nba

ok()   { PASS=$((PASS + 1)); printf '  ok    %s\n' "$1"; }
bad()  { FAIL=$((FAIL + 1)); printf '  FAIL  %s\n' "$1"; }
check() { local d="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$d"; else bad "$d"; fi; }
no()   { ! "$@"; }
logged()  { grep -qF -- "$1" "$T/server/.auto-update/update.log"; }
called()  { grep -qE -- "$1" "$T/state/calls.log"; }
has_img() { grep -q "^$1 " "$T/state/local"; }
img_id()  { awk -v r="$1" '$1==r{print $2}' "$T/state/local"; }

mkdir -p "$T/bin"
cat > "$T/bin/docker" <<'STUB'
#!/usr/bin/env bash
# Pretend docker. Files in $S: registry (ref rev arch) · local (ref id rev arch) · running (commit the "app"
# runs) · pull_mode (ok|denied|slow) · calls.log
S="$GIZER_TEST_STATE"; echo "docker $*" >> "$S/calls.log"
lookup() { awk -v r="$1" '$1==r{print; f=1} END{exit !f}' "$S/local"; }
unset_ref() { awk -v r="$1" '$1!=r' "$S/local" > "$S/local.tmp"; mv "$S/local.tmp" "$S/local"; }
case "${1:-} ${2:-}" in
  "pull -q")
    case "$(cat "$S/pull_mode")" in
      denied) echo "Error response from daemon: Head \"https://ghcr.io/v2/x/manifests/y\": denied" >&2; exit 1 ;;
      slow) sleep 5; exit 1 ;;
    esac
    line="$(awk -v r="$3" '$1==r' "$S/registry")"
    [ -n "$line" ] || { echo "Error response from daemon: manifest unknown" >&2; exit 1; }
    set -- $line; unset_ref "$1"; echo "$1 reg-$2 $2 $3" >> "$S/local"; echo "$1" ;;
  "image inspect")
    ref="${*: -1}"; line="$(lookup "$ref")" || { echo "Error: No such image: $ref" >&2; exit 1; }
    set -- $line
    case "$3" in none) rev="" ;; *) rev="$3" ;; esac
    echo "$rev $4" ;;
  "version --format") echo amd64 ;;
  "tag "*)
    line="$(lookup "$2")" || exit 1
    set -- $line "$3"; unset_ref "$5"; echo "$5 $2 $3 $4" >> "$S/local" ;;
  "image ls") repo="${*: -1}"; awk -v p="$repo:" 'index($1,p)==1{print $1}' "$S/local" ;;
  "image rm") lookup "$3" >/dev/null || exit 1; unset_ref "$3" ;;
  "manifest inspect") grep -q "^$3 " "$S/registry" || { echo "denied" >&2; exit 1; } ;;
  "inspect "*) case "$3" in *Config.Image*) echo "gizer-nba-api:local (sha256:stub)" ;; *) sed -n 1p "$S/targets" ;; esac ;;
  "compose config")
    printf '{"services":{' ; for n in migrate api worker research-worker scheduler live; do printf '"%s":{"image":"%s"},' "$n" "$(sed -n 1p "$S/targets")"; done
    printf '"web":{"image":"%s"},"postgres":{"image":"postgres:16.6-alpine"}}}\n' "$(sed -n 2p "$S/targets")" ;;
  "compose up")
    api_t="$(sed -n 1p "$S/targets")"; web_t="$(sed -n 2p "$S/targets")"
    case " $* " in
      *" --build "*)
        head="$(git rev-parse HEAD)"
        for t in "$api_t" "$web_t"; do unset_ref "$t"; echo "$t built-$head none amd64" >> "$S/local"; done
        echo "$head" > "$S/running" ;;
      *)
        line="$(lookup "$api_t")" || { echo "no such image: $api_t" >&2; exit 1; }
        lookup "$web_t" >/dev/null || { echo "no such image: $web_t" >&2; exit 1; }
        set -- $line; echo "${2#reg-}" | sed 's/^built-//' > "$S/running" ;;
    esac ;;
  "compose ps") case " $* " in *" -q "*) echo stubcontainer ;; esac ;;
  "compose exec") : ;;
  *) echo "docker stub: unhandled: $*" >&2; exit 97 ;;
esac
STUB
cat > "$T/bin/curl" <<'STUB'
#!/usr/bin/env bash
S="$GIZER_TEST_STATE"; url="${*: -1}"; echo "curl $url" >> "$S/calls.log"
for a in "$@"; do case "$a" in @*) h="$(cat "${a#@}" 2>/dev/null)"; case "$h" in "Authorization: Bearer "*) echo "curl-auth ${h#Authorization: Bearer }" >> "$S/calls.log" ;; esac ;; esac; done
printf '%s\n' "$*" | grep -q 'Bearer' && echo "TOKEN-IN-ARGV" >> "$S/calls.log"
case "$url" in
  *check-runs*) cat "$S/checks.json" ;;
  *health/ready*) if grep -qxF "$(cat "$S/running" 2>/dev/null)" "$S/bad"; then echo '{"status":"starting"}'; else echo '{"status":"ready"}'; fi ;;
  *) exit 22 ;;
esac
STUB
printf '#!/usr/bin/env bash\nexit 1\n' > "$T/bin/pgrep"
for c in pkill systemctl systemd-run nohup; do printf '#!/usr/bin/env bash\nexit 0\n' > "$T/bin/$c"; done
chmod +x "$T/bin/"*

g() { git -c user.name=test -c user.email=test@example.invalid -c init.defaultBranch=main -c commit.gpgsign=false "$@"; }
commit() { ( cd "$T/work" && echo "$1" > version.txt && g add -A && g commit -qm "$1" && g -c push.negotiate=false push -q origin HEAD:production 2>/dev/null && git rev-parse HEAD ); }

# A fresh origin, a "server" clone deployed at commit A, and release B waiting on origin/production.
setup() {
  rm -rf "$T/origin.git" "$T/work" "$T/server" "$T/state"; mkdir -p "$T/state"
  g init -q --bare "$T/origin.git"; g init -q "$T/work"
  mkdir -p "$T/work/scripts"
  cp "$SRC/scripts/auto-update.sh" "$SRC/scripts/update.sh" "$SRC/scripts/lib-images.sh" "$SRC/scripts/deploy.sh" "$T/work/scripts/"
  cp "$SRC/docker-compose.yml" "$T/work/"; printf '.auto-update/\nhistory.log\n.env\n' > "$T/work/.gitignore"
  ( cd "$T/work" && g remote add origin "$T/origin.git" )
  A="$(commit release-A)"
  g clone -q -b production "$T/origin.git" "$T/server" 2>/dev/null
  B="$(commit release-B)"
  mkdir -p "$T/server/.auto-update"; date > "$T/server/.auto-update/history.done"
  : > "$T/state/calls.log"; : > "$T/state/bad"; echo ok > "$T/state/pull_mode"
  printf 'gizer-nba-api:local\ngizer-nba-web:local\n' > "$T/state/targets"
  echo '{"check_runs":[{"status":"completed","conclusion":"success"},{"status":"completed","conclusion":"success"}]}' > "$T/state/checks.json"
  # the server currently runs a locally built A; other projects' images share the machine
  cat > "$T/state/local" <<EOF
gizer-nba-api:local built-$A none amd64
gizer-nba-web:local built-$A none amd64
postgres:16.6-alpine pg none amd64
ghcr.io/other-owner/other-app:1.0 other none amd64
$PFX-apiserver:keepme lookalike none amd64
EOF
  echo "$A" > "$T/state/running"; : > "$T/state/registry"
}
publish() { local s; for s in "$@"; do printf '%s-api:%s %s amd64\n%s-web:%s %s amd64\n' "$PFX" "$s" "$s" "$PFX" "$s" "$s" >> "$T/state/registry"; done; }
run() {   # run <script> [args]: as the server would, with the stubs first on PATH
  ( cd "$T/server" && env -u HOME PATH="$T/bin:$PATH" GIZER_TEST_STATE="$T/state" GIZER_AU_API=http://github.invalid \
      GIZER_AU_HEALTH_TRIES=2 GIZER_AU_HEALTH_SLEEP=0 GIZER_AU_PULL_SLEEP=0 GIZER_AU_PULL_TRIES=3 ${EXTRA_ENV:-} \
      bash "scripts/$1" "${@:2}" ) > "$T/state/out.txt" 2>&1
}
head_is() { [ "$(git -C "$T/server" rev-parse HEAD)" = "$1" ]; }
show_log() { sed 's/^[0-9TZ:-]* /      | /' "$T/server/.auto-update/update.log" 2>/dev/null; }

echo "1. images published, machine can pull -> no build"
setup; publish "$B"; run auto-update.sh; show_log
check "server moved to release B" head_is "$B"
check "both images were pulled by commit id" called "docker pull -q $PFX-(api|web):$B"
check "started with --no-build" called "docker compose up -d --no-build"
check "never built" no called "compose up -d --build"
check "log says images were pulled" logged "pulled images for ${B:0:7}"
check "compose image name now points at the registry image" [ "$(img_id gizer-nba-api:local)" = "reg-$B" ]
check "web compose image name too" [ "$(img_id gizer-nba-web:local)" = "reg-$B" ]
check "app runs B and is ready" logged "deployed ${B:0:7}: application is ready (images pulled)"
check "no failed marker" [ ! -e "$T/server/.auto-update/failed" ]

echo "2. machine not signed in to the registry -> build, as before"
setup; publish "$B"; echo denied > "$T/state/pull_mode"; run auto-update.sh; show_log
check "server moved to release B" head_is "$B"
check "fell back to --build" called "docker compose up -d --build"
check "log gives the reason" logged "registry images unavailable (this machine is not signed in"
check "log says it built here" logged "building on this machine"
check "did not retry a sign-in failure" [ "$(grep -c 'docker pull' "$T/state/calls.log")" = 1 ]
check "deployed and ready" logged "deployed ${B:0:7}: application is ready (images built)"

echo "3. image missing for this commit -> retries, then build"
setup; run auto-update.sh; show_log
check "tried 3 times" [ "$(grep -c 'docker pull' "$T/state/calls.log")" = 3 ]
check "fell back to --build" called "docker compose up -d --build"
check "log gives the reason" logged "no image published for commit $B"
check "deployed and ready" head_is "$B"

echo "4. only one of the two images exists -> build (never a mixed release)"
setup; printf '%s-api:%s %s amd64\n' "$PFX" "$B" "$B" >> "$T/state/registry"; run auto-update.sh; show_log
check "fell back to --build" called "docker compose up -d --build"
check "did not start without a build" no called "up -d --no-build"

echo "5. image labelled for a different commit / other processor type -> build"
setup; printf '%s-api:%s %s amd64\n%s-web:%s %s amd64\n' "$PFX" "$B" "$A" "$PFX" "$B" "$A" >> "$T/state/registry"; run auto-update.sh
check "wrong commit label: built instead" called "docker compose up -d --build"
check "wrong commit label: reason logged" logged "is not labelled as commit ${B:0:7}"
setup; printf '%s-api:%s %s arm64\n%s-web:%s %s arm64\n' "$PFX" "$B" "$B" "$PFX" "$B" "$B" >> "$T/state/registry"; run auto-update.sh; show_log
check "wrong processor type: built instead" called "docker compose up -d --build"
check "wrong processor type: reason logged" logged "was built for arm64, this machine is amd64"

echo "6. pulled release never becomes ready -> rollback pulls the previous commit"
setup; publish "$A" "$B"; echo "$B" > "$T/state/bad"; run auto-update.sh; show_log
check "server is back on A" head_is "$A"
check "previous images pulled by commit id" called "docker pull -q $PFX-api:$A"
check "never built" no called "compose up -d --build"
check "compose image name points at A again" [ "$(img_id gizer-nba-api:local)" = "reg-$A" ]
check "rollback logged as ready" logged "rolled back to ${A:0:7}: application is ready (images pulled"
check "failed release remembered" [ "$(cat "$T/server/.auto-update/failed")" = "$B" ]
: > "$T/state/calls.log"; run auto-update.sh
check "next run does not retry the failed release" no called "docker (pull|compose up)"

echo "7. pulled release never becomes ready, previous commit has no image -> rollback builds"
setup; publish "$B"; echo "$B" > "$T/state/bad"; run auto-update.sh; show_log
check "server is back on A" head_is "$A"
check "rollback used --build" called "docker compose up -d --build"
check "app runs A again" [ "$(cat "$T/state/running")" = "$A" ]
check "rollback logged as ready" logged "rolled back to ${A:0:7}: application is ready (images built"

echo "8. build fallback fails health too, registry signed out -> rollback builds, one pull attempt in the whole run"
setup; echo denied > "$T/state/pull_mode"; echo "$B" > "$T/state/bad"; run auto-update.sh; show_log
check "server is back on A" head_is "$A"
check "two builds (release, then rollback)" [ "$(grep -c 'compose up -d --build' "$T/state/calls.log")" = 2 ]
check "registry not asked again during rollback" [ "$(grep -c 'docker pull' "$T/state/calls.log")" = 1 ]

echo "9. cleanup keeps this release and the previous one, and nothing of other projects is touched"
setup; O1=1111111111111111111111111111111111111111; O2=2222222222222222222222222222222222222222
publish "$A" "$B"
for s in "$O1" "$O2" "$A"; do for p in api web; do echo "$PFX-$p:$s reg-$s $s amd64" >> "$T/state/local"; done; done
run auto-update.sh; show_log
check "old tag 1 removed (api)" no has_img "$PFX-api:$O1"
check "old tag 2 removed (web)" no has_img "$PFX-web:$O2"
check "current release kept" has_img "$PFX-api:$B"
check "previous release kept" has_img "$PFX-web:$A"
check "other project's registry image untouched" has_img "ghcr.io/other-owner/other-app:1.0"
check "similarly named repository untouched" has_img "$PFX-apiserver:keepme"
check "postgres untouched" has_img "postgres:16.6-alpine"
check "compose image names untouched" has_img "gizer-nba-api:local"
check "only this project's two repositories were ever passed to image rm" no grep -vE "^docker image rm $PFX-(api|web):" <(grep 'image rm' "$T/state/calls.log")
check "no prune command of any kind" no called "prune"
check "cleanup logged" logged "removed 4 old release image tag(s)"

echo "10. release gate unchanged: nothing is pulled or started unless every check passed"
setup; publish "$B"; echo '{"check_runs":[{"status":"in_progress","conclusion":null},{"status":"completed","conclusion":"success"}]}' > "$T/state/checks.json"; run auto-update.sh; show_log
check "checks pending: still on A" head_is "$A"
check "checks pending: no docker pull or up" no called "docker (pull|compose up|tag)"
setup; publish "$B"; echo '{"check_runs":[{"status":"completed","conclusion":"failure"}]}' > "$T/state/checks.json"; run auto-update.sh; show_log
check "checks failed: still on A" head_is "$A"
check "checks failed: no docker pull or up" no called "docker (pull|compose up|tag)"
check "checks failed: release remembered" [ "$(cat "$T/server/.auto-update/failed")" = "$B" ]
setup; publish "$B"; echo 'local edit' >> "$T/server/version.txt"; run auto-update.sh
check "local changes on the server: refuses" logged "refusing to update over them"
check "local changes on the server: no docker pull or up" no called "docker (pull|compose up|tag)"
setup; publish "$B"; ( cd "$T/work" && g checkout -q --orphan other && g commit -qm unrelated && g -c push.negotiate=false push -qf origin HEAD:production 2>/dev/null ); run auto-update.sh
check "not a fast-forward: refuses" logged "is not a fast-forward"
check "not a fast-forward: no docker pull or up" no called "docker (pull|compose up|tag)"

echo "11. forcing a local build"
setup; publish "$B"; touch "$T/server/.auto-update/no-pull"; run auto-update.sh; show_log
check "no-pull file: built, no pull" called "docker compose up -d --build"
check "no-pull file: registry never contacted" no called "docker pull"
check "no-pull file: reason logged" logged "pulling is switched off on this machine"

echo "12. compose pinned to a registry tag in .env -> updater does not re-point it"
setup; publish "$B"; printf '%s-api:pinned\n%s-web:pinned\n' "$PFX" "$PFX" > "$T/state/targets"; run auto-update.sh; show_log
check "built instead of re-tagging" called "docker compose up -d --build"
check "no docker tag" no called "docker tag"
check "reason logged" logged "docker compose is pinned to a registry tag"
check "the pinned names survive cleanup" has_img "$PFX-api:pinned"

echo "13. slow registry -> bounded by the timeout, then build"
setup; publish "$B"; echo slow > "$T/state/pull_mode"; EXTRA_ENV="GIZER_AU_PULL_TIMEOUT=1" run auto-update.sh; show_log
check "timed out once, no retries" [ "$(grep -c 'docker pull' "$T/state/calls.log")" = 1 ]
check "reason logged" logged "took longer than 1s"
check "deployed by building" logged "deployed ${B:0:7}: application is ready (images built)"

echo "13b. private repository: token file is used for the checks API and never appears in argv or the log"
setup; publish "$B"; echo "  ghp_testtoken123  " > "$T/state/token"; EXTRA_ENV="GIZER_AU_TOKEN_FILE=$T/state/token" run auto-update.sh
check "checks API received the token" grep -qx "curl-auth ghp_testtoken123" "$T/state/calls.log"
check "token never passed as a command-line argument" no grep -q "TOKEN-IN-ARGV" "$T/state/calls.log"
check "token not in the update log or output" no grep -rq "ghp_testtoken123" "$T/server/.auto-update/update.log" "$T/state/out.txt"
check "still deployed release B" head_is "$B"
setup; publish "$B"; run auto-update.sh
check "without a token file no Authorization header is sent" no grep -q "curl-auth" "$T/state/calls.log"

echo "14. status"
setup; publish "$B"; run auto-update.sh; run auto-update.sh status; sed 's/^/      | /' "$T/state/out.txt"
check "status reports working pulls" grep -q "registry pulls  : working" "$T/state/out.txt"
check "status reports how the last deploy got its images" grep -q "last deploy used: pulled ${B:0:7}" "$T/state/out.txt"
check "status shows the api container image" grep -q "api container   : gizer-nba-api:local" "$T/state/out.txt"
check "status shows the commit that image was built from" grep -q "built by GitHub Actions from commit ${B:0:7}" "$T/state/out.txt"
: > "$T/state/registry"; run auto-update.sh status
check "status reports pulls not working" grep -q "registry pulls  : NOT working" "$T/state/out.txt"

echo "15. scripts/update.sh (manual update) uses the same logic"
setup; publish "$B"; git -C "$T/server" pull -q origin production 2>/dev/null; run update.sh; grep -E "pulled|registry|Update finished|ERROR" "$T/state/out.txt" | sed 's/^/      | /'
check "update.sh pulled and did not build" called "docker compose up -d --no-build"
check "update.sh finished" grep -q "Update finished" "$T/state/out.txt"
setup; git -C "$T/server" pull -q origin production 2>/dev/null; echo denied > "$T/state/pull_mode"; run update.sh
check "update.sh builds when pulling is not possible" called "docker compose up -d --build"
setup; publish "$B"; git -C "$T/server" pull -q origin production 2>/dev/null; echo edit >> "$T/server/version.txt"; run update.sh
check "update.sh builds when tracked files were edited" called "docker compose up -d --build"
check "update.sh does not pull over local edits" no called "docker pull"

check "docker stub handled every command it was given" no grep -rq "unhandled" "$T/state/out.txt" "$T/server/.auto-update/update.log"
echo; echo "passed: $PASS   failed: $FAIL"
[ "$FAIL" = 0 ]
