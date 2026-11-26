# GIZER CORTEX — basketball curriculum (table of contents)

Written 2026-11-26. This file lists what the knowledge library contains. The records themselves are in
`apps/api/gizer/cortex_data/dept_01.json` … `dept_20.json`, with the source registry in `sources.json`; the format is
defined in `docs/cortex/CONTENT-SCHEMA.md`. All text is original and written for this project. Status: **IMPLEMENTED**
and **TESTED** at file level: an author-side script reported 0 errors, and `gizer.cortex.read_files()` read 14 sources and
260 concepts with 0 problems on 2026-11-26. Loading into the database, search and the API were **NOT VERIFIED** by the author.

## What "checked" means here
A record marked ✔ has `verification: checked_against_source`: its definition, rule statement or formula was compared
with a source page that was opened on 2026-11-26, and they agree. Pages were read through an automated fetch-and-summarise
tool, not by a person in a browser, so a ✔ means "agrees with what that tool returned from the page". Interpretation,
analytical commentary and statements about this platform's data inside a ✔ record are this project's own and were not
on the source page. Every other record is `authored_not_checked`: written from general basketball and statistical
knowledge, with sources given as pointers only.

## Counts
| Dept | Name | Records | Checked against an opened source | Authored, not checked |
|---|---|---|---|---|
| 01 | Basketball Fundamentals | 25 | 23 | 2 |
| 02 | Offensive Tactical Intelligence | 22 | 0 | 22 |
| 03 | Defensive Tactical Intelligence | 20 | 0 | 20 |
| 04 | Coaching Intelligence | 13 | 0 | 13 |
| 05 | Player Scouting Intelligence | 17 | 0 | 17 |
| 06 | Team Identity Intelligence | 8 | 0 | 8 |
| 07 | Minutes and Rotation Intelligence | 11 | 0 | 11 |
| 08 | Usage and Opportunity Intelligence | 9 | 1 | 8 |
| 09 | Shooting and Efficiency Intelligence | 9 | 0 | 9 |
| 10 | Rebounding Intelligence | 8 | 2 | 6 |
| 11 | Passing and Playmaking Intelligence | 8 | 2 | 6 |
| 12 | Lineup and Teammate Intelligence | 9 | 0 | 9 |
| 13 | Injury and Availability Intelligence | 9 | 2 | 7 |
| 14 | Schedule and Fatigue Intelligence | 7 | 0 | 7 |
| 15 | Matchup Intelligence | 8 | 0 | 8 |
| 16 | Historical Basketball Intelligence | 7 | 1 | 6 |
| 17 | Advanced Statistical Intelligence | 33 | 23 | 10 |
| 18 | Kalshi Market Literacy | 17 | 9 | 8 |
| 19 | Live Game Interpretation | 10 | 0 | 10 |
| 20 | Postgame Research and Learning | 10 | 0 | 10 |
| | **Total** | **260** | **63** | **197** |

## Sources
| Key | Opened this session? | Result |
|---|---|---|
| `nba-stats-glossary` | yes | opened and read |
| `nba-video-rulebook` | yes | opened and read (home page and the Table Stats index page; text only, no video was viewed) |
| `nba-official-rulebook` | yes | opened and read (index plus Rules 3, 4, 5, 6, 7, 9, 12, 13 and 14, read through an automated page summariser; Rules 1, 2, 8, 10, 11 and the Comments on the Rules were not opened) |
| `fiba-wabc` | yes | opened and read (index page listing the manuals only; the manual PDFs themselves were not opened, so no record is checked against them) |
| `pbpstats` | yes | opened and read (repository README only; the documentation site at pbpstats.readthedocs.io was not opened) |
| `nba-api-docs` | yes | opened and read (repository README only) |
| `basketball-data-science` | yes | opened and read (repository README only; individual studies were not opened) |
| `awesome-nba-data` | yes | opened and read (repository README only) |
| `kalshi-docs` | yes | opened and read (landing page, glossary of terms, Get Market reference, orderbook responses, market settlement and fee rounding pages; the fee schedule itself and the exchange rulebook were not found or opened) |
| `basketball-reference-glossary` | yes | opened and read |
| `basketball-reference-per` | yes | opened and read |
| `basketball-reference-ratings` | yes | opened and read |
| `nba-injury-report` | yes | opened and read (page text on reporting requirements and deadlines; the page does not list or define the status designations, and the report PDFs were not opened) |
| `gizer-internal` | yes | opened and read (CLAUDE.md, docs/data/KALSHI.md, docs/operations/LIVE-VALIDATION.md and an excerpt of RESEARCH-CONSTITUTION.md; MINUTES-INTELLIGENCE.md, PLAYER-HISTORICAL-ANALYSIS.md and LINEUP-INTELLIGENCE.md were not opened in this session) |

### Honest list of what could not be opened or was not read
* No source refused access in this session; every registered URL returned content.
* `fiba-wabc`: only the index page listing the coaching manuals was read. The manual PDFs were not opened, so **no tactical or
  coaching record (departments 02 to 05) is checked** against them.
* `nba-official-rulebook`: Rules 3, 4, 5, 6, 7, 9, 12, 13 and 14 were read. Rules 1, 2, 8, 10, 11 and the Comments on the Rules
  were not opened (so goaltending, defensive three seconds, traveling and legal-screen statements are not checked).
* `nba-video-rulebook`: the home page and the Table Stats index were read as text; no video was viewed.
* `nba-injury-report`: the page states reporting duties and deadlines but does not list or define the status designations,
  so the designation record is not checked. The expected `official.nba.com` address redirected to `nba.com/players/injury-report`.
* `kalshi-docs`: the landing page, terms, Get Market, orderbook responses, market settlement and fee rounding pages were read.
  The fee schedule and the exchange rulebook were not found; multivariate (combination) pages were seen in an index only.
  No fee rate is stated anywhere in the library.
* `pbpstats`, `nba-api-docs`, `basketball-data-science`, `awesome-nba-data`: repository README only; the pbpstats documentation site
  and the individual studies were not opened.
* `gizer-internal`: `CLAUDE.md`, `docs/data/KALSHI.md`, `docs/operations/LIVE-VALIDATION.md` and an excerpt of
  `RESEARCH-CONSTITUTION.md` were read; `MINUTES-INTELLIGENCE.md`, `PLAYER-HISTORICAL-ANALYSIS.md` and `LINEUP-INTELLIGENCE.md` were not.
* Stated from general knowledge and not verified: league history (eras, the growth of three-point shooting, dates of rule
  changes), the regular-season schedule format, research on streak shooting, travel and altitude, and league policy on resting players.

## Known definitional traps recorded in the library
* STL% and BLK% mean different things on NBA.com (share of the team's steals or blocks) and on Basketball-Reference (share of
  opponent possessions or two-point attempts). Both are described; the formula given is the Basketball-Reference one.
* USG%, AST% and turnover measures have a box-score estimate and a possession-counted NBA.com form.
* The free throw coefficient is 0.44 in TS%, USG% and TOV% and 0.4 in the Basketball-Reference possession estimate.
* "Offensive rating" and "defensive rating" name both on-court team measures (NBA.com) and Dean Oliver's individual estimates
  (Basketball-Reference).
* PER's formula is deliberately not reproduced; the record points to the article that defines it.

## Contents by department
✔ = checked against an opened source.

## 01 · Basketball Fundamentals
`apps/api/gizer/cortex_data/dept_01.json` — 25 records, 23 checked against an opened source, 2 authored and not checked.

* Game structure and regulation time — `game-structure-and-regulation` (rule) ✔ — sources cited: nba-official-rulebook
* Overtime — `overtime-period` (rule) ✔ — sources cited: nba-official-rulebook
* Scoring values: two, three and one — `scoring-values` (rule) ✔ — sources cited: nba-official-rulebook
* Possession — `possession` (concept) ✔ — sources cited: nba-official-rulebook, nba-stats-glossary
* The 24-second shot clock — `shot-clock-24` (rule) ✔ — sources cited: nba-official-rulebook
* The 14-second reset — `shot-clock-14-reset` (rule) ✔ — sources cited: nba-official-rulebook
* Personal fouls and disqualification — `personal-fouls-and-fouling-out` (rule) ✔ — sources cited: nba-official-rulebook
* Team fouls and the penalty (bonus) — `team-fouls-and-penalty` (rule) ✔ — sources cited: nba-official-rulebook
* Substitutions — `substitutions` (rule) ✔ — sources cited: nba-official-rulebook
* Timeouts — `timeouts` (rule) ✔ — sources cited: nba-official-rulebook
* Offensive and defensive rebounds — `offensive-and-defensive-rebound` (rule) ✔ — sources cited: nba-official-rulebook, nba-stats-glossary, nba-video-rulebook
* Turnover — `turnover` (rule) ✔ — sources cited: nba-stats-glossary, nba-video-rulebook
* Assist (official scoring judgement) — `assist` (rule) ✔ — sources cited: nba-stats-glossary, nba-video-rulebook
* Steal — `steal` (rule) ✔ — sources cited: nba-stats-glossary, nba-video-rulebook
* Blocked shot — `block` (rule) ✔ — sources cited: nba-stats-glossary, nba-video-rulebook
* Coach's challenge — `coachs-challenge` (rule) ✔ — sources cited: nba-official-rulebook
* Instant replay review — `instant-replay` (rule) ✔ — sources cited: nba-official-rulebook
* Official scoring and stat corrections — `official-scoring-and-stat-corrections` (concept)
* Technical fouls — `technical-fouls` (rule) ✔ — sources cited: nba-official-rulebook
* Flagrant fouls — `flagrant-fouls` (rule) ✔ — sources cited: nba-official-rulebook
* Free throws — `free-throws` (rule) ✔ — sources cited: nba-official-rulebook
* Jump balls and opening possession — `jump-ball-and-opening-possession` (rule) ✔ — sources cited: nba-official-rulebook
* Clear-path foul — `clear-path-foul` (rule) ✔ — sources cited: nba-official-rulebook
* Away-from-the-play foul — `away-from-play-foul` (rule) ✔ — sources cited: nba-official-rulebook
* Garbage time (analytical term) — `garbage-time` (concept)

## 02 · Offensive Tactical Intelligence
`apps/api/gizer/cortex_data/dept_02.json` — 22 records, 0 checked against an opened source, 22 authored and not checked.

* Pick-and-roll — `pick-and-roll` (offense)
* Pick-and-pop — `pick-and-pop` (offense)
* Isolation — `isolation` (offense)
* Post-up — `post-up` (offense)
* Motion offense — `motion-offense` (offense)
* Five-out spacing — `five-out` (offense)
* Four-out, one-in — `four-out-one-in` (offense)
* Horns set — `horns` (offense)
* Spain pick-and-roll — `spain-pick-and-roll` (offense)
* Dribble handoff (DHO) — `dribble-handoff` (offense)
* Pin-down screen — `pin-down-screen` (offense)
* Flare screen — `flare-screen` (offense)
* Back screen — `back-screen` (offense)
* Backdoor cut — `backdoor-cut` (offense)
* Transition offense — `transition-offense` (offense)
* Drive-and-kick — `drive-and-kick` (offense)
* Weak-side action — `weak-side-action` (offense)
* Catch-and-shoot — `catch-and-shoot` (offense)
* Spacing — `spacing` (offense)
* Secondary creation — `secondary-creation` (offense)
* Short roll — `short-roll` (offense)
* Pace and early offense — `pace-and-early-offense` (offense)

## 03 · Defensive Tactical Intelligence
`apps/api/gizer/cortex_data/dept_03.json` — 20 records, 0 checked against an opened source, 20 authored and not checked.

* Man-to-man defense — `man-to-man-defense` (defense)
* Zone defense (2-3 and 3-2) — `zone-defense` (defense)
* Matchup zone — `matchup-zone` (defense)
* Drop coverage — `drop-coverage` (defense)
* Switching — `switching-defense` (defense)
* Hedge and show — `hedge-and-show` (defense)
* Blitz and trap — `blitz-and-trap` (defense)
* Ice (down) coverage — `ice-coverage` (defense)
* Help defense — `help-defense` (defense)
* Rim protection — `rim-protection` (defense)
* Closeouts — `closeouts` (defense)
* Defensive rotations — `rotations` (defense)
* Weak-side help and tagging the roller — `weak-side-help-and-tagging` (defense)
* Transition defense — `transition-defense` (defense)
* Defensive rebounding and boxing out — `defensive-rebounding-and-boxing-out` (defense)
* Perimeter containment — `perimeter-containment` (defense)
* Screen navigation: over and under — `screen-navigation-over-under` (defense)
* No-middle defense — `no-middle-defense` (defense)
* Pre-switching and scram switching — `pre-switching-and-scram` (defense)
* Late-game fouling strategy — `late-game-fouling-strategy` (defense)

## 04 · Coaching Intelligence
`apps/api/gizer/cortex_data/dept_04.json` — 13 records, 0 checked against an opened source, 13 authored and not checked.

* Rotation length — `rotation-length` (concept)
* Staggering stars — `staggering-stars` (concept)
* Closing lineups — `closing-lineups` (concept)
* Substitution patterns — `substitution-patterns` (concept)
* Foul-trouble management — `foul-trouble-management` (concept)
* Timeout usage — `timeout-usage` (concept)
* Rest and load management — `rest-and-load-management` (concept)
* Back-to-back handling — `back-to-back-handling` (concept)
* Blowout management — `blowout-management` (concept)
* Minutes restrictions (coaching side) — `minutes-restrictions-coaching` (concept)
* Matchup-driven lineup changes — `matchup-driven-lineup-changes` (concept)
* After-timeout plays (ATOs) — `after-timeout-plays` (concept)
* End-of-quarter management and the two-for-one — `two-for-one-and-end-of-quarter` (concept)

## 05 · Player Scouting Intelligence
`apps/api/gizer/cortex_data/dept_05.json` — 17 records, 0 checked against an opened source, 17 authored and not checked.

* Primary creator — `primary-creator` (role)
* Secondary creator — `secondary-creator` (role)
* Off-ball scorer — `off-ball-scorer` (role)
* Facilitator — `facilitator` (role)
* Floor spacer — `floor-spacer` (role)
* Interior scorer — `interior-scorer` (role)
* Rim runner — `rim-runner` (role)
* Rebounder — `rebounder` (role)
* Rim protector — `rim-protector` (role)
* Point-of-attack defender — `point-of-attack-defender` (role)
* Wing stopper — `wing-stopper` (role)
* Connector — `connector` (role)
* Stretch big — `stretch-big` (role)
* Sixth man and microwave scorer — `sixth-man` (role)
* Rotation reserve — `rotation-reserve` (role)
* Reading a role from box-score evidence — `reading-role-from-box-score` (concept)
* Why archetypes are descriptive and overlap — `archetypes-are-descriptive` (concept)

## 06 · Team Identity Intelligence
`apps/api/gizer/cortex_data/dept_06.json` — 8 records, 0 checked against an opened source, 8 authored and not checked.

* Pace identity — `pace-identity` (context)
* Shot-profile identity — `shot-profile-identity` (context)
* Defensive identity — `defensive-identity` (context)
* Depth — `depth-identity` (context)
* Star-dependence — `star-dependence` (context)
* Continuity — `continuity` (context)
* Why team identities expire — `identities-expire` (context)
* Team identity versus a single game — `identity-versus-single-game` (context)

## 07 · Minutes and Rotation Intelligence
`apps/api/gizer/cortex_data/dept_07.json` — 11 records, 0 checked against an opened source, 11 authored and not checked.

* Minutes as opportunity — `minutes-as-opportunity` (concept)
* Rotation stability — `rotation-stability` (concept)
* Starter versus bench minutes — `starter-vs-bench-minutes` (concept)
* Minutes distribution and variance — `minutes-distribution-and-variance` (concept)
* Return-from-injury minutes ramp — `return-from-injury-ramp` (concept)
* Blowout risk to minutes — `blowout-risk-to-minutes` (concept)
* Overtime effect on minutes — `overtime-effect-on-minutes` (concept)
* Foul-trouble effect on minutes — `foul-trouble-effect-on-minutes` (concept)
* Projected-minutes uncertainty — `projected-minutes-uncertainty` (concept)
* Minutes tiers and rotation classes are descriptive — `rotation-class-is-descriptive` (concept)
* A missed game is not a zero — `did-not-play-is-not-a-zero` (concept)

## 08 · Usage and Opportunity Intelligence
`apps/api/gizer/cortex_data/dept_08.json` — 9 records, 1 checked against an opened source, 8 authored and not checked.

* Usage as a measure of opportunity — `usage-as-opportunity` (concept)
* Shot volume — `shot-volume` (concept)
* Touches (not in our data) — `touches-not-in-our-data` (concept) ✔ — sources cited: nba-stats-glossary
* Usage redistribution when a teammate is out — `usage-redistribution` (concept)
* On-ball versus off-ball opportunity — `on-ball-vs-off-ball-opportunity` (concept)
* Per-minute versus per-possession rates — `per-minute-versus-per-possession` (concept)
* Role change versus noise — `role-change-versus-noise` (concept)
* Free throw attempts as opportunity — `free-throw-attempts-as-opportunity` (concept)
* Opportunity is shared among teammates — `opportunity-is-shared` (concept)

## 09 · Shooting and Efficiency Intelligence
`apps/api/gizer/cortex_data/dept_09.json` — 9 records, 0 checked against an opened source, 9 authored and not checked.

* Reading true shooting percentage — `reading-true-shooting` (concept)
* Reading effective field goal percentage — `reading-effective-field-goal` (concept)
* Three-point variance and small samples — `three-point-variance` (concept)
* Free throw rate as a skill — `free-throw-rate-as-skill` (concept)
* Shot quality versus shot making — `shot-quality-versus-shot-making` (concept)
* Hot streaks and regression — `hot-hand-and-regression` (concept)
* The efficiency-volume trade-off — `efficiency-versus-volume` (concept)
* Points per shot attempt — `points-per-shot-attempt` (statistic)
* Shooting percentages in small samples — `small-sample-shooting` (method)

## 10 · Rebounding Intelligence
`apps/api/gizer/cortex_data/dept_10.json` — 8 records, 2 checked against an opened source, 6 authored and not checked.

* Reading OREB%, DREB% and REB% — `reading-rebound-percentages` (concept)
* Rebound chances (not in our data) — `rebound-chances` (concept) ✔ — sources cited: nba-stats-glossary
* Contested versus uncontested rebounds — `contested-vs-uncontested-rebounds` (concept) ✔ — sources cited: nba-stats-glossary
* Team scheme: crash the glass or get back — `crash-versus-get-back` (context)
* Rebounding follows pace and missed shots — `rebounds-follow-missed-shots` (concept)
* Positional rebounding — `positional-rebounding` (concept)
* The value of an offensive rebound — `offensive-rebounding-value` (concept)
* Rebounding with and without teammates — `rebounding-with-and-without-teammates` (concept)

## 11 · Passing and Playmaking Intelligence
`apps/api/gizer/cortex_data/dept_11.json` — 8 records, 2 checked against an opened source, 6 authored and not checked.

* The assist as evidence of playmaking — `assist-as-playmaking-evidence` (concept)
* Potential assists (not in our data) — `potential-assists` (concept) ✔ — sources cited: nba-stats-glossary
* Reading assist percentage — `reading-assist-percentage` (concept)
* Assist-to-turnover ratio — `assist-to-turnover-ratio` (statistic)
* Hockey assist (secondary assist) — `hockey-assist` (concept) ✔ — sources cited: nba-stats-glossary
* Playmaking depends on teammates' shooting — `playmaking-dependence-on-teammate-shooting` (concept)
* Reading turnover percentage — `reading-turnover-percentage` (concept)
* Game-to-game variance in assists — `assist-variance` (concept)

## 12 · Lineup and Teammate Intelligence
`apps/api/gizer/cortex_data/dept_12.json` — 9 records, 0 checked against an opened source, 9 authored and not checked.

* Reading on/off numbers — `on-off-reading` (concept)
* Plus/minus and its noise — `plus-minus-noise` (concept)
* Lineup data and sample size — `lineup-data-and-sample-size` (concept)
* With/without-teammate splits — `with-without-splits` (concept)
* Confounding in with/without comparisons — `confounding-in-with-without` (method)
* Complementary skills — `complementary-skills` (concept)
* Stagger seen in lineup data — `stagger-lineup-view` (concept)
* Net rating by lineup — `net-rating-by-lineup` (statistic)
* Check teammate availability before reading any line — `teammate-availability-first` (method)

## 13 · Injury and Availability Intelligence
`apps/api/gizer/cortex_data/dept_13.json` — 9 records, 2 checked against an opened source, 7 authored and not checked.

* Status designations are reported labels — `status-designations` (context)
* Injury report timing — `injury-report-timing` (context) ✔ — sources cited: nba-injury-report
* Game-time decision — `game-time-decision` (context)
* Reported minutes restrictions — `minutes-restriction-reported` (context)
* Return-to-play ramp — `return-to-play-ramp` (context)
* Rest and injury-management designations — `rest-and-injury-management-designations` (context) ✔ — sources cited: nba-injury-report
* Why a diagnosis must never be inferred — `never-infer-a-diagnosis` (concept)
* Availability changes create new events — `availability-changes-create-updates` (method)
* Late scratches — `late-scratch` (context)

## 14 · Schedule and Fatigue Intelligence
`apps/api/gizer/cortex_data/dept_14.json` — 7 records, 0 checked against an opened source, 7 authored and not checked.

* Back-to-backs — `back-to-backs` (context)
* Rest days — `rest-days` (context)
* Travel and time zones — `travel-and-time-zones` (context)
* Altitude — `altitude` (context)
* Schedule density — `schedule-density` (context)
* Why fatigue must not be asserted without evidence — `fatigue-requires-evidence` (concept)
* Selection effects in schedule splits — `schedule-splits-selection` (method)

## 15 · Matchup Intelligence
`apps/api/gizer/cortex_data/dept_15.json` — 8 records, 0 checked against an opened source, 8 authored and not checked.

* Pace interaction between two teams — `pace-interaction` (context)
* Opponent defensive strength — `opponent-defensive-strength` (context)
* Positional matchups (not in our data) — `positional-matchups` (context)
* Small head-to-head samples — `small-head-to-head-samples` (context)
* Style clashes — `style-clashes` (context)
* Blowout probability and garbage time as a matchup feature — `blowout-and-garbage-time-matchup` (context)
* Home and away — `home-and-away` (context)
* Matchup context is a mild adjustment, not the forecast — `matchup-context-is-a-mild-adjustment` (method)

## 16 · Historical Basketball Intelligence
`apps/api/gizer/cortex_data/dept_16.json` — 7 records, 1 checked against an opened source, 6 authored and not checked.

* Eras and changes in pace — `era-and-pace-changes` (context)
* The three-point revolution — `three-point-revolution` (context)
* Rule changes that affect statistics — `rule-changes-and-statistics` (context)
* Why cross-era comparisons need adjustment — `cross-era-comparison` (method)
* Which statistics exist for which eras — `stat-availability-by-era` (context) ✔ — sources cited: basketball-reference-glossary, basketball-reference-per
* Sample size and regression in historical records — `small-samples-in-history` (method)
* Survivorship bias — `survivorship-bias` (method)

## 17 · Advanced Statistical Intelligence
`apps/api/gizer/cortex_data/dept_17.json` — 33 records, 23 checked against an opened source, 10 authored and not checked.

* Usage percentage (USG%) — `usage-percentage` (statistic) ✔ — sources cited: basketball-reference-glossary, nba-stats-glossary
* True shooting percentage (TS%) — `true-shooting-percentage` (statistic) ✔ — sources cited: basketball-reference-glossary, nba-stats-glossary
* Effective field goal percentage (eFG%) — `effective-field-goal-percentage` (statistic) ✔ — sources cited: basketball-reference-glossary, nba-stats-glossary
* Assist percentage (AST%) — `assist-percentage` (statistic) ✔ — sources cited: basketball-reference-glossary, nba-stats-glossary
* Total rebound percentage (REB% / TRB%) — `total-rebound-percentage` (statistic) ✔ — sources cited: basketball-reference-glossary, nba-stats-glossary
* Offensive rebound percentage (OREB%) — `offensive-rebound-percentage` (statistic) ✔ — sources cited: basketball-reference-glossary, nba-stats-glossary
* Defensive rebound percentage (DREB%) — `defensive-rebound-percentage` (statistic) ✔ — sources cited: basketball-reference-glossary, nba-stats-glossary
* Turnover percentage (TOV%) — `turnover-percentage` (statistic) ✔ — sources cited: basketball-reference-glossary, nba-stats-glossary
* Steal percentage (STL%) — `steal-percentage` (statistic) ✔ — sources cited: basketball-reference-glossary, nba-stats-glossary
* Block percentage (BLK%) — `block-percentage` (statistic) ✔ — sources cited: basketball-reference-glossary, nba-stats-glossary
* Offensive rating (ORtg / OffRtg) — `offensive-rating` (statistic) ✔ — sources cited: basketball-reference-ratings, nba-stats-glossary
* Defensive rating (DRtg / DefRtg) — `defensive-rating` (statistic) ✔ — sources cited: basketball-reference-ratings, nba-stats-glossary
* Net rating (NetRtg) — `net-rating` (statistic) ✔ — sources cited: nba-stats-glossary
* Pace — `pace` (statistic) ✔ — sources cited: basketball-reference-glossary, nba-stats-glossary
* Possessions estimate — `possessions-estimate` (statistic) ✔ — sources cited: basketball-reference-glossary, pbpstats
* Player efficiency rating (PER) — `player-efficiency-rating` (statistic) ✔ — sources cited: basketball-reference-glossary, basketball-reference-per
* Player impact estimate (PIE) — `player-impact-estimate` (statistic) ✔ — sources cited: nba-stats-glossary
* On-off differential — `on-off-differential` (statistic)
* Plus/minus (+/-) — `plus-minus` (statistic) ✔ — sources cited: basketball-reference-glossary, nba-stats-glossary
* Shot frequency (shot mix) — `shot-frequency` (statistic) ✔ — sources cited: nba-stats-glossary
* Per-minute rates — `per-minute-rates` (statistic)
* Per-36-minute statistics — `per-36-minutes` (statistic) ✔ — sources cited: basketball-reference-glossary
* Per-100-possession statistics — `per-100-possessions` (statistic)
* Free throw rate (FTA rate) — `free-throw-rate` (statistic) ✔ — sources cited: nba-stats-glossary
* Assist ratio — `assist-ratio` (statistic) ✔ — sources cited: nba-stats-glossary
* Game Score — `game-score` (statistic) ✔ — sources cited: basketball-reference-glossary
* Sample size and confidence — `sample-size-and-confidence` (method)
* Regression to the mean — `regression-to-the-mean` (method)
* Distribution versus average (median and percentiles) — `distribution-versus-average` (method)
* Correlation versus causation — `correlation-versus-causation` (method)
* Calibration — `calibration` (method)
* Overfitting and data leakage — `overfitting-and-leakage` (method)
* Base rates — `base-rates` (method)

## 18 · Kalshi Market Literacy
`apps/api/gizer/cortex_data/dept_18.json` — 17 records, 9 checked against an opened source, 8 authored and not checked.

* Binary event contract — `binary-event-contract` (market) ✔ — sources cited: gizer-internal, kalshi-docs
* YES and NO prices as cents on the dollar — `yes-no-price` (market) ✔ — sources cited: kalshi-docs
* Bid, ask and spread — `bid-ask-spread` (market) ✔ — sources cited: kalshi-docs
* Midpoint — `midpoint-price` (market)
* Last price — `last-price` (market) ✔ — sources cited: kalshi-docs
* Volume — `volume` (market) ✔ — sources cited: gizer-internal, kalshi-docs
* Open interest — `open-interest` (market) ✔ — sources cited: kalshi-docs
* Liquidity — `liquidity` (market)
* Settlement rules and why exact wording matters — `settlement-rules-and-wording` (market) ✔ — sources cited: gizer-internal, kalshi-docs
* Threshold contracts ('N or more') — `threshold-contracts` (market) ✔ — sources cited: gizer-internal, kalshi-docs
* Break-even including fees — `break-even-including-fees` (market)
* A market price is not our model's probability — `price-is-not-model-probability` (market)
* Market movement is an observation — `market-movement-is-an-observation` (market)
* First observed is not the opening price — `first-observed-is-not-opening` (market)
* Protected and special structures need separate handling — `protected-and-special-structures` (market)
* Combination contracts are not assumed to exist — `combination-contracts-not-assumed` (market)
* Market status and lifecycle — `market-status-and-lifecycle` (market) ✔ — sources cited: kalshi-docs

## 19 · Live Game Interpretation
`apps/api/gizer/cortex_data/dept_19.json` — 10 records, 0 checked against an opened source, 10 authored and not checked.

* Reading a box score in progress — `reading-a-box-score-in-progress` (live)
* Foul-trouble thresholds as conventions — `foul-trouble-thresholds-live` (live)
* Pace of a game in progress — `pace-of-a-game-in-progress` (live)
* Runs and score progression — `runs-and-score-progression` (live)
* Garbage time detection as a judgement — `garbage-time-detection-live` (live)
* Minutes versus projection mid-game — `minutes-versus-projection-mid-game` (live)
* Why live data is delayed — `why-live-data-is-delayed` (live)
* Stale feeds and last verified values — `stale-feed-handling` (live)
* Why no in-game probability exists on this platform — `no-in-game-probability` (live)
* Stat corrections after the game — `stat-corrections-after-the-game` (live)

## 20 · Postgame Research and Learning
`apps/api/gizer/cortex_data/dept_20.json` — 10 records, 0 checked against an opened source, 10 authored and not checked.

* Forecast error: MAE and bias — `forecast-error-mae-and-bias` (statistic)
* Calibration curves — `calibration-curves` (method)
* Comparing projection to outcome without hindsight bias — `hindsight-bias-in-review` (method)
* Single-game noise — `single-game-noise` (method)
* Research hypotheses and controlled experiments — `research-hypotheses-and-experiments` (method)
* Why one failure does not change a model — `one-failure-does-not-change-a-model` (method)
* Promotion gates — `promotion-gates` (method)
* Paper testing — `paper-testing` (method)
* Selection effects in ranked picks — `selection-effects-in-ranked-picks` (method)
* Attributing error to minutes or to rate — `error-attribution-minutes-versus-rate` (method)
