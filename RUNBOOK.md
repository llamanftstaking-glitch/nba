# Runbook

All commands run in `/opt/gizer-nba` on Server M unless noted.

## Daily rhythm (America/New_York, DST-aware)
04:00 settlement · 06:00 historical refresh · 08:00 morning intelligence · 10:00 / 12:00 / 15:00 editions ·
pregame checkpoints ~90/60/30/10 min before each tipoff · live status every 30 min while games are in
progress · Monday 05:00 weekly evaluation · 1st of month 05:30 monthly review. A missed run is caught up if
the scheduler comes back within 2 hours; later than that it is skipped (never duplicated).

## Health
```bash
docker compose ps
curl -s localhost:3410/api/v1/health/ready           # database / worker / scheduler
docker compose exec api gizer status                  # heartbeats, schedule, recent jobs, dead-letter count
docker compose logs --tail 100 worker scheduler
```
UI: **Agent Operations** (per-agent last success), **Data health** (provider status, freshness), **Admin** (jobs).

## Common situations
| Symptom | Meaning | Action |
|---|---|---|
| Warning "No live worker heartbeat" | worker containers down | `docker compose up -d worker research-worker` |
| Everything "rejected: no fresh injury report" | ESPN injuries failing or blocked | check `provider_calls`; research correctly abstains until it recovers |
| No picks, "no verified market quotes" | odds not published yet / provider down | normal early in the day; otherwise check the market agent |
| Player props "unavailable" | no `GIZER_ODDS_API_KEY` | owner decision to obtain a key (cost approval) |
| Tickets stay "unresolved" | box scores not available yet | retried at 04:00 and 06:00; `gizer settle --date YYYY-MM-DD` |
| Dead-letter jobs > 0 | a job failed 4 times | read `jobs.error`, fix cause, `gizer run-job <name>` |
| Model shows "candidate" | failed the promotion gate | expected and safe: that family produces no qualified picks |

## Manual operations
```bash
docker compose exec worker gizer run-job edition --args '{"kind":"midday"}'
docker compose exec worker gizer run-job settlement --args '{"date":"2026-11-23"}'
docker compose exec worker gizer run-job weekly_evaluation
docker compose exec worker gizer backtest --no-register      # evaluate without touching the registry
```
Pause/resume all scheduled work: Admin page (owner) or `POST /api/v1/operations/pause`.

## Updates

**Automatic (recommended once installed).** A systemd timer runs `scripts/auto-update.sh` every 5 minutes. It
deploys the `production` branch — never `main`, which carries work in progress — and only when every GitHub
check on that exact commit passed. It is fast-forward only, refuses to overwrite local changes, waits for the
application to report ready, rebuilds the previous version if it does not, and never retries a release that
failed. It pauses and resumes the history load around a rebuild.
```bash
bash scripts/install-auto-update.sh          # switch on (root)
bash scripts/install-auto-update.sh off      # switch off
bash scripts/auto-update.sh status           # deployed commit, last failed release, recent log
systemctl list-timers gizer-nba-update.timer # next run
```
The updater also keeps the one-off history load alive: until `.auto-update/history.done` exists it starts the
loader (as its own systemd job, `gizer-nba-history`) whenever it is not running. Progress: `tail -n 5 history.log`;
state: `systemctl status gizer-nba-history`.

Promoting a release (from a development machine, after verification and green CI): `git push origin main:production`.
Database migrations are forward-only; a rollback rebuilds the previous code against the newer schema, which is
safe for the additive migrations used so far. Read the log if a rollback is reported.

**Manual.** `git pull && bash scripts/update.sh` — rebuild, wait for ready, fast first pass, resume the history load.

## Backups
Daily `pg_dump -Fc` into the `backups` volume, 14-day retention.
```bash
docker compose exec backup sh /scripts/backup-once.sh
docker compose exec backup sh /scripts/restore-test.sh     # restores into a scratch DB, verifies, drops it
```
Full restore (destructive — owner approval required): stop `api worker research-worker scheduler`, create an
empty database, `pg_restore --no-owner` the chosen dump into it, start services, run the smoke test.

## Model changes
Never edit a production model in place. Register a new version (candidate) → walk-forward evaluation →
auditor gate → promotion; the previous version becomes `retired` and can be restored by promoting it again
through the same gate. Do not retrain or promote because of one bad night (RULE 24).

## Corrections
Never update or delete ledger rows (the database will refuse). A wrong settlement is fixed by correcting the
underlying game data and re-running settlement, which appends a superseding row and an audit event.

## Regenerating `apps/api/requirements.lock`
`uv pip compile pyproject.toml -o requirements.lock` omits `setuptools`, which the API image needs to install the
package (`--no-build-isolation`). After regenerating, append the pinned line `setuptools==<current pin>` again and
let the `images` check on GitHub confirm the build (it failed on 2026-11-26 when this line was dropped).

