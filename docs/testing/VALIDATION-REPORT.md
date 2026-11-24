# Validation report — V3 (2026-11-24)

Only checks that were actually executed are listed, with where they ran.

## Automated
| Check | Where | Result |
|---|---|---|
| Backend test suite (`pytest`) | local, PostgreSQL 16 | **94 passed, 0 failed** |
| Lint (`ruff --select E9,F`) | local | passed |
| Frontend typecheck, lint, production build | local (frontend agent and again before integration) | passed |
| `npm audit --omit=dev --audit-level=high` | local | 0 vulnerabilities |
| `pip-audit` on the lock file | local, after the dependency upgrade | 0 known vulnerabilities |
| Frontend smoke against the **mock** API (27 routes, 7 viewports, flows) | local (frontend agent) | 1,464 assertions passed |
| Frontend against the **real** API with live data: 27 routes + player profile + game page, 1440×900 and 390×844 | local | no page errors, no failed API calls, no horizontal overflow |
| Container images build; compose stack start; smoke script | local Docker engine | passed |
| Migration `0001 → 0002` on an existing database with data | local compose stack | applied; earlier editions preserved |
| Migration downgrade/upgrade round trip | test suite | passed |
| GitHub Actions CI | GitHub | green on the pre-V3 commit `d7d972c`; see PROJECT-STATE.md for the V3 run |

## What the backend tests cover
Leakage (future data cannot change earlier features; live and backtest features identical) · distributions,
calibration, intervals · simulation reproducibility, marginals, dependence direction · registry (no self-promotion)
· risk officer rejections · forbidden language · append-only tables (update/delete/truncate refused) ·
edition versioning and invalidation · tipoff freeze · settlement (win/loss/push/void/unresolved, corrections) ·
providers (contracts, outage, invalid data, quota cap) · scheduler (DST, dedupe, pause, pregame checkpoints) ·
queue (retry, backoff, dead-letter, stale recovery, timeout) · agents (18 declared, output validation) ·
auth, CSRF, roles, rate limit, headers · migrations · governance documents vs code ·
**V3:** window averages recomputed from raw logs (L3/L5/L10/L15/L20/L30/season), DNP never counted as zero,
real zeros kept, short windows reported not padded, threshold counts, splits and small-sample flags, lineup
unknown/projected/confirmed rules, lineup change detection with history preserved, manual market validation,
origin rules (owner-entered capped, hypothetical rejected, no auto-ticketing), props/lineups/provider/strategy APIs.

## Verified on live data (clean database built by migrations, 2026-11-24 slate)
* 1,477 final games with box scores; confirmed starters for 1,444; 648 players; 32,223 player-game rows.
* Walk-forward validation: 7,211 out-of-sample player-games per family, 382 team games (MODEL-CARDS.md).
* Morning intelligence agents and an edition ran end to end: 18 quoted game markets evaluated, 3–4 qualified,
  combinations built, 6 projected team lineups, 765 player predictions, 69 players projected.
* Spot check: a star player's L10 values, threshold counts and missed games were read back through the API.

## Not verified
* Anything on Server M (no access): deployment, HTTPS, production scheduler, reboot recovery on the server.
* The Odds API against the live service (no key).
* Confirmed-lineup capture at tipoff on a live game (logic is tested with fixtures; no game tipped during the session).
* Settlement of real paper tickets (first settlement runs at 04:00 ET after the first slate).
* Load and penetration testing. Screenshots at 1920/1280/1024/768/430 were checked by automated overflow and
  font-size assertions against the mock API only; visual review covered 1440 and 390.
