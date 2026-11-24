# Decision history (append-only)

Add new entries at the bottom. Never edit or remove an entry; supersede it with a new one.

| # | Date | Decision | Why | Status |
|---|---|---|---|---|
| D-001 | 2026-11-24 | Modular monolith: one Python package + Next.js app + PostgreSQL, Docker Compose. | Single server, small team, reliability over distribution. | Active |
| D-002 | 2026-11-24 | PostgreSQL-backed durable job queue; Celery and Redis are not deployed. | Removes two stateful components; SKIP LOCKED + dedupe keys give the required durability, retries, dead-letter and recovery. | Active |
| D-003 | 2026-11-24 | No LLM in any decision path; deterministic narratives; no LLM provider configured. | Reliability, cost control, RULE 06/18. An optional narrator can be added later behind a spend cap. | Active |
| D-004 | 2026-11-24 | Data: PBP Stats API for results/box scores; ESPN public API for schedule, game odds and injuries. | Only sources reachable and parseable from the build environment; NBA.com endpoints blocked there. Licensing caveats in DATA-SOURCES.md. | Active — revisit from Server M |
| D-005 | 2026-11-24 | Player-prop research stays unavailable until the owner approves and supplies an odds API key. | No fabricated odds (RULE 05); no unapproved spend (RULE 20). | Active |
| D-006 | 2026-11-24 | High-confidence tier requires ≥200 settled forward paper records per market group with calibration within 4 points. | No historical odds exist, so backtests cannot validate against the market; only forward evidence can. | Active |
| D-007 | 2026-11-24 | Differences vs the market larger than 10 points are rejected as model/data error. | Two audited comparable projects reported no out-of-sample edge against market prices; large disagreements are far more likely to be our error. | Active |
| D-008 | 2026-11-24 | Third-party repositories: nothing vendored. Ideas only (see docs/research/REPOSITORY-AUDIT.md); `nba_api` approved as a future dependency once stats.nba.com is reachable from Server M. | Most candidates are unlicensed or show leakage/unsupported claims. | Active |
| D-009 | 2026-11-24 | Phase 2 (parlay-first command center) merged into the initial build. | The repository was empty when Phase 2 arrived; there was no earlier frontend to redesign. | Active |
| D-010 | 2026-11-24 | Model registry in PostgreSQL instead of MLflow; scikit-learn gradient boosting as the tree challenger instead of LightGBM/XGBoost. | Models are small parameter sets; fewer services and native dependencies. | Active |
| D-011 | 2026-11-24 | Auto paper tickets: every newly qualified selection + top 3 qualified combinations per engine/structure, fixed 1 unit. | Forward validation needs an unbiased, owner-independent record. | Active |
| D-012 | 2026-11-24 | Lineups: `confirmed` only from a box score; pre-tipoff lineups are a labelled GIZER projection from the last confirmed five and the injury report. | No free, authorized pre-tipoff lineup feed exists; an honest projection is more useful than "unknown". | Active |
| D-013 | 2026-11-24 | Manual markets: owner-entered prices can reach `standard` at most and are never auto-ticketed; hypothetical thresholds never qualify. | Owner-entered prices are not independently verified; the forward record must stay unbiased. | Active |
| D-014 | 2026-11-24 | Seven base and four combination player stats each get their own model family and gate. Points, blocks and the four combinations failed on full data and stay candidates. | Per-family validation; the gate is not relaxed to fill the props page. | Active |
| D-015 | 2026-11-24 | Research completeness counts a starting lineup only when confirmed; projected lineups do not raise the percentage. | Completeness must reflect real inputs. | Active |
| D-016 | 2026-11-24 | API keys are configured only in the server `.env`; the application has no key-entry form. | Avoids storing secrets in the database and a new attack surface; the provider page shows presence only. | Active |
