# Project state

_Last updated: 2026-11-24 (interim, initial build session still in progress)._

| Area | Status |
|---|---|
| Backend engine (ingestion, models, risk officer, combinations, editions, ledger, agents, scheduler, API) | IMPLEMENTED, TESTED locally (82 backend tests passed before the governance tests were added) |
| Docker Compose stack (build, migrate, health, restart recovery, backup + restore test) | TESTED on a local Docker engine |
| Frontend (parlay-first command center) | IN PROGRESS |
| Historical ingest, season 2025-26 | IN PROGRESS (rate-limited provider) |
| Model cards with final validation numbers | IN PROGRESS (waiting for the ingest) |
| Deployment to Server M | BLOCKED — no server access from the build session |
| Player-prop research | BLOCKED — no prop odds provider key (owner decision) |
| CI on GitHub | NOT VERIFIED — workflow defined, not yet observed running |

See ROADMAP.md for the plan and docs/DECISIONS.md for decisions.
