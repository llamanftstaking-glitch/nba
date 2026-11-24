#!/bin/sh
# One logical backup with verification and retention. Usage: docker compose exec backup sh /scripts/backup-once.sh
set -eu
ts=$(date -u +%Y%m%dT%H%M%SZ)
out="/backups/gizer_nba_${ts}.dump"
if pg_dump -h postgres -U gizer -d gizer_nba -Fc -f "${out}.tmp"; then
  mv "${out}.tmp" "$out"
  pg_restore --list "$out" > /dev/null
  echo "backup ok ${out} $(du -h "$out" | cut -f1)"
  find /backups -name 'gizer_nba_*.dump' -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
else
  echo "backup FAILED at ${ts}" >&2
  rm -f "${out}.tmp"
  exit 1
fi
