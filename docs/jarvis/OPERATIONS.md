# JARVIS — operations

## Turning it on (Server M)
1. In the Anthropic Console create a workspace for GIZER NBA, set its spend limit to $100, and create an API key in it.
2. On the server, add the key to `/opt/gizer-nba/.env` as `ANTHROPIC_API_KEY=...` (edit the file there; do not paste
   the key into chat, tickets or commits).
3. `cd /opt/gizer-nba && docker compose up -d` to restart the containers with the new environment.
4. Verify: `docker compose exec -T api gizer jarvis-verify` (free: checks the key and that the three model ids exist).
   `docker compose exec -T api gizer jarvis-verify --ping` also sends one tiny paid request (well under one cent,
   development allocation) and prints its cost.

Without a key JARVIS reports "provider unavailable"; slash commands, events and deterministic briefings still work.

## Schedule (US Eastern, existing scheduler/worker — independent of Claude Code)
06:00 overnight report · 09:00 morning briefing · 13:00 midday update · pregame briefing at most hourly when a
pregame checkpoint is due and something material changed. A briefing is skipped when its facts are unchanged.
Facts are always deterministic; Haiku only words them, and only if the budget allows.

## Controls (`/admin/ai-budget`)
Emergency AI pause · proactive briefings on/off · daily ceiling · allocations · per-request caps · lifetime cap
(downward) · release safety buffer. Environment switch: `GIZER_JARVIS_ENABLED=false`.

## Troubleshooting
| Symptom | Check |
|---|---|
| "Provider unavailable" | key present in the container? `gizer jarvis-verify`; Anthropic status |
| "Budget limited" | `/admin/ai-budget`: daily ceiling (resets at midnight ET), allocation, lifetime line |
| Answer stops with "tool steps" note | normal bound (6 rounds); ask again to continue |
| Costs look high | `/admin/ai-budget` → recent requests; long conversations cost more per turn — start a new one |
| Stuck "reserved" rows | they become `assumed` after 15 minutes automatically |

## Restart behaviour
Conversations, memory, events, briefings and the ledger are in PostgreSQL and survive restarts. A request in flight
during a restart is lost; its reservation is counted as spent after 15 minutes.
