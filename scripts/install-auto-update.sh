#!/usr/bin/env bash
# Switch unattended updates on or off for this server (run as root from the repository root).
#   bash scripts/install-auto-update.sh          # install and start the timer (checks every 5 minutes)
#   bash scripts/install-auto-update.sh off      # stop and remove it
set -euo pipefail
cd "$(dirname "$0")/.."
DIR="$(pwd)"
UNIT=/etc/systemd/system/gizer-nba-update
[ "$(id -u)" = 0 ] || { echo "Run as root."; exit 1; }
command -v systemctl >/dev/null || { echo "systemd is required."; exit 1; }
if [ "${1:-}" = "off" ]; then
  systemctl disable --now gizer-nba-update.timer 2>/dev/null || true
  rm -f "$UNIT.service" "$UNIT.timer"; systemctl daemon-reload
  echo "Auto-update is OFF."; exit 0
fi
for c in git curl python3 flock docker; do command -v "$c" >/dev/null || { echo "Missing required command: $c"; exit 1; }; done
cat > "$UNIT.service" <<EOF
[Unit]
Description=GIZER NBA unattended update (deploys the verified production branch)
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$DIR
ExecStart=/usr/bin/env bash $DIR/scripts/auto-update.sh
TimeoutStartSec=45min
Nice=10
EOF
cat > "$UNIT.timer" <<EOF
[Unit]
Description=Check for a verified GIZER NBA release every 5 minutes

[Timer]
OnBootSec=3min
OnUnitActiveSec=5min
RandomizedDelaySec=30

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now gizer-nba-update.timer >/dev/null
echo "Auto-update is ON. It checks every 5 minutes and deploys only the 'production' branch after its checks pass."
echo "Running the first check now (a rebuild takes several minutes)..."
systemctl start gizer-nba-update.service || true
bash scripts/auto-update.sh status
