# Changelog

## 0.1.0 — 2026-11-24
Initial build (Phase 1 foundation + Phase 2 parlay-first command center, combined).

* Warehouse schema with append-only snapshot, prediction and ledger tables enforced by database triggers; Alembic baseline.
* Provider adapters: PBP Stats (results, box scores), ESPN (schedule, game odds, injuries), The Odds API (props; needs a key).
* Modeling: point-in-time features, three baselines, minutes-rate negative-binomial player model, gradient-boosting
  challenger, efficiency-based team model, walk-forward evaluation, registry with independent promotion gate.
* Correlation lab: empirical residual correlations, Gaussian-copula joint simulation, joint-frequency validation.
* Research: GIZER GUARD risk officer, ranked top-five per game, combination engines (2–6 legs, same-game, cross-game),
  immutable versioned editions with change tracking and invalidation events.
* Paper ledger: fixed-unit virtual tickets, settlement (win/loss/push/void/unresolved), superseding corrections,
  forensic reports, per-engine results with confidence intervals, exposure/shared-risk simulation.
* Operations: 18 agent workflows, PostgreSQL job queue, DST-aware scheduler, pregame checkpoints, heartbeats, pause switch.
* API v1 with owner authentication, CSRF, roles, rate limiting, audit log. Next.js command center.
* Docker Compose stack, backup + restore test, smoke test, CI workflow, governance documents.
