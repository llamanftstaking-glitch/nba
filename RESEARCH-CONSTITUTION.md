# GIZER NBA — Permanent Research Constitution

These rules are non-negotiable. No agent, model, LLM, prompt or external text can override them.
Changing this file requires an explicit owner decision recorded in `docs/DECISIONS.md`.
Each rule lists where it is **enforced in code or tests** — a rule that exists only as prose is a defect.

| # | Rule | Enforcement |
|---|---|---|
| 01 | Evidence before opinion. | Selections are produced only by `research.guard` from model output + data checks; no free-text path creates a selection. |
| 02 | Accuracy before quantity. | No quotas: `publish_edition` may publish zero selections; `test_edition_without_quotes_abstains`. |
| 03 | No fabricated statistics. | Providers raise `ProviderError`; ingestion never substitutes data; `test_provider_outage_*`, `test_invalid_source_data_*`. |
| 04 | No fabricated injuries. | Injury rows are stored verbatim with source + timestamps; unmatched players are flagged, not guessed. |
| 05 | No fabricated odds. | Selections require an `odds_snapshots` row; `Combo.observed_quote` is only ever a real quote (currently always null); reference products are labelled "not a sportsbook quote". |
| 06 | No unsupported probability estimates. | Probabilities come only from registered models; intervals come from out-of-sample calibration bins; thin bins → `insufficient_evidence`. |
| 07 | No guaranteed outcomes. | `assert_no_forbidden_language` on every edition and agent summary; UI smoke test scans for forbidden vocabulary. |
| 08 | Every prediction must be traceable. | Selections carry `odds_snapshot_id`, `prediction_id`, `model_version_id`; predictions carry the feature snapshot and data cutoff. |
| 09 | Every model must be validated. | `guard` rejects any market family without a production model that passed the walk-forward gate. |
| 10 | Every rejection must be explainable. | `rejection_reasons` is asserted non-empty for every non-qualified selection. |
| 11 | A no-opportunity result is acceptable. | Empty tiers are first-class in API and UI; high-confidence is empty until forward evidence exists. |
| 12 | Preserve all failed predictions. | Append-only tables with database triggers (`db.IMMUTABLE_TABLES`). |
| 13 | Never alter historical predictions after settlement. | Same triggers; corrections are superseding rows (`paper_settlements.supersedes_id`). |
| 14 | Prevent future information from entering historical tests. | Shift-by-one feature construction; leakage tests; weekly auditor leakage check (Agent 18). |
| 15 | Correlation must be considered for joint outcomes. | All combinations are evaluated by the copula simulation; same-game legs without a correlation estimate are flagged unreliable. |
| 16 | Uncertainty must be visible. | Every probability has an interval or is not qualified; API and UI always show both. |
| 17 | Data freshness must be enforced. | `guard` hard-rejects on stale injuries, stale box scores, stale quotes. |
| 18 | Risk and quality controls cannot be overridden by an LLM. | The risk policy is a code constant (`research.RISK_POLICY`); there is no runtime path to change it; no LLM is in the decision path. |
| 19 | No production model self-promotion. | `modeling.promote_model` raises unless the promoter is the auditor and differs from the author. |
| 20 | No uncontrolled API spending. | `OddsApiProvider.check_quota` hard cap; every provider call is logged; no paid provider is enabled by default. |
| 21 | No real-money execution. | No such code exists; `test_no_real_money_surface` pins the complete list of mutating endpoints. |
| 22 | No unauthorized infrastructure changes. | The application has no infrastructure credentials; deployment is a documented manual procedure. |
| 23 | Every research finding requires documented evidence. | `research_findings` requires supporting evidence and sample size; findings open only above a minimum sample. |
| 24 | Do not mistake short-term success for a durable advantage. | Results always show sample sizes and confidence intervals; forensic reports never infer skill from one outcome. |
| 25 | Every improvement must be measurable, reproducible and reversible. | Champion/challenger via the registry; retired models are kept for rollback; evaluations are stored pass or fail. |

Vocabulary: the owner's informal "lock" maps to the classification **high-confidence research candidate**.
The words guaranteed, free money, risk-free, cannot lose, sure thing never appear in product output.
