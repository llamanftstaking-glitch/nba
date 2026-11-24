# Provider setup

Credentials live only in `/opt/gizer-nba/.env` on Server M (mode 600, git-ignored). They are never entered,
stored or displayed in the web application; Data Health shows only "present" or "missing".

| Provider | Variable | Status | Enables |
|---|---|---|---|
| PBP Stats API | none (`GIZER_PBPSTATS_ENABLED=true`) | active | results, possessions, box scores |
| ESPN public site API | none (`GIZER_ESPN_ENABLED=true`) | active | schedule, game odds, injuries, confirmed starters, DNPs, player media |
| The Odds API | `GIZER_ODDS_API_KEY`, `GIZER_ODDS_API_MONTHLY_QUOTA`, `GIZER_ODDS_API_MONTHLY_COST_USD` | **not configured — owner decision** | provider player-prop quotes (11 market types) |

## Enabling prop quotes (after owner approval)
1. Obtain a key from the provider. Check the current plan limits and price on the provider's own pricing page —
   they were not verified during the build.
2. Add to `.env`: the key, the plan's monthly credit allowance as `GIZER_ODDS_API_MONTHLY_QUOTA`, and the plan
   price as `GIZER_ODDS_API_MONTHLY_COST_USD` (display only).
3. `docker compose up -d api worker research-worker scheduler`
4. Verify: Data Health → provider shows credential present and a successful call; Player Props rows show
   `Provider` as origin. Then mark the adapter VERIFIED in DATA-SOURCES.md.

Credit use: one request per game per refresh, costing one credit per requested market type. With 11 market
types, a 10-game slate costs about 110 credits per refresh, so the free allowance (500/month) covers only a
handful of refreshes: either reduce the market list or choose a paid plan sized to
`games × markets × refreshes per day × ~170 game days`. The cap in code stops calls at the configured quota and
marks price-dependent research unavailable.

## Lineups
No authorized pre-tipoff lineup feed is configured. If the owner licenses one, add an adapter that writes
`lineup_snapshots` with status `confirmed` only for officially confirmed starters and a distinct status for
"reported"; do not reuse `projected`.
