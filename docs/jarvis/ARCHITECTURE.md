# JARVIS — architecture

JARVIS (Joint Analytics, Research, Verification & Intelligence System) is the assistant layer of GIZER NBA. It is
part of the existing application, not a second one: same API process, same PostgreSQL database, same worker and
scheduler, same authentication.

```
Owner (browser, /jarvis or the side panel)
   │  POST /api/v1/jarvis/conversations/{id}/messages   (server-sent events back)
   ▼
gizer/api_jarvis.py      routes, owner-only, CSRF, rate limit
   ▼
gizer/jarvis.py          routing → budget reservation → Claude Messages API (streaming) → tool loop → persistence
   │        ▲
   │        └── gizer/ai_budget.py   reserve / settle / release / assume, limits, checkpoints   (ai_usage, ai_budget_policy)
   ▼
gizer/jarvis_tools.py    40 typed, bounded tools = the assistant's entire capability
   ▼
existing services        the same functions that serve the dashboard (api.py, api_v3.py, api_core.py, history, minutes,
                         lineups, kalshi, ledger, jobs)
   ▼
PostgreSQL               verified records; append-only research tables are untouched by JARVIS
```

## Decisions
* **Messages API with a loop we host**, not a hosted agent runtime: every model request must pass the budget
  controller first, and tools must run inside our process against our database. (D-024)
* **Models**: Sonnet `claude-sonnet-5-5` for conversation, Opus `claude-opus-5-5` only when the owner switches on
  "deep review", Haiku `claude-haiku-5-5` for wording scheduled briefings. Ids are checked against the provider's
  live model list before first use; an id that is not listed is refused, never guessed.
* **No SDK-level retries** (`max_retries=0`). A retry is a new reservation, so retry cost is always accounted.
* **No server-side refusal fallback**: a fallback would bill at another model's price outside the reservation.
  A refusal is shown as a refusal.
* **No Redis**: the platform's queue, scheduler and event dedupe are PostgreSQL (unique keys, `SKIP LOCKED`), as before.
* **Deterministic first**: slash commands, events, briefing facts and budget accounting use no model.

## Request lifecycle
1. `route()` picks deterministic / standard / deep by fixed rules and records the reason.
2. Page context ids are validated against the database (`resolve_context`); unknown ids are dropped.
3. History is loaded as stored content blocks and replayed unchanged (append-only).
4. For each model request: estimate tokens high → `reserve()` under a row lock → stream → `settle()` with reported usage.
5. `tool_use` blocks are validated (pydantic, extra fields forbidden) and executed; results are size-bounded JSON.
6. At most `GIZER_JARVIS_MAX_TOOL_ROUNDS` (6) tool rounds per turn; then the model must answer.
7. The whole turn is persisted at the end. A failed turn leaves the question plus a short "(no answer was produced…)" note.

## Availability states
`ready`, `provider_unavailable`, `budget_limited`, `paused` come from `GET /jarvis/state` with no inference involved.
`processing` exists only while a stream is open. Nothing claims the assistant is "thinking" otherwise.

## Tables (migration 0004)
`jarvis_conversations`, `jarvis_messages`, `jarvis_tool_calls`, `jarvis_memory`, `jarvis_briefings`, `jarvis_events`,
`ai_usage` (requests, reservations, costs, routing decisions), `ai_budget_policy`. Existing tables cover the rest of
the specification: research findings (`research_findings`), assistant tasks (`jobs`), audit records (`audit_log`).
