# Project state

_Last updated: 2026-11-24, after Core Intelligence V1.0._

## Status
| Area | Status |
|---|---|
| Research engine (ingestion, models, risk officer, combinations, editions, ledger, agents, scheduler, API) | IMPLEMENTED, TESTED (94 backend tests) |
| V3 player intelligence (history windows, distributions, thresholds, splits, game logs, missed games) | IMPLEMENTED, TESTED, VERIFIED on live data |
| V3 lineups (confirmed from box scores, labelled projections, snapshots, change detection) | IMPLEMENTED, TESTED, VERIFIED on live data (projected); confirmed-at-tipoff path NOT VERIFIED live |
| V3 player props (11 market types, origin, manual entry, props table) | IMPLEMENTED, TESTED. Provider quotes BLOCKED (no key) |
| V3 premium frontend (design system, 4-group navigation, 27 routes, mobile) | IMPLEMENTED, TESTED against mock and real API |
| Core Intelligence V1.0: Kalshi market intelligence (read-only), minutes and rotation intelligence, availability change events, watch jobs, update editions | IMPLEMENTED, TESTED (128 backend tests, 1,781 frontend smoke checks), VERIFIED against live Kalshi data locally. CI green on `89c7d3b`. **DEPLOYED to Server M on 2026-11-25** via `scripts/update.sh` (owner-run; owner reported success). Verified from outside: readiness (database, worker, scheduler), login page, and that the new Kalshi API route exists and requires sign-in. Authenticated pages on the server were not inspected by the build session |
| Lineup projection without loaded history (last ESPN box score) and `gizer quickstart` | IMPLEMENTED, TESTED, rehearsed on an empty database; not yet run on Server M |
| Minutes model `minutes_blend 1.0.0` | Candidate — failed its gate (5.40 vs 5.34 minutes MAE for the best baseline) |
| Models | team_game, player_reb, player_ast, player_fg3m, player_stl, player_tov in production; player_pts, player_blk, player_pra, player_pr, player_pa, player_ra are candidates (failed the gate) |
| Docker Compose stack | TESTED on a local Docker engine (build, migrate 0001→0002 on existing data, smoke, restart recovery, backup + restore) |
| Deployment to Server M | **DEPLOYED 2026-11-24** at https://nba.gizergroup.com (owner ran `scripts/deploy.sh` and `scripts/connect-caddy.sh`). VERIFIED from outside: HTTPS, health/readiness (database, worker, scheduler), unauthenticated API rejected, owner sign-in. NOT VERIFIED yet: full smoke script, backup + restore on the server, reboot recovery, history load completion |
| The Odds API adapter | NOT VERIFIED against the live service |
| High-confidence tier | Empty by design until ≥200 settled forward paper records exist |

## Data held (development database; Server M starts empty)
Regular seasons 2025-26 (1,221 games) and 2026-27 (256 games through 2026-11-23): box scores for all, confirmed
starters for 1,444. No playoffs, no historical odds, no play-by-play. See DATA-SOURCES.md.

## Blockers needing the owner
1. **Post-deployment checks** — after the history load finishes: `scripts/smoke.sh`, backup + restore test, one reboot test (DEPLOYMENT.md checklist).
2. **Auto-update installed (owner-reported)**: the server deploys the `production` branch after green checks. After the history load finishes, run `gizer backtest` on the server (the history script does this) so models are validated there; until then model-based picks are rejected.
3. Prop quotes now come from Kalshi (free, public). A sportsbook prop odds key is optional.
3. **Data licensing review** before any use beyond private research (ESPN endpoint is unofficial).

## Known limitations (see MODEL-CARDS.md, docs/operations/P0-ISSUE-REGISTER.md)
* No model is validated against market prices; qualified selections are paper-testing candidates, not evidence of an edge.
* Points and combination-stat models fail interval coverage; hypothesis: stale player state across the off-season.
* Minutes projections do not react to a teammate being ruled out (flagged as opposing evidence instead).
* No pre-tipoff confirmed lineups; no playoff data; teammate-availability splits not implemented.
* Builder evaluates from two legs; Results filters are not in the URL; edition diff is computed client-side.

## Next priorities
1. Deploy and complete the DEPLOYMENT.md checklist; run the one-off history load on the server.
2. Decide on the prop odds provider; verify the adapter live.
3. Challenger player model with season-boundary carry-over, judged on data after 2026-11-23.
4. Teammate-absence minutes adjustment; playoff ingestion; official NBA injury report from Server M.
5. Second factor and off-host encrypted backups.

First-deployment commands and the daily rhythm are in DEPLOYMENT.md and RUNBOOK.md.
