# JARVIS — tool registry

`apps/api/gizer/jarvis_tools.py` is the complete list of what the assistant can do. `GET /api/v1/jarvis/tools`
returns it. A tool is a typed function over an existing application service; results are JSON bounded to 14,000
characters by shortening lists (never by cutting a value in half) and marked when shortened.

| Group | Tools |
|---|---|
| NBA | get_daily_slate, get_game_details, get_team_profile, find_player, get_player_profile, get_player_game_logs, get_player_rolling_averages, get_player_historical_splits, get_threshold_history, compare_player_statistics, get_opponent_defensive_context |
| Opportunity | get_projected_minutes, get_minutes_table, get_player_opportunity_profile (usage, shot volume, per-36, true shooting), get_teammate_availability_splits (with/without each main teammate) |
| Availability | get_current_injury_report, get_availability_changes, get_lineups, get_lineup_changes |
| Kalshi | get_available_kalshi_markets, get_kalshi_market (rules, snapshot, price/volume history, timeline) |
| Quantitative | get_player_markets (projection, p10/p90, readiness), get_model_readiness, get_existing_research_candidates, get_existing_parlay_research, inspect_research_validation (audit mode), evaluate_combination (joint probability for 2 to 6 evaluated selections; read-only), get_correlation_research, get_research_edition |
| Learning | get_model_error_history, get_paper_testing_results, get_settled_research_records |
| Operations | get_agent_status, get_data_provider_health, get_system_health, get_ai_budget_status, get_recent_events, get_briefings |
| Live | get_live_scoreboard, get_live_game_state, get_live_boxscore, get_live_player_statistics, get_live_play_by_play, get_live_rotation_history, get_live_team_statistics, get_followed_games, get_followed_players, get_pregame_projection_comparison, get_paper_research_progress |
| Memory | recall_memory, remember *(write: its own memory only)* |
| Jobs | request_research_job *(write: queues `availability_watch` or `market_watch`, at most once per 10 minutes each)* |

Names from the original specification map onto these: usage/usage history/efficiency → `get_player_opportunity_profile`;
minutes history → `get_projected_minutes`; projected/confirmed lineup → `get_lineups`; availability timeline and market
information timeline → `get_availability_changes` / `get_kalshi_market`; market snapshot/price/volume history and
contract rules → `get_kalshi_market`; model projection/distribution → `get_player_markets`; calibration → `get_model_readiness`;
agent latest report → `get_agent_status`; postgame analysis/findings/experiments → `get_paper_testing_results`,
`get_correlation_research`, `get_model_error_history`.

## Rules for adding a tool
1. It calls an existing service function; no new database logic in the tool.
2. Arguments are a pydantic model with `extra="forbid"`, bounded lengths and limits.
3. It is read-only unless there is an owner decision in `docs/DECISIONS.md`.
4. Never: SQL, shell, file access, HTTP fetch, settings, credentials, model promotion, risk policy, budgets,
   order/trade/bet anything. `tests/test_jarvis.py::test_registry_is_bounded_typed_and_has_no_dangerous_capability` guards this.
5. Add it to the table above and extend `test_every_read_tool_runs_against_stored_data`.

## Not available yet (reported as unavailable, never estimated)
Three-point attempts, touches, potential assists, rebound chances, per-possession rates, a validated usage
projection, positional defence splits.
