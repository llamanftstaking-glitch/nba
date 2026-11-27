# Changelog

## Unreleased — Project Aesthetic stage one (branch `feature/project-aesthetic`, not deployed)
* "Courtside" design applied to the real app: light theme, Archivo Variable, five workspaces (Today, Games, Players,
  Markets, Research) with an All pages menu and a mobile More sheet. All 36 previous destinations keep their URLs.
* Hand-redesigned: home, live board, game page, top picks, Kalshi markets, JARVIS, games list, login, shell. The other
  routes inherit the new tokens and primitives and are not yet redesigned.
* TESTED on the fixture API only: typecheck, lint, build, `npm audit` (0 high), browser smoke 3688 passed, 0 failed.
  NOT VERIFIED: production data, real devices, Safari/Firefox, screen readers. No backend change.
* Decisions D-038 (typeface) and D-039 (Radix Dialog). Details: `docs/design/aesthetic/07-APP-INTEGRATION.md`.

## 0.7.2 — 2026-11-26 (risk policy 1.2: top picks by probability)
* Top picks now require a model probability of at least 65% and are ordered most likely first (was: ordered by margin
  over the price, which favoured long shots). Combinations and automatic paper tickets are built only from them.
* Unchanged: evidence score, positive margin at the low end of the interval, 10-point plausible-edge cap, 15% to 85%
  break-even band, freshness, candidate models research-only.
* On the 2026-11-25 slate (development database): 45 ranked picks averaging 42% under 1.1; 14 qualified selections at
  65%+ averaging 75.5% across 7 games under 1.2, mostly favourite-priced totals and spreads.
* Not shown by this change: that 65% model probability means a 65% hit rate. That needs the forward paper record.

## 0.7.1 — 2026-11-26 (JARVIS cost)
* "Quick answers" switch in the JARVIS composer (remembered per browser): ordinary questions go to the Haiku model
  with the same tools; Deep review still overrides it for one message.
* Tool results are bounded at 9,000 characters (was 14,000): each result is re-sent on every later step of a turn.
* First real cost observation: one heavy analytical question cost USD 0.11 on Sonnet (owner report, 2026-11-26).

## 0.7.0 — 2026-11-26 (GIZER CORTEX)
* Knowledge library: 20 departments of original basketball knowledge records with sources and verification status,
  loaded from versioned files; local keyword retrieval with a retrieval log.
* Player DNA and Team DNA: profiles computed from stored box scores with rule-based archetypes (rule shown) and
  rotation tendencies; tactical identity and coach identity reported as not available.
* JARVIS: six CORTEX tools and a reasoning protocol that separates verified records, calculations, model output,
  interpretation and unknowns.
* Benchmark: first tranche of questions with deterministic grading, a free retrieval check (`gizer cortex-eval`)
  and an owner-triggered answer run inside the AI budget (`gizer cortex-benchmark`).
* Knowledge Center at `/cortex`. Migration `0006_cortex`.
* Not built: semantic search, possession reconstruction, coach identities, film study (docs/cortex/ARCHITECTURE.md).

## 0.6.2 — 2026-11-26 (JARVIS analysis depth)
* New read-only tools: `get_teammate_availability_splits` (minutes, usage and production with and without each main
  teammate, with sample sizes and small-sample flags) and `get_opponent_defensive_context` (what a team allows per game
  with league rank). Both are descriptive and are not model inputs.
* JARVIS's instructions gain an analyst framework: opportunity before production, distributions around a threshold,
  shared dependence between legs, regression toward the longer record.
* First real answers from the Claude API confirmed by the owner on Server M (2026-11-26).

## 0.6.1 — 2026-11-26 (releases without building on the server)
* CI: the `images` check builds both images with Buildx and, on pushes to `main`, publishes them to the GitHub
  Container Registry tagged with the full commit id (layer cache, source and revision labels). Pull requests build only.
* `scripts/auto-update.sh` pulls the two images for the commit it deploys and starts without a build; if they cannot
  be pulled it logs why and builds on the server as before. Rollback does the same for the previous commit. Old
  release tags of this project are removed (current and previous kept). `status` shows whether pulls work and which
  image the api container runs. The release gate is unchanged.
* `scripts/update.sh` uses the same pull-or-build logic (new shared file `scripts/lib-images.sh`); `scripts/deploy.sh`
  still builds. `docker-compose.yml` image names can be overridden (`GIZER_API_IMAGE`, `GIZER_WEB_IMAGE`); defaults unchanged.
* `scripts/test-auto-update.sh`: rehearsal with a pretend docker (80 checks). Decision D-032.
* NOT VERIFIED on Server M, with a real Docker engine or against the real registry. The first release that carries
  this change is still built on the server (the updater running at that moment is the old one).

## 0.6.0 — 2026-11-26 (GIZER LIVE)
* Live game data: a dedicated `live` service polls scoreboard, box score and play-by-play (about every 15 s during
  games) and stores observations with timestamps, corrections and freshness.
* Game centre data: line scores, team statistics, sortable player box with pregame projection beside it, play-by-play
  with filters, rotations and on-court status derived from substitutions (only when consistent), observed score
  progression, deterministic end-of-quarter / halftime / final summaries.
* Watchlist (games, players, teams), tracking thresholds with events when reached, paper research tracker.
* Ten JARVIS live tools; JARVIS describes observed games and gives no in-game probability.
* Interface: scoreboard strip on every page, `/live`, game centre tabs (Overview, Box Score, Plays, Rotations, Research,
  JARVIS) with a streaming score header, `/live/following`, `/live/research-tracker`, player "Live now" block, optional
  browser notifications for reached thresholds, installable web app manifest (no offline cache).
* A late game still in progress after midnight ET stays on the default scoreboard.
* Migration `0005_live`. Evidence and limits: docs/operations/LIVE-VALIDATION.md.

## 0.5.1 — 2026-11-26 (JARVIS images)
* JARVIS accepts up to three images per message (attach, paste, drag-and-drop; downsized in the browser), reads a
  parlay or pick slip, and checks each leg against stored records. New read-only tool `evaluate_combination`
  (simulation-engine joint probability for 2 to 6 already-evaluated selections; nothing stored).
* Images are reserved at a flat 8,000 input tokens each in the AI budget.
* Provider errors are shown with the provider's own wording; stray whitespace around the API key is ignored.
* Not verified against the real Claude API (the server's key was rejected by the provider on 2026-11-26).

## 0.5.0 — 2026-11-26 (JARVIS)
* JARVIS assistant: `/jarvis` conversations with streaming answers, 39 typed read-only tools over the existing
  research services, page-context awareness, sourced memory, deterministic events and scheduled briefings.
* AI budget controller: USD 100 cumulative lifetime cap enforced by reserve-before-spend, $95 suspend line, daily
  ceiling, per-model allocations, per-request caps, emergency pause, checkpoints; `/admin/ai-budget`.
* Player opportunity profile (usage, shot volume, per-36 production, true shooting) from stored box scores.
* Migration `0004_jarvis` (reversible). New dependency: official `anthropic` SDK 2.14.0.
* `gizer jarvis-verify [--ping]` checks the key, the model ids and (optionally) one accounted paid request.
* Interface: `/jarvis` (history, streaming conversation with live tool activity, sources, memory, briefings, events),
  a global side panel (Ctrl/Cmd+J) that knows the current game, player, market or research record, and `/admin/ai-budget`.
* The real Claude API has NOT been exercised from the build environment (no key); see docs/jarvis/VALIDATION-REPORT.md.

## 0.4.6 — 2026-11-25 (page speed)
* API: evaluated selections are immutable, so each game's block is read from the database once per process
  instead of on every request (about 5,800 rows per page request before). Player-prop rows, minutes, exposure and
  the Kalshi market list are reused until the underlying data changes (`data_stamp`: highest ids of the
  append-only tables; Kalshi list at most one minute). Measured locally on a real slate, warm: selections
  0.39 s -> 0.04 s, player props 2.9 s -> 0.04 s, exposure 1.6 s -> 0.01 s, minutes 0.74 s -> 0.01 s,
  Kalshi markets 0.55 s -> 0.02 s. Not measured on Server M.
* Web: an open tab reloads itself once when the server has been updated (`/build-id.txt`), so old page code is
  never left running against a newer API.
* Updater log states after each deploy whether the history load had finished or is being resumed.

## 0.4.5 — 2026-11-25
* History load (`scripts/deploy.sh history`): models are validated and an edition is published from whatever
  history is already loaded, at the start and again after the current season, instead of only once at the very
  end. Until validation ran no model was in production, so research pages on a fresh server stayed empty for the
  whole load. Reproduced locally on a partial copy (1,281 games): validation takes seconds; six models pass.

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
