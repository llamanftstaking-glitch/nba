# Changelog

## 0.3.1 — 2026-11-24
* Starting Lineups: new default "Lineup board" view — one compact card per game with both teams side by side,
  five starters with position, availability tags (Q / D / DTD / OUT), a "May not play" list and the game line.
  The previous table with projected and recent minutes remains as the "Detailed (minutes)" view.
* Server scripts: `deploy.sh`, `connect-caddy.sh`, `reset-owner.sh`. First production deployment recorded.

## 0.3.0 — 2026-11-24 (V3)
* Player intelligence: appearance-based history windows (L3–L30, season, previous season), distributions,
  descriptive threshold comparison, splits with small-sample flags, game logs, missed games.
* Lineup intelligence: confirmed starters and did-not-play records from box scores, labelled projections,
  append-only snapshots, change detection wired into editions and pregame checkpoints.
* Player props: eleven market types with per-family models and gates; quote origin; owner-entered and
  hypothetical markets with audit trail; props table; provider configuration centre; strategy performance.
* Premium redesign: design system, four-group navigation, Overview, Player Props, Starting Lineups, player
  profile with history chart, comparison, matchups, mobile bottom navigation Home/Games/Props/Parlays/More.
* Reversible migration 0002; model cards generated from stored evaluations; dependency upgrades after CI audit.

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
