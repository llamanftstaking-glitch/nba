# GIZER CORTEX — architecture

CORTEX is the basketball knowledge layer inside JARVIS. It is part of the existing application: same API process,
same PostgreSQL database, same tool registry and budget controller. It adds no service and no paid dependency.

```
JARVIS conversation ──► tools (jarvis_tools.py, group "cortex")
                           │
        ┌──────────────────┼───────────────────────────────┐
        ▼                  ▼                               ▼
 knowledge library   evidence-derived profiles      existing research data
 (cortex_concepts,   (player_dna, team_dna:         (box scores, live games, Kalshi,
  cortex_sources)     computed on request)           models, editions, findings)
        ▲
 files in apps/api/gizer/cortex_data/*.json  ── loaded by `gizer seed` / `gizer cortex-load` (idempotent, versioned)
```

## Two kinds of content, never mixed
| | Knowledge records | DNA profiles |
|---|---|---|
| What | General basketball knowledge: rules, tactics, roles, statistics, market literacy, methods | What this platform's records show about one player or team this season |
| Where from | Original text in version-controlled files, each with sources and a verification status | Computed on request from stored box scores, final scores and live play-by-play |
| Can it name a team or player? | No | Yes, with the numbers and the rule behind every label |
| Changes when | A file is edited (new version number) | The underlying data changes |

A concept is never evidence that a particular team does it. A profile never contains an opinion.

## What is built
* 20 departments (KNOWLEDGE-TAXONOMY.md), a source registry (SOURCE-REGISTRY.md), the library loader with validation.
* Keyword retrieval with ranking, filters and a retrieval log (RETRIEVAL-ENGINE.md).
* Player profiles and team profiles including rotation tendencies (PLAYER-DNA.md, TEAM-DNA.md, COACH-DNA.md).
* JARVIS tools: `search_basketball_knowledge`, `get_basketball_concept`, `get_player_dna`, `get_team_dna`,
  `get_knowledge_coverage`, `get_knowledge_sources`, plus `get_teammate_availability_splits` and
  `get_opponent_defensive_context`. Requested names that map to existing tools: statistical and tactical definitions →
  `get_basketball_concept`; coach DNA and rotation observations → `get_team_dna`; lineup history and live game context →
  the live tools; research hypotheses and validated findings → `get_correlation_research`; model limitations →
  `get_model_readiness`.
* The Knowledge Center at `/cortex`.
* A benchmark with deterministic grading (BENCHMARKS.md).

## What is not built, and why
| Item | Status | Reason |
|---|---|---|
| Semantic (embedding) search | Not built | See RETRIEVAL-ENGINE.md: no room for a local model on Server M today, and an external provider needs owner approval |
| Possession-level reconstruction | Not built | Needs complete play-by-play history; we hold it only for games observed live since 2026-11-25 |
| Coach identities and staff | Not held | No source ingested. Rotation tendencies are attributed to the team, not to a named coach |
| Play types, shot locations, tracking, matchups | Not held | No authorised source. These stay "not available" everywhere |
| Film study | Design only | No footage pipeline, no computer vision. Nothing is claimed |
| Knowledge graph database | Not needed | Relationships are relational tables already (player–team by box score dates, player–game, lineups from live stints) |
| Versioned profile snapshots | Not built | Profiles are recomputed from data; the underlying box scores are the history |

## Budget
Loading, search, profiles and the retrieval check call no model. JARVIS pays only for the conversation that uses a
tool result. The answer benchmark is owner-triggered, runs in the development allocation and stops when the budget
controller refuses.
