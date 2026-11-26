# JARVIS — validation report (2026-11-26)

Status words as defined in CLAUDE.md.

| Area | Status | Evidence |
|---|---|---|
| Budget controller: reservation maths, settle to reported usage, lifetime/buffer/daily/allocation/per-request limits, pause, unknown price | TESTED | `tests/test_jarvis.py` |
| Concurrent reservations cannot exceed the cap (24 threads) | TESTED | same |
| Unknown outcomes counted in full; stale reservations expire; checkpoints fire once | TESTED | same |
| Tool registry: typed, bounded, no dangerous capability, unknown tool rejected, invalid/extra arguments rejected | TESTED | same |
| All 39 tools against real stored data (9-game slate, ~5,800 contracts) | VERIFIED locally | run on the development database |
| Conversation loop: streaming events, tool execution, history replay, persistence across sessions, source attribution | TESTED (scripted provider) | same |
| Deep mode uses the Opus allocation; tool rounds bounded; history stays valid | TESTED (scripted provider) | same |
| No key → no spend; slash commands without a model | TESTED | same |
| Budget exhaustion blocks answers, not data work | TESTED | same |
| Retry = second reservation; provider failure leaves no pending money | TESTED (scripted provider) | same |
| Briefings: deterministic facts, Haiku wording within budget, forbidden wording discarded, unchanged facts skipped | TESTED (scripted provider) | same |
| Event dedupe; memory sourcing, inspection, deletion | TESTED | same |
| Owner-only, CSRF, conversation privacy | TESTED | same |
| Migration 0004 up / down / up on a real-data copy | VERIFIED locally | alembic |
| Interface: page, side panel, budget page, viewer 403, mobile (2,315 smoke checks) | TESTED against the mock API | `apps/web/e2e/smoke.mjs` |
| Streaming end to end: browser → web proxy → API → tool calls → text (scripted slow provider, real data) | VERIFIED locally | events arrived incrementally over 5.8 s; tool steps before text |
| Mid-stream disconnect handling; very long conversations | NOT VERIFIED | |
| **Real Claude API: authentication, model ids, streaming, tool calls, reported usage vs our cost maths** | **NOT VERIFIED** | No API key exists in the build environment. Run `gizer jarvis-verify --ping` on Server M after adding the key, then ask one question and compare `/admin/ai-budget` with the Anthropic Console. |
| Prompt-injection resistance of the model itself | NOT VERIFIED | Only the structural limits are tested. |
| Server restart recovery of JARVIS data | NOT VERIFIED on Server M | Data is in PostgreSQL like everything else. |
| Voice | NOT IMPLEMENTED | Phase two by design; needs owner approval. |

A scripted provider proves our handling of the documented response shapes. It does not prove live behaviour.
