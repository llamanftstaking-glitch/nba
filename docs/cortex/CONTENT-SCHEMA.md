# CORTEX content schema (for authors of knowledge records and benchmark questions)

All CORTEX knowledge is **original text written for this project**. Never paste text from a book, website,
rulebook or glossary. A source is cited as a pointer ("see") and, where the author actually opened it, as a check.

## Sources — `apps/api/gizer/cortex_data/sources.json`
A JSON list of:
```json
{"key": "nba-stats-glossary", "title": "NBA Stats Glossary", "publisher": "NBA", "url": "https://www.nba.com/stats/help/glossary",
 "league": "NBA", "kind": "official glossary", "reliability": "official", "permission": "public web page; cited by link, not reproduced",
 "accessed": "2026-11-26" or null, "access_result": "opened and read" | "not reachable from the build environment" | "not opened"}
```

## Concepts — `apps/api/gizer/cortex_data/dept_NN.json` (NN = 01..20), each a JSON list of:
```json
{
  "slug": "true-shooting-percentage",            // unique, lowercase, hyphens
  "department": 9,                               // 1..20 (see KNOWLEDGE-TAXONOMY.md)
  "kind": "statistic",                           // rule | statistic | offense | defense | role | concept | context | market | method | live
  "title": "True shooting percentage (TS%)",
  "summary": "One or two plain-language sentences.",
  "body": "120 to 300 words of original explanation: what it is, why it matters, how to read it.",
  "formula": "PTS / (2 * (FGA + 0.44 * FTA))",   // statistics only, else null
  "player_responsibilities": null,                // tactics only: who does what
  "common_responses": null,                       // tactics only: how the other side usually answers
  "limitations": ["...", "..."],                 // 2 to 5 honest limits of the idea or the number
  "when_not_to_use": "…" ,                       // or null
  "observable_in_our_data": ["true_shooting_pct from box scores (get_player_opportunity_profile)"],   // ONLY things in the list below; [] if none
  "data_gaps": ["no shot-location data"],        // what we cannot see for this concept
  "ruleset": "NBA",                              // NBA | FIBA | general
  "season_note": "NBA rules as of the 2025-26 season; re-check after rule changes",   // or null
  "sources": [{"key": "nba-stats-glossary", "note": "definition of TS%"}],
  "verification": "checked_against_source",      // ONLY if you opened the source in this session and the record agrees with it; else "authored_not_checked"
  "related": ["effective-field-goal-percentage", "usage-percentage"],
  "evaluation_questions": ["A player scores 24 points on 15 FGA and 6 FTA. What is his TS%?", "Why can TS% mislead for a low-volume player?"]
}
```

### What our data can actually observe (use these exact phrases in `observable_in_our_data`)
Per player per game (box scores): minutes, points, rebounds, assists, three-pointers made, steals, blocks, turnovers,
field goal attempts, free throw attempts, usage percentage (provider), starter flag, did-not-play records.
Live games only (since 2026-11-25): makes/attempts for FG, 3PT and FT, offensive/defensive rebounds, personal fouls,
plus/minus, play-by-play events with substitutions, derived on-court stints and minutes by quarter, score progression,
team totals including points in the paint and fast-break points.
Derived tools: rolling windows (L3..L30, season), threshold history, splits (home/away, rest, role, opponent),
with/without-teammate splits, opponent allowed-per-game context, minutes profile and rotation class, projected minutes
and stat projections with p10/p90 (models), Kalshi contract observations (price, spread, volume, history), injuries and
lineup status, paper-testing results.
**Not available**: shot locations, play types (pick-and-roll, isolation, post-up frequencies), tracking data (touches,
potential assists, rebound chances, speed, distance), defensive matchups, coverage schemes, lineup data before
2026-11-25, positional defence splits, coach identities, film.

## Rules for authors
* Tactical concepts describe basketball in general. Never say a specific team or player does something.
* No statistics about real players or teams, no records, no "league average is X" numbers unless a source you opened says so and you cite it.
* State NBA versus FIBA differences only when sure; otherwise say the rule differs by competition and should be checked.
* Rules change: give the season the statement applies to, or say it should be re-checked.
* Forbidden words anywhere: lock, guaranteed, free money, risk-free, cannot lose, sure thing.
* Plain, precise English. No hype.

## Benchmark questions — `apps/api/gizer/cortex_data/benchmark.json`, a JSON list of:
```json
{"id": "STAT-001", "category": "advanced_statistics", "split": "dev" | "held_out", "type": "multiple_choice" | "numeric" | "abstain" | "short_answer",
 "question": "...", "choices": ["A ...", "B ...", "C ...", "D ..."] or null, "answer": "B" | 61.4 | "abstain" | "key points",
 "tolerance": 0.2 or null, "must_mention": ["sample size"] or [], "must_not_claim": ["probability"] or [],
 "expected_concepts": ["true-shooting-percentage"], "expected_tools": ["get_basketball_concept"] or [],
 "rationale": "why this is the answer, with the calculation shown", "reviewed": false}
```
Categories: basketball_rules, offensive_tactics, defensive_tactics, coaching, player_roles, advanced_statistics, lineup_analysis,
historical_basketball, data_interpretation, probability, market_contracts, research_integrity.
`abstain` questions are ones a careful analyst must decline or qualify (missing data, false premise, needs current information).
`reviewed` stays false until a person has checked the key.
