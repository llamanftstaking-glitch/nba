# Lineup intelligence

## Statuses
| Status | Exact meaning | Source |
|---|---|---|
| `confirmed` | The game's box score lists five starters for the team. Available at or after tipoff. | ESPN box score |
| `projected` | GIZER's deterministic projection: the team's most recent confirmed starting five; players now out (latest injury report) or no longer on the team are replaced by the available rotation player with the most projected minutes. **Not official.** | Derived |
| `unknown` | No confirmed lineup and no basis to project five real players. Starters are empty — never padded. | — |

A projection never becomes `confirmed` without a box score, an incomplete starter list (fewer than five) is not a
confirmation, and a confirmed lineup is never downgraded by a later projection. All three rules are tested.

There is **no pre-tipoff confirmed-lineup source** in the current provider set (none is free and authorized).
Positions are the provider's designation (G/F/C); the system does not invent PG/SG/SF/PF/C slots.

## Data
* `player_box.starter` — confirmed starter flag per appearance (1,444 of 1,477 games; the rest had incomplete source data).
* `player_absences` — rostered players who did not appear, with the published reason (6,341 rows).
* `lineup_snapshots` — append-only; one row per team per material change, with a plain-language `change` text.
* `research_events(kind='lineup_change')` — audit trail of changes.
* Player rows carry availability (injury status text), projected minutes, last-5 average minutes, starts in last 10.

## Change handling
Lineups are refreshed at 08:00 ET and with every edition and pregame checkpoint (~90/60/30/10 minutes before
tipoff; the box score is polled only inside 45 minutes of tipoff). When the signature (status, starters and their
availability, unavailable list) changes: the previous snapshot is kept, a new one is appended, the change is
recorded, and the edition published in the same job re-evaluates every selection — reclassifications appear in
the edition's change list and invalidations as audit events.

## Limits
The projection model does **not yet change minutes projections when a teammate is ruled out**; it flags the
absence as opposing evidence instead. Bench rotation order is by projected minutes, not a reported rotation.
