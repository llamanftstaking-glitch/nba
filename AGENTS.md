# Agents

The research department is 18 **deterministic workflows** defined in `apps/api/gizer/jobs.py` (`AGENTS`).
Each has a trigger, a validated output shape (`AgentOutput` + required data keys) and a failure behaviour;
every run is recorded in `agent_executions` (status, duration, provider calls, output, error) and shown on the
Agent Operations page with its true last-success timestamp. An agent that has never run shows `never_run`.

No agent holds an LLM conversation loop. No LLM is in any decision path today (`llm_enabled=false`); if a
narrative LLM is added later it may only rephrase structured outputs, under a token/spend cap, and the
platform must keep working when it is unavailable. Agents cannot change the risk policy or the constitution,
and Agent 01 cannot override Agent 16.

| # | Agent | Trigger (ET) | Does | Fails → |
|---|---|---|---|---|
| 01 | Chief NBA Intelligence Officer | editions 10:00/12:00/15:00, pregame | publishes the edition briefing | job retries; no edition published |
| 02 | NBA Data Engineer | 04:00, 06:00 | results + box scores, duplicate/plausibility checks | stale data → guard rejects |
| 03 | Player Performance Analyst | 08:00 | form vs long-run averages with sample sizes | recorded; non-blocking |
| 04 | Injury Intelligence Analyst | 08:00, every edition | sourced, timestamped injury snapshot | stale injuries → guard rejects |
| 05 | Lineup, Rotation and Minutes Analyst | 08:00, every edition, pregame | projected vs confirmed lineups, change detection, role changes | lineups stay at last snapshot |
| 06 | Matchup Intelligence Analyst | 08:00 | off/def rating matchups | recorded; non-blocking |
| 07 | Pace and Game Environment Analyst | 08:00 | pace, total, blowout probability | recorded; non-blocking |
| 08 | Schedule and Fatigue Analyst | 08:00 | back-to-backs; measured rest effect with SE | recorded; non-blocking |
| 09 | Historical Research Analyst | 06:00 | coverage, scoring environment by season | recorded |
| 10 | Market Intelligence Analyst | 08:00, every edition | quote snapshots, observed line moves | no quotes → nothing evaluated |
| 11 | Player Projection Scientist | weekly; each edition | player models (author; cannot promote) | models stay candidate |
| 12 | Team Projection Scientist | weekly; each edition | team model (author; cannot promote) | models stay candidate |
| 13 | Correlation Research Scientist | weekly | residual correlations + joint-frequency validation | same-game flagged unreliable |
| 14 | Simulation Scientist | weekly | re-runs stored simulations from seeds; convergence | finding recorded |
| 15 | Parlay Research Architect | every edition | combination arrays from qualified legs only | abstains with <2 qualified |
| 16 | Independent Risk Officer (GIZER GUARD) | every edition | applies `RISK_POLICY`; sole classifier | edition fails closed |
| 17 | Postgame Forensic Analyst | 04:00; weekly | settlement, forecast errors, forensic reports | tickets stay unresolved |
| 18 | Chief Model Auditor | weekly | leakage check, promotion gate, self-promotion audit | no promotions |

Combination engines (GIZER SINGLE, DOUBLE, TRIPLE, QUAD, FIVE, SIX, SGP, CROSS) are views over one
quantitative engine (`research.build_combos` + `simulation`), each with its own records and performance
statistics in the ledger (`paper_tickets.engine` / `.structure`). GIZER GUARD is Agent 16.

For AI coding agents working in this repository: follow `CLAUDE.md`.
