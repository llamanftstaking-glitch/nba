# Player props

## Market catalogue
Canonical keys are `player_<stat>`. A category is **operational** only when its model family is in production.

| Market | Key | Model status (2026-11-24 validation) | Settlement (gizer-v1) |
|---|---|---|---|
| Points | `player_pts` | candidate — research only | actual vs line; DNP → void; exact → push |
| Rebounds | `player_reb` | production | same |
| Assists | `player_ast` | production | same |
| Three-pointers made | `player_fg3m` | production | same |
| Steals | `player_stl` | production | same |
| Blocks | `player_blk` | candidate — research only | same |
| Turnovers | `player_tov` | production | same |
| Points+Rebounds+Assists | `player_pra` | candidate — research only | sum of components |
| Points+Rebounds / Points+Assists / Rebounds+Assists | `player_pr`, `player_pa`, `player_ra` | candidate — research only | sum of components |
| Double-double, triple-double, alternate lines, first-half, first-quarter | — | **not supported**: no model, data or settlement rules verified | — |

A candidate family still shows averages, projections and history, but the risk officer rejects every selection in it.

## Quote sources and how they are labelled
| `origin` | Meaning | Can qualify? | Auto paper-ticketed? |
|---|---|---|---|
| `provider` | Sourced automatically from a configured odds provider | Yes | Yes |
| `owner_entered` | Typed in by the owner (price seen elsewhere) | Up to `standard`, never `high_confidence`; evidence notes say it is not independently verified; market-quote evidence capped at 5/10 | No |
| `hypothetical` | A research threshold with no price | Never (always rejected as "not a market quote") | No |

Quotes are append-only rows in `odds_snapshots` (game, player, market, side, line, price, book, provider, origin,
source publication time, ingestion time, note, source reference, creator). A changed quote is a new row.
Withdrawing a manual entry appends a `manual_withdrawn` audit event; the rows stay.

## Manual entry validation
Game must be scheduled and not started; player must be on one of the two teams; market must be a canonical key;
line 0–150 in steps of 0.5; American odds whole numbers with |odds| ≥ 100 or decimal 1.01–101; an owner-entered
market needs at least one price; a hypothetical entry never stores a price; observation time cannot be in the
future. Owner role required. Every entry and withdrawal is written to the audit log.

## Provider
The Odds API adapter maps: points, rebounds, assists, threes, steals, blocks, turnovers, PRA, PR, PA, RA.
It is contract-tested but **not verified against the live service** (no key). Player identity is matched by
normalised name restricted to the two teams in the game; unmatched players are dropped, never guessed.
Historical quotes exist only from the day a provider is configured (see Measurement B in
`docs/research/PLAYER-HISTORICAL-ANALYSIS.md`).
