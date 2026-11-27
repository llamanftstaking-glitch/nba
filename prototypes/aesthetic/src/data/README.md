# Prototype dataset

`dataset.json` is one real snapshot for **2026-11-25** (nine finished games), exported from the GIZER NBA
development database through the local API by `scripts/export-dataset.mjs`. Not live. Not for
production. Read-only for designers: import through `index.ts`, never edit the JSON by hand.

```ts
import { data, featuredGame, featuredPlayer, teamByAbbr, teamById, teamLogo, playerHeadshot,
         playerHeadshotSized, fmtTimeET, fmtDateET, fmtPct, fmtAmerican } from '../../data'
```

Conventions (from `docs/architecture/API-CONTRACT.md`): `null` = not available (show it, never a
placeholder number) · timestamps ISO UTC, display in ET · probabilities 0..1 · `evidence_score` 0..100
is evidence quality, never a probability · classifications `high_confidence | standard | watchlist |
insufficient_evidence | rejected | invalidated` ("qualified" = the first two) · long arrays are cut,
never padded, and a cut array has `<key>_total` beside it.

## Top-level keys

| Key | Source endpoint (`/api/v1`) | Shape designers need |
|---|---|---|
| `meta` | written by the script | `snapshot_date`, `exported_at`, `note`, `featured_game_id`, `featured_player_ids`, `endpoint_errors` |
| `scoreboard` | `/live/scoreboard?date=` | `games[9]`: `game_id, label, status, status_label, period_label, clock, venue, tipoff_utc, home/away {abbr, name, score, linescores[4]}`, `observed_at, stale`; plus `poll_note` |
| `games` | `/games?date=` | `games[9]` GameCard: `home/away {abbr,name,logo_url}`, `injuries`, `lineup`, `research_completeness {score, items}`, `environment` (projected points, total, margin, pace), `quotes[]`, `top_picks[]` (Selection), `n_evaluated`, `n_rejected` |
| `featured_game` | CLE @ NYK, `E401909319` | see below |
| `teams` | `/teams` | `items[30]`: `id, abbr, name, logo_url, games, wins, losses, off_rtg, def_rtg, pace` |
| `featured_players` | three top scorers of the featured game | array of 3 (Donovan Mitchell, James Harden, Jose Alvarado); see below |
| `players_index` | `/players?limit=40` | `items[40]`: `id, name, team_abbr, position, jersey, headshot_url, games, min, pts, reb, ast, fg3m`; `total` |
| `top_picks` | `/selections?date=&ranked=true` | `edition`, `items[45]` Selection, `counts` |
| `qualified` | `/selections?date=&classification=qualified&limit=40` | `items[40]` Selection |
| `parlays` | `/combos?date=&category=double` and `sgp` | `double.items[8]`, `sgp.items[8]` Combo (`items_total` = real count), `counts` per category |
| `kalshi` | `/kalshi/markets?date=&limit=60&sort=volume`, `/kalshi/markets/{ticker}` | `list.items[60]` KalshiMarket, `list.sync` (stale flag, poll note), `list.counts`; `details[ticker]` for 3 player contracts + 1 game contract (tickers in `detail_tickers`): `market, rules, series[]` (observations, oldest first), `timeline[]`, `history` (L5/L10/L20/season frequencies; player contracts only), `research` |
| `minutes` | `/minutes?date=&limit=40` | `model`, `uncertainty`, `tiers`, `items[40]` MinutesProfile, `total` |
| `injuries` | `/injuries` | `items[55]` InjuryRow, trimmed to teams playing that day (`items_total` 95); `changes[]` |
| `injury_changes` | `/injuries/changes?date=` | `items[16]`: `player_name, team_abbr, previous_status, current_status, material, game_label, records_to_reassess` |
| `lineups` | `/lineups?date=` | `games[9]`: `game`, `home`/`away` LineupSide (`status`, `note`, `starters[5]`, `bench[]`, `unavailable[]`) |
| `edition` | `/editions?date=`, `/editions/{id}` | `list.items[2]` (changes cut to 20); `latest`: `key, kind, version, published_at, counts, selection_counts, changes[20]`, `summary {slate, narrative[], limitations[], unresolved[], rejected[12]}` |
| `results` | `/results` (ticket rows omitted) | `summary` (record, hit rate, simulated units), `by_engine[]`, `by_structure[]`, `calibration[]`, `equity_curve[]`, `disclaimer` |
| `research_tracker` | `/live/research-tracker?date=` | `items[8]` paper tickets (`items_total` 60): `legs[]` with `label, line, current, difference_to_line, observation`, `settlement`, `status` |
| `cortex` | `/cortex/overview`, `/cortex/concepts?limit=24`, three records | `overview` (counts, departments, benchmark), `concepts.items[24]`, `records['true-shooting-percentage' | 'drop-coverage' | 'usage-percentage']` (full text: `summary, body, formula, limitations, sources, related`) |
| `jarvis` | `/jarvis/state`, `/jarvis/suggestions` + hand-written sample | `state` (models, budget), `suggestions.items[7] {label,text}`, `sample_conversation` (below) |
| `ai_budget` | `/admin/ai-budget` | `policy`, `spent_usd`, `remaining_usd`, `buckets[]`, `by_model[]`, `checkpoints[]`, `daily[]`, `notes[]` |

### `featured_game`
| Key | Endpoint | Notes |
|---|---|---|
| `live` | `/live/games/{id}` | final score 102 to 121, `linescores`, `leaders`, `team_stats`, `momentum`, `last_plays[8]`, `summaries[]` (automatic period summaries) |
| `boxscore` | `/live/games/{id}/boxscore` | `home/away.players[]` BoxPlayer incl. `pregame` projection beside the observed line, `totals` |
| `play_by_play` | `...?limit=120&order=desc` | newest first, 120 of `total` 477 |
| `rotations` | `/rotations` | per player `stints[] {start_s,end_s}`, `minutes_by_period`, `minutes_vs_projection` |
| `team_stats` | `/team-stats` | `items[18] {label, home, away, home_value, away_value}`, `not_published[]` |
| `momentum` | `/momentum` | `points[115] {t, period, home, away, diff}`, `runs[]`, `lead_changes`, `ties`, `largest_lead` |
| `research` | `/games/{id}` | `game` GameCard, `team_form`, `player_projections[242]` (`stat, mean, p10, p50, p90, proj_min`), `selections[24]` (of 173), `sgp[4]`, `h2h[5]`, `agent_reports`, `unresolved` |
| `lineups` | `/games/{id}/lineups` | both sides are `projected` (not official) |

### `featured_players[i]`
`profile` (`/players/{id}`: `player`, `next_game`, `splits[]`, `game_log[40]`, `projections[]`) ·
`averages` (`/averages`: `windows[10]`, each `games, missed, small_sample, stats[stat] {mean, median, min, max, sd, p25, p75}`) ·
`game_logs` (`/game-logs?limit=20`: `items[20]`, `missed[]`) · `minutes` (`/minutes`: `model`, `profile`) ·
`dna` (`/cortex/players/{id}/dna`: `season_line` usage / per-36 / true shooting, `recent_10`, `archetypes[] {label, rule}`, `teammate_context[]`, `not_available[]`) ·
`live` (`/live/players/{id}?date=`: `live.line` = his observed box-score line that night).

### `jarvis.sample_conversation`
`{ sample: true, sample_note, subject, messages: [owner, assistant], facts[] }`. The assistant message
has `tool_activity[] {tool, label, status}` (real tool labels from `gizer/jarvis_tools.py`),
`text` (four short paragraphs, `**bold**` lead-ins, blank-line separated), `sources[]` and
`limitations[]`. It is a hand-written illustration, **not** a recorded exchange and not model output:
keep it visibly marked as a sample. Every number in the text is interpolated from this file (listed in
`facts` with its `dataset_path`), and the export aborts if the text contains any other number.

## Things to know before designing with it
* Honest labels are part of the data: lineups are `projected` (not official); the Kalshi sync is
  `stale` (the snapshot was polled, never real-time); `first_observed` is not an opening price;
  `history` frequencies and averages are descriptive, not probabilities; archetypes and minutes classes
  are descriptive; paper results are simulated units; there is no `high_confidence` selection.
* Game status: use `scoreboard` / `featured_game.live` (all nine are `final`). The research records
  (`games`, `featured_game.research.game`, `lineups`, `edition`) were published before tipoff and
  still say `scheduled` or `live` with `home_points: null`. That is the real stored state, not a bug to hide.
* Some players appear on teams you may not expect. Show what the data says.
* Only three players have full profiles and only four Kalshi contracts have observation history.
* Endpoint errors in this export: none (`meta.endpoint_errors` is empty).

## Re-exporting
Start the local API against the development database (see the task brief / `README.md` of the
repository), then `node scripts/export-dataset.mjs`. Environment overrides: `GIZER_API`,
`GIZER_EMAIL`, `GIZER_PASSWORD`, `SNAPSHOT_DATE`, `FEATURED_GAME`. The script only reads (GET), apart
from the login request. Re-exporting changes the file for all three concepts at once: coordinate first.
