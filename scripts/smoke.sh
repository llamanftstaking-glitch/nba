#!/bin/sh
# Production smoke test. Usage: scripts/smoke.sh https://nba.gizergroup.com [email password]
set -eu
BASE=${1:?base url}; EMAIL=${2:-}; PASS=${3:-}
fail() { echo "FAIL: $1" >&2; exit 1; }
[ "$(curl -fsS "$BASE/api/v1/health")" = '{"status":"ok"}' ] || fail "health"
echo "ok   health"
ready=$(curl -sS "$BASE/api/v1/health/ready"); echo "info ready: $ready"
echo "$ready" | grep -q '"database":true' || fail "database not ready"
echo "$ready" | grep -q '"worker":true' || fail "no worker heartbeat"
echo "$ready" | grep -q '"scheduler":true' || fail "no scheduler heartbeat"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/command-center")" = "401" ] || fail "API must reject unauthenticated requests"
echo "ok   unauthenticated API request rejected"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/login"); [ "$code" = "200" ] || fail "login page ($code)"
echo "ok   frontend login page"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/"); [ "$code" = "307" ] || [ "$code" = "302" ] || fail "root should redirect to login when signed out ($code)"
echo "ok   signed-out root redirects"
if [ -n "$EMAIL" ]; then
  jar=$(mktemp)
  out=$(curl -sS -c "$jar" -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" "$BASE/api/v1/auth/login")
  echo "$out" | grep -q '"csrf"' || fail "login"
  curl -fsS -b "$jar" "$BASE/api/v1/command-center" | grep -q '"slate"' || fail "authenticated command-center"
  curl -fsS -b "$jar" "$BASE/api/v1/agents" | grep -q 'agent-18' || fail "agents"
  rm -f "$jar"; echo "ok   authenticated API"
fi
echo "SMOKE PASSED"
