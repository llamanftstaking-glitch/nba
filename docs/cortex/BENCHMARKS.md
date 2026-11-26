# CORTEX basketball-intelligence benchmark

Status: **IMPLEMENTED, NOT VERIFIED.** Tranche 1 holds 204 questions toward a planned 500. Every answer key was
written by a model and **no item has been reviewed by a person** (`reviewed: false` on all 204). Until the owner
reviews an item, a score on it measures agreement with a model-written key, not correctness.

File: `apps/api/gizer/cortex_data/benchmark.json` (schema in `CONTENT-SCHEMA.md`, section "Benchmark questions").

## What it is for
A fixed set of questions to check whether JARVIS reasons like a careful basketball analyst inside this platform's
rules: it knows stable rules and concepts, computes standard statistics correctly from stated inputs, reads data
without over-reading small samples, handles market-contract mechanics, and **declines** when the honest answer is
"not available", "needs a tool" or "that is not something I can do".

It is not a test of current NBA knowledge. No question depends on a real player, team, season record or league
average. Questions that mention "Player A" are placeholders.

## Composition (tranche 1)

| Category | Id prefix | Total | Multiple choice | Numeric | Abstain | Short answer | Dev | Held out |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| basketball_rules | RULE | 12 | 8 | 1 | 2 | 1 | 7 | 5 |
| offensive_tactics | OFF | 12 | 7 | 1 | 2 | 2 | 7 | 5 |
| defensive_tactics | DEF | 12 | 7 | 1 | 2 | 2 | 7 | 5 |
| coaching | COACH | 12 | 6 | 1 | 3 | 2 | 7 | 5 |
| player_roles | ROLE | 12 | 6 | 1 | 3 | 2 | 7 | 5 |
| advanced_statistics | STAT | 24 | 9 | 10 | 2 | 3 | 14 | 10 |
| lineup_analysis | LINEUP | 12 | 5 | 2 | 3 | 2 | 7 | 5 |
| historical_basketball | HIST | 12 | 7 | 1 | 2 | 2 | 7 | 5 |
| data_interpretation | DATA | 24 | 10 | 4 | 5 | 5 | 14 | 10 |
| probability | PROB | 24 | 8 | 10 | 3 | 3 | 14 | 10 |
| market_contracts | MKT | 24 | 10 | 6 | 5 | 3 | 14 | 10 |
| research_integrity | INTEG | 24 | 10 | 2 | 8 | 4 | 14 | 10 |
| **Total** | | **204** | **93 (45.6%)** | **40 (19.6%)** | **40 (19.6%)** | **31 (15.2%)** | **119 (58.3%)** | **85 (41.7%)** |

Held-out counts by type: multiple choice 37 of 93, numeric 18 of 40, abstain 17 of 40, short answer 13 of 31.

## Dev and held-out split
* `dev` (119): may be read while changing prompts, concept records or tools.
* `held_out` (85): run only to report a score. Do not read individual failures while tuning; if a held-out item is
  inspected to fix something, move it to `dev` in a recorded change and say so.
* The split was assigned mechanically inside each category, rotating through the question types, so every category
  and type is represented on both sides.
* **What the split does and does not protect against.** It limits tuning to the dev items. It is not independent
  review: both halves were written by the same model in the same session, so a mistake of understanding in a key is
  as likely in held-out as in dev, and the held-out items share style and topics with dev.

## How each type is graded
All matching is case-insensitive on the reply text.

* **`multiple_choice`** — exactly four choices labelled `A`, `B`, `C`, `D`; `answer` is the letter. The grader asks
  for a single letter and compares it. A reply that names two letters, or none, is wrong.
* **`numeric`** — `answer` is a number in the unit the question states (a percentage is given as `68.0`, not `0.68`).
  Correct when `|reply - answer| <= tolerance`. A tolerance of `0` means the exact whole number. Every numeric
  question states all of its inputs and its formula; none needs a tool.
* **`abstain`** — `answer` is the string `"abstain"`. The reply passes when it contains **none** of the
  `must_not_claim` phrases and **at least one** of the `must_mention` phrases. The `must_mention` list holds
  alternative wordings of the same acceptable move ("not available", "do not have", "cannot"), which is why any one
  is enough.
* **`short_answer`** — `answer` is a model answer for a human reader. The reply passes when it contains **every**
  `must_mention` phrase and **none** of the `must_not_claim` phrases. Some phrases are stems on purpose
  (`descripti`, `nois`, `frequenc`) so that "descriptive" and "description" both match.

`expected_tools` and `expected_concepts` are not graded in this tranche. `expected_tools` names tools the assistant
would reasonably call; all names exist in `jarvis_tools.TOOLS` except `get_basketball_concept`, which is taken from
the schema example and must exist before tool use is scored. `expected_concepts` are proposed slugs; they have not
been matched against concept records, because none existed when the questions were written.

## Limits (read before quoting a score)
1. **Keys are model-written and unreviewed.** `reviewed` is `false` on every item. Report scores as "against
   unreviewed keys" until that changes.
2. **Numeric keys were re-computed, not reviewed.** A validator re-evaluated all 40 numeric answers from explicit
   expressions kept outside the JSON, checked that each expression's inputs appear in the question, and checked that
   the hand-written working in `rationale` shows the same figure. That catches arithmetic slips. It does not catch a
   question that states the wrong formula.
3. **Keyword grading is coarse.** A substring match cannot see negation: a correct refusal that quotes the phrase it
   is refusing ("I will not say he will take over") can fail, and a wrong answer that avoids the listed phrases can
   pass. A fabricated number in an abstain reply is not detectable by keyword. Treat keyword results as a screen and
   read failures, and a sample of passes, by hand. A model-graded check would need an owner decision and the AI
   budget; none is used here.
4. **Rules and history items are from the author's knowledge, not from an opened source.** Rules questions were
   limited to long-standing NBA rules and say "under NBA rules", but rules change; re-check them each season.
5. **Platform-specific items encode current project rules** (CLAUDE.md, the JARVIS system prompt, the data list in
   `CONTENT-SCHEMA.md`). If a rule or the available data changes, the item must be corrected by replacing it, and
   the change recorded.
6. **Fees in break-even questions are stated assumptions** for arithmetic. No real exchange fee is asserted.
7. **Coverage is uneven.** Seven categories have 12 items; a single item moves such a category's score by about
   8 points. Do not read small differences.
8. **Forbidden vocabulary** appears in one question (INTEG-014) only, because that item tests refusal of it. It
   appears in no key, choice, rationale or keyword list.

## How the owner reviews and marks items
1. Open `apps/api/gizer/cortex_data/benchmark.json` and pick a batch (suggested order: numeric, then rules and
   history, then abstain keyword lists, then the rest).
2. For each item check: the question is unambiguous; the key is right (for numeric, redo the calculation; for rules,
   check the current rulebook); for multiple choice, no distractor is also defensible; for keyword items, a good
   answer would pass and a bad one would fail.
3. If the item is right, set `"reviewed": true`. Change nothing else.
4. If the item is wrong or unclear, fix or delete it and keep `"reviewed": false` until the corrected version has
   been checked. Do not reuse the id of a deleted item.
5. Record the batch in `CHANGELOG.md` (ids reviewed, ids changed, who reviewed). Only a person sets
   `reviewed: true`; a model must never set it.
6. Report scores in two lines: all items, and reviewed items only.

## Validation of the file
The tranche was checked by a script for: valid JSON; exact key set and order; unique ids and question texts; id
prefix matching category; allowed categories, types and splits; four labelled choices and an `A`-`D` answer for
multiple choice; numeric answers with a tolerance, re-computed from explicit expressions; `abstain` answers equal to
`"abstain"` with both keyword lists present; short-answer model answers satisfying their own keyword lists;
lowercase keyword phrases; tool names; forbidden vocabulary; type shares within 3 points of 45/20/20/15; held-out
share within 3 points of 40% overall and between 30% and 50% in every category and type; minimum counts per
category. Result on 2026-11-26: 204 questions, 0 errors. The script is not yet part of the repository's tests.
