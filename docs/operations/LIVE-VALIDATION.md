# GIZER LIVE — data source and validation

## Source decision (2026-11-26)
| Source | What it offers | Finding | Decision |
|---|---|---|---|
| ESPN public site API (`/scoreboard`, `/summary`) | Status, period, clock, line scores, team statistics, full player box score, play-by-play with substitutions and wall-clock times | Already our schedule/injury/box source; our game ids already map to its event ids (`games.espn_event_id`, all 1,542 games held) and players to its athlete ids (`players.espn_id`, 646 of 648). Reachable. Unofficial endpoint with no published contract — same licensing caveat as in DATA-SOURCES.md. | **Primary live source** |
| NBA live JSON (`cdn.nba.com/static/json/liveData/...`, what `swar/nba_api` live endpoints read) | Scoreboard, box score, play-by-play | Returned **HTTP 403** from the build environment on 2026-11-26. Not retried through any workaround: access restrictions are not bypassed. Behaviour from Server M is unknown. NBA game ids are held for games ingested from PBP Stats (`games.id` beginning `00`), not for games created from ESPN (`E…`). | **Not used. NOT VERIFIED.** A second adapter can be added behind the same parser interface if access is confirmed and permitted. |
| SportsDataIO | Commercial feed | Paid. | **Not purchased, not integrated** (needs owner approval). |

## How it works
`gizer live` (compose service `live`, about 95 MB) polls the scoreboard, then the summary of every game in progress.
Interval: 15 s while a game is in progress, 45 s at halftime or within 20 minutes of a tipoff, 180 s before that,
600 s when nothing is scheduled; exponential backoff while the provider fails. Browsers and JARVIS read only our
database. Observations are therefore tens of seconds behind the arena and are always described as delayed.

Integrity rules implemented in `gizer/live.py`:
* A game is `live` only when the provider's status says in progress; unknown statuses are treated as scheduled.
* Data attaches to a game only when the provider event id **and both teams** match our game. Otherwise it is counted
  (`not_in_schedule`) and dropped.
* A play is unique per (game, provider event id). A changed play keeps its previous wording in `corrections`.
* On-court status and stints are derived from the published starting five plus substitution events, and only when
  that chain is consistent; otherwise they are null and the reason is listed.
* Missing values stay null (a DNP has no statistics, not zeros). Live usage rate is not published and not estimated.
* A provider failure leaves the last verified observation in place; a game in progress not observed for 90 s is `stale`.
* Nothing in live ingestion writes to predictions, selections, combinations or editions.
* Period summaries are deterministic text from stored statistics. No model is called, so they cost nothing.

## Evidence from real games (development machine, 2026-11-25 evening ET, nine-game slate)
Run of `gizer live` against the real provider while six games were in progress:
* 9 of 9 scheduled games matched; 0 unmatched events.
* 182 box-score players, 181 matched to canonical players.
* On-court status derivable for all six games in progress (ten players each); derived minutes by quarter agreed
  with published minutes within the test tolerance.
* 2,185 plays stored after about 30 minutes; **39 provider corrections** detected and kept with their previous wording.
* 175 provider calls, 0 failures, mean 141 ms; one full pass (scoreboard + 7 summaries) about 6.5 s including throttling.
* Automatic summaries produced at the right transitions (end of first quarter, halftime, final).
* The process loaded none of the modelling libraries and peaked at 94 MB.

## Status
| Item | Status |
|---|---|
| Parsing, ingestion, corrections, rotations, progression, freshness, watchlist, thresholds, tracker, JARVIS live tools | TESTED on real captured payloads (`tests/test_live.py`) |
| Live ingestion against real games | VERIFIED on the development machine (above) |
| Live ingestion on Server M, restart recovery there, overtime handling in a real overtime game | NOT VERIFIED |
| Screens during a real game on production, and screenshots | NOT VERIFIED until the owner views them during a game |
| NBA live endpoints | NOT VERIFIED (403 from the build environment) |
| Postgame corrections after the final box | The scheduled settlement and historical jobs re-import final box scores as before; live rows are refreshed once more after the provider marks a game final |
