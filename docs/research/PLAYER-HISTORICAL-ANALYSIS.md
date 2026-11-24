# Player historical analysis

Everything on player history pages is **descriptive** and reproducible from `player_box` rows
(`apps/api/gizer/history.py`; `tests/test_player_intel.py` recomputes the numbers from raw logs).

## Definitions
* **Window** = the player's most recent *appearances* (games with recorded minutes): L3, L5, L10, L15, L20, L30,
  current season, previous season, all ingested regular-season games. Playoffs are not ingested yet and are shown
  as unavailable.
* **Missed games** = team games inside the window's date span without an appearance. They are listed separately
  (with the published reason where known) and are **never averaged in as zeros**. A real zero in an appearance is kept.
* If fewer appearances exist than requested, the window reports the true count ("only 12 of 20") — it is never padded.
* Filters (home/away, starter/bench, opponent) are applied **before** the window: "L10 home" is the last ten home
  appearances. Starter/bench filters exclude games whose starter status is unknown.
* Windows under 10 games are flagged as small samples.

## Statistics per window
Games, missed, and for minutes, points, rebounds, assists, threes, steals, blocks, turnovers, PRA, PR, PA, RA:
mean, median, minimum, maximum, sample standard deviation, 25th and 75th percentiles.

## Threshold comparison — two different measurements
* **Measurement A (implemented):** the player's actual results versus *today's selected threshold*
  (over / under / equal counts, frequency, per-game values). It answers "how often did he exceed 24.5 in his last
  ten?" It is not a betting record and not a probability for the next game; the API and UI say so on every response.
* **Measurement B (not available):** results versus *the line that was actually offered before each past game*.
  This needs timestamped historical prop quotes. None are held; they accumulate only once a prop odds provider is
  configured. The API returns `market_history.available = false` with the reason rather than approximating it.

## Splits
Home/away, starter/bench, rest (back-to-back, 1 day, 2+), minutes bands, team wins/losses, team context after a
trade, versus the next opponent. Each shows its sample size. Splits are **not model features**: a difference
between two averages is not evidence of a predictive effect until it passes chronological validation
(the Schedule agent reports, for example, that the raw back-to-back margin effect is not distinguishable from zero).
Teammate-availability splits are not implemented yet.

## Coverage
648 players, 32,223 player-game rows, regular seasons 2025-26 (complete) and 2026-27 (through 2026-11-23).
Sources: box scores from the PBP Stats API; starter flags, did-not-play records, headshots, jersey numbers and
positions from ESPN box scores.
