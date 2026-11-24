# Minutes and rotation intelligence

## Profile (per player, reproducible from box scores)
Season average and median; last 3 / 5 / 10 / 20 appearance averages; minimum, maximum and standard deviation
over the last 10; starts in the last 10; season starts and bench appearances (where starter status is known);
days since the previous appearance; a role-change flag when the last-5 average differs from the last-20 by six
minutes or more.

## Projection
`minutes_blend 1.0.0` = 0.6 × recent exponentially weighted average (half-life 4 games) + 0.4 × last-10 average.
This is the projection every player stat model already uses. The uncertainty band is the 10th–90th percentile
of out-of-sample projection error for players in the same projected-minutes tier.

**Validation (2026-11-24, 7,211 out-of-sample player-games): the model did not pass its gate** — its average
error (5.40 minutes) is slightly worse than a plain recent-average baseline (5.34), outside the 1% tolerance.
Band coverage was 76.6% against a nominal 80%. It is registered as a candidate and labelled so in the product.
The gate was not relaxed. Replacing the blend with the better baseline is a proposed challenger; it must be
judged on later data because this evaluation period has now been looked at.

What the projection does **not** use: teammate absences, reported minutes restrictions (no authorized source),
coaching changes, foul trouble, blowout or overtime risk beyond what recent history reflects.

## Is a higher minutes tier more predictable? (measured)
| Projected minutes | n | Minutes MAE | Points MAE | Points MAE / mean points |
|---|---|---|---|---|
| 35+ | 258 | 3.68 | 6.31 | 0.28 |
| 30–34.9 | 1,370 | 4.37 | 5.74 | 0.32 |
| 25–29.9 | 1,645 | 5.29 | 5.42 | 0.42 |
| 20–24.9 | 1,677 | 5.50 | 4.91 | 0.53 |
| Below 20 | 2,261 | 6.21 | 4.23 | 0.69 |

Higher-minute players had smaller minutes error and smaller *relative* points error, but larger *absolute*
points error. So a 35-minute player is not simply "more predictable": it depends on whether the question is
about a proportion or a count. Tiers are therefore descriptive context and are not used as a qualification rule.

## Rotation classification (configurable in `minutes.RULES`, re-evaluated on every request)
Returning injured player (gap of 10+ days within the last three appearances) · Uncertain role (fewer than five
appearances, or listed questionable / doubtful / day-to-day) · High-minute starter (8+ starts in the last 10,
32+ minutes, standard deviation ≤ 6) · Stable starter · Variable rotation player (standard deviation > 6) ·
Primary rotation player (24+ minutes) · Secondary rotation player (15–24) · Limited-minute player.
Classes describe recent observed role only; they never raise or lower a research classification.

## Not available
Usage, shot attempts and free-throw attempts are stored per game and shown in game logs; touches, potential
assists, rebound chances and per-possession production are not ingested (no authorized tracking source).
