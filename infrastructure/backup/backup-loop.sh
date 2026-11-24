#!/bin/sh
# Daily logical backup loop. Runs inside the `backup` container.
while true; do
  sh /scripts/backup-once.sh || true
  sleep 86400
done
