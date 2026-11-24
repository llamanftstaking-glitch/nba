# Kalshi market intelligence

**Read-only.** `apps/api/gizer/kalshi.py` calls one public endpoint (`GET /trade-api/v2/markets`) and has no
authentication, order or portfolio code. VERIFIED against the live public API on 2026-11-24 (2,026 contracts
discovered for that day's and the next day's NBA games; every listed player matched to our database).

## What is discovered
One request per series, per observation pass (23 series, about 20 seconds).

| Series | Contract | Handling |
|---|---|---|
| KXNBAPTS, KXNBAREB, KXNBAAST, KXNBA3PT, KXNBASTL, KXNBABLK, KXNBAPRA (and PR, PA, RA when listed) | "Player: N+ stat" binary | **Normalised**: threshold = listed strike (24.5 for "25+"), YES = at least N |
| KXNBATOTAL | "Over N total points" binary | Normalised: YES = over, NO = under |
| KXNBASPREAD | "Team wins by over N" binary | Normalised: YES = team −N, NO = opponent +N |
| KXNBAGAME | "Team wins" binary, one contract per team | Normalised: YES = that team's moneyline |
| …PROT (protected) | same wording, different payout provisions | **Tracked only** |
| KXNBAESCALATOR… | payout scales with the statistic | **Tracked only** — not a binary threshold |
| KXNBA2D, KXNBA3D, KXNBASTOCK | double-double, triple-double, steals+blocks | **Tracked only** — no validated model |

A contract is normalised only if all of these hold: binary type, simple `greater` strike (or structured game
contract), and the rule text matches the expected wording **and** agrees with the strike. Anything else is
`unsupported` with the reason stored. A player or team that cannot be matched makes the contract `unmatched`;
it is never guessed. Contracts for games not in our schedule are ignored.

## What is stored
* `kalshi_markets` — ticker, event, series, game, player, team, stat, exact threshold, comparator, contract type,
  interpretation and reason, protected flag, original title, **rules text verbatim**, open/close time, status,
  first/last seen. Wording and rules are kept as first seen.
* `kalshi_snapshots` — append-only: YES/NO bid and ask, last price, bid/ask size, volume, 24h volume, open
  interest, status, observation time. A row is written only when something changed.
* Normalised contracts also append `odds_snapshots` rows (book `Kalshi`, the ticker in `source_ref`) so the
  research engine evaluates them. The stored price is the break-even implied by the **ask** plus an estimated
  trading fee of `0.07 × price × (1 − price)`; the exact fee schedule per series was not verified.

## Observation cadence — not real-time
Polled every `GIZER_KALSHI_POLL_MINUTES` (default 5) while a game tips within the next 14 hours, plus with every
edition and pregame checkpoint. Kalshi's WebSocket feed requires an authenticated account and is not used.
Price history therefore exists only from this system's first observation, at roughly five-minute resolution.
The API reports last sync time and marks the data stale when sync is overdue.

## Movement (descriptive)
Reference price = bid/ask midpoint when both exist, otherwise last trade. Reported: first observed today (not an
official open), current, change since first, high, low, spread, and change over 5 / 15 / 30 / 60 minutes and
3 hours (null when no observation that old exists). No cause is attributed to any move.

## Separation of roles
Kalshi defines which contracts exist and what they cost. GIZER's models produce the forecast. No model reads a
market price. Break-even comes from the contract; probability comes from the model; they are stored and shown
separately.

## Settlement differences
Kalshi settles player contracts "to a fair price" when the player is inactive or never takes the court; GIZER
paper settlement treats that as void. Paper results are therefore not identical to exchange settlement in that case.

## Known limitations
* Many thresholds per player are listed and several are illiquid (zero volume, wide spread).
* Hundreds of contracts are evaluated per game, so ranked picks are subject to selection effects.
* No historical Kalshi prices before first deployment: no market backtest exists yet.
