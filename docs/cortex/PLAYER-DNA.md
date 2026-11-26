# CORTEX — Player DNA

`cortex.player_dna(player_id)`, `GET /cortex/players/{id}/dna`, tool `get_player_dna`. Computed on request from stored
box scores for the current season; nothing is stored, so a profile always reflects the data.

| Block | Contents | Derivation |
|---|---|---|
| Identity | id, name, current team, position, jersey, headshot, last game | players table. **Not held:** height, weight, age, roster status |
| Team history | season, team, games, first and last date | grouped box scores |
| Season line | games, minutes, mpg, minutes sd, usage (and games with usage), per-36 points, rebounds, assists, threes made, steals, blocks, turnovers, FGA, FTA, true shooting, share of games started | sums over appearances; per 36 = total / minutes * 36; TS = PTS / (2 * (FGA + 0.44 * FTA)) |
| Recent 10 | minutes, points, rebounds, assists, usage | last ten appearances |
| Archetypes | zero or more labels, each with its rule | rules below; only with at least 8 games and 150 minutes |
| Teammate context | per main teammate: games with / without, usage with / without, small-sample flag | `get_teammate_availability_splits` |
| Tactical profile | always "not available" | no play-type, shot-location, tracking or film data |

## Archetype rules (this platform's conventions, not validated cut-offs)
| Label | Rule |
|---|---|
| Primary creator | usage >= 26% and assists per 36 >= 5.5 |
| Secondary creator | usage 20% to 26% and assists per 36 >= 4 |
| Facilitator | assists per 36 >= 7 and usage below 22% |
| High-volume scorer | points per 36 >= 22 and field goal attempts per 36 >= 16 |
| Floor spacer | three-pointers made per 36 >= 2.5 and usage below 22% |
| Rebounder | rebounds per 36 >= 10 |
| Shot blocker | blocks per 36 >= 1.8 |
| Steals-generating defender | steals per 36 >= 1.8 |
| Low-usage role player | usage below 15% with at least 18 minutes a game |
| Rotation reserve | 10 to 20 minutes a game and started fewer than a quarter of known-role appearances |

Labels are descriptions of this season's box scores. They overlap, can be absent, and change as the season does.
They are not predictions, not scouting judgements, and not model inputs. Defensive labels are limited to what steals
and blocks can show, which is very little about defence.

Not available: assist, rebound and turnover percentages (need team totals while on court), shot distribution,
play-type frequencies, defensive matchups.
