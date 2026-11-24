# Data sources

Reachability below was checked from the development sandbox on 2026-11-24. "VERIFIED" means a live call
succeeded and its payload was parsed by the adapter.

| Source | Used for | Access | Status | Rights / risk |
|---|---|---|---|---|
| PBP Stats API (`api.pbpstats.com`) | Completed games, possessions, per-game player totals | Public, no key | VERIFIED | Public API by the author of `pbpstats`; data derives from NBA play-by-play. No published commercial licence was reviewed. Rate-limited aggressively (HTTP 503 on bursts): the adapter spaces requests and backs off. **Owner review required before any public or commercial use.** |
| ESPN site API (`site.api.espn.com`) | Schedule, tipoff times, final scores, game-level odds shown by ESPN (book attributed, e.g. DraftKings), injury list | Public, no key, **unofficial** | VERIFIED | Undocumented endpoint with no contract; may change or be withdrawn; terms not reviewed. Acceptable only for private research. Replace with a licensed feed before any external use. |
| The Odds API (`api.the-odds-api.com`) | Player-prop quotes (points, rebounds, assists, threes) | API key (`GIZER_ODDS_API_KEY`) | NOT VERIFIED live — no key available. Adapter + contract test only. | Paid tiers exist; free tier 500 credits/month. A hard monthly cap is enforced in code. **No key has been purchased or configured.** |
| Official NBA injury report (PDF, `ak-static.cms.nba.com`) | Authoritative injury designations | Public | NOT INTEGRATED — returned HTTP 403 from the sandbox | Preferred source. To be tested from Server M; parser design can follow the MIT-licensed approach noted in the repository audit. |
| `stats.nba.com` / `cdn.nba.com` | Official stats, play-by-play | Public | BLOCKED from the sandbox (timeout / 403 — datacenter IP filtering) | Do not bypass. Test from Server M; subject to NBA.com Terms of Use. |
| `data.nba.com` legacy feeds | Schedule | Public | Reachable for 2024/2025 only; 2026 returns 403 | Not used. |
| Basketball Reference | — | — | NOT USED | Site terms prohibit automated collection. |

## What is and is not held

* Box scores: regular season 2025-26 and 2026-27 (see PROJECT-STATE.md for exact coverage). No playoffs yet.
* **No historical odds.** Therefore no model here has been validated against market prices, no historical
  betting simulation exists, and no closing-line-value analysis is possible. Backtests are forecasting tests.
  Quote snapshots accumulate from the first day of operation.
* **No starting lineups, no play-by-play, no tracking data.**
* Injuries: ESPN's list (status, body part, comment, publication time), snapshotted on every refresh.

## Adapter contract

Every adapter: authentication hook, per-provider throttle, retries with exponential backoff (not for 4xx),
pydantic-validated normalised records, a `provider_calls` row per request (status, latency, bytes, quota cost),
and attribution fields on every stored row. Team logos are hot-linked from ESPN's CDN for the private
dashboard only; nothing is redistributed.

## Cost

Current monthly provider cost: **$0** (no paid provider enabled). The Data Health page shows calls, quota
used and configured cost per provider from the real call log.
