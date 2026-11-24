# Architecture

A modular monolith on one server. Deliberately few moving parts: one Python package, one database, one web app.

```
                    existing host reverse proxy (TLS)  ──►  web (Next.js, 127.0.0.1:3410)
                                                             │  /api/v1/* rewrite
                                                             ▼
   scheduler ──enqueue──►  PostgreSQL  ◄──claim── worker, research-worker        api (FastAPI)
   (ET schedule,           (warehouse, ledger,     (agents: ingest → model →       │
    pregame checkpoints)    durable job queue)      guard → combos → edition)  ────┘
                                  ▲
                              backup (daily pg_dump, retention, restore test)
```

## Layers (`apps/api/gizer/`)

| Module | Responsibility |
|---|---|
| `providers.py` | Adapters (PBP Stats, ESPN, The Odds API): rate limiting, retries with backoff, schema validation, usage log, source attribution. Fail → `ProviderError`, never substitute data. |
| `ingestion.py` | Idempotent normalisation into the warehouse; append-only injury/odds snapshots; cross-provider game matching. |
| `modeling.py` | Point-in-time features, baselines, probabilistic models, walk-forward evaluation, model registry and the independent promotion gate. |
| `simulation.py` | Empirical residual correlations, Gaussian-copula joint simulation with seeds and MC error. |
| `research.py` | `guard` (risk officer), ranked selections, combination engines, immutable versioned editions, invalidation events. |
| `ledger.py` | Paper tickets, settlement, forensic reports, results statistics, exposure/shared-risk simulation. |
| `jobs.py` | 18 agent workflows, durable queue, worker, scheduler, operations status. |
| `api.py`, `security.py` | Versioned read API, auth, CSRF, roles, rate limiting, audit log. |

## Data model

Reference: `seasons`, `teams`, `players`, `games`, `player_box`. Snapshots (append-only): `injury_snapshots`,
`odds_snapshots`, `raw_payloads`. Research (append-only): `predictions`, `selections`, `combos`, `editions`,
`research_events`, `model_evaluations`, `prediction_outcomes`. Ledger (append-only): `paper_tickets`,
`paper_settlements`. Registry: `model_versions`. Operations: `jobs`, `agent_executions`, `heartbeats`,
`provider_calls`, `settings`, `users`, `sessions`, `audit_log`, `research_findings`.

Append-only is enforced by PostgreSQL triggers that reject `UPDATE`, `DELETE` and `TRUNCATE`
(`db.IMMUTABLE_TABLES`). Time-sensitive rows carry provider, ingestion time, and source publication time when
the source provides one. Point-in-time reads use `ingested_at <= as_of`.

Not yet modelled (see ROADMAP): play-by-play events, lineup combinations, tracking data, coaches, venues as
entities, historical roster table (rosters are currently derived from box scores).

## Key design decisions (full history in `docs/DECISIONS.md`)

* **PostgreSQL-backed job queue instead of Celery + Redis.** `FOR UPDATE SKIP LOCKED`, unique dedupe keys,
  retries with exponential backoff, dead-letter state, stale-lock recovery, heartbeats, per-job timeout. One
  fewer stateful service to operate and back up; job history lives next to the research it produced.
  Redis is therefore not deployed.
* **No LLM in any decision path.** Narratives are deterministic templates over structured results.
* **One forecast of record per game**: the latest edition published before tipoff. Started games are never
  re-evaluated; the API resolves each game to its frozen edition.
* **Editions are inserted once, complete** (id reserved from the sequence first) so the immutable row never
  needs an update.
* **Registry over MLflow**: models are small parameter sets stored in `model_versions`; evaluations are rows.
* **scikit-learn gradient boosting as challenger** instead of LightGBM/XGBoost: same model class, no extra
  native dependency; results are recorded whether or not it beats the baselines.

## Frontend

Next.js App Router, parlay-first information architecture — see `docs/architecture/FRONTEND-IA.md` and the
API contract in `docs/architecture/API-CONTRACT.md`. The browser only ever talks to the same origin.

## Capacity

Measured locally: API image 788 MB, idle stack well under 1 GB RAM; a full walk-forward evaluation of two
seasons takes seconds; an edition for a typical slate takes a few seconds. Compose limits total ~11 GB RAM
ceiling across services (postgres 2g, api 1.5g, workers 3g each, scheduler 0.5g, web 0.75g, backup 0.5g);
these are ceilings, not reservations. No GPU is needed.
