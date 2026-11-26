# JARVIS — security

## The key
`ANTHROPIC_API_KEY` lives only in the server's `.env` (never committed; `.env.example` holds a placeholder). The SDK
reads it from the environment. It is never stored in the database, returned by an endpoint, written to a log,
sent to the browser, or reachable from a tool. Use a dedicated key in an isolated Anthropic workspace.

## Who can use it
All routes require a session. Starting a conversation, sending a message, editing memory, running a briefing and
anything under `/admin/ai-budget` require the `owner` role and the CSRF token. Conversations are private to the
account that created them.

## What the assistant can do
Only the tools in `jarvis_tools.py` (see TOOL-REGISTRY.md). Structural limits, enforced in code and tests:
* No SQL, shell, file, HTTP, settings, credential, model-promotion, risk-policy, budget or trading tool exists.
* A tool name that is not registered is rejected and nothing runs. Arguments are validated; extra fields are rejected.
* The only writes: its own memory, and queuing one of two fixed read-only refresh jobs (rate-limited by dedupe key).
* It cannot change a research classification: selections, combinations and editions are append-only tables.
* It cannot spend past the budget: reservations are checked in the backend before each request.
* Recursion is bounded: at most 6 tool rounds per turn, and tools never call a model.

## Prompt injection
Injury notes, market titles, provider payloads and stored memories reach the model only as tool results. The
system prompt tells the model to treat them as data. That instruction can fail, so nothing depends on it: even a
fully hijacked model can only call the same read-only tools, write a memory row (stored as a hypothesis unless
sourced), or request a refresh job. It cannot exfiltrate: there is no outbound tool, and answers go only to the owner.

## Never
Real-money execution, sportsbook or exchange credentials, account funding, order placement. The Kalshi adapter
remains read-only public data.
