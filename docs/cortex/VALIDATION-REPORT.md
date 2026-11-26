# CORTEX — validation report (2026-11-26)

| Area | Status | Evidence |
|---|---|---|
| Library validation and loading (bad records rejected, versions, idempotent, removals) | TESTED | `tests/test_cortex.py` |
| Shipped knowledge and benchmark files are valid | TESTED on every build | same (`test_shipped_library_files_are_valid_and_follow_the_rules`) |
| Retrieval (ranking, filters, question-style queries, nonsense, hostile text, logging) | TESTED | same |
| Player and team profiles reproducible from box scores, rules shown, unavailable blocks stated | TESTED; VERIFIED locally on real data | same; development database |
| Deterministic grading; retrieval check costs nothing; answer run refused without a key or when paused | TESTED | same |
| API routes and JARVIS tools, owner-only evaluations | TESTED | same |
| **Accuracy of the knowledge text** | **NOT VERIFIED except where a record says "checked_against_source"**. Records are original text written by a model; the count checked against an opened source is shown in the Knowledge Center | BASKETBALL-CURRICULUM.md |
| **Benchmark answer keys** | **NOT REVIEWED by a person** (0 of the questions). Numeric keys were re-computed by script; that catches arithmetic slips, not a wrong formula | BENCHMARKS.md |
| JARVIS's score on the benchmark | NOT RUN (paid; owner-triggered: `gizer cortex-benchmark`) | |
| Retrieval hit rate on the full library (260 records) | **MEASURED 2026-11-26: 68.8% of 64 questions had an expected record in the top five** (development database). Only 64 of the 204 benchmark questions name a record that exists; the other 140 name proposed slugs that were never reconciled with the library and are skipped. Weakest: calculation questions full of numbers, and paraphrase | `gizer cortex-eval` |
| Knowledge library content | 260 records, 14 sources; 63 checked against an opened source (mostly rules and statistics), 197 authored and not checked (all offensive and defensive tactics, coaching, scouting). "Checked" means agreement with an automated reading of the page, not a human review | BASKETBALL-CURRICULUM.md |
| Professional-level basketball accuracy | NOT CLAIMED. Nothing here supports that claim yet | |
| Semantic search, possession reconstruction, coach identities, film study | NOT BUILT | ARCHITECTURE.md |
