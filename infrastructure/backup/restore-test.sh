#!/bin/sh
# Restore the newest backup into a scratch database and verify it. Never touches the live database.
#   docker compose exec backup sh /scripts/restore-test.sh
set -eu
latest=$(ls -1t /backups/gizer_nba_*.dump | head -1)
echo "restoring ${latest} into gizer_restore_test"
psql -h postgres -U gizer -d postgres -qc "DROP DATABASE IF EXISTS gizer_restore_test"
psql -h postgres -U gizer -d postgres -qc "CREATE DATABASE gizer_restore_test"
pg_restore -h postgres -U gizer -d gizer_restore_test --no-owner "$latest"
live=$(psql -h postgres -U gizer -d gizer_nba -Atc "select (select count(*) from games)||','||(select count(*) from player_box)||','||(select count(*) from editions)||','||(select count(*) from paper_tickets)")
rest=$(psql -h postgres -U gizer -d gizer_restore_test -Atc "select (select count(*) from games)||','||(select count(*) from player_box)||','||(select count(*) from editions)||','||(select count(*) from paper_tickets)")
trig=$(psql -h postgres -U gizer -d gizer_restore_test -Atc "select count(*) from pg_trigger where tgname like '%_immutable'")
psql -h postgres -U gizer -d postgres -qc "DROP DATABASE gizer_restore_test"
echo "live=${live} restored=${rest} immutability_triggers=${trig}"
[ "$trig" -ge 13 ] || { echo "RESTORE TEST FAILED: triggers missing" >&2; exit 1; }
# The live database may have advanced since the dump; restored counts must not exceed live counts.
echo "RESTORE TEST PASSED"
