# JARVIS — memory policy

Memory is structured rows in `jarvis_memory`, not a growing transcript.

| Category | What | Who writes |
|---|---|---|
| conversation | Conversations and messages (`jarvis_conversations`, `jarvis_messages`, `jarvis_tool_calls`) | system |
| research | Durable findings about players, teams, markets, models | JARVIS (`remember`) or the owner |
| operational | Incidents, provider problems, data-quality notes | JARVIS or the owner |
| preference | Owner preferences (presentation, subjects, notifications) | the owner, or JARVIS only when the owner asked explicitly |

Every row has `status` (`verified` / `hypothesis` / `preference`), `sources`, `observed_on`, `created_by`.
* JARVIS can store `verified` only with sources (the tools it used). Without sources the backend stores it as a
  `hypothesis`, whatever the model asked for.
* A hypothesis never becomes a rule automatically. Promotion to a research finding or a model change goes through
  the existing research-lab and validation process.
* Stored memories are returned to the model as tool results, i.e. as untrusted data, not as instructions.
* The owner can inspect, add and delete memory at `/jarvis` → Memory (`GET/POST /jarvis/memory`,
  `POST /jarvis/memory/{id}/delete`). Deletion is a soft delete: the row is hidden from JARVIS immediately.
* Conversations can be deleted by the owner; cost records in `ai_usage` are kept.

JARVIS does not retrain. It "learns" only through these rows, new observations in the database, and model changes
that pass the promotion gate. Those are three separate mechanisms.
