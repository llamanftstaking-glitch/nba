# GIZER NBA

Private NBA quantitative research platform for Gizer Technology Group LLC.
**Research, simulation and paper testing only.** No outcome is guaranteed; there is no real-money
execution anywhere in this codebase.

What it does, every day, without anyone logged in:

1. Ingests results, box scores, schedule, game-level quotes and injury reports from attributed providers.
2. Projects games and players with validated probabilistic models (and refuses to use unvalidated ones).
3. Evaluates each quoted market through an independent risk officer; ranks up to five qualified picks per game.
4. Builds 2–6 leg, same-game and cross-game combination research with correlation-aware joint probabilities.
5. Publishes immutable, versioned research editions; records what changed and what was invalidated.
6. Records fixed-unit paper tickets, settles them, writes forensic reports and tracks calibration honestly.

Start with `PROJECT-STATE.md` (what is true today) and `CLAUDE.md` (rules for working here).

| Topic | Document |
|---|---|
| Current status, blockers, coverage | `PROJECT-STATE.md` |
| Non-negotiable rules and where they are enforced | `RESEARCH-CONSTITUTION.md`, `RISK-POLICY.md` |
| System design | `ARCHITECTURE.md`, `docs/architecture/API-CONTRACT.md`, `docs/architecture/FRONTEND-IA.md` |
| Models, validation results, limitations | `MODEL-CARDS.md` |
| Data providers, rights, costs | `DATA-SOURCES.md` |
| Agents | `AGENTS.md` |
| Deploy / operate | `DEPLOYMENT.md`, `RUNBOOK.md`, `SECURITY.md` |
| Plan and history | `ROADMAP.md`, `CHANGELOG.md`, `docs/DECISIONS.md` |
| Third-party repository audit | `docs/research/REPOSITORY-AUDIT.md` |

## Repository layout

```
apps/api/        FastAPI + research engine (package `gizer`), Alembic migrations, tests
apps/web/        Next.js parlay-first command center, e2e smoke script
infrastructure/  reverse-proxy site files, backup + restore-test scripts
scripts/         production smoke test
docs/            architecture, research, operations
docker-compose.yml, .env.example, .github/workflows/ci.yml
```

The original brief suggested separate `services/`, `models/`, `pipelines/` and `packages/` trees. They are
consolidated into the single `gizer` package (one module per concern) — see `ARCHITECTURE.md` for the mapping
and `docs/DECISIONS.md` (D-001) for the reason.

## Local development

```bash
# PostgreSQL 16 with a `gizer` role and databases gizer_nba / gizer_nba_test
cd apps/api
uv venv .venv && uv pip install -e ".[dev]"
.venv/bin/gizer init-db && .venv/bin/gizer seed
.venv/bin/pytest -q                                   # tests use synthetic data in gizer_nba_test only
.venv/bin/gizer ingest-results --season 2026-27       # real data (rate-limited provider)
.venv/bin/gizer backtest
.venv/bin/gizer run-job edition --args '{"kind":"morning"}'
GIZER_OWNER_EMAIL=you@example.com GIZER_OWNER_PASSWORD='a-long-password' .venv/bin/gizer bootstrap-owner
GIZER_COOKIE_SECURE=false GIZER_PUBLIC_ORIGIN=http://localhost:3000 .venv/bin/uvicorn gizer.api:app --port 8000

cd ../web && npm ci && npm run dev                    # http://localhost:3000
```

Full stack: `cp .env.example .env`, edit, `docker compose up -d --build`.
