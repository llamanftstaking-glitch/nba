# Changelog

## 0.4.4 — 2026-11-25 (page audit)
* Every page audited against a real slate (9 games, ~5,800 evaluated contracts). No page errors, but several were
  unusable at real volume: Daily Editions rendered every selection (1.9M px), Top Picks, Builder, Model Registry,
  Backtesting and Research Lab ran to tens of thousands of pixels; Player Comparison and Historical Performance
  opened blank; Same-Game Research was empty; prop pages said no provider was configured although Kalshi was.
* API: `/selections` is paginated and filterable; edition and game detail return bounded lists with counts;
  one main line per market on game cards; per-game same-game combinations; accurate prop-source messages;
  schedule ingested seven days ahead.
* Web: paged and grouped selection lists, collapsed metric details, slate-player defaults on comparison and
  history, per-game collapsible injury feed. Largest page is now 8,080 px at 1440 wide on the same data.
* Smoke suite gained a large-slate guardrail (page-height limits, bounded requests): 2,103 checks.

## 0.4.3 — 2026-11-25
* Updater: the history load is started as an independent systemd job (it was being stopped when the update job
  ended) and is restarted automatically until it has finished once.
* Confirmed lineups carry position, jersey and photo from the box score.

## 0.4.2 — 2026-11-25
* Unattended server updates (`scripts/auto-update.sh`, `scripts/install-auto-update.sh`): deploys the
  `production` branch after its checks pass, with health check and rollback.
* `scripts/update.sh` for manual updates (the earlier one-line command stopped itself before doing anything).

## 0.4.1 — 2026-11-24
* Dashboard: Kalshi Market Watch and market detail, Minutes Intelligence, injury change centre, game-page
  minutes and Kalshi sections, player minutes block and contract ladder.
* History load fetches newest games first, current season first. `gizer quickstart` gives a fresh server
  today's slate, injuries, projected lineups, Kalshi markets and an edition within about a minute.
* Lineup projection falls back to a team's last ESPN box score when its history is not loaded yet.

## 0.4.0 — 2026-11-24 (Core Intelligence V1.0)
* Kalshi market intelligence (read-only): contract discovery, conservative interpretation with verbatim rules,
  append-only price observations, descriptive movement, market detail with event timeline. Kalshi quotes feed
  the research engine as book `Kalshi`.
* Minutes and rotation intelligence: profiles, projection with empirical band, tiers, rotation classes,
  evaluated minutes model (candidate) and a measured tier study.
* Availability change events; `availability_watch` and `market_watch` jobs; change-triggered `update` editions.
* Risk policy 1.1: qualifying price band, `stale` classification. Migration 0003. 33 new backend tests.

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
