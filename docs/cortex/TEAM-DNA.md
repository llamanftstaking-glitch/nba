# CORTEX — Team DNA

`cortex.team_dna(team_id)`, `GET /cortex/teams/{id}/dna`, tool `get_team_dna`. Current season, computed on request.

| Block | Contents | Derivation |
|---|---|---|
| Record | games, wins, losses, home and away records, points for and against per game, differential | final scores |
| Ratings | pace (possessions per game), offensive, defensive and net rating per 100 possessions | only for games where the play-by-play provider recorded possessions; needs at least five |
| Shot volume | threes made, field goal attempts, free throw attempts, turnovers per game | summed box scores |
| Rotation | see COACH-DNA.md | box scores, confirmed starters, live play-by-play |
| Tactical identity | always "not available" | no play-type, shot-location or tracking data |

Not available: effective field goal percentage and three-point attempt rate (attempts are held only for games observed
live), offensive rebound rate, transition and half-court splits, lineup combinations before live collection began,
coaching staff.

A team profile describes the season to date and does not carry over after roster or coaching changes. Early-season
numbers move quickly; every block shows its game count.
