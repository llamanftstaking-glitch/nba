#!/usr/bin/env bash
# Connect GIZER NBA to an existing Caddy reverse proxy that runs in Docker (Server M: container "mon-caddy").
#   bash scripts/connect-caddy.sh [network-name]
# What it does, after showing the plan and asking for confirmation:
#   1. attaches ONLY the gizer-nba web container to the proxy's Docker network (compose override file)
#   2. backs up the Caddyfile, appends one site block for the domain between markers, validates, reloads
# It does not edit or remove any existing site. If validation fails the Caddyfile is restored from the backup.
set -euo pipefail
cd "$(dirname "$0")/.."

DOMAIN="${GIZER_DOMAIN:-nba.gizergroup.com}"
CADDY="${CADDY_CONTAINER:-mon-caddy}"
UPSTREAM="gizer-nba-web-1"
say() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

docker inspect "$CADDY" >/dev/null 2>&1 || die "Caddy container '$CADDY' not found."
docker inspect "$UPSTREAM" >/dev/null 2>&1 || die "'$UPSTREAM' is not running. Run scripts/deploy.sh first."

CADDYFILE="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}' "$CADDY")"
[ -n "$CADDYFILE" ] && [ -f "$CADDYFILE" ] || die "Could not find the host path of the Caddyfile mounted in '$CADDY'."

NETS="$(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' "$CADDY")"
NET="${1:-}"
if [ -z "$NET" ]; then
  set -- $NETS
  [ "$#" -eq 1 ] || die "Caddy is on several networks ($NETS). Re-run with the one your other apps use: bash scripts/connect-caddy.sh <network>"
  NET="$1"
fi
case " $NETS " in *" $NET "*) ;; *) die "Caddy is not on network '$NET' (it is on: $NETS).";; esac

ALREADY=no; grep -q "^${DOMAIN} {" "$CADDYFILE" && ALREADY=yes
cat <<EOF

Plan
  Caddy container : $CADDY
  Caddyfile       : $CADDYFILE   (site block already present: $ALREADY)
  Proxy network   : $NET
  Upstream        : $UPSTREAM:3000
  Domain          : $DOMAIN
Other sites in the Caddyfile are not modified.
EOF
read -r -p "Proceed? [y/N] " ok
[ "$ok" = "y" ] || [ "$ok" = "Y" ] || die "Cancelled; nothing was changed."

say "Attaching the web container to '$NET'"
cat > docker-compose.override.yml <<EOF
# Written by scripts/connect-caddy.sh: lets the host's Caddy container reach the web app. Not committed.
services:
  web:
    networks:
      proxy: {}
networks:
  proxy:
    external: true
    name: ${NET}
EOF
docker compose up -d web
sleep 5
docker exec "$CADDY" wget -q -O /dev/null "http://${UPSTREAM}:3000/login" \
  || die "Caddy cannot reach ${UPSTREAM}:3000 on '$NET'. Nothing was added to the Caddyfile."
echo "Caddy can reach the app."

if [ "$ALREADY" = "no" ]; then
  BACKUP="${CADDYFILE}.bak-gizer-nba-$(date +%Y%m%d%H%M%S)"
  cp -p "$CADDYFILE" "$BACKUP"
  say "Appending the site block (backup: $BACKUP)"
  # Appending keeps the file's inode, so the container's bind mount keeps seeing the live file.
  cat >> "$CADDYFILE" <<EOF

# gizer-nba-begin (added by /opt/gizer-nba/scripts/connect-caddy.sh)
${DOMAIN} {
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options nosniff
		X-Frame-Options DENY
		Referrer-Policy no-referrer
		X-Robots-Tag "noindex, nofollow"
		-Server
	}
	reverse_proxy ${UPSTREAM}:3000 {
		header_up X-Forwarded-For {remote_host}
		header_up X-Real-IP {remote_host}
	}
}
# gizer-nba-end
EOF
  if ! docker exec "$CADDY" caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
    cat "$BACKUP" > "$CADDYFILE"   # restore contents in place (same inode)
    die "Caddy rejected the new configuration; the Caddyfile was restored from the backup. No reload was done."
  fi
  echo "Configuration is valid."
fi

say "Reloading Caddy (no downtime for other sites)"
docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile

say "Waiting for the HTTPS certificate and checking the site"
for i in $(seq 1 24); do
  if curl -fsS -m 10 "https://${DOMAIN}/api/v1/health" 2>/dev/null | grep -q '"status":"ok"'; then
    echo "https://${DOMAIN} is live."
    exit 0
  fi
  sleep 5
done
cat <<EOF

The site did not answer over HTTPS within two minutes. Things to check:
  docker logs --tail 40 $CADDY        (certificate issuance errors, DNS)
  If Caddy shows no activity for ${DOMAIN}, restart it once:  docker restart $CADDY
EOF
exit 1
