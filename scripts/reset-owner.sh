#!/usr/bin/env bash
# Reset the owner sign-in for GIZER NBA. Run on the server from the repository root:
#   bash scripts/reset-owner.sh
# Shows the existing accounts, asks for the email and a new password (typed twice, visible so typos are
# obvious), sets that account as the only active owner. The password is passed straight to the application,
# which stores only an Argon2 hash.
set -euo pipefail
cd "$(dirname "$0")/.."
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
PSQL="docker compose exec -T postgres psql -U gizer -d gizer_nba -At"

echo "Existing accounts:"
$PSQL -c "select '  ' || email || '  (' || role || case when active then ', active' else ', disabled' end || ')' from users order by id" || die "Database is not reachable."
echo
read -r -p "Sign-in email to use: " EMAIL
EMAIL="$(printf '%s' "$EMAIL" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"
case "$EMAIL" in *@*.*) ;; *) die "That does not look like an email address.";; esac
case "$EMAIL" in *"'"*) die "Email cannot contain a quote.";; esac
while :; do
  read -r -p "New password (at least 12 characters, shown as you type): " PW
  [ "${#PW}" -ge 12 ] || { echo "Too short."; continue; }
  read -r -p "Type it again: " PW2
  [ "$PW" = "$PW2" ] && break
  echo "The two entries differ; try again."
done

OUT="$(docker compose exec -T -e GIZER_OWNER_EMAIL="$EMAIL" -e GIZER_OWNER_PASSWORD="$PW" api gizer bootstrap-owner)"
echo "$OUT"
case "$OUT" in *"owner created"*|*"owner updated"*) ;; *) die "The account was not changed.";; esac
$PSQL -c "update users set active = (email = '$EMAIL')" >/dev/null
$PSQL -c "delete from sessions" >/dev/null   # sign out any old sessions

PORT="$(grep -E '^GIZER_WEB_PORT=' .env | cut -d= -f2)"; PORT="${PORT:-3410}"
BODY="$(python3 -c 'import json,sys; print(json.dumps({"email": sys.argv[1], "password": sys.argv[2]}))' "$EMAIL" "$PW" 2>/dev/null || true)"
if [ -n "$BODY" ]; then
  CODE="$(curl -s -o /dev/null -w '%{http_code}' -H 'content-type: application/json' -d "$BODY" "http://127.0.0.1:${PORT}/api/v1/auth/login" || true)"
  case "$CODE" in
    200) echo "Sign-in test passed.";;
    429) echo "Account reset. Sign-in is temporarily rate-limited after several failed attempts; wait 15 minutes, then sign in.";;
    *)   echo "Account reset, but the sign-in test returned HTTP $CODE. Send this line to your engineer.";;
  esac
fi
# keep .env in step so a later redeploy does not put the old password back
grep -v -E '^GIZER_OWNER_(EMAIL|PASSWORD)=' .env > .env.tmp && printf 'GIZER_OWNER_EMAIL=%s\n' "$EMAIL" >> .env.tmp && cat .env.tmp > .env && rm -f .env.tmp
echo
echo "Sign in at https://nba.gizergroup.com with: $EMAIL"
