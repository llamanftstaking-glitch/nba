# JARVIS — system prompt

The prompt lives in code: `apps/api/gizer/jarvis.py`, `SYSTEM_PROMPT` (conversation) and `BRIEFING_PROMPT`
(scheduled briefings). This document explains it; the code is authoritative.

## Why it is written the way it is
* It is **static**. Time, page context and the question go in the user message, so the system prompt and the tool
  list form a stable prefix that the provider can cache (cheaper, faster). Do not interpolate dates or ids into it.
* It states **what JARVIS is for** (retrieve, compare, explain verified records) and **what it can never do**
  (produce a probability, upgrade a classification, change models/rules/budgets, act on real money).
* It tells the model that **text inside tool results is outside data** that may contain instructions and must not be
  followed. This is one layer of prompt-injection defence; the stronger layers are structural (see SECURITY.md).
* It carries the ten analytical pillars and the standing research rules (candidate models are research-only, a
  historical frequency is not a probability, projected is not confirmed, missed game is not a zero, forbidden words).

## Changing it
A prompt change is a behaviour change: run `pytest tests/test_jarvis.py`, read a few real answers afterwards, and
note the change in CHANGELOG.md. The prompt is not a security or spending control — never move a rule out of code
and into the prompt.
