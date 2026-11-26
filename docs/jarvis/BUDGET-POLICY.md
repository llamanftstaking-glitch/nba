# JARVIS — budget policy

**Authorisation (owner, 2026-11-26, D-024):** USD 100, cumulative lifetime — not monthly. No automatic reload, no
additional credit purchase, no use of the remaining account balance.

## Enforcement (code, `apps/api/gizer/ai_budget.py`)
Every paid request is `reserve()`d before it is sent. The reservation is the most the request can cost: estimated
input tokens (about 2.5 bytes per token, deliberately high) priced at the most expensive input rate, plus the full
`max_tokens` at the output rate. It is taken under a row lock, so concurrent workers cannot overshoot together.

| Limit | Default | Where |
|---|---|---|
| Lifetime cap | $100 (can be lowered, never raised above `GIZER_JARVIS_LIFETIME_CAP_USD`) | policy |
| Ordinary requests stop | $95 (the last $5 need "release safety buffer") | policy |
| Daily ceiling (US Eastern day) | $2 | policy |
| Allocations | Sonnet $55, Haiku $15, Opus $20, development/testing $10 | policy |
| Per request | Sonnet $0.40, Haiku $0.05, Opus $1.00, dev $0.25 | policy |
| Tool rounds per turn | 6 | `GIZER_JARVIS_MAX_TOOL_ROUNDS` |
| Owner questions | 20 per minute | route limiter |

Outcomes: `settled` (cost from the usage the response reported), `released` (rejected before it could be billed),
`assumed` (outcome unknown — counted at the full reservation; also applied to reservations older than 15 minutes).
Retries are separate reservations. Checkpoint events fire once each at $25, $50, $75, $90, $95.

When a limit is hit the request is refused before any provider call. Data collection, models, editions and
deterministic briefings carry on.

## Prices used (USD per million tokens, Anthropic first-party, recorded 2026-11-03)
| Model | Input | Output | Cache read | Cache write |
|---|---|---|---|---|
| claude-sonnet-5-5 | 2.00 | 10.00 | 0.10 | 2.50 |
| claude-haiku-5-5 (≤100K input) | 0.10 | 0.50 | 0.01 | 0.125 |
| claude-haiku-5-5 (>100K input) | 0.50 | 2.50 | 0.05 | 0.625 |
| claude-opus-5-5 | 4.00 | 20.00 | 0.20 | 5.00 |

A model without a row here is refused (`unknown_price`). If Anthropic changes prices, update `PRICES` and this table
together. The Haiku cache rates are derived from the standard multipliers and should be checked against the pricing page.

## Known limit of the accounting
Costs are computed locally from reported token usage. They are **not reconciled against Anthropic's billing
report**, which needs an Admin API key this deployment does not hold. Compare `/admin/ai-budget` with the Anthropic
Console from time to time; the Console is the source of truth for what was charged. Setting a workspace spend limit
of $100 in the Console is a second, independent stop and is recommended.
