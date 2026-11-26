# CORTEX — knowledge taxonomy

| # | Department | Record kinds | Tools that supply evidence |
|---|---|---|---|
| 01 | Basketball Fundamentals | rule, concept | get_basketball_concept |
| 02 | Offensive Tactical Intelligence | offense | (none in our data: concepts only) |
| 03 | Defensive Tactical Intelligence | defense | get_opponent_defensive_context (totals allowed, not schemes) |
| 04 | Coaching Intelligence | concept | get_team_dna (rotation tendencies), get_live_rotation_history |
| 05 | Player Scouting Intelligence | role, concept | get_player_dna |
| 06 | Team Identity Intelligence | concept | get_team_dna |
| 07 | Minutes and Rotation Intelligence | concept | get_projected_minutes, get_minutes_table, get_live_rotation_history |
| 08 | Usage and Opportunity Intelligence | concept, statistic | get_player_opportunity_profile, get_teammate_availability_splits |
| 09 | Shooting and Efficiency Intelligence | statistic, concept | get_player_opportunity_profile, get_live_boxscore |
| 10 | Rebounding Intelligence | statistic, concept | get_player_rolling_averages, get_opponent_defensive_context |
| 11 | Passing and Playmaking Intelligence | statistic, concept | get_player_rolling_averages |
| 12 | Lineup and Teammate Intelligence | concept, statistic | get_teammate_availability_splits, get_live_rotation_history |
| 13 | Injury and Availability Intelligence | context | get_current_injury_report, get_availability_changes |
| 14 | Schedule and Fatigue Intelligence | context | get_player_historical_splits (rest), get_daily_slate |
| 15 | Matchup Intelligence | context, concept | get_opponent_defensive_context, get_game_details |
| 16 | Historical Basketball Intelligence | concept | (concepts only) |
| 17 | Advanced Statistical Intelligence | statistic, method | get_basketball_concept and the statistical tools |
| 18 | Kalshi Market Literacy | market | get_available_kalshi_markets, get_kalshi_market |
| 19 | Live Game Interpretation | live | the live tools |
| 20 | Postgame Research and Learning | method | get_paper_testing_results, get_model_error_history, get_correlation_research |

Each record carries: definition (summary and body), sources, structured fields (formula, responsibilities, responses),
what our data can observe for it, data gaps, limitations, when not to use it, and evaluation questions.
The record format is in CONTENT-SCHEMA.md. The table of contents is BASKETBALL-CURRICULUM.md.
